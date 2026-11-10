// Global "world bending" shared by every material (unused in this video: uCurl stays 0).
// Also the procedural city facades (offices, apartments, glass towers, shopfronts).
import * as THREE from 'three';

export const G = {
  uCurl: { value: 0 },
  uCurlOrigin: { value: new THREE.Vector2(0, 0) },
  uCurlDir: { value: new THREE.Vector2(0, -1) },
  uTime: { value: 0 },
  uLightsOut: { value: 0 },
  uDiskLight: { value: 0 },
  uCity: { value: 0 },        // 0 day .. 1 night: windows switch on block by block as it gets dark
  uSunDir: { value: new THREE.Vector3(0, 0.03, -1).normalize() },   // windows reflect the low Sun
  uShatter: { value: 0 },     // (unused here)
  uGreen: { value: 0 },       // (women-vanish) the city going green over the decades: ivy up the walls, moss on the roofs
  uPower: { value: 1 },
  uDecay: { value: 0 },       // (women-vanish) years of neglect: windows break one by one       // (women-vanish) 0 once the grid has failed: no window lights
};

export const BEND_GLSL = /* glsl */ `
uniform float uCurl;
uniform vec2 uCurlOrigin;
uniform vec2 uCurlDir;
vec3 bendWorld(vec3 p) {
  vec2 o = p.xz - uCurlOrigin;
  float dist = length(o);
  float d = max(dist - 110.0, 0.0);
  float facing = dot(o / max(dist, 1e-3), uCurlDir);
  // the world bowls up around the hole: sides rise most, a valley stays open beneath it
  float w = 0.3 + 0.7 * (1.0 - pow(max(facing, 0.0), 14.0));
  p.y += uCurl * w * d * d * 0.0006 / (1.0 + d * 0.00042);
  return p;
}
`;

const FACADE_PARS = /* glsl */ `
uniform float uTime; uniform float uLightsOut; uniform float uCity; uniform vec3 uSunDir; uniform float uGreen; uniform float uPower;
varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vGround; varying vec2 vDmg; uniform float uDecay;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
`;

// Facades are laid out in each building's own coordinates (columns fit the wall, floors start at street
// level) and every random choice is hashed from integers, so nothing shimmers from frame to frame.
// Styles: 0 older apartment block (punched windows, sills, a few balconies), 1 office (ribbon glazing,
// mullions), 2 glass tower (curtain-wall grid). The ground floor of every building is a shopfront.
// Lights: switched on building by building as it gets dark (uCity), off again at sunrise.
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
    if (style == 2.0) { glassC = mix(vec3(0.16, 0.22, 0.3), vec3(0.3, 0.38, 0.47), h21(vec2(cell.y, seed))); base = mix(base, vec3(0.26, 0.3, 0.35), 0.5); }
    // the glass reflects the sunset: gold toward the Sun's side of the sky, brighter at grazing angles, and a hot
    // glint where it mirrors the Sun itself (Manhattanhenge turns the street walls gold)
    vec3 Nf = normalize(vObjN);
    vec3 Vv = normalize(cameraPosition - vWPre);
    vec3 Rv = reflect(-Vv, Nf);
    float fres = 0.05 + 0.95 * pow(1.0 - max(dot(Nf, Vv), 0.0), 5.0);
    float toSunSide = pow(max(dot(normalize(Rv.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0), 3.0);
    vec3 skyRefl = mix(vec3(0.35, 0.38, 0.5), vec3(1.0, 0.6, 0.28), toSunSide) * smoothstep(-0.15, 0.1, Rv.y);
    float sunGlint = pow(max(dot(Rv, uSunDir), 0.0), 300.0) * 5.0;
    vec3 reflE = (skyRefl * fres * 0.5 + vec3(1.0, 0.7, 0.4) * sunGlint * 0.7) * (0.5 + 0.5 * r2);
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
    // decades without people: grime, then ivy climbing from the street in patches
    base *= 1.0 - 0.28 * uGreen;
    float ivyTop = vSc.y * uGreen * uGreen * (0.2 + 0.8 * h21(vec2(seed, face + 3.0)));
    float ivy = step(y, ivyTop * (0.55 + 0.9 * h21(floor(vec2(u / 2.3, y / 3.1)) + seed * 0.37))) * step(0.02, uGreen);
    base = mix(base, vec3(0.1, 0.19, 0.07) * (0.75 + 0.5 * h21(floor(vec2(u / 0.9, y / 0.9)) + seed)), ivy * 0.94);
    // neglect: windows broken out (dark holes), one by one over the years; fire: soot-black walls
    float broken = step(h21(cell * 1.31 + vec2(seed * 7.0, face)), uDecay * 0.85) * win * ok;
    base = mix(base, vec3(0.015), broken * mix(0.92, 0.55, far));
    base *= 1.0 - 0.78 * vDmg.y * (0.75 + 0.25 * h21(floor(vec2(u / 3.0, y / 2.0)) + seed));
    diffuseColor.rgb = base;
    // lights
    float onFrac = style == 0.0 ? 0.55 : (style == 1.0 ? 0.62 : 0.5);
    float lit = step(r, onFrac + 0.2 * (hD - 0.5));
    // each building (and each window in it) has its own moment to switch on as dusk falls, and off at dawn
    float when = 0.15 + 0.6 * h21(vec2(seed, 11.0)) + 0.25 * r2;
    float power = step(when, uCity) * uPower * (1.0 - ivy) * (1.0 - broken) * (1.0 - step(0.2, vDmg.x + vDmg.y));
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
    totalEmissiveRadiance += reflE * win * detail * (1.0 - lit * power * 0.5) * (1.0 - 0.7 * uGreen) * (1.0 - broken) * (1.0 - vDmg.y);
    // burning: flames in many of the windows, flickering
    float burnCell = step(h21(cell * 0.73 + vec2(seed, 2.0)), 0.55) * ok;
    float flick = 0.6 + 0.4 * sin(uTime * (6.0 + 7.0 * r) + r2 * 40.0);
    totalEmissiveRadiance += vec3(1.0, 0.36, 0.07) * vDmg.x * burnCell * flick * mix(win * 3.2, 1.1, far);
  } else if (vObjN.y > 0.5) {
    // roofs: moss and weeds spreading in patches
    float m = step(h21(floor(vWPre.xz / 6.0)), uGreen * 1.25) * (0.7 + 0.3 * h21(floor(vWPre.xz / 1.5)));
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.3 * uGreen), vec3(0.15, 0.25, 0.09) * (0.8 + 0.4 * h21(floor(vWPre.xz * 0.7))), m * 0.9);
  }
`;

// Patch a built-in material: world-space bend + world position varyings (+ optional facades).
export function patch(material, { windows = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uCurl: G.uCurl, uCurlOrigin: G.uCurlOrigin, uCurlDir: G.uCurlDir,
      uTime: G.uTime, uLightsOut: G.uLightsOut, uCity: G.uCity, uSunDir: G.uSunDir, uGreen: G.uGreen, uPower: G.uPower, uDecay: G.uDecay,
    });
    shader.vertexShader =
      BEND_GLSL +
      `varying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? `attribute float aSeed; attribute float aGround; attribute vec2 aDamage; varying float vSeed; varying vec3 vLoc; varying vec3 vSc; varying float vGround; varying vec2 vDmg;\n` : '') +
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
        ${windows ? `vSeed = aSeed; vGround = aGround; vDmg = aDamage; vLoc = transformed;
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
    if (windows) {
      shader.fragmentShader =
        `varying vec3 vWPre; varying vec3 vObjN;\n` + FACADE_PARS +
        shader.fragmentShader.replace('#include <emissivemap_fragment>', FACADE);
    } else {
      shader.fragmentShader = `varying vec3 vWPre; varying vec3 vObjN;\n` + shader.fragmentShader;
    }
  };
  material.customProgramCacheKey = () => (windows ? 'bend-win6' : 'bend');
  return material;
}
