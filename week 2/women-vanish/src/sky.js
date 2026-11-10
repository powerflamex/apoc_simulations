// The sky over Shibuya: a clear blue sky with fair-weather clouds (racing past in the time-lapse: uShift), a warm
// glow along the horizon at sunset, and at night (uBlack) dark blue with stars and the city's orange glow (uGlow).
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;   // exactly on the far plane (see makeSky)
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir; uniform float uBlack; uniform float uPx; uniform float uWhite; uniform vec2 uShift; uniform float uGlow;
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
    vec2 p = v.xz * dist * 0.0007 + uShift;
    float cov = smoothstep(0.58, 0.76, fbm3(vec3(p, 2.3))) * (1.0 - smoothstep(5000.0, 25000.0, dist));
    vec3 cc = mix(vec3(0.82, 0.85, 0.9), vec3(1.0), 0.5 + 0.5 * fbm3(vec3(p * 3.0, 1.0)));
    day = mix(day, cc, cov * 0.85);
  }
  // sunset: the low Sun warms the horizon, most of all on its own side
  float dusk = smoothstep(0.3, 0.02, uSunDir.y) * smoothstep(-0.2, 0.0, uSunDir.y);
  day = mix(day, mix(vec3(1.0, 0.55, 0.32), vec3(0.95, 0.4, 0.45), h) * (0.6 + 0.6 * pow(max(cs, 0.0), 3.0)), dusk * pow(1.0 - h, 2.5) * 0.85);
  day *= 1.0 - 0.35 * dusk * h;
  if (v.y < 0.0) day = mix(day, vec3(0.5, 0.52, 0.55), smoothstep(0.0, -0.1, v.y));
  // no electrons: black, stars (the Milky Way's glow too), and the Sun as a sharp white disk
  vec3 night = stars(v) * (1.0 - 0.6 * uGlow) + vec3(0.02, 0.03, 0.06) * (1.0 - h) + vec3(0.32, 0.17, 0.09) * uGlow * pow(1.0 - h, 5.0);
  const float SR = 0.0075;
  float d = acos(clamp(cs, -1.0, 1.0));
  float disk = 1.0 - smoothstep(SR - uPx * 1.2, SR + uPx * 1.2, d);
  vec3 sunB = vec3(1.0, 0.98, 0.95) * (disk * 30.0 + 0.6 * exp(-d / 0.004));
  vec3 c = mix(day + vec3(1.0, 0.97, 0.9) * disk * 20.0, night, uBlack);
  c = mix(c, vec3(1.0), uWhite);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uBlack: { value: 0 }, uPx: { value: 0.0006 }, uWhite: { value: 0 }, uShift: { value: new THREE.Vector2() }, uGlow: { value: 0 } };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: true }));
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}
