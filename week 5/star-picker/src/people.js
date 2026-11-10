// The people on the beach, and what each star does to them (video time v throughout).
//   Arcturus (frame 0): everyone squints up at the giant disc, a hand up against the glare; the ones lying down sit up.
//   Before it: lying on towels, sitting on the sand or in chairs, standing in groups, walking along the water, a few
//   right next to you.
//   Proxima (the cold): they look up, the ones lying down sit up, everyone hugs themselves and shivers; frost forms on
//   them; their breath freezes (white puffs, world.js).
//   Sirius (the glare): an arm up over the eyes, they turn away; the ones near you run to the umbrellas' shade (and at
//   Vega on into the sea), the rest run inland: up the beach, past you, across the bike path and the road into the
//   city (they go in where the hotels are, behind you). Every path is planned up front: straight inland, stepping
//   around you, the umbrella poles and the lifeguard towers, nobody running into anybody.
//   Aldebaran: the last few, under two umbrellas toward the pier, run at you as they catch fire. Rigel: only you.
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
    p.stopV = LAND.arcturus + 0.3 + r * 0.6;            // (walkers stop as Arcturus's heat hits)
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

// who shelters where: at Sirius the people near you run to the nearest umbrella (up to 4 under each) and crouch in its
// shade; at Vega, as those umbrellas catch fire, they run past you into the sea. A few under two umbrellas between you
// and the pier stay put until Aldebaran, when their umbrellas catch fire with the pier burning behind them, and they
// run toward you: the last ones on the beach. Everyone else runs inland at Sirius (as before). At Rigel only you are
// left, standing at the edge of the drained sea.
export let LAST_B = 100;
const CAM_ALD = { x: CAM0.x - 12, z: CAM0.z - 12 * Math.tan(CAM0.b * Math.PI / 180) };   // (main.js: XX at Aldebaran)
{
  const used = new Map();
  const take = (u) => { const n = used.get(u) || 0; used.set(u, n + 1); const a = n * Math.PI / 2 + u.seed * 6; return { x: u.x + Math.cos(a) * 0.8, z: u.z + Math.sin(a) * 0.8, u }; };
  // the last few: the two umbrellas nearest a spot 45 m from you toward the pier, and the people round them
  const spot = { x: CAM_ALD.x + 18, z: CAM_ALD.z - 42 };
  const lastU = UMBRELLAS.filter((u) => !u.near).sort((a, b) => Math.hypot(a.x - spot.x, a.z - spot.z) - Math.hypot(b.x - spot.x, b.z - spot.z)).slice(0, 2);
  lastU.forEach((u) => { u.late = true; });
  const mx = (lastU[0].x + lastU[1].x) / 2, mz = (lastU[0].z + lastU[1].z) / 2;
  LAST_B = Math.atan2(-(mz - CAM_ALD.z), -(mx - CAM_ALD.x)) * 180 / Math.PI;     // their bearing from the camera
  const cand = PEOPLE.filter((p) => !p.near && p.type !== 'walk').sort((a, b) => Math.hypot(a.x - spot.x, a.z - spot.z) - Math.hypot(b.x - spot.x, b.z - spot.z)).slice(0, 5);
  cand.forEach((p, k) => { p.last = true; p.shadeAt = take(lastU[k % 2]); });
  // the people near you: to the nearest umbrella within 14 m
  const shadeU = UMBRELLAS.filter((u) => !u.late && Math.hypot(u.x - CAM0.x, u.z - CAM0.z) < 50);
  for (const p of PEOPLE) {
    if (p.last || Math.hypot(p.x - CAM0.x, p.z - CAM0.z) > 38) continue;
    let best = null, bd = 14;
    for (const u of shadeU) { const d = Math.hypot(u.x - p.x, u.z - p.z); if (d < bd && (used.get(u) || 0) < 4) { bd = d; best = u; } }
    if (!best) continue;
    best.shade = true;
    p.shadeAt = take(best);
  }
  for (const p of PEOPLE) {
    if (!p.shadeAt) continue;
    p.stay = false;
    p.ur = Math.min(p.ur, 4.6);
    if (p.last) {
      // away from the fire, toward you and past you (a little to one side of the camera)
      p.tFlee = LAND.aldebaran + 1.1 + p.seed * 0.7;
      const side = (p.seed < 0.5 ? -1 : 1) * (2.5 + 2 * p.seed);
      p.fleeTo = { x: CAM_ALD.x + 6 + 3 * p.seed, z: CAM_ALD.z + side + 25 };
    } else {
      // into the sea, straight out from the umbrella (kept off the line the camera walks down)
      p.tSea = LAND.vega + 0.35 + p.seed * 0.7;
      const camZ = (x) => CAM0.z - (CAM0.x - x) * Math.tan(CAM0.b * Math.PI / 180);
      let z = p.shadeAt.z;
      if (Math.abs(z - camZ(p.shadeAt.x)) < 1.6) z = camZ(p.shadeAt.x) + (z >= camZ(p.shadeAt.x) ? 1.6 : -1.6);
      p.seaTo = { x: -9, z };
    }
  }
}
// "you", alone in front of the camera at Rigel, looking at the star over the drained sea
export const YOU = { x: CAM0.x - 16 - 3.6 * Math.cos(CAM0.b * Math.PI / 180), z: CAM0.z - 16 * Math.tan(CAM0.b * Math.PI / 180) - 3.6 * Math.sin(CAM0.b * Math.PI / 180), you: true };
PEOPLE.push({ ...YOU, type: 'stand', yaw: Math.atan2(-Math.cos(CAM0.b * Math.PI / 180), -Math.sin(CAM0.b * Math.PI / 180)), s: 1.0, seed: 0.5, ph: 0, col: [0xd62828, 0x1d3557, SKIN[1], HAIR[1], true] });

// along a straight leg from a to b, starting at t0 at speed sp (m/s): { x, z, d, moving, yaw }
function leg(a, b, t0, sp, v) {
  const L = Math.hypot(b.x - a.x, b.z - a.z), d = clamp((v - t0) * sp, 0, L), k = L > 0 ? d / L : 1;
  return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), d, moving: v > t0 && d < L, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

// how far along its run (m inland) person p is at time v
function runX(p, v) {
  const tr = v - p.tRun;
  if (tr <= 0) return 0;
  return tr < 0.7 ? p.ur * tr * tr / 1.4 : p.ur * (tr - 0.35);
}
export function personPose(p, v) {
  const o = { x: p.x, y: 0, z: p.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.05 };
  if (p.you) {
    // you: hidden until the whip to Rigel, then standing at the edge, an arm up against the glare, looking up at it
    if (v < LAND.rigel - 0.2) return { visible: false };
    o.y = landY(o.x, o.z);
    o.armR = 1.3; o.armL = 0.12; o.look = 0.3; o.pitch = -0.04;
    o.roll = 0.01 * Math.sin(v * 1.3);
    return o;
  }
  if (v > LAND.rigel - 0.2) return { visible: false };       // (Rigel: you, alone)
  // ---- the moving parts: to the shade (Sirius), into the sea (Vega), away from the fire (Aldebaran) ----
  if (p.shadeAt && v >= p.tRun) {
    const from = { x: p.rx, z: p.rz };
    const toShade = leg(from, p.shadeAt, p.tRun + 0.2, p.ur, v);
    let pos = toShade, run = toShade.moving, crouch = !toShade.moving, gone = false, wade = 0;
    if (p.tSea && v >= p.tSea) {
      const sea = leg(p.shadeAt, p.seaTo, p.tSea, 4.4, v);
      pos = sea; run = sea.moving; crouch = false;
      const y = landY(sea.x, sea.z);
      wade = clamp(-y / 1.2);
      if (y < -1.35 || !sea.moving) gone = true;
    }
    if (p.tFlee && v >= p.tFlee) {
      const fl = leg(p.shadeAt, p.fleeTo, p.tFlee, 5.4, v);
      pos = fl; run = fl.moving; crouch = false;
      if (!fl.moving) gone = true;
    }
    if (gone) return { visible: false };
    o.x = pos.x; o.z = pos.z; o.y = landY(pos.x, pos.z);
    if (run) {
      o.yaw = pos.yaw;
      o.walk = p.ph + pos.d / 1.15 * Math.PI;
      o.stride = (wade > 0 ? 1.0 : 1.5) * (1 - 0.4 * wade);
      o.armL = wade > 0 ? 0.9 : p.seed < 0.6 ? 1.35 : 0.1; o.armR = wade > 0 ? 0.9 : p.seed > 0.4 ? 1.25 : 0.1;
      o.pitch = 0.12;
    } else if (crouch) {
      // crouched in the shade, arms round the knees, head down
      o.yaw = Math.atan2(p.shadeAt.u.x - o.x, p.shadeAt.u.z - o.z) + Math.PI;
      o.sit = 1; o.y -= 0.45; o.pitch = 0.3; o.armL = 0.7; o.armR = 0.7; o.look = -0.25;
      // the last few, when their umbrella catches fire: up on their feet, looking at it
      if (p.tFlee) { const up = smooth(p.tFlee - 0.6, p.tFlee, v); o.sit = 1 - up; o.y = landY(o.x, o.z) - 0.45 * (1 - up); o.armL = lerp(0.7, 1.4, up); o.armR = lerp(0.7, 1.5, up); o.pitch = lerp(0.3, -0.05, up); }
    }
    return o;
  }
  // ---- standing, sitting, lying where they are (walkers walking until the heat stops them) ----
  const cold = smooth(LAND.proxima + 0.1, LAND.proxima + 1.2, v) * (1 - smooth(LAND.sirius, LAND.sirius + 0.8, v));
  const run = !p.stay && !p.shadeAt && v >= p.tRun;
  if (!run) {
    if (p.type === 'walk') {
      const stopV = p.stopV;
      const tw = Math.min(v, stopV) + 10 + (v > stopV ? 0.3 * (1 - Math.exp(-(v - stopV) / 0.3)) : 0);
      o.z = p.z + p.uz * tw;
      o.yaw = Math.atan2(0, p.uz);
      o.walk = p.ph + tw * Math.abs(p.uz) / 0.72 * Math.PI;
      o.stride = v < stopV ? 1 : 0;
    }
    o.y = landY(o.x, o.z);
    // Arcturus (from frame 0): everyone squints up at the giant disc, a hand up against the glare; the ones lying down
    // sit up (and stay up through the cold)
    const hot = smooth(LAND.arcturus + 0.05 + p.seed * 0.35, LAND.arcturus + 0.45 + p.seed * 0.35, v) * (1 - smooth(LAND.proxima, LAND.proxima + 0.7, v));
    if (p.type === 'lie') {
      const up = Math.max(smooth(LAND.arcturus + 0.3 + p.seed * 0.6, LAND.arcturus + 1.3 + p.seed * 0.6, v), smooth(LAND.proxima + 0.5 + p.seed * 0.5, LAND.proxima + 1.6 + p.seed * 0.5, v));
      o.pitch = -Math.PI / 2 * (1 - up);
      o.y += 0.13 * (1 - up) - 0.45 * up;
      o.sit = up;
    }
    if (p.type === 'sit') { o.sit = 1; o.y -= 0.45; }
    if (hot > 0) {
      o.armR = lerp(o.armR, 1.3 + 0.08 * Math.sin(v * 2 + p.ph), hot);
      o.armL = lerp(o.armL, p.seed < 0.35 ? 1.2 : 0.15, hot);
      o.look = lerp(o.look, 0.3, hot); o.pitch += -0.06 * hot;
    }
    // the look up at the sky as it goes dark; then hugging themselves, shivering
    o.look = lerp(o.look, 0.45, smooth(LAND.proxima + 0.05, LAND.proxima + 0.5, v) * (1 - smooth(LAND.proxima + 1.6, LAND.proxima + 2.6, v)));
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
      if (p.type === 'lie' || p.type === 'sit') { const up = smooth(p.tReact + 0.1, p.tRun, v); o.sit = 1 - up; o.y = landY(o.x, o.z) - 0.45 * (1 - up); }
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
