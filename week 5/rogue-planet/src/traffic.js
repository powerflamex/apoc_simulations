// Cars and taxis waiting at the crossing's stop lines (the scramble phase: every car stops, everyone crosses), queued
// up the avenue and along the cross street. Left-hand traffic. They rock in the quake, bob once the water is deep
// enough, and at the end are lifted off and tumble up toward the planet.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, wobble, clamp } from './util.js';
import { V_LIFT } from './timeline.js';

const TAXI = [0x16181c, 0x1f3a2c, 0xd8b23a, 0x1a2a4a];
const PAINT = [0xe8e8e8, 0x2a2c30, 0x8a1f22, 0x9aa0a8, 0x1c2e4a, 0x111111, 0x6a6e72, 0xc9c2b0, 0x30402e];

export const CARS = [];
{
  const R = rng(808);
  const add = (x, z, yaw) => {
    const taxi = R() < 0.4;
    CARS.push({ x, z, yaw, taxi, col: taxi ? TAXI[Math.floor(R() * TAXI.length)] : PAINT[Math.floor(R() * PAINT.length)], kind: taxi ? 0 : [0, 1, 2, 2, 3][Math.floor(R() * 5)] });
  };
  // the avenue: southbound on the east half (stopping at z = -12), northbound on the west half (stopping at z = 12)
  for (const x of [2.5, 7.5, 12.5]) for (let k = 0; k < 9; k++) if (R() < 0.85) add(x, -14.8 - k * 6.4 - R() * 0.8, Math.PI);
  for (const x of [-2.5, -7.5, -12.5]) for (let k = 0; k < 6; k++) if (R() < 0.85) add(x, 14.8 + k * 6.4 + R() * 0.8, 0);
  // the cross street: eastbound on the north half (from the west), westbound on the south half (from the east)
  for (const z of [-2.5, -7.5]) for (let k = 0; k < 6; k++) if (R() < 0.8) add(-17.5 - k * 6.4 - R() * 0.8, z, -Math.PI / 2);
  for (const z of [2.5, 7.5]) for (let k = 0; k < 6; k++) if (R() < 0.8) add(17.5 + k * 6.4 + R() * 0.8, z, Math.PI / 2);
  CARS.forEach((c, i) => {
    c.i = i; c.ph = R() * 10;
    c.tLift = V_LIFT + 2.0 + R() * 3.0;
    c.tumble = [(R() - 0.5) * 1.2, (R() - 0.5) * 0.8, (R() - 0.5) * 1.2];
  });
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) fleet.color(c.i, c.col, c.kind);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  return {
    frame(v, s, glows) {
      const bob = s.water > 0.45 ? smooth(0.45, 0.85, s.water) : 0;
      for (const c of CARS) {
        let x = c.x, y = 0, z = c.z, rx = 0, rz = 0, ry = c.yaw;
        if (s.quake > 0) { rx += wobble(v * 11, c.ph) * 0.012 * s.quake; rz += wobble(v * 13, c.ph + 2) * 0.015 * s.quake; }
        if (bob > 0) { y += bob * (0.12 + 0.06 * Math.sin(v * 1.7 + c.ph)); rx += 0.03 * bob * Math.sin(v * 1.3 + c.ph); rz += 0.03 * bob * Math.sin(v * 1.1 + c.ph * 2); ry += 0.05 * bob * wobble(v * 0.3, c.ph); }
        if (v > c.tLift) {
          const t = v - c.tLift;
          const h = 0.5 * 1.2 * t * t * (1 + 0.3 * t);
          y += h; z -= h * 0.3;
          rx += c.tumble[0] * t * t * 0.6; ry += c.tumble[1] * t * t * 0.6; rz += c.tumble[2] * t * t * 0.6;
        }
        e.set(rx, ry, rz);
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, one);
        fleet.set(c.i, m4, true);
        // the taxis' roof signs
        if (c.taxi) glows.add(x, y + 1.62, z, 0.5, 2.4, 1.9, 1.0);
      }
      fleet.commit();
    },
  };
}
