// Where everything stands (metres; x east of the avenue's line, y up, z toward you: the camera looks down the avenue, -z,
// which is due south, toward the crater 592 miles away). Canal Street, New Orleans, at the river: you stand on the wide
// "neutral ground" down the middle (palms, the streetcar tracks), in the crowd. The street runs down to the levee and the
// Mississippi (~600 m wide here); across it the low city of Algiers, then flat land to the horizon.
// (The street falls 22 m to the water here so that you can see over the crowd: New Orleans is really flat; CAPTIONS.md.)
import { rng, smooth } from './util.js';
import { CAM_Z } from './timeline.js';

export const PROM = 7, ROAD_X = 15, WALK = 6, FX = ROAD_X + WALK;     // plaza half-width, road edge, sidewalk, building fronts
export const CAM0 = { x: -1.2, z: CAM_Z };
export const EYE = 2.05;                                             // (phone held up over the crowd)
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
export const FOUNT = { x: 999, z: 999, r: 0 };                        // (no fountain here)
export const SIGN = { x: 999, z: 999, h: 0, w: 0, ph: 0 };
export const FAR_BANK = -720;                                          // the river's far side
export const TRACK_X = [-1.9, 1.9];                                    // the streetcar tracks down the neutral ground
export const STREETCAR = { x: 1.9, z: -47, len: 14.6 };                // the red streetcar, stopped on the right track
export const LANES = [9.0, 13.0];

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone and concrete offices (punched windows), 1: glass tower, 2: older block (small windows, cornices),
// 3: far city (simple), 4: the tall towers at the waterfront
export const BLD = [], FARB = [];
export const HERO = { x: 9999, z: -9999, w: 30, h: 1, brk: 1 };     // (none)
{
  const R = rng(2207);
  const pick = (a) => a[Math.floor(R() * a.length)];
  // warm, sunny colours: sandstone, brick, cream render, pale concrete, a few painted fronts
  const COLS = [0xe8b4a8, 0xf0d890, 0xa8d0b8, 0xc9a27e, 0xe6dccb, 0xb9886a, 0xc8b0d8, 0xefe6d6, 0xa96f56, 0x9fc4d8, 0xe2c79a, 0xd88f6a];
  const TOWER = [0x6f8fb0, 0x88a6c4, 0x5f7fa4, 0x9cb4cc, 0x7898b8];
  const FARC = [0xc9b8a0, 0xd8cbb8, 0xa89880, 0xb8a890, 0xe0d4c0, 0x9a8a78, 0xc0a890];
  const addAt = (y, x, z, w, d, h, kind, col) => { BLD.push({ x, y, z, w, d, h, kind, col: col ?? pick(COLS) }); };
  const add = (x, z, w, d, h, kind, col) => { const y = groundY(z - d / 2) - 0.5; BLD.push({ x, y, z, w, d, h: h + 0.5, kind, col: col ?? pick(COLS) }); };
  for (const side of [-1, 1]) {
    let z = 290;
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
  add(70, QUAY + 24, 34, 30, 76, 4, 0x88a6c4);
  // blocks behind the fronts, taller further back, so roofs and towers show over the avenue
  for (let i = 0; i < 520; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (64 + R() * 520), z = 290 - R() * (290 - ROW_END);
    const w = 22 + R() * 30, d = 22 + R() * 30;
    const far = Math.abs(x) > 160;
    add(x, z, w, d, (far ? 30 : 24) + R() * (far ? 70 : 40) + (R() < 0.12 ? 60 + R() * 90 : 0), R() < 0.3 ? 4 : 3, R() < 0.3 ? pick(TOWER) : undefined);
  }
  // across the river: Algiers, low houses and warehouses along the far bank, a few bigger blocks; flat land behind
  for (let i = 0; i < 520; i++) {
    const z = FAR_BANK - 40 - Math.pow(R(), 0.9) * 2600, x = (R() - 0.5) * (1400 + (FAR_BANK - z) * 1.1);
    const h = 7 + R() * 14 + (R() < 0.08 ? 20 + R() * 30 : 0);
    FARB.push(BLD.length);
    addAt(SEA_Y + 2.5, x, z, 18 + R() * 30, 18 + R() * 30, h, 3, pick(FARC));
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
  for (const side of [-1, 1]) for (let z = 270; z > ROW_END + 8; z -= 8 + R() * 8) {
    if (R() < 0.18) continue;
    SIGNS.push({ x: side * (FX - 0.06), y: 4.4 + groundY(z), z, w: 5 + R() * 4, h: 1.3, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8) });
  }
}

// ---- lamps along the road edges, trees and benches in the plaza, awnings over the shops ----
export const LAMPS = [], TREES = [], AWNINGS = [], BENCHES = [];
for (const side of [-1, 1]) for (let z = 256; z > QUAY + 6; z -= 30) LAMPS.push({ x: side * (ROAD_X + 0.9), z });
{
  const R = rng(43);
  for (const side of [-1, 1]) for (let z = 200; z > QUAY + 10; z -= 14 + R() * 4) {
    if (z > CAM0.z - 16 || Math.hypot(side * (PROM - 1.1) - FOUNT.x, z - FOUNT.z) < FOUNT.r + 2.5 || Math.hypot(side * (PROM - 1.1) - SIGN.x, z - SIGN.z) < 3) continue;
    TREES.push({ x: side * (PROM - 1.1), z, h: 5.5 + R() * 2.5, r: 2.0 + R() * 0.8, seed: R() });
  }
  const AW = [0xd8452a, 0xf0c040, 0x2a8a7a, 0xf4efe4, 0x3a5aa8, 0xc23a7a, 0x2f6a3a];
  for (const side of [-1, 1]) for (let z = 270; z > ROW_END + 8; z -= 7 + R() * 6) {
    if (R() < 0.35) continue;
    AWNINGS.push({ x: side * (FX - 1.0), z, w: 4 + R() * 2.5, col: AW[Math.floor(R() * AW.length)] });
  }
  for (const z of [-26, -44, 20]) for (const side of [-1, 1]) BENCHES.push({ x: side * (PROM - 2.4), z: z + R() * 2 });
}
