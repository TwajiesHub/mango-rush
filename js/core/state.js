// Mango Rush — the shared game state. ONE object, read by everyone, written only by its owner.
// UI code (hud.js, screens.js) must only READ it. Each field lists its owner.
//
//   import { state } from '../core/state.js';

export const state = {
  // owner: main.js
  quality: { level: 0, low: false, stormCap: 6 },   // the renderer's quality level (world/renderer.js): low = the pause is a plain dim; stormCap = how many Madness storm mangoes at once
  screen: 'loading',          // 'loading'|'start'|'warmup'|'countdown'|'play'|'paused'|'dying'|'over'   (warmup: the first run's teaching minute; countdown: 3-2-1-GO, the run clock starts at GO)
  mode: 'free',               // 'free'|'daily'
  time: 0,                    // seconds since the run started (stops while paused)
  phase: 'golden',            // 'golden'|'dusk'|'night'|'midnight'
  place: 'makoko',            // see EVENTS.PLACE_ENTER

  // owner: main.js (from startng.js)
  // style keys: body ('male'|'female'), primaryColor (top), secondaryColor (bottoms), skinColor, hairColor,
  //   hair ('short'|'afro'|'braids'|'bun'|'ponytail'|'dreads'|'bald'), hat ('none'|'cap'|'beanie'|'tophat'|'crown'),
  //   accessory ('none'|'glasses'|'earrings'|'beard'|'scarf'|'backpack').  face = PNG data URL of the face (may be null).
  player: { id: 'guest', name: 'Guest', account: null, signedIn: false, face: null, style: null },

  // owner: play/scoring.js
  score: 0,                   // the BANKED score (never goes down); points earned wait in the pot until banked
  pot: 0,                     // points earned and not banked yet
  lives: 3,
  multiplier: 1,              // 1..5
  comboStep: 0,               // catches toward the next multiplier, 0..4
  comboTimerFrac: 0,          // 1 = full window left, 0 = empty
  madnessFrac: 0,             // fever meter 0..1 (fills while at x5)
  madnessActive: false,
  madnessTimeLeft: 0,         // seconds
  heartbeat: false,           // last life
  shield: false,              // calabash shield ready
  aheadOfBest: null,          // score - best, or null when there is no best yet
  stats: {
    mangoes: 0, golden: 0, nearMisses: 0, perfectDodges: 0, bestMultiplier: 1,
    banks: 0, slams: 0, bestBank: 0, swoops: 0, bestChain: 0, potLostTotal: 0,
  },

  // owner: play/player.js
  dashReadyFrac: 1,           // 0 = just used, 1 = ready

  // owner: play/happenings.js
  wind: { x: 0, z: 0 },       // the gust's push (deck units / second) on FALLING items; the character's hair and scarf lean with it

  // owner: core/store.js (loaded at start)
  best: 0,
  dailyBest: 0,
  settings: { music: true, sfx: true, reducedMotion: false },
};

/**
 * RunSummary — payload of EVENTS.RUN_END and the input to the game-over screen and share card.
 * @typedef {Object} RunSummary
 * @property {'free'|'daily'} mode
 * @property {number} score
 * @property {number} timeSurvived     seconds
 * @property {'golden'|'dusk'|'night'|'midnight'} reachedPhase
 * @property {number} mangoes
 * @property {number} golden
 * @property {number} nearMisses
 * @property {number} perfectDodges
 * @property {number} bestMultiplier   1..5
 * @property {'none'|'bronze'|'silver'|'gold'|'diamond'} medal
 * @property {{ name: string, threshold: number } | null} nextMedal   null at diamond
 * @property {boolean} isBest
 * @property {number} best             best after this run
 * @property {number} potLost          the pot lost at the END of the run (final hit, or unbanked): the only loss players see
 * @property {number} banks
 * @property {number} slams
 * @property {number} bestBank
 * @property {number} swoops
 * @property {number} bestChain
 * @property {number} potLostTotal     every loss added up (bot and ?debug only; never shown)
 */
