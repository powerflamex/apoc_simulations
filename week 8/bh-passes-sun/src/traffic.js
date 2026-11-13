// The traffic: both ways stopped bumper to bumper (everyone got out to look up), some doors' worth of gap between cars
// where people stand, hazard lights blinking.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng } from './util.js';
import { LANES, END_Z, SIDE1, CAM0 } from './layout.js';

const PAINT = [0xe8e8e8, 0xd02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0xe87a2a, 0x5a2a6a, 0x80c0e0, 0xf0c030];

export const CARS = [];
{
  const R = rng(9091);
  for (const [x, yaw] of [[-LANES[1], Math.PI], [-LANES[0], Math.PI], [LANES[0], 0], [LANES[1], 0]]) {
    for (let z = 30 - R() * 5; z > END_Z + 6; z -= 6.4 + R() * 4.2) {
      if (z > SIDE1[0] - 3.5 && z < SIDE1[1] + 3.5) continue;                 // the crossing stays open
      if (Math.abs(x) < 8 && z > CAM0.z - 9 && z < CAM0.z + 3) continue;        // (no car right beside you)
      const len = 4.6;
      CARS.push({ x: x + (R() - 0.5) * 0.5, z, yaw: yaw + (R() - 0.5) * 0.1, len, col: PAINT[Math.floor(R() * PAINT.length)], kind: [0, 0, 1, 2, 2, 3][Math.floor(R() * 6)], hz: R() < 0.6, lights: R() < 0.4, ph: R() });
    }
  }
}
// is (x, z) clear of every car (with a margin)?
export function clearOfCars(x, z, m = 0.6) {
  for (const c of CARS) if (Math.abs(x - c.x) < 1.0 + m && Math.abs(z - c.z) < c.len / 2 + m) return false;
  return true;
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  CARS.forEach((c, i) => {
    c.i = i; fleet.color(i, c.col, c.kind);
    q.setFromEuler(e.set(0, c.yaw, 0));
    fleet.set(i, m4.compose(p.set(c.x, 0, c.z), q, one), c.lights);
  });
  fleet.commit();
  const hzOn = (c, v) => (Math.sin((v + c.ph) * Math.PI * 2 * 1.4) > 0 ? 1 : 0.08);
  return {
    frame(v, s, glows) {
      for (const c of CARS) {
        if (!c.hz) continue;
        const on = hzOn(c, v) * 2.2, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
        for (const [lx, lz] of [[-0.82, -2.3], [0.82, -2.3], [-0.82, 2.32], [0.82, 2.32]]) {
          glows.add(c.x + lx * cs + lz * sn, 0.72, c.z - lx * sn + lz * cs, 0.3, 2.6 * on, 1.3 * on, 0.15 * on);
        }
      }
    },
  };
}
