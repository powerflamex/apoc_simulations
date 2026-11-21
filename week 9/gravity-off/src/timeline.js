// "What if gravity turned off for 5 seconds?" — the story as functions of VIDEO time v (seconds).
// One packed city square, the 5 seconds shown in slow motion (8x): STORY time t = T0 + v / SLOW, where t = 0 is the
// moment gravity switches off and t = 5 the moment it comes back. Frame 0 is t = 0.38 s (the counter reads 4.62).
//
// The rule (Nov 21, 2026): gravity is off for everything ON the Earth; the planet itself holds its shape (the usual
// what-if rule). Honest note: a real planet is squeezed by its own weight, so without gravity its rock would spring
// outward and keep pushing up on everything at exactly 1 g for these 5 seconds (you'd feel nothing). That's said in
// CAPTIONS.md, not on screen.
// Every number below was checked:
//   Nothing floats up by itself: with no weight and no push, a thing at rest stays at rest. What moves:
//   * Anything already moving keeps going in a straight line (no more pull down). A kid's jump that leaves the ground
//     at 10 ft/s (3.05 m/s: a 1.6 ft / 0.47 m jump) is 50 ft (15.3 m) up after 5 s.
//   * People are pushed off by their own legs: the muscles that held them up push the same as before, now against
//     nothing (a startle push: ~0.2-0.8 m/s; walkers and runners carry their stride's lift: ~0.4-1.3 m/s).
//     You stepped up onto the fountain's ledge: 0.8 m/s up, leaning back 0.2 m/s -> 14 ft up at 0.00.
//   * The Earth turns under everything: the ground follows a circle (0.0257 m/s² toward the axis at 40.7° N: New York's
//     latitude); a free thing goes straight on, so the ground drops away from it: 0.0195 m/s² up and 0.0168 m/s²
//     toward the equator -> 24 cm up and 21 cm south in 5 s, for everything loose, even what lay still.
//   * Springs let go: anything that sagged under its own weight springs back at about sqrt(g x sag): a car's suspension
//     (15 cm) throws the car up at ~0.4-0.7 m/s (dampers take some); a tree's branches (10-30 cm) whip up at ~1-1.7 m/s
//     and shake loose leaves (November) away; string lights with 0.6 m of sag snap straight and bounce (period 1.4 s).
//   * Tires grip by being pressed down: no weight, no grip. A moving car can't steer, brake or stop.
//   * Water: held in by air pressure like a suction cup (air can't get under it), so a pool does NOT leave as one ball.
//     What moves is what was moving: waves keep growing (crests rise, troughs sink), and the pool's floor springing
//     back (the slab sags ~1.5 cm under the water) pushes the middle up: a mound rising ~0.3 m/s with the water at the
//     sides draining into it. Splashes and the fountain's jets go on in straight lines: the central jet (13 m/s) is a
//     column 65 m tall at 0.00; drops splashed up from the basin keep rising.
//   * The air: nothing holds it down, so it rises off the planet. Near the ground it barely moves (6 cm/s at head
//     height: no wind), but the pressure falls from the ground up at rho x g x c = 1.2 x 9.81 x 343 = 4,040 Pa every
//     second: -20% (like 6,000 ft up) after 5 s. Your ears pop. Rising air cools (-19 °C at -20%): on a 25 °C day with
//     45% humidity the water in the air condenses at -17.6% (4.4 s): fog.
//   * Birds flapping: every downstroke now lifts them with nothing pulling back: they shoot up.
//   * 0.00: gravity is back. Everything falls from where it got to: you from 15 ft (1.06 s), the cars from ~2-3 m,
//     the pool's mound collapses (0.55 s) and slops over its glass front, the kid from 50 ft (2.1 s: after the end).
import { smooth, clamp, lerp } from './util.js';

export const G = 9.81;
export const SLOW = 6.5;                       // video seconds per story second, up to 0.00
export const SLOW2 = 5;                        // ... and after it (everything falling)
export const T0 = 0.38;                        // story time at frame 0
export const T_ON = 5;                         // gravity back
export const SPIN = { up: 0.01947, south: 0.01675 };   // the ground dropping away (m/s²), 40.7° N
export const AIR_DP = 1.2 * G * 343;           // ground-level pressure drop (Pa/s) while gravity is off
export const T_FOG = 4.4;                      // story time the fog starts to form

export const V_ZERO = (T_ON - T0) * SLOW;      // 0.00 on the counter (~0:30)
export const tOf = (v) => (v < V_ZERO ? T0 + v / SLOW : T_ON + (v - V_ZERO) / SLOW2);   // story time at video time v
export const vOf = (t) => (t < T_ON ? (t - T0) * SLOW : V_ZERO + (t - T_ON) * SLOW2);   // video time at story time t

// a free body: at rest or moving with u0 at t = 0 from p0 (x, y, z), weightless until T_ON, then falling; returns
// position into out (and out.vy, out.fall = seconds since gravity came back). The ground (y = floor) stops the fall:
// out.landed, out.tl (story time it landed).
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
// when your feet reach the basin's water
export const T_SPLASH = fly(YOU0, YOU_U, 9, {}, WATER_Y).tl;      // ~6.06
export const V_SPLASH = vOf(T_SPLASH);                             // ~35.3
// the last beat: the fountain's big jet (a 65 m column at 0.00, still rising at 13 m/s) comes down on the fountain from
// 2.65 s after 0.00; its spray over the lens is the white
export const T_CRASH = 7.68;
export const V_CRASH = vOf(T_CRASH);
export const V_WHITE = vOf(7.95);                                  // the spray has covered the lens (~44.8)
export const T_SWITCH = Math.round((V_WHITE + 0.6) * 60) / 60;     // full white from V_WHITE: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;              // (both on the 1/60 s frame grid)
export const STORY_START = 0;

// the kid: leaves the ground at t = 0 at 10 ft/s up (a running jump: 1.2 m/s forward), just in front of you on the
// camera's right; at 0.00 he's 50 ft up and falls into the big tree at the edge of the square (its crown catches him)
export const KID0 = [1.75, 0, 8.25];
export const KID_U = [0.93, 3.05, 0.73];
export const KID_TREE = { x: 8.0, z: 13.5, catch: 8.0, rest: 7.4 };   // his feet reach the crown's top at 8 m; its branches give 0.6 m
const kidTmp = {};
export const T_KIDTREE = fly(KID0, KID_U, 12, {}, KID_TREE.catch).tl;   // ~6.7
export function kidAt(t, out = kidTmp) {
  fly(KID0, KID_U, t, out, KID_TREE.catch);
  if (out.landed) { const s = t - out.tl; out.y = KID_TREE.catch - (KID_TREE.catch - KID_TREE.rest) * (1 - Math.exp(-s / 0.07)) + 0.12 * Math.exp(-s / 0.12) * Math.sin(s * 40); }
  return out;
}

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.0, 6.4, 'That kid jumped at 10 feet a second. Nothing slows him now.'],
  [9.7, 13.1, 'He grabbed the rim. Everyone else keeps rising.'],
  [15.9, 19.3, 'No weight, no grip. The cars can’t steer or stop.'],
  [20.6, 23.6, 'The air is rising off the planet too. Your ears pop.'],
  [24.4, 27.8, 'The rooftop pool’s water heaves up over the roof.'],
  [30.3, 32.9, 'Gravity is back. Everything falls at once.'],
  [35.7, 38.3, 'You drop 15 feet, into the fountain.'],
  [39.0, 41.6, 'The kid falls 50 feet, into a tree.'],
  [41.9, 44.3, 'The pool pours off the roof.'],
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

// ---- the counter: seconds until gravity comes back (racing in hundredths), and how high you are ----
const FT = 3.28084;
export function counterAt(v) {
  const t = tOf(v);
  const left = Math.max(0, T_ON - t);
  const up = Math.max(0, (youAt(t).y - LEDGE) * FT), kid = Math.max(0, kidAt(t).y * FT);
  const f = (x) => (x < 9.95 ? x.toFixed(1) : String(Math.round(x)));
  const line = `You: ${f(up)} ft · Kid: ${f(kid)} ft`;
  return {
    label: t < T_ON ? 'GRAVITY BACK IN · SLOW MOTION' : 'GRAVITY IS BACK',
    value: `${left.toFixed(2)} s`,
    line,
  };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.t = tOf(v);
  s.off = s.t >= 0 && s.t < T_ON ? 1 : 0;
  // the end: white as you hit the water (the spray), held to the loop point
  s.flash = smooth(V_CRASH + 0.2, V_WHITE, v);
  s.title = 1 - smooth(2.4, 2.8, v);
  // fog: forms from T_FOG, thick by 0.00, stays (the pressure takes seconds to come back)
  s.fog = smooth(T_FOG, T_ON + 0.2, s.t);
  // air pressure drop (Pa) at the ground
  s.dp = AIR_DP * clamp(s.t, 0, T_ON) * (s.t > T_ON ? Math.max(0, 1 - (s.t - T_ON) / 6) : 1);
  return s;
}
export { lerp };
