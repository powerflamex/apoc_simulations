// "What if the oceans drained away?": the story as functions of VIDEO time v (seconds; STORY_START = 0).
// You're on a packed beach and the sea runs away from you. You follow the water's edge down the seabed, and each thing
// you pass is deeper and stranger, until you stand on the deepest spot on Earth. Then the water comes back.
// The walk is a time-lapse (it would take weeks on foot): the counter is the sea level, in feet, and it never stops.
// The numbers (checked Nov 10, 2026):
//   - giant kelp grows down to about 100 ft, so it lies around the first wreck (about -100 ft), not deeper;
//   - the edge of the continental shelf, where the seabed drops away, is on average about 440 ft down (it varies, 65-1,800 ft);
//   - hot vents ("black smokers") sit mostly 7,000-8,000 ft down on the mid-ocean ridges (Von Damm field 7,500 ft; the
//     deepest known are at 16,000 ft); giant tube worms live round them;
//   - the Titanic's bow lies at about 12,500 ft (NOAA: 12,467 ft / 3,800 m), upright, its prow buried in the mud;
//   - the deep ocean plains are 13,000-20,000 ft down, and undersea mountains (seamounts) stand thousands of feet above them;
//   - the Mariana Trench's Challenger Deep, the deepest spot on Earth: 35,876 ft (10,935 m, NOAA 2021; other surveys give
//     35,800-36,070 ft), "about 36,000 ft" here. Mount Everest is 29,032 ft tall, so it would fit with over a mile to spare.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;

// ---- the shots (each starts on a blurred dash forward: the time-lapse skipping ahead) ----
export const V_WRECK = 4.8;            // down on the seabed: the rusted shipwreck
export const V_WHALES = 7.5;           // stranded whales on the shelf...
export const V_EDGE = 10.3;            // ...and the seabed drops away in front of you (same shot)
export const V_CARGO = 13.1;           // a sunken cargo ship
export const V_VENTS = 17.3;           // smoking hot vents
export const V_TITANIC = 21.5;         // the Titanic's bow
export const V_MOUNT = 25.8;           // an undersea mountain rises out of the falling sea
export const V_TRENCH = 30.0;          // the Mariana Trench: the walls close in
export const V_BOTTOM = 35.6;          // the bottom of the trench
export const V_FLOOR = 40.5;           // the counter reaches -36,000 ft: you step onto the deepest spot
export const V_ROAR = 42.4;            // a roar
export const V_WAVE = 43.0;            // the water comes back round the bend
export const V_HIT = 46.15;            // it hits the lens
export const V_WHITE = 46.32;          // full white
export const T_SWITCH = 46.9;          // the loop point, inside the white
export const LOOP = 0.6;
export const VIDEO_DURATION = T_SWITCH + LOOP;        // 47.5 s
export const CUTS = [V_WRECK, V_WHALES, V_CARGO, V_VENTS, V_TITANIC, V_MOUNT, V_TRENCH, V_BOTTOM];
export const SHOTS = ['beach', 'wreck', 'shelf', 'cargo', 'vents', 'titanic', 'mount', 'trench', 'bottom'];
export function shotAt(v) { let i = 0; while (i < CUTS.length && v >= CUTS[i]) i++; return i; }
export const shotStart = (i) => (i === 0 ? 0 : CUTS[i - 1]);
export const shotEnd = (i) => (i < CUTS.length ? CUTS[i] : VIDEO_DURATION);

// ---- the sea level (feet below today's), at video time v ----
export const FLOOR_FT = 36000, EVEREST_FT = 29032;
const FT = [[0, 3], [2.5, 30], [6.0, 100], [8.0, 300], [11.5, 600], [15.2, 3000], [19.4, 7500], [23.6, 12500], [27.9, 16500], [31.0, 20000], [36.5, 31000]];
export function feetAt(v) {
  const n = FT.length;
  if (v >= V_FLOOR) return FLOOR_FT;
  if (v >= FT[n - 1][0]) { const u = (v - FT[n - 1][0]) / (V_FLOOR - FT[n - 1][0]); return FT[n - 1][1] + (FLOOR_FT - FT[n - 1][1]) * (1 - Math.pow(1 - u, 2.4)); }
  let i = 0;
  if (v > FT[0][0]) while (v >= FT[i + 1][0]) i++;
  const [a, fa] = FT[i], [b, fb] = FT[i + 1];
  return Math.exp(lerp(Math.log(fa), Math.log(fb), (v - a) / (b - a)));     // (v < 0, the loop's lead-in: the same curve run backwards)
}
export const M = 0.3048;

// ---- the dash between shots: the camera rushes forward into a blur, the cut hides in it, and it rushes on out ----
export const DASH_IN = 0.3, DASH_OUT = 0.34;
export function dashAt(v) {
  let blur = 0, push = 0;
  for (const c of CUTS) {
    const dt = v - c;
    if (dt < -DASH_IN || dt > DASH_OUT) continue;
    if (dt < 0) { const u = 1 + dt / DASH_IN; blur = u * u; push = 7 * u * u * u; }
    else { const u = 1 - dt / DASH_OUT; blur = u * u; push = -9 * u * u * u; }
  }
  return { blur, push };
}

// ---- the gold popups: one phrase naming what you see (never a number) ----
export const POP = 1.6;
export const POPS = [
  [3.2, 'THE SEA RUNS AWAY'],
  [V_WRECK + 0.15, 'A LOST SHIPWRECK'],
  [V_WHALES + 0.15, 'STRANDED WHALES'],
  [V_EDGE + 0.1, 'THE SEABED DROPS AWAY'],
  [V_CARGO + 0.15, 'A SUNKEN CARGO SHIP'],
  [V_VENTS + 0.15, 'HOT VENTS, STILL SMOKING'],
  [V_TITANIC + 0.15, 'THE TITANIC'],
  [V_MOUNT + 0.15, 'A MOUNTAIN RISES FROM THE SEA'],
  [V_TRENCH + 0.15, 'THE MARIANA TRENCH'],
  [38.3, 'THE DEEPEST SPOT ON EARTH'],
  [V_ROAR + 0.25, 'THE WATER COMES BACK'],
];
export const BEATS = POPS.map((p) => p[0]);
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- the one caption ----
export const CAPTIONS = [
  [V_FLOOR + 0.1, V_ROAR + 0.15, 'You are standing deeper than Everest is tall.'],
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

// ---- the counter ----
export const fmtFt = (ft) => `−${Math.round(ft).toLocaleString('en-US')} ft`;
export const COUNTERS = [
  {
    from: -3, to: VIDEO_DURATION + 1, label: 'SEA LEVEL · TIME-LAPSE',
    fmt: (ft) => fmtFt(ft),
    value: (v) => feetAt(v),
    unit: () => 'DEEPEST SPOT: −36,000 FT',
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.ft = feetAt(v);
  s.shot = shotAt(v);
  s.title = 1 - smooth(2.7, 3.05, v);
  const d = dashAt(v);
  s.dash = d.blur; s.push = d.push;
  // a small jolt on every popup (the soundtrack hits there too)
  s.kick = 0;
  for (const t of BEATS) { const dt = v - t; if (dt > -0.05 && dt < 1.0) s.kick = Math.max(s.kick, smooth(-0.05, 0.03, dt) * Math.exp(-Math.max(dt, 0) / 0.25) * 0.5); }
  // the end: the roar shakes the trench, the wall of water arrives, white
  s.roar = smooth(V_ROAR - 0.1, V_ROAR + 0.5, v);
  s.wave = clamp((v - V_WAVE) / (V_HIT - V_WAVE));
  s.wash = smooth(V_HIT - 0.42, V_HIT + 0.05, v);
  s.white = smooth(V_HIT - 0.04, V_WHITE, v);
  s.kick = Math.max(s.kick, 0.25 * s.roar + 0.9 * smooth(V_WAVE + 1.2, V_HIT, v));
  s.flash = 0; s.flashColor = '#ffffff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
