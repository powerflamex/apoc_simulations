// The buildings, shop signs and awnings. One facade shader draws every wall (window grids that mirror the sky, glass
// towers, brick blocks, shop fronts at street level) and breaks it as your scream grows: a window shatters (a dark
// hole with a jagged rim of glass left) once the sound's peak pressure at it passes its own breaking point (0.12-0.6
// psi; shop plate glass 0.09-0.22), walls crack from ~3 psi. Buildings near you (layout CHUNK_R) are cut into chunks
// (floors x window bays x depth slices) drawn with the same shader, so their walls keep their windows; at ~5 psi a
// chunk is blown away from you (5 psi: most buildings collapse), and the chunks it held up fall. All of it is a pure function of video time.
import * as THREE from 'three';
import { BLD, SIGNS, AWNINGS, MOUTH, FX } from './layout.js';
import { logMult, timeOfPressure, peakPa, P_BLOW, PSI } from './timeline.js';
import { CAM } from './layout.js';
import { rng, smooth, clamp } from './util.js';

export const CU = {
  uTime: { value: 0 }, uL: { value: 0 }, uMouth: { value: new THREE.Vector3(MOUTH.x, MOUTH.y, MOUTH.z) },
  uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 2500 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
  uDust: { value: 0 },
};
// the window hash: exact in 32-bit floats, so JS (glass.js) and the GPU agree on which window breaks when
export const fr32 = Math.fround;
export function winHash(k) { const x = fr32(fr32(k) * fr32(0.61803398)); return x - Math.floor(x); }
export const winKey = (ix, iy, seed, face) => ix * 7 + iy * 131 + seed * 17 + face * 5;
export const paneKey = (bid, seed, face) => bid * 11 + seed * 17 + face * 5 + 3;
export const WIN_THR = (h) => (0.12 + 0.48 * h) * PSI;
export const PANE_THR = (h) => (0.09 + 0.13 * h) * PSI;
export const floorSpec = (kind) => (kind === 2 ? { FH: 3.7, g0: 5.0 } : { FH: 3.5, g0: 5.6 });

const PARS = /* glsl */ `
uniform float uTime; uniform float uL; uniform vec3 uMouth; uniform float uDust;
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD; uniform vec3 uSunCol;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
varying vec3 vRW; varying float vExt;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gh(float k){ return fract(k * 0.61803398); }
float gn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
float pkAt(vec3 P) { return 2.874 * pow(10.0, uL * 0.5) / max(distance(P, uMouth), 0.3); }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += uSunCol * 1.6 * pow(max(dot(normalize(r), uSun), 0.0), 90.0) * step(0.0, uSun.y + 0.02);
  return mix(c, vec3(0.16, 0.15, 0.15), smoothstep(0.0, -0.15, r.y));
}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  if (vExt < 0.5) {
    // a broken face inside a building: raw concrete and brick, dusty
    float n = gn2(vRW.xy * 2.3 + vRW.z * 1.7) * 0.6 + gn2(vRW.zy * 7.0) * 0.4;
    diffuseColor.rgb = mix(vec3(0.36, 0.33, 0.3), vCol * 0.7, 0.35) * (0.6 + 0.6 * n);
  } else {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x + 0.5);
    float H = vS.w;
    vec3 base = vCol;
    vec3 V = normalize(vWP - cameraPosition);
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = (vLoc.y + 0.5) * vSc.y;
    vec3 tang = sx ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    float face = floor(vON.x + 0.5) * 2.0 + floor(vON.z + 0.5) + 3.0;
    float FH = kind > 1.5 && kind < 2.5 ? 3.7 : 3.5;
    float g0 = kind > 1.5 && kind < 2.5 ? 5.0 : 5.6;
    float colW = vS.z;
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 1.5);
    float pk = pkAt(vRW);
    // this window: its centre's peak pressure against its own breaking point
    vec3 cc = vRW - tang * (f.x - 0.5) * colW - vec3(0.0, (f.y - 0.5) * FH, 0.0);
    float wh = gh(id.x * 7.0 + id.y * 131.0 + seed * 17.0 + face * 5.0);
    float brk = step((0.12 + 0.48 * wh) * 6894.76, pkAt(cc));
    // (seen from far off, the share of windows broken)
    float brkFar = clamp((pk / 6894.76 - 0.12) / 0.48, 0.0, 1.0);
    brk = mix(brk, brkFar, far);
    // the jagged rim of glass left in a broken frame
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float rimN = gn2(vec2(u, y) * 9.0 + seed);
    float rim = step(edge, 0.12 + 0.12 * rimN) * (1.0 - far);
    vec3 N = normalize(vWN);
    vec3 refl = skyRefl(reflect(V, N));
    float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
    vec3 col = base; float win = 0.0;
    vec3 room = vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * h21(id * 2.1 + seed));
    vec3 hole = vec3(0.035, 0.032, 0.03) * (0.6 + 0.8 * h21(id * 3.7 + seed));
    float gl = 1.0 - brk * (1.0 - rim);          // glass still in this pixel
    if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
      win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
      vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
      glass = mix(hole, glass, gl);
      col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
      totalEmissiveRadiance += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9 * gl;
    } else if (kind > 1.5 && kind < 2.5) {
      win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
      edge = min(min(f.x - 0.3, 0.7 - f.x) * 2.5, min(f.y - 0.2, 0.8 - f.y) * 1.67);
      rim = step(edge, 0.12 + 0.12 * rimN) * (1.0 - far); gl = 1.0 - brk * (1.0 - rim);
      vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
      glass = mix(hole, glass, gl);
      col = mix(base, glass, win * (1.0 - far));
      col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
      float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
      col = mix(col, base * 1.12, course * (1.0 - far));
      col = mix(col, base * 0.9, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
      totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far) * gl;
    } else {
      win = rect(f, vec2(0.16, 0.22), vec2(0.84, 0.86), fw) * ok;
      edge = min(min(f.x - 0.16, 0.84 - f.x) * 1.47, min(f.y - 0.22, 0.86 - f.y) * 1.56);
      rim = step(edge, 0.12 + 0.12 * rimN) * (1.0 - far); gl = 1.0 - brk * (1.0 - rim);
      vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
      glass = mix(hole, glass, gl);
      col = mix(base, glass, win * (1.0 - far));
      col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.55);
      col = mix(col, base * 0.88, step(f.y, 0.2) * ok * (1.0 - far));
      totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far) * gl;
    }
    // street level: shop fronts (big plate glass, goods inside, a coloured fascia band)
    if (y < g0 && kind < 2.5) {
      float nb = max(1.0, floor(W / 5.5));
      float bw = W / nb;
      float bay = fract(u / bw);
      float bid = floor(u / bw);
      float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
      vec3 inside = mix(vec3(0.6, 0.48, 0.36), vec3(0.42, 0.47, 0.52), step(0.55, h21(vec2(bid, seed)))) * (0.5 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
      float goods = step(0.5, fract(y * 1.6)) * step(0.1, fract(bay * 9.0));
      inside = mix(inside, inside * vec3(1.3, 0.9, 0.7) * (0.6 + 0.8 * h21(vec2(floor(bay * 9.0), bid))), goods * 0.6);
      vec3 pc = vRW - tang * (bay - 0.5) * bw - vec3(0.0, y - (g0 - 1.4) * 0.5, 0.0);
      float ph = gh(bid * 11.0 + seed * 17.0 + face * 5.0 + 3.0);
      float pb = step((0.09 + 0.13 * ph) * 6894.76, pkAt(pc));
      float pe = min(min(bay - 0.06, 0.94 - bay) * bw, min(y - 0.3, g0 - 1.7 - y));
      float prim = step(pe, 0.12 + 0.2 * gn2(vec2(u, y) * 5.0 + seed));
      float pgl = 1.0 - pb * (1.0 - prim);
      vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
      shopGlass = mix(inside * 0.32 * (1.0 - 0.5 * pb), shopGlass, pgl);
      col = mix(base * 0.75, shopGlass, pane);
      float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
      vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.4);
      col = mix(col, bc, band * step(0.4, h21(vec2(bid + 7.0, seed))));
      totalEmissiveRadiance += pane * inside * 0.3 * (1.0 - pb * 0.8);
      totalEmissiveRadiance += refl * 0.25 * fres * pane * pgl;
      win = max(win, pane);
    }
    // cracks in the walls past ~3 psi, spreading as the pressure grows; dust over everything once it blows
    float cr = smoothstep(0.6, 1.6, pk / (3.0 * 6894.76 * (0.75 + 0.5 * h21(vec2(seed, 4.0)))));
    if (cr > 0.0) {
      vec2 q = vec2(u, y) * 0.32 + seed * 3.1;
      float n = gn2(q) + 0.5 * gn2(q * 2.3 + 5.0) + 0.25 * gn2(q * 5.1);
      float line = 1.0 - smoothstep(0.0, 0.03 + 0.03 * cr, abs(n - 0.85));
      float reach = step(gn2(q * 0.35 + 9.0), cr);
      col = mix(col, vec3(0.05, 0.045, 0.04), line * reach * (1.0 - win * 0.7) * (1.0 - far * 0.6));
    }
    col = mix(col, vec3(0.5, 0.47, 0.43) * (0.8 + 0.3 * gn2(vec2(u, y) * 0.7)), uDust * smoothstep(0.5, 2.0, pk / (3.0 * 6894.76)) * 0.5);
    diffuseColor.rgb = col;
    if (abs(vON.y) > 0.5) diffuseColor.rgb = base * 0.5 + 0.04 * h21(floor(vWP.xz * 0.5));
  }
`;

function facadeMaterial(chunk) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    const head = chunk
      ? 'attribute vec4 aS; attribute vec3 aCol; attribute vec3 aDim; attribute vec3 aRC; attribute vec3 aRS; attribute vec3 aBO;'
      : 'attribute vec4 aS; attribute vec3 aCol;';
    const body = chunk
      ? `vec3 rl = aRC + position * aRS;
         vLoc = rl / aDim - vec3(0.0, 0.5, 0.0); vSc = aDim; vRW = aBO + rl;
         vec3 an = abs(normal);
         vExt = an.x > 0.5 ? step(aDim.x * 0.5 - 0.05, abs(rl.x)) : an.z > 0.5 ? step(aDim.z * 0.5 - 0.05, abs(rl.z)) : step(aDim.y - 0.05, rl.y);`
      : `vLoc = position - vec3(0.0, 0.5, 0.0);
         vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
         vRW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz; vExt = 1.0;`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${head}
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
        varying vec3 vRW; varying float vExt;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vON = normal; vS = aS; vCol = aCol;
        ${body}
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wpp.xyz; }
        { mat3 im = mat3(instanceMatrix); vec3 sc2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
          vWN = normalize(mat3(modelMatrix) * (im * (normal / sc2))); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vWP - cameraPosition) / uHazeD));`);
  };
  m.customProgramCacheKey = () => (chunk ? 'scream-facade-chunk-v1' : 'scream-facade-v1');
  return m;
}
// a plain material with the same distance haze
export function hazed(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uHaze = CU.uHaze; shader.uniforms.uHazeD = CU.uHazeD;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 hw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          hw = instanceMatrix * hw;
          #endif
          vHW = (modelMatrix * hw).xyz; }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW; uniform vec3 uHaze; uniform float uHazeD;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vHW - cameraPosition) / uHazeD));`);
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => `hazed-${key}`;
  return m;
}

// ---- painted shop signs: 8, 1024 x 128 each (2 columns x 4 rows in a 2048 x 512 atlas) ----
const SHOPS = [['COFFEE', '#4a2a1a', '#f6e8d0'], ['PHARMACY', '#1a6a3a', '#ffffff'], ['DELI', '#b03020', '#ffffff'], ['BOOKS', '#2a3a6a', '#f0e0b0'],
  ['GROCERY', '#2a7a3a', '#ffffff'], ['PIZZA', '#d8c030', '#201010'], ['SHOES', '#7a1a4a', '#ffffff'], ['PHONES', '#1a2a4a', '#e8d080']];
function makeSignAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 512;
  const g = cv.getContext('2d');
  SHOPS.forEach(([word, bg, fg], i) => {
    const x0 = (i % 2) * 1024, y0 = Math.floor(i / 2) * 128;
    g.fillStyle = bg; g.fillRect(x0 + 4, y0 + 4, 1016, 120);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x0 + 14, y0 + 14, 996, 100);
    g.font = '900 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg; g.fillText(word, x0 + 512, y0 + 66);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---- the chunks of the buildings near you ----
const G = 9.81;
// when a wall of strength thr at r m gives way: when the peak pressure reaches it, or sooner if the pressure holds
// above 60% of it for a while (the steady blast batters it: its strength sinks toward 60% over ~5 s)
function failTime(thr, r) {
  const t1 = timeOfPressure(thr, r), t60 = timeOfPressure(0.6 * thr, r);
  if (!Number.isFinite(t60)) return t1;
  for (let v = t60; v < Math.min(t1, 48); v += 0.05) if (peakPa(logMult(v), r) >= thr * (0.6 + 0.4 * Math.exp(-(v - t60) / 5))) return v;
  return t1;
}
export const CHUNKS = [];
export const DUST = [];        // [t, x, y, z, size] puffs where chunks break away
{
  const R = rng(4711);
  const cuts = (len, cw, per) => {
    const n = Math.max(1, Math.round(len / cw)), step = len / n, out = [-len / 2];
    for (let k = per; k < n; k += per) out.push(-len / 2 + k * step);
    out.push(len / 2);
    return out;
  };
  BLD.forEach((b, bi) => {
    b.i = bi;
    if (!b.chunk) return;
    const { FH, g0 } = floorSpec(b.kind);
    const ys = [0, g0];
    for (let y = g0; y + FH < b.h - 1.2; ) { y += FH; ys.push(y); }
    ys.push(b.h);
    const xs = cuts(b.w, b.colW, b.w > 24 ? 3 : 2), zs = cuts(b.d, b.colW, b.d > 24 ? 3 : 2);
    const bf = 0.8 + 0.4 * R();
    const col = {};
    for (let iy = 0; iy < ys.length - 1; iy++) for (let ix = 0; ix < xs.length - 1; ix++) for (let iz = 0; iz < zs.length - 1; iz++) {
      const rc = [(xs[ix] + xs[ix + 1]) / 2, (ys[iy] + ys[iy + 1]) / 2, (zs[iz] + zs[iz + 1]) / 2];
      const rs = [xs[ix + 1] - xs[ix], ys[iy + 1] - ys[iy], zs[iz + 1] - zs[iz]];
      const wx = b.x + rc[0], wy = rc[1], wz = b.z + rc[2];
      const r = Math.hypot(wx - MOUTH.x, wy - MOUTH.y, wz - MOUTH.z);
      const thr = P_BLOW * bf * (0.65 + 0.8 * R()) * (b.kind === 1 ? 0.8 : 1);
      const c = { b: bi, rc, rs, w: [wx, wy, wz], r, thr, tB: failTime(thr, r), below: col[`${ix},${iz}`], rnd: R(), rnd2: R(), rnd3: R() };
      col[`${ix},${iz}`] = c;
      CHUNKS.push(c);
    }
  });
  // when each chunk leaves: blown (tB) or dropped because the one under it went (tS); lowest first
  for (const c of CHUNKS) {
    c.tS = c.below ? c.below.dep + 0.12 + 0.1 * c.rnd3 : Infinity;
    c.dep = Math.min(c.tB, c.tS);
    c.hs = Math.min(...c.rs) * 0.45;
    // dropped chunks pile up on the ones under them that dropped and stayed (rubble, not a building sinking away)
    const b = c.below;
    c.pile = b && b.tS < b.tB - 1.5 ? (b.pile || 0) + b.hs * 0.7 : 0;
  }
  // the building beside you: its street wall, above the shops, doesn't blow in like the rest. Its ground floor is
  // knocked in away from you, so the floors above lose their footing and come down OUTWARD, onto the sidewalk and the
  // street right in front of you and the camera (0:21, at 100 billion x). (Not the bit straight over you.)
  for (const c of CHUNKS) {
    const b = BLD[c.b];
    if (!(b.x > 0 && Math.abs(b.x - b.w / 2 - FX) < 0.6 && b.z - b.d / 2 < 8 && b.z + b.d / 2 > -16)) continue;
    // (only the part ahead of you, never the bit over you or beside/behind the camera, whose path is up and back)
    if (c.rc[0] - c.rs[0] / 2 > -b.w / 2 + 0.1 || c.w[1] < 5.5 || c.w[2] > -3.2 || c.w[2] < -18 || c.rs[0] > 6.5) continue;
    c.peel = true;
    c.dep = c.tB = 20.95 + 0.07 * (c.w[1] / 3.5) + 0.25 * c.rnd3 + 0.03 * Math.abs(c.w[2]);
    c.tS = Infinity;
  }
  for (const c of CHUNKS) {
    if (!Number.isFinite(c.dep)) continue;
    const Lk = Number.isFinite(c.tB) ? logMult(c.tB) : 0;
    if (c.peel) {
      // (toppling outward off the wall and down onto the sidewalk along its foot, on the right of the picture)
      c.kick = [-(0.8 + 1.4 * c.rnd), 0.3 + 0.8 * c.rnd2, (c.rnd3 - 0.5) * 0.8];
      c.axis = new THREE.Vector3(0, (c.rnd3 - 0.5) * 0.2, 1).normalize(); c.spin = 0.55 + 0.25 * c.rnd2;
      c.hs = Math.min(...c.rs) * 0.45;
      DUST.push([c.dep + 1.6, 11 - 6 * c.rnd, 2, c.w[2], 5]);
      continue;
    }
    // the kick: straight away from you, faster the more power there is when it goes
    let dx = c.w[0] - MOUTH.x, dz = c.w[2] - MOUTH.z;
    // (anything level with the camera or behind it goes into the block instead, never past the lens)
    if (c.w[2] > CAM.z - 9 && c.w[0] > 0) { dx = 1; dz = 0.25; }
    const dh = Math.hypot(dx, dz) || 1;
    const V = 3 + 7 * c.rnd + 4 * Math.max(0, Lk - 10);
    c.kick = [dx / dh * V, 1 + 4 * c.rnd2, dz / dh * V];
    // tumbling: about a horizontal axis across the push, a little wobble
    const ax = new THREE.Vector3(-dz / dh, (c.rnd3 - 0.5) * 0.6, dx / dh).normalize();
    c.axis = ax; c.spin = (0.6 + 2.2 * c.rnd2) * (c.rnd < 0.5 ? 1 : -1) * (5 / Math.max(3, Math.max(...c.rs)));
    // dust where it breaks away (one puff for every few chunks)
    if (c.rnd3 < 0.15) DUST.push([c.dep, c.w[0], c.w[1], c.w[2], Math.max(...c.rs) * 0.8]);
  }
  console.log(`city: ${CHUNKS.length} chunks, ${CHUNKS.filter((c) => Number.isFinite(c.dep)).length} break away, ${DUST.length} dust puffs`);
}
// the towers down the street that topple (the whole box, about its base edge away from you), from ~2 psi held: a
// steady push ~5x the strongest wind they're built for (timeline.js). Each one's strength is its own (1.95-2.3 psi),
// so they go one after another, outward, as the power climbs.
export const TOWERS = [];
{
  const R = rng(1717);
  for (const b of BLD) {
    if (b.chunk || b.h < 34 || b.z > -100) continue;
    const dx = b.x - MOUTH.x, dz = b.z - MOUTH.z, dh = Math.hypot(dx, dz);
    if (dh > 230 || Math.abs(b.x) > 90) continue;
    const r = Math.hypot(dh, b.h * 0.4 - MOUTH.y);
    const thr = PSI * (1.95 + 0.35 * R());
    const t = timeOfPressure(thr, r);
    if (!(t < 44.4)) continue;
    // tip away from you, slewing toward the middle of the street (a tower falls the way it's weakest: across its
    // narrow side), so from your end of the street you see it go over instead of only shrinking away
    const T = 1.15 * Math.sqrt(2 * b.h / 9.81);
    TOWERS.push({ b, t, r, T, dx: dx / dh, dz: dz / dh });
  }
  // (their strengths, all within 1.7-2.8 psi, are picked so the falls come one every ~2.3 s from 0:30, nearest first)
  TOWERS.sort((a, b) => a.r - b.r);
  TOWERS.forEach((T, k) => {
    const tk = 30.4 + 2.3 * k, thr = peakPa(logMult(tk), T.r);
    if (thr > 1.7 * PSI && thr < 2.8 * PSI && tk < 41.5) T.t = tk;
    T.thr = thr;
  });
  TOWERS.sort((a, b) => a.t - b.t);
  // every other one, from the second, falls back toward you: the blast knocks its lower floors out away from you and
  // the top comes down the other way, across the street toward your end of it
  TOWERS.forEach((T, k) => {
    const b = T.b, back = k % 2 === 1;
    let ux = (back ? -T.dx : T.dx) - 0.75 * Math.sign(b.x), uz = back ? -T.dz : T.dz;
    const l = Math.hypot(ux, uz); ux /= l; uz /= l;
    const ext = Math.abs(ux) * b.w / 2 + Math.abs(uz) * b.d / 2;
    Object.assign(T, { back, ux, uz, px: b.x + ux * ext, pz: b.z + uz * ext, axis: new THREE.Vector3(uz, 0, -ux) });
  });
  console.log(`city: ${TOWERS.length} towers fall at ${TOWERS.map((t) => t.t.toFixed(1)).join(' ')}`);
}
export function towerAngle(T, v) { const t = v - T.t; return t <= 0 ? 0 : t >= T.T ? Math.PI / 2 * 0.985 : Math.PI / 2 * 0.985 * Math.pow(t / T.T, 2.2); }
// where chunk c is at time v: { x, y, z } and its rotation angle about c.axis
function chunkAt(c, v, out) {
  out.ang = 0;
  if (!(v > c.dep)) { out.x = c.w[0]; out.y = c.w[1]; out.z = c.w[2]; return false; }
  let px = c.w[0], py = c.w[1], pz = c.w[2], vy = 0, t0 = c.dep;
  let vx = 0, vz = 0;
  // dropped first: free fall until the kick or the ground
  const floor = c.hs + (c.pile || 0);
  if (c.tS < c.tB) {
    const tl = c.tS + Math.sqrt(2 * Math.max(py - floor, 0) / G);
    const tk = Math.min(c.tB, tl);
    const t = Math.min(v, tk) - c.tS;
    py = c.w[1] - 0.5 * G * t * t; vy = -G * t;
    if (v <= tk) { out.x = px; out.y = py; out.z = pz; return true; }
    if (tk === tl) {
      // landed on the pile: it lies there until (if ever) the blast throws it
      py = floor; vy = 0;
      if (!(v > c.tB)) { out.x = px; out.y = py; out.z = pz; return true; }
    }
    t0 = c.tB;
  }
  // the kick, then ballistic to the ground, then a slide to a stop
  vx = c.kick[0]; vz = c.kick[2]; vy += c.kick[1];
  const tl = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(py - c.hs, 0))) / G;
  const t = v - t0;
  if (t < tl) {
    out.x = px + vx * t; out.y = py + vy * t - 0.5 * G * t * t; out.z = pz + vz * t; out.ang = c.spin * t;
    return true;
  }
  const vh = Math.hypot(vx, vz), D = 7, ts = vh / D, s = Math.min(t - tl, ts);
  const d = vh * s - 0.5 * D * s * s;
  out.x = px + vx * tl + (vh > 0 ? vx / vh * d : 0); out.y = c.hs; out.z = pz + vz * tl + (vh > 0 ? vz / vh * d : 0);
  out.ang = c.spin * tl;
  return true;
}

export function makeCity(scene, ctx) {
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  // ---- the whole buildings (far ones) ----
  const WHOLE = BLD.filter((b) => !b.chunk);
  let wholeMesh = null;
  const tq = new THREE.Quaternion(), tP = new THREE.Matrix4(), tR = new THREE.Matrix4(), tB = new THREE.Matrix4();
  {
    const geo = new THREE.BoxGeometry(1, 1, 1, 1, 24, 1).translate(0, 0.5, 0);
    const n = WHOLE.length;
    const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
    const mesh = new THREE.InstancedMesh(geo, facadeMaterial(false), n);
    WHOLE.forEach((b, i) => {
      b.wi = i;
      m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, m4);
      aS.set([b.i, b.kind, b.colW, b.h], i * 4);
      col.set(b.col).convertSRGBToLinear();
      aCol.set([col.r, col.g, col.b], i * 3);
    });
    geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = true;
    scene.add(mesh);
    wholeMesh = mesh;
  }
  // ---- the chunks ----
  const n = CHUNKS.length;
  const cgeo = new THREE.BoxGeometry(1, 1, 1);
  const A = (k) => new Float32Array(n * k);
  const aS = A(4), aCol = A(3), aDim = A(3), aRC = A(3), aRS = A(3), aBO = A(3);
  const cmesh = new THREE.InstancedMesh(cgeo, facadeMaterial(true), n);
  CHUNKS.forEach((c, i) => {
    const b = BLD[c.b];
    aS.set([b.i, b.kind, b.colW, b.h], i * 4);
    col.set(b.col).convertSRGBToLinear();
    aCol.set([col.r, col.g, col.b], i * 3);
    aDim.set([b.w, b.h, b.d], i * 3);
    aRC.set(c.rc, i * 3); aRS.set(c.rs, i * 3); aBO.set([b.x, 0, b.z], i * 3);
    cmesh.setMatrixAt(i, m4.makeScale(c.rs[0], c.rs[1], c.rs[2]).setPosition(c.w[0], c.w[1], c.w[2]));
  });
  for (const [k, a, s] of [['aS', aS, 4], ['aCol', aCol, 3], ['aDim', aDim, 3], ['aRC', aRC, 3], ['aRS', aRS, 3], ['aBO', aBO, 3]]) cgeo.setAttribute(k, new THREE.InstancedBufferAttribute(a, s));
  cmesh.frustumCulled = false; cmesh.receiveShadow = true; cmesh.castShadow = true;
  scene.add(cmesh);
  const moved = new Uint8Array(n);

  // the chunk a point (just inside a facade) belongs to
  const chunkOf = (x, y, z) => CHUNKS.findIndex((c) => Math.abs(x - c.w[0]) <= c.rs[0] / 2 && Math.abs(y - c.w[1]) <= c.rs[1] / 2 && Math.abs(z - c.w[2]) <= c.rs[2] / 2);

  // ---- shop signs ----
  const signTex = makeSignAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.22, side: THREE.DoubleSide });
  const signGeo = new THREE.BoxGeometry(1, 1, 0.08);
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  const aCell = new Float32Array(SIGNS.length);
  const ATT = [];   // { mesh, i, rest matrix, chunk }
  SIGNS.forEach((s, i) => {
    const rest = new THREE.Matrix4().makeRotationY(s.yaw).scale(sc.set(s.w, s.h, 1)).setPosition(s.x - s.side * 0.05, s.y, s.z);
    signs.setMatrixAt(i, rest);
    aCell[i] = s.cell;
    ATT.push({ mesh: signs, i, rest, chunk: chunkOf(s.x + s.side * 0.4, s.y, s.z) });
  });
  signGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 1));
  signMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((mod(aCell, 2.0) + uv.x) / 2.0, 1.0 - (floor(aCell / 2.0) + 1.0 - uv.y) / 4.0);
        vEmissiveMapUv = vMapUv;`);
  };
  signMat.customProgramCacheKey = () => 'scream-sign-v1';
  signs.frustumCulled = false; signs.castShadow = true;
  scene.add(signs);

  // ---- awnings: a sloping striped canvas over a shop door ----
  const awGeo = new THREE.BoxGeometry(1, 0.05, 1).translate(0, 0, 0.5);
  const awMat = ctx.plainMat(0xffffff, 0.85);
  awMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vAP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vAP;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(1.0, 0.0, 0.0) * mix(vec3(1.0), vec3(1.6), step(0.5, fract(vAP.x * 6.0)));');
  };
  const awnings = new THREE.InstancedMesh(awGeo, awMat, AWNINGS.length);
  AWNINGS.forEach((a, i) => {
    // hinged at the wall at 3.3 m, reaching 1.4 m out over the sidewalk, sloping down
    const rest = new THREE.Matrix4().makeRotationY(a.side > 0 ? -Math.PI / 2 : Math.PI / 2)
      .premultiply(new THREE.Matrix4().makeTranslation(a.x, 3.3, a.z))
      .multiply(new THREE.Matrix4().makeRotationX(0.42)).multiply(new THREE.Matrix4().makeScale(a.w, 1, a.out ?? 1.5));
    awnings.setMatrixAt(i, rest);
    awnings.setColorAt(i, col.set(a.col));
    ATT.push({ mesh: awnings, i, rest, chunk: chunkOf(a.x + a.side * 0.4, 3.3, a.z) });
    a.rest = rest;
  });
  awnings.frustumCulled = false; awnings.castShadow = true;
  scene.add(awnings);

  const st = {}, rot = new THREE.Quaternion(), mrel = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  let lastV = -1e9;
  return {
    signMat,
    frame(v, s) {
      // the toppling towers
      for (const T of TOWERS) {
        const a = towerAngle(T, v), b = T.b;
        tB.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
        if (a > 0) {
          tq.setFromAxisAngle(T.axis, a);
          tR.makeRotationFromQuaternion(tq);
          tB.premultiply(tP.makeTranslation(-T.px, 0, -T.pz)).premultiply(tR).premultiply(tP.makeTranslation(T.px, 0, T.pz));
        }
        wholeMesh.setMatrixAt(b.wi, tB);
      }
      wholeMesh.instanceMatrix.needsUpdate = true;
      // the chunks: only those that have moved (or moved last frame) need a new matrix
      const back = v < lastV;
      lastV = v;
      for (let i = 0; i < n; i++) {
        const c = CHUNKS[i];
        if (!(v > c.dep) && !moved[i] && !back) continue;
        const mv = chunkAt(c, v, st);
        if (c.axis) rot.setFromAxisAngle(c.axis, st.ang); else rot.identity();
        cmesh.setMatrixAt(i, m4.compose(p.set(st.x, st.y, st.z), rot, sc.set(c.rs[0], c.rs[1], c.rs[2])));
        moved[i] = mv ? 1 : 0;
        c.cur = c.cur || {};
        c.cur.x = st.x; c.cur.y = st.y; c.cur.z = st.z; c.cur.ang = st.ang; c.cur.mv = mv;
      }
      cmesh.instanceMatrix.needsUpdate = true;
      // signs and awnings ride on their chunk
      for (const a of ATT) {
        if (a.chunk < 0) continue;
        const c = CHUNKS[a.chunk];
        if (!(v > c.dep)) { a.mesh.setMatrixAt(a.i, a.rest); continue; }
        chunkAt(c, v, st);
        rot.setFromAxisAngle(c.axis, st.ang);
        mrel.makeRotationFromQuaternion(rot).setPosition(st.x, st.y, st.z).multiply(tmp.makeTranslation(-c.w[0], -c.w[1], -c.w[2]));
        a.mesh.setMatrixAt(a.i, m4.multiplyMatrices(mrel, a.rest));
      }
      signs.instanceMatrix.needsUpdate = true; awnings.instanceMatrix.needsUpdate = true;
    },
  };
}
export { chunkAt };
