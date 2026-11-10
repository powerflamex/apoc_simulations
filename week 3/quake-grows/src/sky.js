// The sky over the Bay at sunset, seen looking east (away from the Sun): deep blue overhead, the pink "Belt of
// Venus" low over the East Bay hills, a few high clouds lit pink and gold; behind you the gold of the Sun going
// down. uDust: the brown pall of the falling city, thickening into a wall at magnitude 12.
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
uniform vec3 uSunDir; uniform float uPx; uniform float uDust; uniform float uTime;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  float cs = dot(v, uSunDir);
  float az = max(dot(normalize(vec3(v.x, 0.0, v.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
  float anti = max(-dot(normalize(vec3(v.x, 0.0, v.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
  // away from the Sun: blue above a pink band, the Earth's shadow a grey-blue strip at the very bottom
  vec3 top = vec3(0.12, 0.2, 0.45);
  vec3 belt = mix(vec3(0.85, 0.5, 0.55), vec3(1.0, 0.7, 0.55), az);
  vec3 low = mix(vec3(0.42, 0.42, 0.56), vec3(1.15, 0.72, 0.38), pow(az, 2.0));
  vec3 c = mix(low, belt, smoothstep(0.0, 0.05, h) * anti + smoothstep(0.0, 0.1, h) * (1.0 - anti));
  c = mix(c, top, smoothstep(0.1, 0.6, h));
  c += vec3(1.0, 0.6, 0.3) * (pow(max(cs, 0.0), 12.0) * 0.4 + pow(max(cs, 0.0), 300.0) * 2.5);
  // high clouds, lit from below by the setting Sun
  if (v.y > 0.0) {
    vec2 q = v.xz / (v.y + 0.12) * 0.9;
    float n = fbm3(vec3(q * 1.5 + vec2(uTime * 0.004, 0.0), 2.3));
    float cov = smoothstep(0.55, 0.75, n) * smoothstep(0.02, 0.15, h);
    vec3 cc = mix(vec3(1.0, 0.62, 0.5), vec3(1.15, 0.78, 0.45), az) * (0.75 + 0.3 * fbm3(vec3(q * 5.0, 1.0)));
    c = mix(c, cc, cov * 0.7);
  }
  // the dust: brown, thickest low down, glowing where the Sun shines through
  vec3 dustC = mix(vec3(0.42, 0.34, 0.26), vec3(0.85, 0.55, 0.3), pow(max(cs, 0.0), 6.0));
  c = mix(c, dustC, clamp(uDust * (0.5 + 0.6 * (1.0 - smoothstep(0.0, 0.5, h))), 0.0, 1.0));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = { uSunDir: { value: new THREE.Vector3(0, 0.12, 1) }, uPx: { value: 0.0006 }, uDust: { value: 0 }, uTime: { value: 0 } };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: true }));
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}
