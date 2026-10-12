// "What if every woman disappeared?" — the story as functions of VIDEO time v (seconds).
// Noon at Shibuya Crossing, Tokyo, at the height of the scramble. At V_EVENT every woman and girl on Earth vanishes:
// 4.1 of 8.3 billion people. What they carried drops to the street; their cars, no foot on the brake, creep forward
// into the cars ahead. The men freeze and look around. Then we rise above the crossing and time speeds up: the
// first evening and night, then weeks, then years: nobody is born any more, the men grow old, the city empties and
// goes green. With no births the youngest people left are the boys born that morning; the last human dies about
// 118 years later (simple model: today's men by age, normal death rates). We look up into the Sun; the white
// clears onto the first frame (the video loops).
import { smooth, keys, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const V_EVENT = 2.0;              // every woman vanishes
export const V_RISE = 10.0;              // the camera starts rising above the crossing; time speeds up
export const V_SUNUP = 56.0;             // looking up into the Sun
export const T_SWITCH = 63.0;            // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const YEAR0 = 2026;

// ---- the story clock: seconds since they vanished, laid out on the video clock ----
const HOUR = 3600, DAY = 86400, YR = 365.25 * DAY;
function logCurve(pts) {   // monotone cubic through (v, log(tau + 1))
  const x = pts.map((p) => p[0]), y = pts.map((p) => Math.log(p[1] + 1)), n = pts.length;
  const d = x.slice(1).map((xi, i) => (y[i + 1] - y[i]) / (xi - x[i]));
  const m = y.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i])));
  return (t) => {
    if (t <= x[0]) return Math.exp(y[0] + (t - x[0]) * m[0]) - 1;
    if (t >= x[n - 1]) return Math.exp(y[n - 1] + (t - x[n - 1]) * m[n - 1]) - 1;
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h, s2 = s * s, s3 = s2 * s;
    return Math.exp((2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1]) - 1;
  };
}
const lapse = logCurve([[V_RISE, 8], [12.5, 600], [15.5, 3 * HOUR], [18.0, 6.3 * HOUR], [19.5, 7.6 * HOUR], [22.5, 17.4 * HOUR], [24.5, 19.5 * HOUR],
  [28.0, 30 * DAY], [31.0, YR], [34.5, 15 * YR], [37.6, 47 * YR], [41.2, 53 * YR], [42.6, 97 * YR], [45.3, 103 * YR], [46.6, 116 * YR], [49.8, 119 * YR], [55.0, 200 * YR], [64.0, 400 * YR]]);
// (the years slow down around the captions that name them, so the counter shows the same year)
// real time (s) since the vanishing: real time until V_RISE, then a time-lapse
export const tauAt = (v) => (v < V_RISE ? v - V_EVENT : lapse(v));
export const rateAt = (v) => (v < V_RISE ? 1 : (tauAt(v + 0.01) - tauAt(v - 0.01)) / 0.02);
export const yearsAt = (v) => Math.max(0, tauAt(v)) / YR;
export const hourOfDay = (v) => 12 + Math.max(0, tauAt(v)) / HOUR;   // (day 1 only)

// ---- how many people are left: today's men by age (millions, 10-year bands), normal death rates, no births ----
const MEN = [690, 680, 640, 610, 520, 450, 330, 180, 60, 8];
const COH = MEN.flatMap((n, b) => Array.from({ length: 10 }, (_, k) => ({ a: b * 10 + k + 0.5, n: n * 1e5 })));
const mu = (a) => 0.0008 + 0.00004 * Math.exp(0.09 * a);   // yearly risk of dying at age a
const POP_T = [];   // population every quarter year for 130 years
{
  const S = COH.map(() => 0);
  for (let k = 0; k <= 130 * 4; k++) {
    POP_T.push(COH.reduce((s, c, i) => s + c.n * Math.exp(-S[i]), 0));
    COH.forEach((c, i) => { S[i] += mu(c.a + k / 4) * 0.25; });
  }
}
export const WORLD_BEFORE = 8.27e9;
export const menLeft = (yrs) => { const x = clamp(yrs * 4, 0, POP_T.length - 1), i = Math.floor(x), f = x - i; const p = POP_T[i] + ((POP_T[Math.min(i + 1, POP_T.length - 1)] ?? 0) - POP_T[i]) * f; return p < 1 ? 0 : p; };
export function peopleOnEarth(v) {
  if (v < V_EVENT) return WORLD_BEFORE + (v - V_EVENT) * 2.3;   // (births minus deaths: +2.3 a second)
  const after = menLeft(yearsAt(v));
  const k = smooth(V_EVENT, V_EVENT + 1.6, v);                    // the counter plunges
  return lerp(WORLD_BEFORE, after, k);
}

// ---- the Sun: day 1 runs from noon through the night to the next morning; after that it settles in the west ----
const DEG = Math.PI / 180;
function sunDay(h) {   // Tokyo in October: up 5:45, down 17:20, 50 degrees at noon, from the south
  const f = (h - 5.75) / (17.33 - 5.75);
  const el = Math.sin(Math.PI * f) * 50 * DEG;
  const az = lerp(-100, 100, f) * DEG;   // east -> south -> west (az 0 = south)
  return [Math.sin(az) * Math.cos(el) * -1, Math.sin(el), Math.cos(az) * Math.cos(el)];
}
const SUN_LATE = (() => { const el = 24 * DEG, az = 52 * DEG; return [-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]; })();
export function sunDir(v) {
  const h = hourOfDay(v);
  const a = sunDay(Math.min(h, 31.5) % 24);
  const k = smooth(24.5, 30.0, v);   // after the first morning the Sun drifts to a fixed afternoon spot (no flicker of days)
  const d = [lerp(a[0], SUN_LATE[0], k), lerp(a[1], SUN_LATE[1], k), lerp(a[2], SUN_LATE[2], k)];
  const l = Math.hypot(...d);
  return d.map((x) => x / l);
}
export const nightAt = (v) => smooth(17.6, 19.0, v) * (1 - smooth(22.6, 24.2, v));   // first night (video seconds)

// cutaways inside, in the first hours: a hospital ward, then a primary school classroom
export const V_WARD = 12.6, V_CLASS = 15.6, V_BACK = 18.6;
export const CAPTIONS = [
  [V_EVENT + 0.2, 5.0, 'Every woman and girl on Earth just vanished.'],
  [5.5, 9.0, 'Their cars keep going with nobody at the wheel.'],
  [9.3, 12.3, 'Half of humanity. Gone in an instant.'],
  [V_WARD + 0.2, V_CLASS - 0.2, '9 in 10 nurses are gone. Hospitals can’t cope.'],
  [V_CLASS + 0.2, V_BACK - 0.2, '2 in 3 primary school teachers. Half of every class.'],
  [V_BACK + 0.2, 21.6, 'Stoves left on at lunch. Fires spread across Tokyo.'],
  [21.9, 24.8, 'About 360,000 babies are born every day. Now: none.'],
  [25.1, 28.1, 'Half the workforce, gone overnight. Everything stops.'],
  [28.4, 31.2, 'The youngest people left are newborn boys.'],
  [31.5, 34.4, 'Cities empty out as the men grow old.'],
  [34.7, 37.6, 'With nobody to fix them, buildings start to crumble.'],
  [37.8, 41.2, 'Year 2076: the youngest people alive are 50.'],
  [42.7, 45.3, 'Year 2126: the youngest are 100.'],
  [46.4, 49.8, 'Year 2143: the last human on Earth dies.'],
  [50.6, 55.6, 'Within 200 years, even the towers come down.'],
  [56.0, 60.5, 'Who would you miss first?'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.35), fadeOut = clamp((b - v) / 0.35);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
function since(v) {
  const t = Math.max(0, tauAt(v));
  if (t < 60) return `${Math.floor(t)} SECOND${Math.floor(t) === 1 ? '' : 'S'} LATER`;
  if (t < HOUR) return `${Math.floor(t / 60)} MINUTE${Math.floor(t / 60) === 1 ? '' : 'S'} LATER`;
  if (t < 2 * DAY) { const h = Math.floor(t / HOUR); return `${h} HOUR${h === 1 ? '' : 'S'} LATER`; }
  if (t < 90 * DAY) return `${Math.floor(t / DAY)} DAYS LATER`;
  return `YEAR ${YEAR0 + Math.floor(t / YR)}`;
}
const fmtRate = (r) => (r < 1.6 ? '' : 'TIME-LAPSE');
export const COUNTERS = [
  {
    from: -3, to: V_EVENT, label: 'EVERY WOMAN DISAPPEARS IN', fmt: (x) => `${x.toFixed(2)} s`, value: (v) => Math.max(0, V_EVENT - v),
    unit: () => 'SHIBUYA CROSSING · TOKYO · 12:00 NOON',
  },
  {
    from: V_EVENT, to: T_SWITCH, label: 'PEOPLE ON EARTH', fmt: fmtInt, value: (v) => peopleOnEarth(v),
    unit: (v) => since(v),
    badge: (v) => fmtRate(rateAt(v)),
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.tau = tauAt(v);
  s.years = yearsAt(v);
  s.gone = v >= V_EVENT ? 1 : 0;
  s.sun = sunDir(v);
  s.night = nightAt(v);
  s.inside = v >= V_WARD && v < V_CLASS ? 'ward' : v >= V_CLASS && v < V_BACK ? 'class' : '';
  s.power = 1 - smooth(25.2, 26.4, v);                       // the grid fails within weeks
  s.green = 1 - Math.exp(-s.years / 22);                      // the city going green
  s.decay = smooth(0.3, 30, s.years);                         // dust, grime, rust
  s.leave = smooth(V_RISE + 0.5, 19.0, v);                    // the men leave the crossing
  s.flash = Math.max(
    smooth(V_EVENT - 0.04, V_EVENT, v) * (1 - smooth(V_EVENT, V_EVENT + 0.35, v)) * 0.55,   // the instant they vanish
    smooth(T_SWITCH - 3.0, T_SWITCH, v),
  );
  s.flashColor = '#fffaf0';
  s.title = 1 - smooth(3.0, 3.8, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
