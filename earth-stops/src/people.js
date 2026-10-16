// The people at the crossing, and what the braking ground and the wind do to them (pure functions of video time).
// At the first frame the ground has been braking at 0.73 g for 2 s: everyone leans hard into it (west), steps
// stagger east, a few are already down and sliding. One by one they lose their footing (the ones clinging to a pole
// or a railing last a little longer), go over toward the east, and are swept down the street toward the camera,
// tumbling. Walkers' paths are planned up front so nobody walks through anybody.
import { rng, smooth, lerp } from './util.js';
import { AVE, CROSS, BRIDGE, CAM } from './layout.js';
import { SKIN, HAIR } from './crowd.js';
import { flight } from './fly.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef, 0xffffff, 0x111111];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];

// how far a walker has gone: they keep walking until their feet go, slowing as the push grows
// (pace 0.79 at the first frame, ~0.15 by 12 s), never stopping dead
const walkDist = (p, v) => {
  const go = Math.min(v, p.vFall) + 3;
  return p.speed * (go - 0.035 * go * go);
};

export const PEOPLE = [];
export let YOU = null;
{
  const R = rng(1337);
  const mk = (o) => {
    const p = {
      x: 0, z: 0, yaw: 0, speed: 0, s: 0.93 + R() * 0.13, ph: R() * 10, seed: R(), phone: R() < 0.22,
      col: [SHIRT[Math.floor(R() * SHIRT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]],
      // when the feet go (video time): most within the first seconds, a few already down at the first frame
      // (they crouch and grab whatever is near: a pole, a car, each other; one by one the grip goes)
      vFall: -0.6 + Math.pow(R(), 0.9) * 9.5,
      tau: 2.6 + R() * 1.4,
      ...o,
    };
    if (p.kid) { p.s = 0.6 + R() * 0.1; p.vFall = Math.min(p.vFall, 1.5 + R()); }
    PEOPLE.push(p);
    return p;
  };
  // "you": on the far crosswalk, walking north, right in the middle of the view
  YOU = mk({ x: -4.2, z: -9.7, yaw: Math.PI / 2, speed: 1.25, vFall: 3.4, tau: 2.3, phone: false, col: [0xf2c14e, 0x2c3e50, 0xe0ac86, 0x2e2018], you: true });
  // the two crosswalks: people crossing north and south
  const paths = [YOU];
  const posAt = (p, v) => {
    const d = walkDist(p, v);
    return [p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d];
  };
  const clash = (p) => {
    for (let v = -3; v <= Math.min(p.vFall, 8); v += 0.2) {
      const [x, z] = posAt(p, v);
      for (const q of paths) {
        const [qx, qz] = posAt(q, v);
        if (Math.hypot(x - qx, z - qz) < 0.85) return true;
      }
    }
    return false;
  };
  for (const zc of [-9.7, 9.7]) for (let k = 0; k < (zc < 0 ? 34 : 24) * 30 && PEOPLE.filter((p) => p.zone === zc).length < (zc < 0 ? 34 : 24); k++) {
    const north = R() < 0.5;
    const p = mk({ x: -15 + R() * 30, z: zc + (R() - 0.5) * 3.2, yaw: north ? Math.PI / 2 : -Math.PI / 2, speed: 1.1 + R() * 0.45, zone: zc, kid: R() < 0.06 });
    if (clash(p)) { PEOPLE.pop(); continue; }
    paths.push(p);
  }
  // the sidewalks and corners: people waiting, walking, filming the sunset at the end of the avenue
  const sidewalk = (n, z0, z1, far = false) => {
    for (let k = 0, made = 0; k < n * 30 && made < n; k++) {
      const side = R() < 0.5 ? -1 : 1;
      const x = side * (AVE.road + 0.8 + R() * (AVE.walk - AVE.road - 1.6));
      const z = z0 + R() * (z1 - z0);
      if (Math.abs(z - Math.round(z / CROSS.step) * CROSS.step) < CROSS.road + 0.5) continue;
      const walk = R() < 0.55;
      const p = mk({ x, z, yaw: walk ? (R() < 0.5 ? 0 : Math.PI) : Math.PI + (R() - 0.5) * 1.2, speed: walk ? 1.1 + R() * 0.4 : 0, far, kid: R() < 0.05 });
      if (!walk && R() < 0.4) p.phone = true;
      // clinging to a lamp post or a shop door: holds on a little longer
      if (R() < 0.18) { p.vFall = 4 + R() * 3.5; p.cling = true; }
      if (clash(p)) { PEOPLE.pop(); continue; }
      paths.push(p); made++;
    }
  };
  sidewalk(50, 18, -60);
  sidewalk(40, -60, -230, true);
  sidewalk(40, -230, -700, true);
  // corner crowds waiting to cross the cross street
  for (const [cx, cz] of [[-16, -13.5], [16, -13.5], [-16, 13.5], [16, 13.5]]) for (let k = 0; k < 6; k++) {
    const p = mk({ x: cx + (R() - 0.5) * 4, z: cz + (R() - 0.5) * 2.5 * Math.sign(cz), yaw: Math.sign(-cx) * Math.PI / 2 + (R() - 0.5) * 0.6, speed: 0 });
    if (clash(p)) { PEOPLE.pop(); continue; }
    paths.push(p);
  }
  // on the footbridge with you: a couple at the railing to your right
  for (const x of []) {
    const p = mk({ x, z: BRIDGE.z - 1.25, yaw: Math.PI, speed: 0, bridge: true, vFall: 2.5 + R() * 2.5, tau: 2.2, cling: true });
    p.y0 = BRIDGE.y;
  }
  for (const p of PEOPLE) {
    p.y0 = p.y0 ?? 0;
    p.ground = p.y0;
    p.fl = { x: 0, y: p.y0, z: 0, v: p.vFall + 0.45, tau: p.tau, r: 0.9, lift: p.kid ? 3 : 2.2, seed: p.seed, ground: 0.12, keep: true };
  }
}

const ease = (x) => x * x * (3 - 2 * x);
const fl = {};
// where person p is and how they hold themselves at video time v (fields for crowd.pose)
export function personPose(p, v, camZ) {
  const d = walkDist(p, v);                             // walkers keep going, slower and slower
  let x = p.x + Math.sin(p.yaw) * d, z = p.z + Math.cos(p.yaw) * d;
  // the braking ground shoves everyone east: staggering steps
  const shove = 0.12 * Math.max(0, Math.min(v, p.vFall) + 2) * (p.cling ? 0.3 : 1);
  z += shove;
  const o = { x, y: p.y0, z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.05 };
  const up = 1 - smooth(p.vFall - 0.1, p.vFall + 0.4, v);
  if (p.speed > 0) { o.walk = p.ph + d / 0.75 * Math.PI; o.stride = up * (0.9 - 0.35 * smooth(0, 8, v)); }   // shorter, staggering steps
  // crouching low against the push (walkers only bend their knees a little)
  o.sit = (p.speed > 0 ? 0.1 : 0.3) * smooth(0.2, 1.4, v + (p.seed - 0.5)) * up;
  // leaning into the push (toward the west, -z), knees bent, arms out for balance
  const L = (0.22 + 0.12 * Math.sin(v * 3.1 + p.ph)) * up * (p.cling ? 0.6 : 1);
  o.pitch = L * -Math.cos(p.yaw);
  o.roll = -L * Math.sin(p.yaw);
  o.armL = 0.5 + 0.3 * Math.sin(v * 5 + p.ph); o.armR = 0.5 + 0.3 * Math.sin(v * 4.3 + p.ph * 2);
  if (p.phone) { o.armR = 1.0; o.look = 0.12; }
  if (p.cling) { o.armL = 1.1; o.armR = 1.2; }
  // feet go: over toward the east, then swept away tumbling
  const k = smooth(p.vFall - 0.05, p.vFall + 0.45, v);
  if (k > 0) {
    p.fl.x = x; p.fl.z = z; p.fl.y = p.y0;
    const f = flight(p.fl, v, fl);
    if (f.dt > 0 && (f.z > camZ + 30 || f.dz > 1500)) return { visible: false, x: 0, y: 0, z: 0 };
    const e = ease(k);
    // turn to face downwind (+z) as they go over, so the fall and the tumble are about one axis
    const yawT = Math.cos(p.yaw) > 0 ? 0 : Math.PI;
    o.yaw = lerp(p.yaw, p.yaw + ((yawT - p.yaw + 3 * Math.PI) % (2 * Math.PI) - Math.PI), e);
    const sgn = yawT === 0 ? 1 : -1;
    o.pitch = lerp(o.pitch, sgn * (Math.PI / 2) * 0.9, e) + sgn * (f.dt > 0 ? f.ang : 0);
    o.roll = lerp(o.roll, 0, e) + (f.dt > 0 ? Math.sin(f.dt * 3 + p.seed * 9) * 0.6 : 0);
    o.x = f.x; o.z = f.z; o.y = f.dt > 0 ? f.y : p.y0 + 0.1 * e;
    o.armL = lerp(o.armL, 1.5, e); o.armR = lerp(o.armR, 1.4, e);
    o.stride = 0; o.look = 0;
    if (p.y0 > 0 && f.dt > 0) o.y = Math.max(f.y, p.y0 * Math.max(0, 1 - f.dt * 1.2));   // off the footbridge
  }
  return o;
}
// where "you" are (head height) for the label
export function youHead(v, camZ) {
  const o = personPose(YOU, v, camZ);
  return { x: o.x, y: o.y + 2.0 * YOU.s * Math.cos(o.pitch || 0) + 0.2, z: o.z, visible: o.visible !== false };
}
