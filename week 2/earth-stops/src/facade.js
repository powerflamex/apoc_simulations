// The buildings' look, all in one material patch (instanced boxes, base at y = 0):
//   kind 0 shop row / walk-up: painted plaster, punched windows with sills, a lit shopfront at street level
//   kind 1 mid-rise office: stone/concrete grid with punched windows
//   kind 2 glass tower: curtain wall that mirrors the golden sky, mullions and floor bands
//   kind 3 concrete residential tower: balcony slabs every floor
// Per-instance timing (video time) drives the damage: aT = (glass bursts, cladding strips, collapse starts,
// collapse length); aS = (seed, kind, lights die, full height). Broken windows go dark; stripped cells are cut
// out (the frame stays: you see through it); collapsing buildings turn to dusty rubble.
import * as THREE from 'three';

export const F = {
  uTime: { value: 0 },
  uGrid: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.15, -0.9) },
  uDust: { value: 0 },
};

const PARS = /* glsl */ `
uniform float uTime; uniform float uGrid; uniform vec3 uSunDir; uniform float uDust;
varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vS; varying vec3 vON;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rect(vec2 f, vec2 a, vec2 b, vec2 w) {
  vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  return s.x * s.y;
}
// the golden-hour sky as seen in a mirror: warm low on the Sun's side, blue-grey high up
vec3 skyRefl(vec3 r) {
  float h = clamp(r.y, -0.2, 1.0);
  float cs = max(dot(normalize(vec3(r.x, max(r.y, 0.0), r.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
  vec3 low = mix(vec3(0.95, 0.55, 0.32), vec3(1.25, 0.8, 0.45), pow(cs, 4.0));
  vec3 c = mix(low, vec3(0.42, 0.5, 0.68), smoothstep(0.02, 0.45, h));
  c = mix(c, vec3(0.16, 0.14, 0.13), smoothstep(0.0, -0.15, r.y));   // the street below
  c += vec3(2.2, 1.4, 0.7) * pow(max(dot(r, uSunDir), 0.0), 60.0);
  return mix(c, vec3(0.55, 0.45, 0.36), uDust * 0.7);
}
// facade layout: returns cell coords etc. kind-specific floor height / column width
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
  float g0 = kind < 0.5 ? 4.4 : 5.0;                  // ground floor height
  float colW = kind > 1.5 && kind < 2.5 ? 1.6 : kind < 0.5 ? 2.6 + 0.8 * h21(vec2(seed, 2.0)) : 2.2 + h21(vec2(seed, 5.0));
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

// cut out stripped cells (runs before lighting)
const CUT = /* glsl */ `
  {
    // (the cell lookup uses screen derivatives: do it before any branch, or the D3D shader compiler falls over)
    Cell c = cellOf();
    float kind = floor(vS.y + 0.5);
    float fallK = clamp((uTime - vT.z) / max(vT.w, 0.1), 0.0, 1.0);
    if (kind > 0.5 && abs(vON.y) < 0.5 && fallK < 0.7 && uTime > vT.y) {
      float seed = floor(vS.x * 1009.0 + 0.5);
      // it peels from the top down and from the windward (west) end, cell by cell, over ~5 s
      float hTop = 1.0 - c.y / max(vS.w, 1.0);
      float r = h21(c.id + vec2(seed * 0.37, c.face * 3.1));
      float t0 = vT.y + 4.5 * (0.45 * hTop + 0.55 * r);
      if (uTime > t0 && c.ok > 0.5) {
        bool glass = kind > 1.5 && kind < 2.5;
        // what is left: floor slabs, and columns every few bays
        float slab = 1.0 - step(0.16, c.f.y);
        float col = step(mod(c.id.x, 3.0), 0.5) * (1.0 - step(0.12, c.f.x));
        if (slab + col < 0.5 && (glass || (c.f.x > 0.12 && c.f.y > 0.2 && c.f.y < 0.9))) discard;
      }
    }
  }
`;

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float kind = floor(vS.y + 0.5);
    float seed = floor(vS.x * 1009.0 + 0.5);
    float fallK = clamp((uTime - vT.z) / max(vT.w, 0.1), 0.0, 1.0);
    float rubble = smoothstep(0.55, 0.85, fallK);
    float on = uGrid * (1.0 - smoothstep(vS.z, vS.z + 0.35, uTime)) * (1.0 - smoothstep(0.0, 0.2, fallK));
    vec3 base = diffuseColor.rgb;
    vec3 V = normalize(vWP - cameraPosition);
    Cell c = cellOf();
    if (abs(vON.y) < 0.5) {
      float hA = h21(vec2(seed, 3.7)), hB = h21(vec2(seed, 8.1));
      float r = h21(c.id + vec2(seed * 0.173, c.face * 1.37));
      float floorR = h21(vec2(c.id.y, seed * 0.29 + c.face));
      float broken = step(vT.x + 2.2 * h21(c.id * 1.7 + seed), uTime);
      vec3 col = base;
      float win = 0.0;
      vec3 refl = skyRefl(reflect(V, normalize(vWN)));
      float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, normalize(vWN))), 3.0);
      if (kind > 1.5 && kind < 2.5) {
        // curtain wall
        win = rect(c.f, vec2(0.04, 0.22), vec2(0.96, 0.98), c.fw) * c.ok;
        vec3 glass = mix(base * 0.35, refl * mix(vec3(1.0), base * 1.8, 0.4), 0.55 + 0.45 * fres);
        glass = mix(glass, vec3(0.03, 0.03, 0.035), broken);
        col = mix(base * 0.5, glass, mix(win, 0.85 * c.ok, c.far));
      } else if (kind > 2.5) {
        // residential: balcony slab bands, windows behind
        float band = 1.0 - step(0.2, c.f.y);
        win = rect(c.f, vec2(0.12, 0.3), vec2(0.88, 0.92), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.07, 0.08, 0.1), refl * 0.6, 0.5 * fres);
        glass = mix(glass, vec3(0.025), broken);
        col = mix(base * 0.78, glass, win * (1.0 - c.far * 0.5));
        col = mix(col, base * 1.08, band * c.ok);
      } else {
        // punched windows (shops' upper floors and offices)
        float wTop = kind < 0.5 ? 0.86 : 0.88;
        win = rect(c.f, vec2(0.22, 0.26), vec2(0.78, wTop), c.fw) * c.ok;
        float sill = rect(c.f, vec2(0.18, 0.2), vec2(0.82, 0.26), c.fw) * c.ok;
        vec3 glass = mix(vec3(0.06, 0.07, 0.09), refl * 0.7, 0.45 * fres) * (0.8 + 0.4 * r);
        // shutters, half-closed blinds on some
        if (kind < 0.5 && r > 0.8) glass = mix(glass, base * 0.6, step(0.45, c.f.y));
        glass = mix(glass, vec3(0.025), broken);
        col = mix(base, glass, win * (1.0 - c.far));
        col = mix(col, base * 1.15, sill * (1.0 - c.far));
        col = mix(col, base * 0.75 + glass * 0.25, c.far * c.ok * 0.5);
      }
      // the ground floor: shopfronts / lobbies, glass lit warm from inside, a dark fascia over it
      if (c.ground > 0.5) {
        float g0 = kind < 0.5 ? 4.4 : 5.0;
        float bay = fract(c.W > 0.0 ? ((abs(vON.x) > 0.5 ? vLoc.z : vLoc.x) + 0.5) * c.W / 4.5 : 0.0);
        float pane = step(0.35, c.y) * step(c.y, g0 - 1.1) * step(0.06, bay) * step(bay, 0.94);
        vec3 inside = mix(vec3(1.0, 0.82, 0.58), vec3(0.85, 0.95, 1.0), step(0.7, hB)) * (0.5 + 0.5 * h21(vec2(floor(bay * 9.0), seed)));
        col = mix(base * 0.7, mix(vec3(0.05), inside * 0.25, 1.0 - broken), pane);
        col = mix(col, vec3(0.08, 0.07, 0.07), step(g0 - 1.1, c.y));
        totalEmissiveRadiance += pane * inside * vec3(0.95, 0.8, 0.62) * on * (1.0 - broken * 0.85);
      }
      // the crown: a darker band at the top
      col = mix(col, base * 0.45, smoothstep(vS.w - 2.5, vS.w - 2.3, c.y));
      // office / flat lights: whole floors and runs of windows, warm and cool white
      float lit = step(r, 0.18 + 0.5 * step(floorR, 0.45 + 0.3 * hB)) * c.ok * (1.0 - c.ground);
      vec3 warm = mix(vec3(1.0, 0.76, 0.48), vec3(0.85, 0.92, 1.0), step(0.62, h21(vec2(c.id.y, seed))));
      float e = mix(win * lit * (0.45 + 0.6 * r), 0.12 * c.ok * (0.6 + 0.4 * hB), c.far) * on * (1.0 - 0.6 * broken);
      totalEmissiveRadiance += e * warm * 0.9;
      diffuseColor.rgb = col;
    } else {
      // roofs: tar, plant boxes (just noise here)
      diffuseColor.rgb = base * 0.42 + 0.03 * h21(floor(vWP.xz * 0.5));
    }
    // dust settles on everything as the city is scoured; rubble is grey-brown broken concrete
    float n = h21(floor(vWP.xz * 1.3) + floor(vWP.y * 1.3));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.38, 0.33) * (0.75 + 0.5 * n), rubble);
    totalEmissiveRadiance *= 1.0 - rubble;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.44, 0.37), uDust * 0.35);
  }
`;

export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, F);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aT; attribute vec4 aS;
        varying vec3 vLoc; varying vec3 vSc; varying vec3 vWP; varying vec3 vWN; varying vec4 vT; varying vec4 vS; varying vec3 vON;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLoc = position; vON = normal; vT = aT; vS = aS;
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = wpp.xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vSc * vSc)));`);
    const dbg = new URLSearchParams(location.search);
    shader.fragmentShader = PARS + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + (dbg.has('nocut') ? '' : CUT))
      .replace('#include <emissivemap_fragment>', dbg.has('nolook') ? '#include <emissivemap_fragment>' : LOOK);
  };
  m.customProgramCacheKey = () => 'facade-v1';
  return m;
}
