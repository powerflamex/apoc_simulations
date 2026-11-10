// Shared material patching: world-space bend hook (unused here, kept for shader compatibility),
// procedural facades (windows, shutters, doors, plinths) and snow on upward surfaces.
//
// Facades are laid out in each building's own coordinates: columns fit the wall width exactly,
// the ground floor starts at the highest ground under the building (aGround, metres above the
// bottom of the box), and everything below that is a stone plinth, so no window ever sinks into a
// slope. Every random choice is hashed from integers (house id, face, window cell), so it is the
// same on every pixel and every frame: no sparkle or flashing.
import * as THREE from 'three';

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
    float up = smoothstep(0.5, 0.85, vObjN.y);
    vec2 sp = vWPre.xz * 0.35 + vWPre.y * 0.1;
    float n = fract(sin(dot(floor(sp), vec2(12.9898, 78.233))) * 43758.5453);
    float cover = smoothstep(0.0, 0.35, uSnow - n * 0.25) * up;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), cover);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.8, 0.88), uSnow * 0.22 * (1.0 - up));
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

// Cycladic island town: whitewashed walls, small deep-set windows, blue/green/wood shutters and doors.
// Interior lights are on in a few houses at golden hour and go out when the shockwave arrives (T = 35 s);
// after that the glass is gone.
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
    float g0 = vGround + 0.35;                                  // top of the plinth = ground-floor level
    float FH = 2.9 + 0.4 * hA;                                  // storey height
    float nFl = floor((vSc.y - 0.3 - g0 - 0.8 * FH) / FH) + 1.0;
    float nCol = max(1.0, floor(W / (2.4 + 1.1 * hB) + 0.3));
    float colW = W / nCol;
    vec2 g = vec2(u / colW, (y - g0) / FH);
    vec2 cell = floor(g), f = fract(g);
    vec2 fw = max(fwidth(g), vec2(1e-4));
    float far = smoothstep(0.1, 0.32, max(fw.x, fw.y));
    float ok = step(0.0, g.y) * step(cell.y, nFl - 1.0) * step(0.5, nFl);
    float r = h21(cell + vec2(seed * 0.173, face * 1.37));
    float r2 = h21(cell * 1.7 + vec2(seed * 0.311 + 9.2, face * 0.71));
    // skip some openings on blank walls so facades are not perfect grids
    ok *= step(0.12, h21(cell * 2.3 + vec2(seed * 0.07, face * 3.1)));
    bool front = vObjN.z > 0.5;
    float doorCol = floor(hC * nCol);
    bool door = front && cell.y < 0.5 && abs(cell.x - doorCol) < 0.5;
    if (door) ok = step(0.0, g.y) * step(0.5, nFl);
    vec2 wa = door ? vec2(0.33, 0.0) : vec2(0.34, 0.3);
    vec2 wb = door ? vec2(0.67, 0.74) : vec2(0.66, 0.76);
    vec3 trim = hD < 0.45 ? vec3(0.07, 0.24, 0.55) : hD < 0.62 ? vec3(0.1, 0.36, 0.32) : hD < 0.8 ? vec3(0.36, 0.22, 0.13) : vec3(0.55, 0.12, 0.1);
    float hasShut = step(hA, 0.62);
    float win = rect(f, wa, wb, fw) * ok;
    float frame = clamp(rect(f, wa - 0.035, wb + vec2(0.035, 0.03), fw) * ok - win, 0.0, 1.0);
    float shut = (rect(f, vec2(wa.x - 0.17, wa.y), vec2(wa.x - 0.035, wb.y), fw) + rect(f, vec2(wb.x + 0.035, wa.y), vec2(wb.x + 0.17, wb.y), fw)) * ok * hasShut * (door ? 0.0 : 1.0);
    float closed = step(0.82, r2) * hasShut * (door ? 0.0 : 1.0);
    float sill = rect(f, vec2(wa.x - 0.06, wa.y - 0.06), vec2(wb.x + 0.06, wa.y - 0.02), fw) * ok * (door ? 0.0 : 1.0);
    float lv = (f.y - wa.y) / (wb.y - wa.y);
    float broken = step(35.0 + r * 0.12, uTime);
    vec3 glass = mix(vec3(0.05, 0.065, 0.08), vec3(0.2, 0.22, 0.25), smoothstep(0.35, 1.0, lv) * (0.5 + 0.5 * r));
    glass = mix(glass, vec3(0.62, 0.55, 0.44), step(0.55, r2) * step(r2, 0.72) * 0.55);       // curtains
    glass = mix(glass, vec3(0.025), broken);
    float slat = 0.8 + 0.2 * step(0.5, fract(lv * 7.0));
    if (door) glass = trim * (0.8 + 0.2 * step(0.08, abs(f.x - 0.5))) * mix(1.0, slat, 0.4);
    if (closed > 0.5) glass = trim * slat;
    float detail = 1.0 - far;
    vec3 base = diffuseColor.rgb;
    // stone plinth below the ground floor (visible on the downhill side of slopes)
    float plinth = 1.0 - smoothstep(g0 - 0.05 - fw.y * FH, g0 + fw.y * FH, y);
    vec2 sp = vec2(u * 2.2 + floor(y * 3.0) * 0.5, y * 3.0);
    vec3 stone = vec3(0.7, 0.68, 0.64) * (0.8 + 0.2 * h21(floor(sp) + seed)) * (0.85 + 0.15 * smoothstep(0.0, 0.08 + fw.x, min(fract(sp.x), fract(sp.y))));
    base = mix(base, mix(stone, vec3(0.72, 0.7, 0.66), far), plinth);
    base = mix(base, trim, shut * detail);
    base = mix(base, base * 0.82, frame * detail);
    base = mix(base, base * 1.08 + 0.04, sill * detail);
    base = mix(base, glass, win * detail);
    base *= 1.0 - far * ok * 0.1 * (1.0 + broken);
    diffuseColor.rgb = base;
    // a few interior lights at golden hour, cut when the shockwave hits
    float lit = step(r, 0.16 + 0.1 * hB) * (1.0 - closed) * (door ? 0.0 : 1.0) * (1.0 - broken);
    vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.88, 0.7), r2);
    float e = mix(win * lit * (0.25 + 0.3 * r) * (0.55 + 0.45 * lv), 0.012 * ok * (1.0 - broken), far);
    totalEmissiveRadiance += e * warm;
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
    let fs =
      `uniform float uTime; uniform float uSnow;\nvarying vec3 vWPre; varying vec3 vObjN;\n` +
      (windows ? FACADE_PARS : '') +
      shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + SNOW_GLSL);
    if (windows) fs = fs.replace('#include <emissivemap_fragment>', FACADE);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => (windows ? 'ast-win2' : 'ast');
  return material;
}
