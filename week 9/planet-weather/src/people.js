// The crowd on the beach and what each world's weather does to them. Everyone keeps their own spot (each stop starts
// fresh); a person's pose is a pure function of (the stop, the seconds since its wipe). Positions are planned up front:
// thick round you and down to the water (some wading), thinning out along the beach; nobody between you and the lens,
// nobody closer than ~3.6 m to the lens, and on the left (where people would blow into you) nobody near the camera.
//   Jupiter: pointing and filming the storm wall, backing away; flinching at each strike; the ones near you turn to
//     you when your umbrella is hit; when the rain arrives, hands on heads.
//   Mars: watching the dust wall come; as it reaches each of them they turn their backs and cover their faces; then
//     hug themselves in the frost.
//   Venus: the heat hits: arms up over faces, staggering back, some dropping to a crouch.
//   Titan: heads up, hands out to catch the slow drops; then pointing at the sea as it freezes.
//   Saturn: leaning into the wind, faces covered; knocked flat one by one and dragged along the sand.
//   Neptune: knocked sideways at once, then torn off their feet and blown away out of frame, tumbling.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { landY, UMBRELLAS, LIFEGUARD, CAM0, CAM_FWD, CAM_RIGHT, YOU, FACE_YAW, PIER } from './layout.js';
import { STRIKES, JUP_RAIN, marsR, MARS_FROST, TIT_FREEZE } from './sched.js';

const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085, 0xf2f2f2, 0xe8e2d0, 0xc0392b, 0x2e86c1, 0xff8c1a, 0x1abc9c];
const PANTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d, 0xe8e2d0, 0xc0392b, 0x2e86c1];
export const PEOPLE = [];
const frameOf = (x, z) => { const dx = x - CAM0.x, dz = z - CAM0.z; return { f: dx * CAM_FWD.x + dz * CAM_FWD.z, l: dx * CAM_RIGHT.x + dz * CAM_RIGHT.z }; };
const YOU_L = frameOf(YOU.x, YOU.z).l;
{
  const R = rng(2026);
  const add = (x, z, o = {}) => {
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    const p = { x, z, yaw: FACE_YAW + (R() - 0.5) * 0.6, s: 0.92 + R() * 0.14, seed: R(), ph: R() * 6.28, g1: R(), g2: R(), g3: R(), g4: R(),
      col: [TOPS[Math.floor(R() * TOPS.length)], PANTS[Math.floor(R() * PANTS.length)], skin, HAIR[Math.floor(R() * HAIR.length)], R() < 0.45], ...o };
    const fr = frameOf(x, z); p.f = fr.f; p.l = fr.l;
    p.dYou = Math.hypot(x - YOU.x, z - YOU.z);
    PEOPLE.push(p);
    return p;
  };
  const OBS = [...UMBRELLAS.map((u) => [u.x, u.z, 0.5]), ...LIFEGUARD.map((l) => [l.x, l.z, 2.8])];
  const place = (x, z, gap) => {
    if (Math.abs(z - PIER.z) < 12) return null;
    if (x < -16) return null;                                             // (wading, no deeper than the chest)
    const { f, l } = frameOf(x, z);
    if (f < 3.6) return null;                                             // (the lens, and nobody behind it to blow through the frame)
    if (Math.hypot(x - YOU.x, z - YOU.z) < 1.7) return null;              // (your own room)
    if (f > 0 && f < 6.8 && l < 0.9 && l > -6) return null;              // (the left side near the camera: they'd blow into you)
    if (f > 0 && f < 9 && Math.abs(l - YOU_L) < 0.7) return null;        // (straight in front of you, close)
    if (PEOPLE.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) return null;
    if (OBS.some(([ox, oz, r]) => Math.hypot(ox - x, oz - z) < r + 0.45)) return null;
    const p = add(x, z);
    if (R() < 0.09) { p.s = 0.6 + R() * 0.12; p.kid = true; }
    return p;
  };
  // a few big and close at the right edge of the frame (people near you on frame 0)
  for (const [f, l] of [[3.9, 2.05], [5.2, 2.45], [6.6, 2.0], [7.4, 3.0]]) {
    const x = CAM0.x + CAM_FWD.x * f + CAM_RIGHT.x * l, z = CAM0.z + CAM_FWD.z * f + CAM_RIGHT.z * l;
    const p = add(x, z, { near: true });
    p.yaw = FACE_YAW + 0.12;
  }
  PEOPLE[0].g1 = 0.1; PEOPLE[0].g2 = 0.9; PEOPLE[1].g1 = 0.9; PEOPLE[1].g2 = 0.05;
  // packed round you and down to the water, then along the beach
  for (let k = 0; k < 7000 && PEOPLE.length < 760; k++) place(-14 + R() * 52, -34 + R() * 60, 1.08);
  for (let k = 0; k < 16000 && PEOPLE.length < 1250; k++) {
    const x = -15 + R() * 140, z = -320 + R() * 600;
    if (R() > 0.1 + 0.9 * Math.exp(-Math.hypot(x - 14, z + 2) / 60)) continue;
    place(x, z, 0.95);
  }
  for (const p of PEOPLE) {
    p.y0 = landY(p.x);
    p.d = 0.05 + p.seed * 0.3;
    p.wade = p.x < 0;
  }
}

// ---- helpers ----
const out = {};
function base(p) {
  out.x = p.x; out.y = p.y0; out.z = p.z; out.yaw = p.yaw; out.s = p.s; out.walk = 0; out.stride = 0; out.sit = 0; out.pitch = 0; out.roll = 0;
  out.armL = 0; out.armR = 0; out.look = 0.08; out.visible = true;
  return out;
}
// step back toward the camera side by d metres (facing the same way), legs moving while it happens
function backAway(o, p, d, k) {
  o.x -= CAM_FWD.x * d; o.z -= CAM_FWD.z * d;
  o.y = landY(o.x);
  o.walk = -d / 0.55 * Math.PI + p.ph; o.stride = 0.8 * k;
}
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const turnTo = (o, yaw, k) => { o.yaw += wrap(yaw - o.yaw) * k; };
// blown along the wind (frame-right): how far (m) t s after it takes them, with a top speed
const blown = (t, acc, vmax) => (t <= 0 ? 0 : t < vmax / acc ? 0.5 * acc * t * t : vmax * vmax / (2 * acc) + vmax * (t - vmax / acc));

const JUP_FLINCH = STRIKES.filter((k) => k.who !== 'far').map((k) => k.t);

export function personPose(p, key, tt) {
  const o = base(p);
  const r = p.seed;
  if (p.wade) o.y = landY(p.x);
  if (key === 'jupiter') {
    // pointing / filming / hands to mouths; backing away as the storm comes on
    o.look = 0.35 + 0.15 * p.g3;
    if (p.g1 < 0.42) o.armR = 1.2 + 0.15 * p.g3;
    if (!p.kid && p.g2 < 0.24) o.armL = 1.02;
    const t0 = 0.6 + r * 3.5;
    const k = smooth(t0, t0 + 1.5, tt);
    const d = (p.f > 9 || p.l > 1.5 ? 1 : 0.25) * (0.9 + 1.6 * p.g4) * smooth(t0, t0 + 3.2, tt);
    if (p.g4 > 0.3) backAway(o, p, d, k * (1 - smooth(t0 + 3, t0 + 3.4, tt)));
    // flinches
    for (const ft of JUP_FLINCH) { const e = Math.exp(-Math.max(0, tt - ft - p.d * 0.5) / 0.3) * smooth(ft - 0.02, ft + 0.05, tt - p.d * 0.5); o.pitch += 0.12 * e; o.armL = Math.max(o.armL, 1.3 * e); }
    // your umbrella is hit: the ones near you turn to look, some point at you
    if (p.dYou < 10) {
      const k2 = smooth(4.95 + p.d, 5.4 + p.d, tt);
      const yy = Math.atan2(YOU.x - o.x, YOU.z - o.z);
      turnTo(o, yy, k2 * 0.75);
      if (p.g1 < 0.6) o.armR = lerp(o.armR, 1.1, k2);
    }
    // the rain: hands on heads, hunched
    const rk = smooth(JUP_RAIN + 0.2 + r * 0.6, JUP_RAIN + 0.8 + r * 0.6, tt);
    o.armL = lerp(o.armL, 1.55, rk * (p.g2 < 0.6 ? 1 : 0)); o.armR = lerp(o.armR, 1.5, rk * (p.g2 < 0.6 ? 1 : 0)); o.pitch += 0.12 * rk;
    return o;
  }
  if (key === 'mars') {
    o.look = 0.25;
    if (p.g1 < 0.4) o.armR = 1.15 * (1 - smooth(1.6, 2.0, tt));
    // the dust wall reaches them (it rolls in from the sea at ~45 m/s): back to it, face covered
    const hit = 3.65 * (1 - Math.pow(Math.max(0, (p.f - 3) / 330), 1 / 1.6)) + p.d * 0.3;   // (when the dust wall reaches them: marsR(hit) = their distance)
    const k = smooth(hit - 0.3, hit + 0.3, tt);
    turnTo(o, p.yaw + Math.PI * (p.g3 < 0.5 ? 1 : -1), k * (p.g4 < 0.65 ? 1 : 0.4));
    o.armL = lerp(o.armL, 1.35, k); o.armR = lerp(o.armR, 1.3 * (p.g1 < 0.5 ? 1 : 0.2), k);
    o.pitch += 0.22 * k; o.sit = 0.25 * k * (p.g2 < 0.35 ? 1 : 0);
    // the frost: hugging themselves, shivering
    const f = smooth(MARS_FROST + r * 0.8, MARS_FROST + 0.8 + r * 0.8, tt);
    o.armL = lerp(o.armL, 0.75, f); o.armR = lerp(o.armR, 0.75, f);
    o.roll += 0.03 * f * Math.sin(tt * 40 + p.ph);
    return o;
  }
  if (key === 'venus') {
    const k = smooth(0.25 + p.d, 0.65 + p.d, tt);
    o.armL = 1.4 * k; o.armR = (p.g1 < 0.7 ? 1.35 : 0.1) * k; o.pitch = 0.25 * k; o.look = 0.05;
    backAway(o, p, (0.6 + 1.2 * p.g4) * smooth(0.3 + p.d, 2.2 + p.d, tt), k * (1 - smooth(2.0, 2.5, tt)));
    turnTo(o, p.yaw + Math.PI * (p.g3 < 0.5 ? 0.8 : -0.8), smooth(2.2 + r, 3.2 + r, tt) * (p.g4 < 0.5 ? 1 : 0));
    o.sit = 0.55 * smooth(2.5 + r * 2, 3.3 + r * 2, tt) * (p.g2 < 0.4 ? 1 : 0);
    o.pitch += 0.25 * o.sit;
    return o;
  }
  if (key === 'titan') {
    // heads back, hands out palms up to catch the slow drops; kids hop
    o.look = 0.85; o.pitch = -0.08;
    const k = smooth(0.4 + p.d, 1.0 + p.d, tt);
    if (p.g1 < 0.55) { o.armL = 0.85 * k; o.armR = 0.85 * k; }
    else if (p.g1 < 0.75) o.armR = 1.5 * k;
    if (p.kid) o.y += 0.18 * Math.max(0, Math.sin(tt * 6 + p.ph)) * k;
    // the sea freezes: they look and point at it; the ones in the water wade out
    const f = smooth(TIT_FREEZE + 0.3 + r * 0.5, TIT_FREEZE + 0.9 + r * 0.5, tt);
    o.look = lerp(o.look, 0.05, f);
    if (p.g3 < 0.5) o.armR = lerp(o.armR, 1.0, f);
    o.armL = lerp(o.armL, 0.7, f * (p.g3 < 0.5 ? 0 : 1));
    if (p.wade) { const w = smooth(TIT_FREEZE - 0.4, TIT_FREEZE + 2.4, tt) * 2.4; o.x += w; o.y = landY(o.x); o.walk = w / 0.5 * Math.PI + p.ph; o.stride = 0.8 * (1 - smooth(TIT_FREEZE + 2.0, TIT_FREEZE + 2.4, tt)) * smooth(TIT_FREEZE - 0.4, TIT_FREEZE, tt); }
    return o;
  }
  if (key === 'saturn' || key === 'neptune') {
    const N = key === 'neptune';
    // the gust: lean into it (it comes from the left), faces covered, staggering right
    const k = smooth(0.05 + p.d * 0.3, 0.4 + p.d * 0.3, tt);
    o.roll = -0.28 * k; o.pitch = 0.18 * k;
    o.armL = 1.4 * k; o.armR = (p.g1 < 0.5 ? 1.3 : 0.4) * k;
    let side = (N ? 1.6 : 0.7) * smooth(0.0, 0.8, tt) * (0.6 + 0.6 * p.g4);
    o.walk = side / 0.4 * Math.PI + p.ph; o.stride = 0.9 * k * (1 - smooth(1.0, 1.4, tt));
    o.sit = 0.35 * smooth(1.0 + r, 1.6 + r, tt) * (p.g2 < 0.5 ? 1 : 0);
    // knocked flat and dragged (Saturn: some of them, a few metres; Neptune: everyone, then off their feet)
    const tDown = N ? 0.9 + 2.2 * r + (p.near ? -0.4 : 0) : 1.2 + 4.5 * r;
    const down = (N || p.g3 < 0.55) ? smooth(tDown, tDown + 0.35, tt) : 0;
    if (down > 0) {
      o.pitch = lerp(o.pitch, 1.45, down); o.roll = lerp(o.roll, (p.g4 - 0.5) * 1.2, down);
      o.armL = lerp(o.armL, 1.6, down); o.armR = lerp(o.armR, 1.6, down); o.sit = 0;
      side += (N ? 0 : 1) * blown(tt - tDown, 6, 3.5) * smooth(9, 14, p.f);      // (the ones near the lens just go down)
      o.y += 0.12 * down;
    }
    let lift = 0;
    if (N) {
      const tFly = tDown + 0.5 + 0.8 * p.g2;
      const t = tt - tFly;
      if (t > 0) {
        side += blown(t, 55 + 25 * p.g4, 160);
        lift = Math.min(6, 1.8 * t + 2.5 * t * t) * (0.4 + 0.6 * p.g1) * (0.1 + 0.9 * smooth(10, 32, p.f));   // (near you they tumble along the sand, not across the sky)
        o.pitch += t * (5 + 6 * p.g3) * (p.g4 < 0.5 ? 1 : -1);
        o.roll += t * (3 + 4 * p.g1);
        o.armL = 1.6 + 0.4 * Math.sin(tt * 14 + p.ph); o.armR = 1.3 + 0.5 * Math.sin(tt * 11 + p.ph * 2);
        if (side > 260) o.visible = false;                 // (long gone off the right of the frame)
      }
    }
    o.x += CAM_RIGHT.x * side; o.z += CAM_RIGHT.z * side;
    o.y = landY(o.x) + 0.12 * down + lift;
    return o;
  }
  return o;
}
