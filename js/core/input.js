// Mango Rush — keyboard + touch input.   OWNER: Claude Code  ·  STATUS: done (step 1)
//
// CONTRACT:
//   initInput(canvas, { onPause, canPlay, onJoystick }) -> void
//     onPause()                  Esc or P was pressed
//     canPlay() -> boolean       true while a run is being played (the joystick only wakes up then). Optional.
//     onJoystick(j) -> void      { active, x, y, dx, dy } for the HUD's floating joystick (hud.js setJoystick). Optional.
//   readInput() -> { x, z, dash, analog }  x,z -1..1, length <= 1. The SAME object every call (no allocation); main.js sets .dash from takeDash().
//   takeDash() -> boolean        true once per dash request (Space, or queueDash() from the touch button)
//   queueDash() -> void          the on-screen DASH button calls this
//   isTouch() -> boolean
//
// Keyboard: WASD / arrows move, Space dashes, Esc / P pause. The joystick is a floating stick: touch (or pen) anywhere
// on the canvas, drag, release. A mouse never makes a joystick. Page scroll / zoom gestures are blocked on the canvas.

const STICK_MAX = 50;       // px the knob can travel
const DEAD_ZONE = 0.1;
const DASH_BUFFER_MS = 150; // a dash request stays valid this long

const keys = new Set();
const out = { x: 0, z: 0, dash: false, analog: false };
const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const joy = { active: false, x: 0, y: 0, dx: 0, dy: 0 };
let dashAt = -1e9;
let handlers = {};

export function initInput(canvas, h = {}) {
  handlers = h;

  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k.startsWith('arrow')) {
      // keep the page from scrolling. A focused button keeps its Space / Enter everywhere EXCEPT during a run: then Space and the
      // arrows are game keys and never click a button (the key still reaches the game below)
      const inRun = handlers.canPlay ? handlers.canPlay() : false;
      if (inRun || !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    }
    if (e.repeat) return;
    if (k === 'escape' || k === 'p') { handlers.onPause?.(); return; }
    if (k === ' ') dashAt = performance.now();
    keys.add(k);
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); releaseStick(); });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || stick.active) return;
    if (handlers.canPlay && !handlers.canPlay()) return;
    stick.active = true;
    stick.id = e.pointerId;
    stick.ox = e.clientX;
    stick.oy = e.clientY;
    stick.x = stick.y = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    publishStick(0, 0);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_MAX) { dx *= STICK_MAX / len; dy *= STICK_MAX / len; }
    stick.x = dx / STICK_MAX;
    stick.y = dy / STICK_MAX;
    publishStick(dx, dy);
  });
  const end = (e) => { if (e.pointerId === stick.id) releaseStick(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // no scrolling, pinch-zoom or context menu on the playfield
  const stop = (e) => e.preventDefault();
  canvas.addEventListener('touchstart', stop, { passive: false });
  canvas.addEventListener('touchmove', stop, { passive: false });
  canvas.addEventListener('contextmenu', stop);
  document.addEventListener('gesturestart', stop);
}

function publishStick(dx, dy) {
  if (!handlers.onJoystick) return;
  joy.active = stick.active;
  joy.x = stick.ox;
  joy.y = stick.oy;
  joy.dx = dx;
  joy.dy = dy;
  handlers.onJoystick(joy);
}

function releaseStick() {
  if (!stick.active) return;
  stick.active = false;
  stick.id = null;
  stick.x = stick.y = 0;
  publishStick(0, 0);
}

export function readInput() {
  let ix = 0;
  let iz = 0;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (keys.has('w') || keys.has('arrowup')) iz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iz += 1;
  const stickOn = stick.active && Math.hypot(stick.x, stick.y) > DEAD_ZONE;
  if (stickOn) { ix += stick.x; iz += stick.y; }
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  out.x = ix;
  out.z = iz;
  out.analog = stickOn;   // the joystick is analogue: player.js smooths it less than the keys
  return out;
}

export function queueDash() { dashAt = performance.now(); }

export function takeDash() {
  if (performance.now() - dashAt > DASH_BUFFER_MS) return false;
  dashAt = -1e9;
  return true;
}

export function isTouch() {
  return matchMedia('(pointer: coarse)').matches;
}
