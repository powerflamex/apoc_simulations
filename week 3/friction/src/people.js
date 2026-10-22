// The people, and what losing friction does to them (pure functions of video time).
// Standing and walking need grip. Friction went 0.8 s before the first frame: everyone's feet are already sliding
// out from under them, and over the next second they all go down (walkers mostly flat on their backs, a few
// forward). Nobody can get up again: you can't push against the ground, or grip anything to pull yourself up.
// On the hill they then slide, feet or head first, slowly turning, faster and faster, down the sidewalks, across
// the waterfront and over the seawall into the bay. On the flat top of the hill (where you are) they stay where
// they fell (those who were walking glide on at their walking speed) until the hillside itself goes and carries
// them down. The riders on the cable car's running boards can't hold the poles: they slip off onto the street.
// Every sliding path is checked up front against every other, so nobody slides through anybody.
import { rng, smooth, lerp, clamp } from './util.js';
import { ST, YOU_AT, CABLE, Z_PLATEAU, cableAt, inCross } from './layout.js';
import { SKIN, HAIR } from './crowd.js';
import { tOf, slide, ride, bulldoze, hill, surfaceY, slabD, SLAB, VT, GRADE, Z_FOOT, Z_EDGE, V_YOU, V_SLIDE, WATER_Y } from './timeline.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef, 0xffffff, 0x111111];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];

export const PEOPLE = [];
export let YOU = null;
const sl = {}, rd = {}, cc = {};
{
  const R = rng(1337);
  const mk = (o) => {
    const p = {
      x: 0, z: 0, yaw: 0, speed: 0, s: 0.93 + R() * 0.13, ph: R() * 10, seed: R(), phone: R() < 0.2,
      col: [SHIRT[Math.floor(R() * SHIRT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]],
      vFall: -0.75 + Math.pow(R(), 1.3) * 1.5,          // when the feet go (video time): all within the first second
      back: R() < 0.7,                                   // on their back (feet shot forward) or face down
      spin: (R() - 0.5) * 0.7,                           // how fast they turn as they slide (rad/s)
      ...o,
    };
    if (p.kid) p.s = 0.6 + R() * 0.1;
    PEOPLE.push(p);
    return p;
  };
  // where a person lies / slides at story time t (no pose): for the clash checks
  const track = (p, t) => {
    if (p.flat) return p.z + (p.uz || 0) * Math.max(0, t - tOf(p.vFall));
    slide({ z0: p.z, ts: tOf(p.vFall + 0.25), vt: VT.person, u0: p.uz || 0 }, t, sl);
    return sl.phase >= 2 ? 1e5 + sl.z : sl.z;
  };
  const placed = [];
  const clash = (p) => {
    for (const q of placed) {
      if (Math.abs(q.x - p.x) > 0.75) continue;
      for (let t = 0; t < 32; t += 0.5) if (Math.abs(track(p, t) - track(q, t)) < 1.1) return true;
    }
    return false;
  };
  const tryAdd = (o) => { const p = mk(o); if (clash(p)) { PEOPLE.pop(); return null; } placed.push(p); return p; };

  // you: waiting to cross at the top, on the flat crosswalk
  YOU = mk({ x: YOU_AT.x, z: YOU_AT.z, yaw: Math.PI * 0.94, speed: 0, vFall: -0.45 + V_YOU, back: true, spin: 0, flat: true, you: true, col: [0xf2c14e, 0x2c3e50, 0xe0ac86, 0x2e2018], phone: false });
  placed.push(YOU);
  // the top intersection: people crossing and waiting on the corners (flat: they stay put, or glide on slowly)
  for (let k = 0, made = 0; k < 400 && made < 16; k++) {
    const corner = R() < 0.55;
    const x = corner ? (R() < 0.5 ? -1 : 1) * (ST.road + 0.8 + R() * 2.6) : (R() - 0.5) * 2 * (ST.road - 0.5);
    const z = -523 + (R() - 0.5) * 11;
    if (Math.hypot(x - YOU_AT.x, z - YOU_AT.z) < 1.4 || Math.abs(z - -531) < 2 && Math.abs(x - 1.4) < 3) continue;
    const walk = !corner && R() < 0.8;
    const dir = R() < 0.5 ? 1 : -1;
    if (tryAdd({ x, z, yaw: walk ? dir * Math.PI / 2 : R() * 6.28, speed: walk ? 1.25 : 0, ux: walk ? dir * 0.9 : 0, flat: true, kid: R() < 0.07 })) made++;
  }
  // the sidewalks down the hill, both sides, thicker near the top (nearer the camera)
  for (const side of [-1, 1]) for (let k = 0, made = 0; k < 2000 && made < 46; k++) {
    const z = -505 + Math.pow(R(), 1.6) * 470;
    if (inCross(z, 1)) continue;
    const x = side * (ST.road + 0.5 + R() * (ST.walk - ST.road - 1.0));
    const walk = R() < 0.75;
    const down = R() < 0.5;
    if (tryAdd({ x, z, yaw: walk ? (down ? 0 : Math.PI) : R() * 6.28, speed: walk ? 1.15 + R() * 0.3 : 0, uz: walk ? (down ? 1 : -1) * 1.2 : 0, kid: R() < 0.05 })) made++;
  }
  // the waterfront at the bottom (small, far off): tourists by the railing and the turntable
  for (let k = 0, made = 0; k < 400 && made < 22; k++) {
    const x = (R() - 0.5) * 50, z = 4 + R() * 30;
    if (tryAdd({ x, z, yaw: R() * 6.28, speed: 0, flat: true, bottom: true })) made++;
  }
  // the cable car: riders standing on the running boards (they slip off) and sitting inside (they stay in)
  for (let k = 0; k < 7; k++) {
    const side = k % 2 ? 1 : -1;
    mk({ cable: true, board: true, cx: side * 1.38, cz: -3.2 + (k >> 1) * 2.0 + R() * 0.4, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, vFall: -0.6 + R() * 1.5, back: R() < 0.5 });
  }
  for (let k = 0; k < 8; k++) mk({ cable: true, seated: true, cx: (k % 2 ? 1 : -1) * 0.55, cz: -3 + (k >> 1) * 1.7, yaw: k % 2 ? -Math.PI / 2 : Math.PI / 2, vFall: 1e9 });
  for (const p of PEOPLE) p.uz = p.uz ?? 0;
}

const ease = (x) => x * x * (3 - 2 * x);
// where person p is and how they hold themselves at video time v (fields for crowd.pose)
export function personPose(p, v) {
  const t = tOf(v);
  const o = { x: p.x, y: 0, z: p.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.05 };
  const k = smooth(p.vFall - 0.05, p.vFall + 0.5, v);       // going down
  // ---- the cable car's riders ----
  if (p.cable) {
    const tc = Math.min(v, p.vFall);
    cableAt(tc, cc);
    const bx = CABLE.x + p.cx, bz = cc.z + p.cz;
    if (p.seated || v < p.vFall) {
      cableAt(v, cc);
      if (cc.phase === 3 && cc.dt > 5) return { visible: false };
      o.x = CABLE.x + p.cx; o.z = cc.z + p.cz; o.y = cc.y + (p.seated ? 0.95 : 0.35);
      if (p.seated) { o.sit = 1; o.armL = 0.3; o.armR = 0.2; }
      else { o.armL = 1.25; o.armR = 0.4; o.pitch = -0.08; }
      o.look = 0.1;
      if (cc.phase >= 2) { o.pitch = 0.3 * Math.min(1, cc.dt); }
      return o;
    }
    // slipped off: drops onto the street beside the car and slides away like everyone else
    const u0 = cc.u;
    slide({ z0: bz, ts: tOf(p.vFall + 0.35), vt: VT.person, u0 }, t, sl);
    if (sl.phase === 3 && sl.dt > 3.5) return { visible: false };
    o.x = bx + Math.sign(p.cx) * 0.9 * k; o.z = sl.z; o.y = sl.y + 0.12 * k;
    const sgn = p.back ? -1 : 1;
    o.pitch = sgn * (Math.PI / 2) * ease(k); o.roll = 0.4 * (1 - k);
    o.yaw = p.yaw + p.spin * Math.max(0, t - tOf(p.vFall));
    o.armL = 1.4; o.armR = 1.2;
    if (sl.phase >= 2) o.y = sl.y;
    return o;
  }
  // ---- standing / walking before the feet go ----
  const before = Math.min(v, p.vFall);
  const d = p.speed * (before + 3);
  let x = p.x + (p.ux ? Math.sign(p.ux) * d : 0), z = p.z + (p.ux ? 0 : (p.uz > 0 ? d : p.uz < 0 ? -d : 0));
  if (p.speed > 0 && !p.ux) z = p.z + Math.sign(p.uz) * p.speed * (before - p.vFall);   // (z is where they are when they fall)
  if (p.ux) x = p.x + Math.sign(p.ux) * p.speed * (before - p.vFall);
  o.x = x; o.z = z;
  if (p.speed > 0) { o.walk = p.ph + d / 0.75 * Math.PI; o.stride = 1 - k; }
  if (p.phone) { o.armR = 1.0; o.look = 0.12; }
  // the feet go: arms fly out, the body goes over (flat on the back, or face down)
  if (k > 0) {
    const e = ease(k);
    const sgn = p.back ? -1 : 1;
    o.pitch = sgn * (Math.PI / 2) * e * 0.97;
    o.roll = Math.sin(p.seed * 20) * 0.25 * Math.sin(Math.PI * k);
    o.armL = lerp(o.armL, 1.5, e); o.armR = lerp(o.armR, 1.35, e);
    o.stride = 0; o.look = 0;
    // a stride's worth of slip as they go down (their feet shoot out in front of them)
    o.y = 0.05 + 0.08 * e;
  }
  const tf = tOf(p.vFall + 0.25);
  if (p.flat) {
    // on the flat they lie where they fell, gliding on at their walking speed
    const dt = Math.max(0, t - tf);
    o.x += (p.ux || 0) * dt; o.z += (p.uz || 0) * dt;
    o.yaw = p.yaw + p.spin * dt;
    o.y += hill(o.z);
    // trying to get up: arms and legs push and scrabble, and get nowhere
    if (k >= 1) {
      const tryK = p.you ? smooth(25.5, 26.5, v) * (1 - smooth(31, 33, v)) + 0.4 * (1 - smooth(4, 7, v)) : 0.5 * (1 - smooth(3, 6, v));
      o.armL = 1.5 + 0.5 * Math.sin(v * 7 + p.ph) * tryK; o.armR = 1.3 + 0.5 * Math.sin(v * 6.1 + p.ph * 2) * tryK;
      o.walk = v * 9 + p.ph; o.stride = 0.5 * tryK;
      o.roll += 0.15 * Math.sin(v * 3.3 + p.ph) * tryK;
    }
    // the hillside goes: they ride down with it (the top is on the slab), or get shoved ahead of its nose
    if (v > V_SLIDE) {
      if (o.z < SLAB.toe) {
        ride(o.z, v, rd);
        if (rd.phase === 3 && rd.dt > 2.5) return { visible: false };
        o.y += rd.y - hill(o.z); o.z = rd.z;
        o.yaw += 0.3 * Math.sin((v - V_SLIDE) * 0.4 + p.seed * 9);
      } else {
        const sh = bulldoze(o.z, v);
        if (sh > 0) {
          const z = o.z + sh;
          if (z > Z_EDGE + 12) return { visible: false };
          o.z = z; o.y = z < Z_EDGE ? surfaceY(z, slabD(v)) + 0.3 : WATER_Y; o.pitch += sh * 0.3;
        }
      }
    }
    return o;
  }
  // on the hill: sliding away down it
  slide({ z0: z, ts: tf, vt: VT.person, u0: p.uz }, t, sl);
  if (sl.phase === 3 && sl.dt > 3.5) return { visible: false };
  const dt = Math.max(0, t - tf);
  o.z = sl.z; o.y = sl.y + 0.12 * Math.min(1, k * 1.5);
  if (sl.phase === 0) o.y = hill(sl.z) + 0.12;
  o.yaw = p.yaw + p.spin * dt;
  // lying along the slope: tilt with it
  o.pitch += (p.back ? -1 : 1) * Math.atan(GRADE) * Math.cos(o.yaw) * (sl.phase === 0 ? 1 : 0) * k;
  if (sl.phase >= 2) { o.y = sl.y; o.pitch += sl.dt * 2; }
  if (k >= 1) { o.armL = 1.5 + 0.3 * Math.sin(v * 5 + p.ph); o.armR = 1.3 + 0.3 * Math.sin(v * 4.4 + p.ph); }
  return o;
}
// where "you" are (head height) for the label
export function youHead(v) {
  const o = personPose(YOU, v);
  return { x: o.x, y: o.y + 1.1, z: o.z, visible: o.visible !== false };
}
