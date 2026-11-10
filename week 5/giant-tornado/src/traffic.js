// Cars on Main Street: parked nose-in at an angle (the stalls by you are empty, so you can see the crash and the crowd);
// a line waiting at the red light up the street in the right lane, a jam stuck far up the left lane behind the crowd.
// From ~10 s the line races down the right lane toward you. Right in front of you, 15 m away, a car backing out of its
// stall swings across the lane and the first car T-bones it at ~50 mph: it stops dead with its rear kicking up, the car
// it hit is shoved at you, spinning, up on two wheels, with glass and parts flying; 0.8 s later the next one
// slams into the back of it; the rest brake hard behind them, hazards on. A car on the left lifts off at 18.6 s, a van
// tumbles across the frame at 30.4 s, and from 34 s every car is taken, the far ones first, the crash last.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, wobble, clamp, lerp } from './util.js';
import { ROAD_X, TOWN_END, inCross } from './layout.js';
import { V_FLEE, V_CRASH, V_CRASH2, V_CAR1, V_TRUCK, V_CARS } from './timeline.js';
import { flight, gone } from './fly.js';

const PAINT = [0xe8e8e8, 0x2a2c30, 0x8a1f22, 0x9aa0a8, 0x1c2e4a, 0x111111, 0x6a6e72, 0xc9c2b0, 0x30402e, 0xb84a1a, 0x4a6a9a, 0xd8d0c0];
const DEG = Math.PI / 180;
const ALPHA = 55 * DEG;      // the parking angle
const LANE = 1.75;           // the right lane
const PARK_X = ROAD_X - 2.6;

// how far a car has come t s after setting off: up to vmax at a, then (if it has a stopping distance) braking at b
function run(t, { a, vmax, D, b = 0 }) {
  if (t <= 0) return 0;
  if (!b) {       // no brakes: it just hits something at D
    const ta = vmax / a, d = t < ta ? 0.5 * a * t * t : 0.5 * a * ta * ta + vmax * (t - ta);
    return Math.min(d, D);
  }
  const vp = Math.min(vmax, Math.sqrt(2 * D * a * b / (a + b)));
  const ta = vp / a, tb = vp / b, cruise = Math.max(0, (D - 0.5 * vp * ta - 0.5 * vp * tb) / vp), t1 = ta + cruise, t2 = t1 + tb;
  if (t < ta) return 0.5 * a * t * t;
  if (t < t1) return 0.5 * vp * ta + vp * (t - ta);
  if (t < t2) { const u = t - t1; return 0.5 * vp * ta + vp * cruise + vp * u - 0.5 * b * u * u; }
  return D;
}
// when a car with no brakes reaches D
function tHit({ a, vmax, D }) {
  const ta = vmax / a, da = 0.5 * a * ta * ta;
  return D < da ? Math.sqrt(2 * D / a) : ta + (D - da) / vmax;
}

export const CARS = [];
export const IMPACTS = [{ t: V_CRASH, x: 2.1, y: 1.0, z: -15.9, k: 1 }, { t: V_CRASH2, x: LANE, y: 0.8, z: -19.3, k: 0.8 }];
const zW = -18.2, zF = -21.7;
{
  const R = rng(808);
  const add = (o) => { const c = { kind: [0, 1, 2, 2, 3, 0][Math.floor(R() * 6)], col: PAINT[Math.floor(R() * PAINT.length)], ...o, i: CARS.length, seed: R(), ph: R() * 10 }; CARS.push(c); return c; };
  // parked: stalls every ~3 m, both sides, nose toward the curb
  for (const side of [-1, 1]) for (let z = 36; z > TOWN_END; z -= 3.0 + R() * 0.4) {
    if (inCross(z, 8) || R() < 0.4) continue;
    if (side < 0 && z > -38) continue;                 // the left side is clear by you: that's where the crowd stands
    if (side > 0 && (z > -23 || Math.abs(z + 30) < 2.6)) continue;   // and so are the stalls by you on the right, and the van's
    add({ x: side * PARK_X, z, yaw: -side * ALPHA, parked: true });
  }
  // (a car's front is -z in its own frame: yaw 0 faces up the street toward the wall, yaw PI faces you)
  const B1 = add({ x: PARK_X, z: -18, yaw: -ALPHA, back: { t0: 12.5, t1: 14.05, dist: 4.75, turn: -0.6 }, kind: 1, col: 0xd8d0c0 });
  const W1 = add({ x: LANE, z: -78, yaw: Math.PI, kind: 0, col: 0xa81f22, lights: true });
  W1.flee = { a: 6, vmax: 22, D: zW - W1.z, crash: 1 };
  W1.flee.t0 = V_CRASH - tHit(W1.flee);
  const F1 = add({ x: LANE, z: -85, yaw: Math.PI, kind: 2, col: 0x1c3a6a, lights: true });
  F1.flee = { a: 6, vmax: 21, D: zF - F1.z, crash: 2 };
  F1.flee.t0 = V_CRASH2 - tHit(F1.flee);
  // the rest of the line brake hard behind them
  [[-92, -29.5, 3, 0xe8e8e8], [-99, -37, 0, 0x4a6a9a], [-106, -44.5, 1, 0xd8d0c0], [-113, -52, 2, 0x2a2c30]].forEach(([z, stop, kind, col], n) => {
    add({ x: LANE, z, yaw: Math.PI, kind, col, lights: true, flee: { t0: V_FLEE + 0.9 + n * 0.55, a: 5, vmax: 20, b: 8, D: stop - z } });
  });
  // the jam stuck up the left lane behind the crowd, lights on, going nowhere
  for (const z of [-116, -123, -130.5, -138]) add({ x: -LANE, z, yaw: Math.PI, lights: true });
  B1.pile = W1.pile = F1.pile = true;
  B1.hit = 'side'; W1.hit = 'first'; F1.hit = 'rear';
  // the car on the left that goes first, and the van that tumbles across the frame
  const hero = CARS.find((c) => c.parked && c.x < 0 && c.z < -44 && c.z > -70);
  if (hero) { hero.tLift = V_CAR1; hero.hero = true; hero.lights = true; }
  add({ x: PARK_X, z: -30, yaw: -ALPHA, parked: true, kind: 3, col: 0xf0f0f0, tLift: V_TRUCK, lat: -13, van: true });
  // when the rest go: the far ones first, the crash last
  for (const c of CARS) {
    if (c.tLift) continue;
    const k = smooth(-420, 0, c.z);
    c.tLift = Math.min(V_CARS + 6 * k + R() * 1.5 + (c.pile ? 3 : 0), 44.4);
  }
}

// glass and bits of car, thrown forward from the two hits: each flies, lands, then lies on the road
const SHARDS = [];
{
  const R = rng(99);
  IMPACTS.forEach((h, n) => {
    for (let i = 0; i < 90; i++) {
      const big = i < 8;
      const sp = big ? 5 + R() * 6 : 4 + R() * 12;
      const a = (R() - 0.5) * 2.4;      // spread, mostly at you
      SHARDS.push({ h, x: h.x + (R() - 0.5) * 1.6, y: h.y + R() * 0.5, z: h.z + (n ? 0 : 0.2), vx: Math.sin(a) * sp, vy: 1.5 + R() * (big ? 3.5 : 5), vz: Math.cos(a) * sp, s: big ? 0.16 + R() * 0.16 : 0.05 + R() * 0.09, big, spin: 6 + R() * 16, ph: R() * 6, col: big ? (n ? 0x1c3a6a : 0xa81f22) : R() < 0.75 ? 0xdcecf4 : 0xc01818 });
    }
  });
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  for (const c of CARS) fleet.color(c.i, c.col, c.kind);
  const shardMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 0.7), new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.7 }), SHARDS.length);
  const col = new THREE.Color();
  SHARDS.forEach((p, i) => shardMesh.setColorAt(i, col.set(p.col)));
  shardMesh.frustumCulled = false; shardMesh.castShadow = false;
  scene.add(shardMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  const q2 = new THREE.Quaternion(), AX = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const fl = {};
  return {
    frame(v, s, glows) {
      const W = s.W;
      const rockK = Math.min(1, W * W / 6000);
      for (const c of CARS) {
        let x = c.x, y = 0, z = c.z, rx = 0, rz = 0, ry = c.yaw, lights = !!c.lights, crashed = false;
        if (c.back) {
          // backing out of the stall, swinging across the lane
          const b = c.back, k = smooth(b.t0, b.t1, v);
          x += Math.sin(c.yaw) * b.dist * k; z += Math.cos(c.yaw) * b.dist * k;
          ry += b.turn * k;
          lights = v > b.t0 - 0.5;
        }
        if (c.flee) {
          const f = c.flee, d = run(v - f.t0, f);
          z = c.z + d;
          lights = true;
          if (f.b) {
            // the nose dives under hard braking, then rocks back
            const t2 = v - f.t0, D = f.D;
            if (d > D - 16 && d < D) rx -= 0.05;
            else if (d >= D) { let tStop = 0; while (tStop < 20 && run(tStop, f) < D - 0.001) tStop += 0.05; rx -= 0.05 * Math.exp(-(t2 - tStop) / 0.25) * Math.cos((t2 - tStop) * 9); }
          }
        }
        // the hits
        if (c.hit && v > V_CRASH) {
          const tc = v - V_CRASH, tc2 = v - V_CRASH2;
          crashed = true;
          if (c.hit === 'first') {
            // stops dead, its rear kicking up, then shoved on by the one behind
            z += 1.3 * (1 - Math.exp(-tc / 0.12));
            rx -= 0.26 * Math.sin(Math.PI * clamp(tc / 0.62));
            y += 0.55 * Math.sin(Math.PI * clamp(tc / 0.62));
            ry += 0.3 * (1 - Math.exp(-tc / 0.2));
            if (tc2 > 0) { z += 1.2 * (1 - Math.exp(-tc2 / 0.12)); rx += 0.09 * Math.sin(Math.PI * clamp(tc2 / 0.4)); ry -= 0.14 * (1 - Math.exp(-tc2 / 0.2)); }
          } else if (c.hit === 'side') {
            // shoved at you, spinning, up on two wheels, and back down
            const k = 1 - Math.exp(-tc / 0.34);
            z += 3.9 * k; x -= 0.5 * k; ry += 1.45 * (1 - Math.exp(-tc / 0.42));
            rz -= 0.3 * Math.sin(Math.PI * clamp(tc / 0.8));
            y += 0.5 * Math.sin(Math.PI * clamp(tc / 0.8));
            lights = false;
          } else if (tc2 > 0) {
            z += 0.8 * (1 - Math.exp(-tc2 / 0.12));
            rx -= 0.17 * Math.sin(Math.PI * clamp(tc2 / 0.5));
            y += 0.28 * Math.sin(Math.PI * clamp(tc2 / 0.5));
            ry -= 0.24 * (1 - Math.exp(-tc2 / 0.2));
          }
        }
        // rocking in the gusts, before it goes
        if (v < c.tLift) {
          rx += wobble(v * 6, c.ph) * 0.02 * rockK; rz += wobble(v * 7, c.ph + 2) * 0.03 * rockK;
          if (rockK > 0.5) { z -= 0.3 * (rockK - 0.5) * smooth(0, 4, v - 26) * (1 + Math.sin(c.ph)); }
        }
        if (v > c.tLift) {
          fl.x = x; fl.y = y; fl.z = z; fl.t0 = c.tLift; fl.tau = c.hero ? 2.0 : c.van ? 2.6 : 3.2; fl.lift = c.hero ? 16 : c.van ? 9 : 6 + 4 * Math.sin(c.ph); fl.r = 3; fl.seed = c.seed; fl.ground = 0.3;
          const f = flight(fl, v, {});
          if (gone(f, s)) { fleet.set(c.i, ZERO, false); continue; }
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
          if (bl) glows.add(x + Math.sin(ry) * 2.1, 0.75, z + Math.cos(ry) * 2.1, 0.5, 3.5, 1.5, 0.2);
        }
      }
      fleet.commit();
      // the glass and the parts
      SHARDS.forEach((b, i) => {
        const t = v - b.h.t;
        if (t < 0 || v > 30) { shardMesh.setMatrixAt(i, ZERO); return; }
        const tl = (b.vy + Math.sqrt(b.vy * b.vy + 19.6 * b.y)) / 9.8;         // when it lands
        const tf = Math.min(t, tl), skid = Math.max(0, t - tl);
        const slide = 0.35 * (1 - Math.exp(-skid * 2.5));
        const px = b.x + b.vx * tf + b.vx * slide, pz = b.z + b.vz * tf + b.vz * slide - 0.5 * Math.max(0, v - 20) ** 2 * 0.6;
        const py = Math.max(0.03, b.y + b.vy * tf - 4.9 * tf * tf);
        const ang = b.spin * tf + b.ph;
        e.set(ang, ang * 0.7, 0.3 * ang);
        q.setFromEuler(e);
        m4.compose(p.set(px, py, pz), q, b.big ? sc.set(b.s * 3, b.s, b.s) : sc.setScalar(b.s));
        shardMesh.setMatrixAt(i, m4);
      });
      shardMesh.instanceMatrix.needsUpdate = true;
      // the flash of each hit
      for (const h of IMPACTS) {
        const t = v - h.t;
        if (t >= 0 && t < 0.2) { const k = 1 - t / 0.2; glows.add(h.x, h.y, h.z + 0.4, 2.6 * h.k * (1 + t * 4), 6 * k, 4.6 * k, 3 * k); }
      }
    },
  };
}
