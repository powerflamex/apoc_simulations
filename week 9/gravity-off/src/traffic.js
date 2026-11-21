// The cars on the west street. Weightless, a car's springs (15 cm of sag) throw its body up and the wheels follow:
// 0.35-0.7 m/s up, the front and back a little different (a slow pitch), and the tires, no longer pressed on the road,
// have no grip: nothing can steer or brake. The parked ones drift up off their spaces; the two driving keep their
// speed in a straight line, the braking one (its nose was dipped, its front springs loaded) pitching nose-up; the one
// pulling into a space was on the curb with its right front wheel, which kicks it into a slow roll. At 0.00 they fall
// from where they got to and land how they're turned (the roller on its side).
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { ROAD } from './layout.js';
import { G, T_ON, SPIN } from './timeline.js';
import { rng, smooth } from './util.js';

const COLS = [0xb8bcc2, 0x1d1f24, 0xf2f2ee, 0x8a1f1c, 0x2a4a7a, 0x5a5e66, 0xc9a24a, 0x3a5a3a, 0xd8d4cc, 0x203a5a, 0x9a2a2a];
export const CARS = [];
{
  const R = rng(3434);
  // parked along the square's side of the street, nose to tail (some facing each way)
  for (let z = -25; z < 27; z += 5.6) {
    if (R() < 0.15) continue;
    CARS.push({ kind: [0, 1, 2, 0, 3, 1][Math.floor(R() * 6)], p: [ROAD.park + (R() - 0.5) * 0.15, 0, z + (R() - 0.5) * 0.5], yaw: R() < 0.7 ? 0 : Math.PI,
      u: [0, 0.35 + 0.3 * R(), 0], w: [(R() - 0.5) * 0.18, (R() - 0.5) * 0.03, (R() - 0.5) * 0.12], col: COLS[Math.floor(R() * COLS.length)] });
  }
  // driving north, braking for the people stepping off the curb ahead: nose dipped -> it rears up
  CARS.push({ kind: 2, p: [ROAD.laneN, 0, 26], yaw: 0, u: [0, 0.55, -9.0], w: [0.13, 0.0, 0.03], col: 0xc8261e, drive: true });
  // driving south
  CARS.push({ kind: 0, p: [ROAD.laneS, 0, -14], yaw: Math.PI, u: [0, 0.45, 10.5], w: [-0.05, 0.0, -0.04], col: 0x2a5a9a, drive: true });
  CARS.push({ kind: 3, p: [ROAD.laneS, 0, -48], yaw: Math.PI, u: [0, 0.4, 9.5], w: [-0.04, 0.0, 0.05], col: 0xf2f2ee, drive: true });
  // pulling in to a space, right front wheel up on the curb: kicked into a roll toward the square
  CARS.push({ kind: 1, p: [ROAD.curb - 2.05, 0, 11.5], yaw: -0.46, u: [1.2, 0.72, -2.4], w: [0.1, 0.02, -0.34], col: 0xe0a828, drive: true, roller: true });
  // a parked car's neighbour space: the gap the roller is aiming for stays empty
  for (let i = CARS.length - 1; i >= 0; i--) if (!CARS[i].drive && Math.abs(CARS[i].p[2] - 10.5) < 4.6) CARS.splice(i, 1);
}
const CY = 0.6;                    // the car's centre of mass above its ground point
// a car at story time t: centre position, Euler rotation (pitch x, yaw y, roll z), and whether it has landed
export function carAt(c, t, out) {
  const tt = Math.max(0, Math.min(t, T_ON));
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  out.x = c.p[0] + c.u[0] * tt; out.y = CY + c.u[1] * tt + 0.5 * SPIN.up * tt * tt; out.z = c.p[2] + c.u[2] * tt + 0.5 * SPIN.south * tt * tt;
  out.rx = c.w[0] * tt; out.ry = c.yaw + c.w[1] * tt; out.rz = c.w[2] * tt; out.landed = false; out.tl = Infinity; out.vy = c.u[1];
  if (t > T_ON) {
    const vy = c.u[1] + SPIN.up * T_ON;
    // it lands when its lowest point reaches the road: about its half-height, more if it's on its side or tipped
    const tilt = Math.max(Math.abs(Math.sin(out.rz)), Math.abs(Math.sin(out.rx)) * 1.6);
    const hs = 0.6 + 0.4 * tilt;
    const h = out.y - hs;
    const tl = h > 0 ? (vy + Math.sqrt(vy * vy + 2 * G * h)) / G : 0;
    out.tl = T_ON + tl;
    const s = Math.min(t - T_ON, tl);
    out.x += c.u[0] * s; out.z += c.u[2] * s; out.y += vy * s - 0.5 * G * s * s;
    out.rx += c.w[0] * s; out.rz += c.w[2] * s; out.ry += c.w[1] * s;
    out.vy = vy - G * s;
    if (t - T_ON >= tl) {
      // landed: slam and settle onto whatever face is down (wheels, side or roof) within 0.15 s, a short skid
      out.landed = true;
      const k = smooth(0, 0.15, t - T_ON - tl);
      const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
      const rz0 = out.rz, rx0 = out.rx;
      out.rz = rz0 + (snap(rz0) - rz0) * k; out.rx = rx0 + (0 - rx0) * k;
      const side = Math.abs(Math.sin(out.rz));
      out.y = hs + (0.6 + 0.35 * side - hs) * k;
      const sk = Math.min(t - T_ON - tl, 0.5);
      out.x += c.u[0] * (sk - sk * sk); out.z += c.u[2] * (sk - sk * sk);
    }
  }
  return out;
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const o = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), off = new THREE.Matrix4().makeTranslation(0, -CY, 0);
  return {
    frame(t) {
      CARS.forEach((c, i) => {
        carAt(c, t, o);
        e.set(o.rx, o.ry, o.rz, 'YXZ'); q.setFromEuler(e);
        m4.compose(p.set(o.x, o.y, o.z), q, one).multiply(off);
        fleet.set(i, m4, !!c.drive);
      });
      fleet.commit();
    },
  };
}
