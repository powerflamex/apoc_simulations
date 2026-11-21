// Where everything stands (metres; x east, y up, z south). A made-up shopping street on a sunny afternoon, running
// north-south: two lanes and a parking lane each side (the road 9 m wide), 3 m sidewalks with trees, shops in the
// ground floors of 4- to 8-storey blocks. You walk up the middle of it (timeline.js WALK_V, PATH_X), away from the
// camera, which follows behind your shoulder. On your way, in order: your friend with her ice cream (frame 0), people
// in the street, a hot dog cart (z -9.6), a bus stopped in the oncoming lane (z -14 to -26), a plaza with a fountain on
// the right (z -29), a gas station on the left (z -41), and at the end of the street, across the cross street (z -62),
// a glass tower. Beyond: the city, and towers on the horizon 1-9 km off. Buildings within ~170 m get a fine mesh so
// they can sag and pour.
import { rng } from './util.js';

export const RW = 4.5, WALK = 3, FX = RW + WALK;            // road half-width, sidewalk width, building fronts (|x|)
export const CZ = -62, CW = 7;                              // the cross street at the end
export const CAM = { x: 0.62, y: 1.55, z: 2.55 };            // the camera at frame 0: behind your right shoulder
export const FRIEND = { x: -0.52, z: -0.55 };               // your friend with the ice cream, on your left
export const LANES = [-1.4, 1.4], PARK = [-3.6, 3.6];
export const LAMP_X = 4.8, TREE_X = 5.15;
export const NEAR_R = 170;
// the things in your path
export const CART = { x: 3.3, z: -9.6 };                    // hot dog cart, in a gap in the parking lane on the right
export const BUS = { x: -1.45, z: -20.5, len: 12, w: 2.55, h: 3.1 };   // stopped in the oncoming lane, on your left
export const PLAZA = { x0: FX, x1: 21, z0: -37, z1: -21 };  // the plaza on the right, its fountain
export const FOUNTAIN = { x: 3.35, z: -30, r: 1.8 };      // on a little island just right of your path
export const STATION = { x0: -23, x1: -7, z0: -88, z1: -72, cx: -15, cz: -80 };   // the gas station across the cross street, left
export const TOWER = { x: 8, z: -92, w: 28, d: 30, h: 165 };     // the glass tower at the end of the street

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col, colW, near } ----
// kind 0: stone/stucco offices, 1: glass, 2: older brick block, 3: far city, 4: tall glass towers
export const BLD = [];
{
  const R = rng(5151);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xe2cfae, 0xc0906a, 0xeee4d2, 0xa66a4e, 0xd9b98c, 0xf0e8da, 0x9c5f45, 0xcbbfae, 0xe4c79a, 0xb39c84, 0xc4744f, 0x98aebd, 0x857a70, 0xd49a62];
  const TOWERC = [0x6a8cae, 0x84a2c0, 0x5a7ca6, 0x95aec6, 0x7494b2, 0x547290];
  const add = (x, z, w, d, h, kind, col) => {
    const b = { x, y: 0, z, w, d, h, kind, col: col ?? (kind === 1 || kind === 4 ? pick(TOWERC) : pick(COLS)) };
    b.colW = kind === 1 || kind === 4 ? 1.7 : kind === 2 ? 3.1 : 2.4 + 0.5 * R();
    BLD.push(b);
    return b;
  };
  const kindOf = () => (R() < 0.16 ? 1 : R() < 0.5 ? 2 : 0);
  // the two street walls, from behind the camera to the cross street (gaps for the plaza and the gas station)
  for (const side of [-1, 1]) {
    const gap = side > 0 ? [PLAZA.z1, PLAZA.z0] : [1e9, 1e9];
    const zB = CZ + CW + WALK;
    let z = 70;
    while (z > zB + 3) {
      if (z <= gap[0] + 0.01 && z > gap[1]) { z = gap[1]; continue; }
      let d = Math.min(11 + R() * 13, z - zB);
      if (z - d - zB < 7) d = z - zB;
      if (z > gap[0] && z - d < gap[0]) d = z - gap[0];
      const w = 18 + R() * 12, zc = z - d / 2;
      add(side * (FX + w / 2), zc, w, d - 0.5, 15 + R() * 15, kindOf());
      z -= d;
    }
  }
  // behind the plaza and the gas station: blocks set back
  add(PLAZA.x1 + 12, (PLAZA.z0 + PLAZA.z1) / 2, 24, PLAZA.z1 - PLAZA.z0 + 4, 26, 0);
  add(STATION.x0 - 12, (STATION.z0 + STATION.z1) / 2, 22, STATION.z1 - STATION.z0, 20, 2);
  // the cross street's walls, both ways, and the glass tower closing the end of the street
  for (const side of [-1, 1]) {
    for (let x = side > 0 ? TOWER.x + TOWER.w / 2 + 1 : -STATION.x0 + 24; x < 260;) {
      const w = 16 + R() * 16, d = 24 + R() * 12;
      add(side * (x + w / 2), CZ - CW - WALK - d / 2, w - 0.5, d, 30 + R() * 50, R() < 0.5 ? 1 : kindOf());
      x += w;
    }
    for (let x = FX + 0.5; x < 260;) {
      const w = 14 + R() * 16, d = 22 + R() * 12;
      add(side * (x + w / 2 + 18), CZ + CW + WALK + d / 2, w - 0.5, d, 18 + R() * 24, kindOf());
      x += w;
    }
  }
  const tower = add(TOWER.x, TOWER.z, TOWER.w, TOWER.d, TOWER.h, 1, 0x6f93b8);
  tower.tower = true;
  // the city behind the street walls, taller further off
  for (let i = 0; i < 520; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (40 + R() * 520), z = 160 - R() * 900;
    const far = Math.abs(x) > 160 || z < -260;
    add(x, z, 22 + R() * 26, 22 + R() * 26, (far ? 40 : 26) + R() * (far ? 90 : 40) + (R() < 0.15 ? 60 + R() * 110 : 0), R() < 0.35 ? 4 : 3);
  }
  for (let i = 0; i < 150; i++) {
    const x = (R() - 0.5) * 760, z = -150 - R() * 950;
    add(x, z, 30 + R() * 30, 30 + R() * 30, 70 + R() * 150 + (R() < 0.2 ? 80 + R() * 100 : 0), R() < 0.6 ? 4 : 3);
  }
  // towers on the horizon, 1.2-9 km off, ahead of you (they go one by one as the heat sweeps out at 1,000x+)
  for (let i = 0; i < 46; i++) {
    const a = (R() - 0.5) * 1.5, r = 1200 + Math.pow(R(), 1.3) * 7800;
    add(Math.sin(a) * r, -Math.cos(a) * r, 60 + R() * 60, 60 + R() * 60, 180 + R() * 320, 4).horizon = true;
  }
  // (no back block cutting into another, the street, the plaza, the lot, the cross street or the tower)
  const fixed = BLD.filter((b) => b.kind < 3 || b.tower);
  for (let i = BLD.length - 1; i >= 0; i--) {
    const b = BLD[i];
    if (b.kind < 3 || b.tower || b.horizon) continue;
    if (fixed.some((a) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 2)) BLD.splice(i, 1);
    else if (Math.abs(b.x) - b.w / 2 < 26 && b.z + b.d / 2 > CZ - 40) BLD.splice(i, 1);
    else if (b.x + b.w / 2 > STATION.x0 - 2 && b.x - b.w / 2 < STATION.x1 + 2 && b.z + b.d / 2 > STATION.z0 - 2 && b.z - b.d / 2 < STATION.z1 + 2) BLD.splice(i, 1);
    else if (Math.abs(b.z - CZ) - b.d / 2 < CW + WALK + 2) BLD.splice(i, 1);
  }
  for (const b of BLD) {
    // (distance from your walk: a line up the middle from z 0 to z -65)
    const dx = Math.max(Math.abs(b.x) - b.w / 2, 0), dz = Math.max(b.z - b.d / 2, -65 - (b.z + b.d / 2), 0);
    b.dist = Math.hypot(dx, dz);
    b.near = b.dist < NEAR_R && !b.horizon;
  }
}

// ---- shop signs and awnings on the street walls ----
export const SIGNS = [], AWNINGS = [];
{
  const R = rng(4478);
  const AW = [0xc8302a, 0x2a6a4a, 0x2a3a7a, 0xe0a020, 0x6a2a5a, 0xd05a20, 0x1f6f8a];
  const gap = (side, z) => (side > 0 ? z < PLAZA.z1 + 1 && z > PLAZA.z0 - 1 : false);
  for (const side of [-1, 1]) for (let z = 50; z > CZ + CW + WALK + 2; z -= 5 + R() * 5) {
    if (gap(side, z)) continue;
    if (side > 0 && z > -14 && z < -2) continue;      // (the ice cream parlour)
    const r = R();
    if (r < 0.42) SIGNS.push({ x: side * (FX - 0.06), y: 4.35, z, w: 3.4 + R() * 2.2, h: 0.85, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: 1 + Math.floor(R() * 7), side });
    else if (r < 0.88) AWNINGS.push({ x: side * (FX - 0.02), z, w: 2.6 + R() * 1.6, side, col: AW[Math.floor(R() * AW.length)] });
  }
  // the ice cream parlour you two just came out of, on the right just ahead (pink awning, its sign)
  AWNINGS.push({ x: FX - 0.02, z: -8.5, w: 7.5, side: 1, col: 0xd84a7a, out: 1.9 });
  SIGNS.push({ x: FX - 0.06, y: 4.75, z: -3.6, w: 4.4, h: 0.85, yaw: -Math.PI / 2, cell: 0, side: 1 });
}

// ---- street furniture ----
export const LAMPS = [];
for (const side of [-1, 1]) for (let z = 40 + (side > 0 ? 0 : 11); z > CZ + CW + 2; z -= 22) {
  if (side > 0 && z < PLAZA.z1 + 1 && z > PLAZA.z0 - 1) continue;
  if (side < 0 && z < STATION.z1 + 1 && z > STATION.z0 - 1) continue;
  LAMPS.push({ x: side * LAMP_X, z, dir: -side });
}
export const TREES = [];
{
  const R = rng(3031);
  for (const side of [-1, 1]) for (let z = 34 + R() * 4; z > CZ + CW + 3; z -= 8 + R() * 3) {
    if (LAMPS.some((l) => Math.sign(l.x) === side && Math.abs(l.z - z) < 2.2)) continue;
    if (side > 0 && z < PLAZA.z1 + 1 && z > PLAZA.z0 - 1) continue;
    TREES.push({ x: side * TREE_X + (R() - 0.5) * 0.15, z, h: 5.4 + R() * 1.8, r: 1.4 + R() * 0.4, seed: R() });
  }
  // a few round the fountain
  for (const [x, z] of [[15.5, -23.5], [17.5, -34], [8.6, -35.5]]) TREES.push({ x, z, h: 6.2, r: 1.7, seed: R() });
}

// ---- parked cars (nose to tail along both curbs; gaps for the cart and the lot's driveway) and the stopped traffic ----
export const PARKED = [], MOVING = [];
{
  const R = rng(6162);
  const LEN = [4.5, 4.0, 4.6, 4.9];
  for (const side of [-1, 1]) {
    let z = 36;
    while (z > CZ + CW + 4) {
      const kind = [0, 1, 2, 2, 3, 0, 1][Math.floor(R() * 7)], len = LEN[kind];
      const zc = z - len / 2;
      const skip = (side > 0 && Math.abs(zc - CART.z) < 4.2) || (side > 0 && Math.abs(zc - FOUNTAIN.z) < 5.5) || R() < 0.1;
      if (!skip) PARKED.push({ x: side * PARK[1] + (R() - 0.5) * 0.1, z: zc, kind, yaw: side > 0 ? Math.PI : 0, side });
      z -= len + 0.9 + R() * 1.4;
    }
  }
  // the oncoming lane (left) is backed up behind the bus; your lane ahead is clear
  for (const z of [-30.5, -37.5, -44.5]) PARKED.push({ x: LANES[0], z, kind: [0, 2, 1][Math.floor(R() * 3)], yaw: Math.PI, side: -1 });
  for (const z of [3.5, 10]) PARKED.push({ x: LANES[0], z, kind: 0, yaw: Math.PI, side: -1 });
}
