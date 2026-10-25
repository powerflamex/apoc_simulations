// "What if you grew 1 trillion times bigger?" — the story as functions of VIDEO time v (seconds; real time).
// You grow 10x every 5 seconds: size s = 10^(0.5 + v / 5) (3.2x at frame 0, 1 trillion x at 57.5 s), keeping your
// shape and your density (70 kg at 1x, so your mass goes up as s^3: 4x heavier every second). You can't get hurt.
// You start in the middle of a downtown crossing (Chicago's grid, Lake Michigan 1.8 km east) at 2:30 PM, your
// right foot at the origin. The physics that follows from your size and weight:
//   your shoe (0.27 m at 1x) sweeps over the cars and corner buildings round you; every step is an earthquake;
//   the rock under your soles fails when the pressure passes ~200 MPa (s ~ 17,500, 2 x 70 s^3 g / (0.06 s^2));
//   you sink into the crust; Earth (12,742 km) is smaller than you at s = 7.3 million; you outweigh it at
//   s = 44 million; at s ~ 300 million your gravity (hundreds of Earths, right under your shoe) crushes it;
//   bigger than the Sun at 800 million, heavier than it at 3 billion; your outstretched hand grows over the Sun at
//   s ~ 80 billion (the Sun stays where it is; you grow round it); a million Suns at 300 billion; at 1 trillion
//   the Sun is a 1.4 mm grain of sand in your palm. (You'd collapse into a black hole at ~3 trillion.)
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const H0 = 1.75;                      // m, your height at 1x
export const MASS0 = 70;                     // kg
export const R_E = 6.371e6, R_SUN = 6.957e8, AU = 1.496e11, MOON_DIST = 3.844e8, R_MOON = 1.737e6;
export const LOG0 = 0.5, RATE = 5;           // log10 s = LOG0 + v / RATE
export const V_TRILLION = (12 - LOG0) * RATE;      // 57.5
export const logS = (v) => Math.min(12, LOG0 + v / RATE);
export const sizeAt = (v) => Math.pow(10, logS(v));
export const vOfS = (s) => (Math.log10(s) - LOG0) * RATE;

// ---- the events ----
export const STOMP1 = { up: 6.25, down: 7.0, foot: 1, lift: 0.13 };     // left foot (foot 1), down at s ~ 80
export const STOMP2 = { up: 15.9, down: 16.7, foot: 0, lift: 0.11 };    // right foot, down at s ~ 7,000
export const V_PLANE = 19.0;                 // an airliner crosses in front of your knees (s ~ 20,000)
export const V_CRUSH_ROCK = vOfS(17500);     // the rock under your soles gives way (~19.7 s)
export const V_EARTH_CRACK = 39.6, V_EARTH_BURST = 40.6;   // Earth crushed under your shoe (s ~ 250-400 million)
export const V_REACH0 = 46.8, V_REACH1 = 50.2;             // you raise your right hand toward the Sun
export const V_TOUCH = 52.0;                 // your hand grows over the Sun (s = 79 billion)
export const S_TOUCH = sizeAt(V_TOUCH);
export const V_PUSH = 57.6;                  // the Sun's light swells until it's all you see
export const T_SWITCH = 59.0;                // full white; the loop point sits in it (the video stays under 60 s)
export const LOOP = 0.85;
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- the shots (the camera itself is in main.js) ----
export const SHOTS = [
  { k: 'street', a: -2, b: 9.55 },
  { k: 'drone', a: 9.55, b: 21.5 },
  { k: 'feet', a: 21.5, b: 32.35 },
  { k: 'ball', a: 32.35, b: 42.5 },
  { k: 'sun', a: 42.5, b: 47.3 },
  { k: 'reach', a: 47.3, b: 55.0 },
  { k: 'palm', a: 55.0, b: 99 },
];
export const shotAt = (v) => SHOTS.find((x) => v < x.b) || SHOTS[SHOTS.length - 1];

// ---- captions (video time) ----
// one caption in each gap between the popups (they're never on screen together)
export const CAPTIONS = [
  [4.3, 7.3, 'Every 5 seconds, you get 10x bigger.'],
  [9.3, 12.3, 'Every step is an earthquake.'],
  [14.3, 17.3, 'Your head is above the clouds.'],
  [19.3, 22.3, 'One step flattens 100 city blocks.'],
  [24.3, 27.3, 'The rock under your feet gives way.'],
  [29.3, 32.3, 'Earthquakes shake the whole planet.'],
  [34.3, 37.3, 'Earth is smaller than you.'],
  [39.4, 42.3, 'Your gravity crushes it.'],
  [44.3, 47.3, 'You weigh more than the Sun.'],
  [49.3, 52.3, 'Your hand reaches the Sun.'],
  [54.3, 57.3, 'You weigh as much as a million Suns.'],
];

export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: your size, racing up ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export function fmtSize(s) {
  if (s < 10) return `${s.toFixed(1)}x`;
  return `${fmtInt(s)}x`;
}
export function fmtHeight(m) {
  const ft = m / 0.3048;
  if (ft < 5280) return `${fmtInt(ft)} FT`;
  const mi = ft / 5280;
  if (mi < 10) return `${mi.toFixed(1)} MILES`;
  if (mi < 1e6) return `${fmtInt(mi)} MILES`;
  if (mi < 1e9) return `${(mi / 1e6).toFixed(mi < 1e7 ? 1 : 0)} MILLION MILES`;
  return `${(mi / 1e9).toFixed(1)} BILLION MILES`;
}
// what you're as tall as (the note under the height)
export function noteAt(s) {
  const H = s * H0;
  if (H < 9) return 'AS TALL AS A GIRAFFE';
  if (H < 17) return 'TALLER THAN A HOUSE';
  if (H < 250) return `AS TALL AS A ${Math.max(5, Math.round(H / 3.4))}-STORY BUILDING`;
  if (H < 443) return 'TALLER THAN EVERY TOWER IN TOWN';
  if (H < 828) return 'TALLER THAN THE EMPIRE STATE BUILDING';
  if (H < 2600) return 'TALLER THAN THE BURJ KHALIFA';
  if (H < 8849) return 'YOUR HEAD IS IN THE CLOUDS';
  if (H < 12000) return 'TALLER THAN MOUNT EVEREST';
  if (H < 100e3) return 'TALLER THAN AIRLINERS FLY';
  if (H < 420e3) return 'YOUR HEAD IS IN SPACE';
  if (H < 12.742e6) return 'TALLER THAN THE SPACE STATION FLIES';
  if (H < 384.4e6) return 'TALLER THAN EARTH IS WIDE';
  if (H < 1.3914e9) return 'TALLER THAN THE MOON IS FAR AWAY';
  if (H < AU) return 'BIGGER THAN THE SUN';
  if (H < 7.785e11) return 'TALLER THAN THE SUN IS FAR AWAY';
  if (H < 1.434e12) return 'TALLER THAN JUPITER’S ORBIT';
  return 'TALLER THAN SATURN’S ORBIT';
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'YOUR SIZE',
    fmt: (s) => fmtSize(s),
    value: (v) => sizeAt(v),
    unit: (v) => `${fmtHeight(sizeAt(v) * H0)} TALL`,
  },
];

// the big gold stamp at every power of ten
export const STAMPS = [];
{
  const NAMES = ['10x', '100x', '1,000x', '10,000x', '100,000x', '1 MILLION x', '10 MILLION x', '100 MILLION x',
    '1 BILLION x', '10 BILLION x', '100 BILLION x', '1 TRILLION x'];
  // what the popup says (no number: the counter shows the size); t stays for the soundtrack
  const SAY = ['TALLER THAN A HOUSE', 'AS TALL AS A SKYSCRAPER', 'TALLER THAN THE BURJ KHALIFA', 'TALLER THAN AIRLINERS FLY',
    'YOUR HEAD IS IN SPACE', 'ABOVE THE SPACE STATION', 'TALLER THAN EARTH IS WIDE', 'EARTH IS A BALL UNDER YOUR SHOE',
    'BIGGER THAN THE SUN', 'THE SUN IS A GRAPEFRUIT', 'THE SUN IS A MARBLE IN YOUR HAND', 'THE SUN IS A GRAIN OF SAND'];
  NAMES.forEach((t, i) => STAMPS.push({ v: vOfS(Math.pow(10, i + 1)), t, say: SAY[i] }));
}
// the popup (one gold phrase) shows for POP s after each stamp
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of STAMPS) if (x.say && v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}
export const lastStamp = (v) => { let b = null; for (const x of STAMPS) if (x.v <= v) b = x; return b; };

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.s = sizeAt(v);
  s.H = s.s * H0;
  s.mass = MASS0 * s.s ** 3;
  s.shot = shotAt(v);
  // how far your soles have sunk into the ground (you-units: fractions of your 1.75 m), once the rock fails;
  // past ~10 million times, Earth is too small to sink into
  s.sink = 0.07 * smooth(V_CRUSH_ROCK - 0.3, 31, v) * (1 - smooth(31.5, 33.5, v));
  s.crack = smooth(V_CRUSH_ROCK - 0.5, 27, v);                    // glowing cracks round your shoes
  s.earthCrack = smooth(V_EARTH_CRACK, V_EARTH_BURST, v);
  s.earthBurst = smooth(V_EARTH_BURST - 0.05, V_EARTH_BURST + 0.15, v);
  s.reach = smooth(V_REACH0, V_REACH1, v);
  s.title = 1 - smooth(3.0, 3.75, v);
  s.flash = smooth(V_PUSH + 0.6, T_SWITCH - 0.08, v);
  s.flashColor = '#fffaf0';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}

// how far each foot is lifted (you-units) for the two stomps; 'hit' is the time since the last stomp landed
export function footLift(v) {
  const out = [0, 0];
  for (const st of [STOMP1, STOMP2]) {
    if (v < st.up || v > st.down) continue;
    const k = (v - st.up) / (st.down - st.up);
    // up quickly, hang, slam down (a little faster than it rose)
    out[st.foot] = st.lift * Math.sin(Math.PI * Math.pow(k, 0.75));
  }
  return out;
}
export const stompAge = (v) => {
  let a = 99, st = null;
  for (const x of [STOMP1, STOMP2]) if (v >= x.down && v - x.down < a) { a = v - x.down; st = x; }
  return { age: a, st };
};
// where your feet are (you-units, relative to the anchor = your right sole): facing south (+z), left foot east
export const FOOT_X = [0, 0.21];
// your shoe's footprint (you-units): toe 0.19 ahead of the ankle line, heel 0.08 behind, 0.1 wide
export const SHOE = { toe: 0.19, heel: 0.085, hw: 0.052 };
export function underShoe(xm, zm, s, pad = 0) {   // world metres -> which foot covers it (-1: none)
  for (let f = 0; f < 2; f++) {
    const x = xm / s - FOOT_X[f], z = zm / s;
    if (x > -SHOE.hw - pad && x < SHOE.hw + pad && z > -SHOE.heel - pad && z < SHOE.toe + pad) return f;
  }
  return -1;
}
// the first video time a point (world metres, a box of half size r) is covered by a shoe as you grow
export function vCovered(xm, zm, r = 0, foot = -1) {
  let best = 1e9;
  for (let f = 0; f < 2; f++) {
    if (foot >= 0 && f !== foot) continue;
    // the shoe grows about the anchor (0, 0): a point is inside when its coordinates / s fit the footprint
    // solve for the smallest s with |x/s - fx| <= hw (+ r/s) and -heel <= z/s <= toe
    let lo = 0.5, hi = 1e7;
    const inside = (s) => {
      const x = xm / s - FOOT_X[f], z = zm / s, rr = r / s;
      return x > -SHOE.hw - rr && x < SHOE.hw + rr && z > -SHOE.heel - rr && z < SHOE.toe + rr;
    };
    // coverage is not monotone in general (a point off to the side is covered only once the foot's offset
    // carries the shoe over it) — scan in log steps, then refine
    let sHit = -1;
    for (let ls = -0.3; ls < 7; ls += 0.01) { if (inside(Math.pow(10, ls))) { sHit = Math.pow(10, ls); lo = Math.pow(10, ls - 0.01); hi = sHit; break; } }
    if (sHit < 0) continue;
    for (let i = 0; i < 30; i++) { const m = Math.sqrt(lo * hi); if (inside(m)) hi = m; else lo = m; }
    best = Math.min(best, vOfS(hi));
  }
  return best;
}
// your body (standing, at 1x, metres; anchor = your right sole): capsules [ax, ay, az, bx, by, bz, radius] for the
// legs, hips and torso, the arms hanging a little out from your sides, and your head. A building is broken apart the
// moment any of them grows into it (vBodyHit); the point of contact is where the debris bursts out.
export const BODY = [
  [0, 0.1, 0.01, 0, 0.88, 0, 0.078], [0.21, 0.1, 0.01, 0.21, 0.88, 0, 0.078],
  [0.105, 0.84, 0, 0.105, 1.42, 0, 0.16],
  [-0.085, 1.39, -0.01, -0.2, 0.84, 0.05, 0.05], [0.295, 1.39, -0.01, 0.41, 0.84, 0.05, 0.05],
  [0.105, 1.6, 0.01, 0.105, 1.66, 0.01, 0.11],
];
export function vBodyHit(x, z, w, d, h, sMax = 2e4) {
  const reach = Math.hypot(Math.max(0, Math.abs(x - 0.1) - w / 2), Math.max(0, Math.abs(z) - d / 2));
  for (let ls = Math.max(-0.2, Math.log10(Math.max(reach, 0.1) / 0.5)); ls < Math.log10(sMax); ls += 0.008) {
    const sz = Math.pow(10, ls);
    // the box in your own size
    const x0 = (x - w / 2) / sz, x1 = (x + w / 2) / sz, z0 = (z - d / 2) / sz, z1 = (z + d / 2) / sz, y1 = h / sz;
    for (const c of BODY) {
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const px = c[0] + (c[3] - c[0]) * t, py = c[1] + (c[4] - c[1]) * t, pz = c[2] + (c[5] - c[2]) * t;
        const dx = Math.max(x0 - px, 0, px - x1), dy = Math.max(-py, 0, py - y1), dz = Math.max(z0 - pz, 0, pz - z1);
        if (dx * dx + dy * dy + dz * dz < c[6] * c[6]) return { v: vOfS(sz), x: px * sz, y: Math.min(py * sz, h), z: pz * sz };
      }
    }
  }
  return null;
}
// the ground you stand over (you-units): from just outside your right foot to just outside your left, heel to toe.
// Anything in it as you grow is something you grow into (your legs, the space between your feet): it breaks apart.
export const STANCE = { x0: -0.07, x1: 0.28, z0: -0.1, z1: 0.21 };
export function vStanceHit(x, z, w, d, h) {
  const need = (lo, hi, a0, a1) => (lo > 0 ? lo / a1 : hi < 0 ? hi / a0 : 0);   // s at which [lo, hi] meets [a0 s, a1 s]
  const sx = need(x - w / 2, x + w / 2, STANCE.x0, STANCE.x1), sz = need(z - d / 2, z + d / 2, STANCE.z0, STANCE.z1);
  const sHit = Math.max(sx, sz, 0.5);
  if (sHit > 9000) return null;
  // the point of contact: the box's nearest point to the middle of your stance, at your shin height
  const cx = 0.105 * sHit, cz = 0.05 * sHit;
  return { v: vOfS(sHit), x: Math.min(Math.max(cx, x - w / 2), x + w / 2), y: Math.min(h * 0.6, 0.4 * sHit * 1.75), z: Math.min(Math.max(cz, z - d / 2), z + d / 2) };
}
// the taxi stopped broadside in front of your right toe, and when the toe reaches it
export const TAXI = { x: 0.35, z: 2.75 };
export const V_CAR = vCovered(TAXI.x, TAXI.z, 1.6);
export { lerp };
