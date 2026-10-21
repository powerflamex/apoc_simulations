// "What if space ripped apart?" — the whole story as functions of VIDEO time v (seconds, 30 fps, 16:9).
// You stand on a city promenade at night. Space stretches faster and faster (phantom dark energy) and the stretch
// beats whatever holds things together, biggest first. Times before the end follow Caldwell, Kamionkowski &
// Weinberg (2003), "Phantom Energy and Cosmic Doomsday": the Milky Way goes 60 million years before, the solar
// system ~3 months before, Earth explodes 30 minutes before, atoms 10^-19 s before (their example: the end in
// ~22 billion years). Everything bound comes loose ~0.28 x its orbit time before the end: Saturn ~8 years,
// Jupiter ~3 years, Mars ~6 months, Earth from the Sun ~3 months, the Moon ~1 week, TV satellites ~6.7 h, GPS ~3.4 h.
//
// The video is laid out in sections (SEC) that match the narration (longform/big-rip/SCRIPT.md); the owner's
// recording is cut into lines placed on this clock in src/voice.js (audio.mjs mixes them in). The counter shows the time left, L(v) (story seconds), a smooth
// curve in log space through anchors (it races, and brakes at each step).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FPS = 30;
export const YR = 365.25 * 86400, DAY = 86400, HR = 3600, MIN = 60;

// ---- sections (video time) ----
export const SEC = {
  ff: 0,          // flash-forward: the city splitting (title on screen)
  city: 5,        // the city at night, the Milky Way overhead; "This is the Big Rip"
  lapse: 30,      // "imagine you could stand right here": time speeds up (the street empties into light trails)
  mw: 36,         // the Milky Way comes apart
  mwHush: 58,     // [silence]
  stars: 76,      // the stars slide away, redden, go out
  planets: 106,   // Saturn, Jupiter, Mars
  saturn: 110,
  jupiter: 120.5,
  scope0: 122, scope1: 136,   // the telescope on the promenade: Jupiter shrinking night after night
  gone: 136,      // "then one night you look up, and it isn't there"
  mars: 142,
  sun: 152,       // Earth comes loose from the Sun (day scenes)
  loose: 158,
  month: 182,     // 1 month left: the Sun five times smaller; snow in summer
  week: 206,      // the Sun is a bright star
  moon: 218,      // the Moon recedes (long lens)
  moonHush: 240,  // [silence]: a dot
  sats: 262,      // satellites leave: TV static, GPS lost
  gps: 274,
  split: 290,     // 30 minutes: the air lifts off, cracks, Earth comes apart
  crack: 300,
  splitHush: 312, // [silence] the ground splits
  float: 322,
  you: 340,       // nothing left big enough to break, except you
  hand: 350,
  rip: 386,       // [silence] your atoms: white
  end: 392,       // white fading back to the city as it was; the closing lines
  out: 415,
};
export const VIDEO_DURATION = SEC.out;
export const V_FF = 316.5;          // the flash-forward replays the split from this moment
export const FF_LEN = 5;

// ---- the time left (story seconds) at video time v ----
const ANCH = [
  [SEC.city, 22e9 * YR],
  [SEC.lapse, 1.2e9 * YR],
  [SEC.mw, 60e6 * YR],
  [SEC.mwHush, 18e6 * YR],
  [SEC.stars, 1.5e6 * YR],
  [88.5, 3000 * YR],   // "a few thousand years before the end" (the voice, 85 s)
  [SEC.planets, 14 * YR],
  [SEC.saturn, 8 * YR],
  [SEC.jupiter, 3 * YR],
  [SEC.gone, 1.4 * YR],
  [SEC.mars, 0.5 * YR],
  [SEC.sun, 100 * DAY],
  [SEC.loose, 90 * DAY],
  [SEC.month, 30 * DAY],
  [SEC.week, 7.6 * DAY],
  [SEC.moon, 7.5 * DAY],
  [SEC.moonHush, 2.5 * DAY],
  [SEC.sats, 7.2 * HR],
  [264, 6.7 * HR],
  [SEC.gps, 3.4 * HR],
  [SEC.split, 34 * MIN],
  [SEC.crack, 30 * MIN],
  [SEC.you, 29 * MIN + 16],
  [SEC.hand, 25 * MIN],
  [355.5, 1],            // under a second as the voice says "in the last fraction of a second" (357 s)
  [SEC.rip, 1e-19],
];
// monotone cubic (Fritsch-Carlson) through [x, y] points: smooth, never overshoots
function monotone(P) {
  const n = P.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / (P[i + 1][0] - P[i][0]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= P[0][0]) return P[0][1] + m[0] * (x - P[0][0]);
    if (x >= P[n - 1][0]) return P[n - 1][1] + m[n - 1] * (x - P[n - 1][0]);
    let i = 0;
    while (x > P[i + 1][0]) i++;
    const h = P[i + 1][0] - P[i][0], t = (x - P[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * P[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * P[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}
const logL = monotone(ANCH.map(([v, L]) => [v, Math.log10(L)]));
// the split runs in (almost) real time: between the crack and "you" the counter ticks down second by second
export function left(v) {
  if (v >= SEC.crack && v <= SEC.you) return lerp(30 * MIN, 29 * MIN + 16, (v - SEC.crack) / (SEC.you - SEC.crack));
  if (v >= SEC.rip) return 0;
  return Math.pow(10, logL(v));
}
// story seconds per video second (how fast time is racing)
export const rate = (v) => Math.max(1e-30, (left(v - 0.02) - left(v + 0.02)) / 0.04);

// ---- the big moments: a word pops up at each one ----
export const BEATS = [
  { v: SEC.mw + 0.5, w: 'The Milky Way', k: '60 MILLION YEARS LEFT' },
  { v: SEC.stars + 1, w: 'The stars', k: 'A MILLION YEARS LEFT' },
  { v: SEC.saturn, w: 'Saturn', k: '8 YEARS LEFT' },
  { v: SEC.jupiter, w: 'Jupiter', k: '3 YEARS LEFT' },
  { v: SEC.mars, w: 'Mars', k: '6 MONTHS LEFT' },
  { v: SEC.sun + 1.6, w: 'The Sun', k: '3 MONTHS LEFT' },
  { v: SEC.moon + 2, w: 'The Moon', k: '1 WEEK LEFT' },
  { v: 263.5, w: 'Satellites', k: '6 HOURS LEFT' },
  { v: SEC.crack, w: 'Earth', k: '30 MINUTES LEFT' },
  { v: SEC.you + 6, w: 'You', k: 'A FRACTION OF A SECOND' },
];
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}
// what goes next (the finish line under the counter)
const NEXT = [
  [0, 'THE MILKY WAY'], [SEC.mw + 6, 'THE STARS'], [SEC.stars + 6, 'THE PLANETS'], [SEC.saturn + 4, 'JUPITER'],
  [SEC.jupiter + 4, 'MARS'], [SEC.mars + 4, 'THE SUN'], [SEC.loose + 4, 'THE MOON'], [SEC.moon + 8, 'SATELLITES'],
  [272, 'EARTH'], [SEC.crack + 4, 'YOU'], [SEC.you + 10, 'YOUR ATOMS'],
];
export const nextAt = (v) => { let n = ''; for (const [t, s] of NEXT) if (v >= t) n = s; return n; };

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
const pad = (x) => String(Math.floor(x)).padStart(2, '0');
export function fmtLeft(L) {
  if (L <= 0) return '0 s';
  if (L >= 2 * YR) return `${fmtInt(L / YR)} years`;
  if (L >= 2 * DAY) return `${fmtInt(L / DAY)} days`;
  if (L >= HR) return `${Math.floor(L / HR)}:${pad((L % HR) / MIN)}:${pad(L % MIN)}`;
  if (L >= 1) return `${pad(L / MIN)}:${pad(L % MIN)}`;
  // under a second: as many decimals as it takes (to 10^-19)
  const e = Math.max(1, Math.ceil(-Math.log10(L)) + 1);
  return `${L.toFixed(Math.min(e, 20))} s`;
}
export const COUNTERS = [
  { from: -10, to: SEC.rip + 0.6, label: 'THE BIG RIP IN', fmt: fmtLeft, value: (v) => left(v), unit: (v) => { const n = nextAt(v); return n ? `NEXT: ${n}` : ''; } },
];

// Earth's distance from the Sun (log10 AU) by days left: loose at ~90 days, the gap growing faster and faster
// (5 AU with a month left: the Sun 5x smaller; ~30 AU with a week left: a bright star)
const AU_LOG = monotone([[-1, 3.4], [1, 2.6], [7.6, 1.5], [30, 0.7], [60, 0.12], [90, 0], [1e9, 0]]);

// ---- how the scene looks (pure function of v) ----
export const S = (a, b, v) => smooth(a, b, v);
export function state(v) {
  const s = { v, L: left(v), rate: rate(v) };
  // the street empties into a long exposure while time races (people back for the planets)
  s.lapse = smooth(SEC.lapse, SEC.mw, v) * (1 - smooth(SEC.planets - 2, SEC.planets + 2, v));
  // the Milky Way: intact, then tearing (0..1), and the stars fading
  s.rip = smooth(SEC.mw, SEC.stars + 4, v);
  s.stars = 1 - smooth(SEC.stars + 2, 94, v);              // the background stars wink out
  s.red = smooth(SEC.stars - 4, 93, v);                    // redder and dimmer as they recede
  s.mw = 1 - smooth(SEC.mwHush + 6, SEC.stars + 14, v);     // the band itself fades out
  // planets (brightness 1 = as now)
  s.saturn = 1 - smooth(SEC.saturn, SEC.saturn + 5, v);
  s.jupiter = 1 - smooth(SEC.jupiter, SEC.gone, v);
  s.jupR = 1 / (1 + 4 * Math.pow(smooth(SEC.jupiter, SEC.gone - 1, v), 1.6));   // its disk in the telescope shrinks
  s.mars = 1 - smooth(SEC.mars, SEC.mars + 7, v);
  s.scope = smooth(SEC.scope0, SEC.scope0 + 0.6, v) * (1 - smooth(SEC.scope1 - 0.6, SEC.scope1, v));
  // the Sun: distance in AU once Earth comes loose; the stage is day (frames at 9 am)
  const Ld = s.L / DAY;
  s.au = Math.pow(10, AU_LOG(Math.max(Ld, 0)));
  s.day = smooth(SEC.sun - 2, SEC.sun + 1, v) * (1 - smooth(SEC.moon - 3, SEC.moon, v));
  s.snow = smooth(SEC.month - 2, SEC.month + 6, v) * (1 - smooth(SEC.moon - 3, SEC.moon, v));
  s.snowGround = smooth(SEC.month + 2, SEC.week, v) * (1 - smooth(SEC.split, SEC.crack + 4, v));   // stays until the ground warms
  s.coats = smooth(SEC.month - 6, SEC.month, v);
  // the Moon: distance in Earth-Moon units after it comes loose (~7.6 days left)
  s.moonD = Ld >= 7.6 ? 1 : Math.pow(10, 2.6 * Math.pow(clamp((7.6 - Ld) / 6.5), 0.75));
  s.moon = 1 - smooth(SEC.moonHush + 4, SEC.moonHush + 9, v);   // a dot, then gone
  // satellites: TV, then GPS
  s.tv = smooth(270.3, 271.3, v);                         // "Satellite TV goes dark" (the voice, 270 s)
  s.gps = smooth(SEC.gps, SEC.gps + 3, v);
  s.phones = smooth(SEC.sats + 4, SEC.gps, v) * (1 - smooth(SEC.split + 4, SEC.split + 8, v));
  // the split
  s.air = smooth(SEC.split + 2, SEC.crack + 6, v);          // the air lifts off the streets
  s.crack = smooth(SEC.crack, SEC.splitHush, v);             // glowing cracks spread
  s.split = Math.max(0, v - SEC.splitHush);                 // seconds since the ground split
  s.lift = smooth(SEC.splitHush - 4, SEC.float + 6, v);     // things float
  s.grid = 1 - smooth(SEC.splitHush, SEC.splitHush + 3, v);  // city lights
  // you
  s.hand = smooth(SEC.hand - 0.5, SEC.hand + 0.5, v);
  s.stretch = smooth(SEC.hand + 8, SEC.rip, v);
  // white at the end, then back to the city as it was
  s.flash = smooth(SEC.rip - 0.3, SEC.rip + 0.4, v) * (1 - smooth(SEC.end + 1, SEC.end + 6, v));
  s.after = v >= SEC.end + 1 ? 1 : 0;                       // the closing shot: the city before all this
  s.fadeOut = smooth(SEC.out - 2.5, SEC.out, v);
  s.title = 1 - smooth(5.0, 5.5, v);
  s.name = smooth(5.5, 5.9, v) * (1 - smooth(10.5, 11.3, v));   // THE BIG RIP, as the voice says it (5.7 s)
  return s;
}
