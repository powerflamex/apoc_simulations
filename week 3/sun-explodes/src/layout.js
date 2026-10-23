// Where everything is. Copacabana is a 4 km crescent of sand with the sea on its inside (concave) edge. We build it on a
// circle: the waterline is a circle of radius RC around C (out in the bay); "phi" runs along the beach (0 at the camera,
// growing toward the far end, Leme, with the Sugarloaf behind it) and "d" is the distance inland from today's waterline:
//   d < 0 the bay | 0-86 sand | 86-88 the low wall | 88-106 the promenade (the black-and-white wave mosaic),
//   palms and kiosks at its sea edge | 106-108 the bike lane | 108-133 Avenida Atlântica (3 + 3 lanes, a median) |
//   133-139 the sidewalk | 139+ the apartment towers, a second row behind, then the city up to the forested hills.
// World: +y up; the camera starts at phi = 0, d = 97, looking along the beach (-z) and a little to the right.
import { rng, lerp, clamp, smooth } from './util.js';
import { depthAt } from './timeline.js';

export const RC = 4000;                    // the waterline's radius
export const CX = RC + 97;                 // C = (CX, 0, 0): so the camera (d = 97, phi = 0) is at x = z = 0
export const PHI0 = -0.07, PHI1 = 0.95;    // the beach runs from just behind you to Leme (3.8 km)
export const D = { sand: 0, wall: 86, prom: 88, bike: 106, ave: 108, median: [119.8, 121.2], walk: 133, bld: 139 };
export const Y = { prom: 2.9, ave: 2.75, walk: 2.9 };

// (phi, d) -> world x, z
export function arcXZ(phi, d, out = {}) {
  const r = RC + d;
  out.x = CX - r * Math.cos(phi);
  out.z = -r * Math.sin(phi);
  return out;
}
// world x, z -> (phi, d)
export function toArc(x, z, out = {}) {
  const dx = CX - x, dz = -z;
  out.phi = Math.atan2(dz, dx);
  out.d = Math.hypot(dx, dz) - RC;
  return out;
}
// the beach-facing direction (toward the sea) at phi, and the direction along the beach (phi growing)
export const seaward = (phi) => ({ x: Math.cos(phi), z: Math.sin(phi) });
export const along = (phi) => ({ x: Math.sin(phi), z: -Math.cos(phi) });
// yaw (rotation about +y) that points an object's local -z along the beach, +x inland... (three: local -z = forward)
// an object rotated by yawAlong(phi) has its local -z along the beach (phi growing) and local -x toward the sea
export const yawAlong = (phi) => phi;

// ---- ground height ----
// the beach rises from the waterline in a steep face (the surf zone) to a 2.5 m berm, flat to the wall
export function sandY(d) {
  if (d <= 0) return -depthAt(-d);
  if (d < 45) return 2.5 * Math.pow(d / 45, 0.85) * (1 - 0.12 * (1 - d / 45));
  return 2.5 + 0.1 * smooth(45, 86, d);
}
export function landY(d) {
  if (d < D.wall) return sandY(d);
  if (d < D.ave) return Y.prom;
  if (d < D.walk) return Y.ave;
  if (d < 300) return Y.walk;
  return Y.walk + hills(d);
}
// the hills behind the city: forested granite ridges, 120-330 m high, 0.5-1.5 km inland
const RH = rng(77);
const RIDGE = Array.from({ length: 9 }, () => ({ a: 0.3 + RH() * 0.6, w: 0.035 + RH() * 0.06, h: 120 + RH() * 210, dd: 650 + RH() * 700 }));
export function hills(d, phi = 0.4) {
  let h = 0;
  for (const r of RIDGE) h = Math.max(h, r.h * Math.exp(-Math.pow((phi - r.a) / r.w, 2) * 0.5) * smooth(r.dd - 520, r.dd, d) * (1 - 0.3 * smooth(r.dd + 300, r.dd + 900, d)));
  return h * smooth(300, 520, d);
}
// ground anywhere (world x, z); outside the beach's ends it is the bay floor
const tmpA = {};
export function groundY(x, z) {
  toArc(x, z, tmpA);
  const { phi, d } = tmpA;
  if (d < 0 || phi < PHI0 - 0.02 || phi > PHI1 + 0.04) {
    // the bay floor: distance out from the shore (past the ends, from the nearest end)
    let dOut = -d;
    if (phi < PHI0 || phi > PHI1) {
      const e = arcXZ(phi < PHI0 ? PHI0 : PHI1, 0, {});
      dOut = Math.max(dOut, Math.hypot(x - e.x, z - e.z));
    }
    return -depthAt(Math.max(dOut, 0.01));
  }
  if (d < 300) return landY(d);
  return Y.walk + hills(d, phi);
}

// ---- the camera's start ----
export const CAM = { phi: 0.0017, d: 88.6, h: 4.0 };

// ---- the Sun's path over the 4 hours (from just after 7:40 a.m.): low over the far end of the beach, climbing and
// moving left (north) ----
export const SUN_PATH = { az0: 44, el0: 16, az1: 12, el1: 64 };   // az: degrees right of straight down the beach (-z)

// ---- the towers along the avenue: [phi0, phi1, depth, height, colour, style, row] ----
export const TOWERS = [];
{
  const R = rng(4242);
  const PAL = [0xf1ece2, 0xe9e0cf, 0xf4f1ea, 0xd9cbb3, 0xe8d6b8, 0xcfd6d8, 0xe9c9b0, 0xbfc9c3, 0xf2e4c4, 0xd6d0c6, 0xc9b79c, 0xe6e2da];
  for (const row of [0, 1]) {
    let phi = PHI0 - 0.01;
    while (phi < PHI1 + 0.005) {
      const r = RC + D.bld + (row ? 34 : 0);
      const w = (row ? 22 : 16) + R() * 18;
      const dphi = w / r;
      const gap = (R() < 0.25 ? 1.5 + R() * 5 : 0.4) / r;
      const near = 1 - smooth(0, 0.5, phi);
      let h = row ? 42 + R() * 38 : 30 + R() * 18 + (R() < 0.15 ? 14 : 0);
      if (!row && phi < 0.06) h = 30 + R() * 10;
      TOWERS.push({ phi0: phi, phi1: phi + dphi, d0: D.bld + (row ? 34 : 0) + (row ? R() * 4 : R() * 1.2), dep: row ? 26 : 22 + R() * 8, h, col: PAL[Math.floor(R() * PAL.length)], style: Math.floor(R() * 4), row, seed: R(), near });
      phi += dphi + gap;
    }
  }
  // further back: blocks of the city filling up to the hills
  for (let k = 0; k < 220; k++) {
    const phi = PHI0 + R() * (PHI1 - PHI0 + 0.02), d0 = 205 + Math.pow(R(), 1.2) * 330;
    const w = 18 + R() * 22, r = RC + d0;
    TOWERS.push({ phi0: phi, phi1: phi + w / r, d0, dep: 18 + R() * 14, h: 25 + R() * 45, col: PAL[Math.floor(R() * PAL.length)], style: Math.floor(R() * 4), row: 2, seed: R(), near: 0 });
  }
}

// ---- things on the beach and the promenade ----
export const PALMS = [], KIOSKS = [], LAMPS = [], UMBRELLAS = [], TOWELS = [], NETS = [], CHAIRS = [];
{
  const R = rng(9001);
  // palms: a line along the promenade's sea edge every ~14 m, a second, patchy line by the bike lane
  for (let phi = PHI0; phi < PHI1; phi += 14 / (RC + 90)) {
    const near = phi < 0.08;
    PALMS.push({ phi: phi + (R() - 0.5) * 0.0008, d: 90.5 + R() * 0.8, h: 9 + R() * 5, lean: (R() - 0.5) * 0.25, seed: R() });
    if (R() < 0.45 || near) PALMS.push({ phi: phi + 7 / (RC + 104), d: 104.6, h: 8 + R() * 4, lean: (R() - 0.5) * 0.2, seed: R() });
  }
  // kiosks: every ~250 m on the promenade (one just ahead of you)
  for (let phi = 0.032; phi < PHI1; phi += 250 / (RC + 95)) KIOSKS.push({ phi, d: 93.5, seed: R() });
  // tall street lamps on the median and the sidewalk
  for (let phi = PHI0; phi < PHI1; phi += 32 / (RC + 120)) { LAMPS.push({ phi, d: 120.5, two: true }); LAMPS.push({ phi: phi + 16 / (RC + 120), d: 107.2, two: false }); }
  // umbrellas: thick in front of you (down the beach to the right), thinning out along the beach
  for (let k = 0; k < 1200 && UMBRELLAS.length < 70; k++) {
    const phi = 0.001 + R() * 0.024, d = 16 + R() * 64;
    if (UMBRELLAS.some((u) => Math.abs((u.phi - phi) * (RC + d)) < 3.4 && Math.abs(u.d - d) < 3.4)) continue;
    UMBRELLAS.push({ phi, d, seed: R(), col: [0xe8483a, 0xf3c52f, 0x2f8fd8, 0x29a36a, 0xff7f2a, 0xf2f2f2, 0x1f4fa8, 0xd93c8c][Math.floor(R() * 8)], h: 2.2 + R() * 0.25, tilt: (R() - 0.5) * 0.3 });
  }
  for (let k = 0; k < 2600 && UMBRELLAS.length < 380; k++) {
    const phi = PHI0 + 0.02 + Math.pow(R(), 1.6) * 0.6;
    const d = 18 + R() * 58;
    const near = Math.exp(-phi / 0.06);
    if (R() > 0.25 + 0.75 * near && phi > 0.03) continue;
    if (UMBRELLAS.some((u) => Math.abs((u.phi - phi) * (RC + d)) < 3.2 && Math.abs(u.d - d) < 3.2)) continue;
    UMBRELLAS.push({ phi, d, seed: R(), col: [0xe8483a, 0xf3c52f, 0x2f8fd8, 0x29a36a, 0xff7f2a, 0xf2f2f2, 0x1f4fa8, 0xd93c8c][Math.floor(R() * 8)], h: 2.2 + R() * 0.25, tilt: (R() - 0.5) * 0.3 });
  }
  for (const u of UMBRELLAS) {
    if (R() < 0.8) TOWELS.push({ phi: u.phi + (R() - 0.5) * 2.4 / (RC + u.d), d: u.d + (R() < 0.5 ? -1 : 1) * (1.3 + R()), yaw: R() * 3.14, col: [0xffffff, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4][Math.floor(R() * 6)], seed: R() });
    if (R() < 0.6) CHAIRS.push({ phi: u.phi + (R() - 0.5) * 2 / (RC + u.d), d: u.d + (R() - 0.5) * 2, yaw: Math.PI + (R() - 0.5) * 0.8, seed: R() });
  }
  NETS.push({ phi: 0.0125, d: 66, seed: 1 }, { phi: 0.031, d: 70, seed: 2 }, { phi: 0.052, d: 62, seed: 3 });
}

// ---- cars on the avenue: the lane centres (d) and direction (+1 toward Leme / phi growing) ----
export const LANES = [
  { d: 110.0, dir: -1 }, { d: 113.2, dir: -1 }, { d: 116.4, dir: -1 },
  { d: 124.0, dir: 1 }, { d: 127.2, dir: 1 }, { d: 130.4, dir: 1 },
];

// the Sugarloaf, the Urca hill, Leme hill, the Cagarras islands: [x, z, radius, height, squash] (world, m)
export const PEAKS = (() => {
  const end = arcXZ(PHI1, 40);
  const o = seaward(PHI1), a = along(PHI1);
  const P = (alongM, outM, rad, h, sq = 1, kind = 0) => ({ x: end.x + a.x * alongM + o.x * outM, z: end.z + a.z * alongM + o.z * outM, rad, h, sq, kind });
  return [
    P(150, -60, 330, 190, 1.0, 1),        // Leme hill (Morro do Leme), green and rocky, closing the beach
    P(1450, -420, 260, 396, 1.35, 2),     // the Sugarloaf: a tall granite dome
    P(1050, -720, 330, 220, 0.9, 2),      // Urca hill beside it
    P(350, 4300, 380, 80, 0.8, 3),        // the Cagarras islands, out in the open sea
    P(-450, 5000, 220, 55, 0.8, 3),
    P(900, 3800, 160, 40, 0.8, 3),
  ];
})();
