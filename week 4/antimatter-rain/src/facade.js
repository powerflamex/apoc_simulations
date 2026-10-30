// The buildings' look, all in one material patch (instanced boxes, base at y = 0):
//   kind 0 old brick / walk-up: punched windows with sills, a lit shopfront at street level
//   kind 1 mid-rise office: stone/concrete grid with punched windows
//   kind 2 glass tower: curtain wall that mirrors the storm sky, mullions and floor bands, a lit crown on some
//   kind 3 concrete residential tower: balcony slabs every floor
// aS = (seed, kind, share of windows lit, full height). Lights go out with the grid (uGrid); a few stay on (people
// with lamps and generators). Everything under the water line fades into the murk (drown.js).
import * as THREE from 'three';
import { drownShader } from './drown.js';

export const F = {
  uTime: { value: 0 },
  uGrid: { value: 1 },
  uFlash: { value: 0 },
  uBroken: { value: 0 },                              // the windows blown in (dark holes)
  uFire: { value: new THREE.Color(0, 0, 0) },        // orange light from the fires and fireballs
  uGlow: { value: new THREE.Vector3(0, 0.05, -1) },   // where the sunset glow is (west)
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uGrid; uniform float uFlash; uniform vec3 uGlow; uniform float uBroken; uniform vec3 uFire;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
// the storm sky as seen in a mirror: dark slate overhead, the warm band low in the west, the street lights below
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  float w = pow(max(dot(normalize(vec3(r.x, 0.0, r.z)), normalize(vec3(uGlow.x, 0.0, uGlow.z))), 0.0), 3.0);
  vec3 c = mix(vec3(0.16, 0.17, 0.21) + vec3(0.75, 0.32, 0.16) * w, vec3(0.07, 0.08, 0.1), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(0.05, 0.05, 0.06), smoothstep(0.0, -0.15, r.y));
  return c * (1.0 + uFlash * 3.0) + uFire * 0.6;
}
struct Cell { vec2 f; vec2 id; vec2 fw; float ok; float far; float W; float y; float face; float ground; };
Cell cellOf() {
  Cell c;
  bool sx = abs(vON.x) > 0.5;
  float W = sx ? vSc.z : vSc.x;
  float u = ((sx ? vLoc.z : vLoc.x) + 0.5) * W;
  float y = vLoc.y * vSc.y;
  float kind = floor(vS.y + 0.5);
  float seed = floor(vS.x * 1009.0 + 0.5);
  float FH = kind < 0.5 ? 3.6 : 3.8;
  float g0 = kind < 0.5 ? 4.4 : 5.0;
  float colW = kind > 1.5 && kind < 2.5 ? 1.6 : kind < 0.5 ? 2.4 + 0.8 * h21(vec2(seed, 2.0)) : 2.2 + h21(vec2(seed, 5.0));
  float nCol = max(1.0, floor(W / colW + 0.5));
  colW = W / nCol;
  vec2 g = vec2(u / colW, (y - g0) / FH);
  c.id = floor(g); c.f = fract(g);
  c.fw = max(fwidth(g), vec2(1e-4));
  c.far = smoothstep(0.15, 0.45, max(c.fw.x, c.fw.y));
  c.ok = step(0.0, g.y) * step(y, vS.w - 1.5);
  c.W = W; c.y = y; c.ground = step(y, g0);
  c.face = floor(vON.x + 0.5) * 2.0 + floor(vON.z + 0.5) + 3.0;
  return c;
}
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x * 1009.0 + 0.5);
    vec3 base = diffuseColor.rgb;
    vec3 V = normalize(vWP - cameraPosition);
    Cell c = cellOf();
    if (abs(vON.y) < 0.5) {
      float hB = h21(vec2(seed, 8.1));
      float r = h21(c.id + vec2(seed * 0.173, c.face * 1.37));
      float floorR = h21(vec2(c.id.y, seed * 0.29 + c.face));
      vec3 col = base;
      float win = 0.0;
      vec3 refl = skyRefl(reflect(V, normalize(vWN)));
      float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, normalize(vWN))), 3.0);
      if (kind > 1.5 && kind < 2.5) {
        win = rect(c.f, vec2(0.04, 0.22), vec2(0.96, 0.98), c.fw) * c.ok;
        vec3 glass = mix(base * 0.3, refl * mix(vec3(1.0), base * 1.8, 0.35), 0.55 + 0.45 * fres);
        col = mix(base * 0.45, glass, mix(win, 0.85 * c.ok, c.far));
      } else if (kind > 2.5) {
        float band = 1.0 - step(0.2, c.f.y);
        win = rect(c.f, vec2(0.12, 0.3), vec2(0.88, 0.92), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), refl * 0.6, 0.5 * fres);
        col = mix(base * 0.62, glass, win * (1.0 - c.far * 0.5));
        col = mix(col, base * 0.85, band * c.ok);
      } else {
        float wTop = kind < 0.5 ? 0.84 : 0.88;
        win = rect(c.f, vec2(0.24, 0.24), vec2(0.76, wTop), c.fw) * c.ok;
        float sill = rect(c.f, vec2(0.2, 0.18), vec2(0.8, 0.24), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.05, 0.055, 0.07), refl * 0.7, 0.45 * fres) * (0.8 + 0.4 * r);
        col = mix(base * 0.8, glass, win * (1.0 - c.far));
        col = mix(col, vec3(0.75, 0.72, 0.66) * 0.7, sill * (1.0 - c.far));
        col = mix(col, base * 0.62 + glass * 0.25, c.far * c.ok * 0.5);
      }
      // blown-in windows: black holes with a few shards left at the edges
      if (uBroken > 0.0) {
        float shard = step(0.55 + 0.4 * h21(c.id * 3.1 + c.face), abs(c.f.x - 0.5) * 2.0 + 0.3 * h21(c.id + floor(c.f * 6.0)));
        col = mix(col, mix(vec3(0.012, 0.011, 0.012), col, shard), win * uBroken * step(r, 0.92) * (1.0 - c.far * 0.6));
      }
      // ground floor: shopfronts and lobbies, lit warm from inside, a dark awning band over them
      if (c.ground > 0.5) {
        float g0 = kind < 0.5 ? 4.4 : 5.0;
        float bay = fract(((abs(vON.x) > 0.5 ? vLoc.z : vLoc.x) + 0.5) * c.W / 4.5);
        float pane = step(0.3, c.y) * step(c.y, g0 - 1.2) * step(0.07, bay) * step(bay, 0.93);
        vec3 inside = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.95, 1.0), step(0.7, hB)) * (0.5 + 0.5 * h21(vec2(floor(bay * 9.0), seed)));
        col = mix(base * 0.55, inside * 0.22, pane);
        float awn = step(g0 - 1.2, c.y) * step(c.y, g0 - 0.35);
        col = mix(col, mix(vec3(0.35, 0.05, 0.05), vec3(0.06, 0.18, 0.12), step(0.5, hB)), awn);
        totalEmissiveRadiance += pane * inside * vec3(1.05, 0.85, 0.65) * uGrid;
      }
      col = mix(col, base * 0.4, smoothstep(vS.w - 2.5, vS.w - 2.3, c.y));
      // window lights: whole floors and runs of windows, warm and cool white; after the blackout only a few lamps
      float share = vS.z;
      float lit = step(r, 0.12 + 0.55 * share * step(floorR, 0.5 + 0.3 * hB)) * c.ok * (1.0 - c.ground);
      float lamp = step(r, 0.025) * step(0.6, floorR) * c.ok * (1.0 - c.ground);
      vec3 warm = mix(vec3(1.0, 0.74, 0.46), vec3(0.85, 0.92, 1.0), step(0.62, h21(vec2(c.id.y, seed))));
      float on = uGrid * lit + (1.0 - uGrid) * lamp * (0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0));
      float e = mix(win * on * (0.45 + 0.6 * r), 0.1 * c.ok * (0.5 * uGrid + 0.03) * (0.6 + 0.4 * hB), c.far);
      totalEmissiveRadiance += e * mix(warm, vec3(1.0, 0.8, 0.5), 1.0 - uGrid) * 0.95;
      // a lit crown on some towers (blue-white strips round the top)
      float crown = step(0.55, hB) * step(1.5, kind) * step(kind, 2.5) * smoothstep(vS.w - 6.0, vS.w - 5.5, c.y) * step(c.y, vS.w - 0.3) * step(60.0, vS.w);
      totalEmissiveRadiance += crown * vec3(0.5, 0.75, 1.2) * 0.8 * (0.4 + 0.6 * uGrid);
      diffuseColor.rgb = col;
    } else {
      diffuseColor.rgb = base * 0.35 + 0.03 * h21(floor(vWP.xz * 0.5));
    }
    diffuseColor.rgb *= 0.85;   // wet
  }
`;

export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, F);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aS;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vS; varying vec3 vON;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLoc = position; vON = normal; vS = aS;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = wpp.xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <emissivemap_fragment>', LOOK);
    drownShader(shader);
  };
  m.customProgramCacheKey = () => 'facade-amrain-v1';
  return m;
}
