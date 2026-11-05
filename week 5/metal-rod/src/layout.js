// Where everything stands (metres; x east, y up, z south: the camera looks north, up the avenue, where the rod comes
// down). A wide avenue (two carriageways of three lanes, a planted median) meets a cross street at a scramble crossing.
// The avenue runs 1.5 km north through the city to a cluster of tall towers; the rod lands on it 500 m ahead.
// You stand on the crossing, a little west of the avenue's middle, in the crowd.
import { rng } from './util.js';

export const ROAD_X = 15, ROAD_Z = 10, WALK = 7, MED = 2.2;
export const FX = ROAD_X + WALK, FZ = ROAD_Z + WALK;     // building fronts
export const AVE_END = -1500;                             // where the avenue's buildings end (the towers beyond)
export const CAM0 = { x: -3.0, z: 8.0 };                  // you: on the crossing, near its south edge
export const HIT = { x: 0, z: -500 };                     // where the tip comes down

// ---- buildings: { x, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone and concrete offices (punched windows), 1: glass tower, 2: older block (small windows, cornices),
// 3: far city (simple), 4: the tall towers at the end of the avenue
export const BLD = [];
{
  const R = rng(17);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xb8b0a4, 0x9c948a, 0xc9c2b6, 0x8d8f94, 0xb09c86, 0xd2c8b8, 0x7f7c78, 0xa8adb4, 0xc4a98e, 0x9a8c7c];
  // the four corners: tall, with the big screens
  BLD.push({ x: -41, z: -39, w: 38, d: 44, h: 72, kind: 0, col: 0xb5aa9c });
  BLD.push({ x: 43, z: -37, w: 42, d: 40, h: 118, kind: 1, col: 0x7d8da0 });
  BLD.push({ x: 41, z: 35, w: 38, d: 36, h: 58, kind: 2, col: 0xb49a84 });
  BLD.push({ x: -39, z: 37, w: 34, d: 40, h: 50, kind: 0, col: 0xa9a49c });
  // along the avenue, north: lots of different widths and heights; the sides of the avenue stay under ~90 m near you
  for (const side of [-1, 1]) {
    let z = -62;
    while (z > AVE_END) {
      const d = 14 + R() * 20;
      const far = -z;
      let h = 24 + R() * 40;
      if (R() < 0.18) h += 40 + R() * 70;
      if (far < 120) h = Math.min(h, 70);
      const w = 18 + R() * 16;
      BLD.push({ x: side * (FX + w / 2), z: z - d / 2, w, d: d - 0.8, h, kind: R() < 0.25 ? 1 : R() < 0.45 ? 2 : 0, col: pick(COLS) });
      z -= d;
    }
  }
  // along the avenue, south (behind you)
  for (const side of [-1, 1]) {
    let z = 56;
    while (z < 320) {
      const d = 14 + R() * 18, w = 18 + R() * 14;
      BLD.push({ x: side * (FX + w / 2), z: z + d / 2, w, d: d - 0.8, h: 20 + R() * 36, kind: R() < 0.5 ? 0 : 2, col: pick(COLS) });
      z += d;
    }
  }
  // along the cross street, east and west
  for (const side of [-1, 1]) for (const zs of [-1, 1]) {
    let x = side > 0 ? 64 : -60;
    while (Math.abs(x) < 360) {
      const w = 14 + R() * 18, d = 18 + R() * 14;
      BLD.push({ x: x + side * w / 2, z: zs * (FZ + d / 2), w: w - 0.8, d, h: 18 + R() * 34, kind: R() < 0.2 ? 1 : R() < 0.5 ? 2 : 0, col: pick(COLS) });
      x += side * w;
    }
  }
  // the far city: blocks behind the street fronts, out to the edges (seen between and over the near ones)
  for (let i = 0; i < 260; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (62 + R() * 560), z = 60 - R() * 1600;
    const w = 22 + R() * 34, d = 22 + R() * 34;
    if (Math.abs(z) < FZ + d / 2 + 3) continue;
    BLD.push({ x, z, w, d, h: 18 + R() * 60 * (R() < 0.15 ? 2.4 : 1), kind: 3, col: pick(COLS) });
  }
  // the towers at the far end of the avenue (the skyline the rod comes down in front of)
  for (let i = 0; i < 46; i++) {
    const x = (R() - 0.5) * 900, z = AVE_END - 80 - R() * 900;
    const w = 30 + R() * 40, d = 30 + R() * 40;
    BLD.push({ x, z, w, d, h: 110 + R() * 190, kind: 4, col: pick([0x7d8da0, 0x9aa6b4, 0xb8b0a4, 0x6f7f92, 0xc4c0b8]) });
  }
}

// ---- the big screens (LED boards on the corners, facing the crossing): { x, y, z, w, h, yaw (the way it faces), seed } ----
export const SCREENS = [
  { x: -24.6, y: 31, z: -19.6, w: 22, h: 13, yaw: Math.PI / 4, seed: 8 },          // NW corner, across the corner, facing the crossing
  { x: 24.6, y: 36, z: -19.6, w: 22, h: 13, yaw: -Math.PI / 4, seed: 9 },          // NE corner, the same
  { x: -19.6, y: 26, z: -62, w: 16, h: 9, yaw: Math.PI / 2 - 0.62, seed: 10 },     // up the avenue, west side, angled toward the crossing
  { x: 19.6, y: 33, z: -96, w: 16, h: 9, yaw: -Math.PI / 2 + 0.62, seed: 11 },     // up the avenue, east side, the same
  { x: -22.3, y: 22, z: -150, w: 14, h: 10, yaw: Math.PI / 2, seed: 12 },          // further up, west side
  { x: 22.3, y: 26, z: -200, w: 14, h: 10, yaw: -Math.PI / 2, seed: 13 },          // further up, east side
  { x: -26, y: 34, z: -17.3, w: 24, h: 14, yaw: 0, seed: 1 },                     // NW corner, facing south (to you)
  { x: -22.3, y: 28, z: -32, w: 22, h: 12, yaw: Math.PI / 2, seed: 2 },          // NW corner, facing east over the avenue
  { x: 22.3, y: 36, z: -30, w: 24, h: 14, yaw: -Math.PI / 2, seed: 3 },          // NE tower, facing west
  { x: 32, y: 24, z: -17.3, w: 18, h: 10, yaw: 0, seed: 4 },                      // NE, facing south
  { x: 22.3, y: 18, z: 30, w: 14, h: 8, yaw: -Math.PI / 2, seed: 5 },            // SE, facing west
  { x: -22.3, y: 22, z: -96, w: 12, h: 18, yaw: Math.PI / 2, seed: 6 },          // up the avenue, west side
  { x: 22.3, y: 26, z: -150, w: 12, h: 18, yaw: -Math.PI / 2, seed: 7 },         // up the avenue, east side
];

// ---- flat shop signs over the shop fronts along the avenue and the cross street ----
export const SIGNS = [];
{
  const R = rng(29);
  for (const side of [-1, 1]) for (let z = -24; z > -420; z -= 9 + R() * 9) {
    if (R() < 0.2) continue;
    SIGNS.push({ x: side * (FX + 0.06), y: 4.4, z, w: 5 + R() * 4, h: 1.3, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8) });
  }
  for (const side of [-1, 1]) for (const zs of [-1, 1]) for (let x = side * 26; Math.abs(x) < 220; x += side * (9 + R() * 9)) {
    if (R() < 0.3) continue;
    SIGNS.push({ x, y: 4.4, z: zs * (FZ + 0.06), w: 5 + R() * 4, h: 1.3, yaw: zs < 0 ? 0 : Math.PI, cell: Math.floor(R() * 8) });
  }
}

// ---- street lamps (double arms on the median, single on the sidewalks), traffic signals, trees on the median ----
export const LAMPS = [], TREES = [];
for (let z = -36; z > AVE_END; z -= 34) LAMPS.push({ x: 0, z, arms: 2 });
for (let z = 36; z < 300; z += 34) LAMPS.push({ x: 0, z, arms: 2 });
for (const side of [-1, 1]) {
  for (let z = -30; z > AVE_END; z -= 46) LAMPS.push({ x: side * (ROAD_X + 0.9), z, arms: 1 });
  for (let x = 30; x < 340; x += 40) { LAMPS.push({ x: side * x, z: ROAD_Z + 0.9, arms: 1 }); LAMPS.push({ x: side * x, z: -(ROAD_Z + 0.9), arms: 1 }); }
}
{
  const R = rng(41);
  for (let z = -72; z > AVE_END; z -= 17 + R() * 4) TREES.push({ x: (R() - 0.5) * 0.6, z, h: 5.5 + R() * 2.5, r: 2.2 + R() * 1.0, seed: R() });
  for (let z = 40; z < 300; z += 17 + R() * 4) TREES.push({ x: (R() - 0.5) * 0.6, z, h: 5.5 + R() * 2.5, r: 2.2 + R() * 1.0, seed: R() });
}
export const SIGNALS = [
  { x: -15.8, z: -10.8 }, { x: 15.8, z: -10.8 }, { x: 15.8, z: 10.8 }, { x: -15.8, z: 10.8 },
];
