// Where everything stands (metres; x east, y up, z south: the camera looks north). An unnamed made-up harbour city on a
// sunny day. You stand in the paved plaza down the middle of a wide avenue; a fountain is just ahead of you on the right.
// The avenue runs 230 m north, between shops and offices, to the waterfront; past the quay the sea runs to the horizon,
// with a low far shore. Glass towers stand at the waterfront; the one on a pier straight down the avenue is the one that
// shatters. (It stands on a pier off the right of the square, where you can see all of it.)
import { rng, smooth } from './util.js';
import { CAM_Z } from './timeline.js';

export const PROM = 7, ROAD_X = 15, WALK = 6, FX = ROAD_X + WALK;     // plaza half-width, road edge, sidewalk, building fronts
export const CAM0 = { x: -1.2, z: CAM_Z };
export const EYE = 2.4;                                              // (you're up on a bench, phone held high)
export const ROW_END = -72;                                          // the avenue's buildings end here: a square opens onto the quay
export const QUAY = -120;                                            // the quay's edge: the sea beyond
// the avenue runs downhill to the harbour (flat round you, 24 m lower at the quay), so you see over the crowd to the sea
export const DROP = 22, SLOPE_A = -12, SLOPE_B = -106, RND = 0.08;
const ramp = (t) => (Math.sqrt(t * t + RND * RND) - Math.sqrt((t - 1) ** 2 + RND * RND) + 1) / 2;
export const groundY = (z) => -DROP * ramp((z - SLOPE_A) / (SLOPE_B - SLOPE_A));
export const groundGLSL = (z) => {
  const t = `((${z} - (${SLOPE_A.toFixed(1)})) / (${(SLOPE_B - SLOPE_A).toFixed(1)}))`;
  return `(${(-DROP).toFixed(1)} * ((sqrt(${t} * ${t} + ${(RND * RND).toFixed(5)}) - sqrt((${t} - 1.0) * (${t} - 1.0) + ${(RND * RND).toFixed(5)}) + 1.0) * 0.5))`;
};
export const SEA_Y = -DROP - 1.2;
export const FOUNT = { x: 3.7, z: -10.5, r: 3.0 };                    // the fountain's basin
export const LANES = [9.0, 13.0];

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone and concrete offices (punched windows), 1: glass tower, 2: older block (small windows, cornices),
// 3: far city (simple), 4: the tall towers at the waterfront
export const BLD = [];
export const HERO = { x: 42, z: -178, w: 30, h: 150, brk: 62 };        // the tower that shatters: on a pier, straight down the avenue
{
  const R = rng(2207);
  const pick = (a) => a[Math.floor(R() * a.length)];
  // warm, sunny colours: sandstone, brick, cream render, pale concrete, a few painted fronts
  const COLS = [0xd8c7a8, 0xc9a27e, 0xe6dccb, 0xb9886a, 0xd2b48c, 0xefe6d6, 0xa96f56, 0xcfc4b4, 0xe2c79a, 0xb7a58e, 0xd88f6a, 0x9fb3c2];
  const TOWER = [0x6f8fb0, 0x88a6c4, 0x5f7fa4, 0x9cb4cc, 0x7898b8];
  const addAt = (y, x, z, w, d, h, kind, col) => { BLD.push({ x, y, z, w, d, h, kind, col: col ?? pick(COLS) }); };
  const add = (x, z, w, d, h, kind, col) => { const y = groundY(z - d / 2) - 0.5; BLD.push({ x, y, z, w, d, h: h + 0.5, kind, col: col ?? pick(COLS) }); };
  for (const side of [-1, 1]) {
    let z = 70;
    while (z > ROW_END + 6) {
      const d = 13 + R() * 16, w = 22 + R() * 14, zc = z - d / 2;
      let h = 22 + R() * 26;
      if (zc > -40) h = 30 + R() * 22;
      add(side * (FX + w / 2), zc, w, d - 0.7, h, R() < 0.22 ? 1 : R() < 0.55 ? 2 : 0);
      z -= d;
    }
    // the waterfront: towers on the last block
    if (side < 0) {
      add(-80, QUAY + 22, 40, 34, 120, 4, pick(TOWER));
      add(-76, QUAY + 22, 26, 24, 140, 4, 0x6a88a8);
    }
  }
  // the hero tower (right, at the waterfront) and a lower podium beside it
  BLD.push({ x: HERO.x, y: SEA_Y, z: HERO.z, w: 70, d: 60, h: 7, kind: 0, col: 0xb7a58e });          // (the pier)
  BLD.push({ x: HERO.x, y: SEA_Y, z: HERO.z, w: HERO.w, d: HERO.w, h: HERO.h, kind: 4, col: 0x7d9cc0, hero: HERO.brk });
  BLD.push({ x: HERO.x, y: SEA_Y, z: HERO.z, w: 16, d: 16, h: HERO.h * 1.12, kind: 3, col: 0x5a6878, hero: HERO.brk });
  add(70, QUAY + 24, 34, 30, 96, 4, 0x88a6c4);
  // blocks behind the fronts, taller further back, so roofs and towers show over the avenue
  for (let i = 0; i < 260; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (64 + R() * 520), z = 70 - R() * (70 - ROW_END);
    const w = 22 + R() * 30, d = 22 + R() * 30;
    const far = Math.abs(x) > 160;
    add(x, z, w, d, (far ? 30 : 24) + R() * (far ? 70 : 40) + (R() < 0.12 ? 60 + R() * 90 : 0), R() < 0.3 ? 4 : 3, R() < 0.3 ? pick(TOWER) : undefined);
  }
  // the far shore across the bay: a low line of city
  for (let i = 0; i < 260; i++) {
    const z = -2600 - R() * 500, x = (R() - 0.5) * 5200;
    addAt(SEA_Y, x, z, 40 + R() * 60, 40 + R() * 60, 15 + R() * 40 + (R() < 0.1 ? 60 + R() * 80 : 0), 3);
  }
}

// ---- big screens on the buildings near you (facing the avenue) ----
export const SCREENS = [
  { x: -FX + 0.3, y: 16 + groundY(-38), z: -38, w: 14, h: 8, yaw: Math.PI / 2, seed: 3 },
  { x: FX - 0.3, y: 19 + groundY(-58), z: -58, w: 16, h: 9, yaw: -Math.PI / 2, seed: 7 },
];

// ---- shop signs over the shop fronts on both sides ----
export const SIGNS = [];
{
  const R = rng(31);
  for (const side of [-1, 1]) for (let z = 60; z > ROW_END + 8; z -= 8 + R() * 8) {
    if (R() < 0.18) continue;
    SIGNS.push({ x: side * (FX - 0.06), y: 4.4 + groundY(z), z, w: 5 + R() * 4, h: 1.3, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8) });
  }
}

// ---- lamps along the road edges, trees and benches in the plaza, awnings over the shops ----
export const LAMPS = [], TREES = [], AWNINGS = [], BENCHES = [];
for (const side of [-1, 1]) for (let z = 46; z > QUAY + 6; z -= 30) LAMPS.push({ x: side * (ROAD_X + 0.9), z });
{
  const R = rng(43);
  for (const side of [-1, 1]) for (let z = 30; z > QUAY + 10; z -= 14 + R() * 4) {
    if (Math.abs(z - CAM0.z) < 6 || Math.hypot(side * (PROM - 1.1) - FOUNT.x, z - FOUNT.z) < FOUNT.r + 2.5) continue;
    TREES.push({ x: side * (PROM - 1.1), z, h: 5.5 + R() * 2.5, r: 2.0 + R() * 0.8, seed: R() });
  }
  const AW = [0xd8452a, 0xf0c040, 0x2a8a7a, 0xf4efe4, 0x3a5aa8, 0xc23a7a, 0x2f6a3a];
  for (const side of [-1, 1]) for (let z = 58; z > ROW_END + 8; z -= 7 + R() * 6) {
    if (R() < 0.35) continue;
    AWNINGS.push({ x: side * (FX - 1.0), z, w: 4 + R() * 2.5, col: AW[Math.floor(R() * AW.length)] });
  }
  for (const z of [-26, -44, 20]) for (const side of [-1, 1]) BENCHES.push({ x: side * (PROM - 2.4), z: z + R() * 2 });
}
