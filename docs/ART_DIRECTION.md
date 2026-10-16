# Mango Rush — Art direction: "Golden Hour Print"

**The world is the painting; the interface is the poster.** Swiss order decides where things go (strict grid, big
cropped type, small tracked labels, lots of air). African print decides how things look (concentric dot rings,
block-print paper texture, woven borders, warm wax-print colours). Never generic: no gradient washes, no glassy
cards, no rounded "app" pills, no emoji in the UI.

Approved mockups: `docs/mockups/` (screenshots added by the owner). When an image exists, match it.

## Palette (CSS variables in `css/tokens.css`)
| Token | Hex | Use |
| --- | --- | --- |
| paper | #D9A85B | ochre paper: panels, cards |
| paper-dark | #B8873E | woven border checks |
| ink | #2B1A10 | burnt umber: text, outlines, dark chips |
| vermilion | #E4573D | sky, print-offset shadow |
| vermilion-dark | #C8432E | danger, NEW BEST stamp, coconut rings |
| saffron | #F2A93B | sun, mangoes, primary button text |
| gold | #FFD84D | golden mango, Madness |
| teal | #1FA39A | water (darker: #178A83, deep: #123A4A) |
| green | #0F3D2E | palms, banks, night pattern |
| night | #0B0B0C | late game, game over |
| cream | #FFF1D6 | text on dark |
| wood | #B9824A deck, #8A5A2E plank lines, #6B4224 rim, #4A2C14 dark wood | the barge |

## Type
- Archivo 900, `font-stretch: 112%` — headlines and all numbers (tabular figures).
- Archivo 400–600 — body text and buttons (800 for button labels, tracked 0.14–0.16em).
- Cormorant Garamond 600, UPPERCASE, `letter-spacing: 0.42em` — ceremonial lines (kickers, place banners, "DAILY RUN · 16 OCT").
- Labels: 11 px Archivo 800, uppercase, tracked 0.24em.

## Motifs and surfaces
- **The dot ring:** concentric rings of round dots (SVG: a circle with `stroke-dasharray="0 N"` and
  `stroke-linecap="round"`). Used for: landing warnings, the sun and moon, the combo timer, medals, loading spinner,
  the night sky, the wordmark's O.
- **Paper cards:** ochre, 2 px umber border, square-ish corners (4–6 px); hero cards get a vermilion offset shadow
  `6px 6px 0`; ceremonial cards (game over) get an inner 1 px rule inset 10 px and small diamond ornaments at the corners.
- **Woven strip:** alternating 12 px umber / #B8873E squares on the edge of panels.
- **Grain:** a subtle fractal-noise overlay (multiply, ~16%) on screens.
- **Wordmark:** custom geometric MANGO / RUSH lettering, dot-ring O, small mango (`js/ui/wordmark.js`).

## The 3D world
- **Cartoon (cel) shading** with 2–3 flat tones, soft dark outlines (inverted hull, ~0.03 units, umber #2C1A0E),
  paper-grain texture multiplied in. No PBR shininess, no bloom.
- **Blob shadows** (soft dark ellipses) under the player, items and props; no shadow maps.
- **Golden hour:** coral/vermilion sky in painted bands (not smooth gradients), a huge saffron sun disc with dot rings
  low on the horizon, teal water with saffron sun-reflection streaks, deep-green silhouettes (palms, mangroves,
  Makoko stilt houses).
- **Dusk:** plum (#5A2140) to vermilion sky, sun sinking, the bridge lights and lanterns come on.
- **Night:** #0B0B0C sky with dot-ring stars and a cream dot-art moon, city skyline (#17262A blocks with saffron
  windows) reflected in the water, fireflies, warning rings glow saffron/cream.
- **The barge:** warm wooden deck (#B9824A) with plank seams, a darker rim, mango crates (some piled with mangoes)
  at the far corners, rope coils, lantern posts at the corners (unlit by day, warm glow from dusk).
- **Items:** mango = saffron ellipsoid with a vermilion blush and a green leaf; golden = brighter gold with a
  sparkle; rotten = brown with tiny dark fly dots; coconut = dark brown faceted sphere with three dark eyes;
  shield = woven calabash.

## The character (from start.ng style)
- Built from simple shapes; exact start.ng colours: top = primaryColor, bottoms = secondaryColor, plus skin and hair.
- Body: male (broader shoulders) / female (narrower, skirt).
- Hair: short, afro, braids (thin locks with gold beads), bun, ponytail, dreads, bald. Hat: cap, beanie, tophat,
  crown. Extra: glasses, earrings, beard, scarf, backpack. Unknown values fall back gracefully.
- **Print pattern:** stripes and a row of dots in a darker tone (−30%) of the player's own top and bottoms colours.
- Reactions: hop + arms up on catch, stumble on hit, cheer (arms up) on a new best, slump on game over.
- A name tag (umber pill, cream Archivo 800) floats above the head.

## Screens
**Start — desktop (1440×900):** left: a 600 px ochre paper panel, full height, woven strip on its right edge:
kicker "A START.NG GAME · LAGOS" (Cormorant), the wordmark ~640 px wide overhanging the panel edge onto the sky,
tagline, 2 px umber rule, two columns (PLAYER: name 34 px · LOOK: "Synced from start.ng" with a check badge), wearing
chips (dot of colour + label), **Play** (umber button, saffron text, 64 px tall) + **Daily Run** (outlined, with
"16 Oct · same drops for everyone"), bottom row: BEST / DAILY BEST numbers, music + sound icon toggles, controls hint.
Right: the 3D scene — sun with dot rings on the horizon, the character standing on the barge deck in front of the
sun, stilt houses silhouetted, palms on the bank, a mango crate and a lantern. Top-right: "GOLDEN HOUR · LAGOS LAGOON".
**Start — phone (390×844):** the scene on top with the wordmark over the sky; an ochre bottom sheet (~370 px) with a
woven strip on its top edge: "Hi, Bonnke" + synced badge, chips, full-width Play and Daily Run, best + toggles.

**In-game — desktop:** tilted camera; horizon with sun, fishing village and canoes in the top quarter; the barge deck
in perspective below; an overhanging mango branch in a top corner. HUD: top-left player card (ochre, portrait circle,
NAME in caps, 3 mango life icons — lost = dashed outline); top-centre combo gauge (umber disc, ring of 24 dots draining,
"×3", 5 pips under it, thin gold Madness bar); a place banner under it (umber strip, Cormorant spaced caps);
top-right SCORE label + big score (cream, Archivo 900, umber offset shadow) + "+1,240 AHEAD OF BEST" chip; bottom-left
time-of-day bar (umber card: phase name + m:ss, three segments golden/dusk/night with a marker, labels MAKOKO ·
BRIDGE · CITY); bottom-right dash indicator ("SPACE · DASH READY" with a dot ring) + round pause button.
Floating text: "+300 ×3" (cream, umber shadow), "NEAR MISS +50" (umber pill), "BONK!" (vermilion).
**In-game — phone:** same HUD, compact; pause under the score; floating joystick bottom-left (104 px ring + 50 px
knob); 88 px saffron DASH button bottom-right with umber border and offset shadow; time chip bottom centre.

**Game over:** night scene (lagoon, skyline with lit windows, lantern on the deck), the character cheering (new best)
or slumped. Centred-right framed poster card: kicker ("DAILY RUN · 16 OCT"), headline ("You survived until
nightfall."), huge score with vermilion print shadow (counts up over 800 ms), rotated vermilion NEW BEST stamp, gold
dot-ring medal + 2×2 stats grid with thin rules, "NEXT: DIAMOND · 11,760 TO GO" progress bar, start.ng rank line,
buttons: PLAY AGAIN (umber, with a SPACE key chip), SHARE CARD (outlined), MENU (underlined text).

**Pause:** game dimmed and blurred; compact ochre card: Resume, Restart, Quit, toggles.
**Leaderboard:** ochre poster card over the current screen, Swiss table (rank, name, score, survived, mangoes), the
player's own row on saffron.
**Loading:** ochre paper, centred wordmark, spinning dot ring, message, one tip.

## Motion
Cards slide up 24 px + fade over 280 ms (ease-out `cubic-bezier(0.16,1,0.3,1)`); buttons scale to 0.96 when pressed
and spring back; numbers count up; banners slide down and fade out after 2–2.5 s. Reduced motion: fades only.
