// What happens to everything on Earth, shared by every material: snow settling on it (uSnow: up-facing surfaces
// first), the light of a far flash or the black hole's disk (uFxDir/uFxCol, on top of the scene's own lights), and
// at the end the evaporation (uDissolve): the surface breaks up into bright crumbs that wink out, until nothing is left.
//   patch(mat, key, opts) adds all of it to a MeshStandardMaterial; FXU are the uniforms (one set for the whole scene).
//   opts.color / opts.emissive: extra GLSL run before the snow (may set diffuseColor) and added to the glow (may add
//   to totalEmissiveRadiance; `fxGlow` is a vec3 the color code can fill); opts.pars: extra declarations;
//   opts.vpars / opts.vcode: extra vertex declarations and code (after begin_vertex); opts.uniforms: extra uniforms; opts.grain: break up flat colours with a little noise (hills, rock).
import * as THREE from 'three';

export const FXU = {
  uSnow: { value: 0 }, uDissolve: { value: 0 }, uFxDir: { value: new THREE.Vector3(0, 1, 0) }, uFxCol: { value: new THREE.Color(0, 0, 0) },
  uTime: { value: 0 }, uLit: { value: 1 },
};

export const NOISE_GLSL = /* glsl */ `
float fxh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float fxh2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fxn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxh(i), fxh(i + vec3(1,0,0)), f.x), mix(fxh(i + vec3(0,1,0)), fxh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fxh(i + vec3(0,0,1)), fxh(i + vec3(1,0,1)), f.x), mix(fxh(i + vec3(0,1,1)), fxh(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// k: 0..1 how far the evaporation has gone; returns how much of the surface is left (0 = gone) and the glow at its
// crumbling edge
export const DISSOLVE_GLSL = /* glsl */ `
vec2 fxDissolve(vec3 wp, float k, float scale) {
  if (k <= 0.0) return vec2(1.0, 0.0);
  float n = fxn(wp * scale) * 0.6 + fxn(wp * scale * 4.3 + 7.0) * 0.4;
  float th = k * 1.25 - 0.1;
  float left = step(th, n);
  float edge = (1.0 - smoothstep(0.0, 0.06, n - th)) * left;
  return vec2(left, edge);
}
`;

export function patch(mat, key, { scale = 0.35, snowSide = 0.25, color = '', emissive = '', pars = '', vpars = '', vcode = '', uniforms = {}, grain = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FXU, uniforms);
    shader.vertexShader = 'varying vec3 vFxW; varying vec3 vFxN;\n' + vpars + '\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${vcode}`).replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      #ifdef USE_INSTANCING
        vFxW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vFxN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
      #else
        vFxW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vFxN = normalize(mat3(modelMatrix) * objectNormal);
      #endif`);
    shader.fragmentShader = `uniform float uSnow; uniform float uDissolve; uniform vec3 uFxDir; uniform vec3 uFxCol; uniform float uTime; uniform float uLit;
      varying vec3 vFxW; varying vec3 vFxN;\n${NOISE_GLSL}${DISSOLVE_GLSL}${pars}
` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 fxD = fxDissolve(vFxW, uDissolve, ${scale.toFixed(3)});
      if (fxD.x < 0.5) discard;
      vec3 fxGlow = vec3(0.0);
      ${grain ? 'vec3 gq = vec3(0.8 * vFxW.x + 0.6 * vFxW.z, vFxW.y * 0.9 + 0.3 * vFxW.x, 0.8 * vFxW.z - 0.6 * vFxW.x); diffuseColor.rgb *= (0.75 + 0.5 * fxn(gq * 0.21)) * (0.85 + 0.3 * fxn(gq * 1.9 + 3.0));' : ''}
      ${color}
      {
        float up = smoothstep(0.25, 0.75, vFxN.y);
        float cover = uSnow * (up + ${snowSide.toFixed(3)} * (1.0 - up)) * (0.8 + 0.2 * fxn(vFxW * 1.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.97), clamp(cover, 0.0, 1.0));
        fxGlow *= 1.0 - clamp(cover * 1.2, 0.0, 1.0) * step(0.5, uSnow);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * uFxCol * max(dot(normalize(vFxN), uFxDir), 0.0) * 0.32;
      totalEmissiveRadiance += vec3(0.55, 0.75, 1.0) * fxD.y * 3.0 * exp(-length(vFxW - cameraPosition) / 350.0);
      totalEmissiveRadiance += fxGlow;
      ${emissive}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
