// Cars on the avenue, either side of the promenade, up the hill toward you (west side) and away down it (east side), their
// lights on at dusk. The drivers are blinded at the first instant: everything brakes within a second or so, slewing, and
// two cars that don't stop in time run into the ones ahead. The cars sit where they stopped, about half with hazards on,
// the rest gone dark with the blackout. When the blast front reaches a car it is flung away from ground zero, tumbling.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, clamp } from './util.js';
import { V_POWER, V_CRASH, V_THROW, REAL_HIT } from './short.js';
import { HIT, groundY } from './layout.js';

const TAXI = [0xd8b23a, 0xd8b23a, 0x1a2a4a];
const PAINT = [0xe8e8e8, 0x2a2c30, 0x8a1f22, 0x9aa0a8, 0x1c2e4a, 0x111111, 0x6a6e72, 0xc9c2b0, 0x30402e, 0xd0d4d8, 0x5a2a6a];
const LANES = [9.0, 13.0];

export const CARS = [];
{
  const R = rng(808);
  const add = (x, z, yaw, mv) => {
    const taxi = R() < 0.22;
    CARS.push({ x, z, yaw, taxi, col: taxi ? TAXI[Math.floor(R() * TAXI.length)] : PAINT[Math.floor(R() * PAINT.length)], kind: taxi ? 0 : [0, 1, 2, 2, 3][Math.floor(R() * 5)], mv });
  };
  // coming up the hill toward you on the west side, going away down it on the east; close together near you
  for (const x of LANES) {
    for (let z = 40 - R() * 10; z > -900; z -= (z > -120 ? 16 : 22) + R() * 12) if (R() < 0.9) add(-x, z, Math.PI, { sp: 8 + R() * 3, dir: 1, tb: 0.15 + R() * 1.0, slew: (R() - 0.5) * 0.6 });
    for (let z = 34 - R() * 10; z > -900; z -= (z > -120 ? 16 : 22) + R() * 12) if (R() < 0.9) add(x, z, 0, { sp: 8 + R() * 3, dir: -1, tb: 0.15 + R() * 1.0, slew: (R() - 0.5) * 0.6 });
  }
  CARS.forEach((c, i) => {
    c.i = i; c.ph = R() * 10;
    c.tumble = [(R() - 0.5) * 2.0, (R() - 0.5) * 1.2, (R() - 0.5) * 2.0];
    c.dies = R() < 0.5;
    c.tDie = V_POWER + 0.3 + R() * 1.4;
  });
  // the one the blast throws at you
  CARS.reduce((b, c) => (c.mv.dir > 0 && c.z < -95 && c.z > -130 && (!b || Math.abs(c.x + 9) < Math.abs(b.x + 9)) ? c : b), null).thrown = true;
  // the crashes: in front of you, a car on each carriageway never touches the brake and hits the one ahead of it
  for (const [dir, xx, near] of [[1, LANES[0], -46], [-1, LANES[0], -30]]) {
    const row = CARS.filter((c) => c.mv.dir === dir && Math.abs(Math.abs(c.x) - xx) < 0.1 && c.z < near).sort((a, b) => b.z - a.z);
    // (dir 1: traffic comes toward you, so the car further off runs into the nearer one; dir -1 the other way round)
    const [lead, follow] = dir > 0 ? [row[0], row[1]] : [row[1], row[0]];
    if (lead && follow) {
      lead.mv.tb = 0.3; lead.mv.sp = 7;
      // (at a speed that brings it into the car ahead right on the beat in the soundtrack)
      const vh = V_CRASH + (dir > 0 ? 0 : 0.75), done = 7 * 0.3 + 7 * 1.7 * (1 - Math.exp(-(vh - 0.3) / 1.7));
      follow.mv.tb = 99; follow.mv.lead = lead; follow.mv.sp = (Math.abs(lead.z - follow.z) - 4.8 + done) / vh; follow.mv.vh = vh; follow.mv.side = dir;
    }
  }
}

const stopX = (c, k, cam) => (1 - k) * c.px + k * cam.x;

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) fleet.color(c.i, c.col, c.kind);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const TAU = 1.7;
  return {
    frame(v, s, glows) {
      const distAt = (mm, vv) => (vv < mm.tb ? mm.sp * vv : mm.sp * mm.tb + mm.sp * TAU * (1 - Math.exp(-(vv - mm.tb) / TAU)));
      if (s.wreck) {
        // after the blast: where each car ended up. Pushed away from ground zero (more the closer to it), some rolled
        // onto their side or their roof; no lights
        for (const c of CARS) {
          const m = c.mv;
          let x = c.x, z = c.z + m.dir * distAt(m, 40);
          const rHit = Math.hypot(x - HIT.x, z - HIT.z);
          const tw = clamp((s.frontW - (rHit - 6)) / 150);
          const ax = (x - HIT.x) / rHit, az = (z - HIT.z) / rHit;
          const push = (8 + 22 * (c.ph % 1)) * tw;
          x += ax * push; z += az * push;
          x = Math.max(-21.2, Math.min(21.2, x));
          const k = Math.floor(c.ph * 7.3) % 4;
          const rz = tw > 0.25 ? (k === 1 ? Math.PI / 2 : k === 2 ? Math.PI : k === 3 ? -Math.PI / 2 : 0) : 0;
          const ry = c.yaw + m.slew + (tw > 0.25 ? c.tumble[1] * 2.2 : 0);
          const y = groundY(z) + (Math.abs(rz - Math.PI) < 0.1 ? 1.45 : Math.abs(rz) > 1 ? 0.9 : 0);
          e.set(0, ry, rz);
          q.setFromEuler(e);
          m4.compose(p.set(x, y, z), q, one);
          fleet.set(c.i, m4, false);
          c.px = x; c.py = y; c.pz = z; c.wrecked = tw > 0.25;
        }
        fleet.commit();
        return;
      }
      for (const c of CARS) {
        let x = c.x, z = c.z, y, rx = 0, rz = 0, ry = c.yaw;
        let braking = 0, stopped = 0;
        const m = c.mv, vv = Math.max(v, 0);
        // rolling at sp, then braking to a stop from tb (over ~2 s), slewing a little as they do
        let dist = distAt(m, v);
        if (vv >= m.tb) { const t = vv - m.tb; braking = 1 - smooth(2.5, 3.5, t); stopped = smooth(2.0, 3.0, t); ry += m.slew * smooth(0, 1.8, t); }
        if (m.lead) {
          // the moment it meets the car ahead
          if (vv >= m.vh) {
            const t = vv - m.vh;
            dist = m.sp * m.vh + 2.2 * (1 - Math.exp(-t / 0.2));
            stopped = 1;
            ry += 0.42 * smooth(0, 0.3, t) * m.side;
            rx += 0.1 * Math.exp(-t / 0.18) * Math.sin(t * 22);
            // a flash at the bumpers and a spray of sparks
            if (t < 0.35) glows.add(c.x, groundY(c.z + m.dir * dist) + 1, c.z + m.dir * (dist + 2.3), 5 * (1 - t), 5 * Math.exp(-t / 0.08), 4 * Math.exp(-t / 0.08), 3 * Math.exp(-t / 0.08));
            if (t < 0.9) for (let k = 0; k < 22; k++) {
              const a = k * 2.4 + c.ph, sp = 4 + (k % 5) * 2.2, u = t * (0.7 + (k % 3) * 0.3);
              const f = Math.max(0, 1 - u * 1.8);
              glows.add(c.x + Math.cos(a) * sp * u, groundY(c.z + m.dir * dist) + 0.8 + (2.2 * u - 4.9 * u * u) * 1.5, c.z + m.dir * (dist + 2.3) + Math.sin(a) * sp * u, 0.45 + 0.4 * f, 4 * f, 2.2 * f, 0.5 * f);
            }
          }
        }
        z += m.dir * dist;
        y = groundY(z);
        rx += (groundY(z - 2) - groundY(z + 2)) / 4 * (m.dir > 0 ? -1 : 1);
        const jolt = braking * (1 - braking) * 4;
        rx += 0.03 * jolt * Math.sin(v * 9 + c.ph);
        // the wall: flung away from ground zero
        const rHit = Math.hypot(x - HIT.x, z - HIT.z);
        let flung = false;
        if (s.front > rHit - 6) {
          flung = true;
          const t = Math.max(0, (s.front - (rHit - 6)) / 150);
          const ax = (x - HIT.x) / rHit, az = (z - HIT.z) / rHit;
          x += ax * 60 * t; z += az * 60 * t; y += Math.max(0, 26 * t - 16 * t * t);
          rx += c.tumble[0] * t * 4; ry += c.tumble[1] * t * 3; rz += c.tumble[2] * t * 4;
        }
        c.px = x; c.py = y; c.pz = z;
        // the car that comes at you: lifted out of the road by the front, end over end, straight into the lens
        if (c.thrown && v > V_THROW) {
          const u = clamp((v - V_THROW) / (REAL_HIT - V_THROW));
          const k = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
          const cam = s.camPos;
          x = stopX(c, k, cam); y = (1 - k) * (groundY(z) + 0.2) + k * cam.y + 7.5 * Math.sin(Math.PI * Math.min(k * 1.05, 1)); z = (1 - k) * z + k * (cam.z - 0.9);
          rx += 3.1 * k + 0.35; rz += 1.3 * k; ry += 0.8 * k;
          flung = true;
        }
        e.set(rx, ry, rz);
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, one);
        const dark = c.dies && v > c.tDie;
        fleet.set(c.i, m4, !dark);
        // headlights, brake lights, then hazards on the ones still alive
        if (!flung && !dark) {
          const bx = -Math.sin(ry), bz = -Math.cos(ry);        // the car's rear points +z in its frame (front is -z)
          const rear = 2.3, w = 0.72;
          const br = (stopped > 0.5 ? 0.5 : Math.max(braking, 0.3)) * 0.9;
          const haz = smooth(3.0, 3.6, v - m.tb) * (Math.sin(v * 8.8 + c.ph) > 0 ? 1 : 0);
          for (const sd of [-1, 1]) {
            const lx = x - bx * rear + sd * w * Math.cos(ry), lz = z - bz * rear - sd * w * Math.sin(ry);
            glows.add(lx, y + 0.78, lz, 0.26, 2.6 * br + 2.2 * haz, 0.12 * br + 1.1 * haz, 0.05 * br + 0.1 * haz);
            const fx = x + bx * rear + sd * w * Math.cos(ry), fz = z + bz * rear - sd * w * Math.sin(ry);
            glows.add(fx, y + 0.7, fz, 0.6, 3.0 + 2.2 * haz, 2.8 + 0.9 * haz, 2.3 + 0.1 * haz);
          }
        }
      }
      fleet.commit();
    },
  };
}
