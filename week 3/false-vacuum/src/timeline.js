// "What if false vacuum decay happened?" — the story as functions of VIDEO time v (seconds).
// A bubble of "true vacuum" (where the Higgs field sits lower and particles, atoms and chemistry can't be what they
// are here) forms beyond Neptune and grows at (very nearly) the speed of light. Out here it is effectively a flat
// wall moving from the far side of the Sun toward Earth. Everything it reaches is gone; nothing can warn you, because
// any warning would travel no faster than the wall itself.
//
// The clock: tau = seconds until the wall reaches YOU (a crowd on the Champs-Élysées in Paris, at sunset: the Sun is
// low behind the Arc de Triomphe, so the wall comes straight down the avenue). Distances along the wall's path:
//   Neptune 31.07 AU (4 h 18 min), Saturn 10.58 AU (1 h 28 min), Jupiter 6.20 AU (51.6 min), the Sun 1 AU (8 min
//   19 s; its 1.39 million km take 4.6 s to swallow), the Moon (40° from the Sun in the evening sky: 0.98 s, gone in
//   11.6 ms), Earth's sunlit side (20.6 ms: the side facing the Sun goes first; Paris is on the edge of night).
//   Then the street: 1 foot every billionth of a second.
// The video alternates slow motion (each body being cut) and fast-forward (the counter racing between them):
// tauAt(v) is built from anchors with a fixed rate, joined by smooth curves in log(tau).
import { smooth, clamp, lerp } from './util.js';

export const C_KM = 299792.458;                      // km/s
export const MI_S = 186282.397;                      // miles per second
export const FT_S = 983571056.4;                     // feet per second
export const AU_S = 149597870.7 / C_KM;              // light seconds per AU (499.0)
export const R = { nep: 24622, sat: 58232, satRing: 136775, jup: 69911, sun: 695700, moon: 1737.4, earth: 6371 };
export const SUN_EL = 1.9;                           // the Sun's height over the horizon in Paris when the wall arrives (degrees)
const PARIS_AHEAD = R.earth * Math.sin(SUN_EL * Math.PI / 180) / C_KM;   // Paris is this much nearer the Sun than Earth's centre
// tau when the wall passes each body's centre
export const T = {
  nep: (1 + 30.07) * AU_S - PARIS_AHEAD,
  sat: (1 + 9.58) * AU_S - PARIS_AHEAD,
  jup: (1 + 5.204) * AU_S - PARIS_AHEAD,
  sun: AU_S - PARIS_AHEAD,
  moon: (384400 * Math.cos(40 * Math.PI / 180)) / C_KM - PARIS_AHEAD,
  earth: -PARIS_AHEAD,                                // (Earth's centre is passed just after Paris)
};
T.sub = T.earth + R.earth / C_KM;                     // the point under the Sun: the first bit of Earth to go

// ---- the clock ----
// anchors: [v0, v1, tau0, tau1] at a steady rate (lin) or a steady slow-down (exp: tau falls by the same factor
// every second)
const A = [
  { v0: 0.0, v1: 2.5, t0: T.nep + 0.30 * R.nep / C_KM, t1: T.nep - 1.15 * R.nep / C_KM },   // Neptune, 22x slow motion
  { v0: 4.3, v1: 7.0, t0: T.sat + 0.62, t1: T.sat - 0.62 },                                   // Saturn and its rings
  { v0: 8.6, v1: 10.8, t0: T.jup + 0.42, t1: T.jup - 0.32 },                                  // Jupiter
  { v0: 12.2, v1: 17.6, t0: T.sun + 3.0, t1: T.sun - 2.4 },                                   // the Sun, at real speed
  { v0: 19.4, v1: 28.4, t0: 340, t1: 1.6, exp: true },                                        // Paris: time-lapse slowing to real time
  { v0: 29.9, v1: 31.3, t0: T.moon + 0.0075, t1: T.moon - 0.0075 },                          // the Moon
  { v0: 32.7, v1: 35.8, t0: 0.0213, t1: 0.0016 },                                             // Earth, sunlit side first
  { v0: 36.5, v1: 58.4, t0: 1.0e-3, t1: 3.0e-9, exp: true },                                  // Paris again, a million, then a billion times slower
];
const fin = A[A.length - 1];
const lslope = (a) => a.exp ? Math.log(a.t1 / a.t0) / (a.v1 - a.v0) : 0;     // d ln(tau)/dv inside an exp anchor
const rateAt = (a, edge) => a.exp ? (edge ? a.t1 : a.t0) * lslope(a) : (a.t1 - a.t0) / (a.v1 - a.v0);
// the last 1.7 s: straight on at the rate the slow-down reached (3 nanoseconds -> 0)
export const RATE_END = -rateAt(fin, 1);
export const V_HIT = fin.v1 + fin.t1 / RATE_END;      // the wall reaches you (~60.1 s)
export const T_SWITCH = V_HIT + 0.5;                 // full white; the loop point sits in it
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const STORY_START = 0;

function inAnchor(a, v) {
  const k = (v - a.v0) / (a.v1 - a.v0);
  return a.exp ? a.t0 * Math.exp(lslope(a) * (v - a.v0)) : lerp(a.t0, a.t1, k);
}
export function tauAt(v) {
  if (v <= A[0].v0) return A[0].t0 + (A[0].v0 - v) * -rateAt(A[0], 0);   // (before frame 0: the loop's lead-in)
  if (v >= fin.v1) return Math.max(0, fin.t1 - (v - fin.v1) * RATE_END);
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (v <= a.v1) {
      if (v >= a.v0) return inAnchor(a, v);
      // between anchors: a cubic in ln(tau) that leaves the last anchor and meets this one at their own rates
      const p = A[i - 1], h = a.v0 - p.v1, s = (v - p.v1) / h;
      const y0 = Math.log(p.t1), y1 = Math.log(a.t0);
      // (each end's own rate, limited so the curve can't overshoot and run backwards)
      const d = y1 - y0;
      const lim = (m) => Math.max(3 * d, Math.min(0, m));
      const m0 = lim(rateAt(p, 1) / p.t1 * h), m1 = lim(rateAt(a, 0) / a.t0 * h);
      const s2 = s * s, s3 = s2 * s;
      return Math.exp((2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * m1);
    }
  }
  return 0;
}
// how fast story time runs (story seconds per video second)
export const rateOf = (v) => Math.max(1e-12, (tauAt(v - 0.004) - tauAt(v + 0.004)) / 0.008);
// first video time at which tau has fallen to x
export function vAtTau(x) {
  let a = -2, b = VIDEO_DURATION;
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (tauAt(m) > x) a = m; else b = m; }
  return (a + b) / 2;
}

// ---- the shots ----
// Each space shot ends the moment the wall reaches the camera (CLEAR: how far ahead of the body's centre the camera
// is by then, in body radii); the next shot starts there.
export const CLEAR = { neptune: 3.0, saturn: 3.3, jupiter: 3.0, sun: 3.2, moon: 2.6 };
const cutAt = (b, km) => vAtTau(T[b] - CLEAR[{ nep: 'neptune', sat: 'saturn', jup: 'jupiter', sun: 'sun', moon: 'moon' }[b]] * km / C_KM);
export const SHOTS = [
  { v: -9, name: 'neptune' },
  { v: cutAt('nep', R.nep), name: 'saturn' },
  { v: cutAt('sat', R.sat), name: 'jupiter' },
  { v: cutAt('jup', R.jup), name: 'sun' },
  { v: cutAt('sun', R.sun), name: 'paris' },     // time-lapse
  { v: 28.75, name: 'moon' },
  { v: cutAt('moon', R.moon), name: 'earth' },
  { v: 36.2, name: 'slowmo' },                   // Paris, frozen
];
export function shotAt(v) {
  let s = SHOTS[0];
  for (const x of SHOTS) if (v >= x.v) s = x;
  return s.name;
}
export const shotStart = (name) => SHOTS.find((s) => s.name === name).v;

// ---- the beats: a big gold word as the wall reaches each body (boom + jolt) ----
export const BEATS = [
  { v: vAtTau(T.sat + R.satRing / C_KM), w: 'Saturn', k: '984 MILLION MILES FROM YOU' },
  { v: vAtTau(T.jup + R.jup / C_KM), w: 'Jupiter', k: '577 MILLION MILES FROM YOU' },
  { v: vAtTau(T.sun + R.sun / C_KM), w: 'The Sun', k: '93 MILLION MILES FROM YOU' },
  { v: vAtTau(T.moon + R.moon / C_KM), w: 'The Moon', k: '239,000 MILES FROM YOU' },
  { v: vAtTau(T.sub), w: 'Earth', k: 'THE SIDE FACING THE SUN' },
];
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}

// ---- captions (video time) ----
export const CAPTIONS = [
  [3.25, 5.95, 'A bubble of new physics is growing at the speed of light.'],
  [6.15, 8.55, 'Inside it, atoms as we know them can’t exist.'],
  [8.75, 11.05, 'Nothing can warn us. No signal is faster.'],
  [12.3, 15.1, 'Real speed: it swallows the Sun in 4.6 seconds.'],
  [15.4, 18.1, 'The Sun is gone.'],
  [18.6, 21.4, 'But in Paris, you still see it shining.'],
  [21.6, 24.5, 'Its last light is still on the way to you.'],
  [24.7, 28.3, 'And the bubble is right behind it.'],
  [29.0, 31.5, 'The Moon. Gone in a hundredth of a second.'],
  [31.9, 33.9, 'Then Earth, starting with the side facing the Sun.'],
  [34.1, 36.1, 'Half the planet is already gone.'],
  [36.7, 39.6, 'Back in Paris, slowed down a million times.'],
  [39.8, 42.6, 'Nobody here sees it coming.'],
  [42.8, 45.6, 'It moves 1 foot every billionth of a second.'],
  [45.9, 48.7, 'The Arc de Triomphe goes first.'],
  [48.9, 51.8, 'Then the trees, the cars, the street.'],
  [52.0, 54.5, 'Far too fast to feel anything.'],
  [54.9, 57.6, 'The people next to you never knew.'],
  [57.8, 59.95, 'Neither will you.'],
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

// ---- the counter: how far the bubble is from you, and how long until it arrives ----
const comma = (n) => Math.round(n).toLocaleString('en-US');
function timeLeft(t) {
  if (t >= 3600) { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60); return `${h} H ${String(m).padStart(2, '0')} MIN`; }
  if (t >= 60) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m} MIN ${String(s).padStart(2, '0')} S`; }
  if (t >= 1) return `${t.toFixed(1)} SECONDS`;
  const part = (n, w) => `${n} ${w}${n === 1 ? 'TH' : 'THS'} OF A SECOND`;
  if (t >= 1e-3) return part(Math.max(1, Math.round(t * 1e3)), 'THOUSAND');
  if (t >= 1e-6) return part(Math.max(1, Math.round(t * 1e6)), 'MILLION');
  if (t > 0) return part(Math.max(1, Math.round(t * 1e9)), 'BILLION');
  return 'NOW';
}
export const milesAt = (v) => tauAt(v) * MI_S;
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2,
    label: 'THE BUBBLE IS',
    labelFn: () => 'THE BUBBLE IS',
    fmt: (t) => {
      const mi = t * MI_S;
      if (mi >= 10) return comma(mi);
      if (mi >= 1) return mi.toFixed(1);
      const ft = t * FT_S;
      return ft >= 10 ? comma(ft) : ft.toFixed(1);
    },
    value: (v) => tauAt(v),
    unit: (v) => { const t = tauAt(v); return `${t * MI_S >= 1 ? 'MILES' : 'FEET'} AWAY · HITS YOU IN ${timeLeft(t)}`; },
    badge: () => 'IT MOVES AT THE SPEED OF LIGHT',
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.tau = tauAt(v);
  s.rate = rateOf(v);
  s.shot = shotAt(v);
  s.title = 1 - smooth(2.6, 3.2, v);
  s.flash = v >= V_HIT - 0.25 ? smooth(V_HIT - 0.25, V_HIT + 0.05, v) : 0;
  s.flashColor = '#fbf8ff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
