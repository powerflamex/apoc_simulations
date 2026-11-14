// The buildings, shop signs, street lamps, traffic signals, street trees (autumn), the building site on the north-west
// corner and the elevated highway. One instanced box per building with its front drawn in the shader (window grids that
// mirror the sky, glass towers, older brick blocks, shop fronts at street level). After dark the windows light up; when
// the grid fails (uPowerP: the share of blocks still powered, uFlick: the whole grid flickering) they go out block by
// block; in the weeks after (uDecay) the shops stand dark and empty.
import * as THREE from 'three';
import { BLD, SIGNS, LAMPS, TREES, SIGNALS, HYDRANT, BIN, BENCH, SITE, FRAME, HWY, AV, CZ, CR } from './layout.js';
import { smooth } from './util.js';

export const CU = {
  uTime: { value: 0 }, uPowerP: { value: 1 }, uFlick: { value: 1 }, uDecay: { value: 0 }, uNight: { value: 0 },
  uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 2500 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uPowerP; uniform float uFlick; uniform float uDecay; uniform float uNight;
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD; uniform vec3 uSunCol;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += uSunCol * 1.6 * pow(max(dot(normalize(r), uSun), 0.0), 90.0) * step(0.0, uSun.y + 0.02);
  return mix(c, vec3(0.16, 0.15, 0.15) * (1.0 - 0.8 * uNight), smoothstep(0.0, -0.15, r.y));
}
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
    float FH = kind > 1.5 && kind < 2.5 ? 3.7 : 3.5;
    float g0 = kind > 1.5 && kind < 2.5 ? 5.0 : 5.6;
    float colW = kind > 0.5 && kind < 1.5 || kind > 3.5 ? 1.7 : kind > 1.5 && kind < 2.5 ? 3.1 : 2.5 + 0.6 * h21(vec2(seed, 2.0));
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 1.5);
    // which blocks still have power (each building its own share), and which windows are lit tonight
    float powered = step(h21(vec2(seed, 9.1)), uPowerP) * uFlick;
    float litW = step(h21(id * 1.37 + vec2(seed * 0.71, face)), mix(0.62, 0.42, step(3.5, kind))) * powered * uNight;
    vec3 lamp = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.92, 1.0), step(0.7, h21(id + seed))) * (0.7 + 0.6 * h21(id * 3.1 + seed));
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      vec3 N = normalize(vWN);
      vec3 refl = skyRefl(reflect(V, N));
      float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 col = base; float win = 0.0;
      vec3 room = vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * h21(id * 2.1 + seed));
      if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
        win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
        vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
        col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
        totalEmissiveRadiance += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9 * (1.0 - 0.85 * uNight);
      } else if (kind > 1.5 && kind < 2.5) {
        win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
        vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
        float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
        col = mix(col, base * 1.12, course * (1.0 - far));
        col = mix(col, base * 0.9, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
        totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far) * (1.0 - 0.85 * uNight);
      } else {
        win = rect(f, vec2(0.16, 0.22), vec2(0.84, 0.86), fw) * ok;
        vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.55);
        col = mix(col, base * 0.88, step(f.y, 0.2) * ok * (1.0 - far));
        totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far) * (1.0 - 0.85 * uNight);
      }
      // the lit windows after dark
      float wk = mix(win, 0.55 * ok, far);
      totalEmissiveRadiance += lamp * litW * wk * 1.3;
      // street level: shop fronts (lit glass, a fascia band); dark and empty in the weeks after
      if (y < g0 && kind < 2.5) {
        float nb = max(1.0, floor(W / 5.5));
        float bw = W / nb;
        float bay = fract(u / bw);
        float bid = floor(u / bw);
        float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(0.6, 0.48, 0.36), vec3(0.42, 0.47, 0.52), step(0.55, h21(vec2(bid, seed)))) * (0.5 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
        // shelves and goods inside (stripes), gone when the shops are emptied
        float goods = step(0.5, fract(y * 1.6)) * step(0.1, fract(bay * 9.0)) * (1.0 - uDecay);
        inside = mix(inside, inside * vec3(1.3, 0.9, 0.7) * (0.6 + 0.8 * h21(vec2(floor(bay * 9.0), bid))), goods * 0.6);
        vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
        col = mix(base * 0.75, shopGlass, pane);
        float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
        vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.4);
        col = mix(col, bc, band * step(0.4, h21(vec2(bid + 7.0, seed))));
        // (a metal shutter pulled down over the emptied ones)
        float shut = step(h21(vec2(bid, seed + 3.0)), 0.6) * uDecay;
        col = mix(col, vec3(0.32, 0.32, 0.33) * (0.85 + 0.15 * step(0.5, fract(y * 6.0))), pane * shut);
        float shopLit = powered * (1.0 - uDecay);
        totalEmissiveRadiance += pane * inside * (0.3 + 1.4 * uNight) * shopLit * (1.0 - shut);
        win = max(win, pane);
      }
      diffuseColor.rgb = col * (1.0 + 0.12 * uDecay * (h21(floor(vWP.xz * 0.3)) - 1.0));
    } else {
      diffuseColor.rgb = base * 0.5 + 0.04 * h21(floor(vWP.xz * 0.5));
      // red aircraft lights on the tall roofs
      if (H > 90.0) totalEmissiveRadiance += vec3(3.0, 0.1, 0.05) * uNight * rect(fract(vWP.xz * 0.12), vec2(0.45), vec2(0.55), vec2(0.02)) * step(0.5, fract(uTime * 0.7 + seed * 0.1));
    }
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
        vLoc = position - vec3(0.0, 0.5, 0.0); vON = normal; vS = aS; vCol = aCol;
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
  m.customProgramCacheKey = () => 'men-facade-v1';
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

export function makeCity(scene, ctx) {
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  // ---- buildings (the finished tower on the building site is the last one: shown only in 2046) ----
  const ALL = BLD;
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 24, 1).translate(0, 0.5, 0);
  const n = ALL.length;
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  ALL.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
    mesh.setMatrixAt(i, m4);
    aS.set([(i * 0.6180339) % 1, b.kind, 0, b.h], i * 4);
    col.set(b.col).convertSRGBToLinear();
    aCol.set([col.r, col.g, col.b], i * 3);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);

  // ---- shop signs (lit after dark while there's power) ----
  const signTex = makeSignAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.25 });
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  const aCell = new Float32Array(SIGNS.length);
  SIGNS.forEach((s, i) => {
    m4.makeRotationY(s.yaw).scale(sc.set(s.w, s.h, 1)).setPosition(s.x, s.y, s.z);
    signs.setMatrixAt(i, m4);
    aCell[i] = s.cell;
  });
  signGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 1));
  signMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((mod(aCell, 2.0) + uv.x) / 2.0, 1.0 - (floor(aCell / 2.0) + 1.0 - uv.y) / 4.0);
        vEmissiveMapUv = vMapUv;`);
  };
  signMat.customProgramCacheKey = () => 'men-sign-v1';
  signs.frustumCulled = false;
  scene.add(signs);

  // ---- street lamps: pole, arm over the road, head (its glow is added in main.js) ----
  const poleMat = ctx.plainMat(0x2e3136, 0.55, { metalness: 0.4 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 1, 8).translate(0, 0.5, 0), poleMat, LAMPS.length);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.1), poleMat, LAMPS.length);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.34), headMat, LAMPS.length);
  LAMP_HEADS.length = 0;
  LAMPS.forEach((l, k) => {
    poles.setMatrixAt(k, m4.makeScale(1, 9, 1).setPosition(l.x, 0, l.z));
    const hx = l.axis === 'x' ? l.x + l.dir * 2.4 : l.x, hz = l.axis === 'z' ? l.z + l.dir * 2.4 : l.z;
    const ax = l.axis === 'x' ? l.x + l.dir * 1.2 : l.x, az = l.axis === 'z' ? l.z + l.dir * 1.2 : l.z;
    e.set(0, l.axis === 'x' ? 0 : Math.PI / 2, 0); q.setFromEuler(e);
    arms.setMatrixAt(k, m4.compose(p.set(ax, 8.85, az), q, sc.set(2.4, 1, 1)));
    heads.setMatrixAt(k, m4.compose(p.set(hx, 8.75, hz), q, sc.set(1, 1, 1)));
    LAMP_HEADS.push({ x: hx, y: 8.6, z: hz });
  });
  for (const m of [poles, arms, heads]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }

  // ---- traffic signals: a pole, a mast arm over the road, two signal heads on it (the lamps' glows in main.js) ----
  const sigPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 8).translate(0, 0.5, 0), poleMat, SIGNALS.length);
  const sigArm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 0.14), poleMat, SIGNALS.length);
  const sigHead = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 1.05, 0.3), ctx.plainMat(0x1d1f14, 0.6), SIGNALS.length * 3);
  SIG_LAMPS.length = 0;
  SIGNALS.forEach((s, i) => {
    sigPole.setMatrixAt(i, m4.makeScale(1, 6.6, 1).setPosition(s.x, 0, s.z));
    const L = 9.5;
    if (s.arm === 'x') sigArm.setMatrixAt(i, m4.makeScale(L, 1, 1).setPosition(s.x + s.dir * L / 2, 6.3, s.z));
    else sigArm.setMatrixAt(i, m4.makeRotationY(Math.PI / 2).scale(sc.set(L, 1, 1)).setPosition(s.x, 6.3, s.z + s.dir * L / 2));
    // heads: two on the arm (over the lanes) and one on the pole
    [3.0, 6.8, 0].forEach((d, k) => {
      const hx = s.arm === 'x' ? s.x + s.dir * d : s.x + (k === 2 ? 0.35 * s.face : 0), hz = s.arm === 'z' ? s.z + s.dir * d : s.z + (k === 2 ? 0.35 * s.face : 0);
      const hy = k === 2 ? 3.4 : 5.6;
      sigHead.setMatrixAt(i * 3 + k, m4.makeRotationY(s.arm === 'x' ? 0 : Math.PI / 2).setPosition(hx, hy, hz));
      // the lamps face the traffic they control: avenue lights face along z, cross street lights along x
      // (the lamps face the traffic they control)
      const nx = s.group === 'cr' ? (s.x < 0 ? -0.17 : 0.17) : 0, nz = s.group === 'av' ? (s.z > CZ ? 0.17 : -0.17) : 0;
      SIG_LAMPS.push({ x: hx + nx, z: hz + nz, y: hy, group: s.group });
    });
  });
  for (const m of [sigPole, sigArm, sigHead]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }

  // ---- street trees in late October: a trunk and a lumpy crown of yellow and orange ----
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 7).translate(0, 0.5, 0), ctx.plainMat(0x4a3a2c, 0.95), TREES.length);
  const crownGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    const a = crownGeo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      const k = 1 + 0.18 * Math.sin(x * 5.1 + y * 3.3) * Math.sin(z * 4.7 + x * 2.1) + 0.1 * Math.sin(y * 9 + z * 7);
      a.setXYZ(i, x * k, y * k * 0.85, z * k);
    }
    crownGeo.computeVertexNormals();
  }
  const crowns = new THREE.InstancedMesh(crownGeo, ctx.plainMat(0xffffff, 0.9), TREES.length * 2);
  const AUT = [0xd8a030, 0xe0b040, 0xc8702a, 0xb85a28, 0xd89838, 0x9a8a30, 0xe8c050];
  TREES.forEach((t, i) => {
    trunks.setMatrixAt(i, m4.makeScale(1, t.h, 1).setPosition(t.x, 0, t.z));
    for (let k = 0; k < 2; k++) {
      const r = t.r * (k ? 0.75 : 1);
      crowns.setMatrixAt(i * 2 + k, m4.makeScale(r, r * 0.9, r).setPosition(t.x + (k ? 0.6 : 0) * Math.cos(t.seed * 9), t.h + (k ? 0.9 : 0), t.z + (k ? 0.6 : 0) * Math.sin(t.seed * 9)));
      crowns.setColorAt(i * 2 + k, col.set(AUT[Math.floor(((t.seed * 7 + k * 0.37) % 1) * AUT.length)]));
    }
  });
  for (const m of [trunks, crowns]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // ---- a fire hydrant and a litter bin by you ----
  {
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.72, 10).translate(0, 0.36, 0), ctx.plainMat(0xc8a018, 0.5));
    hyd.position.set(HYDRANT.x, 0, HYDRANT.z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ctx.plainMat(0xc8a018, 0.5));
    cap.position.set(HYDRANT.x, 0.72, HYDRANT.z);
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8).rotateZ(Math.PI / 2), ctx.plainMat(0xc8a018, 0.5));
    nz.position.set(HYDRANT.x, 0.5, HYDRANT.z);
    const bench = new THREE.Group();
    const wood = ctx.plainMat(0x6a4a30, 0.8), iron = ctx.plainMat(0x22252a, 0.5, { metalness: 0.4 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.8).translate(0, 0.45, 0), wood);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 1.8).translate(0.25, 0.72, 0), wood);
    const legs = [-0.75, 0.75].map((z) => new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.45, 0.06).translate(0, 0.225, z), iron));
    bench.add(seat, back, ...legs);
    bench.position.set(BENCH.x, 0, BENCH.z);
    bench.traverse((o) => { if (o.isMesh) ctx.shadowy(o); });
    scene.add(bench);
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 12).translate(0, 0.475, 0), ctx.plainMat(0x2a4a3a, 0.6));
    bin.position.set(BIN.x, 0, BIN.z);
    for (const m of [hyd, cap, nz, bin]) { ctx.shadowy(m); scene.add(m); }
  }

  // ---- the building site: a plywood hoarding round the lot, a concrete frame ten floors high (slabs and columns) ----
  const site = new THREE.Group();
  {
    const conc = ctx.plainMat(0xb4ada2, 0.9), ply = ctx.plainMat(0x2f5a8a, 0.8);
    const hx = (SITE.x0 + SITE.x1) / 2, hz = (SITE.z0 + SITE.z1) / 2;
    const fence = [
      [new THREE.BoxGeometry(0.1, 2.5, SITE.z1 - SITE.z0), SITE.x1, hz],
      [new THREE.BoxGeometry(SITE.x1 - SITE.x0, 2.5, 0.1), hx, SITE.z1],
    ];
    for (const [g, x, z] of fence) { const m = new THREE.Mesh(g.translate(0, 1.25, 0), ply); m.position.set(x, 0, z); site.add(m); }
    const fw = FRAME.x1 - FRAME.x0, fd = FRAME.z1 - FRAME.z0, cx = (FRAME.x0 + FRAME.x1) / 2, cz = (FRAME.z0 + FRAME.z1) / 2;
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(fw, 0.3, fd), conc, FRAME.floors);
    for (let k = 0; k < FRAME.floors; k++) slabs.setMatrixAt(k, m4.makeTranslation(cx, (k + 1) * FRAME.fh, cz));
    const cols = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) cols.push([FRAME.x0 + 0.4 + i * (fw - 0.8) / 4, FRAME.z0 + 0.4 + j * (fd - 0.8) / 4]);
    const colM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, FRAME.fh, 0.6).translate(0, FRAME.fh / 2, 0), conc, cols.length * FRAME.floors);
    cols.forEach(([x, z], i) => { for (let k = 0; k < FRAME.floors; k++) colM.setMatrixAt(i * FRAME.floors + k, m4.makeTranslation(x, k * FRAME.fh + 0.15, z)); });
    // some glass already on the lower floors; orange safety netting on the edges of the top ones
    const glass = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.1, FRAME.fh * 4, fd + 0.1).translate(cx, FRAME.fh * 2 + 0.15, cz), new THREE.MeshStandardMaterial({ color: 0x48607a, roughness: 0.15, metalness: 0.5 }));
    const net = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.6, 1.2, fd + 0.6).translate(cx, FRAME.fh * FRAME.floors + 0.9, cz), new THREE.MeshStandardMaterial({ color: 0xe86a1a, roughness: 0.9, transparent: true, opacity: 0.85 }));
    for (const m of [slabs, colM, glass, net]) { ctx.shadowy(m); site.add(m); }
  }
  scene.add(site);

  // ---- the elevated highway: a deck on concrete piers, crash barriers ----
  {
    const conc = ctx.plainMat(0x9c968c, 0.9);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1400, HWY.t, HWY.w).translate(0, HWY.y - HWY.t / 2, HWY.z), conc);
    const rails = [-1, 1].map((sd) => new THREE.Mesh(new THREE.BoxGeometry(1400, 1.0, 0.35).translate(0, HWY.y + 0.5, HWY.z + sd * (HWY.w / 2 - 0.18)), conc));
    const xs = [];
    for (let x = -600; x <= 600; x += 32) if (Math.abs(x) > AV + 2) xs.push(x);
    xs.push(-AV - 1.2, AV + 1.2);
    const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, HWY.y - HWY.t, 1.6).translate(0, (HWY.y - HWY.t) / 2, 0), conc, xs.length * 2);
    xs.forEach((x, i) => { for (const k of [0, 1]) piers.setMatrixAt(i * 2 + k, m4.makeTranslation(x, 0, HWY.z + (k ? 4.5 : -4.5))); });
    for (const m of [deck, ...rails, piers]) { ctx.shadowy(m); scene.add(m); }
    // lane lines on the deck: white dashes between the lanes, a double yellow line down the middle
    const dashes = [];
    for (let x = -400; x < 400; x += 12) for (const z of [HWY.z - 3.9, HWY.z + 3.9]) dashes.push([x, z, 0]);
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(4.0, 0.02, 0.15), ctx.plainMat(0xe8e6e0, 0.7), dashes.length + 2);
    dashes.forEach(([x, z], i) => dm.setMatrixAt(i, m4.makeTranslation(x, HWY.y + 0.01, z)));
    const ym = ctx.plainMat(0xd8a020, 0.7);
    for (const dz of [-0.18, 0.18]) { const yl = new THREE.Mesh(new THREE.BoxGeometry(1400, 0.02, 0.12), ym); yl.position.set(0, HWY.y + 0.01, HWY.z + dz); scene.add(yl); }
    dm.count = dashes.length; dm.frustumCulled = false; dm.receiveShadow = true;
    scene.add(dm);
  }

  let lastLeaf = -1, lastGreen = -1;
  const BARE = new THREE.Color(0x4a3a2c), GREEN = [new THREE.Color(0x4a7a2a), new THREE.Color(0x5a8a30), new THREE.Color(0x3a6a28)];
  return {
    mesh, signMat, headMat, site,
    frame(v, s) {
      // the seasons on the street trees: autumn colours, the leaves gone by early November, bare all winter, new
      // leaves in late April, full green by summer (day 0 = September 23)
      const d = s.day;
      const leaf = 1 - smooth(32, 48, d) + smooth(205, 228, d);
      const green = smooth(205, 232, d);
      if (Math.abs(leaf - lastLeaf) > 0.004 || Math.abs(green - lastGreen) > 0.004) {
        lastLeaf = leaf; lastGreen = green;
        TREES.forEach((t, i) => {
          for (let k = 0; k < 2; k++) {
            const r = t.r * (k ? 0.75 : 1) * (0.3 + 0.7 * leaf);
            crowns.setMatrixAt(i * 2 + k, m4.makeScale(r, r * 0.9, r).setPosition(t.x + (k ? 0.6 : 0) * Math.cos(t.seed * 9), t.h + (k ? 0.9 : 0), t.z + (k ? 0.6 : 0) * Math.sin(t.seed * 9)));
            col.set(AUT[Math.floor(((t.seed * 7 + k * 0.37) % 1) * AUT.length)]);
            if (leaf < 0.999 && green < 0.01) col.lerp(BARE, 1 - leaf);
            col.lerp(GREEN[(i + k) % 3], green);
            crowns.setColorAt(i * 2 + k, col);
          }
        });
        crowns.instanceMatrix.needsUpdate = true; crowns.instanceColor.needsUpdate = true;
      }
      const lit = s.power.p >= 0.5 ? s.power.f : 0;
      signMat.emissiveIntensity = (0.2 + 1.1 * CU.uNight.value) * lit * (1 - s.decay);
      headMat.emissiveIntensity = 3.5 * CU.uNight.value * lit;
    },
  };
}
export const LAMP_HEADS = [], SIG_LAMPS = [];
