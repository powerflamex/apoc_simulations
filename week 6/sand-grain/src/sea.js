// The sea: a polar grid around you at the current sea level (uSeaY; it drops when the blast shoves the water away, and the
// shelf comes up through it). Breakers roll in through the surf as real geometry, a spectrum of small travelling waves on
// top (each faded once it's smaller than a pixel, so nothing shimmers). Clear turquoise in the shallows, deep blue beyond.
import * as THREE from 'three';
import { CAM0, SHELF_GLSL } from './layout.js';

const COMMON = /* glsl */ `
uniform float uTime; uniform float uSeaY;
${SHELF_GLSL}
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float bedY(vec2 p) { return bedAt(p.x - shoreX(p.y)); }
float breakH(vec2 p, float depth, out float f) {
  float A = 0.85 * smoothstep(9.0, 3.0, depth) * smoothstep(0.1, 1.2, depth);
  float o = p.x - shoreX(p.y);
  float bend = 5.0 * sin(p.y * 0.019 + 1.3) + 2.5 * sin(p.y * 0.051);
  float ph = (o + bend) / 19.0 + uTime * 0.2;
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
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uPx; uniform float uSunI; uniform float uFire; uniform vec3 uFirePos;
vec3 waveN(vec2 p, float dist) {
  float px = uPx * dist;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float L = 46.0 * pow(0.78, fi);
    float a = 0.11 * L * 0.03 * (1.0 + 0.3 * sin(fi * 7.1));
    vec2 dir = normalize(vec2(-1.0, 0.0) + (h2(vec2(fi, 9.1)) - 0.5) * vec2(0.0, 1.6));
    float k = 6.2832 / L;
    float w = sqrt(9.81 * k);
    float fade = 1.0 - smoothstep(L * 0.25, L * 0.6, px * 2.0);
    g += dir * cos(dot(p, dir) * k - w * uTime + fi * 1.7) * a * k * fade;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}
void main() {
  vec2 p = vWP.xz;
  float depth = uSeaY - bedY(p);
  if (depth < -0.02) discard;
  vec3 V = normalize(vWP - cameraPosition);
  float dist = length(vWP - cameraPosition);
  float px = uPx * dist;
  float f, fa, fb;
  float e = max(0.3, px);
  float h0 = breakH(p, depth, f);
  float hx = breakH(p + vec2(e, 0.0), depth, fa) - breakH(p - vec2(e, 0.0), depth, fb);
  float hz = breakH(p + vec2(0.0, e), depth, fa) - breakH(p - vec2(0.0, e), depth, fb);
  vec3 N = normalize(waveN(p, dist) + vec3(-hx / (2.0 * e), 0.0, -hz / (2.0 * e)));
  float brk = smoothstep(3.0, 1.4, depth) * smoothstep(0.05, 0.35, depth);
  float crest = smoothstep(0.03, 0.12, f) * (1.0 - smoothstep(0.17, 0.3, f));
  float trail = smoothstep(0.14, 0.2, f) * (1.0 - smoothstep(0.25, 0.75, f)) * (0.35 + 0.65 * n2(p * 0.35 + vec2(0.0, uTime * 0.4)));
  float surf = brk * (crest * 0.95 + trail * 0.55) * smoothstep(0.1, 0.4, h0 + 0.2);
  surf = mix(surf, brk * 0.3, smoothstep(0.5, 3.0, px));
  float swash = smoothstep(0.3, 0.0, depth) * (0.55 + 0.45 * n2(p * 0.15 + uTime * 0.3));
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.25, R.y));
  vec3 deep = vec3(0.01, 0.1, 0.22), shallow = vec3(0.09, 0.62, 0.6), sandy = vec3(0.5, 0.72, 0.56);
  vec3 body = mix(sandy, shallow, smoothstep(0.1, 1.6, depth));
  body = mix(body, deep, smoothstep(2.0, 14.0, depth));
  vec3 col = mix(body, sky, F * 0.8);
  float ca = acos(clamp(dot(R, uSun), -1.0, 1.0));
  col += vec3(1.0, 0.95, 0.85) * uSunI * exp(-pow(ca / 0.04, 2.0)) * 0.7;
  // the blast's light on the water: a long track under it
  if (uFire > 0.0) {
    vec3 Lf = normalize(uFirePos - vWP);
    float sp = pow(max(dot(R, Lf), 0.0), 14.0);
    col += vec3(1.3, 0.62, 0.22) * uFire * (0.1 + 1.1 * sp);
  }
  vec3 foam = vec3(0.9, 0.92, 0.92) * 0.82;
  col = mix(col, foam, clamp(surf + swash * 0.6, 0.0, 1.0));
  col = mix(col, uSkyLo * 0.97, smoothstep(2500.0, 26000.0, dist) * 0.8);
  gl_FragColor = vec4(col, smoothstep(-0.02, 0.05, depth));
  #include <colorspace_fragment>
}`;

export function makeSea(scene) {
  const u = {
    uTime: { value: 0 }, uSeaY: { value: 0 }, uSun: { value: new THREE.Vector3(0, 0.8, 0.5) }, uSunI: { value: 1.2 },
    uSkyHi: { value: new THREE.Color(0.2, 0.42, 0.78) }, uSkyLo: { value: new THREE.Color(0.72, 0.82, 0.92) }, uPx: { value: 0.0006 },
    uFire: { value: 0 }, uFirePos: { value: new THREE.Vector3() },
  };
  const NR = 340, NA = 620, R0 = 0.5, R1 = 40000;
  const pos = new Float32Array((NR + 1) * NA * 3);
  let k = 0;
  const X0 = CAM0.x + 60, Z0 = CAM0.z - 190;
  for (let i = 0; i <= NR; i++) {
    const r = R0 + 3 * i * 0.5 + 1.2 * Math.pow(R1 / 1.2, i / NR);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      pos[k++] = X0 + Math.sin(a) * r; pos[k++] = 0; pos[k++] = Z0 - Math.cos(a) * r;
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
