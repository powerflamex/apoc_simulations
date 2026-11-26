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
// The story (rework, Nov 26: ONE person, in order, cause before result):
//   0:00-0:22.6 six jumps that land: 10x (frame 0, real time), 100x, 1,000x, 10,000x, 100,000x, 1,000,000x, each in the
//   order crouch -> push-off (the kick at your feet) -> up -> the top -> down -> the landing hit. Each is shown sped up
//   (1,500 ft is 19 s in the air, 1,000,000x about 20 minutes); from 1,000x the flight is drawn in log-height (the first
//   and last metres slowed, so the kick and the hit can be seen).
//   0:22.6-0:30.5 the last jump: you crouch in the crater and stay down while the counter races 1 million -> 1 trillion.
//   0:30.5 the push-off (75 kilotons), at your feet, then from down the avenue; 0:35.2-0:43.6 your flight; white, loop.
import { smooth, clamp, lerp } from './util.js';
import { P, A } from './layout.js';

export const STORY_START = 0;
export const DT = 3.8;
export const G = 9.81, R_E = 6.371e6, V1 = Math.sqrt(2 * G * 0.4572);    // 2.995 m/s
export const V_HOLD = 19.0, V_RACE = 23.0, V_TRILLION = 30.5;   // the counter: 10x/3.8 s to 1e6, held, then raced to 1e12
export function logN(v) {
  if (v < V_HOLD) return 1 + v / DT;
  if (v < V_RACE) return 6;
  const k = clamp((v - V_RACE) / (V_TRILLION - V_RACE));
  return 6 + 6 * (0.35 * k + 0.65 * k * k);
}
export const timesAt = (v) => Math.pow(10, logN(v));
export function timeOfN(n) {
  const L = Math.log10(n);
  if (L <= 6) return (L - 1) * DT;
  let lo = V_RACE, hi = V_TRILLION;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (logN(m) < L) lo = m; else hi = m; }
  return hi;
}
export const N_ESC = Math.pow(11186 / V1, 2);    // 1.395e7
// height (m) a jump of strength N reaches (Infinity past escape speed)
export function heightOf(N) {
  const v2 = V1 * V1 * N, d = 2 * G * R_E - v2;
  return d <= 0 ? Infinity : (v2 * R_E) / d;
}
export const speedOf = (N) => V1 * Math.sqrt(N);
export const tntTons = (N) => (70 * G * 0.4572 * N) / 4.184e9;

// ---- the jumps: strength, push-off (p), landing (l), from, to ----
const T10 = 2 * Math.sqrt(2 * heightOf(10) / G);
export const JUMPS = [
  { n: 10, p: -T10 / 2, l: T10 / 2, from: A, to: P },
  { n: 100, p: 3.8, l: 7.2 },
  { n: 1e3, p: 7.6, l: 11.0 },
  { n: 1e4, p: 11.4, l: 14.8 },
  { n: 1e5, p: 15.2, l: 18.6 },
  { n: 1e6, p: 19.0, l: 22.6 },
  { n: 1e12, p: V_TRILLION, l: Infinity },
];
for (const j of JUMPS) { j.h = heightOf(j.n); j.from = j.from || P; j.to = j.to || P; j.v0 = speedOf(j.n); }
export function jumpAt(v) { let k = -1; JUMPS.forEach((j, i) => { if (v >= j.p) k = i; }); return k; }
// height above the take-off ground at fraction u of a landing jump's video time: the real parabola for the first two,
// log-height for the rest (y0 ((h/y0 + 1)^G - 1), G = 1 - |2u - 1|^1.5)
export function flightY(j, u) {
  if (j.n <= 100) return j.h * 4 * u * (1 - u);
  const G2 = 1 - Math.pow(Math.abs(2 * u - 1), 1.5);
  return Math.pow(j.h + 1, G2) - 1;
}

export const V_FEET = V_TRILLION;                // the push-off, at your feet
export const V_FAR = 30.9;                       // from down the avenue
export const V_SPACE = 35.2;                     // your flight
export const V_WHITE = 44.1;
export const T_SWITCH = 44.6;
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// ---- the line under the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function heightText(N) {
  const h = heightOf(N);
  if (!isFinite(h)) return 'FOREVER';
  const ft = h / 0.3048, mi = h / 1609.344;
  if (ft < 5280) return `${fmtInt(ft)} FT`;
  if (mi < 100) return `${mi.toFixed(1)} MILES`;
  return `${fmtInt(mi)} MILES`;
}
export function lineAt(v) {
  const n = timesAt(v);
  if (v >= V_FEET) return 'YOU WILL LEAVE THE GALAXY';
  if (v < V_RACE) return `YOU GO UP: ${heightText(n)}`;
  if (n >= 1e11) return 'YOU WOULD LEAVE THE GALAXY';
  if (n >= 1e9) return 'YOU WOULD LEAVE THE SOLAR SYSTEM';
  if (n >= N_ESC) return 'YOU WOULD NEVER COME DOWN';
  return `YOU WOULD GO UP: ${heightText(n)}`;
}
export function counterAt(v) {
  const n = timesAt(v);
  const value = v >= V_TRILLION - 1e-6 ? '1,000,000,000,000x' : `${fmtInt(n)}x`;
  return { label: 'TIMES HIGHER', value, line: lineAt(v) };
}

// ---- gold popups (a phrase, never a number); never with a caption ----
export const BEATS = [
  { v: 15.3, say: 'EVERY WINDOW BLOWS OUT' },
  { v: 20.0, say: 'YOU PASS THE SPACE STATION' },
  { v: V_SPACE + 0.15, say: 'YOU NEVER COME DOWN' },
];
export const POP = 1.6;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}

// ---- captions (one at a time; none while the title or a popup is up) ----
export const CAPTIONS = [
  [4.9, 6.9, 'Over a 12-storey roof.'],
  [8.6, 10.6, 'Over the tallest tower.'],
  [11.5, 13.0, 'Almost the speed of sound.'],
  [13.1, 14.6, 'Above the clouds.'],
  [16.95, 18.5, 'Higher than any skydive.'],
  [21.65, 22.9, 'You come back as a fireball.'],
  [23.1, 25.2, 'This time, push harder.'],
  [31.0, 32.8, 'Like 5 Hiroshima bombs.'],
  [32.95, 35.0, 'You leave at 1% of light speed.'],
  [36.9, 38.85, 'The Moon, 2 minutes later.'],
  [39.0, 40.9, 'Jupiter, 3 days later.'],
  [41.0, 43.4, '17 days: the Sun is just a star.'],
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

export function state(v) {
  const s = { v };
  s.L = logN(v);
  s.N = Math.pow(10, s.L);
  s.flash = smooth(V_WHITE - 0.6, V_WHITE, v);
  // the 1-trillion push-off: a white flash at your feet
  s.flash = Math.max(s.flash, smooth(V_TRILLION - 0.02, V_TRILLION, v) * (1 - smooth(V_TRILLION + 0.12, V_FAR + 0.05, v)) * 0.97);
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp, smooth, clamp };
// the video time a landing jump passes height y (on the way up, or down)
export function timeAtY(j, y, down = false) {
  let lo = down ? 0.5 : 0, hi = down ? 1 : 0.5;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; const above = flightY(j, m) > y; if (above !== down) hi = m; else lo = m; }
  return j.p + ((lo + hi) / 2) * (j.l - j.p);
}
