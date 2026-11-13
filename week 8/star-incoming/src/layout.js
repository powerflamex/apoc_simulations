// Where everything is. Santa Monica: a straight, wide beach facing the Pacific, the pier and its Ferris wheel just to
// the north. World: +x inland (east), -x out to sea (west), +z south, -z north (toward the pier), +y up.
// "d" is the distance inland from today's waterline (= x):
//   d < 0 the sea | 0-165 sand | 165-169 the bike path | 169-178 the walk, palms | 178-186 a grass strip, palms |
//   186-210 the coast road (2 + 2 lanes, a median) | 210-216 the sidewalk | 218+ hotels and apartments, the city behind.
//   North of the pier (z < -150) the road runs under a 30 m bluff (the Palisades) with the city on top.
// Bearings: degrees right of due west (toward the north). A camera with bearing b looks along (-cos b, 0, -sin b).
import { rng, lerp, clamp, smooth } from './util.js';

export const D = { sand: 0, bike: 165, walk: 169, grass: 178, road: 186, median: [197.2, 198.8], side: 210, bld: 218 };
export const Y = { walk: 3.0, road: 3.2 };
export const PIER = { z: -110, x0: 236, x1: -330, deck: 9.2, w: 18, park: [-215, -55], parkW: 52 };
export const WHEEL = { x: -150, z: -88, r: 13.5, hub: 9.2 + 15.5 };
export const dirOf = (b) => ({ x: -Math.cos(b * Math.PI / 180), z: -Math.sin(b * Math.PI / 180) });

// ---- the sea floor: steep in the surf (1 in 15), then the gentle shelf of Santa Monica Bay ----
export const SHELF = [[0, 0], [60, 4], [400, 12], [3000, 30], [20000, 60], [100000, 400]];
export function depthAt(o) {                // depth (m) at o metres out from the waterline
  if (o <= 0) return 0;
  for (let i = 0; i < SHELF.length - 1; i++) {
    const [a, ha] = SHELF[i], [b, hb] = SHELF[i + 1];
    if (o <= b) return lerp(ha, hb, (o - a) / (b - a));
  }
  return 400 + (o - 100000) * 0.004;
}
// the sand rises from the water to a berm (2.2 m at 50 m), then gently to the bike path
export function sandY(d) {
  if (d <= 0) return -depthAt(-d);
  if (d < 50) return 2.2 * Math.pow(d / 50, 0.9);
  return 2.2 + 0.8 * smooth(50, 165, d);
}
// the bluff north of the pier and the gentle rise of the city
const bluffK = (z) => smooth(-150, -230, z);
export function landY(d, z = 0) {
  if (d < D.bike) return sandY(d);
  if (d < D.road) return Y.walk;
  if (d < D.side) return Y.road;
  const b = bluffK(z);
  const city = Y.walk + 0.012 * Math.max(0, d - 216);
  return lerp(city, Y.walk + 30 * smooth(214, 236, d) + 0.01 * Math.max(0, d - 240), b);
}
// the mountains: the Santa Monica Mountains far to the north, Palos Verdes across the bay to the south
// [x, z, radius, height]
export const PEAKS = [
  [-1500, -9000, 3200, 520], [1800, -11000, 4200, 760], [-5200, -12500, 3500, 610], [-9800, -15500, 4300, 820],
  [5200, -13500, 5000, 900], [-14500, -18000, 4800, 700], [-20000, -21500, 5200, 640], [9500, -15000, 6000, 1000],
  [-9000, 21000, 5200, 300], [-13500, 23000, 4600, 380], [-5500, 20500, 3600, 220],
];
// ground anywhere (world x, z)
export function groundY(x, z) {
  if (x < 0) return -depthAt(-x);
  if (x < 3000) return landY(x, z);
  return landY(3000, z);
}

// ---- the camera's start: on the sand in the crowd, a phone held at chest height, looking out to sea at the planet ----
export const CAM0 = { x: 22, z: 0, eye: 1.45, b: 9.5 };
export function camFront(r, l, c = CAM0) {     // r metres ahead of the opening camera, l to its right (world x, z)
  const a = c.b * Math.PI / 180;
  const fx = -Math.cos(a), fz = -Math.sin(a), rx = Math.sin(a), rz = -Math.cos(a);
  return { x: c.x + fx * r + rx * l, z: c.z + fz * r + rz * l };
}
// where the Moon sits tonight: over the sea (bearing, elevation in degrees); every planet takes its place
export const PLANET_POS = { b: 9.5, el: 13 };

// ---- the hotels and apartments: { x, z, w (along z), dep (along x), h, col, style, row } ----
export const TOWERS = [];
{
  const R = rng(4242);
  const PAL = [0xf1ece2, 0xe9e0cf, 0xf4f1ea, 0xd9cbb3, 0xe8d6b8, 0xcfd6d8, 0xe9c9b0, 0xbfc9c3, 0xf2e4c4, 0xd6d0c6, 0xc9b79c, 0xe6e2da, 0xf0d7c0, 0xd4dde3];
  for (const row of [0, 1]) {
    let z = -1100;
    while (z < 1100) {
      const w = (row ? 26 : 20) + R() * 20;
      const gap = R() < 0.3 ? 8 + R() * 10 : 3;
      if (Math.abs(z + w / 2 - PIER.z) < 22 && row === 0) { z += 30; continue; }    // the pier's entrance
      const blf = smooth(-150, -230, z + w / 2);
      const x0 = row ? 262 : D.bld + R() * 2 + blf * 22;
      let h = row ? 28 + R() * 40 : 14 + R() * 26 + (R() < 0.18 ? 22 : 0);
      if (Math.abs(z) < 200 && R() < 0.3) h += 20;
      TOWERS.push({ x: x0, z, w, dep: row ? 28 : 22 + R() * 8, h, col: PAL[Math.floor(R() * PAL.length)], style: Math.floor(R() * 4), row, seed: R() });
      z += w + gap;
    }
  }
  // further back: the city's blocks
  for (let k = 0; k < 260; k++) {
    const z = -1400 + R() * 2800, x0 = 310 + Math.pow(R(), 1.3) * 650;
    TOWERS.push({ x: x0, z, w: 18 + R() * 24, dep: 16 + R() * 16, h: 12 + R() * 34 + (R() < 0.08 ? 40 : 0), col: PAL[Math.floor(R() * PAL.length)], style: Math.floor(R() * 4), row: 2, seed: R() });
  }
}

// ---- things on the beach ----
export const PALMS = [], UMBRELLAS = [], TOWELS = [], CHAIRS = [], LIFEGUARD = [], LAMPS = [];
{
  const R = rng(9001);
  // tall, thin Mexican fan palms in lines along the walk and the grass strip; more on the bluff
  for (let z = -900; z < 900; z += 16 + R() * 6) {
    if (Math.abs(z - PIER.z) < 14) continue;
    PALMS.push({ x: 174 + (R() - 0.5), z, h: 16 + R() * 9, lean: (R() - 0.5) * 0.12, seed: R() });
    if (R() < 0.7) PALMS.push({ x: 182 + (R() - 0.5), z: z + 8, h: 18 + R() * 8, lean: (R() - 0.5) * 0.1, seed: R() });
  }
  for (let z = -1200; z < -170; z += 14 + R() * 8) PALMS.push({ x: 246 + R() * 4, z, h: 17 + R() * 8, lean: (R() - 0.5) * 0.1, seed: R(), y: Y.walk + 30 });
  // street lamps along the road
  for (let z = -900; z < 900; z += 34) LAMPS.push({ x: 198, z, two: true });
  // umbrellas and towels: thick in front of you, thinning out along the beach
  const COLS = [0xe8483a, 0xf3c52f, 0x2f8fd8, 0x29a36a, 0xff7f2a, 0xf2f2f2, 0x1f4fa8, 0xd93c8c];
  const free = (x, z, r) => !UMBRELLAS.some((u) => Math.hypot(u.x - x, u.z - z) < r);
  for (let k = 0; k < 3000 && UMBRELLAS.length < 150; k++) {
    const x = 14 + R() * 140, z = -380 + Math.pow(R(), 1) * 760;
    const near = Math.exp(-Math.hypot(x - CAM0.x, z) / 90);
    if (R() > 0.15 + 0.85 * near) continue;
    if (Math.abs(z - PIER.z) < 14) continue;            // (not under the pier)
    if (!free(x, z, 6)) continue;
    UMBRELLAS.push({ x, z, seed: R(), col: COLS[Math.floor(R() * 8)], h: 2.2 + R() * 0.25, tilt: (R() - 0.5) * 0.3 });
  }
  // a busy stretch between you and the pier (you see it when you look along the beach)
  for (let k = 0; k < 400 && UMBRELLAS.length < 175; k++) {
    const x = 10 + R() * 55, z = -96 + R() * 72;
    if (!free(x, z, 4.5) || Math.hypot(x - CAM0.x, z - CAM0.z) < 10) continue;
    UMBRELLAS.push({ x, z, seed: R(), col: COLS[Math.floor(R() * 8)], h: 2.2 + R() * 0.25, tilt: (R() - 0.5) * 0.3 });
  }
  // tonight most umbrellas are folded away: keep a few dozen along the beach, none near the line the camera moves on
  // (z = 0, from the water up to the walk) or in front of the planet
  for (let i = UMBRELLAS.length - 1; i >= 0; i--) {
    const u = UMBRELLAS[i];
    if ((Math.abs(u.z) < 9 && u.x < 70) || (u.x < 26 && u.z < 0 && u.z > -40)) UMBRELLAS.splice(i, 1);
  }
  const TC = [0xffffff, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0x16a085];
  for (const u of UMBRELLAS) {
    if (u.near) continue;
    if (R() < 0.85) TOWELS.push({ x: u.x + (R() < 0.5 ? -1 : 1) * (1.3 + R()), z: u.z + (R() - 0.5) * 2.4, yaw: R() * 3.14, col: TC[Math.floor(R() * TC.length)], seed: R() });
    if (R() < 0.5) CHAIRS.push({ x: u.x + (R() - 0.5) * 2, z: u.z + (R() - 0.5) * 2, yaw: -Math.PI / 2 + (R() - 0.5) * 0.8, seed: R() });
  }
  for (let k = 0; k < 140; k++) {
    const x = 18 + R() * 130, z = -300 + R() * 600;
    if (Math.abs(z - PIER.z) < 14) continue;
    if (Math.hypot(x - CAM0.x, z) < 8) continue;
    TOWELS.push({ x, z, yaw: R() * 3.14, col: TC[Math.floor(R() * TC.length)], seed: R() });
  }
  // towels laid out on the sand right around you
  if (false) [[3.4, -1.6, 0.3, 0xe94f37], [5.6, 1.9, 1.3, 0x3b8ed0], [7.5, -2.4, 2.2, 0xf6c445], [10, 1.6, 0.6, 0xffffff], [12.5, -2.2, 1.9, 0xff9ec4], [15, 2.6, 0.9, 0x6dbf73]].forEach(([r, l, yaw, col], k) => {
    const c = camFront(r, l);
    TOWELS.push({ x: c.x, z: c.z, yaw, col, seed: 0.1 + 0.15 * k, near: true });
  });
  // the lifeguard towers: small painted huts on stilts with a ramp
  LIFEGUARD.push({ x: 26, z: -16, yaw: 0.15, col: 0x3d8fd1 }, { x: 34, z: 140, yaw: -0.1, col: 0xf1b43a }, { x: 30, z: -330, yaw: 0.05, col: 0xe4573d }, { x: 32, z: 330, yaw: 0.1, col: 0x6bbf8e });
}

// ---- cars on the coast road: lane centres (d) and direction (+1 going south, +z) ----
export const LANES = [{ x: 189.2, dir: -1 }, { x: 193.6, dir: -1 }, { x: 202.4, dir: 1 }, { x: 206.8, dir: 1 }];
