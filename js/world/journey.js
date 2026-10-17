// Mango Rush — the lagoon backdrop, the journey, the light by phase and the ambient life.   OWNER: Claude Code  ·  STATUS: step 6
//
// CONTRACT:
//   buildJourney(scene) ; resetJourney() ; updateJourney(dt) ; syncBackdrop(camera, playLineNdc)
//   consumeWaterColor() -> THREE.Color | null   the water is the renderer's clear colour: the journey changes it by phase; renderer.js asks
//                                              once per frame (null = unchanged)
//   setJourneyDetail(level) -> void             the quality manager's level (renderer.js): 1 thins the ambient life, 2 also hides the far layer
//   getJourneyDebug() -> { place, phase, blend, wet, ... }   for the ?debug panel
//   syncBackdrop(camera, playLineNdc) is called by renderer.js every frame AFTER the camera has its final pose (follow, shake and roll
//     included) and its lens shift. playLineNdc is where the horizon is painted when the real one is off the top of the screen.
//   updateJourney(dt): dt is the play dt in a run and a slow real dt on the start screen. On the pause and game-over screens the
//     journey FREEZES where it is (the clock is state.time, which stops).
//
// THE JOURNEY (CONFIG.journey). Everything is a pure function of RUN TIME (state.time), never of the rng, so every player and every
// Daily Run sees the same trip. The barge drifts toward screen-left, so scenery moves left to right past six places in order
// (PLACE_ENTER is emitted once per place per run, when its scenery starts to enter): Makoko, the mangroves, the bridge, the waterfront,
// the city, open water. The start screen is always golden hour (time 0).
//
// THE LAYERS (depth order, all FLAT painted cut-outs: no textures, no canvases during a run):
//   1 sky       painted bands + clouds (vertex colours, recoloured by the phase blend), stars and the dot-art moon, the sun with its dot
//               rings. It does not scroll.
//   2 far       hazy hills and the distant skyline: very slow parallax. It is periodic and wraps invisibly. By day it is a faint haze (the colour
//               of the horizon); at dusk it darkens and at night its windows are lit (the city "lights up", place 'city', from 150 s).
//   3 banks     Makoko stilt houses, canoes, a fisherman, palms; mangrove clumps; the market with lantern strings; low warehouses: medium speed.
//   4 water     the shimmer streaks (saffron by day, lit-window reflections at night): the barge's streaks mesh is reused, nothing new.
//   5 the deck  lanterns and wet edges: world/barge.js.
//   6 foreground the cable bridge (deck, cables, pillars), overhanging mangrove branches: fast. They sit BEHIND the deck and the character
//               in the draw order, so they can never cover the walkable area or a ring.
// Each layer is ONE merged mesh of shapes on a long strip (scrolled by moving the mesh); lit windows are vertex-coloured quads that
// glow with the phase. Draw order (renderOrder, no depth test): barge water streaks, sky, stars, moon, sun, far, streaks, banks,
// foreground, wings (birds, bats), dots (fireflies, fireworks). Everything is OPAQUE (the sun and the moon use alpha test): three draws
// transparent things after all opaque ones, which would paint them over the deck and the character.
//
// WHERE THE HORIZON IS. Every frame the real horizon is found by PROJECTING two far points on the (imagined) water plane at CONFIG.deck.waterY
// with the final camera (so a lens shift, tilt, follow, shake and roll are all included). That gives a line on the screen: a height and a
// slope. The backdrop hangs on the camera and is laid out relative to THAT line, in screen-height units:
//   - menu camera (looks almost level): the real horizon is on screen, the backdrop sits exactly on it;
//   - play / over camera (tilted steeply): the real horizon is far above the top of the screen, so the line is clamped to
//     playLineNdc: the sky, sun and banks are painted as a window over the top of the screen;
//   - in between the line follows min(real horizon, playLine), so it moves smoothly.
// The sky and the celestial bodies are clipped by a plane through the camera and that line.
//
// LIGHT. A hemisphere light, one key light and a RIM light from behind and above (always in the scene, so no shader ever recompiles; its
// intensity is 0 by day). By phase the colours and intensities blend over CONFIG.journey.blend seconds. The deck's paint is unlit, so
// barge.setDeckLook tints it. The warning rings, the bank rings and the items' shadows are unlit/own-light and stay as bright as by day.
// AMBIENT LIFE (pooled, nothing allocated per frame): birds crossing the sun (golden hour), bats (dusk), fireflies (night), a fisherman who
// waves once, fireworks at midnight. FLASH SAFETY: a firework's scene tint is soft (CONFIG.journey.fireworks.flash, never white) and bursts
// are at least fireworks.minGap seconds apart (so never more than 3 flashes a second, in practice about one every 3 to 5 s). With the
// reduced-motion setting on there is no scene tint at all and the fireworks are gentle glows that do not move.

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, emit } from '../core/events.js';
import { flat } from './materials.js';
import { setLanternLevel, setDeckLook } from './barge.js';
import { placeIndexAt, phaseBlend, sunDrop, smooth, flashAllowed } from '../core/journeymath.js';

const DEG = Math.PI / 180;
const RIG_DIST = 400;                 // how far in front of the camera the backdrop hangs (it has no depth effect)
const J = CONFIG.journey;
const ORDER = { sky: -9, stars: -8.8, moon: -8.6, sun: -8, far: -7.5, streaks: -7, bank: -6, fg: -5.5, wings: -5.2, dots: -5.1 };
const HW = 2.7;                       // half the widest view (screen-height units): content starts just outside it
const WARM_C = new THREE.Color('#FFC257');   // the colour of a lit window
const WARM = [WARM_C.r, WARM_C.g, WARM_C.b];   // (in the working colour space, like every vertex colour here)
const CREAM_C = new THREE.Color('#FFF1D6');
const CREAM = [CREAM_C.r, CREAM_C.g, CREAM_C.b];

let rig = null;
let sunMesh = null;
let moonMesh = null;
let streaks = null;
let aspectDone = -1;
let aspect = 1.6;
let clock = 0;
let detail = 0;
const clip = new THREE.Plane();
const clipPlanes = [clip];
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const nrm = new THREE.Vector3();
const dummy = new THREE.Object3D();
const color = new THREE.Color();

function backdrop(mesh, order, clipped) {
  mesh.material.depthTest = false;
  mesh.material.depthWrite = false;
  if (clipped) mesh.material.clippingPlanes = clipPlanes;
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- tiny deterministic random (the scenery is the same every time)
function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- a merged geometry of flat shapes (z = 0), with vertex colours
const W3 = [1, 1, 1];
class Geo {
  constructor() { this.p = []; this.c = []; this.ranges = []; this.open = null; }
  v(x, y, col) { this.p.push(x, y, 0); this.c.push(col[0], col[1], col[2]); }
  tri(ax, ay, bx, by, cx, cy, col = W3) { this.v(ax, ay, col); this.v(bx, by, col); this.v(cx, cy, col); }
  rect(x0, y0, x1, y1, col = W3) { this.tri(x0, y0, x1, y0, x1, y1, col); this.tri(x0, y0, x1, y1, x0, y1, col); }
  quad(ax, ay, bx, by, cx, cy, dx, dy, col = W3) { this.tri(ax, ay, bx, by, cx, cy, col); this.tri(ax, ay, cx, cy, dx, dy, col); }
  poly(pts, col = W3) { for (let i = 2; i + 3 < pts.length; i += 2) this.tri(pts[0], pts[1], pts[i], pts[i + 1], pts[i + 2], pts[i + 3], col); }
  ellipse(cx, cy, rx, ry, seg = 10, col = W3) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri(cx, cy, cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, col);
    }
  }
  circle(cx, cy, r, seg = 8, col = W3) { this.ellipse(cx, cy, r, r, seg, col); }
  line(x0, y0, x1, y1, w, col = W3) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * w * 0.5;
    const ny = (dx / l) * w * 0.5;
    this.quad(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, col);
  }
  begin(kind, id = 0) { this.open = { kind, id, start: this.p.length / 3, end: 0 }; }
  end() { this.open.end = this.p.length / 3; this.ranges.push(this.open); this.open = null; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

function shapesMaterial() {
  return flat('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------- sky: painted bands with hard, slightly wavy edges + soft flat clouds
const SKY_H = 3.6;                    // units above the line
const BAND_EDGES = [0.5, 0.27, 0.12, -1];   // the top of each band: band 0 fills everything, band 3 sits on the horizon
function buildSky() {
  const g = new Geo();
  const x0 = -6;
  const x1 = 6;
  const step = 0.15;
  for (let i = 0; i < 4; i++) {
    g.begin('sky', i);
    const edge = i === 0 ? SKY_H : BAND_EDGES[i - 1];
    const wob = (x) => (i === 0 ? 0 : Math.sin(x * 1.1 + i * 2) * 0.02 + Math.sin(x * 3.2 + i) * 0.008);
    for (let x = x0; x < x1; x += step) {
      g.quad(x, -1, x + step, -1, x + step, edge + wob(x + step), x, edge + wob(x));
    }
    g.end();
  }
  // clouds: a few flat ellipses, a shade lighter than the band they sit in
  g.begin('sky', 4);
  for (const [x, y, w, h] of [[-2.2, 0.2, 0.7, 0.045], [-0.4, 0.6, 0.55, 0.04], [1.3, 0.36, 0.8, 0.05], [2.4, 0.9, 0.5, 0.035], [-1.2, 0.45, 0.55, 0.04], [0.2, 0.9, 0.6, 0.04], [-2.8, 0.8, 0.5, 0.035], [2.9, 0.15, 0.6, 0.04]]) {
    g.ellipse(x, y, w / 2, h / 2, 14);
    g.ellipse(x + w * 0.22, y + h * 0.45, w * 0.28, h * 0.7, 12);
  }
  g.end();
  return g;
}

// ---------------------------------------------------------------- sun and moon (two small textures, painted once)
function sunTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const m = S / 2;
  g.fillStyle = '#F2A93B';
  g.beginPath();
  g.arc(m, m, 165, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#F6BE63';   // the lighter inner disc, off-centre
  g.beginPath();
  g.arc(m - 26, m - 20, 148, 0, Math.PI * 2);
  g.fill();
  const ring = (radius, count, size, col, alt = null, offset = 0) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + offset;
      g.fillStyle = alt && i % 2 ? alt : col;
      g.beginPath();
      g.arc(m + Math.cos(a) * radius, m + Math.sin(a) * radius, alt && i % 2 ? size * 0.6 : size, 0, Math.PI * 2);
      g.fill();
    }
  };
  ring(222, 52, 6.5, '#F2A93B', '#FFF1D6');
  ring(290, 72, 5.5, '#C8432E', '#F2A93B', 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the dot-art moon: a cream disc, a few soft craters and a ring of dots
function moonTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const m = S / 2;
  g.fillStyle = '#FFF1D6';
  g.beginPath();
  g.arc(m, m, 118, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#EAD7AE';
  for (const [dx, dy, r] of [[-38, -28, 26], [30, 20, 34], [-6, 52, 16], [52, -44, 14], [-52, 34, 10]]) { g.beginPath(); g.arc(m + dx, m + dy, r, 0, Math.PI * 2); g.fill(); }
  const ring = (radius, count, size, col) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      g.fillStyle = col;
      g.beginPath();
      g.arc(m + Math.cos(a) * radius, m + Math.sin(a) * radius, size, 0, Math.PI * 2);
      g.fill();
    }
  };
  ring(150, 40, 4.6, '#FFF1D6');
  ring(184, 54, 3.6, '#B8C8E0');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- stars: single dots and a few dot-ring stars
function buildStars() {
  const g = new Geo();
  const r = rnd(31);
  const cream = CREAM;
  for (let i = 0; i < 90; i++) g.circle((r() - 0.5) * 7.2, 0.05 + Math.pow(r(), 1.3) * 1.8, 0.0035 + r() * 0.004, 6, cream);
  for (let i = 0; i < 16; i++) {
    const x = (r() - 0.5) * 7;
    const y = 0.08 + r() * 1.6;
    g.circle(x, y, 0.006, 6, cream);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.circle(x + Math.cos(a) * 0.022, y + Math.sin(a) * 0.022, 0.0028, 5, cream); }
  }
  return g;
}

// ---------------------------------------------------------------- shapes for the layers (screen-height units, y = 0 is the horizon line)
function leaf(g, cx, cy, ang, len, droop) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const mx = cx + ca * len * 0.5;
  const my = cy + sa * len * 0.5;
  g.tri(cx, cy, mx - sa * len * 0.12, my + ca * len * 0.12, cx + ca * len, cy + sa * len - len * droop);
  g.tri(cx, cy, mx + sa * len * 0.1, my - ca * len * 0.1, cx + ca * len, cy + sa * len - len * droop);
}

function palm(g, x, base, h, lean) {
  const w = h * 0.04;
  const pts = [];
  for (let i = 0; i <= 4; i++) { const u = i / 4; pts.push([x + lean * u * u, base + h * u, w * (1 - u * 0.4)]); }
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    g.quad(a[0] - a[2], a[1], a[0] + a[2], a[1], b[0] + b[2], b[1], b[0] - b[2], b[1]);
  }
  const tx = x + lean;
  const ty = base + h;
  for (const [ang, len] of [[0.2, 0.55], [0.9, 0.5], [1.7, 0.42], [2.5, 0.5], [3.1, 0.55], [3.9, 0.42], [-0.5, 0.45]]) leaf(g, tx, ty, ang, h * len, 0.5);
}

function house(g, x, base, w, h) {
  const stilt = h * 0.38;
  const sw = w * 0.045;
  for (const k of [-0.38, 0, 0.38]) g.rect(x + k * w - sw, base - 0.012, x + k * w + sw, base + stilt);
  g.rect(x - w / 2, base + stilt, x + w / 2, base + h * 0.78);
  g.poly([x - w * 0.62, base + h * 0.78, x + w * 0.62, base + h * 0.78, x + w * 0.14, base + h, x - w * 0.14, base + h]);
  g.begin('lit');
  g.rect(x - w * 0.12, base + stilt + h * 0.14, x + w * 0.12, base + stilt + h * 0.3);
  g.end();
}

function canoe(g, x, y, len, person) {
  const h = len * 0.5;
  g.poly([x - h, y + 0.008, x - h * 0.78, y - 0.007, x + h * 0.78, y - 0.007, x + h, y + 0.009]);
  if (person) {
    g.circle(x, y + 0.04, 0.0075, 8);
    g.tri(x - 0.011, y + 0.004, x + 0.011, y + 0.004, x, y + 0.034);
    g.line(x + 0.015, y + 0.005, x + 0.03, y + 0.07, 0.003);    // the pole
  }
}

function mangrove(g, x, base, w, h, r) {
  g.ellipse(x, base + h * 0.45, w * 0.5, h * 0.55, 12);
  g.ellipse(x - w * 0.28, base + h * 0.35, w * 0.32, h * 0.42, 10);
  g.ellipse(x + w * 0.3, base + h * 0.32, w * 0.3, h * 0.4, 10);
  const n = 6 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const rx = x - w * 0.42 + (i / (n - 1)) * w * 0.84;
    g.line(rx, base + 0.012, rx + (r() - 0.5) * 0.03, base - 0.04 - r() * 0.012, 0.0045);   // prop roots in the water
  }
}

function stall(g, x, base, w, h) {
  g.rect(x - w / 2, base - 0.004, x + w / 2, base + h * 0.5);
  g.poly([x - w * 0.62, base + h * 0.5, x + w * 0.62, base + h * 0.5, x + w * 0.44, base + h * 0.78, x - w * 0.44, base + h * 0.78]);
  g.rect(x - w * 0.56, base, x - w * 0.5, base + h * 0.5);
  g.begin('lit');
  g.circle(x, base + h * 0.92, 0.0085, 8);
  g.rect(x - w * 0.28, base + h * 0.14, x + w * 0.28, base + h * 0.3);
  g.end();
}

function lanternString(g, x0, x1, y) {
  g.begin('lit');
  const n = Math.max(3, Math.round(Math.abs(x1 - x0) / 0.045));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    g.circle(x0 + (x1 - x0) * u, y - Math.sin(u * Math.PI) * 0.03, 0.0052, 6);
  }
  g.end();
}

function building(g, x, w, h, r, base = 0) {
  g.rect(x - w / 2, base, x + w / 2, base + h);
  if (r() < 0.35) g.rect(x - w * 0.3, base + h, x + w * 0.3, base + h + h * 0.12);    // a stepped top
  if (r() < 0.25) g.line(x + (r() - 0.5) * w * 0.4, base + h, x + (r() - 0.5) * w * 0.2, base + h + 0.05, 0.0035);   // an antenna
  g.begin('lit');
  const cols = Math.max(1, Math.floor(w / 0.026));
  const rows = Math.max(1, Math.floor(h / 0.034));
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (r() > 0.6) continue;
      const wx = x - w / 2 + ((cx + 0.5) / cols) * w;
      const wy = base + ((cy + 0.5) / rows) * h * 0.92 + h * 0.02;
      g.rect(wx - 0.005, wy - 0.006, wx + 0.005, wy + 0.006);
    }
  }
  g.end();
}

const T = J.places.map((p) => p.t);
const FISHER_C = -0.6;     // where the fisherman's canoe sits on the banks strip
// where place k's content starts (its right-hand end): its scenery begins to enter the LEFT edge of the screen at time T[k] at this layer's speed
const startOf = (k, s) => (k === 0 ? HW + 0.9 : -HW - s * T[k]);

// ---------------------------------------------------------------- banks layer (medium speed)
function buildBanks() {
  const s = J.speeds.bank;
  const g = new Geo();
  const r = rnd(11);
  const N = J.places.length;
  const heights = [0.035, 0.07, 0.04, 0.052, 0.024, 0.0];
  const tail = startOf(N - 1, s) - 1;
  const top = (c) => {
    let k = N - 1;
    for (let i = 0; i < N; i++) if (c <= startOf(i, s) && (i === N - 1 || c > startOf(i + 1, s))) { k = i; break; }
    let h = heights[k];
    const edge = 0.45;     // ease between neighbouring places
    if (k > 0 && c > startOf(k, s) - edge) h += (heights[k - 1] - h) * smooth((c - (startOf(k, s) - edge)) / edge);
    return h + Math.sin(c * 2.1 + k) * 0.006 + Math.sin(c * 5.3 + 1) * 0.004;
  };
  // the land strip along the whole journey
  for (let c = tail; c < startOf(0, s); c += 0.08) {
    const a = top(c);
    const b = top(c + 0.08);
    if (a < 0.002 && b < 0.002) continue;
    g.quad(c, 0, c + 0.08, 0, c + 0.08, b, c, a);
  }
  for (let k = 0; k < N; k++) {
    const hi = startOf(k, s);
    const lo = k === N - 1 ? hi - 3 : startOf(k + 1, s);
    if (k === 0) {                                  // Makoko: stilt houses, palms, canoes and a fisherman
      for (let c = hi - 0.3; c > lo; c -= 0.28 + r() * 0.24) {
        const w = 0.1 + r() * 0.07;
        house(g, c, top(c) - 0.01, w, w * (1.05 + r() * 0.2));
        if (r() < 0.45) palm(g, c + 0.16 + r() * 0.1, top(c) - 0.01, 0.15 + r() * 0.14, (r() - 0.5) * 0.06);
      }
      canoe(g, FISHER_C, -0.025, 0.22, true);          // the fisherman who waves once (see updateAmbient)
      for (let c = hi - 0.7; c > lo + 0.3; c -= 1.1 + r() * 0.6) if (Math.abs(c - FISHER_C) > 0.5) canoe(g, c, -0.02 - r() * 0.02, 0.2 + r() * 0.06, r() < 0.7);
    } else if (k === 1) {                           // the mangroves: dense dark clumps with roots in the water
      for (let c = hi; c > lo; c -= 0.16 + r() * 0.12) mangrove(g, c, top(c) - 0.012, 0.18 + r() * 0.14, 0.09 + r() * 0.1, r);
    } else if (k === 2) {                           // under the bridge: a quiet bank
      for (let c = hi - 0.2; c > lo; c -= 0.5 + r() * 0.5) {
        if (r() < 0.5) palm(g, c, top(c) - 0.01, 0.14 + r() * 0.1, (r() - 0.5) * 0.05); else mangrove(g, c, top(c) - 0.012, 0.16, 0.07, r);
      }
    } else if (k === 3) {                           // the waterfront market: stalls and strings of lanterns
      const xs = [];
      for (let c = hi - 0.2; c > lo; c -= 0.3 + r() * 0.12) { stall(g, c, top(c), 0.11 + r() * 0.04, 0.085 + r() * 0.03); xs.push(c); }
      for (let i = 0; i + 1 < xs.length; i += 1) lanternString(g, xs[i], xs[i + 1], top(xs[i]) + 0.12);
      for (let c = hi - 0.5; c > lo + 0.2; c -= 0.9 + r() * 0.5) canoe(g, c, -0.025, 0.2, false);
    } else if (k === 4) {                           // the city side: low warehouses on the near bank
      for (let c = hi - 0.1; c > lo; c -= 0.34 + r() * 0.3) building(g, c, 0.1 + r() * 0.1, 0.03 + r() * 0.04, r, top(c) - 0.004);
    }
  }
  return g;
}

// ---------------------------------------------------------------- far layer (very slow): hills, then the lit skyline (periodic)
const SKY_PERIOD = 6;
function buildFar() {
  const g = new Geo();
  const r = rnd(23);
  // ONE period of hills and buildings, repeated three times to the left of the right-hand end (so the mesh can wrap by a period)
  const reps = 3;
  const hills = [];
  for (let x = 0; x < SKY_PERIOD; x += 0.3 + r() * 0.5) hills.push({ x, rx: 0.35 + r() * 0.4, ry: 0.04 + r() * 0.05 });
  const template = [];
  for (let x = 0.1; x < SKY_PERIOD - 0.1; x += 0.08 + r() * 0.07) {
    const tall = r() < 0.16;
    template.push({ x, w: 0.06 + r() * 0.06, h: tall ? 0.2 + r() * 0.1 : 0.06 + r() * 0.12, tower: x > 1.5 && x < 1.62, seed: Math.floor(r() * 1e6) });
  }
  for (let rep = 0; rep < reps; rep++) {
    const off = startOf(0, 0) - (rep + 1) * SKY_PERIOD;
    for (const h of hills) g.ellipse(off + h.x, 0, h.rx, h.ry, 14);
    for (const b of template) {
      const rr = rnd(b.seed);
      building(g, off + b.x, b.w, b.h, rr, -0.002);
      if (b.tower) {   // a landmark: a slim tower with a spire
        g.rect(off + b.x - 0.012, -0.002, off + b.x + 0.012, 0.32);
        g.tri(off + b.x - 0.012, 0.32, off + b.x + 0.012, 0.32, off + b.x, 0.4);
        g.begin('lit'); g.circle(off + b.x, 0.405, 0.007, 6); g.end();
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------- foreground (fast): the cable bridge and overhanging mangrove branches
function buildForeground() {
  const s = J.speeds.fg;
  const g = new Geo();
  const r = rnd(5);
  // the bridge: its deck crosses the top of the view, towers every 3 units, cables swooping between them
  const b0 = startOf(2, s) + 1.2;
  const b1 = startOf(3, s) - 1.2;
  g.rect(b1, 0.3, b0, 0.345);
  g.rect(b1, 0.272, b0, 0.3);    // the girder under the deck
  const span = 3.2;
  g.begin('lit');
  for (let c = b1 + 0.2; c < b0; c += 0.34) g.circle(c, 0.262, 0.0085, 6);
  g.end();
  for (let t0 = b0 - 0.8; t0 - span > b1 - span; t0 -= span) {
    g.rect(t0 - 0.055, -0.25, t0 + 0.055, 0.66);                      // the pillar
    g.rect(t0 - 0.09, 0.3, t0 + 0.09, 0.37);                          // its cap
    const t1 = t0 - span;
    let px = t0;
    let py = 0.58;
    for (let i = 1; i <= 14; i++) {                                    // the cable: a sagging curve from tower to tower
      const u = i / 14;
      const x = t0 + (t1 - t0) * u;
      const y = 0.58 - Math.sin(u * Math.PI) * 0.21;
      g.line(px, py, x, y, 0.0075);
      if (i % 2 === 0 && x > b1 && x < b0) g.line(x, y, x, 0.345, 0.003);   // hangers
      px = x;
      py = y;
    }
  }
  // overhanging branches in the mangroves: dark leafy clumps hanging from the top edge
  const m0 = startOf(1, s);
  const m1 = startOf(2, s);
  for (let c = m0 - 1; c > m1; c -= 2.6 + r() * 1.4) {
    const y = 0.5 + r() * 0.06;
    g.line(c, y + 0.12, c - 0.35, y - 0.03, 0.03);
    for (let i = 0; i < 6; i++) g.ellipse(c - 0.05 - i * 0.06, y - 0.02 - (i % 2) * 0.03, 0.06, 0.035, 8);
  }
  return g;
}

// ---------------------------------------------------------------- the layers as meshes
const layers = {};
function makeLayer(name, geo, order, speed, clipped = false) {
  const g = geo.build();
  const mesh = backdrop(new THREE.Mesh(g, shapesMaterial()), order, clipped);
  const lit = geo.ranges.filter((q) => q.kind === 'lit');
  layers[name] = { mesh, geo: g, lit, speed, tint: new THREE.Color(1, 1, 1), litAmount: 0, key: '' };
  rig.add(mesh);
  return layers[name];
}

function recolorLit(L, amount) {
  if (!L.lit.length) return;
  const arr = L.geo.attributes.color.array;
  const t = L.tint;
  const k = amount;
  // lit windows are drawn white * the layer tint when off (they vanish into the silhouette); when on they are the warm colour
  const rr = 1 + (WARM[0] / Math.max(t.r, 1e-5) - 1) * k;
  const gg = 1 + (WARM[1] / Math.max(t.g, 1e-5) - 1) * k;
  const bb = 1 + (WARM[2] / Math.max(t.b, 1e-5) - 1) * k;
  for (const q of L.lit) {
    for (let i = q.start; i < q.end; i++) { arr[i * 3] = rr; arr[i * 3 + 1] = gg; arr[i * 3 + 2] = bb; }
  }
  L.geo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- palettes by phase
const PAL = {};
function toColors(p) {
  return {
    sky: p.sky.map((h) => new THREE.Color(h)), cloud: new THREE.Color(p.cloud), water: new THREE.Color(p.water), bank: new THREE.Color(p.bank), sun: new THREE.Color(p.sun),
    streak: new THREE.Color(p.streak), deck: new THREE.Color(p.deck), keyC: new THREE.Color(p.key[0]), keyI: p.key[1], hemiS: new THREE.Color(p.hemi[0]), hemiG: new THREE.Color(p.hemi[1]),
    hemiI: p.hemi[2], rimC: new THREE.Color(p.rim[0]), rimI: p.rim[1], stars: p.stars, litBank: p.litBank, litFar: p.litFar, farK: p.farK,
  };
}
const now = {   // the blended palette (reused, nothing allocated per frame)
  sky: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()], cloud: new THREE.Color(), water: new THREE.Color(), bank: new THREE.Color(),
  sun: new THREE.Color(), streak: new THREE.Color(), deck: new THREE.Color(), keyC: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), rimC: new THREE.Color(),
  keyI: 1, hemiI: 1, rimI: 0, stars: 0, litBank: 0, litFar: 0, farK: 0.2,
};
function blendPalette(a, b, u) {
  const A = PAL[a];
  const B = PAL[b];
  for (let i = 0; i < 4; i++) now.sky[i].copy(A.sky[i]).lerp(B.sky[i], u);
  for (const k of ['cloud', 'water', 'bank', 'sun', 'streak', 'deck', 'keyC', 'hemiS', 'hemiG', 'rimC']) now[k].copy(A[k]).lerp(B[k], u);
  for (const k of ['keyI', 'hemiI', 'rimI', 'stars', 'litBank', 'litFar', 'farK']) now[k] = A[k] + (B[k] - A[k]) * u;
}

// ---------------------------------------------------------------- build
let hemi = null;
let key = null;
let rim = null;
let skyG = null;
let skyGeo = null;
let starsMesh = null;
let wings = null;
let dots = null;
const waterOut = new THREE.Color();
let waterDirty = true;
const STREAK_N = 24;
const SUN_STREAKS = [
  // [how far below the line (units), length, x offset from the sun]
  [-0.05, 0.28, -0.06], [-0.085, 0.4, 0.07], [-0.12, 0.22, -0.14], [-0.16, 0.34, 0.03], [-0.2, 0.2, -0.04], [-0.24, 0.26, 0.11],
];
const streakBase = [];
const WIN_REFL = [];     // lit-window reflections under the skyline: 6 columns of 3 dashes each: [x (screen-height units), phase]

export function buildJourney(scene) {
  // the rig is a child of the camera (renderer.js adds the camera to the scene)
  const camera = scene.children.find((o) => o.isCamera);
  rig = new THREE.Group();
  camera.add(rig);
  for (const p of CONFIG.phases) PAL[p.id] = toColors(J.palettes[p.id]);

  // sky
  skyG = buildSky();
  skyGeo = skyG.build();
  const sky = backdrop(new THREE.Mesh(skyGeo, shapesMaterial()), ORDER.sky, true);
  sky.position.set(0, 0, 0);
  rig.add(sky);
  starsMesh = backdrop(new THREE.Mesh(buildStars().build(), shapesMaterial()), ORDER.stars, true);
  starsMesh.visible = false;
  rig.add(starsMesh);
  moonMesh = backdrop(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat('#ffffff', { map: moonTexture(), alphaTest: 0.5 })), ORDER.moon, true);
  moonMesh.visible = false;
  rig.add(moonMesh);
  sunMesh = backdrop(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat('#ffffff', { map: sunTexture(), alphaTest: 0.5 })), ORDER.sun, true);
  rig.add(sunMesh);

  // the layers
  makeLayer('far', buildFar(), ORDER.far, J.speeds.far);
  makeLayer('bank', buildBanks(), ORDER.bank, J.speeds.bank);
  makeLayer('fg', buildForeground(), ORDER.fg, J.speeds.fg);

  // water: the sun's saffron streaks by day, lit-window reflections under the skyline at night (one instanced mesh, reused)
  streaks = backdrop(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flat('#F2A93B'), STREAK_N), ORDER.streaks, false);
  rig.add(streaks);
  const r = rnd(3);
  for (let i = 0; i < 6; i++) WIN_REFL.push([(i / 5 - 0.5) * 4.6 + (r() - 0.5) * 0.3, r() * 6]);

  // ambient life: wings (birds and bats) and dots (fireflies, fireworks, the fisherman's arm): two small pooled instanced meshes
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.024, 0.011, 0, -0.011, -0.004, 0, 0, 0, 0, 0.024, 0.011, 0, 0.011, -0.004, 0], 3));
  wings = backdrop(new THREE.InstancedMesh(wg, flat('#ffffff', { side: THREE.DoubleSide }), 10), ORDER.wings, false);
  wings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(30), 3);
  rig.add(wings);
  const dg = new THREE.CircleGeometry(1, 8);
  dots = backdrop(new THREE.InstancedMesh(dg, flat('#ffffff'), DOT_N), ORDER.dots, false);
  dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DOT_N * 3), 3);
  rig.add(dots);
  for (let i = 0; i < 10; i++) { wing[i] = { on: false, type: 0, x: 0, y: 0, vx: 0, ph: 0, t: 0, amp: 0 }; }
  for (let i = 0; i < FW_N; i++) fire[i] = { on: false, t: 0, x: 0, y: 0, R: 0.1, col: new THREE.Color() };

  // light: warm hemisphere + a key light from the camera side + a RIM light from behind and above (0 by day). No shadow maps.
  // Cel shading: the toon gradient (materials.js) makes the shadow tone, so the light is ONE key from the camera side, up and to the
  // left, and only a little ambient. Intensities are in three's physical units: a directional light of PI lights a surface to its colour.
  hemi = new THREE.HemisphereLight('#ffe6c4', '#9a6a4a', 0.35);
  scene.add(hemi);
  key = new THREE.DirectionalLight('#fff0d8', Math.PI * 0.95);
  key.position.set(-6, 11, 8);
  scene.add(key);
  rim = new THREE.DirectionalLight('#bcd6ff', 0);
  rim.position.set(1.5, 8, -9);
  scene.add(rim);
  applyPhase(true);
}

// ---------------------------------------------------------------- ambient life: pools
const DOT_N = 121;      // = ARM + 1 (below): every slot is set every frame
const FW_N = 3;
const FW_RINGS = [[0.42, 8], [0.72, 12], [1.0, 16]];
const wing = [];
const fire = [];
const fly = [];
let birdAt = 5;
let batAt = 8;
let fireAt = 0;
let flashAt = -99;
let flashCol = new THREE.Color('#F2A93B');
let waved = 0;
let waveT = -1;
let lastPlace = -1;
let lastKey = '';
let cur = { place: 0, phase: 0, a: 0, b: 0, u: 1 };

function setWing(i, x, y, sx, sy, r, g, b) {
  dummy.position.set(x, y, 0);
  dummy.scale.set(sx, sy, 1);
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  wings.setMatrixAt(i, dummy.matrix);
  wings.instanceColor.setXYZ(i, r, g, b);
}

function setDot(i, x, y, rx, ry, rot, r, g, b) {
  dummy.position.set(x, y, 0);
  dummy.scale.set(rx, ry, 1);
  dummy.rotation.set(0, 0, rot);
  dummy.updateMatrix();
  dots.setMatrixAt(i, dummy.matrix);
  dots.instanceColor.setXYZ(i, r, g, b);
}

// fixed slots in the dots mesh: 0..FW_N*36-1 fireworks, then fireflies, then the fisherman's arm
const FW_DOTS = 36;
const FLY0 = FW_N * FW_DOTS;
const ARM = FLY0 + 12;

// ---------------------------------------------------------------- the phase: palette, light, water
function applyPhase(force) {
  const t = jtime();
  const pb = phaseBlend(t, CONFIG.phases, J.blend);
  const k = `${pb.a}|${pb.b}|${Math.round(pb.u * 400)}`;
  cur.a = pb.a; cur.b = pb.b; cur.u = pb.u; cur.phase = pb.b;
  if (!force && k === lastKey) return;
  lastKey = k;
  blendPalette(PAL[CONFIG.phases[pb.a].id] ? CONFIG.phases[pb.a].id : 'golden', CONFIG.phases[pb.b].id, pb.u);

  // sky bands and clouds
  const col = skyGeo.attributes.color.array;
  for (const q of skyG.ranges) {
    const c = q.id === 4 ? now.cloud : now.sky[q.id];
    for (let i = q.start; i < q.end; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  }
  skyGeo.attributes.color.needsUpdate = true;

  // layer tints: the banks are the darkest, the far layer is hazy (halfway to the horizon colour), the foreground a little darker than the banks
  layers.bank.tint.copy(now.bank);
  layers.far.tint.copy(now.sky[3]).lerp(now.bank, now.farK);
  layers.fg.tint.copy(now.bank).multiplyScalar(0.8);
  for (const n of ['bank', 'far', 'fg']) layers[n].mesh.material.color.copy(layers[n].tint);
  layers.bank.litAmount = now.litBank;
  layers.far.litAmount = now.litFar;
  layers.fg.litAmount = now.litBank;
  recolorLit(layers.bank, now.litBank);
  recolorLit(layers.far, now.litFar);
  recolorLit(layers.fg, now.litBank);

  // stars fade in (they are small dots: fade them from the sky colour)
  starsMesh.visible = now.stars > 0.01;
  starsMesh.material.color.copy(now.sky[0]).lerp(color.set('#ffffff'), now.stars);
  sunMesh.material.color.copy(now.sun);
  streaks.material.color.copy(now.streak);

  // light
  hemi.color.copy(now.hemiS);
  hemi.groundColor.copy(now.hemiG);
  key.color.copy(now.keyC);
  rim.color.copy(now.rimC);
  waterOut.copy(now.water);
  waterDirty = true;
}

// the clock the journey runs on: 0 on the start screen (golden hour), the run's clock otherwise
function jtime() {
  return state.screen === 'start' || state.screen === 'loading' ? 0 : state.time;
}

export function consumeWaterColor() {
  if (!waterDirty) return null;
  waterDirty = false;
  return waterOut;
}

export function setJourneyDetail(level) {
  detail = level;
  if (layers.far) layers.far.mesh.visible = level < 2;
}

export function getJourneyDebug() {
  return { place: J.places[cur.place].id, phase: CONFIG.phases[cur.phase].id, blend: +cur.u.toFixed(2), t: jtime() };
}

export function resetJourney() {
  lastPlace = -1;
  waved = 0;
  waveT = -1;
  birdAt = clock + 4;
  batAt = clock + 5;
  fireAt = clock + 2;
  flashAt = -99;
  for (const w of wing) w.on = false;
  for (const f of fire) f.on = false;
  lastKey = '';
}

// ---------------------------------------------------------------- per frame
const flashTint = new THREE.Color();
const deckOut = new THREE.Color();
const waterMul = new THREE.Color();

export function updateJourney(dt) {
  const screen = state.screen;
  const live = screen === 'play' || screen === 'start';
  const adt = live ? Math.min(dt, 0.1) : 0;      // ambient life moves in a run and on the start screen, and freezes on pause / game over
  clock += adt;
  const t = jtime();
  const reduced = state.settings.reducedMotion;

  applyPhase(false);
  const k = placeIndexAt(t, J.places);
  cur.place = k;
  if (screen === 'play' && k > lastPlace) {            // PLACE_ENTER: once per place per run, in order (an N-key jump emits the places it skipped)
    for (let p = lastPlace + 1; p <= k; p++) { state.place = J.places[p].id; emit(EVENTS.PLACE_ENTER, { place: J.places[p].id }); }
    lastPlace = k;
  }

  // scroll: each layer moves at its own speed; the far skyline wraps by its period
  layers.bank.mesh.position.x = layers.bank.speed * t;
  layers.fg.mesh.position.x = layers.fg.speed * t;
  layers.far.mesh.position.x = (layers.far.speed * t) % SKY_PERIOD;   // periodic: the same picture, so it wraps invisibly

  // the sun sinks over dusk; the moon rises as the night comes
  sunY = 0.05 - sunDrop(t, J.sunSink);
  moonY = -0.3 + (0.3 + J.moonY.night) * smooth((t - 130) / 40) + (J.moonY.midnight - J.moonY.night) * smooth((t - 205) / 45);
  const moonA = smooth((t - 135) / 30);
  moonMesh.visible = moonA > 0.01;
  moonMesh.material.color.setScalar(moonA);

  // lanterns: light from dusk, fading in over a few seconds, with a slight flicker
  const lit = smooth((t - J.lantern.from) / J.lantern.fade);
  setLanternLevel(lit * (1 + (reduced ? 0 : J.lantern.flicker * Math.sin(clock * 9.1) * Math.sin(clock * 2.3 + 1))));

  updateAmbient(adt, t, reduced);

  // the scene tint of a firework: soft, small, and only without reduced motion (see updateAmbient)
  const flash = reduced ? 0 : flashEnvelope();
  deckOut.copy(now.deck);
  if (flash > 0.001) { flashTint.copy(flashCol); deckOut.lerp(flashTint, flash); }
  waterMul.setRGB(now.water.r / Math.max(PAL.golden.water.r, 1e-4), now.water.g / Math.max(PAL.golden.water.g, 1e-4), now.water.b / Math.max(PAL.golden.water.b, 1e-4));
  setDeckLook({ deck: deckOut, water: waterMul });
  hemi.intensity = now.hemiI + flash * 0.5;
  key.intensity = Math.PI * now.keyI;
  rim.intensity = Math.PI * 0.9 * now.rimI;
}

let sunY = 0.05;
let moonY = -0.3;

function flashEnvelope() {
  const dtf = clock - flashAt;
  if (dtf < 0 || dtf > 1.6) return 0;
  const a = dtf < 0.12 ? dtf / 0.12 : Math.exp(-(dtf - 0.12) / 0.3);
  return J.fireworks.flash * a;
}

function updateAmbient(adt, t, reduced) {
  const hwScreen = Math.max(0.4, aspect);   // half the screen width in rig units
  // ---- birds cross the sun at golden hour (and on the start screen)
  const golden = t < J.sunSink.from;
  if (golden && clock >= birdAt && adt > 0) {
    const n = J.birds.count;
    const y0 = 0.14 + Math.random() * 0.16;
    for (let i = 0, put = 0; i < wing.length && put < n; i++) {
      if (wing[i].on) continue;
      const w = wing[i];
      w.on = true; w.type = 0; w.x = -hwScreen - 0.1 - put * 0.07; w.y = y0 + (put % 2 ? 0.02 : -0.02) * put; w.vx = J.birds.speed * (0.9 + Math.random() * 0.2); w.ph = Math.random() * 6; w.amp = 0.01 + Math.random() * 0.01; w.t = 0;
      put++;
    }
    birdAt = clock + J.birds.every[0] + Math.random() * (J.birds.every[1] - J.birds.every[0]);
  }
  // ---- bats flit across the sky at dusk
  const dusk = t >= J.sunSink.from && t < 150;
  if (dusk && clock >= batAt && adt > 0) {
    let put = 0;
    for (let i = 0; i < wing.length && put < J.bats.count; i++) {
      if (wing[i].on) continue;
      const w = wing[i];
      const dir = Math.random() < 0.5 ? 1 : -1;
      w.on = true; w.type = 1; w.x = -dir * (hwScreen + 0.1 + put * 0.12); w.y = 0.12 + Math.random() * 0.3; w.vx = dir * J.bats.speed * (0.8 + Math.random() * 0.4); w.ph = Math.random() * 6; w.amp = 0.03 + Math.random() * 0.02; w.t = 0;
      put++;
    }
    batAt = clock + J.bats.every[0] + Math.random() * (J.bats.every[1] - J.bats.every[0]);
  }
  for (let i = 0; i < wing.length; i++) {
    const w = wing[i];
    if (!w.on) { setWing(i, 0, 0, 0, 0, 0, 0, 0); continue; }
    w.t += adt;
    w.x += w.vx * adt;
    const flap = Math.sin((w.t + w.ph) * (w.type ? 16 : 9));
    const yy = w.y + Math.sin((w.t + w.ph) * (w.type ? 5 : 1.6)) * w.amp;
    if (Math.abs(w.x) > hwScreen + 0.4) w.on = false;
    if (w.type === 0) setWing(i, w.x, yy, 1, flap, 0.06, 0.2, 0.15); else setWing(i, w.x, yy, 1.3, flap, 0.02, 0.01, 0.03);
  }
  wings.instanceMatrix.needsUpdate = true;
  wings.instanceColor.needsUpdate = true;

  // ---- fireflies near the banks at night (a handful; fewer at lower quality)
  const night = smooth((t - 148) / 6);
  const nFly = detail >= 1 ? 5 : 10;
  for (let i = 0; i < 12; i++) {
    const slot = FLY0 + i;
    if (i >= nFly || night < 0.02) { setDot(slot, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
    const px = ((i * 0.97 + 0.31) % 1 - 0.5) * (hwScreen * 1.9) + Math.sin(clock * 0.4 + i * 2.1) * 0.05;
    const py = 0.02 + ((i * 0.37) % 1) * 0.1 + Math.sin(clock * 0.7 + i * 1.3) * 0.015;
    const tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(clock * 2.2 + i * 1.9);
    const s = 0.0042 * tw * night;
    setDot(slot, px, py, s, s, 0, 0.85 * tw, 0.9 * tw, 0.42 * tw);
  }

  // ---- the fisherman waves once as he passes (Makoko)
  const sx = layers.bank.mesh.position.x + FISHER_C;   // where the fisherman is on screen
  if (t < 40 && waved === 0 && sx > -0.3 && screen2()) { waved = 1; waveT = 0; }
  if (waveT >= 0) {
    waveT += adt;
    const ang = 1.1 + (reduced ? 0 : Math.sin(waveT * 9) * 0.45);
    setDot(ARM, sx + 0.004, 0.012, 0.017, 0.0032, ang, 0.06, 0.2, 0.15);
    if (waveT > 1.6) { waveT = -1; setDot(ARM, 0, 0, 0, 0, 0, 0, 0, 0); }
  } else if (waved === 0 || waved === 1) setDot(ARM, 0, 0, 0, 0, 0, 0, 0, 0);

  // ---- fireworks at midnight: dot-ring bursts in saffron, cream and vermilion
  const midnight = t >= 212;
  if (midnight && adt > 0 && clock >= fireAt && flashAllowed(flashAt, clock, J.fireworks.minGap)) {
    for (let i = 0; i < FW_N; i++) {
      const f = fire[i];
      if (f.on) continue;
      f.on = true; f.t = 0; f.x = (Math.random() - 0.5) * hwScreen * 1.5; f.y = 0.22 + Math.random() * 0.18; f.R = 0.1 + Math.random() * 0.07;
      f.col.set(['#F2A93B', '#FFF1D6', '#E4573D'][Math.floor(Math.random() * 3)]);
      flashAt = clock; flashCol.copy(f.col);
      break;
    }
    fireAt = clock + J.fireworks.every[0] + Math.random() * (J.fireworks.every[1] - J.fireworks.every[0]);
  }
  for (let i = 0; i < FW_N; i++) {
    const f = fire[i];
    const base = i * FW_DOTS;
    if (f.on) f.t += adt;
    if (!f.on || f.t > J.fireworks.dur) { f.on = false; for (let k = 0; k < FW_DOTS; k++) setDot(base + k, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
    const u = f.t / J.fireworks.dur;
    const out = reduced ? 0.7 : 1 - (1 - u) * (1 - u);                      // reduced motion: gentle glows that do not move
    const life = reduced ? Math.sin(u * Math.PI) : 1 - u * u;
    let k = 0;
    for (let ri = 0; ri < FW_RINGS.length; ri++) {
      const [rf, n] = FW_RINGS[ri];
      for (let d = 0; d < n && k < FW_DOTS; d++, k++) {
        if (detail >= 1 && ri === 1) { setDot(base + k, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
        const a = (d / n) * Math.PI * 2 + ri * 0.3;
        const rr = f.R * rf * out;
        const sz = reduced ? 0.0075 * life : 0.0055 * (1 - u * 0.6);
        setDot(base + k, f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, sz, sz, 0, f.col.r * life, f.col.g * life, f.col.b * life);
      }
    }
    for (; k < FW_DOTS; k++) setDot(base + k, 0, 0, 0, 0, 0, 0, 0, 0);
  }
  dots.instanceMatrix.needsUpdate = true;
  dots.instanceColor.needsUpdate = true;
}
const screen2 = () => state.screen === 'play' || state.screen === 'start';

// ---------------------------------------------------------------- align with the horizon
export function syncBackdrop(camera, playLineNdc = 0.5) {
  const p = camera.position;

  // the real horizon on screen: project two far points of the water plane with the final camera
  const far = 40000;
  const y = CONFIG.deck.waterY;
  v1.set(p.x - far, y, p.z - far).project(camera);
  v2.set(p.x + far, y, p.z - far).project(camera);
  const tanHalf = Math.tan(camera.fov * 0.5 * DEG);
  aspect = camera.aspect;
  let y0 = playLineNdc;
  let angle = 0;
  const dx = v2.x - v1.x;
  if (Math.abs(dx) > 1e-6) {
    const slope = (v2.y - v1.y) / dx;                  // in ndc
    angle = Math.atan2(slope * tanHalf, tanHalf * aspect);
    const real = v1.y - v1.x * slope;                  // ndc height of the real horizon at the screen's middle
    if (Number.isFinite(real)) y0 = Math.min(real, playLineNdc);
  }

  // hang the rig on the line: 1 unit = half the screen height at RIG_DIST
  const shift = camera.projectionMatrix.elements[9];
  const unit = tanHalf * RIG_DIST;
  rig.position.set(0, (y0 + shift) * unit, -RIG_DIST);
  rig.rotation.z = angle;
  rig.scale.setScalar(unit);

  // clip plane through the camera and the line: keep what is above it
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  nrm.set(-RIG_DIST * sn, RIG_DIST * cs, (y0 + shift) * unit * cs).normalize().applyQuaternion(camera.quaternion);
  clip.normal.copy(nrm);
  clip.constant = -nrm.dot(p);

  if (aspect !== aspectDone) {
    aspectDone = aspect;
    // the sun: its centre sits at ndc x = 0.5 and just above the line; its radius is a share of the screen height
    const r = aspect >= 1 ? 0.25 : 0.17;
    const side = (1024 / 165) * r;
    sunMesh.scale.set(side, side, 1);
    const mr = aspect >= 1 ? 0.09 : 0.07;
    moonMesh.scale.set((512 / 118) * mr, (512 / 118) * mr, 1);
    streakBase.length = 0;
    const k = aspect >= 1 ? 1 : 0.45;
    SUN_STREAKS.forEach(([dy, len, dxs], i) => streakBase.push({ x: 0.5 * aspect + dxs * k * 1.5, y: dy, len: len * k, phase: i * 1.7 }));
  }
  sunMesh.position.set(0.5 * aspect, sunY, 0);
  moonMesh.position.set(-0.42 * aspect, moonY, 0);

  // water: the sun's streaks fade out over dusk; from the city on, lit-window reflections shimmer under the skyline
  const sunVis = 1 - smooth((jtime() - 60) / 85);
  const winVis = now.litFar * smooth((jtime() - 140) / 20);
  for (let i = 0; i < STREAK_N; i++) {
    if (i < streakBase.length) {
      const s = streakBase[i];
      dummy.position.set(s.x, s.y + (sunY - 0.05) * 0.2, 0);
      dummy.scale.set(s.len * (1 + 0.14 * Math.sin(clock * 1.3 + s.phase)) * sunVis, 0.006 * sunVis, 1);
    } else {
      const j = i - streakBase.length;
      const col = WIN_REFL[Math.min(5, Math.floor(j / 3))];
      const row = j % 3;
      const wd = (0.034 - row * 0.009) * (0.85 + 0.2 * Math.sin(clock * 1.7 + col[1] + row)) * winVis;
      dummy.position.set(col[0] * Math.min(1, aspect / 1.6), -0.03 - row * 0.034, 0);
      dummy.scale.set(wd, 0.0065, 1);
    }
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    streaks.setMatrixAt(i, dummy.matrix);
  }
  streaks.instanceMatrix.needsUpdate = true;
}
