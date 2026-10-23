// The owner's narration (voice.m4a, one take) cut into lines and placed on the video clock.
// Each entry: [start in the recording (s), end in the recording (s), video time it plays at (s)].
// Cut points sit in the pauses between sentences (found from a word-by-word transcript and the loudness).
// The silences in between are the big moments: Andromeda's stars pouring through ours, the galaxies crashing, Earth
// boiling away, all of space squeezed into one point.
// The take (Oct 22, one file, read along): his restarts dropped (the second try kept: "Our Sun...", "Point a
// telescope...", "nowhere to hide from it", "the last time it looked like this"). The opening is timed to it: the
// universe stops on "it stops", is crushed as he finishes "one single point", and the new Big Bang goes off on
// "explodes".
export const VOICE = [
  [2.67, 7.32, 0.50],   // In seven minutes, the whole universe is going to fall in on you.
  [8.34, 10.82, 6.40],   // This is the Big Crunch.
  [12.50, 15.18, 9.30],   // Every galaxy is flying away from us.
  [15.84, 18.54, 12.60],   // In eleven billion years, it stops.
  [19.21, 21.52, 15.60],   // And everything falls back in.
  [21.87, 24.67, 18.21],   // Crushed into one single point.
  [27.00, 30.42, 22.00],   // And then, maybe, it all explodes again.
  [31.01, 34.54, 26.60],   // A brand-new Big Bang. A whole new universe.
  [43.86, 47.64, 31.40],   // In 2025, scientists looked at new measurements of the universe.
  [47.64, 51.06, 36.20],   // And found the growing is already slowing down.
  [51.71, 55.46, 40.10],   // Their guess for the crunch: about twenty billion years from now.
  [59.90, 62.05, 45.30],   // Our Sun will be long gone by then.
  [62.91, 66.34, 49.20],   // But imagine Earth is still here, just like tonight.
  [67.79, 71.71, 55.00],   // And imagine you could stand right here, and watch the whole thing.
  [77.41, 79.90, 60.00],   // The first thing you'd notice isn't the crunch.
  [79.90, 81.73, 62.80],   // It's Andromeda.
  [82.34, 85.68, 64.93],   // Our biggest neighbor galaxy is already falling toward us.
  [86.39, 88.42, 68.57],   // Every night, it's a little bigger.
  [89.07, 91.01, 70.90],   // Then it fills half the sky.
  [92.61, 96.44, 77.00],   // In the next few billion years, it crashes right into the Milky Way.
  [97.84, 101.10, 83.00],   // Hundreds of billions of stars, pouring through each other.
  [101.10, 104.06, 87.40],   // And almost none of them actually hit.
  [107.46, 111.96, 94.50],   // The two galaxies just melt into one giant ball of stars.
  [117.25, 118.79, 100.50],   // Nine billion years left.
  [119.53, 121.69, 102.80],   // This is where everything changes.
  [125.40, 133.50, 105.50],   // Point a telescope at any far-off galaxy. For billions of years, its ligh
  [133.50, 137.06, 113.90],   // That's what light does when something is flying away from you.
  [137.54, 139.84, 119.10],   // Now, slowly, it turns white.
  [139.84, 141.36, 122.30],   // Then blue.
  [141.36, 143.70, 124.12],   // Blue means it's coming back.
  [143.70, 149.50, 126.76],   // The universe has stopped growing. And every galaxy out there is now fall
  [155.54, 156.65, 135.00],   // A billion years left.
  [157.36, 159.11, 137.30],   // The night sky starts filling up.
  [159.55, 163.24, 140.40],   // Galaxies everywhere. Bigger every night. Brighter.
  [163.80, 167.77, 145.10],   // A hundred million years left, they crash into each other. All of them.
  [172.84, 174.87, 153.50],   // There's no more dark space left in the sky.
  [176.27, 179.20, 159.00],   // And now, something strange happens to the night.
  [180.40, 184.71, 163.30],   // Space has always been freezing. Minus two hundred and seventy degrees.
  [185.34, 189.79, 168.50],   // That's the leftover heat of the Big Bang, spread out so thin it's almost
  [194.25, 200.74, 175.90],   // But now space is getting smaller. And that old heat is getting squeezed 
  [202.23, 206.26, 182.70],   // Sixteen million years left, the night sky is warmer than ice.
  [207.95, 211.56, 188.50],   // Fifteen million years left, it's as warm as a summer evening.
  [212.62, 214.32, 193.70],   // You'd never need a jacket again.
  [215.01, 216.06, 196.80],   // And it doesn't stop.
  [217.69, 221.10, 200.10],   // Ten million years left, the sky is hotter than boiling water.
  [221.84, 223.13, 205.90],   // The oceans boil away.
  [223.59, 226.43, 208.20],   // Not because of the Sun. Because of the sky.
  [233.13, 234.42, 214.00],   // Three million years left.
  [235.03, 236.46, 216.30],   // The night sky starts to glow.
  [237.07, 239.61, 219.40],   // Dull red. Like the inside of an oven.
  [249.46, 253.60, 223.30],   // And it's the same in every direction. There's nowhere to hide from it.
  [255.78, 259.61, 231.00],   // One million years left. The sky is over a thousand degrees.
  [261.03, 263.73, 236.10],   // The ground starts to glow. Then it melts.
  [264.43, 267.21, 240.00],   // The city goes first. Then the rock under it.
  [268.46, 272.02, 244.00],   // Imagine you're somehow still here, floating over a sea of lava.
  [274.23, 275.89, 251.00],   // Four hundred thousand years left.
  [276.47, 279.82, 253.70],   // The sky is so hot, it starts tearing atoms apart.
  [280.87, 284.15, 258.40],   // And you can't see the galaxies anymore. You can't see anything.
  [284.86, 287.14, 263.60],   // The whole universe turns into a fog of fire.
  [289.82, 294.65, 268.00],   // The last time it looked like this was right after the Big Bang.
  [299.74, 301.29, 276.00],   // A hundred thousand years left.
  [301.99, 304.67, 278.70],   // The sky is now hotter than the surface of the Sun.
  [305.57, 306.51, 284.00],   // Look for the Sun.
  [307.01, 312.42, 286.40],   // It's gone. Not because it died. Because the sky around it is just as bri
  [314.77, 320.02, 293.30],   // Stars can't get rid of their heat anymore. So they boil away, from the o
  [320.99, 322.56, 300.60],   // Earth goes the same way.
  [329.70, 331.20, 307.00],   // Three minutes left.
  [332.36, 337.32, 308.90],   // Right after the Big Bang, it took about three minutes for the centers of
  [337.83, 339.75, 317.40],   // Now it happens backwards.
  [340.28, 342.50, 319.62],   // The center of every atom gets smashed apart.
  [351.47, 356.80, 323.60],   // Every atom in you. Every atom in Earth. Every atom that ever existed.
  [360.75, 363.62, 331.00],   // One hundred-thousandth of a second left.
  [364.42, 370.39, 334.17],   // Even the pieces of atoms melt, into a soup of the tiniest things there a
  [371.25, 376.24, 340.44],   // And all of space, everything that ever existed, squeezes into one point.
  [380.34, 383.42, 350.60],   // And then, maybe, it bursts out again.
  [384.08, 385.40, 354.10],   // A new Big Bang.
  [387.89, 389.66, 358.00],   // That's the Big Crunch.
  [390.00, 392.85, 360.30],   // One study says it's about twenty billion years away.
  [393.20, 400.96, 364.60],   // But a lot of scientists think the universe will never crunch. That it'll
  [401.60, 406.00, 374.40],   // That ending is even stranger. And it's the one I'm simulating next.
  [406.59, 410.52, 380.00],   // So, which ending would you rather live through? Tell me in the comments.
];
// is the voice speaking at video time v (with a little lead-in and tail, for ducking the music)
export function voiceAt(v, pre = 0.25, post = 0.5) {
  for (const [a, b, at] of VOICE) if (v > at - pre && v < at + (b - a) + post) return true;
  return false;
}
