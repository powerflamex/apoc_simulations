// "What if Earth had other planets' gravity?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One packed basketball court in a city park, one camera spot just behind YOU. Every ~7.5 s the gravity swaps to
// another world's in one quick wipe; the park and the crowd stay, and each stop starts fresh (everything standing
// again). At every stop the first effect lands within ~1 s of the wipe and a bigger beat ~3 s in (sched.js). A picker
// bar of the six worlds sits under the title (the neutron star, the last slot, is the finish line); the counter is
// YOUR WEIGHT, racing to each world's; one line under it says how strong that gravity is.
//
// The numbers (checked Nov 21, 2026; you weigh 150 lb on Earth, weight = 150 lb x g / 9.80 m/s²):
//   - surface gravity, NASA fact sheets: the Moon 1.62 m/s² -> 24.8 lb (25); Pluto 0.62 -> 9.5 lb (9); Jupiter 24.79
//     (at the 1-bar cloud level) -> 379.5 lb (380); the Sun 274 -> 4,195 lb (4,200). 1/6, 1/16, 2.5x, 28x.
//   - a white dwarf: typical surface gravity log g ≈ 8 (cgs), i.e. ~1e6 m/s², ~100,000x Earth's (most white dwarfs
//     sit near 0.6 solar masses at about Earth's size) -> 15.3 million lb (15 million).
//   - a neutron star: 1.4 solar masses in a 12 km radius (NICER measured ~12-13 km): g = GM/R² = 1.3e12 m/s²,
//     ~130 billion x Earth's -> 1.98e13 lb (20 trillion).
//   - jumps: the same push as a 0.5 m jump on Earth (3.1 m/s): the Moon 3 m up and ~4 s in the air; Pluto 7.9 m
//     (26 ft) up, 5 s on the way up; Jupiter 20 cm. A fountain jet's height (v²/2g) and an arc's reach scale as 1/g.
//   - a car weighs ~4,000 lb (US average new car, ~4,100-4,300 lb): at the Sun you weigh as much as one.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const WIPE = 0.38;                // one wipe (s)
export const BASE_LB = 150;              // you, on Earth

// land: when the wipe to this world starts; lb: your weight there; g: gravity in Earth g's; lines: [from, text]
export const STOPS = [
  { key: 'moon', name: 'MOON', land: -1.6, lb: 25, g: 1.62 / 9.8, lines: [[-9, "THE MOON: 1/6 OF EARTH'S GRAVITY"]] },
  { key: 'pluto', name: 'PLUTO', land: 7.0, lb: 9, g: 0.62 / 9.8, lines: [[0.12, "PLUTO: 1/16 OF EARTH'S GRAVITY"]] },
  { key: 'jupiter', name: 'JUPITER', land: 14.5, lb: 380, g: 24.79 / 9.8, lines: [[0.12, "JUPITER: 2.5x EARTH'S GRAVITY"]] },
  { key: 'sun', name: 'SUN', land: 22.5, lb: 4200, g: 274 / 9.8, lines: [[0.12, "THE SUN: 28x EARTH'S GRAVITY"]] },
  { key: 'wd', name: 'WHITE DWARF', land: 31.0, lb: 15e6, g: 1e5, lines: [[0.12, "WHITE DWARF: 100,000x EARTH'S GRAVITY"]] },
  { key: 'ns', name: 'NEUTRON STAR', land: 40.0, lb: 20e12, g: 1.3e11, lines: [[0.12, 'NEUTRON STAR: 130 BILLION x EARTH']], until: 3.0 },
];
STOPS.forEach((s, i) => { s.i = i; });
export const ST = Object.fromEntries(STOPS.map((s) => [s.key, s]));
export const LAND = Object.fromEntries(STOPS.map((s) => [s.key, s.land]));

// the ending: everything pressed into a film, a wave of heat sweeps in over it from the horizon, straight into the
// white; the loop point sits in the white
export const T_END = LAND.ns + 3.3;                // the white is full
export const T_SWITCH = Math.round((T_END + 0.3) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// captions: [from, to, text] (video time), low in the frame, each with "you" and one hard number
export const CAPTIONS = [
  [3.9, 6.6, 'Every jump hangs in the air for 4 seconds'],
  [LAND.pluto + 2.3, LAND.pluto + 5.9, 'One jump takes you 26 feet up'],
  [LAND.sun + 4.6, LAND.sun + 7.6, 'You weigh as much as a car', 1300],
  [LAND.ns + 0.45, LAND.ns + 2.75, 'Everything pressed thinner than paper', 1300],
];
export function captionAt(v) {
  for (const [a, b, text, top] of CAPTIONS) if (v >= a && v < b) return { text, top: top || 1495, alpha: smooth(a, a + 0.25, v) * (1 - smooth(b - 0.25, b, v)), rise: (1 - smooth(a, a + 0.25, v)) * 12 };
  return null;
}

// the stop on screen now (the newer one once its wipe has started)
export function stopAt(v) {
  let i = 0;
  while (i + 1 < STOPS.length && v >= STOPS[i + 1].land) i++;
  return i;
}
// the picker's cursor (0..5, fractional while it slides): it slides in the 0.45 s before each wipe and snaps on
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export function cursorAt(v) {
  for (let i = STOPS.length - 1; i >= 1; i--) {
    const L = STOPS[i].land;
    if (v >= L) return i;
    if (v >= L - 0.45) return lerp(i - 1, i, ease((v - (L - 0.45)) / 0.45));
  }
  return 0;
}
// the counter: your weight racing from the last world's to this one's (the Moon's race starts from 150 lb, so on
// frame 0 the number is already falling fast); the big ones race in log steps
export function weightAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const from = i === 0 ? BASE_LB : STOPS[i - 1].lb;
  const dur = i === 0 ? 3.2 : i >= 4 ? 1.9 : 1.4;
  const t0 = i === 0 ? st.land + 0.6 : st.land;
  const u = clamp((v - t0) / dur);
  const k = i === 0 ? u * u * (3 - 2 * u) : 1 - Math.pow(1 - u, 2.4);
  if (st.lb / from > 50) return Math.exp(lerp(Math.log(from), Math.log(st.lb), k));
  return lerp(from, st.lb, k);
}
// 25 LB, 4,200 LB, 15 MILLION LB, 4.73 BILLION LB, 20 TRILLION LB (3 figures while racing, the final value rounded)
export function fmtLb(n, final = false) {
  const big = [[1e12, 'TRILLION'], [1e9, 'BILLION'], [1e6, 'MILLION']];
  for (const [d, w] of big) if (n >= d * 0.9995) {
    const x = n / d;
    const s = final ? String(Math.round(x)) : x >= 100 ? Math.round(x).toString() : x >= 10 ? x.toFixed(1) : x.toFixed(2);
    return `${s} ${w} LB`;
  }
  return `${Math.round(n).toLocaleString('en-US')} LB`;
}
export function counterText(v) {
  const i = stopAt(v), st = STOPS[i];
  const w = weightAt(v);
  return fmtLb(w, Math.abs(w - st.lb) / st.lb < 1e-3);
}

// the one line under the counter: { text, alpha, rise }
export function lineAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const nx = STOPS[i + 1];
  const dt = v - st.land;
  const end = Math.min((nx ? nx.land : T_END) - st.land, st.until ?? 1e9);
  let cur = null, t0 = 0, t1 = end;
  for (let j = 0; j < st.lines.length; j++) {
    const [a, text] = st.lines[j];
    const b = j + 1 < st.lines.length ? st.lines[j + 1][0] : end;
    if (dt >= a && dt < b) { cur = text; t0 = a; t1 = b; }
  }
  if (!cur) return null;
  return { text: cur, alpha: smooth(t0, t0 + 0.2, dt) * (1 - smooth(t1 - 0.2, t1, dt)), rise: (1 - smooth(t0, t0 + 0.2, dt)) * 12 };
}

// ---- state: which stops are drawn (a, b), the wipe between them (w), the snap at each landing ----
export function state(v) {
  const s = { v };
  const i = stopAt(v);
  s.i = i;
  const L = STOPS[i].land;
  if (i > 0 && v < L + WIPE) { s.a = i - 1; s.b = i; s.w = clamp((v - L) / WIPE); }
  else { s.a = i; s.b = i; s.w = 0; }
  s.since = v - L;
  s.cursor = cursorAt(v);
  s.snap = i === 0 ? 0 : Math.exp(-Math.max(0, s.since) / 0.14) * smooth(-0.01, 0.03, s.since);
  s.title = 1 - smooth(3.0, 3.6, v);
  // the white at the end (the loop point sits inside it)
  s.cover = smooth(T_END - 0.55, T_END - 0.02, v);
  s.flash = s.cover;
  s.flashColor = '#ffffff';
  return s;
}
