// The city plan (metres). x: east (+) / west (-); z: south (+) / north (-); y up. You stand in the middle of a
// downtown crossing (a Chicago-style grid: a wide avenue north-south, cross streets every 120 m, the next avenues
// 200 m apart, Lake Michigan from 1.8 km east), your right sole at the origin, facing south. Everything near you
// gets the time it is crushed: when one of your growing shoes first covers it (timeline.js vCovered), or when a
// stomp's shock reaches it.
import { rng, clamp } from './util.js';
import { vCovered, vBodyHit, vStanceHit, STOMP1, STOMP2, sizeAt, FOOT_X, TAXI } from './timeline.js';

export const AVE = { road: 11, walk: 17 };                 // |x| < road: carriageway; < walk: + sidewalks
export const LANES = [-9.4, -5.6, -1.9, 1.9, 5.6, 9.4];    // x; x > 0 northbound (-z); the outer two: parked/stopped
export const CROSS = { road: 7.5, walk: 12.5, step: 120 };  // cross streets at z = k * step
export const AVES_X = [-600, -400, -200, 200, 400, 600, 800, 1000, 1200, 1400, 1600];   // the other avenues
export const AVE2_HW = 9, AVE2_WALK = 13;
export const LAKE_X = 1800;
export const CITY_R = 2600;                                  // instanced buildings out to here

// stomp shocks: what a footfall does around it (radii in metres at the moment it lands)
export const SHOCKS = [
  { v: STOMP1.down, foot: STOMP1.foot, glass: 260, topple: 0, shake: 600 },
  { v: STOMP2.down, foot: STOMP2.foot, glass: 9000, topple: 3200, shake: 20000 },
];
export function footWorld(f, v) { return FOOT_X[f] * sizeAt(v); }   // x of a foot (z = 0)
// first stomp whose radius (key) reaches the point, plus the time the shock takes to get there
export function vShock(x, z, key, extra = 0) {
  for (const sh of SHOCKS) {
    const fx = footWorld(sh.foot, sh.v);
    const d = Math.hypot(x - fx, z);
    if (sh[key] > d + extra) return sh.v + Math.min(0.9, d / 3500);
  }
  return 1e9;
}

// ---- buildings ----
// kind 0: low shops / brick walk-ups, 1: office (punched windows), 2: glass tower, 3: stone tower (setbacks implied)
export const B = [];
const LOW_COL = [0xb5643f, 0x9c5a3c, 0xcfa77a, 0xe0d2b8, 0x8f6a52, 0xc98a62, 0xd9c7a8];
const MID_COL = [0xd6cfc2, 0xbfb8ac, 0xe3ddd0, 0xa9adb3, 0xcab79e, 0x9aa1a8];
const GLASS_COL = [0x5d86a8, 0x47758c, 0x6a7f99, 0x7aa0c0, 0x55708c, 0x4f7c9e, 0x8fb0cc];
const STONE_COL = [0xe9e2d4, 0xd8cfbf, 0xc9bda8, 0xefe9de, 0xb8ad9a];
const near = (x, z, w, d) => Math.hypot(Math.max(0, Math.abs(x) - w / 2), Math.max(0, Math.abs(z) - d / 2));
{
  const R = rng(911);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => {
    const b = { seed: R(), ...o };
    b.dN = near(b.x, b.z, b.w, b.d);
    // crushed by a shoe: the first time either shoe covers any of it (test its corners and middle)
    // (only near you: past ~2 km everything is knocked down by the second stomp before a shoe gets there)
    let vc = 1e9;
    if (b.dN < 2000) {
      vc = vCovered(b.x, b.z, Math.min(b.w, b.d) / 2);
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vc = Math.min(vc, vCovered(b.x + ox * b.w * 0.45, b.z + oz * b.d * 0.45, 0));
    }
    // ...or when your legs, hips, arms or head grow into it (before the second stomp knocks everything down)
    b.hit = b.dN < 2200 ? vBodyHit(b.x, b.z, b.w, b.d, b.h, 8000) : null;
    const st = b.dN < 2200 ? vStanceHit(b.x, b.z, b.w, b.d, b.h) : null;
    if (st && (!b.hit || st.v < b.hit.v)) b.hit = st;
    if (b.hit && b.hit.v < vc) vc = b.hit.v; else b.hit = null;
    b.vCrush = vc;
    b.vGlass = Math.min(vShock(b.x, b.z, 'glass'), b.vCrush);
    b.vTopple = vShock(b.x, b.z, 'topple');
    b.vFall = Math.min(b.vCrush, b.vTopple + R() * 0.5);
    b.dur = b.vCrush < b.vTopple ? 0.55 + 0.25 * R() : 1.6 + R() * 1.4;
    b.lean = (0.2 + R() * 0.3) * (R() < 0.5 ? -1 : 1);
    if (b.dN < CITY_R) B.push(b);
    return b;
  };
  // block frontage along every avenue, inner blocks behind; taller toward the middle of downtown
  const XS = [0, ...AVES_X];
  for (let x = -800; x >= -2600; x -= 200) XS.push(x);
  for (const ax of XS) {
    const roadHW = ax === 0 ? AVE.walk : AVE2_WALK;
    for (let k = -21; k <= 21; k++) {
      const zc = k * CROSS.step;
      const zA = zc + CROSS.walk + 0.5, zB = zc + CROSS.step - CROSS.walk - 0.5;
      for (const side of [-1, 1]) {
        if (ax === -2600 && side < 0) continue;
        if (ax === 1600 && side > 0) continue;
        const x0 = ax + side * (roadHW + 0.8);
        const span = 200 - roadHW - AVE2_WALK - 1.6;      // to the next avenue
        let z = zA;
        while (z < zB - 6) {
          const dist = Math.hypot(ax, zc);
          const core = clamp(1 - dist / 1400);
          let w = 16 + R() * 24;
          w = Math.min(w, zB - z);
          if (zB - z - w < 10) w = zB - z;
          const r = R();
          const kind = r < 0.3 - 0.15 * core ? 0 : r < 0.55 ? 1 : r < 0.8 ? 2 : 3;
          const dep = Math.min(span / 2 - 2, kind === 0 ? 14 + R() * 12 : 22 + R() * 34);
          const xc = x0 + side * dep / 2;
          let h;
          if (kind === 0) h = 8 + 3.6 * Math.floor(1 + R() * 4);
          else if (kind === 1) h = 25 + R() * 45 + core * 40;
          else h = 40 + Math.pow(R(), 1.3) * (90 + 170 * core) + (R() < 0.08 * core ? 120 : 0);
          // lower toward the edge of downtown (the neighbourhoods beyond are drawn on the ground)
          h = Math.max(7, h * clamp(1.2 - Math.hypot(xc, zc) / 2300, 0.2, 1));
          const col = kind === 0 ? pick(LOW_COL) : kind === 1 ? pick(MID_COL) : kind === 2 ? pick(GLASS_COL) : pick(STONE_COL);
          add({ kind, x: xc, z: z + w / 2, w: dep, d: w - 0.6, h, col, front: ax === 0 });
          // an inner building behind the frontage, toward the middle of the block
          if (R() < 0.75) {
            const dep2 = span / 2 - dep - 4;
            if (dep2 > 10) {
              const kind2 = R() < 0.5 ? 1 : R() < 0.6 ? 2 : 3;
              const h2 = Math.max(7, (kind2 === 1 ? 20 + R() * 40 : 35 + Math.pow(R(), 1.4) * (70 + 150 * core)) * clamp(1.2 - Math.hypot(ax, zc) / 2300, 0.2, 1));
              add({ kind: kind2, x: x0 + side * (dep + 2 + dep2 / 2), z: z + w / 2, w: dep2, d: w - 0.6, h: h2,
                col: kind2 === 1 ? pick(MID_COL) : kind2 === 2 ? pick(GLASS_COL) : pick(STONE_COL) });
            }
          }
          z += w;
        }
      }
    }
  }
}

// ---- street furniture: lamps, traffic signals, honey locusts on the sidewalks ----
export const LAMPS = [];
export const TREES = [];
{
  const R = rng(77);
  for (let z = -1500; z < 1500; z += 28) {
    if (Math.abs(z - Math.round(z / CROSS.step) * CROSS.step) < CROSS.walk + 2) continue;
    for (const side of [-1, 1]) LAMPS.push({ x: side * (AVE.road + 0.7), z: z + side * 6, side, seed: R() });
    for (const side of [-1, 1]) if (R() < 0.7) TREES.push({ x: side * (AVE.road + 3.0), z: z + 12 + R() * 4, h: 7 + R() * 3, seed: R() });
  }
  for (let x = -1500; x < 1500; x += 30) {
    if (Math.abs(x) < AVE.walk + 3) continue;
    for (const side of [-1, 1]) LAMPS.push({ x: x + side * 4, z: side * (CROSS.road + 0.7), side, seed: R(), ew: true });
  }
  for (const l of [...LAMPS, ...TREES]) {
    l.vCrush = vCovered(l.x, l.z, 0.4);
    l.vDown = Math.min(l.vCrush, vShock(l.x, l.z, 'glass', 40));
  }
}

// ---- cars: stopped where they were when you appeared; a taxi right in front of your right shoe ----
export const CARS = [];
{
  const R = rng(55);
  const COLS = [0xf4f4f2, 0x111214, 0x8c9198, 0xb3201e, 0x1d3f7a, 0xd8d2c4, 0x2a2c30, 0x2d6a4f, 0xe8e8e8, 0x60656c, 0x7a1f2b];
  const add = (o) => CARS.push({ seed: R(), kind: Math.floor(R() * 4), col: COLS[Math.floor(R() * COLS.length)], ...o });
  // the taxi: stopped broadside 1.2 m in front of your right toe at frame 0, in the crossing
  add({ x: TAXI.x, z: TAXI.z, yaw: Math.PI / 2 + 0.12, kind: 0, col: 0xf2c230, taxi: true, hero: true });
  // northbound (x > 0, heading -z) queued south of the crossing; southbound queued north of it
  for (const L of [3, 4, 5]) { let z = 15 + R() * 2; for (let n = 0; n < 22; n++) { if (R() > 0.12) add({ x: LANES[L] + (R() - 0.5) * 0.3, z: z + 2.3, yaw: (R() - 0.5) * 0.06 }); z += 6.2 + R() * 3.5; } }
  for (const L of [0, 1, 2]) { let z = -15 - R() * 2; for (let n = 0; n < 22; n++) { if (R() > 0.12) add({ x: LANES[L] + (R() - 0.5) * 0.3, z: z - 2.3, yaw: Math.PI + (R() - 0.5) * 0.06 }); z -= 6.2 + R() * 3.5; } }
  // the cross street, both ways
  for (const zl of [-5.4, -1.8]) { let x = 20 + R() * 2; for (let n = 0; n < 14; n++) { if (R() > 0.15) add({ x: x + 2.3, z: zl, yaw: Math.PI / 2 }); x += 6.2 + R() * 3.5; } }
  for (const zl of [1.8, 5.4]) { let x = -20 - R() * 2; for (let n = 0; n < 14; n++) { if (R() > 0.15) add({ x: x - 2.3, z: zl, yaw: -Math.PI / 2 }); x -= 6.2 + R() * 3.5; } }
  // a car caught in the crossing, turning, and one swerved onto the sidewalk
  add({ x: 6.8, z: 6.0, yaw: 0.7, kind: 2, col: 0x111214 });
  add({ x: -8.0, z: -7.5, yaw: Math.PI - 0.5, kind: 1, col: 0xd8d2c4 });
  for (const c of CARS) {
    c.d = Math.hypot(c.x, c.z);
    c.vCrush = vCovered(c.x, c.z, 1.6);
    c.vShock = vShock(c.x, c.z, 'glass', 0);
  }
}

// ---- the crowd: on the sidewalks and crosswalks, looking up at you, then running away from you ----
// Each person runs straight away from you, along their own street, so paths never cross; nobody starts where a
// growing shoe would overtake them (checked against the shoe's growth below).
export const CROWD0 = [];
{
  const R = rng(4040);
  const free = (x, z) => {
    for (const c of CARS) if (Math.abs(x - c.x) < 1.7 && Math.abs(z - c.z) < 3.2) return false;
    for (const p of CROWD0) if (Math.hypot(x - p.x, z - p.z) < 0.95) return false;
    return true;
  };
  let guard = 0;
  while (CROWD0.length < 560 && guard++ < 90000) {
    let x, z, run;
    const sA = R() < 0.5 ? -1 : 1, sB = R() < 0.5 ? -1 : 1;
    const rr = R();
    if (rr < 0.3) {
      // in the road, where they were crossing or got out of their cars: the empty lanes on each half of the avenue
      const north = R() < 0.45;
      x = north ? 0.6 + R() * 9.6 : -(0.6 + R() * 9.6); z = (north ? -1 : 1) * (4.5 + Math.pow(R(), 1.2) * 70); run = 'z';
    } else if (rr < 0.72) {
      // two lanes of the sidewalk: between the lamp posts and the tree pits, and between the trees and the shops
      const lane = R() < 0.4 ? [AVE.road + 1.3, AVE.road + 2.2] : [AVE.road + 3.8, AVE.walk - 0.6];
      x = sA * (lane[0] + R() * (lane[1] - lane[0])); z = (R() - 0.5) * 2 * (9 + Math.pow(R(), 1.3) * 110); run = 'z';
    } else {
      z = sB * (CROSS.road + 0.4 + R() * (CROSS.walk - CROSS.road - 0.9)); x = (R() - 0.5) * 2 * (16 + Math.pow(R(), 1.3) * 90); run = 'x';
    }
    if (Math.hypot(x, z) < 9 || !free(x, z)) continue;
    CROWD0.push({ x, z, run, seed: R() });
  }
}
