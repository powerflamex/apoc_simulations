// The owner's narration (voice.m4a) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s), what he says].
// Empty until he records the new script (the problem-solving version, Oct 25; his earlier take fit the old cut).
export const VOICE = [];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
