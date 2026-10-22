// The whole scene, a pure function of video time: the land and harbor floor (terrain.js), the water and the wave
// (harbour.js), the landmarks, the city, the boats, the people (crowd.js), spray and mist (smoke.js) and lights.
import * as THREE from 'three';
import { makeTerrain, TU } from './terrain.js';
import { makeHarbour } from './harbour.js';
import { makeLandmarks } from './landmarks.js';
import { makeCity } from './city.js';
import { makeBoats } from './boats.js';
import { makeCrowd } from './crowd.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { F } from './facade.js';
import { PEOPLE, SUN, LIB, GOV, ferryAt } from './layout.js';
import { V_LIBERTY, V_FERRY, V_GOV, V_HIT } from './timeline.js';
import { rng, smooth, clamp, DEG } from './util.js';

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  // the low Sun, ahead and to the right (behind the Statue of Liberty), setting
  const a = SUN.a * DEG, el = SUN.el * DEG;
  const sunDir = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)).normalize();
  F.uSunDir.value.copy(sunDir);
  const sun = new THREE.DirectionalLight(0xffa860, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.08;
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 10, far: 4000 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9ab0dc, 0x6a5848, 1.3);
  scene.add(hemi);

  const terrain = makeTerrain(scene);
  const harbour = makeHarbour(scene);
  harbour.u.uSun.value.copy(sunDir);
  const marks = makeLandmarks(scene);
  const city = makeCity(scene, ctx);
  const boats = makeBoats(scene);
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.85));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const glows = makeGlows(scene, 3000);
  const smoke = makeSmoke(scene, 3500);

  // what the wave takes, with a burst of spray: the statue, the ferry, the island
  const BURSTS = [
    { v: V_LIBERTY, x: LIB.x, z: LIB.z, size: 1.0 },
    { v: V_FERRY, at: () => ferryAt(V_FERRY), size: 0.8 },
    { v: V_GOV - 2.5, x: GOV.x + 150, z: GOV.z + 120, size: 1.4 },
    { v: V_GOV, x: GOV.x - 120, z: GOV.z + 160, size: 1.4 },
  ];

  return {
    sunDir, sun, hemi, smoke, glows, harbour, crowd,
    frame(v, s, cam) {
      // sun & shadows over the promenade and the park around the camera
      const cx = cam.position.x, cz = cam.position.z;
      sun.position.set(cx + sunDir.x * 1500, sunDir.y * 1500, cz + sunDir.z * 1500);
      sun.target.position.set(cx, 0, cz);
      glows.begin(); smoke.begin();
      TU.uLevel.value = s.level; TU.uTime.value = v;
      const u = harbour.u;
      u.uTime.value = v; u.uLevel.value = s.level; u.uFront.value = s.front; u.uH.value = s.H;
      u.uLean.value = 0.35 * smooth(52, V_HIT, v); u.uShade.value = s.shade;
      city.frame(v, s, glows);
      boats.frame(v, s);
      PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v, s)));
      crowd.commit();
      // the torch: a small warm glow until she goes under
      if (v < V_LIBERTY + 0.3) glows.add(marks.flame.x, marks.flame.y, marks.flame.z, 5, 3.5, 2.4, 1.0);

      // spray and mist off the crest (lit gold from behind while the Sun is still up), and the churn at its foot
      const R = rng(4242);
      for (let k = 0; k < 150; k++) {
        const x = (R() - 0.5) * 2 * (200 + 3800 * R() * R()) + cx * 0.0;
        const crest = R() < 0.6;
        const ph = (v * (0.18 + R() * 0.22) + R()) % 1;
        const y = crest ? s.level + s.H * (0.95 + 0.12 * R()) + ph * (30 + 40 * R()) : s.level + 4 + ph * (10 + 25 * R());
        const r = (crest ? 25 + R() * 45 : 15 + R() * 25) * (0.5 + 0.8 * ph) * (0.6 + 0.4 * s.H / 300);
        const z = s.front - (crest ? s.H * 0.5 : -5) + 20 - ph * 30;
        const d = Math.hypot(x - cx, z - cz);
        if (!crest && R() < 0.5) continue;
        smoke.puff(x, y, z, r * (crest ? 1.3 : 1.8), (crest ? 0.14 : 0.12) * Math.sin(Math.PI * ph) * smooth(r, r + 60, d), crest ? 0.98 : 0.95, 0, R());
      }
      // the bursts
      for (const b of BURSTS) {
        const dt = v - b.v;
        if (dt < 0 || dt > 6) continue;
        const p = b.at ? b.at() : b;
        const Rb = rng(Math.round(b.v * 1000));
        for (let k = 0; k < 40; k++) {
          const ph = clamp(dt / (2 + Rb() * 3));
          const r = (15 + Rb() * 30) * b.size * (0.4 + ph);
          smoke.puff(p.x + (Rb() - 0.5) * 120 * b.size, s.level + s.H * (0.4 + 0.7 * Rb()) * (0.3 + 0.9 * ph), p.z + 20 + Rb() * 40, r, 0.4 * (1 - ph) * smooth(0, 0.15, dt), 0.98, 0, Rb());
        }
      }
      // spray blowing in ahead of it at the end: the air fills with it
      if (s.spray > 0) {
        for (let k = 0; k < 70; k++) {
          const x = cx + (R() - 0.5) * 300, ph = (v * (0.6 + R() * 0.5) + R()) % 1;
          const z = cz - 40 - R() * Math.max(30, s.dist) + ph * 40;
          const r = 6 + R() * 14;
          smoke.puff(x, 2 + R() * 30 + ph * 10, z, r, 0.12 * s.spray * Math.sin(Math.PI * ph) * smooth(r, r + 20, Math.hypot(x - cx, z - cz)), 0.97, 0, R());
        }
      }
      glows.end(); smoke.end();
    },
  };
}

// a person at video time v: standing or strolling (filming, pointing), then running for the city
function personPose(p, v, s) {
  const [x, z] = p.posAt(v);
  const o = { x, y: 0, z, yaw: p.yaw, s: p.kid ? 0.62 : p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0, armR: 0, look: 0.08 };
  if (z > 640) return { visible: false };
  if (v < p.vRun) {
    if (p.ux) { o.walk = p.ph + (x - p.x) / 0.75 * Math.PI; o.stride = 1; }
    // looking out at it: phones up, pointing, heads tilting back as it grows
    o.look = 0.1 + 0.5 * smooth(5, 50, v);
    if (p.phone) { o.armR = 1.05; o.armL = 0.9; }
    if (p.point) o.armR = 1.35;
    if (p.you) { o.look = 0.12 + 0.95 * smooth(8, 56, v); o.armL = 0.1; o.armR = 0.15; o.yaw = p.yaw; }
    return o;
  }
  // running: turn round, then flat out, arms pumping
  const dt = v - p.vRun;
  const turn = smooth(0, 0.5, dt);
  o.yaw = p.yaw + (((p.ang - p.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * turn;
  const d = p.run * (dt - 0.6 * (1 - Math.exp(-dt / 0.6)));
  o.walk = p.ph + d / 1.1 * Math.PI; o.stride = 1.6 * smooth(0, 0.6, dt);
  o.pitch = 0.18 * smooth(0, 0.6, dt);
  o.armL = 0.2 + 0.25 * Math.sin(o.walk); o.armR = 0.2 - 0.25 * Math.sin(o.walk);
  o.look = 0;
  return o;
}
