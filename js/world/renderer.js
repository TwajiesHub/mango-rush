// Mango Rush — renderer, camera rig, portrait.   OWNER: Claude Code  ·  STATUS: step 2 (tilted camera; quality manager comes later)
//
// CONTRACT:
//   initRenderer(canvas) -> { scene, camera, renderer }     (the camera is a child of the scene: the backdrop hangs on it)
//   setCameraMode(mode: 'menu'|'play'|'over') ; setFollowTarget(object3D)
//   renderFrame(realDt) — glides the camera to its mode's pose, adds juice.cameraShake(), aligns the backdrop, renders.
//   makePortrait(characterObject) -> string   data URL (PNG) of the character's head, 128x128, transparent background
//   isPortraitScreen() -> boolean             the screen is taller than wide (phones held upright)
//   menuStand() -> { x, z }                   where the character stands on the start screen (deck-local)
//   getRenderer() / getCameraDebug()          for ?debug measurements
//   getGpuInfo() -> { renderer, intel }       the GPU's own name (WEBGL_debug_renderer_info; empty if the browser hides it)
//   getQualityInfo() -> { antialias, pixelRatio, level, levels, particleScale }
//   warmUp() -> void                          compile every material now (during loading) so nothing compiles mid-run
//   reportFrame(intervalMs, nowMs)            main.js calls it after every rendered frame: the QUALITY MANAGER (see below)
//
// PLAY CAMERA. A normal tilted camera (no lens shift) that looks at the deck from CONFIG.camera.elevationDeg. On every
// resize, and whenever the deck's orientation changes, it is FITTED: the smallest distance at which the whole walkable
// area plus CONFIG.camera.fitMargin is on screen (also with the camera at its follow extremes), and the tilt that puts the
// deck's near edge at CONFIG.camera.bottomNdc. If a screen is too narrow for that elevation, the elevation is eased off.
// Follow: the camera moves CONFIG.camera.followShare of the player's offset, one spring per axis (motion.js springStep, frequency
// TUNE.camFollowFreq). The target leads the player by velocity x TUNE.lookAhead (look-ahead) and a dash gives the camera a tiny
// push along the dash direction (TUNE.dashKick, at most 0.35 units, kept in reserve by the deck fit). Reduced motion switches both off.
// The camera never bobs. A tilt this steep keeps the real horizon off the top of the screen, so in play the horizon is the
// painted line at CONFIG.camera.horizonFrac (see journey.js).
//
// MENU CAMERA. Low, looking almost level: the REAL horizon is on screen. A lens shift (projection matrix element [9])
// puts it at the menu's horizonFrac, and journey.js finds it by projecting far points on the water plane.
// OVER CAMERA. The play pose, a little higher and further back, drifting slowly.
// Moving between modes is a spring glide on position, tilt and lens shift. Camera shake from juice.cameraShake()
// (x, y, roll) applies in every mode. No real-time shadow maps. Pixel ratio is capped (CONFIG.quality).
//
// ANTIALIAS is decided once, at startup (a WebGL context cannot change it later): OFF when devicePixelRatio >= 1.5 (the picture is
// dense enough already) or when the GPU is an Intel one (MSAA is slow there), ON otherwise.
// QUALITY MANAGER. If the average frame time stays above the budget for about 1 s the pixel ratio steps down (cap -> 1.25 -> 1.0),
// then the particle count is halved. It steps back up one level only after 5 s well under the budget, and never flips back and
// forth: after a step down it waits 10 s before any step up, and a step down soon after a step up doubles that wait. In ?debug every
// step is logged. The water is the clear colour, not a mesh (a full-screen plane cost a whole extra pass).

import * as THREE from 'three';
import { CONFIG, TUNE } from '../core/config.js';
import { state } from '../core/state.js';
import { springStep } from '../core/motion.js';
import { cameraShake, setParticleScale } from '../fx/juice.js';
import { setGrainPixelRatio } from './materials.js';
import { deckBounds, deckSize } from './barge.js';
import { syncBackdrop, consumeWaterColor, setJourneyDetail } from './journey.js';

const DEG = Math.PI / 180;
const C = CONFIG.camera;

let ctx = null;
let mode = 'menu';
let follow = null;
let clock = 0;

// the camera pose is a set of springs
const KICK_MAX = 0.35;                 // the most a dash kick may move the camera: the deck fit keeps this much in reserve
const kickX = { x: 0, v: 0 };
const kickZ = { x: 0, v: 0 };
const pose = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, z: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, e9: { x: 0, v: 0 } };
let snapNext = true;
let fit = null;
let fitKey = '';

export function isPortraitScreen() {
  return ctx ? ctx.camera.aspect < 1 : innerHeight > innerWidth;
}

export function menuStand() {
  const m = C.menu[isPortraitScreen() ? 'portrait' : 'landscape'].stand;
  return { x: m[0], z: m[1] };
}

export function getRenderer() {
  return ctx.renderer;
}

export function getScene() {   // ?debug: counting draw calls by part
  return ctx.scene;
}

// for ?debug: where a deck-local point is on screen right now (ndc, -1..1)
export function debugProject(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(ctx.camera);
  return { x: v.x, y: v.y };
}

// for ?debug: the fitted play camera and where the camera is now
export function getCameraDebug() {
  const c = ctx.camera;
  const size = deckSize();
  const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 0]].map(([sx, sz]) => {
    const v = new THREE.Vector3(sx * size.width / 2, 0, sz * size.depth / 2).project(c);
    return [+v.x.toFixed(2), +v.y.toFixed(2)];
  });
  return {
    deckNdc: { nearLeft: corners[0], nearRight: corners[1], farLeft: corners[2], farRight: corners[3], centre: corners[4] },
    mode, fit: fit && { D: fit.D, elevationDeg: fit.phi / DEG, pitchDeg: fit.pitch / DEG },
    pos: [c.position.x, c.position.y, c.position.z], pitchDeg: pose.pitch.x / DEG, lensShift: pose.e9.x, aspect: c.aspect,
  };
}

// ---------------------------------------------------------------- GPU and quality
const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');
let gpu = { renderer: '', intel: false };
let antialias = true;

// the GPU's own name, from a throwaway context (the extension may be missing or blocked: then we just do not know)
function probeGpu() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    gpu = { renderer: name, intel: /intel/i.test(name) };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* unknown GPU: keep the defaults */ }
}

export function getGpuInfo() {
  return gpu;
}

const basePixelRatio = () => Math.min(devicePixelRatio, CONFIG.quality.maxPixelRatio);
let levels = [];            // { pr, particles }
let level = 0;
let pixelRatio = 1;
const Q = { startAt: 0, winStart: 0, winSum: 0, winN: 0, okFor: 0, upAllowedAt: 0, downAllowedAt: 0, upBlock: 10000, lastUpAt: -1e9, ignoreUntil: 0 };

function buildLevels() {
  const base = basePixelRatio();
  const prs = [base];
  for (const p of [1.25, 1.0]) if (p < prs[prs.length - 1] - 0.01) prs.push(p);
  levels = prs.map((pr) => ({ pr, particles: 1 }));
  levels.push({ pr: prs[prs.length - 1], particles: 0.5 });
}

function applyLevel(n, now) {
  level = n;
  pixelRatio = levels[n].pr;
  ctx.renderer.setPixelRatio(pixelRatio);
  ctx.renderer.setSize(innerWidth, innerHeight, false);
  setParticleScale(levels[n].particles);
  setJourneyDetail(n);              // lower levels thin out the far layer and the ambient life
  setGrainPixelRatio(pixelRatio);   // the paper grain keeps its size ON SCREEN at every quality level
  Q.winStart = now;
  Q.winSum = Q.winN = 0;
  Q.okFor = 0;
  Q.ignoreUntil = now + 1000;      // the first frames after a change are not representative
}

export function getQualityInfo() {
  return { antialias, pixelRatio, level, levels: levels.length, particleScale: levels[level] ? levels[level].particles : 1 };
}

// called after every RENDERED frame with the real interval since the previous one
export function reportFrame(intervalMs, now) {
  if (!levels.length || intervalMs <= 0 || intervalMs > 250) return;   // (a long gap is a hidden tab, not a slow GPU)
  if (!Q.startAt) { Q.startAt = now; Q.winStart = now; Q.ignoreUntil = now + 3000; }   // shaders compile in the first seconds
  if (now < Q.ignoreUntil) { Q.winStart = now; Q.winSum = Q.winN = 0; return; }
  Q.winSum += intervalMs;
  Q.winN++;
  if (now - Q.winStart < 1000) return;
  const avg = Q.winSum / Q.winN;
  const budget = 1000 / 60 * 1.2;      // 20 ms: a steady 60 fps, with some slack
  Q.winStart = now;
  Q.winSum = Q.winN = 0;
  if (avg > budget) {
    Q.okFor = 0;
    if (level < levels.length - 1 && now >= Q.downAllowedAt) {
      if (now - Q.lastUpAt < 10000) Q.upBlock = Math.min(120000, Q.upBlock * 2);   // we stepped up and it did not hold: wait longer
      applyLevel(level + 1, now);
      Q.upAllowedAt = now + Q.upBlock;
      Q.downAllowedAt = now + 1500;
      if (DEBUG) console.log(`[quality] step down -> level ${level} (pixel ratio ${pixelRatio}, particles x${levels[level].particles}) after ${avg.toFixed(1)} ms average frames`);
    }
  } else if (avg < budget * 0.7) {
    Q.okFor += 1000;
    if (Q.okFor >= 5000 && level > 0 && now >= Q.upAllowedAt) {
      applyLevel(level - 1, now);
      Q.lastUpAt = now;
      Q.downAllowedAt = now + 1500;
      if (DEBUG) console.log(`[quality] step up -> level ${level} (pixel ratio ${pixelRatio}, particles x${levels[level].particles}) after ${avg.toFixed(1)} ms average frames`);
    }
  } else {
    Q.okFor = 0;
  }
}

export function initRenderer(canvas) {
  probeGpu();
  antialias = !(devicePixelRatio >= 1.5 || gpu.intel);
  if (DEBUG) console.log(`[renderer] GPU "${gpu.renderer || 'unknown'}", devicePixelRatio ${devicePixelRatio}, antialias ${antialias ? 'on' : 'off'}`);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
  buildLevels();
  pixelRatio = levels[0].pr;
  renderer.setPixelRatio(pixelRatio);
  setGrainPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.NoToneMapping;   // the poster palette is exact: a colour on screen is the colour in the code
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;   // the backdrop is clipped at the horizon line
  renderer.setClearColor('#1FA39A');   // the water (see journey.js): below the horizon there is nothing else to draw

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.5, 6000);
  scene.add(camera);                      // so things can hang on it

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = C.fov;
    camera.updateProjectionMatrix();
    fitKey = '';
  };
  addEventListener('resize', resize);
  resize();

  ctx = { scene, camera, renderer };
  return ctx;
}

// SHADER WARM-UP. A shader is compiled and linked the first time something uses it, and on an Intel UHD 620 that can freeze the picture
// for 100 ms or more mid-run (the first golden mango, the first rotten mango or new ring). main.js calls this during LOADING, after
// everything is built: renderer.compile() builds the programs of EVERY material in the scene (the pools hold one of each item, ring,
// outline and the character), then one throwaway frame with the pooled (hidden) meshes shown makes the driver really link them now.
export function warmUp() {
  const { renderer, scene, camera } = ctx;
  const before = renderer.info.programs ? renderer.info.programs.length : 0;
  try { renderer.compile(scene, camera); } catch { /* the first frame will compile instead */ }
  const hidden = [];
  scene.traverse((o) => { if (!o.visible && (o.isMesh || o.isSprite)) hidden.push(o); });
  for (const o of hidden) o.visible = true;
  try { renderer.render(scene, camera); } catch { /* ignore */ }
  for (const o of hidden) o.visible = false;
  if (DEBUG) console.log(`[renderer] shader warm-up: ${before} -> ${renderer.info.programs.length} programs`);
}

export function setCameraMode(m) {
  mode = m;
}

export function setFollowTarget(obj) {
  follow = obj;
}

// ---------------------------------------------------------------- fitting the play camera
const tanHalfOf = (fovDeg) => Math.tan(fovDeg * 0.5 * DEG);

// ndc of a world point for a camera at (cx, cy, cz), pitched down by `pitch`
function project(cx, cy, cz, pitch, aspect, tanHalf, px, py, pz, out) {
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  const depth = -dy * sin - dz * cos;           // along the view direction (0, -sin, -cos)
  if (depth <= 0.01) { out.x = out.y = 9; return out; }
  const yc = dy * cos - dz * sin;
  out.x = dx / depth / (tanHalf * aspect);
  out.y = yc / depth / tanHalf;
  return out;
}

const tmp = { x: 0, y: 0 };

function computeFit(aspect) {
  const size = deckSize();
  const b = deckBounds();
  const portrait = size.orientation === 'portrait';
  const tanHalf = tanHalfOf(C.fov);
  const anchor = C.bottomNdc[portrait ? 'portrait' : 'landscape'];
  const pad = 1 - C.screenPad;
  // the rectangle that must be on screen: the walkable area plus the margin (at most a little past the deck itself)
  const rw = Math.min(b.halfWidth + C.fitMargin, size.width / 2 + 0.4);
  const rd = Math.min(b.halfDepth + C.fitMargin, size.depth / 2 + 0.4);
  const fx = C.followShare * b.halfWidth + KICK_MAX;   // follow extremes, plus room for the dash kick
  const fz = C.followShare * b.halfDepth + KICK_MAX;

  const attempt = (phi) => {
    // the tilt that puts the near edge on the anchor line (a steeper tilt lifts everything on screen)
    const solvePitch = (D) => {
      let lo = 2 * DEG;
      let hi = 88 * DEG;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        project(0, D * Math.sin(phi), D * Math.cos(phi), mid, aspect, tanHalf, 0, 0, rd, tmp);
        if (tmp.y < anchor) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const fits = (D, pitch) => {
      for (const ox of [-fx, 0, fx]) {
        for (const oz of [-fz, 0, fz]) {
          const cy = D * Math.sin(phi);
          const cz = D * Math.cos(phi) + oz;
          for (const sx of [-rw, rw]) {
            for (const sz of [-rd, rd]) {
              project(ox, cy, cz, pitch, aspect, tanHalf, sx, 0, sz, tmp);
              if (Math.abs(tmp.x) > pad || tmp.y > pad || tmp.y < -0.985) return false;
            }
          }
        }
      }
      return true;
    };
    let lo = 6;
    let hi = 120;
    if (!fits(hi, solvePitch(hi))) return null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, solvePitch(mid))) hi = mid; else lo = mid;
    }
    return { D: hi, phi, pitch: solvePitch(hi) };
  };
  // narrow or short screens may not fit the deck at the preferred elevation: ease it off until they do
  for (let deg = C.elevationDeg; deg >= 14; deg -= 2) {
    const r = attempt(deg * DEG);
    if (r) return r;
  }
  return { D: 60, phi: 30 * DEG, pitch: 30 * DEG };
}

function ensureFit() {
  const size = deckSize();
  const key = `${ctx.camera.aspect.toFixed(4)}|${size.width}|${size.depth}`;
  if (key !== fitKey) {
    fitKey = key;
    fit = computeFit(ctx.camera.aspect);
  }
}

// ---------------------------------------------------------------- per frame
const target = { x: 0, y: 0, z: 0, pitch: 0, e9: 0 };

function aim() {
  const tanHalf = tanHalfOf(C.fov);
  if (mode === 'menu') {
    const m = C.menu[isPortraitScreen() ? 'portrait' : 'landscape'];
    target.x = m.pos[0]; target.y = m.pos[1]; target.z = m.pos[2];
    target.pitch = m.pitchDeg * DEG;
    // lens shift: the real horizon (ndc = tan(tilt) / tanHalf - shift) goes to the menu's horizonFrac
    target.e9 = Math.tan(target.pitch) / tanHalf - (1 - 2 * m.horizonFrac);
    return;
  }
  ensureFit();
  let D = fit.D;
  let phi = fit.phi;
  let ox = 0;
  let oz = 0;
  if (mode === 'over') {
    D *= C.over.farther;
    phi += C.over.higherDeg * DEG;
    ox = Math.sin(clock * 0.35) * C.over.drift;
  } else if (follow) {
    // the follow target leads the player a little (velocity x lookAhead), still inside the walkable area, so the
    // follow share and the deck fit hold; reduced motion switches the look-ahead off
    let tx = follow.position.x;
    let tz = follow.position.z;
    const mo = follow.userData?.motion;
    if (mo && !state.settings.reducedMotion) {
      const b = deckBounds();
      tx = Math.max(-b.halfWidth, Math.min(b.halfWidth, tx + mo.vx * TUNE.lookAhead));
      tz = Math.max(-b.halfDepth, Math.min(b.halfDepth, tz + mo.vz * TUNE.lookAhead));
    }
    ox = tx * C.followShare;
    oz = tz * C.followShare;
  }
  target.x = ox;
  target.y = D * Math.sin(phi);
  target.z = D * Math.cos(phi) + oz;
  target.pitch = fit.pitch;
  target.e9 = 0;
}

export function renderFrame(realDt) {
  const { renderer, scene, camera } = ctx;
  clock += realDt;
  aim();
  if (snapNext) {
    pose.x.x = target.x; pose.y.x = target.y; pose.z.x = target.z; pose.pitch.x = target.pitch; pose.e9.x = target.e9;
    snapNext = false;
  }
  const playing = mode === 'play';
  const fFreq = playing ? TUNE.camFollowFreq : C.poseFreq;
  const fZeta = playing ? C.followZeta : 1;
  springStep(pose.x, target.x, fFreq, fZeta, realDt);
  springStep(pose.z, target.z, fFreq, fZeta, realDt);
  springStep(pose.y, target.y, C.poseFreq, 1, realDt);
  springStep(pose.pitch, target.pitch, C.poseFreq, 1, realDt);
  springStep(pose.e9, target.e9, C.poseFreq, 1, realDt);

  // dash kick: a tiny push in the dash direction on a spring (off with reduced motion)
  const mo = follow && follow.userData?.motion;
  const kick = mo && mo.dashing && playing && !state.settings.reducedMotion ? Math.min(KICK_MAX, TUNE.dashKick) : 0;
  springStep(kickX, mo ? mo.dirX * kick : 0, 7, 0.55, realDt);
  springStep(kickZ, mo ? mo.dirZ * kick : 0, 7, 0.55, realDt);

  const shake = cameraShake();
  camera.position.set(pose.x.x + shake.x + kickX.x, pose.y.x + shake.y, pose.z.x + kickZ.x);
  camera.rotation.set(-pose.pitch.x, 0, shake.roll);
  camera.updateMatrixWorld();

  // lens shift (menu only; zero in play)
  camera.projectionMatrix.elements[9] = pose.e9.x;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

  const water = consumeWaterColor();   // the water is the clear colour: the journey changes it by phase (step 6)
  if (water) renderer.setClearColor(water);
  syncBackdrop(camera, 1 - 2 * C.horizonFrac);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- portrait
let portrait = null;

export function makePortrait(characterObject) {
  try {
    const { renderer } = ctx;
    const size = 128;
    if (!portrait) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#ffe2bd', '#8a6a4a', 1.6));
      const light = new THREE.DirectionalLight('#fff0d6', 2);
      light.position.set(1.5, 2.5, 4);
      scene.add(light);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      const rt = new THREE.WebGLRenderTarget(size, size);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      portrait = { scene, camera, target: rt, holder: new THREE.Group(), pixels: new Uint8Array(size * size * 4) };
      scene.add(portrait.holder);
    }
    const { scene, camera, target: rt, holder, pixels } = portrait;
    const copy = characterObject.clone(true);   // shares geometry and materials with the original
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.scale.set(1, 1, 1);
    copy.visible = true;
    copy.traverse((o) => { if (o.isSprite) o.visible = false; });   // no name tag
    holder.add(copy);
    camera.position.set(0, 1.86, 2.3);
    camera.lookAt(0, 1.8, 0);

    const oldTarget = renderer.getRenderTarget();
    const oldColor = new THREE.Color();
    renderer.getClearColor(oldColor);
    const oldAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldColor, oldAlpha);
    holder.remove(copy);

    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {   // readPixels is bottom-up
      img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  } catch (err) {
    console.warn('[renderer] portrait failed', err);
    return '';
  }
}
