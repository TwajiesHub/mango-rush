// Mango Rush — renderer, camera rig, portrait.   OWNER: Claude Code  ·  STATUS: step 1 (v0 look; quality manager comes later)
//
// CONTRACT:
//   initRenderer(canvas) -> { scene, camera, renderer }
//   setCameraMode(mode: 'menu'|'play'|'over') ; setFollowTarget(object3D)
//   renderFrame(realDt) — eases the camera toward its mode's pose, adds juice.cameraShake(), renders.
//   makePortrait(characterObject) -> string   data URL (PNG) of the character's head, 128x128, transparent background
//
// No real-time shadow maps. Pixel ratio is capped at CONFIG.quality.maxPixelRatio.

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { cameraShake } from '../fx/juice.js';

let ctx = null;
let mode = 'menu';
let follow = null;

const camPos = new THREE.Vector3(0, 6, 14);
const camLook = new THREE.Vector3();
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
let snapNext = true;

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 512;
  const g2 = c.getContext('2d');
  const g = g2.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#ff7b54');
  g.addColorStop(0.45, '#ffb26b');
  g.addColorStop(0.75, '#ffd59e');
  g.addColorStop(1, '#ffe8c7');
  g2.fillStyle = g;
  g2.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function initRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.quality.maxPixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog('#ffc58f', 34, 90);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight('#ffe2bd', '#5c8a3c', 1.1));
  const sun = new THREE.DirectionalLight('#fff0d6', 2.4);
  sun.position.set(-9, 18, 7);
  scene.add(sun);

  const resize = () => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.85 ? 58 : 50;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  ctx = { scene, camera, renderer };
  return ctx;
}

export function setCameraMode(m) {
  mode = m;
}

export function setFollowTarget(obj) {
  follow = obj;
}

function aim() {
  const portrait = ctx.camera.aspect < 0.85;
  if (mode === 'menu' || !follow) {
    // close-up of the character; on desktop it sits to the right of the menu panel
    if (portrait) { wantPos.set(0, 1.6, 7.6); wantLook.set(0, -0.8, 0); }
    else { wantPos.set(-1.4, 2.0, 5.5); wantLook.set(-2.1, 1.2, 0); }
  } else {
    const back = portrait ? 12.5 : 9.2;
    const up = portrait ? 14.5 : 10.2;
    const px = follow.position.x;
    const pz = follow.position.z;
    wantPos.set(px * 0.85, up, pz * 0.85 + back);
    wantLook.set(px * 0.92, 0.4, pz * 0.92 - 0.6);
  }
}

export function renderFrame(realDt) {
  const { renderer, scene, camera } = ctx;
  aim();
  if (snapNext) { camPos.copy(wantPos); camLook.copy(wantLook); snapNext = false; }
  const k = 1 - Math.exp(-(mode === 'menu' ? 3 : 6) * realDt);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  const shake = cameraShake();
  camera.position.set(camPos.x + shake.x, camPos.y + shake.y, camPos.z);
  camera.lookAt(camLook);
  if (shake.roll) camera.rotateZ(shake.roll);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- portrait
let portrait = null;

export function makePortrait(characterObject) {
  try {
    const { renderer } = ctx;
    const size = 128;
    if (!portrait) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#ffe2bd', '#8a6a4a', 1.6));
      const light = new THREE.DirectionalLight('#fff0d6', 2);
      light.position.set(1.5, 2.5, 4);
      scene.add(light);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      const target = new THREE.WebGLRenderTarget(size, size);
      target.texture.colorSpace = THREE.SRGBColorSpace;
      portrait = { scene, camera, target, holder: new THREE.Group(), pixels: new Uint8Array(size * size * 4) };
      scene.add(portrait.holder);
    }
    const { scene, camera, target, holder, pixels } = portrait;
    const copy = characterObject.clone(true);   // shares geometry and materials with the original
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.visible = true;
    copy.traverse((o) => { if (o.isSprite) o.visible = false; });   // no name tag
    holder.add(copy);
    camera.position.set(0, 1.86, 2.3);
    camera.lookAt(0, 1.8, 0);

    const oldTarget = renderer.getRenderTarget();
    const oldColor = new THREE.Color();
    renderer.getClearColor(oldColor);
    const oldAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldColor, oldAlpha);
    holder.remove(copy);

    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {   // readPixels is bottom-up
      img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  } catch (err) {
    console.warn('[renderer] portrait failed', err);
    return '';
  }
}
