// The cars, as a pure function of world time w. Our street: two lanes east (near), two west; each lane is a convoy at
// one speed (nobody overlaps). Lane 0's convoy is built around the car that would have hit the kid (DANGER). The
// avenue's cars wait at its red light facing us; a few further up drive away north.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng } from './util.js';
import { LANES_Z, ROAD, AVE_X0, FAR_BLD } from './layout.js';
import { DANGER } from './people.js';

const COLORS = [0xf4f4f2, 0x111214, 0x8a9096, 0x1f3a5f, 0x9b1c1c, 0xc7ccd1, 0x2d4a2f, 0xd9b44a, 0x5a2a6e, 0x3a3f45, 0xe8e8e8, 0x0b2a4a];

export function makeTraffic(scene, mats) {
  const r = rng(5150);
  const cars = [];
  // our street
  const LSPEED = [DANGER.speed, 11.2, 12.0, 10.6];
  LANES_Z.forEach((z, li) => {
    const dir = li < 2 ? 1 : -1, sp = LSPEED[li];
    let off = li === 0 ? 0 : r() * 40;
    for (let k = 0; k < 16; k++) {
      const gap = 32 + r() * 34;
      if (li === 0 && k === 0) { cars.push({ li, z, dir, sp, off: 0, danger: true }); off = gap + 8; continue; }
      cars.push({ li, z, dir, sp, off: li === 0 ? (k % 2 ? off : -off - 250) : off });
      if (li !== 0 || k % 2 === 0) off += gap;
    }
  });
  // the avenue: a queue at the red light (southbound, facing us), and a few driving away north
  for (let k = 0; k < 9; k++) cars.push({ ave: true, x: AVE_X0 + 2.2 + (k % 2) * 3.6, z: FAR_BLD - 6.5 - Math.floor(k / 2) * 6.8 - (k % 2) * 1.5, yaw: Math.PI });
  for (let k = 0; k < 6; k++) cars.push({ away: true, x: AVE_X0 + 10 + (k % 2) * 3.4, z0: FAR_BLD - 40 - k * 37, sp: 11 + r() * 2 });
  const plainMat = (c, rough, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, ...o });
  const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const fleet = makeFleet(scene, cars.length, { plainMat, glowMat, shadowy: mats.shadowy });
  cars.forEach((c, i) => fleet.color(i, c.danger ? 0xb3261e : COLORS[Math.floor(r() * COLORS.length)], c.danger ? 0 : Math.floor(r() * 4)));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // the danger car's x at world time w
  const dangerX = (w) => DANGER.xAt + DANGER.speed * (w - DANGER.wAt);
  return {
    dangerX,
    frame(w) {
      cars.forEach((c, i) => {
        let x, z, yaw;
        if (c.ave) { x = c.x; z = c.z; yaw = c.yaw; }
        else if (c.away) { x = c.x; z = c.z0 - c.sp * w; yaw = 0; if (z < -1400) { fleet.set(i, zero); return; } }
        else {
          if (c.li === 0) x = dangerX(w) + c.off;
          else { const L = 1100; x = ((c.sp * w * c.dir + c.off) % L + L) % L - L / 2; }
          z = c.z; yaw = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          if (Math.abs(x) > 340) { fleet.set(i, zero); return; }
        }
        e.set(0, yaw, 0); q.setFromEuler(e); v.set(x, ROAD, z);
        m.compose(v, q, one);
        fleet.set(i, m, true);
      });
      fleet.commit();
    },
  };
}
