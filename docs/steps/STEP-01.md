# Step 1 — Foundation

**Goal:** the repo has the version 1 structure, and the game plays at least as well as today's live version 0,
running on the new modules. No new visuals yet: this step is plumbing done properly, so every later step only adds.

Work on branch `v1`. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and the header comment of every file in
`docs/skeleton/` before you start.

## 1. Move the skeleton into place
- Copy everything from `docs/skeleton/` to the repo root (index.html, css/, js/, assets/, startng.json),
  overwriting the version 0 `index.html` and `js/main.js` and `js/startng.js`.
- Delete the version 0 files that are replaced: `style.css`, `js/character.js` (it now lives at
  `js/world/character.js` — the skeleton already has the latest copy).
- Keep `cover.png`, `README.md` (update it at the end), `startng.json` (the skeleton's copy is identical).
- Keep `docs/skeleton/` as the reference for the contracts (do not delete it).

## 2. Port the version 0 gameplay into the modules
Version 0 lives in git history (`git show main:js/main.js`). Bring its behaviour across into the right modules,
following each module's contract:
- `js/core/input.js`: keyboard (WASD/arrows, Space = dash, Esc/P = pause) and the floating touch joystick + dash
  button hook (`initInput`, `readInput`, `takeDash`, `isTouch`). Prevent page scroll/zoom gestures on the canvas.
- `js/world/renderer.js`: renderer (pixel ratio cap 1.5), resize, camera modes `menu` / `play` / `over`, follow
  target, `renderFrame` applying `juice.cameraShake()`, `makePortrait()` (render the character head to a 128×128
  data URL — used only when start.ng gives no face).
- `js/world/barge.js`: **for this step only**, port version 0's island world (water, sand, grass, palms, mango
  trees, clouds) so the scene looks like today's game. `deckBounds()` returns the island's walkable radius as
  `{ halfWidth, halfDepth }` (equal values for now). Step 2 replaces it with the barge.
- `js/world/journey.js`: leave as stubs (step 5).
- `js/play/player.js`: movement, facing, dash (with cooldown), invulnerability after a hit, the character model
  (`setCharacter(info)` builds it with `buildCharacter(info.style, info.name)` from `js/world/character.js`),
  `getPlayer()` returning `{ object, x, z, invulnerable, dashing }`. Emit `EVENTS.DASH`. Write `state.dashReadyFrac`.
- `js/play/drops.js`: the spawner using `difficultyAt(state.time)` from config (drop gap, coconut share, warning time,
  golden chance), mangoes / golden mangoes / coconuts with version 0's look and warning rings, catching (call
  `fruitCaught`), landing (call `coconutLanded` with `dist`, `invulnerable`, `perfect:false`, `big:false`), landed
  mangoes blinking and rotting, pooling. Use the `rng` passed to `resetDrops(rng)` for every random choice (so the
  Daily Run is the same for everyone).
- `js/play/happenings.js`: stubs are fine (step 6).

## 3. Implement the pure-logic modules fully (their contracts are complete)
- `js/core/rng.js` — Mulberry32, FNV-1a daily seed, dailyLabel, randomSeed.
- `js/core/store.js` — per-user localStorage with try/catch everywhere.
- `js/play/scoring.js` — every rule in its header: combo ×1–×5 with the draining timer and one-step drop, near miss,
  shield, lives, heartbeat flag, Madness meter/active, best chase + BEST_PASSED once, medals, endRun firing once per run.
  Add a small self-check you can run in the browser console (e.g. `window.__mangoTest?.scoring()` behind `?debug`).

## 4. Screens and HUD for this step
Keep `js/ui/screens.js` and `js/ui/hud.js` simple but usable (the real design is step 8): a start screen with
Play / Daily Run / the player's name / sign-in button for guests, a HUD with score, lives, multiplier and
combo timer, a pause screen, and a game-over screen with the RunSummary numbers and the leaderboard line
(listen for `EVENTS.LEADERBOARD_SAVED`). Use the tokens in `css/tokens.css` so it already looks on-brand
(ochre paper, umber text, Archivo). `js/fx/juice.js` and `js/audio/audio.js` may stay stubs, but port version 0's
simple particles and pop-up text into juice if it is quick.

## 5. Debug hook
Behind `?debug` in the URL only: `window.__mango = { state, end() }` where `end()` ends the run (for testing game over).

## Done when
- [ ] `python -m http.server 8000` → http://localhost:8000 boots with **no console errors**, shows the start screen as
      a guest within ~5 s (the start.ng connect page does not answer locally).
- [ ] Play: mangoes, golden mangoes and coconuts fall with warning rings; catching scores 100 / 500 × multiplier; the
      multiplier climbs every 5 catches and drops one step when the timer empties; coconut hits cost a life and reset
      the multiplier; 3 lives; near misses score.
- [ ] Pause (Esc/P and leaving the tab) and resume work.
- [ ] Game over shows the summary; Play again restarts in under a second; Menu returns to the start screen.
- [ ] Daily Run uses the date seed: two runs on the same day get the same first 10 drops (log them behind `?debug`).
- [ ] Keyboard and touch both work (test touch with the browser's device toolbar).
- [ ] `index.html` loads only: three.js (jsDelivr), Google Fonts, and the game's own files.
- [ ] README.md updated to describe version 1's structure (short).
- [ ] Committed on `v1`: `step 01: foundation`.

## Report (write this at the end, in chat)
1. What you built, file by file (one line each).
2. Anything from the contracts you changed, and why.
3. Anything you could not finish or are unsure about.
4. Exact test instructions for the owner (local URL, keys, what to look for).
5. Then remind the owner: `git push beta v1:main` and, the first time only, publish the beta (see `docs/ROADMAP.md`).
