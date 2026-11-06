// "What if a metal rod as tall as a skyscraper fell on your city?" — the story as functions of VIDEO time v
// (seconds; STORY_START = 0). A packed avenue in daylight; you stand on the crossing in the crowd. A solid tungsten
// rod, 300 m long and 25 m wide (as tall as a skyscraper), has been dropped from rest 1,000 km up (620 miles, space:
// twice the height of the space station) and falls straight at the far end of the avenue. The video is a time-lapse of
// its last 8 minutes, slowing to real time and then slow motion in the last seconds.
// The numbers (worked out below from G M_earth = 3.986e14 m^3/s^2, tungsten 19,300 kg/m^3; air drag is left out: at
// 4 km/s a 1-million-ton rod loses under 0.1% of its speed in the air, 0.9 m/s^2 against gravity's 9.8):
//   - mass: 19,300 x pi x 12.5^2 x 300 = 2.84 billion kg = 2.84 million tonnes (3.1 million US tons): "3 million tons";
//   - the fall from rest at 1,000 km takes 8 min 29 s; it enters the air (100 km) 25 s before impact at 3.9 km/s
//     (8,700 mph), and hits at 4.12 km/s = 9,200 mph = Mach 12;
//   - its energy at impact: 1/2 m v^2 = 2.4e16 J = 5.8 million tons of TNT = 384 Hiroshima bombs (15 kt each);
//   - the air in front of it: the ideal-gas stagnation temperature at Mach 12 is 8,600 K; real air (dissociating,
//     ionising) stays nearer 6,000-7,000 K, i.e. over 10,000 °F: the nose glows white and the air round it is a plasma;
//   - its own sound never reaches you before it does: it is 12x faster than sound, and the shock from its entry at
//     100 km would take 5 minutes to reach the ground.
// What is drawn vs what is real: every number on screen (the countdown, the speed, the captions) comes from the fall
// above. The rod itself is a picture, not to scale: drawn ROD_DRAW times bigger than real (same shape), on a path that
// brings it nearer by the same factor every 3 s. The real one would be a dot 1,000 km up at 8 minutes out, and never
// more than a third of the frame high from 500 m away.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const GM = 3.986004e14, RE = 6.371e6, H0 = 1000e3, R0 = RE + H0;
export const ROD_L = 300, ROD_R = 12.5, RHO = 19300;
export const ROD_DRAW = 5.5;                                     // how much bigger than real the rod is drawn (see above)
export const MASS = RHO * Math.PI * ROD_R * ROD_R * ROD_L;       // 1.023e9 kg
export const MILE = 1609.344;
export const KT = 4.184e12;                                      // J per kiloton of TNT

// ---- the fall: time left before impact T -> height and speed (integrated from the ground up) ----
const TAB_T = [], TAB_H = [];
export const speedAtH = (h) => Math.sqrt(Math.max(0, 2 * GM * (1 / (RE + h) - 1 / R0)));
{
  let h = 0, T = 0;
  TAB_T.push(0); TAB_H.push(0);
  while (h < H0 - 1) {
    const dh = Math.min(20, H0 - h);
    T += dh / speedAtH(h + dh / 2); h += dh;
    TAB_T.push(T); TAB_H.push(h);
  }
}
export const T_FALL = TAB_T[TAB_T.length - 1];                   // 509 s
export function hOfT(T) {
  if (T <= 0) return 0;
  if (T >= T_FALL) return H0;
  let lo = 0, hi = TAB_T.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TAB_T[m] < T) lo = m; else hi = m; }
  return lerp(TAB_H[lo], TAB_H[hi], (T - TAB_T[lo]) / (TAB_T[hi] - TAB_T[lo]));
}
export const speedAtT = (T) => speedAtH(hOfT(T));
export const V_IMPACT = speedAtH(0);                             // 4,120 m/s
export const ENERGY = 0.5 * MASS * V_IMPACT * V_IMPACT;           // 8.7e15 J
export const MEGATONS = ENERGY / KT / 1000;                      // 2.08
export const HIROSHIMAS = ENERGY / (15 * KT);                    // 138
export const MACH = V_IMPACT / 343;                              // 12.0
// when it enters the air (100 km up)
export const T_AIR = (() => { let a = 0, b = T_FALL; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (hOfT(m) < 100e3) a = m; else b = m; } return (a + b) / 2; })();

// ---- the time-lapse: time left at video time v. A jump every 3 s (most of each step in its first half second), then
// smoother near the end, where it slows past real time into slow motion ----
export const T_START = 480;
const KEYS = [480, 330, 225, 150, 95, 55, 25, 16, 9.5, 6, 3.6, 2.2, 1.4, 0.9, 0];
const STEP = 3, C = 0.2;
export const V_HIT = (KEYS.length - 1) * STEP;                   // 42: the tip touches the ground
const N = KEYS.length - 1;
const stepAt = (v) => { const k = Math.min(Math.floor(v / STEP), N - 1); return { k, u: clamp((v - k * STEP) / STEP) }; };
// how far through a step: most of it in the first half second if jump > 0, even if jump = 0
const eased = (u, jump) => jump * smooth(0, 0.17, u) + (1 - jump) * u;
export const V_SLOW = 27;             // from here the clock runs slower than real time (the label says so)
export function Tleft(v) {
  if (v <= 0) return KEYS[0] * Math.pow(KEYS[0] / KEYS[1], -v / STEP);   // (before frame 0: the same race)
  if (v >= V_HIT) return 0;
  const { k, u } = stepAt(v);
  if (k === N - 1) return KEYS[k] * (1 - u);        // the last 3 s: an even 0.3x
  const jump = k === 0 || v >= V_SLOW ? 0 : 0.72;    // the first 3 s are all race; no jumps in the slow motion
  return Math.exp(lerp(Math.log(KEYS[k] + C), Math.log(KEYS[k + 1] + C), eased(u, jump))) - C;
}
export const STEPS = KEYS.slice(1).map((_, i) => (i + 1) * STEP);
// how far along the fall the picture is: 0 on frame 0, 1 at the hit, the same share on every 3 s step, so the rod
// looks the same factor bigger after each one (it still lurches on the beat in the slow motion; the clock doesn't)
export function progress(v) {
  if (v <= 0) return v / (STEP * N);
  if (v >= V_HIT) return 1;
  const { k, u } = stepAt(v);
  return (k + eased(u, k === 0 || k === N - 1 ? 0 : v < V_SLOW ? 0.72 : 0.45)) / N;
}
export function vOfT(T) {
  let a = -1, b = V_HIT;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (Tleft(m) > T) a = m; else b = m; }
  return (a + b) / 2;
}

// ---- the events (video time) ----
export const V_ALERT = 6.0;          // every phone gets the same alert; the big screens switch to it
export const V_PANIC = 12.0;         // traffic jams, people run, cars abandoned
export const V_GLOW = 18.0;          // the tip starts to glow (it enters the air: 25 s left, 100 km up)
export const V_FIRE = 24.0;          // the air round it catches fire: a burning streak up the sky
export const V_SILENT = 30.0;        // the trail fills the sky and lights the street; you never hear it coming
export const V_FILL = 36.0;          // it fills the sky over the avenue
export const V_WALL = 47.25;         // the blast wall reaches you
export const T_SWITCH = 47.8;        // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- the numbers the captions use (computed, so they match the counter) ----
export const mphAt = (v) => Math.round(speedAtT(Tleft(v)) / MILE * 3600 / 100) * 100;
const FEET = (Math.round(ROD_L * 3.28084 / 100) * 100).toLocaleString('en-US');

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_ALERT + 0.25, 'EVERY PHONE GETS THE ALERT'],
  [V_PANIC + 0.3, 'THE WHOLE STREET RUNS'],
  [V_GLOW + 0.3, 'THE TIP STARTS TO GLOW'],
  [V_FIRE + 0.3, 'THE AIR CATCHES FIRE'],
  [V_SILENT + 0.3, 'YOU NEVER HEAR IT COMING'],
  [V_FILL + 0.3, 'IT FILLS THE SKY'],
  [V_HIT + 0.45, 'IT HITS THE FAR END OF THE CITY'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together) ----
const gap = 0.2;
export const CAPTIONS = [
  [3.3, V_ALERT + 0.05, `It’s solid tungsten, ${FEET} feet long.`],
  [V_ALERT + 0.25 + POP + gap, V_PANIC + 0.1, `It weighs ${Math.round(MASS / 1e3 / 1e6)} million tons.`],
  [V_PANIC + 0.3 + POP + gap, V_GLOW + 0.1, `It’s already doing ${mphAt(V_PANIC + 0.3 + POP + gap).toLocaleString('en-US')} mph.`],
  [V_GLOW + 0.3 + POP + gap, V_FIRE + 0.1, 'The air can’t slow it down.'],
  [V_FIRE + 0.3 + POP + gap, V_SILENT + 0.1, `It’s ${Math.round(MACH)} times faster than sound.`],
  [V_SILENT + 0.3 + POP + gap, V_FILL + 0.1, 'The air in front of it is over 10,000 °F.'],
  [V_FILL + 0.3 + POP + 0.05, 39.4, 'You have 1 second left.'],      // (while the counter reads 1.0 to 0.8)
  [V_HIT + 0.45 + POP + gap, V_WALL - 0.2, `That’s ${Math.round(HIROSHIMAS / 10) * 10} Hiroshima bombs.`],
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

// ---- the counter: time left, racing down; its speed under it ----
const pad = (n) => String(n).padStart(2, '0');
export function fmtLeft(T) {
  if (T < 10) return `0m 0${(Math.floor(Math.max(0, T) * 10 + 1e-6) / 10).toFixed(1)}s`;     // tenths: it never sits still
  const s = Math.floor(T + 1e-6);
  return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
}
export const COUNTERS = [
  {
    from: -3, to: V_HIT + 0.45, label: 'IMPACT IN  ·  TIME-LAPSE',          // (it fades under the flash of the hit)
    labelFn: (v) => `IMPACT IN  ·  ${v < V_SLOW ? 'TIME-LAPSE' : 'SLOW MOTION'}`,
    fmt: (T) => fmtLeft(T),
    value: (v) => Tleft(v),
    unit: (v) => `${(Math.round(speedAtT(Math.max(0, Tleft(v))) / MILE * 3600 / 10) * 10).toLocaleString('en-US')} MPH`,
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.T = Tleft(v);
  s.h = hOfT(Math.max(0, s.T));
  s.speed = speedAtT(Math.max(0, s.T));
  s.p = progress(v);
  s.title = 1 - smooth(2.9, 3.35, v);
  // how much of the jump is happening now (0..1, for the whoosh, the camera kick, the bloom)
  s.kick = 0;
  for (const t of STEPS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.05, dt) * Math.exp(-Math.max(dt, 0) / 0.3)); }
  s.react = smooth(0.2, 2.5, v);
  s.alert = smooth(V_ALERT, V_ALERT + 0.6, v);
  s.panic = smooth(V_PANIC, V_PANIC + 2, v);
  s.glow = smooth(V_GLOW, V_GLOW + 2.5, v);                                  // the tip, white hot
  s.fire = smooth(V_FIRE, V_FIRE + 4, v);                                    // the burning air round it
  s.trail = smooth(V_FIRE + 0.5, V_FILL + 2, v);                             // the streak up the sky
  s.light = smooth(V_SILENT - 1, V_FILL + 3, v);                             // its light on the street
  s.fill = smooth(V_FILL, V_FILL + 3, v);
  s.hit = v >= V_HIT;
  s.age = Math.max(0, v - V_HIT);                                             // since the hit (video seconds)
  // the blast front's distance from the hit point: the wall reaches you (510 m) at V_WALL, slowing as it goes
  { const u = clamp(s.age / (V_WALL - V_HIT)); s.front = s.hit ? 512 * (1 - Math.pow(1 - u, 1.55)) : -1; }
  s.flashPop = s.hit ? Math.exp(-s.age / 0.22) : 0;                         // the flash of the hit
  s.flash = smooth(V_WALL - 0.25, T_SWITCH - 0.03, v);                      // the white the wall brings
  s.flashColor = '#fff6ea';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
