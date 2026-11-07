// Where everything is. A made-up beach facing south, at noon (world: +y up, -z out to sea, +x along the beach to the
// right as you face the sea). The waterline runs straight along x at z = Z_W; the sand rises from it to a 2.4 m berm and
// a promenade (a low wall, palms, lamps), the coast road and a row of hotels behind you. Out at sea on the left a pier
// with a Ferris wheel; across the bay on the right, 3-5 km off, the far shore with a city on it.
import { rng, clamp } from './util.js';

export const DEG = Math.PI / 180;
export const Z_W = -9;                       // the waterline (mean)
export const EYE = 1.68;
export const PROM = { z0: 58, z1: 66, y: 2.9, wall: 0.7 };
export const ROAD = { z0: 68, z1: 82, y: 2.85 };
export const HOTEL_Z = 90;

// the beach, and the sea floor out from it
export function sandY(z) {
  const d = z - Z_W;
  if (d >= 0) return Math.min(2.4 * (1 - Math.exp(-d / 25)) + 0.004 * Math.max(0, d - 40), PROM.y - 0.1);
  const o = -d;
  return o < 60 ? -o * 0.035 : -2.1 - (o - 60) * 0.013 - Math.max(0, o - 600) * 0.01;
}
export function groundY(x, z) {
  if (z >= PROM.z0) return z < ROAD.z0 ? PROM.y : ROAD.y;
  return sandY(z);
}

// the camera: frame 0 among the crowd; by 0:06 you've walked down near the water
export const CAM_A = { x: 0.6, z: 17 };
export const CAM_B = { x: 0.0, z: 2.5 };

// the sky (az: degrees right of straight out to sea, -z)
export const dirAzEl = (az, el) => ({ x: Math.sin(az * DEG) * Math.cos(el * DEG), y: Math.sin(el * DEG), z: -Math.cos(az * DEG) * Math.cos(el * DEG) });
export const SUN_AE = { az: 7, el: 35 };
export const SUN_DIR = dirAzEl(SUN_AE.az, SUN_AE.el);

// the pier: out from the promenade on the left; the Ferris wheel near its end, facing the beach
export const PIER = { x: -44, w: 9, z0: 52, z1: -330, y: 6.4 };
export const WHEEL = { x: -44, z: -292, r: 23, y: PIER.y + 26 };

// the far shore across the bay: its waterline (x, z), land to the right of it
export const FAR = [[1500, -15000], [200, -5200], [700, -4800], [1500, -4100], [2300, -3200], [2900, -2100], [3300, -800], [3500, 600]];
export const FAR_Y = 3;

// ---- things on the beach ----
export const UMBRELLAS = [], TOWELS = [], CHAIRS = [], PALMS = [], LAMPS = [], HOTELS = [], CITY = [], BOARDS = [];
// a few palms on the sand just behind where you stand
export const NEAR_PALMS = [{ x: -3.6, z: 12.6, h: 8.5 }, { x: 3.2, z: 14.2, h: 10 }, { x: -7.4, z: 16.4, h: 11 }, { x: 6.8, z: 18.2, h: 9.2 }];
export const TOWER = { x: 9.5, z: -1.5 };                         // the lifeguard tower
export const FIRE = { x: -4.6, z: -2.2 };                         // the bonfire (from 0:21)
export const FAR_FIRES = [[-38, 6], [31, 10], [74, 2], [-88, 14], [140, 8], [-150, 4], [210, 12]];
const UCOL = [0xe8483a, 0xf3c52f, 0x2f8fd8, 0x29a36a, 0xff7f2a, 0xf2f2f2, 0x1f4fa8, 0xd93c8c, 0x16b3b0];
const TCOL = [0xffffff, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x7a4fd0, 0xff8a3d];
// keep clear: your path down the beach and the spot where you stand, the tower, the fire, the pier
export function clearOf(x, z, r = 0) {
  if (Math.abs(x - lerpX(z)) < 2.2 + r && z > Z_W - 1 && z < CAM_A.z + 4) return false;
  for (const p of NEAR_PALMS) if (Math.hypot(x - p.x, z - p.z) < 1.4 + r) return false;
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 3.5 + r) return false;
  if (Math.hypot(x - FIRE.x, z - FIRE.z) < 3.2 + r) return false;
  if (Math.abs(x - PIER.x) < PIER.w / 2 + 2 + r) return false;
  return true;
}
const lerpX = (z) => CAM_B.x + (CAM_A.x - CAM_B.x) * clamp((z - CAM_B.z) / (CAM_A.z - CAM_B.z));
{
  const R = rng(4711);
  // umbrellas in loose rows parallel to the water (a packed summer beach), thinning out far along it
  for (let z = Z_W + 6.5; z < 54; z += 4.6) {
    for (let x = -230; x < 230; x += 3.9) {
      const ux = x + (R() - 0.5) * 1.6, uz = z + (R() - 0.5) * 1.4;
      if (R() > 0.9 - 0.5 * Math.min(1, Math.abs(ux) / 200)) continue;
      if (!clearOf(ux, uz, 0.4)) continue;
      UMBRELLAS.push({ x: ux, z: uz, col: UCOL[Math.floor(R() * UCOL.length)], col2: R() < 0.5 ? 0xffffff : UCOL[Math.floor(R() * UCOL.length)], h: 2.15 + R() * 0.3, tilt: (R() - 0.5) * 0.3, yaw: R() * 6.28, seed: R() });
    }
  }
  for (const u of UMBRELLAS) {
    const n = R() < 0.6 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const a = (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 1.2, r = 1.2 + R() * 0.5;
      const x = u.x + Math.cos(a) * r, z = u.z + Math.sin(a) * r;
      if (!clearOf(x, z, 0.2)) continue;
      if (R() < 0.75) TOWELS.push({ x, z, yaw: R() * 3.14, col: TCOL[Math.floor(R() * TCOL.length)], seed: R() });
      else CHAIRS.push({ x, z, yaw: Math.PI + (R() - 0.5) * 0.8, col: TCOL[Math.floor(R() * TCOL.length)], seed: R() });
    }
  }
  // a few towels with no umbrella, close to the water
  for (let k = 0; k < 400 && TOWELS.length < 330; k++) {
    const x = (R() - 0.5) * 200, z = Z_W + 4 + R() * 12;
    if (!clearOf(x, z, 0.8) || TOWELS.some((t) => Math.hypot(t.x - x, t.z - z) < 2.4) || UMBRELLAS.some((u) => Math.hypot(u.x - x, u.z - z) < 2.2)) continue;
    TOWELS.push({ x, z, yaw: R() * 3.14, col: TCOL[Math.floor(R() * TCOL.length)], seed: R() });
  }
  // surfboards stuck upright in the sand
  for (const [x, z] of [[6.5, 6], [-9, 9], [16, 4], [-21, 2]]) BOARDS.push({ x, z, yaw: R() * 3, col: TCOL[Math.floor(R() * TCOL.length)] });
  // palms along the promenade, lamps between them
  for (let x = -330; x <= 330; x += 12) {
    if (Math.abs(x - PIER.x) < 8) continue;
    PALMS.push({ x: x + (R() - 0.5) * 2, z: 62 + (R() - 0.5), h: 9 + R() * 4, lean: (R() - 0.5) * 0.25, yaw: R() * 6.28, seed: R() });
  }
  for (const p of NEAR_PALMS) PALMS.push({ x: p.x, z: p.z, h: p.h, lean: (R() - 0.5) * 0.3, yaw: R() * 6.28, seed: R(), y: sandY(p.z) - 0.1 });
  for (let x = -336; x <= 336; x += 24) LAMPS.push({ x, z: 59.2 });
  // the hotels behind the road
  let x = -460;
  while (x < 460) {
    const w = 22 + R() * 26, h = 24 + R() * 62 + (R() < 0.2 ? 30 : 0);
    HOTELS.push({ x: x + w / 2, z: HOTEL_Z + 12 + R() * 6, w, d: 22 + R() * 10, h, col: [0xf1ece2, 0xe9e0cf, 0xf4f1ea, 0xd9cbb3, 0xcfd6d8, 0xe9c9b0, 0xbfc9c3, 0xf2e4c4][Math.floor(R() * 8)], seed: R() });
    x += w + 2 + R() * 6;
  }
  // the far city: blocks along the far shore, taller toward the middle
  for (let k = 0; k < 420; k++) {
    const i = 1 + Math.floor(R() * (FAR.length - 2)), u = R();
    const [ax, az] = FAR[i], [bx, bz] = FAR[i + 1];
    const sx = ax + (bx - ax) * u, sz = az + (bz - az) * u;
    // inland: perpendicular to the shore, away from the bay
    const tx = bx - ax, tz = bz - az, L = Math.hypot(tx, tz), nx = tz / L, nz = -tx / L;
    const inl = 60 + Math.pow(R(), 0.7) * 900;
    const mid = Math.exp(-Math.pow((i + u - 3.2) / 1.6, 2));
    CITY.push({ x: sx + nx * inl, z: sz + nz * inl, w: 30 + R() * 50, d: 30 + R() * 50, h: 20 + R() * 60 + mid * R() * 170 * (1 - inl / 1200), seed: R() });
  }
}

// cars on the coast road: lanes (z) and direction (+1 = +x)
export const LANES = [{ z: 70.5, dir: -1 }, { z: 73.8, dir: -1 }, { z: 76.4, dir: 1 }, { z: 79.6, dir: 1 }];
