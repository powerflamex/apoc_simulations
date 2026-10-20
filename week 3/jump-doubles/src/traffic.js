// The cars: everyone stopped to watch, headlights on. Every bounce rocks the cars near it (alarms: the hazard
// lights blink from then on); the cars inside a bounce's reach are thrown, tumbling, outward, and lie where they
// land (on their side, on their roof); after a landing from space the near ones burn. Worked out once, in order:
// each throw starts from where the last one left the car.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { CARS } from './layout.js';
import { BOUNCES } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
const col = new THREE.Color(), dark = new THREE.Color(0x141210);

// every car's history: a list of throws { v, x0, z0, x1, z1, T, H, rollTo, pitchTo, yawTo } plus alarm and fire times
for (const c of CARS) {
  const R = rng(Math.round(c.seed * 1e6));
  c.throws = []; c.vAlarm = 1e9; c.vFire = 1e9; c.vDead = 1e9;
  let x = c.x, z = c.z, yaw = c.yaw, roll = 0, pitch = 0;
  for (const b of BOUNCES) {
    const d = Math.hypot(x, z);
    const arrive = b.v + Math.min(0.3, d / 1000);
    if (d < b.cars * 2.2 + 5 && c.vAlarm > 1e8) c.vAlarm = arrive;
    if (d < b.cars) {
      const ux = x / (d || 1), uz = z / (d || 1);
      const push = (b.cars - d) * (0.6 + 0.6 * R()) + 3 + 4 * R();
      const x1 = x + ux * push + (R() - 0.5) * 2, z1 = z + uz * push + (R() - 0.5) * 2;
      const T = 0.5 + Math.min(1.6, push * 0.035);
      const H = Math.min(push * 0.35, 25) * (0.5 + 0.5 * R());
      const flips = Math.round((R() * 2 + push / 25) * 2) / 2;   // half turns
      const rest = R();
      const rollTo = roll + Math.PI * flips + (rest < 0.3 ? Math.PI / 2 : 0);
      const pitchTo = pitch + (R() - 0.5) * 1.2;
      const yawTo = yaw + (R() - 0.5) * 3;
      c.throws.push({ v: arrive, x0: x, z0: z, x1, z1, T, H, roll0: roll, pitch0: pitch, yaw0: yaw, rollTo, pitchTo, yawTo });
      x = x1; z = z1; roll = rollTo; pitch = pitchTo * 0.2; yaw = yawTo;
      c.vDead = Math.min(c.vDead, arrive);
      // settle: a car can only lie on its wheels, side or roof
      roll = Math.round(roll / (Math.PI / 2)) * (Math.PI / 2);
      c.throws[c.throws.length - 1].rollTo = roll;
      c.throws[c.throws.length - 1].pitchTo = pitch;
    }
    if (b.hot > 0.3 && d < b.knock * 0.75 && c.vFire > 1e8) c.vFire = arrive + 0.2 + R() * 0.8;
  }
  c.end = { x, z, yaw, roll, pitch };
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  return {
    frame(v, s, glows, smoke) {
      CARS.forEach((c, i) => {
        let x = c.x, z = c.z, y = 0, yaw = c.yaw, roll = 0, pitch = 0;
        for (const t of c.throws) {
          if (v < t.v) break;
          const k = clamp((v - t.v) / t.T);
          const ke = 1 - Math.pow(1 - k, 1.6);
          x = t.x0 + (t.x1 - t.x0) * ke; z = t.z0 + (t.z1 - t.z0) * ke;
          y = 4 * t.H * k * (1 - k);
          roll = t.roll0 + (t.rollTo - t.roll0) * smooth(0, 1, k);
          pitch = t.pitch0 + (t.pitchTo - t.pitch0) * smooth(0, 1, k);
          yaw = t.yaw0 + (t.yawTo - t.yaw0) * ke;
        }
        // a hop when the ground jumps under it
        const b = s.bounce;
        if (b && s.sinceB < 0.5) {
          const d = Math.hypot(x, z);
          if (d < b.cars * 3 + 12) y += 0.35 * Math.exp(-s.sinceB / 0.12) * Math.sin(Math.min(s.sinceB / 0.25, 1) * Math.PI) * clamp(1 - d / (b.cars * 3 + 12));
        }
        // lying on its side or roof: lift it so it rests on the ground
        const side = Math.abs(Math.sin(roll));
        const lift = side * 0.95 + (Math.cos(roll) < -0.5 ? 1.5 : 0);
        e.set(pitch, yaw, roll, 'YXZ');
        q.setFromEuler(e);
        m4.compose(pos.set(x, y + lift, z), q, sc);
        const alive = v < c.vDead;
        fleet.set(i, m4, alive && s.v < 1e9);
        // burnt black once it has burned a while
        const burnt = smooth(c.vFire, c.vFire + 4, v);
        if (burnt > 0) fleet.color(i, col.set(c.col).lerp(dark, burnt), c.kind);
        // hazard lights blinking after the alarm goes off
        if (v > c.vAlarm && v < c.vFire && c.vDead > v - 30) {
          const on = Math.sin((v - c.vAlarm) * Math.PI * 2 * 1.4) > 0 ? 1 : 0;
          if (on) {
            const cs = Math.cos(yaw), sn = Math.sin(yaw);
            for (const [ax, az] of [[-0.8, -2.2], [0.8, -2.2], [-0.8, 2.2], [0.8, 2.2]]) {
              glows.add(x + ax * cs + az * sn, y + lift + 0.7, z - ax * sn + az * cs, 0.9, 2.4, 1.1, 0.15);
            }
          }
        }
        // on fire
        if (v > c.vFire) {
          const age = v - c.vFire;
          const g = smooth(0, 0.8, age) * (1 - 0.5 * smooth(8, 20, age));
          const fl = 0.75 + 0.25 * Math.sin(v * 17 + c.seed * 50) * Math.sin(v * 7.3 + c.seed * 9);
          glows.add(x, y + 1.4, z, 3.5, 3.2 * g * fl, 1.2 * g * fl, 0.3 * g * fl);
          glows.add(x, y + 2.5, z, 6, 1.0 * g, 0.35 * g, 0.08 * g);
          for (let k = 0; k < 3; k++) {
            const ph = (v * 0.35 + c.seed + k / 3) % 1;
            smoke.puff(x + ph * 3, 2 + ph * 14, z, 1.2 + ph * 4, 0.35 * g * Math.sin(Math.PI * ph), 0.08, 0.6 * (1 - ph) * g, c.seed + k);
          }
        }
      });
      fleet.commit();
    },
  };
}
