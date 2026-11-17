// "What if you screamed 1 trillion times louder?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One street, one shot: you scream on a packed sidewalk and your scream's power grows 10x every couple of seconds.
// "Times louder" here means times the sound POWER: every 10x adds 10 decibels (dB = 10 log10 of the power ratio).
// (Perceived loudness only doubles per 10 dB; the video counts power, as the title's "1 trillion times" does.)
// Every number below was checked (Nov 16, 2026):
//   x1      a loud scream: about 100 dB at 1 m (typical screams 95-105 dB; the records 121-129 dB were measured closer).
//           100 dB at 1 m = 0.01 W/m², over a sphere of 1 m (12.6 m²): 0.126 W of sound. (The "1 watt" figure for a
//           shout, Bouhuys 1968, is the disputed high end; speech is 0.01-1 mW.)
//   x1,000  130 dB at 1 m: the threshold of pain.
//   x10,000 140 dB at 1 m: as loud as a jet engine about 100 ft (30 m) away (140 dB is the usual figure).
//   x1e6    160 dB at 1 m. Peak pressure p = sqrt(2 I rho c) (rho c = 413): 2.9 kPa x sqrt(mult) / r(m) -> at x1e6,
//           2.9 kPa at 1 m, 830 Pa (0.12 psi) at 3.5 m: big plate-glass windows break from ~0.1-0.15 psi, so the shop
//           window 2.5 m from you goes. Car alarms (shock sensors) go off.
//   x1e8    180 dB: 2.9 kPa (0.42 psi) at 10 m, 0.21 psi at 20 m: ordinary windows break at ~0.15-0.5 psi, so the
//           windows across the street (12-25 m) shatter.
//   x1e9    190 dB at 1 m: the loudest sound air can carry is ~191 dB rms / 194 dB peak (the pressure dips to zero:
//           a vacuum). Beyond that the wave steepens into a shock wave. 2 psi at 6.6 m: people knocked down.
//   x1e10   200 dB: 2 psi at 21 m (people thrown), 3 psi at 14 m (lamp posts bend, cars shoved), 5 psi at 8 m.
//   x1e11   210 dB: 5 psi (cars overturned, brick walls fail) at 26 m: across the street.
//   x1e12   220 dB; power 0.126 W x 1e12 = 1.26e11 W = 30 tons of TNT (4.184e9 J each) every second.
//           5 psi (most buildings collapse) out to 83 m (270 ft); 0.2 psi (windows) at 2 km: over a mile away.
//           Walls that only just hold are battered on by the steady blast and give way over the next seconds
//           (city.js: a wall's strength sinks to 60% within ~5 s once it's past 60% of it).
//           Towers: blast tables (5 psi) are for millisecond pulses; this push is steady. 2 psi = 14 kPa is ~5x the
//           strongest wind a tower is built for (a 70 m/s hurricane: ~3 kPa), held for seconds, so towers out to
//           ~200 m (2 psi at x1e12) topple, away from you. Beyond that they stand, their windows gone (0.2 psi: 2 km).
//           The last ring's echo off the far towers (reflected shock) comes back up the street at the camera.
// The pressures use plain sound physics (p falls as 1/r) far past where it strictly holds; near you the real shock
// would be stronger and lose energy faster. They are order-of-magnitude estimates, and only the robust claims are made.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const DB0 = 100;                         // your scream, dB at 1 m
export const P0 = 4 * Math.PI * 0.01;           // its sound power (W)
export const TNT = 4.184e9;                     // J per ton
export const PSI = 6894.76;
// the beats: [video time, log10(times louder) after the jump]. A 0.35 s jump at each, a slow creep between.
export const BEATS = [
  [0.9, 2.0],     // 100x, 120 dB
  [2.1, 3.0],     // 1,000x, 130 dB: pain; the people nearest you stumble away
  [3.3, 4.0],     // 10,000x, 140 dB: a jet engine
  [4.4, 6.0],     // 1,000,000x, 160 dB: the cafe's glass wall bursts, car alarms
  [6.0, 8.2],     // 1.6e8, 182 dB: windows rain down the street
  [8.6, 9.0],     // 1e9, 190 dB: the loudest sound air can carry; people next to you knocked down
  [11.0, 9.6],    // 196 dB: a shock wave; the pavement cracks under you
  [14.0, 10.2],   // people thrown off their feet
  [17.5, 10.6],   // cars flip, lamp posts bend
  [21.0, 11.0],   // the building next to you blows apart
  [24.5, 11.3],   // across the street, walls cave in
  [28.0, 11.55],  // the whole block
  [31.0, 11.7],
  [34.0, 11.8],   // the towers down the street start to fall
  [37.0, 11.9],
  [40.6, 12.0],   // 1 trillion
];
export const V_TRILLION = 40.6;
export const V_RING = 41.0;                     // one ring at 1 trillion races down the street to the horizon
export const V_BACK = 42.9;                     // its echo off the far towers comes back up the street
export const V_WHITE = 44.6;                    // and hits the camera: hard white
export const V_FILL = V_RING;
export const V_FLASH = V_WHITE - 0.06;
export const T_SWITCH = 46.6;                   // full white since V_WHITE: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const HITS = BEATS.map((b) => b[0]);
const JUMP = 0.35, CREEP = 0.12;
// keys: before frame 0 a slow rise (the loop's lead-in), then the beats
const LK = [[-2, 0.0], [0, 0.15]];
{
  let L = 0.15, t = 0;
  for (const [vb, Lb] of BEATS) {
    // creep two thirds of the way up (the number never stops racing), then jump the rest
    const Lc = L + 0.62 * (Lb - L);
    LK.push([vb, Lc], [vb + JUMP, Lb]);
    L = Lb; t = vb + JUMP;
  }
}
export function logMult(v) {
  if (v <= LK[0][0]) return LK[0][1];
  for (let i = 0; i < LK.length - 1; i++) {
    const [a, x] = LK[i], [b, y] = LK[i + 1];
    if (v <= b) { const k = (v - a) / (b - a); return x + (y - x) * (b - a < 0.5 ? smooth(0, 1, k) : k); }
  }
  return 12;
}
export const multAt = (v) => Math.pow(10, logMult(v));
export const dbAt = (v) => DB0 + 10 * logMult(v);
// peak pressure (Pa) at r metres from your mouth, for log-multiplier L
export const peakPa = (L, r) => 2.874 * Math.pow(10, L / 2) / Math.max(r, 0.3);
// the radius (m) where the peak pressure is p (Pa)
export const radiusAt = (L, p) => 2.874 * Math.pow(10, L / 2) / p;
// the first video time at which L reaches Lt (Infinity if never)
export function timeOfL(Lt) {
  if (Lt <= LK[0][1]) return -2;
  for (let i = 0; i < LK.length - 1; i++) {
    const [a, x] = LK[i], [b, y] = LK[i + 1];
    if (Lt <= y && y > x) {
      let lo = a, hi = b;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (logMult(m) < Lt) lo = m; else hi = m; }
      return hi;
    }
  }
  return Infinity;
}
// when the pressure at r first reaches p
export const timeOfPressure = (p, r) => timeOfL(2 * Math.log10(p * Math.max(r, 0.3) / 2.874));
// damage thresholds (Pa)
export const P_PLATE = 0.12 * PSI, P_WINDOW = 0.25 * PSI, P_KNOCK = 2 * PSI, P_SHOVE = 3 * PSI, P_FLIP = 5 * PSI, P_BLOW = 5 * PSI;

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.4, 4.35, 'A jet engine, 100 feet away.'],
  [4.6, 6.2, 'The glass next to you bursts.'],
  [6.5, 8.4, 'Windows burst up and down the street.'],
  [8.9, 10.8, '190 decibels: the loudest sound air can carry.'],
  [11.2, 13.8, 'Any louder, and it’s not sound anymore. It’s a shock wave.'],
  [14.3, 17.0, 'People are thrown off their feet.'],
  [17.6, 20.4, 'Cars flip. Lamp posts bend.'],
  [21.1, 23.9, 'The building next to you blows apart.'],
  [24.6, 27.4, 'Walls across the street cave in.'],
  [28.1, 30.6, 'The whole block is coming apart.'],
  [31.2, 33.7, 'And you’re still screaming.'],
  [34.3, 37.0, 'Towers down the street start to fall.'],
  [37.6, 40.4, 'Windows break over a mile away.'],
  [41.1, 44.4, '1 trillion times louder: 30 tons of TNT. Every second.'],
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

// ---- the counter: the decibels (label), how many times louder (the racing number), the finish line ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtMult(mult) {
  if (mult < 10) return `${mult.toFixed(1)}x`;
  return `${fmtInt(mult)}x`;
}
export function counterAt(v) {
  const m = multAt(v);
  return { label: `${Math.round(dbAt(v))} DECIBELS · TIMES LOUDER`, value: fmtMult(m), line: '1,000,000,000,000x' };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.L = logMult(v);
  s.mult = Math.pow(10, s.L);
  s.db = DB0 + 10 * s.L;
  // the end: hard white the moment the wave reaches the camera (two frames), held to the loop point
  s.flash = smooth(V_WHITE - 0.035, V_WHITE, v);
  s.fill = smooth(V_FILL, V_WHITE, v);
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp };
