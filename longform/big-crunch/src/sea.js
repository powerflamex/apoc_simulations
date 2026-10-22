// The sea: one big plane at the current sea level. It mirrors the sky (uSkyLo near the horizon, uSkyHi above) and
// the Sun (or the streak the Sun paints during a frame) as a glittering path; the waves smooth out into a glassy
// sheet the longer each frame's exposure (uWave); a line of surf where it meets the sea floor; and while the oceans
// boil (uBoil) it churns white and steams.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vWP;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vWP;
uniform float uWave; uniform float uPhase; uniform vec3 uSunA; uniform vec3 uSunB; uniform vec3 uSunCol; uniform float uSunI; uniform float uSpread; uniform float uSunR;
uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uBoil; uniform float uTime; uniform float uLights;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float coastX(float z) { float d = -z; float soft = (d > 300.0 ? d : 10.0 * log(1.0 + exp(d / 10.0))) - 6.931; return -1.3 + 0.18 * soft; }
float arcDist(vec3 v, vec3 A, vec3 B) {
  float dA = acos(clamp(dot(v, A), -1.0, 1.0)), dB = acos(clamp(dot(v, B), -1.0, 1.0));
  vec3 n = cross(A, B);
  float ln = length(n);
  if (ln < 1e-5) return min(dA, dB);
  n /= ln;
  vec3 vp = v - n * dot(v, n);
  if (dot(cross(A, vp), n) >= 0.0 && dot(cross(vp, B), n) >= 0.0) return asin(clamp(abs(dot(v, n)), 0.0, 1.0));
  return min(dA, dB);
}
float bed(float u) { return u > -0.05 ? 0.0 : -3.0 - 0.022 * (-u) - 0.0006 * max(0.0, -u - 6000.0); }
// wave height: a few swells and chop, travelling. f: metres of sea per pixel. Waves smaller than a few pixels are
// left out (they can't be drawn: they came out as speckle that jumped about from frame to frame); their roughness
// goes into a broader glitter path instead (lost, below).
vec3 waveFade(float f) {
  return vec3(1.0 - smoothstep(7.0, 13.0, f), 1.0 - smoothstep(0.8, 1.6, f), 1.0 - smoothstep(0.28, 0.6, f));
}
float wav(vec2 p, vec3 k) {
  float t = uPhase;
  return (0.35 * sin(dot(p, vec2(0.11, 0.21)) + t * 1.1) + 0.25 * sin(dot(p, vec2(-0.17, 0.13)) + t * 1.4)) * k.x
       + 0.18 * (n2(p * 0.35 + vec2(t * 0.3, -t * 0.2)) - 0.5) * 2.0 * k.y + 0.08 * (n2(p * 1.3 - vec2(t * 0.6, t * 0.4)) - 0.5) * 2.0 * k.z;
}
void main() {
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP.xz - cameraPosition.xz);
  float att = 0.7 * uWave * (1.0 - smoothstep(200.0, 4000.0, dist));
  vec2 p = vWP.xz;
  float f = max(length(dFdx(p)), length(dFdy(p)));
  vec3 k = waveFade(f);
  float lost = 1.0 - (0.2 * k.x + 0.45 * k.y + 0.35 * k.z);
  float e = max(0.3 + dist * 0.004, f);
  float h0 = wav(p, k);
  vec3 N = normalize(vec3(-(wav(p + vec2(e, 0.0), k) - h0) / e * att, 1.0, -(wav(p + vec2(0.0, e), k) - h0) / e * att));
  // boiling: bursting bubbles everywhere
  if (uBoil > 0.0) {
    float b = n2(p * 0.8 + uTime * 3.0) * n2(p * 2.3 - uTime * 4.0);
    N = normalize(N + vec3(n2(p * 1.7 + uTime * 5.0) - 0.5, 0.0, n2(p * 1.9 - uTime * 5.0) - 0.5) * uBoil * 1.2);
  }
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float cosT = max(dot(-V, N), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.12, R.y)) * 0.7;
  // the Sun's glitter path (sharper on calm water); a streak sun gives a streak of light
  float sharp = mix(6000.0, mix(900.0, 650.0, lost), uWave);
  float sp = pow(max(cos(arcDist(R, uSunA, uSunB)), 0.0), sharp);
  float norm = pow((2.0 * uSunR) / (uSpread + 2.0 * uSunR), 0.3);
  norm *= 1.0 - 0.15 * lost * uWave;   // (the broader path spreads the same light)
  vec3 deep = vec3(0.01, 0.03, 0.045) * (0.5 + 0.5 * uSkyLo.r);
  vec3 col = mix(deep, sky, F) + uSunCol * sp * uSunI * norm * 0.6 * (0.5 + 0.5 * uWave);
  // the city's lights rippling on the water at night (a warm glow toward the shore on the right)
  col += vec3(1.0, 0.7, 0.4) * uLights * 0.05 * smoothstep(-0.2, 0.25, V.x) * (0.6 + 0.8 * n2(p * vec2(0.6, 0.05) + uPhase * 0.2)) * (1.0 - smoothstep(0.0, 0.08, -V.y));
  // shallow water and surf where it meets the sea floor
  float u = p.x - coastX(p.y);
  float depth = vWP.y - bed(u);
  col = mix(col, vec3(0.3, 0.33, 0.28) * (0.4 + 0.6 * uSkyLo), (1.0 - smoothstep(0.0, 1.2, depth)) * 0.35);
  float foam = (1.0 - smoothstep(0.0, 0.5 + 0.6 * uWave, depth)) * (0.5 + 0.5 * n2(p * 0.7 + uPhase * 0.5));
  col = mix(col, vec3(0.9, 0.9, 0.88) * (0.5 + 0.6 * uSkyLo.r), foam * 0.8);
  // boiling: churning white water
  col = mix(col, vec3(0.85, 0.85, 0.82) * (0.5 + 0.6 * uSkyLo.r), uBoil * (0.35 + 0.4 * n2(p * 0.5 + uTime * 2.0)));
  // haze toward the horizon
  col = mix(col, uSkyLo * 0.9, smoothstep(3000.0, 40000.0, dist) * 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSea(scene) {
  const V = () => ({ value: new THREE.Vector3(0, 0, -1) });
  const u = {
    uWave: { value: 1 }, uPhase: { value: 0 }, uSunA: V(), uSunB: V(), uSunCol: { value: new THREE.Color() }, uSunI: { value: 4 },
    uSpread: { value: 0 }, uSunR: { value: 0.0047 }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
    uBoil: { value: 0 }, uTime: { value: 0 }, uLights: { value: 0 },
  };
  const geo = new THREE.PlaneGeometry(240000, 240000, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag }));
  mesh.frustumCulled = false;
  mesh.position.set(0, -2.4, -110000);
  scene.add(mesh);
  return { mesh, u };
}
