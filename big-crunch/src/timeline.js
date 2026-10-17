// "What if you lived to the Big Crunch?" — the story as functions of VIDEO time v (seconds).
// The same seaside promenade as trillion-years (35° N, looking west over the bay at sunset); you never move, never
// age. The rule: time speeds up 10x every 2 s. A year has passed at 11.4 s, a billion years at 29.4 s, the red giant
// Sun swallows Earth at 7.6 billion years (34 s). Then space: the universe keeps expanding for a while, stops, and
// falls back in; the Big Crunch comes ~20 billion years from now (Tye et al. 2025, "The lifespan of our universe":
// with dark energy weakening as the DESI/DES measurements hint, the universe's whole lifespan is ~33 billion years).
// The collapse (Rees 1969, "The collapse of the universe: an eschatological study"): the galaxies come back,
// blue-shifted, and merge ~100 million years before the end; the leftover light of the Big Bang heats up as space
// shrinks, and in the last ~100,000 years the whole sky glows hotter than a star's surface, so stars boil away from
// the outside; at the very end atoms and then nuclei are broken apart. From the turnaround the counter shows the
// time left.
// Earth part, real numbers used: see trillion-years/src/timeline.js (the Sun's brightening and red giant phase,
// Betelgeuse, ice ages, the 10 km asteroid, the oceans boiling away).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
const LN10 = Math.log(10);
export const MIN_PER_YEAR = 525960;           // 365.25 days
export const LY = Math.log10(MIN_PER_YEAR);   // 5.721
export const SEC_PER_DECADE = 2.0;            // the rule: 10x every 2 s
export const vOfYears = (y) => SEC_PER_DECADE * (Math.log10(y) + LY);
export const V_1B = vOfYears(1e9);            // 29.4 s

// after a billion years the pace eases off for the Sun's end (log10 minutes at video time v); then in space the
// time LEFT until the crunch (log10 years) runs down; both on monotone cubics through the keys
export const CRUNCH_Y = 20e9;
export const V_5B = 31.4, V_ENGULF = 34.0, V_TURN = 43.0, V_CRUNCH = 64.6;
const KEYS = [
  [V_1B, LY + 9],
  [V_5B, LY + Math.log10(5e9)],
  [32.6, LY + Math.log10(7.0e9)],
  [V_ENGULF, LY + Math.log10(7.6e9)],
];
const LEFT = [
  [V_ENGULF, Math.log10(CRUNCH_Y - 7.6e9)],
  [38.0, Math.log10(10e9)],
  [V_TURN, Math.log10(8e9)],
  [48.0, Math.log10(4e9)],
  [52.0, 9.0],
  [55.0, 6.0],
  [58.0, 3.2],
  [61.0, 0.0],
  [V_CRUNCH, Math.log10(1 / (365.25 * 86400))],
];
// Fritsch-Carlson slopes (m0: the first one, if given)
function slopes(K, m0) {
  const n = K.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((K[i + 1][1] - K[i][1]) / (K[i + 1][0] - K[i][0]));
  m[0] = m0 ?? d[0];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  m[n - 1] = d[n - 2];
  for (let i = 0; i < n - 1; i++) {
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
}
function herm(K, M, v) {
  let i = 0;
  while (v > K[i + 1][0]) i++;
  const [x0, y0] = K[i], [x1, y1] = K[i + 1], h = x1 - x0, t = (v - x0) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * M[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * M[i + 1];
}
const SK = slopes(KEYS, 1 / SEC_PER_DECADE), SL = slopes(LEFT);
// log10 of the years left until the crunch (space part)
export function logLeft(v) {
  if (v <= V_ENGULF) return LEFT[0][1];
  if (v >= V_CRUNCH) return -20;
  return herm(LEFT, SL, v);
}
export const yearsLeft = (v) => (v >= V_CRUNCH ? 0 : Math.pow(10, logLeft(v)));
// log10(minutes passed) at video time v
export function logMin(v) {
  if (v <= V_1B) return v / SEC_PER_DECADE;
  if (v <= V_ENGULF) return herm(KEYS, SK, v);
  return LY + Math.log10(CRUNCH_Y - yearsLeft(v));
}
// the trillion-years video time of the same story moment on Earth (the camera moves are keyed to it)
const OLD = [[V_1B, 51.52], [V_5B, 55.0], [32.6, 56.6], [V_ENGULF, 58.0]];
export function oldV(v) {
  if (v <= V_1B) return v * 3.5 / SEC_PER_DECADE;
  if (v >= V_ENGULF) return 58.0 + (v - V_ENGULF);
  let i = 0;
  while (v > OLD[i + 1][0]) i++;
  return lerp(OLD[i][1], OLD[i + 1][1], (v - OLD[i][0]) / (OLD[i + 1][0] - OLD[i][0]));
}
export const logRate = (v) => (v >= V_CRUNCH ? 0 : (logMin(v + 0.005) - logMin(v - 0.005)) / 0.01);
export const minutesAt = (v) => Math.pow(10, logMin(v));
export const yearsAt = (v) => minutesAt(v) / MIN_PER_YEAR;
export const rateAt = (v) => minutesAt(v) * LN10 * logRate(v);   // story minutes per video second
// how much story time one frame smears together (a 180° shutter at 60 fps), minutes
export const exposure = (v) => rateAt(v) / 120;

// ---- the Sun's place in the sky ----
export const LAT = 35 * Math.PI / 180;
const DOY0 = 70;                               // the first frame: early March (the Sun sets a little south of west)
const LEAD = 23;                               // minutes before sunset
export const decl = (doy) => 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (doy - 81) / 365.25);
const sunsetH = (d) => Math.acos(clamp(-Math.tan(LAT) * Math.tan(d), -1, 1));
// direction (north +x, up +y, east +z) of the Sun at hour angle H (radians, + = afternoon) and declination d
export function sunDir(H, d, out = [0, 0, 0]) {
  const sl = Math.sin(LAT), cl = Math.cos(LAT), sd = Math.sin(d), cd = Math.cos(d);
  out[0] = sd * cl - cd * Math.cos(H) * sl;   // north
  out[1] = sd * sl + cd * Math.cos(H) * cl;   // up
  out[2] = -cd * Math.sin(H);                 // east
  return out;
}
export const V_LOCK = vOfYears(1 / 365.25);   // 6.3 s: one day in, from here every frame is 23 min before sunset
// the Sun at video time v: its direction now, and the two ends of the streak it paints during one frame
export function sunAt(v) {
  const T = minutesAt(v);
  const doy = DOY0 + T / 1440;
  if (v < V_LOCK) {
    const d = decl(doy), H = sunsetH(decl(DOY0)) - (LEAD - T) * 2 * Math.PI / 1440;
    const p = sunDir(H, d);
    return { dir: p, a: p, b: p, spread: 0, doy };
  }
  const lock = (dd) => sunDir(sunsetH(dd) - LEAD * 2 * Math.PI / 1440, dd);
  const E = exposure(v) / 1440;                // days smeared into this frame
  let dmin = Infinity, dmax = -Infinity;
  if (E > 365.25 / 2) { dmin = -23.44 * Math.PI / 180; dmax = -dmin; }
  else for (let k = 0; k <= 8; k++) { const d = decl(doy - E * k / 8); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
  // once the Sun starts to swell, every frame is also taken on the same day of the year: the streak closes up into
  // one (growing) disk
  const same = smooth(V_5B - 0.8, V_5B + 0.3, v), d0 = decl(DOY0);
  dmin = lerp(dmin, d0, same); dmax = lerp(dmax, d0, same);
  const a = lock(dmin), b = lock(dmax), now = lock(lerp(decl(doy), d0, same));
  const spread = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  return { dir: now, a, b, spread, doy };
}

// ---- the Sun over billions of years ----
// radius (today = 1) through the subgiant and red giant phases (log-interpolated), surface temperature (K)
const GIANT = [[5.0e9, 1.6, 5570], [6.0e9, 2.0, 5300], [6.5e9, 2.6, 5000], [7.0e9, 10, 4500], [7.3e9, 40, 4000], [7.5e9, 120, 3600], [7.6e9, 215, 3300]];
export function sunLife(Y) {
  // brightening on the main sequence
  let lum = 1 / (1 - 0.4 * Math.min(Y, 5e9) / 4.57e9);
  let R = 1 + 0.6 * Math.pow(Math.min(Y, 5e9) / 5e9, 2), temp = 5772 - 200 * Math.min(Y, 5e9) / 5e9;
  if (Y > 5e9) {
    let i = 0;
    while (i < GIANT.length - 2 && Y > GIANT[i + 1][0]) i++;
    const [y0, r0, t0] = GIANT[i], [y1, r1, t1] = GIANT[i + 1], k = clamp((Y - y0) / (y1 - y0));
    R = Math.exp(lerp(Math.log(r0), Math.log(r1), k)); temp = lerp(t0, t1, k);
    lum *= Math.pow(R / 1.6, 2) * Math.pow(temp / 5570, 4);
  }
  const f = clamp((Y - 5e9) / 2.6e9);
  return { lum, R, temp, f };
}
// apparent angular radius (radians) seen from Earth
export const sunAngR = (R) => Math.asin(Math.min(1, R * 0.00465));

// ---- the big moments ----
export const V_SUNSET = vOfYears(LEAD / MIN_PER_YEAR);     // 2.7 s: the Sun goes down
export const V_NOVA = vOfYears(1e5);                       // 21.4 s: Betelgeuse
export const V_IMPACT = vOfYears(1e8) + 0.3;               // 27.7 s: the asteroid
export const V_FADE = 64.6;                                // the white-out
export const T_SWITCH = 65.4;
export const LOOP = 1.0;                                   // the dark clears onto the first frame
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const UNDER_COLOR = '#ffffff';

const word = (n) => n.toLocaleString('en-US');
export const BEATS = [
  [vOfYears(60 / MIN_PER_YEAR), '1 hour'],
  [V_LOCK, '1 day'],
  [vOfYears(1 / 12), '1 month'],
  ...[0, 1, 2, 3, 4, 5].map((k) => [vOfYears(10 ** k), `${word(10 ** k)} year${k ? 's' : ''}`]),
  [vOfYears(1e6), '1 million years'],
  [vOfYears(1e7), '10 million years'],
  [vOfYears(1e8), '100 million years'],
  [V_1B, '1 billion years'],
  [V_5B, '5 billion years'],
  [V_ENGULF, '7.6 billion years'],
  [38.0, '10 billion years'],
  [48.0, '16 billion years'],
  [52.0, '19 billion years'],
  [V_CRUNCH - 0.6, 'THE BIG CRUNCH', true],
].map(([v, label, last]) => ({ v, label, last: !!last }));
export function beatAt(v) {
  let b = null, i = -1;
  BEATS.forEach((x, k) => { if (v >= x.v) { b = x; i = k; } });
  return b ? { ...b, i, dt: v - b.v } : null;
}

export const CAPTIONS = [
  [3.6, 5.6, 'You stop aging, and stand right here.'],
  [6.0, 8.0, 'Time speeds up 10x every 2 seconds.'],
  [9.5, 11.3, 'A month. Your phone died weeks ago.'],
  [13.6, 15.2, 'New towers rise around you.'],
  [15.6, 17.4, 'Everyone you’ve ever met is gone.'],
  [17.7, 19.3, 'You can’t read the signs anymore.'],
  [19.6, 21.2, 'As long as all of human history.'],
  [21.6, 23.3, 'Betelgeuse explodes: a star you can see by day.'],
  [23.6, 25.3, 'Ice ages come and go. The sea drops 400 ft.'],
  [25.6, 27.4, 'Every ruin has worn away.'],
  [27.9, 29.4, 'An asteroid like the dinosaur killer hits.'],
  [29.7, 31.3, 'The Sun is 10% brighter. The oceans boil away.'],
  [31.6, 33.6, 'The Sun swells to 200 times its size.'],
  [34.5, 36.0, 'It swallows Earth.'],
  [36.4, 38.6, 'The Sun is left as a tiny white dwarf.'],
  [39.4, 41.8, 'The other galaxies drift away, slower and slower.'],
  [42.6, 44.8, 'Then the universe stops growing.'],
  [45.4, 47.6, 'And starts to fall back in.'],
  [48.4, 50.8, 'Every galaxy rushes back toward you.'],
  [51.4, 53.6, 'Galaxies crash into each other.'],
  [54.6, 56.8, 'Space shrinks. The sky starts to glow.'],
  [57.2, 59.2, 'Red-hot. Then orange. Then yellow.'],
  [59.5, 61.3, 'The whole sky is hotter than the Sun.'],
  [61.4, 62.7, 'Stars boil away. Atoms break apart.'],
  [62.9, 64.2, 'Everything falls into one point.'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const fmtInt = (x) => Math.floor(x).toLocaleString('en-US');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export function fmtSpan(m, short = false) {
  if (m < 1) return plural(Math.max(1, Math.floor(m * 60)), 'second');
  if (m < 60) return plural(Math.floor(m), short ? 'minute' : 'min').replace('mins', 'min');
  if (m < 1440) { const h = Math.floor(m / 60), mm = Math.floor(m % 60); return short ? plural(h, 'hour') : `${h} h ${String(mm).padStart(2, '0')} min`; }
  const d = m / 1440;
  if (d < 61) return plural(Math.floor(d), 'day');
  const y = m / MIN_PER_YEAR;
  if (y < 1) return `${(y * 12).toFixed(1)} months`;
  if (y < 10) return `${y.toFixed(1)} years`;
  if (y < 1e6) return `${fmtInt(y)} years`;
  if (y < 1e9) return `${(y / 1e6).toFixed(y < 1e7 ? 2 : y < 1e8 ? 1 : 0)} million years`;
  if (y < 1e12 - 5e8) return `${(y / 1e9).toFixed(y < 1e10 ? 2 : y < 1e11 ? 1 : 0)} billion years`;
  return `${(y / 1e9).toFixed(0)} billion years`;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'TIME PASSED',
    fmt: (m) => fmtSpan(m),
    value: (v) => minutesAt(v),
    unit: (v) => (v < V_TURN ? `1 SECOND = ${fmtSpan(rateAt(v), true).toUpperCase()}`
      : v < V_CRUNCH ? `CRUNCH IN ${fmtSpan(yearsLeft(v) * MIN_PER_YEAR).toUpperCase()}` : 'THE END'),
    badge: (v) => (v < V_CRUNCH ? 'FINISH LINE: THE BIG CRUNCH' : 'THE BIG CRUNCH'),
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.Y = yearsAt(v);
  s.T = minutesAt(v);
  s.E = exposure(v);                         // minutes per frame
  s.sun = sunAt(v);
  s.life = sunLife(s.Y);
  s.sunR = sunAngR(s.life.R);
  // people and cars: there in real time, thinning out of a long exposure (gone once a frame spans ~3 days)
  s.crowd = 1 - smooth(Math.log10(20), Math.log10(4320), Math.log10(Math.max(s.E, 1e-3)));
  // the city keeps being rebuilt, then fades out of the long exposure between 100,000 and 10 million years
  s.city = 1 - smooth(Math.log10(1e5), Math.log10(6e6), Math.log10(s.Y));
  // ice ages: ~100,000-year cycles (slow build-up, fast melt), from ~50,000 years on, fading out after ~10 million;
  // averaged over the frame's exposure
  {
    const Ey = s.E / MIN_PER_YEAR;
    const w = smooth(3e4, 9e4, s.Y) * (1 - smooth(1.2e7, 4e7, s.Y));
    let acc = 0;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const y = s.Y - Ey * (k / n);
      const ph = ((y / 1e5) % 1 + 1) % 1;
      const ice = ph < 0.88 ? ph / 0.88 : 1 - (ph - 0.88) / 0.12;   // 0 = today, 1 = glacial peak
      acc += ice * ice;
    }
    s.ice = w * acc / n;
  }
  // the oceans boil away between ~1 and ~2 billion years; the plants die before that
  s.boil = smooth(9.0, 9.4, Math.log10(s.Y));
  s.sea = -120 * s.ice - 3000 * Math.pow(s.boil, 5);          // sea level, m (the shallows go first, slowly)
  s.green = 1 - smooth(Math.log10(5e8), Math.log10(1.1e9), Math.log10(s.Y));
  s.steam = smooth(0, 0.06, s.boil) * (1 - smooth(0.45, 0.75, s.boil));
  s.land = smooth(Math.log10(2e6), Math.log10(1.5e7), Math.log10(s.Y));   // 0 = the promenade, 1 = bare land
  s.lava = smooth(Math.log(2.5), Math.log(60), Math.log(s.life.R));                      // the ground glows as the Sun closes in
  s.nova = v > V_NOVA - 0.1 ? smooth(V_NOVA, V_NOVA + 0.25, v) * (1 - smooth(V_NOVA + 1.6, V_NOVA + 3.0, v)) : 0;
  s.impact = (v - V_IMPACT) * 1.5;                             // since the asteroid hit (it plays 1.5x faster than in trillion-years)
  // the end of Earth: the Sun's surface sweeps over everything, then you are out in space
  s.space = v >= V_ENGULF + 0.15 ? 1 : 0;
  s.flash = v < V_ENGULF ? smooth(V_ENGULF - 0.35, V_ENGULF, v) : 1 - smooth(V_ENGULF + 0.25, V_ENGULF + 1.2, v);
  s.flashColor = '#fff3e0';
  s.fadeColor = '#ffffff';   // the end is a white-out (the loop cuts inside it)
  s.fadeOut = smooth(V_FADE - 0.1, T_SWITCH - 0.05, v);
  // space: lg = log10 years left. The galaxies (out: how far they have receded, back: how far they have come back,
  // merge: crashed together into one glow), the sky's glow (the Big Bang's leftover light, heating up: skyT, K),
  // the stars boiling away, the final white-out
  const lg = logLeft(v);
  s.lg = lg;
  s.out = smooth(V_ENGULF + 1, V_TURN, v) * (1 - smooth(V_TURN + 1, 49, v));
  s.back = smooth(V_TURN + 1.5, 53.0, v);
  s.merge = smooth(8.6, 6.2, lg);
  // the glow is laid out on the video clock so each colour gets its moment: dull red, orange, as hot as the Sun's
  // surface (~5,800 K) at 58.5 s, white-hot, then the white-out at the crunch
  s.glow = smooth(53.8, 56.5, v);
  {
    const K = [[54, 1600], [56.5, 2800], [58.5, 4500], [59.6, 5800], [61.5, 7500], [63, 10000]];
    let i = 0;
    while (i < K.length - 2 && v > K[i + 1][0]) i++;
    s.skyT = lerp(K[i][1], K[i + 1][1], clamp((v - K[i][0]) / (K[i + 1][0] - K[i][0])));
  }
  s.boilStars = smooth(59.6, 62.0, v);
  s.white = smooth(62.9, V_CRUNCH + 0.2, v);                          // everything falling into one blinding point
  s.under = 0;
  s.title = 1 - smooth(3.0, 3.6, v);
  s.you = 1 - smooth(5.6, 6.4, v) + (v > V_ENGULF + 1.4 ? smooth(V_ENGULF + 1.4, V_ENGULF + 2, v) * (1 - smooth(63.2, 63.8, v)) : 0);
  s.endcard = 0; s.endText = 0;
  return s;
}
