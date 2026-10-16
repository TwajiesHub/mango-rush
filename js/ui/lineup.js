// Mango Rush — a character / item line-up for looking closely.   OWNER: Claude Code  ·  STATUS: step 4, DEBUG ONLY
//
// Loaded ONLY with ?debug (main.js imports it on demand): window.__mango.lineup({ characters: [...], items: [...] }) freezes the game loop,
// hides the start screen and puts the given characters (and drop items) in a row in front of a close menu camera, so a style, a pose
// or a model can be inspected and screenshotted.
//   characters: [{ style: {…start.ng style keys…}, name, rot (radians, 0 = facing the camera), motion: { vx, vz, ax, az, dashing, skidding },
//                  steps (frames to settle), react: 'catch'|'hit'|'cheer'|'wave', pose: 'slump'|'cheer' }]
//   items: ['golden', 'mango', 'rotten', 'shield', 'coconut']   landed on the deck in a row behind the characters
//   camera: 'close' (default) | 'wide'
//   window.__mango.lineup(null) puts everything back (reload to be sure).

import { buildCharacter, updateCharacterMotion, triggerReaction, setCharacterPose, disposeCharacter } from '../world/character.js';
import { normalizeStyle, DEFAULT_STYLE } from '../startng.js';
import { CONFIG } from '../core/config.js';
import { setCameraMode, renderFrame } from '../world/renderer.js';
import { forceDrop, updateDrops, clearDrops } from '../play/drops.js';
import { deckRoot } from '../world/barge.js';
import { getPlayer } from '../play/player.js';

let made = [];
const STILL = { vx: 0, vz: 0, ax: 0, az: 0, dashing: false, skidding: false };

export function lineup({ characters = [], items = [], camera = 'close' } = {}) {
  for (const c of made) { c.parent?.remove(c); disposeCharacter(c); }
  made = [];
  clearDrops();
  document.querySelectorAll('[data-screen]').forEach((e) => { e.hidden = true; });
  const player = getPlayer().object;
  if (player) player.visible = false;
  const m = CONFIG.camera.menu.landscape;
  if (camera === 'close') { m.pos = [0.1, 1.55, -0.3]; m.pitchDeg = 3; m.horizonFrac = 0.55; } else { m.pos = [0.1, 2.2, 3.5]; m.pitchDeg = 8; m.horizonFrac = 0.5; }
  setCameraMode('menu');
  const n = characters.length;
  characters.forEach((spec, i) => {
    const style = normalizeStyle({ ...DEFAULT_STYLE, hat: 'none', accessory: 'none', ...(spec.style || {}) });
    const c = buildCharacter(style, spec.name || 'Bonnke');
    c.position.set((i - (n - 1) / 2) * 1.35, 0, -3.2);
    c.rotation.y = spec.rot ?? 0;
    deckRoot().add(c);
    const mot = { ...STILL, ...(spec.motion || {}) };
    for (let k = 0; k < (spec.steps ?? 40); k++) updateCharacterMotion(c, 1 / 60, mot);
    if (spec.pose) setCharacterPose(c, spec.pose);
    if (spec.react) triggerReaction(c, spec.react);
    if (spec.react || spec.pose) for (let k = 0; k < (spec.reactSteps ?? 8); k++) updateCharacterMotion(c, 1 / 60, mot);
    made.push(c);
  });
  items.forEach((type, i) => forceDrop(type, (i - (items.length - 1) / 2) * 1.1, -4.6, 0.3));
  for (let i = 0; i < 8; i++) updateDrops(0.05);
  for (let i = 0; i < 160; i++) renderFrame(0.05);
  return made.length;
}
