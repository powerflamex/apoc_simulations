// The whole story as functions of time (seconds, 0..80).
import { smooth, keys, lerp, clamp, DEG } from './util.js';

export const DURATION = 80;
// the video starts this far into the story, so the counter is already racing on the first frame
export const STORY_START = 12.0;
// The video loops: at T_SWITCH the screen is fully white (the final flash), the scene jumps back to just
// before the first frame, and the flash clears into it over the last LOOP seconds, so the last frame runs
// straight into the first. (No end card: a black screen at the end makes people swipe away.)
export const T_SWITCH = 76.0;
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH - STORY_START + LOOP;

// Narration (italic serif, lower middle). [start, end, text]
export const CAPTIONS = [
  [13.0, 17.2, 'A black hole is passing through the solar system.'],
  [17.6, 21.6, "It gives off no light. You can't see it coming."],
  [22.0, 24.8, 'Only the stars around it bend.'],
  [25.2, 30.2, "It's heading straight for the Moon."],
  [30.8, 37.4, 'The Moon is torn into a glowing ring.'],
  [38.4, 44.0, 'The ocean leans toward it.'],
  [44.8, 50.6, 'You start to feel lighter.'],
  [51.4, 57.4, "Everything that isn't bolted down falls up."],
  [58.4, 64.4, 'The horizon peels up into the sky.'],
  [65.4, 71.2, 'Then your building lets go.'],
];

// Counter segments: label / unit / value(t) / formatter.
const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
const fmtG = (v) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'));
export const COUNTERS = [
  {
    from: 0.0, to: 39.6, label: 'BLACK HOLE', unit: 'MILES AWAY', fmt: fmtInt,
    value: (t) => keys([[0, 92_960_000], [14, 21_400_000], [27, 2_380_000], [34, 238_900], [40, 61_200]], t, true),
  },
  {
    from: 39.6, to: 55.0, label: 'YOUR WEIGHT', unit: 'POUNDS', fmt: fmtInt,
    value: (t) => lerp(160, 0, smooth(41.5, 53.2, t)),
  },
  {
    from: 55.0, to: 67.6, label: 'PULLED UPWARD', unit: "× EARTH'S GRAVITY", fmt: fmtG,
    value: (t) => keys([[55, 0], [57, 0.4], [61, 2.6], [67.6, 41]], t, false),
  },
  {
    from: 67.6, to: 76.2, label: 'YOUR ALTITUDE', unit: 'FEET', fmt: fmtInt,
    value: (t) => keys([[67.6, 124], [70, 180], [73, 2_600], [76.2, 38_000]], t, true),
  },
];

// Scene state at time t.
export function state(t) {
  const s = {};
  s.t = t;

  // Sky: dusk -> night.
  s.night = lerp(0.18, 1.0, smooth(0, 34, t));
  s.starVis = lerp(0.25, 1.0, smooth(3, 26, t));

  // Black hole: direction (rises slowly) and virtual distance in Schwarzschild radii.
  s.bhEl = keys([[0, 11], [40, 13], [64, 17], [76, 22]], t) * DEG;
  s.bhAz = keys([[0, 2.5], [76, 0]], t) * DEG;
  s.bhD = keys([[0, 9000], [10, 4200], [22, 1100], [34, 280], [48, 85], [60, 40], [70, 26], [76, 14]], t, true);

  // Moon: starts up-left, gets pulled into the hole and shredded.
  s.moonProgress = Math.pow(smooth(16, 35.5, t), 1.8);
  s.moonStretch = smooth(25, 35, t);
  s.moonFade = 1 - smooth(33.0, 37.0, t);

  // Accretion disk made from the Moon.
  s.disk = smooth(32.5, 40, t) * keys([[32, 0.5], [40, 0.7], [60, 0.85], [72, 1.0], [76, 1.4]], t);

  // Earth effects.
  s.tide = smooth(37.5, 52, t);                 // ocean rises toward the hole
  s.spike = 0;                   // water column pulled into the sky
  s.weight = 1 - smooth(41.5, 53.2, t);         // felt gravity (1 -> 0)
  s.curl = Math.pow(smooth(55.5, 69, t), 1.25);  // horizon peels up
  s.lightsOut = smooth(57, 64, t);               // city power fails
  s.quake = smooth(36, 46, t) * 0.5 + smooth(52, 70, t) * 1.2;
  s.lift = smooth(66, 76, t);                    // the camera's building lets go

  // Post.
  s.title = 1 - smooth(STORY_START + 3.0, STORY_START + 3.8, t);   // fully up on the first frame
  s.flash = smooth(74.4, 76.0, t);
  s.endcard = t >= 76.0 ? 1 : 0;
  s.endText = smooth(76.7, 77.8, t);
  s.exposure = lerp(1.0, 0.85, smooth(0, 30, t)) * (1 + 0.25 * smooth(71, 75.8, t));
  return s;
}

export function captionAt(t) {
  for (const [a, b, text] of CAPTIONS) {
    if (t >= a - 0.01 && t <= b + 0.01) {
      const fadeIn = clamp((t - a) / 0.55);
      const fadeOut = clamp((b - t) / 0.55);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}
