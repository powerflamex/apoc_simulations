// The camera (video time): you, at eye height among the crowd on the promenade, 10 m back from the steps.
// You look at the Moon over the skyline; step 2.5 m forward and look down through a gap in the crowd as the tide
// floods the steps (7-12.6 s); the ring (16-21 s: low enough that the deck and the shadows on it are in shot); the
// first falling pieces; toward the splash, then hurry back from its wave; up into the hard rain; back to the towers
// being hit; up at the giant chunk as it comes down, into the white. (people.js keeps your few steps clear.)
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
const X = sm([[-2, 0], [6.6, 0], [9.8, -0.3], [22, -0.2], [31.9, -0.25], [33.6, 0], [46, 0.1], [51, 0.05]]);
const Z = sm([[-2, 0], [6.6, -0.2], [9.8, -3.2], [12.8, -3.4], [14.5, -2.7], [29, -2.7], [31.9, -2.8], [33.4, -0.6], [36, -0.3], [46, 0.2], [51, 0.2]]);
const YAW = sm([[-2, 0.4], [3, 1.4], [6.6, 1.0], [10.6, 0], [14, 1.5], [20.5, 2.0], [26, 1.2], [29.3, 4.5], [31.5, 3.0], [34, 0], [40, -1.5], [43, 1.5], [45.6, 1.0], [48.5, -0.5], [51, -0.5]]);
const PITCH = sm([[-2, 4], [6.6, 4], [10.0, -7], [12.6, -7], [14.2, 4], [16.4, 2], [20.6, 3], [22.7, 7], [28.8, 6], [29.9, 1], [31.4, -8], [32.4, -6], [33.6, -2], [35.3, 12], [39.4, 12], [40.6, 6], [45.4, 6], [46.8, 21], [48.5, 30], [51, 30]]);
const FOV = sm([[-2, 52], [13.2, 52], [16.3, 66], [20.6, 66], [22.7, 55], [33.3, 55], [35.2, 58], [39.4, 58], [40.6, 55], [45.4, 55], [48.5, 64], [51, 64]]);
export const EYE = 1.62;
export function camAt(v) {
  return { x: X(v), y: EYE - 0.12 * Math.exp(-Math.pow((v - 31.4) / 0.9, 2)), z: Z(v), yaw: YAW(v), pitch: PITCH(v), fov: FOV(v) };
}
