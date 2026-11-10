// The buildings, signs and marquees of the Strip at night. One instanced, finely divided box per building (so the
// pull can bend it: pull.js), with the facade drawn in the shader:
//   kind 0 casino podium: pale stucco washed in coloured uplight, a lit shop front at street level under a dark
//          fascia, a cornice; kind 1 resort tower: gold glass, rooms lit warm, an LED crown; kind 2 glass tower;
//          kind 3 hotel block (punched windows); kind 4 the low city.
// Windows burst when the pull at the window passes 2 g (the same test the flying glass uses: layout.js SHARDS);
// the lights die at ~4 g. Signs (neon and LED, from a canvas atlas) and the pylon marquees bend with the fronts.
import * as THREE from 'three';
import { BLD, SIGNS, PYLONS, GLASS_K } from './layout.js';
import { patchPull, PU } from './pull.js';
import { GEE } from './timeline.js';

export const CU = { uTime: { value: 0 }, uDim: { value: 1 } };
// pull strengths (g): tears loose at k, bends from kLean
export const PULL_BLD = { 0: [10, 3], 1: [12, 1.6], 2: [12, 1.6], 3: [11, 2], 4: [9, 3] };

const PARS = /* glsl */ `
uniform float uTime; uniform float uDim;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
// the night sky seen in glass: a deep blue-violet with the orange glow of the city low down
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 c = mix(vec3(0.5, 0.28, 0.22), vec3(0.03, 0.04, 0.1), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(0.25, 0.15, 0.12), smoothstep(0.0, -0.12, r.y));
  return c;
}
// the pull at a point, in g (the same as pull.js)
float pullAt(vec3 p) { vec3 d = p - uB; return uGM / max(dot(d, d), 1e-6) / ${GEE.toFixed(2)}; }
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x * 1009.0 + 0.5);
    float H = vS.w;
    vec3 base = vCol;
    vec3 V = normalize(vWP - cameraPosition);
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = (vLoc.y + 0.5) * vSc.y;
    float face = floor(vON.x + 0.5) * 2.0 + floor(vON.z + 0.5) + 3.0;
    float FH = kind < 0.5 ? 4.8 : kind > 3.5 ? 3.2 : 3.4;
    float g0 = kind < 0.5 ? 4.2 : kind > 3.5 ? 3.4 : 6.0;
    float colW = kind > 0.5 && kind < 2.5 ? 1.8 : kind < 0.5 ? 6.0 : 2.6;
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 2.0);
    // the cell's centre where the building stands (pre-pull): for the burst test
    float uc = (id.x + 0.5) * colW - W * 0.5;
    float yc = g0 + (id.y + 0.5) * FH;
    vec3 ctr = sx ? vec3(vWP.x, yc, vWP.z - vLoc.z * W + uc) : vec3(vWP.x - vLoc.x * W + uc, yc, vWP.z);
    float aC = pullAt(ctr);
    float broken = step(${GLASS_K.toFixed(2)} + 0.6 * h21(id + seed), aC);
    float on = uDim * (1.0 - smoothstep(3.0, 6.0, aC));
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      float floorR = h21(vec2(id.y, seed * 0.29 + face));
      vec3 refl = skyRefl(reflect(V, normalize(vWN)));
      float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, normalize(vWN))), 3.0);
      vec3 col = base; float win = 0.0;
      float lit = step(r, 0.3 + 0.45 * step(floorR, 0.55)) * ok;
      vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.95, 0.85, 0.7), step(0.6, h21(vec2(id.y, seed))));
      float e = 0.0;
      if (kind > 0.5 && kind < 2.5) {
        // curtain wall: gold (resorts) or blue-grey glass, mullions, rooms lit behind
        win = rect(f, vec2(0.06, 0.18), vec2(0.94, 0.96), fw) * ok;
        vec3 tint = kind < 1.5 ? vec3(1.0, 0.75, 0.38) : vec3(0.55, 0.7, 0.9);
        vec3 glass = mix(base * 0.12, refl * tint * 1.3, 0.35 + 0.65 * fres);
        glass = mix(glass, vec3(0.012), broken);
        col = mix(base * 0.22, glass, mix(win, 0.85 * ok, far));
        e = mix(win * lit * (0.55 + 0.6 * r), 0.3 * ok, far) * on * (1.0 - broken);
        // the crown: a band of LED colour round the top floors
        float crown = smoothstep(H - 9.0, H - 8.5, y) * (1.0 - smoothstep(H - 1.0, H - 0.5, y));
        vec3 cc = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(seed, 1.0)) + uTime * 0.05));
        totalEmissiveRadiance += cc * crown * 2.2 * on;
      } else if (kind > 2.5) {
        win = rect(f, vec2(0.2, 0.25), vec2(0.8, 0.88), fw) * ok;
        vec3 glass = mix(vec3(0.03, 0.035, 0.05), refl * 0.6, 0.45 * fres);
        glass = mix(glass, vec3(0.01), broken);
        col = mix(base * 0.35, glass, win * (1.0 - far));
        col = mix(col, base * 0.25 + glass * 0.3, far * ok * 0.5);
        e = mix(win * lit * (0.5 + 0.6 * r), 0.18 * ok, far) * on * (1.0 - broken) * (kind > 3.5 ? 0.6 : 1.0);
      } else {
        // the podium: a few tall arched windows high up, washed in coloured light from below
        win = rect(f, vec2(0.3, 0.15), vec2(0.7, 0.85), fw) * ok * step(0.5, h21(vec2(id.x, seed)));
        vec3 wash = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(seed, 4.0)) * 0.9 + 0.55));
        float up = exp(-max(y - g0, 0.0) / 9.0);
        col = base * (0.08 + 0.45 * wash * up);
        col = mix(col, vec3(0.04, 0.035, 0.05), win * (1.0 - far));
        e = win * 0.4 * on * (1.0 - broken);
        totalEmissiveRadiance += base * wash * up * 0.22 * on;
        // cornice line at the top, lit
        float cor = smoothstep(H - 1.4, H - 1.2, y) * (1.0 - smoothstep(H - 0.7, H - 0.5, y));
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * cor * 0.8 * on;
      }
      totalEmissiveRadiance += e * warm * 0.95;
      // street level: shop fronts / lobbies, lit warm inside, a dark fascia over them
      if (y < g0 && kind < 3.5) {
        float nb = max(1.0, floor(W / 4.5));
        float bw = W / nb;
        float bay = fract(u / bw);
        float zc = (floor(u / bw) + 0.5) * bw - W * 0.5;
        vec3 bc = sx ? vec3(vWP.x, 1.85, vWP.z - vLoc.z * W + zc) : vec3(vWP.x - vLoc.x * W + zc, 1.85, vWP.z);
        float aB = pullAt(bc);
        float bro = step(${GLASS_K.toFixed(2)}, aB);
        float pane = step(0.35, y) * step(y, g0 - 0.9) * step(0.05, bay) * step(bay, 0.95);
        vec3 inside = mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.55, 0.75), step(0.7, h21(vec2(floor(u / bw), seed)))) * (0.6 + 0.4 * h21(vec2(floor(bay * 7.0), seed)));
        vec3 sf = mix(base * 0.18, mix(vec3(0.03), inside * 0.3, 1.0 - bro), pane);
        sf = mix(sf, vec3(0.03, 0.025, 0.03), step(g0 - 0.9, y));
        col = sf;
        totalEmissiveRadiance += pane * inside * 0.6 * on * (1.0 - bro);
        // a strip of light under the fascia
        totalEmissiveRadiance += vec3(1.2, 0.9, 0.6) * exp(-pow((y - (g0 - 0.85)) / 0.08, 2.0)) * on;
      }
      diffuseColor.rgb = col;
    } else {
      diffuseColor.rgb = base * 0.12 + 0.02 * h21(floor(vWP.xz * 0.5));
      vec2 rq = abs(vLoc.xz) - 0.44;
      float rl = step(70.0, H) * step(0.0, rq.x) * step(0.0, rq.y) * (0.6 + 0.4 * sin(uTime * 3.0 + seed));
      totalEmissiveRadiance += vec3(3.0, 0.15, 0.08) * rl * on;
    }
  }
`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, side: THREE.FrontSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU, PU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position - vec3(0.0, 0.5, 0.0); vON = normal; vS = aS; vCol = aCol;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0); vWP = wpp.xyz; }
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uB; uniform float uGM;
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'strip-facade-v1';
  return m;
}

// ---- the sign atlas: 4 x 8 cells of 512 x 256, neon on dark panels and LED boards ----
const WORDS = ['CASINO', 'SLOTS', 'HOTEL', 'BUFFET', 'LIVE SHOWS', 'POKER', 'OPEN 24 HRS', 'JACKPOT', 'COCKTAILS', 'WEDDING CHAPEL', 'LUCKY 7', 'BLACKJACK', 'STEAKHOUSE', 'NIGHTCLUB', 'GIFTS', 'ROULETTE',
  'CASINO', 'MAGIC SHOW', 'BINGO', 'SPORTSBOOK', 'DINER', 'PIZZA', 'SHOPS', 'HOTEL', 'TONIGHT', 'COMEDY', 'ARCADE', 'KENO', 'POOL PARTY', 'STARS', 'ACES HIGH', 'VACANCY'];
const NEON = ['#ff3ad0', '#3af2ff', '#ffd23a', '#ff5a3a', '#7aff5a', '#b06aff', '#ff9a2a', '#ffffff'];
function makeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 2048;
  const g = cv.getContext('2d');
  for (let i = 0; i < 32; i++) {
    const cx = (i % 4) * 512, cy = Math.floor(i / 4) * 256;
    const led = i % 3 === 1;
    const c1 = NEON[i % NEON.length], c2 = NEON[(i * 3 + 2) % NEON.length];
    g.save();
    g.beginPath(); g.rect(cx, cy, 512, 256); g.clip();
    if (led) {
      const gr = g.createLinearGradient(cx, cy, cx + 512, cy + 256);
      gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(cx, cy, 512, 256);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx, cy + 170, 512, 86);
    } else {
      g.fillStyle = '#0a0710'; g.fillRect(cx, cy, 512, 256);
      // marquee bulbs round the edge on some
      if (i % 2 === 0) {
        g.fillStyle = '#ffe6a0';
        for (let k = 0; k < 26; k++) { g.beginPath(); g.arc(cx + 12 + k * 19.4, cy + 12, 5, 0, 7); g.fill(); g.beginPath(); g.arc(cx + 12 + k * 19.4, cy + 244, 5, 0, 7); g.fill(); }
        for (let k = 1; k < 12; k++) { g.beginPath(); g.arc(cx + 12, cy + 12 + k * 19.3, 5, 0, 7); g.fill(); g.beginPath(); g.arc(cx + 500, cy + 12 + k * 19.3, 5, 0, 7); g.fill(); }
      }
    }
    const word = WORDS[i];
    let fs = Math.min(150, 880 / Math.max(word.length, 3));
    g.font = `${i % 4 === 3 ? 'italic ' : ''}900 ${fs}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tx = cx + 256, ty = cy + (led ? 105 : 128);
    if (led) {
      g.fillStyle = '#ffffff'; g.shadowColor = '#000'; g.shadowBlur = 10; g.fillText(word, tx, ty);
      g.font = `700 40px Georgia, serif`; g.fillText(['TONIGHT', 'NOW PLAYING', 'WIN BIG', 'ALL NIGHT'][i % 4], tx, cy + 212);
    } else {
      g.shadowColor = c1; g.shadowBlur = 28; g.strokeStyle = c1; g.lineWidth = 9; g.strokeText(word, tx, ty);
      g.shadowBlur = 8; g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeText(word, tx, ty);
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return t;
}

export function makeCity(scene) {
  // ---------- buildings ----------
  const n = BLD.length;
  // finely divided so the pull can bend them (the low city needs less)
  const geoHi = new THREE.BoxGeometry(1, 1, 1, 3, 14, 3).translate(0, 0.5, 0);
  const geoLo = new THREE.BoxGeometry(1, 1, 1, 2, 3, 2).translate(0, 0.5, 0);
  const mat = patchPull(facadeMaterial(), { k: 10, kLean: 2, leanMax: 0.4, heat: 1 }, { instK: true });
  const meshes = [];
  for (const [geo, test] of [[geoHi, (b) => b.kind < 4], [geoLo, (b) => b.kind === 4]]) {
    const list = BLD.filter(test);
    const g = geo.clone();
    const aS = new Float32Array(list.length * 4), aCol = new Float32Array(list.length * 3), aPull = new Float32Array(list.length * 2);
    const c = new THREE.Color();
    list.forEach((b, i) => {
      aS.set([b.seed, b.kind, 0, b.h], i * 4);
      c.set(b.col).convertSRGBToLinear();
      aCol.set([c.r, c.g, c.b], i * 3);
      aPull.set(PULL_BLD[b.kind], i * 2);
    });
    g.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    g.setAttribute('aPull', new THREE.InstancedBufferAttribute(aPull, 2));
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((b, i) => mesh.setMatrixAt(i, m4.makeTranslation(b.x, 0, b.z).multiply(new THREE.Matrix4().makeScale(b.w, b.h, b.d))));
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }

  // ---------- signs (one merged mesh: quads into the atlas, divided 4 x 2 so they bend) ----------
  const atlas = makeAtlas();
  const pos = [], uv = [], seed = [], kindA = [], pull = [], idx = [];
  const quad = (cx, cy, cz, w, h, nx, nz, cell, sd, kd, pk) => {
    // the quad faces (nx, 0, nz); its width runs along (−nz, 0, nx)
    const tx = -nz, tz = nx;
    const u0 = (cell % 4) / 4, v0 = 1 - (Math.floor(cell / 4) + 1) / 8;
    const NX = 4, NY = 2, base = pos.length / 3;
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const a = i / NX - 0.5, b = j / NY - 0.5;
      pos.push(cx + tx * a * w + nx * 0.02, cy + b * h, cz + tz * a * w + nz * 0.02);
      uv.push(u0 + (i / NX) * 0.25 * (nx + nz >= 0 ? 1 : 1), v0 + (j / NY) / 8);
      seed.push(sd); kindA.push(kd); pull.push(pk[0], pk[1]);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const q = base + j * (NX + 1) + i;
      idx.push(q, q + 1, q + NX + 2, q, q + NX + 2, q + NX + 1);
    }
  };
  for (const s of SIGNS) quad(s.x, s.y, s.z, s.w, s.h, s.nx, 0, s.tex, s.seed, s.kind, PULL_BLD[0]);
  for (const p of PYLONS) {
    // the board faces both ways along the Strip and toward the street
    const by = p.h - p.bh / 2;
    quad(p.x, by, p.z - 0.6, p.w, p.bh, 0, 1, p.tex, p.seed, 1, [8, 1.5]);
    quad(p.x, by, p.z + 0.6, p.w, p.bh, 0, -1, (p.tex + 5) % 32, p.seed + 0.3, 1, [8, 1.5]);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  sg.setAttribute('aKind', new THREE.Float32BufferAttribute(kindA, 1));
  sg.setAttribute('aPull', new THREE.Float32BufferAttribute(pull, 2));
  sg.setIndex(idx);
  const smat = new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(2.4, 2.4, 2.4), side: THREE.DoubleSide });
  smat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float aSeed; attribute float aKind; varying float vSeed; varying float vKind; varying vec2 vUv2;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vSeed = aSeed; vKind = aKind; vUv2 = uv;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform float uDim; varying float vSeed; varying float vKind; varying vec2 vUv2;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        // neon hums and some signs chase; LED boards cycle their colours
        float fl = 0.88 + 0.12 * sin(uTime * (3.0 + 5.0 * vSeed) + vSeed * 40.0);
        if (vKind > 0.5) {
          vec3 cyc = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vSeed + uTime * 0.12 + vUv2.x * 0.6));
          diffuseColor.rgb *= mix(vec3(1.0), cyc * 1.3, 0.55);
          fl = 0.92 + 0.08 * step(0.5, fract(uTime * 1.3 + vSeed * 7.0));
        }
        diffuseColor.rgb *= fl * uDim;
      }`);
  };
  patchPull(smat, { k: 10, kLean: 3, leanMax: 0.4, heat: 0 }, { instK: true });
  const signs = new THREE.Mesh(sg, smat);
  signs.frustumCulled = false;
  scene.add(signs);

  // ---------- pylon stems ----------
  const stemMat = patchPull(new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.5, metalness: 0.4, emissive: new THREE.Color(0.05, 0.02, 0.05) }), { k: 8, kLean: 1.5, leanMax: 0.4, heat: 1 });
  const stemGeo = new THREE.BoxGeometry(1, 1, 1, 1, 10, 1).translate(0, 0.5, 0);
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, PYLONS.length);
  const m4 = new THREE.Matrix4();
  PYLONS.forEach((p, i) => stems.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z).multiply(new THREE.Matrix4().makeScale(2.2, p.h - p.bh, 1.4))));
  stems.frustumCulled = false;
  scene.add(stems);

  return {
    meshes, signs, stems,
    frame(v) { CU.uTime.value = v; },
  };
}
