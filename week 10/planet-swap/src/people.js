// The crowd on the beach and what each place does to them. Nobody resets at a wipe: every stop starts each person
// from where (and how) the last one left them (startOf), so the beach carries its story through. A person's pose is a
// pure function of (the stop, the seconds since its wipe). Positions are planned up front: thick round you and down to
// the water (some wading), thinning out along the beach; nobody between you and the lens, nobody closer than ~3.6 m
// to the lens.
//   Venus: staring and filming as the Sun swells; the heat hits: arms over faces; they run for the umbrellas and crouch
//     in the shade (each umbrella has four places, booked at load; nobody runs across you or the lens); the ones in the
//     sea duck under; the rest crouch where they are, arms over their heads.
//   Mars: they stand up, hugging themselves, shivering and stamping; then walk out of the shade toward the thin Sun;
//     the ones in the water wade out; the frost whitens them; a few point at the frozen sea.
//   Mercury: they flinch from the blast of light, arms over faces, turn away; most run up the beach and dive down,
//     arms over their heads; the rest drop where they are.
//   Jupiter: they get up slowly, look up at the dot of a Sun, then bunch together in little groups, hunched, shivering.
//   Pluto: they look up at the black sky; arms over heads as the liquid air rains down, a few holding out a hand; then
//     they freeze where they stand, a white front running up the beach, and the snow piles up over them.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { landY, UMBRELLAS, LIFEGUARD, VEHICLES, CAM0, CAM_FWD, CAM_RIGHT, YOU, FACE_YAW, PIER } from './layout.js';
import { STOPS, DUR } from './timeline.js';
import { VEN_HEAT, VEN_RUN, MARS_HUDDLE, marsFrostF, JUP_HUDDLE, PLU_RAIN, PLU_STATUE } from './sched.js';

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
  // Venus: book the shade. Each umbrella has four places round its pole; the nearest people get them, as long as the
  // run there stays clear of the lens and of you
  const slots = UMBRELLAS.map((u) => ({ u, left: [0, 1, 2, 3] }));
  const segDist = (ax, az, bx, bz, px, pz) => {
    const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz + 1e-9));
    return Math.hypot(ax + vx * t - px, az + vz * t - pz);
  };
  const order = PEOPLE.filter((p) => !p.wade && p.g4 > 0.08).map((p) => {
    let best = null, bd = 11;
    for (const s of slots) { const d = Math.hypot(s.u.x - p.x, s.u.z - p.z); if (d < bd && s.left.length) { bd = d; best = s; } }
    return { p, best, bd };
  }).filter((e) => e.best).sort((a, b) => a.bd - b.bd);
  for (const { p } of order) {
    let pick = null, pd = 11;
    for (const s of slots) {
      if (!s.left.length) continue;
      const d = Math.hypot(s.u.x - p.x, s.u.z - p.z);
      if (d >= pd) continue;
      const k = s.left[0];
      const a = k * Math.PI / 2 + s.u.seed * 6.28, r = 0.62;
      const tx = s.u.x + Math.cos(a) * r, tz = s.u.z + Math.sin(a) * r;
      const fr = frameOf(tx, tz);
      if (fr.f < 3.8) continue;
      if (segDist(p.x, p.z, tx, tz, YOU.x, YOU.z) < 1.1) continue;
      if (segDist(p.x, p.z, tx, tz, CAM0.x, CAM0.z) < 3.4) continue;
      pick = { s, k, tx, tz }; pd = d;
    }
    if (pick) { pick.s.left.shift(); p.shade = { x: pick.tx, z: pick.tz, faceU: Math.atan2(pick.s.u.x - pick.tx, pick.s.u.z - pick.tz) }; }
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
// straight out to the side, so nobody runs through you or the lens)
function runDir(p, o) {
  const fr = frameOf(o.x, o.z);
  const side = fr.l > YOU_L ? 1 : -1;
  let df = -0.85, dl = side * 0.52;
  if (fr.f < 10 || Math.abs(fr.l - YOU_L) < 1.6) { df = -0.12; dl = side * 0.99; }
  return [CAM_FWD.x * df + CAM_RIGHT.x * dl, CAM_FWD.z * df + CAM_RIGHT.z * dl];
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
    for (const q of PEOPLE) {
      const s = startOf(q, 3);
      const c = CELLS.get(q.cell) || { x: 0, z: 0, n: 0 };
      c.x += s.x; c.z += s.z; c.n++;
      CELLS.set(q.cell, c);
    }
    for (const c of CELLS.values()) { c.x /= c.n; c.z /= c.n; }
  }
  return CELLS.get(p.cell);
}
// Pluto: a white front runs up the beach from the frozen sea to you; everyone it reaches freezes in place
export const pluFrontF = (tt) => 70 - 67 * Math.pow(clamp((tt - PLU_STATUE) / 1.5), 0.8);
const pluFreezeT = (f) => PLU_STATUE + 1.5 * Math.pow(clamp((70 - f) / 67), 1 / 0.8);
export { marsFrostF };

export function personPose(p, key, tt) {
  const i = KEYS.indexOf(key);
  const S = startOf(p, i);
  const o = { ...S };
  const r = p.seed;
  o.walk = 0; o.stride = 0; o.visible = true;
  // what the last stop left (crouched, arms up...) eases out as this one takes over
  const carry = i === 0 ? 0 : 1 - smooth(0.05 + p.d * 0.5, 0.75 + p.d * 0.5, tt);
  const keep = (field, val) => { o[field] = lerp(val, S[field], carry); };
  if (key === 'venus') {
    // staring at the swelling Sun: pointing, filming, a hand shading the eyes
    o.look = 0.22 + 0.1 * p.g3;
    if (p.g1 < 0.35) o.armR = 1.15 + 0.15 * p.g3;
    else if (p.g1 < 0.55) o.armR = 1.3;                   // (shading their eyes)
    const heat = smooth(VEN_HEAT + p.d * 0.5, VEN_HEAT + 0.35 + p.d * 0.5, tt);
    o.armL = lerp(o.armL, 1.35, heat); o.armR = lerp(o.armR, p.g1 < 0.7 ? 1.3 : 0.15, heat); o.pitch = 0.2 * heat; o.look = lerp(o.look, -0.15, heat);
    const tr = VEN_RUN + p.d * 1.3;
    if (p.shade && tt > tr) {
      // to the shade: straight to their place under the umbrella, then down, facing the pole
      const L = Math.hypot(p.shade.x - p.x, p.shade.z - p.z);
      const c = capped(tt, tr, 6, 3 + 1.6 * p.g3, L);
      moveAlong(o, p, (p.shade.x - p.x) / L, (p.shade.z - p.z) / L, c.d, c.k);
      o.armL = lerp(1.4, 0.35, c.stop); o.armR = lerp(p.g1 < 0.7 ? 1.3 : 0.2, 0.3, c.stop); o.pitch = lerp(0.15, 0.25, c.stop);
      turnTo(o, p.shade.faceU, c.stop * 0.8);
      o.sit = 0.62 * c.stop;
    } else if (p.wade && tt > tr) {
      const k = smooth(tr, tr + 0.5, tt);
      o.sit = 0.75 * k; o.armL = lerp(o.armL, 0.4, k); o.armR = lerp(o.armR, 0.4, k);       // (ducking under the water)
    } else if (tt > tr + 0.4) {
      const k = smooth(tr + 0.4, tr + 0.9, tt);
      o.sit = 0.6 * k; o.pitch += 0.35 * k; o.armL = lerp(o.armL, 1.55, k); o.armR = lerp(o.armR, 1.5, k);
    }
    return o;
  }
  if (key === 'mars') {
    // up, hugging themselves, shivering and stamping
    keep('sit', 0); keep('pitch', 0.15); keep('armL', 0.55); keep('armR', 0.55); keep('look', 0.1);
    o.roll = 0.035 * Math.sin(tt * 29 + p.ph) * smooth(0.4, 1.0, tt);
    if (p.g2 < 0.5) { o.walk = tt * 9 + p.ph; o.stride = 0.22 * smooth(0.6, 1.2, tt); }
    // out of the shade, toward the thin Sun (the ones in the water wade out, up the beach)
    const tw = MARS_HUDDLE + p.d * 1.6;
    if (tt > tw) {
      const len = p.wade || S.x < 0 ? 3 + 2 * p.g3 : 1.2 + 2.2 * p.g3;
      const c = capped(tt, tw, 2, 1.1 + 0.4 * p.g1, len);
      const dir = p.wade || S.x < 0 ? -1 : 1;
      moveAlong(o, p, CAM_FWD.x * dir, CAM_FWD.z * dir, c.d, c.k * 0.6, 0.6);
      o.armL = 0.55; o.armR = 0.55;
      if (dir < 0) turnTo(o, FACE_YAW, c.stop);
    }
    // a few point at the frozen sea
    if (p.g1 < 0.18) o.armR = lerp(o.armR, 1.12, smooth(4.6 + r, 5.0 + r, tt));
    return o;
  }
  if (key === 'mercury') {
    // the blast of light: arms over faces, half of them turn their backs on it
    const fl = smooth(0.08 + p.d * 0.3, 0.3 + p.d * 0.3, tt);
    o.sit = lerp(S.sit, 0, fl); o.stride = 0;
    o.armL = lerp(S.armL, 1.45, fl); o.armR = lerp(S.armR, 1.4, fl); o.pitch = lerp(S.pitch, 0.32, fl); o.look = -0.3 * fl; o.roll = 0;
    if (p.g3 < 0.5) turnTo(o, S.yaw + Math.PI * (p.g2 < 0.5 ? 1 : -1), smooth(0.25, 0.9, tt) * 0.85);
    // most run up the beach and dive down, arms over their heads; the rest drop where they are
    const tr = 0.75 + p.d * 1.4;
    if (p.g4 > 0.3 && tt > tr) {
      const near = frameOf(S.x, S.z).f < 10;
      const [dx, dz] = runDir(p, S);
      const c = capped(tt, tr, 7, 3.2 + 1.8 * p.g3, near ? 1.6 + 1.2 * p.g1 : 4 + 6 * p.g1);
      moveAlong(o, p, dx, dz, c.d, Math.max(c.k, 0.001));
      o.armL = lerp(1.5, 1.55, c.stop); o.armR = lerp(p.g2 < 0.5 ? 1.45 : 0.3, 1.5, c.stop); o.pitch = 0.2 + 0.4 * c.stop;
      if (p.g1 < 0.22) { o.pitch = lerp(o.pitch, 1.42, c.stop); o.y += 0.1 * c.stop; }        // (flat on the sand)
      else o.sit = 0.62 * c.stop;
    } else {
      const k = smooth(1.0 + p.d, 1.4 + p.d, tt);
      o.sit = 0.6 * k; o.pitch += 0.3 * k; o.armL = lerp(o.armL, 1.55, k); o.armR = lerp(o.armR, 1.5, k);
    }
    return o;
  }
  if (key === 'jupiter') {
    // up slowly, looking up at the dot of a Sun, then hugging themselves
    const up = smooth(0.4 + p.d, 1.6 + p.d, tt);
    o.sit = lerp(S.sit, 0, up); o.pitch = lerp(S.pitch, 0.22, up); o.y = landY(o.x);
    o.armL = lerp(S.armL, 0.55, up); o.armR = lerp(S.armR, p.g1 < 0.3 ? 1.1 : 0.55, up);
    o.look = 0.45 * up * (1 - smooth(3.5, 4.5, tt)) - 0.15 * smooth(3.5, 4.5, tt);
    o.roll = 0.03 * Math.sin(tt * 31 + p.ph) * up;
    if (p.g1 < 0.3) o.armR = lerp(o.armR, 0.55, smooth(3.0, 3.6, tt));
    // they bunch together in little groups (a third of the way in toward each group's middle)
    const th = JUP_HUDDLE + 0.4 + p.d * 1.5;
    if (tt > th) {
      const c0 = cellCentre(p);
      const dx = c0.x - S.x, dz = c0.z - S.z, L = Math.hypot(dx, dz);
      if (L > 0.3) {
        const c = capped(tt, th, 1.5, 0.9 + 0.3 * p.g3, L * 0.36);
        moveAlong(o, p, dx / L, dz / L, c.d, c.k * 0.5, 0.55);
        if (c.stop > 0) turnTo(o, Math.atan2(dx, dz), 0.3 * c.stop);
      }
    }
    return o;
  }
  if (key === 'pluto') {
    // they freeze where the white front reaches them: everything is held from that moment
    const t = Math.min(tt, pluFreezeT(frameOf(S.x, S.z).f));
    keep('sit', 0); keep('pitch', 0.12); keep('armL', 0.55); keep('armR', 0.55);
    o.look = lerp(S.look, 0.85, smooth(0.2 + p.d, 0.8 + p.d, t));
    o.roll = 0.03 * Math.sin(t * 31 + p.ph) * (1 - carry);
    const rk = smooth(PLU_RAIN + 0.3 + p.d, PLU_RAIN + 0.8 + p.d, t);
    if (p.g1 < 0.55) { o.armL = lerp(o.armL, 1.6, rk); o.armR = lerp(o.armR, 1.55, rk); o.look = lerp(o.look, 0.3, rk); }
    else if (p.g1 < 0.75) o.armR = lerp(o.armR, 0.85, rk);
    return o;
  }
  return o;
}
