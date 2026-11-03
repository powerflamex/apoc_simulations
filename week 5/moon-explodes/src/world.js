// The whole scene, a pure function of time: the promenade and the crowd (with their phones, whose screens show the
// sky), the harbour and its boats, the city across the water, the falling pieces (streaks with glowing heads, smoke
// trains behind the big ones), the splash and its wave over the deck, the hits on the towers and the mountain, the dust
// rolling across the water, the giant chunk; and the light (the sky, the city, the lamps, every flash).
import * as THREE from 'three';
import { makePromenade, PU } from './promenade.js';
import { makeHarbor, HU } from './harbor.js';
import { makeCity, CU } from './city.js';
import { makeCrowd } from './crowd.js';
import { makeFire } from './fire.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { makeStreaks } from './streaks.js';
import { PEOPLE, personPose, phoneOf } from './people.js';
import { EDGE_Z, SEA0, farY, deckY as deckYAt } from './layout.js';
import { METEORS, HITS, FAR_HITS, V_SPLASH, SPLASH, V_WAVE, V_CHUNK, V_HIT, CHUNK, V_RAIN, V_BURST } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';
import { MOON_DIR, ringDir } from './sky.js';

const CH0 = [-1500, 18000, -26000], CH1 = [CHUNK.x, 0, CHUNK.z];
export const chunkPos = (v) => { const u = clamp((v - V_CHUNK) / (V_HIT - V_CHUNK)); return [lerp(CH0[0], CH1[0], u), lerp(CH0[1], CH1[1], u), lerp(CH0[2], CH1[2], u)]; };

export function makeWorld(scene, camera) {
  const all = (l) => { l.layers.enableAll(); return l; };
  // ---- lights ----
  const skyL = all(new THREE.DirectionalLight(0xdfe6ff, 0.2));
  skyL.castShadow = true;
  skyL.shadow.mapSize.set(2048, 2048);
  skyL.shadow.bias = -0.0004; skyL.shadow.normalBias = 0.04;
  Object.assign(skyL.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 400 });
  skyL.shadow.camera.layers.enableAll();
  const cityL = all(new THREE.DirectionalLight(0xffa868, 0.3));
  const flashL = all(new THREE.DirectionalLight(0xffd2a0, 0));
  const hemi = all(new THREE.HemisphereLight(0x3a4a68, 0x2a2420, 0.6));
  scene.add(skyL, skyL.target, cityL, cityL.target, flashL, flashL.target, hemi);

  const promenade = makePromenade(scene);
  const harbor = makeHarbor(scene, camera);
  const city = makeCity(scene);
  const glows = makeGlows(scene, 9000);
  const fire = makeFire(scene, 4000);
  const smoke = makeSmoke(scene, 3200);
  const streaks = makeStreaks(scene, 3200);
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const crowd = makeCrowd(scene, PEOPLE.length, crowdMat);
  for (const m of crowd.meshes) m.layers.set(1);
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const you = makeCrowd(scene, 1, crowdMat);          // (only in the shadow pass: layer 2 is in no camera)
  for (const m of you.meshes) { m.layers.set(2); m.receiveShadow = false; }

  // ---- phones: dark bodies, and screens that show the sky ----
  const nPh = PEOPLE.filter((p) => p.act === 'phone' || p.act === 'phone2').length;
  const phoneBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.165, 0.012), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4 }), nPh);
  const SCR = { uSpread: { value: 0 }, uRing: { value: 0 }, uRain: { value: 0 }, uGlow: { value: 1 } };
  const screen = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.073, 0.155), new THREE.ShaderMaterial({
    uniforms: SCR,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uSpread, uRing, uRain, uGlow; varying vec2 vUv;
      float h(float n) { return fract(sin(n * 91.3) * 43758.5); }
      void main() {
        vec2 uv = vUv, p = (uv - vec2(0.5, 0.6)) * vec2(1.0, 2.1);
        vec3 col = vec3(0.012, 0.018, 0.04) + vec3(0.07, 0.04, 0.025) * smoothstep(0.4, 0.0, uv.y);
        float sk = step(uv.y, 0.2 + 0.09 * h(floor(uv.x * 13.0)));
        col = mix(col, vec3(0.015) + vec3(0.55, 0.38, 0.2) * step(0.62, h(floor(uv.x * 45.0) + floor(uv.y * 70.0) * 7.0)) * 0.5, sk);
        float r = 0.2 / (1.0 + uSpread * 1.2), m = 0.0;
        if (uSpread < 0.01) m = smoothstep(r, r * 0.9, length(p));
        else for (int i = 0; i < 7; i++) { float fi = float(i); vec2 c = (i == 0 ? vec2(0.0) : vec2(cos(fi * 0.9 + 0.3), sin(fi * 0.9 + 0.3))) * uSpread * 0.38 * (0.8 + 0.4 * h(fi)); m += smoothstep(r * 0.42, r * 0.32, length(p - c)); }
        col += vec3(1.5, 1.45, 1.35) * m * (1.0 - uRing);
        col += vec3(0.8, 0.7, 0.6) * exp(-dot(p, p) * 14.0 / (1.0 + uSpread * 5.0)) * 0.3 * min(1.0, uSpread * 2.0) * (1.0 - uRing);
        col += vec3(1.1, 1.05, 0.95) * exp(-pow((p.y * 0.88 - p.x * 0.47 + 0.08) / 0.09, 2.0)) * uRing;
        col += vec3(1.0, 0.32, 0.08) * uRain * 0.5 * smoothstep(0.7, 0.1, uv.y);
        col = mix(col, vec3(1.6, 0.1, 0.1), smoothstep(0.035, 0.022, length((uv - vec2(0.16, 0.93)) * vec2(1.0, 2.1))));
        col *= step(0.045, uv.x) * step(uv.x, 0.955) * step(0.025, uv.y) * step(uv.y, 0.975);
        gl_FragColor = vec4(col * uGlow, 1.0);
      }`,
  }), nPh);
  phoneBody.layers.set(1); screen.layers.set(1);
  phoneBody.frustumCulled = screen.frustumCulled = false;
  scene.add(phoneBody, screen);

  // ---- the wave over the deck: a sheet of water with a foaming front ----
  const FL = { uFront: { value: EDGE_Z - 1 }, uTime: { value: 0 }, uAmt: { value: 0 }, uSkyC: { value: new THREE.Color() } };
  const flood = new THREE.Mesh(new THREE.PlaneGeometry(160, 15, 1, 1).rotateX(-Math.PI / 2).translate(0, 0.03, EDGE_Z + 7.5), new THREE.ShaderMaterial({
    uniforms: FL, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vWP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uFront, uTime, uAmt; uniform vec3 uSkyC; varying vec3 vWP;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float edge = (vn(vec2(vWP.x * 0.6, uTime * 0.6)) - 0.5) * 1.4;
        float d = uFront + edge - vWP.z;
        float cov = smoothstep(-0.15, 0.25, d);
        if (cov * uAmt < 0.01) discard;
        float foam = exp(-pow((d - 0.2) / 0.3, 2.0)) * (0.5 + 0.5 * vn(vWP.xz * 3.0 + uTime * 2.0)) + 0.18 * smoothstep(0.7, 0.95, vn(vWP.xz * 1.3 - uTime * 1.5));
        vec3 col = vec3(0.006, 0.009, 0.014) + uSkyC * (0.5 + 0.5 * vn(vWP.xz * 0.9 + uTime * 0.5));
        col = mix(col, vec3(0.3, 0.31, 0.33) * (0.4 + uSkyC.b * 3.0), clamp(foam, 0.0, 1.0) * 0.85);
        gl_FragColor = vec4(col, cov * 0.9 * uAmt);
      }`,
  }));
  flood.layers.set(1);
  flood.renderOrder = 3;
  scene.add(flood);

  // ---- the giant chunk ----
  const chunkGeo = new THREE.IcosahedronGeometry(1, 4);
  { const p = chunkGeo.attributes.position, q = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { q.fromBufferAttribute(p, i); const k = 1 + 0.18 * Math.sin(q.x * 3.1 + 1) * Math.sin(q.y * 2.7) + 0.1 * Math.sin(q.z * 6.3 + q.x * 2); p.setXYZ(i, q.x * k * 1.15, q.y * k * 0.9, q.z * k); } chunkGeo.computeVertexNormals(); }
  const CHU = { uDir: { value: new THREE.Vector3(0, -1, 0) }, uHeat: { value: 1 }, uTime: { value: 0 } };
  const chunk = new THREE.Mesh(chunkGeo, new THREE.ShaderMaterial({
    uniforms: CHU,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; void main() { vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDir; uniform float uHeat, uTime; varying vec3 vN; varying vec3 vP;
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main() {
        float front = max(dot(normalize(vN), uDir), 0.0);
        float n = h31(floor(vP * 9.0 + uTime * 3.0));
        vec3 rock = vec3(0.12, 0.1, 0.09) * (0.6 + 0.4 * n);
        vec3 hot = mix(vec3(3.0, 1.0, 0.25), vec3(6.0, 5.0, 3.8), pow(front, 3.0));
        gl_FragColor = vec4(mix(rock, hot, clamp(pow(front, 0.6) * uHeat + 0.25 * n * uHeat, 0.0, 1.0)), 1.0);
      }`,
  }));
  chunk.frustumCulled = false;
  chunk.visible = false;
  scene.add(chunk);

  // ---- the hard rain on the hills and the far shore (each with its own streak; fires that stay) ----
  const GROUND_HITS = [];
  {
    const R = rng(808);
    for (let k = 0; k < 70; k++) {
      const v = V_RAIN + 2.6 + Math.pow(R(), 0.8) * (V_HIT - V_RAIN - 2.85);
      const x = (R() * 2 - 1) * 2600, z = -2600 - R() * 2400;
      GROUND_HITS.push({ v, p: [x, farY(x, z), z], size: 0.5 + R() * 0.9, seed: R() });
    }
  }
  const DUST = [];
  {
    const R = rng(606);
    for (let k = 0; k < 280; k++) DUST.push({ x: (R() * 2 - 1) * 950, dz: R() * 420, y: Math.pow(R(), 1.6) * 260, r: 28 + R() * 46, seed: R() });
  }
  const SPARKS = [];
  {
    const R = rng(707);
    for (const h of HITS) for (let k = 0; k < 22; k++) SPARKS.push({ h, vx: (R() * 2 - 1) * 40 * h.size, vy: (R() * 0.8 - 0.1) * 40 * h.size, vz: (R() * 1.2) * 30 * h.size, life: 1.4 + R() * 1.6, seed: R() });
  }
  const R0 = rng(99);
  const COL = Array.from({ length: 46 }, () => ({ k: R0(), a: R0() * Math.PI * 2, r: R0(), seed: R0() }));
  const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);

  return {
    hemi, skyL, cityL, flashL, crowd, harbor, city, glows, fire, smoke, streaks, chunk,
    frame(v, s, cam, px) {
      fire.begin(); smoke.begin(); glows.begin(); streaks.begin();
      const cp = cam.position;
      // ---- the water's level: the tide and the splash's surge; the ring wave from the splash ----
      const ringR = v > V_SPLASH ? 215 * (v - V_SPLASH) : -1;
      s.level = s.tide + 1.15 * s.surge + 0.18 * s.slosh * Math.sin(v * 5.1) * Math.sin(v * 1.7 + 1);
      s.surgeAt = (x, z) => (ringR < 0 ? 0 : Math.exp(-Math.pow((Math.hypot(x - SPLASH.x, z - SPLASH.z) - ringR) / 25, 2)) * Math.exp(-(v - V_SPLASH) / 2.5));
      s.lampsOut = smooth(V_CHUNK - 0.6, V_CHUNK - 0.4, v) * (0.6 + 0.4 * (Math.sin(v * 41) > 0 ? 1 : 0)) + smooth(V_CHUNK - 0.3, V_CHUNK - 0.2, v) * 0.4;
      HU.uSplash.value.set(SPLASH.x, SPLASH.z, ringR, ringR < 0 ? 0 : 1.6 * Math.exp(-(v - V_SPLASH) / 1.6));
      HU.uChop.value = 0.85 + 0.9 * s.slosh + 0.6 * s.rain;
      HU.uFoam.value = 0.6 * smooth(V_SPLASH, V_SPLASH + 0.5, v) * (1 - smooth(V_SPLASH + 3, V_SPLASH + 7, v)) + 0.3 * s.rain;
      PU.uLevel.value = SEA0 + s.level;
      PU.uWet.value = s.wet;
      PU.uFloodZ.value = Math.max(EDGE_Z - 1, EDGE_Z + 6.6 * (v < V_WAVE + 2 ? s.flood : 1) * (v > V_WAVE + 0.2 ? 1 : 0));
      FL.uFront.value = EDGE_Z + 6.6 * s.flood - 0.3; FL.uTime.value = v; FL.uAmt.value = smooth(0.0, 0.08, s.flood);

      // ---- the light ----
      const ringK = smooth(12.0, 13.4, v);
      const L = tmpV.copy(MOON_DIR).lerp(ringDir(0.7), ringK).normalize();
      skyL.position.set(cp.x + L.x * 200, L.y * 200, cp.z + L.z * 200);
      skyL.target.position.set(cp.x, 0, cp.z - 8);
      skyL.intensity = 0.25 + 2.6 * (s.skyL - 0.06);
      skyL.color.setRGB(0.88, 0.92, 1.0).lerp(tmpC.setRGB(1.0, 0.62, 0.35), s.heat * 0.6);
      const cityOn = 1 - 0.85 * s.black;
      cityL.position.set(cp.x, 60, cp.z - 200); cityL.target.position.set(cp.x, 0, cp.z);
      cityL.intensity = 0.32 * cityOn + 0.35 * s.heat;
      cityL.color.setRGB(1.0, 0.66, 0.42).lerp(tmpC.setRGB(1.0, 0.45, 0.18), s.heat);
      hemi.intensity = 0.75 + 0.7 * (s.skyL - 0.06);
      hemi.color.setRGB(0.24, 0.3, 0.42).lerp(tmpC.setRGB(0.55, 0.3, 0.18), s.heat * 0.7);
      // every flash this frame: the strongest one sets the flash light's direction; all add to the sky
      let fI = 0; const fD = new THREE.Vector3(0, 1, 0), fC = new THREE.Color(0, 0, 0);
      const flashAt = (p, I, r, g, b) => {
        const d = Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z);
        const k = I / (1 + d / 3000);
        fC.r += r * k; fC.g += g * k; fC.b += b * k;
        if (k > fI) { fI = k; fD.set(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z).normalize(); }
      };

      // ---- the falling pieces ----
      const W = px;      // radians per pixel
      for (const m of METEORS) {
        if (v < m.v0 || v > m.v1 + 6) continue;
        const u = (v - m.v0) / (m.v1 - m.v0);
        if (m.kind === 0 && u > 1) continue;
        const uu = Math.min(u, 1);
        const head = [lerp(m.p0[0], m.p1[0], uu), lerp(m.p0[1], m.p1[1], uu), lerp(m.p0[2], m.p1[2], uu)];
        const dist = Math.hypot(head[0] - cp.x, head[1] - cp.y, head[2] - cp.z);
        if (m.kind === 0) {
          const tf = Math.max(0, uu - 0.4);
          const tail = [lerp(m.p0[0], m.p1[0], tf), lerp(m.p0[1], m.p1[1], tf), lerp(m.p0[2], m.p1[2], tf)];
          const I = smooth(0, 0.15, u) * (1 - smooth(0.7, 1, u)) * (0.8 + 0.5 * smooth(0.5, 0.8, u)) * m.size;
          streaks.add(head, tail, 2.0 * W, 2.6 * I, 2.9 * I, 2.8 * I);
          glows.add(head[0], head[1], head[2], dist * W * 9 * m.size, 1.8 * I, 2.1 * I, 2.0 * I);
          continue;
        }
        // fireballs and the ones that hit: brighter, wider, orange-white, with a smoke train left behind
        const big = m.kind >= 2;
        const tf = Math.max(0, uu - (big ? 0.6 : 0.45));
        const tail = [lerp(m.p0[0], m.p1[0], tf), lerp(m.p0[1], m.p1[1], tf), lerp(m.p0[2], m.p1[2], tf)];
        let I = 0;
        if (u <= 1) {
          I = smooth(0, 0.2, u) * (0.6 + 0.8 * u) * m.size * (m.kind === 1 ? 0.4 * (1 - smooth(0.92, 1, u)) : 0.8);
          const wpx = (m.kind === 1 ? 2.2 : 3.5) * Math.min(4, 1 + m.size * 0.15) * (big ? Math.max(1, 1500 / Math.max(dist, 300)) : 1);
          streaks.add(head, tail, Math.min(wpx * W, 0.02), 2.4 * I, 1.5 * I, 0.75 * I);
          glows.add(head[0], head[1], head[2], Math.max(dist * W * (big ? 12 : 7), 8) * (1 + m.size * 0.12), 2.4 * I, 1.6 * I, 0.9 * I);
          if (big) flashAt(head, I * 0.25, 1.0, 0.7, 0.45);
        }
        // the burst at the end of a fireball (kind 1)
        if (m.kind === 1 && u > 0.97 && u < 1.25) {
          const b = Math.exp(-(u - 0.97) * (m.v1 - m.v0) / 0.12) * m.size;
          glows.add(head[0], head[1], head[2], dist * W * 22, 1.6 * b, 1.1 * b, 0.6 * b);
          flashAt(head, b * 0.25, 1.0, 0.8, 0.6);
        }
        // the smoke train: puffs along the path, lingering
        const nT = big ? 16 : 0;
        for (let k = 0; k < nT; k++) {
          const f = (k + 0.5) / nT * uu;
          const age = v - (m.v0 + f * (m.v1 - m.v0));
          if (age < 0.05) continue;
          const a = Math.exp(-age / 3.0) * 0.28 * smooth(0.05, 0.4, age);
          const pp = [lerp(m.p0[0], m.p1[0], f), lerp(m.p0[1], m.p1[1], f), lerp(m.p0[2], m.p1[2], f)];
          const dd = Math.hypot(pp[0] - cp.x, pp[1] - cp.y, pp[2] - cp.z);
          smoke.puff(pp[0], pp[1] - age * 20, pp[2], dd * W * (3 + age * 2.5) * (big ? 1.3 : 1), a, 0.14, 0.3 * Math.exp(-age / 0.6), m.v0 * 3.1 + k * 0.37);
        }
      }

      // ---- the splash: an orange flash, a fireball on the water, then a tall column of water lit by the fire inside it ----
      if (v > V_SPLASH - 0.05 && v < V_SPLASH + 9) {
        const t = v - V_SPLASH, lvl = SEA0 + s.level, tt = Math.max(0, t);
        const fl = Math.exp(-tt / 0.22);
        glows.add(SPLASH.x, lvl + 10, SPLASH.z, 150 * fl + 30, 5.0 * fl, 2.9 * fl, 1.1 * fl);
        flashAt([SPLASH.x, lvl + 20, SPLASH.z], 2.6 * fl, 1.0, 0.62, 0.3);
        // the fireball sitting on the water, and flames round the foot of the column
        const fb = smooth(0, 0.08, t) * Math.exp(-tt / 0.9);
        glows.add(SPLASH.x, lvl + 15 + 25 * smooth(0, 1.2, t), SPLASH.z + 8, 70 + 70 * smooth(0, 1.0, t), 2.8 * fb, 1.2 * fb, 0.3 * fb);
        const burn = smooth(0, 0.1, t) * (1 - smooth(1.5, 4.0, t));
        if (burn > 0) for (let k = 0; k < 14; k++) {
          const a = k / 14 * Math.PI * 2 + 0.3, r = 10 + 16 * smooth(0, 1.2, t) + 6 * Math.sin(k * 2.7);
          fire.add(SPLASH.x + Math.cos(a) * r, lvl, SPLASH.z + Math.sin(a) * r * 0.6 + 6, 22 + 8 * Math.sin(k * 1.9), (50 + 50 * Math.abs(Math.sin(k * 3.3))) * burn, 1.3 * burn, V_SPLASH + k * 0.17);
        }
        // the column of water: tall and narrow, then it collapses and spreads; glowing orange low down at first
        const H = 190 * smooth(0, 0.8, t) - 75 * smooth(1.8, 4.5, t);
        for (const c of COL) {
          const y = lvl + H * c.k * (1 - 0.3 * smooth(2, 5, t) * (1 - c.k));
          const spread = (3 + 12 * c.k * smooth(0, 1.2, t) + 32 * smooth(1.5, 6, t) * c.r);
          const x = SPLASH.x + Math.cos(c.a) * spread * c.r, z = SPLASH.z + Math.sin(c.a) * spread * c.r;
          const a = smooth(0, 0.12, t) * (1 - smooth(2.5, 7, t)) * 0.7;
          const glow = (1.4 * Math.exp(-tt / 0.9) + 0.25 * Math.exp(-tt / 3)) * (1 - 0.65 * c.k);
          smoke.puff(x, y, z, 6 + 13 * c.k + 10 * smooth(1, 5, t), a, 0.85, glow, c.seed);
        }
      }
      // ---- the hits on the towers ----
      for (const h of HITS) {
        const t = v - h.v;
        if (t < 0) continue;
        const p = h.p, S = h.size;
        const fl = Math.exp(-t / 0.25);
        glows.add(p[0], p[1], p[2] + 10, (90 * fl + 30) * S, 5 * fl + 0.4, 3.4 * fl + 0.2, 2.0 * fl + 0.06);
        flashAt(p, (3.0 * fl + 0.15) * S, 1.0, 0.7, 0.45);
        // the fireball, then the fire that stays on those floors
        const tw = h.t.w;
        for (let k = 0; k < 9; k++) {
          const ox = (k / 8 - 0.5) * tw * 1.1;
          fire.add(p[0] + ox + 0.2 * tw, p[1] - 8 * S + 4 * Math.sin(k * 3.1), p[2] + 2, (14 + 10 * fl) * S, (30 + 40 * fl) * S * (0.7 + 0.3 * Math.sin(k * 1.7 + v)), 1.2, h.v + k * 0.13);
        }
        // smoke rising from it, lit from below
        for (let k = 0; k < 18; k++) {
          const age = (t * 0.8 + k * 0.4) % 7.2;
          if (age > t + 0.2) continue;
          const y = p[1] + age * 14 * S + age * age * 1.5;
          smoke.puff(p[0] + Math.sin(k * 2.3) * 12 * S + age * 6, y, p[2] - 5, (12 + age * 7) * S, 0.5 * smooth(0, 0.6, age) * (1 - smooth(5, 7.2, age)), 0.06, 0.28 * Math.exp(-age / 1.6), k * 0.77 + h.v);
        }
      }
      for (const sp of SPARKS) {
        const t = v - sp.h.v;
        if (t < 0 || t > sp.life) continue;
        const p = sp.h.p;
        const x = p[0] + sp.vx * t, y = p[1] + sp.vy * t - 4.9 * t * t, z = p[2] + sp.vz * t;
        const a = 1 - t / sp.life;
        glows.add(x, y, z, 4 + 3 * a, 2.6 * a, 1.2 * a, 0.35 * a);
      }
      // ---- the far hits beyond the mountain: a glow behind the ridge ----
      for (const h of FAR_HITS) {
        const t = v - h.v;
        if (t < 0 || t > 6) continue;
        const fl = Math.exp(-t / 0.5);
        glows.add(h.p[0], 400 + t * 120, h.p[2], 2400 * h.size * (0.6 + 0.4 * fl), 2.2 * fl + 0.25, 1.1 * fl + 0.08, 0.4 * fl + 0.02);
        flashAt([h.p[0], 2000, h.p[2]], 1.6 * fl * h.size, 1.0, 0.6, 0.35);
      }
      // ---- the hard rain on the hills and the shore behind the city ----
      for (const g of GROUND_HITS) {
        const t = v - g.v;
        if (t < -1.6) continue;
        const p = g.p;
        if (t < 0) {
          // its streak, the last 1.6 s
          const u = 1 + t / 1.6, L = 24000, d = [-0.42, -0.86, 0.29];
          const head = [p[0] - d[0] * L * (1 - u), p[1] - d[1] * L * (1 - u), p[2] - d[2] * L * (1 - u)];
          const tail = [p[0] - d[0] * L * Math.min(1, 1.5 - u), p[1] - d[1] * L * Math.min(1, 1.5 - u), p[2] - d[2] * L * Math.min(1, 1.5 - u)];
          const I = smooth(0, 0.3, u) * 2.5 * g.size;
          streaks.add(head, tail, 2.5 * W, 2.4 * I, 1.5 * I, 0.7 * I);
          glows.add(head[0], head[1], head[2], 40 * g.size, 2.4 * I, 1.6 * I, 0.9 * I);
          continue;
        }
        const fl = Math.exp(-t / 0.3);
        glows.add(p[0], p[1] + 20, p[2], (200 * fl + 40) * g.size, 4 * fl + 0.6, 2.4 * fl + 0.25, 1 * fl + 0.06);
        flashAt(p, 1.2 * fl * g.size, 1, 0.65, 0.4);
        fire.add(p[0], p[1], p[2], 50 * g.size, 70 * g.size * (0.6 + 0.4 * smooth(0, 1, t)), 1.1, g.seed * 40);
        if (t < 7) smoke.puff(p[0] + t * 8, p[1] + 50 * g.size + t * 18, p[2], (30 + t * 10) * g.size, 0.32 * smooth(0, 0.8, t) * (1 - smooth(4, 7, t)), 0.1, 0.5 * Math.exp(-t / 2), g.seed);
      }
      // ---- the dust rolling across the water toward you ----
      if (s.dustWall > 0) {
        const zf = lerp(-1460, -880, s.dustWall);
        for (const d of DUST) {
          const z = zf - d.dz;
          if (z < -1600) continue;
          const roll = Math.sin(v * 0.6 + d.seed * 20) * 6;
          smoke.puff(d.x + roll, d.y + d.r * 0.5, z, d.r * (1 + 0.3 * s.dustWall), 0.5 * smooth(0, 0.25, s.dustWall) * smooth(-1600, -1450, z) * (1 - 0.5 * d.dz / 420), 0.03, 0.1 * (1 - d.y / 300), d.seed);
        }
      }
      // ---- the giant chunk ----
      if (v > V_CHUNK - 0.05) {
        const u = clamp((v - V_CHUNK) / (V_HIT - V_CHUNK));
        const P = chunkPos(v);
        const dist = Math.hypot(P[0] - cp.x, P[1] - cp.y, P[2] - cp.z);
        chunk.visible = v < V_HIT;
        chunk.position.set(P[0], P[1], P[2]);
        chunk.scale.setScalar(300);
        chunk.rotation.set(v * 0.3, v * 0.2, 0);
        const dir = tmpV.set(CH1[0] - CH0[0], CH1[1] - CH0[1], CH1[2] - CH0[2]).normalize();
        CHU.uDir.value.copy(dir).applyEuler(new THREE.Euler(-v * 0.3, -v * 0.2, 0)); CHU.uTime.value = v;
        const I = 1.2 + 8 * Math.pow(u, 3);
        glows.add(P[0], P[1], P[2], 1500 + 4200 * Math.pow(u, 2), 3.0 * I, 1.9 * I, 1.0 * I);
        glows.add(P[0], P[1], P[2], 700, 6, 4.5, 3);
        // the fire trailing behind it
        const back = [-dir.x, -dir.y, -dir.z];
        for (let k = 0; k < 14; k++) {
          const f = k * 260;
          smoke.puff(P[0] + back[0] * f * 1.5, P[1] + back[1] * f * 1.5, P[2] + back[2] * f * 1.5, 380 + k * 70, 0.6 * (1 - k / 14), 0.15, 2.2 * (1 - k / 14), k * 0.5);
        }
        streaks.add(P, [P[0] + back[0] * 9000, P[1] + back[1] * 9000, P[2] + back[2] * 9000], Math.max(240 / dist, 6 * W), 3 * I, 1.6 * I, 0.7 * I);
        flashAt(P, I * 0.9, 1.0, 0.75, 0.5);
        s.chunkDir = [(P[0] - cp.x) / dist, (P[1] - cp.y) / dist, (P[2] - cp.z) / dist];
        s.chunkI = I * 0.25;
      } else { chunk.visible = false; s.chunkI = 0; }
      flashL.intensity = Math.min(fI, 2.5) * 0.8 + (s.chunk > 0 ? 8 * Math.pow(s.chunk, 3) : 0);
      flashL.position.set(cp.x + fD.x * 200, cp.y + fD.y * 200, cp.z + fD.z * 200);
      flashL.target.position.copy(cp);
      flashL.color.setRGB(1.0, 0.78, 0.55);
      const fk = 0.03 / Math.max(1, (fC.r + fC.g + fC.b) / 9);
      s.flashSky = [fC.r * fk, fC.g * fk, fC.b * fk];
      CU.uFlashC.value.setRGB(fC.r * 0.05, fC.g * 0.05, fC.b * 0.05);
      HU.uFlashC.value.setRGB(fC.r, fC.g, fC.b);

      // ---- the promenade, the boats, the city ----
      promenade.frame(v, s, glows);
      harbor.frame(v, s, glows);
      city.frame(v, s, glows);
      CU.uBlack.value = s.black; CU.uHeat.value = s.heat;
      CU.uAmb.value = 0.04 + 0.5 * (s.skyL - 0.06);
      CU.uLightDir.value.copy(L); CU.uLightC.value.setRGB(0.5, 0.55, 0.65).multiplyScalar(s.skyL);
      CU.uFogC.value.setRGB(0.03, 0.026, 0.032).lerp(tmpC.setRGB(0.32, 0.14, 0.06), clamp(s.heat * 0.4 + s.dustWall * 0.7));
      CU.uFogD.value = 0.00009 + 0.00045 * s.dustWall + 0.0001 * s.rain;
      HU.uFogC.value.copy(CU.uFogC.value); HU.uFogD.value = CU.uFogD.value * 0.8;
      HU.uDeep.value.setRGB(0.004, 0.008, 0.014).multiplyScalar(1 + 2.5 * (s.skyL - 0.06));
      glows.mat.uniforms.uFogD.value = 0.00012 + 0.0004 * s.dustWall;
      FL.uSkyC.value.setRGB(0.02, 0.025, 0.035).multiplyScalar(1 + 2 * s.skyL).add(tmpC.setRGB(0.05, 0.035, 0.02).multiplyScalar(1 - s.lampsOut));

      // ---- the crowd and their phones ----
      let ph = 0;
      PEOPLE.forEach((p, i) => {
        const o = personPose(p, v);
        crowd.pose(i, o);
        const f = phoneOf(p, o);
        if (p.act === 'phone' || p.act === 'phone2') {
          if (f) {
            e4.set(-0.15, f.yaw, 0, 'YXZ'); q4.setFromEuler(e4);
            m4.compose(tmpV.set(f.x, f.y, f.z), q4, one);
            phoneBody.setMatrixAt(ph, m4);
            e4.set(0.15, f.yaw + Math.PI, 0, 'YXZ'); q4.setFromEuler(e4);
            const bx = -Math.sin(f.yaw) * 0.008, bz = -Math.cos(f.yaw) * 0.008;
            m4.compose(tmpV.set(f.x + bx, f.y, f.z + bz), q4, one);
            screen.setMatrixAt(ph, m4);
            if (Math.hypot(f.x - cp.x, f.z - cp.z) < 30) glows.add(f.x - Math.sin(f.yaw) * 0.06, f.y, f.z - Math.cos(f.yaw) * 0.06, 0.22, 0.18, 0.2, 0.28);
          } else { m4.makeScale(0, 0, 0); phoneBody.setMatrixAt(ph, m4); screen.setMatrixAt(ph, m4); }
          ph++;
        }
      });
      crowd.commit();
      const cyaw = cam.rotation.y + Math.PI;
      you.pose(0, { x: cp.x - Math.sin(cyaw) * 0.12, y: deckYAt(cp.z), z: cp.z - Math.cos(cyaw) * 0.12, yaw: cyaw, armR: 1.2, armL: 0.1, look: 0.2 });
      you.commit();
      phoneBody.instanceMatrix.needsUpdate = true; screen.instanceMatrix.needsUpdate = true;
      SCR.uSpread.value = v < V_BURST ? 0 : smooth(V_BURST, 6, v) * (1 - smooth(11, 14, v)) + 0.01;
      SCR.uRing.value = smooth(12.0, 13.4, v); SCR.uRain.value = s.rain;

      fire.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uLight.value.setRGB(0.12, 0.12, 0.14).multiplyScalar(0.5 + 2 * s.skyL * (1 - 0.6 * s.rain)).add(tmpC.setRGB(0.25, 0.12, 0.06).multiplyScalar(s.heat + 0.2));
      smoke.mat.uniforms.uSun.value.copy(L);
      fire.end(); smoke.end(); glows.end(); streaks.end();
    },
  };
}
