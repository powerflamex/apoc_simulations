// Where everything stands (metres; x east, y up, z south). A made-up harbour city on a sunny afternoon: a wide tree-lined
// promenade (x -9..9) runs north down to the harbour, a one-way road each side of it (x 9..15, its outer 2.5 m a parking
// lane), sidewalks (15..18) and 5-8 storey blocks with shops (fronts at |x| = 18). You stand on the middle of the
// promenade at the origin, facing north (-z), in a packed crowd. Ahead: a fountain on your right, a cafe terrace on your
// left, a bike-share rack, a kiosk, a cross street (z -60), then the waterfront plaza and the quay (z -150), glass towers
// on both sides of it, a cruise ship at the quay, a container ship at anchor, a suspension bridge across the harbour
// (z -1,100) and hills on the far shore.
import { rng } from './util.js';

export const PROM = 9, ROAD = 15, WALK = 18;       // promenade half-width, road's outer edge, building fronts (|x|)
export const LANE_X = 10.9, PARK_X = 13.7;
export const CZ = -60, CW = 6;                       // the cross street (centre, half-width)
export const PLAZA_Z = -118, QUAY_Z = -150;          // the promenade ends; the quay edge (the water beyond, 1.6 m down)
export const WATER_Y = -1.6;
export const YOU = { x: 0, z: 0 };
export const FOUNTAIN = { x: 3.6, z: -13, r: 2.4 };   // (near you, on the right: from the high camera it shows under the counter)
export const KIOSK = { x: -1.6, z: -27, w: 2.6, d: 2.0, h: 2.7 };
export const BRIDGE = { z: -1100, y: 62, x0: -2600, x1: 2600, towers: [-430, 520], th: 190 };
export const NEAR_R = 220;

// ---- buildings: { x, z, w (along x), d (along z), h, kind, col, colW } ----
// kind 0: stone/stucco, 1: glass, 2: brick, 3: far city, 4: tall glass towers
export const BLD = [];
{
  const R = rng(7171);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xe2cfae, 0xc0906a, 0xeee4d2, 0xa66a4e, 0xd9b98c, 0xf0e8da, 0x9c5f45, 0xcbbfae, 0xe4c79a, 0xb39c84, 0xc4744f, 0x98aebd, 0xd49a62];
  const TOWERC = [0x6a8cae, 0x84a2c0, 0x5a7ca6, 0x95aec6, 0x7494b2, 0x547290];
  const add = (x, z, w, d, h, kind, col) => {
    const b = { x, y: 0, z, w, d, h, kind, col: col ?? (kind === 1 || kind === 4 ? pick(TOWERC) : pick(COLS)) };
    b.colW = kind === 1 || kind === 4 ? 1.7 : kind === 2 ? 3.1 : 2.4 + 0.5 * R();
    BLD.push(b);
    return b;
  };
  const kindOf = () => (R() < 0.18 ? 1 : R() < 0.5 ? 2 : 0);
  // the two street walls, from behind the camera to the plaza (a gap for the cross street)
  for (const side of [-1, 1]) {
    let z = 80;
    while (z > PLAZA_Z + 4) {
      if (z > CZ - CW && z <= CZ + CW + 0.01) { z = CZ - CW; continue; }
      let d = Math.min(12 + R() * 12, z - PLAZA_Z);
      if (z > CZ + CW && z - d < CZ + CW) d = z - (CZ + CW);
      if (z - d - PLAZA_Z < 7) d = z - PLAZA_Z;
      const w = 16 + R() * 10;
      add(side * (WALK + w / 2), z - d / 2, w, d - 0.4, 18 + R() * 14, kindOf()).street = true;
      z -= d;
    }
  }
  // glass towers round the waterfront plaza, both sides, out on the quays
  for (const [x, z, w, d, h] of [[-46, -132, 30, 34, 168], [-92, -150, 34, 30, 124], [48, -136, 32, 30, 186], [96, -128, 28, 34, 140], [-58, -86, 26, 26, 112], [64, -84, 28, 26, 132]]) {
    add(x, z, w, d, h, 4).tower = true;
  }
  // the city behind the street walls
  for (let i = 0; i < 420; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (48 + R() * 520), z = 200 - R() * 330;
    add(x, z, 20 + R() * 24, 20 + R() * 24, 24 + R() * 50 + (R() < 0.15 ? 50 + R() * 90 : 0), R() < 0.3 ? 4 : 3);
  }
  // the far shore: a low city along the water and towers, 2.4-3.5 km off
  for (let i = 0; i < 160; i++) {
    const x = (R() - 0.5) * 5600, z = -2450 - R() * 900;
    add(x, z, 30 + R() * 50, 30 + R() * 50, 18 + R() * 60 + (R() < 0.15 ? 60 + R() * 120 : 0), R() < 0.4 ? 4 : 3).far = true;
  }
  // (no back block cutting into another, the street, the cross street or the plaza)
  const fixed = BLD.filter((b) => b.street || b.tower);
  for (let i = BLD.length - 1; i >= 0; i--) {
    const b = BLD[i];
    if (b.street || b.tower || b.far) continue;
    if (fixed.some((a) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 2)) BLD.splice(i, 1);
    else if (Math.abs(b.x) - b.w / 2 < 44) BLD.splice(i, 1);
    else if (b.z - b.d / 2 < PLAZA_Z - 6) BLD.splice(i, 1);
    else if (Math.abs(b.z - CZ) - b.d / 2 < CW + 2) BLD.splice(i, 1);
  }
  for (const b of BLD) {
    const dx = Math.max(Math.abs(b.x) - b.w / 2, 0), dz = Math.max(Math.abs(b.z) - b.d / 2, 0);
    b.dist = Math.hypot(dx, dz);
    b.near = b.dist < NEAR_R && !b.far;
    b.i = BLD.indexOf(b);
  }
}

// ---- the promenade's furniture ----
export const TREES = [], LAMPS = [], BENCHES = [];
{
  const R = rng(3031);
  for (const side of [-1, 1]) for (let z = 46; z > PLAZA_Z + 4; z -= 8.5) {
    if (Math.abs(z - CZ) < CW + 1) continue;
    TREES.push({ x: side * 7.4 + (R() - 0.5) * 0.2, z: z + (R() - 0.5) * 0.6, h: 9 + R() * 2.5, r: 2.6 + R() * 0.6, seed: R() });
  }
  for (const side of [-1, 1]) for (let z = 50 + (side > 0 ? 4 : 0); z > PLAZA_Z; z -= 17) {
    if (Math.abs(z - CZ) < CW + 1) continue;
    LAMPS.push({ x: side * 8.2, z, h: 5.2 });
  }
  for (const side of [-1, 1]) for (let z = 30; z > PLAZA_Z + 10; z -= 21) BENCHES.push({ x: side * 6.0, z: z - 4, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
}
export const CAFE = [];      // tables with two chairs each (steel), on your left
{
  for (const [x, z] of [[-4.4, -3.2], [-6.2, -5.4], [-4.0, -7.4], [-6.0, -9.6], [-4.3, -11.6], [-6.3, -13.6]]) CAFE.push({ x, z });
}
export const BIKES = [];     // the bike-share rack on your right, and a few leaning on things
{
  for (let k = 0; k < 7; k++) BIKES.push({ x: 7.0, z: -3.0 - k * 0.85, yaw: Math.PI / 2, rack: true });
  BIKES.push({ x: -6.6, z: -15.6, yaw: 0.4 }, { x: 3.2, z: -21.2, yaw: -0.9 }, { x: -7.2, z: -23.5, yaw: 2.3 }, { x: 1.8, z: -6.2, yaw: 1.2 }, { x: 10.6, z: -31, yaw: 0 });
}
export const ASIGNS = [];    // steel A-frame menu boards and the kiosk's signs, street signs on poles
{
  for (const [x, z, yaw] of [[-3.2, -2.2, 0.3], [-2.4, -12.8, -0.2], [2.2, -9.8, 0.5], [-6.9, -26.5, 0.1], [5.8, -24.5, -0.4], [-6.8, -26, 0.8]]) ASIGNS.push({ x, z, yaw, kind: 0 });
  ASIGNS.push({ x: KIOSK.x, z: KIOSK.z + KIOSK.d / 2 + 0.05, yaw: 0, kind: 1 }, { x: KIOSK.x - KIOSK.w / 2 - 0.05, z: KIOSK.z, yaw: -Math.PI / 2, kind: 1 });
  for (const [x, z] of [[8.6, -8], [-8.6, -15], [8.6, -38], [-8.6, -44]]) ASIGNS.push({ x, z, yaw: x > 0 ? -Math.PI / 2 : Math.PI / 2, kind: 2 });
}
export const CARTS = [];     // a corral of shopping carts outside the supermarket across the road, on the right
{
  for (let k = 0; k < 6; k++) CARTS.push({ x: 16.2, z: -4.5 - k * 0.55, yaw: Math.PI / 2 });
  CARTS.push({ x: 15.9, z: -10.5, yaw: 2.6 }, { x: -3.0, z: -24.5, yaw: 0.7 });
}
export const COVERS = [[2.3, -5.4], [-2.8, -10.2], [10.9, -6.5], [-11.2, -12.5], [0.6, -19.8], [11.6, -22.5], [-5.6, -30.5], [3.2, -36], [-10.6, -38]].map(([x, z]) => ({ x, z }));
export const BINS = [[-8.4, -6.5], [8.4, -18.5], [-8.4, -33]].map(([x, z]) => ({ x, z }));
export const RAILS = [];     // steel bollards along both edges of the promenade
for (const side of [-1, 1]) for (let z = 8; z > -56; z -= 2.6) if (!LAMPS.some((l) => Math.abs(l.z - z) < 0.8 && Math.sign(l.x) === side)) RAILS.push({ x: side * 9.15, z });

// ---- parked cars (the outer lanes), stopped traffic, the bus ----
export const CARS = [];
{
  const R = rng(6162);
  const LEN = [4.5, 4.0, 4.6, 4.9];
  for (const side of [-1, 1]) {
    let z = 26;
    while (z > PLAZA_Z + 8) {
      const kind = [0, 1, 2, 2, 3, 0, 1][Math.floor(R() * 7)], len = LEN[kind];
      const zc = z - len / 2;
      const skip = Math.abs(zc - CZ) < CW + 2.5 || R() < 0.08 || (side > 0 && zc < -9 && zc > -21);
      if (!skip) CARS.push({ x: side * PARK_X + (R() - 0.5) * 0.1, z: zc, kind, yaw: side > 0 ? Math.PI : 0, side, parked: true });
      z -= len + 0.9 + R() * 1.4;
    }
  }
  // the stopped traffic in the lanes (one way each side: north on the right, south on the left)
  for (const [x, z] of [[LANE_X, 8], [LANE_X, -26], [LANE_X, -33], [LANE_X, -41], [-LANE_X, 4], [-LANE_X, -3.5], [-LANE_X, -11], [-LANE_X, -19], [-LANE_X, -27], [-LANE_X, -45]]) {
    CARS.push({ x, z, kind: Math.floor(R() * 4), yaw: x > 0 ? 0 : Math.PI, side: Math.sign(x), parked: false });
  }
}
export const BUS = { x: LANE_X, z: -15.5, len: 12, w: 2.55, h: 3.1 };

// ---- the harbour ----
export const SHIPS = [
  // kind 0 cruise ship, 1 container ship, 2 tug, 3 yacht. x, z: centre; len, beam; yaw 0 = along x
  { kind: 0, x: 120, z: -182, len: 290, beam: 36, h: 52, yaw: 0 },
  { kind: 1, x: -190, z: -470, len: 230, beam: 32, h: 30, yaw: 0.12 },
  { kind: 2, x: -36, z: -205, len: 28, beam: 9, h: 10, yaw: 0.6 },
  { kind: 2, x: -14, z: -260, len: 26, beam: 9, h: 9, yaw: -0.4 },
  { kind: 3, x: -70, z: -168, len: 20, beam: 6, h: 6, yaw: 1.5 },
  { kind: 3, x: -80, z: -172, len: 18, beam: 5.5, h: 5, yaw: 1.55 },
  { kind: 3, x: -90, z: -170, len: 22, beam: 6, h: 6, yaw: 1.5 },
  { kind: 3, x: 26, z: -320, len: 16, beam: 5, h: 5, yaw: 0.3 },
];
// the people's places that must stay clear (for people.js)
export const SOLID = [
  ...TREES.map((t) => [t.x, t.z, 0.7]), ...LAMPS.map((l) => [l.x, l.z, 0.45]), [FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r + 0.5],
  [KIOSK.x, KIOSK.z, 2.0], ...CAFE.map((c) => [c.x, c.z, 1.0]), ...BIKES.map((b) => [b.x, b.z, 0.9]), ...BENCHES.map((b) => [b.x, b.z, 1.0]),
  ...ASIGNS.filter((a) => a.kind === 0).map((a) => [a.x, a.z, 0.6]), ...BINS.map((b) => [b.x, b.z, 0.5]), [CARTS[7].x, CARTS[7].z, 0.8],
];
