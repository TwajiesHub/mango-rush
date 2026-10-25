// Mango Rush — the happenings' timeline, as pure functions.   OWNER: Claude Code  ·  STATUS: step 8
//
// No three.js, no DOM. Everything the happenings need is DRAWN AT RESET from the happenings rng, in this fixed order, whatever the player
// does (so the Daily Run is identical for everyone): 1) one direction per gust, 2) for each shower 10 x (angle, radius, delay), 3) the bats'
// gaps, then their angles, then their offsets (CONFIG.bat.count of each). Nothing else is ever drawn.
//
//   buildTimeline(rng, H = CONFIG.happenings, B = CONFIG.bat) -> timeline
//        { scripted: [{ id, start, end, warnAt }] in time order (bridge, showers, gusts, bigone),
//          gusts: [{ start, end, angle }],
//          showers: [{ start, end, spots: [{ a, r, at }] }]   a, r in 0..1 (the place on the deck), at = seconds after the start (0..length),
//          bats: [{ t, angle, offset }]                      t = the moment the bat starts to swoop (its dotted path shows from t - warn) }
//   activeAt(tl, t) -> the scripted happening running at t, or null
//   windAt(tl, t, out) -> out { x, z }   the gust's push in deck-local units / second (0 outside a gust; never above H.gustStrength; eases in and out)
//   dropsHeldAt(tl, t) -> boolean   true in the Big One's window (holdFrom .. holdTo) and in the shower windows
//   holdReady(tl, ready, span, isCoconut) -> number   when an event that would launch at `ready` and fall for `span` seconds may really
//        launch: nothing launches during the Big One's hold; no COCONUT lands during a shower or the 0.5 s after it
//   nextBat(tl, t) -> the first bat whose swoop has not ended at t, or null
//   darkAt(t, H) -> 0..1   how dark Lights out is (a 1 s fade in at the bridge's start and out at its end): a function of config and time only
//   upcoming(tl, t) -> the next scripted happening starting after t, or null (the ?debug panel and the H key)

import { CONFIG } from '../core/config.js';

const smooth = (u) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

export function buildTimeline(rng, H = CONFIG.happenings, B = CONFIG.bat) {
  const gusts = H.gusts.map((g) => ({ start: g.t, end: g.t + g.length, angle: 0 }));
  // 1) one draw per gust: mostly sideways, within +-cone degrees of screen-left or screen-right
  for (const g of gusts) {
    const s = rng.next() * 2;
    const side = Math.floor(s);
    g.angle = side * Math.PI + (s - side - 0.5) * 2 * H.gustCone * (Math.PI / 180);
  }
  // 2) the showers
  const showers = H.showers.map((t) => ({ start: t, end: t + H.showerLength, spots: [] }));
  for (const sh of showers) {
    for (let i = 0; i < H.showerCount; i++) sh.spots.push({ a: rng.next(), r: rng.next(), at: rng.next() * H.showerLength * 0.85 });
  }
  // 3) the bats: all draws first (fixed count), then place them
  const gaps = [];
  const angles = [];
  const offsets = [];
  for (let i = 0; i < B.count; i++) gaps.push(B.every[0] + rng.next() * (B.every[1] - B.every[0]));
  for (let i = 0; i < B.count; i++) angles.push(rng.next());
  for (let i = 0; i < B.count; i++) offsets.push(rng.next());

  const scripted = [
    { id: 'bridge', start: H.bridge.t, end: H.bridge.t + H.bridge.length },
    ...showers.map((s) => ({ id: 'shower', start: s.start, end: s.end })),
    ...gusts.map((g) => ({ id: 'gust', start: g.start, end: g.end })),
    { id: 'bigone', start: H.bigone.spawnAt, end: H.bigone.holdTo },
  ].sort((a, b) => a.start - b.start);
  for (const s of scripted) s.warnAt = s.start - H.warnTime;

  // a bat never comes within B.buffer seconds of a scripted happening (the Big One counts from its hold): it moves to after it
  const bats = [];
  let t = B.from;
  for (let i = 0; i < B.count; i++) {
    t += gaps[i];
    for (let guard = 0; guard < 20; guard++) {
      let moved = false;
      for (const s of scripted) {
        const from = (s.id === 'bigone' ? H.bigone.holdFrom : s.start) - B.buffer;
        const to = s.end + B.buffer;
        if (t - B.warn < to && t + B.swoop > from) { t = to + B.warn; moved = true; }
      }
      if (!moved) break;
    }
    bats.push({ t, angle: angles[i], offset: offsets[i] });
  }
  return { scripted, gusts, showers, bats, H, B };
}

export function activeAt(tl, t) {
  for (const s of tl.scripted) if (t >= s.start && t < s.end) return s;
  return null;
}

export function upcoming(tl, t) {
  for (const s of tl.scripted) if (s.start > t) return s;
  return null;
}

export function windAt(tl, t, out) {
  out.x = 0;
  out.z = 0;
  const H = tl.H;
  for (const g of tl.gusts) {
    if (t < g.start || t >= g.end) continue;
    const k = Math.min(1, (t - g.start) / H.gustEase, (g.end - t) / H.gustEase);
    const s = H.gustStrength * smooth(k);
    out.x = Math.cos(g.angle) * s;
    out.z = Math.sin(g.angle) * s;
    return out;
  }
  return out;
}

export function dropsHeldAt(tl, t) {
  const H = tl.H;
  if (t >= H.bigone.holdFrom && t < H.bigone.holdTo) return true;
  for (const s of tl.showers) if (t >= s.start && t < s.end) return true;
  return false;
}

export function holdReady(tl, ready, span, isCoconut) {
  const H = tl.H;
  let r = ready;
  if (r >= H.bigone.holdFrom && r < H.bigone.holdTo) r = H.bigone.holdTo;
  if (isCoconut) {
    for (const s of tl.showers) {
      const to = s.end + H.showerAfter + 0.06;   // (a hair after the 0.5 s, so a coconut never lands exactly on the edge)
      if (r + span >= s.start && r + span <= to) r = to - span;    // it would land during the shower (or just after): hold it until it lands later
    }
  }
  return r;
}

export function nextBat(tl, t) {
  for (const b of tl.bats) if (t < b.t + tl.B.swoop) return b;
  return null;
}

export function darkAt(t, H = CONFIG.happenings) {
  const a = H.bridge.t;
  const b = a + H.bridge.length;
  if (t <= a || t >= b) return 0;
  return smooth((t - a) / H.darkFade) * smooth((b - t) / H.darkFade);
}
