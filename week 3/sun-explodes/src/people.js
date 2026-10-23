// The people on the beach, and what they do when the light lands (story 8:20). Everyone is placed and every path is
// planned up front, checked against everyone else, the palms, umbrella poles, kiosks, lamps and the braking cars,
// so nobody runs through anybody or anything (a person whose path can't be made clear is left out).
//   lying on towels, sitting in beach chairs or on the sand, standing in groups, walking along the water, jogging and
//   walking on the promenade, playing volleyball, swimming.
// At the flash: they flinch (arms up over their faces, turning away), the ones lying down get up, and after a moment
// everyone runs: the swimmers and the people near the water into the sea (they dive under and stay down), everyone
// else up the beach, across the promenade and the stopped traffic into the towers (they go in through the shop fronts).
// Story time T throughout (the video speeds up later; people move in real seconds).
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { arcXZ, toArc, landY, TOWERS, PALMS, UMBRELLAS, KIOSKS, LAMPS, CHAIRS, TOWELS, NETS, RC, D, LANES } from './layout.js';
import { CARS, carS } from './traffic.js';
import { T_FLASH } from './timeline.js';

const SWIM = [0xd7263d, 0x1b998b, 0xf46036, 0x2e294e, 0xc5d86d, 0x111111, 0xe8e8e8, 0xff6fb5, 0x2f6db5, 0xf3c623, 0x7b2cbf, 0x0b7a75];
const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085];
const SHORTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d];

export const PEOPLE = [];
const T0 = 493, T1 = 620, DT = 0.2;           // the planning window (story s) and its step
const NS = Math.round((T1 - T0) / DT) + 1;

// obstacles (world x, z, radius)
const OBS = [];
for (const p of PALMS) { const c = arcXZ(p.phi, p.d); OBS.push([c.x, c.z, 0.45]); }
for (const u of UMBRELLAS) { const c = arcXZ(u.phi, u.d); OBS.push([c.x, c.z, 0.35]); }
for (const k of KIOSKS) { const c = arcXZ(k.phi, k.d); OBS.push([c.x, c.z, 3.1]); for (let j = 0; j < 4; j++) { const cc = arcXZ(k.phi + (j < 2 ? -1 : 1) * 4.5 / (RC + 92), 92 + (j % 2) * 2.5 + 1.5); OBS.push([cc.x, cc.z, 0.6]); } }
for (const l of LAMPS) { const c = arcXZ(l.phi, l.d); OBS.push([c.x, c.z, 0.4]); }
for (const ch of CHAIRS) { const c = arcXZ(ch.phi, ch.d); OBS.push([c.x, c.z, 0.45]); }
for (const n of NETS) { const c = arcXZ(n.phi, n.d); const a = { x: Math.cos(n.phi), z: Math.sin(n.phi) }; for (let k = -4.5; k <= 4.5; k += 0.75) OBS.push([c.x + a.x * k, c.z + a.z * k, 0.35]); }
// the obstacle grid (10 m cells)
const GRID = new Map();
const key = (x, z) => `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
for (const o of OBS) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const k = `${Math.floor(o[0] / 10) + i},${Math.floor(o[1] / 10) + j}`; if (!GRID.has(k)) GRID.set(k, []); GRID.get(k).push(o); }
const hitsObstacle = (x, z, r = 0.32) => { const l = GRID.get(key(x, z)); if (!l) return false; for (const o of l) if (Math.hypot(x - o[0], z - o[1]) < o[2] + r) return true; return false; };
// the cars, by lane, at a story time
const carsByLane = LANES.map((ln) => CARS.filter((c) => c.lane === ln));
const ta = {};
function hitsCar(x, z, T) {
  toArc(x, z, ta);
  if (ta.d < D.ave - 1.2 || ta.d > D.walk + 1.2) return false;
  for (let li = 0; li < LANES.length; li++) {
    const ln = LANES[li];
    if (Math.abs(ta.d - ln.d) > 1.6) continue;
    const sP = ta.phi * (RC + ln.d);
    for (const c of carsByLane[li]) { const sc = carS(c, T).s; if (Math.abs(sc - sP) < 3.3) return true; }
  }
  return false;
}
// the front-row towers' street fronts (a person heading inland aims for one)
const FRONTS = TOWERS.filter((t) => t.row === 0).map((t) => ({ phi0: t.phi0 + 2 / (RC + 140), phi1: t.phi1 - 2 / (RC + 140), d: t.d0 + 1.6 }));

// ---- a person's plan -> position at story time T ----
// p: { x0, z0 (where they are at T0), ux, uz (walking velocity before), tReact, tRun, path: [{T, x, z}] (the run), ... }
const ease = (x) => x * x * (3 - 2 * x);
export function where(p, T, out = {}) {
  out.vis = true;
  if (T < p.tStop) { out.x = p.x0 + p.ux * (T - T0); out.z = p.z0 + p.uz * (T - T0); out.u = Math.hypot(p.ux, p.uz); return out; }
  // slowing to a stop over 0.5 s after flinching
  const tS = Math.min(T, p.tStop + 0.5) - p.tStop;
  const k = tS - tS * tS / (2 * 0.5);
  const xs = p.x0 + p.ux * (p.tStop - T0) + p.ux * k, zs = p.z0 + p.uz * (p.tStop - T0) + p.uz * k;
  if (T < p.tRun || !p.path) { out.x = xs; out.z = zs; out.u = T < p.tStop + 0.5 ? Math.hypot(p.ux, p.uz) * (1 - tS / 0.5) : 0; return out; }
  // running the path: speeds up over 0.7 s
  const tr = T - p.tRun;
  const dist = tr < 0.7 ? p.ur * tr * tr / 1.4 : p.ur * (tr - 0.35);
  const [ax, az, bx, bz] = p.path;
  const L = Math.hypot(bx - ax, bz - az);
  const f = Math.min(1, dist / L);
  out.x = ax + (bx - ax) * f; out.z = az + (bz - az) * f;
  out.u = tr < 0.7 ? p.ur * tr / 0.7 : p.ur;
  out.done = dist >= L;
  out.over = dist - L;
  return out;
}
const tw = {};
function track(p, i) { const T = T0 + i * DT; where(p, T, tw); return tw; }

{
  const R = rng(2026);
  const placed = [];
  // (precomputed tracks for the clash checks)
  const pos = (p) => {
    const xs = new Float32Array(NS), zs = new Float32Array(NS), on = new Uint8Array(NS);
    for (let i = 0; i < NS; i++) { const w = track(p, i); xs[i] = w.x; zs[i] = w.z; on[i] = !(w.done && w.over > (p.sea ? 2.5 : 0.8)) ? 1 : 0; }
    return { xs, zs, on };
  };
  const swimwear = () => {
    const man = R() < 0.5;
    const skin = SKIN[Math.floor(R() * SKIN.length)], hair = HAIR[Math.floor(R() * HAIR.length)];
    const sw = SWIM[Math.floor(R() * SWIM.length)];
    return man ? [skin, sw, skin, hair, false] : [R() < 0.3 ? TOPS[Math.floor(R() * TOPS.length)] : sw, sw, skin, hair, false];
  };
  const dressed = () => [TOPS[Math.floor(R() * TOPS.length)], SHORTS[Math.floor(R() * SHORTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)], R() < 0.3];
  // plan the run from where they are at tRun
  function planRun(p) {
    const w = where({ ...p, path: null }, p.tRun, {});
    p.rx = w.x; p.rz = w.z;
    toArc(w.x, w.z, ta);
    if (p.sea) {
      const dEnd = -16 - R() * 10;
      const phiE = ta.phi + (R() - 0.5) * 6 / RC;
      const e = arcXZ(phiE, dEnd);
      p.path = [w.x, w.z, e.x, e.z];
    } else {
      // a tower front roughly inland from them, sometimes a bit along
      const want = ta.phi + (R() - 0.5) * 40 / RC;
      let best = FRONTS[0], bd = 1e9;
      for (const f of FRONTS) { const c = clamp(want, f.phi0, f.phi1); if (Math.abs(c - want) < bd) { bd = Math.abs(c - want); best = f; } }
      const phiE = clamp(want, best.phi0, best.phi1);
      const e = arcXZ(phiE, best.d);
      p.path = [w.x, w.z, e.x, e.z];
    }
  }
  function ok(p) {
    const tr = pos(p);
    // obstacles and cars along the way (from when they start running), and where they stand before
    for (let i = 0; i < NS; i += 1) {
      if (!tr.on[i]) continue;
      const T = T0 + i * DT;
      if ((T >= p.tRun || i === 0 || p.ux || p.uz) && !p.swimmer && hitsObstacle(tr.xs[i], tr.zs[i], p.lying && T < p.tRun ? 0.9 : 0.3)) return null;
      if (T > p.tRun && hitsCar(tr.xs[i], tr.zs[i], T)) return null;
    }
    for (const q of placed) {
      if (Math.abs(q.p.x0 - p.x0) + Math.abs(q.p.z0 - p.z0) > 220) continue;
      const qt = q.tr;
      const rr = (p.lying || q.p.lying) ? 1.4 : 0.8;
      for (let i = 0; i < NS; i++) {
        if (!tr.on[i] || !qt.on[i]) continue;
        const T = T0 + i * DT;
        const r = (p.lying && T < p.tRun + 0.6) || (q.p.lying && T < q.p.tRun + 0.6) ? rr : 0.8;
        if (Math.abs(tr.xs[i] - qt.xs[i]) < r && Math.abs(tr.zs[i] - qt.zs[i]) < r && Math.hypot(tr.xs[i] - qt.xs[i], tr.zs[i] - qt.zs[i]) < r) return null;
      }
    }
    return tr;
  }
  function add(o, tries = 6) {
    for (let t = 0; t < tries; t++) {
      const p = { ...o };
      p.tReact = T_FLASH + 0.12 + R() * 0.6 * (p.slow || 1);
      p.tStop = p.tReact + 0.1;
      p.tRun = p.tReact + (p.lying ? 1.5 + R() * 0.8 : p.sitting ? 0.9 + R() * 0.5 : 0.35 + R() * 0.7);
      if (p.swimmer) { p.tRun = p.tReact + 0.2; }
      planRun(p);
      const tr = ok(p);
      if (tr) { placed.push({ p, tr }); PEOPLE.push(p); return p; }
    }
    return null;
  }
  const base = (phi, d, extra) => {
    const c = arcXZ(phi, d);
    return { x0: c.x, z0: c.z, ux: 0, uz: 0, yaw: R() * 6.283, s: 0.93 + R() * 0.12, ph: R() * 10, seed: R(), ur: 4.8 + R() * 1.6, col: swimwear(), ...extra };
  };
  const alongV = (phi, sp) => ({ ux: Math.sin(phi) * sp, uz: -Math.cos(phi) * sp });
  // lying on the towels (on their backs), sitting in the chairs / on the sand, standing beside the umbrellas
  for (const t of TOWELS) {
    if (t.phi > 0.12 || R() < 0.15) continue;
    const near = t.phi < 0.03;
    if (!near && R() < 0.5) continue;
    const c = arcXZ(t.phi, t.d);
    add({ ...base(t.phi, t.d), x0: c.x, z0: c.z, yaw: t.yaw, lying: true, slow: 1.3, sea: t.d < 35 && R() < 0.5 });
  }
  for (const ch of CHAIRS) {
    if (ch.phi > 0.1 || R() < 0.4) continue;
    const c = arcXZ(ch.phi, ch.d);
    add({ ...base(ch.phi, ch.d), x0: c.x, z0: c.z, yaw: ch.yaw + Math.PI / 2 - ch.phi + Math.PI, sitting: true, chair: true, sea: ch.d < 30 && R() < 0.4 });
  }
  // right below you on the sand: a close cluster (so frame 0 is full of people)
  for (let k = 0, n = 0; k < 1500 && n < 34; k++) {
    const phi = 0.0022 + R() * 0.007, d = 58 + R() * 26;
    const g = add({ ...base(phi, d), kid: R() < 0.12, sitting: R() < 0.25, sand: true, phone: R() < 0.2, sea: false });
    if (g) { n++; if (g.kid) g.s = 0.6 + R() * 0.12; }
  }
  // groups standing and chatting, kids: thick on the sand right in front of you
  for (let k = 0, n = 0; k < 1500 && n < 80; k++) {
    const phi = 0.001 + R() * 0.022, d = 10 + R() * 74;
    const g = add({ ...base(phi, d), kid: R() < 0.12, sea: d < 30 ? R() < 0.7 : false, phone: R() < 0.15 });
    if (g) { n++; if (g.kid) g.s = 0.6 + R() * 0.12; }
  }
  for (let k = 0, n = 0; k < 900 && n < 60; k++) {
    const phi = 0.0015 + Math.pow(R(), 1.5) * 0.11, d = 8 + R() * 74;
    const g = add({ ...base(phi, d), kid: R() < 0.12, sea: d < 28 ? R() < 0.7 : false, phone: R() < 0.15 });
    if (g) { n++; if (g.kid) g.s = 0.6 + R() * 0.12; }
  }
  // sitting on the sand
  for (let k = 0, n = 0; k < 500 && n < 30; k++) {
    const phi = 0.002 + Math.pow(R(), 1.5) * 0.1, d = 12 + R() * 66;
    if (add({ ...base(phi, d), sitting: true, sand: true, sea: d < 25 && R() < 0.5 })) n++;
  }
  // walking along the water's edge (both ways)
  for (let k = 0, n = 0; k < 700 && n < 40; k++) {
    const phi = -0.01 + Math.pow(R(), 1.4) * 0.12, d = 3 + R() * 9;
    const sp = (R() < 0.5 ? 1 : -1) * (1.1 + R() * 0.4);
    const v = alongV(phi, sp);
    const b = base(phi, d);
    if (add({ ...b, ...v, x0: b.x0 - v.ux * (T_FLASH - T0) * 0.5, z0: b.z0 - v.uz * (T_FLASH - T0) * 0.5, yaw: Math.atan2(-v.ux, -v.uz), walking: true, sea: R() < 0.75 })) n++;
  }
  // swimming (chest-deep, beyond the first breakers)
  for (let k = 0, n = 0; k < 500 && n < 34; k++) {
    const phi = 0.004 + Math.pow(R(), 1.3) * 0.09, d = -6 - R() * 16;
    if (add({ ...base(phi, d), swimmer: true, sea: true, yaw: Math.PI + phi + (R() - 0.5) })) n++;
  }
  // volleyball: four players at each net
  for (const nt of NETS) for (let j = 0; j < 4; j++) {
    const side = j < 2 ? 1 : -1;
    const phi = nt.phi + side * (2.2 + R() * 1.5) / (RC + nt.d), d = nt.d + (j % 2 ? 2.2 : -2.2) + (R() - 0.5);
    add({ ...base(phi, d), volley: true, yaw: side > 0 ? -nt.phi + Math.PI / 2 + Math.PI : -nt.phi + Math.PI / 2, sea: false });
  }
  // on the promenade: joggers, walkers (both ways), people by the kiosks; on the far sidewalk
  for (let k = 0, n = 0; k < 1400 && n < 90; k++) {
    const phi = -0.02 + Math.pow(R(), 1.3) * 0.14, d = 89.5 + R() * 15.5;
    const jog = R() < 0.35;
    const sp = (R() < 0.5 ? 1 : -1) * (jog ? 2.6 + R() * 0.8 : 1.1 + R() * 0.45);
    const v = R() < 0.85 ? alongV(phi, sp) : { ux: 0, uz: 0 };
    const b = base(phi, d, { col: dressed() });
    const moving = v.ux || v.uz;
    if (add({ ...b, ...v, x0: b.x0 - v.ux * (T_FLASH - T0) * 0.5, z0: b.z0 - v.uz * (T_FLASH - T0) * 0.5, yaw: moving ? Math.atan2(-v.ux, -v.uz) : b.yaw, walking: !!moving, jog, phone: !moving && R() < 0.4 })) n++;
  }
  for (let k = 0, n = 0; k < 500 && n < 26; k++) {
    const phi = -0.01 + Math.pow(R(), 1.3) * 0.12, d = 134.2 + R() * 3.6;
    const sp = (R() < 0.5 ? 1 : -1) * (1.1 + R() * 0.4);
    const v = alongV(phi, sp);
    const b = base(phi, d, { col: dressed() });
    if (add({ ...b, ...v, yaw: Math.atan2(-v.ux, -v.uz), walking: true })) n++;
  }
}

// ---- the pose at story time T (for crowd.pose) ----
const w0 = {};
export function personPose(p, T) {
  where(p, T, w0);
  if (w0.done && w0.over > (p.sea ? 2.5 : 0.8)) return { visible: false };
  const o = { x: w0.x, y: 0, z: w0.z, yaw: p.yaw, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.05 };
  toArc(w0.x, w0.z, ta);
  const gy = landY(ta.d);
  o.y = gy;
  const fl = smooth(p.tReact, p.tReact + 0.25, T);              // flinch
  const run = T >= p.tRun;
  if (!run) {
    if (p.walking) {
      const sp = Math.hypot(p.ux, p.uz);
      o.walk = p.ph + (T - T0) * sp / (p.jog ? 0.95 : 0.72) * Math.PI;
      o.stride = (p.jog ? 1.5 : 1) * clamp(w0.u / Math.max(sp, 0.1));
    }
    if (p.lying) {
      const up = smooth(p.tReact + 0.2, p.tRun - 0.1, T);
      o.pitch = -Math.PI / 2 * (1 - up);
      o.y = gy + 0.13 * (1 - up) - 0.42 * Math.sin(Math.PI * up) * 0.8;
      o.sit = Math.sin(Math.PI * up) * 0.9;
      o.armL = 1.6 * (1 - fl) * 0.2 + fl * 1.3; o.armR = fl * 1.1;
      return o;
    }
    if (p.sitting) {
      const up = smooth(p.tReact + 0.2, p.tRun, T);
      o.sit = 1 - up;
      if (p.sand) o.y = gy - 0.45 * (1 - up);
    }
    if (p.swimmer) {
      o.y = -1.15 + 0.05 * Math.sin(T * 1.6 + p.ph);
      o.armL = 0.6 + 0.3 * Math.sin(T * 1.3 + p.ph); o.armR = 0.6 + 0.3 * Math.sin(T * 1.1 + p.ph * 2);
    }
    if (p.volley && T < p.tReact) {
      const b = Math.sin(T * 2.3 + p.ph);
      o.armL = 0.5 + 0.9 * Math.max(0, b); o.armR = 0.5 + 0.9 * Math.max(0, b);
      o.y = gy + 0.25 * Math.max(0, Math.sin(T * 2.3 + p.ph + 0.4)) * (b > 0.8 ? 1 : 0);
    }
    if (p.phone) { o.armR = 1.0; o.look = 0.12; }
    // the flinch: arms over the face, a duck forward
    if (fl > 0) {
      o.armL = lerp(o.armL, 1.35, fl); o.armR = lerp(o.armR, 1.45, fl);
      o.pitch += 0.22 * fl; o.look = lerp(o.look, -0.2, fl);
    }
    return o;
  }
  // running
  const [ax, az, bx, bz] = p.path;
  const runYaw = Math.atan2(-(bx - ax), -(bz - az));
  const turn = smooth(p.tRun - 0.05, p.tRun + 0.35, T);
  let dy = runYaw - p.yaw; dy -= 2 * Math.PI * Math.round(dy / (2 * Math.PI));
  o.yaw = p.yaw + dy * turn;
  const tr = T - p.tRun;
  o.walk = p.ph + (tr < 0.7 ? p.ur * tr * tr / 1.4 : p.ur * (tr - 0.35)) / 1.15 * Math.PI;
  o.stride = 1.6 * clamp(w0.u / p.ur);
  // one arm stays up over the eyes (some), the other pumps
  o.armL = p.seed < 0.5 ? 1.45 : 0; o.armR = 0;
  o.pitch = 0.12;
  if (p.swimmer) { o.y = -1.15; o.stride = 0.2; }
  // into the sea: wading (sinking with the sea floor), then a dive, and under
  if (p.sea) {
    const water = Math.max(0, -gy);                    // how deep the water is here
    o.y = Math.max(gy, -1.2);
    if (water > 0.4) o.stride *= 1 - smooth(0.4, 1.1, water) * 0.6;
    if (w0.done) {
      const k = clamp(w0.over / 2.5);
      o.pitch = lerp(0.12, 1.4, smooth(0, 0.5, k));
      o.y = lerp(o.y, -2.6, smooth(0.1, 1, k));
      o.armL = o.armR = 1.6 * smooth(0, 0.3, k);
    }
  }
  return o;
}
