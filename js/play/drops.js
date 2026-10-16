// Mango Rush — falling items, warning rings, catching and landing.   OWNER: Claude Code  ·  STATUS: step 1 (mango, golden, coconut)
//
// CONTRACT:
//   initDrops(scene) ; resetDrops(rng) ; updateDrops(dt) ; clearDrops()
//   forceDrop(type, x, z, warn) -> void   a drop at a fixed spot, no rng (warm-up + happenings). type: 'mango'|'golden'|'coconut'
//   getDropLog() -> array                 (added in step 1) the raw rng values of the first 10 drops of this run
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

const D = CONFIG.drops;
const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');
const GROUND = { mango: 0.27, golden: 0.27, coconut: 0.33 };
const MARKER_COLOR = { mango: '#fff1a8', golden: '#ffe066', coconut: '#e63946' };
const BASE_COLOR = { mango: new THREE.Color('#ffb627'), golden: new THREE.Color('#ffd84d'), coconut: new THREE.Color('#5b3a1f') };
const ROT_COLOR = new THREE.Color('#5a3d22');

let scene = null;
let rng = null;
let nextAt = 0;
let nextId = 1;
let clearRequested = false;
let inUpdate = false;
let dropLog = [];
const items = [];
const free = { mango: [], golden: [], coconut: [] };

// ---------------------------------------------------------------- shared geometry
const mangoGeo = new THREE.SphereGeometry(0.3, 20, 14);
const blushGeo = new THREE.SphereGeometry(0.2, 14, 10);
const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.12, 6);
const leafGeo = new THREE.SphereGeometry(0.11, 8, 6);
const cocoGeo = new THREE.IcosahedronGeometry(0.36, 1);
const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
const ringGeo = new THREE.RingGeometry(0.62, 0.8, 36);
const fillGeo = new THREE.CircleGeometry(0.62, 36);
const stemMat = new THREE.MeshStandardMaterial({ color: '#5a3d22', roughness: 0.85 });
const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8f3a', roughness: 0.85 });
const blushMat = new THREE.MeshStandardMaterial({ color: '#ff6b3d', roughness: 0.45 });
const eyeMat = new THREE.MeshStandardMaterial({ color: '#22150b', roughness: 0.85 });

function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function makeBody(type) {
  const g = new THREE.Group();
  let bodyMat;
  if (type === 'coconut') {
    bodyMat = new THREE.MeshStandardMaterial({ color: BASE_COLOR.coconut, flatShading: true, roughness: 1 });
    part(cocoGeo, bodyMat, 0, 0, 0, g);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(eyeGeo, eyeMat, Math.cos(a) * 0.1, 0.33, Math.sin(a) * 0.1, g);
    }
  } else {
    const gold = type === 'golden';
    bodyMat = gold
      ? new THREE.MeshStandardMaterial({ color: BASE_COLOR.golden, metalness: 0.7, roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.6 })
      : new THREE.MeshStandardMaterial({ color: BASE_COLOR.mango, roughness: 0.45 });
    part(mangoGeo, bodyMat, 0, 0, 0, g).scale.set(0.82, 1, 0.78);
    if (!gold) part(blushGeo, blushMat, 0.1, 0.06, 0.13, g).scale.set(0.8, 1, 0.6);
    part(stemGeo, stemMat, 0, 0.33, 0, g);
    const leaf = part(leafGeo, leafMat, 0.09, 0.36, 0, g);
    leaf.scale.set(1.4, 0.25, 0.6);
    leaf.rotation.z = 0.5;
  }
  return { group: g, bodyMat };
}

function makeSlot(type) {
  const { group, bodyMat } = makeBody(type);
  const marker = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR[type], transparent: true, opacity: 0.2, depthWrite: false });
  const fillMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR[type], transparent: true, opacity: 0.08, depthWrite: false });
  marker.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(fillGeo, fillMat));
  marker.rotation.x = -Math.PI / 2;
  group.visible = false;
  marker.visible = false;
  scene.add(group, marker);
  return {
    type, id: 0, mesh: group, marker, bodyMat, ringMat, fillMat,
    x: 0, z: 0, y: 0, age: 0, warn: 1, v0: 0, g: 0, landed: false, life: 0, spin: 0, caught: false,
  };
}

export function initDrops(s) {
  scene = s;
  for (const [type, n] of [['mango', 20], ['golden', 4], ['coconut', 20]]) {
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
  it.bodyMat.color.copy(BASE_COLOR[type]);
  it.mesh.position.set(x, D.height, z);
  it.mesh.rotation.set(0, Math.random() * 6, 0);
  it.mesh.scale.setScalar(1);
  it.mesh.visible = true;
  it.marker.position.set(x, 0.03, z);
  it.marker.scale.setScalar(1.35);
  it.ringMat.opacity = 0.2;
  it.fillMat.opacity = 0.06;
  it.marker.visible = true;
  items.push(it);
  emit(EVENTS.DROP_SPAWN, { id: it.id, type, x, z, warnTime: warn });
  return it;
}

export function forceDrop(type, x, z, warn) {
  if (!scene) return;
  launch(type, x, z, warn);
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
    if (Math.hypot(nx / b.halfWidth, nz / b.halfDepth) < 1) { pos.x = nx; pos.z = nz; }
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

    if (!it.landed) {
      it.age += dt;
      const t = Math.min(it.age, it.warn);
      const y = D.height - it.v0 * t - 0.5 * it.g * t * t;
      it.mesh.position.y = Math.max(ground, y);
      it.mesh.rotation.y += it.spin * dt;
      it.mesh.rotation.x += it.spin * 0.5 * dt;
      const progress = Math.min(1, it.age / it.warn);
      it.ringMat.opacity = 0.2 + 0.7 * progress;
      it.fillMat.opacity = 0.06 + 0.3 * progress;
      it.marker.scale.setScalar(1.35 - 0.45 * progress);

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
        it.bodyMat.color.lerpColors(BASE_COLOR[it.type], ROT_COLOR, rot * rot);
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
