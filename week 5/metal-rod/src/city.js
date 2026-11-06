// The buildings, big screens, shop signs, lamps, signals and trees round the crossing, in daylight. One instanced box
// per building with its front drawn in the shader (window grids that mirror the sky, glass towers, older stone blocks
// with cornices, shop fronts at street level); the screens are lit planes whose pictures are drawn on a canvas at
// load and animated in the shader (ads, then the emergency alert from 6 s). After the hit, the blast front
// (uBlastR: its distance from the hit point) bursts every window it passes, blackens the fronts, and crumples the
// buildings nearest the hit; the screens it passes go dead.
import * as THREE from 'three';
import { BLD, SCREENS, SIGNS, LAMPS, SIGNALS, TREES, HIT } from './layout.js';

export const CU = {
  uTime: { value: 0 }, uAlert: { value: 0 }, uBlastR: { value: -1 }, uHit: { value: new THREE.Vector2(HIT.x, HIT.z) },
  uSun: { value: new THREE.Vector3(0.5, 0.75, 0.4) }, uFireL: { value: 0 }, uSkyK: { value: 1 },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uAlert; uniform float uBlastR; uniform vec2 uHit; uniform vec3 uSun; uniform float uFireL; uniform float uSkyK;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
// the day sky in a mirror: pale low down, deep blue up high, warm toward the Sun, the city below
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 sd = normalize(vec3(uSun.x, 0.0, uSun.z));
  float cs = max(dot(normalize(vec3(r.x, 0.0, r.z) + 1e-5), sd), 0.0);
  vec3 low = mix(vec3(0.70, 0.79, 0.90), vec3(0.95, 0.9, 0.8), pow(cs, 3.0));
  vec3 c = mix(low, vec3(0.13, 0.30, 0.70), pow(smoothstep(0.0, 0.7, h), 0.7));
  c += vec3(3.0, 2.7, 2.2) * pow(max(dot(normalize(r), normalize(uSun)), 0.0), 700.0);
  c = mix(c, vec3(0.36, 0.34, 0.32), smoothstep(0.0, -0.12, r.y));
  c = mix(c, c * vec3(1.0, 0.7, 0.45) + vec3(0.3, 0.12, 0.03), uFireL * 0.6);
  // after the hit the sky over the city is dust: the glass goes dull
  return mix(c, vec3(0.32, 0.22, 0.14) * (0.5 + 0.5 * max(r.y, 0.0)), 1.0 - uSkyK);
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
    // the blast: the front passes this building at past = 0 (windows burst a little before, staggered), then soot
    float rr = length(vIC - uHit);
    float past = uBlastR > 0.0 ? uBlastR - rr : -1e4;
    float tb = past + 22.0 * h21(id * 0.37 + seed) + 8.0;         // how far the front has gone since this pane broke
    float broken = step(0.0, tb);
    float burst = broken * exp(-max(tb, 0.0) / 5.0);
    float soot = smoothstep(0.0, 60.0, past);
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      vec3 N = normalize(vWN);
      vec3 refl = skyRefl(reflect(V, N));
      float fres = 0.18 + 0.82 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 col = base; float win = 0.0;
      if (kind > 0.5 && kind < 1.5) {
        // glass tower: curtain wall, mullions, a floor band
        win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
        vec3 glass = mix(base * 0.22, refl * mix(vec3(1.0), base * 1.6, 0.3), 0.55 + 0.45 * fres);
        glass = mix(glass, vec3(0.03, 0.03, 0.035), broken);
        col = mix(base * 0.5, glass, mix(win, 0.88 * ok, far));
        totalEmissiveRadiance += refl * (0.1 + 0.25 * fres) * mix(win, 0.88 * ok, far) * (1.0 - broken) * 0.9;
      } else if (kind > 1.5 && kind < 2.5) {
        // older stone: smaller windows with sills, string courses, a cornice
        win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), refl * 0.6, 0.35 * fres) * (0.8 + 0.4 * r);
        glass = mix(glass, vec3(0.02), broken);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.5);
        float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
        col = mix(col, base * 1.14, course * (1.0 - far));
        col = mix(col, base * 0.92, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
      } else {
        // concrete and stone offices (and the far city, the tall towers): punched windows, a darker spandrel
        vec2 a = kind > 3.5 ? vec2(0.08, 0.2) : vec2(0.16, 0.22), b = kind > 3.5 ? vec2(0.92, 0.9) : vec2(0.84, 0.86);
        win = rect(f, a, b, fw) * ok;
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), refl * 0.65, 0.4 * fres) * (0.8 + 0.4 * r);
        glass = mix(glass, vec3(0.02), broken);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.75 + glass * 0.25, far * ok * 0.55);
        col = mix(col, base * 0.86, step(f.y, 0.2) * ok * (1.0 - far));
        totalEmissiveRadiance += refl * 0.1 * fres * win * (1.0 - broken);
      }
      // the panes flash as they burst (shards catching every light at once)
      totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * 1.6 * burst * max(win, 0.4 * far * ok);
      // street level: shop fronts (dark glass, an awning band, a fascia), lobbies on the towers
      if (y < g0 && kind < 2.5) {
        float nb = max(1.0, floor(W / 5.5));
        float bw = W / nb;
        float bay = fract(u / bw);
        float bid = floor(u / bw);
        float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(0.55, 0.45, 0.35), vec3(0.4, 0.45, 0.5), step(0.55, h21(vec2(bid, seed)))) * (0.6 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
        vec3 shopGlass = mix(inside * 0.35, refl * 0.5, 0.45 * fres);
        col = mix(base * 0.7, mix(shopGlass, vec3(0.02), broken), pane);
        float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
        vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.45);
        col = mix(col, bc, band * step(0.4, h21(vec2(bid + 7.0, seed))));
        col = mix(col, vec3(0.2, 0.19, 0.18), band * step(h21(vec2(bid + 7.0, seed)), 0.4));
        totalEmissiveRadiance += pane * inside * 0.25 * (1.0 - broken);
      }
      diffuseColor.rgb = col;
    } else {
      // roofs: grey, grimy, a lighter parapet
      diffuseColor.rgb = base * 0.42 + 0.04 * h21(floor(vWP.xz * 0.5));
      vec2 rq = abs(vLoc.xz) - 0.46;
      diffuseColor.rgb = mix(diffuseColor.rgb, base * 0.7, step(0.0, max(rq.x, rq.y)));
    }
    // behind the front: soot, and the fires lit by the fireball
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.22, 0.2, 0.19), soot);
    float flick = 0.7 + 0.3 * sin(uTime * 9.0 + seed * 3.0) * sin(uTime * 4.3 + vWP.y * 0.3);
    totalEmissiveRadiance += vec3(2.4, 0.7, 0.12) * soot * exp(-max(rr - 90.0, 0.0) / 240.0) * flick * (0.4 + 0.6 * h21(vec2(seed, floor(y / 3.4))));
  }
`;

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol;
        uniform float uBlastR; uniform vec2 uHit;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;
        float hv21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vIC = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        // the buildings nearest the hit crumple as the front passes (sink and lean), the rest stand and burn
        {
          float rr = length(vIC - uHit);
          float past = uBlastR > 0.0 ? uBlastR - rr : -1e4;
          float fall = clamp((past - 6.0) / 70.0, 0.0, 1.0) * smoothstep(420.0, 260.0, rr);
          float lean = fall * (0.6 + 0.4 * hv21(vIC));
          vec2 away = normalize(vIC - uHit + vec2(1e-3));
          transformed.y *= 1.0 - 0.93 * fall;
          transformed.x += away.x * lean * transformed.y * aS.w * 0.35;
          transformed.z += away.y * lean * transformed.y * aS.w * 0.35;
        }
        vLoc = position - vec3(0.0, 0.5, 0.0); vON = normal; vS = aS; vCol = aCol;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wpp.xyz; }
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'rod-facade-v1';
  return m;
}

// ---- the screens' pictures: 8 ads + the alert, 512 x 288 each in a 2048 x 1152 atlas (4 x 4) ----
const ADS = [['SUMMER SALE', '#ffffff', '#e23a6a'], ['NEW SEASON', '#ffe66a', '#1a3a8a'], ['LIVE TONIGHT', '#ffffff', '#101a50'], ['FRESH DAILY', '#ffffff', '#2a8a3a'],
  ['BIG GAME', '#ffffff', '#8a1a1a'], ['CITY TOURS', '#ffffff', '#1a7a9a'], ['ICE CREAM', '#ff5a8a', '#fff0d0'], ['NOW SHOWING', '#ffd23a', '#201030']];
function makeScreenAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1152;
  const g = cv.getContext('2d');
  // text that fits the picture: a line wider than its 512 px cell would be cut off on the board
  const fit = (text, weight, size, x, y) => { g.font = `${weight} ${size}px Georgia, serif`; const w = g.measureText(text).width; if (w > 480) { g.font = `${weight} ${size * 480 / w}px Georgia, serif`; } g.fillText(text, x, y); };
  ADS.forEach(([word, c1, c2], i) => {
    const x0 = (i % 4) * 512, y0 = Math.floor(i / 4) * 288;
    const gr = g.createLinearGradient(x0, y0, x0 + 512, y0 + 288);
    gr.addColorStop(0, c2); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(x0, y0, 512, 288);
    for (let k = 0; k < 6; k++) { g.fillStyle = c1 + '44'; g.beginPath(); g.arc(x0 + 60 + k * 80, y0 + 220 - (k % 3) * 40, 30 + k * 6, 0, 7); g.fill(); }
    g.font = `900 ${Math.min(110, 820 / word.length)}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 12; g.fillStyle = c1; g.fillText(word, x0 + 256, y0 + 120);
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = '700 30px Georgia, serif'; g.fillText(['ALL WEEK', 'IN STORE', 'ON NOW', 'TODAY ONLY'][i % 4], x0 + 256, y0 + 215);
  });
  // the alert (cells 8 and 9: two frames that alternate)
  for (let k = 0; k < 2; k++) {
    const x0 = k * 512, y0 = 576;
    g.fillStyle = k ? '#d01010' : '#200000'; g.fillRect(x0, y0, 512, 288);
    g.fillStyle = k ? '#200000' : '#ff2020'; g.fillRect(x0, y0 + 10, 512, 50); g.fillRect(x0, y0 + 228, 512, 50);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    fit('EMERGENCY ALERT', 900, 60, x0 + 256, y0 + 112);
    fit('TAKE SHELTER', 900, 54, x0 + 256, y0 + 176);
    g.fillStyle = k ? '#fff' : '#ff8080'; fit('OBJECT FALLING - GET UNDERGROUND', 700, 26, x0 + 256, y0 + 253);
  }
  // cell 10: a news picture: the rod over a skyline
  {
    const x0 = 1024, y0 = 576;
    const gr = g.createLinearGradient(x0, y0, x0, y0 + 288);
    gr.addColorStop(0, '#1a3a7a'); gr.addColorStop(1, '#8ab0e0');
    g.fillStyle = gr; g.fillRect(x0, y0, 512, 288);
    g.fillStyle = '#243040';
    for (let b = 0; b < 14; b++) { const h = 40 + ((b * 37) % 90); g.fillRect(x0 + b * 37, y0 + 236 - h, 30, h); }
    g.fillStyle = '#c8ccd2'; g.fillRect(x0 + 300, y0 + 20, 16, 150); g.beginPath(); g.moveTo(x0 + 300, y0 + 170); g.lineTo(x0 + 316, y0 + 170); g.lineTo(x0 + 308, y0 + 196); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(x0 + 304, y0 + 20, 4, 150);
    g.fillStyle = '#d01010'; g.fillRect(x0, y0 + 236, 512, 52);
    g.fillStyle = '#fff'; g.textAlign = 'center'; fit('BREAKING: ROD FALLING ON THE CITY', 900, 34, x0 + 256, y0 + 263);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---- painted shop signs: 8 of them, 1024 x 128 each (2 columns x 4 rows in a 2048 x 512 atlas) ----
const SHOPS = [['CAFE', '#7a3a1a', '#f6e8d0'], ['PHARMACY', '#1a6a3a', '#ffffff'], ['BOOKS', '#2a3a6a', '#f0e0b0'], ['BANK', '#2b2b2b', '#e8d8a8'],
  ['MARKET', '#b03020', '#ffffff'], ['PIZZA', '#d8c030', '#201010'], ['HOTEL', '#1a1a2a', '#f0c060'], ['OPTICIAN', '#2a7a9a', '#ffffff']];
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
  // ---- buildings ----
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const n = BLD.length;
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
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
  mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);

  // ---- screens ----
  const scrTex = makeScreenAtlas();
  const SU = { uTime: CU.uTime, uAlert: CU.uAlert, uBlastR: CU.uBlastR, uHit: CU.uHit, uTex: { value: scrTex } };
  const scrMat = new THREE.ShaderMaterial({
    uniforms: SU,
    vertexShader: /* glsl */ `attribute float aSeed; varying vec2 vUv; varying float vSeed; varying vec2 vC;
      void main(){ vUv = uv; vSeed = aSeed; vC = vec2(instanceMatrix[3].x, instanceMatrix[3].z); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uAlert; uniform float uBlastR; uniform vec2 uHit; uniform sampler2D uTex; varying vec2 vUv; varying float vSeed; varying vec2 vC;
      float h11(float x){ return fract(sin(x * 91.7) * 43758.5); }
      vec3 cell(float i, vec2 uv) { vec2 o = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)); return texture2D(uTex, (o + uv) / vec2(4.0, 4.0)).rgb; }
      void main(){
        float t = uTime + vSeed * 3.7;
        float k = floor(t / 3.2), u = fract(t / 3.2);
        float a = mod(k + vSeed * 3.0, 8.0), b = mod(k + 1.0 + vSeed * 3.0, 8.0);
        float sl = smoothstep(0.88, 1.0, u);
        vec2 uv = vUv;
        vec3 ad = vUv.x > sl ? cell(a, vec2(uv.x - sl, uv.y)) : cell(b, vec2(uv.x + 1.0 - sl, uv.y));
        ad *= 0.9 + 0.1 * sin(uTime * 2.0 + vUv.x * 6.0);
        float alertOn = step(vSeed * 0.04, uAlert - 0.02);
        float fl = step(0.5, fract(uTime * 1.6 + vSeed * 0.3));
        vec3 al = mod(floor(uTime / 2.4 + vSeed), 3.0) < 1.0 ? cell(10.0, uv) : cell(8.0 + fl, uv);
        vec3 c = mix(ad, al, alertOn);
        // the LED dots; once a dot is smaller than a video pixel they fade to an even tone (or they shimmer like static)
        vec2 led = vUv * vec2(160.0, 90.0);
        vec2 px = fract(led);
        float ledW = max(fwidth(led.x), fwidth(led.y));
        c *= mix(0.8 + 0.2 * smoothstep(0.0, 0.25, px.x) * smoothstep(0.0, 0.25, px.y), 0.9, smoothstep(0.2, 0.6, ledW));
        float dead = uBlastR > 0.0 ? step(length(vC - uHit), uBlastR + 25.0) : 0.0;
        gl_FragColor = vec4(c * 2.6 * (1.0 - dead) + vec3(0.02) * dead, 1.0);
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
  const frameMat = ctx.plainMat(0x15161a, 0.6);
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, SCREENS.length);
  SCREENS.forEach((s, i) => {
    m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w + 0.8, s.h + 0.8, 0.5)).setPosition(s.x - Math.sin(s.yaw) * 0.3, s.y, s.z - Math.cos(s.yaw) * 0.3);
    frames.setMatrixAt(i, m4);
  });
  frames.frustumCulled = false;
  scene.add(frames);

  // ---- shop signs ----
  const signTex = makeSignAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 });
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  // each sign shows one cell: shift the uv per instance with a tiny custom attribute + onBeforeCompile
  const aCell = new Float32Array(SIGNS.length);
  SIGNS.forEach((s, i) => {
    m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w, s.h, 1)).setPosition(s.x, s.y, s.z);
    signs.setMatrixAt(i, m4);
    aCell[i] = s.cell;
  });
  signGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 1));
  signMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((mod(aCell, 2.0) + uv.x) / 2.0, 1.0 - (floor(aCell / 2.0) + 1.0 - uv.y) / 4.0);`);
  };
  signMat.customProgramCacheKey = () => 'rod-sign-v1';
  signs.frustumCulled = false;
  scene.add(signs);

  // ---- lamps (poles, arms, heads), signals ----
  const poleMat = ctx.plainMat(0x4a4d52, 0.55, { metalness: 0.5 });
  const nPoles = LAMPS.length + SIGNALS.length * 2;
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), poleMat, nPoles);
  let k = 0;
  for (const l of LAMPS) poles.setMatrixAt(k++, m4.makeScale(0.2, 9.5, 0.2).setPosition(l.x, 0, l.z));
  for (const s of SIGNALS) {
    poles.setMatrixAt(k++, m4.makeScale(0.2, 5.2, 0.2).setPosition(s.x, 0, s.z));
    poles.setMatrixAt(k++, m4.makeScale(0.5, 1.2, 0.35).setPosition(s.x, 4.3, s.z));
  }
  poles.frustumCulled = false; poles.castShadow = true;
  scene.add(poles);
  const nArms = LAMPS.reduce((a, l) => a + l.arms, 0);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), poleMat, nArms);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x2a2c30, 0.5), nArms);
  k = 0;
  for (const l of LAMPS) {
    const dirs = l.arms === 2 ? [-1, 1] : [l.x < 0 ? 1 : l.x > 0 ? -1 : 1];
    for (const d of dirs) {
      const along = Math.abs(l.z) < 11 ? 'z' : 'x';     // lamps on the cross street reach over it
      if (along === 'x') {
        arms.setMatrixAt(k, m4.makeScale(2.4, 0.12, 0.12).setPosition(l.x + d * 1.2, 9.3, l.z));
        heads.setMatrixAt(k, m4.makeScale(0.7, 0.22, 0.34).setPosition(l.x + d * 2.4, 9.25, l.z));
      } else {
        const dz = l.z > 0 ? -1 : 1;
        arms.setMatrixAt(k, m4.makeScale(0.12, 0.12, 2.4).setPosition(l.x, 9.3, l.z + dz * 1.2));
        heads.setMatrixAt(k, m4.makeScale(0.34, 0.22, 0.7).setPosition(l.x, 9.25, l.z + dz * 2.4));
      }
      k++;
    }
  }
  arms.frustumCulled = false; heads.frustumCulled = false;
  scene.add(arms, heads);

  // ---- trees on the median ----
  const trunkMat = ctx.plainMat(0x4a3a2a, 0.9);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 7).translate(0, 0.5, 0), trunkMat, TREES.length);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), leafMat, TREES.length);
  TREES.forEach((t, i) => {
    trunks.setMatrixAt(i, m4.makeScale(1, t.h * 0.55, 1).setPosition(t.x, 0, t.z));
    leaves.setMatrixAt(i, m4.makeScale(t.r, t.r * 0.85, t.r).setPosition(t.x, t.h * 0.55 + t.r * 0.55, t.z));
    leaves.setColorAt(i, col.setHSL(0.25 + 0.06 * t.seed, 0.45, 0.28 + 0.1 * t.seed));
  });
  trunks.frustumCulled = false; leaves.frustumCulled = false;
  leaves.castShadow = true; trunks.castShadow = true; leaves.receiveShadow = true;
  scene.add(trunks, leaves);

  return {
    SU, mesh,
    // the lights that are glows (the signals' lamps; the brake lights are in traffic.js), each frame
    glows(glows, v, s) {
      for (const sg of SIGNALS) {
        // the scramble phase: the cars' lights red, the walk lights green (until the power goes with the blast)
        const on = s.front > 0 && Math.hypot(sg.x - HIT.x, sg.z - HIT.z) < s.front + 20 ? 0 : 1;
        glows.add(sg.x, 4.75, sg.z, 0.5, 4.0 * on, 0.25 * on, 0.12 * on);
        glows.add(sg.x, 4.0, sg.z, 0.42, 0.2 * on, 3.0 * on, 1.2 * on);
      }
    },
  };
}
