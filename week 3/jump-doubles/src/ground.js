// The ground: one curved disk (polar rings, fine in the middle, out to 400 km) whose look is drawn from world
// position. Near: Brickell Avenue and the cross streets (lanes, crosswalks, sidewalks, the street lamps' pools of
// light), the bay. Further: the city's grid of street lights, the river, the bay and Miami Beach, the ocean; far
// off it blends into the NASA maps the globe uses. Every bounce leaves its mark in the middle: the crater (pushed
// down in the vertex shader, white-hot after a fireball landing), torn-up asphalt, cracks, scorch.
import * as THREE from 'three';
import { AVE, CROSS, STREETS_X, STREET_HW, BAY_X, BEACH, LANES } from './layout.js';
import { R_E } from './timeline.js';
import { SURF, SURFACE_GLSL, DISK_R } from './earth.js';
import { F } from './facade.js';

export const GU = {
  uCrater: { value: 0.1 }, uDepth: { value: 0.03 }, uCrack: { value: 1 }, uTorn: { value: 0 }, uScorch: { value: 0 },
  uHot: { value: 0 }, uWet: { value: 0 }, uOutR: { value: 0 }, uFresh: { value: 0 }, uHaze: { value: 1 },
};

const VERT_PARS = /* glsl */ `
uniform float uCrater; uniform float uDepth;
varying vec3 vGP;
float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float craterH(vec2 p) {
  float r = length(p);
  float R = max(uCrater, 0.05);
  float k = r / R;
  float bowl = k < 1.0 ? -uDepth * (1.0 - k * k) : 0.0;
  float rim = uDepth * 0.28 * exp(-pow((k - 1.05) / 0.28, 2.0)) * smoothstep(0.6, 1.0, k);
  float rough = (hh(floor(p * 2.0)) - 0.5) * 0.25 * min(uDepth, 1.5) * smoothstep(1.5, 0.3, k);
  return bowl + rim + rough;
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uCrater; uniform float uDepth; uniform float uCrack; uniform float uTorn; uniform float uScorch; uniform float uHot;
uniform float uWet; uniform float uOutR; uniform float uTime; uniform float uFresh; uniform float uHaze;
varying vec3 vGP;
${SURFACE_GLSL}
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 gh2(vec2 p){ return vec2(gh(p), gh(p + 17.31)); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
// a grid line of half-width hw every 'period', antialiased; far off it turns into its average
float lineAA(float c, float period, float hw) {
  float px = max(fwidth(c), 1e-4);
  float d = abs(fract(c / period + 0.5) - 0.5) * period;
  float w = max(hw, px * 0.7);
  float cov = clamp((w - d) / px + 0.5, 0.0, 1.0) * (hw / w);
  return mix(cov, 2.0 * hw / period, smoothstep(period * 0.2, period * 0.6, px));
}
// distance to the nearest edge of a cell pattern (for cracks and broken slabs); also returns the cell id
float cellEdge(vec2 p, out vec2 id) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = vec2(float(x), float(y));
    vec2 o = c + gh2(i + c) - f;
    float d = dot(o, o);
    if (d < d1) { d2 = d1; d1 = d; id = i + c; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
// the coast: the bay shore, Miami Beach, the ocean (wiggly)
float waterAt(vec2 p) {
  float shore = ${BAY_X.toFixed(1)} + 40.0 * sin(p.y * 0.004) + 25.0 * sin(p.y * 0.011 + 1.0) + max(0.0, -p.y - 3000.0) * 0.05;
  float bx0 = ${BEACH.x0.toFixed(1)} + 150.0 * sin(p.y * 0.0006) + max(0.0, p.y - 6000.0) * 0.5;
  float bx1 = ${BEACH.x1.toFixed(1)} + 120.0 * sin(p.y * 0.0007 + 2.0) + max(0.0, p.y - 6000.0) * 0.5;
  float w = step(shore, p.x) * (1.0 - step(bx0, p.x)) + step(bx1, p.x);
  if (p.y > 9000.0 && p.x > bx0) w = 1.0;
  // the Miami River, a channel west from the bay a little north of you
  float riv = 1.0 - smoothstep(28.0, 34.0, abs(p.y + 1260.0 + 60.0 * sin(p.x * 0.004)));
  w = max(w, riv * step(p.x, shore) * step(-6000.0, p.x));
  return w;
}
`;

const LOOK = /* glsl */ `
  #include <color_fragment>
  vec3 emis = vec3(0.0);
  {
    vec2 p = vGP.xz;
    float r = length(p);
    float w = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.01;
    float grain = gn(p * 3.0) * 0.5 + gn(p * 17.0) * 0.5;
    vec3 col;
    float water = waterAt(p);
    float nearK = 1.0 - smoothstep(1800.0, 2600.0, r);
    vec3 near = vec3(0.0), nearE = vec3(0.0);
    if (nearK > 0.0) {
      float ax = abs(p.x);
      float zc = floor(p.y / ${CROSS.step.toFixed(1)} + 0.5) * ${CROSS.step.toFixed(1)};
      float dz = p.y - zc, adz = abs(dz);
      vec3 asphalt = vec3(0.07, 0.07, 0.075) * (0.75 + 0.4 * grain) * (0.9 + 0.2 * gn(p * 0.08));
      vec3 c = vec3(0.16, 0.155, 0.15) * (0.8 + 0.3 * grain);                  // lots and plazas
      float mark = 0.0;
      bool onAve = ax < ${AVE.road.toFixed(1)};
      float sx = 1e4;
      ${STREETS_X.map((x) => `sx = min(sx, abs(p.x - (${x.toFixed(1)})));`).join(' ')}
      bool onSide = sx < ${STREET_HW.toFixed(1)};
      bool onCross = adz < ${CROSS.road.toFixed(1)};
      if (onAve) {
        if (ax < ${AVE.median.toFixed(1)} && adz > ${CROSS.walk.toFixed(1)}) {
          c = mix(vec3(0.05, 0.08, 0.03), vec3(0.1, 0.13, 0.05), grain);
        } else {
          c = asphalt;
          float dash = step(fract(p.y / 9.0), 0.33);
          mark += (band(ax, 5.12, 5.28, w) + band(ax, 8.52, 8.68, w)) * dash * step(${CROSS.walk.toFixed(1)}, adz);
          mark += band(ax, 11.6, 11.75, w) * step(${CROSS.walk.toFixed(1)}, adz);
          c = mix(c, vec3(0.8, 0.6, 0.1), band(ax, 1.75, 1.9, w) * step(${CROSS.walk.toFixed(1)}, adz));
          mark += band(adz, 8.2, 11.8, w) * step(0.5, fract(ax / 1.2));
          mark += band(dz * sign(p.x), 12.0, 12.45, w) * step(${AVE.median.toFixed(1)}, ax);
        }
      } else if (onCross || onSide) {
        c = asphalt;
        if (onCross) {
          float dash = step(fract(p.x / 9.0), 0.33);
          mark += band(adz, 3.62, 3.78, w) * dash * step(${AVE.walk.toFixed(1)}, ax);
          mark += band(ax, 13.4, 17.0, w) * step(0.5, fract(adz / 1.2));
        }
      } else if (ax < ${AVE.walk.toFixed(1)} || adz < ${CROSS.walk.toFixed(1)} || sx < ${(STREET_HW + 4).toFixed(1)}) {
        vec2 t = fract(p / 0.6);
        float joint = max(band(t.x, -0.03, 0.03, w * 2.0), band(t.y, -0.03, 0.03, w * 2.0));
        c = vec3(0.32, 0.3, 0.28) * (0.85 + 0.25 * gh(floor(p / 0.6))) * (1.0 - 0.25 * joint);
      }
      c = mix(c, vec3(0.8, 0.79, 0.75) * (0.85 + 0.2 * grain), clamp(mark, 0.0, 1.0) * 0.85);
      // the street lamps' pools of light (sodium-warm on the avenue, whiter on the side streets); they die in the outage
      float pool = 0.0;
      for (int sd = -1; sd <= 1; sd += 2) {
        float s = float(sd);
        float lx = s * ${(AVE.road + 0.9).toFixed(1)};
        float lz = floor((p.y - s * 7.0) / 30.0 + 0.5) * 30.0 + s * 7.0;
        float on = step(uOutR, length(vec2(lx, lz)));
        vec2 dd = p - vec2(lx - s * 3.0, lz);
        pool += on * exp(-dot(dd, dd) / 70.0) * (1.0 - step(abs(lz - floor(lz / 125.0 + 0.5) * 125.0), 14.0));
        float lxx = floor((p.x - s * 5.0) / 30.0 + 0.5) * 30.0 + s * 5.0;
        float lzz = zc + s * ${(CROSS.road + 0.9).toFixed(1)};
        float on2 = step(uOutR, length(vec2(lxx, lzz))) * step(${(AVE.walk + 3).toFixed(1)}, abs(lxx));
        vec2 d2 = p - vec2(lxx, lzz - s * 2.5);
        pool += on2 * exp(-dot(d2, d2) / 55.0) * 0.8;
      }
      // headlights spilling from the stopped queues onto the avenue, and the general glow of the lit street
      float street = (onAve || onCross || onSide) ? 1.0 : 0.6;
      near = c;
      nearE = c * vec3(1.0, 0.72, 0.45) * (pool * 2.6 + 0.12 * street * step(uOutR, r));
      // the bay: dark water mirroring the dusk, shimmering with the shore's lights
      if (water > 0.5) {
        vec3 V = normalize(cameraPosition - vGP);
        float fres = 0.04 + 0.96 * pow(1.0 - max(V.y, 0.0), 5.0);
        float rip = gn(p * vec2(0.03, 0.12) + vec2(uTime * 0.1, 0.0)) * gn(p * vec2(0.08, 0.35) - vec2(0.0, uTime * 0.15));
        vec3 skyR = mix(vec3(0.06, 0.1, 0.22), vec3(0.4, 0.25, 0.3), pow(1.0 - max(V.y, 0.0), 3.0));
        near = vec3(0.01, 0.02, 0.03);
        float shoreD = abs(p.x - ${BAY_X.toFixed(1)});
        nearE = skyR * fres * 0.8 + vec3(1.0, 0.75, 0.5) * exp(-shoreD / 150.0) * smoothstep(0.45, 0.8, rip) * 0.3 * (1.0 - smoothstep(0.5, 3.0, w));
      }
    }
    // ---- the city from above: street lights in a grid, brighter arterials, the highway; water; far: the maps ----
    vec3 mid = vec3(0.0), midE = vec3(0.0);
    vec3 n = normalize(vGP - vec3(0.0, ${(-R_E).toFixed(1)}, 0.0));
    float isW;
    vec3 V = normalize(cameraPosition - vGP);
    vec3 farC = earthSurface(n, V, smoothstep(30000.0, 120000.0, r), 0.12 + 0.88 * smoothstep(60000.0, 350000.0, r), isW);
    float texLights = texture2D(uNight, earthUV(n)).r;
    if (nearK < 1.0) {
      float dens = smoothstep(0.05, 0.4, texLights) * (1.0 - step(0.5, water)) * (1.0 - smoothstep(-26000.0, -20000.0, -p.x) * 0.0);
      dens *= smoothstep(-24000.0, -16000.0, p.x);
      // street lights: dots every 35 m along every street (dimmer and patchy), brighter along the arterials
      float dotsZ = lineAA(p.x, 35.0, 3.0), dotsX = lineAA(p.y, 35.0, 3.0);
      // each street (and each block's stretch of it) has its own brightness; some are dark
      float sA = gh(vec2(floor(p.y / 125.0 + 0.5), floor(p.x / 600.0))), sB = gh(vec2(floor(p.x / 150.0 + 0.5) + 0.37, floor(p.y / 500.0)));
      float g = max(lineAA(p.y, 125.0, 2.5) * dotsZ * step(0.18, sA) * (0.4 + sA), lineAA(p.x, 150.0, 2.5) * dotsX * step(0.18, sB) * (0.4 + sB));
      float art = max(lineAA(p.y, 1609.0, 6.0), lineAA(p.x + 400.0, 1609.0, 6.0));
      float hw = lineAA(p.x + 700.0 + 300.0 * sin(p.y * 0.0002), 1.0e9, 14.0);
      vec2 blk = floor(p / vec2(150.0, 125.0));
      float blockLit = gh(blk);
      float patchK = 0.45 + 0.9 * gn(p * 0.0007);
      mid = vec3(0.025, 0.027, 0.025) * (0.7 + 0.6 * blockLit);
      // a few lit windows and signs in each block (a faint glow when far off)
      midE = vec3(1.0, 0.62, 0.3) * (g * 0.9 + art * 0.3) * dens * patchK + vec3(1.0, 0.85, 0.65) * hw * 0.22 * dens
           + vec3(1.0, 0.8, 0.6) * 0.025 * blockLit * dens * patchK;
      if (water > 0.5) {
        float fres = 0.04 + 0.96 * pow(1.0 - max(V.y, 0.0), 5.0);
        mid = vec3(0.01, 0.015, 0.025);
        midE = mix(vec3(0.05, 0.08, 0.18), vec3(0.3, 0.2, 0.3), pow(1.0 - max(V.y, 0.0), 3.0)) * fres * 0.6;
      }
      // Miami Beach: a strip of lights
      float beach = step(${BEACH.x0.toFixed(1)} + 150.0 * sin(p.y * 0.0006), p.x) * step(p.x, ${BEACH.x1.toFixed(1)} + 120.0 * sin(p.y * 0.0007 + 2.0)) * step(p.y, 9000.0);
      midE += vec3(1.0, 0.7, 0.4) * beach * (0.25 + 0.5 * lineAA(p.y, 90.0, 5.0));
      float farK = smoothstep(18000.0, 45000.0, r);
      mid = mix(mid, vec3(0.0), farK);
      midE = mix(midE, farC, farK);
    }
    col = mix(mid, near, nearK);
    emis = mix(midE, nearE, nearK);

    // ---- what the bounces did to the middle ----
    if (r < max(uScorch, uCrack) * 1.2 + 2.0) {
      float k = r / max(uCrater, 0.05);
      // torn-up asphalt: broken slabs, tilted, gaps full of dirt
      vec2 sid;
      float se = cellEdge(p / 1.1, sid);
      float torn = 1.0 - smoothstep(uTorn * 0.85, uTorn, r + gh(sid) * 1.5);
      vec3 slab = vec3(0.07, 0.07, 0.075) * (0.6 + 0.8 * gh(sid));
      col = mix(col, mix(vec3(0.16, 0.12, 0.09), slab, smoothstep(0.03, 0.12, se)), torn);
      emis *= 1.0 - torn * 0.7;
      // cracks running out from the middle
      vec2 q = vec2(log(max(r, 0.05)) * 3.0, atan(p.y, p.x) * 2.6);
      vec2 cid;
      float ce = cellEdge(q, cid);
      float crack = (1.0 - smoothstep(0.0, 0.04 + 0.05 / max(r, 0.3), ce)) * (1.0 - smoothstep(uCrack * 0.8, uCrack, r * (0.85 + 0.3 * gh(cid))));
      col *= 1.0 - 0.85 * crack;
      // scorch from the fireball landings
      float sc = 1.0 - smoothstep(uScorch * 0.55, uScorch, r + 3.0 * gn(p * 0.3));
      col = mix(col, vec3(0.025, 0.022, 0.02), sc * 0.9);
      emis *= 1.0 - sc * 0.9;
      // the crater: rubble, dirt, rock; white-hot in the middle right after a fireball landing
      if (k < 1.25) {
        vec2 rid;
        float re = cellEdge(p / 0.7, rid);
        vec3 rub = mix(vec3(0.2, 0.16, 0.12), vec3(0.32, 0.29, 0.26), gh(rid)) * (0.6 + 0.4 * smoothstep(0.0, 0.15, re));
        col = mix(col, rub, 1.0 - smoothstep(0.9, 1.25, k));
        emis *= smoothstep(0.9, 1.25, k);
      }
      float glow = uHot * (exp(-k * k * 2.2) * 1.0 + crack * exp(-r / max(uCrack * 0.25, 1.0)) * 0.45);
      float fl = 0.8 + 0.2 * gn(p * 0.8 + vec2(uTime * 2.0, -uTime * 1.3));
      emis += vec3(1.6, 0.45, 0.1) * glow * fl + vec3(1.4, 0.8, 0.35) * uHot * uHot * exp(-k * k * 6.0);
      // the fresh hit: a ring of dust and hot grit, fading
      emis += vec3(1.6, 0.8, 0.35) * uFresh * exp(-k * k * 0.8);
      // water from the burst main, flooding the crossing and shining
      float wet = 1.0 - smoothstep(uWet * 0.7, uWet, r + 4.0 * gn(p * 0.2));
      col = mix(col, col * 0.4, wet * (1.0 - step(0.5, uHot)));
    }
    diffuseColor.rgb = col;
  }
`;

export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, SURF, { uTime: F.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float r2 = dot(transformed.xz, transformed.xz);
          transformed.y += sqrt(max(${(R_E * R_E).toExponential(6)} - r2, 0.0)) - ${R_E.toFixed(1)};
          if (r2 < 4000.0) transformed.y += craterH(transformed.xz);
        }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = FRAG_PARS + shader.fragmentShader
      .replace('#include <color_fragment>', LOOK)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += emis;');
  };
  m.customProgramCacheKey = () => 'ground-jump-v1';
  return m;
}

// polar rings: fine in the middle (the crater), coarser outward, out to the globe's hole
function diskGeometry() {
  const radii = [0];
  let r = 0.12;
  while (r < DISK_R) { radii.push(r); r *= r < 60 ? 1.035 : r < 3000 ? 1.03 : 1.06; }
  radii.push(DISK_R);
  const S = 256;
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i < radii.length; i++) for (let s = 0; s < S; s++) {
    const a = (s / S) * Math.PI * 2;
    pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
  }
  for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);
  for (let i = 1; i < radii.length - 1; i++) {
    const a0 = 1 + (i - 1) * S, a1 = 1 + i * S;
    for (let s = 0; s < S; s++) {
      const s1 = (s + 1) % S;
      idx.push(a0 + s, a0 + s1, a1 + s, a0 + s1, a1 + s1, a1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export function makeGround(scene) {
  const mat = groundMaterial();
  const disk = new THREE.Mesh(diskGeometry(), mat);
  disk.frustumCulled = false;
  scene.add(disk);
  // raised sidewalks along the avenue (0.15 m), the median's beds
  return { disk, mat };
}
