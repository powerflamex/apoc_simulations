// The cars: parked down both curbs, and traffic in the outer lanes. At magnitude 6 the moving ones brake to a stop
// and the alarms start (hazard lights blinking). They rock on their springs; once the street rolls their brakes
// can't hold them on the 16 % hill and they slide downhill (each row as one, so they keep their gaps); from 11
// they are thrown into the air and tumble.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { CARS, streetY } from './layout.js';
import { V_GLASS, V_ROLL, V_AIR, tossAt } from './timeline.js';
import { quakeMat, quakeDepth, quakeD } from './quake.js';
import { tossY } from './props.js';
import { rng, smooth, clamp } from './util.js';

const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0xe3b21a, 0x6d1f4f, 0xf2f2f0, 0x1f2328, 0x3a5a8a];
const dummy = new THREE.Object3D();

export function makeTraffic(scene, { plainMat, glowMat }) {
  const Q = (c, r, e) => quakeMat(plainMat(c, r, e), { rigid: true });
  const fleet = makeFleet(scene, CARS.length, {
    plainMat: Q, glowMat: (c) => quakeMat(glowMat(c), { rigid: true }),
    shadowy: (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = quakeDepth({ rigid: true }); return m; },
  });
  const R = rng(909);
  CARS.forEach((c, i) => {
    fleet.color(i, PAL[Math.floor(R() * PAL.length)], c.kind);
    c.yaw = c.dir > 0 ? Math.PI : 0;
    c.alarm = c.parked && R() < 0.45;
    c.vBrake = V_GLASS - (c.dir > 0 ? 0.5 : 0.2);   // (each lane brakes as one: nobody runs into anybody)
    if (c.moving) c.speed = 7.5;
  });
  // the slide downhill: everyone together, picking up speed (brakes skidding), then piling into the flat at the bottom
  const slide = (v) => { const t = Math.max(0, v - V_ROLL - 0.5); return 0.55 * t * t; };
  return {
    fleet,
    frame(v, s, glows) {
      CARS.forEach((c, i) => {
        let z = c.z;
        if (c.moving) {   // driving up/down the hill until the lane brakes together, then stopped
          const b = clamp(v - c.vBrake, 0, 1.2);
          z += c.dir * c.speed * (Math.min(v, c.vBrake) - c.vBrake + b * (1 - b / 2.4));
        }
        z -= slide(v) * (z > -540 ? 1 : 0.4);
        const y0 = streetY(z);
        const slope = Math.atan2(streetY(z + 2) - streetY(z - 2), 4);
        const rock = (Math.min(s.shake, 2) * 0.05 + s.roll * 0.03) * Math.sin(v * (5 + c.seed * 3) + c.seed * 20);
        const ty = tossY(s.toss, v, c.seed);
        const tum = ty > 0 ? (v - V_AIR) * (1 + c.seed * 2) : 0;
        dummy.position.set(c.x, y0 + Math.abs(rock) * 0.3 + ty, z);
        dummy.rotation.set((c.dir > 0 ? slope : -slope) + rock * 0.5 + tum * 0.7 * Math.sin(c.seed * 9), c.yaw + 0.3 * smooth(V_ROLL, V_ROLL + 6, v) * Math.sin(c.seed * 13), rock + tum * Math.cos(c.seed * 7), 'YXZ');
        dummy.updateMatrix();
        const lights = c.moving && v < V_AIR + 1;
        fleet.set(i, dummy.matrix, lights);
        // hazard lights blinking on the alarmed ones
        if ((c.alarm || c.moving) && v > c.vBrake + 0.3 && v < V_AIR + 2 && Math.sin(v * 9 + c.seed * 3) > 0) {
          const d = quakeD(c.x, y0, z);
          for (const e of [-2.25, 2.25]) for (const sx of [-0.75, 0.75]) glows.add(c.x + sx + d.x, y0 + 0.75 + d.y + ty, z + e + d.z, 0.55, 2.6, 1.2, 0.15);
        }
      });
      fleet.commit();
    },
  };
}
