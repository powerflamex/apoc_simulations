// "What if the Moon exploded?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A harbour promenade at night, crowded, phones up at a big full Moon over the skyline. On frame 0 it is already
// cracking; at V_BURST it comes apart into 7 giant pieces. The counter is the number of Moon pieces, under it the
// time since the explosion; the sky is a TIME-LAPSE (the counter's tag) whose clock shows the true time passing.
// The real numbers:
//   - the Moon: 1,737 km radius, 384,400 km away (0.26° radius in the sky). On frame 0 it is drawn M0 = 18.5x bigger
//     (the telephoto look); the lens "zooms out" as the cloud spreads, to true size (M = 1) by ~12 s.
//   - an explosion that only just breaks it (Neal Stephenson's "Seveneves" idea): the 7 pieces stay loosely held
//     together by their own gravity for days (the Moon's pull reaches ~60,000 km), drifting apart a little,
//     tumbling and hitting each other; every hit breaks them smaller. The dust and the bits knocked loose escape
//     at a few hundred m/s, so their orbits round Earth differ by tens of %: within weeks they shear out along the
//     Moon's orbit into a ring round Earth, tilted up across the sky. The grinding runs away and, about two years
//     on, the pieces start coming down in earnest (Stephenson's "hard rain").
//   - 7 pieces of equal volume would be 1,800 km across; ours are 1,000-2,000 km.
//   - anything that falls in from up there hits the air at ~11 km/s (25,000 mph); the hard rain's streaks heat the sky.
//   - the count reaches ~12 trillion by the end (average piece ~120 m across: the Moon is 2.2e19 m³).
import { smooth, clamp, lerp, rng } from './util.js';
import { TOWERS, TIDE_A } from './layout.js';

export const STORY_START = 0;
export const T_SWITCH = 49.4;            // inside the full white; the loop point sits in it
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

export const MOON_R = 1737.4e3, MOON_D = 384400e3;
export const ALPHA = MOON_R / MOON_D;    // the Moon's angular radius (rad)
export const M0 = 18.5;                  // how much bigger the Moon is drawn on frame 0
const HR = 3600, DAY = 86400;

// monotone cubic through [x, y] keys (never overshoots, so the clock never runs backwards)
function pchip(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---- the clock: story time T (s since the explosion) at video time v ----
// real time until the burst; then a time-lapse that jumps every ~3 s (the steep stretches) and cruises in between
export const V_BURST = 0.45;
const TK = [[1.0, 150], [2.0, 900], [3.0, 2400], [3.6, 4 * HR], [6.0, 7 * HR], [6.6, 16 * HR], [9.0, 22 * HR], [9.6, 1.55 * DAY],
  [12.4, 2.2 * DAY], [13.0, 6 * DAY], [15.6, 9 * DAY], [16.2, 45 * DAY], [19.0, 75 * DAY], [19.6, 140 * DAY], [22.0, 170 * DAY],
  [22.6, 240 * DAY], [26.4, 265 * DAY], [27.0, 400 * DAY], [31.8, 430 * DAY], [32.4, 700 * DAY], [36.0, 730 * DAY], [51.0, 760 * DAY]];
export const JUMPS = [3.0, 6.0, 9.0, 12.4, 15.6, 19.0, 22.0, 26.4, 31.8];      // video times the clock leaps
const lnT = pchip(TK.map((k) => k[0]), TK.map((k) => Math.log(k[1])));
export function storyT(v) {
  if (v < V_BURST) return v - V_BURST;
  if (v < 1.0) return 150 * (v - V_BURST) / (1 - V_BURST);
  return Math.exp(lnT(v));
}
// the tide: high water (at the top terraces) at 10.9 s, in the middle of its caption
export const TIDE_PHASE = Math.PI / 2 - 2 * Math.PI * storyT(10.9) / 44712;
export const rateAt = (v) => (storyT(v + 0.004) - storyT(v - 0.004)) / 0.008;    // story s per video s

// ---- the lens: the Moon drawn M0x its size, zooming out to its true size (M = 1) as the dust spreads ----
const MK = pchip([0.45, 1.0, 3.0, 6.0, 9.0, 12.0, 13.6, 15.2], [M0, 18.0, 13.0, 9.0, 6.0, 3.6, 1.5, 1.0]);
export const lensM = (v) => (v <= V_BURST ? M0 : v >= 15.2 ? 1 : clamp(MK(v), 1, M0));
// the 7 pieces drift apart (bound: they slow and stay within a few Moon radii) - how far, as a multiple of where
// each started from the middle
export const driftAt = (T) => 1.5 * (1 - Math.exp(-Math.max(0, T) / (3 * HR)));
// the dust's glowing core, its radius in units of the frame-0 Moon on screen (true size = this x M0 / M)
const DD = pchip([0.45, 1.0, 3.0, 6.0, 9.0, 12.0], [1.0, 1.25, 1.9, 2.6, 3.3, 4.2]);
export const dustScreenR = (v) => (v <= V_BURST ? 1 : DD(Math.min(v, 12)) + 0.3 * Math.max(0, v - 12));

// ---- the counter: pieces ----
const NK = [[150, 11], [900, 23], [2400, 41], [4 * HR, 149], [7 * HR, 287], [16 * HR, 1093], [22 * HR, 1987], [1.6 * DAY, 7583],
  [3.2 * DAY, 44871], [6 * DAY, 418317], [9 * DAY, 1597284], [45 * DAY, 127103846], [75 * DAY, 643318207], [140 * DAY, 5173284911],
  [170 * DAY, 9362051746], [240 * DAY, 41273950118], [265 * DAY, 62741385207], [400 * DAY, 638302771946], [430 * DAY, 957128334509],
  [700 * DAY, 8271553019284], [730 * DAY, 10173418265937], [760 * DAY, 11931206477158]];
const lnN = pchip(NK.map((k) => Math.log(k[0])), NK.map((k) => Math.log(k[1])));
// before the burst the cracks join up across the face: 1 -> 7 pieces
const CRACKS = [[-0.62, 2], [-0.36, 3], [-0.1, 4], [0.1, 5], [0.24, 6], [0.36, 7]];
export function piecesAt(v) {
  if (v < V_BURST) { let n = 1; for (const [t, c] of CRACKS) if (v >= t) n = c; return n; }
  const T = storyT(v);
  if (T < 150) return 7 + Math.floor(4 * T / 150);
  return Math.round(Math.exp(lnN(Math.log(T))));
}
export function sinceText(v) {
  const T = storyT(v);
  if (T < 1) return 'RIGHT NOW';
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 'S'}`;
  if (T < 60) return `${pl(Math.floor(T), 'SECOND')} LATER`;
  if (T < HR) return `${pl(Math.floor(T / 60), 'MINUTE')} LATER`;
  if (T < 2 * DAY) return `${pl(Math.floor(T / HR), 'HOUR')} LATER`;
  if (T < 61 * DAY) return `${pl(Math.floor(T / DAY), 'DAY')} LATER`;
  const mo = Math.floor(T / (DAY * 30.44));
  if (mo < 12) return `${pl(mo, 'MONTH')} LATER`;
  // past a year: years and months, and in the first month of a new year the days tick by
  const y = Math.floor(T / (DAY * 365.25)), rest = T - y * DAY * 365.25, m = Math.floor(rest / (DAY * 30.44)), d = Math.floor(rest / DAY);
  if (m === 0) return `${pl(y, 'YEAR')}${d ? `, ${pl(d, 'DAY')}` : ''} LATER`;
  return `${pl(y, 'YEAR')}, ${pl(m, 'MONTH')} LATER`;
}
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export const COUNTERS = [{
  label: 'MOON PIECES',
  fmt: (n) => fmtInt(n),
  value: (v) => piecesAt(v),
  unit: (v) => sinceText(v),
  tag: (v) => (v >= V_BURST + 0.05 ? 'TIME-LAPSE' : ''),
}];

// ---- captions (video time): short, one number, "you" where it fits; never over the title ----
export const CAPTIONS = [
  [4.1, 7.0, 'The big ones are 1,000 km wide'],
  [9.9, 12.5, 'Every 12 hours the sea climbs to your feet'],
  [16.5, 19.3, 'Midnight, and you cast a shadow'],
  [22.9, 25.8, 'Pieces start falling at 25,000 mph'],
  [29.95, 32.7, 'One makes it down, 500 m from you'],
  [34.0, 36.9, 'The Moon is gone. Now it’s falling.'],
  [37.6, 40.4, 'The sky above you is heating up'],
  [41.2, 44.1, '11 trillion pieces. Nowhere is safe.'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3), fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- events ----
// the 7 big pieces each shatter in a collision (video time); a flash where they hit
export const SHATTER = [[3, 2.3], [5, 3.4], [1, 4.5], [6, 5.3], [0, 6.2], [2, 7.2], [4, 8.1]];
// the tide: the clock runs ~5.5 hours per second from 9.6 to 12.4 s, so the sea floods up the terraces and drains once
export const V_FIRST = 22.35;            // the first piece falls in
export const V_SPLASH = 29.6;            // a fireball comes down in the harbour, 500 m out
export const SPLASH = { x: 70, z: -505 };
export const V_WAVE = 31.9;              // its wave reaches the steps and washes over the deck
export const V_RAIN = 33.2;              // the hard rain: the sky fills with streaks
export const V_HEAT = 34.6;              // the clouds glow from the heat
export const V_RUN = 37.2;               // people start running
export const V_CHUNK = 45.9;             // the giant chunk appears high over the harbour...
export const V_HIT = 48.45;              // ...and hits
export const CHUNK = { x: -20, z: -720 };
export const V_WHITE = 48.85;            // full white

// the towers across the water that get hit, in order (each closer to you / bigger than the last), and how far up
const pick = (x, z, minH) => {
  let best = -1, bd = 1e9;
  TOWERS.forEach((t, i) => { if (t.h < minH || t.style === 3) return; const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = i; } });
  return best;
};
export const HITS = [
  { v: 40.15, tower: pick(-430, -2150, 140), frac: 0.72, size: 1.0 },
  { v: 40.95, tower: pick(520, -1950, 150), frac: 0.66, size: 1.1 },
  { v: 41.7, tower: 3, frac: 0.6, size: 1.3 },                       // the LED tower on the right
  { v: 42.35, tower: 1, frac: 0.58, size: 1.5 },                     // the X tower
  { v: 43.05, tower: pick(-140, -1620, 120), frac: 0.5, size: 1.5 },
  { v: 43.75, tower: 0, frac: 0.62, size: 1.9 },                     // the tallest
  { v: 44.45, tower: 2, frac: 0.45, size: 1.9 },
  { v: 45.2, tower: pick(250, -1600, 100), frac: 0.4, size: 2.2 },
].map((h) => ({ ...h, t: TOWERS[h.tower] }));
// where each hit lands (world)
for (const h of HITS) { const t = h.t; h.p = [t.x - t.w * 0.2, t.base + t.h * h.frac, t.z + t.d * 0.5]; }
// far-off hits beyond the mountain (a glow on the horizon, the clouds lit from below)
export const FAR_HITS = [];
{
  const R = rng(91);
  for (let k = 0; k < 9; k++) FAR_HITS.push({ v: 35.0 + k * 0.62 + R() * 0.4, p: [(R() * 2 - 1) * 9000, 0, -14000 - R() * 30000], size: 0.7 + R() * 0.8 });
}

// ---- the falling pieces: streaks (world metres; you are at the origin) ----
// small ones burn up 70-80 km up; fireballs come lower and some burst; scripted ones hit the harbour and the towers
export const METEORS = [];
{
  const R = rng(4242);
  const rate = (v) => v < V_FIRST ? 0 : v < 26.4 ? lerp(1.0, 3.5, smooth(V_FIRST, 26.4, v)) : v < 31.8 ? lerp(4, 9, smooth(26.4, 31.8, v))
    : v < V_RAIN ? lerp(10, 30, smooth(31.8, V_RAIN, v)) : v < 38 ? lerp(40, 100, smooth(V_RAIN, 38, v)) : lerp(110, 150, smooth(38, 46, v));
  const dir = () => { const x = -0.5 + (R() - 0.5) * 0.35, y = -0.82 + (R() - 0.5) * 0.15, z = -0.12 + (R() - 0.5) * 0.4; const L = Math.hypot(x, y, z); return [x / L, y / L, z / L]; };
  const add = (v0, el, az, alt0, alt1, speed, size, kind) => {
    const u = dir();
    const d0 = alt0 / Math.sin(el);
    const p0 = [Math.sin(az) * Math.cos(el) * d0, alt0, -Math.cos(az) * Math.cos(el) * d0];
    const L = (alt0 - alt1) / -u[1];
    const p1 = [p0[0] + u[0] * L, alt1, p0[2] + u[2] * L];
    METEORS.push({ v0, v1: v0 + L / speed, p0, p1, size, kind });
  };
  // the very first one: right over the skyline
  METEORS.push({ v0: V_FIRST, v1: V_FIRST + 2.1, p0: [32000, 96000, -150000], p1: [9000, 64000, -138000], size: 1.6, kind: 0 });
  let t = V_FIRST + 0.9;
  while (t < V_WHITE) {
    t += -Math.log(1 - R() * 0.999) / rate(t);
    const el = (12 + Math.pow(R(), 0.8) * 55) * Math.PI / 180, az = (R() * 2 - 1) * 30 * Math.PI / 180;
    const big = R() < (t < 26.4 ? 0.0 : t < V_RAIN ? 0.12 : 0.2);
    if (big) add(t, el, az, 100000, 18000 + R() * 15000, 13000 + R() * 3000, 3 + R() * 4, 1);
    else add(t, el, az, 92000 + R() * 10000, 68000 + R() * 12000, 11500 + R() * 3000, 0.6 + R() * 1.0, 0);
  }
  // the one that comes down in the harbour (it slows from ~11 km/s; the last stretch in ~2 s)
  METEORS.push({ v0: V_SPLASH - 2.6, v1: V_SPLASH, p0: [6800, 26000, -9800], p1: [SPLASH.x, 0, SPLASH.z], size: 6, kind: 2 });
  // the towers' hits
  for (const h of HITS) {
    const L = 30000, u = [-0.42, -0.86, 0.29];
    METEORS.push({ v0: h.v - 2.2, v1: h.v, p0: [h.p[0] - u[0] * L, h.p[1] - u[1] * L, h.p[2] - u[2] * L], p1: h.p, size: 5 + 3 * h.size, kind: 3, hit: h });
  }
  for (const h of FAR_HITS) {
    const L = 60000, u = [-0.4, -0.85, -0.3];
    METEORS.push({ v0: h.v - 3, v1: h.v, p0: [h.p[0] - u[0] * L, h.p[1] - u[1] * L, h.p[2] - u[2] * L], p1: h.p, size: 8, kind: 3 });
  }
  METEORS.sort((a, b) => a.v0 - b.v0);
}

// ---- state ----
export function state(v) {
  const s = { v };
  s.T = storyT(v);
  s.rate = rateAt(v);
  s.M = lensM(v);
  s.drift = driftAt(s.T);
  s.dustR = dustScreenR(v) * M0 / s.M;              // the dust core's true radius (Moon radii)
  s.N = piecesAt(v);
  // the cracks spreading over the face before the burst (in the loop's lead-in and the first half second)
  s.crack = smooth(-0.9, V_BURST, v);
  s.burst = v >= V_BURST ? smooth(V_BURST, V_BURST + 0.04, v) * Math.exp(-(v - V_BURST) / 0.22) : 0;          // the flash as it comes apart
  s.hot = v < V_BURST ? 0 : Math.exp(-Math.max(0, s.T) / 900);            // the fresh faces glowing (fades over ~15 min)
  // the time-lapse's leaps: a pulse at each
  s.leap = 0;
  for (const j of JUMPS) { const dt = v - j; if (dt > -0.05 && dt < 1.2) s.leap = Math.max(s.leap, smooth(-0.05, 0.1, dt) * Math.exp(-Math.max(0, dt - 0.1) / 0.35)); }
  // the pieces' cloud: along-track stretch (shear) and the ring forming
  const days = Math.max(0, s.T) / DAY;
  s.stretch = 1 + Math.pow(days / 1.5, 1.1);
  s.ring = smooth(12.6, 16.6, v);
  s.dust = smooth(0.4, 3, v) * 0.4 + 0.6 * smooth(3, 16, v) + 0.6 * smooth(16, 22, v) + 0.4 * smooth(V_RAIN, 40, v);
  s.pieces = 1 - smooth(11.5, 13.5, v);                                   // the 7 (and their bits) as shapes
  // the light from the sky: the full Moon, then the ring (bright enough to cast shadows), then the falling rock
  s.skyL = 0.06 + 0.25 * smooth(3, 12, v) + 1.0 * smooth(13.5, 17.0, v) + 0.25 * smooth(V_RAIN, 42, v);
  // the tide (story clock), its swing blurred away when the clock races too fast to follow
  const cyc = s.rate / 44712;
  const tideK = (1 - smooth(1.0, 2.0, cyc)) * (1 - smooth(13.2, 14.5, v));
  s.tide = TIDE_A * Math.sin(2 * Math.PI * Math.max(0, s.T) / 44712 + TIDE_PHASE) * tideK;
  s.slosh = tideK * smooth(9.4, 10.0, v) * (1 - smooth(12.5, 13.2, v));   // chop on the steps while it floods
  // the splash's wave: a surge up the steps and over the deck
  s.surge = smooth(V_WAVE - 0.4, V_WAVE + 0.5, v) * (1 - smooth(V_WAVE + 1.6, V_WAVE + 3.4, v));
  s.flood = smooth(V_WAVE + 0.2, V_WAVE + 1.1, v) * (1 - smooth(V_WAVE + 1.8, V_WAVE + 3.6, v));   // how far over the deck (0..1)
  s.wet = smooth(V_WAVE + 0.4, V_WAVE + 1.0, v);                          // the deck stays wet after
  s.rain = smooth(V_RAIN - 0.6, V_RAIN + 2.5, v);
  s.heat = smooth(V_HEAT, V_HEAT + 4, v) + 0.4 * smooth(42, 47, v);
  s.dustWall = smooth(42.4, 47.2, v);                                    // the dust rolling across the water
  s.black = smooth(43.2, 46.5, v);                                       // the city's lights failing
  s.chunk = smooth(V_CHUNK, V_HIT, v);
  s.white = smooth(V_HIT - 0.15, V_WHITE, v);
  s.flash = s.white;
  s.flashColor = '#fff';
  s.title = 1 - smooth(3.3, 4.1, v);
  return s;
}
