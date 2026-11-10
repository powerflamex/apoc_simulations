// "What if Yellowstone erupted?" — the whole story as functions of time (story seconds, 0..86).
// Seen from a chalet balcony above a lake town 60 miles (97 km) south of the caldera, like Jackson Hole.
// The video starts STORY_START seconds in: the ash column is already rising behind the far ridge on frame 0.
import { smooth, keys, clamp } from './util.js';

export const DURATION = 86;
export const STORY_START = 22.5;
// The video loops: the hot ash cloud swallows the balcony and the frame burns to white; at T_SWITCH the scene
// jumps back to just before the first frame under the white, which clears over the last LOOP seconds.
export const T_SWITCH = 85.0;
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH - STORY_START + LOOP;

// story beats
export const T_SHOCK = 24.0;       // everyone on the meadow stops and turns to the column
export const T_BOOM = 32.1;        // the sound arrives: 97 km at 343 m/s = 4.7 minutes (time-lapse)
export const T_FLOW = 62.5;        // the hot ash cloud (pyroclastic flow) comes over the far ridge
export const T_ARRIVE = 83.5;      // ...and reaches the balcony: 300 mph = 134 m/s
export const FLOW_SPEED = 134;     // m/s
export const FLOW_Z = (t) => 110 - FLOW_SPEED * (T_ARRIVE - t);   // front position (the balcony is at z = 110)

// the eruption, in km: the vent is 97 km away, a little right of straight ahead
export const VENT = { dist: 97, az: 4 * Math.PI / 180 };
export const colHeight = (t) => keys([[0, 30], [22.5, 35], [29, 40]], t);             // column top, km
export const umbRadius = (t) => keys([[0, 14], [22.5, 27], [26, 34], [30, 46], [33, 66], [36.5, 104], [42, 160], [60, 260], [86, 300]], t);

// how much of the sky in direction (az, el) the spreading ash cloud (the umbrella, 0.6-1.0 of the column
// height) covers; the same maths runs in the sky shader. Used for the sunlight and the light level.
export function umbCover(az, el, t) {
  if (el <= 0.002) return 0;
  const H = colHeight(t), R = umbRadius(t);
  const vx = Math.sin(VENT.az) * VENT.dist, vz = -Math.cos(VENT.az) * VENT.dist;
  let c = 0;
  for (const h of [H * 0.6, H]) {
    const s = h / Math.tan(el);
    const q = Math.hypot(Math.sin(az) * s - vx, -Math.cos(az) * s - vz);
    c = Math.max(c, smooth(R + 6, R - 10, q));
  }
  return c;
}

// lightning in the column (and later in the ash cloud overhead): [story time, azimuth offset, height 0..1, size]
export const BOLTS = [];
{
  let a = 0x9e3779b9;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let t = 20.6; t < 84; t += t < 40 ? 0.5 + r() * 1.6 : 1.6 + r() * 2.4) BOLTS.push([t, (r() - 0.5) * 0.09, 0.08 + r() * 0.55, 0.6 + r() * 0.8, r()]);
}
// flash brightness at time t (fast strike, two or three flickers, then gone)
export function flashAt(t) {
  let f = 0;
  for (const b of BOLTS) {
    const dt = t - b[0];
    if (dt < 0 || dt > 0.45) continue;
    f = Math.max(f, b[3] * Math.exp(-dt * 9) * (0.55 + 0.45 * Math.cos(dt * 70 + b[4] * 6)));
  }
  return f;
}

export const CAPTIONS = [
  [24.3, 27.7, 'Yellowstone just erupted, 60 miles from you.'],
  [28.1, 31.5, 'The ash shoots 25 miles into the sky.'],
  [31.9, 35.1, '4 minutes later, the boom reaches you.'],
  [35.5, 39.1, 'The ash cloud spreads over the whole sky.'],
  [39.5, 43.1, 'Day turns to night.'],
  [43.7, 47.5, "Ash falls like snow, but it's tiny bits of rock and glass."],
  [48.1, 51.7, 'Cars choke on it and stall.'],
  [52.3, 56.1, 'Just 4 inches of wet ash can cave in a roof.'],
  [56.7, 60.5, 'Power lines snap. The valley goes dark.'],
  [61.5, 65.3, 'Then the worst part comes over the ridge.'],
  [65.9, 69.9, 'A cloud of red-hot ash, racing at 300 mph.'],
  [70.5, 74.5, 'It boils the lake as it crosses.'],
  [75.5, 79.5, "It's 1,000°F inside. Nothing can outrun it."],
];

const pad2 = (n) => String(n).padStart(2, '0');
const fmt1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const fmtMS = (v) => { const s = Math.max(0, Math.ceil(v - 1e-6)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };

// The grid fails: the valley browns out and flickers together, then goes dark section by section (150 m
// cells), far shore first, sweeping in toward the camera. Shared by the window lights (bend.js), the street
// lamps (world.js), the town glow (main.js) and the soundtrack.
export const GRID = { brown: 56.6, t0: 57.6, span: 2.4, far: 1400, cell: 150, cx: 0, cz: 111 };
export const gridBrown = (t) => 1 - 0.55 * smooth(GRID.brown, GRID.brown + 0.5, t) * (0.55 + 0.45 * Math.sin(t * 31.0) * Math.sin(t * 17.3));
export function gridOffT(x, z) {
  const d = Math.hypot(x - GRID.cx, z - GRID.cz);
  const j = Math.floor(x / GRID.cell) * 0.618034 + Math.floor(z / GRID.cell) * 0.414214;
  return GRID.t0 + GRID.span * (0.75 * (1 - clamp(d / GRID.far)) + 0.25 * (j - Math.floor(j)));
}

export const ashInches = (t) => keys([[36.5, 0], [39, 0.1], [42, 1.2], [47, 5], [52, 12], [57, 21], [62.5, 36]], t);

export const COUNTERS = [
  {
    from: 0, to: 36.5, label: 'ASH CLOUD WIDTH', unit: 'MILES', fmt: (v) => String(Math.round(v)), badge: () => 'TIME-LAPSE',
    value: (t) => (2 * umbRadius(t)) / 1.609,
  },
  {
    from: 36.5, to: T_FLOW, label: 'ASH ON YOUR STREET', unit: 'INCHES', fmt: fmt1, badge: () => 'TIME-LAPSE',
    value: (t) => ashInches(t),
  },
  {
    from: T_FLOW, to: T_SWITCH + 0.2, label: 'HOT ASH CLOUD ARRIVES IN', unit: 'SECONDS · 300 MPH', fmt: fmtMS, badge: () => 'REAL TIME',
    value: (t) => T_ARRIVE - t,
  },
];

export function state(t) {
  const s = { t };
  // light: the ash cloud covers the sun, then the whole sky
  s.sunCover = umbCover(200 * Math.PI / 180, 48 * Math.PI / 180, t);
  s.overhead = umbCover(0, 75 * Math.PI / 180, t);
  s.sunLight = 1 - s.sunCover;
  s.day = Math.max(0.07, 1 - 0.45 * s.sunCover - 0.53 * s.overhead);
  s.flash = 0;                 // (the overlay's white flash; unused)
  s.bolt = flashAt(t);         // lightning
  s.boom = smooth(T_BOOM, T_BOOM + 0.08, t) * Math.exp(-Math.max(0, t - T_BOOM) * 1.6);

  // people, lights, traffic
  s.lookUp = smooth(T_SHOCK, T_SHOCK + 2, t);
  s.phones = smooth(28.0, 30.5, t) * (1 - smooth(36, 42, t));
  s.leave = smooth(33, 44, t);

  // ash
  s.snowFall = smooth(38, 41.5, t) * (1 - 0.3 * smooth(80, 84, t));   // falling ash (the old snow particles)
  s.snow = smooth(39, 66, t);                                          // ash lying on roofs, cars and the ground
  s.ice = smooth(48, 68, t);                                           // an ash crust spreading over the lake
  s.waves = 1 - smooth(48, 62, t);

  // the hot ash cloud
  s.flowZ = FLOW_Z(t);
  s.flowOn = smooth(T_FLOW - 1.5, T_FLOW + 1, t);
  s.near = smooth(-1500, 100, s.flowZ) * s.flowOn;                     // how close it is (0 far .. 1 here)
  s.cover = smooth(T_ARRIVE - 0.4, T_SWITCH - 0.05, t);                // inside it: the frame burns to white

  // camera exposure: a phone camera fighting the dark
  s.exposure = 0.92 + 1.1 * smooth(37, 44, t) + 0.2 * smooth(57.6, 60, t) - 0.5 * s.flowOn - 0.4 * s.near;
  s.title = 1 - smooth(STORY_START + 3.0, STORY_START + 3.8, t);   // fully up on the first frame
  s.hideText = smooth(T_SWITCH - 1.0, T_SWITCH - 0.4, t);
  s.fadeOut = 0;
  s.endcard = 0;
  s.endText = 0;
  s.flashColor = '#fff';
  return s;
}

export function captionAt(t) {
  for (const [a, b, text] of CAPTIONS) {
    if (t >= a - 0.01 && t <= b + 0.01) {
      const fadeIn = clamp((t - a) / 0.55);
      const fadeOut = clamp((b - t) / 0.55);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}
