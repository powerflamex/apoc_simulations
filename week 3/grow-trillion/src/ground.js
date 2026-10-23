// The ground: one curved disk (polar rings, fine in the middle, out to 400 km) whose look is drawn from world
// position, in the afternoon sun. Near: the avenue and the cross streets (lanes, crosswalks, sidewalks with tree
// pits), the next avenues on the grid. Further: the city seen from above (blocks of roofs in many tones, streets,
// parks, the expressways), Lake Michigan to the east; far off it turns into the NASA maps the globe uses (the
// detail only modulates the map's colour, so the hand-over is seamless). The glowing cracks round your shoes come
// from earth.js (lava()).
import * as THREE from 'three';
import { AVE, CROSS, AVES_X, AVE2_HW, AVE2_WALK, LAKE_X, LANES } from './layout.js';
import { R_E } from './timeline.js';
import { SURF, SURFACE_GLSL, DISK_R } from './earth.js';

export const GU = { uDust: { value: 0 }, uHaze: { value: 1 } };

const FRAG_PARS = /* glsl */ `
uniform float uDust; uniform float uHaze;
varying vec3 vGP;
${SURFACE_GLSL}
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
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
// the lake shore (x of the shore at z), the lake's south end curving east past 30 km
float shoreX(float z) { return ${LAKE_X.toFixed(1)} + 120.0 * sin(z * 0.0011) + 60.0 * sin(z * 0.0043 + 1.0) + max(0.0, -z - 15000.0) * -0.12 + max(0.0, z - 22000.0) * 1.6; }
`;

const LOOK = /* glsl */ `
  #include <color_fragment>
  vec3 emis = vec3(0.0);
  {
    vec2 p = vGP.xz;
    float r = length(p);
    float w = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.01;
    float px = max(fwidth(p.x), fwidth(p.y));
    float grain = gn(p * 3.0) * 0.5 + gn(p * 17.0) * 0.5;
    vec3 n = normalize(vGP - vec3(0.0, ${(-R_E).toFixed(1)}, 0.0));
    vec3 V = normalize(cameraPosition - vGP);
    float isW;
    vec3 farC = earthSurface(n, V, smoothstep(40000.0, 160000.0, r), 1.0, isW);
    // the map's own colour at this spot, lit, without clouds: what the detail below must average to
    vec3 mapC = texture2D(uDay, earthUV(n)).rgb;
    float lake = step(shoreX(p.y), p.x);
    vec3 col;
    // ---- near: the streets ----
    // (from high up the street detail hands over to the aerial look of the city)
    float nearK = (1.0 - smoothstep(1800.0, 2600.0, r)) * (1.0 - smoothstep(2.5, 9.0, px));
    vec3 near = vec3(0.0);
    if (nearK > 0.0) {
      float ax = abs(p.x);
      float zc = floor(p.y / ${CROSS.step.toFixed(1)} + 0.5) * ${CROSS.step.toFixed(1)};
      float dz = p.y - zc, adz = abs(dz);
      vec3 asphalt = vec3(0.13, 0.13, 0.135) * (0.8 + 0.35 * grain) * (0.9 + 0.2 * gn(p * 0.08));
      vec3 c = vec3(0.3, 0.29, 0.27) * (0.8 + 0.3 * grain);                  // plazas, alleys, lots
      float mark = 0.0;
      // the other avenues (every 200 m)
      float sx = p.x < 1700.0 && ax > 100.0 ? abs(mod(p.x + 100.0, 200.0) - 100.0) : 1e4;
      bool onAve = ax < ${AVE.road.toFixed(1)};
      bool onAve2 = sx < ${AVE2_HW.toFixed(1)};
      bool onCross = adz < ${CROSS.road.toFixed(1)};
      if (onAve) {
        c = asphalt;
        float dash = step(fract(p.y / 9.0), 0.4);
        mark += (band(ax, 3.62, 3.78, w) + band(ax, 7.42, 7.58, w)) * dash * step(${CROSS.walk.toFixed(1)}, adz);
        c = mix(c, vec3(0.85, 0.66, 0.12), (band(ax, 0.05, 0.2, w)) * step(${CROSS.walk.toFixed(1)}, adz));
        mark += band(adz, 8.3, 11.9, w) * step(0.5, fract(ax / 1.2));             // crosswalk bars
        mark += band(dz * sign(p.x), 12.1, 12.5, w);                             // stop lines
      } else if (onCross || onAve2) {
        c = asphalt;
        if (onCross) {
          float dash = step(fract(p.x / 9.0), 0.4);
          mark += band(adz, -0.08, 0.08, w) * dash * step(${AVE.walk.toFixed(1)}, ax) * 0.0;
          mark += band(adz, 3.62, 3.78, w) * dash * step(${AVE.walk.toFixed(1)}, ax) * 0.0;
          mark += band(ax, ${(AVE.walk + 0.6).toFixed(1)}, ${(AVE.walk + 4.0).toFixed(1)}, w) * step(0.5, fract(adz / 1.2));
          c = mix(c, vec3(0.85, 0.66, 0.12), band(adz, -0.08, 0.08, w) * step(${AVE.walk.toFixed(1)}, ax));
        }
        if (onAve2) c = mix(c, vec3(0.85, 0.66, 0.12), band(sx, -0.08, 0.08, w) * step(${CROSS.walk.toFixed(1)}, adz));
      } else if (ax < ${AVE.walk.toFixed(1)} || adz < ${CROSS.walk.toFixed(1)} || sx < ${AVE2_WALK.toFixed(1)}) {
        // sidewalk: pale concrete slabs, a darker curb
        vec2 t = fract(p / 1.5);
        float joint = max(band(t.x, -0.02, 0.02, w * 2.0), band(t.y, -0.02, 0.02, w * 2.0));
        c = vec3(0.55, 0.53, 0.5) * (0.85 + 0.22 * gh(floor(p / 1.5))) * (1.0 - 0.2 * joint);
        float curb = band(ax, ${AVE.road.toFixed(1)}, ${(AVE.road + 0.35).toFixed(1)}, w) + band(adz, ${CROSS.road.toFixed(1)}, ${(CROSS.road + 0.35).toFixed(1)}, w) * step(${AVE.walk.toFixed(1)}, ax);
        c = mix(c, vec3(0.4, 0.39, 0.37), clamp(curb, 0.0, 1.0));
        // tree pits along the avenue
        vec2 tp = vec2(ax - ${(AVE.road + 3.0).toFixed(1)}, mod(p.y + 2.0, 28.0) - 14.0);
        c = mix(c, vec3(0.16, 0.12, 0.08), (1.0 - step(0.7, abs(tp.x))) * (1.0 - step(0.7, abs(tp.y))) * step(ax, ${AVE.walk.toFixed(1)}));
      } else {
        // inside the blocks (under the buildings; seen only where a building is gone): concrete, lots
        c = vec3(0.32, 0.31, 0.29) * (0.8 + 0.3 * grain);
      }
      c = mix(c, vec3(0.88, 0.87, 0.82) * (0.85 + 0.2 * grain), clamp(mark, 0.0, 1.0) * 0.9);
      near = c;
      if (lake > 0.5) near = vec3(0.04, 0.12, 0.18);
    }
    // ---- the city from above: blocks of roofs, streets, parks; then the suburbs and farmland ----
    // (albedos kept low and mottled like a real city from the air; everything averages to the map's colour)
    vec3 mid = mapC;
    {
      float hood = gn(p * 0.00035) * 0.6 + gn(p * 0.0011) * 0.4;                 // neighbourhoods
      float urban = 1.0 - smoothstep(12000.0, 30000.0, r + 9000.0 * (gn(p * 0.0001) - 0.5));
      vec2 lot = floor(p / vec2(25.0, 30.0));
      float lt = gh(lot), lt2 = gh(lot + 7.7);
      // roofs: tar, gravel, pale membranes, a few rust and white ones; dense downtown greyer, homes browner
      vec3 roof = mix(vec3(0.16, 0.155, 0.15), vec3(0.34, 0.32, 0.3), lt);
      roof = mix(roof, vec3(0.3, 0.2, 0.15), step(0.78, lt2) * 0.8);
      roof = mix(roof, vec3(0.5, 0.5, 0.48), step(0.93, lt2));
      // shadows along the south and east side of each lot (buildings standing up)
      vec2 fl = fract(p / vec2(25.0, 30.0));
      roof *= 0.75 + 0.25 * smoothstep(0.0, 0.25, fl.x) * smoothstep(1.0, 0.7, fl.y);
      // trees along the streets and in the yards: dark green speckle, more of it away from downtown
      float treeK = smoothstep(2500.0, 9000.0, r) * (0.35 + 0.5 * hood);
      float tr = smoothstep(0.55, 0.8, gn(p * 0.09) * 0.6 + gn(p * 0.31) * 0.4);
      roof = mix(roof, vec3(0.07, 0.11, 0.05) * (0.8 + 0.4 * gn(p * 0.7)), tr * treeK);
      float streets = max(lineAA(p.x + 100.0, 200.0, 7.0), lineAA(p.y + 60.0, 120.0, 5.0));
      float alleys = lineAA(p.x, 200.0, 2.0) * 0.7;
      float art = max(lineAA(p.x + 100.0, 1609.0, 14.0), lineAA(p.y + 60.0, 1609.0, 12.0));
      float exprw = max(lineAA(p.x + 3400.0 + 600.0 * sin(p.y * 0.00015), 1.0e9, 28.0), lineAA(p.y - 4200.0 + 500.0 * sin(p.x * 0.0002), 1.0e9, 28.0));
      vec3 city = mix(roof, vec3(0.09, 0.09, 0.095), clamp(streets + alleys + art * 1.2 + exprw * 1.5, 0.0, 1.0));
      // parks: irregular, dark green, with paths
      float park = smoothstep(0.7, 0.74, gn(p * 0.0009 + 3.0) * 0.7 + gn(p * 0.004) * 0.3);
      city = mix(city, vec3(0.08, 0.15, 0.06) * (0.8 + 0.5 * gn(p * 0.05)), park * (1.0 - streets));
      // keep the large-scale tone of the map (so from far off the city is the map's grey-brown)
      float lum = dot(mapC, vec3(0.333));
      city *= mix(vec3(1.0), mapC / max(lum, 0.03), 0.45) * clamp(lum / 0.22, 0.6, 1.6);
      city *= 0.85 + 0.3 * hood;
      // farmland: a patchwork of fields along the section roads (1 mile), keeping the map's tone on average
      vec2 fld = floor(p / vec2(402.0, 402.0));
      float fh = gh(fld);
      vec3 field = mapC * (0.7 + 0.6 * fh) * mix(vec3(1.0), vec3(1.12, 1.05, 0.78), step(0.6, gh(fld + 9.1)));
      field = mix(field, mapC * 0.55, max(lineAA(p.x, 1609.0, 8.0), lineAA(p.y, 1609.0, 8.0)));
      field = mix(field, mapC, smoothstep(90.0, 350.0, px));
      field = mix(field, field * vec3(0.6, 0.8, 0.55), smoothstep(0.66, 0.72, gn(p * 0.0012 + 9.0)) * 0.6);   // woods along the rivers
      mid = mix(field, city, urban);
      // fade the detail out where the map's own pixels are already finer than it (far off / from space)
      mid = mix(mid, mapC, smoothstep(700.0, 3500.0, px));
      if (lake > 0.5) {
        float rip = gn(p * vec2(0.01, 0.03) + vec2(uTime * 0.05, 0.0)) * 0.5 + gn(p * 0.06 - uTime * 0.1) * 0.5;
        mid = mix(vec3(0.03, 0.1, 0.15), vec3(0.05, 0.14, 0.2), rip);
        mid = mix(mid, mapC, smoothstep(700.0, 3500.0, px));
      }
    }
    // near and mid are lit by three.js (so your shadow falls on them); far off, the globe's own shading takes over
    float farK = smoothstep(60000.0, 160000.0, r);
    col = mix(mid, near, nearK) * (1.0 - farK);
    emis = farC * farK;
    // the lake glints in the sun
    if (lake > 0.5) {
      vec3 Hh = normalize(uSunL + V);
      float rip2 = gn(p * 0.3 + uTime * 0.4) * gn(p * vec2(0.9, 0.2) - uTime * 0.3);
      emis += vec3(1.0, 0.85, 0.65) * pow(max(dot(n, Hh), 0.0), 120.0) * (0.6 + 1.5 * rip2) * (1.0 - farK) * 0.6;
    }
    // the dust that settles after the stomps
    col = mix(col, vec3(0.45, 0.42, 0.38) * (1.0 - farK), uDust * 0.6 * (1.0 - smoothstep(3000.0, 9000.0, r)));
    // cracks and molten rock round your shoes
    vec2 lv = lava(p);
    col *= 1.0 - 0.75 * clamp(lv.y, 0.0, 1.0);
    emis *= 1.0 - 0.7 * clamp(lv.y, 0.0, 1.0);
    emis += lavaColor(lv.x, p);
    diffuseColor.rgb = col;
  }
`;

export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, SURF);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float r2 = dot(transformed.xz, transformed.xz);
          transformed.y -= r2 / (${R_E.toFixed(1)} + sqrt(max(${(R_E * R_E).toExponential(8)} - r2, 0.0)));
        }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', LOOK)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += emis;');
  };
  m.customProgramCacheKey = () => 'ground-grow-v1';
  return m;
}

// polar rings: fine in the middle (round your shoes), coarser outward, out to the globe's hole
function diskGeometry() {
  const radii = [0];
  let r = 0.12;
  while (r < DISK_R) { radii.push(r); r *= r < 60 ? 1.04 : r < 3000 ? 1.035 : 1.06; }
  radii.push(DISK_R);
  const S = 320;
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

export function makeGround(parent) {
  const mat = groundMaterial();
  const disk = new THREE.Mesh(diskGeometry(), mat);
  disk.frustumCulled = false;
  disk.receiveShadow = true;
  parent.add(disk);
  return { disk, mat };
}
