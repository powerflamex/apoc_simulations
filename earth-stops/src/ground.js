// The ground: one big plane whose look is drawn from world position (asphalt with lane markings, stop lines and
// zebra crossings, paving on the raised sidewalks, the planted median, concrete between buildings), plus the curbs,
// sidewalk slabs and median beds as low boxes using the same shader. Late on (uPeel) the wind tears the road
// surface up in patches and bare earth shows; dust (uDust) settles over everything.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AVE, CROSS } from './layout.js';
import { F } from './facade.js';

export const GU = { uPeel: { value: 0 }, uWet: { value: 0 } };

const PARS = /* glsl */ `
uniform float uPeel; uniform float uDust; uniform float uTime;
varying vec3 vGP;
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
`;

const LOOK = /* glsl */ `
  #include <color_fragment>
  {
    vec2 p = vGP.xz;
    float ax = abs(p.x);
    float zc = floor(p.y / ${CROSS.step.toFixed(1)} + 0.5) * ${CROSS.step.toFixed(1)};
    float dz = p.y - zc;
    float adz = abs(dz);
    float w = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.01;
    float grain = gn(p * 3.0) * 0.5 + gn(p * 17.0) * 0.5;
    vec3 asphalt = vec3(0.105, 0.105, 0.11) * (0.8 + 0.35 * grain) * (0.9 + 0.2 * gn(p * 0.08));
    vec3 col = asphalt;
    float mark = 0.0; vec3 markC = vec3(0.85, 0.84, 0.8);
    bool onAve = ax < ${AVE.road.toFixed(1)};
    bool onCross = adz < ${CROSS.road.toFixed(1)} && ax > ${AVE.road.toFixed(1)} && ax < 600.0;
    if (onAve) {
      if (ax < ${AVE.median.toFixed(1)} && adz > ${CROSS.walk.toFixed(1)}) {
        col = mix(vec3(0.09, 0.16, 0.06), vec3(0.18, 0.24, 0.1), grain);        // planted median
      } else {
        // lane dashes (3 m on, 6 off), solid edge lines, yellow along the median
        float dash = step(fract(p.y / 9.0), 0.33);
        mark += (band(ax, 6.32, 6.48, w) + band(ax, 9.62, 9.78, w)) * dash * step(${CROSS.walk.toFixed(1)}, adz);
        mark += band(ax, 12.55, 12.7, w) * step(${CROSS.walk.toFixed(1)}, adz);
        float y = band(ax, 3.3, 3.45, w) * step(${CROSS.walk.toFixed(1)}, adz);
        col = mix(col, vec3(0.85, 0.65, 0.12), y);
        // zebra crossings on both sides of every crossing, stop lines before them
        float zeb = band(adz, 7.8, 11.6, w) * step(0.5, fract(ax / 1.2));
        mark += zeb;
        mark += band(dz * sign(p.x), 12.3, 12.75, w) * step(${AVE.median.toFixed(1)}, ax);
      }
    } else if (onCross) {
      float dash = step(fract(p.x / 9.0), 0.33);
      mark += band(adz, -0.08, 0.08, w) * dash;
      mark += band(ax, 14.2, 17.8, w) * step(0.5, fract(adz / 1.2));          // zebras across the cross street
      col = asphalt;
    } else if (ax < ${AVE.walk.toFixed(1)} || adz < ${CROSS.walk.toFixed(1)}) {
      // paving slabs on the sidewalks
      vec2 t = fract(p / 0.6);
      float joint = max(band(t.x, -0.03, 0.03, w * 2.0), band(t.y, -0.03, 0.03, w * 2.0));
      col = vec3(0.5, 0.47, 0.43) * (0.85 + 0.25 * gh(floor(p / 0.6))) * (1.0 - 0.25 * joint);
    } else {
      col = vec3(0.3, 0.29, 0.28) * (0.8 + 0.3 * grain);                      // courtyards and lots
    }
    col = mix(col, markC * (0.85 + 0.2 * grain), clamp(mark, 0.0, 1.0) * 0.9);
    // the road torn up: patches of asphalt gone, bare red-brown earth and rubble beneath
    float peel = smoothstep(0.55, 0.45, gn(p * 0.045) * 0.6 + gn(p * 0.21) * 0.4 - uPeel * 0.75 + 0.25);
    col = mix(col, vec3(0.32, 0.27, 0.22) * (0.7 + 0.5 * grain), peel * step(0.001, uPeel) * step(abs(p.x), 600.0));
    col = mix(col, vec3(0.5, 0.44, 0.36) * (0.8 + 0.3 * grain), uDust * 0.45);
    diffuseColor.rgb = col;
  }
`;

export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, { uDust: F.uDust, uTime: F.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 gpp = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vGP = gpp.xyz;`);
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <color_fragment>', LOOK);
  };
  m.customProgramCacheKey = () => 'ground-v1';
  return m;
}

export function makeGround(scene) {
  const mat = groundMaterial();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000, 1, 1).rotateX(-Math.PI / 2), mat);
  plane.receiveShadow = true;
  scene.add(plane);
  // raised sidewalks (0.15 m) along the avenue between cross streets, and the median beds
  const parts = [];
  for (let k = 2; k >= -16; k--) {
    const zc = k * CROSS.step;
    const z0 = zc - CROSS.walk + 0.01, z1 = zc - CROSS.step + CROSS.walk - 0.01;
    const len = z0 - z1, mid = (z0 + z1) / 2;
    for (const s of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(AVE.walk - AVE.road + 4, 0.15, len + 2 * (CROSS.walk - CROSS.road)).translate(s * (AVE.road + (AVE.walk - AVE.road + 4) / 2), 0.075, mid));
    }
    parts.push(new THREE.BoxGeometry(AVE.median * 2, 0.2, len + 2 * (CROSS.walk - CROSS.road) - 4).translate(0, 0.1, mid));
  }
  const curbs = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), mat);
  curbs.receiveShadow = true; curbs.castShadow = false;
  scene.add(curbs);
  return { plane, curbs, mat };
}
