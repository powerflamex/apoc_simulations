// The people on the plaza at sunset, and what gravity does to them (pure functions of video time).
// Walkers slow down as they get heavier (everyone's pace follows the same curve, PACE), stagger, sit down hard on
// the paving, then fold to the ground; people filming the sunset lower their phones; the ones sitting on the
// fountain rim and the benches slump and slide off. Every walker's whole path is checked up front so nobody
// walks through anybody else.
import { rng, smooth, clamp, lerp } from './util.js';
import { gAt, vAtG } from './timeline.js';
import { FOUNTAIN, BENCHES, CAM } from './layout.js';
import { SKIN, HAIR } from './crowd.js';

// walking pace as a fraction of normal at video time v (heavier legs: slower, shorter steps)
const pace = (v) => { const g = gAt(v); return 1 / (1 + 1.6 * Math.max(g - 1.15, 0)); };
const DV = 1 / 120, V0 = -4, V1 = 72;
const PACE = new Float64Array(Math.round((V1 - V0) / DV) + 2);
for (let i = 1; i < PACE.length; i++) PACE[i] = PACE[i - 1] + pace(V0 + (i - 0.5) * DV) * DV;
const paced = (v) => { const f = clamp((v - V0) / DV, 0, PACE.length - 2), i = Math.floor(f); return lerp(PACE[i], PACE[i + 1], f - i); };

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1];

export const PEOPLE = [];
{
  const R = rng(4242);
  const blockers = [{ x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r + 0.7 }, ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.4 }))];
  const blocked = (x, z) => blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r) || Math.hypot(x - CAM.x, z - CAM.z) < 2.2;
  const base = (kind, x, z, yaw) => {
    const kid = kind === 'kid';
    const p = {
      kind, x, z, yaw, s: kid ? 0.6 + R() * 0.12 : 0.94 + R() * 0.12,
      gSit: 1.22 + Math.pow(R(), 0.7) * 1.45,              // knees give: down onto the paving (the first already at the first frame)
      gLie: 2.7 + R() * 1.6,                                // ... then flat out (most black out near 4x)
      back: R() < 0.35,                                     // falls on the back rather than face down
      phone: kind === 'stand' && R() < 0.45,
      look: R() * 0.4, ph: R() * 10, seed: R(),
      col: [SHIRT[Math.floor(R() * SHIRT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]],
    };
    if (R() < 0.2) p.gSit = 1.12 + R() * 0.22;            // (the old, the tired, the unlucky: already going down at the first frame)
    if (kid) { p.gSit = 1.9 + R() * 0.8; p.gLie = p.gSit + 1.2 + R() * 0.6; }
    if (p.gLie < p.gSit + 0.4) p.gLie = p.gSit + 0.4;
    p.vSit = vAtG(p.gSit); p.vLie = vAtG(p.gLie);
    PEOPLE.push(p);
    return p;
  };
  // walkers: paths that never come within 0.9 m of another walker or anyone standing
  const paths = [];
  const posAt = (p, v) => { const d = p.speed * (paced(Math.min(v, p.vSit)) - paced(-3)); return [p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d]; };
  const clash = (p) => {
    for (let v = -3; v <= 12; v += 0.25) {
      const [x, z] = posAt(p, v);
      if (blocked(x, z) || x < -32 || x > 34 || z < -31.5 || z > 4) return true;
      for (const q of paths) { const [qx, qz] = q.kind === 'walk' ? posAt(q, v) : [q.x, q.z]; if (Math.hypot(x - qx, z - qz) < 0.95) return true; }
    }
    return false;
  };
  const tryPlace = (kind, n, mk) => {
    let made = 0;
    for (let k = 0; k < n * 40 && made < n; k++) {
      const p = mk();
      if (!p) continue;
      if (clash(p)) { PEOPLE.pop(); continue; }
      paths.push(p); made++;
    }
  };
  // close to you: a couple a few steps ahead filming the sunset, a kid, someone crossing in front
  for (const [kind, x, z, yaw, sp, phone] of [['stand', 1.2, 0.6, Math.PI - 0.15, 0, true], ['stand', 2.0, 0.3, Math.PI + 0.25, 0, false],
    ['kid', -0.9, 1.8, Math.PI * 0.6, 0, false], ['walk', -3.5, -2.2, Math.PI / 2 - 0.1, 1.25, false], ['walk', 4.6, -4.5, -Math.PI / 2 + 0.15, 1.3, false],
    ['stand', -2.2, -5.5, Math.PI - 0.4, 0, true]]) {
    const p = base(kind, x, z, yaw);
    p.speed = sp; p.phone = phone; p.near = true;
    if (kind === 'stand') p.vSit = Math.max(p.vSit, 0.4);
    paths.push(p);
  }
  // standers first (groups watching the sunset, some filming it; facing roughly north-west)
  tryPlace('stand', 46, () => {
    const x = -26 + R() * 56, z = -30 + R() * 31;
    if (blocked(x, z)) return null;
    const p = base('stand', x, z, Math.PI + (R() - 0.5) * 1.6 - 0.25);
    p.speed = 0; p.vSit = Math.max(p.vSit, -1); return p;
  });
  tryPlace('kid', 10, () => {
    const x = -24 + R() * 52, z = -28 + R() * 28;
    if (blocked(x, z)) return null;
    const p = base('kid', x, z, R() * Math.PI * 2);
    p.speed = R() < 0.5 ? 1.6 + R() * 0.8 : 0; return p;
  });
  tryPlace('walk', 74, () => {
    const x = -30 + R() * 62, z = -30 + R() * 33;
    if (blocked(x, z)) return null;
    const p = base('walk', x, z, R() * Math.PI * 2);
    p.speed = 1.15 + R() * 0.4; return p;
  });
  for (const p of PEOPLE) if (p.speed === undefined) p.speed = 0;
  // sitting on the fountain rim (facing out) and on the benches
  for (let k = 0; k < 15; k++) {
    const a = (k / 15) * Math.PI * 2 + R() * 0.2;
    const r = FOUNTAIN.r + 0.25;
    const p = base('rim', FOUNTAIN.x + Math.sin(a) * r, FOUNTAIN.z + Math.cos(a) * r, a);
    p.speed = 0; p.seatY = 0.07;
  }
  for (const b of BENCHES) for (const off of [-0.6, 0.6]) {
    if (R() < 0.3) continue;
    const p = base('bench', b.x + Math.cos(b.yaw) * off, b.z - Math.sin(b.yaw) * off, b.yaw);
    p.speed = 0; p.seatY = 0.0;
  }
  // a crowd along the river railing beyond the road (small, far)
  for (let k = 0; k < 26; k++) {
    const p = base('stand', -40 + R() * 110, -55.8 + R() * 1.2, Math.PI + (R() - 0.5) * 0.8);
    p.speed = 0; p.far = true;
  }
}
export { paced };

const ease = (x) => x * x * (3 - 2 * x);
// where person p is and how they hold themselves at video time v (fields for crowd.pose)
export function personPose(p, v) {
  const o = { x: p.x, y: 0, z: p.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: p.look };
  const g = gAt(v);
  const strain = clamp((g - 1.2) / 1.6);
  if (p.speed > 0) {
    const d = p.speed * (paced(Math.min(v, p.vSit)) - paced(-3));
    o.x += Math.sin(p.yaw) * d; o.z += Math.cos(p.yaw) * d;
    const going = 1 - smooth(p.vSit - 0.6, p.vSit, v);
    o.walk = (p.ph + d / 0.75 * Math.PI) ;
    o.stride = (p.kind === 'kid' ? 1.4 : 1.0) * going * (1 - 0.5 * strain);
  }
  // the weight: shoulders hunch, the body sways and staggers
  const sway = Math.sin(v * 2.3 + p.ph) * 0.05 * strain + Math.sin(v * 5.1 + p.ph * 2) * 0.03 * strain;
  o.pitch = 0.12 * strain + sway;
  o.roll = Math.sin(v * 1.7 + p.ph * 3) * 0.06 * strain;
  if (p.phone) { const up = 1 - smooth(p.vSit - 1.6, p.vSit - 0.6, v); o.armR = up; o.armL = 0.85 * up; o.look = 0.2 * up; }
  o.armL += 0.15 * strain; o.armR += 0.15 * strain;   // hands out to catch themselves
  // sitting on the rim / a bench: slump, then slide off onto the paving
  if (p.kind === 'rim' || p.kind === 'bench') {
    o.sit = 1; o.y = p.seatY; o.pitch = 0.35 * strain + sway * 0.5;
    const k = smooth(p.vLie - 0.15, p.vLie + 0.3, v);
    if (k > 0) {
      const fwd = 0.55 + 0.6 * k;
      o.x += Math.sin(p.yaw) * fwd * k; o.z += Math.cos(p.yaw) * fwd * k;
      o.sit = 1 - k; o.pitch = lerp(o.pitch, Math.PI / 2, ease(k)); o.y = lerp(p.seatY, 0.1, k);
      o.armL = lerp(o.armL, 1.6, k); o.armR = lerp(o.armR, 1.6, k);
    }
    return o;
  }
  // knees give: down onto the paving (sitting / kneeling)
  const ks = smooth(p.vSit - 0.1, p.vSit + 0.45, v);
  if (ks > 0) {
    o.sit = ks; o.y = -(0.8 * p.s - 0.42) * ks;   // hips down on the paving (crowd.js drops sitters 0.42 m) o.pitch = lerp(o.pitch, 0.35, ks) + sway * 0.6;
    o.armL = lerp(o.armL, 0.35, ks); o.armR = lerp(o.armR, 0.35, ks);
  }
  // ...then flat out
  const kl = smooth(p.vLie - 0.05, p.vLie + 0.35, v);
  if (kl > 0) {
    const e = ease(kl);
    o.sit = lerp(o.sit, 0, e);
    o.y = lerp(o.y, p.back ? 0.12 : 0.1, e);
    const lie = p.back ? -Math.PI / 2 : Math.PI / 2;
    // (lying on the back from sitting: hips stay put, so the feet slide forward)
    if (p.back) { o.x += Math.sin(p.yaw) * 0.45 * e; o.z += Math.cos(p.yaw) * 0.45 * e; }
    o.pitch = lerp(o.pitch, lie, e);
    o.roll = lerp(o.roll, 0, e);
    o.armL = lerp(o.armL, p.back ? 0.1 : 1.6, e); o.armR = lerp(o.armR, p.back ? 0.1 : 1.6, e);
    o.look = 0;
  }
  return o;
}
