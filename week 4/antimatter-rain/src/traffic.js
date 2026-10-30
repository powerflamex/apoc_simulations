// The cars. At the first frame they are stuck in the flooded street with their lights on, water at the hubcaps.
// At 2 ft of water (day 1) they float: they lift, bob, turn a little and drift slowly down the street toward the bay
// (each lane as a block, so no car drifts into another). As they fill with water they sink back to the street one
// by one, nose first, their lights still glowing under the water until they short out.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { CARS } from './layout.js';
import { V_FLOAT, V_HERO_SINK, V_GLASS } from './timeline.js';
import { underK, drownMat } from './drown.js';
import { rng, smooth, clamp } from './util.js';

const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0xe3b21a, 0x6d1f4f, 0xf2f2f0, 0x1f2328, 0x3a5a8a];
const dummy = new THREE.Object3D();

// the drift: everything floats toward the bay (-z) at the same pace
const drift = (v) => { const t = Math.max(0, v - V_FLOAT); return 0.45 * t * t / (1 + 0.25 * t); };
// the car stuck 14 m ahead on the right, facing you: a man leans out of its near window (main.js, people.js)
export const HERO = CARS.findIndex((c) => c.lane && c.x > 0 && Math.abs(c.z + 4.4) < 1.5);
// where car c is at video time v with the water at level (it floats, drifts, fills and sinks nose first)
export function carFrame(c, v, level) {
  let x = c.x, z = c.z, y = 0, yaw = c.yaw, pitch = 0, roll = 0;
  const lift = smooth(c.vLift, c.vLift + 0.8, v);
  const sink = smooth(c.vSink, c.vSink + c.sinkDur, v);
  if (lift > 0) {
    z -= drift(Math.min(v, V_FLOAT + 6.5)) - drift(c.vLift);   // (the same for all: they keep their gaps)
    yaw += c.spin * smooth(c.vLift, c.vLift + 5, v);
    // floating: riding the water line, bobbing; sinking: nose (engine) first, back down to the street
    const float = Math.max(0, level - 0.62);
    y = float * lift * (1 - sink) + 0.04 * Math.sin(v * 2.1 + c.seed * 9) * lift * (1 - sink);
    pitch = 0.04 * Math.sin(v * 1.7 + c.seed * 5) * lift * (1 - sink) + 0.35 * Math.sin(Math.PI * sink) * (c.dir > 0 ? 1 : -1);
    roll = 0.05 * Math.sin(v * 1.3 + c.seed * 3) * lift * (1 - sink);
  }
  return { x, y, z, yaw, pitch, roll };
}

export function makeTraffic(scene, { plainMat, glowMat }) {
  const P = (c, r, e) => drownMat(plainMat(c, r, e));
  const fleet = makeFleet(scene, CARS.length, { plainMat: P, glowMat: (c) => drownMat(glowMat(c)), shadowy: (m) => { m.frustumCulled = false; return m; } });
  const R = rng(909);
  CARS.forEach((c, i) => {
    fleet.color(i, PAL[Math.floor(R() * PAL.length)], c.kind);
    c.yaw = c.ns ? (c.ns > 0 ? -Math.PI / 2 : Math.PI / 2) : c.dir > 0 ? Math.PI : 0;
    c.vLift = V_FLOAT + 0.2 + R() * 0.9;                      // when it lifts off the street
    c.vSink = c.vLift + 2.4 + R() * 2.6;                      // when it has filled up and goes down
    c.vDark = c.vSink + 1.5 + R() * 3.5;                      // lights short out
    c.spin = (R() - 0.5) * 0.7;
    c.lights = c.parked ? R() < 0.15 : true;
    c.sinkDur = 1.6;
  });
  // (the cars right behind his, dark too: no headlights glaring behind his head)
  CARS.forEach((c) => { if (c.lane && c.x > 0 && c.z < CARS[HERO].z - 1 && c.z > CARS[HERO].z - 20) c.lights = false; });
  { const h = CARS[HERO]; h.vLift = V_FLOAT + 0.25; h.vSink = V_HERO_SINK; h.sinkDur = 1.5; h.spin = -0.12; h.lights = false; }   // (its engine has flooded: lights dead, nothing to glare)
  return {
    fleet,
    frame(v, s, glows, level) {
      CARS.forEach((c, i) => {
        const { x, y, z, yaw, pitch, roll } = carFrame(c, v, level);
        dummy.position.set(x, y, z); dummy.rotation.set(pitch, yaw, roll, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
        const on = c.lights && v < c.vDark && (v < c.vDark - 0.6 || Math.sin(v * 41 + c.seed * 20) > 0);
        fleet.set(i, dummy.matrix, on);
        // after the blast: the alarms go off, the hazard lights blink orange
        if (v > V_GLASS + 0.15 + c.seed * 0.6 && Math.sin((v - V_GLASS) * 9.4 + c.seed * 6) > 0.1) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          for (const sx of [-0.78, 0.78]) for (const e of [-2.25, 2.25]) {
            const px = x + Math.cos(yaw) * sx + fx * e, pz = z - Math.sin(yaw) * sx + fz * e;
            glows.add(px, y + 0.75, pz, 0.45, 2.6, 1.1, 0.15);
            glows.reflect(px, y + 0.75, pz, 0.5, 1.0, 0.4, 0.05, level);
          }
        }
        // the lights as glows (head white, tail red), dimming under the water; reflected while above it
        if (on) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);       // the car's back is +z in its own frame
          const ly = y + 0.72;
          const k = underK(ly, level);
          for (const sx of [-0.62, 0.62]) {
            const px = x + Math.cos(yaw) * sx, pz = z - Math.sin(yaw) * sx;
            glows.add(px - fx * 2.3, ly, pz - fz * 2.3, 0.85, 3.4 * k, 3.1 * k, 2.5 * k);
            glows.add(px + fx * 2.3, ly, pz + fz * 2.3, 0.7, 3.2 * k, 0.15 * k, 0.08 * k);
            glows.reflect(px + fx * 2.3, ly, pz + fz * 2.3, 0.6, 1.2 * k, 0.06 * k, 0.03 * k, level);
            glows.reflect(px - fx * 2.3, ly, pz - fz * 2.3, 0.6, 0.9 * k, 0.8 * k, 0.6 * k, level);
          }
        }
      });
      fleet.commit();
    },
  };
}
