// The people on the beach (video time v throughout).
//   Frame 0: a packed beach at golden hour, everyone facing the sea and the two suns, pointing, filming, arms up.
//   The surge (0:04-0:08): the star's pull lifts the sea and it races up the sand; the ones near the water turn and run
//   up the beach, past you, and stop higher up (a few at the new water's edge, in front of you), turn round and watch
//   again. Every path is planned up front: straight inland in a lane that misses the umbrellas, the lifeguard towers
//   and the line the camera backs up along, nobody overtaking anybody in the same lane.
//   Up on the walk (after the first dash): people along the walk and the sand below it; when the beach goes under
//   (T_FLOOD) the ones on the sand run up past you onto the grass and the road; the ground shakes (T_QUAKE).
//   After the pass (second dash): the ones on the walk, in the cold.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { landY, sandY, UMBRELLAS, LIFEGUARD, PALMS, CAM0, camFront, PIER } from './layout.js';
import { T_SURGE, T_DASH1, T_DASH2, T_FLOOD, T_QUAKE, T_ZERO, CAM_END_X, seaYAt, frontX } from './timeline.js';

const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085, 0xf2f2f2, 0xe8e2d0, 0xc0392b, 0x2e86c1];
const PANTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d, 0xe8e2d0];
export const PEOPLE = [];

export const LOOK_B = 2.5;                                       // the bearing everyone faces (between the two suns)
const BR = LOOK_B * Math.PI / 180;
const FACE = Math.atan2(-Math.cos(BR), -Math.sin(BR));
export const CAMW = { x: 171.2, z: 6 };                          // where you stand on the walk (after the first dash)

// when the sea (rising) first reaches ground at x (video s), between a and b
function wetAt(x, a, b) {
  const g = sandY(x);
  if (seaYAt(b) < g) return 1e9;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (seaYAt(m) >= g) b = m; else a = m; }
  return b;
}
// metres to the line the camera backs up along (z = 0, from CAM0 to CAM_END_X)
const offLine = (x, z) => Math.abs(z - CAM0.z) + Math.max(0, CAM0.x - 1.5 - x, x - CAM_END_X - 2);
const OBS = [...UMBRELLAS.map((u) => [u.x, u.z, 0.45]), ...LIFEGUARD.map((l) => [l.x, l.z, 2.6]), ...PALMS.filter((t) => t.x < 200).map((t) => [t.x, t.z, 0.45])];
for (let x = CAM0.x; x <= CAM_END_X + 2; x += 2.5) OBS.push([x, CAM0.z, 1.35]);      // the camera, backing up
const SURGE_END = T_SURGE + 6;
{
  const R = rng(2026);
  const add = (o) => {
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    const sleeves = R() < 0.55;
    PEOPLE.push({ yaw: FACE + (R() - 0.5) * 0.5, s: 0.92 + R() * 0.14, seed: R(), ph: R() * 6.28, g1: R(), g2: R(), g3: R(),
      col: [TOPS[Math.floor(R() * TOPS.length)], PANTS[Math.floor(R() * PANTS.length)], skin, HAIR[Math.floor(R() * HAIR.length)], sleeves], type: 'stand', set: 'beach', ...o });
    return PEOPLE[PEOPLE.length - 1];
  };
  // right around you (metres ahead of the opening camera, metres to its right): heads and shoulders at the bottom of
  // the frame, the middle open so you see the sea and the suns over them
  const near = [
    [5.5, -1.32], [6.0, 1.38], [6.6, -2.30], [7.2, 2.30], [7.8, -1.09], [8.4, 2.76], [8.8, -2.76], [9.5, -1.49], [10.2, 1.15], [10.6, 3.33],
    [11.0, -3.45], [11.6, -1.26], [12.2, 1.03], [12.9, -2.18], [13.6, 2.30], [14.2, -0.92], [14.9, 1.15], [15.3, 1.95, 'kid'], [16.0, -1.84], [16.8, 0.92], [17.5, -1.03], [18.4, 2.53],
  ];
  near.forEach(([r, l, type]) => {
    const c = camFront(r, l, { ...CAM0, b: LOOK_B });
    const p = add({ x: c.x, z: c.z, near: true });
    p.yaw = FACE + (l > 0 ? 0.12 : -0.12) + (R() - 0.5) * 0.2;
    if (type === 'kid') { p.s = 0.64; p.kid = true; }
  });
  PEOPLE[0].g1 = 0.05; PEOPLE[0].g2 = 0.9;       // (the two at the frame's edges: one points, one films)
  PEOPLE[1].g1 = 0.9; PEOPLE[1].g2 = 0.02;
  const place = (x, z, gap, o = {}) => {
    if (Math.abs(z - PIER.z) < 12) return null;
    if (offLine(x, z) < (x > CAM0.x ? 1.3 : 0.8)) return null;
    if (Math.hypot(x - CAM0.x, z - CAM0.z) < 3.4) return null;
    if (Math.hypot(x - CAMW.x, z - CAMW.z) < 2.6) return null;
    if (PEOPLE.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) return null;
    if (OBS.some(([ox, oz, r]) => r < 1.3 && Math.hypot(ox - x, oz - z) < r + 0.6) || LIFEGUARD.some((l) => Math.hypot(l.x - x, l.z - z) < 3.4)) return null;
    const p = add({ x, z, type: x > 6 && x < 160 && Math.hypot(x - CAM0.x, z) > 14 && R() < 0.12 ? 'sit' : 'stand', ...o });
    if (R() < 0.08) { p.s = 0.6 + R() * 0.12; p.kid = true; }
    return p;
  };
  // the beach: packed around you and down to the water, thinning out along the beach and up to the walk
  for (let k = 0; k < 3600 && PEOPLE.length < 880; k++) place(-2.5 + R() * 58, -32 + R() * 62, 1.12);
  for (let k = 0; k < 9000 && PEOPLE.length < 1180; k++) {
    const x = -2.5 + R() * 165, z = -300 + R() * 560;
    if (R() > 0.1 + 0.9 * Math.exp(-Math.hypot(x - 16, z + 1) / 60)) continue;
    place(x, z, 0.95);
  }
  // the walk: people along it around where you'll stand (seen only once you're up there)
  const nW0 = PEOPLE.length;
  // a few close to you, at the walk's seaward edge, either side of the view
  [[5.0, -4], [6.6, 0.8], [4.4, 27], [7.4, 30.5], [9.2, -8.5], [5.8, -13], [8.4, 25], [11, 3.5], [10.4, -2]].map(([d, b]) => [CAMW.x - d * Math.cos(b * Math.PI / 180), CAMW.z - d * Math.sin(b * Math.PI / 180)]).forEach(([x, z]) => {
    const p = place(x, z, 0.8, { set: 'walk', near: true });
    if (p) p.yaw = FACE + (z > CAMW.z ? 0.15 : -0.15);
  });
  for (let k = 0; k < 6000 && PEOPLE.length < nW0 + 260; k++) {
    const x = 164.5 + R() * 22, z = -90 + R() * 200;
    if (R() > 0.2 + 0.8 * Math.exp(-Math.abs(z - CAMW.z) / 50)) continue;
    if (x > CAMW.x - 1 && Math.abs(z - CAMW.z) < 3) continue;          // (room round you)
    { const dx = CAMW.x - x, dz = CAMW.z - z, b = Math.atan2(dz, dx) * 180 / Math.PI; if (dx > 0 && Math.hypot(dx, dz) < 14 && b > 9 && b < 24) continue; }   // (nobody right in front of the zoom on the star)
    place(x, z, 1.0, { set: 'walk' });
  }
  // ---- the surge: who runs, when, where to, and in which lane ----
  for (const p of PEOPLE) {
    const r = p.seed;
    p.d = 0.05 + r * 0.3;
    p.rx = p.x; p.rz = p.z;
    p.tRun = 1e9; p.stopX = p.x; p.tRun2 = 1e9; p.stopX2 = p.x;
    if (p.set === 'beach') {
      const tw = wetAt(p.x, T_SURGE - 1, SURGE_END);
      if (tw < 1e8 || p.x < 46) {
        // they see it coming and go before it reaches them
        p.tRun = Math.max(T_SURGE + 0.15 + 0.5 * r, Math.min(tw, SURGE_END) - 1.4 - 0.6 * ((r * 7) % 1));
        p.ur = 4.6 + 1.6 * ((r * 13) % 1) - (p.kid ? 1.0 : 0);
        p.stopX = Math.max(p.x + 8, ((r * 17) % 1) < 0.45 ? 44 + 14 * ((r * 29) % 1) : 60 + 45 * ((r * 31) % 1));
      }
      // the flood (up on the walk): the ones still on the sand run up past you onto the grass and the road
      const x1 = p.stopX;
      if (x1 > 118 && x1 < 166) {
        let tw2 = T_FLOOD - 1; while (tw2 < T_FLOOD + 4 && frontX(tw2) < x1) tw2 += 0.01;
        p.tRun2 = Math.max(T_FLOOD - 1.6 + 0.6 * r, tw2 - 3.6 - 1.2 * ((r * 5) % 1));
        p.ur2 = 5.6 + 1.8 * ((r * 11) % 1);
        p.stopX2 = 179 + 30 * ((r * 23) % 1);
      }
    }
    p.tUp = Math.min(p.tRun, p.tRun2) - 0.7;
    let lane = p.z, ok = false;
    for (let tries = 0; tries < 14 && !ok; tries++) {
      ok = !OBS.some(([ox, oz, rr]) => ox > p.x - 1 && ox < p.stopX + 1 && Math.abs(oz - lane) < rr + 0.55);
      if (!ok) lane = p.z + (tries % 2 ? -1 : 1) * (0.9 + 0.55 * tries);
    }
    p.lane = lane;
    if (!ok) { p.tRun = 1e9; p.stopX = p.x; }
    // the second lane: clear of you on the walk
    p.lane2 = p.lane > CAMW.z - 7.5 && p.lane < CAMW.z + 2.2 ? (p.lane > CAMW.z - 2.6 ? CAMW.z + 2.4 : CAMW.z - 7.8) : p.lane;     // (clear of you and of the zoom on the star)
  }
  // nobody catches up with someone in the same lane: the one behind is held to the speed of the one ahead
  const order = PEOPLE.filter((p) => p.tRun < 1e8).sort((a, b) => b.x - a.x);
  for (const p of order) for (const o of order) {
    if (o === p || o.x <= p.x || Math.abs(o.lane - p.lane) > 0.9) continue;
    const tAt = (q, x) => q.tRun + 0.35 + (x - q.x) / q.ur;
    if (tAt(p, o.x + 4) < tAt(o, o.x + 4) + 0.4) p.ur = Math.min(p.ur, Math.max(3.0, (o.x + 4 - p.x) / Math.max(0.4, tAt(o, o.x + 4) + 0.4 - p.tRun - 0.35)));
    // and doesn't stop on top of them
    if (Math.abs(o.stopX - p.stopX) < 1.1 && Math.abs(o.lane - p.lane) < 0.9) p.stopX = o.stopX - 1.2;
  }
  // the ones whose run would end in the water (or right where you stand) don't run: they're gone after the first dash
  for (const p of PEOPLE) { if (p.set === 'beach' && p.stopX < 55) p.goneAt = T_DASH1; if (p.set === 'beach') p.gone2 = T_DASH2; }
}

// what they do with their arms: [armL, armR, phone]
function gesture(p, v, out) {
  let armL = 0, armR = 0, phone = 0;
  if (p.g1 < 0.36) armR = 1.2 + 0.1 * p.g3;                         // pointing at it
  if (!p.kid && p.g2 < 0.34) { armL = 1.02; phone = 1; }             // filming it
  if (p.g3 < 0.18 && !phone) { armL = 1.5; armR = 1.55; }            // both arms up, hands to the head
  // in the cold: arms down, a few still film
  const cold = v >= T_DASH2 ? smooth(T_DASH2 + 2, T_DASH2 + 6, v) : 0;
  if (cold > 0 && p.g2 > 0.15) { armL *= 1 - cold; armR *= 1 - cold; phone *= 1 - cold; }
  out.armL = armL; out.armR = armR; out.phone = phone;
  out.look = 0.32; out.pitch = -0.04;
  return out;
}
const G = {};

// distance run (m) t seconds after setting off at speed u, easing to a stop after dist m
function runD(t, u, dist) {
  if (t <= 0) return 0;
  const d = t < 0.7 ? u * t * t / 1.4 : u * (t - 0.35);
  if (d < dist - 2.5) return d;
  // ease into the stop over the last 2.5 m
  const tEnd = 0.35 + (dist - 2.5) / u;
  const k = clamp((t - tEnd) / 1.1);
  return Math.min(dist, dist - 2.5 + 2.5 * (1 - (1 - k) * (1 - k)));
}
export function personPose(p, v) {
  if ((p.set === 'walk' && v < T_DASH1 - 0.2) || (p.goneAt && v > p.goneAt) || (p.gone2 && v > p.gone2)) return { visible: false };
  if (p.set === 'beach' && v > T_DASH1 && p.x > 162) return { visible: false };       // (the walk has its own people then)
  const o = { x: p.x, y: 0, z: p.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.3, phone: 0 };
  gesture(p, v, G);
  // ---- running up the beach (the surge, then the flood) ----
  const run = (t0, x0, z0, z1, x1, u) => {
    const tr = v - t0;
    const dist = x1 - x0;
    const d = runD(tr, u, dist);
    o.x = x0 + d;
    o.z = lerp(z0, z1, smooth(0, 4, d));
    o.y = landY(o.x, o.z);
    const moving = d < dist - 0.05;
    const turnOut = smooth(t0 - 0.05, t0 + 0.35, v);
    const stopT = t0 + 0.35 + (dist - 2.5) / u + 1.1;
    const turnBack = smooth(stopT + 0.2, stopT + 1.4, v);
    let dy = Math.PI / 2 - p.yaw; dy -= 2 * Math.PI * Math.round(dy / (2 * Math.PI));
    o.yaw = p.yaw + dy * turnOut * (1 - turnBack);
    o.walk = p.ph + d / 1.15 * Math.PI;
    o.stride = moving ? 1.6 * clamp(tr / 0.7) * (1 - smooth(dist - 2.5, dist, d) * 0.7) : 0;
    o.pitch = moving ? 0.12 : 0;
    if (moving) { o.armL = p.g1 < 0.3 ? 1.45 : 0; o.armR = p.g3 < 0.2 ? 1.3 : 0; o.phone = 0; }
    else { const k = smooth(stopT + 0.6, stopT + 1.6, v); o.armL = G.armL * k; o.armR = G.armR * k; o.phone = G.phone * k; o.look = 0.3; }
    return o;
  };
  if (v >= p.tRun2) { run(p.tRun2, p.stopX, p.lane, p.lane2, p.stopX2, p.ur2); }
  else if (v >= p.tRun) { run(p.tRun, p.rx, p.rz, p.lane, p.stopX, p.ur); }
  else {
    // ---- standing (or sitting) where they are, looking up ----
    o.y = landY(o.x, o.z);
    if (p.type === 'sit') { const up = smooth(p.tUp, p.tUp + 0.7, v); o.sit = 1 - up; o.y -= 0.45 * (1 - up); }
    o.armL = G.armL; o.armR = G.armR; o.phone = G.phone; o.look = G.look; o.pitch = G.pitch;
    if (p.type === 'sit') { o.armL *= 0.3; o.armR *= 0.5; }
    o.armL += o.phone ? 0.02 * Math.sin(v * 1.1 + p.ph) : 0;
    o.armR += 0.03 * Math.sin(v * 1.7 + p.ph * 2);
    o.roll = 0.012 * Math.sin(v * 0.9 + p.ph);
  }
  // after the flood the ones who ran stand on the grass and the road; after the first dash the ones who stopped on
  // the sand are where they stopped
  if (v >= T_DASH1 && v < p.tRun2 && p.set === 'beach') { o.x = p.stopX; o.z = p.lane; o.y = landY(o.x, o.z); o.yaw = p.yaw; o.stride = 0; o.pitch = G.pitch; o.armL = G.armL; o.armR = G.armR; o.phone = G.phone; o.sit = 0; }
  // the walk's people: standing; the water comes round their feet and they step back a little
  if (p.set === 'walk') {
    const back = 1.6 * smooth(T_FLOOD + 1.5 + p.seed, T_FLOOD + 3 + p.seed, v) * (v < T_DASH2 ? 1 : 0);
    o.x = p.x + back; o.y = landY(o.x, o.z);
    if (back > 0.05 && back < 1.55) { o.walk = p.ph + back * 3; o.stride = 0.6; }
  }
  // the ground shakes: they stagger and put their arms out
  const q = v >= T_QUAKE && v < T_DASH2 ? smooth(T_QUAKE + p.d, T_QUAKE + p.d + 0.3, v) * (1 - 0.5 * smooth(T_ZERO, T_ZERO + 2, v)) : 0;
  if (q > 0) {
    o.roll += 0.09 * q * Math.sin(v * 7.3 + p.ph * 3);
    o.pitch += 0.05 * q * Math.sin(v * 5.1 + p.ph);
    if (p.g2 > 0.5 && !o.phone) { o.armL = Math.max(o.armL, 0.7 * q); o.armR = Math.max(o.armR, 0.6 * q); }
  }
  return o;
}
