// Mango Rush — tests for the step 5a pacing helpers: the coconut shuffle bag (core/bag.js) and waveAt() (core/config.js).
// Run:  node tests/pacing.test.mjs        (plain node, no packages)

import { createDealer, TYPES } from '../js/core/bag.js';
import { CONFIG, waveAt } from '../js/core/config.js';
import { createRng } from '../js/core/rng.js';

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) passed++; else { failed++; console.log('FAIL', name, extra); }
}

const C = CONFIG.coconuts;
const phases = ['golden', 'dusk', 'night', 'midnight'];

// ---- the bag mixes: the first 8 deals of a fresh bag are exactly the phase mix (no late-lock live, no run rule needed to skip)
for (const ph of phases) {
  const d = createDealer(C.bags, C.maxRun);
  const rng = createRng(7);
  const got = {};
  for (let i = 0; i < 8; i++) { const t = d.deal(rng, ph, false); got[t] = (got[t] || 0) + 1; }
  let same = true;
  for (const t of TYPES) if ((got[t] || 0) !== (C.bags[ph][t] || 0)) same = false;
  check(`bag mix ${ph}`, same, JSON.stringify(got));
  const total = Object.values(C.bags[ph]).reduce((a, b) => a + b, 0);
  check(`bag has 8 cards ${ph}`, total === 8, String(total));
}

// ---- 200 coconuts: no run longer than maxRun, over many seeds and across phase changes
for (let seed = 1; seed <= 40; seed++) {
  const d = createDealer(C.bags, C.maxRun);
  const rng = createRng(seed);
  let last = null;
  let run = 0;
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const ph = phases[Math.min(3, Math.floor(i / 50))];
    const t = d.deal(rng, ph, false);
    run = t === last ? run + 1 : 1;
    last = t;
    worst = Math.max(worst, run);
  }
  check(`no run over ${C.maxRun} (seed ${seed})`, worst <= C.maxRun, `worst run ${worst}`);
}

// ---- a late-lock is never dealt while one is live
{
  const d = createDealer(C.bags, C.maxRun);
  const rng = createRng(3);
  let late = 0;
  for (let i = 0; i < 300; i++) if (d.deal(rng, 'midnight', true) === 'late') late++;
  check('no late-lock while one is live', late === 0, String(late));
  // and they do come when none is live
  const d2 = createDealer(C.bags, C.maxRun);
  let late2 = 0;
  for (let i = 0; i < 80; i++) if (d2.deal(rng, 'midnight', false) === 'late') late2++;
  check('late-locks are dealt when none is live', late2 > 10, String(late2));
}

// ---- determinism: the same seed gives the same deals, and the rng is only used by refills
{
  const a = createDealer(C.bags, C.maxRun);
  const b = createDealer(C.bags, C.maxRun);
  const ra = createRng(99);
  const rb = createRng(99);
  let same = true;
  for (let i = 0; i < 100; i++) if (a.deal(ra, 'night', i % 7 === 0) !== b.deal(rb, 'night', i % 7 === 0)) same = false;
  check('same seed, same deals', same);
  check('same rng position afterwards', ra.next() === rb.next());
}

// ---- waveAt
{
  const W = CONFIG.waves;
  const period = W.length + W.breather;
  check('t=0 is calm', waveAt(0).intensity === 1 && !waveAt(0).breather);
  let maxI = 0;
  let sawBreather = 0;
  for (let t = 0; t < 400; t += 0.25) {
    const w = waveAt(t);
    maxI = Math.max(maxI, w.intensity);
    if (w.breather) sawBreather++;
    if (w.intensity < 1 || w.intensity > 1 + W.peak + 1e-9) check(`intensity in range at ${t}`, false, String(w.intensity));
    const inBreather = t - Math.floor(t / period) * period >= W.length;
    if (w.breather !== inBreather) check(`breather flag at ${t}`, false);
  }
  check('peak reaches about +25%', maxI > 1 + W.peak * 0.95, String(maxI));
  check('breathers happen', sawBreather > 0);
  check('breather length', Math.abs(sawBreather * 0.25 - Math.floor(400 / period) * W.breather) < W.breather + 0.5, String(sawBreather * 0.25));
  check('wave index counts up', waveAt(period + 1).index === 1 && waveAt(2 * period + 1).index === 2);
  check('intensity rises along a wave', waveAt(period * 3 + 20).intensity > waveAt(period * 3 + 5).intensity);
  check('the first seconds are eased in', waveAt(2).intensity < 1 + W.peak * (2 / W.length) * 0.5);
  check('waveAt is pure', JSON.stringify(waveAt(77.7)) === JSON.stringify(waveAt(77.7)));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
