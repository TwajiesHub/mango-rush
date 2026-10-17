# Step 6: The journey

**Goal:** the run becomes a **trip down the Lagos lagoon**. The world around the barge moves:
- past Makoko and the fishing village at golden hour;
- under the cable bridge as dusk falls and the lights come on;
- out to the open lagoon facing the lit city skyline at night;
- fireworks at midnight.

The light changes with it, and the lanterns on the deck glow from dusk.

Read before you start:
- `docs/GAME_DESIGN.md`: "The world and the journey" (the phase table and the six depth layers), and "Decisions",
  section 3 (wet edges);
- `docs/ART_DIRECTION.md`: "The 3D world" (dusk and night palettes);
- the mockup `docs/mockups/gameover-desktop.png` (the night scene);
- the headers of `js/world/journey.js`, `js/world/renderer.js`, `js/world/barge.js` and `js/core/config.js`.

Don't change the gameplay, difficulty, camera framing or HUD layout (the HUD design is step 9).

## The performance budget (stricter now)
The owner's UHD 620 laptop now runs a busy night scene at a steady 60 fps, with no spare headroom. This step adds
scenery, so:
- **at most +12 draw calls** in play in total;
- **no new full-screen passes or full-screen transparent overlays;**
- **no textures or canvases generated during a run.** Paint every layer texture once at load or at `resetJourney`,
  never per frame.

Measure a busy night scene before and after on the UHD 620 with `?debug` and report both. If you're over budget, cut
detail from the far layers first. The quality manager may also drop layer detail at its lower levels.

## 1. The journey timeline (`js/world/journey.js`)
**Places**
- The barge drifts toward screen-left, so scenery moves left to right, past a fixed sequence of places tied to run
  time. Put the timings in `CONFIG.journey`.

| Run time | Place (`PLACE_ENTER`) | Banner text | What passes |
| --- | --- | --- | --- |
| 0 s | `makoko` | PASSING MAKOKO | stilt houses on poles, canoes, a fisherman casting a net who waves once, birds crossing the sun |
| ~35 s | `mangroves` | THE MANGROVES | dense dark-green mangrove clumps, roots in the water |
| ~70 s | `bridge` | UNDER THE BRIDGE | the cable bridge: its deck and cables cross the top of the view, pillars slide past at the screen edges |
| ~110 s | `waterfront` | THE WATERFRONT | a market bank with stalls and strings of lanterns |
| ~150 s | `city` | THE CITY LIGHTS | the Lagos skyline across the water, with lit windows reflected below |
| ~210 s | `open` | OPEN WATER | open lagoon, fireworks over the city behind |

- Emit `EVENTS.PLACE_ENTER { place }` once per place per run. Add the banner words to `text.js`.
- Show a simple banner: an umber strip with Cormorant spaced capitals, slide down, hold for 2.2 s, then fade. The
  final styling is step 9.

**Six depth layers**, as flat painted cut-outs (cheap, no detailed 3D):
1. **Sky:** painted bands plus the sun or moon. It doesn't scroll; it changes colour by phase.
2. **Far skyline and hills:** very slow parallax, hazy.
3. **Banks:** trees, stilt houses, canoes, people, the market, the skyline. Medium speed.
4. **Water:** the shimmer streaks and reflections, which already exist. They react to the phase (saffron sun streaks
   by day, lit-window reflections at night).
5. **The deck:** lanterns light from dusk (section 3).
6. **Occasional foreground pieces** at the screen edges: bridge pillars, an overhanging branch. They **never cover
   the walkable area or the rings.**

**Building the layers**
- Build each layer as a few **long strips** (one merged mesh per strip, a texture painted once). Recycle strips: when
  one scrolls off one side, move it to the other side with the next place's content.
- Everything stays aligned to the horizon line logic from step 2 (`syncBackdrop`). Layers 1–3 hang on that line in
  every camera mode.

**The menu and game-over screens**
- **Menu:** the start screen shows the golden hour scene, still or very slowly drifting.
- **Game over:** the scene freezes at the place and phase where the run ended. In a later step, the game-over screen
  will show the night scene when the run reached night.

## 2. Light and colour by phase
Blend smoothly between phases over about 4 s, using `phaseAt(t)` and a blend factor. Put all colours in config.

| Phase | Sky bands | Sun / moon | Water | Light on deck and character |
| --- | --- | --- | --- | --- |
| Golden (0–60 s) | vermilion bands, as now | large saffron sun with dot rings, low | teal with saffron streaks | warm, as now |
| Dusk (60–150 s) | plum `#5A2140` to vermilion | sun sinking below the bank, rings fading | deeper teal, fewer streaks | warmer, a little dimmer; lanterns on |
| Night (150–210 s) | night `#0B0B0C` to deep blue | a cream **dot-art moon** with a dot ring; **dot-ring stars** | dark `#123A4A`, lit-window reflections | cool, low key light plus lantern warmth; the character keeps a soft rim so it reads |
| Midnight (210 s+) | as night | moon higher | as night | as night, plus firework flashes tinting the deck briefly |

**Readability at night is a hard rule:**
- The character, items and **all warning rings** must stay clearly readable. Rings at night glow saffron or cream,
  and the coconut ring keeps its dotted cross.
- The bank-spot rings stay bright.
- Check this with screenshots, not by assumption.

## 3. Deck lanterns and wet edges
**Lanterns**
- From dusk, the four lantern posts **light up**: a warm glow sprite on each, plus a soft warm pool on the deck
  under it (an unlit additive decal, not real lights).
- Fade them in over 3 s, with a slight flicker.

**Wet edges** (`barge.js`, via `surfaceAt`)
- From dusk, water washes over the **outer planks**: a wet band along the deck edge, inside the rim, on the
  walkable side.
- The band is darker, glossy-looking and lightly animated (shimmer only, no extra pass).
- **Grip** in the band is about 0.55: slippery, never forbidden. The juice patch grip (0.35) still wins where they
  overlap.
- **Width** grows from 0 at 60 s to about 18% of the walkable radius by midnight. Put the numbers in config.
- The bank spots stay reachable. Slipping near a bank spot is part of the drama.

## 4. Ambient life (cheap, a few sprites)
- **Golden hour:** a small flock of birds crossing the sun every 15–20 s.
- **Dusk:** a few bats flitting across the sky.
- **Night:** fireflies near the banks (a handful of points).
- **Midnight:** fireworks over the city every few seconds, made of dot-ring bursts in saffron, cream and vermilion.
  Their light briefly tints the scene.

All of it stays in layers 1–3. Pool everything and allocate nothing per frame.

## 5. Small fix: reset bests when the scoring rules change
The pot (step 5b) changed what a score means, but the owner's saved local best (64,525) is from before the pot and
is now nearly unreachable.
- Add `SCORE_VERSION` to `store.js`, starting at 2.
- When the saved data has an older version, reset `best` and `dailyBest` to 0, once, and save the new version.
- The start.ng leaderboard is server-side and isn't touched.
- Document this in the store header.

## 6. Debug (`?debug` only)
- The **N** key jumps the run clock to the start of the next phase, so the owner can see dusk, night and midnight
  without surviving that long.
- The run is marked "TUNING · NOT RANKED", exactly like the tuning panel.
- The panel shows the current place, phase, blend factor and wet-band width.

## Out of scope
- Happenings (showers, the bridge happening, gust, bat, The Big One): step 7. The bridge here is scenery only.
- Big effects and adrenaline systems: step 8.
- The final HUD, banner and game-over design: step 9.
- Music: step 10.

## Done when
- [ ] No console errors, apart from the expected start.ng ones. All node tests pass.
- [ ] Scenery scrolls past in parallax layers, through all six places in order, with a banner for each.
- [ ] The light blends smoothly from golden hour to dusk, night and midnight: sun sinking, moon and dot-ring stars at
      night, and lit-window reflections.
- [ ] The lanterns light from dusk. Wet edges appear from dusk, widen toward midnight and make the player slide.
- [ ] At night the character, every ring type and the bank spots are clearly readable. Show screenshots of each
      phase at 1440×900 and 390×844.
- [ ] Birds, bats, fireflies and fireworks appear in their phases.
- [ ] Old local bests reset once with `SCORE_VERSION`.
- [ ] The N debug key jumps phases and marks the run unranked.
- [ ] **Budget:** at most +12 draw calls and no new passes. Report a busy night scene on the UHD 620 before and
      after.
- [ ] The Daily Run is unaffected: the journey is tied to time, not rng.
- [ ] Committed on `v1` as `step 06: the journey`.

## Report (in chat, at the end)
1. What you built, file by file.
2. Contract changes.
3. Performance before and after, and anything you simplified.
4. Screenshots of each phase, desktop and phone, saved to `screenshots/step-06/` (not committed).
5. A test script for the owner: use N to see each phase; check ring readability at night; slide on the wet edges.
6. A reminder: push and publish.
