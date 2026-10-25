// Mango Rush — the music loop's playback window (pure: no Web Audio, no DOM).   OWNER: Claude Code  ·  STATUS: step 11
//
// CONTRACT:
//   loopWindow(bufferDuration, loopSeconds, tolerance = 0.005) -> { loopStart, loopEnd, kind }
//     loop.mp3 is exactly `loopSeconds` long (54.862 s, 24 bars) and its last 50 ms are blended into its start, so it loops seamlessly IF it is decoded
//     gaplessly. MP3 decoders add the encoder's delay at the start unless they read the LAME header (Chrome and Firefox do). So:
//       kind 'exact'   the decoded buffer is within `tolerance` of loopSeconds: loopStart 0, loopEnd loopSeconds.
//       kind 'padded'  it is longer by about 25-60 ms: the decoder kept the padding. loopStart = LAME_DELAY / 44100 (1105 samples, 25.06 ms),
//                      loopEnd = loopStart + loopSeconds.
//       kind 'other'   anything else (a different file, a decoder we do not know): loop the whole buffer from 0 to min(duration, loopSeconds)
//                      so it can never run past the end.
//     main audio code logs the kind once under ?debug.

export const LAME_DELAY_SAMPLES = 1105;
export const MP3_RATE = 44100;

export function loopWindow(bufferDuration, loopSeconds, tolerance = 0.005) {
  const extra = bufferDuration - loopSeconds;
  if (Math.abs(extra) <= tolerance) return { loopStart: 0, loopEnd: loopSeconds, kind: 'exact' };
  if (extra > 0.02 && extra < 0.065) {
    const loopStart = LAME_DELAY_SAMPLES / MP3_RATE;
    return { loopStart, loopEnd: loopStart + loopSeconds, kind: 'padded' };
  }
  return { loopStart: 0, loopEnd: Math.min(bufferDuration, loopSeconds), kind: 'other' };
}
