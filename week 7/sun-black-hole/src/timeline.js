// "What if the Sun turned into a black hole?": the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A crowded beach at noon. The Sun has already collapsed: what you see is its last light, still on the way. The counter
// races down the 8 min 20 s that light takes, the Sun goes out (its centre first, its edge 2.3 s later), and then the
// twist: Earth stays where it is, circling a black hole 3.7 miles wide. After that a time-lapse of the beach in the dark,
// one new thing every 3 s, from the lights coming on at noon to the sea frozen over a year later.
// The numbers (all on screen are true):
//   - light from the Sun takes 8 min 20 s to reach Earth (1 AU / c = 499 s on average; 490-507 s over the year);
//   - the Sun's centre is 696,000 km nearer to you than its edge, so its last light from the centre arrives 2.3 s
//     before the light from the edge: the dark opens from the middle out (radius sqrt(1 - (1 - t/2.32)^2));
//   - nothing (no signal, no gravity change) travels faster than light, so nobody on Earth can know before it goes out;
//   - a black hole with the Sun's mass: Schwarzschild radius 2GM/c^2 = 2.95 km, so 5.9 km = 3.7 miles across. Same mass,
//     same pull at 1 AU: Earth's orbit (and the year) doesn't change. Its gravity bends the light of the stars behind
//     it into an Einstein ring sqrt(2 Rs / 1 AU) = 2.0e-4 rad = 41 arcseconds in radius: far too small for the eye
//     (the Sun was 960"), so the video zooms in ~1,000x (drawn to scale at that zoom);
//   - street lights switch on by themselves in the dark (light sensors), whatever the time;
//   - cooling, from published estimates for Earth's average surface temperature: below 0°F within a week, about
//     -100°F after a year. The sea is far warmer than the air for weeks, so it steams ("sea smoke") and the steam
//     comes down as snow; seawater freezes at about 28°F; the sea freezes over, and the ice keeps the deep ocean
//     liquid underneath.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;

// ---- before the dark: the counter runs down the light's last 8:20 (500 s) ----
export const LIGHT_S = 500;
export const V_DARK = 9.0;            // the last light from the Sun's centre reaches you
export const LIMB_S = 2.32;           // ...and from its edge, this much later
export const V_GONE = V_DARK + LIMB_S;
// seconds of light left at video time v: a time-lapse that slows down (rate ~140x at frame 0) to real time for the
// last 3 s
const LAPSE_END = V_DARK - 3;
export function leftAt(v) {
  if (v >= LAPSE_END) return V_DARK - v;
  if (v <= 0) return LIGHT_S;                      // (the loop's lead-in: still 8:20.00, as on frame 0)
  const u = v / LAPSE_END;
  return 3 + (LAPSE_END - v) + (LIGHT_S - 3 - LAPSE_END) * Math.pow(1 - u, 3);
}
export const rateAt = (v) => (v >= LAPSE_END ? 1 : 1 + 3 * (LIGHT_S - 3 - LAPSE_END) / LAPSE_END * Math.pow(1 - v / LAPSE_END, 2));
// the people's own clock before the dark: lively, but never so fast that anyone zips about (max ~3x)
export function animT(v) {
  const L = LAPSE_END;
  if (v >= L) return L + 2 * L / 3 + (v - L);
  return v + 2 * L / 3 * (1 - Math.pow(1 - v / L, 3));
}

// ---- after the dark: story time since the last light (hours) ----
// (real time until the twist is over, then a time-lapse that speeds up: one beat every 3 s)
export const STEP = 3;
export const V_LIGHTS = 15.5;          // the street lights come on
export const V_HOME = 18.5;            // everyone heads home
export const V_FIRE = 21.5;            // fires on the beach
export const V_STEAM = 24.5;           // the sea steams
export const V_SNOW = 27.5;            // snow
export const V_PALMS = 30.5;           // the palm trees freeze
export const V_BURY = 33.5;            // the beach under snow (0°F, one week)
export const V_SLUSH = 36.5;           // the waves turn to slush
export const V_ICE = 39.5;             // the sea freezes over
export const V_YEAR = 42.5;            // one year in the dark
export const V_SHUT = 46.5;            // the lens is solid ice
export const T_SWITCH = 47.0;          // the loop point, inside the ice
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;                     // 47.9 s
export const STEPS = [3.0, 6.0, V_DARK, 12.0, V_LIGHTS, V_HOME, V_FIRE, V_STEAM, V_SNOW, V_PALMS, V_BURY, V_SLUSH, V_ICE, V_YEAR];

// days since the dark, at video time v (log-spaced keys)
const DAYS = [[V_DARK, 0], [15.0, 6 / 86400], [V_LIGHTS, 120 / 86400], [V_HOME, 1 / 24], [V_FIRE, 0.5], [V_STEAM, 2], [V_SNOW, 3], [V_PALMS, 5],
  [V_BURY, 7], [V_SLUSH, 20], [V_ICE, 60], [V_YEAR, 200], [45.2, 365]];
export function daysAt(v) {
  if (v <= V_DARK) return 0;
  if (v >= DAYS[DAYS.length - 1][0]) return 365;
  let i = 0;
  while (v >= DAYS[i + 1][0]) i++;
  const [a, da] = DAYS[i], [b, db] = DAYS[i + 1];
  const u = (v - a) / (b - a);
  if (da <= 0) return db * u;
  return Math.exp(lerp(Math.log(da), Math.log(db), u));
}
// the temperature (°F) after d days in the dark
const TEMP = [[0, 75], [1 / 24, 74.6], [0.5, 60], [1, 54], [2, 43], [3, 34], [5, 16], [7, 0], [20, -28], [60, -60], [200, -90], [365, -100]];
export function tempAt(d) {
  if (d <= 0) return 75;
  if (d >= 365) return -100;
  let i = 0;
  while (d >= TEMP[i + 1][0]) i++;
  const [a, ta] = TEMP[i], [b, tb] = TEMP[i + 1];
  const u = a <= 0 ? d / b : Math.log(d / a) / Math.log(b / a);
  return lerp(ta, tb, u);
}

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [3.0, 'THE SUN IS ALREADY GONE'],
  [6.0, 'NOBODY CAN KNOW YET'],
  [V_DARK + 0.05, 'THE SUN GOES OUT'],
  [12.0, 'EARTH DOESN’T FLY AWAY'],
  [V_LIGHTS + 0.1, 'THE LIGHTS COME ON AT NOON'],
  [V_HOME + 0.1, 'EVERYONE HEADS HOME'],
  [V_FIRE + 0.1, 'FIRES ON THE BEACH'],
  [V_STEAM + 0.1, 'THE SEA STARTS TO STEAM'],
  [V_SNOW + 0.1, 'SNOW ON THE BEACH'],
  [V_PALMS + 0.1, 'THE PALM TREES FREEZE'],
  [V_BURY + 0.1, 'BURIED IN SNOW'],
  [V_SLUSH + 0.1, 'THE WAVES TURN TO SLUSH'],
  [V_ICE + 0.1, 'THE SEA FREEZES OVER'],
  [V_YEAR + 0.1, 'ONE YEAR IN THE DARK'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together; nothing while the title is up) ----
export const CAPTIONS = [
  [4.85, 5.95, 'Its light takes 8 min 20 s to reach you.'],
  [7.85, 8.95, 'Nothing is faster than light.'],
  [10.85, 11.95, 'Day turns to night.'],
  [13.8, 15.2, 'It’s as heavy as the Sun, but only 3.7 miles wide.'],
  [17.35, 18.45, 'Their sensors think it’s night.'],
  [20.35, 21.45, 'The Sun will never rise again.'],
  [23.35, 24.45, 'It only gets colder from here.'],
  [26.35, 27.45, 'The sea is warmer than the air.'],
  [29.35, 30.45, 'The steam falls back as snow.'],
  [32.35, 33.45, 'Without light, every plant dies.'],
  [35.35, 36.45, 'In one week, it’s below 0°F.'],
  [38.35, 39.45, 'Seawater freezes at 28°F.'],
  [41.35, 42.45, 'Deep below, the ocean stays liquid.'],
  [44.35, 45.9, 'And Earth keeps circling the black hole.'],
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

// ---- the counters ----
const pad2 = (n) => String(n).padStart(2, '0');
const fmtLeft = (s) => {
  const c = Math.max(0, Math.ceil(s * 100 - 1e-6));
  const m = Math.floor(c / 6000), sec = Math.floor((c % 6000) / 100), cs = c % 100;
  return `${m}:${pad2(sec)}.${pad2(cs)}`;
};
export const fmtF = (T) => `${T < -0.004 ? '−' : ''}${Math.abs(T).toFixed(2)}°F`;
const when = (d) => (d < 1 / 24 ? 'TIME-LAPSE' : d < 1 ? `TIME-LAPSE · HOUR ${Math.floor(d * 24 + 1e-6)}` : d < 364.5 ? `TIME-LAPSE · DAY ${Math.floor(d + 1e-6)}` : 'ONE YEAR LATER');
export const V_TEMP = 15.0;            // the temperature counter takes over
export const COUNTERS = [
  {
    from: -3, to: V_DARK + 0.35, label: 'LIGHT STOPS IN',
    fmt: (s) => fmtLeft(s),
    value: (v) => leftAt(v),
    unit: (v) => (rateAt(v) > 1.6 ? 'TIME-LAPSE' : ''),
  },
  {
    from: V_TEMP, to: VIDEO_DURATION + 1, label: 'TEMPERATURE',
    fmt: (T) => fmtF(T),
    value: (v) => tempAt(daysAt(v)),
    allowNegative: true,
    unit: (v) => when(daysAt(v)),
  },
];

// ---- the Sun going out, as you see it ----
// the radius (in Sun radii) inside which its light has stopped, s seconds after the centre went dark
export const darkR = (s) => (s <= 0 ? 0 : s >= LIMB_S ? 9 : Math.sqrt(1 - Math.pow(1 - s / LIMB_S, 2)));
// the share of sunlight still arriving (limb-darkened disk, I = 1 - 0.6 (1 - mu))
export function sunLeft(s) {
  const r = darkR(s);
  if (r <= 0) return 1;
  if (r >= 1) return 0;
  // I = 0.4 + 0.6 mu, mu = sqrt(1 - r^2): the light from r..1 is G(1) - G(r), G(x) = 0.4 x^2 - 0.4 mu(x)^3
  const G = (x) => 0.4 * x * x - 0.4 * Math.pow(Math.sqrt(Math.max(0, 1 - x * x)), 3);
  return (G(1) - G(r)) / (G(1) - G(0));
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.left = leftAt(v);
  s.rate = rateAt(v);
  s.anim = animT(v);
  s.days = daysAt(v);
  s.T = tempAt(s.days);
  s.title = 1 - smooth(2.75, 3.1, v);
  // the Sun
  s.sunS = v - V_DARK;                    // seconds since the centre went dark
  s.sun = sunLeft(s.sunS);                // light still arriving (1 .. 0)
  s.night = 1 - s.sun;
  // the phone-camera exposure fighting the dark
  s.expo = smooth(V_GONE - 0.4, V_GONE + 2.4, v);
  // after the dark
  s.phones = smooth(V_GONE - 0.2, V_GONE + 1.4, v) * (1 - smooth(V_HOME + 0.5, V_HOME + 3, v));
  s.look = smooth(V_DARK - 0.2, V_DARK + 1.0, v);
  s.lights = smooth(V_LIGHTS - 0.05, V_LIGHTS + 1.2, v);       // street lights, pier, far city
  s.leave = clamp((v - V_HOME + 0.3) / 3.2);
  s.fire = smooth(V_FIRE - 0.4, V_FIRE + 0.6, v) * (1 - smooth(V_BURY - 0.5, V_BURY + 1.2, v));
  s.steam = smooth(V_STEAM - 0.6, V_STEAM + 1.2, v) * (1 - smooth(V_SLUSH - 0.8, V_SLUSH + 0.3, v)) * (1 - smooth(V_ICE - 0.5, V_ICE + 1.6, v));
  s.clouds = smooth(V_STEAM + 1, V_SNOW, v) * (1 - smooth(V_SLUSH - 0.8, V_SLUSH + 0.4, v));   // the overcast from the steam
  s.snowFall = smooth(V_SNOW - 0.4, V_SNOW + 0.8, v) * (1 - smooth(V_SLUSH - 0.8, V_SLUSH + 0.4, v));
  s.cover = smooth(V_SNOW + 0.3, V_BURY + 1.2, v);              // snow lying on everything
  s.frost = smooth(V_STEAM, V_PALMS + 1.5, v);                  // rime as it freezes
  s.palms = smooth(V_PALMS - 0.2, V_PALMS + 2.2, v);            // the fronds frost, brown and droop
  s.slush = smooth(V_SLUSH - 0.4, V_SLUSH + 1.4, v);
  s.ice = smooth(V_ICE - 0.3, V_ICE + 2.0, v);                  // the sea frozen over (out from the shore)
  s.cityDim = smooth(V_ICE, V_YEAR + 2, v);                     // fewer lights a year on
  s.lens = smooth(V_YEAR + 1.4, V_SHUT, v);
  s.kick = 0;
  for (const t of STEPS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * (t === V_DARK ? 1.0 : 0.45)); }
  s.flash = 0; s.flashColor = '#eef6ff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
