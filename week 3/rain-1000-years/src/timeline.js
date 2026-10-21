// "What if it rained for 1,000 years?" — the story as functions of VIDEO time v (seconds).
// The rule: one inch of rain an hour, everywhere on Earth, and it never stops. That is 2 ft a day, 730 ft a year;
// the water just keeps rising (we follow the level, not where the water comes from).
//   street flooded (6 in) after 6 hours, cars float at 2 ft (day 1), over your head on day 3,
//   the Space Needle (605 ft) at day 302, Seattle's tallest tower (Columbia Center, 937 ft) at day 469,
//   Denver (a mile high) in year 7, Mount Rainier (14,411 ft) in year 19.7, Denali (20,310 ft) in year 27.8,
//   K2 (28,251 ft) in year 38.7, Everest (29,032 ft) in year 39.74: no land left anywhere.
//   Year 449: the sea is 62 miles deep, taller than where space begins (the air rides up on top of it).
//   Year 1,000: 730,500 ft = 138 miles of water. At the bottom the pressure (~2.5 GPa) squeezes water into ice VII,
//   ice that stays solid even when warm.
// The video is a time-lapse that keeps speeding up (story days per video second grow), filmed at the same stormy
// dusk every day. Places: Pike Street in Seattle looking at the Market sign (0-28 s, the camera floats up with the
// water), the Space Needle, the drowned downtown and Mount Rainier (to 41 s), Everest's summit (41-50.5 s),
// space (the whole planet one ocean), then down into the water (to the end, deep dark water: the loop point).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FT = 0.3048;
export const M_PER_DAY = 2 * FT;              // 1 inch an hour
export const DAYS_YEAR = 365.25;

// ---- the clock: story days at video time v (monotone cubic through keys, in log days) ----
const KEYS = [
  [-4, 0.06], [0, 0.25], [4, 1.0], [8, 3.0], [12, 7.0], [16, 21], [20, 55], [24, 150], [28, 302.5], [31, 470],
  [35, 1500], [40, 7205], [41, 8300], [44, 11800], [47.5, 14000], [49.4, 14495], [50.3, 14516], [52, 17500],
  [54.4, 164000], [56.6, 365250], [70, 365250 * 1.0001],
];
const KX = KEYS.map((k) => k[0]), KY = KEYS.map((k) => Math.log(k[1]));
const KM = (() => {                           // Fritsch-Carlson slopes: never overshoots, never runs backwards
  const n = KX.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((KY[i + 1] - KY[i]) / (KX[i + 1] - KX[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
})();
export function daysAt(v) {
  if (v <= KX[0]) return Math.exp(KY[0] + KM[0] * (v - KX[0]));
  let i = 0;
  while (i < KX.length - 2 && v > KX[i + 1]) i++;
  const h = KX[i + 1] - KX[i], t = clamp((v - KX[i]) / h);
  const t2 = t * t, t3 = t2 * t;
  return Math.exp((2 * t3 - 3 * t2 + 1) * KY[i] + (t3 - 2 * t2 + t) * h * KM[i] + (-2 * t3 + 3 * t2) * KY[i + 1] + (t3 - t2) * h * KM[i + 1]);
}
export const levelAt = (v) => daysAt(v) * M_PER_DAY;          // m of water over the street (= above old sea level)
// video time at which the water reaches h metres (bisection: daysAt is monotone)
export function vAtLevel(h) {
  let a = -4, b = 69;
  for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (levelAt(m) < h) a = m; else b = m; }
  return (a + b) / 2;
}

// ---- the places ----
export const V_EVEREST0 = 41.0;               // cut to the Himalaya
export const V_EVEREST = vAtLevel(8849);      // the summit goes under (~50.3 s)
export const V_UP = V_EVEREST + 0.15;         // the camera lifts off into the clouds
export const V_SPACE = V_EVEREST + 1.15;      // above the clouds: the whole planet
export const V_PLUNGE = 56.8;                 // diving back down
export const V_SPLASH = 58.6;                 // into the sea
export const V_BOTTOM = 61.4;                 // dark: the loop point sits in it
export const T_SWITCH = 61.9;
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const UNDER_COLOR = '#020b12';
export const place = (v) => (v < V_EVEREST0 ? 'seattle' : v < V_SPACE ? 'everest' : 'space');

// the landmarks, by height (m) and when they go under
export const SIGN_TOP = 13.2;                 // the Public Market sign on its roof
export const NEEDLE_H = 605 * FT;
export const COLUMBIA_H = 937 * FT;
export const RAINIER_H = 14411 * FT;
export const V_FLOAT = vAtLevel(2 * FT);      // cars lift off
export const V_SIGN = vAtLevel(SIGN_TOP);
export const V_POWER = V_SIGN + 0.5;          // the grid fails (the substations are under)
export const V_NEEDLE = vAtLevel(NEEDLE_H);
export const V_COLUMBIA = vAtLevel(COLUMBIA_H);
export const V_RAINIER = vAtLevel(RAINIER_H);

// the beats: a big number pops at each, with a flash of lightning and a thunderclap
export const BEATS = [
  { h: 2 * FT, k: 'CARS FLOAT' },
  { h: 6 * FT, k: 'OVER YOUR HEAD' },
  { h: 10 * FT, k: 'THE SHOPS ARE UNDER' },
  { h: 28 * FT, k: 'THE STREETLIGHTS ARE UNDER' },
  { h: SIGN_TOP, k: 'THE MARKET SIGN IS GONE' },
  { h: 100 * FT, k: '10 STORIES UNDER' },
  { h: 300 * FT, k: '30 STORIES UNDER' },
  { h: NEEDLE_H, k: 'THE SPACE NEEDLE' },
  { h: COLUMBIA_H, k: 'SEATTLE’S TALLEST TOWER' },
  { h: 5280 * FT, k: 'DENVER, A MILE HIGH' },
  { h: RAINIER_H, k: 'MOUNT RAINIER' },
  { h: 20310 * FT, k: 'DENALI · NORTH AMERICA IS GONE' },
  { h: 28251 * FT, k: 'K2' },
  { h: 8849, k: 'EVEREST · NO LAND LEFT' },
  { h: 100e3, k: 'TALLER THAN SPACE BEGINS', miles: true },
  { h: 730500 * FT, k: 'YEAR 1,000', miles: true },
].map((b) => ({ ...b, v: vAtLevel(b.h) }));
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}

// ---- captions (video time) ----
export const CAPTIONS = [
  [3.8, 6.4, 'An inch of rain an hour. It never stops.'],
  [6.6, 9.0, 'By day 3, the water is over your head.'],
  [9.2, 11.6, 'Cars sink with their lights still on.'],
  [11.8, 14.2, 'It rises 2 feet every day.'],
  [14.4, 16.6, 'The Market sign goes under.'],
  [17.0, 19.4, 'The power goes out across the city.'],
  [19.6, 22.0, 'Boats pull people off the rooftops.'],
  [22.2, 24.6, 'The towers drown floor by floor.'],
  [24.8, 27.6, 'Month 10: the Space Needle.'],
  [28.6, 31.0, 'Seattle is gone. Only the mountains are left.'],
  [31.2, 33.6, 'Every coast on Earth has moved inland.'],
  [33.8, 36.2, 'Year 7: Denver is underwater.'],
  [36.4, 38.6, 'The sea climbs Mount Rainier.'],
  [38.8, 40.8, 'Year 20: the summit goes under.'],
  [41.4, 43.8, 'Year 28: the last land is the Himalayas.'],
  [44.0, 46.4, 'The air rises with the water. Everest has sea-level air.'],
  [46.6, 49.0, 'These are the last people on dry land.'],
  [49.2, 50.6, 'Year 40.'],
  [51.4, 53.8, 'Earth is one ocean. And it keeps raining.'],
  [54.0, 56.6, 'Year 1,000: the ocean is 138 miles deep.'],
  [56.8, 59.4, 'At the bottom, the water is crushed into ice.'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: how deep the water is (label: how long it has rained) ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtDepth(m) {
  const ft = m / FT;
  if (ft < 1) return `${Math.max(1, Math.round(ft * 12))} in`;
  if (ft < 10) return `${ft.toFixed(1)} ft`;
  if (ft <= 29100) return `${fmtInt(ft)} ft`;
  const mi = ft / 5280;
  return mi < 10 ? `${mi.toFixed(1)} miles` : `${fmtInt(mi)} miles`;
}
export function fmtTime(d) {
  if (d < 1) return `HOUR ${Math.max(1, Math.ceil(d * 24))}`;
  if (d < 61) return `DAY ${Math.ceil(d)}`;
  if (d < 730) return `MONTH ${Math.ceil(d / 30.44)}`;
  return `YEAR ${fmtInt(Math.min(1000, Math.ceil(d / DAYS_YEAR)))}`;
}
const NOTES = [
  [0, 'ANKLE DEEP'], [0.35, 'KNEE DEEP'], [2 * FT, 'CARS FLOAT'], [5 * FT, 'OVER YOUR HEAD'], [10 * FT, 'THE FIRST FLOORS'],
  [28 * FT, 'OVER THE STREETLIGHTS'], [SIGN_TOP, '4 STORIES'], [100 * FT, '10 STORIES'], [300 * FT, '30 STORIES'],
  [NEEDLE_H, 'OVER THE SPACE NEEDLE'], [COLUMBIA_H, 'OVER EVERY TOWER IN SEATTLE'], [3000 * FT, 'OVER THE HILLS'],
  [5280 * FT, 'A MILE DEEP'], [10000 * FT, 'HIGHER THAN AIRLINERS FLY'], [RAINIER_H, 'OVER MOUNT RAINIER'],
  [20310 * FT, 'OVER EVERY MOUNTAIN IN AMERICA'], [8849, 'OVER EVEREST: NO LAND LEFT'], [100e3, 'TALLER THAN SPACE BEGINS'],
];
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: '',
    labelFn: (v) => `RAIN · ${fmtTime(daysAt(v))}`,
    fmt: (m) => fmtDepth(m),
    value: (v) => levelAt(v),
    unit: (v) => { const h = levelAt(v); let n = ''; for (const [m, t] of NOTES) if (h >= m) n = t; return `WATER · ${n}`; },
    badge: (v) => (v < V_EVEREST ? 'EVEREST GOES UNDER IN YEAR 40' : 'THE RAIN STOPS IN YEAR 1,000'),
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.days = daysAt(v);
  s.level = levelAt(v);
  s.place = place(v);
  s.grid = 1 - smooth(V_POWER, V_POWER + 1.6, v);         // the city's lights
  // lightning: a strike at every beat, and a few in between
  s.bolt = 0; s.boltV = -99;
  for (const b of BEATS) if (v >= b.v - 0.05 && v - b.v < 1.2) { s.bolt = Math.max(s.bolt, boltCurve(v - b.v + 0.05)); s.boltV = b.v; }
  for (const x of [1.6, 13.0, 21.7, 33.2, 45.5]) if (v >= x && v - x < 1.2) { s.bolt = Math.max(s.bolt, 0.6 * boltCurve(v - x)); s.boltV = x; }
  s.title = 1 - smooth(3.0, 3.8, v);
  // the white of the clouds between Everest and space; the dive into the sea; the deep
  s.cloud = smooth(V_UP + 0.02, V_UP + 0.4, v) * (1 - smooth(V_SPACE - 0.1, V_SPACE + 0.5, v));
  s.under = v >= V_SPLASH ? 1 : 0;
  s.deep = smooth(V_SPLASH, V_BOTTOM, v);
  s.flash = v >= V_BOTTOM - 0.4 ? smooth(V_BOTTOM - 0.4, V_BOTTOM, v) : 0;   // (hides the text: only deep water until the loop)
  s.flashColor = UNDER_COLOR;
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
// a lightning flash: a bright first stroke, a dimmer restrike, a fading glow
export function boltCurve(dt) {
  if (dt < 0) return 0;
  return Math.exp(-dt / 0.05) * smooth(0, 0.012, dt) + 0.55 * Math.exp(-Math.pow((dt - 0.16) / 0.04, 2)) + 0.25 * Math.exp(-dt / 0.35) * smooth(0, 0.05, dt);
}
