// The ground: the stone promenade (big granite slabs), the walkway out along the jetty, the quay street (asphalt,
// parking bays, curbs), the far shores (dark, freckled with street lights). Cut away wherever the harbour is.
// The lamps throw warm pools on it (NSPOT spots set each frame); the fireballs light it through the scene's lights.
import * as THREE from 'three';
import { QZ, JX, JZ, ROAD, FX, PIER } from './layout.js';

export const NSPOT = 28;
export const GU = {
  uTime: { value: 0 },
  uSpotP: { value: Array.from({ length: NSPOT }, () => new THREE.Vector4(0, 0, 0, 0)) },     // x, z, radius
  uSpotC: { value: Array.from({ length: NSPOT }, () => new THREE.Vector4(0, 0, 0, 0)) },     // rgb
  uSkyC: { value: new THREE.Color(0.02, 0.03, 0.06) },
  uHaze: { value: new THREE.Color(0.03, 0.03, 0.045) }, uHazeD: { value: 5000 },
  uScorch: { value: new THREE.Vector4(0, 0, 0, 0) },     // the hit car's burn mark: x, z, radius, strength
};

const NOISE = /* glsl */ `
  float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
`;
const f = (x) => x.toFixed(2);

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
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
        uniform float uTime; uniform vec4 uSpotP[${NSPOT}]; uniform vec4 uSpotC[${NSPOT}]; uniform vec3 uSkyC; uniform vec3 uHaze; uniform float uHazeD;
        uniform vec4 uScorch;
        ${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec2 P = vGW.xz;
          bool far = P.y < -1695.0 || (P.x < -480.0 && P.y < -100.0);
          bool water = P.y < ${f(QZ)} && !(P.x > ${f(JX)} && P.y > ${f(JZ)}) && !far;
          if (water) discard;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        bool far = P.y < -1695.0 || (P.x < -480.0 && P.y < -100.0);
        vec3 c; float sheen = 0.0; vec3 farLights = vec3(0.0);
        if (far) {
          c = vec3(0.05, 0.05, 0.05);
          // street lights of the far city: a freckle of warm points along a rough grid
          vec2 g = P / 38.0; vec2 id = floor(g), fp = fract(g) - 0.5;
          float on = step(0.45, g21(id));
          farLights = vec3(1.0, 0.62, 0.3) * on * exp(-dot(fp, fp) * 60.0) * 1.2;
        } else if (P.x > ${f(ROAD[0])} && P.x < ${f(ROAD[1])}) {
          float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
          c = vec3(0.13, 0.13, 0.14) * (0.85 + 0.3 * n);
          sheen = 0.45;
          // the parking bays along both curbs, a dashed centre line
          float mid = ${f((ROAD[0] + ROAD[1]) / 2)};
          float paint = (1.0 - smoothstep(0.06, 0.06 + aw, abs(P.x - mid))) * step(0.5, fract(P.y / 6.0));
          float bayL = (1.0 - smoothstep(0.05, 0.05 + aw, abs(P.x - ${f(ROAD[0] + 2.3)}))) + (1.0 - smoothstep(0.05, 0.05 + aw, abs(P.x - ${f(ROAD[1] - 2.3)})));
          paint = max(paint, bayL);
          c = mix(c, vec3(0.8, 0.8, 0.76), paint * 0.75);
        } else {
          // granite slabs, a darker band of setts along the quay's edge
          vec2 t = fract(P / vec2(1.2, 0.8));
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y));
          vec2 id = floor(P / vec2(1.2, 0.8));
          c = vec3(0.44, 0.42, 0.4) * (0.86 + 0.22 * g21(id)) * (0.9 + 0.12 * gn(P * 0.4));
          c *= 0.78 + 0.22 * smoothstep(0.0, 0.03 + aw * 0.5, joint);
          float edge = (P.y < ${f(QZ + 1.2)} && P.x < ${f(JX)}) || (P.x > ${f(JX)} && P.x < ${f(JX + 1.2)} && P.y < ${f(QZ)}) ? 1.0 : 0.0;
          vec2 ts = fract(P / 0.3);
          c = mix(c, vec3(0.3, 0.29, 0.28) * (0.8 + 0.3 * g21(floor(P / 0.3))) * (0.85 + 0.15 * smoothstep(0.0, 0.1, min(min(ts.x, 1.0 - ts.x), min(ts.y, 1.0 - ts.y)))), edge);
          // the curbs
          float curb = (1.0 - smoothstep(0.12, 0.14, abs(P.x - ${f(ROAD[0] - 0.12)}))) + (1.0 - smoothstep(0.12, 0.14, abs(P.x - ${f(ROAD[1] + 0.12)})));
          c = mix(c, vec3(0.55, 0.54, 0.5), clamp(curb, 0.0, 1.0));
          sheen = 0.18;
        }
        // the burn mark round the hit car
        if (uScorch.w > 0.0) { vec2 dq = P - uScorch.xy; c *= 1.0 - 0.75 * uScorch.w * exp(-dot(dq, dq) / (uScorch.z * uScorch.z)) * (0.7 + 0.3 * gn(P * 3.0)); }
        // the lamps' light
        vec3 lit = vec3(0.0);
        for (int i = 0; i < ${NSPOT}; i++) {
          vec4 sp = uSpotP[i]; vec4 sc = uSpotC[i];
          if (sc.r + sc.g + sc.b < 0.001) continue;
          vec2 d = P - sp.xy;
          lit += sc.rgb * exp(-dot(d, d) / (sp.z * sp.z));
        }
        vec3 V = normalize(vGW - cameraPosition);
        float fres = pow(1.0 - abs(V.y), 4.0);
        diffuseColor.rgb = c;
        vec3 gEmit = c * lit + uSkyC * fres * sheen * 0.6 + farLights;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmit;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'meteor-ground-v1';
  const g = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2), mat);
  g.receiveShadow = true;
  scene.add(g);
  return g;
}
