// "What if the Sun suddenly vanished?" — the whole story as functions of time (seconds, 0..80).
import { smooth, keys, lerp, clamp } from './util.js';

export const DURATION = 80;
// the video starts this far into the story (the countdown still begins at 8:20 on the first frame,
// and runs out ~9.5 s in)
export const STORY_START = 14.5;
export const VIDEO_DURATION = DURATION - STORY_START;

// story beats
export const T_DARK = 24.0;        // the last sunlight from the centre of the disk arrives
export const T_LIMB = 26.3;        // ...and from the edge, 2.3 s later
export const T_LAPSE = 34.5;       // time-lapse speeds up (hours -> days)

export const CAPTIONS = [
  [15.2, 17.6, 'The Sun has just vanished.'],
  [18.0, 21.0, 'But its last light is still on the way to you.'],
  [21.3, 23.9, 'Even its gravity takes 8 minutes to let go.'],
  [24.4, 28.8, 'In 2 seconds, day turns to night.'],
  [29.4, 34.0, 'The planets glow a little longer, lit by old sunlight.'],
  [34.6, 39.6, 'Earth drifts off in a straight line, into deep space.'],
  [40.2, 45.2, 'Within a week, it drops below zero.'],
  [45.8, 50.8, 'Power grids fail as the cold sets in.'],
  [51.4, 56.6, 'Snow falls from a clear, starry sky.'],
  [57.2, 62.6, 'The lake freezes over, starting at the shore.'],
  [63.2, 68.8, "After a year, it's 100 below zero."],
  [69.4, 75.2, 'Deep under the ice, the oceans stay liquid for thousands of years.'],
];

const pad2 = (n) => String(n).padStart(2, '0');
const fmtMS = (v) => { const s = Math.max(0, Math.ceil(v - 1e-6)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
const fmtHM = (v) => { const m = Math.max(0, Math.floor(v)); return `${Math.floor(m / 60)}:${pad2(m % 60)}`; };
const fmtF = (v) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v))}°`;

// The grid fails: the whole valley browns out and flickers together, then goes dark section by
// section (150 m cells), far shore first, sweeping in toward the camera. Shared by the window lights
// (bend.js), the street lamps (world.js), the city glow (main.js) and the soundtrack.
export const GRID = { brown: 46.0, t0: 47.2, span: 2.4, far: 1400, cell: 150, cx: 0, cz: 111 };
export const gridBrown = (t) => 1 - 0.55 * smooth(GRID.brown, GRID.brown + 0.5, t) * (0.55 + 0.45 * Math.sin(t * 31.0) * Math.sin(t * 17.3));
export function gridOffT(x, z) {
  const d = Math.hypot(x - GRID.cx, z - GRID.cz);
  const j = Math.floor(x / GRID.cell) * 0.618034 + Math.floor(z / GRID.cell) * 0.414214;
  return GRID.t0 + GRID.span * (0.75 * (1 - clamp(d / GRID.far)) + 0.25 * (j - Math.floor(j)));
}

export const dayOf = (t) => Math.max(1, Math.round(keys([[40, 1], [46, 3], [52, 7], [58, 30], [64, 90], [70, 200], [75.5, 365]], t, true)));

export const COUNTERS = [
  {
    from: 0, to: T_DARK + 0.4, label: 'LAST SUNLIGHT ARRIVES IN', unit: 'MINUTES', fmt: fmtMS,
    value: (t) => 500 * (1 - clamp((t - STORY_START) / (T_DARK - STORY_START))),
  },
  {
    from: T_DARK + 0.4, to: 39.8, label: 'TIME IN THE DARK', unit: 'HOURS', fmt: fmtHM,
    value: (t) => keys([[T_LIMB, 0], [T_LAPSE, 240], [39.8, 600]], t) ,
  },
  {
    from: 39.8, to: 76.2, label: 'TEMPERATURE', unit: (t) => `FAHRENHEIT · DAY ${dayOf(t)}`, fmt: fmtF,
    value: (t) => keys([[39.8, 61], [46, 32], [52, 0], [58, -30], [64, -62], [70, -86], [75.5, -100]], t),
    allowNegative: true,
  },
];

export function state(t) {
  const s = { t };
  // fraction of the sun's disk that has gone dark (centre first, edge last)
  s.sunCore = clamp((t - T_DARK) / (T_LIMB - T_DARK));
  // area-weighted light still arriving (limb darkened disk)
  s.sunLight = 1 - Math.pow(s.sunCore, 1.6);
  s.day = s.sunLight;

  // story clock: hours since the darkness (drives the turning sky)
  s.hours = t < T_LIMB ? 0 : keys([[T_LIMB, 0], [T_LAPSE, 4], [39.8, 10], [46, 72], [52, 168], [58, 720], [64, 2160], [70, 4800], [76, 8760]], t);
  // star-trail exposure window (radians of sky rotation shown at once)
  s.trail = Math.min(Math.PI * 2, keys([[T_LAPSE, 0], [40, 0.5], [46, 2.2], [52, 6.3]], t));

  // planets fade as their old sunlight runs out
  s.venus = 1 - smooth(26.6, 27.4, t);
  s.jupiter = 1 - smooth(29.3, 30.3, t);
  s.saturn = 1 - smooth(32.0, 33.2, t);

  // people, lights, traffic
  s.lookUp = smooth(T_DARK, T_DARK + 2, t);
  s.headlights = smooth(27.2, 28.4, t) * (1 - smooth(45, 52, t));
  s.streetlights = smooth(27.5, 28.0, t);
  s.phones = smooth(28.0, 30.5, t) * (1 - smooth(36, 42, t));
  s.traffic = 1 - smooth(25, 31, t);
  s.leave = smooth(33, 44, t);
  s.fires = smooth(49, 52, t) * (1 - smooth(64, 69, t));

  // cold
  s.snowFall = smooth(49.5, 52.5, t);
  s.snow = smooth(51, 66, t);
  s.ice = smooth(55.5, 71, t);           // freeze front progress
  s.frost = smooth(69.5, 75.8, t);       // lens frost
  s.waves = 1 - smooth(52, 62, t);

  // camera exposure: a phone camera fighting the dark
  s.exposure = lerp(0.82, 2.4, smooth(T_DARK + 0.5, 31, t)) * (1 - 0.35 * smooth(70, 75.8, t));
  s.title = 1 - smooth(STORY_START + 3.0, STORY_START + 3.8, t);   // fully up on the first frame
  s.fadeOut = smooth(74.8, 76.0, t);
  s.endcard = t >= 76.0 ? 1 : 0;
  s.endText = smooth(76.7, 77.8, t);
  s.flash = 0;
  s.flashColor = '#000';
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
