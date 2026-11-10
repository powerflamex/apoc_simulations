// The bubble's wall in the city: one patch for every material in Paris. Everything on the far side of the wall
// (dot(p, N) < D) is gone; a ragged glowing seam runs where the wall is cutting, its light spills a little ahead of
// it, and where you look into a cut object you see its glowing cross-section (back faces seen through the cut).
//   wallify(material, { color: glsl }) — `color` (optional) may set diffuseColor.rgb from the world position wp.
import * as THREE from 'three';

export const WU = {
  uWallN: { value: new THREE.Vector3(1, 0, 0) },   // the way the wall travels (away from the Sun)
  uWallD: { value: -1e9 },                        // the wall sits at dot(p, N) = D
  uWallOn: { value: 0 },
  uWallT: { value: 0 },                           // video time (the seam's flicker)
};

export const WALL_PARS = /* glsl */ `
uniform vec3 uWallN; uniform float uWallD; uniform float uWallOn; uniform float uWallT;
varying vec3 vWallW;
float wHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float wNoise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
const vec3 WEDGE = vec3(1.2, 1.0, 1.9);
`;

export function wallify(m, { color = '', key = '' } = {}) {
  if (m.userData.wall) return m;
  m.userData.wall = true;
  m.side = THREE.DoubleSide;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    if (prev) prev.call(m, shader, r);
    Object.assign(shader.uniforms, WU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWallW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wq = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wq = instanceMatrix * wq;
          #endif
          vWallW = (modelMatrix * wq).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WALL_PARS)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec3 wp = vWallW;
        float wDist = length(wp - cameraPosition);
        float wWid = 0.025 + 0.004 * wDist;
        float wS = dot(wp, uWallN) - uWallD;
        float wJ = wS + (wNoise(wp / wWid * 0.35 + vec3(0.0, uWallT * 0.7, 0.0)) - 0.5) * wWid * 3.0;
        if (uWallOn > 0.5 && wJ < 0.0) discard;
        float wEdge = uWallOn * exp(-max(wJ, 0.0) / wWid);
        float wSpill = uWallOn * exp(-max(wS, 0.0) / (wWid * 30.0));
        bool wCap = uWallOn > 0.5 && !gl_FrontFacing;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        gl_FragColor.rgb += WEDGE * (wEdge * 7.0 + wSpill * 0.22);
        if (wCap) gl_FragColor.rgb = WEDGE * (1.6 + 1.5 * wNoise(wp * 3.0 + uWallT)) + vec3(2.0, 1.4, 0.9) * wEdge * 2.0;`);
    if (color) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + color);
  };
  const k = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  m.customProgramCacheKey = () => k() + '|wall|' + key + color.length;
  return m;
}
