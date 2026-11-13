// Where everything stands (metres; x to your right, y up, z toward you: the camera looks along -z, out over the harbour).
// An unnamed made-up waterfront at night. You stand on a wide stone promenade with a packed crowd between you and the
// railing at the quay's edge (12 m ahead). On your left a covered pier runs out into the water (a long roof on posts,
// lamps under it). On your right the land runs on out as a jetty: a walkway along the water, a quay street with cars
// parked along it, and a row of lit restaurants and a hotel facing the water. Ahead, across 1.5 km of harbour, the
// downtown skyline. Behind the far shore and above it all, the sky, with the radiant (the point the meteors stream from)
// high up ahead of you.
import { rng } from './util.js';

export const EYE = 1.66;
export const CAM0 = { x: 0, z: 0 };
export const QZ = -12;                    // the quay's edge (water beyond, for x < JX)
export const JX = 9.7;                    // the jetty's west edge (land for x > JX up to JZ)
export const JZ = -70;                    // the jetty's end
export const WATER_Y = -1.6;
export const ROAD = [13.0, 20.0];         // the quay street (x range), running out along the jetty
export const FX = 24.0;                   // the restaurant fronts (facing west)
export const PIER = { x0: -26, x1: -14, z0: QZ, z1: -112, roofZ1: -64, roofY: 4.6 };
export const isWater = (x, z) => z < QZ && !(x > JX && z > JZ) && !(x > PIER.x0 && x < PIER.x1);
export const groundY = () => 0;

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone and concrete (punched windows), 1: glass, 2: older brick (small windows, cornices), 3: far city, 4: towers
export const BLD = [];
{
  const R = rng(1833);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xb8a888, 0xa98a6e, 0xc6bcab, 0x99786a, 0xb2946c, 0xcfc6b6, 0x8f5f4c, 0xafa494, 0xc2a77a, 0x978570, 0xb87f5a, 0x8f9fae];
  const TOWER = [0x5f7f9f, 0x7896b4, 0x4f6f94, 0x8ca4bc, 0x6888a8, 0x9aa8b8];
  const add = (x, z, w, d, h, kind, col, y = -0.5) => BLD.push({ x, y, z, w, d, h: h + 0.5, kind, col: col ?? pick(COLS) });
  // the waterfront row on the jetty (fronts at x = FX, facing you and the water)
  for (let z = 26; z > JZ + 8;) {
    const d = 12 + R() * 10, zc = z - d / 2;
    add(FX + 9, zc, 18, d - 0.4, 12 + R() * 14, R() < 0.25 ? 1 : R() < 0.55 ? 2 : 0);
    z -= d;
  }
  add(FX + 12, JZ + 14, 24, 18, 34, 1, 0x7f96aa);                       // the hotel at the jetty's end
  // the skyline across the harbour: towers in the middle, lower city to the sides, all lit
  for (let i = 0; i < 260; i++) {
    const zz = -1750 - Math.pow(R(), 0.9) * 1200, x = (R() - 0.5) * 2 * (500 + R() * 1500);
    const core = Math.exp(-Math.pow((x - 120) / 650, 2));
    const tall = R() < 0.25 + 0.55 * core;
    const h = tall ? 80 + R() * (110 + 190 * core) : 25 + R() * 45;
    add(x, zz, 28 + R() * 34, 28 + R() * 34, h, tall ? 4 : R() < 0.5 ? 1 : 3, tall || R() < 0.4 ? pick(TOWER) : undefined);
  }
  // the low waterfront of the far shore
  for (let x = -2400; x < 2400;) { const w = 30 + R() * 40; add(x + w / 2, -1720, w - 2, 30, 12 + R() * 20, R() < 0.5 ? 3 : 2); x += w; }
  // the west shore curving round on your far left (lit blocks along the water)
  for (let i = 0; i < 70; i++) {
    const zz = -150 - R() * 1200, x = -520 - R() * 500 - (zz < -800 ? (zz + 800) * 0.3 : 0);
    add(x, zz, 30 + R() * 30, 30 + R() * 30, 20 + R() * 60, R() < 0.5 ? 3 : 0);
  }
  // behind the promenade on your left (seen past the pier)
  for (let x = -60; x > -460;) { const w = 18 + R() * 16; add(x - w / 2, 28 + R() * 6, w - 0.5, 20, 16 + R() * 26, R() < 0.3 ? 1 : 2); x -= w; }
}

// ---- lamps: on the promenade along the railing, along the jetty walkway, under the pier's roof ----
export const LAMPS = [];
for (let x = -150; x < 9; x += 16) if (!(x > PIER.x0 - 2 && x < PIER.x1 + 2)) LAMPS.push({ x, z: QZ + 0.6, h: 4.2 });
for (let z = QZ - 14; z > JZ + 4; z -= 16) LAMPS.push({ x: JX + 0.6, z, h: 4.2 });
for (let z = PIER.z0 - 6; z > PIER.roofZ1; z -= 9) LAMPS.push({ x: (PIER.x0 + PIER.x1) / 2, z, h: PIER.roofY - 0.35, roof: true });
for (let z = 22; z > JZ + 6; z -= 18) LAMPS.push({ x: ROAD[1] + 1.2, z, h: 6.5, street: true });
export const lampHead = (l) => ({ x: l.x, y: l.h, z: l.z });

// ---- parked cars along the quay street's west curb (facing out along the jetty) and its east curb (facing back) ----
export const PARKED = [];
{
  const R = rng(91);
  const COLS = [0x8a1c1c, 0x1c2a4a, 0xd8d8d4, 0x2a2a2e, 0x5a6a78, 0x9a8a6a, 0x16161a, 0xc0c4c8, 0x3a4a3a, 0xb06020];
  for (let z = 6; z > JZ + 8; z -= 5.6 + R() * 0.8) PARKED.push({ x: ROAD[0] + 1.15, z, yaw: 0, col: COLS[Math.floor(R() * COLS.length)], kind: Math.floor(R() * 3) });
  for (let z = 2; z > JZ + 10; z -= 5.8 + R() * 1.2) if (R() < 0.8) PARKED.push({ x: ROAD[1] - 1.15, z, yaw: Math.PI, col: COLS[Math.floor(R() * COLS.length)], kind: Math.floor(R() * 4) });
}
// the one that gets hit (0:22): the west-curb car nearest z = -21
export const HIT_CAR = PARKED.filter((c) => c.yaw === 0).reduce((a, b) => (Math.abs(b.z + 21) < Math.abs(a.z + 21) ? b : a));
HIT_CAR.col = 0xd8d8d4; HIT_CAR.kind = 0;

// ---- where the rocks come down ----
export const SPLASH = { x: 2.0, z: -74 };          // 0:17.5 into the harbour, ahead of you
export const radiant = { az: 4, el: 41 };          // degrees: az + = to your left of straight ahead
