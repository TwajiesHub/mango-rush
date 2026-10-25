# Step 12: Polish

Owner feedback on step 11: sound is in. This is the last building step before release. It finishes the first-run
experience, tunes the numbers from play data, makes the game solid on phones and for everyone, gives it a proper cover,
and clears every start.ng check. **No new features.** Small, careful changes, each one tested.

## 1. First run: warm-up and countdown (`main.js` still has a TODO at the start of play)
- **Countdown (every run):** 3 · 2 · 1 · GO over ~2.4 s in the banner style (big Archivo numerals, saffron "GO"), with
  the existing COUNTDOWN events (sounds exist). The run clock starts at GO. Esc during the countdown pauses.
- **Warm-up (first run only, `setWarmupDone()` exists):** ~12 s before the countdown, on a calm deck at golden hour:
  1. "Move" hint under the character (WASD / arrows on desktop; "drag anywhere" on phone) until the player moves;
  2. one slow mango falls near them: "Catch the mangoes";
  3. one slow coconut far away: "Dodge the coconuts: watch the red ring";
  4. "SPACE / DASH to dash" until they dash once.
  Hints fade after each first input; a **Skip** button (and Esc) is always there. Then the normal countdown. It never
  counts as a run (no score, no leaderboard, no rng draws from the run's rng: use `forceDrop`).
- **Bank hint:** the first time a pot reaches 1,000 in any run, a one-time hint "Walk into a glowing spot to bank it"
  pointing at the nearest bank spot (`bankHintDone` exists). Once per player.

## 2. Tune the numbers from data (use the bot; report before and after)
- **Medal thresholds** (placeholders 5k / 15k / 30k / 60k): run 40 bot runs at reaction 0.5 and 40 at 0.35 (same seeds as
  before). Set **bronze ≈ the median score at 0.5, silver ≈ the 90th percentile at 0.5, gold ≈ the median at 0.35,
  diamond ≈ the 90th percentile at 0.35**, rounded to friendly numbers (e.g. 12,500). Put the table in the report.
- **The first gust** (owner decision): at reaction 0.5 only ~20% of runs reach 120 s, so most players never see a gust.
  Move the **first gust earlier**, to the latest time in **100–118 s** that keeps ≥ 4 s clear of Lights out and the
  shower, and that **≥ 35% of 0.5 runs reach**. Keep the second gust (180 s) and **The Big One at 210 s** (it's the
  midnight goal for good players). Only change `CONFIG.happenings`; the timeline tests must still pass.
- Re-run the Daily Run check after the change.

## 3. Phones and performance
- Test with Chrome DevTools at a **mid-range Android profile** (4× CPU throttle, 390×844 and 360×740). Report frame time
  in: a busy night scene, Madness with the storm, Lights out, and the pause screen.
- If the **quality manager** (step 3b) doesn't keep it under ~22 ms average on the throttled profile, make it step down
  further (pixel ratio, scenery detail, particle counts, storm cap 6 → 4). Document each level.
- **Pause blur:** fall back to a plain dim on the low quality level (backdrop-filter is costly on weak phones).
- **Download size:** measure what a player actually downloads at first load (excluding three.js from jsDelivr); it must
  stay under 2 MB. List the biggest files.
- Check for memory leaks over 5 restarts (heap and live nodes / DOM pop-ups return to the same level).

## 4. Accessibility pass
- Keyboard only: every screen reachable and usable; visible focus; logical order; Esc closes overlays.
- Screen reader basics: buttons and toggles have names and states; the score and medal are announced on game over;
  banners use `aria-live="polite"` sparingly (not every pop-up).
- Contrast ≥ 4.5:1 for all text (check the ochre cards, gold chips and the HUD over bright skies).
- Colour-blind safety: coconut rings already use a cross shape; check rotten mango and shield rings are told apart by
  **shape**, not only colour. Fix if not.
- Reduced motion: walk through a whole run with it on (no shake, flashes, slow motion, camera push, pulsing).
- Touch targets ≥ 44 px; the joystick and DASH work with the left and right thumbs on 360-wide screens.

## 5. Small fixes left from earlier reviews
- **Same-frame landing order:** when two coconuts land in the same frame, process them in spawn order (tie-break by drop
  id), so the Daily Run is strictly identical (step 9b note).
- **Heartbeat vignette:** fade in over 0.6 s like the colour drain.
- **Drops at game over:** instead of hanging frozen in the air during the death slow motion, let them fade out softly.
- Any console warnings in a normal run: fix them.

## 6. The cover (`cover.png`, 1600×1000, 16:10, under 400 KB)
- Make it **from the game itself**: a `?cover` debug mode that poses the scene for a cover shot: golden hour, the barge
  and lagoon, the character mid-dash catching a mango, a coconut ring nearby, the sun with its dot rings, and the
  **MANGO RUSH wordmark** composed on top (as on the start screen). Render at 1600×1000 and save as PNG.
- Use a **neutral default character** (not the owner's start.ng look), so the cover suits everyone.
- Replace the old version-0 `cover.png` at the repo root (same name and place: start.ng reads it).

## 7. start.ng checks and the docs
- Push to the beta and run `POST https://api.start.ng/games/check` on `TwajiesHub/mango-rush-beta`: **zero errors and
  zero warnings** (the cover fixes `no_cover`; report any other warning and whether it can be fixed).
- Update `README.md` for players and developers: what the game is, controls (desktop and phone), modes, how to run it
  locally, credits (music: see `assets/music/CREDITS.txt`).

## Out of scope
- New features, new happenings, new sounds (volume tweaks the owner asks for are fine).
- The release itself (merging to `main`): step 13.

## Done when
- [ ] Countdown on every run; the warm-up on the first run only, skippable; the one-time bank hint.
- [ ] Medal thresholds set from bot data (table in the report).
- [ ] First gust moved per section 2 (or explained if no time fits); all timeline tests pass; Daily Run identical.
- [ ] Throttled-phone frame times reported and within target (or the quality levels adjusted); pause dim on low quality.
- [ ] First-load download under 2 MB (excluding three.js); no leaks over 5 restarts.
- [ ] Accessibility pass done, with fixes listed.
- [ ] The section 5 fixes are in.
- [ ] New `cover.png` from `?cover`, under 400 KB.
- [ ] start.ng check on the beta: zero errors and zero warnings (or each warning explained).
- [ ] README updated.
- [ ] Committed on `v1` as `step 12: polish` (more than one commit is fine, e.g. `step 12a`, `12b`), with **no
      Co-Authored-By line**.

## Report (in chat, under 30 lines)
1. What changed, grouped by the sections above.
2. The medal table and the new first-gust time, with the bot data behind them.
3. Phone frame times (throttled) and download size.
4. The accessibility fixes.
5. The start.ng check result.
6. A short final test script for the owner (first run as a new player: clear the site data, or use a private window).
