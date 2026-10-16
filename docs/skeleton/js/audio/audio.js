// Mango Rush — music and sound effects.            OWNER: Claude Code  ·  STATUS: stub
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
//   EVENTS.DROP_LAND (type coconut) low thud
//   EVENTS.HIT                      heavy thump + music duck CONFIG.audio.duckOnHitDb for CONFIG.audio.duckMs
//                                   (shielded: a hollow wooden knock instead, no duck)
//   EVENTS.NEAR_MISS                quick high ping
//   EVENTS.PERFECT_DODGE            slow "whoomp" swell (pitch down then up over 0.3 s)
//   EVENTS.DASH                     short noise whoosh (bandpass sweep 400 -> 1200 Hz)
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

export function initAudio({ musicUrl }) {}
export async function unlockAudio() {}
export function setMusicEnabled(on) {}
export function setSfxEnabled(on) {}
export function updateAudio(dt) {}
