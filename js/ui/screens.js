// Mango Rush — full-screen UI: loading, start, warm-up hints, countdown, pause, game over.
//                                                    OWNER: Claude Code  ·  STATUS: step 1 (plain but complete; step 8 matches the mockups)
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
//   showGameOver(summary, { player, portraitUrl, dailyLabel }) -> void   (dailyLabel added in step 1, for the kicker)
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

import { state } from '../core/state.js';
import { EVENTS, on } from '../core/events.js';
import TEXT, { fill, pickLine } from '../content/text.js';
import { wordmarkSVG } from './wordmark.js';

// STEP 1 SCOPE: every screen works and is on-brand, but it is the plain version. Step 8 matches the mockups
// (poster frame, medal badge art, dot-ring backgrounds, share card). The Share button is in the DOM but hidden
// until the share card exists.

let els = {};
let actions = {};
let current = null;
let overToken = 0;      // cancels a game-over card that was queued but is no longer wanted
let countTimer = 0;
let lastFocus = null;

const $esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('en-US');
const dash = (n) => (n > 0 ? num(n) : '—');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const label = (v) => (v === 'tophat' ? 'Top hat' : cap(String(v)));

const ICON_MUSIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="16.5" cy="16" r="2.6" fill="currentColor"/></svg>';
const ICON_SFX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export function initScreens(root, a) {
  actions = a;
  root.innerHTML = `
    <section class="screen screen--loading" data-screen="loading" aria-live="polite">
      <div class="loading__inner">
        <div class="wordmark">${wordmarkSVG()}</div>
        <div class="spinner" aria-hidden="true"></div>
        <p class="loading__msg"></p>
        <p class="loading__tip"></p>
      </div>
    </section>

    <section class="screen screen--start" data-screen="start" aria-label="${$esc(TEXT.title)}">
      <div class="panel">
        <div class="brand">
          <p class="kicker">${$esc(TEXT.kicker)}</p>
          <h1 class="wordmark" aria-label="${$esc(TEXT.title)}">${wordmarkSVG()}</h1>
        </div>
        <p class="tagline">${$esc(TEXT.tagline)}</p>
        <div class="who">
          <p class="who__name"></p>
          <p class="who__account"></p>
          <p class="who__badge"></p>
          <button class="btn btn--ghost who__signin" type="button" data-act="signin" hidden>${$esc(TEXT.start.signIn)}</button>
        </div>
        <div class="wearing">
          <span class="label">${$esc(TEXT.start.wearing)}</span>
          <ul class="chips"></ul>
        </div>
        <div class="actions">
          <button class="btn btn--primary" type="button" data-act="play">${$esc(TEXT.start.play)}</button>
          <button class="btn btn--secondary" type="button" data-act="daily">
            <span>${$esc(TEXT.start.daily)}</span><small class="daily__sub"></small>
          </button>
        </div>
        <div class="bests">
          <div><span class="label">${$esc(TEXT.start.best)}</span><b class="bests__best">—</b></div>
          <div><span class="label">${$esc(TEXT.start.dailyBest)}</span><b class="bests__daily">—</b></div>
          <button class="btn btn--text" type="button" data-act="leaderboard">${$esc(TEXT.start.leaderboard)}</button>
        </div>
        <div class="toggles">
          <button class="icon-btn" type="button" data-toggle="music" aria-pressed="true">${ICON_MUSIC}</button>
          <button class="icon-btn" type="button" data-toggle="sfx" aria-pressed="true">${ICON_SFX}</button>
          <p class="controls-hint"></p>
        </div>
      </div>
    </section>

    <section class="screen screen--pause" data-screen="pause" role="dialog" aria-modal="true" aria-label="${$esc(TEXT.pause.title)}">
      <div class="card">
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

    <section class="screen screen--over" data-screen="over" role="dialog" aria-modal="true" aria-label="Game over">
      <div class="card card--poster">
        <div class="over__left">
          <p class="kicker over__kicker"></p>
          <h2 class="over__headline"></h2>
          <p class="over__score" aria-live="polite">0</p>
          <p class="over__stamp" hidden>${$esc(TEXT.gameOver.newBest)}</p>
          <p class="over__best"></p>
          <p class="over__board"></p>
        </div>
        <div class="over__right">
          <p class="over__medal"></p>
          <dl class="stats">
            <div><dt>${$esc(TEXT.gameOver.stats.mangoes)}</dt><dd class="s-mangoes">0</dd></div>
            <div><dt>${$esc(TEXT.gameOver.stats.bestCombo)}</dt><dd class="s-combo">x1</dd></div>
            <div><dt>${$esc(TEXT.gameOver.stats.nearMisses)}</dt><dd class="s-near">0</dd></div>
            <div><dt>${$esc(TEXT.gameOver.stats.survived)}</dt><dd class="s-time">0:00</dd></div>
          </dl>
          <div class="over__progress" hidden><div class="over__bar"><i></i></div><small></small></div>
          <div class="actions">
            <button class="btn btn--primary" type="button" data-act="again">${$esc(TEXT.gameOver.playAgain)}</button>
            <button class="btn btn--secondary" type="button" data-act="share" hidden>${$esc(TEXT.gameOver.share)}</button>
            <button class="btn btn--secondary" type="button" data-act="menu">${$esc(TEXT.gameOver.menu)}</button>
            <button class="btn btn--text" type="button" data-act="leaderboard">${$esc(TEXT.leaderboard.title)}</button>
          </div>
        </div>
      </div>
    </section>

    <section class="screen screen--board" data-screen="board" role="dialog" aria-modal="true" aria-label="${$esc(TEXT.leaderboard.title)}">
      <div class="card">
        <h2>${$esc(TEXT.leaderboard.title)}</h2>
        <div class="spinner" aria-hidden="true"></div>
        <p class="board__empty">${$esc(TEXT.leaderboard.empty)}</p>
        <table class="board__table">
          <thead><tr><th>#</th><th></th><th>${$esc(TEXT.leaderboard.score)}</th><th>${$esc(TEXT.leaderboard.survived)}</th><th>${$esc(TEXT.leaderboard.mangoes)}</th></tr></thead>
          <tbody></tbody>
        </table>
        <button class="btn btn--primary" type="button" data-act="close-board">${$esc(TEXT.leaderboard.close)}</button>
      </div>
    </section>

    <div class="hint" hidden></div>
    <div class="countdown" aria-live="assertive" hidden></div>`;

  const q = (s) => root.querySelector(s);
  els = {
    root,
    loading: q('[data-screen="loading"]'), start: q('[data-screen="start"]'), pause: q('[data-screen="pause"]'),
    over: q('[data-screen="over"]'), board: q('[data-screen="board"]'),
    hint: q('.hint'), count: q('.countdown'),
  };
  for (const k of ['loading', 'start', 'pause', 'over', 'board']) els[k].hidden = true;

  const map = {
    play: 'onPlay', daily: 'onDaily', resume: 'onResume', restart: 'onRestart', quit: 'onQuit',
    again: 'onPlayAgain', share: 'onShare', menu: 'onMenu', signin: 'onSignIn', leaderboard: 'onLeaderboard',
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

  on(EVENTS.LEADERBOARD_SAVED, (r) => {
    const line = els.over.querySelector('.over__board');
    if (!state.player.signedIn) return;
    if (r.ok) {
      line.textContent = fill(TEXT.gameOver.rank, { rank: r.rank }) + (r.improved ? ` · ${TEXT.gameOver.boardBest}` : '');
    } else {
      line.textContent = r.error === 'tuned' ? TEXT.gameOver.notRanked : TEXT.gameOver.saveFailed;
    }
  });
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
  els.board.hidden = true;
}

function focusFirst(el, sel) {
  const target = el.querySelector(sel);
  if (target) target.focus({ preventScroll: true });
}

export function showLoading({ message }) {
  only('loading');
  els.loading.querySelector('.loading__msg').textContent = message || '';
  els.loading.querySelector('.loading__tip').textContent = pickLine(TEXT.loading.tips);
}

export function showStart({ player, best, dailyBest, dailyLabel, settings, isTouch }) {
  only('start');
  const s = els.start;
  s.querySelector('.who__name').textContent = player.signedIn
    ? fill(TEXT.start.greetSignedIn, { name: player.name })
    : `${TEXT.start.greetGuest} ${TEXT.start.guestHint}`;
  s.querySelector('.who__account').textContent = player.account ? `@${player.account}` : '';
  s.querySelector('.who__badge').textContent = player.signedIn ? `${TEXT.start.synced} · ${TEXT.start.changeLook}` : '';
  s.querySelector('.who__signin').hidden = !!player.signedIn;

  const st = player.style || {};
  const dot = (c) => `<i class="dot" style="background:${$esc(c)}"></i>`;
  const chips = [];
  if (st.hair) chips.push(`${dot(st.hairColor)}${$esc(label(st.hair))} hair`);
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
  els.hint.textContent = hint === 'move' && isTouch ? TEXT.warmup.moveTouch : TEXT.warmup[hint];
  els.hint.hidden = false;
}

export function showCountdown(n) {
  els.count.textContent = TEXT.countdown[3 - n];
  els.count.hidden = false;
  els.count.classList.remove('pop');
  void els.count.offsetWidth;
  els.count.classList.add('pop');
  if (n === 0) setTimeout(() => { els.count.hidden = true; }, 600);
}

export function showPause(settings) {
  only('pause');
  void settings;
  syncToggles();
  focusFirst(els.pause, '[data-act="resume"]');
}

export function showGameOver(summary, { player, portraitUrl, dailyLabel } = {}) {
  only('over');
  void portraitUrl;
  const o = els.over;
  const token = overToken;
  o.querySelector('.over__kicker').textContent = summary.mode === 'daily' ? `Daily run · ${dailyLabel || ''}` : 'Free play';
  o.querySelector('.over__headline').textContent = pickLine(TEXT.gameOver.headlines[summary.reachedPhase] || TEXT.gameOver.headlines.golden);
  o.querySelector('.over__score').textContent = '0';
  o.querySelector('.over__stamp').hidden = !summary.isBest;
  o.querySelector('.s-mangoes').textContent = num(summary.mangoes);
  o.querySelector('.s-combo').textContent = `x${summary.bestMultiplier}`;
  o.querySelector('.s-near').textContent = num(summary.nearMisses);
  o.querySelector('.s-time').textContent = mmss(summary.timeSurvived);
  // Best is a line under the score, or the NEW BEST stamp when this run is the new best
  const bestLine = o.querySelector('.over__best');
  bestLine.textContent = `${TEXT.start.best} ${num(Math.max(summary.best || 0, summary.score))}`;
  bestLine.hidden = !!summary.isBest || !(summary.best > 0);
  o.querySelector('.over__medal').textContent = summary.medal === 'none' ? '' : `${TEXT.medals[summary.medal]} medal`;

  const prog = o.querySelector('.over__progress');
  if (summary.nextMedal) {
    prog.hidden = false;
    prog.querySelector('i').style.width = `${Math.min(100, (summary.score / summary.nextMedal.threshold) * 100)}%`;
    prog.querySelector('small').textContent =
      `${fill(TEXT.gameOver.nextMedal, { medal: TEXT.medals[summary.nextMedal.name] })} · ${fill(TEXT.gameOver.toGo, { score: num(summary.nextMedal.threshold - summary.score) })}`;
  } else {
    prog.hidden = true;
  }

  const line = o.querySelector('.over__board');
  if (player?.signedIn) line.textContent = TEXT.gameOver.saving;
  else line.innerHTML = `<button class="btn btn--text" type="button" data-act="signin">${$esc(TEXT.gameOver.guestBoard)}</button>`;

  o.hidden = true;
  setTimeout(() => {
    if (token !== overToken) return;
    o.hidden = false;
    o.classList.add('is-in');
    focusFirst(o, '[data-act="again"]');
    countUp(o.querySelector('.over__score'), summary.score, token);
  }, 650);
}

function countUp(el, target, token) {
  const t0 = performance.now();
  const reduced = state.settings.reducedMotion;
  const step = (now) => {
    if (token !== overToken) return;
    const u = reduced ? 1 : Math.min(1, (now - t0) / 800);
    const e = 1 - Math.pow(1 - u, 3);
    el.textContent = num(Math.round(target * e));
    if (u < 1) countTimer = requestAnimationFrame(step);
  };
  countTimer = requestAnimationFrame(step);
}

export function showLeaderboard({ entries = [], myId, loading } = {}) {
  const b = els.board;
  lastFocus = document.activeElement;
  b.hidden = false;
  b.classList.toggle('is-loading', !!loading);
  b.querySelector('.board__empty').hidden = !!loading || entries.length > 0;
  b.querySelector('.board__table').hidden = !!loading || entries.length === 0;
  b.querySelector('.spinner').hidden = !loading;
  const rows = entries.slice(0, 10).map((e) => {
    const me = e.player_id === myId;
    const surv = e.stats?.survived ?? 0;
    return `<tr class="${me ? 'is-me' : ''}"><td>${$esc(e.rank)}</td><td>${$esc(e.name)}${me ? ` <small>(${$esc(TEXT.leaderboard.you)})</small>` : ''}</td><td>${num(e.score)}</td><td>${mmss(surv)}</td><td>${num(e.stats?.mangoes)}</td></tr>`;
  });
  b.querySelector('tbody').innerHTML = rows.join('');
  focusFirst(b, '[data-act="close-board"]');
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
