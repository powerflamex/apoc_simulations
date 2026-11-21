// The place: the plaza and street on the south side of the harbor (with craters that open under your feet and cracks
// that run out from them), the harbor water, the quay wall, the city blocks round the plaza, the downtown towers along
// the waterfront, and the far shore. The mountain itself (it gets lifted) is in mountain.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { QUAY_Z, SEA_Y, FAR_Z, STREET, WALK_W, BLD_W, TOWER, JET, MTN } from './layout.js';
import { rng } from './util.js';

const NOISE = /* glsl */ `
float gh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
float gfbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * gn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7; a *= 0.5; } return s; }
`;
export const NCR = 16;
// shared uniforms: craters (x, z, radius, depth) and their cracks (reach, strength, seed, rubble)
export const GU = {
  uCr: { value: Array.from({ length: NCR }, () => new THREE.Vector4(0, 0, 0.001, 0)) },
  uCk: { value: Array.from({ length: NCR }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uHaze: { value: new THREE.Color(0.7, 0.78, 0.88) }, uHazeD: { value: 2500 },
  uTime: { value: 0 },
  // the mountain's foot: (your x, how far the crack along it has run each way (m), the ground left where it stood 0..1)
  uMR: { value: new THREE.Vector4(0, 0, 0, 0) },
};
// the crater depth at (x, z) (the same formula as the shader), for placing you and the rubble
export function craterH(x, z) {
  let h = 0;
  for (const c of GU.uCr.value) {
    const r = Math.hypot(x - c.x, z - c.y), R = c.z;
    if (r < R) { const u = r / R; h -= c.w * (1 - u * u) * (1 - u * u); }
    else h += c.w * 0.12 * Math.exp(-Math.pow((r - R) / (0.3 * R), 2));
  }
  return h;
}
const CRATER_GLSL = /* glsl */ `
uniform vec4 uCr[${NCR}]; uniform vec4 uCk[${NCR}];
// height and gradient of the ground at p (xz) from the craters
vec3 craterHG(vec2 p) {
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < ${NCR}; i++) {
    vec4 c = uCr[i];
    if (c.w <= 0.0) continue;
    vec2 d = p - c.xy; float r = max(length(d), 1e-4); float R = c.z;
    if (r < R) { float u = r / R; h -= c.w * (1.0 - u * u) * (1.0 - u * u); g += (4.0 * c.w * u * (1.0 - u * u) / R) * d / r; }
    else { float k = (r - R) / (0.3 * R); float e = exp(-k * k); h += c.w * 0.12 * e; g += (c.w * 0.12 * e * (-2.0 * k) / (0.3 * R)) * d / r; }
  }
  return vec3(h, g);
}
`;
// cracks running out from each crater: jagged radial lines and broken rings; returns 0..1 (1 = in a crack) and rubble
const CRACK_GLSL = /* glsl */ `
vec2 cracksAt(vec2 p, float px) {
  float k = 0.0, rub = 0.0;
  for (int i = 0; i < ${NCR}; i++) {
    vec4 c = uCr[i]; vec4 q = uCk[i];
    if (q.y <= 0.0) continue;
    vec2 d = p - c.xy; float r = length(d);
    float reach = q.x;
    if (r > reach * 1.05) continue;
    float a = atan(d.y, d.x);
    // radial cracks: N sectors, each with one line wandering around the sector's middle
    float N = 11.0;
    float sec = floor((a + 3.14159) / 6.28318 * N);
    float s0 = (sec + 0.5) / N * 6.28318 - 3.14159;
    float sd = gh(vec2(sec, q.z));
    float len = reach * (0.45 + 0.55 * gh(vec2(sec + 7.0, q.z)));
    float wob = (gfbm(vec2(r * 0.18 + sec * 3.1, q.z)) - 0.5) * 0.7 + (gn(vec2(r * 1.3, sec + q.z)) - 0.5) * 0.18;
    float aa = s0 + (sd - 0.5) * 0.35 + wob * min(1.0, 6.0 / (r + 1.0));
    float dist = abs(mod(a - aa + 3.14159, 6.28318) - 3.14159) * r;
    float w = (0.05 + 0.04 * c.z) * q.y * (1.0 - smoothstep(0.0, len, r)) + px * 0.6;
    float line = 1.0 - smoothstep(w * 0.5, w, dist);
    line *= step(c.z * 0.6, r);
    // a branch off each crack
    float ab = aa + (gh(vec2(sec, q.z + 3.0)) - 0.5) * 0.9;
    float rb0 = len * 0.4;
    float db = abs(mod(a - ab + 3.14159, 6.28318) - 3.14159) * r;
    float lb = (1.0 - smoothstep(w * 0.3, w * 0.7, db)) * step(rb0, r) * (1.0 - smoothstep(rb0, len * 0.85, r));
    // broken rings at ~1.3 and ~2 crater radii
    float ring = 0.0;
    for (int j = 0; j < 2; j++) {
      float rr = c.z * (1.3 + 0.8 * float(j)) * (1.0 + 0.12 * (gn(vec2(a * 3.0, q.z + float(j))) - 0.5));
      float on = step(0.45, gn(vec2(a * 2.2 + float(j) * 5.0, q.z)));
      ring += (1.0 - smoothstep(w * 0.4, w * 0.9, abs(r - rr))) * on * step(rr, reach);
    }
    k = max(k, max(max(line, lb * 0.8), ring * 0.8));
    // rubble and dust inside and just outside the rim
    rub = max(rub, q.w * (1.0 - smoothstep(c.z * 0.85, c.z * 1.45, r)));
  }
  return vec2(clamp(k, 0.0, 1.0), rub);
}
`;

// a lit material whose fragments fade into the distance haze
export function hazed(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uHaze = GU.uHaze; sh.uniforms.uHazeD = GU.uHazeD;
    if (!sh.vertexShader.includes('varying vec3 vHW;')) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          { vec4 hw = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
            hw = instanceMatrix * hw;
            #endif
            vHW = (modelMatrix * hw).xyz; }`);
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW; uniform vec3 uHaze; uniform float uHazeD;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        { float hd = length(vHW - cameraPosition); gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, (1.0 - exp(-hd / uHazeD)) * 0.85); }`);
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  m.customProgramCacheKey = () => key() + '-hazed';
  return m;
}

// ---- facades: one box per building (instanced), windows and floors drawn in the shader from the box's size ----
// aBox: (width, height, depth, floor height); aCol: wall colour; aWin: (window tint r g b, kind: 0 punched windows,
// 1 glass curtain wall, 2 shop + flats)
export const FACADE_GLSL = /* glsl */ `
float fh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 facade(vec3 P, vec3 N, vec4 box, vec3 wall, vec4 win, float seed, out float glass) {
  glass = 0.0;
  if (abs(N.y) > 0.5) return wall * 0.8;                         // roof
  float u = abs(N.x) > 0.5 ? P.z : P.x;                          // along the face (m)
  float y = P.y;                                                 // up from the ground (m)
  float fl = box.w;
  float kind = win.w;
  float bay = kind > 0.5 && kind < 1.5 ? 1.5 : 2.6;
  float fy = fract(y / fl), fx = fract(u / bay);
  vec2 cell = vec2(floor(u / bay), floor(y / fl));
  float lit = fh(cell + seed * 17.0);
  vec3 c = wall;
  if (kind < 0.5) {                      // punched windows in a wall
    float w = step(0.22, fx) * step(fx, 0.78) * step(0.28, fy) * step(fy, 0.82);
    vec3 g = win.rgb * (0.55 + 0.6 * lit);
    c = mix(wall, g, w); glass = w;
    c *= 1.0 - 0.18 * (1.0 - step(0.06, fy));          // floor lines
  } else if (kind < 1.5) {               // glass curtain wall: panes, thin mullions, a slab edge every floor
    float mull = 1.0 - step(0.05, fx) * step(fx, 0.95);
    float slab = 1.0 - step(0.1, fy);
    vec3 g = win.rgb * (0.75 + 0.45 * lit) + vec3(0.04) * fy;
    c = mix(g, wall, max(mull, slab)); glass = 1.0 - max(mull, slab);
  } else if (kind > 2.5) {               // a cruise ship's cabins: continuous balcony bands, white rails, thin dividers
    float fx3 = fract(u / 3.1);
    float band = step(0.3, fy) * step(fy, 0.88);
    float rail = step(0.3, fy) * step(fy, 0.44);
    float dv = 1.0 - step(0.035, fx3) * step(fx3, 0.965);
    vec3 g = win.rgb * (0.65 + 0.5 * lit);
    c = mix(wall, g, band);
    c = mix(c, wall * 0.88, rail * 0.8);
    c = mix(c, wall, dv * band);
    glass = band * (1.0 - rail) * (1.0 - dv);
  } else {                               // shops at street level, flats above
    if (y < 4.2) {
      float w = step(0.08, fract(u / 5.0)) * step(fract(u / 5.0), 0.92) * step(0.25, y) * step(y, 3.4);
      vec3 g = win.rgb * 0.5 + vec3(0.25, 0.22, 0.18) * lit;
      c = mix(wall * 0.7, g, w); glass = w;
      c = mix(c, vec3(0.75, 0.2, 0.15) * (0.6 + 0.6 * fh(vec2(floor(u / 5.0), seed))), step(3.5, y) * step(y, 4.1));   // awnings / signs
    } else {
      float w = step(0.25, fx) * step(fx, 0.75) * step(0.3, fy) * step(fy, 0.85);
      c = mix(wall, win.rgb * (0.55 + 0.6 * lit), w); glass = w;
      c = mix(c, wall * 0.7, step(0.86, fy) * step(fy, 0.92) * step(0.2, fx) * step(fx, 0.8));   // balconies
    }
  }
  // the top floor's parapet and the base
  c *= 1.0 - 0.25 * step(box.y - 0.8, y);
  return c;
}
`;
export function facadeMat() {
  const m = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 }));
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aBox; attribute vec3 aCol; attribute vec4 aWin; attribute float aSeed;
      varying vec3 vFP; varying vec3 vFN; varying vec4 vBox; varying vec3 vCol; varying vec4 vWin; varying float vSeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vFP = vec3((position.x + 0.5) * aBox.x, position.y * aBox.y, (position.z + 0.5) * aBox.z);
      vFN = normal; vBox = aBox; vCol = aCol; vWin = aWin; vSeed = aSeed;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vFP; varying vec3 vFN; varying vec4 vBox; varying vec3 vCol; varying vec4 vWin; varying float vSeed;
      ${FACADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float glz; diffuseColor.rgb = facade(vFP, normalize(vFN), vBox, vCol, vWin, vSeed, glz);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.12, glz);`);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '-facade';
  return m;
}
// a set of buildings: list of { x, z, w, d, h, yaw, wall, win, kind, fl }
export function makeBlocks(scene, list) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const n = list.length;
  const aBox = new Float32Array(n * 4), aCol = new Float32Array(n * 3), aWin = new Float32Array(n * 4), aSeed = new Float32Array(n);
  const mesh = new THREE.InstancedMesh(geo, facadeMat(), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  list.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, b.y || 0, b.z), q.setFromEuler(e.set(0, b.yaw || 0, 0)), new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
    aBox.set([b.w, b.h, b.d, b.fl || 3.2], i * 4);
    c.set(b.wall); aCol.set([c.r, c.g, c.b], i * 3);
    c.set(b.win); aWin.set([c.r, c.g, c.b, b.kind || 0], i * 4);
    aSeed[i] = i * 0.37 + 0.1;
  });
  geo.setAttribute('aBox', new THREE.InstancedBufferAttribute(aBox, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  geo.setAttribute('aWin', new THREE.InstancedBufferAttribute(aWin, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function makeWorld(scene, ctx) {
  const R = rng(5150);
  // ---------- the near ground: plaza, street, sidewalks, the jet's apron; craters and cracks ----------
  const gMat = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }));
  {
    const prev = gMat.onBeforeCompile;
    gMat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      Object.assign(sh.uniforms, { uCr: GU.uCr, uCk: GU.uCk, uTime: GU.uTime });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${NOISE}\n${CRATER_GLSL}\nvarying vec3 vGW; varying float vCrD;`)
        .replace('#include <beginnormal_vertex>', `
          vec3 chg = craterHG(position.xz);
          vec3 objectNormal = normalize(vec3(-chg.y, 1.0, -chg.z));
          vCrD = -chg.x;`)
        .replace('#include <begin_vertex>', `vec3 transformed = position; transformed.y += chg.x; vGW = transformed;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}\nuniform vec4 uCr[${NCR}]; uniform vec4 uCk[${NCR}]; uniform float uTime;\n${CRACK_GLSL}\nvarying vec3 vGW; varying float vCrD;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vGW.xz;
          float px = length(fwidth(p));
          float n1 = gn(p * 0.35), n2 = gn(p * 3.1);
          vec3 c;
          float sx0 = ${STREET.x0.toFixed(2)}, sx1 = ${STREET.x1.toFixed(2)};
          if (p.x > sx0 && p.x < sx1 && p.y > ${QUAY_Z.toFixed(1)} + 3.0) {
            // asphalt, lane lines (dashed white, a double yellow in the middle), a crosswalk at the plaza's south end
            c = vec3(0.16, 0.16, 0.17) * (0.85 + 0.25 * n1 + 0.1 * n2);
            float lx = p.x - sx0;
            float dash = step(0.5, fract(p.y / 9.0));
            float aw = 0.07 + px;
            float ln = (1.0 - step(aw, abs(lx - 3.5))) * dash + (1.0 - step(aw, abs(lx - 10.5))) * dash;
            float yel = (1.0 - step(aw, abs(lx - 6.85))) + (1.0 - step(aw, abs(lx - 7.15)));
            c = mix(c, vec3(0.85, 0.85, 0.82), ln * 0.85);
            c = mix(c, vec3(0.85, 0.66, 0.12), clamp(yel, 0.0, 1.0) * 0.9);
            float cw = step(8.0, p.y) * step(p.y, 12.0) * step(0.5, fract(lx / 1.2));
            c = mix(c, vec3(0.86, 0.86, 0.84), cw * 0.9);
          } else if (p.x <= sx0 && p.x > ${WALK_W.x0.toFixed(2)}) {
            c = vec3(0.52, 0.5, 0.48) * (0.9 + 0.15 * n1) * (0.9 + 0.1 * step(0.04, fract(p.y / 1.5)));
          } else if (p.x > 18.0 && p.x < 102.0 && p.y < -18.0 && p.y > ${QUAY_Z.toFixed(1)} + 2.0) {
            // the jet's apron: concrete slabs, a yellow taxi line
            vec2 sl = fract(p / 5.0);
            c = vec3(0.5, 0.5, 0.49) * (0.9 + 0.12 * gh(floor(p / 5.0)) + 0.08 * n2);
            c *= 1.0 - 0.25 * (1.0 - step(0.012, min(min(sl.x, 1.0 - sl.x), min(sl.y, 1.0 - sl.y))));
            float tl = 1.0 - step(0.12 + px, abs(p.y - ${JET.z.toFixed(1)}));
            c = mix(c, vec3(0.9, 0.7, 0.1), tl * step(p.x, 95.0));
          } else {
            // plaza: warm stone pavers 0.8 m, a darker band every 12 m, the granite edge along the quay
            vec2 tp = p / 0.8;
            vec2 tf = fract(tp);
            float jt = 1.0 - step(0.035 + px * 0.6, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
            c = vec3(0.6, 0.55, 0.49) * (0.88 + 0.16 * gh(floor(tp)) + 0.08 * n1);
            float band = step(fract(p.y / 12.0), 0.1);
            c = mix(c, vec3(0.52, 0.48, 0.45), band * 0.8);
            c *= 1.0 - 0.22 * jt;
            float edge = step(p.y, ${QUAY_Z.toFixed(1)} + 1.6);
            c = mix(c, vec3(0.6, 0.6, 0.58) * (0.9 + 0.1 * n2), edge);
            c = mix(c, vec3(0.9, 0.75, 0.15), edge * step(${QUAY_Z.toFixed(1)} + 1.3, p.y) * step(p.y, ${QUAY_Z.toFixed(1)} + 1.45));
            // the curb along the street
            c = mix(c, vec3(0.7, 0.7, 0.68), (1.0 - step(0.25, abs(p.x - sx1 - 0.15))) * step(${QUAY_Z.toFixed(1)}, p.y));
          }
          // the crater: crushed ground, darker the deeper; rubble and cracks
          vec2 ck = cracksAt(p, px);
          float deep = clamp(vCrD / 1.2, 0.0, 1.0);
          vec3 dirt = vec3(0.32, 0.27, 0.22) * (0.7 + 0.5 * gn(p * 2.3) + 0.2 * gn(p * 9.0));
          c = mix(c, dirt, clamp(deep * 1.4 + ck.y * 0.65 * smoothstep(0.35, 0.65, gn(p * 1.7)), 0.0, 0.95));
          c = mix(c, vec3(0.05, 0.045, 0.04), ck.x * 0.92);
          diffuseColor.rgb = c;
        }`);
    };
    const key = gMat.customProgramCacheKey.bind(gMat);
    gMat.customProgramCacheKey = () => key() + '-ground';
  }
  // the detailed plaza grid (0.45 m), and a coarse ring of ground round it
  const gx0 = -60, gx1 = 185, gz0 = QUAY_Z, gz1 = 45;
  const gGeo = new THREE.PlaneGeometry(gx1 - gx0, gz1 - gz0, Math.round((gx1 - gx0) / 0.45), Math.round((gz1 - gz0) / 0.45)).rotateX(-Math.PI / 2).translate((gx0 + gx1) / 2, 0, (gz0 + gz1) / 2);
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.receiveShadow = true; ground.frustumCulled = false;
  scene.add(ground);
  const outer = [
    [-3000, gx0, QUAY_Z, 3000], [gx1, 3000, QUAY_Z, 3000], [gx0, gx1, gz1, 3000],
  ].map(([a, b, c, d]) => new THREE.PlaneGeometry(b - a, d - c, 8, 8).rotateX(-Math.PI / 2).translate((a + b) / 2, 0, (c + d) / 2));
  const outerM = new THREE.Mesh(mergeGeometries(outer), gMat);
  outerM.receiveShadow = true; outerM.frustumCulled = false;
  scene.add(outerM);

  // ---------- the quay wall and its bollards; the far shore's rocks ----------
  const stone = ctx.plainMat(0x8d8a84, 0.95);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6000, 9, 2).translate(0, -4.5, QUAY_Z - 1), stone);
  wall.receiveShadow = true; scene.add(wall);
  {
    const bol = [];
    for (let x = -200; x <= 400; x += 14) bol.push(new THREE.CylinderGeometry(0.22, 0.28, 0.75, 10).translate(x, 0.37, QUAY_Z + 0.6));
    const m = new THREE.Mesh(mergeGeometries(bol), ctx.plainMat(0x2a2c30, 0.6)); m.castShadow = true; scene.add(m);
    // fenders along the wall
    const fen = [];
    for (let x = -160; x <= 160; x += 20) fen.push(new THREE.BoxGeometry(2.2, 3.2, 0.9).translate(x, -1.4, QUAY_Z - 2.4));
    scene.add(new THREE.Mesh(mergeGeometries(fen), ctx.plainMat(0x1c1c1e, 0.8)));
  }

  // ---------- the water ----------
  const WU = {
    uTime: { value: 0 }, uSky: { value: new THREE.Color(0.55, 0.7, 0.92) }, uZen: { value: new THREE.Color(0.2, 0.4, 0.8) },
    uSun: { value: new THREE.Vector3(0, 0.7, 0.7) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uHaze: GU.uHaze, uHazeD: GU.uHazeD,
    uFoam: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, 0, 0)) },   // x, z, radius, strength
    uHole: { value: new THREE.Vector4(0, 0, 0, 0) },                                     // the ship's footprint (x0, x1, z0, z1)
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: WU,
    vertexShader: /* glsl */ `varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSky; uniform vec3 uZen; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uHaze; uniform float uHazeD;
      uniform vec4 uFoam[10];
      varying vec3 vW;
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = vW.xz;
        float d = length(vW - cameraPosition);
        float px = d * 0.0012 + 0.001;
        // small waves: two drifting noise layers (no long regular sines: they read as a grid from above)
        float fade = 1.0 / (1.0 + px * 30.0);
        vec2 g1 = vec2(gn(p * 0.21 + vec2(uTime * 0.11, 0.0)) - gn(p * 0.21 + vec2(0.0, uTime * 0.09) + 5.0),
                       gn(p * 0.21 + vec2(3.0, uTime * 0.13)) - gn(p * 0.21 + vec2(uTime * 0.07, 9.0)));
        vec2 g2 = vec2(gn(p * 0.9 + vec2(uTime * 0.4, 1.0)) - 0.5, gn(p * 0.9 + vec2(2.0, -uTime * 0.35)) - 0.5);
        vec3 n = normalize(vec3((g1 * 0.22 + g2 * 0.12 * fade), 1.0).xzy);
        vec3 v = normalize(cameraPosition - vW);
        float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 refl = reflect(-v, n);
        vec3 sky = mix(uSky, uZen, pow(clamp(refl.y, 0.0, 1.0), 0.5));
        vec3 deep = vec3(0.02, 0.1, 0.13);
        vec3 c = mix(deep, sky * 0.9, fr);
        float sp = pow(max(dot(refl, uSun), 0.0), 220.0);
        c += uSunCol * sp * 6.0;
        // foam: rings and patches where things hit the water
        float f = 0.0;
        for (int i = 0; i < 10; i++) {
          vec4 F = uFoam[i]; if (F.w <= 0.0) continue;
          float r = length(p - F.xy);
          float k = 1.0 - smoothstep(F.z * 0.6, F.z, r);
          f += k * F.w * (0.5 + 0.7 * gn(p * 0.6 + float(i)));
        }
        c = mix(c, vec3(0.9, 0.93, 0.95), clamp(f, 0.0, 0.92));
        c = mix(c, uHaze, (1.0 - exp(-d / uHazeD)) * 0.85);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, FAR_Z - QUAY_Z + 4, 1, 1).rotateX(-Math.PI / 2).translate(0, SEA_Y, (FAR_Z + QUAY_Z) / 2), waterMat);
  water.frustumCulled = false;
  scene.add(water);
  // the harbor opens to the sea in the east and west: more water beyond the far shore's ends
  const seaFar = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2).translate(0, SEA_Y - 0.05, -15000 + QUAY_Z), waterMat);
  seaFar.frustumCulled = false; seaFar.renderOrder = -0.5;
  scene.add(seaFar);

  // ---------- the far shore: a beach and rocks, the land the mountain stands on (dark where it is torn up) ----------
  const farMat = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  {
    const prev = farMat.onBeforeCompile;
    farMat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      Object.assign(sh.uniforms, { uCr: GU.uCr, uCk: GU.uCk, uMR: GU.uMR });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${NOISE}\n${CRATER_GLSL}\nvarying vec3 vGW; varying float vCrD;`)
        .replace('#include <beginnormal_vertex>', `vec3 chg = craterHG(position.xz); vec3 objectNormal = normalize(vec3(-chg.y, 1.0, -chg.z)); vCrD = -chg.x;`)
        .replace('#include <begin_vertex>', `vec3 transformed = position; transformed.y += chg.x; vGW = transformed;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}\nuniform vec4 uCr[${NCR}]; uniform vec4 uCk[${NCR}]; uniform vec4 uMR;\n${CRACK_GLSL}\nvarying vec3 vGW; varying float vCrD;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vGW.xz;
          float px = length(fwidth(p));
          float shore = smoothstep(${FAR_Z.toFixed(1)} + 2.0, ${FAR_Z.toFixed(1)} - 12.0, p.y);
          vec3 sand = vec3(0.76, 0.69, 0.55) * (0.85 + 0.2 * gn(p * 0.5));
          vec3 land = mix(vec3(0.27, 0.34, 0.17), vec3(0.4, 0.38, 0.3), gn(p * 0.02)) * (0.8 + 0.3 * gfbm(p * 0.05));
          vec3 c = mix(sand, land, shore);
          vec2 ck = cracksAt(p, px);
          float deep = clamp(vCrD / 3.0, 0.0, 1.0);
          c = mix(c, vec3(0.3, 0.25, 0.2) * (0.7 + 0.5 * gn(p * 0.8)), clamp(deep * 1.5 + ck.y * 0.6, 0.0, 0.95));
          c = mix(c, vec3(0.05, 0.04, 0.035), ck.x * 0.9);
          // the mountain's footprint (its egg-shaped base; 900 = mountain.js ZP) and the line of its foot
          {
            float lz = p.y - ${MTN.z.toFixed(1)}, dx = (p.x - ${MTN.x.toFixed(1)}) / ${MTN.rx.toFixed(1)};
            float dz = lz > 900.0 ? (lz - 900.0) / ${(MTN.rz - 900).toFixed(1)} : (lz - 900.0) / ${(MTN.rz + 900).toFixed(1)};
            float q = length(vec2(dx, dz));
            // where it stood, once it's gone: torn dark earth and rock, broken into slabs
            if (uMR.z > 0.0 && q < 1.02) {
              float n = gn(p * 0.01), n2 = gn(p * 0.07), n3 = gn(p * 0.4);
              vec3 torn = mix(vec3(0.19, 0.13, 0.09), vec3(0.36, 0.3, 0.25), n * 0.6 + n2 * 0.4) * (0.7 + 0.45 * n3);
              float slab = 1.0 - smoothstep(0.0, 0.08, abs(gn(p * 0.012 + 7.0) - 0.5));
              torn *= 1.0 - 0.5 * slab;
              c = mix(c, torn, uMR.z * (1.0 - smoothstep(0.985, 1.02, q)));
            }
            // the crack racing along the foot from your hands, both ways
            float rimz = ${(MTN.z + 900).toFixed(1)} + ${(MTN.rz - 900).toFixed(1)} * sqrt(max(0.0, 1.0 - dx * dx));
            float ax = abs(p.x - uMR.x);
            if (uMR.y > 0.0 && ax < uMR.y) {
              float wob = (gfbm(vec2(p.x * 0.05, 3.0)) - 0.5) * 3.0 + (gn(vec2(p.x * 0.6, 1.0)) - 0.5) * 0.8;
              float d = abs(p.y - (rimz + 1.2 + wob));
              float w = (0.5 + 0.9 * smoothstep(0.0, 30.0, ax)) * (1.0 - smoothstep(uMR.y * 0.8, uMR.y, ax)) + px * 0.7;
              float line = 1.0 - smoothstep(w * 0.5, w, d);
              // a second, thinner crack a few metres out
              float d2 = abs(p.y - (rimz + 5.5 + wob * 1.6 + (gn(vec2(p.x * 0.11, 5.0)) - 0.5) * 4.0));
              line = max(line, (1.0 - smoothstep(w * 0.25, w * 0.5, d2)) * step(6.0, ax));
              c = mix(c, vec3(0.03, 0.025, 0.02), line * 0.95);
              c = mix(c, vec3(0.42, 0.36, 0.3), (1.0 - smoothstep(0.0, w * 4.0, d)) * 0.35);
            }
          }
          diffuseColor.rgb = c;
        }`);
    };
    const key = farMat.customProgramCacheKey.bind(farMat);
    farMat.customProgramCacheKey = () => key() + '-far';
  }
  // a fine grid where you land, coarse elsewhere; it slopes from the waterline up to the foot
  const farGeo = [];
  const fine = new THREE.PlaneGeometry(260, 120, 520, 240).rotateX(-Math.PI / 2).translate(60, 0, FAR_Z - 60);
  farGeo.push(fine);
  for (const [a, b, c, d] of [[-9000, -70, FAR_Z + 2, -12000], [190, 9000, FAR_Z + 2, -12000], [-70, 190, FAR_Z - 120, -12000]]) {
    farGeo.push(new THREE.PlaneGeometry(b - a, Math.abs(d - c), 16, 40).rotateX(-Math.PI / 2).translate((a + b) / 2, 0, (c + d) / 2));
  }
  const farG = mergeGeometries(farGeo);
  {
    const p = farG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      // the beach rises from under the water to 1.2 m at 14 m inland, then the land is level
      const t = Math.min(1, Math.max(0, (FAR_Z + 2 - z) / 16));
      p.setY(i, SEA_Y - 0.6 + (1.2 - SEA_Y + 0.6) * t * t * (3 - 2 * t) - 1.2);
    }
  }
  const far = new THREE.Mesh(farG, farMat);
  far.receiveShadow = true; far.frustumCulled = false;
  scene.add(far);

  // ---------- buildings ----------
  const blocks = [];
  // west of the street: shops with flats above, 5-10 floors, a few taller behind
  for (let z = 40; z > QUAY_Z + 8;) {
    const w = 14 + 10 * R(), h = 16 + 22 * R();
    blocks.push({ x: BLD_W - 9, z: z - w / 2, w: 18, d: w - 0.4, h, wall: [0xd8c7a8, 0xc9a98a, 0xe5ddd0, 0xb8b2a8, 0xd9b48c][Math.floor(R() * 5)], win: 0x2c3a48, kind: 2, fl: 3.1 });
    z -= w;
  }
  for (let k = 0; k < 18; k++) {
    const w = 18 + 16 * R(), h = 25 + 60 * R();
    if (30 - k * 14 < QUAY_Z + 25) { R(); R(); R(); R(); R(); continue; }   // (none out in the harbor)
    blocks.push({ x: BLD_W - 30 - 30 * R() - (k % 3) * 35, z: 30 - k * 14 + 8 * R(), w, d: 18 + 10 * R(), h, wall: [0xcfc8bd, 0xa9b4bf, 0xe0d6c4, 0x9aa3ac][Math.floor(R() * 4)], win: 0x24303c, kind: R() < 0.5 ? 0 : 1, fl: 3.3 });
  }
  // the terminal: a long low hall on the quay west of the street's end
  blocks.push({ x: -80, z: QUAY_Z + 14, w: 90, d: 22, h: 14, wall: 0xe8e6e0, win: 0x3a5a7a, kind: 1, fl: 4.5 });
  // downtown along the waterfront east of the tower, and behind it
  for (let k = 0; k < 16; k++) {
    const x = TOWER.x + 70 + k * 42 + 15 * R(), w = 26 + 18 * R(), h = 70 + 170 * R();
    blocks.push({ x, z: -60 + 40 * R() + (k % 2) * 35, w, d: 26 + 14 * R(), h, wall: [0x8fa4b8, 0x6f8296, 0xb7c3cc, 0x5d6f7f][Math.floor(R() * 4)], win: [0x34506a, 0x415f73, 0x2a3e52][Math.floor(R() * 3)], kind: 1, fl: 3.8 });
  }
  for (let k = 0; k < 20; k++) {
    const x = 40 + k * 30 + 20 * R(), w = 20 + 16 * R(), h = 30 + 90 * R();
    blocks.push({ x, z: 60 + 40 * R(), w, d: 22, h, wall: [0xcfc8bd, 0xa9b4bf, 0xe0d6c4][Math.floor(R() * 3)], win: 0x26323e, kind: R() < 0.5 ? 0 : 1, fl: 3.4 });
  }
  // the far shore: a small town of low white houses along the beach either side of where you land
  for (let k = 0; k < 70; k++) {
    let x = -900 + k * 26 + 10 * R();
    if (x > -10 && x < 150) continue;
    blocks.push({ x, z: FAR_Z - 30 - 40 * R(), y: 0, w: 9 + 8 * R(), d: 9 + 6 * R(), h: 6 + 10 * R(), wall: [0xf2efe8, 0xe8dcc8, 0xd8e0e4, 0xf0d8b8][Math.floor(R() * 4)], win: 0x2a3440, kind: 0, fl: 3 });
  }
  makeBlocks(scene, blocks);

  // ---------- street furniture: lamps, palms, the low fence round the apron, a bus shelter ----------
  {
    const dark = ctx.plainMat(0x2b2e33, 0.6);
    const parts = [];
    for (let z = 30; z > QUAY_Z + 4; z -= 22) {
      parts.push(new THREE.CylinderGeometry(0.08, 0.12, 8, 8).translate(STREET.x1 + 0.6, 4, z));
      parts.push(new THREE.BoxGeometry(1.6, 0.12, 0.3).translate(STREET.x1 + 0.0, 8, z));
      parts.push(new THREE.CylinderGeometry(0.08, 0.12, 8, 8).translate(STREET.x0 - 0.6, 4, z - 11));
    }
    // the apron fence: posts and two rails, along x = 18 and z = -18
    for (let x = 18; x < 102; x += 3) parts.push(new THREE.BoxGeometry(0.08, 1.3, 0.08).translate(x, 0.65, -18));
    parts.push(new THREE.BoxGeometry(84, 0.05, 0.05).translate(60, 1.25, -18));
    parts.push(new THREE.BoxGeometry(84, 0.05, 0.05).translate(60, 0.7, -18));
    // the bus shelter on the plaza by the stop
    parts.push(new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(-3.6, 1.25, -9.5), new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(-3.6, 1.25, -14.5),
      new THREE.BoxGeometry(1.8, 0.12, 5.4).translate(-4.3, 2.55, -12));
    const m = new THREE.Mesh(mergeGeometries(parts), dark);
    m.castShadow = true; scene.add(m);
    // palms along the plaza's quay edge and the street
    const trunk = [], leaf = [];
    const palm = (x, z, h) => {
      for (let k = 0; k < 6; k++) trunk.push(new THREE.CylinderGeometry(0.2 - k * 0.015, 0.24 - k * 0.015, h / 6 + 0.05, 7).translate(x + Math.sin(k * 0.5) * 0.15 * k, h / 12 + k * h / 6, z));
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2;
        const g = new THREE.ConeGeometry(0.5, 4.2, 4).rotateZ(-Math.PI / 2 - 0.5).translate(2.0, -0.6, 0).scale(1, 1, 0.35).rotateY(a).translate(x + 0.4, h, z);
        leaf.push(g);
      }
    };
    for (let x = -2; x < 16; x += 9) palm(x, QUAY_Z + 5, 9 + 2 * R());
    for (let z = 28; z > -80; z -= 18) if (z < -30 || z > 15) palm(-3.0, z, 8 + 2 * R());
    for (let x = -130; x < -30; x += 14) palm(x, QUAY_Z + 3.5, 9 + 2 * R());
    const tm = new THREE.Mesh(mergeGeometries(trunk), ctx.plainMat(0x7a6a55, 0.95)); tm.castShadow = true; scene.add(tm);
    const lm = new THREE.Mesh(mergeGeometries(leaf), ctx.plainMat(0x3e6a2a, 0.85)); lm.castShadow = true; scene.add(lm);
  }

  return {
    water, waterU: WU,
    frame(v) { GU.uTime.value = v; WU.uTime.value = v; },
  };
}
