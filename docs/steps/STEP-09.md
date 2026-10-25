# Step 9: Adrenaline and feel

Owner feedback on step 8: happenings are good. This step makes every moment FEEL big: the adrenaline systems
(Heartbeat, Mango Madness, the live best chase) become real, every scoring event gets proper game feel, and the
deck comes alive. Rules: `docs/GAME_DESIGN.md` → "Adrenaline systems", "Game feel (starting values)" and
"Decisions after the first beta" → 3 (living planks) and 4 (honest hooks).

Most of the LOGIC already exists from step 1 (scoring.js tracks Madness and Heartbeat and fires the events; the HUD
adds `is-heartbeat` / `is-madness` classes; juice.js does freeze, shake, squash, particles and pop-ups). Build on it;
don't rewrite what works.

## 0. Ground rules for this step
- **Loud wins, gentle losses.** Big feedback for catches, banks, skills, NEW BEST and escaping danger. Losses are
  quick and soft: no guilt text, nothing that pushes chasing losses.
- **Reduced motion** (setting or OS): no shake, no flashes, no slow motion, no camera push, no pulsing vignette.
  Replace them with calm alternatives (a steady tint, a static glow).
- **Readability first:** nothing may hide or wash out a warning ring, the player or a bank spot. Effects sit under the
  rings visually; flashes never cover the deck for more than 80 ms and never more than 3 times a second.
- **Daily Run stays identical:** nothing here may touch the drops rng or the happenings timeline. Anything random that
  only affects looks uses Math.random. Anything that adds GAMEPLAY items (the Madness storm) uses its own table
  drawn at reset (see 2).
- **Budget:** at most **+6 draw calls**, **no new render passes** (no post-processing pass; colour changes go through
  the existing materials' uniforms and CSS overlays), everything pooled, no allocation in per-frame updates.
- All numbers in `CONFIG.feel` / `CONFIG.adrenaline`, all words in `TEXT`.

## 1. Heartbeat mode (last life)
- Starts on `HEARTBEAT_START` (lives = 1), ends on `HEARTBEAT_END` or run end. Points ×1.5 already exist in scoring.
- **Colours drain** toward greyscale by ~70% across the deck, scenery, water and items, through a shared saturation
  uniform on the toon materials (no new pass). **Warning rings, bank spots, the player's outline and the HUD keep full
  colour.** Fade in over 0.6 s.
- **Screen edges pulse** (the CSS vignette) with a heartbeat rhythm: two quick beats every 0.85 s (lub-dub). Under
  reduced motion: a steady dark vignette, no pulse.
- The camera eases in ~4% closer (none under reduced motion).
- Sound (the heartbeat thump) is step 11; emit nothing new for it, audio.js already listens.

## 2. Mango Madness (hold ×5 until the meter fills)
- **The storm:** for the 8 s of Madness, extra plain mangoes rain down on top of the normal schedule: about 2 per
  second, spread over the deck, via `forceDrop` (never the drops schedule). Their spots and timings come from a
  **Madness table drawn at reset from its own rng** (seed derived from the run seed, e.g. `seed ^ 0x51ed270b`), so
  everyone who reaches Madness at the same run time gets the same storm. Keep them `minSeparation` apart and never on
  top of a coconut ring that is still falling.
- Coconuts keep falling normally: Madness is a reward, not a safe zone.
- **Look:** a warm gold glow on the screen edges (CSS, already `is-madness`), a gold tint on the deck lights, the
  character's outline turns gold, the camera pushes in ~8% (eased over 0.5 s, none under reduced motion).
- Each catch during Madness: +0.3 s (exists), a bigger gold burst, and the pop-up in the gold style.
- **Start moment:** a 60 ms freeze, "MANGO MADNESS!" banner, gold burst ring around the player.
- **End:** a soft fade back over 0.6 s; no "it's over" message.

## 3. Live best chase
- The HUD chip already shows ahead / behind best. Make it read well: "8,420 to beat your best" while behind, and when
  passing it a **mid-run NEW BEST moment**: a 40 ms freeze, gold burst at the player, the "NEW BEST" stamp under the
  score for 2 s, the character's cheer (exists). After that the chip shows "+1,240 above your best" in gold.
- Only once per run. Not shown when there is no best yet.

## 4. Game feel for every event (extend `CONFIG.feel`, use juice.js)
Use the "Game feel" table in GAME_DESIGN.md for catch, golden, near miss, Perfect dodge, hit, dash, step up and game
over (most exist: check each one actually fires and matches the table). Add these:
| Event | Freeze | Shake | Squash | Particles | Pop-up |
| --- | --- | --- | --- | --- | --- |
| POT_BANKED (walk) | 30 ms | 0.10 | 1.2, 60 ms | 24 saffron coins rising from the bank spot | "+3,200 banked" big, counts up |
| SLAM_BANK | 60 ms | 0.18 | 1.35, 70 ms | 36 + a ring burst | "SLAM +10%" gold |
| SWOOP | 0 | 0.04 | dash stretch | 10 saffron | "Swoop" |
| Chain step (chain ≥ 2) | 15 ms | 0.06 | — | 12 | "CHAIN ×N", grows with N |
| POT_LOST | 0 (the hit already freezes) | — | — | the pot's chip shatters into 16 pieces | "−3,200" bad, plain |
| BAT_HIT | 20 ms | 0.08 | 0.85, 60 ms | 8 dark | "Knocked" bad |
| BIGONE_SURVIVED | 80 ms | 0.25 | 1.3, 80 ms | 40 gold | "Big One survived" big |
| ITEM_SNATCHED | 0 | — | — | 6 | "Snatched!" small |
- **Freezes never stack:** a new freeze replaces a shorter one; the total freeze in any 1 s window is at most 200 ms.
- **Shake fades smoothly**, never per-frame jitter (juice.js already does this).
- **HUD and particles keep moving during freezes.**
- Pop-ups: at most 4 on screen; newer ones push older ones up; score pop-ups show the multiplier ("+300 ×3").

## 5. Game over
- On the final hit: 180 ms freeze, then 0.5 s at 20% speed while the character **tumbles** (a short fall and roll,
  not a ragdoll), a dot implosion around them, then the game-over screen. Under reduced motion: a 0.4 s fade, no slow
  motion.
- No new game-over screen design (step 10). Just the transition.

## 6. Living planks (look only, never gameplay)
- **Bounce on impacts:** a landing coconut makes the planks within ~2 units dip and spring back (a few cm, 0.3 s),
  strongest at the centre. The Big One makes the whole deck jolt.
- **Dust under dashes:** a small dust puff where a dash starts and a thin trail during it (pooled particles).
- **Footsteps:** a tiny dip under each FOOTSTEP at speed (very subtle). Creak sounds come in step 11.
- **Night glow:** from night, the plank seams glow faintly in a slow pulse (about 100 beats per minute, a placeholder
  until the music in step 11 drives it). Off under reduced motion (a steady faint glow instead).
- Do it with the deck's existing materials (a vertex offset uniform or per-plank instanced offsets), within the budget.

## 7. Debug and bot (`?debug`)
- Keys: **M** fills the Madness meter, **L** sets lives to 1 (Heartbeat), **K** sets the best to just above the current
  score (to see the NEW BEST moment). All mark the run "TUNING · NOT RANKED".
- Bot report: in addition to survival and hits per minute, report the **share of 20 bot runs that reach 120 s and
  207 s**. (The owner will decide in the polish step whether the gusts and The Big One come earlier.)

## 8. Tests
- All existing tests pass (`motion`, `frameclock`, `journey`, `pacing`, `pot`, `happenings`) plus `scoringSelfTest()`.
- New `tests/madness.test.mjs`: the Madness table is identical for the same seed, has no draw-count dependence on the
  player, and its spots keep `minSeparation`.
- New check in juice (a small pure helper is fine): freezes never exceed 200 ms in any 1 s window.
- Daily Run identical across two runs (first-20 drop log and happenings timeline), with and without a Madness.

## Out of scope
- Music and all sound effects: step 11 (keep emitting events; audio.js listens).
- The final HUD, banners and game-over screen design: step 10.
- Changing the run timeline (when gusts and The Big One happen): the polish step, based on play data.

## Done when
- [ ] No console errors apart from the expected start.ng ones. All tests pass, including the new ones.
- [ ] Heartbeat: colours drain except rings, bank spots, player outline and HUD; edges pulse lub-dub; calm under
      reduced motion.
- [ ] Madness: the storm rains extra mangoes from its own table, gold look, camera push, big start moment, soft end.
- [ ] NEW BEST mid-run moment fires once; the chip reads "to beat your best" / "above your best".
- [ ] Every event in section 4 has its feel; freezes never stack beyond 200 ms per second.
- [ ] Game over: freeze, slow motion, tumble, implosion (fade under reduced motion).
- [ ] Living planks: bounce on impacts, dash dust, footstep dips, night seam glow.
- [ ] M, L, K debug keys work and mark the run unranked.
- [ ] Rings, player and bank spots stay readable in every effect (screenshots in Heartbeat and Madness, desktop and
      phone).
- [ ] Budget: at most +6 draw calls, no new passes; report a busy night scene with Madness before and after.
- [ ] Daily Run identical.
- [ ] Committed on `v1` as `step 09: adrenaline and feel`, with **no Co-Authored-By line**.

## Report (in chat, under 25 lines)
1. What you built, file by file; contract changes.
2. Bot: survival, hits per minute, and the share of runs reaching 120 s and 207 s.
3. Performance before and after.
4. Screenshots (Heartbeat, Madness, NEW BEST, a slam bank) desktop and phone, in `screenshots/step-09/` (not committed).
5. A test script for the owner: M for Madness, L for Heartbeat, K for NEW BEST; slam a bank; get hit by a bat; lose
   the last life. Then the same with reduced motion on.
6. Anything you simplified or couldn't do.
