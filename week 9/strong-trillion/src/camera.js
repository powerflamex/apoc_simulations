// The camera follows YOU, in one continuous move (owner's fix pass, Nov 21): low and close behind or beside you with a
// wide lens, looking up at what you lift, turning with you as you run to the next thing (which is ahead of you). For the
// three things too big to fit with you (the ship, the tower, the mountain) it pulls back fast, side-on, until the whole
// thing is in frame with daylight under it (you at its base, marked by a glow and a ring of dust: fx.js), then comes
// straight back in on you for the throw, and watches the flight over your shoulder.
// Keys: [t, az (deg: where the camera is from you; 0 = south (+z), 90 = east, 180 = north), dist (m), h (m above your
// feet), lookY (m above your feet), focus, w (0 = look at you .. 1 = look at the focus), fov].
import * as THREE from 'three';
import { youAt, thingAt, towerPiece, mountainAt } from './choreo.js';
import { MTN } from './layout.js';
import { smooth, clamp } from './util.js';

export const KEYS = [
  // frame 0: in front of you, low, the car overhead; the toss lands behind you
  [-2.0, 20, 4.9, 1.0, 2.75, 'you', 0, 72],
  [0.7, 20, 4.9, 1.0, 2.75, 'you', 0, 72],
  [1.5, 28, 4.6, 0.9, 2.0, 'car', 0.25, 72],
  // to the bus at your left; you lift it, the camera low behind your shoulder looking up at it
  [2.6, 72, 4.3, 0.75, 2.4, 'bus', 0.2, 74],
  [4.0, 70, 4.6, 0.75, 3.3, 'bus', 0.2, 76],
  [4.55, 58, 4.6, 0.85, 3.3, 'bus', 0.25, 76],
  // you throw it up the street: we watch it fly and land over your head
  [5.4, 18, 4.6, 1.2, 3.0, 'bus', 0.55, 74],
  [6.45, 6, 4.6, 1.2, 2.4, 'bus', 0.5, 74],
  // you run to the truck (it's ahead of you); behind you as you lift it
  [7.65, -58, 4.5, 0.9, 1.8, 'truck', 0.2, 74],
  [8.5, -60, 4.4, 0.75, 2.4, 'truck', 0.2, 76],
  [9.6, -60, 4.6, 0.75, 3.6, 'truck', 0.15, 76],
  // you turn north under it and throw it into the harbor
  [10.3, -18, 4.8, 0.9, 3.4, 'truck', 0.25, 76],
  [11.0, -6, 5.0, 1.4, 2.6, 'truck', 0.55, 74],
  [11.9, 0, 5.0, 1.5, 2.0, 'truck', 0.5, 74],
  // two bounds to the jet, the camera behind you; then beside you under its nose, looking up at it
  [12.3, -8, 6.0, 2.0, 2.0, 'jet', 0.05, 72],
  [13.05, -50, 11.0, 1.5, 3.0, 'jet', 0.04, 76],
  [15.3, -52, 11.0, 1.5, 3.3, 'jet', 0.04, 76],
  [15.9, -50, 10.5, 1.6, 3.8, 'jet', 0.1, 76],
  // it flies into the ship; then two bounds to the quay, the ship's bow ahead of you
  [16.6, -30, 8.0, 1.6, 4.0, 'jet', 0.55, 76],
  [17.3, -14, 6.5, 1.8, 4.0, 'jet', 0.55, 76],
  [18.75, -40, 5.0, 1.0, 4.0, 'shipN', 0.12, 78],
  // the ship (a): close behind you at its bow, hands digging in
  [20.95, -24, 4.4, 0.85, 4.5, 'shipN', 0.1, 80],
  // (b) a fast pull-back, side-on from the west: the whole ship rising into the sky off your hands
  [21.25, -60, 40, 12, 10, 'shipN', 0.3, 66],
  [21.6, -103, 490, 80, 60, 'ship', 0.8, 60],
  [22.55, -103, 490, 80, 70, 'ship', 0.8, 60],
  [22.78, -40, 60, 14, 4, 'you', 0, 68],
  // (c) straight back in on you for the throw, then over your shoulder as it flies across the harbor
  [22.98, -22, 6.5, 1.3, 3.2, 'you', 0, 80],
  [23.4, 6, 6.0, 1.3, 5.0, 'shipN', 0.35, 78],
  [25.3, 12, 5.5, 1.6, 4.0, 'ship', 0.45, 74],
  // three bounds to the tower (ahead of you), the camera behind
  [25.7, -70, 6.5, 2.0, 2.5, 'towerB', 0.1, 72],
  [26.1, -118, 7.0, 1.8, 2.5, 'towerB', 0.08, 74],
  [27.05, -132, 7.0, 1.6, 3.5, 'towerB', 0.08, 76],
  // the tower (a): close behind you at its corner
  [27.9, -42, 4.4, 0.85, 5.0, 'towerB', 0.1, 80],
  // (b) pull-back side-on from over the harbor: the whole tower tipping up off your hands
  [28.4, -80, 50, 10, 15, 'towerB', 0.3, 66],
  [28.95, -135, 430, 55, 60, 'tower', 0.75, 60],
  [29.85, -135, 430, 55, 70, 'tower', 0.75, 60],
  [30.12, -70, 60, 14, 8, 'towerB', 0.2, 68],
  // (c) back in for the throw; watch it fly across the harbor
  [30.35, -40, 5.5, 1.6, 3.5, 'you', 0, 78],
  [31.0, -24, 9.0, 1.2, 5.2, 'you', 0, 80],
  [31.9, -20, 8.0, 1.3, 4.0, 'you', 0, 78],
  [32.6, -18, 6.0, 1.6, 3.0, 'tower', 0.04, 74],
  // the jump across the harbor: chasing you close, from behind your left shoulder, you low in the frame (under the
  // counter); the landed ship stays out of frame
  [33.2, -10, 8.0, 2.0, 2.5, 'you', 0, 74],
  [33.9, -26, 6.5, 2.6, 3.6, 'you', 0, 74],
  [35.6, -30, 6.2, 2.6, 3.6, 'you', 0, 74],
  // the mountain (a): behind you and above, looking down at your hands in the ground at its foot: the crack runs off
  // both ways along the foot; then down low behind you, looking up: its edge comes up onto your hands, and as it tips
  // up a slot of daylight opens under it all the way across
  [36.2, -16, 6.0, 3.0, 1.5, 'you', 0, 76],
  [36.55, -6, 5.2, 3.2, 0.2, 'you', 0, 78],
  [37.25, -4, 5.4, 3.2, 0.3, 'you', 0, 78],
  [37.7, -6, 4.6, 0.45, 2.4, 'you', 0, 80],
  [38.55, -8, 5.0, 0.4, 2.8, 'you', 0, 80],
  // (b) a fast pull-back, low and straight back over the harbor, then up and round to the east: side-on, the whole
  // mountain held up by its edge, its snow cap tipped, a wedge of daylight under it, you at its foot (marked by a glow)
  [38.85, 0, 400, 8, 70, 'mtn', 0.3, 64],
  [39.2, 60, 4000, 250, 500, 'mtn', 0.8, 50],
  [39.45, 80, 9000, 400, 700, 'mtn', 0.85, 46],
  [39.95, 80, 9000, 400, 750, 'mtn', 0.85, 46],
  // (c) back in behind you for the throw (round the east side, then down from above); it flies away from us and lands
  // on the horizon; the dust wall rolls at us
  [40.2, 60, 900, 200, 50, 'you', 0, 66],
  [40.35, 15, 70, 30, 6, 'you', 0, 72],
  [40.5, -16, 6.5, 1.4, 2.4, 'you', 0, 80],
  [41.2, -12, 7.0, 1.4, 2.9, 'you', 0, 76],
  [42.3, -10, 7.5, 1.5, 2.6, 'you', 0, 68],
  [43.6, -8, 7.5, 1.5, 2.4, 'mtnL', 0.02, 60],
  [47.5, -8, 7.5, 1.5, 2.4, 'mtnL', 0.02, 60],
];

// monotone cubic through one column (log space for the distance)
const COL = (j, log = false) => {
  const x = KEYS.map((k) => k[0]), y = KEYS.map((k) => (log ? Math.log(k[j]) : k[j])), n = x.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (t) => {
    let r;
    if (t <= x[0]) r = y[0]; else if (t >= x[n - 1]) r = y[n - 1];
    else {
      let i = 0; while (t > x[i + 1]) i++;
      const h = x[i + 1] - x[i], s = (t - x[i]) / h;
      r = (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
    }
    return log ? Math.exp(r) : r;
  };
};
const AZ = COL(1), DIST = COL(2, true), H = COL(3), LY = COL(4), W = COL(6), FOV = COL(7);
const DEG = Math.PI / 180;

function focusAt(name, v, Y, ly) {
  const p = new THREE.Vector3();
  switch (name) {
    case 'car': case 'bus': case 'truck': case 'jet': return p.copy(thingAt(name, v).p);
    case 'ship': return p.copy(thingAt('shipMid', v).p);
    case 'shipN': { const sm = thingAt('shipMid', v); return p.set(-118, 0, 0).applyQuaternion(sm.q).add(sm.p); }
    case 'tower': return p.copy(towerPiece(2, v).p);
    case 'towerB': return p.copy(towerPiece(0, v).p);
    case 'mtn': return p.set(MTN.x, 600, MTN.z).applyMatrix4(mountainAt(v).M);
    case 'mtnL': return p.set(MTN.x, 250, MTN.z + 900).applyMatrix4(mountainAt(v).M);   // low on its near face
    default: return p.set(Y.x, ly + Y.air, Y.z);
  }
}
// the camera at video time v: { pos, look, fov, dist (to you) }
export function camAt(v) {
  const Y = youAt(v);
  const az = AZ(v) * DEG, d = DIST(v), h = H(v), ly = LY(v), w = clamp(W(v), 0, 1), fov = FOV(v);
  // the rig follows your jumps only partly (no bobbing on every bound)
  const yy = Y.air * (Y.mode === 'leap' ? 1.0 : 0.5);
  const pos = new THREE.Vector3(Y.x + Math.sin(az) * d, yy + h, Y.z + Math.cos(az) * d);
  const me = new THREE.Vector3(Y.x, yy + ly, Y.z);
  let i = 0; while (i < KEYS.length - 2 && v > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = smooth(a[0], b[0], v);
  const Fa = focusAt(a[5], v, Y, ly), Fb = focusAt(b[5], v, Y, ly);
  const F = a[5] === b[5] ? Fa : Fa.lerp(Fb, k);
  const look = me.clone().lerp(F, w);
  return { pos, look, fov, dist: pos.distanceTo(new THREE.Vector3(Y.x, Y.air + 1, Y.z)) };
}
