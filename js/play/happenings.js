// Mango Rush — scripted moments: Lights out, gusts, the fruit bat, The Big One, mango showers.   OWNER: Claude Code  ·  STATUS: step 8
//
// CONTRACT:
//   initHappenings(parent)   parent = barge.deckRoot(). Builds the pooled visuals: the bat (a dark body and a cream outline: 2 draw calls), its dotted
//                            path (1), the wind streaks and leaves (1), the Big One's splash ring of dots (1). All hidden until needed.
//   resetHappenings(rng)     run start: buildTimeline(rng) (play/timeline.js: EVERYTHING is drawn from the happenings rng right here, in a fixed
//                            order, so nothing the player does changes a draw) and hands it to drops.js for the holds.
//   updateHappenings(dt)     every frame while playing, after updatePlayer and before updateDrops. Reads state.time (the run clock).
//   getHappeningDebug() -> { current, next, wind, nextBatIn }   for the ?debug panel
//   startNextHappening() ; sendBatNow()   the ?debug H and B keys (main.js also marks the run unranked)
//
// EVENTS (all on the run clock): HAPPENING_WARN { id, inSeconds } 2 s before each scripted happening ('bridge' = Lights out, 'shower', 'gust',
// 'bigone'), then HAPPENING_START { id } and HAPPENING_END { id }. The bat has its own 1 s dotted-path tell and warns ('bat') only the FIRST time in a
// run. BAT_HIT, ITEM_SNATCHED and BIGONE_SURVIVED come from scoring.js / drops.js.
//
//   LIGHTS OUT (86..96 s): the bridge's scenery span passes over the barge (journey.js) and the light drops to about 25% with a 1 s fade each way
//     (journey.darkAt); the warning rings (unlit shaders), the bank spots and the player (a cream outline and rim) stay readable.
//   GUST (120 s, 180 s, 6 s): state.wind = windAt(): a push on FALLING items only (drops.js); the character's hair and scarf lean with it.
//   BAT (from 60 s, every 25-40 s): a straight path across the deck, dotted 1 s ahead, then a 0.8 s swoop. Touching it (and not dashing) drops the
//     combo ONE step (scoring.batHit); it snatches mangoes and golden mangoes on its path (drops.snatchAt). The ambient journey bats are only scenery.
//   THE BIG ONE (spawns at 207 s, lands at 210 s): drops.spawnBig at where the player stands at 207 s; every other drop is held 206..211 s.
//   MANGO MADNESS STORM (step 9): while state.madnessActive, about 2 extra mangoes a second by forceDrop from the Madness table (play/madness.js), drawn at
//     reset from its OWN rng (resetHappenings(rng, madnessRng): seed ^ CONFIG.adrenaline.madness.tableSeed; never the drops or happenings rng). The table is read
//     from the moment Madness starts and stops when it ends; a spot under a falling coconut's ring is skipped (drops.coconutRingAt). The Daily Run is identical.
//   SHOWERS (98 s, 152 s, 215 s, 3 s): about 10 mangoes by forceDrop at spots drawn at reset (kept apart by minSeparation); no coconut lands in them.

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, emit, on } from '../core/events.js';
import { buildTimeline, windAt, upcoming, nextBat, activeAt } from './timeline.js';
import { buildMadnessTable, resolveMadnessSpots } from './madness.js';
import { getPlayer } from './player.js';
import { deckBounds } from '../world/barge.js';
import { forceDrop, spawnBig, snatchAt, setTimeline, coconutRingAt } from './drops.js';
import { batHit } from './scoring.js';
import { flat, keepColorDuring } from '../world/materials.js';
import { setShowerBranches } from '../world/journey.js';

const H = CONFIG.happenings;
const B = CONFIG.bat;
const DEG = Math.PI / 180;

let tl = null;
let parent = null;
const flags = { warned: [], started: [], ended: [] };
const showerState = [];            // per shower: { pos: [{x,z}], launched }
let bigSpawned = false;
let madTable = null;               // the storm: [{ at, a, r }] seconds after Madness starts
let madSpots = null;               // the table on this deck: [{ x, z }] (resolved when a Madness starts)
let madOn = false;
let madStart = 0;
let madIdx = 0;
let batIdx = 0;
let batWarned = false;
let bat = null;                    // the bat being shown: { p0x, p0z, dx, dz, L, tell, swoopAt, hit, debug }
const wind = state.wind;

// ---- visuals (pooled; nothing is allocated per frame)
let batGroup = null;
let batBody = null;
let batRim = null;
let pathDots = null;
let windMesh = null;
let splash = null;
const WIND_N = 20;
const PATH_N = 28;
const SPLASH_N = 48;
const windBase = [];               // { x, y, z, speed, leaf, spin }
let splashAt = -1;
let splashX = 0;
let splashZ = 0;
const dummy = new THREE.Object3D();
const qTilt = new THREE.Quaternion();
const qZ = new THREE.Quaternion();
const eul = new THREE.Euler();
const tmpP = { x: 0, z: 0 };

function batGeometry() {
  const s = new THREE.Shape();           // the body: forward is +x, the wings spread along y (laid flat below)
  s.absellipse(0, 0, 0.26, 0.13, 0, Math.PI * 2, false, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const wing = (sign) => {
    const w = new THREE.Shape();
    w.moveTo(0.1, 0.06 * sign);
    w.lineTo(0.0, 0.7 * sign);
    w.lineTo(-0.16, 0.5 * sign);
    w.lineTo(-0.3, 0.62 * sign);
    w.lineTo(-0.36, 0.2 * sign);
    w.lineTo(-0.1, 0.0);
    w.closePath();
    return new THREE.ShapeGeometry(w, 4);
  };
  const ears = new THREE.Shape();
  ears.moveTo(0.18, 0.08); ears.lineTo(0.3, 0.2); ears.lineTo(0.26, 0.02); ears.lineTo(0.3, -0.2); ears.lineTo(0.18, -0.08); ears.closePath();
  const parts = [g, wing(1), wing(-1), new THREE.ShapeGeometry(ears, 2)];
  const pos = [];
  for (const p of parts) {
    const a = p.attributes.position;
    const idx = p.index;
    if (idx) for (let i = 0; i < idx.count; i++) pos.push(a.getX(idx.getX(i)), a.getY(idx.getX(i)), 0);
    else for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.rotateX(-Math.PI / 2);            // lie flat: x forward, y (the wings) becomes -z
  return out;
}

export function initHappenings(p) {
  parent = p;
  const bg = batGeometry();
  batBody = new THREE.Mesh(bg, flat('#1A1020', { side: THREE.DoubleSide }));
  batRim = new THREE.Mesh(bg, flat('#FFF1D6', { side: THREE.DoubleSide }));
  batRim.scale.set(1.32, 1, 1.32);       // a cream outline round the dark body: it reads at night too
  batRim.position.y = -0.03;
  batGroup = new THREE.Group();
  batGroup.add(batRim, batBody);
  batGroup.visible = false;
  parent.add(batGroup);

  const dg = new THREE.CircleGeometry(1, 6);
  dg.rotateX(-Math.PI / 2);
  pathDots = new THREE.InstancedMesh(dg, keepColorDuring(() => flat('#E4573D')), PATH_N);   // a warning: it keeps its colour in Heartbeat
  pathDots.frustumCulled = false;
  pathDots.visible = false;
  parent.add(pathDots);

  windMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flat('#ffffff'), WIND_N);
  windMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(WIND_N * 3), 3);
  windMesh.frustumCulled = false;
  windMesh.visible = false;
  const cream = new THREE.Color('#FFF1D6');
  const leaf = new THREE.Color('#5A8F3E');
  for (let i = 0; i < WIND_N; i++) {
    const isLeaf = i >= 14;
    windBase.push({ x: 0, y: 0, z: 0, speed: 0, leaf: isLeaf, spin: 0 });
    const c = isLeaf ? leaf : cream;
    windMesh.instanceColor.setXYZ(i, c.r, c.g, c.b);
  }
  parent.add(windMesh);

  const sg = new THREE.CircleGeometry(1, 6);
  sg.rotateX(-Math.PI / 2);
  splash = new THREE.InstancedMesh(sg, flat('#EBD3A0'), SPLASH_N);
  splash.frustumCulled = false;
  splash.visible = false;
  parent.add(splash);
}

function hideAll() {
  if (!batGroup) return;
  batGroup.visible = false;
  pathDots.visible = false;
  windMesh.visible = false;
  splash.visible = false;
  splashAt = -1;
  bat = null;
  wind.x = 0;
  wind.z = 0;
  setShowerBranches(0);
}

export function resetHappenings(rng, madnessRng = null) {
  tl = buildTimeline(rng);
  // the Madness storm table: its OWN rng (seed ^ tableSeed), drawn right here, never from the drops or happenings rng
  const MA = CONFIG.adrenaline.madness;
  madTable = madnessRng ? buildMadnessTable(madnessRng, MA.spots, MA.tableSeconds) : null;
  madSpots = null;
  madOn = false;
  madIdx = 0;
  setTimeline(tl);
  flags.warned = tl.scripted.map(() => false);
  flags.started = tl.scripted.map(() => false);
  flags.ended = tl.scripted.map(() => false);
  showerState.length = 0;
  for (let i = 0; i < tl.showers.length; i++) showerState.push({ pos: null, launched: 0 });
  bigSpawned = false;
  batIdx = 0;
  batWarned = false;
  hideAll();
}

// ---------------------------------------------------------------- the bat
function makeBat(angle01, offset01, swoopAt, debug) {
  const b = deckBounds();
  const phi = angle01 * Math.PI;                         // a direction 0..180 degrees: any way across the deck, not aimed at the player
  const dx = Math.cos(phi);
  const dz = Math.sin(phi);
  const off = (offset01 - 0.5) * 2 * 0.6 * Math.min(b.halfWidth, b.halfDepth);
  const L = Math.max(b.halfWidth, b.halfDepth) + 3;
  return { p0x: -dz * off, p0z: dx * off, dx, dz, L, swoopAt, hit: false, debug, x: 0, z: 0 };
}

function placePathDots(on) {
  pathDots.visible = on;
  if (!on) return;
  const b = deckBounds();
  for (let i = 0; i < PATH_N; i++) {
    const u = (i / (PATH_N - 1)) * 2 - 1;
    const x = bat.p0x + bat.dx * bat.L * u;
    const z = bat.p0z + bat.dz * bat.L * u;
    const inside = Math.hypot(x / (b.halfWidth + 1.2), z / (b.halfDepth + 1.2)) <= 1;
    dummy.position.set(x, 0.05, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(inside ? 0.22 : 0);
    dummy.updateMatrix();
    pathDots.setMatrixAt(i, dummy.matrix);
  }
  pathDots.instanceMatrix.needsUpdate = true;
}

function updateBat(dt, t) {
  const pl = getPlayer();
  // pick up the next bat of the timeline when its tell starts (an N / H jump may skip some)
  if (!bat) {
    while (tl.bats[batIdx] && t >= tl.bats[batIdx].t + B.swoop) batIdx++;
    const nb = tl.bats[batIdx];
    if (nb && t >= nb.t - B.warn) {
      bat = makeBat(nb.angle, nb.offset, nb.t, false);
      batIdx++;
      placePathDots(true);
      if (!batWarned) { batWarned = true; emit(EVENTS.HAPPENING_WARN, { id: 'bat', inSeconds: B.warn }); }   // the banner shows the first time only
    }
  }
  if (!bat) return;
  const u = (t - bat.swoopAt) / B.swoop;
  if (u < 0) { batGroup.visible = false; return; }
  if (u > 1) { bat = null; batGroup.visible = false; pathDots.visible = false; return; }
  const s = -1 + 2 * u;
  bat.x = bat.p0x + bat.dx * bat.L * s;
  bat.z = bat.p0z + bat.dz * bat.L * s;
  batGroup.visible = true;
  batGroup.position.set(bat.x, 0.9 + Math.sin(u * 18) * 0.08, bat.z);
  batGroup.rotation.y = -Math.atan2(bat.dz, bat.dx);
  const flap = 0.55 + 0.45 * Math.abs(Math.sin(u * 60));
  batGroup.scale.set(1, 1, flap);
  // it snatches mangoes on its path; touching it (and not dashing) knocks the combo down one step
  snatchAt(bat.x, bat.z, B.width * 0.5 + 0.3);
  if (!bat.hit && !pl.dashing && Math.hypot(pl.x - bat.x, pl.z - bat.z) < B.bodyRadius + B.playerRadius) {
    bat.hit = true;
    batHit({ x: pl.x, z: pl.z });
  }
}

// ---------------------------------------------------------------- showers
function showerPositions(k) {
  const b = deckBounds();
  const spots = tl.showers[k].spots;
  const out = [];
  for (let i = 0; i < spots.length; i++) {
    const a = spots[i].a * Math.PI * 2;
    const r = Math.sqrt(spots[i].r);
    const p = { x: Math.cos(a) * r * (b.halfWidth - 0.4), z: Math.sin(a) * r * (b.halfDepth - 0.4) };
    for (let tries = 0; tries < 8; tries++) {         // kept apart by minSeparation: a deterministic nudge, no rng
      let clash = false;
      for (let j = 0; j < out.length; j++) if (Math.hypot(out[j].x - p.x, out[j].z - p.z) < CONFIG.drops.minSeparation) { clash = true; break; }
      if (!clash) break;
      const na = tries * 1.0472 + 0.5;
      const nx = p.x + Math.cos(na) * (CONFIG.drops.minSeparation + 0.2);
      const nz = p.z + Math.sin(na) * (CONFIG.drops.minSeparation + 0.2);
      if (Math.hypot(nx / (b.halfWidth - 0.4), nz / (b.halfDepth - 0.4)) <= 1) { p.x = nx; p.z = nz; }
    }
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- wind visuals
function updateWindVisuals(dt, reduced) {
  const m = Math.hypot(wind.x, wind.z);
  if (m < 0.05) { windMesh.visible = false; return; }
  const b = deckBounds();
  if (!windMesh.visible) {            // a gust begins: scatter the streaks and leaves over the deck
    for (const w of windBase) {
      w.x = (Math.random() - 0.5) * 2 * (b.halfWidth + 1);
      w.z = (Math.random() - 0.5) * 2 * (b.halfDepth + 1);
      w.y = 0.4 + Math.random() * 1.8;
      w.speed = 2.2 + Math.random() * 1.6;
      w.spin = Math.random() * 6;
    }
  }
  windMesh.visible = true;
  eul.set(-CONFIG.camera.elevationDeg * DEG, 0, 0);
  qTilt.setFromEuler(eul);
  const ang = Math.atan2(-wind.z * 0.6, wind.x);        // the direction as the camera sees it
  const k = m / CONFIG.happenings.gustStrength;
  for (let i = 0; i < WIND_N; i++) {
    const w = windBase[i];
    w.x += (wind.x / m) * w.speed * k * dt * (reduced ? 0.4 : 1);
    w.z += (wind.z / m) * w.speed * k * dt * (reduced ? 0.4 : 1);
    const lim = b.halfWidth + 2;
    if (w.x > lim) w.x -= 2 * lim; else if (w.x < -lim) w.x += 2 * lim;
    const limz = b.halfDepth + 2;
    if (w.z > limz) w.z -= 2 * limz; else if (w.z < -limz) w.z += 2 * limz;
    w.spin += dt * 5;
    dummy.position.set(w.x, w.y + (w.leaf ? Math.sin(w.spin) * 0.15 : 0), w.z);
    qZ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, 0);
    dummy.quaternion.copy(qTilt);
    dummy.rotateZ(w.leaf ? w.spin : ang);
    if (w.leaf) dummy.scale.set(0.2 * k, 0.12 * k, 1); else dummy.scale.set(0.9 * k, 0.045, 1);
    dummy.updateMatrix();
    windMesh.setMatrixAt(i, dummy.matrix);
  }
  dummy.quaternion.identity();
  windMesh.instanceMatrix.needsUpdate = true;
  windMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- The Big One's splash: a ring of dots across the deck
on(EVENTS.DROP_LAND, (e) => {
  if (!e.big || !splash || state.settings.reducedMotion) return;
  splashAt = 0;
  splashX = e.x;
  splashZ = e.z;
  splash.visible = true;
});

function updateSplash(dt) {
  if (splashAt < 0) return;
  splashAt += dt;
  const dur = 1.1;
  if (splashAt >= dur) { splashAt = -1; splash.visible = false; return; }
  const u = splashAt / dur;
  const e = 1 - (1 - u) * (1 - u);
  for (let i = 0; i < SPLASH_N; i++) {
    const ring = i < 24 ? 0 : 1;
    const n = ring ? SPLASH_N - 24 : 24;
    const a = ((ring ? i - 24 : i) / n) * Math.PI * 2 + ring * 0.13;
    const r = (ring ? 7.5 : 11) * e;
    dummy.position.set(splashX + Math.cos(a) * r, 0.07, splashZ + Math.sin(a) * r);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.2 * (1 - u));
    dummy.updateMatrix();
    splash.setMatrixAt(i, dummy.matrix);
  }
  splash.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- per frame
export function updateHappenings(dt) {
  if (!tl || state.screen !== 'play') return;
  const t = state.time;
  const reduced = state.settings.reducedMotion;

  // the scripted happenings: warn 2 s ahead, start, end
  for (let i = 0; i < tl.scripted.length; i++) {
    const s = tl.scripted[i];
    if (!flags.warned[i] && t >= s.warnAt && t < s.start) { flags.warned[i] = true; emit(EVENTS.HAPPENING_WARN, { id: s.id, inSeconds: H.warnTime }); }
    if (!flags.started[i] && t >= s.start) { flags.started[i] = true; flags.warned[i] = true; emit(EVENTS.HAPPENING_START, { id: s.id }); }
    if (flags.started[i] && !flags.ended[i] && t >= s.end) { flags.ended[i] = true; emit(EVENTS.HAPPENING_END, { id: s.id }); }
  }

  windAt(tl, t, wind);
  updateWindVisuals(dt, reduced);

  // mango showers
  let showerLevel = 0;
  for (let k = 0; k < tl.showers.length; k++) {
    const sh = tl.showers[k];
    if (t < sh.start || t >= sh.end) continue;
    const st = showerState[k];
    if (!st.pos) st.pos = showerPositions(k);
    while (st.launched < sh.spots.length && t - sh.start >= sh.spots[st.launched].at) {
      const p = st.pos[st.launched];
      forceDrop('mango', p.x, p.z, H.showerWarn);
      st.launched++;
    }
    showerLevel = Math.min(1, (t - sh.start) / 0.4, (sh.end - t) / 0.5);
  }
  setShowerBranches(showerLevel);

  // The Big One: aimed at where the player is NOW, 3 s warning, never follows
  if (!bigSpawned && t >= H.bigone.spawnAt && t < H.bigone.holdTo) {
    bigSpawned = true;
    const pl = getPlayer();
    spawnBig(pl.x, pl.z, H.bigone.warn);
  }

  updateStorm(t);
  updateBat(dt, t);
  updateSplash(dt);
}

// ---------------------------------------------------------------- the Mango Madness storm
// While Madness is on (state.madnessActive, however long catches stretch it) extra plain mangoes rain down, about 2 a second, from the Madness table by
// forceDrop (never the drops schedule). The table is read from the moment Madness starts and the storm stops the moment it ends. Coconuts keep
// falling as usual. A spot under a coconut's falling ring (or inside The Big One's hold) is skipped, not moved.
function updateStorm(t) {
  if (!madTable) return;
  if (state.madnessActive && !madOn) {
    madOn = true;
    madStart = t;
    madIdx = 0;
    const b = deckBounds();
    madSpots = resolveMadnessSpots(madTable, b.halfWidth, b.halfDepth, CONFIG.drops.minSeparation);
  } else if (!state.madnessActive && madOn) madOn = false;
  if (!madOn) return;
  const BO = H.bigone;
  while (madIdx < madTable.length && t - madStart >= madTable[madIdx].at) {
    const p = madSpots[madIdx];
    madIdx++;
    if (t >= BO.holdFrom && t < BO.holdTo) continue;
    if (coconutRingAt(p.x, p.z)) continue;
    forceDrop('mango', p.x, p.z, CONFIG.adrenaline.madness.warn);
  }
}

/** For the ?debug panel and tests: how far through the storm table we are. */
export function getStormDebug() {
  return { on: madOn, spots: madTable ? madTable.length : 0, launched: madIdx };
}

on(EVENTS.RUN_END, hideAll);

// ---------------------------------------------------------------- debug
export function getHappeningDebug() {
  if (!tl) return { current: '-', next: '-', wind: 0, nextBatIn: 0 };
  const t = state.time;
  const cur = activeAt(tl, t);
  const nx = upcoming(tl, t);
  const nb = nextBat(tl, t);
  return {
    current: cur ? `${cur.id} (${(cur.end - t).toFixed(1)}s left)` : '-',
    next: nx ? `${nx.id} in ${(nx.start - t).toFixed(1)}s` : '-',
    wind: Math.hypot(wind.x, wind.z),
    windX: wind.x,
    windZ: wind.z,
    nextBatIn: nb ? nb.t - t : 0,
  };
}

// H: start the next scripted happening now (the run clock jumps to it)
export function startNextHappening() {
  if (!tl) return false;
  const nx = upcoming(tl, state.time);
  if (!nx) return false;
  state.time = nx.start + 0.01;
  return true;
}

// B: send a bat now (its path comes from Math.random: debug only)
export function sendBatNow() {
  if (!tl || bat) return false;
  bat = makeBat(Math.random(), Math.random(), state.time + B.warn, true);
  placePathDots(true);
  return true;
}
