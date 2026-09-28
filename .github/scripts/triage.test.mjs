// Tests de la logica de triaje. Ejecutar con:
//   node --test .github/scripts/
//
// No tocan la red: todo es funcion pura salvo donde se injecta `fileLines`.

import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import path from "node:path"

import {
  MARKER_START,
  MARKER_END,
  LABELS,
  TIPO_IDS,
  AREA_IDS,
  composeBody,
  splitGenerated,
  readAppliedLabels,
  sanitizeAiText,
  validateRefs,
  parseAiTriaje,
  extractAiText,
  classifyRules,
  collectFileRefs,
  findDuplicates,
  renderBlock,
  buildReport,
  renderSummary,
  jaccard,
  tokenize,
  fold,
} from "./triage.mjs"

const REAL_LINES = new Map(
  ["game.js", "skins.js", "index.html", "README.md", "favicon.svg"].map((name) => {
    const full = path.resolve(import.meta.dirname, "..", "..", name)
    return [name, fs.readFileSync(full, "utf8").split("\n").length]
  }),
)

// ---------------------------------------------------------------------------
// La garantia central: el texto de la persona no se toca
// ---------------------------------------------------------------------------

test("primera pasada: el texto original queda byte a byte", () => {
  const original = "El juego se congela\n\n  con muchos asteroides  \n\n- punto 1\n- punto 2\n"
  const { prefix, suffix, rerun } = splitGenerated(original)
  assert.equal(prefix, original, "no debe recortar ni normalizar nada")
  assert.equal(suffix, "")
  assert.equal(rerun, false)
})

test("composeBody deja el original intacto y solo agrega al final", () => {
  const original = "hola  \n\nmundo"
  const body = composeBody(original, "BLOQUE")
  assert.ok(body.startsWith(original), "el original va primero, sin cambios")
  assert.ok(body.endsWith("BLOQUE"))
  assert.ok(body.includes("hola  \n\nmundo\n\n---\n\nBLOQUE"))
})

test("re-ejecutar no duplica el bloque", () => {
  const block = `${MARKER_START}\n<!-- triage:labels tipo:bug -->\nhola\n${MARKER_END}`
  const first = composeBody("texto humano", block)
  const second = composeBody(first, block)
  assert.equal(first, second, "el resultado debe ser identico")
  assert.equal(second.split(MARKER_START).length - 1, 1, "un solo marcador")
})

test("re-ejecutar con labels nuevas reemplaza el bloque viejo", () => {
  const viejo = `${MARKER_START}\n<!-- triage:labels tipo:bug -->\nviejo\n${MARKER_END}`
  const nuevo = `${MARKER_START}\n<!-- triage:labels tipo:feature -->\nnuevo\n${MARKER_END}`
  const body = composeBody(composeBody("texto humano", viejo), nuevo)
  assert.ok(body.startsWith("texto humano\n\n---\n\n"))
  assert.ok(!body.includes("viejo"))
  assert.ok(body.includes("nuevo"))
  assert.equal(body.split(MARKER_START).length - 1, 1)
})

test("texto humano despues del marcador se conserva (caso patologico)", () => {
  const previo = `mio\n\n---\n\n${MARKER_START}\nbase\n${MARKER_END}\n\nnota del humano`
  const body = composeBody(previo, `${MARKER_START}\nnuevo\n${MARKER_END}`)
  assert.ok(body.startsWith("mio"), "el prefijo se mantiene")
  assert.ok(body.includes("nuevo"), "el bloque se regenera")
  assert.ok(body.trimEnd().endsWith("nota del humano"), "la nota de abajo sobrevive")
})

test("cuerpo vacio no rompe nada", () => {
  const body = composeBody("", `${MARKER_START}\nbloque\n${MARKER_END}`)
  assert.ok(body.includes("sin descripcion"))
  assert.ok(body.includes("bloque"))
})

test("cuerpo null/undefined se maneja", () => {
  assert.doesNotThrow(() => composeBody(null, "B"))
  assert.doesNotThrow(() => composeBody(undefined, "B"))
})

test("readAppliedLabels lee el manifiesto de labels del bloque", () => {
  const body = `texto\n\n${MARKER_START}\n<!-- triage:labels tipo:bug,P1-alta -->\n${MARKER_END}`
  assert.deepEqual(readAppliedLabels(body), ["tipo:bug", "P1-alta"])
  assert.deepEqual(readAppliedLabels("sin bloque"), [])
})

// Regresion: apply() debe leer el manifiesto del cuerpo que devuelve la API,
// no del artefacto issue.json, que es la copia de collect anterior al PATCH.
// Si usara el artefacto, nunca encontraria nada que limpiar.
test("el manifiesto se lee del cuerpo actual, no del artefacto viejo", () => {
  const cuerpoEnGitHub = `texto\n\n${MARKER_START}\n<!-- triage:labels tipo:bug,P1-alta -->\n${MARKER_END}`
  const artefactoViejo = "texto sin bloque" // lo que guardo collect
  assert.deepEqual(readAppliedLabels(cuerpoEnGitHub), ["tipo:bug", "P1-alta"])
  assert.deepEqual(readAppliedLabels(artefactoViejo), [], "el artefacto viejo no tiene manifiesto")
})

// ---------------------------------------------------------------------------
// Salida de la IA: se trata como entrada no confiable
// ---------------------------------------------------------------------------

test("sanitizeAiText quita menciones @ para no notificar a nadie", () => {
  assert.equal(sanitizeAiText("revisalo @IngOscar19 porfa"), "revisalo porfa")
  assert.equal(sanitizeAiText("hola @IngOscar19 revisa"), "hola revisa")
  assert.equal(sanitizeAiText("@sinNada"), "", "la mencion se va entera, no queda residuo")
})

test("sanitizeAiText quita HTML, incluido el contenido de script", () => {
  assert.equal(sanitizeAiText("<b>hola</b>"), "hola")
  assert.equal(sanitizeAiText("<script>alert(1)</script>hola"), "hola")
  assert.equal(sanitizeAiText("<!-- comentario -->visible"), "visible")
  assert.equal(sanitizeAiText("linea 1\n\nlinea 2"), "linea 1 linea 2")
})

test("sanitizeAiText recorta a la longitud maxima", () => {
  assert.equal(sanitizeAiText("a".repeat(1000), 50).length, 50)
})

test("sanitizeAiText sobrevive a valores raros", () => {
  for (const value of [undefined, null, 0, {}, []]) {
    assert.equal(typeof sanitizeAiText(value), "string")
  }
})

test("validateRefs acepta lineas reales y rechaza las inventadas", () => {
  assert.deepEqual(validateRefs("game.js:97,game.js:97", REAL_LINES), [{ file: "game.js", line: 97 }])
  assert.deepEqual(validateRefs("game.js:999999", REAL_LINES), [], "linea fuera de rango")
  assert.deepEqual(validateRefs("hack.js:1", REAL_LINES), [], "archivo no permitido")
  assert.deepEqual(validateRefs("game.js:0", REAL_LINES), [], "linea 0")
  assert.deepEqual(validateRefs("game.js:abc", REAL_LINES), [])
  assert.deepEqual(validateRefs("../../../etc/passwd", REAL_LINES), [], "no se acepta path traversal")
})

test("validateRefs no acepta un archivo que no existe en el repo", () => {
  const lines = new Map([["game.js", 100]])
  assert.deepEqual(validateRefs("skins.js:3", lines), [])
  assert.deepEqual(validateRefs("game.js:97", lines), [{ file: "game.js", line: 97 }])
})

test("parseAiTriaje acepta un bloque bien formado", () => {
  const raw = `<triaje>
tipo: bug
area: juego,controles
prioridad: P1
resumen: El juego se congela con muchos asteroides en pantalla.
causa: Colisiones O(n2) por frame dentro de update().
refs: game.js:680,skins.js:3
</triaje>`
  const ai = parseAiTriaje(raw, REAL_LINES)
  assert.equal(ai.tipo, "bug")
  assert.deepEqual(ai.areas, ["juego", "controles"])
  assert.equal(ai.prioridad, "P1")
  assert.match(ai.resumen, /congela/)
  assert.deepEqual(ai.refs, [{ file: "game.js", line: 680 }, { file: "skins.js", line: 3 }])
})

test("parseAiTriaje descarta valores fuera de la allowlist", () => {
  const ai = parseAiTriaje(`<triaje>
tipo: intento-de-inyeccion
area: ../secreto,admin
prioridad: P9
resumen: ok
</triaje>`, REAL_LINES)
  assert.equal(ai.tipo, null)
  assert.deepEqual(ai.areas, [])
  assert.equal(ai.prioridad, null)
})

test("parseAiTriaje ignora texto antes y despues del bloque", () => {
  const raw = `charlando antes <triaje>
tipo: bug
resumen: hola
</triaje> y despues tambien`
  const ai = parseAiTriaje(raw, REAL_LINES)
  assert.equal(ai.tipo, "bug")
  assert.equal(ai.resumen, "hola")
})

test("parseAiTriaje devuelve null si no hay nada utilizable", () => {
  assert.equal(parseAiTriaje("", REAL_LINES), null)
  assert.equal(parseAiTriaje(null, REAL_LINES), null)
  assert.equal(parseAiTriaje("nada que ver", REAL_LINES), null)
  assert.equal(parseAiTriaje("<triaje>\ntipo: inventado\n</triaje>", REAL_LINES), null)
})

test("parseAiTriaje toma el primer valor de una clave repetida", () => {
  const ai = parseAiTriaje("<triaje>\ntipo: bug\ntipo: feature\n</triaje>", REAL_LINES)
  assert.equal(ai.tipo, "bug")
})

// ---------------------------------------------------------------------------
// events JSON de `opencode run --format json`
// ---------------------------------------------------------------------------

test("extractAiText toma el ultimo evento de texto", () => {
  const jsonl = [
    JSON.stringify({ type: "step_start", part: {} }),
    JSON.stringify({ type: "text", part: { text: "  respuesta vieja  " } }),
    JSON.stringify({ type: "tool_use", part: {} }),
    JSON.stringify({ type: "text", part: { text: "respuesta final" } }),
  ].join("\n")
  assert.equal(extractAiText(jsonl), "respuesta final")
})

test("extractAiText tolera basura y lineas no-JSON", () => {
  const jsonl = ["basura", "{roto", JSON.stringify({ type: "text", part: { text: "ok" } }), ""].join("\n")
  assert.equal(extractAiText(jsonl), "ok")
  assert.equal(extractAiText(""), "")
  assert.equal(extractAiText(null), "")
})

// ---------------------------------------------------------------------------
// Clasificacion por reglas
// ---------------------------------------------------------------------------

test("fold quita acentos y baja a minusculas", () => {
  assert.equal(fold("Puntuación y VIDA"), "puntuacion y vida")
})

test("clasifica un bug con entorno y pasos como bug P1 sin pedir info", () => {
  const r = classifyRules(
    "Bug: pantalla negra al abrir el juego",
    "No abre, pantalla negra total. Chrome 120 en Windows 11. Pasos: abro index.html y no pasa nada. Adjunto un screenshot. Esperaba ver el menu de inicio.",
  )
  assert.equal(r.tipo, "bug")
  assert.equal(r.prioridad, "P0")
  assert.deepEqual(r.faltantes, [])
  assert.ok(!r.estado.includes("necesita-info"))
})

test("clasifica una sugerencia como feature", () => {
  const r = classifyRules("Sugiero agregar modo duelo", "Estaria genial poder jugar contra la IA.")
  assert.equal(r.tipo, "feature")
})

test("clasifica una duda como pregunta", () => {
  const r = classifyRules("Como se cambian los controles?", "Quiero saber como se dispara")
  assert.equal(r.tipo, "pregunta")
})

test("clasifica un reporte de README como documentacion, sin areas", () => {
  const r = classifyRules("El README esta desactualizado", "La seccion del escudo esta desactualizada.")
  assert.equal(r.tipo, "documentacion")
  assert.deepEqual(r.areas, [], "las areas no aplican a documentacion")
})

test("detecta conjugaciones verbales, no solo la forma literal", () => {
  for (const body of ["se congela", "se congelaron", "se va a congelar", "no funcionaba"]) {
    assert.equal(classifyRules("problema", body).tipo, "bug", `falla con: ${body}`)
  }
})

test("un texto sin senal no inventa un tipo", () => {
  const r = classifyRules("hola", "   ")
  assert.equal(r.tipo, null)
  assert.ok(r.estado.includes("necesita-revision"))
})

test("bug con poca informacion pide informacion", () => {
  const r = classifyRules("falla", "no funciona")
  assert.equal(r.tipo, "bug")
  assert.ok(r.estado.includes("necesita-info"))
})

test("las areas se limitan a dos y respetan la allowlist", () => {
  const r = classifyRules("Bug", "se traba al rotar la nave con el teclado y mover el raton y cambiar de skin")
  assert.ok(r.areas.length <= 2)
  for (const area of r.areas) assert.ok(AREA_IDS.includes(area))
})

// ---------------------------------------------------------------------------
// Referencias a archivos
// ---------------------------------------------------------------------------

test("collectFileRefs solo devuelve lineas que existen de verdad", () => {
  const refs = collectFileRefs("el escudo del power-up no funciona con la skin morada", REAL_LINES)
  assert.ok(refs.length > 0)
  for (const ref of refs) {
    assert.ok(REAL_LINES.has(ref.file), `${ref.file} debe existir`)
    assert.ok(ref.line <= REAL_LINES.get(ref.file), `${ref.file}:${ref.line} fuera de rango`)
  }
})

test("collectFileRefs no inventa refs si el archivo no esta", () => {
  assert.deepEqual(collectFileRefs("el escudo y las skins", new Map()), [])
})

test("collectFileRefs da como maximo 2 referencias por archivo", () => {
  const refs = collectFileRefs("asteroides colisiones render particulas niveau nivel menu hud skins", REAL_LINES)
  const gameRefs = refs.filter((r) => r.file === "game.js")
  assert.ok(gameRefs.length <= 2)
})

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

test("tokenize descarta palabras cortas y vacias", () => {
  const tokens = tokenize("El juego de la nave con los asteroides de la pantalla")
  assert.ok(tokens.has("asteroides"))
  assert.ok(tokens.has("pantalla"))
  assert.ok(!tokens.has("el"))
  assert.ok(!tokens.has("de"))
  assert.ok(!tokens.has("la"))
})

test("jaccard da 1 consigo mismo y 0 sin traslape", () => {
  const a = tokenize("asteroides colision nave")
  assert.equal(jaccard(a, a), 1)
  assert.equal(jaccard(a, tokenize("documentacion readme licencia")), 0)
})

test("findDuplicates encuentra el issue parecido y descarta los pull requests", () => {
  const issue = { number: 1, title: "Los asteroides se atraviesan al chocar", body: "colision mala entre balas y asteroides" }
  const others = [
    { number: 2, title: "Colision incorrecta entre balas y asteroides", body: "las balas atraviesan los asteroides" },
    { number: 3, title: "Cambio de licencia del readme", body: "documentacion del proyecto" },
    { number: 4, title: "Colision mala", body: "mismo texto", pull_request: {} },
  ]
  const found = findDuplicates(issue, others)
  assert.equal(found.length, 1)
  assert.equal(found[0].number, 2)
  assert.equal(found[0].score >= 0.25, true)
})

test("findDuplicates se ignora a si mismo", () => {
  const issue = { number: 7, title: "asteroides colision", body: "colision asteroides nave" }
  assert.deepEqual(findDuplicates(issue, [{ number: 7, title: "asteroides colision", body: "colision asteroides nave" }]), [])
})

// ---------------------------------------------------------------------------
// Taxonomia
// ---------------------------------------------------------------------------

test("la taxonomia no tiene labels duplicadas ni invalidas", () => {
  const names = LABELS.map((l) => l.name)
  assert.equal(new Set(names).size, names.length, "no debe haber nombres repetidos")
  for (const label of LABELS) {
    assert.match(label.name, /^[a-zA-Z0-9:._-]+$/, `nombre de label invalido: ${label.name}`)
    assert.match(label.color, /^[0-9a-f]{6}$/i, `color invalido en ${label.name}`)
    assert.ok(label.description.length > 0, `${label.name} sin descripcion`)
  }
})

test("cada tipo y cada area de la taxonomia tiene label", () => {
  const names = new Set(LABELS.map((l) => l.name))
  for (const tipo of TIPO_IDS) assert.ok(names.has(`tipo:${tipo}`), `falta label para tipo:${tipo}`)
  for (const area of AREA_IDS) assert.ok(names.has(`area:${area}`), `falta label para area:${area}`)
})

// ---------------------------------------------------------------------------
// renderBlock: las referencias verificadas por la IA deben ser visibles
// ---------------------------------------------------------------------------

const ctxBase = {
  labels: ["tipo:bug"],
  rules: { tipo: "bug", prioridad: "P1", areas: ["juego"], estado: [], faltantes: [] },
  duplicates: [],
  fileLines: new Map([["game.js", 900]]),
  repoUrl: "https://github.com/r/e",
  branch: "main",
  aiExpected: true,
}

test("renderBlock muestra las referencias que verifico la IA", () => {
  const block = renderBlock({
    ...ctxBase,
    refs: [{ file: "game.js", line: 97, note: "class Asteroid" }],
    ai: { resumen: "r", causa: "c", areas: ["juego"], refs: [{ file: "game.js", line: 657 }] },
  })
  assert.ok(block.includes("game.js#L97"), "debe listar la ref de las reglas")
  assert.ok(block.includes("game.js#L657"), "debe listar la ref que verifico la IA")
  assert.ok(block.includes("verificado por la IA"))
})

test("renderBlock no repite una referencia que ya estaba", () => {
  const block = renderBlock({
    ...ctxBase,
    refs: [{ file: "game.js", line: 97, note: "class Asteroid" }],
    ai: { resumen: "r", causa: "c", areas: ["juego"], refs: [{ file: "game.js", line: 97 }] },
  })
  assert.equal(block.split("game.js#L97").length - 1, 1, "aparece dos veces")
})

test("renderBlock limita cuantas referencias agrega la IA", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ file: "game.js", line: i + 1 }))
  const block = renderBlock({ ...ctxBase, refs: [], ai: { resumen: "r", causa: "c", areas: [], refs: many } })
  const total = (block.match(/- \[`game\.js:\d+`\]/g) || []).length
  assert.ok(total <= 4, `deberia mostrar como mucho 4 refs de la IA, mostró ${total}`)
})

// ---------------------------------------------------------------------------
// buildReport: propone, no escribe
// ---------------------------------------------------------------------------

const stateBase = {
  rules: { tipo: "bug", prioridad: "P2", areas: ["juego"], estado: [], faltantes: [] },
  refs: [],
  duplicates: [],
  branch: "main",
  repoUrl: "https://github.com/r/e",
  fileLines: [["game.js", 900]],
}
const issueBase = { number: 42, title: "se congela", body: "el juego se congela", labels: [] }

const aiText = (block) => JSON.stringify({ type: "text", part: { text: `<triaje>\n${block}\n</triaje>` } })

test("buildReport propone el bloque sin tocar el cuerpo", () => {
  const r = buildReport(issueBase, stateBase, "")
  assert.ok(r.suggestedBody.startsWith(issueBase.body), "el texto del reporte va primero, intacto")
  assert.ok(r.suggestedBody.includes(MARKER_START))
  assert.ok(r.suggestedBody.includes(MARKER_END))
})

test("buildReport sugiere las labels que faltan y las que sobran", () => {
  const issue = { ...issueBase, labels: ["tipo:bug"] }
  const r = buildReport(issue, stateBase, "")
  assert.ok(!r.toAdd.includes("tipo:bug"), "tipo:bug ya estaba")
  assert.ok(r.toAdd.includes("P2-media"), "la prioridad falta")
  assert.deepEqual(r.alreadyOn, ["tipo:bug"])
  assert.deepEqual(r.toRemove, [], "sin manifiesto previo no hay nada que quitar")
})

test("buildReport avisa de una label de un triaje anterior que ya no aplica", () => {
  const issue = {
    ...issueBase,
    body: `texto\n\n${MARKER_START}\n<!-- triage:labels tipo:bug,P3-baja -->\nviejo\n${MARKER_END}`,
    labels: ["tipo:bug", "P3-baja", "ayuda-bienvenida"],
  }
  const r = buildReport(issue, stateBase, "")
  assert.deepEqual(r.toRemove, ["P3-baja"], "solo quita lo que puso un triaje previo")
  assert.ok(!r.toRemove.includes("ayuda-bienvenida"), "nunca toca una label de una persona")
})

test("buildReport deja que la IA corrija tipo y prioridad", () => {
  const r = buildReport(issueBase, stateBase, aiText("tipo: feature\narea: powerups\nprioridad: P0\nresumen: r\ncausa: c"))
  assert.ok(r.labels.includes("tipo:feature"))
  assert.ok(!r.labels.includes("tipo:bug"), "reemplaza, no acumula")
  assert.ok(r.labels.includes("P0-critica"))
  assert.ok(r.labels.includes("area:powerups"))
  assert.ok(r.ai, "debe reportar que la IA sirvio")
})

test("buildReport degrada a reglas si la IA no sirve", () => {
  for (const basura of ["", "no se que", "<triaje>\ntipo: hacker\nprioridad: P99\n</triaje>", JSON.stringify({})]) {
    const r = buildReport(issueBase, stateBase, basura)
    assert.equal(r.ai, null, `no deberia aceptar: ${basura}`)
    assert.ok(r.labels.includes("tipo:bug"), "debe quedarse con las reglas")
  }
})

test("buildReport no inventa labels fuera de la taxonomia", () => {
  const r = buildReport(issueBase, stateBase, aiText("tipo: bug\narea: admin\nprioridad: P9\nresumen: r\ncausa: c"))
  for (const l of r.labels) assert.ok(LABELS.some((x) => x.name === l), `label fuera de la taxonomia: ${l}`)
})

test("renderSummary aclara que no escribe nada y muestra como aplicar", () => {
  const r = buildReport(issueBase, stateBase, aiText("tipo: bug\nresumen: r\ncausa: c"))
  const s = renderSummary(r, issueBase)
  assert.ok(s.includes("no escribe nada"), "debe dejar claro que es una propuesta")
  assert.ok(s.includes("`tipo:bug` **(sugerida)**"))
  assert.ok(s.includes("| Label | Color | Para que sirve |"), "debe incluir la taxonomia")
  assert.ok(s.includes(MARKER_START), "debe incluir el bloque listo para pegar")
  assert.ok(s.includes("````"), "el bloque va en una cerca de 4 acentos graves")
})

// ---------------------------------------------------------------------------
// garantia: ningun token en el codigo
// ---------------------------------------------------------------------------

test("el script no menciona ningun token ni verbo de escritura", () => {
  const src = fs.readFileSync(new URL("./triage.mjs", import.meta.url), "utf8")
  // Solo se admite GET: la API de GitHub no deja escribir sin credencial.
  const metodos = [...src.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1])
  assert.deepEqual([...new Set(metodos)], ["GET"], "solo GET")
  assert.ok(!/authorization\s*:/i.test(src), "no debe construir una cabecera de autorizacion")
  assert.ok(!/process\.env\.GITHUB_TOKEN/.test(src), "no debe leer GITHUB_TOKEN")
  assert.ok(!/secrets\./.test(src), "no debe leer secrets")
})


