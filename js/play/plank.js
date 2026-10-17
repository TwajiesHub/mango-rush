// Mango Rush — the golden plank.   OWNER: Claude Code  ·  STATUS: step 5b
//
// CONTRACT:
//   initPlank(parent)      parent = barge.deckRoot(). Two flat gold overlays (the current segment and the incoming one).
//   resetPlank(rng)        run start. Draws ALL the plank choices NOW (CONFIG.plank.picks numbers from the run's rng, in order), so the
//                          Daily Run's draw order never depends on time or on the player. drops.js calls it from resetDrops, right
//                          after the early-golden draw.
//   updatePlank(dt)        every frame while playing: the schedule, the shimmer, the fades. Reads state.time.
//   onPlank(x, z) -> boolean   is the point on the golden plank right now? (catches there pay x2, into the pot: see scoring.js)
//   getPlankDebug() -> { x, z, w, l, index, inSeconds, active }   for the ?debug panel
//
// THE SEGMENT. About 1.5 wide and 3 long, lined up with the painted planks (barge.plankLayout()): a plank column, from a butt joint
// or from the far end of the board. Only segments FULLY inside the walkable ellipse, and never one that touches a bank spot, are
// candidates; the candidate list depends on the deck (landscape or portrait) and on nothing else.
// TIMING (CONFIG.plank). First seen at 20 s, then a new segment every 15 s. One second before each move the incoming segment shimmers
// at its new spot while the old one is still there; at the move the old one fades out and the new one settles into a gentle shimmer.
// Draw calls: two small transparent quads (one while nothing is moving).

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { deckBounds, plankLayout } from '../world/barge.js';
import { bankSpots, layoutBankSpots } from './bank.js';

const P = CONFIG.plank;
const FADE = 0.5;                   // the old segment fades out over this long

let parent = null;
let candidates = [];
let picks = [];                     // indices into candidates, one per slot (drawn at reset)
const slots = [];                   // two overlays: { mesh, mat, rect }
let curSlot = 0;
let lastK = -1;                     // the slot index (time slot k) shown as current
const rect = { x: 0, z: 0, w: P.width, l: P.length, on: false };

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
precision highp float;
uniform float uTime, uOpacity, uFlash;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float inside = smoothstep(0.5, 0.36, abs(p.x)) * smoothstep(0.5, 0.40, abs(p.y));
  float rim = smoothstep(0.30, 0.44, abs(p.x)) * inside;
  float shimmer = 0.5 + 0.5 * sin((vUv.y * 5.0 - uTime * 1.4) * 3.14159 + sin(vUv.x * 9.0 + uTime) * 1.2);
  float flash = uFlash * (0.5 + 0.5 * sin(uTime * 32.0));
  vec3 col = mix(vec3(1.0, 0.74, 0.18), vec3(1.0, 0.95, 0.66), clamp(shimmer * 0.55 + flash * 0.5, 0.0, 1.0));
  float a = inside * (0.26 + 0.2 * shimmer + 0.35 * flash) + rim * 0.3;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uOpacity);
  #include <colorspace_fragment>
}`;
const TIME = { value: 0 };

function makeSlot() {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: { uTime: TIME, uOpacity: { value: 0 }, uFlash: { value: 0 } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.028;
  mesh.visible = false;
  parent.add(mesh);
  return { mesh, mat, x: 0, z: 0, w: P.width, l: P.length, k: -1 };
}

export function initPlank(p) {
  parent = p;
  slots.push(makeSlot(), makeSlot());
}

// every segment that is fully inside the walkable ellipse and clear of the bank spots
function buildCandidates() {
  candidates = [];
  const L = plankLayout();
  const b = deckBounds();
  const spots = bankSpots();
  const inside = (x, z) => (x / b.halfWidth) ** 2 + (z / b.halfDepth) ** 2 <= 1;
  for (let i = 0; i < Math.ceil(L.width / L.plankW); i++) {
    const cx = -L.width / 2 + i * L.plankW + L.plankW / 2;
    // the boards of this column: between the butt joints (the stagger is (i * step) % butt, as painted)
    const j0 = (i * L.step) % L.butt;
    const edges = [-L.depth / 2];
    for (let z = -L.depth / 2 + j0; z < L.depth / 2; z += L.butt) if (z > -L.depth / 2 + 0.01) edges.push(z);
    edges.push(L.depth / 2);
    for (let e = 0; e < edges.length - 1; e++) {
      const a = edges[e];
      const bb = edges[e + 1];
      if (bb - a < P.length - 1e-6) continue;
      for (const zs of [a, bb - P.length]) {        // lined up with the near joint, or with the far one
        const cz = zs + P.length / 2;
        const hx = P.width / 2;
        const hz = P.length / 2;
        if (!(inside(cx - hx, cz - hz) && inside(cx + hx, cz - hz) && inside(cx - hx, cz + hz) && inside(cx + hx, cz + hz))) continue;
        let clear = true;
        for (const s of spots) {
          const nx = Math.max(cx - hx, Math.min(s.x, cx + hx));
          const nz = Math.max(cz - hz, Math.min(s.z, cz + hz));
          if (Math.hypot(s.x - nx, s.z - nz) < s.r + 0.1) { clear = false; break; }
        }
        if (clear && !candidates.some((c) => Math.abs(c.x - cx) < 1e-6 && Math.abs(c.z - cz) < 1e-6)) candidates.push({ x: cx, z: cz });
      }
    }
  }
}

export function resetPlank(rng) {
  layoutBankSpots();
  buildCandidates();
  picks = [];
  let prev = -1;
  for (let k = 0; k < P.picks; k++) {
    const u = rng.next();                                    // ALWAYS drawn, whatever the candidates are
    let idx = Math.floor(u * candidates.length);
    if (candidates.length > 1 && idx === prev) idx = (idx + 1) % candidates.length;   // never the same segment twice in a row
    picks.push(idx);
    prev = idx;
  }
  lastK = -1;
  rect.on = false;
  for (const s of slots) { s.mesh.visible = false; s.k = -1; s.mat.uniforms.uOpacity.value = 0; }
}

const segOf = (k) => candidates[picks[Math.min(k, picks.length - 1)]];

function show(slot, k, flash) {
  const c = segOf(k);
  if (!c) return;
  slot.k = k;
  slot.x = c.x;
  slot.z = c.z;
  slot.mesh.position.set(c.x, 0.028, c.z);
  slot.mesh.scale.set(P.width, 1, P.length);
  slot.mesh.visible = true;
  slot.mat.uniforms.uFlash.value = flash;
}

export function updatePlank(dt) {
  if (!slots.length || !candidates.length) return;
  TIME.value += dt;
  const t = state.time;
  if (t < P.from - P.warn) return;
  // k = which segment is current (the first appears at P.from, each next one `every` seconds later)
  const k = Math.min(P.picks - 1, Math.max(-1, Math.floor((t - P.from) / P.every)));
  const nextAt = P.from + (k + 1) * P.every;
  const warning = nextAt - t <= P.warn && k + 1 < P.picks;
  const calm = state.settings.reducedMotion;

  if (k !== lastK) {                       // the move happened: the old one fades out, the new one settles
    const old = slots[curSlot];
    const incoming = slots.find((s) => s.k === k && s.mesh.visible) || slots[1 - curSlot];
    if (incoming !== old && old.mesh.visible) { old.fading = FADE; }
    if (incoming.k !== k) show(incoming, k, 0);
    incoming.mat.uniforms.uFlash.value = 0;
    incoming.fading = 0;
    curSlot = slots.indexOf(incoming);
    lastK = k;
  }
  const cur = slots[curSlot];
  const other = slots[1 - curSlot];
  if (warning && other.k !== k + 1) show(other, k + 1, calm ? 0 : 1);   // the shimmer at the new spot, before the old one goes
  for (const s of slots) {
    const u = s.mat.uniforms;
    if (s === cur) u.uOpacity.value = Math.min(1, u.uOpacity.value + dt * 3);
    else if (s.mesh.visible && s.k === k + 1 && warning) u.uOpacity.value = Math.min(1, u.uOpacity.value + dt * 4);
    else if (s.mesh.visible) {
      s.fading = (s.fading ?? 0) - dt;
      u.uOpacity.value = Math.max(0, s.fading / FADE);
      if (s.fading <= 0) { s.mesh.visible = false; s.k = -1; u.uOpacity.value = 0; }
    }
  }
  rect.on = k >= 0;
  if (rect.on) { rect.x = cur.x; rect.z = cur.z; }
}

export function onPlank(x, z) {
  return rect.on && Math.abs(x - rect.x) <= P.width / 2 && Math.abs(z - rect.z) <= P.length / 2;
}

export function getPlankDebug() {
  const t = state.time;
  const k = Math.max(-1, Math.floor((t - P.from) / P.every));
  return { x: rect.x, z: rect.z, w: P.width, l: P.length, index: k, inSeconds: Math.max(0, P.from + (k + 1) * P.every - t), active: rect.on, candidates: candidates.length };
}
