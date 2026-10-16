// Mango Rush — the lagoon backdrop, light and (later) the journey.   OWNER: Claude Code  ·  STATUS: step 2 (static golden hour; step 6 makes it move)
//
// CONTRACT:
//   buildJourney(scene) ; resetJourney() ; updateJourney(dt) ; syncBackdrop(camera, playLineNdc)
//   syncBackdrop(camera, playLineNdc) is called by renderer.js every frame AFTER the camera has its final pose (follow,
//     shake and roll included) and its lens shift. playLineNdc is where the horizon is painted when the real one is off the
//     top of the screen (play / over): 0.5 = a quarter of the way down.
//   getFarBank() -> Group   the far bank (green strip, stilt houses, palms, canoe) as its own group. Step 6 scrolls it sideways.
//   Step 6 will also emit PLACE_ENTER as places pass.
//
// WHERE THE HORIZON IS. Every frame the real horizon is found by PROJECTING two far points on the (imagined) water plane at CONFIG.deck.waterY with the final
// camera (so a lens shift, tilt, follow, shake and roll are all included). That gives a line on the screen: a height and a
// slope. The backdrop hangs on the camera and is laid out relative to THAT line, in screen-height units:
//   - menu camera (looks almost level): the real horizon is on screen, the backdrop sits exactly on it, and below it is the
//     clear colour, which is the water;
//   - play / over camera (tilted steeply): the real horizon is far above the top of the screen, so the line is clamped to
//     playLineNdc: the sky, sun and bank are painted as a window over the top of the screen, and below the line it is the
//     same flat water, so there is no seam;
//   - in between (the camera gliding from one pose to the other) the line follows min(real horizon, playLine), so it moves
//     smoothly.
// The sky, sun and bank are clipped by a plane through the camera and that line, so nothing paints below it.
// Draw order (renderOrder, no depth test): barge water streaks, sky, sun, sun reflections, far bank. Everything here
// is OPAQUE (the sun uses alpha test): three draws transparent things after all opaque ones, which would paint them over
// the deck and the character.
// Light: a warm hemisphere light plus a low sun from behind-left. No shadow maps (blob shadows come from materials.js).

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { flat } from './materials.js';

const DEG = Math.PI / 180;
const RIG_DIST = 400;                 // how far in front of the camera the backdrop hangs (it has no depth effect)
// The water is NOT a mesh any more: the renderer clears to the water colour, so below the horizon there is nothing to draw
// (step 3b: a full-screen plane cost a whole extra pass over every pixel on weak GPUs).
const ORDER = { sky: -9, sun: -8, streaks: -7, bank: -6 };

let rig = null;                       // child of the camera, placed on the horizon line, 1 unit = half the screen height
let farBank = null;
let sunMesh = null;
let streaks = null;
let aspectDone = -1;
let clock = 0;
const clip = new THREE.Plane();
const clipPlanes = [clip];
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const nrm = new THREE.Vector3();
const dummy = new THREE.Object3D();
const STREAKS = [
  // [how far below the line (units), length, x offset from the sun]
  [-0.05, 0.28, -0.06], [-0.085, 0.4, 0.07], [-0.12, 0.22, -0.14], [-0.16, 0.34, 0.03], [-0.2, 0.2, -0.04], [-0.24, 0.26, 0.11],
];
const streakBase = [];

function backdrop(mesh, order, clipped) {
  mesh.material.depthTest = false;
  mesh.material.depthWrite = false;
  if (clipped) mesh.material.clippingPlanes = clipPlanes;
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- sky: painted bands with hard, slightly wavy edges
const SKY_H = 3.6;                    // units above the line
function skyTexture() {
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rowOf = (y) => (1 - y / SKY_H) * H;     // y = units above the line
  // top to bottom: darker vermilion up high, lighter toward the horizon
  const bands = [
    { y: 0.5, color: '#D9472F' },
    { y: 0.27, color: '#E4573D' },
    { y: 0.12, color: '#EB6A47' },
    { y: -1, color: '#F07F55' },
  ];
  g.fillStyle = '#D9472F';
  g.fillRect(0, 0, W, H);
  for (let i = bands.length - 1; i >= 0; i--) {
    const b = bands[i];
    const edge = rowOf(b.y);
    g.fillStyle = b.color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, edge + Math.sin(x * 0.006 + i * 2) * 4 + Math.sin(x * 0.017 + i) * 2);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }
  // a few soft flat clouds, a shade lighter than the band they sit in
  g.fillStyle = 'rgba(255, 190, 150, 0.16)';
  for (const [x, y, w, h] of [[300, 0.2, 360, 22], [980, 0.6, 300, 18], [1500, 0.36, 420, 26], [1750, 0.9, 240, 16], [700, 0.45, 280, 18], [140, 0.9, 260, 16]]) {
    const row = rowOf(y);
    g.beginPath();
    g.ellipse(x, row, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.ellipse(x + w * 0.25, row - h * 0.4, w * 0.28, h * 0.7, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- sun with two dot rings
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
  const ring = (radius, count, size, color, alt = null, offset = 0) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + offset;
      g.fillStyle = alt && i % 2 ? alt : color;
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

// ---------------------------------------------------------------- far bank: flat silhouettes (screen-height units)
function leaf(shapes, cx, cy, angle, len, droop) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const p = (x, y) => [cx + x * ca - y * sa, cy + x * sa + y * ca];
  const s = new THREE.Shape();
  const a = p(0, 0);
  const b = p(len * 0.5, len * 0.22);
  const e = p(len, -len * droop);
  const f = p(len * 0.5, len * 0.02);
  s.moveTo(a[0], a[1]);
  s.quadraticCurveTo(b[0], b[1], e[0], e[1]);
  s.quadraticCurveTo(f[0], f[1], a[0], a[1]);
  shapes.push(s);
}

function palm(shapes, x, base, h, lean) {
  const w = h * 0.045;
  const t = new THREE.Shape();
  t.moveTo(x - w, base);
  t.quadraticCurveTo(x + lean * 0.2, base + h * 0.55, x + lean - w * 0.5, base + h);
  t.lineTo(x + lean + w * 0.5, base + h);
  t.quadraticCurveTo(x + lean * 0.2 + w, base + h * 0.55, x + w, base);
  t.closePath();
  shapes.push(t);
  const tx = x + lean;
  const ty = base + h;
  for (const [ang, len] of [[0.2, 0.55], [0.9, 0.5], [1.7, 0.42], [2.5, 0.5], [3.1, 0.55], [3.9, 0.42], [-0.5, 0.45]]) {
    leaf(shapes, tx, ty, ang, h * len, 0.5);
  }
}

function house(shapes, x, base, w, h) {
  const stilt = h * 0.38;
  const rect = (x0, y0, x1, y1) => {
    const s = new THREE.Shape();
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    shapes.push(s);
  };
  const sw = w * 0.045;
  for (const k of [-0.38, 0, 0.38]) rect(x + k * w - sw, base, x + k * w + sw, base + stilt);
  rect(x - w / 2, base + stilt, x + w / 2, base + h * 0.78);
  const roof = new THREE.Shape();
  roof.moveTo(x - w * 0.62, base + h * 0.78);
  roof.lineTo(x + w * 0.62, base + h * 0.78);
  roof.lineTo(x + w * 0.12, base + h);
  roof.lineTo(x - w * 0.12, base + h);
  roof.closePath();
  shapes.push(roof);
}

function buildBank() {
  const shapes = [];
  // the green strip: its base is ON the horizon line (y = 0), its rolling top edge a few percent above it
  const top = (x) => 0.05 + Math.sin(x * 1.9) * 0.008 + Math.sin(x * 5.1 + 1) * 0.005;
  const strip = new THREE.Shape();
  strip.moveTo(-6, 0);
  for (let x = -6; x <= 6; x += 0.05) strip.lineTo(x, top(x));
  strip.lineTo(6, 0);
  strip.closePath();
  shapes.push(strip);
  for (const [x, h, lean] of [[-1.7, 0.2, -0.03], [-0.52, 0.17, 0.02], [0.42, 0.22, 0.04], [1.28, 0.34, 0.07], [1.9, 0.2, -0.03], [-2.4, 0.24, 0.02]]) palm(shapes, x, top(x) - 0.01, h, lean);
  for (const [x, w] of [[-1.45, 0.12], [-1.24, 0.1], [-0.98, 0.115], [-0.8, 0.095], [-0.37, 0.11], [-0.23, 0.085], [0.78, 0.1], [1.1, 0.11], [-2.0, 0.1], [2.3, 0.12]]) house(shapes, x, top(x) - 0.02, w, w * 1.15);
  const mesh = backdrop(new THREE.Mesh(new THREE.ShapeGeometry(shapes, 6), flat('#0F3D2E')), ORDER.bank, false);
  // one small canoe on the water just below the line
  const canoe = new THREE.Shape();
  canoe.moveTo(-0.1, 0.012); canoe.quadraticCurveTo(-0.02, -0.022, 0.1, 0.014); canoe.lineTo(0.082, 0.006); canoe.quadraticCurveTo(-0.01, -0.014, -0.082, 0.004); canoe.closePath();
  const pole = new THREE.Shape();
  pole.moveTo(0.008, 0.008); pole.lineTo(0.0135, 0.008); pole.lineTo(0.0135, 0.075); pole.lineTo(0.008, 0.075); pole.closePath();
  const cg = new THREE.ShapeGeometry([canoe, pole], 6);
  cg.translate(-0.06, -0.035, 0);
  const canoeMesh = backdrop(new THREE.Mesh(cg, flat('#0F3D2E')), ORDER.bank, false);
  const group = new THREE.Group();
  group.add(mesh, canoeMesh);
  return group;
}

// ---------------------------------------------------------------- build
export function buildJourney(scene) {
  // the rig is a child of the camera (renderer.js adds the camera to the scene)
  const camera = scene.children.find((o) => o.isCamera);
  rig = new THREE.Group();
  camera.add(rig);

  // sky
  const sky = backdrop(new THREE.Mesh(new THREE.PlaneGeometry(12, SKY_H), flat('#ffffff', { map: skyTexture() })), ORDER.sky, true);
  sky.position.set(0, SKY_H / 2, 0);
  rig.add(sky);

  // sun (size and sideways place are set per aspect in syncBackdrop)
  sunMesh = backdrop(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat('#ffffff', { map: sunTexture(), alphaTest: 0.5 })), ORDER.sun, true);
  rig.add(sunMesh);

  // saffron reflection streaks under the sun (below the line; they shimmer)
  streaks = backdrop(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flat('#F2A93B'), STREAKS.length), ORDER.streaks, false);
  rig.add(streaks);

  // far bank, its own group
  farBank = buildBank();
  rig.add(farBank);

  // light: warm hemisphere + a low sun from behind-left, no shadow maps
  scene.add(new THREE.HemisphereLight('#ffd9b0', '#7a4a3a', 1.5));
  const sun = new THREE.DirectionalLight('#ffc48a', 1.8);
  sun.position.set(-12, 7, -14);
  scene.add(sun);
}

export function getFarBank() {
  return farBank;
}

export function resetJourney() {}

export function updateJourney(dt) {
  clock += dt;
}

// ---------------------------------------------------------------- align with the horizon
export function syncBackdrop(camera, playLineNdc = 0.5) {
  const p = camera.position;

  // the real horizon on screen: project two far points of the water plane with the final camera
  const far = 40000;
  const y = CONFIG.deck.waterY;
  v1.set(p.x - far, y, p.z - far).project(camera);
  v2.set(p.x + far, y, p.z - far).project(camera);
  const tanHalf = Math.tan(camera.fov * 0.5 * DEG);
  const aspect = camera.aspect;
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
    sunMesh.position.set(0.5 * aspect, 0.05, 0);
    streakBase.length = 0;
    const k = aspect >= 1 ? 1 : 0.45;
    STREAKS.forEach(([dy, len, dxs], i) => streakBase.push({ x: 0.5 * aspect + dxs * k * 1.5, y: dy, len: len * k, phase: i * 1.7 }));
  }
  for (let i = 0; i < streakBase.length; i++) {
    const s = streakBase[i];
    dummy.position.set(s.x, s.y, 0);
    dummy.scale.set(s.len * (1 + 0.14 * Math.sin(clock * 1.3 + s.phase)), 0.006, 1);
    dummy.updateMatrix();
    streaks.setMatrixAt(i, dummy.matrix);
  }
  streaks.instanceMatrix.needsUpdate = true;
}
