// Shared material patching: world-space bend hook (unused here, kept for shader compatibility),
// procedural facades (windows, shutters, balconies, plinths), window lights that switch on after dark
// and die with the grid, and snow on upward surfaces.
//
// Facades are laid out in each building's own coordinates: columns fit the wall width exactly,
// the ground floor starts at the highest ground under the building (aGround, metres above the
// bottom of the box), and everything below that is a stone plinth, so no window ever sinks into a
// slope. Every random choice is hashed from integers (house id, face, window cell), so it is the
// same on every pixel and every frame: no sparkle or flashing.
import * as THREE from 'three';
import { GRID } from './timeline.js';

export const G = {
  uCurl: { value: 0 },
  uCurlOrigin: { value: new THREE.Vector2(0, 0) },
  uCurlDir: { value: new THREE.Vector2(0, -1) },
  uTime: { value: 0 },
  uSnow: { value: 0 },
  uLightsOut: { value: 0 },
  uDiskLight: { value: 0 },
};

export const BEND_GLSL = /* glsl */ `
uniform float uCurl;
uniform vec2 uCurlOrigin;
uniform vec2 uCurlDir;
vec3 bendWorld(vec3 p) { return p; }
`;

const SNOW_GLSL = /* glsl */ `
  {
    float up = smoothstep(0.3, 0.62, vObjN.y);   // steep roofs hold ash too
    vec2 sp = vWPre.xz * 0.35 + vWPre.y * 0.1;
    float n = fract(sin(dot(floor(sp), vec2(12.9898, 78.233))) * 43758.5453);
    float cover = smoothstep(0.0, 0.35, uSnow - n * 0.25) * up;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.325, 0.31), cover);   // grey volcanic ash
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.29, 0.28), uSnow * 0.3 * (1.0 - up));
  }
`;

const FACADE_PARS = /* glsl */ `
varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vGround; varying vec3 vInst;
// the grid failure, same as gridBrown / gridOffT in timeline.js
float gridBrown(float t) { return 1.0 - 0.55 * smoothstep(${GRID.brown.toFixed(3)}, ${(GRID.brown + 0.5).toFixed(3)}, t) * (0.55 + 0.45 * sin(t * 31.0) * sin(t * 17.3)); }
float gridOffT(vec2 p) {
  float d = length(p - vec2(${GRID.cx.toFixed(3)}, ${GRID.cz.toFixed(3)}));
  float j = fract(floor(p.x / ${GRID.cell.toFixed(3)}) * 0.618034 + floor(p.y / ${GRID.cell.toFixed(3)}) * 0.414214);
  return ${GRID.t0.toFixed(3)} + ${GRID.span.toFixed(3)} * (0.75 * (1.0 - clamp(d / ${GRID.far.toFixed(3)}, 0.0, 1.0)) + 0.25 * j);
}
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
`;

// Alpine village: rendered walls with a stone plinth, many houses with a timber upper storey,
// green / oxblood / timber shutters, carved balconies and window boxes full of geraniums.
// Lights come on as the ash cloud makes it dark (from 37 s), die when the grid fails (56.6-60 s), and a few
// windows catch fire in the heat just before the hot ash cloud reaches the town (78-81.5 s).
const FACADE = /* glsl */ `
  #include <emissivemap_fragment>
  if (abs(vObjN.y) < 0.5) {
    bool sx = abs(vObjN.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = vLoc.y * vSc.y;
    float seed = floor(vSeed * 1009.0 + 0.5);
    float face = floor(vObjN.x + 0.5) * 2.0 + floor(vObjN.z + 0.5) + 3.0;
    float hA = h21(vec2(seed, 3.7)), hB = h21(vec2(seed, 8.1)), hC = h21(vec2(seed, 1.3)), hD = h21(vec2(seed, 5.9)), hE = h21(vec2(seed, 2.4));
    float g0 = vGround + 0.45;
    float FH = 2.8 + 0.35 * hA;
    float nFl = floor((vSc.y - 0.25 - g0 - 0.8 * FH) / FH) + 1.0;
    float nCol = max(1.0, floor(W / (2.3 + 0.9 * hB) + 0.3));
    float colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 cell = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.1, 0.32, max(fw.x, fw.y));
    float detail = 1.0 - far;
    float ok = step(0.0, g.y) * step(cell.y, nFl - 1.0) * step(0.5, nFl);
    float r = h21(cell + vec2(seed * 0.173, face * 1.37));
    float r2 = h21(cell * 1.7 + vec2(seed * 0.311 + 9.2, face * 0.71));
    bool front = vObjN.z > 0.5;
    float doorCol = floor(hC * nCol);
    bool door = front && cell.y < 0.5 && abs(cell.x - doorCol) < 0.5;
    vec2 wa = door ? vec2(0.32, 0.0) : vec2(0.31, 0.27);
    vec2 wb = door ? vec2(0.68, 0.76) : vec2(0.69, 0.79);
    vec3 trim = hD < 0.4 ? vec3(0.13, 0.27, 0.15) : hD < 0.6 ? vec3(0.42, 0.1, 0.08) : hD < 0.85 ? vec3(0.3, 0.19, 0.1) : vec3(0.22, 0.27, 0.32);
    vec3 wood = mix(vec3(0.3, 0.18, 0.09), vec3(0.42, 0.27, 0.14), hE);
    bool timber = hB < 0.55 && nFl >= 2.0;
    float upper = timber ? smoothstep(g0 + FH - 0.08 - fw.y * FH, g0 + FH, y) : 0.0;
    float win = rect(f, wa, wb, fw) * ok;
    float frame = clamp(rect(f, wa - 0.04, wb + vec2(0.04, 0.035), fw) * ok - win, 0.0, 1.0);
    float hasShut = step(hA, 0.85);
    float shut = (rect(f, vec2(wa.x - 0.2, wa.y), vec2(wa.x - 0.045, wb.y), fw) + rect(f, vec2(wb.x + 0.045, wa.y), vec2(wb.x + 0.2, wb.y), fw)) * ok * hasShut * (door ? 0.0 : 1.0);
    float lv = (f.y - wa.y) / (wb.y - wa.y);
    float slat = 0.78 + 0.22 * step(0.5, fract(lv * 8.0));
    float closed = step(0.86, r2) * hasShut * (door ? 0.0 : 1.0);
    // window boxes with geraniums under many windows
    float boxes = step(hE, 0.6) * (door ? 0.0 : 1.0) * ok;
    float box = rect(f, vec2(wa.x - 0.06, wa.y - 0.14), vec2(wb.x + 0.06, wa.y - 0.04), fw) * boxes;
    float bloom = rect(f, vec2(wa.x - 0.07, wa.y - 0.06), vec2(wb.x + 0.07, wa.y + 0.03), fw) * boxes;
    float petals = smoothstep(0.45, 0.6, h21(floor(vec2(u * 9.0, y * 9.0)) + seed));
    // a carved balcony across the first floor of the front of timber houses
    float balc = (front && timber && hC > 0.25) ? rect(vec2(u / W, g.y), vec2(0.06, 1.0), vec2(0.94, 1.32), vec2(fw.x / nCol, fw.y)) * step(2.0, nFl) : 0.0;
    float slats = 0.6 + 0.4 * smoothstep(0.3, 0.5, abs(fract(u * 5.0) - 0.5) * 2.0);
    float rail = rect(vec2(0.5, g.y), vec2(0.0, 1.27), vec2(1.0, 1.33), fw);
    vec3 glass = mix(vec3(0.05, 0.065, 0.08), vec3(0.22, 0.26, 0.3), smoothstep(0.4, 1.0, lv) * (0.5 + 0.5 * r));
    glass = mix(glass, vec3(0.75, 0.72, 0.65), step(0.5, r2) * step(r2, 0.75) * 0.5 * smoothstep(0.55, 0.6, abs(f.x - 0.5) * 2.0 + 0.5));   // net curtains
    float mull = max(rect(f, vec2(0.495, wa.y), vec2(0.505, wb.y), fw), rect(f, vec2(wa.x, 0.6), vec2(wb.x, 0.615), fw));
    if (door) glass = wood * (0.75 + 0.25 * step(0.06, abs(f.x - 0.5))) * mix(1.0, slat, 0.35);
    if (closed > 0.5) glass = trim * slat;
    vec3 base = diffuseColor.rgb;
    float plinth = 1.0 - smoothstep(g0 - 0.1 - fw.y * FH, g0 - 0.1 + fw.y * FH, y);
    vec2 sp = vec2(u * 1.7 + floor(y * 2.5) * 0.5, y * 2.5);
    vec3 stone = vec3(0.5, 0.48, 0.45) * (0.75 + 0.25 * h21(floor(sp) + seed)) * (0.8 + 0.2 * smoothstep(0.0, 0.08 + fw.x, min(fract(sp.x), fract(sp.y))));
    base = mix(base, mix(stone, vec3(0.5, 0.48, 0.45), far), plinth);
    vec3 planks = wood * (0.85 + 0.15 * smoothstep(0.0, 0.15, fract(y * 4.0))) ;
    base = mix(base, mix(planks, wood, far), upper);
    base = mix(base, trim, shut * detail);
    base = mix(base, upper > 0.5 ? wood * 0.6 : vec3(0.92, 0.9, 0.85), frame * detail);
    base = mix(base, glass, win * detail);
    base = mix(base, wood * 0.5, mull * win * detail * (door || closed > 0.5 ? 0.0 : 1.0));
    base = mix(base, vec3(0.35, 0.22, 0.12), box * detail);
    base = mix(base, mix(vec3(0.22, 0.42, 0.16), vec3(0.85, 0.1, 0.12), petals), bloom * (1.0 - box * 0.5) * detail);
    base = mix(base, wood * 0.8 * slats, balc * detail);
    base = mix(base, mix(vec3(0.22, 0.42, 0.16), vec3(0.85, 0.12, 0.14), petals), rail * balc * detail);
    base *= 1.0 - far * ok * 0.12;
    diffuseColor.rgb = base;
    // lights come on after dark, then die when the grid fails
    float lit = step(r, 0.5 + 0.2 * hB) * (1.0 - closed) * (door ? 0.0 : 1.0) * (1.0 - balc * 0.7);
    float onT = 37.0 + r2 * 5.0;
    float offT = gridOffT(vInst.xz) + r * 0.3;   // the grid goes down section by section
    float flick = step(0.45, fract(sin(floor(uTime * 7.0) * 1.7 + r * 13.0) * 43758.5));
    lit *= step(onT, uTime) * (uTime < offT - 0.6 ? 1.0 : (uTime < offT ? flick : 0.0));
    vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.88, 0.7), r2);
    if (r2 > 0.86) warm = vec3(0.65, 0.8, 1.0);
    float avgOn = smoothstep(37.0, 42.0, uTime) * (1.0 - smoothstep(offT - 0.4, offT, uTime));
    float e = mix(win * lit * (0.7 + 0.8 * r) * (0.6 + 0.4 * (1.0 - abs(f.x - 0.5) * 2.0)), 0.12 * avgOn * ok, far) * gridBrown(uTime);
    totalEmissiveRadiance += e * warm;
    float fire = step(0.8, r2) * win * detail * smoothstep(78.0 + r * 2.0, 79.5 + r * 2.0, uTime) * (door ? 0.0 : 1.0);
    totalEmissiveRadiance += fire * vec3(1.0, 0.42, 0.12) * (0.55 + 0.35 * sin(uTime * 11.0 + r * 40.0) * sin(uTime * 4.3 + r2 * 9.0));
  }
`;

export function patch(material, { windows = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uCurl: G.uCurl, uCurlOrigin: G.uCurlOrigin, uCurlDir: G.uCurlDir,
      uTime: G.uTime, uSnow: G.uSnow,
    });
    shader.vertexShader =
      BEND_GLSL +
      `varying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? `attribute float aSeed; attribute float aGround; varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vGround; varying vec3 vInst;\n` : '') +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vWPre = wp.xyz;
        vObjN = normal;
        ${windows ? `vSeed = aSeed; vGround = aGround; vLoc = transformed;
        #ifdef USE_INSTANCING
          vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vInst = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vSc = vec3(1.0);
          vInst = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif` : ''}
        wp.xyz = bendWorld(wp.xyz);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        `
      );
    let fs =
      `uniform float uTime; uniform float uSnow;\nvarying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? FACADE_PARS : '') +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + SNOW_GLSL);
    if (windows) fs = fs.replace('#include <emissivemap_fragment>', FACADE);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => (windows ? 'sun-win2' : 'sun');
  return material;
}
