// Mango Rush — toon materials, outlines, paper grain.   OWNER: Claude Code  ·  STATUS: stub
// toon(color, opts) -> THREE.Material ; outline(mesh, thickness) ; paperGrainTexture() -> THREE.Texture
import * as THREE from 'three';
export function toon(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }); }
export function outline(mesh, thickness = 0.03) {}
export function paperGrainTexture() { return null; }
