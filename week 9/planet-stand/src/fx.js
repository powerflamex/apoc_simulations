// What each planet does to you, the chair and the glass, one shared patch for their standard materials:
// uScorch browns the chair's cloth (Venus), uDust coats the tops red (Mars), uFrost grows white rime (Pluto),
// uMelt slumps the chair's plastic (Mercury; only materials patched with melt = true), uWet darkens nothing yet.
export const FX = {
  uFrost: { value: 0 }, uDust: { value: 0 }, uScorch: { value: 0 }, uMelt: { value: 0 },
};

const GLSL = /* glsl */ `
uniform float uFrost; uniform float uDust; uniform float uScorch; uniform float uMelt;
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
    // the plastic softens: it sinks, the legs splay and bow, drips hang off the arms
    float m = uMelt;
    float y0 = transformed.y;
    transformed.y = y0 * (1.0 - 0.52 * m) - 0.02 * m * sin(transformed.x * 23.0 + transformed.z * 17.0) * smoothstep(0.05, 0.3, y0);
    transformed.x *= 1.0 + 0.22 * m * (1.0 - smoothstep(0.0, 0.4, y0));
    transformed.z += 0.05 * m * sin(transformed.x * 9.0) * (1.0 - smoothstep(0.0, 0.4, y0));
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
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb = applyFX(diffuseColor.rgb, ${scorch.toFixed(2)});`);
  };
  mat.customProgramCacheKey = () => `fx-${key}`;
  return mat;
}
