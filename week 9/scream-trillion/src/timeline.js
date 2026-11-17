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
  [1.7, 2.0],     // 100x, 120 dB
  [3.4, 3.0],     // 1,000x, 130 dB: pain
  [5.0, 4.0],     // 10,000x, 140 dB: a jet engine
  [6.6, 6.0],     // 1,000,000x, 160 dB: the shop window next to you bursts, car alarms
  [9.8, 8.0],     // 1e8, 180 dB: the windows across the street
  [13.0, 9.0],    // 1e9, 190 dB: the loudest sound air can carry; people next to you knocked down
  [16.2, 9.6],    // 196 dB: a shock wave
  [19.4, 10.2],   // the crowd thrown down the street, cars shoved, lamps bend
  [22.6, 10.8],   // cars flip; the building beside you torn open
  [25.8, 11.0],   // across the street, walls blow in
  [29.0, 11.4],
  [32.2, 11.7],
  [35.4, 12.0],   // 1 trillion
];
export const V_TRILLION = 35.4;
export const V_FILL = 42.2;                     // the blast fills the frame
export const V_FLASH = 45.0;                    // the white starts
export const T_SWITCH = 47.0;                   // full white: the loop point
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
  [3.15, 4.85, 'It hurts to hear you.'],
  [5.15, 6.45, 'A jet engine, 100 feet away.'],
  [6.95, 9.55, 'The glass next to you bursts.'],
  [10.15, 12.8, 'Windows burst up and down the street.'],
  [13.3, 16.0, '190 decibels: the loudest sound air can carry.'],
  [16.5, 19.2, 'Any louder, and it’s not sound anymore. It’s a shock wave.'],
  [19.7, 22.4, 'Cars flip. People are thrown down the street.'],
  [22.9, 25.6, 'The building next to you blows apart.'],
  [26.1, 28.8, 'Walls across the street cave in.'],
  [29.3, 32.0, 'The whole block is coming apart.'],
  [32.5, 35.2, 'And you’re still screaming.'],
  [36.0, 39.6, '1 trillion times louder: 30 tons of TNT. Every second.'],
  [40.0, 42.4, 'Windows break over a mile away.'],
  [42.8, 44.9, 'Nothing within 250 feet is left standing.'],
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
  s.flash = smooth(V_FLASH, T_SWITCH - 0.05, v);
  s.fill = smooth(V_FILL, T_SWITCH, v);
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp };
