// Mango Rush — boot, run states and the game loop.   OWNER: Claude Code  ·  STATUS: skeleton (wiring only)
//
// Screens: loading -> start -> (warmup, first run only) -> play <-> paused -> over -> start | play
// Each frame: realDt -> dt = realDt * timeScale() (freeze / slow motion) -> update modules -> HUD -> render.

import { state } from './core/state.js';
import { EVENTS, on, emit } from './core/events.js';
import { CONFIG, phaseAt } from './core/config.js';
import { createRng, dailySeed, dailyLabel, randomSeed } from './core/rng.js';
import { initStore, loadProgress, recordRun, loadSettings, saveSettings, setWarmupDone } from './core/store.js';
import { initInput, readInput, takeDash, queueDash, isTouch } from './core/input.js';
import { getPlayer as fetchStartngPlayer, styleKey, saveScore, getLeaderboard, signInUrl } from './startng.js';
import { initRenderer, setCameraMode, setFollowTarget, renderFrame, makePortrait } from './world/renderer.js';
import { buildBarge, updateBarge } from './world/barge.js';
import { buildJourney, resetJourney, updateJourney } from './world/journey.js';
import { initPlayer, setCharacter, resetPlayer, updatePlayer, idlePlayer, getPlayer } from './play/player.js';
import { initDrops, resetDrops, updateDrops, clearDrops, getDropLog } from './play/drops.js';
import { resetHappenings, updateHappenings } from './play/happenings.js';
import { resetScoring, updateScoring, endRun, scoringSelfTest } from './play/scoring.js';
import { initJuice, timeScale, updateJuice, setPlayerObject } from './fx/juice.js';
import { initAudio, unlockAudio, setMusicEnabled, setSfxEnabled, updateAudio } from './audio/audio.js';
import { initHud, showHud, showTouchControls, updateHud, setPortrait, setJoystick } from './ui/hud.js';
import { initScreens, showLoading, showStart, showWarmupHint, showCountdown, showPause, showGameOver, showLeaderboard, hideScreens } from './ui/screens.js';
import { createShareCard, shareScore } from './ui/sharecard.js';
import TEXT from './content/text.js';

const $ = (id) => document.getElementById(id);
let portraitUrl = '';
let lastSummary = null;
let playerKey = '';

// push the saved settings into the systems that act on them
function syncSettings() {
  setMusicEnabled(state.settings.music);
  setSfxEnabled(state.settings.sfx);
  document.body.classList.toggle('is-reduced-motion', !!state.settings.reducedMotion);
}

function setScreen(screen) {
  state.screen = screen;
  emit(EVENTS.SCREEN, { screen });
}

// ---------------------------------------------------------------- boot
async function boot() {
  const { scene, camera } = initRenderer($('scene'));
  initJuice({ scene, camera, popupRoot: $('popups-root') });
  initAudio({ musicUrl: './assets/music/loop.mp3' });
  initInput($('scene'), { onPause: togglePause, canPlay: () => state.screen === 'play', onJoystick: setJoystick });
  initHud($('hud-root'), { onPause: togglePause, onDash: queueDash });
  initScreens($('screens-root'), {
    onPlay: () => startRun('free'),
    onDaily: () => startRun('daily'),
    onResume: resume,
    onRestart: () => startRun(state.mode),
    onQuit: toMenu,
    onPlayAgain: () => startRun(state.mode),
    onMenu: toMenu,
    onShare: share,
    onSettings: applySettings,
    onSignIn: () => { location.href = signInUrl(); },
    onLeaderboard: openLeaderboard,
  });
  setScreen('loading');
  showLoading({ message: TEXT.loading.syncing });

  buildJourney(scene);
  buildBarge(scene);
  initPlayer(scene);
  initDrops(scene);

  await loadPlayer();
  requestAnimationFrame(frame);
  toMenu();
}

async function loadPlayer() {
  const info = await fetchStartngPlayer();
  playerKey = styleKey(info);
  state.player = info;
  initStore(info.id);
  const progress = loadProgress();
  state.best = progress.best;
  state.dailyBest = progress.dailyBest;
  state.settings = loadSettings();
  syncSettings();
  setCharacter(info);
  setPlayerObject(getPlayer().object);
  portraitUrl = info.face || makePortrait(getPlayer().object);
  setPortrait(portraitUrl);
  emit(EVENTS.PLAYER_READY, info);
}

// Re-read the central start.ng style when the player comes back to the tab (outside a run).
async function refreshPlayer() {
  if (state.screen === 'play' || state.screen === 'warmup' || state.screen === 'paused') return;
  const { getPlayer: fetchAgain } = await import('./startng.js');
  const info = await fetchAgain();
  if (styleKey(info) === playerKey) return;
  playerKey = styleKey(info);
  state.player = info;
  setCharacter(info);
  setPlayerObject(getPlayer().object);
  portraitUrl = info.face || makePortrait(getPlayer().object);
  setPortrait(portraitUrl);
  emit(EVENTS.STYLE_CHANGE, info);
  if (state.screen === 'start') toMenu();
}

// ---------------------------------------------------------------- flow
function toMenu() {
  clearDrops();
  setScreen('start');
  showHud(false);
  showTouchControls(false);
  setCameraMode('menu');
  showStart({ player: state.player, best: state.best, dailyBest: state.dailyBest, dailyLabel: dailyLabel(), settings: state.settings, isTouch: isTouch() });
}

async function startRun(mode) {
  await unlockAudio();
  state.mode = mode;
  const seed = mode === 'daily' ? dailySeed() : randomSeed();
  const rng = createRng(seed);
  state.time = 0;
  state.phase = 'golden';
  resetScoring();
  resetPlayer();
  resetDrops(rng);
  resetHappenings(createRng(seed ^ 0x9e3779b9));
  resetJourney();
  hideScreens();
  showHud(true);
  showTouchControls(isTouch());
  setCameraMode('play');
  setFollowTarget(getPlayer().object);
  lastSummary = null;
  setScreen('play'); // TODO(Claude Code): first-run warm-up + countdown before 'play'
  emit(EVENTS.RUN_START, { mode, seed });
}

function togglePause() {
  if (state.screen === 'play') pause();
  else if (state.screen === 'paused') resume();
}
function pause() {
  setScreen('paused');
  showPause(state.settings);
  emit(EVENTS.PAUSE, {});
}
function resume() {
  hideScreens();
  setScreen('play');
  emit(EVENTS.RESUME, {});
}

on(EVENTS.RUN_END, (summary) => {
  const saved = recordRun({ mode: summary.mode, score: summary.score, mangoes: summary.mangoes });
  summary.isBest = saved.isBest;
  summary.best = saved.best;
  state.best = saved.best;
  state.dailyBest = saved.dailyBest;
  lastSummary = summary;
  setScreen('over');
  setCameraMode('over');
  showTouchControls(false);
  showGameOver(summary, { player: state.player, portraitUrl, dailyLabel: dailyLabel() });
  lastRank = null;
  if (state.player.signedIn) {
    saveScore({ score: summary.score, survived: Math.floor(summary.timeSurvived), mangoes: summary.mangoes }).then((saved) => {
      const r = saved?.ok && saved.result ? saved.result : null;
      lastRank = r?.rank ?? null;
      emit(EVENTS.LEADERBOARD_SAVED, r ? { ok: true, rank: r.rank, best: r.best, improved: r.improved }
        : { ok: false, error: saved?.error || 'unreachable' });
    });
  }
});

let lastRank = null;
async function openLeaderboard() {
  showLeaderboard({ entries: [], myId: state.player.id, loading: true });
  const data = await getLeaderboard(10);
  const entries = data?.ok ? data.entries || [] : [];
  emit(EVENTS.LEADERBOARD_DATA, { ok: !!data?.ok, entries, myId: state.player.id });
  showLeaderboard({ entries, myId: state.player.id, loading: false });
}

function applySettings(settings) {
  state.settings = { ...state.settings, ...settings };
  saveSettings(state.settings);
  syncSettings();
  emit(EVENTS.SETTINGS_CHANGE, state.settings);
}

async function share() {
  if (!lastSummary) return;
  const blob = await createShareCard({ summary: lastSummary, player: state.player, portraitUrl, dailyLabel: dailyLabel(), rank: lastRank });
  await shareScore({ summary: lastSummary, blob, url: 'https://mango-rush.start.ng' });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'play') pause();
  if (!document.hidden) refreshPlayer();
});
addEventListener('blur', () => { if (state.screen === 'play') pause(); });

// ---------------------------------------------------------------- loop
let lastTs = performance.now();
function frame(ts) {
  const realDt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  const dt = realDt * timeScale();

  if (state.screen === 'play') {
    state.time += dt;
    const phase = phaseAt(state.time);
    if (phase !== state.phase) { state.phase = phase; emit(EVENTS.PHASE_CHANGE, { phase }); }
    const input = readInput();
    input.dash = takeDash();
    updatePlayer(dt, input);
    updateHappenings(dt);
    updateDrops(dt);
    updateScoring(dt);
    updateHud();
  } else if (state.screen !== 'paused') { idlePlayer(realDt, state.screen);
  }
  updateJourney(state.screen === 'play' ? dt : realDt * 0.3);
  updateBarge(dt);
  updateJuice(realDt);
  updateAudio(realDt);
  renderFrame(realDt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- debug (only with ?debug in the URL)
if (location.search.includes('debug')) {
  window.__mango = {
    state,
    end() { if (state.screen === 'play') endRun('debug'); },
    dropLog: getDropLog,
  };
  window.__mangoTest = { scoring: () => { const r = scoringSelfTest(); console[r.ok ? 'log' : 'error']('[scoring self-check]', r); return r; } };
}

boot().catch((err) => {
  console.error('[mango-rush] boot failed', err);
});
