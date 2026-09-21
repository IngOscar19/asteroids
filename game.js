'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyS'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── EnemyBullet ───────────────────────────────────────────────────────────────
class EnemyBullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 300;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 3;
    this.radius = 3;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50, 40];   // por tamaño 1, 2, 3, 4 (estrella fugaz)
const SPEEDS = [0, 85, 55, 32, 130]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20, 300];// puntos por tamaño

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;
    this.fugaz = size === 4;
    this.ttl = this.fugaz ? 8 : 0;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);
    this.shootCooldown = rand(1.5, 4);
    this.shootTimer = this.shootCooldown;

    // Polígono irregular (o estrella de 5 puntas para la fugaz)
    this.verts = [];
    if (this.fugaz) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? this.radius : this.radius * 0.45;
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    } else {
      const n = randInt(8, 13);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
  }

  update(dt, shipX, shipY){
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
    if (this.fugaz) {
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }
  }

  split() {
    if (this.size <= 1 || this.fugaz) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (this.fugaz) {
      // Parpadeo rápido cuando está por desaparecer
      const alpha = this.ttl < 2 ? (Math.sin(this.ttl * 10) > 0 ? 1 : 0.35) : 1;
      ctx.strokeStyle = `rgba(255, 200, 90, ${alpha})`;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
    }
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor(skinKey = 'classic') {
    this.skinKey = skinKey;
    this.reset();
  }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
    this.speedPowerupActive = false;
    this.speedPowerupTimer = 0;
    this.tripleShotActive = false;
    this.tripleShotTimer = 0;
    this.shieldHits = 0;
    this.shieldActive = false;
  }

  toggleShield() {
    if (this.dead) return;
    if (this.shieldActive) {
      this.shieldActive = false;
      this.shieldHits = 0;
    } else {
      this.shieldActive = true;
      this.shieldHits = 3;
    }
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260;  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      const speedMult = this.speedPowerupActive && this.speedPowerupTimer > 0 ? 2 : 1;
      this.vx += Math.cos(this.angle) * THRUST * speedMult * dt;
      this.vy += Math.sin(this.angle) * THRUST * speedMult * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;

    if (this.speedPowerupActive) {
      this.speedPowerupTimer -= dt;
      if (this.speedPowerupTimer <= 0) {
        this.speedPowerupActive = false;
      }
    }

    if (this.tripleShotActive) {
      this.tripleShotTimer -= dt;
      if (this.tripleShotTimer <= 0) {
        this.tripleShotActive = false;
      }
    }

    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const OX = Math.cos(this.angle) * NOSE;
    const OY = Math.sin(this.angle) * NOSE;
    const count  = this.tripleShotActive ? 3 : 1;
    const SPREAD = 6;
    const bullets = [];
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * SPREAD;
      const ox = this.x + OX + Math.cos(this.angle + Math.PI / 2) * off;
      const oy = this.y + OY + Math.sin(this.angle + Math.PI / 2) * off;
      bullets.push(new Bullet(ox, oy, this.angle));
    }
    return bullets;
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    const skin = SHIP_SKINS[this.skinKey];
    const t = performance.now() / 1000;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Animación custom del skin (glow, etc.)
    if (skin.drawExtras) skin.drawExtras(ctx, t, this);

    // Indicador visual de triple disparo activo
    if (this.tripleShotActive) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo( 20,  0);
      ctx.lineTo( 32, -6);
      ctx.moveTo( 20,  0);
      ctx.lineTo( 32,  6);
      ctx.stroke();
    }

    // Indicador visual de velocidad activa
    if (this.speedPowerupActive) {
      ctx.strokeStyle = skin.speedIndicator;
      ctx.lineWidth   = 2.5;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo( 20,  0);
      ctx.lineTo(-12, -9);
      ctx.lineTo( -7,  0);
      ctx.lineTo(-12,  9);
      ctx.closePath();
      ctx.stroke();
    }

    // Silueta principal
    ctx.strokeStyle = skin.color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    ctx.beginPath();
    ctx.moveTo(skin.vertices[0][0], skin.vertices[0][1]);
    for (let i = 1; i < skin.vertices.length; i++) {
      ctx.lineTo(skin.vertices[i][0], skin.vertices[i][1]);
    }
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor con animación según config del skin
    if (this.thrusting) {
      const thr = skin.thruster;
      const shouldDraw = thr.flicker ? (Math.random() > 0.35)
                          : thr.pulse ? (Math.sin(t * 15) > 0.2)
                          : true;
      if (shouldDraw) {
        const len = rand(...thr.lengthRange);
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(-8 - len, 0);
        ctx.lineTo(-8,  4);
        ctx.strokeStyle = thr.color;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  setSkin(key) {
    if (SHIP_SKINS[key]) this.skinKey = key;
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

class Powerup {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 8;
    this.type = Math.random() < 0.5 ? 'triple' : 'velocidad';
    this.ttl = 5;
    this.dead = false;
    this.rot = rand(0, Math.PI * 2);
    this.rotSpeed = rand(-0.5, 0.5);
  }

  update(dt) {
    this.ttl -= dt;
    this.rot += this.rotSpeed * dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.type === 'triple' ? '#00e5ff' : '#ffd700';
    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    ctx.lineTo(this.radius / 2, this.radius / 3);
    ctx.lineTo(0, this.radius * 0.6);
    ctx.lineTo(-this.radius / 2, this.radius / 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ── Pantalla de Inicio ────────────────────────────────────────────────────────
class StartScreen {
  constructor() {
    this.selectedIndex = 0;
    this.previewTime = 0;
    this.highScore = parseInt(localStorage.getItem('asteroidsHighScore') || '0', 10);
    this.animTime = 0;
  }

  update(dt) {
    this.animTime += dt;
    this.previewTime += dt;
  }

  handleInput() {
    if (pressed('ArrowLeft')) this.selectedIndex = (this.selectedIndex - 1 + SKIN_ORDER.length) % SKIN_ORDER.length;
    if (pressed('ArrowRight')) this.selectedIndex = (this.selectedIndex + 1) % SKIN_ORDER.length;
    if (pressed('Space') || pressed('Enter')) {
      const key = SKIN_ORDER[this.selectedIndex];
      localStorage.setItem('shipSkin', key);
      state = 'playing';
      initGame(key);
    }
  }

  draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Título
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('ASTEROIDS', W/2, 80);

    // High Score
    ctx.font = '16px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`MEJOR PUNTAJE: ${this.highScore}`, W/2, 115);

    // Controles
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('← →  Seleccionar skin    ESPACIO / ENTER  Jugar', W/2, H - 60);
    ctx.fillText('↑ Propulsar    ← → Rotar    ESPACIO Disparar', W/2, H - 40);

    // Grid de skins
    const cols = 3;
    const startX = W/2 - (cols * 100 - 20)/2;
    const startY = 160;

    SKIN_ORDER.forEach((key, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * 100;
      const y = startY + row * 110;

      // Fondo tarjeta
      ctx.fillStyle = i === this.selectedIndex ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = i === this.selectedIndex ? '#0ff' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = i === this.selectedIndex ? 2 : 1;
      ctx.fillRect(x, y, 90, 90);
      ctx.strokeRect(x, y, 90, 90);

      // Miniatura: renderiza nave estática
      this.drawSkinThumbnail(key, x + 45, y + 40);

      // Nombre
      ctx.fillStyle = i === this.selectedIndex ? '#0ff' : '#aaa';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(SHIP_SKINS[key].name, x + 45, y + 98);
    });

    // Preview grande del skin seleccionado (animado)
    this.drawLargePreview(SKIN_ORDER[this.selectedIndex], W/2, H - 130);
  }

  drawSkinThumbnail(key, cx, cy) {
    const skin = SHIP_SKINS[key];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI/2);
    ctx.strokeStyle = skin.color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(skin.vertices[0][0]*0.6, skin.vertices[0][1]*0.6);
    for (let i=1;i<skin.vertices.length;i++) {
      ctx.lineTo(skin.vertices[i][0]*0.6, skin.vertices[i][1]*0.6);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  drawLargePreview(key, cx, cy) {
    const skin = SHIP_SKINS[key];
    const t = this.previewTime;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI/2 + Math.sin(t * 0.7) * 0.15);

    if (skin.drawExtras) skin.drawExtras(ctx, t, {});

    // Nave
    ctx.strokeStyle = skin.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(skin.vertices[0][0]*1.3, skin.vertices[0][1]*1.3);
    for (let i=1;i<skin.vertices.length;i++) {
      ctx.lineTo(skin.vertices[i][0]*1.3, skin.vertices[i][1]*1.3);
    }
    ctx.closePath();
    ctx.stroke();

    // Thruster animado (idle)
    const thr = skin.thruster;
    const pulse = thr.pulse ? (0.5 + Math.sin(t * 8) * 0.5) : 1;
    ctx.beginPath();
    ctx.moveTo(-8*1.3, -4*1.3);
    ctx.lineTo((-8 - 10*pulse)*1.3, 0);
    ctx.lineTo(-8*1.3, 4*1.3);
    let thrColor = thr.color;
    if (thr.pulse) {
      thrColor = thr.color.replace('0.9', String(0.6*pulse)).replace('0.95', String(0.7*pulse));
    }
    ctx.strokeStyle = thrColor;
    ctx.stroke();

    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, enemyBullets, asteroids, particles, powerups;
let score, lives, level;
let state = 'start';      // 'start' | 'playing' | 'dead' | 'gameover'
let deadTimer;
let startScreen;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    const fugaz = Math.random() < 0.15;
    asteroids.push(new Asteroid(x, y, fugaz ? 4 : 3));
  }
}

function initGame(skinKey) {
  const key = skinKey || localStorage.getItem('shipSkin') || 'classic';
  ship          = new Ship(key);
  bullets   = [];
  enemyBullets = [];
  asteroids = [];
  particles = [];
  powerups = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
    const hs = parseInt(localStorage.getItem('asteroidsHighScore') || '0', 10);
    if (score > hs) localStorage.setItem('asteroidsHighScore', String(score));
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    const newEnemyBullets = [];
  for (const a of asteroids) {
    const result = a.update(dt, ship.x, ship.y);
    if (result) newEnemyBullets.push(result);
  }
  enemyBullets.push(...newEnemyBullets);
  enemyBullets = enemyBullets.filter(b => !b.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Toggle shield
  if (pressed('KeyS')) {
    ship.toggleShield();
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  const newEnemyBullets = [];
  for (const a of asteroids) {
    const result = a.update(dt, ship.x, ship.y);
    if (result) newEnemyBullets.push(result);
  }
  enemyBullets.push(...newEnemyBullets);
  enemyBullets = enemyBullets.filter(b => !b.dead);
  particles.forEach(p => p.update(dt));
  powerups.forEach(p => p.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        if (a.size === 3 && Math.random() < 0.25) {
          powerups.push(new Powerup(a.x, a.y));
        }
        newAsteroids.push(...a.split());
      }
    }
  }

  // Enemigo bala vs escudo
  for (const eb of enemyBullets) {
    if (eb.dead) continue;
    if (ship.shieldActive && ship.shieldHits > 0 && dist(eb, ship) < ship.radius + 26) {
      eb.dead = true;
      ship.shieldHits--;
      explode(eb.x, eb.y, 6);
      if (ship.shieldHits <= 0) {
        ship.shieldActive = false;
      }
    }
  }
  enemyBullets = enemyBullets.filter(b => !b.dead);

  // Enemigo bala vs nave (sin escudo)
  if (ship.invincible <= 0 && !ship.shieldActive) {
    for (const eb of enemyBullets) {
      if (!eb.dead && dist(eb, ship) < ship.radius + eb.radius) {
        eb.dead = true;
        killShip();
        break;
      }
    }
  }

  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Powerup vs nave
  if (ship.invincible <= 0 && ship.speedPowerupActive === false) {
    for (const p of powerups) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        ship.speedPowerupActive = true;
        ship.speedPowerupTimer = 5;
        p.dead = true;
      }
    }
  }
  powerups = powerups.filter(p => !p.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        killShip();
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawShieldIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#00c8ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  // Shield indicator
  if (ship.shieldActive && ship.shieldHits > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = ship.shieldHits <= 1 ? '#ff6432' : '#00c8ff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`SHIELD ${ship.shieldHits}`, W - 14, 48);
    drawShieldIcon(W - 14, 58);
  }

}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  enemyBullets.forEach(b => b.draw());
  bullets.forEach(b => b.draw());
  powerups.forEach(p => p.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (state === 'start') {
    if (!startScreen) startScreen = new StartScreen();
    startScreen.update(dt);
    startScreen.handleInput();
    startScreen.draw();
  } else {
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
