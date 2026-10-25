// Mango Rush — tests for the happenings' timeline (js/play/timeline.js: pure, no three.js, no DOM).
// Run:  node tests/happenings.test.mjs        (plain node, no packages)

import { CONFIG } from '../js/core/config.js';
import { createRng } from '../js/core/rng.js';
import { buildTimeline, activeAt, windAt, dropsHeldAt, holdReady, nextBat, darkAt, upcoming } from '../js/play/timeline.js';

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) passed++; else { failed++; console.log('FAIL', name, extra); }
}

const H = CONFIG.happenings;
const B = CONFIG.bat;

// ---- the same seed, the same timeline; different seeds, different bats
const a = buildTimeline(createRng(123));
const b = buildTimeline(createRng(123));
const c = buildTimeline(createRng(124));
check('the same seed gives an identical timeline', JSON.stringify(a) === JSON.stringify(b));
check('different seeds give different bat times', JSON.stringify(a.bats.map((x) => x.t)) !== JSON.stringify(c.bats.map((x) => x.t)));
check('different seeds give different gust directions and shower spots', a.gusts[0].angle !== c.gusts[0].angle && a.showers[0].spots[0].a !== c.showers[0].spots[0].a);

// ---- a fixed number of draws, whatever happens to the bats (the Daily Run order never changes)
let draws = 0;
const counting = { next: () => { draws++; return 0.5; } };
buildTimeline(counting);
check('a fixed number of draws', draws === H.gusts.length + H.showers.length * H.showerCount * 3 + B.count * 3, String(draws));
let draws2 = 0;
buildTimeline({ next: () => { draws2++; return draws2 % 7 / 7; } });
check('the same number whatever the numbers are', draws2 === draws);

// ---- the scripted happenings, in order, never overlapping
const s = a.scripted;
check('the brief\'s times', s.some((x) => x.id === 'bridge' && x.start === 86 && x.end === 96) && s.filter((x) => x.id === 'gust').map((x) => x.start).join() === '120,180'
  && s.filter((x) => x.id === 'shower').map((x) => x.start).join() === '98,152,215' && s.some((x) => x.id === 'bigone' && x.start === 207));
let overlap = false;
for (let i = 1; i < s.length; i++) if (s[i].start < s[i - 1].end) overlap = true;
check('no two happenings overlap', !overlap);
check('each has a warning 2 s ahead', s.every((x) => x.warnAt === x.start - H.warnTime));

// ---- no bat within 4 s of a scripted happening, over many seeds
let near = 0;
let late = 0;
for (let seed = 1; seed <= 200; seed++) {
  const tl = buildTimeline(createRng(seed));
  for (const bat of tl.bats) {
    if (bat.t < B.from) late++;
    for (const x of tl.scripted) {
      const from = (x.id === 'bigone' ? H.bigone.holdFrom : x.start) - B.buffer;
      const to = x.end + B.buffer;
      if (bat.t - B.warn < to && bat.t + B.swoop > from) near++;
    }
  }
}
check('no bat within 4 s of a scripted happening (200 seeds)', near === 0, String(near));
check('no bat before dusk', late === 0);
const gapsOk = a.bats.every((x, i) => i === 0 || x.t > a.bats[i - 1].t);
check('bats come in order', gapsOk && a.bats.length === B.count);
check('bats are 25-40 s apart unless one was moved after a happening', a.bats.slice(1).every((x, i) => x.t - a.bats[i].t >= B.every[0] - 1e-9));
check('nextBat finds the first bat', nextBat(a, 0) === a.bats[0] && nextBat(a, a.bats[0].t + 5) === a.bats[1]);

// ---- the wind
const w = { x: 0, z: 0 };
let maxW = 0;
let outsideNonZero = 0;
for (let t = 0; t < 260; t += 0.05) {
  windAt(a, t, w);
  const m = Math.hypot(w.x, w.z);
  maxW = Math.max(maxW, m);
  const inGust = a.gusts.some((g) => t >= g.start && t < g.end);
  if (!inGust && m !== 0) outsideNonZero++;
}
check('windAt is zero outside the gusts', outsideNonZero === 0);
check('windAt is never above 1.2 and reaches it', maxW <= H.gustStrength + 1e-9 && maxW > H.gustStrength - 1e-6, String(maxW));
windAt(a, 120.25, w);
check('it eases in over 0.5 s', Math.hypot(w.x, w.z) > 0 && Math.hypot(w.x, w.z) < H.gustStrength);
let sideways = true;
for (let seed = 1; seed <= 200; seed++) {
  const tl = buildTimeline(createRng(seed));
  for (const g of tl.gusts) {
    const deg = ((g.angle * 180) / Math.PI + 360) % 360;
    if (!(deg <= 30 || deg >= 330 || (deg >= 150 && deg <= 210))) sideways = false;
  }
}
check('gusts blow mostly sideways (within 30 degrees of left or right)', sideways);

// ---- held drops
check('drops are held in the Big One window', dropsHeldAt(a, 206) && dropsHeldAt(a, 210.9) && !dropsHeldAt(a, 205.9) && !dropsHeldAt(a, 211));
check('drops are held in the shower windows', dropsHeldAt(a, 98) && dropsHeldAt(a, 100.9) && !dropsHeldAt(a, 101.1) && dropsHeldAt(a, 152.5) && dropsHeldAt(a, 216));
check('not held elsewhere', [0, 30, 60, 90, 110, 130, 190, 230].every((t) => !dropsHeldAt(a, t)));
check('nothing launches during the Big One', holdReady(a, 208, 1, false) === H.bigone.holdTo && holdReady(a, 206, 1, true) === H.bigone.holdTo);
check('a coconut would not land in a shower: it waits', holdReady(a, 97.5, 1.2, true) + 1.2 >= 101.5 - 1e-9);
check('a coconut that lands before the shower is left alone', holdReady(a, 96, 1, true) === 96);
check('mangoes are not held by a shower', holdReady(a, 99, 1, false) === 99);
check('a coconut after the shower is left alone', holdReady(a, 102, 1, true) === 102);

// ---- Lights out
check('dark only under the bridge, with a 1 s fade', darkAt(80) === 0 && darkAt(86) === 0 && darkAt(86.5) > 0 && darkAt(86.5) < 1 && darkAt(90) === 1 && darkAt(95.5) > 0 && darkAt(95.5) < 1 && darkAt(96) === 0 && darkAt(100) === 0);
check('upcoming and activeAt', upcoming(a, 0).id === 'bridge' && activeAt(a, 90).id === 'bridge' && activeAt(a, 110) === null && upcoming(a, 100).id === 'gust' && activeAt(a, 123).id === 'gust');
// ---- the shower's spots launch in time order (happenings.js walks them with a counter)
let sorted = true;
for (let seed = 1; seed <= 100; seed++) {
  const tl = buildTimeline(createRng(seed));
  for (const sh of tl.showers) for (let i = 1; i < sh.spots.length; i++) if (sh.spots[i].at < sh.spots[i - 1].at) sorted = false;
}
check('each shower\'s spots are sorted by time (100 seeds)', sorted);
{
  const sh = buildTimeline(createRng(77)).showers[0];
  const launched = [];
  let idx = 0;
  for (let t = 0; t <= H.showerLength; t += 1 / 60) {          // the same walk happenings.js does every frame
    while (idx < sh.spots.length && t >= sh.spots[idx].at) { launched.push(sh.spots[idx].at); idx++; }
  }
  check('the counter walk launches every spot, in time order', launched.length === sh.spots.length && launched.every((v, i) => i === 0 || v >= launched[i - 1]));
}
check('about 10 shower mangoes each', a.showers.every((x) => x.spots.length === 10 && x.spots.every((p) => p.at >= 0 && p.at <= H.showerLength)));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
