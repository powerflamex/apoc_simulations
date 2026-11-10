// The street: one big plane whose look comes from world position (wet asphalt with lane lines and crosswalks,
// paving on the sidewalks, Pike Place's bricks in front of the market), plus raised curbs. It goes under first.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PIKE, FIRST, SECOND, PLACE, MARKET } from './layout.js';
import { drownShader } from './drown.js';

const PARS = /* glsl */ `
varying vec3 vGP;
float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
`;
const f1 = (x) => x.toFixed(2);
const LOOK = /* glsl */ `
  #include <color_fragment>
  {
    vec2 p = vGP.xz;
    float ax = abs(p.x);
    float w = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.01;
    float grain = gn(p * 3.0) * 0.5 + gn(p * 17.0) * 0.5;
    vec3 asphalt = vec3(0.075, 0.075, 0.08) * (0.8 + 0.35 * grain);
    vec3 col = asphalt;
    float mark = 0.0;
    float d1 = abs(p.y - ${f1(FIRST.z)}), d2 = abs(p.y - ${f1(SECOND.z)});
    bool inX = d1 < ${f1(FIRST.walk)} || d2 < ${f1(SECOND.walk)};
    if (p.y < ${f1(MARKET.z1)} && p.y > ${f1(MARKET.z0)}) {
      col = vec3(0.2, 0.18, 0.17);
    } else if (abs(p.y - ${f1(PLACE.z)}) < ${f1(PLACE.road)}) {
      vec2 t = fract(p * vec2(1.0 / 0.22, 1.0 / 0.11) + vec2(0.5 * floor(p.y / 0.11), 0.0));
      col = vec3(0.32, 0.17, 0.12) * (0.75 + 0.4 * gh(floor(p * vec2(1.0 / 0.22, 1.0 / 0.11)))) * (1.0 - 0.4 * max(band(t.x, -0.06, 0.06, w * 4.0), band(t.y, -0.08, 0.08, w * 8.0)));
    } else if (ax < ${f1(PIKE.road)} && !inX) {
      float dash = step(fract(p.y / 9.0), 0.33);
      mark += band(ax, -0.07, 0.07, w) * dash;
      mark += band(ax, ${f1(PIKE.road - 0.35)}, ${f1(PIKE.road - 0.2)}, w);
    } else if (inX && (d1 < ${f1(FIRST.road)} || d2 < ${f1(SECOND.road)})) {
      float dc = d1 < ${f1(FIRST.road)} ? d1 : d2;
      // the crosswalks across Pike St on both sides of each avenue
      mark += band(dc, ${f1(FIRST.road - 3.4)}, ${f1(FIRST.road - 0.4)}, w) * step(0.5, fract(p.x / 1.1)) * step(ax, ${f1(PIKE.road)});
    } else if (ax < ${f1(PIKE.walk)} || inX) {
      vec2 t = fract(p / 0.9);
      float joint = max(band(t.x, -0.02, 0.02, w * 2.0), band(t.y, -0.02, 0.02, w * 2.0));
      col = vec3(0.3, 0.29, 0.28) * (0.85 + 0.25 * gh(floor(p / 0.9))) * (1.0 - 0.25 * joint);
    } else {
      col = vec3(0.16, 0.16, 0.15) * (0.8 + 0.3 * grain);
    }
    col = mix(col, vec3(0.8, 0.78, 0.7), clamp(mark, 0.0, 1.0) * 0.75);
    diffuseColor.rgb = col;
  }
`;

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 gpp = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vGP = gpp.xyz;`);
    shader.fragmentShader = PARS + shader.fragmentShader.replace('#include <color_fragment>', LOOK);
    drownShader(shader);
  };
  mat.customProgramCacheKey = () => 'ground-rain-v1';
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, 200), mat);
  scene.add(plane);
  // raised sidewalks along Pike St between the avenues
  const parts = [];
  for (const [z0, z1] of [[FIRST.z + FIRST.walk, SECOND.z - SECOND.walk], [SECOND.z + SECOND.walk, 320]]) for (const s of [-1, 1])
    parts.push(new THREE.BoxGeometry(PIKE.walk - PIKE.road + 6, 0.16, z1 - z0).translate(s * (PIKE.road + (PIKE.walk - PIKE.road + 6) / 2), 0.08, (z0 + z1) / 2).toNonIndexed());
  const curbs = new THREE.Mesh(mergeGeometries(parts), mat);
  scene.add(curbs);
  return { group: [plane, curbs] };
}
