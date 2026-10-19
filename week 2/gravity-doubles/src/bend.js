// Shared material patching for the whole world (one vertex hook, so everything moves together):
//   * the rock cap: at gravity g nothing can stand taller than ~7,500 m / g (granite crushes), so every vertex
//     above the ground is squeezed under that height (y -> cap * tanh(y / cap)): hills slump, rubble flattens
//   * the heave: once rock flows (500x+), the ground rolls in long slow swells and everything rides them
//   * the curvature: when Earth caves in, the ground curls round a planet of radius uR under the camera
// plus procedural facades for the towers (glass curtain walls and office grids, lights that die with the grid or
// when the building falls) and the glow of the crushed, red-hot ground at the end.
import * as THREE from 'three';

export const G = {
  uTime: { value: 0 },
  uCap: { value: 1e6 },
  uCapR: { value: 1e6 },
  uFlow: { value: 0 },
  uR: { value: 6.371e6 },
  uCam: { value: new THREE.Vector2(0, 0) },
  uHeat: { value: 0 },
  uGrid: { value: 1 },
};

// the swells (also evaluated in JS for the camera: heave() below)
export const HEAVE_GLSL = /* glsl */ `
float heave(vec2 p, float t) {
  return 1.6 * sin(p.x * 0.021 + p.y * 0.009 + t * 1.1) + 1.0 * sin(p.y * 0.029 - p.x * 0.012 + t * 1.5 + 1.7)
       + 0.5 * sin((p.x + p.y) * 0.05 + t * 2.1 + 4.1);
}`;
export const heave = (x, z, t) => 1.6 * Math.sin(x * 0.021 + z * 0.009 + t * 1.1) + 1.0 * Math.sin(z * 0.029 - x * 0.012 + t * 1.5 + 1.7)
  + 0.5 * Math.sin((x + z) * 0.05 + t * 2.1 + 4.1);

export const BEND_GLSL = /* glsl */ `
uniform float uCap; uniform float uFlow; uniform float uR; uniform vec2 uCam; uniform float uTime;
#ifdef ROCK
uniform float uCapR;
#define CAPH uCapR
#else
#define CAPH uCap
#endif
${HEAVE_GLSL}
vec3 bendWorld(vec3 p) {
  // (below ground the river bed and its water are squeezed flat too, scaled so they keep apart)
  p.y = p.y > 0.0 ? CAPH * tanh(p.y / CAPH) : p.y * clamp(CAPH / 3.0, 0.02, 1.0);
  p.y += uFlow * heave(p.xz, uTime);
  vec2 d = p.xz - uCam;
  float dist = length(d);
  if (dist > 1e-3 && uR < 5.0e6) {
    float th = min(dist / uR, 3.1);
    float sinc = sin(th) / max(th, 1e-6);
    vec2 dir = d / dist;
    float s2 = sin(th * 0.5);
    p.xz = uCam + dir * (th * uR * sinc * (1.0 + p.y / uR));
    p.y = p.y * cos(th) - 2.0 * uR * s2 * s2;
  }
  return p;
}
`;

const FACADE_PARS = /* glsl */ `
uniform float uGrid; uniform float uHeat;
varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vOff;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
`;

// Towers across the river at sunset: glass curtain walls (blue, teal, bronze) that mirror the warm sky, and
// older office grids with punched windows; offices lit floor by floor. vOff: when this building's lights die.
const FACADE = /* glsl */ `
  #include <emissivemap_fragment>
  if (abs(vObjN.y) < 0.5) {
    bool sx = abs(vObjN.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = vLoc.y * vSc.y;
    float seed = floor(vSeed * 1009.0 + 0.5);
    float face = floor(vObjN.x + 0.5) * 2.0 + floor(vObjN.z + 0.5) + 3.0;
    float hA = h21(vec2(seed, 3.7)), hB = h21(vec2(seed, 8.1)), hC = h21(vec2(seed, 1.3));
    bool glassy = hA < 0.62;
    float FH = 3.9;
    float colW = glassy ? 1.6 : 2.4 + hB;
    float nCol = max(1.0, floor(W / colW + 0.5));
    colW = W / nCol;
    vec2 g = vec2(u / colW, (y - 1.0) / FH);
    vec2 cell = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.12, 0.4, max(fw.x, fw.y));
    float detail = 1.0 - far;
    float ok = step(0.0, g.y) * step(y, vSc.y - 2.5);
    float r = h21(cell + vec2(seed * 0.173, face * 1.37));
    float floorR = h21(vec2(cell.y, seed * 0.29 + face));
    vec3 base = diffuseColor.rgb;
    vec3 col;
    float win;
    if (glassy) {
      // curtain wall: mullions, a dark spandrel band at each floor slab, glass mirroring the sunset
      win = rect(f, vec2(0.04, 0.2), vec2(0.96, 0.98), fw) * ok;
      float sky = clamp(0.35 + 0.65 * vLoc.y + 0.2 * (h21(vec2(cell.x * 0.1, seed)) - 0.5), 0.0, 1.0);
      vec3 refl = mix(vec3(0.85, 0.5, 0.36), vec3(0.42, 0.5, 0.66), sky) * mix(vec3(1.0), base * 1.6, 0.55);
      col = mix(base * 0.55, refl, win * mix(1.0, 0.85, far));
    } else {
      win = rect(f, vec2(0.18, 0.28), vec2(0.82, 0.86), fw) * ok;
      vec3 glass = mix(vec3(0.06, 0.07, 0.09), vec3(0.32, 0.3, 0.32), smoothstep(0.3, 1.0, f.y) * (0.5 + 0.5 * r));
      col = mix(base, glass, win * detail);
      col = mix(col, base * 0.8 + glass * 0.2, far * ok * 0.4);
    }
    // the crown: a darker band at the top, a lit sign or beacon strip on some
    float crown = smoothstep(vSc.y - 2.5, vSc.y - 2.4, y);
    col = mix(col, base * 0.45, crown);
    diffuseColor.rgb = col;
    // office lights: whole floors and runs of windows, warm and cool white
    float lit = step(r, 0.25 + 0.55 * step(floorR, 0.55 + 0.3 * hB)) * ok;
    vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.92, 1.0), step(0.6, h21(vec2(cell.y, seed))));
    float on = uGrid * (1.0 - smoothstep(vOff, vOff + 0.25, uTime));
    float e = mix(win * lit * (0.5 + 0.6 * r), 0.16 * ok * (0.6 + 0.4 * hB), far) * on;
    totalEmissiveRadiance += e * warm * (glassy ? 0.9 : 1.1);
    totalEmissiveRadiance += crown * step(0.7, hC) * on * vec3(0.6, 0.85, 1.0) * 0.6;
  }
`;

export function patch(material, { windows = false, key = '', extra = null, rock = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uCap: G.uCap, uCapR: G.uCapR, uFlow: G.uFlow, uR: G.uR, uCam: G.uCam, uTime: G.uTime, uGrid: G.uGrid, uHeat: G.uHeat,
    });
    shader.vertexShader =
      (rock ? '#define ROCK' + String.fromCharCode(10) : '') + BEND_GLSL +
      `varying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? `attribute float aSeed; attribute float aOff; varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vOff;\n` : '') +
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
        ${windows ? `vSeed = aSeed; vOff = aOff; vLoc = transformed;
        #ifdef USE_INSTANCING
          vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #else
          vSc = vec3(1.0);
        #endif` : ''}
        wp.xyz = bendWorld(wp.xyz);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        `
      );
    // the heat at the end: everything near the ground glows dull red, then orange
    const HEAT = /* glsl */ `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += uHeat * vec3(0.55, 0.12, 0.03) * (0.25 + 0.75 * uHeat) * exp(-max(vWPre.y, 0.0) * 0.08);
    `;
    let fs =
      `uniform float uTime;\nvarying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? FACADE_PARS : 'uniform float uHeat;\n') + shader.fragmentShader;
    if (windows) fs = fs.replace('#include <emissivemap_fragment>', FACADE.replace('#include <emissivemap_fragment>', HEAT));
    else fs = fs.replace('#include <emissivemap_fragment>', HEAT);
    shader.fragmentShader = fs;
    if (extra) extra(shader);
  };
  material.customProgramCacheKey = () => (windows ? 'grav-win' : 'grav') + key + (rock ? '-rock' : '');
  return material;
}
