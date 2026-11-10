// Its pull on everything, two ways:
//   pullWarp (GLSL + the same thing in JS): big and fixed things (the street, the buildings, signs, the planet) are
//     bent toward it in the vertex shader. Each kind has a strength: kLean (g at which it starts to bend, up to
//     leanMax radians at the top, more the higher above the street it is) and k (g at which it tears loose and pours
//     in). A point at pull a (in g) sits at the share f = exp(-(a/k)^1.5) of its distance (a/k = 1: 63% of the way
//     in; a/k = 3: all the way); it is turned round the vertical line through the black hole as it goes (a swirl),
//     and glows as it is crushed (heat).
//   falls: loose things (people, cars, props, glass, dust) hold on until the pull at their spot passes their k,
//     then fall in: r'' = -GM(t)/r^2 + l^2/r^3 (+ air drag for light things), with a little angular momentum that
//     the crush bleeds away, so they spiral; integrated once at load (RK4, adaptive step) and sampled at 240 Hz.
import * as THREE from 'three';
import { BH, gmAt, vWhen, GEE } from './timeline.js';

export const B = new THREE.Vector3(BH.x, BH.y, BH.z);
export const SWIRL = 2.4;

export const PU = {
  uB: { value: B.clone() }, uGM: { value: 1 }, uSwirl: { value: SWIRL },
};

export const PULL_GLSL = /* glsl */ `
uniform vec3 uB; uniform float uGM; uniform float uSwirl;
vec3 pullWarp(vec3 p, float k, float kLean, float leanMax, out float heat) {
  vec3 d = p - uB;
  float r = max(length(d), 1e-4);
  float a = uGM / (r * r) / ${GEE.toFixed(2)};
  if (kLean > 0.0) {
    vec2 hd = d.xz;
    float hr = max(length(hd), 1e-3);
    float th = leanMax * (1.0 - exp(-a / kLean));
    float h = max(p.y, 0.0);
    p.xz -= hd / hr * min(h * tan(th), hr * 0.85);
    d = p - uB;
  }
  float x = min(a / k, 1e4);
  float f = exp(-pow(x, 1.5));
  float s = 1.0 - f;
  float ang = uSwirl * s * s;
  float cs = cos(ang), sn = sin(ang);
  d.xz = vec2(cs * d.x - sn * d.z, sn * d.x + cs * d.z);
  heat = smoothstep(2.0, 14.0, x);
  return uB + d * f;
}
`;

// the same, in JS (for where a piece of glass starts from when it breaks loose)
export function pullWarp(p, v, k, kLean = 0, leanMax = 0, out = new THREE.Vector3()) {
  const GM = gmAt(v);
  let dx = p.x - B.x, dy = p.y - B.y, dz = p.z - B.z;
  const r = Math.max(Math.hypot(dx, dy, dz), 1e-4);
  const a = GM / (r * r) / GEE;
  let px = p.x, pz = p.z;
  if (kLean > 0) {
    const hr = Math.max(Math.hypot(dx, dz), 1e-3);
    const th = leanMax * (1 - Math.exp(-a / kLean));
    const sh = Math.min(Math.max(p.y, 0) * Math.tan(th), hr * 0.85);
    px -= dx / hr * sh; pz -= dz / hr * sh;
    dx = px - B.x; dz = pz - B.z;
  }
  const x = Math.min(a / k, 1e4), f = Math.exp(-Math.pow(x, 1.5)), s = 1 - f;
  const ang = SWIRL * s * s, cs = Math.cos(ang), sn = Math.sin(ang);
  const rx = cs * dx - sn * dz, rz = sn * dx + cs * dz;
  return out.set(B.x + rx * f, B.y + dy * f, B.z + rz * f);
}

// Patch a three.js material so its vertices are pulled (and crushed matter glows). kind: { k, kLean, leanMax, heat }
// (heat: how bright the crushed part glows). Per-instance strength (aPull = k, kLean) if instanced with that attribute.
export function patchPull(mat, kind, { instK = false } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, PU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${PULL_GLSL}
        varying float vHeat;
        ${instK ? 'attribute vec2 aPull;' : ''}`)
      .replace('#include <project_vertex>', `
        vec4 wp0 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp0 = instanceMatrix * wp0;
        #endif
        wp0 = modelMatrix * wp0;
        float pk = ${instK ? 'aPull.x' : kind.k.toFixed(3)};
        float pl = ${instK ? 'aPull.y' : (kind.kLean || 0).toFixed(3)};
        vec3 wpw = pullWarp(wp0.xyz, pk, pl, ${(kind.leanMax || 0).toFixed(3)}, vHeat);
        vec4 mvPosition = viewMatrix * vec4(wpw, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vHeat;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(3.2, 1.2, 0.35) * vHeat * vHeat * ${(kind.heat ?? 1).toFixed(3)} + vec3(2.5, 2.2, 1.9) * pow(vHeat, 6.0) * ${(kind.heat ?? 1).toFixed(3)};`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${key}|pull-${kind.k}-${kind.kLean}-${kind.leanMax}-${kind.heat}-${instK}`;
  return mat;
}

// ---- falls ----
const HZ = 240;
// r0: start distance, k: release (g), lam: angular momentum as a share of a circular orbit's at release,
// vt: terminal speed in still air at 1 g (0 = no drag), rEat: where it is gone
export function makeFall(r0, k, { lam = 0.25, vt = 0, rEat = 0.06, tMax = 30, tr: trSet = null } = {}) {
  const tr = trSet ?? vWhen(r0, k);
  let r = r0, u = 0, th = 0;
  let ell = lam * Math.sqrt(gmAt(tr) * r0);
  const cd = vt > 0 ? GEE / (vt * vt) : 0;
  const R = [r], T = [0];
  let t = tr, next = tr + 1 / HZ;
  const acc = (tt, rr, uu, ll) => -gmAt(tt) / (rr * rr) + (ll * ll) / (rr * rr * rr) - cd * uu * Math.abs(uu);
  while (r > rEat && t < tr + tMax) {
    const dt = Math.min(1 / 1200, 0.01 * r / Math.max(Math.abs(u), 1e-3), next - t + 1e-9);
    // RK4 on (r, u); the swirl's angle and its bleed by Euler (smooth enough at this step)
    const k1r = u, k1u = acc(t, r, u, ell);
    const k2r = u + 0.5 * dt * k1u, k2u = acc(t + dt / 2, Math.max(r + 0.5 * dt * k1r, 1e-4), k2r, ell);
    const k3r = u + 0.5 * dt * k2u, k3u = acc(t + dt / 2, Math.max(r + 0.5 * dt * k2r, 1e-4), k3r, ell);
    const k4r = u + dt * k3u, k4u = acc(t + dt, Math.max(r + dt * k3r, 1e-4), k4r, ell);
    r = Math.max(r + dt / 6 * (k1r + 2 * k2r + 2 * k3r + k4r), 1e-4);
    u = u + dt / 6 * (k1u + 2 * k2u + 2 * k3u + k4u);
    th += Math.min(ell / (r * r), 60) * dt;
    ell *= Math.exp(-dt * 2.2);
    t += dt;
    if (t >= next - 1e-9) { R.push(r); T.push(th); next += 1 / HZ; }
  }
  return { tr, R: Float32Array.from(R), T: Float32Array.from(T), tEnd: tr + (R.length - 1) / HZ, r0 };
}
// where a fall is at video time v: { r, th, gone, u (speed m/s), age }
export function fallAt(F, v) {
  if (v <= F.tr) return { r: F.r0, th: 0, gone: false, age: v - F.tr, sp: 0 };
  const x = (v - F.tr) * HZ;
  const i = Math.floor(x);
  if (i >= F.R.length - 1) return { r: 0, th: F.T[F.T.length - 1], gone: true, age: v - F.tr, sp: 0 };
  const w = x - i;
  const r = F.R[i] + (F.R[i + 1] - F.R[i]) * w;
  return { r, th: F.T[i] + (F.T[i + 1] - F.T[i]) * w, gone: false, age: v - F.tr, sp: Math.abs(F.R[i + 1] - F.R[i]) * HZ };
}
// position on the spiral: from the home direction n0 toward the side direction t0 by th
const tmp = new THREE.Vector3();
export function frame(p0) {
  const n0 = new THREE.Vector3().subVectors(p0, B);
  const r0 = Math.max(n0.length(), 1e-3);
  n0.divideScalar(r0);
  const t0 = new THREE.Vector3(-n0.z, 0, n0.x);
  if (t0.lengthSq() < 1e-6) t0.set(1, 0, 0);
  t0.normalize();
  return { n0, t0, r0 };
}
export function spiralPos(fr, r, th, out) {
  const c = Math.cos(th), s = Math.sin(th);
  out.copy(fr.n0).multiplyScalar(c * r).addScaledVector(fr.t0, s * r).add(B);
  return out;
}
export const aAt = (v, p) => { tmp.subVectors(p, B); const d = Math.max(tmp.length(), 1e-3); return gmAt(v) / (d * d) / GEE; };
