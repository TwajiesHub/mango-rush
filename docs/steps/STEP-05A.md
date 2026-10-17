# Step 5a: The rules, part 1 (coconuts, pacing, items)

**Goal:** the run gets its rhythm and its surprises:
- coconuts that are **unpredictable but never unfair**;
- difficulty in **waves** with breathers;
- a quick early win;
- all the items in play;
- warning rings that **close in**;
- a working **Perfect dodge**.

The pot, bank spots, skills and planks are **step 5b**. Don't build them here.

Work on branch `v1`. Before you start, read:
- `CLAUDE.md`;
- `docs/GAME_DESIGN.md`: "Items", "Scoring, combo, lives", "Run structure", and "Decisions after the first beta", sections 4 (pacing) and 5 (coconut types);
- the headers of `js/play/drops.js`, `js/play/scoring.js`, `js/core/config.js` and `js/core/rng.js`.

The owner is happy with the current camera and object sizes. **Don't change the camera framing.**

## 0. Small carry-over fixes
1. **Mango shape:** the mango and golden mango become a tilted oval (taller than wide, about 1.25:1, leaning about
   15°) with the vermilion blush on the upper side, not a round apple. It stays one merged mesh plus its outline.
2. **Deck colour:** a little brighter and warmer, closer to `#B9824A` as in the mockup. The plank seams stay subtle.
3. **Dash pill:** the desktop pill must always show its label ("SPACE · DASH READY") and the cooldown fill. In the
   step 4 1440×900 screenshot it was an empty dark pill.

## 1. Warning rings close in
- Every warning ring **closes in** toward the centre over the fall: it starts at about 1.6× its size and reaches
  1.0× at impact, so the ring itself is the timer.
- The rate always matches the real fall time, which keeps the ring honest.
- Use the `setRingTell` hook and per-drop uniforms. Don't rebuild anything.

## 2. Coconut types (`js/play/drops.js`)
Every type has a **tell** (the ring's look plus a whistle sound) and **locks its landing spot at least 0.35 s before
impact**.

| Type | Behaviour | Tell (via `setRingTell` and audio) | From |
| --- | --- | --- | --- |
| Normal | as today | red dot ring with the dotted cross | start |
| Slow | hangs and wobbles at the top for a moment, total warning about 1.6 s | ring closes slowly (wider dot spacing), low whistle | golden hour |
| Fast | quick drop, warning about 0.45 s (an exception to `minWarn`, only for this type) | small, tight ring with a fast pulse, high whistle | dusk |
| Drifter | the landing spot slides up to 1.5 units sideways during the fall (wind), then locks at 0.35 s | the ring visibly slides, and the dots trail a little in the slide direction | dusk |
| Late-lock | the ring follows the player loosely (lagging about 0.4 s behind, never closer than 0.6 units ahead of them), then **locks 0.4 s before impact** | a pulsing centre dot that snaps solid (`lock` 0 → 1) the moment it locks, plus a click sound | night |

**Rules**
- **Locking:**
  - The coconut's actual landing point is the ring's position at lock time. After lock, nothing moves.
  - The hit and near-miss checks use the locked point.
- **Drifter rng:** the drift direction and distance come from the run's rng, drawn at spawn.
- **Late-lock position:** its final spot depends on where the player is. That's fine, because the rng draws stay
  the same.
- **Slow on screen:** the slow coconut is visible hanging above its ring during the wait (a small wobble), so the
  player understands why the ring is slow.

**Shuffle bag**
- Coconut types come from a **shuffle bag**, like Tetris pieces. The bag holds the current phase's mix, it's
  shuffled with the run's rng, and types are dealt in order. Refill it when it's empty, or when the phase changes.
- Starting mixes, in `CONFIG.coconuts.bags` (8 entries each):
  - golden hour: 6 normal, 2 slow;
  - dusk: 3 normal, 2 slow, 2 fast, 1 drifter;
  - night: 2 normal, 1 slow, 2 fast, 2 drifter, 1 late-lock;
  - midnight: 1 normal, 1 slow, 2 fast, 2 drifter, 2 late-lock.
- **Never more than one live late-lock coconut at a time.** If the next type is late-lock while one is live, deal
  the next type instead. That draw has to be deterministic too.

**First appearance:** the first time each type appears in a run, it falls **alone**. Delay any other drop so that
none lands within 2 s of it.

**Mercy window:** for 1.5 s after a hit, no coconut may **target or lock onto** a point within 1.2 units of where the
player stood when hit. Move it outward along the same angle.

**Volleys:** keep the volley rule (from 35 s, coconuts can bring two friends). Volley friends are always Normal type.

**Daily Run:** every rng draw still happens in a fixed order and count for each spawn event, whatever the player
does. Rewrite the "draws" list in the drops.js header to include the type deal, the drift draws and the bag refill
shuffles. Then update `getDropLog()` and confirm two Daily Runs on the same day get identical first-20 logs.

## 3. Perfect dodge (it doesn't fire yet)
Today `drops.js` always passes `perfect: false`. Make it work:
- At a coconut's impact, if the player **started a dash within the last `CONFIG.perfectDodgeWindow` (0.2 s)** and
  was inside the hit radius when that dash started, but is outside it at impact, call
  `coconutLanded({ ..., perfect: true })`.
- Expose the dash start time and position from `player.js` (via `getPlayer()`), without allocations.
- The slow motion and pop-up already exist in juice and scoring. Check they fire.
- Per the design, a Perfect dodge also **refills the dash instantly**.

## 4. Pacing: sawtooth waves and the early win (`js/core/config.js`)
**Waves**
- Keep the difficulty table as the overall trend, and multiply it by a **wave**:
  - over each wave of about 25 s, the drop gap tightens and the coconut share rises a little (up to about +25%
    intensity at the peak);
  - then a **4–5 s breather:** the gap widens about 1.6×, the coconut share falls by half, and **one golden mango is
    guaranteed** in the breather (from dusk on).
- Wave times come from config, not rng, so they're identical for everyone.
- Add `waveAt(t) -> { intensity, breather }` next to `difficultyAt`, and use it in `drops.js`.

**Early win:** every run has **one golden mango guaranteed between 8 and 14 s**, at an rng-chosen spot that isn't
aimed at the player. This is an exception to `goldenChance` being 0 at the start.

**Rotten and shield:** from dusk, spawn rotten mangoes (about 8%) and the calabash shield (about 1.5%), using
`CONFIG.rottenChance` and `shieldChance`. Scoring already handles both, so check they work end to end, including the
`SHIELD_CHANGE` event and a simple HUD indicator.

## 5. Sounds
Add to `js/audio/audio.js`, all synthesized:
- falling whistles that differ by type: normal mid, slow low and long, fast high and short;
- the late-lock "click" on lock;
- a soft wind swish when a drifter starts sliding.

Respect the sound toggle. They should be distinct enough to play by ear, but never loud.

## 6. Debug tools (`?debug` only)
- Keys **1–5** force a coconut of each type (normal, slow, fast, drifter, late-lock) at a random spot. Use
  `forceDrop`, with no rng, so the Daily Run isn't affected.
- The panel shows the current phase, the wave intensity / breather state and the bag contents.

## Out of scope (step 5b and later)
- The pot, bank spots, Swoop / Chain / Slam bank, juice splats and the golden plank: step 5b.
- Happenings (gust, bat, the Big One): step 7.
- Big effects: step 8.
- Wet edges and night lighting: step 6.

## Done when
- [ ] No console errors, apart from the expected start.ng ones on localhost. Both node tests pass.
- [ ] Rings close in for every item, in step with the real fall.
- [ ] Each coconut type behaves as described, with its tell and whistle. Every landing spot is locked at least 0.35 s
      before impact, and hits use the locked point.
- [ ] At most one late-lock coconut is live at a time. Each type's first appearance falls alone.
- [ ] The shuffle bag deals the phase mixes. Over 200 dealt coconuts there's no run of more than 3 of the same type.
- [ ] The mercy window holds: after a hit, nothing targets that spot for 1.5 s.
- [ ] Perfect dodge fires on a well-timed dash out of a ring: slow motion, the pop-up and +150 × multiplier, and the
      dash refills.
- [ ] Waves and breathers are visible in the debug panel. Breathers from dusk contain a golden mango.
- [ ] Every run has a golden mango between 8 and 14 s.
- [ ] Rotten mangoes and shields appear from dusk and work: the rotten mango drops the combo a step, and the shield
      blocks one hit.
- [ ] **Daily Run:** two runs on the same day give identical first-20 drop logs.
- [ ] **Bot:** 20 seeds at reactions 0.35, 0.5 and 0.7, compared with step 3's numbers. It should be harder than
      step 3 from dusk on, but survivable at 0.5. Report the numbers and anything you tuned in `CONFIG`.
- [ ] **Performance:** ≤ 14 ms and ≤ 110 draw calls in a busy night scene on the UHD 620.
- [ ] The mango shape, deck colour and dash pill fixes are done.
- [ ] Committed on `v1` as `step 05a: coconuts, pacing, items`.

## Report (in chat, at the end)
1. What you built, file by file (one line each).
2. Contract changes and why. Expected: `waveAt`, the coconut types in drops, and the dash start in `getPlayer()`.
3. The bot numbers and the values you tuned.
4. What you couldn't verify. Give the owner a test script: use the debug keys 1–5 to meet each coconut type; try a
   Perfect dodge on a late-lock; play one full run to night.
5. A reminder: `git push origin v1`, `git push beta v1:main`, and publish again if the beta doesn't update.
