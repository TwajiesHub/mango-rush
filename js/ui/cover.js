// Mango Rush — the cover shot (?cover).   OWNER: Claude Code  ·  STATUS: step 12, DEBUG ONLY
//
// Loaded ONLY with ?cover in the address: main.js imports it with a dynamic import(), so players never download it.
//
//   initCover(deps) -> void     adds window.__mango.cover(width = 1600, height = 1000) -> Promise<Blob>
//     Poses the scene for the cover picture and renders it from the game itself: golden hour, the barge and the lagoon, the sun with its dot
//     rings, a NEUTRAL default character (startng.js DEFAULT_STYLE, no name tag: not the owner's look) mid-dash with a mango just ahead of its
//     hands, a coconut and its warning ring nearby, and the MANGO RUSH wordmark composed on top as on the start screen. It uses the start screen's
//     camera (the real horizon and the big sun), with no panel. The paper grain is turned down: a grainy picture does not compress (the cover
//     must stay under 400 KB). The page's own loop is frozen while it works. Returns a PNG blob; tools/the owner save it as cover.png (the
//     repo root file start.ng reads).
//
//   Use:  open  index.html?debug&cover   then run   await window.__mango.cover()   (the picture is also shown over the page; Esc removes it).

import * as THREE from 'three';
import { setGrainAmount } from '../world/materials.js';
import { wordmarkSVG } from './wordmark.js';
import { DEFAULT_STYLE } from '../startng.js';
import { updateCharacterMotion } from '../world/character.js';

const DEG = Math.PI / 180;

export function initCover(d) {
  window.__mango = window.__mango || {};
  // grain: the paper grain's strength (0 = none); step: the colour step of the posterise (a PNG of smooth flat colours compresses far better than one with
  // sensor-like noise; 1 = off)
  window.__mango.cover = async (W = 1600, H = 1000, grain = 0, step = 8) => {
    window.__mango.freeze?.(true);
    document.getElementById('ui').style.display = 'none';
    for (const el of document.querySelectorAll('.tune-tab, .tune, .tune-tag')) el.style.display = 'none';
    setGrainAmount(grain);

    // the neutral character, with no name tag
    d.setCharacter({ style: DEFAULT_STYLE, name: '' });
    const pl = d.getPlayer();
    pl.object.traverse((o) => { if (o.isSprite) o.visible = false; });

    // the start screen's scene: golden hour, the menu camera, the deck as the landscape one
    d.state.screen = 'start';
    d.state.time = 0;
    d.state.phase = 'golden';
    d.setOrientation('landscape');
    d.resetJourney();
    d.clearDrops();
    d.setCameraMode('menu');

    // render at exactly W x H (a pixel ratio of 1), whatever the window is
    const r = d.getRenderer();
    const cam = d.getScene().children.find((o) => o.isCamera) || null;
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    if (cam) { cam.aspect = W / H; cam.updateProjectionMatrix(); }
    d.setGrainPixelRatio(1);

    // mid-dash: the character runs toward the left of the picture, leaning, with a mango just ahead of its hands
    const stand = d.menuStand();
    const dirX = -0.86;
    const dirZ = 0.5;
    const model = pl.object;
    model.scale.setScalar(1.3);                                          // a little larger than in play: it is the hero of the picture
    model.position.set(stand.x + 0.9, 0, stand.z + 0.9);
    model.rotation.set(0, Math.atan2(dirX, dirZ), 0);
    const motion = { vx: dirX * 9, vz: dirZ * 9, ax: dirX * 30, az: dirZ * 30, dashing: true, skidding: false };
    for (let i = 0; i < 40; i++) updateCharacterMotion(model, 1 / 60, motion);   // let the lean, the stretch and the trailing hair settle

    // a mango in the air by its hands, and the ring of a coconut just beyond it
    d.forceDrop('mango', model.position.x + dirX * 1.5, model.position.z + dirZ * 1.5, 100);
    d.forceDrop('coconut', model.position.x + dirX * 4.2, model.position.z - 1.9, 100);
    const items = d.getDrops();
    const mango = items.find((it) => it.type === 'mango');
    const coco = items.find((it) => it.type === 'coconut');
    if (mango) {
      mango.mesh.position.set(mango.x, 1.45, mango.z);
      mango.mesh.rotation.set(0.3, 0.8, 0.5);
      mango.marker.scale.setScalar(mango.final * 1.25);
      mango.ringMat.uniforms.uOpacity.value = 0.9;
    }
    if (coco) {
      coco.mesh.position.set(coco.x, 3.0, coco.z);
      coco.marker.scale.setScalar(coco.final * 1.2);
      coco.ringMat.uniforms.uOpacity.value = 0.9;
    }

    // let the camera glide into place and the journey settle, then render the shot
    for (let i = 0; i < 160; i++) { d.updateJourney(1 / 60); d.updateBarge(1 / 60); d.renderFrame(1 / 60); }
    d.updateJourney(0);
    d.renderFrame(0);
    // grab the picture in the same task as the render (the drawing buffer is not kept)
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const g = out.getContext('2d');
    g.drawImage(r.domElement, 0, 0, W, H);
    if (step > 1) {                                                    // posterise: round each colour channel to a multiple of `step`
      const px = g.getImageData(0, 0, W, H);
      const a = px.data;
      for (let i = 0; i < a.length; i += 4) {
        a[i] = Math.min(255, Math.round(a[i] / step) * step);
        a[i + 1] = Math.min(255, Math.round(a[i + 1] / step) * step);
        a[i + 2] = Math.min(255, Math.round(a[i + 2] / step) * step);
      }
      g.putImageData(px, 0, 0);
    }

    // the wordmark and the kicker, composed on top as on the start screen
    try {
      await Promise.all([document.fonts.load('600 22px "Cormorant Garamond"'), document.fonts.load('800 24px Archivo')]);
      const svg = wordmarkSVG({ ink: '#2B1A10', accent: '#F2A93B' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const ww = W * 0.4;
      g.drawImage(img, W * 0.055, H * 0.13, ww, ww * (224 / 500));
      g.fillStyle = '#2B1A10';
      g.font = '600 22px "Cormorant Garamond", Georgia, serif';
      const kicker = 'A START.NG GAME · LAGOS';
      let x = W * 0.058;
      for (const ch of kicker) { g.fillText(ch, x, H * 0.095); x += g.measureText(ch).width + 7; }
    } catch { /* no wordmark: the picture is still the game */ }

    const blob = await new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('toBlob returned nothing'))), 'image/png'));
    const url = URL.createObjectURL(blob);
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#222;display:grid;place-items:center';
    ov.innerHTML = `<img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain" alt="cover preview">`;
    addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); }, { once: true });
    document.body.appendChild(ov);
    window.__mango.coverBlob = blob;
    return blob;
  };
}

void THREE;
