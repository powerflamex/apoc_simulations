// The hot ash cloud (pyroclastic flow): ~900 soft billboard puffs riding a front that comes over the far ridge,
// hugs the ground down the slopes, crosses the lake (steam where it hits the water) and rolls over the town to the
// balcony at 300 mph. The base glows red-hot and lights the underside of the billows; the cloud behind the front
// grows taller the older it is. Puffs are sorted back to front every frame (they are see-through at the edges).
import * as THREE from 'three';
import { rng, smooth, clamp } from './util.js';

export function makeFlow(scene, terrainH, lakeD, CAM_Z) {
  const N = 900;
  const R = rng(9090);
  const puffs = [];
  for (let i = 0; i < N; i++) {
    const yf = Math.pow(R(), 1.6);
    puffs.push({ x0: (R() - 0.5) * 5600, dz: Math.pow(R(), 0.8) * 1000, yf, seed: R(), ph: R() * 6.28, sp: 0.5 + R() });
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const cen = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  const aCen = new THREE.InstancedBufferAttribute(cen, 3), aPrm = new THREE.InstancedBufferAttribute(prm, 4);
  aCen.setUsage(THREE.DynamicDrawUsage); aPrm.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iCenter', aCen);
  geo.setAttribute('iPrm', aPrm);
  geo.instanceCount = 0;
  const uniforms = {
    uTime: { value: 0 }, uDay: { value: 1 }, uBolt: { value: 0 }, uHeat: { value: 1 },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0002 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 iCenter; attribute vec4 iPrm;   // size, seed, ground height, steam
      varying vec2 vUv; varying float vH; varying vec4 vPrm; varying float vDist;
      void main() {
        vec4 mv = viewMatrix * vec4(iCenter, 1.0);
        mv.xy += position.xy * iPrm.x;
        vUv = position.xy;
        vH = iCenter.y + position.y * iPrm.x - iPrm.z;
        vPrm = iPrm; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform float uDay; uniform float uBolt; uniform float uHeat;
      uniform vec3 uFogColor; uniform float uFogDensity;
      varying vec2 vUv; varying float vH; varying vec4 vPrm; varying float vDist;
      float hh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.07 + 5.3; a *= 0.5; } return s; }
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUv);
        if (r > 1.0) discard;
        float seed = vPrm.y;
        float n = fbm(vec3(vUv * 2.4 + seed * 17.0, uTime * 0.35 + seed * 9.0));
        float a = smoothstep(1.0, 0.45, r + (n - 0.5) * 0.7);
        if (a < 0.01) discard;
        vec3 N = normalize(vec3(vUv, sqrt(max(1.0 - r * r, 0.0))));
        float hgt = max(vH, 0.0);
        float base = exp(-hgt / 55.0);                       // the red-hot base
        float under = clamp(0.5 - N.y * 0.5, 0.0, 1.0);      // undersides face the glow below
        vec3 col = vec3(0.05, 0.043, 0.038) * (0.5 + 1.0 * n) * (0.4 + 1.2 * uDay);
        col += vec3(1.0, 0.28, 0.05) * uHeat * (base * 1.4 + under * exp(-hgt / 200.0) * 0.3) * (0.4 + 0.8 * n);
        col += vec3(0.55, 0.6, 0.75) * uBolt * 0.25 * (0.4 + 0.6 * N.z);
        // steam where the front hits the lake: pale, lit orange from below
        col = mix(col, vec3(0.2, 0.18, 0.16) * (0.35 + n) + vec3(0.9, 0.35, 0.1) * under * 0.35 * uHeat, vPrm.w * 0.6);
        float fog = 1.0 - exp(-vDist * uFogDensity);
        col = mix(col, uFogColor, fog * (1.0 - 0.6 * base));
        gl_FragColor = vec4(col, a * 0.93);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  // the front is not a straight line: lobes run ahead down the low ground
  const lead = (x) => 130 * Math.sin(x / 410 + 1.3) + 70 * Math.sin(x / 170 + 4.1) + 40 * Math.sin(x / 63 + 2.0);
  const live = [];
  return {
    mesh, uniforms,
    frame(t, s, camera) {
      uniforms.uTime.value = t;
      live.length = 0;
      if (s.flowOn <= 0) { geo.instanceCount = 0; return; }
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (let i = 0; i < N; i++) {
        const p = puffs[i];
        let z = s.flowZ + lead(p.x0) - p.dz;
        if (z > CAM_Z + 40) continue;                       // never behind the camera
        if (z < -7000) continue;
        const x = p.x0 + 35 * Math.sin(t * 0.35 * p.sp + p.ph);
        const g = Math.max(terrainH(x, z), 0);
        const tall = 160 + p.dz * 1.3;                       // older cloud billows higher
        const size = (70 + 220 * p.yf + p.dz * 0.16) * (0.85 + 0.3 * p.seed);
        let y = g + size * 0.45 + p.yf * tall + 18 * Math.sin(t * 0.6 * p.sp + p.ph * 2);
        z += 20 * Math.sin(t * 0.5 * p.sp + p.ph);
        const steam = lakeD(x, z) < 0.98 && p.dz < 450 ? smooth(450, 120, p.dz) : 0;
        const d2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
        live.push({ x, y, z, g, size, seed: p.seed, steam, d2 });
      }
      live.sort((a, b) => b.d2 - a.d2);
      for (let k = 0; k < live.length; k++) {
        const q = live[k];
        cen[k * 3] = q.x; cen[k * 3 + 1] = q.y; cen[k * 3 + 2] = q.z;
        prm[k * 4] = q.size; prm[k * 4 + 1] = q.seed; prm[k * 4 + 2] = q.g; prm[k * 4 + 3] = q.steam;
      }
      geo.instanceCount = live.length;
      aCen.needsUpdate = aPrm.needsUpdate = true;
      uniforms.uDay.value = s.day;
      uniforms.uBolt.value = s.bolt;
      uniforms.uHeat.value = clamp(s.flowOn);
    },
  };
}
