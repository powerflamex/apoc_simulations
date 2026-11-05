// The people at the crossing. Planned up front so nobody walks through anybody, jumps or changes size:
//   - a few right by you (hand placed): phones up, pointing, hands on their heads;
//   - the crowd on the crossing and the corners: some still walking across on frame 0 (they slow and stop to stare),
//     most looking up, half of them filming it;
//   - at the alert (6 s) everyone with a phone looks down at it for a moment, the screens flashing white;
//   - runners from 12 s: each runs straight away from the rod (south, or along the cross street), and only if their
//     whole path stays clear of everyone else (checked here at load);
//   - from 36 s the ones left crouch and cover their heads; when the wall arrives they are blown off their feet.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, FX, FZ, HIT, ROAD_X, ROAD_Z } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_ALERT, V_PANIC, V_FILL, V_WALL } from './timeline.js';

const SHIRTS = [0x1d2230, 0xe8e2d6, 0x3a3328, 0x6b5a44, 0xc8d4e8, 0x7a2a2a, 0x24384a, 0xf0c060, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x8a5a8a, 0xd05030, 0x3a4a6a, 0xffffff, 0x60a0d0];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x8a7a66, 0xc9c2b6];

export const PEOPLE = [];
{
  const R = rng(5150);
  // you look north; offsets [ahead, right] from you
  const fw = [0, -1], rt = [1, 0];
  const at = (a, r) => ({ x: CAM0.x + fw[0] * a + rt[0] * r, z: CAM0.z + fw[1] * a + rt[1] * r });
  const NEAR = [
    [2.0, 0.6, 'phone'], [2.6, -0.9, 'point'], [3.4, 1.2, 'phone'], [4.1, -1.5, 'head'], [4.9, 0.1, 'phone'],
    [5.6, 1.9, 'head'], [6.2, -2.2, 'phone'], [3.1, 2.3, 'point', 0.78], [6.9, 0.8, 'phone'], [2.3, -2.1, 'head'],
    [7.6, -0.7, 'point'], [8.3, 2.7, 'phone'], [4.6, 3.1, 'phone'], [9.1, -3.0, 'head'], [10.0, 1.5, 'phone'],
    [2.9, 3.6, 'phone'], [3.8, -3.4, 'look'], [11.0, -1.2, 'phone'],
  ];
  for (const [a, r, act, s] of NEAR) PEOPLE.push({ ...at(a, r), act, s: s || 0.94 + R() * 0.12, near: true });
  // the crowd: a jittered scatter with at least 0.95 m between people
  const ok = (x, z) => PEOPLE.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > 0.95 * 0.95) && (x - CAM0.x) ** 2 + (z - CAM0.z) ** 2 > 4;
  const areas = [
    [-14.5, 14.5, -9.8, 9.8, 175],                     // the crossing
    [-21.5, -15.4, -16.5, 16.5, 55], [15.4, 21.5, -16.5, 16.5, 55],     // the avenue's sidewalks by the crossing
    [-34, -15.4, -16.6, -10.4, 30], [15.4, 36, -16.6, -10.4, 30],       // the north corners, along the cross street
    [-34, -15.4, 10.4, 16.6, 22], [15.4, 36, 10.4, 16.6, 26],
    [-21.5, -15.4, -75, -17, 45], [15.4, 21.5, -75, -17, 45],           // up the avenue
    [-21.5, -15.4, 17, 50, 18], [15.4, 21.5, 17, 50, 18],               // down the avenue, behind you
  ];
  for (const [x0, x1, z0, z1, n] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 30 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!ok(x, z)) continue;
      // a gap ahead of you (people stand back from the middle a little): you see the avenue and the wall come
      { const dx = x - CAM0.x, dz = CAM0.z - z; if (dz > 3 && dz < 26 && Math.abs(dx - dz * 0.1) < 0.8 + dz * 0.07) continue; }
      PEOPLE.push({ x, z, act: R() < 0.5 ? 'phone' : R() < 0.3 ? 'point' : R() < 0.3 ? 'head' : 'look', s: R() < 0.06 ? 0.72 : 0.92 + R() * 0.16 });
      placed++;
    }
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.6;
    p.ph = R() * 10;
    p.yaw0 = Math.PI + (R() - 0.5) * 0.6;            // facing north (yaw PI faces -z), toward the rod
    p.tReact = 0.3 + R() * 2.4;                      // when they start pointing / crying
    p.tAlert = V_ALERT + R() * 0.5;                  // when their phone buzzes
    p.tCrouch = V_FILL + R() * 1.6;
    p.spin = (R() - 0.5) * 3;
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
    const L = sp * tStop / 2 + sp * 0.9;
    const ax = p.x - d[0] * L, az = p.z - d[1] * L;
    if (!clearSeg(p, ax, az, p.x, p.z, 0.8)) continue;
    p.walk = { dx: d[0], dz: d[1], tStop, sp };
  }
  // runners, from 12 s on: the people on the avenue's sidewalks stream straight south past you; the ones on the crossing
  // fan out southward (never toward it)
  const runners = [];
  // who wants to run (most of the crossing, many on the sidewalks, a few right by you); the rest stand and are the
  // ones a path must keep clear of
  for (const p of PEOPLE) {
    const onCross = Math.abs(p.x) < 14.5 && Math.abs(p.z) < 10;
    p.wants = !p.near && R() < (onCross ? 0.88 : 0.6) || (p.near && R() < 0.25);
  }
  const stayers = PEOPLE.filter((q) => !q.wants);
  for (const p of PEOPLE) {
    if (!p.wants) continue;
    const onWalk = Math.abs(p.x) > ROAD_X + 0.3 && Math.abs(p.z) > ROAD_Z;
    let dx, dz;
    if (onWalk) { dx = 0; dz = 1; }
    else {
      const ox = 0, oz = -14;
      const r0 = Math.hypot(p.x - ox, p.z - oz);
      if (r0 < 1) continue;
      dx = (p.x - ox) / r0 * 0.7 + (p.x > CAM0.x ? 0.22 : -0.22); dz = (p.z - oz) / r0 + 0.35;
      const nn = Math.hypot(dx, dz); dx /= nn; dz /= nn;
    }
    if (dz < 0.15) continue;
    const sp = 3.0 + R() * 1.6, t0 = V_PANIC + (p.near ? 1.5 + R() * 9 : Math.pow(R(), 2.0) * 8.5);
    // run until a building front (or 80 m along the sidewalk, 40 m across the crossing: past you), then stop there
    let L = onWalk ? 80 : 40;
    for (let s = 0.5; s < L; s += 0.5) {
      const x = p.x + dx * s, z = p.z + dz * s;
      if (Math.abs(x) > FX - 0.6 && Math.abs(z) > FZ - 0.6) { L = s - 0.5; break; }
    }
    if (L < 3) continue;
    const ex = p.x + dx * L, ez = p.z + dz * L;
    if ((ex - CAM0.x) ** 2 + (ez - CAM0.z) ** 2 < 25) continue;
    const segOK = stayers.every((q) => {
      const t = clamp(((q.x - p.x) * dx + (q.z - p.z) * dz) / L);
      if (t <= 0) return true;
      return (p.x + dx * L * t - q.x) ** 2 + (p.z + dz * L * t - q.z) ** 2 > 0.45 * 0.45;     // (brushing past is fine)
    });
    const camOK = (() => { const t = clamp(((CAM0.x - p.x) * dx + (CAM0.z - p.z) * dz) / L); return (p.x + dx * L * t - CAM0.x) ** 2 + (p.z + dz * L * t - CAM0.z) ** 2 > 2.5 * 2.5; })();
    if (!segOK || !camOK) continue;
    const run = { dx, dz, sp, t0, L };
    const posAt = (q, v) => { const s = clamp((v - q.run.t0) * q.run.sp, 0, q.run.L); return [q.x + q.run.dx * s, q.z + q.run.dz * s]; };
    p.run = run;
    let clash = false;
    for (const q of runners) {
      for (let v = Math.min(t0, q.run.t0); v < Math.max(t0, q.run.t0) + 25 && !clash; v += 0.1) {
        const [ax, az] = posAt(p, v), [bx, bz] = posAt(q, v);
        if ((ax - bx) ** 2 + (az - bz) ** 2 < 0.45 * 0.45) clash = true;
      }
      if (clash) break;
    }
    if (clash) { p.run = null; continue; }
    runners.push(p);
  }
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  return {
    crowd,
    frame(v, s, glows) {
      for (const p of PEOPLE) {
        let x = p.x, z = p.z, yaw = p.yaw0, walk = v * 1.5 + p.ph, stride = 0, armL = 0, armR = 0, look = 0.75, pitch = 0, roll = 0, y = 0, sit = 0;
        yaw += wobble(v * 0.35, p.ph) * 0.18;
        if (p.walk && v < p.walk.tStop) {
          const w = p.walk, t = v - w.tStop;
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
        // the alert: a glance down at the phone, then back up
        let alert = 0;
        if (p.act === 'phone') {
          alert = smooth(p.tAlert, p.tAlert + 0.35, v) * (1 - smooth(p.tAlert + 2.2, p.tAlert + 3.0, v));
          armR = lerp(armR, 0.62, alert); look = lerp(look, -0.1, alert);
        }
        let moving = 0;
        if (p.run && v > p.run.t0) {
          const sx = clamp((v - p.run.t0) * p.run.sp, 0, p.run.L);
          x += p.run.dx * sx; z += p.run.dz * sx;
          moving = sx < p.run.L ? 1 : 0;
          const turn = smooth(p.run.t0, p.run.t0 + 0.35, v);
          yaw = lerp(yaw, Math.atan2(-p.run.dx, -p.run.dz) + Math.PI, turn);
          if (moving) { walk = v * 11 + p.ph; stride = 1.5 * turn; armL = armR = 0.25; look = 0.2; }
          else { look = 0.6; armL = armR = 0.3; }
        }
        // the last seconds: crouching, arms over the head
        if (!moving && v > p.tCrouch) {
          const c = smooth(p.tCrouch, p.tCrouch + 0.9, v);
          sit = 0.5 * c; armL = lerp(armL, 1.6, c); armR = lerp(armR, 1.6, c); look = lerp(look, 0.3, c); pitch += 0.25 * c;
        }
        // the shock through the ground after the hit
        if (s.hit) { x += wobble(v * 19, p.ph) * 0.03 * smooth(0.3, 0.8, s.age); roll += wobble(v * 13, p.ph + 3) * 0.06 * smooth(0.3, 0.8, s.age); }
        // the wall: blown off their feet toward you
        const rHit = Math.hypot(x - HIT.x, z - HIT.z);
        if (s.front > rHit - 10) {
          const t = Math.max(0, (s.front - (rHit - 10)) / 140);        // ~0.5 s of video as the front crosses them
          const ax = (x - HIT.x) / rHit, az = (z - HIT.z) / rHit;
          x += ax * 16 * t; z += az * 16 * t; y += Math.max(0, 9 * t - 7 * t * t);
          pitch += 5 * t * (1 + 0.3 * p.spin); roll += p.spin * 2 * t;
          armL = 1.5; armR = 1.4; stride = 0.9; walk = t * 12;
        }
        crowd.pose(p.i, { x, y, z, yaw, s: p.s, walk, stride, sit, pitch, roll, armL, armR, look });
        // the phone's screen (it faces them; seen from behind it glows; the alert flashes it white)
        if (p.act === 'phone' && (!p.run || v < p.run.t0) && s.front < rHit - 10) {
          const hx = x + (Math.sin(yaw) * 0.6 + Math.cos(yaw) * 0.215) * p.s, hz = z + (Math.cos(yaw) * 0.6 - Math.sin(yaw) * 0.215) * p.s;
          const fl = alert * (0.6 + 0.4 * (Math.sin(v * 12 + p.ph) > 0 ? 1 : 0));
          glows.add(hx, y + (1.42 - 0.5 * sit) * p.s, hz, 0.09 + 0.05 * fl, 0.9 + 3.5 * fl, 0.95 + 3.2 * fl, 1.1 + 3.0 * fl);
        }
      }
      crowd.commit();
    },
  };
}
