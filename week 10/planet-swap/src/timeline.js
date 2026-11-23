// "What if Earth swapped places with other planets?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One packed beach (Santa Monica, the pier and its Ferris wheel on the right), one camera spot the whole video: just
// behind YOU. The Sun hangs low over the sea in front of you. Every 7-9 s Earth jumps to another planet's place in one
// quick wipe: the Sun on screen swells or shrinks to its size from there, the light changes, and the weather on your
// beach goes to where it would end up (sped up). Every switch flips hot and cold, and each hot or cold stop is stronger
// than the last: Venus (hot) -> Mars (cold) -> Mercury (hotter) -> Jupiter (colder) -> Pluto (coldest: the air itself
// freezes and snows down). Nothing resets at a wipe: what melted, burned or froze stays that way until a stop undoes it.
// A picker bar of the five places sits under the title (Pluto, the last slot, is the finish line); the counter is your
// distance from the Sun, racing to each place's; one line under it says how big and how bright the Sun is there.
//
// The numbers (checked Nov 23, 2026; NASA Planetary Fact Sheet, mean distance from the Sun, 10^6 km: Earth 149.6,
// Venus 108.2, Mars 228.0, Mercury 57.9, Jupiter 778.5, Pluto 5,906.4; 1 mile = 1.609344 km):
//   miles from the Sun: Earth 92.96 M, Venus 67.23 M, Mars 141.67 M, Mercury 35.98 M, Jupiter 483.74 M, Pluto 3,670 M.
//   how wide the Sun looks = 1 / distance (AU): Venus 1.38x, Mars 0.656x (about 2/3), Mercury 2.58x, Jupiter 0.192x
//     (about 1/5), Pluto 0.0253x (about 1/40: 0.8 arcminutes, under what the eye can see as a disc, so a point of light).
//   how much sunlight = 1 / distance²: Venus 1.91x, Mars 0.43x (under half), Mercury 6.68x, Jupiter 1/27.1,
//     Pluto 1/1,559. Noon at Jupiter's place ~3,700 lux (a dark overcast day is 1,000-10,000); at Pluto's ~64 lux,
//     still ~250x the full Moon (0.25 lux), deep dusk.
//   what the weather does (where it ends up; the video speeds it up): the temperature a planet settles at goes as
//     1/sqrt(distance): with Earth's reflectivity (30%) and no greenhouse: Venus' place 300 K (80°F; with the
//     greenhouse it runs away: the seas steam off), Mars' 206 K (-88°F: frost, the sea freezes over), Mercury's 410 K
//     (278°F before any greenhouse: the sea boils), Jupiter's 112 K (-259°F: the sea freezes solid; the air's water
//     and its carbon dioxide snow out), Pluto's 41 K (-387°F): oxygen turns liquid at 90 K and nitrogen at 77 K, then
//     they freeze (63 K, 54 K): the air itself rains down, then snows down. Earth's air weighs 10.3 t per m²; frozen
//     (~1.03 t/m³) that is ~10 m, about 30-33 ft, of air-snow over everything.
//   Mercury's place, right away: 6.68 x 1,361 W/m² above the air, ~6,800 W/m² at the ground; a dark surface facing that
//     Sun heats to ~300°C (~600°F), past where paper and cloth catch fire (~230-260°C): towels, umbrellas, paint burn.
//
// What is drawn, not measured: the Sun is drawn 7x wider than it looks in real life at every stop so you can see it on
// a phone (the real one is 0.53°, ~16 px); the sizes between stops are true. The light is exposed for the phone: the far
// stops are lifted so the beach stays readable (the real Pluto noon is deep dusk). How deep the snow gets at Jupiter's
// place is a guess (0.7 m).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const WIPE = 0.38;                // one wipe (s)
export const DRAW = 7;                   // the Sun is drawn this many times wider than life (all stops alike)
export const EARTH_MI = 92_960_000;

// land: when the wipe to this place starts; mi: its distance from the Sun (miles); wide / light: the Sun there vs from
// Earth; lines: [from (s after landing), text]
export const STOPS = [
  { key: 'venus', name: 'VENUS', land: -0.4, mi: 67_230_000, wide: 1.383, light: 1.912, lines: [[-9, 'THE SUN: 1.4x WIDER'], [3.6, '1.9x THE SUNLIGHT']] },
  { key: 'mars', name: 'MARS', land: 7.0, mi: 141_670_000, wide: 0.656, light: 0.4305, lines: [[0.12, 'THE SUN: 2/3 AS WIDE'], [3.6, 'UNDER HALF THE SUNLIGHT']] },
  { key: 'mercury', name: 'MERCURY', land: 15.0, mi: 35_980_000, wide: 2.584, light: 6.676, lines: [[0.12, 'THE SUN: 2.6x WIDER'], [3.6, '6.7x THE SUNLIGHT']] },
  { key: 'jupiter', name: 'JUPITER', land: 24.0, mi: 483_740_000, wide: 0.1922, light: 0.0369, lines: [[0.12, 'THE SUN: 1/5 AS WIDE'], [3.6, '1/27 OF THE SUNLIGHT']] },
  { key: 'pluto', name: 'PLUTO', land: 33.0, mi: 3_670_070_000, wide: 0.02533, light: 0.000641, lines: [[0.12, 'THE SUN: 1/40 AS WIDE'], [3.6, '1/1,600 OF THE SUNLIGHT']], until: 9.2 },
];
STOPS.forEach((s, i) => { s.i = i; });
export const ST = Object.fromEntries(STOPS.map((s) => [s.key, s]));
export const LAND = Object.fromEntries(STOPS.map((s) => [s.key, s.land]));
// how long each stop runs (to the next wipe)
export const DUR = Object.fromEntries(STOPS.map((s, i) => [s.key, (STOPS[i + 1] ? STOPS[i + 1].land : 1e9) - s.land]));

// the ending: Pluto's frozen air piles up over you and the lens; the white is full at T_END, the loop point sits in it
export const T_END = LAND.pluto + 11.0;
export const T_SWITCH = Math.round((T_END + 0.3) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// captions: [from, to, text] (video time), low in the frame; only where the picture alone could be missed
export const CAPTIONS = [
  [3.3, 6.7, 'Your beach, 26 million miles closer'],
  [LAND.mercury + 4.4, LAND.jupiter - 0.3, 'Anything dark in the sun catches fire'],
  [LAND.jupiter + 4.2, LAND.pluto - 0.3, "It's noon. This is as bright as it gets"],
  [LAND.pluto + 1.7, LAND.pluto + 4.9, 'The air itself turns to liquid'],
  [LAND.pluto + 5.3, LAND.pluto + 9.2, 'Then it snows down, 30 ft deep'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) if (v >= a && v < b) return { text, alpha: smooth(a, a + 0.25, v) * (1 - smooth(b - 0.25, b, v)), rise: (1 - smooth(a, a + 0.25, v)) * 12 };
  return null;
}

// the stop on screen now (the newer one once its wipe has started)
export function stopAt(v) {
  let i = 0;
  while (i + 1 < STOPS.length && v >= STOPS[i + 1].land) i++;
  return i;
}
// the picker's cursor (0..4, fractional while it slides): it slides in the 0.45 s before each wipe and snaps on
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export function cursorAt(v) {
  for (let i = STOPS.length - 1; i >= 1; i--) {
    const L = STOPS[i].land;
    if (v >= L) return i;
    if (v >= L - 0.45) return lerp(i - 1, i, ease((v - (L - 0.45)) / 0.45));
  }
  return 0;
}
// how far stop i's change has got at tt seconds after its wipe (0 the last place .. 1 this one): the counter races
// over this, and the Sun swells or shrinks with it (Venus' race starts on frame 0 from Earth's place)
export function raceK(i, tt) {
  const dur = i === 0 ? 2.6 : i === 4 ? 2.4 : 1.7;
  const t0 = i === 0 ? 0.25 : 0.05;
  const u = clamp((tt - t0) / dur);
  return i === 0 ? u * u * (3 - 2 * u) : 1 - Math.pow(1 - u, 2.6);
}
// the counter: miles from the Sun, racing from the last place to this one (in log steps, so every digit runs)
export function milesAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const from = i === 0 ? EARTH_MI : STOPS[i - 1].mi;
  const k = raceK(i, v - st.land);
  return Math.round(Math.exp(lerp(Math.log(from), Math.log(st.mi), k)));
}
export const fmtMi = (m) => m.toLocaleString('en-US');
// the Sun's width (x Earth's view) and brightness on screen, stop i at tt (follows the counter)
export function sunWide(i, tt) {
  const from = i === 0 ? 1 : STOPS[i - 1].wide;
  return Math.exp(lerp(Math.log(from), Math.log(STOPS[i].wide), raceK(i, tt)));
}
export function sunLight(i, tt) {
  const from = i === 0 ? 1 : STOPS[i - 1].light;
  return Math.exp(lerp(Math.log(from), Math.log(STOPS[i].light), raceK(i, tt)));
}

// the one line under the counter: { text, alpha, rise }
export function lineAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const nx = STOPS[i + 1];
  const dt = v - st.land;
  const end = Math.min((nx ? nx.land : T_END) - st.land, st.until ?? 1e9);
  let cur = null, t0 = 0, t1 = end;
  for (let j = 0; j < st.lines.length; j++) {
    const [a, text] = st.lines[j];
    const b = j + 1 < st.lines.length ? st.lines[j + 1][0] : end;
    if (dt >= a && dt < b) { cur = text; t0 = a; t1 = b; }
  }
  if (!cur) return null;
  return { text: cur, alpha: smooth(t0, t0 + 0.2, dt) * (1 - smooth(t1 - 0.2, t1, dt)), rise: (1 - smooth(t0, t0 + 0.2, dt)) * 12 };
}

// ---- state: which places are drawn (a, b), the wipe between them (w), the snap at each landing ----
export function state(v) {
  const s = { v };
  const i = stopAt(v);
  s.i = i;
  const L = STOPS[i].land;
  if (i > 0 && v < L + WIPE) { s.a = i - 1; s.b = i; s.w = clamp((v - L) / WIPE); }
  else { s.a = i; s.b = i; s.w = 0; }
  s.since = v - L;
  s.cursor = cursorAt(v);
  s.snap = i === 0 ? 0 : Math.exp(-Math.max(0, s.since) / 0.14) * smooth(-0.01, 0.03, s.since);
  s.title = 1 - smooth(3.0, 3.6, v);
  // the end: the frozen air closes over the lens; the white is full at T_END (the loop point sits inside it)
  s.cover = smooth(T_END - 0.45, T_END - 0.02, v);
  s.flash = s.cover;
  s.flashColor = '#ffffff';
  return s;
}
