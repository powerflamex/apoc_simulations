// The whole scene, a pure function of video time: the hill and its street (ground.js), the houses (houses.js),
// lamps and trees (props.js), the cars and the cable car (traffic.js), the people (people.js), dust (smoke.js),
// lights (glows.js) and the bay with what's across it (water.js).
import * as THREE from 'three';
import { makeGround, GU } from './ground.js';
import { makeHouses } from './houses.js';
import { makeProps } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose } from './people.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeWater } from './water.js';
import { SUN, CABLE, cableAt } from './layout.js';
import { F } from './facade.js';
import { slabD, frontZ, slabU, surfaceY, hill, Z_EDGE, WATER_Y, V_SLIDE, V_TOE_BAY, SLAB, tOf, slide, VT } from './timeline.js';
import { CARS } from './layout.js';
import { carAt } from './traffic.js';
import { rng, smooth, clamp, DEG } from './util.js';

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  // ---------- light: the low Sun behind-left (west-south-west), warm; a blue sky dome ----------
  const az = SUN.az * DEG, el = SUN.el * DEG;
  // compass bearing az: north = +z, east = -x (west = +x)
  const sunDir = new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  F.uSunDir.value.copy(sunDir);
  const sun = new THREE.DirectionalLight(0xffb878, 3.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.08;
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 3000 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9ab0dc, 0x7a6450, 1.35);
  scene.add(hemi);

  const ground = makeGround(scene);
  const houses = makeHouses(scene);
  const props = makeProps(scene, ctx);
  const traffic = makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.85));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const glows = makeGlows(scene, 3000);
  const smoke = makeSmoke(scene, 3000);
  const water = makeWater(scene);
  water.u.uSun.value.copy(sunDir);

  // things going into the bay throw up a splash (a burst of white spray puffs)
  const SPL = [];
  {
    const R = rng(4321);
    const zEdgeOf = (o, ts, vt, u0) => {
      // the first time it's past the seawall (search, coarse then fine)
      const s = {};
      for (let v = 0; v < 60; v += 0.25) { slide({ ...o, ts, vt, u0 }, tOf(v), s); if (s.phase >= 2) { let lo = v - 0.25, hi = v; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; slide({ ...o, ts, vt, u0 }, tOf(m), s); if (s.phase >= 2) hi = m; else lo = m; } return hi + 0.6; } }
      return null;
    };
    for (const c of CARS) {
      if (c.flat || c.plateau || c.cross) continue;
      const v = zEdgeOf({ z0: c.z0 }, 0, VT.car, c.u0 || 0);
      if (v !== null) SPL.push({ v, x: c.x, big: 1, seed: R() });
    }
    const vc = zEdgeOf({ z0: CABLE.z0 }, 0, CABLE.vt, CABLE.u0);
    if (vc !== null) SPL.push({ v: vc, x: CABLE.x, big: 2.4, seed: R() });
  }
  const ca = {};

  return {
    sunDir, sun, hemi, crowd, smoke, glows, water, ground,
    frame(v, s, cam) {
      const D = slabD(v);
      // sun & shadows cover the stretch ahead of the camera, down the hill
      const tz = cam.position.z + 95;
      sun.position.set(cam.position.x + sunDir.x * 1500, hill(tz) + sunDir.y * 1500, tz + sunDir.z * 1500);
      sun.target.position.set(cam.position.x, hill(tz), tz);
      glows.begin(); smoke.begin();
      F.uGrid.value = s.grid; F.uDust.value = s.dust;
      GU.uD.value = D; GU.uCrack.value = s.crack; GU.uDust.value = s.dust; GU.uTime.value = v;
      water.u.uTime.value = v;
      water.u.uPour.value = clamp((D - 196) / 360);       // how much earth has gone in (it spreads out as a fan)
      water.u.uWave.value = v > V_TOE_BAY ? (v - V_TOE_BAY) * 14 : -1;

      houses.frame(v, s, smoke, cam);
      props.frame(v, s, glows);
      traffic.frame(v, s, glows);
      PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v)));
      crowd.commit();

      // splashes where things hit the bay
      for (const sp of SPL) {
        const dt = v - sp.v;
        if (dt < 0 || dt > 3.5) continue;
        const R = rng(Math.round(sp.seed * 1e6));
        for (let k = 0; k < 9; k++) {
          const ph = clamp(dt / (1.2 + R() * 1.4));
          const r = (1.2 + R() * 2) * sp.big * (0.6 + ph);
          const h = Math.sin(Math.PI * Math.min(1, dt / 1.6)) * (3 + R() * 4) * sp.big;
          smoke.puff(sp.x + (R() - 0.5) * 4 * sp.big, WATER_Y + h * (0.4 + 0.6 * R()), Z_EDGE + 4 + R() * 8 * sp.big, r, 0.35 * (1 - ph), 0.98, 0, R());
        }
      }
      // the hillside: dust off its nose and off the whole moving surface, the earth pouring off the seawall
      if (v > V_SLIDE - 0.5) {
        const R = rng(777);
        const f = Math.min(frontZ(v), Z_EDGE + 2);
        const kk = smooth(V_SLIDE, V_SLIDE + 6, v);
        for (let k = 0; k < 70; k++) {
          const x = (R() - 0.5) * 2 * (20 + 220 * R() * R());
          const ph = (v * (0.22 + R() * 0.35) + R()) % 1;
          const z = f - 3 - R() * 30 * R() + ph * 5;
          const r = 2 + R() * R() * 9 + ph * (3 + R() * 6);
          const dcn = Math.hypot(x - cam.position.x, z - cam.position.z);
          smoke.puff(x, surfaceY(z, D) + 0.5 + ph * (2 + R() * 6), z, r, 0.15 * kk * Math.sin(Math.PI * ph) * smooth(r, r + 25, dcn), 0.55 + 0.15 * R(), 0, R());
        }
        // the cracks and the grinding blocks throw up dust all over the slab, thickening as it speeds up
        const dens = smooth(V_SLIDE - 0.5, V_SLIDE + 10, v);
        for (let k = 0; k < 110; k++) {
          const z0 = SLAB.toe - R() * 420;
          const z = z0 + D;
          if (z > Z_EDGE) continue;
          const x = (R() - 0.5) * 70;
          const ph = (v * (0.25 + R() * 0.3) + R()) % 1;
          const r = 2 + R() * 4 + ph * 4;
          const dc = Math.hypot(x - cam.position.x, z - cam.position.z);
          smoke.puff(x, surfaceY(z, D) + 0.5 + ph * 4, z - ph * 3, r, 0.13 * dens * Math.sin(Math.PI * ph) * smooth(8, 30, dc), 0.66, 0, R());
        }
        // earth and spray where it pours into the bay
        if (v > V_TOE_BAY - 0.3) {
          for (let k = 0; k < 40; k++) {
            const x = (R() - 0.5) * 2 * (30 + 200 * R());
            const ph = (v * (0.35 + R() * 0.35) + R()) % 1;
            const r = 3 + R() * 5 + ph * (4 + R() * 6);
            const zz = Z_EDGE + 4 + R() * 30 * R() + ph * 12;
            const yy = WATER_Y + 1 + ph * (6 + R() * 10);
            const dcp = Math.hypot(x - cam.position.x, zz - cam.position.z, yy - cam.position.y);
            smoke.puff(x, yy, zz, r, 0.17 * Math.sin(Math.PI * ph) * smooth(r + 4, r + 40, dcp), R() < 0.6 ? 0.95 : 0.55, 0, R());
          }
        }
      }
      glows.end(); smoke.end();
    },
  };
}
