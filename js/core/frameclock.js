// Mango Rush — frame pacing and a steady dt.   OWNER: Claude Code  ·  STATUS: step 3b (pure maths, no DOM: tested by tests/frameclock.test.mjs)
//
// WHY. A 120 Hz screen on a weak GPU can alternate between fast and slow frames, so the picture judders even though the
// average frame rate is fine. This clock does two things:
//   1. FRAME PACING. It measures the real refresh interval, and when the screen is above ~75 Hz and frames do not hold the
//      refresh budget (or `forceCap` says the GPU is known to be weak) it caps rendering to an even ~60 fps: an accumulator of
//      real time decides which requestAnimationFrame callbacks render, so the pictures arrive at even spacing, never fast-slow-fast.
//      The cap is chosen as a whole number of refresh intervals (120 Hz -> every 2nd, 144 Hz -> every 2nd = 72 fps, 165 Hz -> every
//      3rd = 55 fps), and once on it stays on: no flipping back and forth.
//   2. A STEADY dt. The step handed to the game is a short moving average of the last few real steps, with outliers clamped, so
//      the motion maths gets even steps. It only changes the SIZE of the step (the average of the steps equals the real time), it
//      never delays input: input is read in the same frame.
//
// CONTRACT
//   createFrameClock({ forceCap = false, capFps = 60 }) -> clock
//   clock.tick(ts) -> { render, dt, intervalMs }     call from EVERY requestAnimationFrame callback with its timestamp (ms).
//       render      true when this callback should update + draw
//       dt          seconds for the game step (steady); only meaningful when render is true
//       intervalMs  real ms since the previous RENDERED frame
//     The returned object is reused: read it, do not keep it.
//   clock.stats() -> { fps, avgMs, worstMs, refreshHz, capFps, capped }   over the last 2 s of rendered frames
//   clock.reset() -> void                      forget the history (after the tab was hidden)

const MEASURE_SAMPLES = 40;       // callbacks used to measure the refresh interval
const WINDOW_MS = 2000;           // the stats window
const RING = 5;                   // dt moving average length
const HITCH_MS = 250;             // a step this long means the tab was hidden or the page stalled

export function createFrameClock({ forceCap = false, capFps = 60 } = {}) {
  const out = { render: true, dt: 1 / 60, intervalMs: 16.7 };

  // ---- refresh measurement
  let prevTs = -1;
  const samples = [];
  let refreshMs = 0;               // 0 until measured

  // ---- pacing
  let divisor = 1;                 // render every Nth refresh (as time, not a counter)
  let acc = 0;                     // real time owed to the next rendered frame
  let capped = false;
  let missWindowStart = -1;
  let missSum = 0;
  let missN = 0;

  // ---- dt smoothing
  const ring = new Float64Array(RING);
  let ringN = 0;
  let ringI = 0;
  let lastRenderTs = -1;

  // ---- stats (a circular buffer of the last rendered frames)
  const CAP = 512;
  const fTs = new Float64Array(CAP);
  const fMs = new Float64Array(CAP);
  let fN = 0;
  let fI = 0;

  // a callback can never come faster than the screen refreshes, but missed refreshes make slow ones (2x, 3x), so the REFRESH
  // interval is a low percentile of the steps, not the median
  function lowPercentile(a) {
    const b = a.slice().sort((x, y) => x - y);
    return b[Math.floor(b.length * 0.15)];
  }

  function measure(delta) {
    if (refreshMs > 0) return;
    if (delta > 2 && delta < 60) samples.push(delta);
    if (samples.length >= MEASURE_SAMPLES) {
      refreshMs = lowPercentile(samples.slice(5));   // the first few callbacks are not representative
      const hz = 1000 / refreshMs;
      if (forceCap && hz > 75) enableCap();
    }
  }

  function enableCap() {
    if (capped) return;
    divisor = Math.max(2, Math.round(1000 / refreshMs / capFps));
    capped = true;
  }

  // frames that do not hold the refresh budget on a fast screen: turn the cap on
  function watchBudget(ts, delta) {
    if (refreshMs <= 0 || capped || 1000 / refreshMs <= 75) return;
    if (missWindowStart < 0) missWindowStart = ts;
    missSum += delta;
    missN++;
    if (ts - missWindowStart >= 1000) {
      if (missN > 10 && missSum / missN > refreshMs * 1.25) enableCap();
      missWindowStart = ts;
      missSum = 0;
      missN = 0;
    }
  }

  function tick(ts) {
    const delta = prevTs < 0 ? 0 : ts - prevTs;
    prevTs = ts;
    if (delta > HITCH_MS) {   // the tab was hidden or the page stalled: start over, do not feed that step to the game
      acc = 0;
      ringN = 0;
      lastRenderTs = ts;
      fN = 0;
      missWindowStart = -1;
      missSum = missN = 0;
      out.render = true;
      out.dt = 1 / 60;
      out.intervalMs = 1000 / 60;
      return out;
    }
    if (delta > 0) { measure(delta); watchBudget(ts, delta); }

    // ---- pacing: an accumulator of real time
    let render = true;
    if (divisor > 1 && refreshMs > 0) {
      const target = divisor * refreshMs;
      acc += delta;
      // a callback renders when it has gathered (nearly) one target interval; half a refresh of slack absorbs timestamp jitter
      if (acc >= target - refreshMs * 0.5) acc = Math.min(acc - target, refreshMs * 0.5);
      else render = false;
    }
    out.render = render;
    if (!render) return out;

    // ---- a steady dt
    const raw = lastRenderTs < 0 ? 1000 / 60 : ts - lastRenderTs;
    lastRenderTs = ts;
    let step = raw;
    if (ringN >= 3) {
      let s = 0;
      for (let i = 0; i < ringN; i++) s += ring[i];
      const avg = s / ringN;
      step = Math.min(avg * 1.8, Math.max(avg * 0.6, raw));   // clamp outliers around the recent average
    }
    ring[ringI] = step;
    ringI = (ringI + 1) % RING;
    if (ringN < RING) ringN++;
    let s2 = 0;
    for (let i = 0; i < ringN; i++) s2 += ring[i];
    const smooth = s2 / ringN;

    out.intervalMs = raw;
    out.dt = Math.min(0.05, Math.max(1 / 240, smooth / 1000));

    fTs[fI] = ts;
    fMs[fI] = raw;
    fI = (fI + 1) % CAP;
    if (fN < CAP) fN++;
    return out;
  }

  const st = { fps: 0, avgMs: 0, worstMs: 0, refreshHz: 0, capFps: 0, capped: false };
  function stats() {
    let n = 0;
    let sum = 0;
    let worst = 0;
    const newest = fN ? fTs[(fI - 1 + CAP) % CAP] : 0;
    for (let k = 0; k < fN; k++) {
      const i = (fI - 1 - k + CAP * 2) % CAP;
      if (newest - fTs[i] > WINDOW_MS) break;
      n++;
      sum += fMs[i];
      if (fMs[i] > worst) worst = fMs[i];
    }
    st.avgMs = n ? sum / n : 0;
    st.worstMs = worst;
    st.fps = st.avgMs > 0 ? 1000 / st.avgMs : 0;
    st.refreshHz = refreshMs > 0 ? 1000 / refreshMs : 0;
    st.capped = capped;
    st.capFps = capped && refreshMs > 0 ? 1000 / (divisor * refreshMs) : st.refreshHz;
    return st;
  }

  function reset() {
    prevTs = -1;
    acc = 0;
    ringN = 0;
    fN = 0;
    lastRenderTs = -1;
    missWindowStart = -1;
    missSum = missN = 0;
  }

  return { tick, stats, reset };
}
