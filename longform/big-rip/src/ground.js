// The ground's look, drawn from each vertex's ORIGINAL position (so a piece keeps its markings when the ground
// breaks and drifts away): the stone promenade, asphalt with lane lines and zebras, paving on the sidewalks,
// concrete lots. At night the street lamps throw warm pools and the shops spill light onto the sidewalks; snow
// covers it all (uSnow); the glowing cracks of the split run along the plate edges and spread (crack.js / uCrack).
import * as THREE from 'three';
import { PROM, ROAD, WALK, BLOCK, CROSSW } from './layout.js';
import { CU } from './city.js';

export const GU = { uLamp: { value: 1 }, uCrack: { value: 0 }, uCrackR: { value: 0 }, uSeeds: { value: [] }, uNSeeds: { value: 0 }, uTime: { value: 0 } };

export const MAXSEEDS = 48;
const PARS = /* glsl */ `
uniform float uLamp; uniform float uSnow; uniform float uNight; uniform float uCrack; uniform float uCrackR; uniform float uTime;
uniform vec2 uSeeds[${MAXSEEDS}]; uniform int uNSeeds;
varying vec3 vGP;
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
// thin cellular cracks (F2 - F1 of a jittered grid): the fine network that branches off the big ones
float cellEdge(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(gh(i + g), gh(i + g + 17.3));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
// distance to the nearest Voronoi edge of the plate seeds (the cracks)
float edgeDist(vec2 p) {
  float d1 = 1e9, d2 = 1e9; vec2 s1 = vec2(0.0), s2 = vec2(0.0);
  for (int i = 0; i < ${MAXSEEDS}; i++) {
    if (i >= uNSeeds) break;
    float d = dot(p - uSeeds[i], p - uSeeds[i]);
    if (d < d1) { d2 = d1; s2 = s1; d1 = d; s1 = uSeeds[i]; } else if (d < d2) { d2 = d; s2 = uSeeds[i]; }
  }
  vec2 m = 0.5 * (s1 + s2), n = normalize(s2 - s1);
  return abs(dot(p - m, n));
}
`;

const LOOK = /* glsl */ `
  #include <color_fragment>
  {
    vec2 p = vGP.xz;
    float ax = abs(p.x);
    float zc = floor((p.y + 40.0) / ${BLOCK.toFixed(1)} + 0.5) * ${BLOCK.toFixed(1)} - 40.0;
    float adz = abs(p.y - zc);
    float w = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.01;
    float grain = gn(p * 3.0) * 0.5 + gn(p * 17.0) * 0.5;
    vec3 asphalt = vec3(0.075, 0.075, 0.08) * (0.8 + 0.35 * grain) * (0.9 + 0.2 * gn(p * 0.08));
    vec3 col = asphalt;
    float mark = 0.0;
    bool cross = adz < ${CROSSW.toFixed(1)};
    float shine = 0.0;
    if (ax < ${PROM.toFixed(1)} && !cross) {
      // the promenade: big pale stone slabs in a running bond, a darker border
      vec2 t = vec2(p.x / 1.2, p.y / 0.8);
      t.x += 0.5 * mod(floor(t.y), 2.0);
      vec2 tf = fract(t);
      float joint = max(band(tf.x, -0.03, 0.03, w * 1.5), band(tf.y, -0.04, 0.04, w * 1.5));
      col = vec3(0.42, 0.39, 0.35) * (0.82 + 0.3 * gh(floor(t))) * (1.0 - 0.3 * joint);
      col = mix(col, vec3(0.2, 0.19, 0.18), band(ax, ${(PROM - 0.5).toFixed(2)}, 9.0, w));
      shine = 0.6;
    } else if (ax < ${ROAD.toFixed(1)} || (cross && ax > ${PROM.toFixed(1)})) {
      if (!cross) {
        float dash = step(fract(p.y / 9.0), 0.33);
        mark += band(ax, 10.72, 10.88, w) * dash;
        mark += band(ax, 14.15, 14.3, w) + band(ax, 7.25, 7.4, w);
      } else {
        // zebra crossings at both sides of every cross street, a stop line
        mark += band(adz, 4.6, 8.4, w) * step(0.5, fract(p.x / 1.1)) * step(ax, ${ROAD.toFixed(1)});
      }
      col = mix(col, vec3(0.8, 0.79, 0.74) * (0.8 + 0.2 * grain), clamp(mark, 0.0, 1.0) * 0.85);
      shine = 1.0;
    } else if (ax < ${WALK.toFixed(1)} && !cross) {
      vec2 t = fract(p / 0.6);
      float joint = max(band(t.x, -0.03, 0.03, w * 2.0), band(t.y, -0.03, 0.03, w * 2.0));
      col = vec3(0.36, 0.34, 0.31) * (0.85 + 0.25 * gh(floor(p / 0.6))) * (1.0 - 0.25 * joint);
      shine = 0.4;
    } else if (cross) {
      col = asphalt;
      shine = 1.0;
    } else {
      col = vec3(0.22, 0.21, 0.2) * (0.8 + 0.3 * grain);
    }
    // snow: a white blanket, trodden grey on the promenade, slush in the wheel tracks
    float tracks = step(ax, ${ROAD.toFixed(1)}) * step(${PROM.toFixed(1)}, ax) * smoothstep(0.9, 0.3, abs(fract((ax - 7.2) / 3.6) - 0.5) * 3.6);
    vec3 snowC = vec3(0.82, 0.84, 0.88) * (0.92 + 0.12 * grain);
    snowC = mix(snowC, vec3(0.32, 0.32, 0.34), tracks * 0.75);
    col = mix(col, snowC, uSnow * (0.75 + 0.25 * gn(p * 0.7)));
    diffuseColor.rgb = col;
    // night light: warm pools under the promenade lamps (two rows) and the sidewalk lamps, shop spill at the walls
    float L = 0.0;
    for (int s = -1; s <= 1; s += 2) {
      float sx = float(s);
      float lz = p.y - (60.0 + sx * 6.0);
      float k = floor(lz / 24.0 + 0.5);
      float dz = lz - k * 24.0;
      float dx = p.x - sx * ${(PROM - 0.6).toFixed(2)};
      L += 1.0 / (1.0 + (dx * dx + dz * dz) / 30.0);
      float lz2 = p.y - (72.0 + sx * 4.0);
      float k2 = floor(lz2 / 24.0 + 0.5);
      float dz2 = lz2 - k2 * 24.0;
      float dx2 = p.x - sx * ${(ROAD + 0.7).toFixed(2)};
      L += 0.8 / (1.0 + (dx2 * dx2 + dz2 * dz2) / 36.0);
    }
    float shop = exp(-max(${WALK.toFixed(1)} - ax, 0.0) / 2.2) * step(ax, ${WALK.toFixed(1)}) * (1.0 - step(${CROSSW.toFixed(1)}, -adz + ${CROSSW.toFixed(1)}) * 0.0);
    L = L * 0.55 + shop * 0.6 * (1.0 - float(cross));
    L *= step(ax, 40.0);
    totalEmissiveRadiance += col * vec3(1.0, 0.72, 0.44) * L * uLamp * mix(0.9, 1.6, uSnow);
    // the wet-look sheen of the night streets: a soft lamp-coloured glaze
    totalEmissiveRadiance += vec3(0.9, 0.6, 0.35) * L * uLamp * shine * 0.012 * (1.0 - uSnow);
    // the split: glowing cracks along the plate edges, spreading out from the first one
    if (uCrack > 0.0) {
      // jagged: the edge is pushed about by fine noise at two scales
      vec2 q = p + vec2(gn(p * 0.6) - 0.5, gn(p * 0.6 + 9.0) - 0.5) * 3.0 + vec2(gn(p * 3.0) - 0.5, gn(p * 3.0 + 4.0) - 0.5) * 0.6;
      float ed = edgeDist(q);
      float reach = smoothstep(uCrackR, uCrackR - 120.0, length(p - vec2(0.0, -60.0)));
      float wid = (0.06 + 0.55 * uCrack * uCrack) * reach;
      float px = w * 1.2;
      float core = smoothstep(wid + px, max(wid - px, 0.0), ed) * reach;
      float halo = exp(-max(ed - wid, 0.0) * 1.4) * reach * 0.25;
      // fine cracks branching off the big ones
      float ce = cellEdge(q * 0.16);
      float fine = smoothstep(0.035 + px * 0.16, 0.0, ce) * reach * smoothstep(22.0, 2.0, ed) * smoothstep(0.15, 0.7, uCrack);
      fine += smoothstep(0.03 + px * 0.45, 0.0, cellEdge(q * 0.45 + 7.0)) * reach * smoothstep(7.0, 1.0, ed) * smoothstep(0.35, 0.9, uCrack) * 0.6;
      vec3 hot = vec3(2.6, 0.75, 0.14);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), max(core, fine * 0.8));
      diffuseColor.rgb *= 1.0 - 0.5 * smoothstep(wid + 3.0, wid, ed) * reach;   // scorched beside the crack
      totalEmissiveRadiance += hot * (core * 1.6 + halo + fine * 0.9) * uCrack;
    }
  }
`;

export function groundMaterial(extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, ...extra });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, { uSnow: CU.uSnow, uNight: CU.uNight });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = position;');
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <color_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'ground-v1';
  return m;
}
