// The ground under you at every stop: one big plane, its height and its colours chosen by the stop (uStop).
// heightAt(k, x, z) is the same function in JS (for placing trees, rocks, animals' feet) and in GLSL (the mesh).
// You stand at the origin; the ground is flattened round you (you never float or sink).
import * as THREE from 'three';
import { smooth } from './util.js';

export const SEA_Y = -1.0;        // the sea at the shore stop (k 6); the lake at the forest stop sits at -0.9
export const LAKE_Y = -0.9;

// raw heights (no flattening), the same formulas as RAW in the shader
function raw(k, x, z) {
  const S = Math.sin, C = Math.cos;
  switch (k) {
    case 2: return 0.7 * S(x * 0.05 + 1.0) * C(z * 0.04) + 0.4 * S(x * 0.13 + z * 0.09) + 0.03 * Math.max(-z - 20, 0)
      - 3.2 * smooth(-20, -36, x);
    case 3: return 1.4 * S(x * 0.021 + 1.0) * S(z * 0.017 + 0.4) + 0.35 * S(x * 0.08 - z * 0.06) + 6.0 * smooth(-300, -700, z) * (0.6 + 0.4 * S(x * 0.006));
    case 4: return 0.9 * S(x * 0.03 + 0.5) * C(z * 0.025) + 0.25 * S(x * 0.11 + z * 0.07) + 4.0 * smooth(-200, -600, z) * (0.5 + 0.5 * S(x * 0.01 + 2.0));
    case 5: return 0.8 * S(x * 0.045) * C(z * 0.05 + 1.0) + 0.35 * S(x * 0.17 + 2.0) * S(z * 0.15) + 14.0 * smooth(-120, -260, z) * (0.55 + 0.45 * S(x * 0.03 + 1.0));
    case 6: return 0.35 * S(x * 0.4 + 1.0) * S(z * 0.33) + 0.25 * S(x * 1.1 + z * 0.7) - 0.32 * Math.max(-z - 5, 0) + 0.18 * Math.max(z, 0);
    case 7: return 0.5 * S(x * 0.04 + 0.3) * C(z * 0.05) + 0.2 * S(x * 0.13 + z * 0.1) + 30.0 * smooth(-500, -900, z) * (0.5 + 0.5 * S(x * 0.008 + 1.0));
    default: return 0;
  }
}
export function heightAt(k, x, z) {
  if (k <= 1) return 0;
  const r = Math.hypot(x, z);
  return (raw(k, x, z) - raw(k, 0, 0)) * smooth(1.2, 5.0, r);
}

export const RAW_GLSL = /* glsl */ `
  float sst(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  float rawH(int k, float x, float z) {
    if (k == 2) return 0.7 * sin(x * 0.05 + 1.0) * cos(z * 0.04) + 0.4 * sin(x * 0.13 + z * 0.09) + 0.03 * max(-z - 20.0, 0.0) - 3.2 * sst(-20.0, -36.0, x);
    if (k == 3) return 1.4 * sin(x * 0.021 + 1.0) * sin(z * 0.017 + 0.4) + 0.35 * sin(x * 0.08 - z * 0.06) + 6.0 * sst(-300.0, -700.0, z) * (0.6 + 0.4 * sin(x * 0.006));
    if (k == 4) return 0.9 * sin(x * 0.03 + 0.5) * cos(z * 0.025) + 0.25 * sin(x * 0.11 + z * 0.07) + 4.0 * sst(-200.0, -600.0, z) * (0.5 + 0.5 * sin(x * 0.01 + 2.0));
    if (k == 5) return 0.8 * sin(x * 0.045) * cos(z * 0.05 + 1.0) + 0.35 * sin(x * 0.17 + 2.0) * sin(z * 0.15) + 14.0 * sst(-120.0, -260.0, z) * (0.55 + 0.45 * sin(x * 0.03 + 1.0));
    if (k == 6) return 0.35 * sin(x * 0.4 + 1.0) * sin(z * 0.33) + 0.25 * sin(x * 1.1 + z * 0.7) - 0.32 * max(-z - 5.0, 0.0) + 0.18 * max(z, 0.0);
    if (k == 7) return 0.5 * sin(x * 0.04 + 0.3) * cos(z * 0.05) + 0.2 * sin(x * 0.13 + z * 0.1) + 30.0 * sst(-500.0, -900.0, z) * (0.5 + 0.5 * sin(x * 0.008 + 1.0));
    return 0.0;
  }
  float groundH(int k, float x, float z) {
    if (k <= 1) return 0.0;
    return (rawH(k, x, z) - rawH(k, 0.0, 0.0)) * sst(1.2, 5.0, length(vec2(x, z)));
  }`;

const NOISE = /* glsl */ `
  float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gh(i), gh(i + vec2(1,0)), f.x), mix(gh(i + vec2(0,1)), gh(i + vec2(1,1)), f.x), f.y); }
  float gf(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * gn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
  // cells (cobbles, stones): distance to the nearest jittered point
  float cell(vec2 p){ vec2 i = floor(p), f = fract(p); float d = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(gh(i + o), gh(i + o + 17.0)) * 0.8 + 0.1 - f; d = min(d, dot(r, r)); }
    return sqrt(d); }
  vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
`;

export const GU = { uStop: { value: 0 }, uTime: { value: 0 }, uWet: { value: 0 } };

export function makeGround(scene) {
  const geo = new THREE.PlaneGeometry(2600, 2600, 520, 520).rotateX(-Math.PI / 2);
  // denser near you: pull vertices toward the origin (r' = r^1.6 scaled), so the cells near you are ~1 m
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const R = 1300 * Math.pow(r / 1300, 1.9);
    p.setXYZ(i, x / r * R, 0, z / r * R);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nuniform int uStop; varying vec3 vW;\n${RAW_GLSL}`)
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal;
        { float e = 0.35, x0 = position.x, z0 = position.z;
          float hx = groundH(uStop, x0 + e, z0) - groundH(uStop, x0 - e, z0), hz = groundH(uStop, x0, z0 + e) - groundH(uStop, x0, z0 - e);
          objectNormal = normalize(vec3(-hx, 2.0 * e, -hz)); }
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, groundH(uStop, position.x, position.z), position.z); vW = transformed;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform int uStop; uniform float uTime; varying vec3 vW;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gRough = 0.95;
        {
          vec2 q = vW.xz; float ax = abs(q.x);
          float n = gf(q * 0.35), n2 = gf(q * 2.3), big = gf(q * 0.04);
          vec3 c = vec3(0.5);
          float rough = 0.95;
          if (uStop == 0) {
            // today: asphalt, white lane lines, a concrete median, pale sidewalks with joints, kerbs
            c = srgb(vec3(0.24, 0.245, 0.25)) * (0.85 + 0.3 * n2) * (0.9 + 0.2 * n);
            float dash = step(0.5, fract(q.y / 9.0));
            if (abs(ax - 4.6) < 0.08) c = mix(c, srgb(vec3(0.85)), dash);
            if (abs(ax - 1.55) < 0.07) c = srgb(vec3(0.85, 0.7, 0.2));
            if (ax < 1.4) { c = srgb(vec3(0.62, 0.6, 0.56)) * (0.9 + 0.15 * n2); }
            if (ax > 9.0) { c = srgb(vec3(0.66, 0.64, 0.6)) * (0.88 + 0.18 * n2); float j = min(abs(fract(q.y / 2.0) - 0.5), abs(fract(q.x / 2.0) - 0.5)); c *= mix(0.8, 1.0, smoothstep(0.0, 0.02, j)); }
            if (ax > 9.0 && ax < 9.25) c = srgb(vec3(0.75, 0.74, 0.7));
            // a zebra crossing just behind you
            if (ax < 9.0 && q.y > 3.0 && q.y < 7.0 && fract(q.x / 1.2) < 0.5) c = srgb(vec3(0.86));
            rough = 0.9;
          } else if (uStop == 1) {
            // 1912: cobbles (setts) in the road, tram rails down the middle, brick sidewalks, dirt in the gutters
            float cb = cell(vec2(q.x * 2.4, q.y * 1.6));
            c = srgb(mix(vec3(0.33, 0.3, 0.27), vec3(0.45, 0.41, 0.36), gh(floor(vec2(q.x * 2.4, q.y * 1.6))))) * (0.55 + 0.5 * smoothstep(0.08, 0.32, cb));
            c = mix(c, srgb(vec3(0.3, 0.24, 0.17)), 0.5 * smoothstep(0.55, 0.75, gf(q * 0.6)));
            float rail = min(abs(ax - 0.72), abs(ax - 2.15));
            if (rail < 0.045) c = srgb(vec3(0.62, 0.6, 0.58)), rough = 0.35;
            if (ax > 9.0) { vec2 b = vec2(q.x * 4.5, q.y * 2.2 + 0.5 * floor(q.x * 4.5)); c = srgb(vec3(0.5, 0.25, 0.18)) * (0.8 + 0.3 * gh(floor(b))) * mix(0.6, 1.0, smoothstep(0.0, 0.06, min(fract(b.x), fract(b.y)))); }
            if (ax > 9.0 && ax < 9.3) c = srgb(vec3(0.55, 0.53, 0.5));
          } else if (uStop == 2) {
            // the forest: needles and leaf litter, moss, a pebble beach down at the lake
            c = srgb(mix(vec3(0.27, 0.19, 0.12), vec3(0.2, 0.3, 0.12), smoothstep(0.4, 0.65, n))) * (0.75 + 0.45 * n2);
            float beach = smoothstep(-0.2, -0.7, vW.y);
            c = mix(c, srgb(vec3(0.55, 0.5, 0.42)) * (0.7 + 0.5 * smoothstep(0.1, 0.4, cell(q * 3.0))), beach);
            c = mix(c, srgb(vec3(0.25, 0.24, 0.2)), smoothstep(-0.75, -0.95, vW.y));
          } else if (uStop == 3) {
            // the ice age: brown-olive tundra under patches of old snow, gravel
            c = srgb(mix(vec3(0.33, 0.3, 0.22), vec3(0.4, 0.38, 0.26), n)) * (0.75 + 0.4 * n2);
            float snow = smoothstep(0.52, 0.58, gf(q * 0.09) + 0.25 * n2 - 0.1 * big);
            c = mix(c, srgb(vec3(0.9, 0.93, 0.97)) * (0.92 + 0.08 * n2), snow);
            c = mix(c, srgb(vec3(0.5, 0.48, 0.45)), 0.4 * smoothstep(0.62, 0.7, cell(q * 1.5)) * (1.0 - snow));
          } else if (uStop == 4) {
            // golden grassland (blades on top); dry soil showing between
            c = srgb(mix(vec3(0.68, 0.52, 0.26), vec3(0.82, 0.66, 0.34), n)) * (0.8 + 0.35 * n2);
            c = mix(c, srgb(vec3(0.42, 0.33, 0.2)), 0.35 * smoothstep(0.55, 0.7, gf(q * 0.15)));
          } else if (uStop == 5) {
            // dusk on stony scrub: blue-grey stone, pale sand
            c = srgb(mix(vec3(0.36, 0.34, 0.32), vec3(0.52, 0.47, 0.4), smoothstep(0.35, 0.65, n))) * (0.7 + 0.5 * n2);
            c *= 0.75 + 0.45 * smoothstep(0.1, 0.35, cell(q * 1.2));
          } else if (uStop == 6) {
            // dark basalt rocks by the sea, lichen on top, wet and black near the water
            float cr = cell(q * 0.9);
            c = srgb(mix(vec3(0.17, 0.16, 0.16), vec3(0.3, 0.28, 0.26), n)) * (0.6 + 0.6 * smoothstep(0.05, 0.4, cr));
            c = mix(c, srgb(vec3(0.62, 0.58, 0.4)), 0.35 * smoothstep(0.6, 0.72, gf(q * 1.7)) * smoothstep(-0.5, 0.2, vW.y));
            float wet = smoothstep(-0.2, -0.75, vW.y);
            c *= 1.0 - 0.45 * wet; rough = mix(0.85, 0.3, wet);
          } else {
            // the Early Cretaceous: red-brown soil, mats of moss and fern litter
            c = srgb(mix(vec3(0.42, 0.25, 0.15), vec3(0.3, 0.4, 0.14), smoothstep(0.38, 0.62, n))) * (0.72 + 0.45 * n2);
            c = mix(c, srgb(vec3(0.2, 0.34, 0.12)), 0.5 * smoothstep(0.5, 0.7, gf(q * 0.12)));
          }
          diffuseColor.rgb = c;
          gRough = rough;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;');
  };
  mat.customProgramCacheKey = () => 'bt-ground';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
