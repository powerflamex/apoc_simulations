// The people at the crossing. Planned up front so nobody walks through anybody, jumps or changes size:
//   - a few right by you (hand placed): phones up, pointing, hands on their heads;
//   - the crowd on the crossing and the corners: some still walking across on frame 0 (they slow and stop to stare),
//     most looking up, half of them filming it;
//   - runners: each runs straight out from the middle of the crossing (rays from one point never cross), and only if
//     their whole path stays clear of everyone else (checked here at load);
//   - the wind leans them over; at the end they are lifted off the ground one by one, tumbling, toward the planet.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, ROAD_X, ROAD_Z, FX, FZ } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_LIFT, V_WIND, V_FLOOD } from './timeline.js';

const COATS = [0x1d2230, 0x2b2b2e, 0x3a3328, 0x6b5a44, 0x51545a, 0x7a2a2a, 0x24384a, 0x8a8478, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x5a3a5a, 0xc0a070, 0x3a4a6a];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40];

export const PEOPLE = [];
{
  const R = rng(5150);
  // you look north-north-east; offsets [ahead, right] from you
  const fw = [Math.sin(12 * Math.PI / 180), -Math.cos(12 * Math.PI / 180)], rt = [-fw[1], fw[0]];
  const at = (a, r) => ({ x: CAM0.x + fw[0] * a + rt[0] * r, z: CAM0.z + fw[1] * a + rt[1] * r });
  const NEAR = [
    [2.2, 0.5, 'phone'], [2.8, -0.75, 'point'], [3.6, 1.05, 'phone'], [4.3, -1.3, 'head'], [5.1, 0.15, 'phone'],
    [5.8, 1.7, 'head'], [6.3, -2.0, 'phone'], [3.3, 2.15, 'point', 0.78], [7.0, 0.9, 'phone'], [2.4, -1.9, 'head'],
    [7.8, -0.6, 'point'], [8.4, 2.6, 'phone'], [4.7, 2.9, 'phone'], [9.2, -2.9, 'head'], [10.2, 1.4, 'phone'],
  ];
  for (const [a, r, act, s] of NEAR) PEOPLE.push({ ...at(a, r), act, s: s || 0.94 + R() * 0.12, near: true });
  // the crowd: a jittered scatter with at least 0.95 m between people
  const ok = (x, z) => PEOPLE.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > 0.95 * 0.95) && (x - CAM0.x) ** 2 + (z - CAM0.z) ** 2 > 4;
  const areas = [
    [-14.5, 14.5, -9.8, 9.8, 170],                     // the crossing
    [-20.5, -15.4, -15.5, 15.5, 60], [15.4, 20.5, -15.5, 15.5, 60],     // the avenue's sidewalks by the crossing
    [-30, -15.4, -15.6, -10.4, 30], [15.4, 32, -15.6, -10.4, 30],       // the north corners, along the cross street
    [-30, -15.4, 10.4, 15.6, 20], [15.4, 32, 10.4, 15.6, 25],
    [-20.5, -15.4, -60, -16, 40], [15.4, 20.5, -60, -16, 40],           // up the avenue
  ];
  for (const [x0, x1, z0, z1, n] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 30 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!ok(x, z)) continue;
      // a gap ahead of you (people stand back from the middle a little): you see the street and the water come
      { const dx = x - CAM0.x, dz = CAM0.z - z; if (dz > 3 && dz < 24 && Math.abs(dx - dz * 0.12) < 0.9 + dz * 0.08) continue; }
      PEOPLE.push({ x, z, act: R() < 0.5 ? 'phone' : R() < 0.3 ? 'point' : R() < 0.3 ? 'head' : 'look', s: R() < 0.06 ? 0.72 : 0.92 + R() * 0.16 });
      placed++;
    }
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = COATS[Math.floor(R() * COATS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.85;
    p.ph = R() * 10;
    p.yaw0 = Math.PI + (R() - 0.5) * 0.7 + 0.15;     // facing north (yaw PI faces -z), a little east, toward the planet
    p.tReact = 0.3 + R() * 2.4;                      // when they start pointing / crying
    p.tLift = V_LIFT + 0.6 + R() * 3.2 + (p.near ? 1.6 : 0);
    p.spin = (R() - 0.5) * 2.5;
    p.walk = null; p.run = null;
  });
  // walkers on frame 0: in the crossing, a few steps along a scramble direction, stopping by ~0.6-2.2 s
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.83, 0.55], [-0.83, -0.55], [0.83, -0.55], [-0.83, 0.55]];
  const clearSeg = (p, ax, az, bx, bz, minD) => PEOPLE.every((q) => {
    if (q === p) return true;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((q.x - ax) * dx + (q.z - az) * dz) / L2);
    return (ax + dx * t - q.x) ** 2 + (az + dz * t - q.z) ** 2 > minD * minD;
  });
  for (const p of PEOPLE) {
    if (p.near || Math.abs(p.x) > 14 || Math.abs(p.z) > 9.5 || R() > 0.45) continue;
    const d = DIRS[Math.floor(R() * DIRS.length)];
    const tStop = 0.6 + R() * 1.6, sp = 1.25 + R() * 0.3;
    const L = sp * tStop / 2 + sp * 0.9;           // decelerating to a stop at tStop (and walking at sp before frame 0)
    const ax = p.x - d[0] * L, az = p.z - d[1] * L;
    if (!clearSeg(p, ax, az, p.x, p.z, 0.8)) continue;
    p.walk = { dx: d[0], dz: d[1], tStop, sp };
  }
  // runners: straight out from the middle of the crossing, from ~5 s on
  const runners = [];
  for (const p of PEOPLE) {
    if (p.near || R() > 0.42) continue;
    const r0 = Math.hypot(p.x, p.z);
    if (r0 < 1) continue;
    const dx = p.x / r0, dz = p.z / r0;
    const sp = 3.0 + R() * 1.6, t0 = 4.8 + R() * 9.0;
    // run until a building front (or 70 m), then stop there
    let L = 70;
    for (let s = 0.5; s < 70; s += 0.5) {
      const x = p.x + dx * s, z = p.z + dz * s;
      if (Math.abs(x) > FX - 0.6 && Math.abs(z) > FZ - 0.6) { L = s - 0.5; break; }
    }
    if (L < 3) continue;
    const ex = p.x + dx * L, ez = p.z + dz * L;
    if ((ex - CAM0.x) ** 2 + (ez - CAM0.z) ** 2 < 25) continue;
    // their path must stay clear of everyone who isn't running, and of you
    const others = PEOPLE.filter((q) => q !== p && !q.run);
    const segOK = others.every((q) => {
      const t = clamp(((q.x - p.x) * dx + (q.z - p.z) * dz) / L);
      if (t <= 0) return true;
      return (p.x + dx * L * t - q.x) ** 2 + (p.z + dz * L * t - q.z) ** 2 > 0.8 * 0.8;
    });
    const camOK = (() => { const t = clamp(((CAM0.x - p.x) * dx + (CAM0.z - p.z) * dz) / L); return (p.x + dx * L * t - CAM0.x) ** 2 + (p.z + dz * L * t - CAM0.z) ** 2 > 2.5 * 2.5; })();
    if (!segOK || !camOK) continue;
    // and of the runners already planned (sampled in time)
    const run = { dx, dz, sp, t0, L };
    const posAt = (q, v) => { const s = clamp((v - q.run.t0) * q.run.sp, 0, q.run.L); return [q.x + q.run.dx * s, q.z + q.run.dz * s]; };
    p.run = run;
    let clash = false;
    for (const q of runners) {
      for (let v = Math.min(t0, q.run.t0); v < Math.max(t0, q.run.t0) + 25 && !clash; v += 0.1) {
        const [ax, az] = posAt(p, v), [bx, bz] = posAt(q, v);
        if ((ax - bx) ** 2 + (az - bz) ** 2 < 0.7 * 0.7) clash = true;
      }
      if (clash) break;
    }
    // a runner must also not run into someone who later becomes a runner's spot... (they're all checked the same way)
    if (clash) { p.run = null; continue; }
    runners.push(p);
  }
  // the people left standing must not be in any runner's way either (the check above ran against non-runners at the
  // time; a later runner leaving opens space, it never closes it)
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  const phones = [];
  return {
    crowd,
    frame(v, s, glows) {
      phones.length = 0;
      const wade = s.water > 0.2 ? clamp((s.water - 0.2) / 0.6) : 0;
      for (const p of PEOPLE) {
        let x = p.x, z = p.z, yaw = p.yaw0, walk = v * 1.5 + p.ph, stride = 0, armL = 0, armR = 0, look = 0.75, pitch = 0, roll = 0, y = 0;
        // looking around a little
        yaw += wobble(v * 0.35, p.ph) * 0.18;
        if (p.walk && v < p.walk.tStop) {
          // decelerating to a stop at home
          const w = p.walk, t = v - w.tStop;            // t < 0
          const dist = t < -w.tStop ? -w.sp * (t + w.tStop) + w.sp * w.tStop / 2 : (w.sp / (2 * w.tStop)) * t * t;
          x -= w.dx * dist; z -= w.dz * dist;
          const spd = t < -w.tStop ? w.sp : w.sp * (-t / w.tStop);
          yaw = lerp(Math.atan2(-w.dx, -w.dz) + Math.PI, p.yaw0, smooth(-0.8, 0, t));
          walk = v * 9 * Math.max(spd / w.sp, 0.25) + p.ph; stride = spd / w.sp;
          look = smooth(-1.2, 0, t) * 0.75;
        }
        const react = smooth(p.tReact, p.tReact + 0.6, v);
        if (p.act === 'phone') { armR = 1.0; armL = 0.25; look = Math.min(look, 0.55); }
        else if (p.act === 'point') { armL = 1.1 + 0.55 * react; armR = 0.1; }
        else if (p.act === 'head') { armL = armR = 1.6 * react; look = 0.6; }
        if (p.run && v > p.run.t0) {
          const sp = p.run.sp * (1 - 0.55 * wade);
          const sx = clamp((v - p.run.t0) * sp, 0, p.run.L);
          x += p.run.dx * sx; z += p.run.dz * sx;
          const moving = sx < p.run.L ? 1 : 0;
          const turn = smooth(p.run.t0, p.run.t0 + 0.35, v);
          yaw = lerp(yaw, Math.atan2(-p.run.dx, -p.run.dz) + Math.PI, turn * moving + (1 - moving) * 0.0);
          if (moving) { walk = v * 11 + p.ph; stride = 1.5 * turn; armL = armR = 0.25; look = 0.2; }
        }
        // the wind toward the planet: lean back against it, stagger, arms up
        if (s.wind > 0) {
          const wk = Math.min(s.wind, 1.4);
          pitch = -0.14 * wk + 0.05 * Math.sin(v * 5 + p.ph) * wk;
          roll = 0.05 * wobble(v * 3, p.ph) * wk;
          if (p.act !== 'phone') { armL = Math.max(armL, 0.7 * wk); armR = Math.max(armR, 0.5 * wk); }
          z -= 0.35 * smooth(V_WIND, V_WIND + 8, v) * (0.5 + 0.5 * Math.sin(p.ph));
        }
        // the ground shaking
        if (s.quake > 0) { x += wobble(v * 17, p.ph) * 0.02 * s.quake; roll += wobble(v * 13, p.ph + 3) * 0.05 * s.quake; }
        // lifted off
        let sc = p.s;
        if (v > p.tLift) {
          const t = v - p.tLift;
          y = 0.5 * 1.6 * t * t * (1 + 0.35 * t);
          z -= y * 0.32; x += y * 0.05 * Math.sin(p.ph);
          pitch += p.spin * t * 0.5 - 0.3 * smooth(0, 0.5, t);
          roll += p.spin * t * 0.3;
          armL = 1.3 + 0.4 * Math.sin(t * 9 + p.ph); armR = 1.5 + 0.4 * Math.sin(t * 8 + p.ph * 2);
          walk = t * 10; stride = 0.8; look = 0.9;
        }
        crowd.pose(p.i, { x, y, z, yaw, s: sc, walk, stride, pitch, roll, armL, armR, look });
        // the phone's screen (it faces them; seen from behind it glows)
        if (p.act === 'phone' && v < p.tLift + 0.3 && (!p.run || v < p.run.t0)) {
          const hx = x + (Math.sin(yaw) * 0.6 + Math.cos(yaw) * 0.215) * sc, hz = z + (Math.cos(yaw) * 0.6 - Math.sin(yaw) * 0.215) * sc;
          glows.add(hx, y + 1.42 * sc, hz, 0.09, 0.9, 0.95, 1.1);
        }
      }
      crowd.commit();
    },
  };
}
