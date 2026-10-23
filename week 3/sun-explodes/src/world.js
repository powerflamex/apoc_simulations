// The whole scene, a pure function of time: the ground (ground.js), the sea (sea.js), the towers (buildings.js),
// palms, umbrellas, kiosks and the hills (props.js), the cars (traffic.js), the people (people.js), flames (fire.js),
// smoke and steam (smoke.js), and the light.
import * as THREE from 'three';
import { makeGround, GU } from './ground.js';
import { makeSea } from './sea.js';
import { makeBuildings, BU } from './buildings.js';
import { makeProps } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { makeFire } from './fire.js';
import { makeSmoke } from './smoke.js';
import { PEOPLE, personPose } from './people.js';
import { TOWERS, arcXZ, RC, PHI0, PHI1, hills, Y, toArc } from './layout.js';
import { patchHeat } from './heat.js';
import { rng, smooth, clamp, lerp } from './util.js';

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `plain-${rough}-${extra.metalness || 0}-${extra.transparent ? 1 : 0}`);
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  const sun = new THREE.DirectionalLight(0xfff0dd, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 4000 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9cbbe6, 0xb8a080, 1.2);
  scene.add(hemi);

  const ground = makeGround(scene);
  const sea = makeSea(scene);
  const towers = makeBuildings(scene);
  const props = makeProps(scene, ctx);
  const traffic = makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.8));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const fire = makeFire(scene, 4000);
  const smoke = makeSmoke(scene, 3200);

  // each tower: when it sags and falls (story s), the front row nearest the Sun-side first
  const TW = TOWERS.map((t, i) => {
    const R = rng(1000 + i);
    const sag0 = 1900 + R() * 1300 + t.row * 200;
    return { sag0, fall0: sag0 + 300 + R() * 1600, fallDur: 25 + R() * 30, seed: R(), c: arcXZ((t.phi0 + t.phi1) / 2, t.d0 + t.dep / 2), h: t.h, row: t.row };
  });
  const goneAt = (i, T) => {
    const w = TW[i];
    const sag = smooth(w.sag0, w.sag0 + 500, T) * 0.3;
    const fall = smooth(w.fall0, w.fall0 + w.fallDur * 6, T) * 0.7;
    return sag + fall;
  };

  const R0 = rng(321);
  // smoke and steam sources fixed up front
  const HILL = Array.from({ length: 70 }, () => { const phi = PHI0 + R0() * (PHI1 - PHI0); const d = 420 + R0() * 900; const c = arcXZ(phi, d); return { x: c.x, z: c.z, y: Y.walk + hills(d, phi), t0: 640 + R0() * 500, seed: R0() }; });
  const STEAM = Array.from({ length: 160 }, () => ({ a: R0(), b: R0(), seed: R0() }));

  return {
    sun, hemi, crowd, smoke, fire, sea, ground, towers, props,
    frame(v, s, cam) {
      const T = s.T;
      fire.begin(); smoke.begin();
      const t = v;
      GU.uTime.value = t; GU.uSeaY.value = -s.drop;
      GU.uGlass.value = s.glass;
      BU.uTime.value = t; BU.uWin.value = s.win; BU.uFire.value = s.win * 0.8; BU.uLights.value = 1 - s.lit * 0.7;
      sea.mesh.position.y = -s.drop;
      sea.u.uTime.value = t * (v < 9 ? 1 : 1) + 0;
      sea.u.uSeaY.value = -s.drop;
      sea.u.uSteam.value = s.steam;
      sea.u.uBoil.value = s.boil;

      props.frame(v, s, fire, smoke, cam);
      traffic.frame(v, s, fire, smoke, cam);
      PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, T)));
      crowd.commit();
      towers.frame((i) => goneAt(i, T));

      // the towers burn: smoke pours out of the broken windows, and off the tops; collapse throws up dust
      if (s.win > 0.05) {
        TW.forEach((w, i) => {
          const dc = Math.hypot(w.c.x - cam.position.x, w.c.z - cam.position.z);
          if (dc > 2600 || (w.row === 2 && i % 3)) return;
          const g = goneAt(i, T);
          const top = w.h * (1 - 0.86 * Math.max(0, (g - 0.3) / 0.7));
          const R = rng(5000 + i);
          const n = dc < 400 ? 3 : 1;
          for (let k = 0; k < n; k++) {
            const ph = (v * (0.12 + R() * 0.1) + R()) % 1;
            const rr = 6 + ph * 22 + R() * 6;
            smoke.puff(w.c.x + (R() - 0.5) * 14 + ph * 18, Y.walk + top + 4 + ph * 60, w.c.z + (R() - 0.5) * 14, rr, 0.22 * s.win * Math.sin(Math.PI * ph) * (1 - s.hazeSteam * 0.4), 0.1 + 0.15 * s.glow, 0.25 + 0.6 * s.glow, R());
          }
          // the fall: a burst of dust and glowing debris
          const fk = clamp((T - w.fall0) / (w.fallDur * 6));
          if (fk > 0 && fk < 1 && dc < 3000) {
            for (let k = 0; k < 5; k++) {
              const ph = clamp(fk * 1.3 - k * 0.05);
              smoke.puff(w.c.x + (R() - 0.5) * 30, Y.walk + 6 + ph * 30 + R() * 20, w.c.z + (R() - 0.5) * 30, 10 + ph * 25, 0.35 * Math.sin(Math.PI * fk), 0.35, 0.7, R());
            }
          }
        });
      }
      // the forest on the hills burns
      for (const h of HILL) {
        const k = clamp((T - h.t0) / 900);
        if (k <= 0) continue;
        const burn = Math.sin(Math.PI * Math.min(1, k * 1.2)) * (1 - s.melt);
        const R = rng(Math.round(h.seed * 1e6));
        for (let j = 0; j < 2; j++) {
          const ph = (v * (0.08 + R() * 0.06) + R()) % 1;
          smoke.puff(h.x + (R() - 0.5) * 60 + ph * 40, h.y + 20 + ph * 150, h.z + (R() - 0.5) * 60, 25 + ph * 60, 0.3 * burn * Math.sin(Math.PI * ph), 0.12, 0.5 * burn, R());
        }
        fire.add(h.x, h.y - 2, h.z, 40, 22 + 10 * burn, burn * 0.9, h.seed);
      }
      // steam off the sea: low and thin at first, then boiling up everywhere; off the wet sea floor as it is bared
      const st = Math.max(s.steam * 0.6, s.boil);
      if (st > 0.01) {
        for (const p of STEAM) {
          // spread over the bay in front of you (out to ~2.5 km), denser near the camera's view
          const dist = 180 + Math.pow(p.a, 1.2) * 2600 + s.shore * 0.6;
          const ang = -0.2 + p.b * 1.6;
          const x = cam.position.x + Math.sin(ang) * dist, z = cam.position.z - Math.cos(ang) * dist;
          toArc(x, z, ta);
          if (ta.d > -s.shore + 5) continue;
          const ph = (v * (0.1 + p.seed * 0.12) + p.seed) % 1;
          const rr = (5 + dist * 0.015) * (1 + ph * 1.2);
          smoke.puff(x + ph * 20, -s.drop + rr * 0.4 + ph * (20 + dist * 0.03), z, rr, 0.07 * st * Math.sin(Math.PI * ph), 0.97, 0.0, p.seed);
        }
      }
      fire.mat.uniforms.uTime.value = t;
      smoke.mat.uniforms.uTime.value = t;
      fire.end(); smoke.end();
    },
  };
}
const ta = {};
