// The buildings, big screens, neon blade signs, lamps and signals round the crossing. One instanced box per building
// with its front drawn in the shader (lit windows, curtain walls, shop fronts at street level, rooftop lights);
// the screens and signs are lit planes (their pictures drawn on canvases at load, animated in the shader). The screens
// switch to an emergency alert in the first seconds; in the last part the power flickers and dies block by block.
import * as THREE from 'three';
import { BLD, SCREENS, SIGNS, LAMPS, SIGNALS, VENDING } from './layout.js';

export const CU = { uTime: { value: 0 }, uPower: { value: 1 }, uQuake: { value: 0 } };

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
    float FH = 3.4;
    float g0 = kind > 2.5 ? 3.4 : 5.0;
    float colW = kind > 0.5 && kind < 1.5 ? 1.8 : 2.6;
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 1.5);
    // the power: blocks go dark one by one at the end (and flicker before)
    float blk = h21(vec2(seed, 3.3));
    float on = uPower > blk ? 1.0 : 0.0;
    on *= 1.0 - 0.6 * step(0.5, uQuake) * step(0.93, h21(vec2(seed, floor(uTime * 12.0))));
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      float floorR = h21(vec2(id.y, seed * 0.29 + face));
      vec3 refl = skyRefl(reflect(V, normalize(vWN)));
      float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, normalize(vWN))), 3.0);
      vec3 col = base; float win = 0.0;
      float lit = step(r, 0.25 + 0.4 * step(floorR, 0.55)) * ok;
      vec3 warm = mix(vec3(1.0, 0.75, 0.48), vec3(0.85, 0.92, 1.0), step(0.7, h21(vec2(id.y, seed))));
      float e = 0.0;
      if (kind > 0.5 && kind < 1.5) {
        win = rect(f, vec2(0.06, 0.18), vec2(0.94, 0.96), fw) * ok;
        vec3 glass = mix(base * 0.1, refl * vec3(0.6, 0.72, 0.9) * 1.3, 0.35 + 0.65 * fres);
        col = mix(base * 0.22, glass, mix(win, 0.85 * ok, far));
        e = mix(win * lit * (0.55 + 0.6 * r), 0.3 * ok, far);
        float crown = smoothstep(H - 5.0, H - 4.6, y) * (1.0 - smoothstep(H - 1.0, H - 0.6, y));
        totalEmissiveRadiance += vec3(0.4, 0.75, 1.6) * crown * 0.7 * on;
      } else {
        win = rect(f, vec2(0.26, 0.3), vec2(0.74, 0.82), fw) * ok;
        vec3 glass = mix(vec3(0.03, 0.035, 0.05), refl * 0.55, 0.45 * fres);
        col = mix(base * 0.4, glass, win * (1.0 - far));
        col = mix(col, base * 0.28 + glass * 0.3, far * ok * 0.5);
        e = mix(win * lit * (0.5 + 0.6 * r), 0.2 * ok, far) * (kind > 2.5 ? 0.7 : 1.0);
        // some floors are bars and shops with coloured light
        float bar = step(0.82, h21(vec2(id.y, seed * 1.7))) * step(id.y, 4.0);
        warm = mix(warm, 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(id.y, seed + 4.0)))), bar);
      }
      totalEmissiveRadiance += e * warm * 0.55 * on;
      // street level: shop fronts lit warm inside, a sign band over them
      if (y < g0 && kind < 2.5) {
        float nb = max(1.0, floor(W / 5.0));
        float bw = W / nb;
        float bay = fract(u / bw);
        float bid = floor(u / bw);
        float pane = step(0.3, y) * step(y, g0 - 1.6) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(1.0, 0.85, 0.62), vec3(0.9, 0.95, 1.0), step(0.55, h21(vec2(bid, seed)))) * (0.7 + 0.3 * h21(vec2(floor(bay * 6.0), seed)));
        col = mix(base * 0.2, inside * 0.25, pane);
        totalEmissiveRadiance += pane * inside * 1.1 * on;
        float band = step(g0 - 1.5, y) * step(y, g0 - 0.25);
        vec3 bc = 0.55 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1))));
        col = mix(col, bc * 0.3, band);
        totalEmissiveRadiance += band * bc * 1.4 * on;
      }
      diffuseColor.rgb = col;
    } else {
      diffuseColor.rgb = base * 0.15 + 0.02 * h21(floor(vWP.xz * 0.5));
      vec2 rq = abs(vLoc.xz) - 0.44;
      float rl = step(40.0, H) * step(0.0, rq.x) * step(0.0, rq.y) * (0.6 + 0.4 * sin(uTime * 3.0 + seed));
      totalEmissiveRadiance += vec3(3.0, 0.15, 0.08) * rl * on;
    }
  }
`;

const PARS = /* glsl */ `
uniform float uTime; uniform float uPower; uniform float uQuake;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 c = mix(vec3(0.45, 0.25, 0.2), vec3(0.04, 0.05, 0.12), smoothstep(0.0, 0.35, h));
  return mix(c, vec3(0.2, 0.13, 0.12), smoothstep(0.0, -0.12, r.y));
}
`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
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
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'rogue-facade-v1';
  return m;
}

// ---- the sign atlas: 16 vertical blade signs (512 x 128 cells turned upright) + 8 shop signs ----
const VWORDS = ['ラーメン', 'カラオケ', '居酒屋', 'ホテル', '薬局', 'ゲーム', 'BAR', 'すし', '焼肉', 'CAFE', '24時間', 'カメラ', '本屋', 'クラブ', 'うどん', '映画館'];
const HWORDS = ['OPEN 24H', 'NOODLES', 'KARAOKE', 'GAMES', 'MUSIC', 'SUSHI', 'DRUGS', 'BOOKS'];
const NEON = ['#ff3ad0', '#3af2ff', '#ffd23a', '#ff5a3a', '#7aff5a', '#b06aff', '#ff9a2a', '#ffffff', '#ff4060', '#40a0ff'];
function makeSignAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 2048;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 2048);
  // blades: 16 columns of 128 x 1024 (top half of the atlas)
  for (let i = 0; i < 16; i++) {
    const x0 = i * 128, c1 = NEON[i % NEON.length], c2 = NEON[(i * 3 + 1) % NEON.length];
    const light = i % 3 === 0;
    g.fillStyle = light ? c1 : '#0b0812';
    g.fillRect(x0 + 4, 4, 120, 1016);
    g.strokeStyle = c2; g.lineWidth = 6; g.strokeRect(x0 + 10, 10, 108, 1004);
    const word = VWORDS[i];
    const chars = [...word];
    const fs = Math.min(110, 900 / chars.length);
    g.font = `900 ${fs}px "Yu Gothic", "Meiryo", "MS Gothic", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((ch, k) => {
      const y = 512 + (k - (chars.length - 1) / 2) * fs * 1.05;
      if (light) { g.fillStyle = '#ffffff'; g.shadowBlur = 0; g.fillText(ch, x0 + 64, y); }
      else { g.shadowColor = c1; g.shadowBlur = 20; g.fillStyle = c1; g.fillText(ch, x0 + 64, y); g.shadowBlur = 4; g.fillStyle = '#fff6f0'; g.fillText(ch, x0 + 64, y); }
    });
    g.shadowBlur = 0;
  }
  // shop signs: 8 rows of 1024 x 128 in the bottom-left quarter... (two columns of 1024 x 256)
  for (let i = 0; i < 8; i++) {
    const x0 = (i % 2) * 1024, y0 = 1024 + Math.floor(i / 2) * 256;
    const c1 = NEON[(i * 2 + 3) % NEON.length];
    const gr = g.createLinearGradient(x0, y0, x0 + 1024, y0);
    gr.addColorStop(0, c1); gr.addColorStop(1, NEON[(i * 5 + 2) % NEON.length]);
    g.fillStyle = gr; g.fillRect(x0 + 6, y0 + 6, 1012, 244);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + 6, y0 + 180, 1012, 70);
    g.font = '900 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.fillText(HWORDS[i], x0 + 512, y0 + 115);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---- the screens' pictures: 8 ads + the alert, 512 x 288 each in a 2048 x 1152 atlas (4 x 4) ----
const ADS = [['NEON NIGHTS', '#ff2a8a', '#2a1060'], ['新作', '#ffd23a', '#c02020'], ['LIVE TONIGHT', '#3af2ff', '#101a50'], ['セール', '#ffffff', '#ff4a8a'],
  ['FUTURE SOUND', '#b06aff', '#05050f'], ['ラーメン', '#ff9a2a', '#301008'], ['SKY TOWER', '#7aff5a', '#0a2a20'], ['夏祭り', '#ff5a3a', '#1a0a30']];
function makeScreenAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1152;
  const g = cv.getContext('2d');
  ADS.forEach(([word, c1, c2], i) => {
    const x0 = (i % 4) * 512, y0 = Math.floor(i / 4) * 288;
    const gr = g.createLinearGradient(x0, y0, x0 + 512, y0 + 288);
    gr.addColorStop(0, c2); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(x0, y0, 512, 288);
    for (let k = 0; k < 6; k++) { g.fillStyle = c1 + '55'; g.beginPath(); g.arc(x0 + 60 + k * 80, y0 + 220 - (k % 3) * 40, 30 + k * 6, 0, 7); g.fill(); }
    g.font = `900 ${Math.min(120, 900 / word.length)}px "Yu Gothic", Georgia, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = c1; g.shadowBlur = 24; g.fillStyle = c1; g.fillText(word, x0 + 256, y0 + 120);
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = '700 30px Georgia, serif'; g.fillText(['ALL NIGHT', 'NEW', 'ON NOW', 'TODAY ONLY'][i % 4], x0 + 256, y0 + 215);
  });
  // the alert (cells 8 and 9: two frames that alternate)
  for (let k = 0; k < 2; k++) {
    const x0 = k * 512, y0 = 576;
    g.fillStyle = k ? '#d01010' : '#200000'; g.fillRect(x0, y0, 512, 288);
    g.fillStyle = k ? '#200000' : '#ff2020'; g.fillRect(x0, y0 + 10, 512, 50); g.fillRect(x0, y0 + 228, 512, 50);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.font = '900 64px "Yu Gothic", sans-serif'; g.fillText('緊急警報', x0 + 256, y0 + 112);
    g.font = '900 54px Georgia, serif'; g.fillText('EMERGENCY', x0 + 256, y0 + 176);
    g.font = '700 26px Georgia, serif'; g.fillStyle = k ? '#fff' : '#ff8080'; g.fillText('TAKE SHELTER NOW', x0 + 256, y0 + 253);
  }
  // cell 10: a news picture of the planet over a map
  {
    const x0 = 1024, y0 = 576;
    g.fillStyle = '#04060c'; g.fillRect(x0, y0, 512, 288);
    const gr = g.createRadialGradient(x0 + 300, y0 + 140, 10, x0 + 300, y0 + 140, 110);
    gr.addColorStop(0, '#f2dcb8'); gr.addColorStop(0.6, '#b07a4a'); gr.addColorStop(1, '#3a2010');
    g.fillStyle = gr; g.beginPath(); g.arc(x0 + 300, y0 + 140, 110, 0, 7); g.fill();
    g.fillStyle = '#5ab0ff'; g.beginPath(); g.arc(x0 + 110, y0 + 150, 26, 0, 7); g.fill();
    g.fillStyle = '#d01010'; g.fillRect(x0, y0 + 236, 512, 52);
    g.fillStyle = '#fff'; g.font = '900 34px Georgia, serif'; g.textAlign = 'center'; g.fillText('BREAKING: IMPACT TOMORROW', x0 + 256, y0 + 263);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function makeCity(scene, ctx) {
  // ---- buildings ----
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const n = BLD.length;
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  BLD.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    mesh.setMatrixAt(i, m4);
    aS.set([(i * 0.6180339) % 1, b.kind, 0, b.h], i * 4);
    col.set(b.col).convertSRGBToLinear();
    aCol.set([col.r, col.g, col.b], i * 3);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // ---- screens ----
  const scrTex = makeScreenAtlas();
  const SU = { uTime: CU.uTime, uAlert: { value: 0 }, uPower: CU.uPower, uTex: { value: scrTex } };
  const scrMat = new THREE.ShaderMaterial({
    uniforms: SU,
    vertexShader: /* glsl */ `attribute float aSeed; varying vec2 vUv; varying float vSeed; void main(){ vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uAlert; uniform float uPower; uniform sampler2D uTex; varying vec2 vUv; varying float vSeed;
      float h11(float x){ return fract(sin(x * 91.7) * 43758.5); }
      vec3 cell(float i, vec2 uv) { vec2 o = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)); return texture2D(uTex, (o + uv) / vec2(4.0, 4.0)).rgb; }
      void main(){
        // the ads: change every few seconds with a slide; then the alert (red/black, flashing), with the news picture
        float t = uTime + vSeed * 3.7;
        float k = floor(t / 3.2), u = fract(t / 3.2);
        float a = mod(k + vSeed * 3.0, 8.0), b = mod(k + 1.0 + vSeed * 3.0, 8.0);
        float sl = smoothstep(0.88, 1.0, u);
        vec2 uv = vUv;
        vec3 ad = vUv.x > sl ? cell(a, vec2(uv.x - sl, uv.y)) : cell(b, vec2(uv.x + 1.0 - sl, uv.y));
        ad *= 0.85 + 0.15 * sin(uTime * 2.0 + vUv.x * 6.0);
        float alertOn = step(vSeed * 0.12, uAlert - 0.02);
        float fl = step(0.5, fract(uTime * 1.6 + vSeed * 0.3));
        vec3 al = mod(floor(uTime / 2.4 + vSeed), 3.0) < 1.0 ? cell(10.0, uv) : cell(8.0 + fl, uv);
        vec3 c = mix(ad, al, alertOn);
        // pixels
        vec2 px = fract(vUv * vec2(160.0, 90.0));
        c *= 0.75 + 0.25 * smoothstep(0.0, 0.25, px.x) * smoothstep(0.0, 0.25, px.y);
        float on = step(h11(vSeed + 2.0) * 0.8, uPower);
        gl_FragColor = vec4(c * 2.2 * on, 1.0);
      }`,
  });
  const scrGeo = new THREE.PlaneGeometry(1, 1);
  const scrMesh = new THREE.InstancedMesh(scrGeo, scrMat, SCREENS.length);
  const aSeed = new Float32Array(SCREENS.length);
  SCREENS.forEach((s, i) => {
    m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w, s.h, 1)).setPosition(s.x, s.y, s.z);
    scrMesh.setMatrixAt(i, m4);
    aSeed[i] = s.seed;
  });
  scrGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  scrMesh.frustumCulled = false;
  scene.add(scrMesh);
  // the screens' frames
  const frameMat = ctx.plainMat(0x15161a, 0.6);
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, SCREENS.length);
  SCREENS.forEach((s, i) => {
    m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w + 0.8, s.h + 0.8, 0.5)).setPosition(s.x - Math.sin(s.yaw) * 0.3, s.y, s.z - Math.cos(s.yaw) * 0.3);
    frames.setMatrixAt(i, m4);
  });
  frames.frustumCulled = false;
  scene.add(frames);

  // ---- signs ----
  const signTex = makeSignAtlas();
  const signMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: signTex }, uTime: CU.uTime, uPower: CU.uPower, uQuake: CU.uQuake },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute vec4 aCell; varying vec2 vUv; varying vec4 vCell; void main(){ vUv = uv; vCell = aCell; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uTime; uniform float uPower; uniform float uQuake; varying vec2 vUv; varying vec4 vCell;
      float h11(float x){ return fract(sin(x * 91.7) * 43758.5); }
      void main(){
        vec2 uv;
        if (vCell.y < 0.5) uv = vec2((vCell.x + vUv.x) / 16.0, 1.0 - (1.0 - vUv.y) * 0.5);          // blade: a column in the top half
        else { float i = vCell.x - 16.0; uv = vec2((mod(i, 2.0) + vUv.x) / 2.0, 0.5 - (floor(i / 2.0) + 1.0 - vUv.y) / 8.0); }
        vec3 c = texture2D(uTex, uv).rgb;
        float on = step(h11(vCell.z) * 0.95, uPower);
        on *= 1.0 - step(0.3, uQuake) * step(0.8, h11(vCell.z + floor(uTime * 14.0)));
        gl_FragColor = vec4(c * (1.6 + 0.2 * sin(uTime * 5.0 + vCell.z * 9.0)) * on + c * 0.04, 1.0);
      }`,
  });
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  const aCell = new Float32Array(SIGNS.length * 4);
  SIGNS.forEach((s, i) => {
    // a blade sticks out from the front (its face along the street); a shop sign lies flat on it
    m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w, s.h, 1)).setPosition(s.x, s.y, s.z);
    signs.setMatrixAt(i, m4);
    aCell.set([s.cell, s.blade ? 0 : 1, i * 0.37, 0], i * 4);
  });
  signGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 4));
  signs.frustumCulled = false;
  scene.add(signs);

  // ---- lamps, signals, vending machines (poles as boxes; the lights are glows each frame) ----
  const poleMat = ctx.plainMat(0x3a3d42, 0.6, { metalness: 0.4 });
  const nPoles = LAMPS.length + SIGNALS.length * 2;
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), poleMat, nPoles);
  let k = 0;
  for (const l of LAMPS) { poles.setMatrixAt(k++, m4.makeScale(0.16, 7.5, 0.16).setPosition(l.x, 0, l.z)); }
  for (const s of SIGNALS) {
    poles.setMatrixAt(k++, m4.makeScale(0.2, 5.0, 0.2).setPosition(s.x, 0, s.z));
    poles.setMatrixAt(k++, m4.makeScale(0.5, 1.2, 0.35).setPosition(s.x, 4.1, s.z));
  }
  poles.frustumCulled = false;
  scene.add(poles);
  const vmMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.0 });
  const vm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), vmMat, VENDING.length);
  VENDING.forEach((v, i) => vm.setMatrixAt(i, m4.makeRotationY(v.yaw).scale(new THREE.Vector3(1.1, 1.85, 0.8)).setPosition(v.x, 0, v.z)));
  vm.frustumCulled = false;
  scene.add(vm);

  return {
    SU,
    // the lights that are glows (lamps, signals, vending fronts), each frame
    glows(glows, v, s) {
      const pw = CU.uPower.value;
      LAMPS.forEach((l, i) => {
        const on = pw > ((i * 0.618) % 1) * 0.9 ? 1 : 0;
        if (on) glows.add(l.x * 0.94, 7.4, l.z, 1.4, 3.2, 2.6, 1.9);
      });
      for (const sg of SIGNALS) {
        // the cars' lights are red (the scramble phase): pedestrian lights green
        glows.add(sg.x, 4.45, sg.z, 0.6, 4.5 * pw, 0.25 * pw, 0.15 * pw);
        glows.add(sg.x, 3.8, sg.z, 0.5, 0.2 * pw, 3.5 * pw, 1.6 * pw);
      }
      for (const m of VENDING) glows.add(m.x + Math.sin(m.yaw) * 0.45, 1.2, m.z + Math.cos(m.yaw) * 0.45, 1.6, 1.4 * pw, 1.5 * pw, 1.7 * pw);
    },
  };
}
