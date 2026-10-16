// Mango Rush — scoring, combo, lives and the adrenaline meters.   OWNER: Claude Code  ·  STATUS: done (step 1)
//
// Pure game logic: NO three.js, NO DOM. It writes the scoring fields of `state`
// (see core/state.js) and announces results with emit() (see core/events.js).
//
// IMPORTS ALLOWED: '../core/config.js' (CONFIG), '../core/state.js' (state), '../core/events.js' (EVENTS, emit)
//
// CONTRACT (keep these exact exports and signatures):
//
//   resetScoring() -> void
//     Called at run start. score 0, lives = CONFIG.lives, multiplier 1, comboStep 0, comboTimerFrac 0,
//     madness off and empty, heartbeat false, shield false, stats zeroed (bestMultiplier 1),
//     aheadOfBest = state.best > 0 ? -state.best : null. Internal "best passed" flag cleared.
//
//   updateScoring(dt: number) -> void
//     Called every frame while playing (dt in seconds, already 0 during freeze/pause).
//     - Combo timer: counts down CONFIG.scoring.comboWindow after each catch; comboTimerFrac = left / window.
//       When it reaches 0: wait CONFIG.scoring.comboGrace more; if no catch in the grace, the multiplier
//       DROPS ONE STEP (min 1), comboStep = 0, and if still above 1 the timer restarts at 50% full.
//       Emit COMBO_CHANGE { multiplier, step, stepUp:false, stepDown:true } when it drops.
//     - Madness: while multiplier === max and not active, madnessFrac += dt / CONFIG.madness.fillSeconds.
//       At 1 -> madnessActive = true, madnessTimeLeft = CONFIG.madness.duration, emit MADNESS_START.
//       While active, madnessTimeLeft -= dt; at 0 -> active false, madnessFrac 0, emit MADNESS_END.
//       If the multiplier drops below max while filling, madnessFrac decays at the same rate (not instantly to 0).
//
//   fruitCaught({ type, x, y, z }) -> void        type: 'mango'|'golden'|'rotten'|'shield'
//     - 'mango' / 'golden': points = base (CONFIG.scoring.mango / golden) x multiplier
//         x CONFIG.madness.pointsMultiplier if madnessActive x CONFIG.scoring.heartbeatBonus if heartbeat,
//         rounded to an integer. Add to score. stats.mangoes += 1 (golden also stats.golden += 1).
//         comboStep += 1; when comboStep reaches catchesPerStep and multiplier < max: multiplier += 1,
//         comboStep = 0, emit COMBO_CHANGE { stepUp:true }. Otherwise emit COMBO_CHANGE { stepUp:false, stepDown:false }.
//         Refill the combo timer. If madnessActive, madnessTimeLeft += CONFIG.madness.perCatchBonus.
//         Update stats.bestMultiplier. Emit CATCH { type, x, y, z, points, multiplier }.
//     - 'rotten': no points; multiplier drops ONE step (min 1), comboStep 0; emit CATCH with points 0
//         and COMBO_CHANGE { stepDown:true }.
//     - 'shield': state.shield = true, emit SHIELD_CHANGE { active:true }, emit CATCH with points 0.
//     After any score change: update aheadOfBest (score - best when best > 0); the first time score > best
//     (and best > 0) emit BEST_PASSED { score } once per run.
//
//   coconutLanded({ x, z, dist, invulnerable, perfect, big }) -> 'hit'|'shielded'|'nearmiss'|'perfect'|'none'
//     dist = horizontal distance from the player to the landing point. big = The Big One (radius x 2.5).
//     Use r = CONFIG.hitRadius (x 2.5 when big).
//     - dist <= r and !invulnerable:
//         if state.shield -> shield = false, emit SHIELD_CHANGE {active:false}, emit HIT { x, z, lives, shielded:true } -> 'shielded'
//         else lives -= 1, multiplier 1, comboStep 0, combo timer 0, madness off (emit MADNESS_END if it was on),
//              emit LIVES_CHANGE, COMBO_CHANGE { stepDown:true }, HIT { x, z, lives, shielded:false } -> 'hit'.
//              If lives === 1 -> heartbeat = true, emit HEARTBEAT_START.
//              If lives === 0 -> call endRun() internally (see below).
//     - dist <= r and invulnerable -> 'none'.
//     - perfect === true (player dashed out in the final window; drops.js decides this) ->
//         points = CONFIG.scoring.perfectDodge x multiplier (madness/heartbeat bonuses apply),
//         stats.perfectDodges += 1, emit PERFECT_DODGE { x, z, points } -> 'perfect'.
//     - r < dist <= r + CONFIG.nearMissBand (a near miss: it landed just next to the player) ->
//         points = CONFIG.scoring.nearMiss x multiplier (bonuses apply), stats.nearMisses += 1,
//         add CONFIG.scoring.nearMissTimeBonus seconds to the combo timer (capped at the full window),
//         emit NEAR_MISS { x, z, points } -> 'nearmiss'.
//     - otherwise 'none'.
//
//   scoringSelfTest() -> { ok, failures }   (added in step 1) replays the rules above silently: no events are fired
//     and the state is restored afterwards. Console: window.__mangoTest.scoring() with ?debug in the URL.
//
//   endRun(reason = 'lives') -> RunSummary   (see core/state.js for the RunSummary fields)
//     Builds the summary from state + stats (timeSurvived = state.time, reachedPhase = state.phase,
//     medal = highest CONFIG.medals threshold reached or 'none', nextMedal = next threshold or null;
//     nextMedal.name is the medal id, screens.js turns it into words with TEXT.medals).
//     isBest/best are filled in by main.js after saving (set isBest:false, best: state.best here).
//     Emits RUN_END with the summary and returns it. Must only fire once per run.
//
// RULES: no DOM, no three.js, no timers (setTimeout/setInterval) — everything advances in updateScoring(dt).

import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, emit } from '../core/events.js';

const S = CONFIG.scoring;

let comboLeft = 0;      // seconds left in the combo window
let inGrace = false;    // window ran out; waiting out the grace period
let graceLeft = 0;
let bestPassed = false;
let ended = false;
let silent = false;     // the self-check runs with events switched off

function fire(name, payload) { if (!silent) emit(name, payload); }

export function resetScoring() {
  state.score = 0;
  state.lives = CONFIG.lives;
  state.multiplier = 1;
  state.comboStep = 0;
  state.comboTimerFrac = 0;
  state.madnessFrac = 0;
  state.madnessActive = false;
  state.madnessTimeLeft = 0;
  state.heartbeat = false;
  state.shield = false;
  state.aheadOfBest = state.best > 0 ? -state.best : null;
  state.stats = { mangoes: 0, golden: 0, nearMisses: 0, perfectDodges: 0, bestMultiplier: 1 };
  comboLeft = 0;
  inGrace = false;
  graceLeft = 0;
  bestPassed = false;
  ended = false;
}

function dropStep() {
  const dropped = state.multiplier > 1;
  const hadStep = state.comboStep > 0;
  if (dropped) state.multiplier -= 1;
  state.comboStep = 0;
  inGrace = false;
  comboLeft = state.multiplier > 1 ? S.comboWindow * 0.5 : 0;
  if (dropped || hadStep) {
    fire(EVENTS.COMBO_CHANGE, { multiplier: state.multiplier, step: 0, stepUp: false, stepDown: dropped });
  }
}

export function updateScoring(dt) {
  if (ended) return;
  if (comboLeft > 0) {
    comboLeft -= dt;
    if (comboLeft <= 0) { comboLeft = 0; inGrace = true; graceLeft = S.comboGrace; }
  } else if (inGrace) {
    graceLeft -= dt;
    if (graceLeft <= 0) dropStep();
  }
  state.comboTimerFrac = comboLeft / S.comboWindow;

  const rate = dt / CONFIG.madness.fillSeconds;
  if (state.madnessActive) {
    state.madnessTimeLeft -= dt;
    if (state.madnessTimeLeft <= 0) {
      state.madnessActive = false;
      state.madnessTimeLeft = 0;
      state.madnessFrac = 0;
      fire(EVENTS.MADNESS_END, {});
    }
  } else if (state.multiplier === S.maxMultiplier) {
    state.madnessFrac = Math.min(1, state.madnessFrac + rate);
    if (state.madnessFrac >= 1) {
      state.madnessActive = true;
      state.madnessTimeLeft = CONFIG.madness.duration;
      fire(EVENTS.MADNESS_START, {});
    }
  } else if (state.madnessFrac > 0) {
    state.madnessFrac = Math.max(0, state.madnessFrac - rate);
  }
}

// base x multiplier, then the Madness and last-life bonuses, rounded.
function award(base) {
  let pts = base * state.multiplier;
  if (state.madnessActive) pts *= CONFIG.madness.pointsMultiplier;
  if (state.heartbeat) pts *= S.heartbeatBonus;
  return Math.round(pts);
}

function addScore(points) {
  state.score += points;
  if (state.best > 0) {
    state.aheadOfBest = state.score - state.best;
    if (!bestPassed && state.score > state.best) {
      bestPassed = true;
      fire(EVENTS.BEST_PASSED, { score: state.score });
    }
  }
}

export function fruitCaught({ type, x, y, z }) {
  if (ended) return;
  if (type === 'mango' || type === 'golden') {
    const points = award(type === 'golden' ? S.golden : S.mango);
    state.stats.mangoes += 1;
    if (type === 'golden') state.stats.golden += 1;
    state.comboStep += 1;
    let stepUp = false;
    if (state.comboStep >= S.catchesPerStep && state.multiplier < S.maxMultiplier) {
      state.multiplier += 1;
      state.comboStep = 0;
      stepUp = true;
    }
    state.stats.bestMultiplier = Math.max(state.stats.bestMultiplier, state.multiplier);
    comboLeft = S.comboWindow;
    inGrace = false;
    state.comboTimerFrac = 1;
    if (state.madnessActive) state.madnessTimeLeft += CONFIG.madness.perCatchBonus;
    addScore(points);
    fire(EVENTS.COMBO_CHANGE, { multiplier: state.multiplier, step: state.comboStep, stepUp, stepDown: false });
    fire(EVENTS.CATCH, { type, x, y, z, points, multiplier: state.multiplier });
  } else if (type === 'rotten') {
    const dropped = state.multiplier > 1;
    if (dropped) state.multiplier -= 1;
    state.comboStep = 0;
    fire(EVENTS.CATCH, { type, x, y, z, points: 0, multiplier: state.multiplier });
    fire(EVENTS.COMBO_CHANGE, { multiplier: state.multiplier, step: 0, stepUp: false, stepDown: dropped });
  } else if (type === 'shield') {
    state.shield = true;
    fire(EVENTS.SHIELD_CHANGE, { active: true });
    fire(EVENTS.CATCH, { type, x, y, z, points: 0, multiplier: state.multiplier });
  }
}

export function coconutLanded({ x, z, dist, invulnerable, perfect, big }) {
  if (ended) return 'none';
  const r = CONFIG.hitRadius * (big ? 2.5 : 1);
  if (dist <= r) {
    if (invulnerable) return 'none';
    if (state.shield) {
      state.shield = false;
      fire(EVENTS.SHIELD_CHANGE, { active: false });
      fire(EVENTS.HIT, { x, z, lives: state.lives, shielded: true });
      return 'shielded';
    }
    state.lives -= 1;
    state.multiplier = 1;
    state.comboStep = 0;
    comboLeft = 0;
    inGrace = false;
    state.comboTimerFrac = 0;
    if (state.madnessActive) fire(EVENTS.MADNESS_END, {});
    state.madnessActive = false;
    state.madnessTimeLeft = 0;
    state.madnessFrac = 0;
    fire(EVENTS.LIVES_CHANGE, { lives: state.lives });
    fire(EVENTS.COMBO_CHANGE, { multiplier: 1, step: 0, stepUp: false, stepDown: true });
    fire(EVENTS.HIT, { x, z, lives: state.lives, shielded: false });
    if (state.lives === 1) {
      state.heartbeat = true;
      fire(EVENTS.HEARTBEAT_START, {});
    } else if (state.lives <= 0) {
      if (state.heartbeat) fire(EVENTS.HEARTBEAT_END, {});
      state.heartbeat = false;
      endRun('lives');
    }
    return 'hit';
  }
  if (perfect) {
    const points = award(S.perfectDodge);
    state.stats.perfectDodges += 1;
    addScore(points);
    fire(EVENTS.PERFECT_DODGE, { x, z, points });
    return 'perfect';
  }
  if (dist <= r + CONFIG.nearMissBand) {
    const points = award(S.nearMiss);
    state.stats.nearMisses += 1;
    addScore(points);
    if (comboLeft > 0 || inGrace || state.multiplier > 1 || state.comboStep > 0) {
      comboLeft = Math.min(S.comboWindow, comboLeft + S.nearMissTimeBonus);
      inGrace = false;
    }
    fire(EVENTS.NEAR_MISS, { x, z, points });
    return 'nearmiss';
  }
  return 'none';
}

export function endRun(reason = 'lives') {
  if (ended) return null;
  ended = true;
  let medal = 'none';
  let nextMedal = null;
  for (const m of CONFIG.medals) {
    if (state.score >= m.score) medal = m.id;
    else if (!nextMedal) nextMedal = { name: m.id, threshold: m.score };
  }
  const summary = {
    mode: state.mode,
    score: state.score,
    timeSurvived: state.time,
    reachedPhase: state.phase,
    mangoes: state.stats.mangoes,
    golden: state.stats.golden,
    nearMisses: state.stats.nearMisses,
    perfectDodges: state.stats.perfectDodges,
    bestMultiplier: state.stats.bestMultiplier,
    medal,
    nextMedal,
    isBest: false,
    best: state.best,
    reason,
  };
  fire(EVENTS.RUN_END, summary);
  return summary;
}

// ---------------------------------------------------------------- self-check (?debug -> window.__mangoTest.scoring())
export function scoringSelfTest() {
  const keep = JSON.parse(JSON.stringify(state));
  const keepInternal = { comboLeft, inGrace, graceLeft, bestPassed, ended };
  const failures = [];
  const check = (name, cond) => { if (!cond) failures.push(name); };
  const mango = () => fruitCaught({ type: 'mango', x: 0, y: 0, z: 0 });
  const land = (dist, extra = {}) => coconutLanded({ x: 0, z: 0, dist, invulnerable: false, perfect: false, big: false, ...extra });
  silent = true;
  try {
    state.best = 0; state.mode = 'free'; state.time = 0; state.phase = 'golden';
    resetScoring();
    mango();
    check('first mango = 100', state.score === 100);
    for (let i = 0; i < 4; i++) mango();
    check('5 catches -> x2', state.multiplier === 2 && state.comboStep === 0 && state.score === 500);
    fruitCaught({ type: 'golden', x: 0, y: 0, z: 0 });
    check('golden at x2 = 1000', state.score === 1500);
    updateScoring(S.comboWindow + 0.01);
    check('timer empty -> grace, still x2', state.multiplier === 2 && state.comboTimerFrac === 0);
    updateScoring(S.comboGrace + 0.01);
    check('grace over -> x1', state.multiplier === 1);
    check('near miss', land(CONFIG.hitRadius + 0.2) === 'nearmiss');
    check('far miss', land(5) === 'none');
    check('invulnerable', land(0.2, { invulnerable: true }) === 'none' && state.lives === 3);
    fruitCaught({ type: 'shield', x: 0, y: 0, z: 0 });
    check('shield blocks', land(0.2) === 'shielded' && state.lives === 3 && !state.shield);
    check('hit costs a life', land(0.2) === 'hit' && state.lives === 2);
    land(0.2);
    check('last life -> heartbeat', state.lives === 1 && state.heartbeat);
    const before = state.score;
    mango();
    check('heartbeat bonus x1.5', state.score - before === 150);
    land(0.2);
    check('0 lives ends the run', ended && state.lives === 0);
    check('endRun fires once', endRun() === null);
    // Madness: hold x5 until the meter fills
    resetScoring();
    for (let i = 0; i < 20; i++) mango();
    check('x5 after 20 catches', state.multiplier === 5);
    for (let i = 0; i < 70; i++) { updateScoring(0.1); if (i % 10 === 0) mango(); }
    check('madness starts after fillSeconds at x5', state.madnessActive);
  } catch (err) {
    failures.push('threw: ' + err.message);
  } finally {
    silent = false;
    Object.assign(state, keep);
    ({ comboLeft, inGrace, graceLeft, bestPassed, ended } = keepInternal);
  }
  return { ok: failures.length === 0, failures };
}
