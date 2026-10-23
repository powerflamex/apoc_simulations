// "What if you watched the universe die?" (the heat death) — the whole story as functions of VIDEO time v (seconds,
// 30 fps, 16:9). You stand at the stone railing of an observatory terrace on a hill, 300 m above a city that spreads
// west to the horizon. Space keeps growing faster and faster forever (dark energy), so nothing ever comes back:
//   5 billion years: the Sun swells into a red giant; it throws off its outer layers and its core is left, a white
//   dwarf the size of Earth (~8 billion). Earth freezes (-230 °C); the air freezes and falls as snow.
//   ~2 trillion years: every galaxy beyond our own (merged with Andromeda) has gone past the horizon (Krauss &
//   Scherrer 2007). ~100 trillion (10^14): the gas runs out, the last stars (red dwarfs) die (Adams & Laughlin 1997).
//   ~10^15: the Sun has cooled to a black dwarf. Dead stars now and then collide and flare. ~10^19-10^20: the galaxy
//   evaporates: most dead stars are flung out, the rest fall into the central black hole (Earth is imagined to fall in
//   with them). ~10^40: if protons decay, every atom is gone (Earth evaporates). ~10^67: star-sized black holes
//   evaporate (Hawking radiation). ~10^100 (a googol): the biggest ones (~10^11 suns, as ours is after eating a tenth
//   of the galaxy) go out in a last flash. Then nothing, a hair above absolute zero, forever. Penrose's idea
//   (conformal cyclic cosmology): a universe with nothing left but light can't tell big from small, so it may become
//   a new Big Bang.
//
// The video is laid out in sections (SEC) that match the narration (SCRIPT.md); the owner's recording is cut into
// lines placed on this clock in src/voice.js (audio.mjs mixes them in). The counter shows the years from now, Y(v),
// a smooth curve in log space through anchors (it races, and brakes at each step).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FPS = 30;

// ---- sections (video time) ----
export const SEC = {
  ff: 0,          // flash-forward: the frozen city under the black hole's glowing disk (title on screen)
  demo: 6,        // the whole universe from outside (src/demo.js): "This is the heat death"
  dDrift: 14.2,   // every galaxy drifts out of sight
  dStars: 17.4,   // every star burns out (ours goes red, then dark)
  dHoles: 20.2,   // every black hole evaporates (points of light that flash and go out)
  dLast: 23.6,    // the last one: nothing left. At all. [silence]
  dBang: 30.6,    // a new Big Bang, on "...happens"
  walk: 35,       // (through a white flash) the terrace at dusk, people out
  prom: 5,        // (the terrace's own clock starts here: its first 30 s are seen only in the closing shot)
  lapse: 64,      // "imagine you could stand right here": time races, the people blur away
  lock: 69,       // every frame now an hour before sunset (the Sun low over the city, left of ahead)
  giant: 72.2,    // "it swells into a red giant"
  shed: 77.5,     // "then it throws off its outer layers"
  wd: 82.5,       // "all that's left is its core. A white dwarf"
  day: 87.5,      // "this is daytime now. A black sky..."
  freeze: 95,     // "Earth freezes. Minus 230"
  snow: 100,      // "even the air freezes, and falls as snow" [silence 104-108.5]
  leave: 110,     // night: "meanwhile, space keeps stretching"
  scope0: 114, scope1: 138,   // the telescope: a far galaxy, redder, fainter...
  redder: 117.8, gone: 124.8, // ...until its light can't reach us
  alone: 127.5,   // two trillion years: every galaxy beyond our own is gone
  out: 140,       // "then, the stars start going out"
  bright: 148.5,  // "the big, bright stars go first"
  small: 151.8,   // "then the small ones"
  last: 163.5,    // the last star goes out [silence]
  sunFade: 168,   // "our Sun fades too. Dull red. Then black."
  black: 172.5,   // a quadrillion years: a black dwarf
  dark: 179,      // "but it's not completely dark"
  crash: 186,     // two dead stars crash: a flash ("...light again")
  fling: 191.5,   // most dead stars flung out
  fall: 198.5,    // the rest fall into the black hole
  bh: 204.5,      // "imagine Earth falls in with them": the black hole grows overhead
  disk: 208.5,    // everything falling in heats up and glows
  fire: 214,      // "the last fire in the galaxy" [silence 216.5-220.5]
  atoms: 221,     // "even atoms start to fall apart"
  evap: 236,      // "Earth just evaporates" ("and so would you" 238.6) [silence 240.5-245]
  float: 245.5,   // "imagine you're somehow still here, floating in the dark"
  holes: 250.5,   // "the only things left are black holes"
  pops: 260.5,    // star-sized black holes: far away, flashes
  ours: 267.5,    // "ours ate so much..."
  googol: 272.5,  // "it lasts a googol years"
  hotter: 278.5,  // "as it shrinks, it gets hotter. And brighter."
  until: 283,     // "Until..."
  lastLight: 285.5, // the last flash [silence]
  nothing: 291,   // "that was the last light in the universe"
  forever: 307.5,
  death: 310,     // "this is the heat death" [silence]
  unless: 316,    // "Unless."
  penrose: 318.2, // the whole (empty) universe from outside again: the camera pulls back
  tiny: 328.5,    // "...the same as one that's tiny, and hot"
  bang: 339.5,    // a new Big Bang
  whiteout: 343.5,
  end: 346,       // white clearing onto the terrace at dusk, as at the start; the closing lines
  outro: 374,
};
export const VIDEO_DURATION = SEC.outro;
export const V_FF = 215.5;          // the flash-forward replays the black hole's disk over the frozen city from here
export const FF_LEN = 6;

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

// ---- the years from now at video time v ----
const ANCH = [
  [SEC.lapse, 2e-6],
  [SEC.lapse + 2.5, 3],
  [SEC.lock, 1e7],
  [SEC.giant + 0.6, 5.0e9],
  [SEC.shed, 7.6e9],
  [SEC.wd, 8.0e9],
  [SEC.freeze, 9.0e9],
  [SEC.leave, 2.0e10],
  [SEC.scope0, 4.0e10],
  [SEC.gone, 3.0e11],
  [SEC.alone, 2.0e12],
  [SEC.out, 1.0e13],
  [SEC.small, 3.0e13],
  [SEC.last, 1.0e14],
  [SEC.black, 1.0e15],
  [SEC.crash, 2.0e16],
  [SEC.fling, 1.0e17],
  [SEC.fall, 1.0e19],
  [SEC.fire, 1.0e20],
  [SEC.atoms + 4, 1.0e30],
  [SEC.evap, 1.0e40],
  [SEC.holes, 1.0e48],
  [SEC.pops + 2, 1.0e67],
  [SEC.googol, 1.0e85],
  [SEC.lastLight, 1.0e100],
  [SEC.nothing, 1.0e102],
  [SEC.death, 1.0e140],
  [SEC.penrose, 1.0e300],
];
const logY = monotone(ANCH.map(([v, Y]) => [v, Math.log10(Y)]));
// log10 of the years from now (the exponent runs past what a double holds)
export function log10Years(v) {
  if (v < SEC.lapse) return -9;
  if (v <= SEC.penrose) return logY(v);
  // past the last anchor: the exponent itself races away (10^1000, 10^1,000,000 ...)
  return 300 * Math.pow(10, 3 * smooth(SEC.penrose, SEC.bang - 1, v));
}
// story years per video second (how fast time is racing)
export const rate = (v) => Math.max(1e-30, (Math.pow(10, Math.min(300, log10Years(v + 0.02))) - Math.pow(10, Math.min(300, log10Years(v - 0.02)))) / 0.04);

// ---- the opening demonstration and the closing one (src/demo.js) ----
// the size of the whole universe (1 = today): it grows faster and faster, forever
export function scaleAt(v) {
  if (v >= SEC.unless) return 1;
  const u = Math.max(0, v - SEC.demo);
  return Math.exp(0.05 * u + 0.034 * u * u);
}
export const scaleRate = (v) => (scaleAt(v + 0.02) - scaleAt(v - 0.02)) / 0.04;
const demoLog = monotone([[SEC.demo, 0], [SEC.dDrift, 11], [SEC.dStars, 14], [SEC.dHoles, 40], [SEC.dLast, 100]]);
export const demoLogYears = (v) => demoLog(clamp(v, SEC.demo, SEC.dLast));

// ---- the big moments: a word pops up at each one ----
export const BEATS = [
  { v: SEC.dDrift, w: 'The galaxies', k: '100 BILLION YEARS' },
  { v: SEC.dStars, w: 'The stars', k: '100 TRILLION YEARS' },
  { v: SEC.dHoles, w: 'The black holes', k: '10¹⁰⁰ YEARS' },
  { v: SEC.dLast + 0.1, w: 'Nothing', k: 'FOREVER', quiet: true },
  { v: SEC.dBang + 0.15, w: 'A new Big Bang?', k: 'AND THEN, MAYBE', quiet: true },
  { v: SEC.giant + 0.6, w: 'A red giant', k: '5 BILLION YEARS FROM NOW' },
  { v: SEC.wd + 0.5, w: 'A white dwarf', k: '8 BILLION YEARS FROM NOW' },
  { v: SEC.snow + 0.6, w: 'The air freezes', k: 'EARTH: −230 °C' },
  { v: SEC.gone, w: 'Gone', k: '300 BILLION YEARS FROM NOW' },
  { v: SEC.alone + 0.4, w: 'Alone', k: '2 TRILLION YEARS FROM NOW' },
  { v: SEC.last, w: 'The last star', k: '100 TRILLION YEARS FROM NOW', quiet: true },
  { v: SEC.black, w: 'A black dwarf', k: '1 QUADRILLION YEARS FROM NOW' },
  { v: SEC.crash + 0.1, w: 'Light again', k: 'TWO DEAD STARS CRASH' },
  { v: SEC.bh + 1, w: 'The black hole', k: '10,000,000,000,000,000,000 YEARS' },
  { v: SEC.fire, w: 'The last fire', k: '100 BILLION BILLION YEARS', quiet: true },
  { v: SEC.evap + 0.2, w: 'Atoms', k: '10⁴⁰ YEARS FROM NOW', quiet: true },
  { v: SEC.pops + 2, w: 'Black holes', k: '10⁶⁷ YEARS FROM NOW' },
  { v: SEC.googol + 0.8, w: 'A googol years', k: '1 WITH 100 ZEROS' },
  { v: SEC.lastLight + 0.1, w: 'The last light', k: '10¹⁰⁰ YEARS FROM NOW', quiet: true },
  { v: SEC.death + 0.2, w: 'The heat death', k: 'FOREVER', quiet: true },
  { v: SEC.bang + 0.15, w: 'A new Big Bang', k: 'AND THEN', quiet: true },
];
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}
// what comes next (the finish line under the counter)
const NEXT = [
  [0, 'THE SUN DIES'], [SEC.wd + 4, 'THE GALAXIES LEAVE'], [SEC.alone + 4, 'THE LAST STAR'],
  [SEC.last + 4, 'THE GALAXY DIES'], [SEC.fire + 4, 'ATOMS'], [SEC.evap + 6, 'THE LAST LIGHT'], [SEC.lastLight, ''],
];
export const nextAt = (v) => { let n = ''; for (const [t, s] of NEXT) if (v >= t) n = s; return n; };

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((d) => (d === ',' ? '˒' : SUP[+d])).join('');
// years from a log10 value: whole numbers to a hundred trillion, then a power of ten
export function fmtYears(lg) {
  if (lg < -8) return 'Today';
  if (lg < 15) {
    const y = Math.pow(10, lg);
    if (y < 1) return `${(y * 365.25).toFixed(y * 365.25 < 10 ? 1 : 0)} days`;
    return `${fmtInt(y)} years`;
  }
  if (lg < 301) {
    let n = Math.floor(lg), m = Math.pow(10, lg - n);
    if (m >= 9.95) { m /= 10; n++; }
    return `${m.toFixed(1)} × 10${sup(n)} years`;
  }
  // beyond: only the exponent means anything
  return `10${sup(Math.round(lg))} years`;
}
export const COUNTERS = [
  { from: -10, to: SEC.bang, gap: [SEC.demo, SEC.walk], label: 'YEARS FROM NOW', fmt: (x) => x, value: (v) => fmtYears(log10Years(v)),
    unit: (v) => { const n = nextAt(v); return n ? `NEXT: ${n}` : ''; } },
  { from: SEC.demo, to: SEC.walk, label: (v) => (v < SEC.dBang ? 'YEARS FROM NOW' : 'A NEW UNIVERSE'), fmt: (x) => x,
    value: (v) => (v < SEC.dBang ? (v < SEC.demo + 0.3 ? 'Today' : fmtYears(demoLogYears(v))) : `${fmtInt(Math.pow(10, 2 + 7.5 * clamp((v - SEC.dBang) / 4.5)))} years old`),
    unit: (v) => (v < SEC.dDrift ? 'NEXT: THE GALAXIES DRIFT AWAY' : v < SEC.dStars ? 'NEXT: THE STARS BURN OUT' : v < SEC.dLast ? 'NEXT: THE LAST LIGHT' : '') },
];

// ---- the temperature: Earth's ground, then (once Earth is gone) empty space ----
export function tempC(v) {
  if (v < SEC.evap + 2) {
    return lerp(lerp(lerp(15, -230, smooth(SEC.freeze - 0.5, SEC.snow - 0.5, v)), -255, smooth(SEC.out, SEC.last, v)),
      -271, smooth(SEC.sunFade, SEC.evap, v));
  }
  return null;
}
export const TEMPROW = {
  from: SEC.freeze - 0.6, to: SEC.bang - 2,
  label: (v) => (v < SEC.evap + 2 ? 'EARTH' : 'EMPTY SPACE'),
  value: (v) => {
    const c = tempC(v);
    if (c !== null) return `${Math.round(c)} °C`;
    // a hair above absolute zero: more nines the longer it goes on (capped so it fits)
    const nines = Math.min(7, Math.max(2, 2 + Math.floor((log10Years(v) - 40) / 12)));
    return `−273.14${'9'.repeat(nines)} °C`;
  },
};

// ---- the clock on the terrace ----
// T: story minutes since the first frame (people, cars, the light); TOD0: the first frame is 23 minutes before an
// equinox sunset (18:10). After the lapse every frame is taken an hour before sunset (the Sun low over the city);
// for the night stretch, at midnight.
export const TOD0 = 17 * 60 + 47;
const DAYLOCK = 17 * 60 + 2 - TOD0;            // minutes after the first frame
const NIGHTLOCK = 24 * 60 + 0 - TOD0;
const daysAt = (v) => Math.floor(clamp((v - SEC.lapse) / (SEC.outro - SEC.lapse)) * 90000);   // a new day each frame
export function clockT(v) {
  if (v < SEC.lapse) return (v - SEC.prom) / 60;
  if (v < SEC.lock) {   // a few days and nights sweep by (no strobing), settling on the late afternoon
    const u = clamp((v - SEC.lapse) / (SEC.lock - SEC.lapse));
    return lerp((SEC.lapse - SEC.prom) / 60, DAYLOCK + 1440 * 4, u * u * (3 - 2 * u));
  }
  // the night stretch (from the far galaxies to the dark): midnight; a quick swing of the hours on the way into it
  const n = smooth(SEC.leave - 1.5, SEC.leave + 0.5, v) * (1 - smooth(SEC.last + 1, SEC.last + 3.5, v));
  return 1440 * (4 + daysAt(v) % 5000) + lerp(DAYLOCK, NIGHTLOCK, n);
}
// exposure: story minutes smeared into one frame (real time 1/60 s; the races span ages)
export function exposure(v) {
  const real = 1 / 3600;
  const race = smooth(SEC.lapse - 0.5, SEC.lapse + 2, v);
  return Math.exp(lerp(Math.log(real), Math.log(1e6), race));
}

// the Sun's direction (north +x, up +y, east +z) at 34° N on an equinox, T minutes after the first frame
const LAT = 34 * Math.PI / 180;
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

// ---- the collisions of dead stars in the dark: [video time, direction (x, y, z), strength] ----
export const CRASHES = [
  [SEC.crash, [-0.55, 0.42, -0.72], 1.0],
  [SEC.crash + 7.4, [0.62, 0.3, -0.73], 0.45],
  [SEC.crash + 12.6, [-0.2, 0.62, -0.76], 0.3],
];
// far-off star-sized black holes evaporating (after the atoms): [video time, direction]
export const POPS = [];
{
  let a = 1.3;
  for (let i = 0; i < 16; i++) {
    a = (a * 7.31 + 0.71) % 6.2832;
    const el = 0.05 + 0.6 * ((i * 0.618) % 1), az = a;
    POPS.push([SEC.pops + 1.2 + i * 0.75 + 0.3 * Math.sin(i * 3.1), [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]]);
  }
}

// ---- how the scene looks (pure function of v) ----
export function state(v) {
  const s = { v, lgY: log10Years(v) };
  s.T = clockT(v);
  s.E = exposure(v);
  s.sunD = sunDir(s.T);
  // people: out at dusk; gone once time races
  const fast = smooth(Math.log10(1 / 3600), Math.log10(30), Math.log10(s.E));
  s.crowd = 1 - fast;
  // the city: its lights on until the freeze, then going out in patches
  s.lights = 1 - smooth(SEC.day + 1, SEC.freeze + 3, v);
  s.traffic = 1 - smooth(SEC.giant, SEC.wd, v);
  // ---- the Sun ----
  // red giant: the disk swells (angular radius, rad) and reddens; then it is shed in glowing shells, leaving the
  // white dwarf: a tiny, blinding point, fading over trillions of years to dull red, then black
  s.giant = smooth(SEC.giant - 1, SEC.giant + 4, v);
  s.giantC = smooth(SEC.giant - 1.5, SEC.giant + 1.5, v);           // its colour and dimming come first
  s.shed = smooth(SEC.shed, SEC.wd + 1, v);
  s.sunR = 0.00465 * Math.exp(Math.log(0.4 / 0.00465) * Math.pow(s.giant, 0.8)) * (1 - 0.15 * s.shed);
  s.nebula = clamp((v - SEC.shed) / (SEC.freeze + 4 - SEC.shed));    // the shells' phase (expanding past us, fading)
  s.wd = smooth(SEC.shed + 2, SEC.wd + 0.5, v);
  s.wdK = Math.exp(lerp(Math.log(25000), Math.log(2600), smooth(SEC.out, SEC.black - 1, v)));   // its colour
  s.wdI = Math.pow(1 - smooth(SEC.sunFade - 6, SEC.black, v), 2) * (1 - 0.6 * smooth(SEC.out, SEC.sunFade, v));
  // the air: thinner and darker with the dim little star, frozen out by the snow
  s.air = 1 - smooth(SEC.shed + 1, SEC.wd + 1.5, v);
  s.snow = smooth(SEC.freeze, SEC.snow + 7, v);
  s.snowfall = smooth(SEC.snow - 0.5, SEC.snow + 1.5, v) * (1 - smooth(SEC.snow + 8, SEC.leave, v));
  // ---- the night sky ----
  // stars thin out from the brightest down (s.starsOut: 0 all .. 1 none), redden; the galaxy's glow dims with them
  s.starsOut = smooth(SEC.bright - 1.5, SEC.last, v);
  s.starRed = smooth(SEC.small - 2, SEC.last - 2, v);
  s.ball = smooth(SEC.lock, SEC.leave, v);            // the Milky Way and Andromeda, merged: one big ball of stars
  s.galDim = 1 - smooth(SEC.bright, SEC.last + 1, v);
  s.lastStar = smooth(SEC.small, SEC.small + 3, v) * (1 - smooth(SEC.last - 0.5, SEC.last + 0.3, v));
  s.far = 1 - smooth(SEC.leave + 2, SEC.alone, v);    // far galaxies (faint smudges) disappearing
  s.scope = smooth(SEC.scope0 - 0.4, SEC.scope0 + 0.4, v) * (1 - smooth(SEC.scope1 - 0.5, SEC.scope1, v));
  s.redden = smooth(SEC.scope0 + 2, SEC.gone - 1.5, v);               // its light: white -> red, dimmer...
  s.fadeGal = smooth(SEC.redder + 2, SEC.gone, v);                    // ...then gone
  // the light on Earth that isn't the Sun: dusk/night as usual; once the stars die, a faint artist's blue so the
  // frozen city still reads
  s.amb = lerp(1, 0.5, smooth(SEC.bright, SEC.black, v));
  // ---- the black hole ----
  s.bh = smooth(SEC.bh - 0.5, SEC.bh + 2, v);
  s.bhR = Math.exp(lerp(Math.log(0.004), Math.log(0.1), smooth(SEC.bh, SEC.fire, v))) * (1 - 0.88 * smooth(SEC.googol, SEC.lastLight - 0.4, v));
  s.disk = smooth(SEC.disk + 1, SEC.disk + 5, v) * (1 - smooth(SEC.evap - 1, SEC.float, v));
  s.hawk = smooth(SEC.float - 1, SEC.holes + 2, v) * (0.3 + 0.7 * Math.pow(smooth(SEC.hotter - 3, SEC.lastLight, v), 2));
  s.lastFlash = v >= SEC.lastLight ? clamp((v - SEC.lastLight) / 0.15) * Math.exp(-Math.max(0, v - SEC.lastLight - 0.15) * 0.9) : 0;
  s.bhGone = v >= SEC.lastLight + 0.05 ? 1 : 0;
  s.shell = v >= SEC.lastLight ? v - SEC.lastLight : -1;              // the last light's afterglow, spreading
  // ---- Earth evaporates; you float ----
  s.dissolve = smooth(SEC.evap - 0.3, SEC.evap + 9, v);
  s.earthGone = smooth(SEC.evap + 7, SEC.float, v);
  s.rise = smooth(SEC.evap + 2, SEC.holes, v);
  s.youDis = smooth(SEC.evap + 1.5, SEC.evap + 4.5, v) * (1 - smooth(SEC.float - 1.5, SEC.float + 1, v));
  // ---- the closing demonstration: the empty universe from outside, shrinking to a point (src/demo.js) ----
  s.demo2 = v >= SEC.penrose && v < SEC.end + 1 ? 1 : 0;
  // white at the end, then back to the terrace as it was
  s.flash = smooth(SEC.whiteout - 0.3, SEC.whiteout + 0.5, v) * (1 - smooth(SEC.end + 1, SEC.end + 5, v));
  // (and a quick one from the opening demonstration to the terrace)
  s.flash = Math.max(s.flash, smooth(SEC.walk - 0.7, SEC.walk, v) * (1 - smooth(SEC.walk, SEC.walk + 0.9, v)));
  s.after = v >= SEC.end + 1 ? 1 : 0;
  s.fadeOut = smooth(SEC.outro - 2.5, SEC.outro, v);
  s.title = 1 - smooth(6.0, 6.5, v);
  s.name = smooth(6.6, 7.0, v) * (1 - smooth(11.6, 12.4, v));   // THE HEAT DEATH, as the voice says it (6.4 s)
  return s;
}
