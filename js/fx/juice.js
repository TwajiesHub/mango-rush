// Mango Rush — game feel: freeze frames, slow motion, camera shake, squash & stretch, particles, pop-up text.
//                                                    OWNER: Claude Code  ·  STATUS: done (step 1)
//
// IMPORTS ALLOWED: 'three' (import * as THREE from 'three'), '../core/config.js' (CONFIG),
//                  '../core/state.js' (state), '../core/events.js' (EVENTS, on)
//
// CONTRACT (keep these exact exports and signatures):
//
//   initJuice({ scene, camera, popupRoot }) -> void
//     scene/camera: three.js objects. popupRoot: an HTMLElement covering the screen (position: fixed; inset: 0;
//     pointer-events: none) where DOM pop-up text goes. Subscribe to the events below.
//
//   timeScale() -> number
//     main.js multiplies the game dt by this every frame. 0 during a freeze, slowMo.scale during slow motion
//     (ease back to 1 over 0.15 s at the end), else 1. Camera shake, particles and pop-ups keep animating
//     with REAL dt during freezes.
//
//   updateJuice(realDt: number) -> void      every frame, real (unscaled) dt in seconds
//
//   cameraShake() -> { x: number, y: number, roll: number }
//     Offset that renderer.js adds to the camera this frame. Smooth noise (sum of 2-3 sines with different
//     frequencies is fine), amplitude = strength x e^(-decay x t). Never random jitter per frame.
//
//   squash(object3D, scaleY: number, ms: number) -> void
//     Volume-preserving: scale.y = s, scale.x = scale.z = 1 / sqrt(s); then spring back to 1 with a small
//     overshoot (elastic) over ~180 ms. object3D's origin is at its feet, so it squashes into the ground.
//
//   burst({ x, y, z }, color: string, count: number, speed = 4) -> void
//     Small particles flying out with gravity (-14 units/s^2), fading/shrinking over 0.5-0.9 s.
//     Use ONE THREE.InstancedMesh (max 256 instances, small IcosahedronGeometry, MeshBasicMaterial) created at
//     init; reuse slots in a ring buffer. ZERO allocations per frame (no new Vector3 in update).
//
//   popup(text: string, { x, y, z }, kind = 'normal') -> void
//     DOM element in popupRoot at the projected screen position (Vector3.project(camera)), class
//     "popup popup--<kind>" (kinds: normal, gold, bad, perfect, near, big), rises 60 px and fades over 0.9 s,
//     then removed. Pool up to 12 elements. Gemini's CSS styles the classes.
//
// AUTOMATIC FEEL (subscribe with on(); values from CONFIG.feel[<name>]):
//   EVENTS.CATCH          mango -> 'catch', golden -> 'golden' (burst + popup "+<points>" kind normal/gold;
//                         popup also shows "x<multiplier>" when multiplier > 1, e.g. "+300 x3")
//   EVENTS.NEAR_MISS      'nearMiss'  popup "NEAR MISS +<points>" kind near
//   EVENTS.PERFECT_DODGE  'perfectDodge' (+ slow motion) popup "PERFECT DODGE" kind perfect
//   EVENTS.HIT            'hit' (shielded: shake 0.15 only, popup "BLOCKED" kind normal) popup "BONK!" kind bad
//   EVENTS.DASH           'dash' (dust burst at feet)
//   EVENTS.COMBO_CHANGE   stepUp -> 'stepUp'
//   EVENTS.RUN_END        'gameOver' (+ slow motion)
//   For each: freeze(ms), shake(strength, decay), squash(player, ...) if a player object was registered
//   via setPlayerObject(object3D), burst(...) at the event position.
//   Popup text strings come from TEXT (import TEXT from '../content/text.js') where available:
//   TEXT.popups.nearMiss, TEXT.popups.perfectDodge, TEXT.popups.bonk, TEXT.popups.blocked.
//
//   setPlayerObject(object3D) -> void
//   (step 1 addition) EVENTS.DROP_LAND coconut -> a small camera shake, as in version 0.
//
// REDUCED MOTION: if state.settings.reducedMotion, NO shake, NO slow motion, freezes capped at 30 ms;
// particles and pop-ups still play.
//
// RULES: no setTimeout/setInterval; everything advances in updateJuice. Dispose nothing per frame.

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, on } from '../core/events.js';
import TEXT from '../content/text.js';

const MAX_PARTICLES = 256;
const POPUP_POOL = 12;
const GRAVITY = -14;

let scene = null;
let camera = null;
let popupRoot = null;
let playerObject = null;

// ---- time: freeze + slow motion
let freezeLeft = 0;      // seconds
let slowLeft = 0;
let slowScale = 1;
let easeBack = 0;        // seconds left of the ease back to normal speed
const EASE_BACK = 0.15;
let scale = 1;

// ---- camera shake
let shakeStrength = 0;
let shakeDecay = 0;
let shakeT = 0;
const shake = { x: 0, y: 0, roll: 0 };

// ---- squash
const squashes = [];     // { obj, s, t, dur }  (one per object)

// ---- particles: ONE instanced mesh, ring buffer
let mesh = null;
let cursor = 0;
const pos = new Float32Array(MAX_PARTICLES * 3);
const vel = new Float32Array(MAX_PARTICLES * 3);
const life = new Float32Array(MAX_PARTICLES);      // seconds left (<= 0: free)
const maxLife = new Float32Array(MAX_PARTICLES);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

// ---- popups
const popups = [];       // { el, x, y, z, t, active }

const reduced = () => !!state.settings.reducedMotion;

export function initJuice(opts) {
  scene = opts.scene;
  camera = opts.camera;
  popupRoot = opts.popupRoot;

  const geo = new THREE.IcosahedronGeometry(0.07, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  tint.set(0xffffff);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint);
  }
  scene.add(mesh);

  for (let i = 0; i < POPUP_POOL; i++) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.hidden = true;
    popupRoot.appendChild(el);
    popups.push({ el, x: 0, y: 0, z: 0, t: 0, active: false });
  }

  subscribe();
}

// 1 = all particles; the renderer's quality manager lowers it (0.5) when the GPU cannot keep up
let particleScale = 1;
export function setParticleScale(s) {
  particleScale = Math.max(0.1, Math.min(1, s));
}

export function setPlayerObject(obj) {
  playerObject = obj;
}

// ---------------------------------------------------------------- the pieces
function freeze(ms) {
  const cap = reduced() ? Math.min(ms, 30) : ms;
  freezeLeft = Math.max(freezeLeft, cap / 1000);
}

function slowMo(s, seconds) {
  if (reduced()) return;
  slowScale = s;
  slowLeft = Math.max(slowLeft, seconds);
}

function addShake(strength, decay) {
  if (reduced() || strength <= 0) return;
  if (strength >= shakeStrength * Math.exp(-shakeDecay * shakeT)) {
    shakeStrength = strength;
    shakeDecay = decay;
    shakeT = 0;
  }
}

export function squash(obj, scaleY, ms) {
  if (!obj || ms <= 0 || scaleY === 1) return;
  let s = squashes.find((q) => q.obj === obj);
  if (!s) { s = { obj, s: 1, t: 0, dur: 0 }; squashes.push(s); }
  s.s = scaleY;
  s.t = 0;
  s.dur = Math.max(0.18, ms / 1000 + 0.18);
  applySquash(s, 0);
}

function applySquash(q, t) {
  // snap to the squash, then spring back to 1 with a little overshoot
  const k = t < 0.04 ? 1 : Math.min(1, (t - 0.04) / (q.dur - 0.04));
  const spring = 1 - Math.exp(-6 * k) * Math.cos(10 * k);
  const sy = q.s + (1 - q.s) * (k >= 1 ? 1 : spring);
  q.obj.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
}

export function burst(p, color, count, speed = 4) {
  if (!mesh) return;
  tint.set(color);
  count = count * particleScale < 1 ? Math.min(count, 1) : Math.round(count * particleScale);
  for (let n = 0; n < count; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    const a = Math.random() * Math.PI * 2;
    const r = speed * Math.random();
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    vel[i * 3] = Math.cos(a) * r;
    vel[i * 3 + 1] = 2 + Math.random() * speed;
    vel[i * 3 + 2] = Math.sin(a) * r;
    life[i] = maxLife[i] = 0.5 + Math.random() * 0.4;
    mesh.setColorAt(i, tint);
  }
  mesh.instanceColor.needsUpdate = true;
}

export function popup(text, p, kind = 'normal') {
  let slot = popups.find((q) => !q.active);
  if (!slot) slot = popups.reduce((a, b) => (a.t > b.t ? a : b));   // recycle the oldest
  slot.active = true;
  slot.t = 0;
  slot.x = p.x;
  slot.y = p.y;
  slot.z = p.z;
  slot.el.className = `popup popup--${kind}`;
  slot.el.textContent = text;
  slot.el.hidden = false;
}

export function timeScale() {
  return scale;
}

export function cameraShake() {
  return shake;
}

// ---------------------------------------------------------------- per frame
const v3 = new THREE.Vector3();

export function updateJuice(realDt) {
  // time scale
  if (freezeLeft > 0) {
    freezeLeft -= realDt;
    scale = 0;
    if (freezeLeft <= 0 && slowLeft <= 0) easeBack = 0;
  } else if (slowLeft > 0) {
    slowLeft -= realDt;
    scale = slowScale;
    if (slowLeft <= 0) easeBack = EASE_BACK;
  } else if (easeBack > 0) {
    easeBack -= realDt;
    const u = 1 - Math.max(0, easeBack) / EASE_BACK;
    scale = slowScale + (1 - slowScale) * u;
  } else {
    scale = 1;
  }

  // shake: a few sines, never random jitter
  if (shakeStrength > 0) {
    shakeT += realDt;
    const amp = shakeStrength * Math.exp(-shakeDecay * shakeT);
    if (amp < 0.002) { shakeStrength = 0; shake.x = shake.y = shake.roll = 0; }
    else {
      shake.x = amp * (Math.sin(shakeT * 61) + 0.5 * Math.sin(shakeT * 97 + 1.3));
      shake.y = amp * (Math.sin(shakeT * 53 + 0.7) + 0.5 * Math.sin(shakeT * 83 + 2.1));
      shake.roll = amp * 0.15 * Math.sin(shakeT * 47);
    }
  }

  // squash
  for (let i = squashes.length - 1; i >= 0; i--) {
    const q = squashes[i];
    q.t += realDt;
    if (q.t >= q.dur) { q.obj.scale.set(1, 1, 1); squashes[i] = squashes[squashes.length - 1]; squashes.pop(); }
    else applySquash(q, q.t);
  }

  // particles
  if (mesh) {
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) continue;
      life[i] -= realDt;
      const j = i * 3;
      if (life[i] <= 0) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, -50, 0);
      } else {
        vel[j + 1] += GRAVITY * realDt;
        pos[j] += vel[j] * realDt;
        pos[j + 1] += vel[j + 1] * realDt;
        pos[j + 2] += vel[j + 2] * realDt;
        if (pos[j + 1] < 0.05) { pos[j + 1] = 0.05; vel[j] *= 0.5; vel[j + 1] *= -0.3; vel[j + 2] *= 0.5; }
        dummy.position.set(pos[j], pos[j + 1], pos[j + 2]);
        dummy.scale.setScalar(Math.max(0.01, (life[i] / maxLife[i]) * 1.4));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dirty = true;
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  }

  // popups
  for (const q of popups) {
    if (!q.active) continue;
    q.t += realDt;
    if (q.t >= 0.9) { q.active = false; q.el.hidden = true; continue; }
    v3.set(q.x, q.y, q.z).project(camera);
    const px = (v3.x * 0.5 + 0.5) * innerWidth;
    const py = (-v3.y * 0.5 + 0.5) * innerHeight - (q.t / 0.9) * 60;
    q.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
    q.el.style.opacity = q.t < 0.6 ? '1' : String(1 - (q.t - 0.6) / 0.3);
  }
}

// ---------------------------------------------------------------- automatic feel
function feel(name, p) {
  const f = CONFIG.feel[name];
  if (f.freeze) freeze(f.freeze);
  if (f.shake) addShake(f.shake, f.decay);
  if (f.squash !== 1 && playerObject) squash(playerObject, f.squash, f.squashMs);
  if (f.particles && p) burst(p, f.color, f.particles, name === 'golden' ? 5 : 4);
  if (f.slowMo) slowMo(f.slowMo.scale, f.slowMo.seconds);
}

function subscribe() {
  on(EVENTS.CATCH, (e) => {
    if (e.type === 'rotten' || e.type === 'shield') return;
    const golden = e.type === 'golden';
    feel(golden ? 'golden' : 'catch', e);
    let text = `+${e.points}`;
    if (e.multiplier > 1) text += ` x${e.multiplier}`;
    popup(text, e, golden ? 'gold' : 'normal');
  });
  on(EVENTS.NEAR_MISS, (e) => {
    feel('nearMiss', { x: e.x, y: 0.4, z: e.z });
    popup(`${TEXT.popups.nearMiss.toUpperCase()} +${e.points}`, { x: e.x, y: 1.4, z: e.z }, 'near');
  });
  on(EVENTS.PERFECT_DODGE, (e) => {
    feel('perfectDodge', { x: e.x, y: 0.4, z: e.z });
    popup(TEXT.popups.perfectDodge.toUpperCase(), { x: e.x, y: 1.6, z: e.z }, 'perfect');
  });
  on(EVENTS.HIT, (e) => {
    const at = { x: e.x, y: 0.4, z: e.z };
    if (e.shielded) {
      addShake(0.15, 18);
      popup(TEXT.popups.blocked.toUpperCase(), { x: e.x, y: 2.4, z: e.z }, 'normal');
    } else {
      feel('hit', at);
      popup(TEXT.popups.bonk.toUpperCase(), { x: e.x, y: 2.6, z: e.z }, 'bad');
      if (!reduced() && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(120);
    }
  });
  on(EVENTS.DASH, (e) => feel('dash', { x: e.x, y: 0.15, z: e.z }));
  on(EVENTS.COMBO_CHANGE, (e) => { if (e.stepUp) feel('stepUp', null); });
  on(EVENTS.DROP_LAND, (e) => { if (e.type === 'coconut') addShake(0.12, 18); });
  on(EVENTS.RUN_END, () => {
    const f = CONFIG.feel.gameOver;
    if (f.freeze) freeze(f.freeze);
    addShake(f.shake, f.decay);
    if (f.slowMo) slowMo(f.slowMo.scale, f.slowMo.seconds);
    if (playerObject) burst({ x: playerObject.position.x, y: 1, z: playerObject.position.z }, f.color, f.particles, 5);
  });
  on(EVENTS.RUN_START, () => {
    freezeLeft = slowLeft = easeBack = 0;
    scale = 1;
    shakeStrength = 0;
    shake.x = shake.y = shake.roll = 0;
    for (const q of popups) { q.active = false; q.el.hidden = true; }
  });
}
