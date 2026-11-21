// The heat, shared by every module: how hot it is r metres from you (log10 W/m², from timeline.js), what colour a body
// glows at temperature T (a black body: dull red at ~800 K, orange 1,500 K, yellow-white 3,000 K, white 6,000 K, blue-white
// beyond), how bright it reads on screen (an art curve: real glow grows as T^4, far past what a screen can show), and
// the same three in GLSL (HU uniforms, HEAT_GLSL functions) for the shaders.
import * as THREE from 'three';
import { LOG_S, LOG_TB, RS, Q, logQ, logMult, heartAt, WALK_V, PATH_X, Z0 } from './timeline.js';

export const LQ = Object.fromEntries(Object.entries(Q).map(([k, q]) => [k, Math.log10(q)]));
// uniforms every heat shader shares: your heat at your skin (log10 W/m²), where you are, the time
// the counter over time (log10 times hotter, every 0.02 s from -2 s to 50 s) as a lookup, so a shader can tell how hot
// it was when you walked past a spot
const LT0 = -2, LT1 = 50, LTN = 2601;
const ltData = new Float32Array(LTN * 4);
for (let i = 0; i < LTN; i++) ltData[i * 4] = logMult(LT0 + (LT1 - LT0) * i / (LTN - 1));
const ltTex = new THREE.DataTexture(ltData, LTN, 1, THREE.RGBAFormat, THREE.FloatType);
ltTex.minFilter = ltTex.magFilter = THREE.NearestFilter; ltTex.needsUpdate = true;
export const HU = {
  uLQ0: { value: 0 }, uHeart: { value: new THREE.Vector3(PATH_X, 1, Z0) }, uHT: { value: 0 },
  uLT: { value: ltTex }, uWalk: { value: new THREE.Vector3(PATH_X, Z0, WALK_V) },
};
const _hp = {};
export const setHeat = (L, v) => { HU.uLQ0.value = logQ(L, 0); HU.uHT.value = v; heartAt(v, _hp); HU.uHeart.value.set(_hp.x, _hp.y, _hp.z); };

// black-body colour (linear RGB, max channel 1) — Tanner Helland's fit, 1,000-40,000 K, extended down to 600 K
export function bbColor(T, out = new THREE.Color()) {
  const t = Math.min(Math.max(T, 600), 40000) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const f = (x) => Math.pow(Math.min(Math.max(x, 0), 255) / 255, 2.2);
  out.setRGB(f(r), f(g), f(b));
  const m = Math.max(out.r, out.g, out.b);
  return out.multiplyScalar(1 / m);
}
// how bright a body at T glows on screen (0 below ~700 K)
export const glowOf = (T) => {
  const a = Math.min(Math.max((T - 700) / 2300, 0), 1);
  return 3.2 * Math.pow(a, 1.7) + 1.1 * Math.log2(Math.max(T / 3000, 1));
};

export const HEAT_GLSL = /* glsl */ `
uniform float uLQ0; uniform vec3 uHeart; uniform float uHT; uniform sampler2D uLT; uniform vec3 uWalk;
float Lat(float t) { return texture2D(uLT, vec2((clamp(t, ${LT0.toFixed(1)}, ${LT1.toFixed(1)}) - (${LT0.toFixed(1)}) + ${((LT1 - LT0) / (LTN - 1) * 0.5).toFixed(4)}) / ${(LT1 - LT0 + (LT1 - LT0) / (LTN - 1)).toFixed(4)}, 0.5)).r; }
float lqOne(vec3 P, float L, vec3 H) { return ${LOG_S.toFixed(5)} + 4.0 * (${LOG_TB.toFixed(5)} + L) + 2.0 * log(${RS.toFixed(5)} / max(distance(P, H), ${RS.toFixed(5)})) / log(10.0); }
// log10 of the heat (W/m²) at P, remembering how hot it got as you walked past (the most of: now, the moment you were
// level with it, halfway between; timeline.js lqHist does the same)
float lqAt(vec3 P) {
  float a = uLQ0 + 2.0 * log(${RS.toFixed(5)} / max(distance(P, uHeart), ${RS.toFixed(5)})) / log(10.0);
  float tp = clamp((uWalk.y - P.z) / uWalk.z, ${LT0.toFixed(1)}, uHT);
  float tm = 0.5 * (tp + uHT);
  float b = lqOne(P, Lat(tp), vec3(uWalk.x, uHeart.y, uWalk.y - uWalk.z * tp));
  float c = lqOne(P, Lat(tm), vec3(uWalk.x, uHeart.y, uWalk.y - uWalk.z * tm));
  return max(a, max(b, c));
}
// the temperature (K) a surface there settles at, absorbing on one side and glowing from both: (q / 2 sigma)^(1/4)
// (capped where rock boils, ~3,300 K: past that the heat goes into boiling it away, not into heating the surface)
float tSurf(float lq) { return min(pow(10.0, (lq - ${(LOG_S + Math.log10(2)).toFixed(5)}) / 4.0), 3300.0); }
vec3 bbCol(float T) {
  float t = clamp(T, 600.0, 40000.0) / 100.0;
  float r, g, b;
  if (t <= 66.0) { r = 255.0; g = 99.4708025861 * log(t) - 161.1195681661; b = t <= 19.0 ? 0.0 : 138.5177312231 * log(max(t - 10.0, 1.0)) - 305.0447927307; }
  else { r = 329.698727446 * pow(t - 60.0, -0.1332047592); g = 288.1221695283 * pow(t - 60.0, -0.0755148492); b = 255.0; }
  vec3 c = pow(clamp(vec3(r, g, b) / 255.0, 0.0, 1.0), vec3(2.2));
  return c / max(max(c.r, c.g), max(c.b, 1e-4));
}
// (surfaces glow at 60% of this art curve: you stay the brightest thing in the picture)
float glowOf(float T) { float a = clamp((T - 700.0) / 2300.0, 0.0, 1.0); return 0.6 * (3.2 * pow(a, 1.7) + 1.1 * log2(max(T / 3000.0, 1.0))); }
// how far past a threshold (decades of heat), 0 below it
float past(float lq, float thr) { return max(lq - thr, 0.0); }
float hh1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float hh2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float nn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh2(i), hh2(i + vec2(1, 0)), f.x), mix(hh2(i + vec2(0, 1)), hh2(i + vec2(1, 1)), f.x), f.y); }
float hh3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float nn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hh3(i), hh3(i + vec3(1,0,0)), f.x), mix(hh3(i + vec3(0,1,0)), hh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hh3(i + vec3(0,0,1)), hh3(i + vec3(1,0,1)), f.x), mix(hh3(i + vec3(0,1,1)), hh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fb3(vec3 p) { return nn3(p) * 0.55 + nn3(p * 2.13 + 7.1) * 0.3 + nn3(p * 4.7 + 3.3) * 0.15; }
`;
export const LQ_GLSL = Object.entries(LQ).map(([k, v]) => `const float LQ_${k} = ${v.toFixed(4)};`).join('\n');
