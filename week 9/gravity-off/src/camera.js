// The camera's path, shared by main.js (to draw) and people.js (to keep everyone's path clear of the lens).
// Keys relative to you: [video time, azimuth round you (deg, 0 = south of you), distance, height above your feet,
// facing (deg, 0 = north, 90 = east), pitch (deg), fov]; monotone cubic between keys.
import { youAt, tOf } from './timeline.js';
import { BASIN } from './layout.js';
export const CAMK = [
  [-2, 10, 4.8, 1.0, 0, 12, 62],
  [0, 10, 4.8, 1.0, 0, 12, 62],
  // the kid shoots up: pull back south and tilt with him past the floors of the block behind
  [3.5, 6, 6.5, 1.0, 6, 16, 58],
  [7.5, 4, 10.0, 1.2, 7, 15, 52],
  // turn to the court (you in the foreground): the player on the rim, the others floating past him
  // (the camera keeps moving: it pushes in, rises and tilts up with everyone rising; you stay whole, right of centre)
  [10.2, -124, 7.0, 0.9, 117, 3, 54],
  [13.0, -130, 5.3, 1.5, 123, 10, 54],
  // swing round past your face to the street: cars sliding across the crossing, one drifting toward the fountain
  [16.3, 56, 5.0, 1.0, -62, 5, 50],
  [19.6, 58, 5.2, 1.0, -64, 5, 50],
  // your face (ears pop), then tilt up: the pool's water heaving up over the roof of the block
  [21.6, 15, 4.3, 1.0, -8, 10, 58],
  [23.4, 8, 4.4, 0.8, -3, 15, 58],
  [25.4, 2, 17.5, 1.2, -1, 9, 31],
  [28.4, 2, 18.0, 1.2, -1, 9, 29],
  // the drifting car over the basin, coming at you; 0.00; everything drops; the car and you into the fountain
  [29.7, 25, 6.0, 0.8, -27, 8, 56],
  [31.6, 26, 6.0, 0.9, -28, 4, 56],
  [34.0, 22, 4.8, 1.0, -22, 0, 58],
  [35.4, 14, 3.9, 1.1, -12, -6, 60],
  // look up and right: the kid falling 50 ft into the big tree
  [36.6, -60, 6.0, 1.45, 107, 37, 40],
  [38.6, -60, 6.0, 1.45, 109, 31, 32],
  [40.0, -55, 6.0, 1.45, 107, 25, 36],
  // round to the north: the pool pouring off the roof, the fountain's big jet coming down on top of you
  [41.6, 12, 4.0, 1.45, -6, 21, 52],
  [43.4, 8, 3.6, 1.5, -4, 22, 54],
  [44.8, 6, 2.6, 1.6, -3, 34, 64],
  [47, 6, 2.6, 1.6, -3, 34, 64],
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
