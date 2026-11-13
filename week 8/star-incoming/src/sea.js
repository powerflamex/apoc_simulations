// The sea: a polar grid around the camera's start (fine near you, coarse far off) at the current sea level.
// Breakers roll in through the surf zone as real geometry (a steep face toward the beach, a long back), white where
// they break, foam trailing behind; a spectrum of small travelling waves on top, each faded out once it gets smaller
// than a pixel (no shimmering). Where the sand comes up through the water the sea ends in swash. It mirrors the sky
// and the planet (a glitter path that widens with the planet).
// Jupiter's pull (the ending): the sea level climbs the beach (uSeaY), a dome of water heaps up on the horizon under
// the planet (uBulge, uDome), and a wall comes in from it (its foot uWallX metres offshore, uWallH metres high):
// a steep face streaked with falling foam, a white crest, churning white water at its foot.
import * as THREE from 'three';
import { SHELF, CAM0 } from './layout.js';

const f1 = (x) => x.toFixed(1);
const SHELF_GLSL = SHELF.map(([a, h], i) => (i === 0 ? '' : `if (o <= ${f1(a)}) return mix(${f1(SHELF[i - 1][1])}, ${f1(h)}, (o - ${f1(SHELF[i - 1][0])}) / ${f1(a - SHELF[i - 1][0])});`)).join('\n    ');

const COMMON = /* glsl */ `
uniform float uTime; uniform float uWaveT; uniform float uSeaY;
uniform float uBulge; uniform vec2 uDome; uniform float uWallX; uniform float uWallH; uniform float uSurge; uniform float uIce;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float shelf(float o) {
  if (o <= 0.0) return 0.0;
  ${SHELF_GLSL}
  return 400.0 + (o - 100000.0) * 0.004;
}
float bedY(vec2 p) { float o = -p.x; return o <= 0.0 ? 2.2 * pow(clamp(-o / 50.0, 0.0, 1.0), 0.9) + 0.8 * smoothstep(50.0, 165.0, -o) : -shelf(o); }
// the dome of water under the planet (m)
float domeY(vec2 p) { vec2 d = (p - uDome) / vec2(6000.0, 4800.0); return uBulge * 1350.0 * exp(-dot(d, d)) * smoothstep(300.0, 5000.0, -p.x); }   // (nothing of it at the shore)
// the wall: metres behind its foot (the front bends a little along the beach), and its height there
float wallD(vec2 p) { return -p.x + 7.0 * sin(p.y * 0.012 + 0.7) + 3.0 * sin(p.y * 0.037) - uWallX; }
float wallW() { return 2.2 + 0.3 * uWallH; }
float wallY(float d) {
  float wf = wallW();
  return uWallH * smoothstep(0.0, wf, d);
}
float surgeY(vec2 p) { return domeY(p) + wallY(wallD(p)); }
// the breakers' height (m) at p; f: where in the wave (0 trough, 0.14 crest)
float breakH(vec2 p, float depth, out float f) {
  float A = (1.0 - uIce) * (1.05 + 0.9 * uSurge) * smoothstep(11.0, 3.5, depth) * smoothstep(0.1, 1.4, depth);
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
  float sy = uSeaY + surgeY(wp.xz);
  float depth = sy - bedY(wp.xz);
  float f;
  wp.y = sy + (depth > 0.0 ? breakH(wp.xz, min(depth, uSeaY - bedY(wp.xz) + 40.0), f) : 0.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision highp float;
${COMMON}
varying vec3 vWP;
uniform vec3 uSun; uniform float uSunR; uniform float uSunI; uniform vec3 uSunCol;
uniform vec3 uSun2; uniform float uSunR2; uniform float uSunI2; uniform vec3 uSunCol2;
uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uPx;
uniform vec3 uDirC; uniform vec3 uAmbC; uniform float uBright;
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
  float sg = surgeY(p);
  float depth = uSeaY + sg - bed;
  if (depth < -0.02) discard;
  float depth0 = min(depth, uSeaY - bed + 40.0);
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP - cameraPosition);
  float px = uPx * dist;
  // the breakers' slope (finite differences) on top of the small waves
  float f, fa, fb;
  float e = max(0.3, px);
  float h0 = breakH(p, depth0, f);
  float hx = breakH(p + vec2(e, 0.0), depth0, fa) - breakH(p - vec2(e, 0.0), depth0, fb);
  float hz = breakH(p + vec2(0.0, e), depth0, fa) - breakH(p - vec2(0.0, e), depth0, fb);
  // the dome's and the wall's slope
  float e2 = max(0.6, px * 1.5);
  hx += (surgeY(p + vec2(e2, 0.0)) - surgeY(p - vec2(e2, 0.0))) * e / e2;
  hz += (surgeY(p + vec2(0.0, e2)) - surgeY(p - vec2(0.0, e2))) * e / e2;
  vec3 N = waveN(p, dist);
  float dm = domeY(p);
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(5.0, 120.0, dm)));       // (the small waves would show as fine rings on the dome's flank)
  N = normalize(N + vec3(-hx / (2.0 * e), 0.0, -hz / (2.0 * e)));
  // where it breaks: white on the crest and the steep face, foam trailing out behind
  float brk = smoothstep(3.2, 1.6, depth0) * smoothstep(0.05, 0.4, depth0);
  float crest = smoothstep(0.03, 0.12, f) * (1.0 - smoothstep(0.17, 0.3, f));
  float trail = smoothstep(0.14, 0.2, f) * (1.0 - smoothstep(0.25, 0.75, f)) * (0.35 + 0.65 * n2(p * 0.35 + vec2(0.0, uWaveT * 0.4)));
  float surf = brk * (crest * 0.95 + trail * 0.55) * smoothstep(0.1, 0.4, h0 + 0.2);
  surf = mix(surf, brk * 0.3, smoothstep(0.5, 3.0, px));
  float swash = smoothstep(0.1, 0.0, depth) * (0.55 + 0.45 * n2(p * 0.15 + uWaveT * 0.3));
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float cosT = max(dot(-V, N), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.25, R.y));
  vec3 deep = vec3(0.012, 0.06, 0.085);
  vec3 shallow = vec3(0.06, 0.3, 0.32);
  vec3 body = mix(shallow, deep, smoothstep(1.0, 9.0, depth)) * uBright;
  vec3 col = mix(body, sky, F);
  // the planet's glitter path (wider as the planet grows)
  float ca = acos(clamp(dot(R, uSun), -1.0, 1.0));
  float lobe = max(uSunR * 1.4, 0.03);
  col += uSunCol * uSunI * exp(-pow(ca / lobe, 2.0)) * 0.9;
  col += uSunCol * uSunI * 0.07 * exp(-ca / (lobe * 4.0));
  // the star's glitter path
  float ca2 = acos(clamp(dot(R, uSun2), -1.0, 1.0));
  float lobe2 = max(uSunR2 * 1.4, 0.03);
  col += uSunCol2 * uSunI2 * exp(-pow(ca2 / lobe2, 2.0)) * 0.9;
  col += uSunCol2 * uSunI2 * 0.07 * exp(-ca2 / (lobe2 * 4.0));
  vec3 foamC = vec3(0.92, 0.94, 0.95) * (uAmbC * 0.34 + uDirC * 0.13 * (0.5 + 0.5 * max(dot(N, uSun), 0.0)));
  // (white water in the ending: closer to white than the planet-tinted foam, so it reads as water, not sand)
  vec3 white = mix(foamC, vec3(dot(foamC, vec3(0.3, 0.5, 0.2))) * 1.15, 0.6);
  col = mix(col, foamC, clamp(surf + swash * 0.7, 0.0, 1.0));
  // the surge: a sheet of churning white water racing up the sand (streaks drawn out landward, moving in)
  if (uSurge > 0.0) {
    float sh = smoothstep(2.2, 0.05, depth) * smoothstep(-0.02, 0.08, depth);
    float st = n2(vec2(p.x * 0.35 - uTime * 2.2, p.y * 0.08)) * 0.6 + n2(vec2(p.x * 0.9 - uTime * 3.1, p.y * 0.25 + 4.0)) * 0.4;
    float fo = smoothstep(0.45, 0.72, st) * sh * 0.8 + smoothstep(0.15, 0.0, depth) * 0.6;
    col = mix(col, white * 1.05, clamp(fo, 0.0, 1.0) * uSurge * 0.9);
    col = mix(col, vec3(0.05, 0.11, 0.12) * (0.6 + uBright) + sky * 0.25, sh * uSurge * 0.35 * (1.0 - fo));
  }
  // haze toward the horizon
  col = mix(col, uSkyLo * 0.95, smoothstep(2500.0, 30000.0, dist) * 0.85);
  // ---- the dome under the planet: dark water heaped up against the planet's glow, white water streaming up its flanks ----
  if (dm > 1.0) {
    float k = smoothstep(30.0, 420.0, dm);
    // white water streaming up its flanks: ragged streaks drawn out along the slope, never regular rows
    vec2 q = (p - uDome) / vec2(6000.0, 4800.0);
    float rad = length(q);
    float caps = smoothstep(0.52, 0.8, n2(vec2(p.x * 0.0038 + uTime * 0.09, p.y * 0.0008)) * 0.6 + 0.4 * n2(vec2(p.x * 0.011 + uTime * 0.2, p.y * 0.0021 + 3.0)));
    float streak = smoothstep(0.6, 0.85, n2(vec2(p.x * 0.0014 - uTime * 0.03, p.y * 0.0004 + 7.0)));
    vec3 water = vec3(0.02, 0.1, 0.14) * (0.5 + 0.9 * uBright) + sky * 0.3;
    water += uSunCol * vec3(0.55, 0.8, 0.7) * 0.5 * smoothstep(0.55, 0.0, rad) * smoothstep(0.75, 1.0, dm / max(uBulge * 1350.0, 1.0));   // the planet's light through its top
    col = mix(col, water, k * 0.85);
    col = mix(col, white * 0.85, k * clamp(caps * 0.6 + streak * 0.3, 0.0, 1.0));
  }
  // ---- the wall ----
  if (uWallH > 0.5) {
    float d = wallD(p), wf = wallW();
    float hgt = wallY(d);
    float on = smoothstep(0.5, 6.0, uWallH);
    float faceK = smoothstep(0.0, 0.1 * wf, d) * (1.0 - smoothstep(0.85 * wf, 1.15 * wf, d));
    float crestK = smoothstep(0.5 * wf, 0.9 * wf, d) * (1.0 - smoothstep(wf + 3.0, wf + 14.0, d));
    float footK = smoothstep(-12.0, -2.0, d) * (1.0 - smoothstep(0.0, 0.2 * wf, d));
    // foam falling down the face in long streaks (drawn out down the slope), the crest torn into spray
    float fall = uTime * 0.9;
    float st = n2(vec2(p.y * 0.85, hgt * 0.04 + fall)) * 0.6 + n2(vec2(p.y * 2.3 + 4.0, hgt * 0.1 + fall * 2.0)) * 0.4;
    float big = n2(vec2(p.y * 0.05 + 2.0, uTime * 0.4));
    float up = clamp(hgt / max(uWallH, 1.0), 0.0, 1.0);                  // 0 at the foot, 1 at the top
    float streaks = smoothstep(0.5, 0.74, st + 0.2 * big + 0.32 * (up - 0.5));
    float foam = crestK * (0.85 + 0.15 * big) + footK * (0.8 + 0.2 * st) + faceK * streaks * 0.9;
    // the face itself: dark, glassy water, the planet's light coming through near its top
    vec3 wcol = vec3(0.012, 0.045, 0.06) * (0.6 + 0.8 * uBright) + sky * 0.16 + uSunCol * vec3(0.5, 0.75, 0.6) * 0.3 * smoothstep(0.55, 1.0, up);
    wcol *= 0.75 + 0.5 * n2(vec2(p.y * 0.2, hgt * 0.03 + fall * 0.5));
    col = mix(col, wcol, faceK * on);
    col = mix(col, white * 1.05, clamp(foam, 0.0, 1.0) * on);
    // behind the crest: churned white water
    col = mix(col, white * 0.85, smoothstep(wf, wf + 6.0, d) * (1.0 - smoothstep(30.0, 90.0, d)) * on * (0.45 + 0.4 * n2(p * 0.12 + uTime)));
  }
  if (uIce > 0.0) {
    float cr = smoothstep(0.47, 0.5, n2(p * 0.08)) * (1.0 - smoothstep(0.5, 0.53, n2(p * 0.08)));
    float near = smoothstep(-400.0, 60.0, p.x);
    float k = clamp(uIce * 1.6 - (1.0 - near) * (1.0 - uIce) * 1.4, 0.0, 1.0);
    vec3 iceC = mix(vec3(0.62, 0.72, 0.82), vec3(0.86, 0.91, 0.96), n2(p * 0.03)) * (uAmbC * 0.55 + uDirC * 0.12) * (1.0 - 0.35 * cr);
    iceC += sky * 0.12;
    col = mix(col, iceC, k);
  }
  float a = smoothstep(-0.02, 0.06, depth);
  gl_FragColor = vec4(col, a);
}`;

export function makeSea(scene) {
  const C = () => ({ value: new THREE.Color(1, 1, 1) });
  const u = {
    uTime: { value: 0 }, uWaveT: { value: 0 }, uSeaY: { value: 0 }, uSun: { value: new THREE.Vector3(0, 0.2, -1) }, uSunR: { value: 0.0047 }, uSunI: { value: 3 },
    uSunCol: C(), uSkyHi: { value: new THREE.Color(0.3, 0.5, 0.8) }, uSkyLo: { value: new THREE.Color(0.75, 0.8, 0.88) },
    uPx: { value: 0.0006 }, uDirC: C(), uAmbC: C(), uBright: { value: 1 },
    uSun2: { value: new THREE.Vector3(0, 0.2, -1) }, uSunR2: { value: 0.006 }, uSunI2: { value: 1 }, uSunCol2: C(), uIce: { value: 0 }, uSurge: { value: 0 },
    uBulge: { value: 0 }, uDome: { value: new THREE.Vector2(-15000, -2600) }, uWallX: { value: 1e6 }, uWallH: { value: 0 },
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
