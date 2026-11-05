// Cars on Main Street: parked nose-in at an angle on both sides; a couple that were driving up the street and stop
// (the drivers staring); from ~10 s the fleeing cars race down the street toward you and pile up in the parking lane
// right in front of you (one backing out gets hit; the next swerves into it; the rest queue up, horns going);
// a car up the street lifts off at 18.6 s; a van tumbles across the frame at 30.4 s; from 34 s every car is
// taken, the far ones first, the pile-up last.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, wobble, clamp, lerp } from './util.js';
import { ROAD_X, TOWN_END, inCross, CROSS } from './layout.js';
import { V_FLEE, V_CRASH, V_CAR1, V_TRUCK, V_CARS } from './timeline.js';
import { flight, gone } from './fly.js';

const PAINT = [0xe8e8e8, 0x2a2c30, 0x8a1f22, 0x9aa0a8, 0x1c2e4a, 0x111111, 0x6a6e72, 0xc9c2b0, 0x30402e, 0xb84a1a, 0x4a6a9a, 0xd8d0c0];
const DEG = Math.PI / 180;
const ALPHA = 55 * DEG;      // the parking angle

export const CARS = [];
{
  const R = rng(808);
  const add = (o) => { const c = { kind: [0, 1, 2, 2, 3, 0][Math.floor(R() * 6)], col: PAINT[Math.floor(R() * PAINT.length)], ...o, i: CARS.length, seed: R(), ph: R() * 10 }; CARS.push(c); return c; };
  // parked: stalls every ~3 m, both sides, nose toward the curb
  for (const side of [-1, 1]) for (let z = 36; z > TOWN_END; z -= 3.0 + R() * 0.4) {
    if (inCross(z, 8) || R() < 0.4) continue;
    if ((Math.abs(z - (-27)) < 4 || Math.abs(z - (-18)) < 3) && side > 0) continue;   // the stalls the backing-out car and the van use
    if (side < 0 && z > -36 && z < 9) continue;                                           // the stretch beside you is clear (so you see the sidewalk and its lamp posts)
    add({ x: side * (ROAD_X - 2.2), z, yaw: -side * ALPHA, parked: true });
  }
  // the two that were driving up the street toward it and stop (right lane goes north)
  // (a car's front is -z in its own frame: yaw 0 faces up the street toward the wall, yaw PI faces you)
  add({ x: 2.4, z: -20, yaw: 0, drive: { v0: -3, sp: 6, stopAt: 2.4, decel: 2.5 }, kind: 0, col: 0x9aa0a8 });
  add({ x: 2.4, z: -66, yaw: 0, drive: { v0: -3, sp: 8, stopAt: 3.8, decel: 2.5 }, kind: 2, col: 0x1c2e4a });
  // the pile-up: B1 backs out of its stall on the right; W1 races down the wrong lane and hits it; F1 swerves into W1
  const B1 = add({ x: ROAD_X - 2.2, z: -27, yaw: -ALPHA, back: { t0: 10.4, t1: 12.4, dist: 3.4, turn: -0.45 }, kind: 1, col: 0xc9c2b0 });
  const W1 = add({ x: 2.4, z: -55, yaw: Math.PI, flee: { t0: V_FLEE + 0.2, a: 5.5, vmax: 24, stopZ: -29.6, crash: true, jolt: 0.35 }, kind: 0, col: 0x8a1f22, lights: true });
  const F1 = add({ x: -2.4, z: -78, yaw: Math.PI, flee: { t0: V_FLEE, a: 5.5, vmax: 26, stopZ: -34.5, crash: true, jolt: -0.5, swerve: 3.6 }, kind: 2, col: 0x111111, lights: true });
  add({ x: -2.4, z: -140, yaw: Math.PI, flee: { t0: V_FLEE + 0.6, a: 5, vmax: 26, stopZ: -41, crash: false, jolt: 0.12 }, kind: 3, col: 0xe8e8e8, lights: true });
  add({ x: -2.4, z: -205, yaw: Math.PI, flee: { t0: V_FLEE + 0.9, a: 5, vmax: 27, stopZ: -48.5, crash: false, jolt: -0.1 }, kind: 0, col: 0x4a6a9a, lights: true });
  add({ x: 2.4, z: -300, yaw: Math.PI, flee: { t0: V_FLEE + 1.2, a: 5, vmax: 27, stopZ: -56, crash: false, jolt: 0.15 }, kind: 1, col: 0xd8d0c0, lights: true });
  add({ x: -2.4, z: -360, yaw: Math.PI, flee: { t0: V_FLEE + 2.0, a: 5, vmax: 28, stopZ: -63, crash: false, jolt: -0.12 }, kind: 2, col: 0x2a2c30, lights: true });
  B1.pile = W1.pile = F1.pile = true;
  // the hero car up the street (lifts first) and the van that tumbles across the frame
  const hero = CARS.find((c) => c.parked && c.x < 0 && c.z < -112 && c.z > -135);
  if (hero) { hero.tLift = V_CAR1; hero.hero = true; hero.lights = true; }
  const van = add({ x: ROAD_X - 2.2, z: -18, yaw: -ALPHA, parked: true, kind: 3, col: 0xf0f0f0, tLift: V_TRUCK, lat: -13, van: true });
  // when the rest go: the far ones first, the pile-up last
  for (const c of CARS) {
    if (c.tLift) continue;
    const k = smooth(-420, 0, c.z);
    c.tLift = V_CARS + 6 * k + R() * 1.5 + (c.pile ? 3 : 0);
  }
}

// how far a fleeing car has come, t seconds after it set off (accelerating at a to vmax)
function fleeDist(a, vmax, t) {
  if (t <= 0) return 0;
  const tA = vmax / a;
  return t < tA ? 0.5 * a * t * t : 0.5 * a * tA * tA + vmax * (t - tA);
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) fleet.color(c.i, c.col, c.kind);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const q2 = new THREE.Quaternion(), AX = new THREE.Vector3();
  const fl = {};
  return {
    frame(v, s, glows) {
      const W = s.W;
      const rockK = Math.min(1, W * W / 6000);
      for (const c of CARS) {
        let x = c.x, y = 0, z = c.z, rx = 0, rz = 0, ry = c.yaw, lights = !!c.lights, crashed = 0;
        if (c.drive) {
          // rolling up the street, braking to a stop
          const d = c.drive, t = v - d.v0;
          const tStop = d.stopAt - d.v0;
          const dist = t < 0 ? 0 : t < tStop ? d.sp * t - 0.5 * (d.sp / tStop) * t * t : d.sp * tStop / 2;
          z = c.z - dist;
          lights = true;
        }
        if (c.back) {
          // backing out of the stall into the lane, swinging round
          const b = c.back, k = smooth(b.t0, b.t1, v);
          const dist = b.dist * k;
          // the car's back is +z in its frame: moving backward = along (sin yaw, cos yaw)
          x += Math.sin(c.yaw) * dist; z += Math.cos(c.yaw) * dist;
          ry += b.turn * k;
          lights = v > b.t0 - 0.5;
          if (v > V_CRASH) { const j = smooth(V_CRASH, V_CRASH + 0.25, v); x += 0.7 * j; z -= 1.0 * j; ry += -0.35 * j; crashed = 1; }
        }
        if (c.flee) {
          const f = c.flee, t = v - f.t0;
          let dist = fleeDist(f.a, f.vmax, t);
          const maxD = f.stopZ - c.z;
          if (dist >= maxD) {
            dist = maxD;
            if (f.crash) crashed = 1;
          } else if (!f.crash) {
            // braking hard behind the pile: the last 12 m at a skid
            const brakeK = smooth(maxD - 12, maxD, dist);
            rx += 0.04 * brakeK * (1 - smooth(maxD - 0.5, maxD, dist));
          }
          z = c.z + dist;
          if (f.swerve && dist > maxD - 14) x += f.swerve * smooth(maxD - 14, maxD - 2, dist);
          if (dist >= maxD) {
            const tc = t - (() => { const tA = f.vmax / f.a; return maxD < 0.5 * f.a * tA * tA ? Math.sqrt(2 * maxD / f.a) : tA + (maxD - 0.5 * f.a * tA * tA) / f.vmax; })();
            const j = smooth(0, 0.25, tc);
            ry += f.jolt * j;
            if (f.crash) { rx += -0.06 * j * Math.exp(-tc * 2); y += 0.15 * j * Math.exp(-tc * 3); }
          }
          lights = true;
        }
        // rocking in the gusts, before it goes
        if (v < c.tLift) {
          rx += wobble(v * 6, c.ph) * 0.02 * rockK; rz += wobble(v * 7, c.ph + 2) * 0.03 * rockK;
          if (rockK > 0.5) { z -= 0.3 * (rockK - 0.5) * smooth(0, 4, v - 26) * (1 + Math.sin(c.ph)); }
        }
        if (v > c.tLift) {
          fl.x = x; fl.y = y; fl.z = z; fl.t0 = c.tLift; fl.tau = c.hero ? 2.0 : c.van ? 2.6 : 3.2; fl.lift = c.hero ? 16 : c.van ? 9 : 6 + 4 * Math.sin(c.ph); fl.r = 3; fl.seed = c.seed; fl.ground = 0.3;
          const f = flight(fl, v, {});
          if (gone(f, s)) { fleet.set(c.i, m4.makeScale(0, 0, 0), false); continue; }
          x = f.x; y = f.y + 0.4; z = f.z;
          if (c.lat) x += c.lat * smooth(0, 2.4, v - c.tLift);
          e.set(0, ry, 0); q.setFromEuler(e);
          AX.set(1, 0.3 * Math.cos(c.seed * 7.3), 0.5 * Math.sin(c.seed * 12.1)).normalize();
          q2.setFromAxisAngle(AX, f.ang * 0.8);
          q2.multiply(q);
          m4.compose(p.set(x, y, z), q2, one);
          fleet.set(c.i, m4, lights);
          continue;
        }
        e.set(rx, ry, rz);
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, one);
        fleet.set(c.i, m4, lights);
        if (crashed) {
          // hazard lights blinking on the crashed ones
          const bl = Math.sin(v * 2 * Math.PI * 1.4 + c.ph) > 0 ? 1 : 0;
          glows.add(x + Math.sin(ry) * 2.1, 0.75, z + Math.cos(ry) * 2.1, 0.5, 3.5 * bl, 1.5 * bl, 0.2);
        }
      }
      fleet.commit();
    },
  };
}
