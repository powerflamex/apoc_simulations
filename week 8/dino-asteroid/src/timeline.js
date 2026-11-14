// "What if the asteroid that killed the dinosaurs hit today?" — the story as functions of VIDEO time v (seconds;
// STORY_START = 0). The same rock as 66 million years ago (about 6 miles / 10 km wide, ~45,000 mph / 20.1 km/s, coming in
// from the northeast at ~60°: Collins et al. 2020) lands in the same place, the Chicxulub crater on Mexico's Yucatán coast.
// You are on Canal Street in New Orleans, at the river, 592 miles (952 km) due north (physics.mjs, CAPTIONS.md).
// Every number below is from physics.mjs / the Imperial College "Impact: Earth!" calculator (Collins, Melosh & Marcus 2005)
// run for this rock at this distance:
//   - the rock sinks below your horizon 3.87 s before it hits (the ground there is 71 km below your horizon); it enters
//     the air (~100 km up) 5.7 s before;
//   - the fireball: brightest 6.55 s after; its heat 30.6x sunlight for 28.5 minutes (clothing, grass and trees ignite);
//   - the quake: magnitude 9.8 (bigger than any recorded), arriving 3 min 10 s after; here it only rocks cars and rattles
//     windows (Mercalli IV-V), and that is all the video shows;
//   - the rocks thrown out of the crater: arriving 8 min after (mostly gravel, a few bigger pieces), 26 cm deep in all;
//     they come back in at ~3 km/s and glow (air at their nose ~4,000 K);
//   - the air blast: arriving 48 min 14 s after; 15 psi, wind 405 mph.
// What is drawn vs real (CAPTIONS.md): the rock is drawn ~20x wider than it would look (true: 0.6°, a dot) and its path
// 12x higher / 4x wider in the sky, so it reaches the horizon at the true moment; after the impact the clock is a
// time-lapse (the counter says so); the fireball and the sky are drawn at their real size; the dust wall is taller than
// the real shock would raise.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const CAM_Z = 8;                  // where you stand (layout.js)
export const LOOP = 0.9;
export const MILE = 1609.344;

// ---- the physics ----
export const D_KM = 952, D_MI = 592;
export const V_IMPACT = 5.3;             // frame 0 is 5.30 s before the impact (the rock is already in the air)
export const T_ENTRY = -5.74, T_SINK = -3.87;   // (s, real) into the air at 100 km; below your horizon
export const T_QUAKE = 190, T_EJECTA = 480, T_BLAST = 2894;   // 3:10, 8:00, 48:14 after
export const BLAST_KMS = D_KM / T_BLAST;  // the front's mean speed (the calculator's arrival time)

// real seconds since the impact, against video time: real time until just after the impact, then a time-lapse that
// slows down again for the last seconds of the blast (monotone cubic through the keys)
const TK = [
  [-3, -8.3], [0, -5.3], [5.3, 0], [6.3, 1.0], [7.3, 3.0], [8.3, 7.0], [9.6, 17], [11, 38], [13, 95], [15.8, T_QUAKE],
  [18, 300], [20.2, T_EJECTA], [22.4, 640], [24.4, 930], [26.4, 1600], [28.2, 2803], [33.0, 2869.7], [37.0, 2884.9],
  [46.1, T_BLAST], [48, T_BLAST + 1.9],
];
const MC = (() => {
  const n = TK.length, x = TK.map((k) => k[0]), y = TK.map((k) => k[1]);
  const dk = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) dk.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = dk[0]; m[n - 1] = dk[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (3 * (dk[i - 1] + dk[i])) / ((2 * dk[i] + dk[i - 1]) / dk[i - 1] + (dk[i] + 2 * dk[i - 1]) / dk[i]);
  return { x, y, m };
})();
export function realT(v) {
  const { x, y, m } = MC, n = x.length;
  if (v <= x[0]) return y[0] + (v - x[0]) * m[0];
  if (v >= x[n - 1]) return y[n - 1] + (v - x[n - 1]) * m[n - 1];
  let i = 0;
  while (v > x[i + 1]) i++;
  const h = x[i + 1] - x[i], t = (v - x[i]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
}
export const rate = (v) => (realT(v + 0.05) - realT(v - 0.05)) / 0.1;
// the blast front: km still to go (a straight wall this far out)
export const frontKm = (T) => Math.max(0, (T_BLAST - T) * BLAST_KMS);

// ---- the rock in your sky (degrees; az 0 = straight down the avenue, toward the crater; + right) ----
// true elevation and offset (left of the crater) against T, from physics.mjs (60° from azimuth 35°)
const PATH = [[-9.19, 6.18, 3.73], [-8.04, 4.82, 3.23], [-7.18, 3.81, 2.86], [-5.74, 2.14, 2.26], [-4.6, 0.83, 1.79], [-3.87, 0, 1.5], [0, -4.4, 0]];
function pathAt(T) {
  if (T <= PATH[0][0]) { const a = PATH[0], b = PATH[1], k = (T - a[0]) / (b[0] - a[0]); return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  for (let i = 0; i < PATH.length - 1; i++) if (T <= PATH[i + 1][0]) { const a = PATH[i], b = PATH[i + 1], k = (T - a[0]) / (b[0] - a[0]); return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  return [-4.4, 0];
}
export const ART_EL = 12, ART_AZ = 4, ROCK_DEG = 12;
export function rockSky(T) {
  const [el, left] = pathAt(T);
  const [el2, left2] = pathAt(T + 0.05);
  return {
    el: el * ART_EL, az: -left * ART_AZ, deg: ROCK_DEG,
    // its direction of travel on the sky (degrees per second)
    del: (el2 - el) / 0.05 * ART_EL, daz: -(left2 - left) / 0.05 * ART_AZ,
    // into the air: the flames grow from 100 km down
    hot: smooth(T_ENTRY + 0.25, T_ENTRY + 2.0, T),
  };
}

// ---- the fireball (km; centre on the ground at the crater, which is 71 km below your horizon) ----
export const DROP_KM = 71;
// the evening Sun: low in the west-northwest, behind your right shoulder (you face south)
export const SUN_AZ = 88, SUN_EL = 20;
const FB = [[0, 8], [0.5, 40], [1.5, 80], [3.5, 120], [6.55, 150], [20, 195], [60, 260], [190, 370], [480, 540], [900, 680], [3000, 760]];
const lin = (K, T) => { if (T <= K[0][0]) return K[0][1]; for (let i = 0; i < K.length - 1; i++) if (T <= K[i + 1][0]) { const a = K[i], b = K[i + 1]; return lerp(a[1], b[1], (T - a[0]) / (b[0] - a[0])); } return K[K.length - 1][1]; };
export const fireballKm = (T) => (T <= 0 ? 0 : lin(FB, T));
// its heat (1 white .. 0 cold): white-hot at first, yellow at its brightest, orange after a minute, deep red after a few
// (drawn a little cooler than the real white glare of the first seconds, so its shape reads: CAPTIONS.md)
export const fireballHeat = (T) => (T <= 0 ? 1.0 : lin([[0, 1.0], [3, 0.9], [6.55, 0.84], [20, 0.78], [60, 0.7], [190, 0.6], [480, 0.5], [1700, 0.42], [3000, 0.34]], T));
// how bright its light on the street is (sunlight = 1 for the street lights' sake, not the 30x heat)
export const fireballLight = (T) => (T <= 0 ? 0 : lin([[0, 0], [0.15, 3.2], [1.2, 2.2], [6.55, 2.4], [30, 1.6], [190, 1.1], [600, 0.8], [1710, 0.55], [3000, 0.4]], T));

// ---- the beats (video time) ----
export const V_FLAME = 0.0;           // already in the air on frame 0: its flames are growing
export const V_SINK = V_IMPACT - 3.87;  // its middle reaches the horizon (true moment, T = -3.87 s)
export const V_FLASH = V_IMPACT;      // the impact: the flash
export const V_RISE = 7.6;            // the fireball is over the horizon, taller than any mountain
export const V_SMOKE = 9.6;           // the palms start to smoke in the heat
export const V_RUN = 10.4;            // everyone runs for cover
export const V_TREES = 12.8;          // the palms catch fire
export const V_QUAKE = 15.8;          // the quake arrives (3:10)
export const V_EJECTA = 20.2;         // the rocks arrive (8:00)
export const V_RED = 24.2;            // the sky is red-hot
export const V_CARS = 26.2;           // the cars catch fire
export const V_WALL = 28.2;           // the dust wall shows on the horizon (30 km off); it grows every second from here
export const V_REAL = 37.0;           // from here on real time: the front is 3 km off, crossing the far bank
export const V_FALL = 40.0;           // it flattens the far bank's city
export const V_RIVER = 43.9;          // it reaches the river (728 m off)
export const V_HIT = 46.1;            // it reaches you (48:14)
export const T_SWITCH = V_HIT + 0.35; // full white: the loop point
export const VIDEO_DURATION = T_SWITCH + LOOP;
// the hits (camera kick + boom in the soundtrack)
export const HITS = [V_SINK, V_FLASH, V_RISE, V_TREES, V_QUAKE, V_EJECTA, V_RED, V_CARS, V_WALL, V_FALL, V_RIVER];

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_FLASH + 0.1, 'IT HITS MEXICO'],
  [V_RISE, 'TALLER THAN ANY MOUNTAIN'],
  [V_TREES + 0.1, 'THE TREES CATCH FIRE'],
  [V_QUAKE + 0.1, 'THE GROUND SHAKES'],
  [V_EJECTA + 0.1, 'ROCKS RAIN FROM THE SKY'],
  [V_RED + 0.1, 'THE SKY TURNS RED-HOT'],
  [V_CARS + 0.1, 'CARS CATCH FIRE'],
  [V_FALL, 'IT FLATTENS EVERYTHING'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together) ----
export const CAPTIONS = [
  [3.42, 5.32, `You’re in New Orleans, ${D_MI} miles away.`],
  [9.5, 12.85, 'Its heat: 30 times stronger than sunlight.'],
  [17.95, 20.25, 'Magnitude 9.8: the biggest quake ever.'],
  [21.95, 24.25, 'Thrown out of Mexico 8 minutes ago.'],
  [28.5, 32.6, 'The blast takes 48 minutes to get here.'],
  [34.6, 38.9, 'The wind behind it: 400 mph.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.2);
      const fadeOut = clamp((b - v) / 0.2);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: the impact racing in hundredths; then the blast's countdown (a time-lapse) and how far off it is ----
const mmss = (s) => { s = Math.max(0, Math.ceil(s - 1e-6)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export function counterAt(v) {
  const T = realT(v);
  if (T < 0) return { label: 'IMPACT IN', value: `${(-T).toFixed(2)} s`, line: '45,000 MPH' };
  const left = Math.max(0, T_BLAST - T), km = frontKm(T), mi = km * 1000 / MILE;
  // minutes racing down (a time-lapse); hundredths race too in the last minute
  const value = left >= 60 ? mmss(left) : `0:${left.toFixed(2).padStart(5, '0')}`;
  return { label: 'THE BLAST REACHES YOU IN', value, line: mi >= 10 ? `${Math.round(mi)} MILES AWAY` : `${mi.toFixed(1)} MILES AWAY` };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.T = realT(v);
  s.title = 1 - smooth(2.9, 3.35, v);
  s.rock = rockSky(s.T);
  s.fbKm = fireballKm(s.T);
  s.fbHeat = fireballHeat(s.T);
  s.fbI = fireballLight(s.T);
  // the glow behind the horizon while the rock ploughs down through the thick air out of sight
  s.under = smooth(V_SINK - 0.3, V_IMPACT, v) * (1 - smooth(V_IMPACT, V_IMPACT + 0.2, v));
  // the flash: blinding for a moment, then the fireball's own light
  s.flash = v >= V_FLASH ? Math.exp(-(v - V_FLASH) / 0.35) : 0;
  s.flashIn = smooth(V_FLASH - 0.05, V_FLASH, v) * (v < V_FLASH + 1 ? 1 : 0);
  // the heat on everything that faces the fireball (K): ~850 K is where 30x sunlight levels off
  s.heatK = 300 + 550 * smooth(V_IMPACT + 0.5, 20, v) * (1 - 0.4 * smooth(33, 40, v));
  s.smoke = smooth(V_SMOKE, V_TREES + 3, v);
  s.quake = v > V_QUAKE - 0.3 ? smooth(V_QUAKE - 0.3, V_QUAKE + 0.3, v) * (1 - smooth(V_QUAKE + 2.6, V_QUAKE + 4.4, v)) : 0;
  s.ejecta = smooth(V_EJECTA - 0.6, V_EJECTA + 1.5, v);
  s.red = smooth(V_EJECTA + 1.5, V_RED + 0.8, v);
  // the blast front: metres from you (the picture runs on this one number)
  s.frontM = frontKm(s.T) * 1000;
  s.wall = smooth(V_WALL - 0.8, V_WALL + 1.0, v);
  s.white = smooth(V_HIT - 0.06, V_HIT + 0.12, v);
  return s;
}
export { lerp };
