// Cars on the avenue, two lanes each side of the plaza: coming toward you on the west side, going away on the east, daytime
// running lights on, puffs of white exhaust in the cold. As the frost front passes each car its windscreen whites over and
// it slows to a crawl; at 0:12 every engine dies (batteries and oil give out long before -129°F): the lights go out, the
// exhaust stops, and they roll to a stop. Every car's path is worked out once at load (1/120 s steps), so a car never
// jumps, and each lane shares one rule, so nobody runs into anybody.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, clamp } from './util.js';
import { V_STALL, frontZ } from './timeline.js';
import { LANES, QUAY, groundY } from './layout.js';

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
    for (let z = 70 - R() * 8; z > -330; z -= 15 + R() * 10) add(-x, z, 1);
    for (let z = 70 - R() * 8; z > -330; z -= 15 + R() * 10) add(x, z, -1);
  }
  const SP0 = 10.5, CRAWL = 2.6;
  CARS.forEach((c, i) => {
    c.i = i; c.ph = R() * 10;
    // integrate: full speed, then the crawl once the front has passed it, then the engine dies and it coasts to a stop
    const n = Math.ceil((V1 - V0) / DT);
    c.zs = new Float32Array(n + 1); c.sps = new Float32Array(n + 1);
    let z = c.z - c.dir * SP0 * (0 - V0), sp = SP0, tb = null;
    for (let k = 0; k <= n; k++) {
      const v = V0 + k * DT;
      if (tb === null && frontZ(v) + 35 > z) tb = v;
      let target = tb === null ? SP0 : CRAWL;
      if (v > V_STALL + 0.15 * (c.ph % 1)) target = 0;
      const tau = target === 0 ? 0.7 : 0.9;
      sp += (target - sp) * (1 - Math.exp(-DT / tau));
      if (target === 0 && sp < 0.05) sp = 0;
      c.zs[k] = z; c.sps[k] = sp;
      z += c.dir * sp * DT;
    }
    c.tb = tb;
  });
}
const sample = (c, a, v) => { const f = clamp((v - V0) / DT, 0, a.length - 1.001), k = Math.floor(f), u = f - k; return a[k] * (1 - u) + a[k + 1] * u; };

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) fleet.color(c.i, c.col, c.kind);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    frame(v, s, glows, smoke) {
      for (const c of CARS) {
        const z = sample(c, c.zs, v), sp = sample(c, c.sps, v), x = c.x;
        if (z < QUAY + 13 || z > 95) { fleet.set(c.i, zero, false); continue; }
        // a dip as it brakes
        const braking = c.tb !== null && v > c.tb ? Math.exp(-(v - c.tb) / 0.6) : 0;
        const gy = groundY(z), slope = (groundY(z - 1) - groundY(z + 1)) / 2;
        const rx = -0.015 * braking + 0.004 * Math.sin(v * 13 + c.ph) * Math.min(sp / 10, 1) + Math.atan(slope) * (c.dir > 0 ? -1 : 1);
        e.set(rx, c.yaw, 0);
        q.setFromEuler(e);
        m4.compose(p.set(x, gy, z), q, one);
        const alive = 1 - smooth(V_STALL, V_STALL + 0.5 + 0.4 * (c.ph % 1), v);
        fleet.set(c.i, m4, alive > 0.05);
        if (alive <= 0.02) continue;
        // lights: running lights at the front, tail lights (brighter while braking); white exhaust from the back
        const fx = c.dir, rear = 2.3, w = 0.72;
        const br = 0.35 + 1.2 * braking;
        for (const sd of [-1, 1]) {
          glows.add(x + sd * w, gy + 0.74, z - fx * rear, 0.32, 2.6 * br * alive, 0.12 * br * alive, 0.05 * br * alive);
          glows.add(x + sd * w, gy + 0.7, z + fx * rear, 0.45, 2.4 * alive, 2.3 * alive, 2.0 * alive);
        }
        if (smoke && Math.abs(z - 8) < 70) {
          for (let k = 0; k < 3; k++) {
            const T = 0.9, ph = (v + k * T / 3 + c.ph) % T, age = ph;
            const ex = x + 0.5, ez = z - fx * (rear + 0.2 + 0.6 * age);
            smoke.puff(ex, gy + 0.35 + 0.5 * age, ez, 0.15 + 0.45 * age, 0.32 * alive * smooth(0.5, 3.0, v) * (1 - age / T), 1.0, 0, (c.i * 0.13 + k * 0.3) % 1);
          }
        }
      }
      fleet.commit();
    },
  };
}
