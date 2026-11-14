// "What if you were 1 trillion times heavier?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// You stay your own size (1.75 m, a 150 lb person = 68.0 kg, volume ~0.066 m³); only your mass grows, in uneven named
// steps (a fast jump, then a slow creep, so the counter is always moving). Every number below was checked:
//   x10      1,500 lb: the bench snaps under you.
//   x100     7.5 tons (6.8 t): as heavy as an elephant (an African bull: 6-7 t).
//   x1,000   75 tons (68 t): as heavy as a loaded Boeing 737 (79 t max take-off). On your feet (~0.05 m²) that's ~13 MPa:
//            a 4-inch sidewalk slab fails in punching shear (~10 t), so you punch through into the station below.
//   x1e6     75,000 tons (68,000 t): a cruise ship's displacement (big ones are 50,000-100,000 t). Your weight on ~0.1 m²
//            is ~6.7 GPa, 30x the crushing strength of granite (~0.2 GPa): rock can't hold you. The crushing force is
//            only ~2e7 N against your 6.7e8 N weight (3%), so you fall almost freely: g t, as through air.
//   x1e9     75 million tons (6.8e10 kg) = 11 Great Pyramids (5.9 Mt each). Your pull: G M / r² = 4.54 m/s² at 1 m
//            (0.46 g, "half of Earth's"), 0.005 g at 10 m. The gravel and water that fell into the hole with you fall
//            alongside you (free fall), so your own gravity pulls them in and they start to orbit you (at 1 m: 2.1 m/s,
//            one turn in 3 s; at x1e10 one turn in 0.9 s).
//   x1e12    75 billion tons (6.8e13 kg): as heavy as a mountain (a 1.5 km peak ~8 km wide; Everest is ~2x heavier).
//            Density 1.0e15 kg/m³: a sugar cube (1 cm³) of you weighs 1.0e9 kg = 1.1 million tons. Your pull at 1 m:
//            4,540 m/s² (460 g), at 10 m 4.6 g. Rock near you is squeezed by ~ρ G M / r: 120 MPa at 10 cm, so the rock
//            right round you is crushed onto you.
// The fall: from the station floor (v = V_SINK) you fall freely, depth = g T² / 2 (real time to 0:31: 2.0 km, 450 mph),
// then a time-lapse ("Minutes later") to the core-mantle boundary at 2,890 km (with g ~ 10 m/s² through the mantle:
// 760 s = 12.7 min, 7.6 km/s). In the end you'd sink to the center and stay there (drag damps the swings).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const LB0 = 150;                        // your weight at x1 (lb)
export const KG0 = 68.04;
export const G = 6.674e-11;
export const V_SNAP = 0.85;                    // the bench snaps (x10)
export const V_CRACK = 3.5;                    // x100: the sidewalk breaks, you sink in
export const V_PUNCH = 6.0;                    // x1,000: you punch through into the station
export const V_LAND = 6.97;                    // you hit the track bed
export const V_SINK = 10.6;                    // x1e6: the floor gives; the free fall starts
export const V_GRAV = 16.6;                    // x1e9: your own gravity
export const V_ORBIT = 23.8;                   // x1e10: things orbit you
export const V_WALLS = 27.0;                   // x1e11
export const V_MTN = 30.0;                     // x1e12: a mountain
export const V_LAPSE = 34.0;                   // the time-lapse down through the crust and mantle starts
export const V_CORE = 41.5;                    // the core
export const V_FLASH = 45.6;                   // the white starts
export const T_SWITCH = 47.4;                  // full white: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const HITS = [V_SNAP, V_CRACK, V_PUNCH, V_LAND, V_SINK, V_GRAV, V_ORBIT, V_WALLS, V_MTN, V_CORE];

// ---- your mass: log10 of the multiplier, linear between keys (a 0.5 s jump at each step, a creep between) ----
const LK = [
  [-2, 0.2], [0.35, 0.62], [V_SNAP, 1.0], [V_CRACK - 0.5, 1.32], [V_CRACK, 2.0], [V_PUNCH - 0.5, 2.3], [V_PUNCH, 3.0],
  [V_SINK - 0.5, 3.6], [V_SINK, 6.0], [V_GRAV - 0.5, 6.6], [V_GRAV, 9.0], [V_ORBIT - 0.5, 9.05], [V_ORBIT, 10.0],
  [V_WALLS - 0.5, 10.3], [V_WALLS, 11.0], [V_MTN - 0.5, 11.4], [V_MTN, 12.0],
];
export function logMult(v) {
  if (v <= LK[0][0]) return LK[0][1];
  for (let i = 0; i < LK.length - 1; i++) {
    const [a, x] = LK[i], [b, y] = LK[i + 1];
    if (v <= b) return x + (y - x) * (v - a) / (b - a);
  }
  return 12;
}
export const multAt = (v) => Math.pow(10, logMult(v));
export const GMAt = (v) => G * KG0 * multAt(v);          // m³/s²
export const pullAt = (v, r) => GMAt(v) / (r * r);         // m/s² at r m from you

// ---- the fall: story seconds since the floor gave way, depth (m) below the station floor ----
const GF = 9.81, GM_ = 10.0;
export const T_CMB = 760;                                // s to the core-mantle boundary
export const D_STATION = 7.0;                            // the track bed is 7 m below the street
const T_REAL_END = 31.0 - V_SINK;                        // real time until 0:31
function fallT(v) {
  if (v < V_SINK) return 0;
  const t = v - V_SINK;
  if (t <= T_REAL_END) return t;
  // a time-lapse: smooth from rate 1 at 0:31 to the core-mantle boundary at V_CORE, then slower again
  const a = 31.0, b = V_CORE;
  if (v <= b) {
    const u = (v - a) / (b - a);
    // T = T_REAL_END + (v - a) + k u^3 (rate 1 at the start), k chosen to land on T_CMB
    const k = T_CMB - T_REAL_END - (b - a);
    return T_REAL_END + (v - a) + k * u * u * u;
  }
  return T_CMB + (v - b) * 25;
}
export function depthAt(v) {
  const T = fallT(v);
  if (T <= T_REAL_END) return 0.5 * GF * T * T;
  const d1 = 0.5 * GF * T_REAL_END * T_REAL_END, v1 = GF * T_REAL_END;
  const t = T - T_REAL_END;
  return d1 + v1 * t + 0.5 * GM_ * t * t;
}
export const speedAt = (v) => { const T = fallT(v); return T <= T_REAL_END ? GF * T : GF * T_REAL_END + GM_ * (T - T_REAL_END); };
export const rateAt = (v) => (fallT(v + 0.02) - fallT(v - 0.02)) / 0.04;

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.05, 5.75, 'As heavy as an elephant. The sidewalk breaks.'],
  [6.3, 10.2, 'As heavy as a jet: you drop into the subway.'],
  [10.75, 13.6, 'As heavy as a cruise ship. Rock can’t hold you.'],
  [13.8, 16.4, 'Solid rock barely slows you down.'],
  [16.8, 19.6, 'As heavy as 11 Great Pyramids.'],
  [19.8, 23.5, 'A meter from you, your pull is half of Earth’s.'],
  [24.0, 26.8, 'The gravel falling with you starts to orbit you.'],
  [27.2, 29.8, 'You’re falling through solid rock at 360 mph.'],
  [30.4, 33.8, 'A sugar cube of you weighs a million tons.'],
  [34.2, 37.6, 'The rock around you is crushed onto you.'],
  [38.0, 41.3, 'Nothing can stop you. Minutes later…'],
  [41.7, 45.3, 'You’d end up stuck at the center of the Earth.'],
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

// ---- the counter: what you weigh (label), how many times heavier (the racing number), the finish line ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtWeight(mult) {
  const lb = LB0 * mult;
  if (lb < 2000) return `${fmtInt(Math.round(lb / 10) * 10)} LB`;
  const tons = lb / 2000;
  if (tons < 10) return `${tons.toFixed(1)} TONS`;
  if (tons < 1e6) return `${fmtInt(tons)} TONS`;
  if (tons < 1e9) return `${(tons / 1e6).toPrecision(3)} MILLION TONS`;
  return `${(tons / 1e9).toPrecision(3)} BILLION TONS`;
}
export function fmtMult(mult) {
  if (mult < 10) return `${mult.toFixed(1)}x`;
  return `${fmtInt(mult)}x`;
}
export function counterAt(v) {
  const m = multAt(v);
  return { label: `YOU WEIGH ${fmtWeight(m)}`, value: fmtMult(m), line: '1,000,000,000,000x: AS HEAVY AS A MOUNTAIN' };
}

// ---- the state at video time v ----
export function sceneAt(v) { return v < V_PUNCH + 0.05 ? 'street' : v < V_SINK + 0.25 ? 'station' : 'bore'; }
export function state(v) {
  const s = { v };
  s.scene = sceneAt(v);
  s.L = logMult(v);
  s.mult = multAt(v);
  s.GM = GMAt(v);
  s.depth = depthAt(v);             // m below the track bed
  s.km = (s.depth + D_STATION) / 1000;
  s.speed = speedAt(v);
  s.rate = rateAt(v);
  s.flash = smooth(V_FLASH, T_SWITCH - 0.05, v);
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp };
