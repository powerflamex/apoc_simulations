// The people on California St: walking up and down the sidewalks at the first frame (it's only rattling), they
// slow, stop and look round; from magnitude 6 they crouch with their arms over their heads; the rolling street
// knocks them down (from ~7.8); from 11 they are thrown into the air with everything else. Plus the riders on the
// cable car's running boards, who hold on until it derails, then drop off into the street.
// Paths are planned up front and checked against each other, so nobody walks through anybody.
import { rng, smooth, lerp, clamp } from './util.js';
import { ST, CAM0, streetY } from './layout.js';
import { SKIN, HAIR } from './crowd.js';
import { vAtMag, V_FALL } from './timeline.js';
import { tossY, cableFrame } from './props.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xffffff, 0x111111];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];

export const PEOPLE = [];
export const RIDERS = [];
{
  const R = rng(1906);
  const col = () => [SHIRT[Math.floor(R() * SHIRT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]];
  const dist = (p, v) => { const t = Math.min(v, p.vStop) + 4; const extra = Math.max(0, Math.min(v - p.vStop, 0.8)); return p.speed * (t + extra * (1 - extra / 1.6)); };
  const posAt = (p, v) => { const d = dist(p, v); return [p.x, p.z + p.dir * d]; };
  const clash = (p) => {
    for (let v = -4; v <= 8; v += 0.2) {
      const [x, z] = posAt(p, v);
      if (Math.hypot(x - CAM0.x, z - CAM0.z) < 2.2) return true;
      for (const q of PEOPLE) { const [qx, qz] = posAt(q, v); if (Math.hypot(x - qx, z - qz) < 0.9) return true; }
    }
    return false;
  };
  for (let k = 0; k < 4000 && PEOPLE.length < 64; k++) {
    const side = R() < 0.5 ? -1 : 1;
    const x = side * (ST.road + 0.8 + R() * (ST.walk - ST.road - 1.6));
    const z = 45 - R() * 230;
    const walk = R() < 0.75;
    const p = {
      x, z, dir: R() < 0.5 ? 1 : -1, speed: walk ? 1.1 + R() * 0.4 : 0, seed: R(), s: 0.93 + R() * 0.13, ph: R() * 10,
      vStop: 1.5 + R() * 3.5, vCrouch: vAtMag(5.9 + R() * 0.5), vDown: vAtMag(7.7 + R() * 0.9), downDir: R() < 0.5 ? -1 : 1, col: col(),
      phone: R() < 0.2, kid: R() < 0.06,
    };
    // walkers start 4 s of walking before their spot (so their spot is where they are near frame 0)
    p.z -= p.dir * p.speed * 4;
    if (p.kid) p.s = 0.62 + R() * 0.08;
    if (clash(p)) continue;
    PEOPLE.push(p);
  }
  // a crowd at the cable car stop in the middle of the street, just ahead of you (waiting, chatting, filming)
  for (let k = 0, made = 0; k < 3000 && made < 18; k++) {
    const x = (R() < 0.5 ? -1 : 1) * (0.4 + R() * 3.4), z = 7 - R() * 22;
    if (Math.abs(x - 1.3) < 1.6 && z < -10) continue;                // (clear of the right track where the cable car comes)
    const p = { x, z, dir: 1, speed: 0, seed: R(), s: 0.93 + R() * 0.13, ph: R() * 10, vStop: 0, vCrouch: vAtMag(5.8 + R() * 0.5), vDown: vAtMag(7.7 + R() * 0.9),
      downDir: R() < 0.5 ? -1 : 1, col: col(), phone: R() < 0.35, kid: R() < 0.06, face: R() * 6.28 };
    if (clash(p)) continue;
    PEOPLE.push(p); made++;
  }
  // riders on the cable car: standing on the running boards (holding the brass posts) and sitting inside
  for (const [sx, oz] of [[-1, -3.2], [-1, -1.9], [-1, 2.2], [1, -2.9], [1, -1.2], [1, 2.6], [0.45, -0.3], [-0.45, 0.8], [0.45, 1.6]]) {
    RIDERS.push({ sx, oz, seed: R(), s: 0.95 + R() * 0.1, col: col(), board: Math.abs(sx) === 1, vOff: V_FALL + 0.3 + R() * 1.2, fallDir: sx === 0 ? 1 : sx });
  }
}

// a walker / bystander at video time v
export function personPose(p, v, s) {
  const d = (Math.min(v, p.vStop) + 4) * p.speed + p.speed * Math.max(0, Math.min(v - p.vStop, 0.8)) * (1 - Math.max(0, Math.min(v - p.vStop, 0.8)) / 1.6);
  const x = p.x, z = p.z + p.dir * d;
  const yaw = p.face ?? (p.dir > 0 ? 0 : Math.PI);
  const o = { x, y: streetY(z), z, yaw: yaw + (v > p.vStop ? 0.6 * Math.sin(v * 0.8 + p.seed * 9) * smooth(p.vStop, p.vStop + 1, v) : 0), s: p.s, walk: p.ph + d / 0.75 * Math.PI, stride: p.speed > 0 ? 1 - smooth(p.vStop, p.vStop + 0.8, v) : 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: p.phone ? 1 : 0, look: 0.1 };
  // the shaking throws everyone off balance: they sway with the jolts and take quick little steps to stay up
  const sh = Math.min(s.shake, 2.2);
  const ph = p.seed * 40;
  const jolt = Math.sin(v * 9.3 + ph) * 0.6 + Math.sin(v * 13.7 + ph * 1.3) * 0.4;
  o.roll = 0.09 * sh * jolt;
  o.pitch = 0.06 * sh * Math.sin(v * 7.1 + ph * 0.7);
  if (p.speed === 0 || v > p.vStop) { o.walk = v * 7 + ph; o.stride = Math.min(0.45, 0.25 * sh) * (0.6 + 0.4 * Math.sin(v * 2.3 + ph)); }
  o.armL = 0.35 + 0.35 * sh * (0.5 + 0.5 * Math.sin(v * 5.3 + ph));             // arms out to catch themselves
  o.armR = p.phone ? 1 : 0.3 + 0.35 * sh * (0.5 + 0.5 * Math.sin(v * 4.7 + ph * 2));
  o.yaw += 0.25 * Math.sin(v * 1.7 + ph) * smooth(0, 1, sh);                   // looking round: what is this?
  // then they brace, each their own way: covering the head, grabbing for balance, or down on their knees
  const c = smooth(p.vCrouch, p.vCrouch + 0.6, v);
  if (c > 0) {
    const kind = Math.floor(p.seed * 3);
    const bob = 0.5 + 0.5 * Math.sin(v * 6 + ph);
    if (kind === 0) {        // covering the head with one arm, the other out, half crouched, rocking
      o.sit = lerp(o.sit, 0.35 + 0.1 * bob, c); o.armL = lerp(o.armL, 1.25 + 0.1 * bob, c); o.armR = lerp(o.armR, 0.6 + 0.4 * bob, c);
      o.pitch = lerp(o.pitch, 0.22, c) + 0.05 * jolt; o.look = lerp(o.look, -0.35, c);
    } else if (kind === 1) { // staggering, arms flailing forward for something to hold
      o.sit = lerp(o.sit, 0.2 + 0.15 * bob, c); o.armL = lerp(o.armL, 0.7 + 0.5 * Math.sin(v * 3.9 + ph), c); o.armR = lerp(o.armR, 0.8 + 0.5 * Math.sin(v * 4.4 + ph * 3), c);
      o.roll += 0.12 * jolt * c; o.stride = Math.max(o.stride, 0.4 * c);
    } else {                 // down on one knee, a hand on the ground
      o.sit = lerp(o.sit, 0.75, c); o.pitch = lerp(o.pitch, 0.35, c) + 0.04 * jolt; o.armL = lerp(o.armL, 0.2, c); o.armR = lerp(o.armR, 1.15, c); o.look = lerp(o.look, -0.2, c);
      o.stride = lerp(o.stride, 0, c);
    }
  }
  // knocked down by the rolling street: over onto the side, lying flat
  const k = smooth(p.vDown, p.vDown + 0.5, v);
  if (k > 0) { o.roll = lerp(o.roll, p.downDir * 1.45, k); o.pitch = lerp(o.pitch, 0, k); o.sit = lerp(o.sit, 0.2, k); o.stride = lerp(o.stride, 0, k); o.y += 0.15 * k + 0.12 * k * Math.abs(Math.sin(v * 8 + p.seed * 40)) * Math.min(1, s.shake);
    o.armL = lerp(o.armL, 0.9 + 0.3 * Math.sin(v * 3 + p.seed * 9), k); o.armR = lerp(o.armR, 0.5, k); }
  // thrown into the air (tumbling)
  const ty = tossY(s.toss, v, p.seed);
  if (ty > 0) { o.y += ty; o.pitch += ty * 0.6; o.roll += ty * 0.4 * p.downDir; }
  return o;
}
// a rider, given the cable car's frame (s.cable)
export function riderPose(r, v, s) {
  const c = cableFrame(Math.min(v, r.vOff));   // (once they let go, the car leaves without them)
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const lx = r.sx * (r.board ? 1.42 : 0.5), lz = r.oz;
  const x = c.x + lx * cy + lz * sy, z = c.z - lx * sy + lz * cy;
  const y = c.y + (r.board ? 0.45 : 0.55) - lz * Math.sin(c.slope);
  const o = { x, y, z, yaw: c.yaw + (r.board ? (r.sx > 0 ? -Math.PI / 2 : Math.PI / 2) * 0.3 : 0), s: r.s, walk: 0, stride: 0, sit: r.board ? 0 : 0.95, pitch: 0, roll: 0, armL: r.board ? 1.3 : 0.2, armR: r.board ? 0.4 : 0.2, look: 0.15 };
  if (r.board) o.roll = -r.sx * 0.2;
  // drop off when it derails: out sideways onto the street, and lie there
  const k = smooth(r.vOff, r.vOff + 0.7, v);
  if (k > 0) {
    const ox = r.fallDir * (1.8 + 1.2 * r.seed) * k;
    o.x += ox * cy; o.z -= ox * sy;
    o.y = lerp(o.y, streetY(o.z) + 0.15, k) + 1.2 * Math.sin(Math.PI * k) * (1 - k);
    o.roll = r.fallDir * 1.45 * k; o.sit = 0.2; o.armL = 1.4; o.armR = 1.2;
    const ty = tossY(s.toss, v, r.seed);
    if (ty > 0) { o.y += ty; o.pitch += ty * 0.6; }
  }
  return o;
}
