// "What if the biggest solar storm ever hit tonight?": the story as functions of VIDEO time v (seconds; STORY_START = 0).
// The 1859 solar storm (the Carrington Event) hits today's world. You're walking up a busy downtown avenue at night with
// the crowd; the whole sky is already rippling red and green and everyone is filming it. At 0:05 the storm hits: every
// sign, screen and street light dies in a wave down the street, sparks, a scream. Then the street is lit only by the sky
// and the cars' headlights; a transformer on the pole over you blows, sparks run along the wires; the traffic lights
// are dead and two cars bump at the crossing; phones lose service; people climb out of the dark subway; satellites burn up
// across the aurora; the skyline down the avenue goes dark block by block; people light the street with phone torches.
// The aurora flares until the whole sky is white, and the loop.
// The numbers (checked Nov 10, 2026):
//   - Lloyd's of London + AER, "Solar storm risk to the North American electric grid" (2013): a Carrington-level storm
//     today would leave 20-40 million people in the U.S. without power, for several weeks to one or two years
//     (Insurance Journal, May 23 2013, quoting the report). The counter runs to the top of that range (40 million) and
//     says "up to".
//   - the big (EHV) transformers: built to order; the U.S. Department of Energy (2014) put their lead time at 5-16 months
//     before the shortage, and 2-4 years in 2024-26 (Wood Mackenzie, NEMA). "A year or more" is the low side.
//   - 1859: telegraph lines sparked, operators got shocks and telegraph paper caught fire; the aurora was seen as far
//     south as the Caribbean and was bright enough in the U.S. North-East to read a newspaper by.
//   - 1989: a smaller storm took down the Quebec grid in 92 seconds (6 million people, 9 hours).
// What is drawn vs real: the storm's arrival is shown as the moment the grid fails (in reality ground currents build
// over minutes and grids collapse within a couple of minutes); the near street dies in a second and the rest of the
// city over ~25 s, so the counter's race is faster than real. The pole transformer blowing and the sparks at the signs
// stand in for the surges (1859's telegraph wires really sparked). Satellites dragged down by the swollen upper air
// (Starlink lost 38 in a mild storm in 2022) re-enter over days, not in the same minute: shown together for the story.
// Cars keep running, planes keep flying, nobody is hurt by the storm itself.
import { smooth, clamp, lerp, keys } from './util.js';

export const STORY_START = 0;
export const V_FLICK = 2.7;           // the street lights flicker once
export const V_HIT = 5.0;             // the storm hits: everything electric dies in a wave down the street
export const V_XF = 7.5;              // the transformer on the pole over you blows
export const V_LINES = 8.2;           // sparks run along the wires
export const V_BUMP = 14.2;           // two cars bump at the dead crossing
export const V_PHONE = 18.0;          // your phone: no service
export const V_SUBWAY = 22.0;         // people climb up the stairs out of the dark subway, toward you
export const V_SATS = 28.0;           // satellites burn up across the aurora (big, slow, several at once)
export const V_TORCH = 32.0;          // phone torches come on all along the street
export const V_CANDLE = 36.0;         // candles in the windows; people gather round the crashed car's light and radio
export const V_FULL = 40.0;           // the counter reaches its finish line
export const V_FLARE = 42.0;          // the aurora flares
export const V_WHITE = 46.2;          // full white
export const T_SWITCH = V_WHITE + 0.2;  // the loop point, inside the white (a short flash: 0.7 s up, 0.2 s held, 0.6 s clearing)
export const LOOP = 0.6;
export const VIDEO_DURATION = T_SWITCH + LOOP;                     // 47.0 s
export const BEATS = [V_HIT, V_XF, V_BUMP, V_PHONE, V_SUBWAY, V_SATS, V_CANDLE, V_FLARE];

// ---- the blackout front: how far from the middle of the street (ORIGIN) the power is gone (m) ----
// 0:05 the street dies in a wave running away from you (~200 m/s), then the towers down the avenue go out one after
// another: the whole city is dark 1.6 s after the hit.
export const ORIGIN = { x: 0, z: 4 };
const FRONT = [[V_HIT, 0], [V_HIT + 0.6, 120], [V_HIT + 1.15, 600], [V_HIT + 1.6, 3000], [V_HIT + 2.0, 9000]];
export function frontR(v) {
  if (v < V_HIT) return -1;
  for (let i = 0; i < FRONT.length - 1; i++) {
    const [a, x] = FRONT[i], [b, y] = FRONT[i + 1];
    if (v <= b) return lerp(x, y, (v - a) / (b - a));
  }
  return FRONT[FRONT.length - 1][1];
}
// when the front reaches distance r
export function dieAt(r) {
  for (let i = 0; i < FRONT.length - 1; i++) {
    const [a, x] = FRONT[i], [b, y] = FRONT[i + 1];
    if (r <= y) return lerp(a, b, (r - x) / (y - x));
  }
  return 1e9;
}
// the flicker at 0:02.7 (all street power): two quick dips
export function flick(v) {
  const t = v - V_FLICK;
  if (t < 0 || t > 0.5) return 1;
  return 1 - 0.85 * (smooth(0, 0.03, t) * (1 - smooth(0.09, 0.13, t))) - 0.6 * (smooth(0.24, 0.27, t) * (1 - smooth(0.3, 0.36, t)));
}
// the aurora's brightness: already bright, brighter and lower to the hit, surging, then the last flare to white
export function aurora(v) {
  const base = keys([[-2, 1.0], [0, 1.0], [V_HIT - 0.3, 1.45], [V_HIT + 0.2, 1.75], [V_HIT + 2, 1.4], [20, 1.35], [V_SATS - 1.4, 1.35], [V_SATS - 0.2, 0.8], [V_SATS + 5.2, 0.8], [V_SATS + 6.6, 1.3], [V_FLARE - 1, 1.4], [V_FLARE + 2, 2.4], [V_WHITE - 0.6, 7], [V_WHITE + 1, 14]], v);
  return base;
}
export const auroraLow = (v) => keys([[-2, 0], [V_HIT, 1], [V_HIT + 3, 0.7], [V_FLARE, 0.7], [V_WHITE, 1.3]], v);

// ---- the counter after the hit: people without power in the U.S. (Lloyd's 2013: 20-40 million; this runs to 40) ----
const POWER_N = [[V_HIT, 0], [V_HIT + 0.6, 300000], [V_HIT + 1.6, 1.4e6], [9, 3.0e6], [13, 5.6e6], [18, 9.4e6], [23, 14e6], [28, 19.5e6], [33, 26e6], [37, 33e6], [V_FULL - 0.8, 38.4e6], [V_FULL, 40e6]];
export function powerN(v) {
  if (v <= V_HIT) return 0;
  if (v >= V_FULL) return 40e6;
  for (let i = 0; i < POWER_N.length - 1; i++) {
    const [a, x] = POWER_N[i], [b, y] = POWER_N[i + 1];
    if (v <= b) { const u = (v - a) / (b - a); return lerp(x, y, i === POWER_N.length - 2 ? 1 - (1 - u) * (1 - u) : u); }
  }
  return 40e6;
}

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_HIT + 0.1, 'THE POWER DIES'],
  [V_XF + 0.05, 'A TRANSFORMER BLOWS'],
  [V_BUMP + 0.1, 'CARS COLLIDE'],
  [V_SUBWAY + 0.05, 'THE SUBWAY STOPS'],
  [V_SATS + 0.6, 'SATELLITES BURN UP'],
  [V_CANDLE + 0.2, 'CANDLES COME OUT'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together; nothing while the title is up) ----
export const CAPTIONS = [
  [3.05, 4.95, 'In 1859 it was bright enough to read by.'],
  [9.35, 12.3, 'In 1859, telegraph wires sparked and set paper on fire.'],
  [12.45, 14.15, 'Every traffic light is out.'],
  [16.0, 17.9, 'Cars still run. Planes still fly.'],
  [18.15, 21.0, 'Your phone: no service.'],
  [23.85, 27.6, 'Everyone walks up out of the tunnels.'],
  [30.5, 33.0, 'The storm drags them out of orbit.'],
  [33.3, 35.8, 'It could stay off for months.'],
  [38.1, 41.4, 'The giant transformers take a year or more to replace.'],
  [41.7, 44.4, 'And the storm isn’t over.'],
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

// ---- the counter: the countdown to the hit, then the people without power ----
let _t = 0;
export const COUNTERS = [
  {
    from: -3, to: VIDEO_DURATION + 1, label: 'STORM HITS IN', allowNegative: true,
    labelFn: (t) => (t < V_HIT ? 'STORM HITS IN' : 'PEOPLE WITHOUT POWER'),
    value: (t) => { _t = t; return t; },
    fmt: () => {
      if (_t < V_HIT) { const s = Math.max(0, V_HIT - _t); return `0:0${s.toFixed(2)}`; }
      return Math.round(powerN(_t)).toLocaleString('en-US');
    },
    unit: (t) => (t < V_HIT ? 'PEOPLE WITHOUT POWER: 0' : 'IN THE U.S. · UP TO 40 MILLION'),
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.title = 1 - smooth(2.6, 2.95, v);
  s.white = smooth(V_WHITE - 0.7, V_WHITE, v);
  s.flash = 0; s.flashColor = '#ffffff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  s.front = frontR(v);
  s.flick = flick(v);
  s.aur = aurora(v);
  s.low = auroraLow(v);
  return s;
}
export { lerp };
