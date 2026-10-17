// Mango Rush — the journey's timeline, as pure functions of run time.   OWNER: Claude Code  ·  STATUS: step 6
//
// No three.js, no DOM, no rng: the same run time always gives the same answer, so every player (and every Daily Run) sees the same
// journey, and a plain node test can check it. world/journey.js and world/barge.js use these.
//
//   placeIndexAt(t, places) -> number          the index of the place the run is in at time t (places = CONFIG.journey.places)
//   phaseBlend(t, phases, blend) -> { a, b, u }  phase index a (the one before) blending into b (the current one): u 0..1, smoothstep over
//                                              `blend` seconds from the start of b. At the start of the run a === b and u = 1.
//   wetFrac(t, wet) -> number                  the wet band's width as a share of the walkable radius: 0 before wet.from, wet.frac at wet.to
//   sunDrop(t, sink) -> number                 how far the sun has sunk (units), 0 .. sink.drop, eased over dusk
//   flashAllowed(lastAt, now, minGap) -> boolean   a soft flash may fire only after minGap seconds (never more than 3 a second)

export const smooth = (u) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

export function placeIndexAt(t, places) {
  let k = 0;
  for (let i = 0; i < places.length; i++) if (t >= places[i].t) k = i;
  return k;
}

export function phaseBlend(t, phases, blend) {
  let b = 0;
  for (let i = 0; i < phases.length; i++) if (t >= phases[i].t) b = i;
  if (b === 0) return { a: 0, b: 0, u: 1 };
  return { a: b - 1, b, u: smooth((t - phases[b].t) / blend) };
}

export function wetFrac(t, wet) {
  if (t <= wet.from) return 0;
  return wet.frac * Math.min(1, (t - wet.from) / (wet.to - wet.from));
}

export function sunDrop(t, sink) {
  return sink.drop * smooth((t - sink.from) / (sink.to - sink.from));
}

export function flashAllowed(lastAt, now, minGap) {
  return now - lastAt >= minGap;
}
