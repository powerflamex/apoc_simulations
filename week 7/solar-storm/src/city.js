// The buildings, big screens, shop signs, blade signs, lamp posts, the subway entrance and the traffic-light poles, at
// night. One instanced box per building with its front drawn in the shader (lit window grids, glass towers that mirror
// the aurora, older stone blocks with cornices, lit shop fronts at street level). The blackout (uFront: how far from
// ORIGIN the power has gone) puts out each building's windows and shop fronts as it passes (a few stay on, dim, on
// generators); signs and screens die the moment it reaches them.
import * as THREE from 'three';
import { BLD, SCREENS, SIGNS, BLADES, LAMPS, SIGNALS, SUBWAY, CURB, CROSS, groundY } from './layout.js';
import { ORIGIN, dieAt } from './timeline.js';

export const CU = {
  uTime: { value: 0 }, uFront: { value: -1 }, uOrigin: { value: new THREE.Vector2(ORIGIN.x, ORIGIN.z) }, uFlick: { value: 1 },
  uSkyHi: { value: new THREE.Color(0.5, 0.08, 0.12) }, uSkyLo: { value: new THREE.Color(0.1, 0.6, 0.25) }, uAur: { value: 1 },
  uHaze: { value: new THREE.Color(0.03, 0.06, 0.05) }, uHazeD: { value: 2600 }, uStreetK: { value: 1 }, uCandle: { value: 0 },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uFront; uniform vec2 uOrigin; uniform float uFlick; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uAur;
uniform vec3 uHaze; uniform float uHazeD; uniform float uStreetK; uniform float uCandle;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
// the aurora in a mirror: red high up, green lower, the dark street below
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, smoothstep(0.15, 0.7, h)) * smoothstep(-0.02, 0.12, h);
  return c * uAur + vec3(0.015, 0.02, 0.02);
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
    float FH = kind > 1.5 && kind < 2.5 ? 3.7 : 3.4;
    float g0 = kind > 1.5 && kind < 2.5 ? 4.8 : 5.4;
    float colW = kind > 0.5 && kind < 1.5 ? 1.7 : kind > 1.5 && kind < 2.5 ? 3.1 : 2.5 + 0.6 * h21(vec2(seed, 2.0));
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 1.5);
    // the blackout: this building's power goes when the front reaches it (and stays out)
    float rr = length(vIC - uOrigin);
    float seedR = h21(vec2(seed, 5.0));
    float power = step(uFront, rr + 30.0 * seedR) * mix(1.0, uFlick, smoothstep(160.0, 40.0, rr));
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      vec3 N = normalize(vWN);
      vec3 refl = skyRefl(reflect(V, N));
      float fres = 0.18 + 0.82 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 col = base; float win = 0.0;
      // who's home: about half the windows lit, warm or office white; a far building's lit share is an even tone
      float lit = step(0.58, h21(id * 1.31 + vec2(seed * 0.71, face)));
      // candles: after the blackout people light them, one window here and there, more as time goes on (near buildings only)
      float cnd = step(1.0 - 0.2 * uCandle * (0.4 + 0.6 * h21(vec2(seed, 9.0))), h21(id * 2.71 + vec2(seed * 0.33, face))) * smoothstep(260.0, 60.0, length(vWP - cameraPosition));
      float flk = 0.75 + 0.25 * sin(uTime * 9.0 + r * 50.0) * sin(uTime * 5.3 + r * 23.0);
      vec3 room = mix(vec3(1.0, 0.72, 0.42), vec3(0.86, 0.92, 1.0), step(0.7, h21(id + vec2(seed, 2.0))));
      room *= 0.6 + 0.7 * h21(id * 2.1 + seed);
      if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
        win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
        vec3 glass = mix(base * 0.16, vec3(0.05, 0.055, 0.06), 0.5);
        col = mix(base * 0.45, glass, mix(win, 0.88 * ok, far));
        totalEmissiveRadiance += refl * (0.02 + 0.08 * fres) * mix(win, 0.88 * ok, far);
      } else if (kind > 1.5 && kind < 2.5) {
        win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
        vec3 glass = mix(vec3(0.04, 0.05, 0.06), refl * 0.6, 0.4 * fres) * (0.8 + 0.4 * r);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.5);
        float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
        col = mix(col, base * 1.14, course * (1.0 - far));
        col = mix(col, base * 0.92, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
        totalEmissiveRadiance += refl * 0.06 * fres * win * (1.0 - far);
      } else {
        vec2 a = kind > 3.5 ? vec2(0.08, 0.2) : vec2(0.16, 0.22), b = kind > 3.5 ? vec2(0.92, 0.9) : vec2(0.84, 0.86);
        win = rect(f, a, b, fw) * ok;
        vec3 glass = mix(vec3(0.04, 0.05, 0.06), refl * 0.65, 0.4 * fres) * (0.8 + 0.4 * r);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.75 + glass * 0.25, far * ok * 0.55);
        col = mix(col, base * 0.86, step(f.y, 0.2) * ok * (1.0 - far));
        totalEmissiveRadiance += refl * 0.06 * fres * win;
      }
      // the rooms' lights
      float rows = step(g0, y) * ok;
      float wv = mix(win, 0.8, far) * rows;
      totalEmissiveRadiance += room * mix(lit, 0.42, far) * wv * power * mix(0.55, 0.9, far);
      // a candle: a small warm glow low in the window
      float spot = exp(-pow((f.x - 0.5) / 0.3, 2.0) - pow((f.y - 0.38) / 0.32, 2.0));
      totalEmissiveRadiance += vec3(1.0, 0.55, 0.2) * cnd * mix(spot, 0.4, far) * flk * rows * (1.0 - power) * 3.0;
      // street level: shop fronts (lit glass, a fascia band), the light they and the lamps throw on the walls
      if (y < g0 && kind < 2.5) {
        float nb = max(1.0, floor(W / 5.5));
        float bw = W / nb;
        float bay = fract(u / bw);
        float bid = floor(u / bw);
        float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(1.0, 0.78, 0.5), vec3(0.8, 0.88, 1.0), step(0.55, h21(vec2(bid, seed)))) * (0.6 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
        vec3 shopGlass = mix(inside * 0.2, refl * 0.6, 0.45 * fres);
        col = mix(base * 0.7, shopGlass, pane);
        float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
        col = mix(col, vec3(0.08, 0.08, 0.09), band);
        totalEmissiveRadiance += pane * inside * 1.6 * power;
        win = max(win, pane);
      }
      // warm spill from the street lamps and signs on the lower walls while the power's on
      totalEmissiveRadiance += col * vec3(1.0, 0.7, 0.45) * 0.35 * uStreetK * smoothstep(16.0, 2.0, y) * smoothstep(60.0, 15.0, length(vWP.xz - cameraPosition.xz)) * power;
      diffuseColor.rgb = col;
    } else {
      diffuseColor.rgb = base * 0.42 + 0.04 * h21(floor(vWP.xz * 0.5));
      vec2 rq = abs(vLoc.xz) - 0.46;
      diffuseColor.rgb = mix(diffuseColor.rgb, base * 0.7, step(0.0, max(rq.x, rq.y)));
    }
    // red lights on the tall roofs, while the power's on
    if (H > 100.0 && y > H - 1.2 && (u < 1.2 || u > W - 1.2) && abs(vON.y) < 0.5) totalEmissiveRadiance += vec3(4.0, 0.3, 0.2) * power * step(0.0, sin(uTime * 3.0 + seed));
  }
`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vIC = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
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
  m.customProgramCacheKey = () => 'storm-facade-v1';
  return m;
}

// ---- the screens' pictures: 8 night ads, 512 x 288 each in a 2048 x 1152 atlas (4 x 4) ----
const ADS = [['LIVE TONIGHT', '#ffffff', '#c0207a'], ['NEW PHONE', '#7ae0ff', '#101a40'], ['BIG GAME', '#ffffff', '#b01a1a'], ['NOW OPEN', '#ffd23a', '#1a4a2a'],
  ['MOVIE NIGHT', '#ffd23a', '#201030'], ['24 HOURS', '#ffffff', '#1a3a8a'], ['ICED COFFEE', '#ffe6a0', '#5a2a10'], ['CONCERT', '#ff7ad0', '#140a2a']];
function makeScreenAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1152;
  const g = cv.getContext('2d');
  ADS.forEach(([word, c1, c2], i) => {
    const x0 = (i % 4) * 512, y0 = Math.floor(i / 4) * 288;
    const gr = g.createLinearGradient(x0, y0, x0 + 512, y0 + 288);
    gr.addColorStop(0, c2); gr.addColorStop(1, '#05050a');
    g.fillStyle = gr; g.fillRect(x0, y0, 512, 288);
    for (let k = 0; k < 6; k++) { g.fillStyle = c1 + '55'; g.beginPath(); g.arc(x0 + 60 + k * 80, y0 + 220 - (k % 3) * 40, 30 + k * 6, 0, 7); g.fill(); }
    g.font = `900 ${Math.min(110, 820 / word.length)}px Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 12; g.fillStyle = c1; g.fillText(word, x0 + 256, y0 + 120);
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = '700 30px Arial, sans-serif'; g.fillText(['ALL WEEK', 'IN STORE', 'ON NOW', 'TONIGHT'][i % 4], x0 + 256, y0 + 215);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---- lit shop signs: 12 of them, 1024 x 128 each (2 columns x 6 rows in a 2048 x 768 atlas): bright letters on dark ----
const SHOPS = [['CAFE', '#ffb060'], ['PHARMACY', '#60ff90'], ['BOOKS', '#ffe080'], ['PIZZA', '#ff6050'], ['MARKET', '#ffffff'], ['NOODLES', '#ff70c0'],
  ['HOTEL', '#80c0ff'], ['BAR', '#ff4090'], ['DINER', '#60e0ff'], ['SHOES', '#ffffff'], ['BURGERS', '#ffc040'], ['DELI', '#a0ff70']];
function makeSignAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 768;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 768);
  SHOPS.forEach(([word, fg], i) => {
    const x0 = (i % 2) * 1024, y0 = Math.floor(i / 2) * 128;
    g.fillStyle = '#0c0c10'; g.fillRect(x0 + 4, y0 + 4, 1016, 120);
    g.strokeStyle = fg; g.lineWidth = 4; g.globalAlpha = 0.7; g.strokeRect(x0 + 16, y0 + 16, 992, 96); g.globalAlpha = 1;
    g.font = '900 86px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = 18; g.fillStyle = fg; g.fillText(word, x0 + 512, y0 + 68); g.shadowBlur = 0;
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// ---- blade signs (vertical, letters stacked): 8 of them, 128 x 512 each in a 1024 x 512 atlas ----
const BLADE_W = [['HOTEL', '#ff5070'], ['JAZZ', '#60c0ff'], ['BAR', '#ff60d0'], ['CAFE', '#ffb040'], ['TACOS', '#80ff80'], ['DINER', '#ff4040'], ['BOOKS', '#ffe080'], ['GYM', '#60ffe0']];
function makeBladeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  BLADE_W.forEach(([word, fg], i) => {
    const x0 = i * 128;
    g.fillStyle = '#0a0a0e'; g.fillRect(x0 + 2, 2, 124, 508);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x0 + 10, 10, 108, 492);
    g.font = '900 84px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = 14; g.fillStyle = fg;
    const n = word.length, step = Math.min(96, 470 / n);
    for (let k = 0; k < n; k++) g.fillText(word[k], x0 + 64, 256 + (k - (n - 1) / 2) * step);
    g.shadowBlur = 0;
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// ---- the subway sign ----
function makeSubwayTex() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#101418'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff'; g.font = '900 78px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SUBWAY', 300, 66);
  g.fillStyle = '#2a9a4a'; g.beginPath(); g.arc(64, 64, 46, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = '900 62px Arial, sans-serif'; g.fillText('4', 64, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// a lit panel: an atlas cell, bright while powered (with the flicker), dead after its time (a dark panel that catches the sky)
function panelMaterial(tex, cols, rows, gain, { horiz = true } = {}) {
  const U = { uTime: CU.uTime, uFront: CU.uFront, uFlick: CU.uFlick, uTex: { value: tex }, uAur: CU.uAur, uSkyHi: CU.uSkyHi, uSkyLo: CU.uSkyLo };
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `attribute float aCell; attribute float aDie; varying vec2 vUv; varying float vCell; varying float vDie; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = uv; vCell = aCell; vDie = aDie; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0)); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uFlick; uniform sampler2D uTex; uniform float uAur; uniform vec3 uSkyHi; uniform vec3 uSkyLo;
      varying vec2 vUv; varying float vCell; varying float vDie; varying vec3 vN; varying vec3 vW;
      void main(){
        vec2 o = vec2(mod(vCell, ${cols.toFixed(1)}), ${(rows - 1).toFixed(1)} - floor(vCell / ${cols.toFixed(1)}));
        vec3 tx = texture2D(uTex, (o + vUv) / vec2(${cols.toFixed(1)}, ${rows.toFixed(1)})).rgb;
        float dt = uTime - vDie;
        // dies: a last bright surge, a stutter, then dark
        float on = dt < 0.0 ? uFlick : (dt < 0.05 ? 2.2 : (dt < 0.16 ? 0.35 * step(0.5, fract(dt * 37.0)) : 0.0));
        vec3 c = tx * tx * ${gain.toFixed(2)} * on;
        vec3 V = normalize(vW - cameraPosition);
        vec3 r = reflect(V, normalize(vN));
        c += (mix(uSkyLo, uSkyHi, smoothstep(0.1, 0.7, r.y)) * uAur * 0.25 + vec3(0.01)) * (0.3 + 0.7 * tx.r * 0.2) * (1.0 - min(on, 1.0) * 0.5);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function makeCity(scene, ctx) {
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  // ---- buildings ----
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 24, 1).translate(0, 0.5, 0);
  const n = BLD.length;
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  BLD.forEach((b, i) => {
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

  const dist = (x, z) => Math.hypot(x - ORIGIN.x, z - ORIGIN.z);
  const panels = (list, tex, cols, rows, gain, place) => {
    const g = new THREE.PlaneGeometry(1, 1);
    const im = new THREE.InstancedMesh(g, panelMaterial(tex, cols, rows, gain), list.length);
    const aCell = new Float32Array(list.length), aDie = new Float32Array(list.length);
    list.forEach((s, i) => { im.setMatrixAt(i, place(s)); aCell[i] = s.cell ?? s.seed; aDie[i] = s.die = dieAt(dist(s.x, s.z)); });
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 1));
    g.setAttribute('aDie', new THREE.InstancedBufferAttribute(aDie, 1));
    im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  // ---- screens (an ad each; they change every few seconds) ----
  {
    const scrTex = makeScreenAtlas();
    SCREENS.forEach((s) => { s.cell = s.seed % 8; });
    panels(SCREENS, scrTex, 4, 4, 2.6, (s) => m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w, s.h, 1)).setPosition(s.x, s.y, s.z).clone());
    const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x15161a, 0.6), SCREENS.length);
    SCREENS.forEach((s, i) => {
      frames.setMatrixAt(i, m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w + 0.8, s.h + 0.8, 0.5)).setPosition(s.x - Math.sin(s.yaw) * 0.3, s.y, s.z - Math.cos(s.yaw) * 0.3));
    });
    frames.frustumCulled = false;
    scene.add(frames);
  }
  // ---- shop signs and blade signs ----
  panels(SIGNS, makeSignAtlas(), 2, 6, 3.2, (s) => m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w, s.h, 1)).setPosition(s.x, s.y, s.z).clone());
  {
    const bt = makeBladeAtlas();
    // two faces each (one seen coming, one going), on a dark box
    const faces = [];
    for (const b of BLADES) for (const f of [-1, 1]) faces.push({ ...b, f, cell: b.cell });
    panels(faces, bt, 8, 1, 3.0, (b) => m4.makeRotationY(b.f > 0 ? 0 : Math.PI).scale(new THREE.Vector3(b.w, b.h, 1)).setPosition(b.x, b.y, b.z + b.f * 0.09).clone());
    const box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x111114, 0.6), BLADES.length);
    BLADES.forEach((b, i) => box.setMatrixAt(i, m4.makeScale(b.w + 0.1, b.h + 0.1, 0.16).setPosition(b.x, b.y, b.z)));
    box.frustumCulled = false; scene.add(box);
    const brk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x222226, 0.5, { metalness: 0.5 }), BLADES.length * 2);
    BLADES.forEach((b, i) => { for (const k of [0, 1]) brk.setMatrixAt(i * 2 + k, m4.makeScale(1.0, 0.06, 0.06).setPosition(b.x + b.side * 0.55, b.y + (k ? 1 : -1) * b.h * 0.42, b.z)); });
    brk.frustumCulled = false; scene.add(brk);
  }

  // ---- lamp posts (west side; the east lamps hang on the utility poles, see power.js) ----
  const poleMat = ctx.plainMat(0x3a3d42, 0.55, { metalness: 0.4 });
  const west = LAMPS.filter((l) => l.x < 0);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), poleMat, west.length);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), poleMat, west.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x2a2c30, 0.5), west.length);
  west.forEach((l, k) => {
    posts.setMatrixAt(k, m4.makeScale(0.2, l.h + 0.2, 0.2).setPosition(l.x, 0, l.z));
    arms.setMatrixAt(k, m4.makeScale(2.4, 0.12, 0.12).setPosition(l.x + l.d * 1.2, l.h + 0.1, l.z));
    heads.setMatrixAt(k, m4.makeScale(0.7, 0.2, 0.34).setPosition(l.x + l.d * 2.3, l.h, l.z));
  });
  for (const m of [posts, arms, heads]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }

  // ---- traffic-light poles, mast arms and heads (their lights are glows, from main.js) ----
  {
    const parts = [];
    const metal = ctx.plainMat(0x2c2f33, 0.5, { metalness: 0.5 });
    const box = (sx, sy, sz, x, y, z, mat = metal) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); mm.position.set(x, y, z); mm.castShadow = true; scene.add(mm); parts.push(mm); };
    for (const s of SIGNALS) {
      box(0.24, 6.6, 0.24, s.x, 3.3, s.z);
      if (s.arm) {
        box(9.0, 0.16, 0.16, s.x + s.arm * 4.5, 6.2, s.z);
        for (const ax of [3.5, 7.0]) box(0.38, 1.05, 0.32, s.x + s.arm * ax, 5.55, s.z, ctx.plainMat(0x1a1c10, 0.6));
      } else {
        box(0.32, 1.05, 0.38, s.x, 4.2, s.z, ctx.plainMat(0x1a1c10, 0.6));
      }
      box(0.3, 0.4, 0.22, s.x + (s.x > 0 ? -0.2 : 0.2), 2.8, s.z, ctx.plainMat(0x1a1a1a, 0.6));
    }
  }

  // ---- the subway: an open stairwell on the sidewalk, its mouth toward you; see-through railings on three sides, steps
  //      going down northward to a black station door at the bottom; a sign post with two globes at the mouth ----
  {
    const S = SUBWAY, x0 = S.x - S.w / 2, x1 = S.x + S.w / 2, L = S.z0 - S.z1;
    const rail = ctx.plainMat(0x1f4a2a, 0.5, { metalness: 0.4 });
    const add = (g, mat, x, y, z) => { const mm = new THREE.Mesh(g, mat); mm.position.set(x, y, z); mm.castShadow = true; mm.receiveShadow = true; scene.add(mm); return mm; };
    for (const x of [x0 - 0.05, x1 + 0.05]) {
      add(new THREE.BoxGeometry(0.07, 0.07, L), rail, x, 1.0, (S.z0 + S.z1) / 2);
      add(new THREE.BoxGeometry(0.05, 0.05, L), rail, x, 0.5, (S.z0 + S.z1) / 2);
      for (let z = S.z1; z <= S.z0 + 0.01; z += L / 5) add(new THREE.BoxGeometry(0.06, 1.0, 0.06), rail, x, 0.5, z);
      add(new THREE.BoxGeometry(0.14, 0.12, L), ctx.plainMat(0x4a4a46, 0.8), x, 0.06, (S.z0 + S.z1) / 2);
    }
    add(new THREE.BoxGeometry(S.w + 0.2, 0.07, 0.07), rail, S.x, 1.0, S.z1 - 0.05);
    add(new THREE.BoxGeometry(S.w + 0.2, 0.05, 0.05), rail, S.x, 0.5, S.z1 - 0.05);
    const wall = ctx.plainMat(0x4a4a46, 0.85), step = ctx.plainMat(0x6a6864, 0.8);
    add(new THREE.BoxGeometry(0.1, S.D + 1, L), wall, x0 + 0.02, -(S.D + 1) / 2, (S.z0 + S.z1) / 2);
    add(new THREE.BoxGeometry(0.1, S.D + 1, L), wall, x1 - 0.02, -(S.D + 1) / 2, (S.z0 + S.z1) / 2);
    add(new THREE.BoxGeometry(S.w, S.D + 1, 0.1), wall, S.x, -(S.D + 1) / 2, S.z1 - 0.02);
    const black = new THREE.MeshBasicMaterial({ color: 0x010101 });
    add(new THREE.PlaneGeometry(S.w - 0.25, 2.3), black, S.x, -S.D + 1.15, S.z1 + 0.04);
    const NS = 20;
    for (let k = 0; k < NS; k++) {
      const Ls = L - 1.2, z = S.z0 - (k + 0.5) * (Ls / NS), y = -(k + 0.5) * (S.D / NS) - 0.3;
      add(new THREE.BoxGeometry(S.w - 0.1, 0.6, Ls / NS + 0.02), step, S.x, y, z);
    }
    add(new THREE.BoxGeometry(S.w - 0.1, 0.2, 1.2), step, S.x, -S.D - 0.1 + 0.0, S.z1 + 0.6);
    const sub = makeSubwayTex();
    const subMat = new THREE.MeshBasicMaterial({ map: sub, toneMapped: true });
    var sg = add(new THREE.PlaneGeometry(1.9, 0.48), subMat, x1 + 0.35, 2.55, S.z0 + 0.12);
    add(new THREE.BoxGeometry(2.0, 0.56, 0.1), ctx.plainMat(0x15171a, 0.6), x1 + 0.35, 2.55, S.z0 + 0.05);
    for (const x of [x0 - 0.05, x1 + 0.05]) add(new THREE.BoxGeometry(0.1, 2.4, 0.1), rail, x, 1.2, S.z0 + 0.1);
    return { mesh, subSign: sg, subMat };
  }
}
