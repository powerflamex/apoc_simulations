// The people on Canal Street, planned up front so nobody walks through anybody, jumps or changes size:
//   - frame 0: a packed neutral ground and sidewalks on a summer evening; everyone has stopped, facing the rock in the sky
//     down the street: pointing up at it, filming it, hands on their heads; a few still walking;
//   - the flash (0:07): every arm goes up over the eyes, some turn their backs on it;
//   - the heat (from 0:12): they run for cover, one after another: on the neutral ground they turn and run past you, away
//     from it (a stream from far down the street keeps coming until ~0:28); on the sidewalks into the shops;
//   - a few take cover in the doorways and under the balconies right beside you and stay: they crouch when the ground
//     shakes and at the end. Nobody is ever shown hurt.
// Every path is checked once at load against everyone else (0.25 s steps) and against the palms, the benches, the
// streetcar and you; a path that comes within 0.75 m of anything is dropped (or tried with another line).
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, FX, PROM, ROAD_X, TREES, BENCHES, STREETCAR, groundY } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_RUN, V_FLASH, V_QUAKE, V_HIT, V_FLAME, V_WALL } from './timeline.js';
import { CARS } from './traffic.js';

const SHIRTS = [0xe8e2d6, 0xd05030, 0x3a6ab0, 0xf0c060, 0xffffff, 0x60a0d0, 0x2a8a5a, 0xe86a8a, 0x1d2230, 0xc8d4e8, 0x8a5a8a, 0xf4a040, 0x24384a, 0xb8b0a0, 0x7a2a2a, 0x40b0b0];
const PANTS = [0x23252b, 0x2c3340, 0x4a6a9a, 0x8a7a66, 0xc9c2b6, 0x1a1a1a, 0x3a4a6a, 0xe8e2d6];
const TAU = 0.4;
const runD = (sp, u) => (u <= 0 ? 0 : sp * (u - TAU * (1 - Math.exp(-u / TAU))));
const T_END = 34;

export const PEOPLE = [];
export function posAt(p, v) {
  let x = p.x, z = p.z;
  // the walkers stop and stare within a couple of seconds
  if (p.dir) { const t = Math.min(v, p.tStop); z += p.dir * p.sp * (t < 0 ? t : t - t * t / (2 * p.tStop)); }
  if (v < p.tRun) return { x, z, sp: p.dir && v < p.tStop ? p.sp * (1 - Math.max(v, 0) / p.tStop) : 0, vis: true, phase: 'before', d: 0 };
  const u = v - p.tRun;
  if (p.plan === 'run') {
    const d = runD(p.rs, u);
    return { x: x + p.rx * d, z: z + p.rz * d, sp: p.rs * (1 - Math.exp(-u / TAU)), vis: true, phase: 'run', d };
  }
  if (p.plan === 'stay') return { x, z, sp: 0, vis: true, phase: 'hid', d: 0 };
  if (p.plan === 'shop' || p.plan === 'hide') {
    const L = Math.hypot(p.tx - x, p.tz - z), d = Math.min(runD(p.rs, u), L), k = L > 0 ? d / L : 1;
    const px = x + (p.tx - x) * k, pz = z + (p.tz - z) * k;
    if (p.plan === 'shop') return { x: px, z: pz, sp: d < L ? p.rs : 0, vis: Math.abs(px) < FX + 0.25, phase: 'run', d };
    return { x: px, z: pz, sp: d < L - 0.01 ? p.rs : 0, vis: true, phase: d < L - 0.01 ? 'run' : 'hid', d };
  }
  return { x, z, sp: 0, vis: true, phase: 'still', d: 0 };
}
{
  const R = rng(66066);
  const at = (a, r) => ({ x: CAM0.x + r, z: CAM0.z - a });
  const SC = STREETCAR;
  const obstacles = [
    ...TREES.map((t) => ({ x: t.x, z: t.z, r: 0.75 })),
    ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.25 })),
    { x: CAM0.x, z: CAM0.z, r: 1.15 },
  ];
  const inCar = (x, z) => Math.abs(x - SC.x) < 1.75 && Math.abs(z - SC.z) < SC.len / 2 + 0.6;
  const PARKED = CARS.map((c) => ({ x: c.x, z: c.zs[c.zs.length - 1] }));
  const STEPS = []; for (let v = -1.2; v <= T_END; v += 0.25) STEPS.push(v);
  const NS = STEPS.length, TX = [], TZ = [];
  const fits = (p) => {
    for (let k = 0; k < NS; k++) {
      const v = STEPS[k];
      const a = posAt(p, v);
      if (!a.vis) break;
      if (a.z > CAM0.z + 110) break;
      const onRoad = Math.abs(a.x) > PROM - 0.45 && Math.abs(a.x) < ROAD_X + 0.6;
      if (onRoad && p.plan !== 'shop' && p.plan !== 'hide') return false;
      if (onRoad && PARKED.some((c) => Math.abs(c.x - a.x) < 1.45 && Math.abs(c.z - a.z) < 2.9)) return false;
      if (inCar(a.x, a.z)) return false;
      if (obstacles.some((o) => (a.x - o.x) ** 2 + (a.z - o.z) ** 2 < o.r * o.r)) return false;
      // (a clear line from you down the street to the river: nobody stands in the middle of the view once they've run)
      for (let q = 0; q < TX.length; q++) { const dx = a.x - TX[q][k], dz = a.z - TZ[q][k]; if (dx * dx + dz * dz < 0.5625) return false; }
    }
    return true;
  };
  const keep = (p) => {
    const tx = new Float32Array(NS), tz = new Float32Array(NS);
    for (let k = 0; k < NS; k++) { const a = posAt(p, STEPS[k]); tx[k] = a.vis ? a.x : 1e5; tz[k] = a.vis ? a.z : 1e5; }
    TX.push(tx); TZ.push(tz);
  };
  const plan = (p, near) => {
    p.rs = 3.4 + R() * 1.6;
    p.tStop = 0.8 + R() * 1.6;
    const zs = p.z + (p.dir ? p.dir * p.sp * p.tStop / 2 : 0);
    const reach = Math.max(0, CAM0.z + 6 - zs) / p.rs + 0.6;
    p.tRun = near ? V_RUN + 0.1 + R() * 1.4 : V_RUN + Math.min(Math.pow(R(), 1.3) * 15, Math.max(0.3 * R(), 28 - V_RUN - reach));
    const side = Math.abs(p.x) > PROM;
    if (p.stay) { p.plan = 'stay'; p.tRun = V_RUN + 0.3 + R() * 0.6; return fits(p); }
    // the hiders: doorways and balconies close to you, on both sidewalks
    if (p.hide) {
      p.plan = 'hide'; p.rs = 3.0 + R();
      const sd = Math.sign(p.x) || 1;
      for (let k = 0; k < 8; k++) {
        p.tx = sd * (FX - 0.7 - R() * 0.6); p.tz = CAM0.z - 6 - R() * 22;
        if (fits(p)) return true;
        p.tRun += 0.3;
      }
      return false;
    }
    if (!side && !near && p.tRun + reach > 27) {
      p.tRun = Math.max(p.tRun, V_RUN + 0.5); p.rs = 3.4 + R() * 1.2; p.plan = 'shop';
      const sd = Math.sign(p.x + (R() - 0.5) * 4) || 1;
      for (let k = 0; k < 6; k++) {
        p.tx = sd * (FX + 0.8); p.tz = zs + (R() - 0.5) * 6;
        if (fits(p)) return true;
        p.tRun += 0.4;
      }
      return false;
    }
    if (side) {
      p.plan = 'shop'; p.tx = Math.sign(p.x) * (FX + 0.8); p.tz = zs + (R() - 0.5) * 3; p.rs = 2.6 + R();
      return fits(p);
    }
    p.plan = 'run';
    for (let k = 0; k < 7; k++) {
      if (zs > CAM0.z + 1) { const a = (R() - 0.5) * 0.5; p.rx = Math.sin(a); p.rz = Math.cos(a); if (fits(p)) return true; p.tRun += 0.3; continue; }
      const sx = p.x - CAM0.x;
      const lane = Math.abs(sx) < 1.4 ? (sx < 0 ? -1.6 - R() * 2.5 : 1.6 + R() * 2.5) : sx * (0.7 + 0.5 * R());
      const zEnd = CAM0.z + 120, dx = CAM0.x + clamp(lane, -5.6, 5.6) - p.x, dz = zEnd - zs;
      const L = Math.hypot(dx, dz);
      p.rx = dx / L; p.rz = dz / L;
      if (fits(p)) return true;
      p.tRun += 0.35;
    }
    return false;
  };
  const add = (p, near) => { if (plan(p, near)) { PEOPLE.push(p); keep(p); return true; } return false; };
  // right in front of you (hand placed): [ahead, right, act, scale, hides]
  const NEAR = [
    [2.6, -1.6, 'point', 1.0], [3.2, 1.2, 'phone', 0.96], [4.0, -2.7, 'head', 1.02, true], [4.7, 0.3, 'point', 0.98],
    [4.2, 2.6, 'kid', 0.62], [4.4, 3.2, 'hold', 1.0, true], [6.0, -1.3, 'phone', 0.95], [3.0, -3.6, 'point', 0.97, true],
    [7.6, 2.1, 'head', 1.0], [9.4, -2.4, 'phone', 1.0], [10.8, 0.9, 'point', 0.96], [6.6, 3.7, 'phone', 1.0, true], [5.4, -4.2, 'point', 1.03],
  ];
  // the family that stays (a few metres ahead, a little right of the middle): [ahead, right, act, scale, partner]
  const FAM = [[6.4, 0.45, 'hold', 1.0, 1], [6.5, 1.2, 'point', 0.98, 0], [6.0, 0.85, 'kid', 0.62, 0], [8.8, -1.1, 'phone', 1.0, 4], [8.9, -0.35, 'head', 0.96, 3]];
  const fam0 = PEOPLE.length;
  for (const [a, r, act, s, pt] of FAM) add({ ...at(a, r), act, dir: 0, sp: 0, s, near: true, stay: true, partner: fam0 + pt }, true);
  for (const [a, r, act, s, hide] of NEAR) add({ ...at(a, r), act, dir: 0, sp: 0, s, near: true, hide: !!hide }, true);
  // the crowd: the neutral ground and the sidewalks, both ways; most stopped, staring at it
  const areas = [
    [-6.2, 6.2, -60, 2, 160, 0.15],
    [-6.2, 6.2, -104, -60, 70, 0.15],
    [-6.2, 6.2, 10.5, 48, 60, 0.1],
    [-FX + 0.8, -ROAD_X - 0.6, -104, 30, 64, 0.3], [ROAD_X + 0.6, FX - 0.8, -104, 30, 64, 0.3],
  ];
  for (const [x0, x1, z0, z1, n, pw] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 25 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      const walk = R() < pw;
      const p = { x, z, s: R() < 0.07 ? 0.66 : 0.92 + R() * 0.16, dir: walk ? (R() < 0.5 ? 1 : -1) : 0, sp: 1.15 + R() * 0.35 };
      p.act = R() < 0.42 ? 'point' : R() < 0.55 ? 'phone' : R() < 0.5 ? 'head' : 'look';
      // (a gap straight ahead of you so the river shows)
      { const dx = p.x - CAM0.x, dz = CAM0.z - p.z; if (dz > 2 && dz < 45 && Math.abs(dx) < 0.45 + dz * 0.03) continue; }
      // (a few on the sidewalks near you hide in the doorways)
      p.hide = Math.abs(x) > PROM && z > CAM0.z - 30 && z < CAM0.z + 4 && R() < 0.45;
      // (about half the crowd on the neutral ground ahead of you stays: a crowd to the end)
      p.stay = !p.hide && !walk && Math.abs(x) < PROM && z < CAM0.z - 3 && z > CAM0.z - 48 && R() < 0.55;
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
    p.yaw0 = Math.PI + (R() - 0.5) * 0.6;            // facing down the street, toward the rock
    p.tReact = V_FLAME + R() * 1.8;                   // the flames: more arms go up
    p.tFlash = V_FLASH + 0.04 + R() * 0.25;          // an arm over the eyes
    p.turn = R() < 0.35;                              // and some turn their backs on it
    p.cover = R() < 0.55;                             // runs with an arm over the head
    p.tCrouch = V_HIT - 2.6 + R() * 1.2;
  });
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  return {
    crowd,
    frame(v, s) {
      for (const p of PEOPLE) {
        const a = posAt(p, v);
        if (!a.vis || a.z > CAM0.z + 110) { crowd.pose(p.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
        let yaw = p.yaw0 + wobble(v * 0.35, p.ph) * 0.12, walk = 0, stride = 0, armL = 0, armR = 0, look = 0.35, pitch = 0, roll = 0, sit = 0, y = 0;
        const fl = smooth(p.tFlash, p.tFlash + 0.18, v);
        if (a.phase === 'before') {
          if (p.dir && a.sp > 0.05) { yaw = p.dir > 0 ? 0 : Math.PI; walk = (a.z - p.z) * p.dir * 4.0 + p.ph; stride = a.sp / p.sp; look = 0.2; armL = 0.15; }
          else if (p.dir) { yaw = lerp(p.dir > 0 ? 0 : Math.PI, p.yaw0, smooth(p.tStop, p.tStop + 0.6, v)); }
          const re = smooth(p.tReact, p.tReact + 0.5, v);
          if (!p.dir || v > p.tStop) {
            if (p.act === 'point') { armL = 1.3 + 0.22 * re + 0.06 * Math.sin(v * 3 + p.ph); armR = 0.2; look = 0.7; }
            else if (p.act === 'phone') { armR = 1.3; armL = 0.35; look = 0.6; }
            else if (p.act === 'head') { armL = armR = lerp(0.4, 1.65, re); look = 0.6; }
            else if (p.act === 'kid') { armR = 1.3; look = 0.7; yaw = Math.PI - 0.2; }
            else if (p.act === 'hold') { armL = 0.35; armR = 1.3; look = 0.55; yaw = Math.PI + 0.25; }
            else { armR = 0.3 * re; look = 0.55; }
          }
          // the flash: an arm over the eyes; some turn away
          if (fl > 0) {
            armR = lerp(armR, 1.4, fl); armL = lerp(armL, p.act === 'head' ? 1.5 : 0.6, fl); look = lerp(look, 0.0, fl);
            if (p.turn) yaw += Math.PI * 0.85 * smooth(p.tFlash + 0.1, p.tFlash + 0.7, v);
          }
        } else if (a.phase === 'run') {
          const vx = p.plan === 'run' ? p.rx : p.tx - a.x, vz = p.plan === 'run' ? p.rz : p.tz - a.z;
          const tgt = Math.atan2(vx, vz);
          const u = clamp((v - p.tRun) / 0.45);
          const y0 = p.turn ? p.yaw0 + Math.PI * 0.85 : p.yaw0;
          let dy = tgt - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          yaw = y0 + dy * smooth(0, 1, u);
          walk = a.d * 2.4 + p.ph; stride = lerp(1.0, 1.6, clamp(a.sp / 3.4));
          look = -0.15; pitch = 0.1 * clamp(a.sp / 3.4);
          armL = p.cover ? 1.5 : 0.1;
        } else if (p.stay) {
          // they turn to each other, hold on, heads down, backs to it
          const w = smooth(p.tRun, p.tRun + 0.8, v);
          if (p.partner !== undefined) {
            const q = PEOPLE[p.partner] || p;
            yaw = lerp(p.yaw0, Math.atan2(q.x - a.x, q.z - a.z) + 0.3, w);
            armL = armR = lerp(0.4, 0.72, w); look = lerp(0.3, -0.35, w); pitch = 0.12 * w;
          } else {
            // backs to the heat, an arm over the head
            yaw = p.yaw0 + Math.PI * 0.85 * w; armL = lerp(0.3, 1.5, w); armR = lerp(0.3, 0.5, w); look = lerp(0.3, -0.2, w);
          }
          // the wall: they turn to watch it come; some point at it, some hold their heads
          const ww = smooth(V_WALL + 0.5 + p.ph * 0.25, V_WALL + 1.6 + p.ph * 0.25, v);
          if (ww > 0) {
            let dy = p.yaw0 - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            yaw += dy * ww;
            const act = p.ph < 3.5 ? 'point' : p.ph < 7 ? 'head' : 'cover';
            if (act === 'point') { armL = lerp(armL, 1.35, ww); armR = lerp(armR, 0.2, ww); }
            else if (act === 'head') { armL = armR = lerp(armL, 1.65, ww); }
            else { armL = armR = lerp(armL, 0.8, ww); }
            look = lerp(look, 0.45, ww); pitch = lerp(pitch, 0, ww);
          }
        } else {
          // in a doorway: back to the street, turned to look out at it now and then, arms in
          yaw = Math.atan2(-Math.sign(a.x), 0.4) + wobble(v * 0.3, p.ph) * 0.3; look = 0.1; armL = 0.6; armR = 0.6;
        }
        // the quake: everyone still standing staggers and crouches; at the end everyone left gets down
        const qk = smooth(V_QUAKE + 0.1, V_QUAKE + 0.6, v) * (1 - smooth(V_QUAKE + 3.2, V_QUAKE + 4.2, v)) * (a.sp < 0.5 ? 1 : 0);
        const down = Math.max(qk, a.sp < 0.5 ? smooth(p.tCrouch, p.tCrouch + 0.6, v) : 0);
        // (a crouch, back straight-ish, arms over the head: taking cover, never lying down)
        const dk = Math.max(qk * 0.55, down === qk ? 0 : down);
        if (dk > 0) { sit = dk * 0.8; y = -0.3 * dk; pitch += 0.18 * dk; armL = lerp(armL, 1.45, dk); armR = lerp(armR, 1.45, dk); look = lerp(look, -0.4, dk); }
        if (s.quake > 0) roll += s.quake * 0.06 * Math.sin(v * 13 + p.ph);
        crowd.pose(p.i, { x: a.x, y: groundY(a.z) + y, z: a.z, yaw, s: p.s, walk, stride, sit, pitch, roll, armL, armR, look });
      }
      crowd.commit();
    },
  };
}
