// Where everything stands (metres; x east, y up, z south). A made-up city corner: a north-south avenue (two lanes each
// way) crosses an east-west street. You stand on the south-west corner, looking north-east across the intersection
// at the far corner and up the avenue; the 1:30 PM Sun is behind you (south-south-west).
// Every building has a whole life planned here: today's building; when it is torn down and what replaces it (all of
// them within 300 years); when the city empties; when it starts to fall in, how far, and how it sinks into the forest.
import { rng } from './util.js';

export const AV = 7.5, WALK = 5.5, FX = AV + WALK;          // avenue road half-width, sidewalk width, building fronts
export const CZ = -20, CR = 7, FZ = CR + WALK;              // the cross street's centre line, road half-width, fronts
export const YOU = { x: -AV - 1.7, z: CZ + CR + 2.6 };       // you, on the south-west corner, by the curb
export const YOU_FACE = Math.atan2(0.33, -0.94);             // you face up the avenue, a little east of north (yaw: +z = 0)
export const LANES_AV = [[-5.4, 1], [-1.9, 1], [1.9, -1], [5.4, -1]];          // x, direction (+1 = south)
export const LANES_CR = [[CZ - 5.1, -1], [CZ - 1.8, -1], [CZ + 1.8, 1], [CZ + 5.1, 1]];   // z, direction (+1 = east)
export const XWALK_S = [CZ + CR + 1.0, CZ + CR + 4.6], XWALK_N = [CZ - CR - 4.6, CZ - CR - 1.0];
export const XWALK_E = [AV + 1.0, AV + 4.6], XWALK_W = [-AV - 4.6, -AV - 1.0];

const lu = (R, a, b) => Math.exp(Math.log(a) + R() * (Math.log(b) - Math.log(a)));   // log-uniform

// ---- buildings ----
// { x, z, w, d, hA, kindA, colA, yNew (a new tower rising from an empty lot, or 0), ySwap, hB, kindB, colB,
//   yAband, yFall, ruin (the share left standing once fallen), mound (m), far }
// kinds: 0 stone/concrete offices, 1 glass tower, 2 old brick, 3 far city, 4 tall glass, 5 the new city (white,
// ribbon windows, gardens on every few floors)
export const BLD = [];
{
  const R = rng(9137);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xc9b79a, 0xb08468, 0xe0d6c4, 0x9a6a52, 0xcfb08a, 0xe8e0d0, 0x8a5a44, 0xbfb4a4, 0xd8bf94, 0xa79580, 0xb86a50, 0x8fa3b2, 0x7a7068];
  const TOWER = [0x5f7fa0, 0x7896b4, 0x50709a, 0x8aa4bc, 0x6888a8, 0x4a6680];
  const NEW = [0xf2f0ea, 0xe8ece8, 0xf4efe4, 0xdfe6e8, 0xeae4d8];
  const add = (x, z, w, d, h, kind, far = false, yNew = 0) => {
    const dist = Math.hypot(x, z - CZ);
    const kB = R() < 0.75 ? 5 : 4;
    BLD.push({
      x, z, w, d, hA: h, kindA: kind, colA: kind === 1 || kind === 4 ? pick(TOWER) : pick(COLS), yNew,
      ySwap: far ? lu(R, 40, 290) : lu(R, 45, 280),
      hB: Math.max(h * (0.9 + R() * 0.5), dist < 80 ? 30 + R() * 50 : 50 + R() * 110) + (R() < 0.12 ? 60 + R() * 90 : 0), kindB: kB, colB: kB === 5 ? pick(NEW) : pick(TOWER),
      yAband: lu(R, 340, 640), yFall: lu(R, 800, 2600), ruin: 0.2 + R() * 0.4, mound: 1.5 + R() * 3.5,
      seed: R(), far,
    });
  };
  const kindOf = () => (R() < 0.25 ? 1 : R() < 0.45 ? 2 : 0);
  // along the avenue, both sides, south and north of the cross street
  for (const side of [-1, 1]) {
    for (const [zA, zB] of [[260, CZ + FZ], [CZ - FZ, -520]]) {
      let z = zA;
      while (z > zB + 4) {
        const d = Math.min(14 + R() * 18, z - zB);
        if (d < 4) break;
        let w = 22 + R() * 14; const zc = z - d / 2;
        if (Math.abs(zc - CZ) < FZ + 24) w = 36;
        add(side * (FX + w / 2), zc, w, d - 0.6, (Math.abs(zc - CZ) < 60 ? 30 : 22) + R() * 38, kindOf());
        z -= d;
      }
    }
    // along the cross street, both sides, east and west of the avenue
    for (const zs of [-1, 1]) {
      let x = FX + 36;
      while (x < 480) {
        const w = 14 + R() * 20, d = 24 + R() * 14;
        add(side * (x + w / 2), CZ + zs * (FZ + d / 2), w - 0.6, d, 26 + R() * 40 + (R() < 0.15 ? 30 + R() * 50 : 0), kindOf());
        x += w;
      }
    }
  }
  // the blocks behind the street walls
  for (let i = 0; i < 520; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (60 + R() * 520), z = 260 - R() * 820;
    if (Math.abs(z - CZ) < FZ + 40) continue;
    const far = Math.abs(x) > 170 || z < -260;
    add(x, z, 24 + R() * 28, 24 + R() * 28, (far ? 36 : 26) + R() * (far ? 80 : 45) + (R() < 0.15 ? 60 + R() * 100 : 0), R() < 0.35 ? 4 : 3, true);
  }
  // the skyline to the north and north-east
  for (let i = 0; i < 150; i++) {
    const x = -200 + R() * 1000, z = -560 - R() * 800;
    add(x, z, 30 + R() * 30, 30 + R() * 30, 60 + R() * 140 + (R() < 0.2 ? 70 + R() * 90 : 0), R() < 0.6 ? 4 : 3, true);
  }
  // new towers going up on empty lots in the first 30 years (in view, north-east, above the street walls)
  for (const [x, z, h] of [[95, -330, 190], [40, -420, 230], [170, -260, 160], [-20, -560, 250], [230, -420, 210], [130, -520, 270], [60, -250, 150], [300, -330, 180]]) {
    add(x, z, 34 + R() * 10, 34 + R() * 10, h, 4, true, lu(R, 2.5, 26));
  }
  // nothing stands in the near lots right round the intersection's corners (the corners are buildings' fronts)
}

// ---- shop signs over the shop fronts near you (each on its building; gone when that building is torn down) ----
export const SIGNS = [];
{
  const R = rng(77);
  BLD.forEach((b, bi) => {
    if (b.far || Math.hypot(b.x, b.z - CZ) > 140) return;
    const onAv = Math.abs(Math.abs(b.x) - (FX + b.w / 2)) < 0.5;
    if (onAv) {
      const side = Math.sign(b.x);
      for (let z = b.z + b.d / 2 - 4; z > b.z - b.d / 2 + 3; z -= 8 + R() * 5) if (R() < 0.75) SIGNS.push({ b: bi, x: side * (FX - 0.06), y: 4.3, z, w: 4.5 + R() * 2.5, h: 1.1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8) });
    } else {
      const zs = Math.sign(b.z - CZ);
      for (let x = b.x - b.w / 2 + 3; x < b.x + b.w / 2 - 3; x += 8 + R() * 5) if (R() < 0.75) SIGNS.push({ b: bi, x, y: 4.3, z: CZ + zs * (FZ - 0.06), w: 4.5 + R() * 2.5, h: 1.1, yaw: zs > 0 ? Math.PI : 0, cell: Math.floor(R() * 8) });
    }
  });
}

// ---- street furniture: lamps, signals ----
export const LAMPS = [], SIGNALS = [], TREES = [];
for (const side of [-1, 1]) for (let z = 120; z > -400; z -= 26) {
  if (Math.abs(z - CZ) < FZ + 3) continue;
  LAMPS.push({ x: side * (AV + 0.7), z, dir: -side, axis: 'x', seed: (z * 0.137 + side) % 1 });
}
for (const side of [-1, 1]) for (const zs of [-1, 1]) for (let x = FX + 12; x < 300; x += 28) LAMPS.push({ x: side * x, z: CZ + zs * (CR + 0.7), dir: -zs, axis: 'z', seed: (x * 0.071 + zs * 0.3) % 1 });
SIGNALS.push(
  { x: AV + 0.6, z: CZ + CR + 0.6, arm: 'x', dir: -1, group: 'av', face: 1 },
  { x: -AV - 0.6, z: CZ - CR - 0.6, arm: 'x', dir: 1, group: 'av', face: -1 },
  { x: AV + 0.6, z: CZ - CR - 0.6, arm: 'z', dir: 1, group: 'cr', face: 1 },
);
// street trees along the sidewalks (not right by you)
{
  const R = rng(91);
  for (const side of [-1, 1]) for (let z = 100; z > -300; z -= 11 + R() * 3) {
    if (Math.abs(z - CZ) < FZ + 5) continue;
    if (LAMPS.some((l) => Math.abs(l.x - side * (AV + 0.7)) < 1 && Math.abs(l.z - z) < 3)) continue;
    TREES.push({ x: side * (AV + 1.3), z, h: 4.5 + R() * 2, r: 2.0 + R() * 0.8, seed: R() });
  }
  for (const side of [-1, 1]) for (const zs of [-1, 1]) for (let x = FX + 5; x < 200; x += 12 + R() * 4) {
    if (LAMPS.some((l) => Math.abs(l.x - side * x) < 3 && Math.abs(l.z - (CZ + zs * (CR + 0.7))) < 1)) continue;
    TREES.push({ x: side * x, z: CZ + zs * (CR + 1.3), h: 4.5 + R() * 2, r: 1.9 + R() * 0.8, seed: R() });
  }
}

// ---- the wild trees: seedlings in the cracks once the people have gone, then the forest ----
// { x, z, yBorn, hMax, r, seed }: near ones on the road and sidewalks, more in the lots once the buildings fall
export const WILD = [];
{
  const R = rng(4242);
  const clearOfYou = (x, z) => {
    // keep the space between you and the camera and a short way in front of you open
    const dx = x - YOU.x, dz = z - YOU.z;
    if (Math.hypot(dx, dz) < 3.2) return false;
    const fx = Math.sin(YOU_FACE), fz = Math.cos(YOU_FACE);
    const along = dx * fx + dz * fz, across = Math.abs(-dx * fz + dz * fx);
    if (along < 0 && along > -9 && across < 3.5) return false;     // the camera is behind you
    if (along > 0 && along < 11 && across < 2.0 + along * 0.35) return false;
    return true;
  };
  for (let i = 0; i < 900; i++) {
    const x = (R() - 0.5) * 220, z = CZ + (R() - 0.5) * 260;
    if (!clearOfYou(x, z)) continue;
    const onStreet = Math.abs(x) < FX || Math.abs(z - CZ) < FZ;
    // (the avenue ahead of you stays an open meadow for a long time: the forest closes over it only in the last
    // ten thousand years)
    const glade = Math.abs(x - 1) < AV + 1 && z < CZ + CR + 2;
    const yBorn = glade ? lu(R, 3500, 16000) : onStreet ? lu(R, 380, 2600) : lu(R, 1200, 9000);
    if (R() < 0.35) WILD.push({ x, z, yBorn: yBorn * 0.8, hMax: 0.8 + R() * 1.6, r: 0.9 + R() * 1.1, seed: R(), near: true, bush: true });
    else WILD.push({ x, z, yBorn, hMax: 9 + R() * 14, r: 3.0 + R() * 3.0, seed: R(), near: true });
  }
  // the forest canopy over the rest of the city (big crowns; they rise as the city sinks)
  for (let i = 0; i < 2200; i++) {
    const a = R() * Math.PI * 2, d = 110 + Math.pow(R(), 0.7) * 900;
    const x = Math.cos(a) * d, z = CZ + Math.sin(a) * d;
    WILD.push({ x, z, yBorn: lu(R, 900, 12000), hMax: 14 + R() * 18, r: 5 + R() * 5, seed: R(), near: false });
  }
}
export const CAM_FAR = 3000;
