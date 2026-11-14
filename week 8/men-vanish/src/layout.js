// Where everything stands (metres; x east, y up, z south). A made-up American downtown at rush hour. A north-south
// avenue (two lanes each way) crosses an east-west street at the corner where you stand: the south-east corner,
// looking north-west across the crosswalk into the intersection. On the north-west corner a tower is going up: a
// concrete frame ten floors high and a tower crane whose jib reaches out over the intersection. A block and a half up
// the avenue an elevated highway crosses on concrete piers. Beyond it the downtown towers; the low Sun stands at the
// west end of the cross street.
import { rng } from './util.js';

export const AV = 8, WALK = 6, FX = AV + WALK;             // avenue road half-width, sidewalk width, building fronts
export const CZ = -18, CR = 7, FZ = CR + WALK;             // the cross street's centre line, road half-width, fronts
export const CAM0 = { x: -11.0, z: -3.4 };                 // you: on the south-west corner (the low Sun behind you)
export const EYE = 1.62;
export const LANES_NB = [2.0, 5.6], LANES_SB = [-2.0, -5.6];          // avenue lanes (x): north-bound on the east side
export const LANES_EB = [CZ + 1.8, CZ + 5.4], LANES_WB = [CZ - 1.8, CZ - 5.4];   // cross street lanes (z)
export const XWALK_S = [CZ + CR + 1.0, CZ + CR + 5.0];                // crosswalk over the avenue, south side (z range)
export const XWALK_N = [CZ - CR - 5.0, CZ - CR - 1.0];
export const STOP_NB = XWALK_S[1] + 1.2, STOP_SB = XWALK_N[0] - 1.2;   // stop lines (front bumpers), just short of the crosswalks
// the elevated highway
export const HWY = { z: -150, w: 17, y: 7.6, t: 1.3 };
export const HWY_LANES = [-155.6, -152.2, -147.8, -144.4];   // (west-bound on the north half)
// the construction site on the north-west corner and its crane
export const SITE = { x0: -54, x1: -FX - 0.5, z0: -76, z1: CZ - FZ - 0.5 };
export const FRAME = { x0: -52, x1: -20, z0: -70, z1: -36, floors: 10, fh: 3.6 };
export const CRANE = { x: -28, z: -63, h: 64, jib: 58, cjib: 16 };

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone/concrete offices, 1: glass tower, 2: older brick block (cornices), 3: the far city, 4: tall glass towers
export const BLD = [];
{
  const R = rng(5150);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xc9b79a, 0xb08468, 0xe0d6c4, 0x9a6a52, 0xcfb08a, 0xe8e0d0, 0x8a5a44, 0xbfb4a4, 0xd8bf94, 0xa79580, 0xb86a50, 0x8fa3b2, 0x7a7068];
  const TOWER = [0x5f7fa0, 0x7896b4, 0x50709a, 0x8aa4bc, 0x6888a8, 0x4a6680];
  const add = (x, z, w, d, h, kind, col) => BLD.push({ x, y: -0.3, z, w, d, h: h + 0.3, kind, col: col ?? (kind === 1 || kind === 4 ? pick(TOWER) : pick(COLS)) });
  const kindOf = () => (R() < 0.25 ? 1 : R() < 0.45 ? 2 : 0);
  // along the avenue, both sides: from the far south to the highway, and on north of it
  for (const side of [-1, 1]) {
    for (const [zA, zB] of [[300, CZ + FZ], [CZ - FZ, HWY.z + HWY.w / 2 + 5], [HWY.z - HWY.w / 2 - 5, -470]]) {
      let z = zA;
      while (z > zB + 4) {
        const d = Math.min(14 + R() * 18, z - zB);
        if (d < 4) break;
        let w = 24 + R() * 16; const zc = z - d / 2;
        if (Math.abs(zc - CZ) < FZ + 24) w = 40;   // (the corner buildings run the whole way to the cross street's own row)
        // (the north-west corner lot is the building site)
        if (side < 0 && zc < SITE.z1 && zc > SITE.z0) { z -= d; continue; }
        let h = 26 + R() * 34;
        if (Math.abs(zc - CZ) < 60) h = 34 + R() * 40;
        add(side * (FX + w / 2), zc, w, d - 0.6, h, kindOf());
        z -= d;
      }
    }
    // along the cross street, both sides, east and west of the avenue (the low Sun shines down it)
    for (const zs of [-1, 1]) {
      let x = FX + 40;
      while (x < 520) {
        const w = 14 + R() * 20, d = 26 + R() * 14;
        add(side * (x + w / 2), CZ + zs * (FZ + d / 2), w - 0.6, d, 28 + R() * 46 + (R() < 0.15 ? 40 + R() * 60 : 0), kindOf());
        x += w;
      }
    }
  }
  // the blocks behind the street walls, taller further off: roofs and towers over the street
  for (let i = 0; i < 700; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (60 + R() * 560), z = 300 - R() * 900;
    if (Math.abs(z - CZ) < FZ + 40) continue;
    if (Math.abs(z - HWY.z) < 34) continue;   // (the highway runs between the blocks)
    const far = Math.abs(x) > 180 || z < -300;
    add(x, z, 24 + R() * 30, 24 + R() * 30, (far ? 40 : 30) + R() * (far ? 90 : 50) + (R() < 0.15 ? 70 + R() * 120 : 0), R() < 0.35 ? 4 : 3);
  }
  // the downtown skyline to the north, beyond the highway: tall towers (where the jet goes down)
  for (let i = 0; i < 160; i++) {
    const x = (R() - 0.5) * 900, z = -480 - R() * 900;
    add(x, z, 30 + R() * 30, 30 + R() * 30, 70 + R() * 150 + (R() < 0.2 ? 80 + R() * 100 : 0), R() < 0.6 ? 4 : 3);
  }
}

// keep the jet's way clear: no building in its path (it goes down in a park beyond the towers, hitting none)
{
  const PATH = [[245, 238, -240], [190, 230, -262], [128, 218, -292], [72, 196, -338], [30, 160, -400], [8, 110, -470], [2, 52, -565], [4, 0, -650]];
  const near = (b) => {
    for (let i = 0; i < PATH.length - 1; i++) {
      const [x0, y0, z0] = PATH[i], [x1, y1, z1] = PATH[i + 1];
      const ux = x1 - x0, uz = z1 - z0, t = Math.max(0, Math.min(1, ((b.x - x0) * ux + (b.z - z0) * uz) / (ux * ux + uz * uz)));
      const d = Math.hypot(b.x - (x0 + ux * t), b.z - (z0 + uz * t)) - Math.max(b.w, b.d) / 2;
      if (d < 55 && b.h > y0 + (y1 - y0) * t - 25) return true;
    }
    return Math.hypot(b.x - 4, b.z + 650) < 110;     // (the park where it comes down)
  };
  for (let i = BLD.length - 1; i >= 0; i--) if (BLD[i].z < -150 && near(BLD[i])) BLD.splice(i, 1);
}

// ---- shop signs over the shop fronts (avenue and cross street, near you) ----
export const SIGNS = [];
{
  const R = rng(77);
  for (const side of [-1, 1]) for (let z = 120; z > HWY.z + 20; z -= 7 + R() * 7) {
    if (Math.abs(z - CZ) < FZ + 2) continue;
    if (side < 0 && z < SITE.z1 && z > SITE.z0) continue;
    if (R() < 0.2) continue;
    SIGNS.push({ x: side * (FX - 0.06), y: 4.3, z, w: 4.5 + R() * 3, h: 1.1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8) });
  }
  for (const side of [-1, 1]) for (const zs of [-1, 1]) for (let x = FX + 3; x < 140; x += 7 + R() * 7) {
    if (R() < 0.25) continue;
    SIGNS.push({ x: side * x, y: 4.3, z: CZ + zs * (FZ - 0.06), w: 4.5 + R() * 3, h: 1.1, yaw: zs > 0 ? Math.PI : 0, cell: Math.floor(R() * 8) });
  }
}

// ---- street furniture: lamps, signals, trees, a hydrant and a bin by you ----
export const LAMPS = [], TREES = [], SIGNALS = [];
for (const side of [-1, 1]) for (let z = 140; z > -460; z -= 26) {
  if (Math.abs(z - CZ) < FZ + 3 || Math.abs(z - HWY.z) < 14) continue;
  LAMPS.push({ x: side * (AV + 0.7), z, dir: -side, axis: 'x' });
}
for (const side of [-1, 1]) for (const zs of [-1, 1]) for (let x = FX + 12; x < 300; x += 28) LAMPS.push({ x: side * x, z: CZ + zs * (CR + 0.7), dir: -zs, axis: 'z' });
{
  const R = rng(91);
  for (const side of [-1, 1]) for (let z = 110; z > HWY.z + 14; z -= 11 + R() * 3) {
    if (Math.abs(z - CZ) < FZ + 5 || Math.abs(z - CAM0.z) < 7) continue;
    if (LAMPS.some((l) => Math.abs(l.x - side * (AV + 0.7)) < 1 && Math.abs(l.z - z) < 3)) continue;
    TREES.push({ x: side * (AV + 1.3), z, h: 4.5 + R() * 2, r: 2.0 + R() * 0.8, seed: R() });
  }
  for (const side of [-1, 1]) for (const zs of [-1, 1]) for (let x = FX + 5; x < 200; x += 12 + R() * 4) {
    if (LAMPS.some((l) => Math.abs(l.x - side * x) < 3 && Math.abs(l.z - (CZ + zs * (CR + 0.7))) < 1)) continue;
    TREES.push({ x: side * x, z: CZ + zs * (CR + 1.3), h: 4.5 + R() * 2, r: 1.9 + R() * 0.8, seed: R() });
  }
}
// the four corners' signal poles, each with an arm over the road it faces (axis: which road the arm spans)
// group: 'av' lights face avenue traffic, 'cr' face the cross street
SIGNALS.push(
  { x: AV + 0.6, z: CZ + CR + 0.6, arm: 'x', dir: -1, group: 'av', face: 1 },     // SE corner: arm over the north-bound lanes
  { x: -AV - 0.6, z: CZ - CR - 0.6, arm: 'x', dir: 1, group: 'av', face: -1 },    // NW corner: arm over the south-bound lanes
  { x: -AV - 0.6, z: CZ + CR + 0.6, arm: 'z', dir: -1, group: 'cr', face: -1 },   // SW corner: over the east-bound lanes
  { x: AV + 0.6, z: CZ - CR - 0.6, arm: 'z', dir: 1, group: 'cr', face: 1 },      // NE corner: over the west-bound lanes
);
export const HYDRANT = { x: -AV - 0.7, z: CAM0.z + 3.2 };
// a bench against the building front just up from you (the pregnant woman sits on it), and where the mother stands
export const BENCH = { x: FX - 0.75, z: CZ + CR + 4.2, yaw: -Math.PI / 2 };
export const MOTHER = { x: AV + 2.6, z: CZ + CR + 2.4, yaw: 0.5 };
export const BIN = { x: -AV - 0.75, z: CAM0.z + 6.5 };
