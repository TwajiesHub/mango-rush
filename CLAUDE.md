# Mango Rush — instructions for Claude Code

You are building **version 1 of Mango Rush**, a 3D arcade game made with three.js for **start.ng** (a Nigerian
community games platform). The owner is Bonnke (GitHub: TwajiesHub). A planning assistant (Claude, in a separate
chat) designed the game with him and steers the build by writing the files in `docs/`. You do the building,
**one step at a time**.

## Read before any work
1. This file.
2. `docs/ROADMAP.md` — the steps, their status, and which one is current.
3. The current step brief: `docs/steps/STEP-NN.md`. **Do only that step.**
4. As needed: `docs/GAME_DESIGN.md` (rules and numbers), `docs/ART_DIRECTION.md` (look and screens),
   `docs/ARCHITECTURE.md` (modules, events, state), `docs/startng-docs.md` (the official start.ng guide),
   `docs/mockups/` (approved screen mockups, if the owner has added the images).

## Where things are
- `main` branch = the LIVE game at https://mango-rush.start.ng (version 0, a simpler island game).
  start.ng redeploys automatically on every push to `main`.
- `v1` branch = where you work. **Never commit to or push `main`.** Never merge into `main` unless a step brief says so.
- `docs/skeleton/` = the planned version 1 file structure with each module's contract written in its header
  comment. Step 1 moves it into place.
- The beta is a second repo, `TwajiesHub/mango-rush-beta` (git remote `beta`), live at
  https://mango-rush-beta.start.ng. The owner pushes there with `git push beta v1:main` after checking a step.

## Hard rules
- **Static files only.** Plain JavaScript ES modules, HTML and CSS. No build step, no bundler, no npm packages,
  no frameworks. start.ng never runs a build. three.js r160 comes from jsDelivr through the import map in
  `index.html` (`import * as THREE from 'three'`).
- **Relative paths only** (`./js/main.js`, `assets/music/loop.mp3`, never `/js/...`).
- **No secrets, no tracking, no outside network calls** except: three.js from jsDelivr, Google Fonts, and start.ng
  (`https://start.ng/connect` and `https://api.start.ng`) — and those only through `js/startng.js`.
- **No `eval`, no `new Function`, no obfuscated or encoded code, no password fields, no redirects.** start.ng's
  publish check refuses these.
- **Never install anything globally or run scripts you downloaded.** If you need a local web server to test, use
  `python -m http.server 8000` (on Windows `py -m http.server 8000`; or `npx --yes serve` only if the owner agrees).
- The owner works on **Windows** (PowerShell). Give commands that work there.
- Keep the game playable at the end of every step. Commit on `v1` at the end of the step with a clear message
  (`step 02: barge and camera`).
- Respect the contracts in each module's header (exports, signatures, events, state ownership). If a contract is
  wrong or missing something, change the contract comment AND the code together, and mention it in your report.
- All tuning numbers live in `js/core/config.js`; all player-facing words in `js/content/text.js`.
- Performance target: smooth on mid-range Android phones. Pixel ratio cap 1.5, no real-time shadow maps (blob
  shadows), pooled objects, no allocations inside per-frame update functions, under 2 MB download (excluding three.js).
- Accessibility: real `<button>`s, visible focus, contrast >= 4.5:1, touch targets >= 44 px, a reduced-motion
  setting that removes shake/flash/slow motion.

## How to work a step
1. Read the step brief fully. If anything is unclear or conflicts with these docs, ask the owner before coding.
2. Make a short plan (which files you will touch) and show it.
3. Build it. Keep changes inside the step's scope.
4. Test it:
   - Run a local server from the repo root and check the browser console has no errors.
   - Locally there is no start.ng sign-in (the connect page only answers on *.start.ng), so the game must fall back
     to the guest look within ~4 s and still be fully playable.
   - Go through the step's "Done when" checklist item by item.
5. Commit on `v1`.
6. Write the report described at the end of the step brief (what you built, what you could not do, anything the
   planner should know, and exactly what the owner should test). Keep it short and honest: never claim something
   works if you did not run it.

## Publishing (only when a step brief says so)
- Beta: `git push beta v1:main` (start.ng redeploys mango-rush-beta.start.ng within a minute or two).
- Check a repo the way start.ng will: `POST https://api.start.ng/games/check` with
  `{"repo_url":"https://github.com/TwajiesHub/mango-rush-beta"}`. Fix every error it reports.
- The live game (`main`) is only updated in the final release step.
