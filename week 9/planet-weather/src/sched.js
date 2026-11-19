// When things happen inside each stop (seconds after that stop's wipe starts), shared by the picture and the sound.
// Every stop: the first hit within ~1 s of its wipe, a second, bigger beat ~3 s in.
import { smooth, clamp, lerp } from './util.js';
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
export const JUP_RUN = 1.9;            // after the first strike in the sea the crowd turns and runs
export const JUP_RAIN = 6.4;           // the rain curtain reaches the beach
export const strikeK = (tt, t) => {    // a strike's brightness: leader, the return stroke, two re-strikes
  const d = tt - t;
  if (d < -0.06 || d > 0.42) return 0;
  if (d < 0) return 0.25 * (1 + d / 0.06);
  return Math.exp(-d / 0.05) + 0.7 * Math.exp(-Math.max(0, d - 0.12) / 0.04) * (d > 0.12 ? 1 : 0) + 0.45 * Math.exp(-Math.max(0, d - 0.26) / 0.04) * (d > 0.26 ? 1 : 0);
};

// Mars: the dust wall's distance from the camera (m). At the wipe it already towers behind the pier (240 m out, the
// Ferris wheel is ~195 m); it swallows the pier at ~0.6 s, the crowd by the water at ~1.1 s and you at ~1.5 s.
export const MARS_R0 = 240;
export const marsR = (tt) => 3 + (MARS_R0 - 3) * (1 - smooth(0.1, 1.55, tt));
// when the wall reaches something f metres ahead of the camera (the inverse of marsR)
export function marsHit(f) {
  const s = clamp(1 - (f - 3) / (MARS_R0 - 3));
  const x = 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3);
  return 0.1 + 1.45 * x;
}
export const MARS_IN = 1.5;            // you're inside it
export const MARS_CLEAR = 2.75;        // the dust drops out of the air
export const MARS_FROST = 3.0;         // the frost front sets off from the waterline and races up the beach to you
export const marsFrostF = (tt) => 34 - 42 * Math.pow(clamp((tt - MARS_FROST) / 1.15), 0.85);   // (distance ahead of the camera)

// Venus: the umbrella is smoking at the wipe and bursts into flames; then the sea boils off in a wall of steam
export const VEN_FIRE = 0.8;
export const VEN_STEAM = 2.9;
export const venLevel = (tt) => 4.2 * smooth(VEN_STEAM - 0.3, VEN_STEAM + 2.6, tt);    // the sea's fall (m)

// Titan: a freeze front races in from the horizon across the sea, wave by wave through the surf, then up the beach
// to you; the frozen umbrella shatters
export const TIT_FZ0 = 0.15, TIT_FZDUR = 2.1, TIT_FZO0 = 2500, TIT_FZP = 3.5;
export const titSeaFront = (tt) => TIT_FZO0 * Math.pow(1 - clamp((tt - TIT_FZ0) / TIT_FZDUR), TIT_FZP);   // metres out from the shore
export const TIT_SHORE = TIT_FZ0 + TIT_FZDUR;                                                            // it reaches the shore
export const titBeachF = (tt) => (tt < TIT_SHORE ? 1e5 : 24 - 30 * clamp((tt - TIT_SHORE) / 0.7));      // then up the beach (f)
export const TIT_RUN = 1.0;             // the crowd sees it coming and runs
export const TIT_SHATTER = 3.2;

// Saturn: your umbrella flips inside out; everyone is knocked flat and slides. Then the second, bigger gust: a wall of
// sand sweeps across the beach from left to right (SAT_GUST0 .. +0.5 s across the frame); where it hits it rips your
// umbrella from your hand and throws you to your knees, rolls the crowd along the sand and tears loose everything left
export const SAT_FLIP = 0.35, SAT_KNOCK = 0.35;
export const SAT_GUST0 = 2.5, SAT_SWEEP = 1.2;     // the front's start, and its speed across the wall sheet (uv per s)
// when the front reaches something at angle a (radians, + to the right of the camera's forward)
export const satFrontT = (a) => SAT_GUST0 + (a / 1.5 + 0.3) / SAT_SWEEP;
export const SAT_RIP = satFrontT(-0.13) + 0.03;    // (you stand 0.13 rad left of centre)
export const SAT_DOWN = SAT_RIP + 0.05;
// Neptune: the umbrella shreds; you're lifted off your feet; the pier and wheel go; the white-out
export const NEP_SHRED = 0.25, NEP_LIFT = 7.0, NEP_PIER = 5.0;
export const nepWhite = (tt) => smooth(9.3, 12.0, tt);
export { LAND };
