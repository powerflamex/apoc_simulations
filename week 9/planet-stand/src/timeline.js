// "What if you stood on other planets?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One camera spot, one person: you in a low beach chair with a drink, seen over your right shoulder. Every ~6 s the whole
// world around you swaps to another planet in one quick wipe; you and the chair stay (each stop starts fresh: a full drink,
// a whole chair). The counter: YOU'D LAST (with no suit), the place's name on the one line under it; a picker bar of the
// eight places under the title, its cursor stepping right at every wipe (Earth, the last slot, is the finish line).
//
// The numbers (sources; checked Nov 16, 2026):
//   - survival times with no suit: Neil deGrasse Tyson for Business Insider (2014: Venus you'd vaporise "really fast",
//     Mars ~2 minutes, the gas giants under a second) and WorldAtlas, "How long could you survive on each planet" (Venus
//     "a maximum of one second", Mercury and Mars "about two minutes", Jupiter-Neptune "less than one second"); Pluto
//     "less than 1 minute" and Neptune "seconds" (Explain It All, "How long could humans survive on each planet").
//     Titan has no published figure: it is the one place a pressure suit isn't needed (1.5 bar), but its air is nitrogen
//     with no oxygen (a breath or two of pure nitrogen knocks you out; death follows within minutes) at -290°F, so "a few
//     minutes". The vacuum figures match NASA's: conscious ~10-15 s (a 1965 test subject passed out after 14 s), dead in
//     under ~2 minutes.
//   - Venus: surface ~900°F (475°C, NASA; mean 464°C), air ~90x Earth's pressure (like ~900 m under the sea, NASA).
//   - Mars: air ~1% of Earth's (0.6 kPa, NASA); that is about water's triple point (611 Pa), so a cold drink boils and
//     its evaporation freezes what's left. The Sun is 2/3 as wide (1.52 AU).
//   - Mercury: day ~800°F (430°C, NASA); the Sun up to 3x as wide as from Earth (0.31-0.47 AU) and up to 7x as bright
//     (NASA). No air.
//   - Titan: -290°F (-179°C, NASA), air 1.5x Earth's pressure and ~4.4x as dense, gravity 1/7 of Earth's: people could
//     fly by flapping wings strapped to their arms (Robert Zubrin, "Entering Space"; checked by Univ. of Leicester's
//     Physics Special Topics: ~4.7 m² of wing at a running take-off). Lakes of liquid methane and ethane (Cassini).
//   - Jupiter: no surface; gravity 2.5x Earth's at the cloud tops (24.8 m/s²).
//   - Neptune: the fastest winds in the solar system, "more than 1,200 mph (2,000 km/h)" (NASA). No surface.
//   - Pluto: -375 to -400°F (NASA), air ~100,000x thinner than ours; from 39.5 AU the Sun is 1/40 as wide as ours, a
//     point to the eye (under 1 arcminute): a very bright star.
//   - Earth: life expectancy ~78 (US, CDC 2023), ~81 (EU): "about 80 years".
import { smooth, clamp } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const LOOP = 0.9;                 // the cover clears onto the first frame over the last LOOP seconds
export const WIPE = 0.38;                // one wipe (s)

// sec: the survival time in seconds (for the counter's race between stops); text: what the counter says once landed
export const PLACES = [
  { key: 'venus', name: 'VENUS', line: 'ON VENUS', text: 'LESS THAN 1 SECOND', sec: 0.8 },
  { key: 'mars', name: 'MARS', line: 'ON MARS', text: 'ABOUT 2 MINUTES', sec: 120 },
  { key: 'mercury', name: 'MERCURY', line: 'ON MERCURY', text: 'ABOUT 2 MINUTES', sec: 120 },
  { key: 'titan', name: 'TITAN', line: "ON TITAN, SATURN'S MOON", text: 'A FEW MINUTES', sec: 200 },
  { key: 'jupiter', name: 'JUPITER', line: 'ON JUPITER', text: 'LESS THAN 1 SECOND', sec: 0.8 },
  { key: 'neptune', name: 'NEPTUNE', line: 'ON NEPTUNE', text: 'A FEW SECONDS', sec: 4 },
  { key: 'pluto', name: 'PLUTO', line: 'ON PLUTO', text: 'LESS THAN 1 MINUTE', sec: 50 },
  { key: 'earth', name: 'EARTH', line: 'BACK ON EARTH', text: 'ABOUT 80 YEARS', sec: 80 * 3.156e7 },
];
PLACES.forEach((p, i) => { p.slot = i; });
export const P = Object.fromEntries(PLACES.map((p) => [p.key, p]));

// the stops: when each wipe lands (its middle) and the one caption, [from, to] in seconds after the landing
export const STOPS = [
  { key: 'venus', land: -1.6, cap: [[3.3, 7.4, '900°F. Hotter than your oven.']] },
  { key: 'mars', land: 6.0, cap: [[1.9, 5.6, 'The air is 100x thinner. Your drink boils.']] },
  { key: 'mercury', land: 12.0, cap: [[1.8, 5.6, '800°F. Your chair melts.']] },
  { key: 'titan', land: 18.0, cap: [[1.6, 5.8, '-290°F, but strap on wings and you fly']] },
  { key: 'jupiter', land: 24.2, cap: [[1.4, 5.8, 'No ground. You fall.']] },
  { key: 'neptune', land: 30.4, cap: [[1.4, 5.6, 'Winds of 1,200 mph']] },
  { key: 'pluto', land: 36.4, cap: [[1.6, 5.6, '-380°F. The Sun is just a star.']] },
  { key: 'earth', land: 42.4, cap: [[1.0, 4.2, 'Home.']] },
];
for (const s of STOPS) s.place = P[s.key];
export const LAND = Object.fromEntries(STOPS.map((s) => [s.key, s.land]));

// the ending: a beat back on Earth, then a white flash; the loop point sits inside it
export const T_FLASH = LAND.earth + 3.95;
export const T_SWITCH = Math.round((T_FLASH + 0.42) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// the stop on screen at v (the one whose wipe has passed its middle), and the wipe between i-1 and i: 0..1
export function stopAt(v) {
  let i = 0;
  while (i + 1 < STOPS.length && v >= STOPS[i + 1].land) i++;
  return i;
}
// wipe progress into stop k (0 before, 1 after): eased, centred on its landing
export function wipeOf(k, v) {
  if (k <= 0) return 1;
  const u = clamp((v - (STOPS[k].land - WIPE / 2)) / WIPE);
  return u * u * (3 - 2 * u);
}
// the cursor (0..7, fractional while it slides with the wipe)
export function cursorAt(v) {
  const i = stopAt(v);
  const n = STOPS[i + 1];
  if (n && v > n.land - WIPE / 2 - 0.05) return i + wipeOf(i + 1, v);
  const w = wipeOf(i, v);
  return i === 0 ? 0 : i - 1 + w;
}

// the counter: lands on each stop's text; between stops it races through the times in between (log time)
const UNITS = [[3.156e7, 'YEAR'], [86400, 'DAY'], [3600, 'HOUR'], [60, 'MINUTE'], [1, 'SECOND']];
function fmtSec(s) {
  for (const [k, u] of UNITS) {
    if (s >= k * 1.5 || u === 'SECOND') {
      const n = Math.max(1, Math.round(s / k));
      return `${n.toLocaleString('en-US')} ${u}${n === 1 ? '' : 'S'}`;
    }
  }
  return '';
}
const RACE = 0.85;                       // how long the race between two stops takes (s), ending as the wipe lands
export function counterAt(v) {
  // the race into stop i (and from Earth back to Venus through the loop)
  // (frame 0 shows the last of the race from 80 years down to under a second; the loop replay, v < 0, shows its start)
  const races = STOPS.map((s, i) => ({ to: i, t1: i === 0 ? 0.4 : s.land + 0.12, from: i === 0 ? 7 : i - 1 }));
  for (const r of races) {
    const t0 = r.t1 - RACE;
    if (v >= t0 && v < r.t1) {
      const a = PLACES[r.from].sec, b = PLACES[r.to].sec;
      if (a === b) return PLACES[r.to].text;
      const u = smooth(t0, r.t1, v);
      return fmtSec(Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * Math.pow(u, 0.8)));
    }
  }
  return PLACES[stopAt(v)].text;
}
// the one line under the counter: the place's name
export function lineAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const dt = v - st.land;
  const a = i === 0 ? 1 : smooth(0, 0.2, dt);
  return { text: st.place.line, alpha: a, rise: (1 - a) * 10 };
}
// the caption (after the title has gone)
export function captionAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const dt = v - st.land;
  for (const [a, b, text] of st.cap) {
    if (dt >= a && dt < b) return { text, alpha: smooth(a, a + 0.25, dt) * (1 - smooth(b - 0.25, b, dt)) };
  }
  return null;
}

// ---- state ----
export function state(v) {
  const s = { v };
  const i = stopAt(v);
  s.i = i; s.stop = STOPS[i];
  s.since = v - STOPS[i].land;
  s.cursor = cursorAt(v);
  // the wipe: the stop leaving (a) and arriving (b), progress w; when no wipe runs, b = a = i
  const nx = STOPS[i + 1];
  s.a = i; s.b = i; s.w = 0;
  if (nx && v > nx.land - WIPE / 2) { s.a = i; s.b = i + 1; s.w = wipeOf(i + 1, v); }
  else if (i > 0 && v < STOPS[i].land + WIPE / 2) { s.a = i - 1; s.b = i; s.w = wipeOf(i, v); }
  // a short pulse at every landing
  const dl = v - STOPS[s.b].land;
  s.snap = s.b === 0 ? 0 : Math.exp(-Math.max(0, dl + 0.1) / 0.18) * smooth(-0.15, -0.05, dl);
  s.title = 1 - smooth(3.0, 3.5, v);
  s.flash = smooth(T_FLASH, T_FLASH + 0.3, v);
  return s;
}
