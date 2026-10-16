// Mango Rush — full-screen UI: loading, start, warm-up hints, countdown, pause, game over.
//                                                    OWNER: Claude Code  ·  STATUS: stub (plain, unstyled)
//
// Plain DOM + CSS. No frameworks, no three.js. The 3D scene renders behind these screens on <canvas id="scene">;
// screens must leave the character visible (desktop: paper panel on the LEFT ~600 px wide, scene on the right;
// phone < 720 px wide: scene on top, paper bottom sheet). Match the mockups (Golden Hour Print).
//
// IMPORTS ALLOWED: '../core/state.js' (state, READ ONLY), '../core/events.js' (EVENTS, on),
//                  '../core/config.js' (CONFIG), '../content/text.js' (TEXT, fill, pickLine),
//                  './wordmark.js' (wordmarkSVG)
//
// CONTRACT (keep these exact exports and signatures):
//
//   initScreens(root: HTMLElement, actions) -> void
//     actions = { onPlay(), onDaily(), onResume(), onRestart(), onQuit(), onPlayAgain(), onMenu(),
//                 onShare(), onSettings(settings), onSignIn(), onLeaderboard() }
//     Build all screen DOM once inside root; show/hide with classes (no re-creating on every show).
//
//   showLoading({ message }) -> void
//     Ochre paper full screen, wordmark, a spinning dot-ring (CSS), the message, and one random TEXT.loading.tips line.
//
//   showStart({ player, best, dailyBest, dailyLabel, settings, isTouch }) -> void
//     player = { id, name, account, signedIn, face, style } (see core/state.js for the style values;
//       show "tophat" as "Top hat"; any unknown value: show it capitalised). account -> small "@account" under the name.
//     Guest: a "Sign in with start.ng" button (actions.onSignIn) instead of the synced badge.
//     A "Leaderboard" text button (actions.onLeaderboard) beside Best.
//     Shows: TEXT.kicker; the wordmark (wordmarkSVG()); TEXT.tagline; player name; synced badge
//     (signed in) or guest hint with a link to https://start.ng; "Wearing" chips (hair with hair-colour dot,
//     hat if not none, accessory if not none, Top dot, Bottoms dot, Skin dot); Play (primary, big) and Daily Run
//     (secondary, with TEXT.start.dailySub filled with {date: dailyLabel}); Best and Daily best numbers
//     (tabular, thousands separators; "—" when 0); music and sound toggle buttons (icons + aria-labels);
//     controls hint (desktop vs touch).
//     Keyboard: Enter or Space = Play.
//
//   showWarmupHint(hint: 'move'|'catch'|'dodge'|null, isTouch: boolean) -> void
//     Small umber chip near the bottom centre with the TEXT.warmup line; null hides it. Fades in/out.
//
//   showCountdown(n: number) -> void   n = 3,2,1,0 -> TEXT.countdown[3-n]; huge Archivo 900, pops in; hides itself after 0.6 s.
//
//   showPause(settings) -> void
//     Dim + blur the game; card with TEXT.pause.title, Resume (Esc also resumes), Restart, Quit to menu,
//     three toggles (music, sound effects, reduced motion) that call actions.onSettings({...}).
//
//   showGameOver(summary, { player, portraitUrl }) -> void
//     summary is a RunSummary (see core/state.js). Night background (#0B0B0C + deep-green dot rings).
//     Framed poster card (ochre, 2px umber border, inner 1px rule, corner diamonds, vermilion offset shadow):
//     kicker ("Daily run · <date>" or "Free play"); headline = pickLine(TEXT.gameOver.headlines[summary.reachedPhase]);
//     the score COUNTS UP from 0 over 800 ms (ease-out) in Archivo 900 with a vermilion print shadow;
//     NEW BEST stamp if summary.isBest; medal badge (dot-ring SVG, medal name); stats grid (mangoes, best combo
//     x<bestMultiplier>, near misses, survived m:ss); progress bar to summary.nextMedal (hidden at diamond);
//     buttons: Play again (Space/Enter), Share card, Menu. Appears 650 ms after the call (after the slow-mo).
//     Leaderboard line under the score: signed in -> "Saving to the start.ng leaderboard…" until
//     EVENTS.LEADERBOARD_SAVED arrives, then "#<rank> on start.ng" (+ "New best on the board" when improved);
//     guest -> "Sign in to get on the leaderboard" button (actions.onSignIn).
//
//   showLeaderboard({ entries, myId, loading }) -> void
//     Overlay card (works over the start screen and the game-over screen): title "Leaderboard", up to 10 rows:
//     rank, name, score (thousands separators), survived (m:ss from stats.survived), mangoes; the row whose
//     player_id === myId is highlighted (saffron background). loading -> a dot-ring spinner. Close button + Esc.
//     main.js calls it again with entries when EVENTS.LEADERBOARD_DATA arrives.
//
//   hideScreens() -> void   hide every screen (during play)
//
// DESIGN TOKENS: use the CSS variables in css/tokens.css (do not hard-code colours elsewhere).
// ACCESSIBILITY: real <button>s, visible focus ring, text contrast >= 4.5:1, touch targets >= 44 px,
// respect state.settings.reducedMotion (no slide/pop animations, fades only).

import TEXT from '../content/text.js';

let els = {};
let actions = {};

export function initScreens(root, a) {
  actions = a;
  root.innerHTML = `
    <section class="stub-screen" data-screen="loading"><p class="stub-msg"></p></section>
    <section class="stub-screen" data-screen="start">
      <h1>${TEXT.title}</h1><p class="stub-greet"></p>
      <button data-act="play">${TEXT.start.play}</button>
      <button data-act="daily">${TEXT.start.daily}</button>
    </section>
    <section class="stub-screen" data-screen="pause">
      <h2>${TEXT.pause.title}</h2>
      <button data-act="resume">${TEXT.pause.resume}</button>
      <button data-act="restart">${TEXT.pause.restart}</button>
      <button data-act="quit">${TEXT.pause.quit}</button>
    </section>
    <section class="stub-screen" data-screen="over">
      <p class="stub-score"></p>
      <button data-act="again">${TEXT.gameOver.playAgain}</button>
      <button data-act="share">${TEXT.gameOver.share}</button>
      <button data-act="menu">${TEXT.gameOver.menu}</button>
    </section>
    <div class="stub-hint" hidden></div>
    <div class="stub-count" hidden></div>`;
  const q = (s) => root.querySelector(s);
  els = { root, loading: q('[data-screen="loading"]'), start: q('[data-screen="start"]'), pause: q('[data-screen="pause"]'),
    over: q('[data-screen="over"]'), hint: q('.stub-hint'), count: q('.stub-count') };
  const map = { play: 'onPlay', daily: 'onDaily', resume: 'onResume', restart: 'onRestart', quit: 'onQuit',
    again: 'onPlayAgain', share: 'onShare', menu: 'onMenu' };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) actions[map[b.dataset.act]]?.();
  });
}

function only(name) {
  for (const k of ['loading', 'start', 'pause', 'over']) els[k].hidden = k !== name;
}

export function showLoading({ message }) { only('loading'); els.loading.querySelector('.stub-msg').textContent = message; }
export function showStart({ player }) { only('start'); els.start.querySelector('.stub-greet').textContent = player.name; }
export function showWarmupHint(hint) { els.hint.hidden = !hint; els.hint.textContent = hint ? TEXT.warmup[hint] : ''; }
export function showCountdown(n) { els.count.hidden = false; els.count.textContent = TEXT.countdown[3 - n]; }
export function showPause() { only('pause'); }
export function showGameOver(summary) { only('over'); els.over.querySelector('.stub-score').textContent = String(summary.score); }
export function showLeaderboard({ entries = [], myId, loading } = {}) {}
export function hideScreens() { only(null); els.count.hidden = true; }
