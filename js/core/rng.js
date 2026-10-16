// Mango Rush — seeded random numbers.            OWNER: Claude Code  ·  STATUS: done (step 1)
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

function utcDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailySeed(date = new Date()) {
  const str = utcDate(date);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function dailyLabel(date = new Date()) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function randomSeed() {
  return (Math.random() * 2 ** 32) >>> 0;
}
