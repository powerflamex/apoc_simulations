// "What if you were 1 trillion times more magnetic?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One street, one shot: you stand on the middle of a packed promenade that runs down to a harbour, and the magnetic field
// at your skin grows step by step. Everything steel comes to you; from ~100,000x even water and people are pushed away.
//
// "Times stronger": the field at your skin, 1x = a fridge magnet's 0.005 tesla (5 mT; fridge magnets are ~5-10 mT at
// the surface). Every number checked Nov 23, 2026:
//   300x     1.5 T: stronger than any "super" (neodymium) magnet: the best N52 grade holds 1.48 T inside the magnet itself.
//   1,500x   7.5 T: stronger than a hospital MRI (most scan at 1.5 or 3 T; the strongest cleared for patients, 7 T).
//   9,000x   45 T: the strongest magnet that stays on (45.22 T, Hefei 2022; MagLab's hybrid 45 T, 1999).
//   20,200x  101 T: stronger than any magnet that doesn't explode (Los Alamos, 100.75 T pulsed, 2012). Labs go higher
//            only with coils that blow themselves apart: 1,200 T indoors (Tokyo, 2018), ~2,800 T with explosives
//            (Russia, MC-1 generators, 1998/2001).
//   600,000x 3,000 T: stronger than any field ever made on Earth (that ~2,800 T).
//   1e8x     500,000 T: twice the "atomic" field (2.35e5 T), where the field beats the pull that holds an atom's electrons
//            to its nucleus: atoms are squeezed into needles along the field (Lai 2001, Rev. Mod. Phys.).
//   2e11x    1e9 T: magnetar strength (magnetars: ~1e9-1e11 T). 1 trillion x = 5e9 T: a magnetar.
// How far the pull reaches (the honest physics; CAPTIONS.md says where the video draws it bigger):
//   you as a magnet: a dipole about your size (field at your skin B0, falling as (0.3 m / r)^3). A loose piece of steel
//   lifts when the pull per volume beats its weight (7.7e4 N/m³): unsaturated (B < 0.7 T where it is) 9 B²/(mu0 r),
//   saturated (1.7e6 A/m) 3 Ms B / r. That gives a lift reach of
//     1,000x ~1.1 m, 10,000x ~2.1 m, 100,000x ~4 m, 1,000,000x ~8 m, 1e9x ~55 m, 1e12x ~310 m.
//   Steel's pull per kilo doesn't depend on its size, so a car flies from as far as a key does (it has tyres and friction
//   to beat). Ships float, so even a small pull drags them. Water (and people, mostly water) is repelled: chi = -9e-6,
//   lifted where B dB/dr > 1,360 T²/m: ~0.9 m at 100,000x, 12 m at 1e9x, ~90 m at 1e12x.
// The video draws every reach far bigger than that (CAPTIONS.md), keeps the order honest (loose steel first, things bolted
// down later, water and people pushed only once the field is huge), and lets you survive.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const B1 = 0.005;                 // tesla, 1x
const lg = Math.log10;
// the steps: [video time, log10(times stronger) after the jump]. A 0.35 s jump at each, a creep between.
export const BEATS = [
  [1.8, lg(560)],      // phones and keys from further out
  [4.0, 3],            // 1,000x: bikes and signs rip loose
  [7.0, 3.5],          // carts, manhole covers, cafe chairs
  [10.0, 4],           // 10,000x: cars slide toward you
  [13.5, 4.5],         // the bus tips and drags
  [17.0, 5],           // 100,000x: water and people pushed away
  [21.0, 5.5],         // steel beams tear out of the buildings
  [26.0, 6],           // 1,000,000x: towers fold toward you
  [28.5, 7],           // ships off the harbour
  [30.8, 8],           // the bridge
  [32.8, 9],
  [34.5, 10],
  [35.6, 11],
  [36.5, 12],          // 1 trillion
];
export const V_TRILLION = 36.5;
export const V_WHITE = 44.6;
export const V_FLASH = V_WHITE - 0.06;
export const T_SWITCH = 46.3;            // full white since V_WHITE: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const HITS = BEATS.map((b) => b[0]);
const JUMP = 0.35;
// keys: before frame 0 a creep (the loop's lead-in), 316x on frame 0 (already pulling), then the beats
const LK = [[-2, lg(300)], [0, 2.5]];
{
  let L = 2.5;
  for (const [vb, Lb] of BEATS) {
    const Lc = L + 0.6 * (Lb - L);
    LK.push([vb, Lc], [vb + JUMP, Lb]);
    L = Lb;
  }
}
export function logMult(v) {
  if (v <= LK[0][0]) return LK[0][1];
  for (let i = 0; i < LK.length - 1; i++) {
    const [a, x] = LK[i], [b, y] = LK[i + 1];
    if (v <= b) { const k = (v - a) / (b - a); return x + (y - x) * (b - a < 0.5 ? smooth(0, 1, k) : k); }
  }
  return 12;
}
export const multAt = (v) => Math.pow(10, logMult(v));
export const teslaAt = (v) => B1 * multAt(v);
// the first video time at which L reaches Lt
export function timeOfL(Lt) {
  if (Lt <= LK[0][1]) return -2;
  for (let i = 0; i < LK.length - 1; i++) {
    const [a, x] = LK[i], [b, y] = LK[i + 1];
    if (Lt <= y && y > x) {
      let lo = a, hi = b;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (logMult(m) < Lt) lo = m; else hi = m; }
      return hi;
    }
  }
  return Infinity;
}

// ---- when each kind of thing goes: a window [t0, t1]; inside it, the nearest go first (the drawn reach sweeping out) ----
export const GROUPS = {
  small: [-1.3, 3.6],      // keys, coins, phones, cutlery from the crowd and the cafe
  bike: [3.95, 6.2],
  sign: [4.25, 6.8],
  cart: [6.95, 8.8],
  cover: [7.05, 9.4],
  chair: [7.4, 9.7],
  lamp: [11.0, 16.0],      // lamp posts bend toward you, snap at the base and come
  car: [9.95, 14.2],
  bus: [13.5, 13.5],
  rail: [17.3, 20.5],      // railings, bollards, the bike rack, the kiosk frames
  beam: [21.0, 25.5],      // steel beams torn out of the buildings
  fold: [26.0, 33.5],      // buildings and towers fold toward you, their tops come apart and fly
  ship: [28.5, 33.0],
  bridge: [30.8, 34.4],
};
export function releaseAt(group, d, dmin, dmax, jitter = 0) {
  const [t0, t1] = GROUPS[group];
  const k = clamp((d - dmin) / Math.max(dmax - dmin, 1e-3));
  return t0 + (t1 - t0) * Math.pow(k, 0.85) + jitter;
}
// water and people: pushed away out to this radius (m) from you (drawn far bigger than life: ~1 m honest at 100,000x)
export const pushR = (v) => 3 + 11 * smooth(16.9, 20.5, v) + 6 * smooth(26, 34, v);
// the end: everything near you stretched along the field and coming apart (0..1)
export const stretchAt = (v) => Math.pow(smooth(V_TRILLION + 0.2, V_WHITE - 1.0, v), 0.7);

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.05, 5.3, 'Every key and phone near you flies at you.'],
  [5.5, 7.6, 'Bikes and shop signs rip loose.'],
  [7.8, 9.8, 'Even 250-pound manhole covers.'],
  [10.2, 12.6, 'Parked cars slide toward you.'],
  [13.7, 16.1, 'A 12-ton bus tips over and drags.'],
  [17.25, 19.7, 'Now water and people are pushed away.'],
  [19.9, 21.0, 'Everything is a little magnetic.'],
  [21.3, 23.9, 'Steel beams tear out of the buildings.'],
  [26.25, 28.3, 'Towers bend toward you.'],
  [28.7, 30.6, 'Ships are pulled out of the harbor.'],
  [31.0, 33.2, 'The bridge comes off its towers.'],
  [37.0, 39.4, 'The strongest magnets in the universe.'],
  [39.8, 42.4, 'Everything near you comes apart.'],
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

// ---- the counter: TIMES STRONGER, the racing number, one line naming what your pull beats ----
export const LINES = [
  [2.47, 'STRONGER THAN A SUPER MAGNET'],
  [lg(1500), 'STRONGER THAN A HOSPITAL MRI'],
  [lg(20200), 'MAGNETS THIS STRONG EXPLODE'],
  [lg(600000), 'STRONGER THAN ANY FIELD EVER MADE'],
  [8.0, 'STRONG ENOUGH TO STRETCH ATOMS'],
  [lg(2e11), 'AS STRONG AS A MAGNETAR'],
];
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtMult(mult) {
  // (big numbers rounded to 3 significant figures so the digits don't flicker into nonsense precision)
  const d = Math.max(0, Math.floor(Math.log10(Math.max(mult, 1))) - 2);
  const r = d > 0 ? Math.round(mult / 10 ** d) * 10 ** d : Math.round(mult);
  return `${fmtInt(r)}x`;
}
export function lineAt(L) {
  let s = LINES[0][1];
  for (const [l, t] of LINES) if (L >= l) s = t;
  return s;
}
export function counterAt(v) {
  const L = logMult(v);
  return { label: 'TIMES STRONGER', value: fmtMult(Math.pow(10, L)), line: lineAt(L) };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.L = logMult(v);
  s.mult = Math.pow(10, s.L);
  s.flash = smooth(V_WHITE - 0.035, V_WHITE, v);
  s.title = 1 - smooth(2.6, 3.0, v);
  s.stretch = stretchAt(v);
  return s;
}
export { lerp };
