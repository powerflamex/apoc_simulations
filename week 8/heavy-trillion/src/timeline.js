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
//   x1e8     7.5 million tons (6.8e9 kg): about the Great Pyramid (5.9 Mt).
//   x1e9     75 million tons (6.8e10 kg) = 11 Great Pyramids (5.9 Mt each). Your pull: G M / r² = 4.54 m/s² at 1 m
//            (0.46 g, "half of Earth's"), 0.005 g at 10 m. The gravel and water that fell into the hole with you fall
//            alongside you (free fall), so your own gravity pulls them in and they start to orbit you (at 1 m: 2.1 m/s,
//            one turn in 3 s; at x1e10 one turn in 0.9 s).
//   x1e12    75 billion tons (6.8e13 kg): as heavy as a mountain (a 1.5 km peak ~8 km wide; Everest is ~2x heavier).
//            Density 1.0e15 kg/m³: a sugar cube (1 cm³) of you weighs 1.0e9 kg = 1.1 million tons. Your pull at 1 m:
//            4,540 m/s² (460 g), at 10 m 4.6 g. Rock near you is squeezed by ~ρ G M / r: 120 MPa at 10 cm, so the rock
//            right round you is crushed onto you.
// The fall: from the station floor (v = V_SINK) you fall freely, depth = g T² / 2 (g = 9.81; the crushing and the air
// slow you by a few % at most). Story time T runs on a smooth monotone curve through the layers you pass (fallT): real time
// through the floor, the sewer and the bedrock; slow motion through the cave; a time-lapse past the deepest mine ever dug
// (Mponeng, South Africa, ~4.0 km below the surface: T = 28.5 s, 630 mph), the deepest hole ever drilled (the Kola
// Superdeep Borehole, Russia, 12,262 m in 1989: T = 50 s, 1,100 mph) and the base of the crust (~35 km: T = 84 s); then
// "Minutes later" to the core-mantle boundary at 2,890 km (T = 767 s, 12.8 min, 7.5 km/s). The mine and the borehole are
// far from any one city: they are drawn at their depths as markers of how deep you are. In the end you'd sink to the
// center and stay there (drag damps the swings).
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
export const V_PYR = 16.8;                     // x1e8: as heavy as the Great Pyramid
export const V_GRAV = 21.6;                    // x1e9: your own gravity, half of Earth's at 1 m
export const V_ORBIT = 25.4;                   // x1e10: things orbit you
export const V_WALLS = 28.8;                   // x1e11
export const V_MTN = 32.5;                     // x1e12: a mountain
export const V_LAPSE = 35.0;                   // the time-lapse down through the crust and mantle starts
export const V_CORE = 41.5;                    // the core
export const V_FLASH = 45.6;                   // the white starts
export const T_SWITCH = 47.4;                  // full white: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const HITS = [V_SNAP, V_CRACK, V_PUNCH, V_LAND, V_SINK, V_PYR, V_GRAV, V_ORBIT, V_WALLS, V_MTN, V_CORE];

// ---- your mass: log10 of the multiplier, linear between keys (a 0.5 s jump at each step, a creep between) ----
const LK = [
  [-2, 0.2], [0.35, 0.62], [V_SNAP, 1.0], [V_CRACK - 0.5, 1.32], [V_CRACK, 2.0], [V_PUNCH - 0.5, 2.3], [V_PUNCH, 3.0],
  // from the station on, a steady climb (x10 every ~3-5 s) through the named points, no jumps
  [V_LAND, 3.25], [V_SINK, 6.0], [V_PYR, 8.0], [V_GRAV, 9.0], [23.3, 9.15], [V_ORBIT, 10.0], [V_WALLS, 11.0], [V_MTN, 12.0],
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

// ---- the fall: story seconds since the floor gave way (T), depth (m) below the track bed ----
const GF = 9.81;
export const D_STATION = 7.0;                            // the track bed is 7 m below the street
// layers, by depth below the street (m)
export const D_SEWER = 11.5, D_ROCK = 15, D_CAVE = 400, D_MINE = 4000, D_KOLA = 12262, D_MOHO = 35000, D_CMB = 2890e3;
const TD = (D) => Math.sqrt(2 * Math.max(D - D_STATION, 0) / GF);
export const T_CMB = TD(D_CMB);                          // 767 s
export const V_CAVE = 20.3, V_MINE = 23.4, V_KOLA = 27.0, V_MOHO = 29.6;
function pchip(keys) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * (x[i + 1] - x[i]) + (x[i] - x[i - 1]), w2 = (x[i + 1] - x[i]) + 2 * (x[i] - x[i - 1]); m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (t) => {
    if (t <= x[0]) return y[0] + m[0] * (t - x[0]);
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  };
}
const FK = [
  [10.6, 0], [11.6, 1.0], [15.0, 4.4], [18.6, 8.0],                         // real time: the floor, the sewer, the bedrock
  [19.3, 8.6], [V_CAVE, TD(D_CAVE)], [21.3, TD(D_CAVE) + 0.32],            // slow motion through the cave
  [22.3, TD(3650)], [V_MINE, TD(3870)], [24.7, TD(4060)],                 // the mine's levels flashing past
  [26.1, TD(11900)], [V_KOLA, TD(D_KOLA)], [27.9, TD(12650)],              // the borehole's pipe, its end
  [V_MOHO, TD(D_MOHO)], [31.5, TD(80e3)], [34, TD(150e3)], [37, TD(450e3)], [39.5, TD(1300e3)], [41.5, T_CMB], [43, T_CMB + 40],
];
const FT = pchip(FK);
function fallT(v) { return v < V_SINK ? 0 : Math.max(0, FT(v)); }
export function depthAt(v) { const T = fallT(v); return 0.5 * GF * T * T; }
export const speedAt = (v) => GF * fallT(v);
export const rateAt = (v) => (fallT(v + 0.02) - fallT(v - 0.02)) / 0.04;
export const depthStreet = (v) => D_STATION + depthAt(v);

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.05, 5.75, 'As heavy as an elephant. The sidewalk breaks.'],
  [6.3, 10.2, 'As heavy as a jet: you drop into the subway.'],
  [10.75, 13.4, 'As heavy as a cruise ship. Rock can’t hold you.'],
  [13.6, 16.5, 'Solid bedrock barely slows you down.'],
  [16.8, 19.1, 'As heavy as the Great Pyramid.'],
  [19.3, 21.4, 'You’re so heavy, your own gravity starts pulling rocks toward you.'],
  [21.6, 23.3, 'A meter from you, it pulls half as hard as Earth.'],
  [23.8, 25.8, 'Deeper than the deepest mine ever dug: 2.5 miles.'],
  [26.0, 28.6, 'Deeper than the deepest hole ever drilled: 7.6 miles.'],
  [28.8, 32.2, 'You keep getting heavier. The rock starts to glow.'],
  [32.7, 35.6, 'A sugar cube of you weighs a million tons.'],
  [35.9, 38.6, 'Your gravity crushes the rock around you onto you.'],
  [38.8, 41.3, 'Nothing can stop you. Minutes later…'],
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
