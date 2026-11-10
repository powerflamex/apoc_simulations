// The golden-hour sky over the avenue: deep blue overhead to gold and rose low in the west, the Sun low on the
// right (west-north-west), a field of high clouds lit from below. The clouds ride the wind: they come up over the
// horizon ahead and race overhead toward the camera (uShift: how far the air has moved, m). uDust fills the low
// sky with brown grit and dims the Sun.
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
uniform vec3 uSunDir; uniform float uPx; uniform float uShift; uniform float uDust; uniform float uCamY; uniform float uTime;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  float cs = dot(v, uSunDir);
  vec3 sh = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  float az = max(dot(normalize(vec3(v.x, 0.0, v.z)), sh), 0.0);
  float sunSide = pow(az, 3.0);
  // golden hour: gold low down, peach and salmon higher up (warmest toward the Sun), soft blue overhead
  // (away from the Sun, over the bay: a clear deep blue overhead, lavender, then a peach band at the horizon)
  vec3 top = vec3(0.13, 0.3, 0.68);
  vec3 mid = mix(vec3(0.62, 0.46, 0.66), vec3(0.98, 0.5, 0.34), pow(az, 1.5));
  vec3 low = mix(vec3(1.05, 0.58, 0.4), vec3(1.15, 0.58, 0.26), sunSide);
  vec3 c = mix(low, mid, smoothstep(0.0, 0.12, h));
  c = mix(c, top, smoothstep(0.1, 0.6, h));
  c *= 0.8 + 0.35 * sunSide * (1.0 - smoothstep(0.0, 0.45, h));
  c += vec3(1.0, 0.6, 0.3) * (pow(max(cs, 0.0), 18.0) * 0.18 + pow(max(cs, 0.0), 250.0) * 0.7);
  // clouds: a broken deck ~2.5 km up, lit gold and rose from below; they ride the wind toward the camera
  if (v.y > 0.0) {
    float H = max(2500.0 - uCamY, 100.0);
    float dist = H / max(v.y, 0.03);
    vec2 p = v.xz * dist;
    p.y -= uShift;
    vec2 q = p / 2600.0;
    float n = fbm3(vec3(q * vec2(1.0, 0.55), 1.7));
    float cov = smoothstep(0.54, 0.74, n) * (1.0 - smoothstep(25000.0, 60000.0, dist));
    float lit = fbm3(vec3(q * 3.0, 4.0));
    vec3 cc = mix(vec3(0.42, 0.3, 0.44), vec3(1.05, 0.6, 0.45), (0.35 + 0.65 * lit) * (0.55 + 0.5 * sunSide));
    cc *= 0.85 + 0.3 * smoothstep(0.0, 0.3, h);
    // streaks along the flow once it is fast
    c = mix(c, cc, cov * 0.92);
  }
  // the Sun: a soft disk low on the right
  const float SR = 0.0085;
  float d = acos(clamp(cs, -1.0, 1.0));
  float disk = 1.0 - smoothstep(SR - uPx * 1.2, SR + uPx * 1.2, d);
  c += vec3(1.0, 0.75, 0.45) * disk * 2.2 * (1.0 - min(uDust * 3.0, 0.85));
  // grit and dust: a brown pall that thickens toward the horizon, glowing where the Sun is
  vec3 dustC = mix(vec3(0.5, 0.4, 0.32), vec3(0.85, 0.55, 0.3), pow(max(cs, 0.0), 40.0));
  c = mix(c, dustC, uDust * (0.25 + 0.5 * (1.0 - smoothstep(0.0, 0.35, h))));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uPx: { value: 0.0006 }, uShift: { value: 0 }, uDust: { value: 0 },
    uCamY: { value: 1.7 }, uTime: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
