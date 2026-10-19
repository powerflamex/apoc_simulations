// "What if you lived 1 trillion years?" — the story as functions of VIDEO time v (seconds).
// You stand at the railing of a seaside promenade (35° N, looking west over the bay at sunset) and never move,
// never age. The rule: time speeds up 10x every 3.5 s. The first frame is 1 minute in; a year has passed at 20 s,
// a billion years at 51.5 s. Then the pace eases off for the end of the Sun (it swells and swallows Earth at
// 7.6 billion years), and races again to the finish line: 1 trillion years.
// The time-lapse is filmed like a real one: until the first day is over it runs straight through (the sun sets,
// night, dawn, the day); after that every frame is taken at the same moment of the day, 23 minutes before sunset,
// so the light stays golden and the Sun slides north and south along the horizon with the seasons. Anything that
// changes faster than a frame (people, cars, clouds, the seasons themselves) blurs the way it does in a long
// exposure (`exposure`).
// Real numbers used:
//   Sun: brightens ~1% per 110 million years (Gough 1981: L = 1/(1 - 0.4 t/4.57 Gyr)): 10% brighter at 1 billion
//   years, when the oceans start to boil away (the "moist greenhouse", ~1-1.5 Gyr). It leaves the main sequence at
//   ~5 Gyr and swells into a red giant; it reaches Earth's orbit (~215 times its radius today) at the tip of the
//   red giant branch, 7.6 Gyr from now (Schröder & Smith 2008: Earth is most likely swallowed). It then sheds its
//   outer layers (a planetary nebula) and is left as a white dwarf about the size of Earth.
//   Plants: CO2 falls as the Sun brightens; photosynthesis fails between ~0.6 and ~1 Gyr.
//   Betelgeuse (red supergiant, 550-700 light years) is expected to go supernova within ~100,000 years; it will
//   outshine everything in the night sky but the Moon and be visible by day.
//   Ice ages: ~100,000-year cycles; at the peak the sea is ~120 m (400 ft) lower than today.
//   Large impacts: a 10 km (6-mile) asteroid like the one that ended the dinosaurs hits about once per ~100 Myr.
//   The expanding universe: by ~100-150 Gyr every galaxy outside our own merged galaxy has red-shifted out of sight.
//   Recorded human history (writing) ~5,000 years; farming and the first towns ~10,000-12,000 years.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
const LN10 = Math.log(10);
export const MIN_PER_YEAR = 525960;           // 365.25 days
export const LY = Math.log10(MIN_PER_YEAR);   // 5.721
export const SEC_PER_DECADE = 3.5;            // the rule: 10x every 3.5 s
export const vOfYears = (y) => SEC_PER_DECADE * (Math.log10(y) + LY);
export const V_1B = vOfYears(1e9);            // 51.5 s

// after a billion years the pace eases off for the Sun's end, then races to the finish
// (log10 minutes at video time v; monotone cubic through the keys)
const KEYS = [
  [V_1B, LY + 9],
  [55.0, LY + Math.log10(5e9)],
  [56.6, LY + Math.log10(7.0e9)],
  [58.0, LY + Math.log10(7.6e9)],
  [59.8, LY + 10],
  [61.5, LY + 11],
  [63.2, LY + 12],
];
export const V_5B = 55.0, V_ENGULF = 58.0, V_10B = 59.8, V_100B = 61.5, V_1T = 63.2;
// Fritsch-Carlson slopes (the first one matches the steady 1/3.5 decade per second before it)
const SLOPES = (() => {
  const n = KEYS.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((KEYS[i + 1][1] - KEYS[i][1]) / (KEYS[i + 1][0] - KEYS[i][0]));
  m[0] = 1 / SEC_PER_DECADE;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  m[n - 1] = d[n - 2];
  for (let i = 0; i < n - 1; i++) {
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
})();
// log10(minutes passed) at video time v, and its rate (decades per video second)
export function logMin(v) {
  if (v <= V_1B) return v / SEC_PER_DECADE;
  if (v >= V_1T) return LY + 12;
  let i = 0;
  while (v > KEYS[i + 1][0]) i++;
  const [x0, y0] = KEYS[i], [x1, y1] = KEYS[i + 1], h = x1 - x0, t = (v - x0) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * SLOPES[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * SLOPES[i + 1];
}
export const logRate = (v) => (v >= V_1T ? 0 : (logMin(v + 0.005) - logMin(v - 0.005)) / 0.01);
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
export const V_LOCK = vOfYears(1 / 365.25);   // 11.05 s: one day in, from here every frame is 23 min before sunset
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
export const V_SUNSET = vOfYears(LEAD / MIN_PER_YEAR);     // 4.8 s: the Sun goes down
export const V_NOVA = vOfYears(1e5);                       // 37.5 s: Betelgeuse
export const V_IMPACT = vOfYears(1e8) + 0.3;               // 48.3 s: the asteroid
export const V_FADE = 65.0;                                // the last light goes out
export const T_SWITCH = 65.6;
export const LOOP = 1.0;                                   // the dark clears onto the first frame
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const UNDER_COLOR = '#000000';

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
  [V_10B, '10 billion years'],
  [V_100B, '100 billion years'],
  [V_1T, '1 trillion years', true],
].map(([v, label, last]) => ({ v, label, last: !!last }));
export function beatAt(v) {
  let b = null, i = -1;
  BEATS.forEach((x, k) => { if (v >= x.v) { b = x; i = k; } });
  return b ? { ...b, i, dt: v - b.v } : null;
}

export const CAPTIONS = [
  [3.6, 6.0, 'You stop aging, and stand right here.'],
  [6.6, 9.0, 'Time speeds up 10x every 3.5 seconds.'],
  [11.4, 13.8, 'A whole day. You haven’t moved.'],
  [16.6, 19.0, 'A month. Your phone died weeks ago.'],
  [20.4, 22.8, 'The sunset swings along the sea, year after year.'],
  [23.9, 26.3, 'New towers rise around you.'],
  [27.4, 29.8, 'Everyone you’ve ever met is gone.'],
  [30.9, 33.3, 'You can’t read the signs anymore.'],
  [34.4, 36.8, 'As long as all of human history.'],
  [37.9, 40.3, 'Betelgeuse explodes: a star you can see by day.'],
  [41.4, 43.8, 'Ice ages come and go. The sea drops 400 ft.'],
  [44.9, 47.3, 'Every ruin has worn away.'],
  [48.4, 50.8, 'An asteroid like the dinosaur killer hits.'],
  [51.9, 54.3, 'The Sun is 10% brighter. The oceans boil away.'],
  [55.3, 57.6, 'The Sun swells to 200 times its size.'],
  [58.5, 59.7, 'It swallows Earth.'],
  [59.9, 61.4, 'The Sun shrinks to a white dwarf.'],
  [61.6, 63.0, 'Every other galaxy drifts out of sight.'],
  [63.3, 65.0, '1 trillion years. You’re still here.'],
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
  return '1 trillion years';
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'TIME PASSED',
    fmt: (m) => fmtSpan(m),
    value: (v) => minutesAt(v),
    unit: (v) => (v < V_1T ? `1 SECOND = ${fmtSpan(rateAt(v), true).toUpperCase()}` : 'YOU MADE IT'),
    badge: (v) => (v < V_1T ? 'FINISH LINE: 1 TRILLION YEARS' : '1 TRILLION YEARS'),
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
  s.impact = v - V_IMPACT;                                     // seconds since the asteroid hit
  // the end of Earth: the Sun's surface sweeps over everything, then you are out in space
  s.space = v >= V_ENGULF + 0.15 ? 1 : 0;
  s.flash = v < V_ENGULF ? smooth(V_ENGULF - 0.35, V_ENGULF, v) : 1 - smooth(V_ENGULF + 0.25, V_ENGULF + 1.2, v);
  s.flashColor = '#fff3e0';
  s.fadeOut = smooth(V_FADE - 0.1, T_SWITCH - 0.05, v);
  s.under = 0;
  s.title = 1 - smooth(3.0, 3.6, v);
  s.you = 1 - smooth(9.0, 9.8, v) + (v > V_ENGULF + 1.4 ? smooth(V_ENGULF + 1.4, V_ENGULF + 2, v) : 0);
  s.endcard = 0; s.endText = 0;
  return s;
}
