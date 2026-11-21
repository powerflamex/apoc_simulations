// Where everything stands (metres; x east, y up, z south). A made-up shopping street on a sunny afternoon, running
// north-south: one lane each way and a parking lane on each side (the road 12 m wide), 5 m sidewalks with trees at the
// curb, shops in the ground floors of 4- to 9-storey blocks, a cross street 120 m up, towers beyond. You stand in a gap
// between parked cars in the east parking lane with a friend (and her ice cream), facing the camera (south); the
// camera looks past you up the street (north), toward the Sun. Buildings within ~170 m are drawn with a fine mesh so
// they can sag and pour; the rest are plain boxes.
import { rng } from './util.js';

export const RW = 6, WALK = 5, FX = RW + WALK;              // road half-width, sidewalk width, building fronts (|x|)
export const CZ = -120, CW = 8;                             // the cross street's centre line and half-width (road)
export const YOU = { x: 4.45, z: 0.0 };
export const YOU_YAW = 0.18;                                // (the figure faces +z; turned a little toward the camera's right)
export const HEART = { x: 4.45, y: 1.0, z: 0.0 };           // the heat's centre (physics; your middle)
export const CAM = { x: 3.9, y: 1.5, z: 2.6 };             // the camera: 2.5 m in front of you, looking up the street
export const FRIEND = { x: 3.82, z: -0.78 };                // your friend with the ice cream, 0.9 m to your left
export const LANES = [-1.7, 1.7], PARK = [-4.75, 4.75];     // traffic lanes (south-bound at x < 0), parking lanes
export const LAMP_X = 6.4, TREE_X = 7.0;
export const NEAR_R = 170;                                  // buildings closer than this (m) get the fine mesh

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col, colW, near } ----
// kind 0: stone/stucco offices, 1: glass, 2: older brick block, 3: far city, 4: tall glass towers
export const BLD = [];
{
  const R = rng(5150);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xe2cfae, 0xc0906a, 0xeee4d2, 0xa66a4e, 0xd9b98c, 0xf0e8da, 0x9c5f45, 0xcbbfae, 0xe4c79a, 0xb39c84, 0xc4744f, 0x98aebd, 0x857a70, 0xd49a62];
  const TOWER = [0x6a8cae, 0x84a2c0, 0x5a7ca6, 0x95aec6, 0x7494b2, 0x547290];
  const add = (x, z, w, d, h, kind, col) => {
    const b = { x, y: 0, z, w, d, h, kind, col: col ?? (kind === 1 || kind === 4 ? pick(TOWER) : pick(COLS)) };
    b.colW = kind === 1 || kind === 4 ? 1.7 : kind === 2 ? 3.1 : 2.4 + 0.5 * R();
    BLD.push(b);
    return b;
  };
  const kindOf = () => (R() < 0.18 ? 1 : R() < 0.5 ? 2 : 0);
  // the two street walls: from behind the camera to the cross street, then on to the towers
  for (const side of [-1, 1]) {
    for (const [zA, zB, tall] of [[70, CZ + CW + WALK, 0], [CZ - CW - WALK, -340, 1]]) {
      let z = zA;
      while (z > zB + 3) {
        let d = Math.min(12 + R() * 15, z - zB);
        if (z - d - zB < 8) d = z - zB;
        const w = 20 + R() * 14;
        const zc = z - d / 2;
        let h = (tall ? 32 : 14) + R() * (tall ? 42 : 20);
        if (Math.abs(zc) < 26 && side > 0) h = 19 + R() * 5;   // (the block beside you: 5-6 floors)
        add(side * (FX + w / 2), zc, w, d - 0.5, h, tall && R() < 0.45 ? 1 : kindOf());
        z -= d;
      }
    }
    for (const zs of [-1, 1]) {
      let x = FX + 0.5;
      while (x < 230) {
        const w = 14 + R() * 16, d = 22 + R() * 12;
        add(side * (x + w / 2), CZ + zs * (CW + WALK + d / 2), w - 0.5, d, 18 + R() * 30, kindOf());
        x += w;
      }
    }
  }
  // the blocks behind the street walls, taller further off
  for (let i = 0; i < 520; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (52 + R() * 520), z = 160 - R() * 900;
    if (Math.abs(z - CZ) < CW + WALK + 40) continue;
    const far = Math.abs(x) > 160 || z < -260;
    add(x, z, 22 + R() * 26, 22 + R() * 26, (far ? 40 : 26) + R() * (far ? 90 : 40) + (R() < 0.15 ? 60 + R() * 110 : 0), R() < 0.35 ? 4 : 3);
  }
  // the skyline up the street, beyond the towers
  for (let i = 0; i < 150; i++) {
    const x = (R() - 0.5) * 760, z = -370 - R() * 950;
    if (Math.abs(x) < FX + 2) continue;
    add(x, z, 30 + R() * 30, 30 + R() * 30, 70 + R() * 150 + (R() < 0.2 ? 80 + R() * 100 : 0), R() < 0.6 ? 4 : 3);
  }
  const walls = BLD.filter((b) => b.kind < 3);
  for (let i = BLD.length - 1; i >= 0; i--) {
    const b = BLD[i];
    if (b.kind < 3) continue;
    if (walls.some((a) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2)) BLD.splice(i, 1);
    else if (Math.abs(b.x) - b.w / 2 < FX + 1) BLD.splice(i, 1);
  }
  for (const b of BLD) {
    const dx = Math.max(Math.abs(b.x - YOU.x) - b.w / 2, 0), dz = Math.max(Math.abs(b.z - YOU.z) - b.d / 2, 0);
    b.dist = Math.hypot(dx, dz);
    b.near = b.dist < NEAR_R;
  }
}

// ---- shop signs and awnings on the street walls ----
export const SIGNS = [], AWNINGS = [];
{
  const R = rng(4477);
  const AW = [0xc8302a, 0x2a6a4a, 0x2a3a7a, 0xe0a020, 0x6a2a5a, 0xd05a20, 0x1f6f8a];
  for (const side of [-1, 1]) for (let z = 50; z > -320; z -= 6 + R() * 6) {
    if (Math.abs(z - CZ) < CW + WALK + 3) continue;
    const r = R();
    if (side > 0 && z > -27 && z < 8) continue;      // (the ice cream parlour's own awning there)
    if (r < 0.42) SIGNS.push({ x: side * (FX - 0.06), y: 4.35, z, w: 3.6 + R() * 2.4, h: 0.9, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8), side });
    else if (r < 0.85) AWNINGS.push({ x: side * (FX - 0.02), z, w: 2.6 + R() * 1.8, side, col: AW[Math.floor(R() * AW.length)] });
  }
  // the ice cream parlour up the sidewalk, where you two just came from (pink awning), and the shop next to it
  AWNINGS.push({ x: FX - 0.02, z: -19.5, w: 8.5, side: 1, col: 0xd84a7a, out: 2.2 });
  SIGNS.push({ x: FX - 0.06, y: 4.75, z: -12.6, w: 4.6, h: 0.9, yaw: -Math.PI / 2, cell: 0, side: 1 });
  AWNINGS.push({ x: FX - 0.02, z: -9.8, w: 5.5, side: 1, col: 0x1f6f8a, out: 1.8 });
}

// ---- street furniture ----
export const LAMPS = [];
for (const side of [-1, 1]) for (let z = 40 + (side > 0 ? 0 : 12); z > -330; z -= 25) {
  if (Math.abs(z - CZ) < CW + 3) continue;
  if (side > 0 && z > -6 && z < 8) continue;
  LAMPS.push({ x: side * LAMP_X, z, dir: -side });
}
export const TREES = [];
{
  const R = rng(3030);
  for (const side of [-1, 1]) for (let z = 34 + R() * 4; z > -330; z -= 8.5 + R() * 3) {
    if (Math.abs(z - CZ) < CW + 4) continue;
    if (LAMPS.some((l) => Math.sign(l.x) === side && Math.abs(l.z - z) < 2.2)) continue;
    if (side > 0 && z > -13 && z < 9) continue;      // (none over the camera; the one ahead of you is placed below)
    TREES.push({ x: side * TREE_X + (R() - 0.5) * 0.2, z, h: 5.6 + R() * 2.0, r: 1.5 + R() * 0.45, seed: R() });
  }

}

// ---- parked cars (nose to tail along both curbs) and the traffic (one lane each way) ----
export const PARKED = [], MOVING = [];
{
  const R = rng(6161);
  const LEN = [4.5, 4.0, 4.6, 4.9];
  for (const side of [-1, 1]) {
    let z = 34;
    while (z > -330) {
      if (Math.abs(z - CZ) < CW + 4) { z = CZ - CW - 4; continue; }
      const kind = [0, 1, 2, 2, 3, 0, 1][Math.floor(R() * 7)], len = LEN[kind];
      if (R() < 0.12) { z -= 6 + R() * 4; continue; }
      // (your gap: from just behind the camera to 1.6 m in front of you; the car ahead of you is a red hatchback)
      if (side > 0 && z > -1.6 && z - len < 6) { z = -1.6; continue; }
      const hero = side > 0 && Math.abs(z + 1.6) < 0.01;
      PARKED.push({ x: side * 4.75 + (R() - 0.5) * 0.12, z: z - len / 2, kind: hero ? 1 : kind, yaw: side > 0 ? Math.PI : 0, side, hero });
      z -= (hero ? 4.0 : len) + 0.9 + R() * 1.5;
    }
  }
  for (const [x, dir] of [[1.7, -1], [-1.7, 1]]) {
    for (let z = 26 - R() * 6; z > -290; z -= 13 + R() * 14) {
      if (Math.abs(z - CZ) < CW + 3) continue;
      const kind = [0, 1, 2, 2, 3, 0][Math.floor(R() * 6)];
      MOVING.push({ x, z0: z, dir, kind, speed: 4.0 + R() * 1.4, side: Math.sign(x) });
    }
  }
}
