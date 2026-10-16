// Mango Rush — boot, run states and the game loop.   OWNER: Claude Code  ·  STATUS: skeleton (wiring only)
//
// Screens: loading -> start -> (warmup, first run only) -> play <-> paused -> over -> start | play
// Each frame: realDt -> dt = realDt * timeScale() (freeze / slow motion) -> update modules -> HUD -> render.
// realDt comes from core/frameclock.js: it paces rendering to an even 60 fps on fast screens with a weak GPU and smooths the step.

import { state } from './core/state.js';
import { EVENTS, on, emit } from './core/events.js';
import { CONFIG, phaseAt, tuneIsChanged } from './core/config.js';
import { createRng, dailySeed, dailyLabel, randomSeed } from './core/rng.js';
import { initStore, loadProgress, recordRun, loadSettings, saveSettings, setWarmupDone } from './core/store.js';
import { initInput, readInput, takeDash, queueDash, isTouch } from './core/input.js';
import { getPlayer as fetchStartngPlayer, styleKey, saveScore, getLeaderboard, signInUrl } from './startng.js';
import { initRenderer, setCameraMode, setFollowTarget, renderFrame, makePortrait, isPortraitScreen, getRenderer, getScene, warmUp, getCameraDebug, getGpuInfo, getQualityInfo, reportFrame } from './world/renderer.js';
import { createFrameClock } from './core/frameclock.js';
import { buildBarge, updateBarge, deckRoot, setOrientation } from './world/barge.js';
import { buildJourney, resetJourney, updateJourney } from './world/journey.js';
import { initPlayer, setCharacter, resetPlayer, updatePlayer, idlePlayer, getPlayer, setOverPose } from './play/player.js';
import { initDrops, resetDrops, updateDrops, clearDrops, getDropLog, forceDrop } from './play/drops.js';
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
let clock = null;       // frame pacing and a steady dt (core/frameclock.js)
let runTuned = false;   // some tuning value differed from its default at any moment of this run: never ranked
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
  // a known weak GPU (Intel) on a fast screen is capped to an even 60 fps from the start; others only if frames miss the refresh budget
  clock = createFrameClock({ forceCap: getGpuInfo().intel });
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
  initPlayer(deckRoot());
  initDrops(deckRoot());

  await loadPlayer();
  warmUp();   // compile every shader now, behind the loading screen
  requestAnimationFrame(frame);
  toMenu();
}

async function loadPlayer() {
  // the name tag is drawn with Archivo 800: wait (briefly) for the font before building the character
  try { await Promise.race([document.fonts.load('800 52px Archivo'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* the tag redraws itself later */ }
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
// the deck is turned for phones held upright; it is chosen between runs only (barge.js ignores it mid-run)
function fitDeckToScreen() {
  setOrientation(isPortraitScreen() ? 'portrait' : 'landscape');
}

function toMenu() {
  clearDrops();
  setScreen('start');
  fitDeckToScreen();
  showHud(false);
  showTouchControls(false);
  setCameraMode('menu');
  showStart({ player: state.player, best: state.best, dailyBest: state.dailyBest, dailyLabel: dailyLabel(), settings: state.settings, isTouch: isTouch() });
}

async function startRun(mode) {
  // never let audio hold the run back: a browser may leave resume() pending until a real gesture
  await Promise.race([unlockAudio(), new Promise((r) => setTimeout(r, 300))]);
  state.mode = mode;
  runTuned = tuneIsChanged();
  const seed = mode === 'daily' ? dailySeed() : randomSeed();
  const rng = createRng(seed);
  state.time = 0;
  state.phase = 'golden';
  resetScoring();
  resetPlayer();
  resetDrops(rng);
  resetHappenings(createRng(seed ^ 0x9e3779b9));
  resetJourney();
  fitDeckToScreen();
  hideScreens();
  // Space must always dash during a run: a button that kept the focus (Play, Play again) must not swallow it
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
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
  if (botModule?.isSimulating()) return;   // the ?debug simulator plays whole runs headlessly
  const saved = recordRun({ mode: summary.mode, score: summary.score, mangoes: summary.mangoes });
  summary.isBest = saved.isBest;
  summary.best = saved.best;
  state.best = saved.best;
  state.dailyBest = saved.dailyBest;
  lastSummary = summary;
  setScreen('over');
  showHud(false);   // the game over card sits on the dimmed scene, without the HUD
  setOverPose(summary.isBest);
  setCameraMode('over');
  showTouchControls(false);
  showGameOver(summary, { player: state.player, portraitUrl, dailyLabel: dailyLabel() });
  lastRank = null;
  if (state.player.signedIn) {
    if (runTuned) {
      // a run played with tuned values is never saved to the leaderboard (also on the beta)
      emit(EVENTS.LEADERBOARD_SAVED, { ok: false, error: 'tuned' });
    } else saveScore({ score: summary.score, survived: Math.floor(summary.timeSurvived), mangoes: summary.mangoes }).then((saved) => {
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
addEventListener('resize', () => { if (state.screen === 'start' || state.screen === 'over') fitDeckToScreen(); });

// ---------------------------------------------------------------- loop
// Every requestAnimationFrame callback asks the clock whether to render: on a fast screen with a weak GPU it skips alternate
// callbacks so the pictures arrive at an even 60 fps, and it hands over a steady dt (a short moving average of real steps).
let loopFrozen = false;   // ?debug: lets a test drive the modules by hand without the loop interfering
function frame(ts) {
  requestAnimationFrame(frame);
  if (loopFrozen) return;
  const tick = clock.tick(ts);
  if (!tick.render) return;
  const realDt = tick.dt;
  const dt = realDt * timeScale();

  if (state.screen === 'play') {
    state.time += dt;
    const phase = phaseAt(state.time);
    if (phase !== state.phase) { state.phase = phase; emit(EVENTS.PHASE_CHANGE, { phase }); }
    if (tuneIsChanged()) runTuned = true;
    const input = readInput();
    input.dash = takeDash();
    if (botDriving && botModule) Object.assign(input, botModule.think());
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
  reportFrame(tick.intervalMs, ts);   // the quality manager (pixel ratio, particles)
}

// ?debug: render a busy play scene (14 live drops) N times and time each frame INCLUDING the wait for the GPU (a 1-pixel readback
// forces it to finish). Run it while a run is on. Returns ms per frame (avg / p95 / worst) and the draw calls.
function benchBusyScene(pr = 1.5, frames = 90) {
  const rr = getRenderer();
  const gl = rr.getContext();
  const px = new Uint8Array(4);
  for (let i = 0; i < 14; i++) forceDrop(i % 3 === 0 ? 'coconut' : (i % 5 === 0 ? 'golden' : 'mango'), (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, 30);
  setFollowTarget(getPlayer().object);
  rr.setPixelRatio(pr);
  rr.setSize(innerWidth, innerHeight, false);
  for (let i = 0; i < 25; i++) renderFrame(0.016);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ts = [];
  let cpu = 0;
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    renderFrame(0.016);
    cpu += performance.now() - t0;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  const f = (v) => +v.toFixed(2);
  return { pixelRatio: pr, buffer: [rr.domElement.width, rr.domElement.height], avgMs: f(ts.reduce((s, x) => s + x, 0) / ts.length), p95Ms: f(ts[Math.floor(ts.length * 0.95)]), worstMs: f(ts[ts.length - 1]), cpuMs: f(cpu / frames), drawCalls: rr.info.render.calls };
}

// numbers for the ?debug panel
function getPerf() {
  const s = clock.stats();
  const q = getQualityInfo();
  return { fps: s.fps, avgMs: s.avgMs, worstMs: s.worstMs, refreshHz: s.refreshHz, capFps: s.capFps, capped: s.capped, antialias: q.antialias, pixelRatio: q.pixelRatio, level: q.level, levels: q.levels, gpu: getGpuInfo().renderer };
}

// ---------------------------------------------------------------- debug (only with ?debug in the URL)
let botModule = null;
let botDriving = false;
if (location.search.includes('debug')) {
  import('./play/bot.js').then((m) => { botModule = m; });
  import('./ui/tune.js').then((m) => m.initTune({ getPerf }));   // the tuning panel: debug only, never downloaded by players
  window.__mango = {
    state,
    renderer: getRenderer,
    scene: getScene,
    camera: getCameraDebug,
    perf: getPerf,
    bench: benchBusyScene,
    freeze: (on = true) => { loopFrozen = !!on; return loopFrozen; },
    lineup: async (spec) => { loopFrozen = true; const m = await import('./ui/lineup.js'); return m.lineup(spec); },
    end() { if (state.screen === 'play') endRun('debug'); },
    dropLog: getDropLog,
    bot: {
      autoplay: (on = true) => { botDriving = !!on; return botDriving; },
      simulate: (opts) => botModule.simulate(opts),
    },
  };
  window.__mangoTest = { scoring: () => { const r = scoringSelfTest(); console[r.ok ? 'log' : 'error']('[scoring self-check]', r); return r; } };
}

boot().catch((err) => {
  console.error('[mango-rush] boot failed', err);
});
