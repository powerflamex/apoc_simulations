// Where everything stands (metres; x east, y up, z south: the camera looks north). An unnamed made-up U.S. downtown at
// night. A four-lane avenue (two lanes each way) with wide sidewalks; you walk north up the east sidewalk with the crowd.
// Wooden utility poles carry the wires along the east curb (the one just ahead of you holds a transformer can). A cross
// street with traffic lights 30 m ahead; a subway entrance on your sidewalk just before it. Shops with lit signs, blade
// signs and big screens on both sides; towers beyond the crossing, the skyline running on down the avenue.
import { rng } from './util.js';

export const EYE = 1.66;
export const CAM_X = 10.0;
export const camZ = (v) => 8.2 - 0.33 * v;                        // you walk north with the crowd (~0.4 m/s)
export const CAM0 = { x: CAM_X, z: 8.2 };
export const CURB = 7.0, FX = 14.0;                               // curbs, building fronts (both sides)
export const LANES = [-5.25, -1.75, 1.75, 5.25];                  // southbound (toward you) west of the middle, northbound east
export const CROSS = [-22, -10];                                  // the cross street (z range)
export const CROSS_Z = (CROSS[0] + CROSS[1]) / 2;
export const END_Z = -235;                                        // the avenue bends away behind a block across the end
export const SUBWAY = { x: 11.9, w: 2.0, z0: -3.6, z1: -8.8, zc: -3.6, D: 3.9 };   // the stairwell on the sidewalk: its mouth faces south (you), the stairs go down northward
export const groundY = () => 0;

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone and concrete offices (punched windows), 1: glass, 2: older block (small windows, cornices), 3: far city, 4: towers
export const BLD = [];
{
  const R = rng(1859);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xb8a888, 0xa98a6e, 0xc6bcab, 0x99786a, 0xb2946c, 0xcfc6b6, 0x8f5f4c, 0xafa494, 0xc2a77a, 0x978570, 0xb87f5a, 0x8f9fae];
  const TOWER = [0x5f7f9f, 0x7896b4, 0x4f6f94, 0x8ca4bc, 0x6888a8];
  const add = (x, z, w, d, h, kind, col, y = -0.5) => BLD.push({ x, y, z, w, d, h: h + 0.5, kind, col: col ?? pick(COLS) });
  for (const side of [-1, 1]) {
    // the fronts along the avenue, block by block, the cross street left open
    for (const [za, zb] of [[70, CROSS[1]], [CROSS[0], END_Z + 20]]) {
      let z = za;
      while (z > zb + 3) {
        const d = Math.min(9 + R() * 13, z - zb), w = 18 + R() * 12, zc = z - d / 2;
        const near = zc > -75;
        const h = zc > CROSS[0] ? 11 + R() * 13 : 13 + R() * 20;
        add(side * (FX + w / 2), zc, w, d - 0.5, h, R() < 0.25 ? 1 : R() < 0.5 ? 2 : 0);
        z -= d;
      }
    }
    // the cross street's fronts
    for (let x = FX + 2; x < 160;) { const w = 12 + R() * 14; add(side * (x + w / 2), CROSS[1] + 9, w - 0.5, 18, 20 + R() * 40, R() < 0.4 ? 1 : 0); add(side * (x + w / 2), CROSS[0] - 9, w - 0.5, 18, 26 + R() * 50, R() < 0.4 ? 1 : 0); x += w; }
  }
  // the block across the far end of the avenue, and the downtown towers beyond it (the skyline down the avenue)
  for (let x = -60; x < 60;) { const w = 14 + R() * 12; add(x + w / 2, END_Z - 12, w - 0.5, 22, 10 + R() * 8, 2); x += w; }
  for (let i = 0; i < 240; i++) {
    const zz = END_Z - 30 - Math.pow(R(), 0.8) * 1300, x = (R() - 0.5) * (120 + (END_Z - zz) * 0.9);
    const tall = R() < 0.35;
    add(x, zz, 24 + R() * 30, 24 + R() * 30, tall ? 110 + R() * 200 : 40 + R() * 70, tall ? 4 : R() < 0.5 ? 1 : 3, tall || R() < 0.4 ? pick(TOWER) : undefined);
  }
  // blocks behind the fronts on both sides, taller further off
  for (let i = 0; i < 160; i++) {
    const side = R() < 0.5 ? -1 : 1, x = side * (52 + R() * 380), zz = 60 - R() * 320;
    add(x, zz, 22 + R() * 30, 22 + R() * 30, 30 + R() * 60 + (R() < 0.2 ? 60 + R() * 120 : 0), R() < 0.3 ? 4 : 3, R() < 0.3 ? pick(TOWER) : undefined);
  }
  // behind you the avenue goes on
  for (let x = -60; x < 60;) { const w = 14 + R() * 14; add(x + w / 2, 110, w - 0.5, 20, 24 + R() * 30, R() < 0.5 ? 0 : 2); x += w; }
}

// ---- lit things: big screens, shop fascia signs, blade signs (each has the distance at which the power dies) ----
export const SCREENS = [
  { x: -FX + 1.2, y: 13, z: 0, w: 12, h: 7, yaw: Math.PI / 2 - 0.35, seed: 3 },
  { x: -FX - 3.0, y: 20, z: CROSS[0] - 4, w: 17, h: 9.5, yaw: Math.PI * 0.82, seed: 7 },    // over the far corner of the crossing
  { x: FX - 0.3, y: 15, z: -62, w: 13, h: 7.5, yaw: -Math.PI / 2, seed: 11 },
  { x: -FX + 0.3, y: 19, z: -95, w: 14, h: 8, yaw: Math.PI / 2, seed: 5 },
];
export const SIGNS = [], BLADES = [];
{
  const R = rng(37);
  const open = (z) => !(z > CROSS[0] - 1 && z < CROSS[1] + 1);
  for (const side of [-1, 1]) {
    for (let z = 60; z > END_Z + 25; z -= 6 + R() * 6) {
      if (!open(z) || R() < 0.12) continue;
      if (side > 0 && z < SUBWAY.z0 + 2 && z > SUBWAY.z1 - 2) continue;
      SIGNS.push({ x: side * (FX - 0.06), y: 4.6, z, w: 4 + R() * 3.5, h: 1.15, yaw: -side * Math.PI / 2, cell: Math.floor(R() * 12) });
    }
    for (let z = 50; z > END_Z + 30; z -= 9 + R() * 9) {
      if (!open(z) || R() < 0.2) continue;
      BLADES.push({ x: side * (FX - 0.9), y: 6.5 + R() * 3, z, h: 3.2 + R() * 2.5, w: 0.9, side, cell: Math.floor(R() * 8) });
    }
  }
}

// ---- utility poles along the east curb (wires along the avenue); the second one holds the transformer over you ----
export const POLES = [28.5, -6, -27, -48, -72, -96, -120, -144, -168, -192].map((z) => ({ x: CURB + 0.6, z }));
export const XF_POLE = POLES[1];
export const POLE_H = 11.0;
export const WIRE_X = [-1.1, 0, 1.1];                              // the three wires on the crossarm (offsets in x)
// street lamps: on the poles (east, arm out over the road) and on posts (west)
export const LAMPS = [];
for (const p of POLES) LAMPS.push({ x: p.x, z: p.z + 0.01, d: -1, h: 9.0 });
for (let z = 40; z > END_Z + 20; z -= 26) if (!(z > CROSS[0] - 3 && z < CROSS[1] + 3)) LAMPS.push({ x: -CURB - 0.5, z, d: 1, h: 8.5 });
export const lampHead = (l) => ({ x: l.x + l.d * 2.3, y: l.h - 0.15, z: l.z });

// ---- traffic lights at the crossing: mast arms over the lanes (heads face the traffic coming at them) ----
export const SIGNALS = [
  { x: CURB + 0.5, z: CROSS[1] + 1.2, arm: -1, faces: 'S' },   // near-right corner, over the northbound lanes, faces you
  { x: -CURB - 0.5, z: CROSS[0] - 1.2, arm: 1, faces: 'N' },  // far-left corner, over the southbound lanes
  { x: -CURB - 0.5, z: CROSS[1] + 1.2, arm: 0, faces: 'E' },  // near-left: for the cross street (seen side-on)
  { x: CURB + 0.5, z: CROSS[0] - 1.2, arm: 0, faces: 'W' },
];
