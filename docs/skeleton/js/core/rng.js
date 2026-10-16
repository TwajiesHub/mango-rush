// Mango Rush — seeded random numbers.            OWNER: Claude Code  ·  STATUS: stub
//
// CONTRACT (keep these exact exports and signatures):
//
//   createRng(seed: number) -> Rng
//     Rng.next(): number            uniform in [0, 1), Mulberry32
//     Rng.range(min, max): number   uniform in [min, max)
//     Rng.int(min, max): number     integer in [min, max] inclusive
//     Rng.chance(p): boolean        true with probability p
//     Rng.pick(array): any          one element
//   The same seed MUST always give the same sequence.
//
//   dailySeed(date = new Date()) -> number
//     32-bit unsigned seed from the UTC date "YYYY-MM-DD", hashed with FNV-1a.
//     Everyone in the world gets the same seed on the same UTC day.
//
//   dailyLabel(date = new Date()) -> string    e.g. "16 Oct" (UTC date, English short month)
//
//   randomSeed() -> number           for free play (any 32-bit unsigned integer)
//
// Rules: no imports, no globals, no Math.random() inside createRng (randomSeed may use it).

export function createRng(seed) {
  // STUB: replace with Mulberry32
  return {
    next: () => Math.random(),
    range: (a, b) => a + Math.random() * (b - a),
    int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  };
}

export function dailySeed(date = new Date()) {
  return 1; // STUB
}

export function dailyLabel(date = new Date()) {
  return 'Today'; // STUB
}

export function randomSeed() {
  return (Math.random() * 2 ** 32) >>> 0;
}
