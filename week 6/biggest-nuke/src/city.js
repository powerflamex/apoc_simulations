// The buildings, big screens, shop signs, lamps, stalls, bulbs and trees, at dusk, with every window, sign and screen lit.
// One instanced box per building with its front drawn in the shader (lit window grids, glass towers, older stone blocks
// with cornices, lit shop fronts at street level). The blackout (uPowerR: how far it has spread from the middle of the
// city) puts out the windows, signs and screens; the heat (uBurn) lights curtains behind the glass; the blast front
// (uBlastR: its distance from ground zero) bursts every window it passes, blackens the fronts, and brings the building
// down, leaning toward you, a tall one over a few seconds.
import * as THREE from 'three';
import { BLD, SCREENS, SIGNS, LAMPS, TREES, STALLS, BULBS, HEROES, HIT, PLAIN, groundY } from './layout.js';

export const CU = {
  uTime: { value: 0 }, uAlert: { value: 0 }, uBlastR: { value: -1 }, uHit: { value: new THREE.Vector2(HIT.x, HIT.z) },
  uSun: { value: new THREE.Vector3(0.5, 0.75, 0.4) }, uFireL: { value: 0 }, uSkyK: { value: 1 },
  uPowerR: { value: 0 }, uBurn: { value: 0 }, uFbC: { value: new THREE.Color(1, 1, 1) }, uHaze: { value: new THREE.Color(0.1, 0.1, 0.15) },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uAlert; uniform float uBlastR; uniform vec2 uHit; uniform vec3 uSun; uniform float uFireL; uniform float uSkyK;
uniform float uPowerR; uniform float uBurn; uniform vec3 uFbC; uniform vec3 uHaze;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
// the evening in a mirror: dark blue up high, the glow low down, the fireball itself as a hard glint
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 c = mix(vec3(0.2, 0.19, 0.28), vec3(0.03, 0.06, 0.15), pow(smoothstep(0.0, 0.7, h), 0.7));
  float cs = max(dot(normalize(r), uSun), 0.0);
  c += uFbC * (0.012 * pow(cs, 6.0) + 0.5 * pow(cs, 90.0));
  c = mix(c, vec3(0.1, 0.09, 0.09), smoothstep(0.0, -0.12, r.y));
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
    // the blackout: each building's lights go as it reaches it (and stay out)
    float seedR = h21(vec2(seed, 5.0));
    float power = step(uPowerR, rr - 120.0 * seedR);
    float nearK = smoothstep(9000.0, 500.0, length(vWP - cameraPosition));
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      vec3 N = normalize(vWN);
      vec3 refl = skyRefl(reflect(V, N));
      float fres = 0.18 + 0.82 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 col = base; float win = 0.0;
      // who's home: about half the windows lit, warm or office white; a far building's lit share is an even tone
      float lit = step(0.46, h21(id * 1.31 + vec2(seed * 0.71, face)));
      vec3 room = mix(vec3(1.0, 0.72, 0.42), vec3(0.86, 0.92, 1.0), step(0.72, h21(id + vec2(seed, 2.0))));
      room *= 0.65 + 0.7 * h21(id * 2.1 + seed);
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
      // the rooms' lights, then, once the heat comes, a few curtains on fire behind the glass
      float rows = step(g0, y) * ok;
      float wv = mix(win, 0.8, far) * rows * (1.0 - broken);
      totalEmissiveRadiance += room * mix(lit, 0.46, far) * wv * power * (kind > 2.5 ? 1.1 : 0.85);
      float cg = step(1.0 - 0.04 * uBurn, h21(id * 3.3 + vec2(seed, face)));
      float fliC = 0.7 + 0.3 * sin(uTime * 11.0 + r * 40.0);
      totalEmissiveRadiance += vec3(2.4, 0.6, 0.08) * mix(cg, 0.07 * uBurn, far) * wv * fliC;
      // the panes flash as they burst (shards catching every light at once)
      totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * 0.8 * burst * max(win, 0.3 * far * ok);
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
        totalEmissiveRadiance += pane * inside * 1.3 * (1.0 - broken) * power;
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
    totalEmissiveRadiance += vec3(2.4, 0.7, 0.12) * soot * flick * (0.2 + 0.4 * h21(vec2(seed, floor(y / 3.4))));
    // red lights on the tall roofs, while the power's on
    if (H > 300.0 && y > H - 9.0) totalEmissiveRadiance += vec3(4.0, 0.3, 0.2) * power * step(0.0, sin(uTime * 3.0 + seed)) * nearK;
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
        // the front brings it down: it sinks and leans away from ground zero (toward you); a tall one takes seconds
        {
          float rr = length(vIC - uHit);
          float past = uBlastR > 0.0 ? uBlastR - rr : -1e4;
          float fall = clamp((past - 10.0) / (70.0 + aS.w * 1.0), 0.0, 1.0);
          fall = fall * fall * (3.0 - 2.0 * fall);
          float lean = fall * (0.6 + 0.4 * hv21(vIC));
          vec2 away = normalize(vIC - uHit + vec2(1e-3));
          float yy = transformed.y;
          transformed.y *= 1.0 - 0.92 * fall;
          transformed.x += away.x * lean * yy * yy * aS.w * 0.55 / length(instanceMatrix[0].xyz);
          transformed.z += away.y * lean * yy * yy * aS.w * 0.55 / length(instanceMatrix[2].xyz);
        }
        vLoc = position - vec3(0.0, 0.5, 0.0); vON = normal; vS = aS; vCol = aCol;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wpp.xyz; }
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vWP - cameraPosition) / 14000.0));`);
  };
  m.customProgramCacheKey = () => 'nuke-facade-v1';
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

  // ---- screens ----
  const scrTex = makeScreenAtlas();
  const SU = { uTime: CU.uTime, uPowerR: CU.uPowerR, uHit: CU.uHit, uTex: { value: scrTex } };
  const scrMat = new THREE.ShaderMaterial({
    uniforms: SU,
    vertexShader: /* glsl */ `attribute float aSeed; varying vec2 vUv; varying float vSeed; varying vec2 vC;
      void main(){ vUv = uv; vSeed = aSeed; vC = vec2(instanceMatrix[3].x, instanceMatrix[3].z); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uPowerR; uniform vec2 uHit; uniform sampler2D uTex; varying vec2 vUv; varying float vSeed; varying vec2 vC;
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
        vec3 c = ad;
        // the LED dots; once a dot is smaller than a video pixel they fade to an even tone (or they shimmer like static)
        vec2 led = vUv * vec2(160.0, 90.0);
        vec2 px = fract(led);
        float ledW = max(fwidth(led.x), fwidth(led.y));
        c *= mix(0.8 + 0.2 * smoothstep(0.0, 0.25, px.x) * smoothstep(0.0, 0.25, px.y), 0.9, smoothstep(0.2, 0.6, ledW));
        float dead = step(length(vC - uHit) + 40.0 * vSeed, uPowerR);
        gl_FragColor = vec4(c * 1.7 * (1.0 - dead) + vec3(0.012) * dead, 1.0);
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
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.1 });
  const SIGN_K = signMat;
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
        vMapUv = vec2((mod(aCell, 2.0) + uv.x) / 2.0, 1.0 - (floor(aCell / 2.0) + 1.0 - uv.y) / 4.0);
        vEmissiveMapUv = vMapUv;`);
  };
  signMat.customProgramCacheKey = () => 'nuke-sign-v1';
  signs.frustumCulled = false;
  scene.add(signs);

  // ---- lamps (poles, arms, heads), signals ----
  const poleMat = ctx.plainMat(0x4a4d52, 0.55, { metalness: 0.5 });
  const nPoles = LAMPS.length;
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), poleMat, nPoles);
  let k = 0;
  for (const l of LAMPS) poles.setMatrixAt(k++, m4.makeScale(0.2, 9.5, 0.2).setPosition(l.x, l.y, l.z));
  poles.frustumCulled = false; poles.castShadow = true;
  scene.add(poles);
  const nArms = LAMPS.length;
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), poleMat, nArms);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x2a2c30, 0.5), nArms);
  k = 0;
  for (const l of LAMPS) {
    const d = l.x < 0 ? 1 : -1;
    arms.setMatrixAt(k, m4.makeScale(2.4, 0.12, 0.12).setPosition(l.x + d * 1.2, l.y + 9.3, l.z));
    heads.setMatrixAt(k, m4.makeScale(0.7, 0.22, 0.34).setPosition(l.x + d * 2.4, l.y + 9.25, l.z));
    k++;
  }
  arms.frustumCulled = false; heads.frustumCulled = false;
  scene.add(arms, heads);

  // ---- trees on the median ----
  const trunkMat = ctx.plainMat(0x4a3a2a, 0.9);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 7).translate(0, 0.5, 0), trunkMat, TREES.length);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), leafMat, TREES.length);
  TREES.forEach((t, i) => {
    trunks.setMatrixAt(i, m4.makeScale(1, t.h * 0.55, 1).setPosition(t.x, t.y, t.z));
    leaves.setMatrixAt(i, m4.makeScale(t.r, t.r * 0.85, t.r).setPosition(t.x, t.y + t.h * 0.55 + t.r * 0.55, t.z));
    leaves.setColorAt(i, col.setHSL(0.25 + 0.06 * t.seed, 0.45, 0.28 + 0.1 * t.seed));
  });
  trunks.frustumCulled = false; leaves.frustumCulled = false;
  leaves.castShadow = true; trunks.castShadow = true; leaves.receiveShadow = true;
  scene.add(trunks, leaves);

  // ---- the food stalls: a counter, a lit canopy ----
  const stallMat = ctx.plainMat(0x3a2e24, 0.8);
  const counters = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), stallMat, STALLS.length);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const canopies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), canopyMat, STALLS.length);
  STALLS.forEach((st, i) => {
    const y = groundY(st.z);
    counters.setMatrixAt(i, m4.makeScale(st.w, 1.1, st.d).setPosition(st.x, y, st.z));
    canopies.setMatrixAt(i, m4.makeScale(st.w + 0.7, 0.16, st.d + 0.7).setPosition(st.x, y + 2.6, st.z));
    canopies.setColorAt(i, col.set(st.col));
  });
  counters.frustumCulled = false; canopies.frustumCulled = false;
  counters.castShadow = true; canopies.castShadow = true; canopies.receiveShadow = true;
  scene.add(counters, canopies);

  return {
    SU, mesh,
    // the lights that are glows: lamps, bulbs, stalls and the red lights on the tall roofs. Each goes as the blackout reaches it
    glows(glows, v, s) {
      SIGN_K.emissiveIntensity = 1.1 * (1 - s.dark);
      const out = (x, z, k) => (Math.hypot(x - HIT.x, z - HIT.z) + 90 * k < s.powerR ? 0 : 1);
      for (const l of LAMPS) {
        if (out(l.x, l.z, 0.3)) glows.add(l.x + (l.x < 0 ? 2.4 : -2.4), l.y + 9.15, l.z, 2.6, 3.0, 2.0, 1.0);
      }
      for (const b of BULBS) {
        // (the last few flicker before they die)
        const e = s.powerR - Math.hypot(b.x - HIT.x, b.z - HIT.z);
        const fl = e > -700 ? (Math.sin(v * 61 + b.seed * 40) > 0.1 ? 1 : 0.2) : 1;
        if (e < 90 * b.seed) glows.add(b.x, b.y, b.z, 0.42, 4.2 * fl, 2.7 * fl, 1.1 * fl);
      }
      for (const st of STALLS) {
        if (out(st.x, st.z, st.seed)) glows.add(st.x, groundY(st.z) + 2.2, st.z, 3.2, 1.1, 0.75, 0.4);
      }
      for (const h of HEROES) if (out(h.x, h.z, 0.5) && Math.sin(v * 2.6 + h.x) > 0) glows.add(h.x, PLAIN + h.h * 1.13, h.z, 42, 4, 0.3, 0.2);
    },
  };
}
