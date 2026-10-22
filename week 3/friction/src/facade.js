// The houses' look, one material patch for every instanced box (base at y = 0, unit box scaled per instance):
//   kind 0 Victorian rowhouse: painted wood siding, white trim, tall sash windows, a garage and a front door with
//          steps at street level, a bracketed cornice; kind 1 plain stucco flat-front (bigger windows, no siding);
//   kind 2 brick block (the waterfront); kind 3 the bay window boxes (three tall windows across the front).
// Per instance: aT = (fails at, how long it takes, seed, kind); aF = (front axis: 0 = faces x / 1 = faces z, front
// sign, ground rise on the uphill side (m above the base), full height). A house that has failed (nails out) turns
// to splintered rubble as it folds.
import * as THREE from 'three';

export const F = {
  uTime: { value: 0 }, uGrid: { value: 1 }, uDust: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.2, -0.9) },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uGrid; uniform float uDust; uniform vec3 uSunDir;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vF; varying vec3 vON;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float box2(vec2 f, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  float cs = max(dot(normalize(vec3(r.x, max(r.y, 0.0), r.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
  vec3 c = mix(mix(vec3(0.95, 0.6, 0.38), vec3(1.2, 0.82, 0.5), pow(cs, 4.0)), vec3(0.45, 0.55, 0.75), smoothstep(0.02, 0.5, h));
  c = mix(c, vec3(0.2, 0.19, 0.18), smoothstep(0.0, -0.15, r.y));
  return c;
}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vT.w + 0.5);
    float seed = floor(vT.z * 1009.0 + 0.5);
    float fallK = clamp((uTime - vT.x) / max(vT.y, 0.1), 0.0, 1.0);
    float rubble = smoothstep(0.35, 0.9, fallK);
    vec3 base = diffuseColor.rgb;
    vec3 trim = vec3(0.93, 0.91, 0.86);
    vec3 V = normalize(vWP - cameraPosition);
    vec3 col = base;
    float emis = 0.0;
    bool faceX = abs(vON.x) > 0.5, faceZ = abs(vON.z) > 0.5;
    bool front = kind > 2.5 ? (faceX || faceZ) : (vF.x < 0.5 ? (faceX && vON.x * vF.y > 0.0) : (faceZ && vON.z * vF.y > 0.0));
    if (faceX || faceZ) {
      float W = faceX ? vSc.z : vSc.x;
      float u = ((faceX ? vLoc.z : vLoc.x) + 0.5) * W;
      float y = vLoc.y * vSc.y;
      vec2 fw = vec2(fwidth(u), fwidth(y)) + 1e-4;
      float far = smoothstep(0.08, 0.3, max(fw.x, fw.y));
      vec3 refl = skyRefl(reflect(V, normalize(vWN)));
      float fres = 0.3 + 0.7 * pow(1.0 - abs(dot(V, normalize(vWN))), 3.0);
      vec3 glassC = mix(vec3(0.05, 0.06, 0.08), refl * 0.8, 0.55 * fres);
      float rise = vF.z;                         // the ground on the uphill side, above the base
      float g0 = rise + 3.0;                     // the first upper floor
      float top = vSc.y;
      if (kind < 0.5) {
        // painted wood siding: fine horizontal laps
        col = base * (0.93 + 0.07 * smoothstep(0.35, 0.5, fract(y / 0.17)) * (1.0 - far));
      } else if (kind < 1.5) {
        col = base * (0.92 + 0.08 * h21(floor(vec2(u, y) * 2.0)) * (1.0 - far));
      } else if (kind < 2.5) {
        vec2 b = fract(vec2(u / 0.22 + floor(y / 0.08) * 0.5, y / 0.08));
        col = base * (0.8 + 0.3 * h21(floor(vec2(u / 0.22 + floor(y / 0.08) * 0.5, y / 0.08)))) * (1.0 - 0.25 * (1.0 - far) * max(1.0 - step(0.1, b.x), 1.0 - step(0.15, b.y)));
      }
      if (front && kind < 2.5) {
        // floors above the street: two or three tall sash windows (the bay window box covers the middle on kind 0)
        float FH = 3.3;
        float fy = (y - g0) / FH;
        float fi = floor(fy), ff = fract(fy);
        float nf = floor((top - g0 - 1.4) / FH + 0.01);
        float okF = step(0.0, fy) * step(fi, nf - 1.0);
        float nW = kind < 0.5 ? 2.0 : max(2.0, floor(W / 2.6));
        float cw = W / nW;
        float cu = fract(u / cw), ci = floor(u / cw);
        vec2 f = vec2(cu, ff);
        float wA = kind < 0.5 ? 0.3 : 0.18, wB = kind < 0.5 ? 0.7 : 0.82;
        float win = box2(f, vec2(wA, 0.18), vec2(wB, 0.86), fw / vec2(cw, FH)) * okF;
        float frame = box2(f, vec2(wA - 0.07, 0.12), vec2(wB + 0.07, 0.92), fw / vec2(cw, FH)) * okF;
        float sash = 1.0 - step(0.035, abs(ff - 0.52));
        float r = h21(vec2(ci, fi) + seed * 0.37);
        float lit = step(0.72, r) * uGrid * (1.0 - rubble);
        vec3 inside = mix(vec3(1.0, 0.78, 0.5), vec3(0.95, 0.9, 0.8), step(0.5, h21(vec2(fi, seed)))) * 0.8;
        vec3 g = mix(glassC, inside * 0.35, lit);
        col = mix(col, trim, frame * (1.0 - far * 0.6));
        col = mix(col, mix(g, trim, sash * 0.8), win * (1.0 - far * 0.5));
        emis += win * lit * (1.0 - sash);
        // street level: a garage door at the downhill end, the front door up a few steps at the other
        float gl = step(y, g0);
        float dU = vF.y > 0.0 ? W - u : u;                 // distance from the uphill end
        float garage = box2(vec2(dU, y), vec2(W - 3.2, rise - 1.4), vec2(W - 0.5, rise + 2.0), fw) * gl;
        float door = box2(vec2(dU, y), vec2(0.7, rise + 0.6), vec2(1.7, rise + 2.7), fw) * gl;
        float gpan = smoothstep(0.4, 0.5, fract((y - rise) / 0.5)) * 0.1;
        col = mix(col, mix(base * 0.55, trim * 0.85, 0.35) * (0.95 - gpan), garage);
        col = mix(col, base * 0.35 + vec3(0.05, 0.03, 0.02), door);
        col = mix(col, trim, box2(vec2(dU, y), vec2(0.55, rise + 2.7), vec2(1.85, rise + 2.95), fw) * gl);
        // the band between floors and the cornice: white, with brackets
        col = mix(col, trim, (1.0 - step(0.08, ff)) * okF * (1.0 - far));
        float cor = smoothstep(top - 1.3, top - 1.25, y);
        float br = step(0.75, fract(u / 0.6)) * step(y, top - 0.35) * (kind < 0.5 ? 1.0 : 0.0);
        col = mix(col, mix(trim, base * 0.6, br), cor);
        col = mix(col, base * 0.5, smoothstep(top - 1.28, top - 1.22, y) * (1.0 - smoothstep(top - 1.12, top - 1.06, y)));
      } else if (front && kind > 2.5) {
        // the bay window: three tall windows across its front, one in each side
        float FH = 3.3;
        float ff = fract(y / FH);
        float n = faceX == (vF.x < 0.5) ? 3.0 : 1.0;
        float cu = fract(u / (W / n));
        float win = box2(vec2(cu, ff), vec2(0.16, 0.16), vec2(0.84, 0.86), fw / vec2(W / n, FH));
        float lit = step(0.75, h21(vec2(floor(y / FH), seed))) * uGrid * (1.0 - rubble);
        col = mix(trim, mix(glassC, vec3(0.4, 0.3, 0.18), lit), win);
        col = mix(col, trim, 1.0 - step(0.06, abs(ff - 0.52)) * win);
        emis += win * lit * 0.9;
        col = mix(col, base, box2(vec2(cu, ff), vec2(-1.0, 0.0), vec2(2.0, 0.1), fw / vec2(W / n, FH)));
      } else if (kind > 1.5 && kind < 2.5) {
        // brick block: rows of windows, a lit shop front at street level
        vec2 f = vec2(fract(u / 3.2), fract((y - 4.2) / 3.6));
        float okF = step(4.2, y) * step(y, top - 1.0);
        float win = box2(f, vec2(0.22, 0.2), vec2(0.78, 0.88), fw / vec2(3.2, 3.6)) * okF;
        float lit = step(0.6, h21(floor(vec2(u / 3.2, (y - 4.2) / 3.6)) + seed)) * uGrid;
        col = mix(col, mix(glassC, vec3(0.5, 0.4, 0.25), lit), win);
        emis += win * lit * 0.8;
        float shop = step(0.4, y) * step(y, 3.6) * step(0.06, fract(u / 4.5));
        col = mix(col, mix(vec3(0.06), vec3(0.9, 0.7, 0.45), 0.6 * uGrid), shop);
        emis += shop * 0.9 * uGrid;
        col = mix(col, vec3(0.08, 0.07, 0.07), step(3.6, y) * step(y, 4.2));
      } else {
        // side walls: plain, a window or two
        float win = box2(vec2(fract(u / 5.0), fract((y - g0) / 3.3)), vec2(0.4, 0.25), vec2(0.6, 0.8), fw / vec2(5.0, 3.3)) * step(g0, y) * step(y, top - 1.5);
        col = mix(col * 0.9, glassC, win * (1.0 - far));
      }
      totalEmissiveRadiance += emis * vec3(1.0, 0.72, 0.42) * 1.1;
    } else {
      // roofs: tar and gravel, a light parapet edge, a skylight or vent
      vec2 rp = vWP.xz;
      col = vec3(0.24, 0.23, 0.23) * (0.8 + 0.3 * h21(floor(rp * 1.3)));
      vec2 lu = vLoc.xz + 0.5;
      float edge = 1.0 - box2(lu, vec2(0.04), vec2(0.96), vec2(0.01));
      col = mix(col, vec3(0.62, 0.6, 0.56), edge * 0.7);
      col = mix(col, vec3(0.5, 0.52, 0.55), box2(lu, vec2(0.4, 0.55), vec2(0.6, 0.7), vec2(0.01)));
    }
    // folding: splintered timber, plaster dust
    float n = h21(floor(vWP.xz * 2.1) + floor(vWP.y * 2.1));
    vec3 splinter = mix(vec3(0.42, 0.33, 0.24), base * 0.8, 0.45) * (0.65 + 0.6 * n);
    col = mix(col, splinter, rubble);
    totalEmissiveRadiance *= 1.0 - rubble;
    col = mix(col, vec3(0.55, 0.49, 0.42), uDust * 0.3);
    diffuseColor.rgb = col;
  }
`;

export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, F);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aT; attribute vec4 aF;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vF; varying vec3 vON;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLoc = position; vON = normal; vT = aT; vF = aF;
        // (the height is the house's own, passed in: when it racks and folds the windows go with the walls)
        vSc = vec3(length(instanceMatrix[0].xyz), aF.w, length(instanceMatrix[2].xyz));
        vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = wpp.xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'friction-facade-v1';
  return m;
}
