// "What if you shrank 1 trillion times smaller?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// You (1.7 m tall) shrink on a picnic blanket in a sunny park until you are 1 trillion times smaller and float inside
// one carbon atom. The scene is always drawn in YOUR metres (you stay 1.7 m tall; the world grows by S around you).
// The sizes (real size x S = how big it looks next to you), checked:
//   - 3.2x (frame 0): you are 53 cm, knee-high. 10x: 17 cm (a kitten).
//   - 1,000x: you are 1.7 mm. A carpenter ant (~12 mm) = 12 m next to you: a bus. A grass blade (~10 cm tall, 4 mm
//     wide) = 100 m tall, 4 m wide.
//   - 10,000x: 0.17 mm. A house dust mite (0.3-0.4 mm) = 3-4 m: a rhino. A human hair (~80 µm thick) = 0.8 m: a
//     fallen tree trunk. A cotton yarn of the blanket (~0.5 mm) = 5 m thick.
//   - 100,000x: 17 µm. A red blood cell (7.8 µm across, 2 µm thick) = 0.78 m across: a car tyre.
//   - 1,000,000x: 1.7 µm. A bacterium (E. coli, ~2 µm long, 0.8 µm wide) = 2 m long: as big as you.
//   - 10,000,000x: 170 nm. A virus (~100 nm) = 1 m: up to your waist.
//   - Visible light's waves are 400-700 nm long: you are smaller than one from ~3 million x on; at 30 million x
//     (57 nm) a wave of green light (550 nm) is ~10 times your height.
//   - 1 billion x: 1.7 nm. DNA's double helix is 2 nm thick (as thick as you); its rungs (base pairs) are 0.34 nm
//     apart (34 cm: a ladder's step); each atom in it ~0.15 nm (15 cm, a football).
//   - 1 trillion x: 1.7 pm. A carbon atom (~0.15 nm across) = ~150 m: a stadium. Its nucleus (~5 fm) = 5 mm: a
//     grain of rice. Everything between is almost empty.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const H0 = 1.7;                   // your height (m)
export const LOOP = 0.85;                // the white clears onto the first frame over the last LOOP seconds

// ---- your size: log10 of how many times smaller, against video time (monotone cubic through the keys) ----
const LOGK = [
  [-3, 0.2], [0, 0.5], [3.0, 1.0], [4.6, 1.65], [5.6, 2.45], [7.0, 3.0], [9.5, 3.28], [12.4, 3.55],
  [14.0, 4.0], [16.5, 4.3], [19.3, 4.62], [20.5, 5.0], [23.6, 5.62], [24.6, 6.0], [27.4, 6.68], [28.3, 7.0],
  [30.4, 7.33], [31.6, 7.55], [33.2, 8.55], [34.4, 9.0], [36.6, 9.4], [38.2, 10.6], [39.6, 11.6], [40.6, 11.94], [41.4, 12.0], [60, 12.0],
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
export const V_TRILLION = 41.4;

// ---- the worlds (a quick zoom-blur "dash" at each switch; you stay in the same place in the frame) ----
export const WORLDS = [
  { k: 'park', a: -9, b: 5.6 },
  { k: 'grass', a: 5.6, b: 12.4 },
  { k: 'weave', a: 12.4, b: 19.3 },
  { k: 'blood', a: 19.3, b: 23.6 },
  { k: 'bact', a: 23.6, b: 27.4 },
  { k: 'virus', a: 27.4, b: 33.2 },      // (the last 2.8 s of it: smaller than light, dim and blurred)
  { k: 'dna', a: 33.2, b: 99 },          // DNA, then one of its atoms swells round you
];
export const worldAt = (v) => WORLDS.find((w) => v < w.b) || WORLDS[WORLDS.length - 1];
export const DASHES = WORLDS.slice(1).map((w) => w.a);
export const T_LIGHT = 30.4;             // smaller than light: the world dims and blurs
export const T_LIGHT_END = 33.2;
export const T_ATOM = 36.8;              // the atom in front of you starts to swell
export const T_REVEAL = [40.2, 43.0];    // the camera pulls back: the whole atom, a stadium round you
export const T_DIVE = 43.0;              // back in, to the nucleus; its glow swells
export const T_WHITE = 47.25;            // full white
export const T_SWITCH = Math.round((T_WHITE + 0.2) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// ---- text: captions only (no popups), each after the title has gone ----
export const CAPTIONS = [
  { t0: 3.15, t1: 5.5, text: "You're as small as a kitten." },
  { t0: 7.0, t1: 9.9, text: 'An ant is as big as a bus.' },
  { t0: 10.1, t1: 12.3, text: 'Blades of grass are skyscrapers.' },
  { t0: 13.9, t1: 16.4, text: 'A dust mite is as big as a rhino.' },
  { t0: 16.6, t1: 19.2, text: 'One human hair is a fallen tree.' },
  { t0: 20.4, t1: 23.5, text: 'A red blood cell is as big as a car tyre.' },
  { t0: 24.5, t1: 27.3, text: 'Bacteria are as big as you.' },
  { t0: 28.2, t1: 30.3, text: 'A virus comes up to your waist.' },
  { t0: 30.7, t1: 33.1, text: 'A wave of light is now 10 times bigger than you.' },
  { t0: 34.3, t1: 36.7, text: 'DNA: a twisted ladder as thick as you.' },
  { t0: 40.5, t1: 42.9, text: 'This whole stadium is one atom.' },
  { t0: 43.1, t1: 45.9, text: "It's almost all empty. Its centre: a grain of rice." },
];
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
  // the last digits race; round to 3 significant figures once it is huge, so it doesn't read as noise
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
  s.world = worldAt(v);
  const dash = (t) => Math.exp(-Math.pow((v - t) / 0.13, 2));
  s.dash = 0;
  for (const t of DASHES) s.dash = Math.max(s.dash, dash(t));
  // smaller than light: dim, grey, soft (comes in fast, clears into the DNA)
  s.light = smooth(T_LIGHT - 0.1, T_LIGHT + 0.7, v) * (1 - smooth(T_LIGHT_END - 0.25, T_LIGHT_END + 0.05, v));
  s.title = 1 - smooth(2.7, 3.1, v);
  // the end: the nucleus's glow swells, then white
  s.swell = smooth(T_WHITE - 1.05, T_WHITE, v);
  s.flash = Math.pow(smooth(T_WHITE - 0.85, T_WHITE, v), 1.6);
  s.youTag = smooth(T_REVEAL[0] + 0.5, T_REVEAL[0] + 0.9, v) * (1 - smooth(T_DIVE - 0.2, T_DIVE + 0.3, v));
  return s;
}
export { clamp, lerp };
