// The storm sky at dusk: a low ceiling of dark rain cloud, heavier and rolling overhead, with a band of sunset
// glowing orange under its edge in the west (the Sun has just set behind the Olympics). Lightning: the clouds flash
// from inside, and a jagged bolt drops from the cloud base somewhere ahead (uBolt: how bright, uBoltAz: where).
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
uniform vec3 uGlow; uniform float uTime; uniform float uFlash; uniform float uBolt; uniform float uBoltAz; uniform float uBoltSeed;
uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uBand; uniform float uScroll; uniform float uCloudH; uniform float uDip;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float hy = v.y + uDip;
  float h = clamp(hy, 0.0, 1.0);
  vec3 gh = normalize(vec3(uGlow.x, 0.0, uGlow.z));
  float w = pow(max(dot(normalize(vec3(v.x, 0.0, v.z)), gh), 0.0), 3.0);
  // the cloud deck: projected onto a ceiling, rolling slowly; darker, lumpier overhead
  vec2 q = v.xz / max(hy + 0.06, 0.03);
  float n = fbm3(vec3(q * 1.3 + vec2(uScroll, uScroll * 0.4), uTime * 0.03));
  float n2 = fbm3(vec3(q * 4.0 - vec2(uScroll * 2.1, 0.0), 3.0 + uTime * 0.05));
  vec3 cloud = mix(uTop * 0.6, uTop * 1.6, smoothstep(0.3, 0.75, n * 0.7 + n2 * 0.4));
  vec3 c = mix(uLow, cloud, smoothstep(0.0, 0.25, h));
  // the sunset band under the cloud edge in the west, broken by the cloud base above it
  float band = (1.0 - smoothstep(0.0, 0.07 + 0.05 * n2, h)) * w;
  c += uBand * band * (0.7 + 0.5 * n2);
  c += uBand * 0.25 * w * (1.0 - smoothstep(0.0, 0.3, h)) * smoothstep(0.45, 0.2, n);
  // lightning: the cloud lit from inside, a bolt dropping ahead
  float flashLit = uFlash * (0.4 + 1.2 * smoothstep(0.35, 0.8, n));
  c += vec3(0.55, 0.6, 0.85) * flashLit * smoothstep(-0.02, 0.15, h);
  if (uBolt > 0.001) {
    float az = atan(v.x, -v.z);
    float da = az - uBoltAz;
    da = atan(sin(da), cos(da));
    float y = h;
    float jag = (fbm3(vec3(y * 14.0, uBoltSeed, 1.0)) - 0.5) * 0.08 + (fbm3(vec3(y * 50.0, uBoltSeed, 5.0)) - 0.5) * 0.02;
    float core = exp(-pow((da - jag) / 0.0018, 2.0)) * step(y, 0.32) * step(0.0, hy);
    float glow = exp(-pow((da - jag) / 0.02, 2.0)) * step(y, 0.32) * step(0.0, hy);
    // a branch
    float jb = (fbm3(vec3(y * 18.0, uBoltSeed + 3.0, 2.0)) - 0.5) * 0.06 + (0.2 - y) * 0.25;
    float br = exp(-pow((da - jb) / 0.0015, 2.0)) * step(y, 0.2) * step(0.06, y);
    c += vec3(0.9, 0.92, 1.0) * (core * 14.0 + br * 7.0 + glow * 0.8) * uBolt;
  }
  // below the horizon (seen from up high): the dark sea
  c = mix(c, uLow * 0.5, smoothstep(0.0, -0.02, hy));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = {
    uGlow: { value: new THREE.Vector3(0, 0.05, -1) }, uTime: { value: 0 }, uFlash: { value: 0 }, uBolt: { value: 0 },
    uBoltAz: { value: 0 }, uBoltSeed: { value: 0 }, uScroll: { value: 0 }, uCloudH: { value: 1 }, uDip: { value: 0 },
    uTop: { value: new THREE.Color(0.07, 0.08, 0.1) }, uLow: { value: new THREE.Color(0.17, 0.18, 0.22) }, uBand: { value: new THREE.Color(0.95, 0.42, 0.2) },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
