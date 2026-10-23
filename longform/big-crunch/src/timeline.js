// "What if the universe started shrinking?" (the Big Crunch) — the whole story as functions of VIDEO time v
// (seconds, 30 fps, 16:9). You stand at the railing of the seaside promenade (the Big Crunch Short's), looking west
// over the bay. The universe keeps growing for ~11 billion years, stops, and falls back in; the end comes ~20 billion
// years from now (Luu, Qiu & Tye 2025, "The Lifespan of our Universe"). On the way Andromeda crashes into the Milky
// Way. After the turnaround far galaxies turn from red to blue, come back and crash together. The end of a crunch is
// the Big Bang played backwards (Rees 1969): the leftover light of the Big Bang is squeezed hotter and hotter, so the
// sky's temperature at each moment is the universe's temperature when it was that young (skyK below): the night
// passes 0 °C ~16 million years before the end, boils the oceans at ~10 million, glows red at ~3 million, melts rock
// at ~1 million, tears atoms apart (a fog you can't see through) at ~400,000, is hotter than the Sun's surface at
// ~100,000 years (the stars boil away), smashes atoms' cores in the last ~3 minutes and melts protons into quarks in
// the last ~10 microseconds. Earth is "imagined" to still be here (the Sun dies long before).
//
// The video is laid out in sections (SEC) that match the narration (SCRIPT.md); the owner's recording is cut into
// lines placed on this clock in src/voice.js (audio.mjs mixes them in). The counter shows the time left, L(v) (story
// seconds), a smooth curve in log space through anchors (it races, and brakes at each step).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FPS = 30;
export const YR = 365.25 * 86400, DAY = 86400, HR = 3600, MIN = 60;

// ---- sections (video time) ----
export const SEC = {
  ff: 0,          // flash-forward: the city melting under the glowing sky (title on screen)
  demo: 6,        // the whole universe from outside (src/demo.js): it grows ("This is the Big Crunch")
  dStop: 14.8,   // it stops ("in eleven billion years, it stops")
  dFall: 15.8,   // it falls back in, faster and faster
  dCrunch: 21.0, // one blazing point (as he finishes "one single point"); [silence] black, one point of light
  dBang: 24.6,   // a new Big Bang on "explodes" (its stressed "-plodes"): a new universe bursts out
  walk: 30.8,    // (through a white flash) the promenade at dusk, people out; the countdown starts
  prom: 5,        // (the promenade's own clock starts here: its first 22 s are seen only in the closing shot)
  lapse: 56,      // "imagine you could stand right here": time races, the people blur away, night for good
  andro: 60,      // Andromeda grows night after night
  aNight0: 69, aNight1: 77.5,   // a night with people out under it ("then it fills half the sky")
  crash: 77,      // it crashes through the Milky Way
  aHush: 90.7,    // [silence]
  ball: 94.5,     // "the two galaxies just melt into one giant ball of stars"
  turn: 100.5,     // nine billion years left: the universe stops growing
  scope0: 105.5, scope1: 128.5,  // the telescope: a far galaxy's light, red -> white -> blue
  white: 119.1, blue: 122.3,
  back: 135,      // a billion years left: the galaxies come back
  crash2: 145.1,  // a hundred million: they crash together
  hush2: 150.5,   // [silence]
  warm: 159,      // the night gets warm
  freeze: 163.3,  // "space has always been freezing, -270"
  squeeze: 175.9, // "that old heat gets squeezed back together"
  ice: 182.7,     // sixteen million: warmer than ice
  summer: 188.5,  // fifteen million: a summer evening (people out, no jackets)
  wNight1: 198,
  hot: 200.1,     // ten million: hotter than boiling water
  boil: 205.9,    // the oceans boil away
  glow: 214,      // three million: the sky glows
  melt: 231,      // one million: the ground glows, melts
  rise: 244,      // you rise and float over the lava
  fog: 251,       // 400,000: atoms torn apart, a fog of fire
  stars: 276,     // 100,000: hotter than the Sun's surface
  look: 284,      // "look for the Sun"
  sunGone: 286.4, // "it's gone"
  earthGo: 300.6, // "Earth goes the same way" [silence]
  space: 304,     // (cut, inside the even glow, to you adrift)
  last3: 307,     // three minutes left: atoms' cores smashed
  quark: 331,     // 1/100,000 s: protons melt
  squash: 339,    // all of space squeezes into one point and drags you in
  crunch: 349,    // [silence] black, one point of light
  bang: 350.6,    // a new Big Bang
  whiteout: 355,
  end: 357,       // white clearing onto the promenade at dusk, as at the start; the closing lines
  out: 393,
};
export const VIDEO_DURATION = SEC.out;
export const V_FF = 242.5;          // the flash-forward replays the city melting from this moment
export const FF_LEN = 6;
// (the space scene's names from the Short)
export const V_ENGULF = SEC.space, V_CRUNCH = SEC.crunch;

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

// ---- the time left (story seconds) at video time v ----
const ANCH = [
  [SEC.walk, 20.0e9 * YR],
  [SEC.lapse, 18.3e9 * YR],
  [SEC.andro, 17.6e9 * YR],
  [SEC.aNight0, 16.6e9 * YR],
  [SEC.aNight1, 15.6e9 * YR],
  [83, 15.0e9 * YR],          // the crash ("in the next few billion years")
  [SEC.ball, 13e9 * YR],
  [SEC.turn, 9.0e9 * YR],
  [SEC.scope0, 8.4e9 * YR],
  [SEC.scope1, 2.6e9 * YR],
  [SEC.back, 1.0e9 * YR],
  [SEC.crash2, 1.0e8 * YR],
  [SEC.warm, 4.0e7 * YR],
  [SEC.squeeze, 2.6e7 * YR],  // (held while the voice explains the cold, then on through 0 °C)
  [SEC.ice, 1.6e7 * YR],
  [SEC.summer, 1.5e7 * YR],
  [SEC.wNight1, 1.42e7 * YR], // (the warm night: barely moving)
  [SEC.hot, 1.0e7 * YR],
  [SEC.boil, 7.0e6 * YR],
  [SEC.glow, 3.0e6 * YR],
  [SEC.melt, 1.0e6 * YR],
  [SEC.fog, 4.0e5 * YR],
  [SEC.stars, 1.0e5 * YR],
  [SEC.earthGo, 3.0e4 * YR],
  [SEC.last3, 180],           // 3:00
  [SEC.quark, 1e-5],
  [SEC.crunch - 0.3, 1e-20],
];
const logL = monotone(ANCH.map(([v, L]) => [v, Math.log10(L)]));
export function left(v) {
  if (v >= SEC.crunch) return 0;
  return Math.pow(10, logL(Math.max(v, SEC.walk)));
}
// story seconds per video second (how fast time is racing)
export const rate = (v) => Math.max(1e-30, (left(v - 0.02) - left(v + 0.02)) / 0.04);

// ---- the sky's temperature (K) with L story seconds left: the age of the universe when it was that hot ----
// t(a) = 17.24 Gyr x [(a - 2 a_eq) sqrt(a + a_eq) + 2 a_eq^1.5] (matter + radiation, H0 = 67.7, Om = 0.31), T = 2.725 / a
const AEQ = 1 / 3400, TPRE = 17.24e9 * YR;
// (deep in the radiation era the two terms cancel: there it is 3a^2 / (4 sqrt(a_eq)))
const tOfA = (a) => TPRE * (a < 1e-3 * AEQ ? 0.75 * a * a / Math.sqrt(AEQ) : (a - 2 * AEQ) * Math.sqrt(a + AEQ) + 2 * Math.pow(AEQ, 1.5));
export function skyPhysK(L) {
  if (L <= 0) return 1e32;
  let lo = -40, hi = 0;                       // log10 a
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (tOfA(Math.pow(10, mid)) > L) hi = mid; else lo = mid; }
  return 2.725 / Math.pow(10, (lo + hi) / 2);
}
// what the SKY row shows: today's -270 °C while the voice explains it, then squeezed hotter (log blend into the physics)
export function skyK(v) {
  const k = smooth(SEC.squeeze, SEC.ice - 0.6, v);
  if (k <= 0) return 2.725;
  const P = skyPhysK(left(v));
  return Math.exp(lerp(Math.log(2.725), Math.log(P), k));
}

// ---- the opening demonstration: the size of the whole universe (1 = today) ----
export function scaleAt(v) {
  if (v < SEC.dStop) { const u = clamp((v - SEC.demo) / (SEC.dStop - SEC.demo)); return 1 + 0.55 * (1 - (1 - u) * (1 - u)); }
  if (v < SEC.dFall) return 1.55;
  if (v < SEC.dCrunch) { const u = (v - SEC.dFall) / (SEC.dCrunch - SEC.dFall); return 1.55 * (1 - Math.pow(u, 2.2)); }
  if (v < SEC.dBang) return 0;
  return 1.8 * (1 - Math.exp(-0.55 * (v - SEC.dBang)));
}
// how fast it grows (+) or shrinks (-), per second
export const scaleRate = (v) => (scaleAt(v + 0.02) - scaleAt(v - 0.02)) / 0.04;

// ---- the big moments: a word pops up at each one ----
export const BEATS = [
  { v: SEC.dStop, w: 'It stops', k: '11 BILLION YEARS FROM NOW' },
  { v: SEC.dCrunch, w: 'The Big Crunch', k: '20 BILLION YEARS FROM NOW', quiet: true },
  { v: SEC.dBang + 0.15, w: 'A new Big Bang?', k: 'AND IT ALL STARTS AGAIN', quiet: true },
  { v: 83, w: 'Andromeda', k: '15 BILLION YEARS LEFT' },
  { v: SEC.turn, w: 'Falling back', k: '9 BILLION YEARS LEFT' },
  { v: SEC.back, w: 'The galaxies', k: '1 BILLION YEARS LEFT' },
  { v: SEC.crash2, w: 'They crash', k: '100 MILLION YEARS LEFT' },
  { v: SEC.summer, w: 'Warm nights', k: '15 MILLION YEARS LEFT' },
  { v: SEC.boil, w: 'The oceans', k: '10 MILLION YEARS LEFT' },
  { v: SEC.glow + 2.8, w: 'The sky glows', k: '3 MILLION YEARS LEFT' },
  { v: SEC.melt + 5.4, w: 'The ground', k: '1 MILLION YEARS LEFT' },
  { v: SEC.fog + 3.1, w: 'Atoms', k: '400,000 YEARS LEFT' },
  { v: SEC.sunGone, w: 'The Sun', k: '100,000 YEARS LEFT' },
  { v: SEC.last3, w: 'The last 3 minutes', k: 'A BILLION DEGREES' },
  { v: SEC.quark, w: 'Everything', k: 'A 100,000TH OF A SECOND LEFT' },
  { v: SEC.crunch + 0.15, w: 'The Big Crunch', k: '0 SECONDS' },
  { v: SEC.bang + 0.15, w: 'The Big Bang', k: 'AND THEN' },
];
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}
// what comes next (the finish line under the counter)
const NEXT = [
  [0, 'ANDROMEDA'], [85, 'THE UNIVERSE STOPS GROWING'], [SEC.turn + 4, 'THE GALAXIES COME BACK'], [SEC.back + 4, 'THEY CRASH'],
  [SEC.crash2 + 4, 'THE NIGHT GETS WARM'], [SEC.summer + 4, 'THE OCEANS BOIL'], [SEC.boil + 4, 'THE SKY GLOWS'],
  [SEC.glow + 7, 'THE GROUND MELTS'], [SEC.melt + 9, 'ATOMS'], [SEC.fog + 7, 'THE STARS'], [SEC.sunGone + 6, 'THE LAST 3 MINUTES'],
  [SEC.last3 + 4, 'EVERYTHING'], [SEC.squash, ''],
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
  // under a second: as many decimals as it takes
  const e = Math.max(1, Math.ceil(-Math.log10(L)) + 1);
  return `${L.toFixed(Math.min(e, 20))} s`;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function fmtTemp(K) {
  const c = K - 273.15;
  if (Math.abs(c) < 1000) return `${Math.round(c)} °C`;
  if (c < 1e13) return `${fmtInt(c)} °C`;
  // past ten trillion: a power of ten
  let n = Math.floor(Math.log10(c)), m = c / Math.pow(10, n);
  if (m >= 9.95) { m /= 10; n++; }   // (never "10.0 x 10^n")
  return `${m.toFixed(1)} × 10${String(n).split('').map((d) => SUP[+d]).join('')} °C`;
}
// (the opening demonstration: how far ahead it is, then the new universe's age)
const demoYears = monotone([[SEC.demo, 0], [SEC.dStop, 11e9], [SEC.dFall, 11.4e9], [SEC.dCrunch, 20e9]]);
export const COUNTERS = [
  { from: -10, to: SEC.crunch + 0.4, gap: [SEC.demo, SEC.walk], label: 'THE BIG CRUNCH IN', fmt: fmtLeft, value: (v) => left(v), unit: (v) => { const n = nextAt(v); return n ? `NEXT: ${n}` : ''; } },
  { from: SEC.demo, to: SEC.walk, label: (v) => (v < SEC.dBang ? 'YEARS FROM NOW' : 'A NEW UNIVERSE'), fmt: (x) => x,
    value: (v) => (v < SEC.dBang ? `${fmtInt(Math.min(20e9, demoYears(Math.min(v, SEC.dCrunch))))} years`
      : `${fmtInt(Math.pow(10, 2 + 7.5 * clamp((v - SEC.dBang) / 7)))} years old`),
    unit: (v) => (v < SEC.dStop ? 'NEXT: IT STOPS GROWING' : v < SEC.dCrunch ? 'NEXT: THE BIG CRUNCH' : '') },
];
export const SKYROW = { from: SEC.freeze - 0.6, to: SEC.crunch + 0.4, label: 'THE NIGHT SKY', value: (v) => fmtTemp(skyK(v)) };

// ---- the clock on the promenade ----
// T: story minutes since the first frame (people, cars, the light); TOD0: the first frame is 23 minutes before an
// equinox sunset (18:10). After the lapse every frame is taken at the same time of night (21:40); the nights with
// people out run in real time. From the melt on, every frame is taken an hour before sunset (the Sun low over the bay).
export const TOD0 = 17 * 60 + 47;
const NIGHT = 21 * 60 + 40 - TOD0;            // minutes after the first frame
const DAYLOCK = 17 * 60 + 10 - TOD0;
const nightsAt = (v) => Math.floor(clamp((v - SEC.andro) / (SEC.space - SEC.andro)) * 90000);   // a new night each frame
export function clockT(v) {
  if (v < SEC.lapse) return (v - SEC.prom) / 60;
  if (v < SEC.andro) {   // the hours race by: sunset, twilight, night
    const k = smooth(SEC.lapse, SEC.andro - 0.3, v);
    return lerp((SEC.lapse - SEC.prom) / 60, NIGHT, k);
  }
  const real = (v0) => NIGHT + 1440 * (nightsAt(v0) % 5000) + (v - v0) / 60;
  if (v >= SEC.aNight0 && v < SEC.aNight1) return real(SEC.aNight0);
  if (v >= SEC.summer - 1.5 && v < SEC.wNight1) return real(SEC.summer - 1.5);
  if (v >= SEC.melt) return DAYLOCK + 1440 * (nightsAt(v) % 5000);
  return NIGHT + 1440 * (nightsAt(v) % 5000);
}
// exposure: story minutes smeared into one frame (real time 1/60 s; the races span ages)
export function exposure(v) {
  const real = 1 / 3600;
  let race = smooth(SEC.lapse - 0.5, SEC.lapse + 2, v);
  race *= 1 - smooth(SEC.aNight0 - 1.2, SEC.aNight0 + 0.4, v) * (1 - smooth(SEC.aNight1 - 0.6, SEC.aNight1 + 1, v));
  race *= 1 - smooth(SEC.summer - 2.5, SEC.summer - 1, v) * (1 - smooth(SEC.wNight1 - 0.8, SEC.wNight1 + 0.8, v));
  return Math.exp(lerp(Math.log(real), Math.log(1e6), race));
}

// the Sun's direction (north +x, up +y, east +z) at 35° N on an equinox, tod minutes after the first frame
const LAT = 35 * Math.PI / 180;
export function sunDir(T, out = [0, 0, 0]) {
  const tod = ((TOD0 + T) % 1440 + 1440) % 1440;
  const H = (tod - 12 * 60) * 2 * Math.PI / 1440 - 0.02;   // hour angle (sunset at ~18:10)
  const d = -0.06;                                        // early March
  const sl = Math.sin(LAT), cl = Math.cos(LAT), sd = Math.sin(d), cd = Math.cos(d);
  out[0] = sd * cl - cd * Math.cos(H) * sl;
  out[1] = sd * sl + cd * Math.cos(H) * cl;
  out[2] = -cd * Math.sin(H);
  return out;
}

// ---- how the scene looks (pure function of v) ----
export function state(v) {
  const s = { v, L: left(v), rate: rate(v) };
  s.Ly = s.L / YR;
  s.K = skyK(v);
  s.T = clockT(v);
  s.E = exposure(v);
  s.sunD = sunDir(s.T);
  s.sun = { doy: 70 };
  s.Y = 0.3;                                              // the city as it is tonight (it is not rebuilt)
  // people: out in the real-time stretches; they thin away as time races
  const fast = smooth(Math.log10(1 / 3600), Math.log10(30), Math.log10(s.E));
  s.crowd = 1 - fast;
  // the city: lit at night until the oceans boil; it sags and glows as the ground melts; lost in the fog of fire
  s.lights = 1 - smooth(SEC.boil - 2, SEC.boil + 4, v);
  s.traffic = 1 - smooth(SEC.boil - 2, SEC.boil + 3, v);
  s.cityMelt = smooth(SEC.melt + 6, SEC.rise + 6, v);
  s.city = 1 - smooth(SEC.fog + 4, SEC.fog + 14, v);
  // the land: trees wither in the heat, the sea boils and drains (salt left on the sea floor), then lava
  s.land = 0;
  s.green = 1 - smooth(SEC.hot, SEC.glow, v);
  s.ice = 0;
  s.steam = smooth(SEC.hot + 1, SEC.boil, v) * (1 - smooth(SEC.boil + 6, SEC.glow + 2, v));
  s.boil = smooth(SEC.boil - 1, SEC.glow, v);
  s.sea = -3000 * Math.pow(s.boil, 4);
  s.salt = smooth(SEC.boil + 4, SEC.glow + 4, v);
  s.lava = smooth(SEC.melt + 3, SEC.rise, v);
  // the sky: night stars and the Milky Way; Andromeda (angular radius, rad) swelling, crashing through, one ball
  s.andR = Math.exp(lerp(Math.log(0.022), Math.log(0.9), Math.pow(smooth(SEC.andro + 1, SEC.crash + 3, v), 0.75)));
  s.collide = smooth(SEC.crash, SEC.ball + 2, v);
  s.ball = smooth(SEC.aHush - 1, SEC.ball + 4, v);
  // after the turnaround: the far galaxies come back (bluer, bigger, more), then crash together: starlight everywhere
  s.back = smooth(SEC.back - 1, SEC.crash2, v);
  s.merge = smooth(SEC.crash2 - 1, SEC.hush2 + 2, v);
  // the heat: the sky's own glow (visible from ~800 K); everything beyond ~the city vanishes into it from ~3,000 K
  s.glowI = smooth(Math.log(750), Math.log(1400), Math.log(s.K));
  s.fog = smooth(Math.log(2600), Math.log(3600), Math.log(s.K));
  // the Sun: a white disk until the sky is as hot as its surface; it frays and boils away
  s.sunC = 1 - smooth(SEC.look, SEC.sunGone + 3, v);
  s.sunFuzz = smooth(SEC.look - 1, SEC.sunGone + 2, v);
  // Earth boils away below you: everything goes to the glow
  s.earthGone = smooth(SEC.earthGo - 0.5, SEC.space - 0.6, v);
  // you rise off the melting promenade and float over the lava
  s.rise = smooth(SEC.rise, SEC.fog + 8, v);
  // the telescope insert: a far galaxy's light; -1 red (flying away), 0 white, +1 blue (coming back)
  s.scope = smooth(SEC.scope0 - 0.4, SEC.scope0 + 0.4, v) * (1 - smooth(SEC.scope1 - 0.5, SEC.scope1, v));
  s.shift = v < SEC.white ? -1 + smooth(SEC.white - 3, SEC.white + 0.5, v) : smooth(SEC.blue - 1.5, SEC.blue + 1, v);
  // ---- after Earth: you, adrift in the glow (the Short's space scene) ----
  s.space = v >= SEC.space && v < SEC.end + 1 ? 1 : 0;
  s.out = 0;
  s.spBack = 0;
  s.spMerge = 0;
  s.glow = 1;
  s.skyT = Math.min(s.K, 20000);
  s.hot = smooth(SEC.last3, SEC.squash, v);              // past white-hot: atoms' cores, then quarks
  s.boilStars = 0;
  s.youGlow = smooth(SEC.last3 + 14, SEC.quark + 4, v);
  {
    const u = clamp((v - SEC.squash) / (SEC.crunch - SEC.squash));
    s.squash = Math.exp(-3.4 * u) * (1 - Math.pow(smooth(0.88, 1.0, u), 0.8));
  }
  s.drag = Math.pow(smooth(SEC.squash + 1.5, SEC.crunch - 0.8, v), 1.3);
  s.dim = v < SEC.bang + 0.08 ? smooth(SEC.crunch - 0.02, SEC.crunch + 0.08, v) : 0;
  s.pre = v < SEC.bang + 0.08 ? smooth(SEC.bang - 0.45, SEC.bang, v) : 0;
  s.bang = clamp((v - SEC.bang) / 1.25);
  s.white = smooth(SEC.bang + 0.75, SEC.whiteout + 0.6, v);
  // white at the end, then back to the promenade as it was
  s.flash = smooth(SEC.whiteout - 0.3, SEC.whiteout + 0.5, v) * (1 - smooth(SEC.end + 1, SEC.end + 5, v));
  // (and a quick one from the opening demonstration to the promenade)
  s.flash = Math.max(s.flash, smooth(SEC.walk - 0.7, SEC.walk, v) * (1 - smooth(SEC.walk, SEC.walk + 0.9, v)));
  s.after = v >= SEC.end + 1 ? 1 : 0;
  s.fadeOut = smooth(SEC.out - 2.5, SEC.out, v);
  s.title = 1 - smooth(6.0, 6.5, v);
  s.name = smooth(6.5, 6.9, v) * (1 - smooth(11.5, 12.3, v));   // THE BIG CRUNCH, as the voice says it (6.4 s)
  return s;
}
