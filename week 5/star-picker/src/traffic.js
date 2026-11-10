// Cars on the coast road: two lanes each way at city speed, headlights on in Proxima's dusk. When Sirius blinds
// everyone each driver brakes after their own reaction time and stops (the spacing in a lane is checked so nobody
// rear-ends). Then they sit there: paint blisters, they catch fire one after another (Arcturus), burn out, glow and sag.
// Positions are in video time v, along the road: z (m).
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { LANES, Y } from './layout.js';
import { LAND } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const PAINT = [0xf2f2f2, 0x1b1b1d, 0x8e9499, 0xb5302a, 0x23447a, 0xd8d2c4, 0x3c4a3e, 0xe0b23c, 0xffffff, 0x5a6470, 0x0f2a4a, 0xc9c3b8];
const TB = LAND.sirius;                  // the moment the drivers are blinded
export const CARS = [];
{
  const R = rng(616);
  for (const lane of LANES) {
    const list = [];
    let z = -1300 + R() * 10;
    while (z < 1300) {
      const u0 = 11 + R() * 4;                                  // m/s (25-34 mph)
      list.push({ lane, z0: z, u0, react: 0.4 + R() * 1.2, dec: 6 + R() * 1.5, kind: R() < 0.5 ? 0 : R() < 0.5 ? 1 : R() < 0.7 ? 2 : 3, col: PAINT[Math.floor(R() * PAINT.length)], seed: R(), tIgn: LAND.arcturus + 0.8 + R() * 4 });
      z += 14 + R() * 30;
    }
    // where each one stops (it starts at z0 at v = -10): make sure each car stops ≥ 6.5 m behind the one ahead
    const dir = lane.dir;
    const stopZ = (c) => c.z0 + dir * (c.u0 * (TB + 10 + c.react) + c.u0 * c.u0 / (2 * c.dec));
    const ordered = [...list].sort((a, b) => dir * (b.z0 - a.z0));
    let ahead = null;
    for (const c of ordered) {
      if (ahead) {
        const gap = dir * (stopZ(ahead) - stopZ(c));
        if (gap < 6.5) c.dec = Math.max(c.dec, c.u0 * c.u0 / (2 * Math.max(0.5, dir * (stopZ(ahead) - 6.5 - c.z0) - c.u0 * (TB + 10 + c.react))));
      }
      ahead = c;
    }
    for (const c of list) { c.stop = stopZ(c); CARS.push(c); }
  }
}
export function carZ(c, v) {
  const tb = TB + c.react;
  const t = v + 10;
  if (v <= tb) return { z: c.z0 + c.lane.dir * c.u0 * t, u: c.u0 };
  const dt = v - tb, ts = c.u0 / c.dec;
  const zb = c.z0 + c.lane.dir * c.u0 * (tb + 10);
  if (dt >= ts) return { z: zb + c.lane.dir * c.u0 * c.u0 / (2 * c.dec), u: 0 };
  return { z: zb + c.lane.dir * (c.u0 * dt - 0.5 * c.dec * dt * dt), u: c.u0 - c.dec * dt };
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color(), burnt = new THREE.Color(0.06, 0.05, 0.045);
  return {
    fleet,
    frame(v, s, fire, smoke, cam) {
      CARS.forEach((c, i) => {
        const { z, u } = carZ(c, v);
        const x = c.lane.x;
        const dc = Math.hypot(x - cam.position.x, z - cam.position.z);
        // (local -z forward) dir +1 = driving south (+z)
        q.setFromAxisAngle(up, c.lane.dir > 0 ? Math.PI : 0);
        const kBurn = clamp((v - c.tIgn) / 5);
        const sag = 1 - 0.3 * s.melt - 0.08 * smooth(0.6, 1, kBurn);
        const dip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.035 * (u > 0.2 && u < c.u0 - 0.1 ? 1 : 0));
        q.multiply(dip);
        m4.compose(p.set(x, Y.road, z), q, sc.set(1, sag, 1));
        fleet.set(i, m4, s.nightL > 0.1 && kBurn < 0.2);
        col.set(c.col).lerp(col.clone().multiplyScalar(0.55).add(new THREE.Color(0.08, 0.05, 0.03)), smooth(c.tIgn - 3, c.tIgn, v)).lerp(burnt, smooth(0.1, 0.6, kBurn));
        fleet.color(i, col, c.kind);
        if (dc < 1400) {
          const smolder = smooth(c.tIgn - 2.5, c.tIgn, v) * (1 - smooth(0.7, 1, kBurn));
          const burning = kBurn > 0 && kBurn < 1 ? Math.sin(Math.PI * Math.pow(kBurn, 0.5)) * (1 - s.vapor) : 0;
          if (smolder > 0.02) smoke.puff(x, Y.road + 1.2 + ((v * 1.5 + c.seed * 4) % 3), z, 1.4 + burning * 1.5, 0.22 * smolder, 0.08, 0.5 * burning, c.seed);
          if (burning > 0) {
            fire.add(x, Y.road + 0.5, z, 2.2, 2.2 + 1.3 * burning, burning, c.seed);
            if (dc < 300) fire.add(x + 0.6, Y.road + 0.9, z - 0.4, 1.2, 1.6, burning * 0.8, c.seed + 0.3);
          }
        }
      });
      fleet.commit();
    },
  };
}
