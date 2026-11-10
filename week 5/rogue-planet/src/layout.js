// Where everything stands (metres; x east, y up, z south: the camera looks north, up the avenue, where the planet is).
// A scramble crossing: the avenue (north-south, 30 m of road) meets a cross street (20 m) in a box |x| < 15, |z| < 10,
// striped on all four sides and both diagonals. Sidewalks 6 m wide; the buildings' fronts at |x| = 21 / |z| = 16.
// The avenue runs 650 m north to the bay. You stand on the crossing, a little west of the avenue's middle.
import { rng } from './util.js';

export const ROAD_X = 15, ROAD_Z = 10, WALK = 6;
export const FX = ROAD_X + WALK, FZ = ROAD_Z + WALK;     // building fronts
export const BAY_Z = -640;                                // where the avenue meets the bay
export const CAM0 = { x: -4.0, z: 7.6 };                  // you: on the crossing, near its south edge

// ---- buildings: { x, z, w (along x), d (along z), h, kind, col } ----
// kind 0: shops and offices (lit windows, a lit shop front), 1: glass tower, 2: old block (punched windows), 3: far city
export const BLD = [];
{
  const R = rng(11);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0x8a8780, 0x6f6a64, 0x9a948a, 0x5d6066, 0x7d7468, 0xa39a8c, 0x575250, 0x8c8f94];
  // the four corners: tall, with the big screens
  BLD.push({ x: -36, z: -34, w: 30, d: 36, h: 46, kind: 0, col: 0x7a7570, corner: 'NW' });
  BLD.push({ x: 37, z: -33, w: 32, d: 34, h: 62, kind: 1, col: 0x5b6470, corner: 'NE' });
  BLD.push({ x: 35, z: 30, w: 28, d: 28, h: 38, kind: 0, col: 0x8e877c, corner: 'SE' });
  BLD.push({ x: -34, z: 31, w: 26, d: 30, h: 34, kind: 2, col: 0x847b70, corner: 'SW' });
  // along the avenue, north: lots of different widths; the east side kept under ~44 m so the Moon shows over it
  for (const side of [-1, 1]) {
    let z = -52;
    while (z > BAY_Z + 30) {
      const d = 10 + R() * 18;
      const far = -z;
      let h = 14 + R() * 30;
      if (side > 0) h = Math.min(h, far < 120 ? 26 + R() * 12 : 30 + R() * 14);
      else if (R() < 0.25) h += 15 + R() * 25;
      const w = 16 + R() * 14;
      BLD.push({ x: side * (FX + w / 2), z: z - d / 2, w, d: d - 0.6, h, kind: R() < 0.2 ? 1 : R() < 0.5 ? 2 : 0, col: pick(COLS) });
      z -= d;
    }
  }
  // along the avenue, south (behind you)
  for (const side of [-1, 1]) {
    let z = 46;
    while (z < 260) {
      const d = 12 + R() * 16, w = 16 + R() * 14;
      BLD.push({ x: side * (FX + w / 2), z: z + d / 2, w, d: d - 0.6, h: 16 + R() * 30, kind: R() < 0.5 ? 0 : 2, col: pick(COLS) });
      z += d;
    }
  }
  // along the cross street, east and west
  for (const side of [-1, 1]) for (const zs of [-1, 1]) {
    let x = side > 0 ? 54 : -50;
    while (Math.abs(x) < 300) {
      const w = 12 + R() * 16, d = 16 + R() * 12;
      BLD.push({ x: x + side * w / 2, z: zs * (FZ + d / 2), w: w - 0.6, d, h: 15 + R() * 28, kind: R() < 0.2 ? 1 : R() < 0.5 ? 2 : 0, col: pick(COLS) });
      x += side * w;
    }
  }
  // the far city: blocks behind the street fronts, out to the edges (seen between and over the near ones)
  for (let i = 0; i < 160; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (60 + R() * 420), z = 40 - R() * 640;
    const w = 20 + R() * 30, d = 20 + R() * 30;
    if (Math.abs(z) < FZ + d / 2 + 3) continue;
    BLD.push({ x, z, w, d, h: 18 + R() * 55 * (R() < 0.15 ? 2.2 : 1), kind: 3, col: pick(COLS) });
  }
}

// ---- the big screens (facing the crossing): { x, y, z, w, h, yaw (the way it faces), seed } ----
export const SCREENS = [
  { x: -21.3, y: 24, z: -24, w: 22, h: 13, yaw: Math.PI / 2, seed: 1 },          // NW corner, facing east over the avenue
  { x: -25, y: 33, z: -16.3, w: 16, h: 10, yaw: 0, seed: 2 },                     // NW corner, facing south (to you)
  { x: 21.3, y: 30, z: -26, w: 20, h: 14, yaw: -Math.PI / 2, seed: 3 },           // NE tower, facing west
  { x: 30, y: 19, z: -16.3, w: 14, h: 9, yaw: 0, seed: 4 },                       // NE, facing south
  { x: 21.3, y: 15, z: 26, w: 12, h: 8, yaw: -Math.PI / 2, seed: 5 },             // SE
  { x: -21.3, y: 17, z: -70, w: 10, h: 14, yaw: Math.PI / 2, seed: 6 },           // up the avenue
];

// ---- vertical (blade) signs on the fronts, and flat signs over the shops ----
export const SIGNS = [];
{
  const R = rng(23);
  for (const side of [-1, 1]) {
    for (let z = -20; z > -300; z -= 6 + R() * 8) {
      if (R() < 0.25) continue;
      SIGNS.push({ x: side * (FX + 0.9), y: 5 + R() * 10, z, w: 1.4, h: 5 + R() * 6, yaw: 0, blade: true, cell: Math.floor(R() * 16), side });
    }
    for (let x = side * 24; Math.abs(x) < 160; x += side * (6 + R() * 8)) {
      for (const zs of [-1, 1]) {
        if (R() < 0.35) continue;
        SIGNS.push({ x, y: 5 + R() * 9, z: zs * (FZ + 0.9), w: 1.4, h: 4 + R() * 6, yaw: Math.PI / 2, blade: true, cell: Math.floor(R() * 16), side: zs });
      }
    }
  }
  // shop signs (flat on the fronts, over the doors)
  for (const side of [-1, 1]) for (let z = -22; z > -260; z -= 9 + R() * 8) {
    SIGNS.push({ x: side * (FX + 0.05), y: 4.1, z, w: 6 + R() * 3, h: 1.3, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, blade: false, cell: 16 + Math.floor(R() * 8), side });
  }
}

// ---- street lamps, traffic signals, vending machines ----
export const LAMPS = [];
for (const side of [-1, 1]) {
  for (let z = -30; z > BAY_Z; z -= 28) LAMPS.push({ x: side * (ROAD_X + 0.8), z });
  for (let z = 30; z < 200; z += 28) LAMPS.push({ x: side * (ROAD_X + 0.8), z });
  for (let x = 30; x < 300; x += 28) { LAMPS.push({ x: side * x, z: ROAD_Z + 0.8 }); LAMPS.push({ x: side * x, z: -(ROAD_Z + 0.8) }); }
}
export const SIGNALS = [
  { x: -15.8, z: -10.8 }, { x: 15.8, z: -10.8 }, { x: 15.8, z: 10.8 }, { x: -15.8, z: 10.8 },
];
export const VENDING = [
  { x: -20.4, z: 18.5, yaw: Math.PI / 2 }, { x: -20.4, z: 20, yaw: Math.PI / 2 }, { x: 20.4, z: -19, yaw: -Math.PI / 2 },
  { x: -20.4, z: -30, yaw: Math.PI / 2 }, { x: 20.4, z: -48, yaw: -Math.PI / 2 },
];

// ---- light on the street from the screens, signs and shops (the ground and the water add these up) ----
// { x, y, z, r, g, b, rad } ; the screens' colour is set each frame
export const POOLS = [
  ...SCREENS.map((s) => ({ x: s.x + Math.sin(s.yaw) * 6, y: s.y * 0.5, z: s.z + Math.cos(s.yaw) * 6, r: 1, g: 1, b: 1, rad: 28, screen: s })),
  { x: -19, y: 3, z: -40, r: 1.0, g: 0.35, b: 0.7, rad: 14 }, { x: 19, y: 3, z: -45, r: 0.3, g: 0.8, b: 1.0, rad: 14 },
  { x: -19, y: 3, z: -80, r: 1.0, g: 0.7, b: 0.3, rad: 14 }, { x: 19, y: 3, z: -90, r: 1.0, g: 0.3, b: 0.3, rad: 14 },
  { x: -19, y: 3, z: 20, r: 1.0, g: 0.85, b: 0.6, rad: 10 }, { x: 19, y: 3, z: 22, r: 0.6, g: 0.9, b: 1.0, rad: 12 },
  { x: -30, y: 3, z: -11, r: 1.0, g: 0.5, b: 0.85, rad: 12 }, { x: 32, y: 3, z: 11, r: 1.0, g: 0.8, b: 0.4, rad: 12 },
];
