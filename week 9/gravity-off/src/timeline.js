// "What if gravity turned off?" — a time ladder: five stops (5 SECONDS, 1 MINUTE, 10 MINUTES, 1 HOUR, 1 DAY), each the
// same start (gravity off at story time t = 0 in a packed city square, you on the fountain's ledge) played at real speed
// or as a time-lapse up to the moment gravity comes back (t = T), then everything falling from where it got to. A hit
// every 7-9 s; the last stop ends in the Sun's glare (the white the video loops through).
//
// The rule (Nov 21, 2026): gravity is off for everything; the solid Earth is treated as holding its shape (the usual
// what-if rule). Honest note: real rock is squeezed by its own weight and would spring outward at 1 g, so the ground
// would push you up just like gravity and you'd feel nothing at first. Said in CAPTIONS.md, not on screen. The Sun is
// gas: nothing at all holds it, so it blows apart.
// Every number below was checked (scratchpad physics.mjs, inertial frame, 40.7° N):
//   * Nothing floats up by itself. What moves: anything already moving keeps going in a straight line; your push off
//     the ledge (0.8 m/s up); the kid's jump (10 ft/s); cars' suspension springing back (0.4-0.7 m/s); and the Earth
//     turning under everything: the ground moves 352 m/s east on a circle, a loose thing goes straight on, so the ground
//     curves away beneath it: h = sqrt(R² + (352 t)²) - R: 24 cm at 5 s, 35 m at 1 min, 3.5 km at 10 min, 125 km at
//     1 h, 24,700 km at 1 day (plus your own 0.8 m/s).
//     You: 14 ft (5 s), 274 ft (1 min), 2.5 miles (10 min), 79 miles (1 h), 15,400 miles (1 day).
//   * The air: its pressure gradient pushes it up at 1 g; the ground acts like a piston pulling away: ground pressure
//     p = (1 - 0.2 g t / c)^7: 82% at 5 s, 27% at 30 s, 5% and -144 °C at 1 min, nothing from ~3 min (vacuum, black sky).
//     The clouds go with it.
//   * The fountain's jets keep pumping: the 13 m/s central jet is a straight column 816 m tall at 1 min.
//   * The oceans: loose water, lifted like everything else (125 km at this latitude in 1 h) plus the deep water's own
//     spring-back (up to 26 m/s): at 1 h the seas float 125-220 km up over bare sea floors, boiling and freezing in the
//     vacuum (sheets and blobs). At 1 day everything flung off the surface lies on the Earth stretched sideways by
//     sqrt(1 + (wt)^2) = 6.4: a flat cloud 6 times the Earth's width around it.
//   * Falls when gravity returns (vacuum from 10 min on): 1.1 s (5 s), 4.3 s at 91 mph (1 min; the cars hit at
//     87 mph), 30 s at 626 mph (10 min), 2.9 min at 3,500 mph (1 h), 2.8 h at 22,000 mph (1 day).
//   * The Sun: its gas has 2.9e41 J of heat; with no gravity it expands at ~535 km/s (its surface starts at 274 m/s²):
//     about twice as wide after an hour, ~60 times wider after a day (34° across). Past escape speed: when gravity comes
//     back it keeps going. The Moon only drifts 88,000 km in a day (2.6% smaller): not shown.
import { smooth, clamp, lerp } from './util.js';

export const G = 9.81;
export const SPIN = { up: 0.01947, south: 0.01675 };   // the ground dropping away (m/s²), 40.7° N
export const R_E = 6.371e6;
export const OMEGA = 7.2921159e-5;
export const V_ROT = OMEGA * R_E * Math.cos(40.7 * Math.PI / 180);    // 352 m/s
export const T_FOG = 99;                                // (the slow-motion fog is gone)

// gravity comes back at story time T_ON (set per stop; every module reads this live binding)
export let T_ON = 5;
export function setGravityBack(T) { T_ON = T; }

// ---- the stops ----
// knots: [video time, story time] (linear between; 'exp' = exponential); on: video time gravity comes back;
// end: video time this stop hands over (under the impact flash)
export const STOPS = [
  { n: '5', unit: 'SECONDS', T: 5, scene: 'plaza', knots: [[-2, -1.62], [7.2, 7.58]] },
  { n: '1', unit: 'MINUTE', T: 60, scene: 'plaza', knots: [[7.0, 30], [10.6, 60], [16, 65.4]] },
  { n: '10', unit: 'MINUTES', T: 600, scene: 'city', knots: [[14.85, 240], [18.6, 600], [23.7, 629.8]] },
  { n: '1', unit: 'HOUR', T: 3600, scene: 'space', knots: [[23.65, 2400], [27.3, 3600], [31.8, 3771.7]] },
  { n: '1', unit: 'DAY', T: 86400, scene: 'space', knots: [[31.75, 3600], [39.6, 86400, 'exp'], [46.5, 86400 + 1800]] },
];
STOPS.forEach((s, i) => {
  s.i = i;
  s.v0 = s.knots[0][0];
  s.on = i === 0 ? 5 - 0.38 : s.knots[1][0];
});
// hand-over times (each a moment before you'd hit; the last is the white)
STOPS[0].end = 7.0; STOPS[1].end = 14.85; STOPS[2].end = 23.65; STOPS[3].end = 31.75;
export const V_WHITE = 44.8;
STOPS[4].end = V_WHITE;
export const T_SWITCH = Math.round((V_WHITE + 0.6) * 60) / 60;     // full white from V_WHITE: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const STORY_START = 0;

export function stopAt(v) { let i = 0; while (i < STOPS.length - 1 && v >= STOPS[i].end) i++; return i; }
// story time at video time v within stop i
export function tIn(i, v) {
  const K = STOPS[i].knots;
  if (v <= K[0][0]) return K[0][1] + (v - K[0][0]) * (i === 0 ? 1 : 0);
  for (let k = 0; k < K.length - 1; k++) {
    const [a, ta] = K[k], [b, tb, mode] = K[k + 1];
    if (v <= b || k === K.length - 2) {
      const f = (v - a) / (b - a);
      return mode === 'exp' ? ta * Math.pow(tb / ta, f) : ta + (tb - ta) * f;
    }
  }
  return K[K.length - 1][1];
}
export const tOf = (v) => tIn(stopAt(v), v);
// video time at story time t within stop i (inverse of tIn on the knot it falls in)
export function vIn(i, t) {
  const K = STOPS[i].knots;
  for (let k = 0; k < K.length - 1; k++) {
    const [a, ta] = K[k], [b, tb, mode] = K[k + 1];
    if (t <= tb || k === K.length - 2) return mode === 'exp' ? a + (b - a) * Math.log(t / ta) / Math.log(tb / ta) : a + (b - a) * (t - ta) / (tb - ta);
  }
  return K[K.length - 1][0];
}

// a free body near the square (flat ground, the spin as a constant small acceleration; good to <1% up to 10 min):
// at rest or moving with u0 at t = 0 from p0 (x, y, z), weightless until T_ON, then falling; returns position into out
// (and out.vy, out.fall = seconds since gravity came back). The ground (y = floor) stops the fall: out.landed, out.tl.
export function fly(p0, u0, t, out, floor = 0, hs = 0) {
  const tt = Math.max(0, Math.min(t, T_ON));
  out.x = p0[0] + u0[0] * tt;
  out.y = p0[1] + u0[1] * tt + 0.5 * SPIN.up * tt * tt;
  out.z = p0[2] + u0[2] * tt + 0.5 * SPIN.south * tt * tt;
  out.vy = u0[1] + SPIN.up * tt;
  out.landed = false; out.fall = 0; out.tl = Infinity;
  if (t > T_ON) {
    const vy = u0[1] + SPIN.up * T_ON, vz = u0[2] + SPIN.south * T_ON, y5 = out.y;
    const h = y5 - (floor + hs);
    const tl = h > 0 ? (vy + Math.sqrt(vy * vy + 2 * G * h)) / G : 0;
    out.tl = T_ON + tl;
    const tau = Math.min(t - T_ON, tl);
    out.x += u0[0] * tau; out.z += vz * tau;
    out.y = y5 + vy * tau - 0.5 * G * tau * tau;
    out.vy = vy - G * tau;
    out.fall = t - T_ON;
    if (t - T_ON >= tl) { out.landed = true; out.y = floor + hs; }
  }
  return out;
}

// ---- you: on the fountain's south ledge (0.45 m), facing the camera (south) ----
export const LEDGE = 0.45;
export const YOU0 = [0.3, LEDGE, 7.25];
export const YOU_U = [0, 0.8, -0.2];
export const WATER_Y = 0.15;                   // the basin's water surface
const youTmp = {};
export const youAt = (t, out = youTmp) => fly(YOU0, YOU_U, t, out, WATER_Y);
export const T_SPLASH = 6.06;                  // (stop 1) your feet reach the basin's water

// the kid: leaves the ground at t = 0 at 10 ft/s up (a running jump), just in front of you on the camera's right;
// in the first stop he falls 50 ft into the big tree at the edge of the square (its crown catches him)
export const KID0 = [1.75, 0, 8.25];
export const KID_U = [0.93, 3.05, 0.73];
export const KID_TREE = { x: 8.0, z: 13.5, catch: 8.0, rest: 7.4 };
export const T_KIDTREE = 6.69;
const kidTmp = {};
export function kidAt(t, out = kidTmp) {
  fly(KID0, KID_U, t, out, T_ON === 5 ? KID_TREE.catch : 0);
  if (out.landed && T_ON === 5) { const s = t - out.tl; out.y = KID_TREE.catch - (KID_TREE.catch - KID_TREE.rest) * (1 - Math.exp(-s / 0.07)) + 0.12 * Math.exp(-s / 0.12) * Math.sin(s * 40); }
  return out;
}

// ---- your true height (m) above the ground, any stop: a straight line in space, then (gravity back) the fall
// integrated with g = GM/r² in the inertial frame (vacuum) ----
const GM = 3.986004e14;
const LATR = 40.7 * Math.PI / 180;
const FALL = STOPS.map((S) => {
  const r0 = [R_E * Math.cos(LATR), 0, R_E * Math.sin(LATR)], up = [Math.cos(LATR), 0, Math.sin(LATR)], north = [-Math.sin(LATR), 0, Math.cos(LATR)];
  const v = [up[0] * YOU_U[1] + north[0] * -YOU_U[2], V_ROT, up[2] * YOU_U[1] + north[2] * -YOU_U[2]];
  const p0 = r0.map((x, k) => x + up[k] * LEDGE);
  let p = p0.map((x, k) => x + v[k] * S.T), vv = v.slice();
  const dt = S.T < 100 ? 0.01 : S.T < 1000 ? 0.05 : S.T < 5000 ? 0.2 : 2;
  const hs = [];
  for (let k = 0; k < 40000; k++) {
    const r = Math.hypot(...p); hs.push(r - R_E);
    if (r < R_E) break;
    const a = p.map((x) => -GM * x / r ** 3);
    p = p.map((x, j) => x + vv[j] * dt + 0.5 * a[j] * dt * dt);
    const r2 = Math.hypot(...p), a2 = p.map((x) => -GM * x / r2 ** 3);
    vv = vv.map((x, j) => x + 0.5 * (a[j] + a2[j]) * dt);
  }
  return { p0, v, dt, hs };
});
export function heightAt(i, t) {
  const F = FALL[i];
  if (t <= STOPS[i].T) {
    const tt = Math.max(0, t), p = F.p0.map((x, k) => x + F.v[k] * tt);
    return Math.max(0, Math.hypot(...p) - R_E);
  }
  const u = (t - STOPS[i].T) / F.dt, k = Math.min(F.hs.length - 2, Math.floor(u));
  return Math.max(0, lerp(F.hs[k], F.hs[k + 1], clamp(u - k)));
}
// (the first stop: your height above the ledge, from the scene itself)
export const heightNow = (v) => { const i = stopAt(v), t = tIn(i, v); return i === 0 ? Math.max(0, youAt(t).y - LEDGE) : heightAt(i, t); };

// ---- the air: ground-level pressure (fraction) t seconds after gravity went off, and back once it returns ----
export function airAt(t, T) {
  const k = (tt) => Math.max(0, 1 - 0.2 * G * Math.max(0, tt) / 343) ** 7;
  return t <= T ? k(t) : k(T);
}

// ---- the Sun's radius (in its own radii) as seen t seconds after gravity went off (light takes 499 s) ----
export function sunRadius(t) {
  const s = Math.max(0, t - 499), td = 1950;           // its surface starts at 274 m/s², coasting to 535 km/s
  return 1 + 535e3 * (s - td * (1 - Math.exp(-s / td))) / 6.957e8;
}

// ---- text ----
// captions (never more than one; none while the title is up)
export const CAPTIONS = [
  [3.0, 4.55, 'That kid jumped. Nothing slows him now.'],
  [4.75, 6.85, 'Gravity’s back. You drop 14 feet.'],
  [7.35, 10.4, 'The air is rushing off into space. It’s -140 °C.'],
  [10.8, 14.5, 'Gravity’s back. The cars hit the street at 87 mph.'],
  [15.2, 18.4, 'The air is gone. The sky is black at noon.'],
  [18.8, 23.3, 'Gravity’s back. You fall for 30 seconds.'],
  [24.0, 27.1, 'You’re in space. The oceans have lifted off the sea floor.'],
  [27.5, 31.4, 'Gravity’s back. You and the oceans fall for 3 minutes.'],
  [32.1, 35.2, 'Nothing holds the Sun together either. It’s swelling.'],
  [35.9, 39.5, 'The seas are flung off into a flat cloud 6 times wider than Earth.'],
  [40.0, 43.8, 'Gravity’s back. Too late for the Sun.'],
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
// the one line under the picker: how high you are
const FT = 3.28084, MI = 1609.344;
const comma = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function lineAt(v) {
  const h = heightNow(v);
  let s;
  if (h * FT < 9.95) s = `${(h * FT).toFixed(1)} FT`;
  else if (h < 0.95 * MI) s = `${comma(h * FT)} FT`;
  else if (h < 9.95 * MI) s = `${(h / MI).toFixed(1)} MILES`;
  else s = `${comma(h / MI)} MILES`;
  return `YOU: ${s} UP`;
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  const i = stopAt(v), S = STOPS[i];
  s.i = i; s.stop = S; s.scene = S.scene;
  s.t = tIn(i, v);
  s.T = S.T;
  s.off = s.t >= 0 && s.t < S.T ? 1 : 0;
  s.since = v - (i === 0 ? -10 : STOPS[i - 1].end);            // video seconds since this stop began
  // the picker: cursor on this stop, sliding over from the last one as it hands over
  s.cursor = i + (i < STOPS.length - 1 ? smooth(S.end - 0.15, S.end + 0.2, v) : 0);
  s.snap = i === 0 ? 0 : Math.exp(-Math.max(0, s.since) / 0.15) * smooth(-0.02, 0.02, s.since);
  s.fill = clamp(s.t / S.T);                                     // how much of the time is up
  s.back = s.t >= S.T ? smooth(S.T, S.T + Math.max(0.15, (S.T - (i === 0 ? 0.38 : S.knots[0][1])) * 0), s.t) : 0;
  s.backPulse = s.t >= S.T ? Math.exp(-(v - S.on) / 0.35) : 0;
  // the impact flash at each hand-over (white), and the last white (the Sun's glare)
  let fl = 0;
  for (let k = 0; k < STOPS.length - 1; k++) { const e = STOPS[k].end; fl = Math.max(fl, smooth(e - 0.12, e, v) * (1 - smooth(e + 0.02, e + 0.45, v))); }
  s.impact = fl;
  s.flash = smooth(V_WHITE - 1.6, V_WHITE, v);
  s.title = 1 - smooth(2.4, 2.8, v);
  s.air = airAt(s.t, S.T);
  return s;
}
export { lerp };
