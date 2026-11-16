// "What if you lived for 1 trillion seconds?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// You stand on one busy street corner (the south-west corner of an avenue and a cross street, 41° N) and never move.
// Time races around you: the counter is the SECONDS since you started standing there, from ~2,500 on frame 0 to the
// finish line, 1,000,000,000,000 (= 31,700 years). It climbs 10x every few seconds, a little slower each step:
//   1e6 s at 3.0 s, 1e7 at 5.6, 1e8 at 8.4, 1e9 at 12.0, 1e10 at 19.0, 1e11 at 27.0, 1e12 at 42.0 (it eases in).
// Real numbers (Julian year = 31,557,600 s):
//   1 million s = 11.6 days; 10 million = 116 days (4 months); 100 million = 3.17 years; 1 billion = 31.7 years;
//   10 billion = 317 years; 100 billion = 3,169 years; 1 trillion = 31,688 years (~31,700).
//   Buildings: most city buildings stand 50-100 years, so in 317 years every one around you has been replaced.
//   Ice ages: none is due. Without people the next glacial inception was ~50,000 years off (low orbital eccentricity;
//   Ganopolski, Winkelmann & Schellnhuber, Nature 2016); our ~500 billion tonnes of carbon push it later still.
//   Cave paintings: Chauvet Cave's art is ~37,000-28,000 years old (two phases, Quiles et al. 2016), so 31,700 years
//   ago people were painting caves.
// The time-lapse is filmed like a real one: every frame at 1:30 PM, so the light never strobes day/night. While a frame
// spans less than a few weeks the seasons flash past (autumn on frame 0, snow by 0:06); once a frame spans months,
// every frame is taken on the same summer day (the seasons would only flicker). People and cars are long-exposure
// ghosts: each frame catches different ones, smeared along their way.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const YEAR = 31557600;
export const DAY = 86400;

// ---- the clock: log10(seconds) at video time v (monotone cubic through the decades, easing into 1e12) ----
const KEYS = [[0, 3.4], [3.0, 6], [5.6, 7], [8.4, 8], [12.0, 9], [19.0, 10], [27.0, 11], [42.0, 12]];
const SLOPES = (() => {
  const n = KEYS.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((KEYS[i + 1][1] - KEYS[i][1]) / (KEYS[i + 1][0] - KEYS[i][0]));
  m[0] = d[0];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  m[n - 1] = 0;                                   // it settles onto the finish line
  for (let i = 0; i < n - 1; i++) {
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
})();
export const V_END = 42.0;
export function logS(v) {
  if (v <= 0) return KEYS[0][1] + SLOPES[0] * v;
  if (v >= V_END) return 12;
  let i = 0;
  while (v > KEYS[i + 1][0]) i++;
  const [x0, y0] = KEYS[i], [x1, y1] = KEYS[i + 1], h = x1 - x0, t = (v - x0) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * SLOPES[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * SLOPES[i + 1];
}
export const secondsAt = (v) => Math.pow(10, logS(v));
export const yearsAt = (v) => secondsAt(v) / YEAR;
export const logRate = (v) => (v >= V_END ? 0 : (logS(v + 0.005) - logS(v - 0.005)) / 0.01);
export const rateAt = (v) => secondsAt(v) * Math.LN10 * logRate(v);        // story seconds per video second
// video time at which y years have passed (bisection; the clock only goes up)
export function vOfYears(y) {
  const target = Math.log10(y * YEAR);
  let a = -3, b = V_END;
  if (target >= 12) return V_END;
  for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (logS(m) < target) a = m; else b = m; }
  return (a + b) / 2;
}
const lsm = (a, b, y) => smooth(Math.log10(a), Math.log10(b), Math.log10(Math.max(y, 1e-9)));

// ---- the big moments ----
export const V_FLASH = 45.0;                     // the white flash builds
export const T_SWITCH = 47.4;                    // full white: the loop point
export const LOOP = 0.9;                         // the white clears onto the first frame
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
// the decade beats: a camera kick and a deep whoomp on each
export const BEATS = [3.0, 5.6, 8.4, 12.0, 19.0, 27.0, 42.0];
// the last 24 s, a new thing every 4-5 s:
export const V_CRACK = 23.2;                     // the last tower near you cracks and leans
export const V_FALL = 24.1;                      // it goes over, toward you
export const V_IMPACT = 25.45;                   // it smashes into the trees in front of you (dust, a shake)
export const V_RIVER = [27.2, 29.9];             // the stream buried under the avenue comes back and cuts a valley
export const V_ANIMALS = 31.3;                   // wolves, black bears and elk move in
export const V_BURY = [34.3, 37.2];              // river mud buries the last stone of the city
export const V_MEANDER = [36.5, 41.6];           // the river swings across its valley
export const V_REAL = 42.0;                      // the finish line: time runs at normal speed again

// ---- seasons: day of the year (0 = Jan 1); frame 0 is October 10 ----
const DOY0 = 283, LOCK_DOY = 175;               // the locked day: late June
const wrap = (d) => ((d % 365.25) + 365.25) % 365.25;
// periodic bump: 1 between a and b (days of year, may wrap), ramps of w days
function window(d, a, b, w) {
  const x = wrap(d - a), L = wrap(b - a);
  return smooth(0, w, x) * (1 - smooth(L - w, L, x));
}
function seasonOf(d) {
  // leaves: full May-mid Oct, falling late Oct-Nov, bare Dec-mid Apr, budding late Apr
  const leaf = window(d, 105, 330, 25);
  // autumn colour: turning from late September, gone with the leaves
  const autumn = window(d, 262, 345, 22);
  // snow on the ground: mid December to early March
  const snow = window(d, 339, 74, 12);
  const decl = -23.44 * Math.cos(2 * Math.PI * (d + 10) / 365.25);
  return { leaf, autumn, snow, decl };
}
export function seasonAt(v) {
  const S = secondsAt(v);
  const d = DOY0 + S / DAY;
  const Edays = rateAt(v) / 60 / DAY;           // days between two frames
  // (once locked it stays locked: the clock slows into the finish line, but the shot stays on the summer day)
  const lock = v > 14 ? 1 : smooth(Math.log10(9), Math.log10(45), Math.log10(Math.max(Edays, 1e-6)));
  const a = seasonOf(d), b = seasonOf(LOCK_DOY);
  return { leaf: lerp(a.leaf, b.leaf, lock), autumn: lerp(a.autumn, b.autumn, lock), snow: lerp(a.snow, b.snow, lock), decl: lerp(a.decl, b.decl, lock), lock, Edays };
}
// the Sun at 1:30 PM (latitude 41° N); x east, y up, z south
export function sunAt(declDeg) {
  const DEG = Math.PI / 180;
  const phi = 41 * DEG, dec = declDeg * DEG, H = 1.5 * 15 * DEG;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { el, az, x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
}

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.05, 5.3, '1 million seconds = 12 days.'],
  [5.65, 8.1, '10 million seconds = 4 months. A whole winter.'],
  [8.45, 11.6, '100 million seconds = 3 years. New towers rise.'],
  [12.05, 15.2, '1 billion seconds = 32 years. You’re old.'],
  [15.6, 18.7, 'Every building you know is torn down and rebuilt.'],
  [19.05, 22.3, '10 billion seconds = 317 years. A whole new city.'],
  [22.4, 24.6, 'Then the people leave. Nature moves in.'],
  [25.7, 27.0, 'The last tower falls.'],
  [27.15, 30.9, '100 billion seconds = 3,170 years. The stream buried under your street comes back.'],
  [31.5, 34.1, 'Wolves, bears and elk move back in.'],
  [34.4, 36.9, 'River mud buries the last stone of your city.'],
  [37.15, 39.5, 'No ice age yet: the next is 50,000+ years away.'],
  [39.75, 41.85, '1 trillion seconds ago, people were painting caves.'],
  [42.05, 45.0, 'All of written history is about 5,000 years. You just lived 6 times that.'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.25), fadeOut = clamp((b - v) / 0.25);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: SECONDS racing up; one line under it: the finish line ----
export const FINISH_LINE = '1,000,000,000,000 SECONDS = 31,700 YEARS';
export function counterAt(v) {
  const S = Math.max(0, Math.floor(secondsAt(v) + 1e-6));
  return { label: 'SECONDS', value: S.toLocaleString('en-US'), line: FINISH_LINE };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.S = secondsAt(v);
  s.Y = s.S / YEAR;
  s.rate = rateAt(v);
  s.season = seasonAt(v);
  s.sun = sunAt(s.season.decl);
  const Y = s.Y;
  // you: greying from ~3 years in, white-haired and stooped by 32; a cane from ~25
  s.age = smooth(3, 30, Y);
  s.cane = Y > 24 ? 1 : 0;
  // the eras
  s.eraB = lsm(60, 260, Y);                  // the share of the city already rebuilt (cars and signs too)
  s.people = 1 - lsm(330, 720, Y);           // people (and cars) on the street
  s.dark = lsm(340, 900, Y);                 // windows dark, glass broken
  s.vine = lsm(420, 3000, Y);                // vines up the walls
  s.wild = lsm(360, 1800, Y);                // weeds and grass through the cracks
  s.soil = lsm(1800, 9000, Y);               // the forest floor covers everything
  s.furn = lsm(500, 1600, Y);                // street furniture leaning and falling
  // the last 24 s
  s.river = smooth(V_RIVER[0], V_RIVER[1], v);
  s.meander = smooth(V_MEANDER[0], V_MEANDER[1], v);
  s.bury = smooth(V_BURY[0], V_BURY[1], v);
  s.animals = smooth(V_ANIMALS - 0.3, V_ANIMALS + 0.6, v);
  s.real = v >= V_REAL ? 1 : 0;                // after the finish line: no more time-lapse ghosts, real animals walking
  s.ghostFade = 1 - smooth(41.2, 41.95, v);    // (the time-lapse thins out as the clock slows into the finish)
  // the end
  s.flash = smooth(V_FLASH, T_SWITCH - 0.05, v);
  s.title = 1 - smooth(2.5, 2.95, v);
  return s;
}
export { lerp };
