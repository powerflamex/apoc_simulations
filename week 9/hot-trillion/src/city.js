// The buildings, shop signs and awnings. One facade shader draws every wall (window grids that mirror the sky, glass
// towers, brick blocks, shop fronts at street level) and heats it with your light, spot by spot (heat.js):
//   ~9 kW/m²   windows crack (each pane its own +-15%);
//   ~30 kW/m²  curtains and furniture behind them catch fire: the rooms burn;
//   past that  the wall scorches black, then glows (its surface temperature, (q / 2 sigma)^1/4, as a black body);
//   ~300 kW/m² the glass softens and runs down the wall in glowing streaks;
//   ~3 MW/m²   the steel frame sags: the upper floors droop and lean in toward you;
//   ~10 MW/m²  the walls melt and pour down: each column of the building sinks as the heat at its foot passes the
//              mark, the nearest corner first, its base spreading out into a glowing apron;
//   ~100 MW/m² it boils away: holes eat through it from the edges, glowing, and what's left sinks into the gas.
// Near buildings (layout NEAR_R) have a fine mesh so they can bend; far ones are plain boxes that sink. Signs droop,
// char and burn off; the awnings' canvas burns through from its hottest edge (fire.js adds the flames).
import * as THREE from 'three';
import { BLD, SIGNS, AWNINGS, HEART } from './layout.js';
import { timeOfQ, Q } from './timeline.js';
import { HU, HEAT_GLSL, LQ_GLSL } from './heat.js';
import { rng, smooth, clamp } from './util.js';

export const CU = {
  uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 2500 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
  uSmokeK: { value: 0 },
};

const PARS = /* glsl */ `
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD; uniform vec3 uSunCol; uniform float uSmokeK;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
varying vec3 vRW; varying float vLqC; varying vec3 vCtr;
${HEAT_GLSL}
${LQ_GLSL}
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += uSunCol * 1.6 * pow(max(dot(normalize(r), uSun), 0.0), 90.0) * step(0.0, uSun.y + 0.02);
  return mix(c, vec3(0.16, 0.15, 0.15), smoothstep(0.0, -0.15, r.y));
}
// fire seen through a window: flames licking up, flickering
vec3 roomFire(vec2 f, vec2 id, float k) {
  float n = nn2(vec2(f.x * 4.0 + id.x * 3.1, f.y * 2.5 - uHT * 2.6 + id.y * 1.7)) * 0.6 + nn2(vec2(f.x * 9.0, f.y * 6.0 - uHT * 4.1)) * 0.4;
  float flame = smoothstep(0.25, 0.9, n + (0.55 - f.y) * 0.9);
  float flick = 0.75 + 0.25 * sin(uHT * 13.0 + id.x * 5.0 + id.y * 3.0);
  return mix(vec3(0.5, 0.06, 0.0), vec3(3.2, 1.3, 0.3), flame) * flick * k;
}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x + 0.5);
    float H = vS.w;
    vec3 base = vCol;
    vec3 V = normalize(vWP - cameraPosition);
    bool sx = abs(vON.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = (vLoc.y + 0.5) * vSc.y;
    vec3 tang = sx ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
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
    float lq = lqAt(vRW);
    float Ts = tSurf(lq);
    // this window's heat (at its centre) against its own marks
    vec3 cc = vRW - tang * (f.x - 0.5) * colW - vec3(0.0, (f.y - 0.5) * FH, 0.0);
    float lqw = lqAt(cc);
    float wh = fract((id.x * 7.0 + id.y * 131.0 + seed * 17.0 + face * 5.0) * 0.61803398);
    float crack = step(LQ_CRACK + (wh - 0.5) * 0.3, lqw);
    float fire = smoothstep(0.0, 0.25, lqw - (LQ_TREE + 0.1 + wh * 0.35));
    float run = clamp((lqw - LQ_GLASS) / 0.6, 0.0, 1.0);
    float crackFar = smoothstep(LQ_CRACK - 0.15, LQ_CRACK + 0.15, lq);
    float fireFar = smoothstep(LQ_TREE, LQ_TREE + 0.45, lq);
    crack = mix(crack, crackFar, far); fire = mix(fire, fireFar, far);
    vec3 N = normalize(vWN);
    vec3 refl = skyRefl(reflect(V, N));
    float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
    vec3 col = base; float win = 0.0;
    vec3 room = vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * hh2(id * 2.1 + seed));
    // cracked glass: straight lines out from a point, the pane greyed; glass gone where it's run
    vec2 cp = vec2(hh2(id + seed * 1.3), hh2(id * 1.7 + seed)) * 0.6 + 0.2;
    vec2 dq = (f - cp) * vec2(colW, FH);
    float ang = atan(dq.y, dq.x) / 6.2832 * 9.0 + wh * 4.0;
    float lines = (1.0 - smoothstep(0.0, 0.06 + 0.02 * length(dq), abs(fract(ang) - 0.5) * length(dq) * 1.4)) * crack * (1.0 - far);
    vec3 emis = vec3(0.0);
    float glassK = 1.0 - run;
    if (kind > 0.5 && kind < 1.5 || kind > 3.5) {
      win = rect(f, vec2(0.04, 0.14), vec2(0.96, 0.97), fw) * ok;
      vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
      glass = mix(glass, glass * 0.55 + 0.08, crack * 0.5);
      glass = mix(glass, vec3(0.9), lines * 0.5);
      vec3 inside = mix(room, room * 0.3, fire);
      glass = mix(inside, glass, glassK);
      col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
      emis += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9 * glassK * (1.0 - crack * 0.5);
      emis += roomFire(f, id, fire) * mix(win, 0.9 * ok, far) * (0.55 + 0.45 * run);
    } else {
      bool brick = kind > 1.5 && kind < 2.5;
      vec2 a = brick ? vec2(0.3, 0.2) : vec2(0.16, 0.22), b = brick ? vec2(0.7, 0.8) : vec2(0.84, 0.86);
      win = rect(f, a, b, fw) * ok;
      vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
      glass = mix(glass, glass * 0.6, crack * 0.4);
      glass = mix(glass, vec3(0.85), lines * 0.45);
      glass = mix(room * mix(1.0, 0.3, fire), glass, glassK);
      col = mix(base, glass, win * (1.0 - far));
      col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
      if (brick) col = mix(col, base * 1.12, step(0.86, f.y) * step(f.y, 0.92) * ok * (1.0 - far));
      emis += refl * 0.12 * fres * win * (1.0 - far) * glassK;
      emis += roomFire(f, id, fire) * mix(win, 0.6 * ok, far) * (0.55 + 0.45 * run);
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
      vec3 pc = vRW - tang * (bay - 0.5) * bw - vec3(0.0, y - (g0 - 1.4) * 0.5, 0.0);
      float lqp = lqAt(pc);
      float ph = fract((bid * 11.0 + seed * 17.0 + face * 5.0 + 3.0) * 0.61803398);
      float pcrack = step(LQ_CRACK - 0.1 + (ph - 0.5) * 0.25, lqp);
      float pfire = smoothstep(0.0, 0.3, lqp - (LQ_TREE + ph * 0.3));
      float prun = clamp((lqp - LQ_GLASS) / 0.6, 0.0, 1.0);
      vec2 pq = vec2((bay - 0.5) * bw, y - (g0 - 1.4) * 0.5 - 0.6);
      float pang = atan(pq.y, pq.x) / 6.2832 * 11.0 + ph * 5.0;
      float plines = (1.0 - smoothstep(0.0, 0.05 + 0.015 * length(pq), abs(fract(pang) - 0.5) * length(pq) * 1.4)) * pcrack;
      vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
      shopGlass = mix(shopGlass, vec3(0.9), plines * 0.55);
      shopGlass = mix(inside * mix(0.32, 0.08, pfire), shopGlass, 1.0 - prun);
      col = mix(base * 0.75, shopGlass, pane);
      float band = step(g0 - 1.6, y) * step(y, g0 - 0.3);
      vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + hh2(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.4);
      col = mix(col, bc, band * step(0.4, hh2(vec2(bid + 7.0, seed))));
      emis += pane * inside * 0.45 * (1.0 - pcrack * 0.3) * (1.0 - pfire);
      emis += refl * 0.25 * fres * pane * (1.0 - prun);
      emis += roomFire(vec2(bay, y / (g0 - 1.7)), vec2(bid, seed), pfire) * pane * 1.2;
      win = max(win, pane);
    }
    // the wall itself: scorched black, then glowing at its own temperature; molten glass running down below each
    // window; once it pours, bright rivulets streaming down it
    float scorch = smoothstep(LQ_TAR - 0.2, LQ_GLASS, lq);
    col = mix(col, col * vec3(0.12, 0.1, 0.09), scorch * (1.0 - win * 0.6));
    float pour = clamp((vLqC - LQ_POUR) / 0.8, 0.0, 1.0);
    float glow = glowOf(Ts) * smoothstep(LQ_TAR, LQ_GLASS + 0.3, lq);
    float nW = fb3(vec3(u * 0.35, y * 0.35, seed));
    vec3 hot = bbCol(Ts) * glow * (0.45 + 0.75 * nW);
    // glass streaks under the windows
    float streak = run * step(0.08, f.x) * step(f.x, 0.92) * smoothstep(0.35, 0.6, nn2(vec2(u * 6.0, seed))) * (1.0 - far)
      * (1.0 - smoothstep(0.0, 1.6 * run, fract(g.y) * -1.0 + 0.0 + (0.2 - f.y))) * step(f.y, 0.2);
    emis += bbCol(max(Ts, 1300.0)) * 2.2 * streak;
    float riv = smoothstep(0.55, 0.85, nn2(vec2(u * 0.9 + seed, y * 0.12 + uHT * 0.9))) * pour;
    emis += hot * (1.0 + 2.0 * riv);
    col *= 1.0 - 0.7 * pour;
    // smoke-blackened from the fires below once the street is burning
    col = mix(col, col * 0.35, uSmokeK * smoothstep(LQ_IGNITE - 0.6, LQ_IGNITE, lq) * (1.0 - smoothstep(4.0, 14.0, y)) * 0.6);
    // boiling away: holes eating through from the hottest side, a glowing rim
    float vap = clamp((vLqC - LQ_VAPOR) / 0.45, 0.0, 1.0);
    if (vap > 0.0) {
      float n = fb3(vRW * 0.22 + vec3(0.0, -uHT * 0.3, 0.0));
      if (vap > n * 1.15) discard;
      emis += bbCol(max(Ts, 2500.0)) * 4.0 * smoothstep(n * 1.15 - 0.12, n * 1.15, vap);
    }
    diffuseColor.rgb = col;
    if (abs(vON.y) > 0.5) diffuseColor.rgb = base * 0.5 * (1.0 - scorch * 0.8) + 0.04 * hh2(floor(vWP.xz * 0.5));
    // inside the shell (seen once a wall has burned through): a dark furnace
    if (!gl_FrontFacing) { diffuseColor.rgb = vec3(0.05); emis = bbCol(max(Ts, 1200.0)) * (0.6 + glow); }
    totalEmissiveRadiance += emis;
  }
`;

function facadeMaterial(near) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, side: near ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CU, HU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS; attribute vec3 aCol;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
        varying vec3 vRW; varying float vLqC; varying vec3 vCtr;
        ${HEAT_GLSL}
        ${LQ_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vON = normal; vS = aS; vCol = aCol;
        vLoc = position - vec3(0.0, 0.5, 0.0);
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vCtr = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vRW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        {
          // the building's structure: how far gone this column is, from the heat at its foot (your height)
          float lqC = lqAt(vec3(vRW.x, uHeart.y, vRW.z));
          vLqC = lqC;
          float Hh = max(vSc.y, 1.0), yr = clamp(vRW.y / Hh, 0.0, 1.0);
          float sag = clamp((lqC - LQ_STEEL) / 0.5, 0.0, 1.0);
          float pour = clamp((lqC - LQ_POUR) / 0.8, 0.0, 1.0);
          float vap = clamp((lqC - LQ_VAPOR) / 0.45, 0.0, 1.0);
          vec2 toH = normalize(uHeart.xz - vRW.xz + 1e-4);
          vec2 out2 = normalize(vRW.xz - vCtr.xz + 1e-4);
          vec3 d = vec3(0.0);
          float wob = sin(vRW.x * 0.7 + vRW.z * 0.5) * 0.5 + 0.5;
          d.y -= sag * (0.06 + 0.06 * wob) * vRW.y * yr;
          d.xz += toH * sag * 1.1 * yr * yr;
          d.y -= pour * vRW.y * (0.8 + 0.1 * wob);
          d.xz += out2 * pour * pow(1.0 - yr, 2.0) * 2.2 - toH * pour * 0.4 * yr;
          float y1 = vRW.y + d.y;
          d.y -= vap * y1 * 0.9;
          transformed += d / max(vSc, vec3(1e-3));
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
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, (1.0 - exp(-length(vWP - cameraPosition) / uHazeD)) * (1.0 - smoothstep(0.0, 6.0, length(totalEmissiveRadiance)) * 0.6));`);
  };
  m.customProgramCacheKey = () => (near ? 'hot-facade-near-v1' : 'hot-facade-far-v1');
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
// heat a plain material: it scorches, then glows at its own temperature (opts: char mark, glow mark, extra GLSL)
export function heated(m, key, { charAt = 'TAR', glowAt = 'TAR', minT = 0 } = {}) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, HU);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHtW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 hw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          hw = instanceMatrix * hw;
          #endif
          vHtW = (modelMatrix * hw).xyz; }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vHtW;\n${HEAT_GLSL}\n${LQ_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float lq = lqAt(vHtW); float Ts = max(tSurf(lq), ${minT.toFixed(1)});
          diffuseColor.rgb *= 1.0 - 0.85 * smoothstep(LQ_${charAt} - 0.3, LQ_${charAt} + 0.3, lq);
          totalEmissiveRadiance += bbCol(Ts) * glowOf(Ts) * smoothstep(LQ_${glowAt}, LQ_${glowAt} + 0.4, lq) * (0.6 + 0.6 * nn3(vHtW * 3.0));
          // boiled away
          if (lq > LQ_VAPOR + 0.35 * nn3(vHtW * 1.3)) discard; }`);
  };
  m.customProgramCacheKey = () => `heated-${key}`;
  return m;
}

// ---- painted shop signs: 8, 1024 x 128 each (2 columns x 4 rows in a 2048 x 512 atlas) ----
const SHOPS = [['ICE CREAM', '#f3a6c4', '#5a1030'], ['COFFEE', '#4a2a1a', '#f6e8d0'], ['BOOKS', '#2a3a6a', '#f0e0b0'], ['FLOWERS', '#2a7a4a', '#ffffff'],
  ['PIZZA', '#d8c030', '#201010'], ['SHOES', '#7a1a4a', '#ffffff'], ['PHONES', '#1a2a4a', '#e8d080'], ['BAKERY', '#b05a20', '#fff4e0']];
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

// when each awning and sign goes (fire.js reads these): canvas catches at ~22 kW/m², plastic signs droop at ~16
const rOf = (x, y, z) => Math.hypot(x - HEART.x, y - HEART.y, z - HEART.z);
{
  const R = rng(808);
  for (const a of AWNINGS) {
    // the awning's hottest point: its outer edge nearest you
    const ox = a.x - (a.out ?? 1.5) * 0.9 * a.side, oz = clamp(HEART.z, a.z - a.w / 2, a.z + a.w / 2);
    a.r = rOf(ox, 2.8, oz);
    a.tIgn = timeOfQ(Q.IGNITE * (0.85 + 0.3 * R()), a.r);
    a.burn = 1.8 + 1.2 * R();
  }
  for (const s of SIGNS) { s.r = rOf(s.x, s.y, s.z); s.tMelt = timeOfQ(Q.MELT * (0.8 + 0.4 * R()), s.r); s.tGone = timeOfQ(Q.IGNITE * (1.4 + 0.6 * R()), s.r); }
}

export function makeCity(scene, ctx) {
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  // ---- the buildings: near ones with a fine mesh (they bend and pour), far ones plain ----
  for (const near of [true, false]) {
    const list = BLD.filter((b) => b.near === near);
    const geo = (near ? new THREE.BoxGeometry(1, 1, 1, 14, 18, 14) : new THREE.BoxGeometry(1, 1, 1, 2, 6, 2)).translate(0, 0.5, 0);
    const n = list.length;
    const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
    const mesh = new THREE.InstancedMesh(geo, facadeMaterial(near), n);
    list.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, m4);
      aS.set([BLD.indexOf(b), b.kind, b.colW, b.h], i * 4);
      col.set(b.col).convertSRGBToLinear();
      aCol.set([col.r, col.g, col.b], i * 3);
    });
    geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = true;
    scene.add(mesh);
  }

  // ---- shop signs ----
  const signTex = makeSignAtlas();
  const signMat = heated(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.22, side: THREE.DoubleSide }), 'sign', { charAt: 'IGNITE', glowAt: 'GLASS' });
  const signGeo = new THREE.BoxGeometry(1, 1, 0.08);
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
  signs.frustumCulled = false; signs.castShadow = true;
  scene.add(signs);

  // ---- awnings: a sloping striped canvas over a shop door, on a thin steel frame ----
  const awGeo = new THREE.PlaneGeometry(1, 1, 8, 4).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const awMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  awMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vAP; varying vec3 vAW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAP = position;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvAW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vAP; varying vec3 vAW;\n${HEAT_GLSL}\n${LQ_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.6), step(0.5, fract(vAP.x * 6.0)));
        float lqA = lqAt(vAW);
        // the canvas burns through from its hottest edge: char, a glowing front, holes
        float b = (lqA - LQ_IGNITE) / 0.32;
        float n = fb3(vAW * 2.2);
        diffuseColor.rgb *= 1.0 - 0.9 * smoothstep(-0.6, 0.1, b - n * 0.8);
        if (b > n * 0.8 + 0.25) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float e = smoothstep(n * 0.8 + 0.05, n * 0.8 + 0.25, b); totalEmissiveRadiance += vec3(3.0, 1.0, 0.2) * e * (0.7 + 0.3 * sin(uHT * 17.0 + vAW.x * 9.0)); }`);
  };
  awMat.customProgramCacheKey = () => 'hot-awning-v1';
  const awnings = new THREE.InstancedMesh(awGeo, awMat, AWNINGS.length);
  const frameGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
  const frameMat = heated(ctx.plainMat(0x30333a, 0.5, { metalness: 0.5 }), 'awframe', { charAt: 'GLASS', glowAt: 'GLASS' });
  const frames = new THREE.InstancedMesh(frameGeo, frameMat, AWNINGS.length * 3);
  AWNINGS.forEach((a, i) => {
    const out = a.out ?? 1.5;
    const hinge = new THREE.Matrix4().makeRotationY(a.side > 0 ? -Math.PI / 2 : Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(a.x, 3.3, a.z)).multiply(new THREE.Matrix4().makeRotationX(0.42));
    awnings.setMatrixAt(i, hinge.clone().multiply(new THREE.Matrix4().makeScale(a.w, 1, out)));
    awnings.setColorAt(i, col.set(a.col));
    // the frame: an arm at each end and a bar along the front edge
    for (const [k, sx] of [[0, -0.5], [1, 0.5]]) frames.setMatrixAt(i * 3 + k, hinge.clone().multiply(new THREE.Matrix4().makeTranslation(sx * a.w, -0.03, 0)).multiply(new THREE.Matrix4().makeScale(0.04, 0.04, out)));
    frames.setMatrixAt(i * 3 + 2, hinge.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.03, out)).multiply(new THREE.Matrix4().makeScale(a.w, 0.04, 0.04)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.5)));
  });
  for (const m of [awnings, frames]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }

  const rest = SIGNS.map((s) => ({ m: new THREE.Matrix4().makeRotationY(s.yaw).scale(new THREE.Vector3(s.w, s.h, 1)).setPosition(s.x - s.side * 0.05, s.y, s.z) }));
  const tmp = new THREE.Matrix4(), rot = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    signMat,
    frame(v) {
      // signs: droop forward off the wall as the plastic softens, then burn away
      SIGNS.forEach((s, i) => {
        const k = smooth(s.tMelt, s.tMelt + 2.5, v), g = smooth(s.tGone, s.tGone + 0.8, v);
        if (g >= 1) { signs.setMatrixAt(i, zero); return; }
        // (about its top edge, tipping out over the sidewalk)
        rot.makeRotationAxis(new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw)), -s.side * 0.55 * k);
        tmp.makeTranslation(s.x - s.side * 0.05, s.y + s.h / 2, s.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(0, -s.h / 2 * (1 - 0.3 * g), 0))
          .multiply(new THREE.Matrix4().makeRotationY(s.yaw)).multiply(new THREE.Matrix4().makeScale(s.w, s.h * (1 - 0.7 * g), 1));
        signs.setMatrixAt(i, tmp);
      });
      signs.instanceMatrix.needsUpdate = true;
    },
  };
}
