// The ground: the promenade's pale stone paving (big slabs, darker bands), the asphalt road each side (lane lines,
// parking bays), the sidewalks, the cross street with crosswalks, the granite waterfront plaza and the quay edge; the
// curbs. Where a manhole cover has flown off, its hole stays (dark, a rim); where cars and the bus slid, black scuffs
// and gouges follow them in (uSlide: their paths and when they ran).
import * as THREE from 'three';
import { PROM, ROAD, WALK, CZ, CW, PLAZA_Z, QUAY_Z, COVERS, WATER_Y } from './layout.js';
import { CU } from './city.js';
import { NOISE_GLSL, stretchy } from './field.js';

export const NSLIDE = 24;
export const GU = {
  uCov: { value: COVERS.map(() => new THREE.Vector4(0, 0, 999, 0)) },
  uSlide: { value: Array.from({ length: NSLIDE }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uSlideT: { value: Array.from({ length: NSLIDE }, () => new THREE.Vector4(999, 1000, 1, 0)) },
  uGT: { value: 0 },
};
const f = (x) => x.toFixed(2);

export function makeGround(scene, ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, { uHaze: CU.uHaze, uHazeD: CU.uHazeD });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform vec3 uHaze; uniform float uHazeD; uniform vec4 uCov[${COVERS.length}]; uniform vec4 uSlide[${NSLIDE}]; uniform vec4 uSlideT[${NSLIDE}]; uniform float uGT;
        ${NOISE_GLSL}
        float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
        float gRough = 0.85;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        if (P.y < ${f(QUAY_Z)}) discard;
        float aw = max(fwidth(P.x), fwidth(P.y)) * 0.7;
        float ax = abs(P.x), dz = abs(P.y - (${f(CZ)}));
        bool plaza = P.y < ${f(PLAZA_Z)};
        bool cross = dz < ${f(CW)} && !plaza;
        bool prom = ax < ${f(PROM)} && !cross && !plaza;
        bool road = (ax >= ${f(PROM)} && ax < ${f(ROAD)} && !plaza) || cross;
        bool walk = ax >= ${f(ROAD)} && !road && !plaza;
        vec3 c;
        float n = nn2(P * 2.5) * 0.5 + nn2(P * 9.0) * 0.5;
        float paint = 0.0;
        if (prom) {
          // big pale slabs in running bond, a darker band every 6 m across
          vec2 q = vec2(P.x / 1.2 + 0.5 * step(0.5, fract(P.y / 1.2)), P.y / 0.6);
          vec2 t = fract(q);
          float joint = min(min(t.x, 1.0 - t.x) * 1.2, min(t.y, 1.0 - t.y) * 0.6);
          c = vec3(0.68, 0.64, 0.58) * (0.86 + 0.22 * hh2(floor(q))) * (0.9 + 0.14 * n);
          c *= 0.8 + 0.2 * smoothstep(0.0, 0.025 + aw, joint);
          c = mix(c, vec3(0.42, 0.38, 0.34) * (0.9 + 0.2 * n), band(fract(P.y / 6.0), 0.0, 0.1, aw / 6.0) * step(ax, ${f(PROM - 0.6)}));
          // the strips of earth round the trees' edge rows
          c = mix(c, vec3(0.3, 0.25, 0.2) * (0.8 + 0.4 * n), band(ax, 6.8, 8.0, aw) * smoothstep(0.55, 0.5, abs(fract((P.y - 0.0) / 8.5) - 0.5)) * 0.0);
          gRough = 0.75;
        } else if (road) {
          c = vec3(0.16, 0.16, 0.17) * (0.85 + 0.3 * n);
          c *= 0.92 + 0.08 * nn2(P * 0.3);
          if (!cross) {
            paint = max(paint, band(ax, 12.45, 12.6, aw));   // the parking lane's line
            paint = max(paint, band(ax, 12.6, ${f(ROAD)}, aw) * band(fract(P.y / 6.0), 0.0, 0.03, aw / 6.0));
            float onX = band(dz, ${f(CW + 1.0)}, ${f(CW + 4.5)}, aw);
            paint = max(paint, onX * band(fract(P.y / 1.2), 0.0, 0.55, aw / 1.2) * 0.0 + onX * band(fract(P.x / 1.2), 0.0, 0.55, aw / 1.2));
          } else {
            float onX = band(ax, ${f(PROM + 0.5)}, ${f(PROM + 4.0)}, aw);
            paint = max(paint, onX * band(fract(P.y / 1.2), 0.0, 0.55, aw / 1.2));
          }
          gRough = 0.85;
        } else if (walk) {
          vec2 t = fract(P / 1.5);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.52, 0.5, 0.47) * (0.88 + 0.2 * hh2(floor(P / 1.5))) * (0.9 + 0.15 * n);
          c *= 0.84 + 0.16 * smoothstep(0.0, 0.03 + aw, joint);
          if (ax > ${f(WALK + 0.5)}) c *= 0.7;
        } else {
          // the waterfront plaza: granite setts in fans
          vec2 q = P / 0.9;
          vec2 t = fract(q);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.5, 0.48, 0.47) * (0.85 + 0.25 * hh2(floor(q))) * (0.9 + 0.12 * n);
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.04 + aw, joint);
          // the quay's edge: a pale stone coping
          c = mix(c, vec3(0.75, 0.72, 0.66), band(P.y, ${f(QUAY_Z)}, ${f(QUAY_Z + 0.8)}, aw));
        }
        float wear = 0.75 + 0.25 * nn2(P * 1.7);
        c = mix(c, vec3(0.86, 0.86, 0.82) * wear, paint * 0.92);
        // manhole covers' holes, once the cover has gone: a black shaft with an iron ring round it
        for (int i = 0; i < ${COVERS.length}; i++) {
          vec4 cv = uCov[i];
          float r = length(P - cv.xy);
          if (r < 0.48) {
            float ring = band(r, 0.33, 0.43, aw);
            float hole = (1.0 - smoothstep(0.31, 0.33, r)) * step(cv.z, uGT);
            c = mix(c, vec3(0.13, 0.12, 0.11), ring);
            c = mix(c, vec3(0.012), hole);
          }
        }
        // scuffs and gouges where the cars slid in: a dark smear along each path behind the car, scratches in it
        for (int i = 0; i < ${NSLIDE}; i++) {
          vec4 s = uSlide[i]; vec4 st = uSlideT[i];
          if (uGT < st.x) continue;
          vec2 a = s.xy, b = s.zw, ab = b - a;
          float L2 = max(dot(ab, ab), 1e-4);
          float h = clamp(dot(P - a, ab) / L2, 0.0, 1.0);
          float u = clamp((uGT - st.x) / max(st.y - st.x, 0.01), 0.0, 1.0);
          if (h > u * u + 0.02) continue;
          float dd = length(P - a - ab * h);
          float w = st.z;
          float sm = (1.0 - smoothstep(w * 0.4, w * 0.55, dd)) * (0.45 + 0.35 * nn2(vec2(dd * 7.0, h * 40.0)));
          float scr = band(fract(dd * 2.2 + 0.5 * nn2(vec2(h * 3.0, 1.0))), 0.45, 0.55, aw * 2.0) * (1.0 - smoothstep(w * 0.45, w * 0.5, dd));
          c = mix(c, vec3(0.05, 0.048, 0.045), sm);
          c = mix(c, vec3(0.75, 0.72, 0.68), scr * 0.6);
        }
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = gRough;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'mag-ground-v1';
  stretchy(mat, 'ground');
  const geo = new THREE.PlaneGeometry(1800, 700, 90, 35).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, 200);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // (a fine patch round you, so the stretch at the end bends the ground smoothly)
  // the quay wall, down to the water
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1800, 2.2, 1.0), ctx.plainMat(0x7a746c, 0.9));
  wall.position.set(0, WATER_Y + 1.1 - 0.6, QUAY_Z - 0.5);
  wall.receiveShadow = true;
  scene.add(wall);
  // the curbs: the promenade's (|x| = 9) and the sidewalks' (|x| = 15), open at the cross street and ending at the plaza
  const curbMat = stretchy(ctx.plainMat(0x8e8a84, 0.8), 'curb');
  const curbs = [];
  for (const s of [-1, 1]) for (const cx of [PROM, ROAD]) for (let z = 150; z > PLAZA_Z; z -= 2) if (Math.abs(z - 1 - CZ) > CW + 0.2) curbs.push([s * cx, z - 1]);
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.15, 2.0).translate(0, 0.075, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach(([x, z], i) => cg.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
  cg.receiveShadow = true; cg.frustumCulled = false;
  scene.add(cg);
  return { mesh };
}
