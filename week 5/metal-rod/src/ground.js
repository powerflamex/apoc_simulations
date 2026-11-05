// The street in daylight: asphalt, the scramble's zebra stripes (four sides and both diagonals), lane lines and stop
// lines, the planted median up the avenue, paved sidewalks with curbs; then, after the hit, the ground behind the
// blast front scorched and lit orange by the fireball.
import * as THREE from 'three';
import { ROAD_X, ROAD_Z, FX, FZ, MED, AVE_END, HIT } from './layout.js';

export const GU = {
  uTime: { value: 0 }, uBlastR: { value: -1 }, uHit: { value: new THREE.Vector2(HIT.x, HIT.z) }, uFireL: { value: 0 },
};

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uTime; uniform float uBlastR; uniform vec2 uHit; uniform float uFireL;
        float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        bool road = (abs(P.x) < ${ROAD_X.toFixed(1)} && P.y > ${AVE_END.toFixed(1)}) || abs(P.y) < ${ROAD_Z.toFixed(1)};
        vec3 c;
        float paint = 0.0;
        if (road) {
          float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
          c = vec3(0.17, 0.17, 0.175) * (0.8 + 0.4 * n);
          // the scramble: stripes on all four sides and both diagonals
          float bx = abs(P.x), bz = abs(P.y);
          if (bx < ${ROAD_X.toFixed(1)} && bz > 6.4 && bz < 10.0) paint = max(paint, step(0.5, fract(P.x / 1.0)) * smoothstep(6.4, 6.5, bz));
          if (bz < ${ROAD_Z.toFixed(1)} && bx > 11.4 && bx < 15.0) paint = max(paint, step(0.5, fract(P.y / 1.0)) * smoothstep(11.4, 11.5, bx));
          if (bx < 11.0 && bz < 6.0) {
            vec2 dA = normalize(vec2(15.0, 10.0)), dB = normalize(vec2(-15.0, 10.0));
            float pA = dot(P, vec2(-dA.y, dA.x)), pB = dot(P, vec2(-dB.y, dB.x));
            if (abs(pA) < 1.8) paint = max(paint, step(0.5, fract(dot(P, dA) / 1.0)));
            if (abs(pB) < 1.8) paint = max(paint, step(0.5, fract(dot(P, dB) / 1.0)));
          }
          // lane lines and stop lines on the avenue (three lanes each way) and the cross street
          if (bz > 11.0 && bx < ${ROAD_X.toFixed(1)}) {
            float lane = min(abs(bx - 6.5), abs(bx - 10.8));
            paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.y / 8.0)));
            paint = max(paint, 1.0 - smoothstep(0.25, 0.25 + aw, abs(bz - 11.4)));
            // the median: a concrete curb and a grass strip (from 4 m past the cross street)
            float med = smoothstep(${(MED + 0.1).toFixed(2)}, ${(MED - 0.1).toFixed(2)}, bx) * smoothstep(${(ROAD_Z + 3.6).toFixed(1)}, ${(ROAD_Z + 4.0).toFixed(1)}, bz);
            vec3 grass = vec3(0.22, 0.34, 0.12) * (0.75 + 0.5 * gn(P * 6.0));
            vec3 curb = vec3(0.5, 0.49, 0.47);
            c = mix(c, mix(curb, grass, smoothstep(${(MED - 0.45).toFixed(2)}, ${(MED - 0.6).toFixed(2)}, bx)), med);
            paint *= 1.0 - med;
          }
          if (bx > 16.0 && bz < ${ROAD_Z.toFixed(1)}) {
            float lane = abs(bz - 5.0);
            paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.x / 8.0)));
            paint = max(paint, (1.0 - smoothstep(0.12, 0.12 + aw, abs(P.y))) * 0.9);
          }
          c = mix(c, vec3(0.78, 0.78, 0.75) * (0.85 + 0.15 * gn(P * 20.0)), paint * 0.92);
        } else {
          // paving
          vec2 t = fract(P / 0.6);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.5, 0.49, 0.47) * (0.85 + 0.3 * g21(floor(P / 0.6)));
          c *= 0.75 + 0.25 * smoothstep(0.0, 0.04, joint);
          // the curb
          float curb = min(abs(abs(P.x) - ${ROAD_X.toFixed(1)}), abs(abs(P.y) - ${ROAD_Z.toFixed(1)}));
          c = mix(c, vec3(0.62, 0.61, 0.59), 1.0 - smoothstep(0.18, 0.2 + aw, curb));
        }
        // behind the blast front: scorched, and lit orange by the fireball
        float rr = length(P - uHit);
        float behind = uBlastR > 0.0 ? smoothstep(uBlastR + 6.0, uBlastR - 12.0, rr) : 0.0;
        c = mix(c, c * vec3(0.3, 0.26, 0.24), behind);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = road ? 0.55 + 0.25 * gn(P * 2.0) - paint * 0.1 : 0.75;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float rr2 = length(vGW.xz - uHit);
          float beh = uBlastR > 0.0 ? smoothstep(uBlastR + 6.0, uBlastR - 12.0, rr2) : 0.0;
          totalEmissiveRadiance += vec3(2.2, 0.7, 0.15) * beh * exp(-max(rr2 - 60.0, 0.0) / 220.0) * (0.7 + 0.3 * gn(vGW.xz * 0.2 + uTime));
        }`);
  };
  mat.customProgramCacheKey = () => 'rod-ground-v1';
  const geo = new THREE.PlaneGeometry(3200, 3600).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -900);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // curbs: thin raised edges along the road, and the median's curb and grass
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8a8782, roughness: 0.8 });
  const curbs = [];
  for (const s of [-1, 1]) {
    curbs.push([s * ROAD_X, 0, (-ROAD_Z + AVE_END) / 2, 0.25, -ROAD_Z - AVE_END]);        // avenue, north
    curbs.push([s * ROAD_X, 0, (ROAD_Z + 320) / 2, 0.25, 320 - ROAD_Z]);                  // avenue, south
    curbs.push([s * 220, 0, -ROAD_Z, 410, 0.25]);
    curbs.push([s * 220, 0, ROAD_Z, 410, 0.25]);
    curbs.push([0, 0, s > 0 ? (ROAD_Z + 4 + 320) / 2 : (-ROAD_Z - 4 + AVE_END) / 2, MED * 2, s > 0 ? 320 - ROAD_Z - 4 : -ROAD_Z - 4 - AVE_END]);
  }
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 1).translate(0, 0.08, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach((c, i) => cg.setMatrixAt(i, m4.makeScale(c[3], 1, c[4]).setPosition(c[0], c[1], c[2])));
  cg.receiveShadow = true; cg.castShadow = true;
  scene.add(cg);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f6a26, roughness: 0.95 });
  const gm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.2, 1).translate(0, 0.1, 0), grassMat, 2);
  gm.setMatrixAt(0, m4.makeScale(MED * 2 - 0.7, 1, -ROAD_Z - 4 - AVE_END).setPosition(0, 0, (-ROAD_Z - 4 + AVE_END) / 2));
  gm.setMatrixAt(1, m4.makeScale(MED * 2 - 0.7, 1, 320 - ROAD_Z - 4).setPosition(0, 0, (ROAD_Z + 4 + 320) / 2));
  gm.receiveShadow = true;
  scene.add(gm);
  return { mesh, GU };
}
