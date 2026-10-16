# Mango Rush — Game Design (version 1)

**Pitch:** ride a mango barge down the Lagos lagoon from sunset to midnight, catching falling mangoes and dodging
coconuts, as your own start.ng character. Easy to learn in 10 seconds, hard to survive past midnight.

**Pillars**
- Your look, everywhere: the 3D character is built from the player's start.ng style.
- Fair but frantic: every danger is telegraphed; every death feels like the player's fault.
- Adrenaline you can feel: close calls, rising stakes, a world that gets darker and tighter.
- A painting you can play: "Golden Hour Print" (see ART_DIRECTION.md).
- One more go: runs of 1.5–4 minutes; restart in under a second.

## The world and the journey
- The play area is a wide wooden **mango barge** (a deck roughly 14 × 10 units) that stays the same size and shape.
  The **world around it moves**: the run is a short journey down the lagoon. Fruit falls from trees on the banks as
  the barge drifts under them.
- **Camera:** tilted so the horizon sits in the top quarter of the screen; the deck fills the lower three quarters.
  Follows the player gently; pushes in during Mango Madness; shakes on impacts.

| Phase | Time | Where | What you see |
| --- | --- | --- | --- |
| Golden hour | 0–60 s | Mangroves, fishing village | Makoko-style stilt houses, fishermen casting nets, canoes, birds crossing a huge sun |
| Dusk | 60–150 s | Under the bridge, waterfront | A cable bridge overhead whose lights switch on; a waterfront market with lanterns |
| Night | 150–210 s | Open lagoon facing the city | Lagos skyline lit and reflected; fireflies; dot-art moon |
| Midnight | 210 s + | Open water | Fireworks over the city |

A banner marks each new place ("PASSING MAKOKO", "UNDER THE BRIDGE", ...).

**Six depth layers**, each moving at its own speed: (1) sky bands + dot-ring sun/moon + clouds; (2) far skyline and
hills, very slow, hazy; (3) banks, trees, stilt houses, canoes, people, medium speed; (4) water: shimmer, wake,
reflections; (5) the deck with crates, ropes, lanterns (light at dusk); (6) occasional foreground branches or bridge
pillars sliding past at the screen edge, never over the play area. Background layers are flat painted cut-outs
(cheap), not detailed 3D models. Ambient life: birds (golden hour), a fisherman who waves, bats (dusk), fireflies (night).

## Controls
| Action | Desktop | Phone |
| --- | --- | --- |
| Move | WASD / arrow keys | Drag anywhere on the left half (floating joystick, 12% dead zone, 60 px max) |
| Dash | Space | Dash button bottom-right (>= 72 px) |
| Pause | Esc or P | Pause button |
| Restart after game over | Space / Enter | Play again |

- Movement ~6.4 units/s with quick acceleration; the character faces where it moves.
- Dash: 0.17 s burst at ~15 units/s, then 1.1 s cooldown.
- Catch: walk into a mango while it is low (< ~2.4 units high) or after it lands. A landed mango stays ~5 s,
  blinks for the last 1.5 s, then rots away.
- A coconut only hurts at the instant it lands, within ~1 unit of the player. After a hit: 1.2 s invulnerable (blinking).

## Items
| Item | From | Effect | Warning ring |
| --- | --- | --- | --- |
| Mango | start | +100 × combo | gold dots closing in, cream inner ring |
| Golden mango | dusk (5→20% of drops) | +500 × combo, big feedback | larger glowing gold ring; often lands near a coconut |
| Rotten mango | dusk | catching it drops the combo one step; no points | dull brown dots; fruit is brown with flies |
| Coconut | start | −1 life, combo back to ×1 | red dots + a cross (shape, not just colour) |
| Calabash shield (rare) | dusk | blocks the next coconut hit | woven-pattern ring |

Warning rings **close in** toward the centre; impact happens when the ring reaches the centre.

## Scoring, combo, lives
- 3 lives. No revives or continues.
- Combo multiplier ×1 → ×5, one step every 5 catches in a row.
- After each catch the player has 2.5 s to catch again (shown as a draining dot ring). If it runs out: drop ONE step
  (0.4 s grace). Coconut hit: back to ×1.
- **Near miss:** a coconut lands within 0.5 units outside the hit radius → +50 × combo, "NEAR MISS", +0.8 s combo time.
- **Perfect dodge:** dash out of a coconut ring in its final 0.2 s → brief slow motion, "PERFECT DODGE",
  +150 × combo, dash recharges instantly.
- Medals per run: bronze / silver / gold / diamond (thresholds tuned in playtesting; placeholders in config.js).

## Run structure
| Parameter | 0 s | 60 s | 150 s | 240 s + |
| --- | --- | --- | --- | --- |
| Time between drops | 1.6 s | 1.0 s | 0.55 s | 0.33 s |
| Share of coconuts | 15% | 22% | 40% | 55% |
| Warning time | 1.2 s | 1.0 s | 0.75 s | 0.5 s (never less) |
| Golden chance | 0% | 5% | 12% | 20% |

- **Breathers:** every 30 s, a 3 s mango shower (no coconuts) from branches overhead.
- **Happenings** (2 s banner + one beat of music silence before each):
  - ~86 s **Under the bridge**: ~10 s of shadow; only warning rings glow.
  - ~120 s and ~180 s **Gust**: wind pushes falling items sideways; rings drift with them.
  - From dusk **Fruit bat**: swoops across in a straight line now and then; its path shows 1 s before.
  - From night **Coconut volleys**: coconuts in groups of 2–3.
  - 210 s **The Big One**: a giant coconut with a huge ring at midnight; dash out or lose a life.

## Adrenaline systems
| System | Trigger | What happens |
| --- | --- | --- |
| Heartbeat mode | last life | music muffles, heartbeat, screen edges pulse, colours drain except warning rings; points ×1.5 |
| Perfect dodge | see above | 0.3 s slow motion, bonus, dash recharge |
| Mango Madness | hold ×5 long enough to fill the fever meter | 8 s mango storm: double points, full music, camera pushes in, gold glow; each catch +0.3 s |
| Water over the deck | from dusk | water washes over the deck edges; safe area shrinks to ~55% by midnight |
| Live best chase | once a best exists | HUD line "+1,240 ahead of best"; passing it fires a mid-run "NEW BEST" |
| Adaptive music | phase, events, last life | layers build per phase; silence beat before events; heartbeat on last life |

## Flow around the run
1. **Loading (~1.5 s):** "Syncing your look from start.ng…", then the character drops onto the deck like a mango.
2. **Start screen:** poster layout (see ART_DIRECTION.md): Play, Daily Run, best scores, leaderboard, sound toggles,
   sign-in button for guests.
3. **First-run warm-up (~12 s, first run only):** hints under the character, one slow mango, one slow coconut far
   away; hints fade after the first input; then 3-2-1.
4. **Run.**
5. **Pause:** Esc / P / button, and automatically when the tab is hidden. Resume, Restart, Settings (music, sound,
   reduced motion), Quit.
6. **Game over:** 180 ms freeze + slow motion as the character tumbles, then the poster card: headline by how far
   you got, score (counts up), NEW BEST stamp, medal, stats (mangoes, best combo, near misses, time), progress to the
   next medal, start.ng leaderboard rank, Play again / Share card / Menu.

**Modes:** Free play (random drops) and Daily Run (same drops for everyone that UTC day, seeded by the date).
**Share card:** a 1200 × 630 PNG made on the device (portrait, score, medal, stats, "Mango Rush on start.ng");
Web Share on phones, download + copied text on desktop.
**Saved in the browser (per start.ng user):** best, daily best + date, total mangoes, runs, warm-up done, settings.
**start.ng leaderboard:** signed-in runs saved with columns score, survived (seconds, shown m:ss), mangoes.

## Audio
- One free-licence afrobeat/highlife loop (Pixabay) under 1 MB at `assets/music/loop.mp3`; adaptive through a
  low-pass filter and slight speed-up per phase; full during Madness; muffled + heartbeat on the last life; ducked on
  pause/game over. Starts on the first Play press.
- All sound effects synthesized with Web Audio: catch chime rising with the chain, golden chord, coconut thud, hit,
  dash whoosh, near-miss ping, perfect-dodge swell, combo step-up, madness fill, happening silence beat, new-best
  arpeggio, countdown ticks, game-over drop. Separate music and sound toggles.

## Game feel (starting values)
| Event | Freeze | Shake (strength, fade) | Squash | Particles | Sound |
| --- | --- | --- | --- | --- | --- |
| Mango catch | 0 | — | 1.15 tall, 40 ms | 12 saffron dots | chime, +3% pitch per chain step |
| Golden catch | 40 ms | 0.12, ~0.1 s | 1.35, 70 ms | 28 gold + ring burst | chord |
| Near miss | 16 ms | 0.08 | — | 6 dots in a ring | high ping |
| Perfect dodge | 0.3 s slow-mo | 0.05 | dash stretch | dust ring | swell |
| Coconut hit | 100 ms | 0.45, ~0.22 s | 0.6 tall, 100 ms | 30 brown fragments + red edge flash | thud + music duck |
| Dash | 0 | 0.04 | stretched 1.35 | dust + trail | whoosh |
| Combo step up | 15 ms | 0.08 | 1.2, 50 ms | HUD dot burst | rising note |
| Game over | 180 ms then 0.5 s at 20% | 0.6 | tumble | dot implosion | low drop |

Shake fades smoothly (never per-frame random jitter); squash preserves volume; HUD and particles keep moving during
freezes; reduced motion removes shake, flashes and slow motion.

## Not doing (v1)
Live multiplayer, revives/continues, cosmetics that change the start.ng look, extra hidden bonuses.
**Version 1.1:** per-run missions, monkey raid event, basket push-your-luck experiment.
