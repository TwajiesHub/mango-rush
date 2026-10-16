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
