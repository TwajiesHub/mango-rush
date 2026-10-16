// Mango Rush — in-game HUD, banners, screen-edge effects and touch controls.
//                                                    OWNER: Claude Code  ·  STATUS: stub
//
// Plain DOM + CSS over the 3D canvas. Match the in-game mockups (desktop + phone).
// IMPORTS ALLOWED: '../core/state.js' (state, READ ONLY), '../core/events.js' (EVENTS, on),
//                  '../core/config.js' (CONFIG), '../content/text.js' (TEXT, fill)
//
// CONTRACT (keep these exact exports and signatures):
//
//   initHud(root: HTMLElement, actions) -> void      actions = { onPause(), onDash() }
//     Build the HUD DOM once:
//       top-left  : player card (circular portrait 58 px, name in caps, 3 mango life icons; lost = dashed outline)
//       top-centre: combo gauge — dark disc with a ring of 24 dots that drain with state.comboTimerFrac
//                   (SVG circle, pathLength 24, stroke-dasharray trick), "x<multiplier>" in the middle,
//                   5 pips under it for state.comboStep; a thin gold Madness meter under the pips (state.madnessFrac)
//       top-right : SCORE label, big score (Archivo 900, tabular, thousands separators, umber print shadow),
//                   chip with TEXT.hud.aheadOfBest / behindBest from state.aheadOfBest (hidden when null)
//       bottom-left : time-of-day bar: label = TEXT.phases[state.phase] and m:ss of state.time; 3 segments
//                     (golden 0-60, dusk 60-150, night 150-240 s, widths proportional) with a marker at state.time
//                     (clamped at 240); labels under: MAKOKO · BRIDGE · CITY
//       bottom-right: dash indicator (ring fills with state.dashReadyFrac, "Space · Dash ready" on desktop) and a
//                     52 px pause button (calls actions.onPause)
//       banner      : centred under the combo gauge, umber strip with Cormorant spaced caps
//       touch       : floating joystick (base 104 px ring + 50 px knob) and an 88 px DASH button bottom-right
//                     (pointerdown -> actions.onDash). The pause button moves under the score on phones.
//       shield      : when state.shield, a small woven calabash icon beside the lives
//
//   showHud(visible: boolean) -> void
//   showTouchControls(visible: boolean) -> void
//
//   updateHud() -> void   called every frame while the HUD is visible. Read `state`; WRITE TO THE DOM ONLY WHEN
//     A VALUE CHANGED (cache last values). Never allocate per frame. Must stay cheap (< 0.3 ms).
//
//   setPortrait(url: string) -> void   the player's face: state.player.face from start.ng (a PNG data URL),
//     or a portrait rendered by renderer.js when start.ng gave none. Show it as the circular portrait.
//
//   setJoystick({ active, x, y, dx, dy }) -> void   called by input.js on phones. x,y = base centre (px),
//     dx,dy = knob offset in px (already clamped to 50). active false hides it.
//
// EVENT REACTIONS (subscribe with on()):
//   PLACE_ENTER       banner with TEXT.places[place] for 2.5 s (slide down, fade out)
//   HAPPENING_WARN    banner with TEXT.happenings[id] for 2 s, vermilion strip instead of umber
//   COMBO_CHANGE      stepUp: gauge pops (scale 1.15) and glows gold; stepDown: gauge shakes 200 ms
//   LIVES_CHANGE      the lost life icon pops and greys out
//   HIT               red edge flash (an overlay with an inset vignette, 0.28 opacity, fades 350 ms);
//                     shielded: a short white flash instead
//   HEARTBEAT_START   add class "is-heartbeat" to <body>: vignette pulsing every 0.85 s; colours of the HUD stay;
//   HEARTBEAT_END     remove it
//   MADNESS_START/END add/remove class "is-madness" on <body>: gold glow on the edges, gauge turns gold
//   BEST_PASSED       score number flashes gold + TEXT.popups.newBest chip under the score for 2 s
//   RUN_START         reset all animations/classes
// REDUCED MOTION (state.settings.reducedMotion): no shakes/slides/pulses — use opacity changes only.
// DESIGN TOKENS: CSS variables in css/tokens.css. Safe areas: use env(safe-area-inset-*) on phones.

import { state } from '../core/state.js';

let root = null;

export function initHud(r, actions) {
  root = r;
  root.innerHTML = '<div class="stub-hud"><span class="stub-score">0</span> · <span class="stub-lives">3</span></div>';
}
export function showHud(visible) { if (root) root.hidden = !visible; }
export function showTouchControls(visible) {}
let last = { score: -1, lives: -1 };
export function updateHud() {
  if (!root) return;
  if (state.score !== last.score) { last.score = state.score; root.querySelector('.stub-score').textContent = state.score; }
  if (state.lives !== last.lives) { last.lives = state.lives; root.querySelector('.stub-lives').textContent = state.lives; }
}
export function setPortrait(url) {}
export function setJoystick(j) {}
