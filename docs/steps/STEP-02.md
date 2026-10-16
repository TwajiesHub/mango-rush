# Step 2: The barge and the camera

**Goal:** the island becomes the **mango barge on the lagoon at golden hour**, seen through a **tilted camera** with
the horizon in the top quarter of the screen. Match the layout and colours of `docs/mockups/ingame-desktop.png` and
`docs/mockups/ingame-phone.png`. The cartoon (cel) shading comes later, in step 4.
This step also does three **carry-over fixes** from the step 1 beta.

Work on branch `v1`. Before you start, read:
- `CLAUDE.md`;
- `docs/ART_DIRECTION.md` ("The 3D world", "Screens");
- the mockups `start-desktop.png`, `ingame-desktop.png`, `ingame-phone.png`, `gameover-desktop.png` and
  `gameover-phone.png`;
- the header comments of `js/world/barge.js`, `js/world/renderer.js`, `js/world/journey.js`, `js/play/player.js`,
  `js/play/drops.js` and `js/core/motion.js`.

**New since step 1:**
- **`js/core/motion.js`** was added by the planner. It holds tested maths helpers (a spring, acceleration,
  collision and a fixed-step clock). Don't edit it. `node tests/motion.test.mjs` runs its 42 checks.
- This step uses `springStep` for the camera. Step 3 uses the rest.

## 0. Carry-over fixes (do these first)
These come from the owner's beta test on a laptop whose browser shows about **1280 × 550** of page.

**A. Every screen fits without scrolling.**
- Applies to start, pause, game over and leaderboard, at **1280×550, 1440×900, 390×844 and 360×640**.
- Today `css/ui.css` only adapts to width. Add height rules too (for example `@media (max-height: 700px)` and
  `(max-height: 600px)`) with tighter spacing and a smaller wordmark, score and buttons.
- On wide, short screens the game over card becomes **two columns**:
  - **left:** kicker, headline, score, stamp and rank line;
  - **right:** stats, next-medal bar and buttons.
- Inner scrolling is only a last-resort safety for screens smaller than 360×560.

**B. Game over stats: a 2×2 grid.**
- The four tiles are Mangoes, Best combo, Near misses and Survived.
- "Best" is no longer a fifth tile. Show it as a line under the score ("Best 1,240"), or as the NEW BEST stamp when
  the run is a new best.

**C. Never a black page behind a card.**
- Game over and pause show the 3D scene behind the card, dimmed with a translucent overlay (ink or night colour at
  roughly 45–60%).
- The game over camera keeps rendering.

## 1. The barge (`js/world/barge.js`)
Remove version 0's island, palms, trees and clouds completely.

**Deck**
- A flat rectangle, `CONFIG.deck.width × CONFIG.deck.depth` (start at **18 × 12**), in warm wood `#B9824A`.
- Plank seams `#8A5A2E` about every 1.5 units, running across the deck.
- A darker raised rim `#6B4224` (about 0.35 wide and 0.15 high) all round.
- Hull sides `#4A2C14` going down into the water; you can see them along the near edge.
- Slightly chamfered corners.

**Props:** fill the corners so the edge of the walkable area reads naturally. Keep every prop **outside** the
walkable area so it never blocks the player.
- Mango crates in the two far corners, one piled with mangoes.
- Lantern posts at the four corners. They stay unlit; they light up at dusk in step 6.
- A rope coil near one front corner.
- Optionally a couple of sacks.

**Walkable area:** keep the `deckBounds()` contract, an ellipse.
- `halfWidth = width/2 − CONFIG.deck.walkMargin` and `halfDepth = depth/2 − walkMargin` (margin about 0.6).
- At the rim, the player slows into it. No hard snap or jitter: remove only the outward part of the velocity.

**Gentle life**
- The barge bobs slowly: y ±0.03, roll ±0.6°, pitch ±0.4°, as slow sines, with numbers in `CONFIG.deck.bob`.
- The player and the items must move **with** the deck, so feet never float.
- How:
  - Add `deckRoot()` to the barge contract. It returns the Object3D everything on the deck lives in.
  - `main.js` passes `deckRoot()` instead of `scene` to `initPlayer` and `initDrops`.
  - Gameplay coordinates stay deck-local.
  - The camera does **not** bob.

**Travel**
- The barge drifts down the lagoon toward screen-left, so the water flows past to the right.
- Show it with water streaks moving past and a soft wake along the hull, at `CONFIG.world.flowSpeed` (about 1.2
  units/s).
- Step 6 adds the scenery that passes by.

## 2. The lagoon backdrop (`js/world/journey.js`, static for now)
`journey.js` owns scenery and lighting, so the backdrop goes there. It stays static in this step, and step 6 turns
it into the moving journey.
- **Sky:** painted horizontal **bands** with hard edges, not a smooth gradient. Use vermilion `#E4573D`, `#D9472F`,
  `#EB6A47` and `#F07F55`, plus a few soft flat cloud shapes, as in the mockups. A canvas texture on a large backdrop
  is fine.
- **Sun:**
  - a huge saffron disc `#F2A93B` with a lighter inner disc;
  - two concentric **dot rings** around it, made of dots (see the dot-ring motif in ART_DIRECTION);
  - it sits low, partly behind the far bank, and holds a fixed place in the view.
- **Water:**
  - flat teal `#1FA39A` out to the horizon, with no shine (Basic or Lambert material, no PBR);
  - saffron **reflection streaks** (short horizontal dashes) under the sun that shimmer slowly.
- **Far bank (placeholder):**
  - a deep green `#0F3D2E` strip on the horizon;
  - flat silhouettes of a few palms and 3–5 Makoko stilt houses;
  - one small canoe silhouette on the water.
- **Light:**
  - a warm hemisphere light plus a low directional "sun" light from behind-left;
  - no shadow maps;
  - blob shadows under the player, items and props;
  - no fog, or only a light fog in the horizon colour.

## 3. The camera (`js/world/renderer.js`)
**Play camera**
- A fixed tilt, so the **horizon sits about 25% from the top** and the deck fills the lower three quarters.
- On every resize, compute the camera distance from the deck size, the screen aspect and the fov, so the **whole
  walkable area plus `CONFIG.camera.fitMargin` is always on screen**. Warning rings at the edge must be fully
  visible.
- **Follow:** small. The camera shifts by at most `CONFIG.camera.followShare` (about 0.15) of the player's offset
  from the centre.
  - Smooth it with `springStep` from `js/core/motion.js` (start at freq 1.6, zeta 1), one spring per axis.
  - The deck must never leave the frame.

**Phone portrait**
- When the screen is taller than it is wide, **turn the deck 90°**, so its long side runs into the screen. This
  matches `ingame-phone.png`.
- `deckBounds()` then swaps `halfWidth` and `halfDepth`, and the meshes rotate to match.
- Choose the orientation **when a run starts** and keep it until the run ends. Rotating the phone mid-run must not
  break anything; the change applies from the next run.
- Drops already place themselves relative to `deckBounds()`, and the Daily Run draws stay identical.

**Menu camera**
- Desktop: the character stands on the deck in front of the sun, to the right of the start panel (see
  `start-desktop.png`).
- Phone: the character stands above the bottom sheet.

**Over camera:** slightly higher and further back than in play, with a slow drift. The scene stays visible behind
the card (fix C).

Camera shake from `juice.cameraShake()` still applies in every mode.

## 4. Config and difficulty
- Add to `CONFIG`:
  - `deck: { width, depth, walkMargin, bob: { y, roll, pitch, speed } }`
  - `camera: { fov, horizonFrac, fitMargin, followShare, followFreq, followZeta }`
  - `world: { flowSpeed }`
- The walkable area is now about 40% of the island's, so the same drop rate is more crowded.
  - Play at least three full runs.
  - If it's clearly harder than step 1, scale `CONFIG.drops` (aim radius, separation) to the deck, **not** the
    difficulty table.
  - Report what you changed.

## Out of scope (later steps)
- Movement feel: step 3.
- Cel shading, outlines and paper grain: step 4.
- Scenery layers, places, dusk and night, lantern light and water over the deck: step 6.
- The full screen redesign: step 9. Only the fixes above happen now.

## Done when
- [ ] No console errors, apart from the expected start.ng ones on localhost.
- [ ] The island is gone. The barge sits on the lagoon with sky bands, the sun with dot rings, water with
      reflection streaks, the far bank, props in the corners, and blob shadows.
- [ ] In play, the whole walkable deck is visible at 1440×900, 1280×550 and 390×844, with the horizon in about the
      top quarter.
- [ ] On phone portrait the deck's long side runs into the screen. Rotating mid-run doesn't break the run.
- [ ] The player can't leave the deck, slows smoothly at the rim, and is never blocked by props.
- [ ] Drops land only on the walkable deck, and their warning rings are fully visible.
- [ ] The barge bobs gently. The player and the items move with it, with no floating feet.
- [ ] The water flows past, so the barge feels like it's moving.
- [ ] Carry-over fixes A, B and C are done, with no scrollbars on any screen at the four sizes.
- [ ] `node tests/motion.test.mjs` prints `42 passed, 0 failed`.
- [ ] Desktop runs smoothly at 60 fps. Report `renderer.info.render.calls` during play and keep it under about 120.
- [ ] Committed on `v1` as `step 02: barge and camera`.

## Report (in chat, at the end)
1. What you built, file by file (one line each).
2. Any contract you changed, and why. Expected: `deckRoot()`, orientation handling and `deckBounds()` swapping.
3. Difficulty: what you changed in `CONFIG.drops`, if anything, and how the three runs felt.
4. Screenshots, saved to a `screenshots/step-02/` folder that is **not committed**, and listed in the report:
   - play at 1440×900, 1280×550 and 390×844;
   - game over at 1280×550 and 390×844;
   - the start screen at 1440×900.
5. What you couldn't verify, and exact test steps for the owner.
6. A reminder to the owner: `git push origin v1`, then `git push beta v1:main`.
