// "What if you fell into a volcano?" — the story as functions of VIDEO time v (seconds).
// A made-up crater with Nyiragongo's numbers (Congo): a lava lake 300 m wide about 400 m below the rim, its walls
// undercut by the lava (so they overhang: a straight drop from the rim lands on the lake, not on the wall).
// You stand at the edge among tourists; the rock under your feet slides, and you fall for real: with air drag
// (terminal speed 60 m/s in the thin air ~3.4 km up) the 400 m takes 10.7 s and you hit at 126 mph. The fall plays in
// real time; only the last half-second and the eruption at the end are slowed down (the counter says SLOW MOTION).
// Lava is ~2,700 kg/m3, nearly 3 times as dense as you (~1,000), so you land ON it and float.
// Heat on you = radiant heat from the lake, in units of noon sunlight (1,000 W/m2): the crust radiates ~20 kW/m2
// (Nyiragongo: ~1 GW from ~50,000 m2; crust 460-570°C), molten lava at its 907°C surface ~110 kW/m2. During the fall
// it is the crust's heat times the exact view factor of the lake disc from where you are (2x at the rim, 20x on it).
import { smooth, clamp } from './util.js';

export const STORY_START = 0;             // the video clock drives everything
export const RIM = 400;                   // m, the rim above the lake (your side)
export const LAKE_R = 150;                // m, the lake's radius (300 m wide)
export const RIM_R = 120;                 // m, the rim's radius (the walls overhang down to 150 m at the lake)
export const wallR = (y) => RIM_R + (LAKE_R - RIM_R) * Math.pow(clamp(1 - y / RIM), 2);
export const YOU_R = 120.7;               // where you stand: on a lip of rock sticking out past the rim's edge
export const G = 9.81, VT = 60;           // m/s2; your terminal speed (m/s)
export const MPH = 2.2369363;
export const SUN = 1000;                  // W/m2: noon sunlight
export const F_CRUST = 20000, F_MOLTEN = 110000;

// ---- the fall (story time T) ----
// the slab under you slides from T = -0.6 and drops you at T_FALL; then free fall with drag, tabulated
export const T_SLIDE = -0.6, T_FALL = 0.9;
const SLIDE = 0.55;                       // m the slab sinks before it lets go
const slideAt = (T) => SLIDE * Math.pow(clamp((T - T_SLIDE) / (T_FALL - T_SLIDE)), 2);
const V0 = 2 * SLIDE / (T_FALL - T_SLIDE);
const DT = 1 / 2000;
const FALL = [];                          // [drop below the rim, speed] every DT from T_FALL
{ let x = SLIDE, u = V0; while (x < RIM + 5) { FALL.push([x, u]); const a = G * (1 - (u / VT) ** 2); u += a * DT; x += u * DT; } }
export const T_IMPACT = T_FALL + (() => { let i = 0; while (FALL[i][0] < RIM) i++; return i * DT; })();
function fallAt(T) {
  if (T < T_FALL) return [slideAt(T), T > T_SLIDE ? 2 * SLIDE * (T - T_SLIDE) / (T_FALL - T_SLIDE) ** 2 : 0];
  const f = (T - T_FALL) / DT, i = Math.min(Math.floor(f), FALL.length - 2), k = f - i;
  return [FALL[i][0] + (FALL[i + 1][0] - FALL[i][0]) * k, FALL[i][1] + (FALL[i + 1][1] - FALL[i][1]) * k];
}
// height of your feet above the lava (m) and your speed (m/s)
export const heightAt = (T) => Math.max(0, RIM - fallAt(T)[0]);
export const speedAt = (T) => (T >= T_IMPACT ? 0 : fallAt(T)[1]);
export const SPEED_6S = fallAt(T_FALL + 6)[1] * MPH;     // ~101 mph
export const SPEED_HIT = fallAt(T_IMPACT - 1e-4)[1] * MPH; // ~126 mph
// how far out from the rim you drift (m): you tip forward off the edge
export const driftAt = (T) => 1.6 * smooth(-0.2, 1.4, T) + 1.8 * (1 - Math.exp(-Math.max(0, T - 1.4) / 3.5));

// ---- story time vs video time: real time, slowed down for the landing and the eruption (pchip, monotone) ----
function pchip(keys) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * (x[i + 1] - x[i]) + (x[i] - x[i - 1]), w2 = (x[i + 1] - x[i]) + 2 * (x[i] - x[i - 1]); m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (t) => {
    if (t <= x[0]) return y[0] + m[0] * (t - x[0]);
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  };
}
export const V_IMPACT = 12.0;             // video time you hit the lava
const SHIFT = 14.4 - (T_IMPACT + 1.75);   // after the landing: story = video - SHIFT
export const V_BURST = 43.8;              // the lake erupts under you
export const V_FLASH = 45.0, T_SWITCH = 45.3, LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
// (the identity keys every second keep the real-time parts exactly real time)
const T_KEYS = [];
for (let v = -3; v <= 10.6 + 1e-9; v += v < 10 ? 1 : 0.6) T_KEYS.push([v, v]);
T_KEYS.push([V_IMPACT, T_IMPACT], [12.6, T_IMPACT + 0.24], [13.4, T_IMPACT + 0.78], [14.4, T_IMPACT + 1.75]);
for (let v = 15.4; v <= 42.4; v += 1) T_KEYS.push([v, v - SHIFT]);
T_KEYS.push([43.3, 43.3 - SHIFT - 0.12], [V_BURST, V_BURST - SHIFT - 0.42], [T_SWITCH, T_SWITCH - SHIFT - 1.12]);
export const storyT = pchip(T_KEYS);
export const rateAt = (v) => (storyT(v + 0.02) - storyT(v - 0.02)) / 0.04;

// ---- heat on you (W/m2): the lake disc's view factor from (height h, distance D from its center) ----
// a small surface facing down, parallel to the disc: F = (1 - (h2 + D2 - A2) / sqrt((h2 + D2 + A2)^2 - 4 A2 D2)) / 2
export function viewFactor(h, D, A = LAKE_R) {
  const h2 = h * h, D2 = D * D, A2 = A * A;
  if (h < 1e-3) return D < A ? 1 : 0;
  return 0.5 * (1 - (h2 + D2 - A2) / Math.sqrt((h2 + D2 + A2) ** 2 - 4 * A2 * D2));
}
// how much of what is round you is fresh molten lava (0..1), rising with each event on the lake
const MOLTEN = [[-99, 0], [16.9, 0], [17.6, 0.03], [29.4, 0.03], [30.5, 0.07], [33.0, 0.07], [33.6, 0.12], [38.5, 0.12], [39.3, 0.3],
  [41.5, 0.3], [43.6, 0.5], [V_BURST, 0.55], [44.6, 1.0], [99, 1.0]];
export function moltenAt(v) {
  for (let i = 0; i < MOLTEN.length - 1; i++) if (v <= MOLTEN[i + 1][0]) {
    const [a, x] = MOLTEN[i], [b, y] = MOLTEN[i + 1];
    return x + (y - x) * smooth(a, b, v);
  }
  return 1;
}
export function heatAt(v) {
  const T = storyT(v);
  if (v < V_IMPACT) {
    const h = heightAt(T) + 1.0, D = YOU_R - driftAt(T);       // (your middle, ~1 m above your feet)
    return F_CRUST * viewFactor(h, D);
  }
  const m = moltenAt(v);
  return F_CRUST * (1 - m) + F_MOLTEN * m;
}
export const HEAT_RIM = heatAt(0) / SUN;   // ~2.2x

// ---- the beats: popups (one gold phrase, never a number) and the hits in the soundtrack ----
export const V_SLIP = 0.9, V_LOOKUP = 3.6, V_DOWN = 6.2, V_WALL = 9.0;
export const V_CRACK = 17.0, V_SMOKE = 20.0, V_HAZE = 23.0, V_UP = 26.0, V_WAKE = 29.5;
export const V_BUB1 = 30.4, V_BUB2 = 33.1, V_RAIN = 35.8, V_RIFT = 38.6, V_DOME = 41.6;
export const BEATS = [
  { v: V_SLIP, hit: 0.35 },
  { v: V_IMPACT, hit: 1.0, say: 'YOU DON’T SINK', kind: 'impact' },
  { v: V_CRACK, hit: 0.35 },
  { v: V_HAZE, hit: 0.15 },
  { v: V_WAKE, hit: 0.55, say: 'THE LAKE WAKES UP' },
  { v: V_BUB1, hit: 0.4, kind: 'bubble' },
  { v: V_BUB2, hit: 0.65, kind: 'bubble' },
  { v: V_RAIN, hit: 0.5 },
  { v: V_RIFT, hit: 0.8, say: 'THE CRUST SPLITS OPEN' },
  { v: V_DOME, hit: 0.85, say: 'IT’S RIGHT UNDER YOU' },
  { v: V_BURST, hit: 1.3, kind: 'burst' },
];
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (x.say && v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}

// ---- captions (video time): in the gaps between the popups, never on screen with one ----
export const CAPTIONS = [
  [3.9, 6.0, 'The drop is taller than the Eiffel Tower.'],
  [6.4, 8.75, `6 seconds in, you’re falling at ${Math.round(SPEED_6S / 5) * 5} mph.`],
  [9.1, 10.95, `You hit the lava at ${Math.round(SPEED_HIT)} mph.`],
  [13.9, 16.7, 'Lava is nearly 3 times denser than you. You float on top.'],
  [17.2, 19.8, 'The black crust is a thin skin. Under it: over 1,000°C.'],
  [20.2, 22.8, 'Your shoes start to smoke on the crust.'],
  [23.3, 25.9, 'The air down here is thick with sulfur gas.'],
  [26.6, 29.2, '400 m above you, the tourists can only film.'],
  [31.4, 35.4, 'Gas bubbles burst up through the lava.'],
  [35.8, 38.4, 'Molten lava rains down all around you.'],
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

// ---- the counter: height above the lava while you fall, then the time you've been on it; the heat under both ----
const fmtHeat = (w) => { const x = w / SUN; return x < 9.95 ? x.toFixed(1) : Math.round(x).toString(); };
export function lapseTag(v) {
  if (v < 0.25) return '';
  const r = rateAt(v);
  if (r < 0.8) return 'SLOW MOTION';
  return v < V_IMPACT ? 'REAL TIME' : '';
}
const heatLine = (v) => `HEAT ON YOU: ${fmtHeat(heatAt(v))}× THE SUN`;
export const COUNTERS = [
  {
    from: -3, to: V_IMPACT + 0.15, label: 'ABOVE THE LAVA',
    fmt: (m) => `${m.toFixed(1)} m`,
    value: (v) => heightAt(storyT(v)),
    unit: heatLine,
    tag: lapseTag,
  },
  {
    from: V_IMPACT + 0.15, to: T_SWITCH + 2, label: 'ON THE LAVA',
    fmt: (s) => `${s.toFixed(1)} s`,
    value: (v) => Math.max(0, storyT(v) - T_IMPACT),
    unit: heatLine,
    tag: lapseTag,
  },
];

// how hard the camera jolts right now (decays after each beat)
export function joltAt(v) {
  let j = 0;
  for (const b of BEATS) { const dt = v - b.v; if (dt >= 0 && dt < 1.5) j = Math.max(j, Math.exp(-dt * 4) * b.hit); }
  return j;
}

// ---- where you look (your head): [v, yaw (deg, + = left of the lake's center), pitch (deg), vertical fov] ----
export const LOOK = [
  [-3, 12, -38, 82], [0, 12, -38, 82], [V_SLIP, 6, -56, 80], [2.0, 0, -80, 78], [V_LOOKUP - 0.15, 4, -84, 78],
  [V_LOOKUP + 0.45, 24, 64, 80], [V_DOWN - 0.15, 30, 68, 80], [V_DOWN + 0.4, 6, -84, 78], [V_WALL - 0.15, 10, -86, 76],
  [V_WALL + 0.5, 125, -38, 72], [10.75, 135, -44, 72], [11.3, 60, -84, 76], [V_IMPACT, 45, -78, 76],
  [13.5, 32, -62, 76], [14.1, 0, -14, 74], [16.7, 5, -12, 74], [V_CRACK + 0.2, 40, -46, 74], [19.8, 43, -49, 74],
  [V_SMOKE + 0.3, 2, -62, 74], [22.8, -3, -60, 74], [V_HAZE + 0.35, -42, -7, 74], [25.8, -38, -5, 74],
  [V_UP + 0.65, 0, 76, 80], [29.0, 3, 74, 80], [V_WAKE + 0.15, 0, -13, 74], [V_BUB2 - 0.3, 6, -11, 74],
  [V_BUB2 + 0.15, 24, -13, 74], [35.4, 22, -15, 74], [V_RAIN + 0.3, 6, -44, 74], [38.3, 2, -42, 74],
  [V_RIFT + 0.35, -48, -40, 74], [41.3, -44, -43, 74], [V_DOME + 0.35, 0, -74, 74], [43.6, 0, -70, 74],
  [V_BURST + 0.5, 0, 8, 82], [T_SWITCH, 0, 20, 86], [50, 0, 20, 86],
];

// ---- the lake's events (positions in lake coordinates: center 0,0; you land near z = +117) ----
// bubbles: [v, x, z, size]; the rocks that fell ahead of you splash in on their own (world.js)
export const BUBBLES = [
  [2.5, -40, -60, 0.6], [7.8, 55, 10, 0.7], [14.6, -60, -20, 0.7], [18.4, 45, -30, 0.8], [21.6, -20, -90, 0.9], [24.6, -75, 40, 0.8],
  [V_BUB1, -10, -40, 1.6], [V_BUB2, -32, 62, 2.4], [34.6, 40, 50, 1.5], [36.4, 12, 95, 1.6], [37.4, -14, 104, 1.4],
  [39.6, 20, 80, 1.8], [40.5, -24, 92, 1.6],
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.T = storyT(v);
  s.h = heightAt(s.T);
  s.speed = speedAt(s.T);
  s.rate = rateAt(v);
  s.onLake = v >= V_IMPACT;
  s.heat = heatAt(v) / SUN;
  s.molten = moltenAt(v);
  s.flash = smooth(V_FLASH, T_SWITCH - 0.03, v);
  s.flashColor = '#fffaf0';
  s.title = 1 - smooth(3.0, 3.6, v);
  s.fadeOut = 0;
  return s;
}
