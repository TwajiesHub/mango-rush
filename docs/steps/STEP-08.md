# Step 8: Happenings

Owner feedback on step 7: the danger level is right now. Keep the curve, patterns, aiming and the hot golden mango as
they are. This step adds the **scripted moments** that give every run a story: Lights out, gusts, the fruit bat,
The Big One and mango showers. Rules and numbers are in `docs/GAME_DESIGN.md` → "Decisions for the happenings
(25 Oct)", which overrides the older Happenings list.

Coconut **volleys** are already live (step 5a): leave them alone.

## 0. Ground rules for this step
- **Daily Run stays identical.** Every happening is tied to the RUN CLOCK (`state.time`) and to the happenings rng that
  `main.js` already passes to `resetHappenings(rng)`. Draw EVERYTHING the happenings need **at reset**, in a fixed
  order (bat times and angles, gust directions, shower spots), so nothing the player does changes a draw. Never touch
  the drops rng or its draw order (the 12 draws per spawn event in `drops.js` stay exactly as they are).
- **Pure logic apart from looks.** Put the timeline maths in a new `js/play/timeline.js` with NO three.js and no DOM:
  `buildTimeline(rng) -> timeline` and small queries (`activeAt(timeline, t)`, `windAt(timeline, t)`,
  `dropsHeldAt(timeline, t)`, `nextBat(timeline, t)`). `happenings.js` uses it and owns the visuals and events.
  Update both modules' header contracts.
- **Events:** `HAPPENING_WARN { id, inSeconds }` 2 s before each scripted happening (`bridge`, `gust`, `bigone`,
  `shower`), then `HAPPENING_START { id }` and `HAPPENING_END { id }`. The HUD banner already listens. The bat uses its
  own 1 s path tell; it shows the "Fruit bat!" banner only the FIRST time in a run.
- **Numbers in `CONFIG`, words in `TEXT`.** Extend `CONFIG.happenings` / `CONFIG.bat` with the values below.
- **Budget:** at most **+10 draw calls** at the busiest moment, no new render passes, everything pooled, no allocation
  in per-frame updates. Reduced motion: no shake, no flicker, no flashes.
- No two happenings overlap. A bat never comes within 4 s of a scripted happening (move it after).

## 1. Lights out (under the bridge): 86 s for 10 s, banner "Lights out"
- The bridge already enters as scenery at 70 s (`journey.places`). Time it so the bridge span passes OVER the barge
  for 86–96 s: a dark band (the bridge's shadow) sweeps over the deck in ~1 s, stays, and sweeps off.
- Under it the scene light drops to about 25% (deck, water, items, scenery). **These stay fully readable:** every
  warning ring (they already glow: keep them at full brightness), the bank spots, and the player (a soft cream rim /
  outline on the character so you always see yourself and your direction).
- Fruit on the deck is dark but its ring still glows, so catching still works.
- Patterns and aimed coconuts carry on as normal: the rings are the honest tell.
- Done right, it feels tense, not unfair. Check it at 1440×900 and 390×844.

## 2. Gusts: 120 s and 180 s, 6 s each, banner "Gust incoming"
- `windAt(t)` returns a push `{ x, z }` in deck-local units per second. Direction: one rng draw per gust at reset,
  mostly sideways (within ±30° of screen-left or screen-right). Strength 1.2 units/s, easing in and out over 0.5 s.
- It pushes **FALLING items only**, never the player and never landed items. A falling item's landing spot moves with
  the wind (the ring slides, with the drifter's trailing-dot tell) **until it locks**, and every landing spot still
  locks at least `CONFIG.coconuts.minLock` before impact. After the lock nothing moves. Clamp spots inside the deck.
- Looks: pooled wind streaks (short dashes in the dot style) and a few leaves blowing across; the character's hair /
  scarf trail with the wind.

## 3. Fruit bat: from dusk (60 s), every 25–40 s (times drawn at reset)
- Each bat: a straight path across the whole deck (angle and offset from the rng, drawn at reset; not aimed at the
  player). **1 s before**, the path shows as a dotted line on the deck in the ring dot style; then the bat swoops along
  it in ~0.8 s. Path width ~0.8 units.
- **Touching the bat** (the player's circle overlaps the bat's body): the combo drops ONE step (minimum ×1, comboStep 0,
  combo timer restarts at 50% if still above ×1). No life lost, no pot lost, the shield is not used. Add
  `batHit({ x, z })` to `scoring.js` (update its contract and `scoringSelfTest()`), plus a small knock-back popup.
- **A dash passes through the bat safely** (no hit while dashing).
- The bat **snatches any mango or golden mango** on its path, falling or landed: it vanishes with a "Snatched!" popup,
  no juice patch, no score. Coconuts, rotten mangoes and the shield are ignored.
- Looks: a small dark fruit bat with a cream outline (readable at night), flapping, in 1–2 draw calls. Different from
  the ambient journey bats (those stay as background life).

## 4. The Big One: 210 s, banner "The Big One"
- At 207 s a **giant coconut** spawns, aimed at **where the player is at that moment** (clamped inside the deck; it
  never follows). Warning 3 s, so it lands at 210 s. Its ring is huge: hit radius ~3.0 units, closing in like every
  ring (honest), with the coconut cross and a slow, heavy pulse. A giant blob shadow grows under it.
- **All other drops are held** from 206 s until 211 s (on the schedule clock, using the existing hold mechanism: the
  draws are still made, so the Daily Run order never changes).
- Impact inside the ring = the normal coconut hit via `coconutLanded({ ..., big: true })`: −1 life, pot lost, combo ×1;
  **the calabash shield blocks it**. A Perfect dodge works on it too.
- **Surviving:** +500 into the pot and the popup "Big One survived".
- Impact feel: a big splash ring of dots across the deck and a strong shake (0.6), both skipped under reduced motion.

## 5. Mango showers: ~98 s, ~152 s, ~215 s, 3 s each, banner "Mango shower"
- About 10 mangoes rain down over the 3 s (plain mangoes; their spots drawn at reset, kept apart by `minSeparation`),
  using `forceDrop` so the drops schedule and rng are untouched.
- **No coconut lands during a shower** (or in the 0.5 s after): hold coconut events on the schedule clock, as for The
  Big One.
- Looks: a few leafy branch silhouettes sway in at the top of the screen while it lasts.
- It should feel like a reward after a scary moment: catches during a shower count normally (combo, pot, Swoop).

## 6. Debug (`?debug` only)
- **H** starts the next scripted happening now; **B** sends a bat now (its path drawn from Math.random, debug only).
- Both mark the run "TUNING · NOT RANKED", like N and the tuning panel.
- The panel shows the current/next happening, the wind vector and the next bat time.

## 7. Tests
- New `tests/happenings.test.mjs` (plain node, uses `timeline.js` only):
  - the same seed gives an identical timeline; different seeds give different bat times;
  - no happenings overlap, and no bat within 4 s of a scripted happening;
  - `windAt` is zero outside gusts and never above 1.2 inside one;
  - `dropsHeldAt` is true for the Big One window (206–211 s) and the shower windows, false elsewhere.
- All existing tests still pass (`motion`, `frameclock`, `journey`, `pacing`, `pot`), plus `scoringSelfTest()`.
- Daily Run check: two runs with the same date seed give identical first-20 drop logs AND identical happening timelines.

## Out of scope
- Heartbeat, Madness, best chase and the big effects: step 9.
- Final HUD / banner / game-over design: step 10. (Use the existing banner.)
- Music and sound effects, including the "silence beat" before a happening: step 11. Emit the events; sound comes later.

## Done when
- [ ] No console errors apart from the expected start.ng ones. All node tests pass, including the new one.
- [ ] Lights out: dark under the bridge from 86 to 96 s; rings, bank spots and the player stay clearly readable
      (screenshots at 1440×900 and 390×844).
- [ ] Gusts at 120 s and 180 s push falling items only; rings slide honestly and lock before impact.
- [ ] Bats from dusk: dotted path 1 s ahead; touching drops the combo one step; dashing passes through; mangoes on the
      path are snatched.
- [ ] The Big One lands at 210 s where the player stood at 207 s; other drops held; hit = life + pot (shield blocks);
      surviving = +500 into the pot.
- [ ] Three mango showers with no coconut landing during them.
- [ ] H and B debug keys work and mark the run unranked.
- [ ] Daily Run identical across two runs (drop log and timeline).
- [ ] Budget: at most +10 draw calls at the busiest moment; report a busy night scene on the UHD 620 before and after.
- [ ] Committed on `v1` as `step 08: happenings`, with **no Co-Authored-By line**.

## Report (in chat, at the end, under 25 lines)
1. What you built, file by file, and contract changes.
2. One bot run at reaction 0.5: survival time and hits per minute, before vs after.
3. Performance before and after.
4. Screenshots of Lights out, a gust, a bat path and The Big One ring, desktop and phone, in `screenshots/step-08/`
   (not committed).
5. A test script for the owner: use H to see each happening and B for a bat; try dashing through a bat; stand still
   under The Big One once, then dash out of it.
6. A reminder: push to the beta (`git push beta v1:main`).
