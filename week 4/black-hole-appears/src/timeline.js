// "What if a black hole appeared in front of you?" — the story as functions of VIDEO time v (seconds; real time).
// A tiny black hole appears at chest height over the sidewalk of the Las Vegas Strip at night and gets 10x heavier
// every 3 seconds: M = 1e11 kg x 10^(v / 3). It reaches Earth's mass (5.972e24 kg) at v = 41.33 s; then it is
// 1.77 cm wide, the size of a marble. The numbers (checked; G = 6.674e-11, c = 2.998e8):
//   size (event horizon, across) = 4GM/c^2 = 2.97e-27 m per kg:  1e11 kg: 3e-16 m (a fifth of a proton);
//     1e12: 3e-15 m (a proton); 1e17: 3e-10 m (an atom); 7.3e22 (the Moon): 0.22 mm (a grain of sand);
//     5.97e24 (Earth): 1.77 cm (a marble).
//   Hawking glow (photons) = 3.56e32 W / M^2 [kg]:  1e11 kg: 36 GW at 1.2 trillion K; 1e12: 360 MW; 1e13: 3.6 MW;
//     1e14: 36 kW; 1e15: 360 W; 1e16: 3.6 W: it fades 100x every 3 s and is out by ~15 s.
//   its pull at distance d = GM/d^2. Where it matches Earth's (1 g): d1 = sqrt(GM / 9.81) = 0.825 m x 10^(v/6):
//     0.83 m at 0 s, 2.6 m at 3 s, 8.3 m at 6 s, 26 m at 9 s, 83 m at 12 s, 261 m at 15 s, 825 m at 18 s,
//     2.6 km at 21 s, 8.3 km at 24 s, 26 km at 27 s, 83 km at 30 s, 261 km at 33 s, 825 km at 36 s, 2,610 km at
//     39 s, 6,371 km (Earth's radius) at 41.33 s. The mass at which its pull on someone d metres away passes
//     Earth's: 1.47e11 kg x d^2 (2 m: 5.9e11, 2.31 s; 10 m: 1.5e13, 6.5 s; 2.6 km: 9.9e17, 21.0 s).
//   Its pull on a man 2 m away: 0.17 g at 0 s, 1.7 g at 3 s (off his feet at 2.3 s).
// What the mass is like (the line under the counter): 17 Great Pyramids (5.9e9 kg each) at 1e11; a small mountain
// (~1 km tall, 1e12) at 3 s; all the plastic ever made (~1e13) at 6 s; Mount Everest (~1.6e14) at 9.6 s;
// everything humans have built (1.1e15, Elhacham et al. 2020) at 12.1 s; the Great Lakes' water (2.27e16) at
// 16.1 s; Earth's whole atmosphere (5.15e18) at 21.1 s; Antarctica's ice (2.43e19) at 25.2 s; the dwarf planet
// Ceres (9.4e20) at 29.9 s; Pluto (1.3e22) at 33.3 s; the Moon (7.34e22) at 35.6 s; Mars (6.42e23) at 38.4 s;
// Earth (5.972e24) at 41.33 s.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const G = 6.674e-11, GEE = 9.81, C_LIGHT = 2.998e8;
export const R_E = 6.371e6;
export const M0 = 1e11, STEP = 3;
export const M_EARTH = 5.972e24, M_MOON = 7.342e22;
export const V_EARTH = STEP * Math.log10(M_EARTH / M0);               // 41.33 s
export const vOfMass = (M) => STEP * Math.log10(M / M0);
export const massAt = (v) => M0 * Math.pow(10, Math.min(v, V_EARTH) / STEP);
export const gmAt = (v) => G * massAt(v);
export const pullG = (v, d) => gmAt(v) / (d * d) / GEE;               // its pull at d metres, in g
export const d1g = (v) => Math.sqrt(gmAt(v) / GEE);                    // where its pull is Earth's
export const sizeAt = (v) => 4 * gmAt(v) / (C_LIGHT * C_LIGHT);       // across the event horizon, metres
export const hawkingW = (v) => 3.56e32 / Math.pow(massAt(v), 2);
// when its pull at d metres reaches k g
export const vWhen = (d, k) => vOfMass(k * GEE * d * d / G);

// the black hole: over the sidewalk, at chest height
export const BH = { x: 0.6, y: 1.3, z: 0 };

// ---- the end ----
export const V_MARBLE = 41.9;                 // the zoom arrives at the marble
export const T_SWITCH = 44.3;                 // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- the shots (the camera itself is in main.js). Each one starts farther out: the pull reaches each camera
// spot only near the end of its shot (it passes Earth's at the last one's at 21 s: that is "you") ----
export const SHOTS = [
  { k: 'face', a: -3, b: 4.5 },        // right in front of it: the man 2 m away, the people next to you
  { k: 'walk', a: 4.5, b: 8.5 },       // 25 m back down the sidewalk: the cars slide in, people hold on
  { k: 'block', a: 8.5, b: 12.6 },     // 110 m back: the shop windows burst, the people near you are torn off
  { k: 'rise', a: 12.6, b: 16.6 },     // rising above the Strip: the street, then the block, poured into it
  { k: 'tower', a: 16.6, b: 24.2 },    // you, on a tower 2.6 km south: the skyline leans in; at 21 s you fall
  { k: 'high', a: 24.2, b: 40.0 },     // from the sky, then from space: Las Vegas, the desert, the planet pour in
  { k: 'zoom', a: 40.0, b: 99 },       // down into it: the marble
];
export const shotAt = (v) => SHOTS.find((x) => v < x.b) || SHOTS[SHOTS.length - 1];
export const V_YOU = vWhen(2600, 1);      // 20.99 s: its pull on you (2.6 km away) passes Earth's

// ---- what the mass is like ----
export const LANDMARKS = [
  [1e11, '17 GREAT PYRAMIDS'],
  [1e12, 'A SMALL MOUNTAIN'],
  [1e13, 'ALL THE PLASTIC EVER MADE'],
  [1.6e14, 'MOUNT EVEREST'],
  [1.1e15, 'EVERYTHING HUMANS HAVE BUILT'],
  [2.27e16, 'ALL OF THE GREAT LAKES'],
  [5.15e18, 'EARTH’S WHOLE ATMOSPHERE'],
  [2.43e19, 'ALL OF ANTARCTICA’S ICE'],
  [9.4e20, 'THE DWARF PLANET CERES'],
  [1.3e22, 'PLUTO'],
  [M_MOON, 'THE MOON'],
  [6.42e23, 'MARS'],
  [M_EARTH, 'THE WHOLE EARTH'],
].map(([m, t]) => ({ m, t, v: Math.max(0, vOfMass(m)) }));
export function landmarkAt(v) {
  const M = massAt(v) * 1.0001;
  let b = LANDMARKS[0];
  for (const L of LANDMARKS) if (M >= L.m) b = L;
  return b;
}

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [3.3, 'GONE'],
  [7.0, 'THE CARS SLIDE IN'],
  [10.6, 'THE WINDOWS BURST'],
  [14.6, 'IT EATS THE STREET'],
  [18.0, 'THE SKYLINE BENDS'],
  [22.6, 'YOU FALL SIDEWAYS'],
  [27.3, 'LAS VEGAS IS GONE'],
  [31.4, 'THE MOUNTAINS POUR IN'],
  [38.6, 'THE WEST COAST IS GONE'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together) ----
export const CAPTIONS = [
  [5.1, 6.9, 'It gets 10x heavier every 3 seconds.'],
  [8.8, 10.5, 'Everything within 80 feet is falling in.'],
  [12.4, 14.4, 'The heavier it gets, the dimmer it glows.'],
  [16.4, 17.9, 'Nothing can hold on now.'],
  [21.0, 22.5, 'Its pull on you just passed Earth’s.'],
  [24.4, 27.1, 'It’s still smaller than a speck of dust.'],
  [29.3, 31.2, 'It eats the desert 50 miles out.'],
  [33.4, 35.4, 'You can see the hole from space.'],
  [35.7, 38.4, 'As heavy as the Moon. As wide as a grain of sand.'],
  [41.4, 43.7, 'As heavy as Earth. The size of a marble.'],
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

// ---- the counter: its mass, racing up (in metric tons) ----
const sig = (x) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 10 ? x.toFixed(0) : x.toFixed(1));
const WORDS = [[1e21, 'sextillion'], [1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
export function fmtTons(kg) {
  const t = kg / 1000;
  for (const [d, w] of WORDS) if (t >= d) return `${sig(t / d)} ${w} tons`;
  return `${sig(t)} tons`;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'ITS MASS',
    fmt: (kg) => fmtTons(kg),
    value: (v) => massAt(v),
    unit: (v) => landmarkAt(v).t,
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.M = massAt(v);
  s.shot = shotAt(v);
  s.title = 1 - smooth(2.8, 3.3, v);
  s.flash = smooth(43.35, T_SWITCH - 0.05, v);
  s.flashColor = '#fffaf2';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
