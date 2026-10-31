// "What if you could stop time and leave no DNA?" — the story as functions of VIDEO time v (seconds; real time).
// You can stop time whenever you like, and you leave no trace: no DNA, no prints. Times Square at night in the rain.
// Everything in the world moves on the WORLD clock W(v), which only runs while time runs; you move on the video
// clock. Each heist is bigger: an armored truck ($2.4M), a jewelry store (to $40M), a bank vault (to $150M), then
// the biggest gold vault on Earth, 80 ft under Wall Street (the New York Fed: ~507,000 bars, 6,331 t; at ~$4,050 an
// ounce in Oct 2026 that's ~$820 billion). Its 122 compartments: the first cage ~$6.7B, a row of 20 ~$134B. Carrying 507,000 bars at ~30 s a bar takes ~176 days: "6 months".
// Between heists time runs: the alarms, the police, forensics finding nothing, the whole city hunting.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;

// ---- when time runs (world clock). It slows to a stop over FREEZE_T, and snaps back on over RESUME_T ----
export const FREEZE_T = 0.35, RESUME_T = 0.15;
export const RUNS = [[3.4, 5.6], [9.6, 15.4], [19.6, 25.0], [43.6, 52.0]];
export const V_END_FREEZE = 52.0;                       // the last stop: the freeze turns to white (the loop)
export const T_SWITCH = V_END_FREEZE + 1.2;
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export function rateAt(v) {
  let r = 0;
  for (const [a, b] of RUNS) r = Math.max(r, smooth(a, a + RESUME_T, v) * (1 - smooth(b, b + FREEZE_T, v)));
  return r;
}
// W(v): the integral of the rate, tabulated (it starts at W0 so the frozen first frame is mid-everything)
export const W0 = 100;
const DT = 1 / 600, V0 = -3;
const WT = new Float64Array(Math.ceil((VIDEO_DURATION + 2 - V0) / DT) + 2);
{
  let w = W0;
  for (let i = 0; i < WT.length; i++) { WT[i] = w; w += rateAt(V0 + (i + 0.5) * DT) * DT; }
}
export function worldT(v) {
  const x = (v - V0) / DT, i = clamp(Math.floor(x), 0, WT.length - 2), f = clamp(x - i, 0, 1);
  return WT[i] + (WT[i + 1] - WT[i]) * f;
}
// time since the last freeze started / the last resume (for the ripple and the sounds)
export const FREEZES = RUNS.map((r) => r[1]);
export const RESUMES = RUNS.map((r) => r[0]);
export function lastOf(list, v) { let b = -1e9; for (const x of list) if (x <= v) b = x; return v - b; }

// ---- the shots: where the camera is (main.js frames them) ----
export const SHOTS = [
  { k: 'truck', place: 'street', a: -3, b: 3.4 },
  { k: 'walkoff', place: 'street', a: 3.4, b: 6.0 },
  { k: 'jewel', place: 'jewel', a: 6.0, b: 9.6 },
  { k: 'jewelAlarm', place: 'jewel', a: 9.6, b: 12.0 },
  { k: 'forensic', place: 'jewel', a: 12.0, b: 15.8 },
  { k: 'bank', place: 'bank', a: 15.8, b: 19.6 },
  { k: 'bankAlarm', place: 'bank', a: 19.6, b: 21.4 },
  { k: 'hunt', place: 'street', a: 21.4, b: 25.0 },
  { k: 'past', place: 'street', a: 25.0, b: 28.5 },
  { k: 'gold', place: 'gold', a: 28.5, b: 43.6 },
  { k: 'goldAlarm', place: 'gold', a: 43.6, b: 46.0 },
  { k: 'finale', place: 'street', a: 46.0, b: 99 },
];
export const shotAt = (v) => SHOTS.find((x) => v < x.b) || SHOTS[SHOTS.length - 1];
// the street's three visits: 0 the normal evening, 1 the manhunt, 2 the whole city after the gold
export const streetEp = (v) => (v < 21 ? 0 : v < 44 ? 1 : 2);

// ---- the heists: when each thing is taken (video time) ----
export const TRUCK_BAGS = Array.from({ length: 14 }, (_, i) => -0.55 + i * 0.235);   // 14 bags of cash, the last at 2.5 s
export const JEWEL_A = 6.3, JEWEL_B = 9.2;                                      // the cases, swept left to right
export const BANK_A = 16.0, BANK_B = 19.2;                                      // the shelves of cash
export const GOLD_STEPS = [31.5, 35.0, 38.5, 42.0];                             // first cage, a row, half, all
export const GOLD_A = 29.6;

// ---- the counter: money taken, racing (linear in value within a heist; log-linear through the gold) ----
const MONEY = [
  [-3, 0], [-0.6, 0], [2.6, 2.4e6], [JEWEL_A, 2.4e6], [JEWEL_B, 40e6], [BANK_A, 40e6], [BANK_B, 150e6],
  [GOLD_A, 150e6], [GOLD_STEPS[0], 6.7e9], [GOLD_STEPS[1], 134e9], [GOLD_STEPS[2], 410e9], [GOLD_STEPS[3], 820e9],
];
export function moneyAt(v) {
  if (v <= MONEY[0][0]) return 0;
  for (let i = 0; i < MONEY.length - 1; i++) {
    const [a, x] = MONEY[i], [b, y] = MONEY[i + 1];
    if (v <= b) {
      const k = (v - a) / (b - a);
      return x > 1e8 && y > x ? Math.exp(lerp(Math.log(x), Math.log(y), k)) : lerp(x, y, k);
    }
  }
  return MONEY[MONEY.length - 1][1];
}
export function fmtMoney(x) {
  if (x < 1e6) return `$${Math.round(x).toLocaleString('en-US')}`;
  const [d, w] = x < 1e9 ? [1e6, 'million'] : [1e9, 'billion'];
  const y = x / d;
  return `$${y < 10 ? y.toFixed(2) : y < 100 ? y.toFixed(1) : Math.round(y).toLocaleString('en-US')} ${w}`;
}
// the one line under the counter: what you're robbing
export function targetAt(v) {
  if (v < 6.0) return 'AN ARMORED TRUCK';
  if (v < 15.8) return 'A JEWELRY STORE';
  if (v < 28.5) return 'A BANK VAULT';
  if (v < 46.0) return 'THE BIGGEST GOLD VAULT ON EARTH';
  return 'RICHER THAN ANYONE ALIVE';
}
export const COUNTERS = [
  { from: -3, to: T_SWITCH + 2, label: 'MONEY TAKEN', fmt: fmtMoney, value: (v) => moneyAt(v), unit: (v) => targetAt(v) },
];

// ---- gold popups: one phrase saying what just happened (never a number) ----
export const POP = 1.7;
export const POPS = [
  [3.65, 'THE TRUCK IS EMPTY'],
  [9.75, 'THE ALARM GOES OFF'],
  [12.25, 'NO DNA. NO PRINTS.'],
  [19.75, 'THE VAULT IS EMPTY'],
  [GOLD_STEPS[0], 'THE FIRST CAGE IS EMPTY'],
  [GOLD_STEPS[1], 'A WHOLE ROW'],
  [GOLD_STEPS[2], 'HALF THE VAULT'],
  [GOLD_STEPS[3], 'EVERY BAR IS GONE'],
  [43.75, 'NOBODY SAW A THING'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (video time): in the gaps between the popups (never on screen together) ----
export const CAPTIONS = [
  [6.25, 9.45, 'Nobody can see you. Nobody can stop you.'],
  [14.0, 15.6, 'They test everything. Your DNA isn’t there.'],
  [16.0, 19.4, 'One bank vault: $110 million.'],
  [21.6, 24.4, 'The whole city is hunting you.'],
  [25.4, 28.2, 'You walk right past them.'],
  [28.7, 31.3, '80 feet under Wall Street: 507,000 gold bars.'],
  [33.3, 34.9, 'It takes you 6 months.'],
  [36.8, 38.4, 'Nobody else ages a second.'],
  [40.3, 41.9, 'You never leave a trace.'],
  [46.3, 48.8, 'You’re now the richest person on Earth.'],
  [49.2, 51.8, 'And nobody will ever know it was you.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.shot = shotAt(v);
  s.place = s.shot.place;
  s.W = worldT(v);
  s.rate = rateAt(v);
  s.frozen = 1 - s.rate;
  s.ep = streetEp(v);
  s.Wresume = worldT(v - lastOf(RESUMES, v));       // the world clock when time last started again
  s.title = 1 - smooth(2.7, 3.35, v);
  s.flash = smooth(V_END_FREEZE + 0.15, T_SWITCH - 0.08, v);
  s.flashColor = '#f4f8ff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
