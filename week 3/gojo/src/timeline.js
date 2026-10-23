// "What if Gojo attacked your city?" — the story as functions of VIDEO time v (seconds), real time throughout.
// You stand at the curb of a downtown avenue at dusk. Gojo floats 85 ft over the street, 100 m up the avenue,
// and works through his techniques, each bigger than the last, counting down to his Domain Expansion:
//   BLUE (already pulling for 5.5 s at frame 0): a point of attraction 16 m over the street, off his right hand. Its reach grows to 58 m; whatever
//     it reaches is torn loose (closest first) and dragged along a spiral into it, crushed into one ball.
//   RED: a point of repulsion fired up the avenue at 500 m/s (1,100 mph); everything near its path is thrown
//     outward, every window it passes bursts, and it blows the tower at the end of the avenue in half.
//   HOLLOW PURPLE: Blue and Red meet; the purple sphere erases everything it passes through. The first (35 m
//     radius) runs 4.8 km (3 miles) to the horizon in 4 s; towers taller than its path lose their middles and
//     their tops drop into the trench. The second is bigger (52 m) and passes 60 ft from you.
//   DOMAIN EXPANSION: UNLIMITED VOID: a bubble swells out of him over the city and past you; inside, infinite
//     information pours into your head (0.2 s in there is half a year of it); it all ends in white (the loop).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FT = 0.3048;
export const GOJO = { x: 0, y: 25, z: -95 };     // his feet (he is 1.9 m tall)
export const BLUE = { x: 8, y: 16, z: -86 };
export const CAM0 = { x: 12.6, y: 1.66, z: 4 };    // you, at the east curb

// ---- Blue ----
export const V_BLUE0 = -5.5;                       // it opened before the first frame
export const V_RELEASE = 12.9;                     // he lets go: the ball drops
export const BLUE_MAX = 58;
export const blueR = (v) => v < V_BLUE0 ? 0 : 4 + (BLUE_MAX - 4) * Math.pow(smooth(V_BLUE0, 10.4, v), 0.85);
// time when the reach first gets to distance d (inverse of blueR, by bisection)
export function vBlueAt(d) {
  if (d <= 4) return V_BLUE0;
  if (d > BLUE_MAX) return 1e9;
  let a = V_BLUE0, b = 10.4;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (blueR(m) < d) a = m; else b = m; }
  return (a + b) / 2;
}
export const blueOn = (v) => smooth(V_BLUE0, V_BLUE0 + 0.8, v) * (1 - smooth(V_RELEASE - 0.1, V_RELEASE + 0.25, v));
export const BALL_LAND = V_RELEASE + Math.sqrt(2 * (BLUE.y - 5) / 9.8);   // it falls 12 m to the street (it is ~5 m round)

// ---- Red ----
export const V_RED_FORM = 13.5, V_RED = 15.0;
export const RED_SPEED = 500;                      // m/s = 1,118 mph
export const RED_P0 = { x: 0, y: 26.5, z: -96.2 };
export const TOWER = { x: 0, z: -780, w: 64, d: 42, h: 172 };   // the tower that closes the end of the avenue
export const RED_P1 = { x: 0, y: 62, z: TOWER.z + TOWER.d / 2 };
export const RED_LEN = Math.hypot(RED_P1.x - RED_P0.x, RED_P1.y - RED_P0.y, RED_P1.z - RED_P0.z);
export const V_RED_HIT = V_RED + RED_LEN / RED_SPEED;
export const redFront = (v) => clamp((v - V_RED) * RED_SPEED, 0, RED_LEN);
// how wide the blast is around the path at distance s along it (m)
export const redReach = (s) => 22 + 0.025 * s;

// ---- Hollow Purple ----
const norm = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
export const PURPLES = [
  { R: 35, form0: 24.6, fire: 26.8, speed: 1200, len: 5000, d: norm(0.35, 0, -1), yc: 28 },
  { R: 52, form0: 33.4, fire: 35.6, speed: 120, len: 900, d: norm(-68, 0, 99), yc: 24 },
];
for (const p of PURPLES) {
  p.p0 = { x: GOJO.x + p.d.x * (p.R + 7), y: p.yc, z: GOJO.z + p.d.z * (p.R + 7) };
  p.end = p.fire + p.len / p.speed;
}
// the sphere's state: radius while it forms, how far it has gone
export function purpleAt(p, v) {
  const r = p.R * Math.pow(smooth(p.form0 + 0.8, p.fire, v), 0.7);
  // it starts slowly and gets up to speed in the first 0.4 s
  const dt = Math.max(0, v - p.fire);
  const s = Math.min(p.len, p.speed * (dt < 0.4 ? dt * dt / 0.8 : dt - 0.2));
  return { r, s, on: v > p.form0 + 0.8 && v < p.end + 0.3 ? 1 : 0, gone: v > p.end };
}

// ---- Domain Expansion ----
export const V_SIGN = 40.6, V_DOMAIN = 42.0;
export const voidR = (v) => v < V_DOMAIN ? 0 : 6 + 25 * Math.pow(v - V_DOMAIN, 1.4) * (1 + 0.4 * (v - V_DOMAIN));
export const CAM_DIST = Math.hypot(CAM0.x - GOJO.x, CAM0.y - GOJO.y, CAM0.z - GOJO.z);
// when the bubble passes the camera (by bisection)
export const V_INSIDE = (() => { let a = V_DOMAIN, b = V_DOMAIN + 6; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (voidR(m) < CAM_DIST + 6) a = m; else b = m; } return (a + b) / 2; })();
export const V_WHITE = 60.0;                        // full white
export const T_SWITCH = 60.4;
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP;
// information: 0.2 s in the void = half a year
export const yearsAt = (v) => Math.max(0, v - V_INSIDE) * 2.5;

// ---- the beats: a stamp, a camera jolt, a boom ----
export const BEATS = [
  { v: 3.3, label: 'CURSED TECHNIQUE LAPSE', text: 'Blue', color: '#9cc8ff' },
  { v: BALL_LAND, label: 'CRUSHED', text: '3,000 tons', color: '#9cc8ff', small: true },
  { v: V_RED, label: 'REVERSAL', text: 'Red', color: '#ff8a7a' },
  { v: V_RED_HIT, label: 'THE TOWER IS', text: 'hit', color: '#ff8a7a', small: true },
  { v: PURPLES[0].fire, label: 'HOLLOW', text: 'Purple', color: '#d7a4ff' },
  { v: PURPLES[1].fire, label: 'HOLLOW PURPLE', text: '200%', color: '#d7a4ff' },
  { v: V_DOMAIN, label: 'DOMAIN EXPANSION', text: 'Unlimited Void', color: '#f4efe6', small: true },
];
export function beatAt(v) { let b = null; for (const x of BEATS) if (x.v <= v) b = x; return b ? { ...b, dt: v - b.v } : null; }

// ---- captions ----
export const CAPTIONS = [
  [0.3, 3.0, 'Gojo is floating 80 ft over your street.'],
  [3.3, 5.6, 'Blue: a point of gravity the size of a fist.'],
  [5.8, 8.1, 'It rips a car off the street every half second.'],
  [8.3, 10.6, 'It tears the windows out of the towers.'],
  [10.8, 13.1, '{CARS} cars, crushed into a ball 30 ft wide.'],
  [13.4, 15.0, 'He turns up the avenue.'],
  [15.2, 17.5, 'Red: it flies at 1,100 mph and throws everything aside.'],
  [17.7, 20.2, 'A 40-story tower, blown in half.'],
  [20.4, 22.7, 'Every window for half a mile bursts.'],
  [22.9, 24.8, 'Blue in one hand. Red in the other.'],
  [25.0, 26.7, 'He pushes them together.'],
  [27.0, 29.6, 'Hollow Purple erases whatever it touches.'],
  [29.8, 32.2, '3 miles of city, gone in 4 seconds.'],
  [32.4, 35.4, 'Then he turns to you.'],
  [35.8, 38.2, 'A bigger one. It misses you by 60 ft.'],
  [38.4, 40.6, 'The street beside you is a cliff.'],
  [42.3, 44.4, 'The city folds into nothing.'],
  [44.8, 47.3, 'You can’t move. You can’t even blink.'],
  [47.5, 50.1, 'Everything there is pours into your head.'],
  [50.3, 52.9, '0.2 seconds in here = half a year of it.'],
  [53.1, 55.8, 'Every second in here is 2½ years.'],
  [56.0, 58.6, 'You’ve already lived 30 years in here.'],
];
let CARS_N = 0;
export const setCarsPulled = (n) => { CARS_N = n; };
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text: text.replace('{CARS}', String(CARS_N)), alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: the countdown to his Domain Expansion, then the information pouring in ----
// tallies for the unit line (set by the world as things happen, so they match what you see)
export const TALLY = { cars: (v) => 0, windows: (v) => 0, miles: (v) => 0 };
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export const COUNTERS = [
  {
    from: -3, to: V_DOMAIN, label: 'DOMAIN EXPANSION IN',
    fmt: (x) => `${x.toFixed(2)} s`,
    value: (v) => Math.max(0, V_DOMAIN - v),
    unit: (v) => v < V_RED_FORM ? `BLUE · ${fmtInt(TALLY.cars(v))} CARS PULLED IN`
      : v < PURPLES[0].form0 + 0.6 ? `RED · ${fmtInt(TALLY.windows(v))} WINDOWS BURST`
        : `HOLLOW PURPLE · ${TALLY.miles(v).toFixed(1)} MILES ERASED`,
    badge: () => 'LAST MOVE: UNLIMITED VOID',
  },
  {
    from: V_DOMAIN, to: T_SWITCH + 2, label: 'INSIDE THE UNLIMITED VOID',
    fmt: (y) => y < 1 ? `${(y * 12).toFixed(1)} months` : `${y.toFixed(1)} years`,
    value: (v) => yearsAt(v),
    unit: () => 'OF INFORMATION IN YOUR HEAD',
    badge: () => '',
  },
];

export function state(v) {
  const s = { v };
  s.title = 1 - smooth(3.0, 3.6, v);
  s.blueR = blueR(v);
  s.blueOn = blueOn(v);
  s.inside = v >= V_INSIDE ? 1 : 0;
  s.voidR = voidR(v);
  s.flash = smooth(V_WHITE - 2.0, V_WHITE, v);
  s.flash = s.flash * s.flash;
  s.flashColor = '#ffffff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
