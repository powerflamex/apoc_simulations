// The city plan (metres). x: north (+) / south (-); z: east (+) / west (-); y up. The camera looks west (-z), so
// north is on the right, and everything the wind carries east comes toward the camera.
// A six-lane avenue (with a tree-lined median) runs east-west; cross streets every 110 m. The main crossing is at
// z = 0; the footbridge you stand on spans the avenue 31 m east of it.
// Every building gets the wind speed it fails at (glass, cladding, collapse), so the city comes apart in order.
import { rng, clamp, smooth } from './util.js';
import { vAtWind, V_LANDMARK } from './timeline.js';

export const AVE = { road: 13, median: 3.1, walk: 19 };      // |x| < road: carriageway; |x| < walk: + sidewalks
export const LANES = [-11.35, -8.05, -4.75, 4.75, 8.05, 11.35];   // lane centres (x); x > 0 drives west (right-hand traffic)
export const CROSS = { road: 7, walk: 12, step: 110 };       // cross streets at z = k * step
export const BRIDGE = { z: 22, y: 6.0, w: 3.6 };
export const CAM = { x: -2.3, y: BRIDGE.y + 1.62, z: 20.62, yaw: 0, pitch: -9 };   // right at the front railing
export const SUN = { az: 283, el: 13 };                      // degrees: low in the west, a little right of the avenue (golden hour)
export const crossZ = (z) => Math.round(z / CROSS.step) * CROSS.step;
export const inCross = (z, pad = 0) => Math.abs(z - crossZ(z)) < CROSS.walk + pad;

// ---- buildings ----
// kind 0: shop row / low walk-up (painted plaster, shop at street level), 1: mid-rise office (punched windows),
// 2: glass tower, 3: concrete residential tower (balcony bands)
export const B = [];
const SHOP_COL = [0xe8c39a, 0xd98f6a, 0xf0e2c4, 0xb8d1c6, 0xe6b8b0, 0xc9b28c, 0xf3d9a4, 0x9fb7c9, 0xd7c7e0, 0xe0a070];
const MID_COL = [0xb9b4aa, 0xa8a196, 0xcfc8ba, 0x8f949a, 0xc4b09a, 0x9d8f80];
const GLASS_COL = [0x5a7a96, 0x3f6a72, 0x7a6a58, 0x4c5a6e, 0x6c8aa2, 0x55606a, 0x8a7a64];
const RES_COL = [0xd8d2c6, 0xc6beb0, 0xe2dbd0, 0xb0aca4];
{
  const R = rng(2026);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => {
    const b = { seed: R(), ...o };
    // when it fails (video time), from the wind speed it can take; nearer the camera's path = later (keeps escalating)
    const dz = Math.abs(b.z + 150), near = clamp(1 - dz / 900);
    const tall = b.h > 70;
    b.vGlass = vAtWind(135 + R() * 95);
    b.vOff = b.vGlass + 0.5 + R() * 3;                          // its lights die (power, smashed fittings)
    if (b.kind === 0) {
      b.vStrip = 1e9;
      b.vFall = vAtWind(370 + R() * 80 + near * 10);
      b.dur = 1.6 + R() * 0.8;
    } else {
      b.vStrip = vAtWind(320 + R() * 160);
      b.vFall = tall ? vAtWind(600 + R() * 120 + near * 70) : vAtWind(520 + R() * 120 + near * 30);
      b.dur = tall ? 4.5 + R() * 2 : 2.8 + R() * 1.2;
    }
    b.lean = 0.35 + R() * 0.25;                                  // how far it tips (rad) while it comes down
    B.push(b);
    return b;
  };
  // frontage along the avenue, both sides, block by block
  for (let k = 1; k >= -15; k--) {
    const zc = k * CROSS.step;
    const z0 = zc - CROSS.walk, z1 = zc - CROSS.step + CROSS.walk;   // block spans z1..z0 (west of crossing zc)
    for (const side of [-1, 1]) {
      let z = z0;
      while (z > z1 + 6) {
        const near = Math.abs(zc) <= 110;
        const dist = -zc;
        let kind = R();
        kind = near ? (kind < 0.55 ? 0 : kind < 0.8 ? 1 : kind < 0.93 ? 2 : 3)
          : (kind < 0.25 ? 0 : kind < 0.5 ? 1 : kind < 0.82 ? 2 : 3);
        let w = kind === 0 ? 9 + R() * 12 : kind === 1 ? 18 + R() * 16 : 22 + R() * 18;
        w = Math.min(w, z - z1);
        if (z - w - z1 < 7) w = z - z1;
        const d = kind === 0 ? 14 + R() * 8 : 20 + R() * 16;
        const floors = kind === 0 ? 2 + Math.floor(R() * 4) : kind === 1 ? 6 + Math.floor(R() * 12)
          : kind === 2 ? 18 + Math.floor(R() * (dist > 200 ? 34 : 22)) : 14 + Math.floor(R() * 20);
        const fh = kind === 0 ? 3.6 : 3.8;
        const h = floors * fh + (kind === 0 ? 1.2 : 2.5);
        const setback = kind >= 2 && R() < 0.4 ? 2 + R() * 4 : 0;
        const col = kind === 0 ? pick(SHOP_COL) : kind === 1 ? pick(MID_COL) : kind === 2 ? pick(GLASS_COL) : pick(RES_COL);
        add({ kind, x: side * (AVE.walk + setback + d / 2), z: z - w / 2, w: d, d: w - 0.6, h, col, side, front: true, sign: kind === 0 || (kind === 1 && R() < 0.6) });
        z -= w;
      }
    }
  }
  // the rows behind the frontage: towers and slabs that fill the skyline (x out to ±330)
  for (let k = 1; k >= -15; k--) {
    const zc = k * CROSS.step;
    for (const side of [-1, 1]) for (let x = 62; x < 340; x += 38 + R() * 20) {
      if (R() < 0.3) continue;
      const kind = R() < 0.55 ? 2 : R() < 0.6 ? 3 : 1;
      const w = 22 + R() * 18, d = 22 + R() * 20;
      const h = (kind === 1 ? 25 : 45) + Math.pow(R(), 1.6) * (kind === 2 ? 160 : 90);
      add({ kind, x: side * x, z: zc - CROSS.walk - 8 - R() * (CROSS.step - 2 * CROSS.walk - 16 - d) - d / 2, w, d, h, col: kind === 2 ? pick(GLASS_COL) : kind === 3 ? pick(RES_COL) : pick(MID_COL), side, front: false });
    }
  }
  // the far city beyond, low and dense, out to the haze
  for (let z = -1700; z > -5200; z -= 70 + R() * 60) for (let x = -900; x < 900; x += 60 + R() * 70) {
    if (Math.abs(x) < 30 || R() < 0.35) continue;
    const kind = R() < 0.35 ? 2 : 1;
    add({ kind, x, z, w: 25 + R() * 30, d: 25 + R() * 30, h: 15 + Math.pow(R(), 2.2) * 140, col: kind === 2 ? pick(GLASS_COL) : pick(MID_COL), side: Math.sign(x), front: false, far: true });
  }
}
// the landmark: the city's tallest tower, on the left one block back, ~700 m down the avenue; it goes last
export const LANDMARK = (() => {
  const b = { kind: 2, x: -58, z: -700, w: 36, d: 36, h: 318, col: 0x4e6e86, side: -1, front: false, seed: 0.777, landmark: true };
  b.vGlass = vAtWind(190); b.vOff = b.vGlass + 2; b.vStrip = vAtWind(420); b.vFall = V_LANDMARK; b.dur = 5.0; b.lean = 0.85;
  // clear the lot for it
  for (let i = B.length - 1; i >= 0; i--) { const o = B[i]; if (Math.abs(o.x - b.x) < (o.w + b.w) / 2 + 4 && Math.abs(o.z - b.z) < (o.d + b.d) / 2 + 4) B.splice(i, 1); }
  B.push(b);
  return b;
})();

// how far a building has come down at video time v: tip (rad, toward +z = east) and the share of its height left
export function fallState(b, v) {
  const k = clamp((v - b.vFall) / b.dur);
  if (k <= 0) return { tip: 0, left: 1, k: 0 };
  const e = k * k;                                     // it starts slowly and speeds up
  const tip = b.lean * Math.sin(Math.min(e * 1.25, 1) * Math.PI / 2) * (1 - smooth(0.75, 1, k) * 0.6);
  const rubble = b.kind === 0 ? 0.15 : Math.min(0.08, 6 / b.h);
  const left = 1 - (1 - rubble) * smooth(0.05, 1, e);
  return { tip, left, k };
}

// ---- street furniture ----
export const LAMPS = [];
export const SIGNALS = [];
export const TREES = [];
{
  const R = rng(77);
  for (let z = 140; z > -1700; z -= 32) {
    if (inCross(z, 2)) continue;
    for (const side of [-1, 1]) LAMPS.push({ x: side * (AVE.road + 0.9), z: z + side * 6, side, seed: R(), v: vAtWind(200 + R() * 110) });
  }
  // the median's rain trees (broad, umbrella crowns), and a row along each sidewalk
  for (let z = 120; z > -1650; z -= 13 + R() * 6) {
    if (inCross(z, 3) || (z > -75 && z < 64)) continue;       // (none between you and the crossing: the view stays open)
    TREES.push({ x: (R() - 0.5) * 1.2, z, s: 0.8 + R() * 0.45, seed: R(), vStrip: vAtWind(95 + R() * 70), v: vAtWind(185 + R() * 90) });
  }
  for (let z = 120; z > -1650; z -= 17 + R() * 10) for (const side of [-1, 1]) {
    if (inCross(z, 3) || R() < 0.3 || (z > 18 && z < 48)) continue;
    TREES.push({ x: side * (AVE.road + 2.6), z, s: 0.55 + R() * 0.3, seed: R(), vStrip: vAtWind(95 + R() * 70), v: vAtWind(170 + R() * 90) });
  }
  // traffic signals at every crossing: a pole on each corner, mast arms over the avenue
  for (let k = 1; k >= -15; k--) {
    const zc = k * CROSS.step;
    for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) SIGNALS.push({ x: sx * (AVE.road + 0.7), z: zc + sz * (CROSS.road + 1.5), side: sx, face: sz, seed: R(), v: vAtWind(210 + R() * 100), zc });
  }
}

// the cars: stopped at the main crossing's red light (both directions), queued down the avenue, and on the cross street
export const CARS = [];
{
  const R = rng(55);
  const add = (o) => CARS.push({ seed: R(), kind: Math.floor(R() * 4), col: null, ...o });
  // eastbound (x < 0, heading +z) waiting at the west stop line, queues back down the avenue
  for (const L of [0, 1, 2]) {
    let z = -14.5 - R() * 2;
    for (let n = 0; n < 9; n++) { add({ x: LANES[L], z: z - 2.3, dir: 1, L }); z -= 6.4 + R() * 3.5; if (z < -105) break; }
  }
  // westbound (x > 0, heading -z) waiting at the east stop line, right below and ahead of the footbridge
  for (const L of [3, 4, 5]) {
    let z = 14.5 + R() * 2;
    for (let n = 0; n < 6; n++) { add({ x: LANES[L], z: z + 2.3, dir: -1, L }); z += 6.4 + R() * 3.5; }
  }
  // moving traffic further down the avenue, both ways
  for (let n = 0; n < 60; n++) {
    const L = Math.floor(R() * 6);
    const z = -125 - R() * 1450;
    if (inCross(z, 3)) continue;
    add({ x: LANES[L], z, dir: L < 3 ? 1 : -1, L, far: true });
  }
  // the cross street at the main crossing: cars going through on green (north-south)
  for (const [x, dir] of [[-26, 1], [-38, 1], [-52, 1], [24, -1], [36, -1], [49, -1], [-64, 1], [62, -1]]) add({ x, z: dir > 0 ? -3.5 : 3.5, dir: 0, ns: dir });
  // remove anything that would overlap
  for (let i = CARS.length - 1; i >= 0; i--) for (let j = 0; j < i; j++) {
    if (Math.abs(CARS[i].x - CARS[j].x) < 2.2 && Math.abs(CARS[i].z - CARS[j].z) < 5.2) { CARS.splice(i, 1); break; }
  }
}
// a city bus in the eastbound queue and one westbound under the bridge
export const BUSES = [{ x: LANES[0], z: -52, dir: 1, seed: 0.3 }, { x: LANES[5], z: 42, dir: -1, seed: 0.6 }];
for (let i = CARS.length - 1; i >= 0; i--) for (const b of BUSES) if (Math.abs(CARS[i].x - b.x) < 2.4 && Math.abs(CARS[i].z - b.z) < 9) { CARS.splice(i, 1); break; }
