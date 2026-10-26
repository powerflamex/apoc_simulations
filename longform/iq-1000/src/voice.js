// The owner's narration (voice.m4a, one take, Oct 25) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s), what he says].
// Cut points sit in the pauses between sentences (found from the loudness, checked by transcribing each cut alone).
// His restarts are skipped: the second "...and catch it", "To everyone else...", "Your mind is racing now..." (the
// third try), "And the sound is sinking...", "The fountain..." and "And your IQ?...". Lines he read in one breath stay
// in one cut ("Smarter than Einstein, the smartest person on Earth"; "And your IQ? ... iqmaxx dot ing").
// The picture is timed to his words: the popups land on them, the catch on "catch", the doubling starts on "Now it
// starts doubling".
export const VOICE = [
  [2.94, 7.45, 0.50, 'In four minutes, you\'ll be a thousand times smarter than anyone who ever lived.'],
  [9.09, 13.82, 6.30, 'You just took an IQ test on iqmaxx dot ing. A hundred. Exactly average.'],
  [14.12, 17.15, 11.00, 'Now it starts doubling, and your brain speeds up with it.'],
  [17.44, 20.66, 15.60, 'Smarter than Einstein, the smartest person on Earth.'],
  [21.03, 23.25, 19.50, 'And the world slows down.'],
  [23.86, 27.10, 23.00, 'Look at them. Everyone\'s moving in slow motion.'],
  [27.64, 28.69, 27.00, 'Here comes the rain.'],
  [29.06, 30.32, 32.20, 'Even the rain is slow.'],
  [30.89, 33.67, 35.00, 'You understand every language now, just from listening.'],
  [34.54, 35.58, 42.50, 'Then you see it.'],
  [36.53, 42.18, 44.00, 'The kid\'s going to lose his ball. He\'ll chase it into the street. And that car won\'t stop in time.'],
  [43.08, 47.71, 51.00, 'You saw it three seconds early. For you, that\'s twenty seconds.'],
  [48.12, 49.50, 57.00, 'Enough time to walk over...'],
  [57.95, 58.95, 62.90, '...and catch it.'],
  [66.82, 69.92, 67.00, 'To everyone else, you just reached out and caught a ball.'],
  [89.85, 94.98, 76.00, 'Your mind is racing now. You could crack math problems nobody has solved in a hundred years.'],
  [95.70, 98.98, 82.50, 'The pigeons take off. You can count every wingbeat.'],
  [103.22, 105.05, 92.00, 'But your body doesn\'t speed up.'],
  [105.39, 109.82, 94.20, 'You try to say hi to the kid. One word takes more than ten seconds.'],
  [110.21, 112.38, 99.50, 'Even moving your eyes takes seconds.'],
  [112.75, 115.74, 105.00, 'Every guitar string, swinging in slow motion.'],
  [121.73, 127.00, 124.00, 'And the sound is sinking. Voices turn into a rumble. Then lower. Then...'],
  [129.32, 130.40, 133.60, 'Silence.'],
  [131.21, 135.15, 136.00, 'All you can feel is your heart. About one beat a minute.'],
  [138.78, 142.08, 140.20, 'The rain isn\'t falling anymore. It\'s just hanging there.'],
  [142.87, 146.29, 144.30, 'And you know this street so well, you can picture it from anywhere.'],
  [147.24, 149.00, 160.00, 'Then, something moves.'],
  [149.31, 151.70, 169.00, 'Lightning. Crawling down the sky.'],
  [155.26, 157.97, 181.50, 'The thunder? It\'s still minutes away.'],
  [161.52, 164.55, 186.50, 'Every person in the city, stopped mid-step,'],
  [164.98, 166.86, 190.00, 'but all this thinking costs something.'],
  [167.34, 171.31, 193.00, 'Your brain normally runs on twenty watts. Now it\'s burning thousands.'],
  [171.61, 172.79, 198.60, 'And it\'s heating up.'],
  [178.10, 180.52, 202.00, 'The fountain, frozen in midair.'],
  [181.03, 186.40, 210.50, 'Five hundred times faster. Ten thousand watts. Like ten space heaters inside your head.'],
  [186.86, 188.90, 229.00, 'And the kid, still waiting for his ball.'],
  [191.18, 193.62, 249.50, 'A thousand times smarter than anyone.'],
  [194.06, 196.66, 253.00, 'One second feels like seventeen minutes.'],
  [197.18, 200.58, 257.00, 'A soap bubble pops in front of you, and it takes half a minute.'],
  [201.62, 204.13, 263.00, 'Your heart beats once every fourteen minutes.'],
  [204.40, 211.97, 268.00, 'Your brain is at thirty-eight degrees. In seventeen more minutes, it cooks. In real time, that\'s one second.'],
  [215.50, 220.21, 278.50, 'You could stay up here, alone, in a frozen world. Or you could go.'],
  [223.59, 226.25, 295.50, 'Everything you saw took about thirty seconds.'],
  [226.48, 229.12, 299.00, 'Nobody noticed a thing. Except the kid.'],
  [236.72, 242.45, 305.50, 'And your IQ? Back to a hundred. Want to know your real one? Take the test at iqmaxx dot ing.'],
  [242.57, 246.91, 318.50, 'So, what would you do with a thousand times your IQ? Tell me in the comments.'],
];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
