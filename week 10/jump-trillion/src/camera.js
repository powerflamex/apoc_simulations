// The camera (rework, Nov 26): it never leaves you while you're on the street or in the air.
//   0:00 the 10x jump: above the bus, you coming at the lens (a third of the frame), the camera cranes down as you land
//        right in front of it and crouch.
//   each landing jump: a follow rig: on the ground low beside you (east of the bus), then riding up with you, swinging
//        round to show the landmark (roof, tower, clouds; above 2.5 km the space scene takes over: black sky, the Space
//        Station), and back down; it never goes below street level, so on the push-off and the landing it holds still
//        and you leave it / come back into it.
//   the crouch: close above the crater, circling you.  the 1-trillion push-off: at your feet, then from 1.3 km down the
//   avenue.  your flight: space.js.
// You always sit about 30% of the way down from the middle of the frame to the bottom (dyOf: under the counter).
import * as THREE from 'three';
import { youAt } from './choreo.js';
import { JUMPS, V_TRILLION, V_FAR, V_SPACE, V_WHITE } from './timeline.js';
import { P } from './layout.js';
import { smooth, lerp } from './util.js';
import { craterHAt } from './events.js';

const DEG = Math.PI / 180;
// rig per jump: ground [az, dist, fov], top [az, dist, height above you, fov], dy (deg)
// az: where the camera sits round you, 0 = south (+z), 90 = east (+x)
export const RIG = [
  null,
  { g: [72, 4.3, 56], t: [-95, 5.4, 1.4, 62] },        // 100x: the 12-storey roof (east) behind you
  { g: [76, 4.3, 56], t: [52, 5.2, 4.2, 70] },         // 1,000x: the tower's top below you
  { g: [80, 4.3, 56], t: [20, 5.0, 3.5, 62] },         // 10,000x: the cloud deck below you
  { g: [80, 4.3, 56], t: [40, 5.0, 3.0, 62] },         // 100,000x
  { g: [84, 6.5, 58], t: [40, 5.0, 1.2, 62] },         // 1,000,000x (the landing filmed from further back)
];
export const SPACE_Y = 2500;
export const dyOf = (fov) => 0.3 * fov / 2;                     // above this the jump is drawn in the space scene

const up = new THREE.Vector3(0, 1, 0);
// look from pos so that target sits dy degrees below the middle
export function aim(pos, target, dy) {
  const d = target.clone().sub(pos).normalize();
  const right = new THREE.Vector3().crossVectors(d, up);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  d.applyAxisAngle(right, dy * DEG);
  return pos.clone().add(d.multiplyScalar(10));
}
const topW = (u) => smooth(0.02, 0.3, u) * (1 - smooth(0.72, 0.97, u));
export function rigAt(k, u) {
  const r = RIG[k], w = topW(u);
  const fov = lerp(r.g[2], r.t[3], w);
  return { az: lerp(r.g[0], r.t[0], w), d: lerp(r.g[1], r.t[1], w), h: lerp(1.25, r.t[2], w), fov, dy: dyOf(fov), w };
}

// the first jump: [t, x, y, z, fov, dy] (the camera looks at you)
const K0 = [
  [-2.0, 5.3, 9.6, 0.9, 44, 6.5],
  [0.0, 5.5, 9.5, 0.9, 44, 6.5],
  [0.35, 6.0, 7.4, 1.0, 46, 6.5],
  [0.95, 6.6, 2.0, 1.3, 52, 7.0],
  [1.4, 6.8, 1.3, 1.6, 54, 7.5],
  [3.4, P.x + Math.sin(72 * DEG) * 4.3, 1.25, P.z + Math.cos(72 * DEG) * 4.3, 56, 8],
];
function keyed(K, v) {
  let i = 0; while (i < K.length - 2 && v > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], k = smooth(a[0], b[0], v);
  return a.map((x, j) => lerp(x, b[j], k));
}
// the far shot of the 1-trillion push-off: [t, x, y, z, lx, ly, lz, fov]
const KFAR = [[V_FAR, 3.0, 2.2, 1300, 4.2, 330, 0, 60], [V_SPACE, 3.0, 2.2, 1300, 4.2, 420, 0, 62]];
export const FAR_CAM = KFAR[0];

export function youWorld(v) {
  const Y = youAt(v);
  const g = craterHAt(Y.x, Y.z, v);
  return { Y, g, p: new THREE.Vector3(Y.x, g + Y.y + 0.9, Y.z) };
}
export const SPACE_SHOTS = [[V_SPACE, 37.0, 'escape'], [37.0, 39.0, 'moon'], [39.0, 41.0, 'jupiter'], [41.0, 99, 'solar']];
// the camera at v: { pos, look, fov, space: name|undefined }
export function camAt(v) {
  const { Y, p } = youWorld(v);
  if (v >= V_SPACE) { const s = SPACE_SHOTS.find((x) => v < x[1]); return { space: s[2], a: s[0], b: Math.min(s[1], V_WHITE) }; }
  if (v >= V_FAR) {
    const [, x, y, z, lx, ly, lz, fov] = keyed(KFAR, v);
    return { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz), fov, far: true };
  }
  if (v >= V_TRILLION - 0.3) {
    // at your feet: low on the crater floor, close, looking at your legs and the ground under them
    const fl = craterHAt(P.x, P.z, V_TRILLION - 0.31);
    const az = 165 * DEG;
    const pos = new THREE.Vector3(P.x + Math.sin(az) * 2.6, fl + 1.9, P.z + Math.cos(az) * 2.6);
    return { pos, look: aim(pos, new THREE.Vector3(P.x, fl + 0.55, P.z), 0.38 * 31), fov: 62 };
  }
  if (v < JUMPS[1].p - 0.4) {
    const [, x, y, z, fov] = keyed(K0, v);
    const pos = new THREE.Vector3(x, y, z);
    return { pos, look: aim(pos, p, dyOf(fov)), fov };
  }
  if (v >= JUMPS[5].l) {
    // the crouch: circling you from above the crater's edge
    const k = smooth(JUMPS[5].l, V_TRILLION - 0.3, v);
    const r5 = RIG[5];
    // round to the north side, so the avenue behind you (people running, cars backing away) is in view
    const az = lerp(r5.g[0], 178, k) * DEG, d = lerp(r5.g[1], 4.8, smooth(0, 0.3, k));
    const pos = new THREE.Vector3(P.x + Math.sin(az) * d, lerp(1.25, 1.0, k), P.z + Math.cos(az) * d);
    const fov = lerp(r5.g[2], 58, k);
    return { pos, look: aim(pos, p, dyOf(fov)), fov };
  }
  // the landing jumps
  let k = 1;
  for (let i = 1; i <= 5; i++) if (v >= JUMPS[i].p - 0.4) k = i;
  const j = JUMPS[k];
  let az, d, h, fov, dy;
  if (v < j.p) {
    // the short crouch between two jumps: swing from the last rig's ground setting to this one's
    const prev = RIG[k - 1] || RIG[1];
    const kk = smooth(j.p - 0.4, j.p, v);
    az = lerp(prev.g[0], RIG[k].g[0], kk); d = lerp(prev.g[1], RIG[k].g[1], kk); h = 1.25; fov = lerp(prev.g[2], RIG[k].g[2], kk); dy = dyOf(fov);
  } else {
    const r = rigAt(k, Y.u);
    ({ az, d, h, fov, dy } = r);
    if (Y.y > SPACE_Y && k >= 4) return { space: k === 4 ? 'apex' : 'iss', rig: r, k };
  }
  const pos = new THREE.Vector3(p.x + Math.sin(az * DEG) * d, Math.max(1.25, p.y + h - 0.9), p.z + Math.cos(az * DEG) * d);
  return { pos, look: aim(pos, p, dy), fov };
}
export const SHOTS = [];
export const shotAt = () => null;
