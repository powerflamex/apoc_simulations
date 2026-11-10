// "What if a rogue planet hit Earth?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A scramble crossing at night (a big neon city at 40° N, the planet low in the north over the avenue). A rogue planet
// with Jupiter's mass and size is falling straight at Earth; the video is a time-lapse of its last 9 hours.
// The numbers (checked; G M_jup = 1.26687e17, G M_earth = 3.986e14 m^3/s^2):
//   - size: Jupiter's radius, 69,911 km. Mass: 318 Earths. Far out it comes at 30 km/s (67,000 mph: a rogue planet
//     falling past the Sun meets Earth at a few tens of km/s); it speeds up as it falls: 31.5 km/s at 9 h out, 65 km/s
//     at contact (76,282 km centre to centre). Speed at distance d: sqrt(30^2 + 2GM/d).
//   - time to contact vs distance (integrated below): 9 h: 1.29 million km (6.3° wide: 12x the Moon); 1 h: 245,000 km
//     (33°); 8.1 min: 106,000 km, Earth's Roche limit (it can no longer hold itself together); 1 min: 80,000 km.
//   - its size in the sky (angular diameter) = 2 asin(R_J / (d - R_E)): 90° (half the sky) at 8 min.
//   - the tide it raises (vs the Moon's) = (M_J / M_moon) (384,400 km / d)^3 = 25,860 x (384,400 / d)^3.
//   - how much lighter you are under it (a rigid Earth) = 2 (M_J / M_E)(R_E / d)^3: 6% at 17 min, 20% at 5 min.
//   - the ground's own tide (the solid Earth stretches elastically, h2 = 0.6): 0.6 (M_J/M_E)(R_E/d)^3 R_E = 30+ miles
//     in the last half hour; the crust cracks long before that (tidal stress passes rock's strength ~500,000 km out).
//   - the Moon: integrated as a three-body problem (Earth, Moon, planet) below. Its pull on the Moon passes Earth's
//     6.8 million km out (days before); in the last hours the Moon is dragged across the sky toward it and hits it
//     2.7 hours before Earth would (it is 384,000 km closer to it).
//   - Earth's spin: we are at 35° N and the planet comes from right beside the pole star, so it hangs in the same spot
//     all night, 35° up in the north over the avenue, while the stars wheel round it (impact at 6 am, with dawn just
//     below the eastern horizon). The Sun lights it from below the horizon: lit on one side, that side swinging from
//     west to east through the night.
//   - its direct pull on you, G M / D^2 (D: from you to its centre), passes Earth's 9.81 m/s^2 at D = 113,600 km
//     (12 minutes out). Earth falls toward it too, so what you feel is the difference across Earth (the tide); that
//     difference is what tears Earth apart from 106,000 km (8 minutes out).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
const DEG = Math.PI / 180;
export const GMJ = 1.26687e17, GME = 3.986e14, RJ = 6.9911e7, RE = 6.371e6, VINF = 30e3, RMOON = 1.7374e6, AMOON = 3.844e8;
export const D_CONTACT = RJ + RE;
export const MILE = 1609.344;

// ---- distance vs time left (straight in; d(T), T in seconds before contact) ----
const TAB_T = [], TAB_D = [];
{
  let d = D_CONTACT, T = 0;
  const GM = GMJ + GME;
  TAB_T.push(0); TAB_D.push(d);
  while (T < 5 * 86400) {
    const dd = Math.max(2e3, d * 2e-4);
    const v = Math.sqrt(VINF * VINF + 2 * GM / (d + dd / 2));
    d += dd; T += dd / v;
    TAB_T.push(T); TAB_D.push(d);
  }
}
export function dOfT(T) {
  if (T <= 0) return D_CONTACT;
  let lo = 0, hi = TAB_T.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TAB_T[m] < T) lo = m; else hi = m; }
  return lerp(TAB_D[lo], TAB_D[hi], (T - TAB_T[lo]) / (TAB_T[hi] - TAB_T[lo]));
}
export const speedAt = (d) => Math.sqrt(VINF * VINF + 2 * (GMJ + GME) / d);
export const angR = (d) => Math.asin(Math.min(1, RJ / Math.max(d - RE, RJ)));           // its angular radius (rad)
export const tideX = (d) => 25860 * Math.pow(AMOON / d, 3);
export const lighter = (d) => 2 * (GMJ / GME) * Math.pow(RE / d, 3);

// ---- the time-lapse: time left at video time v. A jump every 3 s (most of each step in its first half second), then
// smoother near the end ----
const KEYS = [32400, 25500, 19500, 14400, 10800, 7500, 5100, 3500, 2400, 1620, 1110, 750, 492, 324, 204, 120, 66, 36];
const STEP = 3;
export function Tleft(v) {
  if (v <= 0) return KEYS[0] * Math.pow(KEYS[0] / KEYS[1], -v / STEP);   // (before frame 0: the same race)
  const k = Math.min(Math.floor(v / STEP), KEYS.length - 2);
  const u = clamp((v - k * STEP) / STEP);
  // how much of each step is the jump (the rest is the steady race); the first 3 s are all race
  const jump = k === 0 ? 0 : 0.72 - smooth(30, 39, v) * 0.5;
  const f = jump * smooth(0, 0.17, u) + (1 - jump) * u;
  return Math.exp(lerp(Math.log(KEYS[k]), Math.log(KEYS[k + 1]), f));
}
export const STEPS = KEYS.slice(1).map((_, i) => (i + 1) * STEP).filter((t) => t < 46);

// ---- the sky: Earth's spin, the planet's and the Sun's directions (world: x east, y up, z south) ----
const LAT = 35 * DEG, P_DEC = 88 * DEG, SUN_DEC = -15 * DEG;
const SID = 86164;
function horizon(H, dec, out = [0, 0, 0]) {
  // H: hour angle (rad), dec: declination -> unit vector [east, up, south]
  const alt = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.sin(LAT) * Math.cos(H));
  out[0] = Math.cos(alt) * Math.sin(az); out[1] = Math.sin(alt); out[2] = -Math.cos(alt) * Math.cos(az);
  return out;
}
export const planetDir = (T, out) => horizon(-T / SID * 2 * Math.PI, P_DEC, out);
// impact at 6:00 local time: the Sun's hour angle is (local time - 12 h)
export const sunDir = (T, out) => horizon(((6 - T / 3600) - 12) / 24 * 2 * Math.PI, SUN_DEC, out);

// ---- the Moon (three-body, in Earth's frame; the planet along +Z, coming straight in) ----
// Each record: T, the Moon's angle from the planet's direction (rad), its distance from Earth, its distance from the
// planet's centre.
export const MOON = [];
export let T_MOON_HIT = 0;
{
  const inc = 0.2, ph = -20 * DEG;
  const e1 = [Math.sin(inc), 0, Math.cos(inc)], e2 = [0, 1, 0];
  const w = Math.sqrt(GME / AMOON);
  let r = [0, 1, 2].map((i) => AMOON * (Math.cos(ph) * e1[i] + Math.sin(ph) * e2[i]));
  let u = [0, 1, 2].map((i) => w * (-Math.sin(ph) * e1[i] + Math.cos(ph) * e2[i]));
  const acc = (T, r) => {
    const d = dOfT(T);
    const rr = Math.hypot(r[0], r[1], r[2]);
    const q = [-r[0], -r[1], d - r[2]], qq = Math.hypot(q[0], q[1], q[2]);
    return [0, 1, 2].map((i) => -GME * r[i] / rr ** 3 + GMJ * (q[i] / qq ** 3 - (i === 2 ? d : 0) / d ** 3));
  };
  let T = 3 * 86400;
  const dt = 10;
  while (T > 0) {
    let a = acc(T, r);
    u = u.map((x, i) => x + a[i] * dt / 2); r = r.map((x, i) => x + u[i] * dt); T -= dt;
    a = acc(T, r); u = u.map((x, i) => x + a[i] * dt / 2);
    const d = dOfT(T);
    const rr = Math.hypot(r[0], r[1], r[2]);
    const qq = Math.hypot(r[0], r[1], d - r[2]);
    if (T < 11 * 3600 && Math.round(T) % 60 === 0) MOON.push([T, Math.acos(r[2] / rr), rr, qq]);
    if (qq < RJ + RMOON * 0.3) { T_MOON_HIT = T; MOON.push([T, Math.acos(r[2] / rr), rr, qq]); break; }
  }
  MOON.reverse();     // increasing T
}
export function moonAt(T) {
  if (T <= T_MOON_HIT) return null;
  let lo = 0, hi = MOON.length - 1;
  if (T >= MOON[hi][0]) return { sep: MOON[hi][1], dist: MOON[hi][2], toP: MOON[hi][3] };
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (MOON[m][0] < T) lo = m; else hi = m; }
  const k = (T - MOON[lo][0]) / (MOON[hi][0] - MOON[lo][0]);
  return { sep: lerp(MOON[lo][1], MOON[hi][1], k), dist: lerp(MOON[lo][2], MOON[hi][2], k), toP: lerp(MOON[lo][3], MOON[hi][3], k) };
}
// video time when T(v) reaches a given time left
export function vOfT(T) {
  let a = -1, b = 60;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (Tleft(m) > T) a = m; else b = m; }
  return (a + b) / 2;
}
export const V_MOON_HIT = vOfT(T_MOON_HIT);
export const V_ROCHE = vOfT(486);                  // 106,000 km: Earth's Roche limit (8.1 min)
export const V_PULL = vOfT(738);                   // its pull on you passes Earth's (113,600 km from you: 12.3 min)

// ---- the end ----
export const V_FLOOD = 15.4;          // the sea comes up the avenue (reaches you at ~17 s)
export const V_CRACK = 20.8;          // the first cracks across the crossing
export const V_WIND = 26.4;           // the air starts pouring toward it
export const V_FISSURE = 32.1;       // a glowing crack tears open down the avenue; the volcanoes on the horizon
export const V_LIFT = 38.2;           // loose things, then people, cars and the water lift off
export const CUT = [43.3, 44.7];      // the one cutaway: Earth from space, stretched toward it
export const V_SPLIT = 45.3;          // the crust splits under you
export const T_SWITCH = 47.6;         // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- the numbers the captions use (computed, so they match the counter) ----
const dAt = (v) => dOfT(Tleft(v));
const round1 = (x) => { const p = Math.pow(10, Math.floor(Math.log10(x))); return Math.round(x / p) * p; };
const mphAt = (v) => Math.round(speedAt(dAt(v)) * 3600 / MILE / 1000) * 1000;
// its direct pull on you (from you to its centre), in g
const pullX = (v) => GMJ / Math.pow(dAt(v) - RE, 2) / 9.81;
const moonPull = (() => { const m = moonAt(Tleft(10)); return round1((GMJ / (m.toP * m.toP)) / (GME / (m.dist * m.dist))); })();

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_MOON_HIT + 0.05, 'THE MOON SMASHES INTO IT'],
  [V_FLOOD + 1.0, 'THE SEA FLOODS IN'],
  [V_CRACK + 0.3, 'THE GROUND CRACKS'],
  [V_WIND + 0.8, 'THE AIR RUSHES TOWARD IT'],
  [V_FISSURE + 0.4, 'THE CRUST TEARS OPEN'],
  [V_ROCHE + 0.1, 'EARTH STARTS TO COME APART'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together) ----
export const CAPTIONS = [
  [3.4, 5.8, 'It’s 318 times heavier than Earth.'],
  [6.2, 8.6, `It’s coming at you at ${mphAt(7).toLocaleString('en-US')} mph.`],
  [9.0, V_MOON_HIT - 0.2, `It pulls on our Moon ${moonPull.toLocaleString('en-US')}x harder than Earth.`],
  [V_MOON_HIT + POP + 0.15, V_FLOOD + 0.85, `Its tides are ${round1(tideX(dAt(15))).toLocaleString('en-US')}x the Moon’s.`],
  [V_FLOOD + 1.0 + POP + 0.2, V_CRACK + 0.1, 'The water’s up to your knees.'],
  [V_CRACK + 0.3 + POP + 0.2, V_WIND + 0.6, `It stretches Earth ${Math.round(0.6 * (GMJ / GME) * Math.pow(RE / dAt(24), 3) * RE / MILE / 5) * 5} miles out of shape.`],
  [V_WIND + 0.8 + POP + 0.2, V_FISSURE + 0.2, `Now it’s doing ${mphAt(30.5).toLocaleString('en-US')} mph.`],
  [V_FISSURE + 0.4 + POP + 0.2, V_ROCHE - 0.1, 'Its pull on you just passed Earth’s.'],
  [V_ROCHE + 0.1 + POP + 0.2, CUT[0] - 0.3, `Its pull on you is now ${pullX(V_ROCHE + 4.5).toFixed(1)}x Earth’s.`],
  [CUT[0] - 0.1, V_SPLIT + 0.5, 'It never even touches us.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.2);
      const fadeOut = clamp((b - v) / 0.2);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: time left, racing down; the distance under it ----
const pad = (n) => String(n).padStart(2, '0');
export function fmtLeft(T) {
  const s = Math.max(0, Math.floor(T));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h > 0 ? `${h}h ${pad(m)}m ${pad(x)}s` : `${m}m ${pad(x)}s`;
}
export function fmtMiles(d) {
  const mi = (d - RJ - RE) / MILE;        // surface to surface
  const r = mi > 100000 ? 10000 : mi > 10000 ? 1000 : 100;
  return `${(Math.round(mi / r) * r).toLocaleString('en-US')} MILES AWAY`;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'IMPACT IN  ·  TIME-LAPSE',
    fmt: (T) => fmtLeft(T),
    value: (v) => Tleft(v),
    unit: (v) => fmtMiles(dAt(v)),
  },
];

// ---- the state at video time v ----
const tmpP = [0, 0, 0], tmpS = [0, 0, 0];
export function state(v) {
  const s = { v };
  s.T = Tleft(v);
  s.d = dOfT(s.T);
  s.ang = angR(s.d);
  s.pdir = planetDir(s.T, [0, 0, 0]);
  s.sdir = sunDir(s.T, [0, 0, 0]);
  s.moon = moonAt(s.T);
  s.title = 1 - smooth(2.9, 3.35, v);
  // how much of the jump is happening now (0..1, for the whoosh, the camera kick, the bloom)
  s.kick = 0;
  for (const t of STEPS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.05, dt) * Math.exp(-Math.max(dt, 0) / 0.3)); }
  s.react = smooth(0.2, 2.5, v);
  s.flood = smooth(V_FLOOD, V_FLOOD + 4.6, v);                 // the front's progress
  s.water = v > V_FLOOD + 0.7 ? 0.1 + 0.3 * smooth(V_FLOOD + 3.0, V_FLOOD + 5.0, v) + 0.35 * smooth(21, 38, v) : -1;
  s.quake = smooth(V_CRACK - 1.5, V_CRACK + 0.5, v) * 0.5 + smooth(V_FISSURE - 1, V_FISSURE + 1, v) * 0.5 + smooth(V_ROCHE, V_SPLIT, v) * 0.6;
  s.cracks = smooth(V_CRACK, V_CRACK + 4.0, v);
  s.wind = smooth(V_WIND - 1, V_WIND + 3, v) * (1 + 0.6 * smooth(V_FISSURE, V_LIFT + 2, v));
  s.fissure = smooth(V_FISSURE, V_FISSURE + 2.5, v);
  s.volcano = smooth(V_FISSURE - 0.5, V_FISSURE + 3.5, v);
  s.lift = Math.max(0, v - V_LIFT);
  s.split = smooth(V_SPLIT, V_SPLIT + 1.6, v);
  s.cut = v >= CUT[0] && v < CUT[1];
  s.flash = smooth(46.7, T_SWITCH - 0.03, v);
  s.flashColor = '#fffaf2';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
