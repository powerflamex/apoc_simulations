// Cars on the coast road: two lanes each way at city speed, headlights on. Positions are in video time v, along the
// road: z (m); each car wraps round from one end of the road to the other.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { LANES, Y } from './layout.js';
import { rng } from './util.js';

const PAINT = [0xf2f2f2, 0x1b1b1d, 0x8e9499, 0xb5302a, 0x23447a, 0xd8d2c4, 0x3c4a3e, 0xe0b23c, 0xffffff, 0x5a6470, 0x0f2a4a, 0xc9c3b8];
const SPAN = 2600;
export const CARS = [];
{
  const R = rng(616);
  for (const lane of LANES) {
    const u0 = 11.5 + R() * 2.5;                                // m/s (26-31 mph); one speed per lane, so nobody rear-ends
    let z = -1300 + R() * 10;
    while (z < 1280) {
      CARS.push({ lane, z0: z, u0, kind: R() < 0.5 ? 0 : R() < 0.5 ? 1 : R() < 0.7 ? 2 : 3, col: PAINT[Math.floor(R() * PAINT.length)], seed: R() });
      z += 16 + R() * 34;
    }
  }
}
export const carZ = (c, v) => ((((c.z0 + c.lane.dir * c.u0 * (v + 10) + SPAN / 2) % SPAN) + SPAN) % SPAN) - SPAN / 2;

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  return {
    fleet,
    frame(v) {
      CARS.forEach((c, i) => {
        // (local -z forward) dir +1 = driving south (+z)
        q.setFromAxisAngle(up, c.lane.dir > 0 ? Math.PI : 0);
        m4.compose(p.set(c.lane.x, Y.road, carZ(c, v)), q, sc);
        fleet.set(i, m4, true);
      });
      fleet.commit();
    },
  };
}
