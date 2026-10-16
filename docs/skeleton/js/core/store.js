// Mango Rush — saved progress in the browser.     OWNER: Claude Code  ·  STATUS: stub
//
// CONTRACT (keep these exact exports and signatures):
//
//   initStore(userId: string|number) -> void
//     Namespace all keys by user: "mango-rush:<userId>:<key>". Call again when the user changes.
//
//   loadProgress() -> { best: number, dailyBest: number, dailyDate: string|null,
//                       totalMangoes: number, runs: number, warmupDone: boolean }
//     dailyBest is 0 unless dailyDate equals today's UTC date ("YYYY-MM-DD").
//
//   recordRun(summary: { mode: 'free'|'daily', score: number, mangoes: number }) ->
//       { isBest: boolean, best: number, dailyBest: number }
//     - Free play updates `best`. Daily runs update `dailyBest` (+ dailyDate) AND `best`.
//     - Adds mangoes to totalMangoes, runs += 1.
//     - isBest = this score beat the previous best for that mode (strictly greater).
//
//   setWarmupDone() -> void
//
//   loadSettings() -> { music: boolean, sfx: boolean, reducedMotion: boolean }
//     Defaults: music true, sfx true, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
//     Settings are saved per device, not per user: key "mango-rush:settings".
//   saveSettings(settings) -> void
//
// RULES:
//   - Wrap EVERY localStorage read/write in try/catch. Storage can be blocked (private mode).
//     If it fails, keep working from memory for this session. Never throw.
//   - Store JSON. Ignore corrupt values (fall back to defaults).
//   - No imports.

let memory = { best: 0, dailyBest: 0, dailyDate: null, totalMangoes: 0, runs: 0, warmupDone: false };

export function initStore(userId) {}

export function loadProgress() {
  return { ...memory };
}

export function recordRun(summary) {
  const isBest = summary.score > memory.best;
  if (isBest) memory.best = summary.score;
  return { isBest, best: memory.best, dailyBest: memory.dailyBest };
}

export function setWarmupDone() { memory.warmupDone = true; }

export function loadSettings() {
  return { music: true, sfx: true, reducedMotion: false };
}

export function saveSettings(settings) {}
