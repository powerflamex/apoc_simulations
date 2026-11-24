// Shared shader bits: noise, and the end of the video (from 1 trillion x): everything near you stretched along the field
// toward you and coming apart into glowing threads (atoms squeezed into needles). One patch for every material:
//   stretchy(material, key)  pulls its vertices toward you (more the nearer, ragged), lights them blue-white along the
//   stretch and eats them away; FU.uStretch 0..1 (timeline.js stretchAt) drives it, FU.uReach how far out it has got.
import * as THREE from 'three';

export const FU = {
  uV: { value: 0 }, uStretch: { value: 0 }, uReach: { value: 10 }, uYou: { value: new THREE.Vector3(0, 1.0, 0) }, uYS: { value: new THREE.Vector2(540, 960) },
};

export const NOISE_GLSL = /* glsl */ `
float hh2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float nn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh2(i), hh2(i + vec2(1, 0)), f.x), mix(hh2(i + vec2(0, 1)), hh2(i + vec2(1, 1)), f.x), f.y); }
float hh3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float nn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hh3(i), hh3(i + vec3(1,0,0)), f.x), mix(hh3(i + vec3(0,1,0)), hh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hh3(i + vec3(0,0,1)), hh3(i + vec3(1,0,1)), f.x), mix(hh3(i + vec3(0,1,1)), hh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fb3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * nn3(p); p = p * 2.03 + 3.1; a *= 0.5; } return s; }
`;

const VPARS = /* glsl */ `
uniform float uStretch; uniform float uReach; uniform vec3 uSYou; uniform float uSV;
varying float vStr; varying vec3 vStrW;
float sh3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
`;
// replaces project_vertex: the world position is pulled toward you before it's projected
const VPROJ = /* glsl */ `
  vec4 sw = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
  sw = batchingMatrix * sw;
  #endif
  #ifdef USE_INSTANCING
  sw = instanceMatrix * sw;
  #endif
  sw = modelMatrix * sw;
  {
    vec3 to = uSYou - sw.xyz;
    float d = length(to);
    // how far gone this point is: the front runs out from you; ragged, so things come apart in threads
    // (smooth, not cell noise: cell noise tore the surfaces into square blocks that read as a glitch)
    float n = 0.5 + 0.25 * sin(dot(sw.xyz, vec3(0.41, 0.23, 0.37)) + sh3(vec3(7.0)) * 6.0) + 0.25 * sin(dot(sw.xyz, vec3(-0.13, 0.31, 0.17)) * 2.3);
    // (not right on you: the things stuck to you stay dark, so you stand out against the light)
    float k = uStretch * smoothstep(uReach, uReach * 0.35, d) * (0.35 + 0.65 * n) * smoothstep(1.2, 3.0, d);
    vStr = k; vStrW = sw.xyz;
    // drawn in toward you, the near side most; the whole thing squeezed thin across the pull
    float pull = d * (1.0 - exp(-2.2 * k)) * 0.85;
    vec3 dir = to / max(d, 1e-3);
    sw.xyz += dir * pull;
    vec3 side = sw.xyz - uSYou; side -= dir * dot(side, dir);
    sw.xyz -= side * 0.55 * k;
  }
  vec4 mvPosition = viewMatrix * sw;
  gl_Position = projectionMatrix * mvPosition;
`;
const FPARS = /* glsl */ `
uniform float uStretch; uniform float uSV; uniform vec2 uSYS;
varying float vStr; varying vec3 vStrW;
float fh1(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
float fh3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
`;
const FEM = /* glsl */ `
  if (vStr > 0.001) {
    // everything breaks into long thin needles of blue-white light, all pointing at you (radial strips round where you
    // are on screen), broken into dashes that stream in toward you; thinner and sparser as the stretch grows
    vec2 q = gl_FragCoord.xy - uSYS;
    float rr = length(q), an = atan(q.y, q.x);
    float ga = an / 6.28318 * 360.0, ca = floor(ga), fa = fract(ga) - 0.5;
    float h = fh1(ca), h2 = fh1(ca + 17.3);
    float wid = mix(0.5, 0.12 + 0.16 * h2, smoothstep(0.02, 0.45, vStr));
    float lr = log(max(rr, 1.0)) * (2.5 + 3.0 * h2) + uSV * (1.6 + 2.4 * h) + h * 20.0;
    float seg = floor(lr), fs = fract(lr);
    float hs = fh1(ca * 7.13 + seg * 1.37);
    if (abs(fa) > wid || hs < vStr * 0.75 - 0.05 || fs > 1.0 - 0.45 * smoothstep(0.1, 0.7, vStr)) discard;
    totalEmissiveRadiance += vec3(0.6, 0.75, 1.2) * vStr * (0.6 + 1.8 * smoothstep(0.25, 0.85, vStr)) * (1.0 - 0.6 * abs(fa) / wid);
  }
`;

export function stretchy(m, key) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, { uStretch: FU.uStretch, uReach: FU.uReach, uSYou: FU.uYou, uSV: FU.uV, uSYS: FU.uYS });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${VPARS}`)
      .replace('#include <project_vertex>', VPROJ);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FPARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FEM}`);
  };
  const k0 = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => `str-${key}-${k0}`;
  return m;
}
