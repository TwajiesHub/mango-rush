// Mango Rush — scoring, the pot, skills, combo, lives and the adrenaline meters.   OWNER: Claude Code  ·  STATUS: step 5b (the pot)
//
// Pure game logic: NO three.js, NO DOM. It writes the scoring fields of `state`
// (see core/state.js) and announces results with emit() (see core/events.js).
//
// IMPORTS ALLOWED: '../core/config.js' (CONFIG), '../core/state.js' (state), '../core/events.js' (EVENTS, emit, on)
//
// THE POT (step 5b). Every point earned (catches, near misses, Perfect dodges, skill bonuses) goes into state.pot, NOT state.score.
// state.score is the BANKED score: it only ever goes up, and it is what the best, the medals, aheadOfBest, BEST_PASSED and the
// leaderboard use. The pot leaves in one of three ways:
//   - bankPot({ slam, x, z }): the player walked (or, slam: dashed) into a bank spot (play/bank.js). Adds the pot to the score (a Slam
//     adds 10% first, rounded), empties it, and costs the momentum: multiplier x1, comboStep 0, combo timer 0.
//   - auto-bank: the combo ends naturally (the window plus the grace run out at x1 with no catch): the pot banks by itself, no
//     Slam bonus, no loss of momentum (there is none left). Any points earned while no combo is running start a combo timer, so a
//     pot made only of near misses banks the same way.
//   - a coconut HIT loses the whole pot (the calabash shield blocks the hit, so the pot is safe). A rotten mango only drops the combo.
//   At the end of the run an unbanked pot is lost.
// RunSummary.potLost is ONLY what was lost at the end of the run (the final hit, or an unbanked pot when the run is ended).
// stats.potLostTotal is the running total of every loss (for the bot and ?debug; never shown to players).
//
// SKILLS. fruitCaught({ ..., dashing, onPlank }): a mango caught while dashing is a SWOOP (+50% for that catch); a catch made while
// standing on the golden plank pays x2 (before the multiplier). A Swoop emits SWOOP (player.js refills the dash: that is the Chain
// engine). The chain counts up when a Swoop is made in a NEW dash (one that started after the previous Swoop); it resets when a dash
// ends without a Swoop (EVENTS.DASH / EVENTS.DASH_END, which this module listens to).
//   bankPot({ slam = false, x = 0, z = 0, auto = false }) -> number   the amount added to the score (0 when the pot was empty)
// HAPPENINGS (step 8):
//   batHit({ x, z }) -> boolean   the fruit bat touched the player: the combo drops ONE step (min x1, comboStep 0) with dropStep's rules: a half window
//     if still above x1 (or just drained to x1 with a pot), otherwise the combo has ended and a pot banks by itself. No life, no pot loss, the shield is not used. Emits COMBO_CHANGE { stepDown } and BAT_HIT { x, z }.
//   bigOneSurvived({ x, z }) -> number   the player escaped The Big One's ring: CONFIG.happenings.bigone.bonus (500) goes into the pot, flat (no
//     multiplier). Emits BIGONE_SURVIVED { x, z, bonus }. (drops.js calls it only when the player was OUTSIDE the ring: a shield-blocked or
//     invulnerable landing earns nothing.) coconutLanded({ big: true }) uses CONFIG.bigRadius (3.0) as the hit radius.
//   Events: POT_CHANGE { pot }, POT_BANKED { amount, slam, auto, x, z }, POT_LOST { amount, x, z }, SWOOP { x, z, points, chain },
//           SLAM_BANK { x, z, amount, bonus }.   CATCH also carries { swoop, plank, chain }.
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
import { EVENTS, emit, on } from '../core/events.js';

const S = CONFIG.scoring;

let comboLeft = 0;      // seconds left in the combo window
let inGrace = false;    // window ran out; waiting out the grace period
let graceLeft = 0;
let bestPassed = false;
let ended = false;
let silent = false;     // the self-check runs with events switched off
let dashId = 0;         // counts the dashes of this run (Chain)
let lastSwoopDash = -1;
let chain = 0;
let potLostEnd = 0;     // lost at the end of the run: what the game-over screen shows
let lastHitLoss = 0;

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
  state.pot = 0;
  state.stats = {
    mangoes: 0, golden: 0, nearMisses: 0, perfectDodges: 0, bestMultiplier: 1,
    banks: 0, slams: 0, bestBank: 0, swoops: 0, bestChain: 0, potLostTotal: 0,
  };
  dashId = 0;
  lastSwoopDash = -1;
  chain = 0;
  potLostEnd = 0;
  lastHitLoss = 0;
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
  // draining from x2 to x1 gives one more half window at x1 while there is a pot to keep; at x1 the combo has ended
  comboLeft = state.multiplier > 1 || (dropped && state.pot > 0) ? S.comboWindow * 0.5 : 0;
  if (!dropped && comboLeft === 0 && state.pot > 0) bankPot({ auto: true });   // the combo ended naturally: the pot banks by itself
  if (dropped || hadStep) {
    fire(EVENTS.COMBO_CHANGE, { multiplier: state.multiplier, step: 0, stepUp: false, stepDown: dropped });
  }
}

export function updateScoring(dt) {
  if (ended) return;
  if (comboLeft > 0) {
    comboLeft -= dt;
    if (comboLeft <= 0) {
      const over = -comboLeft;                 // the time this update ran past the end of the window counts against the grace
      comboLeft = 0;
      inGrace = true;
      graceLeft = S.comboGrace - over;
      if (graceLeft <= 0) dropStep();
    }
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

// base x factor x multiplier, then the Madness and last-life bonuses, rounded.
function award(base, factor = 1) {
  let pts = base * factor * state.multiplier;
  if (state.madnessActive) pts *= CONFIG.madness.pointsMultiplier;
  if (state.heartbeat) pts *= S.heartbeatBonus;
  return Math.round(pts);
}

// points earned go to the POT. When no combo is running they start a combo timer, so the pot still banks by itself at the end of it.
function addPot(points) {
  if (points <= 0) return;
  state.pot += points;
  if (comboLeft <= 0 && !inGrace) { comboLeft = S.comboWindow; state.comboTimerFrac = 1; }
  fire(EVENTS.POT_CHANGE, { pot: state.pot });
}

// banked points: the score only ever goes up
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

export function fruitCaught({ type, x, y, z, dashing: dash = false, onPlank = false }) {
  if (ended) return;
  if (type === 'mango' || type === 'golden') {
    const swoop = !!dash;
    const points = award(type === 'golden' ? S.golden : S.mango, (swoop ? S.swoopBonus : 1) * (onPlank ? S.plankMult : 1));
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
    addPot(points);
    if (swoop) {
      state.stats.swoops += 1;
      if (chain === 0 || lastSwoopDash !== dashId) chain += 1;   // a Swoop in a new dash extends the chain
      lastSwoopDash = dashId;
      state.stats.bestChain = Math.max(state.stats.bestChain, chain);
    }
    fire(EVENTS.COMBO_CHANGE, { multiplier: state.multiplier, step: state.comboStep, stepUp, stepDown: false });
    fire(EVENTS.CATCH, { type, x, y, z, points, multiplier: state.multiplier, swoop, plank: !!onPlank, chain });
    if (swoop) fire(EVENTS.SWOOP, { x, z, points, chain });
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

function loseHitPot(x, z) {
  lastHitLoss = state.pot;
  if (state.pot <= 0) return;
  const amount = state.pot;
  state.pot = 0;
  state.stats.potLostTotal += amount;
  fire(EVENTS.POT_LOST, { amount, x, z });
  fire(EVENTS.POT_CHANGE, { pot: 0 });
}

/** Add the pot to the score. slam: +10% first (rounded). Returns the amount banked (0 when the pot was empty). */
export function bankPot({ slam = false, x = 0, z = 0, auto = false } = {}) {
  if (ended || state.pot <= 0) return 0;
  const pot = state.pot;
  const isSlam = slam && !auto;
  const amount = isSlam ? Math.round(pot * (1 + S.slamBonus)) : pot;
  state.pot = 0;
  state.stats.banks += 1;
  if (isSlam) state.stats.slams += 1;
  state.stats.bestBank = Math.max(state.stats.bestBank, amount);
  if (!auto) {
    // banking costs the momentum: that is the decision
    const hadCombo = state.multiplier > 1 || state.comboStep > 0;
    const dropped = state.multiplier > 1;
    state.multiplier = 1;
    state.comboStep = 0;
    comboLeft = 0;
    inGrace = false;
    state.comboTimerFrac = 0;
    if (hadCombo) fire(EVENTS.COMBO_CHANGE, { multiplier: 1, step: 0, stepUp: false, stepDown: dropped });
  }
  addScore(amount);
  fire(EVENTS.POT_CHANGE, { pot: 0 });
  fire(EVENTS.POT_BANKED, { amount, slam: isSlam, auto, x, z });
  if (isSlam) fire(EVENTS.SLAM_BANK, { x, z, amount, bonus: amount - pot });
  return amount;
}

on(EVENTS.DASH, () => { dashId += 1; });
on(EVENTS.DASH_END, () => {
  if (lastSwoopDash !== dashId) chain = 0;   // a dash that ended without a Swoop breaks the chain
});

export function coconutLanded({ x, z, dist, invulnerable, perfect, big }) {
  if (ended) return 'none';
  const r = big ? CONFIG.bigRadius : CONFIG.hitRadius;
  if (dist <= r) {
    if (invulnerable) return 'none';
    if (state.shield) {
      state.shield = false;
      fire(EVENTS.SHIELD_CHANGE, { active: false });
      fire(EVENTS.HIT, { x, z, lives: state.lives, shielded: true });
      return 'shielded';
    }
    state.lives -= 1;
    loseHitPot(x, z);
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
      potLostEnd += lastHitLoss;   // the pot lost on the final hit is the one the game-over screen mentions
      endRun('lives');
    }
    return 'hit';
  }
  if (perfect) {
    const points = award(S.perfectDodge);
    state.stats.perfectDodges += 1;
    addPot(points);
    fire(EVENTS.PERFECT_DODGE, { x, z, points });
    return 'perfect';
  }
  if (dist <= r + CONFIG.nearMissBand) {
    const points = award(S.nearMiss);
    state.stats.nearMisses += 1;
    addPot(points);
    if (comboLeft > 0 || inGrace || state.multiplier > 1 || state.comboStep > 0) {
      comboLeft = Math.min(S.comboWindow, comboLeft + S.nearMissTimeBonus);
      inGrace = false;
    }
    fire(EVENTS.NEAR_MISS, { x, z, points });
    return 'nearmiss';
  }
  return 'none';
}

export function batHit({ x = 0, z = 0 } = {}) {
  if (ended) return false;
  const dropped = state.multiplier > 1;
  const hadStep = state.comboStep > 0;
  if (dropped) state.multiplier -= 1;
  state.comboStep = 0;
  inGrace = false;
  // the same rules as dropStep: a half window when the combo is still alive (or drained to x1 with a pot to keep); at x1 the combo has ended,
  // so a pot banks by itself at once
  comboLeft = state.multiplier > 1 || (dropped && state.pot > 0) ? S.comboWindow * 0.5 : 0;
  state.comboTimerFrac = comboLeft / S.comboWindow;
  if (!dropped && comboLeft === 0 && state.pot > 0) bankPot({ auto: true });
  if (dropped || hadStep) fire(EVENTS.COMBO_CHANGE, { multiplier: state.multiplier, step: 0, stepUp: false, stepDown: dropped });
  fire(EVENTS.BAT_HIT, { x, z });
  return dropped;
}

export function bigOneSurvived({ x = 0, z = 0 } = {}) {
  if (ended) return 0;
  const bonus = CONFIG.happenings.bigone.bonus;
  addPot(bonus);
  fire(EVENTS.BIGONE_SURVIVED, { x, z, bonus });
  return bonus;
}

export function endRun(reason = 'lives') {
  if (ended) return null;
  if (state.pot > 0) {   // an unbanked pot is lost when the run ends
    const amount = state.pot;
    state.pot = 0;
    potLostEnd += amount;
    state.stats.potLostTotal += amount;
    fire(EVENTS.POT_LOST, { amount, x: 0, z: 0 });
    fire(EVENTS.POT_CHANGE, { pot: 0 });
  }
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
    potLost: potLostEnd,
    banks: state.stats.banks,
    slams: state.stats.slams,
    bestBank: state.stats.bestBank,
    swoops: state.stats.swoops,
    bestChain: state.stats.bestChain,
    potLostTotal: state.stats.potLostTotal,
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
// put saved values back WITHOUT replacing the objects that other modules hold on to (state.wind, state.settings, ...)
function restoreInPlace(target, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) restoreInPlace(target[k], v);
    else target[k] = v;
  }
}

export function scoringSelfTest() {
  const keep = JSON.parse(JSON.stringify(state));
  const keepRefs = { wind: state.wind, player: state.player, settings: state.settings };   // object fields must keep their identity (happenings.js holds state.wind)
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
    check('first mango = 100, into the pot', state.pot === 100 && state.score === 0);
    for (let i = 0; i < 4; i++) mango();
    check('5 catches -> x2', state.multiplier === 2 && state.comboStep === 0 && state.pot === 500);
    fruitCaught({ type: 'golden', x: 0, y: 0, z: 0 });
    check('golden at x2 = 1000', state.pot === 1500);
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
    const before = state.pot;
    mango();
    check('heartbeat bonus x1.5', state.pot - before === 150);
    land(0.2);
    check('0 lives ends the run', ended && state.lives === 0);
    check('endRun fires once', endRun() === null);
    // happenings: a bat knocks the combo down one step, nothing else
    resetScoring();
    for (let i = 0; i < 10; i++) mango();
    check('x3 after 10 catches', state.multiplier === 3);
    const potBefore = state.pot;
    batHit({ x: 0, z: 0 });
    check('a bat drops the combo one step and costs nothing else', state.multiplier === 2 && state.comboStep === 0 && state.lives === 3 && state.pot === potBefore && !state.shield);
    check('the bat restarts the timer at 50%', Math.abs(state.comboTimerFrac - 0.5) < 1e-9);
    batHit({ x: 0, z: 0 }); batHit({ x: 0, z: 0 });
    check('a bat never goes below x1', state.multiplier === 1);
    // a bat that leaves x1 with a pot: the pot still banks by itself after the window and the grace
    resetScoring();
    for (let i = 0; i < 5; i++) mango();
    check('5 catches: x2 and a pot of 500', state.multiplier === 2 && state.pot === 500);
    batHit({ x: 0, z: 0 });
    check('the bat drops to x1 and keeps the pot for a half window', state.multiplier === 1 && state.pot === 500 && state.score === 0);
    updateScoring(S.comboWindow * 0.5 + S.comboGrace + 0.01);
    check('then the pot banks by itself (window + grace in one update)', state.pot === 0 && state.score === 500);
    mango(); mango();
    batHit({ x: 0, z: 0 });
    check('a bat at x1 with a pot ends the combo: the pot banks at once', state.pot === 0 && state.score === 700);
    resetScoring();
    for (let i = 0; i < 10; i++) mango();
    const pot2 = state.pot;
    check('the Big One bonus goes into the pot', bigOneSurvived({ x: 0, z: 0 }) === CONFIG.happenings.bigone.bonus && state.pot === pot2 + CONFIG.happenings.bigone.bonus);
    check('the big ring is 3 units', land(2.9, { big: true }) === 'hit' || state.lives < 3);
    // Madness: hold x5 until the meter fills
    resetScoring();
    for (let i = 0; i < 20; i++) mango();
    check('x5 after 20 catches', state.multiplier === 5);
    for (let i = 0; i < 70; i++) { updateScoring(0.1); if (i % 10 === 0) mango(); }
    check('madness starts after fillSeconds at x5', state.madnessActive);
    // the pot (step 5b): bank, slam, loss on a hit, the shield, the end of the run
    resetScoring();
    mango();
    check('pot is not score', state.pot === 100 && state.score === 0);
    check('bank adds the pot', bankPot() === 100 && state.score === 100 && state.pot === 0 && state.multiplier === 1);
    mango(); mango();
    check('slam adds 10%', bankPot({ slam: true }) === 220 && state.score === 320);
    mango();
    land(0.2);
    check('a hit loses the pot', state.pot === 0 && state.score === 320 && state.stats.potLostTotal === 100);
    mango();
    fruitCaught({ type: 'shield', x: 0, y: 0, z: 0 });
    land(0.2);
    check('the shield keeps the pot', state.pot === 100);
    updateScoring(S.comboWindow + S.comboGrace + 0.01);   // the overshoot of the window counts against the grace: one update is enough
    check('a combo that ends banks the pot', state.pot === 0 && state.score === 420);
  } catch (err) {
    failures.push('threw: ' + err.message);
  } finally {
    silent = false;
    restoreInPlace(state, keep);
    for (const k of Object.keys(keepRefs)) if (state[k] !== keepRefs[k]) failures.push('state.' + k + ' changed identity');
    ({ comboLeft, inGrace, graceLeft, bestPassed, ended } = keepInternal);
  }
  return { ok: failures.length === 0, failures };
}
