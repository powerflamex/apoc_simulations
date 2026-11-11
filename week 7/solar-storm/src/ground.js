// The ground: the avenue (two lanes each way, a double yellow line, zebra crossings at the cross street), the cross
// street, the wide sidewalks (concrete slabs, curbs) and the hole of the subway stairwell. Light on it from up to NSPOT
// "spots" set each frame: the lamps' pools (warm, while the power's on), headlight cones, phone torches. The asphalt has
// a slight sheen that catches the aurora.
import * as THREE from 'three';
import { CURB, FX, CROSS } from './layout.js';

export const NSPOT = 48;
export const GU = {
  uTime: { value: 0 },
  uSkyHi: { value: new THREE.Color(0.5, 0.08, 0.12) }, uSkyLo: { value: new THREE.Color(0.1, 0.6, 0.25) }, uAur: { value: 1 },
  uHaze: { value: new THREE.Color(0.03, 0.06, 0.05) }, uHazeD: { value: 2600 },
  uSpotP: { value: Array.from({ length: NSPOT }, () => new THREE.Vector4(0, 0, 0, 0)) },     // x, z, yaw, length (0: round pool of radius |yaw|)
  uSpotC: { value: Array.from({ length: NSPOT }, () => new THREE.Vector4(0, 0, 0, 0)) },     // rgb, spread
};

const NOISE = /* glsl */ `
  float g21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(g21(i), g21(i + vec2(1, 0)), f.x), mix(g21(i + vec2(0, 1)), g21(i + vec2(1, 1)), f.x), f.y); }
`;

export function makeGround(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
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
        uniform float uTime; uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform float uAur; uniform vec3 uHaze; uniform float uHazeD;
        uniform vec4 uSpotP[${NSPOT}]; uniform vec4 uSpotC[${NSPOT}];
        ${NOISE}`)
            .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 P = vGW.xz;
        float aw = max(fwidth(P.x), fwidth(P.y));
        float bx = abs(P.x);
        bool cross = P.y > ${CROSS[0].toFixed(1)} && P.y < ${CROSS[1].toFixed(1)};
        bool road = bx < ${CURB.toFixed(1)} || cross;
        vec3 c; float sheen = 0.0;
        if (road) {
          float n = gn(P * 3.0) * 0.5 + gn(P * 11.0) * 0.5;
          c = vec3(0.16, 0.16, 0.17) * (0.85 + 0.3 * n) * (0.9 + 0.2 * gn(P * 0.15));
          sheen = 0.5;
          float paint = 0.0;
          if (!cross) {
            // lane lines (dashed white), the double yellow in the middle, solid white along the curbs
            float lane = abs(bx - 3.5);
            paint = max(paint, (1.0 - smoothstep(0.07, 0.07 + aw, lane)) * step(0.5, fract(P.y / 9.0)));
            float ye = (1.0 - smoothstep(0.05, 0.05 + aw, abs(bx - 0.17)));
            c = mix(c, vec3(0.85, 0.66, 0.16), ye * 0.9);
            paint = max(paint, 1.0 - smoothstep(0.06, 0.06 + aw, abs(bx - ${(CURB - 0.35).toFixed(2)})));
            // stop lines and zebra crossings on both sides of the cross street
            float zc = min(abs(P.y - ${(CROSS[1] + 2.2).toFixed(1)}), abs(P.y - ${(CROSS[0] - 2.2).toFixed(1)}));
            paint = max(paint, step(zc, 1.6) * step(0.5, fract(P.x / 1.1)));
            float sl = min(abs(P.y - ${(CROSS[1] + 4.3).toFixed(1)}) * step(0.0, P.x), abs(P.y - ${(CROSS[0] - 4.3).toFixed(1)}) * step(P.x, 0.0));
            paint = max(paint, 1.0 - smoothstep(0.2, 0.2 + aw, sl));
          } else if (bx > ${FX.toFixed(1)}) {
            float lane = abs(P.y - ${((CROSS[0] + CROSS[1]) / 2).toFixed(1)});
            c = mix(c, vec3(0.85, 0.66, 0.16), (1.0 - smoothstep(0.05, 0.05 + aw, abs(lane - 0.17))) * 0.9);
          }
          c = mix(c, vec3(0.82, 0.82, 0.78), paint * 0.85);
        } else {
          // sidewalks: concrete slabs, a granite curb
          vec2 t = fract(P / vec2(1.5, 1.5));
          float joint = min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y)) * 1.5;
          c = vec3(0.42, 0.41, 0.39) * (0.88 + 0.2 * g21(floor(P / 1.5)));
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.04, joint);
          c = mix(c, vec3(0.5, 0.5, 0.48), 1.0 - step(0.3, bx - ${CURB.toFixed(1)}));
          sheen = 0.15;
        }
        // the light thrown on it
        vec3 lit = vec3(0.0);
        for (int i = 0; i < ${NSPOT}; i++) {
          vec4 sp = uSpotP[i]; vec4 sc = uSpotC[i];
          if (sc.r + sc.g + sc.b < 0.001) continue;
          vec2 d = P - sp.xy;
          if (sp.w <= 0.0) {
            float r = abs(sp.z);
            lit += sc.rgb * exp(-dot(d, d) / (r * r));
          } else {
            vec2 f = vec2(sin(sp.z), cos(sp.z));
            float a = dot(d, f), b = dot(d, vec2(f.y, -f.x));
            float cone = smoothstep(-0.5, 1.5, a) * exp(-a / sp.w) * exp(-b * b / pow(0.6 + a * sc.w, 2.0));
            lit += sc.rgb * cone;
          }
        }
        // the aurora in the sheen of the road
        vec3 V = normalize(vGW - cameraPosition);
        vec3 rr = reflect(V, vec3(0.0, 1.0, 0.0));
        float fres = pow(1.0 - abs(V.y), 4.0);
        vec3 refl = mix(uSkyLo, uSkyHi, smoothstep(0.1, 0.6, rr.y)) * uAur;
        diffuseColor.rgb = c;
        vec3 gEmit = c * lit + refl * fres * sheen * 0.35 * (0.7 + 0.3 * gn(P * 0.7));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmit;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vGW - cameraPosition) / uHazeD));`);
  };
  mat.customProgramCacheKey = () => 'storm-ground-v1';
  const g = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2), mat);
  g.receiveShadow = true;
  scene.add(g);
  // the curbs: a low step along each side of the avenue (gaps at the cross street)
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.85 });
  for (const s of [-1, 1]) for (const [za, zb] of [[120, CROSS[1]], [CROSS[0], -260]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, za - zb), curbMat);
    m.position.set(s * (CURB + 0.15), 0.075, (za + zb) / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  return g;
}
