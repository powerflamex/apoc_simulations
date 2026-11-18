// The sea: a polar grid around the camera (fine near, coarse far). Breakers roll in through the surf as real geometry,
// white where they break; small travelling waves on top, each faded once it is finer than a pixel. It mirrors the sky.
// Each world's weather: uChop (storm waves and whitecaps), uBoil (Venus: the whole sea churning white and steaming),
// uFreeze (Titan, Neptune: ice spreading out from the shore, the waves frozen where they stood), uTear (Saturn,
// Neptune: the surface torn into white streaks running downwind), uBody (the water's own colour).
import * as THREE from 'three';
import { SHELF, CAM0 } from './layout.js';

const f1 = (x) => x.toFixed(1);
const SHELF_GLSL = SHELF.map(([a, h], i) => (i === 0 ? '' : `if (o <= ${f1(a)}) return mix(${f1(SHELF[i - 1][1])}, ${f1(h)}, (o - ${f1(SHELF[i - 1][0])}) / ${f1(a - SHELF[i - 1][0])});`)).join('\n    ');

const COMMON = /* glsl */ `
uniform float uTime; uniform float uWaveT; uniform float uFrozenT; uniform float uChop; uniform float uFreeze; uniform float uFreezeR;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float shelf(float o) {
  if (o <= 0.0) return 0.0;
  ${SHELF_GLSL}
  return 400.0 + (o - 100000.0) * 0.004;
}
float bedY(vec2 p) { float o = -p.x; return o <= 0.0 ? 2.2 * pow(clamp(-o / 50.0, 0.0, 1.0), 0.9) : -shelf(o); }
// how frozen at p: the ice front runs out from the shore (uFreezeR metres), ragged
float iceAt(vec2 p) { float o = -p.x; return uFreeze * (1.0 - smoothstep(-20.0, 20.0, o - uFreezeR * (0.85 + 0.3 * n2(p * 0.004)))); }
float breakH(vec2 p, float depth, float t, out float f) {
  float A = (1.05 + 0.9 * uChop) * smoothstep(11.0 + 4.0 * uChop, 3.5, depth) * smoothstep(0.1, 1.4, depth);
  float o = -p.x;
  float bend = 5.0 * sin(p.y * 0.019 + 1.3) + 2.5 * sin(p.y * 0.051);
  float ph = (o + bend) / (21.0 + 6.0 * uChop) + t * 0.19;
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
  float depth = -bedY(wp.xz);
  float f;
  float ice = iceAt(wp.xz);
  float t = mix(uWaveT, uFrozenT, step(0.5, ice));
  wp.y = depth > 0.0 ? breakH(wp.xz, depth, t, f) : 0.0;
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision highp float;
${COMMON}
varying vec3 vWP;
uniform vec3 uSun; uniform float uSunI; uniform vec3 uSunCol;
uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uPx;
uniform vec3 uDirC; uniform vec3 uAmbC; uniform vec3 uBody; uniform vec3 uHazeC; uniform float uHazeD;
uniform float uBoil; uniform float uTear; uniform vec2 uWindD; uniform float uFlash;
vec3 waveN(vec2 p, float dist, float t, float amp) {
  float px = uPx * dist;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float L = 50.0 * pow(0.78, fi);
    float a = 0.0033 * L * (1.0 + 0.3 * sin(fi * 7.1)) * amp;
    vec2 dir = normalize(vec2(1.0, 0.0) + (h2(vec2(fi, 9.1)) - 0.5) * vec2(0.0, 1.6) + uWindD * uTear * 1.5);
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
  float depth = -bed;
  if (depth < -0.02) discard;
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP - cameraPosition);
  float px = uPx * dist;
  float ice = iceAt(p);
  float t = mix(uWaveT, uFrozenT, step(0.5, ice));
  float f, fa, fb;
  float e = max(0.3, px);
  float h0 = breakH(p, depth, t, f);
  float hx = breakH(p + vec2(e, 0.0), depth, t, fa) - breakH(p - vec2(e, 0.0), depth, t, fb);
  float hz = breakH(p + vec2(0.0, e), depth, t, fa) - breakH(p - vec2(0.0, e), depth, t, fb);
  vec3 N = waveN(p, dist, t, 1.0 + 1.6 * uChop);
  N = normalize(N + vec3(-hx / (2.0 * e), 0.0, -hz / (2.0 * e)));
  float brk = smoothstep(3.2 + 2.0 * uChop, 1.6, depth) * smoothstep(0.05, 0.4, depth);
  float crest = smoothstep(0.03, 0.12, f) * (1.0 - smoothstep(0.17, 0.3, f));
  float trail = smoothstep(0.14, 0.2, f) * (1.0 - smoothstep(0.25, 0.75, f)) * (0.35 + 0.65 * n2(p * 0.35 + vec2(0.0, t * 0.4)));
  float surf = brk * (crest * 0.95 + trail * 0.55) * smoothstep(0.1, 0.4, h0 + 0.2);
  surf = mix(surf, brk * 0.3, smoothstep(0.5, 3.0, px));
  float swash = smoothstep(0.35, 0.0, depth) * (0.55 + 0.45 * n2(p * 0.15 + t * 0.3));
  // whitecaps out to sea in a storm (patches that come and go, coarse where they'd be finer than a pixel)
  float caps = uChop * smoothstep(0.62, 0.8, n2(p * 0.05 + vec2(t * 0.35, 0.0)) * 0.6 + n2(p * 0.17 - t * 0.6) * 0.4) * (1.0 - smoothstep(800.0, 6000.0, dist));
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float cosT = max(dot(-V, N), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.25, R.y)) + vec3(0.75, 0.8, 1.0) * uFlash * 0.5;
  vec3 body = mix(uBody * 1.7, uBody, smoothstep(1.0, 9.0, depth));
  vec3 col = mix(body, sky, F);
  float ca = acos(clamp(dot(R, uSun), -1.0, 1.0));
  col += uSunCol * uSunI * (exp(-pow(ca / 0.03, 2.0)) * 0.9 + 0.07 * exp(-ca / 0.12));
  vec3 foamC = vec3(0.92, 0.94, 0.95) * (uAmbC * 0.34 + uDirC * 0.13 * (0.5 + 0.5 * max(dot(N, uSun), 0.0)));
  foamC = mix(foamC, vec3(dot(foamC, vec3(0.3, 0.5, 0.2))) * 1.1, 0.55);
  col = mix(col, foamC, clamp(surf + swash * 0.7 + caps * 0.8, 0.0, 1.0));
  // Venus: the sea boils: churning white, bubbling everywhere
  if (uBoil > 0.0) {
    float b = n2(p * 0.9 + vec2(uTime * 1.3, -uTime)) * 0.5 + n2(p * 2.7 - uTime * 2.1) * 0.3 + n2(p * 0.12 + uTime * 0.2) * 0.4;
    col = mix(col, foamC * 1.15, uBoil * smoothstep(0.42, 0.85, b) * (1.0 - smoothstep(0.6, 4.0, px)));
    col = mix(col, foamC, uBoil * 0.35);
  }
  // Saturn, Neptune: the surface torn into streaks running downwind
  if (uTear > 0.0) {
    vec2 w = normalize(uWindD);
    vec2 q = vec2(dot(p, w), dot(p, vec2(-w.y, w.x)));
    float st = n2(vec2(q.x * 0.03 - uTime * 6.0, q.y * 0.6)) * 0.6 + n2(vec2(q.x * 0.08 - uTime * 11.0, q.y * 1.7)) * 0.4;
    col = mix(col, foamC * 1.1, uTear * smoothstep(0.45, 0.75, st) * (1.0 - smoothstep(0.4, 3.0, px)) + uTear * 0.25 * smoothstep(0.4, 3.0, px));
  }
  // ice: white-blue, a frosted sheen, dark cracks; the frozen breakers stay where they stood
  if (ice > 0.0) {
    float cr = 1.0 - smoothstep(0.0, 0.035 + px * 0.02, abs(n2(p * 0.08) - 0.5));
    float cr2 = 1.0 - smoothstep(0.0, 0.03 + px * 0.02, abs(n2(p * 0.31 + 7.0) - 0.5));
    float lumA = dot(uAmbC, vec3(0.3, 0.5, 0.2));
    vec3 iceC = mix(vec3(0.72, 0.84, 0.95), vec3(0.93, 0.96, 1.0), n2(p * 0.6)) * (mix(uAmbC, vec3(lumA), 0.75) * 0.75 + uDirC * 0.2 * max(dot(N, uSun), 0.0));
    iceC = mix(iceC, sky * 0.9, 0.1 + 0.2 * F);
    iceC *= 1.0 - 0.35 * max(cr, cr2 * 0.7) * (1.0 - smoothstep(0.5, 3.0, px));
    iceC = mix(iceC, foamC * 1.1, surf * 0.6);
    col = mix(col, iceC, ice);
  }
  col = mix(col, uHazeC, 1.0 - exp(-dist * uHazeD));
  float a = smoothstep(-0.02, 0.06, depth);
  gl_FragColor = vec4(col, a);
}`;

export function makeSea(scene) {
  const C = (r = 1, g = 1, b = 1) => ({ value: new THREE.Color(r, g, b) });
  const u = {
    uTime: { value: 0 }, uWaveT: { value: 0 }, uFrozenT: { value: 0 }, uChop: { value: 0 }, uFreeze: { value: 0 }, uFreezeR: { value: 0 },
    uSun: { value: new THREE.Vector3(0, 0.5, 1) }, uSunI: { value: 0 }, uSunCol: C(), uSkyHi: C(0.3, 0.5, 0.8), uSkyLo: C(0.75, 0.8, 0.88),
    uPx: { value: 0.0006 }, uDirC: C(), uAmbC: C(), uBody: C(0.012, 0.06, 0.085), uHazeC: C(0.8, 0.85, 0.9), uHazeD: { value: 0.00005 },
    uBoil: { value: 0 }, uTear: { value: 0 }, uWindD: { value: new THREE.Vector2(0, -1) }, uFlash: { value: 0 },
  };
  const NR = 300, NA = 560, R0 = 0.5, R1 = 60000;
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
    polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, u };
}
