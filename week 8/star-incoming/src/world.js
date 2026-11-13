// The whole scene, a pure function of time: the ground (ground.js), the sea (sea.js), the hotels (buildings.js),
// palms, umbrellas, the pier and its Ferris wheel, the mountains (props.js), the cars (traffic.js), the people
// (people.js) and their phones, lamps and lights (glows.js), and the light: TWO suns, each with its own shadows.
import * as THREE from 'three';
import { makeGround, GU } from './ground.js';
import { makeSea } from './sea.js';
import { makeBore } from './bore.js';
import { makeBuildings, BU } from './buildings.js';
import { makeProps } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { makeFire } from './fire.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { PEOPLE, personPose } from './people.js';
import { patchHeat } from './heat.js';

const SHOULDER = 1.42;
export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `plain-${rough}-${extra.metalness || 0}-${extra.transparent ? 1 : 0}-${extra.side || 0}`);
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  // the Sun and the star: two lights, two sets of shadows
  const mkLight = (col, size) => {
    const l = new THREE.DirectionalLight(col, 2);
    l.castShadow = true;
    l.shadow.mapSize.set(size, size);
    l.shadow.bias = -0.0003; l.shadow.normalBias = 0.05;
    Object.assign(l.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 4000 });
    scene.add(l, l.target);
    return l;
  };
  const sun = mkLight(0xffd9a0, 4096);
  const star = mkLight(0xff9050, 4096);
  const hemi = new THREE.HemisphereLight(0x9cbbe6, 0xb8a080, 1.2);
  scene.add(hemi);

  const ground = makeGround(scene);
  const sea = makeSea(scene);
  const bore = makeBore(scene);
  const towers = makeBuildings(scene);
  const glows = makeGlows(scene, 3000);
  const props = makeProps(scene, ctx);
  const traffic = makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.8));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const fire = makeFire(scene, 50);
  const smoke = makeSmoke(scene, 400);
  const still = { nightL: 0, pierFire: 0, pierFall: 0, pierOut: 0, drop: 0, vapor: 0 };   // (what props.js asks for)

  return {
    sun, star, hemi, crowd, smoke, fire, sea, bore, ground, towers, props, glows,
    frame(v, s, cam) {
      fire.begin(); smoke.begin(); glows.begin();
      GU.uTime.value = v; GU.uSeaY.value = s.seaY; GU.uGlass.value = 0;
      BU.uTime.value = v; BU.uWin.value = 0; BU.uFire.value = 0; BU.uMelt.value = 0; BU.uLights.value = 0.4 + 0.6 * s.nightL; BU.uNight.value = s.nightL;
      sea.u.uSeaY.value = s.seaY; sea.u.uBulge.value = 0; sea.u.uWallX.value = s.bore > 0 ? -s.frontX : 1e6; sea.u.uWallH.value = 1.0 * s.bore;
      sea.u.uFlood.value = s.flood;
      bore.u.uFront.value = s.frontX; bore.u.uL.value = s.seaY + 1.0 * s.bore; bore.u.uTime.value = v; bore.u.uOn.value = s.bore; bore.frame(s.bore);
      still.nightL = s.nightL;
      props.frame(v, still, fire, smoke, glows, cam);
      traffic.frame(v);
      const cx = cam.position.x, cz = cam.position.z;
      PEOPLE.forEach((p, i) => {
        const o = personPose(p, v);
        crowd.pose(i, o);
        // a phone held up: its screen glows toward the one holding it (you see it from behind them)
        if (s.nightL > 0.05 && o.phone > 0.3 && o.visible !== false && Math.hypot(o.x - cx, o.z - cz) < 60 && Math.sin(o.yaw) * (cx - o.x) + Math.cos(o.yaw) * (cz - o.z) < 0) {
          const th = o.armL * 1.45, ly = SHOULDER - 0.02 - 0.63 * Math.cos(th) - o.sit * 0.42 / o.s, lz = 0.63 * Math.sin(th) - 0.02, lx = -0.215;
          const sy = Math.sin(o.yaw), cy = Math.cos(o.yaw);
          const k = o.phone * s.nightL;
          glows.add(o.x + o.s * (lx * cy + lz * sy), o.y + o.s * ly, o.z + o.s * (-lx * sy + lz * cy), 0.2, 1.3 * k, 1.7 * k, 2.3 * k);
        }
      });
      crowd.commit();
      towers.frame(() => 0);
      fire.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uTime.value = v;
      fire.end(); smoke.end(); glows.end();
    },
  };
}
