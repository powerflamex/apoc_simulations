// Cars on Avenida Atlântica: three lanes each way, driving at city speed. When the light lands (story 8:20) each
// driver brakes after their own reaction time and stops (the spacing in a lane is checked so nobody rear-ends). Then
// they sit there: tyres smoke, paint blisters, they catch fire one after another (flames out of the cabin and from
// under the hood), burn out, glow and sag as the metal softens.
// Positions are in story time T (s since the explosion), along the beach: s (m, at the lane's radius).
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { LANES, arcXZ, RC, PHI0, PHI1, Y } from './layout.js';
import { T_FLASH } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const PAINT = [0xf2f2f2, 0x1b1b1d, 0x8e9499, 0xb5302a, 0x23447a, 0xd8d2c4, 0x3c4a3e, 0xe0b23c, 0xffffff, 0x5a6470, 0x0f2a4a, 0xc9c3b8];
export const CARS = [];
{
  const R = rng(616);
  const DEC = 6.0;
  for (const lane of LANES) {
    const r = RC + lane.d;
    const sMin = PHI0 * r - 40, sMax = Math.min(PHI1 * r, 1900);
    let s = sMin + R() * 10;
    let prevStop = -1e9;
    const list = [];
    while (s < sMax) {
      const u0 = 10 + R() * 4.5;                                 // m/s (22-32 mph)
      const react = 0.5 + R() * 1.1;
      list.push({ lane, r, s0: s, u0, react, dec: DEC + R() * 1.5, kind: R() < 0.5 ? 0 : R() < 0.5 ? 1 : R() < 0.7 ? 2 : 3, col: PAINT[Math.floor(R() * PAINT.length)], seed: R(), tIgn: 690 + R() * 200 });
      s += 11 + R() * 26;
    }
    // stop positions (in the direction of travel): make sure each car stops ≥ 6.5 m behind the one ahead
    const dir = lane.dir;
    const stopS = (c) => c.s0 + dir * (c.u0 * (T_FLASH - 498.3 + c.react) + c.u0 * c.u0 / (2 * c.dec));
    // cars ahead have larger s for dir +1: walk from the front backward
    const ordered = [...list].sort((a, b) => dir * (b.s0 - a.s0));
    let ahead = null;
    for (const c of ordered) {
      if (ahead) {
        const gap = dir * (stopS(ahead) - stopS(c));
        if (gap < 6.5) c.dec = Math.max(c.dec, c.u0 * c.u0 / (2 * Math.max(0.5, dir * (stopS(ahead) - 6.5 - c.s0) - c.u0 * (T_FLASH - 498.3 + c.react))));
      }
      ahead = c;
    }
    for (const c of list) { c.stop = stopS(c); CARS.push(c); }
  }
}
// where car c is (along-beach s) at story time T, and its speed
export function carS(c, T) {
  const tb = T_FLASH + c.react;                    // brakes from here
  const s0 = c.s0 + c.lane.dir * c.u0 * (T - 498.3);
  if (T <= tb) return { s: s0, u: c.u0 };
  const dt = T - tb, ts = c.u0 / c.dec;
  const sb = c.s0 + c.lane.dir * c.u0 * (tb - 498.3);
  if (dt >= ts) return { s: sb + c.lane.dir * c.u0 * c.u0 / (2 * c.dec), u: 0 };
  return { s: sb + c.lane.dir * (c.u0 * dt - 0.5 * c.dec * dt * dt), u: c.u0 - c.dec * dt };
}

export function makeTraffic(scene, ctx) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color(), burnt = new THREE.Color(0.06, 0.05, 0.045);
  return {
    fleet,
    frame(v, s, fire, smoke, cam) {
      const T = s.T;
      CARS.forEach((c, i) => {
        const { s: ss, u } = carS(c, T);
        const phi = ss / c.r;
        const xz = arcXZ(phi, c.lane.d);
        const dc = Math.hypot(xz.x - cam.position.x, xz.z - cam.position.z);
        // heading along the beach (local -z forward): dir +1 = phi growing
        const yaw = c.lane.dir > 0 ? -phi : Math.PI - phi;
        q.setFromAxisAngle(up, yaw);
        const kBurn = clamp((T - c.tIgn) / 240);
        const sag = 1 - 0.3 * s.melt - 0.08 * smooth(0.6, 1, kBurn);
        // a nose-dip as it brakes hard
        const dip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.035 * (u > 0.2 && u < c.u0 - 0.1 ? 1 : 0));
        q.multiply(dip);
        m4.compose(p.set(xz.x, Y.ave, xz.z), q, sc.set(1, sag, 1));
        fleet.set(i, m4, false);
        // paint: blisters and darkens, then burns out
        col.set(c.col).lerp(col.clone().multiplyScalar(0.55).add(new THREE.Color(0.08, 0.05, 0.03)), smooth(c.tIgn - 120, c.tIgn, T)).lerp(burnt, smooth(0.1, 0.6, kBurn));
        fleet.color(i, col, c.kind);
        // tyres smoke, then flames
        if (dc < 1400) {
          const smolder = smooth(c.tIgn - 90, c.tIgn, T) * (1 - smooth(0.7, 1, kBurn));
          const burning = kBurn > 0 && kBurn < 1 ? Math.sin(Math.PI * Math.pow(kBurn, 0.5)) : 0;
          if (smolder > 0.02) smoke.puff(xz.x, Y.ave + 1.2 + ((v * 1.5 + c.seed * 4) % 3), xz.z, 1.4 + burning * 1.5, 0.22 * smolder, 0.08, 0.5 * burning, c.seed);
          if (burning > 0) {
            fire.add(xz.x, Y.ave + 0.5, xz.z, 2.2, 2.2 + 1.3 * burning, burning, c.seed);
            if (dc < 300) fire.add(xz.x + 0.6, Y.ave + 0.9, xz.z - 0.4, 1.2, 1.6, burning * 0.8, c.seed + 0.3);
          }
        }
      });
      fleet.commit();
    },
  };
}
