// The people, planned up front (pure data, so nobody jumps or walks through anybody): walkers on both sidewalks (one
// direction per lane), a few people standing round you, two crossing the road. What each one does depends only on the
// heat where they are (timeline.js):
//   ~0.15 kW/m² (a warm glow on the face, and a glowing person): they stop and turn to look at you;
//   ~0.5 kW/m² (like an open oven, and climbing fast): they flinch back, arms up over their faces, then turn and
//     run, straight up or down the street away from you. Runners in one lane never pass through each other (the one
//     behind keeps a step back from the one in front).
// Your friend (main.js, a detailed figure) is planned in main.js; she is the first to jump back.
import { rng, clamp, smooth, lerp } from './util.js';
import { timeOfQ, Q, logQ, logMult } from './timeline.js';
import { LQ } from './heat.js';
import { HEART, CAM, YOU, TREES, LAMPS } from './layout.js';
import { SKIN, HAIR } from './crowd.js';

const SHIRT = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0x264653, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x5a6a4a, 0x7a2a2a, 0xd8d2c4, 0x3a5a9a, 0xf2c14e, 0x4ea8de];
const PANTS = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x4a6a9a, 0xc9c2b6, 0x23252b, 0x3a4a6a, 0x8a7a66];
const WALK = 1.3;
const rOf = (x, z, y = 1.4) => Math.hypot(x - HEART.x, y - HEART.y, z - HEART.z);

export const PEOPLE = [];
{
  const R = rng(9393);
  const add = (p) => {
    p.i = PEOPLE.length;
    p.shirt = SHIRT[Math.floor(R() * SHIRT.length)]; p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)]; p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.45; p.ph = R() * 6.28; p.s = 0.93 + R() * 0.12;
    p.react = 0.1 + R() * 0.35; p.k = 0.8 + 0.45 * R(); p.rnd = R(); p.speed = 3.7 + 1.1 * R();
    PEOPLE.push(p);
  };
  const clearOfCam = (x, z) => Math.hypot(x - CAM.x, z - CAM.z) > 2.2 && Math.hypot(x - YOU.x, z - YOU.z) > 1.4;
  const clearOfStuff = (x, z) => !TREES.some((t) => Math.hypot(t.x - x, t.z - z) < 0.7) && !LAMPS.some((l) => Math.hypot(l.x - x, l.z - z) < 0.6);
  // walkers: [x, direction (+1 south, -1 north), z from, z to]
  const lanes = [
    [7.9, -1, 20, -170], [8.6, 1, -170, 20], [9.35, -1, 20, -170], [10.1, 1, -170, 20],
    [-7.9, 1, -170, 30], [-8.6, -1, 30, -170], [-9.35, 1, -170, 30], [-10.1, -1, 30, -170],
  ];
  for (const [x, dir, za, zb] of lanes) {
    const lo = Math.min(za, zb), hi = Math.max(za, zb);
    for (let z = lo + R() * 2; z < hi - 0.5; z += 2.4 + R() * 3.2) {
      const xx = x + (R() - 0.5) * 0.12;
      if (!clearOfCam(xx, z)) continue;
      add({ kind: 'walk', x: xx, z, dir, end: dir > 0 ? hi : lo });
    }
  }
  // standing round you (looking at you already: you're glowing)
  for (const [x, z] of [[6.2, 0.75], [6.05, -2.9], [2.95, 0.55], [5.15, 1.35], [7.55, 0.1], [9.5, -3.6], [10.1, -4.7], [7.6, -6.2], [2.6, -3.6]]) add({ kind: 'stand', x, z });
  // crossing the road
  for (const [x, z, dir] of [[-2.8, -14.5, 1], [0.6, -24, -1], [-1.2, -38, 1]]) add({ kind: 'cross', x, z, dir });
  for (const p of PEOPLE) {
    // where a walker / crosser is at time t (before they stop)
    const posAt = (t) => (p.kind === 'walk' ? [p.x, clamp(p.z + p.dir * WALK * t, Math.min(p.z, p.end), Math.max(p.z, p.end))]
      : p.kind === 'cross' ? [p.x + p.dir * WALK * t, p.z] : [p.x, p.z]);
    let tN = 0;
    for (let k = 0; k < 4; k++) { const [x, z] = posAt(tN); tN = timeOfQ(150 * p.k, rOf(x, z)) + p.react; }
    p.tNotice = tN;
    const [sx, sz] = posAt(Math.max(tN, -3) + 0.3);
    p.sx = sx; p.sz = sz;
    p.tFlee = Math.max(p.tNotice + 0.25, timeOfQ(Q.FLEE * p.k, rOf(sx, sz)) + p.react * 0.6);
    // the flinch: a step straight back from you; then the run, along the street, away from you
    const dx = p.sx - HEART.x, dz = p.sz - HEART.z, dh = Math.hypot(dx, dz) || 1;
    p.bx = p.sx + dx / dh * 0.45; p.bz = p.sz + dz / dh * 0.45;
    p.runDir = Math.abs(dz) > 0.4 ? Math.sign(dz) : (p.rnd < 0.5 ? -1 : 1);
    if (p.kind === 'stand' && p.sx > 4.4 && p.sx < 5.8 && p.sz > 0) p.runDir = 1;   // (the one at your side: past the camera)
    p.faceYou = Math.atan2(HEART.x - p.sx, HEART.z - p.sz);
  }
  // nobody may stand inside anybody else (or a tree, or a lamp)
  for (let i = 0; i < PEOPLE.length; i++) {
    const a = PEOPLE[i];
    if (!clearOfStuff(a.sx, a.sz) || !clearOfStuff(a.bx, a.bz)) { a.gone = true; continue; }
    for (let j = 0; j < i; j++) {
      const b = PEOPLE[j];
      if (b.gone) continue;
      if (Math.hypot(a.sx - b.sx, a.sz - b.sz) < 0.7 || Math.hypot(a.bx - b.bx, a.bz - b.bz) < 0.7) { a.gone = true; break; }
    }
  }
  // the runners' lanes: the one in front of each (same lane, same way), so the one behind keeps a step back
  const live = PEOPLE.filter((p) => !p.gone);
  for (const p of live) {
    let best = null;
    for (const o of live) {
      if (o === p || o.runDir !== p.runDir || Math.abs(o.bx - p.bx) > 0.6) continue;
      const ahead = (o.bz - p.bz) * p.runDir;
      if (ahead > 0 && (!best || ahead < (best.bz - p.bz) * p.runDir)) best = o;
    }
    p.front = best;
  }
}

const angTo = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
// how far along the street a runner has got (m from where they started running), keeping behind the one in front
function runZ(p, v) {
  const t = v - p.tFlee - 0.35;
  if (!(t > 0)) return p.bz;
  const acc = 0.6;
  const d = t < acc ? 0.5 * p.speed * t * t / acc : p.speed * (t - acc / 2);
  let z = p.bz + p.runDir * d;
  if (p.front) { const zf = runZ(p.front, v); if ((z - zf) * p.runDir > -0.9) z = zf - p.runDir * 0.9; }
  return z;
}
// the pose of person p at time v (for crowd.pose)
export function personAt(p, v, out) {
  if (p.gone) { out.visible = false; return out; }
  // (once the flames reach where they've got to, the smoke and glare hide them: they're not shown)
  if (v > 9 && logQ(logMult(v), rOf(p.bx, runZ(p, v))) > LQ.TREE) { out.visible = false; return out; }
  out.visible = true;
  let x = p.sx, z = p.sz, yaw = p.kind === 'walk' ? (p.dir > 0 ? 0 : Math.PI) : p.kind === 'cross' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : p.faceYou;
  let stride = 0, walk = 0, pitch = 0, armL = 0, armR = 0, look = 0;
  // walking until they notice you
  if ((p.kind === 'walk' || p.kind === 'cross') && v < p.tNotice + 0.3) {
    const t = Math.min(v, p.tNotice), d = Math.max(0, v - p.tNotice);
    const u = WALK * t + WALK * (d - d * d / 0.6);
    if (p.kind === 'walk') { z = clamp(p.z + p.dir * u, Math.min(p.z, p.end), Math.max(p.z, p.end)); x = p.x; }
    else { x = p.x + p.dir * u; z = p.z; }
    stride = (p.kind === 'walk' && z === p.end) ? 0 : 1 - smooth(p.tNotice, p.tNotice + 0.3, v);
    walk = v * 7.2 + p.ph;
  }
  // turn to look at you
  yaw = angTo(yaw, p.faceYou, smooth(p.tNotice, p.tNotice + 0.5, v));
  look = 0.15 * smooth(p.tNotice, p.tNotice + 0.5, v);
  // flinch: a quick step back, leaning away, arms up over the face
  const kF = smooth(p.tFlee, p.tFlee + 0.3, v);
  x = lerp(x, p.bx, kF); z = lerp(z, p.bz, kF);
  pitch = -0.18 * kF;
  armL = armR = 1.35 * kF;
  // and run: turn away along the street, arms pumping
  const kR = smooth(p.tFlee + 0.25, p.tFlee + 0.6, v);
  if (kR > 0) {
    z = runZ(p, v); x = p.bx;
    yaw = angTo(yaw, p.runDir > 0 ? 0 : Math.PI, kR);
    stride = Math.max(stride, 1.6 * kR);
    walk = (v - p.tFlee) * 11 + p.ph;
    pitch = lerp(pitch, 0.12, kR);
    armL = armR = lerp(1.35, 0.15, kR);
    // (one arm stays up, shielding the face from the glare behind them)
    armR = lerp(armR, 0.9, kR * (p.rnd < 0.5 ? 1 : 0));
    look = 0;
  }
  out.x = x; out.y = 0; out.z = z; out.yaw = yaw; out.s = p.s; out.walk = walk; out.stride = stride; out.sit = 0;
  out.pitch = pitch; out.roll = 0; out.armL = armL; out.armR = armR; out.look = look;
  return out;
}
