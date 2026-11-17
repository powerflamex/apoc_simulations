// Where everything stands (metres; x east, y up, z south). A made-up downtown shopping street at midday, running
// north-south: one lane each way and a parking lane on each side (the road 12 m wide), 5 m sidewalks, shops in the
// ground floors of 4- to 12-storey blocks, a cross street 110 m up, towers beyond. You stand on the east sidewalk,
// 2 m out from the shop fronts, facing the camera (south); the camera looks past you up the street (north). Right
// behind you a cafe's terrace: tables on the sidewalk inside low glass screens (the first glass to go).
// Buildings within ~115 m of you are cut into chunks (floors x pairs of window bays x depth slices) so they can be
// blown apart; the rest are whole boxes.
import { rng } from './util.js';

export const RW = 6, WALK = 5, FX = RW + WALK;              // road half-width, sidewalk width, building fronts (|x|)
export const CZ = -110, CW = 8;                             // the cross street's centre line and half-width (road)
export const YOU = { x: 8.35, z: 0.0 };
export const YOU_YAW = -0.3;                                // (the figure faces +z; turned a little toward the road)
export const MOUTH = { x: 8.32, y: 1.57, z: 0.09 };          // where the sound comes from (physics; matches the figure)
export const CAM = { x: 8.6, y: 1.35, z: 2.3 };              // the camera: 2.3 m in front of you, looking up the street
// the cafe terrace behind you: tables against the shop front, low glass screens on its street side and south end
export const CAFE = { x0: 8.95, x1: 10.95, z0: -10.5, z1: -3.2, screenH: 2.3 };
export const LANES = [-1.7, 1.7], PARK = [-4.75, 4.75];     // traffic lanes (south-bound at x < 0), parking lanes
export const LAMP_X = 6.35;
export const CHUNK_R = 135;                                 // buildings closer than this (m) are chunked

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col, colW, chunk } ----
// kind 0: stone/concrete offices, 1: glass, 2: older brick block, 3: far city, 4: tall glass towers
export const BLD = [];
{
  const R = rng(9119);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xc9b79a, 0xb08468, 0xe0d6c4, 0x9a6a52, 0xcfb08a, 0xe8e0d0, 0x8a5a44, 0xbfb4a4, 0xd8bf94, 0xa79580, 0xb86a50, 0x8fa3b2, 0x7a7068, 0xc28a5a];
  const TOWER = [0x5f7fa0, 0x7896b4, 0x50709a, 0x8aa4bc, 0x6888a8, 0x4a6680];
  const add = (x, z, w, d, h, kind, col) => {
    const b = { x, y: 0, z, w, d, h, kind, col: col ?? (kind === 1 || kind === 4 ? pick(TOWER) : pick(COLS)) };
    // window column width: brick blocks wide, glass narrow, offices in between (the shader reads it)
    b.colW = kind === 1 || kind === 4 ? 1.7 : kind === 2 ? 3.1 : 2.4 + 0.5 * R();
    BLD.push(b);
    return b;
  };
  const kindOf = () => (R() < 0.2 ? 1 : R() < 0.5 ? 2 : 0);
  // the two street walls: from behind the camera to the cross street, then on to the towers
  for (const side of [-1, 1]) {
    for (const [zA, zB, tall] of [[70, CZ + CW + WALK, 0], [CZ - CW - WALK, -330, 1]]) {
      let z = zA;
      while (z > zB + 3) {
        let d = Math.min(13 + R() * 17, z - zB);
        if (z - d - zB < 8) d = z - zB;           // (no sliver at the end of a row)
        const w = 20 + R() * 14;
        const zc = z - d / 2;
        let h = (tall ? 30 : 14) + R() * (tall ? 40 : 26);
        if (Math.abs(zc) < 30 && side > 0) h = 22 + R() * 8;   // (the block beside you: 6-8 floors)
        add(side * (FX + w / 2), zc, w, d - 0.5, h, tall && R() < 0.4 ? 1 : kindOf());
        z -= d;
      }
    }
    // the cross street's walls (east and west of the corner)
    for (const zs of [-1, 1]) {
      let x = FX + 0.5;
      while (x < 220) {
        const w = 14 + R() * 16, d = 22 + R() * 12;
        add(side * (x + w / 2), CZ + zs * (CW + WALK + d / 2), w - 0.5, d, 18 + R() * 30, kindOf());
        x += w;
      }
    }
  }
  // the blocks behind the street walls (roofs over the street), taller further off
  for (let i = 0; i < 520; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (52 + R() * 520), z = 160 - R() * 900;
    if (Math.abs(z - CZ) < CW + WALK + 40) continue;
    const far = Math.abs(x) > 160 || z < -260;
    add(x, z, 22 + R() * 26, 22 + R() * 26, (far ? 40 : 26) + R() * (far ? 90 : 40) + (R() < 0.15 ? 60 + R() * 110 : 0), R() < 0.35 ? 4 : 3);
  }
  // the skyline up the street, beyond the towers
  for (let i = 0; i < 140; i++) {
    const x = (R() - 0.5) * 700, z = -360 - R() * 900;
    if (Math.abs(x) < FX + 2) continue;
    add(x, z, 30 + R() * 30, 30 + R() * 30, 70 + R() * 150 + (R() < 0.2 ? 80 + R() * 100 : 0), R() < 0.6 ? 4 : 3);
  }
  // (no two boxes overlapping much: drop the back blocks that cut into the street walls)
  const walls = BLD.filter((b) => b.kind < 3);
  for (let i = BLD.length - 1; i >= 0; i--) {
    const b = BLD[i];
    if (b.kind < 3) continue;
    if (walls.some((a) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2)) BLD.splice(i, 1);
    else if (Math.abs(b.x) - b.w / 2 < FX + 1) BLD.splice(i, 1);
  }
  // which buildings are chunked: the nearest point of the box within CHUNK_R of you
  for (const b of BLD) {
    const dx = Math.max(Math.abs(b.x - YOU.x) - b.w / 2, 0), dz = Math.max(Math.abs(b.z - YOU.z) - b.d / 2, 0);
    b.near = Math.hypot(dx, dz);
    b.chunk = b.near < CHUNK_R;
  }
}

// ---- shop signs and awnings on the street walls (attached to the chunks they sit on) ----
export const SIGNS = [], AWNINGS = [];
{
  const R = rng(77);
  const AW = [0xc8302a, 0x2a6a4a, 0x2a3a7a, 0xe0a020, 0x6a2a5a, 0x1d1d1d, 0xd05a20];
  for (const side of [-1, 1]) for (let z = 60; z > -300; z -= 6 + R() * 6) {
    if (Math.abs(z - CZ) < CW + WALK + 3) continue;
    // (keep the shop window right next to you clear: it's the first thing to break)
    const r = R();
    if (side > 0 && z > -13 && z < 6) continue;      // (the cafe's own awning there)
    if (r < 0.45) SIGNS.push({ x: side * (FX - 0.06), y: 4.35, z, w: 3.6 + R() * 2.4, h: 0.9, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8), side });
    else if (r < 0.8) AWNINGS.push({ x: side * (FX - 0.02), z, w: 2.6 + R() * 1.8, side, col: AW[Math.floor(R() * AW.length)] });
  }
  // the cafe's own awning over its terrace (dark green)
  AWNINGS.push({ x: FX - 0.02, z: -6.75, w: 7.4, side: 1, col: 0x1d5a3a, out: 1.7 });
}

// ---- street furniture ----
export const LAMPS = [];
for (const side of [-1, 1]) for (let z = 40 + (side > 0 ? 0 : 12); z > -330; z -= 25) {
  if (Math.abs(z - CZ) < CW + 3) continue;
  if (side > 0 && z > -8 && z < 8) continue;      // (none in the shot right by you)
  LAMPS.push({ x: side * LAMP_X, z, dir: -side });
}
export const HYDRANT = { x: 6.55, z: -14.2 };
export const BINS = [{ x: 6.6, z: -19.5 }, { x: -6.6, z: -21 }, { x: 6.6, z: -46 }];

// ---- parked cars (nose to tail along both curbs) and the traffic (one lane each way, slow at midday) ----
export const PARKED = [], MOVING = [];
{
  const R = rng(616);
  const LEN = [4.5, 4.0, 4.6, 4.9];
  for (const side of [-1, 1]) {
    let z = 30;
    while (z > -320) {
      if (Math.abs(z - CZ) < CW + 4) { z = CZ - CW - 4; continue; }
      const kind = [0, 1, 2, 2, 3, 0, 1][Math.floor(R() * 7)], len = LEN[kind];
      if (R() < 0.12) { z -= 6 + R() * 4; continue; }          // an empty space
      if (!(side > 0 && Math.abs(z - YOU.z) < 3)) PARKED.push({ x: side * 4.75 + (R() - 0.5) * 0.15, z: z - len / 2, kind, yaw: side > 0 ? Math.PI : 0, side });
      z -= len + 1.0 + R() * 1.6;
    }
  }
  // moving: [lane x, start z at v = 0, direction (-1 north-bound), speed m/s]
  for (const [x, dir] of [[1.7, -1], [-1.7, 1]]) {
    for (let z = 22 - R() * 6; z > -280; z -= 12 + R() * 13) {
      if (Math.abs(z - CZ) < CW + 3) continue;
      const kind = [0, 1, 2, 2, 3, 0][Math.floor(R() * 6)];
      MOVING.push({ x, z0: z, dir, kind, speed: 4.0 + R() * 1.2, side: Math.sign(x) });
    }
  }
}
