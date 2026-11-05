// Where everything stands (metres; x east (right), y up, z south (toward you)). Main Street runs north (-z) from
// behind you to the edge of town at z = -410, then the highway on through the fields. The wall comes down the street
// from the north. Road 17 m curb to curb (two lanes, angled parking both sides), sidewalks 3.5 m, the buildings'
// fronts at |x| = 12. A cross street every ~90 m. You stand in the road's left lane, 3 blocks from the end.
import { rng } from './util.js';

export const ROAD_X = 8.5, WALK = 3.5, FX = 12;
export const CAM0 = { x: -4.5, z: 0 };     // you: in the left lane, by the left sidewalk's crowd
export const CROSS = [-80, -170, -260, -350];     // cross streets (centre z)
export const CROSS_W = 6;                          // half their width
export const TOWN_END = -410;
export const HWY_X = 4.5;                          // the highway beyond town: half width
export const BLOCKS = [[64, -74], [-86, -164], [-176, -254], [-266, -344], [-356, TOWN_END]];
export const inCross = (z, pad = 0) => CROSS.some((c) => Math.abs(z - c) < CROSS_W + pad);

// ---- the fronts on Main Street: { side, x, z (centre), w (back from the street), d (frontage), h, kind, col, seed } ----
// kind 0 brick, 1 painted brick, 2 the stone bank (3 floors), 3 the theatre (a marquee), 4 a low one-floor shop
export const BLD = [];
export const HOUSES = [];      // behind the fronts and out at the farms: plain boxes with a roof
{
  const R = rng(17);
  const BRICK = [0x8c4b3b, 0x9a5a44, 0x7a4030, 0x6e3a2e, 0xa5664e, 0x8a5a48];
  const PAINT = [0xd8ccb0, 0xe4e0d4, 0xb09a78, 0x9a968c, 0x6a5a50, 0xc8b89a, 0xbfae8e];
  let theater = false, bank = false;
  for (const side of [-1, 1]) {
    for (const [z0, z1] of BLOCKS) {
      let z = z0;
      while (z - 5 > z1) {
        let d = 8 + R() * 8;
        if (z - d < z1 + 4) d = z - z1;
        const w = 16 + R() * 12;
        const r = R();
        let kind = r < 0.55 ? 0 : r < 0.85 ? 1 : 4;
        let h = kind === 4 ? 5.2 : R() < 0.55 ? 7.6 : 10.9;
        const atCorner = z === z0 || z - d <= z1 + 0.5;
        if (!bank && atCorner && z0 < 0 && z0 > -180 && side > 0) { kind = 2; h = 11.5; d = Math.max(d, 14); bank = true; }
        else if (!theater && z0 < -80 && z0 > -260 && side < 0 && !atCorner && d > 10) { kind = 3; h = 12; theater = true; }
        const col = kind === 0 || kind === 3 ? BRICK[Math.floor(R() * BRICK.length)] : kind === 2 ? 0xb8ad98 : PAINT[Math.floor(R() * PAINT.length)];
        BLD.push({ side, x: side * (FX + w / 2), z: z - d / 2, w, d: d - 0.3, h, kind, col, seed: R() });
        z -= d;
      }
    }
  }
  // the houses behind Main Street, on a grid of back streets
  const HC = [0xe8e4da, 0xf0e6c8, 0xc9d2d8, 0xbfc9b4, 0xe9d7b7, 0xd7c6b0, 0xa9b4bd];
  for (const side of [-1, 1]) for (let z = 50; z > -400; z -= 18 + R() * 8) {
    for (let x = 46; x < 150; x += 16 + R() * 10) {
      if (R() < 0.2) continue;
      const w = 9 + R() * 5, d = 8 + R() * 5, h = 3.6 + R() * 2.4;
      HOUSES.push({ x: side * x, z: z - d / 2, w, d, h, col: HC[Math.floor(R() * HC.length)], seed: R(), far: false });
    }
  }
  // the farms beyond the town (barns red)
  for (let i = 0; i < 16; i++) {
    const x = (R() - 0.5) * 900, z = -480 - R() * 700;
    if (Math.abs(x) < 25) continue;
    HOUSES.push({ x, z, w: 10 + R() * 14, d: 8 + R() * 10, h: 4 + R() * 5, col: R() < 0.4 ? 0x8a2e26 : HC[Math.floor(R() * HC.length)], seed: R(), far: true });
  }
}

// ---- trees: small ones on the sidewalks, big ones among the houses, windbreaks out in the fields ----
export const TREES = [];
{
  const R = rng(29);
  for (let z = 30, k = 0; z > TOWN_END; z -= 26 + R() * 8, k++) {
    if (inCross(z, 4)) continue;
    TREES.push({ x: (k % 2 ? 1 : -1) * (ROAD_X + 1.9), z, s: 0.5 + R() * 0.2, seed: R(), town: true });
  }
  for (const side of [-1, 1]) for (let i = 0; i < 70; i++) TREES.push({ x: side * (40 + R() * 120), z: 60 - R() * 480, s: 0.9 + R() * 0.6, seed: R() });
  for (let i = 0; i < 90; i++) { const x = (R() - 0.5) * 1400, z = -440 - R() * 900; if (Math.abs(x) < 20) continue; TREES.push({ x, z, s: 1.0 + R() * 0.8, seed: R() }); }
}

// ---- lamp posts (both sidewalks, staggered), telephone poles (right side, wires between), trash cans, benches ----
export const LAMPS = [];
for (const side of [-1, 1]) for (let z = 18; z > TOWN_END; z -= 22) { const zz = z + (side > 0 ? 11 : 4); if (inCross(zz, 3)) continue; LAMPS.push({ x: side * (ROAD_X + 0.7), z: zz, side }); }
export const POLES = [];
for (let z = 40; z > TOWN_END - 400; z -= 36) { if (inCross(z, 2.5)) continue; POLES.push({ x: z > TOWN_END ? 11.3 : HWY_X + 5, z }); }
export const TRASH = [];
LAMPS.forEach((l, i) => { if (i % 2 === 0) TRASH.push({ x: l.x + l.side * 1.1, z: l.z + 1.7 }); });
export const BENCHES = [{ x: -10.6, z: -14 }, { x: 10.6, z: -38 }, { x: -10.6, z: -58 }, { x: 10.6, z: -120 }, { x: -10.6, z: -200 }];
export const BOXES = [{ x: -9.4, z: -8 }, { x: 9.4, z: -20 }, { x: -9.4, z: -97 }, { x: 9.4, z: -140 }];   // newspaper boxes
export const SIGNAL = { z: CROSS[0] + CROSS_W + 1.2 };                                                    // the span wire at the near cross street
export const FLAGS = [{ x: 11.7, z: -112, y: 7.5, slant: true }, { x: -10.6, z: -196, y: 0, slant: false }];   // on the bank's front; the post office pole
export const FAR = { elevator: { x: 30, z: -500 }, tower: { x: -42, z: -570 }, church: { x: -28, z: -448 } };
