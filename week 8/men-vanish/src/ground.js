// The ground: the avenue (two lanes each way, a double yellow line), the cross street, the crosswalks (wide white
// bars), stop lines, concrete sidewalks with curbs. In the weeks after (uDecay) litter and grime gather.
import * as THREE from 'three';
import { AV, FX, CZ, CR, FZ, XWALK_S, XWALK_N, STOP_NB, STOP_SB, HWY } from './layout.js';

export const GU = {
  uTime: { value: 0 }, uDecay: { value: 0 }, uNight: { value: 0 },
  uSkyHi: { value: new THREE.Color(0.1, 0.3, 0.78) }, uSkyLo: { value: new THREE.Color(0.62, 0.78, 0.95) },
  uHaze: { value: new THREE.Color(0.7, 0.8, 0.92) }, uHazeD: { value: 2500 },
};
const f = (x) => x.toFixed(2);

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform float uTime; uniform float uDecay; uniform float uNight;
        uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD;
        float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
        float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y)) * 0.7;
        float ax = abs(P.x), dz = abs(P.y - (${f(CZ)}));
        bool avRoad = ax < ${f(AV)};
        bool crRoad = dz < ${f(CR)};
        vec3 c;
        float paint = 0.0, yellow = 0.0;
        float n = gn(P * 2.5) * 0.5 + gn(P * 9.0) * 0.5;
        if (avRoad || crRoad) {
          c = vec3(0.16, 0.16, 0.17) * (0.85 + 0.3 * n);
          // patches and the darker wheel tracks
          c *= 0.92 + 0.08 * gn(P * 0.3);
          bool inX = avRoad && crRoad;
          if (avRoad && !inX) {
            yellow = max(band(P.x, -0.28, -0.1, aw), band(P.x, 0.1, 0.28, aw));
            float dash = step(0.45, fract(P.y / 9.0));
            paint = max(paint, (band(P.x, 3.65, 3.85, aw) + band(P.x, -3.85, -3.65, aw)) * dash);
            // the crosswalks: wide bars across the road
            float zs = P.y;
            float onS = band(zs, ${f(XWALK_S[0])}, ${f(XWALK_S[1])}, aw), onN = band(zs, ${f(XWALK_N[0])}, ${f(XWALK_N[1])}, aw);
            paint = max(paint, (onS + onN) * band(fract(P.x / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onS - onN;
            // stop lines
            paint = max(paint, band(P.y, ${f(STOP_NB)}, ${f(STOP_NB + 0.45)}, aw) * step(0.0, P.x));
            paint = max(paint, band(P.y, ${f(STOP_SB - 0.45)}, ${f(STOP_SB)}, aw) * step(P.x, 0.0));
          } else if (crRoad && !inX) {
            float rz = P.y - (${f(CZ)});
            yellow = max(band(rz, -0.28, -0.1, aw), band(rz, 0.1, 0.28, aw));
            float dash = step(0.45, fract(P.x / 9.0));
            paint = max(paint, (band(rz, 3.5, 3.7, aw) + band(rz, -3.7, -3.5, aw)) * dash);
            float onE = band(P.x, ${f(AV + 1)}, ${f(AV + 5)}, aw), onW = band(P.x, ${f(-AV - 5)}, ${f(-AV - 1)}, aw);
            paint = max(paint, (onE + onW) * band(fract(P.y / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onE - onW;
            paint = max(paint, band(P.x, ${f(-AV - 6.6)}, ${f(-AV - 6.15)}, aw) * step(0.0, rz));
            paint = max(paint, band(P.x, ${f(AV + 6.15)}, ${f(AV + 6.6)}, aw) * step(rz, 0.0));
          }
          float wear = 0.75 + 0.25 * gn(P * 1.7);
          c = mix(c, vec3(0.86, 0.86, 0.82) * wear, paint * 0.92);
          c = mix(c, vec3(0.85, 0.66, 0.14) * wear, yellow * 0.9);
        } else {
          // concrete sidewalk slabs
          vec2 t = fract(P / 1.5);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.6, 0.58, 0.55) * (0.88 + 0.2 * g21(floor(P / 1.5))) * (0.9 + 0.15 * n);
          c *= 0.84 + 0.16 * smoothstep(0.0, 0.03 + aw, joint);
          // (the building lots past the fronts: darker)
          if (ax > ${f(FX + 0.5)} && dz > ${f(FZ + 0.5)}) c *= 0.7;
        }
        // the weeks after: grime and litter
        float lit = step(0.985, g21(floor(P * 3.0))) * uDecay;
        c = mix(c, c * 0.72, uDecay * smoothstep(0.35, 0.8, gn(P * 0.4)));
        c = mix(c, vec3(0.85, 0.82, 0.75) * (0.6 + 0.4 * g21(floor(P * 3.0) + 2.0)), lit);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = (avRoad || crRoad) ? 0.72 + 0.15 * gn(P * 2.0) - paint * 0.1 : 0.85;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'men-ground-v1';
  const geo = new THREE.PlaneGeometry(1600, 2000, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -600);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the curbs (left open at the crosswalks)
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.8 });
  const curbs = [];
  const runZ = (x, z0, z1) => { for (let z = z0; z > z1; z -= 2) curbs.push([x, z - 1, 0]); };
  const runX = (z, x0, x1) => { for (let x = x0; x < x1; x += 2) curbs.push([x + 1, z, 1]); };
  for (const s of [-1, 1]) {
    runZ(s * AV, 320, CZ + CR + 0.0);            // avenue, south of the intersection
    runZ(s * AV, CZ - CR, -900);                  // north of it
    runX(CZ + s * CR, AV, 700);                   // cross street, east
    runX(CZ + s * CR, -700, -AV);                 // west
  }
  // (gaps where the crosswalks meet the curb)
  const keep = curbs.filter(([x, z, k]) => {
    if (k === 0) return !(z > XWALK_S[0] - 0.2 && z < XWALK_S[1] + 0.2) && !(z > XWALK_N[0] - 0.2 && z < XWALK_N[1] + 0.2) && Math.abs(z - HWY.z) > 1;
    return !(Math.abs(x) > AV + 0.8 && Math.abs(x) < AV + 5.2);
  });
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.15, 2.0).translate(0, 0.075, 0), curbMat, keep.length);
  const m4 = new THREE.Matrix4();
  keep.forEach(([x, z, k], i) => cg.setMatrixAt(i, k ? m4.makeRotationY(Math.PI / 2).setPosition(x, 0, z) : m4.makeTranslation(x, 0, z)));
  cg.receiveShadow = true; cg.frustumCulled = false;
  scene.add(cg);
  return { mesh };
}
