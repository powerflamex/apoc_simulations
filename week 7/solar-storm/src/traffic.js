// The traffic. Cars keep running through the whole storm (a car's own electrics are too short to pick up the storm's
// ground currents): headlights on, engines running. Planned up front so that no car ever overlaps another:
//   - the avenue: two lanes each way, simulated once at load (each car keeps its distance to the one ahead and brakes for
//     anything in its lane); before the hit the lights are green for the avenue and it flows at ~25 km/h; after it the
//     drivers slow to a crawl;
//   - the cross street waits at its red light; when the lights die the first eastbound car (C) edges out into the
//     crossing and at 0:14.2 a northbound car (N) runs into its side at walking pace: both stop with a jolt, hazard
//     lights on; the cars behind N queue up; the southbound lanes stop short of the crossing and wait.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, clamp, lerp } from './util.js';
import { V_HIT, V_BUMP } from './timeline.js';
import { LANES, CROSS, CURB, FX } from './layout.js';

const PAINT = [0xe8e8e8, 0xd02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0xe87a2a, 0x5a2a6a, 0x80c0e0, 0xf0c030];
const KLEN = [4.5, 4.0, 4.6, 4.9];
const DT = 1 / 60, V0 = -40, V1 = 49;
export const EB_Z = CROSS[1] - 3.2, WB_Z = CROSS[0] + 3.2;             // the cross street's lanes (eastbound on the south side)
export const C_X = LANES[2] - 0.9 - 2.3;                              // where C's middle is when it hits N's side
const N_LANE = 2;                                                     // (LANES[2] = 1.75: northbound, inner)
const N_MID = EB_Z;                                                   // N's middle when C hits it
// the avenue's wanted speed (m/s) at time v
const want = (v) => lerp(7.0, 2.6, smooth(V_HIT + 0.5, V_HIT + 4.5, v));
// C: waits at the stop line, edges out from 0:09.6, N runs into it at V_BUMP; a small shove
function cAt(v) {
  const xs = -FX - 3.4;                                             // its middle while waiting at the stop line
  const t0 = 10.4, L = C_X - xs;
  let x;
  if (v <= t0) x = xs;
  else if (v <= V_BUMP) { const u = (v - t0) / (V_BUMP - t0); x = xs + L * (0.5 * u + 0.5 * u * u); }
  else x = C_X + 0.35 * (1 - Math.exp(-(v - V_BUMP) / 0.08));
  const yaw = -Math.PI / 2 + (v > V_BUMP ? 0.1 * (1 - Math.exp(-(v - V_BUMP) / 0.12)) : 0);
  return { x, z: EB_Z, yaw };
}
// N, knocked sideways by the hit: x offset and turn
export function nShove(v) {
  const t = v - V_BUMP;
  if (t <= 0) return { dx: 0, dyaw: 0, roll: 0 };
  const k = 1 - Math.exp(-t / 0.1);
  return { dx: 0.75 * k, dyaw: -0.22 * k, roll: 0.06 * Math.exp(-t / 0.25) * Math.sin(t * 18) };
}

// ---- the avenue simulation ----
function simLane(li, R) {
  const x = LANES[li], dir = li < 2 ? 1 : -1;           // southbound lanes move toward +z
  const z0 = dir > 0 ? -240 : 62, L = 305;
  const zOf = (s) => z0 + dir * s;
  const sOf = (z) => (z - z0) * dir;
  const nF = Math.round((V1 - V0) / DT) + 1;
  const cars = [];
  // N: scripted (its front reaches C's side at V_BUMP), then stopped
  let hero = null;
  if (li === N_LANE) {
    const sb = sOf(N_MID);
    const sAt = new Float32Array(nF);
    let s = sb;
    const k0 = Math.round((V_BUMP - V0) / DT);
    for (let k = k0; k >= 0; k--) { sAt[k] = s; s -= want(V0 + k * DT) * DT; }
    for (let k = k0 + 1; k < nF; k++) { const t = V0 + k * DT - V_BUMP; sAt[k] = sb + 0.35 * (1 - Math.exp(-t / 0.12)); }
    hero = { li, kind: 0, len: 4.5, col: 0xd02a2a, s: sAt, born: -1, hero: true, sp: 0 };
  }
  const live = [];
  let nextGap = 0;
  for (let k = 0; k < nF; k++) {
    const v = V0 + k * DT;
    // N joins the lane when its script brings it in
    if (hero && hero.born < 0 && hero.s[k] >= 0) { hero.born = k; live.push(hero); cars.push(hero); }
    // spawn at the entry when there's room
    const last = live.length ? live[live.length - 1] : null;
    const lastS = last ? (last.hero ? last.s[k] : last.cur) : 1e9;
    const heroNear = hero && hero.born < 0 && hero.s[k] > -nextGap - 8;
    if (!heroNear && lastS - (last ? last.len : 0) > nextGap) {
      const kind = [0, 0, 1, 2, 2, 3][Math.floor(R() * 6)];
      const c = { li, kind, len: KLEN[kind], col: PAINT[Math.floor(R() * PAINT.length)], s: new Float32Array(nF).fill(NaN), born: k, cur: 0, sp: last && !last.hero ? last.sp : want(v), haz: R() < 0.35, ph: R() };
      live.push(c); cars.push(c);
      nextGap = 7 + R() * 16;
    }
    // drive (front car first)
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      if (c.hero) continue;
      let lim = want(v);
      // the southbound lanes stop short of the dead crossing (and stay: nobody knows who goes); a car already within
      // a few metres of it when the lights die goes on through, quickly
      if (dir > 0 && v > V_HIT + 0.6) {
        const stopS = sOf(CROSS[0] - 4.3) - c.len / 2;
        if (c.held === undefined) c.held = c.cur <= stopS - 3;
        if (c.held) lim = Math.min(lim, Math.max(0, (stopS - c.cur) * 1.2));
        else if (c.cur < stopS + 30) lim = 5.5;
      }
      const a = i > 0 ? live[i - 1] : null;
      if (a) {
        const as = a.hero ? a.s[k] : a.cur;
        const gap = as - a.len / 2 - (c.cur + c.len / 2) - 2.2;
        lim = Math.min(lim, Math.max(0, gap / 1.1));
      }
      const acc = clamp((lim - c.sp) / 0.5, -7, 2.4);
      c.sp = Math.max(0, c.sp + acc * DT);
      c.cur += c.sp * DT;
      if (c.held) c.cur = Math.min(c.cur, sOf(CROSS[0] - 4.3) - c.len / 2);
      c.s[k] = c.cur;
    }
    for (let i = live.length - 1; i >= 0; i--) { const c = live[i]; const s = c.hero ? c.s[k] : c.cur; if (s > L) live.splice(i, 1); }
  }
  for (const c of cars) { c.x = x; c.dir = dir; c.zOf = zOf; }
  return cars;
}

export const CARS = [];
const R0 = rng(9090);
for (let li = 0; li < 4; li++) CARS.push(...simLane(li, R0));
export const HERO_N = CARS.find((c) => c.hero);
// the cross street: queues at both stop lines (C is the first eastbound one)
export const CROSS_CARS = [];
{
  const R = rng(77);
  for (let k = 0; k < 7; k++) { const kind = [0, 0, 1, 2, 3][Math.floor(R() * 5)]; CROSS_CARS.push({ x: -FX - 3.4 - k * (6.6 + R() * 1.5), z: EB_Z, yaw: -Math.PI / 2, kind, col: k === 0 ? 0xe8e8e8 : PAINT[Math.floor(R() * PAINT.length)], C: k === 0, haz: R() < 0.4, ph: R() }); }
  for (let k = 0; k < 7; k++) { const kind = [0, 0, 1, 2, 3][Math.floor(R() * 5)]; CROSS_CARS.push({ x: FX + 3.4 + k * (6.6 + R() * 1.5), z: WB_Z, yaw: Math.PI / 2, kind, col: PAINT[Math.floor(R() * PAINT.length)], haz: R() < 0.4, ph: R() }); }
}
// where car c is at time v (null when off the avenue)
export function carAt(c, v) {
  const f = clamp((v - V0) / DT, 0, c.s.length - 1.001), k = Math.floor(f);
  const a = c.s[k], b = c.s[k + 1];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const s = a + (b - a) * (f - k);
  if (s < 0 || s > 305) return null;
  return { x: c.x, z: c.zOf(s), yaw: c.dir > 0 ? Math.PI : 0, s, sp: (b - a) / DT };
}
export { cAt };

export function makeTraffic(scene, ctx) {
  const all = [...CARS, ...CROSS_CARS];
  const fleet = makeFleet(scene, all.length, ctx);
  all.forEach((c, i) => { c.i = i; fleet.color(i, c.col, c.kind); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (i, x, z, yaw, pitch = 0) => { e.set(pitch, yaw, 0); q.setFromEuler(e); m4.compose(p.set(x, 0, z), q, one); fleet.set(i, m4, true); };
  return {
    // fills `lights`: [x, y, z, size, r, g, b] glows; `beams`: headlight cones for the ground [x, z, yaw, strength]
    frame(v, glows, beams, camPos) {
      const hazOn = (c, t0) => v > t0 && Math.sin((v + c.ph) * Math.PI * 2 * 1.4) > 0;
      const lightsAt = (c, x, z, yaw, len, braking, haz) => {
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
        const h = len / 2;
        // fade in far off (cars come round the corner at the far end)
        const far = clamp(1 - (Math.hypot(x - camPos.x, z - camPos.z) - 200) / 40, 0, 1);
        for (const sd of [-1, 1]) {
          glows.add(x + fx * (h + 0.1) + sx * sd * 0.62, 0.7, z + fz * (h + 0.1) + sz * sd * 0.62, 0.32, 3.2 * far, 3.0 * far, 2.6 * far);
          const tb = braking ? 2.2 : 0.8;
          glows.add(x - fx * (h + 0.12) + sx * sd * 0.65, 0.75, z - fz * (h + 0.12) + sz * sd * 0.65, 0.22, tb * far, 0.05 * far, 0.03 * far);
          if (haz) for (const fb of [1, -1]) glows.add(x + fx * fb * (h + 0.1) + sx * sd * 0.82, 0.72, z + fz * fb * (h + 0.1) + sz * sd * 0.82, 0.3, 3.0, 1.4, 0.1);
        }
        beams.push([x + fx * h, z + fz * h, Math.atan2(fx, fz), far, Math.hypot(x - camPos.x, z - camPos.z)]);
      };
      for (const c of CARS) {
        if (c.hero) {
          const a = carAt(c, v);
          if (!a) { fleet.set(c.i, zero, false); continue; }
          // the jolt: nose dips as it hits
          const n = nShove(v);
          e.set(0, a.yaw + n.dyaw, n.roll); q.setFromEuler(e); m4.compose(p.set(a.x + n.dx, 0, a.z), q, one); fleet.set(c.i, m4, true);
          lightsAt(c, a.x + n.dx, a.z, a.yaw + n.dyaw, c.len, v > V_BUMP - 0.2, hazOn(c, V_BUMP + 0.8));
          continue;
        }
        const a = carAt(c, v);
        if (!a) { fleet.set(c.i, zero, false); continue; }
        place(c.i, a.x, a.z, a.yaw);
        lightsAt(c, a.x, a.z, a.yaw, c.len, a.sp < 1.5 && v > V_HIT, c.haz && hazOn(c, 16 + c.ph * 6));
      }
      for (const c of CROSS_CARS) {
        let x = c.x, z = c.z, yaw = c.yaw;
        if (c.C) { const a = cAt(v); x = a.x; z = a.z; yaw = a.yaw; }
        place(c.i, x, z, yaw);
        lightsAt(c, x, z, yaw, KLEN[c.kind], true, c.C ? hazOn(c, V_BUMP + 0.9) : c.haz && hazOn(c, 15 + c.ph * 5));
      }
      fleet.commit();
    },
  };
}
