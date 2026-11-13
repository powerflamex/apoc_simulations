// "What if you shrank 1 trillion times smaller?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// ONE continuous shrink, no cuts: you (1.7 m) stay the same size on screen while the world grows round you. Every
// world sits inside the one before it, right at your feet:
//   the park (you on the lawn at the picnic blanket's edge, a friend standing over you, the dog sniffing you)
//   -> down among the grass blades (an ant walks past) -> a dew drop slides off a blade and lands over you
//   -> inside the drop: a single-celled creature (a paramecium) swims by; bacteria swim past
//   -> a virus (a bacteriophage) lands on the bacterium lying beside you -> you sink through its wall
//   -> inside the bacterium: its DNA -> the atoms of the DNA -> inside one atom.
// Everything is placed in one real coordinate frame (metres) and drawn at (real - anchor) x S in your metres; the anchor
// is your feet until you sink into the bacterium, then a point inside it, then the atom's nucleus (worlds.js).
// The sizes (real size x S = how big it looks next to you), each checked against the counter when its caption shows:
//   10x (0:03): you are 17 cm: a kitten.
//   1,000x (0:07): a red wood ant (~12 mm) = 12 m: a bus.
//   ~2,800x (0:09.2): a dew drop (~3.2 mm across) = 9 m: a house.
//   100,000x (0:14.5): a paramecium (~0.25 mm long) = 25 m: a whale.
//   6 million x (0:18.7): E. coli (~2 µm long) = 12 m: a bus.
//   25 million x (0:22.7): a T4 bacteriophage (~0.2 µm tall) = 5 m: a giraffe.
//   1 billion x (0:30.5): DNA (2 nm thick) = 2 m: as thick as you.
//   3 billion x (0:33.7): an atom (~0.15 nm) = 0.45 m: a beach ball.
//   1 trillion x (0:41.4): a carbon atom = ~150 m: a stadium; its nucleus (~5 fm) = ~5 mm: a grain of rice.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const H0 = 1.7;                   // your height (m)
export const LOOP = 0.85;                // the white clears onto the first frame over the last LOOP seconds

// ---- your size: log10 of how many times smaller, against video time (monotone cubic through the keys) ----
const LOGK = [
  [-3, 0.2], [0, 0.5], [3.0, 1.0], [4.6, 1.75], [6.0, 2.6], [7.0, 3.0], [8.6, 3.3], [9.4, 3.46], [10.6, 3.75],
  [12.2, 4.35], [14.5, 5.0], [16.6, 5.95], [18.7, 6.78], [20.6, 7.15], [22.7, 7.4], [24.6, 7.62], [27.0, 8.1],
  [29.0, 8.6], [30.5, 9.0], [32.2, 9.3], [33.7, 9.48], [35.6, 9.75], [37.6, 10.4], [39.4, 11.35], [40.6, 11.88], [41.4, 12.0], [60, 12.0],
];
const MC = (() => {
  const n = LOGK.length, x = LOGK.map((k) => k[0]), y = LOGK.map((k) => k[1]);
  const dk = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) dk.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = dk[0]; m[n - 1] = dk[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (3 * (dk[i - 1] + dk[i])) / ((2 * dk[i] + dk[i - 1]) / dk[i - 1] + (dk[i] + 2 * dk[i - 1]) / dk[i]);
  return { x, y, m };
})();
export function logS(v) {
  const { x, y, m } = MC, n = x.length;
  if (v <= x[0]) return y[0] + m[0] * (v - x[0]);
  if (v >= x[n - 1]) return y[n - 1];
  let i = 0;
  while (v > x[i + 1]) i++;
  const h = x[i + 1] - x[i], t = (v - x[i]) / h, t2 = t * t, t3 = t2 * t;
  return Math.min(12, (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1]);
}
export const sizeAt = (v) => Math.pow(10, logS(v));
// how fast you're shrinking (powers of ten per second)
export const shrinkRate = (v) => (logS(v + 0.05) - logS(v - 0.05)) / 0.1;
export const V_TRILLION = 41.4;

// ---- the beats ----
export const T_DROP = [8.6, 10.6];       // the dew drop slides off its blade, falls and lands over you
export const T_PHAGE = [20.8, 22.6];     // the virus comes down and lands on the bacterium beside you
export const T_SINK = [24.4, 27.2];      // you sink through the bacterium's wall
export const T_ATOM = 36.2;              // the atoms round you swell into clouds
export const T_REVEAL = [40.2, 43.0];    // the camera pulls back: the whole atom, a stadium round you
export const T_DIVE = 43.0;              // back in, to the nucleus; its glow swells
export const T_WHITE = 47.25;            // full white
export const T_SWITCH = Math.round((T_WHITE + 0.2) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// ---- text: captions only (no popups), each after the title has gone; 'step' = a named step (a soft hit in the sound) ----
export const CAPTIONS = [
  { t0: 3.15, t1: 5.5, step: 3.0, text: "You're as small as a kitten." },
  { t0: 7.0, t1: 9.0, step: 7.0, text: 'An ant is as big as a bus.' },
  { t0: 9.15, t1: 11.4, step: 9.15, text: 'A dew drop as big as a house falls on you.' },
  { t0: 13.9, t1: 16.5, step: 14.5, text: 'A one-celled creature as big as a whale.' },
  { t0: 18.3, t1: 20.6, step: 18.7, text: 'Bacteria swim past, as big as buses.' },
  { t0: 22.5, t1: 24.9, step: 22.6, text: 'A virus as tall as a giraffe lands on one.' },
  { t0: 25.6, t1: 28.4, step: 25.8, text: 'You sink inside the bacterium.' },
  { t0: 30.0, t1: 32.6, step: 30.5, text: 'Its DNA: a twisted ladder as thick as you.' },
  { t0: 33.2, t1: 35.8, step: 33.7, text: 'Each atom is as big as a beach ball.' },
  { t0: 37.0, t1: 39.9, step: 37.0, text: 'Every atom is a cloud, almost all empty.' },
  { t0: 40.6, t1: 43.0, step: 41.4, text: 'This whole stadium is one atom.' },
  { t0: 43.2, t1: 46.1, step: 44.4, text: 'Its centre: a grain of rice.' },
];
export const STEPS = CAPTIONS.map((c) => c.step);
export function captionAt(v) {
  for (const c of CAPTIONS) {
    if (v >= c.t0 && v < c.t1) {
      const a = smooth(c.t0, c.t0 + 0.25, v) * (1 - smooth(c.t1 - 0.25, c.t1, v));
      return { text: c.text, alpha: a, rise: (1 - smooth(c.t0, c.t0 + 0.25, v)) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtSize(S) {
  if (S < 10) return `${S.toFixed(1)}x`;
  if (S > 0.9995e12) return '1,000,000,000,000x';
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(S)) - 3));
  return `${fmtInt(Math.round(S / p) * p)}x`;
}
export function counterAt(v) {
  return { label: 'YOU ARE', value: fmtSize(sizeAt(v)), unit: 'SMALLER', line: '1,000,000,000,000x: INSIDE AN ATOM' };
}

// ---- state ----
export function state(v) {
  const s = { v };
  s.lS = logS(v);
  s.S = Math.pow(10, s.lS);
  s.dash = 0;
  s.light = 0;
  s.title = 1 - smooth(2.7, 3.1, v);
  s.swell = smooth(T_WHITE - 1.05, T_WHITE, v);
  s.flash = Math.pow(smooth(T_WHITE - 0.85, T_WHITE, v), 1.6);
  s.youTag = smooth(T_REVEAL[0] + 0.5, T_REVEAL[0] + 0.9, v) * (1 - smooth(T_DIVE - 0.2, T_DIVE + 0.3, v));
  return s;
}
export { clamp, lerp };
