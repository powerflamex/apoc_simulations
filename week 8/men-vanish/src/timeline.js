// "What if every man disappeared?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// Rush hour at a busy downtown corner, 5:00 PM in late September, the Sun low in the south-west behind you. At V_EVENT
// every man and boy on Earth (4.17 billion, UN World Population Prospects 2024 for 2026) vanishes mid-step: the clothes
// drop, half the crowd is gone, cars with nobody at the wheel roll on and crash. From then on the counter is DAYS
// WITHOUT MEN, racing up to its finish line, FIRST NEW BABY: DAY 280. Every beat is a later day and a bigger step:
//   day 0      cars crash on the corner;
//   day 0.6    the next morning a jet comes down: its autopilot flew it on through the night until the fuel ran out
//              (about 19 in 20 airline pilots are men: 5-6% women worldwide, ISWAP/IATA);
//   day 0.6-1  the crane's load hangs stuck over the street all day (95.5% of US crane operators are men, BLS 2025);
//   day 2      night falls and the lights flicker and fail, block by block (96.2% of US power-line workers, BLS 2025);
//   day 3-6    the highway: dead trucks, nothing moving (92.3% of US truck drivers, BLS 2025: food stops moving);
//   day 6-14   the shops empty and shut;
//   day 14     the twist: frozen sperm (one bank, the Hunan sperm bank in China, studied 119,558 frozen donor samples:
//              Huang et al., ESHRE 2019); women inseminated with it;
//   day 14-280 a woman on the corner bench, her belly growing as the seasons turn;
//   day 280    the first new baby (conception on day 14 + 266 days of pregnancy, the standard figure from conception);
//              we turn into the low Sun: white. The loop clears onto the rush hour.
// Time-lapse rules: locked camera; the light is either real time or sampled at one hour of every day (so it never
// strobes day/night).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const V_EVENT = 1.0;              // every man vanishes
export const V_NIGHT1 = 3.7;             // the first night passes (time-lapse)
export const V_MORN = 5.4;               // the next morning, real time: the jet
export const V_BOOM = 9.35;              // it comes down beyond the skyline
export const V_CRANE = 10.7;             // day 1 morning: we fly up into the crane's empty cab
export const V_DUSK = 15.0;              // day 2, 8:30 PM, real time: the lights flicker and fail
export const V_TRUCK = 19.6;             // day 3, real time: up on the dead highway
export const V_LAPSE = 24.0;             // days 6-14: the shops empty
export const V_LAB = 30.0;               // day 14: the sperm bank
export const V_PREG = 35.2;              // days 14-270: the bench, the seasons
export const V_BABY = 41.0;              // day 280: the first baby
export const V_SUNTURN = 45.9;           // we turn into the low Sun
export const T_SWITCH = 47.6;            // full white: the loop point
export const LOOP = 0.9;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const MEN = 4.17e9;
export const BABY_DAY = 280;
export const HITS = [V_EVENT, 2.35, V_MORN, V_BOOM, V_CRANE, V_DUSK + 1.6, V_TRUCK, V_LAPSE, V_LAB, V_PREG, V_BABY + 1.0];

// ---- the story clock: days since they vanished ----
const S = 1 / 86400;
export const H0 = 17.0;                                     // 5:00 PM
const seg = (v, a, b, d0, d1, pw = 1) => d0 + (d1 - d0) * Math.pow(clamp((v - a) / (b - a)), pw);
export function dayAt(v) {
  if (v < V_EVENT) return 0;
  if (v < V_NIGHT1) return (v - V_EVENT) * S;                                        // real time
  if (v < V_MORN) return lerp((V_NIGHT1 - V_EVENT) * S, 0.62, smooth(V_NIGHT1, V_MORN, v)); // through the night
  if (v < V_CRANE) return 0.62 + (v - V_MORN) * S;                                   // real time: the jet
  if (v < V_DUSK) return seg(v, V_CRANE, V_DUSK, 0.63, 0.665);                       // day 1 morning: up into the crane's cab
  if (v < V_TRUCK) return 2.105 + (v - V_DUSK) * S;                                  // day 2, 8:30 PM, real time: the lights fail
  if (v < V_LAPSE) return 3.75 + (v - V_TRUCK) * S;                                  // day 3, 11 AM, real time: the highway
  if (v < V_LAB) return seg(v, V_LAPSE, V_LAB, 4.0, 13.6, 1.1);                      // sampled 3 PM: the shops empty
  if (v < V_PREG) return 14.0 + (v - V_LAB) * S;                                     // real time: the lab
  if (v < V_BABY) return seg(v, V_PREG, V_BABY - 0.3, 14.7, 272.7, 1.15);            // sampled 10 AM
  return Math.min(BABY_DAY, 272.7 + 7.3 * smooth(V_BABY - 0.3, V_BABY + 1.4, v));     // 6 PM, landing on 280
}
// the hour shown
export function hourAt(v) {
  if (v < V_EVENT) return H0 + (v - V_EVENT) / 3600;
  if (v < V_LAPSE) return (H0 + dayAt(v) * 24) % 24;
  if (v < V_LAB) return 15;
  if (v < V_BABY) return 10;
  return 19.75;                                          // (early July: the Sun is as low at 7:45 PM as it was at 6:15)
}
// season: 0 late September .. through winter .. 1 early July (day 280)
export const seasonAt = (v) => clamp(dayAt(v) / BABY_DAY);

// ---- the Sun, from the hour (latitude 40° N; the declination follows the date: day 0 = September 23) ----
const DEG = Math.PI / 180;
export function sunDir(hour, day = 0, westAz = false) {
  const decl = -23.44 * Math.cos(2 * Math.PI * (266 + day + 10) / 365);
  const phi = 40 * DEG, dec = decl * DEG, H = (hour - 12.9) * 15 * DEG;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  // (day 280's evening Sun is drawn right down the cross street, which runs east-west; its true bearing is ~25° north of that)
  if (westAz) az = 271 * DEG;
  return { el, az, x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
}

// ---- power: on day 2 the lights come on at dusk, flicker, and go out block by block; back by the spring ----
// returns { p: share of the city still powered, f: the whole grid's flicker (0..1) }
export function powerAt(v) {
  if (v < V_DUSK) return { p: 1, f: 1 };
  if (v >= V_PREG) return { p: smooth(V_PREG + 1.0, V_PREG + 3.0, v), f: 1 };
  if (v >= V_TRUCK) return { p: 0.03, f: 1 };
  const t = v - (V_DUSK + 0.9);                          // (real time: a second of normal evening, then it goes)
  if (t < 0) return { p: 1, f: 1 };
  const n = 0.5 + 0.5 * Math.sin(t * 21.0) * Math.sin(t * 8.3 + 1.3);
  const thr = smooth(0.0, 2.4, t);
  const f = n > thr * 0.95 ? 1 : 0.1;
  return { p: lerp(1, 0.035, smooth(0.5, 2.8, t)), f };
}

// ---- text: captions (never more than one; none while the title is up) ----
export const CAPTIONS = [
  [3.05, 5.2, '4 billion men and boys just vanished.'],
  [5.6, 9.1, 'About 19 in 20 airline pilots were men.'],
  [11.0, 14.7, 'Almost every crane operator was a man.'],
  [15.5, 19.3, '96 in 100 power-line workers were men.'],
  [19.9, 23.7, '9 in 10 truck drivers were men. Food stops moving.'],
  [24.3, 29.6, 'Within a week, the shops are empty.'],
  [30.25, 32.3, 'But humanity doesn’t end.'],
  [32.55, 35.0, 'One sperm bank in China alone stored 119,558 frozen samples.'],
  [35.6, 40.6, 'Within two weeks, women are getting pregnant.'],
  [42.0, 44.6, 'Half the new babies are boys.'],
  [44.9, 46.9, 'Who would you miss first?'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.25), fadeOut = clamp((b - v) / 0.25);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: a countdown on frame 0, then DAYS WITHOUT MEN racing; one line under it: the finish line ----
export function counterAt(v) {
  if (v < V_EVENT) return { label: 'EVERY MAN DISAPPEARS IN', value: `${Math.max(0, V_EVENT - v).toFixed(2)} s`, line: '5:00 PM · RUSH HOUR' };
  const d = dayAt(v);
  return { label: 'DAYS WITHOUT MEN', value: d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), line: `FIRST NEW BABY: DAY ${BABY_DAY}` };
}

// ---- the state at video time v ----
export function sceneAt(v) {
  return v < V_NIGHT1 ? 'rush' : v < V_MORN ? 'night1' : v < V_CRANE ? 'morning' : v < V_DUSK ? 'crane' : v < V_TRUCK ? 'dusk'
    : v < V_LAPSE ? 'highway' : v < V_LAB ? 'shops' : v < V_PREG ? 'lab' : v < V_BABY ? 'preg' : 'baby';
}
export function state(v) {
  const s = { v };
  s.day = dayAt(v);
  s.hour = hourAt(v);
  s.scene = sceneAt(v);
  s.sun = sunDir(s.hour, s.day, v >= V_BABY);
  s.power = powerAt(v);
  s.gone = v >= V_EVENT ? 1 : 0;
  s.era = v < V_PREG ? 0 : v < V_BABY ? 1 : 2;           // 0: the first two weeks, 1: the months after, 2: day 280
  s.season = seasonAt(v);
  s.decay = v >= V_LAPSE && v < V_PREG ? smooth(V_LAPSE + 0.3, V_LAB - 0.8, v) : v >= V_PREG && v < V_BABY ? 1 - smooth(V_PREG, V_PREG + 3, v) : 0;
  s.lapse = ['night1', 'shops', 'preg'].includes(s.scene);
  s.flash = Math.max(
    smooth(V_EVENT - 0.05, V_EVENT, v) * (1 - smooth(V_EVENT, V_EVENT + 0.4, v)) * 0.5,
    smooth(T_SWITCH - 1.1, T_SWITCH - 0.05, v),
  );
  s.title = 1 - smooth(2.6, 3.0, v);
  return s;
}
export { lerp };
