# Step 5b: The rules, part 2 (the pot, bank spots, skills, planks)

**Goal:** the run gets its **decisions**:
- cash in the pot safely, or push for ×5;
- dash for skill bonuses;
- use the deck itself (the golden plank, slippery juice).

Read `docs/GAME_DESIGN.md`, "Decisions after the first beta", sections 1 (the pot), 2 (skills), 3 (planks) and 4
(honest hooks), before you start. Also read `CLAUDE.md` and the headers of `js/play/scoring.js`, `js/play/drops.js`,
`js/play/player.js`, `js/world/barge.js` and `js/ui/hud.js`.

**Don't change:** the camera, the coconut types or the difficulty table from 5a, unless the owner's difficulty
feedback (added at the bottom of this file, if any) says so.

## 1. The pot (`js/play/scoring.js`, pure logic)
**Where points go**
- Every point earned goes into **`state.pot`**, not straight into `state.score`. That means catches, near misses,
  Perfect dodges and skill bonuses.
- `state.score` is the **banked** score. It never goes down.

**Banking:** `bankPot({ slam })` adds the pot to the score and empties it.
- A Slam bank adds +10% first, rounded.
- It sets the multiplier to ×1, `comboStep` to 0 and the combo timer to 0. Banking costs your momentum; that's the
  decision.
- It emits `POT_BANKED { amount, slam, x, z }`.
- Count `stats.banks`, `stats.slams` and `stats.bestBank`.

**Auto-bank:** when the combo **ends naturally** (the multiplier has drained to ×1 and the window plus grace run out
with no catch), the pot banks by itself, with no Slam bonus. Emit `POT_BANKED { auto: true }`.

**Losing the pot:** a coconut **hit** loses the **whole pot**. Emit `POT_LOST { amount, x, z }` and add the amount to
`stats.potLost`.
- The **shield** blocks the hit, so the pot is safe.
- A rotten mango only drops the combo a step. It doesn't touch the pot.

**Run end:** an unbanked pot is lost. Put it in `RunSummary.potLost`. The leaderboard score is the banked score only.

**Best chase:** `aheadOfBest`, `BEST_PASSED` and the medals use the **banked** score.

**Event:** emit `POT_CHANGE { pot }` whenever the pot changes.

Update the contract header and `scoringSelfTest()`. Add tests for:
- bank;
- slam;
- auto-bank;
- loss on hit;
- shield protecting the pot;
- loss at run end.

Add `tests/pot.test.mjs` in node, testing the pure rules without the DOM.

## 2. Bank spots (`js/play/bank.js`, new, plus visuals in `barge.js`)
**Placement**
- Two spots, one in front of each mango crate at the far corners.
- Each centre sits on the line from the deck centre to the crate, as far toward the crate as it can while a
  1.1-unit-radius circle stays **fully inside the walkable ellipse**.
- This works in both orientations; the portrait deck is rebuilt as in step 2.

**Look:** a glowing saffron **dot ring** (reuse the ring shader in a "bank" style) with a soft breathing pulse.
- It brightens when the pot is above 0, and is dim when the pot is empty.
- Its pulse quickens as the pot grows.

**Banking:** the player banks by **walking or dashing into** a spot (the player's centre within 1.1) while the pot is
above 0.
- Dashing in counts as a **Slam bank** (+10%).
- After a bank, the spot is "used" until the player steps out of it, so standing still can't bank twice.

**Drops still land here.** Banking is a risky trip, which is the point.

Contract: `initBank(parent)`, `resetBank()`, `updateBank(dt)` and `bankSpots()` (read only: positions and radius,
for the HUD and the bot).

## 3. Skills (lite set)
**Swoop**
- Catching a mango or golden mango **while dashing** pays +50% for that catch, into the pot.
- Pop-up "SWOOP!"; count `stats.swoops`.

**Chain**
- A Swoop **instantly refills the dash**.
- Consecutive Swoops, with each new dash starting before the next catch, count up a chain: pop-up "CHAIN ×2",
  "×3"…
- The chain resets when a dash ends without a Swoop.
- Track `stats.bestChain`.

**Perfect dodge:** already live from 5a. It now pays into the pot.

**Slam bank:** as in section 2. Pop-up "SLAM BANK +10%".

Add the events `SWOOP { x, z, points, chain }` and `SLAM_BANK { x, z, amount }`, so step 8 can hang effects on them.
Small pop-ups are enough here.

## 4. Juice splats (`drops.js` and `barge.js`)
**When:** a missed mango that **rots** leaves a **juice patch** on its spot.
- About 0.9-unit radius, lasting 10 s.
- It fades over the last 2 s.

**Look:** a flat amber splat decal with an irregular edge, unlit and just above the deck.
- Pool at most 6 patches; the oldest is recycled.
- Keep it within the draw-call budget.

**Grip:** `surfaceAt(x, z)` returns grip **0.35** inside a patch, easing back to 1 as the patch fades. The slide
behaviour from step 3 does the rest. Remove step 3's debug `G` test patch, or keep it under `?debug` only.

## 5. The golden plank
**Look**
- One plank segment (about 1.5 wide and 3 long, aligned with the painted planks) glows gold.
- Use a flat overlay with a gentle shimmer, as one extra draw call.

**Reward:** catches made while the player stands on it pay **×2** before the multiplier, into the pot.
- Pop-up "GOLDEN PLANK ×2".

**Timing**
- It first appears at **20 s**, then moves every **15 s** to a new segment.
- The move is announced by a 1-second shimmer at the new spot before the old one fades.

**Placement**
- Segment choices come from the run's rng, but **pre-draw them all at `resetDrops`** (for example 40 choices), so
  the Daily Run draw order never depends on time or the player.
- Choose only segments fully inside the walkable ellipse, and never one that overlaps a bank spot.

## 6. HUD and game over (simple here; the final styling is step 9)
**HUD**
- The score shows the **banked** score.
- Under it, a saffron chip reads "+3,200 IN THE POT", visible only while the pot is above 0. It grows slightly as
  the pot grows.
- On a bank, the chip flies into the score and the score counts up over about 400 ms.
- On a loss, the chip shatters ("−3,200" in vermilion) and disappears.

**Game over**
- "Lost in the pot: 2,400", only if it's above 0, in neutral words: no guilt, no "win it back".
- A skills line: "6 swoops · best chain ×4 · 2 perfect dodges · 3 slam banks". Leave out items that are 0.

**Words:** put every new word in `js/content/text.js`.

## 7. Teaching it (light; the full warm-up is step 11)
- The first time on this device that the pot passes 500, show one hint for 3 s: "Dash into a crate to bank your
  pot".
- After the player's first ever bank, never show it again. Store the flag in `store.js`.

## 8. The bot and debug
**The bot** should bank with a simple policy, so its numbers stay meaningful:
- bank when the pot is at least 1,500, or when the multiplier is ×4 or more and a coconut is within 1.5 s;
- swoop mangoes in its path when its dash is ready.

**Report** 20 seeds at reactions 0.35, 0.5 and 0.7: survival time, banks per run, average pot lost, swoops and best
chains.

**The `?debug` panel** shows the pot, banks, golden plank position and timer, and the live juice patches.

## Out of scope
- The big bank and skill effects (count-up bursts, sounds, freeze frames): step 8.
- Wet edges: step 6.
- Final HUD and game-over design: step 9.

## Done when
- [ ] No console errors, apart from the expected start.ng ones. All node tests pass, including the new
      `pot.test.mjs`.
- [ ] Points go to the pot. Banking at a spot adds them to the score and resets the multiplier to ×1. A Slam bank
      adds 10%.
- [ ] A natural combo end auto-banks. A hit loses the whole pot. The shield protects it. An unbanked pot at game
      over shows as "Lost in the pot".
- [ ] The bank spots sit inside the walkable area in both orientations, glow when the pot is above 0, and can't
      double-bank.
- [ ] Swoop, Chain, Perfect dodge and Slam bank all fire with their pop-ups, and their stats show on game over.
- [ ] Juice splats appear where rotten mangoes were and make the player slide. At most 6 at once.
- [ ] The golden plank appears at 20 s, moves every 15 s with a warning shimmer, and doubles catches made on it.
- [ ] The leaderboard and the best score use the banked score. Daily Run logs are still identical across two runs,
      including golden plank positions.
- [ ] The one-time bank hint shows once and never again after a first bank.
- [ ] **Performance:** ≤ 14 ms and ≤ 110 draw calls in a busy night scene on the UHD 620.
- [ ] **Bot numbers** reported, as described in section 8.
- [ ] Committed on `v1` as `step 05b: pot, skills, planks`.

## Report (in chat, at the end)
1. What you built, file by file.
2. Contract changes, including the new `bank.js` and the scoring contract.
3. The bot numbers.
4. What you couldn't verify, and a 5-minute test script for the owner. It should cover:
   - building a pot and banking it, both walking and with a Slam;
   - losing a pot to a coconut;
   - a Swoop chain across a line of mangoes;
   - the golden plank;
   - sliding on juice.
5. A reminder to the owner: push and publish.

## Owner's difficulty feedback from 5a
The owner played 5a and says the **difficulty is okay**. Keep the 5a difficulty table, coconut mix and ring sizes exactly
as they are. 5b adds the pot and skills on top; don't retune difficulty to compensate.
