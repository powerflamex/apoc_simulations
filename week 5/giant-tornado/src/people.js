// The people on Main Street. Planned up front so nobody walks through anybody, jumps or changes size:
//   - a few right by you (hand placed): phones up, pointing, hands on their heads;
//   - the crowd on both sidewalks and standing in the road, some still walking on frame 0 (they slow and stop to
//     stare), most filming it; the wind leans them, staggers them;
//   - runners: from ~11 s they run away from the wall, straight down the street (parallel paths never cross) and past
//     you, only if their whole lane is clear of everyone standing (checked here at load);
//   - holders: at ~29 s the people nearest the lamp posts grab them and stream out flat in the wind; everyone else is
//     lifted off one by one from 33 s and tumbles away into the wall; the holders go when their post goes.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, ROAD_X, FX, LAMPS, inCross } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_RUN, V_HOLD, V_PEOPLE, windMs } from './timeline.js';
import { flight, gone } from './fly.js';

const COATS = [0x1d2230, 0x2b2b2e, 0x3a3328, 0x6b5a44, 0x51545a, 0x7a2a2a, 0x24384a, 0x8a8478, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x5a3a5a, 0xc0a070, 0x3a4a6a, 0xd84a2a, 0xe8e0d0];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x6a5a48];

export const PEOPLE = [];
{
  const R = rng(5150);
  // you look north (-z); offsets [ahead, right] from you
  const at = (a, r) => ({ x: CAM0.x + r, z: CAM0.z - a });
  // (nobody right in the middle: you see straight down the street to the wall between them)
  const NEAR = [
    [2.4, 1.3, 'phone'], [2.9, -1.5, 'point'], [3.8, 2.3, 'phone'], [4.4, -2.6, 'head'], [5.2, 1.6, 'phone'],
    [6.0, -1.5, 'head'], [6.6, 3.0, 'phone'], [3.4, 3.5, 'point', 0.78], [7.4, 2.0, 'phone'], [2.6, -3.3, 'head'],
    [8.2, -2.3, 'point'], [9.0, 3.6, 'phone'], [5.0, -3.9, 'phone'], [9.8, -3.4, 'head'], [10.8, 2.4, 'phone'], [12.5, -1.2, 'phone'],
  ];
  for (const [a, r, act, s] of NEAR) PEOPLE.push({ ...at(a, r), act, s: s || 0.94 + R() * 0.12, near: true });
  // the crowd: a jittered scatter with at least 0.95 m between people
  const ok = (x, z) => PEOPLE.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > 0.95 * 0.95) && (x - CAM0.x) ** 2 + (z - CAM0.z) ** 2 > 4 && !inCross(z, 1) && !(Math.abs(x - CAM0.x) < 1.7 && z > -48);
  const areas = [
    [-7.5, 7.5, -40, -11, 50],                                  // standing in the road ahead of you
    [-FX + 0.3, -ROAD_X - 0.3, -130, 18, 70], [ROAD_X + 0.3, FX - 0.3, -130, 18, 70],    // the sidewalks
    [-FX + 0.3, -ROAD_X - 0.3, -260, -130, 25], [ROAD_X + 0.3, FX - 0.3, -260, -130, 25],
    [-6, 6, -100, -45, 20],
  ];
  for (const [x0, x1, z0, z1, n] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 30 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!ok(x, z)) continue;
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
    p.sleeves = R() < 0.7;
    p.ph = R() * 10;
    p.yaw0 = Math.PI + (R() - 0.5) * 0.6;                    // facing north (yaw PI faces -z), toward the wall
    p.tReact = 0.3 + R() * 2.4;
    p.tLift = V_PEOPLE + R() * 6.5 + (p.near ? 1.5 : 0);
    p.spin = (R() - 0.5) * 2.5;
    p.walk = null; p.run = null; p.hold = null;
  });
  // walkers on frame 0: a few steps along the sidewalk, stopping by ~0.6-2.2 s
  const clearSeg = (p, ax, az, bx, bz, minD) => PEOPLE.every((q) => {
    if (q === p) return true;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((q.x - ax) * dx + (q.z - az) * dz) / L2);
    return (ax + dx * t - q.x) ** 2 + (az + dz * t - q.z) ** 2 > minD * minD;
  });
  for (const p of PEOPLE) {
    if (p.near || Math.abs(p.x) < ROAD_X || p.z < -60 || R() > 0.45) continue;
    const dz = R() < 0.5 ? 1 : -1;
    const tStop = 0.6 + R() * 1.6, sp = 1.25 + R() * 0.3;
    const L = sp * tStop / 2 + sp * 0.9;
    const az = p.z - dz * L;
    if (!clearSeg(p, p.x, az, p.x, p.z, 0.8)) continue;
    p.walk = { dx: 0, dz, tStop, sp };
  }
  // holders: for each lamp post near you, the two nearest standing people go to it and hang on (they never run)
  for (const l of LAMPS) {
    if (l.z < -90 || l.z > 15) continue;
    const near = PEOPLE.filter((p) => !p.hold && !p.near && (p.x - l.x) ** 2 + (p.z - l.z) ** 2 < 36).sort((a, b) => (a.x - l.x) ** 2 + (a.z - l.z) ** 2 - (b.x - l.x) ** 2 - (b.z - l.z) ** 2).slice(0, 2);
    near.forEach((p, k) => { p.hold = { x: l.x + (k ? 0.45 : -0.45) * (l.side), z: l.z - 1.7, lamp: l, t0: V_HOLD + R() * 1.6 }; });
  }
  // runners: straight down the street (+z, away from the wall), past you, all at the same pace so nobody overtakes.
  // Anyone standing in a runner's lane ahead of them runs too (and sets off a little earlier, so the gap never
  // closes); a lane with a holder or one of the people right by you in it stays put.
  const SP = 3.8;
  const lane = (a, b) => Math.abs(a.x - b.x) < 0.8;
  for (const p of PEOPLE) {
    if (p.near || p.hold || R() > 0.5) continue;
    if (Math.abs(p.x - CAM0.x) < 1.1) continue;                 // would run through you
    const ahead = PEOPLE.filter((q) => q !== p && lane(q, p) && q.z > p.z);
    if (ahead.some((q) => q.near || q.hold || Math.abs(q.x - CAM0.x) < 1.1)) continue;
    p.run = { dx: 0, dz: 1, sp: SP, t0: V_RUN + R() * 3.2, L: 70 - p.z };
  }
  // the chains: in each lane, everyone ahead of a runner runs, starting earlier than the one behind
  for (let pass = 0; pass < 6; pass++) {
    for (const p of PEOPLE) {
      if (!p.run) continue;
      for (const q of PEOPLE) {
        if (q === p || !lane(q, p) || q.z <= p.z) continue;
        const t0 = Math.max(p.run.t0 - 0.05, V_RUN - 0.5);
        if (!q.run) q.run = { dx: 0, dz: 1, sp: SP, t0, L: 70 - q.z };
        else if (q.run.t0 > t0) q.run.t0 = t0;
      }
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
        x += wobble(v * 2.1, p.ph) * 0.05 * leanK;
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
            y = 1.05 * flat;
            z = lerp(z, p.hold.z - 0.15, flat);
            armL = lerp(armL, 1.05, grip); armR = lerp(armR, 1.0, grip);
            walk = v * 8 + p.ph; stride = 0.9 * flat; look = 0.6;
            roll = 0.1 * wobble(v * 4, p.ph) * flat;
          }
        }
        if (p.run && v > p.run.t0 && !(p.hold && v > p.hold.t0)) {
          const sx = clamp((v - p.run.t0) * p.run.sp, 0, p.run.L);
          z += sx;
          const moving = sx < p.run.L ? 1 : 0;
          const turn = smooth(p.run.t0, p.run.t0 + 0.35, v);
          yaw = lerp(yaw, 0, turn * moving);
          if (moving) { walk = v * 11 + p.ph; stride = 1.5 * turn; armL = armR = 0.25; look = 0.1; pitch = 0.15 * turn; }
        }
        // lifted off: tumbling away toward the wall
        const tLift = p.hold ? (p.tLiftH ?? 1e4) : p.tLift;
        if (v > tLift) {
          lifted = true;
          fl.x = x; fl.y = y; fl.z = z; fl.t0 = tLift; fl.tau = 2.2; fl.lift = 5 + 3 * Math.sin(p.ph); fl.r = 1.2; fl.seed = p.ph / 10; fl.ground = 0.3;
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
