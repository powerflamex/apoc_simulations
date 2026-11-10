// The people, as pure functions of video time. Walkers keep to lanes (everyone in a lane walks the same way at the
// same speed, lanes 0.9 m apart), so nobody ever walks through anybody; their position wraps far down the street
// and behind the camera. Groups stand on the promenade's edges looking up; a few sit on the benches; an amateur
// astronomer has a telescope out with friends round it.
//   time-lapse (s.lapse): they drop out one by one (a long exposure keeps nobody who moves), and come back
//   the planets: "nobody notices", until a group looks up and points at where Jupiter was
//   the Sun stage: day; then coats (dark colours) in the snow, walking slower
//   satellites: everyone stops and stares at their phone (a glow at the hand)
//   the split: they stop, stagger, then lift off the ground and float, arms out, riding their piece of the ground
import * as THREE from 'three';
import { rng, smooth, clamp, lerp } from './util.js';
import { PROM, ROAD, WALK, KIOSKS, BENCHES, CAM } from './layout.js';
import { SKIN, HAIR } from './crowd.js';
import { SEC } from './timeline.js';
import { nearestSeed, spread } from './split.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef, 0xffffff, 0x111111];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];
const COAT = [0x1c1f26, 0x2b2f38, 0x3b2a22, 0x4a3f33, 0x1f2e3e, 0x5a1e1e, 0x2f3b2c, 0x6b5b45, 0x111214, 0x3e4450];
export const TEL = { x: -4.7, z: -17 };

export const PEOPLE = [];
{
  const R = rng(1337);
  const mk = (o) => {
    const p = {
      x: 0, z: 0, yaw: 0, speed: 0, s: 0.92 + R() * 0.14, ph: R() * 10, seed: R(), phone: R() < 0.12,
      col: [SHIRT[Math.floor(R() * SHIRT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]],
      coat: COAT[Math.floor(R() * COAT.length)],
      out: SEC.lapse + 0.5 + R() * 5,          // when they drop out of the time-lapse
      back: SEC.planets - 2.5 + R() * 4.5,     // and come back
      ...o,
    };
    if (p.kid) p.s = 0.6 + R() * 0.1;
    PEOPLE.push(p);
    return p;
  };
  // walking lanes: the promenade (not right where you stand) and both sidewalks
  const lanes = [];
  for (const x of [-3.3, -2.4, 2.4, 3.3]) lanes.push({ x, dir: x < 0 ? 1 : -1 });
  for (const s of [-1, 1]) for (const ax of [16.1, 17.0, 17.9, 18.8]) lanes.push({ x: s * ax, dir: (ax < 17.5) === (s > 0) ? 1 : -1 });
  const Z0 = 45, Z1 = -520;
  for (const L of lanes) {
    const speed = 1.15 + R() * 0.3;
    for (let z = 0; z < Z0 - Z1 - 3; z += 4 + R() * 14) mk({ lane: L, x: L.x + (R() - 0.5) * 0.12, z0: z, speed, dir: L.dir, kid: R() < 0.05, walker: true });
  }
  // standing groups on the promenade edges, looking up (near you, then further down)
  const spots = [[-4.4, -9], [4.3, -13], [-4.6, -26], [4.5, -31], [-4.3, -47], [4.4, -55], [-4.5, -68], [4.6, -82], [-4.4, -95], [4.5, -120], [-4.5, -140], [4.4, -165]];
  const clear = (x, z) => KIOSKS.every((k) => Math.hypot(k.x - x, k.z - z) > 3.2) && Math.hypot(TEL.x - x, TEL.z - z) > 2.4;
  for (const [gx, gz] of spots) {
    const n = 2 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const x = gx + (k - (n - 1) / 2) * 0.75 * Math.sign(-gx) * 0.3 + (R() - 0.5) * 0.2, z = gz + (k - (n - 1) / 2) * 0.8;
      if (!clear(x, z)) continue;
      mk({ x, z, yaw: (gx < 0 ? -1 : 1) * (0.4 + R() * 0.6) + (R() - 0.5) * 0.4, group: true, looker: R() < 0.7, pointer: R() < 0.35 });
    }
  }
  // the telescope: the owner at the eyepiece, two friends
  mk({ x: TEL.x + 0.55, z: TEL.z + 0.55, yaw: -0.55 + Math.PI, scope: true, phone: false });
  mk({ x: TEL.x - 0.4, z: TEL.z + 1.1, yaw: 2.6, group: true, looker: true, pointer: true });
  mk({ x: TEL.x + 1.3, z: TEL.z + 0.4, yaw: -2.4, group: true, looker: true, kid: true });
  // on the benches
  for (const b of BENCHES) {
    if (R() < 0.45 || b.z < -260) continue;
    if (!clear(b.x, b.z)) continue;
    const n = R() < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) mk({ x: b.x - Math.sign(b.x) * 0.1, z: b.z + (n === 2 ? (k - 0.5) * 0.7 : 0), yaw: b.yaw + Math.PI, sit: true, looker: R() < 0.5 });
  }
  // on the sidewalks, window shopping / waiting
  for (let k = 0; k < 60; k++) {
    const s = R() < 0.5 ? -1 : 1, z = 30 - R() * 400;
    mk({ x: s * (WALK - 0.8 - R() * 0.6), z, yaw: s > 0 ? -Math.PI / 2 + (R() - 0.5) * 1.5 : Math.PI / 2 + (R() - 0.5) * 1.5, group: true, looker: R() < 0.3 });
  }
  for (const p of PEOPLE) p.plate = nearestSeed(p.x, p.z);
}
export const PERSON_COUNT = PEOPLE.length;

// walking distance with the slow-downs (every lane slows together, so the spacing holds): slower in the snow,
// stopping to stare at their phones once the satellites go (and not walking on after that)
const speedAt = (u) => (1 - 0.32 * smooth(SEC.month, SEC.month + 4, u) * (1 - smooth(SEC.moon - 2, SEC.moon, u))) * (1 - smooth(SEC.sats + 6, SEC.sats + 9, u));
const WSTEP = 0.05, WN = Math.ceil(460 / WSTEP);
const WCUM = new Float64Array(WN + 1);
for (let i = 1; i <= WN; i++) WCUM[i] = WCUM[i - 1] + speedAt((i - 0.5) * WSTEP) * WSTEP;
function walkClock(v) {
  if (v <= 0) return v;
  const f = Math.min(v / WSTEP, WN - 1e-6), i = Math.floor(f);
  return WCUM[i] + (WCUM[i + 1] - WCUM[i]) * (f - i);
}

const tmp = {};
// pose of person p at video time v; M: the plate matrices (or null); out: fields for crowd.pose
export function personPose(p, v, s, M) {
  const o = { x: p.x, y: 0, z: p.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0, visible: true };
  if (v > p.out && v < p.back && !p.scope) { o.visible = false; return o; }
  if (p.walker) {
    const d = p.z0 + walkClock(v) * p.speed;
    const span = 565;
    const w = ((d % span) + span) % span;
    o.z = p.dir > 0 ? -520 + w : 45 - w;
    o.yaw = p.dir > 0 ? 0 : Math.PI;
    o.walk = p.ph + d / 0.72 * Math.PI;
    o.stride = 0.95 * speedAt(v);
    if (o.z > CAM.z + 2 && Math.abs(o.x - CAM.x) < 1.6) o.visible = false;   // nobody right on top of the camera
  }
  if (p.sit) o.sit = 1;
  // looking up: the groups at the Milky Way, at Jupiter's last nights, at the Moon; the walkers glance up now and then
  let look = 0;
  if (p.looker) look = 0.8 + 0.2 * Math.sin(v * 0.3 + p.ph);
  else if (p.group) look = 0.25;
  if (p.walker) look = 0.15 + 0.5 * smooth(0.7, 1, Math.sin(v * 0.21 + p.ph * 3));
  // "nobody down here notices" (the planets): then a group looks up and points
  if (v > SEC.saturn - 2 && v < SEC.gone && p.walker) look = 0.05;
  if (p.pointer && ((v > SEC.mw && v < SEC.stars + 10) || (v > SEC.gone && v < SEC.sun - 2) || (v > SEC.moon + 4 && v < SEC.sats))) o.armR = 1.55 + 0.05 * Math.sin(v * 2 + p.ph);
  if (p.group && v > SEC.gone - 1 && v < SEC.sun - 2) look = 1;
  // the day: shading their eyes toward the shrinking Sun
  if (v > SEC.sun && v < SEC.moon && p.looker) { o.armL = 1.25; look = 0.5; }
  o.look = look;
  if (p.phone && !p.looker) { o.armR = 1.0; o.look = -0.2; }
  if (p.scope) { o.look = -0.15; o.pitch = 0.35; o.armL = 0.9; o.armR = 0.8; o.yaw = p.yaw; }
  // satellites: everyone gets their phone out and stares at it
  const ph = s.phones;
  if (ph > 0 && !p.scope) {
    const k = clamp(ph * 1.6 - p.seed * 0.6);
    o.armR = lerp(o.armR, 1.0, k); o.armL = lerp(o.armL, 0.6, k * 0.5); o.look = lerp(o.look, -0.35, k);
    p._phone = k;
  } else p._phone = p.phone && !p.looker ? 1 : 0;
  // the split: they stagger as the ground shakes, then float up, arms out
  if (v > SEC.split + 2) {
    const sh = smooth(SEC.split + 2, SEC.crack + 4, v) * (1 - smooth(SEC.splitHush, SEC.float, v));
    o.roll += Math.sin(v * 7.1 + p.ph * 3) * 0.08 * sh;
    o.pitch += Math.sin(v * 5.3 + p.ph) * 0.06 * sh;
    o.armL = Math.max(o.armL, 0.6 * sh); o.armR = Math.max(o.armR, 0.6 * sh);
    const lift = s.lift;
    if (lift > 0) {
      const t = Math.max(0, v - (SEC.splitHush - 4 + p.seed * 4));
      o.y += 0.06 * t * t * (0.6 + 0.8 * p.seed) * lift;
      o.sit *= 1 - lift;
      o.armL = lerp(o.armL, 1.3 + 0.3 * Math.sin(v * 1.3 + p.ph), lift); o.armR = lerp(o.armR, 1.2 + 0.3 * Math.sin(v * 1.1 + p.ph * 2), lift);
      o.pitch += lift * (0.3 * Math.sin(t * 0.4 + p.ph)) * Math.min(1, t * 0.2);
      o.roll += lift * 0.4 * Math.sin(t * 0.3 + p.ph * 2) * Math.min(1, t * 0.2);
      o.stride = 0.3 * lift; o.walk = v * 2 + p.ph;
    }
  }
  if (M) {
    const P = tmp.v || (tmp.v = new THREE.Vector3());
    P.set(o.x, o.y, o.z).applyMatrix4(M[p.walker ? nearestSeed(o.x, o.z) : p.plate]);
    o.x = P.x; o.y = P.y; o.z = P.z;
  }
  return o;
}

export function personColors(p, coats) {
  const c = coats > 0.5;
  return [c ? p.coat : p.col[0], c ? (p.seed < 0.5 ? 0x1b1d22 : p.col[1]) : p.col[1], p.col[2], p.col[3]];
}
