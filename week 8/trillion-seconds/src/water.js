// The stream that comes back: a ribbon of water down the middle of the new valley (terrain.js), following the river
// as it swings across. Dark green-brown water that mirrors the sky at a glancing angle, with ripples drifting
// downstream (south, toward you and past you on your right).
import * as THREE from 'three';
import { riverX, waterHalfWidth, waterLevel, PATCH } from './terrain.js';
import { CU } from './city.js';

export function makeWater(scene) {
  const Z0 = PATCH.z0 + 20, Z1 = 22, STEP = 1.5;
  const n = Math.ceil((Z1 - Z0) / STEP) + 1;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
  for (let i = 0; i < n; i++) {
    uv.set([0, i * STEP, 1, i * STEP], i * 4);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const nrm = new Float32Array(n * 2 * 3); for (let i = 0; i < n * 2; i++) nrm[i * 3 + 1] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const U = { uT: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0x1e3a34, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uSkyHi: CU.uSkyHi, uSkyLo: CU.uSkyLo, uHaze: CU.uHaze, uHazeD: CU.uHazeD });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW; varying vec2 vRU;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRU = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWW; varying vec2 vRU; uniform float uT; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD;
        float wh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          // ripples drifting downstream (the strip's v runs north to south)
          vec2 q = vec2(vRU.x * 6.0, vRU.y * 0.9 - uT * 2.2);
          float e = 0.05;
          float h0 = wn(q) + 0.5 * wn(q * 2.3 + 4.0);
          float hx = wn(q + vec2(e, 0.0)) + 0.5 * wn((q + vec2(e, 0.0)) * 2.3 + 4.0) - h0;
          float hy = wn(q + vec2(0.0, e)) + 0.5 * wn((q + vec2(0.0, e)) * 2.3 + 4.0) - h0;
          normal = normalize(normal + (viewMatrix * vec4(-hx * 0.9, 0.0, -hy * 0.9, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vWW - cameraPosition);
          float fres = 0.08 + 0.92 * pow(1.0 - abs(V.y), 5.0);
          totalEmissiveRadiance += mix(uSkyLo, uSkyHi, 0.3) * fres * 0.9;
        }`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vWW - cameraPosition) / uHazeD));
        gl_FragColor.a *= smoothstep(0.0, 0.12, min(vRU.x, 1.0 - vRU.x)) * 0.35 + 0.65;`);
  };
  mat.customProgramCacheKey = () => 'ts-water-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = 1;
  scene.add(mesh);
  return {
    frame(v, s) {
      const hw = waterHalfWidth(s);
      mesh.visible = hw > 0.1;
      if (!mesh.visible) return;
      const y = waterLevel(s);
      for (let i = 0; i < n; i++) {
        const z = Z0 + i * STEP, xc = riverX(z, s.meander);
        // (the valley ends behind the camera: the water narrows away there)
        const k = 1 - Math.min(1, Math.max(0, (z - 5) / 12));
        const w = hw * k + 0.01;
        pos.set([xc - w, y, z, xc + w, y, z], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.min(1, (hw - 0.1) / 1.5) * 0.92;
      U.uT.value = v;
    },
  };
}
