// The sea: a polar grid around the camera's start (fine near you, coarse far off) at the current sea level (it drops
// as the ocean boils away under Rigel). Breakers roll in through the surf zone as real geometry (a steep face toward
// the beach, a long back), white where they break, foam trailing behind; a spectrum of small travelling waves on top,
// each faded out once it gets smaller than a pixel (no shimmering). Where the sea floor comes up through the water
// the sea ends in swash. It mirrors the sky and the star (a glitter path that widens with the star).
// Proxima: the wave clock (uWaveT) stops and the sea freezes where it stands, ice spreading out from the shore (uIce,
// uIceR). Later it steams (uSteam) and boils (uBoil).
import * as THREE from 'three';
import { SHELF, CAM0 } from './layout.js';

const f1 = (x) => x.toFixed(1);
const SHELF_GLSL = SHELF.map(([a, h], i) => (i === 0 ? '' : `if (o <= ${f1(a)}) return mix(${f1(SHELF[i - 1][1])}, ${f1(h)}, (o - ${f1(SHELF[i - 1][0])}) / ${f1(a - SHELF[i - 1][0])});`)).join('\n    ');

const COMMON = /* glsl */ `
uniform float uTime; uniform float uWaveT; uniform float uSeaY;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float shelf(float o) {
  if (o <= 0.0) return 0.0;
  ${SHELF_GLSL}
  return 400.0 + (o - 100000.0) * 0.004;
}
float bedY(vec2 p) { float o = -p.x; return o <= 0.0 ? 2.2 * pow(clamp(-o / 50.0, 0.0, 1.0), 0.9) : -shelf(o); }
// the breakers' height (m) at p; f: where in the wave (0 trough, 0.14 crest)
float breakH(vec2 p, float depth, out float f) {
  float A = 1.05 * smoothstep(11.0, 3.5, depth) * smoothstep(0.1, 1.4, depth);
  float o = -p.x;
  float bend = 5.0 * sin(p.y * 0.019 + 1.3) + 2.5 * sin(p.y * 0.051);
  float ph = (o + bend) / 21.0 + uWaveT * 0.19;
  f = fract(ph);
  float sh = f < 0.14 ? smoothstep(0.0, 0.14, f) : pow(1.0 - smoothstep(0.14, 1.0, f), 1.7);
  float along = 0.6 + 0.4 * sin(p.y * 0.031 + floor(ph) * 2.1);
  return A * sh * along;
}
`;

const vert = /* glsl */ `
${COMMON}
varying vec3 vWP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float depth = uSeaY - bedY(wp.xz);
  float f;
  wp.y = uSeaY + (depth > 0.0 ? breakH(wp.xz, depth, f) : 0.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision highp float;
${COMMON}
varying vec3 vWP;
uniform vec3 uSun; uniform float uSunR; uniform float uSunI; uniform vec3 uSunCol;
uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uSteam; uniform float uBoil; uniform float uPx; uniform float uGlow;
uniform float uIce; uniform float uIceR; uniform vec3 uDirC; uniform vec3 uAmbC; uniform float uBright;
// small waves: travelling components, each faded when finer than ~2 pixels at this distance
vec3 waveN(vec2 p, float dist) {
  float px = uPx * dist;
  vec2 g = vec2(0.0);
  float t = uWaveT;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float L = 50.0 * pow(0.78, fi);
    float a = 0.11 * L * 0.03 * (1.0 + 0.3 * sin(fi * 7.1));
    vec2 dir = normalize(vec2(1.0, 0.0) + (h2(vec2(fi, 9.1)) - 0.5) * vec2(0.0, 1.6));   // mostly rolling in from the west
    float k = 6.2832 / L;
    float w = sqrt(9.81 * k);
    float fade = 1.0 - smoothstep(L * 0.25, L * 0.6, px * 2.0);
    float ph = dot(p, dir) * k - w * t + fi * 1.7;
    g += dir * cos(ph) * a * k * fade;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}
void main() {
  vec2 p = vWP.xz;
  float bed = bedY(p);
  float depth = uSeaY - bed;
  if (depth < -0.02) discard;
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP - cameraPosition);
  float px = uPx * dist;
  // the breakers' slope (finite differences) on top of the small waves
  float f, fa, fb;
  float e = max(0.3, px);
  float h0 = breakH(p, depth, f);
  float hx = breakH(p + vec2(e, 0.0), depth, fa) - breakH(p - vec2(e, 0.0), depth, fb);
  float hz = breakH(p + vec2(0.0, e), depth, fa) - breakH(p - vec2(0.0, e), depth, fb);
  vec3 N = waveN(p, dist);
  N = normalize(N + vec3(-hx / (2.0 * e), 0.0, -hz / (2.0 * e)));
  // where it breaks: white on the crest and the steep face, foam trailing out behind
  float brk = smoothstep(3.2, 1.6, depth) * smoothstep(0.05, 0.4, depth);
  float crest = smoothstep(0.03, 0.12, f) * (1.0 - smoothstep(0.17, 0.3, f));
  float trail = smoothstep(0.14, 0.2, f) * (1.0 - smoothstep(0.25, 0.75, f)) * (0.35 + 0.65 * n2(p * 0.35 + vec2(0.0, uWaveT * 0.4)));
  float surf = brk * (crest * 0.95 + trail * 0.55) * smoothstep(0.1, 0.4, h0 + 0.2);
  surf = mix(surf, brk * 0.3, smoothstep(0.5, 3.0, px));
  float swash = smoothstep(0.35, 0.0, depth) * (0.55 + 0.45 * n2(p * 0.15 + uWaveT * 0.3));
  // boiling: the surface heaves and churns
  if (uBoil > 0.0) {
    vec2 bp = p * 5.0 + vec2(uTime * 2.3, -uTime * 1.7);
    N = normalize(N + vec3(n2(bp) - 0.5, 0.0, n2(bp + 9.1) - 0.5) * uBoil * 0.5 * (1.0 - smoothstep(0.02, 0.08, px)));
  }
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float cosT = max(dot(-V, N), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.25, R.y));
  vec3 deep = vec3(0.012, 0.06, 0.085);
  vec3 shallow = vec3(0.06, 0.3, 0.32);
  vec3 body = mix(shallow, deep, smoothstep(1.0, 9.0, depth)) * uBright;
  vec3 col = mix(body, sky, F);
  // the star's glitter path (wider as the star grows)
  float ca = acos(clamp(dot(R, uSun), -1.0, 1.0));
  float lobe = max(uSunR * 1.4, 0.03);
  col += uSunCol * uSunI * exp(-pow(ca / lobe, 2.0)) * 0.9;
  col += uSunCol * uSunI * 0.07 * exp(-ca / (lobe * 4.0));
  vec3 foamC = vec3(0.92, 0.94, 0.95) * (uAmbC * 0.32 + uDirC * 0.12 * (0.5 + 0.5 * max(dot(N, uSun), 0.0)));
  col = mix(col, foamC, clamp(surf + swash * 0.7, 0.0, 1.0));
  // boiling white water
  // bubbles: small white specks that pop and come back all over the surface, foam streaks between them
  float bub = smoothstep(0.75, 0.92, n2(p * 9.0 + vec2(0.0, uTime * 4.0)) * n2(p * 5.3 - uTime * 2.1) * 1.7) * (1.0 - smoothstep(0.03, 0.09, px));
  float churn = uBoil * (0.04 + 0.1 * n2(p * 0.9 + uTime * 2.0) + 0.6 * bub) * (1.0 - smoothstep(800.0, 6000.0, dist) * 0.5);
  col = mix(col, foamC * 1.05, churn);
  // steam right on the water: a white veil
  col = mix(col, foamC * 1.1, uSteam * 0.18 * (0.6 + 0.4 * n2(p * 0.01 + uTime * 0.05)));
  // the glow of the burning world on the water late on
  col += vec3(1.0, 0.45, 0.15) * uGlow * 0.15;
  // haze toward the horizon
  col = mix(col, uSkyLo * 0.95, smoothstep(2500.0, 30000.0, dist) * 0.85);
  // ---- the ice: frozen where it stood, spreading out from the shore ----
  float o = -p.x;
  float iceK = uIce * (1.0 - smoothstep(uIceR - 40.0, uIceR, o));
  if (iceK > 0.0) {
    // frozen foam stays white; the rest is grey-blue sea ice under a skin of rime, cracked, lit by the dim red star
    float cr = 1.0 - smoothstep(0.0, 0.035, abs(n2(p * 0.18) - 0.5)) * (1.0 - smoothstep(1.0, 6.0, px));
    vec3 alb = mix(vec3(0.62, 0.74, 0.82), vec3(0.9, 0.94, 0.98), clamp(surf * 1.2 + swash + 0.35 * n2(p * 1.3), 0.0, 1.0));
    alb *= 1.0 - 0.3 * cr;
    float lam = max(dot(N, uSun), 0.0);
    // (lit as if from the city behind you too, so the frozen breakers stand out as ridges)
    float relief = 0.45 + 0.9 * max(dot(N, normalize(vec3(0.75, 0.6, 0.1))), 0.0);
    float rimC = smoothstep(0.05, 0.12, f) * (1.0 - smoothstep(0.14, 0.2, f)) * smoothstep(3.5, 1.0, depth);
    alb = mix(alb, vec3(0.97, 0.98, 1.0), rimC * 0.8);
    vec3 ice = alb * (uAmbC * 1.3 + uDirC * 0.6 * (lam + 0.25)) * relief;
    // a glassy sheen of the sky and a sharp glint of the star
    ice += sky * F * 0.6 + uSunCol * uSunI * 0.25 * exp(-pow(ca / (lobe * 2.0), 2.0));
    col = mix(col, ice, iceK);
  }
  float a = smoothstep(-0.02, 0.06, depth);
  gl_FragColor = vec4(col, a);
}`;

export function makeSea(scene) {
  const C = () => ({ value: new THREE.Color(1, 1, 1) });
  const u = {
    uTime: { value: 0 }, uWaveT: { value: 0 }, uSeaY: { value: 0 }, uSun: { value: new THREE.Vector3(0, 0.2, -1) }, uSunR: { value: 0.0047 }, uSunI: { value: 3 },
    uSunCol: C(), uSkyHi: { value: new THREE.Color(0.3, 0.5, 0.8) }, uSkyLo: { value: new THREE.Color(0.75, 0.8, 0.88) },
    uSteam: { value: 0 }, uBoil: { value: 0 }, uPx: { value: 0.0006 }, uGlow: { value: 0 },
    uIce: { value: 0 }, uIceR: { value: 0 }, uDirC: C(), uAmbC: C(), uBright: { value: 1 },
  };
  // the grid: rings from 0.5 m to 80 km around the camera's start
  const NR = 320, NA = 560, R0 = 0.5, R1 = 80000;
  const pos = new Float32Array((NR + 1) * NA * 3);
  let k = 0;
  for (let i = 0; i <= NR; i++) {
    const r = R0 * Math.pow(R1 / R0, i / NR);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      pos[k++] = CAM0.x + Math.sin(a) * r; pos[k++] = 0; pos[k++] = CAM0.z - Math.cos(a) * r;
    }
  }
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, u };
}
