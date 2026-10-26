// Mango Rush — tests for the journey timeline (core/journeymath.js) and the saved-best version reset (core/store.js).
// Run:  node tests/journey.test.mjs        (plain node, no packages)

import { CONFIG } from '../js/core/config.js';
import { placeIndexAt, phaseBlend, wetFrac, sunDrop, flashAllowed } from '../js/core/journeymath.js';

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) passed++; else { failed++; console.log('FAIL', name, extra); }
}

const J = CONFIG.journey;
const names = J.places.map((p) => p.id);

// ---- places come in order, once each
check('six places in the brief order', names.join(',') === 'makoko,mangroves,bridge,waterfront,city,open');
let prev = -1;
let ok = true;
for (let t = 0; t <= 300; t += 0.5) {
  const k = placeIndexAt(t, J.places);
  if (k < prev || k - prev > 1) ok = false;
  prev = k;
}
check('the place index only ever steps up by one', ok);
check('place at the start and at the boundaries', placeIndexAt(0, J.places) === 0 && placeIndexAt(34.9, J.places) === 0 && placeIndexAt(35, J.places) === 1 && placeIndexAt(210, J.places) === 5 && placeIndexAt(900, J.places) === 5);

// ---- phases blend over 4 s
const ph = CONFIG.phases;
check('no blend at the start', phaseBlend(0, ph, J.blend).u === 1 && phaseBlend(0, ph, J.blend).a === 0);
const b0 = phaseBlend(60, ph, J.blend);
check('the blend starts at the boundary', b0.a === 0 && b0.b === 1 && b0.u === 0);
const b2 = phaseBlend(62, ph, J.blend);
check('halfway through the blend', Math.abs(b2.u - 0.5) < 1e-9);
check('done after the blend time', phaseBlend(60 + J.blend, ph, J.blend).u === 1 && phaseBlend(100, ph, J.blend).u === 1);
let mono = true;
let last = -1;
for (let t = 60; t < 64; t += 0.05) { const u = phaseBlend(t, ph, J.blend).u; if (u < last) mono = false; last = u; }
check('the blend is smooth and rises', mono);
check('night and midnight pick the right phases', phaseBlend(150, ph, J.blend).b === 2 && phaseBlend(215, ph, J.blend).b === 3);
check('every phase has a palette', ph.every((p) => J.palettes[p.id] && J.palettes[p.id].sky.length === 4));

// ---- the wet band
check('dry before dusk', wetFrac(0, J.wet) === 0 && wetFrac(60, J.wet) === 0);
check('widest from midnight', Math.abs(wetFrac(210, J.wet) - J.wet.frac) < 1e-12 && Math.abs(wetFrac(500, J.wet) - J.wet.frac) < 1e-12);
check('grows with time', wetFrac(150, J.wet) > wetFrac(100, J.wet) && wetFrac(100, J.wet) > 0);
check('about 18% of the radius at most', J.wet.frac <= 0.185 && J.wet.frac >= 0.175);
check('slippery, never forbidden', J.wet.grip > 0.35 && J.wet.grip < 1);

// ---- the sun sinks over dusk
check('the sun is up at the start, down after dusk', sunDrop(0, J.sunSink) === 0 && Math.abs(sunDrop(150, J.sunSink) - J.sunSink.drop) < 1e-12 && sunDrop(105, J.sunSink) > 0);

// ---- fireworks never flash more than 3 times a second
check('a flash waits at least minGap', !flashAllowed(10, 10.5, J.fireworks.minGap) && flashAllowed(10, 11.3, J.fireworks.minGap));
check('minGap keeps flashes under 3 a second', 1 / J.fireworks.minGap < 3 && J.fireworks.every[0] >= J.fireworks.minGap);
check('the flash is soft', J.fireworks.flash <= 0.12);

// ---- pure: the same time, the same answer
check('pure', JSON.stringify(phaseBlend(77.7, ph, J.blend)) === JSON.stringify(phaseBlend(77.7, ph, J.blend)) && placeIndexAt(77.7, J.places) === placeIndexAt(77.7, J.places));

// ---- the saved best resets once when the scoring rules change (SCORE_VERSION)
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.matchMedia = () => ({ matches: false });
const store = await import('../js/core/store.js');
const key = 'mango-rush:u1:progress';
mem[key] = JSON.stringify({ best: 64525, dailyBest: 5000, dailyDate: new Date().toISOString().slice(0, 10), totalMangoes: 321, runs: 9, warmupDone: true });
store.initStore('u1');
let p = store.loadProgress();
check('an old best (no version) resets to 0', p.best === 0 && p.dailyBest === 0);
check('other progress is kept', p.totalMangoes === 321 && p.runs === 9 && p.warmupDone === true);
check('the new version is saved', JSON.parse(mem[key]).scoreVersion === store.SCORE_VERSION && store.SCORE_VERSION === 3);
store.recordRun({ mode: 'free', score: 1200, mangoes: 3 });
store.initStore('u1');
p = store.loadProgress();
check('after the reset a new best sticks (it resets only once)', p.best === 1200);
mem[key] = JSON.stringify({ scoreVersion: 1, best: 777, dailyBest: 0, dailyDate: null, totalMangoes: 0, runs: 0, warmupDone: false });
store.initStore('u1');
check('an older version also resets', store.loadProgress().best === 0);
store.initStore('fresh');
check('a brand new player starts at 0 with the version set', store.loadProgress().best === 0 && JSON.parse(mem['mango-rush:fresh:progress'] || '{"scoreVersion":3}').scoreVersion === 3);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
