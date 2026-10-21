// The ground: one mesh down the hill (fine across the street, where it rolls and splits; coarser out to the sides),
// its look drawn from position: asphalt with the cable car's rails and slot down the middle, lane lines,
// crosswalks at every cross street, sidewalks, the city's concrete beyond. Cracks spread across it as the
// magnitude climbs (uCrack); the rift is a black chasm (the stretched cells between its two sides).
import * as THREE from 'three';
import { ST, TRACKS, CROSS, groundY, BAY_Y } from './layout.js';
import { quakeShader, RIFT } from './quake.js';

export const GU = { uCrack: { value: 0 }, uDust: { value: 0 } };
const f1 = (x) => x.toFixed(2);

const PARS = /* glsl */ `
uniform float uCrack; uniform float uDust; uniform float uSplit;
varying vec3 vGP;
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
// distance to the nearest crack: edges of a jittered cell pattern
float crackD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = o + vec2(gh(i + o), gh(i + o + 7.7)) * 0.9;
    float d = length(c - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
float riftX(float z) { return 5.6 + 1.6 * sin(z * 0.021) + 0.8 * sin(z * 0.067 + 1.0); }
`;

const LOOK = /* glsl */ `
  #include <color_fragment>
  {
    vec2 p = vGP.xz;
    float ax = abs(p.x);
    float w = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.01;
    float grain = gn(p * 3.0) * 0.5 + gn(p * 17.0) * 0.5;
    vec3 asphalt = vec3(0.13, 0.125, 0.12) * (0.8 + 0.35 * grain) * (0.9 + 0.2 * gn(p * 0.07));
    vec3 col = asphalt;
    float mark = 0.0;
    float dc = 99.0;
    ${CROSS.map((c) => `dc = min(dc, abs(p.y - (${f1(c)})));`).join(' ')}
    bool inX = dc < 8.0;
    if (ax < ${f1(ST.road)}) {
      // the cable car: two pairs of rails and the cable slot between each pair, set in concrete
      float onT = 0.0;
      ${TRACKS.map((t) => `{ float d = abs(p.x - (${f1(t)})); onT = max(onT, band(d, 0.0, 1.05, w));
        col = mix(col, vec3(0.42, 0.4, 0.37) * (0.85 + 0.2 * grain), band(d, 0.0, 1.05, w));
        mark += 0.0; col = mix(col, vec3(0.62, 0.6, 0.58), band(d, 0.68, 0.76, w) * 0.9);
        col = mix(col, vec3(0.03), band(d, 0.0, 0.025, w)); }`).join('\n')}
      if (!inX) {
        float dash = step(fract(p.y / 9.0), 0.33);
        mark += band(ax, 3.55, 3.68, w) * dash;
        mark += band(ax, ${f1(ST.road - 2.4)}, ${f1(ST.road - 2.3)}, w);
      } else {
        mark += band(dc, 4.6, 7.4, w) * step(0.5, fract(p.x / 1.1)) * (1.0 - onT);
      }
    } else if (ax < ${f1(ST.walk)} || inX) {
      vec2 t = fract(p / 0.75);
      float joint = max(band(t.x, -0.02, 0.02, w * 2.0), band(t.y, -0.02, 0.02, w * 2.0));
      col = vec3(0.52, 0.5, 0.47) * (0.85 + 0.25 * gh(floor(p / 0.75))) * (1.0 - 0.25 * joint);
      col = mix(col, vec3(0.62, 0.6, 0.57), band(ax, ${f1(ST.road)}, ${f1(ST.road + 0.25)}, w));
    } else {
      col = vec3(0.34, 0.32, 0.3) * (0.8 + 0.3 * grain);
    }
    col = mix(col, vec3(0.88, 0.86, 0.8), clamp(mark, 0.0, 1.0) * 0.8);
    // cracks, spreading as the shaking grows; the wide ones dark and deep
    if (uCrack > 0.0) {
      vec2 pw = p + vec2(gn(p * 0.3), gn(p * 0.3 + 7.0)) * 3.0;           // jagged, not tiles
      float cd = crackD(pw / 9.0) * 9.0;
      float cd2 = crackD(pw / 2.6 + 11.0) * 2.6;
      float reach = uCrack - 0.6 * gn(p * 0.02);
      float keep = step(0.45, gh(floor(pw / 9.0) + 0.5));                 // only some of the cell edges crack
      float wide = 0.03 + 0.18 * clamp(reach, 0.0, 1.0);
      float cr = (1.0 - smoothstep(wide * 0.4, wide, cd)) * step(0.0, reach) * keep + (1.0 - smoothstep(0.01, 0.03, cd2)) * step(0.5, reach) * 0.6;
      col = mix(col, vec3(0.02, 0.018, 0.016), clamp(cr, 0.0, 1.0));
    }
    // the rift: what spans it is the chasm
    {
      float dr = abs(vGP.x - riftX(vGP.z));
      float inZ = step(vGP.z, ${f1(RIFT.z0 - 20)}) * step(${f1(RIFT.z1 + 30)}, vGP.z);
      col = mix(col, vec3(0.01, 0.008, 0.008), (1.0 - smoothstep(0.42, 0.56, dr)) * inZ * step(0.02, uSplit));
    }
    col = mix(col, vec3(0.5, 0.44, 0.37) * (0.8 + 0.3 * grain), uDust * 0.5);
    diffuseColor.rgb = col;
  }
`;

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <color_fragment>', LOOK);
    quakeShader(shader, {});
  };
  mat.customProgramCacheKey = () => 'ground-quake-v1';
  // grid: x fine across the street (0.5 m), coarser to the sides; z every 2 m near you, 4 m further down
  const xs = [];
  for (let x = -700; x < -16; x += x < -120 ? 20 : 3) xs.push(x);
  for (let x = -16; x < 16; x += 0.5) xs.push(x);
  for (let x = 16; x <= 700; x += x > 120 ? 20 : 3) xs.push(x);
  const zs = [];
  for (let z = 240; z > -1130; z -= z > -500 ? 2 : 4) zs.push(z);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  let k = 0;
  for (const z of zs) for (const x of xs) { pos[k++] = x; pos[k++] = groundY(x, z); pos[k++] = z; }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, b, c, b, d, c);   // (counter-clockwise from above: facing up)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  // the curbs: raised sidewalks along the street (follow the slope)
  return { mesh };
}
