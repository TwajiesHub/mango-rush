// Mango Rush — scoring, combo, lives and the adrenaline meters.   OWNER: Claude Code  ·  STATUS: stub
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
//   endRun(reason = 'lives') -> RunSummary   (see core/state.js for the RunSummary fields)
//     Builds the summary from state + stats (timeSurvived = state.time, reachedPhase = state.phase,
//     medal = highest CONFIG.medals threshold reached or 'none', nextMedal = next threshold or null).
//     isBest/best are filled in by main.js after saving (set isBest:false, best: state.best here).
//     Emits RUN_END with the summary and returns it. Must only fire once per run.
//
// RULES: no DOM, no three.js, no timers (setTimeout/setInterval) — everything advances in updateScoring(dt).

import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, emit } from '../core/events.js';

export function resetScoring() {
  state.score = 0;
  state.lives = CONFIG.lives;
  state.multiplier = 1;
}

export function updateScoring(dt) {}

export function fruitCaught({ type, x, y, z }) {
  // STUB: flat points so the game is playable before the real module arrives
  if (type === 'mango' || type === 'golden') {
    const points = type === 'golden' ? CONFIG.scoring.golden : CONFIG.scoring.mango;
    state.score += points;
    emit(EVENTS.CATCH, { type, x, y, z, points, multiplier: 1 });
  }
}

export function coconutLanded({ x, z, dist, invulnerable, perfect, big }) {
  const r = CONFIG.hitRadius * (big ? 2.5 : 1);
  if (dist <= r && !invulnerable) {
    state.lives -= 1;
    emit(EVENTS.HIT, { x, z, lives: state.lives, shielded: false });
    if (state.lives <= 0) endRun();
    return 'hit';
  }
  return 'none';
}

let ended = false;
export function endRun(reason = 'lives') {
  if (ended) return null;
  ended = true;
  const summary = {
    mode: state.mode, score: state.score, timeSurvived: state.time, reachedPhase: state.phase,
    mangoes: 0, golden: 0, nearMisses: 0, perfectDodges: 0, bestMultiplier: 1,
    medal: 'none', nextMedal: null, isBest: false, best: state.best,
  };
  emit(EVENTS.RUN_END, summary);
  setTimeout(() => { ended = false; }, 0); // stub only
  return summary;
}
