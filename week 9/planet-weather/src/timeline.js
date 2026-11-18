// "What if Earth had other planets' weather?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// One packed beach (Santa Monica, the pier and its Ferris wheel on the right), one camera spot the whole video: just
// behind YOU, holding a blue-and-white umbrella. Every ~6.7 s the weather swaps to another world's in one quick wipe;
// the beach and the crowd stay, and each stop starts fresh (a whole umbrella again). The umbrella is the running gag:
// lightning hits it (Jupiter), dust buries it and frost locks it (Mars), it bursts into flames (Venus), slow-motion
// drops splash on it while the sea freezes (Titan), it flips inside out and is torn away (Saturn), and it shreds and
// carries you off (Neptune). A picker bar of the six worlds sits under the title (Neptune, the last slot, is the finish
// line); the counter is the temperature on your beach, racing to each world's; one line under it names the weather.
//
// The numbers (checked Nov 17, 2026):
//   - temperatures: NASA's Planetary Fact Sheet, mean temperature (the 1-bar level for the gas giants: about the air
//     pressure at a beach): Jupiter -110°C (-166°F), Mars -65°C (-85°F), Venus 464°C (867°F), Saturn -140°C (-220°F),
//     Neptune -200°C (-328°F); Titan -179°C (-290°F) (NASA, "Titan: Facts").
//   - Jupiter: "a giant storm bigger than Earth" (the Great Red Spot, twice as wide as Earth: NASA, "Jupiter: Facts");
//     lightning in its water clouds (Juno, NASA/JPL 2018).
//   - Mars: "dust storms that cover much of the planet"; the sky "hazy and red" with suspended dust (NASA, "Mars:
//     Facts"); "butterscotch" daytime sky (Viking, Pathfinder: NASA/JPL); frost on the ground (Viking 2 photographed it).
//   - Venus: "hot enough to melt lead" (NASA, "Venus: Facts"; lead melts at 621°F); sky "some shade of sulfur yellow"
//     (NASA, from the Venera landers). (Its sulfuric acid rain evaporates ~30 km up, so none is shown landing.)
//   - Titan: methane rain (NASA); drops up to ~9.5 mm (Earth's max ~6.5 mm) falling ~1.6 m/s against ~9.2 m/s on Earth:
//     about 6x slower (Lorenz 1993, "The life, death and afterlife of a raindrop on Titan"); sunlight ~100x fainter
//     (NASA); at -290°F the sea freezes.
//   - Saturn: winds up to 500 m/s (1,600 ft/s, ~1,100 mph) at the equator (NASA, "Saturn: Facts"). ("Diamond rain" is
//     only a 2013 conference hypothesis about the deep interior, so it's left out.)
//   - Neptune: "our solar system's windiest world", winds "more than 1,200 miles per hour" (NASA, "Neptune: Facts").
//     On Earth that is faster than sound (767 mph at sea level).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const WIPE = 0.38;                // one wipe (s)
export const BASE_F = 75;                // a sunny day on the beach (°F), before Jupiter's weather arrives

// land: when the wipe to this world starts; f: its temperature (°F); lines: [from (s after landing), text]
export const STOPS = [
  { key: 'jupiter', name: 'JUPITER', land: -1.6, f: -166, lines: [[-9, 'JUPITER: STORMS BIGGER THAN EARTH']] },
  { key: 'mars', name: 'MARS', land: 6.6, f: -85, lines: [[0.12, 'MARS: PLANET-WIDE DUST STORMS']] },
  { key: 'venus', name: 'VENUS', land: 13.4, f: 867, lines: [[0.12, 'VENUS: HOT ENOUGH TO MELT LEAD']] },
  { key: 'titan', name: 'TITAN', land: 20.2, f: -290, lines: [[0.12, 'TITAN: SLOW-MOTION METHANE RAIN']] },
  { key: 'saturn', name: 'SATURN', land: 27.0, f: -220, lines: [[0.12, 'SATURN: 1,100 MPH WINDS']] },
  { key: 'neptune', name: 'NEPTUNE', land: 33.8, f: -328, lines: [[0.12, 'NEPTUNE: 1,200 MPH WINDS'], [3.2, 'FASTER THAN SOUND']] },
];
STOPS.forEach((s, i) => { s.i = i; });
export const ST = Object.fromEntries(STOPS.map((s) => [s.key, s]));
export const LAND = Object.fromEntries(STOPS.map((s) => [s.key, s.land]));

// the ending: Neptune's wind strips the beach, a white-out of ice and spray fills the lens; the loop point sits in it
export const T_END = LAND.neptune + 12.0;          // the white is full
export const T_SWITCH = Math.round((T_END + 0.3) * 60) / 60;
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// captions: [from, to, text] (video time; never under the title, never with a popup)
export const CAPTIONS = [
  [LAND.jupiter + 5.5, LAND.mars - 0.15, 'Lightning hits your umbrella'],
  [LAND.mars + 4.3, LAND.venus - 0.15, 'Then everything freezes'],
  [LAND.venus + 3.1, LAND.titan - 0.15, 'Your umbrella bursts into flames'],
  [LAND.titan + 3.4, LAND.saturn - 0.15, 'The sea freezes solid'],
  [LAND.saturn + 3.0, LAND.neptune - 0.15, 'Your umbrella: gone'],
  [LAND.neptune + 7.45, T_END - 1.3, 'It takes you with it'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) if (v >= a && v < b) return { text, alpha: smooth(a, a + 0.25, v) * (1 - smooth(b - 0.25, b, v)), rise: (1 - smooth(a, a + 0.25, v)) * 12 };
  return null;
}

// the stop whose weather is on screen now (the newer one once its wipe has started)
export function stopAt(v) {
  let i = 0;
  while (i + 1 < STOPS.length && v >= STOPS[i + 1].land) i++;
  return i;
}
// the picker's cursor (0..5, fractional while it slides): it slides in the 0.45 s before each wipe and snaps on
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export function cursorAt(v) {
  for (let i = STOPS.length - 1; i >= 1; i--) {
    const L = STOPS[i].land;
    if (v >= L) return i;
    if (v >= L - 0.45) return lerp(i - 1, i, ease((v - (L - 0.45)) / 0.45));
  }
  return 0;
}
// the counter: the temperature racing from the last world's to this one's (Jupiter's race starts from a sunny day,
// so on frame 0 the number is already falling fast)
export function tempAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const from = i === 0 ? BASE_F : STOPS[i - 1].f;
  const dur = i === 0 ? 3.4 : 1.5;
  const t0 = i === 0 ? st.land + 0.6 : st.land;
  const u = clamp((v - t0) / dur);
  const k = i === 0 ? u * u * (3 - 2 * u) : 1 - Math.pow(1 - u, 2.4);
  return Math.round(lerp(from, st.f, k));
}
export const fmtF = (f) => `${f < 0 ? '−' : ''}${Math.abs(f).toLocaleString('en-US')}°F`;

// the one line under the counter: { text, alpha, rise }
export function lineAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const nx = STOPS[i + 1];
  const dt = v - st.land;
  const end = (nx ? nx.land : T_END) - st.land;
  let cur = null, t0 = 0, t1 = end;
  for (let j = 0; j < st.lines.length; j++) {
    const [a, text] = st.lines[j];
    const b = j + 1 < st.lines.length ? st.lines[j + 1][0] : end;
    if (dt >= a && dt < b) { cur = text; t0 = a; t1 = b; }
  }
  if (!cur) return null;
  return { text: cur, alpha: smooth(t0, t0 + 0.2, dt) * (1 - smooth(t1 - 0.2, t1, dt)), rise: (1 - smooth(t0, t0 + 0.2, dt)) * 12 };
}

// ---- state: which worlds are drawn (a, b), the wipe between them (w), the snap at each landing ----
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
  // the white-out at the end (the loop point sits inside it)
  s.cover = smooth(T_END - 0.55, T_END - 0.02, v);
  s.flash = s.cover;
  s.flashColor = '#ffffff';
  return s;
}
