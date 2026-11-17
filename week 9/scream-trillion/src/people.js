// The people, planned up front (pure data, so nobody jumps or walks through anybody): walkers on both sidewalks (one
// direction per lane, 2.5 m+ apart), a few people standing near you, the cafe's customers at their tables, three
// people crossing the road. What each one does depends only on how loud your scream is where they are:
//   past ~85 dB (a sudden scream close by) they stop, turn to you and clap their hands over their ears (everyone
//     within ~6 m already has at frame 0);
//   past 130 dB (pain) they double over;
//   at ~2 psi (0.7-1.3x) they're knocked off their feet and thrown away from you: down the street, tumbling, landing
//     on their backs and sliding to a stop.
import * as THREE from 'three';
import { rng, clamp, smooth, lerp } from './util.js';
import { timeOfL, timeOfPressure, logMult, P_KNOCK } from './timeline.js';
import { YOU, MOUTH, CAFE, CAM } from './layout.js';
import { CHAIRS } from './props.js';
import { throwAt } from './physics.js';
import { SKIN, HAIR } from './crowd.js';

const SHIRT = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0x264653, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x5a6a4a, 0x7a2a2a, 0xd8d2c4, 0x3a5a9a, 0xf2c14e, 0x4ea8de];
const PANTS = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x4a6a9a, 0xc9c2b6, 0x23252b, 0x3a4a6a, 0x8a7a66];
const SPEED = 1.3;
const rOf = (x, z, y = 1.6) => Math.hypot(x - MOUTH.x, y - MOUTH.y, z - MOUTH.z);

export const PEOPLE = [];
{
  const R = rng(2626);
  const add = (p) => {
    p.i = PEOPLE.length;
    p.shirt = SHIRT[Math.floor(R() * SHIRT.length)]; p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)]; p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.55; p.ph = R() * 6.28; p.s = 0.93 + R() * 0.12;
    p.react = 0.15 + R() * 0.4; p.knockK = 0.7 + 0.6 * R(); p.rnd = R(); p.rnd2 = R(); p.away = R() < 0.25;
    PEOPLE.push(p);
  };
  const clearOfCam = (x, z) => Math.hypot(x - CAM.x, z - CAM.z) > 3.0 && !(Math.abs(x - YOU.x) < 0.9 && z > -1.2 && z < 3);
  const inCafe = (x, z) => x > CAFE.x0 - 0.35 && x < CAFE.x1 + 0.2 && z > CAFE.z0 - 0.3 && z < CAFE.z1 + 0.35;
  // walkers: [x, direction (+1 south, -1 north), z from, z to]
  const lanes = [
    [6.55, -1, -1.5, -160], [7.25, 1, -160, -2.4], [7.95, -1, -2.4, -160], [8.6, 1, -160, -11.5],
    [9.3, -1, -11.5, -150], [10.0, 1, -150, -11.5],
    [-6.6, 1, -160, 30], [-7.4, -1, 30, -160], [-8.2, 1, -160, 30], [-9.0, -1, 30, -160], [-9.8, 1, -160, 30], [-10.5, -1, 30, -160],
  ];
  for (const [x, dir, za, zb] of lanes) {
    const lo = Math.min(za, zb), hi = Math.max(za, zb);
    for (let z = lo + R() * 2; z < hi - 0.5; z += 2.6 + R() * 3.4) {
      const xx = x + (R() - 0.5) * 0.15;
      if (!clearOfCam(xx, z) || inCafe(xx, z)) continue;
      // (the lane's end: they stop there if they get that far)
      add({ kind: 'walk', x: xx, z, dir, end: dir > 0 ? hi : lo });
    }
  }
  // standing near you: a couple, a man with a coffee, a woman at the curb (all turned to you already)
  for (const [x, z] of [[6.9, -1.9], [6.45, -2.6], [7.5, -4.9], [6.6, -5.6], [7.2, -7.9], [8.3, -10.2]]) add({ kind: 'stand', x, z, yaw: Math.PI + (R() - 0.5) });
  // the cafe's customers
  CHAIRS.forEach((c, k) => { if (k % 3 !== 2) add({ kind: 'sit', x: c.x - Math.sin(c.yaw) * 0.04, z: c.z - Math.cos(c.yaw) * 0.04, yaw: c.yaw }); });
  // crossing the road
  for (const [x, z, dir] of [[-3.2, -15.5, 1], [0.5, -23, -1], [2.4, -34, 1]]) add({ kind: 'cross', x, z, dir });
  // when each reacts
  for (const p of PEOPLE) {
    // (walkers: where they'd be at a time t, to find when the scream reaches them)
    const posAt = (t) => p.kind === 'walk' ? clamp(p.z + p.dir * SPEED * t, Math.min(p.z, p.end), Math.max(p.z, p.end)) : p.z;
    let tH = 0;
    for (let k = 0; k < 4; k++) {
      const z = p.kind === 'cross' ? p.z : posAt(tH), x = p.kind === 'cross' ? p.x + p.dir * SPEED * tH : p.x;
      tH = timeOfL(-1.5 + 2 * Math.log10(Math.max(rOf(x, z), 0.5))) + p.react;
    }
    p.tHear = tH;
    // where they stand once they've stopped (a 0.5 s slow-down)
    const tw = Math.max(tH, -3) + 0.25;
    if (p.kind === 'walk') { p.sx = p.x; p.sz = posAt(tw); }
    else if (p.kind === 'cross') { p.sx = p.x + p.dir * SPEED * tw; p.sz = p.z; }
    else { p.sx = p.x; p.sz = p.z; }
    const r = rOf(p.sx, p.sz);
    p.r = r;
    p.tPain = timeOfL(3 + 2 * Math.log10(Math.max(r, 0.5))) + p.react * 0.5;
    p.tKnock = timeOfPressure(P_KNOCK * p.knockK, Math.hypot(p.sx - MOUTH.x, 1.0 - MOUTH.y, p.sz - MOUTH.z));
    const Lk = Number.isFinite(p.tKnock) ? logMult(p.tKnock) : 9;
    const dx = p.sx - MOUTH.x, dz = p.sz - MOUTH.z, dh = Math.hypot(dx, dz) || 1;
    const V = 2.5 + 3 * p.rnd + 4 * Math.max(0, Lk - 9);
    p.T = { t0: p.tKnock, p: [p.sx, p.kind === 'sit' ? 0.5 : 0.9, p.sz], vel: [dx / dh * V, 1.6 + 2.2 * p.rnd2, dz / dh * V], hs: 0.12, D: 5, wallX: 10.6 };
    p.flips = V > 9 ? 1 : 0;
    p.faceYou = Math.atan2(MOUTH.x - p.sx, MOUTH.z - p.sz);
  }
}

const angTo = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
// the pose of person p at time v (for crowd.pose), plus ears: 0..1 (hands over the ears)
export function personAt(p, v, out) {
  const st = out.st || (out.st = {});
  let x = p.sx, z = p.sz, yaw = p.kind === 'walk' ? (p.dir > 0 ? 0 : Math.PI) : p.kind === 'cross' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : p.yaw;
  let stride = 0, walk = 0, sit = p.kind === 'sit' ? 1 : 0, pitch = 0, roll = 0, armL = 0, armR = 0, y = 0, ears = 0, look = 0;
  // walking until they hear you
  if ((p.kind === 'walk' || p.kind === 'cross') && v < p.tHear + 0.5) {
    const t = Math.min(v, p.tHear), d = Math.max(0, v - p.tHear);
    const u = SPEED * t + SPEED * (d - d * d / 1.0);
    if (p.kind === 'walk') { z = clamp(p.z + p.dir * u, Math.min(p.z, p.end), Math.max(p.z, p.end)); x = p.x; }
    else { x = p.x + p.dir * u; z = p.z; }
    const atEnd = p.kind === 'walk' && (z === p.end);
    stride = atEnd ? 0 : 1 - smooth(p.tHear, p.tHear + 0.5, v);
    walk = v * 7.2 + p.ph;
  }
  // turn to you, hands to the ears
  const kH = smooth(p.tHear, p.tHear + 0.5, v);
  const face = p.away ? p.faceYou + Math.PI : p.faceYou;
  yaw = angTo(yaw, face, p.kind === 'sit' ? kH * 0.5 : kH);
  ears = smooth(p.tHear + 0.1, p.tHear + 0.5, v);
  // doubled over in pain
  const kP = smooth(p.tPain, p.tPain + 0.6, v);
  pitch = (p.away ? 0.5 : 0.42) * kP; sit = Math.max(sit, 0.3 * kP); look = -0.3 * kP;
  // thrown
  if (v > p.T.t0) {
    throwAt(p.T, v, st);
    const f = st.f;
    x = st.x; z = st.z;
    const fall = p.away ? Math.PI / 2 : -Math.PI / 2;     // (face down if they'd turned away)
    pitch = lerp(pitch, fall + (p.away ? 1 : -1) * p.flips * Math.PI * 2, smooth(0, 1, f));
    roll = 0.4 * Math.sin(f * 3 + p.rnd * 6) * (1 - f);
    sit = lerp(sit, 0, smooth(0, 0.3, f));
    ears = (1 - smooth(0, 0.25, f)) * ears;
    // (flailing in the air; on the ground the arms lie flat: by the sides or flung back over the head)
    const lie = smooth(0.85, 1, f);
    armL = lerp(1.4 + 0.3 * Math.sin(st.t * 13 + p.ph), p.rnd < 0.5 ? 1.95 : 0.12, lie);
    armR = lerp(1.5 + 0.3 * Math.sin(st.t * 11 + p.ph * 2), p.rnd2 < 0.5 ? 1.9 : 0.1, lie);
    y = st.landed ? 0.1 : Math.max(0.1, st.y - 0.75);
    if (st.landed) pitch = fall;
  }
  out.x = x; out.y = y; out.z = z; out.yaw = yaw; out.s = p.s; out.walk = walk; out.stride = stride; out.sit = sit;
  out.pitch = pitch; out.roll = roll; out.armL = armL; out.armR = armR; out.look = look; out.ears = ears;
  return out;
}

// hands over the ears: crowd.js arms are one straight piece, so the arm is drawn shortened, from the shoulder up to the
// side of the head (it reads as a bent arm at street distance)
const e = new THREE.Euler(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), base = new THREE.Matrix4(), loc = new THREE.Matrix4(), m4 = new THREE.Matrix4();
const vv = new THREE.Vector3(), sc = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3();
export function earArms(crowd, i, P) {
  if (!(P.ears > 0.001)) return;
  const lean = P.pitch + 0.06 * P.sit;
  e.set(lean, P.yaw, P.roll, 'YXZ'); q.setFromEuler(e);
  base.compose(vv.set(P.x, P.y - P.sit * 0.42, P.z), q, sc.setScalar(P.s));
  const arms = [crowd.meshes[5], crowd.meshes[6]];
  [-1, 1].forEach((sx, k) => {
    dir.set(-sx * 0.1, 0.22, 0.03).normalize();
    qa.setFromUnitVectors(DOWN, dir);
    const qr = new THREE.Quaternion().slerp(qa, P.ears);
    const len = lerp(1, 0.42, P.ears);
    loc.compose(vv.set(sx * 0.215, 1.38, 0), qr, sc.set(1.15, len, 1));
    arms[k].setMatrixAt(i, m4.multiplyMatrices(base, loc));
  });
}
