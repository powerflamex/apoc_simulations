// The whole scene, a pure function of video time: the avenue at golden hour, the buildings (buildings.js), the
// street furniture and signs (props.js), the cars (traffic.js), the people (people.js), everything small the wind
// carries (streaks.js), dust (smoke.js), city lights (glows.js) and, at the end, the ocean (ocean.js).
import * as THREE from 'three';
import { makeGround, GU } from './ground.js';
import { makeBuildings } from './buildings.js';
import { makeProps } from './props.js';
import { makeTraffic } from './traffic.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose } from './people.js';
import { makeStreaks } from './streaks.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOcean, WALL_H } from './ocean.js';
import { SUN, TREES, CARS } from './layout.js';
import { F } from './facade.js';
import { tOf, Wms, V_ROAD, V_OCEAN, V_HIT, oceanZ, drift } from './timeline.js';
import { rng, smooth, clamp, DEG } from './util.js';
import { FLY } from './fly.js';

const OFF = (new URLSearchParams(location.search).get('off') || '').split(',');   // debugging: ?off=streaks,smoke
const stub = { frame() {}, u: new Proxy({}, { get: () => ({ value: { set() {}, copy() {}, setScalar() {} } }) }), mat: { uniforms: new Proxy({}, { get: () => ({ value: { set() {}, copy() {}, setRGB() { return { multiplyScalar() {} }; } } }) }) }, begin() {}, end() {}, puff() {}, add() {} };
export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  // ---------- light: the low Sun front-right (WNW), a sky that is blue above and warm below ----------
  const az = SUN.az * DEG, el = SUN.el * DEG;
  // north = +x, east = +z: a compass bearing az points along (cos az, sin az) in (x, z)
  const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
  F.uSunDir.value.copy(sunDir);
  const sun = new THREE.DirectionalLight(0xffb070, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.06;
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 10, far: 4000 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8fa6d6, 0x8a6446, 1.4);
  scene.add(hemi);

  const ground = OFF.includes('ground') ? stub : makeGround(scene);
  const buildings = OFF.includes('buildings') ? { ...stub, glassFrom: [] } : makeBuildings(scene, {});
  const props = OFF.includes('props') ? stub : makeProps(scene, ctx);
  const traffic = OFF.includes('traffic') ? stub : makeTraffic(scene, ctx);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.85));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const leafFrom = [];
  {
    const R = rng(5150);
    for (const tr of TREES) {
      if (tr.z < -900) continue;
      for (let k = 0; k < 22; k++) leafFrom.push({ x: tr.x + (R() - 0.5) * 6 * tr.s, y: (4.5 + R() * 2.5) * tr.s, z: tr.z + (R() - 0.5) * 6 * tr.s, ts: tOf(tr.vStrip - 1.5 + R() * 5) });
    }
    // a few leaves tear off every tree right from the start
    for (const tr of TREES) if (tr.z > -300) for (let k = 0; k < 5; k++) leafFrom.push({ x: tr.x + (R() - 0.5) * 5, y: 5 + R() * 2, z: tr.z + (R() - 0.5) * 5, ts: tOf(-3 + R() * 8) });
  }
  const streaks = OFF.includes('streaks') ? stub : makeStreaks(scene, { glassFrom: buildings.glassFrom, leafFrom });
  const glows = makeGlows(scene, 4000);
  const smoke = OFF.includes('smoke') ? stub : makeSmoke(scene, 4000);
  const ocean = OFF.includes('ocean') ? stub : makeOcean(scene);

  // far city lights down the avenue (street lights, cars' lights) as glows
  const farLights = [];
  {
    const R = rng(73);
    for (let z = -150; z > -1700; z -= 32) for (const s of [-1, 1]) farLights.push({ x: s * 13.9 + (s > 0 ? -2.45 : 2.45), y: 8.1, z: z + s * 6, k: 1, v: 0 });
    for (let z = -1750; z > -5000; z -= 45 + R() * 40) for (let k = 0; k < 6; k++) farLights.push({ x: (R() - 0.5) * 1600, y: 6, z: z - R() * 40, k: 0.7, v: 0 });
  }

  return {
    sunDir, sun, hemi, crowd, smoke, glows, ocean, streaks, ground,
    frame(v, s, cam) {
      const camZ = cam.position.z;
      FLY.cx = cam.position.x; FLY.cy = cam.position.y; FLY.cz = camZ;
      // sun & shadows cover the stretch ahead of the camera
      const tz = camZ - 170;
      sun.position.set(cam.position.x + sunDir.x * 1500, sunDir.y * 1500, tz + sunDir.z * 1500);
      sun.target.position.set(cam.position.x, 0, tz);
      glows.begin(); smoke.begin();
      F.uGrid.value = s.grid;
      F.uDust.value = s.dust;
      GU.uPeel.value = smooth(V_ROAD - 0.5, V_ROAD + 9, v);

      buildings.frame(v, s, smoke, camZ);
      props.frame(v, s, glows, camZ);
      traffic.frame(v, s, glows, camZ);
      PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v, camZ)));
      crowd.commit();
      streaks.frame(v, cam.position, s);

      // far lights (they die with the grid)
      if (s.grid > 0.01) for (const l of farLights) glows.add(l.x, l.y, l.z, 3.4, 2.4 * s.grid * l.k, 1.5 * s.grid * l.k, 0.7 * s.grid * l.k);

      // grit blown off the ground once the wind is strong: low, fast-moving dust sheets near the camera
      {
        const R = rng(31337);
        const t = tOf(v);
        const dens = smooth(9, 22, v) * (1 - 0.4 * smooth(52, 60, v));
        if (dens > 0.01) for (let k = 0; k < 140; k++) {
          const x = (R() - 0.5) * 70 + cam.position.x, y0 = R() * 6;
          const zr = R() * 500;
          const z = camZ - 380 + ((zr + drift(0, 0.3, t) * (0.9 + 0.1 * R())) % 500);
          const age = ((zr + drift(0, 0.3, t)) % 500) / 500;
          const r = 4 + R() * 9 + age * 6;
          const dc = Math.hypot(x - cam.position.x, z - camZ);
          smoke.puff(x, y0 + r * 0.3, z, r, 0.05 * dens * Math.sin(Math.PI * age) * smooth(15, 60, dc), 0.62, 0, R());
        }
      }
      // the ocean: spray and mist billowing off the crest and the foot
      ocean.frame(v);
      if (v > V_OCEAN - 4 && v < V_HIT + 0.05) {
        const z0 = oceanZ(v);
        const R = rng(4242);
        for (let k = 0; k < 110; k++) {
          const x = (R() - 0.5) * 9000 * Math.pow(R(), 0.5) * (R() < 0.5 ? -1 : 1) * 0.5 + cam.position.x;
          const crest = R() < 0.6;
          const y = crest ? WALL_H * (1.0 + 0.3 * R()) : 8 + R() * 30;
          const r = crest ? 30 + R() * 50 : 18 + R() * 25;
          const ph = (v * (0.4 + R() * 0.3) + R()) % 1;
          smoke.puff(x, y + ph * (crest ? 70 : 20), z0 + 30 + R() * 40 - ph * 40, r * (0.7 + 0.6 * ph), (crest ? 0.28 : 0.45) * Math.sin(Math.PI * ph), crest ? 0.98 : 0.75, 0, R());
        }
      }
      glows.end(); smoke.end();
    },
  };
}
