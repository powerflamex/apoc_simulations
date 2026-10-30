// Land beyond the city, as polar meshes (fine near their centre, coarse far out) with one shader:
//   - the region round Seattle out to 200 km: its hills (Queen Anne, Capitol Hill, West Seattle...), the Olympic
//     Mountains across the Sound to the west (to ~2,400 m), the Cascade foothills and crest to the east
//   - Mount Rainier (4,392 m), 95 km south-east, with its own fine mesh
//   - the Himalaya round Everest (everest.js uses the same builder and shader)
// Colour from height and slope: forest, rock, snow and glaciers; distant haze; under the water line the murk.
import * as THREE from 'three';
import { RAINIER } from './layout.js';
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

// ---- heights (m above old sea level) ----
export function seattleH(x, z) {
  let h = 0;
  // the city's hills
  h += 140 * g2(x, z, 1900, -600, 900) + 130 * g2(x, z, 300, 1900, 1100) + 110 * g2(x, z, -1300, 1300, 700) + 105 * g2(x, z, -3200, 1700, 1300);
  h += 125 * g2(x, z, -3600, -3600, 1600) + 115 * g2(x, z, 3200, -2700, 1200) + 90 * g2(x, z, 5500, 1500, 2500) + 120 * g2(x, z, -1000, 6000, 2600);
  // Bainbridge Island and the Kitsap side
  h += 90 * g2(x, z, 1500, -12000, 3500) * (0.6 + 0.8 * fbm(x / 2500, z / 2500)) + 140 * g2(x, z, -2000, -22000, 9000) * fbm(x / 4000 + 3, z / 4000);
  // the Sound: west of the city everything dips under the old sea level
  const sound = sm(-900, -2500, z) * (1 - sm(-16000, -26000, z)) * (1 - g2(x, z, 1500, -12000, 3500));
  h -= 60 * sound;
  // the Olympics: a high block of ridges 60-110 km west
  {
    const k = sm(-48000, -62000, z) * (1 - sm(-120000, -140000, z)) * sm(-30000, -10000, x) * (1 - sm(70000, 90000, x));
    if (k > 0) h += k * (300 + 2100 * ridged(x / 14000, z / 14000, 6));
  }
  // the Cascades: foothills from 20 km east, the crest at 80-110 km
  {
    const foot = sm(18000, 40000, z), crest = sm(55000, 85000, z) * (1 - sm(130000, 160000, z));
    if (foot > 0) h += foot * (250 + 700 * ridged(x / 9000 + 7, z / 9000, 5)) + crest * 1500 * ridged(x / 16000 + 2, z / 16000 + 5, 6);
  }
  // the city itself is flat (the street plane covers it): sink the terrain just under it there
  const city = (1 - sm(1300, 1700, Math.abs(x - 100))) * (1 - sm(1200, 1600, Math.abs(z - 200)));
  return h * (1 - city) - 3 * city;
}
// Mount Rainier: a broad cone with glacier-cut ridges, a domed summit, Little Tahoma on the east flank
export function rainierH(dx, dz) {
  const r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const ridges = fbm(Math.cos(a) * 3.5 + r / 9000, Math.sin(a) * 3.5 - r / 7000, 5);   // glacier-cut ribs, irregular
  const prof = Math.pow(Math.max(0, 1 - r / 15500), 1.75);
  let h = 520 + 3870 * prof * (1 - 0.2 * (1 - ridges) * Math.min(1, r / 2500)) - 30 * Math.min(1, Math.pow(r / 900, 2)) + 30;
  h += 520 * g2(dx, dz, -2000, 3400, 900);                  // Little Tahoma
  h += 380 * (ridged(dx / 4000, dz / 4000, 6) - 0.5) * Math.min(1, r / 3000);
  return Math.max(h, 0);
}

// ---- the shader: rock, forest, snow, haze, murk ----
export const TU = {
  uFogC: { value: new THREE.Color(0.2, 0.21, 0.25) }, uFogD: { value: 0 }, uSnow: { value: 1800 }, uTree: { value: 1500 },
  uLight: { value: new THREE.Vector3(-0.2, 0.35, -1).normalize() }, uSun: { value: new THREE.Color(0.65, 0.42, 0.3) },
  uAmb: { value: new THREE.Color(0.2, 0.22, 0.27) }, uFlash: { value: 0 }, uLevel: DW.uLevel, uMurk: DW.uMurk,
  uBurnR: { value: 0 }, uBurnT: { value: 0 },
};
// the land burning out to uBurnR (m) round the Market: charred ground full of fires, a bright front at the edge.
// burn(xz, distance to the camera) -> (emission rgb, how charred)
export const BURN_GLSL = /* glsl */ `
uniform float uBurnR; uniform float uBurnT;
float bh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh(i), bh(i + vec2(1, 0)), f.x), mix(bh(i + vec2(0, 1)), bh(i + vec2(1, 1)), f.x), f.y); }
float bf(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * bn(p); p = p * 2.03 + 3.7; a *= 0.5; } return s; }
vec4 burn(vec2 xz, float d) {
  if (uBurnR <= 0.0) return vec4(0.0);
  float bd = length(xz) + (bf(xz / (uBurnR * 0.35 + 300.0)) - 0.5) * 0.3 * uBurnR;
  float inside = smoothstep(uBurnR, uBurnR * 0.92, bd);
  float sc = max(25.0, d * 0.002);
  float e = bf(xz / sc + vec2(uBurnT * 0.15, -uBurnT * 0.1));
  float e2 = bf(xz / (sc * 6.0) + 11.0);
  float fl = 0.75 + 0.25 * sin(uBurnT * 6.0 + e * 20.0);
  // charred ground, dull red where it smoulders, scattered points of open fire
  vec3 em = (vec3(1.6, 0.5, 0.08) * smoothstep(0.66, 0.8, e) * smoothstep(0.35, 0.6, e2) * fl + vec3(0.09, 0.02, 0.003) * smoothstep(0.3, 0.7, e2)) * inside;
  em += vec3(2.2, 0.9, 0.25) * exp(-pow((bd - uBurnR) / (0.035 * uBurnR + 40.0), 2.0)) * step(0.1, inside + 0.5);
  return vec4(em, inside);
}`;
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
      ${BURN_GLSL}
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
        vec3 forest = mix(vec3(0.035, 0.06, 0.04), vec3(0.06, 0.08, 0.05), nn);
        vec3 rock = mix(vec3(0.07, 0.07, 0.08), vec3(0.15, 0.145, 0.15), nn);
        vec3 col = mix(forest, rock, smoothstep(uTree - 250.0, uTree + 250.0, y + (nn - 0.5) * 400.0));
        col = mix(col, rock * 0.75, smoothstep(0.25, 0.45, steep));
        // snow and glaciers hold on the gentler slopes; the steep faces and ridges stay dark rock
        float snow = smoothstep(uSnow - 300.0, uSnow + 300.0, y + (nn - 0.5) * 700.0) * (1.0 - smoothstep(0.2, 0.38, steep + (nn - 0.5) * 0.22));
        // close up: rock strata (bands that follow the height) and streaks of snow down the gullies
        float near = 1.0 - smoothstep(600.0, 2500.0, d);
        if (near > 0.0) {
          vec2 wq = vec2(fbm(vW.xz * 0.03), fbm(vW.xz * 0.03 + 5.2));
          float strata = fbm(vec2((vW.x + vW.z) * 0.015 + wq.x * 3.0, vW.y * 0.22 + wq.y * 2.5));
          float streak = fbm(vec2((vW.x - vW.z) * 0.06 + wq.y * 2.0, vW.y * 0.01 + wq.x));
          vec3 r2 = mix(vec3(0.06, 0.06, 0.065), vec3(0.17, 0.15, 0.12), smoothstep(0.35, 0.7, strata));
          col = mix(col, r2, near * (1.0 - snow) * 0.6);
          snow = mix(snow, clamp(snow * 0.7 + smoothstep(0.56, 0.68, streak) * 0.8, 0.0, 1.0), near);
        }
        // snow: wind-packed, a little blue in the hollows
        float sn2 = fbm(vW.xz * 0.35) * 0.6 + fbm(vW.xz * 0.05) * 0.4;
        col = mix(col, mix(vec3(0.55, 0.6, 0.7), vec3(0.8, 0.81, 0.84), sn2) * (0.85 + 0.2 * nn), snow);
        float lit = max(dot(N, uLight), 0.0);
        vec3 c = col * (uAmb * (0.85 + 0.4 * N.y) + uSun * lit) + vec3(0.012, 0.013, 0.016) * (1.0 + uFlash * 2.5);
        { vec4 bu = burn(vW.xz, d); c = mix(c, c * 0.25, bu.w * step(0.5, y)) + bu.rgb * step(0.5, y); }
        // aerial haze
        float fog = 1.0 - exp(-uFogD * uFogD * d * d);
        c = mix(c, uFogC, fog);
        float dd = uLevel - y;
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

export function makeTerrain(scene) {
  const mat = terrainMaterial();
  const region = polarTerrain(seattleH, 0, 0, 400, 220000, 900, 260, mat);
  const rainier = polarTerrain((x, z) => Math.max(rainierH(x - RAINIER.x, z - RAINIER.z), seattleH(x, z) * 0.6), RAINIER.x, RAINIER.z, 30, 30000, 720, 300, mat);
  scene.add(region, rainier);
  return { group: [region, rainier], mat };
}
