// Mango Rush — the mango barge (the play area).   OWNER: Claude Code  ·  STATUS: step 2 (flat paints; cel shading = step 4)
//
// CONTRACT:
//   buildBarge(scene) ; updateBarge(dt)
//   deckRoot() -> Object3D        everything that lives ON the deck (the player, the drops) is a child of this. It bobs with
//                                 the deck, so feet and fruit never float. Gameplay coordinates are deck-local: x across,
//                                 z toward the camera, y up, the deck top is y = 0, the centre is (0, 0).
//   deckBounds() -> { halfWidth, halfDepth }   the walkable ellipse (the deck minus CONFIG.deck.walkMargin). Props stay OUTSIDE it.
//   deckSize() -> { width, depth, orientation }   the deck as built right now
//   surfaceAt(x, z) -> { grip }   how grippy the deck is at a deck-local point: 1 = normal, 0 = ice. The SAME object every call.
//                                 Inside a juice patch it is CONFIG.juice.grip, easing back to 1 as the patch fades (step 5b); step 6
//                                 adds wet edges through the same hook. With ?debug, the G key toggles a test patch (3 units wide at the
//                                 deck centre, grip 0.35).
//   cratePositions() -> [{ x, z }]   the two mango crates (deck-local, far corners): the bank spots sit in front of them
//   plankLayout() -> { width, depth, plankW, butt, step }   how the planks are painted (width and depth of the deck as built, plank
//                                 width, the length between butt joints, and the stagger per plank): the golden plank lines up with it
//   addJuicePatch(x, z) ; clearJuicePatches() ; updateJuicePatches(dt) ; juicePatches() -> [{ x, z, life, r }] (read only)   the slippery juice of a rotten
//                                 mango (step 5b): at most CONFIG.juice.max at once (the oldest is recycled), CONFIG.juice.life seconds,
//                                 fading over the last CONFIG.juice.fade. A flat amber decal, unlit, just above the deck.
//   setOrientation('landscape' | 'portrait')   landscape: width along the screen. portrait: width and depth swap so the long
//                                 side runs into the screen (phones). REBUILDS the deck art (disposing the old one) and is
//                                 ignored while a run is on (play / paused): main.js calls it between runs only.
//
// The water streaks and the foam are OPAQUE on purpose: three draws opaque things in renderOrder and transparent things
// after all of them, which would paint them over the deck and the painted sky.
//
// Layout: scene > bobRoot (bobs, rolls) > { art (rebuilt per orientation), deckRoot (gameplay) }.
// The water streaks and the wake live on the water, not on the deck, so they do not bob. They stream toward screen-right
// because the barge drifts toward screen-left (CONFIG.world.flowSpeed). The camera never bobs.

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { flat, toon, outline, blobShadow, mergeToonProps } from './materials.js';

const D = CONFIG.deck;
const DEG = Math.PI / 180;

const COLORS = {
  wood: '#C88C4B', seam: '#8A5A2E', rim: '#6B4224', hull: '#4A2C14',
  crate: '#8B5E34', crateTop: '#A06C3C', crateInside: '#3A2412', mango: '#F2A93B',
  post: '#3A2412', lamp: '#7A5A32', lampGlass: '#C79A52', rope: '#A38A57', sack: '#C9A66B', sackTie: '#6B4224',
};

let scene = null;
let bobRoot = null;
let deck = null;          // the gameplay layer
let art = null;           // the rebuilt-per-orientation layer
let orientation = 'landscape';
let size = { width: D.width, depth: D.depth };
const bounds = { halfWidth: 0, halfDepth: 0 };
let t = 0;

// water streaks + wake
let streaks = null;
let foam = null;
const streakData = [];
const foamData = [];
const STREAK_N = 46;
const FOAM_N = 22;
const dummy = new THREE.Object3D();

// ---------------------------------------------------------------- helpers
function chamferShape(w, d, c, hole = null) {
  const hw = w / 2;
  const hd = d / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + c, -hd);
  s.lineTo(hw - c, -hd);
  s.lineTo(hw, -hd + c);
  s.lineTo(hw, hd - c);
  s.lineTo(hw - c, hd);
  s.lineTo(-hw + c, hd);
  s.lineTo(-hw, hd - c);
  s.lineTo(-hw, -hd + c);
  s.closePath();
  if (hole) {
    const ih = hole.w / 2;
    const id = hole.d / 2;
    const k = hole.c;
    const p = new THREE.Path();
    p.moveTo(-ih + k, -id);
    p.lineTo(-ih, -id + k);
    p.lineTo(-ih, id - k);
    p.lineTo(-ih + k, id);
    p.lineTo(ih - k, id);
    p.lineTo(ih, id - k);
    p.lineTo(ih, -id + k);
    p.lineTo(ih - k, -id);
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

function woodTexture(w, d) {
  const ppu = 80;                                     // pixels per world unit
  const c = document.createElement('canvas');
  c.width = Math.round(w * ppu);
  c.height = Math.round(d * ppu);
  const g = c.getContext('2d');
  g.fillStyle = COLORS.wood;
  g.fillRect(0, 0, c.width, c.height);
  const plank = 1.5 * ppu;
  const n = Math.ceil(c.width / plank);
  for (let i = 0; i < n; i++) {
    // each plank a hair lighter or darker, with a few grain lines
    const shade = (((i * 37) % 7) - 3) * 0.012;
    g.fillStyle = shade >= 0 ? `rgba(255,230,190,${shade})` : `rgba(40,20,5,${-shade})`;
    g.fillRect(i * plank, 0, plank, c.height);
    g.strokeStyle = 'rgba(90,55,25,0.18)';
    g.lineWidth = 2;
    for (let k = 1; k <= 3; k++) {
      const x = i * plank + (plank * k) / 4 + (((i * 13 + k * 7) % 9) - 4);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (((i + k) % 3) - 1) * 6, c.height);
      g.stroke();
    }
  }
  // seams: long ones between the planks, short butt joints staggered plank by plank
  g.fillStyle = COLORS.seam;
  for (let i = 0; i <= n; i++) g.fillRect(i * plank - 2, 0, 4, c.height);
  // a soft darker shade along the long seams (painted into the texture, so it costs nothing)
  for (let i = 0; i <= n; i++) {
    for (const dir of [-1, 1]) {
      const x0 = i * plank + dir * 2;
      const grad = g.createLinearGradient(x0, 0, x0 + dir * 9, 0);
      grad.addColorStop(0, 'rgba(60,30,8,0.22)');
      grad.addColorStop(1, 'rgba(60,30,8,0)');
      g.fillStyle = grad;
      g.fillRect(dir > 0 ? x0 : x0 - 9, 0, 9, c.height);
    }
  }
  g.fillStyle = COLORS.seam;
  for (let i = 0; i <= n; i++) g.fillRect(i * plank - 2, 0, 4, c.height);
  const butt = 4.5 * ppu;
  for (let i = 0; i < n; i++) {
    for (let y = ((i * 1.7) % 4.5) * ppu; y < c.height; y += butt) g.fillRect(i * plank, y - 2, plank, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function box(parent, w, h, d, color, x, y, z, unlit = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), unlit ? flat(color) : toon(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function dispose(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData.shared) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

// ---------------------------------------------------------------- the deck art
function buildArt() {
  if (art) { bobRoot.remove(art); dispose(art); }
  art = new THREE.Group();
  bobRoot.add(art);
  const { width: w, depth: d } = size;
  const hw = w / 2;
  const hd = d / 2;

  // top: a chamfered plate with the planks painted on it
  const topShape = chamferShape(w, d, D.chamfer);
  const topGeo = new THREE.ShapeGeometry(topShape);
  const pos = topGeo.attributes.position;
  const uv = topGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / d + 0.5);
  topGeo.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(topGeo, flat('#ffffff', { map: woodTexture(w, d) }));
  top.position.y = 0.001;
  art.add(top);

  // rim: a raised ring (top paint, darker sides)
  const rimGeo = new THREE.ExtrudeGeometry(
    chamferShape(w, d, D.chamfer, { w: w - 2 * D.rim, d: d - 2 * D.rim, c: Math.max(0.1, D.chamfer - D.rim) }),
    { depth: D.rimHeight, bevelEnabled: false },
  );
  rimGeo.rotateX(-Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeo, [flat(COLORS.rim), flat(COLORS.hull)]);
  outline(rimMesh, 0.03);   // the rim edge gets the soft umber outline too
  art.add(rimMesh);

  // hull: sides going down into the water
  const hullGeo = new THREE.ExtrudeGeometry(chamferShape(w, d, D.chamfer), { depth: D.hull, bevelEnabled: false });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -D.hull - 0.02, 0);
  art.add(new THREE.Mesh(hullGeo, [flat(COLORS.hull), flat(COLORS.hull)]));

  // ---- props: all in the corners, all outside the walkable ellipse
  // crates in the two far corners; the left one is piled with mangoes
  for (const side of [-1, 1]) {
    const crate = new THREE.Group();
    crate.position.set(side * (hw - 1.2), 0, -(hd - 0.95));
    box(crate, 1.5, 0.85, 1.2, COLORS.crate, 0, 0.425, 0);
    if (side === -1) {
      box(crate, 1.3, 0.04, 1.0, COLORS.crateInside, 0, 0.86, 0);
      const mango = toon(COLORS.mango);
      const geo = new THREE.SphereGeometry(0.27, 12, 9);
      for (const [x, y, z] of [[-0.3, 1.0, -0.15], [0.25, 1.0, -0.1], [0, 1.0, 0.28], [-0.05, 1.28, 0.02]]) {
        const m = new THREE.Mesh(geo, mango);
        m.position.set(x, y, z);
        m.scale.set(0.85, 1, 0.8);
        crate.add(m);
      }
    } else {
      box(crate, 1.5, 0.05, 1.2, COLORS.crateTop, 0, 0.87, 0);
      box(crate, 1.52, 0.1, 0.1, COLORS.rim, 0, 0.5, 0.6);
    }
    const shadow = blobShadow(1.35, 1.1);
    shadow.position.x = 0.1;
    crate.add(shadow);
    art.add(crate);
  }

  // lantern posts in the four corners (unlit by day; step 6 lights them at dusk)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Group();
      post.position.set(sx * (hw - 0.42), 0, sz * (hd - 0.42));
      box(post, 0.14, 1.9, 0.14, COLORS.post, 0, 0.95, 0);
      box(post, 0.4, 0.46, 0.4, COLORS.lamp, 0, 2.05, 0);
      const glass = box(post, 0.3, 0.32, 0.42, COLORS.lampGlass, 0, 2.05, 0, true);   // unlit: step 6 makes it glow
      glass.name = 'lantern-glass';
      glass.userData.keep = true;
      box(post, 0.46, 0.07, 0.46, COLORS.post, 0, 2.32, 0);
      post.add(blobShadow(0.45, 0.35));
      art.add(post);
    }
  }

  // a rope coil near one front corner
  const coil = new THREE.Group();
  coil.position.set(hw - 1.3, 0, hd - 0.9);
  const ropeMat = toon(COLORS.rope);
  for (const [r, y] of [[0.46, 0.07], [0.32, 0.17]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.085, 6, 20), ropeMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    coil.add(ring);
  }
  coil.add(blobShadow(0.75, 0.7));
  art.add(coil);

  // two sacks by the near-left corner
  const sackMat = toon(COLORS.sack);
  const sackGeo = new THREE.SphereGeometry(0.42, 10, 8);
  for (const [x, z, s] of [[-(hw - 1.1), hd - 1.2, 1], [-(hw - 1.9), hd - 0.85, 0.8]]) {
    const sack = new THREE.Group();
    sack.position.set(x, 0, z);
    const body = new THREE.Mesh(sackGeo, sackMat);
    body.scale.set(1 * s, 0.85 * s, 0.85 * s);
    body.position.y = 0.34 * s;
    sack.add(body);
    box(sack, 0.18 * s, 0.1, 0.18 * s, COLORS.sackTie, 0, 0.74 * s, 0);
    sack.add(blobShadow(0.62 * s, 0.55 * s));
    art.add(sack);
  }

  // the props are many small flat-painted boxes: bake them (and their blob shadows) into two meshes; the lantern glass stays apart
  // because step 6 lights it at dusk
  mergeToonProps(art);

  // walkable ellipse for this orientation
  bounds.halfWidth = hw - D.walkMargin;
  bounds.halfDepth = hd - D.walkMargin;

  buildFlow(hw, hd);
}

// ---------------------------------------------------------------- water streaks and wake (not on the deck: they do not bob)
function buildFlow(hw, hd) {
  if (streaks) { scene.remove(streaks, foam); streaks.geometry.dispose(); streaks.material.dispose(); foam.geometry.dispose(); foam.material.dispose(); }
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  streaks = new THREE.InstancedMesh(geo, flat('#4DBFB4', { depthWrite: false }), STREAK_N);
  foam = new THREE.InstancedMesh(geo.clone(), flat('#BDEBE2', { depthWrite: false }), FOAM_N);
  streaks.frustumCulled = foam.frustumCulled = false;
  streaks.renderOrder = foam.renderOrder = -9.5;   // after the water, before the painted sky (which covers them where it should)
  streakData.length = 0;
  foamData.length = 0;
  for (let i = 0; i < STREAK_N; i++) {
    streakData.push({
      x: (Math.random() - 0.5) * 80, z: (Math.random() - 0.5) * 56,
      len: 1.4 + Math.random() * 2.6, speed: 0.8 + Math.random() * 0.5,
    });
  }
  for (let i = 0; i < FOAM_N; i++) {
    const row = i % 2;
    foamData.push({
      x: (i / FOAM_N) * (hw * 2 + 8) - (hw + 4), side: i % 3 === 0 ? -1 : 1,
      z: (i % 3 === 0 ? -1 : 1) * (hd + 0.3 + row * 0.45), len: 1.2 + (i % 5) * 0.5, span: hw * 2 + 8,
    });
  }
  scene.add(streaks, foam);
}

function updateFlow(dt) {
  const f = CONFIG.world.flowSpeed;
  const y = D.waterY + 0.02;
  for (let i = 0; i < STREAK_N; i++) {
    const s = streakData[i];
    s.x += f * s.speed * dt;
    if (s.x > 40) s.x -= 80;
    // grow in at one end of the field and out at the other, so streaks never pop
    const k = Math.sin(((s.x + 40) / 80) * Math.PI);
    dummy.position.set(s.x, y, s.z);
    dummy.scale.set(s.len * k, 1, 0.07);
    dummy.updateMatrix();
    streaks.setMatrixAt(i, dummy.matrix);
  }
  streaks.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < FOAM_N; i++) {
    const s = foamData[i];
    s.x += f * 1.15 * dt;
    const half = s.span / 2;
    if (s.x > half) s.x -= s.span;
    const k = Math.sin(((s.x + half) / s.span) * Math.PI);
    dummy.position.set(s.x, y + 0.01, s.z);
    dummy.scale.set(s.len * k, 1, 0.09);
    dummy.updateMatrix();
    foam.setMatrixAt(i, dummy.matrix);
  }
  foam.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- public
export function buildBarge(s) {
  scene = s;
  bobRoot = new THREE.Group();
  scene.add(bobRoot);
  deck = new THREE.Group();
  bobRoot.add(deck);
  buildArt();
  if (location.search.includes('debug')) initTestPatch();
}

// ---- the slippery-surface hook
const gripOut = { grip: 1 };
const testPatch = { on: false, x: 0, z: 0, r: 3, grip: 0.35, mesh: null };

function initTestPatch() {
  const geo = new THREE.CircleGeometry(testPatch.r, 40);
  geo.rotateX(-Math.PI / 2);
  testPatch.mesh = new THREE.Mesh(geo, flat('#9FE3F2', { transparent: true, opacity: 0.4, depthWrite: false }));
  testPatch.mesh.position.set(testPatch.x, 0.03, testPatch.z);
  testPatch.mesh.visible = false;
  deck.add(testPatch.mesh);
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'g' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    testPatch.on = !testPatch.on;
    testPatch.mesh.visible = testPatch.on;
  });
}

export function surfaceAt(x, z) {
  gripOut.grip = 1;
  if (testPatch.on && Math.hypot(x - testPatch.x, z - testPatch.z) <= testPatch.r) gripOut.grip = testPatch.grip;
  const J = CONFIG.juice;
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    if (p.life <= 0 || Math.hypot(x - p.x, z - p.z) > p.r) continue;
    const g = 1 - (1 - J.grip) * Math.min(1, p.life / J.fade);   // slippery, then easing back to normal over the last seconds
    if (g < gripOut.grip) gripOut.grip = g;
  }
  return gripOut;
}

// ---- juice patches: a pool of flat amber decals
const patches = [];
let patchTex = null;
function juiceTexture() {
  if (patchTex) return patchTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // an irregular edge: a blob made of a wobbling radius, plus a few drops around it
  const blob = (r0, wob, seed) => {
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = r0 * (1 + wob * Math.sin(a * 3 + seed) * 0.5 + wob * Math.sin(a * 5 + seed * 2.1) * 0.35 + wob * Math.sin(a * 8 + seed * 0.7) * 0.2);
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = '#B9701F';
  blob(52, 0.28, 1.3);
  g.fillStyle = '#E8A33A';
  blob(44, 0.26, 1.3);
  g.fillStyle = '#F6C565';
  blob(24, 0.3, 4.1);
  g.fillStyle = '#E8A33A';
  for (const [x, y, r] of [[14, 40, 5], [112, 82, 4], [96, 16, 3.5], [30, 112, 4]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  patchTex = new THREE.CanvasTexture(c);
  patchTex.colorSpace = THREE.SRGBColorSpace;
  return patchTex;
}

function makePatchMesh() {
  const geo = new THREE.PlaneGeometry(2, 2);
  geo.rotateX(-Math.PI / 2);
  geo.userData.shared = true;
  const m = new THREE.Mesh(geo, flat('#ffffff', { map: juiceTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.material.userData.shared = true;
  m.visible = false;
  m.position.y = 0.02;
  m.renderOrder = 0;
  deck.add(m);
  return m;
}

export function addJuicePatch(x, z) {
  const J = CONFIG.juice;
  let p = patches.find((q) => q.life <= 0);
  if (!p && patches.length < J.max) {
    p = { x: 0, z: 0, life: 0, r: J.radius, mesh: makePatchMesh() };
    patches.push(p);
  }
  if (!p) p = patches.reduce((a, b) => (a.life < b.life ? a : b));   // the oldest (the least life left) is recycled
  p.x = x;
  p.z = z;
  p.r = J.radius;
  p.life = J.life;
  p.mesh.position.set(x, 0.02, z);
  p.mesh.rotation.y = (x * 7.3 + z * 3.1) % 6.28;   // a different outline each time, with no rng
  p.mesh.scale.setScalar(J.radius * 1.12);
  p.mesh.material.opacity = 0.85;
  p.mesh.visible = true;
}

export function clearJuicePatches() {
  for (const p of patches) { p.life = 0; p.mesh.visible = false; }
}

export function juicePatches() {
  return patches;
}

// drops.js calls this from updateDrops (so a headless run ages the patches too): only while a run is being played
export function updateJuicePatches(dt) {
  const J = CONFIG.juice;
  for (const p of patches) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.life = 0; p.mesh.visible = false; continue; }
    p.mesh.material.opacity = 0.85 * Math.min(1, p.life / J.fade);   // fades over the last seconds
  }
}

export function cratePositions() {
  const hw = size.width / 2;
  const hd = size.depth / 2;
  return [{ x: -(hw - 1.2), z: -(hd - 0.95) }, { x: hw - 1.2, z: -(hd - 0.95) }];
}

// the planks as painted in woodTexture(): 1.5 wide, butt joints every 4.5 units, staggered by 1.7 per plank
export function plankLayout() {
  return { width: size.width, depth: size.depth, plankW: 1.5, butt: 4.5, step: 1.7 };
}

export function setOrientation(o) {
  if (o !== 'landscape' && o !== 'portrait') return;
  if (o === orientation && art) return;
  if (state.screen === 'play' || state.screen === 'paused') return;   // never during a run
  orientation = o;
  size = o === 'portrait' ? { width: D.depth, depth: D.width } : { width: D.width, depth: D.depth };
  buildArt();
}

export function updateBarge(dt) {
  t += dt;
  const b = D.bob;
  const w = Math.PI * 2 * b.speed;
  bobRoot.position.y = Math.sin(t * w) * b.y;
  bobRoot.rotation.z = Math.sin(t * w * 0.71 + 1.1) * b.roll * DEG;
  bobRoot.rotation.x = Math.sin(t * w * 0.53 + 2.3) * b.pitch * DEG;
  updateFlow(dt);
}

export function deckRoot() {
  return deck;
}

export function deckBounds() {
  return bounds;
}

export function deckSize() {
  return { width: size.width, depth: size.depth, orientation };
}
