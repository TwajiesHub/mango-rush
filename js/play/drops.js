// Mango Rush — falling items, warning rings, catching and landing.   OWNER: Claude Code  ·  STATUS: step 4 (toon items, dot rings)
//
// CONTRACT:
//   initDrops(parent)   parent = barge.deckRoot(): the drops move with the deck. Coordinates are deck-local.
//   resetDrops(rng) ; updateDrops(dt) ; clearDrops() ; getDrops() (read only, for the ?debug bot)
//   forceDrop(type, x, z, warn) -> void   a drop at a fixed spot, no rng (warm-up + happenings).
//        type: 'mango' | 'golden' | 'coconut' | 'rotten' | 'shield'   (rotten and shield are built but unused until step 5)
//   setRingTell(id, tell) -> void         the HOOK for step 5's tells: change a live drop's warning ring without any rebuild.
//        tell = { spacing (dots per ring x this, default 1), dotSize (x, default 1.25), pulse (Hz, default 0), pulseAmt (0..1),
//                 inner (0|1 draw the inner ring), lock (0..1 the centre dot grows solid: the late-lock tell) }
//   getDropLog() -> array                 the raw rng values of the first 10 drops of this run
//
// THE LOOK. Each item is ONE toon mesh with its merged umber outline (a second draw call), pooled. Mango: saffron ellipsoid, vermilion
// blush, green leaf and stem. Golden: brighter gold, slightly larger, with a twinkling cream sparkle (two crossed stars). Coconut:
// dark faceted sphere with three dark eyes. Rotten: brown with dark blotches and flies orbiting slowly. Shield: a woven calabash.
// The warning ring is a DOT RING drawn by a small shader on a flat unlit quad (concentric rings of round dots): mango = gold dots with
// a cream inner ring; golden = larger and glowing; coconut = vermilion dots with a dark dotted CROSS (a shape, so it says danger
// without colour). Each pooled drop has its own uniforms, so spacing, size and pulse can change live (setRingTell).
// The blob shadow under an item shrinks and darkens as it falls, so the landing spot is readable.
//
// DAILY RUN RULE: every random DROP decision comes from the rng given to resetDrops(), and the rng is drawn
// the same number of times in the same order whatever the player does (see the "draws" below). The schedule
// is kept on its own clock (`nextAt`, run seconds), so frame rate and pauses do not matter either. Looks
// (spin, particles) use Math.random().
//
// One spawn event draws, in this order (always all six):
//   1 gap   2 type   3 angle   4 radius   5 aim   6 volley
//   + 3 more per extra coconut of a volley: aim, angle, radius
//   gap    -> delay until the next event = dropGap(at nextAt) x lerp(gapJitter, gap)
//   type   -> coconut if < coconutShare; otherwise golden if the rest falls under goldenChance; else mango
//   angle, radius -> where it lands: uniform on the deck, or (aim < aimChance, coconuts only) near the player
//   volley -> a coconut with volley < volleyChance (after volleyFromT) brings two more coconuts
//
// Fall time equals the warning time from difficultyAt(), so the ring is always honest. Pooled: no allocation per frame.
// Catching calls scoring.fruitCaught(); landing calls scoring.coconutLanded().

import * as THREE from 'three';
import { CONFIG, difficultyAt } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, on, emit } from '../core/events.js';
import { fruitCaught, coconutLanded } from './scoring.js';
import { getPlayer } from './player.js';
import { deckBounds } from '../world/barge.js';
import { burst } from '../fx/juice.js';
import { toon, toonTextured, tintableClone, blobShadow, blobMaterial, bakeToon, mergeMeshes, flat } from '../world/materials.js';

const D = CONFIG.drops;
const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');
const GROUND = { mango: 0.27, golden: 0.31, rotten: 0.27, coconut: 0.33, shield: 0.3 };
const ITEM_SCALE = 1.3;   // items are drawn a little larger than their 0.3 model radius: they must read at play distance
const RING_DOT = 1.25;    // the default dot size of a warning ring (the tell hook scales it)
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

// ---------------------------------------------------------------- the warning ring: dots by polar coordinates, in a small shader
const RING_TIME = { value: 0 };
const RING_VERT = `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = `
precision highp float;
uniform float uKind, uSpacing, uDotSize, uPulse, uPulseAmt, uTime, uOpacity, uInner, uLock;
uniform vec3 uColor, uColor2, uDark;
varying vec2 vP;

// signed distance to the nearest of n dots on a ring of radius r
float dots(vec2 p, float r, float n, float size) {
  float a = atan(p.y, p.x);
  float st = 6.2831853 / n;
  float ca = floor(a / st + 0.5) * st;
  return length(p - r * vec2(cos(ca), sin(ca))) - size;
}
float cover(float d) {
  float w = fwidth(d);
  return 1.0 - smoothstep(-w, w, d);
}
void main() {
  vec2 p = vP;
  float r = length(p);
  float s = uDotSize * (1.0 + uPulseAmt * sin(uTime * 6.2831853 * uPulse));
  vec3 acc = vec3(0.0);
  float tot = 0.0;
  float a = 0.0;
  if (uKind < 0.5) {
    // MANGO: gold dots, a cream inner ring, a gold centre dot
    float c1 = cover(dots(p, 0.70, floor(26.0 * uSpacing + 0.5), 0.058 * s));
    float c2 = cover(dots(p, 0.42, floor(14.0 * uSpacing + 0.5), 0.048 * s)) * uInner;
    float c3 = cover(r - 0.065 * s);
    acc = uColor * c1 + uColor2 * c2 + uColor * c3;
    tot = c1 + c2 + c3;
    a = min(1.0, tot);
  } else if (uKind < 1.5) {
    // GOLDEN: larger and glowing: a soft disc of gold under three rings of dots
    float glow = (1.0 - smoothstep(0.0, 0.96, r)) * 0.3;
    float c1 = cover(dots(p, 0.84, floor(32.0 * uSpacing + 0.5), 0.07 * s));
    float c2 = cover(dots(p, 0.60, floor(20.0 * uSpacing + 0.5), 0.056 * s));
    float c3 = cover(dots(p, 0.36, floor(10.0 * uSpacing + 0.5), 0.046 * s)) * uInner;
    float c4 = cover(r - 0.075 * s);
    acc = uColor * (c1 + c2 + c4) + uColor2 * c3;
    tot = c1 + c2 + c3 + c4;
    a = max(min(1.0, tot), glow);
    acc = acc + uColor * glow * (1.0 - min(1.0, tot));
    tot = max(tot, 0.0001) + glow * (1.0 - min(1.0, tot));
  } else {
    // COCONUT: vermilion dots and a dark dotted CROSS in the middle: the shape says "danger", not only the colour
    float c1 = cover(dots(p, 0.72, floor(22.0 * uSpacing + 0.5), 0.06 * s));
    float c2 = cover(dots(p, 0.47, floor(12.0 * uSpacing + 0.5), 0.05 * s)) * uInner;
    vec2 d1 = vec2(0.70710678, 0.70710678);
    vec2 d2 = vec2(-0.70710678, 0.70710678);
    float gap = 0.17;
    float s1 = dot(p, d1);
    float t1 = dot(p, d2);
    float k1 = clamp(floor(s1 / gap + 0.5), -2.0, 2.0);
    float s2 = t1;
    float t2 = s1;
    float k2 = clamp(floor(s2 / gap + 0.5), -2.0, 2.0);
    float cx = max(cover(length(vec2(s1 - k1 * gap, t1)) - 0.046 * s), cover(length(vec2(s2 - k2 * gap, t2)) - 0.046 * s));
    float c3 = cover(r - mix(0.06, 0.14, uLock) * s);
    float dark = max(cx, c3);
    acc = uColor * (c1 + c2) + uDark * dark;
    tot = c1 + c2 + dark;
    a = min(1.0, tot);
  }
  vec3 col = acc / max(tot, 0.0001);
  gl_FragColor = vec4(col, a * uOpacity);
  #include <colorspace_fragment>
}`;

const ringGeo = new THREE.PlaneGeometry(2, 2);
ringGeo.userData.shared = true;
const RING_KIND = { mango: 0, golden: 1, coconut: 2, rotten: 0, shield: 1 };
const RING_COLORS = {
  mango: ['#F2A93B', '#FFF1D6'], golden: ['#FFD84D', '#FFF1D6'], coconut: ['#C8432E', '#FFF1D6'],
  rotten: ['#9A7A45', '#FFF1D6'], shield: ['#FFD84D', '#FFF1D6'],
};

function makeRingMaterial(type) {
  const [c1, c2] = RING_COLORS[type];
  return new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      uKind: { value: RING_KIND[type] }, uSpacing: { value: 1 }, uDotSize: { value: 1 }, uPulse: { value: 0 }, uPulseAmt: { value: 0 },
      uTime: RING_TIME, uOpacity: { value: 0.5 }, uInner: { value: 1 }, uLock: { value: 0 },
      uColor: { value: new THREE.Color(c1) }, uColor2: { value: new THREE.Color(c2) }, uDark: { value: new THREE.Color('#2B1A10') },
    },
  });
}

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
    part(mangoGeo, toon(bodyColor), 0, 0, 0, g).scale.set(0.82 * k, 1 * k, 0.78 * k);
    if (!gold && !rotten) part(blushGeo, toon('#E4573D'), 0.1, 0.06, 0.13, g).scale.set(0.8, 1, 0.6);
    if (rotten) {
      for (const [x, y, z, s] of [[0.1, 0.05, 0.15, 1.3], [-0.12, -0.08, 0.14, 1], [0.06, -0.12, -0.15, 1.1], [-0.1, 0.12, -0.12, 0.9]]) part(spotGeo, toon('#3E2A18'), x, y, z, g).scale.set(s, s * 0.7, s);
    }
    part(stemGeo, toon('#5A3D22'), 0, 0.33 * k, 0, g);
    const leaf = part(leafGeo, toon(rotten ? '#5A4A2B' : '#0F3D2E'), 0.09, 0.36 * k, 0, g);
    leaf.scale.set(1.4, 0.25, 0.6);
    leaf.rotation.z = 0.5;
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
    type, id: 0, mesh, marker: ring, ringMat, shadow, shadowMat, bodyMat: mesh.material,
    sparkle: extras.sparkle || null, flies: extras.flies || null, t: Math.random() * 6,
    x: 0, z: 0, y: 0, age: 0, warn: 1, v0: 0, g: 0, landed: false, life: 0, spin: 0, caught: false,
  };
}

export function initDrops(s) {
  scene = s;
  for (const [type, n] of [['mango', 20], ['golden', 4], ['coconut', 20], ['rotten', 1], ['shield', 1]]) {
    for (let i = 0; i < n; i++) free[type].push(makeSlot(type));
  }
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

function launch(type, x, z, warn) {
  const it = acquire(type);
  const ground = GROUND[type];
  const h = D.height - ground;
  // y(t) = h - v0 t - g t^2 / 2 reaches the ground exactly at t = warn
  let g = D.gravity;
  let v0 = (h - 0.5 * g * warn * warn) / warn;
  if (v0 < 0) { v0 = 0; g = (2 * h) / (warn * warn); }
  it.id = nextId++;
  it.x = x;
  it.z = z;
  it.warn = warn;
  it.v0 = v0;
  it.g = g;
  it.age = 0;
  it.y = D.height;
  it.landed = false;
  it.caught = false;
  it.life = 0;
  it.spin = (Math.random() - 0.5) * 6;
  it.bodyMat.color.set(0xffffff);   // white = as painted
  it.mesh.position.set(x, D.height, z);
  it.mesh.rotation.set(0, Math.random() * 6, 0);
  it.mesh.scale.setScalar(ITEM_SCALE);
  it.mesh.visible = true;
  it.marker.position.set(x, 0.03, z);
  it.marker.scale.setScalar(1.35);
  const u = it.ringMat.uniforms;
  u.uOpacity.value = 0.45;
  u.uSpacing.value = 1; u.uDotSize.value = RING_DOT; u.uPulse.value = 0; u.uPulseAmt.value = 0; u.uInner.value = 1; u.uLock.value = 0;
  it.marker.visible = true;
  it.shadow.position.set(x, 0.012, z);
  it.shadow.scale.set(0.62, 1, 0.62);
  it.shadowMat.opacity = 0.35;
  it.shadow.visible = true;
  items.push(it);
  emit(EVENTS.DROP_SPAWN, { id: it.id, type, x, z, warnTime: warn });
  return it;
}

export function forceDrop(type, x, z, warn) {
  if (!scene || !free[type]) return;
  launch(type, x, z, warn);
}

// the hook for step 5's tells: change a live drop's ring with no rebuild
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
  const e = Math.hypot(spot.x / (b.halfWidth - 0.2), spot.z / (b.halfDepth - 0.2));
  if (e > 1) { spot.x /= e; spot.z /= e; }
  separate(spot);
  return spot;
}

function record(entry) {
  if (dropLog.length >= 10) return;
  dropLog.push(entry);
  if (DEBUG) console.log('[drops]', JSON.stringify(entry));
}

function spawnEvent() {
  const d = difficultyAt(nextAt);
  // the six fixed draws
  const uGap = rng.next();
  const uType = rng.next();
  const uAngle = rng.next();
  const uRadius = rng.next();
  const uAim = rng.next();
  const uVolley = rng.next();

  let type = 'mango';
  if (uType < d.coconutShare) type = 'coconut';
  else if ((uType - d.coconutShare) / (1 - d.coconutShare) < d.goldenChance) type = 'golden';

  const delay = d.dropGap * (D.gapJitter[0] + (D.gapJitter[1] - D.gapJitter[0]) * uGap);
  const aimed = type === 'coconut' && uAim < D.aimChance;
  const p = place(uAngle, uRadius, aimed);
  record({ n: dropLog.length + 1, at: +nextAt.toFixed(3), delay: +delay.toFixed(4), type, roll: +uType.toFixed(5), angle: +uAngle.toFixed(5), radius: +uRadius.toFixed(5), aimed });
  launch(type, p.x, p.z, d.warn);

  if (type === 'coconut' && nextAt > D.volleyFromT && uVolley < D.volleyChance) {
    for (let i = 0; i < 2; i++) {
      const vAim = rng.next();
      const vAngle = rng.next();
      const vRadius = rng.next();
      const vAimed = vAim < D.aimChance;
      const q = place(vAngle, vRadius, vAimed);
      record({ n: dropLog.length + 1, at: +nextAt.toFixed(3), delay: 0, type: 'coconut', roll: null, angle: +vAngle.toFixed(5), radius: +vRadius.toFixed(5), aimed: vAimed });
      launch('coconut', q.x, q.z, d.warn);
    }
  }
  nextAt += delay;
}

// ---------------------------------------------------------------- run control
export function resetDrops(r) {
  rng = r;
  nextAt = D.firstAt;
  dropLog = [];
  clearRequested = false;
  clearDrops();
}

export function clearDrops() {
  for (let i = items.length - 1; i >= 0; i--) release(items[i]);
  items.length = 0;
}

// the live drops (read only; for the ?debug bot): { type, x, z, age, warn, landed }
export function getDrops() {
  return items;
}

export function getDropLog() {
  return dropLog;
}

// ---------------------------------------------------------------- per frame
function catchIt(it, i) {
  it.caught = true;
  const y = Math.max(1.2, it.mesh.position.y);
  fruitCaught({ type: it.type, x: it.x, y, z: it.z });
  release(it);
  items[i] = items[items.length - 1];
  items.pop();
}

export function updateDrops(dt) {
  inUpdate = true;
  RING_TIME.value += dt;
  if (rng) {
    let guard = D.maxPerFrame;
    while (state.time >= nextAt && guard-- > 0) spawnEvent();
  }
  const pl = getPlayer();

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const fruit = it.type !== 'coconut';
    const ground = GROUND[it.type];
    const dist = Math.hypot(it.x - pl.x, it.z - pl.z);
    it.t += dt;
    if (it.sparkle) {   // a twinkle
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(it.t * 5));
      it.sparkle.scale.setScalar(tw);
      it.sparkle.rotation.y = it.t * 1.5;
    }
    if (it.flies) it.flies.rotation.y += dt * 1.6;   // flies orbit slowly

    if (!it.landed) {
      it.age += dt;
      const t = Math.min(it.age, it.warn);
      const y = D.height - it.v0 * t - 0.5 * it.g * t * t;
      it.mesh.position.y = Math.max(ground, y);
      it.mesh.rotation.y += it.spin * dt;
      it.mesh.rotation.x += it.spin * 0.5 * dt;
      const progress = Math.min(1, it.age / it.warn);
      it.ringMat.uniforms.uOpacity.value = 0.45 + 0.55 * progress;
      it.marker.scale.setScalar(1.35 - 0.45 * progress);
      // the blob shadow tightens and darkens as the item falls: the landing spot gets easier to read
      const sh = 0.62 - 0.34 * progress;
      it.shadow.scale.set(sh, 1, sh);
      it.shadowMat.opacity = 0.35 + 0.65 * progress;

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
          coconutLanded({ x: it.x, z: it.z, dist, invulnerable: pl.invulnerable, perfect: false, big: false });
        }
      }
    } else {
      it.life -= dt;
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
        release(it);
        items[i] = items[items.length - 1];
        items.pop();
      }
    }
  }

  inUpdate = false;
  if (clearRequested) { clearRequested = false; clearDrops(); }
}

// When the run ends everything on the deck disappears. A coconut landing (inside the loop above) is what ends
// a run, so the clean-up waits for the loop to finish; from anywhere else it happens at once.
on(EVENTS.RUN_END, () => {
  if (inUpdate) clearRequested = true;
  else clearDrops();
});
