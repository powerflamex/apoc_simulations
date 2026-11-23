// The crowd on the beach and what each place does to them. Nobody resets at a wipe: every stop starts each person
// from where (and how) the last one left them (startOf), so the beach carries its story through. A person's pose is a
// pure function of (the stop, the seconds since its wipe). Positions are planned up front: thick round you and down to
// the water (some wading), thinning out along the beach; nobody between you and the lens, nobody closer than ~3.6 m
// to the lens.
//   Earth: a normal day: standing about, a few filming.
//   Mercury: they flinch from the blast of light, arms over faces, turn away; most run up the beach (the near ones a
//     short way out to the side, so they stay big in frame) and dive down; halfway some get up and run again.
//   Mars: up off the sand, hugging themselves, shivering and stamping, breath steaming; the ones near the trucks run
//     for them and crowd round; a few point at the sea skinning over. Alive and in colour.
//   Venus: they uncurl and stretch, look up at the swelling Sun, then at the cloud closing over; the hot rain: arms
//     over heads, half of them run a few steps.
//   Jupiter: cold again: hugging themselves, to the trucks or into little huddles; they look up when the cloud breaks.
//   Pluto: they look up at the black sky; arms over heads or a hand out as the liquid air rains down; frost grows over
//     them from the head down; then they freeze where they stand, and the snow piles up over them.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { landY, UMBRELLAS, LIFEGUARD, VEHICLES, CAM0, CAM_FWD, CAM_RIGHT, YOU, FACE_YAW, PIER } from './layout.js';
import { STOPS, DUR } from './timeline.js';
import { MER_FLASH, MER_RUN, MER_RUN2, MARS_CARS, MARS_ICE, VEN_CLOUD, VEN_RAIN, JUP_HUDDLE, JUP_CLEAR, PLU_RAIN, PLU_STATUE } from './sched.js';

const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085, 0xf2f2f2, 0xe8e2d0, 0xc0392b, 0x2e86c1, 0xff8c1a, 0x1abc9c];
const PANTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d, 0xe8e2d0, 0xc0392b, 0x2e86c1];
export const PEOPLE = [];
const frameOf = (x, z) => { const dx = x - CAM0.x, dz = z - CAM0.z; return { f: dx * CAM_FWD.x + dz * CAM_FWD.z, l: dx * CAM_RIGHT.x + dz * CAM_RIGHT.z }; };
const YOU_L = frameOf(YOU.x, YOU.z).l;
const OBS = [...UMBRELLAS.map((u) => [u.x, u.z, 0.5]), ...LIFEGUARD.map((l) => [l.x, l.z, 2.8]), ...VEHICLES.map((v) => [v.x, v.z, 3.0])];
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
  const place = (x, z, gap) => {
    if (Math.abs(z - PIER.z) < 12) return null;
    if (x < -16) return null;                                             // (wading, no deeper than the chest)
    const { f, l } = frameOf(x, z);
    if (f < 3.6) return null;                                             // (the lens, and nobody behind it)
    if (Math.hypot(x - YOU.x, z - YOU.z) < 1.7) return null;              // (your own room)
    if (f > 0 && f < 9 && Math.abs(l - YOU_L) < 0.7) return null;        // (straight in front of you, close)
    if (PEOPLE.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) return null;
    if (OBS.some(([ox, oz, r]) => Math.hypot(ox - x, oz - z) < r + 0.45)) return null;
    const p = add(x, z);
    if (R() < 0.09) { p.s = 0.6 + R() * 0.12; p.kid = true; }
    return p;
  };
  // a few big and close on both sides of the frame (people near you on frame 0)
  for (const [f, l] of [[3.9, 2.05], [5.2, 2.45], [6.6, 2.0], [7.4, 3.0], [5.6, -2.6], [7.9, -2.9]]) {
    const x = CAM0.x + CAM_FWD.x * f + CAM_RIGHT.x * l, z = CAM0.z + CAM_FWD.z * f + CAM_RIGHT.z * l;
    const p = add(x, z, { near: true });
    p.yaw = FACE_YAW + (l > 0 ? 0.12 : -0.12);
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
  // Mars and Jupiter: places round the three trucks (ten each), booked by the nearest people, as long as the run there
  // stays clear of you and the lens
  const segDist = (ax, az, bx, bz, px, pz) => {
    const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz + 1e-9));
    return Math.hypot(ax + vx * t - px, az + vz * t - pz);
  };
  const slots = VEHICLES.map((c) => ({ c, left: Array.from({ length: 10 }, (_, k) => k) }));
  const cand = PEOPLE.filter((p) => !p.kid && p.g3 < 0.7).map((p) => {
    let bd = 1e9;
    for (const s of slots) bd = Math.min(bd, Math.hypot(s.c.x - p.x, s.c.z - p.z));
    return { p, bd };
  }).filter((e) => e.bd < 16).sort((a, b) => a.bd - b.bd);
  for (const { p } of cand) {
    let pick = null, pd = 16;
    for (const s of slots) {
      if (!s.left.length) continue;
      const d = Math.hypot(s.c.x - p.x, s.c.z - p.z);
      if (d >= pd) continue;
      const k = s.left[0];
      const a = (k / 10) * Math.PI * 2 + 0.3, rx = 1.55, rz = 3.05;
      const ca = Math.cos(s.c.yaw), sa = Math.sin(s.c.yaw);
      const lx = Math.cos(a) * rx, lz = Math.sin(a) * rz;
      const tx = s.c.x + lx * ca + lz * sa, tz = s.c.z - lx * sa + lz * ca;
      const fr = frameOf(tx, tz);
      if (fr.f < 4) continue;
      if (segDist(p.x, p.z, tx, tz, YOU.x, YOU.z) < 1.2) continue;
      if (segDist(p.x, p.z, tx, tz, CAM0.x, CAM0.z) < 3.6) continue;
      pick = { s, tx, tz }; pd = d;
    }
    if (pick) { pick.s.left.shift(); p.truck = { x: pick.tx, z: pick.tz, faceX: pick.s.c.x, faceZ: pick.s.c.z }; }
  }
  // Jupiter: who bunches with whom (5 m cells); the centres come from where everyone is when Jupiter starts
  for (const p of PEOPLE) p.cell = `${Math.floor(p.x / 5)}:${Math.floor(p.z / 5)}`;
}

// ---- helpers ----
const blank = () => ({ x: 0, y: 0, z: 0, yaw: 0, s: 1, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.08, visible: true });
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const turnTo = (o, yaw, k) => { o.yaw += wrap(yaw - o.yaw) * k; };
const blown = (t, acc, vmax) => (t <= 0 ? 0 : t < vmax / acc ? 0.5 * acc * t * t : vmax * vmax / (2 * acc) + vmax * (t - vmax / acc));
// a run that stops after `cap` metres: { d: how far, k: 1 running .. 0 stopped, stop: 0 .. 1 once they've stopped }
function capped(tt, tr, acc, vmax, cap) {
  const t = tt - tr;
  const tStop = cap <= vmax * vmax / (2 * acc) ? Math.sqrt(2 * cap / acc) : vmax / acc + (cap - vmax * vmax / (2 * acc)) / vmax;
  const d = Math.min(blown(t, acc, vmax), cap);
  const stop = smooth(tStop - 0.1, tStop + 0.3, t);
  return { d, k: smooth(0, 0.3, t) * (1 - stop), stop };
}
// move o d metres along a heading (world dx, dz unit), legs going
function moveAlong(o, p, dx, dz, d, k, stepLen = 0.85) {
  o.x += dx * d; o.z += dz * d;
  o.y = landY(o.x);
  turnTo(o, Math.atan2(dx, dz), smooth(0, 0.25, k + (d > 0.05 ? 1 : 0)));
  o.walk = d / stepLen * Math.PI + p.ph; o.stride = 1.6 * k;
}
// running away from the sea: up the beach and out to their own side of the frame (the ones close to the camera
// straight out to the side, a short way, so they stay big in frame and nobody runs through you or the lens)
function runDir(p, o) {
  const fr = frameOf(o.x, o.z);
  const side = fr.l > YOU_L ? 1 : -1;
  let df = -0.85, dl = side * 0.52;
  if (fr.f < 10 || Math.abs(fr.l - YOU_L) < 1.6) { df = -0.12; dl = side * 0.99; }
  return [CAM_FWD.x * df + CAM_RIGHT.x * dl, CAM_FWD.z * df + CAM_RIGHT.z * dl];
}
// going to a place (x, z) from S, starting at tr; returns how far along (stop 0..1)
function goTo(o, p, S, x, z, tt, tr, vmax, k = 1) {
  const dx = x - S.x, dz = z - S.z, L = Math.hypot(dx, dz);
  if (L < 0.2) return 1;
  const c = capped(tt, tr, 4, vmax, L);
  moveAlong(o, p, dx / L, dz / L, c.d, c.k * k);
  return c.stop;
}
// cold: hugging themselves, hunched, shivering, stamping on the spot
function shiver(o, p, tt, k) {
  o.armL = lerp(o.armL, 0.6, k); o.armR = lerp(o.armR, 0.55, k); o.pitch = lerp(o.pitch, 0.18, k); o.look = lerp(o.look, -0.1, k);
  o.roll = 0.035 * Math.sin(tt * 29 + p.ph) * k;
  if (o.stride < 0.05 && p.g2 < 0.55) { o.walk = tt * 9 + p.ph; o.stride = 0.22 * k; }
}

// ---- where each stop leaves everyone ----
const KEYS = STOPS.map((s) => s.key);
function startOf(p, i) {
  if (!p.st) p.st = [];
  if (p.st[i]) return p.st[i];
  let s;
  if (i === 0) { s = blank(); s.x = p.x; s.y = p.y0; s.z = p.z; s.yaw = p.yaw; s.s = p.s; }
  else s = { ...personPose(p, KEYS[i - 1], DUR[KEYS[i - 1]]) };
  return (p.st[i] = s);
}
// Jupiter: the middle of each little group
let CELLS = null;
function cellCentre(p) {
  if (!CELLS) {
    CELLS = new Map();
    const ij = KEYS.indexOf('jupiter');
    for (const q of PEOPLE) {
      const s = startOf(q, ij);
      const c = CELLS.get(q.cell) || { x: 0, z: 0, n: 0 };
      c.x += s.x; c.z += s.z; c.n++;
      CELLS.set(q.cell, c);
    }
    for (const c of CELLS.values()) { c.x /= c.n; c.z /= c.n; }
  }
  return CELLS.get(p.cell);
}
// Pluto: when each person freezes where they stand (the near ones a little later, so you see it happen)
const pluFreezeT = (p) => PLU_STATUE + 0.4 * p.g4 + 1.0 * clamp(1 - p.f / 40);

export function personPose(p, key, tt) {
  const i = KEYS.indexOf(key);
  const S = startOf(p, i);
  const o = { ...S };
  const r = p.seed;
  o.walk = 0; o.stride = 0; o.visible = true;
  // what the last stop left (crouched, arms up...) eases out as this one takes over
  const carry = i === 0 ? 0 : 1 - smooth(0.05 + p.d * 0.5, 0.75 + p.d * 0.5, tt);
  const keep = (field, val) => { o[field] = lerp(val, S[field], carry); };
  if (key === 'earth') {
    // a normal day: standing about, a few filming the sea or pointing
    o.look = 0.1 + 0.08 * p.g3;
    if (p.g1 < 0.2) o.armR = 1.1 + 0.1 * p.g3;
    o.roll = 0.01 * Math.sin(tt * 1.3 + p.ph);
    return o;
  }
  if (key === 'mercury') {
    // the blast of light: arms over faces, half of them turn their backs on it
    const fl = smooth(MER_FLASH - 0.05 + p.d * 0.3, MER_FLASH + 0.2 + p.d * 0.3, tt);
    o.armL = lerp(S.armL, 1.45, fl); o.armR = lerp(S.armR, 1.4, fl); o.pitch = lerp(S.pitch, 0.32, fl); o.look = -0.3 * fl;
    if (p.g3 < 0.5) turnTo(o, S.yaw + Math.PI * (p.g2 < 0.5 ? 1 : -1), smooth(0.2, 0.8, tt) * 0.85);
    // most run up the beach (screaming) and dive down, arms over their heads; the rest drop where they are
    const tr = MER_RUN + p.d * 1.0;
    let down = 0;
    if (p.g4 > 0.25 && tt > tr) {
      const near = frameOf(S.x, S.z).f < 10;
      const [dx, dz] = runDir(p, S);
      const c = capped(tt, tr, 7, 3.4 + 1.8 * p.g3, near ? 1.4 + 1.0 * p.g1 : 4 + 6 * p.g1);
      moveAlong(o, p, dx, dz, c.d, Math.max(c.k, 0.001));
      o.armL = lerp(1.5, 1.55, c.stop); o.armR = lerp(p.g2 < 0.5 ? 1.45 : 0.3, 1.5, c.stop); o.pitch = 0.2 + 0.4 * c.stop;
      down = c.stop;
      // halfway (the pier going up) some get up and run again, then drop again
      const t2 = MER_RUN2 + p.d * 0.8;
      if (p.g2 < 0.45 && tt > t2) {
        const c2 = capped(tt, t2, 6, 3.0 + 1.2 * p.g1, near ? 1.2 : 3 + 3 * p.g3);
        moveAlong(o, p, dx, dz, c2.d, Math.max(c2.k, 0.001));
        down = Math.max(c2.stop, 1 - smooth(t2, t2 + 0.3, tt));
        o.pitch = lerp(0.25, 0.6, down);
      }
      if (p.g1 < 0.22) { o.pitch = lerp(o.pitch, 1.42, down); o.y += 0.1 * down; }        // (flat on the sand)
      else o.sit = 0.62 * down;
    } else {
      const k = smooth(1.0 + p.d, 1.4 + p.d, tt);
      o.sit = 0.6 * k; o.pitch += 0.3 * k; o.armL = lerp(o.armL, 1.55, k); o.armR = lerp(o.armR, 1.5, k);
    }
    return o;
  }
  if (key === 'mars') {
    // up off the sand, hugging themselves, shivering and stamping; then running for the trucks (the ones near them)
    // or pulling together
    keep('sit', 0); keep('pitch', 0.15); o.y = landY(o.x);
    if (Math.abs(S.pitch) > 1) o.y += 0.1 * carry;
    shiver(o, p, tt, smooth(0.3 + p.d, 0.9 + p.d, tt));
    if (p.truck) {
      const stop = goTo(o, p, S, p.truck.x, p.truck.z, tt, MARS_CARS + p.d * 1.6, 2.6 + 1.2 * p.g1, 0.8);
      o.armL = 0.6; o.armR = 0.55;
      if (stop > 0) { turnTo(o, Math.atan2(p.truck.faceX - o.x, p.truck.faceZ - o.z), stop * 0.8); o.pitch = 0.22; }
    }
    // a few point at the sea skinning over
    if (p.g1 < 0.15 && !p.truck) o.armR = lerp(o.armR, 1.12, smooth(MARS_ICE + 0.6 + r, MARS_ICE + 1.0 + r, tt));
    return o;
  }
  if (key === 'venus') {
    // warm again: they uncurl, stretch, look up at the swelling Sun; then up at the cloud closing over; the hot rain:
    // arms over heads, and half of them run a few steps
    keep('armL', 0.1); keep('armR', 0.1); keep('pitch', 0.0);
    o.look = lerp(S.look, 0.35 + 0.1 * p.g3, smooth(0.5 + p.d, 1.2 + p.d, tt));
    if (p.g1 < 0.3) o.armR = lerp(o.armR, 1.3, smooth(1.3 + p.d, 1.7 + p.d, tt));               // (shading their eyes)
    else if (p.g1 < 0.45) { const st = smooth(0.8 + p.d, 1.4 + p.d, tt) * (1 - smooth(2.6, 3.2, tt)); o.armL = lerp(o.armL, 1.55, st); o.armR = lerp(o.armR, 1.55, st); }  // (a stretch)
    const cl = smooth(VEN_CLOUD + 0.4 + p.d, VEN_CLOUD + 1.0 + p.d, tt);
    o.look = lerp(o.look, 0.75, cl);
    if (p.g1 > 0.8) o.armR = lerp(o.armR, 1.12, cl);                                              // (pointing up at it)
    const rk = smooth(VEN_RAIN + p.d * 0.5, VEN_RAIN + 0.35 + p.d * 0.5, tt);
    o.armL = lerp(o.armL, 1.6, rk); o.armR = lerp(o.armR, 1.55, rk); o.look = lerp(o.look, -0.2, rk); o.pitch = lerp(o.pitch, 0.25, rk);
    if (p.g4 > 0.5) {
      const tr = VEN_RAIN + 0.2 + p.d;
      if (tt > tr) {
        const [dx, dz] = runDir(p, S);
        const c = capped(tt, tr, 5, 2.6 + p.g3, frameOf(S.x, S.z).f < 10 ? 1.0 : 2.5 + 2 * p.g1);
        moveAlong(o, p, dx, dz, c.d, Math.max(c.k, 0.001));
      }
    }
    return o;
  }
  if (key === 'jupiter') {
    // cold again, worse: hugging themselves, shivering; to the trucks or into little huddles; they look up when the
    // cloud breaks
    keep('armL', 0.6); keep('armR', 0.55); o.y = landY(o.x);
    shiver(o, p, tt, smooth(0.2 + p.d, 0.7 + p.d, tt));
    o.pitch = Math.max(o.pitch, 0.22 * smooth(0.2, 0.8, tt));
    if (p.truck) {
      const stop = goTo(o, p, S, p.truck.x, p.truck.z, tt, 0.6 + p.d, 2.8 + p.g1);
      if (stop > 0) turnTo(o, Math.atan2(p.truck.faceX - o.x, p.truck.faceZ - o.z), stop * 0.8);
    } else {
      const th = JUP_HUDDLE + p.d * 1.5;
      if (tt > th) {
        const c0 = cellCentre(p);
        const dx = c0.x - S.x, dz = c0.z - S.z, L = Math.hypot(dx, dz);
        if (L > 0.3) {
          const c = capped(tt, th, 1.5, 1.0 + 0.3 * p.g3, L * 0.4);
          moveAlong(o, p, dx / L, dz / L, c.d, c.k * 0.6, 0.55);
          if (c.stop > 0) turnTo(o, Math.atan2(dx, dz), 0.3 * c.stop);
        }
      }
    }
    const lk = smooth(JUP_CLEAR + 0.6 + p.d, JUP_CLEAR + 1.2 + p.d, tt) * (1 - smooth(JUP_CLEAR + 3.0, JUP_CLEAR + 3.6, tt));
    o.look = lerp(o.look, 0.6, lk);
    if (p.g1 < 0.2) o.armR = lerp(o.armR, 1.1, lk);
    return o;
  }
  if (key === 'pluto') {
    // they look up at the black sky; arms over heads or a hand out as the liquid air rains down; the frost grows over
    // them; then they freeze where they stand
    const t = Math.min(tt, pluFreezeT(p));
    o.look = lerp(S.look, 0.85, smooth(0.2 + p.d, 0.8 + p.d, t));
    o.roll = 0.03 * Math.sin(t * 31 + p.ph) * (1 - carry);
    if (o.stride > 0.05) o.stride *= 1 - smooth(0, 0.5, t);
    const rk = smooth(PLU_RAIN + 0.3 + p.d, PLU_RAIN + 0.8 + p.d, t);
    if (p.g1 < 0.5) { o.armL = lerp(o.armL, 1.6, rk); o.armR = lerp(o.armR, 1.55, rk); o.look = lerp(o.look, 0.3, rk); }
    else if (p.g1 < 0.72) o.armR = lerp(o.armR, 0.9, rk);
    return o;
  }
  return o;
}
