// "What if you were 1 trillion times stronger?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One continuous shot at a cruise-ship plaza on a harbor: you lift the next real thing and throw it, every 4-6 s.
// "Times stronger" = how much more you can lift. At x1 you can lift 100 lb (45 kg) over your head, so at xN you can
// lift N x 100 lb. Every number below was checked (Nov 21, 2026); "tons" are US (short) tons of 2,000 lb throughout:
//   x33       a mid-size car, ~3,300 lb (1.5 t).                               ("YOU CAN LIFT: A CAR", frame 0 at 42x)
//   x300      a 40-ft city bus, ~30,000 lb = 15 tons (transit buses weigh 26,000-33,000 lb empty).
//   x800      a loaded semi truck: 80,000 lb = 40 tons (the US legal limit for a loaded truck).
//   x8,750    a jumbo jet: a Boeing 747-400 at its maximum take-off weight, 875,000 lb = about 440 tons.
//   x2,200,000  a cruise ship: the biggest (Oasis class) displace about 100,000 metric tons = 220 million lb = 110,000 tons.
//   x7,300,000  a skyscraper: the Empire State Building weighs about 365,000 tons (730 million lb).
//   x73,000,000 = 10 of them; x7,300,000,000 = 1,000 of them.
//   x1e12     1e14 lb = 50 billion tons: a mountain. Rock is ~2,700 kg/m^3, so that is ~17 km^3: a peak about a mile
//             (1.6 km) high on a base ~8 x 4.5 km (Everest is about 3x heavier). The mountain drawn is that size.
// Your weight on the ground: everything you hold presses down through your shoes (~0.06 m^2 for two shoes):
//   the bus ~2.3 MPa (paving slabs crack), the truck ~6 MPa (a concrete slab on soil gives way under you), the jet
//   ~30-65 MPa (more than concrete's ~30-40 MPa crushing strength), the ship ~16 GPa (80x what granite can take).
//   From the jet on, really you'd be pushed down into the ground like a nail; the video shows the ground caving in round
//   you instead, so you stay in sight (noted in CAPTIONS.md).
// Throws: with a ~2 m push you can only throw a thing far once you're many times stronger than its weight; the counter
//   keeps climbing while you hold each thing, but the throws (and the mountain's fall, ~5x faster than real) are drawn for
//   the story (noted in CAPTIONS.md). The leap across the harbor (~290 m) needs ~55 m/s: easy for legs this strong.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const LB0 = 100;                         // what you can lift at x1 (lb)

// ---- the beats (video time) ----
export const B = {
  carToss: 1.0, carLand: 1.75,
  busGrab: 2.75, busUp: 4.0, busThrow: 4.55, busLand: 6.45,
  truckGrab: 8.0, truckUp: 9.6, truckThrow: 10.55, truckHit: 11.75,
  jetGrab: 13.3, jetUp: 14.9, jetThrow: 15.9, jetHit: 17.1,
  shipGrab: 19.0, shipUp: 22.0, shipThrow: 22.85, shipLand: 25.0,
  towerGrab: 27.2, towerUp: 30.0, towerThrow: 30.7, towerLand: 32.6,
  leap: 33.2, leapLand: 36.2,
  mtnGrab: 36.8, mtnUp: 41.4, mtnThrow: 41.75, mtnLand: 43.5,
};
export const V_TRILLION = 41.4;
export const V_WHITE = 45.55;                   // the dust wall reaches the camera: hard white
export const T_SWITCH = 46.35;                  // full white since V_WHITE: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
// the hits the soundtrack marks (lands and crashes)
export const HITS = [B.carLand, B.busLand, B.truckHit, B.jetHit, B.shipLand, B.towerLand, B.leapLand, B.mtnLand];

// ---- how many times stronger: log10, through keys (monotone cubic): slow while you hold a thing, fast between ----
const LK = [
  [-2.0, 1.40], [0.0, 1.62], [1.0, 1.85], [2.0, 2.2], [2.75, 2.48], [4.55, 2.68], [6.6, 2.82], [7.9, 2.905],
  [10.55, 3.25], [12.3, 3.6], [13.8, 3.945], [15.9, 4.3], [17.8, 5.1], [19.8, 6.0], [20.7, 6.345], [22.85, 6.6],
  [25.0, 6.78], [27.3, 6.865], [30.7, 7.4], [32.6, 7.86], [34.2, 8.9], [36.2, 10.0], [37.8, 10.7], [39.6, 11.45],
  [41.4, 12.0], [60, 12.0],
];
const MC = (() => {
  const n = LK.length, x = LK.map((k) => k[0]), y = LK.map((k) => k[1]);
  const dk = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) dk.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = dk[0]; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (3 * (dk[i - 1] + dk[i])) / ((2 * dk[i] + dk[i - 1]) / dk[i - 1] + (dk[i] + 2 * dk[i - 1]) / dk[i]);
  return { x, y, m };
})();
export function logS(v) {
  const { x, y, m } = MC, n = x.length;
  if (v <= x[0]) return y[0] + m[0] * (v - x[0]);
  if (v >= x[n - 1]) return y[n - 1];
  let i = 0;
  while (v > x[i + 1]) i++;
  const h = x[i + 1] - x[i], t = (v - x[i]) / h, t2 = t * t, t3 = t2 * t;
  return Math.min(12, (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1]);
}
export const timesAt = (v) => Math.pow(10, logS(v));
// the first video time the counter reaches x (log10)
export function timeOfLog(L) {
  let lo = -2, hi = 60;
  if (logS(hi) < L) return Infinity;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (logS(m) < L) lo = m; else hi = m; }
  return hi;
}

// ---- what you can lift (the one line under the counter): [times, text] ----
export const CAN = [
  [33, 'A CAR'], [300, 'A CITY BUS'], [800, 'A LOADED TRUCK'], [8750, 'A JUMBO JET'], [2.2e6, 'A CRUISE SHIP'],
  [7.3e6, 'A SKYSCRAPER'], [7.3e7, '10 SKYSCRAPERS'], [7.3e9, '1,000 SKYSCRAPERS'], [1e12, 'A MOUNTAIN'],
];
export const CAN_AT = CAN.map(([x]) => timeOfLog(Math.log10(x) - 1e-9));
export function canAt(v) {
  const S = timesAt(v) * (1 + 1e-9);
  let t = CAN[0][1];
  for (const [x, txt] of CAN) if (S >= x) t = txt;
  return t;
}

// ---- captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.15, 5.0, 'A city bus: 15 tons.'],
  [8.3, 10.3, 'A loaded truck: 40 tons.'],
  [11.0, 12.8, 'Your shoes crack the concrete.'],
  [13.5, 15.6, 'A jumbo jet: 440 tons.'],
  [19.4, 21.6, 'A cruise ship: 110,000 tons.'],
  [22.9, 24.9, 'The ground can’t hold you up.'],
  [27.4, 29.8, 'A skyscraper: 365,000 tons.'],
  [33.4, 35.4, 'One jump across the harbor.'],
  [37.0, 39.4, 'It breaks where you grab it.'],
  [41.5, 44.6, '50 billion tons. A mountain a mile high.'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.25), fadeOut = clamp((b - v) / 0.25);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function counterAt(v) {
  const m = timesAt(v);
  const value = v >= V_TRILLION - 1e-6 ? '1,000,000,000,000x' : `${fmtInt(m)}x`;
  return { label: 'TIMES STRONGER', value, line: `YOU CAN LIFT: ${canAt(v)}` };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.L = logS(v);
  s.S = Math.pow(10, s.L);
  s.flash = smooth(V_WHITE - 0.035, V_WHITE, v);
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp, smooth, clamp };
