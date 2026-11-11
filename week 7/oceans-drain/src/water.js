// The sea that is left: a flat sheet at the current level over the same grid as the seabed, so it knows how deep it is
// everywhere (aH = the seabed's height). Clear turquoise over the shallows, deep blue beyond, a foam line where it meets
// the ground, and streaks of foam racing away from you: it is running out.
import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';
import { GU } from './ground.js';

export const WU = { uFlow: { value: 1 }, uPx: { value: 0.0006 }, uFlowDir: { value: new THREE.Vector2(0, -1) }, uFoam: { value: 1 } };

const vert = /* glsl */ `
attribute float aH; uniform float uLevel; varying vec3 vWP; varying float vH;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y = uLevel;
  vWP = wp.xyz; vH = aH;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const frag = /* glsl */ `
precision highp float;
varying vec3 vWP; varying float vH;
uniform float uTime; uniform float uLevel; uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo;
uniform float uFlow; uniform float uPx; uniform vec2 uFlowDir; uniform float uFoam;
${NOISE_GLSL}
vec2 ngrad(vec2 q, float e) { return vec2(n2(q + vec2(e, 0.0)) - n2(q - vec2(e, 0.0)), n2(q + vec2(0.0, e)) - n2(q - vec2(0.0, e))); }
vec3 waveN(vec2 p, float px) {
  vec2 g = vec2(0.0);
  // small travelling waves (each faded out before it is smaller than a pixel)...
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float L = 8.0 * pow(0.62, fi);
    float a = 0.03 * L * (1.0 + 0.3 * sin(fi * 7.1));
    vec2 dir = normalize(uFlowDir * 0.6 + (vec2(h2(vec2(fi, 9.1)), h2(vec2(fi, 3.3))) - 0.5) * vec2(2.4, 1.6));
    float k = 6.2832 / L;
    float w = sqrt(9.81 * k) * (1.0 + uFlow);
    float fade = 1.0 - smoothstep(L * 0.06, L * 0.25, px);
    g += dir * cos(dot(p, dir) * k - w * uTime + fi * 1.7) * a * k * fade;
  }
  // ...and the long swells as drifting noise: a few long sine waves always read as a lattice from above
  vec2 drift = uFlowDir * uTime * (1.0 + uFlow);
  g += ngrad(p * 0.085 - drift * 0.2, 0.4) * 0.5 * (1.0 - smoothstep(3.0, 12.0, px));
  g += ngrad(p * 0.021 + 3.0 - drift * 0.05, 0.4) * 0.55 * (1.0 - smoothstep(12.0, 50.0, px));
  return normalize(vec3(-g.x, 1.0, -g.y));
}
void main() {
  float depth = uLevel - vH;
  if (depth < 0.0) discard;
  vec2 p = vWP.xz;
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP - cameraPosition);
  // (the size of a pixel on the water, along the line of sight: long at grazing angles, so far waves fade out instead of flickering)
  float px = uPx * dist / max(abs(V.y), 0.02);
  // (crests bent by a slow noise, or a handful of waves reads as a lattice from above)
  vec2 pw = p + 7.0 * vec2(n2(p * 0.021), n2(p * 0.021 + 31.7)) + 1.5 * vec2(n2(p * 0.13 + 5.0), n2(p * 0.13 + 17.0));
  vec3 N = waveN(pw, px);
  vec3 R = reflect(V, N); R.y = abs(R.y);
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.35, R.y));
  vec3 deep = vec3(0.012, 0.13, 0.33), shallow = vec3(0.05, 0.62, 0.66), sandy = vec3(0.45, 0.78, 0.66);
  vec3 body = mix(sandy, shallow, smoothstep(0.05, 1.2, depth));
  body = mix(body, deep, smoothstep(1.5, 12.0, depth));
  vec3 col = mix(body, sky, F * 0.75);
  float ca = acos(clamp(dot(R, uSun), -1.0, 1.0));
  col += vec3(1.0, 0.96, 0.88) * exp(-pow(ca / 0.05, 2.0)) * 0.9;
  // foam: along the edge, and in long streaks dragged the way the water runs
  vec2 q = vec2(dot(p, vec2(-uFlowDir.y, uFlowDir.x)), dot(p, uFlowDir));
  float streak = fbm2(vec2(q.x * 0.5, q.y * 0.06 - uTime * (0.5 + 1.6 * uFlow)));
  float streaks = smoothstep(0.56, 0.74, streak) * uFlow * smoothstep(8.0, 0.4, depth) * smoothstep(1.2, 0.25, px);
  float edge = smoothstep(0.5, 0.0, depth) * mix(0.55 + 0.45 * n2(p * 0.6 + vec2(0.0, uTime * 2.0)), 0.75, smoothstep(0.3, 1.5, px));
  float foam = clamp(edge + streaks * 0.8, 0.0, 1.0) * uFoam;
  col = mix(col, vec3(0.93, 0.96, 0.97), foam);
  float a = smoothstep(0.0, 0.1, depth) * mix(0.55, 1.0, smoothstep(0.1, 1.5, depth));
  a = max(a, foam * smoothstep(0.0, 0.04, depth));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeWater(geo) {
  const mat = new THREE.ShaderMaterial({ uniforms: { ...GU, ...WU }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}
