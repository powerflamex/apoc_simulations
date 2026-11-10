// The dusk sky over downtown: the last light low in the west (left), deep blue overhead, a full moon up the avenue
// behind him, the city's glow on a broken cloud deck. Tints: uRed (Red's blast lights the low sky), uPurple, uDust.
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
uniform vec3 uMoon; uniform float uPx; uniform float uTime; uniform float uRed; uniform float uPurple; uniform float uDust; uniform vec3 uRedDir;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  // west (-x) keeps the last of the sunset
  float west = pow(max(-v.x * 0.8 + 0.2, 0.0), 2.0);
  vec3 low = mix(vec3(0.42, 0.22, 0.3), vec3(1.05, 0.42, 0.22), west);
  vec3 mid = mix(vec3(0.12, 0.13, 0.32), vec3(0.42, 0.2, 0.36), west);
  vec3 top = vec3(0.02, 0.035, 0.1);
  vec3 c = mix(low, mid, smoothstep(0.0, 0.1, h));
  c = mix(c, top, smoothstep(0.08, 0.6, h));
  // stars
  vec3 sp = v * 600.0;
  float st = step(0.9975, hash13(floor(sp))) * smoothstep(0.15, 0.5, h);
  c += vec3(0.8, 0.85, 1.0) * st * 0.6;
  // a broken cloud deck, lit from below by the city (orange) and the moon
  if (v.y > 0.0) {
    float H = 1800.0;
    float dist = H / max(v.y, 0.025);
    vec2 p = v.xz * dist + vec2(uTime * 6.0, 0.0);
    vec2 q = p / 2400.0;
    float n = fbm3(vec3(q * vec2(1.0, 0.6), 2.3));
    float cov = smoothstep(0.5, 0.72, n) * (1.0 - smoothstep(20000.0, 50000.0, dist));
    float lit = fbm3(vec3(q * 3.0, 5.0));
    vec3 cc = mix(vec3(0.07, 0.06, 0.1), vec3(0.42, 0.24, 0.2), lit * (0.5 + 0.5 * smoothstep(0.4, 0.0, h)));
    cc += vec3(0.25, 0.27, 0.32) * pow(max(dot(v, uMoon), 0.0), 12.0) * lit;
    c = mix(c, cc, cov * 0.85);
  }
  // the moon: a bright disk with a few dark seas, and its halo
  float md = acos(clamp(dot(v, uMoon), -1.0, 1.0));
  const float MR = 0.0085;
  vec3 mt = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)));
  vec3 mu = cross(mt, uMoon);
  vec2 mp = vec2(dot(v - uMoon, mt), dot(v - uMoon, mu)) / MR;
  float seas = smoothstep(0.55, 0.75, noise3(vec3(mp * 2.2, 1.0))) * 0.35;
  float disk = 1.0 - smoothstep(MR - uPx * 1.2, MR + uPx * 1.2, md);
  c = mix(c, vec3(1.5, 1.47, 1.4) * (1.0 - seas), disk);
  c += vec3(0.3, 0.32, 0.4) * exp(-md / 0.04) * 0.25;
  // the techniques light the sky
  c += vec3(0.9, 0.18, 0.08) * uRed * (0.35 + 0.65 * pow(max(dot(v, uRedDir), 0.0), 6.0)) * (1.0 - smoothstep(0.0, 0.5, h));
  c = mix(c, c * vec3(0.9, 0.7, 1.3) + vec3(0.12, 0.03, 0.2) * (1.0 - h), uPurple);
  c = mix(c, vec3(0.2, 0.16, 0.15), uDust * (0.4 + 0.5 * (1.0 - smoothstep(0.0, 0.3, h))));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = {
    uMoon: { value: new THREE.Vector3(0.049, 0.565, -1).normalize() }, uPx: { value: 0.0006 }, uTime: { value: 0 },
    uRed: { value: 0 }, uPurple: { value: 0 }, uDust: { value: 0 }, uRedDir: { value: new THREE.Vector3(0, 0.08, -1).normalize() },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
