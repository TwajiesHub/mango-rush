# Step 4: The look

**Goal:** the 3D world stops looking like default 3D and starts looking like **our print poster**: cartoon (cel)
shading, soft dark outlines, a printed-paper grain, proper item models, dot-ring warnings, and a character wearing
its own print pattern who reacts to what happens.

Match these:
- `docs/mockups/ingame-desktop.png` and `ingame-phone.png`: items, rings, character and deck;
- `start-desktop.png`: the character on the deck;
- `direction.png`: "Your look + print", the dot-ring motif and the palette.

Work on branch `v1`. Before you start, read:
- `CLAUDE.md`;
- `docs/ART_DIRECTION.md` ("The 3D world", "The character", "Motifs and surfaces");
- `docs/GAME_DESIGN.md`, "Game feel" and "Decisions", section 5 for the coconut types;
- the headers of `js/world/materials.js`, `js/world/character.js`, `js/play/drops.js` and `js/world/renderer.js`.

## The performance budget (hard rule)
The owner's laptop has an **Intel UHD 620**, the same GPU as your test browser, so measure on it.
- **Before you start:** record frame time and draw calls in a busy play scene (14+ live drops).
- **After step 4, in that same scene at pixel ratio 1.5:**
  - average frame time **≤ 14 ms**;
  - **draw calls ≤ 110**;
  - no full-screen post-processing passes;
  - no new full-screen transparent overlays.
- Step 3b's quality manager and frame pacing stay as they are.
- If something below can't fit the budget, do the cheaper version and say so in the report.

## 1. Cel (toon) shading (`js/world/materials.js`)
- Implement `toon(color, opts)` as a `MeshToonMaterial` with **one shared 3-step gradient map**: light, mid and a
  warm shadow tone.
- **Shadows lean warm umber**, never grey. Tune the hemisphere and sun lights to match, so that a material's lit
  tone stays close to its palette colour.
- Use `toon` for the character, the items and the deck props.
- The painted backdrop and the deck planks stay `flat()`. They are already the poster.
- Cache materials by colour, so the same colour shares one material.

## 2. Outlines
- Use soft dark outlines (inverted hull) in umber `#2C1A0E`, about 0.03 units thick, drawn with `BackSide` and
  pushed out along the normals. For merged meshes, put the outline in the same merge.
- **Outline these:**
  - the character (head, body, limbs; the hair as one group if you can);
  - every falling item;
  - the crates, lanterns and rope coil;
  - the deck rim edge.
- **Don't outline:** the backdrop, the water, the blob shadows or the warning rings.
- **Keep draw calls in budget:**
  - Merge outline geometry wherever the parts don't move separately.
  - The character's moving parts may need their own outline meshes. Count them, and if you're over budget, drop
    outlines on the smallest parts (hands, feet) first.
- Implement `outline(mesh, thickness)` as the shared helper.
- The outline must not flicker or "swim" as the camera moves.

## 3. Printed-paper grain
- A subtle, **static, screen-space** paper grain, multiplied into the `toon` and `flat` materials **inside their
  shaders** (a shared `onBeforeCompile` chunk using a small tiling noise texture, or a cheap hash on
  `gl_FragCoord`). Strength about 10–16%.
- Static and fixed to the screen like ink on paper. It must not animate or shimmer.
- **No separate full-screen overlay pass.**
- Implement `paperGrainTexture()` if you use a texture: about 128×128, generated once on a canvas.
- Reduced motion has nothing to change here, because the grain is static.

## 4. Item models (`js/play/drops.js`)
Rebuild each item as one merged toon mesh plus its outline, pooled as today.
- **Mango:** a saffron `#F2A93B` ellipsoid with a vermilion blush patch and a green `#0F3D2E` leaf with a short stem.
- **Golden mango:** brighter gold `#FFD84D`, a small sparkle (two crossed cream quads that twinkle) and a slightly
  larger size.
- **Coconut:** a dark brown faceted sphere (low-poly, flat-shaded) with three dark "eyes" on top.
- Build these now, unused until step 5:
  - **rotten mango:** brown, with tiny dark fly dots orbiting slowly;
  - **calabash shield:** a woven calabash with a cross-hatch pattern in the texture.
- Falling items slowly spin and wobble, as today.
- Blob shadows under each item shrink and darken as the item gets closer to the ground. That makes the landing spot
  readable.

## 5. Dot-ring warnings
- The warning rings become **the dot-ring motif**: concentric rings of round dots. Draw them as a texture on a flat
  plane: one shared canvas texture per ring type, tinted by colour.
- **Mango:** gold dots with a cream inner ring.
- **Golden:** a larger, glowing gold ring.
- **Coconut:** vermilion `#C8432E` dots with a dark dotted **cross** in the centre. The shape must say "danger"
  without relying on colour.
- Leave hooks for step 5's tells: the ring's dot spacing, size and pulse should be settable per drop, with no
  rebuild. Step 5 adds the closing-in animation, the slow/fast pulses, sliding (drifter) and the late-lock dot.
- Rings are flat and unlit, drawn just above the deck, never z-fighting with the planks.

## 6. The character (`js/world/character.js`)
**Toon materials and outlines** as above, with exact start.ng colours: top = `primaryColor`,
bottoms = `secondaryColor`, plus skin and hair.

**The print pattern**
- Stripes and a row of dots in a tone **30% darker** than the player's own top and bottoms colours, as in
  `direction.png` ("+ PRINT").
- Make it one small canvas texture per colour pair, cached, on the torso and on the bottoms (skirt or trousers).
- It must read clearly at play distance without looking noisy.

**Name tag**
- An umber pill with cream **Archivo 800** text. It is still "Bricolage Grotesque", so fix the font.
- Wait for the font to load before drawing the tag.

**Reactions**
Short, readable and layered on top of `updateCharacterMotion`; they never block movement.
- **Catch:** a small hop with arms up (about 0.25 s), on `EVENTS.CATCH`.
- **Hit:** a stumble backwards with a wobble (about 0.4 s), on `EVENTS.HIT`.
- **New best:** a cheer, both arms up with a little jump, on `EVENTS.BEST_PASSED`.
- **Game over:** a slump, head down and arms loose, held on the game-over screen. On a new best, the game-over pose
  is the cheer instead.
- **Start screen:** the idle pose with a small wave every few seconds.

**Portraits:** `makePortrait()` uses the new look, including outlines and the print, and still has a transparent
background.

Every start.ng style option must still build.

## 7. Deck and props
- The props (crates, lanterns, rope coil, sacks) use toon materials and outlines, merged as in step 3b.
- The deck planks stay `flat()` with the grain. Add a subtle darker shade along the plank seams if it's cheap.

## Out of scope
- How the rings and coconut types *behave* (closing in, tells, drifter, late-lock), the pot and the skills:
  step 5.
- Night lighting, lantern glow, wet edges and the scenery journey: step 6.
- Living planks (plank bounce, dust, beat glow) and big effects: step 8.

## Done when
- [ ] No console errors, apart from the expected start.ng ones on localhost.
- [ ] `node tests/motion.test.mjs` and `node tests/frameclock.test.mjs` both pass.
- [ ] **Budget:** a busy scene on the UHD 620 at pixel ratio 1.5 averages ≤ 14 ms, with ≤ 110 draw calls. Report
      the before and after numbers.
- [ ] Cel shading with warm shadows on the character, items and props. Outlines are soft and stable, with no
      flicker while the camera moves.
- [ ] The paper grain is visible but subtle, static and costs no extra pass.
- [ ] The mango, golden mango and coconut match the art direction. The rotten mango and shield models exist.
      Item shadows tighten as items fall.
- [ ] The rings are dot rings. The coconut ring has the dotted cross and reads as danger in greyscale.
- [ ] The character wears its print pattern in darker tones of its own colours. The name tag is Archivo.
- [ ] Reactions play: catch hop, hit stumble, new-best cheer, game-over slump (or cheer), and the start-screen wave.
- [ ] All start.ng styles still build: test dreads, braids, ponytail, afro, bun, bald, cap, beanie, tophat, crown,
      glasses, earrings, beard, scarf, backpack, and the female body.
- [ ] Portraits still work, now with the new look.
- [ ] Screenshots placed side by side with `ingame-desktop.png` and `ingame-phone.png`, plus play at 1280×550 and
      the start screen at 1440×900, saved to `screenshots/step-04/`.
- [ ] Committed on `v1` as `step 04: the look`.

## Report (in chat, at the end)
1. What you built, file by file (one line each).
2. Contract changes and why.
3. The performance numbers before and after (frame time and draw calls), and anything you simplified to fit the
   budget.
4. How close it looks to the mockups, honestly, and what step 9 will still need to match.
5. What you couldn't verify, and exact steps for the owner to test: laptop and phone, 2–3 different start.ng looks,
   and watching the reactions.
6. A reminder to the owner: `git push origin v1`, then `git push beta v1:main`, and publish again if the beta doesn't
   update.
