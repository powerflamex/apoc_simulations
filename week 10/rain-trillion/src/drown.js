// Everything under the flood water: one patch for every lit material. Below the water line a surface fades into the
// murky brown-green water with depth (you can see a metre or two down, then nothing), so the street, the cars and
// the lower floors sink out of sight as the level climbs. The water surface itself (water.js) is drawn on top.
//   drownMat(material)          for a plain MeshStandardMaterial
//   drownShader(shader)         inside a material's own onBeforeCompile
import * as THREE from 'three';

export const DW = {
  uLevel: { value: 0 },                                   // the water line (m)
  uMurk: { value: new THREE.Color(0.018, 0.026, 0.022) }, // what deep water looks like from above
  uVis: { value: 1.6 },                                   // m: how far down you can see
  uWet: { value: 1 },                                     // rain-darkened surfaces above the water
};

export function drownShader(shader) {
  Object.assign(shader.uniforms, DW);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vDrownY;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 dwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp;
        #endif
        vDrownY = (modelMatrix * dwp).y;
      }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vDrownY; uniform float uLevel; uniform vec3 uMurk; uniform float uVis; uniform float uWet;')
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      {
        float dd = uLevel - vDrownY;
        if (dd > 0.0) {
          float k = 1.0 - exp(-dd / uVis);
          // a thin bright line just under the surface (light through the rippled top), then murk
          gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.55, 0.72, 0.6), uMurk, k);
        }
      }`);
}

export function drownMat(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); drownShader(sh); };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => key + '|drown';
  return m;
}

// how much a light at height y still shows from above (glows under the water: dimmer, murkier, then gone)
export function underK(y, level) {
  const d = level - y;
  return d <= 0 ? 1 : Math.exp(-d / 1.1) * 0.8;
}
