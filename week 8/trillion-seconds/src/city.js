// The buildings, shop signs, street lamps and traffic signals, through 31,700 years. One instanced box per building,
// its fronts drawn in the shader (window grids that mirror the sky, glass towers, old brick blocks, shop fronts at
// street level, the new city's white towers with ribbon windows and gardens). Each building lives its planned life
// (layout.js): today's building; torn down and rebuilt (a time-lapse: it drops floor by floor, the new one rises in
// a concrete frame); the city empties (windows go dark, glass breaks, vines climb); it falls in, in chunks, its top
// ragged and open; the ruin sinks to a mossy mound under the forest.
import * as THREE from 'three';
import { BLD, SIGNS, LAMPS, SIGNALS, CZ, CR } from './layout.js';
import { vOfYears } from './timeline.js';
import { smooth, clamp, lerp, rng } from './util.js';

export const CU = {
  uTime: { value: 0 }, uSnow: { value: 0 }, uNight: { value: 0 },
  uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 2500 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uSnow; uniform float uNight;
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD; uniform vec3 uSunCol;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec4 vR;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += uSunCol * 1.6 * pow(max(dot(normalize(r), uSun), 0.0), 90.0) * step(0.0, uSun.y + 0.02);
  return mix(c, vec3(0.16, 0.15, 0.15), smoothstep(0.0, -0.15, r.y));
}
`;

// (vR: x = dark/broken 0..1, y = vines 0..1, z = ragged top (m), w = under construction)
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
    float dark = vR.x, vine = vR.y, jag = vR.z, cons = vR.w;
    // a ragged, open top once it falls in
    if (jag > 0.01) {
      float top = vSc.y - jag * (0.25 + 0.75 * n21(vec2(u * 0.22 + seed, 3.0))) - jag * 0.5 * h21(vec2(floor(u / 2.5), seed));
      if (y > top) discard;
    }
    bool kWall = abs(vON.y) < 0.5;
    if (!gl_FrontFacing) {
      // inside a shell: dark concrete, moss over it with time
      vec3 c = base * 0.25 + vec3(0.03);
      c = mix(c, vec3(0.08, 0.13, 0.05), vine * 0.8);
      diffuseColor.rgb = c;
    } else if (kWall) {
      float FH = kind > 1.5 && kind < 2.5 ? 3.7 : kind > 4.5 ? 3.9 : 3.5;
      float g0 = kind > 1.5 && kind < 2.5 ? 5.0 : 5.6;
      float colW = kind > 0.5 && kind < 1.5 || kind > 3.5 ? 1.7 : kind > 1.5 && kind < 2.5 ? 3.1 : 2.5 + 0.6 * h21(vec2(seed, 2.0));
      float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
      vec2 g = vec2(u / colW, (y - g0) / FH);
      vec2 id = floor(g), f = fract(g);
      vec2 fw = max(fwidth(g), vec2(1e-4));
      float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
      float ok = step(0.0, g.y) * step(y, H - 1.5);
      vec3 N = normalize(vWN);
      vec3 refl = skyRefl(reflect(V, N));
      float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 col = base; float win = 0.0;
      vec3 room = vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * h21(id * 2.1 + seed));
      // broken panes: black holes (more of them as it decays)
      float broken = step(h21(id * 1.7 + vec2(seed, face)), dark * 0.95);
      vec3 hole = vec3(0.02, 0.02, 0.018);
      float glassy = 1.0;
      if (kind > 4.5) {
        // the new city: white panels, continuous ribbon windows, a garden terrace every fourth floor
        float band = rect(vec2(0.5, f.y), vec2(0.0, 0.3), vec2(1.0, 0.92), fw) * ok;
        float garden = step(3.0, mod(id.y, 4.0)) * ok;
        win = band * (1.0 - garden);
        vec3 glass = mix(vec3(0.12, 0.16, 0.18), refl * vec3(0.85, 0.95, 1.0), 0.45 + 0.5 * fres);
        col = mix(base, glass, mix(win, 0.55 * ok, far));
        vec3 green = mix(vec3(0.16, 0.36, 0.1), vec3(0.3, 0.5, 0.16), n21(vec2(u * 0.8, y * 1.3) + seed));
        float leaves = garden * step(0.32, f.y) * (0.65 + 0.35 * n21(vec2(u * 2.3, seed)));
        col = mix(col, green, leaves * (1.0 - dark * 0.3));
        totalEmissiveRadiance += refl * 0.25 * fres * win * (1.0 - far) * (1.0 - dark);
        glassy = win;
      } else if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
        win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
        vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
        col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
        totalEmissiveRadiance += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9 * (1.0 - dark * 0.8);
        glassy = mix(win, 0.9 * ok, far);
      } else if (kind > 1.5 && kind < 2.5) {
        win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
        vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
        float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
        col = mix(col, base * 1.12, course * (1.0 - far));
        col = mix(col, base * 0.9, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
        totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far) * (1.0 - dark);
        glassy = win * (1.0 - far);
      } else {
        win = rect(f, vec2(0.16, 0.22), vec2(0.84, 0.86), fw) * ok;
        vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.55);
        col = mix(col, base * 0.88, step(f.y, 0.2) * ok * (1.0 - far));
        totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far) * (1.0 - dark);
        glassy = win * (1.0 - far);
      }
      // the dark, empty years: broken windows as black holes, grime streaks down the walls
      col = mix(col, hole, glassy * broken);
      totalEmissiveRadiance *= 1.0 - broken * glassy;
      float streak = n21(vec2(u * 1.3 + seed, y * 0.05)) * smoothstep(0.0, 1.0, dark);
      col *= 1.0 - 0.35 * streak * dark;
      // street level: shop fronts (lit glass, a fascia band); the new city has glass lobbies
      if (y < g0 && kind < 2.5) {
        float nb = max(1.0, floor(W / 5.5));
        float bw = W / nb;
        float bay = fract(u / bw);
        float bid = floor(u / bw);
        float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(0.6, 0.48, 0.36), vec3(0.42, 0.47, 0.52), step(0.55, h21(vec2(bid, seed)))) * (0.5 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
        float goods = step(0.5, fract(y * 1.6)) * step(0.1, fract(bay * 9.0));
        inside = mix(inside, inside * vec3(1.3, 0.9, 0.7) * (0.6 + 0.8 * h21(vec2(floor(bay * 9.0), bid))), goods * 0.6);
        vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
        shopGlass = mix(shopGlass, hole, dark);
        col = mix(base * 0.75, shopGlass, pane);
        float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
        vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.4);
        col = mix(col, bc * (1.0 - 0.6 * dark), band * step(0.4, h21(vec2(bid + 7.0, seed))));
        totalEmissiveRadiance += pane * inside * 0.3 * (1.0 - dark);
      } else if (y < g0 && kind > 4.5) {
        float pane = step(0.2, y) * step(y, g0 - 0.6);
        col = mix(col, mix(vec3(0.5, 0.55, 0.55) * 0.5, refl * 0.7, 0.5 * fres + 0.2), pane * (1.0 - dark));
        col = mix(col, hole, pane * dark);
      }
      // under construction: the top few floors are a bare concrete frame
      if (cons > 0.5) {
        float fr = step(vSc.y - 7.0, y);
        float slab = step(0.82, fract(y / 3.6)) + step(0.9, fract(u / 4.0));
        col = mix(col, mix(vec3(0.06), vec3(0.62, 0.6, 0.56), clamp(slab, 0.0, 1.0)), fr);
        totalEmissiveRadiance *= 1.0 - fr;
      }
      // vines and moss climb from the ground (patchy, higher with time)
      float vn = n21(vec2(u * 0.35 + seed * 7.0, y * 0.12)) * 0.6 + n21(vec2(u * 1.7, y * 0.9) + seed) * 0.4;
      float reach = vine * (3.0 + 0.55 * vSc.y) * (0.4 + vn);
      float cover = smoothstep(reach + 1.0, reach - 2.0, y) * smoothstep(0.0, 0.15, vine) * smoothstep(0.3, 0.55, vn + 0.25 * vine);
      vec3 ivy = mix(vec3(0.07, 0.15, 0.04), vec3(0.2, 0.32, 0.09), n21(vec2(u * 3.1, y * 3.3)));
      col = mix(col, ivy, cover * 0.95);
      totalEmissiveRadiance *= 1.0 - cover;
      diffuseColor.rgb = col;
    } else {
      // roofs: gravel and plant, snow in winter, moss later
      vec3 c = base * 0.5 + 0.04 * h21(floor(vWP.xz * 0.5));
      c = mix(c, vec3(0.9, 0.92, 0.95), uSnow * 0.9);
      c = mix(c, vec3(0.12, 0.2, 0.07), vine);
      diffuseColor.rgb = c;
    }
  }
`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol; attribute vec4 aR;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec4 vR;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position - vec3(0.0, 0.5, 0.0); vON = normal; vS = aS; vCol = aCol; vR = aR;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wpp.xyz; }
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vWP - cameraPosition) / uHazeD));`);
  };
  m.customProgramCacheKey = () => 'ts-facade-v1';
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
  ['GROCERY', '#2a7a3a', '#ffffff'], ['PIZZA', '#d8c030', '#201010'], ['BANK', '#1a2a4a', '#e8d080'], ['SHOES', '#7a1a4a', '#ffffff']];
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

const lsm = (a, b, y) => smooth(Math.log10(a), Math.log10(b), Math.log10(Math.max(y, 1e-9)));
// a fall in chunks: k (0..1) quantized to n steps, each dropping in ~1/12 of a step
const chunks = (k, n, seed) => { const x = k * n + seed; const i = Math.floor(x); return clamp((i + smooth(0.92, 1, x - i) - seed) / n); };

// one building's state at video time v (Y years in)
export function buildingAt(b, v, Y) {
  let h = b.hA, kind = b.kindA, col = b.colA, cons = 0, gen = 0;
  if (b.yNew) {
    // a new tower on an empty lot: it rises over half a second, the top floors a concrete frame
    const k = smooth(b.vNew - 0.55, b.vNew, v);
    h = b.hA * k; cons = k > 0 && k < 1 ? 1 : 0;
  }
  // torn down floor by floor, then the new one rises
  if (v > b.vSwap - 0.4) {
    if (v < b.vSwap) { h *= 1 - chunks(smooth(b.vSwap - 0.4, b.vSwap - 0.02, v), 4, 0.3); }
    else {
      const k = smooth(b.vSwap, b.vSwap + 0.5, v);
      h = b.hB * k; kind = b.kindB; col = b.colB; cons = k < 1 ? 1 : 0; gen = 1;
    }
  }
  const dark = lsm(b.yAband, b.yAband * 1.7, Y);
  // falling in: in chunks, down to what's left standing; then it sinks to a mound
  let jag = 0;
  if (Y > b.yFall) {
    const k = lsm(b.yFall, b.yFall * 5, Y);
    const kq = chunks(k, 5, b.seed);
    h *= 1 - kq * (1 - b.ruin);
    jag = Math.min(h * 0.35, 9) * smooth(0, 0.08, k);
    const k2 = lsm(7000, 30000, Y);
    h = lerp(h, b.mound, k2);
    jag *= 1 - k2 * 0.7;
    if (b.far) h *= 1 - lsm(6000, 26000, Y) * 0.85;
  }
  return { h, kind, col, cons, dark, jag, gen };
}

export function makeCity(scene, ctx) {
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const b of BLD) { b.vSwap = vOfYears(b.ySwap); if (b.yNew) b.vNew = vOfYears(b.yNew); }
  // ---- buildings ----
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 24, 1).translate(0, 0.5, 0);
  const n = BLD.length;
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), aCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), aR = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  for (const a of [aS, aCol, aR]) a.setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  geo.setAttribute('aS', aS); geo.setAttribute('aCol', aCol); geo.setAttribute('aR', aR);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---- shop signs ----
  const signTex = makeSignAtlas();
  const signMat = ctx.hazedMat(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.18 }));
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  const aCell = new Float32Array(SIGNS.length);
  SIGNS.forEach((s, i) => { aCell[i] = s.cell; });
  signGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 1));
  const prevSign = signMat.onBeforeCompile;
  signMat.onBeforeCompile = (shader, r) => {
    prevSign(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((mod(aCell, 2.0) + uv.x) / 2.0, 1.0 - (floor(aCell / 2.0) + 1.0 - uv.y) / 4.0);
        vEmissiveMapUv = vMapUv;`);
  };
  signs.frustumCulled = false;
  scene.add(signs);

  // ---- street lamps and traffic signals (they lean and fall in the empty centuries) ----
  const poleMat = ctx.plainMat(0x2e3136, 0.55, { metalness: 0.4 });
  const lampGeo = (() => {
    const g = [new THREE.CylinderGeometry(0.09, 0.13, 9, 8).translate(0, 4.5, 0), new THREE.BoxGeometry(0.1, 0.1, 2.4).translate(0, 8.85, 1.2), new THREE.BoxGeometry(0.34, 0.18, 0.7).translate(0, 8.75, 2.4)];
    return mergeAll(g);
  })();
  const sigGeo = (() => {
    const g = [new THREE.CylinderGeometry(0.12, 0.16, 6.6, 8).translate(0, 3.3, 0), new THREE.BoxGeometry(0.14, 0.14, 9.5).translate(0, 6.3, 4.75),
      new THREE.BoxGeometry(0.3, 1.05, 0.36).translate(0, 5.6, 3.0), new THREE.BoxGeometry(0.3, 1.05, 0.36).translate(0, 5.6, 6.8), new THREE.BoxGeometry(0.3, 1.05, 0.36).translate(0.35, 3.4, 0)];
    return mergeAll(g);
  })();
  const lamps = new THREE.InstancedMesh(lampGeo, poleMat, LAMPS.length);
  const sigs = new THREE.InstancedMesh(sigGeo, poleMat, SIGNALS.length);
  for (const m of [lamps, sigs]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const FURN = [...LAMPS.map((l, i) => ({ mesh: lamps, i, x: l.x, z: l.z, yaw: l.axis === 'x' ? (l.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (l.dir > 0 ? 0 : Math.PI) })),
    ...SIGNALS.map((s, i) => ({ mesh: sigs, i, x: s.x, z: s.z, yaw: s.arm === 'x' ? (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (s.dir > 0 ? 0 : Math.PI) }))];
  {
    const R = rng(515);
    for (const f of FURN) { f.yLean = Math.exp(Math.log(450) + R() * Math.log(1400 / 450)); f.yDown = f.yLean * (1.3 + R() * 0.8); f.yGone = f.yDown * (1.8 + R() * 0.6); f.tilt = R() * Math.PI * 2; }
  }

  let lastSnow = -1;
  return {
    mesh,
    frame(v, s) {
      const Y = s.Y;
      for (let i = 0; i < n; i++) {
        const b = BLD[i];
        const st = buildingAt(b, v, Y);
        if (st.h < 0.05) { mesh.setMatrixAt(i, hide); continue; }
        m4.makeScale(b.w, st.h, b.d).setPosition(b.x, -0.3, b.z);
        mesh.setMatrixAt(i, m4);
        aS.setXYZW(i, (i * 0.6180339) % 1, st.kind, 0, st.gen ? b.hB : b.hA);
        col.set(st.col).convertSRGBToLinear();
        aCol.setXYZ(i, col.r, col.g, col.b);
        aR.setXYZW(i, st.dark, s.vine * (0.7 + 0.6 * b.seed), st.jag, st.cons);
        b.st = st;
      }
      mesh.instanceMatrix.needsUpdate = true; aS.needsUpdate = true; aCol.needsUpdate = true; aR.needsUpdate = true;
      // shop signs: on their building while it stands (today's buildings only), faded as the city empties
      SIGNS.forEach((sg, i) => {
        const st = BLD[sg.b].st;
        const on = st && st.gen === 0 && st.h > sg.y + 1;
        if (!on) { signs.setMatrixAt(i, hide); return; }
        m4.makeRotationY(sg.yaw).scale(sc.set(sg.w, sg.h, 1)).setPosition(sg.x, sg.y, sg.z);
        signs.setMatrixAt(i, m4);
      });
      signs.instanceMatrix.needsUpdate = true;
      // lamps and signals: lean, fall, rust away
      for (const f of FURN) {
        if (Y > f.yGone) { f.mesh.setMatrixAt(f.i, hide); continue; }
        const lean = lsm(f.yLean, f.yDown, Y);
        const ang = lean < 0.98 ? lean * 0.25 : 0.25 + smooth(0.98, 1, lean) * 1.3;
        const down = Y > f.yDown ? Math.min(1.45, 0.25 + 1.2) : ang;
        e.set(0, f.yaw, 0); q.setFromEuler(e);
        const qt = new THREE.Quaternion().setFromAxisAngle(p.set(Math.cos(f.tilt), 0, Math.sin(f.tilt)), down);
        q.premultiply(qt);
        const sink = lsm(f.yDown, f.yGone, Y) * 0.5;
        m4.compose(p.set(f.x, -sink, f.z), q, sc.set(1, 1, 1));
        f.mesh.setMatrixAt(f.i, m4);
      }
      lamps.instanceMatrix.needsUpdate = true; sigs.instanceMatrix.needsUpdate = true;
      signMat.emissiveIntensity = 0.18;
      CU.uSnow.value = s.season.snow;
    },
  };
}

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function mergeAll(gs) { return mergeGeometries(gs.map((g) => g.toNonIndexed())); }
