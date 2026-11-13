// The ground under your feet, at every size: one big flat disc in your metres whose shader works out the REAL position
// of each pixel (scene position / S) and paints octaves of detail from a metre down to 50 nm, each one fading in once
// it is a few pixels big: the lawn, the soil between the blades, sand grains (each its own mineral colour), the cracks
// and facets on a grain, clay flakes on it, and the near-flat crystal surface under them. Inside the dew drop the
// light through the water draws moving caustics on it.
import * as THREE from 'three';
import { NOISE } from './mats.js';

export function makeGround(scene) {
  const U = {
    uK: { value: new Float32Array(8) },     // per octave: 1 / (wavelength x S) in scene units
    uFoot: { value: 1 },                    // real metres per scene metre per radian (= 1/S) x pixel angle
    uCaus: { value: 0 }, uCausK: { value: 1 }, uT: { value: 0 }, uWet: { value: 0 },
  };
  const LAM = [0.6, 0.04, 0.004, 4e-4, 4e-5, 4e-6, 4e-7, 4e-8];
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW; uniform float uK[8]; uniform float uFoot, uCaus, uCausK, uT, uWet;
      ${NOISE}
      float vis(int i, float d){ float lam = 1.0 / uK[i]; float px = d * 0.0006; return smoothstep(2.5, 9.0, lam / max(px, 1e-9)); }
      vec3 mineral(float r){ return r < 0.38 ? vec3(0.9, 0.86, 0.78) : r < 0.55 ? vec3(0.97, 0.96, 0.93) : r < 0.7 ? vec3(0.86, 0.62, 0.52) : r < 0.82 ? vec3(0.5, 0.48, 0.47) : r < 0.92 ? vec3(0.78, 0.45, 0.25) : vec3(0.3, 0.27, 0.25); }
      float Hg = 0.0;
      vec3 groundCol(vec2 p, float d) {
        // 0: the lawn from above (green), 1: soil between blades, 2: crumbs, 3: sand grains, 4: facets on a grain,
        // 5: clay flakes, 6: fine crystal texture, 7: nano bumps
        vec2 q0 = p * uK[0], q1 = p * uK[1], q2 = p * uK[2], q3 = p * uK[3], q4 = p * uK[4], q5 = p * uK[5], q6 = p * uK[6], q7 = p * uK[7];
        vec3 c = vec3(0.36, 0.56, 0.2) * (0.8 + 0.35 * fbm3(vec3(q0, 0.5)));
        float a1 = vis(1, d);
        vec3 lawn = c * (0.85 + 0.3 * n3(vec3(q1 * 3.0, 1.0)));
        vec3 soil = vec3(0.56, 0.4, 0.26) * (0.75 + 0.45 * fbm3(vec3(q1, 2.0)));
        c = mix(c, mix(lawn, soil, smoothstep(0.0, 1.0, vis(2, d))), a1);
        // crumbs and sand grains: cells with their own mineral colours
        vec2 v3 = vor3(vec3(q3, 0.0)).xy;
        float id3 = h13(floor(vec3(q3 * 1.0, 0.0)) + 0.37);
        vec3 grain = mineral(h13(vec3(floor(q3 + 0.5 * vec2(n3(vec3(q3, 3.0)))), 7.0)));
        float edge3 = smoothstep(0.0, 0.12, v3.y - v3.x);
        float g3 = vis(3, d);
        c = mix(c, mix(soil * 0.7, grain * (0.75 + 0.3 * edge3), 0.85), g3);
        Hg += g3 * edge3 * 0.6;
        // facets and cracks on the grain
        vec2 v4 = vor3(vec3(q4, 1.0)).xy;
        float g4 = vis(4, d);
        c *= mix(1.0, 0.82 + 0.3 * smoothstep(0.0, 0.08, v4.y - v4.x) + 0.08 * h13(floor(vec3(q4 * 2.0, 4.0))), g4);
        Hg += g4 * smoothstep(0.0, 0.08, v4.y - v4.x) * 0.4;
        // clay flakes
        vec2 v5 = vor3(vec3(q5, 2.0)).xy;
        float g5 = vis(5, d);
        c = mix(c, c * (0.85 + 0.25 * smoothstep(0.0, 0.15, v5.y - v5.x)) * mix(vec3(1.0), vec3(1.05, 0.98, 0.9), 0.5), g5);
        Hg += g5 * smoothstep(0.0, 0.15, v5.y - v5.x) * 0.3;
        // fine crystal texture and nano bumps
        float g6 = vis(6, d), g7 = vis(7, d);
        c *= 1.0 + g6 * 0.12 * (n3(vec3(q6, 5.0)) - 0.5) + g7 * 0.1 * (n3(vec3(q7, 6.0)) - 0.5);
        Hg += g6 * n3(vec3(q6, 5.0)) * 0.2 + g7 * n3(vec3(q7, 6.0)) * 0.15;
        return c;
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float d = length(vW - cameraPosition);
          vec3 c = groundCol(vW.xz, d);
          // caustics from the drop's surface (moving bright lines)
          if (uCaus > 0.0) {
            vec2 q = vW.xz * uCausK;
            vec2 v = vor3(vec3(q, uT * 0.35)).xy; vec2 v2 = vor3(vec3(q * 1.7 + 3.0, uT * 0.5)).xy;
            float cs = pow(1.0 - smoothstep(0.0, 0.12, v.y - v.x), 2.0) + 0.6 * pow(1.0 - smoothstep(0.0, 0.1, v2.y - v2.x), 2.0);
            c += vec3(0.75, 0.95, 1.0) * cs * uCaus;
          }
          c = mix(c, c * vec3(0.8, 0.95, 1.0), uWet);
          diffuseColor.rgb = c; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { normal = bumpN(-vViewPosition, normal, vec2(dFdx(Hg), dFdy(Hg)) * 0.25); }`);
  };
  m.customProgramCacheKey = () => 'ground-zoom';
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 128, 0, Math.PI * 2), m);
  mesh.geometry.rotateX(-Math.PI / 2);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh, U,
    // S: how many times smaller you are; y: where real ground level is in your metres
    frame(v, S, y, caus = 0, wet = 0) {
      mesh.position.set(0, y, 0);
      mesh.scale.setScalar(25000);
      for (let i = 0; i < 8; i++) U.uK.value[i] = 1 / (LAM[i] * S);
      U.uT.value = v;
      U.uCaus.value = caus;
      U.uCausK.value = 1 / (3e-4 * S);
      U.uWet.value = wet;
    },
  };
}
