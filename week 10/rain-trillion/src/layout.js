// The city (metres). y up, 0 = the street. The avenue runs along z; you look up it toward -z, toward the city's
// tallest tower and, 5 km beyond the city, a mountain (2,300 m) standing on a 600 m upland with a town at its foot.
//   roadway |x| < 10.5 (four lanes), sidewalks to |x| < 14, buildings beyond.
// Story places: the bus stuck in the right lane next to you; a residential block with balconies on the right a little
// further up (the bus drifts past it while it rises); the tower 0.4 km up; the summit 5.5 km up.
import { rng, clamp, lerp, smooth } from './util.js';
import { V_BUS, levelR } from './timeline.js';

export const ROAD = 10.5, WALK = 14;
export const LANES = [-7.9, -4.4, 4.4, 7.9];
export const CROSS = [{ z: 62, w: 20 }, { z: -86, w: 20 }, { z: -230, w: 22 }];
export const BUS0 = { x: 7.4, z: -6.5, len: 12.2, wid: 2.55 };          // the bus (front toward -z)
export const TAXI = { x: 7.5, z: 2.0 };                                  // wedged behind it
export const YOU0 = { x: 5.0, z: 4.6 };                                  // where you stand at frame 0
export const BAL = { x0: 14, x1: 34, z0: -96 + 30, z1: -24, floors: 22, g0: 5.0, fh: 3.8 };   // the balcony block
export const TOWER = { x: 92, z: -420, w: 42, h: 400, spire: 58 };
export const SUMMIT = { x: -1000, z: -5600, h: 2300 };          // 5 km beyond the city's end, on a 600 m upland
export const TOWN = { x: -1000 + 0.1854 * 1150, z: -5600 + 0.9827 * 1150, r: 260 };   // the town on its lower slope, facing the city
export const BUS_TOP = 0.85;                                               // roof above the water once it floats

// ---- the bus's path: parked, then afloat (drifting up the avenue past the balconies, out toward the tower, then
// on out over the drowned city toward the mountain) ----
const BP = [
  [-99, BUS0.x, BUS0.z], [V_BUS, BUS0.x, BUS0.z], [10.5, 8.0, -11], [12.5, 8.7, -22], [15.0, 9.0, -38], [17.0, 8.6, -55],
  [19.0, 7.0, -85], [21.0, 12, -150], [23.0, 30, -260], [25.1, 50, -380], [26.6, 52, -455], [28.2, 46, -520],
  [29.8, 36, -575], [31.6, 22, -630], [36, -10, -730], [60, -80, -1000],
];
function spl(i, v) {                                       // Catmull-Rom over BP in time
  if (v <= BP[0][0]) return BP[0][i];
  const n = BP.length;
  if (v >= BP[n - 1][0]) return BP[n - 1][i];
  let k = 0; while (v > BP[k + 1][0]) k++;
  const [t0, t1] = [BP[k][0], BP[k + 1][0]];
  const p0 = BP[Math.max(0, k - 1)], p1 = BP[k], p2 = BP[k + 1], p3 = BP[Math.min(n - 1, k + 2)];
  const u = (v - t0) / (t1 - t0), u2 = u * u, u3 = u2 * u;
  const m1 = (p2[i] - p0[i]) / (p2[0] - p0[0] || 1) * (t1 - t0), m2 = (p3[i] - p1[i]) / (p3[0] - p1[0] || 1) * (t1 - t0);
  return (2 * u3 - 3 * u2 + 1) * p1[i] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[i] + (u3 - u2) * m2;
}
// the bus at video time v: centre (x, z), roof height, heading, sway
export function busAt(v) {
  const L = levelR(v);
  const fl = smooth(V_BUS, V_BUS + 0.8, v);
  let x = spl(1, v), z = spl(2, v);
  const roofParked = 3.15;
  const roof = Math.max(roofParked, L + BUS_TOP) + fl * (0.06 * Math.sin(v * 1.9) + 0.03 * Math.sin(v * 3.7));
  // heading: along the avenue, swinging a little once afloat, then turning with the drift
  const yaw = fl * (0.12 * Math.sin(v * 0.45 + 1) + 0.06 * Math.sin(v * 1.1)) + smooth(18, 24, v) * 0.5;
  const pitch = fl * 0.025 * Math.sin(v * 1.6 + 0.5), roll = fl * 0.035 * Math.sin(v * 1.3);
  return { x, z, roof, yaw, pitch, roll, fl };
}

// ---- buildings (instanced boxes; look in facade.js). kind 0 brick walk-up, 1 office, 2 glass tower, 3 residential ----
export const B = [];
const BRICK = [0x9a4e3a, 0xa8603f, 0x8a4636, 0xb8805e, 0xd0b89a, 0x7e4232, 0xc49070, 0xe0d0b4];
const MID = [0xc9c2b4, 0xb8b0a2, 0xdcd4c4, 0x9fa4aa, 0xd4c0a6, 0xae9e8c];
const GLASS = [0x4f7896, 0x46687a, 0x5e7488, 0x51627c, 0x7092ae, 0x5a6876, 0x3e5266];
const RES = [0xe2dccf, 0xd2c9b8, 0xeae3d6, 0xc0bab0];
{
  const R = rng(2024);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => { const b = { seed: R(), lit: 0.45 + R() * 0.5, ...o }; B.push(b); return b; };
  const inCross = (z, w) => CROSS.some((c) => Math.abs(z - c.z) < c.w / 2 + w / 2);
  // the avenue frontage, both sides (4-12 floors: their roofs go under together)
  for (const side of [-1, 1]) {
    let z = 120;
    while (z > -400) {
      let w = 11 + R() * 15;
      const zc = z - w / 2;
      const isBal = side > 0 && zc < BAL.z1 + 4 && zc > BAL.z0 - 4;
      if (inCross(zc, w)) { z -= w + 1; continue; }
      if (isBal) { z = BAL.z0 - 1; continue; }
      if (side > 0 && zc < -330) { z -= w; continue; }            // (the tower's plaza)
      const kind = R() < 0.55 ? 0 : R() < 0.6 ? 1 : 3;
      const d = 16 + R() * 12;
      const floors = kind === 0 ? 4 + Math.floor(R() * 4) : kind === 1 ? 6 + Math.floor(R() * 6) : 8 + Math.floor(R() * 5);
      const h = (kind === 0 ? 4.4 : 5.0) + (floors - 1) * (kind === 0 ? 3.6 : 3.8) + 1.4;
      add({ kind, x: side * (WALK + d / 2), z: zc, w: d, d: w - 0.4, h, col: kind === 0 ? pick(BRICK) : kind === 1 ? pick(MID) : pick(RES), side, front: true, roofPeople: R() < 0.45 });
      z -= w;
    }
  }
  // the balcony block (residential, 22 floors)
  add({ kind: 3, x: (BAL.x0 + BAL.x1) / 2, z: (BAL.z0 + BAL.z1) / 2, w: BAL.x1 - BAL.x0, d: BAL.z1 - BAL.z0, h: BAL.g0 + (BAL.floors - 1) * BAL.fh + 1.6, col: 0xe6dfd2, side: 1, front: true, balcony: true });
  // behind the frontage: blocks of mid-rises and towers on a grid, taller toward the tower
  for (let x = -900; x <= 1000; x += 70) for (let z = -800; z <= 900; z += 70) {
    for (let k = 0; k < 2; k++) {
      if (R() < 0.25) continue;
      const bx = x + (R() - 0.5) * 34, bz = z + (R() - 0.5) * 34;
      const w = 18 + R() * 20, d = 18 + R() * 20;
      if (Math.abs(bx) < WALK + 30 + w / 2) continue;                       // the frontage row is already there
      if (bz < -640) continue;                                              // the mountain's foot
      if (Math.hypot(bx - TOWER.x, bz - TOWER.z) < 80) continue;
      if (Math.abs(bx - 30) < 90 && bz < -300 && bz > -660) continue;      // keep the bus's way to the mountain clear
      const near = Math.exp(-(Math.pow((bx - TOWER.x) / 400, 2) + Math.pow((bz - TOWER.z) / 300, 2)));
      const tall = 16 + Math.pow(R(), 1.4) * (45 + 160 * near);
      const kind = tall > 70 ? (R() < 0.7 ? 2 : 3) : R() < 0.5 ? 1 : R() < 0.5 ? 3 : 0;
      if (B.some((o) => Math.abs(o.x - bx) < (o.w + w) / 2 + 3 && Math.abs(o.z - bz) < (o.d + d) / 2 + 3)) continue;
      add({ kind, x: bx, z: bz, w, d, h: tall, col: kind === 2 ? pick(GLASS) : kind === 3 ? pick(RES) : kind === 1 ? pick(MID) : pick(BRICK), side: 0, front: false, crown: kind === 2 && tall > 120 && R() < 0.5 });
    }
  }
  // the tallest tower (glass, a lit crown, a deck on its roof) and a ring of shorter towers round it
  add({ kind: 2, x: TOWER.x, z: TOWER.z, w: TOWER.w, d: TOWER.w, h: TOWER.h, col: 0x3f6a8c, side: 0, front: false, landmark: true });
  for (const [dx, dz, h, c] of [[-120, 60, 190, 0x5e7488], [90, 110, 230, 0x51627c], [140, -60, 170, 0x7092ae], [-60, 160, 150, 0x46687a], [200, 70, 210, 0x3e5266]]) {
    const bx = TOWER.x + dx, bz = TOWER.z + dz;
    for (let i = B.length - 1; i >= 0; i--) if (!B[i].landmark && Math.hypot(B[i].x - bx, B[i].z - bz) < 45) B.splice(i, 1);
    add({ kind: 2, x: bx, z: bz, w: 34, d: 32, h, col: c, side: 0, front: false, crown: true });
  }
  B.forEach((b, i) => { b.i = i; });
}
export const TOWER_B = B.find((b) => b.landmark);

// ---- the street furniture ----
export const LAMPS = [], SIGNS = [], TREES = [];
{
  const R = rng(77);
  for (let z = 100; z > -380; z -= 24) for (const side of [-1, 1]) {
    if (CROSS.some((c) => Math.abs(z - c.z) < c.w / 2 + 2)) continue;
    LAMPS.push({ x: side * (ROAD + 1.0), z: z + side * 6, side });
  }
  for (const b of B) {
    if (!b.front || b.balcony) continue;
    const n = Math.max(1, Math.floor(b.d / 9));
    for (let k = 0; k < n; k++) if (R() < 0.75) SIGNS.push({ x: b.side * (WALK + 0.05), z: b.z + (k - (n - 1) / 2) * (b.d / n), y: 3.9 + R() * 0.6, w: 2.2 + R() * 3.2, side: b.side, hue: R(), seed: R() });
  }
  for (let z = 90; z > -360; z -= 13 + R() * 5) for (const side of [-1, 1]) {
    if (CROSS.some((c) => Math.abs(z - c.z) < c.w / 2 + 3) || R() < 0.4) continue;
    if (side > 0 && Math.abs(z - YOU0.z) < 12) continue;
    TREES.push({ x: side * (ROAD + 2.2), z, s: 0.6 + R() * 0.3 });
  }
}

// ---- the cars: stuck in all four lanes, floating off from the first frame, drifting up the avenue in the current,
// jamming against each other at the first cross street, then filling and sinking one by one ----
export const CARS = [];
{
  const R = rng(55);
  for (const x of LANES) {
    let z = 60;
    while (z > -80) {
      const len = 4.6;
      const busLane = x > 6;
      const blocked = busLane && z < BUS0.z + BUS0.len / 2 + 0.5 + len / 2 && z > BUS0.z - BUS0.len / 2 - len / 2 - 0.5;
      const atYou = Math.abs(x - YOU0.x) < 3.2 && z > YOU0.z - 3.2 && z < YOU0.z + 4.5;
      const atTaxi = busLane && Math.abs(z - TAXI.z) < 3.4;
      if (!blocked && !atYou && !atTaxi && !CROSS.some((c) => Math.abs(z - c.z) < c.w / 2)) CARS.push({ x: x + (R() - 0.5) * 0.4, z, seed: R(), kind: Math.floor(R() * 4), taxi: R() < 0.3 });
      z -= len + 1.8 + R() * 3;
    }
  }
}
export const TAXI_I = CARS.length;
CARS.push({ x: TAXI.x, z: TAXI.z, seed: 0.37, kind: 0, taxi: true, wedged: true });

// ---- boats and wreckage that ride up with you (offsets from the bus, m; they join from 12 s) ----
export const BOATS = [
  { dx: -14, dz: 6, kind: 0, col: 0xf26a1b, n: 4, seed: 0.1, v0: 11.5 },
  { dx: 22, dz: -18, kind: 1, col: 0xf4f4f0, n: 3, seed: 0.5, v0: 15.5 },
  { dx: -26, dz: -30, kind: 0, col: 0xf2b21b, n: 3, seed: 0.8, v0: 17.0 },
  { dx: 12, dz: 26, kind: 0, col: 0xe8401c, n: 4, seed: 0.3, v0: 18.0 },
  { dx: -42, dz: 14, kind: 1, col: 0xd8e4ec, n: 3, seed: 0.65, v0: 19.5 },
];
export const WRECK = [];
{
  const R = rng(31);
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 2, r = 7 + Math.pow(R(), 0.7) * 70;
    WRECK.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r, kind: Math.floor(R() * 4), s: 0.6 + R() * 1.2, yaw: R() * 6.28, seed: R(), v0: 9 + R() * 8 });
  }
}
export { clamp, lerp };
