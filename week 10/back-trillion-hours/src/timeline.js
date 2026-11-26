// "What if you went back in time 1 trillion hours?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// You stand on one spot the whole time with a glowing time device on your right wrist. The counter, HOURS BACK, races
// 10x every 5.5 s from 100,000 (11 years: today's street, already rewinding) to 1,000,000,000,000 (114 million years).
// Every jump is a short white streak, then a new place; at every stop something comes at you and you jump just before
// it reaches you. 1 year = 8,766 hours (365.25 days). Every date and animal checked Nov 26, 2026 (sources in CAPTIONS.md):
//   1e6 h   = 114 years (1912): horse wagons and the first cars share the streets, gas lamps still lit.
//   1e7 h   = 1,141 years (~885 AD): no city; forest down to the shore. A bull moose (eastern forests then).
//   1e8 h   = 11,408 years: just after the last ice age (the Holocene starts 11,700 years ago). American mastodons were
//             probably gone by then (last reliable dates ~12,700-13,000 years ago), so this stop lands at 14,000 years
//             (L 8.09) and creeps to 19,000: still the ice age, mastodons alive.
//   1e9 h   = 114,077 years: a giant short-faced bear (Arctodus simus, North America ~1.8 million to ~13,000 years ago),
//             up to ~3.4 m (11 ft) standing on its hind legs.
//   bull moose (eastern moose): ~6 ft at the shoulder, up to ~1,400 lb.
//   the bear stop creeps on to 560,000 years: "Your species doesn't exist yet." only once the line is past 400,000
//             (the oldest Homo sapiens, Jebel Irhoud, are 315,000 +- 34,000 years old).
//   1e10 h  = 1.14 million years: sabertooth cats (Smilodon in North America from ~2.5 million years ago).
//   1e11 h  = 11.4 million years: megalodon (Otodus megalodon, ~23 to ~3.6 million years ago), teeth common on the
//             US east coast; ~15-16 m (about 50 ft) long.
//   1e12 h  = 114 million years: Early Cretaceous. Acrocanthosaurus (~113-110 million years ago; up to ~11.5 m, 38 ft)
//             and a giant brachiosaur (Sauroposeidon, ~110 million years ago, head up to ~17 m). T. rex (68-66 million
//             years ago) is still ~45 million years in the future. This stop lands at 110 million years and settles on 114 while
//             the sauropod passes (Sauroposeidon 113-110 million).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const HPY = 8766;                       // hours in a year
// the jumps (video time of the white peak) and the stops between them
export const JUMPS = [4.9, 10.4, 15.9, 21.4, 26.9, 32.4, 37.9];
export const STOPS = ['today', 'street1912', 'forest', 'ice', 'bear', 'cats', 'shore', 'dinos'];
export const V_WHITE = 46.0;                   // the last jump: back to today (full white)
export const V_FLASH = V_WHITE - 0.06;
export const T_SWITCH = V_WHITE + 0.2;         // full white since V_WHITE: the loop point
export const LOOP = 0.6;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const HITS = JUMPS.slice();
const RISE = 0.28, LAND = 0.1;                 // the counter races from RISE s before a jump to LAND s after it

// which stop you're in at v (0 today .. 7 dinosaurs), and the time since it began
export function stopAt(v) {
  let k = 0;
  for (let i = 0; i < JUMPS.length; i++) if (v >= JUMPS[i]) k = i + 1;
  return k;
}
export const stopStart = (k) => (k === 0 ? -10 : JUMPS[k - 1]);
export const stopEnd = (k) => (k < JUMPS.length ? JUMPS[k] : V_WHITE);

// ---- the counter: log10(hours back) ----
// today: a steady rewind from 10^5 (frame 0) toward 10^6; at each stop a slow creep (the low digits still spin), the
// bear stop creeping further (past 300,000 years), the last one landing on exactly 1 trillion and holding.
const CREEP = [null, [5.985, 6.03], [6.98, 7.03], [8.09, 8.22], [8.98, 9.75], [9.98, 10.03], [10.98, 11.03], [11.985, 12.0]];
const L_TODAY = (v) => 5.0 + v * (0.94 / (JUMPS[0] - RISE));
function creepL(k, v) {
  const [a, b] = CREEP[k];
  const t0 = stopStart(k) + LAND, t1 = k === 7 ? 42.0 : stopEnd(k) - RISE;
  return lerp(a, b, k === 7 ? smooth(t0, t1, v) : clamp((v - t0) / (t1 - t0)));
}
export function logHours(v) {
  const k = stopAt(v);
  // racing between stops
  for (let i = 0; i < JUMPS.length; i++) {
    const J = JUMPS[i];
    if (v >= J - RISE && v < J + LAND) {
      const from = i === 0 ? L_TODAY(J - RISE) : creepL(i, J - RISE), to = CREEP[i + 1][0];
      const u = (v - (J - RISE)) / (RISE + LAND);
      return from + (to - from) * (u * u * (3 - 2 * u));
    }
  }
  if (k === 0) return L_TODAY(v);
  return creepL(k, v);
}
export const hoursAt = (v) => Math.pow(10, logHours(v));
export const yearsAt = (v) => hoursAt(v) / HPY;

// ---- the jump streak: 0..1 around each jump (1 = full white for a few frames at the peak) ----
export function streakAt(v) {
  let s = 0;
  for (const J of JUMPS) {
    const d = v - J;
    if (d < -0.3 || d > 0.32) continue;
    s = Math.max(s, d < 0 ? Math.pow(smooth(-0.3, 0, d), 1.6) : 1 - smooth(0.03, 0.32, d));
  }
  return s;
}
// the device on your wrist: how bright (charging before each jump)
export function deviceAt(v) {
  let s = 0.35;
  for (const J of [...JUMPS, V_WHITE]) {
    const d = v - J;
    if (d > -0.9 && d < 0.4) s = Math.max(s, 0.35 + 2.6 * smooth(-0.9, -0.05, d) * (1 - smooth(0.0, 0.4, d)));
  }
  return s;
}
// your free hand going to the device before each jump (0..1)
export function tapAt(v) {
  let s = 0;
  for (const J of [...JUMPS, V_WHITE]) s = Math.max(s, smooth(J - 0.75, J - 0.35, v) * (1 - smooth(J + 0.15, J + 0.6, v)));
  return s;
}

// ---- text: the gold popups (a phrase, no number) and the captions (never at the same time; none while the title is up) ----
export const POP = 1.7;
export const POPUPS = [
  [5.25, 'HORSES INSTEAD OF CARS'],
  [10.75, 'THE CITY IS GONE'],
  [16.25, 'THE ICE AGE'],
  [21.75, 'A GIANT BEAR'],
  [27.25, 'SABERTOOTH CATS'],
  [36.0, 'A MEGALODON'],
  [38.25, 'DINOSAURS'],
];
export const CAPTIONS = [
  [2.85, 4.6, 'Everything around you runs backward.'],
  [7.1, 10.05, 'Nobody here has ever seen a phone.'],
  [12.6, 14.0, 'Something big is in the trees.'],
  [14.15, 15.6, 'A 1,400-pound bull moose.'],
  [18.1, 21.05, 'Mastodons, 10 feet tall, walk right at you.'],
  [23.45, 25.15, 'It stands 11 feet tall.'],
  [25.35, 26.65, "Your species doesn't exist yet."],
  [29.1, 32.05, 'Their fangs are 7 inches long.'],
  [32.75, 35.75, 'A 50-foot shark is circling you.'],
  [40.1, 42.3, 'Its head is 50 feet above you.'],
  [42.5, 45.2, 'A 38-foot hunter runs right at you.'],
];
export function popupAt(v) {
  for (const [a, say] of POPUPS) if (v >= a && v < a + POP) return { say, dt: v - a };
  return null;
}
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

// ---- the counter text ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function agoLine(years) {
  if (years < 1e6) return `${fmtInt(years)} YEARS AGO`;
  const m = years / 1e6;
  return `${m < 10 ? m.toFixed(2) : m < 100 ? m.toFixed(1) : m.toFixed(0)} MILLION YEARS AGO`;
}
export function counterAt(v) {
  const L = logHours(v);
  const h = L >= 11.9999 ? 1e12 : Math.pow(10, L);
  return { label: 'HOURS BACK', value: fmtInt(h), line: agoLine(h / HPY) };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.k = stopAt(v);
  s.t = v - stopStart(s.k);                 // time into this stop
  s.L = logHours(v);
  s.years = Math.pow(10, s.L) / HPY;
  s.streak = streakAt(v);
  s.white = smooth(V_WHITE - 0.3, V_WHITE, v);
  s.title = 1 - smooth(2.45, 2.8, v);
  s.device = deviceAt(v);
  s.tap = tapAt(v);
  return s;
}
export { lerp };
