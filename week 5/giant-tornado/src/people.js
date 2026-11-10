// The people on Main Street. Planned up front so nobody walks through anybody, jumps or changes size:
//   - a few right by you (hand placed), on both sides of you: phones up, pointing, hands on their heads;
//   - the crowd: in the left half of the road and on both sidewalks, some still walking on frame 0, most filming it;
//     the right half of the road stays clear up the street (that is where the cars come down);
//   - EVERYONE RUNS: when the popup appears the people by you turn and sprint past you on both sides, and the panic
//     spreads up the street. All runners go straight down the street at one pace, in lanes that miss you, the
//     parked cars, the lamp posts, the trees and the trash cans; in any lane the one in front always sets off first,
//     so the gap can only grow. The wind slows them all alike from ~18 s, so the street stays full of people running
//     at you right up to the moment they are lifted;
//   - holders: two people stand beside each lamp post near you, off the runners' lanes; at ~29 s they grab the post
//     and stream out flat in the wind, and go when their post goes;
//   - from 33 s everyone else is lifted off one by one and tumbles away into the wall.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, ROAD_X, FX, LAMPS, inCross } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_NEAR, V_HOLD, V_PEOPLE } from './timeline.js';
import { flight, gone } from './fly.js';

const COATS = [0x1d2230, 0x2b2b2e, 0x3a3328, 0x6b5a44, 0x51545a, 0x7a2a2a, 0x24384a, 0x8a8478, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x5a3a5a, 0xc0a070, 0x3a4a6a, 0xd84a2a, 0xe8e0d0];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x6a5a48];

// how far a runner has gone: one pace for everybody, slowed alike by the wind
const SP = 3.9, STEP = 0.05;
const G = [0];
for (let i = 1; i <= 1200; i++) { const t = (i - 0.5) * STEP; G.push(G[i - 1] + STEP * (1 - 0.66 * smooth(18, 32, t))); }
const Gat = (v) => { const x = clamp(v / STEP, 0, 1199.99), i = Math.floor(x); return lerp(G[i], G[i + 1], x - i); };

export const PEOPLE = [];
{
  const R = rng(5150);
  // you look north (-z); offsets [ahead, right] from you
  const at = (a, r) => ({ x: CAM0.x + r, z: CAM0.z - a });
  // (nobody right in the middle: you see straight down the street to the tornado between them)
  const NEAR = [
    [2.4, 1.4, 'phone'], [2.9, -1.6, 'point'], [3.8, 2.3, 'phone'], [4.4, -2.6, 'head'], [5.2, 1.5, 'phone'],
    [6.0, -1.6, 'head'], [6.6, 3.0, 'phone'], [3.4, 3.5, 'point', 0.78], [7.4, 2.1, 'phone'], [2.6, -3.3, 'head'],
    [8.2, -2.3, 'point'], [9.0, 3.6, 'phone'], [5.0, -3.9, 'phone'], [9.8, -3.4, 'head'], [10.8, 2.4, 'phone'], [12.0, -1.5, 'phone'],
  ];
  for (const [a, r, act, s] of NEAR) PEOPLE.push({ ...at(a, r), act, s: s || 0.94 + R() * 0.12, near: true });
  const act = () => (R() < 0.5 ? 'phone' : R() < 0.3 ? 'point' : R() < 0.3 ? 'head' : 'look');
  const size = () => (R() < 0.06 ? 0.72 : 0.92 + R() * 0.16);
  const ok = (x, z) => PEOPLE.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > 0.95 * 0.95) && Math.abs(x - CAM0.x) > 1.25 && !inCross(z, 1);
  const areas = [
    [-7.8, -2.2, -36, -12.5, 46],        // the left half of the road, up to the first parked cars
    [-3.2, -2.2, -108, -36, 26],         // on up the left lane
    [-7.8, -2.2, -12.5, 7, 10],          // beside you
    [3.7, 7.8, -12, 7, 8],               // and on your right, in the empty stalls
  ];
  for (const [x0, x1, z0, z1, n] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 30 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!ok(x, z)) continue;
      PEOPLE.push({ x, z, act: act(), s: size() });
      placed++;
    }
  }
  // the sidewalks: two lanes each, clear of the lamp posts, the trees, the benches and the telephone poles
  for (const x of [-11.7, -8.9, 8.9, 11.7]) {
    for (let z = 16 - R() * 2; z > -262; z -= 1.3 + R() * 2.6) {
      if (inCross(z, 1) || R() < 0.1) continue;
      PEOPLE.push({ x, z, act: act(), s: size() });
    }
  }
  // the holders, beside each post near you
  for (const l of LAMPS) {
    if (l.z < -90 || l.z > 15) continue;
    for (let k = 0; k < 2; k++) {
      const x = l.x + l.side * (k ? 0.74 : 0.42), z = l.z + (k ? -0.9 : 0.5);
      PEOPLE.push({ x, z, act: act(), s: size(), hold: { x: l.x + l.side * (k ? 0.6 : 0.3), z: l.z - 1.7, y: k ? 1.5 : 1.0, lamp: l, t0: V_HOLD + R() * 1.6 } });
    }
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = COATS[Math.floor(R() * COATS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.7;
    p.ph = R() * 10;
    p.yaw0 = Math.PI + (R() - 0.5) * 0.6;                    // facing north (yaw PI faces -z), toward the wall
    p.tReact = 0.3 + R() * 2.4;
    p.tLift = V_PEOPLE + R() * 6.5 + (p.near ? 1.5 : 0);
    p.spin = (R() - 0.5) * 2.5;
    p.walk = null; p.run = null;
  });
  // walkers on frame 0: a few steps along the sidewalk, stopping by ~0.6-2.2 s
  const clearSeg = (p, ax, az, bx, bz, minD) => PEOPLE.every((q) => {
    if (q === p) return true;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((q.x - ax) * dx + (q.z - az) * dz) / L2);
    return (ax + dx * t - q.x) ** 2 + (az + dz * t - q.z) ** 2 > minD * minD;
  });
  for (const p of PEOPLE) {
    if (p.near || p.hold || Math.abs(p.x) < ROAD_X || p.z < -60 || R() > 0.45) continue;
    const dz = R() < 0.5 ? 1 : -1;
    const tStop = 0.6 + R() * 1.6, sp = 1.25 + R() * 0.3;
    const L = sp * tStop / 2 + sp * 0.9;
    const az = p.z - dz * L;
    if (!clearSeg(p, p.x, az, p.x, p.z, 0.8)) continue;
    p.walk = { dx: 0, dz, tStop, sp };
  }
  // runners: everybody but the holders. The people by you go exactly as the popup appears, then it spreads up the street
  const runners = PEOPLE.filter((p) => !p.hold).sort((a, b) => b.z - a.z);
  for (const p of runners) p.run = { t0: V_NEAR + 0.03 + 0.021 * Math.max(0, -p.z) + (p.near ? 0 : R() * 0.28), L: 72 - p.z + (p.i % 11) };
  // in any lane the one in front has already gone: the gap can only grow
  for (let i = 0; i < runners.length; i++) {
    const p = runners[i];
    for (let j = 0; j < i; j++) {
      const q = runners[j];
      if (Math.abs(q.x - p.x) < 0.8 && p.run.t0 < q.run.t0 + 0.02) p.run.t0 = q.run.t0 + 0.02;
    }
  }
}

export function makePeople(scene, lampObjs) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  const lampT0 = new Map();
  for (const o of lampObjs) lampT0.set(o.lamp, o.t0);
  const fl = {};
  return {
    crowd,
    frame(v, s, glows) {
      const W = s.W;
      const leanK = Math.min(1.2, W * W / 1800);
      for (const p of PEOPLE) {
        let x = p.x, z = p.z, yaw = p.yaw0, walk = v * 1.5 + p.ph, stride = 0, armL = 0, armR = 0, look = 0.3, pitch = 0, roll = 0, y = 0, sit = 0;
        yaw += wobble(v * 0.35, p.ph) * 0.18;
        if (p.walk && v < p.walk.tStop) {
          const w = p.walk, t = v - w.tStop;
          const dist = t < -w.tStop ? -w.sp * (t + w.tStop) + w.sp * w.tStop / 2 : (w.sp / (2 * w.tStop)) * t * t;
          z -= w.dz * dist;
          const spd = t < -w.tStop ? w.sp : w.sp * (-t / w.tStop);
          yaw = lerp(w.dz > 0 ? 0 : Math.PI, p.yaw0, smooth(-0.8, 0, t));
          walk = v * 9 * Math.max(spd / w.sp, 0.25) + p.ph; stride = spd / w.sp;
          look = smooth(-1.2, 0, t) * 0.3;
        }
        const react = smooth(p.tReact, p.tReact + 0.6, v);
        if (p.act === 'phone') { armR = 1.0; armL = 0.25; look = Math.min(look, 0.25); }
        else if (p.act === 'point') { armL = 1.0 + 0.3 * react; armR = 0.1; }
        else if (p.act === 'head') { armL = armR = 1.6 * react; look = 0.3; }
        // the wind pulls everyone toward the wall: lean back against it, stagger
        pitch = -0.16 * leanK + 0.05 * Math.sin(v * 5 + p.ph) * leanK;
        roll = 0.05 * wobble(v * 3, p.ph) * leanK;
        if (p.act !== 'phone' && leanK > 0.3) { armL = Math.max(armL, 0.6 * leanK); armR = Math.max(armR, 0.5 * leanK); }
        let lifted = false;
        if (p.hold) {
          // steps to the post, then hangs on, streaming out flat toward the wall, feet kicking
          const k = smooth(p.hold.t0, p.hold.t0 + 0.9, v);
          if (k > 0) {
            x = lerp(x, p.hold.x, k); z = lerp(z, p.hold.z, k);
            const tl = lampT0.get(p.hold.lamp) ?? 1e4;
            if (v > tl) { p.tLiftH = Math.min(p.tLiftH ?? tl, tl); }
            const grip = smooth(p.hold.t0 + 0.9, p.hold.t0 + 1.6, v);
            yaw = lerp(yaw, 0, k);                                   // facing the post (and you)
            const flat = grip * Math.min(1, 0.4 + 0.6 * smooth(V_HOLD, V_HOLD + 6, v));
            pitch = lerp(pitch, 1.42 + 0.08 * Math.sin(v * 7 + p.ph), flat);
            y = p.hold.y * flat;
            z = lerp(z, p.hold.z - 0.15, flat);
            armL = lerp(armL, 1.05, grip); armR = lerp(armR, 1.0, grip);
            walk = v * 8 + p.ph; stride = 0.9 * flat; look = 0.6;
            roll = 0.1 * wobble(v * 4, p.ph) * flat;
          }
        }
        if (p.run && v > p.run.t0) {
          const dist = clamp(SP * (Gat(v) - Gat(p.run.t0)) - 0.35 * (1 - Math.exp(-(v - p.run.t0) / 0.2)), 0, p.run.L);
          z += dist;
          const moving = dist < p.run.L ? 1 : 0;
          const turn = smooth(p.run.t0 - 0.05, p.run.t0 + 0.3, v);
          yaw = lerp(yaw, 0, turn);
          if (moving) {
            // running at you, heads down, into a wind that gets harder and harder
            const slow = 1 - 0.5 * smooth(18, 32, v);
            walk = (v - p.run.t0) * 12.5 * slow + p.ph; stride = lerp(stride, 1.55, turn);
            armL = lerp(armL, 0.3 + 0.2 * Math.sin(v * 11 + p.ph), turn); armR = lerp(armR, 0.3 - 0.2 * Math.sin(v * 11 + p.ph), turn);
            look = lerp(look, 0.08, turn); pitch = lerp(pitch, 0.16 + 0.26 * smooth(16, 30, v), turn);
          }
        }
        // lifted off: tumbling away toward the wall
        const tLift = p.hold ? (p.tLiftH ?? 1e4) : p.tLift;
        if (v > tLift) {
          lifted = true;
          fl.x = x; fl.y = y; fl.z = z; fl.t0 = tLift; fl.tau = 2.2; fl.lift = 5 + 3 * Math.sin(p.ph); fl.r = 1.2; fl.seed = p.ph / 10; fl.ground = 0.3;
          // (where they were when the wind took them, not where a runner would be now)
          if (p.run && v > p.run.t0) {
            const d0 = clamp(SP * (Gat(tLift) - Gat(p.run.t0)) - 0.35 * (1 - Math.exp(-(tLift - p.run.t0) / 0.2)), 0, p.run.L);
            fl.z = p.z + d0;
          }
          const f = flight(fl, v, {});
          if (gone(f, s)) { crowd.pose(p.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
          const t = v - tLift;
          x = f.x; y = f.y; z = f.z;
          pitch = pitch + p.spin * t * 0.9 + 1.2 * smooth(0, 0.6, t);
          roll += p.spin * t * 0.5;
          armL = 1.3 + 0.4 * Math.sin(t * 9 + p.ph); armR = 1.5 + 0.4 * Math.sin(t * 8 + p.ph * 2);
          walk = t * 10; stride = 0.8; look = 0.9;
        }
        crowd.pose(p.i, { x, y, z, yaw, s: p.s, walk, stride, sit, pitch, roll, armL, armR, look });
        // the phone's screen (seen from behind it glows), until they run or fly
        if (p.act === 'phone' && !lifted && (!p.run || v < p.run.t0) && (!p.hold || v < p.hold.t0)) {
          const hx = x + (Math.sin(yaw) * 0.6 + Math.cos(yaw) * 0.215) * p.s, hz = z + (Math.cos(yaw) * 0.6 - Math.sin(yaw) * 0.215) * p.s;
          glows.add(hx, y + 1.42 * p.s, hz, 0.09, 0.9, 0.95, 1.1);
        }
      }
      crowd.commit();
    },
  };
}
