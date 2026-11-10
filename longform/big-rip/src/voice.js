// The owner's narration, second take (voice2.m4a, Oct 21: read along to the video, so it runs ~6 s behind it),
// cut into lines and placed on the video clock. Each entry: [start in the recording (s), end in the recording (s),
// video time it plays at (s)]. Every sentence sits where the read-along showed it (sentences he ran together stay
// together); cut points sit in the pauses. Dropped: the slip at the end ("light years ... cut that out", 400-418 s).
// The silences in between are the big moments: the Milky Way unravelling, the Moon a dot, Earth splitting, your atoms.
// (The first take's table is in git history, commit 03a2ca2.)
export const VOICE = [
  [6.27, 11.30, 0.13],      // In seven minutes, space itself is going to rip you apart.
  [12.07, 13.80, 5.73],     // This is the Big Rip.
  [14.69, 17.58, 8.45],     // Space has been stretching ever since the Big Bang.
  [18.29, 22.38, 12.39],    // Every second, the gap between galaxies gets a little wider.
  [22.98, 26.81, 17.11],    // And for the last five billion years, it's been speeding up.
  [27.45, 32.22, 21.43],    // Nobody knows what's pushing it. Scientists just call it dark energy.
  [32.98, 36.47, 27.17],    // Now imagine it never stops speeding up.
  [36.92, 41.09, 30.93],    // And imagine you could stand right here, and watch what happens.
  [42.43, 51.02, 36.33],    // Sixty million years before the end, the stretching gets stronger th...
  [51.49, 54.76, 45.45],    // Two hundred billion stars, flung out into the dark.
  [58.69, 65.33, 52.70],    // Look up. You can see the band of light across the sky fray at the e...
  [69.18, 73.81, 63.23],    // From down here, it's the most beautiful thing anyone has ever seen.
  [74.36, 75.79, 68.23],    // It's also a warning.
  [76.73, 82.00, 70.83],    // Because the stretching only gets stronger. And everything smaller i...
  [82.69, 86.22, 76.83],    // One by one, the stars slide away from each other.
  [86.70, 89.71, 80.70],    // They get dimmer. Redder. Then they're gone.
  [90.96, 95.21, 85.06],    // A few thousand years before the end, the night sky is black.
  [98.98, 108.91, 93.03],   // No stars. Not one. The only lights left up there are the Moon, and ...
  [115.56, 116.95, 109.43], // Eight years left.
  [118.39, 120.32, 112.46], // Saturn drifts out of its orbit.
  [124.47, 126.10, 118.44], // Nobody down here notices.
  [126.89, 133.42, 120.53], // Three years left. Jupiter, one of the brightest lights in the night...
  [133.87, 136.12, 127.31], // Every night it's a little smaller.
  [137.19, 141.93, 131.55], // Then one night you look up, and it isn't there.
  [146.98, 149.23, 141.55], // Six months left.
  [151.43, 156.10, 145.23], // Mars goes the same way. And then, it's our turn.
  [159.50, 167.99, 153.53], // Three months before the end, the space between Earth and the Sun st...
  [168.76, 169.93, 162.83], // We come loose.
  [171.38, 180.52, 165.53], // At first, nothing seems wrong. It's a normal day. But every morning...
  [188.04, 192.27, 182.33], // With a month left, it looks five times smaller than it should.
  [192.90, 195.71, 187.13], // It's the middle of summer, and it's snowing.
  [199.16, 202.13, 193.14], // Noon looks like sunset. Then like night.
  [212.02, 216.79, 206.23], // By the last week, the Sun is just a bright star in a black sky.
  [219.22, 221.81, 213.53], // And then, the Moon goes.
  [226.02, 234.69, 220.23], // For four and a half billion years, the Moon has hung over us. Now, ...
  [243.22, 246.05, 237.23], // On the last night you can see it, it's a dot.
  [255.34, 256.97, 249.23], // Then it's gone too.
  [257.73, 258.84, 251.75], // We're alone now.
  [259.52, 261.71, 253.39], // Just Earth, drifting in the dark.
  [269.54, 275.49, 263.43], // Six hours left. The satellites go. One after another, they drift of...
  [276.08, 277.71, 270.14], // Satellite TV goes dark.
  [278.85, 280.08, 273.04], // Then GPS.
  [281.93, 287.14, 276.03], // Every map on every phone stops knowing where you are. Everyone is l...
  [287.75, 289.28, 281.77], // Nobody knows what to do.
  [305.29, 306.28, 299.25], // Thirty minutes.
  [306.85, 311.32, 301.03], // Now the stretching is stronger than Earth's own gravity.
  [311.79, 318.56, 305.75], // The air goes first. It starts drifting up. Off the streets. Off the...
  [324.65, 332.65, 318.53], // Earth comes apart, like it was never stuck together. And somehow, y...
  [345.19, 349.69, 339.45], // Now there's nothing left big enough to break. Except you.
  [362.88, 369.18, 356.95], // In the last fraction of a second, the space inside your body starts...
  [372.94, 374.41, 366.95], // Your cells come apart.
  [378.75, 380.48, 372.95], // Then your molecules.
  [385.93, 391.46, 379.66], // And one ten-billionth of a billionth of a second before the end, yo...
  [418.40, 422.39, 394.03], // That's the Big Rip. It might be twenty-two billion years away.
  [422.43, 426.35, 399.21], // Some new measurements even hint it might never happen.
  [427.00, 428.77, 403.38], // Scientists still don't know.
  [429.74, 434.47, 405.64], // So, which ending of the universe should I simulate next? Tell me in...
];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
