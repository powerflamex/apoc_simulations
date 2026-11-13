// "What if the biggest meteor storm ever hit tonight?": the story as functions of VIDEO time v (seconds; STORY_START = 0).
// You're on a packed waterfront at night; the sky is already full of shooting stars streaming from one point (the
// radiant, in Leo) and everyone is filming. 0:00-0:05 the real part: a normal Leonid night (about 15 an hour), then
// 1,000, then the great storm of November 1833 (about 100,000 an hour). From 0:05 a what-if, said on screen: the rocks
// get bigger. The first fireball throws shadows and booms; fireballs light the street; a sonic boom shakes the windows
// and sets off the car alarms; a rock hits the harbour; one crushes a parked car; one as bright as the Sun, and
// everyone runs for the covered pier. The biggest one (330 ft) comes down over the skyline: night turns to day, and it
// hits beyond the city. White, and the loop.
// The numbers (checked Nov 13, 2026):
//   - Leonids: a normal year's peak is about 10-15 an hour (IMO ZHR 15). They hit the air at about 71 km/s (NASA; the
//     fastest of the big showers). Most are 1 mm - 1 cm grains; a 1 cm Leonid is about 0.5 g.
//   - 1833: "over one hundred thousand meteors an hour" at the peak (the usual estimate; others 72,000-240,000 over the
//     night). People thought the world was ending (Wikipedia, Space.com). (1966's storm may have peaked higher, ~144,000
//     an hour, for less than an hour: so the video says "1833: 100,000", never "the record".)
//   - Brightness vs size at 71 km/s (Leonid table: 1 cm ~ mag -1.5, 2 cm ~ -3.8, Venus): ten times wider is ~1,000 times
//     the mass and ~7.5 magnitudes brighter. 8 in (20 cm) ~ -11 (near the full Moon, -12.7: enough for shadows);
//     2 ft ~ -15 (brighter than the full Moon); 65 ft (20 m) ~ -26 (about the Sun, -26.7; Chelyabinsk, 2013, ~20 m at
//     19 km/s, was brighter than the Sun).
//   - Sonic booms: meter-size and bigger rocks (2025 Georgia fireball ~1 m, 2012 California ~3-4 m) are heard on the
//     ground. Pieces reaching the ground: real Leonids never drop meteorites (fragile comet dust); in the what-if the
//     rocks are bigger and pieces fall. (A real meteorite hit a parked car in Peekskill, NY, 1992.)
//   - The last one: 100 m (330 ft) of stone (3,000 kg/m3) at 71 km/s: m = 1.57e9 kg, E = 0.5 m v^2 = 3.96e18 J =
//     946 megatons, "nearly 1,000 megatons"; the Tsar Bomba was 50 Mt: 19 times.
// What is drawn vs real: the shower's density is drawn heavier than 100,000 an hour would look in this patch of sky;
// the booms come a second or two after each fireball (a real one's boom takes a minute or more to arrive); rocks that
// reach the ground are drawn glowing to the end (real meteorites cool off in the last few km); the last rock's
// approach is stretched (a real one crosses the sky in a few seconds).
import { smooth, clamp, lerp, keys } from './util.js';

export const STORY_START = 0;
export const V_REAL = 4.6;            // the counter reaches 1833's 100,000 an hour
export const V_FB1 = 5.0;             // the first fireball (8 in): shadows, a boom
export const V_BOOM1 = 6.7;
export const V_DAY = 9.0;             // three fireballs at once (2 ft): the street lights up
export const V_BOOM = 13.0;           // a 6 ft rock low over the harbour: the sonic boom, windows, car alarms
export const V_SPLASH = 17.5;         // a 20 ft rock breaks up: a piece hits the harbour
export const V_CAR = 22.0;            // a 40 ft rock: a piece crushes a parked car
export const V_RUN = 26.5;            // a 65 ft rock, as bright as the Sun: everyone runs for the covered pier
export const V_BIG = 31.0;            // the biggest one appears at the radiant
export const V_FULL = 32.0;           // the counter reaches its finish line (330 ft)
export const V_DIVE = 41.0;           // it starts racing down toward the skyline
export const V_IMPACT = 45.8;         // it hits beyond the skyline
export const V_WHITE = 46.2;          // full white
export const T_SWITCH = V_WHITE + 0.2;
export const LOOP = 0.7;
export const VIDEO_DURATION = T_SWITCH + LOOP;                      // 47.1 s
export const BEATS = [V_FB1, V_DAY, V_BOOM, V_SPLASH, V_CAR, V_RUN, V_BIG, V_DIVE];

// ---- the counter ----
// 0:00-0:04.6 meteors per hour, 15 (a normal Leonid night) racing up to 100,000 (1833); then the rocks' size (what-if)
const RATE = [[0, 15], [1.2, 160], [2.2, 1000], [3.4, 12000], [V_REAL, 100000]];
export const rateAt = (v) => (v <= 0 ? 15 : v >= V_REAL ? 100000 : Math.exp(keys(RATE.map(([t, x]) => [t, Math.log(x)]), v)));
const SIZE = [[V_FB1 - 0.2, 0.67], [V_DAY, 2], [V_BOOM, 6], [V_SPLASH, 20], [V_CAR, 40], [V_RUN, 65], [V_FULL, 330]];   // feet
export const sizeFt = (v) => Math.exp(keys(SIZE.map(([t, x]) => [t, Math.log(x)]), v));
// how busy the shower looks (meteors per second drawn over the whole sky)
export const showerRate = (v) => 26 + 34 * smooth(-0.5, V_REAL, v) + 10 * smooth(V_DAY, V_RUN, v) - 20 * smooth(V_IMPACT + 0.5, VIDEO_DURATION + 1, v);

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_DAY + 0.15, 'THE STREET LIGHTS UP'],
  [V_BOOM + 0.1, 'A SONIC BOOM'],
  [V_SPLASH + 0.15, 'ONE HITS THE HARBOR'],
  [V_CAR + 0.08, 'A CAR IS CRUSHED'],
  [V_RUN + 0.3, 'EVERYONE RUNS'],
  [V_BIG + 0.3, 'THE BIGGEST ONE'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups; nothing while the title is up) ----
export const CAPTIONS = [
  [2.95, 4.85, 'This really happened in 1833.'],
  [5.3, 8.6, 'From here on it’s a what-if: the rocks get bigger.'],
  [10.95, 12.85, 'Each one brighter than the full Moon.'],
  [14.9, 17.4, 'Every window on the quay shakes.'],
  [19.45, 21.9, 'Now pieces are reaching the ground.'],
  [23.9, 26.4, 'Rocks are falling all over the city.'],
  [28.1, 30.9, 'That one was as bright as the Sun.'],
  [33.2, 37.2, 'Nearly 1,000 megatons: 19 times the biggest bomb ever.'],
  [38.0, 40.6, 'Night turns into day.'],
  [41.3, 44.4, 'And it’s coming down just past the city.'],
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

const fmtSize = (ft) => {
  if (ft < 1) return `${Math.max(1, Math.round(ft * 12))} INCHES`;
  if (ft < 1.5) return '1 FOOT';
  return `${Math.round(ft)} FEET`;
};
let _t = 0;
export const COUNTERS = [
  {
    from: -3, to: VIDEO_DURATION + 1, label: 'METEORS PER HOUR', allowNegative: true,
    labelFn: (t) => (t < V_FB1 - 0.2 ? 'METEORS PER HOUR' : 'SIZE OF THE ROCKS'),
    value: (t) => { _t = t; return t; },
    fmt: () => {
      if (_t >= V_FB1 - 0.2) return fmtSize(sizeFt(_t));
      const r = rateAt(_t), q = r < 100 ? 1 : r < 10000 ? 10 : 100;
      return (Math.round(r / q) * q).toLocaleString('en-US');
    },
    unit: (t) => (t < V_FB1 - 0.2 ? 'IN 1833: 100,000' : 'WHAT IF · UP TO 330 FT'),
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.title = 1 - smooth(2.6, 2.95, v);
  s.white = smooth(V_IMPACT, V_WHITE, v);
  s.flash = 0; s.flashColor = '#ffffff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
