// The place: a downtown avenue (with the crater that opens and grows under you and the cracks running out of it), the
// buildings along it (their windows break and the near ones are wrecked as the push-offs get bigger: uBl), the
// 12-storey building beside you, the tallest tower across the avenue with its open deck, street furniture, and the
// cloud deck at 2 km (a hole opens where you punch through it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET, WALK, P, MID, TOWER, CLOUD_Y } from './layout.js';
import { rng } from './util.js';
import { nearCam } from './carsplan.js';

export const NOISE = /* glsl */ `
float gh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
float gfbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * gn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7; a *= 0.5; } return s; }
`;
export const NCR = 4;
// shared uniforms: craters (x, z, radius, depth), their cracks (reach, strength, seed, rubble), the blast damage
// (x, z, radius the glass is broken to, radius the buildings are wrecked to), haze
export const GU = {
  uCr: { value: Array.from({ length: NCR }, () => new THREE.Vector4(0, 0, 0.001, 0)) },
  uCk: { value: Array.from({ length: NCR }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uBl: { value: new THREE.Vector4(P.x, P.z, 0, 0) },
  uBurn: { value: 0 },
  uHaze: { value: new THREE.Color(0.7, 0.78, 0.88) }, uHazeD: { value: 2500 },
  uTime: { value: 0 },
  uHole: { value: new THREE.Vector4(P.x, P.z, 0, 0) },           // the hole in the cloud deck (x, z, radius, 0)
};
// the crater depth at (x, z) (the same formula as the shader), for placing you and the rubble
export function craterH(x, z) {
  let h = 0;
  for (const c of GU.uCr.value) {
    if (c.w <= 0) continue;
    const r = Math.hypot(x - c.x, z - c.y), R = c.z;
    if (r < R) { const u = r / R; h -= c.w * (1 - u * u) * (1 - u * u); }
    else h += c.w * 0.12 * Math.exp(-Math.pow((r - R) / (0.3 * R), 2));
  }
  return h;
}
const CRATER_GLSL = /* glsl */ `
uniform vec4 uCr[${NCR}]; uniform vec4 uCk[${NCR}];
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
    float N = 11.0;
    float sec = floor((a + 3.14159) / 6.28318 * N);
    float s0 = (sec + 0.5) / N * 6.28318 - 3.14159;
    float sd = gh(vec2(sec, q.z));
    float len = reach * (0.45 + 0.55 * gh(vec2(sec + 7.0, q.z)));
    float wob = (gfbm(vec2(r * 0.18 / max(1.0, c.z * 0.25) + sec * 3.1, q.z)) - 0.5) * 0.7 + (gn(vec2(r * 1.3 / max(1.0, c.z * 0.25), sec + q.z)) - 0.5) * 0.18;
    float aa = s0 + (sd - 0.5) * 0.35 + wob * min(1.0, 6.0 * max(1.0, c.z * 0.3) / (r + 1.0));
    float dist = abs(mod(a - aa + 3.14159, 6.28318) - 3.14159) * r;
    float w = (0.05 + 0.04 * c.z) * q.y * (1.0 - smoothstep(0.0, len, r)) + px * 0.6;
    float line = 1.0 - smoothstep(w * 0.5, w, dist);
    line *= step(c.z * 0.6, r);
    float ab = aa + (gh(vec2(sec, q.z + 3.0)) - 0.5) * 0.9;
    float rb0 = len * 0.4;
    float db = abs(mod(a - ab + 3.14159, 6.28318) - 3.14159) * r;
    float lb = (1.0 - smoothstep(w * 0.3, w * 0.7, db)) * step(rb0, r) * (1.0 - smoothstep(rb0, len * 0.85, r));
    float ring = 0.0;
    for (int j = 0; j < 2; j++) {
      float rr = c.z * (1.3 + 0.8 * float(j)) * (1.0 + 0.12 * (gn(vec2(a * 3.0, q.z + float(j))) - 0.5));
      float on = step(0.45, gn(vec2(a * 2.2 + float(j) * 5.0, q.z)));
      ring += (1.0 - smoothstep(w * 0.4, w * 0.9, abs(r - rr))) * on * step(rr, reach);
    }
    k = max(k, max(max(line, lb * 0.8), ring * 0.8));
    rub = max(rub, q.w * (1.0 - smoothstep(c.z * 0.85, c.z * 1.6, r)));
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
// 1 glass curtain wall, 2 shop + flats). Blast damage from uBl: broken glass (dark, jagged holes), and nearer, charred
// and burning walls; buildings well inside the wreck radius are knocked down to a stump (vertex shader).
export const FACADE_GLSL = /* glsl */ `
float fh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 facade(vec3 P, vec3 N, vec4 box, vec3 wall, vec4 win, float seed, float broke, float burnt, out float glass, out vec3 emis) {
  glass = 0.0; emis = vec3(0.0);
  if (abs(N.y) > 0.5) return wall * 0.8 * (1.0 - 0.75 * burnt);
  float u = abs(N.x) > 0.5 ? P.z : P.x;
  float y = P.y;
  float fl = box.w;
  float kind = win.w;
  float bay = kind > 0.5 && kind < 1.5 ? 1.5 : 2.6;
  float fy = fract(y / fl), fx = fract(u / bay);
  vec2 cell = vec2(floor(u / bay), floor(y / fl));
  float lit = fh(cell + seed * 17.0);
  vec3 c = wall;
  float w = 0.0;
  if (kind < 0.5) {
    w = step(0.22, fx) * step(fx, 0.78) * step(0.28, fy) * step(fy, 0.82);
    vec3 g = win.rgb * (0.55 + 0.6 * lit);
    c = mix(wall, g, w);
    c *= 1.0 - 0.18 * (1.0 - step(0.06, fy));
  } else if (kind < 1.5) {
    float mull = 1.0 - step(0.05, fx) * step(fx, 0.95);
    float slab = 1.0 - step(0.1, fy);
    w = 1.0 - max(mull, slab);
    vec3 g = win.rgb * (0.75 + 0.45 * lit) + vec3(0.04) * fy;
    c = mix(g, wall, max(mull, slab));
  } else {
    if (y < 4.2) {
      w = step(0.08, fract(u / 5.0)) * step(fract(u / 5.0), 0.92) * step(0.25, y) * step(y, 3.4);
      vec3 g = win.rgb * 0.5 + vec3(0.25, 0.22, 0.18) * lit;
      c = mix(wall * 0.7, g, w);
      c = mix(c, vec3(0.75, 0.2, 0.15) * (0.6 + 0.6 * fh(vec2(floor(u / 5.0), seed))), step(3.5, y) * step(y, 4.1));
    } else {
      w = step(0.25, fx) * step(fx, 0.75) * step(0.3, fy) * step(fy, 0.85);
      c = mix(wall, win.rgb * (0.55 + 0.6 * lit), w);
      c = mix(c, wall * 0.7, step(0.86, fy) * step(fy, 0.92) * step(0.2, fx) * step(fx, 0.8));
    }
  }
  glass = w;
  // broken glass: the pane is gone (a dark room), a few jagged shards left at its edges
  if (broke > 0.0 && w > 0.0) {
    float sh = fh(cell * 1.7 + seed * 5.0 + floor(vec2(fx, fy) * 5.0));
    float gone = step(fh(cell + seed * 3.1) * 0.25, broke) * step(0.28, sh);
    c = mix(c, vec3(0.012, 0.011, 0.01) * (1.0 + 1.5 * lit * (1.0 - burnt)), gone * w);
    glass *= 1.0 - gone;
  }
  // charred and burning
  if (burnt > 0.0) {
    float n = fh(cell * 0.37 + seed);
    c = mix(c, vec3(0.06, 0.05, 0.045) * (0.6 + 0.8 * n), burnt * 0.9);
    float fire = step(0.62, n) * w * burnt;
    emis = vec3(2.4, 0.9, 0.2) * fire * (0.6 + 0.4 * fh(cell + floor(y)));
  }
  c *= 1.0 - 0.25 * step(box.y - 0.8, y);
  return c;
}
`;
export function facadeMat() {
  const m = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 }));
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uBl = GU.uBl; sh.uniforms.uBurn = GU.uBurn;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aBox; attribute vec3 aCol; attribute vec4 aWin; attribute float aSeed; uniform vec4 uBl;
      varying vec3 vFP; varying vec3 vFN; varying vec4 vBox; varying vec3 vCol; varying vec4 vWin; varying float vSeed; varying float vKnock;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vFP = vec3((position.x + 0.5) * aBox.x, position.y * aBox.y, (position.z + 0.5) * aBox.z);
      vFN = normal; vBox = aBox; vCol = aCol; vWin = aWin; vSeed = aSeed;
      {
        // knocked down: buildings well inside the wreck radius lose their upper floors (a jagged stump)
        vec2 ctr = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float dd = length(ctr - uBl.xy) - 0.5 * max(aBox.x, aBox.z);
        float knock = (1.0 - smoothstep(uBl.w * 0.45, uBl.w * 0.8, dd)) * step(1.0, uBl.w);
        float stump = (0.12 + 0.2 * fract(aSeed * 7.3)) * (1.0 + 0.6 * sin(position.x * 9.0 + position.z * 7.0 + aSeed));
        transformed.y *= mix(1.0, clamp(stump, 0.05, 0.4), knock);
        vFP.y = transformed.y * aBox.y;
        vKnock = knock;
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec4 uBl; uniform float uBurn;
      varying vec3 vFP; varying vec3 vFN; varying vec4 vBox; varying vec3 vCol; varying vec4 vWin; varying float vSeed; varying float vKnock;
      ${FACADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float glz; vec3 femis;
      {
        float dd = length(vHW.xz - uBl.xy);
        float broke = 1.0 - smoothstep(uBl.z * 0.85, uBl.z, dd);
        float burnt = max(1.0 - smoothstep(uBl.w * 0.7, uBl.w * 1.15, dd), vKnock) * uBurn;
        diffuseColor.rgb = facade(vFP, normalize(vFN), vBox, vCol, vWin, vSeed, broke, burnt, glz, femis);
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.12, glz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += femis;`);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '-facade';
  return m;
}
export function makeBlocks(scene, list) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 6, 1).translate(0, 0.5, 0);
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
// cross streets: every 120 m (centres at z = 60 + 120 k), 20 m wide
export const crossAt = (z) => Math.abs(((((z - 60) % 120) + 180) % 120) - 60) < 10;

export function makeWorld(scene, ctx) {
  const R = rng(5150);
  // ---------- the ground: avenue, sidewalks, cross streets; the crater and its cracks ----------
  const gMat = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }));
  {
    const prev = gMat.onBeforeCompile;
    gMat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      Object.assign(sh.uniforms, { uCr: GU.uCr, uCk: GU.uCk, uTime: GU.uTime, uBl: GU.uBl, uBurn: GU.uBurn });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${NOISE}\n${CRATER_GLSL}\nvarying vec3 vGW; varying float vCrD;`)
        .replace('#include <beginnormal_vertex>', `
          vec3 chg = craterHG(position.xz);
          vec3 objectNormal = normalize(vec3(-chg.y, 1.0, -chg.z));
          vCrD = -chg.x;`)
        .replace('#include <begin_vertex>', `vec3 transformed = position; transformed.y += chg.x; vGW = transformed;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}\nuniform vec4 uCr[${NCR}]; uniform vec4 uCk[${NCR}]; uniform float uTime; uniform vec4 uBl; uniform float uBurn;\n${CRACK_GLSL}\nvarying vec3 vGW; varying float vCrD;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vGW.xz;
          float px = length(fwidth(p));
          float n1 = gn(p * 0.35), n2 = gn(p * 3.1);
          vec3 c;
          float zc = mod(p.y - 60.0 + 60.0, 120.0) - 60.0;          // metres from the nearest cross street's middle
          bool cross = abs(zc) < 10.0;
          float ax = abs(p.x);
          if (ax < ${STREET.x1.toFixed(1)} || (cross && ax > ${WALK.toFixed(1)} - 0.5)) {
            c = vec3(0.17, 0.17, 0.18) * (0.85 + 0.25 * n1 + 0.1 * n2);
            if (ax < ${STREET.x1.toFixed(1)} && !cross) {
              float dash = step(0.5, fract(p.y / 9.0));
              float aw = 0.07 + px;
              float ln = (1.0 - step(aw, abs(ax - 4.0))) * dash;
              float yel = (1.0 - step(aw, abs(p.x - 0.15))) + (1.0 - step(aw, abs(p.x + 0.15)));
              c = mix(c, vec3(0.85, 0.85, 0.82), ln * 0.85);
              c = mix(c, vec3(0.85, 0.66, 0.12), clamp(yel, 0.0, 1.0) * 0.9);
            }
            // crosswalks across the avenue at each cross street's edges
            float cw = step(abs(abs(zc) - 12.5), 2.0) * step(ax, ${STREET.x1.toFixed(1)}) * mix(step(0.5, fract(p.x / 1.2)), 0.5, smoothstep(0.1, 0.5, px));
            c = mix(c, vec3(0.86, 0.86, 0.84), cw * 0.9);
          } else if (ax < 60.0) {
            // sidewalk: concrete slabs (the joints fade out with distance so they never shimmer), a curb
            vec2 sl = fract(p / 1.5);
            c = vec3(0.56, 0.54, 0.51) * (0.9 + 0.12 * gh(floor(p / 1.5)) + 0.06 * n1);
            c *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.3, px)) * (1.0 - step(0.025 + px * 0.5, min(min(sl.x, 1.0 - sl.x), min(sl.y, 1.0 - sl.y))));
            c = mix(c, vec3(0.72, 0.72, 0.7), 1.0 - step(0.22, ax - ${STREET.x1.toFixed(1)}));
          } else {
            // the rest of the city seen from above: blocks of roofs and streets, parks (no fine lines)
            vec2 bl = fract(p / vec2(140.0, 120.0));
            float road = 1.0 - step(0.12, min(min(bl.x, 1.0 - bl.x) * 140.0, min(bl.y, 1.0 - bl.y) * 120.0) / 9.0);
            float blk = gh(floor(p / vec2(140.0, 120.0)));
            vec3 roof = mix(vec3(0.5, 0.49, 0.47), vec3(0.62, 0.58, 0.52), gn(p * 0.05)) * (0.8 + 0.35 * gn(p * 0.21));
            if (blk < 0.12) roof = vec3(0.3, 0.42, 0.22) * (0.8 + 0.3 * gn(p * 0.08));
            c = mix(roof, vec3(0.22, 0.22, 0.23), road * (1.0 - smoothstep(4.0, 14.0, px)));
          }
          // scorched ground near the big push-offs
          float sc = (1.0 - smoothstep(uBl.w * 0.5, uBl.w * 1.2, length(p - uBl.xy))) * uBurn;
          c = mix(c, vec3(0.08, 0.07, 0.06) * (0.7 + 0.6 * n1), sc * 0.85);
          vec2 ck = cracksAt(p, px);
          float deep = clamp(vCrD / 1.5, 0.0, 1.0);
          vec3 dirt = vec3(0.32, 0.27, 0.22) * (0.7 + 0.5 * gn(p * 2.3) + 0.2 * gn(p * 9.0));
          c = mix(c, dirt, clamp(deep * 1.4 + ck.y * 0.65 * smoothstep(0.35, 0.65, gn(p * 1.7)), 0.0, 0.95));
          c = mix(c, vec3(0.05, 0.045, 0.04), ck.x * 0.92);
          diffuseColor.rgb = c;
        }`);
    };
    const key = gMat.customProgramCacheKey.bind(gMat);
    gMat.customProgramCacheKey = () => key() + '-ground';
  }
  // a fine grid round you (0.5 m; the crater grows to ~150 m), coarser out along the avenue, a big plain beyond
  const fineGeo = new THREE.PlaneGeometry(320, 320, 640, 640).rotateX(-Math.PI / 2).translate(P.x, 0, P.z);
  const ground = new THREE.Mesh(fineGeo, gMat);
  ground.receiveShadow = true; ground.frustumCulled = false;
  scene.add(ground);
  const x0 = P.x - 160, x1 = P.x + 160, z0 = P.z - 160, z1 = P.z + 160;
  const outer = [
    [-40000, x0, -40000, 40000, 40, 400], [x1, 40000, -40000, 40000, 40, 400], [x0, x1, -40000, z0, 64, 300], [x0, x1, z1, 40000, 64, 300],
  ].map(([a, b, c, d, nx, nz]) => new THREE.PlaneGeometry(b - a, d - c, nx, nz).rotateX(-Math.PI / 2).translate((a + b) / 2, 0, (c + d) / 2));
  const outerM = new THREE.Mesh(mergeGeometries(outer), gMat);
  outerM.receiveShadow = true; outerM.frustumCulled = false;
  scene.add(outerM);

  // ---------- buildings ----------
  const blocks = [];
  const WALLS = [0xd8c7a8, 0xc9a98a, 0xe5ddd0, 0xb8b2a8, 0xd9b48c, 0xcfc8bd, 0xa9b4bf, 0xe0d6c4];
  // the 12-storey building beside you (east)
  blocks.push({ x: (MID.x + MID.x1) / 2, z: (MID.z0 + MID.z1) / 2, w: MID.x1 - MID.x, d: MID.z1 - MID.z0, h: MID.h, wall: 0xd9cdb8, win: 0x6d87a0, kind: 0, fl: MID.h / MID.floors });
  // the tallest tower (west): its shaft up to the deck, a narrower crown above, a mast
  blocks.push({ x: TOWER.x, z: TOWER.z, w: TOWER.w, d: TOWER.d, h: TOWER.deck, wall: 0x8ea3b6, win: 0x3a5872, kind: 1, fl: 3.9 });
  blocks.push({ x: TOWER.x - 4, z: TOWER.z - 4, w: 30, d: 30, h: TOWER.h - TOWER.deck, y: TOWER.deck, wall: 0x9fb1c2, win: 0x3f6078, kind: 1, fl: 3.9 });
  // both sides of the avenue, block by block, 3 km south and 1.5 km north
  for (const side of [-1, 1]) {
    for (let z = 3200; z > -1600;) {
      const w = 16 + 14 * R();
      const zc = z - w / 2;
      z -= w;
      if (crossAt(zc) || crossAt(zc + w * 0.45) || crossAt(zc - w * 0.45)) { R(); R(); R(); continue; }
      if (side > 0 && zc > MID.z0 - 2 && zc < MID.z1 + 2) { R(); R(); R(); continue; }
      if (side < 0 && zc > TOWER.z - TOWER.d / 2 - 3 && zc < TOWER.z + TOWER.d / 2 + 3) { R(); R(); R(); continue; }
      const far = Math.abs(zc) > 300;
      const h = (far ? 22 : 16) + (far ? 70 : 34) * Math.pow(R(), 1.5);
      const d = 18 + 10 * R();
      const kind = h > 45 ? (R() < 0.6 ? 1 : 0) : (R() < 0.5 ? 2 : 0);
      blocks.push({ x: side * (WALK + d / 2), z: zc, w: d, d: w - 0.4, h, wall: WALLS[Math.floor(R() * WALLS.length)], win: kind === 1 ? 0x5a7a96 : 0x60788f, kind, fl: kind === 1 ? 3.7 : 3.2 });
    }
    // the blocks behind, a few towers among them
    for (let k = 0; k < 150; k++) {
      const zc = -1500 + 4600 * R(), off = 40 + 260 * R();
      if (crossAt(zc)) { R(); R(); R(); R(); continue; }
      const w = 20 + 20 * R(), d = 20 + 16 * R();
      const h = 18 + (R() < 0.15 ? 120 + 120 * R() : 50 * R());
      blocks.push({ x: side * (WALK + 20 + off), z: zc, w: d, d: w, h, wall: WALLS[Math.floor(R() * WALLS.length)], win: 0x2c3a48, kind: h > 60 ? 1 : 0, fl: 3.4 });
    }
  }
  const blockMesh = makeBlocks(scene, blocks);

  // ---------- street furniture: lamps, trees, traffic lights, a bus shelter; the deck's railing on the tower ----------
  {
    const dark = ctx.plainMat(0x2b2e33, 0.6);
    const parts = [];
    for (let z = 3000; z > -1500; z -= 30) {
      if (crossAt(z)) continue;
      for (const sx of [-1, 1]) {
        if (nearCam(sx * (STREET.x1 + 0.2), z + sx * 9, 3.5)) continue;
        parts.push(new THREE.CylinderGeometry(0.09, 0.13, 8, 8).translate(sx * (STREET.x1 + 0.7), 4, z + sx * 9));
        parts.push(new THREE.BoxGeometry(1.8, 0.12, 0.3).translate(sx * (STREET.x1 - 0.2), 8, z + sx * 9));
      }
    }
    // traffic lights at the cross streets near you
    for (const zc of [60, -60, 180, -180, 300]) for (const sx of [-1, 1]) {
      if (nearCam(sx * (STREET.x1 - 1.7), zc + sx * 11.5, 4)) continue;
      parts.push(new THREE.CylinderGeometry(0.1, 0.12, 6, 8).translate(sx * (STREET.x1 + 0.8), 3, zc + sx * 11.5));
      parts.push(new THREE.BoxGeometry(5, 0.14, 0.14).translate(sx * (STREET.x1 - 1.7), 5.9, zc + sx * 11.5));
      parts.push(new THREE.BoxGeometry(0.4, 1.1, 0.35).translate(sx * (STREET.x1 - 3.8), 5.4, zc + sx * 11.5));
    }
    // the bus shelter (east sidewalk, behind the bus)
    parts.push(new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(10.2, 1.25, 9), new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(10.2, 1.25, 14),
      new THREE.BoxGeometry(1.8, 0.12, 5.4).translate(10.9, 2.55, 11.5));
    // the deck railing round the tower's crown (an open terrace 8-10 m wide)
    const tx0 = TOWER.x - TOWER.w / 2, tx1 = TOWER.x + TOWER.w / 2, tz0 = TOWER.z - TOWER.d / 2, tz1 = TOWER.z + TOWER.d / 2, dy = TOWER.deck;
    parts.push(new THREE.BoxGeometry(TOWER.w, 0.06, 0.06).translate(TOWER.x, dy + 1.15, tz1 - 0.1), new THREE.BoxGeometry(TOWER.w, 0.06, 0.06).translate(TOWER.x, dy + 1.15, tz0 + 0.1),
      new THREE.BoxGeometry(0.06, 0.06, TOWER.d).translate(tx1 - 0.1, dy + 1.15, TOWER.z), new THREE.BoxGeometry(0.06, 0.06, TOWER.d).translate(tx0 + 0.1, dy + 1.15, TOWER.z));
    for (let k = 0; k <= 25; k++) {
      const f = k / 25;
      parts.push(new THREE.BoxGeometry(0.05, 1.15, 0.05).translate(tx0 + f * TOWER.w, dy + 0.58, tz1 - 0.1));
      parts.push(new THREE.BoxGeometry(0.05, 1.15, 0.05).translate(tx1 - 0.1, dy + 0.58, tz0 + f * TOWER.d));
    }
    // the mast on top
    parts.push(new THREE.CylinderGeometry(0.6, 1.6, 42, 8).translate(TOWER.x - 4, TOWER.h + 21, TOWER.z - 4));
    const m = new THREE.Mesh(mergeGeometries(parts), dark);
    m.castShadow = true; m.frustumCulled = false; scene.add(m);
    // glass panels on the deck railing (faintly blue)
    const gl = [new THREE.BoxGeometry(TOWER.w, 1.1, 0.02).translate(TOWER.x, dy + 0.6, tz1 - 0.1), new THREE.BoxGeometry(0.02, 1.1, TOWER.d).translate(tx1 - 0.1, dy + 0.6, TOWER.z)];
    const gm = new THREE.Mesh(mergeGeometries(gl), new THREE.MeshStandardMaterial({ color: 0x9fc4dc, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }));
    gm.frustumCulled = false; scene.add(gm);
    // trees in the sidewalks
    const trunk = [], crown = [];
    for (let z = 2400; z > -1200; z -= 11 + 4 * R()) {
      if (crossAt(z) || Math.abs(z) < 16) continue;
      for (const sx of [-1, 1]) {
        if (R() < 0.3) continue;
        const x = sx * (STREET.x1 + 2.2 + 0.4 * R()), h = 3.5 + 1.5 * R();
        if (nearCam(x, z, 3.2)) continue;
        trunk.push(new THREE.CylinderGeometry(0.12, 0.16, h, 6).translate(x, h / 2, z));
        crown.push(new THREE.IcosahedronGeometry(1.6 + 0.6 * R(), 1).scale(1, 1.15, 1).translate(x, h + 0.9, z));
      }
    }
    const tm = new THREE.Mesh(mergeGeometries(trunk), ctx.plainMat(0x5a4632, 0.95)); tm.castShadow = true; tm.frustumCulled = false; scene.add(tm);
    const cm = new THREE.Mesh(mergeGeometries(crown), ctx.plainMat(0x48702e, 0.9)); cm.castShadow = true; cm.frustumCulled = false; scene.add(cm);
    var trees = { tm, cm };
  }

  // ---------- the cloud deck: patchy cumulus at 2 km, bright tops, grey bases; a hole where you punch through ----------
  const CU = { uTime: GU.uTime, uHole: GU.uHole, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSky: { value: new THREE.Color(0.6, 0.72, 0.9) }, uHaze: GU.uHaze, uAlpha: { value: 1 } };
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: CU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec4 uHole; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uHaze; uniform float uAlpha;
      varying vec3 vW;
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = vW.xz;
        float d = length(vW - cameraPosition);
        float px = max(d * 0.0008, 1.0);
        float n = gfbm(p * 0.0011 + vec2(uTime * 0.003, 0.0)) * 0.75 + gn(p * 0.006) * 0.25;
        float cov = smoothstep(0.46, 0.62, n);
        // the hole: a round gap with a torn, wispy edge
        float hr = uHole.z;
        if (hr > 0.0) {
          float r = length(p - uHole.xy);
          float edge = hr * (0.8 + 0.4 * gn(p * 0.03));
          cov *= smoothstep(edge * 0.7, edge * 1.25, r);
        }
        if (cov < 0.01) discard;
        bool below = cameraPosition.y < vW.y;
        float thick = smoothstep(0.46, 0.75, n);
        vec3 top = vec3(1.0, 0.99, 0.96) * (0.92 + 0.12 * gn(p * 0.02));
        vec3 base = mix(vec3(0.72, 0.74, 0.78), vec3(0.48, 0.5, 0.55), thick);
        vec3 c = below ? base : top;
        float hz = 1.0 - exp(-d / 26000.0);
        c = mix(c, uHaze, hz * 0.8);
        float a = cov * (below ? 0.92 : 0.97) * uAlpha * (1.0 - smoothstep(22000.0, 36000.0, d));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000, 1, 1).rotateX(-Math.PI / 2).translate(0, CLOUD_Y, 0), cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = 3;
  scene.add(clouds);

  return {
    blockMesh, clouds, cloudU: CU,
    frame(v) { GU.uTime.value = v; },
  };
}
