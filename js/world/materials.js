// Mango Rush — materials: cel shading, outlines, paper grain, flat paints, blob shadows, mesh baking.
//                                                    OWNER: Claude Code  ·  STATUS: step 4 (the look)
//
// CONTRACT
//   toon(color, opts = {}) -> THREE.MeshToonMaterial     cel shading with ONE shared 3-step gradient map (light, mid, a warm umber
//                              shadow; the gradient is COLOURED so shadows lean warm, never grey). Cached by colour + opts, so the same
//                              colour shares one material (marked userData.shared: never dispose it). opts: { flatShading }.
//   toonVertex({ print = false, flatShading = false }) -> THREE.MeshToonMaterial   the shared white material for BAKED meshes: the
//                              colour comes from the vertex colours; print: also multiplies the shared print texture (see below).
//   flat(color, opts = {}) -> THREE.MeshBasicMaterial    an unlit, untoned paint: the colour on screen is the colour you give it
//   outline(mesh, thickness = 0.03) -> THREE.Mesh        a soft dark OUTLINE (inverted hull, umber #2C1A0E, BackSide, pushed out along
//                              smoothed normals) added as a child of `mesh`. One shared material, one draw call.
//   outlineGeometry(geometry, thickness) -> BufferGeometry   the shell alone (for merging outlines of several parts)
//   paperGrainTexture() -> THREE.Texture                 a 128 x 128 tiling noise canvas, generated once (the shaders use a cheap hash on
//                              gl_FragCoord instead, so nothing samples it; kept for the contract)
//   setGrainPixelRatio(pr) -> void                       renderer.js tells the grain the current pixel ratio, so it keeps the same size
//                              ON SCREEN at every quality level
//   printTexture() -> THREE.Texture                      the shared NEUTRAL print pattern (stripes + a row of dots, 30% darker than white)
//                              that multiplies vertex colours: the pattern is exactly 30% darker than whatever colour it sits on
//   blobMaterial() / blobShadow(rx, rz = rx, material = blobMaterial()) -> Mesh   soft dark blob shadows on y = 0 of the parent
//   toonTextured(map) -> Material (a toon with a colour map, shared) ; tintableClone(material) -> a private copy for tinting
//   mergeMeshes(root, meshes, material, { uv, alpha, print }) -> Mesh ; bakeToon(root, meshes, opts) -> Mesh ; mergeToonProps(root)
//
// PAPER GRAIN. A subtle STATIC screen-space grain (about +/-7%, average 1.0, so colours do not shift) is multiplied into every toon, flat
// and baked material INSIDE its shader (onBeforeCompile: a hash of floor(gl_FragCoord / pixelRatio)). No overlay pass, nothing animates.
//
// BAKING. Every draw call costs CPU time in the driver (about 30 us each on an Intel UHD 620), so parts that never move relative to each
// other are baked into ONE geometry with per-vertex colours (mergeMeshes) and their outlines into ONE shell (bakeToon).
import * as THREE from 'three';

// ---------------------------------------------------------------- paper grain
const GRAIN = { value: 1 };            // the pixel ratio, shared by every grain shader
const GRAIN_STRENGTH = 0.14;           // peak to peak

export function setGrainPixelRatio(pr) {
  GRAIN.value = Math.max(0.5, pr);
}

function grainChunk(shader) {
  shader.uniforms.uGrainPR = GRAIN;
  shader.fragmentShader = `uniform float uGrainPR;\n${shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    { vec2 gc = floor(gl_FragCoord.xy / uGrainPR);
      float gh = fract(sin(dot(gc, vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor.rgb *= 1.0 + (gh - 0.5) * ${GRAIN_STRENGTH.toFixed(3)}; }`,
  )}`;
}

function addGrain(material) {
  material.onBeforeCompile = grainChunk;           // the SAME function everywhere: materials of one kind share one program
  material.customProgramCacheKey = () => 'grain1';
  return material;
}

let grainTex = null;
export function paperGrainTexture() {
  if (!grainTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + Math.floor((Math.random() - 0.5) * 36);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTex = new THREE.CanvasTexture(c);
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  }
  return grainTex;
}

// ---------------------------------------------------------------- cel shading
let gradient = null;
function gradientMap() {
  if (!gradient) {
    // three steps: a warm umber shadow, a soft mid, the light. RGB, so the shadow is tinted (never grey).
    const d = new Uint8Array([
      150, 108, 92, 255,
      214, 186, 160, 255,
      255, 248, 236, 255,
    ]);
    gradient = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const toonCache = new Map();
export function toon(color, opts = {}) {
  const key = `${color}|${opts.flatShading ? 'f' : ''}`;
  let m = toonCache.get(key);
  if (!m) {
    m = addGrain(new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), flatShading: !!opts.flatShading }));
    m.userData.shared = true;
    toonCache.set(key, m);
  }
  return m;
}

// the neutral print: white, with stripes and a row of dots in 70% grey (= 30% darker). A white patch (bottom-left) is where parts that
// carry no print (skin, shoes, hat) point their UVs, so one material serves a whole baked body.
export const PRINT_PATCH_UV = 0.035;
let printTex = null;
export function printTexture() {
  if (!printTex) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#b3b3b3';   // 0.70
    // two stripes per tile, and a row of round dots between them
    // (everything sits in the middle of the tile: the ends of a capsule squeeze the texture, so they stay plain)
    g.fillRect(0, 26, S, 9);
    g.fillRect(0, 76, S, 9);
    for (let x = 8; x < S; x += 16) {
      g.beginPath();
      g.arc(x, 51, 4.2, 0, Math.PI * 2);
      g.arc(x, 101, 4.2, 0, Math.PI * 2);
      g.fill();
    }
    // the plain patch the non-print parts use
    g.fillStyle = '#ffffff';
    g.fillRect(0, S - 20, 20, 20);   // canvas bottom-left = uv (0, 0)
    printTex = new THREE.CanvasTexture(c);
    printTex.colorSpace = THREE.SRGBColorSpace;
    printTex.wrapS = printTex.wrapT = THREE.RepeatWrapping;
    printTex.minFilter = THREE.LinearFilter;
    printTex.generateMipmaps = false;
  }
  return printTex;
}

const vcCache = new Map();
export function toonVertex({ print = false, flatShading = false } = {}) {
  const key = `${print}|${flatShading}`;
  let m = vcCache.get(key);
  if (!m) {
    m = addGrain(new THREE.MeshToonMaterial({
      color: '#ffffff', vertexColors: true, gradientMap: gradientMap(), flatShading, map: print ? printTexture() : null,
    }));
    m.userData.shared = true;
    vcCache.set(key, m);
  }
  return m;
}

export function flat(color, opts = {}) {
  return addGrain(new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts }));
}

// ---------------------------------------------------------------- outlines (inverted hull)
const OUTLINE_COLOR = '#2C1A0E';
let outlineMat = null;
export function outlineMaterial() {
  if (!outlineMat) {
    outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide, toneMapped: false });
    outlineMat.userData.shared = true;
  }
  return outlineMat;
}

// A shell: every vertex pushed out along the SMOOTHED normal (normals of vertices at the same place are averaged, so flat-shaded and
// faceted shapes do not tear open). Thickness is in world units, so the line is stable while the camera moves.
export function outlineGeometry(geo, thickness = 0.03) {
  const pos = geo.attributes.position;
  const idx = geo.index ? geo.index.array : null;
  const n = pos.count;
  const keyOf = (i) => `${Math.round(pos.getX(i) * 400)},${Math.round(pos.getY(i) * 400)},${Math.round(pos.getZ(i) * 400)}`;
  const keys = new Array(n);
  const acc = new Map();
  for (let i = 0; i < n; i++) {
    const k = keyOf(i);
    keys[i] = k;
    if (!acc.has(k)) acc.set(k, [0, 0, 0]);
  }
  const tris = idx ? idx.length / 3 : n / 3;
  for (let t = 0; t < tris; t++) {
    const a = idx ? idx[t * 3] : t * 3;
    const b = idx ? idx[t * 3 + 1] : t * 3 + 1;
    const c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const ax = pos.getX(b) - pos.getX(a), ay = pos.getY(b) - pos.getY(a), az = pos.getZ(b) - pos.getZ(a);
    const bx = pos.getX(c) - pos.getX(a), by = pos.getY(c) - pos.getY(a), bz = pos.getZ(c) - pos.getZ(a);
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;   // area-weighted face normal
    for (const v of [a, b, c]) {
      const s = acc.get(keys[v]);
      s[0] += nx; s[1] += ny; s[2] += nz;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = acc.get(keys[i]);
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = pos.getX(i) + (s[0] / len) * thickness;
    out[i * 3 + 1] = pos.getY(i) + (s[1] / len) * thickness;
    out[i * 3 + 2] = pos.getZ(i) + (s[2] / len) * thickness;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (idx) g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
  return g;
}

export function outline(mesh, thickness = 0.03) {
  const o = new THREE.Mesh(outlineGeometry(mesh.geometry, thickness), outlineMaterial());
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}

// ---------------------------------------------------------------- blob shadows
let blobMat = null;
let blobGeo = null;

export function blobMaterial() {
  if (!blobMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(26,20,16,0.55)');
    grad.addColorStop(0.6, 'rgba(26,20,16,0.32)');
    grad.addColorStop(1, 'rgba(26,20,16,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    blobMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    blobMat.userData.shared = true;
  }
  return blobMat;
}

export function blobShadow(rx, rz = rx, material = null) {
  if (!blobGeo) {
    blobGeo = new THREE.PlaneGeometry(2, 2);
    blobGeo.rotateX(-Math.PI / 2);
    blobGeo.userData.shared = true;
  }
  const m = new THREE.Mesh(blobGeo, material || blobMaterial());
  m.scale.set(rx, 1, rz);
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- merging meshes (fewer draw calls)
//   mergeMeshes(root, meshes, material, { uv, alpha, print }) -> THREE.Mesh
//     Bakes `meshes` (all under `root`) into one geometry in root's local space. Each mesh's material.color becomes its vertex colour
//     (so `material` should be white with vertexColors: true); a mesh may carry userData.colorFn(lx, ly, lz, outColor) to paint its
//     vertices itself (used for the darker tips of dread locks). alpha: also a 4th colour component from mesh.material.opacity divided by
//     the largest opacity. print: UVs for the print texture: a mesh with userData.print = true keeps its UVs scaled by
//     userData.printScale = [u, v] (default [1, 1]); every other mesh points at the plain patch. The merged mesh is NOT added anywhere;
//     the baked meshes are removed from their parents and their geometries / non-shared materials are disposed (keep: true leaves
//     them alone: a temporary merge). A mesh with userData.noOutline is left out of the outline shell by bakeToon.
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _c = new THREE.Color();

export function mergeMeshes(root, meshes, material, { uv = false, alpha = false, print = false, keep = false } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  let maxOpacity = 0;
  if (alpha) for (const m of meshes) maxOpacity = Math.max(maxOpacity, m.material.opacity);
  const pos = [];
  const nor = [];
  const col = [];
  const uvs = [];
  for (const mesh of meshes) {
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const cnt = g.attributes.position.count;
    const colorFn = mesh.userData.colorFn;
    const base = mesh.material.color;
    const a = alpha ? mesh.material.opacity / maxOpacity : 1;
    const lp = g.attributes.position;
    for (let i = 0; i < cnt; i++) {
      if (colorFn) { _c.copy(base); colorFn(lp.getX(i), lp.getY(i), lp.getZ(i), _c); col.push(_c.r, _c.g, _c.b); }
      else col.push(base.r, base.g, base.b);
      if (alpha) col.push(a);
    }
    if (uv || print) {
      const u = g.attributes.uv ? g.attributes.uv.array : null;
      const ps = mesh.userData.printScale || [1, 1];
      for (let i = 0; i < cnt; i++) {
        if (print) {
          if (mesh.userData.print && u) uvs.push(u[i * 2] * ps[0], u[i * 2 + 1] * ps[1]);
          else uvs.push(PRINT_PATCH_UV, PRINT_PATCH_UV);
        } else if (u) uvs.push(u[i * 2], u[i * 2 + 1]);
      }
    }
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    if (g.attributes.normal) { const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) nor.push(n[i]); }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor.length === pos.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, alpha ? 4 : 3));
  if (uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (keep) return new THREE.Mesh(geo, material);   // a temporary merge: leave the source meshes alone
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mt of mats) if (!mt.userData.shared) mt.dispose();
  }
  return new THREE.Mesh(geo, material);
}

// Bake toon parts into ONE toon mesh (vertex colours) with ONE merged outline shell as its child.
//   opts: { outline: thickness (0 = none), print: bool, flatShading: bool, material: override }
export function bakeToon(root, meshes, { outline: t = 0.03, print = false, flatShading = false, material = null } = {}) {
  if (!meshes.length) return null;
  const mat = material || toonVertex({ print, flatShading });
  // thin parts (glasses frames, hoops) are marked userData.noOutline: a 0.03 shell would swamp them, so the shell is built without them
  let shell = null;
  if (t > 0) {
    const sub = meshes.filter((m) => !m.userData.noOutline);
    if (sub.length !== meshes.length && sub.length) {
      const tmp = mergeMeshes(root, sub, mat, { keep: true });
      shell = outlineGeometry(tmp.geometry, t);
      tmp.geometry.dispose();
    }
  }
  const mesh = mergeMeshes(root, meshes, mat, { uv: true, print });
  if (t > 0) {
    const o = new THREE.Mesh(shell || outlineGeometry(mesh.geometry, t), outlineMaterial());
    o.userData.isOutline = true;
    mesh.add(o);
  }
  return mesh;
}

// The deck props: every toon-painted mesh under root is baked into one mesh with one outline; every blob shadow into one more.
export function mergeToonProps(root, thickness = 0.03) {
  const parts = [];
  const blobs = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || o.userData.isOutline || Array.isArray(o.material)) return;
    if (o.material === blobMaterial()) blobs.push(o);
    else if (o.material.isMeshToonMaterial) parts.push(o);
  });
  if (parts.length) root.add(bakeToon(root, parts, { outline: thickness }));
  if (blobs.length) {
    const merged = mergeMeshes(root, blobs, blobMaterial(), { uv: true });
    merged.renderOrder = 1;
    root.add(merged);
  }
}

// Flat-painted props (kept for anything that stays unlit): one mesh with vertex colours.
export function mergeFlatProps(root) {
  const flatMeshes = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || o.userData.isOutline || Array.isArray(o.material)) return;
    if (o.material.isMeshBasicMaterial && !o.material.map && !o.material.transparent && o.material !== outlineMat) flatMeshes.push(o);
  });
  if (flatMeshes.length) root.add(mergeMeshes(root, flatMeshes, flat('#ffffff', { vertexColors: true })));
}

// ---------------------------------------------------------------- textured toon, and private copies for tinting
const texToon = new Map();
// a toon material with a colour map (the calabash weave); cached per texture, shared
export function toonTextured(map) {
  let m = texToon.get(map.uuid);
  if (!m) {
    m = addGrain(new THREE.MeshToonMaterial({ color: '#ffffff', map, gradientMap: gradientMap() }));
    m.userData.shared = true;
    texToon.set(map.uuid, m);
  }
  return m;
}

// a PRIVATE copy of a (shared) toon material, for a mesh whose colour is tinted over time (a rotting mango). Dispose it yourself.
export function tintableClone(material) {
  const m = material.clone();
  addGrain(m);
  m.userData.shared = false;
  return m;
}
