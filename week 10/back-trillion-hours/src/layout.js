// Where things are: you stand at the origin facing -z (north) the whole video. The camera stands behind you (+z) at eye
// level. Each stop has lanes the animals run along (kept clear of trees and rocks) and a camera base position.
import * as THREE from 'three';
import { clamp } from './util.js';

export const YOU = { x: 0, z: 0 };
// camera base per stop (relative to you): position, the point it looks at, fov
export const CAMS = [
  { p: [-0.72, 1.72, 5.0], look: [-0.1, 7.2, -40], fov: 54 },     // today: down the avenue
  { p: [-0.72, 1.72, 5.0], look: [-0.1, 7.0, -40], fov: 52 },      // 1912
  { p: [-0.72, 1.72, 5.0], look: [-0.6, 7.2, -40], fov: 54 },      // forest
  { p: [-0.72, 1.72, 5.0], look: [-0.4, 7.6, -40], fov: 56 },      // ice age
  { p: [-0.72, 1.72, 5.0], look: [-0.3, 7.2, -40], fov: 54 },     // bear
  { p: [-0.72, 1.72, 5.0], look: [-0.2, 6.6, -40], fov: 56 },      // cats
  { p: [-0.72, 1.72, 5.0], look: [-0.2, 6.8, -40], fov: 54 },     // shore
  { p: [-0.72, 1.72, 5.0], look: [-0.6, 11.6, -40], fov: 60 },      // dinosaurs
];

// a path through [x, z] points: arc length, point and heading at s
export function makePath(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  curve.arcLengthDivisions = 800;
  const L = curve.getLength();
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  const at = (s) => {
    const u = clamp(s / L, 0, 1);
    curve.getPointAt(u, p);
    let tx = 0, tz = 0;
    for (const ds of [-1.2, 0, 1.2]) { curve.getTangentAt(clamp((s + ds) / L, 0, 1), t); tx += t.x; tz += t.z; }
    // past the ends: carry on straight
    const over = s - L, under = -s;
    const yaw = Math.atan2(tx, tz);
    if (over > 0) return { x: p.x + Math.sin(yaw) * over, z: p.z + Math.cos(yaw) * over, yaw };
    if (under > 0) return { x: p.x - Math.sin(yaw) * under, z: p.z - Math.cos(yaw) * under, yaw };
    return { x: p.x, z: p.z, yaw };
  };
  return { L, at, pts };
}

// the animals' lanes (their paths, as drawn on the ground) per stop; plants keep out of these
export const LANES = {
  1: [[[-16, -13.5], [-8, -14], [0, -14.5], [5, -17], [7, -22], [5, -27], [1, -28], [-2, -25], [-1.5, -15], [-0.5, -5], [-0.2, -1.5]]],
  2: [[[-7, -11.5], [-4.6, -9.6], [-2.8, -8.2], [-2.2, -5.5], [-1.9, -2.5], [-1.8, 0], [-1.8, 2.5]]],
  3: [[[-34, -60], [-16, -30], [-1.2, -4], [4, 6]], [[-40, -50], [-20, -20], [-6, 0], [-2, 16]], [[-22, -70], [-4, -40], [6, -14], [12, 4]], [[-50, -30], [-28, -10], [-12, 8]], [[-12, -80], [6, -50], [18, -26]]],
  4: [[[-10, -40], [-6, -26], [-3.5, -14], [-2.2, -7], [-1.6, -3.4], [-1.3, -1]]],
  5: [[[-5.5, -26], [-3.6, -14], [-2.5, -7], [-2.1, -3.4]], [[2, -30], [0.8, -16], [-0.1, -8], [-0.3, -4.6]], [[-1.4, -30], [-1.0, -12], [-0.9, -4.8], [-1.1, -2.6], [-1.5, -0.6], [-1.6, 1.0], [-1.6, 3.0]], [[-4, -40], [-2.6, -22], [-1.9, -12], [-1.8, -7]]],
  6: [],
  7: [[[-70, -23], [-20, -22], [40, -26]], [[-4, -48], [-2.8, -30], [-2.0, -15], [-1.7, -7], [-1.6, -4.2], [-1.6, -2]]],
};
const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const u = L2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / L2) : 0;
  return Math.hypot(x - (ax + dx * u), z - (az + dz * u));
};
// may something stand at (x, z) at stop k? (keep: extra margin for wide things like trees)
export function clearOf(k, x, z, keep = 0) {
  const c = CAMS[k];
  if (k === 2 && keep > 0.5) {
    if (Math.hypot(x + 2.6, z + 7.5) < 8 + keep * 2) return false;              // the clearing it stands in
    if (z < -6 && z > -110 && x > -16 + z * 0.08 && x < 5 - z * 0.06) return false;   // the meadow behind it
    if (x > -3 && x < 14 && z > -14 && z < 6) return false;                        // nothing between it and the Sun
  }
  if (Math.hypot(x, z) < 1.6 + keep * 1.5) return false;
  // the camera, and the corridor from it past you to what you look at
  if (segDist(x, z, c.p[0], c.p[2], 0, 0) < 1.4 + keep * 1.5) return false;
  // (the bear stop: the camera backs off to z ~10.6 while it stands; keep that corridor clear too)
  if (k === 4 && segDist(x, z, -0.72, 11.5, 0, 0) < 2.2 + keep * 1.5) return false;
  if (Math.hypot(x - c.p[0], z - c.p[2]) < 2.5 + keep * 2) return false;
  for (const lane of LANES[k] || []) {
    for (let i = 0; i < lane.length - 1; i++) {
      const w = (k === 7 && i < 3 && lane === LANES[7][0] ? 7 : 2.4) + keep * 3;
      if (segDist(x, z, lane[i][0], lane[i][1], lane[i + 1][0], lane[i + 1][1]) < w) return false;
    }
  }
  return true;
}
