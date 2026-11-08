// The people: everyone running from the T. rex, toward you and past you on both sides. Planned up front so nobody runs
// through anybody, jumps, or changes size:
//   - on frame 0 the median is full of people running at you, some looking back; two stand filming it and run at 0:03;
//   - more pour out of the side street on the left (until 0:14, out of the herd's way) and along the sidewalk and the
//     promenade from the far end (round the corner of the last block, so nobody appears out of thin air);
//   - by 0:30 they have all gone past you: you're the last one on the street.
// Every path is checked once at load (0.2 s steps) against everyone else, you, the trees, lamps and benches, the cars'
// lanes, the T. rex and the Triceratops herd; a path that comes within reach of any of them is dropped.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, MED, CURB, FXW, QX, SIDE1, TREES, LAMPS, BENCHES } from './layout.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { PATH1, sRex1, PATH2, sRex2, CRUSH_CAR, SHOVE } from './rex.js';
import { TOSS_AT } from './traffic.js';
import { herdBlocks } from './herd.js';
import { V_STOMP, V_TOSS, V_SHOVE } from './timeline.js';

const SHIRTS = [0xe8e2d6, 0xd05030, 0x3a6ab0, 0xf0c060, 0xffffff, 0x60a0d0, 0x2a8a5a, 0xe86a8a, 0x1d2230, 0xc8d4e8, 0x8a5a8a, 0xf4a040, 0x24384a, 0xb8b0a0, 0x7a2a2a, 0x40b0b0];
const PANTS = [0x23252b, 0x2c3340, 0x4a6a9a, 0x8a7a66, 0xc9c2b6, 0x1a1a1a, 0x3a4a6a, 0xe8e2d6];

// a path: waypoints, a speed, the time it is at the first one; optionally standing still there until 'go'
function walker(pts, sp, t0, extra = {}) {
  const seg = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push({ a: pts[i], b: pts[i + 1], L0: L, d }); L += d; }
  return { pts, sp, t0, seg, L, ...extra };
}
function sOf(p, v) {
  if (p.go !== undefined) { const t = v - p.go; return t <= 0 ? 0 : t < 0.7 ? p.sp * t * t / 1.4 : p.sp * (t - 0.35); }
  return p.sp * (v - p.t0);
}
function posOf(p, v, out = {}) {
  const s = clamp(sOf(p, v), 0, p.L);
  let g = p.seg[p.seg.length - 1];
  for (const q of p.seg) if (s <= q.L0 + q.d) { g = q; break; }
  const u = g.d > 0 ? (s - g.L0) / g.d : 0;
  out.x = g.a[0] + (g.b[0] - g.a[0]) * u; out.z = g.a[1] + (g.b[1] - g.a[1]) * u;
  out.yaw = Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1]);
  out.s = s; out.moving = sOf(p, v) > 0 && sOf(p, v) < p.L;
  out.on = sOf(p, v) < p.L - 0.01 && out.z < 80;
  return out;
}

export const PEOPLE = [];
{
  const R = rng(7331);
  const obst = [
    ...TREES.map((t) => ({ x: t.x, z: t.z, r: 1.1 })), ...LAMPS.map((l) => ({ x: l.x, z: l.z, r: 0.5 })), ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.3 })),
  ];
  const STEPS = []; for (let v = -1.5; v <= 46; v += 0.2) STEPS.push(v);
  const HERO_CARS = [[CRUSH_CAR.x, CRUSH_CAR.z, -9, 99], [2.7, -22.6, -9, V_TOSS + 0.8], [TOSS_AT.x, TOSS_AT.z, V_TOSS + 1, 99], [TOSS_AT.x - 2.2, TOSS_AT.z - 0.6, V_TOSS + 1, 99], [SHOVE.x, SHOVE.z, -9, V_SHOVE + 1], [SHOVE.x + SHOVE.dx * 1.7, SHOVE.z + SHOVE.dz * 1.7, V_SHOVE, 99]];
  const rexAt = STEPS.map((v) => {
    const q = PATH1.at(sRex1(v)), q2 = PATH2.at(sRex2(v));
    const b = [-5, -1.5, 2, 4.8].map((a) => ({ x: q.x + Math.sin(q.yaw) * a, z: q.z + Math.cos(q.yaw) * a, r: a > 4 ? 1.6 : 2.4 }));
    if (v > 30) for (const a of [-5, -1.5, 2, 4.8]) b.push({ x: q2.x + Math.sin(q2.yaw) * a, z: q2.z + Math.cos(q2.yaw) * a, r: 3 });
    return b;
  });
  const herdAtS = STEPS.map((v) => herdBlocks(v));
  const tmp = {}, NK = STEPS.length;
  const TR = [];                                   // the accepted paths, sampled: x, z (NaN when not on the street)
  const fits = (p) => {
    const xs = new Float32Array(NK), zs = new Float32Array(NK);
    for (let k = 0; k < NK; k++) {
      const v = STEPS[k];
      const a = posOf(p, v, tmp);
      xs[k] = NaN; zs[k] = NaN;
      if (!a.on || a.z > 75) continue;
      xs[k] = a.x; zs[k] = a.z;
      // out of the car lanes, except across the zebra crossing at the side street
      const bx = Math.abs(a.x);
      if (bx > MED - 0.4 && bx < CURB + 0.4 && !(a.z > SIDE1[0] + 3 && a.z < SIDE1[1] - 3)) return false;
      if (Math.hypot(a.x - CAM0.x, a.z - CAM0.z) < 1.5) return false;
      for (const o of obst) if ((a.x - o.x) ** 2 + (a.z - o.z) ** 2 < o.r * o.r) return false;
      // the cars that stand where people run: the crushed taxi, the one it bites, where that one lands, the one it knocks aside
      for (const [cx, cz, t0, t1] of HERO_CARS) if (v >= t0 && v <= t1 && (a.x - cx) ** 2 + (a.z - cz) ** 2 < 9) return false;
      for (const o of rexAt[k]) if ((a.x - o.x) ** 2 + (a.z - o.z) ** 2 < o.r * o.r) return false;
      for (const o of herdAtS[k]) if ((a.x - o.x) ** 2 + (a.z - o.z) ** 2 < (o.r + 0.6) ** 2) return false;
      for (const t of TR) { const dx = a.x - t.xs[k], dz = a.z - t.zs[k]; if (dx * dx + dz * dz < 0.5625) return false; }
    }
    TR.push({ xs, zs });
    return true;
  };
  const add = (p) => { if (fits(p)) { PEOPLE.push(p); return true; } return false; };
  const SP = () => 3.6 + R() * 1.9;
  // ---- right in front of you on frame 0 (hand placed, in the zoomed view): [x, z at 0:00, speed] ----
  for (const [x, z, sp] of [[-0.95, -3, 4.3], [1.15, -7.5, 4.7], [-1.6, -10.5, 3.9], [0.35, -14, 5.0], [1.9, -17.5, 4.4], [-0.55, -21, 4.8], [2.5, -24.5, 4.1], [-2.1, -27, 4.6], [0.9, -29.5, 4.0], [-1.2, -31.5, 3.7]]) {
    add(walker([[x, z - sp * 3], [x * 1.15, 90]], sp, -3, { near: true, panic: R() < 0.4 }));
  }
  // two people filming it, who turn and run when the ground shakes
  add(walker([[1.25, -6.2], [1.25, -6.0], [1.6, 90]], 4.6, 0, { go: V_STOMP + 0.15, film: true }));
  add(walker([[-1.5, -12.5], [-1.5, -12.3], [-1.8, 90]], 4.2, 0, { go: V_STOMP + 0.4, film: true }));
  // ---- the rest of the first crowd on the median, between it and you ----
  for (let k = 0; k < 900 && PEOPLE.length < 70; k++) {
    const x = (R() - 0.5) * 2 * (MED - 0.6), z = -34 + R() * 42, sp = SP();
    add(walker([[x, z - sp * 3], [x + (R() - 0.5) * 1.5, 90]], sp, -3, { panic: R() < 0.3 }));
  }
  // ---- out of the side street on the left: along the crossing, then down the median at you ----
  for (let k = 0; k < 900 && PEOPLE.length < 105; k++) {
    const zc = (SIDE1[0] + SIDE1[1]) / 2 + (R() - 0.5) * 4, x1 = -MED + 0.7 + R() * (2 * MED - 1.4), sp = SP();
    add(walker([[-34, zc], [x1 - 1.5, zc + 1], [x1, zc + 4], [x1 + (R() - 0.5), 90]], sp, -2 + R() * 10.5, { panic: R() < 0.3 }));
  }
  // ---- along the west sidewalk and the promenade from the far end (round the corner of the cross street) ----
  for (let k = 0; k < 1400 && PEOPLE.length < 175; k++) {
    const west = R() < 0.45, sp = SP();
    const x = west ? -FXW + 0.8 + R() * (FXW - CURB - 1.6) : CURB + 0.9 + R() * (QX - CURB - 2.2);
    const t0 = -16 + R() * 10;
    add(walker([[west ? -32 : -26, -121], [x, -121 + (R() - 0.5) * 3], [x + (R() - 0.5), 90]], sp, t0, { panic: R() < 0.2 }));
  }
  // ---- already on the sidewalk and the promenade on frame 0 ----
  for (let k = 0; k < 1400 && PEOPLE.length < 235; k++) {
    const west = R() < 0.45, sp = SP();
    const x = west ? -FXW + 0.8 + R() * (FXW - CURB - 1.6) : CURB + 0.9 + R() * (QX - CURB - 2.2);
    const z = -100 + R() * 108;
    add(walker([[x, z - sp * 3], [x + (R() - 0.5), 90]], sp, -3, { panic: R() < 0.2 }));
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.35;
    p.s = R() < 0.06 ? 0.7 : 0.92 + R() * 0.16;
    p.ph = R() * 10;
    p.back = R() < 0.25;            // looks back over the shoulder now and then
  });
  console.log(`people: ${PEOPLE.length}`);
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  const a = {};
  return {
    crowd,
    frame(v) {
      for (const p of PEOPLE) {
        posOf(p, v, a);
        if (!a.on) { crowd.pose(p.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
        let yaw = a.yaw, stride = 1.7, walk = a.s * 2.2 + p.ph, armL = 0, armR = 0, look = 0, pitch = 0.12;
        if (p.film && !a.moving && sOf(p, v) <= 0) {
          // filming: facing it, phone up, until the ground shakes; then a quick turn
          const turn = smooth(p.go - 0.05, p.go + 0.35, v);
          yaw = Math.PI * (1 - turn) + 0 * turn; stride = 0; walk = 0; armR = 1.0 * (1 - turn); armL = 0.25; look = 0.3; pitch = 0;
        } else if (p.film) {
          const turn = smooth(p.go - 0.05, p.go + 0.35, v);
          yaw = lerp(Math.PI, a.yaw, turn); stride = 1.7 * smooth(p.go, p.go + 0.6, v);
        }
        if (p.panic) { armL = 1.35 + 0.15 * Math.sin(v * 9 + p.ph); armR = 1.3 + 0.15 * Math.sin(v * 8 + p.ph); }
        // a look back over the shoulder (the body twists a little)
        if (p.back) yaw += 0.5 * Math.max(0, Math.sin(v * 0.9 + p.ph)) ** 4;
        crowd.pose(p.i, { x: a.x, y: 0, z: a.z, yaw, s: p.s, walk, stride, pitch, armL, armR, look });
      }
      crowd.commit();
    },
  };
}
