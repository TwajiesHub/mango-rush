// Mango Rush — tests for the pot, banking and the skills (js/play/scoring.js, pure logic: no DOM, no three.js).
// Run:  node tests/pot.test.mjs        (plain node, no packages)

import { CONFIG } from '../js/core/config.js';
import { state } from '../js/core/state.js';
import { EVENTS, on, emit } from '../js/core/events.js';
import { resetScoring, updateScoring, fruitCaught, coconutLanded, bankPot, endRun, batHit, scoringSelfTest } from '../js/play/scoring.js';

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) passed++; else { failed++; console.log('FAIL', name, extra); }
}

const S = CONFIG.scoring;
const log = [];
for (const n of [EVENTS.POT_CHANGE, EVENTS.POT_BANKED, EVENTS.POT_LOST, EVENTS.SWOOP, EVENTS.SLAM_BANK, EVENTS.RUN_END, EVENTS.BEST_PASSED]) on(n, (e) => log.push([n, e]));
const count = (n) => log.filter((l) => l[0] === n).length;
const last = (n) => [...log].reverse().find((l) => l[0] === n)?.[1];

function fresh(best = 0) {
  state.best = best; state.mode = 'free'; state.time = 0; state.phase = 'golden';
  resetScoring();
  log.length = 0;
}
const mango = (extra = {}) => fruitCaught({ type: 'mango', x: 1, y: 0, z: 2, ...extra });
const hit = () => coconutLanded({ x: 3, z: 4, dist: 0.2, invulnerable: false, perfect: false, big: false });
const dash = () => emit(EVENTS.DASH, { x: 0, z: 0, dirX: 1, dirZ: 0 });
const dashEnd = () => emit(EVENTS.DASH_END, { x: 0, z: 0 });

// ---- points go to the pot, not the score
fresh();
mango();
check('a catch goes to the pot', state.pot === 100 && state.score === 0);
check('POT_CHANGE fired', last(EVENTS.POT_CHANGE)?.pot === 100);
coconutLanded({ x: 0, z: 0, dist: CONFIG.hitRadius + 0.2, invulnerable: false, perfect: false, big: false });
check('a near miss goes to the pot', state.pot === 150 && state.score === 0);
coconutLanded({ x: 0, z: 0, dist: 2, invulnerable: false, perfect: true, big: false });
check('a Perfect dodge goes to the pot', state.pot === 300 && state.score === 0);

// ---- bank
fresh();
for (let i = 0; i < 6; i++) mango();   // x2 after 5 catches: 5 x 100 + 200
check('pot after 6 catches', state.pot === 700 && state.multiplier === 2, String(state.pot));
check('bank returns the amount', bankPot({ x: 5, z: 6 }) === 700);
check('bank: score up, pot empty', state.score === 700 && state.pot === 0);
check('bank: multiplier x1, step 0, timer 0', state.multiplier === 1 && state.comboStep === 0 && state.comboTimerFrac === 0);
const b = last(EVENTS.POT_BANKED);
check('POT_BANKED payload', b && b.amount === 700 && b.slam === false && b.auto === false && b.x === 5 && b.z === 6);
check('stats.banks and bestBank', state.stats.banks === 1 && state.stats.bestBank === 700 && state.stats.slams === 0);
check('an empty pot banks nothing', bankPot() === 0 && state.stats.banks === 1);
check('no SLAM_BANK for a plain bank', count(EVENTS.SLAM_BANK) === 0);

// ---- slam: +10%, rounded
fresh();
mango(); mango(); mango();   // 300
check('slam adds 10%', bankPot({ slam: true, x: 1, z: 1 }) === 330 && state.score === 330);
check('slam stats and event', state.stats.slams === 1 && state.stats.bestBank === 330 && last(EVENTS.SLAM_BANK)?.bonus === 30 && last(EVENTS.POT_BANKED)?.slam === true);
fresh();
mango(); mango(); mango(); mango(); mango(); mango(); mango();   // 5 x 100 + 2 x 200 = 900
coconutLanded({ x: 0, z: 0, dist: CONFIG.hitRadius + 0.2, invulnerable: false, perfect: false, big: false });   // +100 (x2)
check('slam rounds', bankPot({ slam: true }) === Math.round(1000 * 1.1));
fresh();
state.pot = 155;   // a pot that does not divide evenly
check('slam rounds to an integer', bankPot({ slam: true }) === 171 && Number.isInteger(state.score));

// ---- auto-bank: the combo ends naturally
fresh();
mango();
updateScoring(S.comboWindow + 0.01);
check('window over: still in the pot (grace)', state.pot === 100 && state.score === 0);
updateScoring(S.comboGrace + 0.01);
check('window + grace over at x1: the pot banks by itself', state.pot === 0 && state.score === 100);
const a = last(EVENTS.POT_BANKED);
check('auto-bank event, no slam', a && a.auto === true && a.slam === false);
fresh();
for (let i = 0; i < 5; i++) mango();   // x2
updateScoring(S.comboWindow + 0.01);
updateScoring(S.comboGrace + 0.01);
check('draining x2 -> x1 does not bank yet', state.multiplier === 1 && state.pot === 500 && state.score === 0);
updateScoring(S.comboWindow * 0.5 + 0.01);
updateScoring(S.comboGrace + 0.01);
check('then the x1 window runs out and it banks', state.pot === 0 && state.score === 500);
fresh();
coconutLanded({ x: 0, z: 0, dist: CONFIG.hitRadius + 0.2, invulnerable: false, perfect: false, big: false });   // a pot of only a near miss
check('points with no combo start a timer', state.pot === 50 && state.comboTimerFrac > 0);
updateScoring(S.comboWindow + 0.01);
updateScoring(S.comboGrace + 0.01);
check('a near-miss-only pot banks by itself too', state.pot === 0 && state.score === 50);

// ---- a hit loses the whole pot
fresh();
for (let i = 0; i < 6; i++) mango();
bankPot();   // 700 banked
for (let i = 0; i < 3; i++) mango();
check('a pot to lose', state.pot === 300 && state.score === 700);
check('the hit is a hit', hit() === 'hit');
check('the whole pot is lost', state.pot === 0 && state.score === 700 && state.lives === 2);
const lost = last(EVENTS.POT_LOST);
check('POT_LOST payload', lost && lost.amount === 300 && lost.x === 3 && lost.z === 4);
check('potLostTotal counts it', state.stats.potLostTotal === 300);
check('the banked score never goes down', state.score === 700);

// ---- the shield protects the pot; a rotten mango does not touch it
fresh();
mango(); mango();
fruitCaught({ type: 'shield', x: 0, y: 0, z: 0 });
check('the shield blocks the hit', hit() === 'shielded');
check('the shield keeps the pot', state.pot === 200 && count(EVENTS.POT_LOST) === 0 && state.lives === 3);
fresh();
for (let i = 0; i < 5; i++) mango();   // x2
fruitCaught({ type: 'rotten', x: 0, y: 0, z: 0 });
check('a rotten mango drops the combo, not the pot', state.multiplier === 1 && state.pot === 500);

// ---- loss at the end of the run
fresh();
mango(); mango();
const sum = endRun('debug');
check('an unbanked pot is lost at the end', state.pot === 0 && sum.potLost === 200 && sum.score === 0);
check('the summary carries the skills fields', sum.banks === 0 && sum.swoops === 0 && sum.potLostTotal === 200);
fresh();
mango(); mango(); mango();
bankPot();
mango();
hit(); hit(); hit();   // 3 lives: the third hit ends the run; the first took the pot of 100
const sum2 = last(EVENTS.RUN_END);
check('potLost is only the end-of-run loss', sum2.potLost === 0 && sum2.potLostTotal === 100, JSON.stringify([sum2.potLost, sum2.potLostTotal]));
fresh();
mango(); mango();
hit(); hit();
mango(); mango(); mango();
hit();   // the final hit takes the pot: 3 catches at x1, x1.5 on the last life = 450
const sum3 = last(EVENTS.RUN_END);
check('the final hit counts as the end-of-run loss', sum3.potLost === 450 && sum3.potLostTotal === 650, JSON.stringify([sum3.potLost, sum3.potLostTotal]));
check('the leaderboard score is the banked score only', sum3.score === 0);

// ---- the best chase uses the banked score
fresh(500);
check('ahead of best starts at -best', state.aheadOfBest === -500);
for (let i = 0; i < 8; i++) mango();   // 1100 in the pot
check('the pot does not move the chase', state.aheadOfBest === -500 && count(EVENTS.BEST_PASSED) === 0);
bankPot();
check('banking does', state.aheadOfBest === state.score - 500 && count(EVENTS.BEST_PASSED) === 1);

// ---- skills: Swoop, Chain, golden plank
fresh();
mango({ dashing: true });
check('a Swoop pays +50%', state.pot === 150 && state.stats.swoops === 1);
check('SWOOP event', last(EVENTS.SWOOP)?.points === 150 && last(EVENTS.SWOOP)?.chain === 1);
fresh();
mango({ onPlank: true });
check('the golden plank pays x2', state.pot === 200);
fresh();
mango({ dashing: true, onPlank: true });
check('Swoop and plank stack', state.pot === 300);
fresh();
for (let i = 0; i < 5; i++) mango();   // x2
mango({ dashing: true, onPlank: true });
check('both apply before the multiplier', state.pot === 500 + 100 * 1.5 * 2 * 2, String(state.pot));

// chain: a Swoop in a new dash extends it, a dash that ends with no Swoop breaks it
fresh();
dash(); mango({ dashing: true });
check('chain 1', last(EVENTS.SWOOP).chain === 1);
dashEnd();
dash(); mango({ dashing: true });
check('chain 2 (a new dash)', last(EVENTS.SWOOP).chain === 2 && state.stats.bestChain === 2);
mango({ dashing: true });
check('a second catch in the same dash does not extend it', last(EVENTS.SWOOP).chain === 2 && state.stats.swoops === 3);
dashEnd();
dash(); mango({ dashing: true });
check('chain 3', last(EVENTS.SWOOP).chain === 3 && state.stats.bestChain === 3);
dashEnd();
dash(); dashEnd();   // a dash with no Swoop
dash(); mango({ dashing: true });
check('a dash with no Swoop breaks the chain', last(EVENTS.SWOOP).chain === 1 && state.stats.bestChain === 3);
dashEnd();
fresh();
mango();
check('a plain catch is no Swoop', state.stats.swoops === 0 && count(EVENTS.SWOOP) === 0);

// ---- a bat that leaves x1 with a pot: the pot still banks by itself
fresh();
for (let i = 0; i < 5; i++) mango();
check('x2 and a pot of 500 before the bat', state.multiplier === 2 && state.pot === 500);
batHit({ x: 0, z: 0 });
check('a bat leaves x1 and keeps the pot for a half window', state.multiplier === 1 && state.pot === 500 && state.score === 0);
updateScoring(S.comboWindow * 0.5 + 0.01);
updateScoring(S.comboGrace + 0.01);
check('the pot banks after the window and the grace', state.pot === 0 && state.score === 500 && last(EVENTS.POT_BANKED)?.auto === true);
fresh();
mango(); mango();
batHit({ x: 0, z: 0 });
check('a bat at x1 ends the combo: the pot banks at once', state.pot === 0 && state.score === 200);

// ---- the window's overshoot counts against the grace: one big update is enough
fresh();
mango();
updateScoring(S.comboWindow + S.comboGrace + 0.01);
check('window + grace in ONE update banks the pot', state.pot === 0 && state.score === 100);

// ---- the self-test restores state in place: state.wind keeps its identity
const windBefore = state.wind;
const playerBefore = state.player;
state.wind.x = 0.7;
const st = scoringSelfTest();
check('the scoring self-test passes', st.ok, JSON.stringify(st.failures));
check('state.wind is the same object after the self-test', state.wind === windBefore && state.player === playerBefore);
check('and keeps its value', state.wind.x === 0.7);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
