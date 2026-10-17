// Mango Rush — the two bank spots (cash in the pot).   OWNER: Claude Code  ·  STATUS: step 5b
//
// CONTRACT:
//   initBank(parent)   parent = barge.deckRoot(). Builds the two glowing dot rings (world/rings.js, the 'bank' style).
//   resetBank()        run start: works out where the spots are for the deck as it is NOW (landscape or portrait) and re-arms them.
//   layoutBankSpots()  just the placement (plank.js calls it before choosing its segments)
//   updateBank(dt)     every frame while playing (after updatePlayer): the breathing glow, and the banking itself.
//   bankSpots() -> [{ x, z, r }]   read only, deck-local: for the HUD, the golden plank (it keeps clear) and the bot.
//
// PLACEMENT. One spot in front of each mango crate (barge.cratePositions()), centred on the line from the deck centre to the crate, as far
// toward the crate as it can go while a circle of CONFIG.bank.radius (1.1) stays FULLY inside the walkable ellipse. Found by bisection,
// so it works for any deck size (the portrait deck is the same code with width and depth swapped).
//
// BANKING. The player banks by walking or dashing INTO a spot (the player's centre within the radius) while the pot is above 0. A dash
// is a Slam bank (+10%). A spot only banks on the step IN (outside -> inside): standing still in it, or catching a mango that lands on
// it, never banks, and a spot that was just used stays used until the player steps out of it. Drops still land on the spots: banking
// is a risky trip.
//
// THE GLOW. The rings are unlit shader quads (their own light), so they read the same at night as by day. They are dim while the pot is
// empty and bright when it is above 0; the breathing quickens as the pot grows. Reduced motion: a steady glow, no breathing.

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { getPlayer } from './player.js';
import { deckBounds, cratePositions } from '../world/barge.js';
import { bankPot } from './scoring.js';
import { ringGeo, makeRingMaterial, RING_OUTER } from '../world/rings.js';

const R = CONFIG.bank.radius;
const spots = [];          // { x, z, r, inside, mesh, mat }
let parent = null;
let t = 0;

// does a circle of radius r around (x, z) stay inside the ellipse a x b?
function circleInside(x, z, r, a, b) {
  if ((x / a) ** 2 + (z / b) ** 2 > 1) return false;
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const px = x + Math.cos(ang) * r;
    const pz = z + Math.sin(ang) * r;
    if ((px / a) ** 2 + (pz / b) ** 2 > 1) return false;
  }
  return true;
}

function place(crate) {
  const b = deckBounds();
  const len = Math.hypot(crate.x, crate.z) || 1;
  const dx = crate.x / len;
  const dz = crate.z / len;
  let lo = 0;
  let hi = len;
  if (circleInside(dx * hi, dz * hi, R, b.halfWidth, b.halfDepth)) lo = hi;
  for (let i = 0; i < 30 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    if (circleInside(dx * mid, dz * mid, R, b.halfWidth, b.halfDepth)) lo = mid; else hi = mid;
  }
  return { x: dx * lo, z: dz * lo };
}

export function initBank(p) {
  parent = p;
  for (let i = 0; i < 2; i++) {
    const mat = makeRingMaterial('bank');
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.035;
    mesh.visible = false;
    mesh.renderOrder = 0;
    parent.add(mesh);
    spots.push({ x: 0, z: 0, r: R, inside: false, mesh, mat });
  }
}

// works out where the spots are for the deck as it is NOW (the golden plank needs them before the run starts)
export function layoutBankSpots() {
  const crates = cratePositions();
  for (let i = 0; i < spots.length; i++) {
    const p = place(crates[i]);
    spots[i].x = p.x;
    spots[i].z = p.z;
  }
}

export function resetBank() {
  layoutBankSpots();
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    s.inside = false;
    s.mesh.position.set(s.x, 0.035, s.z);
    s.mesh.scale.setScalar(R / RING_OUTER.bank);
    s.mesh.visible = true;
    s.mat.uniforms.uDotSize.value = 1.5;
    s.mat.uniforms.uOpacity.value = 0.35;
  }
  t = 0;
}

export function bankSpots() {
  return spots;
}

export function updateBank(dt) {
  if (!parent) return;
  t += dt;
  const pot = state.pot;
  const calm = state.settings.reducedMotion;
  const f = 0.8 + 2.2 * Math.min(1, pot / 3000);   // the breathing quickens as the pot grows
  const breath = calm ? 0 : Math.sin(t * Math.PI * 2 * f);
  const pl = getPlayer();
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const u = s.mat.uniforms;
    u.uOpacity.value = pot > 0 ? 0.85 + 0.15 * breath : 0.34 + 0.05 * breath;   // dim when empty, bright when there is something to bank
    u.uPulse.value = calm ? 0 : f;
    u.uPulseAmt.value = pot > 0 ? 0.18 : 0.08;
    s.mesh.scale.setScalar((R / RING_OUTER.bank) * (1 + (pot > 0 ? 0.025 : 0.01) * breath));

    if (state.screen !== 'play') continue;
    const inside = Math.hypot(pl.x - s.x, pl.z - s.z) <= s.r;
    if (inside && !s.inside && pot > 0) bankPot({ slam: pl.dashing, x: s.x, z: s.z });   // only on the step IN
    s.inside = inside;
  }
}
