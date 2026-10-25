// Mango Rush — boot, run states and the game loop.   OWNER: Claude Code  ·  STATUS: skeleton (wiring only)
//
// Screens: loading -> start -> (warmup, first run only) -> countdown -> play <-> paused -> dying -> over -> start | play
// (step 12) Every run begins with a 3-2-1-GO countdown; the run's rng, drops and clock start at GO. The very first run on a device begins with
// a short skippable warm-up (play/warmup.js) that uses forceDrop only and never counts as a run.
// 'dying' (step 9) is the game over transition: the final hit's freeze, 0.5 s at 20% speed while the character tumbles, a dot implosion (a 0.4 s fade
// with reduced motion), then the game over screen. The run is already over (scoring has ended it); only looks move.
// Each frame: realDt -> dt = realDt * timeScale() (freeze / slow motion) -> update modules -> HUD -> render.
// realDt comes from core/frameclock.js: it paces rendering to an even 60 fps on fast screens with a weak GPU and smooths the step.

import { state } from './core/state.js';
import { EVENTS, on, emit } from './core/events.js';
import { CONFIG, phaseAt, tuneIsChanged, markUnranked } from './core/config.js';
import { createRng, dailySeed, dailyLabel, randomSeed } from './core/rng.js';
import { initStore, loadProgress, recordRun, loadSettings, saveSettings, bankHintDone, setBankDone, bankHintShown, setBankHintShown } from './core/store.js';
import { initInput, readInput, takeDash, queueDash, isTouch } from './core/input.js';
import { getPlayer as fetchStartngPlayer, styleKey, saveScore, getLeaderboard, signInUrl } from './startng.js';
import { initRenderer, setCameraMode, setFollowTarget, renderFrame, makePortrait, isPortraitScreen, getRenderer, getScene, warmUp, getCameraDebug, getGpuInfo, getQualityInfo, reportFrame } from './world/renderer.js';
import { createFrameClock } from './core/frameclock.js';
import { buildBarge, updateBarge, deckRoot, deckBounds, setOrientation, juicePatches, wetBandFrac } from './world/barge.js';
import { buildJourney, resetJourney, updateJourney, getJourneyDebug } from './world/journey.js';
import { initPlayer, setCharacter, resetPlayer, updatePlayer, idlePlayer, getPlayer, setOverPose, startTumble, updateTumble, endTumble } from './play/player.js';
import { initDrops, resetDrops, updateDrops, clearDrops, getDropLog, getDropDebug, forceDrop, suspendSchedule } from './play/drops.js';
import { initBank, resetBank, updateBank, bankSpots, highlightNearestBank } from './play/bank.js';
import { startWarmup, updateWarmup, skipWarmup, warmupActive, cancelWarmup } from './play/warmup.js';
import { initPlank, updatePlank, getPlankDebug } from './play/plank.js';
import { initHappenings, resetHappenings, updateHappenings, getHappeningDebug, startNextHappening, sendBatNow } from './play/happenings.js';
import { resetScoring, updateScoring, endRun, scoringSelfTest, debugFillMadness, debugLastLife, debugBestAbove } from './play/scoring.js';
import { initJuice, timeScale, updateJuice, setPlayerObject, deathSeconds } from './fx/juice.js';
import { updateAdrenaline, resetAdrenaline } from './fx/adrenaline.js';
import { initAudio, unlockAudio, setMusicEnabled, setSfxEnabled, updateAudio, playConfirm, soundCheck, getAudioDebug } from './audio/audio.js';
import { initHud, showHud, showTouchControls, updateHud, setPortrait, setJoystick, showBanner } from './ui/hud.js';
import { initScreens, showLoading, showStart, showWarmupHint, showCountdown, showPause, showGameOver, showLeaderboard, hideScreens, showToast } from './ui/screens.js';
import { createShareCard, shareScore } from './ui/sharecard.js';
import TEXT, { fill } from './content/text.js';

const $ = (id) => document.getElementById(id);
let portraitUrl = '';
let renderedPortrait = '';   // a 384 px render of the character (neutral pose, taken at load): the share card uses it first
let sharing = false;
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
  initAudio({ musicUrl: `./${CONFIG.music.url}` });
  initInput($('scene'), { onPause: togglePause, canPlay: () => state.screen === 'play' || state.screen === 'warmup', onJoystick: setJoystick });
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
    onShareX: shareOnX,
    onSkipWarmup: skipWarmup,
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
  initBank(deckRoot());
  initPlank(deckRoot());
  initHappenings(deckRoot());

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
  renderedPortrait = makePortrait(getPlayer().object, 384);
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
  renderedPortrait = makePortrait(getPlayer().object, 384);
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
  cancelWarmup();
  clearDrops();
  resetJourney();   // the start screen is always golden hour (the journey's clock reads 0 there)
  setScreen('start');
  fitDeckToScreen();
  showHud(false);
  showTouchControls(false);
  setCameraMode('menu');
  showStart({ player: state.player, best: state.best, dailyBest: state.dailyBest, dailyLabel: dailyLabel(), settings: state.settings, isTouch: isTouch() });
}

// the run in preparation: the mode and seed, and where we are in the countdown (the seed is chosen now; the rng is created at GO)
let pre = { mode: 'free', seed: 1, t: 0, n: 4 };
let resumeTo = 'play';   // the screen a paused game goes back to (play, or the countdown / warm-up it was paused in)

async function startRun(mode) {
  // never let audio hold the run back: a browser may leave resume() pending until a real gesture
  await Promise.race([unlockAudio(), new Promise((r) => setTimeout(r, 300))]);
  cancelWarmup();
  state.mode = mode;
  runTuned = tuneIsChanged();
  pre = { mode, seed: mode === 'daily' ? dailySeed() : randomSeed(), t: 0, n: 4 };
  // the deck, the HUD and the camera are ready now; the drops, the happenings and the run clock start at GO
  state.time = 0;
  state.phase = 'golden';
  fitDeckToScreen();   // the deck's shape first: the bank spots and the golden plank are laid out on it
  document.body.classList.remove('is-fading');
  dyingSummary = null;
  endTumble();
  resetAdrenaline();
  resetScoring();
  resetPlayer();
  resetBank();
  suspendSchedule();   // no drops yet, and no rng drawn
  resetJourney();
  hideScreens();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  showHud(true);
  showTouchControls(isTouch());
  setCameraMode('play');
  setFollowTarget(getPlayer().object);
  lastSummary = null;
  const firstRun = !loadProgress().warmupDone || location.search.includes('warmup');   // ?warmup forces it again (for testing)
  if (firstRun) { setScreen('warmup'); startWarmup({ isTouch: isTouch(), onDone: beginCountdown }); }
  else beginCountdown();
}

function beginCountdown() {
  pre.t = 0;
  pre.n = 4;
  setScreen('countdown');
}

// 3, 2, 1, GO: CONFIG.countdown.step apart; the run starts at GO. (Paused time does not count: this advances only on the countdown screen.)
function updateCountdown(realDt) {
  pre.t += realDt;
  const n = Math.max(0, 3 - Math.floor(pre.t / CONFIG.countdown.step));
  if (n === pre.n) return;
  pre.n = n;
  emit(EVENTS.COUNTDOWN, { n });
  showCountdown(n);
  if (n === 0) goRun();
}

// GO: the run's own rng, drops, happenings and clock begin here
function goRun() {
  const { mode, seed } = pre;
  const rng = createRng(seed);
  state.time = 0;
  state.phase = 'golden';
  resetScoring();
  resetPlayer();
  resetBank();
  resetDrops(rng);   // (also chooses the golden plank's segments)
  hintShown = false;
  resetHappenings(createRng(seed ^ 0x9e3779b9), createRng(seed ^ CONFIG.adrenaline.madness.tableSeed));
  resetJourney();
  setScreen('play');
  emit(EVENTS.RUN_START, { mode, seed });
}

function togglePause() {
  const s = state.screen;
  if (s === 'warmup') skipWarmup();                         // Esc during the warm-up skips it
  else if (s === 'play' || s === 'countdown') pause();
  else if (s === 'paused') resume();
}
function pause() {
  resumeTo = state.screen;
  setScreen('paused');
  showPause(state.settings);
  emit(EVENTS.PAUSE, {});
}
function resume() {
  hideScreens();
  setScreen(resumeTo);
  emit(EVENTS.RESUME, {});
}

// the one-time teaching hint: the first time (on this device) a pot reaches CONFIG.bank.hintPot (1,000), ONCE, unless the player has already banked.
// The banner says "Walk into a glowing spot to bank it" and the nearest spot pulses.
let hintShown = false;
on(EVENTS.POT_CHANGE, (e) => {
  if (hintShown || state.screen !== 'play' || e.pot < CONFIG.bank.hintPot || bankHintDone() || bankHintShown() || botModule?.isSimulating()) return;
  hintShown = true;
  setBankHintShown();
  showBanner(TEXT.hud.bankHint, CONFIG.bank.hintMs);
  const pl = getPlayer();
  highlightNearestBank(pl.x, pl.z, CONFIG.bank.hintHighlight);
});
on(EVENTS.POT_BANKED, () => { if (!botModule?.isSimulating()) setBankDone(); });

// RUN_END only starts the transition; finishRun() (below) shows the game over screen when it is over
let dyingSummary = null;
let dyingLeft = 0;
on(EVENTS.RUN_END, (summary) => {
  if (botModule?.isSimulating()) return;   // the ?debug simulator plays whole runs headlessly
  dyingSummary = summary;
  dyingLeft = deathSeconds();
  setScreen('dying');
  showTouchControls(false);
  startTumble();
  if (state.settings.reducedMotion) document.body.classList.add('is-fading');   // reduced motion: a plain 0.4 s fade instead of slow motion and a tumble
});

function finishRun() {
  const summary = dyingSummary;
  dyingSummary = null;
  if (!summary) return;
  endTumble();
  document.body.classList.remove('is-fading');
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
    } else saveScore({ score: summary.score, survived: Math.floor(summary.timeSurvived), mangoes: summary.mangoes }).then(async (saved) => {
      const r = saved?.ok && saved.result ? saved.result : null;
      lastRank = r?.rank ?? null;
      emit(EVENTS.LEADERBOARD_SAVED, r ? { ok: true, rank: r.rank, best: r.best, improved: r.improved, rival: null }
        : { ok: false, error: saved?.error || 'unreachable' });
      if (r && r.rank > 1) {
        // the rival: the entry one place above (from the top 50; outside them the rank alone shows). #1 needs no rival.
        const rival = await findRival(r.rank);
        if (rival) emit(EVENTS.LEADERBOARD_SAVED, { ok: true, rank: r.rank, best: r.best, improved: r.improved, rival });
      }
    });
  }
}

let lastRank = null;

// the entry one rank above `rank`, from the top 50 ({ name, score }), or null (outside the 50, offline, no entry)
async function findRival(rank) {
  try {
    const data = await getLeaderboard(50);
    if (!data?.ok) return null;
    const above = (data.entries || []).filter((e) => e.rank < rank).sort((a, b) => b.rank - a.rank)[0];
    return above ? { name: above.name, score: above.score } : null;
  } catch { return null; }
}

async function openLeaderboard() {
  const me = state.player.id;
  const guest = !state.player.signedIn;
  showLeaderboard({ entries: [], myId: me, loading: true, guest });
  let data = null;
  try { data = await getLeaderboard(50); } catch { data = null; }   // up to 50, to find the player's own row
  const entries = data?.ok ? data.entries || [] : [];
  emit(EVENTS.LEADERBOARD_DATA, { ok: !!data?.ok, entries, myId: me });
  showLeaderboard({
    entries, myId: me, loading: false, error: !data?.ok, guest,
    me: lastRank ? { rank: lastRank, score: state.best } : null,   // not among the fetched? their rank from the last save
  });
}

function applySettings(settings) {
  state.settings = { ...state.settings, ...settings };
  saveSettings(state.settings);
  syncSettings();
  emit(EVENTS.SETTINGS_CHANGE, state.settings);
}

// SHARE ON X (a start.ng game standard): opens the X post composer in a new tab with the real score and what you reached, and the game's start.ng page.
// Only ever on a click of the Share on X button; this and the back link to start.ng are the only links out of the game.
function shareOnX() {
  const s = lastSummary;
  if (!s) return;
  const reached = TEXT.share.xReached[s.reachedPhase] || TEXT.share.xReached.golden;
  const text = fill(TEXT.share.xText, { score: s.score.toLocaleString('en-US'), reached });
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://start.ng/games/mango-rush')}`;   // the game's start.ng page: it shows the cover as the preview
  window.open(url, '_blank', 'noopener');
}

// SHARE CARD never fails silently: every outcome gets a short message
async function share() {
  if (!lastSummary || sharing) return;
  sharing = true;
  try {
    const blob = await createShareCard({ summary: lastSummary, player: state.player, portraitUrl: renderedPortrait, faceUrl: state.player.face, dailyLabel: dailyLabel(), rank: lastRank });
    const r = await shareScore({ summary: lastSummary, blob, url: 'https://start.ng/games/mango-rush', dailyLabel: dailyLabel() });
    const say = { shared: TEXT.share.shared, downloaded: TEXT.share.saved, saved: TEXT.share.savedOnly, copied: TEXT.share.copied, failed: TEXT.share.failed };
    if (r !== 'cancelled') showToast(say[r] || TEXT.share.failed);
    if (r === 'shared' || r === 'downloaded' || r === 'saved' || r === 'copied') playConfirm();   // a small confirm blip when it worked
  } catch (err) {
    console.warn('[mango-rush] share card failed', err);
    showToast(TEXT.share.failed);
  } finally {
    sharing = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state.screen === 'play' || state.screen === 'countdown')) pause();
  if (!document.hidden) refreshPlayer();
});
addEventListener('blur', () => { if (state.screen === 'play' || state.screen === 'countdown') pause(); });
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
    updatePlank(dt);
    updateBank(dt);
    updateScoring(dt);
    updateHud();
  } else if (state.screen === 'warmup' || state.screen === 'countdown') {
    // before the run: the character can move and dash in the warm-up (nothing counts); in the countdown it stands ready. No run clock, no schedule.
    const input = readInput();
    input.dash = takeDash();
    if (state.screen === 'countdown') { input.x = 0; input.z = 0; input.dash = false; }
    updatePlayer(dt, input);
    if (state.screen === 'warmup') { updateWarmup(dt); updateDrops(dt); }
    updateHud();
    if (state.screen === 'countdown') updateCountdown(realDt);
  } else if (state.screen === 'dying') {
    // the game over transition: the clock is the real one; the world moves at the juice time scale (frozen, then 20%)
    updateTumble(timeScale() > 0 ? realDt : 0);
    dyingLeft -= realDt;
    if (dyingLeft <= 0) finishRun();
  } else if (state.screen !== 'paused') { idlePlayer(realDt, state.screen);
  }
  updateJourney(state.screen === 'play' || state.screen === 'warmup' || state.screen === 'countdown' ? dt : realDt * 0.3);
  updateBarge(dt);
  updateJuice(realDt);
  updateAdrenaline(realDt);
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
  return { fps: s.fps, avgMs: s.avgMs, worstMs: s.worstMs, refreshHz: s.refreshHz, capFps: s.capFps, capped: s.capped, antialias: q.antialias, pixelRatio: q.pixelRatio, level: q.level, levels: q.levels, gpu: getGpuInfo().renderer, drops: getDropDebug(), plank: getPlankDebug(), banks: bankSpots(), pot: state.pot, stats: state.stats, journey: getJourneyDebug(), happenings: getHappeningDebug(), wet: wetBandFrac(), patches: juicePatches().filter((p) => p.life > 0).map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), life: +p.life.toFixed(1) })) };
}

// ---------------------------------------------------------------- debug (only with ?debug in the URL)
let botModule = null;
let botDriving = false;
if (location.search.includes('debug')) {
  import('./play/bot.js').then((m) => { botModule = m; });
  import('./ui/tune.js').then((m) => m.initTune({ getPerf, getSound: getAudioDebug }));   // the tuning panel: debug only, never downloaded by players
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
  // keys 1-5 drop a coconut of each kind (normal, slow, fast, drifter, late-lock) at a random spot: forceDrop uses no rng, so a Daily Run is untouched
  const KINDS = ['normal', 'slow', 'fast', 'drifter', 'late'];
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || state.screen !== 'play') return;
    const i = '12345'.indexOf(e.key);
    if (i < 0 || e.key.length !== 1) return;
    const b = deckBounds();
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.8;
    forceDrop('coconut', Math.cos(a) * r * b.halfWidth, Math.sin(a) * r * b.halfDepth, undefined, KINDS[i]);
  });
  // N jumps the run clock to the start of the next phase (dusk, night, midnight) so they can be seen without surviving that long. The run is
  // marked "TUNING · NOT RANKED", exactly like the tuning panel.
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'n' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || state.screen !== 'play') return;
    const next = CONFIG.phases.find((p) => p.t > state.time);
    if (!next) return;
    state.time = next.t + 0.01;
    markUnranked();
    runTuned = true;
    window.__tune?.refresh?.();
  });
  // H starts the next scripted happening now; B sends a fruit bat now. Both mark the run "TUNING · NOT RANKED" (like N and the tuning panel).
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((k !== 'h' && k !== 'b') || e.repeat || e.ctrlKey || e.metaKey || e.altKey || state.screen !== 'play') return;
    const ok = k === 'h' ? startNextHappening() : sendBatNow();
    if (!ok) return;
    markUnranked();
    runTuned = true;
    window.__tune?.refresh?.();
  });
  // M fills the Mango Madness meter, L leaves one life (Heartbeat), K puts the best just above the score (the NEW BEST moment comes with the next bank).
  // All three mark the run "TUNING · NOT RANKED", like N, H and B.
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((k !== 'm' && k !== 'l' && k !== 'k') || e.repeat || e.ctrlKey || e.metaKey || e.altKey || state.screen !== 'play') return;
    const ok = k === 'm' ? debugFillMadness() : k === 'l' ? debugLastLife() : debugBestAbove();
    if (!ok) return;
    markUnranked();
    runTuned = true;
    window.__tune?.refresh?.();
  });
  // Y plays every new sound in turn (a sound check; press Play once first so the audio is unlocked). It marks the run "TUNING · NOT RANKED".
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'y' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    soundCheck();
    if (state.screen === 'play') { markUnranked(); runTuned = true; window.__tune?.refresh?.(); }
  });
  window.__mango.audio = getAudioDebug;
  // G opens the game over screen with sample data (each press: new best on/off, guest on/off); J opens the leaderboard with sample entries
  // (each press: you in the top 10, you outside it, loading, error, guest). Debug only; neither starts or changes a run.
  let gStep = 0;
  let jStep = 0;
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((k !== 'g' && k !== 'j') || e.repeat || e.ctrlKey || e.metaKey || e.altKey || state.screen === 'play' || state.screen === 'dying') return;
    if (k === 'g') {
      const isBest = gStep % 2 === 0;
      const signedIn = gStep % 4 < 2;
      gStep++;
      const sample = {
        mode: 'daily', score: 34240, timeSurvived: 192, reachedPhase: 'night', mangoes: 64, golden: 3, nearMisses: 7, perfectDodges: 2, bestMultiplier: 5,
        medal: 'gold', nextMedal: { name: 'diamond', threshold: 60000 }, isBest, best: isBest ? 34240 : 36100, potLost: 2400, banks: 6, slams: 3, bestBank: 4200,
        swoops: 12, bestChain: 4, potLostTotal: 2400,
      };
      lastSummary = sample;
      setScreen('over');
      showHud(false);
      setOverPose(isBest);
      setCameraMode('over');
      showTouchControls(false);
      showGameOver(sample, { player: { ...state.player, signedIn }, portraitUrl, dailyLabel: dailyLabel() });
      if (signedIn) setTimeout(() => emit(EVENTS.LEADERBOARD_SAVED, { ok: true, rank: gStep % 8 < 4 ? 14 : 1, best: 34240, improved: isBest, rival: gStep % 8 < 4 ? { name: 'Tunde', score: 36100 } : null }), 700);
    } else {
      const me = state.player.id;
      const mk = (n) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, player_id: 1000 + i, name: ['Trini', 'Tunde', 'Amaka', 'Kofi', 'Zainab', 'Ife', 'Chidi', 'Lola', 'Seyi', 'Nneka', 'Bayo', 'Efe'][i % 12], color: ['#4b7bec', '#E4573D', '#1FA39A', '#F2A93B', '#8E3A4E'][i % 5], score: 62000 - i * 2150, stats: { survived: 228 - i * 3, mangoes: 140 - i * 2 } }));
      const variants = [
        () => { const e = mk(30); e[3] = { ...e[3], player_id: me, name: state.player.name || 'You' }; return { entries: e, myId: me }; },
        () => { const e = mk(30); e[13] = { ...e[13], player_id: me, name: state.player.name || 'You' }; return { entries: e, myId: me }; },
        () => ({ entries: [], myId: me, loading: true }),
        () => ({ entries: [], myId: me, error: true }),
        () => ({ entries: mk(10), myId: me, guest: true }),
      ];
      showLeaderboard(variants[jStep++ % variants.length]());
    }
  });
  window.__mangoTest = { scoring: () => { const r = scoringSelfTest(); console[r.ok ? 'log' : 'error']('[scoring self-check]', r); return r; } };
}

boot().catch((err) => {
  console.error('[mango-rush] boot failed', err);
});
