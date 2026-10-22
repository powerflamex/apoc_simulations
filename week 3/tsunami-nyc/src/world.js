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
import { V_LIBERTY, V_FERRY, V_GOV, V_HIT, V_CONTACT } from './timeline.js';
import { makeSpray } from './spray.js';
import { makeSurge } from './surge.js';
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
  const spray = makeSpray(scene, { camX: -0.5 });
  const surge = makeSurge(scene, { camX: -0.5 });

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
      u.uLean.value = 0.35 * smooth(52, V_HIT, v) + 0.4 * smooth(56, V_HIT, v); u.uShade.value = s.shade;
      u.uCurl.value = smooth(55.8, V_CONTACT, v);
      spray.frame(v); spray.u.uLight.value = 1 - 0.3 * s.shade;
      surge.frame(v); surge.u.uLight.value = 1 - 0.25 * s.shade; surge.u.uSun.value.copy(sunDir);
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
        smoke.puff(x, y, z, r * (crest ? 1.3 : 1.8), (crest ? 0.14 : 0.12 * smooth(180, 450, d)) * Math.sin(Math.PI * ph) * smooth(r, r + 60, d), crest ? 0.98 : 0.95, 0, R());
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
      // the hit: the foot slams into the seawall and a wall of white water bursts up over the railing
      {
        const dt = v - (V_HIT - 0.06);
        if (dt > 0 && dt < 1.2) {
          const Rh = rng(9090);
          for (let k = 0; k < 60; k++) {
            const x = cx + (Rh() - 0.5) * 2 * (12 + 260 * Rh());
            const d0 = Math.abs(x - cx);
            const up = (18 + 70 * Rh()) * (1 - Math.exp(-dt / 0.25));
            const r = (3 + 9 * Rh()) * (0.6 + dt * 2);
            smoke.puff(x, 1 + up * (0.3 + 0.7 * Rh()), 2 + Rh() * 6 + dt * 18, r, 0.6 * smooth(0, 0.08, dt) * smooth(3, 10, d0 + dt * 30), 1.0, 0, Rh());
          }
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
  // the hit: the surge comes over the seawall and throws everyone near it back, tumbling, into the park
  const tHit = V_HIT + Math.max(0, z) / 60 - 0.02;
  if (v > tHit && z < 120) {
    const dt = v - tHit;
    return { x: x + Math.sin(p.seed * 30) * dt * 3, y: 0.3 + 8 * dt, z: z + 13 * dt + 14 * dt * dt, yaw: p.yaw, s: p.kid ? 0.62 : p.s,
      walk: 0, stride: 0, sit: 0, pitch: -(dt * 7 + 1.2) * (p.seed < 0.5 ? 1 : -0.7), roll: dt * 5 * (p.seed - 0.5), armL: 1.6, armR: 1.4, look: 0 };
  }
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
