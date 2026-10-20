// "What if every jump went twice as high?" — the story as functions of VIDEO time v (seconds).
// You are on Brickell Avenue in Miami at dusk. Jump n goes 2^n ft high (jump 1: 2 ft), straight up and back down
// to the same spot. You can't get hurt; everything else can. The physics per jump (no air drag, real gravity
// falling off with height, 70 kg of you):
//   takeoff speed v = sqrt(2GM(1/R - 1/(R+h))): 990 mph at jump 15 (past the speed of sound), 3,900 mph at 19 (space)
//   you land as fast as you left: landing energy = 1/2 m v^2 (jump 20: 50 kg of TNT; jump 28 on: ~1 ton)
//   time in the air: radial Kepler fall (jump 15: 1.5 min, jump 27: 10 h, jump 29: 2.8 days, jump 30: 7.8 days)
// Jump 30 reaches 203,000 miles (the Moon is ~234,000 miles away surface to surface); jump 31 would go 406,000
// miles, so it hits the Moon (overhead: Miami is far enough south for the Moon to pass straight overhead).
// Video time runs much faster than story time in the air (a time-lapse); each bounce (a landing that is also the
// next takeoff) is the beat: a blast, a crater, and everything around it torn up a little more.
import { smooth, clamp, lerp, keys } from './util.js';

export const STORY_START = 0;
export const FT = 0.3048;
export const GM = 3.986e14, R_E = 6.371e6, MASS = 70;
export const N_FIRST = 6, N_LAST = 31;
export const heightOf = (n) => Math.pow(2, n) * FT;                  // m
export const speedOf = (n) => Math.sqrt(2 * GM * (1 / R_E - 1 / (R_E + heightOf(n))));   // m/s
export const mphOf = (n) => speedOf(n) * 2.23694;
export const tntOf = (n) => 0.5 * MASS * speedOf(n) ** 2 / 4.184e6;  // kg of TNT
export function airTimeOf(n) {                                         // s, up and down (radial Kepler)
  const r1 = R_E + heightOf(n), x = R_E / r1;
  return 2 * Math.sqrt(r1 ** 3 / (2 * GM)) * (Math.sqrt(x * (1 - x)) + Math.acos(Math.sqrt(x)));
}
export const MOON_D = 384400e3 - R_E - 1737e3;                        // m, surface to surface (overhead)
export const MOON_R = 1737e3;

// how long each jump lasts on screen (s); the first one started before frame 0
const DUR = { 6: 1.8, 7: 1.8, 8: 1.9, 9: 1.9, 10: 2.0, 11: 2.0, 12: 2.1, 13: 2.1, 14: 2.2, 15: 2.8, 16: 2.2, 17: 2.2, 18: 2.3,
  19: 3.0, 20: 2.4, 21: 2.4, 22: 2.5, 23: 2.5, 24: 2.5, 25: 2.6, 26: 2.6, 27: 2.6, 28: 2.7, 29: 2.7, 30: 3.0, 31: 4.0 };
export const JUMPS = [];
{
  let t = -0.6;
  for (let n = N_FIRST; n <= N_LAST; n++) {
    const H = n === N_LAST ? MOON_D : heightOf(n);
    // how long you stay crouched in the crater before the next launch (so the damage can be seen)
    const dw = n < 8 ? 0 : n < 12 ? 0.12 : n < 19 ? 0.3 : n < N_LAST ? 0.5 : 0.55;
    JUMPS.push({ n, t0: t, d: DUR[n], dw, H, mph: mphOf(n), tnt: tntOf(n), air: airTimeOf(n) });
    t += DUR[n];
  }
}
const LAST = JUMPS[JUMPS.length - 1];
export const V_MOON = LAST.t0 + 3.55;          // you hit the Moon
export const T_SWITCH = V_MOON + 0.6;          // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const jumpOf = (n) => JUMPS[n - N_FIRST];
export const V_SOUND = jumpOf(15).t0;          // the first takeoff faster than sound
export const V_SPACE = jumpOf(19).t0;
export const V_HOT = jumpOf(19).t0 + jumpOf(19).d;   // the first landing as a fireball

// ---- the bounces: each landing (and the takeoff that follows it) ----
// Blast radii from the landing energy (TNT scaling, R ~ Y^(1/3)); crater radius builds up over the hits.
// Every hit also counts for the ones before it: windows, cars and buildings near the middle fail first.
export const BOUNCES = [];
{
  let crater2 = 0;
  for (const j of JUMPS) {
    if (j.n === N_LAST) break;
    const nx = jumpOf(j.n + 1);
    const Y = j.tnt;                              // kg TNT
    const c = Math.cbrt(Math.max(Y, 1e-6));
    crater2 += Math.pow(0.55 * c + 0.15, 2);
    const b = {
      n: j.n, v: j.t0 + j.d, Y, mph: j.mph, upMph: nx.mph,
      crater: Math.min(Math.sqrt(crater2), 16),     // m, radius after this hit
      depth: 0,
      crack: 1.5 + 4.5 * c,          // m, the cracked/torn ground around it
      glass: Math.max(0, 26 * c - 4),                // m, windows break inside this
      cars: Math.max(0, 9 * c - 1.5), // m, cars thrown inside this
      knock: 12 * c + 4,     // m, people knocked down / pushed inside this
      fell: j.n >= 22 ? 3.6 * c : 0,                // m, buildings collapse inside this (with the earlier hits)
      hot: j.n >= 19 ? smooth(18.5, 24, j.n) : 0,   // came back as a fireball: white-hot crater, fires
      boom: nx.mph > 767,                           // the next takeoff breaks the sound barrier
      ring: 22 + 18 * c,                             // m, how far the dust/shock ring runs
    };
    b.depth = b.crater * 0.42;
    BOUNCES.push(b);
  }
}
export const lastBounce = (v) => { let b = null; for (const x of BOUNCES) if (x.v <= v) b = x; return b; };
export const bounceOf = (n) => BOUNCES.find((b) => b.n === n);

// ---- where you are ----
// Altitude follows a parabola in log space (log(1 + y / Y0)): a hard launch, a long hang at the top, a plunge.
const Y0 = 12;
export function jumpAt(v) {
  let j = JUMPS[0];
  for (const x of JUMPS) if (v >= x.t0) j = x;
  return j;
}
export function altitude(v) {
  const j = jumpAt(v);
  const p = clamp((v - j.t0 - j.dw) / (j.d - j.dw), 0, 1);
  if (j.n === N_LAST) {
    // the last one never comes down: a long climb that speeds up into the Moon
    // the distance left to the Moon shrinks on a log scale: the Moon grows steadily, the surface rushes up at the end
    const k = clamp((v - j.t0 - j.dw) / (V_MOON - j.t0 - j.dw), 0, 1);
    const dM = Math.exp(lerp(Math.log(MOON_D), Math.log(1.5), Math.pow(k, 1.9))) - 1.5;
    return MOON_D - dM;
  }
  const U = Math.log(1 + j.H / Y0);
  const f = 1 - Math.pow(1 - 2 * p, 2);
  return Y0 * (Math.exp(U * f) - 1);
}
// phase of the current jump: 0 takeoff .. 0.5 top .. 1 landing; plus up/down speed in log space for streaks
// (p is the flight's phase: it waits at 0 while you crouch in the crater)
export function phaseAt(v) { const j = jumpAt(v); return { j, p: clamp((v - j.t0 - j.dw) / (j.d - j.dw), 0, 1), dwell: v < j.t0 + j.dw }; }

// ---- captions (video time) ----
const cap = (n, text, a = 0.25, b = -0.15) => { const j = jumpOf(n); return [j.t0 + a, j.t0 + j.d + b, text]; };
export const CAPTIONS = [
  cap(8, 'You can’t get hurt. Miami can.', 0.9),
  cap(9, 'You come down at 124 mph.'),
  cap(10, 'The ground cracks under you.'),
  cap(11, 'Every landing digs a crater.'),
  cap(12, 'Higher than the tallest building on Earth.'),
  cap(13, 'You punch through the clouds.'),
  cap(14, 'You leave the ground at 700 mph.'),
  cap(15, 'Faster than sound. Every window on the street explodes.'),
  cap(16, 'The sky above you goes dark.'),
  cap(17, 'The shockwave throws cars like toys.'),
  cap(18, 'Higher than any plane can fly.'),
  cap(19, 'You reach space. You come back as a fireball.'),
  cap(20, 'Each landing hits like 100 lb of TNT.'),
  cap(21, 'Higher than the Space Station.'),
  cap(22, 'You hit the ground at 10,000 mph.'),
  cap(23, 'The buildings around you start to fall.'),
  cap(24, 'Your street is now a crater.'),
  cap(25, 'You can see the whole planet.'),
  cap(26, 'Past the GPS satellites.'),
  cap(27, 'You’re in the air for 10 hours.'),
  cap(28, 'Every landing: a ton of TNT.'),
  cap(29, 'You’re in the air for 3 days.'),
  cap(30, 'You almost reach the Moon.'),
  [jumpOf(31).t0 + 0.3, V_MOON - 0.15, 'Jump 31 would go 406,000 miles. The Moon is in the way.'],
];

export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: the height of this jump, racing up while you rise ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtHeight(m) {
  const ft = m / FT;
  if (ft < 5280) return `${fmtInt(ft)} ft`;
  const mi = ft / 5280;
  return mi < 10 ? `${mi.toFixed(1)} miles` : `${fmtInt(mi)} miles`;
}
const fmtAir = (s) => s < 60 ? `${Math.round(s)} SECONDS` : s < 3600 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)} MINUTES`
  : s < 86400 * 1.5 ? `${(s / 3600).toFixed(1)} HOURS` : `${(s / 86400).toFixed(1)} DAYS`;
const NOTES = {
  6: 'A 6-STORY BUILDING', 7: 'A 12-STORY BUILDING', 8: 'A 25-STORY TOWER', 9: 'A 50-STORY TOWER',
  10: 'ALMOST THE EIFFEL TOWER', 12: 'HIGHER THAN THE BURJ KHALIFA', 13: 'ABOVE THE CLOUDS',
  15: 'HIGHER THAN EVEREST', 16: 'TWICE AS HIGH AS AIRLINERS', 17: 'THE RECORD SKYDIVE', 18: 'HIGHER THAN ANY PLANE',
  19: 'SPACE', 21: 'ABOVE THE SPACE STATION', 25: 'MORE THAN EARTH IS WIDE', 26: 'PAST THE GPS SATELLITES',
  27: 'PAST EVERY TV SATELLITE', 30: '87% OF THE WAY TO THE MOON',
};
// height shown: last jump's height, racing to this one's while you rise
export function shownHeight(v) {
  const { j, p } = phaseAt(v);
  const prev = j.n === N_FIRST ? heightOf(N_FIRST - 1) : jumpOf(j.n - 1).H;
  if (j.n === N_LAST) return Math.min(altitude(v), MOON_D);
  const k = clamp(p / 0.5);
  return Math.exp(lerp(Math.log(prev), Math.log(j.H), 1 - Math.pow(1 - k, 2)));
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: '',
    labelFn: (v) => `JUMP ${jumpAt(v).n} OF ${N_LAST}`,
    fmt: (m) => fmtHeight(m),
    value: (v) => shownHeight(v),
    unit: (v) => { const j = jumpAt(v); if (j.n === N_LAST) return 'STRAIGHT AT THE MOON'; return NOTES[j.n] || `IN THE AIR ${fmtAir(j.air)}`; },
    badge: () => 'JUMP 31: YOU HIT THE MOON',
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  const { j, p, dwell } = phaseAt(v);
  s.j = j; s.n = j.n; s.p = p; s.dwell = dwell;
  s.y = altitude(v);
  s.bounce = lastBounce(v);
  s.sinceB = s.bounce ? v - s.bounce.v : 99;
  // you glow coming back into the air from space (and leaving at hypersonic speed)
  const fast = smooth(16, 20, j.n);
  s.reentry = j.n >= 19 && j.n < N_LAST && p > 0.5 ? smooth(140e3, 70e3, s.y) * (1 - smooth(0.988, 1, p)) * smooth(18.5, 21, j.n) : 0;
  s.launchGlow = j.n >= 16 && !dwell ? fast * (1 - smooth(0.0, 0.12, p)) : 0;
  s.title = 1 - smooth(3.0, 3.8, v);
  s.flash = smooth(V_MOON - 0.05, T_SWITCH - 0.1, v);
  s.flashColor = '#fffaf2';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
