// The owner's narration (voice.m4a, one take, Oct 26) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s), what he says].
// He read it in long breaths, so most cuts hold several sentences; cuts only sit in his real pauses (loudness), and
// each one was transcribed on its own. The picture is timed to his words: the cube is solved on "three seconds",
// SOLVED shows on "Solved", the catch lands on "catch", "silence" on the silence, TEN YEARS LATER on "ten years later",
// the rocket lifts off on "leaving for Mars".
export const VOICE = [
  [0.70, 5.42, 0.50, "In four minutes, you'll be a thousand times smarter than anyone who ever lived."],
  [5.50, 23.10, 6.00, "You just took an IQ test on iqmaxx dot ing. A hundred, exactly average. Now it starts doubling. A Rubik's cube? Three seconds. You're the smartest person on Earth, and something strange happens: the world slows down. The guy who hustles everyone at chess?"],
  [24.05, 24.95, 30.20, 'Checkmate.'],
  [27.58, 28.45, 31.40, 'Here comes the rain.'],
  [28.85, 29.92, 32.80, 'Even the rain is slow.'],
  [30.55, 33.08, 35.00, 'You understand every language now, just from listening.'],
  [33.75, 34.45, 42.50, 'Then you see it.'],
  [35.90, 40.24, 44.00, "The kid's gonna lose his ball. He'll chase it into the street, and that car won't stop in time."],
  [40.90, 44.48, 51.00, "You saw it three seconds early. For you, that's twenty seconds."],
  [44.98, 46.20, 57.00, 'Enough time to walk over...'],
  [46.25, 48.55, 61.80, '...and catch it.'],
  [49.40, 50.55, 67.00, 'Nobody even saw you do it.'],
  [51.55, 52.70, 76.00, 'Your mind is racing now.'],
  [53.15, 57.32, 77.40, 'The Riemann hypothesis. Unsolved for over a hundred and sixty years.'],
  [57.75, 59.00, 81.80, 'A million-dollar prize.'],
  [60.35, 61.08, 84.50, 'Solved.'],
  [62.45, 65.18, 91.30, 'The pigeons take off. You can count every wingbeat.'],
  [66.95, 68.43, 97.00, "But your body doesn't speed up."],
  [68.95, 72.62, 99.00, 'You try to say hi to the kid. One word takes more than ten seconds.'],
  [73.25, 75.85, 105.50, 'Every guitar string, swinging in slow motion.'],
  [76.85, 80.82, 112.00, 'So you think instead, about the thing that kills ten million people a year.'],
  [81.40, 82.40, 116.50, 'Cancer.'],
  [83.90, 87.62, 118.50, 'A protein that hunts down cancer cells, and nothing else.'],
  [88.25, 88.95, 124.00, 'Done.'],
  [89.95, 96.36, 128.00, 'And the voice is sinking. Voices turn into a rumble. Then... silence.'],   // (one breath; "voice" is his slip for "sound")
  [97.40, 100.45, 140.20, "The rain isn't falling anymore. It's just hanging there."],
  [100.95, 103.68, 144.30, 'You know this street so well, you can picture it from anywhere.'],
  [104.40, 105.88, 160.00, 'Then, something moves.'],
  [106.60, 108.78, 169.00, 'Lightning. Crawling down the sky.'],
  [112.40, 118.92, 181.50, 'And watching it, you figure out how to build a star. Fusion. Clean energy, for everyone, forever.'],
  [120.80, 125.48, 202.00, 'Then you design the rocket that takes us to Mars, and the path to get it there.'],
  [125.48, 135.98, 220.00, "But all this thinking costs something. Your brain normally runs on twenty watts. Now it's burning ten thousand, like ten space heaters inside your head."],
  [135.98, 138.82, 238.00, 'And the kid, still waiting for his ball.'],
  [138.82, 150.58, 248.80, 'A thousand times smarter than anyone. And now you understand everything: why the universe exists, what came before the Big Bang, all of it.'],
  [150.58, 153.95, 262.50, 'A soap bubble takes half a minute to pop.'],
  [153.95, 161.38, 267.00, "Your brain is at thirty-eight degrees. In seventeen more minutes, it cooks. In real time, that's one second."],
  [163.80, 169.32, 277.50, 'You could stay up here, alone, knowing everything. Or you could let go.'],
  [179.05, 184.20, 294.90, 'You write it all down. And ten years later, the city runs on your fusion rings.'],   // (his second try: the first, at 171 s, stumbles on "fusion" and he says "restart")
  [184.55, 188.92, 302.00, 'Cancer is something people used to get, and your rocket is leaving for Mars.'],
  [190.40, 196.44, 318.50, 'And your IQ? Back to a hundred. Want to know your real one? Take the test at iqmaxx dot ing.'],
  [197.00, 199.95, 326.50, 'So, what would you do with a thousand times your IQ?'],
];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
