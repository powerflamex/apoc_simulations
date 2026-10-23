// The owner's narration (voice.m4a, one take) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s)].
// Cut points sit in the pauses between sentences (found from a word-by-word transcript and the loudness).
// Empty until he sends the recording: the draft video has the picture, the music and the on-screen text only.
export const VOICE = [];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
