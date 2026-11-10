// The buildings, big screens, shop signs, awnings, lamps, trees and benches, on a sunny day. One instanced box per
// building with its front drawn in the shader (window grids that mirror the sky, glass towers, older stone blocks with
// cornices, shop fronts at street level). The cold: the frost front (uFront, a world z) frosts every pane it passes,
// feathers of rime climbing from the sills; the frozen air whitens roofs and ledges; at 0:36 cracks run up the fronts
// and the glass turns white as it shatters; at 0:39 the tower on the right breaks at a third of its height and its top
// goes over into the bay.
import * as THREE from 'three';
import { BLD, SCREENS, SIGNS, LAMPS, TREES, AWNINGS, BENCHES, HERO, groundY } from './layout.js';
import { FU, frostify } from './frost.js';

export const CU = {
  uTime: FU.uTime, uFront: FU.uFront, uFrost: FU.uFrost, uCover: FU.uCover,
  uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
  uCrack: { value: 0 }, uFall: { value: 0 }, uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 9000 }, uPale: { value: 0 },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uFront; uniform float uFrost; uniform float uCover; uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo;
uniform float uCrack; uniform float uFall; uniform vec3 uHaze; uniform float uHazeD; uniform float uPale;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
// the day in a mirror: the sky's blue, brighter at the horizon; the ground's warm grey below
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += vec3(1.0, 0.95, 0.85) * 1.5 * pow(max(dot(normalize(r), uSun), 0.0), 120.0);
  return mix(c, vec3(0.32, 0.31, 0.3) + 0.4 * uCover, smoothstep(0.0, -0.15, r.y));
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
    // the frost: this front frosted once the front passed it; rime feathers up each pane from its sill
    float passed = smoothstep(uFront + 2.0, uFront - 8.0, vWP.z);
    float fr = uFrost * passed;
    float fern = n21(vec2(u * 3.0, y * 2.0)) * 0.5 + n21(vec2(u * 9.0, y * 7.0)) * 0.5;
    // the cracks: jagged lines that climb each front from the ground (the hero's run the whole way)
    float cseed = h21(vec2(seed, 9.0));
    float climb = clamp(uCrack * (1.3 + 0.8 * cseed) - 0.15 * cseed, 0.0, 1.2) * H;
    // plates of the front split along a jagged net (a warped Voronoi), cell by cell as it gets colder
    vec2 cq = vec2(u, y) / 6.5 + vec2(seed * 0.37, face * 3.1);
    cq += 0.35 * vec2(n21(cq * 2.3), n21(cq * 2.3 + 7.0)) - 0.17;
    vec2 ci = floor(cq), cf = fract(cq); float e1 = 9.0, e2 = 9.0; vec2 cid = vec2(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)); vec2 rr = o + vec2(h21(ci + o), h21(ci + o + 13.0)) - cf;
      float dd = dot(rr, rr);
      if (dd < e1) { e2 = e1; e1 = dd; cid = ci + o; } else if (dd < e2) e2 = dd;
    }
    float edgeD = sqrt(e2) - sqrt(e1);
    float cellOn = step(h21(cid + seed), uCrack * 1.25 - 0.1) * step(y, climb);
    float ew = max(fwidth(edgeD), 1e-4);
    float crack = (1.0 - smoothstep(0.02, 0.05 + 1.2 * ew, edgeD)) * cellOn;
    // in a cracked plate, about half the panes have fallen out: dark holes in the white front
    float shat = cellOn * step(0.68, h21(id * 1.7 + seed));
    if (abs(vON.y) < 0.5) {
      float r = h21(id + vec2(seed * 0.173, face * 1.37));
      vec3 N = normalize(vWN);
      vec3 refl = skyRefl(reflect(V, N));
      float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
      vec3 col = base; float win = 0.0;
      vec3 room = vec3(0.16, 0.15, 0.14) * (0.6 + 0.8 * h21(id * 2.1 + seed));
      if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
        // glass: curtain wall, mullions, a floor band
        win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
        vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
        col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
        totalEmissiveRadiance += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9;
      } else if (kind > 1.5 && kind < 2.5) {
        // older stone: smaller windows with sills, string courses, a cornice
        win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
        vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
        float course = step(0.86, f.y) * step(f.y, 0.92) * ok;
        col = mix(col, base * 1.12, course * (1.0 - far));
        col = mix(col, base * 0.9, smoothstep(H - 2.6, H - 2.3, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
        totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far);
      } else {
        // concrete and stone offices and the city behind: punched windows, a darker spandrel
        win = rect(f, vec2(0.16, 0.22), vec2(0.84, 0.86), fw) * ok;
        vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
        col = mix(base, glass, win * (1.0 - far));
        col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.55);
        col = mix(col, base * 0.88, step(f.y, 0.2) * ok * (1.0 - far));
        totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far);
      }
      // street level: shop fronts (glass, a fascia band)
      if (y < g0 && kind < 2.5) {
        float nb = max(1.0, floor(W / 5.5));
        float bw = W / nb;
        float bay = fract(u / bw);
        float bid = floor(u / bw);
        float pane = step(0.3, y) * step(y, g0 - 1.7) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(0.55, 0.45, 0.35), vec3(0.4, 0.45, 0.5), step(0.55, h21(vec2(bid, seed)))) * (0.5 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
        vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
        col = mix(base * 0.75, shopGlass, pane);
        float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
        vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.4);
        col = mix(col, bc, band * step(0.4, h21(vec2(bid + 7.0, seed))));
        totalEmissiveRadiance += pane * inside * 0.35 * (1.0 - fr);
        win = max(win, pane);
      }
      // frost: panes go white from the sill up, the walls take a thin coat
      float wk = mix(win, 0.6 * ok, far);
      float paneF = fr * smoothstep(1.0 - (0.4 + 0.6 * uFrost), 1.05 - (0.4 + 0.6 * uFrost), (1.0 - f.y) * 0.6 + fern * 0.5);
      col = mix(col, vec3(0.86, 0.92, 0.98), clamp(paneF * wk + fr * 0.28 * (0.5 + fern), 0.0, 1.0));
      totalEmissiveRadiance *= 1.0 - 0.75 * paneF * wk;
      totalEmissiveRadiance += vec3(0.07, 0.08, 0.1) * paneF * wk;
      // the cracks, and the holes where the glass has gone
      col = mix(col, vec3(0.03, 0.035, 0.05), shat * wk * (1.0 - far * 0.4));
      totalEmissiveRadiance *= 1.0 - shat * wk;
      col = mix(col, vec3(0.04, 0.05, 0.08), crack * (1.0 - far * 0.3));
      totalEmissiveRadiance *= 1.0 - crack;
      // frozen air on every ledge
      col = mix(col, vec3(0.94, 0.96, 1.0), uCover * (step(0.88, f.y) * ok * 0.8 + step(y, 0.6) + 0.12) * (1.0 - max(crack, shat * wk)));
      diffuseColor.rgb = col;
    } else {
      // roofs: grey; white with rime, then the frozen air
      diffuseColor.rgb = base * 0.55 + 0.04 * h21(floor(vWP.xz * 0.5));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.97), fr * 0.7);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), uCover);
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
        uniform float uFall;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol; varying vec2 vIC;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vIC = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        // the tower that shatters: above its break the top goes over sideways in one piece, hinged at the break's east edge,
        // and drops as it goes
        if (aS.z > 1.0 && uFall > 0.0) {
          float sy = length(instanceMatrix[1].xyz), sxx = length(instanceMatrix[0].xyz);
          float wy = transformed.y * sy, wx = transformed.x * sxx, h0 = aS.z;
          float th = 1.45 * uFall * uFall;
          if (wy > h0) {
            vec2 p = vec2(wx - ${(HERO.w / 2).toFixed(1)}, wy - h0);
            vec2 q = vec2(p.x * cos(th) + p.y * sin(th), -p.x * sin(th) + p.y * cos(th));
            wx = q.x + ${(HERO.w / 2).toFixed(1)}; wy = q.y + h0;
            wy -= 60.0 * uFall * uFall * uFall;
            wx += 30.0 * uFall * uFall;
          }
          transformed.y = wy / sy; transformed.x = wx / sxx;
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
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vWP - cameraPosition) / uHazeD));`);
  };
  m.customProgramCacheKey = () => 'freeze-facade-v1';
  return m;
}

// ---- the screens' pictures: 8 ads, 512 x 288 each in a 2048 x 1152 atlas (4 x 4) ----
const ADS = [['SUMMER SALE', '#ffffff', '#e23a6a'], ['ICE CREAM', '#ff5a8a', '#fff0d0'], ['BEACH DAYS', '#ffffff', '#1a7a9a'], ['FRESH DAILY', '#ffffff', '#2a8a3a'],
  ['BIG GAME', '#ffffff', '#8a1a1a'], ['CITY TOURS', '#ffffff', '#1a3a8a'], ['COLD DRINKS', '#ffe66a', '#1a2a6a'], ['NOW SHOWING', '#ffd23a', '#201030']];
function makeScreenAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1152;
  const g = cv.getContext('2d');
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
const SHOPS = [['CAFE', '#7a3a1a', '#f6e8d0'], ['PHARMACY', '#1a6a3a', '#ffffff'], ['BOOKS', '#2a3a6a', '#f0e0b0'], ['GELATO', '#e86a8a', '#ffffff'],
  ['MARKET', '#b03020', '#ffffff'], ['PIZZA', '#d8c030', '#201010'], ['HOTEL', '#1a1a2a', '#f0c060'], ['SURF SHOP', '#2a7a9a', '#ffffff']];
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
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 24, 1).translate(0, 0.5, 0);
  const n = BLD.length;
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  BLD.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
    mesh.setMatrixAt(i, m4);
    aS.set([(i * 0.6180339) % 1, b.kind, b.hero || 0, b.h], i * 4);
    col.set(b.col).convertSRGBToLinear();
    aCol.set([col.r, col.g, col.b], i * 3);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);

  // ---- screens (they die when the cold kills the power, with the cars) ----
  const scrTex = makeScreenAtlas();
  const SU = { uTime: CU.uTime, uOn: { value: 1 }, uFront: CU.uFront, uFrost: CU.uFrost, uTex: { value: scrTex } };
  const scrMat = new THREE.ShaderMaterial({
    uniforms: SU,
    vertexShader: /* glsl */ `attribute float aSeed; varying vec2 vUv; varying float vSeed; varying vec3 vW;
      void main(){ vUv = uv; vSeed = aSeed; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uOn; uniform float uFront; uniform float uFrost; uniform sampler2D uTex; varying vec2 vUv; varying float vSeed; varying vec3 vW;
      float h12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec3 cell(float i, vec2 uv) { vec2 o = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)); return texture2D(uTex, (o + uv) / vec2(4.0, 4.0)).rgb; }
      void main(){
        float t = uTime + vSeed * 3.7;
        float k = floor(t / 3.2), u = fract(t / 3.2);
        float a = mod(k + vSeed * 3.0, 8.0), b = mod(k + 1.0 + vSeed * 3.0, 8.0);
        float sl = smoothstep(0.88, 1.0, u);
        vec3 ad = vUv.x > sl ? cell(a, vec2(vUv.x - sl, vUv.y)) : cell(b, vec2(vUv.x + 1.0 - sl, vUv.y));
        vec2 led = vUv * vec2(160.0, 90.0);
        vec2 px = fract(led);
        float ledW = max(fwidth(led.x), fwidth(led.y));
        ad *= mix(0.8 + 0.2 * smoothstep(0.0, 0.25, px.x) * smoothstep(0.0, 0.25, px.y), 0.9, smoothstep(0.2, 0.6, ledW));
        // frost on the glass: white feathers from the edges in
        float passed = smoothstep(uFront + 2.0, uFront - 6.0, vW.z) * uFrost;
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float fz = smoothstep(0.05 + 0.4 * passed, 0.0 + 0.3 * passed, edge + 0.1 * h12(floor(vUv * 40.0)));
        vec3 c = ad * 1.5 * uOn + vec3(0.02);
        c = mix(c, vec3(0.75, 0.82, 0.9), fz * passed);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
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
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x15161a, 0.6), SCREENS.length);
  SCREENS.forEach((s, i) => {
    m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w + 0.8, s.h + 0.8, 0.5)).setPosition(s.x - Math.sin(s.yaw) * 0.3, s.y, s.z - Math.cos(s.yaw) * 0.3);
    frames.setMatrixAt(i, m4);
  });
  frames.frustumCulled = false;
  scene.add(frames);

  // ---- shop signs ----
  const signTex = makeSignAtlas();
  const signMat = frostify(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.25 }), { strength: 0.7 });
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const signs = new THREE.InstancedMesh(signGeo, signMat, SIGNS.length);
  const aCell = new Float32Array(SIGNS.length);
  SIGNS.forEach((s, i) => {
    m4.makeRotationY(s.yaw).scale(new THREE.Vector3(s.w, s.h, 1)).setPosition(s.x, s.y, s.z);
    signs.setMatrixAt(i, m4);
    aCell[i] = s.cell;
  });
  signGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 1));
  {
    const frostCompile = signMat.onBeforeCompile;
    signMat.onBeforeCompile = (shader, r) => {
      frostCompile(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = vec2((mod(aCell, 2.0) + uv.x) / 2.0, 1.0 - (floor(aCell / 2.0) + 1.0 - uv.y) / 4.0);
          vEmissiveMapUv = vMapUv;`);
    };
    signMat.customProgramCacheKey = () => 'freeze-sign-v1';
  }
  signs.frustumCulled = false;
  scene.add(signs);

  // ---- awnings over the shop fronts: a sloping striped canvas ----
  const awMat = ctx.plainMat(0xffffff, 0.85);
  const aw = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), awMat, AWNINGS.length);
  const e = new THREE.Euler(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
  AWNINGS.forEach((a, i) => {
    const side = Math.sign(a.x);
    e.set(0, 0, side * 0.32); qq.setFromEuler(e);
    m4.compose(pp.set(a.x - side * 0.15, 3.9 + groundY(a.z), a.z), qq, ss.set(2.2, 1, a.w));
    aw.setMatrixAt(i, m4);
    aw.setColorAt(i, col.set(a.col));
  });
  aw.castShadow = true; aw.receiveShadow = true; aw.frustumCulled = false;
  scene.add(aw);

  // ---- lamps ----
  const poleMat = ctx.plainMat(0x3a3d42, 0.55, { metalness: 0.4 });
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), poleMat, LAMPS.length);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), poleMat, LAMPS.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.plainMat(0x2a2c30, 0.5), LAMPS.length);
  LAMPS.forEach((l, k) => {
    const d = l.x < 0 ? 1 : -1;
    const gy = groundY(l.z);
    poles.setMatrixAt(k, m4.makeScale(0.2, 9.5, 0.2).setPosition(l.x, gy, l.z));
    arms.setMatrixAt(k, m4.makeScale(2.4, 0.12, 0.12).setPosition(l.x + d * 1.2, 9.3 + gy, l.z));
    heads.setMatrixAt(k, m4.makeScale(0.7, 0.22, 0.34).setPosition(l.x + d * 2.4, 9.25 + gy, l.z));
  });
  for (const m of [poles, arms, heads]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }

  // ---- trees in the plaza ----
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 7).translate(0, 0.5, 0), ctx.plainMat(0x4a3a2a, 0.9), TREES.length);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), ctx.plainMat(0xffffff, 0.9), TREES.length);
  const planters = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.5, 1.6).translate(0, 0.25, 0), ctx.plainMat(0x8a8378, 0.85), TREES.length);
  TREES.forEach((t, i) => {
    const gy = groundY(t.z);
    trunks.setMatrixAt(i, m4.makeScale(1, t.h * 0.55, 1).setPosition(t.x, gy, t.z));
    leaves.setMatrixAt(i, m4.makeScale(t.r, t.r * 0.85, t.r).setPosition(t.x, gy + t.h * 0.55 + t.r * 0.55, t.z));
    leaves.setColorAt(i, col.setHSL(0.27 + 0.05 * t.seed, 0.5, 0.3 + 0.1 * t.seed));
    planters.setMatrixAt(i, m4.makeTranslation(t.x, gy - 0.1, t.z));
  });
  for (const m of [trunks, leaves, planters]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // ---- benches ----
  const bench = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.45, 2.0).translate(0, 0.225, 0), ctx.plainMat(0x6a4a30, 0.8), BENCHES.length);
  BENCHES.forEach((b, i) => bench.setMatrixAt(i, m4.makeTranslation(b.x, groundY(b.z), b.z)));
  bench.castShadow = true; bench.receiveShadow = true;
  scene.add(bench);

  return { SU, mesh };
}
