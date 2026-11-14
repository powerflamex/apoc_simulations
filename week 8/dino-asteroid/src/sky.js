// The sky over Canal Street on a summer evening (the Sun low in the west, behind your right shoulder), and what the
// asteroid does to it:
//   - the rock's flames: once it hits the air the air round it blazes (a bow of white-yellow fire wrapped round its front,
//     tongues streaming back) and it leaves a burning trail of shocked air across the sky, which glows on after it has gone;
//     worked out on the sky in degrees (az, el), the same art-directed path as the rock (timeline.js rockSky);
//   - the glow behind the horizon while it ploughs down out of sight, then the flash;
//   - the fireball: a ball of incandescent rock vapour centred on the crater 952 km away, whose foot is 71 km below your
//     horizon, at its real size (uFbR, km) so only its top rises over the horizon; cauliflower surface, white-hot, then
//     yellow, orange, deep red as it cools and swells;
//   - the red-hot sky: once the rocks thrown out of the crater come back in (8 minutes on), the whole sky glows red.
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
uniform vec3 uSun; uniform float uT; uniform float uPx;
uniform vec2 uRock; uniform float uRockR; uniform vec2 uRockM; uniform float uHot; uniform vec2 uEntry; uniform float uTrail; uniform float uTrailAge;
uniform float uUnder; uniform float uUnderAz;
uniform float uFbR; uniform float uFbHeat; uniform float uFbI; uniform float uDrop; uniform float uDist;
uniform float uFlash; uniform float uRed; uniform float uSmoke; uniform float uDust;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
// cauliflower: rounded puffs with creases between them
float puffs(vec3 p) { float s = 0.0, a = 1.0; for (int i = 0; i < 4; i++) { float n = abs(2.0 * n3(p) - 1.0); n = 1.0 - (1.0 - n) * (1.0 - n); s += a * n; p = p * 2.1 + 3.7; a *= 0.45; } return s / 1.7; }
// soot, deep red, orange, yellow, white
vec3 ramp(float T) {
  vec3 c = mix(vec3(0.03, 0.02, 0.018), vec3(0.5, 0.06, 0.01), smoothstep(0.08, 0.34, T));
  c = mix(c, vec3(2.0, 0.5, 0.05), smoothstep(0.3, 0.58, T));
  c = mix(c, vec3(3.4, 2.0, 0.55), smoothstep(0.54, 0.8, T));
  return mix(c, vec3(4.4, 4.1, 3.7), smoothstep(0.78, 1.08, T));
}
float segDist(vec2 p, vec2 a, vec2 b, out float u) { vec2 ab = b - a; u = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return length(p - a - ab * u); }

void main() {
  vec3 v = normalize(vDir);
  float h = v.y, hh = clamp(h, 0.0, 1.0);
  // sky coordinates in degrees: az 0 straight down the avenue (-z), + to the right; el up
  float az = degrees(atan(v.x, -v.z)), el = degrees(asin(clamp(v.y, -1.0, 1.0)));
  // ---------- the evening sky ----------
  vec3 zen = vec3(0.09, 0.25, 0.66), hor = vec3(0.62, 0.72, 0.86);
  vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.85, hh), 0.5));
  float sd = max(dot(v, uSun), 0.0);
  c += vec3(1.0, 0.7, 0.4) * (pow(sd, 8.0) * 0.35 + pow(sd, 400.0) * 3.0);
  // a few fair-weather clouds, lit warm from the low Sun
  if (h > 0.01) {
    vec2 q = v.xz / (h + 0.08) * 1.5;
    float cl = smoothstep(0.56, 0.8, fbm(vec3(q * 1.2, 1.0))) * smoothstep(0.01, 0.15, h);
    float lit = 0.75 + 0.3 * smoothstep(0.4, 0.9, fbm(vec3(q * 2.6 + 3.0, 2.0)));
    c = mix(c, vec3(1.0, 0.93, 0.84) * lit, cl * 0.85 * (1.0 - uRed));
  }
  // ---------- the rock's fire and its trail ----------
  vec2 P = vec2(az, el);
  if (uTrail > 0.0) {
    float u;
    float d = segDist(P, uEntry, uRock, u);
    // the column of shocked air: thin and white-hot right behind the rock, wider, redder and smokier where it is older
    float age = uTrailAge * (1.0 - u) + 0.05;
    float w = uRockR * (0.38 + 0.3 * u) + 0.5 * age;
    float tn = fbm(vec3(P * 0.45, uT * 0.4)) - 0.5;
    float core = exp(-pow(d / (w * (0.55 + 0.4 * tn)), 2.0));
    float T = min(0.7, uHot * (0.7 * exp(-age / 2.4) + 0.22) + 0.25 * tn);
    vec3 tc = mix(vec3(0.32, 0.22, 0.15), ramp(T) * 0.5, smoothstep(0.2, 0.45, T));
    c = mix(c, tc, core * uTrail * smoothstep(-0.5, 0.6, el) * 0.85);
  }
  if (uHot > 0.0) {
    // the bow of fire round the rock and the tongues streaming back from it (in the rock's frame, in rock radii)
    vec2 m = normalize(uRockM);
    vec2 dp = (P - uRock) / uRockR;
    float bx = dot(dp, -m), by = dot(dp, vec2(-m.y, m.x));
    float len = 1.5 + 9.0 * uHot;
    float wid = 0.95 + 0.22 * max(bx, 0.0);
    float tong = fbm(vec3(bx * 1.3 - uT * 7.0, by * 2.2, uT * 0.8));
    float body = exp(-pow(by / (wid * (0.75 + 0.5 * tong)), 2.0)) * smoothstep(-1.12, -0.8, bx) * exp(-max(bx, 0.0) / len);
    float glare = exp(-length(dp) / 1.0) * 0.4;
    float T = min(0.8, 0.82 - 0.05 * max(bx, 0.0) + 0.3 * (tong - 0.5) - 0.25 * abs(by) / wid);
    c = mix(c, ramp(T) * 0.62, clamp(body * 1.4, 0.0, 1.0) * uHot);
    c += vec3(1.0, 0.5, 0.15) * (glare * 0.35 + exp(-length(dp) / 2.6) * 0.12) * uHot;
  }
  // ---------- the glow behind the horizon, then the flash ----------
  {
    float dx = (az - uUnderAz) / 14.0;
    float g = exp(-dx * dx) * exp(-max(el, 0.0) / (4.0 + 6.0 * uUnder)) * uUnder;
    c += vec3(1.0, 0.55, 0.22) * g * 0.9;
    float f = exp(-abs(az) / 40.0) * exp(-max(el, 0.0) / 30.0);
    c += vec3(1.0, 0.94, 0.85) * uFlash * (1.4 * f + 0.25);
  }
  // ---------- the fireball (km; you at the origin, the crater's ground 71 km below your horizon, straight ahead) ----------
  if (uFbR > uDrop * 0.6) {
    vec3 C = vec3(0.0, -uDrop, -uDist);
    float tc = dot(C, v);
    vec3 cl = v * tc - C;
    float miss = length(cl);
    vec3 nd = cl / max(miss, 1e-3);
    // a ragged, boiling edge
    float edge = uFbR * (1.0 + 0.045 * (fbm(vec3(nd * 7.0 + uT * 0.05)) - 0.5) + 0.02 * (n3(nd * 30.0 + uT * 0.2) - 0.5));
    float aw = uPx * tc * 1.5;
    float cov = 1.0 - smoothstep(edge - aw, edge + aw, miss);
    // the glow in the air round it
    float od = max(miss - edge, 0.0) / uDist;
    vec3 gc = mix(vec3(1.0, 0.4, 0.12), vec3(1.0, 0.85, 0.65), smoothstep(0.6, 1.05, uFbHeat));
    c += gc * uFbI * (exp(-od / 0.02) * 0.5 + exp(-od / 0.12) * 0.25 + exp(-od / 0.5) * 0.08) * smoothstep(-0.02, 0.03, h);
    if (cov > 0.0) {
      float hit = tc - sqrt(max(edge * edge - miss * miss, 0.0));
      vec3 p = v * hit;
      vec3 N = normalize(p - C);
      float mu = max(dot(N, -v), 0.0);
      vec3 q = N * (5.0 + 0.004 * uFbR) + vec3(0.0, -uT * 0.012, 0.0);
      float pf = puffs(q * 1.6);
      float m1 = fbm(q * 0.9 + 2.0);
      float T = uFbHeat * (0.82 + 0.3 * pow(mu, 0.6)) + (m1 - 0.5) * (0.3 + 0.8 * (1.1 - min(uFbHeat, 1.1))) + 0.14 * (pf - 0.5);
      // its foot, low over the horizon, is dust and debris
      T -= 0.35 * smoothstep(0.06, 0.0, h) * smoothstep(0.75, 0.4, uFbHeat);
      vec3 fc = ramp(T) * (0.32 + 0.18 * uFbI / 2.4);
      fc *= 0.75 + 0.45 * smoothstep(0.2, 0.8, pf);
      // (a little haze between)
      fc = mix(fc, c, 0.08);
      c = mix(c, fc, cov);
    }
  }
  // ---------- the red-hot sky: the debris coming back in, the smoke of the fires ----------
  if (uRed > 0.0) {
    float n = fbm(vec3(v.xz / (abs(h) + 0.25) * 2.0, uT * 0.03));
    float streak = fbm(vec3(az * 0.08, el * 0.5 + uT * 0.6, 3.0));
    vec3 red = mix(vec3(1.25, 0.32, 0.05), vec3(0.3, 0.05, 0.015), smoothstep(0.0, 0.7, hh));
    red *= 0.65 + 0.7 * n + 0.25 * smoothstep(0.55, 0.8, streak);
    red += vec3(1.0, 0.45, 0.1) * exp(-abs(az) / 35.0) * exp(-max(el, 0.0) / 10.0) * 0.8;
    c = mix(c, red, uRed);
  }
  // the dust thrown up ahead of the blast: the sky low down browns
  c = mix(c, vec3(0.32, 0.2, 0.12) * (0.7 + 0.5 * uRed), uDust * smoothstep(0.35, 0.0, h) * 0.85);
  // below the horizon (the land and the river cover it)
  c = mix(c, hor * 0.6, smoothstep(0.0, -0.05, h));
  gl_FragColor = vec4(clamp(c, 0.0, 40.0), 1.0);
}`;

export function makeSky() {
  const V2 = (x, y) => ({ value: new THREE.Vector2(x, y) });
  const uniforms = {
    uSun: { value: new THREE.Vector3(0.6, 0.35, 0.7).normalize() }, uT: { value: 0 }, uPx: { value: 0.0006 },
    uRock: V2(-10, 20), uRockR: { value: 5 }, uRockM: V2(0.3, -1), uHot: { value: 0 }, uEntry: V2(-10, 20), uTrail: { value: 0 }, uTrailAge: { value: 0 },
    uUnder: { value: 0 }, uUnderAz: { value: -6 },
    uFbR: { value: 0 }, uFbHeat: { value: 1 }, uFbI: { value: 0 }, uDrop: { value: 71 }, uDist: { value: 952 },
    uFlash: { value: 0 }, uRed: { value: 0 }, uSmoke: { value: 0 }, uDust: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
