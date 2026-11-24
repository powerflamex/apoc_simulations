// "What if it rained 1 trillion times harder?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// 1x = 0.1 inch of rain an hour (a light rain). The water rises as fast as the rain falls (we follow the level, not
// where it runs off to): rise = 0.1 in/h x m = 7.06e-7 m/s x m.
//   1,000x       100 in an hour                      10,000x   83 ft an hour
//   1,000,000x   2.3 ft a second: all the oceans' water (1.335 billion km³ over 510 million km²) in 1.03 hours
//   1 billion x  1,580 mph: a whole ocean every 3.7 s, Everest (8,849 m) covered in 12.5 s
//   1 trillion x 438 miles (706 km) a second: 3.6e23 kg of new water a second, one Earth's mass (5.97e24 kg) every
//                16.6 s; it would reach the Moon (384,400 km) in 8.9 minutes
// The counter runs in REAL TIME (one video second = one second), so the depth on screen is the honest sum of the
// rain so far. That is why it starts at 100,000x: at 1,000x the water rises an inch a minute, too slow to ride up a
// street in seconds. Times when things go under come from that sum (depthAt / vAtDepth), never typed in by hand.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FT = 0.3048, IN = 0.0254, MI = 1609.344;
export const R1 = 0.1 * IN / 3600;                 // m/s of rise at 1x
export const D0 = 2 * FT;                           // the water at frame 0: 2 ft (the street has been filling)

// ---- the counter: log10 of "times harder" at video time v (monotone cubic through keys) ----
const KEYS = [[-4, 4.62], [0, 5], [10, 6], [17, 7], [23, 8], [29, 9], [33, 10.75], [35.6, 12], [37, 12], [60, 12]];
const KX = KEYS.map((k) => k[0]), KY = KEYS.map((k) => k[1]);
const KM = (() => {                                  // Fritsch-Carlson slopes: never overshoots
  const n = KX.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((KY[i + 1] - KY[i]) / (KX[i + 1] - KX[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
})();
export const V_TRILLION = 35.6;
export function logM(v) {
  if (v >= V_TRILLION) return 12;
  if (v <= KX[0]) return KY[0] + KM[0] * (v - KX[0]);
  let i = 0;
  while (i < KX.length - 2 && v > KX[i + 1]) i++;
  const h = KX[i + 1] - KX[i], t = clamp((v - KX[i]) / h), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * KY[i] + (t3 - 2 * t2 + t) * h * KM[i] + (-2 * t3 + 3 * t2) * KY[i + 1] + (t3 - t2) * h * KM[i + 1];
}
export const timesAt = (v) => Math.pow(10, logM(v));
export const riseAt = (v) => R1 * timesAt(v);        // m/s

// ---- the depth: the rain summed up (table at 1/240 s from -4 s to 60 s) ----
const TV0 = -4, TDT = 1 / 240, TN = Math.round((60 - TV0) / TDT) + 1;
const DT = new Float64Array(TN);
{
  const i0 = Math.round(-TV0 / TDT);
  DT[i0] = D0;
  for (let i = i0 + 1; i < TN; i++) { const v = TV0 + (i - 0.5) * TDT; DT[i] = DT[i - 1] + riseAt(v) * TDT; }
  for (let i = i0 - 1; i >= 0; i--) { const v = TV0 + (i + 0.5) * TDT; DT[i] = Math.max(0.05, DT[i + 1] - riseAt(v) * TDT); }
}
export function depthAt(v) {
  const x = (v - TV0) / TDT;
  if (x <= 0) return DT[0];
  if (x >= TN - 1) return DT[TN - 1];
  const i = Math.floor(x), k = x - i;
  return DT[i] * (1 - k) + DT[i + 1] * k;
}
// the water line the local scene is drawn at: the true depth, held at 40 km once only sea and black sky are left in
// view (past ~33 s), so the bus, you and the camera never sit thousands of km up (float precision)
export const LCAP = 40000;
export const levelR = (v) => Math.min(depthAt(v), LCAP);
export function vAtDepth(h) {
  let a = TV0, b = 59.9;
  for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (depthAt(m) < h) a = m; else b = m; }
  return (a + b) / 2;
}

// ---- the places and heights (m) ----
export const BUS_ROOF = 3.15;                       // the bus roof above the street
export const BUS_FLOAT = 2.3;                       // the depth at which the bus lifts off (doors shut, mostly air)
export const TOWER_H = 400;                         // the city's tallest tower (to the roof deck)
export const SUMMIT_H = 2300;                       // the mountain 5 km beyond the city (on a 600 m upland)
export const UPLAND_H = 600;                        // the upland at its foot
export const TOWN_H = 860;                          // the town on a terrace on its lower slope
export const EVEREST_H = 8849;
export const SPACE_H = 100e3;                       // where space begins
export const V_BUS = vAtDepth(BUS_FLOAT);
export const V_ROOFS = vAtDepth(24);                // the avenue's roofs (18-40 m) go under round here
export const V_TOWER = vAtDepth(TOWER_H);
export const V_TOWN = vAtDepth(TOWN_H + 8);           // the town on the mountain goes under
export const V_SUMMIT = vAtDepth(SUMMIT_H);
export const V_EVEREST = vAtDepth(EVEREST_H);
export const V_SPACE = vAtDepth(SPACE_H);
export const V_MILLION = 10, V_BILLION = 29;
// the camera leaves you for space, the ball swells, the dive back, the wall of water, the white
export const V_OUT = V_TRILLION;                    // pull-out starts on the 1 trillion beat
export const V_DIVE = 43.75;                        // the camera dives back toward you (in space)
export const V_CUT2 = 44.7;                         // flash cut: back to you on the bus roof, the falling water above
export const V_LAND = V_CUT2;
// the two cut-aways: the last climbers on the mountain's summit, and the Himalaya (Everest the last land on Earth)
export const V_SC0 = 28.55, V_SC1 = 29.85;
export const V_EC0 = 30.4;
export const V_EC1 = 31.68;
export const V_WHITE = 46.55;                       // the falling water hits the lens: full white
export const T_SWITCH = 47.0;                       // the loop point (inside the white)
export const LOOP = 0.85;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// ---- popups (a phrase, never a number) at the moments things go under; each also gets a hit in the soundtrack ----
export const BEATS = [
  { v: V_BUS, say: 'THE BUS FLOATS' },
  { v: V_ROOFS, say: 'THE ROOFS GO UNDER' },
  { v: V_TOWER, say: 'THE TALLEST TOWER GOES UNDER' },
  { v: V_SUMMIT - 0.35, say: 'THE MOUNTAIN GOES UNDER' },
  { v: V_EVEREST - 0.55, say: 'EVEREST GOES UNDER' },
  { v: V_SPACE, say: 'THE WATER REACHES SPACE' },
];
export const POP = 1.6;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}
// the counter's big steps (a jolt + boom): 1 million, 1 billion, 1 trillion
export const STEPS = [V_MILLION, V_BILLION, V_TRILLION];

// ---- captions (never with a popup; none while the title is up) ----
export const CAPTIONS = [
  [3.15, 5.55, 'Two feet of water floats a car.'],
  [5.75, 8.05, 'Get onto something tall.'],
  [10.4, 12.7, 'Enough to fill every ocean in an hour.'],
  [12.9, 15.6, 'You float past their windows.'],
  [18.6, 21.6, 'You rise 6 floors every second.'],
  [21.8, 24.6, 'Boats are lifted as fast as you.'],
  [26.5, 28.45, 'It shoves you up so hard you weigh 10 times more.'],
  [37.3, 40.1, 'Every 17 seconds, the new water outweighs the Earth.'],
  [40.5, 43.3, 'It would reach the Moon in 9 minutes.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.25), fadeOut = clamp((b - v) / 0.25);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter and its one line ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtDepth(m) {
  const ft = m / FT;
  if (ft < 10) return `${ft.toFixed(1)} FT`;
  if (ft < 30000) return `${fmtInt(ft)} FT`;
  const mi = m / MI;
  return mi < 10 ? `${mi.toFixed(1)} MILES` : `${fmtInt(mi)} MILES`;
}
export function fmtRise(ms) {
  const fps = ms / FT;
  if (fps < 10) return `${fps.toFixed(1)} FT A SECOND`;
  const mph = ms * 3600 / MI;
  if (mph < 100) return `${fmtInt(fps)} FT A SECOND`;
  if (mph < 3600) return `${fmtInt(mph)} MPH`;
  const mps = ms / MI;
  return mps < 10 ? `${mps.toFixed(1)} MILES A SECOND` : `${fmtInt(mps)} MILES A SECOND`;
}
export function counterAt(v) {
  const value = v >= V_TRILLION - 1e-6 ? '1,000,000,000,000x' : `${fmtInt(timesAt(v))}x`;
  const line = v < V_MILLION ? `WATER: ${fmtDepth(depthAt(v))} DEEP` : `RISING ${fmtRise(riseAt(v))}`;
  return { label: 'TIMES HARDER', value, line };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.L = logM(v);
  s.depth = depthAt(v);
  s.level = Math.min(s.depth, LCAP);
  s.rise = riseAt(v);
  s.title = 1 - smooth(2.6, 3.0, v);
  // lightning: at frame 0 (with the scream), at each step, and a few in between
  s.bolt = 0; s.boltV = -99;
  for (const x of [-0.25, 2.2, 6.6, ...STEPS, 13.8, 19.5, 23.2, V_TOWER, V_SUMMIT]) {
    if (v >= x - 0.02 && v - x < 1.3) { const b = boltCurve(v - x + 0.02); if (b > s.bolt) { s.bolt = b; s.boltV = x; } }
  }
  s.white = smooth(V_WHITE - 0.12, V_WHITE, v);
  return s;
}
// a lightning flash: a bright first stroke, a dimmer restrike, a fading glow
export function boltCurve(dt) {
  if (dt < 0) return 0;
  return Math.exp(-dt / 0.05) * smooth(0, 0.012, dt) + 0.55 * Math.exp(-Math.pow((dt - 0.16) / 0.04, 2)) + 0.25 * Math.exp(-dt / 0.35) * smooth(0, 0.05, dt);
}
export { lerp, smooth, clamp };
