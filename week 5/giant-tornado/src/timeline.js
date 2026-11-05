// "What if a tornado was 10 miles wide?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// Main Street of a small Midwest town (generic, no real brands), late afternoon. A wedge tornado 10 miles across
// comes straight down the street at you. The video is a time-lapse of its last 10 minutes (the counter says so).
// What is real here, and what is a guess (the captions only claim the real numbers):
//   - the widest tornado ever measured was 2.6 miles (El Reno, Oklahoma, 31 May 2013). 10 miles is the "what if".
//   - the fastest wind ever measured in a tornado is just over 300 mph (Bridge Creek-Moore 1999 and El Reno 2013,
//     both by mobile radar). We put 300 mph at the wall's edge and never claim more.
//   - what each wind speed does is the EF scale's own damage list: ~75 mph you can't stay on your feet; 86-110
//     roofs stripped, signs and trash cans fly; 111-135 roofs torn off houses, cars pushed off the road; 136-165 heavy
//     cars lifted and thrown; 166-200 houses levelled; 200+ frame houses swept away, asphalt scoured off roads.
//   - the wind on you as it nears (windAt, an estimate: nobody knows how the wind falls off outside a vortex that
//     size): it climbs from ~35 mph at 8 miles out (the storm's inflow) to 300 at the wall.
//   - the wall: a 10-mile-wide condensation funnel (a vertical cylinder, radius 5 miles) rising ~6,000 ft into the
//     storm's base, turning at the edge speed; a debris cloud at its foot; lightning inside (tornadic storms are full of it).
//   - the green sky: sunlight through a deep, hail-filled cloud. Baseball-size hail falls at ~100 mph.
//   - forward speed 50 mph (fast for a tornado: most move at 20-40 mph, the fastest on record about 70):
//     10 minutes out is 8.3 miles.
import { smooth, clamp, lerp, keys, rng } from './util.js';

export const STORY_START = 0;
export const MILE = 1609.344, FT = 0.3048;
export const WALL_R = 5 * MILE;            // half its width: 8,047 m
export const WALL_H = 6000 * FT;           // the dark mass runs up to ~6,000 ft, where it merges into the storm's base
export const V_FWD = 50 * MILE / 3600;     // 22.35 m/s toward you
export const V_EDGE = 300 * MILE / 3600;   // 134 m/s round its edge
export const T0 = 600;                     // seconds left at frame 0

// ---- the time-lapse: seconds until the wall reaches you, at video time v. A jump every 3 s; near the end it runs
// in real time ----
const KEYS = [600, 450, 335, 250, 185, 138, 102, 76, 56, 41, 30, 22, 16, 11.5, 8.0, 5.0];   // at v = 0, 3, ..., 45
const STEP = 3;
export const V_FINAL = 46.0;          // the flash that whites everything out
export const T_SWITCH = 47.2;         // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
const LAST = (KEYS.length - 1) * STEP;
export function Tleft(v) {
  if (v <= 0) return KEYS[0] * Math.pow(KEYS[0] / KEYS[1], -v / STEP);          // (before frame 0: the same race)
  if (v >= LAST) return Math.max(0, KEYS[KEYS.length - 1] * (1 - (v - LAST) / (T_SWITCH - LAST)));
  const k = Math.floor(v / STEP);
  const u = clamp((v - k * STEP) / STEP);
  // how much of each step is the jump (the rest is the steady race); the first 3 s are all race
  const jump = k === 0 ? 0 : 0.7 - smooth(30, 42, v) * 0.45;
  const f = jump * smooth(0, 0.17, u) + (1 - jump) * u;
  return Math.exp(lerp(Math.log(KEYS[k]), Math.log(KEYS[k + 1]), f));
}
export const STEPS = KEYS.slice(1).map((_, i) => (i + 1) * STEP);                    // 3, 6, ..., 45
export const dAt = (v) => Tleft(v) * V_FWD;                                            // metres to the wall's edge
export const wallAngle = (v) => Math.atan(WALL_H / dAt(v));                            // how tall it looks (rad)

// ---- the wind on you (mph), an estimate that follows the EF scale's steps as it nears ----
const WIND_KEYS = [[-6, 30], [0, 35], [6, 50], [10, 60], [14, 75], [20, 110], [26, 135], [32, 165], [38, 200], [44, 250], [47.2, 300], [60, 300]];
export const windAt = (v) => keys(WIND_KEYS, v);
export const windMs = (v) => windAt(v) * 0.44704;
// how far the air has moved past you since frame 0 (m), for the streaks of dirt and the clouds
export function windInt(v) {
  let s = 0, t = 0;
  while (t < v) { const dt = Math.min(0.1, v - t); s += windMs(t + dt / 2) * dt; t += dt; }
  return s;
}

// ---- the big moments (video time) ----
export const V_SIREN = 5.6;           // the tornado sirens start
export const V_GREEN = 6.0;           // the sky turns green (to ~10 s)
export const V_ALERT = 6.4;           // the phones' alert
export const V_FLEE = 9.6;            // the first cars race down the street toward you
export const V_RUN = 11.4;            // people run past you
export const V_CRASH = 12.65;         // the pile-up in front of you
export const V_LIFT1 = 17.6;          // signs, awnings, trash cans go up
export const V_CAR1 = 18.6;           // a car lifts off up the street
export const V_HAIL = 23.4;           // hail
export const V_TOWN = 24.0;           // the far end of town is pulled apart
export const V_HOLD = 28.8;           // people grab the lamp posts
export const V_ROOFS = 30.0;          // roofs peel off and fly
export const V_TRUCK = 30.4;          // a truck tumbles across the frame
export const V_GLASS = 33.0;          // every window bursts
export const V_PEOPLE = 33.0;         // people are lifted (to ~40 s)
export const V_CARS = 34.0;           // cars are lifted, the far ones first (to ~41 s)
export const V_WALL = 36.0;           // the wall fills the screen; dark, lightning inside it
export const V_PEEL = 42.0;           // the street peels up
export const V_YOU = 44.2;            // you lose your footing

// ---- lightning: a list of bolts (random, but fixed), more and more as the wall nears ----
export const BOLTS = [];
{
  const R = rng(777);
  let t = 7.0;
  while (t < 45.3) {
    const rate = 0.1 + 0.32 * smooth(15, 30, t) + 2.4 * smooth(32, 42, t);
    t += -Math.log(1 - R()) / rate;
    if (t >= 45.3) break;
    BOLTS.push({ t, phi: (R() - 0.5) * (0.8 - 0.55 * smooth(30, 44, t)), str: 0.45 + R() * 0.7 + 0.7 * smooth(28, 44, t), seed: R() * 10, dbl: R() < 0.5 ? 0.11 + R() * 0.08 : 0, down: 0.35 + R() * 0.6 });
  }
  // two early ones, so the storm flickers while the sky turns green
  BOLTS.push({ t: 9.3, phi: 0.25, str: 0.7, seed: 1.1, dbl: 0.12, down: 0.5 }, { t: 14.1, phi: -0.3, str: 0.6, seed: 2.2, dbl: 0, down: 0.45 });
  BOLTS.sort((a, b) => a.t - b.t);
  BOLTS.push({ t: V_FINAL, phi: 0.04, str: 4.5, seed: 3.3, dbl: 0.14, down: 1.0, final: true });
}
const strokeK = (dt) => (dt < 0 ? 0 : Math.exp(-dt / 0.045) + 0.45 * Math.exp(-dt / 0.14) * (0.6 + 0.4 * Math.sin(dt * 110)));
export const boltK = (b, v) => { const dt = v - b.t; return dt < 0 || dt > 0.7 ? 0 : strokeK(dt) + (b.dbl ? 0.8 * strokeK(dt - b.dbl) : 0); };

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_GREEN + 0.4, 'THE SKY TURNS GREEN'],
  [V_RUN + 0.9, 'EVERYONE RUNS'],
  [V_LIFT1 + 0.7, 'THINGS START TO LIFT'],
  [V_TOWN + 0.3, 'THE FAR END OF TOWN IS GONE'],
  [V_ROOFS + 0.3, 'ROOFS FLY'],
  [V_WALL + 0.3, 'YOU’RE INSIDE THE WALL'],
  [V_PEEL + 0.4, 'THE STREET PEELS UP'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together). Each has "you" or the thing, and one
// number that comes from the same numbers the counter uses ----
const mph5 = (v) => { const w = windAt(v), r = w > 150 ? 10 : 5; return Math.round(w / r) * r; };
export const CAPTIONS = [
  [3.4, V_GREEN + 0.2, 'It’s 10 miles wide. The widest ever was 2.6.'],
  [V_GREEN + 0.4 + POP + 0.2, V_RUN + 0.7, `The wind on you is already ${mph5(9)} mph.`],
  [V_RUN + 0.9 + POP + 0.2, V_LIFT1 + 0.5, `At ${mph5(15)} mph you can’t stay on your feet.`],
  [V_LIFT1 + 0.7 + POP + 0.2, V_TOWN + 0.1, `At ${mph5(21)} mph it takes the roofs off houses.`],
  [V_TOWN + 0.3 + POP + 0.2, V_ROOFS + 0.1, 'Hail this big hits you at 100 mph.'],
  [V_ROOFS + 0.3 + POP + 0.2, V_WALL + 0.1, `At ${mph5(33)} mph it throws trucks.`],
  [V_WALL + 0.3 + POP + 0.2, V_PEEL + 0.2, `At ${mph5(39)} mph nothing stays bolted down.`],
  [V_PEEL + 0.4 + POP + 0.2, V_FINAL + 0.5, 'Now it’s 300 mph: the fastest wind ever measured.'],
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
  const s = Math.max(0, Math.floor(T + 1e-6));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
export function fmtDist(d) {
  const mi = d / MILE;
  if (mi >= 0.95) return `${mi.toFixed(1)} MILES AWAY`;
  const ft = d / FT;
  const r = ft > 1500 ? 100 : 50;
  return `${(Math.round(ft / r) * r).toLocaleString('en-US')} FEET AWAY`;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'REACHES YOU IN  ·  TIME-LAPSE',
    fmt: (T) => fmtLeft(T),
    value: (v) => Tleft(v),
    unit: (v) => fmtDist(dAt(v)),
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.T = Tleft(v);
  s.d = s.T * V_FWD;
  s.ang = Math.atan(WALL_H / s.d);
  s.rot = (T0 - s.T) * V_EDGE / WALL_R;              // how far the wall has turned (rad)
  s.wind = windAt(v); s.W = s.wind * 0.44704;
  s.title = 1 - smooth(2.9, 3.35, v);
  // how much of the jump is happening now (0..1, for the hit in the sound, the camera kick, the bloom)
  s.kick = 0;
  for (const t of STEPS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.05, dt) * Math.exp(-Math.max(dt, 0) / 0.3)); }
  s.react = smooth(0.2, 2.5, v);
  s.green = smooth(V_GREEN, V_GREEN + 4.5, v);
  s.sun = 1 - smooth(13, 30, v);                       // the storm's deck swallows the Sun
  s.dark = 0.8 * smooth(31, 38, v) + 0.2 * smooth(42, 46.5, v);
  s.debris = smooth(12, 36, v);                        // the debris cloud at its foot
  s.hail = smooth(V_HAIL, V_HAIL + 1.5, v) * (1 - smooth(40, 43, v));
  s.peel = smooth(V_PEEL, V_PEEL + 3.6, v);
  s.you = Math.max(0, v - V_YOU);
  s.shake = 0.08 + 0.45 * smooth(14, 30, v) + 0.6 * smooth(34, 46, v);
  // lightning: the total light on the street, and the bolts to draw (up to 4)
  s.bolt = 0; s.bolts = [];
  for (const b of BOLTS) {
    const k = boltK(b, v);
    if (k <= 0) continue;
    s.bolt += b.str * k;
    if (s.bolts.length < 4) s.bolts.push([b.phi, b.str * k, b.seed, b.down]);
  }
  s.bolt = Math.min(s.bolt, 6);
  s.flash = smooth(V_FINAL + 0.05, V_FINAL + 0.95, v);
  s.flashColor = '#f3f5ff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
