// Mango Rush — game feel: freeze frames, slow motion, camera shake, squash & stretch, particles, pop-up text.
//                                                    OWNER: Claude Code  ·  STATUS: stub
//
// IMPORTS ALLOWED: 'three' (import * as THREE from 'three'), '../core/config.js' (CONFIG),
//                  '../core/state.js' (state), '../core/events.js' (EVENTS, on)
//
// CONTRACT (keep these exact exports and signatures):
//
//   initJuice({ scene, camera, popupRoot }) -> void
//     scene/camera: three.js objects. popupRoot: an HTMLElement covering the screen (position: fixed; inset: 0;
//     pointer-events: none) where DOM pop-up text goes. Subscribe to the events below.
//
//   timeScale() -> number
//     main.js multiplies the game dt by this every frame. 0 during a freeze, slowMo.scale during slow motion
//     (ease back to 1 over 0.15 s at the end), else 1. Camera shake, particles and pop-ups keep animating
//     with REAL dt during freezes.
//
//   updateJuice(realDt: number) -> void      every frame, real (unscaled) dt in seconds
//
//   cameraShake() -> { x: number, y: number, roll: number }
//     Offset that renderer.js adds to the camera this frame. Smooth noise (sum of 2-3 sines with different
//     frequencies is fine), amplitude = strength x e^(-decay x t). Never random jitter per frame.
//
//   squash(object3D, scaleY: number, ms: number) -> void
//     Volume-preserving: scale.y = s, scale.x = scale.z = 1 / sqrt(s); then spring back to 1 with a small
//     overshoot (elastic) over ~180 ms. object3D's origin is at its feet, so it squashes into the ground.
//
//   burst({ x, y, z }, color: string, count: number, speed = 4) -> void
//     Small particles flying out with gravity (-14 units/s^2), fading/shrinking over 0.5-0.9 s.
//     Use ONE THREE.InstancedMesh (max 256 instances, small IcosahedronGeometry, MeshBasicMaterial) created at
//     init; reuse slots in a ring buffer. ZERO allocations per frame (no new Vector3 in update).
//
//   popup(text: string, { x, y, z }, kind = 'normal') -> void
//     DOM element in popupRoot at the projected screen position (Vector3.project(camera)), class
//     "popup popup--<kind>" (kinds: normal, gold, bad, perfect, near, big), rises 60 px and fades over 0.9 s,
//     then removed. Pool up to 12 elements. Gemini's CSS styles the classes.
//
// AUTOMATIC FEEL (subscribe with on(); values from CONFIG.feel[<name>]):
//   EVENTS.CATCH          mango -> 'catch', golden -> 'golden' (burst + popup "+<points>" kind normal/gold;
//                         popup also shows "x<multiplier>" when multiplier > 1, e.g. "+300 x3")
//   EVENTS.NEAR_MISS      'nearMiss'  popup "NEAR MISS +<points>" kind near
//   EVENTS.PERFECT_DODGE  'perfectDodge' (+ slow motion) popup "PERFECT DODGE" kind perfect
//   EVENTS.HIT            'hit' (shielded: shake 0.15 only, popup "BLOCKED" kind normal) popup "BONK!" kind bad
//   EVENTS.DASH           'dash' (dust burst at feet)
//   EVENTS.COMBO_CHANGE   stepUp -> 'stepUp'
//   EVENTS.RUN_END        'gameOver' (+ slow motion)
//   For each: freeze(ms), shake(strength, decay), squash(player, ...) if a player object was registered
//   via setPlayerObject(object3D), burst(...) at the event position.
//   Popup text strings come from TEXT (import TEXT from '../content/text.js') where available:
//   TEXT.popups.nearMiss, TEXT.popups.perfectDodge, TEXT.popups.bonk, TEXT.popups.blocked.
//
//   setPlayerObject(object3D) -> void
//
// REDUCED MOTION: if state.settings.reducedMotion, NO shake, NO slow motion, freezes capped at 30 ms;
// particles and pop-ups still play.
//
// RULES: no setTimeout/setInterval; everything advances in updateJuice. Dispose nothing per frame.

export function initJuice({ scene, camera, popupRoot }) {}
export function timeScale() { return 1; }
export function updateJuice(realDt) {}
export function cameraShake() { return { x: 0, y: 0, roll: 0 }; }
export function squash(object3D, scaleY, ms) {}
export function burst(pos, color, count, speed = 4) {}
export function popup(text, pos, kind = 'normal') {}
export function setPlayerObject(object3D) {}
