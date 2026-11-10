// Everything on Earth, as a pure function of video time: the hills and the mountains (terrain.js), the city on the
// plain (basin.js), the terrace and the observatory (terrace.js), the people (people.js), lamps and lights
// (glows.js), the frozen air falling as snow, and at the end the sparks of everything evaporating.
import * as THREE from 'three';
import { makeTerrain } from './terrain.js';
import { makeBasin } from './basin.js';
import { makeTerrace } from './terrace.js';
import { makeCrowd } from './crowd.js';
import { NPEOPLE, peopleFrame } from './people.js';
import { makeGlows } from './glows.js';
import { FXU, MELTU, patch } from './fx.js';
import { BASIN, TERRACE } from './layout.js';
import { rng, clamp } from './util.js';

export function makeWorld(scene) {
  const sun = new THREE.DirectionalLight(0xffb070, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 1500 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8fa6d6, 0x6a5040, 1.2);
  scene.add(hemi);

  makeTerrain(scene);
  const basin = makeBasin(scene);
  const terrace = makeTerrace(scene);
  const YOU_DIS = { value: 0 };
  const crowdMat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), 'people-v1', { scale: 3.0, snowSide: 0.3, uniforms: { uDissolve: YOU_DIS } });
  const crowd = makeCrowd(scene, NPEOPLE, crowdMat);
  const colorCache = new Float64Array(NPEOPLE).fill(-2);
  const glows = makeGlows(scene, 6000);

  // the frozen air falling: flakes in a box around the camera, glinting in the starlight
  const FL = 1800, flakes = [];
  { const R = rng(5150); for (let i = 0; i < FL; i++) flakes.push([R(), R(), R(), 0.6 + 0.8 * R(), R()]); }
  // the evaporation: sparks rising off the terrace, the slope and the city
  const SP = 2600, sparks = [];
  { const R = rng(6161); for (let i = 0; i < SP; i++) { const far = R() < 0.55; const d = far ? 150 + Math.pow(R(), 1.5) * 6000 : R() * 40; const a = (R() - 0.5) * (far ? 1.5 : 6.28); sparks.push({ x: Math.sin(a) * d + (far ? 0 : 0), z: far ? -Math.cos(a) * d : (R() - 0.3) * 24, y: far ? BASIN + 5 + R() * 60 : R() * 3, far, t0: R(), sp: 0.3 + R() }); } }

  return {
    sun, hemi, glows, basin,
    frame(v, s, cam, look) {
      const cp = cam.position;
      const d = look.sunDir;
      sun.position.set(cp.x + d.x * 600, Math.max(cp.y, 0) + d.y * 600, cp.z - 20 + d.z * 600);
      sun.target.position.set(cp.x, 0, cp.z - 20);

      FXU.uSnow.value = s.snow;
      FXU.uDissolve.value = s.dissolve;
      YOU_DIS.value = s.youDis;
      MELTU.uDissolve.value = s.meltAway;
      FXU.uRock.value = s.rock; FXU.uLava.value = s.lava;
      FXU.uTime.value = v;
      FXU.uLit.value = look.lights;
      FXU.uFxDir.value.copy(look.fxDir);
      FXU.uFxCol.value.copy(look.fxCol);

      glows.begin();
      basin.frame(s, cam, look, glows);
      terrace.frame(s, glows, look.lights * (1 - s.snow));
      peopleFrame(s, crowd, colorCache);

      // snow
      if (s.snowfall > 0.01) {
        const B = 26;
        for (const [a, b, c, sz, ph] of flakes) {
          const fall = (v * (0.9 + 0.6 * ph) + b * B) % B;
          const x = cp.x + (a - 0.5) * B + Math.sin(v * 0.7 + ph * 6) * 0.4, z = cp.z - 2 + (c - 0.7) * B;
          const y = cp.y + B * 0.45 - fall;
          const k = s.snowfall * look.flakeLight * sz;
          glows.add(x, y, z, 0.07 * sz, k, k * 1.02, k * 1.1);
        }
      }
      // sparks: everything evaporating into crumbs of light that drift up and wink out
      const ev = s.dissolve * (1 - s.earthGone);
      if (ev > 0.005) {
        for (const p of sparks) {
          const life = ((v * 0.35 * p.sp + p.t0) % 1);
          const k = Math.sin(Math.PI * life) * ev * (p.far ? 2.4 : 1.4);
          const up = life * (p.far ? 80 : 5);
          glows.add(p.x, p.y + up, p.z, p.far ? 7 : 0.12, k * 0.55, k * 0.75, k * 1.0);
        }
      }
      glows.end();
    },
  };
}
