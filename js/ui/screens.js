// Mango Rush — full-screen UI: loading, start, warm-up hints, countdown, pause, game over, leaderboard, toast.
//                                                    OWNER: Claude Code  ·  STATUS: step 10 (the screens, matched to the mockups)
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
//                 onShare(), onShareX(), onSettings(settings), onSignIn(), onLeaderboard(), onSkipWarmup() }
//     START.NG GAME STANDARDS (start.ng checks for these): a visible link back to https://start.ng (the "← start.ng" link on the start screen and "Play more on
//     start.ng" under the game over buttons), the name "start.ng" shown (the kicker, the links), and a SHARE ON X button on the game over card (onShareX).
//     Build all screen DOM once inside root; show/hide with classes (no re-creating on every show).
//
//   showLoading({ message }) -> void
//     Ochre paper full screen, wordmark, a spinning dot-ring (CSS), the message, and one random TEXT.loading.tips line.
//
//   showStart({ player, best, dailyBest, dailyLabel, settings, isTouch }) -> void
//     The mockup: a 600 px ochre panel (woven strip on its right edge; on phones a bottom sheet with the strip on top) with the kicker, the
//     overhanging wordmark, tagline, rule, PLAYER / LOOK columns, the "wearing" chips (a dot of colour for hair, Top, Bottoms and Skin; hat and
//     accessory without), PLAY and DAILY RUN, BEST / DAILY BEST, a small Leaderboard text button, music + sound toggles and the controls hint.
//     Signed in: LOOK reads "Synced from start.ng" with a check badge. Guest: PLAYER "Guest", LOOK "Playing as guest" and a
//     "Sign in to save your scores" button (actions.onSignIn). Enter or Space = Play.
//
//   showWarmupHint(hint: 'move'|'catch'|'dodge'|'dash'|'ready'|null, isTouch: boolean) -> void   (touch wording for move and dash)
//   showSkip(visible) -> void   the warm-up's Skip button (actions.onSkipWarmup)
//   showCountdown(n: number) -> void   n = 3,2,1,0 -> TEXT.countdown[3-n]; huge Archivo 900, pops in; GO is saffron and stays CONFIG.countdown.goHold s.
//
//   showPause(settings) -> void
//     Dim + blur the game (a plain dim with reduced motion, or without backdrop-filter); a compact ochre card: Resume (Esc / P also resume),
//     Restart, Quit to menu, three toggles (music, sound effects, reduced motion) that call actions.onSettings({...}).
//
//   showGameOver(summary, { player, portraitUrl, dailyLabel }) -> void
//     The poster card (ochre, inner 1 px rule inset 10 px, corner diamonds, vermilion hard shadow), about 0.3 s after the call (the death transition
//     has ended by then): kicker "FREE PLAY · 25 OCT" / "DAILY RUN · 25 OCT"; headline by the phase reached (TEXT.gameOver.headlines); the score
//     COUNTS UP over 800 ms (the final number is announced once, aria-live polite); the NEW BEST stamp slams on after it; the medal (dot ring) and a
//     2 x 2 stats grid; the "NEXT: DIAMOND · 11,760 TO GO" bar; then, only when they apply: "Only 340 short of your best" (within 10%, not a new
//     best), "Lost in the pot: 2,400" and "Swoops 12 · Best chain x4 · Slams 3"; the rank lines; PLAY AGAIN (SPACE key chip), SHARE CARD, MENU.
//     Rank lines: signed in -> "Saving..." until EVENTS.LEADERBOARD_SAVED { ok, rank, improved, rival } arrives, then "#14 on start.ng" (or
//     "You're #1 on start.ng") and, when rival is set, "Tunde is 1 place above · 12,400". Guest -> a "Sign in to get on the board" button.
//     Focus lands on PLAY AGAIN.
//
//   showLeaderboard({ entries, myId, loading, error, me, guest }) -> void
//     An ochre poster card over the current screen: RANK · NAME (with their start.ng colour dot) · SCORE · SURVIVED · MANGOES, top 10. The row whose
//     player_id === myId is on saffron; outside the top 10 a separator and that row below. me = { rank, score, stats } is the fallback for the
//     player's own row (from their last save) when the fetched entries do not contain them. loading -> a dot-ring spinner; error -> "Couldn't load
//     the board. Try again." with a retry button (actions.onLeaderboard). guest -> "Sign in to get on the board". Close button + Esc.
//
//   showToast(text, ms = 2600) -> void   a short status line near the bottom of the screen (role=status); the share flow uses it.
//   hideScreens() -> void   hide every screen (during play)
//
// DESIGN TOKENS: use the CSS variables in css/tokens.css (do not hard-code colours elsewhere).
// ACCESSIBILITY: real <button>s, visible focus ring, text contrast >= 4.5:1, touch targets >= 44 px,
// respect state.settings.reducedMotion (no slide/pop/stamp animations, fades only).

import { state } from '../core/state.js';
import { EVENTS, on } from '../core/events.js';
import TEXT, { fill, pickLine } from '../content/text.js';
import { CONFIG } from '../core/config.js';
import { wordmarkSVG } from './wordmark.js';

let els = {};
let actions = {};
let current = null;
let overToken = 0;      // cancels a game-over card that was queued but is no longer wanted
let countTimer = 0;
let lastFocus = null;
let toastTimer = 0;
let countHide = 0;
let lastBoard = null;   // the arguments of the last showLeaderboard (the debug key and retry reuse them)

const OVER_DELAY = 300; // ms after showGameOver is called (the death transition has already ended)

const $esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('en-US');
const dash = (n) => (n > 0 ? num(n) : '—');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const label = (v) => (v === 'tophat' ? 'Top hat' : cap(String(v)));

const ICON_MUSIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="16.5" cy="16" r="2.6" fill="currentColor"/></svg>';
const ICON_SFX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 12v8h14v-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4 4 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="m7 12.5 3.2 3.2L17 8.8" fill="none" stroke="var(--paper)" stroke-width="2.6" stroke-linecap="square"/></svg>';
const CORNERS = '<i class="corner c1" aria-hidden="true"></i><i class="corner c2" aria-hidden="true"></i><i class="corner c3" aria-hidden="true"></i><i class="corner c4" aria-hidden="true"></i>';

// the medal: a ring of 24 dots, a ring of 20 umber dots and a disc with the medal name (the same dot-ring motif as the warnings)
const MEDAL_COLORS = { none: '#C9A66B', bronze: '#B87333', silver: '#D5D8DC', gold: '#F2A93B', diamond: '#8FE3EE' };
export function medalSVG(medal) {
  const c = MEDAL_COLORS[medal] || MEDAL_COLORS.none;
  let dots = '';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    dots += `<circle cx="${(60 + Math.cos(a) * 54).toFixed(1)}" cy="${(60 + Math.sin(a) * 54).toFixed(1)}" r="4.4" fill="${c}"/>`;
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 0.1;
    dots += `<circle cx="${(60 + Math.cos(a) * 41).toFixed(1)}" cy="${(60 + Math.sin(a) * 41).toFixed(1)}" r="2.8" fill="#2B1A10" opacity="${medal === 'none' ? 0.35 : 1}"/>`;
  }
  const name = medal === 'none' ? '—' : (TEXT.medals[medal] || '').toUpperCase();
  return `<svg viewBox="0 0 120 120" class="medal" aria-hidden="true">${dots}
    <circle cx="60" cy="60" r="30" fill="${c}" stroke="#2B1A10" stroke-width="2.4"/>
    <circle cx="60" cy="60" r="25" fill="none" stroke="#2B1A10" stroke-width="1" stroke-dasharray="1.4 3"/>
    <text x="60" y="64.5" text-anchor="middle" font-family="Archivo, system-ui, sans-serif" font-weight="900" font-size="${name.length > 5 ? 10.5 : 13}" letter-spacing="1" fill="#2B1A10">${name}</text></svg>`;
}

export function initScreens(root, a) {
  actions = a;
  const tip = '';
  root.innerHTML = `
    <section class="screen screen--loading" data-screen="loading" aria-live="polite">
      <div class="loading__inner">
        <div class="wordmark">${wordmarkSVG()}</div>
        <div class="spinner" aria-hidden="true"></div>
        <p class="loading__msg"></p>
        <p class="loading__tip">${tip}</p>
      </div>
    </section>

    <section class="screen screen--start" data-screen="start" aria-label="${$esc(TEXT.title)}">
      <p class="scene-tag"><i class="ring-icon" aria-hidden="true"></i>${$esc(TEXT.start.scene)}</p>
      <a class="back-link" href="https://start.ng" target="_blank" rel="noopener" aria-label="${$esc(TEXT.start.backLabel)}"><span aria-hidden="true">←</span> ${$esc(TEXT.start.backLink)}</a>
      <div class="panel">
        <div class="brand">
          <p class="kicker">${$esc(TEXT.kicker)}</p>
          <h1 class="wordmark" aria-label="${$esc(TEXT.title)}">${wordmarkSVG()}</h1>
        </div>
        <p class="tagline">${$esc(TEXT.tagline)}</p>
        <hr class="rule" />
        <div class="who">
          <div class="who__player">
            <span class="label">${$esc(TEXT.start.player)}</span>
            <p class="who__name"><span class="who__hi">${$esc(TEXT.start.hi)}</span><span class="who__nm"></span></p>
          </div>
          <div class="who__look">
            <span class="label">${$esc(TEXT.start.look)}</span>
            <p class="who__badge"></p>
            <p class="who__hint"></p>
            <button class="btn btn--small who__signin" type="button" data-act="signin" hidden>${$esc(TEXT.start.signInSave)}</button>
          </div>
        </div>
        <ul class="chips" aria-label="${$esc(TEXT.start.wearing)}"></ul>
        <div class="actions">
          <button class="btn btn--primary" type="button" data-act="play"><span>${$esc(TEXT.start.play)}</span>${ICON_ARROW}</button>
          <button class="btn btn--secondary" type="button" data-act="daily">
            <span class="daily__t">${$esc(TEXT.start.daily)}</span><small class="daily__sub"></small>
          </button>
        </div>
        <div class="bests">
          <div><span class="label">${$esc(TEXT.start.best)}</span><b class="bests__best">—</b></div>
          <div><span class="label">${$esc(TEXT.start.dailyBest)}</span><b class="bests__daily">—</b></div>
          <button class="btn btn--text bests__board" type="button" data-act="leaderboard">${$esc(TEXT.start.leaderboard)}</button>
          <div class="toggles">
            <button class="icon-btn" type="button" data-toggle="music" aria-pressed="true">${ICON_MUSIC}</button>
            <button class="icon-btn" type="button" data-toggle="sfx" aria-pressed="true">${ICON_SFX}</button>
          </div>
        </div>
        <p class="controls-hint"></p>
      </div>
    </section>

    <section class="screen screen--pause" data-screen="pause" role="dialog" aria-modal="true" aria-label="${$esc(TEXT.pause.title)}">
      <div class="card card--pause">
        <h2>${$esc(TEXT.pause.title)}</h2>
        <button class="btn btn--primary" type="button" data-act="resume">${$esc(TEXT.pause.resume)}</button>
        <button class="btn btn--secondary" type="button" data-act="restart">${$esc(TEXT.pause.restart)}</button>
        <button class="btn btn--secondary" type="button" data-act="quit">${$esc(TEXT.pause.quit)}</button>
        <div class="switches">
          <button class="switch" type="button" data-toggle="music" aria-pressed="true">${$esc(TEXT.pause.music)}</button>
          <button class="switch" type="button" data-toggle="sfx" aria-pressed="true">${$esc(TEXT.pause.sfx)}</button>
          <button class="switch" type="button" data-toggle="reducedMotion" aria-pressed="false">${$esc(TEXT.pause.reducedMotion)}</button>
        </div>
      </div>
    </section>

    <section class="screen screen--over" data-screen="over" role="dialog" aria-modal="true" aria-labelledby="over-headline">
      <div class="card card--poster">
        ${CORNERS}
        <div class="over__top">
          <p class="over__kicker"></p>
          <h2 class="over__headline" id="over-headline"></h2>
          <div class="over__scorewrap">
            <p class="over__score" aria-hidden="true">0</p>
            <p class="over__stamp" hidden>${$esc(TEXT.gameOver.newBest)}</p>
          </div>
          <p class="sr-only over__final" aria-live="polite"></p>
        </div>
        <div class="over__mid">
          <div class="over__medalbox"><span class="over__medalart"></span><span class="over__medalname"></span></div>
          <dl class="stats">
            <div><dt>${$esc(TEXT.gameOver.stats.mangoes)}</dt><dd class="s-mangoes">0</dd></div>
            <div><dt><span class="long">${$esc(TEXT.gameOver.stats.bestCombo)}</span><span class="short">${$esc(TEXT.gameOver.comboShort)}</span></dt><dd class="s-combo">×1</dd></div>
            <div><dt><span class="long">${$esc(TEXT.gameOver.stats.nearMisses)}</span><span class="short">${$esc(TEXT.gameOver.nearShort)}</span></dt><dd class="s-near">0</dd></div>
            <div><dt>${$esc(TEXT.gameOver.stats.survived)}</dt><dd class="s-time">0:00</dd></div>
          </dl>
        </div>
        <div class="over__progress" hidden>
          <div class="over__proghead"><span class="over__next"></span><span class="over__togo"></span></div>
          <div class="over__bar"><i></i></div>
        </div>
        <div class="over__notes">
          <p class="over__short" hidden></p>
          <p class="over__pot" hidden></p>
          <p class="over__skills" hidden></p>
        </div>
        <div class="over__rank">
          <p class="over__board"></p>
          <p class="over__rival" hidden></p>
        </div>
        <div class="over__actions">
          <button class="btn btn--primary" type="button" data-act="again"><span>${$esc(TEXT.gameOver.playAgain)}</span><kbd>${$esc(TEXT.gameOver.keySpace)}</kbd></button>
          <button class="btn btn--secondary" type="button" data-act="share">${ICON_SHARE}<span>${$esc(TEXT.gameOver.share)}</span></button>
          <button class="btn btn--secondary" type="button" data-act="sharex" aria-label="${$esc(TEXT.share.xLabel)}">${ICON_X}<span>${$esc(TEXT.share.xButton)}</span></button>
          <button class="btn btn--text" type="button" data-act="menu">${$esc(TEXT.gameOver.menu)}</button>
        </div>
        <p class="over__more">${$esc(TEXT.gameOver.moreOn)} <a href="https://start.ng" target="_blank" rel="noopener">start.ng</a></p>
      </div>
    </section>

    <section class="screen screen--board" data-screen="board" role="dialog" aria-modal="true" aria-label="${$esc(TEXT.leaderboard.title)}">
      <div class="card card--poster card--board">
        ${CORNERS}
        <p class="kicker board__kicker">${$esc(TEXT.title)}</p>
        <h2>${$esc(TEXT.leaderboard.title)}</h2>
        <div class="board__loading" role="status"><div class="spinner" aria-hidden="true"></div><span class="sr-only">${$esc(TEXT.leaderboard.loading)}</span></div>
        <div class="board__error" role="alert" hidden>
          <p>${$esc(TEXT.leaderboard.error)}</p>
          <button class="btn btn--secondary" type="button" data-act="retry-board">${$esc(TEXT.leaderboard.retry)}</button>
        </div>
        <p class="board__empty" hidden>${$esc(TEXT.leaderboard.empty)}</p>
        <div class="board__scroll">
          <table class="board__table" hidden>
            <thead><tr><th scope="col">${$esc(TEXT.leaderboard.rank)}</th><th scope="col">${$esc(TEXT.leaderboard.player)}</th><th scope="col" class="r">${$esc(TEXT.leaderboard.score)}</th><th scope="col" class="r">${$esc(TEXT.leaderboard.survived)}</th><th scope="col" class="r">${$esc(TEXT.leaderboard.mangoes)}</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <button class="btn btn--small board__signin" type="button" data-act="signin" hidden>${$esc(TEXT.leaderboard.signIn)}</button>
        <button class="btn btn--primary" type="button" data-act="close-board">${$esc(TEXT.leaderboard.close)}</button>
      </div>
    </section>

    <div class="hint" role="status" hidden></div>
    <button class="btn btn--small skip-warmup" type="button" data-act="skip-warmup" hidden>${$esc(TEXT.warmup.skip)}</button>
    <div class="countdown" aria-live="assertive" hidden></div>
    <div class="toast" role="status" aria-live="polite" hidden></div>`;

  const q = (s) => root.querySelector(s);
  els = {
    root,
    loading: q('[data-screen="loading"]'), start: q('[data-screen="start"]'), pause: q('[data-screen="pause"]'),
    over: q('[data-screen="over"]'), board: q('[data-screen="board"]'),
    hint: q('.hint'), count: q('.countdown'), toast: q('.toast'), skip: q('.skip-warmup'),
  };
  for (const k of ['loading', 'start', 'pause', 'over', 'board']) els[k].hidden = true;

  const map = {
    play: 'onPlay', daily: 'onDaily', resume: 'onResume', restart: 'onRestart', quit: 'onQuit',
    again: 'onPlayAgain', share: 'onShare', sharex: 'onShareX', menu: 'onMenu', signin: 'onSignIn', leaderboard: 'onLeaderboard',
    'retry-board': 'onLeaderboard', 'skip-warmup': 'onSkipWarmup',
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-toggle]');
    if (!t) return;
    if (t.dataset.toggle) {
      const key = t.dataset.toggle;
      const on = !(state.settings[key]);
      actions.onSettings?.({ [key]: on });
      syncToggles();
      return;
    }
    if (t.dataset.act === 'close-board') { closeBoard(); return; }
    actions[map[t.dataset.act]]?.();
  });

  // Enter / Space start a run from the start and game-over screens (unless a button has the focus: it handles itself)
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.board.hidden) { closeBoard(); e.stopPropagation(); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
    if (!els.board.hidden) return;
    if (current === 'start') { e.preventDefault(); actions.onPlay?.(); }
    else if (current === 'over' && !els.over.hidden && els.over.classList.contains('is-in')) { e.preventDefault(); actions.onPlayAgain?.(); }
  }, true);

  on(EVENTS.LEADERBOARD_SAVED, (r) => paintRank(r));
}

// the rank lines under the stats: "#14 on start.ng" (or "You're #1 on start.ng") and the rival, a plain line when it applies
function paintRank(r) {
  const line = els.over.querySelector('.over__board');
  const rival = els.over.querySelector('.over__rival');
  if (!state.player.signedIn) return;
  rival.hidden = true;
  if (r.ok) {
    const better = r.improved ? ` · ${TEXT.gameOver.boardBest}` : '';
    line.textContent = (r.rank === 1 ? TEXT.gameOver.top : fill(TEXT.gameOver.rank, { rank: r.rank })) + better;
    if (r.rank !== 1 && r.rival) {
      rival.textContent = fill(TEXT.gameOver.rival, { name: r.rival.name, score: num(r.rival.score) });
      rival.hidden = false;
    }
  } else {
    line.textContent = r.error === 'tuned' ? TEXT.gameOver.notRanked : TEXT.gameOver.saveFailed;
  }
}

function syncToggles() {
  for (const b of els.root.querySelectorAll('[data-toggle]')) {
    const key = b.dataset.toggle;
    const on = !!state.settings[key];
    b.setAttribute('aria-pressed', String(on));
    if (key === 'music') b.setAttribute('aria-label', on ? TEXT.a11y.musicOn : TEXT.a11y.musicOff);
    if (key === 'sfx') b.setAttribute('aria-label', on ? TEXT.a11y.sfxOn : TEXT.a11y.sfxOff);
  }
}

function only(name) {
  current = name;
  overToken++;
  cancelAnimationFrame(countTimer);
  for (const k of ['loading', 'start', 'pause', 'over']) els[k].hidden = k !== name;
  els.over.classList.remove('is-in');
  els.over.classList.remove('is-slam');
  els.board.hidden = true;
}

function focusFirst(el, sel) {
  const target = el.querySelector(sel);
  if (target) target.focus({ preventScroll: true });
}

export function showLoading({ message }) {
  only('loading');
  els.loading.querySelector('.loading__msg').textContent = message || '';
  els.loading.querySelector('.loading__tip').innerHTML = `<b>${$esc(TEXT.loading.tipLabel)}</b> ${$esc(pickLine(TEXT.loading.tips))}`;
}

export function showStart({ player, best, dailyBest, dailyLabel, settings, isTouch }) {
  only('start');
  const s = els.start;
  const signedIn = !!player.signedIn;
  s.querySelector('.who__nm').textContent = signedIn ? player.name : TEXT.start.guestName;
  const badge = s.querySelector('.who__badge');
  const hint = s.querySelector('.who__hint');
  if (signedIn) {
    badge.innerHTML = `<span class="check">${ICON_CHECK}</span><span>${$esc(TEXT.start.synced)}</span>`;
    hint.innerHTML = `${$esc(TEXT.start.changeLook).replace('start.ng', '<a href="https://start.ng" target="_blank" rel="noopener">start.ng</a>')}`;
  } else {
    badge.textContent = TEXT.start.guestLook;
    hint.textContent = '';
  }
  s.querySelector('.who__signin').hidden = signedIn;
  s.classList.toggle('is-guest', !signedIn);

  const st = player.style || {};
  const dot = (c) => `<i class="dot" style="background:${$esc(c)}"></i>`;
  const chips = [];
  if (st.hair) chips.push(`${dot(st.hairColor)}${$esc(label(st.hair))}`);
  if (st.hat && st.hat !== 'none') chips.push($esc(label(st.hat)));
  if (st.accessory && st.accessory !== 'none') chips.push($esc(label(st.accessory)));
  chips.push(`${dot(st.primaryColor)}Top`, `${dot(st.secondaryColor)}Bottoms`, `${dot(st.skinColor)}Skin`);
  s.querySelector('.chips').innerHTML = chips.map((c) => `<li>${c}</li>`).join('');

  s.querySelector('.daily__sub').textContent = fill(TEXT.start.dailySub, { date: dailyLabel });
  s.querySelector('.bests__best').textContent = dash(best);
  s.querySelector('.bests__daily').textContent = dash(dailyBest);
  s.querySelector('.controls-hint').textContent = isTouch ? TEXT.start.controlsTouch : TEXT.start.controlsDesktop;
  void settings;
  syncToggles();
  focusFirst(s, '[data-act="play"]');
}

export function showWarmupHint(hint, isTouch = false) {
  if (!hint) { els.hint.hidden = true; return; }
  els.hint.textContent = isTouch && (hint === 'move' || hint === 'dash') ? TEXT.warmup[hint + 'Touch'] : TEXT.warmup[hint];
  els.hint.hidden = false;
  els.hint.classList.remove('is-in');
  void els.hint.offsetWidth;
  els.hint.classList.add('is-in');   // a short fade in
}

/** The Skip button of the first-run warm-up (also Esc): shown while the warm-up runs. */
export function showSkip(visible) {
  if (els.skip) els.skip.hidden = !visible;
}

export function showCountdown(n) {
  els.count.textContent = TEXT.countdown[3 - n];
  els.count.hidden = false;
  els.count.classList.toggle('is-go', n === 0);   // GO is saffron
  els.count.classList.remove('pop');
  void els.count.offsetWidth;
  els.count.classList.add('pop');
  clearTimeout(countHide);
  if (n === 0) countHide = setTimeout(() => { els.count.hidden = true; }, CONFIG.countdown.goHold * 1000);
}

export function showPause(settings) {
  only('pause');
  void settings;
  syncToggles();
  focusFirst(els.pause, '[data-act="resume"]');
}

export function showToast(text, ms = 2600) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.hidden = false;
  els.toast.classList.remove('is-in');
  void els.toast.offsetWidth;
  els.toast.classList.add('is-in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
}

export function showGameOver(summary, { player, portraitUrl, dailyLabel } = {}) {
  only('over');
  void portraitUrl;
  const o = els.over;
  const token = overToken;
  const medal = summary.medal || 'none';
  const date = dailyLabel || '';
  o.querySelector('.over__kicker').textContent = fill(summary.mode === 'daily' ? TEXT.gameOver.kickerDaily : TEXT.gameOver.kickerFree, { date }).toUpperCase();
  o.querySelector('.over__headline').textContent = TEXT.gameOver.headlines[summary.reachedPhase] || TEXT.gameOver.headlines.golden;
  o.querySelector('.over__score').textContent = '0';
  o.querySelector('.over__final').textContent = '';
  o.querySelector('.over__stamp').hidden = !summary.isBest;
  o.querySelector('.s-mangoes').textContent = num(summary.mangoes);
  o.querySelector('.s-combo').textContent = `×${summary.bestMultiplier}`;
  o.querySelector('.s-near').textContent = num(summary.nearMisses);
  o.querySelector('.s-time').textContent = mmss(summary.timeSurvived);
  o.querySelector('.over__medalart').innerHTML = medalSVG(medal);
  o.querySelector('.over__medalname').textContent = medal === 'none' ? TEXT.medals.none : fill(TEXT.gameOver.medalName, { medal: TEXT.medals[medal] }).toUpperCase();

  // the record near miss: within 10% of the best (and not a new best)
  const short = o.querySelector('.over__short');
  const gap = (summary.best || 0) - summary.score;
  const close = !summary.isBest && summary.best > 0 && gap > 0 && gap <= summary.best * 0.1;
  short.hidden = !close;
  if (close) short.textContent = fill(TEXT.gameOver.short, { n: num(gap) });
  // "Lost in the pot": ONLY what was lost at the end of the run, in plain words (no running total, no "win it back")
  const potLine = o.querySelector('.over__pot');
  potLine.hidden = !(summary.potLost > 0);
  if (summary.potLost > 0) potLine.textContent = fill(TEXT.gameOver.lostInPot, { pot: num(summary.potLost) });
  const sk = TEXT.gameOver.skills;
  const plural = (pair, n) => fill(pair[n === 1 ? 0 : 1], { n: num(n) });
  const parts = [];
  if (summary.swoops > 0) parts.push(plural(sk.swoop, summary.swoops));
  if (summary.bestChain >= 2) parts.push(fill(sk.chain, { n: summary.bestChain }));
  if (summary.perfectDodges > 0) parts.push(plural(sk.perfect, summary.perfectDodges));
  if (summary.slams > 0) parts.push(plural(sk.slam, summary.slams));
  const skillLine = o.querySelector('.over__skills');
  skillLine.hidden = parts.length === 0;
  skillLine.textContent = parts.join(' · ');
  o.querySelector('.over__notes').hidden = short.hidden && potLine.hidden && skillLine.hidden;

  const prog = o.querySelector('.over__progress');
  if (summary.nextMedal) {
    prog.hidden = false;
    prog.querySelector('i').style.width = `${Math.min(100, (summary.score / summary.nextMedal.threshold) * 100)}%`;
    prog.querySelector('.over__next').textContent = fill(TEXT.gameOver.nextMedal, { medal: TEXT.medals[summary.nextMedal.name] }).toUpperCase();
    prog.querySelector('.over__togo').textContent = fill(TEXT.gameOver.toGo, { score: num(Math.max(0, summary.nextMedal.threshold - summary.score)) }).toUpperCase();
  } else {
    prog.hidden = true;
  }

  const line = o.querySelector('.over__board');
  o.querySelector('.over__rival').hidden = true;
  if (player?.signedIn) line.textContent = TEXT.gameOver.saving;
  else line.innerHTML = `<button class="btn btn--small" type="button" data-act="signin">${$esc(TEXT.gameOver.signInBoard)}</button>`;

  o.hidden = true;
  setTimeout(() => {
    if (token !== overToken) return;
    o.hidden = false;
    o.classList.add('is-in');
    focusFirst(o, '[data-act="again"]');
    countUp(o, summary.score, token);
  }, OVER_DELAY);
}

function countUp(o, target, token) {
  const el = o.querySelector('.over__score');
  const t0 = performance.now();
  const reduced = state.settings.reducedMotion;
  const step = (now) => {
    if (token !== overToken) return;
    const u = reduced ? 1 : Math.min(1, (now - t0) / 800);
    const e = 1 - Math.pow(1 - u, 3);
    el.textContent = num(Math.round(target * e));
    if (u < 1) countTimer = requestAnimationFrame(step);
    else {
      o.querySelector('.over__final').textContent = `${num(target)}`;   // announced once, when it has landed
      o.classList.add('is-slam');                                        // the NEW BEST stamp slams on (a plain fade with reduced motion)
    }
  };
  countTimer = requestAnimationFrame(step);
}

export function showLeaderboard({ entries = [], myId, loading = false, error = false, me = null, guest = false } = {}) {
  lastBoard = { entries, myId, loading, error, me, guest };
  const b = els.board;
  if (b.hidden) lastFocus = document.activeElement;
  b.hidden = false;
  b.classList.toggle('is-loading', !!loading);
  b.querySelector('.board__loading').hidden = !loading;
  b.querySelector('.board__error').hidden = loading || !error;
  b.querySelector('.board__empty').hidden = loading || error || entries.length > 0 || !!me;
  const table = b.querySelector('.board__table');
  table.hidden = loading || error || (entries.length === 0 && !me);
  b.querySelector('.board__signin').hidden = !guest || loading;

  const rowHTML = (e, mine) => {
    const surv = e.stats?.survived ?? 0;
    const color = e.color || '#F2A93B';
    return `<tr class="${mine ? 'is-me' : ''}"><td class="rk">${$esc(e.rank ?? '—')}</td><td class="nm"><i class="dot" style="background:${$esc(color)}"></i><span>${$esc(e.name)}</span>${mine ? ` <small>(${$esc(TEXT.leaderboard.you)})</small>` : ''}</td><td class="r">${num(e.score)}</td><td class="r">${surv ? mmss(surv) : '—'}</td><td class="r">${e.stats?.mangoes != null ? num(e.stats.mangoes) : '—'}</td></tr>`;
  };
  const sorted = entries.slice().sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0));
  const top = sorted.slice(0, 10);
  const rows = top.map((e) => rowHTML(e, e.player_id === myId));
  const mine = sorted.find((e) => e.player_id === myId);
  if (mine && !top.includes(mine)) rows.push('<tr class="sep" aria-hidden="true"><td colspan="5">···</td></tr>', rowHTML(mine, true));
  else if (!mine && me?.rank && me.rank > top.length) {
    rows.push('<tr class="sep" aria-hidden="true"><td colspan="5">···</td></tr>', rowHTML({ rank: me.rank, name: state.player.name || TEXT.leaderboard.you, score: me.score, stats: me.stats }, true));
  }
  b.querySelector('tbody').innerHTML = rows.join('');
  focusFirst(b, error ? '[data-act="retry-board"]' : '[data-act="close-board"]');
}

function closeBoard() {
  els.board.hidden = true;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

export function hideScreens() {
  only(null);
  els.count.hidden = true;
  els.hint.hidden = true;
}

/** ?debug: the arguments of the last leaderboard shown (retry reuses the live fetch; the debug key reuses the sample). */
export function lastLeaderboardArgs() {
  return lastBoard;
}
