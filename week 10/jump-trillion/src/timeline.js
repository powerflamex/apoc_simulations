// "What if you jumped 1 trillion times higher?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// The counter is how many times higher your legs throw you. 1x = an ordinary 1.5 ft (0.457 m) jump. It races 10x every
// DT = 3.8 s, from 10x on frame 0 to 1 trillion x at 41.8 s. Every number below was checked (Nov 26, 2026):
//   push-off speed v0 = sqrt(2 g h0 N) = 2.995 m/s x sqrt(N) = 6.70 mph x sqrt(N)
//   how high: h = v0^2 R / (2 g R - v0^2) (gravity weakens with height; R = 6,371 km). Below ~100 km that is 1.5 ft x N:
//     10x 15 ft (over a 10.5 ft bus) | 100x 150 ft (a 12-storey roof is ~134 ft) | 1,000x 1,500 ft (the 1,250 ft tower) |
//     10,000x 2.84 mi = 4.6 km (through clouds at ~2 km; push-off 670 mph = Mach 0.87) |
//     100,000x 28.6 mi = 46 km (the sky is black; record skydive: Alan Eustace, 135,890 ft = 41.4 km, 2014; push-off
//     2,120 mph = Mach 2.8, a sonic boom) | 1,000,000x 306 mi = 493 km (the ISS flies at ~420 km; push-off 6,700 mph,
//     Mach 9: coming back down, the air squeezed in front of you heats to thousands of degrees: a fireball) |
//     escape speed 11.19 km/s = 25,020 mph is reached at 1.39e7 x: you never come down.
//   push-off energy = your weight x 1.5 ft x N = 70 kg x 9.81 x 0.457 m x N = 314 J x N (1 ton of TNT = 4.184e9 J):
//     1e8x 7.5 tons of TNT | 1e9x 75 tons | 1e10x 750 tons | 1e11x 7.5 kilotons | 1e12x 75 kilotons = 5 Hiroshimas (15 kt)
//   1e8x: 30 km/s, past the Moon's distance in ~4 hours | 1e9x: 95 km/s, faster than the Sun's escape speed from Earth's
//   orbit (42 km/s, or 72 km/s thrown the wrong way): you leave the solar system | 1e11x: 947 km/s, more than the Milky
//   Way's escape speed here (~550 km/s, 780 the wrong way): you leave the galaxy | 1e12x: 2,995 km/s = 1.0% of light.
// The rule for air (said in the description): air never slows you down (the heights are counted with no air drag; your
// body is unbreakable), but you still smash through it: the booms, the shaking glass and the fireball on the way down
// are the air you hit. The street under your feet takes a kick as big as the energy you leave with.
// Each jump is shown sped up (a 1,500 ft jump really takes 19 s in the air; 100,000x takes 3 minutes; 1,000,000x about
// 20 minutes). From 1e8x on, every step is a new jump from the same spot: the push-off at the street, then where it
// takes you.
import { smooth, clamp, lerp } from './util.js';
import { P, A } from './layout.js';

export const STORY_START = 0;
export const DT = 3.8;
export const G = 9.81, R_E = 6.371e6, V1 = Math.sqrt(2 * G * 0.4572);    // 2.995 m/s
export const logN = (v) => Math.min(12, 1 + v / DT);
export const timesAt = (v) => Math.pow(10, logN(v));
export const timeOfN = (n) => (Math.log10(n) - 1) * DT;
export const V_TRILLION = timeOfN(1e12);         // 41.8
export const N_ESC = Math.pow(11186 / V1, 2);    // 1.395e7
// height (m) a jump of strength N reaches (Infinity past escape speed)
export function heightOf(N) {
  const v2 = V1 * V1 * N, d = 2 * G * R_E - v2;
  return d <= 0 ? Infinity : (v2 * R_E) / d;
}
export const speedOf = (N) => V1 * Math.sqrt(N);
export const tntTons = (N) => (70 * G * 0.4572 * N) / 4.184e9;

// ---- the jumps: strength, push-off (p) and landing (l) in video time, where from and where to ----
// The first one is in real time (a 15 ft jump is 1.93 s in the air, frame 0 at its top); the others are sped up so each
// fits its 3.8 s step.
const T10 = 2 * Math.sqrt(2 * heightOf(10) / G);
export const JUMPS = [
  { n: 10, p: -T10 / 2, l: T10 / 2, from: A, to: P },
  { n: 100, p: timeOfN(100), l: 7.2 },
  { n: 1e3, p: timeOfN(1e3), l: 11.0 },
  { n: 1e4, p: timeOfN(1e4), l: 14.8 },
  { n: 1e5, p: timeOfN(1e5), l: 18.6 },
  { n: 1e6, p: timeOfN(1e6), l: 22.4 },
  { n: 1.4e7, p: timeOfN(1.4e7), l: Infinity },
  { n: 1e8, p: timeOfN(1e8), l: Infinity },
  { n: 1e9, p: timeOfN(1e9), l: Infinity },
  { n: 1e10, p: timeOfN(1e10), l: Infinity },
  { n: 1e11, p: timeOfN(1e11), l: Infinity },
  { n: 1e12, p: V_TRILLION, l: Infinity },
];
for (const j of JUMPS) { j.h = heightOf(j.n); j.from = j.from || P; j.to = j.to || P; j.v0 = speedOf(j.n); }
// the last jump that has pushed off by v (index), or -1
export function jumpAt(v) { let k = -1; JUMPS.forEach((j, i) => { if (v >= j.p) k = i; }); return k; }

export const V_WHITE = 45.0;                     // the 75-kiloton fireball has filled the frame: hard white
export const T_SWITCH = 45.5;                    // the loop point (full white since V_WHITE)
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// ---- the line under the counter: how high a jump at the counter's strength takes you ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function heightText(N) {
  const h = heightOf(N);
  if (!isFinite(h) || h > 3.84e8) return 'FOREVER';
  const ft = h / 0.3048, mi = h / 1609.344;
  if (ft < 5280) return `${fmtInt(ft)} FT`;
  if (mi < 100) return `${mi.toFixed(1)} MILES`;
  return `${fmtInt(mi)} MILES`;
}
export function counterAt(v) {
  const n = timesAt(v);
  const value = v >= V_TRILLION - 1e-6 ? '1,000,000,000,000x' : `${fmtInt(n)}x`;
  return { label: 'TIMES HIGHER', value, line: `YOU GO UP: ${heightText(n)}` };
}

// ---- gold popups (a phrase, never a number); never with a caption ----
export const BEATS = [
  { v: JUMPS[4].p + 0.05, say: 'EVERY WINDOW BLOWS OUT' },
  { v: 19.95, say: 'YOU PASS THE SPACE STATION' },
  { v: JUMPS[6].p + 0.55, say: 'YOU NEVER COME DOWN' },
  { v: 28.55, say: 'YOU PASS THE MOON' },
  { v: 32.15, say: 'YOU LEAVE THE SOLAR SYSTEM' },
  { v: 39.55, say: 'YOU LEAVE THE GALAXY' },
];
export const POP = 1.6;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}

// ---- captions (one at a time; none while the title or a popup is up) ----
export const CAPTIONS = [
  [4.35, 6.6, 'Higher than a 12-storey roof.'],
  [7.75, 10.2, 'Over the tallest tower in the city.'],
  [11.55, 14.0, 'You push off at almost the speed of sound.'],
  [16.9, 18.55, 'Higher than anyone has ever skydived.'],
  [21.65, 23.3, 'You come back down as a fireball.'],
  [26.75, 28.45, 'Your push-off: 7.5 tons of TNT.'],
  [30.55, 32.05, '75 tons of TNT.'],
  [34.4, 37.6, '750 tons of TNT. The block is gone.'],
  [38.15, 39.5, 'Half a Hiroshima bomb.'],
  [41.95, 43.35, 'You leave at 1% of light speed.'],
  [43.45, 44.95, 'Like 5 Hiroshima bombs at once.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.25), fadeOut = clamp((b - v) / 0.25);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.L = logN(v);
  s.N = Math.pow(10, s.L);
  s.flash = smooth(V_WHITE - 0.9, V_WHITE, v);
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp, smooth, clamp };
