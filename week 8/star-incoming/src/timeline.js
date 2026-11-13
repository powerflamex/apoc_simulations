// "What if a star came straight at Earth?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A packed beach at golden hour (Santa Monica, the pier and its Ferris wheel on the right). A real star, Gliese 710
// (0.6 Suns, 0.59 the Sun's width, 9% of its light; it really will pass the solar system in ~1.3 million years, but
// ~10,000-13,000 AU from the Sun, ~80,000x farther than this), comes in on a path that passes 0.15 AU (22 million km) from Earth.
// The numbers (worked out in a 3-body simulation, physics.mjs; see CAPTIONS.md):
//   - its distance from Earth: d(t) = sqrt(0.15^2 + (0.05 AU/day * t)^2) AU (it moves ~85 km/s relative to Earth)
//   - its width in the sky: 0.587 / d  times the Sun's;  its brightness: 0.092 / d^2  times the Sun's
//   - its pull on our seas (tidal force, mass / distance^3): 0.6 * 0.46 / d^3 times the Moon's
//     (the Sun's own tide is 0.46 of the Moon's)
//   - at 0.15 AU the star's tidal pull on the Moon is ~2x Earth's hold on it, and its kick on the Moon (~1.4 km/s) beats
//     the Moon's orbital speed (1.0 km/s): the Moon is torn off its orbit
//   - a pass within 0.2 AU flings Earth out of the solar system in ~70% of the simulated passes (captured by the star:
//     ~13%, kept by the Sun: ~17%). In the run used here Earth leaves at 20 km/s: the Sun is 1.8 AU away after a month,
//     2.9 AU after 3 months (3x smaller, 1/9 the warmth), 6.8 AU after a year (1/47 of the sunlight).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const LOOP = 0.9;                 // the lens ice clears onto the first frame over the last LOOP seconds

// ---- the physics ----
export const AU_KM = 149.6e6;
export const DMIN = 0.15;                // AU at closest pass
export const VREL = 0.05;                // AU per day
export const STAR = { mass: 0.6, width: 0.587, lum: 0.092 };
export const SUN_ANG = 0.2666 * Math.PI / 180;    // the Sun's angular radius from 1 AU (rad)
export const MOON_TIDE_SUN = 0.46;                // the Sun's pull on the seas, in Moons
// after the pass: Earth's distance from the Sun (AU) and from the star, days after
const SUN_AFTER = [[0, 1.0], [1, 1.02], [3, 1.08], [10, 1.3], [30, 1.8], [60, 2.4], [90, 2.92], [180, 4.3], [365, 6.84]];
const STAR_AFTER = [[10, 0.522], [30, 1.37], [90, 3.66], [180, 6.7], [365, 12.1]];
const tab = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 0; i < T.length - 1; i++) if (x <= T[i + 1][0]) return lerp(T[i][1], T[i + 1][1], (x - T[i][0]) / (T[i + 1][0] - T[i][0]));
  return T[T.length - 1][1];
};
// D: days until closest pass (negative after)
export function starDist(D) {
  const after = -D;
  if (after > 10) return tab(STAR_AFTER, after);
  return Math.hypot(DMIN, VREL * D);
}
export const sunDist = (D) => (D >= 0 ? 1 : tab(SUN_AFTER, -D));
export const widthX = (d) => STAR.width / d;              // x the Sun's width (from 1 AU)
export const brightX = (d) => STAR.lum / (d * d);         // x the Sun's light (from 1 AU)
export const tideX = (d) => (STAR.mass * MOON_TIDE_SUN) / (d * d * d);   // x the Moon's pull on the seas

// ---- the clock: days to the closest pass, against video time (time-lapse; jumps at the two dashes) ----
export const T_DASH1 = 19.3;             // the time-lapse skips ahead: you're up on the walk
export const T_ZERO = 30.5;              // closest pass
export const T_DASH2 = 34.6;             // skips ahead 10 days: the star is going, the Sun shrinking
const DAYS = [[-3, 8.9], [-1, 7.6], [0, 7.0], [1, 6.35], [2, 5.78], [3, 5.28], [4, 4.86], [5, 4.5], [6, 4.2], [7, 3.95], [8.5, 3.65], [10, 3.4],
  [12, 3.05], [14.5, 2.62], [17, 2.22], [T_DASH1 - 0.05, 1.9], [T_DASH1 + 0.25, 1.45], [21, 1.26], [23, 1.0], [25, 0.73], [27, 0.46], [29, 0.2], [T_ZERO, 0],
  [32, -0.18], [T_DASH2 - 0.05, -0.45], [T_DASH2 + 0.25, -10], [37, -40], [39.5, -90], [42, -160], [45, -260], [48.5, -365]];
// monotone cubic through the keys (no overshoot: the counter never runs backwards)
const MC = (() => {
  const n = DAYS.length, x = DAYS.map((k) => k[0]), y = DAYS.map((k) => k[1]);
  const dk = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) dk.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = dk[0]; m[n - 1] = dk[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (3 * (dk[i - 1] + dk[i])) / ((2 * dk[i] + dk[i - 1]) / dk[i - 1] + (dk[i] + 2 * dk[i - 1]) / dk[i]);
  return { x, y, m };
})();
export function daysAt(v) {
  const { x, y, m } = MC, n = x.length;
  if (v <= x[0]) return y[0] + m[0] * (v - x[0]);
  if (v >= x[n - 1]) return y[n - 1] + m[n - 1] * (v - x[n - 1]);
  let i = 0;
  while (v > x[i + 1]) i++;
  const h = x[i + 1] - x[i], t = (v - x[i]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
}
// "10d 04h 31m"
export function fmtClock(D) {
  const a = Math.abs(D);
  let d = Math.floor(a), hr = Math.floor((a - d) * 24), mn = Math.floor(((a - d) * 24 - hr) * 60);
  return `${d}d ${String(hr).padStart(2, '0')}h ${String(mn).padStart(2, '0')}m`;
}

// ---- the sky (bearing: degrees right of due west, toward the north; el: degrees above the horizon) ----
// the Sun: low over the sea all through the first part (golden hour), sets at the sunset beat, back low over the sea
// after the second dash (another evening, 10 days to a year later), smaller and smaller
export const T_SUNSET = [14.4, 18.4];
export function sunPos(v) {
  if (v < T_DASH2) return { b: -5.5 + 0.6 * smooth(T_SUNSET[0], T_SUNSET[1], v), el: lerp(2.6, -0.95, smooth(T_SUNSET[0], T_SUNSET[1], v)) - 0.25 * smooth(0, 14, v) };
  return { b: -5.0, el: lerp(3.4, 0.9, smooth(T_DASH2, 47.5, v)) };
}
// the star: over the sea a little to the right of the Sun, sinking toward the pier as it nears (at closest pass it
// hangs over the Ferris wheel, seen from the walk); after the pass it climbs away to the north, shrinking
export function starPos(v) {
  if (v < T_DASH1) return { b: lerp(4.0, 8.0, smooth(0, T_DASH1, v)), el: lerp(8.8, 7.0, smooth(0, T_DASH1, v)) };
  if (v < T_DASH2) return { b: lerp(13.5, 16.2, smooth(T_DASH1, T_ZERO, v)), el: lerp(9.0, 4.1, smooth(T_DASH1 + 0.3, T_ZERO, v)) };
  return { b: lerp(6.5, 8.0, smooth(T_DASH2, 47, v)), el: lerp(13.5, 16.5, smooth(T_DASH2, 47, v)) };
}
// the Moon: up in the evening sky to the left; at the Moon beat the star's pull drags it right across the sky toward
// the star, and it's gone after the pass
export const T_MOON = 19.7;
export function moonPos(v) {
  const k = smooth(T_MOON + 0.2, T_MOON + 4.0, v);
  return { b: lerp(4.4, 11.6, k), el: lerp(7.4, 6.6, k) + 0.8 * Math.sin(Math.PI * k), vis: v > T_DASH1 && v < T_DASH2 ? 1 - smooth(T_FLOOD - 0.6, T_FLOOD, v) : 0 };
}

// ---- the beats ----
export const T_SURGE = 3.9;              // the sea starts racing up the beach
export const T_FLOOD = 24.0;             // the beach goes under, up to the walk
export const T_QUAKE = 28.0;             // the ground shakes
export const T_FREEZE = 39.0;            // the sea starts to freeze
export const T_LENS = 43.4;              // frost on the lens
export const T_SOLID = 47.05;            // the lens is solid ice
export const T_SWITCH = Math.round((T_SOLID + 0.25) * 60) / 60;   // inside the solid ice: the loop point
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const CAM_END_X = 60;             // where the camera backs up to on the sand (m inland)

// the flood: a bore (a step of white water ~1.1 m high) races across the sand from the water's edge to the walk and on
// into the road; behind it the sea stands 1.1 m higher. frontX: where its foot is (m inland)
export const BORE_H = 1.0;
export function frontX(v) { const k = clamp((v - (T_FLOOD - 0.6)) / 4.4); return lerp(96, 215, Math.pow(k, 0.9)); }
export function boreAt(v) { return v >= T_DASH1 && v < T_DASH2 ? smooth(T_FLOOD - 1.1, T_FLOOD - 0.7, v) * (1 - smooth(T_FLOOD + 3.9, T_FLOOD + 4.6, v)) : 0; }
// the sea level (m above today's) and how hard the surf runs
export function seaYAt(v) {
  if (v >= T_DASH2) return lerp(0.55, 0.0, smooth(T_DASH2, T_DASH2 + 4, v));
  if (v >= T_DASH1) return 2.3 + 0.32 * smooth(T_DASH1, T_FLOOD - 0.6, v) + 0.73 * smooth(T_FLOOD + 3.6, T_FLOOD + 4.6, v) + 0.06 * smooth(T_FLOOD + 4.6, T_DASH2, v);
  return 0.18 + 1.6 * Math.pow(smooth(T_SURGE, T_SURGE + 4.4, v), 0.8) + 0.08 * smooth(T_SURGE + 5, T_DASH1, v);
}

// ---- text: popups name what happens (no numbers); captions sit in the gaps (never both at once) ----
const fmt1 = (x) => (x >= 9.5 ? String(Math.round(x / 5) * 5) : x.toFixed(0));
export const POP = 1.7;
export const POPUPS = [
  { t: 6.4, say: 'THE SEA RACES IN' },
  { t: 17.3, say: 'NO MORE NIGHT' },
  { t: T_MOON, say: 'THE MOON IS DRAGGED AWAY' },
  { t: T_FLOOD, say: 'THE BEACH GOES UNDER' },
  { t: T_QUAKE, say: 'THE GROUND SHAKES' },
  { t: T_ZERO, say: 'CLOSEST PASS' },
  { t: T_FREEZE, say: 'EVERYTHING FREEZES' },
];
const dAt = (v) => starDist(daysAt(v));
export const CAPTIONS = [
  { t0: 3.25, t1: 6.25, text: 'Gliese 710 will really pass us, about 1.3 million years from now, but much farther out.' },
  { t0: 8.3, t1: 11.3, text: `Its pull on the sea is already ${fmt1(tideX(dAt(8.3)))} times the Moon's.` },
  { t0: 11.5, t1: 14.4, text: "It's nearly 3 times wider than the Sun now, and twice as bright." },
  { t0: 14.6, t1: 17.1, text: 'The Sun sets. The star stays up.' },
  { t0: T_MOON + POP + 0.15, t1: T_FLOOD - 0.15, text: 'Its pull tears the Moon off its orbit.' },
  { t0: T_FLOOD + POP + 0.15, t1: T_QUAKE - 0.15, text: `Tides ${fmt1(tideX(dAt(T_FLOOD + 2)))} times the Moon's.` },
  { t0: T_ZERO + POP + 0.15, t1: T_DASH2 - 0.1, text: `22 million km away. ${Math.round(widthX(DMIN))} times wider than the Sun.` },
  { t0: T_DASH2 + 0.4, t1: T_FREEZE - 0.15, text: 'Its pull has flung Earth out of orbit. In 3 months, the Sun looks 3 times smaller.' },
  { t0: T_FREEZE + POP + 0.15, t1: T_LENS + 0.9, text: 'Earth drifts away from the Sun, forever.' },
];
export function popupAt(v) {
  for (const p of POPUPS) {
    const dt = v - p.t;
    if (dt >= 0 && dt < POP) return { text: p.say, alpha: smooth(0, 0.12, dt) * (1 - smooth(POP - 0.25, POP, dt)), rise: (1 - smooth(0, 0.18, dt)) * 26, dt };
  }
  return null;
}
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const c of CAPTIONS) {
    if (v >= c.t0 && v < c.t1) {
      const a = smooth(c.t0, c.t0 + 0.3, v) * (1 - smooth(c.t1 - 0.3, c.t1, v));
      return { text: c.text, alpha: a, rise: (1 - smooth(c.t0, c.t0 + 0.3, v)) * 14 };
    }
  }
  return null;
}
// the counter: label, value, and its one line
export function counterAt(v) {
  const D = daysAt(v);
  if (D > 0.0005 || v < T_ZERO) return { label: 'CLOSEST PASS IN · TIME-LAPSE', value: fmtClock(Math.max(0, D)), line: 'IT PASSES 22 MILLION KM FROM YOU' };
  const sx = sunDist(D);
  return { label: 'SINCE CLOSEST PASS · TIME-LAPSE', value: fmtClock(D), line: sx < 1.04 ? 'EARTH IS KNOCKED OFF COURSE' : `THE SUN: ${sx < 1.95 ? sx.toFixed(1) : Math.round(sx)}× SMALLER` };
}

// ---- state ----
export function state(v) {
  const s = { v };
  s.D = daysAt(v);
  s.dStar = starDist(s.D);
  s.dSun = sunDist(s.D);
  s.width = widthX(s.dStar);
  s.bright = brightX(s.dStar);
  s.tide = tideX(s.dStar);
  s.sun = sunPos(v); s.star = starPos(v); s.moon = moonPos(v);
  s.seaY = seaYAt(v);
  s.bore = boreAt(v); s.frontX = frontX(v);
  // the two dashes: a quick push forward into a blur and out (the time-lapse skipping ahead)
  const dash = (t) => Math.exp(-Math.pow((v - t) / 0.16, 2));
  s.dash = Math.max(dash(T_DASH1), dash(T_DASH2));
  s.dashFlash = Math.max(dash(T_DASH1), dash(T_DASH2)) * 0.55;
  s.part = v < T_DASH1 ? 0 : v < T_DASH2 ? 1 : 2;
  // light: day (the Sun up), dusk (it has set; the star lights everything), cold (after the pass)
  s.sunUp = v < T_DASH2 ? 1 - smooth(T_SUNSET[0] + 1.2, T_SUNSET[1] + 0.2, v) : 1;
  s.dusk = v < T_DASH2 ? smooth(T_SUNSET[0], T_SUNSET[1] + 1.5, v) : 0;
  s.cold = v >= T_DASH2 ? smooth(T_DASH2 + 1, 44, v) : 0;
  s.nightL = v < T_DASH2 ? smooth(T_SUNSET[0] + 1.5, T_SUNSET[1] + 1.2, v) : smooth(41.5, 44.5, v);
  s.quake = v < T_DASH2 ? smooth(T_QUAKE - 0.2, T_QUAKE + 0.3, v) * (1 - 0.55 * smooth(T_ZERO - 0.5, T_ZERO + 1.5, v)) * (1 - smooth(T_DASH2 - 0.6, T_DASH2, v)) : 0;
  s.surge = smooth(T_SURGE - 0.3, T_SURGE + 0.6, v) * (1 - smooth(T_SURGE + 4.6, T_SURGE + 6.5, v)) + (v < T_DASH2 ? smooth(T_FLOOD - 0.4, T_FLOOD + 0.6, v) * (1 - smooth(T_FLOOD + 3.6, T_FLOOD + 5.5, v)) : 0);
  s.ice = v >= T_DASH2 ? smooth(T_FREEZE - 0.5, T_LENS + 1.5, v) : 0;
  s.frost = v >= T_DASH2 ? smooth(T_FREEZE - 0.5, T_LENS + 1.0, v) : 0;
  s.lens = v >= T_DASH2 ? smooth(T_LENS, T_SOLID, v) : 0;
  s.cover = s.lens >= 0.999 ? 1 : 0;
  s.flash = 0;
  s.title = 1 - smooth(2.75, 3.15, v);
  return s;
}
