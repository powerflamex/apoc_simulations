// The ground: one mesh, a polar grid around you (fine near you, coarse far off), heights from layout.groundY, painted in the
// fragment shader: dry sand with footprints, wet sand, the sea floor where the sea has gone, the boardwalk and the coast road.
// The vertex shader digs the crater at HIT (a bowl with a raised rim of thrown sand), rolls the waves through the ground
// near the end. The inside of the crater is fused dark and glows after a big hit.
import * as THREE from 'three';
import { groundY, CAM0, HIT, BEACH, SHELF_GLSL, CRATER_GLSL, ROLL_GLSL } from './layout.js';

export const GU = {
  uTime: { value: 0 }, uSeaY: { value: 0 }, uRc: { value: 0 }, uRollA: { value: 0 }, uHot: { value: 0 }, uScorch: { value: 0 }, uFront: { value: -1 }, uCrack: { value: 0 },
};
const HITV = `vec2(${HIT.x.toFixed(1)}, ${HIT.z.toFixed(1)})`;

export function makeGround(scene) {
  const NR = 520, NA = 760, R0 = 0.5, R1 = 40000;
  const pos = new Float32Array((NR + 1) * NA * 3);
  let k = 0;
  // (the rings are centred on the spot, so the crater sits in the fine part of the grid)
  const CX = HIT.x, CZ = HIT.z;
  for (let i = 0; i <= NR; i++) {
    const r = 0.22 * i + 1.2 * Math.pow(R1 / 1.2, i / NR) - 1.0;
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const x = CX + Math.sin(a) * r, z = CZ - Math.cos(a) * r;
      pos[k++] = x; pos[k++] = groundY(x, z); pos[k++] = z;
    }
  }
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uRc; uniform float uRollA;
        ${CRATER_GLSL} ${ROLL_GLSL}
        varying vec3 vWP; varying float vBase;
        float addY(vec2 p) { float rr = length(p - ${HITV}); return craterY(rr, uRc) + rollY(rr, uTime, uRollA); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          vec2 p = position.xz; float e = max(0.25, uRc * 0.03);
          float dx = addY(p + vec2(e, 0.0)) - addY(p - vec2(e, 0.0)), dz = addY(p + vec2(0.0, e)) - addY(p - vec2(0.0, e));
          objectNormal = normalize(objectNormal + vec3(-dx, 0.0, -dz) / (2.0 * e));
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBase = position.y;
        transformed.y += addY(position.xz);`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uSeaY; uniform float uRc; uniform float uHot; uniform float uScorch; uniform float uFront; uniform float uCrack;
        varying vec3 vWP; varying float vBase;
        ${SHELF_GLSL}
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n21(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        float lineAt(float d, float c, float w) { float fw = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w - fw, w + fw, abs(d - c)); }
        float gRough = 0.95;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 P = vWP.xz;
          float o = P.x - shoreX(P.y), d = P.x, n = fbm2(P * 0.35);
          vec3 col;
          // bright pale-gold sand, churned by feet; ripples and dark wet sand near the water
          vec3 sand = vec3(0.93, 0.80, 0.60) * (0.9 + 0.16 * n) * (0.95 + 0.09 * n21(P * 2.1));
          sand *= 0.95 + 0.08 * n21(P * 0.8 + 4.0);
          float above = vBase - uSeaY;
          float wet = smoothstep(-16.0, -2.0, o) ;
          if (d < ${BEACH.walk.toFixed(1)}) {
            if (d > ${BEACH.road.toFixed(1)}) {
              // the boardwalk: pale planks
              col = vec3(0.62, 0.52, 0.4) * (0.85 + 0.2 * n21(vec2(P.x * 0.5, floor(P.y / 0.3))));
              col *= 1.0 - 0.3 * lineAt(fract(P.y / 0.3), 0.5, 0.05);
            } else if (d > ${BEACH.front.toFixed(1)}) {
              col = vec3(0.19, 0.19, 0.2) * (0.9 + 0.2 * n);
              float dd = abs(d + 131.0);
              col = mix(col, vec3(0.86, 0.75, 0.3), 1.0 - smoothstep(0.1, 0.16, dd));
            } else col = vec3(0.62, 0.6, 0.57) * (0.9 + 0.15 * n);
          } else {
            col = mix(sand, sand * vec3(0.66, 0.6, 0.55), wet);
            gRough = mix(0.97, 0.6, wet);
            if (o > 0.0) {
              // the sea floor: dark wet mud and sand, pools, ripples running along the shore
              vec3 mud = mix(vec3(0.3, 0.3, 0.27), vec3(0.13, 0.17, 0.18), smoothstep(0.0, 160.0, o)) * (0.8 + 0.4 * n);
              mud *= 0.9 + 0.2 * sin(o * 1.5 + 6.0 * n);
              // pools left behind, shining with the sky
              mud = mix(mud, vec3(0.42, 0.5, 0.56), smoothstep(0.54, 0.6, fbm2(P * 0.06)) * 0.8);
              col = mix(col, mud, smoothstep(0.0, 24.0, o));
              gRough = 0.45;
            }
          }
          // the blast marks: scorched around the crater; the crater fused to dark glass, glowing in its deep
          float rr = length(P - ${HITV});
          float sc = uScorch * (1.0 - smoothstep(uRc * 1.5, uRc * 3.0, rr + (0.6 + uRc * 0.5) * (n - 0.5) * 2.0));
          col = mix(col, vec3(0.09, 0.08, 0.075) * (0.8 + 0.5 * n), sc * 0.9);
          // behind the blast front the sand is blown clean and burnt
          float behind = uFront > 0.0 ? 1.0 - smoothstep(uFront - 10.0, uFront + 4.0, rr + 16.0 * (n - 0.5)) : 0.0;
          col = mix(col, col * vec3(0.46, 0.4, 0.36), behind * step(o, 0.0));
          float bowl = 1.0 - smoothstep(uRc * 0.92, uRc * 1.08, rr);
          vec3 bowlC = mix(vec3(0.17, 0.13, 0.1), vec3(0.06, 0.05, 0.05), smoothstep(0.0, 1.0, uScorch * 1.5)) * (0.8 + 0.4 * n);
          col = mix(col, bowlC, bowl);
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float rr = length(vWP.xz - ${HITV});
          float bowl = 1.0 - smoothstep(uRc * 0.3, uRc * 1.0, rr);
          float vein = mix(0.45 + 0.55 * smoothstep(0.42, 0.6, fbm2(vWP.xz * 0.5 / max(1.0, uRc * 0.08) + uTime * 0.05)), 1.0, smoothstep(190.0, 280.0, uRc));
          totalEmissiveRadiance += vec3(2.4, 0.75, 0.14) * bowl * uHot * vein;
          // the lip: a line of molten sand round the crater, the edge you watch coming toward you
          float lip = exp(-pow((rr - uRc * 1.0) / clamp(uRc * 0.05, 1.2, 3.5), 2.0));
          totalEmissiveRadiance += vec3(3.4, 1.15, 0.22) * lip * smoothstep(14.0, 30.0, uRc) * (0.55 + 0.45 * vein);
          // the ground splitting: bright cracks forking out of the crater and running at you
          if (uCrack > 0.0) {
            vec2 q = vWP.xz - ${HITV};
            float th = atan(q.x, -q.y);
            // radial cracks, each wandering on its way out; d: how far this point is from the nearest one, in metres
            float u = th * 44.0 / 6.2832 + 1.6 * (fbm2(vec2(th * 2.0, rr * 0.009) + 3.0) - 0.5) + 0.25 * (n21(vec2(th * 9.0, rr * 0.05)) - 0.5);
            float id = floor(u), d = abs(fract(u) - 0.5) / 44.0 * 6.2832 * rr;
            float wid = 0.22 + 0.004 * rr, len = 0.45 + 0.75 * h21(vec2(id, 7.0));
            float cl = (1.0 - smoothstep(wid * 0.5, wid * 1.3, d)) * smoothstep(14.0, 46.0, length(vWP.xz - vec2(${CAM0.x.toFixed(1)}, ${CAM0.z.toFixed(1)})));
            float reach = uRc + uCrack * 340.0 * len;
            totalEmissiveRadiance += vec3(3.2, 1.05, 0.2) * cl * (1.0 - smoothstep(reach - 30.0, reach, rr)) * smoothstep(uRc * 0.98, uRc * 1.02, rr);
          }
        }`);
  };
  mat.customProgramCacheKey = () => 'sand-ground-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}
