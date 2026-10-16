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

  // The barge (world/barge.js). Units are world units; the deck top is y = 0.
  deck: {
    width: 18,
    depth: 12,
    walkMargin: 0.6,          // the walkable ellipse is the deck minus this on every side
    rim: 0.35,                // width of the raised rim
    rimHeight: 0.15,
    hull: 0.9,                // how far the hull sides go down
    chamfer: 0.7,
    waterY: -0.55,
    bob: { y: 0.03, roll: 0.6, pitch: 0.4, speed: 0.45 },   // world units, degrees, degrees; speed = cycles per second
    slowZone: 0.12,           // the player starts slowing this share of the radius before the rim
  },

  // The camera (world/renderer.js).
  camera: {
    fov: 50,                  // vertical, degrees
    elevationDeg: 50,         // the play camera sees the deck centre from this angle above the water (eased off on narrow screens)
    horizonFrac: 0.25,        // the painted horizon sits this far from the top of the screen in play / over
    fitMargin: 1.0,           // world units around the walkable area that must stay on screen (a warning ring at the edge is ~1 unit wide)
    screenPad: 0.03,         // share of half the screen kept free at the sides and top
    bottomNdc: { landscape: -0.82, portrait: -0.62 },   // where the near edge of the deck sits (-1 = screen bottom)
    followShare: 0.15,        // the camera moves this share of the player's offset from the centre
    followFreq: 1.6,
    followZeta: 1,
    poseFreq: 2.2,            // how fast the camera glides between menu / play / over poses
    over: { farther: 1.12, higherDeg: 5, drift: 0.7 },
    // the start-screen camera: position, tilt, where the horizon sits (share from the top) and where the character stands
    menu: {
      landscape: { pos: [-2.0, 2.4, 8.0], pitchDeg: 8, horizonFrac: 0.62, stand: [0, -3.2] },
      portrait: { pos: [0, 1.5, 14.5], pitchDeg: 3, horizonFrac: 0.37, stand: [0, 0] },
    },
  },

  world: {
    flowSpeed: 1.2,           // how fast the water streams past the barge (units / second)
  },

  // Falling items (play/drops.js). Fall time is the warning time from `difficulty`, so the ring tells the truth.
  drops: {
    height: 16,               // spawn height above the ground
    gravity: 22,              // used when the warning time is long enough; shorter warnings add a starting speed
    firstAt: 0.6,             // seconds into the run
    gapJitter: [0.75, 1.25],  // each gap is dropGap x a number in this range
    aimChance: 0.25,          // share of coconuts aimed at the player (0.45 on the step 1 island; the deck is 40% of its area)
    aimRadius: 3.4,           // aimed coconuts land within this distance of the player (2.6 in step 1)
    edgeMargin: 0.4,          // random drops stay this far inside the deck edge
    minSeparation: 1.3,       // falling items keep this far apart
    volleyFromT: 35,          // seconds; a coconut can bring two friends from here on
    volleyChance: 0.25,
    coconutLinger: 0.9,       // seconds a landed coconut stays
    maxPerFrame: 3,
  },

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
