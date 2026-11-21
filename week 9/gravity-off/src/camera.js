// The camera's path, shared by main.js (to draw) and people.js (to keep everyone's path clear of the lens).
// Keys relative to you: [video time, azimuth round you (deg, 0 = south of you), distance, height above your feet,
// facing (deg, 0 = north, 90 = east), pitch (deg), fov]; monotone cubic between keys.
import { youAt, tOf } from './timeline.js';
import { BASIN } from './layout.js';
export const CAMK = [
  [-2, 10, 4.8, 1.0, 0, 12, 62],
  [0, 10, 4.8, 1.0, 0, 12, 62],
  [3.5, 4, 4.6, 1.0, 6, 24, 62],
  [7.0, -70, 4.2, 1.1, 78, 20, 60],
  [9.6, -88, 4.3, 1.1, 101.5, 1.5, 22],
  [12.0, -92, 4.4, 1.1, 102.5, 1.5, 19],
  [15.5, -2, 4.0, 1.0, 0, 10, 60],
  [19.5, 60, 5.6, 0.7, -68, 3, 48],
  [23.0, 66, 5.8, 0.7, -70, 3, 48],
  [25.8, 50, 3.6, 1.6, -4, 26, 16],
  [28.0, 46, 3.8, 1.7, -4.5, 26, 18],
  [30.0, 22, 10.5, 0.6, -9, 24, 60],
  [32.5, 18, 9.5, 0.7, -6, 22, 58],
  [35.0, 6, 4.8, 1.0, 0, 12, 62],
  [36.96, 5, 4.7, 1.0, 0, 11, 62],
  [42.0, 3, 4.3, 0.9, 0, 6, 62],
  [45.4, 0, 3.4, 0.9, 0, -4, 64],
  [48, 0, 3.4, 0.9, 0, -4, 64],
];
const camSpl = [1, 2, 3, 4, 5, 6].map((j) => {
  const x = CAMK.map((k) => k[0]), y = CAMK.map((k) => k[j]), n = x.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (t) => {
    if (t <= x[0]) return y[0]; if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
  };
});
export const ck = (j, v) => camSpl[j](v);
const DEG = Math.PI / 180, me = {};
// the camera's position at video time v (into out: anything with set(x, y, z))
export function camPos(v, out) {
  const t = tOf(v);
  youAt(t, me);
  const az = ck(0, v) * DEG, dist = ck(1, v), dh = ck(2, v);
  const x = me.x + Math.sin(az) * dist, z = me.z + Math.cos(az) * dist;
  // never below the paving or into the basin's water
  const y = Math.max(me.y + dh, Math.hypot(x, z) < BASIN.rOut + 0.1 ? 0.75 : 0.35);
  return out.set(x, y, z);
}
