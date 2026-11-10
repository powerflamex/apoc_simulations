// Sky for "Earth falls into the Sun": a golden-hour sky whose Sun grows day by day — limb darkening,
// granulation, sunspots and flaring prominences once it is big — while the sky bleaches white with heat
// and smoke from the fires browns it.
import * as THREE from 'three';

export const SKY_COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform float uHeat;
uniform float uSunR;
uniform float uSmoke;
uniform float uSteam;
vec3 atmosphere(vec3 v) {
  float e = v.y;
  float h = clamp(e, 0.0, 1.0);
  float ang = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  vec2 hs = normalize(uSunDir.xz);
  float side = dot(normalize(v.xz + 1e-5), hs) * 0.5 + 0.5;
  vec3 zen = vec3(0.06, 0.13, 0.33);
  vec3 horSun = vec3(1.0, 0.56, 0.26);
  vec3 horAway = vec3(0.52, 0.42, 0.52);
  vec3 hor = mix(horAway, horSun, pow(side, 3.0));
  vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.6, h), 0.5));
  // the glow around the Sun widens and brightens as the Sun grows
  float k = uSunR / 0.00466;
  // a broad warm glow plus a tight halo hugging the limb (it does not spread over the whole sky as the Sun grows)
  float limbDist = max(ang - uSunR, 0.0);
  c += vec3(1.0, 0.72, 0.42) * (0.22 * exp(-ang / 0.15) + 0.9 * exp(-limbDist / (0.025 + 0.25 * uSunR)) * (1.0 + 0.4 * min(k, 3.0)));
  // heat bleaches the whole sky toward white-yellow
  float bleach = uHeat * (0.45 + 0.55 * smoothstep(-0.05, 0.5, e));
  c = mix(c, mix(vec3(0.95, 0.5, 0.2), vec3(1.0, 0.7, 0.35), smoothstep(0.0, 0.3, e)) * (0.75 + 0.35 * uHeat), clamp(bleach * 0.7, 0.0, 1.0));
  // steam off the boiling sea hazes the horizon; smoke from the fires browns everything
  c = mix(c, vec3(0.9, 0.78, 0.62) * (0.8 + 0.3 * uHeat), uSteam * 0.2 * exp(-max(e, 0.0) * 14.0));
  c = mix(c, vec3(0.45, 0.31, 0.2) * (0.8 + uHeat), uSmoke * 0.45 * smoothstep(-0.02, 0.35, e));
  if (e < 0.0) c = mix(c, hor * 0.6, smoothstep(0.0, -0.06, e));
  return c;
}
`;

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;   // exactly on the far plane (see makeSky)
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uPx;
${SKY_COMMON}
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }

void main() {
  vec3 v = normalize(vDir);
  vec3 c = atmosphere(v);
  // the Sun: a tangent-plane coordinate system around its direction
  vec3 sd = normalize(uSunDir);
  vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), sd));
  vec3 ay = cross(sd, ax);
  vec2 q = vec2(dot(v, ax), dot(v, ay)) / max(dot(v, sd), 1e-3);   // ~angle from the Sun's centre
  float rr = length(q) / uSunR;
  float k = uSunR / 0.00466;
  float edge = uPx / uSunR;
  float disk = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, rr);
  if (disk > 0.0 && dot(v, sd) > 0.0) {
    float mu = sqrt(max(1.0 - rr * rr, 0.0));
    float limb = 0.35 + 0.65 * pow(mu, 0.6);
    vec2 sp = q / uSunR;
    // granulation and sunspots only resolve once the disk is large
    float detail = smoothstep(3.0, 9.0, k);
    float gran = fbm(vec3(sp * 22.0, uTime * 0.15));
    float spotN = fbm(vec3(sp * 5.5 + 4.0, uTime * 0.01));
    float spots = smoothstep(0.64, 0.7, spotN) * 0.55 + smoothstep(0.7, 0.74, spotN) * 0.45;   // penumbra + umbra
    vec3 photo = mix(vec3(1.0, 0.33, 0.04), vec3(1.0, 0.68, 0.22), mu) * limb * (1.0 + detail * (gran - 0.5) * 0.5) * (1.0 - detail * spots * 0.8);
    // a small Sun is a blinding point; a huge one is rendered dimmer per pixel so its colour and face survive tone mapping
    c = mix(c, photo * mix(7.0 + 3.0 * mu, 3.0 + 1.8 * mu, smoothstep(2.0, 10.0, k)), disk);
  }
  // prominences and the corona licking off the limb of a huge Sun
  if (k > 4.0 && rr > 0.98 && rr < 1.5) {
    float a = atan(q.y, q.x);
    float flare = fbm(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 0.25 + rr * 2.0));
    float prom = smoothstep(0.55, 0.75, flare) * exp(-(rr - 1.0) * 9.0);
    c += vec3(1.0, 0.45, 0.15) * prom * 6.0 * smoothstep(4.0, 10.0, k);
  }
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}
`;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 }, uPx: { value: 0.0006 },
    uSunDir: { value: new THREE.Vector3() }, uHeat: { value: 0 }, uSunR: { value: 0.00466 }, uSmoke: { value: 0 }, uSteam: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: true });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}
