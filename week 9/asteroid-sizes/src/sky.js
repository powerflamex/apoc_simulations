// The sky over the bay on a clear morning (the Sun behind you, high on your right; the sky in front deep blue), and what
// each asteroid does to it, worked out on the sky in degrees (az 0 = straight ahead over downtown, + right; el up):
//   - a fireball crossing it (stops 1-2): a blinding white head with a glare, a white-hot trail turning to a lit smoke
//     trail behind it; the house-size one flares and bursts high up, leaving a glowing cloud that cools to brown smoke;
//   - the bigger rocks' trails of burning air (stops 3-4, drawn behind the rocks themselves, which are meshes);
//   - the flash, the dust low over the city after a blast, and the sky set on fire by the mountain-size rock.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.999999;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun; uniform float uT;
uniform vec2 uHead; uniform vec2 uTail; uniform float uHeadR; uniform float uHot; uniform float uTrail; uniform float uAge; uniform float uTrailW;
uniform float uBurst; uniform float uBurstR; uniform vec2 uBurstP; uniform float uCloud;
uniform float uFlash; uniform vec2 uFlashP; uniform float uFire; uniform vec2 uFireP; uniform float uDust; uniform float uDim;
uniform vec3 uHazeC;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
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
  float az = degrees(atan(v.x, -v.z)), el = degrees(asin(clamp(v.y, -1.0, 1.0)));
  vec2 P = vec2(az, el);
  // ---------- the morning sky: deep blue ahead (away from the Sun), paler low down ----------
  vec3 zen = vec3(0.07, 0.22, 0.62), hor = vec3(0.56, 0.7, 0.88);
  vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.7, hh), 0.55));
  float sd = max(dot(v, uSun), 0.0);
  c += vec3(1.0, 0.85, 0.6) * (pow(sd, 6.0) * 0.25 + pow(sd, 900.0) * 6.0);
  // fair-weather clouds: flat bottoms, lit from behind you (bright faces, a grey underside)
  if (h > 0.005) {
    vec2 q = v.xz / (h + 0.06) * 1.25 + vec2(uT * 0.004, 0.0);
    float base = fbm(vec3(q * 1.1, 1.0));
    float cl = smoothstep(0.55, 0.78, base) * smoothstep(0.005, 0.1, h) * (1.0 - 0.5 * smoothstep(0.35, 0.8, h));
    float lit = 0.8 + 0.28 * smoothstep(0.35, 0.85, fbm(vec3(q * 3.0 + 3.0, 2.0)));
    vec3 cc = mix(vec3(0.72, 0.76, 0.84), vec3(1.05, 1.02, 0.98), lit - 0.3) * (1.0 - 0.75 * uDim);
    c = mix(c, cc, cl * 0.9 * (1.0 - uFire));
  }
  c *= 1.0 - 0.7 * uDim;
  // ---------- a trail across the sky: white-hot behind the head, then lit smoke ----------
  if (uTrail > 0.0) {
    float u;
    float d = segDist(P, uTail, uHead, u);
    float age = uAge * (1.0 - u) + 0.02;
    float w = uTrailW * (0.5 + 0.5 * u) + 0.22 * age;
    float tn = fbm(vec3(P * 0.9, uT * 0.3)) - 0.5;
    // (two twisted lobes, as the Chelyabinsk trail had)
    float twist = sin(age * 2.2 + u * 9.0) * 0.35 * w;
    float core = exp(-pow((d - abs(twist) * 0.5) / (w * (0.7 + 0.45 * tn)), 2.0));
    float T = uHot * (0.95 * exp(-age / 1.4)) + 0.05 * tn;
    vec3 smoke = vec3(0.86, 0.84, 0.8) * (0.72 + 0.4 * (fbm(vec3(P * 2.3, 3.0)) - 0.3)) * (1.0 - 0.6 * uDim);
    vec3 tc = mix(smoke, ramp(0.62 + 0.4 * T) * 0.7, smoothstep(0.08, 0.4, T));
    float a = core * uTrail * smoothstep(0.0, 0.2, el + 1.0);
    c = mix(c, tc, clamp(a * (0.75 + 0.25 * T), 0.0, 1.0));
    c += vec3(1.0, 0.7, 0.4) * exp(-d / (w * 2.5)) * 0.25 * T * uTrail;
  }
  // ---------- the head: a blinding ball with flames streaming back from it ----------
  if (uHot > 0.0) {
    vec2 m = normalize(uHead - uTail);
    vec2 dp = (P - uHead) / uHeadR;
    float bx = dot(dp, -m), by = dot(dp, vec2(-m.y, m.x));
    float tong = fbm(vec3(bx * 1.3 - uT * 9.0, by * 2.2, uT * 0.8));
    float wid = 0.8 + 0.2 * max(bx, 0.0);
    float body = exp(-pow(by / (wid * (0.7 + 0.6 * tong)), 2.0)) * smoothstep(-1.0, -0.6, bx) * exp(-max(bx, 0.0) / 5.5);
    float r = length(dp);
    // the flames: white-yellow at the head, orange, then red as they stream back
    c = mix(c, ramp(0.9 - 0.045 * max(bx, 0.0) + 0.25 * (tong - 0.5)) * 0.55, clamp(body * 1.5, 0.0, 1.0) * uHot);
    // the head itself: a crisp white-hot ball
    c = mix(c, vec3(7.0, 6.5, 5.6), (1.0 - smoothstep(0.75, 1.0, r)) * uHot);
    // the glare: the head is brighter than the Sun (the bloom spreads it further)
    c += vec3(1.0, 0.9, 0.75) * uHot * (exp(-r / 1.1) * 0.9 + exp(-r / 5.0) * 0.16 + exp(-r / 18.0) * 0.05);
  }
  // ---------- the burst high up: a flare, then a glowing cloud that cools to brown smoke ----------
  if (uCloud > 0.0) {
    vec2 dp = (P - uBurstP) / uBurstR;
    float r = length(dp * vec2(1.0, 1.25));
    vec3 q = vec3(dp * 2.2, uT * 0.05);
    float pf = puffs(q);
    float edge = 1.0 - smoothstep(0.75 + 0.3 * pf, 1.05 + 0.3 * pf, r);
    float T = 0.85 * exp(-uBurst / 0.6) + 0.25 * exp(-uBurst / 3.0);
    vec3 cc = mix(vec3(0.62, 0.52, 0.44) * (0.6 + 0.5 * pf) * (1.0 - 0.5 * uDim), ramp(0.55 + 0.45 * T + 0.1 * pf) * 0.6, smoothstep(0.15, 0.5, T));
    c = mix(c, cc, edge * uCloud * 0.9);
    c += vec3(1.0, 0.8, 0.55) * exp(-r * 1.5) * T * uCloud * 1.5;
  }
  // ---------- the sky on fire (the mountain-size rock's shock and fireball spreading over everything) ----------
  if (uFire > 0.0) {
    vec2 d2 = (P - uFireP) * vec2(1.0, 1.4);
    float r = length(d2);
    float n = fbm(vec3(P * 0.06, uT * 0.25));
    float n2 = fbm(vec3(P * 0.18 + vec2(0.0, uT * 0.6), uT * 0.4));
    float T = 0.78 - r / 160.0 + 0.55 * (n - 0.5) + 0.4 * (n2 - 0.5);
    vec3 fc = mix(vec3(0.06, 0.03, 0.02) * (0.6 + 0.8 * n2), ramp(clamp(T, 0.3, 0.8)) * 0.4, smoothstep(0.5, 0.78, T));
    c = mix(c, fc, uFire);
  }
  // ---------- the dust a blast throws up over the city ----------
  c = mix(c, uHazeC, uDust * smoothstep(0.32, -0.02, h));
  // ---------- the flash ----------
  {
    vec2 d2 = P - uFlashP;
    float f = exp(-length(d2) / 25.0);
    c += vec3(1.0, 0.95, 0.88) * uFlash * (1.6 * f + 0.12);
  }
  c = mix(c, hor * 0.7 * (1.0 - 0.7 * uDim), smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const V2 = (x, y) => ({ value: new THREE.Vector2(x, y) });
  const uniforms = {
    uSun: { value: new THREE.Vector3(0.3, 0.5, 0.8).normalize() }, uT: { value: 0 },
    uHead: V2(0, 10), uTail: V2(10, 20), uHeadR: { value: 1 }, uHot: { value: 0 }, uTrail: { value: 0 }, uAge: { value: 0 }, uTrailW: { value: 0.5 },
    uBurst: { value: 0 }, uBurstR: { value: 4 }, uBurstP: V2(0, 10), uCloud: { value: 0 },
    uFlash: { value: 0 }, uFlashP: V2(0, 5), uFire: { value: 0 }, uFireP: V2(0, 0), uDust: { value: 0 }, uDim: { value: 0 },
    uHazeC: { value: new THREE.Color(0.55, 0.47, 0.4) },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
