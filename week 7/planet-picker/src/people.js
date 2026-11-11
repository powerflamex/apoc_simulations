// The people on the beach, and what each planet does to them (video time v throughout).
//   A packed beach at night: everyone stands facing the sea, looking up at whatever sits where the Moon was; a few
//   sit on towels. How much they react grows with the planet ("awe"): under the Moon most arms are down; at Mars some
//   point and a few phones go up; at Venus they shade their eyes; at Neptune the ones sitting get to their feet, more
//   phones; at Saturn arms go up over heads; at Jupiter (frame 0, and again at the end) all of it at once.
//   The ending: as the sea starts climbing the beach everyone turns and runs inland, past you. Every path is planned
//   up front: straight inland, stepping around the line the camera backs up along, the umbrella poles and the
//   lifeguard towers, nobody running into anybody. A few keep filming until the wall is coming, then run too late.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { landY, UMBRELLAS, LIFEGUARD, PALMS, CAM0, camFront, PIER, PLANET_POS } from './layout.js';
import { LAND, STOPS, stopAt, T_WALL, CAM_END_X } from './timeline.js';

const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085, 0xf2f2f2, 0xe8e2d0, 0xc0392b, 0x2e86c1];
const PANTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d, 0xe8e2d0];
export const PEOPLE = [];

const BR = PLANET_POS.b * Math.PI / 180;
const FACE = Math.atan2(-Math.cos(BR), -Math.sin(BR));          // the yaw that faces the planet
// the line the camera moves on: forward from its start along its own bearing (Neptune, Saturn), then straight back
// inland from there (the ending)
export const CAM_FWD = 9.1;                                      // how far it walks toward the water (m)
export const CAM_LOW = camFront(CAM_FWD, 0);                     // where it stands at Saturn and when Jupiter lands
export function camPath(x) {                                     // z on that line at x
  return x >= CAM0.x ? CAM_LOW.z : x <= CAM_LOW.x ? CAM_LOW.z : CAM0.z + (CAM_LOW.z - CAM0.z) * (CAM0.x - x) / (CAM0.x - CAM_LOW.x);
}
const offLine = (x, z) => {                                      // metres to the nearer of the two legs of the camera's line
  const a = Math.abs(z - (CAM0.z + (CAM_LOW.z - CAM0.z) * clamp((CAM0.x - x) / (CAM0.x - CAM_LOW.x)))) + Math.max(0, CAM_LOW.x - x, x - CAM0.x);
  const b = Math.abs(z - CAM_LOW.z) + Math.max(0, CAM_LOW.x - x, x - CAM_END_X - 3);
  return Math.min(a, b);
};
const OBS = [...UMBRELLAS.map((u) => [u.x, u.z, 0.45]), ...LIFEGUARD.map((l) => [l.x, l.z, 2.6]), ...PALMS.filter((t) => t.x < 200).map((t) => [t.x, t.z, 0.45])];
for (let x = CAM_LOW.x; x <= CAM_END_X + 2; x += 2.5) OBS.push([x, CAM_LOW.z, 1.35]);       // the camera, backing up
// the ones who keep filming (x, z): standing in front of where the camera ends up
const FILMERS = [[37.6, 0.9], [35.2, -4.6], [33.0, 1.8], [31.2, -4.0], [38.6, -4.9]];
{
  const R = rng(2025);
  const add = (o) => {
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    const sleeves = R() < 0.6;
    PEOPLE.push({ yaw: FACE + (R() - 0.5) * 0.5, s: 0.92 + R() * 0.14, seed: R(), ph: R() * 6.28, g1: R(), g2: R(), g3: R(),
      col: [TOPS[Math.floor(R() * TOPS.length)], PANTS[Math.floor(R() * PANTS.length)], skin, HAIR[Math.floor(R() * HAIR.length)], sleeves], type: 'stand', ...o });
    return PEOPLE[PEOPLE.length - 1];
  };
  // right around you (metres ahead of the opening camera, metres to its right): shoulders at the edges of the frame,
  // more and more of them down to the water; the middle of the frame stays open (you walk down it at Neptune)
  const near = [
    [3.9, -1.05, 'stand'], [4.4, 1.12, 'stand'], [4.9, -1.9, 'stand'], [5.4, 1.95, 'stand'], [5.9, -0.95, 'stand'], [6.6, 2.35, 'stand'],
    [6.9, -2.3, 'stand'], [7.6, -1.2, 'stand'], [8.3, 0.95, 'stand'], [8.6, 2.9, 'stand'], [9.0, -2.9, 'stand'], [9.6, -1.0, 'stand'],
    [10.2, 0.85, 'stand'], [10.9, -1.8, 'stand'], [11.6, 1.9, 'stand'], [12.2, -0.8, 'stand'], [12.9, 0.95, 'stand'], [13.3, 1.6, 'kid'],
    [14.0, -1.5, 'stand'], [14.8, 0.8, 'stand'], [15.5, -0.9, 'stand'], [16.4, 2.2, 'stand'],
  ];
  near.forEach(([r, l, type]) => {
    if (Math.hypot(r - CAM_FWD, l) < 2.9 && !(r > CAM_FWD + 2 && Math.abs(l) < 1.6)) return;   // (the same room round that spot)
    const c = camFront(r, l);
    const p = add({ x: c.x, z: c.z, near: true, type: type === 'sit' ? 'sit' : 'stand' });
    p.yaw = FACE + (l > 0 ? 0.12 : -0.12) + (R() - 0.5) * 0.2;
    if (type === 'kid') { p.s = 0.64; p.kid = true; }
  });
  PEOPLE[0].g1 = 0.05; PEOPLE[0].g2 = 0.9;       // (the two at the frame's edges: one points, one films)
  PEOPLE[1].g1 = 0.9; PEOPLE[1].g2 = 0.02;
  FILMERS.forEach(([x, z], k) => { const p = add({ x, z, filmer: true }); p.g2 = 0.01; p.stayPut = k === 1 || k === 4; });
  // the rest of the beach: packed around you and down to the water (a person every couple of square metres), thinning
  // out along the beach. Nobody stands on the line the camera moves along.
  const place = (x, z, gap) => {
    if (Math.abs(z - PIER.z) < 12) return;
    if (offLine(x, z) < (x > CAM0.x ? 1.25 : 0.8)) return;
    if (Math.hypot(x - CAM0.x, z - CAM0.z) < 3.7) return;
    {   // (room round the spot where you stop at Saturn: you turn right round there, and nobody should fill the frame)
      const dx = x - CAM_LOW.x, dz = z - CAM_LOW.z, d = Math.hypot(dx, dz);
      const ahead = (-dx * Math.cos(BR) - dz * Math.sin(BR)) / Math.max(d, 1e-3);      // 1 = straight toward the planet
      if (d < (ahead > 0.8 ? 2.3 : 2.9)) return;
    }
    if (PEOPLE.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) return;
    if (OBS.some(([ox, oz, r]) => r < 1.3 && Math.hypot(ox - x, oz - z) < r + 0.6) || LIFEGUARD.some((l) => Math.hypot(l.x - x, l.z - z) < 3.4)) return;
    const p = add({ x, z, type: x > 6 && Math.hypot(x - CAM0.x, z) > 14 && R() < 0.12 ? 'sit' : 'stand' });
    if (R() < 0.08) { p.s = 0.6 + R() * 0.12; p.kid = true; }
  };
  for (let k = 0; k < 3600 && PEOPLE.length < 900; k++) place(-2.5 + R() * 58, -30 + R() * 58, 1.12);
  for (let k = 0; k < 9000 && PEOPLE.length < 1150; k++) {
    const x = -2.5 + R() * 150, z = -300 + R() * 560;
    if (R() > 0.1 + 0.9 * Math.exp(-Math.hypot(x - 16, z + 1) / 55)) continue;
    place(x, z, 0.95);
  }
  // the flight: when, how fast, and a lane straight inland that misses everything
  const J = LAND.jupiter;
  for (const p of PEOPLE) {
    const r = p.seed;
    p.d = 0.05 + r * 0.25;                                   // how long after a landing they react
    p.tUp = LAND.neptune + 0.3 + r * 1.6;                    // the ones sitting get up at Neptune
    // the ones up the beach have room and go first; the ones by the water are stuck behind them and get going later,
    // so people keep streaming past you while the sea climbs
    p.tRun = J + 1.4 + (1 - clamp(p.x / 45)) * 2.6 * (0.35 + 0.65 * ((r * 7) % 1)) + 0.5 * ((r * 11) % 1);
    if (p.filmer) p.tRun = p.stayPut ? 1e9 : T_WALL + 0.7 + 1.3 * ((r * 5) % 1);
    p.ur = 5.4 + 1.5 * ((r * 13) % 1) - (p.kid ? 1.2 : 0);
    p.rx = p.x; p.rz = p.z;
    let lane = p.z, ok = false;
    for (let tries = 0; tries < 14 && !ok; tries++) {
      ok = !OBS.some(([ox, oz, rr]) => ox > p.x - 1 && Math.abs(oz - lane) < rr + 0.55)
        && !PEOPLE.some((q) => q.filmer && q !== p && q.x > p.x - 0.5 && Math.abs(q.z - lane) < 0.9);
      if (!ok) lane = p.z + (tries % 2 ? -1 : 1) * (0.9 + 0.55 * tries);
    }
    p.lane = lane;
    if (!ok) p.tRun = 1e9;
  }
  // nobody catches up with someone in the same lane: the one behind is held to the speed of the one ahead
  const order = [...PEOPLE].filter((p) => p.tRun < 1e8).sort((a, b) => b.x - a.x);
  for (const p of order) for (const o of order) {
    if (o === p || o.x <= p.x || Math.abs(o.lane - p.lane) > 0.9) continue;
    const gap = o.x - p.x;
    const tAt = (q, x) => q.tRun + 0.35 + (x - q.x) / q.ur;    // (roughly) when q reaches x
    if (tAt(p, o.x + 5) < tAt(o, o.x + 5) + 0.4) p.ur = Math.min(p.ur, Math.max(3.0, (o.x + 5 - p.x) / Math.max(0.4, tAt(o, o.x + 5) + 0.4 - p.tRun - 0.35)));
    if (gap < 1.2) p.tRun = Math.min(Math.max(p.tRun, o.tRun + 0.3), J + 5.2);
  }
}

// how much each stop's planet stirs them
const AWE = { moon0: 0.1, jup0: 1.0, moon: 0.1, mars: 0.45, venus: 0.62, neptune: 0.82, saturn: 1.0, jupiter: 1.0 };
function gesture(p, id, out) {
  const A = AWE[id];
  let armL = 0, armR = 0, phone = 0;
  if (id === 'venus' && p.g1 < 0.62) armR = 1.3;                    // a hand up against the glare
  else if (p.g1 < 0.44 * A) armR = 1.2 + 0.1 * p.g3;                // pointing up at it
  if (!p.kid && p.g2 < 0.1 + 0.32 * A) { armL = 1.02; phone = 1; }  // filming it
  if (A >= 0.95 && p.g3 < 0.3 && !phone) { armL = 1.5; armR = 1.55; }   // both arms up, hands to the head
  out.armL = armL; out.armR = armR; out.phone = phone;
  out.look = 0.1 + 0.42 * A; out.pitch = -0.05 * A;
  return out;
}
const GA = {}, GB = {};

// how far along its run (m inland) person p is at time v
function runX(p, v) {
  const tr = v - p.tRun;
  if (tr <= 0) return 0;
  return tr < 0.7 ? p.ur * tr * tr / 1.4 : p.ur * (tr - 0.35);
}
export function personPose(p, v) {
  const o = { x: p.x, y: 0, z: p.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.05, phone: 0 };
  // ---- running inland (the ending) ----
  if (v >= p.tRun) {
    const d = runX(p, v);
    const x = p.rx + d;
    const z = lerp(p.rz, p.lane, smooth(0, 4, d));           // into the lane (sideways) over the first metres
    if (x > 222) return { visible: false };                  // (into the hotels' doors)
    o.x = x; o.z = z;
    o.y = landY(x, z);
    const turn = smooth(p.tRun - 0.05, p.tRun + 0.35, v);
    let dy = Math.PI / 2 - p.yaw; dy -= 2 * Math.PI * Math.round(dy / (2 * Math.PI));
    o.yaw = p.yaw + dy * turn + (p.lane - p.rz) * 0.05 * (1 - smooth(3, 5, d));
    const tr = v - p.tRun;
    o.walk = p.ph + d / 1.15 * Math.PI;
    o.stride = 1.6 * clamp(tr / 0.7);
    o.armL = p.g1 < 0.3 ? 1.45 : 0; o.armR = p.g3 < 0.2 ? 1.3 : 0;
    o.pitch = 0.12;
    return o;
  }
  // ---- standing (or sitting) where they are, looking up ----
  o.y = landY(o.x, o.z);
  if (p.type === 'sit') { const up = smooth(p.tUp, p.tUp + 0.9, v); o.sit = 1 - up; o.y -= 0.45 * (1 - up); }
  const i = stopAt(v);
  const a = gesture(p, STOPS[Math.max(0, i - 1)].id, GA), b = gesture(p, STOPS[i].id, GB);
  // (Jupiter at frame 0: some arms are already up, the rest go up over the first second and a half)
  const d = STOPS[i].id === 'jup0' && p.g3 > 0.4 ? 0.9 + 1.6 * p.seed : p.d;
  const k = i === 0 ? 1 : smooth(STOPS[i].land + d, STOPS[i].land + d + 0.45, v);
  o.armL = lerp(a.armL, b.armL, k) + (b.phone ? 0.02 * Math.sin(v * 1.1 + p.ph) : 0);
  o.armR = lerp(a.armR, b.armR, k) + 0.03 * Math.sin(v * 1.7 + p.ph * 2);
  o.look = lerp(a.look, b.look, k);
  o.pitch = lerp(a.pitch, b.pitch, k);
  o.phone = lerp(a.phone, b.phone, k);
  // the flinch at each landing (bigger for the bigger planets), then a slow sway
  const fl = Math.exp(-Math.max(0, v - STOPS[i].land - p.d) / 0.35) * smooth(STOPS[i].land + p.d - 0.02, STOPS[i].land + p.d + 0.08, v) * AWE[STOPS[i].id];
  o.pitch -= 0.07 * fl;
  o.roll = 0.012 * Math.sin(v * 0.9 + p.ph);
  // the ending: the ones still standing watch the water come; the filmers keep their phones on it
  if (p.filmer) { const f = smooth(LAND.jupiter + 0.4, LAND.jupiter + 1.2, v); o.armL = lerp(o.armL, 1.05, f); o.phone = Math.max(o.phone, f); o.armR = lerp(o.armR, 0.1, f); o.look = lerp(o.look, 0.2, smooth(T_WALL - 6, T_WALL - 3, v)); }
  return o;
}
