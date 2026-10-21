// The owner's narration (voice.m4a, one take, Oct 20) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s)].
// Cut points sit in the pauses between sentences (found from a word-by-word transcript and the loudness).
// The silences in between are the big moments: the Milky Way unravelling, the Moon a dot, Earth splitting, your atoms.
export const VOICE = [
  [12.06, 17.29, 0.1],     // In seven minutes, space itself is going to rip you apart.
  [24.22, 26.51, 5.7],     // This is the Big Rip.
  [27.00, 39.37, 8.4],     // Space has been stretching ... it's been speeding up.
  [44.82, 49.81, 21.4],    // Nobody knows what's pushing it. Scientists just call it dark energy.
  [50.50, 53.75, 27.0],    // Now imagine it never stops speeding up.
  [54.82, 58.91, 30.9],    // And imagine you could stand right here, and watch what happens.
  [64.52, 70.76, 36.3],    // Sixty million years before the end ...
  [71.64, 73.26, 43.0],    // The Milky Way comes apart.
  [74.24, 80.66, 45.4],    // Two hundred billion stars, flung out into the dark.
  [81.51, 82.04, 52.6],    // Look up.
  [83.44, 89.03, 54.0],    // You can see the band of light ... start to unravel.
  [94.96, 99.54, 63.2],    // From down here, it's the most beautiful thing anyone has ever seen.
  [100.04, 102.11, 68.2],  // It's also a warning.
  [103.10, 108.20, 70.8],  // Because the stretching only gets stronger. And everything smaller is next.
  [110.89, 117.89, 76.8],  // One by one, the stars slide away ... Then they're gone.
  [118.71, 126.07, 85.0],  // A few thousand years before the end, the night sky is black.
  [126.68, 128.68, 93.0],  // No stars. Not one.
  [129.14, 136.42, 96.0],  // The only lights left up there ... For now.
  [138.66, 140.54, 109.4], // Eight years left.
  [141.15, 149.24, 111.9], // Saturn drifts out of its orbit. Nobody down here notices.
  [150.84, 152.10, 120.5], // Three years left.
  [152.25, 160.49, 122.2], // Jupiter ... Every night it's a little smaller.
  [160.59, 164.91, 131.6], // Then one night you look up, and it isn't there.
  [165.29, 168.60, 141.6], // Six months left.
  [169.44, 174.56, 145.2], // Mars goes the same way. And then, it's our turn.
  [202.54, 211.36, 153.5], // Three months before the end ... hold on to us.
  [212.18, 213.71, 162.8], // We come loose.
  [214.38, 223.54, 165.5], // At first, nothing seems wrong ... A little colder.
  [224.76, 232.18, 182.3], // With a month left ... and it's snowing.
  [232.85, 235.99, 193.0], // Noon looks like sunset. Then like night.
  [236.86, 241.05, 206.2], // By the last week, the Sun is just a bright star in a black sky.
  [242.40, 244.91, 213.5], // And then, the Moon goes.
  [247.76, 256.28, 220.2], // For four and a half billion years ... Further away.
  [256.96, 259.78, 237.2], // On the last night you can see it, it's a dot.
  [263.36, 269.77, 249.2], // Then it's gone too. We're alone now. Just Earth, drifting in the dark.
  [274.90, 276.22, 263.4], // Six hours left.
  [276.61, 281.01, 265.1], // The satellites go. One after another, they drift off into space.
  [281.87, 283.55, 270.0], // Satellite TV goes dark.
  [283.71, 284.76, 273.0], // Then GPS.
  [285.54, 292.59, 276.0], // Every map on every phone ... Nobody knows what to do.
  [297.30, 298.73, 299.2], // Thirty minutes.
  [299.42, 310.82, 301.0], // Now the stretching is stronger than Earth's own gravity ... Then, the ground.
  [315.08, 323.59, 318.5], // Earth comes apart ... Floating in the pieces.
  [326.87, 331.29, 339.5], // Now there's nothing left big enough to break. Except you.
  [331.39, 337.87, 357.0], // In the last fraction of a second, the space inside your body starts to stretch.
  [337.97, 339.81, 367.0], // Your cells come apart.
  [339.91, 341.45, 373.0], // Then your molecules.
  [341.93, 347.71, 379.6], // And one ten-billionth of a billionth of a second before the end, your atoms.
  [351.78, 362.34, 394.0], // That's the Big Rip ... Scientists still don't know.
  [363.27, 367.69, 405.6], // So, which ending of the universe should I simulate next? Tell me in the comments.
];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
