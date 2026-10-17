// Mango Rush — the coconut shuffle bag.   OWNER: Claude Code  ·  STATUS: step 5a
//
// Pure logic (no three.js, no DOM, no CONFIG import) so a plain node test can check it. Coconut types are dealt like Tetris pieces:
// the bag holds the current phase's mix (CONFIG.coconuts.bags), it is shuffled with the RUN's rng, and the types are dealt in order.
//
// CONTRACT:
//   createDealer(bags, maxRun) -> Dealer      bags = { phaseId: { normal: n, slow: n, fast: n, drifter: n, late: n } }
//   Dealer.deal(rng, phaseId, lateLive) -> 'normal' | 'slow' | 'fast' | 'drifter' | 'late'
//        Refills (and shuffles with rng.next(), Fisher-Yates) when the bag is empty or the phase changed. Then deals the FIRST type in
//        the bag that is allowed: never a 'late' while another late-lock is live (lateLive), and never a fourth of the same type in a
//        row (maxRun). The skipped types stay in the bag for later. If only the run rule is in the way, the front card is dealt anyway;
//        if only a blocked late-lock is left it deals 'normal' and leaves the bag alone.
//        A refill shuffles until no run in the whole bag (counting the end of the previous bag) is longer than maxRun (at most 600 tries),
//        so with a normal mix the run rule never has to bend. The only rng draws are the refill shuffles, so the sequence is a function
//        of the rng and of the calls, never of the player.
//   Dealer.contents() -> string[]   what is left in the bag, next card first (for the ?debug panel)
//   Dealer.reset() -> void          a new run

export const TYPES = ['normal', 'slow', 'fast', 'drifter', 'late'];

export function createDealer(bags, maxRun = 3) {
  let bag = [];
  let bagPhase = null;
  let last = null;
  let run = 0;

  function okRuns() {
    let l = last;
    let r = run;
    for (const t of bag) {
      r = t === l ? r + 1 : 1;
      l = t;
      if (r > maxRun) return false;
    }
    return true;
  }

  function refill(rng, phase) {
    bag = [];
    const mix = bags[phase] || bags.golden;
    for (const t of TYPES) for (let i = 0; i < (mix[t] || 0); i++) bag.push(t);
    for (let tries = 0; tries < 600; tries++) {
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      if (okRuns()) break;
    }
    bagPhase = phase;
  }

  return {
    reset() { bag = []; bagPhase = null; last = null; run = 0; },
    contents() { return bag.slice(); },
    deal(rng, phase, lateLive) {
      if (bag.length === 0 || phase !== bagPhase) refill(rng, phase);
      let pick = -1;
      for (let i = 0; i < bag.length; i++) {
        const t = bag[i];
        if (t === 'late' && lateLive) continue;
        if (t === last && run >= maxRun) continue;
        pick = i;
        break;
      }
      if (pick < 0) pick = bag.findIndex((t) => !(t === 'late' && lateLive));   // only the run rule is in the way: deal the front card
      let type = 'normal';
      if (pick >= 0) { type = bag[pick]; bag.splice(pick, 1); }
      run = type === last ? run + 1 : 1;
      last = type;
      return type;
    },
  };
}
