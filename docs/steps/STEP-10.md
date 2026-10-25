# Step 10: The screens

Owner feedback on step 9: the feel is right. This step turns the plain step-1 screens into the **approved poster
design**. Match the mockups in `docs/mockups/` (start, in-game and game over, desktop and phone, plus
`direction.png`) and the words in `docs/ART_DIRECTION.md` → "Screens". Where a mockup shows something, **match it**;
where it is silent (things added after the mockups: the pot, skills, Madness, happenings), follow this brief.

The look in one line: **the world is the painting; the interface is the poster.** Strict grid, big confident type,
ochre paper cards with umber borders and hard offset shadows, Cormorant spaced capitals for kickers, Archivo for
numbers. Bold and crafted, never generic.

## 0. Ground rules
- **DOM + CSS only** for all UI (no canvas UI, no frameworks). Tokens in `css/tokens.css`, styles in `css/ui.css`,
  words in `js/content/text.js`, numbers in `CONFIG`. Fonts from Google Fonts only (already loaded).
- **Accessibility:** real `<button>`s, visible focus rings, contrast ≥ 4.5:1, touch targets ≥ 44 px, logical tab order,
  `aria-live="polite"` for the score on game over, reduced motion removes count-ups' bounce, stamp slam and blur
  transitions (instant or simple fades instead).
- **Keyboard:** Space = Play / Play again, Esc / P = pause, Enter on focused buttons. Show the key chips as in the mockups.
- **Never cover the deck during play** beyond the HUD areas in the mockups. Banners sit above the deck, never on it.
- **Sizes to check:** 1440×900, 1280×720, 1024×768, 390×844, 360×740 and a landscape phone (844×390).
- **Performance:** the HUD must not trigger layout every frame. Update text only when a value changes (hud.js already
  caches `last`); animate with transform/opacity only. No new draw calls in the 3D scene.
- Keep every existing event contract; extend `hud.js` / `screens.js` / `sharecard.js` contracts in their headers.

## 1. Start screen
- **Desktop:** exactly the `start-desktop` mockup: the 600 px ochre panel with the woven strip on its right edge, the
  kicker, the overhanging wordmark, tagline, rule, PLAYER / LOOK columns with "Synced from start.ng", the wearing chips
  (from the real start.ng style), **PLAY** (umber, saffron text, 64 px) and **DAILY RUN** (outlined, with the date and
  "same drops for everyone"), then BEST / DAILY BEST, music + sound toggles, the controls hint. The 3D scene on the right
  with "GOLDEN HOUR · LAGOS LAGOON" top-right.
- **Phone:** the `start-phone` mockup: scene on top with the wordmark over the sky, ochre bottom sheet with the woven
  strip on its top edge, "Hi, <name>", chips, full-width Play and Daily Run, best + toggles.
- **Add (not in the mockup):** a small **LEADERBOARD** text button next to the toggles.
- **Guests:** PLAYER reads "Guest"; LOOK reads "Playing as guest"; a **"Sign in to save your scores"** button (the
  start.ng sign-in URL with `return_to`, as `startng.js` already supports). Never nag with `?guest` in the URL.

## 2. In-game HUD
Match `ingame-desktop` and `ingame-phone`:
- **Top-left player card:** portrait circle, NAME in caps, 3 mango lives (lost = dashed outline). Shield: a small woven
  calabash badge on the card while active.
- **Top-centre combo gauge:** umber disc, ring of 24 dots draining with the combo timer, "×3", 5 pips under it, thin gold
  **Madness meter** under the pips (turns fully gold and pulses during Madness; steady under reduced motion).
- **Top-right score:** SCORE label + big score (cream, Archivo 900, umber offset shadow). Under it:
  - the **pot chip** (new): saffron pill "+3,200 IN THE POT", shown only while the pot > 0; it shakes softly and
    shatters on POT_LOST (step 9's shatter), and flies into the score with a count-up on POT_BANKED;
  - the **best-chase chip** (step 9 wording), below the pot chip.
- **Banners** under the combo gauge: umber strip with Cormorant spaced caps ("PASSING MAKOKO"). **Vermilion** strip for
  danger happenings (Lights out, gust, The Big One, first bat); **gold** for MANGO MADNESS and NEW BEST. One at a time,
  newest wins, 2 s.
- **Bottom-left time-of-day bar** (desktop): phase name + m:ss, three segments with a marker, place labels
  MAKOKO · BRIDGE · CITY. Phone: the compact time chip bottom-centre.
- **Bottom-right (desktop):** dash indicator "SPACE · DASH READY" with a dot ring that refills, + round pause button.
- **Phone:** pause under the score; floating joystick bottom-left (104 px ring + 50 px knob); 88 px saffron DASH button
  bottom-right with umber border and offset shadow; DASH greys and refills like the desktop ring.
- Pop-ups keep step 9's behaviour; restyle them to the mockup (cream with umber shadow; "NEAR MISS" umber pill;
  bad ones vermilion).

## 3. Pause
- Game dimmed and blurred (CSS backdrop-filter; a plain dim under reduced motion or if unsupported), compact ochre card:
  **Resume** (primary), **Restart**, **Quit to menu**, toggles for music, sound and reduced motion. Esc / P toggles.
  Auto-pause when the tab is hidden (exists).

## 4. Game over
Match `gameover-desktop` and `gameover-phone` (phone: the card fills the width, scrolls if needed):
- Night scene with the character **cheering** on a new best, **slumped** otherwise (exists from step 9's transition).
- Poster card: inner 1 px rule inset 10 px, diamond ornaments at the corners, vermilion hard shadow.
- **Kicker:** "FREE PLAY · 25 OCT" or "DAILY RUN · 25 OCT".
- **Headline by how far you got** (TEXT, one per phase): golden hour "You made it past Makoko.", dusk "You survived
  until nightfall.", night "You rode into the night.", midnight "You reached midnight!" (adjust wording to taste, max 32
  characters).
- **Score** counting up over 800 ms with the vermilion print shadow; the rotated **NEW BEST** stamp slams on when it is
  one.
- **Medal** (dot-ring) + **2×2 stats**: MANGOES, BEST COMBO, NEAR MISSES, SURVIVED (m:ss). Then the **"NEXT: DIAMOND ·
  11,760 TO GO"** progress bar.
- **Two small lines under the stats, only when they apply** (plain, never guilt):
  - "Lost in the pot: 2,400" (RunSummary.potLost > 0);
  - "Swoops 12 · Best chain ×4 · Slams 3" (only the non-zero parts).
  - And the record near miss when close: "Only 340 short of your best" (within 10% of the best, not a new best).
- **Rank line:** signed in: "#14 on start.ng" from the save result's `rank`, plus the **rival**: "Tunde is 1 place
  above · 12,400" (the entry one rank above, from the leaderboard). Guests: "Sign in to get on the board" (button).
- **Buttons:** **PLAY AGAIN** (umber, SPACE key chip), **SHARE CARD** (outlined), **MENU** (underlined text).
- Focus lands on PLAY AGAIN. The card appears ~0.3 s after the death transition ends.

## 5. Leaderboard
- An ochre poster card over the current screen (from the start screen button and from game over): a Swiss table with
  RANK · NAME (with their start.ng colour dot) · SCORE · SURVIVED (m:ss) · MANGOES. Top 10.
- The player's own row on saffron. If they are outside the top 10, a separator and their own row below (fetch up to
  `limit: 50` to find it; otherwise show the rank from their last save).
- **One board only:** start.ng keeps each player's best run, with no daily boards. Don't build a daily tab; the Daily best
  stays local, as now.
- Loading: the spinning dot ring. Error or offline: "Couldn't load the board. Try again." with a retry button.
- Guests see the board plus "Sign in to get on the board".

## 6. Share card (`sharecard.js`, currently a stub)
- A **1200×630 PNG drawn on the device** with a 2D canvas (no libraries), in the **same poster style** as the game-over
  card: ochre card with umber border and vermilion offset shadow, the wordmark, the player's portrait (draw the face
  from the start.ng style in simple shapes, or capture the character render to an image), the score, medal, the 4
  stats, kicker with mode and date, and "Play Mango Rush on start.ng" + the game URL.
- **Phone:** Web Share (`navigator.share` with the file) when available. **Desktop:** download the PNG and copy a text
  line ("I scored 18,240 on Mango Rush 🥭 https://mango-rush.start.ng") to the clipboard, with a "Copied" confirmation.
- Fonts must be loaded before drawing (`document.fonts.ready`).

## 7. Loading screen
- Ochre paper, centred wordmark, spinning dot ring, "Syncing your look from start.ng…", and one tip from a short list in
  TEXT. Falls back to guest within ~4 s locally (exists).

## 8. Debug and checks
- `?debug`: **G** opens the game-over screen with sample data (new best on/off, guest on/off), **J** opens the
  leaderboard with sample entries. Debug only.
- Screenshots of every screen at 1440×900 and 390×844, plus the leaderboard, pause and share card PNG, in
  `screenshots/step-10/` (not committed). Compare each side by side with its mockup and list any differences you chose.
- All tests pass; the Daily Run is untouched (no gameplay changes in this step).

## Out of scope
- Music and sound effects: step 11.
- Warm-up tutorial, medal threshold tuning, new cover.png, the timeline decision: step 12 (polish).

## Done when
- [ ] Start, HUD, pause, game over, leaderboard, share card and loading match the mockups and this brief at every
      listed size, with no overflow or overlap (check the landscape phone too).
- [ ] Pot chip, best-chase chip, Madness meter, dash indicator and the banner colours work in play.
- [ ] Game over shows the headline by phase, count-up, stamp, medal, stats, next-medal bar, the conditional lines, rank
      and rival (signed in) or the sign-in invite (guest).
- [ ] Leaderboard: top 10, own row highlighted (or shown below), loading and error states.
- [ ] Share card: correct PNG; Web Share on phone, download + copied text on desktop.
- [ ] Keyboard and screen-reader basics work; reduced motion removes the motion.
- [ ] No new 3D draw calls; HUD updates without per-frame layout.
- [ ] G and J debug keys work.
- [ ] Committed on `v1` as `step 10: the screens`, with **no Co-Authored-By line**.

## Report (in chat, under 25 lines)
1. What you built, file by file; contract changes.
2. Each screen vs its mockup: what matches, and any differences you chose and why.
3. Screenshots list (and the share card PNG).
4. A test script for the owner (start → play → pause → game over → share → leaderboard, as guest and signed in where
   possible, on laptop and phone).
5. Anything you simplified or couldn't do.
