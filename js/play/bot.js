// Mango Rush — a small autoplay bot and a headless simulator, for balancing.   OWNER: Claude Code  ·  STATUS: debug only
//
// Loaded ONLY with ?debug in the URL (main.js imports it on demand) and OFF by default. It is a bot, not a person:
// it makes numbers comparable between builds, it does not tell you how the game FEELS.
//
//   window.__mango.bot.autoplay(true | false)   let the bot steer a real run (watch it play)
//   await window.__mango.bot.simulate({ runs = 10, seed = 1, maxSeconds = 180 })
//        plays whole runs with no rendering, at a fixed 60 steps a second, on the seeds seed .. seed + runs - 1 (so two builds
//        get the same drop sequences) and returns the averages. Reload the page afterwards: it leaves the state dirty.
//        reaction (seconds, default 0.35): the bot only notices a coconut that has been falling this long, like a person
//        who needs a moment to look; speed (0..1, default 0.9): how much of the walking speed it uses.
//
// The bot: runs away from a coconut that is about to land near it (and dashes at the last moment), otherwise walks to the
// most valuable fruit nearby that is not under a coconut. It uses only what a player can see.
// BANKING (step 5b): it banks when the pot is at least BANK_AT (1,500), or when the multiplier is x4 or more and a coconut will land
// within 1.5 s: it walks to the nearest bank spot, and dashes the last stretch when its dash is ready (a Slam bank). It swoops: when its
// dash is ready and the fruit it is heading for is a short dash away, it dashes (a Swoop, which also refills the dash).

import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, on } from '../core/events.js';
import { createRng } from '../core/rng.js';
import { resetScoring, updateScoring } from './scoring.js';
import { resetPlayer, updatePlayer, getPlayer } from './player.js';
import { resetDrops, updateDrops, getDrops, clearDrops } from './drops.js';
import { resetBank, updateBank, bankSpots } from './bank.js';
import { updatePlank } from './plank.js';
import { resetHappenings, updateHappenings } from './happenings.js';
import { deckBounds } from '../world/barge.js';

let simulating = false;
let reaction = 0.35;
let speed = 0.9;
export const isSimulating = () => simulating;

const out = { x: 0, z: 0, dash: false };
const BANK_AT = 1500;

export function think() {
  const me = getPlayer();
  const items = getDrops();
  let fx = 0;
  let fz = 0;
  let danger = false;
  let urgent = false;
  let soon = false;   // a coconut lands within 1.5 s
  for (const it of items) {
    if (it.type !== 'coconut' || it.landed) continue;
    const hit = it.big ? CONFIG.bigRadius : CONFIG.hitRadius;   // The Big One's ring is 3 units
    const r = hit + 0.8;
    if (it.warn - it.age < 1.5) soon = true;
    if (it.age < reaction) continue;
    const dx = it.x - me.x;
    const dz = it.z - me.z;
    const d = Math.hypot(dx, dz);
    const left = it.warn - it.age;
    if (d < r && left < (it.big ? 2.4 : 1.2)) {
      const push = (r - d + 0.4) / (d + 0.15);
      fx -= dx * push;
      fz -= dz * push;
      danger = true;
      if (d < hit && left < 0.35) urgent = true;
    }
  }
  const r = CONFIG.hitRadius + 0.8;
  out.dash = false;
  const ready = state.dashReadyFrac >= 1;
  if (danger) {
    const len = Math.hypot(fx, fz) || 1;
    out.x = (fx / len) * speed;
    out.z = (fz / len) * speed;
    out.dash = urgent;
    return out;
  }
  // the bank policy: cash in a big pot, or a pot at x4+ with a coconut about to land
  if (state.pot > 0 && (state.pot >= BANK_AT || (state.multiplier >= 4 && soon))) {
    let best = null;
    let bd = 1e9;
    for (const sp of bankSpots()) {
      const d = Math.hypot(sp.x - me.x, sp.z - me.z);
      if (d < bd) { bd = d; best = sp; }
    }
    if (best) {
      const dx = best.x - me.x;
      const dz = best.z - me.z;
      out.x = (dx / (bd || 1)) * speed;
      out.z = (dz / (bd || 1)) * speed;
      out.dash = ready && bd > best.r + 0.4 && bd < best.r + 2.4;   // the last stretch is a dash: a Slam bank
      return out;
    }
  }
  let best = null;
  let bestScore = 0;
  for (const it of items) {
    if (it.type === 'coconut') continue;
    let covered = false;
    for (const c of items) {
      if (c.type === 'coconut' && !c.landed && Math.hypot(c.x - it.x, c.z - it.z) < r) { covered = true; break; }
    }
    if (covered) continue;
    const d = Math.hypot(it.x - me.x, it.z - me.z);
    const value = (it.type === 'golden' ? 5 : 1) / (d + 1.5);
    if (value > bestScore) { bestScore = value; best = it; }
  }
  if (best) {
    const dx = best.x - me.x;
    const dz = best.z - me.z;
    const d = Math.hypot(dx, dz);
    out.x = d > 0.25 ? (dx / d) * speed : 0;
    out.z = d > 0.25 ? (dz / d) * speed : 0;
    // a Swoop: a ready dash at a mango that is a short dash away, and low enough to catch
    out.dash = ready && (best.type === 'mango' || best.type === 'golden') && d > 1.4 && d < 3.4 && best.mesh.position.y < CONFIG.catchMaxHeight + 0.6 && best.age >= best.warn * 0.6;
  } else {
    out.x = out.z = 0;
  }
  return out;
}

// plays whole runs without rendering; the same order of updates as main.js
export function simulate(opts = {}) {
  const { runs = 10, seed = 1, maxSeconds = 240 } = opts;
  reaction = opts.reaction ?? 0.35;
  speed = opts.speed ?? 0.9;
  simulating = true;
  const dt = 1 / 60;
  let hits = 0;
  const off = on(EVENTS.HIT, (e) => { if (!e.shielded) hits++; });
  const b = deckBounds();
  const rows = [];
  for (let i = 0; i < runs; i++) {
    hits = 0;
    state.mode = 'free';
    state.time = 0;
    state.phase = 'golden';
    state.screen = 'play';
    resetScoring();
    resetPlayer();
    resetBank();
    resetDrops(createRng(seed + i));
    resetHappenings(createRng((seed + i) ^ 0x9e3779b9), createRng((seed + i) ^ CONFIG.adrenaline.madness.tableSeed));   // the same rngs main.js uses
    while (state.lives > 0 && state.time < maxSeconds) {
      state.time += dt;
      const input = think();
      updatePlayer(dt, input);
      updateHappenings(dt);
      updateDrops(dt);
      updatePlank(dt);
      updateBank(dt);
      updateScoring(dt);
    }
    rows.push({
      seed: seed + i, survived: +state.time.toFixed(1), hits, mangoes: state.stats.mangoes, near: state.stats.nearMisses, score: state.score, died: state.lives <= 0,
      banks: state.stats.banks, slams: state.stats.slams, bestBank: state.stats.bestBank, swoops: state.stats.swoops, bestChain: state.stats.bestChain,
      potLostTotal: state.stats.potLostTotal, pot: state.pot,
    });
  }
  off();
  clearDrops();
  simulating = false;
  const mean = (k) => +(rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
  const minutes = rows.reduce((s, r) => s + r.survived, 0) / 60;
  return {
    deck: { halfWidth: b.halfWidth, halfDepth: b.halfDepth },
    runs: rows.length, diedBefore: rows.filter((r) => r.died).length,
    meanSurvived: mean('survived'), meanMangoes: mean('mangoes'), meanScore: mean('score'),
    meanBanks: mean('banks'), meanSlams: mean('slams'), meanPotLost: mean('potLostTotal'), meanSwoops: mean('swoops'), meanBestChain: mean('bestChain'),
    // the share of runs that lived to 120 s (the first gust) and to 207 s (The Big One); a run that reached maxSeconds counts as having reached both
    reach120: +(rows.filter((r) => r.survived >= 120).length / rows.length).toFixed(2),
    reach207: +(rows.filter((r) => r.survived >= 207).length / rows.length).toFixed(2),
    hitsPerMinute: +(rows.reduce((s, r) => s + r.hits, 0) / minutes).toFixed(2),
    nearMissesPerMinute: +(rows.reduce((s, r) => s + r.near, 0) / minutes).toFixed(2),
    rows,
  };
}
