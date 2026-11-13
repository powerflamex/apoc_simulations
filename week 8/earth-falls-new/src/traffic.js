// Cars on the avenue, two lanes each side of the plaza: coming toward you on the west side, going away on the east, daytime
// running lights on. When everyone runs for shade (0:05) the traffic stops where it is and the drivers get out; the cars
// bake. At 451°F (0:22.6) they catch fire one after another, nearest first (the fuel has been boiling in the tanks for
// days; paper and upholstery light at 451°F): flames out of the cabin and the engine, thick black smoke.
// Every car's path is worked out once at load (1/120 s steps), so a car never jumps, and each lane shares one rule.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, clamp } from './util.js';
import { V_SHADE, V_CARS } from './timeline.js';
import { LANES, QUAY, CAM0, groundY } from './layout.js';

const TAXI = [0xf0c030, 0xf0c030];
const PAINT = [0xe8e8e8, 0xd02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0xe87a2a, 0x5a2a6a, 0x80c0e0];
const DT = 1 / 120, V0 = -2, V1 = 49;

export const CARS = [];
{
  const R = rng(4242);
  const add = (x, z, dir) => {
    const taxi = R() < 0.2;
    CARS.push({ x, z, dir, yaw: dir > 0 ? Math.PI : 0, taxi, col: taxi ? TAXI[0] : PAINT[Math.floor(R() * PAINT.length)], kind: taxi ? 0 : [0, 1, 2, 2, 3][Math.floor(R() * 5)] });
  };
  for (const x of LANES) {
    for (let z = 260 - R() * 8; z > -330; z -= 12 + R() * 8) add(-x, z, 1);
    for (let z = 260 - R() * 8; z > -330; z -= 12 + R() * 8) add(x, z, -1);
  }
  const SP0 = 9.5;
  CARS.forEach((c, i) => {
    c.i = i; c.ph = R() * 10;
    const n = Math.ceil((V1 - V0) / DT);
    c.zs = new Float32Array(n + 1); c.sps = new Float32Array(n + 1);
    let z = c.z - c.dir * SP0 * (0 - V0), sp = SP0;
    const tStop = V_SHADE - 0.6 + 0.9 * (c.ph % 1);
    for (let k = 0; k <= n; k++) {
      const v = V0 + k * DT;
      const target = v > tStop ? 0 : SP0;
      sp += (target - sp) * (1 - Math.exp(-DT / (target === 0 ? 0.55 : 0.9)));
      if (target === 0 && sp < 0.05) sp = 0;
      c.zs[k] = z; c.sps[k] = sp;
      z += c.dir * sp * DT;
    }
    c.tStop = tStop;
  });
  // the fires: nearest first (the ones you can see), the rest within a few seconds; parked far down the avenue later
  for (const c of CARS) {
    const zf = c.zs[c.zs.length - 1];
    const dist = Math.hypot(c.x + 0.3, zf - 0.5);                  // (from where you stand then: main.js P2)
    c.tFire = V_CARS + Math.min(4.5, Math.max(0, (dist - 10) / 40)) + (dist < 30 ? 0.25 : 0.5) * R();
    c.fireSeed = R();
  }
}
const sample = (c, a, v) => { const f = clamp((v - V0) / DT, 0, a.length - 1.001), k = Math.floor(f), u = f - k; return a[k] * (1 - u) + a[k + 1] * u; };

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) fleet.color(c.i, c.col, c.kind);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const black = new THREE.Color(0.04, 0.035, 0.03), tc = new THREE.Color();
  return {
    frame(v, s, glows, smoke, fire) {
      for (const c of CARS) {
        const z = sample(c, c.zs, v), sp = sample(c, c.sps, v), x = c.x;
        if (z < QUAY + 13 || z > 285) { fleet.set(c.i, zero, false); continue; }
        const braking = v > c.tStop ? Math.exp(-(v - c.tStop) / 0.6) * (sp > 0.1 ? 1 : 0.3) : 0;
        const gy = groundY(z), slope = (groundY(z - 1) - groundY(z + 1)) / 2;
        const rx = -0.015 * braking + 0.004 * Math.sin(v * 13 + c.ph) * Math.min(sp / 10, 1) + Math.atan(slope) * (c.dir > 0 ? -1 : 1);
        e.set(rx, c.yaw, 0);
        q.setFromEuler(e);
        m4.compose(p.set(x, gy, z), q, one);
        const lit = 1 - smooth(c.tStop + 1.5, c.tStop + 2.5, v);
        fleet.set(c.i, m4, lit > 0.05);
        // burnt: the paint goes black once it's well alight
        const burn = smooth(c.tFire + 0.8, c.tFire + 5, v);
        fleet.color(c.i, tc.set(c.col).lerp(black, burn), c.kind);
        if (lit > 0.02) {
          const fx = c.dir, rear = 2.3, w = 0.72;
          const br = 0.35 + 1.2 * braking;
          for (const sd of [-1, 1]) {
            glows.add(x + sd * w, gy + 0.74, z - fx * rear, 0.32, 2.6 * br * lit, 0.12 * br * lit, 0.05 * br * lit);
            glows.add(x + sd * w, gy + 0.7, z + fx * rear, 0.45, 2.4 * lit, 2.3 * lit, 2.0 * lit);
          }
        }
        // the fire: flames from the cabin and the engine, growing over 1.5 s; black smoke
        const f = smooth(c.tFire, c.tFire + 1.6, v);
        if (f > 0 && fire) {
          const near = Math.hypot(x - CAM0.x, z - CAM0.z);
          for (let k = 0; k < 4; k++) {
            const along = (k - 1.5) * 0.95 * c.dir;
            const hh = (2.0 + 2.6 * f) * (0.75 + 0.35 * Math.sin(v * (2.1 + k) + c.fireSeed * 20 + k));
            fire.add(x + (k % 2 ? 0.3 : -0.3), gy + 0.6, z + along, 2.0 * (0.6 + 0.4 * f), hh, f * (0.9 + 0.2 * (k % 2)), c.fireSeed + k * 0.13);
          }
          glows.add(x, gy + 1.6, z, 3.5 + 2 * f, 2.2 * f, 0.7 * f, 0.15 * f);
          if (smoke && near < 160) for (let k = 0; k < 5; k++) {
            const T = 3.0, age = ((v - c.tFire) * 1 + k * T / 5 + c.fireSeed * T) % T;
            if (v - c.tFire < age) continue;
            smoke.puff(x + 0.6 * Math.sin(k + c.ph) + 0.4 * age, gy + 2.2 + 2.8 * age, z + 0.2 * age, 0.8 + 1.1 * age, 0.75 * f * (1 - age / T), 0.12, 0, (c.i * 0.13 + k * 0.21) % 1);
          }
        }
      }
      fleet.commit();
    },
  };
}
