// "What if a 1-mile asteroid hit the ocean?" — the story as functions of time (seconds, 0..80).
import { smooth, keys, lerp, clamp } from './util.js';

export const DURATION = 80;
// the video starts this far into the story, so something is already happening on the first frame
export const STORY_START = 11.0;
// The video loops: after the wave hits, the deep water closes over everything (UNDER_COLOR), at T_SWITCH the
// scene jumps back to just before the first frame, and the water clears into it over the last LOOP seconds,
// like surfacing, so the last frame runs straight into the first. (No end card: a black screen at the end makes
// people swipe away.)
export const T_SWITCH = 74.9;
export const LOOP = 0.9;
export const UNDER_COLOR = '#04191b';
export const VIDEO_DURATION = T_SWITCH - STORY_START + LOOP;
export const T_IMPACT = 16.5;
export const T_SHOCK = 35.0;       // air blast reaches the city
export const T_BEACH = 70.5;       // wave front reaches the promenade
export const T_ENGULF = 72.72;     // the face of the wave reaches the lens (found frame by frame in renders: video 61.72 s)

export const CAPTIONS = [
  [11.0, 14.6, "You're on a Greek island. A mile-wide asteroid is seconds from impact."],
  [14.9, 16.5, 'Watch the horizon.'],
  [18.2, 22.8, 'It hits the ocean 60 miles offshore.'],
  [23.4, 28.4, 'A column of steam rises 20 miles high.'],
  [29.0, 34.4, 'The ground shakes first. Then comes the shockwave.'],
  [36.0, 40.8, 'Every window in the city shatters.'],
  [41.6, 46.6, 'Then the sea pulls away from the shore.'],
  [47.2, 52.2, 'Boats are left stranded on the seabed.'],
  [52.8, 57.6, "That's the warning. You have minutes."],
  [58.2, 63.4, 'A dark line appears on the horizon.'],
  [64.0, 69.2, 'The wave is 600 feet tall.'],
  [69.8, 73.6, 'It hits the coast at 100 miles an hour.'],
];

const pad2 = (n) => String(n).padStart(2, '0');
const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
const fmtMS = (v) => { const s = Math.max(0, Math.ceil(v - 1e-6)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };

export const COUNTERS = [
  {
    from: 0, to: T_IMPACT + 0.3, label: 'ASTEROID', unit: 'MILES AWAY', fmt: fmtInt,
    value: (t) => keys([[4.4, 3100], [10, 1180], [13, 420], [15.4, 90], [T_IMPACT, 0]], t),
  },
  {
    from: T_IMPACT + 0.3, to: T_SHOCK + 0.4, label: 'SHOCKWAVE ARRIVES IN', unit: 'MINUTES', fmt: fmtMS,
    value: (t) => 282 * (1 - clamp((t - T_IMPACT - 0.3) / (T_SHOCK - T_IMPACT - 0.3))),
  },
  {
    from: T_SHOCK + 0.4, to: T_BEACH, label: 'TSUNAMI ARRIVES IN', unit: 'MINUTES', fmt: fmtMS,
    value: (t) => 203 * (1 - clamp((t - T_SHOCK - 0.4) / (T_BEACH - T_SHOCK - 0.4))),
  },
  {
    from: T_BEACH, to: 76.2, label: 'THE WAVE', unit: 'FEET AWAY', fmt: fmtInt,
    // distance to the face, not to the crest: the curling lip runs ~40 m ahead of waveFront, so count down to the moment it hits
    value: (t) => Math.max(0, waveFront(t) - waveFront(T_ENGULF)) * 3.281,
  },
];

// where the front of the wave is (metres from the camera); its lip reaches the lens at T_ENGULF, before this reaches 0
const waveFront = (t) => keys([[57.5, 16000], [62, 9000], [66, 4200], [68.5, 1800], [T_BEACH, 230], [72, 95], [73.4, -5], [76, -60]], t);

export function state(t) {
  const s = { t };
  // asteroid entry: progress along its path in the sky (accelerates as it closes in)
  s.rock = clamp((t + 4.0) / (T_IMPACT + 4.0));   // on the first frame it's already well into the sky, its trail streaming from the corner
  s.rockPath = Math.pow(s.rock, 2.2);
  s.rockGlow = (0.78 + 0.22 * smooth(11, 15.5, t)) * smooth(9.2, 10.2, t) * (t < T_IMPACT ? 1 : 0);   // already blazing on the first frame
  s.trailFade = t < T_IMPACT ? 1 : 1 - 0.75 * smooth(T_IMPACT, 60, t);

  // impact
  const di = t - T_IMPACT;
  s.flash = di < 0 ? 0 : clamp(1 - di / 1.4) * clamp(di / 0.05);
  s.flashColor = '#fff4e0';
  s.impactLight = di < 0 ? 0 : Math.exp(-di * 1.6) * 30 + (di < 6 ? 2 * Math.exp(-di * 0.4) : 0);
  s.fireball = smooth(T_IMPACT, T_IMPACT + 3.5, t) * (1 - 0.85 * smooth(T_IMPACT + 3, T_IMPACT + 10, t));
  s.plume = smooth(T_IMPACT + 1.5, 36, t);          // steam column growth 0..1
  s.anvil = smooth(30, 62, t);                      // cap spreading out
  s.haze = smooth(24, 64, t);                       // sky dims/oranges as steam spreads

  // shock
  s.shockFront = keys([[31.8, 24000], [T_SHOCK, 0]], t);   // metres from camera
  s.shockOn = t > 31.8 && t < T_SHOCK + 0.2 ? 1 : 0;
  s.blast = smooth(T_SHOCK - 0.05, T_SHOCK + 0.05, t) * (1 - smooth(T_SHOCK + 0.5, T_SHOCK + 5, t));

  // sea
  s.drawback = smooth(41.5, 56, t) * (1 - smooth(68, 71, t));                // metres x 14
  s.waveF = waveFront(t);
  s.waveH = keys([[57.5, 80], [62, 130], [66, 165], [68.5, 180], [T_BEACH, 185], [73.4, 175]], t);
  s.waveOn = t > 57 ? 1 : 0;
  s.lip = smooth(66, T_BEACH, t);                   // crest starts to curl over
  s.under = t >= T_ENGULF ? 1 : 0;                  // straight underwater on the frame the water hits

  // shaking
  s.quake = smooth(17.6, 18.6, t) * (1 - smooth(21, 25, t)) * 0.8 + s.blast * 2.2 + smooth(64, T_ENGULF, t) * 1.3;

  // people + traffic
  s.stopLook = smooth(T_IMPACT, T_IMPACT + 1.5, t);
  s.run = smooth(52, 56, t);

  s.exposure = lerp(0.95, 0.85, s.haze) * (1 - 0.5 * s.under) * (1 - 0.1 * (1 - smooth(16.5, 21, t)));   // a touch darker before the impact: more contrast on the opening
  s.title = 1 - smooth(STORY_START + 3.0, STORY_START + 3.8, t);   // fully up on the first frame
  s.fadeOut = 0;
  if (t > T_ENGULF) { s.flash = smooth(T_SWITCH - 0.6, T_SWITCH, t); s.flashColor = UNDER_COLOR; }   // the water closes over everything
  s.endcard = t >= 76.0 ? 1 : 0;
  s.endText = smooth(76.7, 77.8, t);
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
