// "What if you were 1 trillion times hotter?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One street, one shot: you stand in a busy shopping street and your body temperature grows step by step.
// "Times hotter" multiplies your body temperature in KELVIN (the only honest way: 0 °F or 0 °C aren't "no heat"):
//   T = 310.15 K x mult (37 °C, 98.6 °F at 1x). Shown in °F = (T - 273.15) x 1.8 + 32.
// You glow like any hot body: you give off sigma T^4 per square metre of skin (Stefan-Boltzmann), over ~1.8 m².
// Near you that light lands on things at q = sigma T^4 (Rs / r)^2 (Rs = 0.38 m: a ball with your skin area), so the
// distance at which anything gets a given heat grows as mult² (10x hotter: 100x farther). Every number checked
// (Nov 21, 2026; fire-safety figures are the usual SFPE / NIST ones):
//   2.7x  837 K, 1,047 °F: just past the Draper point (~525 °C / 977 °F) where things start to glow dull red.
//         0.7 m from you that's ~8 kW/m² (8x strong sunlight): an ice cream melts in seconds, skin hurts at once.
//   3x    930 K, 1,215 °F.
//   5x    1,551 K, 2,331 °F: hotter than lava (basalt erupts at ~1,100-1,200 °C, 2,000-2,200 °F).
//         Plastic and paint 1.5 m off start to melt and smoke (~15-20 kW/m²); asphalt under you liquid.
//   10x   3,102 K, 5,123 °F: about a light bulb filament (tungsten runs at ~2,700-3,000 K). Leaves and canvas catch
//         fire out to ~6 m (20-30 kW/m²: wood, fabric, rubber ignite in seconds), windows crack to ~9 m (~9 kW/m²).
//   20x   6,203 K, 10,706 °F: hotter than the surface of the Sun (5,772 K). Fires out to ~25 m, glass runs to ~6 m.
//   30x-50x  9,300-15,500 K: thin car steel sags (~1 MW/m² heats 1 mm sheet past 600 °C in ~2 s) to 9-24 m,
//         a building's steel frame sags (~3 MW/m²) to 4-12 m, concrete and brick melt and pour (~10 MW/m²) to 2.5-7 m.
//   70x-200x  21,700-62,000 K. 100x, 31,000 K: hotter than a lightning bolt (~30,000 K). Rock boils to gas
//         (~100 MW/m²) out to 8.7 m at 100x, 35 m at 200x: the block, then the whole street.
//   1,000x  310,000 K (558,000 °F): gas out to ~865 m (half a mile).
//   10,000x  3.1 million K: everything in sight (the horizon is ~5 km off; boiling reach ~86 km).
//   60,000x  18.6 million K: hotter than the centre of the Sun (15.7 million K).
//   1,000,000x  310 million K: you give off 943 W x mult^4 = 9.4e26 W, 2.5x the Sun's whole output (3.8e26 W).
//   100,000,000x  31 billion K: 9.4e34 W, the energy that holds the Earth together (2.2e32 J) every 2.4 ms.
//   100,000,000,000x  31 trillion K: hotter than the hottest thing ever made (5.5 trillion K, lead collisions at the
//         Large Hadron Collider, 2012).
//   1 trillion x  310 trillion K (558 trillion °F): the whole universe was last this hot a billionth of a second
//         after the Big Bang (T ~ 27 GeV: t ~ 2.4 / sqrt(g*) / T_MeV² s ~ 4e-10 s).
// Simplified (CAPTIONS.md): you survive, your clothes glow with you instead of burning, the heat only travels as
// light (no blast), people get away, the steps between thresholds are shortened to seconds.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const T_BODY = 310.15;                       // K
export const SIGMA = 5.670374e-8;
export const RS = Math.sqrt(1.8 / (4 * Math.PI));   // 0.378 m
export const LOG_S = Math.log10(SIGMA), LOG_TB = Math.log10(T_BODY);
// the steps: [video time, log10(times hotter) after the jump]. A 0.35 s jump at each, a creep between.
const lg = Math.log10;
export const BEATS = [
  [0.55, lg(3)],      // 1,215 °F: the people next to you jump back; the ice cream runs
  [3.0, lg(5)],       // hotter than lava: the car's bumper melts, the asphalt runs under you
  [5.6, 1],           // a light bulb filament: the tree beside you, tires, awnings catch fire
  [8.2, lg(20)],      // hotter than the Sun's surface: fires across the street, glass running
  [10.8, lg(30)],     // cars sag
  [13.4, lg(40)],     // the building beside you sags
  [16.0, lg(50)],     // its walls glow and pour down
  [18.6, lg(70)],     // across the street too
  [21.2, 2],          // hotter than lightning: the block turns to gas
  [23.8, lg(200)],    // the whole street
  [26.4, 3],          // half a mile
  [29.0, 4],          // everything in sight
  [31.6, lg(60000)],  // hotter than the centre of the Sun
  [34.2, 6],          // brighter than the Sun
  [36.8, 8],          // the energy holding the Earth together, every 2.4 ms
  [39.4, 11],         // hotter than anything ever made
  [42.0, 12],         // 1 trillion
];
export const V_TRILLION = 42.0;
export const V_WHITE = 44.8;                        // the light fills the frame: hard white
export const V_FLASH = V_WHITE - 0.06;
export const T_SWITCH = 46.6;                       // full white since V_WHITE: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const HITS = BEATS.map((b) => b[0]);
const JUMP = 0.35;
// keys: before frame 0 a rise from 2x (the loop's lead-in), 2.7x on frame 0 (already glowing), then the beats
const LK = [[-2, lg(1.9)], [0, lg(2.7)]];
{
  let L = lg(2.7);
  for (const [vb, Lb] of BEATS) {
    // creep about 60% of the way up (the number never stops racing), then jump the rest
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
export const tempK = (v) => T_BODY * multAt(v);
export const toF = (K) => (K - 273.15) * 1.8 + 32;
// log10 of the heat (W/m²) landing r metres from you, for log-multiplier L
export const logQ = (L, r) => LOG_S + 4 * (LOG_TB + L) + 2 * Math.log10(RS / Math.max(r, RS));
// the distance (m) at which the heat is q (W/m²)
export const radiusAt = (L, q) => RS * Math.pow(10, (LOG_S + 4 * (LOG_TB + L) - Math.log10(q)) / 2);
// the first video time at which L reaches Lt (Infinity if never)
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
// when the heat at r first reaches q
export const timeOfQ = (q, r) => timeOfL((Math.log10(q) - LOG_S - 2 * Math.log10(RS / Math.max(r, RS))) / 4 - LOG_TB);
// thresholds (W/m², the heat that does it within a second or two)
export const Q = {
  FLEE: 5e2,         // a glowing person, the heat on your face like an open oven: people back off (pain from ~2.5 kW/m²)
  CRACK: 9e3,        // window glass cracks (uneven heating)
  MELT: 1.6e4,       // paint blisters, plastic bumpers sag
  IGNITE: 2.2e4,     // canvas awnings, paper, leaves catch fire
  TREE: 3.0e4,       // a whole tree goes up; car tires melt and burn
  TAR: 6e4,          // asphalt turns liquid and boils
  GLASS: 3e5,        // glass softens and runs
  CAR: 8e5,          // car bodies (1 mm steel) sag
  STEEL: 3e6,        // a building's steel frame sags
  POUR: 1e7,         // concrete, brick and stone melt and pour
  VAPOR: 1e8,        // rock boils to gas
};

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.15, 5.4, 'Hotter than lava.'],
  [5.75, 8.0, 'As hot as a light bulb filament.'],
  [8.35, 10.6, 'Hotter than the surface of the Sun.'],
  [10.95, 13.2, 'Cars sag like wax.'],
  [13.55, 15.8, 'The building next to you starts to bend.'],
  [16.15, 18.4, 'Its walls melt and pour down.'],
  [21.35, 23.6, 'Hotter than a lightning bolt.'],
  [23.95, 26.2, 'The whole street boils into glowing gas.'],
  [26.55, 28.8, 'Everything for half a mile.'],
  [29.15, 31.4, 'Everything you can see.'],
  [31.75, 34.0, 'Hotter than the center of the Sun.'],
  [34.35, 36.6, 'Brighter than the Sun itself.'],
  [36.95, 39.2, 'Enough to blow the Earth apart.'],
  [39.55, 41.8, 'Hotter than anything ever made.'],
  [42.4, 44.6, 'Hotter than anything since the Big Bang.'],
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

// ---- the counter: TIMES HOTTER, the racing number, your temperature on the line under it ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtMult(mult) {
  if (mult < 10) return `${mult.toFixed(1)}x`;
  return `${fmtInt(mult)}x`;
}
export function fmtF(K) {
  const F = toF(K);
  // (round big numbers to 3 significant figures, so the digits don't flicker into nonsense precision)
  const d = Math.max(0, Math.floor(Math.log10(Math.max(F, 1))) - 2);
  const r = d > 1 ? Math.round(F / 10 ** d) * 10 ** d : Math.round(F);
  return `${fmtInt(r)}°F`;
}
export function counterAt(v) {
  const m = multAt(v);
  return { label: 'TIMES HOTTER', value: fmtMult(m), line: fmtF(T_BODY * m) };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.L = logMult(v);
  s.mult = Math.pow(10, s.L);
  s.T = T_BODY * s.mult;
  s.flash = smooth(V_WHITE - 0.035, V_WHITE, v);
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp };
