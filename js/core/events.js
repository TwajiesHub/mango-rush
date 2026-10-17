// Mango Rush — the event list. Modules never call each other's internals:
// they announce things here and listen for what they care about.
//
//   import { on, emit } from '../core/events.js';
//   const off = on('catch', (e) => { ... });   // off() to stop listening
//   emit('catch', { type: 'mango', x, y, z, points, multiplier });
//
// EVERY event in the game is listed in EVENTS below with its payload.
// Do not invent new event names without adding them here.

/**
 * Catalogue of events and their payloads.
 * Positions (x, y, z) are world units; y is up; the deck is around y = 0.
 */
export const EVENTS = Object.freeze({
  // ---- player / start.ng
  PLAYER_READY: 'player:ready',     // { id, name, style, signedIn }
  STYLE_CHANGE: 'style:change',     // { id, name, style, signedIn }  (central style changed)

  // ---- run flow (emitted by main.js)
  SCREEN: 'screen',                 // { screen: 'loading'|'start'|'warmup'|'play'|'paused'|'over' }
  RUN_START: 'run:start',           // { mode: 'free'|'daily', seed }
  RUN_END: 'run:end',               // RunSummary (see state.js)
  PAUSE: 'pause',                   // {}
  RESUME: 'resume',                 // {}
  COUNTDOWN: 'countdown',           // { n: 3|2|1|0 }   0 = "Go"
  WARMUP_HINT: 'warmup:hint',       // { hint: 'move'|'catch'|'dodge'|null }

  // ---- journey (emitted by world/journey.js + main.js)
  PHASE_CHANGE: 'phase:change',     // { phase: 'golden'|'dusk'|'night'|'midnight' }
  PLACE_ENTER: 'place:enter',       // { place: 'makoko'|'mangroves'|'bridge'|'waterfront'|'city'|'open' }

  // ---- drops (emitted by play/drops.js)
  DROP_SPAWN: 'drop:spawn',         // { id, type, kind, x, z, warnTime, fallAt }   kind: 'normal'|'slow'|'fast'|'drifter'|'late' (coconuts; others 'normal')
                                    //   fallAt = seconds after the spawn when the item really starts to fall (a slow coconut hangs first)
  RING_LOCK: 'ring:lock',           // { id, kind, x, z }   a drifter / late-lock coconut's landing spot just locked (nothing moves after this)
  DRIFT_START: 'drift:start',       // { id, x, z }   a drifter's landing spot starts to slide (the wind)
  DROP_LAND: 'drop:land',           // { id, type, x, z }
  // type is one of: 'mango'|'golden'|'rotten'|'coconut'|'shield'|'bigone'

  // ---- scoring results (emitted by play/scoring.js)
  CATCH: 'catch',                   // { type, x, y, z, points, multiplier }
  HIT: 'hit',                       // { x, z, lives, shielded }   shielded=true: the shield took it, no life lost
  NEAR_MISS: 'nearmiss',            // { x, z, points }
  PERFECT_DODGE: 'perfectdodge',    // { x, z, points }
  COMBO_CHANGE: 'combo:change',     // { multiplier, step, stepUp: boolean, stepDown: boolean }
  LIVES_CHANGE: 'lives:change',     // { lives }
  SHIELD_CHANGE: 'shield:change',   // { active: boolean }
  MADNESS_START: 'madness:start',   // {}
  MADNESS_END: 'madness:end',       // {}
  HEARTBEAT_START: 'heartbeat:start', // {}   (last life)
  HEARTBEAT_END: 'heartbeat:end',   // {}
  BEST_PASSED: 'best:passed',       // { score }
  POT_CHANGE: 'pot:change',         // { pot }   the pot changed
  POT_BANKED: 'pot:banked',         // { amount, slam, auto, x, z }   amount = what was added to the score
  POT_LOST: 'pot:lost',             // { amount, x, z }   a coconut hit (or the run's end) took the pot
  SWOOP: 'swoop',                   // { x, z, points, chain }   a mango caught while dashing
  SLAM_BANK: 'slambank',            // { x, z, amount, bonus }   banked by dashing into a bank spot

  // ---- player actions (emitted by play/player.js)
  DASH: 'dash',                     // { x, z, dirX, dirZ }
  DASH_END: 'dash:end',             // { x, z }   the dash burst is over (the Chain resets if it had no Swoop)
  SKID: 'skid',                     // { x, z }   a hard reversal at speed
  SNAP_TURN: 'snapturn',            // { x, z, dirX, dirZ }   a sharp turn right after a dash
  FOOTSTEP: 'footstep',             // { x, z, speed }   a foot plants (speed in units / second)

  // ---- happenings (emitted by play/happenings.js)
  HAPPENING_WARN: 'happening:warn', // { id: 'gust'|'bat'|'bigone'|'shower'|'volley'|'bridge', inSeconds }
  HAPPENING_START: 'happening:start', // { id }
  HAPPENING_END: 'happening:end',   // { id }

  // ---- start.ng leaderboard (emitted by main.js)
  LEADERBOARD_SAVED: 'leaderboard:saved', // { ok, rank, best, improved, error }   after a signed-in run is saved
  LEADERBOARD_DATA: 'leaderboard:data',   // { ok, entries: [{ rank, player_id, name, color, score, stats }], myId }

  // ---- settings (emitted by ui/screens.js via main.js)
  SETTINGS_CHANGE: 'settings:change', // { music, sfx, reducedMotion }
});

const listeners = new Map();

/** Listen for an event. Returns a function that stops listening. */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}

/** Listen once. */
export function once(name, fn) {
  const offFn = on(name, (p) => { offFn(); fn(p); });
  return offFn;
}

/** Stop listening. */
export function off(name, fn) {
  const set = listeners.get(name);
  if (set) set.delete(fn);
}

/** Announce an event. A listener that throws is logged and never breaks the others. */
export function emit(name, payload = {}) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(payload); } catch (err) { console.error(`[events] listener for "${name}" failed:`, err); }
  }
}
