// The sea: one big plane at the current sea level (it drops as the sea boils away). Where the sea floor (computed
// here exactly as layout.groundY does) comes up through it, the water ends in a line of foam and swash. Waves: a
// spectrum of travelling components, each faded out once it gets smaller than a pixel (no shimmering); breakers
// rolling into the beach in the surf zone. It mirrors the sky and the Sun (a glitter path that widens as the fireball
// grows), steams (uSteam) and boils white (uBoil).
import * as THREE from 'three';
import { RC, CX, PHI0, PHI1 } from './layout.js';
import { SHELF } from './timeline.js';
import { arcXZ } from './layout.js';

const E0 = arcXZ(PHI0, 0), E1 = arcXZ(PHI1, 0);
const f1 = (x) => x.toFixed(1);
const SHELF_GLSL = SHELF.map(([a, h], i) => (i === 0 ? '' : `if (o <= ${f1(a)}) return mix(${f1(SHELF[i - 1][1])}, ${f1(h)}, (o - ${f1(SHELF[i - 1][0])}) / ${f1(a - SHELF[i - 1][0])});`)).join('\n    ');

const vert = /* glsl */ `
varying vec3 vWP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vWP;
uniform float uTime; uniform float uSeaY; uniform vec3 uSun; uniform float uSunR; uniform float uSunI; uniform vec3 uSunCol;
uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uSteam; uniform float uBoil; uniform float uPx; uniform float uGlow;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float shelf(float o) {
  if (o <= 0.0) return 0.0;
  ${SHELF_GLSL}
  return 120.0 + (o - 100000.0) * 0.001;
}
// sea floor height and the distance out from the shore
float bedY(vec2 p, out float dOut) {
  vec2 dd = vec2(${f1(CX)} - p.x, -p.y);
  float phi = atan(dd.y, dd.x);
  float d = length(dd) - ${f1(RC)};
  dOut = -d;
  if (phi < ${PHI0.toFixed(3)} || phi > ${PHI1.toFixed(3)}) {
    vec2 e = phi < ${PHI0.toFixed(3)} ? vec2(${f1(E0.x)}, ${f1(E0.z)}) : vec2(${f1(E1.x)}, ${f1(E1.z)});
    dOut = max(dOut, length(p - e));
  }
  if (dOut <= 0.0) return 2.5 * pow(clamp(-dOut / 45.0, 0.0, 1.0), 0.85);
  return -shelf(dOut);
}
// waves: travelling components (heights m), each faded when finer than ~2 pixels at this distance
vec3 waveN(vec2 p, float dist, vec2 shoreDir) {
  float px = uPx * dist;                  // metres per pixel here
  vec2 g = vec2(0.0);
  float t = uTime;
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float L = 70.0 * pow(0.78, fi);                       // wavelength 70 m .. 1 m
    float a = 0.11 * L * 0.03 * (1.0 + 0.3 * sin(fi * 7.1));
    float ang = (h2(vec2(fi, 3.7)) - 0.5) * (0.7 + fi * 0.08);
    vec2 dir = vec2(cos(ang) * shoreDir.x - sin(ang) * shoreDir.y, sin(ang) * shoreDir.x + cos(ang) * shoreDir.y);
    float k = 6.2832 / L;
    float w = sqrt(9.81 * k);
    float fade = 1.0 - smoothstep(L * 0.25, L * 0.6, px * 2.0);
    float ph = dot(p, dir) * k - w * t + fi * 1.7;
    g += dir * cos(ph) * a * k * fade;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}
void main() {
  float dOut;
  vec2 p = vWP.xz;
  float bed = bedY(p, dOut);
  float depth = uSeaY - bed;
  if (depth < -0.02) discard;
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP - cameraPosition);
  // waves roll in toward the beach (from the bay's centre)
  vec2 toShore = normalize(vec2(p.x - ${f1(CX)}, p.y) + 1e-4);
  vec3 N = waveN(p, dist, toShore);
  // breakers in the surf zone: lines rolling in, white where they break, foam trailing behind
  float zone = smoothstep(4.5, 1.2, depth) * smoothstep(-0.05, 0.25, depth);
  float px = uPx * dist;
  float br = fract(dOut / 22.0 + uTime * 0.11 + 0.3 * n2(p * 0.02));
  float crest = smoothstep(0.86, 0.97, br) * (1.0 - smoothstep(0.97, 1.0, br));
  float trail = smoothstep(0.4, 0.97, br) * (1.0 - smoothstep(0.97, 1.0, br)) * (0.4 + 0.6 * n2(p * 0.3 + uTime * 0.2));
  float surf = zone * (crest * 0.9 + trail * 0.45);
  surf = mix(surf, zone * 0.3, smoothstep(0.5, 3.0, px));
  // the swash at the water's edge
  float swash = smoothstep(0.35, 0.0, depth) * (0.55 + 0.45 * n2(p * 0.15 + uTime * 0.3));
  // boiling: the surface heaves and churns
  if (uBoil > 0.0) {
    vec2 bp = p * 0.6 + vec2(uTime * 1.3, -uTime);
    N = normalize(N + vec3(n2(bp) - 0.5, 0.0, n2(bp + 9.1) - 0.5) * uBoil * 0.9 * (1.0 - smoothstep(30.0, 600.0, dist)));
  }
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float cosT = max(dot(-V, N), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.25, R.y));
  vec3 deep = vec3(0.01, 0.06, 0.09);
  vec3 shallow = vec3(0.06, 0.32, 0.33);
  vec3 body = mix(shallow, deep, smoothstep(1.0, 9.0, depth)) * (0.35 + 0.65 * uSkyLo.b);
  vec3 col = mix(body, sky, F);
  // the Sun's glitter (wider as the fireball grows)
  float ca = dot(R, uSun);
  float lobe = max(uSunR * 1.6, 0.03);
  col += uSunCol * uSunI * exp(-pow(acos(clamp(ca, -1.0, 1.0)) / lobe, 2.0)) * 0.9;
  col += uSunCol * uSunI * 0.08 * exp(-acos(clamp(ca, -1.0, 1.0)) / (lobe * 4.0));
  vec3 foamC = vec3(0.92, 0.94, 0.95) * (0.55 + 0.6 * uSkyLo.b + 0.3 * uSunI * 0.1);
  col = mix(col, foamC, clamp(surf + swash * 0.7, 0.0, 1.0));
  // boiling white water
  float churn = uBoil * (0.1 + 0.22 * n2(p * 0.25 + uTime * 1.5)) * (1.0 - smoothstep(800.0, 6000.0, dist) * 0.5);
  col = mix(col, foamC * 1.05, churn);
  // steam right on the water: a white veil
  col = mix(col, vec3(1.0, 0.98, 0.95) * (0.6 + 0.5 * uSkyLo.r), uSteam * 0.15 * (0.6 + 0.4 * n2(p * 0.01 + uTime * 0.05)));
  // the glow of the burning world on the water late on
  col += vec3(1.0, 0.45, 0.15) * uGlow * 0.15;
  // haze toward the horizon
  col = mix(col, uSkyLo * 0.95, smoothstep(2500.0, 30000.0, dist) * 0.85);
  // a soft edge where it meets the beach
  float a = smoothstep(-0.02, 0.06, depth);
  gl_FragColor = vec4(col, a);
}`;

export function makeSea(scene) {
  const u = {
    uTime: { value: 0 }, uSeaY: { value: 0 }, uSun: { value: new THREE.Vector3(0, 0.2, -1) }, uSunR: { value: 0.0047 }, uSunI: { value: 3 },
    uSunCol: { value: new THREE.Color(1, 0.9, 0.75) }, uSkyHi: { value: new THREE.Color(0.3, 0.5, 0.8) }, uSkyLo: { value: new THREE.Color(0.75, 0.8, 0.88) },
    uSteam: { value: 0 }, uBoil: { value: 0 }, uPx: { value: 0.0006 }, uGlow: { value: 0 },
  };
  const geo = new THREE.PlaneGeometry(160000, 160000, 1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, u };
}
