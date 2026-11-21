// The crowd at the court and what each world's gravity does to them. Everyone keeps their own spot (each stop starts
// fresh); a person's pose is a pure function of (the stop, the seconds since its wipe). Positions are planned up front:
// players round the far hoop, a packed crowd along the baseline and round the fountain (some sitting on its rim),
// people on both sidewalks; nobody between you and the lens, nobody closer than ~3.6 m to it, nobody on the street.
//   Moon: everyone bouncing, ~4 s in the air per jump (frame 0 has them all mid-air); a player dunks from way above
//     the rim; then the whole court jumps at once, a few flipping slowly.
//   Pluto: they hop and keep going up, arms and legs flailing, drifting higher and higher.
//   Jupiter: their legs give way: deep crouches, hands on knees, some on all fours, a few flat; they try to get up.
//   The Sun: slammed flat on the ground in an instant, and they stay there.
//   White dwarf / neutron star: flat (and pressed into the ground: heat.js uSq).
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { YOU, HOOP, COURT, FOUNTAIN, TREES, LAMPS, BENCHES, Z, FACE_YAW, APRON } from './layout.js';
import { GRAV, MOON_DUNK, MOON_ALL, JUP_BUCKLE, SUN_FLAT, WD_CRUSH } from './sched.js';

const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085, 0xf2f2f2, 0xe8e2d0, 0xc0392b, 0x2e86c1, 0xff8c1a, 0x1abc9c];
const PANTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d, 0xe8e2d0, 0xc0392b, 0x2e86c1];
const JERSEY = [[0xf2f2f2, 0xf2f2f2], [0x1a2a6c, 0x1a2a6c]];
export const PEOPLE = [];
const gM = GRAV.moon, gP = GRAV.pluto;
{
  const R = rng(2026);
  const add = (x, z, o = {}) => {
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    const p = { x, z, yaw: FACE_YAW + (R() - 0.5) * 0.7, s: 0.92 + R() * 0.14, seed: R(), ph: R() * 6.28, g1: R(), g2: R(), g3: R(), g4: R(), kind: 'fan',
      col: [TOPS[Math.floor(R() * TOPS.length)], PANTS[Math.floor(R() * PANTS.length)], skin, HAIR[Math.floor(R() * HAIR.length)], R() < 0.45], ...o };
    p.dYou = Math.hypot(x - YOU.x, z - YOU.z);
    p.d = 0.05 + R() * 0.3;
    PEOPLE.push(p);
    return p;
  };
  const OBS = [...TREES.map(([x, z]) => [x, z, 0.6]), ...LAMPS.map(([x, z]) => [x, z, 0.45]), ...BENCHES.map(([x, z]) => [x, z, 1.1]), [HOOP.x, COURT.z0 - 1.0, 0.7]];
  const ok = (x, z, gap) => {
    const f = -z;
    if (f < 3.6) return false;                                             // (the lens, and behind it)
    if (Math.hypot(x - YOU.x, z - YOU.z) < 1.5) return false;               // (your own room)
    if (f < 10.5 && Math.abs(x - YOU.x) < 0.85 + 0.03 * f) return false;    // (straight ahead of you)
    if (f < 6.5 && Math.abs(x) < 1.2) return false;                        // (right in front of the lens)
    if (z < Z.walk1 + 0.3 && z > Z.street1 - 0.3) return false;            // (the street and its parked cars)
    if (z < Z.walk2 + 0.6) return false;                                    // (the buildings)
    if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 0.45) return false;
    if (OBS.some(([ox, oz, r]) => Math.hypot(ox - x, oz - z) < r + 0.35)) return false;
    if (PEOPLE.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) return false;
    return true;
  };
  // the players: a game round the far hoop (one of them is the dunker)
  const dunker = add(HOOP.x + 0.15, HOOP.z + 3.0, { kind: 'dunker', yaw: Math.PI, col: [...JERSEY[0], SKIN[4], HAIR[0], false] });
  dunker.g4 = 1;
  for (const [x, z, team] of [[-3.3, -10.4, 1], [2.9, -9.6, 0], [-2.2, -7.0, 1], [4.2, -12.3, 1], [-4.9, -12.6, 0], [2.5, -6.4, 0], [-0.9, -9.0, 1], [5.4, -8.0, 0]]) {
    const p = add(x, z, { kind: 'player', col: [...JERSEY[team], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)], false] });
    p.yaw = Math.atan2(HOOP.x - x, HOOP.z - z) + (R() - 0.5) * 0.8;
  }
  // a few big and close at the edges of the frame (people near you on frame 0)
  for (const [x, z] of [[-1.85, -4.6], [-2.4, -6.1], [2.2, -5.4], [2.75, -7.0], [-2.9, -8.0]]) {
    const p = add(x, z, { near: true });
    p.yaw = FACE_YAW + (x < 0 ? -0.2 : 0.2);
  }
  // sitting round the fountain's rim, facing out
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * 6.28 + R() * 0.15;
    const x = FOUNTAIN.x + Math.sin(a) * (FOUNTAIN.r + 0.25), z = FOUNTAIN.z + Math.cos(a) * (FOUNTAIN.r + 0.25);
    if (R() < 0.25) continue;
    const p = add(x, z, { kind: 'rim' });
    p.yaw = a;
  }
  const place = (x, z, gap, o) => {
    if (!ok(x, z, gap)) return null;
    const p = add(x, z, o);
    if (R() < 0.1) { p.s = 0.6 + R() * 0.12; p.kid = true; }
    return p;
  };
  // packed along the baseline and through the plaza
  for (let k = 0; k < 9000 && PEOPLE.length < 380; k++) place(-12 + R() * 24, COURT.z0 + 0.3 - R() * (COURT.z0 - Z.plaza1 + 0.3), 0.95);
  // along both sidelines (seen from up high on Pluto)
  for (let k = 0; k < 6000 && PEOPLE.length < 520; k++) {
    const side = R() < 0.5 ? -1 : 1;
    const x = side < 0 ? COURT.x0 - 0.3 - R() * (APRON + 3) : COURT.x1 + 0.3 + R() * (APRON + 3);
    place(x, COURT.z0 + R() * 18, 1.0);
  }
  // on the court's near half, round you (at the edges of the frame)
  for (let k = 0; k < 3000 && PEOPLE.length < 560; k++) place(-4 + R() * 9, -3.8 - R() * 5, 1.4);
  // the sidewalks
  for (let k = 0; k < 6000 && PEOPLE.length < 640; k++) place(-22 + R() * 44, Z.plaza1 - R() * (Z.plaza1 - Z.walk1 - 0.3), 1.05, { kind: 'walker' });
  for (let k = 0; k < 6000 && PEOPLE.length < 720; k++) place(-30 + R() * 60, Z.street1 - 0.4 - R() * 2.2, 1.2, { kind: 'walker' });
  for (const p of PEOPLE) {
    if (p.kind === 'walker') { p.yaw = R() < 0.5 ? Math.PI / 2 : -Math.PI / 2; p.walkV = 1.1 + 0.4 * R(); p.walkK = R() < 0.65; }
    if (p.kind === 'fan' && !p.near) p.yaw = Math.atan2(HOOP.x - p.x, HOOP.z + 4 - p.z) + (p.seed - 0.5) * 0.8;
  }
}

// ---- helpers ----
const out = {};
function base(p) {
  out.x = p.x; out.y = 0; out.z = p.z; out.yaw = p.yaw; out.s = p.s; out.walk = 0; out.stride = 0; out.sit = 0; out.pitch = 0; out.roll = 0;
  out.armL = 0; out.armR = 0; out.look = 0.05; out.visible = true;
  if (p.kind === 'rim') { out.sit = 1; out.y = 0.06; }
  return out;
}
// a ballistic hop: height of the hips' rise at time t after take-off (v up, gravity g), 0 on the ground
const hop = (t, v, g) => (t <= 0 ? 0 : Math.max(0, v * t - 0.5 * g * t * t));
// rotate the body by pitch a about the hips (not the feet), so a flip turns in place
function aboutHips(o, a, hipH) {
  const sx = Math.sin(o.yaw), cz = Math.cos(o.yaw);
  const zz = -hipH * Math.sin(a);
  o.x += sx * zz; o.z += cz * zz;
  o.y += hipH - hipH * Math.cos(a);
  o.pitch += a;
}
// legs and arms while in the air: tucked a little, flailing (k: how wild)
function airborne(o, p, t, k) {
  o.sit = 0.15 + 0.15 * Math.sin(t * 2.3 + p.ph) * k;
  o.walk = t * (3 + 2 * p.g3) + p.ph; o.stride = 0.55 * k;
  o.armL = 1.35 + 0.3 * Math.sin(t * 3.1 + p.ph); o.armR = 1.3 + 0.3 * Math.sin(t * 2.7 + p.ph * 2);
}
// the walkers on the sidewalks (their whole stop: walking along, bounding on the Moon)
function walker(o, p, tt, key) {
  if (!p.walkK) return;
  const dir = Math.sin(p.yaw);
  if (key === 'moon') {
    const per = 1.6, t = (tt + p.ph) % per;
    o.x += dir * p.walkV * 1.4 * tt;
    o.y += hop(t, 0.5 * gM * per, gM);
    o.walk = p.ph; o.stride = 0.4; o.armL = 0.5; o.armR = 0.5;
  } else if (key === 'pluto' || key === 'jupiter' || key === 'earth') {
    const v = key === 'jupiter' ? p.walkV * (1 - smooth(0, 0.3, tt)) : p.walkV;
    o.x += dir * (key === 'jupiter' ? p.walkV * Math.min(tt, 0.3) : v * tt);
    o.walk = (key === 'jupiter' ? Math.min(tt, 0.3) : tt) * p.walkV / 0.7 * Math.PI + p.ph; o.stride = key === 'jupiter' ? 1 - smooth(0, 0.3, tt) : 1;
  } else o.x += dir * p.walkV * 0.04;
}

export function personPose(p, key, tt) {
  const o = base(p);
  const hipH = 0.92 * p.s;
  if (key === 'moon') {
    o.look = 0.3 + 0.2 * p.g3;
    if (p.kind === 'walker') { walker(o, p, tt, key); return o; }
    if (p.kind === 'rim') { o.armL = 1.2 + 0.4 * Math.sin(tt * 2 + p.ph); o.armR = 1.1 + 0.4 * Math.sin(tt * 2.4 + p.ph); o.look = 0.5; return o; }
    if (p.kind === 'dunker') {
      // from the top of the key, a jump that carries him way over the rim; he slams it down and hangs on the rim
      const t = tt + 0.6, v = 4.0;
      const yf = hop(t, v, gM);
      const hang = tt > MOON_DUNK + 0.35 ? smooth(MOON_DUNK + 0.35, MOON_DUNK + 0.7, tt) : 0;
      const tHang = 3.7;                                        // he drops off the rim
      o.z = lerp(HOOP.z + 3.0, HOOP.z + 0.55, smooth(0, 3.0, t));
      o.yaw = Math.PI;
      if (tt < tHang) {
        o.y = Math.max(yf, hang * (HOOP.y - 2.15));
        o.armL = 1.6; o.armR = 1.6; o.sit = 0.25; o.look = 0.4;
        if (tt < MOON_DUNK) { o.armL = 1.5 + 0.1 * Math.sin(tt * 2); o.armR = 1.55; }
        o.walk = 0.6; o.stride = 0.5;
      } else {
        o.y = hop(tt - tHang, 0, gM) || Math.max(0, (HOOP.y - 2.15) - 0.5 * gM * (tt - tHang) ** 2);
        o.armL = 1.6 * (1 - smooth(tHang, tHang + 0.8, tt)); o.armR = o.armL; o.sit = 0.2;
      }
      // the whole court's jump: he goes too
      const tm = tt - MOON_ALL - 0.05;
      if (tm > 0) { const y2 = hop(tm, 2.9, gM); if (y2 > 0) { o.y = y2; airborne(o, p, tm, 1); } }
      return o;
    }
    // first: everyone bouncing (each their own jump, all of them in the air on frame 0, 1.6 s in); then the court's
    // jump all together
    const s1 = -0.75 + 1.4 * p.g1, v1 = 2.75 + 0.4 * p.g2, land1 = s1 + 2 * v1 / gM;
    const jumper = p.g4 > 0.22 || p.near;
    if (jumper) {
      const t1 = tt - s1, y1 = hop(t1, v1, gM);
      if (y1 > 0) { o.y = y1; airborne(o, p, t1, 0.7); }
      else if (t1 > -0.18 && t1 < 0) o.sit = 0.35 * smooth(-0.18, -0.05, t1);                     // (crouching to go)
      else if (t1 > 0 && t1 < 2 * v1 / gM + 0.25) o.sit = 0.3 * (1 - smooth(2 * v1 / gM, 2 * v1 / gM + 0.25, t1));   // (landing)
    } else {
      // watching: filming it, or arms up cheering
      if (p.g1 < 0.5) { o.armR = 1.05; o.look = 0.4; } else { o.armL = 1.55; o.armR = 1.5; }
    }
    // the court's jump: everyone at once (a ripple out from the hoop), a few flipping slowly over
    const s2 = Math.max(MOON_ALL + 0.06 + 0.012 * Math.hypot(p.x - HOOP.x, p.z - HOOP.z), jumper ? land1 + 0.22 : 0), v2 = 2.95 + 0.2 * p.g3;
    const t2 = tt - s2, y2 = hop(t2, v2, gM);
    if (t2 > -0.2 && t2 < 0) { o.sit = Math.max(o.sit, 0.4 * smooth(-0.2, -0.05, t2)); o.armL = Math.max(o.armL, 0.3); o.armR = Math.max(o.armR, 0.3); }
    if (y2 > 0) {
      o.y = y2; airborne(o, p, t2, 1); o.look = 0.5;
      if (p.g3 < 0.11 && !p.near && !p.kid) { const F = 2 * v2 / gM; aboutHips(o, -6.2832 * smooth(0.1 * F, 0.85 * F, t2), hipH); o.sit = 0.35; }
    } else if (t2 > 0) o.sit = Math.max(o.sit, 0.3 * (1 - smooth(2 * v2 / gM, 2 * v2 / gM + 0.3, t2)));
    return o;
  }
  if (key === 'pluto') {
    o.look = 0.4;
    if (p.kind === 'walker') {
      // a step on Pluto launches you: they drift up off the sidewalk, legs still walking
      const t = tt - 0.3 - 1.5 * p.g1;
      walker(o, p, Math.min(tt, 0.3 + 1.5 * p.g1), 'pluto');
      if (t > 0 && p.walkK) { o.y = hop(t, 0.9 + 0.6 * p.g2, gP); o.armL = 1.0 + 0.5 * Math.sin(t * 3 + p.ph); o.armR = 1.0 + 0.5 * Math.sin(t * 2.6 + p.ph); o.walk = t * 2 + p.ph; o.stride = 0.5; o.x += Math.sin(p.yaw) * p.walkV * t; }
      return o;
    }
    if (p.kind === 'rim') { o.look = 0.8; o.armL = 1.3; o.armR = 0.9 + 0.5 * Math.sin(tt * 3 + p.ph); return o; }
    // they hop to see what happens: and keep going up, very slowly coming back
    const goes = p.g4 > 0.2 || p.near || p.kind === 'player' || p.kind === 'dunker';
    if (!goes) { o.armL = 1.5; o.armR = 1.45; o.look = 0.8; return o; }
    const s = 0.25 + 1.5 * p.g1 + (p.near ? 0.3 : 0), v = 1.3 + 1.6 * p.g2;
    const t = tt - s, y = hop(t, v, gP);
    if (t > -0.18 && t < 0) o.sit = 0.35 * smooth(-0.18, -0.05, t);
    if (y > 0) {
      o.y = y; airborne(o, p, t, 1.2);
      o.armL = 1.0 + 0.7 * Math.sin(t * 4.2 + p.ph); o.armR = 1.0 + 0.7 * Math.sin(t * 3.7 + p.ph * 1.7);
      o.pitch += 0.25 * Math.sin(t * 0.9 + p.ph) * (p.g3 - 0.3); o.roll += 0.2 * Math.sin(t * 0.7 + p.ph * 2);
      o.look = -0.3 + 0.5 * p.g3;
    }
    return o;
  }
  if (key === 'jupiter') {
    // at the wipe: the ones caught mid-jump slam down onto the court; everyone else staggers (a lurch, arms out) and
    // drops to their knees; ~3 s in, as the trees break, many sink further onto all fours; some try to stand and fail
    if (p.kind === 'walker') walker(o, p, tt, 'jupiter');
    o.look = -0.15;
    const g = GRAV.jupiter;
    if (p.kind === 'rim') { const k = smooth(0.06, 0.3, tt); o.pitch = 0.55 * k; o.armL = 0.6 * k; o.armR = 0.6 * k; return o; }
    if (p.g4 > 0.72 && p.kind !== 'walker') {
      // caught mid-jump: up 0.45 m and still rising, then down hard and flat
      const v0 = 0.9 + 0.6 * p.g3, y = 0.45 + v0 * tt - 0.5 * g * tt * tt;
      const tl = (v0 + Math.sqrt(v0 * v0 + 2 * g * 0.45)) / g;
      if (tt < tl) { o.y = y; o.armL = 1.4; o.armR = 1.3; o.sit = 0.15; o.look = 0.3; return o; }
      const k = smooth(tl, tl + 0.12, tt);
      o.pitch = (p.g2 < 0.5 ? 1.45 : -1.45) * k; o.y = 0.1 * k; o.armL = 1.6 * k; o.armR = 1.5 * k; o.sit = 0.3 * (1 - k);
      o.roll = 0.1 * Math.exp(-(tt - tl) / 0.1) * Math.sin((tt - tl) * 40);
      return o;
    }
    const t0 = JUP_BUCKLE + 0.2 * p.d;
    // the stagger: a lurch to one side with a half step, arms thrown out
    const st = smooth(t0, t0 + 0.12, tt) * (1 - smooth(t0 + 0.3, t0 + 0.45, tt));
    const side = p.g1 < 0.5 ? -1 : 1;
    o.roll = 0.28 * side * st; o.pitch = 0.22 * st; o.armL = 1.0 * st; o.armR = 1.0 * st;
    o.x += Math.cos(p.yaw) * 0.18 * side * smooth(t0, t0 + 0.3, tt); o.z -= Math.sin(p.yaw) * 0.18 * side * smooth(t0, t0 + 0.3, tt);
    o.walk = 1.2 * side; o.stride = 0.6 * st;
    const k = smooth(t0 + 0.28, t0 + 0.48, tt) + 0.08 * Math.exp(-Math.max(0, tt - t0 - 0.48) / 0.12) * smooth(t0 + 0.4, t0 + 0.48, tt);
    if (p.g3 < 0.1) {               // flat
      const kf = smooth(t0 + 0.28, t0 + 0.5, tt);
      o.pitch = lerp(o.pitch, 1.45, kf); o.roll *= 1 - kf; o.y = 0.1 * kf; o.armL = lerp(o.armL, 1.6, kf); o.armR = lerp(o.armR, 1.6, kf);
      return o;
    }
    // ~3 s in, as the limbs come down: many of the kneelers sink onto all fours
    const fours = p.g2 < 0.32 ? 1 : p.g2 < 0.7 ? smooth(2.9 + 0.9 * p.g1, 3.15 + 0.9 * p.g1, tt) : 0;
    const kneelY = -(0.36 + 0.08 * p.g2) * p.s, kneelP = 0.35 + 0.25 * p.g3;
    o.y = lerp(0, lerp(kneelY, -0.4 * p.s, fours), k);
    o.pitch = lerp(o.pitch, lerp(kneelP, 1.0, fours), k); o.roll *= 1 - k;
    o.armL = lerp(o.armL, lerp(0.35, 0.68, fours), k); o.armR = lerp(o.armR, lerp(0.35, 0.68, fours), k);
    o.look = lerp(o.look, lerp(-0.3, 0.3, fours), k);
    if (fours < 0.5) {
      // trying to stand, failing
      const tr = 4.4 + 1.6 * p.g1;
      const up = smooth(tr, tr + 0.6, tt) * (1 - smooth(tr + 0.9, tr + 1.15, tt));
      o.y += 0.25 * p.s * up; o.pitch -= 0.15 * up; o.roll = 0.05 * up * Math.sin(tt * 19 + p.ph);
    }
    return o;
  }
  if (key === 'sun' || key === 'wd' || key === 'ns') {
    // slammed flat in an instant: face down (most) or on their backs, arms flung out
    const t0 = key === 'sun' ? SUN_FLAT + 0.08 * p.d : WD_CRUSH - 0.02;
    const k = smooth(t0, t0 + (key === 'sun' ? 0.09 : 0.07), tt);
    const back = p.g2 < 0.25;
    if (p.kind === 'rim') { o.sit = 1 - k; o.y = 0.06 + 0.45 * k; }
    o.pitch = (back ? -1.5 : 1.5) * k; o.y += 0.1 * k; o.armL = 1.6 * k; o.armR = (1.2 + 0.4 * p.g1) * k; o.look = 0;
    o.roll = (p.g4 - 0.5) * 0.2 * k;
    if (p.kind === 'walker') o.x += Math.sin(p.yaw) * p.walkV * 0.04;
    return o;
  }
  return o;
}
