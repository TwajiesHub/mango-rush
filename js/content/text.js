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
    tipLabel: 'Tip',
    tips: [                                                 // shown while loading; 6-10 tips, max 70 each
      'Dash out of a red ring at the last moment for a Perfect Dodge.',
      'Golden mangoes love landing next to coconuts.',
      'Hold x5 long enough and Mango Madness kicks in.',
      'Dash into a crate to bank your pot before a coconut takes it.',
      'Dash through a mango for a Swoop: +50% and a free dash.',
      'A calabash shield blocks one coconut. Grab it.',
      'Rotten mangoes cost you a combo step. Let them lie.',
      'The Big One has a huge ring. Run early.',
      'Wet planks at the edge are slippery after dusk.',
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
    signInSave: 'Sign in to save your scores',               // max 32 (guests)
    leaderboard: 'Leaderboard',
    player: 'Player',
    look: 'Look',
    hi: 'Hi, ',                                              // phone: "Hi, Bonnke"
    guestName: 'Guest',
    guestLook: 'Playing as guest',                           // max 24
    scene: 'Golden hour · Lagos lagoon',                     // top right of the scene, desktop
    backLink: 'start.ng',                                    // the visible link back to https://start.ng (a start.ng game standard): "← start.ng"
    backLabel: 'Back to start.ng (opens in a new tab)',
    playArrow: 'Play',
    musicToggle: 'Music',
    sfxToggle: 'Sound',
  },

  warmup: {
    move: 'Move with WASD or the arrow keys',                // max 40
    moveTouch: 'Drag anywhere on the left to move',          // max 40
    catch: 'Catch the mangoes: stand in the gold ring',      // max 44
    dodge: 'Dodge the coconuts: watch the red ring',         // max 44
    ready: 'You got it.',                                    // max 20
    dash: 'Press Space to dash',                             // max 40
    dashTouch: 'Tap Dash to dash',
    skip: 'Skip',
  },
  countdown: ['3', '2', '1', 'Go!'],

  places: {                                                  // banners, ALL CAPS on screen, max 22
    makoko: 'Passing Makoko',
    mangroves: 'The mangroves',
    bridge: 'Under the bridge',
    waterfront: 'The waterfront',
    city: 'The city lights',
    open: 'Open water',
  },

  phases: { golden: 'Golden hour', dusk: 'Dusk', night: 'Night', midnight: 'Midnight' },

  happenings: {                                              // warning banners, max 22
    bridge: 'Lights out',
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
    slamBank: 'Slam +10%',
    goldenPlank: 'Golden plank x2',
    banked: 'Banked',
    batKnock: 'Knocked',
    snatched: 'Snatched!',
    bigOneSurvived: 'Big One survived',
  },

  hud: {
    score: 'Score',
    combo: 'Combo',
    aheadOfBest: '+{score} above your best',                // max 26
    behindBest: '{score} to beat your best',                 // max 26
    dashReady: 'Dash ready',
    dashReadyKey: 'Space · Dash ready',   // on desktop, where Space dashes
    inPot: '+{pot} in the pot',                              // max 24
    potLost: '-{pot}',
    bankHint: 'Walk into a glowing spot to bank it',         // the one-time hint (max 40)
    dash: 'Dash',                         // while the dash is recharging (the pill fills up)
    dashKey: 'Space · Dash',
    lives: 'Lives',
    shield: 'Shield',
    places: ['Makoko', 'Bridge', 'City'],                    // under the time bar, left to right
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
    kickerDaily: 'Daily run · {date}',
    kickerFree: 'Free play · {date}',
    headlines: {                                             // one per phase you reached, max 32
      golden: 'You made it past Makoko.',
      dusk: 'You survived until nightfall.',
      night: 'You rode into the night.',
      midnight: 'You reached midnight!',
    },
    short: 'Only {n} short of your best',                     // within 10% of your best, not a new best
    medalName: '{medal} medal',
    comboShort: 'Combo',
    nearShort: 'Near miss',
    rival: '{name} is 1 place above · {score}',              // the entry one rank above you
    top: "You're #1 on start.ng",
    signInBoard: 'Sign in to get on the board',              // guests
    keySpace: 'Space',
    moreOn: 'Play more on',                                  // + a link "start.ng" under the buttons
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
    rank: 'Rank', player: 'Player',
    error: "Couldn't load the board. Try again.",
    retry: 'Try again',
    signIn: 'Sign in to get on the board',
    loading: 'Loading the board',
  },

  medals: { none: 'No medal yet', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond' },

  share: {
    // used as the share text; max 120; one mango emoji allowed
    message: 'I scored {score} in Mango Rush 🥭 Can you beat it? {url}',
    dailyMessage: 'Daily Run {date}: {score} in Mango Rush 🥭 Same drops for everyone. {url}',
    copied: 'Copied to clipboard',
    saved: 'Card saved · link copied',
    savedOnly: 'Card saved',
    shared: 'Shared',
    failed: "Couldn't make the share card. Try again.",
    cardFooter: 'Play Mango Rush on start.ng',
    // Share on X (a start.ng game standard): the post text, with the real score and what you reached (xReached, by phase); the link is added by main.js
    xButton: 'Share on X',
    xText: 'I scored {score} on Mango Rush 🥭 and {reached}.',
    xReached: { golden: 'made it past Makoko', dusk: 'survived until nightfall', night: 'rode into the night', midnight: 'reached midnight' },
    xLabel: 'Share your result on X (opens in a new tab)',
    cardMedal: '{medal} medal',
    plain: 'I scored {score} on Mango Rush 🥭 {url}',
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
