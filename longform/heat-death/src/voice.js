// The owner's narration (voice.m4a, one take) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s)].
// Cut points sit in the pauses between sentences (found from a word-by-word transcript and the loudness).
// His take (Oct 25, one file): his restarts dropped (the second try kept for "Then the stars start going out",
// "Every so often, two dead stars crash", "Everything falling in heats up and glows", "Imagine you're somehow still
// here", "When there's nothing left..."). Lines he read close together keep his own pause; the picture moves to his words.
export const VOICE = [
  [2.20, 5.72, 0.50],   // In five minutes, you'll watch the last light in the universe go out.
  [7.22, 10.46, 6.40],   // Imagine you could stand right here, and watch the universe die.
  [11.20, 14.56, 10.38],   // Five billion years from now, the Sun swells into a red giant,
  [15.20, 16.40, 14.74],   // 200 times bigger,
  [16.95, 22.80, 18.34],   // then it blows off its outer layers and all that's left is a white dwarf, the size of Earth.
  [23.66, 24.92, 25.69],   // This is daytime now.
  [25.55, 28.56, 28.15],   // Earth freezes, minus 230 degrees.
  [28.92, 31.05, 31.52],   // Even the air freezes and falls as snow.
  [35.80, 39.66, 38.40],   // Meanwhile, space keeps stretching, faster and faster.
  [40.30, 41.42, 42.90],   // Look through the telescope.
  [41.88, 44.98, 44.48],   // Every year, that galaxy gets redder and fainter,
  [45.48, 46.34, 48.08],   // until it's gone.
  [47.42, 51.05, 50.54],   // In two trillion years, every other galaxy is gone from the sky.
  [61.95, 63.64, 55.77],   // Then the stars start going out.
  [64.05, 65.50, 58.66],   // The big, bright ones first.
  [65.80, 69.56, 61.71],   // Then the small, red ones that burn for trillions of years.
  [70.60, 73.62, 67.07],   // A hundred trillion years from now, the last star goes out.
  [78.80, 82.32, 74.89],   // Our sun fades too, red, then black.
  [86.75, 88.92, 80.21],   // But it's not completely dark.
  [95.55, 98.54, 83.58],   // Every so often, two dead stars crash.
  [99.10, 101.68, 88.37],   // And for a moment, there's light again.
  [103.05, 107.94, 92.15],   // Over billions of billions of years, the rest fall into the black hole at the center of the galax
  [108.70, 110.38, 98.64],   // Imagine Earth falls in with them.
  [116.40, 119.60, 103.32],   // Everything falling in heats up and glows.
  [121.60, 123.34, 108.12],   // The last fire in the galaxy.
  [127.55, 129.80, 114.07],   // And then, even atoms might fall apart.
  [130.55, 133.80, 117.12],   // 10 to the 40 years from now, every atom is gone.
  [134.45, 136.28, 121.07],   // Earth just evaporates,
  [136.80, 137.72, 123.42],   // and so would you.
  [147.90, 151.00, 129.74],   // Imagine you're somehow still here, floating in the dark.
  [153.30, 156.16, 134.44],   // Now, the only things left are black holes,
  [156.62, 159.96, 137.76],   // even they leak very slowly and evaporate.
  [162.95, 164.36, 142.50],   // The small ones go first.
  [165.00, 168.30, 146.51],   // Ours ate so much, it lasts a googol years.
  [168.70, 171.30, 150.41],   // That's a one, with a hundred zeros.
  [173.05, 176.00, 154.61],   // As it shrinks, it gets hotter, and brighter.
  [176.75, 177.42, 158.36],   // Until...
  [180.05, 182.00, 164.03],   // That was the last light in the universe.
  [182.38, 185.98, 166.38],   // No stars. No planets. Not even atoms.
  [186.85, 190.56, 170.88],   // Just cold, dark, empty space. Forever.
  [191.60, 193.52, 175.63],   // This is the heat death.
  [198.60, 199.40, 181.75],   // Unless.
  [200.90, 204.72, 183.75],   // Roger Penrose, who won a Nobel Prize, has a wild idea.
  [209.60, 213.36, 188.77],   // When there's nothing left, there's no way to tell huge from tiny.
  [213.85, 219.00, 193.02],   // So the end of everything... could be the start of a brand new Big Bang.
  [223.90, 225.42, 203.37],   // That's the heat death.
  [226.05, 229.00, 205.52],   // Most scientists think this is how our universe really ends,
  [229.40, 232.92, 208.87],   // not with a rip or a crunch. It just fades out.
  [234.55, 239.55, 213.59],   // So which ending scares you the most? The big rip, the big crunch, or this one?
  [240.00, 241.00, 219.04],   // Tell me in the comments.
];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
