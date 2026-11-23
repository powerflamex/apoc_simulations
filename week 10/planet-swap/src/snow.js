// The snow that piles up on the beach (Jupiter's place: water and dry-ice snow; Pluto's: the air itself, frozen):
// one surface laid over the sand and the frozen sea, raised uDepth metres (drifting in low ridges), patchy while it is
// only a dusting. Pluto's liquid air first pools on it in glossy pale-blue sheets (uLiquid); the frozen air then piles
// up over everyone, and at the very end over the lens.
import * as THREE from 'three';
import { groundY, CAM0 } from './layout.js';

export const SU = { uSpark: { value: 0.4 }, uDepth: { value: 0 }, uLiquid: { value: 0 }, uT: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } };

export function makeSnow(scene) {
  const NR = 260, NA = 420, R0 = 0.4, R1 = 9000;
  const n = (NR + 1) * NA + 1;
  const pos = new Float32Array(n * 3), base = new Float32Array(n);
  let k = 0;
  for (let i = 0; i <= NR; i++) {
    const r = R0 * Math.pow(R1 / R0, i / NR);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const x = CAM0.x + Math.sin(a) * r, z = CAM0.z - Math.cos(a) * r;
      base[k / 3] = Math.max(groundY(x), 0.12);
      pos[k++] = x; pos[k++] = 0; pos[k++] = z;
    }
  }
  const C0 = (NR + 1) * NA;
  pos[C0 * 3] = CAM0.x; pos[C0 * 3 + 2] = CAM0.z; base[C0] = Math.max(groundY(CAM0.x), 0.12);
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
    idx.push(a, b, c, b, d, c);
  }
  for (let j = 0; j < NA; j++) idx.push(C0, (j + 1) % NA, j);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  const NOISE = /* glsl */ `
    float sh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float sn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(sh2(i), sh2(i + vec2(1, 0)), f.x), mix(sh2(i + vec2(0, 1)), sh2(i + vec2(1, 1)), f.x), f.y); }
    float drift(vec2 p) { return sn2(p * 0.09) * 0.55 + sn2(p * 0.31 + 7.0) * 0.3 + sn2(p * 1.3 + 3.0) * 0.15; }`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aBase; uniform float uDepth; varying vec3 vSW; ${NOISE}`)
      .replace('#include <beginnormal_vertex>', `
        // the drifts' height and slope (the normal comes first in the vertex shader)
        float snowY = aBase + uDepth * (0.78 + 0.44 * drift(position.xz));
        float sE = 0.6;
        float sHx = uDepth * 0.44 * (drift(position.xz + vec2(sE, 0.0)) - drift(position.xz - vec2(sE, 0.0))) / (2.0 * sE);
        float sHz = uDepth * 0.44 * (drift(position.xz + vec2(0.0, sE)) - drift(position.xz - vec2(0.0, sE))) / (2.0 * sE);
        vec3 objectNormal = normalize(vec3(-sHx, 1.0, -sHz));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y = snowY;
        vSW = vec3(position.x, snowY, position.z);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uDepth; uniform float uLiquid; uniform float uT; uniform float uSpark; uniform vec3 uTint; varying vec3 vSW; ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float liq = 0.0;
        {
          // a dusting is patchy; it closes up as it deepens
          float cov = smoothstep(0.0, 0.12, uDepth);
          float pn = sn2(vSW.xz * 1.7) * 0.6 + sn2(vSW.xz * 6.0) * 0.4;
          if (pn > cov * 1.25) discard;
          vec3 sc = mix(vec3(0.86, 0.9, 0.97), vec3(1.0), sn2(vSW.xz * 3.0));
          diffuseColor.rgb = sc * uTint;
          liq = uLiquid * smoothstep(0.35, 0.6, sn2(vSW.xz * 0.12) * 0.7 + sn2(vSW.xz * 0.6) * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.66, 0.85), liq * 0.75);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, liq);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // glints: single sparkling grains
          vec2 g = floor(vSW.xz * 24.0);
          float s = sh2(g + floor(uT * 3.0) * 0.0);
          float tw = step(0.993, s) * (0.5 + 0.5 * sin(uT * 6.0 + s * 80.0));
          totalEmissiveRadiance += vec3(1.0, 1.0, 1.05) * tw * uSpark * (1.0 - liq);
        }`);
  };
  mat.customProgramCacheKey = () => 'snow';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, u: SU };
}
