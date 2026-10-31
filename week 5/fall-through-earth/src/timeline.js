// "What if you fell through the Earth?" — the story as functions of VIDEO time v (seconds).
// A hole straight through the Earth's center, from the Puerta del Sol in Madrid to the opposite point, in New
// Zealand. There is no air in it, so nothing slows you down. Inside a planet of even density, gravity grows
// with your distance from the center (g r / R), so you swing like a pendulum: x(T) = R cos(wT), w = sqrt(g / R).
// With GM = 3.986e14 and R = 6,371 km: top speed w R = 7.91 km/s (17,694 mph) at the center after 21 min 05 s,
// and you stop exactly at the far surface after 42 min 10 s, then fall back.
// T is real (story) time since you stepped in. The video is a time-lapse that slows down near the surfaces and
// at each landmark (storyT(v): a smooth monotone curve through the landmarks' times); the counter shows depth,
// and on the one line under it your speed and the real time. The pop-out in New Zealand plays in slow motion.
import { smooth, clamp } from './util.js';

export const STORY_START = 0;              // the video clock drives everything
export const R = 6371e3;                   // m
export const R_KM = R / 1000;
export const GM = 3.986004e14;
export const G0 = GM / (R * R);            // 9.82 m/s^2
export const W = Math.sqrt(G0 / R);        // rad/s
export const HALF = Math.PI / W;           // 2530.4 s: Madrid to New Zealand
export const QUARTER = HALF / 2;           // 1265.2 s: the center

// time to reach depth d (m) from the Madrid side, falling from rest
export const tAtDepth = (d) => (2 * Math.asin(Math.sqrt(clamp(d / (2 * R), 0, 1)))) / W;
// distance travelled from Madrid along the hole (m), 0 .. 2R
export const sAt = (T) => { const ph = W * T; return 2 * R * Math.pow(Math.sin(ph / 2), 2); };   // = R (1 - cos wT), precise near 0
// depth below the nearer surface (m): exact near both ends
export function depthAt(T) {
  let ph = (W * T) % (2 * Math.PI);
  if (ph > Math.PI) ph = 2 * Math.PI - ph;
  const near = Math.min(ph, Math.PI - ph);
  return 2 * R * Math.pow(Math.sin(near / 2), 2);
}
export const speedAt = (T) => Math.abs(W * R * Math.sin(W * T));          // m/s
export const MPH = 2.2369363;
export const sideAt = (T) => (Math.cos(W * T) >= 0 ? 1 : -1);               // +1 the Madrid half, -1 the New Zealand half

// ---- landmarks (depth in km) ----
export const D_METRO = 0.020, D_BURJ = 0.828, D_MINE = 4.0, D_KOLA = 12.262, D_CRUST = 35, D_DIAMOND = 150;
export const D_660 = 660, D_DEEP = 1500, D_OUTER = 2890, D_INNER = 5150;
const TD = (km) => tAtDepth(km * 1000);
const TU = (km) => HALF - TD(km);          // the same depth on the way up

// ---- the big moments (video time) ----
export const V_METRO = 1.2;
export const V_BURJ = 6.6, V_MINE = 9.6, V_KOLA = 12.6, V_CRUST = 15.6, V_DIAMOND = 18.6, V_660 = 21.6, V_DEEP = 24.6;
export const V_OUTER = 27.6, V_INNER = 30.8, V_CENTER = 35.3;
export const V_INNER_UP = 38.4, V_OUTER_UP = 40.9, V_660_UP = 43.4, V_CRUST_UP = 45.9, V_KOLA_UP = 47.7, V_BURJ_UP = 49.6;
export const V_STREET = 55.4;              // the cut to the street in New Zealand
export const V_APEX = 57.4;                // you stop right at the top
export const V_FLASH = 58.9;               // the white starts
export const T_SWITCH = 59.6;              // full white; the loop point sits in it
export const LOOP = 0.9;                   // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- story time vs video time: a smooth monotone curve (pchip) through the landmarks ----
function pchip(keys) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * (x[i + 1] - x[i]) + (x[i] - x[i - 1]), w2 = (x[i + 1] - x[i]) + 2 * (x[i] - x[i - 1]); m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  const f = (t) => {
    if (t <= x[0]) return y[0] + m[0] * (t - x[0]);
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  };
  return f;
}
const T_KEYS = [
  [-1.0, 0.3], [0, 1.1], [V_METRO, tAtDepth(D_METRO * 1000)], [3.7, 5.2],
  [V_BURJ, TD(D_BURJ)], [V_MINE, TD(D_MINE)], [V_KOLA, TD(D_KOLA)], [V_CRUST, TD(D_CRUST)], [V_DIAMOND, TD(D_DIAMOND)],
  [V_660, TD(D_660)], [V_DEEP, TD(D_DEEP)], [V_OUTER, TD(D_OUTER)], [V_INNER, TD(D_INNER)], [V_CENTER, QUARTER],
  [V_INNER_UP, TU(D_INNER)], [V_OUTER_UP, TU(D_OUTER)], [V_660_UP, TU(D_660)], [V_CRUST_UP, TU(D_CRUST)],
  [V_KOLA_UP, TU(D_KOLA)], [V_BURJ_UP, TU(D_BURJ)],
  [51.6, HALF - 6.6], [53.6, HALF - 3.3], [55.0, HALF - 1.6], [56.0, HALF - 0.65], [V_APEX, HALF],
  [58.6, HALF + 0.55], [59.5, HALF + 1.35],
];
export const storyT = pchip(T_KEYS);
export const rateAt = (v) => (storyT(v + 0.02) - storyT(v - 0.02)) / 0.04;
// how fast the walls stream past in the picture (m of hole per video second)
export const flowAt = (v) => speedAt(storyT(v)) * rateAt(v);

// ---- temperatures (deg C) by depth (km): a textbook geotherm ----
const TEMP = [[0, 15], [4, 60], [12.3, 180], [35, 600], [150, 1300], [410, 1500], [660, 1600], [2890, 3700], [2891, 4000], [5150, 5400], [6371, 5500]];
export function tempAt(km) {
  if (km <= 0) return 15;
  for (let i = 0; i < TEMP.length - 1; i++) if (km <= TEMP[i + 1][0]) {
    const [a, ta] = TEMP[i], [b, tb] = TEMP[i + 1];
    return ta + (tb - ta) * (km - a) / (b - a);
  }
  return 5500;
}

// ---- the beats: popups (one gold phrase, never a number) and the hits in the soundtrack ----
export const BEATS = [
  { v: V_METRO, hit: 0.5, kind: 'metro' },
  { v: V_BURJ, hit: 0.55, say: 'DEEPER THAN THE BURJ KHALIFA' },
  { v: V_MINE, hit: 0.5 },
  { v: V_KOLA, hit: 0.6, say: 'PAST THE DEEPEST HOLE EVER DUG' },
  { v: V_CRUST, hit: 0.7 },
  { v: V_DIAMOND, hit: 0.7, say: 'WHERE DIAMONDS ARE MADE' },
  { v: V_660, hit: 0.75 },
  { v: V_DEEP, hit: 0.8, say: 'NOT EVEN HALFWAY' },
  { v: V_OUTER, hit: 0.95 },
  { v: V_INNER, hit: 1.0, say: 'THE INNER CORE' },
  { v: V_CENTER, hit: 1.4, say: 'THE CENTER OF THE EARTH', kind: 'center' },
  { v: V_INNER_UP, hit: 0.6 },
  { v: V_OUTER_UP, hit: 0.6 },
  { v: V_660_UP, hit: 0.65, say: 'ALMOST THROUGH' },
  { v: V_CRUST_UP, hit: 0.55 },
  { v: V_STREET, hit: 0.7, kind: 'street' },
];
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (x.say && v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}

// ---- captions (video time): in the gaps between the popups, never on screen with one ----
export const CAPTIONS = [
  [3.7, 6.35, 'There’s no air in the hole. Nothing slows you down.'],
  [V_MINE, 12.3, 'Past the deepest mine, the rock is already 60°C.'],
  [V_CRUST, 18.35, 'You’re through the crust. The rock glows red-hot.'],
  [V_660, 24.4, 'This rock is 1,600°C, hotter than lava. It slowly flows.'],
  [V_OUTER, 30.55, 'An ocean of liquid iron, over 4,000°C.'],
  [32.65, 35.15, '5,400°C: as hot as the surface of the Sun.'],
  [37.15, 40.0, 'Here, gravity pulls you equally from every side.'],
  [40.25, 43.2, 'Now it pulls you back. You start slowing down.'],
  [V_CRUST_UP, 48.6, 'You slow down exactly as fast as you sped up.'],
  [49.0, 52.0, 'You come out in New Zealand, in the middle of the night.'],
  [52.35, 55.2, 'Right on time: 42 minutes after you jumped.'],
  [55.9, 58.85, 'You stop right at the top… and fall back to Madrid.'],
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

// ---- the counter: depth, and on the one line under it your speed and the real time ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtDepth(m) {
  if (m < 10) return `${m.toFixed(1)} m`;
  if (m < 1000) return `${fmtInt(m)} m`;
  const km = m / 1000;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${fmtInt(km)} km`;
}
export function fmtClock(T) {
  const s = Math.max(0, Math.floor(T + 1e-6));
  return `${Math.floor(s / 60)} MIN ${String(s % 60).padStart(2, '0')} S`;
}
export function lapseTag(v) {
  const r = rateAt(v);
  if (v >= V_STREET && r < 0.8) return 'SLOW MOTION';
  return r > 1.25 ? 'TIME-LAPSE' : '';
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'DEPTH',
    fmt: (m) => fmtDepth(m),
    value: (v) => depthAt(storyT(v)),
    unit: (v) => { const T = storyT(v); return `${fmtInt(speedAt(T) * MPH)} MPH · ${fmtClock(T)}`; },
    tag: (v) => lapseTag(v),
  },
];

// how hard the camera jolts right now (decays after each beat)
export function joltAt(v) {
  let j = 0;
  for (const b of BEATS) { const dt = v - b.v; if (dt >= 0 && dt < 1.5) j = Math.max(j, Math.exp(-dt * 4) * b.hit); }
  return j;
}

// ---- state ----
export function state(v) {
  const s = { v };
  s.T = storyT(v);
  s.depth = depthAt(s.T);                // m below the nearer surface (your feet)
  s.km = s.depth / 1000;
  s.side = sideAt(s.T);
  s.speed = speedAt(s.T);
  s.rate = rateAt(v);
  s.flow = s.speed * s.rate;            // m of wall per video second
  s.temp = tempAt(s.km);
  // the center: the brightest moment (a near white-out with the boom)
  s.glow = Math.exp(-Math.pow((v - V_CENTER) / 0.55, 2));
  s.flash = smooth(V_FLASH, T_SWITCH - 0.03, v);
  s.flashColor = '#fffdf8';
  s.title = 1 - smooth(3.0, 3.6, v);
  s.fadeOut = 0;
  return s;
}
