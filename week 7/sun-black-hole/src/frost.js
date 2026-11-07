// Frost for every ordinary material (cars, people, lamps, trees, benches, the fountain's stone): where the frost front has
// passed (world z north of uFront) a white-blue coat of rime with glinting crystals, thicker on the tops of things and
// thicker as it gets colder; later the frozen air lies on every upward face like snow.
//   frostify(material, { boost })   boost: an extra { value } uniform (people turn to ice when they freeze)
import * as THREE from 'three';

export const FU = {
  uTime: { value: 0 }, uFront: { value: -1e4 }, uFrost: { value: 0 }, uCover: { value: 0 }, uWet: { value: 0 },
};

export const FROST_GLSL = /* glsl */ `
  float fh13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float fn3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fh13(i), fh13(i + vec3(1,0,0)), f.x), mix(fh13(i + vec3(0,1,0)), fh13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(fh13(i + vec3(0,0,1)), fh13(i + vec3(1,0,1)), f.x), mix(fh13(i + vec3(0,1,1)), fh13(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

let id = 0;
export function frostify(mat, { boost = null, strength = 1, base = 1 } = {}) {
  const B = boost || { value: 0 };
  const key = `frost-${id++}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FU);
    shader.uniforms.uBoost = B;
    shader.uniforms.uStrength = { value: strength };
    shader.uniforms.uBase = { value: base };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFW; varying vec3 vFN;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 fw = vec4(transformed, 1.0);
          vec3 fn = objectNormal;
          #ifdef USE_INSTANCING
            fw = instanceMatrix * fw; fn = mat3(instanceMatrix) * fn;
          #endif
          fw = modelMatrix * fw; vFW = fw.xyz; vFN = normalize(mat3(modelMatrix) * fn);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFW; varying vec3 vFN;
        uniform float uTime; uniform float uFront; uniform float uFrost; uniform float uCover; uniform float uWet; uniform float uBoost; uniform float uStrength; uniform float uBase;
        ${FROST_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float frK, covK;
        {
          vec3 N = normalize(vFN);
          float n = fn3(vFW * 7.0) * 0.6 + fn3(vFW * 23.0) * 0.4;
          float passed = smoothstep(uFront + 1.5, uFront - 5.0, vFW.z);
          float up = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
          frK = clamp((uBase * uFrost * passed * (0.5 + 0.5 * up) * (0.7 + 0.6 * n) + uBoost * passed * (0.75 + 0.25 * n)) * uStrength, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.88, 0.97), frK * 0.82);
          covK = uCover * smoothstep(0.2, 0.7, N.y + 0.25 * n);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), covK);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.5, frK);
        roughnessFactor = mix(roughnessFactor, 0.85, covK);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= 1.0 - frK;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // crystals catching the sun: tiny points that twinkle as you sway
          vec3 c = floor(vFW * 38.0);
          float g = step(0.992, fh13(c)) * (0.5 + 0.5 * sin(uTime * 3.0 + fh13(c + 7.0) * 40.0));
          totalEmissiveRadiance += vec3(1.6, 1.75, 2.0) * g * max(frK, covK) * 0.35;
        }`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
