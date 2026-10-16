// Mango Rush — player movement, dash, invulnerability.   OWNER: Claude Code  ·  STATUS: done (step 1)
//
// CONTRACT:
//   initPlayer(parent) ; setCharacter(info)    parent = barge.deckRoot(): the player moves with the deck. Coordinates are deck-local. ; resetPlayer() ; updatePlayer(dt, input)
//   getPlayer() -> { object, x, z, invulnerable, dashing }   the SAME object every call
//   idlePlayer(realDt, screen) -> void   (added in step 1) main.js calls it when no run is being played: the
//     character turns slowly on the start screen and stands idle on the game-over screen.
//
//   updatePlayer(dt, input)  input = { x, z, dash } from core/input.js. Moves inside deckBounds(), faces the
//     way it moves, dashes (CONFIG.player cooldown), blinks while invulnerable.
//   Listens for EVENTS.HIT (invulnerable for CONFIG.player.invulnerable seconds).
//   Emits EVENTS.DASH { x, z, dirX, dirZ }. Writes state.dashReadyFrac (0 = just used, 1 = ready).

import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { EVENTS, on, emit } from '../core/events.js';
import { buildCharacter, animateCharacter, disposeCharacter } from '../world/character.js';
import { deckBounds } from '../world/barge.js';
import { blobShadow } from '../world/materials.js';
import { menuStand } from '../world/renderer.js';

const P = CONFIG.player;

let scene = null;
let model = null;
let blob = null;

let x = 0;
let z = 0;
let vx = 0;
let vz = 0;
let facing = 0;
let dashT = 0;
let dashCool = 0;
let invuln = 0;
let idleTime = 0;

const view = { object: null, x: 0, z: 0, invulnerable: false, dashing: false };

export function initPlayer(s) {
  scene = s;
  // a soft blob under the feet (no real-time shadows)
  blob = blobShadow(0.62, 0.55);
  blob.position.y = 0.02;
  scene.add(blob);
  on(EVENTS.HIT, () => { invuln = P.invulnerable; });
}

export function setCharacter(info) {
  if (model) { scene.remove(model); disposeCharacter(model); }
  model = buildCharacter(info.style, info.name);
  model.position.set(x, 0, z);
  model.rotation.y = facing;
  scene.add(model);
  view.object = model;
}

export function resetPlayer() {
  x = z = vx = vz = 0;
  facing = 0;
  dashT = dashCool = invuln = 0;
  state.dashReadyFrac = 1;
  if (model) { model.visible = true; model.position.set(0, 0, 0); model.rotation.y = 0; model.scale.set(1, 1, 1); }
  syncView();
}

function syncView() {
  view.x = x;
  view.z = z;
  view.invulnerable = invuln > 0;
  view.dashing = dashT > 0;
  if (blob) blob.position.set(x, 0.02, z);
}

export function updatePlayer(dt, input) {
  if (!model) return;
  const b = deckBounds();
  const ix = input.x;
  const iz = input.z;
  const len = Math.hypot(ix, iz);

  dashT = Math.max(0, dashT - dt);
  dashCool = Math.max(0, dashCool - dt);
  invuln = Math.max(0, invuln - dt);

  if (input.dash && dashCool <= 0) {
    dashT = P.dashTime;
    dashCool = P.dashCooldown;
    const dirX = len > 0.1 ? ix / len : Math.sin(facing);
    const dirZ = len > 0.1 ? iz / len : Math.cos(facing);
    emit(EVENTS.DASH, { x, z, dirX, dirZ });
  }
  state.dashReadyFrac = 1 - dashCool / P.dashCooldown;

  const speed = dashT > 0 ? P.dashSpeed : P.speed;
  let dirX = ix;
  let dirZ = iz;
  if (dashT > 0 && len < 0.1) { dirX = Math.sin(facing); dirZ = Math.cos(facing); }
  const k = 1 - Math.exp(-(dashT > 0 ? 30 : P.accel) * dt);
  vx += (dirX * speed - vx) * k;
  vz += (dirZ * speed - vz) * k;
  x += vx * dt;
  z += vz * dt;

  // the rim: slow down smoothly over the last stretch, then remove only the outward part of the velocity (no snap)
  const e = Math.hypot(x / b.halfWidth, z / b.halfDepth);
  const zone = CONFIG.deck.slowZone;
  if (e > 1 - zone) {
    const nx = x / (b.halfWidth * b.halfWidth);
    const nz = z / (b.halfDepth * b.halfDepth);
    const nl = Math.hypot(nx, nz) || 1;
    const ux = nx / nl;
    const uz = nz / nl;
    const out = vx * ux + vz * uz;
    if (out > 0) {
      const u = Math.min(1, (e - (1 - zone)) / zone);
      const cut = u * u * (3 - 2 * u);
      vx -= ux * out * cut;
      vz -= uz * out * cut;
    }
    if (e > 1) { x /= e; z /= e; }
  }

  const moving = Math.hypot(vx, vz);
  if (moving > 0.3) {
    let d = Math.atan2(vx, vz) - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    facing += d * (1 - Math.exp(-14 * dt));
  }
  model.position.set(x, 0, z);
  model.rotation.y = facing;
  animateCharacter(model, dt, Math.min(1, moving / P.speed), state.time);
  model.visible = invuln <= 0 || Math.floor(invuln * 12) % 2 === 0;
  syncView();
}

export function idlePlayer(realDt, screen) {
  if (!model) return;
  idleTime += realDt;
  if (screen === 'start') {
    const stand = menuStand();
    x = stand.x;
    z = stand.z;
    model.position.set(x, 0, z);
    model.rotation.y = Math.sin(idleTime * 0.6) * 0.7;
  }
  if (screen === 'start' || screen === 'over') {
    model.visible = true;
    animateCharacter(model, realDt, 0, idleTime);
  }
  syncView();
}

export function getPlayer() {
  return view;
}
