// The people in the plaza and on the sidewalks, planned up front so nobody walks through anybody, jumps or changes size:
//   - frame 0: a packed plaza at noon; most stand facing the too-big Sun, a hand up shielding their eyes; some film it;
//     walkers both ways; people right in front of you;
//   - from 0:05 they run for shade, one after another: in the plaza they turn and run past you, away from the Sun (a stream
//     of them from far down the avenue keeps coming until ~0:28); a few huddle in the shade of the plaza trees until the
//     trees catch fire (0:19), then run too; on the sidewalks they duck into the shops (gone through the door);
//   - nobody is ever shown hurt; after ~0:30 the street is empty.
// Every path is checked once at load against everyone else (0.25 s steps) and against the fountain, the trees, the benches,
// the sign and you; a path that comes within 0.75 m of anything is dropped (or tried with another line).
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, FX, PROM, ROAD_X, FOUNT, TREES, BENCHES, SIGN, groundY } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_SHADE, V_TREES } from './timeline.js';
import { CARS } from './traffic.js';

const SHIRTS = [0xe8e2d6, 0xd05030, 0x3a6ab0, 0xf0c060, 0xffffff, 0x60a0d0, 0x2a8a5a, 0xe86a8a, 0x1d2230, 0xc8d4e8, 0x8a5a8a, 0xf4a040, 0x24384a, 0xb8b0a0, 0x7a2a2a, 0x40b0b0];
const PANTS = [0x23252b, 0x2c3340, 0x4a6a9a, 0x8a7a66, 0xc9c2b6, 0x1a1a1a, 0x3a4a6a, 0xe8e2d6];
const TAU = 0.4;                                          // how fast a runner gets up to speed (s)
const runD = (sp, u) => (u <= 0 ? 0 : sp * (u - TAU * (1 - Math.exp(-u / TAU))));
const T_END = 34;

export const PEOPLE = [];
// where person p is at time v, and how fast they're going: { x, z, sp, vis, phase: 'before' | 'run' | 'still' | 'run2' }
export function posAt(p, v) {
  let x = p.x, z = p.z;
  if (p.dir) z += p.dir * p.sp * Math.min(v, p.tRun);
  if (v < p.tRun) return { x, z, sp: p.dir ? p.sp : 0, vis: true, phase: 'before', d: p.dir ? p.sp * v : 0 };
  const u = v - p.tRun;
  if (p.plan === 'run') {
    const d = runD(p.rs, u);
    return { x: x + p.rx * d, z: z + p.rz * d, sp: p.rs * (1 - Math.exp(-u / TAU)), vis: true, phase: 'run', d };
  }
  if (p.plan === 'shop' || p.plan === 'tree') {
    const L = Math.hypot(p.tx - x, p.tz - z), d = Math.min(runD(p.rs, u), L), k = L > 0 ? d / L : 1;
    const px = x + (p.tx - x) * k, pz = z + (p.tz - z) * k;
    if (p.plan === 'shop') return { x: px, z: pz, sp: d < L ? p.rs : 0, vis: Math.abs(px) < FX + 0.25, phase: 'run', d };
    if (v < p.tFlee) return { x: px, z: pz, sp: d < L - 0.01 ? p.rs : 0, vis: true, phase: d < L - 0.01 ? 'run' : 'still', d };
    const d2 = runD(p.rs, v - p.tFlee), qx = p.tx + p.fx * d2;
    return { x: qx, z: p.tz + p.fz * d2, sp: p.rs, vis: Math.abs(qx) < FX + 0.25, phase: 'run2', d: L + d2 };
  }
  return { x, z, sp: 0, vis: true, phase: 'still', d: 0 };
}
{
  const R = rng(9137);
  const at = (a, r) => ({ x: CAM0.x + r, z: CAM0.z - a });
  const obstacles = [
    { x: FOUNT.x, z: FOUNT.z, r: FOUNT.r + 0.45 },
    ...TREES.map((t) => ({ x: t.x, z: t.z, r: 0.75, tree: t })),
    ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.25 })),
    { x: SIGN.x, z: SIGN.z, r: 0.5 },
    { x: CAM0.x, z: CAM0.z, r: 1.15 },
    { x: -0.3, z: 0.5, r: 1.15 },                                    // (where you stand for the fountain: main.js P2)
  ];
  // the stopped cars (people crossing the road go round them)
  const PARKED = CARS.map((c) => ({ x: c.x, z: c.zs[c.zs.length - 1] }));
  const STEPS = []; for (let v = -1.2; v <= T_END; v += 0.25) STEPS.push(v);
  // (everyone already placed keeps their track at every step, so a new path is checked against arrays, not recomputed)
  const NS = STEPS.length, TX = [], TZ = [];
  const fits = (p) => {
    for (let k = 0; k < NS; k++) {
      const v = STEPS[k];
      const a = posAt(p, v);
      if (!a.vis) break;
      if (a.z > CAM0.z + 110) break;   // (well behind you: out of the picture for good)
      const onRoad = Math.abs(a.x) > PROM - 0.45 && Math.abs(a.x) < ROAD_X + 0.6;
      if (onRoad && p.plan !== 'shop' && a.phase !== 'run2') return false;   // (nobody walks down the road)
      if (onRoad && PARKED.some((c) => Math.abs(c.x - a.x) < 1.45 && Math.abs(c.z - a.z) < 2.9)) return false;
      // (the line from where you stand to the fountain stays clear while you look at it, 0:10.5-0:16)
      if (v > 10.3 && v < 16.4) {
        const ax = -0.3, az = 0.5, bx = FOUNT.x - 1.2, bz = FOUNT.z + 2.6, ux = bx - ax, uz = bz - az;
        const t = clamp(((a.x - ax) * ux + (a.z - az) * uz) / (ux * ux + uz * uz));
        const cx = ax + ux * t - a.x, cz = az + uz * t - a.z;
        if (t < 0.8 && cx * cx + cz * cz < (0.9 + 0.5 * t) ** 2) return false;
      }
      if (obstacles.some((o) => !(o.tree && o.tree === p.treeO) && (a.x - o.x) ** 2 + (a.z - o.z) ** 2 < o.r * o.r)) return false;
      for (let q = 0; q < TX.length; q++) { const dx = a.x - TX[q][k], dz = a.z - TZ[q][k]; if (dx * dx + dz * dz < 0.5625) return false; }
    }
    return true;
  };
  const keep = (p) => {
    const tx = new Float32Array(NS), tz = new Float32Array(NS);
    for (let k = 0; k < NS; k++) { const a = posAt(p, STEPS[k]); tx[k] = a.vis ? a.x : 1e5; tz[k] = a.vis ? a.z : 1e5; }
    TX.push(tx); TZ.push(tz);
  };
  // every person's escape: try a few lines, keep the first that fits
  const plan = (p, near) => {
    p.rs = 3.4 + R() * 1.6;
    const south = p.z > CAM0.z + 1;
    // (everyone is past you or indoors by ~0:28: the far ones have to set off sooner)
    const reach = Math.max(0, CAM0.z + 6 - p.z) / p.rs + 0.6;
    p.tRun = near ? V_SHADE + 0.15 + R() * 0.9 : south ? 9.6 + R() * 2.2 : V_SHADE + Math.min(Math.pow(R(), 1.4) * 16, Math.max(0.3 * R(), 28 - V_SHADE - reach));
    let side = Math.abs(p.x) > PROM;
    // (too far down the avenue to get past you by ~0:27: across the road into the shops instead)
    if (!side && !near && !south && p.tRun + reach > 26.5) {
      p.tRun = Math.max(p.tRun, 6.4); p.rs = 3.4 + R() * 1.2; p.plan = 'shop';
      const sd = p.x === 0 ? 1 : Math.sign(p.x + (R() - 0.5) * 4) || 1;
      for (let k = 0; k < 6; k++) {
        p.tx = sd * (FX + 0.8); p.tz = p.z + p.dir * p.sp * p.tRun + (R() - 0.5) * 6;
        if (fits(p)) return true;
        p.tRun += 0.4;
      }
      return false;
    }
    if (side) {                                                       // sidewalk: into the nearest shop door
      p.plan = 'shop'; p.tx = Math.sign(p.x) * (FX + 0.8); p.tz = p.z + p.dir * p.sp * p.tRun + (R() - 0.5) * 3; p.rs = 2.6 + R();
      return fits(p);
    }
    // a few huddle in a tree's shade until the trees burn
    const tr = TREES.filter((t) => Math.abs(t.z - (p.z - (p.dir || 0))) < 9 && t.z < CAM0.z - 4);
    if (!near && tr.length && R() < 0.22) {
      const t = tr[Math.floor(R() * tr.length)], a = R() * Math.PI * 2, rr = 0.95 + R() * 0.7;
      Object.assign(p, { plan: 'tree', treeO: t, tx: t.x + Math.cos(a) * rr, tz: t.z + Math.sin(a) * rr, tFlee: V_TREES + 0.1 + R() * 0.8, rs: 3.6 + R() * 1.2 });
      // (when the tree goes up: across the road into a shop)
      const fl = Math.sign(p.tx || 1) * (Math.PI / 2 - 0.25 + 0.5 * R());
      p.fx = Math.sin(fl); p.fz = Math.cos(fl);
      if (fits(p)) return true;
      p.treeO = undefined;
    }
    p.plan = 'run';
    for (let k = 0; k < 7; k++) {
      // run south past you, a little to one side; pass you at least ~1.4 m away
      if (p.z > CAM0.z + 1) { const a = (R() - 0.5) * 0.5; p.rx = Math.sin(a); p.rz = Math.cos(a); if (fits(p)) return true; p.tRun += 0.3; continue; }
      const sx = p.x - CAM0.x;
      const lane = Math.abs(sx) < 1.4 ? (sx < 0 ? -1.6 - R() * 2.5 : 1.6 + R() * 2.5) : sx * (0.7 + 0.5 * R());
      const zEnd = CAM0.z + 120, dx = CAM0.x + clamp(lane, -5.6, 5.6) - p.x, dz = zEnd - p.z;
      const L = Math.hypot(dx, dz);
      p.rx = dx / L; p.rz = dz / L;
      if (fits(p)) return true;
      p.tRun += 0.35;
    }
    return false;
  };
  const add = (p, near) => { if (plan(p, near)) { PEOPLE.push(p); keep(p); return true; } return false; };
  // right in front of you (hand placed): [ahead, right, act, dir, speed, scale]
  const NEAR = [
    [2.4, -1.7, 'shield', 0, 0, 1.0], [3.2, 1.3, 'phone', 0, 0, 0.96], [4.0, -2.6, 'shield', 0, 0, 1.02],
    [4.8, 0.2, 'shield', 0, 0, 0.98], [4.3, 2.5, 'kid', 0, 0, 0.62], [4.4, 3.15, 'hold', 0, 0, 1.0],
    [6.0, -1.5, 'phone', 0, 0, 0.95], [7.2, 1.6, 'walk', 1, 1.25, 1.04], [3.1, -3.4, 'shield', 0, 0, 0.97],
    [8.4, -2.8, 'walk', 1, 1.3, 0.95], [9.6, 2.4, 'shield', 0, 0, 1.0], [11.0, -1.0, 'point', 0, 0, 0.96], [6.6, 3.6, 'shield', 0, 0, 1.0],
  ];
  for (const [a, r, act, dir, sp, s] of NEAR) add({ ...at(a, r), act, dir, sp, s, near: true }, true);
  // the crowd: in the plaza and on the sidewalks, both ways; most stopped, looking at the Sun
  const areas = [
    [-6.2, 6.2, -60, 2, 150, 0.3],
    [-6.2, 6.2, -104, -60, 60, 0.3],
    [-6.2, 6.2, 10.5, 48, 70, 0.15],
    [-FX + 0.8, -ROAD_X - 0.6, -104, 30, 60, 0.6], [ROAD_X + 0.6, FX - 0.8, -104, 30, 60, 0.6],
  ];
  for (const [x0, x1, z0, z1, n, pw] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 25 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      const walk = R() < pw;
      const p = { x, z, s: R() < 0.07 ? 0.66 : 0.92 + R() * 0.16, dir: walk ? (R() < 0.5 ? 1 : -1) : 0, sp: 1.15 + R() * 0.35 };
      p.act = walk ? 'walk' : R() < 0.55 ? 'shield' : R() < 0.6 ? 'phone' : 'point';
      { const dx = p.x - CAM0.x, dz = CAM0.z - p.z; if (!walk && dz > 2 && dz < 40 && Math.abs(dx) < 0.5 + dz * 0.03) continue; }
      if (add(p, false)) placed++;
    }
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.25;
    p.ph = R() * 10;
    p.yaw0 = Math.PI + (R() - 0.5) * 0.7;            // the ones standing face north, toward the Sun
    if (p.z > CAM0.z + 1 && p.act === 'point') p.yaw0 = (R() - 0.5) * 0.6;   // (behind you: pointing back at Venus)
    p.cover = R() < 0.55;                            // runs with an arm over the head
  });
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  return {
    crowd,
    frame(v) {
      for (const p of PEOPLE) {
        const a = posAt(p, v);
        if (!a.vis || a.z > CAM0.z + 110) { crowd.pose(p.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
        let yaw = p.yaw0 + wobble(v * 0.35, p.ph) * 0.12, walk = 0, stride = 0, armL = 0, armR = 0, look = 0.3, pitch = 0, roll = 0;
        if (a.phase === 'before') {
          if (p.dir) { yaw = p.dir > 0 ? 0 : Math.PI; walk = a.d * 4.0 + p.ph; stride = 1; look = 0.05; armL = 0.15; }
          else if (p.act === 'shield') { armR = 1.32 + 0.05 * Math.sin(v * 0.7 + p.ph); look = 0.42; pitch = -0.03; }
          else if (p.act === 'phone') { armR = 1.05; armL = 0.3; look = 0.4; }
          else if (p.act === 'point') { armL = 1.15 + 0.3 * smooth(0.3, 0.9, (v + p.ph) % 1); armR = 1.3; look = 0.45; }
          else if (p.act === 'kid') { armR = 1.3; look = 0.55; yaw = Math.PI - 0.2; }
          else if (p.act === 'hold') { armL = 0.35; armR = 1.3; look = 0.4; yaw = Math.PI + 0.25; }
          // everyone squints at it: a hand comes up as it gets brighter
          if (!p.dir && p.act !== 'phone') armR = Math.max(armR, 1.25);
        } else if (a.phase === 'run' || a.phase === 'run2') {
          const vx = a.phase === 'run2' ? p.fx : p.plan === 'run' ? p.rx : p.tx - p.x, vz = a.phase === 'run2' ? p.fz : p.plan === 'run' ? p.rz : p.tz - p.z;
          const tgt = Math.atan2(vx, vz);
          // (they turn round over the first few steps)
          const u = clamp((v - (a.phase === 'run2' ? p.tFlee : p.tRun)) / 0.45);
          const y0 = a.phase === 'run2' ? p.yaw0 + 0.6 : p.dir ? (p.dir > 0 ? 0 : Math.PI) : p.yaw0;
          let dy = tgt - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          yaw = y0 + dy * smooth(0, 1, u);
          walk = a.d * 2.4 + p.ph; stride = lerp(1.0, 1.6, clamp(a.sp / 3.4));
          look = -0.15; pitch = 0.1 * clamp(a.sp / 3.4);
          if (p.cover) { armL = 1.5; } else { armL = 0.1; }
        } else {
          // huddled in the shade: heads down, arms in
          yaw = p.yaw0 + 2.4 + p.ph; look = -0.3; pitch = 0.06; armL = 0.5; armR = 0.5;
        }
        crowd.pose(p.i, { x: a.x, y: groundY(a.z), z: a.z, yaw, s: p.s, walk, stride, sit: 0, pitch, roll, armL, armR, look });
      }
      crowd.commit();
    },
  };
}
