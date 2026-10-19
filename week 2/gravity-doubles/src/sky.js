// The sky over the river at sunset: deep blue overhead to gold and rose at the horizon, the Sun low on the left,
// a field of high clouds lit pink from below. As gravity climbs the cloud deck sinks (uCloudH, metres) until it
// lies on the ground as fog; the crushed air thickens (uAir) and glows (uHeat); at the end the air is a thin hot
// skin and the sky above it goes black with stars (uDark). uDip: how far below the old horizon the sky now shows
// (the ground curls away when Earth caves in).
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
uniform vec3 uSunDir; uniform float uPx; uniform float uCloudH; uniform float uCloudCov; uniform vec2 uShift;
uniform float uGone; uniform float uAir; uniform float uHeat; uniform float uDark; uniform float uDip; uniform float uCamY; uniform float uTime;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 160.0 : 380.0;
    vec3 q = d * sc; vec3 cell = floor(q); vec3 f = fract(q) - 0.5;
    float h = hash13(cell + float(l) * 17.0);
    if (h > (l == 0 ? 0.93 : 0.982)) {
      vec3 off = (vec3(hash13(cell + 1.1), hash13(cell + 2.2), hash13(cell + 3.3)) - 0.5) * 0.7;
      float r = length(f - off) / sc;
      float w = uPx * 0.9;
      float b = pow(hash13(cell + 5.5), 6.0) * 5.0 + 0.5;
      c += mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.65), hash13(cell + 7.7)) * b * exp(-r * r / (w * w));
    }
  }
  return c;
}
void main() {
  vec3 v = normalize(vDir);
  // the horizon sits uDip below level when the ground curls away
  float ey = v.y + uDip;
  float h = clamp(ey, 0.0, 1.0);
  float cs = dot(v, uSunDir);
  float sunSide = pow(max(cs, 0.0), 3.0);
  // sunset: deep blue overhead, rose, then gold at the horizon (brightest on the Sun's side)
  vec3 top = vec3(0.13, 0.22, 0.45);
  vec3 mid = vec3(0.62, 0.45, 0.55);
  vec3 low = mix(vec3(1.0, 0.56, 0.3), vec3(1.0, 0.72, 0.38), sunSide);
  vec3 c = mix(low, mid, smoothstep(0.0, 0.18, h));
  c = mix(c, top, smoothstep(0.12, 0.65, h));
  c *= 0.75 + 0.6 * sunSide * (1.0 - smoothstep(0.0, 0.4, h));
  c += vec3(1.0, 0.75, 0.45) * (pow(max(cs, 0.0), 24.0) * 0.6 + pow(max(cs, 0.0), 300.0) * 1.5);
  // clouds: a broken deck at height uCloudH, lit from below by the low Sun
  float ch = max(uCloudH - uCamY, 2.0);
  if (ey > 0.0) {
    float dist = ch / max(ey, 0.02);
    vec2 p = v.xz * dist / max(uCloudH, 30.0) * 1.1 + uShift;
    float n = fbm3(vec3(p * 0.9, 2.3));
    float cov = smoothstep(0.62 - uCloudCov * 0.55, 0.78 - uCloudCov * 0.4, n) * (1.0 - smoothstep(18.0, 60.0, dist / max(uCloudH, 30.0)));
    cov *= 1.0 - uGone;
    float lit = 0.5 + 0.5 * fbm3(vec3(p * 3.0, 1.0));
    vec3 cc = mix(vec3(0.45, 0.3, 0.4), vec3(1.0, 0.62, 0.48), lit * (0.5 + 0.7 * sunSide));
    // a heavy, dark deck as it comes down, lit orange only along its edge on the Sun's side
    cc = mix(cc, mix(vec3(0.16, 0.13, 0.17), vec3(0.75, 0.38, 0.28), pow(1.0 - h, 3.0) * (0.4 + 0.6 * sunSide)) * (0.7 + 0.5 * lit), uCloudCov);
    c = mix(c, cc, cov * 0.95);
  }
  // the thick crushed air: a heavy haze that swallows the horizon
  vec3 haze = mix(vec3(0.62, 0.48, 0.45), vec3(0.5, 0.16, 0.05), uHeat);
  c = mix(c, haze, uAir * (1.0 - smoothstep(0.0, 0.5, h)) * 0.85);
  // black overhead at the end (the air is a thin skin), stars, the hot glow along the horizon
  vec3 night = stars(v) + vec3(0.01, 0.012, 0.03);
  c = mix(c, night, uDark * smoothstep(-0.05, 0.25, ey));
  c += vec3(1.0, 0.3, 0.06) * uHeat * (0.7 * exp(-abs(ey) * 22.0) + 0.08 * exp(-abs(ey) * 4.0));
  // below the horizon (only seen when the ground curls away): the glowing limb of the planet's air
  if (ey < 0.0) c = mix(c, night + vec3(1.0, 0.4, 0.12) * uHeat * 2.0 * exp(ey * 40.0), smoothstep(0.0, -0.01, ey));
  // the Sun: a soft disk low on the left
  const float SR = 0.0085;
  float d = acos(clamp(cs, -1.0, 1.0));
  float disk = 1.0 - smoothstep(SR - uPx * 1.2, SR + uPx * 1.2, d);
  c += vec3(1.0, 0.8, 0.55) * disk * 12.0 * (1.0 - uAir * 0.7);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uPx: { value: 0.0006 }, uCloudH: { value: 2000 }, uCloudCov: { value: 0 },
    uShift: { value: new THREE.Vector2() }, uAir: { value: 0 }, uHeat: { value: 0 }, uDark: { value: 0 }, uDip: { value: 0 },
    uCamY: { value: 1.7 }, uTime: { value: 0 }, uGone: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
