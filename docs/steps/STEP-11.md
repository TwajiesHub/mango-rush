# Step 11: Sound

Owner feedback on step 10: the screens are good. This step adds the **music** and brings the **sound effects** up to
date with everything built since step 1 (the pot, skills, happenings, Madness, Heartbeat, the screens). The audio
contract is the header of `js/audio/audio.js`; the plan is in `docs/GAME_DESIGN.md` → "Audio".

## 0. The music file (already in the kit)
- `assets/music/loop.mp3`: **879 KB**, **54.862 s = exactly 24 bars at ~105 BPM** (104.99), stereo 44.1 kHz, 128 kbps,
  loudness about -18 LUFS. It starts on a bar line. The last 50 ms are already blended into the start, so it loops
  seamlessly **if decoded gaplessly**. `assets/music/CREDITS.txt` has the source and licence.
- Put the numbers in `CONFIG.music`: `{ url: 'assets/music/loop.mp3', bpm: 104.99, loopSeconds: 54.862, bars: 24 }`.

## 1. Music playback (finish the contract)
- `unlockAudio()` (on the first Play press, as the contract says) fetches and decodes the loop and starts it looping.
  If it fails to load, the game carries on silently (contract rule).
- **Gapless loop:** play it with an `AudioBufferSourceNode`, `loop = true`, and **set `loopStart` / `loopEnd`
  explicitly** to the 54.862 s window. MP3 decoders add encoder padding unless they read the LAME header (Chrome and
  Firefox do; check Safari if you can). Compare `buffer.duration` to 54.862 s:
  - within 5 ms: loopStart 0, loopEnd 54.862;
  - longer by about 25–60 ms: the decoder kept the padding. Use loopStart = 1105 / 44100 s (LAME's usual delay),
    loopEnd = loopStart + 54.862. Log the case once under `?debug`.
  - Keep that logic in a small pure helper with a node test.
- **Where it plays:** after unlock, the music plays on every screen. Start screen: golden-hour filter at -6 dB. Pause and
  game over: the duck from the contract. It keeps playing (filtered) during the death transition.
- **Adaptive (the contract's numbers):** the phase cutoffs 1800 / 4000 / 9000 / 16000 Hz and playbackRate 1.00 / 1.02 /
  1.04 / 1.06, gliding over 2 s; Madness opens it fully (+2 dB); Heartbeat muffles it to 700 Hz with the lub-dub;
  pause and game over duck it. **Add:** Lights out lowers the cutoff to ~900 Hz while dark; the happening "silence
  beat" (exists) stays.
- **Beat clock:** export `musicBeat() -> { beat, phase }` computed from the audio clock and the current playbackRate
  (falls back to a 105 BPM clock when music is off or not yet unlocked). **The living planks' night seam glow uses it**
  (replace the 100 BPM placeholder in `CONFIG.adrenaline...seam`), so the deck pulses with the real groove.
- `setMusicEnabled` / `setSfxEnabled` fade over 0.3 s with no click (contract).
- **Tab hidden:** suspend the AudioContext (save battery), resume when visible (the game auto-pauses already).
- iOS / Safari: create and resume only inside the gesture; resume again on the next gesture if the context is
  'interrupted'.

## 2. Sound effects to add (all synthesized, Web Audio only)
Existing step-1 sounds stay (catch, golden, rotten, shield, whistles, lock click, drift swish, thud, hit, near miss,
Perfect dodge, dash, footsteps, skid, snap turn, step up, Madness fill, silence beat, NEW BEST, countdown, run end).
Check each still fires. **Add:**

| Event | Sound |
| --- | --- |
| POT_BANKED | a quick rising cascade of coin "tinks"; more notes and brighter for bigger pots (cap the notes) |
| SLAM_BANK | a woody thump under a bigger coin cascade + a short chord stab |
| SWOOP | an airy swish with a pluck on top |
| Chain step (chain ≥ 2) | the pluck steps up a scale degree per chain (cap at 8) |
| POT_LOST | a dry crack + a short descending three-note fall (plain, not sad-trombone) |
| Bat path appears | a soft leathery flutter, panned toward the side it comes from |
| BAT_HIT | a flap + a soft bonk |
| ITEM_SNATCHED | a quick "fwip" |
| Gust (HAPPENING_START/END gust) | filtered wind noise that swells in, sweeps (bandpass moving) for the 6 s, and eases out |
| Lights out start / end | a low soft "whoomp" going under the bridge, a lighter one coming out |
| The Big One | a low rumble rising over its 3 s warning; a huge thud + splash on impact; on BIGONE_SURVIVED a bright triumphant chord |
| Mango shower | a leafy rustle + light marimba sparkles while it lasts |
| MADNESS_START / during | the drum fill (exists) + a light shaker layer on the beat (from `musicBeat()`) while Madness lasts |
| Living planks | a soft wooden knock layered on the coconut thud; an occasional faint creak on FOOTSTEP at speed (at most 1 in 6 steps) |
| UI | soft tick on button press; a small confirm blip for "Copied" / share done |

## 3. Mix and performance
- Buses: music → musicGain; SFX → sfxGain; both → a gentle `DynamicsCompressor` → destination, so stacked sounds
  never clip.
- Big moments (hit, The Big One impact, POT_LOST) duck the music briefly (hit exists: reuse it).
- **Voice limit:** at most 24 live SFX voices; drop the quietest/oldest beyond that. Per-event rate limits (whistles
  already have one; add them for coins, creaks and popups-driven sounds).
- Pre-render repeated short sounds into AudioBuffers (as footsteps do); no setInterval; disconnect finished nodes; no
  allocation in `updateAudio`.
- Every sound gets the ±detune from CONFIG; respect the music and sound toggles; never throw.

## 4. Debug (`?debug`)
- The tuning panel gets a **Sound** section: music on/off, current cutoff and rate, beat phase, live voice count.
- **Y** plays every new sound in turn (a sound check), marking the run unranked.

## 5. Tests and checks
- Node tests: the loop-window helper (both decoder cases) and the beat clock (phase from time and rate).
- All existing tests pass; the Daily Run is untouched (no gameplay changes).
- Listen through a full run at real speed if you can, on desktop and in the phone view. Check the loop seam
  (no click or gap at 54.86 s), the phase changes, Madness, Heartbeat, Lights out, a gust and The Big One.

## Out of scope
- New music tracks or vocals; volume sliders (toggles only); warm-up tutorial and cover (step 12).

## Done when
- [ ] The loop plays from the first Play press, loops with no audible gap or click, and adapts per phase, Madness,
      Heartbeat, Lights out, pause and game over.
- [ ] `musicBeat()` drives the night seam glow; falls back to 105 BPM when music is off.
- [ ] Every sound in section 2 plays on its event; step-1 sounds still work; toggles fade without clicks.
- [ ] Compressor on the master; voice limit and rate limits in place; no allocation per frame.
- [ ] Tab hidden suspends audio; it resumes cleanly; iOS-style unlock works.
- [ ] Y sound check and the Sound debug section work.
- [ ] All tests pass, including the new ones.
- [ ] `assets/music/CREDITS.txt` committed with the music.
- [ ] Committed on `v1` as `step 11: sound`, with **no Co-Authored-By line**.

## Report (in chat, under 25 lines)
1. What you built, file by file; contract changes.
2. The decoder case you saw (buffer.duration) in each browser you could test, and the loop window used.
3. Performance: live voices at the busiest moment, any CPU concern on phones.
4. A listening script for the owner (Y sound check; a full run; Madness with M; last life with L; Lights out and The
   Big One with H; mute and unmute both toggles).
5. Anything you simplified or couldn't do.
