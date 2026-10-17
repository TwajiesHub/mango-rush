# Mango Rush

A three.js arcade game for [start.ng](https://start.ng). Ride the mango barge, catch the mangoes, dodge the coconuts, chain catches for a combo.
You play as your own start.ng character. Static files only: plain ES modules, no build step (three.js r160 comes from jsDelivr).

**Version 1 is being built step by step** (see `docs/ROADMAP.md`). So far: the foundation (step 1) the mango barge on the lagoon with a tilted camera (step 2), movement feel (step 3), the print-poster look (step 4), and the first half of the rules (step 5a: coconut types with tells, waves and breathers, an early golden mango, rotten mangoes and shields, a working Perfect dodge).

## Run it locally

```
py -m http.server 8000
```

Open http://localhost:8000. Off start.ng there is no sign-in, so after about 4 s the game continues as a guest.
Add `?debug` to the URL for test hooks: `window.__mango` (state, `end()`, the camera and renderer), `window.__mangoTest.scoring()`, the **tuning panel** (T key, or the TUNE tab: live sliders for movement, dash, body springs, camera and footsteps; Copy values / Reset; the G key toggles a slippery test patch; while any value differs from its default the run is not saved to the leaderboard), the first drops of each run in the console, and a small autoplay bot / headless simulator for balancing (`window.__mango.bot`, see `js/play/bot.js`). `node tests/motion.test.mjs`, `node tests/frameclock.test.mjs` and `node tests/pacing.test.mjs` check the pure-logic helpers (`js/core/motion.js`, `js/core/frameclock.js`, `js/core/bag.js` and `waveAt`). The keys 1-5 drop a coconut of each type (normal, slow, fast, drifter, late-lock); the panel also shows the phase, the wave or breather, and the coconut bag. The debug panel also shows fps, frame times, the refresh rate, the fps cap, antialias and the pixel ratio. `window.__mango.lineup({characters, items})` freezes the game and shows a close-up line-up of styles, reactions and items (see `js/ui/lineup.js`).

## Controls

- WASD or arrow keys move, Space dashes, Esc or P pauses.
- Phones: drag anywhere to move, tap **Dash**.

## How it uses start.ng

Only `js/startng.js` talks to start.ng (see `docs/startng-docs.md`): who is playing and their character (hidden connect page, with `api.start.ng/auth/me` as a fallback), the leaderboard (`startng.json`: score, survived, mangoes), and a re-check when you come back to the tab so a changed look is rebuilt.

## Structure

```
index.html            page shell + import map
css/                  tokens.css (design tokens), ui.css (screens, HUD, pop-ups)
js/main.js            boot, run flow, game loop
js/startng.js         start.ng wiring
js/core/              events, state, config (all tuning numbers), rng, store, input
js/world/             renderer + camera, barge (deck, props, bob, water streaks), journey (sky, sun, water, far bank, light), materials, character
js/play/              player, drops, scoring, happenings, bot (debug only)
js/fx/juice.js        freeze, shake, squash, particles, pop-ups
js/audio/audio.js     sound effects (the music loop comes in step 9)
js/ui/                hud, screens, wordmark, share card
js/content/text.js    every word the player reads
docs/                 design, architecture and step briefs
```

Each module's header comment is its contract: what it exports, which events it emits or hears, which state it owns.
