// Mango Rush — saved progress in the browser.     OWNER: Claude Code  ·  STATUS: done (step 1)
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
//   bankHintDone() -> boolean   true once the player has banked a pot on this DEVICE (key "mango-rush:device"): the one-time
//   setBankDone() -> void       "Walk into a glowing spot to bank it" hint is never shown again after that.
//   bankHintShown() -> boolean  step 12: the hint is also shown only ONCE per device (the first time a pot reaches CONFIG.bank.hintPot),
//   setBankHintShown() -> void  whether or not the player banked.
//
//   loadSettings() -> { music: boolean, sfx: boolean, reducedMotion: boolean }
//     Defaults: music true, sfx true, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
//     Settings are saved per device, not per user: key "mango-rush:settings".
//   saveSettings(settings) -> void
//
// SCORE_VERSION (step 6). When the scoring rules change (step 5b's pot changed what a score means), a best saved under the OLD
//   rules is not comparable any more. progress carries { scoreVersion }; when the saved data has an older (or no) version, initStore()
//   resets best and dailyBest to 0, ONCE, and saves the new version. Everything else (mangoes, runs, warm-up) is kept. The start.ng
//   leaderboard is server-side and is never touched. Raise SCORE_VERSION whenever the rules change again.
//   Versions: 2 (step 6): the pot and the new scoring rules.
//             3 (step 13): v1's rules (happenings, Madness storm, Big One bonus, new medals).
//
// RULES:
//   - Wrap EVERY localStorage read/write in try/catch. Storage can be blocked (private mode).
//     If it fails, keep working from memory for this session. Never throw.
//   - Store JSON. Ignore corrupt values (fall back to defaults).
//   - No imports.

export const SCORE_VERSION = 3;
const DEFAULTS = { best: 0, dailyBest: 0, dailyDate: null, totalMangoes: 0, runs: 0, warmupDone: false, scoreVersion: SCORE_VERSION };
let userId = 'guest';
let memory = { ...DEFAULTS };

const progressKey = () => `mango-rush:${userId}:progress`;
const todayUtc = () => new Date().toISOString().slice(0, 10);
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* blocked: keep working from memory */ }
}

function save() { writeJson(progressKey(), memory); }

export function initStore(id) {
  userId = String(id ?? 'guest');
  const saved = readJson(progressKey());
  memory = { ...DEFAULTS };
  if (saved && typeof saved === 'object') {
    memory.best = num(saved.best);
    memory.dailyBest = num(saved.dailyBest);
    memory.dailyDate = typeof saved.dailyDate === 'string' ? saved.dailyDate : null;
    memory.totalMangoes = num(saved.totalMangoes);
    memory.runs = num(saved.runs);
    memory.warmupDone = saved.warmupDone === true;
    if (saved.scoreVersion !== SCORE_VERSION) { memory.best = 0; memory.dailyBest = 0; save(); }   // the rules changed: old bests do not compare
  }
}

export function loadProgress() {
  const out = { ...memory };
  if (out.dailyDate !== todayUtc()) out.dailyBest = 0;
  return out;
}

export function recordRun(summary) {
  const today = todayUtc();
  let isBest = false;
  let dailyBest = memory.dailyDate === today ? memory.dailyBest : 0;
  if (summary.mode === 'daily') {
    isBest = summary.score > dailyBest;
    if (isBest) dailyBest = summary.score;
    memory.dailyBest = dailyBest;
    memory.dailyDate = today;
    if (summary.score > memory.best) memory.best = summary.score;
  } else {
    isBest = summary.score > memory.best;
    if (isBest) memory.best = summary.score;
    memory.dailyBest = dailyBest;
  }
  memory.totalMangoes += summary.mangoes || 0;
  memory.runs += 1;
  save();
  return { isBest, best: memory.best, dailyBest };
}

export function setWarmupDone() {
  memory.warmupDone = true;
  save();
}

let bankDone = null;   // null = not read yet
export function bankHintDone() {
  if (bankDone === null) bankDone = readJson('mango-rush:device')?.bankDone === true;
  return bankDone;
}
let hintShownFlag = null;
export function bankHintShown() {
  if (hintShownFlag === null) hintShownFlag = readJson('mango-rush:device')?.hintShown === true;
  return hintShownFlag;
}
export function setBankHintShown() {
  hintShownFlag = true;
  writeJson('mango-rush:device', { ...(readJson('mango-rush:device') || {}), hintShown: true });
}
export function setBankDone() {
  bankDone = true;
  writeJson('mango-rush:device', { ...(readJson('mango-rush:device') || {}), bankDone: true });
}

export function loadSettings() {
  let reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  const out = { music: true, sfx: true, reducedMotion: reduced };
  const saved = readJson('mango-rush:settings');
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(out)) if (typeof saved[k] === 'boolean') out[k] = saved[k];
  }
  return out;
}

export function saveSettings(settings) {
  writeJson('mango-rush:settings', {
    music: !!settings.music, sfx: !!settings.sfx, reducedMotion: !!settings.reducedMotion,
  });
}
