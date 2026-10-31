// The people on the beach, and what each star does to them (video time v throughout).
//   Before: lying on towels, sitting on the sand or in chairs, standing in groups, walking along the water, a few
//   right next to you.
//   Proxima (the cold): they look up, the ones lying down sit up, everyone hugs themselves and shivers; frost forms on
//   them; their breath freezes (white puffs, world.js).
//   Sirius (the glare): an arm up over the eyes, they turn away, and run inland: up the beach, past you, across the bike
//   path and the road into the city (they go in where the hotels are, behind you). Every path is planned up front:
//   straight inland, stepping around you, the umbrella poles and the lifeguard towers, nobody running into anybody.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { landY, UMBRELLAS, LIFEGUARD, PALMS, CAM0, camFront, PIER } from './layout.js';
import { LAND } from './timeline.js';

const SWIM = [0xd7263d, 0x1b998b, 0xf46036, 0x2e294e, 0xc5d86d, 0x111111, 0xe8e8e8, 0xff6fb5, 0x2f6db5, 0xf3c623, 0x7b2cbf, 0x0b7a75];
const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085];
const SHORTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d];
export const PEOPLE = [];

// the camera when they run past (it creeps toward the sea)
const CAMR = { x: CAM0.x - 1.2, z: CAM0.z - 0.28 };
const OBS = [...UMBRELLAS.map((u) => [u.x, u.z, 0.45]), ...LIFEGUARD.map((l) => [l.x, l.z, 2.6]), ...PALMS.filter((t) => t.x < 200).map((t) => [t.x, t.z, 0.45]), [CAMR.x, CAMR.z, 1.4]];
{
  const R = rng(2024);
  const add = (o) => {
    const swim = R() < 0.55;
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    const top = swim ? skin : TOPS[Math.floor(R() * TOPS.length)];
    const pants = swim ? SWIM[Math.floor(R() * SWIM.length)] : SHORTS[Math.floor(R() * SHORTS.length)];
    PEOPLE.push({ yaw: -Math.PI / 2 + (R() - 0.5) * 1.2, s: 0.92 + R() * 0.14, seed: R(), ph: R() * 6.28, col: [top, pants, skin, HAIR[Math.floor(R() * HAIR.length)], !swim], ...o });
  };
  // right next to you: a couple standing, someone sitting on a towel, a kid
  const near = [
    [3.6, 1.05, 'stand', -2.6], [3.9, 1.5, 'stand', 0.4], [5.8, 2.1, 'sit', -1.3], [6.6, -1.7, 'stand', -1.7], [7.4, -2.5, 'lie', 0.4],
    [9.5, 1.3, 'sit', -1.8], [10.2, 2.2, 'stand', -2.2], [12.4, -1.1, 'lie', 1.9], [13.0, 3.6, 'stand', -1.2], [15.2, 2.6, 'sit', -1.6],
    [17, -3.2, 'stand', -1.4], [19, 1.4, 'stand', -1.0], [21, -0.4, 'walk', 0], [24, 3.0, 'sit', -1.5], [27, -2.8, 'stand', -1.9],
  ];
  near.forEach(([r, l, type, yaw], k) => {
    const c = camFront(r, l);
    add({ x: c.x, z: c.z, type, near: true, ...(type === 'walk' ? { ux: 0, uz: -1.2 } : {}) });
    PEOPLE[PEOPLE.length - 1].yaw = yaw;
    if (k === 2 || k === 4) PEOPLE[PEOPLE.length - 1].s = 0.98;
  });
  PEOPLE[2].s = 0.62; PEOPLE[2].kid = true;      // (the kid next to the couple sits on the towel)
  // the rest of the beach: towels and groups out to ~250 m along the beach, people at the water's edge
  for (let k = 0; k < 2400 && PEOPLE.length < 230; k++) {
    const x = 6 + R() * 150, z = -300 + R() * 560;
    const dc = Math.hypot(x - CAM0.x, z - CAM0.z);
    if (dc < 6 || Math.abs(z - PIER.z) < 12) continue;
    if (R() > 0.2 + 0.8 * Math.exp(-dc / 80)) continue;
    if (PEOPLE.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6)) continue;
    if (OBS.some(([ox, oz, r]) => Math.hypot(ox - x, oz - z) < r + 0.6)) continue;
    const w = x < 16;
    const type = w ? (R() < 0.5 ? 'walk' : 'stand') : R() < 0.35 ? 'lie' : R() < 0.55 ? 'sit' : R() < 0.85 ? 'stand' : 'walk';
    add({ x, z, type, ...(type === 'walk' ? { ux: 0, uz: (R() < 0.5 ? -1 : 1) * (1.0 + R() * 0.5) } : {}) });
    if (w) PEOPLE[PEOPLE.length - 1].yaw = -Math.PI / 2 + (R() - 0.5) * 0.6;
  }
  // the flight: when, how fast, and a lane straight inland that misses everything
  for (const p of PEOPLE) {
    const r = p.seed;
    p.tReact = LAND.sirius + 0.12 + r * 0.35;
    p.tRun = p.tReact + (p.type === 'lie' ? 1.0 : p.type === 'sit' ? 0.6 : 0.3) + 0.3 * ((r * 7) % 1);
    p.ur = 5.2 + 1.6 * ((r * 13) % 1) - (p.kid ? 1.0 : 0);
    // where they are when they start running (walkers have moved on)
    p.stopV = LAND.proxima + 0.4 + r * 0.6;
    const wz = p.type === 'walk' ? p.z + p.uz * (p.stopV + 10.3) : p.z;
    p.rx = p.x; p.rz = wz;
    // the lane: shift it sideways until nothing is in the way
    let lane = wz, ok = false;
    for (let tries = 0; tries < 12 && !ok; tries++) {
      ok = !OBS.some(([ox, oz, rr]) => ox > p.x - 1 && Math.abs(oz - lane) < rr + 0.55);
      if (!ok) lane = wz + (tries % 2 ? -1 : 1) * (0.9 + 0.6 * tries);
    }
    p.lane = lane;
    if (!ok) p.stay = true;
  }
  // nobody catches up with someone in the same lane: the one behind is held to the speed of the one ahead
  const order = [...PEOPLE].sort((a, b) => b.x - a.x);
  for (const p of order) for (const o of order) {
    if (o === p || o.x <= p.x || Math.abs(o.lane - p.lane) > 0.9) continue;
    const gap = o.x - p.x;
    const tAt = (q, x) => q.tRun + 0.35 + (x - q.x) / q.ur;    // (roughly) when q reaches x
    if (tAt(p, o.x + 5) < tAt(o, o.x + 5) + 0.4) p.ur = Math.min(p.ur, Math.max(2.5, (o.x + 5 - p.x) / Math.max(0.4, tAt(o, o.x + 5) + 0.4 - p.tRun - 0.35)));
    if (gap < 1.2) p.tRun = Math.max(p.tRun, o.tRun + 0.3);
  }
}

// how far along its run (m inland) person p is at time v
function runX(p, v) {
  const tr = v - p.tRun;
  if (tr <= 0) return 0;
  return tr < 0.7 ? p.ur * tr * tr / 1.4 : p.ur * (tr - 0.35);
}
export function personPose(p, v) {
  const o = { x: p.x, y: 0, z: p.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.05 };
  // ---- before Sirius ----
  const cold = smooth(LAND.proxima + 0.1, LAND.proxima + 1.2, v) * (1 - smooth(LAND.sirius, LAND.sirius + 0.8, v));
  const run = !p.stay && v >= p.tRun;
  if (!run) {
    if (p.type === 'walk') {
      // walking along the water; they stop when the cold hits
      const stopV = p.stopV;
      const tw = Math.min(v, stopV) + 10 + (v > stopV ? 0.3 * (1 - Math.exp(-(v - stopV) / 0.3)) : 0);
      o.z = p.z + p.uz * tw;
      o.yaw = Math.atan2(0, p.uz);
      o.walk = p.ph + tw * Math.abs(p.uz) / 0.72 * Math.PI;
      o.stride = v < stopV ? 1 : 0;
    }
    o.y = landY(o.x, o.z);
    if (p.type === 'lie') {
      const up = smooth(LAND.proxima + 0.5 + p.seed * 0.5, LAND.proxima + 1.6 + p.seed * 0.5, v);   // they sit up, cold
      o.pitch = -Math.PI / 2 * (1 - up);
      o.y += 0.13 * (1 - up) - 0.45 * up;
      o.sit = up;
    }
    if (p.type === 'sit') { o.sit = 1; o.y -= 0.45; }
    // the look up at the sky as it goes dark; then hugging themselves, shivering
    o.look = lerp(0.05, 0.45, smooth(LAND.proxima + 0.05, LAND.proxima + 0.5, v) * (1 - smooth(LAND.proxima + 1.6, LAND.proxima + 2.6, v)));
    if (cold > 0) {
      o.armL = lerp(o.armL, 0.62, cold); o.armR = lerp(o.armR, 0.58, cold);
      o.pitch += 0.12 * cold * (p.type === 'stand' || p.type === 'walk' ? 1 : 0.5);
      const sh = Math.sin(v * 38 + p.ph * 5) * 0.012 * cold;
      o.roll = sh; o.x += sh * 0.6;
      o.look -= 0.15 * cold;
    }
    // Sirius: the flinch (an arm over the eyes, ducking away)
    const fl = smooth(p.tReact, p.tReact + 0.25, v);
    if (fl > 0) {
      o.armL = lerp(o.armL, 1.35, fl); o.armR = lerp(o.armR, 1.45, fl);
      o.pitch += 0.2 * fl; o.look = lerp(o.look, -0.2, fl);
      if (p.type === 'lie') { const up = smooth(p.tReact + 0.1, p.tRun, v); o.sit = 1 - up; o.y = landY(o.x, o.z) - 0.45 * (1 - up); }
      if (p.type === 'sit') { const up = smooth(p.tReact + 0.1, p.tRun, v); o.sit = 1 - up; o.y = landY(o.x, o.z) - 0.45 * (1 - up); }
    }
    return o;
  }
  // ---- running inland ----
  const d = runX(p, v);
  const x = p.rx + d;
  // into the lane (sideways) over the first metres
  const z = lerp(p.rz, p.lane, smooth(0, 4, d));
  if (x > 222) return { visible: false };                    // (into the hotels' doors)
  o.x = x; o.z = z;
  o.y = landY(x, z);
  const turn = smooth(p.tRun - 0.05, p.tRun + 0.35, v);
  let dy = Math.PI / 2 - p.yaw; dy -= 2 * Math.PI * Math.round(dy / (2 * Math.PI));
  o.yaw = p.yaw + dy * turn + (p.lane - p.rz) * 0.05 * (1 - smooth(3, 5, d));
  const tr = v - p.tRun;
  o.walk = p.ph + d / 1.15 * Math.PI;
  o.stride = 1.6 * clamp(tr / 0.7);
  o.armL = p.seed < 0.7 ? 1.45 : 0; o.armR = p.seed > 0.55 && p.seed < 0.7 ? 1.3 : 0;
  o.pitch = 0.12;
  return o;
}
