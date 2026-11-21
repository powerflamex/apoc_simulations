// The cars: parked along both curbs, and the afternoon traffic one lane each way. A driver brakes to a stop once the
// heat through the windscreen is past ~1 kW/m² (the street ahead is on fire by then); hotcars.js melts each car from
// the heat where it is. Here: when each one's tires and cabin catch fire (~30 kW/m²), for the flames and smoke.
import * as THREE from 'three';
import { makeFleet } from './hotcars.js';
import { PARKED, MOVING, HEART } from './layout.js';
import { timeOfQ, Q } from './timeline.js';
import { emitColumn } from './smoke.js';
import { rng, clamp } from './util.js';

const PAINT = [0xe8e8e8, 0xc02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0x8a1a1a, 0x5a6a7a, 0x3a3a40, 0xd8a020];
const TAXI = 0xf0c030;
const LEN = [4.5, 4.0, 4.6, 4.9], WID = [1.8, 1.76, 1.88, 1.92];
const rOf = (x, y, z) => Math.hypot(x - HEART.x, y - HEART.y, z - HEART.z);

export const CARS = [];
{
  const R = rng(3232);
  const finish = (c) => {
    c.col = c.hero ? 0xc8262a : R() < 0.15 ? TAXI : PAINT[Math.floor(R() * PAINT.length)];
    const len = LEN[c.kind];
    // the nearest end of the car to you, and its wheels
    const ez = clamp(HEART.z, c.sz - len / 2, c.sz + len / 2), ex = clamp(HEART.x, c.sx - WID[c.kind] / 2, c.sx + WID[c.kind] / 2);
    c.rNear = rOf(ex, 0.6, ez);
    c.rMid = rOf(c.sx, 0.75, c.sz);
    c.wheels = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
      const yaw = c.yaw, wx = sx * (WID[c.kind] / 2 - 0.1), wz = sz * (len / 2 - 0.82);
      const x = c.sx + Math.cos(yaw) * wx + Math.sin(yaw) * wz, z = c.sz - Math.sin(yaw) * wx + Math.cos(yaw) * wz;
      return { x, z, t: timeOfQ(Q.TREE * (0.9 + 0.2 * R()), rOf(x, 0.33, z)), seed: R() };
    }));
    c.tCab = timeOfQ(Q.TREE * 1.3 * (0.85 + 0.3 * R()), c.rMid);
    c.tGone = timeOfQ(Q.VAPOR, c.rMid);
    c.seed = R();
    CARS.push(c);
  };
  for (const p of PARKED) finish({ kind: p.kind, sx: p.x, sz: p.z, yaw: p.yaw, moving: false, hero: p.hero });
  for (const m of MOVING) {
    // where it stops: it brakes once the heat at it is past ~1 kW/m²
    let z = m.z0, ts = 0;
    for (let k = 0; k < 5; k++) {
      ts = timeOfQ(1000, rOf(m.x, 1.2, z)) + 0.5;
      z = m.z0 + m.dir * m.speed * Math.max(ts, -3);
    }
    const brake = 4.5, zs = z + m.dir * m.speed * m.speed / (2 * brake);
    if (zs > 30 || zs < -300) continue;
    finish({ kind: m.kind, sx: m.x, sz: zs, yaw: m.dir < 0 ? 0 : Math.PI, moving: true, m, ts, brake });
  }
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  return {
    frame(v, fire, smoke) {
      CARS.forEach((c, i) => {
        let z = c.sz;
        if (c.moving) {
          const m = c.m;
          if (v < c.ts) z = m.z0 + m.dir * m.speed * v;
          else { const t = Math.min(v - c.ts, m.speed / c.brake); z = m.z0 + m.dir * (m.speed * c.ts + m.speed * t - 0.5 * c.brake * t * t); }
        }
        q.setFromAxisAngle(Y, c.yaw);
        m4.compose(p.set(c.sx, 0, z), q, one);
        fleet.set(i, m4, false);
        if (v > c.tGone + 0.6) return;
        // tires: a flame at each as it catches, burning on
        for (const w of c.wheels) {
          const t = v - w.t;
          if (t > 0) {
            const k = Math.min(1, t / 0.4) * (1 - Math.min(1, Math.max(0, v - c.tGone)));
            fire.add(w.x, 0.05, w.z, 0.7, 0.9 + 0.3 * Math.min(t, 2), 0.9 * k, w.seed);
            if (t < 12) emitColumn(smoke, w.x, 0.9, w.z, t, { life: 9, every: 0.5, rise: 2.0, size: 0.5, grow: 0.8, alpha: 0.65, shade: 0.05, glow: 0.3, seed: w.seed, maxAge: 5 });
          }
        }
        // the cabin: seats and dashboard go up, flames out of the windows
        const t = v - c.tCab;
        if (t > 0) {
          const k = Math.min(1, t / 0.5) * (1 - Math.min(1, Math.max(0, v - c.tGone)));
          const L = LEN[c.kind];
          for (let j = 0; j < 3; j++) {
            const s = (j - 1) * L * 0.22;
            fire.add(c.sx + Math.sin(c.yaw) * s, 0.85, z + Math.cos(c.yaw) * s, 1.1, 1.3 + 0.5 * Math.min(t, 2), 0.9 * k, (c.seed + j * 0.29) % 1);
          }
          if (t < 14) emitColumn(smoke, c.sx, 2.0, z, t, { life: 10, every: 0.4, rise: 2.6, size: 0.9, grow: 0.9, alpha: 0.75, shade: 0.06, glow: 0.35, seed: c.seed, maxAge: 6 });
        }
      });
      fleet.commit();
    },
  };
}
