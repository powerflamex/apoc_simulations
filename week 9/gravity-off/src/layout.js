// Where everything stands (metres; x east, y up, z south). A made-up city square on a sunny November afternoon:
// a big round fountain in the middle (you on its south ledge), a basketball court to the east, a two-way street with
// parked cars along the west side, a six-storey block on the north side with a glass-walled pool on its roof facing the
// square, three- and four-storey shops round the rest, towers beyond. Autumn trees, lamp posts, benches and festoon
// lights over the north half.
import { rng } from './util.js';

// ---- the fountain ----
export const BASIN = { rIn: 7.0, rOut: 7.5, ledge: 0.45, floor: -0.25, water: 0.15 };
export const PED = { r: 1.3, h: 1.25 };                     // the centre pedestal (two tiers), the big jet's nozzle on top
export const JET0 = { x: 0, y: 1.32, z: 0, v: 13.0, r: 0.07 };                 // the central jet (straight up)
// the ring of jets: on the basin floor at radius 3.2, aimed out and up (a tulip), landing ~2.8 m further out
export const RING = Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * Math.PI * 2 + 0.16; return { a, x: Math.cos(a) * 3.2, z: Math.sin(a) * 3.2, y: 0.18, v: 6.6, el: 70 * Math.PI / 180, r: 0.042 }; });

// ---- the square ----
export const SQ = { x0: -17.5, x1: 31, z0: -27, z1: 27 };
export const ROAD = { x0: -30, x1: -20.3, laneN: -24.75, laneS: -28.25, park: -21.6, curb: -20.3, walkW: -33 };
// a side street joining the west street from the west (the crossing the cars slide across)
export const SIDE = { z0: -9.5, z1: -2.5 };
export const COURT = { x0: 13, x1: 28, z0: -14, z1: 14, hoopX: 20.5, rimZ: 12.4, boardZ: 12.8, rimY: 3.05 };

// ---- the pool block (north side) ----
export const POOLB = { x0: -16, x1: 16, z0: -46, z1: -30, h: 21.5 };
export const POOL = { x0: -6, x1: 6, z0: -35.6, z1: -30.6, floor: 21.5, depth: 1.35, wall: 1.5 };

// ---- buildings: { x, z, w (x), d (z), h, kind, col } kind 0 offices/stone, 1 glass, 2 brick, 3 far ----
export const BLD = [];
{
  const R = rng(4242);
  const COLS = [0xc9b79a, 0xb08468, 0xe0d6c4, 0x9a6a52, 0xcfb08a, 0xe8e0d0, 0x8a5a44, 0xbfb4a4, 0xd8bf94, 0xa79580, 0xb86a50, 0xc28a5a, 0xd9c7a8, 0x9c7b62];
  const TOWER = [0x5f7fa0, 0x7896b4, 0x50709a, 0x8aa4bc, 0x6888a8, 0x4a6680];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (x, z, w, d, h, kind, col) => {
    const b = { x, z, w, d, h, kind, col: col ?? (kind === 1 || kind === 3 && R() < 0.5 ? pick(TOWER) : pick(COLS)) };
    b.colW = kind === 1 ? 1.7 : kind === 2 ? 3.1 : 2.4 + 0.5 * R();
    BLD.push(b); return b;
  };
  // the pool block (pale stone, six floors) and its neighbours on the north side
  add(0, (POOLB.z0 + POOLB.z1) / 2, POOLB.x1 - POOLB.x0, POOLB.z1 - POOLB.z0, POOLB.h, 0, 0xe4dccb).pool = true;
  add(-27, -39, 21.5, 18, 15.5, 2); add(28.5, -40, 24.5, 20, 17.5, 0);
  // east, behind the court: a row of 3-4 storey blocks
  for (let z = -30; z < 34;) { const d = 9 + R() * 7; add(41, z + d / 2, 18, d - 0.4, 11.5 + R() * 4.5, R() < 0.5 ? 2 : 0); z += d; }
  // south: shops, 3 storeys
  for (let x = -33; x < 44;) { const w = 9 + R() * 8; add(x + w / 2, 38.5, w - 0.4, 15, 10.5 + R() * 3.5, R() < 0.55 ? 2 : 0); x += w; }
  // west, across the street
  for (let z = -30; z < 34;) { const d = 9 + R() * 8; if (z + d > SIDE.z0 - 0.5 && z < SIDE.z1 + 0.5) { z = SIDE.z1 + 0.5; continue; } add(-42, z + d / 2, 18, d - 0.4, 11 + R() * 5, R() < 0.5 ? 2 : 0); z += d; }
  // the city beyond: taller, further off, in every direction (kept out of the square, the street and the near rows)
  const nNear = BLD.length;
  for (let i = 0; i < 300; i++) {
    const a = R() * Math.PI * 2, r = 70 + R() * 520;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const tall = R() < 0.3;
    const w = 18 + R() * 26, d = 18 + R() * 26, h = (r < 140 ? 18 : 28) + R() * (tall ? 110 : 40) + (tall && r > 200 ? 60 : 0);
    if (Math.abs(x) - w / 2 < 53 && Math.abs(z) - d / 2 < 49) continue;
    if (x < 0 && z + d / 2 > SIDE.z0 - 1 && z - d / 2 < SIDE.z1 + 1) continue;
    if (z < 0 && Math.abs(Math.atan2(x, -z)) < 0.75 && r < 340 && h > 34) continue;
    if (BLD.slice(0, nNear).some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 2 && Math.abs(b.z - z) < (b.d + d) / 2 + 2)) continue;
    add(x, z, w, d, h, tall ? 1 : 3);
  }
}

// ---- trees (autumn: orange, yellow, rust), lamp posts, benches ----
export const TREES = [];
{
  const R = rng(31);
  const put = (x, z) => TREES.push({ x, z, h: 3.0 + R() * 0.8, r: 2.3 + R() * 0.8, col: [0xd8821c, 0xe0a828, 0xb8521c, 0xc8a030, 0xd06a20][Math.floor(R() * 5)], seed: R() });
  for (const x of [-12, -4.5, 4.5, 12]) put(x, -21.5);
  for (const z of [-15, -5, 5, 15]) put(-15.2, z);
  for (const x of [-11, -3, 7]) put(x, 21.5);
  for (const z of [-21, 21]) put(31.5 - 1, z);
  // the big tree the kid falls into (a broad crown)
  TREES.push({ x: 8.0, z: 13.5, h: 3.4, r: 3.1, col: 0xd8821c, seed: 0.37, kid: true });
}
export const LAMPS = [];
for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; LAMPS.push({ x: Math.cos(a) * 12.5, z: Math.sin(a) * 12.5 }); }
for (const z of [-24, -8, 8, 24]) LAMPS.push({ x: -18.5, z });
export const BENCHES = [];
for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; BENCHES.push({ x: Math.cos(a) * 10.4, z: Math.sin(a) * 10.4, yaw: -a - Math.PI / 2 }); }

// ---- festoon lights: [x0, z0, x1, z1, height, sag] ----
export const STRINGS = [[-14.5, -12, 12.5, -12, 6.2, 0.6], [-14.5, -18.5, 12.5, -18.5, 6.4, 0.6], [-12, -18.5, -12, 16, 6.0, 0.75], [10.5, -18.5, 10.5, 16, 6.0, 0.75]];
export const MASTS = [];
for (const s of STRINGS) for (const [x, z] of [[s[0], s[1]], [s[2], s[3]]]) if (!MASTS.some((m) => Math.hypot(m.x - x, m.z - z) < 0.5)) MASTS.push({ x, z, h: 6.6 });

// ---- the camera's frame-0 spot: 3 m in front of you, a little above your eyes ----
export const CAM0 = { x: 0.55, y: 2.15, z: 10.35 };
