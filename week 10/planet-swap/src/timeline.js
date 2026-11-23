// "What if Earth swapped places with other planets?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One packed beach (Santa Monica, the pier and its Ferris wheel on the right), one camera spot the whole video: just
// behind YOU. The Sun hangs low over the sea in front of you. Frame 0 is a normal day on Earth; within a second Earth
// trades places with Mercury, and then every ~7.7 s with another planet, in one quick wipe: the Sun on screen swells or
// shrinks to its size from there, the light changes, and the weather on your beach goes to where it would end up (sped
// up). Every switch flips hot and cold: Earth -> Mercury (hot: things burn, the sea boils) -> Mars (cold: frost, the sea
// skins over) -> Venus (hot again: the sea boils off into a cloud that closes the sky, hot rain) -> Jupiter (colder: the
// rain turns to snow, the sea freezes solid) -> Pluto (coldest: the air itself rains down, freezes and snows down over
// everything). Nothing resets at a wipe: what burned stays burnt, everyone carries on from where they were.
// The bar under the title is a map: the Sun at the left, the planets in their real order; at each stop the Earth marker
// and that planet trade slots. The counter is your distance from the Sun, racing to each place's; one line under it says
// how big and how bright the Sun is there.
//
// The numbers (checked Nov 23, 2026; NASA Planetary Fact Sheet, mean distance from the Sun, 10^6 km: Earth 149.6,
// Venus 108.2, Mars 228.0, Mercury 57.9, Jupiter 778.5, Pluto 5,906.4; 1 mile = 1.609344 km):
//   miles from the Sun: Earth 92.96 M, Mercury 35.98 M, Mars 141.67 M, Venus 67.23 M, Jupiter 483.74 M, Pluto 3,670 M.
//   how wide the Sun looks = 1 / distance (AU): Mercury 2.58x, Mars 0.656x (about 2/3), Venus 1.38x, Jupiter 0.192x
//     (about 1/5), Pluto 0.0253x (about 1/40: 0.8 arcminutes, under what the eye can see as a disc, so a point of light).
//   how much sunlight = 1 / distance²: Mercury 6.68x, Mars 0.43x (under half), Venus 1.91x, Jupiter 1/27.1,
//     Pluto 1/1,559. Noon at Jupiter's place ~3,700 lux (a dark overcast day is 1,000-10,000); at Pluto's ~64 lux,
//     still ~250x the full Moon (0.25 lux), deep dusk.
//   what the weather does (where it ends up; the video speeds it up): the temperature a planet settles at goes as
//     1/sqrt(distance): with Earth's reflectivity (30%) and no greenhouse: Mercury's place 410 K (278°F: the sea boils),
//     Mars' 206 K (-88°F: frost, the sea freezes over), Venus' 300 K (80°F before the greenhouse; 1.9x the sunlight is
//     past the runaway limit (~1.1-1.4x), so the seas steam off into a sky-wide cloud), Jupiter's 112 K (-259°F: the
//     sea freezes solid; the air's water snows out), Pluto's 41 K (-387°F): oxygen turns liquid at 90 K and nitrogen at
//     77 K, then they freeze (63 K, 54 K): the air itself rains down, then snows down. Earth's air weighs 10.3 t per
//     m²; frozen (~1.03 t/m³) that is ~10 m, about 30-33 ft, of air-snow over everything.
//   Mercury's place, right away: 6.68 x 1,361 W/m² above the air, ~6,800 W/m² at the ground; a dark surface facing that
//     Sun heats to ~300°C (~600°F), past where paper, cloth and dry wood catch fire (~230-300°C).
//
// What is drawn, not measured: the Sun is drawn 7x wider than it looks in real life at every stop so you can see it on
// a phone (the real one is 0.53°, ~16 px); the sizes between stops are true. The light is exposed for the phone: the far
// stops are lifted so the beach stays readable (the real Pluto noon is deep dusk). How deep the snow gets at Jupiter's
// place is a guess (1 m), and Pluto's 10 m of air-snow drifts deepest far off first (so you see it bury the cars and the
// pier before it reaches you).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const WIPE = 0.38;                // one wipe (s)
export const DRAW = 7;                   // the Sun is drawn this many times wider than life (all stops alike)
export const EARTH_MI = 92_960_000;

// land: when the wipe to this place starts; mi: its distance from the Sun (miles); wide / light: the Sun there vs from
// Earth; lines: [from (s after landing), text]
export const STOPS = [
  { key: 'earth', name: 'EARTH', land: -1, mi: EARTH_MI, wide: 1, light: 1, lines: [] },
  { key: 'mercury', name: 'MERCURY', land: 0.9, mi: 35_980_000, wide: 2.584, light: 6.676, lines: [[0.1, 'THE SUN: 2.6x WIDER'], [3.6, '6.7x THE SUNLIGHT']] },
  { key: 'mars', name: 'MARS', land: 8.6, mi: 141_670_000, wide: 0.656, light: 0.4305, lines: [[0.12, 'THE SUN: 2/3 AS WIDE'], [3.6, 'UNDER HALF THE SUNLIGHT']] },
  { key: 'venus', name: 'VENUS', land: 16.3, mi: 67_230_000, wide: 1.383, light: 1.912, lines: [[0.12, 'THE SUN: 1.4x WIDER'], [3.0, '1.9x THE SUNLIGHT']] },
  { key: 'jupiter', name: 'JUPITER', land: 24.0, mi: 483_740_000, wide: 0.1922, light: 0.0369, lines: [[0.12, '1/27 OF THE SUNLIGHT'], [3.9, 'THE SUN: 1/5 AS WIDE']] },
  { key: 'pluto', name: 'PLUTO', land: 31.7, mi: 3_670_070_000, wide: 0.02533, light: 0.000641, lines: [[0.12, 'THE SUN: 1/40 AS WIDE'], [3.6, '1/1,600 OF THE SUNLIGHT']], until: 9.2 },
];
STOPS.forEach((s, i) => { s.i = i; });
export const ST = Object.fromEntries(STOPS.map((s) => [s.key, s]));
export const LAND = Object.fromEntries(STOPS.map((s) => [s.key, s.land]));
// how long each stop runs (to the next wipe)
export const DUR = Object.fromEntries(STOPS.map((s, i) => [s.key, (STOPS[i + 1] ? STOPS[i + 1].land : 1e9) - s.land]));

// the ending: Pluto's frozen air piles up over you and the lens; the white is full at T_END, the loop point sits in it
export const T_END = LAND.pluto + 11.6;
export const T_SWITCH = Math.round((T_END + 0.3) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// captions: [from, to, text] (video time), low in the frame; only where the picture alone could be missed
export const CAPTIONS = [
  [LAND.mercury + 1.6, LAND.mercury + 5.0, 'Anything dark in the sun catches fire'],
  [LAND.mars + 1.5, LAND.mars + 4.8, 'It drops to -88°F'],
  [LAND.venus + 3.7, LAND.venus + 7.1, 'The sea boils off into the sky'],
  [LAND.jupiter + 4.3, LAND.pluto - 0.3, "It's noon. This is as bright as it gets"],
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
// the map: each planet's slot (fractional while it moves) at v. At each stop Earth and that planet trade slots, over
// TRADE seconds ending just after the wipe starts; Earth arcs over the top, the other planet under.
export const TRADE = 0.6;
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const MAP = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'pluto'];
export function mapAt(v) {
  const pos = Object.fromEntries(MAP.map((k, j) => [k, { x: j, arc: 0 }]));
  for (let i = 1; i < STOPS.length; i++) {
    const st = STOPS[i], t1 = st.land + 0.1, t0 = t1 - TRADE;
    if (v < t0) break;
    const u = ease((v - t0) / TRADE);
    const e = pos.earth.x, o = pos[st.key].x;
    pos.earth = { x: lerp(e, o, u), arc: -Math.sin(Math.PI * u) };
    pos[st.key] = { x: lerp(o, e, u), arc: Math.sin(Math.PI * u) };
    if (u < 1) break;
    pos.earth.arc = 0; pos[st.key].arc = 0;
  }
  return pos;
}
// how far stop i's change has got at tt seconds after its wipe (0 the last place .. 1 this one): the counter races
// over this, and the Sun swells or shrinks with it. Mercury's race starts on frame 0, from Earth's place.
export function raceK(i, tt) {
  if (i === 0) return 0;
  if (i === 1) return ease((tt + LAND.mercury) / 2.0);
  const dur = i === 5 ? 2.4 : 1.7;
  const u = clamp((tt - 0.05) / dur);
  return 1 - Math.pow(1 - u, 2.6);
}
// the counter: miles from the Sun, racing from the last place to this one (in log steps, so every digit runs)
export function milesAt(v) {
  const i = Math.max(1, stopAt(v)), st = STOPS[i];
  const k = raceK(i, v - st.land);
  return Math.round(Math.exp(lerp(Math.log(STOPS[i - 1].mi), Math.log(st.mi), k)));
}
export const fmtMi = (m) => m.toLocaleString('en-US');
// the Sun's width (x Earth's view) and brightness on screen, stop i at tt (follows the counter)
export function sunWide(i, tt) {
  if (i === 0) return 1;
  return Math.exp(lerp(Math.log(STOPS[i - 1].wide), Math.log(STOPS[i].wide), raceK(i, tt)));
}
export function sunLight(i, tt) {
  if (i === 0) return 1;
  return Math.exp(lerp(Math.log(STOPS[i - 1].light), Math.log(STOPS[i].light), raceK(i, tt)));
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
  s.map = mapAt(v);
  s.snap = i === 0 ? 0 : Math.exp(-Math.max(0, s.since) / 0.14) * smooth(-0.01, 0.03, s.since);
  s.title = 1 - smooth(3.0, 3.6, v);
  // the end: the frozen air closes over the lens; the white is full at T_END (the loop point sits inside it)
  s.cover = smooth(T_END - 0.45, T_END - 0.02, v);
  s.flash = s.cover;
  s.flashColor = '#ffffff';
  return s;
}
