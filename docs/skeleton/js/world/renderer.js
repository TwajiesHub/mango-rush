// Mango Rush — renderer, camera rig, quality manager, portrait.   OWNER: Claude Code  ·  STATUS: stub
// initRenderer(canvas) -> { scene, camera, renderer }
// setCameraMode(mode: 'menu'|'play'|'over') ; setFollowTarget(object3D)
// renderFrame(realDt) — applies juice cameraShake(), renders.
// makePortrait(characterObject) -> string (data URL of the head, 128x128)
import * as THREE from 'three';
let ctx = null;
export function initRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#E4573D');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 8, 12); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#ffe2bd', '#5c8a3c', 1.2));
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  ctx = { scene, camera, renderer };
  return ctx;
}
export function setCameraMode(mode) {}
export function setFollowTarget(obj) {}
export function renderFrame(realDt) { ctx.renderer.render(ctx.scene, ctx.camera); }
export function makePortrait(characterObject) { return ''; }
