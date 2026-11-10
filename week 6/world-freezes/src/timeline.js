// "What if the world froze to absolute zero?": the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A bright, busy avenue on a sunny day, running north to the harbour. A wall of frost comes up the street from the sea;
// behind it the temperature falls, one visible step every 3 s, all the way to absolute zero. You never move.
// The numbers on screen (all °F; K = kelvin):
//   - water freezes at 32°F; -40° is the same in °F and °C, about a North Pole winter; -80°F a South Pole winter
//     (its winter average is about -76°F); -128.6°F is the coldest ever measured on Earth's surface (Vostok, 21 Jul 1983);
//   - the air's carbon dioxide freezes out as dry ice at about -226°F: dry ice sublimes at -109°F (194.7 K) at full
//     pressure, but in air CO2 is only 0.04% (0.4 mbar), and Clausius-Clapeyron (sublimation heat 25 kJ/mol, Mars' CO2 frost
//     at 148 K under 7 mbar as a check) puts its frost point near 130 K = -226°F;
//   - air turns to liquid at about -313°F: its dew point at 1 atm is 81.6 K (-312.8°F), and all of it is liquid at its bubble
//     point, 78.8 K (-317.8°F). While it condenses the temperature hardly falls (the counter crawls from -313 to -320);
//   - nitrogen freezes at 63.15 K (-346.0°F), oxygen at 54.36 K (-361.8°F). By then the air left as gas is about 1% of
//     today's (nitrogen's vapour pressure at 54 K is ~1.5 kPa): a sky that thin is dark blue-black, like 30 km up, and it
//     has no air to scatter blue light. Pluto's surface (about 40 K, -388°F) has an air ~100,000 times thinner than ours;
//   - absolute zero is 0 K = -459.67°F: nothing can be colder; atoms are as still as they can ever be.
// What is drawn vs what is real (also in CAPTIONS.md): the fall is a what-if, sped up to 46 s; the frost front is drawn as a
// wall of mist; liquid air would pile up about 40 ft deep (the air's weight, 10.3 t per m², at 0.87 t/m³) and run into the
// low ground, so the puddles here are drawn shallow; the sea's surface freezes at 28°F but the deep sea would take far
// longer; steel really does turn brittle in deep cold, but a tower shattering by itself is drawn, not computed.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const ABS_ZERO = -459.67;
// the temperature (°F) on each 3 s beat, from frame 0
export const BEATS = [
  [0, 68], [3, 32], [6, -40], [9, -80], [12, -129], [15, -170], [18, -226], [21, -313], [24, -320], [27, -346],
  [30, -362], [33, -388], [36, -420], [39, -445], [42, -455], [45, -459.2], [46.5, ABS_ZERO],
];
export const STEPS = BEATS.slice(1, -2).map((b) => b[0]);          // the jolts: 3 .. 42 s
export const V_FROST = 3.0;           // the frost front reaches you
export const V_FOUNT = 6.0;           // the fountain freezes mid-splash
export const V_BIRDS = 9.0;           // the birds drop
export const V_STALL = 12.0;          // the cars' engines die
export const V_STILL = 15.0;          // everyone freezes mid-step
export const V_CO2 = 18.0;            // dry ice snows out of the air
export const V_RAIN = 21.0;           // the air starts to rain
export const V_POUR = 24.0;           // liquid air pours and pools
export const V_SNOW = 27.0;           // nitrogen freezes: the air snows down
export const V_BLACK = 30.0;          // oxygen freezes, the sky goes black
export const V_SEA = 33.0;            // the sea ice cracks, frozen to the bottom
export const V_CRACK = 36.0;          // the towers crack
export const V_FALL = 39.0;           // a tower shatters
export const V_LENS = 42.0;           // frost creeps over your lens
export const V_ZERO = 46.5;           // absolute zero; the lens is solid ice
export const T_SWITCH = 47.1;         // the loop point, inside the ice
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;                     // 48.0 s

// ---- the temperature: through every beat, never quite stopping between them (so the hundredths keep racing) ----
const ease = (u) => 0.45 * u + 0.55 * u * u * (3 - 2 * u);
export function tempAt(v) {
  if (v <= 0) return 68 - 12 * v;                                   // (the loop's lead-in, under the ice)
  if (v >= V_ZERO) return ABS_ZERO;
  let i = 0;
  while (v >= BEATS[i + 1][0]) i++;
  const [a, ta] = BEATS[i], [b, tb] = BEATS[i + 1];
  const u = (v - a) / (b - a);
  // the last stretch closes in on the finish line and lands on it
  if (i >= BEATS.length - 2) return lerp(ta, tb, 1 - Math.pow(1 - u, 1.6));
  return lerp(ta, tb, ease(u));
}
export const fmtF = (T) => `${T < 0 ? '−' : ''}${Math.abs(T).toFixed(2)}°F`;

// ---- the frost front: comes up the avenue from the sea and passes you at V_FROST ----
export const CAM_Z = 8;
export const FRONT_SP = 40;            // m/s (90 mph)
export const frontZ = (v) => CAM_Z + FRONT_SP * (v - V_FROST);

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_FROST + 0.15, 'THE FROST REACHES YOU'],
  [V_FOUNT + 0.1, 'FROZEN MID-SPLASH'],
  [V_BIRDS + 0.1, 'BIRDS DROP OUT OF THE SKY'],
  [V_STALL + 0.1, 'EVERY CAR STALLS'],
  [V_STILL + 0.1, 'PEOPLE FREEZE MID-STEP'],
  [V_CO2 + 0.1, 'DRY ICE SNOWS DOWN'],
  [V_RAIN + 0.1, 'THE AIR TURNS TO RAIN'],
  [V_POUR + 0.1, 'PUDDLES OF LIQUID AIR'],
  [V_SNOW + 0.1, 'THE AIR FREEZES SOLID'],
  [V_BLACK + 0.1, 'THE SKY TURNS BLACK'],
  [V_SEA + 0.1, 'THE SEA FREEZES SOLID'],
  [V_CRACK + 0.1, 'THE TOWERS CRACK'],
  [V_FALL + 0.1, 'STEEL SHATTERS LIKE GLASS'],
  [V_LENS + 0.1, 'YOUR CAMERA FREEZES OVER'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together; nothing while the title is up) ----
export const CAPTIONS = [
  [4.85, 5.95, 'Water freezes at 32°F.'],
  [7.85, 8.95, 'As cold as the North Pole in winter.'],
  [10.85, 11.95, 'Like winter at the South Pole.'],
  [13.85, 14.95, 'Colder than Earth has ever been.'],
  [16.85, 17.95, 'Nobody can move.'],
  [19.85, 20.95, 'The carbon dioxide in the air froze.'],
  [22.85, 23.95, 'That rain is liquid air.'],
  [25.85, 26.95, 'You’d have nothing left to breathe.'],
  [28.85, 29.95, 'Every snowflake is frozen air.'],
  [31.85, 32.95, 'No air left to make it blue.'],
  [34.85, 35.95, 'As cold as Pluto.'],
  [37.85, 38.95, 'Steel turns as brittle as glass.'],
  [40.85, 41.95, 'Atoms have almost stopped moving.'],
  [43.85, 45.3, 'Nothing can ever be colder.'],
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

// ---- the counter: the temperature, racing down; the finish line under it ----
export const COUNTERS = [
  {
    from: -3, to: VIDEO_DURATION + 1, label: 'TEMPERATURE',
    fmt: (T) => fmtF(T),
    value: (v) => tempAt(v),
    allowNegative: true,
    unit: () => 'ABSOLUTE ZERO: −459.67°F',
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.T = tempAt(v);
  s.title = 1 - smooth(2.75, 3.1, v);
  s.front = frontZ(v);
  // how much of each jolt is happening now (camera kick, bloom)
  s.kick = 0;
  for (const t of STEPS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * (0.5 + 0.5 * t / 42)); }
  s.gust = smooth(V_FROST - 0.45, V_FROST, v) * (1 - smooth(V_FROST + 0.05, V_FROST + 0.9, v));   // the front's mist round you
  s.frost = 0.6 + 0.4 * smooth(V_FOUNT, V_STILL + 2, v);          // how thick the rime is, wherever the front has passed
  s.breath = smooth(1.0, V_FROST + 0.5, v) * (1 - smooth(V_STILL - 0.3, V_STILL + 0.2, v));
  s.dust = smooth(V_CO2 - 0.3, V_CO2 + 1.5, v) * (1 - smooth(V_RAIN, V_RAIN + 1.5, v));     // dry-ice snow
  s.rain = smooth(V_RAIN - 0.2, V_RAIN + 0.8, v) * (0.55 + 0.45 * smooth(V_POUR - 0.5, V_POUR + 0.6, v)) * (1 - smooth(V_SNOW - 0.4, V_SNOW + 0.5, v));
  s.pool = smooth(V_RAIN + 0.8, V_POUR + 2.5, v) * (1 - smooth(V_SNOW + 0.2, V_SNOW + 2.5, v));   // liquid air on the ground
  s.boil = s.pool;                                                                               // its mist
  s.snow = smooth(V_SNOW - 0.3, V_SNOW + 0.8, v) * (1 - 0.6 * smooth(V_BLACK + 3, V_SEA + 3, v));
  s.cover = smooth(V_SNOW + 0.3, V_BLACK + 2.5, v);                                              // the frozen air lying on everything
  s.dark = smooth(V_SNOW + 0.5, V_BLACK + 1.6, v);                                               // the sky going black
  s.seaCrack = smooth(V_SEA - 0.05, V_SEA + 2.4, v);
  s.crack = smooth(V_CRACK - 0.05, V_CRACK + 3.2, v);
  s.fall = clamp((v - V_FALL) / 4.0);
  s.lens = smooth(V_LENS - 0.2, V_ZERO + 0.1, v);
  s.flash = 0; s.flashColor = '#eef6ff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
