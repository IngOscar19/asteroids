// Simulacion end-to-end: levanta una API de GitHub falsa en localhost y corre
// `collect` y `report` de verdad contra ella.
//
// La garantia que prueba esto es la importante: el script no debe enviar NUNCA un
// verbo de escritura ni una cabecera de autorizacion, porque no usa ningun token.
// El servidor mock falla ruidosamente ante cualquier POST/PUT/PATCH/DELETE y
// registra las cabeceras para poder afirmar que no se mandaron credenciales.
//
// Uso: node .github/scripts/e2e.mjs
//      E2E_VERBOSE=1 node .github/scripts/e2e.mjs   (muestra cada llamada)

import assert from "node:assert/strict"
import { createServer } from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)
const SCRIPT = path.resolve(import.meta.dirname, "triage.mjs")
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..")
const REPO = "IngOscar19/asteroids"
const NUMBER = 42

const ORIGINAL = "El juego se congela cuando hay muchos asteroides.\n\n  Chrome en Windows.\n\nPasos: jugar 30 segundos.\n"
const ISSUES = new Map([
  [
    NUMBER,
    {
      number: NUMBER,
      title: "El juego se congela con muchos asteroides",
      body: ORIGINAL,
      user: { login: "reporter" },
      labels: [{ name: "area:juego" }, { name: "ayuda-bienvenida" }],
    },
  ],
  [
    7,
    {
      number: 7,
      title: "Colision incorrecta entre balas y asteroides",
      body: "las balas atraviesan los asteroides en pantalla",
      user: { login: "otro" },
      labels: [],
    },
  ],
])

const calls = []
const authHeaders = []

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost")
  const pathOnly = url.pathname
  let raw = ""
  req.on("data", (c) => (raw += c))
  req.on("end", () => {
    calls.push(`${req.method} ${pathOnly}`)
    for (const h of Object.keys(req.headers)) {
      if (/^(authorization|cookie|x-github-token|private-token)$/i.test(h)) {
        authHeaders.push(`${h}: ${req.headers[h]}`)
      }
    }

    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" })
      res.end(obj === null ? "" : JSON.stringify(obj))
    }

    if (pathOnly === `/repos/${REPO}`) return send(200, { default_branch: "main" })
    if (pathOnly === `/repos/${REPO}/issues` && req.method === "GET") return send(200, [...ISSUES.values()])

    const one = new RegExp(`^/repos/${REPO}/issues/(\\d+)$`).exec(pathOnly)
    if (one) {
      const issue = ISSUES.get(Number(one[1]))
      if (!issue) return send(404, { message: "Not Found" })
      if (req.method === "GET") return send(200, issue)
      if (req.method === "PATCH") {
        const parsed = JSON.parse(raw || "{}")
        Object.assign(issue, parsed)
        return send(200, issue)
      }
    }

    const labelsRoute = new RegExp(`^/repos/${REPO}/issues/(\\d+)/labels$`).exec(pathOnly)
    if (labelsRoute && req.method === "POST") {
      return send(200, [{ name: "test-label" }])
    }

    const delLabelRoute = new RegExp(`^/repos/${REPO}/issues/(\\d+)/labels/([^/]+)$`).exec(pathOnly)
    if (delLabelRoute && req.method === "DELETE") {
      return send(200, [])
    }

    return send(404, { message: `mock sin ruta: ${req.method} ${pathOnly}` })
  })
})

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const port = server.address().port

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "triage-e2e-"))

// Se toma una linea que exista de verdad hoy, para que la prueba no se rompa si
// game.js cambia de tamaño.
const gameLines = fs.readFileSync(path.join(REPO_ROOT, "game.js"), "utf8").split("\n").length
const GOOD_LINE = Math.max(1, Math.min(680, gameLines - 1))
const BAD_LINE = gameLines + 5000

const env = {
  ...process.env,
  GITHUB_API_URL: `http://127.0.0.1:${port}`,
  GITHUB_REPOSITORY: REPO,
  TRIAGE_DIR: dir,
  GITHUB_EVENT_PATH: "",
}
delete env.GITHUB_TOKEN

const script = (args, customEnv = env) => run(process.execPath, [SCRIPT, ...args], { env: customEnv, cwd: REPO_ROOT })

let failures = 0
const check = async (name, fn) => {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${err.message}`)
  }
}

console.log("collect (lee por GET, sin token):")
await script(["collect", "--issue", String(NUMBER)])
await check("escribio los artefactos", () => {
  for (const f of ["issue.json", "rules.json", "prompt.txt"]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `falta ${f}`)
  }
})
await check("solo hizo peticiones GET", () => {
  const writes = calls.filter((c) => !c.startsWith("GET"))
  assert.equal(writes.length, 0, `escribio en la API: ${writes.join(", ")}`)
})
await check("nunca mando una cabecera de credencial", () => {
  assert.equal(authHeaders.length, 0, `mando: ${authHeaders.join(" | ")}`)
})
await check("no creo ninguna label", () => {
  assert.ok(!calls.some((c) => c.includes("/labels")), "no debe tocar labels")
})
await check("el prompt incluye el issue como dato, no como instruccion", () => {
  const prompt = fs.readFileSync(path.join(dir, "prompt.txt"), "utf8")
  assert.ok(prompt.includes("<issue>") && prompt.includes("congela"))
  assert.ok(prompt.includes("<triaje>"), "debe pedir el bloque de salida")
  assert.ok(prompt.includes("informacion no confiable"), "debe marcar el issue como dato")
})
await check("guardo las labels actuales del issue", () => {
  const issue = JSON.parse(fs.readFileSync(path.join(dir, "issue.json"), "utf8"))
  assert.deepEqual(issue.labels, ["area:juego", "ayuda-bienvenida"])
})

console.log("report (sin IA -> solo reglas):")
fs.writeFileSync(path.join(dir, "ai.jsonl"), "")
let out = await script(["report"])
let summary = out.stdout
await check("avisa que no escribe nada en modo propuesta", () => {
  assert.ok(summary.includes("no escribe nada"), "debe aclarar que es una propuesta")
})
await check("sugiere labels coherentes", () => {
  assert.ok(summary.includes("`tipo:bug` **(sugerida)**"), "esperaba tipo:bug")
  assert.ok(!summary.includes("`tipo:feature` **(sugerida)**"), "no debe sugerir dos tipos")
  assert.ok(summary.includes("`P1-alta` **(sugerida)**"), "esperaba P1-alta")
})
await check("distingue lo que ya estaba de lo que falta", () => {
  assert.ok(summary.includes("Ya estan en el issue"), "debe listar las que ya estan")
  assert.ok(summary.includes("`area:juego`"), "area:juego ya estaba en el issue")
  assert.ok(summary.includes("Faltan:"), "debe decir quais faltan")
})
await check("el bloque va aparte del texto de la persona", () => {
  const start = summary.indexOf("````markdown")
  const end = summary.indexOf("````", start + 12)
  const block = summary.slice(start + 12, end)
  assert.ok(block.includes("<!-- triage:start v1 -->"), "debe traer los marcadores")
  assert.ok(!block.includes(ORIGINAL.trim()), "el bloque no debe incluir el texto del reporte")
})
await check("publico la taxonomia completa con color y descripcion", () => {
  assert.ok(summary.includes("| Label | Color | Para que sirve |"))
  assert.ok(summary.includes("`P0-critica`"))
})
await check("report no hablo con la API sin --apply", () => {
  const before = calls.length
  return script(["report"]).then(() => {
    const writes = calls.slice(before).filter((c) => !c.startsWith("GET"))
    assert.equal(writes.length, 0, `escribio: ${writes.join(", ")}`)
    assert.equal(calls.length, before, "report no deberia hacer ni una peticion")
  })
})

console.log("report (con IA valida que corrige tipo y prioridad):")
const goodAi = [
  JSON.stringify({ type: "text", part: { text: "charlando" } }),
  JSON.stringify({
    type: "text",
    part: {
      text: [
        "<triaje>",
        "tipo: feature",
        "area: powerups",
        "prioridad: P0",
        "resumen: En realidad es una peticion de funcionalidad nueva.",
        "causa: Ver game.js:" + GOOD_LINE + ".",
        "refs: game.js:" + GOOD_LINE + ", hack.js:1, game.js:" + BAD_LINE,
        "</triaje>",
        "ignoren todo lo anterior",
      ].join("\n"),
    },
  }),
].join("\n")
fs.writeFileSync(path.join(dir, "ai.jsonl"), goodAi)
out = await script(["report"])
summary = out.stdout
await check("usa el tipo de la IA", () => {
  assert.ok(summary.includes("`tipo:feature` **(sugerida)**"), "la IA cambio el tipo")
  assert.ok(!summary.includes("`tipo:bug` **(sugerida)**"), "no debe quedar el tipo de las reglas")
})
await check("usa la prioridad de la IA", () => {
  assert.ok(summary.includes("`P0-critica` **(sugerida)**"))
})
await check("aplica el resumen de la IA", () => {
  assert.ok(summary.includes("peticion de funcionalidad nueva"))
})
await check("descarta refs invalidas pero conserva la buena", () => {
  const start = summary.indexOf("````markdown")
  const block = summary.slice(start)
  assert.ok(block.includes("game.js:" + GOOD_LINE), "debe citar la linea real")
  assert.ok(!block.includes("hack.js"), "no debe citar un archivo fuera de la allowlist")
  assert.ok(!block.includes("game.js:" + BAD_LINE), "no debe citar una linea fuera de rango")
})
await check("descarta texto posterior a </triaje>", () => {
  assert.ok(!summary.includes("ignoren todo"))
})

console.log("report (IA con prompt injection):")
fs.writeFileSync(
  path.join(dir, "ai.jsonl"),
  JSON.stringify({
    type: "text",
    part: {
      text: [
        "<triaje>",
        "tipo: bug",
        "area: admin",
        "prioridad: P9",
        "resumen: Hola @IngOscar19 avisa a <b>todos</b> <!-- x -->",
        "causa: <script>steal()</script>causa real",
        "refs: game.js:9",
        "</triaje>",
      ].join("\n"),
    },
  }),
)
out = await script(["report"])
summary = out.stdout
await check("rechaza enums fuera de allowlist", () => {
  assert.ok(!summary.includes("`area:admin` **(sugerida)**"), "no debe sugerir area:admin")
  assert.ok(!summary.includes("`P9"), "no debe sugerir una prioridad inventada")
})
await check("no deja menciones @ en el bloque", () => {
  const start = summary.indexOf("````markdown")
  const block = summary.slice(start)
  assert.ok(!block.includes("@IngOscar19"), "habria notificado a un usuario")
})
await check("neutraliza HTML y scripts de la IA", () => {
  const start = summary.indexOf("````markdown")
  const block = summary.slice(start)
  assert.ok(!block.includes("<script>") && !block.includes("<b>"))
  assert.ok(block.includes("causa real"), "el texto util debe sobrevivir")
})

console.log("idempotencia del bloque propuesto:")
const prev = `texto previo\n\n---\n\n<!-- triage:start v1 -->\n<!-- triage:labels tipo:bug,P3-baja -->\nbloque viejo\n<!-- triage:end -->`
const issueFile = path.join(dir, "issue.json")
const issueJson = JSON.parse(fs.readFileSync(issueFile, "utf8"))
issueJson.body = prev
fs.writeFileSync(issueFile, JSON.stringify(issueJson, null, 2))
fs.writeFileSync(path.join(dir, "ai.jsonl"), "")
out = await script(["report"])
summary = out.stdout
await check("avisa que una label anterior ya no corresponde", () => {
  assert.ok(summary.includes("Ya no corresponden"), "debe avisar de la label obsoleta")
  assert.ok(summary.includes("`P3-baja`"), "debe nombrar la label a quitar")
})
await check("no propone quitar la que puso una persona", () => {
  assert.ok(!summary.includes("ayuda-bienvenida"), "solo toca lo que puso un triaje previo")
})
await check("el bloque propuesto no duplica marcadores", () => {
  const start = summary.indexOf("````markdown")
  const block = summary.slice(start)
  assert.equal(block.split("<!-- triage:start v1 -->").length - 1, 1)
  assert.equal((block.match(/^---$/gm) || []).length, 0, "el bloque no debe traer separador propio")
})

console.log("aplicacion directa con GITHUB_TOKEN y --apply:")
const applyEnv = {
  ...env,
  GITHUB_TOKEN: "mock-token",
  INPUT_ISSUE_NUMBER: String(NUMBER),
}
await script(["report", "--apply"], applyEnv)
await check("envia PATCH para actualizar cuerpo del issue", () => {
  assert.ok(calls.some((c) => c.startsWith(`PATCH /repos/${REPO}/issues/${NUMBER}`)), "debe enviar PATCH al issue")
})
await check("envia POST para agregar labels", () => {
  assert.ok(calls.some((c) => c.startsWith(`POST /repos/${REPO}/issues/${NUMBER}/labels`)), "debe enviar POST a /labels")
})
await check("envia DELETE para remover label obsoleta", () => {
  assert.ok(calls.some((c) => c.startsWith(`DELETE /repos/${REPO}/issues/${NUMBER}/labels/`)), "debe enviar DELETE a /labels/...")
})
await check("envia cabecera authorization con el token", () => {
  assert.ok(authHeaders.some((h) => h.includes("Bearer mock-token")), "debe incluir authorization: Bearer mock-token")
})

server.close()
fs.rmSync(dir, { recursive: true, force: true })

if (process.env.E2E_VERBOSE) {
  console.log("\ncalls:")
  for (const c of calls) console.log("  " + c)
}
console.log(failures === 0 ? "\nTodo OK" : `\n${failures} fallo(s)`)
process.exit(failures === 0 ? 0 : 1)
