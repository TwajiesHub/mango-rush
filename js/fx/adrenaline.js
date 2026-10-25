// Mango Rush — Heartbeat and Mango Madness: the looks that are not CSS.   OWNER: Claude Code  ·  STATUS: step 9
//
// CONTRACT:
//   updateAdrenaline(realDt) -> void   every frame (real time, so it also eases during a freeze). Nothing here changes the game; it only eases looks.
//     HEARTBEAT (state.heartbeat, the last life): the shared saturation uniform (materials.setSaturation) drains to CONFIG.adrenaline.heartbeat.sat
//       (30% of the colour = 70% drained) over 0.6 s and comes back the same way. The player's character, the warning rings, the bank spots, the golden
//       plank, hazard decals and the HUD keep full colour (materials.keepColorDuring / their own shaders / DOM). The edge vignette pulse is CSS (body.is-heartbeat).
//     MANGO MADNESS (state.madnessActive): the deck lights lean gold (journey.setGoldTint) and the player's outline turns gold, eased in over pushEase and
//       out over endFade (0.6 s: a soft end). The gold edge glow is CSS (body.is-madness).
//     CAMERA PUSH: the camera moves in 4% for Heartbeat and 8% for Madness (renderer.setCameraPush), eased. NONE with reduced motion.
//   resetAdrenaline() -> void          at once, no easing (a new run, the menu)
//
// A run that ends keeps its look through the game over transition ("dying"); the look fades out when the game over screen is up.

import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { setSaturation, setPlayerOutlineGold } from '../world/materials.js';
import { setCameraPush } from '../world/renderer.js';
import { setGoldTint } from '../world/journey.js';

const A = CONFIG.adrenaline;

let sat = 1;          // the saturation now
let hbK = 0;          // 0..1 how far the Heartbeat look has come
let madK = 0;         // 0..1 how far the Madness look has come
let hbWas = false;    // the last life was on when the run ended (held through the dying transition)

function toward(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

export function resetAdrenaline() {
  sat = 1;
  hbK = madK = 0;
  hbWas = false;
  setSaturation(1);
  setGoldTint(0);
  setPlayerOutlineGold(0);
  setCameraPush(0);
}

export function updateAdrenaline(realDt) {
  const screen = state.screen;
  const running = screen === 'play' || screen === 'paused';
  if (running) hbWas = state.heartbeat;
  const wantHb = (running && state.heartbeat) || (screen === 'dying' && hbWas);
  const wantMad = running && state.madnessActive;
  const H = A.heartbeat;
  const M = A.madness;

  const wantSat = wantHb ? H.sat : 1;
  if (sat !== wantSat) {
    sat = toward(sat, wantSat, ((1 - H.sat) / H.fade) * realDt);   // 0.6 s from full colour to drained, and back
    setSaturation(sat);
  }
  hbK = toward(hbK, wantHb ? 1 : 0, realDt / H.pushEase);
  madK = toward(madK, wantMad ? 1 : 0, realDt / (wantMad ? M.pushEase : M.endFade));
  setGoldTint(madK);
  setPlayerOutlineGold(madK);
  const ease = (k) => k * k * (3 - 2 * k);
  setCameraPush(state.settings.reducedMotion ? 0 : Math.min(0.1, ease(hbK) * H.push + ease(madK) * M.push));
}
