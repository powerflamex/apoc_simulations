// What the heat (and Proxima's cold) does to every surface, one shared patch for the standard materials: a surface facing the Sun heats
// until it glows away as much as it soaks up (σT⁴ = flux · cos), so the sunlit sides go first; it chars (dark) once
// it passes ~600 K and glows (blackbody colour) above ~800 K. uAmbK: the heat that reaches everything later (the air,
// the glow of everything around), so the shady sides follow.
import * as THREE from 'three';

export const H = {
  uSunW: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  uTK: { value: 300 },          // K, a dark surface square to the Sun
  uAmbK: { value: 300 },        // K, everything
  uGlowGain: { value: 1 },      // how bright the glow reads at the current exposure
  uCharK: { value: 1 },         // 0: nothing chars
  uFrost: { value: 0 },         // Proxima: white rime on everything (most on the tops)
  uTKP: { value: 300 },         // the hottest uTK / uAmbK so far: what has charred stays charred
  uAmbKP: { value: 300 },
};

export const HEAT_GLSL = /* glsl */ `
uniform vec3 uSunW; uniform float uTK; uniform float uAmbK; uniform float uGlowGain; uniform float uCharK; uniform float uFrost;
uniform float uTKP; uniform float uAmbKP;
// rime: white-blue, thickest on surfaces facing up
vec3 frosted(vec3 c, vec3 n) { return mix(c, vec3(0.84, 0.9, 0.97), uFrost * (0.3 + 0.55 * clamp(n.y, 0.0, 1.0))); }
// blackbody colour (normalised) for T in K (fit to the Planck locus, 800 K - 12,000 K)
vec3 bbCol(float T) {
  float t = T / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.293 * pow(t - 60.0, -0.1332), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.39 * log(t) - 0.6318, 0.0, 1.0) : clamp(1.1298 * pow(t - 60.0, -0.0755), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432 * log(t - 10.0) - 1.1962, 0.0, 1.0));
  // below ~1,900 K the Planck colour is deep red-orange (the fit above is for lamps); push it red
  vec3 c = vec3(r, g, b);
  c = mix(vec3(1.0, 0.12, 0.0), c, smoothstep(900.0, 2200.0, T));
  return c;
}
// how bright it glows (visible): steep with temperature, then levelling off (the exposure follows the Sun)
float bbI(float T) { return smoothstep(700.0, 1100.0, T) * 0.05 + smoothstep(1000.0, 2400.0, T) * 0.8 + smoothstep(2400.0, 6000.0, T) * 1.6; }
// what the glow looks like on screen: past ~1,500 K it keeps getting hotter, but we hold it at a deep orange-yellow
// (a white-hot world would just be a white frame)
vec3 heatGlow(float T) { float Td = T < 1400.0 ? T : 1400.0 + (T - 1400.0) * 0.07; return bbCol(Td) * bbI(Td) * (1.0 + 0.5 * smoothstep(1400.0, 6000.0, T)); }
// the temperature of a surface with world normal n (sunlit share k: 0 in full shade .. 1)
float surfT(vec3 n, float k) {
  float c = max(dot(n, uSunW), 0.0) * k;
  return pow(pow(uTK, 4.0) * c + pow(uAmbK, 4.0), 0.25);
}
float surfTP(vec3 n, float k) {
  float c = max(dot(n, uSunW), 0.0) * k;
  return pow(pow(uTKP, 4.0) * c + pow(uAmbKP, 4.0), 0.25);
}
`;

// patch a MeshStandardMaterial: char + glow. opts.charCol: what it burns to; opts.burnK: how readily it chars
// (wood/plastic 1, stone/glass 0.4, metal 0.6); opts.glow: glow multiplier
export function patchHeat(mat, key, { charCol = new THREE.Color(0.05, 0.04, 0.035), burnK = 1, glow = 1, prev = null } = {}) {
  const old = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, H);
    shader.uniforms.uCharCol = { value: charCol };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHeatN;')
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        #ifdef USE_INSTANCING
          vHeatN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vHeatN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAT_GLSL}\nuniform vec3 uCharCol; varying vec3 vHeatN;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float Ts = surfT(normalize(vHeatN), 1.0);
          float ch = smoothstep(560.0, ${(900 / burnK).toFixed(1)}, surfTP(normalize(vHeatN), 1.0)) * uCharK;
          diffuseColor.rgb = mix(diffuseColor.rgb, uCharCol, ch);
          diffuseColor.rgb = frosted(diffuseColor.rgb, normalize(vHeatN));
          totalEmissiveRadiance += heatGlow(Ts) * uGlowGain * ${glow.toFixed(2)};
        }`);
  };
  mat.customProgramCacheKey = () => `heat-${key}`;
  return mat;
}
