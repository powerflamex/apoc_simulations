// The sky over 42nd Street at Manhattanhenge: the Sun sitting on the horizon exactly at the end of the street,
// a gold horizon fading to a pale blue overhead, a few clouds lit orange and pink from below.
import * as THREE from 'three';

export const SKY_COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform float uWhite;
vec3 atmosphere(vec3 v) {
  float e = v.y;
  float h = clamp(e, 0.0, 1.0);
  float cs = dot(v, uSunDir);
  vec2 hs = normalize(uSunDir.xz + vec2(1e-5));
  float side = dot(normalize(v.xz + vec2(1e-5)), hs) * 0.5 + 0.5;   // 1 toward the Sun's side of the sky
  // overhead: a clear evening blue; the horizon: gold on the Sun's side, a soft violet-pink behind
  vec3 top = vec3(0.16, 0.3, 0.58);
  vec3 hor = mix(vec3(0.62, 0.52, 0.62), vec3(1.0, 0.66, 0.34), pow(side, 2.0));
  vec3 c = mix(hor, top, pow(smoothstep(0.0, 0.6, h), 0.55));
  // the glow round the low Sun
  c += vec3(1.0, 0.55, 0.22) * (pow(max(cs, 0.0), 8.0) * 0.55 + pow(max(cs, 0.0), 60.0) * 0.9 + pow(max(cs, 0.0), 900.0) * 2.5);
  // below the horizon (seen across the river): haze
  if (e < 0.0) c = mix(c, vec3(0.42, 0.3, 0.26), smoothstep(0.0, -0.05, e));
  c = mix(c, vec3(1.0, 0.98, 0.95), uWhite);
  return c;
}
`;

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uPx;
uniform vec2 uCloudOff;
${SKY_COMMON}
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  vec3 c = atmosphere(v);
  // the Sun: a big, slightly flattened orange disk sitting just above the far shore
  {
    vec3 d = v - uSunDir;
    vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), uSunDir));
    vec2 q = vec2(dot(d, ax), dot(d, vec3(0.0, 1.0, 0.0)) * 1.12);   // refraction squashes it a little
    float r = length(q);
    const float SR = 0.0125;
    float aa = uPx * 1.2;
    float disk = 1.0 - smoothstep(SR - aa, SR + aa, r);
    vec3 sunC = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.82, 0.55), smoothstep(SR, 0.0, r) * 0.7);
    c = mix(c, sunC * 5.0, disk * (1.0 - uWhite));
  }
  // a few clouds, lit gold and pink from below by the low Sun
  if (v.y > 0.0) {
    float dist = 1500.0 / max(v.y, 0.03);
    vec2 p = v.xz * dist * 0.0009 + uCloudOff;
    float n = fbm3(vec3(p, 1.7));
    float cov = smoothstep(0.56, 0.78, n) * (1.0 - smoothstep(6000.0, 30000.0, dist));
    float toSun = pow(max(dot(normalize(v.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0), 3.0);
    vec3 cc = mix(vec3(0.55, 0.42, 0.52), vec3(1.0, 0.6, 0.34), 0.35 + 0.65 * toSun) * (0.75 + 0.35 * fbm3(vec3(p * 3.0, 4.0)));
    c = mix(c, cc, cov * 0.8 * (1.0 - uWhite));
  }
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}
`;

export function makeSky() {
  const uniforms = {
    uPx: { value: 0.0006 }, uSunDir: { value: new THREE.Vector3(0, 0.03, -1).normalize() }, uWhite: { value: 0 },
    uCloudOff: { value: new THREE.Vector2(0.3, 0.1) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
