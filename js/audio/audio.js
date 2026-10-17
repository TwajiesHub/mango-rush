// Mango Rush — music and sound effects.            OWNER: Claude Code  ·  STATUS: step 1 (sound effects; music loop = step 9)
//
// Web Audio API only. No libraries, no audio files except the one music loop.
// IMPORTS ALLOWED: '../core/config.js' (CONFIG), '../core/state.js' (state), '../core/events.js' (EVENTS, on)
//
// CONTRACT (keep these exact exports and signatures):
//
//   initAudio({ musicUrl: string }) -> void
//     Prepare everything but DO NOT create/resume the AudioContext yet (browsers block it before a gesture).
//     Subscribe to the events below.
//
//   unlockAudio() -> Promise<void>
//     Called by main.js inside the first click/tap/keypress (the Play button). Creates/resumes the
//     AudioContext, fetches + decodes the music loop (fetch(musicUrl) -> decodeAudioData), starts it looping
//     if state.settings.music. Safe to call many times. If the music fails to load, the game continues silently.
//
//   setMusicEnabled(on: boolean) / setSfxEnabled(on: boolean) -> void   (fade 0.3 s, never a click)
//
//   updateAudio(dt: number) -> void   called every frame by main.js (also while paused)
//     Adaptive music, driven by `state`:
//       - Music chain: source -> lowpass BiquadFilter -> gain -> master.
//       - phase 'golden' cutoff 1800 Hz, 'dusk' 4000 Hz, 'night' 9000 Hz, 'midnight' 16000 Hz (glide over 2 s);
//         playbackRate 1.0 / 1.02 / 1.04 / 1.06 (glide).
//       - state.madnessActive: cutoff 18000 Hz, gain +2 dB.
//       - state.heartbeat: cutoff 700 Hz (muffled) + a synthesized heartbeat "lub-dub" every 0.85 s
//         (two short low sine thumps ~55 Hz / 48 Hz, 90 ms apart).
//       - state.screen === 'paused' or 'over': music gain -12 dB (duck), cutoff 900 Hz.
//
// SOUND EFFECTS (synthesized with OscillatorNode/GainNode/noise buffers; every one gets a random detune of
// +/- CONFIG.audio.detune; respect state.settings.sfx):
//   EVENTS.CATCH (type mango)       bright pluck/marimba-like note. Pitch rises with the chain:
//                                   chain = (state.multiplier - 1) x 5 + state.comboStep   (capped at 14)
//                                   pitch factor = 1 + CONFIG.audio.catchPitchStep x chain
//   EVENTS.CATCH (type golden)      3-note chime chord (major triad), sparkle
//   EVENTS.CATCH (type rotten)      dull "bonk", short
//   EVENTS.CATCH (type shield)      soft wooden "tok" + rising shimmer
//   EVENTS.DROP_SPAWN (coconuts)    (step 5a) a falling WHISTLE that says which kind it is, quiet: normal = mid, falling; slow = low and long
//                                   (it starts when the coconut lets go); fast = high and short. At most two whistles per 0.15 s.
//   EVENTS.RING_LOCK (late)         (step 5a) a small "click" when a late-lock coconut's spot locks
//   EVENTS.DRIFT_START              (step 5a) a soft wind swish when a drifter's spot starts to slide
//   EVENTS.DROP_LAND (type coconut) low thud
//   EVENTS.HIT                      heavy thump + music duck CONFIG.audio.duckOnHitDb for CONFIG.audio.duckMs
//                                   (shielded: a hollow wooden knock instead, no duck)
//   EVENTS.NEAR_MISS                quick high ping
//   EVENTS.PERFECT_DODGE            slow "whoomp" swell (pitch down then up over 0.3 s)
//   EVENTS.DASH                     short noise whoosh (bandpass sweep 400 -> 1200 Hz), on the frame of the press
//   EVENTS.FOOTSTEP                 (step 3) a short low thump + a soft filtered tick; louder with speed, +/- 5% pitch and volume,
//                                   scaled by TUNE.stepVolume; quiet on purpose
//   EVENTS.SKID                     (step 3) a short scrape (filtered noise)
//   EVENTS.SNAP_TURN                (step 3) a light "fwip" (rising filtered noise + a soft blip)
//   EVENTS.COMBO_CHANGE stepUp      rising two-note blip
//   EVENTS.MADNESS_START            short drum-roll fill
//   EVENTS.HAPPENING_WARN           one beat of near-silence: music gain to -24 dB for 0.25 s, then back
//   EVENTS.BEST_PASSED              celebratory 4-note arpeggio
//   EVENTS.COUNTDOWN                n>0 tick, n=0 higher "go"
//   EVENTS.RUN_END                  descending 3-note drop
//
// RULES: never throw; if Web Audio is missing, every function is a silent no-op.
// Keep total generated node count low (disconnect nodes when done). No setInterval; time sounds with
// AudioContext.currentTime.

import { CONFIG, TUNE } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, on } from '../core/events.js';

// STEP 1 SCOPE: all the synthesized sound effects, ported from version 0's tiny synth and extended to the event
// list above. The MUSIC LOOP (fetch + decode, adaptive filter, ducking) arrives in step 9: unlockAudio() does not
// fetch musicUrl yet, and setMusicEnabled() only remembers the setting.

let ac = null;
let master = null;
let noiseBuf = null;
let sfxOn = true;
let musicOn = true;
let musicUrl = '';
let beatTimer = 0;

// footsteps: ONE pre-rendered buffer (thump + soft tick), played through 3 gain nodes that are reused round-robin; at most one step
// per 0.12 s, so fast running can never turn into a rattle and there is no per-step synthesis
let footBuf = null;
const footGains = [];
let footI = 0;
let lastStepAt = -1;

function makeFootBuffer() {
  const sr = ac.sampleRate;
  const n = Math.floor(sr * 0.1);
  footBuf = ac.createBuffer(1, n, sr);
  const d = footBuf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const thump = Math.sin(2 * Math.PI * (88 * t - 226 * t * t)) * Math.exp(-t * 48);   // 88 Hz sliding down to ~54 Hz
    lp += ((Math.random() * 2 - 1) - lp) * 0.35;                                         // a soft, filtered noise tick
    d[i] = thump * 0.8 + lp * Math.exp(-t * 150) * 0.28;
  }
}

function detune() {
  return 1 + (Math.random() * 2 - 1) * CONFIG.audio.detune;
}

function ready() {
  return ac && ac.state === 'running' && sfxOn;
}

// One oscillator note. `at` = seconds from now; slide = Hz change over the note.
function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0, at = 0) {
  if (!ready()) return;
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
    o.connect(g).connect(master);
    o.onended = () => g.disconnect();
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* audio must never break the game */ }
}

// A burst of band-passed noise (whoosh, drum fill).
function noise(dur, vol, from, to, at = 0) {
  if (!ready() || !noiseBuf) return;
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
    src.connect(f).connect(g).connect(master);
    src.onended = () => g.disconnect();
    src.start(t);
    src.stop(t + dur + 0.02);
  } catch { /* ignore */ }
}

export function initAudio({ musicUrl: url }) {
  musicUrl = url;
  void musicUrl;

  on(EVENTS.RUN_START, () => tone(660, 0.1, 'triangle', 0.1));

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
  on(EVENTS.DROP_LAND, (e) => { if (e.type === 'coconut') tone(120, 0.18, 'sine', 0.25, -60); });
  on(EVENTS.HIT, (e) => {
    if (e.shielded) {
      tone(310, 0.09, 'triangle', 0.2, -90);
    } else {
      tone(90, 0.25, 'sine', 0.3, -40);
      tone(220, 0.35, 'sawtooth', 0.12, -150);
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
    tone(392, 0.2, 'triangle', 0.15);
    tone(330, 0.2, 'triangle', 0.15, 0, 0.18);
    tone(262, 0.4, 'triangle', 0.15, 0, 0.36);
  });
}

export async function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = sfxOn ? 1 : 0;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      makeFootBuffer();
      for (let i = 0; i < 3; i++) { const g = ac.createGain(); g.connect(master); footGains.push(g); }
    }
    if (ac.state !== 'running') await ac.resume();
  } catch { /* stays silent */ }
}

export function setMusicEnabled(on) {
  musicOn = !!on;   // the loop itself arrives in step 9
  void musicOn;
}

export function setSfxEnabled(on) {
  sfxOn = !!on;
  if (master) master.gain.setTargetAtTime(sfxOn ? 1 : 0, ac.currentTime, 0.1);   // ~0.3 s fade, no click
}

export function updateAudio(dt) {
  // last-life heartbeat: a "lub-dub" every 0.85 s
  if (!state.heartbeat || state.screen !== 'play') { beatTimer = 0; return; }
  beatTimer -= dt;
  if (beatTimer <= 0) {
    beatTimer = 0.85;
    tone(55, 0.12, 'sine', 0.35, -10);
    tone(48, 0.12, 'sine', 0.3, -8, 0.09);
  }
}
