// Tests for js/core/frameclock.js (pure maths). Run: node tests/frameclock.test.mjs
import { createFrameClock } from '../js/core/frameclock.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.log(`FAIL: ${name} ${extra}`); }
}

// feed a list of rAF deltas (ms); returns { renders: [{ts, dt, interval}], clock }
function run(deltas, opts = {}) {
  const clock = createFrameClock(opts);
  let ts = 1000;
  const renders = [];
  let t = clock.tick(ts);
  if (t.render) renders.push({ ts, dt: t.dt, interval: t.intervalMs });
  for (const d of deltas) {
    ts += d;
    t = clock.tick(ts);
    if (t.render) renders.push({ ts, dt: t.dt, interval: t.intervalMs });
  }
  return { renders, clock, end: ts };
}
const rep = (n, ...pattern) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);
const spread = (a) => Math.max(...a) - Math.min(...a);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// 1. a steady 60 Hz screen: every callback renders, dt is ~1/60, no cap
{
  const { renders, clock } = run(rep(300, 16.667));
  check('60Hz renders every callback', renders.length === 301);
  check('60Hz dt ~ 1/60', Math.abs(renders[200].dt - 1 / 60) < 1e-4);
  const s = clock.stats();
  check('60Hz not capped', s.capped === false);
  check('60Hz refresh measured', Math.abs(s.refreshHz - 60) < 1);
  check('60Hz fps ~ 60', Math.abs(s.fps - 60) < 1);
}

// 2. a healthy 120 Hz screen: no cap, every callback renders
{
  const { renders, clock } = run(rep(600, 8.333));
  check('120Hz healthy: not capped', clock.stats().capped === false);
  check('120Hz healthy: renders every callback', renders.length === 601);
}

// 3. a 120 Hz screen with a weak GPU, simulated as a closed loop: a frame costs 6-12 ms (jittery), a callback only runs when
//    the page is free, a skipped callback costs nothing. Uncapped this alternates 8 ms and 17 ms steps; capped it is an even 17 ms.
function simulate(refresh, costMin, costMax, seconds, opts) {
  const clock = createFrameClock(opts);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let vsync = 1;
  let freeAt = 0;
  const renders = [];
  while (vsync * refresh < seconds * 1000) {
    const ts = vsync * refresh;
    if (ts >= freeAt) {
      const t = clock.tick(ts);
      if (t.render) { renders.push({ ts, dt: t.dt, interval: t.intervalMs }); freeAt = ts + costMin + rnd() * (costMax - costMin); }
    }
    vsync++;
  }
  return { renders, clock };
}
{
  const free = simulate(8.333, 6, 12, 6, { forceCap: false });
  const s = free.clock.stats();
  check('weak 120Hz: capped by itself', s.capped === true);
  check('weak 120Hz: cap is about 60 fps', Math.abs(s.capFps - 60) < 1.5, `capFps=${s.capFps}`);
  const late = free.renders.filter((r) => r.ts > 4000).map((r) => r.interval);
  check('weak 120Hz: late intervals even', late.length > 40 && spread(late) < 1.5, `spread=${spread(late)}`);
  check('weak 120Hz: ~60 fps after the cap', Math.abs(1000 / mean(late) - 60) < 1.5, `fps=${1000 / mean(late)}`);
  // the same load WITHOUT the cap would judder: steps of 8 ms and 17 ms
  const early = free.renders.filter((r) => r.ts > 700 && r.ts < 1000).map((r) => r.interval);
  void early;
}

// 4. a known weak GPU (forceCap): capped as soon as the refresh rate is known, even when the frames are fine
{
  const { renders, clock } = run(rep(400, 8.333), { forceCap: true });
  check('forceCap: capped on a fast screen', clock.stats().capped === true);
  const late = renders.slice(-100).map((r) => r.interval);
  check('forceCap: even intervals', spread(late) < 1.5, `spread=${spread(late)}`);
  check('forceCap: ~60 fps', Math.abs(1000 / mean(late) - 60) < 1.5);
  // and on a 60 Hz screen forceCap changes nothing
  const r60 = run(rep(200, 16.667), { forceCap: true });
  check('forceCap on 60Hz: not capped', r60.clock.stats().capped === false && r60.renders.length === 201);
}

// 5. 144 Hz capped: every 2nd refresh = 72 fps (an even integer ratio, never uneven 2-3 patterns)
{
  const { renders, clock } = run(rep(600, 6.944), { forceCap: true });
  const late = renders.slice(-100).map((r) => r.interval);
  check('144Hz: cap on', clock.stats().capped === true);
  check('144Hz: even', spread(late) < 1.5, `spread=${spread(late)}`);
  check('144Hz: 72 fps', Math.abs(1000 / mean(late) - 72) < 1.5, `fps=${1000 / mean(late)}`);
}

// 6. the cap, once on, never turns off (no flip-flop) even when frames become fast and steady
{
  const { clock } = run([...rep(400, 8.333, 25, 8.333, 25), ...rep(800, 16.667)]);
  check('cap stays on', clock.stats().capped === true);
}

// 7. dt smoothing: uneven real steps give an even dt, and the simulated time matches real time
{
  const deltas = rep(400, 14, 19, 15, 18, 16, 18);   // judder around 16.7 ms on a 60 Hz screen (no cap)
  const { renders } = run(deltas);
  const raw = renders.slice(20).map((r) => r.interval);
  const dts = renders.slice(20).map((r) => r.dt * 1000);
  check('dt smoother than raw', spread(dts) < spread(raw) * 0.6, `dt spread=${spread(dts)} raw spread=${spread(raw)}`);
  check('dt sums to real time', Math.abs(mean(dts) - mean(raw)) < 0.5, `${mean(dts)} vs ${mean(raw)}`);
  check('dt in range', dts.every((x) => x > 4 && x < 50));
}

// 8. a hitch (tab hidden for 3 s) never feeds a giant dt to the game
{
  const { renders } = run([...rep(100, 16.667), 3000, ...rep(50, 16.667)]);
  check('hitch: dt capped', renders.every((r) => r.dt <= 0.05));
  const after = renders[102];
  check('hitch: next dt sane', after.dt < 0.03, `dt=${after.dt}`);
}

// 9. an outlier among steady frames is clamped
{
  const { renders } = run([...rep(100, 16.667), 90, ...rep(50, 16.667)]);
  const worst = Math.max(...renders.map((r) => r.dt)) * 1000;
  check('outlier clamped', worst < 40, `worst dt=${worst}`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
