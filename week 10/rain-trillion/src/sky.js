// The sky: a storm afternoon (a low ceiling of slate rain cloud, rolling, lumpier overhead, paler toward the horizon),
// lightning (the clouds lit from inside, a jagged bolt ahead), and once the water climbs past the weather (uSpace) the
// sky deepens to black with stars and the Sun.
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
uniform float uTime; uniform float uFlash; uniform float uBolt; uniform float uBoltAz; uniform float uBoltSeed;
uniform vec3 uTop; uniform vec3 uLow; uniform float uScroll; uniform float uSpace; uniform vec3 uSun; uniform float uClear;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  // the cloud deck projected on a ceiling, rolling with the wind
  vec2 q = v.xz / max(v.y + 0.08, 0.04);
  float n = fbm3(vec3(q * 1.1 + vec2(uScroll, uScroll * 0.4), uTime * 0.04));
  float n2 = fbm3(vec3(q * 3.6 - vec2(uScroll * 2.3, 0.0), 3.0 + uTime * 0.06));
  float lump = smoothstep(0.3, 0.78, n * 0.72 + n2 * 0.4);
  vec3 cloud = mix(uTop * 0.55, uTop * 1.45, lump);
  vec3 c = mix(uLow, cloud, smoothstep(0.0, 0.3, h));
  // rain shafts hanging from the cloud base (darker streaks low down)
  float shaft = fbm3(vec3(atan(v.x, -v.z) * 9.0 + uScroll * 3.0, 0.0, uTime * 0.1));
  c *= 1.0 - 0.18 * smoothstep(0.45, 0.75, shaft) * (1.0 - smoothstep(0.0, 0.25, h));
  // lightning: the cloud lit from inside, a bolt dropping ahead
  c += vec3(0.55, 0.6, 0.85) * uFlash * (0.4 + 1.2 * smoothstep(0.35, 0.8, n)) * smoothstep(-0.02, 0.15, h);
  if (uBolt > 0.001) {
    float az = atan(v.x, -v.z);
    float da = az - uBoltAz; da = atan(sin(da), cos(da));
    float y = h;
    float jag = (fbm3(vec3(y * 14.0, uBoltSeed, 1.0)) - 0.5) * 0.08 + (fbm3(vec3(y * 50.0, uBoltSeed, 5.0)) - 0.5) * 0.02;
    float core = exp(-pow((da - jag) / 0.0022, 2.0)) * step(y, 0.4) * step(0.0, v.y);
    float glow = exp(-pow((da - jag) / 0.025, 2.0)) * step(y, 0.4) * step(0.0, v.y);
    float jb = (fbm3(vec3(y * 18.0, uBoltSeed + 3.0, 2.0)) - 0.5) * 0.06 + (0.25 - y) * 0.25;
    float br = exp(-pow((da - jb) / 0.0018, 2.0)) * step(y, 0.26) * step(0.06, y);
    c += vec3(0.9, 0.92, 1.0) * (core * 14.0 + br * 7.0 + glow * 0.8) * uBolt;
  }
  // the clouds tearing open (uClear): blue sky breaking through the gaps
  vec3 blue = mix(vec3(0.35, 0.55, 0.85), vec3(0.08, 0.2, 0.5), smoothstep(0.0, 0.6, h));
  c = mix(c, blue, uClear * smoothstep(0.35, 0.6, 1.0 - lump + uClear * 0.6));
  // space: the sky goes black, a thin glow on the horizon, stars, the Sun
  if (uSpace > 0.0) {
    vec3 sp = vec3(0.0, 0.003, 0.012) + vec3(0.12, 0.3, 0.7) * exp(-max(v.y, 0.0) * 18.0) * 0.5;
    vec3 sd = floor(v * 420.0);
    float st = step(0.9965, hash13(sd)) * (0.4 + 1.6 * hash13(sd + 3.1));
    sp += vec3(st) * smoothstep(0.02, 0.15, v.y);
    float sd2 = max(dot(v, normalize(uSun)), 0.0);
    sp += vec3(1.0, 0.95, 0.85) * (pow(sd2, 4000.0) * 40.0 + pow(sd2, 60.0) * 0.4 + pow(sd2, 8.0) * 0.05);
    c = mix(c, sp, uSpace);
  }
  // below the horizon (seen from up high): dark water
  c = mix(c, uLow * 0.35 * (1.0 - uSpace) + vec3(0.0, 0.01, 0.03) * uSpace, smoothstep(0.0, -0.02, v.y));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 }, uFlash: { value: 0 }, uBolt: { value: 0 }, uBoltAz: { value: 0 }, uBoltSeed: { value: 0 }, uScroll: { value: 0 },
    uTop: { value: new THREE.Color(0.2, 0.22, 0.26) }, uLow: { value: new THREE.Color(0.46, 0.5, 0.56) },
    uSpace: { value: 0 }, uClear: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.45, -0.75).normalize() },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
