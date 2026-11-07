// The people in the plaza and on the sidewalks. Planned up front so nobody walks through anybody, jumps or changes size:
//   - on frame 0 the street is busy: people walking both ways, some stopped to film the white wall coming up the avenue,
//     a few pointing at it, a kid with a parent right in front of you;
//   - when the frost reaches you (0:03) everyone hugs themselves, their breath fogs, and the walkers slow to a shuffle;
//   - at 0:15 they freeze mid-step, exactly as they are, and turn to ice. Nobody is ever shown hurt.
// Every walker's path is checked once at load against everyone else (0.25 s steps) and against the fountain, the trees,
// the benches and you; a path that comes within 0.8 m of anything is dropped.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, FX, PROM, ROAD_X, FOUNT, TREES, BENCHES, groundY } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_FROST, V_STILL } from './timeline.js';
import { frostify } from './frost.js';

const SHIRTS = [0xe8e2d6, 0xd05030, 0x3a6ab0, 0xf0c060, 0xffffff, 0x60a0d0, 0x2a8a5a, 0xe86a8a, 0x1d2230, 0xc8d4e8, 0x8a5a8a, 0xf4a040, 0x24384a, 0xb8b0a0, 0x7a2a2a, 0x40b0b0];
const PANTS = [0x23252b, 0x2c3340, 0x4a6a9a, 0x8a7a66, 0xc9c2b6, 0x1a1a1a, 0x3a4a6a, 0xe8e2d6];

// how far a walker has gone along their line by time v: full pace, then a slow shuffle once the frost is on them,
// then nothing: they freeze at V_STILL in mid-step
const SLOW = 0.42, TAU = 0.8;
function walkDist(p, v) {
  const t = Math.min(v, V_STILL);
  if (t <= V_FROST) return p.sp * t;
  const u = t - V_FROST;
  return p.sp * V_FROST + p.sp * SLOW * u + p.sp * (1 - SLOW) * TAU * (1 - Math.exp(-u / TAU));
}
const speedAt = (p, v) => (v >= V_STILL ? 0 : v <= V_FROST ? p.sp : p.sp * (SLOW + (1 - SLOW) * Math.exp(-(v - V_FROST) / TAU)));

export const PEOPLE = [];
{
  const R = rng(9137);
  const at = (a, r) => ({ x: CAM0.x + r, z: CAM0.z - a });
  const obstacles = [
    { x: FOUNT.x, z: FOUNT.z, r: FOUNT.r + 0.5 },
    ...TREES.map((t) => ({ x: t.x, z: t.z, r: 1.2 })),
    ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.3 })),
    { x: CAM0.x, z: CAM0.z, r: 1.3 },
  ];
  const posAt = (p, v) => (p.dir ? { x: p.x, z: p.z + p.dir * walkDist(p, v) } : { x: p.x, z: p.z });
  const STEPS = []; for (let v = -1.2; v <= V_STILL + 0.01; v += 0.25) STEPS.push(v);
  const fits = (p) => {
    for (const v of STEPS) {
      const a = posAt(p, v);
      if (p.walkOn && (Math.abs(a.x) > FX - 0.5)) return false;
      if (!p.near && Math.abs(a.x - CAM0.x) < 2.6 && a.z < CAM0.z - 13) return false;      // (the walkway down the middle stays clear: you see down the hill)
      if (obstacles.some((o) => (a.x - o.x) ** 2 + (a.z - o.z) ** 2 < o.r * o.r)) return false;
      for (const q of PEOPLE) { const b = posAt(q, v); if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 0.8 * 0.8) return false; }
    }
    return true;
  };
  const add = (p) => { if (fits(p)) { PEOPLE.push(p); return true; } return false; };
  // right in front of you (hand placed): [ahead, right, act, dir, speed, scale]
  const NEAR = [
    [2.6, -1.9, 'walk', 1, 1.25, 1.0], [3.4, 1.4, 'phone', 0, 0, 0.96], [4.2, -2.4, 'point', 0, 0, 1.02],
    [5.0, -0.3, 'walk', -1, 1.3, 0.98], [4.4, 2.6, 'kid', 0, 0, 0.62], [4.5, 3.25, 'hold', 0, 0, 1.0],
    [6.2, -2.1, 'phone', 0, 0, 0.95], [7.4, 1.8, 'walk', 1, 1.15, 1.04], [3.1, -3.3, 'look', 0, 0, 0.97],
    [8.6, -2.6, 'walk', -1, 1.35, 0.95], [9.6, 2.5, 'phone', 0, 0, 1.0], [11.5, -1.6, 'point', 0, 0, 0.96],
  ];
  for (const [a, r, act, dir, sp, s] of NEAR) add({ ...at(a, r), act, dir, sp, s, near: true });
  // the crowd: walkers in the plaza and on the sidewalks, both ways; people stopped to watch
  const areas = [
    [-6.2, 6.2, -60, 6, 120, 0.55],
    [-6.2, 6.2, -100, -60, 24, 0.6],
    [-FX + 0.8, -ROAD_X - 0.6, -104, 30, 60, 0.7], [ROAD_X + 0.6, FX - 0.8, -104, 30, 60, 0.7],
    [-6.2, 6.2, 9, 22, 12, 0.8],
  ];
  for (const [x0, x1, z0, z1, n, pw] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 25 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      const walk = R() < pw;
      const p = { x, z, s: R() < 0.07 ? 0.66 : 0.92 + R() * 0.16, dir: walk ? (R() < 0.5 ? 1 : -1) : 0, sp: 1.15 + R() * 0.35, walkOn: Math.abs(x) > PROM };
      p.act = walk ? 'walk' : R() < 0.55 ? 'phone' : R() < 0.4 ? 'point' : 'look';
      // (a gap straight ahead of you, so you can see down the avenue)
      { const dx = p.x - CAM0.x, dz = CAM0.z - p.z; if (!walk && dz > 2 && dz < 40 && Math.abs(dx) < 0.6 + dz * 0.04) continue; }
      if (add(p)) placed++;
    }
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.35;                          // (a summer day: most in short sleeves)
    p.ph = R() * 10;
    p.yaw0 = Math.PI + (R() - 0.5) * 0.7;            // the ones standing face north, toward the wall
    p.tHug = V_FROST - 0.1 + R() * 0.9;              // when the cold hits them
    p.breathPh = R() * 1.7;
  });
}

export function makePeople(scene) {
  const ice = { value: 0 };
  const mat = frostify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), { boost: ice, base: 0.3 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  return {
    crowd, ice,
    frame(v, s, smoke) {
      ice.value = smooth(V_STILL - 0.1, V_STILL + 1.6, v);
      const tv = Math.min(v, V_STILL);                       // (everything about them stops at V_STILL)
      for (const p of PEOPLE) {
        let x = p.x, z = p.z, yaw = p.yaw0, walk = 0, stride = 0, armL = 0, armR = 0, look = 0.25, pitch = 0, roll = 0;
        yaw += wobble(tv * 0.35, p.ph) * 0.15;
        const hug = smooth(p.tHug, p.tHug + 0.5, tv);
        const shiver = hug * Math.sin(tv * 31 + p.ph) * 0.02;
        if (p.dir) {
          const d = walkDist(p, tv);
          z += p.dir * d;
          yaw = p.dir > 0 ? 0 : Math.PI;
          const sp = speedAt(p, tv);
          walk = d * 4.0 + p.ph;
          stride = 0.6 + 0.4 * sp / p.sp;
          // walking into the wind: heads down, arms in
          look = lerp(0.1, -0.25, hug);
        } else if (p.act === 'phone') { armR = 1.0; armL = 0.25; look = 0.3; }
        else if (p.act === 'point') { armL = 1.1 + 0.4 * smooth(0.3, 0.9, tv + p.ph % 1); armR = 0.1; look = 0.35; }
        else if (p.act === 'look') { armR = 1.25 * smooth(0, 0.4, tv + 0.4); look = 0.35; }
        else if (p.act === 'kid') { armR = 0.85; look = 0.5; yaw = Math.PI - 0.2; }
        else if (p.act === 'hold') { armL = 0.35; look = 0.2; yaw = Math.PI + 0.25; }
        // the cold: arms wrapped round themselves (the phones come down), shoulders up, a shiver
        if (p.act !== 'kid' && p.act !== 'hold') { armL = lerp(armL, 0.62, hug); armR = lerp(armR, 0.62, hug); }
        else { armL = lerp(armL, 0.62, hug * 0.6); }
        pitch += 0.08 * hug; roll += shiver;
        crowd.pose(p.i, { x, y: groundY(z), z, yaw, s: p.s, walk, stride, sit: 0, pitch, roll, armL, armR, look });
        // their breath, every 1.7 s or so, from 0:01 (it shows once it's under about 45°F) until they freeze
        if (s.breath > 0.01 && smoke && (p.near || Math.abs(x - CAM0.x) < 9 && CAM0.z - z < 30)) {
          const T = 1.7, k = Math.floor((v + p.breathPh) / T), age = v + p.breathPh - k * T;
          const t0 = v - age;
          const a = s.breath * (t0 < V_STILL - 0.2 ? 1 : 0);
          if (a > 0 && age < 1.4) {
            const fx = Math.sin(yaw), fz = Math.cos(yaw);
            const hy = 1.62 * p.s - 0.05 + groundY(z);
            const out = 0.18 + 0.5 * age;
            smoke.puff(x + fx * out * p.s, hy + 0.1 * age, z + fz * out * p.s, (0.09 + 0.22 * age) * p.s, 0.5 * a * (1 - smooth(0.3, 1.4, age)), 1.0, 0, (p.i * 0.37 + k * 0.11) % 1);
          }
        }
      }
      crowd.commit();
    },
  };
}
