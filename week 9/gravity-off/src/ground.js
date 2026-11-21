// The ground: granite paving over the square (big slabs, darker rings round the fountain), the basin's blue tiles under
// the water, the basketball court (blue with red keys and white lines), the two-way street on the west side (asphalt,
// a double yellow line, the parking lane, crosswalks at both ends) and concrete sidewalks; curbs along the street.
import * as THREE from 'three';
import { ROAD, COURT, SQ, BASIN } from './layout.js';
import { CU, HAZE_GLSL } from './city.js';

export const GU = { uTime: { value: 0 }, uWet: { value: 0 } };
const f = (x) => x.toFixed(3);

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, { uHaze: CU.uHaze, uHazeD: CU.uHazeD, uFog: CU.uFog, uFogCol: CU.uFogCol, uFogD: CU.uFogD });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; uniform float uTime; uniform float uWet;
        uniform vec3 uHaze; uniform float uHazeD; uniform float uFog; uniform vec3 uFogCol; uniform float uFogD;
        ${HAZE_GLSL}
        float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
        float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
        float ln(float d, float w, float aw) { return 1.0 - smoothstep(w - aw, w + aw, abs(d)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y)) * 0.75;
        float n = gn(P * 2.5) * 0.5 + gn(P * 9.0) * 0.5;
        float r = length(P);
        vec3 c;
        float rough = 0.85;
        bool road = P.x > ${f(ROAD.x0)} && P.x < ${f(ROAD.curb)};
        bool court = P.x > ${f(COURT.x0)} && P.x < ${f(COURT.x1)} && P.y > ${f(COURT.z0)} && P.y < ${f(COURT.z1)};
        bool square = P.x > ${f(SQ.x0)} && P.x < ${f(SQ.x1)} && P.y > ${f(SQ.z0)} && P.y < ${f(SQ.z1)};
        if (r < ${f(BASIN.rIn)}) {
          // the basin: blue tiles, a darker ring under the jets
          vec2 t = fract(P / 0.3);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.16, 0.42, 0.52) * (0.85 + 0.25 * g21(floor(P / 0.3))) * (0.75 + 0.25 * smoothstep(0.0, 0.08 + aw * 3.0, joint));
          c *= 1.0 - 0.25 * band(r, 2.8, 3.6, 0.1);
          rough = 0.3;
        } else if (road) {
          c = vec3(0.17, 0.17, 0.18) * (0.85 + 0.3 * n) * (0.92 + 0.08 * gn(P * 0.3));
          float yellow = max(ln(P.x - (-26.5 - 0.14), 0.06, aw), ln(P.x - (-26.5 + 0.14), 0.06, aw));
          float paint = ln(P.x - (-23.0), 0.06, aw) * step(0.5, fract(P.y / 3.0 + 0.25));
          paint = max(paint, ln(P.x - (-23.0), 0.06, aw) * step(abs(P.y), 30.0) * 0.0);
          // parking bays
          paint = max(paint, band(P.x, -23.0, ${f(ROAD.curb)}, aw) * ln(fract(P.y / 5.6 + 0.5) - 0.5, 0.0035, aw / 5.6));
          // crosswalks at both ends of the square
          float cw = max(band(P.y, -31.5, -27.5, aw), band(P.y, 27.5, 31.5, aw)) * step(0.5, fract(P.x / 1.1));
          paint = max(paint, cw);
          yellow *= 1.0 - cw;
          float wear = 0.75 + 0.25 * gn(P * 1.7);
          c = mix(c, vec3(0.86, 0.86, 0.82) * wear, paint * 0.92);
          c = mix(c, vec3(0.85, 0.66, 0.14) * wear, yellow * 0.9);
          rough = 0.75;
        } else if (court) {
          vec2 Q = P - vec2(${f(COURT.hoopX)}, 0.0);
          vec3 blue = vec3(0.13, 0.33, 0.6), red = vec3(0.6, 0.22, 0.16), green = vec3(0.2, 0.42, 0.3);
          float inB = step(abs(Q.x), 7.3) * step(abs(Q.y), 13.85);
          c = mix(green, blue, inB);
          float key = step(abs(Q.x), 2.45) * step(13.85 - 5.8, abs(Q.y));
          c = mix(c, red, key);
          float L = 0.0;
          L = max(L, ln(abs(Q.x) - 7.3, 0.03, aw) * step(abs(Q.y), 13.88));
          L = max(L, ln(abs(Q.y) - 13.85, 0.03, aw) * step(abs(Q.x), 7.33));
          L = max(L, ln(Q.y, 0.03, aw) * step(abs(Q.x), 7.3));
          L = max(L, ln(length(Q) - 1.8, 0.03, aw));
          L = max(L, ln(abs(Q.x) - 2.45, 0.03, aw) * step(13.85 - 5.8, abs(Q.y)) * step(abs(Q.y), 13.85));
          L = max(L, ln(abs(Q.y) - (13.85 - 5.8), 0.03, aw) * step(abs(Q.x), 2.45));
          vec2 H = vec2(Q.x, abs(Q.y) - ${f(COURT.rimZ)});
          L = max(L, ln(length(vec2(Q.x, abs(Q.y) - (13.85 - 5.8))) - 1.8, 0.03, aw) * step(abs(Q.y), 13.85 - 5.8));
          L = max(L, ln(length(H) - 6.75, 0.03, aw) * step(H.y, 0.0) * step(abs(Q.x), 6.6));
          L = max(L, ln(abs(Q.x) - 6.6, 0.03, aw) * step(0.0, H.y) * step(abs(Q.y), 13.85));
          c = mix(c, vec3(0.92, 0.92, 0.9), L);
          c *= 0.92 + 0.12 * n;
          rough = 0.6;
        } else if (square) {
          // granite slabs (1.2 m), joints, darker rings round the fountain and a soft wear path
          vec2 t = fract(P / 1.2);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          float s = g21(floor(P / 1.2));
          c = vec3(0.62, 0.6, 0.57) * (0.86 + 0.18 * s) * (0.9 + 0.16 * n);
          float ring = max(band(r, 8.0, 8.9, aw), band(r, 11.7, 12.2, aw));
          c = mix(c, vec3(0.36, 0.35, 0.36) * (0.9 + 0.2 * n), ring);
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.015 + aw, joint * 1.2);
          rough = 0.8;
        } else {
          vec2 t = fract(P / 1.5);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.5, 0.49, 0.47) * (0.88 + 0.2 * g21(floor(P / 1.5))) * (0.9 + 0.15 * n);
          c *= 0.84 + 0.16 * smoothstep(0.0, 0.03 + aw, joint);
        }
        // wet where the water came down at the end
        c *= 1.0 - 0.35 * uWet * smoothstep(${f(BASIN.rOut + 9.0)}, ${f(BASIN.rOut)}, r);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(rough, 0.25, uWet * smoothstep(${f(BASIN.rOut + 9.0)}, ${f(BASIN.rOut)}, r));`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = hazeIt(gl_FragColor.rgb, vGW);`);
  };
  mat.customProgramCacheKey = () => 'gravoff-ground-v1';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // curbs along both sides of the street (open at the crosswalks)
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.8 });
  const curbs = [];
  for (const x of [ROAD.x0, ROAD.curb]) for (let z = -120; z < 120; z += 2) if (!(Math.abs(z + 1) > 27 && Math.abs(z + 1) < 32)) curbs.push([x, z + 1]);
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.15, 2.0).translate(0, 0.075, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach(([x, z], i) => cg.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
  cg.receiveShadow = true; cg.castShadow = true; cg.frustumCulled = false;
  scene.add(cg);
  return { mesh };
}
