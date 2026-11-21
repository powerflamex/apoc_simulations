// The camera's path, shared by main.js (to draw) and people.js (to keep everyone's path clear of the lens).
// One key table per stop, in video time. Keys relative to you: [video time, azimuth round you (deg, 0 = south of
// you), distance, height above your feet, facing (deg, 0 = north, 90 = east), pitch (deg), fov]; monotone cubic
// between keys. In the space stops you float at SPACE_YOU in the scene (the square hidden) and the Earth is drawn by
// its own camera turned the same way.
import { youAt, tIn, stopAt, STOPS } from './timeline.js';
import { BASIN } from './layout.js';
export const SPACE_YOU = { x: 0, y: 400, z: 0 };
export const CAMS = [
  // 5 SECONDS: frame 0 close on you; pull back and tilt up with the kid; then wide from the south-west (between the
  // trees) so your drop into the fountain and the kid's fall into the tree are both in frame
  [
    [-2, 10, 4.8, 1.0, 0, 12, 62],
    [0, 10, 4.8, 1.0, 0, 12, 62],
    [2.4, -4, 8.5, 0.8, 14, 24, 62],
    [4.6, -26, 19.0, -1.2, 42, 12, 66],
    [5.7, -26, 19.0, 3.35, 43, 9, 66],
    [7.2, -26, 18.6, 3.4, 44, 9, 66],
  ],
  // 1 MINUTE: beside you, the sky going dark over the rooftops and the fountain's column; tilting down past you to the
  // square below; then the fall, looking down and west so the cars hit the street below you
  [
    [7.0, 15, 3.4, 2.4, -15, -14, 64],
    [9.0, 20, 3.4, 3.0, -20, -32, 64],
    [10.6, 25, 3.0, 4.2, -25, -58, 64],
    [12.6, 30, 3.0, 4.6, -40, -64, 66],
    [14.85, 32, 3.0, 4.4, -42, -56, 66],
  ],
  // 10 MINUTES: above you, a band of black sky over the city's edge, the city far below; the fall
  [
    [14.85, 20, 3.2, 3.5, -20, -22, 62],
    [18.6, 30, 3.0, 4.0, -30, -40, 62],
    [23.65, 35, 3.0, 4.2, -35, -62, 64],
  ],
  // 1 HOUR: west of you looking east: you, the Earth's curved edge, the bare sea floor and the lifted seas; the fall
  [
    [23.65, -80, 3.8, 1.0, 70, -14, 60],
    [27.3, -82, 3.8, 1.0, 72, -18, 60],
    [31.75, -84, 3.6, 1.6, 75, -40, 62],
  ],
  // 1 DAY: you hang between the camera and the swelling Sun; then above you, looking down past you at the whole Earth
  // as everything flung off it spreads into a flat cloud 6 times its width; then round to the Sun again for the white
  [
    [31.75, 128, 3.5, -0.6, 216, 26, 60],
    [35.2, 98, 3.5, 0.4, 247, 10, 58],
    [36.8, 180, 1.6, 4.4, 180, -72, 60],
    [39.6, 180, 1.6, 4.5, 180, -76, 58],
    [40.0, 180, 1.6, 4.5, 181, -76, 58],
    [41.3, 104, 3.5, 1.5, 256, -10, 56],
    [44.8, 104, 3.2, 1.5, 256, -10, 52],
    [47, 104, 3.2, 1.5, 256, -10, 52],
  ],
];
const SPL = CAMS.map((K) => [1, 2, 3, 4, 5, 6].map((j) => {
  const x = K.map((k) => k[0]), y = K.map((k) => k[j]), n = x.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (t) => {
    if (t <= x[0]) return y[0]; if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
  };
}));
export const ck = (j, v) => SPL[stopAt(v)][j](v);
const DEG = Math.PI / 180, me = {};
// where you are (the camera's anchor) at video time v
export function anchorAt(v, out = me) {
  const i = stopAt(v);
  if (STOPS[i].scene === 'space') { out.x = SPACE_YOU.x; out.y = SPACE_YOU.y; out.z = SPACE_YOU.z; return out; }
  return youAt(tIn(i, v), out);
}
// the camera's position at video time v (into out: anything with set(x, y, z))
export function camPos(v, out) {
  const p = anchorAt(v);
  const az = ck(0, v) * DEG, dist = ck(1, v), dh = ck(2, v);
  const x = p.x + Math.sin(az) * dist, z = p.z + Math.cos(az) * dist;
  // never below the paving or into the basin's water
  const y = Math.max(p.y + dh, Math.hypot(x, z) < BASIN.rOut + 0.1 ? 0.75 : 0.35);
  return out.set(x, y, z);
}
