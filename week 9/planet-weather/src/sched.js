// When things happen inside each stop (seconds after that stop's wipe starts), shared by the picture and the sound.
import { smooth, clamp } from './util.js';
import { LAND } from './timeline.js';

// Jupiter (its wipe is at -1.6 s, so frame 0 is 1.6 s in): lightning. who: 'far' (in the storm wall), 'sea' (into the
// water in front of you), 'you' (your umbrella's tip)
export const STRIKES = [
  { t: 1.35, who: 'far', seed: 0.11, x: -2600, z: 300 },
  { t: 1.72, who: 'sea', seed: 0.23, x: -170, z: 30 },
  { t: 2.55, who: 'far', seed: 0.37, x: -3200, z: -900 },
  { t: 3.5, who: 'far', seed: 0.41, x: -2000, z: -350 },
  { t: 4.9, who: 'you', seed: 0.53 },
  { t: 6.15, who: 'sea', seed: 0.67, x: -95, z: -28 },
  { t: 7.3, who: 'sea', seed: 0.79, x: -120, z: -60 },
];
export const JUP_RAIN = 6.4;           // the rain curtain reaches the beach
export const strikeK = (tt, t) => {    // a strike's brightness: leader, the return stroke, two re-strikes
  const d = tt - t;
  if (d < -0.06 || d > 0.42) return 0;
  if (d < 0) return 0.25 * (1 + d / 0.06);
  return Math.exp(-d / 0.05) + 0.7 * Math.exp(-Math.max(0, d - 0.12) / 0.04) * (d > 0.12 ? 1 : 0) + 0.45 * Math.exp(-Math.max(0, d - 0.26) / 0.04) * (d > 0.26 ? 1 : 0);
};
// Mars: the dust wall's distance from the camera (m): it rolls in from ~330 m out, slowing as it nears, and swallows you at ~3.6 s
export const marsR = (tt) => 3 + 330 * Math.pow(Math.max(0, 1 - tt / 3.65), 1.6);
export const MARS_FROST = 4.3;          // the dust thins and the frost comes
// Venus: the umbrella catches fire
export const VEN_FIRE = 2.6;
// Titan: the sea starts to freeze from the shore
export const TIT_FREEZE = 2.9;
// Saturn: your umbrella flips inside out, then is torn from your hand
export const SAT_FLIP = 0.35, SAT_RIP = 2.85;
// Neptune: the umbrella shreds; you're lifted off your feet; the pier and wheel go; the white-out
export const NEP_SHRED = 0.25, NEP_LIFT = 7.0, NEP_PIER = 5.0;
export const nepWhite = (tt) => smooth(9.3, 12.0, tt);
export { LAND };
