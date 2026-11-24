// Land beyond the city as polar meshes (fine near their centre, coarse far out) with one shader: the mountain
// (mountain.js) and the Himalaya round Everest (everest.js). Colour from height and slope: forest, meadow, rock, snow;
// distant haze; a band of surf where the water meets the slope; under the water line the murk.
import * as THREE from 'three';
import { DW } from './drown.js';

// ---- small deterministic noise in JS (the shapes are built on the CPU once) ----
function h2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function ridged(x, y, oct = 6) {
  let s = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1);
    n *= n * w; w = Math.min(1, n * 2);
    s += n * a; f *= 2.03; a *= 0.5;
  }
  return s;
}
export function fbm(x, y, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// ---- the shader: rock, forest, snow, haze, murk ----
export const TU = {
  uFogC: { value: new THREE.Color(0.2, 0.21, 0.25) }, uFogD: { value: 0 }, uSnow: { value: 1800 }, uTree: { value: 1500 },
  uLight: { value: new THREE.Vector3(-0.2, 0.35, -1).normalize() }, uSun: { value: new THREE.Color(0.65, 0.42, 0.3) },
  uAmb: { value: new THREE.Color(0.2, 0.22, 0.27) }, uFlash: { value: 0 }, uLevel: DW.uLevel, uMurk: DW.uMurk,
};
export function terrainMaterial(extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...TU, ...extra },
    vertexShader: /* glsl */ `
      attribute float aSlope; varying vec3 vW; varying vec3 vN; varying float vSlope;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; vSlope = aSlope; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogC; uniform float uFogD; uniform float uSnow; uniform float uTree; uniform vec3 uLight; uniform vec3 uSun;
      uniform vec3 uAmb; uniform float uFlash; uniform float uLevel; uniform vec3 uMurk;
      varying vec3 vW; varying vec3 vN; varying float vSlope;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 3.7; a *= 0.5; } return s; }
      void main() {
        vec3 N = normalize(vN);
        float steep = 1.0 - N.y;
        float y = vW.y;
        float d = length(cameraPosition - vW);
        float px = max(d * 0.0006, 0.5);
        float nn = fbm(vW.xz / (40.0 * px)) * 0.6 + fbm(vW.xz / 900.0) * 0.4;
        // forest low down, open rock and scree higher, snow and glaciers on the gentle slopes up high
        // forest: dark green, speckled with tree crowns; an alpine meadow just above the tree line; then rock
        float crowns = fbm(vW.xz / (9.0 * px));
        vec3 forest = mix(vec3(0.03, 0.07, 0.03), vec3(0.075, 0.13, 0.05), nn) * (0.75 + 0.5 * crowns);
        vec3 meadow = mix(vec3(0.11, 0.15, 0.06), vec3(0.16, 0.18, 0.09), nn);
        vec3 rock = mix(vec3(0.09, 0.09, 0.095), vec3(0.19, 0.18, 0.17), nn);
        float tl = y + (nn - 0.5) * 160.0;
        vec3 col = mix(forest, meadow, smoothstep(uTree - 40.0, uTree + 40.0, tl));
        col = mix(col, rock, smoothstep(uTree + 120.0, uTree + 420.0, y + (nn - 0.5) * 300.0));
        col = mix(col, rock * 0.75, smoothstep(0.25, 0.45, steep) * smoothstep(uTree - 300.0, uTree + 100.0, y) + smoothstep(0.42, 0.6, steep) * (1.0 - smoothstep(uTree - 300.0, uTree + 100.0, y)));
        // snow and glaciers hold on the gentler slopes; the steep faces and ridges stay dark rock
        float snow = smoothstep(uSnow - 300.0, uSnow + 300.0, y + (nn - 0.5) * 700.0) * (1.0 - smoothstep(0.3, 0.5, steep + (nn - 0.5) * 0.25));
        // close up: rock strata (bands that follow the height) and streaks of snow down the gullies
        float near = 1.0 - smoothstep(600.0, 2500.0, d);
        if (near > 0.0) {
          vec2 wq = vec2(fbm(vW.xz * 0.03), fbm(vW.xz * 0.03 + 5.2));
          float strata = fbm(vec2((vW.x + vW.z) * 0.015 + wq.x * 3.0, vW.y * 0.22 + wq.y * 2.5));
          float streak = fbm(vec2((vW.x - vW.z) * 0.06 + wq.y * 2.0, vW.y * 0.01 + wq.x));
          vec3 r2 = mix(vec3(0.06, 0.06, 0.065), vec3(0.17, 0.15, 0.12), smoothstep(0.35, 0.7, strata));
          col = mix(col, r2, near * (1.0 - snow) * 0.6);
          snow = mix(snow, clamp(snow * (0.75 + 0.35 * smoothstep(0.4, 0.6, streak)), 0.0, 1.0), near);
        }
        // snow: wind-packed, a little blue in the hollows
        float sn2 = fbm(vW.xz * 0.35) * 0.6 + fbm(vW.xz * 0.05) * 0.4;
        col = mix(col, mix(vec3(0.55, 0.6, 0.7), vec3(0.8, 0.81, 0.84), sn2) * (0.85 + 0.2 * nn), snow);
        float lit = max(dot(N, uLight), 0.0);
        vec3 c = col * (uAmb * (0.85 + 0.4 * N.y) + uSun * lit) + vec3(0.012, 0.013, 0.016) * (1.0 + uFlash * 2.5);
        // aerial haze
        float fog = 1.0 - exp(-uFogD * uFogD * d * d);
        c = mix(c, uFogC, fog);
        float dd = uLevel - y;
        // the surf where the climbing water meets the slope: a band of white foam just above the water line
        if (dd < 0.0 && dd > -18.0) {
          float fz = fbm(vW.xz * 0.05 + vec2(0.0, uLevel * 0.02)) * 0.7 + fbm(vW.xz * 0.4) * 0.3;
          float band = smoothstep(-18.0, -1.0, dd + (fz - 0.5) * 14.0);
          c = mix(c, vec3(0.62, 0.66, 0.68) * (0.6 + 0.6 * fz), band * 0.85);
        }
        if (dd > 0.0) c = mix(c * vec3(0.5, 0.65, 0.55), uMurk, 1.0 - exp(-dd / 1.6));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// a polar mesh centred on (cx, cz): rings from r0 to r1 (geometric), nA segments round; heights from fn(x, z)
export function polarTerrain(fn, cx, cz, r0, r1, nA, nR, mat, { hole = 0 } = {}) {
  const pos = new Float32Array((nA * nR + 1) * 3);
  let k = 0;
  pos[k++] = cx; pos[k++] = fn(cx, cz); pos[k++] = cz;
  const rs = [];
  for (let j = 0; j < nR; j++) rs.push(r0 * Math.pow(r1 / r0, j / (nR - 1)));
  for (let j = 0; j < nR; j++) for (let i = 0; i < nA; i++) {
    const a = (i / nA) * Math.PI * 2, x = cx + Math.cos(a) * rs[j], z = cz + Math.sin(a) * rs[j];
    pos[k++] = x; pos[k++] = fn(x, z); pos[k++] = z;
  }
  const idx = [];
  for (let i = 0; i < nA; i++) idx.push(0, 1 + (i + 1) % nA, 1 + i);
  for (let j = 0; j < nR - 1; j++) for (let i = 0; i < nA; i++) {
    const a = 1 + j * nA + i, b = 1 + j * nA + (i + 1) % nA, c = 1 + (j + 1) * nA + i, d = 1 + (j + 1) * nA + (i + 1) % nA;
    if (hole && rs[j] < hole) continue;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.setAttribute('aSlope', new THREE.BufferAttribute(new Float32Array(nA * nR + 1), 1));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

