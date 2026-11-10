// Where the Triceratops herd runs (shared by beasts.js, people.js and traffic.js, so nobody is ever in its way).
// Six of them burst out of the side street on the left, ahead of you, at about 0:17-0:19. Four turn straight down the
// median at you and pass on your left (2.8 m away); two cross in front of you and run down between the jammed cars on
// your right (out of the way before you look at the harbour). They gallop at 9 m/s (20 mph), each one 9 m behind the one in front.
import * as THREE from 'three';
import { clamp } from './util.js';

const path = (pts) => {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  c.arcLengthDivisions = 600;
  return { c, L: c.getLength() };
};
const LEFT = path([[-90, -9.5], [-30, -9.5], [-12, -9], [-4.6, -4.5], [-2.9, 3], [-2.9, 40], [-3.2, 140]]);
const RIGHT = path([[-95, -7.5], [-30, -7.5], [-4, -8.5], [5, -6.5], [8.6, -1], [8.75, 30], [8.75, 140]]);
export const HERD_SP = 9.0;
// [which path, when it comes out of the side street (crosses x = -17), a sideways nudge (m), size]
export const HERD = [
  [RIGHT, 16.8, 0.0, 1.0], [LEFT, 17.1, 0.0, 1.04], [RIGHT, 17.8, 0.15, 0.94], [LEFT, 18.1, -0.1, 0.97],
  [LEFT, 19.1, 0.1, 0.9], [LEFT, 20.1, -0.05, 1.06],
].map(([P, t17, nudge, size], i) => {
  // arc length where the path crosses x = -17
  let s17 = 0; for (let s = 0; s < P.L; s += 0.1) { if (P.c.getPointAt(s / P.L).x >= -17) { s17 = s; break; } }
  return { i, P, t0: t17 - s17 / HERD_SP, nudge, size, left: P === LEFT };
});
const _p = new THREE.Vector3(), _t = new THREE.Vector3();
export function herdAt(h, v) {
  const s = HERD_SP * (v - h.t0);
  const u = clamp(s / h.P.L, 0, 1);
  h.P.c.getPointAt(u, _p); h.P.c.getTangentAt(u, _t);
  return { x: _p.x - _t.z * h.nudge, z: _p.z + _t.x * h.nudge, yaw: Math.atan2(_t.x, _t.z), s };
}
// the herd's whereabouts as a few circles along each body (for keeping people out of the way)
export function herdBlocks(v) {
  const out = [];
  for (const h of HERD) {
    const q = herdAt(h, v);
    if (q.s < 0 || q.x < -40 || q.z > 70) continue;
    for (const a of [-3, 0, 3]) out.push({ x: q.x + Math.sin(q.yaw) * a, z: q.z + Math.cos(q.yaw) * a, r: 2.0 });
  }
  return out;
}
