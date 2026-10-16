# Step 3: Movement feel

**Goal:** moving and dashing feel **weighty, smooth and alive**, never boxy. The owner's beta feedback was
"dash + move really makes it more fun", and the **left/right carving during a dash** was the best part. Protect that
and build on it.

This step changes how movement *feels*, not the rules. There are no new items, no pot and no skills yet; those
belong to step 5.

Work on branch `v1`. Before you start, read:
- `CLAUDE.md`;
- `docs/GAME_DESIGN.md`, especially "Decisions after the first beta", section 2: dash steering and snap turn;
- the header of `js/core/motion.js`;
- the current `js/play/player.js`, `js/world/character.js` and `js/world/renderer.js`.

**Use `js/core/motion.js` for the maths:**
- `smoothInput`, `accelerateVelocity` and `springStep`.
- Don't edit `motion.js`. If you need something it lacks, write it in the module that needs it and say so in the report.
- `node tests/motion.test.mjs` must still print `42 passed, 0 failed`.

## 0. Tuning values become live
- `CONFIG` is frozen.
- Add a **mutable** `TUNE` object, exported from `js/core/config.js` and filled from defaults, for every number in
  this step: movement, dash, lean, springs, camera look-ahead and footsteps.
- Movement code reads `TUNE`, so the tuning panel (section 8) can change values live.
- Keep the other `CONFIG` sections frozen.

## 1. Direction and speed (`js/play/player.js`)
**Input smoothing**
- **Keyboard:** pass the direction through `smoothInput` at about 14/s, so diagonals blend (a curve, not a 45° snap).
- **Joystick:** analogue, so use lighter smoothing (about 30/s).

**Velocity**
- Replace the exponential blend with `accelerateVelocity`. Start values:
  - `accel` 55
  - `decel` 45
  - `turnAccel` 95
  - top speed 6.4 (unchanged)
- The effect: a quick push-off, a short glide to a stop, and a firm reversal.

**Facing:** turn toward the velocity at a limited rate (about 720°/s), never instantly.

**Skid:** reversing (dot < 0) at more than 60% speed triggers a skid.
- About 0.15 s, feet planted, body leaning back.
- A dust puff at the feet, and `EVENTS.SKID` for the sound.

## 2. The dash
**Keep it steerable.** During the burst, the dash direction follows the input at a high turn rate (start at
900°/s), so the player can carve left and right. **Never lock it to the start direction.**

**No input delay.** The burst starts on the frame of the press. Any wind-up is visual only.

**Dash exit:** after `dashTime`, speed eases from `dashSpeed` back to normal over about 0.12 s, instead of stopping
abruptly.

**Snap turn:** if, within 0.12 s after a dash ends, the input points more than 60° away from the dash direction:
- keep a ×1.25 speed boost for 0.25 s;
- add a dust puff;
- emit `EVENTS.SNAP_TURN`.

**Dash buffer:** a dash pressed up to 0.1 s before the cooldown ends fires the moment it's ready, so presses are
never lost.

**The look:**
- The body stretches along the dash direction (about 1.3) and tips forward.
- A short trail of small dust particles from the feet; use the existing `juice.burst` pool.

## 3. A living body (`js/world/character.js`)
Keep every start.ng style option exactly as it is today, and add joints and motion.

**Knees and elbows**
- Split each leg into thigh + shin, with a knee pivot.
- Split each arm into upper arm + forearm, with an elbow pivot.
- Reuse the existing geometries and materials. Add no new textures.

**Stride**
- The walk/run cycle advances by **distance travelled** (stride length about 1.1 units), not by time, so the feet
  never skate.
- Knees bend on the back swing. Elbows bend more when running.
- Blend smoothly from walk to run with speed.
- Idle: gentle breathing.

**Lean**
- The body tilts toward its acceleration: sideways in turns, forward when speeding up, backward in a skid.
- Up to about 12° when moving and 18° when dashing.
- Drive it with `springStep` (zeta about 0.6, so it settles with a tiny overshoot).

**Things that trail behind**
- Hair locks (dreads, braids, ponytail), the scarf tail and the backpack react to the body's acceleration on springs.
- Use zeta about 0.35–0.5: they lag, swing and settle.
- Afro and bun get a small jiggle. Hats stay put.

**Rules**
- Add `updateCharacterMotion(ch, dt, { vx, vz, ax, az, dashing, skidding })` and keep `animateCharacter` working for
  the menu and game-over poses.
- No allocations per frame.
- Portraits from `makePortrait()` must still look right (neutral pose).

## 4. The camera (`js/world/renderer.js`)
- **Look-ahead:** the follow target moves slightly ahead of the player (velocity × about 0.12 s), still within the
  `followShare` limit and the deck-fit guarantee from step 2.
- **Dash kick:** a dash gives the camera a tiny push in the dash direction (about 0.15 units on a spring), which
  makes speed readable.
- The deck must still never leave the frame.

## 5. Slippery surfaces: the hook only
Steps 5 and 6 add juice splats and wet edges. This step builds the hook they will use.
- Add `surfaceAt(x, z) -> { grip }` to `js/world/barge.js`, with grip between 0 and 1 and 1 meaning normal. It
  returns 1 everywhere for now.
- `player.js` scales `accel`, `decel` and `turnAccel` by grip, so a low grip means sliding.
- A dash on a low-grip surface carries further: the exit easing lasts 1 / grip times longer, up to ×2.5.
- **Debug only:** with `?debug`, the `G` key toggles a test patch (a 3-unit circle at the deck centre, grip 0.35)
  so the slide can be tuned.

## 6. Footsteps and movement sounds (`js/audio/audio.js`)
Synthesize all of these. No audio files.
- **Footstep on wood:** a short low thump plus a soft filtered tick.
  - It plays when each foot plants, from the stride in section 3.
  - The volume rises with speed. Keep it quiet: it must never get annoying.
  - Vary pitch and volume by ±5%.
- **Dash:** a whoosh, starting the moment of the press.
- **Skid:** a short scrape.
- **Snap turn:** a light "fwip".
- All of these respect the sound toggle and the reduced-motion setting where relevant.

## 7. Events
- Add to the catalogue in `js/core/events.js`: `SKID { x, z }`, `SNAP_TURN { x, z, dirX, dirZ }` and
  `FOOTSTEP { x, z, speed }`.
- `DASH` already exists.

## 8. The tuning panel (`js/ui/tune.js`, debug only)
The owner will use this to set the final feel by playing, so make it easy to use.

**Loading**
- Only with `?debug` in the address. `main.js` loads it with a dynamic `import()`, so players never download it.

**Layout**
- A small panel in a corner, collapsible with the `T` key.
- Plain DOM in the game's paper/ink style, readable on a laptop and usable on a phone.

**Sliders, each with a live value**
- **Movement:** speed, accel, decel, turnAccel, keyboard smoothing, turn rate.
- **Dash:** dashSpeed, dashTime, dashCooldown, dash turn rate, dash exit time, snap-turn boost, snap-turn time.
- **Body:** lean max, lean spring frequency, lean damping, hair/scarf spring frequency, hair/scarf damping, stride
  length.
- **Camera and sound:** camera follow frequency, look-ahead, footstep volume.

**Buttons**
- **Copy values:** copies a JSON object of every changed value to the clipboard, ready to paste into a message.
- **Reset:** back to defaults.
- Changed values are remembered in localStorage in debug mode only, wrapped in try/catch.

**Fairness**
- While any value differs from the defaults, runs are **not saved to the start.ng leaderboard**.
- The HUD shows a small "TUNING · NOT RANKED" tag.
- This must hold even on the beta.

## Out of scope
- Swoop, Chain, the pot, bank spots, juice splats, the golden plank and wet edges: step 5 / step 6. Only the
  surface hook is built now.
- Cel shading and outlines: step 4.

## Done when
- [ ] No console errors, apart from the expected start.ng ones on localhost.
- [ ] `node tests/motion.test.mjs` prints `42 passed, 0 failed`.
- [ ] **Keyboard:** diagonals blend smoothly. Starting, stopping and reversing feel weighty, and reversing at speed
      skids with dust.
- [ ] **Dash:**
  - it fires on the press frame;
  - it can be carved left and right during the burst;
  - it eases out instead of stopping dead;
  - a sharp turn right after it gives a visible snap-turn boost;
  - an early press is buffered.
- [ ] **Character:**
  - knees and elbows bend;
  - feet don't skate at any speed;
  - the body leans into turns and dashes;
  - hair, scarf and backpack trail and settle;
  - all start.ng styles still build correctly (test at least dreads, braids, ponytail, afro, bald, scarf, backpack
    and tophat);
  - the portrait is still right.
- [ ] **Camera:** looks slightly ahead and kicks on a dash, and the whole walkable deck stays on screen at 1440×900,
      1280×550 and 390×844.
- [ ] **Slippery surface:** the `G` test patch in `?debug` makes the player slide, and dashes across it go further.
- [ ] **Sound:** footsteps, whoosh, skid and snap turn play quietly and respect the sound toggle.
- [ ] **Tuning panel:** works on laptop and phone, changes apply live, Copy values works, and changed values stop
      leaderboard saves.
- [ ] **Performance:** no allocations in per-frame code, and draw calls stay under about 120.
- [ ] **Bot:** the autoplay bot still runs. Report its numbers next to step 2's, as a sanity check that nothing
      broke difficulty.
- [ ] Committed on `v1` as `step 03: movement feel`.

## Report (in chat, at the end)
1. What you built, file by file (one line each).
2. Contract changes and why. Expected: `TUNE`, `surfaceAt`, `updateCharacterMotion`, the new events and `tune.js`.
3. The default values you chose, and anything you think the owner should try first in the panel.
4. What you couldn't verify. Movement feel needs a human, so give the owner a 5-minute test script, including
   keyboard and phone, a dash carve, a snap turn, a skid, and the `G` patch.
5. A reminder to the owner: `git push origin v1`, then `git push beta v1:main`. If the beta doesn't update within a
   few minutes, publish again with the PowerShell block in `docs/ROADMAP.md`. To test the panel on the beta, open
   `https://mango-rush-beta.start.ng/?debug`.
