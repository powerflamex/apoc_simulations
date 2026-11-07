// Where everything stands (metres; x east, y up, z south: the camera looks north). An unnamed made-up harbour city on a
// sunny day. A waterfront avenue: shops and offices on the west side, a wide promenade along the harbour on the east.
// You stand on the paved median in the middle, between two jammed lanes each way. A side street opens on the left just
// ahead of you (the Triceratops come out of it) and another behind you (where the second T. rex comes from). At the far
// end the avenue meets a cross street lined with low buildings, so the sky shows over them (the Brachiosaurus).
import { rng } from './util.js';

export const CAM0 = { x: 0, z: 8 };
export const EYE = 1.7;
export const MED = 5.0, CURB = 12.5, FXW = 17.0, QX = 24.0;      // median half-width, curbs, west fronts, quay edge (east)
export const LANES = [6.9, 10.6];                                 // lane centres (each side of the median)
export const SIDE1 = [-15, -3];                                   // the side street ahead on the left (z range)
export const SIDE2 = [22, 32];                                    // the one behind you on the left
export const END_Z = -112, END_Z2 = -130;                         // the cross street at the far end
export const SEA_Y = -0.6;
export const groundY = () => 0;

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone and concrete offices (punched windows), 1: glass, 2: older block (small windows, cornices), 3: far city, 4: towers
export const BLD = [];
{
  const R = rng(5101);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xd8c7a8, 0xc9a27e, 0xe6dccb, 0xb9886a, 0xd2b48c, 0xefe6d6, 0xa96f56, 0xcfc4b4, 0xe2c79a, 0xb7a58e, 0xd88f6a, 0x9fb3c2];
  const TOWER = [0x6f8fb0, 0x88a6c4, 0x5f7fa4, 0x9cb4cc, 0x7898b8];
  const add = (x, z, w, d, h, kind, col, y = -0.5) => BLD.push({ x, y, z, w, d, h: h + 0.5, kind, col: col ?? pick(COLS) });
  // the west fronts, block by block, with the two side streets left open
  for (const [za, zb] of [[80, SIDE2[1]], [SIDE2[0], SIDE1[1]], [SIDE1[0], END_Z]]) {
    let z = za;
    while (z > zb + 3) {
      const d = Math.min(12 + R() * 14, z - zb), w = 20 + R() * 14, zc = z - d / 2;
      const near = zc > -60;
      add(-FXW - w / 2, zc, w, d - 0.6, (near ? 26 : 18) + R() * (near ? 26 : 22), R() < 0.22 ? 1 : R() < 0.55 ? 2 : 0);
      z -= d;
    }
  }
  // the side streets' walls (so you see a street, not a hole), set back a little
  for (const [a, b] of [SIDE1, SIDE2]) {
    add(-FXW - 30 - 14, a - 9, 28, 16, 24 + R() * 14, 2);
    add(-FXW - 30 - 14, b + 9, 28, 16, 28 + R() * 14, 0);
    add(-FXW - 70, (a + b) / 2, 30, b - a + 30, 40 + R() * 30, 0);
  }
  // blocks behind the fronts, taller further back (only to the west: the sky stays open over the end of the avenue)
  for (let i = 0; i < 180; i++) {
    const x = -(66 + R() * 420), zz = 80 - R() * 200;
    const w = 22 + R() * 30, d = 22 + R() * 30;
    add(x, zz, w, d, 28 + R() * 50 + (R() < 0.15 ? 50 + R() * 90 : 0), R() < 0.3 ? 4 : 3, R() < 0.3 ? pick(TOWER) : undefined);
  }
  // the far end: a row of low old buildings across the avenue, so the sky shows above them
  for (let x = -150; x < QX - 4;) {
    const w = 10 + R() * 12;
    add(x + w / 2, END_Z2 - 9, w - 0.6, 18, 8 + R() * 5, 2);
    x += w;
  }
  // behind you, the city goes on (seen when you turn round)
  for (let x = -60; x < QX - 4;) { const w = 14 + R() * 14; add(x + w / 2, 110, w - 0.6, 20, 20 + R() * 30, R() < 0.5 ? 0 : 2); x += w; }
  // across the harbour: a skyline on the far shore
  for (let i = 0; i < 220; i++) {
    const x = 620 + R() * 500, zz = -900 + R() * 1500;
    add(x, zz, 30 + R() * 50, 30 + R() * 50, 18 + R() * 50 + (R() < 0.14 ? 60 + R() * 110 : 0), R() < 0.35 ? 4 : 3, R() < 0.4 ? pick(TOWER) : undefined, SEA_Y);
  }
}

// ---- big screens and shop signs on the west fronts (facing the avenue) ----
export const SCREENS = [
  { x: -FXW + 0.3, y: 15, z: -34, w: 13, h: 7.5, yaw: Math.PI / 2, seed: 3 },
  { x: -FXW + 0.3, y: 18, z: 44, w: 14, h: 8, yaw: Math.PI / 2, seed: 7 },
];
export const SIGNS = [], AWNINGS = [];
{
  const R = rng(37);
  const open = (z) => !(z > SIDE1[0] - 1 && z < SIDE1[1] + 1) && !(z > SIDE2[0] - 1 && z < SIDE2[1] + 1);
  for (let z = 70; z > END_Z + 8; z -= 7 + R() * 7) {
    if (!open(z) || R() < 0.15) continue;
    SIGNS.push({ x: -FXW + 0.06, y: 4.4, z, w: 4.5 + R() * 4, h: 1.25, yaw: Math.PI / 2, cell: Math.floor(R() * 8) });
  }
  const AW = [0xd8452a, 0xf0c040, 0x2a8a7a, 0xf4efe4, 0x3a5aa8, 0xc23a7a, 0x2f6a3a];
  for (let z = 68; z > END_Z + 8; z -= 6 + R() * 6) {
    if (!open(z) || R() < 0.3) continue;
    AWNINGS.push({ x: -FXW + 1.0, z, w: 4 + R() * 2.5, col: AW[Math.floor(R() * AW.length)] });
  }
}

// ---- lamps along the curbs and the quay; trees and benches on the promenade (a gap where you look at the harbour) ----
export const LAMPS = [], TREES = [], BENCHES = [];
for (const x of [-CURB - 0.6, CURB + 0.6]) for (let z = 50; z > END_Z + 6; z -= 32) LAMPS.push({ x, z });
for (let z = 46; z > END_Z + 6; z -= 26) LAMPS.push({ x: QX - 0.8, z, quay: true });
{
  const R = rng(43);
  for (let z = 60; z > END_Z + 8; z -= 13 + R() * 5) {
    if (z > -16 && z < 8) continue;                     // the view to the harbour stays open
    TREES.push({ x: 16.5 + R() * 1.5, z, h: 5.5 + R() * 2.5, r: 2.0 + R() * 0.7, seed: R() });
  }
  for (const z of [18, -24, -46, -70]) BENCHES.push({ x: 20.5, z });
}

// ---- boats moored along the quay, and the one the Mosasaurus comes down on ----
export const BOATS = [
  { x: 31, z: 20, len: 11, yaw: 0.05, col: 0xf4f4f0 },
  { x: 31, z: -50, len: 13, yaw: -0.04, col: 0xffffff },
  { x: 30, z: -62, len: 9, yaw: 0.1, col: 0x2a4a7a },
  { x: 70, z: 30, len: 16, yaw: 0.6, col: 0xf0ece4 },
  { x: 120, z: -60, len: 22, yaw: -0.3, col: 0xffffff },
  { x: 160, z: 40, len: 14, yaw: 1.1, col: 0xe8e2d8 },
];
export const TARGET_BOAT = { x: 36.5, z: -13, len: 13, yaw: -0.5, col: 0xf6f4ee };
