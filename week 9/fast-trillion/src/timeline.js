// "What if you were 1 trillion times faster?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// ONE continuous shot, real time (one video second = one second for you): you sprint down a busy avenue and keep
// getting faster. The counter is how many times faster than walking (3 mph) you are. It can never reach a trillion:
// light speed (670,616,629 mph = 223,538,876x) stops it at 0:40.3.
// Physics used (every beat is checked against the counter):
//   23x  = 70 mph: a cheetah's top speed (frame 0, the cheetah level with you).
//   256x = 767 mph: the speed of sound. From here you drag a shock wave: the energy you push into the air per metre is
//          E' = 1/2 rho CdA v^2 (CdA 0.7 m^2 running upright, 0.15 m^2 once you fly head first), so the air along your
//          path goes off like a line of explosive. Its overpressure at r metres (a line blast, R0 = sqrt(E'/p0)):
//          dp/p0 = 0.25 (R0/r)^0.75 + 0.6 (R0/r)^2, arriving r / 343 s after you pass. Windows break at 0.1-0.5 psi
//          (all of them as you go supersonic), people fall at ~2 psi (from 0:05.7), cars are rocked and shoved, walls blow in
//          at ~5 psi (the near wall from 0:08.9). The blast lasts only milliseconds, so its push (impulse) is small: a car
//          gets ~1 m/s at 0:07, ~5 m/s at 0:10; cars are only thrown once the overpressure tops ~20 psi (lane 1 from ~0:08.6).
//   Mach 6.6 (0:09.5): the air piled up in front of you is 2,800 K = 4,600 F (stagnation temperature): it glows.
//   10 km (0:11): the avenue ends at the sea; at these speeds water can't flow out of your way: you run on it.
//   Your weight: g (1 - v^2 / gR). It falls as you speed up (longer, floatier strides) and is zero at 17,700 mph
//   (5,900x, 0:13.75): orbit speed at the ground. Gravity can't hold you any more: your feet leave the sea. You stay
//   low only by leaning into the air (it pushes down on you, as capsules back from the Moon did at 25,000 mph).
//   You run east, away from the afternoon Sun: it sets behind you at 0:24.8 (3,900 km out) and rises ahead at 0:28.3.
//   1% of light speed (0:25): 1,160 megatons a second (rho A v^3, A = 0.15 m^2) = 23 Tsar Bombas (50 Mt) a second.
//   Around the Earth: first lap at 0:29.5, one lap every 2 s at 0:30, 7.5 laps a second at light speed.
//   70% of light speed (0:37): rho A v (gamma - 1) c^2 = 1.4e24 W, more than the dinosaur asteroid (<= 1.3e24 J) every second.
import { smooth, clamp, lerp, keys } from './util.js';

export const STORY_START = 0;
export const LOOP = 0.85;                 // the white clears onto the first frame over the last LOOP seconds

// ---- physics ----
export const WALK = 1.34112;              // 3 mph (m/s)
export const C = 299792458;
export const SC = C / WALK;               // 223,538,876.5: light speed in "times faster than walking"
export const CS = 343;                    // the speed of sound (m/s)
export const G = 9.81, R_EARTH = 6.371e6;
export const V_ORB = Math.sqrt(G * R_EARTH);  // 7,906 m/s = 17,685 mph
export const LAP = 40075e3;               // once round the Earth (m)
export const P0 = 101325, RHO = 1.2, PSI = 6894.76;

// ---- your speed: log10 of how many times faster than walking, against video time (monotone cubic) ----
const LOGK = [
  [-3, 1.2], [0, Math.log10(23.3)], [1.5, Math.log10(33)], [2.9, Math.log10(77)], [5.0, Math.log10(256)], [7.0, Math.log10(760)],
  [9.6, Math.log10(1750)], [12.0, Math.log10(3600)], [13.8, Math.log10(5900)], [16.5, Math.log10(14000)],
  [19.5, Math.log10(60000)], [22.5, Math.log10(400000)], [25, Math.log10(SC * 0.01)], [28, Math.log10(SC * 0.03)],
  [31, Math.log10(SC * 0.1)], [34, Math.log10(SC * 0.3)], [37, Math.log10(SC * 0.7)], [39, Math.log10(SC * 0.92)],
  [40.3, Math.log10(SC)], [60, Math.log10(SC)],
];
const MC = (() => {
  const n = LOGK.length, x = LOGK.map((k) => k[0]), y = LOGK.map((k) => k[1]);
  const dk = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) dk.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = dk[0]; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (3 * (dk[i - 1] + dk[i])) / ((2 * dk[i] + dk[i - 1]) / dk[i - 1] + (dk[i] + 2 * dk[i - 1]) / dk[i]);
  return { x, y, m };
})();
export function logS(v) {
  const { x, y, m } = MC, n = x.length;
  if (v <= x[0]) return y[0] + m[0] * (v - x[0]);
  if (v >= x[n - 1]) return y[n - 1];
  let i = 0;
  while (v > x[i + 1]) i++;
  const h = x[i + 1] - x[i], t = (v - x[i]) / h, t2 = t * t, t3 = t2 * t;
  return Math.min(Math.log10(SC), (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1]);
}
export const timesAt = (v) => Math.pow(10, logS(v));
export const speedAt = (v) => Math.min(C, timesAt(v) * WALK);          // m/s
export const machAt = (v) => speedAt(v) / CS;
export const growRate = (v) => (logS(v + 0.05) - logS(v - 0.05)) / 0.1; // powers of ten per second
// how much you weigh (1 = normal) on the curved Earth: zero at orbit speed
export const weightAt = (v) => 1 - Math.pow(speedAt(v) / V_ORB, 2);

// ---- distance run (m), from a table integrated once; s(0) = 0 ----
const DT = 1 / 1200, V_A = -4, V_B = 52;
const NT = Math.round((V_B - V_A) / DT) + 1;
const STAB = new Float64Array(NT);
{
  const i0 = Math.round(-V_A / DT);
  for (let i = i0 + 1; i < NT; i++) STAB[i] = STAB[i - 1] + speedAt(V_A + (i - 0.5) * DT) * DT;
  for (let i = i0 - 1; i >= 0; i--) STAB[i] = STAB[i + 1] - speedAt(V_A + (i + 0.5) * DT) * DT;
}
export function distAt(v) {
  const f = clamp((v - V_A) / DT, 0, NT - 1.0001), i = Math.floor(f);
  return STAB[i] + (STAB[i + 1] - STAB[i]) * (f - i);
}
// the video time at which you pass distance s (inverse of distAt)
export function tPass(s) {
  if (s <= STAB[0]) return V_A;
  if (s >= STAB[NT - 1]) return V_B;
  let lo = 0, hi = NT - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (STAB[m] < s) lo = m; else hi = m; }
  return V_A + (lo + (s - STAB[lo]) / (STAB[hi] - STAB[lo])) * DT;
}
export const vAtTimes = (S) => { let lo = -3, hi = 40.3; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (timesAt(m) < S) lo = m; else hi = m; } return (lo + hi) / 2; };

// ---- the blast you drag behind you (see the header) ----
export const CDA_RUN = 0.7, CDA_FLY = 0.15;
export const ePerM = (vel, cda = CDA_RUN) => 0.5 * RHO * cda * vel * vel;          // J per metre
// peak overpressure (Pa) at r metres from your path where you passed it at speed vel (no shock below Mach ~0.95)
export function blastPa(vel, r) {
  const R0 = Math.sqrt(ePerM(vel) / P0), x = R0 / Math.max(r, 0.2);
  return P0 * (0.25 * Math.pow(x, 0.75) + 0.6 * x * x) * smooth(0.93, 1.02, vel / CS);
}
// when the blast reaches a point r metres from your path at distance s along it (video time), and how hard (Pa)
export function blastAt(s, r) {
  const tp = tPass(s);
  return { t: tp + r / CS, pa: blastPa(speedAt(tp), r), tp };
}

// ---- places along the path (m) ----
export const CITY_END = 10000;           // the avenue meets the sea
export const V_SEA = tPass(CITY_END);    // ~11.0 s

// ---- the beats (video time) ----
export const V_SOUND = vAtTimes(CS / WALK);            // 5.0: the sound barrier
export const V_GLOW = vAtTimes(2276 / WALK);           // 9.5: Mach 6.6, the air in front of you glows
export const V_LIFT = vAtTimes(V_ORB / WALK);          // 13.75: you weigh nothing
export const V_1PC = vAtTimes(SC * 0.01);              // 25.0
export const V_LAP1 = tPass(LAP);                      // 29.5: once round the Earth
export const V_C = 40.3;                               // light speed: the counter stops
export const V_SPACE = 40.45;                          // under the slam's white, the camera is out in space
export const T_WHITE = 43.75;                          // full white
export const T_SWITCH = Math.round((T_WHITE + 0.2) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// ---- the Sun: you start at 40 degrees of afternoon Sun behind you and run east, away from it ----
// theta = how far round the Earth from under the Sun (0 = noon overhead, 90 = sunset behind you, 270 = sunrise ahead)
export const THETA0 = 50;
export const thetaAt = (v) => THETA0 + distAt(v) / LAP * 360;
// the Sun's direction in your frame (you run toward -z; +z is behind you, west), straight down the avenue
export function sunDirAt(v, out) {
  const th = thetaAt(v) * Math.PI / 180;
  return out.set(-0.03, Math.cos(th), Math.sin(th)).normalize();
}

// ---- text ----
// the line under the counter: what you're as fast as (times-faster thresholds)
const LINES = [
  [0, 'AS FAST AS A CHEETAH'],
  [77, 'AS FAST AS A RACE CAR'],
  [255, 'AS FAST AS SOUND'],
  [740, 'FASTER THAN A JET OR A BULLET'],
  [1507, 'FASTER THAN ANY PLANE EVER'],
  [5830, 'AS FAST AS THE SPACE STATION'],
  [8264, 'FASTER THAN ANY HUMAN EVER'],
  [22200, 'AS FAST AS EARTH CIRCLES THE SUN'],
  [143333, 'FASTER THAN ANY SPACECRAFT'],
  [SC * 0.01, '1% OF LIGHT SPEED'],
  [SC * 0.1, '10% OF LIGHT SPEED'],
  [SC * 0.5, 'HALF THE SPEED OF LIGHT'],
  [SC * 0.9, '90% OF LIGHT SPEED'],
  [SC * 0.99, '99% OF LIGHT SPEED'],
  [SC * 0.99999999, 'NOTHING GOES FASTER'],
];
export const LINE_TIMES = LINES.map(([S]) => (S <= 23.3 ? -10 : vAtTimes(S)));
export function lineAt(v) {
  const S = timesAt(v);
  let k = 0;
  for (let i = 0; i < LINES.length; i++) if (S >= LINES[i][0] * 0.9999) k = i;
  return { text: LINES[k][1], since: v - LINE_TIMES[k], i: k };
}

// captions: after the title has gone; 'step' = a named step (a hit in the sound)
export const CAPTIONS = [
  { t0: 5.15, t1: 7.0, step: V_SOUND, text: 'The boom smashes every window you pass.' },
  { t0: 9.6, t1: 11.0, step: 9.5, text: 'The air in front of you hits 4,600°F.' },
  { t0: 13.8, t1: 15.6, step: 13.8, text: 'At 17,700 mph you weigh nothing.' },
  { t0: 16.2, t1: 18.2, text: 'Only the air pressing down keeps you low.' },
  { t0: 22.6, t1: 24.95, step: 22.6, text: 'You outrun the Sun. It sets behind you.' },
  { t0: 25.15, t1: 27.6, step: 25.0, text: 'Every second: the blast of 23 of the biggest bombs ever.' },
  { t0: 30.0, t1: 32.4, step: 30.0, text: 'Once round the whole Earth every 2 seconds.' },
  { t0: 33.2, t1: 35.6, text: 'Ahead of you: the fire from your last laps.' },
  { t0: 36.8, t1: 39.6, step: 37.0, text: 'Every second: more than the asteroid that killed the dinosaurs.' },
  { t0: 40.55, t1: 42.0, step: V_C, text: "You'll never be 1 trillion times faster." },
  { t0: 42.1, t1: 43.45, text: 'Your path: one ring of fire round the Earth.' },
];
export const STEPS = CAPTIONS.filter((c) => c.step !== undefined).map((c) => c.step);
export function captionAt(v) {
  for (const c of CAPTIONS) {
    if (v >= c.t0 && v < c.t1) {
      const a = smooth(c.t0, c.t0 + 0.25, v) * (1 - smooth(c.t1 - 0.25, c.t1, v));
      return { text: c.text, alpha: a, rise: (1 - smooth(c.t0, c.t0 + 0.25, v)) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtTimes(S) {
  if (S >= SC * 0.99999999) return `${fmtInt(SC)}x`;
  if (S < 100) return `${S.toFixed(S < 10 ? 1 : 0)}x`;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(S)) - 3));
  return `${fmtInt(Math.round(S / p) * p)}x`;
}
export function counterAt(v) {
  const L = lineAt(v);
  return { label: 'TIMES FASTER', value: fmtTimes(timesAt(v)), line: L.text, lineSince: L.since };
}

// ---- state ----
export function state(v) {
  const s = { v };
  s.lS = logS(v);
  s.S = Math.pow(10, s.lS);
  s.vel = speedAt(v);
  s.mach = s.vel / CS;
  s.dist = distAt(v);
  s.weight = weightAt(v);
  s.title = 1 - smooth(2.7, 3.1, v);
  s.flash = Math.pow(smooth(T_WHITE - 0.6, T_WHITE, v), 1.5);
  // the slam: the counter hits light speed
  s.slam = v >= V_C ? Math.exp(-(v - V_C) / 0.35) : 0;
  s.slamOn = smooth(V_C, V_C + 0.15, v);
  return s;
}
export { clamp, lerp, keys };
