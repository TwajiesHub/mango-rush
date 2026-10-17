// Mango Rush — every word the player reads.          OWNER: Claude Code  ·  STATUS: placeholder English
//
// RULES FOR EDITING:
//   - Keep EVERY key and the exact structure. Only change the string values (and add items to arrays).
//   - Plain English, warm, punchy, a little Lagos flavour is welcome, no slang that needs explaining.
//   - Respect the max lengths in the comments (characters). Short beats clever.
//   - {name}, {score}, {mangoes}, {multiplier}, {date}, {medal}, {url} are placeholders filled in by code: keep them.
//   - No emoji except where a comment says it is allowed.

const TEXT = {
  title: 'Mango Rush',
  kicker: 'A start.ng game · Lagos',                         // max 32
  tagline: 'Ride the mango barge down the lagoon. Catch the mangoes, dodge the coconuts, last until midnight.', // max 110

  loading: {
    syncing: 'Syncing your look from start.ng…',           // max 40
    tips: [                                                 // shown while loading; 6-10 tips, max 70 each
      'Dash out of a red ring at the last moment for a Perfect Dodge.',
      'Golden mangoes love landing next to coconuts.',
      'Hold x5 long enough and Mango Madness kicks in.',
    ],
  },

  start: {
    greetSignedIn: 'Hi {name}. Your look, from start.ng.',   // max 44
    greetGuest: 'Playing as a guest.',                       // max 30
    guestHint: 'Sign in on start.ng to play as your own character.', // max 60
    synced: 'Synced from start.ng',                          // max 24
    changeLook: 'Change it on start.ng; it updates here.',   // max 50
    wearing: 'Wearing',                                      // label
    play: 'Play',
    daily: 'Daily Run',
    dailySub: '{date} · same drops for everyone',            // max 36
    best: 'Best',
    dailyBest: 'Daily best',
    controlsDesktop: 'WASD move · Space dash · P pause',
    controlsTouch: 'Drag to move · tap Dash',
    signIn: 'Sign in with start.ng',                         // max 24
    leaderboard: 'Leaderboard',
  },

  warmup: {
    move: 'Move with WASD or the arrow keys',                // max 40
    moveTouch: 'Drag anywhere on the left to move',          // max 40
    catch: 'Stand in the gold ring to catch',                // max 40
    dodge: 'Red ring with a cross: get out!',                // max 40
    ready: 'You got it.',                                    // max 20
  },
  countdown: ['3', '2', '1', 'Go!'],

  places: {                                                  // banners, ALL CAPS on screen, max 22
    makoko: 'Passing Makoko',
    mangroves: 'Through the mangroves',
    bridge: 'Under the bridge',
    waterfront: 'The waterfront market',
    city: 'The city lights up',
    open: 'Open water',
  },

  phases: { golden: 'Golden hour', dusk: 'Dusk', night: 'Night', midnight: 'Midnight' },

  happenings: {                                              // warning banners, max 22
    gust: 'Gust incoming',
    bat: 'Fruit bat!',
    bigone: 'The Big One',
    shower: 'Mango shower',
    volley: 'Coconut volley',
    bridge: 'Lights out',
  },

  popups: {                                                  // max 16
    nearMiss: 'Near miss',
    perfectDodge: 'Perfect dodge',
    bonk: 'Bonk!',
    blocked: 'Blocked',
    madness: 'Mango Madness!',
    madnessOver: 'Madness over',
    newBest: 'New best!',
    lastLife: 'Last life',
    shield: 'Calabash shield',
    rotten: 'Rotten!',
    stepUp: 'x{multiplier}',
    swoop: 'Swoop!',
    chain: 'Chain x{n}',                                     // n >= 2
    slamBank: 'Slam bank +10%',
    goldenPlank: 'Golden plank x2',
    banked: 'Banked',
  },

  hud: {
    score: 'Score',
    combo: 'Combo',
    aheadOfBest: '+{score} ahead of best',                   // max 26
    behindBest: '{score} to beat your best',                 // max 26
    dashReady: 'Dash ready',
    dashReadyKey: 'Space · Dash ready',   // on desktop, where Space dashes
    inPot: '+{pot} in the pot',                              // max 24
    potLost: '-{pot}',
    bankHint: 'Dash into a crate to bank your pot',          // the one-time hint (max 40)
    dash: 'Dash',                         // while the dash is recharging (the pill fills up)
    dashKey: 'Space · Dash',
    lives: 'Lives',
  },

  pause: {
    title: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    quit: 'Quit to menu',
    music: 'Music',
    sfx: 'Sound effects',
    reducedMotion: 'Reduced motion',
  },

  gameOver: {
    headlines: {                                             // by the phase you reached; 3+ variants each, max 40
      golden: ['The sun was still up.', 'Golden hour got you.', 'Early bath for this one.'],
      dusk: ['Dusk caught you out.', 'So close to nightfall.', 'The bridge lights saw you fall.'],
      night: ['You survived until nightfall.', 'Night owl.', 'The city lights cheered you on.'],
      midnight: ['Midnight legend.', 'You saw the fireworks.', 'The lagoon bows to you.'],
    },
    newBest: 'New best',
    stats: { mangoes: 'Mangoes', bestCombo: 'Best combo', nearMisses: 'Near misses', survived: 'Survived' },
    lostInPot: 'Lost in the pot: {pot}',                     // only when above 0; plain words, no guilt
    skills: {                                                // the skills line: items that are 0 are left out
      swoop: ['{n} swoop', '{n} swoops'],
      chain: 'best chain x{n}',
      perfect: ['{n} perfect dodge', '{n} perfect dodges'],
      slam: ['{n} slam bank', '{n} slam banks'],
    },
    nextMedal: 'Next: {medal}',
    toGo: '{score} to go',
    playAgain: 'Play again',
    share: 'Share card',
    menu: 'Menu',
    saving: 'Saving to the start.ng leaderboard…',          // max 44
    rank: '#{rank} on start.ng',                             // max 24
    boardBest: 'New best on the board',                      // max 26
    guestBoard: 'Sign in to get on the leaderboard',         // max 36
    saveFailed: 'Could not reach the leaderboard',           // max 36
    notRanked: 'Tuning run · not ranked',                    // max 28 (debug tuning panel only)
  },

  leaderboard: {
    title: 'Leaderboard',
    score: 'Score', survived: 'Survived', mangoes: 'Mangoes',
    empty: 'No runs yet. Be the first.',                     // max 32
    you: 'You',
    close: 'Close',
  },

  medals: { none: 'No medal yet', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond' },

  share: {
    // used as the share text; max 120; one mango emoji allowed
    message: 'I scored {score} in Mango Rush 🥭 Can you beat it? {url}',
    dailyMessage: 'Daily Run {date}: {score} in Mango Rush 🥭 Same drops for everyone. {url}',
    copied: 'Copied to clipboard',
    cardFooter: 'Mango Rush on start.ng',
  },

  a11y: {
    pause: 'Pause',
    dash: 'Dash',
    musicOn: 'Music on', musicOff: 'Music off',
    sfxOn: 'Sound effects on', sfxOff: 'Sound effects off',
    life: 'Life', lifeLost: 'Life lost',
  },
};

export default TEXT;

/** Fill {placeholders}: fill('Hi {name}', { name: 'Bonnke' }) -> 'Hi Bonnke' */
export function fill(str, values = {}) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

/** Pick one string from an array (or return the string). */
export function pickLine(v, rand = Math.random) {
  return Array.isArray(v) ? v[Math.floor(rand() * v.length)] : v;
}
