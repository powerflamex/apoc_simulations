// "What if other planets replaced the Moon?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A packed beach at night (Santa Monica, the pier and its Ferris wheel on the right). Each planet sits exactly where
// the Moon is, at the Moon's distance (384,400 km), true to size. Under the title a picker bar with six slots (Moon,
// Mars, Venus, Neptune, Saturn, Jupiter); its cursor snaps from slot to slot, the sky changes at once and the whole
// beach is lit in that planet's colour. The video opens on Jupiter (the last slot), snaps back to the Moon at 0:03 and
// climbs to Jupiter again; then Jupiter's pull shows: the sea bulges, climbs the beach, and comes in as a wall.
// The numbers (each planet's real mean radius R in km, mass M in kg, geometric albedo):
//   - size in the sky: angular radius = asin(R / 384,400 km), given as a multiple of the Moon's (0.26 deg)
//   - brightness at full phase: (albedo / the Moon's 0.12) x (R / R_moon)^2  (the same sunlight falls on it)
//   - the tide it raises: mass / distance^3, so at the same distance just the mass ratio (Jupiter: 25,850 Moons)
//   - Saturn's rings (outer edge of the A ring, 136,775 km from the centre) span 39 deg: 75 Moons side by side
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const LOOP = 0.9;                 // the cover clears onto the first frame over the last LOOP seconds

export const MOON_KM = 384400;
export const PLANETS = [
  { key: 'moon', name: 'MOON', R: 1737.4, M: 7.342e22, alb: 0.12 },
  { key: 'mars', name: 'MARS', R: 3389.5, M: 6.4171e23, alb: 0.17 },
  { key: 'venus', name: 'VENUS', R: 6051.8, M: 4.8675e24, alb: 0.689 },
  { key: 'neptune', name: 'NEPTUNE', R: 24622, M: 1.02413e26, alb: 0.442 },
  { key: 'saturn', name: 'SATURN', R: 58232, M: 5.6834e26, alb: 0.499, ring: 136775 },
  { key: 'jupiter', name: 'JUPITER', R: 69911, M: 1.8982e27, alb: 0.538 },
];
export const P = Object.fromEntries(PLANETS.map((p) => [p.key, p]));
PLANETS.forEach((p, i) => {
  p.slot = i;
  p.sin = p.R / MOON_KM;                              // sine of its angular radius
  p.ang = Math.asin(p.sin);                           // angular radius (rad)
  p.size = p.ang / Math.asin(P.moon.R / MOON_KM);     // x the Moon's width
  p.bright = (p.alb / P.moon.alb) * (p.R / P.moon.R) ** 2;
  p.tide = p.M / P.moon.M;
});
export const RING_X = (2 * Math.atan(P.saturn.ring / MOON_KM)) / (2 * P.moon.ang);   // the rings' width in Moons (75.6)
// "40x", "3.5x": the size as the counter shows it
export function fmtSize(x) {
  if (x >= 9.5) return `${Math.round(x)}×`;
  const r = Math.round(x * 2) / 2;                    // halves below 10 (1, 2, 3.5)
  return `${Number.isInteger(r) ? r : r.toFixed(1)}×`;
}
const sig1 = (x) => { const m = 10 ** Math.floor(Math.log10(x)); return Math.round(x / m) * m; };
const fmtX = (x) => `${sig1(x).toLocaleString('en-US')}×`;

// ---- the stops: when the cursor leaves each slot (spin) and snaps onto it (land) ----
// lines: what the one line under the counter says while it sits there [from (s after landing), text]
export const STOPS = [
  { id: 'moon0', key: 'moon', land: -9, spin: -1.15, lines: [] },
  // (Jupiter lands just before frame 0, while the end's white cover is still up: on frame 0 it is already there)
  { id: 'jup0', key: 'jupiter', land: -0.75, spin: 2.72, lines: [[0, `${fmtX(P.jupiter.bright)} brighter than a full Moon`]] },
  { id: 'moon', key: 'moon', land: 3.0, spin: 4.72, lines: [[0.12, 'The Moon you know']] },
  { id: 'mars', key: 'mars', land: 5.0, spin: 9.68, lines: [[0.15, `${fmtX(P.mars.bright)} brighter than the Moon`], [2.5, 'The whole beach turns red']] },
  { id: 'venus', key: 'venus', land: 10.0, spin: 15.15, lines: [[0.15, `${fmtX(P.venus.bright)} brighter than the Moon`], [2.6, 'Night looks like dusk']] },
  { id: 'neptune', key: 'neptune', land: 15.5, spin: 20.62, lines: [[0.15, `${fmtX(P.neptune.bright)} brighter than the Moon`], [2.7, 'Everything you see turns blue']] },
  { id: 'saturn', key: 'saturn', land: 21.0, spin: 30.4, lines: [[0.15, `Its rings: ${Math.floor(RING_X / 5) * 5}× wider than the Moon`], [4.7, 'As bright as a cloudy day']] },
  { id: 'jupiter', key: 'jupiter', land: 31.0, spin: 1e9, lines: [[0.15, `Its pull on our seas: ${(Math.round(P.jupiter.tide / 1000) * 1000).toLocaleString('en-US')}× the Moon's`]] },
];
for (const s of STOPS) s.planet = P[s.key];
export const LAND = Object.fromEntries(STOPS.map((s) => [s.id, s.land]));
const J = LAND.jupiter;

// ---- the ending: Jupiter's pull ----
export const T_RISE = J + 1.0;           // the sea starts climbing the beach
export const T_WALL = J + 10.2;          // the wall of water forms and comes in
const WALL_DUR = 5.4;
export const CAM_END_X = 44;             // where the camera has backed up to by then (m inland)
export const wallX = (v) => { const k = clamp((v - T_WALL) / WALL_DUR, 0, 1.2); return 900 * Math.pow(Math.max(0, 1 - k), 1.25) - 75 * k; };   // its foot, m offshore
// the moment its foot reaches a point x metres inland
const hitAt = (x) => { let a = T_WALL, b = T_WALL + WALL_DUR * 1.2; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (wallX(m) > -x) a = m; else b = m; } return a; };
export const T_HIT = hitAt(CAM_END_X - 1);              // it reaches the lens
export const T_SWITCH = Math.round((T_HIT + 0.75) * 60) / 60;   // inside the white flash: the loop point sits in it
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;

// ---- the cursor: which slot it is on (0..5, fractional while it slides) ----
const ease = (u) => { u = clamp(u); return 1 - Math.pow(1 - u, 2.6); };
export function cursorAt(v) {
  for (let i = 0; i < STOPS.length; i++) {
    const st = STOPS[i], nx = STOPS[i + 1];
    if (!nx || v < st.spin) return st.planet.slot;
    if (v < nx.land) return lerp(st.planet.slot, nx.planet.slot, ease((v - st.spin) / (nx.land - st.spin)));
  }
  return STOPS[STOPS.length - 1].planet.slot;
}
// the stop whose planet is in the sky now
export function stopAt(v) {
  let i = 0;
  while (i + 1 < STOPS.length && v >= STOPS[i + 1].land) i++;
  return i;
}
// the counter's number: the planet's size, racing between two sizes while the cursor slides
export function sizeAt(v) {
  const i = stopAt(v), st = STOPS[i], nx = STOPS[i + 1];
  if (!nx || v < st.spin) return fmtSize(st.planet.size);
  const u = ease((v - st.spin) / (nx.land - st.spin));
  return fmtSize(Math.exp(lerp(Math.log(st.planet.size), Math.log(nx.planet.size), u)));
}
// the one line under the counter: { text, alpha, rise }
export function lineAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const nx = STOPS[i + 1];
  let cur = null, t0 = 0, t1 = (nx ? nx.land : 1e9) - st.land;
  const dt = v - st.land;
  for (let j = 0; j < st.lines.length; j++) {
    const [a, text] = st.lines[j];
    const b = j + 1 < st.lines.length ? st.lines[j + 1][0] : Math.min(st.spin - st.land, t1);
    if (dt >= a && dt < b) { cur = text; t0 = a; t1 = b; }
  }
  if (!cur) return null;
  return { text: cur, alpha: smooth(t0, t0 + 0.25, dt) * (1 - smooth(t1 - 0.2, t1, dt)), rise: (1 - smooth(t0, t0 + 0.25, dt)) * 12 };
}

// ---- state ----
export function state(v) {
  const s = { v };
  const i = stopAt(v);
  s.i = i;
  s.stop = STOPS[i]; s.planet = STOPS[i].planet;
  s.prev = STOPS[Math.max(0, i - 1)].planet;
  s.sw = i === 0 ? 1 : smooth(STOPS[i].land, STOPS[i].land + 0.12, v);      // the sky's switch (fast)
  s.since = v - STOPS[i].land;
  s.cursor = cursorAt(v);
  // the snap: a short pulse at every landing
  s.snap = i === 0 ? 0 : Math.exp(-Math.max(0, s.since) / 0.12) * smooth(-0.01, 0.02, s.since);
  s.nightL = 1;                                        // lamps, windows, the wheel's lights: on all night
  // ---- Jupiter's pull (the last stop) ----
  s.pull = smooth(J + 0.3, J + 2.5, v);
  s.seaY = 1.3 * smooth(T_RISE, J + 9.6, v);           // the sea level climbing the beach (m)
  s.bulge = Math.pow(smooth(J + 0.3, J + 8.0, v), 1.4) * (1 + 0.35 * smooth(T_WALL, T_HIT, v));   // the dome on the horizon (0..1)
  s.wall = smooth(T_WALL - 0.2, T_WALL + 0.8, v);
  s.wallX = wallX(v);
  s.wallH = s.wall * (24 + 56 * smooth(T_WALL, T_WALL + WALL_DUR * 0.8, v));   // m
  s.roar = smooth(T_WALL - 1, T_HIT, v);
  // the white flash as it hits the lens; the loop point sits inside it
  s.cover = smooth(T_HIT - 0.3, T_HIT - 0.06, v);          // (white within a quarter of a second of the spray filling the frame)
  s.flash = s.cover;
  s.flashColor = '#ffffff';
  s.title = 1 - smooth(3.0, 3.6, v);
  return s;
}
