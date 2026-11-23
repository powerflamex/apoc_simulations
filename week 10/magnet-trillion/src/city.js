// The buildings. One facade shader draws every wall (window grids that mirror the sky, glass towers, brick blocks, shop
// fronts at street level) and what your pull does to them:
//   from ~300,000x (21-25.5 s): the steel inside the street walls tears out toward you: window by window (a hash per
//     window, the same one beams.js uses to throw a beam from exactly that window) the glass and the wall round it are
//     ripped open into a dark hole with a broken edge;
//   from 1,000,000x (26 s on): whole buildings and towers fold toward you, their upper floors leaning in more than the
//     lower ones, and come apart from the top down: the part above a falling cut line is gone, thrown at you as chunks
//     (boxes of facade, floors x bays x depth, drawn with the same shader).
import * as THREE from 'three';
import { BLD } from './layout.js';
import { releaseAt, GROUPS } from './timeline.js';
import { FU, NOISE_GLSL, stretchy } from './field.js';
import { flight, pileSlot, randQuat } from './fly.js';
import { rng, smooth } from './util.js';

export const CU = {
  uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 4500 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
};

// ---- which buildings tear and fold, and when ----
// street walls within ~75 m: windows torn out (beams); street walls within ~140 m and the waterfront towers: fold
for (const b of BLD) {
  b.tear = 999; b.fold = 999; b.foldA = 0; b.cut0 = 999; b.cut1 = 1000;
  if (b.street && b.dist < 75) b.tear = releaseAt('beam', b.dist, 0, 75) - 0.3;
}
{
  const R = rng(919);
  const cand = BLD.filter((b) => (b.street && b.dist < 140) || b.tower);
  cand.sort((a, b) => a.dist - b.dist);
  const [t0, t1] = GROUPS.fold;
  cand.forEach((b, n) => {
    b.fold = t0 + (t1 - 3 - t0) * Math.pow(n / Math.max(1, cand.length - 1), 0.9) + 0.2 * R();
    b.foldA = (b.tower ? 0.55 : 0.75) + 0.2 * R();
    b.cut0 = b.fold + 0.9 + 0.3 * R();
    b.cut1 = b.cut0 + (b.tower ? 4.5 : 3.2);
  });
}
// the fold, as the shader does it (for the chunks' start)
export const foldK = (b, v) => b.foldA * smooth(b.fold, b.fold + 3.2, v);
export const cutH = (b, v) => b.h * (1 - 0.82 * smooth(b.cut0, b.cut1, v));
export function foldPoint(b, x, y, z, v, out) {
  const a = foldK(b, v) * Math.pow(Math.min(Math.max(y / b.h, 0), 1), 1.5);
  const dl = Math.hypot(b.x, 0.4 * b.z) || 1, dx = -b.x / dl, dz = -0.4 * b.z / dl;
  out.set(x + dx * y * Math.sin(a) * 0.85, y - y * (1 - Math.cos(a)) * 0.7, z + dz * y * Math.sin(a) * 0.85);
  return out;
}

const PARS = /* glsl */ `
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD; uniform vec3 uSunCol; uniform float uV;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec4 vT; varying float vYo; varying float vCut;
${NOISE_GLSL}
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += uSunCol * 1.6 * pow(max(dot(normalize(r), uSun), 0.0), 90.0) * step(0.0, uSun.y + 0.02);
  return mix(c, vec3(0.16, 0.15, 0.15), smoothstep(0.0, -0.15, r.y));
}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    if (vYo > vCut) discard;
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x + 0.5);
    float H = vS.w;
    vec3 base = vCol;
    vec3 V = normalize(vWP - cameraPosition);
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = vYo;
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
    // torn out: this window's steel ripped out toward you (the hash beams.js uses), a dark hole with a broken edge
    float wt = fract((id.x * 13.0 + id.y * 71.0 + seed * 29.0 + face * 3.0) * 0.61803398);
    // (half the windows, on the face toward the street, in a spread of 2 x vT.y seconds)
    float torn = ok * step(wt, 0.5) * step(vT.x + vT.y * wt * 2.0, uV) * step(vON.x * sign(vWP.x), -0.5);
    vec3 N = normalize(vWN);
    vec3 refl = skyRefl(reflect(V, N));
    float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
    vec3 col = base; float win = 0.0;
    vec3 room = vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * hh2(id * 2.1 + seed));
    vec3 emis = vec3(0.0);
    if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
      win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
      vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
      col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
      emis += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9;
    } else {
      bool brick = kind > 1.5 && kind < 2.5;
      vec2 a = brick ? vec2(0.3, 0.2) : vec2(0.16, 0.22), b = brick ? vec2(0.7, 0.8) : vec2(0.84, 0.86);
      win = rect(f, a, b, fw) * ok;
      vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
      col = mix(base, glass, win * (1.0 - far));
      col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
      if (brick) col = mix(col, base * 1.12, step(0.86, f.y) * step(f.y, 0.92) * ok * (1.0 - far));
      emis += refl * 0.12 * fres * win * (1.0 - far);
    }
    // street level: shop fronts (big plate glass, goods inside, a coloured fascia band, the lights on)
    if (y < g0 && kind < 2.5) {
      float nb = max(1.0, floor(W / 5.5));
      float bw = W / nb;
      float bay = fract(u / bw);
      float bid = floor(u / bw);
      float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
      vec3 inside = mix(vec3(0.6, 0.48, 0.36), vec3(0.42, 0.47, 0.52), step(0.55, hh2(vec2(bid, seed)))) * (0.5 + 0.4 * hh2(vec2(floor(bay * 6.0), seed)));
      float goods = step(0.5, fract(y * 1.6)) * step(0.1, fract(bay * 9.0));
      inside = mix(inside, inside * vec3(1.3, 0.9, 0.7) * (0.6 + 0.8 * hh2(vec2(floor(bay * 9.0), bid))), goods * 0.6);
      vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
      col = mix(base * 0.75, shopGlass, pane);
      float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
      vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + hh2(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.4);
      col = mix(col, bc, band * step(0.4, hh2(vec2(bid + 7.0, seed))));
      emis += pane * inside * 0.45;
      emis += refl * 0.25 * fres * pane;
      win = max(win, pane);
    }
    if (torn > 0.5) {
      // the hole: ragged, wider than the window, dark inside, broken concrete and bent rods at its rim
      vec2 c = (f - 0.5) * vec2(colW, FH);
      float rr = length(c / vec2(colW * 0.5, FH * 0.5));
      float edge = 0.78 + 0.22 * nn2(vec2(atan(c.y, c.x) * 3.0, seed + id.x * 1.7 + id.y));
      float hole = 1.0 - smoothstep(edge - 0.04, edge, rr);
      float rim = smoothstep(edge - 0.2, edge - 0.04, rr) * (1.0 - smoothstep(edge, edge + 0.12, rr));
      col = mix(col, vec3(0.03, 0.028, 0.026), hole);
      col = mix(col, vec3(0.42, 0.4, 0.37) * (0.7 + 0.5 * hh2(floor(c * 8.0))), rim * 0.8);
      emis *= 1.0 - max(hole, rim * 0.8);
    }
    diffuseColor.rgb = col;
    if (abs(vON.y) > 0.5) diffuseColor.rgb = base * 0.5 + 0.04 * hh2(floor(vWP.xz * 0.5));
    // inside the shell (seen where the top has come off): dark floors
    if (!gl_FrontFacing) { diffuseColor.rgb = vec3(0.07, 0.065, 0.06) * (0.6 + 0.6 * step(0.5, fract(vYo / 3.5))); emis = vec3(0.0); }
    totalEmissiveRadiance += emis;
  }
`;

function facadeMaterial(near, key) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, side: near ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU, { uV: FU.uV, uYou: FU.uYou });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol; attribute vec4 aT; attribute vec4 aC;
        uniform float uV; uniform vec3 uYou;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec4 vT; varying float vYo; varying float vCut;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vON = normal; vS = aS; vCol = aCol; vT = aT;
        vLoc = position - vec3(0.0, 0.5, 0.0);
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vYo = (vLoc.y + 0.5) * vSc.y + aC.w;
        {
          // the fold toward you (timeline: aT.z start, aC.x max angle) and the cut line coming down (aC.y, aC.z)
          vec3 ctr = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float Hh = max(aS.w, 1.0);
          float A = aC.x * smoothstep(aT.z, aT.z + 3.2, uV);
          float a = A * pow(clamp(vYo / Hh, 0.0, 1.0), 1.5);
          // (toward you, leaning in over the street: from behind you a lean straight at the camera can't be seen)
          vec2 dir = normalize((uYou.xz - ctr.xz) * vec2(1.0, 0.4) + 1e-4);
          vec3 d = vec3(dir.x * vYo * sin(a) * 0.85, -vYo * (1.0 - cos(a)) * 0.7, dir.y * vYo * sin(a) * 0.85);
          transformed += d / max(vSc, vec3(1e-3));
          float c = clamp((uV - aC.y) / max(aC.z - aC.y, 0.01), 0.0, 1.0);
          vCut = aS.w * (1.0 - 0.82 * c * c * (3.0 - 2.0 * c)) + (aC.y > 500.0 ? 1e5 : 0.0);
        }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        { mat3 im = mat3(instanceMatrix); vec3 sc2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
          vWN = normalize(mat3(modelMatrix) * (im * (normal / sc2))); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vWP - cameraPosition) / uHazeD));`);
  };
  m.customProgramCacheKey = () => `mag-facade-${key}-v1`;
  return stretchy(m, `facade-${key}`);
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

// ---- the chunks: each folding building's top, floors x bays x depth, thrown at you as the cut line passes them ----
export const CHUNKS = [];
{
  const R = rng(5150);
  const tmp = new THREE.Vector3();
  for (const b of BLD) {
    if (b.fold > 500) continue;
    const nx = Math.max(1, Math.round(b.w / (b.tower ? 10 : 8))), nz = Math.max(1, Math.round(b.d / (b.tower ? 10 : 8)));
    const CH = b.tower ? 10.5 : 7;
    const yEnd = b.h * 0.18;
    for (let y0 = b.h - CH; y0 > yEnd - CH * 0.5; y0 -= CH) {
      const yb = Math.max(y0, yEnd), hh = Math.min(CH, b.h - yb);
      // when the cut passes the chunk's middle
      let lo = b.cut0, hi = b.cut1;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (cutH(b, m) > yb + hh * 0.5) lo = m; else hi = m; }
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const w = b.w / nx, d = b.d / nz;
        const cx = b.x - b.w / 2 + (i + 0.5) * w, cz = b.z - b.d / 2 + (k + 0.5) * d;
        // (from the near corner first)
        const near = Math.hypot(cx, cz) / Math.hypot(b.x, b.z);
        const tR = hi + 0.35 * (near - 0.85) * 4 + 0.25 * R();
        foldPoint(b, cx, yb, cz, tR, tmp);
        const tilt = foldK(b, tR) * Math.pow(yb / b.h, 1.5);
        const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.4 * b.z, 0, -b.x).normalize(), -tilt);
        const p1 = pileSlot(cx, cz, { rMin: 28 + (b.tower ? 22 : 0), rMax: 55 + (b.tower ? 40 : 0), yMin: 0, yMax: 8 }, R);
        CHUNKS.push({ b, w: w * 0.98, h: hh * 0.98, d: d * 0.98, yb,
          f: flight({ p0: tmp.clone(), q0, p1, q1: randQuat(R), tR, acc: 60 + Math.hypot(cx, cz) * 0.6, dMin: 1.0, dMax: 3.2, arc: 6 + 10 * R(), spin: 1 + 2 * R(), shake: 0.4, size: 6 }, R) });
      }
    }
  }
  CHUNKS.sort((a, b) => a.f.tR - b.f.tR);
}

export function makeCity(scene) {
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const meshes = [];
  for (const near of [true, false]) {
    const list = BLD.filter((b) => b.near === near);
    const geo = (near ? new THREE.BoxGeometry(1, 1, 1, 10, 16, 10) : new THREE.BoxGeometry(1, 1, 1, 1, 2, 1)).translate(0, 0.5, 0);
    const n = list.length;
    const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3), aT = new Float32Array(n * 4), aC = new Float32Array(n * 4);
    const mesh = new THREE.InstancedMesh(geo, facadeMaterial(near, near ? 'near' : 'far'), n);
    list.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
      mesh.setMatrixAt(i, m4);
      aS.set([b.i, b.kind, b.colW, b.h], i * 4);
      col.set(b.col).convertSRGBToLinear();
      aCol.set([col.r, col.g, col.b], i * 3);
      aT.set([b.tear, 2.6, b.fold, 0], i * 4);
      aC.set([b.foldA, b.cut0, b.cut1, 0], i * 4);
    });
    geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }
  // the chunks (same shader; no fold of their own, no cut, no shop level: aC.w lifts their window grid to where they were)
  const n = CHUNKS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).translate(0, 0.5, 0);
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3), aT = new Float32Array(n * 4), aC = new Float32Array(n * 4);
  CHUNKS.forEach((c, i) => {
    col.set(c.b.col).convertSRGBToLinear();
    aS.set([c.b.i + 1000 + i, c.b.kind, c.b.colW, c.h + c.yb + 10], i * 4);
    aCol.set([col.r, col.g, col.b], i * 3);
    aT.set([999, 1, 999, 0], i * 4);
    aC.set([0, 999, 1000, c.yb], i * 4);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
  const chunks = new THREE.InstancedMesh(geo, facadeMaterial(true, 'chunk'), Math.max(1, n));
  chunks.frustumCulled = false; chunks.castShadow = true; chunks.receiveShadow = true;
  scene.add(chunks);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return {
    meshes,
    frame(v, flyPose) {
      CHUNKS.forEach((c, i) => {
        if (v < c.f.tR) { chunks.setMatrixAt(i, zero); return; }
        const s = flyPose(c.f, v, pos, q);
        chunks.setMatrixAt(i, m4.compose(pos, q, sc.set(c.w * s, c.h * s, c.d * s)));
      });
      chunks.instanceMatrix.needsUpdate = true;
    },
  };
}
