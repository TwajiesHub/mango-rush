// Mango Rush — every tuning number lives here. Change numbers here, never inline in modules.
// Values come from the Game Design Document; tune them in playtesting.

export const CONFIG = Object.freeze({
  lives: 3,

  player: {
    invulnerable: 1.2,        // seconds after a hit
    // movement, dash, body, camera and footstep numbers are live-tunable: see TUNE below
  },

  // Difficulty keyframes by run time (seconds). Values are interpolated (eased) between keys.
  difficulty: [
    // THRILL PASS A (step 7): the old curve compressed. A 5 s gentle ramp-in, then the run starts at the old 60 s values, reaches the old
    // 150 s values by 90 s and the old 240 s values by 150 s. (The phases below keep their times: they drive the coconut mix and the look.)
    { t: 0,   dropGap: 1.6,  coconutShare: 0.15, warn: 1.2,  goldenChance: 0.0 },
    { t: 5,   dropGap: 1.0,  coconutShare: 0.30, warn: 1.0,  goldenChance: 0.05 },
    { t: 90,  dropGap: 0.52, coconutShare: 0.52, warn: 0.75, goldenChance: 0.12 },
    { t: 150, dropGap: 0.31, coconutShare: 0.66, warn: 0.5,  goldenChance: 0.20 },
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

  // Sawtooth pacing (step 5a). The difficulty table is the overall trend; a WAVE multiplies it: over each `length` seconds the drop
  // gap tightens and the coconut share rises by up to `peak` (+25%), then a `breather` follows: the gap widens x`breatherGap`, the
  // coconut share is multiplied by `breatherShare`, and from dusk one golden mango is guaranteed in it. The first `calmFor` seconds
  // ease the wave in. All times come from here, never from the rng, so every player and every Daily Run gets the same timeline.
  waves: { length: 25, breather: 3, peak: 0.25, breatherGap: 1.6, breatherShare: 0.5, calmFor: 5, goldenFromT: 60 },
  earlyGolden: { from: 8, to: 14 },     // every run has one golden mango at an rng-chosen moment in this window

  // Coconut types (step 5a). `bags` = how many of each type go in the shuffle bag, per phase (8 entries each).
  coconuts: {
    bags: {
      golden:   { normal: 6, slow: 2, fast: 0, drifter: 0, late: 0 },
      dusk:     { normal: 3, slow: 2, fast: 2, drifter: 1, late: 0 },
      night:    { normal: 2, slow: 1, fast: 2, drifter: 2, late: 1 },
      midnight: { normal: 1, slow: 1, fast: 2, drifter: 2, late: 2 },
    },
    maxRun: 3,                // the dealer never deals more than this many of one type in a row
    minLock: 0.35,            // every landing spot is locked at least this long before impact
    slow:    { warn: 1.6, hangY: 6, hangUntil: 0.8, spacing: 0.6, dotSize: 1.15 },   // hangs at hangY (wobbling) until hangUntil, then falls
    fast:    { warn: 0.45, spacing: 1.3, dotSize: 0.85, pulse: 5, pulseAmt: 0.35 },  // the one exception to minWarn
    drifter: { minWarn: 1.1, drift: 1.5, trail: 0.5 },    // the spot slides up to `drift` units sideways, then locks minLock before impact
    late:    { minWarn: 1.0, lockBefore: 0.4, lag: 0.4, follow: 12, pulse: 3 },      // the ring trails the player by `lag` s, locks `lockBefore` s before impact
    mercy: { time: 1.5, radius: 1.2 },        // after a hit no coconut targets or locks within `radius` of where the player stood
    aloneFor: 2,              // a type's first appearance in a run falls with nothing else landing within this many seconds
  },

  // Scripted happenings (step 8), all on the RUN CLOCK; play/timeline.js builds them (drawing from the happenings rng at reset only).
  happenings: {
    warnTime: 2,              // HAPPENING_WARN this many seconds before each scripted happening
    bridge: { t: 86, length: 10 },                 // Lights out: the bridge passes over the barge
    darkFade: 1, darkLevel: 0.25,                  // 1 s fade in / out; the scene keeps about this share of its light
    gusts: [{ t: 118, length: 6 }, { t: 180, length: 6 }],   // step 12: the first gust moved from 120 s to 118 s (the latest time in 100-118 that is 4 s clear of the shower and that >= 35% of the bot's 0.5 runs reach)
    gustStrength: 1.2, gustEase: 0.5, gustCone: 30,  // units / second; ease in and out; mostly sideways: within this many degrees of left or right
    bigone: { spawnAt: 207, warn: 3, holdFrom: 206, holdTo: 211, bonus: 500 },   // lands at 210 s; every other drop is held 206..211
    showers: [98, 152, 215], showerLength: 3, showerCount: 10, showerAfter: 0.5, showerWarn: 1.0,   // ~10 mangoes over 3 s, no coconut lands in it or the 0.5 s after
  },
  bigRadius: 3.0,             // The Big One's hit radius (its ring closes to this)
  volleys: { fromPhase: 'night', size: [2, 3], chance: 0.3 },
  // the fruit bat: from 'from' s, every 'every' s (all times drawn at reset); a straight path across the deck shown as dots 'warn' s ahead
  bat: { from: 60, every: [25, 40], count: 30, warn: 1.0, swoop: 0.8, width: 0.8, buffer: 4, bodyRadius: 0.45, playerRadius: 0.4 },
  happeningWarnTime: 2,

  // Thrill pass A (step 7): lead-aimed coconuts, patterns at every wave peak, golden mango = double danger. All of it is drawn from the run rng
  // with a fixed number of draws per spawn event (play/drops.js header), so the Daily Run is the same for everyone.
  thrill: {
    leadTime: 0.5,            // a leading coconut lands where the player will be in this many seconds (position + velocity x leadTime)
    leadShare: 0.5,           // share of the aimed coconuts that lead
    leadJitter: 0.6,          // ...give or take this many units
    patterns: {
      from: 20,               // from this run time, at every wave peak (the last `peakWindow` seconds of each wave) one pattern falls
      peakWindow: 2.5,
      warnMin: 0.9,           // pattern coconuts are normal ones with at least this warning, rings honest as always
      line: { min: 4, step: 1.5, ahead: 1.6 },          // 4-5 coconuts in a row across the player's path
      cage: { count: 6, radius: 2.2, gap: 1.6 },        // 6 around the player, ONE gap this wide (free passage between two hit circles)
      sweep: { count: 5, step: 0.15 },                  // a wall of 5 across the deck landing 0.15 s apart
    },
    hot: { share: 2, shareCap: 0.92, near: 2.5, nearShare: 0.5, tellHz: 2.5 },   // a live golden mango: twice the coconuts, half of them near it
  },

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
    followZeta: 1,            // (the follow frequency is TUNE.camFollowFreq)
    poseFreq: 2.2,            // how fast the camera glides between menu / play / over poses
    over: { farther: 1.12, higherDeg: 5, drift: 0.7, stand: [-0.62], standPhone: -1.34 },   // stand: where the character stands on a wide screen (ndc x), standPhone: the lens shift on a phone (the poster card fills the lower part)
    // the start-screen camera: position, tilt, where the horizon sits (share from the top) and where the character stands
    menu: {
      landscape: { pos: [-2.0, 2.4, 8.0], pitchDeg: 8, horizonFrac: 0.62, stand: [0, -3.2] },
      portrait: { pos: [0, 1.5, 14.5], pitchDeg: 3, horizonFrac: 0.37, stand: [0, 0] },
    },
  },

  world: {
    flowSpeed: 1.2,           // how fast the water streams past the barge (units / second)
  },

  // The journey (step 6): world/journey.js and the deck's lights and wet edges (world/barge.js). Everything is tied to RUN TIME
  // (state.time), never to the rng, so the Daily Run is the same for everyone. Layer speeds are in screen-height units per second
  // (1 unit = half the screen height); the barge drifts to screen-left, so scenery moves left to right.
  journey: {
    places: [                 // PLACE_ENTER: when the new place's scenery starts to enter the screen
      { id: 'makoko', t: 0 },
      { id: 'mangroves', t: 35 },
      { id: 'bridge', t: 70 },
      { id: 'waterfront', t: 110 },
      { id: 'city', t: 150 },
      { id: 'open', t: 210 },
    ],
    blend: 4,                 // seconds a phase takes to blend into the next (colours, light)
    speeds: { far: 0.018, bank: 0.07, fg: 0.3 },
    sunSink: { from: 60, to: 150, drop: 0.46 },   // the sun sinks by this many units over dusk (it sets below the bank)
    moonY: { night: 0.3, midnight: 0.4 },
    // colours and light per phase. sky: four bands from the top down; lit = how strongly the lit windows / lanterns glow
    palettes: {
      golden: {
        sky: ['#D9472F', '#E4573D', '#EB6A47', '#F07F55'], cloud: '#F4916A', water: '#1FA39A', bank: '#0F3D2E', sun: '#ffffff', streak: '#F2A93B',
        deck: '#ffffff', key: ['#fff0d8', 0.95], hemi: ['#ffe6c4', '#9a6a4a', 0.35], rim: ['#bcd6ff', 0], stars: 0, litBank: 0, litFar: 0, farK: 0.2,
      },
      dusk: {
        sky: ['#3A1634', '#5A2140', '#A33A4A', '#E4573D'], cloud: '#8A3A55', water: '#12726F', bank: '#0C2B2A', sun: '#ffb59a', streak: '#E8803A',
        deck: '#efd0b2', key: ['#ffc89a', 0.82], hemi: ['#f0b090', '#6a4a5a', 0.36], rim: ['#bcd6ff', 0.4], stars: 0, litBank: 1, litFar: 0.25, farK: 0.35,
      },
      night: {
        sky: ['#0B0B0C', '#0D1626', '#12243A', '#1B3550'], cloud: '#16263A', water: '#123A4A', bank: '#060F12', sun: '#331a1a', streak: '#F2B04A',
        deck: '#8a9ac2', key: ['#a9bde8', 0.78], hemi: ['#8aa0d0', '#3a3a55', 0.5], rim: ['#c4dcff', 2.8], stars: 1, litBank: 1, litFar: 1, farK: 0.6,
      },
      midnight: {
        sky: ['#0B0B0C', '#0D1626', '#12243A', '#1B3550'], cloud: '#16263A', water: '#123A4A', bank: '#060F12', sun: '#331a1a', streak: '#F2B04A',
        deck: '#8a9ac2', key: ['#a9bde8', 0.78], hemi: ['#8aa0d0', '#3a3a55', 0.5], rim: ['#c4dcff', 2.8], stars: 1, litBank: 1, litFar: 1, farK: 0.6,
      },
    },
    // wet edges (from dusk): a band along the walkable ellipse's edge; grip is slippery, never forbidden. Width = share of the radius.
    wet: { from: 60, to: 210, frac: 0.18, grip: 0.55, ramp: 0.04 },
    lantern: { from: 60, fade: 3, flicker: 0.06 },   // the four lantern posts light up from dusk (fade seconds)
    // ambient life (pooled; allocation free). Fireworks are SOFT and never flash more than 3 times a second (see journey.js).
    birds: { every: [15, 20], count: 5, speed: 0.22 },
    bats: { every: [7, 11], count: 3, speed: 0.3 },
    fireflies: 10,
    fireworks: { every: [3, 5.5], dur: 1.8, flash: 0.09, minGap: 1.2 },
  },

  // Falling items (play/drops.js). Fall time is the warning time from `difficulty`, so the ring tells the truth.
  drops: {
    height: 16,               // spawn height above the ground
    gravity: 22,              // used when the warning time is long enough; shorter warnings add a starting speed
    firstAt: 0.6,             // seconds into the run
    gapJitter: [0.75, 1.25],  // each gap is dropGap x a number in this range
    aimChance: 0.35,          // share of coconuts aimed at the player, from the start (step 7). Half of them LEAD the player (see `thrill`)
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
    swoopBonus: 1.5,          // a mango caught while dashing pays +50%
    plankMult: 2,             // a catch made on the golden plank pays x2 (before the multiplier)
    slamBonus: 0.1,           // dashing into a bank spot adds 10% to the pot
  },

  // The pot and the deck (step 5b)
  bank: { radius: 1.1, hintPot: 1000, hintMs: 3500, hintHighlight: 6 },   // a bank spot; the one-time hint shows when the pot first reaches hintPot, and the nearest spot pulses for hintHighlight s
  // the countdown before every run (step 12) and the first-run warm-up
  countdown: { step: 0.6, goHold: 0.6 },   // 3, 2, 1 each step seconds apart, then GO (the run starts at GO); GO stays on screen goHold s
  warmup: { moveDistance: 1.6, gap: 0.5, mangoWarn: 2.5, coconutWarn: 3.2, maxStep: [10, 9, 5.5, 8], readyHold: 1.1 },   // seconds / units; maxStep: the longest each hint waits for the player
  plank: { from: 20, every: 15, warn: 1, width: 1.5, length: 3, picks: 40 },   // the golden plank: first seen at `from` s, moves every `every` s
  juice: { radius: 0.9, life: 10, fade: 2, grip: 0.35, max: 6 },   // a rotten mango's juice patch: it is slippery until it fades

  madness: {
    fillSeconds: 6,           // seconds held at x5 to fill the meter
    duration: 8,
    perCatchBonus: 0.3,
    pointsMultiplier: 2,
  },

  medals: [                   // step 12: from the bot (40 runs each, seeds 1-40): bronze ~ the median at reaction 0.5, silver ~ its 90th percentile, gold ~ the median at 0.35, diamond ~ its 90th percentile
    { id: 'bronze', score: 15500 },
    { id: 'silver', score: 21500 },
    { id: 'gold', score: 35500 },
    { id: 'diamond', score: 43000 },
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
    gameOver:     { freeze: 180, shake: 0.6,  decay: 6,  squash: 1,    squashMs: 0,   particles: 40, color: '#F2A93B', slowMo: { scale: 0.2, seconds: 0.5 }, implode: 28, fadeSeconds: 0.4 },
    // step 9: every scoring event
    potBanked:    { freeze: 30,  shake: 0.10, decay: 16, squash: 1.2,  squashMs: 60,  particles: 24, color: '#F2A93B' },   // saffron coins rising from the bank spot
    slamBank:     { freeze: 60,  shake: 0.18, decay: 14, squash: 1.35, squashMs: 70,  particles: 36, color: '#FFD84D', ring: 20 },
    swoop:        { freeze: 0,   shake: 0.04, decay: 20, squash: 1,    squashMs: 0,   particles: 10, color: '#F2A93B' },
    chain:        { freeze: 15,  shake: 0.06, decay: 18, squash: 1,    squashMs: 0,   particles: 12, color: '#FFD84D' },
    potLost:      { freeze: 0,   shake: 0,    decay: 0,  squash: 1,    squashMs: 0,   particles: 0,  color: '#E4573D', shards: 16 },
    batHit:       { freeze: 20,  shake: 0.08, decay: 18, squash: 0.85, squashMs: 60,  particles: 8,  color: '#2A1B30' },
    bigOneSurvived: { freeze: 80, shake: 0.25, decay: 10, squash: 1.3, squashMs: 80,  particles: 40, color: '#FFD84D' },
    snatched:     { freeze: 0,   shake: 0,    decay: 0,  squash: 1,    squashMs: 0,   particles: 6,  color: '#F2A93B' },
    // Mango Madness and the best chase
    madnessStart: { freeze: 60,  shake: 0.12, decay: 14, squash: 1.25, squashMs: 70,  particles: 44, color: '#FFD84D', ring: 28 },
    madnessCatch: { freeze: 0,   shake: 0,    decay: 0,  squash: 1.15, squashMs: 40,  particles: 20, color: '#FFD84D' },
    newBest:      { freeze: 40,  shake: 0.1,  decay: 14, squash: 1.3,  squashMs: 70,  particles: 36, color: '#FFD84D' },
  },

  // step 9: Heartbeat, Mango Madness and the living deck. The Madness storm table is drawn at reset from its own rng (seed ^ tableSeed).
  adrenaline: {
    freezeCap: 200,           // ms: the total freeze in any freezeWindow is at most this
    freezeWindow: 1000,       // ms
    maxPopups: 4,
    heartbeat: { sat: 0.3, fade: 0.6, push: 0.04, pushEase: 0.8 },        // colours drain to `sat` (70% drained); the camera eases in 4%
    madness: {
      tableSeed: 0x51ed270b, tableSeconds: 20, spots: 40,                 // 2 a second, enough for a Madness stretched by catches
      warn: 1.2,              // the ring time of a storm mango
      maxLive: 6,             // at most this many storm mangoes at once (falling or waiting to be caught); a spot over the cap is skipped
      landedLife: 2.5, fadeOut: 0.6,   // an uncaught storm mango waits this long, shrinks away over the last fadeOut seconds, and leaves NO juice patch
      push: 0.08, pushEase: 0.5, endFade: 0.6,
      lightTint: '#FFE9A8', lightTintAmt: 0.5, glowColor: '#FFD84D',
    },
    planks: {
      coconut: { amp: 0.07, radius: 2.0 },                                // a landing coconut: planks within ~2 units dip a few cm, 0.3 s
      big: { jolt: 0.16 },                                                // The Big One: the whole deck jolts
      step: { amp: 0.012, radius: 0.9, minSpeed: 3 },
      seam: { level: 0.34, steady: 0.2 },                                 // night seam glow: it pulses on the music's beat (audio.musicBeat; 105 BPM when the music is off)
    },
  },

  // The music loop (assets/music/loop.mp3): exactly 24 bars at ~105 BPM, 54.862 s, blended so it loops seamlessly when decoded gaplessly (js/audio/loopwindow.js)
  music: { url: 'assets/music/loop.mp3', bpm: 104.99, loopSeconds: 54.862, bars: 24 },

  audio: {
    catchPitchStep: 0.03,     // +3% per combo step
    detune: 0.025,
    duckOnHitDb: -8,
    duckMs: 200,
    // adaptive music (step 11): per phase the lowpass cutoff (Hz) and the playback rate; all glide over glideSeconds
    phases: { golden: [1800, 1.0], dusk: [4000, 1.02], night: [9000, 1.04], midnight: [16000, 1.06] },
    glideSeconds: 2,
    madnessCutoff: 18000, madnessDb: 2,
    heartbeatCutoff: 700,
    darkCutoff: 900,           // Lights out
    duckCutoff: 900, duckDb: -12,   // pause and game over
    startDb: -6,               // the start screen (golden-hour filter, -6 dB)
    silenceDb: -24,            // the happening silence beat
    maxVoices: 24,             // live sound-effect voices; beyond this only loud sounds may still start (up to maxVoices + 6)
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

/**
 * The wave at run time t -> { intensity, breather, index }. intensity is 1 .. 1 + waves.peak (it ramps up over each wave and is eased
 * in over the first waves.calmFor seconds); breather is true in the pause after each wave; index counts the waves from 0.
 * Depends on t and CONFIG only, so it is identical for everyone.
 */
export function waveAt(t) {
  const W = CONFIG.waves;
  const period = W.length + W.breather;
  const index = Math.max(0, Math.floor(t / period));
  const u = t - index * period;
  if (u >= W.length) return { intensity: 1, breather: true, index };
  const calm = Math.min(1, Math.max(0, t / W.calmFor));
  return { intensity: 1 + W.peak * calm * (u / W.length), breather: false, index };
}

/** Mark this run as not ranked (the ?debug N key jumps the clock): tuneIsChanged() is true from now on. */
export function markUnranked() {
  unranked = true;
}

/** Phase id at run time t. */
export function phaseAt(t) {
  let id = CONFIG.phases[0].id;
  for (const p of CONFIG.phases) if (t >= p.t) id = p.id;
  return id;
}

// ---------------------------------------------------------------- live tuning (step 3)
// TUNE is the MUTABLE copy of every feel number: movement, dash, body springs, camera, footsteps. Movement, character,
// camera and audio code read TUNE (never CONFIG) for these, so the ?debug tuning panel (ui/tune.js) can change them live.
// Each row: [key, group, label, default, min, max, step, shownInPanel]. Units are in the label.
const TUNE_ROWS = [
  // movement
  ['speed',        'Movement', 'Top speed (u/s)',        6.4, 3,   10,   0.1, true],
  ['accel',        'Movement', 'Accel (u/s²)',           55,  10,  140,  1,   true],
  ['decel',        'Movement', 'Decel (u/s²)',           45,  10,  140,  1,   true],
  ['turnAccel',    'Movement', 'Turn accel (u/s²)',      95,  20,  220,  1,   true],
  ['keySmooth',    'Movement', 'Keyboard smoothing (/s)', 14, 4,   40,   1,   true],
  ['joySmooth',    'Movement', 'Joystick smoothing (/s)', 30, 10,  60,   1,   false],
  ['turnRate',     'Movement', 'Turn rate (°/s)',        720, 180, 1440, 20,  true],
  ['skidFrac',     'Movement', 'Skid above (share of top speed)', 0.6, 0.3, 0.95, 0.05, false],
  ['skidTime',     'Movement', 'Skid time (s)',          0.15, 0.05, 0.4, 0.01, false],
  // dash
  ['dashSpeed',    'Dash', 'Dash speed (u/s)',           15,  8,   28,   0.5, true],
  ['dashTime',     'Dash', 'Dash time (s)',              0.17, 0.08, 0.4, 0.01, true],
  ['dashCooldown', 'Dash', 'Dash cooldown (s)',          1.1, 0.4, 3,    0.05, true],
  ['dashTurn',     'Dash', 'Dash turn rate (°/s)',       900, 0,   2400, 50,  true],
  ['dashExit',     'Dash', 'Dash exit time (s)',         0.12, 0,  0.4,  0.01, true],
  ['dashBuffer',   'Dash', 'Dash buffer (s)',            0.1, 0,   0.3,  0.01, false],
  ['dashStretch',  'Dash', 'Dash stretch (×)',           1.3, 1,   1.6,  0.05, false],
  ['snapBoost',    'Dash', 'Snap-turn boost (×)',        1.25, 1,  1.6,  0.01, true],
  ['snapTime',     'Dash', 'Snap-turn boost time (s)',   0.25, 0.05, 0.6, 0.01, true],
  ['snapWindow',   'Dash', 'Snap-turn window (s)',       0.12, 0.04, 0.4, 0.01, false],
  ['snapAngle',    'Dash', 'Snap-turn angle (°)',        60,  20,  120,  5,   false],
  // body
  ['leanMax',      'Body', 'Lean max (°)',               12,  0,   30,   1,   true],
  ['leanDash',     'Body', 'Lean in a dash (°)',         18,  0,   40,   1,   false],
  ['leanFreq',     'Body', 'Lean spring (Hz)',           2.2, 0.5, 6,    0.1, true],
  ['leanZeta',     'Body', 'Lean damping',               0.6, 0.2, 1.2,  0.05, true],
  ['trailFreq',    'Body', 'Hair / scarf spring (Hz)',   3.2, 0.8, 8,    0.1, true],
  ['trailZeta',    'Body', 'Hair / scarf damping',       0.4, 0.15, 1,   0.05, true],
  ['stride',       'Body', 'Stride length (u)',          1.1, 0.6, 2,    0.05, true],
  // camera and sound
  ['camFollowFreq', 'Camera and sound', 'Camera follow (Hz)', 1.6, 0.6, 5, 0.1, true],
  ['lookAhead',    'Camera and sound', 'Look-ahead (s)', 0.12, 0, 0.4,  0.01, true],
  ['dashKick',     'Camera and sound', 'Dash kick (u)',  0.15, 0,   0.6,  0.01, false],
  ['stepVolume',   'Camera and sound', 'Footstep volume', 1,  0,   2,    0.05, true],
];

export const TUNE_DEFS = Object.freeze(TUNE_ROWS.map(([key, group, label, def, min, max, step, panel]) => Object.freeze({ key, group, label, def, min, max, step, panel })));
export const TUNE = {};
for (const d of TUNE_DEFS) TUNE[d.key] = d.def;

let tuneChanged = false;
let tuneStamp = 0;
let unranked = false;

// "changed" means a real difference: a quarter of a slider step, so rounding on the way back to the default does not count
function recheck() {
  tuneStamp++;
  tuneChanged = TUNE_DEFS.some((d) => Math.abs(TUNE[d.key] - d.def) > Math.max(1e-6, d.step * 0.25));
}

/** Set one tuning value (clamped to its range). Returns the value actually stored. */
export function setTune(key, value) {
  const d = TUNE_DEFS.find((x) => x.key === key);
  if (!d || !Number.isFinite(value)) return TUNE[key];
  TUNE[key] = Math.min(d.max, Math.max(d.min, value));
  recheck();
  return TUNE[key];
}

/** Back to the defaults. */
export function resetTune() {
  for (const d of TUNE_DEFS) TUNE[d.key] = d.def;
  recheck();
}

/** True while any tuning value really differs from its default. Such runs are never saved to the leaderboard. */
export function tuneIsChanged() {
  return tuneChanged || unranked;
}

/** Changed values only, as a plain object (for copying into a message). */
export function tuneChangedValues() {
  const out = {};
  for (const d of TUNE_DEFS) if (Math.abs(TUNE[d.key] - d.def) > Math.max(1e-6, d.step * 0.25)) out[d.key] = +TUNE[d.key].toFixed(4);
  return out;
}
