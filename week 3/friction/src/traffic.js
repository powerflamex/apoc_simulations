// The cars and the cable car. Tyres and brakes are friction: parked cars all slide away down the hill together the
// moment it goes (slowly turning, nothing to keep them straight), cars driving up coast to a stop and slide back,
// cars driving down just keep speeding up. They shoot across the waterfront and off the seawall into the bay,
// float a few seconds and go under. The cars crossing the flat top intersection can't stop or turn: they glide on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFleet } from './cars.js';
import { CARS, CABLE, cableAt } from './layout.js';
import { tOf, slide, ride, bulldoze, hill, surfaceY, slabD, VT, GRADE, SLAB, Z_EDGE, WATER_Y, V_SLIDE } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0xe3b21a, 0x6d1f4f, 0xf2f2f0, 0x1f2328, 0x9aa7b3];
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mC = new THREE.Matrix4();
const sl = {}, rd = {};
const slopeAt = (z) => (hill(z - 0.5) - hill(z + 0.5));       // rise per metre toward -z

// a matrix for a vehicle at (x, y, z), heading yaw, tilted with the ground under it, plus a pitch/roll of its own
function vehicle(x, y, z, yaw, tilt, pitch = 0, roll = 0, out = mA) {
  out.makeTranslation(x, y, z);
  out.multiply(mB.makeRotationX(tilt));
  out.multiply(mB.makeRotationY(yaw));
  if (pitch || roll) out.multiply(mC.makeRotationFromEuler(new THREE.Euler(pitch, 0, roll, 'XYZ')));
  return out;
}

// where a car is at video time v: { x, y, z, yaw, tilt, pitch, roll, lights, hide }
export function carAt(c, v, out = {}) {
  const t = tOf(v);
  out.hide = false; out.pitch = 0; out.roll = 0;
  let yaw = c.yaw ?? (c.dir > 0 ? Math.PI : 0);
  if (c.cross) {
    out.x = c.x + c.ux * (t + 3); out.z = c.z0; out.y = hill(c.z0); out.yaw = c.ux > 0 ? -Math.PI / 2 : Math.PI / 2;
    out.yaw += 0.04 * Math.max(0, t) * Math.sign(c.ux);       // no grip to hold its line: it slowly turns
    out.tilt = 0; out.lights = true; out.hide = Math.abs(out.x) > 260;
    return out;
  }
  if (c.flat || c.plateau) {
    // parked where it's flat: it stays, until the hillside comes (riding it, or shoved ahead of its nose)
    out.x = c.x; out.z = c.z0; out.y = hill(c.z0); out.yaw = yaw; out.tilt = 0; out.lights = false;
    if (v > V_SLIDE) {
      if (c.z0 < SLAB.toe) {
        ride(c.z0, v, rd);
        out.z = rd.z; out.y = rd.y; out.tilt = slopeAt(rd.z) * 0.9;
        out.yaw = yaw + 0.25 * smooth(V_SLIDE, V_SLIDE + 12, v) * (c.seed - 0.5) * 2;
        if (rd.phase === 2) out.pitch = rd.dt * 1.4;
        if (rd.phase === 3) { out.pitch = 0.9; out.y = rd.y - Math.max(0, rd.dt - 3) * 1.2; out.hide = rd.dt > 6; }
      } else {
        const sh = bulldoze(c.z0, v);
        if (sh > 0) {
          const z = c.z0 + sh;
          out.z = z; out.y = z < Z_EDGE ? surfaceY(z, slabD(v)) : WATER_Y - (z - Z_EDGE) * 0.1;
          out.pitch = sh * 0.25; out.roll = sh * 0.15 * (c.seed - 0.5); out.hide = z > Z_EDGE + 30;
        }
      }
    }
    return out;
  }
  // on the hill: slides (from rest, or keeps the speed it had), turning slowly as it goes
  slide({ z0: c.z0, ts: 0, vt: VT.car, u0: c.u0 || 0, float: 4 + c.seed * 4 }, t, sl);
  const dt = Math.max(0, t);
  out.x = c.x; out.z = sl.z; out.y = sl.y;
  const turn = (c.seed - 0.5) * 0.9;
  out.yaw = yaw + clamp(turn * dt * 0.05, -0.45, 0.45) + (sl.phase >= 1 ? turn * Math.min(sl.dt, 4) * 0.2 : 0);
  out.tilt = sl.phase === 0 ? slopeAt(sl.z) : 0;
  out.lights = !c.parked;
  if (sl.phase === 2) { out.pitch = sl.dt * 1.3 * (Math.cos(out.yaw) > 0 ? -1 : 1); }
  if (sl.phase === 3) {
    out.pitch = 0.75 * (Math.cos(out.yaw) > 0 ? -1 : 1) * smooth(0, 1, sl.dt);
    out.roll = 0.2 * Math.sin(sl.dt + c.seed * 9);
    out.y = sl.y + 0.6 * Math.exp(-sl.dt) - Math.max(0, sl.dt - (4 + c.seed * 4)) * 1.0;
    out.hide = sl.dt > 9 + c.seed * 4;
  }
  return out;
}

function cableCarGeometry() {
  // the classic little car: a maroon and cream body, open benches at the ends with poles, a long roof
  const parts = [];
  const add = (g, c) => {
    g = g.toNonIndexed();
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  const L = CABLE.len;
  add(new THREE.BoxGeometry(2.3, 0.75, L).translate(0, 0.75, 0), 0x7a1f1f);            // the lower body
  add(new THREE.BoxGeometry(2.36, 0.12, L + 0.1).translate(0, 1.16, 0), 0xe8d9b0);     // the belt rail
  add(new THREE.BoxGeometry(2.2, 1.0, L * 0.5).translate(0, 1.72, 0), 0xe8d9b0);       // the closed middle section
  add(new THREE.BoxGeometry(2.22, 0.6, L * 0.5 - 0.6).translate(0, 1.8, 0), 0x1a1c20); // its windows
  add(new THREE.BoxGeometry(2.5, 0.16, L + 0.5).translate(0, 2.62, 0), 0x4a2e1e);      // the roof
  add(new THREE.BoxGeometry(2.1, 0.3, L).translate(0, 2.4, 0), 0x7a1f1f);              // the clerestory band
  for (const s of [-1, 1]) for (const zz of [-3.8, -2.6, -1.4, 1.4, 2.6, 3.8]) add(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 5).translate(s * 1.08, 1.85, zz), 0xd9c27a);   // brass poles
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.06, L).translate(s * 1.3, 0.42, 0), 0x3a2a20);   // running boards
  for (const s of [-1, 1]) for (const zz of [-2.6, 2.6]) add(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 10).rotateZ(Math.PI / 2).translate(s * 0.62, 0.32, zz), 0x1a1a1a);
  for (const zz of [-L / 2 - 0.02, L / 2 + 0.02]) add(new THREE.BoxGeometry(1.0, 0.35, 0.06).translate(0, 2.3, zz), 0xf2ead2);   // the destination boards
  return mergeGeometries(parts);
}

export function makeTraffic(scene, { plainMat, glowMat, shadowy }) {
  const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
  const R = rng(909);
  CARS.forEach((c, i) => fleet.color(i, PAL[Math.floor(R() * PAL.length)], c.kind));
  const cable = new THREE.Mesh(cableCarGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }));
  cable.castShadow = true; cable.receiveShadow = true; cable.matrixAutoUpdate = false; cable.frustumCulled = false;
  scene.add(cable);
  const ca = {}, cs = {};
  return {
    fleet, cable,
    frame(v, s, glows) {
      CARS.forEach((c, i) => {
        carAt(c, v, ca);
        if (ca.hide) { fleet.set(i, HIDE, false); return; }
        fleet.set(i, vehicle(ca.x, ca.y, ca.z, ca.yaw, ca.tilt, ca.pitch, ca.roll), ca.lights && s.grid > -1);
      });
      fleet.commit();
      cableAt(v, cs);
      if (cs.phase === 3 && cs.dt > 9) cable.visible = false;
      else {
        cable.visible = true;
        let pitch = 0;
        if (cs.phase === 2) pitch = cs.dt * 1.2;
        if (cs.phase === 3) pitch = 0.6 * smooth(0, 1, cs.dt);
        const y = cs.phase === 3 ? cs.y + 0.8 * Math.exp(-cs.dt) - Math.max(0, cs.dt - 4) * 0.7 : cs.y;
        cable.matrix.copy(vehicle(CABLE.x, y, cs.z, 0, cs.phase === 0 ? slopeAt(cs.z) : 0, pitch, 0));
        cable.matrixWorldNeedsUpdate = true;
        // its headlamp, and the warm lights inside
        if (cs.phase < 2) glows.add(CABLE.x, cs.y + 1.0, cs.z - CABLE.len / 2 - 0.1, 0.7, 2.2, 1.9, 1.3);
      }
    },
  };
}
