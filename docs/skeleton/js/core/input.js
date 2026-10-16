// Mango Rush — keyboard + touch input.   OWNER: Claude Code  ·  STATUS: stub
// initInput(canvas, { onPause }) ; readInput() -> { x, z } (-1..1) ; takeDash() -> boolean ; isTouch()
export function initInput(canvas, handlers) {}
export function readInput() { return { x: 0, z: 0 }; }
export function takeDash() { return false; }
export function isTouch() { return matchMedia('(pointer: coarse)').matches; }
