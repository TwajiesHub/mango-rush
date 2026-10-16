// Mango Rush — motion and physics helpers.   OWNER: planner (written by Claude, tested)  ·  STATUS: done — do not edit
//
// Pure maths, no imports, no DOM, no randomness. y is up; the ground is x/z; time in seconds.
// Every function is frame-rate independent (exact formulas, not Euler steps).
// Tests: `node tests/motion.test.mjs` (42 checks). If you ever change this file, all of them must still pass.
//
// CONTRACT:
//   springStep(s, target, freq, zeta, dt) -> s       s = { x, v }; damped spring, exact solution; mutates s
//   approach(current, target, maxDelta) -> number
//   accelerateVelocity(vel, desired, p, dt) -> vel   vel/desired = { x, z }; p = { accel, decel, turnAccel }
//   smoothInput(cur, raw, rate, dt) -> cur          exponential blend, length clamped to 1
//   launchVelocity(from, to, T, g) -> { x, y, z }   throw that lands on `to` after T seconds (g pulls toward -y)
//   positionAt(from, v, t, g) -> { x, y, z }
//   sweepCircle(p0, p1, r, c, R) -> t | null        moving circle vs still circle, earliest touch in [0, 1]
//   createStepper(fixedDt, maxSteps = 5) -> { advance(realDt, stepFn) -> alpha }   fixed-timestep accumulator


// Moves a damped spring toward a target using the exact analytic solution
// for the underdamped, critical and overdamped cases. Mutates and returns s.
export function springStep(s, target, freq, zeta, dt) {
  if (!(dt > 0)) return s;
  const w = 2 * Math.PI * Math.max(0, freq);
  const d0 = s.x - target;
  const v0 = s.v;

  // No spring force at all: the object just coasts.
  if (!(w > 1e-9)) {
    s.x += v0 * dt;
    return s;
  }

  const z = Math.max(0, zeta);
  let d, v;

  if (Math.abs(z - 1) < 1e-4) {
    // Critically damped.
    const e = Math.exp(-w * dt);
    const k = v0 + w * d0;
    d = e * (d0 + k * dt);
    v = e * (v0 - w * k * dt);
  } else if (z < 1) {
    // Underdamped (z = 0 oscillates forever with constant amplitude).
    const wd = w * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w * dt);
    const c = Math.cos(wd * dt);
    const sn = Math.sin(wd * dt);
    d = e * (d0 * c + ((v0 + z * w * d0) / wd) * sn);
    v = e * (v0 * c - ((z * w * v0 + w * w * d0) / wd) * sn);
  } else {
    // Overdamped. Roots are computed in a cancellation-free form (r1 * r2 = w^2).
    const q = Math.sqrt(z * z - 1);
    const r1 = -w / (z + q);
    const r2 = -w * (z + q);
    const c2 = (r1 * d0 - v0) / (r1 - r2);
    const c1 = d0 - c2;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    d = c1 * e1 + c2 * e2;
    v = c1 * r1 * e1 + c2 * r2 * e2;
  }

  s.x = target + d;
  s.v = v;
  return s;
}

// Moves a number toward a target by at most maxDelta, never passing it.
export function approach(current, target, maxDelta) {
  const m = maxDelta > 0 ? maxDelta : 0;
  if (current < target) return Math.min(current + m, target);
  if (current > target) return Math.max(current - m, target);
  return target;
}

// Moves a 2D velocity toward the desired velocity in a straight line, by at most
// rate*dt. The rate is decel when stopping, turnAccel when reversing, else accel.
export function accelerateVelocity(vel, desired, p, dt) {
  const dLen = Math.hypot(desired.x, desired.z);
  let rate;
  if (dLen < 1e-9) rate = p.decel;
  else if (vel.x * desired.x + vel.z * desired.z < 0) rate = p.turnAccel;
  else rate = p.accel;

  const step = Math.max(0, rate) * Math.max(0, dt);
  const dx = desired.x - vel.x;
  const dz = desired.z - vel.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= step || dist < 1e-12) {
    vel.x = desired.x;
    vel.z = desired.z;
  } else {
    const k = step / dist;
    vel.x += dx * k;
    vel.z += dz * k;
  }
  return vel;
}

// Smooths raw 2D input with an exponential blend, then limits its length to 1.
export function smoothInput(cur, raw, rate, dt) {
  const k = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  cur.x += (raw.x - cur.x) * k;
  cur.z += (raw.z - cur.z) * k;
  const len = Math.hypot(cur.x, cur.z);
  if (len > 1) {
    cur.x /= len;
    cur.z /= len;
  }
  return cur;
}

// Returns the initial velocity that carries a thrown object from `from` to `to`
// in exactly T seconds under gravity g (pulling toward -y).
export function launchVelocity(from, to, T, g) {
  if (!(T > 1e-9)) return { x: 0, y: 0, z: 0 };
  return {
    x: (to.x - from.x) / T,
    y: (to.y - from.y + 0.5 * g * T * T) / T,
    z: (to.z - from.z) / T,
  };
}

// Returns the position after t seconds of a throw with initial velocity v.
export function positionAt(from, v, t, g) {
  return {
    x: from.x + v.x * t,
    y: from.y + v.y * t - 0.5 * g * t * t,
    z: from.z + v.z * t,
  };
}

// Finds the earliest fraction t in [0,1] at which a moving circle (radius r)
// touches a still circle (radius R at c), or null if it never does.
export function sweepCircle(p0, p1, r, c, R) {
  const sum = r + R;
  const fx = p0.x - c.x;
  const fz = p0.z - c.z;
  const c0 = fx * fx + fz * fz - sum * sum;

  // Already overlapping or touching at the start.
  if (c0 <= 1e-12) return 0;

  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-18) return null; // not moving

  const b = fx * dx + fz * dz;
  if (b >= 0) return null; // moving away (or sliding past tangentially)

  const disc = b * b - a * c0;
  if (disc < 0) return null; // miss

  // Stable form of (-b - sqrt(disc)) / a.
  const t = c0 / (-b + Math.sqrt(disc));
  if (!(t <= 1 + 1e-9)) return null; // stops short
  return Math.min(1, Math.max(0, t));
}

// Creates a fixed-timestep accumulator. advance() runs stepFn(fixedDt) for each
// whole step (max maxSteps), drops excess backlog, and returns alpha in [0,1).
export function createStepper(fixedDt, maxSteps = 5) {
  const limit = Math.max(1, Math.floor(maxSteps) || 5);
  let acc = 0;
  return {
    advance(realDt, stepFn) {
      if (!(fixedDt > 0)) return 0;
      const dt = realDt > 0 ? Math.min(realDt, 1e9) : 0;
      acc += dt;
      const eps = fixedDt * 1e-9;
      const whole = Math.floor((acc + eps) / fixedDt);
      const n = Math.min(whole, limit);
      for (let i = 0; i < n; i++) stepFn(fixedDt);
      // Subtract every whole step, including dropped ones, so leftover < fixedDt.
      acc -= whole * fixedDt;
      if (acc < 0) acc = 0;
      return acc / fixedDt;
    },
  };
}
