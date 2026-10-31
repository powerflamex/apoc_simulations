// The sky, and whichever star is in it.
//   The star: a disc uAng (rad) in radius around uSun, its colour from its surface temperature (uStarCol), darker at
//   the edge (limb darkening); the big ones (uGran) show boiling convection cells and a ragged, glowing rim; a glare
//   around it that grows with its brightness (uGlare). A tiny one (Proxima) is a blazing point with a red halo.
//   The sky: a gradient between uTop and uLow, warmed toward the star (uNear); fair-weather clouds lit by the star;
//   faint stars when it's dim (uNight); smoke from the burning city low down (uSmoke), the sky darkening away from the
//   star (uDark) so the disc reads.
//   uInside (Betelgeuse): we're inside the star: boiling orange-white plasma in every direction.
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
uniform vec3 uSun; uniform float uAng; uniform float uPx; uniform float uT;
uniform vec3 uStarCol; uniform float uStarI; uniform float uGran; uniform float uGlare; uniform vec3 uGlareCol;
uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uNear; uniform float uNight;
uniform float uSmoke; uniform float uDark; uniform float uCloud; uniform float uDrift; uniform float uInside; uniform float uSnap;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// cells (Worley): distance to the nearest and second-nearest random point
vec2 worley(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(hash13(i + g), hash13(i + g + 17.3), hash13(i + g + 31.7));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
float fbm4(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.11 + 3.3; a *= 0.5; } return s; }

void main() {
  vec3 v = normalize(vDir);
  float h = v.y;
  float cs = dot(v, uSun);
  float ang = acos(clamp(cs, -1.0, 1.0));
  float hh = clamp(h, 0.0, 1.0);
  vec3 sh = normalize(vec3(uSun.x, 0.0, uSun.z));
  float az = max(dot(normalize(vec3(v.x, 0.0, v.z) + 1e-5), sh), 0.0);
  // ---------- the sky ----------
  vec3 low = mix(uLow, uNear, pow(az, 6.0) * (1.0 - smoothstep(0.0, 0.3, hh)));
  vec3 c = mix(low, uTop, pow(smoothstep(0.0, 0.65, hh), 0.6));
  // faint stars in a dim sky
  if (uNight > 0.0 && h > 0.0) {
    vec3 q = v * 300.0;
    vec3 cell = floor(q);
    float st = hash13(cell);
    vec3 pp = fract(q) - 0.5 - (vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5) * 0.6;
    float star = step(0.985, st) * exp(-dot(pp, pp) * 90.0) * (0.4 + 2.0 * (st - 0.985) / 0.015);
    c += vec3(0.9, 0.92, 1.0) * star * uNight * smoothstep(0.02, 0.2, h);
  }
  // fair-weather clouds near the horizon, lit by the star from behind
  if (h > 0.0 && uCloud > 0.0) {
    float dist = 2200.0 / max(h, 0.035);
    vec2 p = v.xz * dist + vec2(uDrift, uDrift * 0.3);
    float n = fbm3(vec3(p / 1700.0, 2.0));
    float cov = smoothstep(0.58, 0.74, n) * 0.8 * (1.0 - smoothstep(16000.0, 50000.0, dist)) * uCloud;
    vec3 cc = mix(uLow * 1.05, uNear * 1.4, pow(max(cs, 0.0), 5.0));
    cc *= 0.75 + 0.3 * fbm3(vec3(p / 420.0, 5.0));
    c = mix(c, cc, cov * 0.85);
  }
  // smoke from the burning city low down, the sky darkening away from the star
  float lowK = 1.0 - smoothstep(-0.02, 0.4, h);
  c = mix(c, vec3(0.4, 0.27, 0.17) * (0.6 + 0.8 * pow(max(cs, 0.0), 4.0)) * (0.5 + 0.5 * length(uNear)), uSmoke * (0.2 + 0.55 * lowK));
  c *= 1.0 - uDark * (0.65 - 0.5 * pow(max(cs, 0.0), 4.0));
  // the glare around the star
  float R = uAng;
  float out1 = max(ang - R, 0.0);
  c += uGlareCol * exp(-out1 / (0.008 + 0.035 * uGlare)) * uGlare * 1.1;
  c += uGlareCol * exp(-out1 / 0.003) * 1.2 * min(uGlare + 0.3, 1.0);
  c += uGlareCol * exp(-out1 / (0.2 * uGlare + 0.02)) * uGlare * 0.15;
  // ---------- the star ----------
  vec3 e1 = normalize(cross(uSun, vec3(0.0, 1.0, 0.0)));
  vec3 e2 = cross(e1, uSun);
  vec3 vp = v - uSun * cs;
  float lp = length(vp);
  vec2 dir2 = lp > 1e-6 ? vec2(dot(vp, e1), dot(vp, e2)) / lp : vec2(1.0, 0.0);
  vec2 q = dir2 * ang / max(R, 1e-5);             // |q| = 1 at the rim
  float rq = length(q);
  float th = atan(dir2.y, dir2.x);
  // a disc smaller than a pixel still shows as a blazing point (its light spread over ~a pixel)
  float Rs = max(R, uPx * 1.2);
  float rim = 1.0 + 0.02 * uGran * (fbm4(vec3(cos(th) * 5.0, sin(th) * 5.0, uT * 0.3)) - 0.5) * 2.0;
  float edgeW = max(uPx * 1.3 / Rs, 0.004);
  float rqs = ang / Rs;
  float inside = 1.0 - smoothstep(rim - edgeW, rim + edgeW, rqs);
  float mu = sqrt(max(0.0, 1.0 - min(rqs, 1.0) * min(rqs, 1.0)));
  float limb = 0.35 + 0.65 * pow(mu, 0.55);
  vec3 sc = uStarCol * limb;
  if (uGran > 0.0) {
    // convection cells (bright) with darker, cooler lanes between them; a few dark spots on the red giants
    vec2 qq = q;
    float cells = fbm3(vec3(qq * mix(7.0, 11.0, step(uStarCol.r, uStarCol.b)) / (0.4 + 0.6 * mu), uT * 0.12));
    float fine = fbm4(vec3(qq * 19.0 + 3.0, uT * 0.25));
    float hot = step(uStarCol.r, uStarCol.b);       // a blue star: finer, fainter cells, the same hue
    float pat = clamp((cells - 0.35) * mix(2.4, 1.3, hot) + (fine - 0.5) * mix(1.0, 0.8, hot), 0.0, 1.0);
    vec3 lane = uStarCol * mix(vec3(0.55, 0.38, 0.3), vec3(0.72, 0.78, 0.85), hot), cell = uStarCol * vec3(1.15, 1.05, 1.0);
    vec3 g = mix(lane, cell, pat * pat * (3.0 - 2.0 * pat)) * limb;
    sc = mix(sc, g, uGran);
  }
  c = mix(c, sc * uStarI, inside);
  // ---------- inside Betelgeuse: plasma in every direction ----------
  if (uInside > 0.0) {
    // giant boiling cells with dark lanes between them, finer cells on top, everything churning
    vec3 pv = v * 5.0 + vec3(0.0, uT * 0.06, uT * 0.04);
    vec3 warp = vec3(fbm4(pv * 0.7 + uT * 0.1), fbm4(pv * 0.7 + 5.2 - uT * 0.08), fbm4(pv * 0.7 + 9.7)) - 0.5;
    vec2 w1 = worley(pv + warp * 1.2);
    vec2 w2 = worley(pv * 3.0 + warp * 2.0 + 4.0);
    float lane1 = smoothstep(0.0, 0.22, w1.y - w1.x), lane2 = smoothstep(0.0, 0.18, w2.y - w2.x);
    float glowC = (1.0 - smoothstep(0.0, 0.9, w1.x)) * 0.6 + 0.4;
    float pat = lane1 * (0.55 + 0.45 * lane2) * glowC;
    vec3 plasma = mix(vec3(0.75, 0.16, 0.03) * 0.8, vec3(1.0, 0.72, 0.38) * 3.4, pat);
    plasma += vec3(1.0, 0.92, 0.75) * smoothstep(0.75, 1.0, pat) * 1.8;
    c = mix(c, plasma, uInside);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 80.0), 1.0);
}`;

export function makeSky() {
  const V = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const C = (r, g, b) => ({ value: new THREE.Color(r, g, b) });
  const uniforms = {
    uSun: V(0, 0.07, -1), uAng: { value: 0.00466 }, uPx: { value: 0.0006 }, uT: { value: 0 },
    uStarCol: C(1, 0.95, 0.85), uStarI: { value: 10 }, uGran: { value: 0 }, uGlare: { value: 0.3 }, uGlareCol: C(1, 0.9, 0.75),
    uTop: C(0.1, 0.3, 0.7), uLow: C(0.8, 0.75, 0.7), uNear: C(1, 0.75, 0.5), uNight: { value: 0 },
    uSmoke: { value: 0 }, uDark: { value: 0 }, uCloud: { value: 1 }, uDrift: { value: 0 }, uInside: { value: 0 }, uSnap: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
