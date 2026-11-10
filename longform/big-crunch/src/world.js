// Everything on Earth, as a pure function of video time: the land and the sea (land.js, sea.js), the city along the
// shore (city.js), the promenade (props.js), the people (people.js) and cars (traffic.js), their light streaks
// (trails.js), lamps and lights (glows.js), and steam off the boiling bay (smoke.js).
import * as THREE from 'three';
import { makeLand, LU } from './land.js';
import { makeSea } from './sea.js';
import { makeCity, CU } from './city.js';
import { makeProps } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { NPEOPLE, peopleFrame } from './people.js';
import { makeTrails } from './trails.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { SEA0 } from './layout.js';
import { rng } from './util.js';

const OFF = (new URLSearchParams(location.search).get('off') || '').split(',');   // debugging: ?off=city,traffic
const stub = { frame() {} };

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  const sun = new THREE.DirectionalLight(0xffb070, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 1200 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8fa6d6, 0x6a5040, 1.2);
  scene.add(hemi);

  const land = makeLand(scene);
  const sea = makeSea(scene);
  const city = OFF.includes('city') ? { frame() {} } : makeCity(scene);
  const props = OFF.includes('props') ? stub : makeProps(scene, ctx);
  const traffic = OFF.includes('traffic') ? stub : makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, NPEOPLE, plainMat(0xffffff, 0.85));
  const colorCache = new Float64Array(NPEOPLE).fill(-2);
  const trails = makeTrails(scene, 4000);
  const glows = makeGlows(scene, 3000);
  const smoke = makeSmoke(scene, 900);

  return {
    sun, hemi, land, sea, glows,
    frame(v, s, cam, look) {
      const cp = cam.position;
      // sun & shadows cover the stretch around you
      const d = look.sunDir;
      sun.position.set(cp.x + d.x * 500, d.y * 500, cp.z - 30 + d.z * 500);
      sun.target.position.set(cp.x, 0, cp.z - 30);

      LU.uLand.value = 0; LU.uGreen.value = s.green; LU.uSalt.value = s.salt; LU.uLava.value = s.lava;
      LU.uMorph.value = 0;
      LU.uLampGlow.value = look.lights; LU.uTime.value = v; LU.uWet.value = 0; LU.uSeaY.value = SEA0 + s.sea;
      CU.uSkyHi.value.copy(look.skyHi); CU.uSkyLo.value.copy(look.skyLo); CU.uSunDir.value.copy(d);
      CU.uLit.value = look.windows; CU.uDay.value = Math.floor(s.T / 1440) % 9973; CU.uGlow.value = 1; CU.uMelt.value = s.cityMelt;

      // the sea
      const su = sea.u;
      sea.mesh.position.y = SEA0 + s.sea;
      sea.mesh.visible = s.sea > -2900;
      su.uWave.value = 1 / (1 + (s.E * 60) / 1.2);
      su.uPhase.value = (s.T * 60) % 6283.18;
      su.uSunA.value.copy(d); su.uSunB.value.copy(d); su.uSunCol.value.copy(look.sunCol);
      su.uSunI.value = look.sunI * look.sunC; su.uSpread.value = 0; su.uSunR.value = look.sunR;
      su.uSkyHi.value.copy(look.skyHi); su.uSkyLo.value.copy(look.skyLo);
      su.uBoil.value = s.steam; su.uTime.value = v; su.uLights.value = look.lights;

      glows.begin(); trails.begin(); smoke.begin();
      city.frame(s, glows, look.lights);
      props.frame(s, glows, look.lights);
      traffic.frame(s, trails, look.lights);
      peopleFrame(s, crowd, colorCache);

      // steam rising off the boiling bay
      if (s.steam > 0.02) {
        const R = rng(9191);
        for (let k = 0; k < 220; k++) {
          const dist = 60 + Math.pow(R(), 1.3) * 4000, az = (-35 + R() * 50) * Math.PI / 180;
          const x = cp.x + Math.sin(az) * dist, z = cp.z - Math.cos(az) * dist;
          const ph = (v * (0.3 + 0.3 * R()) + R()) % 1;
          const r = (10 + dist * 0.04) * (0.6 + ph);
          smoke.puff(x, SEA0 + s.sea + r * 0.3 + ph * (20 + dist * 0.05), z, r, 0.35 * s.steam * Math.sin(Math.PI * ph), 0.95, 0, R());
        }
      }
      glows.end(); trails.end(); smoke.end();
    },
  };
}
