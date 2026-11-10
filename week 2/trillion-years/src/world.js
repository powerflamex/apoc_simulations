// Everything on Earth, as a pure function of video time: the land and the sea (land.js, sea.js), the city that keeps
// being rebuilt (city.js), the promenade (props.js), the people (people.js) and cars (traffic.js), their light
// streaks (trails.js), lamps and lights (glows.js), steam (smoke.js), and the asteroid's debris falling back
// through the sky.
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
import { V_IMPACT } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

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

  // debris thrown out by the impact falls back all over the world: glowing streaks across the sky
  const meteors = [];
  {
    const R = rng(808);
    for (let k = 0; k < 260; k++) {
      const az = (14 + (R() - 0.5) * 120) * Math.PI / 180;     // around the impact side (ahead and left), spreading overhead
      const el = (12 + R() * 65) * Math.PI / 180;
      meteors.push({ t0: 0.45 + Math.pow(R(), 0.8) * 1.9, dur: 0.25 + R() * 0.45, az, el, len: 0.08 + R() * 0.12, w: 25 + R() * 40, b: 0.6 + R() });
    }
  }

  return {
    sun, hemi, land, sea, glows,
    frame(v, s, cam, look) {
      const cp = cam.position;
      // sun & shadows cover the stretch around you
      const d = look.sunDir;
      sun.position.set(cp.x + d.x * 500, d.y * 500, cp.z - 30 + d.z * 500);
      sun.target.position.set(cp.x, 0, cp.z - 30);

      LU.uLand.value = s.land; LU.uGreen.value = s.green; LU.uSalt.value = smooth(0.4, 1, s.boil); LU.uLava.value = s.lava;
      LU.uMorph.value = Math.max(0, Math.log10(Math.max(s.Y, 1)) - 6.3) * 1.3;
      LU.uLampGlow.value = look.lights; LU.uTime.value = v; LU.uWet.value = smooth(0.02, 0.15, s.ice); LU.uSeaY.value = SEA0 + s.sea;
      CU.uSkyHi.value.copy(look.skyHi); CU.uSkyLo.value.copy(look.skyLo); CU.uSunDir.value.copy(d);
      CU.uLit.value = look.windows; CU.uDay.value = Math.floor(s.T / 1440) % 9973; CU.uGlow.value = 1;

      // the sea
      const su = sea.u;
      sea.mesh.position.y = SEA0 + s.sea;
      sea.mesh.visible = s.sea > -2900;
      su.uWave.value = 1 / (1 + (s.E * 60) / 1.2);
      su.uPhase.value = (s.T * 60) % 6283.18;
      su.uSunA.value.copy(look.sunA); su.uSunB.value.copy(look.sunB); su.uSunCol.value.copy(look.sunCol);
      su.uSunI.value = look.sunI; su.uSpread.value = s.sun.spread; su.uSunR.value = s.sunR;
      su.uSkyHi.value.copy(look.skyHi); su.uSkyLo.value.copy(look.skyLo);
      su.uBoil.value = s.steam; su.uTime.value = v; su.uLights.value = look.night * s.city;

      glows.begin(); trails.begin(); smoke.begin();
      city.frame(s, glows, look.lights);
      props.frame(s, glows, look.lights);
      traffic.frame(s, trails, look.lights);
      peopleFrame(s, crowd, colorCache);

      // the impact's debris raining back through the sky
      const tau = v - V_IMPACT;
      if (tau > 0.3 && tau < 3) for (const m of meteors) {
        const a = (tau - m.t0) / m.dur;
        if (a < 0 || a > 1) continue;
        const R0 = 3000;
        const el0 = m.el, el1 = m.el - m.len * 2.2;
        const e0 = el0 - (el0 - el1) * Math.max(0, a - 0.35), e1 = el0 - (el0 - el1) * a;
        const P = (el) => [cp.x - R0 * Math.cos(el) * Math.sin(m.az), cp.y + R0 * Math.sin(el), cp.z - R0 * Math.cos(el) * Math.cos(m.az)];
        const k = Math.sin(Math.PI * a) * m.b;
        trails.add(P(e0), P(e1), m.w, 3.2 * k, 1.3 * k, 0.4 * k, 1);
      }
      // steam rising off the boiling sea
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
