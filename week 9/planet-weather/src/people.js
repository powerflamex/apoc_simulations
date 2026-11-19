// The crowd on the beach and what each world's weather does to them. Everyone keeps their own spot (each stop starts
// fresh); a person's pose is a pure function of (the stop, the seconds since its wipe). Positions are planned up front:
// thick round you and down to the water (some wading), thinning out along the beach; nobody between you and the lens,
// nobody closer than ~3.6 m to the lens, and on the left (where people would blow into you) nobody near the camera.
//   Jupiter: pointing and filming the storm wall; ducking at each strike; after the first bolt into the sea most of the
//     beach turns and runs; the ones near you jump back when your umbrella is hit, then run too; rain: hands on heads.
//   Mars: some run from the dust wall; as it reaches each of them they drop into a crouch, arms over their heads; the
//     frost front locks them there (white statues; the frost itself is in the shaders).
//   Venus: the heat hits at once: arms over faces; then they run from the sea, some falling to a crouch.
//   Titan: heads up to the slow drops; they see the freeze front coming and run; it catches them mid-stride and they
//     stay that way, frozen white.
//   Saturn: knocked flat within ~1.5 s, sliding and rolling along the sand downwind.
//   Neptune: knocked down at once, then torn off the sand and blown away out of frame, tumbling.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { landY, UMBRELLAS, LIFEGUARD, CAM0, CAM_FWD, CAM_RIGHT, YOU, FACE_YAW, PIER } from './layout.js';
import { STRIKES, JUP_RAIN, JUP_RUN, marsHit, marsFrostF, TIT_RUN, TIT_SHORE, titSeaFront, titBeachF, SAT_KNOCK, satFrontT } from './sched.js';

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

// running away from the sea: back up the beach and out to their own side of the frame (the ones close to the camera
// straight out to the side, so nobody runs through you or the lens). Returns how far along (f, l) they've gone.
const runDir = (p) => {
  const side = p.l > YOU_L ? 1 : -1;
  if (p.f < 10 || Math.abs(p.l - YOU_L) < 1.6) return [-0.12, side * 0.99];
  return [-0.85, side * 0.52];
};
function runOff(p, d) {
  const [df, dl] = runDir(p);
  return [Math.max(df * d, Math.min(0, 5.2 - p.f)), dl * d];
}
// a run that stops after `cap` metres: { d: how far, k: 1 running .. 0 stopped, stop: 0 .. 1 once they've stopped }
function capped(tt, tr, acc, vmax, cap) {
  const t = tt - tr;
  const tStop = cap <= vmax * vmax / (2 * acc) ? Math.sqrt(2 * cap / acc) : vmax / acc + (cap - vmax * vmax / (2 * acc)) / vmax;
  const d = Math.min(blown(t, acc, vmax), cap);
  const stop = smooth(tStop - 0.1, tStop + 0.3, t);
  return { d, k: smooth(0, 0.3, t) * (1 - stop), stop };
}
// put them d metres along their run, facing where they run, legs going (k: 0 standing .. 1 at a run)
function run(o, p, d, k) {
  if (d <= 0 && k <= 0) return;
  const [df, dl] = runDir(p);
  const [of, ol] = runOff(p, d);
  o.x += CAM_FWD.x * of + CAM_RIGHT.x * ol; o.z += CAM_FWD.z * of + CAM_RIGHT.z * ol;
  o.y = landY(o.x);
  const dx = CAM_FWD.x * df + CAM_RIGHT.x * dl, dz = CAM_FWD.z * df + CAM_RIGHT.z * dl;
  turnTo(o, Math.atan2(dx, dz), smooth(0, 0.25, k));
  o.walk = d / 0.85 * Math.PI + p.ph; o.stride = 1.6 * k;
  o.look = Math.min(o.look, 0.1);
}

const NEAR_STRIKES = STRIKES.filter((k) => k.who !== 'far').map((k) => k.t);
const YOU_HIT = STRIKES.find((k) => k.who === 'you').t;

// Titan: where the freeze front is (as a distance ahead of the camera) and when it reaches each person (they freeze
// mid-stride, so their pose is held from then on)
const titFrontF = (tt) => (tt < TIT_SHORE ? (CAM0.x + titSeaFront(tt)) * 0.978 : titBeachF(tt));
export { titFrontF };
function titanFreezeT(p) {
  if (p.tFz !== undefined) return p.tFz;
  let t = 0;
  for (; t < 6; t += 0.02) {
    const tr = TIT_RUN + p.d * 1.4;
    const d = p.g4 > 0.15 ? blown(t - tr, 7, 3.5 + 2 * p.g3) : 0;
    const f = p.f + runOff(p, d)[0];
    if (titFrontF(t) <= f) break;
  }
  return (p.tFz = t);
}

export function personPose(p, key, tt) {
  const o = base(p);
  const r = p.seed;
  if (p.wade) o.y = landY(p.x);
  if (key === 'jupiter') {
    // pointing / filming / hands to mouths at the storm wall
    o.look = 0.35 + 0.15 * p.g3;
    if (p.g1 < 0.42) o.armR = 1.2 + 0.15 * p.g3;
    if (!p.kid && p.g2 < 0.24) o.armL = 1.02;
    // flinches at every strike close by: ducking, arms over heads
    for (const ft of NEAR_STRIKES) {
      const e = Math.exp(-Math.max(0, tt - ft - p.d * 0.4) / 0.45) * smooth(ft - 0.02, ft + 0.08, tt - p.d * 0.4);
      o.pitch += 0.32 * e; o.sit = Math.max(o.sit, 0.3 * e); o.armL = Math.max(o.armL, 1.5 * e); o.armR = Math.max(o.armR, 1.45 * e);
    }
    // your umbrella is hit: the ones near you spin round to look and jump back from you
    if (p.dYou < 10) {
      const k2 = smooth(YOU_HIT + 0.05 + p.d, YOU_HIT + 0.4 + p.d, tt);
      const yy = Math.atan2(YOU.x - o.x, YOU.z - o.z);
      turnTo(o, yy, k2 * 0.8);
      const away = 0.7 * k2 * smooth(10, 3, p.dYou);
      o.x += (o.x - YOU.x) / p.dYou * away; o.z += (o.z - YOU.z) / p.dYou * away;
      if (p.g1 < 0.6) o.armR = lerp(o.armR, 1.1, k2);
    }
    // then they run: after the first bolt into the sea most of the beach turns and runs (the ones round you once your
    // umbrella has been hit)
    const tr = (p.near || p.dYou < 5 ? YOU_HIT + 0.7 : JUP_RUN) + p.d * 1.8;
    if (p.g4 > 0.18 && tt > tr) {
      const c = capped(tt, tr, 6, 3 + 1.6 * p.g3, 5 + 8 * p.g1);
      run(o, p, c.d, Math.max(c.k, 0.001));
      o.stride = 1.6 * c.k;
      o.armL = p.g2 < 0.5 ? 1.5 : 0.2; o.armR = p.g2 < 0.5 ? 1.45 : 0.2; o.pitch += 0.12;
      // stopped: crouched low, arms over their heads
      o.sit = Math.max(o.sit, 0.55 * c.stop); o.pitch += 0.35 * c.stop; o.armL = lerp(o.armL, 1.55, c.stop); o.armR = lerp(o.armR, 1.5, c.stop);
    }
    // the rain: hands on heads, hunched
    const rk = smooth(JUP_RAIN + 0.2 + r * 0.6, JUP_RAIN + 0.8 + r * 0.6, tt);
    o.armL = lerp(o.armL, 1.55, rk * (p.g2 < 0.6 ? 1 : 0)); o.armR = lerp(o.armR, 1.5, rk * (p.g2 < 0.6 ? 1 : 0)); o.pitch += 0.12 * rk;
    return o;
  }
  if (key === 'mars') {
    o.look = 0.3;
    const hit = marsHit(p.f) + p.d * 0.15;                  // when the dust wall reaches them
    if (p.g1 < 0.4) o.armR = 1.15 * (1 - smooth(hit - 0.4, hit - 0.1, tt));
    // some run from it, up the beach
    const tr = 0.25 + p.d * 1.2;
    let d = 0;
    if (p.g4 > 0.45 && tt > tr) {
      d = blown(Math.min(tt, hit) - tr, 6, 4 + 2 * p.g3);
      run(o, p, d, smooth(tr, tr + 0.3, tt) * (1 - smooth(hit - 0.05, hit + 0.2, tt)));
    }
    // it reaches them: turned away from it, they drop into a crouch, arms over their heads
    const k = smooth(hit - 0.15, hit + 0.25, tt);
    if (!(p.g4 > 0.45)) turnTo(o, p.yaw + Math.PI * (p.g3 < 0.5 ? 1 : -1), k);
    o.sit = lerp(o.sit, 0.62 + 0.15 * p.g2, k); o.pitch = lerp(o.pitch, 0.62, k);
    o.armL = lerp(o.armL, 1.5, k); o.armR = lerp(o.armR, 1.45, k); o.look = lerp(o.look, -0.3, k);
    o.stride *= 1 - k;
    // shaking in the dust until the frost locks them (then still, white statues)
    const fr = smooth(-1, 1, marsFrostF(tt) > p.f ? -1 : 1);
    o.roll += 0.04 * k * Math.sin(tt * 31 + p.ph) * (1 - fr);
    return o;
  }
  if (key === 'venus') {
    // the heat hits at once: arms up over faces; then they run from the sea, some falling to a crouch
    const k = smooth(0.12 + p.d * 0.5, 0.45 + p.d * 0.5, tt);
    o.armL = 1.4 * k; o.armR = (p.g1 < 0.7 ? 1.35 : 0.1) * k; o.pitch = 0.25 * k; o.look = 0.05;
    const tr = 0.4 + p.d * 1.3;
    const falls = p.g2 < 0.2;
    const tFall = 2.2 + r * 2.2;
    if (p.g4 > 0.12 && tt > tr) {
      const c = capped(Math.min(tt, falls ? tFall : 99), tr, 6, 3 + 1.6 * p.g3, 4 + 8 * p.g1);
      run(o, p, c.d, Math.max(c.k, 0.001));
      o.stride = 1.6 * c.k * (falls ? 1 - smooth(tFall - 0.1, tFall + 0.2, tt) : 1);
      o.armL = 1.4; o.armR = p.g1 < 0.7 ? 1.3 : 0.2; o.pitch += 0.15;
      o.sit = Math.max(o.sit, 0.6 * c.stop); o.pitch += 0.4 * c.stop;
    } else backAway(o, p, (0.6 + 1.2 * p.g4) * smooth(0.3 + p.d, 2.2 + p.d, tt), k * (1 - smooth(2.0, 2.5, tt)));
    if (falls) { const f = smooth(tFall, tFall + 0.35, tt); o.sit = lerp(o.sit, 0.7, f); o.pitch = lerp(o.pitch, 0.7, f); }
    return o;
  }
  if (key === 'titan') {
    // they freeze where the front catches them: everything is held from that moment
    const tz = titanFreezeT(p);
    const t = Math.min(tt, tz);
    o.look = 0.85; o.pitch = -0.08;
    const k = smooth(0.2 + p.d, 0.7 + p.d, t);
    if (p.g1 < 0.55) { o.armL = 0.85 * k; o.armR = 0.85 * k; }
    else if (p.g1 < 0.75) o.armR = 1.5 * k;
    // they see it coming across the sea and run
    const tr = TIT_RUN + p.d * 1.4;
    if (p.g4 > 0.15 && t > tr) {
      const d = blown(t - tr, 7, 3.5 + 2 * p.g3);
      run(o, p, d, smooth(tr, tr + 0.3, t));
      o.armL = p.g2 < 0.4 ? 1.45 : 0.35; o.armR = p.g2 < 0.4 ? 1.4 : 0.35; o.pitch += 0.2;
    } else { const f = smooth(TIT_RUN, TIT_RUN + 0.6, t); o.look = lerp(o.look, 0.05, f); if (p.g3 < 0.5) o.armR = lerp(o.armR, 1.0, f); }
    return o;
  }
  if (key === 'saturn' || key === 'neptune') {
    const N = key === 'neptune';
    // the gust: lean into it (it comes from the left), faces covered, staggering right
    const k = smooth(0.05 + p.d * 0.3, 0.3 + p.d * 0.3, tt);
    o.roll = -0.28 * k; o.pitch = 0.18 * k;
    o.armL = 1.4 * k; o.armR = (p.g1 < 0.5 ? 1.3 : 0.4) * k;
    let side = (N ? 1.6 : 0.9) * smooth(0.0, 0.5, tt) * (0.6 + 0.6 * p.g4);
    o.walk = side / 0.4 * Math.PI + p.ph; o.stride = 0.9 * k * (1 - smooth(0.6, 1.0, tt));
    // knocked flat: Saturn everyone within ~1.5 s, sliding along the sand downwind; Neptune at once
    const tDown = N ? 0.6 + 1.6 * r + (p.near ? -0.3 : 0) : SAT_KNOCK + 0.1 + 1.1 * r;
    const down = smooth(tDown, tDown + 0.3, tt);
    if (down > 0) {
      o.pitch = lerp(o.pitch, 1.45, down); o.roll = lerp(o.roll, (p.g4 - 0.5) * 1.2, down);
      o.armL = lerp(o.armL, 1.6, down); o.armR = lerp(o.armR, 1.6, down); o.sit = 0;
      if (!N) {
        // sliding and rolling along the sand (the ones by the lens just go down and skid a little)
        const sl = blown(tt - tDown, 4, 2.2 + 2.2 * p.g4) * (0.25 + 0.75 * smooth(6, 12, p.f));
        side += sl;
        o.yaw += sl * (0.08 + 0.1 * p.g3) * (p.g1 < 0.5 ? 1 : -1);          // (spun round flat on the sand)
        o.roll += 0.25 * Math.sin(sl * 1.4 + p.ph);
        o.armL = 1.6 + 0.3 * Math.sin(tt * 9 + p.ph); o.armR = 1.5 + 0.3 * Math.sin(tt * 8 + p.ph * 2);
        // the second gust: as its front reaches them they're bowled over and over along the sand, a few metres, bouncing
        const tg = satFrontT(Math.atan2(p.l, p.f)) + p.d * 0.15;
        if (tt > tg) {
          const near = 0.3 + 0.7 * smooth(6, 12, p.f);
          const ex = Math.min(blown(tt - tg, 16, 6 + 3 * p.g1), 3 + 5 * p.g2) * near;
          side += ex;
          o.yaw += ex * (0.25 + 0.3 * p.g3) * (p.g1 < 0.5 ? 1 : -1);
          o.roll += 0.5 * Math.sin(ex * 1.6 + p.ph) * (1 - smooth(1.5, 3, tt - tg));
          o.pitch += 0.2 * Math.sin(ex * 1.3 + p.ph);
          o.y0bump = 0.35 * Math.abs(Math.sin(ex * 1.1 + p.ph)) * (1 - smooth(1.2, 2.5, tt - tg)) * near;
        }
      }
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
    o.y = landY(o.x) + 0.12 * down + lift + (o.y0bump || 0);
    o.y0bump = 0;
    return o;
  }
  return o;
}
