// The ground: the street (one lane each way, a double yellow line, white lines marking the parking lanes), the cross
// street 110 m up with its crosswalks, concrete sidewalks with curbs. Dust settles on everything once things blow.
import * as THREE from 'three';
import { RW, FX, CZ, CW, YOU } from './layout.js';
import { PEEL } from './debris.js';
import { CU } from './city.js';

export const GU = {
  uTime: { value: 0 }, uSkyHi: { value: new THREE.Color(0.1, 0.3, 0.78) }, uSkyLo: { value: new THREE.Color(0.62, 0.78, 0.95) },
  uHaze: CU.uHaze, uHazeD: CU.uHazeD, uDust: CU.uDust, uL: CU.uL, uMouth: CU.uMouth,
  uCrack: { value: 0 }, uPit: { value: 0 },         // the crater under you: how far its cracks reach (m), its dark middle (m)
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
        uniform float uTime; uniform float uDust; uniform float uL; uniform vec3 uMouth; uniform float uCrack; uniform float uPit;
        uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uHaze; uniform float uHazeD;
        float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
        float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y)) * 0.7;
        float ax = abs(P.x), dz = abs(P.y - (${f(CZ)}));
        bool road = ax < ${f(RW)};
        bool cross = dz < ${f(CW)};
        vec3 c;
        float paint = 0.0, yellow = 0.0;
        float n = gn(P * 2.5) * 0.5 + gn(P * 9.0) * 0.5;
        if (road || cross) {
          c = vec3(0.17, 0.17, 0.18) * (0.85 + 0.3 * n);
          c *= 0.92 + 0.08 * gn(P * 0.3);
          bool inX = road && cross;
          if (road && !inX) {
            yellow = max(band(P.x, -0.26, -0.1, aw), band(P.x, 0.1, 0.26, aw));
            paint = max(paint, band(ax, 3.45, 3.6, aw));
            // parking bays: short ticks
            paint = max(paint, band(ax, 3.6, ${f(RW)}, aw) * band(fract(P.y / 6.5), 0.0, 0.025, aw / 6.5));
            float onX = band(dz, ${f(CW + 1.0)}, ${f(CW + 4.5)}, aw);
            paint = max(paint, onX * band(fract(P.x / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onX;
          } else if (cross && !inX) {
            float rz = P.y - (${f(CZ)});
            yellow = max(band(rz, -0.26, -0.1, aw), band(rz, 0.1, 0.26, aw));
            float onX = band(ax, ${f(RW + 1.0)}, ${f(RW + 4.5)}, aw);
            paint = max(paint, onX * band(fract(P.y / 1.2), 0.0, 0.55, aw / 1.2));
            yellow *= 1.0 - onX;
          }
          float wear = 0.75 + 0.25 * gn(P * 1.7);
          c = mix(c, vec3(0.86, 0.86, 0.82) * wear, paint * 0.92);
          c = mix(c, vec3(0.85, 0.66, 0.14) * wear, yellow * 0.9);
        } else {
          vec2 t = fract(P / 1.5);
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          c = vec3(0.44, 0.42, 0.4) * (0.88 + 0.2 * g21(floor(P / 1.5))) * (0.9 + 0.15 * n);
          c *= 0.84 + 0.16 * smoothstep(0.0, 0.03 + aw, joint);
          if (ax > ${f(FX + 0.5)} && dz > ${f(CW + 5.5)}) c *= 0.7;
        }
        // the crater under you: jagged cracks out from your feet, rings of them, a dark broken middle
        // the road where its asphalt has peeled off (debris.js: each cell lifts at ~20 psi, its own +-15%): bare dirt
        if (road && uL > 10.0) {
          float cx = floor((P.x - (${f(PEEL.x0)})) / ${f(PEEL.cw)}), cz = floor((P.y - (${f(PEEL.z0)})) / ${f(PEEL.cl)});
          if (cx >= 0.0 && cx < ${f(PEEL.nx)} && cz >= 0.0 && cz < ${f(PEEL.nz)}) {
            vec3 cc = vec3(${f(PEEL.x0)} + (cx + 0.5) * ${f(PEEL.cw)}, 0.1, ${f(PEEL.z0)} + (cz + 0.5) * ${f(PEEL.cl)});
            float hh = fract((cx * 7.0 + cz * 13.0 + 1000.0) * 0.61803398);
            float pkc = 2.874 * pow(10.0, uL * 0.5) / max(length(vec2(distance(cc.xz, uMouth.xz), 1.5)), 0.5);
            if (pkc >= ${f(PEEL.thr)} * (0.85 + 0.3 * hh)) c = vec3(0.17, 0.13, 0.1) * (0.7 + 0.5 * gn(P * 3.0)) * (0.8 + 0.2 * gn(P * 0.7));
          }
        }
        if (uCrack > 0.0) {
          vec2 Q = P - vec2(${f(YOU.x)}, ${f(YOU.z)});
          float rq = length(Q), aq = atan(Q.y, Q.x);
          float wig = (gn(vec2(rq * 3.0, aq * 2.0)) - 0.5) * 0.9 + (gn(vec2(rq * 11.0, aq * 5.0)) - 0.5) * 0.25;
          float sec = (aq / 6.2832 + 0.5) * 11.0 + wig;
          float ds = abs(fract(sec) - 0.5) * 6.2832 / 11.0 * rq;
          float reach = uCrack * (0.45 + 0.55 * g21(vec2(floor(sec), 7.0)));
          float cw = 0.008 + 0.035 * smoothstep(reach, 0.0, rq);
          float crack = (1.0 - smoothstep(cw, cw + aw * 1.5, ds)) * (1.0 - smoothstep(reach - 0.4, reach, rq));
          for (int k = 0; k < 3; k++) {
            float ringR = (0.9 + float(k) * 1.1) * (0.6 + 0.4 * min(uCrack / 4.0, 1.0)) + 0.1 * (gn(vec2(aq * 4.0, float(k))) - 0.5);
            crack = max(crack, (1.0 - smoothstep(0.012, 0.012 + aw * 1.5, abs(rq - ringR))) * step(ringR, reach * 0.8));
          }
          c = mix(c, vec3(0.04, 0.035, 0.03), crack * 0.95);
          float pit = uPit * (0.85 + 0.3 * gn(vec2(aq * 3.0, 2.0)));
          c *= mix(1.0, 0.3, (1.0 - smoothstep(pit * 0.6, pit * 1.6, rq)) * step(0.01, uPit));
        }
        // dust blown over everything near you once the shock wave starts
        float pk = 2.874 * pow(10.0, uL * 0.5) / max(distance(vec3(P.x, 0.0, P.y), uMouth), 0.5);
        float du = uDust * smoothstep(1.0, 6.0, pk / 6894.76);
        c = mix(c, vec3(0.23, 0.21, 0.18) * (0.75 + 0.4 * gn(P * 0.8)), du * 0.5);
        diffuseColor.rgb = c;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = (road || cross) ? 0.72 + 0.15 * gn(P * 2.0) - paint * 0.1 : 0.85;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'scream-ground-v1';
  const geo = new THREE.PlaneGeometry(1600, 2000, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -600);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the curbs (open at the crosswalks)
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.8 });
  const curbs = [];
  for (const s of [-1, 1]) {
    for (let z = 120; z > -900; z -= 2) if (Math.abs(z - 1 - CZ) > CW + 0.2) curbs.push([s * RW, z - 1, 0]);
    for (let x = RW; x < 700; x += 2) for (const zs of [-1, 1]) if (Math.abs(x + 1) > RW + 4.7 || Math.abs(x + 1) < RW + 0.8) curbs.push([s * (x + 1), CZ + zs * CW, 1]);
  }
  const cg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.15, 2.0).translate(0, 0.075, 0), curbMat, curbs.length);
  const m4 = new THREE.Matrix4();
  curbs.forEach(([x, z, k], i) => cg.setMatrixAt(i, k ? m4.makeRotationY(Math.PI / 2).setPosition(x, 0, z) : m4.makeTranslation(x, 0, z)));
  cg.receiveShadow = true; cg.frustumCulled = false;
  scene.add(cg);
  return { mesh };
}
