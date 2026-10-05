// "What if Earth stopped orbiting the Sun?" — the story as functions of video time (seconds).
// Physics: from rest at 1 AU, Earth falls straight in. Radial free fall: r = cos²(b) AU and
// t = K (b + sin b cos b), with K = 41.1 days, so it reaches the Sun after ~64.6 days.
// The Sun looks 1/r times wider; the ground heats roughly like 288 K / sqrt(r).
import { smooth, keys, lerp, clamp } from './util.js';

export const DURATION = 66;
export const STORY_START = 0;            // this one is written to open straight into the action
export const VIDEO_DURATION = DURATION - STORY_START;
export const T_STOP = 5.6;               // Earth stops dead in its orbit
export const T_FALL = 15.8;              // ...and the fall becomes the story

const TFALL = 64.6, K = TFALL / (Math.PI / 2);
export function distAU(day) {
  const target = Math.min(Math.max(day, 0), TFALL) / K;
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (m + Math.sin(m) * Math.cos(m) < target) lo = m; else hi = m; }
  return Math.max(Math.cos(lo) ** 2, 0.004);
}
export const tempF = (r) => (288 / Math.sqrt(r) - 273.15) * 9 / 5 + 32;
export const dayOf = (t) => keys([[T_FALL, 0], [18.5, 1], [23, 20], [28, 41], [32.8, 49], [37.6, 57], [42.4, 61], [47.4, 63.2], [52.2, 64.1], [56.6, 64.48], [61.5, 64.58]], t);

export const CAPTIONS = [
  [1.0, 4.6, "Right now, you're flying around the Sun at 67,000 mph."],
  [5.0, 8.6, 'Now imagine Earth just… stops.'],
  [9.0, 12.2, "You wouldn't feel a thing."],
  [12.6, 15.6, 'But nothing is holding Earth up anymore.'],
  [16.0, 20.6, 'So it starts to fall toward the Sun.'],
  [21.0, 25.8, "For weeks, it doesn't look like much."],
  [26.2, 31.2, "Day 41: we cross Venus's orbit. It's 150°F."],
  [31.6, 36.4, 'Day 49: the oceans start to boil.'],
  [36.8, 41.6, 'Day 57: past Mercury. Forests catch fire.'],
  [42.0, 46.8, "Day 61: it's hot enough to melt lead."],
  [47.2, 51.4, 'The shallow seas boil dry.'],
  [51.8, 55.4, 'Day 64: the Sun fills the sky.'],
  [55.8, 58.4, 'The sand melts into glass.'],
  [58.8, 61.4, 'The whole fall takes just 65 days.'],
];

const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
const fmtF = (v) => `${Math.round(v)}°`;
export const COUNTERS = [
  {
    from: 0, to: T_FALL, label: "EARTH'S SPEED AROUND THE SUN", unit: 'MILES PER HOUR', fmt: fmtInt,
    value: (t) => 66600 * (1 - smooth(T_STOP, T_STOP + 2.2, t)),
  },
  {
    from: T_FALL, to: 36.6, label: 'DISTANCE TO THE SUN', unit: (t) => `MILES · DAY ${Math.max(1, Math.floor(dayOf(t)))}`, fmt: fmtInt,
    value: (t) => distAU(dayOf(t)) * 92_960_000,
  },
  {
    from: 36.6, to: 61.2, label: 'TEMPERATURE', unit: (t) => `FAHRENHEIT · DAY ${Math.max(1, Math.floor(dayOf(t)))}`, fmt: fmtF,
    value: (t) => tempF(distAU(dayOf(t))),
  },
];

export function state(t) {
  const s = { t };
  s.day = dayOf(t);
  s.r = distAU(s.day);
  s.sunScale = 1 / s.r;                              // apparent size relative to today
  s.tempF = tempF(s.r);
  s.heat = clamp((s.tempF - 75) / 650);              // 0 normal .. 1 furnace
  s.stop = smooth(T_STOP, T_STOP + 2.2, t);
  // the beach empties as it gets hot; plants brown, the sea steams, then things burn
  s.crowd = 1 - smooth(21, 29, t);
  s.brown = smooth(24, 36, t);
  s.boil = smooth(31.6, 37, t);
  s.fire = smooth(37.5, 43, t);
  s.smoke = smooth(39, 50, t) * (1 - 0.6 * smooth(52, 58, t));
  s.lightsOut = smooth(33, 38, t);
  s.glare = smooth(56, 61, t);
  s.glow = clamp((s.tempF - 950) / 2400);   // red-hot from ~1,000°F
  s.melt = clamp((s.tempF - 2200) / 700);   // beach sand fuses into glass around 2,600-3,100°F
  s.waves = 1 - 0.5 * s.boil;
  s.drain = smooth(46.5, 56, t);                     // shallow coastal water boils off (hours, at this distance)
  // camera exposure: a phone fighting more and more light
  s.exposure = keys([[0, 0.95], [22, 0.92], [40, 0.86], [52, 0.8], [58, 0.74]], t);
  s.title = 1 - smooth(3.0, 3.8, t);
  s.flash = smooth(60.0, 62.0, t);
  s.flashColor = '#fff6e6';
  s.fadeOut = 0;
  s.endcard = t >= 62.2 ? 1 : 0;
  s.endText = smooth(62.7, 63.7, t);
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
