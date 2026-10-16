# Mango Rush — Architecture (version 1)

The code at the repo root is the source of truth (`docs/skeleton/` is the pre-step-1 plan, kept as history). Every
module's header comment is its **contract**: what it exports, what it may import, which events it emits/hears, which
state it owns.

## File map
```
index.html              page shell, import map (three r160 from jsDelivr), roots: #scene, #popups-root, #hud-root, #screens-root
startng.json            start.ng leaderboard columns (score, survived[time], mangoes)
cover.png               1600×1000 card picture for start.ng (16:10)
css/tokens.css          design tokens (palette, type, motion)
css/ui.css              all UI styling
js/main.js              boot, run flow (loading → start → warm-up → play ⇄ paused → over), the game loop
js/startng.js           ONLY module that talks to start.ng: whoami (connect page), sign-in URL, saveScore, getLeaderboard
js/core/events.js       event bus: on / once / off / emit + the EVENTS catalogue (every event and its payload)
js/core/state.js        the shared state object (each field has one owner) + the RunSummary shape
js/core/config.js       every tuning number + difficultyAt(t), phaseAt(t)
js/core/rng.js          Mulberry32 createRng(seed), dailySeed(date) (FNV-1a of UTC YYYY-MM-DD), dailyLabel, randomSeed
js/core/store.js        localStorage per user (try/catch everywhere): progress, recordRun, settings
js/core/input.js        keyboard + floating joystick + dash + pause
js/core/motion.js       tested maths: spring, acceleration, input smoothing, throws, swept collision, fixed-step clock
js/world/renderer.js    renderer, tilted camera rig (menu/play/over), quality manager, portrait render
js/world/materials.js   cel (toon) materials, outlines, paper grain texture
js/world/character.js   the start.ng character (all style options, print pattern, reactions)
js/world/barge.js       the deck (play area), props, lanterns, water over the deck, deckBounds()
js/world/journey.js     six depth layers, places, time-of-day lighting, banners (PLACE_ENTER)
js/play/player.js       movement, dash, perfect-dodge window, invulnerability
js/play/drops.js        spawner (difficulty table), items, warning rings, catching/landing, pooling
js/play/happenings.js   showers, bridge, gust, bat, volleys, The Big One
js/play/scoring.js      combo, near miss, lives, shield, heartbeat, Madness, best chase, medals, endRun
js/fx/juice.js          freeze, slow motion, camera shake, squash, particles (one InstancedMesh), pop-up text
js/audio/audio.js       music loop (adaptive) + synthesized sound effects
js/ui/hud.js            in-game HUD, banners, edge effects, touch controls
js/ui/screens.js        loading, start, warm-up hints, countdown, pause, game over, leaderboard
js/ui/sharecard.js      1200×630 share image + Web Share / download
js/ui/wordmark.js       the MANGO RUSH wordmark SVG (done)
js/content/text.js      every word the player reads (+ fill() and pickLine())
assets/music/loop.mp3   the afrobeat loop (owner supplies; game must work without it)
tests/motion.test.mjs   42 checks for js/core/motion.js — `node tests/motion.test.mjs`
```

## How modules talk
- **Events** (`js/core/events.js`): modules announce things with `emit(EVENTS.X, payload)` and react with
  `on(EVENTS.X, fn)`. The catalogue in that file is the single list of event names and payload shapes.
- **State** (`js/core/state.js`): one shared object. Every field names its owner; only the owner writes it.
  UI modules only read.
- **Config** (`js/core/config.js`): numbers. **Text** (`js/content/text.js`): words.
- main.js owns the loop: `realDt` → `dt = realDt * juice.timeScale()` → update player, happenings, drops, scoring
  (with `dt`), journey/barge, juice/audio (with `realDt`), HUD → render.

## start.ng integration (see docs/startng-docs.md)
- `getPlayer()` asks `startng:whoami` through the hidden `https://start.ng/connect` iframe (checking `e.origin`),
  falls back to `GET https://api.start.ng/auth/me` (credentials included), then to a guest. Returns
  `{ signedIn, id, name, account, face, style }` with the style normalized (unknown values → defaults).
- Ask again on `visibilitychange`/`focus` outside a run; rebuild the character if the style changed.
- `saveScore({ score, survived, mangoes })` for signed-in players at game over → rank; `getLeaderboard(10)`.
- Sign-in: `https://start.ng/?return_to=<this page>`. If the URL has `?guest`, don't nag about signing in.
- Locally (not on *.start.ng) the connect page never answers: the game must continue as a guest after ~4 s.

## Testing locally
- `python -m http.server 8000` in the repo root, open http://localhost:8000.
- The game must boot with no console errors as a guest, play a full run, reach game over, and restart.

## Contract changes made in step 1 (already in the code headers)
- `input.js`: `initInput` takes optional `canPlay` / `onJoystick`; `readInput()` returns `{ x, z, dash }` (dash is
  consumed once); `queueDash()` for the Dash button. Mouse never creates a joystick (touch and pen do).
- `player.js`: `idlePlayer()` for the menu and game-over poses.
- `drops.js`: `clearDrops()` (back to menu) and `getDropLog()` (debug log of the first drops).
- `scoring.js`: `scoringSelfTest()`; `nextMedal.name` is the medal id.
- `screens.js`: `showGameOver` also takes `dailyLabel`.
- `config.js`: a `drops` section for numbers that were hard-coded in version 0.
- Daily Run: every drop draws exactly six rng values in a fixed order (gap, type, angle, radius, aim, volley), on
  its own schedule clock, so frame rate and pauses don't change the sequence.
