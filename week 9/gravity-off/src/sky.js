// The sky: a gradient from the horizon to the zenith set from the Sun's height (main.js picks the colours: golden hour,
// blue hour, night, morning), the Sun's disc and its glow, a warm band along the horizon under a low Sun, a few
// clouds lit by it, and stars once it's dark.
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
uniform vec3 uSun; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uSunCol;
uniform float uSunI; uniform float uStars; uniform float uCloud; uniform float uT; uniform float uPx; uniform float uCity;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float h = v.y, hh = clamp(h, 0.0, 1.0);
  vec3 col = mix(uHor, uZen, pow(hh, 0.42));
  // the warm band along the horizon under a low Sun, strongest toward it
  vec2 sh = normalize(uSun.xz + 1e-5), vh = normalize(v.xz + 1e-5);
  float toward = 0.5 + 0.5 * dot(sh, vh);
  col += uGlow * exp(-max(h, 0.0) * 9.0) * pow(toward, 3.0);
  // the glow round the Sun
  float cs = max(dot(v, uSun), 0.0);
  col += uSunCol * (pow(cs, 9.0) * 0.35 + pow(cs, 90.0) * 1.2) * uSunI;
  // city glow from below at night
  col += vec3(0.5, 0.32, 0.18) * uCity * exp(-max(h, 0.0) * 14.0);
  // stars
  if (uStars > 0.0 && h > 0.0) {
    vec2 g = vec2(atan(v.z, v.x) * 260.0, h * 420.0);
    vec2 id = floor(g), f = fract(g);
    float r = hash12(id);
    float st = step(0.985, r) * smoothstep(0.32, 0.0, length(f - 0.5)) * (0.4 + 0.6 * hash12(id + 7.0));
    col += vec3(st) * uStars * 1.4 * smoothstep(0.02, 0.15, h);
  }
  // clouds: a thin layer, lit by the low Sun from one side
  if (h > 0.0) {
    vec2 cp = v.xz / (h + 0.06) * 1.6 + vec2(uT * 0.004, 0.0);
    float d = smoothstep(0.52, 0.8, fbm(cp * 0.9)) * smoothstep(0.0, 0.08, h) * uCloud;
    float lit = fbm(cp * 0.9 + uSun.xz * 0.12);
    vec3 cc = mix(uHor * 0.85, uSunCol * 1.1 + uGlow * 0.6, smoothstep(0.35, 0.75, lit) * smoothstep(-0.1, 0.25, uSun.y + 0.15));
    cc = mix(cc, uZen * 1.4, smoothstep(-0.02, -0.15, uSun.y));
    col = mix(col, cc, d * 0.75);
  }
  // the Sun's disc (0.55 degrees: bright enough to bloom)
  float ang = acos(clamp(dot(v, uSun), -1.0, 1.0));
  float disc = 1.0 - smoothstep(0.0048 - uPx, 0.0048 + uPx, ang);
  col += uSunCol * 26.0 * disc * uSunI * smoothstep(-0.01, 0.01, uSun.y + 0.004);
  if (h < 0.0) col = mix(col, uHor * 0.55, smoothstep(0.0, -0.05, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeSky() {
  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunI: { value: 1 }, uStars: { value: 0 },
    uCloud: { value: 1 }, uT: { value: 0 }, uPx: { value: 0.001 }, uCity: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

// the sky's colours from the Sun's height (degrees)
const KEYS = [
  // el, zenith, horizon, glow band, sun colour
  [-30, [0.002, 0.003, 0.009], [0.008, 0.01, 0.022], [0, 0, 0], [0, 0, 0]],
  [-14, [0.004, 0.006, 0.018], [0.02, 0.024, 0.05], [0.02, 0.01, 0.01], [0, 0, 0]],
  [-7, [0.012, 0.022, 0.07], [0.12, 0.1, 0.16], [0.25, 0.08, 0.05], [0.4, 0.15, 0.05]],
  [-2, [0.04, 0.08, 0.22], [0.5, 0.32, 0.3], [0.9, 0.3, 0.12], [1.0, 0.4, 0.15]],
  [3, [0.1, 0.18, 0.42], [0.95, 0.62, 0.4], [1.1, 0.42, 0.14], [1.0, 0.55, 0.25]],
  [10, [0.14, 0.27, 0.6], [0.9, 0.74, 0.58], [0.7, 0.32, 0.1], [1.0, 0.72, 0.42]],
  [22, [0.13, 0.3, 0.7], [0.66, 0.76, 0.88], [0.2, 0.1, 0.04], [1.0, 0.88, 0.7]],
  [50, [0.1, 0.28, 0.72], [0.58, 0.72, 0.9], [0, 0, 0], [1.0, 0.95, 0.85]],
];
export function skyColors(elDeg) {
  let i = 0;
  while (i < KEYS.length - 2 && elDeg > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = Math.min(1, Math.max(0, (elDeg - a[0]) / (b[0] - a[0])));
  const mix = (p, q) => p.map((x, j) => x + (q[j] - x) * k);
  return { zen: mix(a[1], b[1]), hor: mix(a[2], b[2]), glow: mix(a[3], b[3]), sun: mix(a[4], b[4]) };
}
