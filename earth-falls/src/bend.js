// Material patching for "Earth falls into the Sun": world-space hook (identity here), procedural
// city facades (offices, apartments, glass towers, shopfronts), and the heat: plants dry out and brown,
// then surfaces scorch black with embers glowing in the cracks.
import * as THREE from 'three';

export const G = {
  uCurl: { value: 0 },
  uCurlOrigin: { value: new THREE.Vector2(0, 0) },
  uCurlDir: { value: new THREE.Vector2(0, -1) },
  uTime: { value: 0 },
  uLightsOut: { value: 0 },
  uDiskLight: { value: 0 },
  uBrown: { value: 0 },
  uScorch: { value: 0 },
  uGlow: { value: 0 },     // incandescence: things start glowing red-hot above ~1,000°F
  uMelt: { value: 0 },     // the sand melting into glass at the very end
  uDrain: { value: 0 },    // the shallow bay boiling dry
};

// red-hot glow on every surface, strongest where the Sun hits; on the beach the sand ends up as dark
// glass with glowing cracks
const GLOW_GLSL = /* glsl */ `
  #include <emissivemap_fragment>
  {
    vec2 gq = vWPre.xz * 0.6 + vWPre.y * 0.3;
    vec2 gi = floor(gq), gf = fract(gq); gf = gf * gf * (3.0 - 2.0 * gf);
    float g00 = fract(sin(dot(gi, vec2(41.3, 289.1))) * 43758.5453), g10 = fract(sin(dot(gi + vec2(1.0, 0.0), vec2(41.3, 289.1))) * 43758.5453);
    float g01 = fract(sin(dot(gi + vec2(0.0, 1.0), vec2(41.3, 289.1))) * 43758.5453), g11 = fract(sin(dot(gi + vec2(1.0, 1.0), vec2(41.3, 289.1))) * 43758.5453);
    float gn = mix(mix(g00, g10, gf.x), mix(g01, g11, gf.x), gf.y);
    float glow = uGlow * (0.35 + 0.65 * gn);
    #ifdef NOSCORCH
      // the beach: bleached sand that starts to glow, then fuses into glass
      float sandMask = step(vWPre.z, -13.5);
      float melt = smoothstep(0.0, 0.7, uMelt - (1.0 - gn) * 0.45) * sandMask;
      vec2 cq = vWPre.xz * 1.3;
      vec2 ci = floor(cq), cf = fract(cq);
      float d1 = 8.0, d2 = 8.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 jit = vec2(fract(sin(dot(ci + o, vec2(12.9, 78.2))) * 43758.5), fract(sin(dot(ci + o, vec2(39.3, 11.7))) * 43758.5));
        float d = length(o + jit - cf);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      float crack = 1.0 - smoothstep(0.02, 0.09, d2 - d1);
      // the drained seabed: cracked grey mud crusted with white salt
      float bed = smoothstep(-0.25, -0.9, vWPre.y) * smoothstep(0.1, 0.5, uDrain);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.33, 0.29, 0.23) * (0.8 + 0.4 * gn), vec3(0.88, 0.86, 0.8), max(crack, smoothstep(0.62, 0.8, gn) * 0.7)), bed);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.05, 0.025), melt * 0.92);
      roughnessFactor = mix(roughnessFactor, 0.35, melt);
      totalEmissiveRadiance += vec3(1.0, 0.36, 0.07) * (glow * 0.9 * sandMask * (1.0 - 0.6 * melt) + melt * (0.15 + 3.2 * crack));
    #else
      totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * glow * 0.8;
    #endif
  }
`;

export const BEND_GLSL = /* glsl */ `
uniform float uCurl;
uniform vec2 uCurlOrigin;
uniform vec2 uCurlDir;
vec3 bendWorld(vec3 p) { return p; }
`;

const HEAT_GLSL = /* glsl */ `
  {
    // smooth value noise (not per-cell hashes, which read as a checkerboard)
    vec2 hq = vWPre.xz * 0.35 + vWPre.y * 0.2;
    vec2 hi = floor(hq), hf = fract(hq); hf = hf * hf * (3.0 - 2.0 * hf);
    float h00 = fract(sin(dot(hi, vec2(12.9898, 78.233))) * 43758.5453), h10 = fract(sin(dot(hi + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
    float h01 = fract(sin(dot(hi + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453), h11 = fract(sin(dot(hi + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    float hn = mix(mix(h00, h10, hf.x), mix(h01, h11, hf.x), hf.y);
    #ifdef PLANT
      // leaves dry out: green -> straw -> brown, patchily
      float dry = smoothstep(0.0, 0.7, uBrown - hn * 0.3);
      vec3 straw = vec3(0.55, 0.45, 0.22) * (0.8 + 0.4 * hn);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(straw, vec3(0.28, 0.2, 0.12), smoothstep(0.6, 1.0, uBrown)), dry);
    #endif
    #ifndef NOSCORCH
    float burnt = smoothstep(0.0, 0.6, uScorch - hn * 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.18 + vec3(0.025, 0.02, 0.018), burnt * 0.85);
    #endif
  }
`;

const FACADE_PARS = /* glsl */ `
varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vGround;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
`;

const FACADE = /* glsl */ `
  #include <emissivemap_fragment>
  if (abs(vObjN.y) < 0.5) {
    bool sx = abs(vObjN.x) > 0.5;
    float W = sx ? vSc.z : vSc.x;
    float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
    float y = vLoc.y * vSc.y;
    float seed = floor(vSeed * 1009.0 + 0.5);
    float face = floor(vObjN.x + 0.5) * 2.0 + floor(vObjN.z + 0.5) + 3.0;
    float hA = h21(vec2(seed, 3.7)), hB = h21(vec2(seed, 8.1)), hC = h21(vec2(seed, 1.3)), hD = h21(vec2(seed, 5.9));
    float style = vSc.y > 50.0 && hA < 0.75 ? 2.0 : (hA < 0.45 ? 0.0 : 1.0);
    float g0 = vGround + 4.4;                                   // top of the shopfront storey
    float FH = style == 0.0 ? 3.1 : 3.6;
    float nFl = floor((vSc.y - 1.2 - g0) / FH);
    float colTarget = style == 0.0 ? 2.7 + 0.6 * hB : (style == 1.0 ? 1.6 : 1.5);
    float nCol = max(1.0, floor(W / colTarget + 0.3));
    float colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 cell = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.1, 0.32, max(fw.x, fw.y));
    float detail = 1.0 - far;
    float ok = step(0.0, g.y) * step(cell.y, nFl - 1.0);
    float r = h21(cell + vec2(seed * 0.173, face * 1.37));
    float r2 = h21(cell * 1.7 + vec2(seed * 0.311 + 9.2, face * 0.71));
    // offices light whole bays together
    if (style > 0.5) { r = h21(vec2(floor(cell.x / 4.0), cell.y) + vec2(seed * 0.173, face * 1.37)); }
    vec2 wa, wb;
    if (style == 0.0) { wa = vec2(0.26, 0.28); wb = vec2(0.74, 0.8); }
    else if (style == 1.0) { wa = vec2(0.04, 0.3); wb = vec2(0.96, 0.92); }
    else { wa = vec2(0.03, 0.05); wb = vec2(0.97, 0.97); }
    float win = rect(f, wa, wb, fw) * ok;
    float lv = (f.y - wa.y) / (wb.y - wa.y);
    vec3 base = diffuseColor.rgb;
    // glass: darker and bluer on offices and towers, sky reflection toward the top of each pane
    vec3 glassC = style == 0.0 ? vec3(0.05, 0.055, 0.065) : vec3(0.06, 0.08, 0.11);
    glassC += vec3(0.05, 0.06, 0.08) * smoothstep(0.3, 1.0, lv) * (0.6 + 0.4 * r2);
    if (style == 2.0) { glassC = mix(vec3(0.07, 0.1, 0.14), vec3(0.16, 0.2, 0.26), h21(vec2(cell.y, seed))); base = mix(base, vec3(0.2, 0.23, 0.27), 0.6); }
    // apartments: sills + lintels, the odd balcony slab; offices: spandrel bands and mullions
    float sill = style == 0.0 ? rect(f, vec2(wa.x - 0.05, wa.y - 0.07), vec2(wb.x + 0.05, wa.y - 0.02), fw) * ok : 0.0;
    float lintel = style == 0.0 ? rect(f, vec2(wa.x - 0.03, wb.y + 0.01), vec2(wb.x + 0.03, wb.y + 0.06), fw) * ok : 0.0;
    float balc = style == 0.0 && hC < 0.5 && mod(cell.x + floor(hD * 3.0), 3.0) < 1.0 ? rect(f, vec2(0.12, 0.0), vec2(0.88, 0.3), fw) * ok : 0.0;
    float mull = style > 0.5 ? 1.0 - smoothstep(0.025, 0.025 + fw.x, 0.5 - abs(f.x - 0.5)) : 0.0;
    float slab = style == 1.0 ? (1.0 - rect(f, vec2(-1.0, 0.24), vec2(2.0, 0.98), fw)) * ok : 0.0;
    base = mix(base, base * 1.15 + 0.03, (sill + lintel) * detail);
    base = mix(base, base * 0.75, slab * detail * 0.6);
    base = mix(base, glassC, win * detail);
    base = mix(base, vec3(0.12, 0.12, 0.13), mull * win * detail * 0.8);
    // shopfronts: big lit windows, a door, and a coloured fascia above
    float shop = 1.0 - step(g0, y);
    float sCol = max(1.0, floor(W / 5.5 + 0.3));
    vec2 sg = vec2(u / (W / sCol), (y - vGround) / (g0 - vGround));
    vec2 sc = floor(sg), sf = fract(sg);
    vec2 sfw = max(fwidth(sg), vec2(1e-4));
    float rs = h21(sc + vec2(seed * 0.37, face * 2.1));
    float pane = rect(sf, vec2(0.06, 0.03), vec2(0.94, 0.66), sfw) * shop;
    float fascia = rect(sf, vec2(0.0, 0.72), vec2(1.0, 0.9), sfw) * shop;
    vec3 fasciaC = rs < 0.25 ? vec3(0.55, 0.1, 0.08) : rs < 0.5 ? vec3(0.08, 0.22, 0.32) : rs < 0.7 ? vec3(0.12, 0.3, 0.16) : vec3(0.15, 0.14, 0.13);
    base = mix(base, vec3(0.16, 0.15, 0.14), shop * 0.5);
    base = mix(base, fasciaC, fascia * (1.0 - far * 0.5));
    base = mix(base, vec3(0.05, 0.05, 0.06), pane * detail);
    // a cornice where the shopfront meets the upper floors, and at the top of the building
    float corn = (1.0 - smoothstep(0.0, 0.25 + fw.y * FH, abs(y - g0))) + (1.0 - smoothstep(0.0, 0.3 + fw.y * FH, abs(y - vSc.y + 0.5)));
    base = mix(base, base * 1.25 + 0.02, clamp(corn, 0.0, 1.0) * 0.6);
    base *= 1.0 - far * ok * 0.25;
    diffuseColor.rgb = base;
    // lights
    float onFrac = style == 0.0 ? 0.55 : (style == 1.0 ? 0.62 : 0.5);
    float lit = step(r, onFrac + 0.2 * (hD - 0.5));
    float offT = 33.0 + h21(vec2(seed, 11.0)) * 5.0 + r2 * 2.0;
    float flick = step(0.45, fract(sin(floor(uTime * 8.0) * 1.7 + r * 13.0) * 43758.5));
    float power = uTime < offT - 0.6 ? 1.0 : (uTime < offT ? flick : 0.0);
    vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.88, 0.7), r2);
    if (style > 0.5) warm = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.95, 0.85), r2);
    else if (r2 > 0.86) warm = vec3(0.65, 0.8, 1.0);
    // interiors: offices get a brighter ceiling strip and some blinds; flats are warmer and dimmer
    float interior = style > 0.5 ? (0.55 + 0.45 * smoothstep(0.8, 0.95, lv)) * (r2 < 0.35 ? 0.55 + 0.45 * step(0.5, fract(lv * 12.0)) : 1.0) * (0.3 + 0.35 * r)
                                 : (0.4 + 0.45 * r) * (0.75 + 0.25 * (1.0 - balc)) * (r2 > 0.4 && r2 < 0.7 ? 0.7 + 0.3 * smoothstep(0.5, 0.0, abs(f.x - 0.5)) : 1.0);
    float frameMask = 1.0 - mull * 0.9 * detail;
    float e = mix(win * lit * interior * frameMask, 0.1 * ok * onFrac, far) * power;
    float shopLit = step(0.3, rs) * power * (style == 2.0 ? 0.7 : 1.0);
    e += mix(pane * 1.1, shop * 0.12, far) * shopLit;
    totalEmissiveRadiance += e * warm + fascia * shopLit * fasciaC * 0.6 * detail;
  }
`;


export function patch(material, { windows = false, plant = false, scorch = true } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uCurl: G.uCurl, uCurlOrigin: G.uCurlOrigin, uCurlDir: G.uCurlDir,
      uTime: G.uTime, uLightsOut: G.uLightsOut, uBrown: G.uBrown, uScorch: G.uScorch, uGlow: G.uGlow, uMelt: G.uMelt, uDrain: G.uDrain,
    });
    shader.vertexShader =
      BEND_GLSL +
      `varying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? `attribute float aSeed; attribute float aGround; varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vGround;\n` : '') +
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
        #else
          vSc = vec3(1.0);
        #endif` : ''}
        wp.xyz = bendWorld(wp.xyz);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        `
      );
    let fs = (plant ? '#define PLANT\n' : '') + (scorch ? '' : '#define NOSCORCH\n') +
      `uniform float uTime; uniform float uLightsOut; uniform float uBrown; uniform float uScorch; uniform float uGlow; uniform float uMelt; uniform float uDrain;\nvarying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? FACADE_PARS : '') +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + HEAT_GLSL);
    if (windows) fs = fs.replace('#include <emissivemap_fragment>', FACADE);
    fs = fs.replace('#include <emissivemap_fragment>', GLOW_GLSL);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => (windows ? 'ef-win' : plant ? 'ef-plant' : scorch ? 'ef' : 'ef-ns');
  return material;
}
