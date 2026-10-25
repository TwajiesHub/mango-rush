# Mango Rush — Roadmap to version 1

One step at a time. Claude Code only works the step marked **CURRENT**. After each step the owner tests (locally and on
the beta), reports to the planner, and the planner writes the next brief in `docs/steps/`.

| Step | Name | What it delivers | Status |
| --- | --- | --- | --- |
| 0 | Setup (owner) | clone, `v1` branch, kit copied in, beta repo + remote | done |
| 1 | Foundation | v1 structure in place; v0 gameplay ported into the modules; scoring/rng/store done; plain screens | done |
| 2 | Barge and camera | barge deck replaces the island; tilted camera with horizon, sky, sun, water; short-screen fixes | done |
| 3 | Movement feel | smooth direction, weight, skid, steerable dash + snap turn, lean, knees/elbows, trailing hair/scarf, look-ahead camera, slippery-surface hook, footsteps, `?debug` tuning panel; 3b: dash button, 60 fps frame pacing, quality manager | done |
| 4 | The look | cel shading, outlines, paper grain, item models, dot-ring warnings, character print pattern + reactions, Archivo name tag | done |
| 5a | The rules, part 1 | rings closing in, coconut types (slow, fast, drifter, late-lock) + shuffle bag + mercy window, working Perfect dodge, sawtooth waves + breathers, early golden win, rotten + shield live; small fixes (mango shape, deck colour, dash pill) | done |
| 5b | The rules, part 2 | the pot + bank spots, skills (Swoop, Chain, Slam bank), juice splats, golden plank, pot chip in the HUD | done |
| 6 | The journey | six parallax layers, six places + banners, golden hour → dusk → night → midnight light, moon + stars, lanterns, wet edges, birds/bats/fireflies/fireworks, score-version reset, N debug key | done |
| 7 | Thrill pass A | compressed difficulty curve, lead-aimed coconuts, patterns (line, cage, sweep) at wave peaks, golden mango = double danger | done |
| 8 | Happenings | Lights out (bridge), gusts, fruit bat, The Big One, mango showers (volleys already live since 5a); 8b review fixes | done |
| 9 | Adrenaline + feel | heartbeat, Madness, best chase, bank/skill effects, living planks, freezes, shake, squash, particles, pop-ups; 9b storm cap | done |
| 10 | The screens | start, HUD (pot chip), pause, game over (record near miss, lost pot, skills line, rival), leaderboard, share card — matched to the mockups; 10b start.ng standards (share on X, back link) | done |
| 11 | Sound | afrobeat loop (adaptive) + all sound effects | **CURRENT** |
| 12 | Polish | warm-up tutorial, accessibility, phone performance, new cover.png, start.ng check clean | — |
| 13 | Release | merge `v1` into `main` (without `docs/`, `tests/`) → mango-rush.start.ng becomes version 1 | — |

## Step 0 — owner setup (no Claude Code needed)
1. Clone the live repo and make the work branch:
   ```
   git clone https://github.com/TwajiesHub/mango-rush.git
   cd mango-rush
   git checkout -b v1
   ```
2. Copy the kit into the repo root: `CLAUDE.md` and the whole `docs/` folder.
3. Commit and push the branch:
   ```
   git add CLAUDE.md docs
   git commit -m "docs: version 1 plan and build kit"
   git push -u origin v1
   ```
4. On GitHub create a new **public** empty repo `mango-rush-beta` (no README), then:
   ```
   git remote add beta https://github.com/TwajiesHub/mango-rush-beta.git
   ```
   (The first beta push and publish happen after step 1.)

## After every step (owner)
1. Test locally (Claude Code tells you how).
2. Push to the beta: `git push beta v1:main` — the first time only, also publish it (PowerShell):
   ```
   $body = '{"repo_url":"https://github.com/TwajiesHub/mango-rush-beta","name":"mango-rush-beta"}'
   try { Invoke-RestMethod -Method Post -Uri "https://api.start.ng/games/publish" -ContentType "application/json" -Body $body } catch { $_.ErrorDetails.Message }
   ```
   and open the `approve_url`. After that every `git push beta v1:main` updates mango-rush-beta.start.ng by itself.
   If the beta still shows the old version a few minutes after a push, run the same publish block again: it updates
   immediately (reply `created : False`). Then reload with `?v=N` (any new number) to skip the browser's saved copy.
3. Play it on laptop and phone; send the planner Claude Code's report + screenshots + anything that felt off.
