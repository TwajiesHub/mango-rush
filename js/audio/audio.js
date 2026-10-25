// Mango Rush — music and sound effects.            OWNER: Claude Code  ·  STATUS: step 11 (the music loop, adaptive mix, every sound effect)
//
// Web Audio API only. No libraries, no audio files except the one music loop (assets/music/loop.mp3, see CONFIG.music).
// IMPORTS ALLOWED: '../core/config.js' (CONFIG, TUNE), '../core/state.js' (state), '../core/events.js' (EVENTS, on), './loopwindow.js', './beatclock.js'
//
// CONTRACT (keep these exact exports and signatures):
//
//   initAudio({ musicUrl: string }) -> void
//     Prepare everything but DO NOT create/resume the AudioContext yet (browsers block it before a gesture).
//     Subscribe to the events below, to button clicks (a soft UI tick) and to the tab being hidden.
//
//   unlockAudio() -> Promise<void>
//     Called by main.js inside the first click/tap/keypress (the Play button). Creates/resumes the AudioContext, builds the buses, and starts fetching +
//     decoding the music loop in the background (it starts the moment it is ready, if state.settings.music). Safe to call many times. If the music
//     fails to load, the game continues silently. Any later gesture resumes a suspended or 'interrupted' context (iOS).
//
//   setMusicEnabled(on) / setSfxEnabled(on) -> void   (fade 0.3 s, never a click). Music off stops the loop after the fade (and the beat clock falls
//     back to 105 BPM); music on restarts it from the top.
//
//   updateAudio(dt) -> void   called every frame by main.js (also while paused). No allocation: it moves the adaptive music, the beat clock, the
//     heartbeat, the Madness shaker, the shower sparkles and the ?debug sound check.
//
//   musicBeat() -> { beat, phase }   the beat now (a whole number counting up through every loop) and 0..1 inside it, from the audio clock and the
//     music's current playbackRate; a 105 BPM wall clock when the music is off or not yet unlocked. The SAME object every call. The night seam glow
//     of the living planks (world/barge.js) uses it.
//   playConfirm() -> void   a small confirm blip ("Card saved", "Copied"); main.js calls it after a share.
//   soundCheck() -> void    ?debug (the Y key): plays every new sound in turn, once.
//   getAudioDebug() -> {...}   for the ?debug tuning panel: context state, loop window, cutoff, rate, beat phase, live and peak voices.
//
// MIX. music: source -> lowpass -> duck gain -> toggle gain -> compressor; effects: voice -> sfx gain -> compressor; compressor -> destination (a gentle
// DynamicsCompressor, so stacked sounds never clip). At most CONFIG.audio.maxVoices (24) effect voices live: beyond that only loud sounds start
// (up to 6 more), the rest are dropped. Repeated sounds have rate limits. Short repeated sounds are pre-rendered into AudioBuffers.
//
// ADAPTIVE MUSIC (CONFIG.audio; all glide over 2 s):
//   phase golden / dusk / night / midnight: lowpass 1800 / 4000 / 9000 / 16000 Hz, playbackRate 1.00 / 1.02 / 1.04 / 1.06.
//   start screen: the golden-hour filter at -6 dB.   pause and game over: -12 dB and 900 Hz (it keeps playing, filtered, through the death transition).
//   Heartbeat 700 Hz (muffled) + the lub-dub;  Lights out ~900 Hz while dark;  Mango Madness 18000 Hz and +2 dB. (Pause > Heartbeat > Lights out > Madness.)
//   A happening warning is one beat of near-silence (-24 dB for 0.25 s); a hit, The Big One and a lost pot duck the music briefly.
//
// SOUND EFFECTS (all synthesized; every one gets a random detune of +/- CONFIG.audio.detune; respect state.settings.sfx):
//   (step 1-5) catch (mango / golden / rotten / shield), coconut whistles, late-lock click, drift swish, thud, hit, near miss, Perfect dodge, dash,
//   footsteps, skid, snap turn, step up, Madness fill, NEW BEST, countdown, run end.
//   (step 11) POT_BANKED a rising cascade of coin tinks (more notes, brighter for a bigger pot);  SLAM_BANK a woody thump, a bigger cascade and a chord
//   stab;  SWOOP an airy swish + a pluck that steps up a scale degree per chain (cap 8);  POT_LOST a dry crack and a short plain three-note fall;
//   BAT_TELL a leathery flutter panned toward the side the bat comes from;  BAT_HIT a flap and a soft bonk;  ITEM_SNATCHED a quick fwip;
//   gust: filtered wind that swells in, sweeps and eases out over 6 s;  Lights out: a low whoomp going under, a lighter one coming out;
//   The Big One: a rumble rising over its 3 s warning, a huge thud + splash, a bright chord when you survive;  mango shower: a leafy rustle and
//   marimba sparkles;  Madness: the drum fill + a light shaker on the beat;  planks: a soft wooden knock under each coconut thud and an occasional
//   faint creak on a footstep at speed (at most 1 in 6);  UI: a soft tick on a button press.
//
// RULES: never throw; if Web Audio is missing, every function is a silent no-op. No setInterval / setTimeout: sounds are timed with AudioContext.currentTime.

import { CONFIG, TUNE } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, on } from '../core/events.js';
import { loopWindow } from './loopwindow.js';
import { createBeatClock } from './beatclock.js';

const A = CONFIG.audio;
const MU = CONFIG.music;
const PENT = [0, 2, 4, 7, 9];                       // a major pentatonic, in semitones
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];           // a major scale, for the chain
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dbToGain = (db) => Math.pow(10, db / 20);

let ac = null;
let sfxGain = null;
let musicToggle = null;
let musicDuck = null;
let musicFilter = null;
let comp = null;
let noiseBuf = null;
let sfxOn = true;
let musicOn = true;
let musicUrl = '';
let beatTimer = 0;

// ---- the music
let musicBuf = null;
let musicSrc = null;
let musicLoading = false;
let musicFailed = false;
let loopWin = null;
const beat = createBeatClock({ bpm: MU.bpm, loopSeconds: MU.loopSeconds });
const beatOut = { beat: 0, phase: 0 };
let clockRate = 1;           // the beat clock's own copy of the playbackRate (it glides the same way)
let rateNow = 1;
let cutoffNow = -1;
let dbNow = 99;
let lastA = 0;
let lastEighth = -1;
let hitDuckUntil = 0;
let silenceUntil = 0;
let dark = false;            // Lights out
let showerUntil = 0;
let nextSparkle = 0;
let windNodes = null;

// ---- effects: pre-rendered buffers and the bookkeeping
let footBuf = null;
let coinBuf = null;
let knockBuf = null;
let creakBuf = null;
let flutterBuf = null;
let flapBuf = null;
const footGains = [];
let footI = 0;
let lastStepAt = -1;
let stepN = 0;
let voices = 0;
let peakVoices = 0;
const gates = Object.create(null);

function makeBuffers() {
  const sr = ac.sampleRate;
  // footsteps: ONE pre-rendered buffer (thump + soft tick), played through 3 gain nodes that are reused round-robin
  let n = Math.floor(sr * 0.1);
  footBuf = ac.createBuffer(1, n, sr);
  let d = footBuf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const thump = Math.sin(2 * Math.PI * (88 * t - 226 * t * t)) * Math.exp(-t * 48);   // 88 Hz sliding down to ~54 Hz
    lp += ((Math.random() * 2 - 1) - lp) * 0.35;                                         // a soft, filtered noise tick
    d[i] = thump * 0.8 + lp * Math.exp(-t * 150) * 0.28;
  }
  // a coin "tink": a bright bell with inharmonic partials (played at different playback rates for the cascade)
  n = Math.floor(sr * 0.2);
  coinBuf = ac.createBuffer(1, n, sr);
  d = coinBuf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = (Math.sin(2 * Math.PI * 1568 * t) * Math.exp(-t * 26) + Math.sin(2 * Math.PI * 1568 * 2.76 * t) * Math.exp(-t * 48) * 0.5 + Math.sin(2 * Math.PI * 1568 * 5.4 * t) * Math.exp(-t * 90) * 0.25) * 0.5;
  }
  // a wooden knock: a short low tock and a dry click
  n = Math.floor(sr * 0.14);
  knockBuf = ac.createBuffer(1, n, sr);
  d = knockBuf.getChannelData(0);
  lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += ((Math.random() * 2 - 1) - lp) * 0.5;
    d[i] = Math.sin(2 * Math.PI * (210 * t - 700 * t * t)) * Math.exp(-t * 38) * 0.8 + lp * Math.exp(-t * 300) * 0.4;
  }
  // a faint creak: a sawtooth that wobbles up in pitch, softened, under a swell
  n = Math.floor(sr * 0.3);
  creakBuf = ac.createBuffer(1, n, sr);
  d = creakBuf.getChannelData(0);
  let ph = 0;
  lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (150 + 60 * (t / 0.3) + 18 * Math.sin(t * 90)) / sr;
    const saw = (ph % 1) * 2 - 1;
    lp += (saw - lp) * 0.12;
    d[i] = lp * Math.sin(Math.PI * (t / 0.3)) * 0.5;
  }
  // a leathery flutter: soft noise beating at about 22 Hz under a swell (a bat's wings)
  n = Math.floor(sr * 0.55);
  flutterBuf = ac.createBuffer(1, n, sr);
  d = flutterBuf.getChannelData(0);
  lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += ((Math.random() * 2 - 1) - lp) * 0.22;
    d[i] = lp * (0.5 + 0.5 * Math.sin(2 * Math.PI * 22 * t)) * Math.sin(Math.PI * (t / 0.55)) * 0.9;
  }
  // a single flap
  n = Math.floor(sr * 0.12);
  flapBuf = ac.createBuffer(1, n, sr);
  d = flapBuf.getChannelData(0);
  lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += ((Math.random() * 2 - 1) - lp) * 0.3;
    d[i] = lp * Math.exp(-t * 28) * Math.min(1, t * 200) * 0.9;
  }
}

function detune() {
  return 1 + (Math.random() * 2 - 1) * A.detune;
}

function ready() {
  return ac && ac.state === 'running' && sfxOn;
}

function takeVoice(vol) {
  if (voices >= A.maxVoices && !(vol >= 0.2 && voices < A.maxVoices + 6)) return false;
  voices++;
  if (voices > peakVoices) peakVoices = voices;
  return true;
}
function freeVoice() {
  if (voices > 0) voices--;
}

// a per-event rate limit: true when `key` has not played within `gap` seconds
function gate(key, gap) {
  const now = ac ? ac.currentTime : 0;
  if (now - (gates[key] === undefined ? -99 : gates[key]) < gap) return false;
  gates[key] = now;
  return true;
}

// One oscillator note. `at` = seconds from now; slide = Hz change over the note.
function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0, at = 0) {
  if (!ready() || !takeVoice(vol)) return;
  try {
    const t = ac.currentTime + at;
    const f = freq * detune();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxGain);
    o.onended = () => { g.disconnect(); freeVoice(); };
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { freeVoice(); /* audio must never break the game */ }
}

// A burst of band-passed noise (whoosh, drum fill).
function noise(dur, vol, from, to, at = 0) {
  if (!ready() || !noiseBuf || !takeVoice(vol)) return;
  try {
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from * detune(), t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(sfxGain);
    src.onended = () => { g.disconnect(); freeVoice(); };
    src.start(t);
    src.stop(t + dur + 0.02);
  } catch { freeVoice(); /* ignore */ }
}

// a pre-rendered buffer: volume, playback rate (pitch), pan (-1..1) and a start delay
function bufPlay(buf, vol, rate = 1, pan = 0, at = 0) {
  if (!ready() || !buf || !takeVoice(vol)) return;
  try {
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * detune();
    const g = ac.createGain();
    g.gain.value = vol;
    let tail = g;
    src.connect(g);
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      tail = p;
    }
    tail.connect(sfxGain);
    src.onended = () => { tail.disconnect(); g.disconnect(); freeVoice(); };
    src.start(t);
  } catch { freeVoice(); }
}

// ---------------------------------------------------------------- the sounds (each is used by its event and by the ?debug sound check)
function coins(n, bright, vol) {
  for (let i = 0; i < Math.min(10, n); i++) {
    const semis = PENT[i % 5] + 12 * Math.floor(i / 5);
    bufPlay(coinBuf, vol * (1 - i * 0.035), Math.pow(2, semis / 12) * bright * 0.75, 0, i * 0.045);
  }
}
function potBanked(amount, auto = false) {
  if (!gate('coins', 0.1)) return;
  const n = clamp(3 + Math.floor(Math.log2(Math.max(100, amount) / 300) * 1.5), 3, 9);
  coins(auto ? Math.min(n, 3) : n, 1 + Math.min(0.4, amount / 20000), auto ? 0.1 : 0.2);
}
function slamBank(amount) {
  tone(78, 0.22, 'sine', 0.32, -34);
  bufPlay(knockBuf, 0.3, 0.8);
  coins(clamp(5 + Math.floor(Math.log2(Math.max(100, amount) / 300) * 1.5), 6, 10), 1.1 + Math.min(0.4, amount / 20000), 0.22);
  [523, 659, 784].forEach((f) => tone(f, 0.2, 'triangle', 0.09, 0, 0.05));
}
function swoop(chain) {
  noise(0.2, 0.1, 600, 2600);
  const f = 392 * Math.pow(2, MAJOR[clamp(chain - 1, 0, 7)] / 12);
  tone(f, 0.2, 'triangle', 0.13, 0, 0.04);
  tone(f * 2, 0.1, 'sine', 0.04, 0, 0.04);
}
function potLost() {
  noise(0.05, 0.22, 3600, 1500);
  tone(1800, 0.03, 'square', 0.06);
  tone(440, 0.1, 'triangle', 0.13, 0, 0.09);
  tone(370, 0.1, 'triangle', 0.13, 0, 0.18);
  tone(311, 0.16, 'triangle', 0.13, 0, 0.27);
}
function batTell(side) { bufPlay(flutterBuf, 0.14, 1, side * 0.8); }
function batHit() {
  bufPlay(flapBuf, 0.2, 1);
  tone(190, 0.12, 'sine', 0.18, -70, 0.03);
}
function snatched() {
  if (!gate('snatch', 0.06)) return;
  noise(0.09, 0.09, 1200, 3800);
  tone(1500, 0.05, 'sine', 0.03, 400);
}
function windStart(seconds = 6) {
  if (!ready() || !noiseBuf || windNodes || !takeVoice(0.2)) return;
  try {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.linearRampToValueAtTime(1500, t + seconds * 0.45);
    bp.frequency.linearRampToValueAtTime(600, t + seconds);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 1.2);                 // swells in,
    g.gain.setValueAtTime(0.13, t + seconds - 1.5);                // sweeps,
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);           // eases out
    src.connect(bp).connect(g).connect(sfxGain);
    windNodes = { src, g };
    src.onended = () => { g.disconnect(); windNodes = null; freeVoice(); };
    src.start(t);
    src.stop(t + seconds + 0.1);
  } catch { windNodes = null; freeVoice(); }
}
function windStop() {
  if (!windNodes || !ac) return;
  try {
    const t = ac.currentTime;
    windNodes.g.gain.cancelScheduledValues(t);
    windNodes.g.gain.setValueAtTime(Math.max(0.0001, windNodes.g.gain.value), t);
    windNodes.g.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    windNodes.src.stop(t + 0.7);
  } catch { /* ignore */ }
}
function lightsOut(starting) {
  if (starting) { tone(72, 0.55, 'sine', 0.26, -30); noise(0.5, 0.08, 320, 90); }
  else { tone(120, 0.35, 'sine', 0.14, 50); noise(0.3, 0.05, 200, 700); }
}
// a low rumble that rises over `seconds` (The Big One's warning)
function rumble(seconds) {
  if (!ready() || !noiseBuf || !takeVoice(0.25)) return;
  try {
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(34, t);
    o.frequency.linearRampToValueAtTime(62, t + seconds);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(90, t);
    lp.frequency.linearRampToValueAtTime(240, t + seconds);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + seconds);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds + 0.05);
    o.connect(lp).connect(g).connect(sfxGain);
    o.onended = () => { g.disconnect(); freeVoice(); };
    o.start(t);
    o.stop(t + seconds + 0.1);
  } catch { freeVoice(); }
}
function bigLanding() {
  tone(58, 0.7, 'sine', 0.42, -26);
  tone(95, 0.35, 'triangle', 0.2, -50);
  noise(0.8, 0.26, 700, 90);       // the splash
  bufPlay(knockBuf, 0.35, 0.6);
}
function bigSurvived() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.55, 'triangle', 0.13, 0, i * 0.05));
  tone(2093, 0.4, 'sine', 0.04, 0, 0.2);
}
function rustle() {
  noise(0.5, 0.05, 3200, 2200);
  noise(0.5, 0.04, 2600, 3600, 0.3);
}
function marimba() {
  const f = 523 * Math.pow(2, (PENT[Math.floor(Math.random() * 5)] + (Math.random() < 0.4 ? 12 : 0)) / 12);
  tone(f, 0.26, 'sine', 0.07);
  tone(f * 4, 0.07, 'sine', 0.02);
}
function shaker(strong) { noise(0.045, strong ? 0.06 : 0.035, 5500, 8800); }
function plankKnock() { bufPlay(knockBuf, 0.1, 0.9 + Math.random() * 0.25); }
function creak() { bufPlay(creakBuf, 0.05, 0.9 + Math.random() * 0.25); }
function uiTick() {
  if (!gate('ui', 0.05)) return;
  tone(1700, 0.03, 'square', 0.03);
}
export function playConfirm() {
  tone(880, 0.08, 'triangle', 0.1);
  tone(1320, 0.14, 'triangle', 0.1, 0, 0.07);
}

// ---------------------------------------------------------------- events
export function initAudio({ musicUrl: url }) {
  musicUrl = url;

  on(EVENTS.RUN_START, () => {
    dark = false; showerUntil = 0; hitDuckUntil = 0; silenceUntil = 0;
    windStop();
    tone(660, 0.1, 'triangle', 0.1);
  });

  on(EVENTS.CATCH, (e) => {
    if (e.type === 'mango') {
      const chain = Math.min(14, (state.multiplier - 1) * CONFIG.scoring.catchesPerStep + state.comboStep);
      const pitch = 1 + CONFIG.audio.catchPitchStep * chain;
      tone(520 * pitch, 0.12, 'triangle', 0.16, 300);
      tone(1040 * pitch, 0.08, 'sine', 0.04, 200);
    } else if (e.type === 'golden') {
      tone(880, 0.16, 'triangle', 0.15);
      tone(1108, 0.16, 'triangle', 0.13, 0, 0.07);
      tone(1320, 0.28, 'triangle', 0.15, 0, 0.14);
      tone(2640, 0.2, 'sine', 0.04, 0, 0.16);
    } else if (e.type === 'rotten') {
      tone(150, 0.14, 'sine', 0.2, -60);
    } else if (e.type === 'shield') {
      tone(260, 0.08, 'triangle', 0.18, -60);
      tone(600, 0.3, 'sine', 0.08, 900, 0.06);
    }
  });
  // the tells you can play by ear (step 5a): quiet whistles, one per coconut kind
  let whistleAt = -1;
  let whistles = 0;
  on(EVENTS.DROP_SPAWN, (e) => {
    if (e.type !== 'coconut' || !ready()) return;
    if (e.big) { rumble(e.warnTime); return; }          // The Big One: a rumble that rises over its warning
    const now = ac.currentTime;
    if (now - whistleAt > 0.15) { whistleAt = now; whistles = 0; }
    if (++whistles > 2) return;
    const wait = e.fallAt || 0;
    const left = Math.max(0.2, e.warnTime - wait);
    if (e.kind === 'slow') tone(560, Math.min(1.1, left), 'sine', 0.05, -260, wait);
    else if (e.kind === 'fast') tone(2000, 0.3, 'sine', 0.04, -700, wait);
    else tone(1050, Math.min(0.8, left), 'sine', 0.045, -500, wait);
  });
  on(EVENTS.RING_LOCK, (e) => {
    if (e.kind !== 'late') return;
    tone(2300, 0.035, 'square', 0.05);
    noise(0.03, 0.06, 5000, 3000);
  });
  on(EVENTS.DRIFT_START, () => noise(0.55, 0.05, 500, 1800));   // a soft wind swish
  on(EVENTS.DROP_LAND, (e) => {
    if (e.type !== 'coconut') return;
    if (e.big) {
      bigLanding();
      if (ac) hitDuckUntil = ac.currentTime + 0.5;
    } else {
      tone(120, 0.18, 'sine', 0.25, -60);
      plankKnock();                                       // the planks answer with a soft wooden knock
    }
  });
  on(EVENTS.HIT, (e) => {
    if (e.shielded) {
      tone(310, 0.09, 'triangle', 0.2, -90);
    } else {
      tone(90, 0.25, 'sine', 0.3, -40);
      tone(220, 0.35, 'sawtooth', 0.12, -150);
      if (ac) hitDuckUntil = ac.currentTime + CONFIG.audio.duckMs / 1000;   // the music ducks for a moment
    }
  });
  // movement sounds (step 3): all synthesized, all quiet
  on(EVENTS.FOOTSTEP, (e) => {
    // a short low thump plus a soft filtered tick; louder with speed, +/- 5% pitch and volume, never annoying
    if (!ready() || !footBuf) return;
    const now = ac.currentTime;
    if (now - lastStepAt < 0.12) return;
    const v = TUNE.stepVolume * Math.min(1.2, 0.35 + e.speed / 10) * (0.95 + Math.random() * 0.1);
    if (v <= 0.01) return;
    lastStepAt = now;
    try {
      const g = footGains[footI++ % footGains.length];
      g.gain.setValueAtTime(0.2 * v, now);
      const src = ac.createBufferSource();
      src.buffer = footBuf;
      src.playbackRate.value = 0.95 + Math.random() * 0.1;
      src.connect(g);
      src.onended = () => src.disconnect();
      src.start(now);
    } catch { /* audio must never break the game */ }
    if (e.speed > 3 && ++stepN % 6 === 0 && Math.random() < 0.7 && gate('creak', 0.9)) creak();   // at most 1 step in 6 creaks, faintly
  });
  on(EVENTS.SKID, () => noise(0.14, 0.09, 3200, 1500));          // a short scrape
  on(EVENTS.SNAP_TURN, () => { noise(0.1, 0.07, 1400, 4200); tone(900, 0.07, 'sine', 0.03, 500); });   // a light fwip
  on(EVENTS.NEAR_MISS, () => tone(1500, 0.1, 'sine', 0.1, 400));
  on(EVENTS.PERFECT_DODGE, () => {
    tone(260, 0.16, 'sine', 0.2, -120);
    tone(140, 0.16, 'sine', 0.2, 160, 0.15);
  });
  on(EVENTS.DASH, () => {
    noise(0.16, 0.14, 400, 1200);
    tone(300, 0.12, 'sine', 0.06, 500);
  });
  on(EVENTS.COMBO_CHANGE, (e) => {
    if (e.stepUp) { tone(660, 0.08, 'triangle', 0.12); tone(880, 0.14, 'triangle', 0.12, 0, 0.07); }
  });
  on(EVENTS.MADNESS_START, () => {
    for (let i = 0; i < 6; i++) { tone(90, 0.07, 'sine', 0.2, -30, i * 0.08); noise(0.06, 0.08, 800, 400, i * 0.08); }
  });
  on(EVENTS.BEST_PASSED, () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, 0, i * 0.09));
  });
  on(EVENTS.COUNTDOWN, (e) => (e.n > 0 ? tone(520, 0.1, 'triangle', 0.12) : tone(880, 0.25, 'triangle', 0.16)));
  on(EVENTS.RUN_END, () => {
    dark = false; showerUntil = 0;
    windStop();
    tone(392, 0.2, 'triangle', 0.15);
    tone(330, 0.2, 'triangle', 0.15, 0, 0.18);
    tone(262, 0.4, 'triangle', 0.15, 0, 0.36);
  });

  // the pot and the skills (step 11)
  on(EVENTS.POT_BANKED, (e) => { if (!e.slam) potBanked(e.amount, !!e.auto); });   // a slam has its own, bigger sound
  on(EVENTS.SLAM_BANK, (e) => slamBank(e.amount));
  on(EVENTS.SWOOP, (e) => swoop(e.chain || 1));
  on(EVENTS.POT_LOST, (e) => {
    if (!(e.amount > 0)) return;
    potLost();
    if (ac) hitDuckUntil = Math.max(hitDuckUntil, ac.currentTime + 0.15);
  });
  // the happenings (step 11)
  on(EVENTS.BAT_TELL, (e) => batTell(e.side || 0));
  on(EVENTS.BAT_HIT, () => batHit());
  on(EVENTS.ITEM_SNATCHED, () => snatched());
  on(EVENTS.BIGONE_SURVIVED, () => bigSurvived());
  on(EVENTS.HAPPENING_WARN, () => { if (ac) silenceUntil = ac.currentTime + 0.25; });   // one beat of near-silence in the music
  on(EVENTS.HAPPENING_START, (e) => {
    if (e.id === 'gust') windStart(6);
    else if (e.id === 'bridge') { dark = true; lightsOut(true); }
    else if (e.id === 'shower') { if (ac) { showerUntil = ac.currentTime + 3; nextSparkle = ac.currentTime; } rustle(); }
  });
  on(EVENTS.HAPPENING_END, (e) => {
    if (e.id === 'gust') windStop();
    else if (e.id === 'bridge') { dark = false; lightsOut(false); }
    else if (e.id === 'shower') showerUntil = 0;
  });

  // a soft tick on every button press (once the audio is unlocked), and a resume on any later gesture (iOS 'interrupted', a suspended tab)
  addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('button')) uiTick(); }, true);
  const gesture = () => { if (ac && !document.hidden && ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => {}); };
  addEventListener('pointerdown', gesture, true);
  addEventListener('keydown', gesture, true);
  // a hidden tab suspends the context (battery); it resumes when the tab is visible again
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else ac.resume().catch(() => {});
  });
}

// ---------------------------------------------------------------- unlock, the music, the toggles
export async function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ac) {
      ac = new AC();
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(ac.destination);
      sfxGain = ac.createGain();
      sfxGain.gain.value = sfxOn ? 1 : 0;
      sfxGain.connect(comp);
      musicToggle = ac.createGain();
      musicToggle.gain.value = musicOn ? 1 : 0;
      musicToggle.connect(comp);
      musicDuck = ac.createGain();
      musicDuck.gain.value = 1;
      musicDuck.connect(musicToggle);
      musicFilter = ac.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.Q.value = 0.7;
      musicFilter.frequency.value = A.phases.golden[0];
      musicFilter.connect(musicDuck);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      makeBuffers();
      for (let i = 0; i < 3; i++) { const g = ac.createGain(); g.connect(sfxGain); footGains.push(g); }
      lastA = ac.currentTime;
      cutoffNow = -1;
      dbNow = 99;
    }
    if (ac.state !== 'running') await ac.resume();
    if (musicOn) loadMusic();   // in the background: the game never waits for the music
  } catch { /* stays silent */ }
}

function decode(ab) {
  return new Promise((res, rej) => {
    try {
      const p = ac.decodeAudioData(ab, res, rej);   // the callback form works everywhere; a modern browser also returns a promise
      if (p && p.catch) p.catch(rej);
    } catch (e) { rej(e); }
  });
}

async function loadMusic() {
  if (!ac || musicBuf || musicLoading || musicFailed) { if (musicBuf && !musicSrc && musicOn) startMusic(); return; }
  musicLoading = true;
  try {
    const r = await fetch(musicUrl);
    if (!r.ok) throw new Error(`music ${r.status}`);
    musicBuf = await decode(await r.arrayBuffer());
    loopWin = loopWindow(musicBuf.duration, MU.loopSeconds);
    if (location.search.includes('debug')) console.info('[audio] the loop decoded to', musicBuf.duration.toFixed(4), 's:', loopWin.kind, 'window', loopWin.loopStart.toFixed(5), '..', loopWin.loopEnd.toFixed(5));
    if (musicOn) startMusic();
  } catch (err) {
    musicFailed = true;   // the game carries on in silence
    if (location.search.includes('debug')) console.warn('[audio] music failed to load', err);
  } finally {
    musicLoading = false;
  }
}

function startMusic() {
  if (!ac || !musicBuf || musicSrc || !loopWin) return;
  try {
    const src = ac.createBufferSource();
    src.buffer = musicBuf;
    src.loop = true;
    src.loopStart = loopWin.loopStart;
    src.loopEnd = loopWin.loopEnd;
    src.playbackRate.value = rateNow;
    src.connect(musicFilter);
    src.onended = () => { if (musicSrc === src) { musicSrc = null; beat.stop(); } };
    src.start(0, loopWin.loopStart);
    musicSrc = src;
    beat.start();
    clockRate = rateNow;
    musicToggle.gain.cancelScheduledValues(ac.currentTime);
    musicToggle.gain.setTargetAtTime(1, ac.currentTime, 0.1);
  } catch { musicSrc = null; }
}

function stopMusic() {
  if (!musicSrc) return;
  try { musicSrc.stop(ac.currentTime + 0.4); } catch { /* ignore */ }   // after the fade (the audio clock times it: no setTimeout)
  beat.stop();
}

export function setMusicEnabled(on) {
  const was = musicOn;
  musicOn = !!on;
  if (!ac || !musicToggle) return;
  if (!musicOn) {
    musicToggle.gain.cancelScheduledValues(ac.currentTime);
    musicToggle.gain.setTargetAtTime(0, ac.currentTime, 0.1);   // ~0.3 s fade, no click
    stopMusic();
    musicSrc = null;
  } else if (!was) {
    musicToggle.gain.cancelScheduledValues(ac.currentTime);
    musicToggle.gain.setTargetAtTime(1, ac.currentTime, 0.1);
    if (musicBuf) startMusic(); else loadMusic();
  }
}

export function setSfxEnabled(on) {
  sfxOn = !!on;
  if (sfxGain) sfxGain.gain.setTargetAtTime(sfxOn ? 1 : 0, ac.currentTime, 0.1);   // ~0.3 s fade, no click
}

export function musicBeat() {
  return beat.value(beatOut);
}

// ---------------------------------------------------------------- the ?debug sound check (the Y key)
const checkList = [
  ['pot banked (small)', () => potBanked(600), 1.2], ['pot banked (big)', () => { gates.coins = -99; potBanked(14000); }, 1.6],
  ['slam bank', () => slamBank(5200), 1.6], ['swoop (chain 1)', () => swoop(1), 1], ['chain 4', () => swoop(4), 1], ['chain 8', () => swoop(8), 1],
  ['pot lost', () => potLost(), 1.4], ['bat comes from the left', () => batTell(-1), 1.2], ['bat comes from the right', () => batTell(1), 1.2],
  ['bat hit', () => batHit(), 1], ['item snatched', () => { gates.snatch = -99; snatched(); }, 1],
  ['gust (6 s)', () => windStart(6), 7], ['lights out: going under', () => lightsOut(true), 1.6], ['lights out: coming out', () => lightsOut(false), 1.2],
  ['the Big One: rumble (3 s)', () => rumble(3), 3.4], ['the Big One: landing', () => bigLanding(), 1.8], ['the Big One: survived', () => bigSurvived(), 1.5],
  ['mango shower (3 s)', () => { rustle(); showerUntil = ac.currentTime + 3; nextSparkle = ac.currentTime; }, 3.4],
  ['madness shaker (8 beats)', () => { for (let i = 0; i < 8; i++) shaker(i % 2 === 0); }, 1],
  ['plank knock', () => plankKnock(), 0.8], ['creak', () => creak(), 0.8], ['UI tick', () => { gates.ui = -99; uiTick(); }, 0.8], ['confirm blip', () => playConfirm(), 1],
];
let checkQ = null;
let checkI = 0;
let checkAt = 0;

export function soundCheck() {
  if (!ac || ac.state !== 'running') { console.info('[audio] press Play once first (the audio is not unlocked yet)'); return; }
  checkQ = checkList;
  checkI = 0;
  checkAt = ac.currentTime + 0.2;
}

export function getAudioDebug() {
  musicBeat();
  return {
    ctx: ac ? ac.state : 'not unlocked', music: musicSrc ? 'playing' : (musicFailed ? 'failed' : musicBuf ? 'stopped' : musicLoading ? 'loading' : 'not loaded'),
    loop: loopWin ? `${loopWin.kind}  ${loopWin.loopStart.toFixed(4)}..${loopWin.loopEnd.toFixed(4)} s` : '-', duration: musicBuf ? musicBuf.duration : 0,
    cutoff: musicFilter ? musicFilter.frequency.value : 0, rate: musicSrc ? musicSrc.playbackRate.value : 0, db: dbNow, beat: beatOut.beat, phase: beatOut.phase,
    voices, peakVoices, musicOn, sfxOn, dark,
  };
}

// ---------------------------------------------------------------- per frame (no allocation)
export function updateAudio(dt) {
  if (!ac) { beat.advance(dt, 1); return; }
  const now = ac.currentTime;
  const dA = now - lastA;
  lastA = now;
  beat.advance(dA, clockRate);

  // ---- the adaptive music: where the filter, the rate and the level should be now
  const scr = state.screen;
  let cutoff;
  let rate;
  let db = 0;
  const ph = A.phases[state.phase] || A.phases.golden;
  if (scr === 'start' || scr === 'loading') { cutoff = A.phases.golden[0]; rate = 1; db = A.startDb; }
  else if (scr === 'paused' || scr === 'over') { cutoff = A.duckCutoff; rate = ph[1]; db = A.duckDb; }
  else {
    cutoff = state.heartbeat ? A.heartbeatCutoff : dark ? A.darkCutoff : state.madnessActive ? A.madnessCutoff : ph[0];
    rate = ph[1];
    if (state.madnessActive) db = A.madnessDb;
  }
  if (now < silenceUntil) db = A.silenceDb;                         // the happening silence beat
  else if (now < hitDuckUntil) db += A.duckOnHitDb;                 // a hit / The Big One / a lost pot
  if (musicFilter) {
    if (cutoff !== cutoffNow) { cutoffNow = cutoff; musicFilter.frequency.setTargetAtTime(cutoff, now, A.glideSeconds / 4); }
    if (Math.abs(db - dbNow) > 0.05) {
      const quick = db < dbNow && (now < silenceUntil || now < hitDuckUntil);
      dbNow = db;
      musicDuck.gain.setTargetAtTime(dbToGain(db), now, quick ? 0.03 : 0.3);
    }
    if (rate !== rateNow) {
      rateNow = rate;
      if (musicSrc) musicSrc.playbackRate.setTargetAtTime(rate, now, A.glideSeconds / 4);
    }
  }
  clockRate += (rateNow - clockRate) * (1 - Math.exp(-dA / (A.glideSeconds / 4)));   // the beat clock glides with the music

  // ---- Madness: a light shaker on the eighth notes of the beat
  beat.value(beatOut);
  const eighth = Math.floor((beatOut.beat + beatOut.phase) * 2);
  if (eighth !== lastEighth) {
    lastEighth = eighth;
    if (state.madnessActive && scr === 'play') shaker((eighth & 1) === 0);
  }
  // ---- the shower: marimba sparkles while it lasts
  if (now < showerUntil && now >= nextSparkle) {
    nextSparkle = now + 0.12 + Math.random() * 0.22;
    marimba();
  }
  // ---- the sound check
  if (checkQ && now >= checkAt) {
    const item = checkQ[checkI];
    if (!item) checkQ = null;
    else {
      console.info(`[audio] sound check ${checkI + 1}/${checkQ.length}: ${item[0]}`);
      try { item[1](); } catch { /* ignore */ }
      checkAt = now + item[2];
      checkI++;
    }
  }

  // last-life heartbeat: a "lub-dub" every 0.85 s
  if (!state.heartbeat || scr !== 'play') { beatTimer = 0; return; }
  beatTimer -= dt;
  if (beatTimer <= 0) {
    beatTimer = 0.85;
    tone(55, 0.12, 'sine', 0.35, -10);
    tone(48, 0.12, 'sine', 0.3, -8, 0.09);
  }
}
