// The people, planned up front (pure data, so nobody jumps or walks through anybody): walkers on both sidewalks (one
// direction per lane), a few people standing round you, two crossing the road. What each one does depends only on the
// heat where they are (timeline.js):
//   ~0.15 kW/m² (a warm glow on the face, and a glowing person): they stop and turn to look at you;
//   ~0.5 kW/m² (like an open oven, and climbing fast): they flinch back, arms up over their faces, then turn and
//     run, up the street ahead of you (or back past the camera if they're behind you; across the plaza if in it). Runners in one lane never pass through each other (the one
//     behind keeps a step back from the one in front).
// Your friend (main.js, a detailed figure) is planned in main.js; she is the first to jump back.
import { rng, clamp, smooth, lerp } from './util.js';
import { timeOfQAt, Q, lqHist, heartAt } from './timeline.js';
import { LQ } from './heat.js';
import { TREES, LAMPS, CART, BUS, PLAZA, FOUNTAIN, PARKED } from './layout.js';
import { TABLES, BINS } from './props.js';
import { SKIN, HAIR } from './crowd.js';

const SHIRT = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0x264653, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x5a6a4a, 0x7a2a2a, 0xd8d2c4, 0x3a5a9a, 0xf2c14e, 0x4ea8de];
const PANTS = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x4a6a9a, 0xc9c2b6, 0x23252b, 0x3a4a6a, 0x8a7a66];
const WALK = 1.3;
const H = {};

export const PEOPLE = [];
{
  const R = rng(9394);
  const add = (p) => {
    p.i = PEOPLE.length;
    p.shirt = SHIRT[Math.floor(R() * SHIRT.length)]; p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)]; p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.45; p.ph = R() * 6.28; p.s = 0.93 + R() * 0.12;
    p.react = 0.08 + R() * 0.3; p.k = 0.8 + 0.45 * R(); p.rnd = R(); p.speed = 3.7 + 1.1 * R();
    PEOPLE.push(p);
  };
  const solid = [...TREES.map((t) => [t.x, t.z, 0.6]), ...LAMPS.map((l) => [l.x, l.z, 0.5]), ...TABLES.map((t) => [t.x, t.z, 0.75]), ...BINS.map((b) => [b.x, b.z, 0.6]),
    [CART.x, CART.z, 1.4], [FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r + 0.6], ...PARKED.map((c) => [c.x, c.z, 2.6])];
  const clearOfStuff = (x, z) => !solid.some(([sx, sz, r]) => Math.hypot(sx - x, sz - z) < r) && !(Math.abs(x - BUS.x) < BUS.w / 2 + 0.5 && Math.abs(z - BUS.z) < BUS.len / 2 + 0.5);
  // walkers on both sidewalks: [x, direction (+1 south, -1 north), z from, z to]
  const lanes = [[5.95, -1, 30, -55], [6.55, 1, -55, 30], [-5.95, 1, -55, 30], [-6.55, -1, 30, -55]];
  for (const [x, dir, za, zb] of lanes) {
    const lo = Math.min(za, zb), hi = Math.max(za, zb);
    for (let z = lo + R() * 2; z < hi - 0.5; z += 2.2 + R() * 3) add({ kind: 'walk', x: x + (R() - 0.5) * 0.1, z, dir, end: dir > 0 ? hi : lo });
  }
  // in the street round you and ahead of you (it's a busy shopping street: people cross anywhere); they all scream
  for (const [x, z] of [[0.55, -2.4], [-0.95, -3.2], [1.05, -3.9], [0.15, -5.1], [-0.75, -6.3], [1.45, -6.8], [0.6, -8.6], [2.2, -12.5], [1.2, -15], [0.9, -19.5], [2.0, -23]]) add({ kind: 'stand', x, z, road: true });
  // round the fountain in the plaza
  for (const [x, z] of [[8.6, -24.5], [12.8, -25.4], [14.2, -28.6], [13.5, -31.5], [9.4, -32.6], [16.5, -27], [11.2, -22.8], [16.8, -30.8], [2.6, -27.2], [4.3, -32.6]]) add({ kind: 'stand', x, z, plaza: true });
  for (const p of PEOPLE) {
    const posAt = (t) => (p.kind === 'walk' ? [p.x, clamp(p.z + p.dir * WALK * t, Math.min(p.z, p.end), Math.max(p.z, p.end))] : [p.x, p.z]);
    let tN = 0;
    for (let k = 0; k < 4; k++) { const [x, z] = posAt(tN); tN = timeOfQAt(150 * p.k, x, 1.4, z) + p.react; }
    p.tNotice = tN;
    const [sx, sz] = posAt(Math.max(tN, -3) + 0.3);
    p.sx = sx; p.sz = sz;
    p.tFlee = Math.max(p.tNotice + 0.2, timeOfQAt(Q.FLEE * p.k, sx, 1.4, sz) + p.react * 0.6);
    // the flinch: a step straight back from where you are then; then the run away from you
    heartAt(p.tFlee, H);
    const dx = p.sx - H.x, dz = p.sz - H.z, dh = Math.hypot(dx, dz) || 1;
    p.bx = p.sx + dx / dh * 0.45; p.bz = p.sz + dz / dh * 0.45;
    p.runDir = dz > 0 ? 1 : -1;
    // (in the road they run up your lane, clear of the bus and the cars; in the plaza they run off across it)
    if (p.road) p.bx = clamp(p.bx, 0.6, 1.1);
    if (p.plaza) { p.runAxis = 'x'; p.runDir = 1; p.end = PLAZA.x1 - 0.6; }
  }
  // nobody may stand inside anybody else (or a tree, a lamp, a car, the cart, the fountain)
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
      if (o === p || o.runDir !== p.runDir || o.runAxis || p.runAxis || Math.abs(o.bx - p.bx) > 0.6) continue;
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
  if (v > 7 && (p.runAxis ? lqHist(Math.min(p.end, p.bx + Math.max(0, v - p.tFlee - 0.4) * p.speed), 1.4, p.bz, v) : lqHist(p.bx, 1.4, runZ(p, v), v)) > LQ.TREE) { out.visible = false; return out; }
  out.visible = true;
  heartAt(v, H);
  const faceYou = Math.atan2(H.x - p.sx, H.z - p.sz);
  let x = p.sx, z = p.sz, yaw = p.kind === 'walk' ? (p.dir > 0 ? 0 : Math.PI) : faceYou;
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
  yaw = angTo(yaw, faceYou, smooth(p.tNotice, p.tNotice + 0.5, v));
  look = 0.15 * smooth(p.tNotice, p.tNotice + 0.5, v);
  // flinch: a quick step back, leaning away, arms up over the face
  const kF = smooth(p.tFlee, p.tFlee + 0.3, v);
  x = lerp(x, p.bx, kF); z = lerp(z, p.bz, kF);
  pitch = -0.18 * kF;
  armL = armR = 1.35 * kF;
  // and run: turn away along the street, arms pumping
  const kR = smooth(p.tFlee + 0.25, p.tFlee + 0.6, v);
  if (kR > 0) {
    if (p.runAxis) {
      const t = Math.max(0, v - p.tFlee - 0.35);
      x = Math.min(p.end, p.bx + (t < 0.6 ? 0.5 * p.speed * t * t / 0.6 : p.speed * (t - 0.3))); z = p.bz;
      yaw = angTo(yaw, Math.PI / 2, kR);
    } else { z = runZ(p, v); x = p.bx; yaw = angTo(yaw, p.runDir > 0 ? 0 : Math.PI, kR); }
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
