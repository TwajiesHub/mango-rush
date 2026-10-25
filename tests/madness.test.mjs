// Mango Rush — tests for the Madness storm table (js/play/madness.js) and the freeze budget (js/fx/freezebudget.js). Pure, no three.js.
// Run:  node tests/madness.test.mjs        (plain node, no packages)

import { CONFIG } from '../js/core/config.js';
import { createRng } from '../js/core/rng.js';
import { buildMadnessTable, resolveMadnessSpots } from '../js/play/madness.js';
import { createFreezeBudget } from '../js/fx/freezebudget.js';

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) passed++; else { failed++; console.log('FAIL', name, extra); }
}

const M = CONFIG.adrenaline.madness;
const SEP = CONFIG.drops.minSeparation;
const seedOf = (s) => s ^ M.tableSeed;

// ---- the same seed, the same storm; another seed, another storm
const a = buildMadnessTable(createRng(seedOf(123)), M.spots, M.tableSeconds);
const b = buildMadnessTable(createRng(seedOf(123)), M.spots, M.tableSeconds);
const c = buildMadnessTable(createRng(seedOf(124)), M.spots, M.tableSeconds);
check('the same seed gives an identical table', JSON.stringify(a) === JSON.stringify(b));
check('another seed gives another table', JSON.stringify(a) !== JSON.stringify(c));
check('about 40 spots over 20 s (2 a second)', a.length === 40 && a[a.length - 1].at < M.tableSeconds + 1e-9 && a[0].at >= 0);
check('spots are in time order, about 0.5 s apart', a.every((s, i) => i === 0 || (s.at > a[i - 1].at && s.at - a[i - 1].at < 1.0)));
check('the place is on the deck (0..1)', a.every((s) => s.a >= 0 && s.a < 1 && s.r >= 0 && s.r < 1));

// ---- a fixed number of draws: nothing the player does can move a draw
let draws = 0;
buildMadnessTable({ next: () => { draws++; return 0.5; } }, M.spots, M.tableSeconds);
check('exactly 3 draws a spot', draws === M.spots * 3, String(draws));
let draws2 = 0;
buildMadnessTable({ next: () => { draws2++; return (draws2 * 0.37) % 1; } }, M.spots, M.tableSeconds);
check('the same number whatever the numbers are', draws2 === draws);
// a shared rng: building the table does not depend on what was drawn from OTHER rngs (the drops rng, the happenings rng)
const drops = createRng(123);
for (let i = 0; i < 500; i++) drops.next();
check('independent of the drops rng', JSON.stringify(buildMadnessTable(createRng(seedOf(123)), M.spots, M.tableSeconds)) === JSON.stringify(a));

// ---- minSeparation, on both deck shapes and many seeds
let clash = 0;
let outside = 0;
for (const [hw, hd] of [[9.3, 5.4], [5.4, 9.3], [8, 4.5]]) {
  for (let seed = 1; seed <= 200; seed++) {
    const t = buildMadnessTable(createRng(seedOf(seed)), M.spots, M.tableSeconds);
    const p = resolveMadnessSpots(t, hw, hd, SEP);
    for (let i = 0; i < p.length; i++) {
      if (Math.hypot(p[i].x / hw, p[i].z / hd) > 1) outside++;
      for (let j = i - 1; j >= 0 && t[i].at - t[j].at < 3; j--) if (Math.hypot(p[i].x - p[j].x, p[i].z - p[j].z) < SEP - 1e-9) clash++;
    }
  }
}
check('spots launched within 3 s of each other keep minSeparation (600 storms)', clash === 0, String(clash));
check('every spot is on the walkable deck', outside === 0, String(outside));
check('resolving uses no randomness', JSON.stringify(resolveMadnessSpots(a, 9, 5, SEP)) === JSON.stringify(resolveMadnessSpots(a, 9, 5, SEP)));

// ---- the freeze budget: never above 200 ms in any 1 s window, however many ask
const A = CONFIG.adrenaline;
function simulate(rngSeed, frameMs) {
  const r = createRng(rngSeed);
  const fb = createFreezeBudget({ windowSec: A.freezeWindow / 1000, capSec: A.freezeCap / 1000 });
  const dt = frameMs / 1000;
  const frozen = [];
  for (let f = 0; f < 60 * 30; f++) {                // 30 s of frames
    if (r.next() < 0.18) fb.request([0.016, 0.02, 0.03, 0.04, 0.06, 0.08, 0.1, 0.18][Math.floor(r.next() * 8)]);
    frozen.push(fb.tick(dt) ? dt : 0);
  }
  const win = Math.round(1 / dt);
  let worst = 0;
  let sum = 0;
  for (let i = 0; i < frozen.length; i++) {
    sum += frozen[i];
    if (i >= win) sum -= frozen[i - win];
    worst = Math.max(worst, sum);
  }
  return worst;
}
let worstAll = 0;
for (let s = 1; s <= 40; s++) for (const ms of [8, 16.7, 33]) worstAll = Math.max(worstAll, simulate(s, ms));
check('freezes never exceed 200 ms in any 1 s window (120 runs)', worstAll <= A.freezeCap / 1000 + 1e-6, worstAll.toFixed(4));
check('the budget is really used (they do freeze)', worstAll > 0.15, worstAll.toFixed(4));

{
  const fb = createFreezeBudget({ windowSec: 1, capSec: 0.2 });
  fb.request(0.1);
  fb.request(0.05);
  check('a shorter freeze does not stack on a longer one', Math.abs(fb.left - 0.1) < 1e-9);
  fb.request(0.18);
  check('a longer freeze replaces it (extends to its length)', Math.abs(fb.left - 0.18) < 1e-9);
  fb.request(0.5);
  check('and is trimmed to the 200 ms cap', Math.abs(fb.left - 0.2) < 1e-9);
  let t = 0;
  while (fb.tick(0.005)) t += 0.005;
  check('it runs for the granted time', Math.abs(t - 0.2) < 0.006);
  fb.request(0.1);
  check('no more in the same second', fb.left === 0);
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
