// The ground: one mesh, a polar grid around the camera (fine near, coarse far, a fan closing the middle), heights from
// layout.groundY, painted in the fragment shader: dry sand with ripples and footprints, darker wet sand by the water,
// the sea floor under it. Each world's weather on top (shared uniforms from heat.js and GU): red Martian dust (uDust),
// rime (uFrost), rain-dark sand (uWetK), and sand streaming downwind in sheets (uStream, Saturn and Neptune).
import * as THREE from 'three';
import { groundY, CAM0 } from './layout.js';
import { H, HEAT_GLSL } from './heat.js';

export const GU = { uTime: { value: 0 }, uStream: { value: 0 }, uWindD: { value: new THREE.Vector2(0, -1) }, uScorchG: { value: 0 } };

export function makeGround(scene) {
  const NR = 420, NA = 600, R0 = 0.6, R1 = 60000;
  const pos = new Float32Array(((NR + 1) * NA + 1) * 3);
  let k = 0;
  for (let i = 0; i <= NR; i++) {
    const r = R0 * Math.pow(R1 / R0, i / NR);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const x = CAM0.x + Math.sin(a) * r, z = CAM0.z - Math.cos(a) * r;
      pos[k++] = x; pos[k++] = groundY(x); pos[k++] = z;
    }
  }
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
    idx.push(a, b, c, b, d, c);
  }
  const C0 = (NR + 1) * NA;
  pos[C0 * 3] = CAM0.x; pos[C0 * 3 + 1] = groundY(CAM0.x); pos[C0 * 3 + 2] = CAM0.z;
  for (let j = 0; j < NA; j++) idx.push(C0, (j + 1) % NA, j);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, H);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${HEAT_GLSL}
        uniform float uTime; uniform float uStream; uniform vec2 uWindD; uniform float uScorchG;
        varying vec3 vWP; varying vec3 vWN;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n21(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        float gRough = 0.92;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float n = fbm2(vWP.xz * 0.35);
          float px = fwidth(vWP.x) + fwidth(vWP.z);
          vec3 sand = vec3(0.86, 0.74, 0.56) * (0.9 + 0.16 * n);
          // footprints and scuffs where the crowd stands, ripples further off (faded where finer than a pixel)
          float fine = 1.0 - smoothstep(0.05, 0.25, px);
          sand *= 1.0 - fine * 0.09 * smoothstep(0.55, 0.8, n21(vWP.xz * 3.3));
          sand *= 0.96 + 0.06 * n21(vWP.xz * 1.3 + 4.0);
          vec3 col = sand;
          float above = vWP.y;
          float wetK = 1.0 - smoothstep(0.0, 0.45, above);
          if (vWP.x < 0.0) col = mix(sand, vec3(0.3, 0.27, 0.22) * (0.85 + 0.25 * n), smoothstep(-0.5, -6.0, vWP.x));
          col = mix(col, col * vec3(0.6, 0.6, 0.64), wetK * 0.8);
          gRough = mix(0.97, 0.86, wetK);
          col *= 1.0 - 0.07 * smoothstep(0.4, 0.0, abs(above - 1.0));     // the tide line
          // sand blown in sheets downwind
          if (uStream > 0.0) {
            vec2 w = normalize(uWindD);
            vec2 q = vec2(dot(vWP.xz, w), dot(vWP.xz, vec2(-w.y, w.x)));
            float st = n21(vec2(q.x * 0.15 - uTime * 9.0, q.y * 1.8)) * 0.6 + n21(vec2(q.x * 0.5 - uTime * 17.0, q.y * 5.0)) * 0.4;
            col *= 1.0 + uStream * (smoothstep(0.45, 0.8, st) * 0.35 - 0.12) * fine;
          }
          col = mix(col, col * vec3(0.92, 0.85, 0.75), uScorchG);
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 nn = normalize(vWN);
          diffuseColor.rgb = dusted(diffuseColor.rgb, nn);
          roughnessFactor = mix(roughnessFactor, 0.6, uWetK);
          // rime: patchy, sparkling, the wet sand frozen grey-white
          float fr = uFrost * (0.7 + 0.3 * fbm2(vWP.xz * 1.7));
          vec3 rime = vec3(0.86, 0.91, 0.97) * (0.92 + 0.12 * n21(vWP.xz * 9.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, rime, fr * 0.85 * step(-0.3, vWP.y));
          roughnessFactor = mix(roughnessFactor, 0.55, fr);
        }`);
  };
  mat.customProgramCacheKey = () => 'weather-ground-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}
