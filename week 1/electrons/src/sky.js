// The sky over Shibuya: a clear blue noon sky with a few fair-weather clouds. With no electrons in the air nothing
// scatters sunlight, so the sky snaps to black: stars at noon, the Sun a hard white disk (uBlack = 1).
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir; uniform float uBlack; uniform float uPx; uniform float uWhite;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// stars: a fixed field of points (tiny, sharp)
vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 180.0 : 420.0;
    vec3 q = d * sc; vec3 cell = floor(q); vec3 f = fract(q) - 0.5;
    float h = hash13(cell + float(l) * 17.0);
    if (h > (l == 0 ? 0.93 : 0.985)) {
      vec3 off = (vec3(hash13(cell + 1.1), hash13(cell + 2.2), hash13(cell + 3.3)) - 0.5) * 0.7;
      float r = length(f - off) / sc;
      float w = uPx * 0.8;
      float b = pow(hash13(cell + 5.5), 6.0) * 6.0 + 0.4;
      c += mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.65), hash13(cell + 7.7)) * b * exp(-r * r / (w * w));
    }
  }
  return c;
}
void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  float cs = dot(v, uSunDir);
  // noon: deep blue overhead, pale toward the horizon, a bright halo round the Sun, a few cumulus
  vec3 day = mix(vec3(0.62, 0.74, 0.88), vec3(0.18, 0.38, 0.75), pow(h, 0.45));
  day += vec3(1.0, 0.95, 0.85) * (pow(max(cs, 0.0), 12.0) * 0.25 + pow(max(cs, 0.0), 200.0) * 0.8);
  if (v.y > 0.0) {
    float dist = 1800.0 / max(v.y, 0.04);
    vec2 p = v.xz * dist * 0.0007;
    float cov = smoothstep(0.58, 0.76, fbm3(vec3(p, 2.3))) * (1.0 - smoothstep(5000.0, 25000.0, dist));
    vec3 cc = mix(vec3(0.82, 0.85, 0.9), vec3(1.0), 0.5 + 0.5 * fbm3(vec3(p * 3.0, 1.0)));
    day = mix(day, cc, cov * 0.85);
  }
  if (v.y < 0.0) day = mix(day, vec3(0.5, 0.52, 0.55), smoothstep(0.0, -0.1, v.y));
  // no electrons: black, stars (the Milky Way's glow too), and the Sun as a sharp white disk
  vec3 night = stars(v) + vec3(0.6, 0.65, 0.8) * 0.02 * pow(max(1.0 - abs(dot(v, normalize(vec3(0.3, 0.5, -0.8)))), 0.0), 8.0);
  const float SR = 0.0075;
  float d = acos(clamp(cs, -1.0, 1.0));
  float disk = 1.0 - smoothstep(SR - uPx * 1.2, SR + uPx * 1.2, d);
  vec3 sunB = vec3(1.0, 0.98, 0.95) * (disk * 30.0 + 0.6 * exp(-d / 0.004));
  vec3 c = mix(day + vec3(1.0, 0.97, 0.9) * disk * 20.0, night + sunB, uBlack);
  c = mix(c, vec3(1.0), uWhite);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uBlack: { value: 0 }, uPx: { value: 0.0006 }, uWhite: { value: 0 } };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
