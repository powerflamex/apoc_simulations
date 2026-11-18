// The avenue: buildings (instanced boxes drawn by one facade shader), the street and sidewalks, curbs, the median,
// lamp posts, traffic lights, the plaza and sea wall at the end. Only the stretch near you exists at any moment (ring
// buffers rebuilt every frame from avenue.js's hashes), inside the world group that main.js slides past you.
// The facade shader breaks each window from the blast table (avenue.js): a window goes dark with a jagged rim of glass
// once the overpressure that has reached it passes its own breaking point (0.1-0.5 psi); from ~5 psi the wall is
// blown in (black openings, cracks, soot). At speed, the window grid is averaged along the street over the distance
// you cover in one frame (the camera moves parallel to the walls, so this is exactly the motion blur).
import * as THREE from 'three';
import { blockLots, backLots, hh, xstreetAt, XST, XST0, XST_W, XST_ROAD, CURB_R, BLD_R, CURB_L, BLD_L, MEDIAN, LAMP_X, LAMP_DZ, PLAZA, makeBlastTexture, BLAST_GLSL, LANES } from './avenue.js';
import { CITY_END, blastAt, PSI } from './timeline.js';
import { clamp, smooth } from './util.js';

export const CU = {
  uT: { value: 0 }, uShift: { value: 0 }, uDz: { value: 0 }, uBT: { value: null },
  uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color(0.1, 0.3, 0.78) }, uSkyLo: { value: new THREE.Color(0.62, 0.78, 0.95) },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 2500 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
};

const PARS = /* glsl */ `
uniform float uT; uniform float uShift; uniform float uDz; uniform sampler2D uBT;
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD; uniform vec3 uSunCol;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gh(float k){ return fract(k * 0.61803398); }
float gn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
// the share of [x0, x1] (cell units) that lies inside [a, b] of each cell: a box filter of a repeating stripe
float stripeI(float x, float a, float b) { return floor(x) * (b - a) + clamp(fract(x), a, b) - a; }
float stripeAvg(float x, float dx, float a, float b) { return dx < 1e-3 ? step(a, fract(x)) * step(fract(x), b) : (stripeI(x, a, b) - stripeI(x - dx, a, b)) / dx; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += uSunCol * 1.6 * pow(max(dot(normalize(r), uSun), 0.0), 90.0) * step(0.0, uSun.y + 0.02);
  return mix(c, vec3(0.16, 0.15, 0.15), smoothstep(0.0, -0.15, r.y));
}
${BLAST_GLSL}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x + 0.5);
    float H = vS.w;
    vec3 base = vCol;
    vec3 V = normalize(vWP - cameraPosition);
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = (vLoc.y + 0.5) * vSc.y;
    float face = floor(vON.x + 0.5) * 2.0 + floor(vON.z + 0.5) + 3.0;
    float FH = kind > 1.5 && kind < 2.5 ? 3.7 : 3.5;
    float g0 = kind > 1.5 && kind < 2.5 ? 5.0 : 5.6;
    float colW = vS.z;
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    // motion: the walls along the street slide past by uDz metres in a frame; average the columns over it
    float mdx = sx ? uDz / colW : 0.0;
    float mot = smoothstep(0.25, 1.0, mdx);
    float ok = step(0.0, g.y) * step(y, H - 1.5);
    // the blast that has reached this pixel, and at the window's centre
    vec2 bh = blastHere(vWP);
    float pk = bh.x;
    vec3 tang = sx ? vec3(0.0, 0.0, 1.0) * sign(vON.x) : vec3(1.0, 0.0, 0.0);
    vec3 cc = vWP - vec3(0.0, (f.y - 0.5) * FH, 0.0);
    float wh = gh(id.x * 7.0 + id.y * 131.0 + seed * 17.0 + face * 5.0);
    vec2 bc = blastHere(cc);
    float brk = step((0.1 + 0.4 * wh) * 6894.76, bc.x);
    float brkFar = clamp((pk / 6894.76 - 0.1) / 0.4, 0.0, 1.0);
    brk = mix(brk, brkFar, max(far, mot));
    float blown = smoothstep(4.0, 7.0, pk / 6894.76);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float rimN = gn2(vec2(u, y) * 9.0 + seed);
    float rim = step(edge, 0.12 + 0.12 * rimN) * (1.0 - far) * (1.0 - mot) * (1.0 - blown);
    vec3 N = normalize(vWN);
    vec3 refl = skyRefl(reflect(V, N));
    float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
    vec3 col = base; float win = 0.0;
    vec3 room = vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * h21(id * 2.1 + seed));
    vec3 hole = vec3(0.035, 0.032, 0.03) * (0.6 + 0.8 * h21(id * 3.7 + seed));
    float gl = 1.0 - brk * (1.0 - rim);
    vec2 wa, wb;
    if (kind < 1.5) { wa = vec2(0.04, 0.14); wb = vec2(0.96, 0.97); }
    else if (kind < 2.5) { wa = vec2(0.3, 0.2); wb = vec2(0.7, 0.8); }
    else { wa = vec2(0.16, 0.22); wb = vec2(0.84, 0.86); }
    // the window: sharp, or averaged along the street when it slides past faster than a column a frame
    float wy = smoothstep(wa.y - fw.y, wa.y + fw.y, f.y) * (1.0 - smoothstep(wb.y - fw.y, wb.y + fw.y, f.y));
    float wx = mix(smoothstep(wa.x - fw.x, wa.x + fw.x, f.x) * (1.0 - smoothstep(wb.x - fw.x, wb.x + fw.x, f.x)), stripeAvg(g.x, mdx, wa.x, wb.x), mot);
    win = wx * wy * ok;
    if (kind < 1.5) {
      vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
      glass = mix(hole, glass, gl);
      col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
      totalEmissiveRadiance += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9 * gl;
    } else {
      vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
      glass = mix(hole, glass, gl);
      col = mix(base, glass, win * (1.0 - far));
      col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
      if (kind < 2.5) {
        float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
        col = mix(col, base * 1.12, course * (1.0 - far));
      } else col = mix(col, base * 0.88, step(f.y, 0.2) * ok * (1.0 - far));
      col = mix(col, base * 0.9, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
      totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far) * gl;
    }
    // street level: shop fronts (plate glass, goods inside, a coloured fascia)
    if (y < g0 && vS.y < 3.5) {
      float nb = max(1.0, floor(W / 5.5));
      float bw = W / nb;
      float bay = fract(u / bw);
      float bid = floor(u / bw);
      float pmot = sx ? smoothstep(0.25, 1.0, uDz / bw) : 0.0;
      float paneX = mix(step(0.06, bay) * step(bay, 0.94), stripeAvg(u / bw, sx ? uDz / bw : 0.0, 0.06, 0.94), pmot);
      float pane = step(0.3, y) * step(y, g0 - 1.7) * paneX;
      vec3 inside = mix(vec3(0.6, 0.48, 0.36), vec3(0.42, 0.47, 0.52), step(0.55, h21(vec2(bid, seed)))) * (0.5 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
      inside = mix(inside, vec3(0.5, 0.45, 0.4), pmot);
      float goods = step(0.5, fract(y * 1.6)) * step(0.1, fract(bay * 9.0)) * (1.0 - pmot);
      inside = mix(inside, inside * vec3(1.3, 0.9, 0.7) * (0.6 + 0.8 * h21(vec2(floor(bay * 9.0), bid))), goods * 0.6);
      vec2 pb2 = blastHere(vWP - vec3(0.0, y - (g0 - 1.4) * 0.5, 0.0));
      float ph = gh(bid * 11.0 + seed * 17.0 + face * 5.0 + 3.0);
      float pb = mix(step((0.09 + 0.13 * ph) * 6894.76, pb2.x), clamp((pk / 6894.76 - 0.09) / 0.13, 0.0, 1.0), pmot);
      float pe = min(min(bay - 0.06, 0.94 - bay) * bw, min(y - 0.3, g0 - 1.7 - y));
      float prim = step(pe, 0.12 + 0.2 * gn2(vec2(u, y) * 5.0 + seed)) * (1.0 - pmot);
      float pgl = 1.0 - pb * (1.0 - prim);
      vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
      shopGlass = mix(inside * 0.32 * (1.0 - 0.5 * pb), shopGlass, pgl);
      col = mix(base * 0.75, shopGlass, pane);
      float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
      vec3 bcl = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.4);
      col = mix(col, mix(bcl, base * 0.8, pmot), band * step(0.4, h21(vec2(bid + 7.0, seed))));
      totalEmissiveRadiance += pane * inside * 0.3 * (1.0 - pb * 0.8);
      totalEmissiveRadiance += refl * 0.25 * fres * pane * pgl;
      win = max(win, pane);
    }
    // blown in from ~5 psi: black openings, cracks spreading, soot
    if (blown > 0.0) {
      vec2 q = vec2(u, y) * 0.32 + seed * 3.1;
      float n = gn2(q) + 0.5 * gn2(q * 2.3 + 5.0) + 0.25 * gn2(q * 5.1);
      float line = 1.0 - smoothstep(0.0, 0.05 + 0.05 * blown, abs(n - 0.85));
      col = mix(col, vec3(0.04, 0.035, 0.03), line * blown * (1.0 - far * 0.6));
      col = mix(col, hole * 0.6, win * blown);
      col = mix(col, vec3(0.16, 0.14, 0.12) * (0.7 + 0.5 * gn2(q * 0.5)), blown * 0.45);
      totalEmissiveRadiance *= 1.0 - 0.8 * blown;
    }
    diffuseColor.rgb = col;
    if (abs(vON.y) > 0.5) diffuseColor.rgb = base * 0.5 + 0.04 * h21(floor(vWP.xz * 0.5));
  }
`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vON = normal; vS = aS; vCol = aCol;
        vLoc = position - vec3(0.0, 0.5, 0.0);
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
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
  m.customProgramCacheKey = () => 'fast-facade-v1';
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

// ---- the street: one shader for the asphalt, paint, bike lane, sidewalks, cross streets, the plaza ----
const f2 = (x) => x.toFixed(2);
const GROUND = /* glsl */ `
  float gg21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float ggn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gg21(i), gg21(i + vec2(1, 0)), f.x), mix(gg21(i + vec2(0, 1)), gg21(i + vec2(1, 1)), f.x), f.y); }
  float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
  // x across, s along (s = distance from the start); aw: antialias width
  vec3 streetAt(float x, float s, float aw) {
    float xs = ${f2(XST0)} + floor((s - ${f2(XST0)}) / ${f2(XST)} + 0.5) * ${f2(XST)};
    float dz = abs(s - xs);
    bool cross = dz < ${f2(XST_ROAD / 2)};
    bool corner = dz < ${f2(XST_W / 2)};
    vec2 P = vec2(x, s);
    float n = ggn(P * 2.5) * 0.5 + ggn(P * 9.0) * 0.5;
    vec3 asph = vec3(0.17, 0.17, 0.18) * (0.85 + 0.3 * n) * (0.92 + 0.08 * ggn(P * 0.3));
    vec3 conc = vec3(0.47, 0.45, 0.43) * (0.88 + 0.2 * gg21(floor(P / 1.5))) * (0.9 + 0.15 * n);
    vec2 t = fract(P / 1.5);
    float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
    conc *= 0.84 + 0.16 * smoothstep(0.0, 0.03 + aw, joint);
    if (s > ${f2(PLAZA)}) {
      // the plaza: big pale paving all the way to the sea wall
      vec2 q = fract(P / 3.0);
      float jq = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
      return vec3(0.62, 0.58, 0.52) * (0.9 + 0.15 * gg21(floor(P / 3.0))) * (0.85 + 0.15 * smoothstep(0.0, 0.02 + aw, jq));
    }
    bool walkR = x > ${f2(CURB_R)} && !cross;
    bool walkL = x < ${f2(CURB_L)} && !cross;
    if (walkR || walkL) return conc;
    vec3 c = asph;
    float paint = 0.0;
    if (!corner) {
      // lane lines: white dashes 3 m of every 9 m; the bike lane's solid edge and its green paint
      float dash = band(fract(s / 9.0), 0.0, 0.33, aw / 9.0);
      paint = max(paint, dash * (band(x, -4.37, -4.23, aw) + band(x, -7.67, -7.53, aw) + band(x, -17.27, -17.13, aw) + band(x, -20.57, -20.43, aw)));
      paint = max(paint, band(x, -1.12, -0.97, aw));
      float bike = band(x, -0.97, ${f2(CURB_R)}, aw);
      c = mix(c, vec3(0.16, 0.34, 0.2) * (0.8 + 0.3 * n), bike * 0.85);
      // a bike symbol every 40 m
      float bs = fract(s / 40.0);
      paint = max(paint, bike * band(bs, 0.5, 0.52, aw / 40.0) * band(abs(x), 0.0, 0.5, aw));
    } else {
      // crosswalks across the avenue: bars along the traffic, 0.6 m wide, 1.2 m apart
      float cw = band(dz, ${f2(XST_ROAD / 2 - 3.5)}, ${f2(XST_ROAD / 2 - 0.3)}, aw);
      paint = max(paint, cw * band(fract(x / 1.2), 0.0, 0.5, aw / 1.2));
      // the stop bars
      paint = max(paint, band(dz, ${f2(XST_ROAD / 2 + 1.0)}, ${f2(XST_ROAD / 2 + 1.5)}, aw) * step(x, -1.0) * step(-23.8, x));
    }
    c = mix(c, vec3(0.86, 0.86, 0.82) * (0.75 + 0.25 * ggn(P * 1.7)), paint * 0.92);
    return c;
  }
`;
function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uT; uniform float uShift; uniform float uDz; uniform sampler2D uBT; uniform vec3 uHaze; uniform float uHazeD;
        ${BLAST_GLSL}
        ${GROUND}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float sW = uShift - vGW.z;
        if (sW > ${f2(CITY_END)}) discard;
        float aw = max(fwidth(vGW.x), fwidth(vGW.z)) * 0.7;
        vec3 c = vec3(0.0);
        // the motion blur along the street: average over the distance covered in one frame
        int K = int(clamp(uDz / 1.5, 1.0, 8.0));
        float jit = gg21(gl_FragCoord.xy + fract(uT * 7.13));
        for (int k = 0; k < 8; k++) {
          if (k >= K) break;
          c += streetAt(vGW.x, sW + (float(k) + jit) / float(K) * uDz, aw + uDz / float(K) * 0.5);
        }
        c /= float(K);
        // dust and scorch where the blast was strong
        vec2 bh = blastHere(vec3(vGW.x, 0.0, vGW.z));
        c = mix(c, vec3(0.23, 0.21, 0.18) * (0.75 + 0.4 * ggn(vGW.xz * 0.8)), smoothstep(1.0, 8.0, bh.x / 6894.76) * 0.5);
        diffuseColor.rgb = c;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'fast-ground-v1';
  return mat;
}

const MAXB = 900;
export function makeCity(world, ctx) {
  CU.uBT.value = makeBlastTexture();
  const fac = facadeMaterial();
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 4), 4);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 3), 3);
  geo.setAttribute('aS', aS); geo.setAttribute('aCol', aCol);
  const blds = new THREE.InstancedMesh(geo, fac, MAXB);
  blds.castShadow = true; blds.receiveShadow = true; blds.frustumCulled = false;
  world.add(blds);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 7000).rotateX(-Math.PI / 2), groundMaterial());
  ground.receiveShadow = true; ground.frustumCulled = false;
  world.add(ground);

  // curbs, the median, one box per block side; lamp posts; traffic lights; the sea wall
  const plain = ctx.plainMat;
  const curbGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const curbs = new THREE.InstancedMesh(curbGeo, plain(0x8e8a84, 0.8), 400);
  curbs.receiveShadow = true; curbs.castShadow = true; curbs.frustumCulled = false; world.add(curbs);
  const median = new THREE.InstancedMesh(curbGeo, plain(0x55603e, 0.95), 120);
  median.receiveShadow = true; median.castShadow = true; median.frustumCulled = false; world.add(median);
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 7.5, 8).translate(0, 3.75, 0);
  const armGeo = new THREE.BoxGeometry(1.6, 0.08, 0.1).translate(-0.8, 7.4, 0);
  const headGeo = new THREE.BoxGeometry(0.55, 0.14, 0.3).translate(-1.55, 7.33, 0);
  const metal = plain(0x3a3f44, 0.55, { metalness: 0.5 });
  const lampN = 300;
  const lampParts = [poleGeo, armGeo, headGeo].map((g) => { const m = new THREE.InstancedMesh(g, metal, lampN); m.castShadow = true; m.frustumCulled = false; world.add(m); return m; });
  const tlGeo = [new THREE.CylinderGeometry(0.09, 0.11, 5.5, 8).translate(0, 2.75, 0), new THREE.BoxGeometry(0.35, 1.0, 0.35).translate(0, 5.0, 0)];
  const tlMat = plain(0x2b2f2a, 0.6);
  const tls = tlGeo.map((g) => { const m = new THREE.InstancedMesh(g, tlMat, 120); m.castShadow = true; m.frustumCulled = false; world.add(m); return m; });
  const tlLamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), ctx.glowMat(new THREE.Color(0.2, 2.5, 0.6)), 120);
  tlLamp.frustumCulled = false; world.add(tlLamp);
  // the sea wall: a stone ledge and a railing across the end of the plaza
  const wall = new THREE.Mesh(new THREE.BoxGeometry(400, 1.4, 2).translate(0, -0.6, 0), plain(0x7d766c, 0.9));
  wall.position.set(-11, 0, -CITY_END - 1); wall.receiveShadow = true; world.add(wall);
  const rails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 6).translate(0, 0.52, 0), metal, 260);
  { const m4 = new THREE.Matrix4(); for (let i = 0; i < 260; i++) rails.setMatrixAt(i, m4.makeTranslation(-140 + i * 1.5, 0, -CITY_END + 0.3)); }
  rails.frustumCulled = false; world.add(rails);
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(390, 0.06, 0.08), metal);
  topRail.position.set(-11, 1.05, -CITY_END + 0.3); world.add(topRail);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // how far a pole is bent over by the blast (0 upright .. 1 flat), from the overpressure at its middle
  const bend = (s, x, v) => {
    const b = blastAt(s, Math.hypot(x, 3));
    if (v < b.t) return 0;
    const psi = b.pa / PSI;
    if (psi < 3) return 0;
    const full = clamp((psi - 3) / 6, 0, 1) * 1.45;
    return full * smooth(0, 0.35, v - b.t);
  };

  return {
    blds,
    frame(v, s, dz, visible) {
      CU.uT.value = v; CU.uShift.value = s; CU.uDz.value = dz;
      for (const o of [blds, ground, curbs, median, ...lampParts, ...tls, tlLamp, wall, rails, topRail]) o.visible = visible;
      if (!visible) return;
      // the buildings from 1.8 km behind you to 3.5 km ahead (and the city's last blocks when you're out at sea)
      const sa = Math.min(s - 1800, CITY_END - 3500), sb = Math.min(s + 3500, CITY_END);
      const k0 = Math.floor((sa - XST0) / XST) - 1, k1 = Math.floor((sb - XST0) / XST) + 1;
      let n = 0;
      for (let k = k0; k <= k1 && n < MAXB; k++) for (const side of [1, -1]) {
        for (const L of [...blockLots(k, side), ...backLots(k, side)]) {
          if (n >= MAXB) break;
          const len = L.s1 - L.s0;
          const x0 = side > 0 ? BLD_R + (L.back ? 40 : 0) : BLD_L - (L.back ? 40 : 0);
          const cx = x0 + side * L.d / 2;
          m4.makeScale(L.d, L.h, len).setPosition(cx, 0, -(L.s0 + len / 2));
          blds.setMatrixAt(n, m4);
          aS.setXYZW(n, L.seed, L.kind, L.colW, L.h);
          aCol.setXYZ(n, ...L.col);
          n++;
        }
      }
      blds.count = n;
      blds.instanceMatrix.needsUpdate = true; aS.needsUpdate = true; aCol.needsUpdate = true;
      ground.position.set(-11, 0, -(Math.min(s, CITY_END) + 1000));
      // curbs and median per block (open at the cross streets)
      let nc = 0, nm = 0;
      const kc0 = Math.floor((Math.max(sa, -400) - XST0) / XST) - 1;
      for (let k = kc0; k <= k1; k++) {
        const a = XST0 + k * XST + XST_W / 2, b = Math.min(XST0 + (k + 1) * XST - XST_W / 2, PLAZA);
        if (b <= a) continue;
        for (const [x, w] of [[CURB_R, 0.25], [CURB_L - 0.25, 0.25]]) {
          curbs.setMatrixAt(nc++, m4.makeScale(w, 0.15, b - a).setPosition(x + w / 2, 0, -(a + b) / 2));
        }
        median.setMatrixAt(nm++, m4.makeScale(MEDIAN[1] - MEDIAN[0], 0.2, b - a - 4).setPosition((MEDIAN[0] + MEDIAN[1]) / 2, 0, -(a + b) / 2));
      }
      curbs.count = nc; median.count = nm;
      curbs.instanceMatrix.needsUpdate = true; median.instanceMatrix.needsUpdate = true;
      // lamp posts along your curb, bent away from you by the blast
      let nl = 0;
      for (let j = Math.floor(Math.max(sa, -400) / LAMP_DZ); j * LAMP_DZ < Math.min(sb, PLAZA) && nl < lampN; j++) {
        const ls = j * LAMP_DZ + 7;
        if (Math.abs(ls - xstreetAt(ls)) < XST_W / 2 + 1) continue;
        const bnd = bend(ls, LAMP_X, v);
        q.setFromEuler(e.set(0, 0, -bnd * (0.9 + 0.2 * hh(j, 4))));
        m4.compose(p.set(LAMP_X, 0, -ls), q, sc.set(1, 1, 1));
        for (const L of lampParts) L.setMatrixAt(nl, m4);
        nl++;
      }
      for (const L of lampParts) { L.count = nl; L.instanceMatrix.needsUpdate = true; }
      // traffic lights at the near corners of each cross street (your side and the median)
      let nt = 0;
      for (let k = kc0; k <= k1 && nt < 118; k++) {
        const xs = XST0 + k * XST;
        if (xs > PLAZA) break;
        for (const x of [CURB_R + 0.5, MEDIAN[1] - 0.4]) {
          const bnd = bend(xs + XST_ROAD / 2 + 2, x, v);
          q.setFromEuler(e.set(0, 0, -bnd * Math.sign(x + 0.01)));
          m4.compose(p.set(x, 0, -(xs + XST_ROAD / 2 + 2)), q, sc.set(1, 1, 1));
          tls[0].setMatrixAt(nt, m4); tls[1].setMatrixAt(nt, m4);
          const lit = bnd < 0.2;
          const m5 = m4.clone().multiply(new THREE.Matrix4().makeTranslation(0, 4.75, -0.2));
          tlLamp.setMatrixAt(nt, lit ? m5 : zero);
          nt++;
        }
      }
      for (const L of [...tls, tlLamp]) { L.count = nt; L.instanceMatrix.needsUpdate = true; }
    },
  };
}
