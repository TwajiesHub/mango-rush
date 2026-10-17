// Mango Rush — falling items, warning rings, catching and landing.   OWNER: Claude Code  ·  STATUS: step 5a (rules part 1)
//
// CONTRACT:
//   initDrops(parent)   parent = barge.deckRoot(): the drops move with the deck. Coordinates are deck-local.
//   resetDrops(rng) ; updateDrops(dt) ; clearDrops() ; getDrops() (read only, for the ?debug bot)
//   forceDrop(type, x, z, warn, kind) -> void   a drop at a fixed spot, no rng, and it never touches the schedule (warm-up, ?debug keys).
//        type: 'mango' | 'golden' | 'coconut' | 'rotten' | 'shield'
//        kind (coconuts only): 'normal' (default) | 'slow' | 'fast' | 'drifter' | 'late'.  warn omitted = that kind's own warning time.
//   setRingTell(id, tell) -> void         change a live drop's warning ring without any rebuild (the per-kind tells use it)
//        tell = { spacing (dots per ring x this, default 1), dotSize (x, default 1.25), pulse (Hz, default 0), pulseAmt (0..1),
//                 inner (0|1 draw the inner ring), lock (0..1 the centre dot grows solid), cPulse (Hz, the centre dot pulses),
//                 trailX, trailZ (the dots trail behind a slide, in ring units) }
//   getDropLog() -> array                 the raw rng values of the first 20 spawn events of this run
//   getDropDebug() -> object              phase, wave, bag, kinds seen, mercy state (the ?debug panel)
//   getDrops() items: { type, kind, x, z, age, warn, landed, locked }   x, z = the ring NOW (it moves until locked, never after)
//
// THE LOOK. Each item is ONE toon mesh with its merged umber outline (a second draw call), pooled. Mango: a tilted saffron oval
// (1.25 : 1, leaning 15 degrees) with a vermilion blush on its upper side, a green leaf and a stem. Golden: the same, brighter gold and
// larger, with a twinkling cream sparkle (two crossed stars). Coconut: dark faceted sphere with three dark eyes. Rotten: brown with
// dark blotches and flies orbiting slowly. Shield: a woven calabash.
// The warning ring is a DOT RING drawn by a small shader on a flat unlit quad (concentric rings of round dots): mango = gold dots with
// a cream inner ring; golden = larger and glowing; coconut = vermilion dots with a dark dotted CROSS (a shape, so it says danger
// without colour). Each pooled drop has its own uniforms, so spacing, size and pulse can change live (setRingTell).
// HONEST RINGS: the ring CLOSES IN from 1.6x to 1.0x of its final size over the real fall, so the ring is the timer. At impact its
// outer dots sit exactly at the radius that counts: CONFIG.hitRadius for a coconut, CONFIG.catchRadius for a fruit.
// The blob shadow under an item shrinks and darkens as it falls, so the landing spot is readable.
//
// COCONUT KINDS (CONFIG.coconuts). Every kind has a tell and locks its landing spot at least CONFIG.coconuts.minLock before impact;
// the hit / near-miss / Perfect dodge checks use the locked point.
//   normal   as before.                     slow  hangs at the top, wobbling, then falls: ~1.6 s warning, wide dots.
//   fast     ~0.45 s warning, tight dots pulsing fast (the one exception to minWarn).
//   drifter  the spot slides up to 1.5 units (the wind), dots trail behind it, then locks minLock before impact.
//   late     the ring trails the player by 0.4 s (never leads), a centre dot pulses; locks 0.4 s before impact (centre snaps solid).
// Kinds come from a SHUFFLE BAG per phase (core/bag.js). At most one late-lock is live at a time. The first time a kind appears in a run
// it falls alone (nothing else lands within CONFIG.coconuts.aloneFor s). Mercy: for 1.5 s after a hit no coconut targets or locks onto a
// point within 1.2 units of where the player stood; it is pushed outward along the same angle and clamped inside the deck.
// PERFECT DODGE: a dash that began within CONFIG.perfectDodgeWindow of the impact, from inside the hit radius, that ends outside it:
// coconutLanded({ perfect: true }) and the dash refills.
//
// PACING. waveAt(t) (core/config.js) gives the wave: the gap tightens and the coconut share rises over each wave, then a breather
// (wider gap, half the coconut share, one golden mango from dusk). Every run has one golden mango at an rng-chosen time in 8..14 s.
// From dusk the non-coconut draws also give rotten mangoes (CONFIG.rottenChance) and the calabash shield (CONFIG.shieldChance).
//
// DAILY RUN RULE: every random DROP decision comes from the rng given to resetDrops(), and the rng is drawn the same number of times in
// the same order whatever the player does. The schedule is kept on its own clock (`nextAt`, run seconds), so frame rate and pauses do
// not matter either; nothing player-dependent (where the player stands, what was caught) ever changes a draw or the schedule. Looks
// (spin, particles) use Math.random().
//   At reset:   1 earlyAt (the golden mango's time in 8..14 s), then CONFIG.plank.picks (40) numbers for the golden plank (play/plank.js: all
//               pre-drawn here, so the draw order never depends on time or on the player)
// One spawn event draws, in this order (always all eight):
//   1 gap   2 type   3 angle   4 radius   5 aim   6 volley   7 drift angle   8 drift distance
//   + 3 more per extra coconut of a volley: aim, angle, radius
//   + the bag refill: when the bag is empty or the phase changed, a coconut deal first shuffles the bag: (n - 1) draws per attempt, and it
//     reshuffles while a run of one type would be longer than CONFIG.coconuts.maxRun (the refill depends on the schedule and the rng only)
//   gap    -> delay until the next event = dropGap(at nextAt) / wave x lerp(gapJitter, gap)  (x 1.6 in a breather)
//   type   -> coconut if < the wave's coconut share; otherwise golden / rotten / shield / mango by the remainder
//             (the first event after earlyAt is golden, and so is the first event of each breather from dusk, whatever the roll)
//   angle, radius -> where it lands: uniform on the deck, or (aim < aimChance, coconuts only) near the player
//   volley -> a coconut with volley < volleyChance (after volleyFromT) brings two more coconuts (always normal ones)
//   drift  -> only a drifter uses 7 and 8: the slide direction and distance (they are drawn for every event, used or not)
// Hold: an event that would break "a first appearance falls alone" waits (on the schedule clock) until it is clear; the draws are
// already made, so the order never changes.
// Fall time equals the warning time, so the ring is always honest. Pooled: no allocation per frame.
// Catching calls scoring.fruitCaught(); landing calls scoring.coconutLanded().
// STEP 5b: a catch passes { dashing, onPlank } (a Swoop / the golden plank); a landed mango or golden mango that rots away uncaught leaves a
// juice patch (barge.addJuicePatch); the ring shader now lives in world/rings.js (also used by the bank spots).

import * as THREE from 'three';
import { CONFIG, difficultyAt, waveAt, phaseAt } from '../core/config.js';
import { createDealer } from '../core/bag.js';
import { state } from '../core/state.js';
import { EVENTS, on, emit } from '../core/events.js';
import { fruitCaught, coconutLanded } from './scoring.js';
import { getPlayer, playerAt, refillDash } from './player.js';
import { resetPlank, onPlank } from './plank.js';
import { deckBounds, addJuicePatch, clearJuicePatches, updateJuicePatches } from '../world/barge.js';
import { burst } from '../fx/juice.js';
import { ringGeo, makeRingMaterial, RING_OUTER, tickRings } from '../world/rings.js';
import { toon, toonTextured, tintableClone, blobShadow, blobMaterial, bakeToon, mergeMeshes, flat } from '../world/materials.js';

const D = CONFIG.drops;
const C = CONFIG.coconuts;
const W = CONFIG.waves;
const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');
const GROUND = { mango: 0.27, golden: 0.31, rotten: 0.27, coconut: 0.33, shield: 0.3 };
const ITEM_SCALE = 1.3;   // items are drawn a little larger than their 0.3 model radius: they must read at play distance
const RING_DOT = 1.25;    // the default dot size of a warning ring (the tell hook scales it)
const CLOSE_IN = 1.6;     // a ring starts this many times its final size and closes in to 1.0x at impact
// RING_OUTER (world/rings.js): the radius of each ring's outermost dots: the final scale puts them exactly on the radius that counts
const ringFinal = (type) => (type === 'coconut' ? CONFIG.hitRadius : CONFIG.catchRadius) / RING_OUTER[type];
const LEAN = 0.26;        // the mango leans about 15 degrees
const WHITE = new THREE.Color(0xffffff);
const ROT_TINT = new THREE.Color('#8a6a4c');   // multiplies the painted colours: a landed mango goes browner and darker

let scene = null;
let rng = null;
let nextAt = 0;
let nextId = 1;
let clearRequested = false;
let inUpdate = false;
let dropLog = [];
const items = [];
const free = { mango: [], golden: [], coconut: [], rotten: [], shield: [] };

// ---------------------------------------------------------------- item models: parts -> ONE toon mesh + merged outline
const mangoGeo = new THREE.SphereGeometry(0.3, 18, 12);
const blushGeo = new THREE.SphereGeometry(0.2, 12, 9);
const stemGeo = new THREE.CylinderGeometry(0.02, 0.026, 0.12, 6);
const leafGeo = new THREE.SphereGeometry(0.11, 8, 6);
const cocoGeo = new THREE.IcosahedronGeometry(0.36, 1);
const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
const spotGeo = new THREE.SphereGeometry(0.06, 8, 6);
const flyGeo = new THREE.SphereGeometry(0.034, 6, 5);
const calabashGeo = new THREE.SphereGeometry(0.26, 14, 10);
const neckGeo = new THREE.SphereGeometry(0.15, 12, 8);
for (const g of [mangoGeo, blushGeo, stemGeo, leafGeo, cocoGeo, eyeGeo, spotGeo, flyGeo, calabashGeo, neckGeo, ringGeo]) g.userData.shared = true;

function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// a 4-point star (two of them crossed) for the golden mango's sparkle
function starGeometry() {
  const s = new THREE.Shape();
  const R = 0.2;
  const r = 0.045;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    if (i === 0) s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

let hatchTex = null;
function calabashTexture() {
  if (!hatchTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#C9A66B';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#8A6A3A';
    g.lineWidth = 3;
    for (let i = -64; i < 128; i += 12) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();      // the weave: a cross-hatch
      g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
    }
    hatchTex = new THREE.CanvasTexture(c);
    hatchTex.colorSpace = THREE.SRGBColorSpace;
    hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping;
  }
  return hatchTex;
}

// returns { mesh, extras }: extras = { sparkle, flies } when the model has them
function makeBody(type) {
  const g = new THREE.Group();
  const extras = {};
  let flatShading = false;
  let material = null;
  if (type === 'coconut') {
    flatShading = true;
    part(cocoGeo, toon('#5B3A1F', { flatShading: true }), 0, 0, 0, g);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(eyeGeo, toon('#22150B', { flatShading: true }), Math.cos(a) * 0.1, 0.33, Math.sin(a) * 0.1, g);
    }
  } else if (type === 'shield') {
    material = toonTextured(calabashTexture());
    part(calabashGeo, toon('#C9A66B'), 0, 0, 0, g).scale.set(1, 0.95, 1);
    part(neckGeo, toon('#C9A66B'), 0, 0.27, 0, g).scale.set(0.9, 1, 0.9);
  } else {
    const gold = type === 'golden';
    const rotten = type === 'rotten';
    const k = gold ? 1.15 : 1;
    const bodyColor = gold ? '#FFD84D' : rotten ? '#6B4A2B' : '#F2A93B';
    // a tilted oval (about 1.25 : 1, leaning LEAN), not a round apple: every part is rotated about the centre by the lean
    const c = Math.cos(LEAN);
    const sn = Math.sin(LEAN);
    const lean = (m) => { const x = m.position.x; const y = m.position.y; m.position.x = x * c - y * sn; m.position.y = x * sn + y * c; m.rotation.z += LEAN; return m; };
    lean(part(mangoGeo, toon(bodyColor), 0, 0, 0, g)).scale.set(0.8 * k, 1 * k, 0.78 * k);
    // the vermilion blush sits on the upper side (the cap seen from the camera)
    if (!gold && !rotten) lean(part(blushGeo, toon('#E4573D'), 0.09, 0.17, 0.09, g)).scale.set(0.8, 0.8, 0.6);
    if (rotten) {
      for (const [x, y, z, s] of [[0.1, 0.05, 0.15, 1.3], [-0.12, -0.08, 0.14, 1], [0.06, -0.12, -0.15, 1.1], [-0.1, 0.12, -0.12, 0.9]]) lean(part(spotGeo, toon('#3E2A18'), x, y, z, g)).scale.set(s, s * 0.7, s);
    }
    lean(part(stemGeo, toon('#5A3D22'), 0, 0.33 * k, 0, g));
    const leaf = lean(part(leafGeo, toon(rotten ? '#5A4A2B' : '#0F3D2E'), 0.09, 0.36 * k, 0, g));
    leaf.scale.set(1.4, 0.25, 0.6);
    leaf.rotation.z += 0.5;
  }
  const mesh = bakeToon(g, g.children.slice(), { outline: 0.03, flatShading, material });
  if (type === 'golden') {
    // two crossed cream stars that twinkle: ONE small extra mesh
    const holder = new THREE.Group();
    const a = new THREE.Mesh(starGeometry(), flat('#FFF1D6'));
    const b = new THREE.Mesh(starGeometry(), flat('#FFF1D6'));
    b.rotation.y = Math.PI / 2;
    holder.add(a, b);
    const spark = mergeMeshes(holder, [a, b], flat('#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
    spark.position.set(0.26, 0.34, 0.1);
    mesh.add(spark);
    extras.sparkle = spark;
  }
  if (type === 'rotten') {
    // tiny dark flies orbiting slowly: one small mesh that turns
    const holder = new THREE.Group();
    const flies = [];
    for (const [x, y, z] of [[0.46, 0.34, 0], [-0.3, 0.46, 0.3], [-0.18, 0.28, -0.4]]) flies.push(part(flyGeo, toon('#1A120C'), x, y, z, holder));
    const orbit = mergeMeshes(holder, flies, toon('#ffffff'));
    orbit.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    mesh.add(orbit);
    extras.flies = orbit;
  }
  return { mesh, extras };
}

function makeSlot(type) {
  const { mesh, extras } = makeBody(type);
  mesh.material = tintableClone(mesh.material);       // a private copy: the rot animation tints it
  const ringMat = makeRingMaterial(type);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 0;
  const shadowMat = blobMaterial().clone();             // a private copy: it darkens as the item falls
  shadowMat.userData.shared = false;
  const shadow = blobShadow(0.5, 0.5, shadowMat);
  mesh.visible = false;
  ring.visible = false;
  shadow.visible = false;
  scene.add(mesh, ring, shadow);
  return {
    type, kind: 'normal', id: 0, mesh, marker: ring, ringMat, shadow, shadowMat, bodyMat: mesh.material,
    sparkle: extras.sparkle || null, flies: extras.flies || null, t: Math.random() * 6,
    x: 0, z: 0, y: 0, age: 0, warn: 1, v0: 0, g: 0, landed: false, life: 0, spin: 0, caught: false,
    locked: true, lockAge: 0, fallStart: 0, yStart: 0, hangUntil: 0, ex: 0, ez: 0, dirX: 0, dirZ: 0, final: 1,
  };
}

export function initDrops(s) {
  scene = s;
  for (const [type, n] of [['mango', 20], ['golden', 4], ['coconut', 20], ['rotten', 2], ['shield', 2]]) {
    for (let i = 0; i < n; i++) free[type].push(makeSlot(type));
  }
}

// ---------------------------------------------------------------- the schedule's own state (run seconds; nothing here depends on the player)
let dealer = null;
let earlyAt = 0;
let earlyDone = false;
let breatherGiven = -1;
let holdLandAfter = 0;      // nothing may land before this (the 2 s after a first appearance)
let landBusyUntil = 0;      // the latest scheduled landing so far
let lateLiveUntil = 0;      // a late-lock coconut is live until this
let pending = null;         // an event that has drawn its numbers and waits for a clear moment
const seen = { normal: false, slow: false, fast: false, drifter: false, late: false };
const ev = {                // the one reusable event record (no allocation per spawn)
  gap: 0, type: 'mango', kind: 'normal', angle: 0, radius: 0, aim: false, volley: false, vAim: [0, 0], vAngle: [0, 0], vRadius: [0, 0],
  driftA: 0, driftD: 0, warn: 1, ready: 0, next: 0, first: false, n: 0,
};
let mercyUntil = -1;
let mercyX = 0;
let mercyZ = 0;

const phaseStart = (id) => CONFIG.phases.find((p) => p.id === id)?.t ?? 0;

// the kind's own warning time (the difficulty table decides for a normal coconut)
function warnFor(kind, base) {
  if (kind === 'slow') return C.slow.warn;
  if (kind === 'fast') return C.fast.warn;
  if (kind === 'drifter') return Math.max(base, C.drifter.minWarn);
  if (kind === 'late') return Math.max(base, C.late.minWarn);
  return base;
}

// ---------------------------------------------------------------- spawning
function acquire(type) {
  return free[type].pop() || makeSlot(type);
}

function release(it) {
  it.mesh.visible = false;
  it.marker.visible = false;
  it.shadow.visible = false;
  free[it.type].push(it);
}

// keep a point inside the walkable ellipse
function clampDeck(p) {
  const b = deckBounds();
  const e = Math.hypot(p.x / (b.halfWidth - 0.2), p.z / (b.halfDepth - 0.2));
  if (e > 1) { p.x /= e; p.z /= e; }
}

// MERCY: after a hit, no coconut may target or lock onto a point within C.mercy.radius of where the player stood. Push it outward
// along the same angle (no rng), then clamp to the deck; if the rim pulls it back inside, turn 60 degrees and try again.
function applyMercy(p) {
  if (state.time >= mercyUntil) return;
  const R = C.mercy.radius;
  const dx = p.x - mercyX;
  const dz = p.z - mercyZ;
  if (Math.hypot(dx, dz) >= R) return;
  let a = Math.hypot(dx, dz) > 0.001 ? Math.atan2(dz, dx) : 0;
  for (let i = 0; i < 6; i++) {
    p.x = mercyX + Math.cos(a) * (R + 0.05);
    p.z = mercyZ + Math.sin(a) * (R + 0.05);
    clampDeck(p);
    if (Math.hypot(p.x - mercyX, p.z - mercyZ) >= R) return;
    a += 1.0472;
  }
}

function setFall(it, yStart, fromAge) {
  const h = yStart - GROUND[it.type];
  const T = it.warn - fromAge;
  let g = D.gravity;
  let v0 = (h - 0.5 * g * T * T) / T;
  if (v0 < 0) { v0 = 0; g = (2 * h) / (T * T); }
  it.v0 = v0;
  it.g = g;
  it.yStart = yStart;
  it.fallStart = fromAge;
}

const tmp = { x: 0, z: 0 };

function launch(type, x, z, warn, kind = 'normal') {
  const it = acquire(type);
  const ground = GROUND[type];
  it.id = nextId++;
  it.kind = kind;
  it.x = x;
  it.z = z;
  it.warn = warn;
  it.age = 0;
  it.y = D.height;
  it.landed = false;
  it.caught = false;
  it.life = 0;
  it.locked = true;
  it.lockAge = 0;
  it.hangUntil = 0;
  it.spin = (Math.random() - 0.5) * 6;
  if (kind === 'slow') {
    // hangs at the top (wobbling) and only then falls: the fall gets what is left of the warning
    it.hangUntil = Math.min(C.slow.hangUntil, warn - 0.3);
    setFall(it, C.slow.hangY, it.hangUntil);
  } else {
    setFall(it, D.height, 0);
  }
  it.bodyMat.color.set(0xffffff);   // white = as painted
  it.mesh.position.set(x, D.height, z);
  it.mesh.rotation.set(0, Math.random() * 6, 0);
  it.mesh.scale.setScalar(ITEM_SCALE);
  it.mesh.visible = true;
  it.final = ringFinal(type);
  it.marker.position.set(x, 0.03, z);
  it.marker.scale.setScalar(it.final * CLOSE_IN);
  const u = it.ringMat.uniforms;
  u.uOpacity.value = 0.45;
  u.uSpacing.value = 1; u.uDotSize.value = RING_DOT; u.uPulse.value = 0; u.uPulseAmt.value = 0; u.uInner.value = 1; u.uLock.value = 0;
  u.uCPulse.value = 0; u.uTrail.value.set(0, 0);
  it.marker.visible = true;
  it.shadow.position.set(x, 0.012, z);
  it.shadow.scale.set(0.62, 1, 0.62);
  it.shadowMat.opacity = 0.35;
  it.shadow.visible = true;
  items.push(it);

  // the tell: each coconut kind has its own ring look, set through the same hook step 5b / 7 will use
  if (kind === 'slow') setRingTell(it.id, { spacing: C.slow.spacing, dotSize: RING_DOT * C.slow.dotSize });
  else if (kind === 'fast') setRingTell(it.id, { spacing: C.fast.spacing, dotSize: RING_DOT * C.fast.dotSize, pulse: C.fast.pulse, pulseAmt: C.fast.pulseAmt });
  else if (kind === 'late') { it.locked = false; it.lockAge = warn - C.late.lockBefore; setRingTell(it.id, { cPulse: C.late.pulse, lock: 0 }); }
  else if (kind === 'drifter') { it.locked = false; it.lockAge = warn - C.minLock; }

  emit(EVENTS.DROP_SPAWN, { id: it.id, type, kind, x, z, warnTime: warn, fallAt: it.fallStart });
  return it;
}

// a drifter's slide: from where it spawned to (ex, ez), straight, then it locks
function startDrift(it, driftA01, driftD01) {
  const a = driftA01 * Math.PI * 2;
  const dist = C.drifter.drift * (0.35 + 0.65 * driftD01);
  tmp.x = it.x + Math.cos(a) * dist;
  tmp.z = it.z + Math.sin(a) * dist;
  clampDeck(tmp);
  it.ex = tmp.x;
  it.ez = tmp.z;
  const len = Math.hypot(it.ex - it.x, it.ez - it.z) || 1;
  it.dirX = (it.ex - it.x) / len;
  it.dirZ = (it.ez - it.z) / len;
  emit(EVENTS.DRIFT_START, { id: it.id, x: it.x, z: it.z });
}

export function forceDrop(type, x, z, warn, kind = 'normal') {
  if (!scene || !free[type]) return;
  const w = warn ?? (kind === 'normal' ? 1.2 : warnFor(kind, 1.2));
  if (kind === 'late') { playerAt(C.late.lag, tmp); x = tmp.x; z = tmp.z; }
  const it = launch(type, x, z, w, kind);
  if (kind === 'drifter') startDrift(it, Math.random(), Math.random());
}

// the hook for the tells: change a live drop's ring with no rebuild
export function setRingTell(id, tell) {
  for (const it of items) {
    if (it.id !== id) continue;
    const u = it.ringMat.uniforms;
    if (tell.spacing !== undefined) u.uSpacing.value = tell.spacing;
    if (tell.dotSize !== undefined) u.uDotSize.value = tell.dotSize;
    if (tell.pulse !== undefined) u.uPulse.value = tell.pulse;
    if (tell.pulseAmt !== undefined) u.uPulseAmt.value = tell.pulseAmt;
    if (tell.inner !== undefined) u.uInner.value = tell.inner;
    if (tell.lock !== undefined) u.uLock.value = tell.lock;
    if (tell.cPulse !== undefined) u.uCPulse.value = tell.cPulse;
    if (tell.trailX !== undefined || tell.trailZ !== undefined) u.uTrail.value.set(tell.trailX ?? 0, tell.trailZ ?? 0);
    return;
  }
}

// deterministic nudge away from a falling item that is too close (no rng involved)
function separate(pos) {
  for (let tries = 0; tries < 7; tries++) {
    let clash = false;
    for (const it of items) {
      if (!it.landed && Math.hypot(it.x - pos.x, it.z - pos.z) < D.minSeparation) { clash = true; break; }
    }
    if (!clash) return;
    const a = tries * 1.0472 + 0.5;
    const b = deckBounds();
    const nx = pos.x + Math.cos(a) * (D.minSeparation + 0.2);
    const nz = pos.z + Math.sin(a) * (D.minSeparation + 0.2);
    if (Math.hypot(nx / (b.halfWidth - 0.2), nz / (b.halfDepth - 0.2)) <= 1) { pos.x = nx; pos.z = nz; }
  }
}

const spot = { x: 0, z: 0 };
function place(angle01, radius01, aimed) {
  const b = deckBounds();
  const pl = getPlayer();
  if (aimed) {
    const a = angle01 * Math.PI * 2;
    spot.x = pl.x + Math.cos(a) * radius01 * D.aimRadius;
    spot.z = pl.z + Math.sin(a) * radius01 * D.aimRadius;
  } else {
    const a = angle01 * Math.PI * 2;
    const r = Math.sqrt(radius01);
    spot.x = Math.cos(a) * r * (b.halfWidth - D.edgeMargin);
    spot.z = Math.sin(a) * r * (b.halfDepth - D.edgeMargin);
  }
  clampDeck(spot);
  separate(spot);
  return spot;
}

function record(entry) {
  if (dropLog.length >= 20) return;
  dropLog.push(entry);
  if (DEBUG) console.log('[drops]', JSON.stringify(entry));
}

// Draw every number of one spawn event (always all eight, in this order), decide what it is and when it may launch.
function drawEvent() {
  const now = nextAt;
  const d = difficultyAt(now);
  const wv = waveAt(now);
  const uGap = rng.next();
  const uType = rng.next();
  const uAngle = rng.next();
  const uRadius = rng.next();
  const uAim = rng.next();
  const uVolley = rng.next();
  const uDriftA = rng.next();
  const uDriftD = rng.next();

  // the wave: the gap tightens and the coconut share rises along a wave; a breather widens the gap and halves the share
  const gap = (d.dropGap / wv.intensity) * (wv.breather ? W.breatherGap : 1);
  const share = d.coconutShare * wv.intensity * (wv.breather ? W.breatherShare : 1);

  let type = 'mango';
  let aimedOk = true;
  // the guaranteed early win: the first event after earlyAt, or the last one that still fits before the window closes (earlyGolden.to)
  const early = !earlyDone && (now >= earlyAt || now + gap * D.gapJitter[1] > CONFIG.earlyGolden.to);
  if (early) { type = 'golden'; earlyDone = true; aimedOk = false; }
  else if (wv.breather && now >= W.goldenFromT && breatherGiven !== wv.index) { type = 'golden'; breatherGiven = wv.index; }
  else if (uType < share) type = 'coconut';
  else {
    const rest = (uType - share) / (1 - share);
    const g = d.goldenChance;
    const rot = now >= phaseStart(CONFIG.rottenChance.fromPhase) ? CONFIG.rottenChance.chance : 0;
    const shd = now >= phaseStart(CONFIG.shieldChance.fromPhase) ? CONFIG.shieldChance.chance : 0;
    if (rest < g) type = 'golden';
    else if (rest < g + rot) type = 'rotten';
    else if (rest < g + rot + shd) type = 'shield';
  }

  let kind = 'normal';
  if (type === 'coconut') kind = dealer.deal(rng, phaseAt(now), now < lateLiveUntil);

  ev.type = type;
  ev.kind = kind;
  ev.angle = uAngle;
  ev.radius = uRadius;
  ev.aim = type === 'coconut' && aimedOk && uAim < D.aimChance;
  ev.driftA = uDriftA;
  ev.driftD = uDriftD;
  ev.warn = type === 'coconut' ? warnFor(kind, d.warn) : d.warn;
  ev.first = type === 'coconut' && !seen[kind];
  ev.volley = type === 'coconut' && now > D.volleyFromT && uVolley < D.volleyChance;
  ev.n = 0;
  if (ev.volley) {
    for (let i = 0; i < 2; i++) { ev.vAim[i] = rng.next(); ev.vAngle[i] = rng.next(); ev.vRadius[i] = rng.next(); }
  }
  if (ev.first) ev.volley = false;   // (the draws above are already made: a first appearance comes without friends)

  // when may it launch? never so that it lands within aloneFor seconds of a first appearance (before or after it)
  let ready = now;
  const wait = holdLandAfter - ev.warn;
  if (wait > ready) ready = wait;
  if (ev.first) {
    const clear = landBusyUntil + C.aloneFor - ev.warn;
    if (clear > ready) ready = clear;
  }
  if (early && ready > CONFIG.earlyGolden.to - 0.5) ready = now;   // the early win never waits itself out of its window
  ev.ready = ready;
  ev.next = Math.max(now + gap * (D.gapJitter[0] + (D.gapJitter[1] - D.gapJitter[0]) * uGap), ready);
  ev.gap = ev.next - now;
  record({
    n: dropLog.length + 1, at: +now.toFixed(3), ready: +ready.toFixed(3), delay: +ev.gap.toFixed(4), type, kind, roll: +uType.toFixed(5),
    angle: +uAngle.toFixed(5), radius: +uRadius.toFixed(5), aimed: ev.aim, driftA: +uDriftA.toFixed(5), driftD: +uDriftD.toFixed(5),
  });
  return ev;
}

function launchEvent(e) {
  const p = place(e.angle, e.radius, e.aim);
  if (e.type === 'coconut') applyMercy(p);
  const it = e.kind === 'late' ? null : launch(e.type, p.x, p.z, e.warn, e.kind);
  if (e.kind === 'late') {
    playerAt(C.late.lag, tmp);
    clampDeck(tmp);
    applyMercy(tmp);
    launch('coconut', tmp.x, tmp.z, e.warn, 'late');
    lateLiveUntil = e.ready + e.warn;
  } else if (e.kind === 'drifter') {
    startDrift(it, e.driftA, e.driftD);
  }
  landBusyUntil = Math.max(landBusyUntil, e.ready + e.warn);
  if (e.first) { seen[e.kind] = true; holdLandAfter = e.ready + e.warn + C.aloneFor; }
  else if (e.type === 'coconut') seen[e.kind] = true;
  if (e.volley) {
    for (let i = 0; i < 2; i++) {
      const q = place(e.vAngle[i], e.vRadius[i], e.vAim[i] < D.aimChance);
      applyMercy(q);
      launch('coconut', q.x, q.z, e.warn, 'normal');
    }
  }
}

// ---------------------------------------------------------------- run control
export function resetDrops(r) {
  rng = r;
  nextAt = D.firstAt;
  dropLog = [];
  clearRequested = false;
  clearDrops();
  clearJuicePatches();
  dealer = createDealer(C.bags, C.maxRun);
  earlyAt = CONFIG.earlyGolden.from + (CONFIG.earlyGolden.to - CONFIG.earlyGolden.from) * rng.next();   // the one draw made at reset
  earlyDone = false;
  resetPlank(rng);   // the golden plank's choices: pre-drawn now (after the early-golden draw), so the draw order never depends on time
  breatherGiven = -1;
  holdLandAfter = 0;
  landBusyUntil = 0;
  lateLiveUntil = 0;
  pending = null;
  mercyUntil = -1;
  for (const k of Object.keys(seen)) seen[k] = false;
}

export function clearDrops() {
  for (let i = items.length - 1; i >= 0; i--) release(items[i]);
  items.length = 0;
}

// the live drops (read only; for the ?debug bot)
export function getDrops() {
  return items;
}

export function getDropLog() {
  return dropLog;
}

// for the ?debug panel: where the run is in the pacing and the bag
export function getDropDebug() {
  const t = state.time;
  const wv = waveAt(t);
  return {
    phase: phaseAt(t), intensity: wv.intensity, breather: wv.breather, wave: wv.index,
    bag: dealer ? dealer.contents() : [], seen: { ...seen }, earlyAt, earlyDone,
    pending: pending ? `${pending.kind} in ${Math.max(0, pending.ready - t).toFixed(1)}s` : '',
    mercy: Math.max(0, mercyUntil - t),
  };
}

// ---------------------------------------------------------------- per frame
function catchIt(it, i) {
  it.caught = true;
  const y = Math.max(1.2, it.mesh.position.y);
  const pl = getPlayer();
  // a catch made while dashing is a Swoop; one made standing on the golden plank pays x2 (scoring.js does the sums)
  fruitCaught({ type: it.type, x: it.x, y, z: it.z, dashing: pl.dashing, onPlank: onPlank(pl.x, pl.z) });
  release(it);
  items[i] = items[items.length - 1];
  items.pop();
}

function lockRing(it) {
  it.locked = true;
  tmp.x = it.x;                      // the spot it locks onto is mercy-checked one last time (a hit may have come after it chose)
  tmp.z = it.z;
  applyMercy(tmp);
  it.x = tmp.x;
  it.z = tmp.z;
  const u = it.ringMat.uniforms;
  u.uTrail.value.set(0, 0);
  u.uCPulse.value = 0;
  u.uLock.value = 1;
  emit(EVENTS.RING_LOCK, { id: it.id, kind: it.kind, x: it.x, z: it.z });
}

// moves the ring of a drifter or a late-lock coconut until it locks; after the lock nothing moves
function steer(it, dt) {
  if (it.kind === 'drifter') {
    if (it.age >= it.lockAge) {
      it.x = it.ex;
      it.z = it.ez;
      lockRing(it);
    } else {
      tmp.x = it.ex;
      tmp.z = it.ez;
      applyMercy(tmp);               // a hit during the slide: the spot it is heading for moves out of the mercy zone
      it.ex = tmp.x;
      it.ez = tmp.z;
      const k = Math.min(1, dt / Math.max(dt, it.lockAge - it.age));
      it.x += (it.ex - it.x) * k;
      it.z += (it.ez - it.z) * k;
      const len = Math.hypot(it.ex - it.x, it.ez - it.z);
      if (len > 0.001) { it.dirX = (it.ex - it.x) / len; it.dirZ = (it.ez - it.z) / len; }
    }
  } else if (it.age >= it.lockAge) {
    lockRing(it);                    // late-lock: where the ring is now is where it lands
  } else {
    playerAt(C.late.lag, tmp);       // where the player stood `lag` seconds ago: the ring trails, it never leads
    clampDeck(tmp);
    applyMercy(tmp);
    const k = 1 - Math.exp(-C.late.follow * dt);
    it.x += (tmp.x - it.x) * k;
    it.z += (tmp.z - it.z) * k;
  }
}

export function updateDrops(dt) {
  inUpdate = true;
  tickRings(dt);
  updateJuicePatches(dt);
  if (rng) {
    let guard = D.maxPerFrame;
    while (guard-- > 0) {
      if (!pending) {
        if (state.time < nextAt) break;
        pending = drawEvent();
      }
      if (state.time < pending.ready) break;
      launchEvent(pending);
      nextAt = pending.next;
      pending = null;
    }
  }
  const pl = getPlayer();

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const fruit = it.type !== 'coconut';
    const ground = GROUND[it.type];
    it.t += dt;
    if (it.sparkle) {   // a twinkle
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(it.t * 5));
      it.sparkle.scale.setScalar(tw);
      it.sparkle.rotation.y = it.t * 1.5;
    }
    if (it.flies) it.flies.rotation.y += dt * 1.6;   // flies orbit slowly

    if (!it.landed) {
      it.age += dt;
      if (!it.locked) {
        steer(it, dt);
        it.mesh.position.x = it.x;
        it.mesh.position.z = it.z;
        it.marker.position.x = it.x;
        it.marker.position.z = it.z;
        it.shadow.position.x = it.x;
        it.shadow.position.z = it.z;
      }
      const progress = Math.min(1, it.age / it.warn);
      const hanging = it.age < it.hangUntil;
      let y;
      if (hanging) {
        // a slow coconut: drops in to its hanging height, then wobbles there until it lets go
        const a = Math.min(1, it.age / 0.3);
        y = D.height + (C.slow.hangY - D.height) * (a * a * (3 - 2 * a));
        it.mesh.rotation.z = Math.sin(it.age * 11) * 0.3 * a;
        it.mesh.rotation.x = Math.cos(it.age * 8) * 0.12 * a;
      } else {
        const t = Math.min(Math.max(it.age - it.fallStart, 0), it.warn - it.fallStart);
        y = it.yStart - it.v0 * t - 0.5 * it.g * t * t;
        if (it.kind === 'slow' && it.mesh.rotation.z !== 0) it.mesh.rotation.z = 0;
        it.mesh.rotation.y += it.spin * dt;
        it.mesh.rotation.x += it.spin * 0.5 * dt;
      }
      it.mesh.position.y = Math.max(ground, y);
      // the ring closes in from CLOSE_IN x to 1.0 x its final size over the whole warning
      it.ringMat.uniforms.uOpacity.value = 0.45 + 0.55 * progress;
      const sc = it.final * (CLOSE_IN - (CLOSE_IN - 1) * progress);
      it.marker.scale.setScalar(sc);
      if (it.kind === 'drifter' && !it.locked) it.ringMat.uniforms.uTrail.value.set(it.dirX * C.drifter.trail / sc * 2, -it.dirZ * C.drifter.trail / sc * 2);
      // the blob shadow tightens and darkens as the item falls: the landing spot gets easier to read
      const sh = 0.62 - 0.34 * progress;
      it.shadow.scale.set(sh, 1, sh);
      it.shadowMat.opacity = 0.35 + 0.65 * progress;

      const dist = Math.hypot(it.x - pl.x, it.z - pl.z);
      if (fruit && dist < CONFIG.catchRadius && it.mesh.position.y < CONFIG.catchMaxHeight) { catchIt(it, i); continue; }
      if (it.age >= it.warn) {
        it.landed = true;
        it.mesh.position.y = ground;
        it.mesh.rotation.set(0, it.mesh.rotation.y, 0);
        it.marker.visible = false;
        if (fruit) {
          it.life = CONFIG.landedFruitLife;
        } else {
          it.life = D.coconutLinger;
          burst({ x: it.x, y: 0.1, z: it.z }, '#c9a26b', 10, 3);
          emit(EVENTS.DROP_LAND, { id: it.id, type: it.type, x: it.x, z: it.z });
          // PERFECT DODGE: a dash that began within the window, from inside the hit radius, and the player is outside it now
          const perfect = dist > CONFIG.hitRadius && state.time - pl.dashStartT <= CONFIG.perfectDodgeWindow
            && Math.hypot(it.x - pl.dashStartX, it.z - pl.dashStartZ) <= CONFIG.hitRadius;
          const result = coconutLanded({ x: it.x, z: it.z, dist, invulnerable: pl.invulnerable, perfect, big: false });
          if (result === 'perfect') refillDash();
        }
      }
    } else {
      it.life -= dt;
      const dist = Math.hypot(it.x - pl.x, it.z - pl.z);
      if (fruit) {
        if (dist < CONFIG.catchRadius - 0.1) { catchIt(it, i); continue; }
        // landed mangoes blink, then rot (browner) until they vanish
        const rot = 1 - Math.max(0, it.life) / CONFIG.landedFruitLife;
        if (it.type === 'mango' || it.type === 'golden') it.bodyMat.color.lerpColors(WHITE, ROT_TINT, rot * rot);
        it.mesh.visible = it.life > CONFIG.landedBlink || Math.floor(it.life * 8) % 2 === 0;
        it.mesh.rotation.y += dt * 1.5;
      } else if (it.life < 0.4) {
        it.mesh.position.y -= dt * 1.5;   // sink into the grass
      }
      if (it.life <= 0) {
        // a missed mango that has rotted away leaves a slippery juice patch on its spot
        if (fruit && (it.type === 'mango' || it.type === 'golden')) addJuicePatch(it.x, it.z);
        release(it);
        items[i] = items[items.length - 1];
        items.pop();
      }
    }
  }

  inUpdate = false;
  if (clearRequested) { clearRequested = false; clearDrops(); }
}

// MERCY starts at a hit (shielded or not): remember where the player stood
on(EVENTS.HIT, () => {
  const pl = getPlayer();
  mercyX = pl.x;
  mercyZ = pl.z;
  mercyUntil = state.time + C.mercy.time;
});

// When the run ends everything on the deck disappears. A coconut landing (inside the loop above) is what ends
// a run, so the clean-up waits for the loop to finish; from anywhere else it happens at once.
on(EVENTS.RUN_END, () => {
  if (inUpdate) clearRequested = true;
  else clearDrops();
});
