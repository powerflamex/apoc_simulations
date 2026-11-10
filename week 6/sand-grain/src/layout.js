// Where everything stands (metres; x east, y up, z south). The sea lies east (+x), the city west (-x). You stand on the
// deck of a lifeguard tower on a wide beach and look north-north-east, along the sand, with the Sun behind you:
//   x > shore(z): the sea | 0 to -100 the sand | -100 to -116 the boardwalk, palms | -116 to -146 the coast road | then towers.
// North of the pier the shore bends away east round a bay, so a line of far towers stands on the water at the end of the view.
// The grains land on the wet sand at HIT, just this side of the pier.
import { rng, lerp, clamp, smooth } from './util.js';

export const DECK = 4.8;
export const CAM0 = { x: -60, z: 20, y: 2.1 + DECK + 1.55 };          // your eyes: on the sand (2.1 m up the beach), the deck, 1.55 m
export const HIT = { x: -9, z: -172 };                             // the spot: 200 m from you
export const PIER = { z: -222, x0: -92, x1: 470, deck: 8.5, w: 11 };
export const WHEEL = { x: -36, z: -236, r: 21, hub: 8.5 + 23 };
export const BEACH = { walk: -100, road: -116, front: -146 };

// the shoreline: straight here, curving east round the bay beyond the pier
export const shoreX = (z) => (z > -320 ? 0 : 0.00032 * (z + 320) * (z + 320));
// the sea floor: wet sand, then a long gentle shelf (so the water has a long way to go when it pulls back)
export const bedAt = (o) => (o <= 0 ? 0 : o < 40 ? -o * 0.09 : o < 520 ? -3.6 - (o - 40) * 0.024 : -15.1 - (o - 520) * 0.004);
// ground height: x, z in the world
export function groundY(x, z) {
  const o = x - shoreX(z);
  if (o > 0) return bedAt(o);
  const d = -o;
  if (d < 70) return 2.4 * Math.pow(d / 70, 0.85);
  return 2.4 + 0.8 * smooth(70, 100, d);
}
export const SHELF_GLSL = /* glsl */ `
  float shoreX(float z) { return z > -320.0 ? 0.0 : 0.00032 * (z + 320.0) * (z + 320.0); }
  float bedAt(float o) { return o <= 0.0 ? 0.0 : o < 40.0 ? -o * 0.09 : o < 520.0 ? -3.6 - (o - 40.0) * 0.024 : -15.1 - (o - 520.0) * 0.004; }
`;

// ---- the crater and the rolling ground: the same sums in JS (for what stands on the ground) and in the shaders ----
export function craterY(rr, Rc) {
  if (Rc <= 0) return 0;
  // (seen almost edge on from the tower, so the small ones are drawn deep with a high rim; the big rims stay low: you have to see over them)
  const u = rr / Rc, rim = Math.min(Rc * 0.32, 2.2 + Rc * 0.012), dep = Rc * (0.42 + 0.4 * Math.exp(-Rc / 14));
  if (u < 1) return -dep * (1 - u * u) + rim * u * u * u * u;                // the bowl, up to the rim
  return rim * Math.exp(-(u - 1) * 2.6);                                     // the thrown-out sand beyond it
}
export const CRATER_GLSL = /* glsl */ `
  float craterY(float rr, float Rc) {
    if (Rc <= 0.0) return 0.0;
    float u = rr / Rc, rim = min(Rc * 0.32, 2.2 + Rc * 0.012), dep = Rc * (0.42 + 0.4 * exp(-Rc / 14.0));
    if (u < 1.0) return -dep * (1.0 - u * u) + rim * u * u * u * u;
    return rim * exp(-(u - 1.0) * 2.6);
  }
`;
export const rollY = (rr, v, A) => A <= 0 ? 0 : A * Math.sin((rr - (v - 38) * 95) * 0.021) * Math.sin((rr - (v - 38) * 80) * 0.0047);
export const ROLL_GLSL = /* glsl */ `
  float rollY(float rr, float v, float A) { return A * sin((rr - (v - 38.0) * 95.0) * 0.021) * sin((rr - (v - 38.0) * 80.0) * 0.0047); }
`;

// ---- the towers: { x, z, w (along z), dep (along x), h, col, style, row }: a wall of white condos behind the road, tall ----
export const TOWERS = [];
{
  const R = rng(66);
  const PAL = [0xf4f1ea, 0xece6da, 0xf7f4ee, 0xd8dee3, 0xe4ded2, 0xcfdbe2, 0xf0e6d6, 0xdfe3e6, 0xe9e3dc];
  for (const row of [0, 1, 2]) {
    let z = -1000;
    while (z < 700) {
      const w = (row ? 34 : 28) + R() * 16, gap = 6 + R() * 16;
      const x0 = BEACH.front - row * 62 - (row ? R() * 12 : 0) - 28;
      const h = (row === 0 ? 48 : 78) + R() * (row === 0 ? 64 : 120) + (R() < 0.2 ? 50 : 0);
      TOWERS.push({ x: x0, z, w, dep: 26 + R() * 8, h, col: PAL[Math.floor(R() * PAL.length)], style: Math.floor(R() * 4), row, seed: R(), yaw: Math.PI / 2 });
      z += w + gap;
    }
  }
  // the far side of the bay
  for (let k = 0; k < 90; k++) {
    const z = -2100 - R() * 900, x = shoreX(z) * 0.72 - 900 + R() * 2200;
    TOWERS.push({ x, z, w: 34 + R() * 26, dep: 26 + R() * 12, h: 70 + R() * 150, col: PAL[Math.floor(R() * PAL.length)], style: Math.floor(R() * 4), row: 3, seed: R(), yaw: 0 });
  }
}

// the last stretch of sand between you and the spot stays clear, so you can see it land and see the hole
const SIGHT = { dx: (CAM0.x - HIT.x) / Math.hypot(CAM0.x - HIT.x, CAM0.z - HIT.z), dz: (CAM0.z - HIT.z) / Math.hypot(CAM0.x - HIT.x, CAM0.z - HIT.z) };
export function inSight(x, z) {
  const ax = x - HIT.x, az = z - HIT.z, al = ax * SIGHT.dx + az * SIGHT.dz, ac = Math.abs(ax * SIGHT.dz - az * SIGHT.dx);
  return al > -3 && al < 100 && ac < 3.5 + al * 0.045;
}

// ---- things on the beach: rows of hired umbrellas, each with two towels ----
export const PALMS = [], UMBRELLAS = [], TOWELS = [], BOATS = [], LAMPS = [];
{
  const R = rng(9100);
  for (let z = -640; z < 420; z += 13 + R() * 5) { if (Math.abs(z - PIER.z) > 11) PALMS.push({ x: -104.5 + R(), z, h: 12 + R() * 7, lean: (R() - 0.5) * 0.14, seed: R() }); LAMPS.push({ x: -113, z: z + 6 }); }
  const COLS = [0x1f6fd0, 0xf3f0e6, 0xe64a3a, 0xf6b71e, 0x18a58a];
  // the rows run along the beach; the colour changes from one beach club to the next
  for (let row = 0; row < 9; row++) {
    const x = -86 + row * 8.5;
    for (let z = -430; z < 150; z += 7.2) {
      const zz = z + (row % 2) * 3.6 + (R() - 0.5) * 0.5, xx = x + (R() - 0.5) * 0.6;
      if (Math.abs(zz - PIER.z) < 13) continue;
      if (Math.hypot(xx - CAM0.x, zz - CAM0.z) < 7 || Math.hypot(xx - HIT.x, zz - HIT.z) < 13 || inSight(xx, zz)) continue;
      if (R() < 0.08) continue;
      const club = Math.floor((zz + 800) / 34) + (row >> 1);
      UMBRELLAS.push({ x: xx, z: zz, col: COLS[club % COLS.length], seed: R(), h: 2.3, tilt: (R() - 0.5) * 0.08 });
      for (const s of [-1, 1]) if (R() < 0.86) TOWELS.push({ x: xx + s * (1.25 + R() * 0.35), z: zz + (R() - 0.5) * 0.8, yaw: (R() - 0.5) * 0.3 + Math.PI / 2, col: [0xffffff, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0x16a085][Math.floor(R() * 8)], seed: R() });
    }
  }
  // boats at anchor off the beach (the sea leaves them on the mud)
  for (let k = 0; k < 16; k++) BOATS.push({ x: 90 + R() * 420, z: -130 - R() * 520 + (k % 3) * 200, yaw: R() * 6.28, L: 8 + R() * 10, seed: R() });
}
export { lerp, clamp };
