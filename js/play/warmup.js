// Mango Rush — the first-run warm-up.   OWNER: Claude Code  ·  STATUS: step 12
//
// CONTRACT:
//   startWarmup({ isTouch, onDone })   begin the warm-up: a calm deck at golden hour, about 12 s of four hints, each fading after the player's first input:
//        1. MOVE   (WASD / arrows, or "drag anywhere") until the player has moved a little;
//        2. CATCH  one slow mango falls near them (forceDrop) until they catch it;
//        3. DODGE  one slow coconut lands far away: "watch the red ring";
//        4. DASH   (Space / tap Dash) until they dash once.
//        Then "You got it." for a moment, setWarmupDone(), and onDone() (main.js starts the normal countdown).
//      It never counts as a run: no score, no leaderboard, NO RNG DRAWS (drops come from forceDrop; main.js turns the drop schedule off with
//      drops.suspendSchedule() and creates the run's own rng only at GO). Every step has a longest wait (CONFIG.warmup.maxStep) so it can never stall.
//   updateWarmup(dt)   every frame while state.screen === 'warmup' (after updatePlayer).
//   skipWarmup()       the Skip button / Esc: ends it at once (and still counts as done, so it never nags).
//   warmupActive() -> boolean ;  cancelWarmup() -> void   (quit to the menu: stops without marking it done)

import { CONFIG } from '../core/config.js';
import { EVENTS, on } from '../core/events.js';
import { getPlayer } from './player.js';
import { deckBounds } from '../world/barge.js';
import { forceDrop } from './drops.js';
import { setWarmupDone } from '../core/store.js';
import { showWarmupHint, showSkip } from '../ui/screens.js';

const W = CONFIG.warmup;
let active = false;
let step = -1;
let stepT = 0;
let gapLeft = 0;          // a short pause between hints, so each one reads as new
let next = -1;
let moved = 0;
let lastX = 0;
let lastZ = 0;
let caught = false;
let dashed = false;
let touch = false;
let doneCb = null;

on(EVENTS.CATCH, (e) => { if (active && step === 1 && e.type === 'mango') caught = true; });
on(EVENTS.DASH, () => { if (active && step === 3) dashed = true; });

function enter(n) {
  step = n;
  stepT = 0;
  const pl = getPlayer();
  const b = deckBounds();
  if (n === 0) {
    moved = 0; lastX = pl.x; lastZ = pl.z;
    showWarmupHint('move', touch);
  } else if (n === 1) {
    caught = false;
    const side = pl.x > 0 ? -1 : 1;                                             // a slow mango a few steps to the side: a gold ring to walk into
    forceDrop('mango', Math.max(-b.halfWidth + 1, Math.min(b.halfWidth - 1, pl.x + side * 3.2)), pl.z * 0.5, W.mangoWarn);
    showWarmupHint('catch', touch);
  } else if (n === 2) {
    const side = pl.x >= 0 ? -1 : 1;                                            // a slow coconut well away from the player
    forceDrop('coconut', side * b.halfWidth * 0.7, (pl.z > 0 ? -1 : 1) * b.halfDepth * 0.45, W.coconutWarn);
    showWarmupHint('dodge', touch);
  } else if (n === 3) {
    dashed = false;
    showWarmupHint('dash', touch);
  } else {
    showWarmupHint('ready', touch);
  }
}

function go(n) {                                                                  // fade the hint, wait a beat, then show the next one
  showWarmupHint(null, touch);
  next = n;
  gapLeft = W.gap;
}

function finish() {
  active = false;
  step = -1;
  showWarmupHint(null, touch);
  showSkip(false);
  setWarmupDone();
  const cb = doneCb;
  doneCb = null;
  if (cb) cb();
}

export function startWarmup({ isTouch, onDone }) {
  active = true;
  touch = !!isTouch;
  doneCb = onDone;
  next = -1;
  gapLeft = 0;
  showSkip(true);
  enter(0);
}

export function updateWarmup(dt) {
  if (!active) return;
  if (gapLeft > 0) {
    gapLeft -= dt;
    if (gapLeft <= 0 && next >= 0) { const n = next; next = -1; enter(n); }
    return;
  }
  stepT += dt;
  const pl = getPlayer();
  if (step === 0) {
    moved += Math.hypot(pl.x - lastX, pl.z - lastZ);
    lastX = pl.x; lastZ = pl.z;
    if (moved > W.moveDistance || stepT > W.maxStep[0]) go(1);
  } else if (step === 1) {
    if (caught || stepT > W.maxStep[1]) go(2);
  } else if (step === 2) {
    if (stepT > W.maxStep[2]) go(3);
  } else if (step === 3) {
    if (dashed || stepT > W.maxStep[3]) go(4);
  } else if (step === 4 && stepT > W.readyHold) {
    finish();
  }
}

export function skipWarmup() {
  if (active) finish();
}
export function warmupActive() {
  return active;
}
export function cancelWarmup() {
  if (!active) return;
  active = false;
  step = -1;
  doneCb = null;
  showWarmupHint(null, touch);
  showSkip(false);
}
