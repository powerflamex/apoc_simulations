// The flood's front: a bore (a rolling wall of white water) racing across the sand to the walk. Real geometry, so it
// has a body, not just a top: a foam lip sliding ahead over the sand, a steep tumbling face with sand-brown water in it,
// a white roller on top, churned water behind it that settles onto the raised sea (sea.js draws the water further back),
// and spray thrown up off the crest. Its foot follows the same bent line as sea.js's wall (uWallX = -frontX).
import * as THREE from 'three';

const COMMON = /* glsl */ `
uniform float uFront; uniform float uH; uniform float uL; uniform float uTime; uniform float uOn;
float bh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(bh(i), bh(i+vec2(1,0)), f.x), mix(bh(i+vec2(0,1)), bh(i+vec2(1,1)), f.x), f.y); }
float bf(vec2 p){ return 0.55 * bn(p) + 0.3 * bn(p * 2.3 + 5.1) + 0.15 * bn(p * 5.1 + 2.7); }
// the ground (layout.js: the sand rises to a berm, then gently to the bike path; the walk; the road)
float gY(float x) {
  if (x < 0.0) return 0.0;
  if (x < 50.0) return 2.2 * pow(x / 50.0, 0.9);
  if (x < 165.0) return 2.2 + 0.8 * smoothstep(50.0, 165.0, x);
  if (x < 186.0) return 3.0;
  return 3.2;
}
float footX(float z) { return uFront + 7.0 * sin(z * 0.012 + 0.7) + 3.0 * sin(z * 0.037); }
// the crest's height above the ground: lower once it's spent on the walk
float crestH(float xf, float z) { return uH * mix(1.0, 0.4, smoothstep(128.0, 175.0, xf)) * (0.82 + 0.36 * bn(vec2(z * 0.06 + uTime * 0.4, 3.0))); }
// the water's top at s metres behind the foot (s < 0: the foam lip sliding ahead)
float topY(float s, float z, out float g, out float hc) {
  float xf = footX(z);
  float x = xf - s;
  g = gY(x);
  hc = crestH(xf, z);
  float lip = 0.06 + 0.22 * hc * pow(smoothstep(-2.2, 0.0, s), 2.0);
  float rise = smoothstep(-0.15, 1.15, s) * (1.0 + 0.14 * exp(-pow((s - 1.05) / 0.45, 2.0)));
  float front = g + max(lip, hc * rise);
  float behind = max(uL, g + 0.3);
  float y = mix(front, max(behind, g + 0.3), smoothstep(1.6, 9.0, s) * 0.85);
  // tumbling: lumps rolling over the crest and down the face
  float tum = bf(vec2(z * 0.55, s * 0.7 - uTime * 2.6)) - 0.5;
  y += hc * 0.32 * tum * smoothstep(-0.4, 0.9, s) * (1.0 - smoothstep(3.0, 9.0, s));
  return max(y, g + 0.03);
}
`;

const ribbonVert = /* glsl */ `
${COMMON}
attribute vec2 sz;
varying vec3 vW; varying float vS; varying float vUp; varying float vZ;
void main() {
  float s = sz.x, z = sz.y;
  // the lip's edge is ragged and pulses
  float s2 = s - 0.9 * (bn(vec2(z * 0.35, uTime * 1.3)) - 0.5) * (1.0 - smoothstep(-0.5, 1.0, s));
  float g, hc;
  float y = topY(s2, z, g, hc);
  vec3 wp = vec3(footX(z) - s2, y, z);
  vW = wp; vS = s2; vZ = z;
  vUp = clamp((y - g) / max(hc, 0.3), 0.0, 1.2);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const ribbonFrag = /* glsl */ `
precision highp float;
${COMMON}
uniform vec3 uDirC; uniform vec3 uAmbC; uniform vec3 uSunD; uniform vec3 uSky;
varying vec3 vW; varying float vS; varying float vUp; varying float vZ;
void main() {
  vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));
  if (N.y < 0.0) N = -N;
  vec3 V = normalize(vW - cameraPosition);
  float lit = 0.35 + 0.65 * max(dot(N, uSunD), 0.0);
  float bub = bf(vec2(vZ * 1.7, vS * 2.2 - uTime * 3.4)) * 0.7 + bf(vec2(vZ * 5.3 + 1.0, vS * 6.0 - uTime * 6.0)) * 0.3;
  // the water: dark, sand-laden, glossy (it mirrors the sky and the star)
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
  vec3 R = reflect(V, N);
  vec3 water = vec3(0.16, 0.12, 0.08) * (uAmbC * 0.45 + uDirC * 0.05) * (0.8 + 0.4 * bub);
  water = mix(water, uSky * 0.9, clamp(F * 1.4, 0.0, 0.8));
  water += uDirC * 0.12 * pow(max(dot(R, uSunD), 0.0), 40.0) * (1.0 - smoothstep(1.5, 3.0, vS));
  // the foam: a white roller on the crest, the lip sliding ahead, streaks down the face, patches behind
  float crest = smoothstep(0.55, 0.9, vUp) * smoothstep(0.2, 0.8, vS) * (1.0 - smoothstep(2.0, 3.5, vS));
  float lipF = 1.0 - smoothstep(-0.2, 0.35, vS);
  float st = bf(vec2(vZ * 1.1, vS * 0.9 - uTime * 2.2));
  float faceF = smoothstep(0.5, 0.68, st) * smoothstep(0.0, 0.5, vS) * (1.0 - smoothstep(1.2, 2.0, vS));
  float backF = smoothstep(0.6, 0.78, bf(vec2(vZ * 0.45 + 3.0, vS * 0.35 - uTime * 1.4))) * smoothstep(1.8, 3.0, vS);
  float foam = clamp(crest * (0.75 + 0.35 * bub) + lipF * (0.55 + 0.45 * bub) + faceF * 0.85 + backF * 0.7, 0.0, 1.0);
  // fine bubbles and holes (what shows when it's right at your feet)
  float fine = bn(vec2(vZ * 7.0, vS * 7.0 - uTime * 8.0)) * 0.5 + bn(vec2(vZ * 17.0 + 3.0, vS * 15.0 - uTime * 12.0)) * 0.5;
  foam = clamp(foam * (0.45 + 0.75 * fine), 0.0, 1.0);
  vec3 foamC = vec3(0.95, 0.95, 0.93) * (uAmbC * 0.55 + uDirC * 0.2 * lit) * (0.7 + 0.25 * bub + 0.3 * fine);
  // backlit: the star shines through the thin water at the top of the roller
  foamC += uDirC * vec3(1.0, 0.75, 0.5) * 0.22 * smoothstep(0.7, 1.05, vUp) * pow(max(dot(V, uSunD), 0.0), 3.0);
  vec3 col = mix(water, foamC, foam);
  // the base of the face is in its own shade
  col *= 0.7 + 0.3 * smoothstep(0.0, 0.6, vUp + step(vS, 0.0));
  float a = smoothstep(-2.4, -1.6, vS) * (1.0 - smoothstep(2.5, 5.5, vS) * (1.0 - backF * 0.5)) * smoothstep(-160.0, -140.0, vZ) * (1.0 - smoothstep(120.0, 140.0, vZ));
  gl_FragColor = vec4(col, a * uOn);
}`;

const sprayVert = /* glsl */ `
${COMMON}
attribute vec4 seed;
uniform float uPx;
varying float vA;
void main() {
  float P = 0.9 + 0.5 * seed.w;
  float ph = fract(uTime / P + seed.x);
  float age = ph * P;
  float z = -150.0 + 280.0 * seed.y;
  float s0 = 0.2 + 1.4 * seed.z;
  float g, hc;
  float y0 = topY(s0, z, g, hc);
  float vy = (2.0 + 3.5 * seed.w) * clamp(hc / 1.6, 0.3, 1.0);
  vec3 wp = vec3(footX(z) - s0 + (1.0 + 2.0 * seed.z) * age, y0 + vy * age - 4.9 * age * age, z + (seed.x - 0.5) * 0.8 * age);
  wp.y = max(wp.y, g + 0.05);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizeM = 0.05 + 0.12 * fract(seed.x * 7.3);
  gl_PointSize = clamp(sizeM / (uPx * max(-mv.z, 0.5)), 1.0, 7.0);
  vA = uOn * sin(3.14159 * ph) * 0.45 * step(-145.0, z) * (1.0 - step(130.0, z));
}`;
const sprayFrag = /* glsl */ `
precision highp float;
uniform vec3 uDirC; uniform vec3 uAmbC;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = dot(q, q) * 4.0;
  if (r > 1.0) discard;
  vec3 col = vec3(0.95, 0.95, 0.93) * (uAmbC * 0.55 + uDirC * 0.2);
  gl_FragColor = vec4(col, vA * (1.0 - r) * (1.0 - r));
}`;

export function makeBore(scene) {
  const u = {
    uFront: { value: 0 }, uH: { value: 2.0 }, uL: { value: 3 }, uTime: { value: 0 }, uOn: { value: 0 },
    uDirC: { value: new THREE.Color(1, 1, 1) }, uAmbC: { value: new THREE.Color(1, 1, 1) }, uSunD: { value: new THREE.Vector3(0, 1, 0) },
    uSky: { value: new THREE.Color(0.5, 0.4, 0.3) }, uPx: { value: 0.0006 },
  };
  // the ribbon: fine across the front (s), 0.4 m along the beach (z)
  const S = [];
  for (let s = -2.4; s < 2.2; s += 0.08) S.push(s);
  for (let s = 2.2; s <= 13.01; s += 0.35) S.push(s);
  const NZ = 700, Z0 = -150, Z1 = 140;
  const sz = new Float32Array(S.length * (NZ + 1) * 2);
  let k = 0;
  for (let j = 0; j <= NZ; j++) for (const s of S) { sz[k++] = s; sz[k++] = Z0 + (Z1 - Z0) * j / NZ; }
  const idx = [];
  const ns = S.length;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < ns - 1; i++) {
    const a = j * ns + i, b = a + 1, c = a + ns, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('sz', new THREE.BufferAttribute(sz, 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sz.length / 2 * 3), 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: ribbonVert, fragmentShader: ribbonFrag, transparent: true, side: THREE.DoubleSide, depthWrite: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  // the spray
  const N = 26000;
  const seeds = new Float32Array(N * 4);
  let a = 12345;
  const R = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  for (let i = 0; i < N * 4; i++) seeds[i] = R();
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const spray = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: u, vertexShader: sprayVert, fragmentShader: sprayFrag, transparent: true, depthWrite: false }));
  spray.frustumCulled = false;
  spray.renderOrder = 3;
  scene.add(spray);
  return {
    u,
    frame(on) { mesh.visible = spray.visible = on > 0.001; },
  };
}
