// Sky for the asteroid: golden hour, the incoming fireball streak + smoke trail, the impact flash,
// a fireball dome and a 20-mile steam column with a mushroom cap, and the shockwave's condensation ring.
import * as THREE from 'three';

export const SKY_COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform float uHaze;
uniform float uImpactLight;
uniform vec3 uImpactDir;
vec3 atmosphere(vec3 v) {
  float e = v.y;
  float h = clamp(e, 0.0, 1.0);
  float cs = max(dot(v, uSunDir), 0.0);
  vec2 hs = normalize(uSunDir.xz);
  float side = dot(normalize(v.xz + 1e-5), hs) * 0.5 + 0.5;  // 1 toward the sun
  vec3 zen = vec3(0.05, 0.11, 0.3);
  vec3 horSun = vec3(0.95, 0.5, 0.22);
  vec3 horAway = vec3(0.5, 0.36, 0.42);
  vec3 hor = mix(horAway, horSun, pow(side, 3.0));
  vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.6, h), 0.55));
  c += vec3(1.0, 0.7, 0.4) * (pow(cs, 10.0) * 0.08 + pow(cs, 120.0) * 0.22 + pow(cs, 1500.0) * 0.7);
  // steam and ash spreading after the impact: dimmer, browner sky
  vec3 hazeC = mix(vec3(0.55, 0.38, 0.26), vec3(0.22, 0.2, 0.21), h);
  c = mix(c, hazeC + vec3(0.6, 0.35, 0.15) * pow(cs, 6.0) * 0.5, uHaze * 0.55);
  // impact flash lights the whole sky from the horizon
  float ai = max(dot(v, uImpactDir), 0.0);
  c += vec3(1.0, 0.92, 0.8) * uImpactLight * (0.06 + 0.5 * pow(ai, 30.0) + 2.0 * pow(ai, 400.0));
  if (e < 0.0) c = mix(c, hor * 0.55, smoothstep(0.0, -0.06, e));
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
uniform vec3 uRockA; uniform vec3 uRockB; uniform float uRockPath; uniform float uRockGlow; uniform float uTrailFade;
uniform float uFireball; uniform float uPlume; uniform float uAnvil;
uniform float uRing;
uniform float uSunVis;
${SKY_COMMON}

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.02 + 7.1; a *= 0.5; } return s; }

vec3 slerpV(vec3 a, vec3 b, float k) {
  float o = acos(clamp(dot(a, b), -1.0, 1.0));
  if (o < 1e-4) return a;
  return normalize((sin((1.0 - k) * o) * a + sin(k * o) * b) / sin(o));
}

void main() {
  vec3 v = normalize(vDir);
  vec3 c = atmosphere(v);

  // the sun
  float sa = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  const float SR = 0.0105;
  c += vec3(1.0, 0.78, 0.5) * (1.0 - smoothstep(SR - uPx, SR + uPx, sa)) * 7.0 * uSunVis;

  // --- asteroid streak + smoke trail ---
  vec3 head = slerpV(uRockA, uRockB, uRockPath);
  vec3 n = cross(uRockA, head);
  float nl = length(n);
  if (nl > 1e-5 && uTrailFade > 0.0) {
    n /= nl;
    float perp = asin(clamp(dot(v, n), -1.0, 1.0));
    vec3 vp = normalize(v - n * dot(v, n));
    float sAlong = atan(dot(cross(uRockA, vp), n), dot(uRockA, vp));
    float tot = acos(clamp(dot(uRockA, head), -1.0, 1.0));
    if (sAlong > -0.01 && sAlong < tot + 0.01) {
      float behind = tot - sAlong;                 // angular distance behind the head
      float age = behind / max(tot, 1e-3);          // 0 at head, 1 at entry point
      // smoke: widens and drifts with time, lit warm on the sun side
      float w = uPx * 2.0 + 0.0025 + 0.006 * age + 0.004 * (1.0 - uTrailFade);
      float wob = (noise3(vec3(sAlong * 60.0, uTime * 0.2, 1.0)) - 0.5) * 0.004 * (1.0 - uTrailFade + age);
      float sm = exp(-pow((perp + wob) / w, 2.0)) * smoothstep(0.0, 0.02, behind);
      float puff = 0.6 + 0.4 * noise3(vec3(sAlong * 140.0, perp * 300.0, uTime * 0.3));
      vec3 smokeC = mix(vec3(0.5, 0.46, 0.45), vec3(1.0, 0.78, 0.55), 0.6) * puff;
      c = mix(c, smokeC, sm * 0.75 * uTrailFade);
      // plasma just behind the head
      float pl = exp(-pow(perp / (uPx * 3.0 + 0.002), 2.0)) * exp(-behind / 0.09);
      c += vec3(1.0, 0.7, 0.35) * pl * 14.0 * uRockGlow;
    }
  }
  float ha = acos(clamp(dot(v, head), -1.0, 1.0));
  c += vec3(1.0, 0.92, 0.8) * uRockGlow * (60.0 * exp(-pow(ha / (uPx * 4.0), 2.0)) + 3.0 * exp(-ha / 0.016) + 0.4 * exp(-ha / 0.07));

  // --- impact: fireball + steam column + mushroom cap (angular coordinates around the impact point) ---
  if (uPlume > 0.0 || uFireball > 0.0) {
    float azI = atan(uImpactDir.x, -uImpactDir.z);
    float az = atan(v.x, -v.z);
    float x = az - azI;
    float y = asin(clamp(v.y, -1.0, 1.0)) + 0.002;
    float t = uTime;
    // fireball dome
    float rf = 0.05 * uFireball + 0.001;
    float df = length(vec2(x, y * 1.15)) / rf;
    float fn = fbm(vec3(x * 90.0, y * 90.0 - t * 0.8, t * 0.4));
    float fire = (1.0 - smoothstep(0.75, 1.05, df + (fn - 0.5) * 0.5)) * step(-0.002, y) * uFireball;
    vec3 fireC = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.85, 0.6), smoothstep(0.9, 0.2, df)) * (3.0 + 10.0 * smoothstep(0.7, 0.0, df));
    // column + cap
    float Ht = 0.31 * uPlume;
    float capW = 0.035 + 0.24 * uAnvil;
    float capH = 0.028 + 0.02 * uAnvil;
    float capY = Ht - capH * 0.6;
    float yy = max(y, 0.0);
    float wc = 0.02 + 0.016 * yy / max(Ht, 1e-3) + 0.01 * uPlume;
    vec3 np = vec3(x * 38.0, y * 38.0 - t * 0.22, t * 0.03);
    float n1 = fbm(np);
    float n2 = fbm(np * 2.7 + 4.0);
    float colD = (1.0 - smoothstep(0.7, 1.05, abs(x) / wc + (n1 - 0.5) * 0.7)) * step(0.0, y) * (1.0 - smoothstep(Ht * 0.85, Ht, y));
    vec2 cq = vec2(x / capW, (y - capY) / capH);
    float capD = 1.0 - smoothstep(0.75, 1.05, length(cq) + (n1 - 0.5) * 0.6 + (n2 - 0.5) * 0.25);
    float dens = max(colD, capD * step(0.0, y)) * smoothstep(0.0, 0.05, uPlume);
    // lighting: the sun is to the right; billows give fake relief
    float relief = n2 - 0.5;
    float sunSide = smoothstep(-0.8, 1.2, (x / max(capW, wc)) + relief * 1.5);
    vec3 lit = vec3(1.0, 0.72, 0.46) * 1.15;
    vec3 shade = vec3(0.16, 0.15, 0.18);
    float under = smoothstep(0.3, -0.6, (y - capY) / capH) * capD;   // underside of the cap is in shadow
    float billow = smoothstep(0.35, 0.75, n2 + n1 * 0.4);
    vec3 steam = mix(shade, lit, clamp(sunSide * (0.55 + 0.6 * billow) - under * 0.5, 0.0, 1.0)) * (0.7 + 0.45 * n1);
    steam += vec3(1.0, 0.45, 0.12) * exp(-y * 40.0) * 2.5 * (1.0 - smoothstep(T_FADE_A, T_FADE_B, t)); // glow from below early on
    steam = mix(steam, atmosphere(vec3(v.x, 0.02, v.z)), 0.12);   // 60 miles of air in front
    c = mix(c, steam, clamp(dens, 0.0, 1.0) * 0.96);
    c = mix(c, fireC, fire * 0.95);
  }

  // shockwave: a thin condensation shell racing outward
  if (uRing > 0.0) {
    // the shock front is a low dome of condensation: from 60 miles it looks small on the horizon, then rushes
    // outward faster and faster and sweeps over the top of the frame just as it hits
    float ai = acos(clamp(dot(v, uImpactDir), -1.0, 1.0));
    float rr = atan(0.06, max(1.0 - uRing, 0.0005));
    float wdt = 0.006 + 0.05 * uRing * uRing;
    float ring = exp(-pow((ai - rr) / wdt, 2.0)) * step(0.0, v.y);
    float inside = smoothstep(rr, rr - wdt * 3.0, ai) * 0.12;   // hazy air behind the front
    c += vec3(0.92, 0.88, 0.84) * (ring * (0.35 + 0.65 * uRing) + inside * uRing);
  }
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}
`.replace('T_FADE_A', '22.0').replace('T_FADE_B', '32.0');

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 },
    uPx: { value: 0.0006 },
    uSunDir: { value: new THREE.Vector3() },
    uSunVis: { value: 1 },
    uHaze: { value: 0 },
    uImpactLight: { value: 0 },
    uImpactDir: { value: new THREE.Vector3() },
    uRockA: { value: new THREE.Vector3() },
    uRockB: { value: new THREE.Vector3() },
    uRockPath: { value: 0 },
    uRockGlow: { value: 0 },
    uTrailFade: { value: 0 },
    uFireball: { value: 0 },
    uPlume: { value: 0 },
    uAnvil: { value: 0 },
    uRing: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  mesh.frustumCulled = false;
  // Drawn after every other opaque object, depth-tested at the far plane: the sky shader then only runs where sky
  // is actually visible, instead of on the whole frame before the world is drawn over it. Transparent objects
  // still come after it, so the picture is the same. (Needs every other opaque object to write and test depth.)
  mesh.renderOrder = 1000;
  return { mesh, uniforms };
}
