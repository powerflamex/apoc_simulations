// The owner's narration (voice.m4a, one take) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s)].
// Cut points sit in the pauses between sentences (found from a word-by-word transcript and the loudness).
// The silences in between are the big moments: Andromeda's stars pouring through ours, the galaxies crashing, Earth
// boiling away, all of space squeezed into one point.
// (Empty until the recording arrives: the sections in timeline.js are laid out for the script read at ~2.4 words/s.)
export const VOICE = [];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
