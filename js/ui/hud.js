// Mango Rush — in-game HUD, banners, screen-edge effects and touch controls.
//                                                    OWNER: Claude Code  ·  STATUS: step 1 (working HUD; step 8 matches the mockups)
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
import { EVENTS, on } from '../core/events.js';
import { CONFIG } from '../core/config.js';
import TEXT, { fill } from '../content/text.js';

// STEP 1 SCOPE: a working HUD with the contract's pieces (player card + lives, combo gauge + pips, Madness meter,
// score + best chip, time-of-day, dash indicator, pause, banner, flash, touch controls). Step 8 matches the
// mockups (24-dot gauge ring art, 3-segment time bar, calabash icon).

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';

let root = null;
let isDesktop = true;   // Space dashes on desktop: the indicator says so
let el = {};
let actions = {};
const last = {
  score: -1, lives: -1, mult: -1, step: -1, timer: -1, madness: -1, ahead: undefined, time: '', phase: '',
  dash: -1, shield: null,
};
let bannerTimer = 0;

export function initHud(r, a) {
  root = r;
  actions = a;
  try { isDesktop = !matchMedia('(pointer: coarse)').matches; } catch { isDesktop = true; }
  const hearts = Array.from({ length: CONFIG.lives }, () => `<span class="heart" role="img" aria-label="${TEXT.a11y.life}">${HEART}</span>`).join('');
  root.innerHTML = `
    <div class="hud__flash" aria-hidden="true"></div>
    <div class="hud__card">
      <img class="hud__face" alt="" width="58" height="58" />
      <div>
        <p class="hud__name"></p>
        <div class="hud__lives" aria-label="${TEXT.hud.lives}">${hearts}<span class="hud__shield" hidden title="${TEXT.popups.shield}"></span></div>
      </div>
    </div>
    <div class="hud__combo" aria-label="${TEXT.hud.combo}">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="gauge__bg" cx="32" cy="32" r="27" />
        <circle class="gauge__ring" cx="32" cy="32" r="27" pathLength="24" stroke-dasharray="0 24" transform="rotate(-90 32 32)" />
      </svg>
      <b class="combo__x">x1</b>
      <div class="combo__pips">${'<i></i>'.repeat(CONFIG.scoring.catchesPerStep)}</div>
      <div class="combo__madness"><i></i></div>
    </div>
    <div class="hud__score">
      <span class="label">${TEXT.hud.score}</span>
      <b class="score__n">0</b>
      <span class="score__chip" hidden></span>
    </div>
    <div class="hud__time"><span class="time__phase"></span><b class="time__clock">0:00</b></div>
    <div class="hud__banner" role="status" hidden></div>
    <div class="hud__bottom">
      <button class="hud__dash" type="button" aria-label="${TEXT.a11y.dash}"><i></i><span class="dash__text"></span></button>
      <button class="hud__pause" type="button" aria-label="${TEXT.a11y.pause}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg></button>
    </div>
    <div class="touch" hidden>
      <div class="touch__joy" hidden><i></i></div>
      <button class="touch__dash" type="button" aria-label="${TEXT.a11y.dash}">${TEXT.a11y.dash}</button>
    </div>`;
  const q = (s) => root.querySelector(s);
  el = {
    flash: q('.hud__flash'), face: q('.hud__face'), name: q('.hud__name'),
    hearts: Array.from(root.querySelectorAll('.heart')), shield: q('.hud__shield'),
    combo: q('.hud__combo'), ring: q('.gauge__ring'), x: q('.combo__x'),
    pips: Array.from(root.querySelectorAll('.combo__pips i')), madness: q('.combo__madness i'),
    score: q('.score__n'), chip: q('.score__chip'), phase: q('.time__phase'), clock: q('.time__clock'),
    banner: q('.hud__banner'), dash: q('.hud__dash'), dashFill: q('.hud__dash i'), dashText: q('.dash__text'),
    touch: q('.touch'), joy: q('.touch__joy'), knob: q('.touch__joy i'),
  };
  q('.hud__pause').addEventListener('click', () => actions.onPause?.());
  // the dash indicator is a real button: a click or tap dashes at once (and takes no focus, so Space stays a game key)
  el.dash.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.onDash?.(); });
  el.dash.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });   // keys dash through input.js, never click
  const dashBtn = q('.touch__dash');
  dashBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); actions.onDash?.(); });
  dashBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  on(EVENTS.RUN_START, reset);
  on(EVENTS.PLACE_ENTER, (e) => banner(TEXT.places[e.place], 2500, false));
  on(EVENTS.HAPPENING_WARN, (e) => banner(TEXT.happenings[e.id], 2000, true));
  on(EVENTS.COMBO_CHANGE, (e) => {
    if (e.stepUp) pulse(el.combo, 'is-pop');
    else if (e.stepDown) pulse(el.combo, 'is-shake');
  });
  on(EVENTS.LIVES_CHANGE, (e) => {
    el.hearts.forEach((h, i) => {
      const lost = i >= e.lives;
      h.classList.toggle('is-lost', lost);
      if (lost) pulse(h, 'is-pop');
    });
  });
  on(EVENTS.HIT, (e) => {
    el.flash.classList.toggle('is-white', !!e.shielded);
    el.flash.classList.add('is-on');
    setTimeout(() => el.flash.classList.remove('is-on'), 60);
  });
  on(EVENTS.HEARTBEAT_START, () => document.body.classList.add('is-heartbeat'));
  on(EVENTS.HEARTBEAT_END, () => document.body.classList.remove('is-heartbeat'));
  on(EVENTS.MADNESS_START, () => document.body.classList.add('is-madness'));
  on(EVENTS.MADNESS_END, () => document.body.classList.remove('is-madness'));
  on(EVENTS.BEST_PASSED, () => {
    el.score.classList.add('is-best');
    el.chip.textContent = TEXT.popups.newBest;
    el.chip.hidden = false;
    last.ahead = null;   // the chip is showing the badge until the next change
    setTimeout(() => el.score.classList.remove('is-best'), 2000);
  });
  on(EVENTS.RUN_END, () => document.body.classList.remove('is-heartbeat', 'is-madness'));
}

function pulse(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function banner(text, ms, warn) {
  if (!text) return;
  el.banner.textContent = text.toUpperCase();
  el.banner.classList.toggle('is-warn', !!warn);
  el.banner.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.banner.hidden = true; }, ms);
}

function reset() {
  document.body.classList.remove('is-heartbeat', 'is-madness');
  el.hearts.forEach((h) => h.classList.remove('is-lost'));
  el.banner.hidden = true;
  el.flash.classList.remove('is-on');
  Object.assign(last, { score: -1, lives: -1, mult: -1, step: -1, timer: -1, madness: -1, ahead: undefined, time: '', phase: '', dash: -1, shield: null });
}

export function showHud(visible) {
  if (root) root.hidden = !visible;
}

export function showTouchControls(visible) {
  if (el.touch) el.touch.hidden = !visible;
  if (el.dash) el.dash.classList.toggle('is-touch', !!visible);
}

export function setPortrait(url) {
  if (el.face) {
    el.face.src = url || '';
    el.face.hidden = !url;
  }
  if (el.name) el.name.textContent = (state.player.name || 'Guest').toUpperCase();
}

export function setJoystick(j) {
  if (!el.joy) return;
  el.joy.hidden = !j.active;
  if (!j.active) return;
  el.joy.style.left = `${j.x}px`;
  el.joy.style.top = `${j.y}px`;
  el.knob.style.transform = `translate(${j.dx}px, ${j.dy}px)`;
}

const num = (n) => n.toLocaleString('en-US');

export function updateHud() {
  if (!root || root.hidden) return;
  const s = state;
  if (s.score !== last.score) { last.score = s.score; el.score.textContent = num(s.score); }
  if (s.lives !== last.lives) {
    last.lives = s.lives;
    el.hearts.forEach((h, i) => h.classList.toggle('is-lost', i >= s.lives));
  }
  if (s.multiplier !== last.mult) { last.mult = s.multiplier; el.x.textContent = `x${s.multiplier}`; }
  if (s.comboStep !== last.step) {
    last.step = s.comboStep;
    for (let i = 0; i < el.pips.length; i++) el.pips[i].classList.toggle('is-on', i < s.comboStep);
  }
  const timer = Math.round(s.comboTimerFrac * 48);
  if (timer !== last.timer) { last.timer = timer; el.ring.setAttribute('stroke-dasharray', `${(timer / 48) * 24} 24`); }
  const mad = Math.round((s.madnessActive ? Math.min(1, s.madnessTimeLeft / CONFIG.madness.duration) : s.madnessFrac) * 100);
  if (mad !== last.madness) { last.madness = mad; el.madness.style.width = `${mad}%`; }
  if (s.aheadOfBest !== last.ahead && !el.score.classList.contains('is-best')) {
    last.ahead = s.aheadOfBest;
    if (s.aheadOfBest === null) el.chip.hidden = true;
    else {
      el.chip.hidden = false;
      el.chip.textContent = s.aheadOfBest >= 0
        ? fill(TEXT.hud.aheadOfBest, { score: num(s.aheadOfBest) })
        : fill(TEXT.hud.behindBest, { score: num(-s.aheadOfBest) });
    }
  }
  const t = Math.floor(s.time);
  const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  if (clock !== last.time) { last.time = clock; el.clock.textContent = clock; }
  if (s.phase !== last.phase) { last.phase = s.phase; el.phase.textContent = TEXT.phases[s.phase].toUpperCase(); }
  const dashPct = Math.round(s.dashReadyFrac * 20);
  if (dashPct !== last.dash) {
    last.dash = dashPct;
    el.dashFill.style.width = `${dashPct * 5}%`;
    el.dash.classList.toggle('is-ready', dashPct >= 20);
    el.dashText.textContent = dashPct >= 20 ? (isDesktop ? TEXT.hud.dashReadyKey : TEXT.hud.dashReady) : '';
  }
  if (s.shield !== last.shield) { last.shield = s.shield; el.shield.hidden = !s.shield; }
}
