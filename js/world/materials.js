// Mango Rush — materials and small shared visuals.   OWNER: Claude Code  ·  STATUS: step 2 (flat paints + blob shadows; cel shading = step 4)
//
// toon(color, opts) -> THREE.Material ; outline(mesh, thickness) ; paperGrainTexture() -> THREE.Texture   (step 4)
// flat(color, opts) -> THREE.MeshBasicMaterial      an unlit, untoned paint: the colour on screen is the colour you give it
// blobMaterial() -> THREE.MeshBasicMaterial         ONE shared soft dark blob (radial alpha texture) for every blob shadow
// blobShadow(radiusX, radiusZ = radiusX) -> THREE.Mesh   a flat blob lying on y = 0 of its parent (shares the geometry
//                                                    and material; scale it, do not dispose them)
import * as THREE from 'three';

export function toon(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }); }
export function outline(mesh, thickness = 0.03) {}
export function paperGrainTexture() { return null; }

export function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });
}

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

export function blobShadow(rx, rz = rx) {
  if (!blobGeo) {
    blobGeo = new THREE.PlaneGeometry(2, 2);
    blobGeo.rotateX(-Math.PI / 2);
    blobGeo.userData.shared = true;
  }
  const m = new THREE.Mesh(blobGeo, blobMaterial());
  m.scale.set(rx, 1, rz);
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- merging meshes (fewer draw calls)
// Every draw call costs CPU time in the driver (about 30 us each on an Intel UHD 620), so parts that never move relative to each
// other are baked into ONE geometry with per-vertex colours.
//   mergeMeshes(root, meshes, material, { uv = false, alpha = false }) -> THREE.Mesh
//     Bakes `meshes` (all under `root`) into one geometry in root's local space. Each mesh's material.color becomes its vertex colour
//     (so `material` should be white with vertexColors: true). alpha: also a 4th colour component from mesh.material.opacity divided
//     by the largest opacity (one transparent material can then fade a ring and its fill together). The merged mesh is NOT added
//     anywhere; the baked meshes are removed from their parents and their geometries / non-shared materials are disposed.
//   mergeFlatProps(root) -> void
//     Merges every flat-painted mesh under root (a MeshBasicMaterial without a map, not an array, not userData.keep) into one mesh,
//     and every blob shadow into one mesh, and adds both to root.
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

export function mergeMeshes(root, meshes, material, { uv = false, alpha = false } = {}) {
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
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    if (g.attributes.normal) { const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) nor.push(n[i]); }
    if (uv && g.attributes.uv) { const u = g.attributes.uv.array; for (let i = 0; i < u.length; i++) uvs.push(u[i]); }
    const c = mesh.material.color;
    const a = alpha ? mesh.material.opacity / maxOpacity : 1;
    for (let i = 0; i < p.length / 3; i++) { col.push(c.r, c.g, c.b); if (alpha) col.push(a); }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor.length === pos.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, alpha ? 4 : 3));
  if (uv && uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mt of mats) if (!mt.userData.shared) mt.dispose();
  }
  return new THREE.Mesh(geo, material);
}

export function mergeFlatProps(root) {
  const flatMeshes = [];
  const blobs = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || Array.isArray(o.material)) return;
    if (o.material === blobMaterial()) blobs.push(o);
    else if (o.material.isMeshBasicMaterial && !o.material.map && !o.material.transparent) flatMeshes.push(o);
  });
  if (flatMeshes.length) {
    const mat = flat('#ffffff', { vertexColors: true });
    const merged = mergeMeshes(root, flatMeshes, mat);
    root.add(merged);
  }
  if (blobs.length) {
    const merged = mergeMeshes(root, blobs, blobMaterial(), { uv: true });
    // the blob material is shared and its colour is not used: the vertex colours are white, so the texture shows through as is
    merged.renderOrder = 1;
    root.add(merged);
  }
}
