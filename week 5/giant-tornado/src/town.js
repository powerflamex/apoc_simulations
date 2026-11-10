// The town: the Main Street fronts (instanced boxes, their look drawn in the shader: brick courses, upper windows
// with trim, a cornice, a storefront with a sign band, lit shop windows; the bank in stone, the theatre), the houses
// behind them, the farms; and everything that can tear loose, all run by one "flyers" system: a thing is a pivot with
// a release time and parts round it (boxes, cylinders, cones, tree crowns, textured signs). Before its time it rests
// (and flutters in the wind); after, flight() carries it off toward the wall, tumbling, until it is swallowed.
// Roofs, awnings, signs, flags, trash cans, benches, lamp posts, telephone poles, trees, the water tower, the grain
// elevator, the church steeple, and the far buildings' pieces all go this way, the far ones first.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLD, HOUSES, TREES, LAMPS, POLES, TRASH, BENCHES, BOXES, SIGNAL, FLAGS, FAR, FX, ROAD_X, CROSS, TOWN_END } from './layout.js';
import { V_LIFT1, V_TOWN, V_ROOFS, V_GLASS, V_PEEL, windMs } from './timeline.js';
import { flight, gone } from './fly.js';
import { rng, smooth, clamp, lerp } from './util.js';

export const CU = { uTime: { value: 0 }, uPower: { value: 1 }, uSkyK: { value: 1 } };

// ---------- the facade shader ----------
const PARS = /* glsl */ `
uniform float uTime, uPower, uSkyK;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec4 vT; varying vec3 vON; varying vec3 vCol;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 c = mix(vec3(0.3, 0.3, 0.26), vec3(0.45, 0.5, 0.38), smoothstep(0.0, 0.5, h));
  return mix(c, vec3(0.12, 0.11, 0.1), smoothstep(0.0, -0.15, r.y)) * uSkyK;
}
`;
const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x * 1009.0 + 0.5);
    float H = vS.z; float side = vS.w;
    if (uTime > vT.z) discard;
    vec3 base = vCol;
    vec3 V = normalize(vWP - cameraPosition);
    vec3 N = normalize(vWN);
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = (vLoc.y + 0.5) * vSc.y;
    bool front = sx && (vON.x * side < -0.5);
    vec3 col = base;
    float emis = 0.0; vec3 ec = vec3(1.0, 0.82, 0.6);
    if (abs(vON.y) < 0.5) {
      vec2 bw = kind == 2.0 ? vec2(1.2, 0.45) : vec2(0.24, 0.07);
      float row = floor(y / bw.y);
      float bu = u / bw.x + 0.5 * mod(row, 2.0);
      vec2 bid = vec2(floor(bu), row);
      vec2 bf = vec2(fract(bu), fract(y / bw.y));
      vec2 fw = fwidth(vec2(bu, y / bw.y));
      float far = smoothstep(0.25, 0.7, max(fw.x, fw.y));
      float mortar = 1.0 - rect(bf, vec2(0.05, 0.12), vec2(0.95, 0.88), fw);
      if (kind == 0.0 || kind == 2.0 || kind == 3.0) {
        col = base * (0.84 + 0.32 * h21(bid + seed));
        col = mix(col, vec3(0.62, 0.58, 0.52), mortar * (1.0 - far) * 0.55);
        col = mix(col, base, far * 0.5);
      } else if (kind == 1.0 || kind == 4.0) {
        col = base * (0.95 + 0.08 * h21(bid + seed)) * (1.0 - 0.1 * mortar * (1.0 - far));
      } else if (kind == 5.0) {
        col = base * (0.9 + 0.12 * smoothstep(0.0, 0.3, fract(y / 0.22)));
      } else {
        col = base * (0.85 + 0.2 * smoothstep(0.0, 0.25, fract(u / 0.3))) * (0.9 + 0.2 * h21(vec2(floor(u / 0.3), seed)));
      }
      col *= 0.9 + 0.2 * n2(vec2(u * 0.3, y * 0.3) + seed);
      // the upper windows
      float g0 = (kind == 5.0 || kind == 6.0) ? 0.9 : 4.2, FH = kind == 5.0 ? 2.6 : 3.3;
      float colW = kind == 5.0 ? 3.2 : kind == 2.0 ? 3.4 : 2.7;
      float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
      vec2 g = vec2(u / colW, (y - g0) / FH);
      vec2 id = floor(g), f = fract(g);
      vec2 gw = max(fwidth(g), vec2(1e-4));
      float okUp = step(0.0, g.y) * step(y, H - 0.9) * ((kind == 6.0 || kind == 4.0) ? 0.0 : 1.0);
      if (!front && kind != 5.0) okUp *= step(0.55, h21(id + seed * 0.7));
      vec2 wa = kind == 2.0 ? vec2(0.3, 0.12) : vec2(0.3, 0.2), wb = kind == 2.0 ? vec2(0.7, 0.85) : vec2(0.7, 0.78);
      float win = rect(f, wa, wb, gw) * okUp;
      float trim = (rect(f, wa - 0.06, wb + 0.06, gw) - win) * okUp;
      float burst = step(vT.x + h21(id + seed * 0.3) * 1.5, uTime);
      vec3 refl = skyRefl(reflect(V, N));
      vec3 glass = mix(vec3(0.08, 0.09, 0.09) + 0.5 * refl, vec3(0.015), burst);
      float lit = step(0.55, h21(id + seed * 1.7)) * (1.0 - burst);
      col = mix(col, glass, win);
      col = mix(col, kind == 2.0 ? base * 1.15 : vec3(0.82, 0.78, 0.7), trim * 0.9);
      emis += win * lit * 0.35 * uPower;
      // the cornice at the top; the bank's pilasters
      float corn = smoothstep(H - 0.85, H - 0.75, y) * (1.0 - smoothstep(H - 0.12, H - 0.04, y)) * (kind < 4.5 ? 1.0 : 0.0);
      col = mix(col, kind == 1.0 ? vec3(0.9, 0.86, 0.8) : vec3(0.74, 0.7, 0.62), corn);
      if (kind == 2.0 && front) { float pil = step(abs(fract(u / colW) - 0.5), 0.09); col = mix(col, base * 1.2, pil * 0.8 * step(y, H - 1.0)); }
      // the storefront at street level
      if (front && kind < 4.5 && y < g0) {
        float nb = max(1.0, floor(W / 6.0 + 0.5)); float bw2 = W / nb;
        float bay = fract(u / bw2); float bid2 = floor(u / bw2);
        float sb = step(3.25, y) * step(y, 4.05);
        vec3 bandC = kind == 2.0 ? base * 0.9 : 0.32 * (0.55 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(seed, 2.0)))));
        float pane = step(0.55, y) * step(y, 3.05) * step(0.08, bay) * step(bay, 0.92);
        float door = step(abs(bay - 0.5), 0.13) * step(y, 2.4) * (1.0 - step(0.5, bid2));
        pane *= 1.0 - door;
        float burstS = step(vT.x + 0.3 * h21(vec2(bid2, seed)), uTime);
        vec3 inside = mix(vec3(0.95, 0.85, 0.62), vec3(0.85, 0.92, 1.0), step(0.5, h21(vec2(bid2, seed + 1.0)))) * (0.6 + 0.4 * h21(vec2(floor(bay * 5.0), seed)));
        vec3 sg = mix(mix(inside * 0.25, refl * 0.5, 0.4), vec3(0.01), burstS);
        col = mix(col, sg, pane);
        emis += pane * 0.9 * uPower * (1.0 - burstS); ec = mix(ec, inside, pane);
        col = mix(col, vec3(0.3, 0.2, 0.12), door);
        col = mix(col, bandC, sb);
        col = mix(col, base * 0.6, step(y, 0.55));
        col = mix(col, base * 0.9, clamp(step(bay, 0.08) + step(0.92, bay), 0.0, 1.0) * step(y, 3.25));
      }
      diffuseColor.rgb = col;
      totalEmissiveRadiance += ec * emis;
    } else {
      diffuseColor.rgb = (kind == 5.0 ? vec3(0.3, 0.28, 0.26) : vec3(0.22, 0.21, 0.2)) * (0.85 + 0.3 * h21(floor(vWP.xz * 0.7)));
    }
  }
`;
function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec4 aT; attribute vec3 aCol;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec4 vT; varying vec3 vON; varying vec3 vCol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position - vec3(0.0, 0.5, 0.0); vON = normal; vS = aS; vT = aT; vCol = aCol;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0); vWP = wpp.xyz; }
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'tornado-facade-v1';
  return m;
}

// ---------- the sign atlas: fascia signs (256 x 128 cells, top half) and blade signs (128 x 256, bottom half) ----------
const FASCIA = ['DINER', 'HARDWARE', 'PHARMACY', 'BARBER SHOP', 'CAFE', 'FIRST STATE BANK', 'FEED & SEED', 'FLORIST', 'BOOKS', 'PALACE',
  'INSURANCE', 'BAKERY', 'ANTIQUES', 'SHOES', 'POST OFFICE', 'PIZZA', 'TAVERN', 'DENTIST', 'FURNITURE', 'DRY CLEANERS', 'GIFTS',
  'BOOTS & SADDLES', 'ICE CREAM', 'MUSIC', 'TAX SERVICE', 'QUILTS', 'DRUG STORE', 'REALTY', 'DONUTS', 'LAUNDRY', 'JEWELERS', 'SPORTING GOODS',
  'GRILL', 'VARIETY STORE', 'PAINT', 'OPTICAL', 'TRAVEL', 'PET SUPPLY', 'COFFEE', 'THRIFT'];
const BLADE = ['EAT', 'OPEN', 'BAR', 'MOTEL', 'DRUGS', 'CAFE', 'LIQUOR', 'TIRES', 'VACANCY', 'PIZZA', 'ATM', 'ICE', 'GAS', 'BEER', 'SHOP', 'GRILL'];
const SIGNC = [['#f4ecd8', '#7a1f1f'], ['#1d2a44', '#f4ecd8'], ['#f0d04a', '#2a2a2a'], ['#2f5a3a', '#f4ecd8'], ['#f4ecd8', '#1d2a44'], ['#8a2a2a', '#f4e4b0'],
  ['#ffffff', '#c0392b'], ['#2a2a2a', '#f0d04a'], ['#e8dcc0', '#3a2a1a'], ['#1f3a5a', '#ffd870']];
function makeSignAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 2048;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 2048);
  FASCIA.forEach((word, i) => {
    const x0 = (i % 8) * 256, y0 = Math.floor(i / 8) * 128;
    const [bg, fg] = SIGNC[i % SIGNC.length];
    g.fillStyle = bg; g.fillRect(x0 + 3, y0 + 3, 250, 122);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x0 + 10, y0 + 10, 236, 108);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.min(58, 1900 / (word.length + 2))}px Georgia, serif`;
    g.fillText(word, x0 + 128, y0 + 66);
  });
  // the theatre's marquee (cell 9 is PALACE): bulbs round it
  { const x0 = 256, y0 = 128; g.fillStyle = '#ffe9a0'; for (let k = 0; k < 24; k++) { g.beginPath(); g.arc(x0 + 12 + k * 10.3, y0 + 8, 3, 0, 7); g.fill(); g.beginPath(); g.arc(x0 + 12 + k * 10.3, y0 + 120, 3, 0, 7); g.fill(); } }
  BLADE.forEach((word, i) => {
    const x0 = i * 128, y0 = 1024;
    const [bg, fg] = SIGNC[(i * 3 + 1) % SIGNC.length];
    g.fillStyle = bg; g.fillRect(x0 + 3, y0 + 3, 122, 250);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x0 + 10, y0 + 10, 108, 236);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...word];
    const fs = Math.min(60, 200 / chars.length);
    g.font = `900 ${fs}px Georgia, serif`;
    chars.forEach((ch, k) => g.fillText(ch, x0 + 64, y0 + 128 + (k - (chars.length - 1) / 2) * fs * 1.0));
  });
  // the flag (cell: x 0-256, y 1280-1408): stripes and a blue corner
  { const x0 = 0, y0 = 1280; for (let k = 0; k < 13; k++) { g.fillStyle = k % 2 ? '#f4f4f4' : '#b22234'; g.fillRect(x0, y0 + k * 128 / 13, 256, 128 / 13 + 1); } g.fillStyle = '#3c3b6e'; g.fillRect(x0, y0, 104, 69); g.fillStyle = '#fff'; for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) g.fillRect(x0 + 8 + c * 16 + (r % 2) * 8, y0 + 7 + r * 12, 3, 3); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const fasciaUV = (i) => [(i % 8) * 256 / 2048, 1 - (Math.floor(i / 8) + 1) * 128 / 2048, 256 / 2048, 128 / 2048];
const bladeUV = (i) => [i * 128 / 2048, 1 - 1280 / 2048, 128 / 2048, 256 / 2048];
const FLAG_UV = [0, 1 - 1408 / 2048, 256 / 2048, 128 / 2048];

// ---------- the flyers ----------
const dummy = new THREE.Object3D();
const e3 = new THREE.Euler(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), AX = new THREE.Vector3();
const M = new THREE.Matrix4(), MP = new THREE.Matrix4(), MR = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const fl = {};
function makeFlyers(scene, ctx, signTex) {
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    pyr: new THREE.ConeGeometry(0.5, 1, 4),
    crown: new THREE.IcosahedronGeometry(0.5, 1),
    sign: new THREE.PlaneGeometry(1, 1),
  };
  const objs = [];
  const parts = { box: [], cyl: [], cone: [], pyr: [], crown: [], sign: [] };
  const api = {
    objs,
    // o: { x, y, z, yaw, t0, tau, lift, r, seed, ground, flutter, parts: [{ kind, off: [x,y,z], s: [sx,sy,sz], rot: [rx,ry,rz], col, uv }] }
    add(o) {
      o.seed ??= 0; o.yaw ??= 0; o.ground ??= 0;
      for (const p of o.parts) { p.obj = o; p.off ??= [0, 0, 0]; p.rot ??= [0, 0, 0]; p.i = parts[p.kind].length; parts[p.kind].push(p); }
      objs.push(o);
      return o;
    },
    build() {
      const meshes = {};
      const col = new THREE.Color();
      for (const k of Object.keys(parts)) {
        const list = parts[k];
        if (!list.length) continue;
        let mat;
        if (k === 'sign') {
          mat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide, toneMapped: true });
          mat.onBeforeCompile = (sh) => {
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;')
              .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = uv * aUV.zw + aUV.xy;');
          };
          const aUV = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
          list.forEach((p, i) => aUV.setXYZW(i, ...(p.uv || FLAG_UV)));
          GEO.sign.setAttribute('aUV', aUV);
        } else mat = ctx.plainMat(0xffffff, k === 'crown' ? 0.95 : 0.8, k === 'crown' ? { flatShading: true } : {});
        const m = new THREE.InstancedMesh(GEO[k], mat, list.length);
        m.frustumCulled = false;
        if (k !== 'sign') { m.castShadow = true; m.receiveShadow = true; }
        list.forEach((p, i) => m.setColorAt(i, col.set(p.col ?? 0xffffff)));
        scene.add(m);
        meshes[k] = m;
      }
      api.meshes = meshes;
    },
    frame(v, s, camZ) {
      const W = s.W;
      const flutK = Math.min(0.6, W * W / 2500);
      for (const o of objs) {
        const f = flight(o, v, fl);
        const isGone = gone(f, s) || (o.hideAt && v > o.hideAt);
        if (isGone) { for (const p of o.parts) api.meshes[p.kind].setMatrixAt(p.i, HIDE); continue; }
        if (f.dt <= 0) {
          if (o.showAt && v < o.showAt) { for (const p of o.parts) api.meshes[p.kind].setMatrixAt(p.i, HIDE); continue; }
          // at rest, fluttering or bending in the wind (toward -z)
          let rx = 0, rz = 0;
          if (o.flutter) { rx = -o.flutter * flutK * (0.7 + 0.3 * Math.sin(v * (7 + o.seed * 4) + o.seed * 30)); rz = o.flutter * 0.3 * flutK * Math.sin(v * 5.3 + o.seed * 20); }
          if (o.bend) { rx = -Math.min(0.5, o.bend * W * W / 3000) * (1 + 0.3 * Math.sin(v * (2 + o.seed) + o.seed * 20)) - 0.02 * Math.sin(v * 1.7 + o.seed * 9); }
          e3.set(rx, o.yaw, rz, 'YXZ');
          q1.setFromEuler(e3);
          MP.compose(dummy.position.set(o.x, o.y, o.z), q1, dummy.scale.set(1, 1, 1));
        } else {
          // flying: tumbling end over end mostly about x (the wind's direction is -z), with a wobble
          e3.set(0, o.yaw, 0); q1.setFromEuler(e3);
          AX.set(1, 0.35 * Math.cos(o.seed * 7.3), 0.6 * Math.sin(o.seed * 12.1)).normalize();
          q2.setFromAxisAngle(AX, f.ang);
          q2.multiply(q1);
          MP.compose(dummy.position.set(f.x, f.y, f.z), q2, dummy.scale.set(1, 1, 1));
        }
        for (const p of o.parts) {
          let sk = 1, sy = 1;
          if (p.strip != null) { const bare = smooth(p.strip, p.strip + 3, v); sk = 1 - 0.55 * bare; sy = 1 - 0.3 * bare; }
          e3.set(p.rot[0], p.rot[1], p.rot[2], 'XYZ');
          q1.setFromEuler(e3);
          MR.compose(dummy.position.set(p.off[0], p.off[1], p.off[2]), q1, dummy.scale.set(p.s[0] * sk, p.s[1] * sy * (p.strip != null ? 1 : 1), p.s[2] * sk));
          M.multiplyMatrices(MP, MR);
          api.meshes[p.kind].setMatrixAt(p.i, M);
        }
      }
      for (const m of Object.values(api.meshes)) m.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}

export function makeTown(scene, ctx) {
  const R = rng(4242);
  // ---------- the buildings ----------
  const ALL = [
    ...BLD.map((b) => ({ ...b, w: b.w, d: b.d })),
    ...HOUSES.map((h) => ({ x: h.x, z: h.z, w: h.w, d: h.d, h: h.h, kind: h.col === 0x8a2e26 ? 6 : 5, col: h.col, seed: h.seed, side: Math.sign(h.x) || 1, far: h.far })),
  ];
  // when each one's windows burst, its roof goes, and (far ones) it is torn apart
  for (const b of ALL) {
    const far = -b.z;                                       // metres up the street
    const nearK = smooth(420, 0, far);                       // 0 at the far end .. 1 by you
    b.tGlass = V_GLASS - 9 * (1 - nearK) + R() * 1.5 + (b.far ? -5 : 0);
    b.tRoof = (b.kind === 5 || b.kind === 6 || far > 340) ? V_TOWN - 2 + 6 * nearK + R() * 2 : V_ROOFS + 4.5 * nearK + R() * 1.5;
    b.tGo = far > 340 || b.far ? V_TOWN + R() * 2.5 : far > 250 ? 32 + R() * 3 : far > 160 ? 38 + R() * 3 : far > 74 ? 41.5 + R() * 2.5 : 1e4;
    if (b.kind === 5 && far < 340) b.tGo = Math.min(b.tGo, 36 + 6 * nearK + R() * 2);
    if (b.tRoof > b.tGo) b.tRoof = b.tGo - 0.5;
  }
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const n = ALL.length;
  const aS = new Float32Array(n * 4), aT = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  ALL.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    mesh.setMatrixAt(i, m4);
    aS.set([(i * 0.6180339) % 1, b.kind, b.h, b.side], i * 4);
    aT.set([b.tGlass, b.tRoof, b.tGo, 0], i * 4);
    col.set(b.col).convertSRGBToLinear();
    aCol.set([col.r, col.g, col.b], i * 3);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);

  // ---------- everything that flies ----------
  const signTex = makeSignAtlas();
  const fly = makeFlyers(scene, ctx, signTex);
  const ROOFC = [0x2a2826, 0x3a3634, 0x8a8c90, 0x5a5652, 0x7a4a3a];
  for (const b of ALL) {
    // the roof: a slab that peels off whole
    const roofC = b.kind === 5 ? [0x4a4644, 0x5a5048, 0x3a3a40][Math.floor(R() * 3)] : b.kind === 6 ? 0x6a6a6e : ROOFC[Math.floor(R() * ROOFC.length)];
    fly.add({ x: b.x, y: b.h + 0.17, z: b.z, t0: b.tRoof, tau: 2.6, lift: 9 + R() * 6, r: 6, seed: R(), parts: [{ kind: 'box', s: [b.w + 0.5, 0.35, b.d + 0.5], col: roofC }] });
    // the ones torn apart: pieces of wall that only exist from then on
    if (b.tGo < 1e3) {
      const nx = 2, ny = b.h > 8 ? 3 : 2;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const sx = b.w / nx, sy = b.h / ny;
        fly.add({ x: b.x - b.w / 2 + sx * (i + 0.5), y: sy * (j + 0.5), z: b.z, t0: b.tGo + R() * 0.6 + j * 0.15, showAt: b.tGo, tau: 2.2 + R(), lift: 6 + R() * 8, r: 4, seed: R(),
          parts: [{ kind: 'box', s: [sx * (0.6 + 0.4 * R()), sy * (0.6 + 0.4 * R()), b.d * (0.4 + 0.5 * R())], col: b.col }] });
      }
    }
  }
  // signs, awnings, blade signs on the Main Street fronts
  const AWNC = [0x8a2a2a, 0x2a4a3a, 0x2a3a6a, 0xd8c8a0, 0x6a2a4a, 0x1f1f1f, 0x3a6a3a];
  BLD.forEach((b, i) => {
    if (b.kind === 4 && R() < 0.3) return;
    const xf = b.x - b.side * b.w / 2;                       // the front
    const nearK = smooth(420, 0, -b.z);
    const w = Math.min(b.d * 0.8, 9), yaw = b.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const word = b.kind === 3 ? 9 : b.kind === 2 ? 5 : b.kind === 4 && R() < 0.5 ? 14 : (i * 7 + 3) % FASCIA.length;
    fly.add({ x: xf - b.side * 0.1, y: 3.65, z: b.z, yaw, t0: V_LIFT1 + R() * 5 + 3 * nearK, tau: 1.0, lift: 12 + R() * 8, r: 2, seed: R(), flutter: 0.05,
      parts: [{ kind: 'sign', s: [w, b.kind === 3 ? 1.3 : 0.8, 1], uv: fasciaUV(word) }] });
    if (b.kind !== 2 && b.kind !== 3 && R() < 0.55) {
      // an awning: a slab leaning out over the shop window
      fly.add({ x: xf - b.side * 0.9, y: 3.1, z: b.z + (R() - 0.5) * b.d * 0.3, yaw, t0: V_LIFT1 - 1.5 + R() * 4 + 2 * nearK, tau: 0.8, lift: 14 + R() * 8, r: 1.5, seed: R(), flutter: 0.12,
        parts: [{ kind: 'box', s: [Math.min(b.d * 0.6, 5.5), 0.08, 1.8], rot: [0, 0, b.side * 0.35], off: [0, -0.3, 0], col: AWNC[Math.floor(R() * AWNC.length)] }] });
    }
    if (R() < 0.4) {
      fly.add({ x: xf - b.side * 0.8, y: 5.6 + R() * 1.5, z: b.z + (R() - 0.5) * b.d * 0.5, yaw: 0, t0: V_LIFT1 - 0.8 + R() * 4 + 2 * nearK, tau: 0.7, lift: 14 + R() * 8, r: 1, seed: R(), flutter: 0.08,
        parts: [{ kind: 'sign', s: [0.7, 2.2, 1], uv: bladeUV(Math.floor(R() * BLADE.length)) }] });
    }
  });
  // lamp posts (a pole and a lantern), the people grab these
  const lampObjs = LAMPS.map((l) => fly.add({ x: l.x, y: 0, z: l.z, t0: 31.5 + R() * 5 + 2 * smooth(-200, 0, l.z), tau: 2.2, lift: 10 + R() * 6, r: 4, seed: R(), lamp: l,
    parts: [{ kind: 'cyl', s: [0.16, 7.2, 0.16], off: [0, 3.6, 0], col: 0x2a2d30 }, { kind: 'box', s: [0.55, 0.7, 0.55], off: [0, 7.4, 0], col: 0x1a1c1e }, { kind: 'box', s: [0.7, 0.08, 0.7], off: [0, 7.8, 0], col: 0x2a2d30 }] }));
  // telephone poles with crossarms (the wires are lines, below)
  const poleObjs = POLES.map((p) => fly.add({ x: p.x, y: 0, z: p.z, t0: 30 + R() * 5 + 3 * smooth(-300, 0, p.z), tau: 2.8, lift: 8 + R() * 5, r: 5, seed: R(), pole: p,
    parts: [{ kind: 'cyl', s: [0.28, 9.5, 0.28], off: [0, 4.75, 0], col: 0x5a4a3a }, { kind: 'box', s: [2.2, 0.12, 0.12], off: [0, 9.0, 0], col: 0x4a3a2c }] }));
  // trash cans, newspaper boxes, benches
  for (const t of TRASH) fly.add({ x: t.x, y: 0, z: t.z, t0: V_LIFT1 + R() * 3 + 1.5 * smooth(-200, 0, t.z), tau: 0.9, lift: 8 + R() * 5, r: 0.8, seed: R(),
    parts: [{ kind: 'cyl', s: [0.62, 1.0, 0.62], off: [0, 0.5, 0], col: R() < 0.5 ? 0x2f4a2a : 0x3a3a3c }] });
  for (const b of BOXES) fly.add({ x: b.x, y: 0, z: b.z, t0: V_LIFT1 + 1 + R() * 3, tau: 0.9, lift: 8 + R() * 5, r: 0.8, seed: R(),
    parts: [{ kind: 'box', s: [0.5, 1.1, 0.45], off: [0, 0.55, 0], col: R() < 0.5 ? 0x1f3a7a : 0xa02020 }] });
  for (const b of BENCHES) fly.add({ x: b.x, y: 0, z: b.z, t0: 24 + R() * 6, tau: 1.4, lift: 6 + R() * 4, r: 1.5, seed: R(),
    parts: [{ kind: 'box', s: [0.5, 0.08, 1.8], off: [0, 0.45, 0], col: 0x3a2a1a }, { kind: 'box', s: [0.08, 0.5, 1.8], off: [Math.sign(b.x) * 0.25, 0.7, 0], col: 0x3a2a1a }, { kind: 'box', s: [0.5, 0.45, 0.08], off: [0, 0.22, 0.8], col: 0x1a1a1a }, { kind: 'box', s: [0.5, 0.45, 0.08], off: [0, 0.22, -0.8], col: 0x1a1a1a }] });
  // trees: a trunk and a crown that thrashes, strips, then the whole tree goes
  for (const t of TREES) {
    const far = -t.z;
    const t0 = t.town ? 26 + R() * 6 + 3 * smooth(-200, 0, t.z) : far > 420 ? V_TOWN - 1 + R() * 3 : 27 + R() * 8 * (1 - smooth(400, 0, far)) + 5 * smooth(400, 0, far);
    const tree = fly.add({ x: t.x, y: 0, z: t.z, yaw: t.seed * 6.28, t0, tau: 2.4, lift: 7 + R() * 6, r: 3, seed: t.seed, bend: 1, ground: 0.5,
      parts: [{ kind: 'cyl', s: [0.35 * t.s, 4.4 * t.s, 0.35 * t.s], off: [0, 2.2 * t.s, 0], col: 0x4a3a2c },
        { kind: 'crown', s: [4.2 * t.s, 3.4 * t.s, 4.2 * t.s], off: [0, 5.3 * t.s, 0], col: new THREE.Color().setHSL(0.24 + R() * 0.06, 0.45 + R() * 0.2, 0.2 + R() * 0.1).getHex(), strip: t0 - 6 - R() * 3 }] });
    tree.tree = true;
  }
  // flags: on the bank's slanted pole, and the tall pole by the post office
  for (const f of FLAGS) {
    if (f.slant) fly.add({ x: f.x, y: f.y, z: f.z, yaw: -Math.PI / 2, t0: 19.5 + R() * 2, tau: 0.6, lift: 16, r: 1, seed: R(), flutter: 0.3,
      parts: [{ kind: 'cyl', s: [0.06, 2.6, 0.06], off: [-0.9, 0.9, 0], rot: [0, 0, 0.8], col: 0xd8d8d8 }, { kind: 'sign', s: [1.5, 1.0, 1], off: [-1.6, 1.8, 0.0], rot: [0, 0, 0], uv: FLAG_UV }] });
    else {
      fly.add({ x: f.x, y: 0, z: f.z, t0: 33 + R() * 2, tau: 2.5, lift: 8, r: 5, seed: R(), parts: [{ kind: 'cyl', s: [0.12, 11, 0.12], off: [0, 5.5, 0], col: 0xd8d8d8 }] });
      fly.add({ x: f.x, y: 9.4, z: f.z - 0.9, yaw: 0, t0: 20.5 + R() * 2, tau: 0.5, lift: 18, r: 1, seed: R(), flutter: 0.35,
        parts: [{ kind: 'sign', s: [1.8, 1.2, 1], rot: [0, 0, 0], uv: FLAG_UV }] });
    }
  }
  // the far end: the grain elevator, the water tower, the church
  {
    const E = FAR.elevator;
    for (let k = 0; k < 3; k++) fly.add({ x: E.x + (k - 1) * 8.5, y: 0, z: E.z, t0: V_TOWN + 0.6 + k * 0.4, tau: 3.5, lift: 12, r: 8, seed: R(),
      parts: [{ kind: 'cyl', s: [8, 32, 8], off: [0, 16, 0], col: 0xc8c4bc }] });
    fly.add({ x: E.x, y: 32, z: E.z, t0: V_TOWN + 0.3, tau: 2.5, lift: 14, r: 5, seed: R(), parts: [{ kind: 'box', s: [10, 7, 8], off: [0, 3.5, 0], col: 0xb8b4ac }] });
    const T = FAR.tower;
    for (const [dx, dz] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) fly.add({ x: T.x + dx, y: 0, z: T.z + dz, t0: V_TOWN + 1.6 + R() * 0.4, tau: 2.5, lift: 10, r: 5, seed: R(),
      parts: [{ kind: 'cyl', s: [0.5, 30, 0.5], off: [0, 15, 0], col: 0x8a9298 }] });
    fly.add({ x: T.x, y: 30, z: T.z, t0: V_TOWN + 1.3, tau: 3, lift: 16, r: 6, seed: R(),
      parts: [{ kind: 'cyl', s: [12, 9, 12], off: [0, 4.5, 0], col: 0xd8dde0 }, { kind: 'cone', s: [13, 3.5, 13], off: [0, 10.7, 0], col: 0x8a3a3a }] });
    const C = FAR.church;
    fly.add({ x: C.x, y: 0, z: C.z - 12, t0: V_TOWN + 0.15, tau: 1.6, lift: 18, r: 3, seed: R(),
      parts: [{ kind: 'box', s: [3, 14, 3], off: [0, 7, 0], col: 0xeeeae0 }, { kind: 'pyr', s: [3.2, 7, 3.2], off: [0, 17.5, 0], rot: [0, Math.PI / 4, 0], col: 0x5a5a60 }] });
  }
  fly.build();

  // ---------- the wires between the poles, and the traffic signal on its span wire ----------
  const wireMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  const wirePts = [];
  for (let i = 0; i + 1 < POLES.length; i++) {
    const a = POLES[i], b = POLES[i + 1];
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8, t1 = (k + 1) / 8;
      for (const dx of [-0.9, 0.9]) {
        wirePts.push(a.x + dx, 9.0 - 0.6 * Math.sin(t0 * Math.PI), lerp(a.z, b.z, t0), b.x + dx, 9.0 - 0.6 * Math.sin(t1 * Math.PI), lerp(a.z, b.z, t1));
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  const wires = new THREE.LineSegments(wireGeo, wireMat);
  wires.frustumCulled = false;
  scene.add(wires);
  const spanGeo = new THREE.BufferGeometry();
  spanGeo.setAttribute('position', new THREE.Float32BufferAttribute([-FX + 0.8, 6.6, SIGNAL.z, FX - 0.8, 6.6, SIGNAL.z], 3));
  const span = new THREE.Line(spanGeo, wireMat);
  scene.add(span);
  const heads = [-2.4, 2.4].map((x) => fly.add({ x, y: 6.4, z: SIGNAL.z, t0: 25 + R() * 2, tau: 0.8, lift: 10, r: 1, seed: R(), flutter: 0.25,
    parts: [{ kind: 'box', s: [0.42, 1.15, 0.38], off: [0, -0.55, 0], col: 0x1a1c1e }] }));
  const spanPoles = [-FX + 0.8, FX - 0.8].map((x) => fly.add({ x, y: 0, z: SIGNAL.z, t0: 33 + R() * 2, tau: 2.5, lift: 8, r: 4, seed: R(),
    parts: [{ kind: 'cyl', s: [0.22, 7.2, 0.22], off: [0, 3.6, 0], col: 0x3a3d40 }] }));
  fly.build();     // (the two added after the first build: rebuild everything)

  return {
    mesh, fly, lampObjs,
    frame(v, s, glows, camZ) {
      CU.uTime.value = v;
      fly.frame(v, s, camZ);
      // the wires go with the poles
      let anyGone = false;
      for (const p of poleObjs) if (v > p.t0) anyGone = true;
      wires.visible = !anyGone || v < 32;
      span.visible = v < Math.min(heads[0].t0, heads[1].t0);
      // the signal: red toward you (the cross street has the green), until it flies; the shop lights
      if (span.visible) for (const h of heads) glows.add(h.x, 5.95, h.z + 0.25, 0.5, 4.0 * CU.uPower.value, 0.3, 0.15);
      // the lanterns on the lamp posts
      for (const l of lampObjs) if (v < l.t0) glows.add(l.x, 7.4, l.z, 1.1, 1.6 * CU.uPower.value, 1.4 * CU.uPower.value, 1.1 * CU.uPower.value);
    },
  };
}
