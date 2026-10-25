// Mango Rush — player movement, dash, skid, snap turn, invulnerability.   OWNER: Claude Code  ·  STATUS: step 3 (movement feel)
//
// CONTRACT:
//   initPlayer(parent) ; setCharacter(info) ; resetPlayer() ; updatePlayer(dt, input)
//     parent = barge.deckRoot(): the player moves with the deck. Coordinates are deck-local.
//   getPlayer() -> { object, x, z, vx, vz, invulnerable, dashing, dashStartT, dashStartX, dashStartZ }   the SAME object every call
//        vx, vz = the velocity now (units / second): drops.js leads its aimed coconuts with it (step 7).
//        dashStartT = state.time when the latest dash started (-99 = none this run), dashStartX / Z = where the player stood then:
//        drops.js uses them for the Perfect dodge.
//   refillDash() -> void   the dash is ready at once (a Perfect dodge refills it)
//   playerAt(secondsAgo, out) -> out   writes { x, z } = where the player stood that many seconds ago (a fixed ring buffer, no
//        allocation): the late-lock coconut's ring trails the player by this. Clamped to the oldest sample (~4 s).
//   setOverPose(isBest) -> void   the held game-over pose: a slump, or a cheer after a new best (reset when a run starts)
//   idlePlayer(realDt, screen) -> void   main.js calls it when no run is being played (start screen: the character turns
//     slowly; game over: stands idle)
//
//   updatePlayer(dt, input)   input = { x, z, dash, analog } from core/input.js.
//     - Direction: smoothInput (TUNE.keySmooth for keys, TUNE.joySmooth for the joystick), so diagonals blend.
//     - Velocity: accelerateVelocity with TUNE.accel / decel / turnAccel, all scaled by the grip of the surface under the
//       player (barge.surfaceAt): a low grip means sliding. Facing turns toward the velocity at TUNE.turnRate, never instantly.
//     - Skid: reversing (input against the velocity) above TUNE.skidFrac of top speed plants the feet for TUNE.skidTime and
//       leans the body back. Emits EVENTS.SKID.
//     - Dash: starts on the frame of the press. During the burst the direction FOLLOWS the input at TUNE.dashTurn deg/s
//       (carving), it is never locked. At the end the speed eases down over TUNE.dashExit seconds (x 1 / grip, at most x 2.5).
//       A press up to TUNE.dashBuffer seconds before the cooldown ends fires the moment it is ready.
//     - Snap turn: if, within TUNE.snapWindow after a dash ends, the input points more than TUNE.snapAngle away from the dash
//       direction, the player keeps TUNE.snapBoost x speed for TUNE.snapTime. Emits EVENTS.SNAP_TURN.
//     - Footsteps: the character's stride (by distance) says when a foot plants: EVENTS.FOOTSTEP.
//     Writes state.dashReadyFrac (0 = just used, 1 = ready). Emits EVENTS.DASH { x, z, dirX, dirZ } when a dash starts and
//     EVENTS.DASH_END { x, z } when the burst is over. A Swoop (EVENTS.SWOOP, from scoring.js) refills the dash at once: that is the Chain.
//     Listens for EVENTS.HIT (invulnerable for CONFIG.player.invulnerable seconds).
//   The camera reads model.userData.motion = { vx, vz, dashing, dirX, dirZ } (look-ahead and dash kick).
//
// The rim of the deck: slow down smoothly over the last stretch, then remove only the outward part of the velocity (no snap).
// No allocation per frame: every scratch object below is reused.

import { CONFIG, TUNE } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, on, emit } from '../core/events.js';
import { smoothInput, accelerateVelocity } from '../core/motion.js';
import { playerOutlineMaterial } from '../world/materials.js';
import { buildCharacter, updateCharacterMotion, animateCharacter, disposeCharacter, triggerReaction, setCharacterPose } from '../world/character.js';
import { deckBounds, surfaceAt } from '../world/barge.js';
import { blobShadow } from '../world/materials.js';
import { menuStand } from '../world/renderer.js';
import { burst } from '../fx/juice.js';

const DEG = Math.PI / 180;
const DUST = '#E6BE7A';

let scene = null;
let model = null;
let blob = null;

let x = 0;
let z = 0;
let facing = 0;
let dashT = 0;
let dashCool = 0;
let dashQueued = false;
let dashDirX = 0;
let dashDirZ = 1;
let exitLeft = 0;
let exitRate = 0;
let sinceDash = 99;
let snapPending = false;
let snapDirX = 0;
let snapDirZ = 1;
let boostT = 0;
let skidT = 0;
let trailT = 0;
let invuln = 0;
let idleTime = 0;

const sm = { x: 0, z: 0 };            // smoothed input
const vel = { x: 0, z: 0 };
const prevVel = { x: 0, z: 0 };
const desired = { x: 0, z: 0 };
const rates = { accel: 0, decel: 0, turnAccel: 0 };
const motion = { vx: 0, vz: 0, ax: 0, az: 0, dashing: false, skidding: false };   // for the character
const camMotion = { vx: 0, vz: 0, dashing: false, dirX: 0, dirZ: 1 };              // for the camera
const dustAt = { x: 0, y: 0.12, z: 0 };
const stepEvent = { x: 0, z: 0, speed: 0 };

const view = { object: null, x: 0, z: 0, vx: 0, vz: 0, invulnerable: false, dashing: false, dashStartT: -99, dashStartX: 0, dashStartZ: 0 };

// position history: a fixed ring buffer (one sample per update), so "where was the player 0.4 s ago" never allocates
const HIST = 256;
const histT = new Float32Array(HIST);
const histX = new Float32Array(HIST);
const histZ = new Float32Array(HIST);
let histHead = 0;     // the next slot to write
let histCount = 0;

function pushHistory() {
  histT[histHead] = state.time;
  histX[histHead] = x;
  histZ[histHead] = z;
  histHead = (histHead + 1) % HIST;
  if (histCount < HIST) histCount++;
}

export function playerAt(secondsAgo, out) {
  if (histCount === 0) { out.x = x; out.z = z; return out; }
  const want = state.time - secondsAgo;
  let i = (histHead - 1 + HIST) % HIST;   // the newest sample; walk back until one is old enough
  for (let n = 0; n < histCount - 1; n++) {
    const j = (i - 1 + HIST) % HIST;
    if (histT[i] <= want) break;
    i = j;
  }
  // i is the first sample at or before `want` (or the oldest); blend with the next newer one for a smooth path
  const k = (i + 1) % HIST;
  const newer = i !== (histHead - 1 + HIST) % HIST;
  if (newer && histT[k] > histT[i] && want > histT[i]) {
    const u = (want - histT[i]) / (histT[k] - histT[i]);
    out.x = histX[i] + (histX[k] - histX[i]) * u;
    out.z = histZ[i] + (histZ[k] - histZ[i]) * u;
  } else {
    out.x = histX[i];
    out.z = histZ[i];
  }
  return out;
}

export function refillDash() {
  dashCool = 0;
  state.dashReadyFrac = 1;
}

export function initPlayer(s) {
  scene = s;
  // a soft blob under the feet (no real-time shadows)
  blob = blobShadow(0.62, 0.55);
  blob.position.y = 0.02;
  scene.add(blob);
  on(EVENTS.HIT, (e) => {
    invuln = CONFIG.player.invulnerable;
    if (model && !e.shielded) triggerReaction(model, 'hit');          // a stumble backwards
  });
  on(EVENTS.CATCH, (e) => { if (model && e.points > 0) triggerReaction(model, 'catch'); });   // a hop with arms up
  on(EVENTS.SWOOP, refillDash);   // a Swoop refills the dash instantly (the Chain)
  on(EVENTS.BEST_PASSED, () => { if (model) triggerReaction(model, 'cheer'); });              // both arms up
}

export function setCharacter(info) {
  if (model) { scene.remove(model); disposeCharacter(model); }
  model = buildCharacter(info.style, info.name);
  model.traverse((o) => { if (o.userData.isOutline) o.material = playerOutlineMaterial(); });   // the player's outline can glow cream (Lights out)
  model.position.set(x, 0, z);
  model.rotation.y = facing;
  model.userData.motion = camMotion;
  scene.add(model);
  view.object = model;
}

export function resetPlayer() {
  x = z = 0;
  vel.x = vel.z = prevVel.x = prevVel.z = 0;
  sm.x = sm.z = 0;
  facing = 0;
  dashT = dashCool = exitLeft = boostT = skidT = invuln = 0;
  dashQueued = snapPending = false;
  sinceDash = 99;
  view.dashStartT = -99;
  histHead = histCount = 0;
  state.dashReadyFrac = 1;
  camMotion.vx = camMotion.vz = 0;
  camMotion.dashing = false;
  if (model) { model.visible = true; model.position.set(0, 0, 0); model.rotation.y = 0; model.scale.set(1, 1, 1); setCharacterPose(model, null); }
  syncView();
}

function syncView() {
  view.x = x;
  view.z = z;
  view.vx = vel.x;
  view.vz = vel.z;
  view.invulnerable = invuln > 0;
  view.dashing = dashT > 0;
  if (blob) blob.position.set(x, 0.02, z);
}

function puff(count, speed) {
  dustAt.x = x;
  dustAt.z = z;
  burst(dustAt, DUST, count, speed);
}

function startDash(inX, inZ, inLen) {
  let dx = 0;
  let dz = 0;
  const sp = Math.hypot(vel.x, vel.z);
  if (inLen > 0.1) { dx = inX / inLen; dz = inZ / inLen; }
  else if (sp > 0.5) { dx = vel.x / sp; dz = vel.z / sp; }
  else { dx = Math.sin(facing); dz = Math.cos(facing); }
  dashDirX = dx;
  dashDirZ = dz;
  dashT = TUNE.dashTime;
  dashCool = TUNE.dashCooldown;
  exitLeft = 0;
  snapPending = false;
  boostT = 0;
  trailT = 0;
  view.dashStartT = state.time;      // for the Perfect dodge: when and where this dash began
  view.dashStartX = x;
  view.dashStartZ = z;
  vel.x = dx * TUNE.dashSpeed;       // the burst starts on this very frame
  vel.z = dz * TUNE.dashSpeed;
  emit(EVENTS.DASH, { x, z, dirX: dx, dirZ: dz });
}

export function updatePlayer(dt, input) {
  if (!model) return;
  const T = TUNE;
  const b = deckBounds();

  dashCool = Math.max(0, dashCool - dt);
  invuln = Math.max(0, invuln - dt);
  boostT = Math.max(0, boostT - dt);
  skidT = Math.max(0, skidT - dt);
  sinceDash += dt;
  prevVel.x = vel.x;
  prevVel.z = vel.z;

  // ---- input: smoothed, so a diagonal is a curve and not a 45 degree snap
  smoothInput(sm, input, input.analog ? T.joySmooth : T.keySmooth, dt);
  const rawLen = Math.hypot(input.x, input.z);
  const inLen = Math.hypot(sm.x, sm.z);
  const grip = Math.min(1, Math.max(0.05, surfaceAt(x, z).grip));

  // ---- dash: fire on the press frame, or when the cooldown ends if it was pressed up to dashBuffer early
  if (input.dash) {
    if (dashT <= 0 && dashCool <= 0) startDash(input.x, input.z, rawLen);
    else if (dashT <= 0 && dashCool <= T.dashBuffer) dashQueued = true;
  }
  if (dashQueued && dashT <= 0 && dashCool <= 0) { dashQueued = false; startDash(input.x, input.z, rawLen); }
  state.dashReadyFrac = 1 - Math.min(1, dashCool / T.dashCooldown);

  const dashing = dashT > 0;
  if (dashing) {
    // steer the burst: turn the dash direction toward the input at dashTurn deg/s (never locked to the start direction)
    if (inLen > 0.15) {
      let d = Math.atan2(sm.x, sm.z) - Math.atan2(dashDirX, dashDirZ);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = T.dashTurn * DEG * dt;
      const a = Math.atan2(dashDirX, dashDirZ) + Math.max(-step, Math.min(step, d));
      dashDirX = Math.sin(a);
      dashDirZ = Math.cos(a);
    }
    vel.x = dashDirX * T.dashSpeed;
    vel.z = dashDirZ * T.dashSpeed;
    dashT -= dt;
    trailT -= dt;
    if (trailT <= 0) { trailT = 0.035; puff(2, 1.4); }
    if (dashT <= 0) {
      dashT = 0;
      emit(EVENTS.DASH_END, { x, z });
      exitLeft = T.dashExit * Math.min(2.5, 1 / grip);   // a dash carries further on a slippery surface
      exitRate = Math.max(1, (T.dashSpeed - T.speed) / Math.max(0.02, exitLeft));
      sinceDash = 0;
      snapPending = true;
      snapDirX = dashDirX;
      snapDirZ = dashDirZ;
    }
  } else {
    // ---- snap turn: a sharp turn right after a dash keeps a short speed boost
    if (snapPending) {
      if (sinceDash > T.snapWindow) snapPending = false;
      else if (inLen > 0.5 && (sm.x * snapDirX + sm.z * snapDirZ) / inLen < Math.cos(T.snapAngle * DEG)) {
        snapPending = false;
        boostT = T.snapTime;
        puff(7, 2.2);
        emit(EVENTS.SNAP_TURN, { x, z, dirX: sm.x / inLen, dirZ: sm.z / inLen });
      }
    }
    // ---- skid: reversing at speed plants the feet
    const spd = Math.hypot(vel.x, vel.z);
    // (judged on the RAW input: the smoothed one is still catching up when the key flips, and the speed is already gone)
    if (skidT <= 0 && rawLen > 0.5 && spd > T.skidFrac * T.speed && vel.x * input.x + vel.z * input.z < 0) {
      skidT = T.skidTime;
      puff(8, 2.6);
      emit(EVENTS.SKID, { x, z });
    }
    // ---- velocity: a quick push-off, a short glide to a stop, a firm reversal; all scaled by grip
    const top = T.speed * (boostT > 0 ? T.snapBoost : 1);
    desired.x = sm.x * top;
    desired.z = sm.z * top;
    rates.accel = T.accel * grip;
    rates.decel = T.decel * grip;
    rates.turnAccel = T.turnAccel * grip;
    if (exitLeft > 0) {
      exitLeft -= dt;
      rates.accel = rates.decel = Math.min(rates.accel, exitRate * grip);   // an ease out of the burst, not a dead stop
    }
    accelerateVelocity(vel, desired, rates, dt);
  }

  // ---- the rim: slow down smoothly over the last stretch, then remove only the outward part of the velocity
  x += vel.x * dt;
  z += vel.z * dt;
  const e = Math.hypot(x / b.halfWidth, z / b.halfDepth);
  const zone = CONFIG.deck.slowZone;
  if (e > 1 - zone) {
    const nx = x / (b.halfWidth * b.halfWidth);
    const nz = z / (b.halfDepth * b.halfDepth);
    const nl = Math.hypot(nx, nz) || 1;
    const ux = nx / nl;
    const uz = nz / nl;
    const out = vel.x * ux + vel.z * uz;
    if (out > 0) {
      const u = Math.min(1, (e - (1 - zone)) / zone);
      const cut = u * u * (3 - 2 * u);
      vel.x -= ux * out * cut;
      vel.z -= uz * out * cut;
    }
    if (e > 1) { x /= e; z /= e; }
  }

  // ---- facing: turns toward the velocity at a limited rate, never instantly (feet stay planted in a skid)
  const spd = Math.hypot(vel.x, vel.z);
  if (spd > 0.3 && skidT <= 0) {
    let d = Math.atan2(vel.x, vel.z) - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const step = (dashT > 0 ? Math.max(T.turnRate, T.dashTurn) : T.turnRate) * DEG * dt;
    facing += Math.max(-step, Math.min(step, d));
  }
  model.position.set(x, 0, z);
  model.rotation.y = facing;

  // ---- the body
  motion.vx = vel.x;
  motion.vz = vel.z;
  motion.ax = (vel.x - prevVel.x) / dt + state.wind.x * 18;   // a gust never pushes the player, but the hair and scarf lean with it
  motion.az = (vel.z - prevVel.z) / dt + state.wind.z * 18;
  motion.dashing = dashT > 0;
  motion.skidding = skidT > 0;
  if (updateCharacterMotion(model, dt, motion) && spd > 1.2) {
    stepEvent.x = x;
    stepEvent.z = z;
    stepEvent.speed = spd;
    emit(EVENTS.FOOTSTEP, stepEvent);
  }
  model.visible = invuln <= 0 || Math.floor(invuln * 12) % 2 === 0;

  camMotion.vx = vel.x;
  camMotion.vz = vel.z;
  camMotion.dashing = dashT > 0;
  camMotion.dirX = dashDirX;
  camMotion.dirZ = dashDirZ;
  syncView();
  pushHistory();
}

// the game-over pose, held on the game-over screen: a slump, or a cheer after a new best
export function setOverPose(isBest) {
  if (model) setCharacterPose(model, isBest ? 'cheer' : 'slump');
}

let waveIn = 2;
export function idlePlayer(realDt, screen) {
  if (!model) return;
  idleTime += realDt;
  if (screen === 'start') {
    waveIn -= realDt;   // the start screen: the idle pose with a small wave every few seconds
    if (waveIn <= 0) { waveIn = 4.5 + Math.random() * 2; triggerReaction(model, 'wave'); }
    const stand = menuStand();
    x = stand.x;
    z = stand.z;
    model.position.set(x, 0, z);
    model.rotation.y = Math.sin(idleTime * 0.6) * 0.7;
  }
  if (screen === 'start' || screen === 'over') {
    model.visible = true;
    animateCharacter(model, realDt, 0, idleTime);
  }
  camMotion.vx = camMotion.vz = 0;
  camMotion.dashing = false;
  syncView();
}

export function getPlayer() {
  return view;
}
