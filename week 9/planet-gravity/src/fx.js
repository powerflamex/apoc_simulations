// What each planet does to you, the chair and the glass, one shared patch for their standard materials:
// uScorch browns the chair's cloth (Venus), uDust coats the tops red (Mars), uFrost grows white rime (Pluto),
// uMelt slumps the chair's plastic (Mercury; only materials patched with melt = true), uWet darkens nothing yet.
export const FX = {
  uFrost: { value: 0 }, uDust: { value: 0 }, uScorch: { value: 0 }, uMelt: { value: 0 }, uHeat: { value: 0 }, uBurn: { value: 0 },
};

const GLSL = /* glsl */ `
uniform float uFrost; uniform float uDust; uniform float uScorch; uniform float uMelt; uniform float uHeat; uniform float uBurn;
varying vec3 vFxN; varying vec3 vFxW;
float fxh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float fxn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxh(i), fxh(i + vec3(1,0,0)), f.x), mix(fxh(i + vec3(0,1,0)), fxh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fxh(i + vec3(0,0,1)), fxh(i + vec3(1,0,1)), f.x), mix(fxh(i + vec3(0,1,1)), fxh(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 applyFX(vec3 c, float scorchable) {
  float up = clamp(vFxN.y * 0.5 + 0.5, 0.0, 1.0);
  float n = fxn(vFxW * 38.0) * 0.6 + fxn(vFxW * 140.0) * 0.4;
  c = mix(c, c * vec3(0.22, 0.13, 0.07), scorchable * smoothstep(0.25, 0.75, n * 0.8 + uScorch * 1.1 - 0.45) * step(0.001, uScorch));
  c = mix(c, vec3(0.6, 0.27, 0.12), uDust * smoothstep(0.15, 0.85, up + 0.4 * n - 0.15));
  c = mix(c, vec3(0.88, 0.94, 1.0), smoothstep(0.0, 0.35, up * 0.5 + n * 0.5 + uFrost * 1.2 - 0.95));
  return c;
}
`;

const VERT_MELT = /* glsl */ `
  {
    // the plastic softens and runs: everything sinks toward the ground and spreads out into a puddle (m = 1)
    float m = uMelt;
    float y0 = transformed.y;
    float k = pow(m, 1.3);
    float spread = 1.0 + 0.9 * k * (1.0 - smoothstep(0.0, 0.9, y0)) + 0.35 * k;
    transformed.x *= spread;
    transformed.z = transformed.z * (1.0 + 0.5 * k) + 0.06 * k * sin(transformed.x * 9.0);
    transformed.y = mix(y0, 0.015 + 0.04 * y0, k) - 0.03 * m * (1.0 - k) * sin(transformed.x * 23.0 + transformed.z * 17.0) * smoothstep(0.05, 0.3, y0);
  }
`;

// patch a MeshStandardMaterial; `prev` is an onBeforeCompile already on it (run first)
export function patchFX(mat, key, { scorch = 0, melt = false, prev = null } = {}) {
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, FX);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uMelt; varying vec3 vFxN; varying vec3 vFxW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${melt ? VERT_MELT : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 fw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fw = instanceMatrix * fw;
          #endif
          fw = modelMatrix * fw;
          vFxW = fw.xyz;
          vFxN = normalize(mat3(modelMatrix) * objectNormal);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL.replace('uniform float uMelt;', '')}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${scorch > 0.95 ? 'if (uBurn > 0.0 && fxn(vFxW * 9.0) * 0.65 + fxn(vFxW * 31.0) * 0.35 < uBurn) discard;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb = applyFX(diffuseColor.rgb, ${scorch.toFixed(2)});`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // Venus: a dull red heat glow, patchy; the burning edges of the cloth glow orange
          float hn = fxn(vFxW * 5.0);
          totalEmissiveRadiance += vec3(1.0, 0.22, 0.04) * uHeat * (0.7 + 0.3 * hn) * 0.8;
          ${scorch > 0.95 ? 'float edge = fxn(vFxW * 9.0) * 0.65 + fxn(vFxW * 31.0) * 0.35 - uBurn; totalEmissiveRadiance += vec3(1.5, 0.55, 0.08) * smoothstep(0.035, 0.0, edge) * step(0.001, uBurn) * 1.4;' : ''}
        }`);
  };
  mat.customProgramCacheKey = () => `fx-${key}`;
  return mat;
}
