// "What if asteroids of every size hit your city?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One viewpoint the whole video: a packed hilltop terrace 112 m (370 ft) above a city and its bay. Ground zero is
// downtown on the waterfront, 2.4 km (1.5 miles) in front of you. Six asteroids, each one a real object, each hitting the
// same spot; after every white-out the city is whole again and the next, bigger one is already in the sky.
// Every size and effect was checked with the Imperial College "Impact: Earth!" calculator (Collins, Melosh & Marcus 2005)
// run for 4 km from ground zero (CAPTIONS.md has the numbers):
//   1 HOUSE       60 ft  (18 m, Chelyabinsk, Russia 2013): bursts 20 miles up (0.43 Mt); its shock breaks windows for
//                        miles around (0.18 psi here; real: ~1,500 people hurt, mostly by flying glass)
//   2 JUMBO JET  200 ft  (60 m, Tunguska, Siberia 1908): bursts 5.4 miles up (8 Mt); 6.6 psi, 208 mph wind here:
//                        "multistory buildings will collapse" (real: 80 million trees flattened over 830 square miles)
//   3 SKYSCRAPER 1,100 ft (340 m, the size of Apophis): hits the ground (1,200 Mt); a crater 3.0 miles (4.8 km) wide,
//                        192 psi, 2,000 mph wind
//   4 EVEREST    6 miles  (10 km, the dinosaur killer): a crater 77 miles wide; you are inside the fireball
//   5 TEXAS      580 miles (939 km, Ceres, the biggest asteroid: a disc that size covers as much ground as Texas):
//                        30x the energy it takes to boil every ocean away (1e29 J vs 3.6e27 J)
//   6 THE MOON   2,159 miles (3,475 km): 5e30 J, enough to melt much of the planet (a magma ocean)
// What is drawn vs real (CAPTIONS.md): time is sped up (the blasts take 30 s to minutes to cross 1.5 miles; here 2-4 s)
// and the airbursts and the rocks' paths are drawn lower in the sky so they show in the frame.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const LOOP = 0.9;                 // the end's white clears onto frame 0 over the last LOOP seconds
export const FT = 0.3048, MI = 1609.344;
export const GZ = { x: -60, y: 2, z: -2400 };   // ground zero (m; you are at x = 0, z = 0)
export const HILL = 112;                 // the terrace's top level, metres above the bay

// ---- the stops ----
// t0: the scene switches to this stop (inside the white); hit: it bursts / lands; you: its blast reaches you (the white
// rises); front: the blast front's speed (m per video second) where one is drawn
export const STOPS = [
  { key: 'house', name: 'HOUSE', ft: 60, t0: -LOOP, hit: 0.95, you: 3.55,
    lines: [[-9, 'SIZE OF A HOUSE'], [2.8, 'RUSSIA, 2013: 1,500 HURT BY GLASS']] },
  { key: 'jet', name: 'JUMBO JET', ft: 200, t0: 3.75, hit: 5.6, you: 12.1,
    lines: [[0.15, 'SIZE OF A JUMBO JET'], [2.2, 'SIBERIA, 1908: 80 MILLION TREES FLATTENED']] },
  { key: 'tower', name: 'SKYSCRAPER', ft: 1100, t0: 12.25, hit: 14.1, you: 20.6,
    lines: [[0.15, 'SIZE OF A SKYSCRAPER'], [2.3, 'A CRATER 3 MILES WIDE']] },
  { key: 'everest', name: 'EVEREST', ft: 6.2 * 5280, label: '6 MILES', t0: 20.75, hit: 22.7, you: 29.1,
    lines: [[0.15, 'BIGGER THAN MOUNT EVEREST'], [2.1, 'THE ONE THAT KILLED THE DINOSAURS']] },
  { key: 'texas', name: 'TEXAS', ft: 580 * 5280, label: '580 MILES', t0: 29.25, hit: 31.45, you: 37.6,
    lines: [[0.15, 'SIZE OF TEXAS'], [2.6, 'THE BAY BOILS AWAY']] },
  { key: 'moon', name: 'THE MOON', ft: 2159 * 5280, label: '2,159 MILES', t0: 37.75, hit: 41.0, you: 46.6,
    lines: [[0.15, 'SIZE OF THE MOON'], [1.8, 'ITS PULL LIFTS THE SEA'], [4.4, 'EARTH TURNS TO LAVA']] },
];
STOPS.forEach((s, i) => { s.i = i; s.m = s.ft * FT; });
export const S = Object.fromEntries(STOPS.map((s) => [s.key, s]));
// (the end: the last white, then the jump back to frame 0)
export const T_SWITCH = Math.round((S.moon.you + 0.2) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
const WHITE_UP = 0.14, WHITE_DOWN = 0.36;

// the stop on screen at v (the switch happens at t0, at the top of the white)
export function stopAt(v) {
  let i = 0;
  while (i + 1 < STOPS.length && v >= STOPS[i + 1].t0) i++;
  return i;
}

// ---- the counter: the size racing up (feet, then miles) ----
export function fmtSize(ft) {
  if (ft < 5280) return `${Math.round(ft).toLocaleString('en-US')} FT`;
  const mi = ft / 5280;
  if (mi < 10) return `${mi.toFixed(1)} MILES`;
  return `${Math.round(mi).toLocaleString('en-US')} MILES`;
}
const RACE = 0.75;                        // how long the number takes to race up to the next size
export function sizeAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const from = i === 0 ? 8 : STOPS[i - 1].ft;
  const a = i === 0 ? -0.3 : st.t0 + 0.02;          // (frame 0: still racing up to 60 ft, for its first ~0.6 s)
  const u = clamp((v - a) / (i === 0 ? 0.95 : RACE));
  if (u >= 1) return st.label || fmtSize(st.ft);
  const e = 1 - Math.pow(1 - u, 2.2);
  return fmtSize(Math.exp(lerp(Math.log(from), Math.log(st.ft), e)));
}
// the picker's cursor (0..5, fractional while it slides to the next slot)
export function cursorAt(v) {
  const i = stopAt(v), st = STOPS[i];
  if (i === 0) return 0;
  const u = clamp((v - st.t0 + 0.04) / 0.5);
  return lerp(i - 1, i, 1 - Math.pow(1 - u, 2.6));
}
// the one line under the counter: { text, alpha, rise }
export function lineAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const end = (i + 1 < STOPS.length ? STOPS[i + 1].t0 : T_SWITCH) - WHITE_UP - 0.05;
  const dt = v - st.t0;
  let cur = null, a = 0, b = 0;
  for (let j = 0; j < st.lines.length; j++) {
    const [t, text] = st.lines[j];
    const nx = j + 1 < st.lines.length ? st.lines[j + 1][0] : end - st.t0;
    if (dt >= t && dt < nx) { cur = text; a = t; b = nx; }
  }
  if (!cur) return null;
  const fin = a < -1 ? 1 : smooth(a, a + 0.22, dt);
  return { text: cur, alpha: fin * (1 - smooth(b - 0.16, b, dt)), rise: (1 - fin) * 12 };
}

// ---- the white: the blast reaching you, and the wipe to the next size ----
export function whiteAt(v) {
  let w = 0;
  for (let i = 1; i < STOPS.length; i++) {
    const t = STOPS[i].t0;
    w = Math.max(w, smooth(t - WHITE_UP, t - 0.02, v) * (1 - smooth(t + 0.04, t + WHITE_DOWN, v)));
  }
  // the end (and, in the loop's tail, the start: main.js clears it with the same profile)
  w = Math.max(w, smooth(T_SWITCH - WHITE_UP, T_SWITCH - 0.02, v));
  return w;
}
export const WHITE_CLEAR = (tail) => 1 - smooth(0.04, WHITE_DOWN, tail);

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  const i = stopAt(v), st = STOPS[i];
  s.i = i; s.stop = st; s.key = st.key;
  s.dt = v - st.t0;                       // seconds since this stop came on
  s.th = v - st.hit;                      // seconds since it hit (negative before)
  s.ty = v - st.you;                      // seconds since its blast reached you
  s.white = whiteAt(v);
  s.cursor = cursorAt(v);
  // a short pulse on the picker as the cursor lands on the new slot
  s.snap = i === 0 ? 0 : Math.exp(-Math.max(0, s.dt - 0.45) / 0.14) * smooth(0.38, 0.47, s.dt);
  s.title = 1 - smooth(2.85, 3.35, v);
  return s;
}
export { lerp };
