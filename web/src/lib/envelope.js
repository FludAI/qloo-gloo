// The learner's voice as energy. audio.js reports the RMS of every ~50 ms frame while the mic is held;
// this finds syllable nuclei in that envelope: a peak above an adaptive threshold, at least 120 ms after
// the last one, with the envelope having dipped between them (a held vowel is one syllable, not five).
// Pure, so the server tests can feed it a synthetic envelope.

export const FRAME_SECONDS = 0.05;

// Frames an audio stream into RMS values: push(Float32Array) calls onFrame(rms, tSeconds) per full frame.
export function createFramer(sampleRate, onFrame, frameSeconds = FRAME_SECONDS) {
  const size = Math.max(1, Math.round(sampleRate * frameSeconds));
  let sumsq = 0, n = 0, frames = 0;
  return {
    push(samples) {
      for (let i = 0; i < samples.length; i++) {
        sumsq += samples[i] * samples[i];
        if (++n === size) { onFrame(Math.sqrt(sumsq / n), ++frames * frameSeconds); sumsq = 0; n = 0; }
      }
    },
  };
}

// opts: refractory (s), dip (a new peak needs the envelope to have fallen to this share of the last one),
// minLevel (RMS below which nothing counts), ratio (where the threshold sits between the floor and the ceiling).
// An unstressed syllable can carry a third of the amplitude of the stressed one before it, so the threshold
// sits low (a fifth of the way up) and the ceiling forgets a loud syllable within about a second.
export function createNucleusDetector({ refractory = 0.12, dip = 0.6, minLevel = 0.012, ratio = 0.2 } = {}) {
  let floor = null, ceil = 0, prev = 0, prev2 = 0, tPrev = 0, last = -Infinity, lastPeak = 0, minSince = Infinity, count = 0;
  return {
    get count() { return count; },
    // One frame in; true when a nucleus has just been found (at the previous frame, the one that peaked).
    push(rms, t) {
      floor = floor === null ? rms : rms < floor ? rms : floor + (rms - floor) * 0.02; // falls at once, rises slowly
      ceil = Math.max(rms, ceil * 0.97);
      const threshold = Math.max(minLevel, floor + ratio * (ceil - floor));
      let found = false;
      if (prev > prev2 && prev >= rms && prev > threshold && tPrev - last >= refractory && (count === 0 || minSince <= dip * lastPeak)) {
        found = true; count++; last = tPrev; lastPeak = prev; minSince = Infinity;
      }
      minSince = Math.min(minSince, rms);
      prev2 = prev; prev = rms; tPrev = t;
      return found;
    },
  };
}
