// The camera (video time): you, at eye height among the crowd on the promenade, 10 m back from the steps.
// You watch the Moon's pieces grind over the skyline (up a little as they spread); step 3 m forward and look down
// through a gap in the crowd as the tide floods the steps (10-12.3 s); back up for the ring (13-16 s: low enough that
// the deck and the shadows on it are in shot, wide); the first falling pieces; up into the meteor rain (20.6 s); down
// to the fireball in the harbour (24.6 s), then hurry back from its wave; across the towers being hit (30-43 s); up at
// the giant chunk as it comes down, into the white. (people.js keeps your few steps clear.)
// Keys run from before frame 0 (the loop's lead-in plays v < 0) so the start is smooth.
const sm = (k) => {
  const xs = k.map((p) => p[0]), ys = k.map((p) => p[1]), n = xs.length;
  // Catmull-Rom with the ends held flat
  return (t) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (t > xs[i + 1]) i++;
    const t0 = xs[i], t1 = xs[i + 1], p0 = ys[i], p1 = ys[i + 1];
    const m0 = i > 0 ? (p1 - ys[i - 1]) / (t1 - xs[i - 1]) * (t1 - t0) : 0;
    const m1 = i + 2 < n ? (ys[i + 2] - p0) / (xs[i + 2] - t0) * (t1 - t0) : 0;
    const u = (t - t0) / (t1 - t0), u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  };
};
const X = sm([[-2, 0], [8.4, 0], [10.0, -0.3], [16, -0.2], [26.9, -0.25], [28.6, 0], [40, 0.1], [50, 0.05]]);
const Z = sm([[-2, 0], [8.4, -0.2], [10.0, -3.1], [11.8, -3.3], [13.0, -2.7], [24, -2.7], [26.9, -2.8], [28.4, -0.6], [31, -0.3], [44, 0.2], [50, 0.2]]);
// (from 30 s: you look toward each tower as it is hit, about halfway)
const YAW = sm([[-2, 0.4], [3, 1.4], [6.6, 0.6], [9.6, 0], [12.6, 1.5], [15.8, 2.0], [18.5, 1.2], [22.4, 1.0], [24.3, 4.5], [26.5, 3.0], [28.5, 0],
  [29.8, -5.5], [31.2, 7], [32.7, 6.5], [33.9, -4.5], [35.4, -2.5], [36.8, 2.5], [38.4, -0.8], [40.0, 3], [41.5, -10], [42.8, 9.5], [44.2, 2],
  [46.7, -0.5], [50, -0.5]]);
const PITCH = sm([[-2, 4], [2.5, 4], [7.5, 6.5], [9.0, 5], [10.3, -7], [11.9, -7], [12.9, 3], [16.0, 3], [17.2, 7], [19.6, 7.5], [21.4, 12],
  [23.0, 11.5], [24.3, 1], [26.4, -8], [27.4, -6], [28.6, -2], [30.0, 6], [43.6, 6], [45.1, 21], [46.7, 30], [50, 30]]);
const FOV = sm([[-2, 52], [11.9, 52], [12.9, 66], [16.0, 66], [17.2, 55], [20.4, 55], [21.6, 58], [23.0, 58], [24.3, 55], [43.6, 55], [46.7, 64], [50, 64]]);
export const EYE = 1.62;
export function camAt(v) {
  return { x: X(v), y: EYE - 0.12 * Math.exp(-Math.pow((v - 26.4) / 0.9, 2)), z: Z(v), yaw: YAW(v), pitch: PITCH(v), fov: FOV(v) };
}
