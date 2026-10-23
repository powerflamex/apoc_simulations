// The techniques' marks on the city, shared by every material that has to show them (buildings, street, trench):
//   two Hollow Purples: swept spheres (a capsule from the start point to where the sphere is now, radius r);
//   everything inside is erased, the surfaces just outside glow violet for a few seconds.
// JS mirrors (capsuleDist) decide when cars, lamps, people and signs are erased.
import * as THREE from 'three';
import { PURPLES, purpleAt } from './timeline.js';

export const CU = {
  uPA0: { value: new THREE.Vector3() }, uPAd: { value: new THREE.Vector3(0, 0, -1) }, uPAs: { value: 0 }, uPAr: { value: 0 }, uPAg: { value: 0 },
  uPB0: { value: new THREE.Vector3() }, uPBd: { value: new THREE.Vector3(0, 0, -1) }, uPBs: { value: 0 }, uPBr: { value: 0 }, uPBg: { value: 0 },
  uTime: { value: 0 },
};
{
  const [a, b] = PURPLES;
  CU.uPA0.value.set(a.p0.x, a.p0.y, a.p0.z); CU.uPAd.value.set(a.d.x, a.d.y, a.d.z);
  CU.uPB0.value.set(b.p0.x, b.p0.y, b.p0.z); CU.uPBd.value.set(b.d.x, b.d.y, b.d.z);
}
export function updateCuts(v) {
  CU.uTime.value = v;
  const [a, b] = PURPLES;
  const A = purpleAt(a, v), Bq = purpleAt(b, v);
  CU.uPAs.value = A.s; CU.uPAr.value = v > a.form0 + 0.8 ? A.r : 0;
  CU.uPBs.value = Bq.s; CU.uPBr.value = v > b.form0 + 0.8 ? Bq.r : 0;
  // the fresh edges glow, then cool over ~5 s after the sphere has gone by
  CU.uPAg.value = v < a.form0 + 0.8 ? 0 : 1 - 0.85 * Math.min(1, Math.max(0, v - a.end) / 5);
  CU.uPBg.value = v < b.form0 + 0.8 ? 0 : 1 - 0.85 * Math.min(1, Math.max(0, v - b.end) / 5);
}
// distance from p to the swept capsule (negative inside)
export function capsuleDist(p, P, v) {
  const q = purpleAt(P, v);
  if (v < P.form0 + 0.8) return 1e9;
  const dx = p.x - P.p0.x, dy = p.y - P.p0.y, dz = p.z - P.p0.z;
  const t = Math.min(Math.max(dx * P.d.x + dy * P.d.y + dz * P.d.z, 0), q.s);
  return Math.hypot(dx - P.d.x * t, dy - P.d.y * t, dz - P.d.z * t) - q.r;
}
export const erasedAt = (p, v) => capsuleDist(p, PURPLES[0], v) < 0 || capsuleDist(p, PURPLES[1], v) < 0;
// the first moment p is erased (bisection over the sphere's run), or 1e9
export function vErased(p) {
  let best = 1e9;
  for (const P of PURPLES) {
    let a = P.form0 + 0.8, b = P.end + 0.05;
    if (capsuleDist(p, P, b) >= 0) continue;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (capsuleDist(p, P, m) < 0) b = m; else a = m; }
    best = Math.min(best, b);
  }
  return best;
}

export const CUT_GLSL = /* glsl */ `
uniform vec3 uPA0; uniform vec3 uPAd; uniform float uPAs; uniform float uPAr; uniform float uPAg;
uniform vec3 uPB0; uniform vec3 uPBd; uniform float uPBs; uniform float uPBr; uniform float uPBg;
float capD(vec3 p, vec3 a, vec3 d, float s, float r) {
  if (r <= 0.0) return 1e9;
  float t = clamp(dot(p - a, d), 0.0, s);
  return length(p - a - d * t) - r;
}
// < 0: erased
float purpleD(vec3 p) { return min(capD(p, uPA0, uPAd, uPAs, uPAr), capD(p, uPB0, uPBd, uPBs, uPBr)); }
// violet glow on surfaces just outside the cut
vec3 purpleGlow(vec3 p) {
  float a = capD(p, uPA0, uPAd, uPAs, uPAr), b = capD(p, uPB0, uPBd, uPBs, uPBr);
  float g = uPAg * exp(-max(a, 0.0) / 1.1) * step(a, 6.0) + uPBg * exp(-max(b, 0.0) / 1.6) * step(b, 9.0);
  return vec3(2.2, 0.7, 3.6) * g;
}
`;
