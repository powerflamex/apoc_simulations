// Space: the black hole passing Neptune, Saturn and Jupiter (the LIVE pictures, full screen and on the avenue's
// screens), and at the end you falling in with Earth's debris. The planets, the debris streams and Saturn's rings are
// drawn first into a texture (with alpha); then a full-screen lens pass traces each pixel's light ray past the hole
// (Schwarzschild, integrated per pixel, the same maths as the black hole Short's sky), adds the accretion disk, and
// looks up where the bent ray lands: in the picture if it lands inside the frame, else on the star field.
// Units: planet radius 1; the hole's Schwarzschild radius is RS (its dark shadow is ~2.6 RS in radius).
import * as THREE from 'three';
import { smooth, clamp, lerp, rng, DEG } from './util.js';

const RS = 0.42;

const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
`;
const STARS_GLSL = NOISE_GLSL + /* glsl */ `
uniform float uPx;
vec3 starLayer(vec3 d, float scale, float density, float seed, float bright) {
  vec3 p = d * scale;
  vec3 c = floor(p);
  vec3 h = hash33(c + seed);
  if (h.x > density) return vec3(0.0);
  vec3 sp = c + 0.3 + 0.4 * hash33(c + seed + 19.7);
  vec3 sd = normalize(sp);
  float ang = length(d - sd);
  float w = uPx * 0.9;
  float b = exp(-ang * ang / (w * w)) * pow(h.y, 5.0) * bright;
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), h.z);
  return tint * b;
}
vec3 milkyWay(vec3 d) {
  vec3 n = normalize(vec3(0.3, 0.8, 0.5));
  float band = exp(-pow(dot(d, n) / 0.22, 2.0));
  float f = fbm(d * 5.0);
  float dust = smoothstep(0.45, 0.75, fbm(d * 11.0 + 3.0));
  vec3 col = mix(vec3(0.5, 0.58, 0.85), vec3(0.95, 0.78, 0.62), f) * band * (0.25 + 0.75 * f) * (1.0 - 0.7 * dust * band);
  return col * 0.16;
}
vec3 stars(vec3 d) {
  return milkyWay(d) + starLayer(d, 60.0, 0.32, 0.0, 6.0) + starLayer(d, 110.0, 0.26, 41.0, 3.0) + starLayer(d, 170.0, 0.2, 87.0, 1.5);
}
`;

// ---------- the lens pass (full screen) ----------
const lensFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tBase;
uniform vec3 uHole;        // the hole in camera space
uniform float uRs;
uniform float uTanHalf, uAspect;
uniform float uDisk;
uniform vec3 uDiskN;       // disk normal (camera space)
uniform float uTime;
uniform float uFuture;     // the end: the universe's future flashing by (blue shift, strobing light)
uniform mat3 uCamToWorld;
${STARS_GLSL}

vec4 disk(vec3 p, vec3 vel, vec3 nD, vec3 e1, vec3 e2) {
  float x = dot(p, e1), z = dot(p, e2);
  float r = length(vec2(x, z));
  float inner = 3.0, outer = 15.0;
  if (r < inner * 0.9 || r > outer) return vec4(0.0);
  float a = atan(z, x);
  float rot = uTime * 1.6 * pow(r / 3.0, -1.5);
  float ang = a - rot;
  vec3 np = vec3(cos(ang) * r * 0.9, sin(ang) * r * 0.9, r * 1.4);
  float n = fbm(np * 0.9);
  float streak = fbm(vec3(r * 3.2, cos(ang) * 1.2, sin(ang) * 1.2));
  float I = pow(inner / r, 2.0) * smoothstep(inner * 0.92, inner * 1.15, r) * (1.0 - smoothstep(outer * 0.55, outer, r));
  I *= 0.45 + 1.1 * n * (0.6 + 0.8 * streak);
  vec3 tang = normalize(cross(nD, p));
  float dop = dot(tang, -normalize(vel));
  float beam = pow(1.0 + 0.55 * dop, 3.0);
  float temp = clamp(I * beam * 1.2, 0.0, 2.0);
  vec3 col = mix(vec3(0.9, 0.25, 0.06), vec3(1.0, 0.62, 0.3), smoothstep(0.1, 0.6, temp));
  col = mix(col, vec3(1.0, 0.95, 0.88), smoothstep(0.7, 1.6, temp));
  float alpha = clamp(I * 2.4, 0.0, 0.97);
  return vec4(col * I * beam * 5.0 * uDisk, alpha * min(uDisk * 2.0, 1.0));
}

vec3 look(vec3 dc) {
  // a camera-space direction -> the picture if it's inside the frame, else the stars
  vec3 w = uCamToWorld * dc;
  vec3 bg = stars(normalize(w));
  if (uFuture > 0.0) {
    float f = uFuture;
    bg *= 1.0 + 4.0 * f;
    bg = mix(bg, bg.zyx * vec3(0.7, 1.0, 1.6), f);
    bg += vec3(0.25, 0.4, 0.8) * f * f * 0.35 * (0.5 + 0.5 * sin(uTime * 17.0 + dot(w, vec3(9.0, 4.0, 7.0))));
  }
  if (dc.z < -1e-4) {
    vec2 uv = vec2(dc.x / (-dc.z * uTanHalf * uAspect), dc.y / (-dc.z * uTanHalf)) * 0.5 + 0.5;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      vec4 o = texture2D(tBase, uv);
      return o.rgb + (1.0 - o.a) * bg;
    }
  }
  return bg;
}

void main() {
  vec3 v = normalize(vec3((vUv.x * 2.0 - 1.0) * uTanHalf * uAspect, (vUv.y * 2.0 - 1.0) * uTanHalf, -1.0));
  vec3 F = normalize(uHole);
  vec3 R = normalize(cross(F, abs(F.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 U = cross(R, F);
  vec3 d = vec3(dot(v, R), dot(v, U), dot(v, F));
  float D = length(uHole) / uRs;
  float sinT = length(d.xy), cosT = d.z;
  float b = D * sinT;
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  vec3 outDir;
  bool strong = cosT > 0.0 && b < 70.0;
  if (!strong) {
    // weak-field deflection (pulls the picture inward toward the hole)
    float alpha_d = (1.0 + cosT) / max(D * sinT, 1e-4);
    float theta = atan(sinT, cosT);
    float beta = theta - alpha_d;
    vec2 rad = d.xy / max(sinT, 1e-6);
    outDir = vec3(rad * sin(beta), cos(beta));
  } else {
    vec3 pos = vec3(0.0, 0.0, -D);
    vec3 dir = d;
    if (D > 70.0) {
      float pd = dot(pos, dir);
      float disc = pd * pd - (D * D - 4900.0);
      pos += dir * (-pd - sqrt(max(disc, 0.0)));
      float u0 = -cosT, u1 = -sqrt(max(1.0 - b * b / 4900.0, 0.0));
      float pre = ((1.5 * u1 - 0.5 * u1 * u1 * u1) - (1.5 * u0 - 0.5 * u0 * u0 * u0)) / max(b, 1e-3);
      float th = atan(sinT, cosT) - pre;
      dir = vec3(d.xy / max(sinT, 1e-6) * sin(th), cos(th));
    }
    vec3 nD = normalize(vec3(dot(uDiskN, R), dot(uDiskN, U), dot(uDiskN, F)));
    vec3 e1 = normalize(cross(nD, abs(nD.z) < 0.95 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(e1, nD);
    vec3 c3 = cross(pos, dir);
    float h2 = dot(c3, c3);
    vec3 vel = dir;
    bool captured = false;
    for (int i = 0; i < 320; i++) {
      float r2 = dot(pos, pos);
      float r = sqrt(r2);
      float dt = clamp(0.06 * r, 0.012, 4.0);
      vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
      vec3 prev = pos;
      vel += acc * dt;
      pos += vel * dt;
      if (uDisk > 0.001) {
        float a0 = dot(prev, nD), a1 = dot(pos, nD);
        if (a0 * a1 < 0.0) {
          vec3 hit = mix(prev, pos, a0 / (a0 - a1));
          vec4 e = disk(hit, vel, nD, e1, e2);
          col += (1.0 - alpha) * e.rgb;
          alpha += (1.0 - alpha) * e.a;
        }
      }
      if (r < 1.0) { captured = true; break; }
      if (r > 75.0 && dot(pos, vel) > 0.0) break;
    }
    if (captured) alpha = 1.0;
    outDir = normalize(vel);
  }
  vec3 dc = normalize(R * outDir.x + U * outDir.y + F * outDir.z);
  vec3 c = col + (1.0 - alpha) * look(dc);
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}
`;

// ---------- planets: a sphere that stretches toward the hole and dissolves as it's torn ----------
const planetVert = /* glsl */ `
uniform vec3 uAxis;       // toward the hole (object space)
uniform float uStretch;
varying vec3 vN; varying vec3 vP; varying vec3 vObj; varying float vAlong;
void main() {
  vec3 p = position;
  float along = dot(p, uAxis);
  vec3 perp = p - uAxis * along;
  float s = uStretch;
  // tidal: long toward (and away from) the hole, thin across, and the near side pulled ahead
  p = perp * (1.0 - 0.45 * s) + uAxis * (along * (1.0 + 2.6 * s * s) + max(along, 0.0) * 2.5 * s * s * s);
  vObj = position; vAlong = along;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normalize(perp * (1.0 + 0.45 * s) + uAxis * along / (1.0 + 2.6 * s * s)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const planetFrag = /* glsl */ `
precision highp float;
uniform vec3 uSun; uniform float uKind; uniform float uStretch; uniform float uDissolve; uniform float uHeat; uniform float uTime;
varying vec3 vN; varying vec3 vP; varying vec3 vObj; varying float vAlong;
${NOISE_GLSL}
vec3 surface(vec3 o) {
  float lat = o.y;
  if (uKind < 0.5) {            // Neptune: deep blue, soft bands, a dark spot
    float b = fbm(vec3(lat * 6.0, o.x * 0.6, o.z * 0.6));
    vec3 c = mix(vec3(0.16, 0.32, 0.82), vec3(0.32, 0.55, 0.95), b);
    c *= 1.0 - 0.35 * exp(-dot(o - normalize(vec3(0.5, -0.25, 0.8)), o - normalize(vec3(0.5, -0.25, 0.8))) * 28.0);
    return c;
  } else if (uKind < 1.5) {     // Saturn: butterscotch bands
    float b = sin(lat * 26.0 + 2.0 * fbm(o * 3.0)) * 0.5 + 0.5;
    return mix(vec3(0.78, 0.66, 0.45), vec3(0.93, 0.84, 0.62), b) * (0.85 + 0.15 * fbm(o * 8.0));
  } else if (uKind < 2.5) {     // Jupiter: bands + the red spot
    float b = sin(lat * 18.0 + 3.0 * fbm(vec3(o.x * 2.0, lat * 5.0, o.z * 2.0))) * 0.5 + 0.5;
    vec3 c = mix(vec3(0.62, 0.45, 0.32), vec3(0.93, 0.86, 0.74), b);
    vec3 spot = normalize(vec3(0.55, -0.35, 0.75));
    float sd = length((o - spot) * vec3(0.6, 1.4, 0.6));
    c = mix(c, vec3(0.75, 0.32, 0.2), smoothstep(0.32, 0.18, sd));
    return c;
  } else {                      // Earth: oceans, land, ice caps, clouds
    float land = smoothstep(0.52, 0.56, fbm(o * 2.3 + 1.7));
    vec3 c = mix(vec3(0.03, 0.12, 0.35), mix(vec3(0.18, 0.36, 0.14), vec3(0.55, 0.47, 0.3), fbm(o * 6.0)), land);
    c = mix(c, vec3(0.92), smoothstep(0.78, 0.86, abs(o.y)));
    float cl = smoothstep(0.5, 0.75, fbm(o * 4.0 + vec3(uTime * 0.02, 0.0, 0.0)));
    return mix(c, vec3(0.95), cl * 0.8);
  }
}
void main() {
  vec3 o = normalize(vObj);
  // torn apart: the surface breaks into pieces from the near side first
  float crack = fbm(o * 7.0 + 3.0);
  float gone = uDissolve * 1.6 - (0.5 - 0.5 * vAlong) - crack * 0.6;
  if (gone > 0.0) discard;
  vec3 n = normalize(vN);
  float diff = max(dot(n, uSun), 0.0);
  vec3 c = surface(o) * (0.025 + 0.95 * diff);
  // hot where it's being torn (the crack edges glow)
  float edge = smoothstep(-0.25, 0.0, gone) * step(0.01, uDissolve);
  c += vec3(1.0, 0.5, 0.18) * (edge * 3.0 + uHeat * smoothstep(0.0, 1.0, vAlong) * 1.2);
  // a thin atmosphere rim
  float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vP))), 3.0);
  c += (uKind < 0.5 ? vec3(0.2, 0.4, 1.0) : uKind > 2.5 ? vec3(0.3, 0.55, 1.0) : vec3(0.5, 0.4, 0.3)) * rim * 0.35 * (0.3 + diff);
  gl_FragColor = vec4(c, 1.0);
}`;

// debris and ring particles: each one leaves its place at its own moment and spirals into the hole
const partVert = /* glsl */ `
attribute vec3 aStart; attribute vec4 aRnd; attribute vec3 aCol;
uniform vec3 uHole; uniform vec3 uDN; uniform float uK; uniform float uSpread; uniform float uSize; uniform float uPxScale; uniform float uRs; uniform float uTime;
varying vec3 vCol; varying float vA;
void main() {
  // aRnd: x = when it leaves (0..1 of uK), y = turns, z = final orbit radius, w = random
  float k = clamp((uK - aRnd.x) / max(uSpread, 1e-3), 0.0, 1.0);
  vec3 rel = aStart - uHole;
  // in the disk plane: the start radius and angle, winding inward
  vec3 e1 = normalize(rel - uDN * dot(rel, uDN) + 1e-4);
  vec3 e2 = cross(uDN, e1);
  float r0 = length(rel);
  float kk = 1.0 - pow(1.0 - k, 2.2);
  float r = mix(r0, aRnd.z * uRs, kk);
  float ang = kk * aRnd.y * 6.2831 + k * k * uTime * 0.0;
  // out of the plane it settles flat (a thin ring)
  float h = dot(rel, uDN) * (1.0 - kk) + (aRnd.w - 0.5) * 0.15 * uRs * kk;
  vec3 p = uHole + (e1 * cos(ang) + e2 * sin(ang)) * r + uDN * h;
  p = mix(aStart, p, smoothstep(0.0, 0.08, k));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uPxScale / -mv.z, 1.0, 6.0);
  float heat = smoothstep(0.2, 0.9, kk);
  vCol = mix(aCol, mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.8, 0.55), aRnd.w) * 1.25, heat);
  // (still part of the planet or the rings until it leaves: drawn by them, not as a dot)
  vA = smoothstep(0.0, 0.03, k) * (0.55 + 0.45 * aRnd.w);
}`;
const partFrag = /* glsl */ `
precision highp float;
varying vec3 vCol; varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = smoothstep(1.0, 0.3, dot(q, q));
  if (a < 0.02) discard;
  a *= vA;
  gl_FragColor = vec4(vCol * a, a);
}`;

// ---------- the shots ----------
// per planet: where it sits, the hole's path past it (start -> closest -> after), the camera
const SHOTS = {
  neptune: { kind: 0, R: 1.0, P: [-1.4, 0, 0], H: [[9, 2.2, -7], [1.05, 0.55, -1.25], [-3.5, -0.4, -3.6]], cam: [[0.9, 0.5, 8.2], [0.2, 0.35, 7.0]], look: [[0.6, 0.2, -1.2], [-0.6, 0.0, -1.6]], dn: [0.25, 0.95, 0.18], sun: [0.8, 0.25, 0.55] },
  saturn: { kind: 1, R: 1.0, P: [-1.1, 0, 0], H: [[8.5, -1.6, -6], [1.9, -0.25, -1.6], [-3.2, 0.5, -3.4]], cam: [[0.4, 1.6, 8.8], [-0.2, 1.1, 7.8]], look: [[0.6, 0.0, -1.0], [-0.5, -0.1, -1.4]], dn: [0.18, 0.96, 0.2], sun: [0.75, 0.4, 0.5], rings: true },
  jupiter: { kind: 2, R: 1.4, P: [-1.6, 0, 0], H: [[9, 1.6, -5], [1.35, 0.45, -1.3], [-4.6, -0.6, -2.5]], cam: [[0.5, 0.6, 9.6], [-0.4, 0.3, 8.8]], look: [[0.4, 0.2, -1.0], [-0.9, 0.0, -1.4]], dn: [0.3, 0.92, 0.25], sun: [0.8, 0.3, 0.5] },
};
// how each cutaway runs (u: 0..1 across the cutaway): the hole's progress along its path, the tide, the tearing
function plan(what, u) {
  if (what === 'neptune') return { path: smooth(0, 0.62, u) * 0.5 + smooth(0.62, 1.0, u) * 0.5, stretch: smooth(0.28, 0.5, u), dissolve: smooth(0.42, 0.72, u), heat: smooth(0.35, 0.6, u), K: smooth(0.38, 0.95, u), disk: smooth(0.5, 0.8, u) * 0.18, camK: u };
  if (what === 'saturn') return { path: smooth(0, 0.6, u) * 0.5 + smooth(0.6, 1.0, u) * 0.5, stretch: smooth(0.55, 0.85, u) * 0.6, dissolve: smooth(0.7, 0.98, u) * 0.6, heat: smooth(0.55, 0.85, u) * 0.6, K: smooth(0.18, 0.92, u), disk: 0.12 + smooth(0.3, 0.8, u) * 0.16, camK: u };
  return { path: smooth(0, 0.58, u) * 0.5 + smooth(0.58, 1.0, u) * 0.5, stretch: smooth(0.25, 0.55, u), dissolve: smooth(0.42, 0.8, u), heat: smooth(0.3, 0.6, u), K: smooth(0.35, 0.95, u), disk: 0.25 + smooth(0.45, 0.85, u) * 0.3, camK: u };
}

export function makeSpace(renderer, { w = 1920, h = 1080 } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 500);
  const sunDir = new THREE.Vector3();
  const R = rng(808);

  // the planet
  const pUniforms = { uAxis: { value: new THREE.Vector3(1, 0, 0) }, uStretch: { value: 0 }, uSun: { value: sunDir }, uKind: { value: 0 }, uDissolve: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 } };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({ uniforms: pUniforms, vertexShader: planetVert, fragmentShader: planetFrag }));
  scene.add(planet);

  // particles: debris (from the planet's surface) + Saturn's rings
  const hole = new THREE.Vector3();
  const qUniforms = { uHole: { value: hole }, uDN: { value: new THREE.Vector3(0, 1, 0) }, uK: { value: 0 }, uSpread: { value: 0.35 }, uSize: { value: 0.03 }, uPxScale: { value: h / (2 * Math.tan(21 * DEG)) }, uRs: { value: RS }, uTime: { value: 0 } };
  const pmat = new THREE.ShaderMaterial({ uniforms: qUniforms, vertexShader: partVert, fragmentShader: partFrag, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const N_DEB = 14000, N_RING = 26000;
  const mkPoints = (n) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, pmat);
    p.frustumCulled = false;
    scene.add(p);
    return p;
  };
  const debris = mkPoints(N_DEB), rings = mkPoints(N_RING);
  const ringU = { uK: qUniforms.uK, uSun: { value: sunDir } };
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.25, 2.4, 256, 8), new THREE.ShaderMaterial({
    uniforms: ringU, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vQ; void main(){ vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uK; varying vec2 vQ;
      void main() {
        float r = length(vQ), a = atan(vQ.y, vQ.x);
        // the same moment each ring particle leaves (build(): the side toward the hole first)
        float facing = cos(a) * 0.5 + 0.5;
        float leave = clamp((1.0 - facing) * 0.55 + (r - 1.25) * 0.12, 0.0, 0.92);
        float left = smoothstep(leave - 0.02, leave + 0.02, uK);
        float band = 0.75 + 0.25 * sin(r * 31.0) + 0.15 * sin(r * 87.0);
        float gap = 1.0 - 0.85 * smoothstep(0.03, 0.0, abs(r - 1.96));
        float alpha = (0.55 + 0.3 * band) * gap * smoothstep(1.25, 1.32, r) * smoothstep(2.4, 2.25, r) * (1.0 - left);
        gl_FragColor = vec4(vec3(0.85, 0.76, 0.58) * band * 0.75 * alpha, alpha);
      }`,
  }));
  ringMesh.rotation.order = 'XYZ';
  scene.add(ringMesh);
  const COL = { neptune: [0.25, 0.45, 0.95], saturn: [0.88, 0.76, 0.52], jupiter: [0.85, 0.7, 0.55], earth: [0.3, 0.45, 0.6] };
  let built = '';
  function build(what) {
    if (built === what) return;
    built = what;
    const sh = SHOTS[what] || SHOTS.neptune;
    const P = new THREE.Vector3(...(sh.P || [0, 0, 0])), Rp = sh.R || 1;
    const Rr = rng(what.length * 97 + 3);
    // debris: from the surface, the side facing the hole leaving first
    {
      const g = debris.geometry, st = g.attributes.aStart.array, rd = g.attributes.aRnd.array, cl = g.attributes.aCol.array;
      const c0 = COL[what] || COL.neptune;
      for (let i = 0; i < N_DEB; i++) {
        const u = Rr() * 2 - 1, a = Rr() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const d = new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
        const near = d.x * 0.8 + d.z * -0.2;          // roughly toward where the hole passes
        st.set([P.x + d.x * Rp * 0.98, P.y + d.y * Rp * 0.98, P.z + d.z * Rp * 0.98], i * 3);
        rd.set([clamp(0.5 - near * 0.4 + Rr() * 0.25, 0, 0.95) * 0.65, 0.6 + Rr() * 1.4, 3.2 + Rr() * 9.0, Rr()], i * 4);
        const v = 0.7 + Rr() * 0.5;
        cl.set([c0[0] * v, c0[1] * v, c0[2] * v], i * 3);
      }
      g.attributes.aStart.needsUpdate = g.attributes.aRnd.needsUpdate = g.attributes.aCol.needsUpdate = true;
    }
    // Saturn's rings: a flat, banded annulus, the side nearest the hole pulled away first
    rings.visible = !!sh.rings;
    ringMesh.visible = !!sh.rings;
    if (sh.rings) {
      // (RingGeometry lies in xy: turn it flat into xz, then the same tilt as the particles)
      ringMesh.quaternion.setFromEuler(new THREE.Euler(0.42, 0, 0.22)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
      ringMesh.position.set(...sh.P);
      const g = rings.geometry, st = g.attributes.aStart.array, rd = g.attributes.aRnd.array, cl = g.attributes.aCol.array;
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0.22));
      for (let i = 0; i < N_RING; i++) {
        let r;
        do { r = 1.25 + Rr() * 1.15; } while (r > 1.92 && r < 2.0 && Rr() < 0.9);   // the Cassini gap
        const a = Rr() * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(a) * r, (Rr() - 0.5) * 0.008, Math.sin(a) * r).applyQuaternion(tilt);
        st.set([P.x + p.x, P.y + p.y, P.z + p.z], i * 3);
        const facing = Math.cos(a) * 0.5 + 0.5;            // +x side (toward the hole) goes first
        rd.set([clamp((1 - facing) * 0.55 + (r - 1.25) * 0.12 + Rr() * 0.08, 0, 0.92), 0.5 + Rr() * 1.2, 3.2 + Rr() * 10.0, Rr()], i * 4);
        const band = 0.75 + 0.25 * Math.sin(r * 31) + 0.15 * Math.sin(r * 87);
        cl.set([0.85 * band, 0.76 * band, 0.58 * band], i * 3);
      }
      g.attributes.aStart.needsUpdate = g.attributes.aRnd.needsUpdate = g.attributes.aCol.needsUpdate = true;
    }
  }

  // the base picture (with alpha) and the lens pass that reads it
  const mkRT = (W, H) => new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const baseRT = mkRT(w, h);
  const lUniforms = {
    tBase: { value: baseRT.texture }, uHole: { value: new THREE.Vector3() }, uRs: { value: RS }, uTanHalf: { value: Math.tan(21 * DEG) }, uAspect: { value: w / h },
    uDisk: { value: 0 }, uDiskN: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uFuture: { value: 0 }, uPx: { value: 0.0007 }, uCamToWorld: { value: new THREE.Matrix3() },
  };
  const lensMat = new THREE.ShaderMaterial({ uniforms: lUniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: lensFrag, depthTest: false, depthWrite: false });
  const lensScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat);
  quad.frustumCulled = false;
  lensScene.add(quad);
  const lensCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const v3 = (a) => new THREE.Vector3(...a);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const pathAt = (pts, k) => {
    // through start -> closest (k = 0.5) -> after, smoothly
    const [a, b, c] = pts.map(v3);
    if (k < 0.5) { const q = k / 0.5; return a.lerp(b, 1 - Math.pow(1 - q, 2.2)); }
    const q = (k - 0.5) / 0.5;
    return b.lerp(c, Math.pow(q, 1.6));
  };

  // ---------- the fall: you fall toward the hole with Earth's debris; Earth stretched behind you ----------
  function setFall(v) {
    const u = clamp((v - 300) / 31);
    hole.set(0, 0, 0);
    // you: from far out, falling in (the hole's shadow grows to fill most of the view)
    const dist = lerp(26, 1.3, Math.pow(smooth(0, 0.86, u), 1.35));
    camera.position.set(0.35 * (1 - u), 0.22 + 0.4 * (1 - u), dist);
    // look back at Earth (304-309), then ahead at the hole
    const back = smooth(301.5, 303.5, v) * (1 - smooth(309, 311.5, v));
    const ahead = tmp.set(0, 0, 0);
    const behind = tmp2.set(6.5, -2.2, dist + 4);
    const target = ahead.lerp(behind, back);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.rotateZ((1 - back) * 0.25 * Math.sin(v * 0.3) + smooth(312, 330, v) * 0.8);
    camera.fov = lerp(48, 70, smooth(305, 328, v));
    // Earth: behind you, being pulled into a stream that runs past you into the hole
    planet.visible = true;
    pUniforms.uKind.value = 3;
    planet.position.set(9.0, -3.0, dist + 6 - 2 * u);
    planet.scale.setScalar(2.6);
    pUniforms.uAxis.value.copy(tmp.copy(hole).sub(planet.position).normalize());
    pUniforms.uStretch.value = lerp(0.8, 1.0, u);
    pUniforms.uDissolve.value = lerp(0.35, 0.8, u);
    pUniforms.uHeat.value = 0.6;
    // its debris stream: from Earth to the hole, around you
    build('earth-fall');
    const g = debris.geometry, st = g.attributes.aStart.array, rd = g.attributes.aRnd.array;
    if (!debris.userData.fall) {
      debris.userData.fall = true;
      const Rr = rng(4242), cl = g.attributes.aCol.array;
      for (let i = 0; i < N_DEB; i++) {
        const along = Rr();
        // along the line from Earth (behind and to the side of you) toward the hole
        const p = tmp.set(7.5 * along + (Rr() - 0.5) * 2.4 * (0.3 + along), -3.0 * along + (Rr() - 0.5) * 2.4 * (0.3 + along), 4 + along * 34);
        st.set([p.x, p.y, p.z], i * 3);
        rd.set([Rr() * 0.6, 0.4 + Rr() * 1.0, 3.2 + Rr() * 8, Rr()], i * 4);
        const land = Rr() < 0.3;
        cl.set(land ? [0.45, 0.38, 0.26] : [0.25, 0.4, 0.62], i * 3);
      }
      g.attributes.aStart.needsUpdate = g.attributes.aRnd.needsUpdate = g.attributes.aCol.needsUpdate = true;
    }
    rings.visible = false;
    ringMesh.visible = false;
    qUniforms.uK.value = lerp(0.1, 1.4, u);
    qUniforms.uSpread.value = 0.5;
    qUniforms.uSize.value = 0.03;
    qUniforms.uDN.value.set(0.12, 1, 0.1).normalize();
    lUniforms.uDisk.value = 0.55;
    lUniforms.uDiskN.value.copy(qUniforms.uDN.value);
    lUniforms.uFuture.value = smooth(316, 326, v);
    sunDir.set(-0.4, 0.5, 0.75).normalize();
  }

  function setShot(what, u, v) {
    if (what === 'fall') return setFall(v);
    debris.userData.fall = false;
    const sh = SHOTS[what];
    build(what);
    const p = plan(what, u);
    hole.copy(pathAt(sh.H, p.path));
    planet.visible = true;
    planet.position.set(...sh.P);
    planet.scale.setScalar(sh.R);
    pUniforms.uKind.value = sh.kind;
    pUniforms.uAxis.value.copy(tmp.copy(hole).sub(planet.position).normalize());
    pUniforms.uStretch.value = p.stretch;
    pUniforms.uDissolve.value = p.dissolve;
    pUniforms.uHeat.value = p.heat;
    planet.visible = p.dissolve < 0.999;
    sunDir.set(...sh.sun).normalize();
    // the camera drifts slowly, keeping both in view
    camera.position.copy(v3(sh.cam[0]).lerp(v3(sh.cam[1]), p.camK));
    camera.up.set(0, 1, 0);
    camera.lookAt(v3(sh.look[0]).lerp(v3(sh.look[1]), smooth(0, 1, p.camK)));
    camera.fov = 42;
    qUniforms.uK.value = p.K;
    qUniforms.uSpread.value = 0.35;
    qUniforms.uSize.value = 0.026;
    qUniforms.uDN.value.set(...sh.dn).normalize();
    lUniforms.uDisk.value = p.disk;
    lUniforms.uDiskN.value.copy(qUniforms.uDN.value);
    lUniforms.uFuture.value = 0;
  }

  return {
    lensScene, lensCamera,
    // set up the shot (what: neptune / saturn / jupiter / fall; u: 0..1 across the cutaway) and draw the base picture
    // into its texture; then render lensScene with lensCamera (main.js, or renderTo for the avenue's screen)
    prepare(what, u, v, target = baseRT) {
      setShot(what, u, v);
      qUniforms.uTime.value = v; pUniforms.uTime.value = v; lUniforms.uTime.value = v;
      camera.aspect = target.width / target.height;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      lUniforms.uTanHalf.value = Math.tan((camera.fov * DEG) / 2);
      lUniforms.uAspect.value = camera.aspect;
      lUniforms.uPx.value = (2 * lUniforms.uTanHalf.value) / target.height;
      qUniforms.uPxScale.value = target.height / (2 * lUniforms.uTanHalf.value);
      lUniforms.uHole.value.copy(hole).applyMatrix4(camera.matrixWorldInverse);
      lUniforms.uDiskN.value.transformDirection(camera.matrixWorldInverse);
      lUniforms.uCamToWorld.value.setFromMatrix4(camera.matrixWorld);
      lUniforms.tBase.value = target.texture;
      const prevClear = renderer.getClearAlpha();
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, prevClear);
    },
    // the LIVE picture on the avenue's screen: its own small targets
    makeFeed(W = 768, H = 432) {
      const base = mkRT(W, H), out = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
      return {
        texture: out.texture,
        render: (what, u, v) => {
          this.prepare(what, u, v, base);
          renderer.setRenderTarget(out);
          renderer.render(lensScene, lensCamera);
          renderer.setRenderTarget(null);
        },
      };
    },
    baseRT,
  };
}
