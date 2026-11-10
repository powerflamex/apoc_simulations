// The whole scene, a pure function of video time: the ground plates (split.js) with the street drawn on them, the
// buildings (city.js), street furniture and signs (street.js), the cars (traffic.js), the people (people.js), glows,
// dust (smoke.js), snow (snow.js), and the debris of the split (debris.js).
import * as THREE from 'three';
import { makePlates, spread } from './split.js';
import { makeCity, CU } from './city.js';
import { GU } from './ground.js';
import { makeStreet } from './street.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose, personColors } from './people.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeSnow } from './snow.js';
import { makeDebris } from './debris.js';
import { SEEDS, nearestSeed } from './split.js';
import { SEC } from './timeline.js';
import { smooth } from './util.js';

const V = new THREE.Vector3(), C = new THREE.Color();
export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  const sun = new THREE.DirectionalLight(0xfff0dd, 0);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 1200 });
  scene.add(sun, sun.target);
  const top = new THREE.DirectionalLight(0xffc890, 0.5);   // the street lights, as one soft light from above
  top.position.set(0.3, 1, 0.2);
  scene.add(top);
  const hemi = new THREE.HemisphereLight(0x2a3a66, 0x2a1c12, 0.6);
  scene.add(hemi);

  GU.uSeeds.value = SEEDS.map(([x, z]) => new THREE.Vector2(x, z));
  GU.uNSeeds.value = SEEDS.length;
  const plates = makePlates(scene);
  const city = makeCity(scene);
  const street = makeStreet(scene, ctx);
  const traffic = makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.85), { castShadow: true });
  const glows = makeGlows(scene, 6000);
  const smoke = makeSmoke(scene, 3000);
  const snow = makeSnow(scene);
  const debris = makeDebris(scene, ctx);
  let coatsShown = -1;

  return {
    sun, top, hemi, crowd, glows, smoke, snow, plates, street, debris,
    frame(v, s, cam) {
      glows.begin(); smoke.begin();
      // lighting by stage: night (lamps), day (the Sun, dimming), the split (hot rock below)
      const dl = s.dayLight;
      sun.intensity = 3.0 * dl * s.dayK;
      sun.castShadow = s.dayK > 0.5;
      sun.position.copy(cam.position).addScaledVector(s.sunDir, 600);
      sun.target.position.copy(cam.position).add(V.set(0, 0, -40));
      top.intensity = 0.9 * s.grid * s.dark;
      hemi.intensity = (0.55 + 0.25 * s.snowGround) * (1 - s.dayK) * (0.5 + 0.5 * s.grid) + 1.3 * dl * s.dayK + 0.5 * s.heat;
      hemi.color.setRGB(0.17, 0.23, 0.4).lerp(C.setRGB(0.55, 0.65, 0.85), s.dayK);
      hemi.groundColor.setRGB(0.17, 0.11, 0.07).lerp(C.setRGB(1.0, 0.32, 0.08), s.heat);
      CU.uGrid.value = s.grid; CU.uNight.value = s.dark; CU.uSnow.value = s.snowGround; CU.uHeat.value = s.heat;
      CU.uSky.value.setRGB(0.3, 0.45, 0.7).multiplyScalar(s.dayK * dl + 0.05);
      CU.uSunDir.value.copy(s.sunDir);
      GU.uLamp.value = s.grid * s.dark;
      GU.uCrack.value = s.crack; GU.uCrackR.value = 60 + 1800 * Math.pow(s.crack, 1.5); GU.uTime.value = v;

      const ts = Math.max(0, v - SEC.splitHush);
      const M = v > SEC.splitHush ? plates.frame(ts, s.heat) : (plates.frame(0, s.heat), null);
      city.frame(M ? (b) => M[b.plate ?? (b.plate = nearestSeed(b.x, b.z))] : null);
      street.frame(v, s, glows, M);
      traffic.frame(v, s, glows, M);
      const coats = s.coats > 0.5 ? 1 : 0;
      if (coats !== coatsShown) { PEOPLE.forEach((p, i) => crowd.color(i, ...personColors(p, s.coats))); coatsShown = coats; }
      PEOPLE.forEach((p, i) => {
        const o = personPose(p, v, s, M);
        crowd.pose(i, o);
        // phones: a cold glow at the hand
        if (o.visible && p._phone > 0.3 && s.grid > 0.2 && s.dark > 0.5 && Math.abs(o.z - cam.position.z) < 120) {
          const yaw = o.yaw;
          glows.add(o.x + Math.sin(yaw) * 0.38 + Math.cos(yaw) * 0.18, o.y + 1.25 * o.s, o.z + Math.cos(yaw) * 0.38 - Math.sin(yaw) * 0.18, 0.28, 0.7 * p._phone, 0.85 * p._phone, 1.1 * p._phone);
        }
      });
      crowd.commit();
      snow.frame(v, s.snow, cam, 0.25 + 0.75 * s.dayLight * s.dayK + 0.3 * (1 - s.dayK));
      debris.frame(v, s, smoke, glows, cam, M);
      glows.end(); smoke.end();
    },
  };
}
