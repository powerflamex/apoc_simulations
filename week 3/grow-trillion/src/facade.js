// The buildings' look, all in one material patch (instanced boxes, base at y = 0), at dusk:
//   kind 0 shops: painted stucco, punched windows, a lit shopfront at street level
//   kind 1 office / podium: concrete grid with punched windows
//   kind 2 glass tower: curtain wall that mirrors the dusk sky, mullions and floor bands
//   kind 3 condo tower: white balcony slabs every floor (Miami), glass behind
// Lit windows, coloured LED crowns on some towers, the street lights' glow on the lower floors.
// Per-instance timing (video time): aT = (windows burst, fire starts, collapse starts, collapse length);
// aS = (seed, kind, lights die, height); aC = crown colour (a = 1 if it has one). Burst windows go dark (and glow
// orange once the building burns); a collapsing building turns to dusty rubble.
import * as THREE from 'three';

export const F = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.9, -0.05, 0.3) },
  uDust: { value: 0 },
  uLit: { value: 0.18 },
};

const PARS = /* glsl */ `
uniform float uTime; uniform vec3 uSunDir; uniform float uDust; uniform float uLit;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vS; varying vec4 vC; varying vec3 vON;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
// the afternoon sky in a mirror: pale blue low down, deeper blue up high, warm toward the Sun, the city below
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  vec3 sd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  float cs = max(dot(normalize(vec3(r.x, 0.0, r.z)), sd), 0.0);
  vec3 low = mix(vec3(0.62, 0.72, 0.86), vec3(1.25, 1.05, 0.8), pow(cs, 4.0));
  vec3 c = mix(low, vec3(0.2, 0.38, 0.75), smoothstep(0.0, 0.6, h));
  c += vec3(4.0, 3.2, 2.2) * pow(max(dot(normalize(r), normalize(uSunDir)), 0.0), 900.0);
  c = mix(c, vec3(0.16, 0.15, 0.14), smoothstep(0.0, -0.12, r.y));
  return mix(c, vec3(0.42, 0.39, 0.35), uDust * 0.7);
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
  float FH = kind < 0.5 ? 3.6 : 3.3;
  float g0 = kind < 0.5 ? 4.4 : 5.5;
  float colW = kind > 1.5 && kind < 2.5 ? 1.6 : kind < 0.5 ? 2.6 + 0.8 * h21(vec2(seed, 2.0)) : 2.4 + h21(vec2(seed, 5.0));
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
    float fallK = clamp((uTime - vT.z) / max(vT.w, 0.1), 0.0, 1.0);
    float rubble = smoothstep(0.45, 0.85, fallK);
    float on = (1.0 - smoothstep(vS.z, vS.z + 0.25, uTime)) * (1.0 - smoothstep(0.0, 0.2, fallK));
    float burn = smoothstep(vT.y, vT.y + 3.0, uTime);
    vec3 base = diffuseColor.rgb * 0.75;
    vec3 V = normalize(vWP - cameraPosition);
    Cell c = cellOf();
    float hRel = c.y / max(vS.w, 1.0);
    if (abs(vON.y) < 0.5) {
      float hB = h21(vec2(seed, 8.1));
      float r = h21(c.id + vec2(seed * 0.173, c.face * 1.37));
      float floorR = h21(vec2(c.id.y, seed * 0.29 + c.face));
      // windows burst from the bottom up (the shock climbs the wall), a few at a time
      float breakT = vT.x + 0.35 * hRel + 0.45 * h21(c.id * 1.7 + seed);
      float broken = step(breakT, uTime);
      // the instant it bursts, a pane flashes (shards catching every light at once)
      float burst = broken * exp(-max(uTime - breakT, 0.0) / 0.1);
      vec3 col = base;
      float win = 0.0;
      vec3 refl = skyRefl(reflect(V, normalize(vWN)));
      float fres = 0.3 + 0.7 * pow(1.0 - abs(dot(V, normalize(vWN))), 3.0);
      if (kind > 1.5 && kind < 2.5) {
        win = rect(c.f, vec2(0.04, 0.2), vec2(0.96, 0.98), c.fw) * c.ok;
        vec3 glass = mix(base * 0.3, refl * mix(vec3(1.0), base * 1.8, 0.35), 0.55 + 0.45 * fres);
        glass = mix(glass, vec3(0.02, 0.02, 0.025), broken);
        col = mix(base * 0.45, glass, mix(win, 0.85 * c.ok, c.far));
        // the sky in the glass shows even on the shaded side
        totalEmissiveRadiance += refl * (0.12 + 0.3 * fres) * mix(win, 0.85 * c.ok, c.far) * (1.0 - broken) * (1.0 - fallK);
      } else if (kind > 2.5) {
        float band = 1.0 - step(0.22, c.f.y);
        float rail = band * 0.0 + (1.0 - step(0.42, c.f.y)) * step(0.22, c.f.y) * 0.5;
        win = rect(c.f, vec2(0.08, 0.26), vec2(0.92, 0.95), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.05, 0.07, 0.1), refl * 0.7, 0.5 * fres);
        glass = mix(glass, vec3(0.02), broken);
        col = mix(base * 0.7, glass, win * (1.0 - c.far * 0.5));
        col = mix(col, base * 1.1, band * c.ok);
        col = mix(col, vec3(0.75, 0.82, 0.86) * 0.6, rail * c.ok * (1.0 - broken) * 0.35);
      } else {
        float wTop = kind < 0.5 ? 0.86 : 0.88;
        win = rect(c.f, vec2(0.22, 0.26), vec2(0.78, wTop), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), refl * 0.7, 0.45 * fres) * (0.8 + 0.4 * r);
        glass = mix(glass, vec3(0.02), broken);
        col = mix(base, glass, win * (1.0 - c.far));
        col = mix(col, base * 0.75 + glass * 0.25, c.far * c.ok * 0.5);
      }
      totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * 2.2 * burst * max(win, 0.4 * c.far * c.ok);
      // the ground floor: shopfronts and lobbies lit warm from inside, a dark fascia over them
      if (c.ground > 0.5) {
        float g0 = kind < 0.5 ? 4.4 : 5.5;
        float bay = fract(c.W > 0.0 ? ((abs(vON.x) > 0.5 ? vLoc.z : vLoc.x) + 0.5) * c.W / 4.5 : 0.0);
        float pane = step(0.35, c.y) * step(c.y, g0 - 1.1) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(1.0, 0.8, 0.55), vec3(0.8, 0.95, 1.0), step(0.7, hB)) * (0.55 + 0.45 * h21(vec2(floor(bay * 9.0), seed)));
        col = mix(base * 0.6, mix(vec3(0.04), inside * 0.25, 1.0 - broken), pane);
        col = mix(col, vec3(0.07, 0.065, 0.07), step(g0 - 1.1, c.y));
        totalEmissiveRadiance += pane * inside * vec3(1.1, 0.9, 0.7) * on * (1.0 - broken * 0.9) * (0.35 + uLit);
        // a neon sign over some shops
        if (kind < 0.5) {
          float sgn = step(g0 - 1.0, c.y) * step(c.y, g0 - 0.25) * step(0.15, bay) * step(bay, 0.85) * step(0.4, hB);
          vec3 neon = mix(vec3(1.0, 0.2, 0.6), vec3(0.2, 0.9, 1.0), step(0.7, hB));
          totalEmissiveRadiance += sgn * neon * 2.0 * on * (0.4 + uLit);
        }
      }
      col = mix(col, base * 0.45, smoothstep(vS.w - 2.5, vS.w - 2.3, c.y));
      // flats and offices lit: runs of windows, warm and cool white
      float lit = step(r, 0.1 + 0.32 * step(floorR, 0.45 + 0.3 * hB)) * c.ok * (1.0 - c.ground);
      float tone = h21(vec2(c.id.y * 3.1 + c.id.x, seed));
      vec3 warm = tone < 0.55 ? vec3(1.0, 0.68, 0.38) : tone < 0.85 ? vec3(1.0, 0.82, 0.6) : vec3(0.75, 0.86, 1.0);
      float e = mix(win * lit * (0.22 + 0.5 * r * r), 0.07 * c.ok * (0.6 + 0.4 * hB), c.far) * on * (1.0 - broken);
      totalEmissiveRadiance += e * warm * uLit;
      // fire inside the burst windows: from the lower floors up, flickering
      float fireUp = clamp((uTime - vT.y) * 0.08, 0.0, 1.0);
      float inFire = burn * step(hRel, 0.12 + fireUp) * step(0.35, r) * broken * win;
      float fl = 0.6 + 0.4 * sin(uTime * (7.0 + 5.0 * r) + r * 30.0) * sin(uTime * 3.1 + floorR * 20.0);
      totalEmissiveRadiance += inFire * vec3(2.6, 0.9, 0.22) * fl;
      // soot over the burning floors
      col *= 1.0 - 0.6 * burn * step(hRel, 0.2 + fireUp);
      // LED crown: a coloured band and vertical strips at the top
      if (vC.a > 0.5) {
        float top = smoothstep(vS.w - 9.0, vS.w - 8.0, c.y);
        float strip = step(0.8, fract(((abs(vON.x) > 0.5 ? vLoc.z : vLoc.x) + 0.5) * c.W / 3.0)) * smoothstep(vS.w - 22.0, vS.w - 9.0, c.y);
        totalEmissiveRadiance += vC.rgb * (top * 0.9 + strip * 0.55) * on;
      }
      // the street lights' warm glow on the lowest floors
      
      diffuseColor.rgb = col;
    } else {
      diffuseColor.rgb = base * 0.14 + 0.02 * h21(floor(vWP.xz * 0.5));
    }
    float n = h21(floor(vWP.xz * 1.3) + floor(vWP.y * 1.3));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.33, 0.3) * (0.75 + 0.5 * n), rubble);
    totalEmissiveRadiance *= 1.0 - rubble;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.36, 0.32), uDust * 0.35);
  }
`;

export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, F);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aT; attribute vec4 aS; attribute vec4 aC;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vS; varying vec4 vC; varying vec3 vON;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLoc = position; vON = normal; vT = aT; vS = aS; vC = aC;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = wpp.xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <emissivemap_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'facade-grow-v1';
  return m;
}
