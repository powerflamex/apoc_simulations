// Cars on the avenue and the cross street. Right-hand traffic: the west carriageway comes toward you (south), the east
// one goes away (north). Queues wait at the crossing's stop lines (the scramble phase: every car stops, everyone
// crosses); traffic flows further up the avenue. At 12 s everything brakes hard and jams (some slew across their
// lanes), hazard lights come on, and the cars sit abandoned. When the blast front reaches a car it is flung away
// from the hit, tumbling (toward you, at the end).
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, wobble, clamp } from './util.js';
import { V_PANIC } from './timeline.js';
import { HIT, AVE_END } from './layout.js';

const TAXI = [0xd8b23a, 0xd8b23a, 0x1a2a4a];
const PAINT = [0xe8e8e8, 0x2a2c30, 0x8a1f22, 0x9aa0a8, 0x1c2e4a, 0x111111, 0x6a6e72, 0xc9c2b0, 0x30402e, 0xd0d4d8, 0x5a2a6a];
const LANES = [4.3, 8.6, 12.9];

export const CARS = [];
{
  const R = rng(808);
  const add = (x, z, yaw, mv) => {
    const taxi = R() < 0.22;
    CARS.push({ x, z, yaw, taxi, col: taxi ? TAXI[Math.floor(R() * TAXI.length)] : PAINT[Math.floor(R() * PAINT.length)], kind: taxi ? 0 : [0, 1, 2, 2, 3][Math.floor(R() * 5)], mv });
  };
  // queues at the crossing: southbound (west side) north of it, in view; northbound (east side) behind you
  for (const x of LANES) for (let k = 0; k < 10; k++) if (R() < 0.85) add(-x, -14.8 - k * 6.6 - R() * 0.8, 0, null);
  for (const x of LANES) for (let k = 0; k < 5; k++) if (R() < 0.85) add(x, 14.8 + k * 6.6 + R() * 0.8, Math.PI, null);
  // the cross street: eastbound on the south half (queued from the west), westbound on the north half (from the east)
  for (const z of [2.5, 7.5]) for (let k = 0; k < 6; k++) if (R() < 0.8) add(-17.5 - k * 6.6 - R() * 0.8, z, Math.PI / 2, null);
  for (const z of [-2.5, -7.5]) for (let k = 0; k < 6; k++) if (R() < 0.8) add(17.5 + k * 6.6 + R() * 0.8, z, -Math.PI / 2, null);
  // moving traffic up the avenue: southbound toward you from 270 m out, northbound away from 30 m out
  for (const x of LANES) {
    for (let z = -270 - R() * 20; z > AVE_END; z -= 24 + R() * 30) if (R() < 0.8) add(-x, z, 0, { sp: 10 + R() * 3, dir: 1, tb: V_PANIC + R() * 1.6, slew: (R() - 0.5) * 0.5 });
    for (let z = -30 - R() * 20; z > AVE_END; z -= 24 + R() * 30) if (R() < 0.8) add(x, z, Math.PI, { sp: 11 + R() * 3, dir: -1, tb: V_PANIC + R() * 1.6, slew: (R() - 0.5) * 0.5 });
  }
  CARS.forEach((c, i) => {
    c.i = i; c.ph = R() * 10;
    c.tumble = [(R() - 0.5) * 2.0, (R() - 0.5) * 1.2, (R() - 0.5) * 2.0];
  });
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) fleet.color(c.i, c.col, c.kind);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const TAU = 1.7;
  return {
    frame(v, s, glows) {
      for (const c of CARS) {
        let x = c.x, y = 0, z = c.z, rx = 0, rz = 0, ry = c.yaw;
        let braking = 0, stopped = 1;
        if (c.mv) {
          const m = c.mv;
          // rolling at sp, then braking to a stop from tb (over ~2 s), slewing a little as they do
          let dist;
          if (v < m.tb) { dist = m.sp * v; stopped = 0; }
          else { const t = v - m.tb; dist = m.sp * m.tb + m.sp * TAU * (1 - Math.exp(-t / TAU)); braking = 1 - smooth(2.5, 3.5, t); stopped = smooth(2.0, 3.0, t); ry += m.slew * smooth(0, 1.8, t); }
          z += m.dir * dist;
          if (z > -20 && m.dir > 0) z = -20;        // (never into the queue)
          const jolt = braking * (1 - braking) * 4;
          rx += 0.03 * jolt * Math.sin(v * 9 + c.ph);
        }
        // the shock through the ground after the hit
        if (s.hit) { rx += wobble(v * 11, c.ph) * 0.012 * smooth(0.3, 0.8, s.age); rz += wobble(v * 13, c.ph + 2) * 0.015 * smooth(0.3, 0.8, s.age); }
        // the wall: flung away from the hit
        const rHit = Math.hypot(x - HIT.x, z - HIT.z);
        if (s.front > rHit - 6) {
          const t = Math.max(0, (s.front - (rHit - 6)) / 150);
          const ax = (x - HIT.x) / rHit, az = (z - HIT.z) / rHit;
          x += ax * 60 * t; z += az * 60 * t; y += Math.max(0, 26 * t - 16 * t * t);
          rx += c.tumble[0] * t * 4; ry += c.tumble[1] * t * 3; rz += c.tumble[2] * t * 4;
        }
        e.set(rx, ry, rz);
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, one);
        fleet.set(c.i, m4, false);
        // brake lights while stopped at the lights or braking; hazard lights blinking once they're abandoned
        if (y < 0.5 && s.front < rHit - 6) {
          const bx = -Math.sin(ry), bz = -Math.cos(ry);        // the car's rear points +z in its frame (front is -z)
          const rear = 2.3, w = 0.72;
          const br = (stopped > 0 ? 1 : braking) * 0.9;
          const haz = c.mv ? smooth(2.2, 2.8, v - c.mv.tb) * (Math.sin(v * 8.8 + c.ph) > 0 ? 1 : 0) : 0;
          for (const sd of [-1, 1]) {
            const lx = x - bx * rear + sd * w * Math.cos(ry), lz = z - bz * rear - sd * w * Math.sin(ry);
            glows.add(lx, 0.78, lz, 0.22, 2.6 * br + 2.2 * haz, 0.12 * br + 1.1 * haz, 0.05 * br + 0.1 * haz);
          }
          if (haz > 0) for (const sd of [-1, 1]) {
            const lx = x + bx * rear + sd * w * Math.cos(ry), lz = z + bz * rear - sd * w * Math.sin(ry);
            glows.add(lx, 0.72, lz, 0.2, 2.2 * haz, 1.1 * haz, 0.1 * haz);
          }
        }
      }
      fleet.commit();
    },
  };
}
