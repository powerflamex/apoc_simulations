// The city: a downtown avenue running north (-z) from you, x east, y up, metres. The avenue is 24 m of road
// (three lanes each way) with 7 m sidewalks; the building line is at |x| = 19. Cross streets every 95 m; the
// avenue ends at a 252 m tower straight ahead (z = -780). Beyond: a grid of blocks out to ~5 km, tall near the
// avenue's middle stretch, lower farther out. Everything is placed here once (deterministic).
import { rng, clamp, smooth } from './util.js';
import { TOWER, CAM0 } from './timeline.js';

export const ROAD = 12, WALK = 19;
export const ZC = [];
for (let z = 610; z > -5000; z -= 95) ZC.push(z);          // cross street centres (… 40, -55, -150 …)
export const ZHALF = 10;
export const XC = [];                                         // the other avenues' centres
for (let x = 150; x < 2300; x += 150) { XC.push(x); XC.push(-x); }
XC.sort((a, b) => a - b);

// ---------- buildings ----------
// kind 0 brick walk-up, 1 stone office, 2 glass tower, 3 residential tower
// colW: facade column width (m); the window grid is the same in the shader and in the chunk spawner
export const FH = 3.8, G0 = 5.0;
export const B = [];
const R = rng(20251022);
const tint = (k) => {
  if (k === 0) return [0x7a4a3a, 0x8a5a44, 0x6b4636, 0x93705a, 0x5f4a40][Math.floor(R() * 5)];
  if (k === 1) return [0xb8ad9c, 0xa89f90, 0xc9c0b0, 0x968d80, 0x8e8a86][Math.floor(R() * 5)];
  if (k === 2) return [0x5f7d96, 0x4f6a80, 0x6e8aa0, 0x3f5568, 0x7890a4][Math.floor(R() * 5)];
  return [0xc2b8a8, 0xa9a39a, 0xd0c8bc, 0x8f8a84][Math.floor(R() * 4)];
};
function addB(x0, x1, z0, z1, h, kind, extra = {}) {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  if (w < 6 || d < 6 || h < 8) return null;
  const colW = kind === 2 ? 1.6 : kind === 0 ? 2.6 + R() * 0.8 : 2.2 + R();
  const b = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w, d, h, kind, col: tint(kind), seed: R(), colW, i: B.length, ...extra };
  B.push(b);
  return b;
}
const pickKind = (h) => h > 110 ? (R() < 0.7 ? 2 : 3) : h > 45 ? [1, 1, 2, 3][Math.floor(R() * 4)] : (R() < 0.6 ? 0 : 1);
// the avenue's own frontage: lots of 16-40 m along it, 25-50 m deep
const blockEdges = (z) => {
  let a = null;
  for (let i = 0; i < ZC.length - 1; i++) if (z <= ZC[i] - ZHALF && z >= ZC[i + 1] + ZHALF) a = [ZC[i + 1] + ZHALF, ZC[i] - ZHALF];
  return a;
};
for (let i = 0; i < ZC.length - 1; i++) {
  const zA = ZC[i] - ZHALF, zB = ZC[i + 1] + ZHALF;   // zA > zB
  if (zA < -735) break;
  for (const side of [-1, 1]) {
    // frontage lots
    let z = zA;
    while (z > zB + 6) {
      let L = 16 + R() * 24;
      if (z - L < zB + 10) L = z - zB;
      const depth = 25 + R() * 25;
      // tall in the middle stretch (where the purple cuts through), shorter right around you
      const mid = smooth(150, -150, z) * (1 - smooth(-520, -720, z) * 0.4);
      const h = 18 + R() * 30 + mid * R() * 190 + (R() < 0.18 ? 70 * mid : 0);
      const kind = pickKind(h);
      addB(side * WALK, side * (WALK + depth), z, z - L + 0.6, h, kind, { front: side });
      // behind it, out to the next avenue
      const xIn = WALK + depth + 4, xOut = 140;
      let x = xIn;
      while (x < xOut - 8) {
        let W2 = 22 + R() * 30;
        if (x + W2 > xOut - 8) W2 = xOut - x;
        const h2 = 20 + R() * 40 + mid * R() * 220;
        addB(side * x, side * (x + W2 - 3), z, z - L + 0.6, h2, pickKind(h2));
        x += W2;
      }
      z -= L;
    }
  }
}
// the tower that closes the avenue (Red blows it in half), and its plaza
export const TOWER_B = addB(TOWER.x - TOWER.w / 2, TOWER.x + TOWER.w / 2, TOWER.z + TOWER.d / 2, TOWER.z - TOWER.d / 2, TOWER.h, 2, { tower: true });
TOWER_B.col = 0x6d8aa3;
// the rest of the grid (blocks between the other avenues and cross streets)
for (let j = 0; j < XC.length - 1; j++) {
  const xa = XC[j] + 10, xb = XC[j + 1] - 10;
  if (xa > -150 && xb < 150) continue;          // (the avenue's own blocks are above)
  for (let i = 0; i < ZC.length - 1; i++) {
    const za = ZC[i] - ZHALF, zb = ZC[i + 1] + ZHALF;
    if (za > -735 && za < 620 && Math.abs(xa + xb) / 2 < 150) continue;
    const cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const r = Math.hypot(cx * 0.8, cz + 600);
    if (r > 5200) continue;
    if (za < -760 && za > -880 && Math.abs(cx) < 160) continue;   // (the tower's plaza)
    const dense = Math.exp(-r / 1400);
    const nx = r < 1600 ? 3 : 2, nz = r < 1600 ? 2 : 1;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      if (R() < 0.08) continue;
      const x0 = xa + (xb - xa) * a / nx, x1 = xa + (xb - xa) * (a + 1) / nx - 3;
      const z0 = za - (za - zb) * b / nz, z1 = za - (za - zb) * (b + 1) / nz + 3;
      const h = 15 + R() * 35 + dense * R() * 230 * (R() < 0.35 ? 1.4 : 0.6);
      addB(x0, x1, z0, z1, h, pickKind(h));
    }
  }
}
// close the avenue's south end behind you with the blocks beyond the next cross street (already in the loop)

// ---------- cars: jammed both ways ----------
// lanes: northbound (x > 0, facing -z), southbound (x < 0, facing +z); a few parked at the curbs
export const LANES = [1.9, 5.6, 9.3, -1.9, -5.6, -9.3];
export const CARS = [];
{
  const RC = rng(77);
  const COLS = [0x1c1c1e, 0xe8e8ea, 0x8a8f96, 0x3a3f46, 0x9e1b1b, 0x1e3a6e, 0xd8d2c4, 0x2b4a36, 0x5a5f66, 0xc9a227, 0x101317, 0xf2f2f0, 0x6e2a24];
  for (const x of LANES) {
    let z = 140 + RC() * 6;
    while (z > -735) {
      const kind = RC() < 0.5 ? 0 : RC() < 0.5 ? 1 : RC() < 0.75 ? 2 : 3;
      const len = [4.5, 4.0, 4.6, 4.9][kind];
      z -= len / 2;
      // leave the box of the crosswalk in front of you clear, and a gap now and then
      if (!(z < 14 && z > -32 && x > 4) && !(Math.abs(x) < 4 && z < -42 && z > -54)) CARS.push({ x: x + (RC() - 0.5) * 0.4, z, yaw: (x > 0 ? 0 : Math.PI) + (RC() - 0.5) * 0.06, kind, col: COLS[Math.floor(RC() * COLS.length)], seed: RC(), len });
      z -= len / 2 + 1.4 + RC() * 3.2 + (RC() < 0.06 ? 12 : 0);
    }
  }
  for (const side of [-1, 1]) for (let z = 120; z > -700; z -= 7 + RC() * 14) {
    if (blockEdges(z) && RC() < 0.55) CARS.push({ x: side * 11.2, z, yaw: (side > 0 ? 0 : Math.PI), kind: RC() < 0.7 ? 0 : 2, col: COLS[Math.floor(RC() * COLS.length)], seed: RC(), len: 4.5, parked: true });
  }
  // cross-street queues near you
  for (const zc of [40, -55, -150, -245]) for (const side of [-1, 1]) for (const lane of [-2, 2]) {
    let x = side * 24;
    while (Math.abs(x) < 140) {
      const kind = RC() < 0.6 ? 0 : 2;
      CARS.push({ x, z: zc + lane, yaw: lane > 0 ? Math.PI / 2 : -Math.PI / 2, kind, col: COLS[Math.floor(RC() * COLS.length)], seed: RC(), len: 4.5 });
      x += side * (6 + RC() * 4);
    }
  }
}

// ---------- street furniture ----------
export const LAMPS = [];
for (const side of [-1, 1]) for (let z = 220; z > -740; z -= 28) {
  if (!blockEdges(z)) continue;
  if (side > 0 && z + 7 > -48 && z + 7 < 16) continue;   // (none right in front of you)
  LAMPS.push({ x: side * 12.5, z: z + side * 7, side });
}
export const SIGNALS = [];     // mast arms over the avenue at each crossing (north- and southbound heads)
for (const zc of ZC) if (zc < 240 && zc > -740) for (const side of [-1, 1]) SIGNALS.push({ x: side * 12.4, z: zc + side * ZHALF * 0.9, side });

// neon signs on the avenue's buildings: blade signs sticking out over the sidewalk, storefront signs, LED screens
export const SIGNS = [];
export const SCREENS = [];
{
  const RS = rng(5);
  for (const b of B) {
    if (!b.front || b.z > 240 || b.z < -460) continue;
    const fx = b.front * WALK;
    // a storefront sign on most
    if (RS() < 0.85) SIGNS.push({ x: fx - b.front * 0.08, y: 4.3, z: b.z + (RS() - 0.5) * (b.d - 8) * 0.5, w: Math.min(b.d - 3, 6 + RS() * 6), h: 1.0, face: -b.front, word: Math.floor(RS() * 16), blade: false });
    // a vertical blade sign on some
    if (RS() < 0.4 && b.h > 14) SIGNS.push({ x: fx - b.front * 1.2, y: 7 + RS() * 4, z: b.z + (RS() - 0.5) * (b.d - 6) * 0.6, w: 1.1, h: 4.5 + RS() * 4, face: 0, word: Math.floor(RS() * 16), blade: true, side: -b.front });
  }
  // three LED screens: one on each side near you, one big up the avenue
  SCREENS.push({ x: -WALK + 0.1, y: 8, z: -50, w: 13, h: 7.5, face: 1, seed: 1 });
  SCREENS.push({ x: WALK - 0.1, y: 14, z: -205, w: 22, h: 13, face: -1, seed: 2 });
  SCREENS.push({ x: -WALK + 0.1, y: 22, z: -330, w: 16, h: 24, face: 1, seed: 3 });
}

// building lookups for the effects
export const nearBuildings = (x, z, r) => B.filter((b) => Math.abs(b.x - x) < r + b.w / 2 && Math.abs(b.z - z) < r + b.d / 2);
export { blockEdges };
