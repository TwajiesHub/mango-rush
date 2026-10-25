// Mango Rush — tests for the music loop window (js/audio/loopwindow.js) and the beat clock (js/audio/beatclock.js). Pure, no Web Audio.
// Run:  node tests/audio.test.mjs        (plain node, no packages)

import { CONFIG } from '../js/core/config.js';
import { loopWindow, LAME_DELAY_SAMPLES } from '../js/audio/loopwindow.js';
import { createBeatClock } from '../js/audio/beatclock.js';

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) passed++; else { failed++; console.log('FAIL', name, extra); }
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const M = CONFIG.music;
check('CONFIG.music is the kit loop', M.url === 'assets/music/loop.mp3' && near(M.bpm, 104.99) && near(M.loopSeconds, 54.862) && M.bars === 24);
check('24 bars at that tempo is the loop length', near((M.bars * 4 * 60) / M.bpm, M.loopSeconds, 0.01), String((M.bars * 4 * 60) / M.bpm));

// ---- the loop window: both decoder cases
let w = loopWindow(54.862, 54.862);
check('exact: a gapless decoder (the same length)', w.kind === 'exact' && w.loopStart === 0 && near(w.loopEnd, 54.862));
w = loopWindow(54.8655, 54.862);
check('exact: within 5 ms', w.kind === 'exact' && w.loopStart === 0);
w = loopWindow(54.862 + 1105 / 44100, 54.862);
check('padded: the decoder kept the LAME delay', w.kind === 'padded' && near(w.loopStart, 1105 / 44100) && near(w.loopEnd, 1105 / 44100 + 54.862));
check('the padding constant is LAME\'s usual 1105 samples', LAME_DELAY_SAMPLES === 1105);
w = loopWindow(54.862 + 0.05, 54.862);
check('padded: 50 ms longer', w.kind === 'padded');
w = loopWindow(54.862 + 0.06, 54.862);
check('padded: 60 ms longer', w.kind === 'padded');
check('the padded window never runs past the buffer', loopWindow(54.862 + 1105 / 44100, 54.862).loopEnd <= 54.862 + 1105 / 44100 + 1e-9);
w = loopWindow(60, 54.862);
check('other: an unknown file loops from 0 and never past the loop length', w.kind === 'other' && w.loopStart === 0 && near(w.loopEnd, 54.862));
w = loopWindow(30, 54.862);
check('other: a short buffer loops all of it', w.kind === 'other' && near(w.loopEnd, 30));

// ---- the beat clock
const out = { beat: 0, phase: 0 };
const mk = () => createBeatClock({ bpm: M.bpm, loopSeconds: M.loopSeconds });
let c = mk();
c.value(out);
check('not started: the fallback clock at 105 BPM starts at beat 0', out.beat === 0 && out.phase === 0 && !c.running);
c.advance(60 / 105 * 3.5, 1);
c.value(out);
check('fallback: 3.5 beats after 3.5 x (60/105) s', out.beat === 3 && near(out.phase, 0.5, 1e-6), JSON.stringify(out));
c.start();
c.value(out);
check('start: the music clock begins at beat 0', out.beat === 0 && out.phase === 0 && c.running);
c.advance(60 / M.bpm * 4, 1);
c.value(out);
check('music at rate 1: 4 beats after 4 beat-lengths', out.beat === 4 && out.phase < 1e-6 || (out.beat === 3 && out.phase > 1 - 1e-6), JSON.stringify(out));
c = mk(); c.start();
c.advance(60 / M.bpm * 2.25, 1.06);
c.value(out);
check('music at rate 1.06: 2.25 beat-lengths of audio time are 2.385 beats', out.beat === 2 && near(out.phase, 0.385, 1e-6), JSON.stringify(out));
c = mk(); c.start();
c.advance(M.loopSeconds - 0.001, 1);
c.value(out);
const before = out.beat + out.phase;
c.advance(0.002, 1);
c.value(out);
const after = out.beat + out.phase;
check('the loop wrap does not jump the beat (the loop is a whole number of beats)', after > before && after - before < 0.01, `${before} -> ${after}`);
check('the beat keeps counting through loops (96 beats a loop)', out.beat >= 95 && out.beat <= 97, String(out.beat));
c = mk(); c.start(); c.advance(10, 1); c.stop(); c.value(out); const bFall = out.beat + out.phase;
check('stopped: back on the fallback clock (it kept real time)', !c.running && near(bFall, (10 * 105) / 60, 1e-6), String(bFall));
let negative = false;
c = mk(); c.start();
for (const dt of [0, -1, 0.016, NaN, 0.5]) { c.advance(dt, 1.02); c.value(out); if (!(out.phase >= 0 && out.phase < 1)) negative = true; }
check('bad or zero time steps never break the phase', !negative);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
