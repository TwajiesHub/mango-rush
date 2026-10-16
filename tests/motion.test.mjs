// Tests for js/core/motion.js (42 checks). Run from the repo root:  node tests/motion.test.mjs
// Plain Node (18+), no packages. Exit code 0 = all passed.
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(process.argv[2] || path.join(here, '..', 'js', 'core', 'motion.js'));
const M = await import(pathToFileURL(file).href);

// Independent reference ("oracle") used by the stress checks to compare against exact answers.
const R = (() => {
function springStep(s, target, freq, zeta, dt) {
  if (dt <= 0) return s;
  const w = 2 * Math.PI * freq, x0 = s.x - target, v0 = s.v;
  let x, v;
  if (Math.abs(zeta - 1) < 1e-4) {
    const A = x0, B = v0 + w * x0, e = Math.exp(-w * dt);
    x = (A + B * dt) * e; v = (B - w * (A + B * dt)) * e;
  } else if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * w * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt);
    const A = x0, B = (v0 + zeta * w * x0) / wd;
    x = e * (A * c + B * sn);
    v = e * ((-zeta * w) * (A * c + B * sn) + (-A * wd * sn + B * wd * c));
  } else {
    const r = Math.sqrt(zeta * zeta - 1), r1 = -w * (zeta - r), r2 = -w * (zeta + r);
    const c2 = (v0 - r1 * x0) / (r2 - r1), c1 = x0 - c2, e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
    x = c1 * e1 + c2 * e2; v = c1 * r1 * e1 + c2 * r2 * e2;
  }
  s.x = x + target; s.v = v; return s;
}
const approach = (c, t, d) => (c < t ? Math.min(c + d, t) : Math.max(c - d, t));
function accelerateVelocity(v, d, p, dt) {
  const dl = Math.hypot(d.x, d.z); let rate = p.accel;
  if (dl < 1e-9) rate = p.decel; else if (v.x * d.x + v.z * d.z < 0) rate = p.turnAccel;
  const dx = d.x - v.x, dz = d.z - v.z, L = Math.hypot(dx, dz), m = rate * dt;
  if (L <= m || L === 0) { v.x = d.x; v.z = d.z; } else { v.x += dx / L * m; v.z += dz / L * m; }
  return v;
}
function smoothInput(c, r, rate, dt) {
  const k = 1 - Math.exp(-rate * dt); c.x += (r.x - c.x) * k; c.z += (r.z - c.z) * k;
  const L = Math.hypot(c.x, c.z); if (L > 1) { c.x /= L; c.z /= L; } return c;
}
const launchVelocity = (f, t, T, g) => ({ x: (t.x - f.x) / T, y: (t.y - f.y + 0.5 * g * T * T) / T, z: (t.z - f.z) / T });
const positionAt = (f, v, t, g) => ({ x: f.x + v.x * t, y: f.y + v.y * t - 0.5 * g * t * t, z: f.z + v.z * t });
function sweepCircle(p0, p1, r, c, R) {
  const R2 = r + R, fx = p0.x - c.x, fz = p0.z - c.z;
  const C = fx * fx + fz * fz - R2 * R2; if (C <= 0) return 0;
  const dx = p1.x - p0.x, dz = p1.z - p0.z, A = dx * dx + dz * dz; if (A === 0) return null;
  const B = 2 * (fx * dx + fz * dz), D = B * B - 4 * A * C; if (D < 0 || B >= 0) return null;
  const t = (-B - Math.sqrt(D)) / (2 * A); return t >= 0 && t <= 1 ? t : null;
}
function createStepper(fixedDt, maxSteps = 5) {
  let acc = 0;
  return { advance(dt, fn) { acc += dt; let n = 0; while (acc >= fixedDt - 1e-12 && n < maxSteps) { fn(fixedDt); acc -= fixedDt; n++; } if (n === maxSteps && acc >= fixedDt) acc = acc % fixedDt; if (acc < 0) acc = 0; return acc / fixedDt; } };
}

  return { springStep, approach, accelerateVelocity, smoothInput, launchVelocity, positionAt, sweepCircle, createStepper };
})();
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '->', e.message); } }
const near = (a, b, eps, what = '') => { if (!(Math.abs(a - b) <= eps)) throw new Error(`${what} expected ${b}, got ${a}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const fin = (x, m = '') => ok(Number.isFinite(x), 'not finite ' + m + ' ' + x);

const need = ['springStep', 'approach', 'accelerateVelocity', 'smoothInput', 'launchVelocity', 'positionAt', 'sweepCircle', 'createStepper'];
t('exports all 8 functions', () => need.forEach((n) => ok(typeof M[n] === 'function', 'missing ' + n)));

function runSpring(zeta, freq, dt, secs, x0 = 0, target = 1) {
  const s = { x: x0, v: 0 }; let max = -Infinity; const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) { M.springStep(s, target, freq, zeta, dt); max = Math.max(max, s.x); fin(s.x, 'x'); fin(s.v, 'v'); }
  return { s, max };
}
t('spring: critically damped settles, no overshoot', () => { const { s, max } = runSpring(1, 2, 1 / 60, 2); near(s.x, 1, 1e-3, 'x'); ok(max <= 1 + 1e-9, 'overshoot ' + max); });
t('spring: zeta 0.3 overshoots ~37%', () => { const { max } = runSpring(0.3, 2, 1 / 60, 2); ok(max > 1.3 && max < 1.4, 'max ' + max); });
t('spring: overdamped (zeta 2) is finite and settles', () => { const { s, max } = runSpring(2, 2, 1 / 60, 6); near(s.x, 1, 1e-2, 'x'); ok(max <= 1 + 1e-9, 'overshoot'); });
t('spring: zeta 0 (no damping) keeps oscillating, stays bounded', () => { const { s, max } = runSpring(0, 1, 1 / 60, 3.3); ok(max > 1.99 && max < 2.01, 'max ' + max); fin(s.x); });
t('spring: frame-rate independent (60 vs 144 fps, 1 s)', () => {
  for (const z of [0.3, 1, 2]) { const a = runSpring(z, 3, 1 / 60, 1).s, b = runSpring(z, 3, 1 / 144, 1).s; near(a.x, b.x, 1e-6, `x z=${z}`); near(a.v, b.v, 1e-5, `v z=${z}`); }
});
t('spring: stable with huge dt (0.5 s steps)', () => { const { s } = runSpring(1, 5, 0.5, 5); near(s.x, 1, 1e-6, 'x'); });
t('spring: mutates and returns the same object', () => { const s = { x: 0, v: 0 }; ok(M.springStep(s, 1, 2, 1, 0.1) === s, 'not same object'); ok(s.x > 0, 'did not move'); });
t('spring: dt 0 changes nothing', () => { const s = { x: 0.3, v: 2 }; M.springStep(s, 1, 2, 0.5, 0); near(s.x, 0.3, 1e-12); near(s.v, 2, 1e-12); });

t('approach', () => { near(M.approach(0, 10, 3), 3, 1e-12); near(M.approach(9, 10, 3), 10, 1e-12); near(M.approach(5, -5, 2), 3, 1e-12); near(M.approach(4, 4, 1), 4, 1e-12); });

t('accelerate: speeds up at accel rate, no overshoot', () => {
  const v = { x: 0, z: 0 }, p = { accel: 60, decel: 40, turnAccel: 120 };
  M.accelerateVelocity(v, { x: 6, z: 0 }, p, 0.05); near(v.x, 3, 1e-9, 'x@0.05');
  for (let i = 0; i < 10; i++) M.accelerateVelocity(v, { x: 6, z: 0 }, p, 0.05); near(v.x, 6, 1e-9, 'x final'); near(v.z, 0, 1e-12);
});
t('accelerate: reversing uses turnAccel', () => { const v = { x: 6, z: 0 }; M.accelerateVelocity(v, { x: -6, z: 0 }, { accel: 60, decel: 40, turnAccel: 120 }, 0.05); near(v.x, 0, 1e-9); });
t('accelerate: stopping uses decel', () => { const v = { x: 6, z: 0 }; M.accelerateVelocity(v, { x: 0, z: 0 }, { accel: 60, decel: 40, turnAccel: 120 }, 0.1); near(v.x, 2, 1e-9); });
t('accelerate: moves as a vector (diagonal)', () => {
  const v = { x: 0, z: 0 }; M.accelerateVelocity(v, { x: 3, z: 4 }, { accel: 10, decel: 10, turnAccel: 10 }, 0.1);
  near(v.x, 0.6, 1e-9, 'x'); near(v.z, 0.8, 1e-9, 'z'); ok(M.accelerateVelocity(v, { x: 3, z: 4 }, { accel: 10, decel: 10, turnAccel: 10 }, 0.1) === v, 'not same object');
});

t('smoothInput: blends toward raw and clamps length to 1', () => {
  const c = { x: 0, z: 0 }; M.smoothInput(c, { x: 1, z: 0 }, 12, 1 / 60); ok(c.x > 0 && c.x < 0.5, 'first step ' + c.x);
  for (let i = 0; i < 300; i++) M.smoothInput(c, { x: 1, z: 1 }, 12, 1 / 60);
  near(Math.hypot(c.x, c.z), 1, 1e-6, 'len'); near(c.x, Math.SQRT1_2, 1e-6, 'x');
});
t('smoothInput: frame-rate independent', () => {
  const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
  for (let i = 0; i < 6; i++) M.smoothInput(a, { x: 0.5, z: 0 }, 12, 1 / 60);
  for (let i = 0; i < 12; i++) M.smoothInput(b, { x: 0.5, z: 0 }, 12, 1 / 120);
  near(a.x, b.x, 1e-9);
});

t('ballistic: launchVelocity lands exactly on target at T', () => {
  for (const [from, to, T, g] of [[{ x: 0, y: 8, z: 0 }, { x: 3, y: 0, z: -2 }, 1.2, 20], [{ x: -4, y: 0.5, z: 1 }, { x: 2, y: 0, z: 3 }, 0.6, 9.81]]) {
    const v = M.launchVelocity(from, to, T, g), p = M.positionAt(from, v, T, g);
    near(p.x, to.x, 1e-9, 'x'); near(p.y, to.y, 1e-9, 'y'); near(p.z, to.z, 1e-9, 'z');
  }
});
t('ballistic: positionAt follows gravity (y down)', () => { const p = M.positionAt({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 1, 20); near(p.y, 0, 1e-12, 'y'); near(p.x, 1, 1e-12, 'x'); });

t('sweepCircle: head-on hit time', () => near(M.sweepCircle({ x: -5, z: 0 }, { x: 5, z: 0 }, 0.5, { x: 0, z: 0 }, 0.5), 0.4, 1e-9));
t('sweepCircle: off-centre hit time', () => near(M.sweepCircle({ x: -5, z: 0 }, { x: 5, z: 0 }, 0.5, { x: 0, z: 0.9 }, 0.5), (5 - Math.sqrt(0.19)) / 10, 1e-9));
t('sweepCircle: miss returns null', () => ok(M.sweepCircle({ x: -5, z: 0 }, { x: 5, z: 0 }, 0.5, { x: 0, z: 2 }, 0.5) === null, 'expected null'));
t('sweepCircle: already overlapping returns 0', () => near(M.sweepCircle({ x: 0.2, z: 0 }, { x: 5, z: 0 }, 0.5, { x: 0, z: 0 }, 0.5), 0, 1e-12));
t('sweepCircle: moving away returns null', () => ok(M.sweepCircle({ x: 2, z: 0 }, { x: 5, z: 0 }, 0.5, { x: 0, z: 0 }, 0.5) === null, 'expected null'));
t('sweepCircle: stops short returns null', () => ok(M.sweepCircle({ x: -5, z: 0 }, { x: -2, z: 0 }, 0.5, { x: 0, z: 0 }, 0.5) === null, 'expected null'));
t('sweepCircle: not moving, apart returns null', () => ok(M.sweepCircle({ x: 3, z: 0 }, { x: 3, z: 0 }, 0.5, { x: 0, z: 0 }, 0.5) === null, 'expected null'));

t('stepper: whole steps + leftover alpha', () => {
  const st = M.createStepper(1 / 120); let n = 0; const f = (dt) => { n++; near(dt, 1 / 120, 1e-15, 'dt'); };
  let a = st.advance(1 / 60, f); ok(n === 2, 'steps ' + n); near(a, 0, 1e-6, 'alpha');
  n = 0; a = st.advance(1 / 240, f); ok(n === 0, 'steps ' + n); near(a, 0.5, 1e-6, 'alpha');
  n = 0; a = st.advance(1 / 240, f); ok(n === 1, 'steps ' + n); near(a, 0, 1e-6, 'alpha');
});
t('stepper: caps steps after a long pause and drops the rest', () => {
  const st = M.createStepper(1 / 120, 5); let n = 0; const a = st.advance(1, () => n++);
  ok(n === 5, 'steps ' + n); ok(a >= 0 && a < 1, 'alpha ' + a);
  n = 0; st.advance(1 / 120, () => n++); ok(n <= 2, 'kept the dropped time: ' + n);
});

const src = fs.readFileSync(file, 'utf8');
const banned = new RegExp('\\bev' + 'al\\b|new\\s+Func' + 'tion');
t('source rules', () => { ok(!/Math\.random/.test(src), 'uses Math.random'); ok(!/\b(window|document)\b/.test(src), 'touches the DOM'); ok(!/^\s*import\s/m.test(src), 'has imports'); ok(!banned.test(src), 'dynamic code'); });
// ---- stress checks
// deterministic jittery frame times
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

t('spring: stiff + heavy damping + big dt stays finite (zeta 10, 20 Hz, dt 1)', () => { const s = { x: 0, v: 0 }; for (let i = 0; i < 5; i++) { M.springStep(s, 1, 20, 10, 1); fin(s.x, 'x'); fin(s.v, 'v'); } ok(Math.abs(s.x - 1) < 0.5, 'x ' + s.x); });
t('spring: extreme zeta 1e6 finite', () => { const s = { x: 0, v: 0 }; M.springStep(s, 1, 2, 1e6, 0.1); fin(s.x); fin(s.v); });
t('spring: critical with strong initial velocity overshoots like real physics (matches exact)', () => {
  const a = { x: 0, v: 30 }, b = { x: 0, v: 30 }; // start at 0, target 1, flying past it
  for (let i = 0; i < 60; i++) M.springStep(a, 1, 2, 1, 1 / 60); for (let i = 0; i < 60; i++) R.springStep(b, 1, 2, 1, 1 / 60);
  ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.v - b.v) < 1e-5, `got x=${a.x.toFixed(4)} v=${a.v.toFixed(4)}, exact x=${b.x.toFixed(4)} v=${b.v.toFixed(4)}`);
});
t('spring: overdamped with initial velocity matches exact', () => {
  const a = { x: 0, v: -12 }, b = { x: 0, v: -12 };
  for (let i = 0; i < 90; i++) { M.springStep(a, 1, 1.5, 3, 1 / 60); R.springStep(b, 1, 1.5, 3, 1 / 60); }
  ok(Math.abs(a.x - b.x) < 1e-6, `x ${a.x} vs ${b.x}`);
});
t('spring: jittery frame times match one big step (zeta 0.4)', () => {
  const a = { x: 2, v: -1 }, b = { x: 2, v: -1 }; let T = 0;
  while (T < 1.5) { const dt = Math.min(1.5 - T, 0.004 + rnd() * 0.03); M.springStep(a, -1, 2.5, 0.4, dt); T += dt; }
  R.springStep(b, -1, 2.5, 0.4, 1.5);
  ok(Math.abs(a.x - b.x) < 1e-6, `x ${a.x} vs ${b.x}`);
});
t('spring: freq 0 does not crash', () => { const s = { x: 0, v: 1 }; M.springStep(s, 1, 0, 1, 0.1); fin(s.x); fin(s.v); });
t('accelerate: dash slowdown (same direction, faster than desired) uses accel, smooth', () => {
  const v = { x: 15, z: 0 }; M.accelerateVelocity(v, { x: 6, z: 0 }, { accel: 60, decel: 40, turnAccel: 120 }, 0.05); ok(Math.abs(v.x - 12) < 1e-9, 'x ' + v.x);
});
t('accelerate: 90-degree turn moves in a straight line', () => {
  const v = { x: 6, z: 0 }; M.accelerateVelocity(v, { x: 0, z: 6 }, { accel: 60, decel: 40, turnAccel: 120 }, 0.05);
  ok(Math.abs(v.x - (6 - 3 / Math.SQRT2)) < 1e-9 && Math.abs(v.z - 3 / Math.SQRT2) < 1e-9, `${v.x},${v.z}`);
});
t('sweepCircle: very fast dash cannot tunnel (1000 units in one frame)', () => {
  const r = M.sweepCircle({ x: -500, z: 0.3 }, { x: 500, z: 0.3 }, 0.4, { x: 0, z: 0 }, 0.4); ok(r !== null && Math.abs(r - (500 - Math.sqrt(0.64 - 0.09)) / 1000) < 1e-9, 'r ' + r);
});
t('sweepCircle: exact touch at the end of the move counts', () => { const r = M.sweepCircle({ x: -5, z: 0 }, { x: -1, z: 0 }, 0.5, { x: 0, z: 0 }, 0.5); ok(r !== null && Math.abs(r - 1) < 1e-9, 'r ' + r); });
t('stepper: 10 s of jittery frames gives the right number of steps', () => {
  const st = M.createStepper(1 / 120, 5); let n = 0, T = 0; seed = 99;
  while (T < 10) { const dt = 0.005 + rnd() * 0.02; T += dt; st.advance(dt, () => n++); }
  const want = Math.floor(T * 120); ok(Math.abs(n - want) <= 1, `steps ${n}, want ~${want}`);
});
t('stepper: alpha always in [0,1)', () => { const st = M.createStepper(1 / 60, 5); seed = 3; for (let i = 0; i < 2000; i++) { const a = st.advance(rnd() * 0.05, () => {}); ok(a >= 0 && a < 1, 'alpha ' + a); } });
t('stepper: negative or NaN dt does not break it', () => { const st = M.createStepper(1 / 60, 5); let n = 0; st.advance(-1, () => n++); st.advance(NaN, () => n++); const a = st.advance(1 / 60, () => n++); ok(n === 1 && Number.isFinite(a), `n ${n} a ${a}`); });
t('speed: 1M spring steps under 400 ms', () => { const s = { x: 0, v: 0 }; const t0 = performance.now(); for (let i = 0; i < 1e6; i++) M.springStep(s, 1, 2, 0.5, 1 / 60); const ms = performance.now() - t0; ok(ms < 400, ms.toFixed(0) + ' ms'); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
