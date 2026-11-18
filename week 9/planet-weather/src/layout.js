// Where everything is. Santa Monica on a packed summer day: a straight, wide beach facing the Pacific, the pier and
// its Ferris wheel just to the north. World: +x inland (east), -x out to sea (west), +z south, -z north (toward the
// pier), +y up. "d" is the distance inland from the waterline (= x): d < 0 the sea | 0-165 sand.
// Bearings: degrees right of due west (toward the north). A camera with bearing b looks along (-cos b, 0, -sin b).
// The camera never moves: it stands just behind you on the sand, 24 m up from the water, looking out to sea a little
// toward the pier (on the right of the frame). Frame-right is north; the big winds blow from left to right.
import { rng, lerp, smooth } from './util.js';

export const PIER = { z: -110, x0: 236, x1: -330, deck: 9.2, w: 18, park: [-215, -55], parkW: 52 };
export const WHEEL = { x: -150, z: -88, r: 13.5, hub: 9.2 + 15.5 };
export const dirOf = (b) => ({ x: -Math.cos(b * Math.PI / 180), z: -Math.sin(b * Math.PI / 180) });

// ---- the sea floor: steep in the surf (1 in 15), then the gentle shelf of Santa Monica Bay ----
export const SHELF = [[0, 0], [60, 4], [400, 12], [3000, 30], [20000, 60], [100000, 400]];
export function depthAt(o) {
  if (o <= 0) return 0;
  for (let i = 0; i < SHELF.length - 1; i++) {
    const [a, ha] = SHELF[i], [b, hb] = SHELF[i + 1];
    if (o <= b) return lerp(ha, hb, (o - a) / (b - a));
  }
  return 400 + (o - 100000) * 0.004;
}
export function sandY(d) {
  if (d <= 0) return -depthAt(-d);
  if (d < 50) return 2.2 * Math.pow(d / 50, 0.9);
  return 2.2 + 0.8 * smooth(50, 165, d);
}
export const landY = (d) => (d < 165 ? sandY(d) : 3.0);
export function groundY(x) { return x < 0 ? -depthAt(-x) : landY(Math.min(x, 3000)); }

// ---- the camera and you ----
export const CAM0 = { x: 24, z: 0, b: 12, h: 1.9 };                 // h: height above the sand (m)
export const CAM_FWD = dirOf(CAM0.b);
export const CAM_RIGHT = { x: -CAM_FWD.z, z: CAM_FWD.x };             // frame-right (north-ish): where the wind blows
export function camFront(r, l, c = CAM0) {     // r metres ahead of the camera, l to its right (world x, z)
  const f = dirOf(c.b);
  return { x: c.x + f.x * r - f.z * l, z: c.z + f.z * r + f.x * l };
}
export const YOU = camFront(4.0, -0.52);       // where you stand, facing the sea
YOU.y = landY(YOU.x);
export const FACE_YAW = Math.atan2(CAM_FWD.x, CAM_FWD.z);   // a figure's yaw that faces the sea (its +z along CAM_FWD)
// the frame, roughly: is (x, z) inside the camera's view (with a margin, radians)?
export function inView(x, z, m = 0) {
  const dx = x - CAM0.x, dz = z - CAM0.z;
  const f = dx * CAM_FWD.x + dz * CAM_FWD.z, l = dx * CAM_RIGHT.x + dz * CAM_RIGHT.z;
  return f > 0 && Math.abs(Math.atan2(l, f)) < 0.33 + m;
}

// ---- things on the beach ----
export const UMBRELLAS = [], TOWELS = [], CHAIRS = [], LIFEGUARD = [];
{
  const R = rng(9001);
  const COLS = [0xe8483a, 0xf3c52f, 0x2f8fd8, 0x29a36a, 0xff7f2a, 0xf2f2f2, 0x1f4fa8, 0xd93c8c, 0x8e44ad, 0x16a085];
  const free = (x, z, r) => !UMBRELLAS.some((u) => Math.hypot(u.x - x, u.z - z) < r);
  const ok = (x, z) => {
    if (Math.abs(z - PIER.z) < 13) return false;                         // (not under the pier)
    const dx = x - CAM0.x, dz = z - CAM0.z;
    const f = dx * CAM_FWD.x + dz * CAM_FWD.z, l = dx * CAM_RIGHT.x + dz * CAM_RIGHT.z;
    if (f > -3 && f < 13 && Math.abs(l) < 6 + f * 0.35) return false;    // (none between you and the lens, nor in front of you close up)
    if (Math.hypot(dx, dz) < 5) return false;
    return true;
  };
  // thick all along the dry sand, thinning out far along the beach; a few down by the water
  for (let k = 0; k < 9000 && UMBRELLAS.length < 260; k++) {
    const x = 8 + R() * 120, z = -420 + R() * 840;
    const near = Math.exp(-Math.hypot(x - CAM0.x, z) / 110);
    if (R() > 0.12 + 0.88 * near) continue;
    if (!ok(x, z) || !free(x, z, 4.6)) continue;
    UMBRELLAS.push({ x, z, seed: R(), col: COLS[Math.floor(R() * COLS.length)], h: 2.15 + R() * 0.3, tilt: (R() - 0.5) * 0.35 });
  }
  const TC = [0xffffff, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0x16a085];
  for (const u of UMBRELLAS) {
    if (R() < 0.85) TOWELS.push({ x: u.x + (R() < 0.5 ? -1 : 1) * (1.3 + R()), z: u.z + (R() - 0.5) * 2.4, yaw: R() * 3.14, col: TC[Math.floor(R() * TC.length)], seed: R() });
    if (R() < 0.55) CHAIRS.push({ x: u.x + (R() - 0.5) * 2, z: u.z + (R() - 0.5) * 2, yaw: -Math.PI / 2 + (R() - 0.5) * 0.8, seed: R(), col: R() < 0.5 ? 0xf2f2ee : R() < 0.5 ? 0x2f6db5 : 0xe9b949 });
  }
  for (let k = 0; k < 220; k++) {
    const x = 6 + R() * 120, z = -320 + R() * 640;
    if (!ok(x, z)) continue;
    TOWELS.push({ x, z, yaw: R() * 3.14, col: TC[Math.floor(R() * TC.length)], seed: R() });
  }
  // towels laid out on the sand round you (at the edges of the frame)
  [[3.0, -2.9, 0.3, 0xe94f37], [5.6, 2.8, 1.3, 0x3b8ed0], [7.8, -3.6, 2.2, 0xf6c445], [9.5, 3.3, 0.6, 0xffffff], [11.5, -4.4, 1.9, 0xff9ec4]].forEach(([r, l, yaw, col], k) => {
    const c = camFront(r, l);
    TOWELS.push({ x: c.x, z: c.z, yaw, col, seed: 0.1 + 0.15 * k, near: true });
  });
  // the lifeguard towers: small painted huts on stilts with a ramp; one in view down by the water
  LIFEGUARD.push({ x: 5, z: -40, yaw: 0.2, col: 0x3d8fd1, seed: 0.37 }, { x: 30, z: -160, yaw: 0.05, col: 0xe4573d, seed: 0.71 }, { x: 28, z: 150, yaw: 0.1, col: 0x6bbf8e, seed: 0.13 });
}
