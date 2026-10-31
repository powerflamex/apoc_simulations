// The whole scene, a pure function of time: the ground (ground.js), the sea (sea.js), the hotels (buildings.js),
// palms, umbrellas, the pier and its Ferris wheel, the mountains (props.js), the cars (traffic.js), the people
// (people.js), flames (fire.js), smoke, steam and frozen breath (smoke.js), lamps and lights (glows.js), and the light.
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
import { TOWERS, CAM0, landY } from './layout.js';
import { patchHeat } from './heat.js';
import { LAND } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `plain-${rough}-${extra.metalness || 0}-${extra.transparent ? 1 : 0}-${extra.side || 0}`);
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
  const glows = makeGlows(scene, 3000);
  const props = makeProps(scene, ctx);
  const traffic = makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.8));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const fire = makeFire(scene, 5000);
  const smoke = makeSmoke(scene, 3600);

  // each tower: when it sags (Aldebaran) and falls (Rigel), the front rows first
  const TW = TOWERS.map((t, i) => {
    const R = rng(1000 + i);
    return { sag0: LAND.aldebaran + 1.5 + R() * 4 + t.row * 0.8, fall0: LAND.rigel + 0.8 + R() * 5.5, fallDur: 1.2 + R() * 1.5, seed: R(), x: t.x + t.dep / 2, z: t.z + t.w / 2, h: t.h, row: t.row };
  });
  const goneAt = (i, v) => {
    const w = TW[i];
    return smooth(w.sag0, w.sag0 + 3.5, v) * 0.3 + smooth(w.fall0, w.fall0 + w.fallDur * 2, v) * 0.7;
  };

  const R0 = rng(321);
  // smoke off the sand (Sirius) right around and in front of you; steam over the sea
  const SAND = Array.from({ length: 150 }, () => ({ r: 7 + Math.pow(R0(), 1.3) * 70, l: (R0() - 0.5) * 1.1, seed: R0() }));
  const STEAM = Array.from({ length: 70 }, () => ({ a: R0(), b: R0(), seed: R0() }));
  const SURF = Array.from({ length: 70 }, () => ({ r: 14 + Math.pow(R0(), 1.4) * 90, l: (R0() - 0.5) * 0.8, seed: R0() }));
  const near = PEOPLE.map((p, i) => i).filter((i) => Math.hypot(PEOPLE[i].x - CAM0.x, PEOPLE[i].z - CAM0.z) < 30);
  const skin0 = PEOPLE.map((p) => p.col);
  const tmpC = new THREE.Color(), tmpD = new THREE.Color(), FROST = new THREE.Color(0.8, 0.88, 0.96);
  let frostK = -1;

  return {
    sun, hemi, crowd, smoke, fire, sea, ground, towers, props, glows,
    frame(v, s, cam) {
      fire.begin(); smoke.begin(); glows.begin();
      GU.uTime.value = v; GU.uSeaY.value = -s.drop;
      GU.uGlass.value = smooth(LAND.rigel + 1, LAND.rigel + 6, v);
      BU.uTime.value = v; BU.uWin.value = 0.55 * clamp(s.win); BU.uFire.value = 0.4 * clamp(s.win); BU.uMelt.value = s.melt; BU.uLights.value = 0.3 + 0.7 * s.nightL; BU.uNight.value = s.nightL;
      sea.u.uSeaY.value = -s.drop;
      sea.u.uSteam.value = s.steam;
      sea.u.uBoil.value = s.boil;
      sea.u.uIce.value = s.ice; sea.u.uIceR.value = s.iceR;

      props.frame(v, s, fire, smoke, glows, cam);
      traffic.frame(v, s, fire, smoke, cam);
      PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v)));
      // frost on the people (Proxima), gone in Sirius' glare
      const fk = Math.round(s.cold * 40) / 40;
      if (fk !== frostK) {
        frostK = fk;
        PEOPLE.forEach((p, i) => {
          const [shirt, pants, skin, hair, sleeves] = skin0[i];
          const f = (c) => tmpC.set(c).lerp(FROST, 0.45 * fk).getHex();
          crowd.color(i, f(shirt), f(pants), tmpD.set(skin).lerp(new THREE.Color(0.72, 0.78, 0.88), 0.4 * fk).getHex(), f(hair), sleeves);
        });
      }
      crowd.commit();
      towers.frame((i) => goneAt(i, v));

      // breath: white puffs in front of the faces of the people near you, freezing in the air
      if (s.breath > 0.01) {
        for (const i of near) {
          const p = PEOPLE[i];
          const o = personPose(p, v);
          if (o.visible === false) continue;
          const period = 1.5 + p.seed * 0.6;
          const ph = ((v + p.seed * 9) % period) / period;
          if (ph > 0.7) continue;
          const k = ph / 0.7;
          const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
          const hy = o.y + 1.58 * o.s - 0.42 * o.sit;
          const dist = 0.15 + 0.5 * Math.sqrt(k);
          const dcam = Math.hypot(o.x - cam.position.x, o.z - cam.position.z);
          smoke.puff(o.x + fx * dist, hy - 0.05 + 0.12 * k, o.z + fz * dist, (0.07 + 0.26 * Math.sqrt(k)) * o.s, 0.6 * s.breath * Math.sin(Math.PI * Math.min(1, k * 1.4 + 0.05)) * (1 - k * 0.6) * smooth(2.5, 5, dcam), 0.97, 0.0, p.seed + Math.floor((v + p.seed * 9) / period));
        }
      }
      // the sand smokes: thin grey wisps rising everywhere in front of you (Sirius on)
      const sm = s.smolder * (1 - smooth(LAND.vega + 2, LAND.vega + 5, v));
      if (sm > 0.01) {
        for (const q of SAND) {
          const a = s.camB + q.l * 0.6;
          const x = cam.position.x - Math.cos(a) * q.r, z = cam.position.z - Math.sin(a) * q.r;
          if (x < 1) continue;
          const ph = (v * (0.22 + q.seed * 0.2) + q.seed) % 1;
          const rr = (0.12 + q.r * 0.012) * (1 + ph * 2.2);
          smoke.puff(x + ph * 0.8, landY(x, z) + 0.05 + ph * (1.2 + q.r * 0.03), z, rr, 0.11 * sm * Math.sin(Math.PI * ph) * smooth(7, 14, q.r), 0.55, 0.0, q.seed);
        }
      }
      // steam off the sea: low and thin at first, then boiling up everywhere; off the wet sea floor as it is bared
      const st = Math.max(s.steam * 0.6, s.boil) * (1 - smooth(LAND.betelgeuse, LAND.betelgeuse + 0.8, v));
      if (st > 0.01) {
        for (const p of STEAM) {
          const dist = 25 + Math.pow(p.a, 1.6) * 2600 + s.drop * 8;
          const ang = (-28 + p.b * 70) * Math.PI / 180;
          const x = cam.position.x - Math.cos(ang) * dist, z = cam.position.z - Math.sin(ang) * dist;
          if (x > -s.drop * 15 - 3) continue;
          const ph = (v * (0.12 + p.seed * 0.12) + p.seed) % 1;
          const rr = (3 + dist * 0.01) * (1 + ph * 1.2);
          const thin = 1 - 0.6 * smooth(LAND.rigel + 2, LAND.rigel + 6, v) * (1 - smooth(300, 900, dist));   // (the drone rises through it: keep the view)
          smoke.puff(x + ph * 20, -s.drop + rr * 0.4 + ph * (20 + dist * 0.03), z, rr, 0.07 * st * thin * Math.sin(Math.PI * ph) * smooth(LAND.arcturus + 0.5, LAND.arcturus + 2.5, v), 0.97, 0.0, p.seed);
        }
      }
      // steam lifting off the surf right in front of you (Vega on): white wisps low over the water
      const ss = Math.max(s.steam, s.boil) * (1 - smooth(LAND.rigel + 1, LAND.rigel + 4, v));
      if (ss > 0.01) for (const q of SURF) {
        const a = s.camB + q.l;
        const x = Math.min(cam.position.x, 4) - 4 - Math.cos(a) * q.r, z = cam.position.z - Math.sin(a) * q.r;
        if (x > -2 || Math.hypot(x - cam.position.x, z - cam.position.z) < 14) continue;
        const ph = (v * (0.16 + q.seed * 0.14) + q.seed) % 1;
        const rr = (0.6 + q.r * 0.022) * (1 + ph * 2.2);
        smoke.puff(x + ph * 2, -s.drop + 0.2 + rr * 0.4 + ph * (4 + q.r * 0.06), z, rr, 0.5 * ss * Math.sin(Math.PI * ph) * (1 - ph * 0.5), 0.98, 0.0, q.seed);
      }
      fire.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uTime.value = v;
      fire.end(); smoke.end(); glows.end();
    },
  };
}
