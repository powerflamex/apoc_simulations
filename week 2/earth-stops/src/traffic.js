// The cars. At the first frame they sit at the red light with their brakes on, but the ground brakes harder than
// tyres can grip (0.73 g): they creep and skid east, nosing round. Traffic further down the avenue brakes hard.
// From ~170 mph the wind gets under them: they roll over and tumble down the avenue toward the camera.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { CARS } from './layout.js';
import { vAtWind, tOf } from './timeline.js';
import { flight } from './fly.js';
import { tumbleMatrix } from './props.js';
import { rng, smooth, clamp } from './util.js';

const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0xe3b21a, 0xe3b21a, 0x6d1f4f, 0xf2f2f0, 0x1f2328];
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const dummy = new THREE.Object3D();
const fl = {};

export function makeTraffic(scene, { plainMat, glowMat, shadowy }) {
  const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
  const R = rng(909);
  CARS.forEach((c, i) => {
    fleet.color(i, PAL[Math.floor(R() * PAL.length)], c.kind);
    c.yaw = c.dir > 0 ? Math.PI : c.dir < 0 ? 0 : (c.ns > 0 ? -Math.PI / 2 : Math.PI / 2);
    // the ones nearest the camera (furthest east) go first, so a flying car never ploughs through one still parked
    c.v = vAtWind(c.far ? 200 + (-c.z - 125) * 0.08 + R() * 25 : 165 + (45 - c.z) * 0.7 + R() * 12);
    c.tau = 3.5 + R() * 2; c.r = 2.2; c.lift = 3.2; c.ground = 0; c.y = 0;
    c.skid = 0.8;                         // how much it slides before the wind takes it (same for all: no car skids into another)
    c.twist = (R() - 0.5) * 0.5;          // nosing round as it skids
    c.speed = c.far ? 11 + R() * 5 : c.ns ? 9 : 0;
  });
  return {
    fleet,
    frame(v, s, glows, camZ) {
      CARS.forEach((c, i) => {
        // before it lifts: rolling (far traffic, braking hard), then skidding east
        const tt = Math.min(v, c.v) + 2;
        let x = c.x, z = c.z, yaw = c.yaw;
        if (c.speed > 0) {
          // braking from speed: d = v0 t - ½ a t² (it can't brake faster than the tyres grip, ~0.7 g), relative to the
          // ground the braking itself adds a push east; simplified to a stop within ~2 s
          const tb = Math.min(tt, 1.8);
          const d = c.speed * (tb - tb * tb / 3.6);
          if (c.ns) x += c.ns * d; else z += c.dir * d;
        }
        const sk = c.skid * 0.5 * 0.35 * tt * tt * smooth(0, 1.5, tt);   // slow skid east (the grip almost holds)
        z += sk;
        yaw += c.twist * smooth(0, 6, sk);
        const f = flight({ ...c, x, z }, v, fl);
        let m;
        if (f.dt <= 0) {
          const rock = Math.sin(v * 2.1 + c.seed * 7) * Math.min(0.08, s.W * s.W * 0.000012);
          dummy.position.set(x, 0, z); dummy.rotation.set(rock, yaw, 0, 'XYZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
          m = dummy.matrix;
        } else {
          if (f.z > camZ + 80 || f.dz > 2200) { fleet.set(i, HIDE, false); return; }
          m = tumbleMatrix(f.x, f.y + 0.2, f.z, yaw, f.ang * 0.9, c.seed);
        }
        fleet.set(i, m, f.dt < 0.15 && s.grid > 0.2);
      });
      fleet.commit();
    },
  };
}
