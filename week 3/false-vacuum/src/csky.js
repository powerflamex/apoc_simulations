// The sky over Paris at sunset, looking west: gold and orange low down round the Sun, pink and then deep blue above,
// a few long clouds lit from below, the young Moon. The wall: each bit of sky is light scattered by air some way off
// (up to ~150 km toward the horizon, a few km straight up); once the wall has passed that air, that bit of sky is the
// void instead, so the darkness rises from the horizon at the Sun and climbs until the whole sky is gone.
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
uniform vec3 uSun; uniform vec3 uMoon; uniform float uTime; uniform float uDim;
uniform vec3 uWallN; uniform float uGap; uniform float uWallOn;   // uGap: how far the wall still is from you (m)
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float h = max(v.y, 0.0);
  float cs = dot(v, uSun);
  vec2 hz = normalize(v.xz + 1e-5), sz = normalize(uSun.xz);
  float az = max(dot(hz, sz), 0.0);
  // sunset: the glow round the Sun, gold low down, peach, pink, then blue
  vec3 low = mix(vec3(0.62, 0.32, 0.22), vec3(0.95, 0.48, 0.2), pow(az, 3.0));
  vec3 mid = mix(vec3(0.45, 0.32, 0.42), vec3(0.62, 0.4, 0.32), pow(az, 2.0));
  vec3 top = vec3(0.1, 0.16, 0.34);
  vec3 c = mix(low, mid, smoothstep(0.0, 0.06, h));
  c = mix(c, top, smoothstep(0.05, 0.32, h));
  c += vec3(1.0, 0.45, 0.15) * pow(max(cs, 0.0), 40.0) * 0.35 + vec3(1.4, 0.8, 0.4) * pow(max(cs, 0.0), 900.0) * 1.2;
  // the Sun itself: big, low and orange (flattened a little by the air)
  vec3 sv = v - uSun * cs;
  float sd = acos(clamp(cs, -1.0, 1.0));
  c = mix(c, vec3(9.0, 5.2, 2.2), smoothstep(0.0049, 0.0043, sd));
  // long thin clouds, lit gold and pink from below
  if (v.y > 0.0) {
    vec2 q = v.xz / (v.y + 0.08) * 0.6;
    float n = fbm3(vec3(q.x * 0.6, q.y * 2.4, 1.3) + vec3(uTime * 0.003, 0.0, 0.0));
    float cov = smoothstep(0.56, 0.74, n) * smoothstep(0.015, 0.08, h) * (1.0 - smoothstep(0.5, 0.8, h));
    vec3 cc = mix(vec3(0.7, 0.32, 0.36), vec3(1.15, 0.62, 0.3), pow(az, 2.0)) * (0.7 + 0.4 * fbm3(vec3(q * 5.0, 2.0)));
    c = mix(c, cc, cov * 0.8);
  }
  // the young Moon: a thin lit crescent toward the Sun
  float md = acos(clamp(dot(v, uMoon), -1.0, 1.0));
  if (md < 0.006) {
    vec3 mx = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0))), my = cross(mx, uMoon);
    vec2 mp = vec2(dot(v, mx), dot(v, my)) / 0.0045;
    vec2 sd2 = normalize(vec2(dot(uSun, mx), dot(uSun, my)));
    float disc = smoothstep(1.0, 0.9, length(mp));
    float lit = smoothstep(0.55, 0.8, dot(mp, sd2) + 0.35 * (1.0 - dot(mp, mp)));
    c = mix(c, vec3(1.6, 1.5, 1.3) * lit + c * 0.9, disc * (0.3 + 0.7 * lit));
  }
  c *= uDim;
  // the void: the air this way is already gone
  if (uWallOn > 0.5) {
    float L = min(150000.0, 3000.0 / (max(v.y, 0.0) + 0.02));
    float reach = -dot(v, uWallN);                         // how much this line of sight heads toward the wall
    float s = uGap - L * reach;                            // < 0: swallowed
    float edge = exp(-abs(s) / (0.04 * uGap + 50.0));
    if (s < 0.0) {
      vec3 q = v * 30.0;
      float sw = fbm3(q * 0.4 + vec3(0.0, uTime * 0.04, 0.0));
      float hue = fbm3(q * 0.15 - uTime * 0.02) * 2.0 + v.y * 2.0;
      vec3 iri = 0.5 + 0.5 * cos(6.2832 * (hue + vec3(0.0, 0.33, 0.67)));
      c = vec3(0.03, 0.016, 0.07) + vec3(0.12, 0.05, 0.22) * pow(sw, 2.5) + iri * 0.04 * smoothstep(0.3, 0.8, sw);
    }
    c += vec3(1.1, 0.95, 1.8) * edge * 2.2;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 0.05, -1) }, uMoon: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uTime: { value: 0 }, uDim: { value: 1 },
    uWallN: { value: new THREE.Vector3(0, 0, 1) }, uGap: { value: 1e9 }, uWallOn: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 96, 48), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
