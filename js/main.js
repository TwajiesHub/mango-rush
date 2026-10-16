import * as THREE from 'three';
import { getPlayer, styleKey } from './startng.js';
import { buildCharacter, animateCharacter, disposeCharacter } from './character.js';

// ------------------------------------------------------------------ constants
const ARENA_R = 10.8;     // how far the player can walk from the centre
const DROP_HEIGHT = 16;
const CATCH_R = 0.95;
const HIT_R = 1.0;
const MAX_HEARTS = 3;
const COMBO_WINDOW = 2.2; // seconds between catches to keep a combo going

// ------------------------------------------------------------------ dom
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const ui = {
  hud: $('hud'), hudName: $('hudName'), hudDot: $('hudDot'), hearts: $('hearts'),
  score: $('score'), combo: $('combo'), comboBox: $('comboBox'),
  start: $('startScreen'), greet: $('greet'), look: $('look'), play: $('playBtn'),
  over: $('overScreen'), overKicker: $('overKicker'), finalScore: $('finalScore'),
  finalMangoes: $('finalMangoes'), finalCombo: $('finalCombo'), finalBest: $('finalBest'),
  again: $('againBtn'), menu: $('menuBtn'),
  floaters: $('floaters'), flash: $('flash'),
  joy: $('joy'), knob: $('knob'), dash: $('dashBtn'), mute: $('muteBtn'),
};
const isTouch = matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog('#ffc58f', 34, 90);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight('#ffe2bd', '#5c8a3c', 1.1));
const sun = new THREE.DirectionalLight('#fff0d6', 2.4);
sun.position.set(-9, 18, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const clouds = [];
buildWorld();

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const g = c.getContext('2d').createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#ff7b54');
  g.addColorStop(0.45, '#ffb26b');
  g.addColorStop(0.75, '#ffd59e');
  g.addColorStop(1, '#ffe8c7');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
}
function add(geo, material, x, y, z, parent = scene, shadows = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function buildWorld() {
  // water
  const water = add(new THREE.CircleGeometry(120, 48), std('#2fa7b7', { roughness: 0.25, metalness: 0.1 }), 0, -0.45, 0, scene, false);
  water.rotation.x = -Math.PI / 2;
  // sand + grass island
  add(new THREE.CylinderGeometry(14.2, 15.2, 1.2, 48), std('#f2d39b'), 0, -0.68, 0, scene, false);
  add(new THREE.CylinderGeometry(12.3, 12.6, 0.6, 48), std('#6dae46'), 0, -0.3, 0, scene, false);

  // grass patches and tufts
  const patch = std('#5c9c3a');
  const tuft = std('#4f8d33', { flatShading: true });
  const rnd = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 11.2;
    const p = add(new THREE.CircleGeometry(0.4 + rnd() * 0.9, 14), patch, Math.cos(a) * r, 0.005, Math.sin(a) * r, scene, false);
    p.rotation.x = -Math.PI / 2;
  }
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 11.8;
    const t = add(new THREE.ConeGeometry(0.06, 0.26, 4), tuft, Math.cos(a) * r, 0.13, Math.sin(a) * r);
    t.rotation.z = (rnd() - 0.5) * 0.4;
  }

  // trees only on the far half + sides, so they never block the camera
  const spots = [
    [-8, -10.2, 'mango'], [3.5, -12.6, 'palm'], [9.4, -8.6, 'mango'], [-12.5, -3.6, 'palm'],
    [12.8, -2.6, 'palm'], [-4.2, -12.9, 'palm'], [13.2, 3, 'palm'], [-13.3, 2.6, 'palm'],
  ];
  for (const [x, z, kind] of spots) (kind === 'palm' ? palm : mangoTree)(x, z, rnd);

  // rocks and bushes on the near side (low, so the view stays clear)
  const rock = std('#a39a8e', { flatShading: true });
  const bush = std('#3f7f34', { flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.15 + rnd() * Math.PI * 0.7, r = 12.4 + rnd() * 1.4;
    const s = 0.3 + rnd() * 0.45;
    const m = add(new THREE.DodecahedronGeometry(s, 0), i % 2 ? rock : bush, Math.cos(a) * r, s * 0.4 - 0.2, Math.sin(a) * r);
    m.rotation.set(rnd(), rnd(), rnd());
  }

  // clouds
  const cloud = std('#fff4e6', { flatShading: true, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) add(new THREE.IcosahedronGeometry(1.4 + rnd() * 1.4, 0), cloud, k * 1.9 - 3, rnd() * 0.8, rnd() * 1.2, g, false);
    const a = -Math.PI * 0.1 - rnd() * Math.PI * 0.8;
    g.position.set(Math.cos(a) * (40 + rnd() * 20), 14 + rnd() * 10, Math.sin(a) * (40 + rnd() * 20));
    g.userData.drift = 0.2 + rnd() * 0.3;
    clouds.push(g);
    scene.add(g);
  }
}

function palm(x, z, rnd) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const bark = std('#8a6440', { flatShading: true });
  const lean = (rnd() - 0.5) * 0.5;
  let px = 0, py = 0;
  for (let i = 0; i < 7; i++) {
    const seg = add(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.21 - i * 0.012, 0.8, 7), bark, px, py + 0.4, 0, g);
    seg.rotation.z = -lean * 0.4;
    px += lean * 0.18 * i * 0.25;
    py += 0.76;
  }
  const leaf = std('#2f7d32', { flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = add(new THREE.ConeGeometry(0.32, 2.6, 4, 1), leaf, px, py, 0, g);
    l.scale.z = 0.25;
    l.rotation.order = 'YXZ';
    l.rotation.y = a;
    l.rotation.x = 1.15;
    l.position.x += Math.sin(a) * 1.05;
    l.position.z += Math.cos(a) * 1.05;
    l.position.y -= 0.35;
  }
  for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.17, 8, 6), std('#6b4a2b'), px + Math.cos(i * 2) * 0.22, py - 0.2, Math.sin(i * 2) * 0.22, g);
  scene.add(g);
}

function mangoTree(x, z, rnd) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(new THREE.CylinderGeometry(0.28, 0.42, 2.6, 8), std('#7a5434', { flatShading: true }), 0, 1.3, 0, g);
  const leaf = std('#2e6b2f', { flatShading: true });
  const blobs = [[0, 3.4, 0, 1.8], [1.2, 3, 0.4, 1.3], [-1.2, 3.1, -0.2, 1.35], [0.2, 4.4, -0.3, 1.2]];
  for (const [bx, by, bz, r] of blobs) add(new THREE.IcosahedronGeometry(r, 1), leaf, bx, by, bz, g);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    add(new THREE.SphereGeometry(0.16, 10, 8), std('#ffb627', { roughness: 0.5 }), Math.cos(a) * 1.7, 2.4 + rnd() * 1.6, Math.sin(a) * 1.7, g);
  }
  scene.add(g);
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ falling things
const FRUIT = {
  mango: makeMango(false),
  gold: makeMango(true),
  coco: makeCoconut(),
};
function makeMango(gold) {
  const g = new THREE.Group();
  const body = add(new THREE.SphereGeometry(0.3, 20, 14), gold
    ? std('#ffd84d', { metalness: 0.7, roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.6 })
    : std('#ffb627', { roughness: 0.45 }), 0, 0, 0, g);
  body.scale.set(0.82, 1, 0.78);
  if (!gold) {
    const blush = add(new THREE.SphereGeometry(0.2, 14, 10), std('#ff6b3d', { roughness: 0.45 }), 0.1, 0.06, 0.13, g, false);
    blush.scale.set(0.8, 1, 0.6);
  }
  add(new THREE.CylinderGeometry(0.02, 0.025, 0.12, 6), std('#5a3d22'), 0, 0.33, 0, g);
  const leaf = add(new THREE.SphereGeometry(0.11, 8, 6), std('#3f8f3a'), 0.09, 0.36, 0, g);
  leaf.scale.set(1.4, 0.25, 0.6);
  leaf.rotation.z = 0.5;
  return g;
}
function makeCoconut() {
  const g = new THREE.Group();
  add(new THREE.IcosahedronGeometry(0.36, 1), std('#5b3a1f', { flatShading: true, roughness: 1 }), 0, 0, 0, g);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(new THREE.SphereGeometry(0.05, 8, 6), std('#22150b'), Math.cos(a) * 0.1, 0.33, Math.sin(a) * 0.1, g, false);
  }
  return g;
}
const markerGeo = new THREE.RingGeometry(0.62, 0.8, 36);
const markerFill = new THREE.CircleGeometry(0.62, 36);
const MARKER_COLOR = { mango: '#fff1a8', gold: '#ffe066', coco: '#e63946' };

let items = [];
function spawn(type) {
  const p = randomSpot(type === 'coco' && Math.random() < 0.45 ? 2.6 : 0);
  const mesh = FRUIT[type].clone();
  mesh.position.set(p.x, DROP_HEIGHT, p.z);
  mesh.rotation.y = Math.random() * 6;
  scene.add(mesh);
  const marker = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR[type], transparent: true, opacity: 0.2, depthWrite: false });
  const fillMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR[type], transparent: true, opacity: 0.08, depthWrite: false });
  marker.add(new THREE.Mesh(markerGeo, ringMat), new THREE.Mesh(markerFill, fillMat));
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(p.x, 0.03, p.z);
  scene.add(marker);
  items.push({ type, mesh, marker, ringMat, fillMat, x: p.x, z: p.z, vy: 0, state: 'fall', life: 0, spin: (Math.random() - 0.5) * 6 });
}
function randomSpot(nearPlayer) {
  for (let tries = 0; tries < 20; tries++) {
    let x, z;
    if (nearPlayer) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * nearPlayer;
      x = player.pos.x + Math.cos(a) * r; z = player.pos.z + Math.sin(a) * r;
    } else {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (ARENA_R - 0.4);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    if (Math.hypot(x, z) > ARENA_R - 0.2) continue;
    if (items.some((it) => it.state === 'fall' && Math.hypot(it.x - x, it.z - z) < 1.3)) continue;
    return { x, z };
  }
  return { x: 0, z: 0 };
}
function removeItem(it) {
  scene.remove(it.mesh, it.marker);
  it.ringMat.dispose();
  it.fillMat.dispose();
  it.dead = true;
}

// ------------------------------------------------------------------ particles
const particles = [];
const partGeo = new THREE.IcosahedronGeometry(0.07, 0);
function burst(pos, color, n = 14, power = 4) {
  const material = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, material);
    m.position.copy(pos);
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    particles.push({ m, material, v: new THREE.Vector3(Math.cos(a) * power * Math.random(), 2 + Math.random() * power, Math.sin(a) * power * Math.random()), life: 0.6 + Math.random() * 0.3 });
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.v.y -= 14 * dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.multiplyScalar(0.5); }
    p.m.scale.setScalar(Math.max(0.01, p.life * 1.4));
    if (p.life <= 0) scene.remove(p.m);
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
}

// ------------------------------------------------------------------ sound (tiny synth, no files)
let actx = null;
let muted = false;
try { muted = localStorage.getItem('mango-rush-muted') === '1'; } catch {}
ui.mute.classList.toggle('off', muted);
function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0) {
  if (muted) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {}
}
const sfx = {
  catch: (combo) => tone(520 + combo * 70, 0.12, 'triangle', 0.16, 300),
  gold: () => { tone(880, 0.1, 'triangle', 0.15); setTimeout(() => tone(1320, 0.18, 'triangle', 0.15), 70); },
  thud: () => tone(120, 0.18, 'sine', 0.25, -60),
  hurt: () => tone(220, 0.35, 'sawtooth', 0.12, -150),
  dash: () => tone(300, 0.12, 'sine', 0.08, 500),
  over: () => { tone(392, 0.2, 'triangle', 0.15); setTimeout(() => tone(262, 0.4, 'triangle', 0.15), 180); },
};
ui.mute.addEventListener('click', () => {
  muted = !muted;
  ui.mute.classList.toggle('off', muted);
  try { localStorage.setItem('mango-rush-muted', muted ? '1' : '0'); } catch {}
});

// ------------------------------------------------------------------ player
const player = {
  info: null,          // { signedIn, id, name, style } from start.ng
  key: '',
  model: null,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  facing: 0,
  dashT: 0,
  dashCool: 0,
  invuln: 0,
};

function setPlayer(info) {
  player.info = info;
  player.key = styleKey(info);
  if (player.model) { scene.remove(player.model); disposeCharacter(player.model); }
  player.model = buildCharacter(info.style, info.name);
  player.model.position.copy(player.pos);
  scene.add(player.model);
  renderStartCard();
  ui.hudName.textContent = info.name;
  ui.hudDot.style.background = info.style.primaryColor;
}

function renderStartCard() {
  const { signedIn, name, style: s } = player.info;
  ui.greet.textContent = '';
  if (signedIn) {
    ui.greet.append(`Hi ${name}! This is your start.ng look.`);
    const small = document.createElement('small');
    small.textContent = 'Change it on start.ng, then come back. This page picks it up automatically.';
    ui.greet.append(small);
  } else {
    ui.greet.append('Playing as a guest.');
    const small = document.createElement('small');
    const a = document.createElement('a');
    a.href = 'https://start.ng';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Sign in on start.ng';
    small.append(a, ' to play as your own character.');
    ui.greet.append(small);
  }
  const chips = [
    [s.body, null],
    ['skin', s.skinColor],
    [s.hair === 'bald' ? 'bald' : s.hair + ' hair', s.hair === 'bald' ? null : s.hairColor],
    ['top', s.primaryColor],
    ['bottoms', s.secondaryColor],
  ];
  if (s.hat && s.hat !== 'none') chips.push([s.hat, null]);
  if (s.accessory && s.accessory !== 'none') chips.push([s.accessory, null]);
  ui.look.textContent = '';
  for (const [label, color] of chips) {
    const li = document.createElement('li');
    if (color) {
      const i = document.createElement('i');
      i.style.background = color;
      li.append(i);
    } else {
      li.style.paddingLeft = '10px';
    }
    li.append(label);
    ui.look.append(li);
  }
  ui.play.disabled = false;
}

// Re-read the central style when the player returns to this tab
async function refreshPlayer() {
  if (game.state === 'play') return;
  const info = await getPlayer();
  if (styleKey(info) !== player.key) setPlayer(info);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPlayer(); });
window.addEventListener('focus', refreshPlayer);

// ------------------------------------------------------------------ game state
const game = {
  state: 'menu', // menu | play | over
  time: 0,
  score: 0,
  hearts: MAX_HEARTS,
  combo: 1,
  bestCombo: 1,
  lastCatch: -99,
  mangoes: 0,
  spawnT: 0,
  shake: 0,
  overT: 0,
};

function bestKey() { return `mango-rush-best-${player.info?.id ?? 'guest'}`; }
function getBest() { try { return Number(localStorage.getItem(bestKey())) || 0; } catch { return 0; } }
function setBest(v) { try { localStorage.setItem(bestKey(), String(v)); } catch {} }

function startGame() {
  for (const it of items) removeItem(it);
  items = [];
  Object.assign(game, { state: 'play', time: 0, score: 0, hearts: MAX_HEARTS, combo: 1, bestCombo: 1, lastCatch: -99, mangoes: 0, spawnT: 0.6, shake: 0 });
  player.pos.set(0, 0, 0);
  player.vel.set(0, 0, 0);
  player.facing = 0;
  player.invuln = 0;
  player.dashT = 0;
  player.dashCool = 0;
  ui.start.hidden = true;
  ui.over.hidden = true;
  ui.hud.hidden = false;
  ui.dash.hidden = !isTouch;
  drawHearts();
  updateHud();
  tone(660, 0.1, 'triangle', 0.1);
}

function endGame() {
  game.state = 'over';
  game.overT = 0;
  sfx.over();
  const best = getBest();
  const isBest = game.score > best;
  if (isBest) setBest(game.score);
  ui.finalScore.textContent = game.score;
  ui.finalMangoes.textContent = game.mangoes;
  ui.finalCombo.textContent = '×' + game.bestCombo;
  ui.finalBest.textContent = Math.max(best, game.score);
  ui.overKicker.textContent = isBest ? 'New best! 🥭' : pick(['Bonk. Coconut got you.', 'Coconuts: 1, you: 0.', 'That one had your name on it.']);
  ui.overKicker.classList.toggle('new-best', isBest);
  ui.dash.hidden = true;
  ui.joy.hidden = true;
  setTimeout(() => { ui.over.hidden = false; ui.again.focus(); }, 650);
}

function toMenu() {
  for (const it of items) removeItem(it);
  items = [];
  game.state = 'menu';
  player.pos.set(0, 0, 0);
  ui.over.hidden = true;
  ui.hud.hidden = true;
  ui.start.hidden = false;
  refreshPlayer();
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const HEART_SVG = '<svg class="heart" viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="#e63946" stroke="#1a1410" stroke-width="2" stroke-linejoin="round"/></svg>';
function drawHearts() {
  ui.hearts.innerHTML = HEART_SVG.repeat(MAX_HEARTS);
  [...ui.hearts.children].forEach((h, i) => h.classList.toggle('lost', i >= game.hearts));
}
function updateHud() {
  ui.score.textContent = game.score;
  ui.combo.textContent = '×' + game.combo;
  ui.comboBox.classList.toggle('hot', game.combo >= 3);
}

// ------------------------------------------------------------------ floating text
const projV = new THREE.Vector3();
function floatText(pos, text, cls = '') {
  projV.copy(pos).project(camera);
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  el.style.left = ((projV.x + 1) / 2) * innerWidth + 'px';
  el.style.top = ((1 - projV.y) / 2) * innerHeight + 'px';
  ui.floaters.append(el);
  setTimeout(() => el.remove(), 950);
}

// ------------------------------------------------------------------ input
const keys = new Set();
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if ((k === 'enter' || k === ' ') && game.state === 'menu' && !ui.play.disabled) startGame();
  else if ((k === 'enter' || k === ' ') && game.state === 'over' && !ui.over.hidden) startGame();
  else if (k === ' ' && game.state === 'play') tryDash();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (game.state !== 'play' || stick.active) return;
  stick.active = true;
  stick.id = e.pointerId;
  stick.ox = e.clientX;
  stick.oy = e.clientY;
  stick.x = stick.y = 0;
  ui.joy.style.left = e.clientX + 'px';
  ui.joy.style.top = e.clientY + 'px';
  ui.knob.style.transform = '';
  ui.joy.hidden = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!stick.active || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
  const len = Math.hypot(dx, dy), max = 50;
  if (len > max) { dx *= max / len; dy *= max / len; }
  stick.x = dx / max;
  stick.y = dy / max;
  ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
});
const endStick = (e) => {
  if (e.pointerId !== stick.id) return;
  stick.active = false;
  stick.x = stick.y = 0;
  ui.joy.hidden = true;
};
canvas.addEventListener('pointerup', endStick);
canvas.addEventListener('pointercancel', endStick);
ui.dash.addEventListener('pointerdown', (e) => { e.preventDefault(); tryDash(); });

function tryDash() {
  if (player.dashCool > 0) return;
  player.dashT = 0.17;
  player.dashCool = 1.1;
  sfx.dash();
  burst(player.pos.clone().setY(0.15), '#f2e6c9', 8, 2);
}

ui.play.addEventListener('click', startGame);
ui.again.addEventListener('click', startGame);
ui.menu.addEventListener('click', toMenu);

// ------------------------------------------------------------------ update
const tmp = new THREE.Vector3();
function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (keys.has('w') || keys.has('arrowup')) iz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iz += 1;
  ix += stick.x;
  iz += stick.y;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }

  player.dashT = Math.max(0, player.dashT - dt);
  player.dashCool = Math.max(0, player.dashCool - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  ui.dash.classList.toggle('cool', player.dashCool > 0);

  const speed = player.dashT > 0 ? 15 : 6.4;
  let dirX = ix, dirZ = iz;
  if (player.dashT > 0 && len < 0.1) { dirX = Math.sin(player.facing); dirZ = Math.cos(player.facing); }
  const k = 1 - Math.exp(-(player.dashT > 0 ? 30 : 14) * dt);
  player.vel.x += (dirX * speed - player.vel.x) * k;
  player.vel.z += (dirZ * speed - player.vel.z) * k;
  player.pos.addScaledVector(player.vel, dt);

  const r = Math.hypot(player.pos.x, player.pos.z);
  if (r > ARENA_R) { player.pos.x *= ARENA_R / r; player.pos.z *= ARENA_R / r; }

  const moving = Math.hypot(player.vel.x, player.vel.z);
  if (moving > 0.3) {
    const target = Math.atan2(player.vel.x, player.vel.z);
    let d = target - player.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.facing += d * (1 - Math.exp(-14 * dt));
  }
  player.model.position.copy(player.pos);
  player.model.rotation.y = player.facing;
  animateCharacter(player.model, dt, Math.min(1, moving / 6.4), game.time);
  // blink while invulnerable
  player.model.visible = player.invuln <= 0 || Math.floor(player.invuln * 12) % 2 === 0;
}

function updateSpawner(dt) {
  game.spawnT -= dt;
  if (game.spawnT > 0) return;
  const t = game.time;
  game.spawnT = Math.max(0.3, 1.05 - t * 0.011) * (0.75 + Math.random() * 0.5);
  const cocoChance = Math.min(0.5, 0.2 + t * 0.006);
  const roll = Math.random();
  if (roll < cocoChance) {
    spawn('coco');
    if (t > 35 && Math.random() < 0.25) { spawn('coco'); spawn('coco'); } // volley
  } else if (roll < cocoChance + 0.07) {
    spawn('gold');
  } else {
    spawn('mango');
  }
}

function gravity() { return Math.min(20, 11 + game.time * 0.08); }

function updateItems(dt) {
  const g = gravity();
  for (const it of items) {
    const dist = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
    const fruit = it.type !== 'coco';
    if (it.state === 'fall') {
      it.vy += g * dt;
      it.mesh.position.y -= it.vy * dt;
      it.mesh.rotation.y += it.spin * dt;
      it.mesh.rotation.x += it.spin * 0.5 * dt;
      const progress = 1 - it.mesh.position.y / DROP_HEIGHT;
      it.ringMat.opacity = 0.2 + 0.7 * progress;
      it.fillMat.opacity = 0.06 + 0.3 * progress;
      it.marker.scale.setScalar(1.35 - 0.45 * progress);
      const ground = fruit ? 0.27 : 0.33;
      if (fruit && game.state === 'play' && dist < CATCH_R && it.mesh.position.y < 2.4) { collect(it); continue; }
      if (it.mesh.position.y <= ground) {
        it.mesh.position.y = ground;
        it.state = 'ground';
        it.vy = -2.2; // little bounce
        it.mesh.rotation.set(0, it.mesh.rotation.y, 0);
        it.marker.visible = false;
        if (fruit) {
          it.life = 5;
        } else {
          it.life = 0.9;
          sfx.thud();
          burst(it.mesh.position.clone().setY(0.1), '#c9a26b', 10, 3);
          game.shake = Math.max(game.shake, 0.12);
          if (game.state === 'play' && dist < HIT_R && player.invuln <= 0) hurt(it);
        }
      }
    } else {
      // on the ground
      it.life -= dt;
      if (it.vy < 0) {
        it.mesh.position.y -= it.vy * dt;
        it.vy += 14 * dt;
        if (it.vy >= 0) it.vy = 0;
      } else if (it.mesh.position.y > (fruit ? 0.27 : 0.33)) {
        it.mesh.position.y = Math.max(fruit ? 0.27 : 0.33, it.mesh.position.y - 3 * dt);
      }
      if (fruit) {
        if (game.state === 'play' && dist < CATCH_R - 0.1) { collect(it); continue; }
        it.mesh.visible = it.life > 1.5 || Math.floor(it.life * 8) % 2 === 0;
        it.mesh.rotation.y += dt * 1.5;
      } else {
        if (it.life < 0.4) it.mesh.position.y -= dt * 1.5; // sink into the grass
      }
      if (it.life <= 0) removeItem(it);
    }
  }
  items = items.filter((it) => !it.dead);
}

function collect(it) {
  const now = game.time;
  game.combo = now - game.lastCatch < COMBO_WINDOW ? Math.min(game.combo + 1, 8) : 1;
  game.lastCatch = now;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const base = it.type === 'gold' ? 5 : 1;
  const pts = base * game.combo;
  game.score += pts;
  game.mangoes += 1;
  const at = it.mesh.position.clone().setY(Math.max(1.2, it.mesh.position.y));
  if (it.type === 'gold') {
    sfx.gold();
    burst(at, '#ffe066', 22, 5);
    floatText(at, `+${pts} GOLD`, 'gold');
  } else {
    sfx.catch(game.combo);
    burst(at, '#ffb627', 12, 3.5);
    floatText(at, game.combo > 1 ? `+${pts} ×${game.combo}` : `+${pts}`);
  }
  removeItem(it);
  updateHud();
}

function hurt(it) {
  game.hearts -= 1;
  player.invuln = 1.6;
  game.shake = 0.45;
  game.combo = 1;
  sfx.hurt();
  ui.flash.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => ui.flash.classList.remove('on')));
  floatText(player.pos.clone().setY(2.6), 'BONK!', 'bad');
  if (navigator.vibrate) navigator.vibrate(120);
  drawHearts();
  updateHud();
  if (game.hearts <= 0) endGame();
}

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(0, 6, 14);
const camLook = new THREE.Vector3();
function updateCamera(dt, time) {
  const portrait = camera.aspect < 0.85;
  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  if (game.state === 'menu') {
    // close-up of your character; on desktop it sits right of the menu card
    if (portrait) {
      desiredPos.set(0, 1.6, 7.6);
      desiredLook.set(0, -0.8, 0);
    } else {
      desiredPos.set(-1.4, 2.0, 5.5);
      desiredLook.set(-2.1, 1.2, 0);
    }
    player.model.position.set(0, 0, 0);
    player.model.rotation.y = Math.sin(time * 0.6) * 0.7;
    animateCharacter(player.model, 0.016, 0, time);
  } else {
    const back = portrait ? 12.5 : 9.2;
    const up = portrait ? 14.5 : 10.2;
    desiredPos.set(player.pos.x * 0.85, up, player.pos.z * 0.85 + back);
    desiredLook.set(player.pos.x * 0.92, 0.4, player.pos.z * 0.92 - 0.6);
  }
  const k = 1 - Math.exp(-(game.state === 'menu' ? 3 : 6) * dt);
  camPos.lerp(desiredPos, k);
  camLook.lerp(desiredLook, k);
  camera.position.copy(camPos);
  if (game.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * game.shake;
    camera.position.y += (Math.random() - 0.5) * game.shake;
    game.shake = Math.max(0, game.shake - dt * 1.4);
  }
  camera.lookAt(camLook);
}

// ------------------------------------------------------------------ loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.85 ? 58 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  if (player.model) {
    if (game.state === 'play') {
      game.time += dt;
      if (game.combo > 1 && game.time - game.lastCatch > COMBO_WINDOW) { game.combo = 1; updateHud(); }
      updatePlayer(dt);
      updateSpawner(dt);
    } else if (game.state === 'over') {
      animateCharacter(player.model, dt, 0, elapsed);
      player.model.visible = true;
    }
    updateItems(dt);
    updateCamera(dt, elapsed);
  }
  updateParticles(dt);
  for (const c of clouds) { c.position.x += c.userData.drift * dt; if (c.position.x > 70) c.position.x = -70; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
(async function boot() {
  requestAnimationFrame(frame);
  if (document.fonts?.load) await Promise.race([document.fonts.load('800 52px "Bricolage Grotesque"'), new Promise((r) => setTimeout(r, 1200))]);
  setPlayer(await getPlayer());
})();

// handy for testing in the console: window.__mango.setStyle({ hat: 'crown' })
window.__mango = {
  setStyle(partial) { setPlayer({ ...player.info, style: { ...player.info.style, ...partial } }); },
  get state() { return { ...game, items: items.length }; },
  end() { if (game.state === 'play') { game.hearts = 1; hurt(); } },
};
