// The ground, one mesh for every place with a surface: a polar grid round the chair (fine near you, coarse far off),
// shaped and coloured per place in its shader (uK: 0 Venus, 1 Mars, 2 Mercury, 3 Titan, 6 Pluto, 7 Earth).
//   Venus: flat cracked basalt slabs (as in Venera 13's photos), low hills far off
//   Mars: rust sand with ripples and dark pebbles, a mountain range on the horizon
//   Mercury: grey dust pocked with craters, crater rims on the horizon, black shadows
//   Titan: orange-brown sand strewn with rounded ice pebbles (Huygens), a methane lake from 14 m in front of you
//   Pluto: nitrogen-ice plain broken into cells (Sputnik Planitia), red-brown tholin patches, ice mountains far off
//   Earth: dry and wet sand down to the sea
// The flat area under the chair is kept level; the water (Titan's lake, Earth's sea) is a flat level with a sky sheen.
import * as THREE from 'three';
import { NOISE2 } from './sky.js';

export const GU = {
  uK: { value: 0 }, uMount: { value: 100 }, uT: { value: 0 },
  uWaterY: { value: -1e4 }, uReflK: { value: 1 }, uWaterCol: { value: new THREE.Color() }, uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() },
  uSunD: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
};

const HEIGHT = /* glsl */ `
uniform float uK; uniform float uMount; uniform float uWaterY;
float ridged(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * (1.0 - abs(n2(p) * 2.0 - 1.0)); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; } return s; }
// craters on a grid: a bowl with a raised rim
float craters(vec2 p, float cell) {
  vec2 g = floor(p / cell); float s = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = g + vec2(x, y);
    float r = h12(c);
    if (r < 0.55) continue;
    vec2 cc = (c + 0.2 + 0.6 * vec2(h12(c + 1.3), h12(c + 7.7))) * cell;
    float R = cell * (0.12 + 0.3 * h12(c + 4.4));
    float d = length(p - cc) / R;
    s += (smoothstep(1.25, 1.0, d) * smoothstep(0.75, 1.0, d) * 0.25 - smoothstep(1.0, 0.0, d) * 0.55) * R * 0.35;
  }
  return s;
}
float groundH(vec2 p) {
  float r = length(p);
  float k = uK;
  float far = smoothstep(120.0, 900.0, r);
  float mid = smoothstep(4.0, 30.0, r);
  float h = 0.0;
  if (k < 0.5) {          // Venus: gentle swells, low hills far off
    h = (fbm2(p / 40.0) - 0.5) * 1.6 * mid + (fbm2(p / 900.0) - 0.4) * uMount * far;
  } else if (k < 1.5) {   // Mars: dunes, a range of mountains ahead-left
    h = (fbm2(p / 25.0) - 0.5) * 1.2 * mid + ridged(p / 1400.0) * uMount * far * (0.5 + 0.8 * smoothstep(-0.6, 0.6, p.x / max(r, 1.0)));
  } else if (k < 2.5) {   // Mercury: craters at every scale
    h = (craters(p, 14.0) * 0.7 + craters(p + 37.0, 60.0)) * mid + craters(p, 420.0) * far * 1.4 + (fbm2(p / 700.0) - 0.4) * uMount * far;
  } else if (k < 3.5) {   // Titan: sand down to the lake shore; hills beyond the lake
    float shore = 7.5 + 2.0 * sin(p.x * 0.13) + 1.5 * fbm2(p / 9.0);
    h = (fbm2(p / 18.0) - 0.5) * 0.35 * mid - 0.12 * max(p.y - shore + 3.0, 0.0);
    h += uMount * smoothstep(1500.0, 2600.0, r) * (0.4 + fbm2(p / 600.0));
  } else if (k < 6.5) {   // Pluto: flat ice plain; jagged mountains of water ice far off
    h = (fbm2(p / 30.0) - 0.5) * 0.4 * mid + pow(ridged(p / 900.0), 2.2) * uMount * smoothstep(700.0, 1600.0, r);
  } else {                // Earth: the beach slopes down into the sea
    h = (fbm2(p / 12.0) - 0.5) * 0.25 * mid - 0.09 * max(p.y - 3.0, 0.0) + (fbm2(p / 900.0) - 0.3) * uMount * smoothstep(1500.0, 3000.0, r);
  }
  h *= smoothstep(2.2, 5.0, r);
  return h;
}
`;

export function makeGround(scene) {
  // polar grid: rings spaced geometrically from 0.15 m to 6 km
  const NA = 220, NR = 150, R0 = 0.15, R1 = 6000;
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let j = 0; j < NR; j++) {
    const r = R0 * Math.pow(R1 / R0, j / (NR - 1));
    for (let i = 0; i < NA; i++) { const a = (i / NA) * Math.PI * 2; pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); }
  }
  for (let i = 0; i < NA; i++) idx.push(0, 1 + i, 1 + ((i + 1) % NA));
  for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA; i++) {
    const a = 1 + j * NA + i, b = 1 + j * NA + ((i + 1) % NA), c = a + NA, d = b + NA;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${NOISE2}\n${HEIGHT}\nvarying vec3 vGW; varying float vGH;`)
      .replace('#include <beginnormal_vertex>', `
        float gh = groundH(position.xz);
        float e = max(0.02, length(position.xz) * 0.004);
        vec3 objectNormal = normalize(vec3(groundH(position.xz - vec2(e, 0.0)) - groundH(position.xz + vec2(e, 0.0)), 2.0 * e,
                                           groundH(position.xz - vec2(0.0, e)) - groundH(position.xz + vec2(0.0, e))));
        float wet = step(gh, uWaterY);
        if (wet > 0.5) objectNormal = vec3(0.0, 1.0, 0.0);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, max(gh, uWaterY), position.z); vGW = transformed; vGH = gh;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE2}\nuniform float uK; uniform float uWaterY; uniform float uT; uniform float uReflK; uniform vec3 uWaterCol, uSkyTop, uSkyHor, uSunD, uSunCol;
        varying vec3 vGW; varying float vGH; float gWater = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vGW.xz;
          float r = length(p);
          float k = uK;
          vec3 c;
          // detail that would shimmer far off fades out with distance
          float near = 1.0 - smoothstep(25.0, 120.0, r);
          if (k < 0.5) {
            vec3 v = vor(p / 1.6);
            float crack = smoothstep(0.0, 0.06, v.x);
            c = mix(vec3(0.26, 0.22, 0.19), vec3(0.4, 0.34, 0.28), v.y) * (0.75 + 0.5 * fbm2(p * 3.0));
            c = mix(c * 0.35, c, mix(1.0, crack, near));
          } else if (k < 1.5) {
            c = vec3(0.62, 0.3, 0.15) * (0.8 + 0.4 * fbm2(p / 6.0));
            c *= 0.9 + 0.1 * sin(p.x * 3.0 + p.y * 1.3 + 2.0 * fbm2(p)) * near;
            vec2 dd = dots(p * 2.2);
            c = mix(c, vec3(0.32, 0.15, 0.08), step(0.86, dd.y) * smoothstep(0.08 + 0.14 * fract(dd.y * 7.0), 0.04 + 0.1 * fract(dd.y * 7.0), dd.x) * near);
          } else if (k < 2.5) {
            c = vec3(0.34, 0.32, 0.3) * (0.78 + 0.4 * fbm2(p / 3.0)) * (0.9 + 0.2 * fbm2(p / 60.0));
            vec2 dd = dots(p * 2.5);
            c = mix(c, vec3(0.28, 0.26, 0.25), step(0.75, dd.y) * smoothstep(0.2, 0.12, dd.x) * near);
          } else if (k < 3.5) {
            c = vec3(0.5, 0.3, 0.13) * (0.8 + 0.35 * fbm2(p / 4.0));
            vec2 dd = dots(p * 3.0);
            float peb = step(0.72, dd.y) * smoothstep(0.08 + 0.16 * fract(dd.y * 11.0), 0.04 + 0.12 * fract(dd.y * 11.0), dd.x);
            c = mix(c, vec3(0.88, 0.8, 0.66), peb * near);
          } else if (k < 6.5) {
            vec3 v = vor(p / 9.0);
            float trough = 1.0 - smoothstep(0.02, 0.12, v.x);
            c = mix(vec3(0.95, 0.9, 0.88), vec3(0.85, 0.82, 0.86), v.y);
            c = mix(c, vec3(0.55, 0.45, 0.42), trough * 0.8);
            float tholin = smoothstep(0.55, 0.75, fbm2(p / 70.0 + 3.0));
            c = mix(c, vec3(0.62, 0.32, 0.18), tholin * 0.85);
            c *= 0.9 + 0.15 * fbm2(p * 2.0);
          } else {
            float wetS = smoothstep(6.5, 9.0, p.y + 1.0 * sin(p.x * 0.3 - uT * 0.8));
            c = mix(vec3(0.92, 0.8, 0.58) * (0.85 + 0.25 * fbm2(p * 2.0)), vec3(0.55, 0.45, 0.3), wetS);
          }
          if (vGH < uWaterY) {
            gWater = 1.0;
            c = uWaterCol;
          }
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.12, gWater);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (gWater > 0.5) {
          // the water: a mirror of the sky (a fresnel blend of its horizon and top), ripples moving
          vec3 V = normalize(cameraPosition - vGW);
          float rip = (fbm2(vGW.xz * vec2(0.6, 1.4) + vec2(uT * 0.4, uT * 0.9)) - 0.5);
          float f = pow(1.0 - max(V.y, 0.0), 4.0);
          vec3 sky = mix(uSkyTop, uSkyHor, 0.55 + 0.4 * f + 0.25 * rip);
          totalEmissiveRadiance += sky * (0.35 + 0.65 * f) * uReflK;
          vec3 R = reflect(-V, normalize(vec3(rip * 0.12, 1.0, rip * 0.05)));
          totalEmissiveRadiance += uSunCol * pow(max(dot(R, uSunD), 0.0), 900.0) * 6.0;
        }`);
  };
  mat.customProgramCacheKey = () => 'ground-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}
