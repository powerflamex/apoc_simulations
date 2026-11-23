// The people, planned up front (pure data, so nobody jumps). A packed crowd round you on the promenade (most turned to
// you, many filming you on their phones), people on the sidewalks, a crowd on the waterfront plaza.
// What moves them (all functions of the video time):
//   the clear ring C(v): as each new kind of thing starts flying in, the people near you back away from you along
//     their own line (a map r -> max(r, C + 0.55 r) keeps everyone in order, so nobody walks through anybody):
//     a step back when the bikes come (4 s), a scramble back as the cars come (10 s);
//   dives: anyone close to a sliding car's path throws themselves sideways out of it just before it gets there, lies
//     there a moment, and gets up;
//   from 100,000x (17 s) you push water and people away: the same map with the push radius (timeline.js pushR), but now
//     they don't walk: they're shoved, feet skidding, leaning back, arms out; a third of them go over and slide on their backs.
// Their phones, keys and coins (smalls.js) come out of their hands and pockets first.
import { rng, clamp, smooth, lerp } from './util.js';
import { pushR } from './timeline.js';
import { SOLID, PROM, WALK, PLAZA_Z, QUAY_Z } from './layout.js';
import { SKIN, HAIR } from './crowd.js';
import { CARS } from './layout.js';
import { BUSF } from './traffic.js';

const SHIRT = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0x264653, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x5a6a4a, 0x7a2a2a, 0xd8d2c4, 0x3a5a9a, 0xf2c14e, 0x4ea8de];
const PANTS = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x4a6a9a, 0xc9c2b6, 0x23252b, 0x3a4a6a, 0x8a7a66];

// the clear ring round you (m): people within it back off to its edge
export const clearR = (v) => 1.0 + 1.9 * smooth(3.7, 4.7, v) + 5.6 * smooth(9.6, 11.2, v);
// the push (from 17 s): water and people shoved out
const pushK = (v) => smooth(16.9, 17.6, v);

export const PEOPLE = [];
{
  const R = rng(9394);
  const add = (p) => {
    p.i = PEOPLE.length;
    p.shirt = SHIRT[Math.floor(R() * SHIRT.length)]; p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)]; p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.45; p.ph = R() * 6.28; p.s = 0.93 + R() * 0.12; p.rnd = R(); p.rnd2 = R();
    p.r = Math.hypot(p.x, p.z); p.a = Math.atan2(p.x, p.z);
    PEOPLE.push(p);
  };
  const clear = (x, z, rad = 0.0) => !SOLID.some(([sx, sz, r]) => Math.hypot(sx - x, sz - z) < r + rad);
  // (the camera's view of you stays open: nobody between the camera and you, behind you to the right)
  const inWedge = (x, z) => z > -0.6 && x > -1.1 - 0.12 * Math.max(z, 0) && x < 1.4 + 0.42 * Math.max(z, 0);
  const tooClose = (x, z) => PEOPLE.some((q) => Math.hypot(q.x - x, q.z - z) < 0.72);
  // the promenade crowd: densest round you
  for (let k = 0; k < 9000 && PEOPLE.length < 330; k++) {
    const x = (R() - 0.5) * 2 * (PROM - 0.6), z = 10 - R() * 62;
    const r = Math.hypot(x, z);
    if (r < 1.05 || inWedge(x, z) || !clear(x, z) || tooClose(x, z)) continue;
    // (thinner further out)
    if (R() > 1.15 - r / 40) continue;
    add({ x, z, kind: 'prom', film: r < 16 && R() < 0.5 });
  }
  // the sidewalks: people standing at the shop fronts and the curb, turned to look
  for (const side of [-1, 1]) for (let z = 6; z > -70; z -= 1.6 + R() * 2.2) {
    const x = side * (15.6 + R() * 2.0);
    if (!tooClose(x, z)) add({ x, z, kind: 'walk', film: R() < 0.2 });
  }
  // the waterfront plaza
  for (let k = 0; k < 900 && PEOPLE.length < 470; k++) {
    const x = (R() - 0.5) * 46, z = PLAZA_Z - 2 - R() * (PLAZA_Z - QUAY_Z - 5);
    if (!tooClose(x, z)) add({ x, z, kind: 'plaza', film: R() < 0.35 });
  }
  for (const p of PEOPLE) { p.r = Math.hypot(p.x, p.z); p.a = Math.atan2(p.x, p.z); }
  // dives: out of the way of the cars and the bus sliding in
  const paths = [...CARS.filter((c) => c.f && c.f.mode === 'slide').map((c) => ({ f: c.f, w: 1.6 })), { f: BUSF, w: 2.4 }];
  for (const p of PEOPLE) {
    if (p.kind === 'plaza') continue;
    for (const { f, w } of paths) {
      // where they'll be when it comes: (backed off to the clear ring by then)
      const rr = Math.max(p.r, 8.5 + 0.55 * p.r);
      const px = Math.sin(p.a) * rr, pz = Math.cos(p.a) * rr;
      const ax = f.p0.x, az = f.p0.z, bx = f.p1.x, bz = f.p1.z, L2 = (bx - ax) ** 2 + (bz - az) ** 2;
      const h = clamp(((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / L2);
      const cx = ax + (bx - ax) * h, cz = az + (bz - az) * h, dd = Math.hypot(px - cx, pz - cz);
      if (dd < w + 0.9) {
        const tHit = f.tR + f.D * Math.sqrt(h);
        if (p.dive && p.dive.t < tHit - 0.45) continue;
        // sideways off the path, away from it
        let nx = px - cx, nz = pz - cz; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        if (nl < 0.05) { nx = -(bz - az); nz = bx - ax; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
        p.dive = { t: tHit - 0.45, dx: nx * (w + 1.6 - dd), dz: nz * (w + 1.6 - dd), up: tHit + 1.6 + p.rnd };
      }
    }
  }
}

const angTo = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
// how far out from you person p is at v (the clear ring, then the push)
function radiusAt(p, v) {
  const C = clearR(v);
  let r = p.kind === 'prom' ? Math.max(p.r, C + 0.55 * p.r) : p.r;
  const P = pushR(v) * pushK(v);
  if (P > 0) r = Math.max(r, lerp(r, P + 0.45 * r, 1) * (p.kind === 'plaza' ? 0 : 1));
  return r;
}
export function personAt(p, v, out) {
  const r = radiusAt(p, v), r0 = radiusAt(p, v - 0.12);
  const spd = (r - r0) / 0.12;
  let x = Math.sin(p.a) * r, z = Math.cos(p.a) * r;
  // (on the sidewalks the shop fronts stop them: they slide along the wall)
  if (p.kind === 'walk' && Math.abs(x) > WALK - 0.4) { const ex = Math.abs(x) - (WALK - 0.4); x = Math.sign(x) * (WALK - 0.4); z += Math.sign(z || -1) * ex; }
  const faceYou = Math.atan2(-x, -z);
  let yaw = faceYou, stride = 0, walk = v * 7 + p.ph, pitch = 0, roll = 0, armL = 0, armR = 0, look = 0, y = 0;
  // filming you (the phone's gone from the hand at smalls' tR: the arm jerks out, then comes back to the face)
  if (p.film) { const tg = p.phoneT ?? 99; armR = v < tg ? 1.0 : lerp(1.4, 1.25, smooth(tg, tg + 0.5, v)); }
  // keys and coins torn out of pockets: a flinch
  const tk = p.firstT ?? 99;
  const fl = smooth(tk, tk + 0.15, v) * (1 - smooth(tk + 0.6, tk + 1.5, v));
  pitch -= 0.15 * fl; armL = Math.max(armL, 0.9 * fl);
  // shouting at you: arms up and down, hands on heads
  if (v > 1 && p.r < 20 && p.rnd < 0.4) { armL = Math.max(armL, 1.5 + 0.15 * Math.sin(v * 3 + p.ph)); armR = Math.max(armR, p.film ? armR : 1.5); }
  // backing off (walking backwards, facing you; running if it's fast, turned away)
  if (spd > 0.25 && v < 16.9) {
    const run = smooth(1.6, 2.6, spd);
    stride = Math.min(1.6, spd / 1.8);
    walk = v * (7 + 4 * run) + p.ph;
    yaw = angTo(faceYou, faceYou + Math.PI, run);
    armL = lerp(armL, 0.2, run); armR = lerp(armR, 0.2, run);
  }
  // shoved (from 17 s): feet skid, leaning back against it, arms out; some go over and slide on their backs
  const pk = pushK(v);
  if (pk > 0 && p.kind !== 'plaza') {
    const fall = p.rnd2 < 0.33 ? smooth(17.3 + p.rnd * 1.5, 17.9 + p.rnd * 1.5, v) : 0;
    stride = lerp(stride, 0.0, pk);
    pitch = lerp(pitch, -0.32 - 0.1 * Math.sin(v * 2 + p.ph), pk);
    armL = lerp(armL, 1.2 + 0.4 * Math.sin(v * 5 + p.ph), pk); armR = lerp(armR, 1.2 + 0.4 * Math.sin(v * 5.3 + p.ph + 1), pk);
    yaw = faceYou;
    if (fall > 0) { pitch = lerp(pitch, -1.45, fall); y = 0.12 * fall; armL = lerp(armL, 1.6, fall); armR = lerp(armR, 1.6, fall); }
  }
  // diving out of a car's way
  if (p.dive) {
    const D = p.dive;
    const k = smooth(D.t, D.t + 0.35, v), up = smooth(D.up, D.up + 0.6, v);
    if (k > 0) {
      x += D.dx * k; z += D.dz * k;
      const lie = k * (1 - up);
      yaw = lerp(yaw, Math.atan2(D.dx, D.dz), lie);
      pitch = lerp(pitch, 1.45, lie); y += 0.15 * lie; armL = lerp(armL, 1.6, lie); armR = lerp(armR, 1.6, lie); stride *= 1 - lie;
    }
  }
  out.x = x; out.y = y; out.z = z; out.yaw = yaw; out.s = p.s; out.walk = walk; out.stride = stride; out.sit = 0;
  out.pitch = pitch; out.roll = roll; out.armL = armL; out.armR = armR; out.look = look; out.visible = true;
  return out;
}
// where person p's right hand (the one with the phone) is at time v (crowd.js geometry)
export function handOf(p, v, P = {}) {
  personAt(p, v, P);
  const s = p.s, a = P.armR * 1.45, sh = 1.4 * s;
  const lx = 0.215 * s, ly = sh - Math.cos(a) * 0.58 * s, lz = Math.sin(a) * 0.58 * s;
  const c = Math.cos(P.yaw), sn = Math.sin(P.yaw);
  return { x: P.x + lx * c + lz * sn, y: P.y + ly, z: P.z - lx * sn + lz * c, yaw: P.yaw };
}
