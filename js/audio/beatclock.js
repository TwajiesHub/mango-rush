// Mango Rush — the beat clock (pure: no Web Audio, no DOM).   OWNER: Claude Code  ·  STATUS: step 11
//
// CONTRACT:
//   createBeatClock({ bpm, loopSeconds, fallbackBpm = 105 }) -> clock
//     clock.start()                 the music began (position 0 of the loop). clock.stop() it ended / is off.
//     clock.advance(dtAudio, rate)  dtAudio = seconds of AUDIO-CLOCK time that passed (AudioContext.currentTime delta); rate = the music's current
//                                   playbackRate (1.00 .. 1.06): the music position moves dtAudio x rate, so the beat speeds up with the music.
//                                   (A separate fallback position always moves at real time.)
//     clock.value(out) -> out       writes { beat, phase }: beat = beats since the loop start (a number that keeps counting through each loop),
//                                   phase = 0..1 inside the beat. While the music runs it comes from the music position at `bpm`; when it is off or
//                                   not yet unlocked it comes from a plain wall clock at `fallbackBpm` (105), so the night seam glow always pulses.
//     clock.running                 true while the music runs.
//   The loop is exactly 24 bars = 96 beats, so a wrap of the position (modulo loopSeconds) is a whole number of beats: the beat does not jump.

export function createBeatClock({ bpm, loopSeconds, fallbackBpm = 105 }) {
  let pos = 0;        // music seconds since the loop start (wraps at loopSeconds)
  let loops = 0;      // completed loops, so `beat` keeps counting
  let wall = 0;       // real seconds, for the fallback
  const c = {
    running: false,
    start() { pos = 0; loops = 0; c.running = true; },
    stop() { c.running = false; },
    advance(dtAudio, rate = 1) {
      if (!(dtAudio > 0)) return;
      wall += dtAudio;
      if (!c.running) return;
      pos += dtAudio * rate;
      while (pos >= loopSeconds) { pos -= loopSeconds; loops++; }
    },
    value(out) {
      const beats = c.running ? ((loops * loopSeconds + pos) * bpm) / 60 : (wall * fallbackBpm) / 60;
      const beat = Math.floor(beats);
      out.beat = beat;
      out.phase = beats - beat;
      return out;
    },
  };
  return c;
}
