// The night sky, and whichever planet sits where the Moon is.
//   The planet is a real ball at the Moon's distance: every pixel's ray is intersected with a sphere of radius uR
//   (in units of the distance, so uR = sin of its angular radius) around the direction uP, which gives the true
//   perspective of something that close (you see less than half of it). The point hit is turned into latitude and
//   longitude about the planet's own axis (uAxis) and painted: the Moon's maria, Mars's dark plains and polar cap,
//   Venus's pale cloud swirls, Neptune's dark spot and white streaks, Saturn's soft bands, Jupiter's zones, belts and
//   Great Red Spot. It is lit by the Sun from behind you and to one side (uSunD), so one limb darkens: a ball, not a disc.
//   Saturn's rings (uRing): the ray is intersected with the ring plane; C, B and A rings with the Cassini division and
//   the Encke gap, in front of the ball and behind it, the ball's shadow across them and their shadow on the ball.
//   Two planets (uKa, uKb) are blended by uMix for the ~0.1 s of a switch; the rings keep Saturn's own axis (uAxisR)
//   while they fade, so they never flip onto the next planet's tilt.
//   The sky: a gradient between uTop and uLow, tinted toward the planet (uNear); stars when it is dim (uNight);
//   a few clouds low down lit by the planet; a glare around it that grows with its brightness (uGlare).
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
uniform vec3 uP; uniform vec3 uSunD; uniform vec3 uAxisA; uniform vec3 uAxisB; uniform vec3 uAxisR; uniform float uR; uniform float uPx; uniform float uT;
uniform int uKa; uniform int uKb; uniform float uMix; uniform float uRing; uniform float uPI;
uniform float uGlare; uniform vec3 uGlareCol;
uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uNear; uniform float uNight;
uniform float uCloud; uniform float uDrift;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float fbm4(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.11 + 3.3; a *= 0.5; } return s; }
float band(float L, float a, float b, float e) { return smoothstep(a - e, a + e, L) * (1.0 - smoothstep(b - e, b + e, L)); }

// ---- the planets' faces: n is the surface normal in the planet's own frame (y = its north pole, z = toward you) ----
vec3 moonC(vec3 n) {
  float m = fbm3(n * 2.3 + 1.0), m2 = fbm4(n * 9.0);
  vec3 c = mix(vec3(0.66, 0.65, 0.62), vec3(0.3, 0.3, 0.32), smoothstep(0.46, 0.6, m));
  return c * (0.88 + 0.24 * m2);
}
vec3 marsC(vec3 n) {
  float m = fbm3(n * 2.6 + 4.0), m2 = fbm4(n * 7.0);
  vec3 c = mix(vec3(0.95, 0.33, 0.1), vec3(0.4, 0.12, 0.05), smoothstep(0.48, 0.66, m + 0.25 * (m2 - 0.5)));
  c *= 0.88 + 0.24 * m2;
  return mix(c, vec3(0.96, 0.94, 0.9), smoothstep(0.925, 0.96, n.y + 0.04 * (m2 - 0.5)));      // the north polar cap
}
vec3 venusC(vec3 n) {
  float lon = atan(n.x, n.z), L = degrees(asin(clamp(n.y, -1.0, 1.0)));
  float sw = fbm4(vec3(lon * 2.2 + abs(L) * 0.035, L * 0.07, 3.0));                          // the swept-back cloud bands
  return mix(vec3(1.0, 0.95, 0.8), vec3(0.86, 0.74, 0.5), smoothstep(0.35, 0.75, sw) * 0.6);
}
vec3 neptuneC(vec3 n) {
  float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.x, n.z), L = degrees(lat);
  vec3 c = mix(vec3(0.07, 0.22, 0.78), vec3(0.17, 0.4, 0.95), 0.5 + 0.5 * sin(L * 0.13 + 1.0));
  c *= 0.86 + 0.28 * fbm3(vec3(lon * 2.0, L * 0.22, 1.0));
  vec2 g = vec2((lon + 0.3) * cos(lat) * 57.3 / 10.0, (L + 22.0) / 5.5);                      // the Great Dark Spot
  c = mix(c, vec3(0.02, 0.07, 0.36), (1.0 - smoothstep(0.7, 1.1, length(g))) * 0.85);
  float ci = smoothstep(0.6, 0.78, fbm4(vec3(lon * 5.0, L * 0.9, 7.0))) * band(abs(L), 14.0, 46.0, 6.0);   // white cirrus streaks
  ci = max(ci, (1.0 - smoothstep(0.0, 0.25, abs(length(g - vec2(0.0, -1.15)) - 0.5))) * step(g.y, -0.6) * 0.8);
  return mix(c, vec3(0.86, 0.93, 1.0), ci * 0.75);
}
vec3 saturnC(vec3 n) {
  float lon = atan(n.x, n.z);
  float L = degrees(asin(clamp(n.y, -1.0, 1.0))) + (fbm3(vec3(n.x, n.y * 3.0, n.z) * 3.0) - 0.5) * 2.5;
  vec3 a = vec3(0.93, 0.82, 0.57), b = vec3(0.76, 0.6, 0.37), g = vec3(0.66, 0.6, 0.5);
  float s = 0.5 + 0.5 * sin(L * 0.31 + 0.7 * sin(L * 0.11));
  float s2 = 0.5 + 0.5 * sin(L * 0.92 + 1.3);
  vec3 c = mix(a, b, s * 0.7 + 0.18 * s2);
  c = mix(c, g, smoothstep(52.0, 78.0, abs(L)));
  return c * (0.92 + 0.14 * fbm4(vec3(lon * 2.5, L * 0.5, 2.0)));
}
vec3 jupiterC(vec3 n) {
  float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.x, n.z);
  // the bands' edges ripple and curl
  float w = fbm3(vec3(n.x, n.y * 3.0, n.z) * 3.5) - 0.5;
  float w2 = fbm4(vec3(lon * 6.0, lat * 26.0, 1.7)) - 0.5;
  float L = degrees(lat) + w * 4.5 + w2 * 2.6;
  vec3 zone = vec3(0.9, 0.81, 0.64), belt = vec3(0.6, 0.27, 0.13), beltD = vec3(0.36, 0.15, 0.08), pole = vec3(0.47, 0.4, 0.36);
  float b = band(L, 7.0, 19.0, 1.4) + 0.92 * band(L, -20.0, -8.0, 1.4) + 0.6 * band(L, 26.0, 32.0, 1.2) + 0.55 * band(L, -37.0, -31.0, 1.2)
    + 0.4 * band(L, 40.0, 45.0, 1.5) + 0.4 * band(L, -50.0, -44.0, 1.5);
  b = clamp(b, 0.0, 1.0);
  vec3 c = mix(zone, belt, b);
  // long streaks drawn out along the bands, darker knots inside the belts
  float st = fbm4(vec3(lon * 3.0 + w * 2.0, L * 0.9, 4.0));
  c *= 0.84 + 0.3 * st;
  c = mix(c, beltD, smoothstep(0.52, 0.78, st) * b * 0.65);
  c = mix(c, vec3(0.97, 0.92, 0.8), smoothstep(0.6, 0.85, fbm4(vec3(lon * 7.0, L * 0.5, 9.0))) * (1.0 - b) * 0.4);
  // grey-blue festoons hanging off the north belt into the equatorial zone
  c = mix(c, vec3(0.5, 0.56, 0.68), band(L, 3.5, 8.0, 1.2) * smoothstep(0.48, 0.7, fbm3(vec3(lon * 9.0 + L * 0.25, 1.0, 2.0))) * 0.55);
  // the poles: dull, mottled
  c = mix(c, pole * (0.8 + 0.45 * fbm3(n * 9.0)), smoothstep(48.0, 68.0, abs(L)));
  // the Great Red Spot at 22 S: an oval in a pale hollow at the south belt's edge
  vec2 g = vec2((lon - 0.33) * cos(lat) * 57.3 / 9.5, (degrees(lat) + 22.0) / 6.0);
  float gr = length(g);
  c = mix(c, zone * 0.98, (1.0 - smoothstep(1.0, 1.75, gr)) * 0.8);
  float swirl = fbm3(vec3(g * 2.2 + 0.35 * vec2(sin(gr * 5.0), cos(gr * 5.0)), 3.0));
  vec3 spot = mix(vec3(0.8, 0.22, 0.1), vec3(0.55, 0.12, 0.06), swirl);
  spot = mix(spot, vec3(0.5, 0.14, 0.09), smoothstep(0.75, 1.0, gr) * 0.6);
  return mix(c, spot, 1.0 - smoothstep(0.86, 1.04, gr));
}
vec3 face(int k, vec3 n) {
  if (k == 0) return moonC(n);
  if (k == 1) return marsC(n);
  if (k == 2) return venusC(n);
  if (k == 3) return neptuneC(n);
  if (k == 4) return saturnC(n);
  return jupiterC(n);
}
// how fast it darkens toward the limb: a dusty ball stays flat (the full Moon), clouds darken
float limbK(int k) { return k == 0 ? 0.12 : k == 1 ? 0.35 : k == 2 ? 0.75 : 0.85; }
vec3 lit(int k, vec3 N, vec3 axis) {
  vec3 W = -uP;
  vec3 X = normalize(cross(axis, W));
  vec3 Z = cross(X, axis);
  vec3 n = vec3(dot(N, X), dot(N, axis), dot(N, Z));
  float mu0 = dot(N, uSunD), mu = max(dot(N, W), 0.0);
  float sh = pow(max(mu0, 0.0), limbK(k)) * smoothstep(-0.02, 0.1, mu0) * (0.72 + 0.28 * pow(mu, 0.5));
  return face(k, n) * sh;
}
// Saturn's rings: how dense at r (in the planet's mean radii), and their colour
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(fract(sin(i * 127.1) * 43758.5), fract(sin((i + 1.0) * 127.1) * 43758.5), f); }
float ringDen(float r) {
  float c = smoothstep(1.28, 1.36, r) * (1.0 - smoothstep(1.565, 1.585, r)) * 0.2;
  float b = smoothstep(1.575, 1.6, r) * (1.0 - smoothstep(2.008, 2.02, r)) * (0.82 + 0.18 * n1(r * 70.0));
  float a = smoothstep(2.095, 2.105, r) * (1.0 - smoothstep(2.338, 2.35, r)) * 0.66 * (0.25 + 0.75 * smoothstep(0.0, 0.007, abs(r - 2.294)));
  return (c + b + a) * (0.86 + 0.14 * n1(r * 190.0));
}
vec3 ringCol(float r) {
  vec3 c = mix(vec3(0.55, 0.5, 0.44), vec3(0.95, 0.87, 0.7), smoothstep(1.5, 1.62, r));
  c = mix(c, vec3(0.84, 0.78, 0.66), smoothstep(2.0, 2.1, r));
  return c * (0.84 + 0.2 * n1(r * 45.0));
}

void main() {
  vec3 v = normalize(vDir);
  float h = v.y;
  float cs = dot(v, uP);
  float sn = length(cross(v, uP));
  float ang = atan(sn, cs);
  float hh = clamp(h, 0.0, 1.0);
  vec3 ph = normalize(vec3(uP.x, 0.0, uP.z));
  float az = max(dot(normalize(vec3(v.x, 0.0, v.z) + 1e-5), ph), 0.0);
  // ---------- the sky ----------
  vec3 low = mix(uLow, uNear, pow(az, 5.0) * (1.0 - smoothstep(0.0, 0.45, hh)));
  vec3 c = mix(low, uTop, pow(smoothstep(0.0, 0.7, hh), 0.6));
  c = mix(c, uNear, 0.35 * exp(-ang / 0.5));
  // stars in a dim sky (three sizes, sparse)
  if (uNight > 0.0 && h > 0.0) {
    for (int k = 0; k < 3; k++) {
      float K = k == 0 ? 70.0 : k == 1 ? 140.0 : 260.0;
      vec3 q = v * K;
      vec3 cell = floor(q);
      float st = hash13(cell + float(k) * 11.0);
      vec3 pp = fract(q) - 0.5 - (vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5) * 0.6;
      float star = step(0.992, st) * exp(-dot(pp, pp) * (k == 0 ? 520.0 : 240.0)) * (0.5 + 2.5 * (st - 0.992) / 0.008);
      c += mix(vec3(1.0, 0.92, 0.82), vec3(0.82, 0.9, 1.0), hash13(cell + 9.0)) * star * uNight * smoothstep(0.02, 0.2, h) * (k == 0 ? 2.2 : 1.0);
    }
  }
  // a few clouds low down, lit by the planet
  if (h > 0.0 && uCloud > 0.0) {
    float dist = 2200.0 / max(h, 0.035);
    vec2 p = v.xz * dist + vec2(uDrift, uDrift * 0.3);
    float n = fbm3(vec3(p / 1700.0, 2.0));
    float cov = smoothstep(0.58, 0.74, n) * 0.8 * (1.0 - smoothstep(16000.0, 50000.0, dist)) * uCloud;
    vec3 cc = mix(uLow * 1.1, uNear * 1.5, pow(max(cs, 0.0), 5.0));
    cc *= 0.75 + 0.3 * fbm3(vec3(p / 420.0, 5.0));
    c = mix(c, cc, cov * 0.85);
  }
  // the glare around the planet
  float out1 = max(ang - asin(clamp(uR, 0.0, 1.0)), 0.0);
  c += uGlareCol * exp(-out1 / (0.008 + 0.035 * uGlare)) * uGlare * 1.0;
  c += uGlareCol * exp(-out1 / 0.004) * 0.9 * min(uGlare + 0.2, 1.0);
  c += uGlareCol * exp(-out1 / (0.22 * uGlare + 0.02)) * uGlare * 0.14;

  // ---------- the rings (against the sky, and behind the ball) ----------
  float e = max(uPx * 1.3, uR * 0.002);
  float hit = step(0.0, cs) * (1.0 - smoothstep(uR - e, uR + e, sn));
  float tS = cs - sqrt(max(uR * uR - sn * sn, 0.0));          // how far along the ray the ball's near side is
  vec3 rc = vec3(0.0); float ra = 0.0, tR = 1e9;
  if (uRing > 0.0) {
    float den = dot(v, uAxisR);
    float tr = dot(uP, uAxisR) / (abs(den) > 1e-6 ? den : 1e-6);
    if (tr > 0.0) {
      vec3 m = v * tr - uP;
      float rr = length(m) / uR;
      // finer than a pixel far out along the rings: fade the fine structure, keep the average
      ra = ringDen(rr) * uRing;
      float bs = dot(m, uSunD);
      float miss = sqrt(max(dot(m, m) - bs * bs, 0.0));
      float shd = bs < 0.0 ? smoothstep(uR * 0.97, uR * 1.02, miss) : 1.0;                    // the ball's shadow on them
      rc = ringCol(rr) * (0.05 + 0.95 * shd) * uPI;
      tR = tr;
    }
  }
  c = mix(c, rc, ra);
  // ---------- the ball ----------
  if (hit > 0.0) {
    vec3 N = normalize(v * tS - uP);
    vec3 pc = lit(uKb, N, uAxisB);
    if (uMix < 0.999) pc = mix(lit(uKa, N, uAxisA), pc, uMix);
    // the rings' shadow across it
    if (uRing > 0.0) {
      vec3 Ph = v * tS;
      float sd = dot(uSunD, uAxisR);
      float s2 = dot(uP - Ph, uAxisR) / (abs(sd) > 1e-5 ? sd : 1e-5);
      if (s2 > 0.0) { float rq = length(Ph + uSunD * s2 - uP) / uR; pc *= 1.0 - 0.8 * ringDen(rq) * uRing; }
    }
    c = mix(c, pc * uPI, hit);
    if (tR < tS) c = mix(c, rc, ra * hit);                    // the part of the rings in front of it
  }
  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}`;

export function makeSky() {
  const V = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const C = (r, g, b) => ({ value: new THREE.Color(r, g, b) });
  const uniforms = {
    uP: V(0, 0.2, -1), uSunD: V(0, -0.5, 1), uAxisA: V(0, 1, 0), uAxisB: V(0, 1, 0), uAxisR: V(0, 1, 0), uR: { value: 0.0045 }, uPx: { value: 0.0006 }, uT: { value: 0 },
    uKa: { value: 0 }, uKb: { value: 0 }, uMix: { value: 1 }, uRing: { value: 0 }, uPI: { value: 2 },
    uGlare: { value: 0.3 }, uGlareCol: C(1, 0.9, 0.75),
    uTop: C(0.02, 0.03, 0.08), uLow: C(0.1, 0.12, 0.2), uNear: C(0.2, 0.25, 0.4), uNight: { value: 1 },
    uCloud: { value: 0.5 }, uDrift: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
