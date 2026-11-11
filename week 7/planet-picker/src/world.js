// The whole scene, a pure function of time: the ground (ground.js), the sea (sea.js), the hotels (buildings.js),
// palms, umbrellas, the pier and its Ferris wheel, the mountains (props.js), the cars (traffic.js), the people
// (people.js) and their phones, the spray off the wall of water (smoke.js), lamps and lights (glows.js), and the light.
import * as THREE from 'three';
import { makeGround, GU } from './ground.js';
import { makeSea } from './sea.js';
import { makeBuildings, BU } from './buildings.js';
import { makeProps } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { makeFire } from './fire.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { PEOPLE, personPose } from './people.js';
import { landY, PLANET_POS } from './layout.js';
import { patchHeat } from './heat.js';
import { rng } from './util.js';

const SHOULDER = 1.42;
export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `plain-${rough}-${extra.metalness || 0}-${extra.transparent ? 1 : 0}-${extra.side || 0}`);
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  // the planet's light (it sits where the Moon was) and the sky's fill
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
  const glows = makeGlows(scene, 3000);
  const props = makeProps(scene, ctx);
  const traffic = makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.8));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const fire = makeFire(scene, 200);
  const smoke = makeSmoke(scene, 1600);
  // the dome of water heaps up under the planet, 16 km out
  const br = PLANET_POS.b * Math.PI / 180;
  sea.u.uDome.value.set(22 - 16000 * Math.cos(br), -16000 * Math.sin(br));

  const R0 = rng(321);
  const SPRAY = Array.from({ length: 150 }, () => ({ a: R0(), b: R0(), seed: R0() }));
  const still = { nightL: 1, pierFire: 0, pierFall: 0, pierOut: 0, drop: 0, vapor: 0 };   // (what props.js still asks for)
  const bend = (z) => 7 * Math.sin(z * 0.012 + 0.7) + 3 * Math.sin(z * 0.037);            // (sea.js: the wall's front)

  return {
    sun, hemi, crowd, smoke, fire, sea, ground, towers, props, glows,
    frame(v, s, cam) {
      fire.begin(); smoke.begin(); glows.begin();
      GU.uTime.value = v; GU.uSeaY.value = s.seaY; GU.uGlass.value = 0;
      BU.uTime.value = v; BU.uWin.value = 0; BU.uFire.value = 0; BU.uMelt.value = 0; BU.uLights.value = 1; BU.uNight.value = 1;
      sea.u.uSeaY.value = s.seaY; sea.u.uBulge.value = s.bulge; sea.u.uWallX.value = s.wall > 0 ? s.wallX : 1e6; sea.u.uWallH.value = s.wallH;

      props.frame(v, still, fire, smoke, glows, cam);
      traffic.frame(v);
      const cx = cam.position.x, cz = cam.position.z;
      PEOPLE.forEach((p, i) => {
        const o = personPose(p, v);
        crowd.pose(i, o);
        // a phone held up: its screen glows toward the one holding it (you see it from behind them)
        if (o.phone > 0.3 && o.visible !== false && Math.hypot(o.x - cx, o.z - cz) < 60 && Math.sin(o.yaw) * (cx - o.x) + Math.cos(o.yaw) * (cz - o.z) < 0) {
          const th = o.armL * 1.45, ly = SHOULDER - 0.02 - 0.63 * Math.cos(th) - o.sit * 0.42 / o.s, lz = 0.63 * Math.sin(th) - 0.02, lx = -0.215;
          const sy = Math.sin(o.yaw), cy = Math.cos(o.yaw);
          glows.add(o.x + o.s * (lx * cy + lz * sy), o.y + o.s * ly, o.z + o.s * (-lx * sy + lz * cy), 0.2, 1.3 * o.phone, 1.7 * o.phone, 2.3 * o.phone);
        }
      });
      crowd.commit();
      towers.frame(() => 0);

      // spray: white water bursting at the wall's foot and torn off its crest
      if (s.wall > 0.02 && s.wallX < 1300) {
        const wf = 9 + 0.3 * s.wallH;
        for (const q of SPRAY) {
          const z = cz + (q.a - 0.5) * (120 + 0.7 * Math.max(0, s.wallX + cx));
          const top = q.b < 0.45;
          const ph = (v * (1.1 + q.seed * 0.9) + q.seed * 7) % 1;
          const x = bend(z) - s.wallX - (top ? wf * (0.75 + 0.2 * q.seed) : -2 - 9 * ph);
          const gy = Math.max(s.seaY, x > 0 ? landY(x, z) : 0);
          const y = top ? s.seaY + s.wallH * (0.92 + 0.14 * ph) : gy + 1 + ph * (3 + 0.12 * s.wallH);
          const r = (top ? 2.5 + 0.09 * s.wallH : 2 + 0.06 * s.wallH) * (0.7 + 1.1 * ph);
          smoke.puff(x, y, z, r, 0.55 * s.wall * Math.sin(Math.PI * Math.min(1, ph * 1.25 + 0.05)), 1.0, 0.0, q.seed);
        }
      }
      fire.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uTime.value = v;
      fire.end(); smoke.end(); glows.end();
    },
  };
}
