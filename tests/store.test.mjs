// Mango Rush — tests for the saved progress and the score version (js/core/store.js). Plain node, no packages.
// Run:  node tests/store.test.mjs
//
// Step 13: SCORE_VERSION is 3. A returning player's best and daily best start fresh ONCE; settings (their own key), warmupDone, totals and runs stay.

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) passed++; else { failed++; console.log('FAIL', name, extra); }
}

const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.matchMedia = () => ({ matches: false });
const store = await import('../js/core/store.js');
const today = new Date().toISOString().slice(0, 10);
const key = 'mango-rush:u7:progress';

check('the score version is 3', store.SCORE_VERSION === 3);

// ---- saved under version 2 (the live version 0.x / step 6-12 rules): the bests reset, everything else stays
mem['mango-rush:settings'] = JSON.stringify({ music: false, sfx: true, reducedMotion: true });
mem[key] = JSON.stringify({ scoreVersion: 2, best: 41250, dailyBest: 18000, dailyDate: today, totalMangoes: 640, runs: 31, warmupDone: true });
store.initStore('u7');
let p = store.loadProgress();
check('version 2: the best resets to 0', p.best === 0);
check('version 2: the daily best resets to 0', p.dailyBest === 0);
check('version 2: warmupDone is kept', p.warmupDone === true);
check('version 2: totals and runs are kept', p.totalMangoes === 640 && p.runs === 31);
const s = store.loadSettings();
check('version 2: the settings are kept (music off, reduced motion on)', s.music === false && s.sfx === true && s.reducedMotion === true);
check('version 2: the new version is saved (it resets only once)', JSON.parse(mem[key]).scoreVersion === 3);
store.recordRun({ mode: 'free', score: 900, mangoes: 2 });
store.initStore('u7');
check('after the reset a new best sticks', store.loadProgress().best === 900);

// ---- a returning player who never finished the warm-up still gets it
mem['mango-rush:u8:progress'] = JSON.stringify({ scoreVersion: 2, best: 500, dailyBest: 0, dailyDate: null, totalMangoes: 3, runs: 1, warmupDone: false });
store.initStore('u8');
check('version 2 without warmupDone: the warm-up is still due', store.loadProgress().warmupDone === false && store.loadProgress().best === 0);

// ---- saved under version 3: nothing resets
mem['mango-rush:u9:progress'] = JSON.stringify({ scoreVersion: 3, best: 22000, dailyBest: 9000, dailyDate: today, totalMangoes: 12, runs: 4, warmupDone: true });
store.initStore('u9');
p = store.loadProgress();
check('version 3: the best is kept', p.best === 22000);
check('version 3: the daily best is kept (today)', p.dailyBest === 9000);
check('version 3: the rest is kept', p.totalMangoes === 12 && p.runs === 4 && p.warmupDone === true);
check('version 3: the saved data is not rewritten as another version', JSON.parse(mem['mango-rush:u9:progress']).scoreVersion === 3);

// ---- no version at all (the oldest saves) resets too; a brand new player starts at 0
mem['mango-rush:u10:progress'] = JSON.stringify({ best: 777, dailyBest: 0, dailyDate: null, totalMangoes: 5, runs: 2, warmupDone: true });
store.initStore('u10');
check('no version: resets', store.loadProgress().best === 0 && store.loadProgress().warmupDone === true);
store.initStore('brand-new');
check('a brand new player starts at 0, warm-up due', store.loadProgress().best === 0 && store.loadProgress().warmupDone === false);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
