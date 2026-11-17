// The cars: parked along both curbs, and slow midday traffic one lane each way. A driver brakes to a stop once your
// scream is past ~125 dB where the car is (a car's body takes ~20 dB off). From ~1,000,000x the car alarms within
// ~40 m go off (hazard lights blinking). At ~3 psi a car is shoved away from you (a skid and a rock on its springs),
// at ~5 psi it's thrown: it tumbles end over end or over its side and comes down on its roof, then slides.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { PARKED, MOVING, MOUTH } from './layout.js';
import { timeOfL, timeOfPressure, P_SHOVE, P_FLIP } from './timeline.js';
import { throwAt } from './physics.js';
import { rng, smooth, clamp } from './util.js';

const PAINT = [0xe8e8e8, 0xc02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0x8a1a1a, 0x5a6a7a, 0x3a3a40, 0xd8a020];
const TAXI = 0xf0c030;
const LEN = [4.5, 4.0, 4.6, 4.9], WID = [1.8, 1.76, 1.88, 1.92];
const PIV = 0.75;    // the height of a car's middle (it turns about it)
const rOf = (x, z) => Math.hypot(x - MOUTH.x, PIV - MOUTH.y, z - MOUTH.z);

export const CARS = [];
{
  const R = rng(3131);
  const finish = (c) => {
    c.col = R() < 0.15 ? TAXI : PAINT[Math.floor(R() * PAINT.length)];
    const r = rOf(c.sx, c.sz);
    c.tShove = timeOfPressure(P_SHOVE * (0.8 + 0.4 * R()), r);
    c.tFlip = Math.max(c.tShove + 0.4, timeOfPressure(P_FLIP * (0.8 + 0.4 * R()), r));
    c.tAlarm = r < 45 ? timeOfL(5.8) + 0.15 + R() * 0.9 + r * 0.004 : Infinity;
    const dx = c.sx - MOUTH.x, dz = c.sz - MOUTH.z, dh = Math.hypot(dx, dz) || 1;
    c.ux = dx / dh; c.uz = dz / dh;
    c.shove = 1.2 + 1.8 * R();
    const V = 7 + 9 * R(), U = 4 + 4 * R();
    // the tumble: about the horizontal axis across the push; lands on its roof (half a turn) or after one and a half
    c.axis = new THREE.Vector3(-c.uz, 0, c.ux);
    c.turns = R() < 0.7 ? Math.PI : 3 * Math.PI;
    c.T = { t0: c.tFlip, p: [c.sx + c.ux * c.shove, PIV, c.sz + c.uz * c.shove], vel: [c.ux * V, U, c.uz * V], hs: PIV - 0.02, D: 6, wallX: 10.3 };
    c.ph = R();
    CARS.push(c);
  };
  for (const p of PARKED) finish({ kind: p.kind, sx: p.x, sz: p.z, yaw: p.yaw, moving: false });
  // moving: where it stops (it brakes once the scream is past ~125 dB inside: 145 dB outside)
  for (const m of MOVING) {
    let z = m.z0, ts = 0;
    for (let k = 0; k < 4; k++) {
      const r = rOf(m.x, z);
      ts = timeOfL(4.5 + 2 * Math.log10(Math.max(r, 1)) + 0.0) + 0.4;
      z = m.z0 + m.dir * m.speed * Math.max(ts, -3);
    }
    const brake = 3.5, zs = z + m.dir * m.speed * m.speed / (2 * brake);
    const c = { kind: m.kind, sx: m.x, sz: zs, yaw: m.dir < 0 ? 0 : Math.PI, moving: true, m, ts, brake };
    if (zs > 30 || zs < -300) continue;
    finish(c);
  }
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), qa = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const pivot = new THREE.Matrix4().makeTranslation(0, -PIV, 0), st = {};
  const Y = new THREE.Vector3(0, 1, 0), corner = new THREE.Vector3();
  return {
    frame(v, s, glows) {
      CARS.forEach((c, i) => {
        // where it is before anything hits it
        let x = c.sx, z = c.sz;
        if (c.moving) {
          const m = c.m;
          if (v < c.ts) z = m.z0 + m.dir * m.speed * v;
          else { const t = Math.min(v - c.ts, m.speed / c.brake); z = m.z0 + m.dir * (m.speed * c.ts + m.speed * t - 0.5 * c.brake * t * t); }
        }
        qy.setFromAxisAngle(Y, c.yaw);
        let ang = 0, y = PIV;
        // shoved: a skid away from you and a rock
        const ks = smooth(c.tShove, c.tShove + 0.5, v);
        x += c.ux * c.shove * ks; z += c.uz * c.shove * ks;
        const rock = v > c.tShove ? 0.18 * Math.sin(Math.min(v - c.tShove, 1.2) * 9) * Math.exp(-(v - c.tShove) * 2.5) : 0;
        ang = rock;
        // thrown
        if (v > c.T.t0) {
          throwAt(c.T, v, st);
          x = st.x; y = st.y; z = st.z;
          ang = c.turns * (st.landed ? 1 : smooth(0, 1, st.f) * 0.3 + st.f * 0.7);
        }
        qa.setFromAxisAngle(c.axis, ang);
        q.multiplyQuaternions(qa, qy);
        m4.compose(p.set(x, y, z), q, one).multiply(pivot);
        fleet.set(i, m4, false);
        // the alarm: hazard lights blinking
        if (v > c.tAlarm && glows) {
          const on = ((v - c.tAlarm) * 1.6 + c.ph) % 1 < 0.5;
          if (on) {
            const L = LEN[c.kind] / 2, Wd = WID[c.kind] / 2 - 0.15;
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              corner.set(sx * Wd, 0.72, sz * (L + 0.05)).applyMatrix4(m4);
              glows.add(corner.x, corner.y, corner.z, 0.55, 3.2, 1.3, 0.15);
            }
          }
        }
      });
      fleet.commit();
    },
  };
}
