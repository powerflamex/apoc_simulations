// The buildings round the square: one facade shader draws every wall (window grids that mirror the sky, glass towers,
// brick blocks with sash windows, shop fronts with awning-coloured fascias at street level), instanced boxes. Nothing
// here breaks; the haze and the fog (uHaze, uHazeD) are shared with every other material through hazed().
import * as THREE from 'three';
import { BLD } from './layout.js';

export const CU = {
  uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.3, 0.6, 0.7) }, uSkyHi: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 2500 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
  uFog: { value: 0 }, uFogCol: { value: new THREE.Color(0.85, 0.87, 0.9) }, uFogD: { value: 60 },
};

// distance haze + the fog that forms near the end (a near fog over the far haze)
export const HAZE_GLSL = /* glsl */ `
  vec3 hazeIt(vec3 c, vec3 wp) {
    float d = length(wp - cameraPosition);
    c = mix(c, uHaze, 1.0 - exp(-d / uHazeD));
    return mix(c, uFogCol, uFog * (1.0 - exp(-d / uFogD)));
  }`;
const HAZE_U = 'uniform vec3 uHaze; uniform float uHazeD; uniform float uFog; uniform vec3 uFogCol; uniform float uFogD;';

const PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uSun; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSunCol;
${HAZE_U}
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON; varying vec3 vCol;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.3, 1.0);
  vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
  c += uSunCol * 1.6 * pow(max(dot(normalize(r), uSun), 0.0), 90.0) * step(0.0, uSun.y + 0.02);
  return mix(c, vec3(0.16, 0.15, 0.15), smoothstep(0.0, -0.15, r.y));
}
${HAZE_GLSL}
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
    float FH = kind > 1.5 && kind < 2.5 ? 3.6 : 3.4;
    float g0 = kind > 2.5 ? 0.0 : (kind > 1.5 && kind < 2.5 ? 4.4 : 4.6);
    float colW = vS.z;
    float nCol = max(1.0, floor(W / colW + 0.5)); colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 id = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.15, 0.45, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(y, H - 1.2);
    vec3 N = normalize(vWN);
    vec3 refl = skyRefl(reflect(V, N));
    float fres = 0.2 + 0.8 * pow(1.0 - abs(dot(V, N)), 3.0);
    vec3 col = base; float win = 0.0;
    vec3 room = vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * h21(id * 2.1 + seed));
    if (kind > 0.5 && kind < 1.5) {
      win = rect(f, vec2(0.04, 0.12), vec2(0.96, 0.97), fw) * ok;
      vec3 glass = mix(base * 0.25, refl * mix(vec3(1.0), base * 1.5, 0.35), 0.5 + 0.5 * fres);
      col = mix(base * 0.55, glass, mix(win, 0.9 * ok, far));
      totalEmissiveRadiance += refl * (0.12 + 0.3 * fres) * mix(win, 0.9 * ok, far) * 0.9;
    } else if (kind > 1.5 && kind < 2.5) {
      win = rect(f, vec2(0.3, 0.2), vec2(0.7, 0.8), fw) * ok;
      vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
      col = mix(base, glass, win * (1.0 - far));
      col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.5);
      col = mix(col, base * 1.12, step(0.86, f.y) * step(f.y, 0.92) * ok * (1.0 - far));
      col = mix(col, base * 0.9, smoothstep(H - 2.2, H - 1.9, y) * (1.0 - smoothstep(H - 0.5, H - 0.2, y)));
      totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far);
    } else {
      win = rect(f, vec2(0.16, 0.22), vec2(0.84, 0.86), fw) * ok;
      vec3 glass = mix(room, refl * 0.7, 0.45 * fres + 0.2);
      col = mix(base, glass, win * (1.0 - far));
      col = mix(col, base * 0.78 + glass * 0.22, far * ok * 0.55);
      col = mix(col, base * 0.88, step(f.y, 0.2) * ok * (1.0 - far));
      totalEmissiveRadiance += refl * 0.12 * fres * win * (1.0 - far);
    }
    // street level: shop fronts (plate glass, goods inside, a coloured fascia band)
    if (y < g0 && kind < 2.5) {
      float nb = max(1.0, floor(W / 5.5));
      float bw = W / nb;
      float bay = fract(u / bw);
      float bid = floor(u / bw);
      float pane = step(0.3, y) * step(y, g0 - 1.6) * step(0.06, bay) * step(bay, 0.94);
      vec3 inside = mix(vec3(0.6, 0.48, 0.36), vec3(0.42, 0.47, 0.52), step(0.55, h21(vec2(bid, seed)))) * (0.5 + 0.4 * h21(vec2(floor(bay * 6.0), seed)));
      float goods = step(0.5, fract(y * 1.6)) * step(0.1, fract(bay * 9.0));
      inside = mix(inside, inside * vec3(1.3, 0.9, 0.7) * (0.6 + 0.8 * h21(vec2(floor(bay * 9.0), bid))), goods * 0.6);
      vec3 shopGlass = mix(inside * 0.5, refl * 0.6, 0.45 * fres);
      col = mix(base * 0.75, shopGlass, pane);
      float band = step(g0 - 1.5, y) * step(y, g0 - 0.3);
      vec3 bc = mix(0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h21(vec2(bid, seed * 2.1)))), vec3(0.25, 0.22, 0.2), 0.35);
      col = mix(col, bc, band * step(0.35, h21(vec2(bid + 7.0, seed))));
      totalEmissiveRadiance += pane * inside * 0.3;
      totalEmissiveRadiance += refl * 0.25 * fres * pane;
    }
    // a parapet line at the top, weathering
    col *= 0.92 + 0.12 * gn2(vec2(u, y) * 0.4 + seed);
    col = mix(col, base * 0.7, smoothstep(H - 0.6, H - 0.45, y));
    diffuseColor.rgb = col;
    if (abs(vON.y) > 0.5) diffuseColor.rgb = base * 0.45 + 0.04 * h21(floor(vWP.xz * 0.5));
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
        vON = normal; vS = aS; vCol = aCol;
        vLoc = position - vec3(0.0, 0.5, 0.0);
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        { vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wpp.xyz; }
        { mat3 im = mat3(instanceMatrix); vec3 sc2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
          vWN = normalize(mat3(modelMatrix) * (im * (normal / sc2))); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PARS}`)
      .replace('#include <emissivemap_fragment>', LOOK)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = hazeIt(gl_FragColor.rgb, vWP);`);
  };
  m.customProgramCacheKey = () => 'gravoff-facade-v1';
  return m;
}

// a plain material with the same haze and fog
export function hazed(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, { uHaze: CU.uHaze, uHazeD: CU.uHazeD, uFog: CU.uFog, uFogCol: CU.uFogCol, uFogD: CU.uFogD });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 hw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          hw = instanceMatrix * hw;
          #endif
          vHW = (modelMatrix * hw).xyz; }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vHW; ${HAZE_U}\n${HAZE_GLSL}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = hazeIt(gl_FragColor.rgb, vHW);`);
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => `gravoff-hazed-${key}`;
  return m;
}

export function makeCity(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const n = BLD.length;
  const aS = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  BLD.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    mesh.setMatrixAt(i, m4);
    aS.set([i * 7 + 3, b.kind, b.colW, b.h], i * 4);
    c.set(b.col); aCol.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh };
}
