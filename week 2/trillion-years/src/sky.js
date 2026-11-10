// The sky over the bay, from one sunset to the end of the Sun.
//   Day, golden hour, twilight and night follow the Sun's elevation (the first simulated day runs straight through).
//   The Sun: a disk, or, once a frame spans weeks, the streak it paints sliding north and south along the horizon
//   with the seasons (uSunA..uSunB); dimmer per point the longer the streak (it spends less time on each point).
//   Clouds drift by and, once a frame spans hours, blur into a smooth veil (uCloud: their contrast).
//   Stars at night; Betelgeuse's supernova (uNova); the asteroid's fireball rising over the horizon, the sky lit red
//   by its falling debris, then dimmed by dust (uImpact: seconds since it hit); white steam haze while the oceans
//   boil (uHaze); and in the end the swollen red Sun filling the sky (uSunR up to ~89°).
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
uniform vec3 uSunA; uniform vec3 uSunB; uniform float uSunR; uniform float uSpread; uniform vec3 uSunCol; uniform float uSunI;
uniform float uPx; uniform float uCloud; uniform vec2 uCloudPhase; uniform float uCloudCov;
uniform float uNova; uniform vec3 uNovaDir; uniform float uImpact; uniform vec3 uImpDir;
uniform float uHaze; uniform float uGiant; uniform float uTime; uniform float uDim;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// angular distance from direction v to the arc of the sky from A to B (the Sun's path during one frame)
float arcDist(vec3 v, vec3 A, vec3 B) {
  float dA = acos(clamp(dot(v, A), -1.0, 1.0)), dB = acos(clamp(dot(v, B), -1.0, 1.0));
  vec3 n = cross(A, B);
  float ln = length(n);
  if (ln < 1e-5) return min(dA, dB);
  n /= ln;
  vec3 vp = v - n * dot(v, n);
  if (dot(cross(A, vp), n) >= 0.0 && dot(cross(vp, B), n) >= 0.0) return asin(clamp(abs(dot(v, n)), 0.0, 1.0));
  return min(dA, dB);
}

void main() {
  vec3 v = normalize(vDir);
  float h = clamp(v.y, 0.0, 1.0);
  vec3 S = normalize(uSunA + uSunB);
  float el = asin(clamp(S.y, -1.0, 1.0));            // the Sun's elevation (radians)
  vec3 sh = normalize(vec3(S.x, 0.0, S.z) + vec3(1e-4, 0.0, 0.0));
  float az = dot(normalize(vec3(v.x, 0.0, v.z) + vec3(1e-5, 0.0, 0.0)), sh) * 0.5 + 0.5;   // 1 toward the Sun, 0 away
  float sunSide = pow(az, 3.0);
  float e = degrees(el);

  // ---- the sky's colour for the Sun's elevation ----
  vec3 day = mix(vec3(0.62, 0.74, 0.92), vec3(0.17, 0.34, 0.74), smoothstep(0.0, 0.6, h));
  day += vec3(0.25, 0.22, 0.15) * pow(az, 6.0) * (1.0 - smoothstep(0.0, 0.5, h));
  vec3 top = vec3(0.12, 0.24, 0.52);
  vec3 mid = mix(vec3(0.5, 0.28, 0.42), vec3(0.98, 0.45, 0.25), pow(az, 1.5));
  vec3 low = mix(vec3(0.9, 0.42, 0.2), vec3(1.15, 0.58, 0.22), sunSide);
  vec3 gold = mix(low, mid, smoothstep(0.0, 0.14, h));
  gold = mix(gold, top, smoothstep(0.1, 0.6, h));
  gold *= 0.8 + 0.35 * sunSide * (1.0 - smoothstep(0.0, 0.45, h));
  // twilight: a red-orange band on the Sun's side, deep blue above, a pink belt opposite
  vec3 twi = mix(mix(vec3(0.95, 0.38, 0.16), vec3(0.55, 0.22, 0.32), 1.0 - sunSide) * 0.9, vec3(0.06, 0.1, 0.28), smoothstep(0.0, 0.35, h));
  twi = mix(twi, vec3(0.03, 0.05, 0.16), smoothstep(0.35, 0.9, h));
  vec3 nite = mix(vec3(0.025, 0.035, 0.07), vec3(0.006, 0.01, 0.028), smoothstep(0.0, 0.5, h));
  vec3 c;
  if (e > 8.0) c = mix(gold, day, smoothstep(8.0, 22.0, e));
  else if (e > -1.0) c = mix(twi * 1.15, gold, smoothstep(-1.0, 3.0, e));
  else if (e > -8.0) c = mix(nite + 0.25 * twi * smoothstep(-12.0, -2.0, e), twi * 1.15, smoothstep(-8.0, -1.0, e));
  else c = mix(nite, nite + 0.25 * twi, smoothstep(-14.0, -8.0, e));
  float night = 1.0 - smoothstep(-14.0, -4.0, e);

  // ---- stars ----
  if (night > 0.0 && v.y > 0.0) {
    vec3 sp = v * 420.0;
    vec3 ci = floor(sp);
    float st = hash13(ci);
    if (st > 0.985) {
      vec3 cp = ci + 0.5 + (vec3(hash13(ci + 1.7), hash13(ci + 4.1), hash13(ci + 9.3)) - 0.5) * 0.6;
      float d = length(sp - cp);
      float b = pow((st - 0.985) / 0.015, 3.0) * 2.5;
      c += vec3(0.85, 0.9, 1.0) * b * exp(-d * d * 18.0) * night * smoothstep(0.0, 0.08, v.y);
    }
  }

  // ---- clouds: a broken deck ~3 km up, lit from below by the low Sun (dark at night); blurred by the exposure ----
  if (v.y > 0.0 && uCloudCov > 0.0) {
    float dist = 3000.0 / max(v.y, 0.03);
    vec2 p = v.xz * dist / 2600.0 + uCloudPhase;
    float n = mix(0.5, fbm3(vec3(p * vec2(1.0, 0.55), 1.7)), uCloud);
    float cov = smoothstep(0.58, 0.76, n) * (1.0 - smoothstep(25000.0, 60000.0, dist)) * uCloudCov;
    float lit = mix(0.6, fbm3(vec3(p * 3.0, 4.0)), uCloud);
    vec3 cg = mix(vec3(0.28, 0.16, 0.26), vec3(1.1, 0.48, 0.24), (0.3 + 0.7 * lit) * (0.45 + 0.6 * sunSide));
    vec3 cd = mix(vec3(0.75, 0.78, 0.84), vec3(1.0, 0.97, 0.92), lit);
    vec3 cc = e > 8.0 ? mix(cg, cd, smoothstep(8.0, 22.0, e)) : e > -1.0 ? cg : mix(vec3(0.02, 0.025, 0.05), cg * 0.6, smoothstep(-8.0, -1.0, e));
    c = mix(c, cc, cov * mix(0.35, 0.9, uCloud));
  }

  // ---- steam while the oceans boil, then the scorched sky of a hotter Sun ----
  c = mix(c, vec3(1.0, 0.86, 0.68) * (0.8 + 0.4 * sunSide) * (1.0 - 0.3 * h), uHaze * (0.55 + 0.4 * (1.0 - h)));
  // the red giant's light fills the whole sky
  c = mix(c, uSunCol * (0.12 + 0.3 * sunSide) * (0.5 + 0.6 * (1.0 - h)), uGiant * 0.85);

  // ---- the Sun: a disk, or the streak it paints during one frame ----
  {
    float d = arcDist(v, uSunA, uSunB);
    float R = uSunR;
    float norm = pow((2.0 * R) / (uSpread + 2.0 * R), 0.3);   // a streak is dimmer per point than the disk
    float disk = 1.0 - smoothstep(R - uPx * 1.5, R + uPx * 1.5, d);
    // the giant: limb-darkened, mottled with huge convection cells
    float mu = clamp(1.0 - d / max(R, 1e-4), 0.0, 1.0);
    float limb = mix(1.0, 0.45 + 0.55 * sqrt(mu), uGiant);
    float gran = mix(1.0, 0.75 + 0.5 * fbm3(v * 9.0 + vec3(0.0, uTime * 0.03, 0.0)), uGiant);
    c = mix(c, uSunCol * uSunI * norm * limb * gran, disk * clamp(norm * 3.0, 0.0, 1.0));
    float g = (exp(-max(d - R, 0.0) * 12.0) * 0.07 + exp(-max(d - R, 0.0) * 60.0) * 0.35) * norm;
    c += uSunCol * g * min(uSunI, 6.0) * (1.0 - disk) * (1.0 + 2.0 * uGiant);
  }

  // ---- Betelgeuse goes supernova: a point brighter than anything but the Moon ----
  if (uNova > 0.0) {
    float d = acos(clamp(dot(v, uNovaDir), -1.0, 1.0));
    vec3 q = v - uNovaDir * dot(v, uNovaDir);
    float spike = exp(-abs(q.x) * 900.0) * exp(-abs(q.y) * 60.0) + exp(-abs(q.y) * 900.0) * exp(-abs(q.x) * 60.0);
    c += vec3(0.85, 0.9, 1.0) * uNova * (exp(-d * d * 4e5) * 30.0 + exp(-d * 120.0) * 0.8 + exp(-d * 18.0) * 0.12 + spike * 1.6);
  }

  // ---- the asteroid: a fireball bigger than a mountain range swells over the horizon, then rises as a mushroom ----
  float tau = uImpact;
  if (tau > -0.05 && tau < 4.0) {
    vec3 ih = normalize(vec3(uImpDir.x, 0.0, uImpDir.z));
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), ih));
    float ax = asin(clamp(dot(v, side), -1.0, 1.0));          // angle sideways from the impact
    float ay = asin(clamp(v.y, -1.0, 1.0));
    float front = step(0.0, dot(v, ih));
    float t = max(tau, 0.0);
    float flash = exp(-t * 7.0) * smoothstep(-0.05, 0.0, tau);
    c += vec3(1.0, 0.95, 0.85) * flash * (3.0 * exp(-ax * ax * 20.0 - ay * ay * 40.0) * front + 0.6);
    // the fireball: a glowing dome on the horizon, growing, lifting off, cooling to dark smoke
    float Rf = 0.32 * (1.0 - exp(-t / 0.45));                  // radius (radians)
    float lift = max(t - 0.7, 0.0) * 0.12;                      // how far its centre has risen
    vec2 q = vec2(ax, ay - lift) / max(Rf, 1e-3);
    float n = fbm3(vec3(ax * 7.0, ay * 7.0 - t * 0.5, t * 0.4));
    float n2 = fbm3(vec3(ax * 22.0, ay * 22.0 + t, 3.0));
    float r = length(q * vec2(0.85, 1.0)) + (n - 0.5) * 0.55 + (n2 - 0.5) * 0.18;
    float ball = smoothstep(1.0, 0.82, r) * front;
    // the stem of dust and smoke under it once it lifts
    float stem = smoothstep(Rf * 0.35, Rf * 0.18, abs(ax) + (n - 0.5) * 0.04) * step(ay, lift) * step(0.0, ay) * smoothstep(0.7, 1.2, t) * front;
    float heat = exp(-t * 0.55);
    vec3 fire = mix(vec3(1.5, 0.28, 0.05), vec3(3.4, 1.7, 0.45), smoothstep(0.85, 0.0, r) * heat);
    vec3 smokeC = vec3(0.16, 0.11, 0.08) * (0.7 + 0.6 * n) + vec3(1.2, 0.35, 0.08) * smoothstep(0.9, 0.3, r) * 0.6 * heat;
    vec3 pc = mix(smokeC, fire * (0.65 + 0.7 * n2), heat);
    float fadeP = smoothstep(-0.02, 0.06, tau) * (1.0 - smoothstep(2.8, 3.8, tau));
    c = mix(c, pc, max(ball, stem * 0.85) * fadeP);
    c += vec3(1.6, 0.6, 0.18) * exp(-ay * 30.0) * exp(-ax * ax * 6.0) * front * step(0.0, ay) * heat * 1.2 * fadeP;   // the glowing horizon under it
    // debris falling back all over the world lights the sky red, then dust dims it
    float glow = smoothstep(0.35, 1.0, tau) * (1.0 - smoothstep(1.6, 2.6, tau));
    c = mix(c, vec3(0.8, 0.26, 0.09) * (0.8 + 0.5 * (1.0 - h)), glow * 0.45 * (1.0 - ball));
    float dust = smoothstep(1.4, 2.2, tau) * (1.0 - smoothstep(2.6, 3.8, tau));
    c = mix(c, vec3(0.22, 0.16, 0.12) * (0.7 + 0.5 * (1.0 - h)), dust * 0.85);
  }

  c *= uDim;
  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}`;

export function makeSky() {
  const V = () => ({ value: new THREE.Vector3(0, 0, -1) });
  const uniforms = {
    uSunA: V(), uSunB: V(), uSunR: { value: 0.0047 }, uSpread: { value: 0 }, uSunCol: { value: new THREE.Color(1, 0.75, 0.45) },
    uSunI: { value: 4 }, uPx: { value: 0.0006 }, uCloud: { value: 1 }, uCloudPhase: { value: new THREE.Vector2() }, uCloudCov: { value: 1 },
    uNova: { value: 0 }, uNovaDir: V(), uImpact: { value: -10 }, uImpDir: V(), uHaze: { value: 0 }, uGiant: { value: 0 },
    uTime: { value: 0 }, uDim: { value: 1 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// rough blackbody colour (linear RGB, max channel 1) for a temperature in K
export function blackbody(T, out = new THREE.Color()) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const f = (x) => Math.pow(Math.min(255, Math.max(0, x)) / 255, 2.2);
  out.setRGB(f(r), f(g), f(b));
  const m = Math.max(out.r, out.g, out.b);
  return out.multiplyScalar(1 / m);
}
