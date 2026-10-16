// Mango Rush — the play area.   OWNER: Claude Code  ·  STATUS: step 1 — version 0's island; step 2 replaces it with the barge
//
// CONTRACT:
//   buildBarge(scene) ; updateBarge(dt) ; deckBounds() -> { halfWidth, halfDepth }
//   deckBounds() is the walkable area (an ellipse; equal values = a circle). The player and the drop spawner both use it.

import * as THREE from 'three';
import { createRng } from '../core/rng.js';

const ARENA_R = 10.8;
const clouds = [];
const BOUNDS = { halfWidth: ARENA_R, halfDepth: ARENA_R };

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
}

function add(geo, material, x, y, z, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function buildBarge(scene) {
  const rnd = createRng(7).next;   // fixed seed: the island always looks the same (visual only)

  // water
  const water = add(new THREE.CircleGeometry(120, 48), std('#2fa7b7', { roughness: 0.25, metalness: 0.1 }), 0, -0.45, 0, scene);
  water.rotation.x = -Math.PI / 2;
  // sand + grass island
  add(new THREE.CylinderGeometry(14.2, 15.2, 1.2, 48), std('#f2d39b'), 0, -0.68, 0, scene);
  add(new THREE.CylinderGeometry(12.3, 12.6, 0.6, 48), std('#6dae46'), 0, -0.3, 0, scene);

  // grass patches and tufts
  const patch = std('#5c9c3a');
  const tuft = std('#4f8d33', { flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 11.2;
    const p = add(new THREE.CircleGeometry(0.4 + rnd() * 0.9, 14), patch, Math.cos(a) * r, 0.005, Math.sin(a) * r, scene);
    p.rotation.x = -Math.PI / 2;
  }
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 11.8;
    const t = add(new THREE.ConeGeometry(0.06, 0.26, 4), tuft, Math.cos(a) * r, 0.13, Math.sin(a) * r, scene);
    t.rotation.z = (rnd() - 0.5) * 0.4;
  }

  // trees only on the far half + sides, so they never block the camera
  const spots = [
    [-8, -10.2, 'mango'], [3.5, -12.6, 'palm'], [9.4, -8.6, 'mango'], [-12.5, -3.6, 'palm'],
    [12.8, -2.6, 'palm'], [-4.2, -12.9, 'palm'], [13.2, 3, 'palm'], [-13.3, 2.6, 'palm'],
  ];
  for (const [x, z, kind] of spots) (kind === 'palm' ? palm : mangoTree)(scene, x, z, rnd);

  // rocks and bushes on the near side (low, so the view stays clear)
  const rock = std('#a39a8e', { flatShading: true });
  const bush = std('#3f7f34', { flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.15 + rnd() * Math.PI * 0.7;
    const r = 12.4 + rnd() * 1.4;
    const s = 0.3 + rnd() * 0.45;
    const m = add(new THREE.DodecahedronGeometry(s, 0), i % 2 ? rock : bush, Math.cos(a) * r, s * 0.4 - 0.2, Math.sin(a) * r, scene);
    m.rotation.set(rnd(), rnd(), rnd());
  }

  // clouds
  const cloud = std('#fff4e6', { flatShading: true, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) add(new THREE.IcosahedronGeometry(1.4 + rnd() * 1.4, 0), cloud, k * 1.9 - 3, rnd() * 0.8, rnd() * 1.2, g);
    const a = -Math.PI * 0.1 - rnd() * Math.PI * 0.8;
    g.position.set(Math.cos(a) * (40 + rnd() * 20), 14 + rnd() * 10, Math.sin(a) * (40 + rnd() * 20));
    g.userData.drift = 0.2 + rnd() * 0.3;
    clouds.push(g);
    scene.add(g);
  }
}

function palm(scene, x, z, rnd) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const bark = std('#8a6440', { flatShading: true });
  const lean = (rnd() - 0.5) * 0.5;
  let px = 0;
  let py = 0;
  for (let i = 0; i < 7; i++) {
    const seg = add(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.21 - i * 0.012, 0.8, 7), bark, px, py + 0.4, 0, g);
    seg.rotation.z = -lean * 0.4;
    px += lean * 0.18 * i * 0.25;
    py += 0.76;
  }
  const leaf = std('#2f7d32', { flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = add(new THREE.ConeGeometry(0.32, 2.6, 4, 1), leaf, px, py, 0, g);
    l.scale.z = 0.25;
    l.rotation.order = 'YXZ';
    l.rotation.y = a;
    l.rotation.x = 1.15;
    l.position.x += Math.sin(a) * 1.05;
    l.position.z += Math.cos(a) * 1.05;
    l.position.y -= 0.35;
  }
  for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.17, 8, 6), std('#6b4a2b'), px + Math.cos(i * 2) * 0.22, py - 0.2, Math.sin(i * 2) * 0.22, g);
  scene.add(g);
}

function mangoTree(scene, x, z, rnd) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(new THREE.CylinderGeometry(0.28, 0.42, 2.6, 8), std('#7a5434', { flatShading: true }), 0, 1.3, 0, g);
  const leaf = std('#2e6b2f', { flatShading: true });
  const blobs = [[0, 3.4, 0, 1.8], [1.2, 3, 0.4, 1.3], [-1.2, 3.1, -0.2, 1.35], [0.2, 4.4, -0.3, 1.2]];
  for (const [bx, by, bz, r] of blobs) add(new THREE.IcosahedronGeometry(r, 1), leaf, bx, by, bz, g);
  const fruit = std('#ffb627', { roughness: 0.5 });
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    add(new THREE.SphereGeometry(0.16, 10, 8), fruit, Math.cos(a) * 1.7, 2.4 + rnd() * 1.6, Math.sin(a) * 1.7, g);
  }
  scene.add(g);
}

export function updateBarge(dt) {
  for (const c of clouds) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 70) c.position.x = -70;
  }
}

export function deckBounds() {
  return BOUNDS;
}
