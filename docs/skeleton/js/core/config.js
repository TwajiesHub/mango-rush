// Mango Rush — every tuning number lives here. Change numbers here, never inline in modules.
// Values come from the Game Design Document; tune them in playtesting.

export const CONFIG = Object.freeze({
  lives: 3,

  player: {
    speed: 6.4,               // units / second
    accel: 14,                // higher = snappier
    dashSpeed: 15,
    dashTime: 0.17,           // seconds
    dashCooldown: 1.1,
    invulnerable: 1.2,        // seconds after a hit
  },

  // Difficulty keyframes by run time (seconds). Values are interpolated (eased) between keys.
  difficulty: [
    { t: 0,   dropGap: 1.6,  coconutShare: 0.15, warn: 1.2,  goldenChance: 0.0 },
    { t: 60,  dropGap: 1.0,  coconutShare: 0.22, warn: 1.0,  goldenChance: 0.05 },
    { t: 150, dropGap: 0.55, coconutShare: 0.40, warn: 0.75, goldenChance: 0.12 },
    { t: 240, dropGap: 0.33, coconutShare: 0.55, warn: 0.5,  goldenChance: 0.20 },
  ],
  minWarn: 0.5,               // warning time never below this
  rottenChance: { fromPhase: 'dusk', chance: 0.08 },
  shieldChance: { fromPhase: 'dusk', chance: 0.015 },

  phases: [                   // start time (seconds) of each phase
    { id: 'golden', t: 0 },
    { id: 'dusk', t: 60 },
    { id: 'night', t: 150 },
    { id: 'midnight', t: 210 },
  ],

  breather: { every: 30, length: 3 },   // mango-only shower

  // Scripted happenings (seconds into the run). happenings.js reads this.
  happenings: [
    { id: 'bridge', t: 86, length: 10 },
    { id: 'gust', t: 120, length: 6 },
    { id: 'gust', t: 180, length: 6 },
    { id: 'bigone', t: 210, length: 3 },
  ],
  volleys: { fromPhase: 'night', size: [2, 3], chance: 0.3 },
  bat: { fromPhase: 'dusk', every: [25, 40], warn: 1.0 },
  happeningWarnTime: 2,       // banner + music drop before a happening

  catchRadius: 0.95,
  catchMaxHeight: 2.4,
  landedFruitLife: 5,         // seconds a landed mango stays
  landedBlink: 1.5,
  hitRadius: 1.0,
  nearMissBand: 0.5,          // landing within hitRadius .. hitRadius + 0.5 = near miss
  perfectDodgeWindow: 0.2,    // dash out of a ring in its final 0.2 s

  scoring: {
    mango: 100,
    golden: 500,
    nearMiss: 50,
    perfectDodge: 150,
    catchesPerStep: 5,        // catches to reach the next multiplier
    maxMultiplier: 5,
    comboWindow: 2.5,         // seconds between catches
    comboGrace: 0.4,
    nearMissTimeBonus: 0.8,   // seconds added to the combo timer
    heartbeatBonus: 1.5,      // all points x1.5 on the last life
  },

  madness: {
    fillSeconds: 6,           // seconds held at x5 to fill the meter
    duration: 8,
    perCatchBonus: 0.3,
    pointsMultiplier: 2,
  },

  medals: [                   // thresholds are placeholders until playtesting
    { id: 'bronze', score: 5000 },
    { id: 'silver', score: 15000 },
    { id: 'gold', score: 30000 },
    { id: 'diamond', score: 60000 },
  ],

  waterOverDeck: { fromT: 60, toT: 210, minSafeFraction: 0.55 },

  // Game feel per event. strength/decay = camera shake; freeze = ms; squash = target scale Y.
  feel: {
    catch:        { freeze: 0,   shake: 0,    decay: 0,  squash: 1.15, squashMs: 40,  particles: 12, color: '#F2A93B' },
    golden:       { freeze: 40,  shake: 0.12, decay: 20, squash: 1.35, squashMs: 70,  particles: 28, color: '#FFD84D' },
    nearMiss:     { freeze: 16,  shake: 0.08, decay: 18, squash: 1,    squashMs: 0,   particles: 6,  color: '#FFF1D6' },
    perfectDodge: { freeze: 0,   shake: 0.05, decay: 18, squash: 1,    squashMs: 0,   particles: 10, color: '#FFF1D6', slowMo: { scale: 0.25, seconds: 0.3 } },
    hit:          { freeze: 100, shake: 0.45, decay: 14, squash: 0.6,  squashMs: 100, particles: 30, color: '#5B3A1F' },
    dash:         { freeze: 0,   shake: 0.04, decay: 20, squash: 1,    squashMs: 0,   particles: 8,  color: '#E6BE7A' },
    stepUp:       { freeze: 15,  shake: 0.08, decay: 14, squash: 1.2,  squashMs: 50,  particles: 0,  color: '#F2A93B' },
    gameOver:     { freeze: 180, shake: 0.6,  decay: 6,  squash: 1,    squashMs: 0,   particles: 40, color: '#F2A93B', slowMo: { scale: 0.2, seconds: 0.5 } },
  },

  audio: {
    catchPitchStep: 0.03,     // +3% per combo step
    detune: 0.025,
    duckOnHitDb: -8,
    duckMs: 200,
  },

  quality: {
    maxPixelRatio: 1.5,
    downgradeFrameMs: 22,     // average frame time that triggers a lower quality
    lowFrameMs: 30,
  },
});

/** Interpolate the difficulty table at run time t (seconds). */
export function difficultyAt(t) {
  const keys = CONFIG.difficulty;
  if (t <= keys[0].t) return { ...keys[0] };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const u = (t - a.t) / (b.t - a.t);
      const e = u * u * (3 - 2 * u); // smoothstep
      const out = { t };
      for (const k of Object.keys(a)) if (k !== 't') out[k] = a[k] + (b[k] - a[k]) * e;
      out.warn = Math.max(CONFIG.minWarn, out.warn);
      return out;
    }
  }
  return { ...keys[keys.length - 1], t };
}

/** Phase id at run time t. */
export function phaseAt(t) {
  let id = CONFIG.phases[0].id;
  for (const p of CONFIG.phases) if (t >= p.t) id = p.id;
  return id;
}
