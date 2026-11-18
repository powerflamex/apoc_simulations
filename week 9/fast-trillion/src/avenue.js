// The avenue's layout, in WORLD metres: you run down x = 0 toward -z, so the distance you've run is s = -z.
// Cross-section (x): your bike lane x in [-1, 1]; the curb at x = 1 and the right sidewalk to the building line at
// x = 6.5 (people within a few metres of you); three lanes your way (centres -2.65, -5.95, -9.25), a 3 m median,
// three lanes the other way, the far sidewalk and its building line at x = -29.3. Cross streets every 120 m. The
// avenue runs 10 km, to a plaza and a sea wall at s = 10,000 m (the sea beyond).
// Everything here is generated from hashes of an integer index, so any stretch of the 10 km can be built on demand
// (the ring buffers in city.js / people.js / traffic.js), and the blast table every shader reads is built once here.
import * as THREE from 'three';
import { tPass, speedAt, CITY_END } from './timeline.js';

export const CURB_R = 1.0, BLD_R = 6.5;                 // right curb, right building line
export const LANES = [-2.65, -5.95, -9.25];              // your direction (driving toward -z)
export const LANES_ON = [-15.55, -18.85, -22.15];        // oncoming (toward +z)
export const MEDIAN = [-13.9, -10.9];
export const CURB_L = -23.8, BLD_L = -29.3;
export const XST = 120, XST0 = 35, XST_W = 20, XST_ROAD = 12;   // cross streets: every 120 m from s = 35, 20 m between buildings
export const LAMP_X = 1.3, LAMP_DZ = 30;
export const PLAZA = CITY_END - 220;                     // the last buildings end here; then a plaza to the sea wall
export const SEA_Y = -0.7;                               // the sea's surface (the street is at 0)

// deterministic hash of integers -> [0, 1)
export function hh(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// the cross street nearest s (its centre)
export const xstreetAt = (s) => XST0 + Math.round((s - XST0) / XST) * XST;
export const inXstreet = (s, pad = 0) => Math.abs(s - xstreetAt(s)) < XST_W / 2 + pad;

// ---- building lots: block k runs from xstreet(k) + 10 to xstreet(k+1) - 10 (100 m), cut into 2-5 lots ----
// a lot: { s0, s1, side (+1 right, -1 left), h, d (depth), kind (1 glass curtain, 2 brick, 3 stone grid), col, seed, colW }
const PAL = [[0.62, 0.6, 0.56], [0.7, 0.66, 0.58], [0.52, 0.42, 0.36], [0.6, 0.38, 0.3], [0.44, 0.46, 0.5], [0.76, 0.72, 0.64], [0.36, 0.38, 0.42], [0.58, 0.52, 0.44]];
export function blockLots(k, side) {
  const a = XST0 + k * XST + XST_W / 2, b = XST0 + (k + 1) * XST - XST_W / 2;
  if (b > PLAZA) return [];
  const out = [];
  let s = a, j = 0;
  while (s < b - 4) {
    const r = hh(k, side * 7 + 3, j);
    let w = 14 + 24 * r;
    if (b - (s + w) < 12) w = b - s;
    const seed = (k * 37 + j * 11 + (side > 0 ? 0 : 5000)) & 0xffff;
    const tall = hh(k, side, j + 91);
    const near = side > 0;
    let h = 18 + 70 * Math.pow(hh(k, side, j + 7), 1.6) + (tall > 0.86 ? 90 + 80 * hh(k, j, 5) : 0);
    // the first blocks at frame 0: a lively mid-rise street wall on your side, towers further on
    if (k <= 0 && near) h = Math.min(h, 40 + 20 * r);
    const kind = tall > 0.86 ? 1 : 1 + Math.floor(hh(k, side, j + 13) * 3);
    const col = kind === 1 ? [0.36 + 0.1 * r, 0.44 + 0.1 * r, 0.5 + 0.08 * r] : PAL[Math.floor(hh(k, side, j + 17) * PAL.length)];
    out.push({ s0: s + 0.3, s1: s + w - 0.3, side, h, d: 20 + 20 * hh(k, side, j + 29), kind, col, seed, colW: kind === 2 ? 2.6 + 0.5 * r : kind === 1 ? 3.0 : 3.3 + 0.6 * r });
    s += w;
    j++;
  }
  return out;
}
// the second row: taller towers behind the street wall (the skyline)
export function backLots(k, side) {
  const a = XST0 + k * XST + XST_W / 2;
  if (a > PLAZA - 60) return [];
  const out = [];
  for (let j = 0; j < 2; j++) {
    if (hh(k, side + 11, j) < 0.35) continue;
    const w = 25 + 20 * hh(k, side + 12, j);
    const s0 = a + 8 + j * 48;
    out.push({ s0, s1: s0 + w, side, h: 60 + 160 * Math.pow(hh(k, side + 13, j), 1.3), d: 30, kind: hh(k, side, j + 77) < 0.6 ? 1 : 3,
      col: [0.4 + 0.15 * hh(k, j, 1), 0.45 + 0.12 * hh(k, j, 2), 0.52 + 0.1 * hh(k, j, 3)], seed: (k * 53 + j * 19 + 9000 + side * 400) & 0xffff, colW: 3.2, back: 1 });
  }
  return out;
}

// ---- the blast table every shader reads: for each metre of the path (s from -2000 to 14,000), when you passed it
//      and how fast you were going (RG float texture, 4096 x 4) ----
export const BT_S0 = -2000, BT_W = 4096, BT_H = 4;
export function makeBlastTexture() {
  const n = BT_W * BT_H, data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = BT_S0 + i + 0.5;
    const tp = tPass(s);
    data[i * 4] = tp;
    data[i * 4 + 1] = speedAt(tp);
  }
  const t = new THREE.DataTexture(data, BT_W, BT_H, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
// GLSL: the same blast model as timeline.js (blastPa), read from the table. uBT, uT (video time), uShift (s you've run,
// to turn render-space z into world z) must be declared by the including shader.
export const BLAST_GLSL = /* glsl */ `
  vec2 btAt(float s) {
    float i = clamp(floor(s - (${BT_S0.toFixed(1)})), 0.0, ${(BT_W * BT_H - 1).toFixed(1)});
    return texture2D(uBT, vec2((mod(i, ${BT_W.toFixed(1)}) + 0.5) / ${BT_W.toFixed(1)}, (floor(i / ${BT_W.toFixed(1)}) + 0.5) / ${BT_H.toFixed(1)})).rg;
  }
  float blastPaV(float vel, float r) {
    float x = vel * 0.0020358 / max(r, 0.2);
    return 101325.0 * (0.25 * pow(x, 0.75) + 0.6 * x * x) * smoothstep(0.93, 1.02, vel / 343.0);
  }
  // the overpressure that has reached render-space point P by now (0 before it arrives), and how long ago it did
  vec2 blastHere(vec3 P) {
    float s = uShift - P.z;
    vec2 b = btAt(s);
    float r = length(vec2(P.x, P.y - 1.0));
    float age = uT - (b.x + r / 343.0);
    return age >= 0.0 ? vec2(blastPaV(b.y, r), age) : vec2(0.0, age);
  }
`;
