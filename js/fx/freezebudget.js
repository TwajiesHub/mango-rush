// Mango Rush — the freeze-frame budget (pure: no three.js, no DOM).   OWNER: Claude Code  ·  STATUS: step 9
//
// CONTRACT:
//   createFreezeBudget({ windowSec = 1, capSec = 0.2 }) -> { request(sec), tick(dt), left, reset() }
//     request(sec): ask for a freeze of `sec` seconds. Freezes never stack: a request no longer than what is still running changes nothing,
//       a longer one EXTENDS the running freeze to its length (it replaces the shorter one). Whatever is asked, the time actually frozen in
//       any `windowSec` window is at most `capSec`: the grant is trimmed by what was frozen in the last window plus what is still to run.
//     tick(dt): real time passes. Returns true while frozen (the time scale is 0).
//     left: the seconds of freeze still to run.

export function createFreezeBudget({ windowSec = 1, capSec = 0.2 } = {}) {
  const log = [];        // { age, amt }: frozen time per tick, for the last windowSec seconds
  const b = {
    left: 0,
    request(sec) {
      if (!(sec > b.left)) return;
      let used = b.left;
      for (let i = 0; i < log.length; i++) used += log[i].amt;
      const extra = Math.min(sec - b.left, Math.max(0, capSec - used));
      if (extra > 1e-9) b.left += extra;
    },
    tick(dt) {
      for (let i = log.length - 1; i >= 0; i--) {
        log[i].age += dt;
        if (log[i].age >= windowSec) log.splice(i, 1);
      }
      if (b.left <= 1e-9) { b.left = 0; return false; }
      // a frozen frame stops the game for the WHOLE frame, so it counts for the whole frame; one that would pass the cap is not frozen at all
      let used = dt;
      for (let i = 0; i < log.length; i++) used += log[i].amt;
      if (used > capSec + 1e-9) { b.left = 0; return false; }
      b.left = Math.max(0, b.left - dt);
      log.push({ age: 0, amt: dt });
      return true;
    },
    reset() { b.left = 0; log.length = 0; },
  };
  return b;
}
