// The cars. Rush hour: the cross street has the green (its traffic flows through the intersection both ways), the
// avenue waits at the red in queues on both sides. About half the drivers are men. When they vanish (V_EVENT):
//   - a woman at the wheel brakes to a stop (after a startled moment);
//   - a car with nobody at the wheel rolls on: on the cross street it coasts on at speed and runs into whatever is
//     ahead (a crash: both cars shoved, slewed round, steam from the crumpled front); in the queues it creeps forward at
//     idle (an automatic in Drive) into the car ahead.
// Each lane is simulated once at load (1/120 s steps), so a car never jumps. The overpass traffic (trucks and cars) is
// drawn too: flowing at frame 0; from the dusk scene on, stopped where it ended up (a jack-knifed truck among them).
// The same lanes run again without the vanishing for the scenes a year later and in 2046 (normal traffic).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFleet } from './cars.js';
import { rng, smooth, clamp } from './util.js';
import { V_EVENT, V_NIGHT1, V_MORN, V_LAPSE, V_LAB, V_PREG, V_BABY } from './timeline.js';
import { LANES_NB, LANES_SB, LANES_EB, LANES_WB, STOP_NB, STOP_SB, HWY, HWY_LANES, CAM0, AV } from './layout.js';

const DT = 1 / 120, V0 = -2.0, V1 = 14.0, N = Math.ceil((V1 - V0) / DT);
const CRUISE = 10.5, CREEP = 1.7, LEN = [4.5, 4.0, 4.6, 4.9];
const PAINT = [0xe8e8e8, 0xc02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0x8a1a1a, 0x5a6a7a, 0x3a3a40];
const TAXI = 0xf0c030;

// lanes: axis (the coordinate the car moves along), dir (+1/-1), off (the other coordinate), queue (stopped at a red)
const LANES = [
  ...LANES_NB.map((x) => ({ axis: 'z', dir: -1, off: x, stop: STOP_NB })),
  ...LANES_SB.map((x) => ({ axis: 'z', dir: 1, off: x, stop: STOP_SB })),
  ...LANES_EB.map((z) => ({ axis: 'x', dir: 1, off: z })),
  ...LANES_WB.map((z) => ({ axis: 'x', dir: -1, off: z })),
];
export const CARS = [];
export const CRASHES = [];
{
  const R = rng(6161);
  LANES.forEach((L, li) => {
    const lane = [];
    if (L.stop !== undefined) {
      // a queue at the red: front bumper at the stop line, then nose to tail
      let front = L.stop * L.dir;
      for (let k = 0; k < 12; k++) {
        const kind = [0, 1, 2, 2, 3, 0][Math.floor(R() * 6)], len = LEN[kind];
        lane.push({ p0: front - len / 2, len, kind });
        front -= len + 1.4 + R() * 1.6;
      }
    } else {
      for (let p = 260; p > -320; p -= 15 + R() * 14) {
        const kind = [0, 1, 2, 2, 3, 0][Math.floor(R() * 6)];
        lane.push({ p0: p, len: LEN[kind], kind });
      }
    }
    lane.forEach((c, k) => {
      const taxi = R() < 0.18;
      Object.assign(c, { lane: li, L, k, ahead: k ? k - 1 : -1, col: taxi ? TAXI : PAINT[Math.floor(R() * PAINT.length)], taxi,
        driverless: R() < 0.52, react: 0.45 + R() * 0.6, drift: (R() - 0.5) * 0.5, ph: R() * 10 });
    });
    // the cross street: make sure crashes happen where you can see them (the car nearest the middle of the
    // intersection when it happens has a woman at the wheel who stops; the one behind it nobody)
    if (L.stop === undefined) {
      const pAt = (c) => c.p0 + CRUISE * (V_EVENT - V0);
      let best = -1, bd = 1e9;
      const tgt = L.dir > 0 ? -8 : 4;
      lane.forEach((c, k) => { const d = Math.abs(pAt(c) * L.dir - tgt); if (d < bd && k > 0) { bd = d; best = k; } });
      if (best >= 0 && lane[best + 1]) {
        // (she stops; right behind her, tailgating in the rush, a car whose driver has just gone)
        const w = lane[best], f = lane[best + 1], gapT = [4.5, 7.5, 5.5, 9.0][li - 4] ?? 6;
        w.driverless = false; w.react = 0.3; f.driverless = true; f.tail = true;
        const want = w.p0 - (w.len + f.len) / 2 - gapT, shift = f.p0 - want;
        for (let k = best + 1; k < lane.length; k++) lane[k].p0 -= shift > 0 ? shift : 0;
        if (shift < 0) f.p0 = want;
      }
    } else {
      lane[0].driverless = false;   // (the first car in each queue: a woman, who stays put)
    }
    lane.forEach((c) => { c.i = CARS.length; CARS.push(c); });
    L.cars = lane;
  });
  // ---- simulate every lane: once with the vanishing, once as a normal evening ----
  const sim = (event) => {
    for (const L of LANES) {
      const cars = L.cars;
      const st = cars.map((c) => ({ p: c.p0 - (L.stop === undefined ? CRUISE * (0 - V0) * 0 : 0), sp: L.stop === undefined ? CRUISE : 0, wreck: -1, yawT: 0 }));
      const P = cars.map(() => new Float32Array(N + 1)), S = cars.map(() => new Float32Array(N + 1)), B = cars.map(() => new Uint8Array(N + 1));
      for (let n = 0; n <= N; n++) {
        const v = V0 + n * DT;
        const after = event && v >= V_EVENT;
        cars.forEach((c, k) => {
          const s = st[k];
          let target, acc;
          const a = k ? st[k - 1] : null, gap = a ? (a.p - cars[k - 1].len / 2) - (s.p + c.len / 2) : 1e9;
          let braking = 0;
          if (s.wreck >= 0) { s.sp = Math.max(0, s.sp - 7 * DT); }
          else if (L.stop !== undefined) {
            if (after && c.driverless) { s.sp = Math.min(CREEP, s.sp + CREEP / 1.4 * DT); }
            else s.sp = 0;
          } else if (!after || (!c.driverless && v < V_EVENT + c.react)) {
            // normal driving: cruise, keep a gap
            target = c.tail ? CRUISE : Math.min(CRUISE, Math.max(0, (gap - 3.5) / 1.1));
            acc = target > s.sp ? 2.0 : -6.0;
            s.sp = target > s.sp ? Math.min(target, s.sp + acc * DT) : Math.max(target, s.sp + acc * DT);
            braking = target < s.sp - 0.2 ? 1 : 0;
          } else if (!c.driverless) {
            // she brakes hard (and harder if she has to)
            const need = s.sp * s.sp / Math.max(0.5, 2 * (gap - 0.8));
            s.sp = Math.max(0, s.sp - Math.max(7.5, Math.min(9, need)) * DT); braking = 1;
          } else {
            s.sp = Math.max(CREEP, s.sp - 0.5 * DT);   // nobody at the wheel: it coasts on
          }
          s.p += s.sp * DT;
          // contact with the car ahead
          if (a) {
            const lim = (a.p - cars[k - 1].len / 2) - c.len / 2 - 0.05;
            if (s.p > lim) {
              const rel = s.sp - a.sp;
              if (rel > 2.2) {
                const vc = (s.sp + a.sp) / 2;
                s.sp = vc * 0.9; a.sp = vc * 1.05;
                if (s.wreck < 0) s.wreck = v; if (a.wreck < 0) a.wreck = v;
                s.yawT += (R() < 0.5 ? -1 : 1) * (0.05 + 0.03 * rel); a.yawT += (R() < 0.5 ? -1 : 1) * (0.03 + 0.015 * rel);
                if (event) CRASHES.push({ t: v, a: c.i, b: cars[k - 1].i, rel, ...carXZ(L, lim + c.len / 2) });
              } else s.sp = Math.min(s.sp, a.sp);
              s.p = lim;
            }
          }
          P[k][n] = s.p; S[k][n] = s.sp; B[k][n] = braking;
        });
      }
      cars.forEach((c, k) => {
        const key = event ? 'e' : 'n';
        c[key] = { P: P[k], S: S[k], B: B[k], wreck: st[k].wreck, yawT: st[k].yawT };
      });
    }
  };
  sim(true);
  sim(false);
  // (the ones that move after the vanishing: people keep out of their way)
  for (const c of CARS) c.moves = c.L.stop === undefined || c.driverless;
  console.log(`traffic: ${CARS.length} cars, crashes at ${CRASHES.filter((x) => Math.abs(x.x) < 60).map((x) => `${x.t.toFixed(2)}s (${x.rel.toFixed(1)} m/s @ ${x.x.toFixed(0)},${x.z.toFixed(0)})`).join(', ')}`);
}
function carXZ(L, p) { const s = p * L.dir; return L.axis === 'z' ? { x: L.off, z: s } : { x: s, z: L.off }; }
const sampleA = (a, v) => { const f = clamp((v - V0) / DT, 0, N - 0.001), k = Math.floor(f), u = f - k; return a[k] * (1 - u) + a[k + 1] * u; };
// where car c is at video time v, along its own (event) run: { x, z, yaw, len, sp, braking, wreckK, lat }
export function carAt(c, v, normal = false) {
  const run = normal ? c.n : c.e;
  const vv = Math.min(v, V1 - 0.01);
  const p = sampleA(run.P, vv), sp = sampleA(run.S, vv);
  const L = c.L;
  // nobody at the wheel: a slow drift to one side
  const t0 = Math.max(0, vv - V_EVENT), t = run.wreck >= 0 ? Math.min(t0, Math.max(0, run.wreck - V_EVENT)) : t0;
  const lat = !normal && c.driverless && L.stop === undefined ? clamp(0.5 * c.drift * t * t, -1.1, 1.1) : 0;
  const wk = run.wreck >= 0 ? smooth(run.wreck, run.wreck + 0.45, vv) : 0;
  const base = carXZ(L, p);
  const yaw0 = L.axis === 'z' ? (L.dir < 0 ? 0 : Math.PI) : (L.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  const yaw = yaw0 + run.yawT * wk + (lat !== 0 ? -Math.sign(L.dir) * c.drift * 0.04 * Math.min(t, 3) : 0);
  if (L.axis === 'z') base.x += lat * -L.dir; else base.z += lat * L.dir;
  return { x: base.x, z: base.z, yaw, len: c.len, sp, braking: sampleA(run.B, vv) > 0.5, wreckK: wk, wreck: run.wreck };
}

// ---- the highway: trucks and cars ----
export const HWYV = [];
export let JACK = null;
export const SPILL = [];
{
  const R = rng(818);
  HWY_LANES.forEach((z, li) => {
    const dir = li < 2 ? -1 : 1;
    for (let x = -700; x < 700; x += 26 + R() * 40) {
      const truck = R() < 0.5;
      HWYV.push({ z, dir, x0: x, truck, len: truck ? 19 : 4.5, kind: Math.floor(R() * 4), col: PAINT[Math.floor(R() * PAINT.length)], box: [0xf0f0f0, 0xe8e2d0, 0xc02a2a, 0x2a5ab0, 0xd0d4d8, 0x3a6a3a][Math.floor(R() * 6)],
        driverless: truck ? R() < 0.92 : R() < 0.5, ph: R() * 10 });
    }
  });
  // where they end up (from the first night on): a jam of stopped vehicles in every lane, nose to tail; in the outer
  // east-bound lane a truck jack-knifed, its trailer swung across into the next lane and split open, crates of food and
  // oranges spilled over the road
  const RJ = rng(919);
  for (const z of HWY_LANES) {
    const lane = HWYV.filter((h) => h.z === z);
    let x = 16 - RJ() * 8;
    for (const h of lane) { h.xEnd = x - h.len / 2; x -= h.len + 1.2 + RJ() * (h.truck ? 6 : 9); }
  }
  const jk = HWYV.filter((h) => h.truck && h.z === HWY_LANES[3] && h.xEnd < -14)[0];
  if (jk) {
    jk.jack = -0.45;
    // (nothing stopped where its trailer swung)
    for (const h of HWYV) if (h.z === HWY_LANES[2] && h.xEnd + h.len / 2 > jk.xEnd - 26 && h.xEnd - h.len / 2 < jk.xEnd + 6) h.xEnd = 1e4;
  }
  JACK = jk || null;
  // the spill: crates and oranges behind the split trailer
  if (jk) {
    const R2 = rng(77), bx = jk.xEnd + 5.75 - 1.7 - 13.4 * Math.cos(0.45) - 1.0, bz = jk.z - 13.4 * Math.sin(0.45);
    for (let i = 0; i < 46; i++) {
      const a = R2() * Math.PI * 1.2 + 1.3, r = Math.pow(R2(), 0.7) * 7;
      SPILL.push({ crate: true, x: bx + Math.cos(a) * r, z: bz + Math.sin(a) * r * 0.55, yaw: R2() * 6.28, tip: R2() < 0.3 ? (R2() - 0.5) * 1.4 : 0, s: 0.8 + R2() * 0.4, c: R2() });
    }
    for (let i = 0; i < 320; i++) {
      const a = R2() * Math.PI * 2, r = Math.pow(R2(), 0.6) * 9;
      SPILL.push({ crate: false, x: bx + Math.cos(a) * r - 1.5, z: bz + Math.sin(a) * r * 0.5, c: R2() });
    }
  }
}
export function hwyAt(h, v, normal = false) {
  if (!normal && v >= V_NIGHT1) return { x: h.xEnd, yaw: h.jack || 0 };
  let x = h.x0 + h.dir * 24 * ((normal ? v : Math.min(v, V_EVENT)) - V0);
  if (!normal && v > V_EVENT) { const u = v - V_EVENT, d = h.driverless ? 0.7 : 6, ts = 24 / d; x += h.dir * (u < ts ? 24 * u - 0.5 * d * u * u : 24 * ts / 2); }
  x = ((x + 700) % 1400 + 1400) % 1400 - 700;
  return { x, yaw: 0 };
}

export function makeTraffic(scene, ctx) {
  const nH = HWYV.filter((h) => !h.truck).length;
  const fleet = makeFleet(scene, CARS.length + nH, ctx);
  CARS.forEach((c) => fleet.color(c.i, c.col, c.kind));
  const hCars = HWYV.filter((h) => !h.truck);
  hCars.forEach((h, k) => { h.fi = CARS.length + k; fleet.color(h.fi, h.col, h.kind % 4); });
  // trucks: a detailed cab (hood, grille, bumper, windscreen and side windows, mirrors, sleeper, exhaust stacks, fuel
  // tanks) and a box trailer (a coloured band, a dark under-rail, rear doors, two axles); front = -z like the cars
  const trucks = HWYV.filter((h) => h.truck);
  const G = (geos) => mergeGeometries(geos.map((g) => g.toNonIndexed()));
  const cylZ = (r, l, x, y, z) => new THREE.CylinderGeometry(r, r, l, 12).rotateZ(Math.PI / 2).translate(x, y, z);
  const cabPaintG = G([
    new THREE.BoxGeometry(2.45, 2.0, 2.2).translate(0, 2.3, -1.1),            // cab
    new THREE.BoxGeometry(2.3, 1.15, 1.6).translate(0, 1.6, -2.9),            // hood
    new THREE.BoxGeometry(2.45, 2.6, 1.5).translate(0, 2.6, 0.75),            // sleeper
    new THREE.BoxGeometry(2.4, 0.5, 0.9).translate(0, 3.65, -0.9),            // roof fairing
  ]);
  const cabDarkG = G([
    new THREE.BoxGeometry(1.5, 1.0, 0.08).translate(0, 1.65, -3.72),           // grille
    new THREE.BoxGeometry(2.55, 0.35, 0.3).translate(0, 0.75, -3.75),          // bumper
    ...[-1, 1].map((sx) => new THREE.CylinderGeometry(0.32, 0.32, 1.3, 14).rotateX(Math.PI / 2).translate(sx * 1.05, 0.95, -0.6)),   // fuel tanks
    ...[-1, 1].map((sx) => new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8).translate(sx * 1.3, 3.0, 0.05)),                            // stacks
    ...[-1, 1].map((sx) => new THREE.BoxGeometry(0.06, 0.45, 0.22).translate(sx * 1.55, 2.6, -2.15)),                                 // mirrors
    ...[-1, 1].map((sx) => new THREE.BoxGeometry(0.35, 0.05, 0.05).translate(sx * 1.38, 2.6, -2.15)),
    ...[[-1, -2.9], [1, -2.9], [-1, 0.6], [1, 0.6], [-1, 1.9], [1, 1.9]].map(([sx, z]) => cylZ(0.5, 0.35, sx * 1.05, 0.5, z)),       // wheels
  ]);
  const cabGlassG = G([
    new THREE.BoxGeometry(2.2, 0.95, 0.06).translate(0, 2.75, -2.22).rotateX(0),  // windscreen
    ...[-1, 1].map((sx) => new THREE.BoxGeometry(0.06, 0.8, 1.2).translate(sx * 1.24, 2.75, -1.35)),
  ]);
  const trailG = G([new THREE.BoxGeometry(2.55, 2.9, 13.4).translate(0, 2.55, 0)]);
  const trailBandG = G([...[-1, 1].map((sx) => new THREE.BoxGeometry(0.03, 0.55, 12.6).translate(sx * 1.29, 2.4, 0))]);
  const trailDarkG = G([
    new THREE.BoxGeometry(2.6, 0.25, 13.4).translate(0, 1.0, 0),
    new THREE.BoxGeometry(0.06, 2.7, 0.04).translate(0, 2.55, 6.72),           // the rear doors' seam
    new THREE.BoxGeometry(2.4, 0.06, 0.04).translate(0, 3.85, 6.72),
    ...[[-1, 4.2], [1, 4.2], [-1, 5.5], [1, 5.5]].map(([sx, z]) => cylZ(0.5, 0.55, sx * 0.95, 0.5, z)),
    new THREE.BoxGeometry(2.0, 0.6, 0.15).translate(0, 0.75, 6.65),            // under-ride bar
  ]);
  const mk = (g, mat) => { const m = new THREE.InstancedMesh(g, mat, trucks.length); ctx.shadowy(m); scene.add(m); return m; };
  const cabM = mk(cabPaintG, ctx.plainMat(0xffffff, 0.4, { metalness: 0.25 }));
  const cabD = mk(cabDarkG, ctx.plainMat(0x1c1d20, 0.6, { metalness: 0.3 }));
  const cabW = mk(cabGlassG, ctx.plainMat(0x0e141c, 0.12, { metalness: 0.5 }));
  const boxM = mk(trailG, ctx.plainMat(0xffffff, 0.7));
  const bandM = mk(trailBandG, ctx.plainMat(0xffffff, 0.6));
  const trD = mk(trailDarkG, ctx.plainMat(0x18191b, 0.8));
  const BANDC = [0xc02a2a, 0x2a5ab0, 0x2a8a4a, 0xf0a020, 0x1d1d1d, 0x7a2a8a];
  trucks.forEach((h, k) => {
    cabM.setColorAt(k, new THREE.Color(h.col)); boxM.setColorAt(k, new THREE.Color(h.box));
    bandM.setColorAt(k, new THREE.Color(BANDC[k % BANDC.length]));
  });
  // the spill: cardboard crates and oranges
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.4, 0.42).translate(0, 0.2, 0), ctx.plainMat(0xffffff, 0.85), Math.max(1, SPILL.filter((c) => c.crate).length));
  const fruit = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6).translate(0, 0.045, 0), ctx.plainMat(0xffffff, 0.6), Math.max(1, SPILL.filter((c) => !c.crate).length));
  {
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), pp = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color();
    let ci = 0, fi = 0;
    for (const s of SPILL) {
      if (s.crate) {
        ee.set(s.tip, s.yaw, 0); qq.setFromEuler(ee);
        crates.setMatrixAt(ci, mm.compose(pp.set(s.x, HWY.y, s.z), qq, ss.setScalar(s.s)));
        crates.setColorAt(ci++, cc.set(s.c < 0.6 ? 0xb08a5a : s.c < 0.85 ? 0xc8a070 : 0x8a6a40));
      } else {
        fruit.setMatrixAt(fi, mm.makeTranslation(s.x, HWY.y, s.z));
        fruit.setColorAt(fi++, cc.set(s.c < 0.7 ? 0xf08a18 : s.c < 0.85 ? 0xd83020 : 0xe8c830));
      }
    }
    for (const m of [crates, fruit]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  }
  const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const dusty = new THREE.Color(0.32, 0.3, 0.27), tc = new THREE.Color();
  return {
    frame(v, s, glows, smoke) {
      const era = s.era, normal = era > 0;
      // day 0: real time; through the first night the cars that still creep move on in time-lapse; then they stay
      // where they ended up. The months after: the wrecks cleared, a few cars parked at the lights. Day 280: traffic.
      const vv = era === 1 ? -1.0 : era === 2 ? v - V_BABY - 1.2 : v < V_NIGHT1 ? v : v < V_MORN ? V_NIGHT1 + (V1 - 0.02 - V_NIGHT1) * smooth(V_NIGHT1, V_MORN, v) : V1 - 0.02;
      const lightsOn = v < V_MORN || era === 2;
      const dust = era === 0 ? smooth(V_LAPSE, V_LAB, v) : 0;
      for (const c of CARS) {
        const a = carAt(c, vv, normal);
        const along = c.L.axis === 'z' ? a.z : a.x;
        if (Math.abs(along) > 330 || (era === 1 && c.L.stop === undefined)) { fleet.set(c.i, zero, false); continue; }
        const rx = (a.braking ? -0.012 : 0) + 0.003 * Math.sin(v * 13 + c.ph) * Math.min(a.sp / 10, 1) - 0.02 * a.wreckK * Math.exp(-Math.max(0, vv - (a.wreck || 0)) * 4);
        e.set(rx, a.yaw, 0.01 * a.wreckK);
        q.setFromEuler(e);
        m4.compose(p.set(a.x, 0, a.z), q, one);
        fleet.set(c.i, m4, lightsOn);
        if (dust > 0) fleet.color(c.i, tc.set(c.col).lerp(dusty, dust * 0.6), c.kind); else if (v < V_LAPSE + 0.1 || era > 0) fleet.color(c.i, c.col, c.kind);
        if (lightsOn) {
          const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), half = c.len / 2 + 0.05, w = 0.7;
          const br = a.braking || (c.driverless === false && !normal && vv > V_EVENT + c.react && c.L.stop === undefined) ? 1.6 : 0.45;
          for (const sd of [-1, 1]) {
            const ox = -fz * sd * w, oz = fx * sd * w;
            glows.add(a.x + ox - fx * half, 0.74, a.z + oz - fz * half, 0.3, 2.4 * br, 0.1 * br, 0.04 * br);
            glows.add(a.x + ox + fx * half, 0.7, a.z + oz + fz * half, 0.42, 2.0, 1.9, 1.6);
          }
        }
        // steam from a crumpled front
        if (a.wreck >= 0 && !normal && smoke && v < V_MORN + 5) {
          const t0 = a.wreck, fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
          for (let k = 0; k < 4; k++) {
            const T = 2.6, age = ((vv - t0) + k * T / 4 + c.ph) % T;
            if (vv - t0 < age) continue;
            smoke.puff(a.x + fx * (c.len / 2 - 0.4) + 0.2 * age, 1.0 + 0.9 * age, a.z + fz * (c.len / 2 - 0.4), 0.35 + 0.55 * age, 0.4 * (1 - age / T) * (v < V_NIGHT1 ? 1 : 0.5), 0.85, 0, (c.i * 0.13 + k * 0.21) % 1);
          }
        }
      }
      // the highway
      hCars.forEach((h) => {
        const a = hwyAt(h, era === 2 ? vv : era === 1 ? -1 : v, era > 0);
        e.set(0, h.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0); q.setFromEuler(e);
        fleet.set(h.fi, m4.compose(p.set(a.x, HWY.y, h.z), q, one), lightsOn);
        if (lightsOn) glows.add(a.x + h.dir * 2.3, HWY.y + 0.7, h.z, 0.45, 2, 1.9, 1.6);
      });
      trucks.forEach((h, k) => {
        const a = hwyAt(h, era === 2 ? vv : era === 1 ? -1 : v, era > 0);
        if (Math.abs(a.x) > 900) { for (const m of [cabM, cabD, cabW, boxM, bandM, trD]) m.setMatrixAt(k, zero); return; }
        e.set(0, (h.dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0); q.setFromEuler(e);
        const fx = h.dir;
        // cab at the front, trailer behind (jack-knifed: the trailer swung round its hitch)
        const cabX = a.x + fx * 5.75;
        m4.compose(p.set(cabX, HWY.y, h.z), q, one);
        cabM.setMatrixAt(k, m4); cabD.setMatrixAt(k, m4); cabW.setMatrixAt(k, m4);
        const jy = a.yaw;
        e.set(0, (h.dir > 0 ? -Math.PI / 2 : Math.PI / 2) + jy, 0); q.setFromEuler(e);
        const hx = cabX - fx * 1.7, bx = hx - fx * Math.cos(jy) * 6.7, bz = h.z + Math.sin(jy) * 6.7 * (h.dir > 0 ? 1 : -1);
        m5.compose(p.set(bx, HWY.y, bz), q, one);
        boxM.setMatrixAt(k, m5); bandM.setMatrixAt(k, m5); trD.setMatrixAt(k, m5);
        if (lightsOn) {
          for (const sd of [-0.85, 0.85]) glows.add(cabX - fx * 3.8, HWY.y + 1.15, h.z + sd, 0.45, 2.2, 2.0, 1.6);
          for (let j = -2; j <= 2; j++) glows.add(bx + fx * j * 3.1 * Math.cos(jy), HWY.y + 4.05, bz + j * 3.1 * Math.sin(jy) * (h.dir > 0 ? 1 : -1), 0.22, 2.4, 1.0, 0.1);
        }
      });
      for (const m of [cabM, cabD, cabW, boxM, bandM, trD]) m.instanceMatrix.needsUpdate = true;
      fleet.commit();
    },
  };
}
export { CAM0, AV };
