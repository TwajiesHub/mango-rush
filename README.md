# Mango Rush

**Version 1 · October 2026** · play it at https://mango-rush.start.ng

A three.js arcade game for [start.ng](https://start.ng). Ride the mango barge down the Lagos lagoon, catch the mangoes,
dodge the coconuts and last until midnight. You play as your own start.ng character. Static files only: plain ES
modules, no build step (three.js r160 comes from jsDelivr).

Version 1 starts everyone's local best at 0 (the scoring rules changed); your settings and your place on the start.ng
leaderboard are kept.

## Playing

**Modes**
- **Play**: a new random run every time.
- **Daily Run**: the same drops for everyone today (the seed is the date). Your daily best is kept on this device.
- Signed in on start.ng? Your best runs go on the start.ng leaderboard. Guests can play everything and see the board.

**Controls**
- Desktop: **WASD** or the arrow keys move, **Space** dashes, **Esc** or **P** pauses.
- Phone: drag anywhere on the left to move, tap **Dash**.
- Your first run on a device starts with a short warm-up (you can skip it); every run starts with a 3-2-1-GO countdown.

**The rules in a minute**
- A gold ring on the deck is a mango about to land: stand in it to catch it. A **red ring with a cross** is a coconut: get out.
  Rotten mangoes (a few sparse dots round a dark disc) cost you a combo step; a calabash shield (a gold diamond) blocks one hit.
- Catches build a **combo** (x1 to x5). Points go into the **pot**; walk or dash into a glowing **bank spot** to bank it.
  Dashing into a bank spot is a **Slam bank** (+10%). A hit takes the pot away, so bank when you can.
- **Skills:** dash through a mango for a **Swoop**, chain them for a **Chain**, dash out of a ring at the last moment for a
  **Perfect dodge**.
- Hold x5 and **Mango Madness** rains extra mangoes for a while. On your last life everything goes grey and your heart beats.
- The run goes golden hour, dusk, night, midnight, with things happening along the way: Lights out under the bridge, gusts,
  the fruit bat, mango showers and, at midnight, **The Big One**.
- Medals: bronze, silver, gold, diamond (see `CONFIG.medals`).

## Run it locally

```
py -m http.server 8000
```

Open http://localhost:8000. Off start.ng there is no sign-in, so after about 4 s the game continues as a guest.
(`python -m http.server 8000` works too.) There is nothing to install and nothing to build.

**Tests** (plain node, no packages): `node tests/motion.test.mjs`, `frameclock`, `pacing`, `pot`, `journey`, `happenings`,
`madness` and `audio`, each `.test.mjs` in `tests/`. Every one prints `0 failed`.

**`?debug`** adds test hooks: `window.__mango` (state, `end()`, the camera, renderer, audio, a headless bot simulator
`window.__mango.bot.simulate({ runs, seed, reaction, maxSeconds })`), the **tuning panel** (T key or the TUNE tab: live
sliders, frame times, a Sound section; while any value differs from its default the run is marked "TUNING · NOT RANKED" and
never saved to the leaderboard). Debug keys (each marks the run unranked): **1-5** drop a coconut of each type,
**N** next phase, **H** next scripted happening, **B** a fruit bat, **M** fill the Madness meter, **L** last life
(Heartbeat), **K** set the best just above your score, **Y** a sound check. **G** opens the game over screen with sample data,
**J** the leaderboard with sample entries. `?warmup` forces the first-run warm-up again.
`?debug&cover` then `await window.__mango.cover()` renders the cover picture (see `js/ui/cover.js`).

## How it uses start.ng

Only `js/startng.js` talks to start.ng (see `docs/startng-docs.md`): who is playing and their character (the hidden connect
page, with `api.start.ng/auth/me` as a fallback), the leaderboard (`startng.json`: score, survived, mangoes), and a re-check
when you come back to the tab. The game meets start.ng's Game standards: a visible link back to https://start.ng, the name
"start.ng" on the start and end screens, and a **Share on X** button when a round ends. Those two links (the X post composer,
opened only when you click Share on X, and start.ng) are the only links out of the game.

## Structure

```
index.html            page shell + import map
cover.png             the cover start.ng shows (made by ?cover, 1600 x 1000)
startng.json          the leaderboard's columns
css/                  tokens.css (design tokens), ui.css (screens, HUD, pop-ups)
js/main.js            boot, run flow (warm-up, countdown, play, game over), game loop
js/startng.js         start.ng wiring
js/core/              events, state, config (every tuning number), rng, store, input
js/world/             renderer + camera + quality levels, barge, journey, materials, rings, character
js/play/              player, drops, scoring, bank, plank, happenings, timeline, madness, warm-up, bot (debug only)
js/fx/                juice (freeze, shake, particles, pop-ups), adrenaline (Heartbeat and Madness looks), freeze budget
js/audio/             audio (music + every sound effect), loop window and beat clock helpers
js/ui/                hud, screens, wordmark, share card; tune and cover are debug only
js/content/text.js    every word the player reads
assets/music/         the music loop and its credits
docs/                 design, architecture and step briefs
tests/                node tests for the pure-logic modules
```

Each module's header comment is its contract: what it exports, which events it emits or hears, which state it owns.
The rules are in `docs/GAME_DESIGN.md`; the look is in `docs/ART_DIRECTION.md`.

## Credits

- Music: "Afro Beat Instrumental Music" by Rediskasound (Pixabay), edited into a seamless loop. See
  `assets/music/CREDITS.txt` for the source and licence.
- [three.js](https://threejs.org) (MIT), loaded from jsDelivr.
- Fonts: Archivo and Cormorant Garamond from Google Fonts (SIL Open Font License).
- Sound effects are synthesized in the browser; the pictures are drawn in code.
- Made on [start.ng](https://start.ng) by the Mango Rush team.
