// The ground: one mesh, a polar grid around the camera's start (fine near you, coarse far off) with the heights from
// layout.groundY, painted in the fragment shader from (phi, d): sand, the promenade's black-and-white wave mosaic, the
// bike lane, the avenue, the sidewalk, the city, the forested hills; the bay floor once the sea has boiled off it
// (wet near the water, drying and cracking further up). Heat: the shared char + glow patch; the sand fuses into
// dark glass (uGlass); the exposed sea floor steams.
import * as THREE from 'three';
import { groundY, RC, CX, PHI0, PHI1, D } from './layout.js';
import { H, HEAT_GLSL } from './heat.js';

export const GU = { uTime: { value: 0 }, uSeaY: { value: 0 }, uGlass: { value: 0 }, uWet: { value: 0 }, uSmolder: { value: 0 } };

export function makeGround(scene) {
  const NR = 430, NA = 600, R0 = 0.6, R1 = 70000;
  const pos = new Float32Array((NR + 1) * NA * 3);
  let k = 0;
  for (let i = 0; i <= NR; i++) {
    const r = R0 * Math.pow(R1 / R0, i / NR);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      pos[k++] = x; pos[k++] = groundY(x, z); pos[k++] = z;
    }
  }
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
    idx.push(a, b, c, b, d, c);
  }
  // the middle: a small disc under the camera
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GU, H);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${HEAT_GLSL}
        uniform float uTime; uniform float uSeaY; uniform float uGlass; uniform float uWet; uniform float uSmolder;
        varying vec3 vWP; varying vec3 vWN;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n21(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        // a stripe pattern faded to its average where it gets finer than a pixel
        float stripe(float x, float w) { float fw = max(fwidth(x), 1e-4); float s = clamp(0.5 + (abs(fract(x) - 0.5) - 0.25 + w) / fw, 0.0, 1.0); return mix(s, 0.5 - w, smoothstep(0.2, 0.5, fw)); }
        float gRough = 0.92; float gSheen = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 dd = vec2(${CX.toFixed(1)} - vWP.x, -vWP.z);
          float phi = atan(dd.y, dd.x);
          float d = length(dd) - ${RC.toFixed(1)};
          float s = phi * (${RC.toFixed(1)} + d);                // metres along the beach
          float inArc = step(${(PHI0 - 0.02).toFixed(3)}, phi) * step(phi, ${(PHI1 + 0.04).toFixed(3)});
          vec3 col;
          float n = fbm2(vWP.xz * 0.35);
          vec3 sand = vec3(0.8, 0.65, 0.45) * (0.9 + 0.16 * n) * (0.95 + 0.08 * n21(vWP.xz * 3.1));
          if (d < ${D.wall.toFixed(1)} || inArc < 0.5) {
            col = sand;
            // wet sand near the water, and the sea floor (wet mud near the water's edge, drying lighter and cracked)
            float above = vWP.y - uSeaY;
            float wetK = 1.0 - smoothstep(0.0, 1.6, above);
            if (d < 0.0 || inArc < 0.5) {
              vec3 mud = mix(vec3(0.16, 0.15, 0.13), vec3(0.42, 0.38, 0.32), smoothstep(0.0, 25.0, above)) * (0.85 + 0.25 * n);
              float cr = smoothstep(0.03, 0.0, abs(fract(fbm2(vWP.xz * 0.08) * 6.0) - 0.5) - 0.45) * smoothstep(4.0, 20.0, above);
              mud *= 1.0 - 0.35 * cr;
              col = mix(sand, mud, smoothstep(-2.0, -12.0, d));
              gSheen = wetK * 0.6;
            }
            col = mix(col, col * vec3(0.62, 0.62, 0.66), wetK * 0.8);
            gRough = mix(0.97, 0.8, wetK);
            // tide line / dry crust
            col *= 1.0 - 0.08 * smoothstep(0.4, 0.0, abs(above - 1.8));
            // fused to glass: dark, glossy, cracked
            vec3 glass = vec3(0.12, 0.13, 0.11) * (0.7 + 0.5 * n);
            float gk = uGlass * smoothstep(-200.0, 0.0, d) * step(0.0, above);
            col = mix(col, glass, gk); gRough = mix(gRough, 0.75, gk);
          } else if (d < ${D.prom.toFixed(1)}) {
            col = vec3(0.55, 0.53, 0.5);                         // the low wall's top
          } else if (d < ${D.bike.toFixed(1)}) {
            // the wave mosaic: black and white bands running along the beach, waving
            float w = (d - 88.0 + 0.85 * sin(s * 6.2832 / 3.6)) / 1.7;
            float b = stripe(w, 0.0);
            col = mix(vec3(0.08, 0.08, 0.085), vec3(0.88, 0.87, 0.83), b) * (0.92 + 0.12 * n21(vWP.xz * 9.0));
            gRough = 0.8;
          } else if (d < ${D.ave.toFixed(1)}) {
            col = vec3(0.62, 0.17, 0.12) * (0.9 + 0.15 * n);     // the bike lane
            col = mix(col, vec3(0.9), (1.0 - step(0.08, abs(d - 107.0))) * step(0.5, fract(s / 3.0)));
          } else if (d < ${D.walk.toFixed(1)}) {
            // Avenida Atlântica: asphalt, lane lines, the mosaic median
            col = vec3(0.19, 0.19, 0.2) * (0.9 + 0.2 * n);
            float ln = 0.0;
            for (int i = 0; i < 4; i++) {
              float dl = i == 0 ? 111.6 : i == 1 ? 114.8 : i == 2 ? 125.6 : 128.8;
              ln += (1.0 - smoothstep(0.06, 0.1, abs(d - dl))) * step(0.55, fract(s / 9.0));
            }
            col = mix(col, vec3(0.85, 0.84, 0.8), clamp(ln, 0.0, 1.0) * 0.9);
            if (d > ${D.median[0].toFixed(1)} && d < ${D.median[1].toFixed(1)}) col = mix(vec3(0.1), vec3(0.85), stripe((d + 0.3 * sin(s * 2.0)) / 0.5, 0.0));
            // the curbs
            col = mix(col, vec3(0.75, 0.74, 0.7), 1.0 - step(0.15, min(abs(d - 108.0), abs(d - 133.0))));
          } else if (d < 300.0) {
            // the sidewalk along the towers (an abstract mosaic), then the city's streets
            float m = step(0.5, n21(vec2(s, d) * 0.9));
            col = d < 140.0 ? mix(vec3(0.15, 0.14, 0.13), vec3(0.85, 0.83, 0.78), m) : vec3(0.3, 0.29, 0.28) * (0.85 + 0.3 * n);
          } else {
            // the hills: Atlantic forest, granite showing on the steep faces
            vec3 forest = mix(vec3(0.06, 0.13, 0.05), vec3(0.16, 0.24, 0.09), fbm2(vWP.xz * 0.02)) * (0.8 + 0.4 * n21(vWP.xz * 0.3));
            vec3 rock = vec3(0.42, 0.4, 0.38) * (0.8 + 0.3 * n);
            col = mix(forest, rock, smoothstep(0.7, 0.5, vWN.y));
            col = mix(vec3(0.3, 0.29, 0.28), col, smoothstep(300.0, 360.0, d));
          }
          diffuseColor.rgb = col;
          ${new URLSearchParams(location.search).has('dbgground') ? 'diffuseColor.rgb = vec3(fract(d / 10.0), fract(s / 10.0), 0.0);' : ''}
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float Ts = surfT(normalize(vWN), 1.0);
          // under the water nothing glows; the sea floor just out of it is still cool (wet, steaming)
          float above = vWP.y - uSeaY;
          float dHere = length(vec2(${CX.toFixed(1)} - vWP.x, -vWP.z)) - ${RC.toFixed(1)};
          float dry = dHere < -2.0 ? smoothstep(0.0, 180.0, above) : smoothstep(0.0, 6.0, above);
          Ts = mix(max(uAmbK * 0.6, 300.0), Ts, dry);
          float ch = smoothstep(560.0, 950.0, Ts) * uCharK;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.045, 0.04) * (0.7 + 0.6 * fbm2(vWP.xz * 0.5)), ch * 0.85);
          // molten patches swim across the hot ground
          // a dark crust broken by glowing cracks (finer near you), drifting slowly as it flows
          vec2 cp = vWP.xz * 0.09 + vec2(uTime * 0.03, 0.0);
          float vein = 1.0 - smoothstep(0.0, 0.07, abs(fbm2(cp) - 0.5));
          float vein2 = 1.0 - smoothstep(0.0, 0.05, abs(fbm2(cp * 3.1 + 7.0) - 0.5));
          float molten = smoothstep(1500.0, 3500.0, Ts);
          float crust = mix(1.0, 0.1 + 1.8 * max(vein, vein2 * 0.7), smoothstep(900.0, 1400.0, Ts) * (1.0 - molten * 0.35));
          totalEmissiveRadiance += heatGlow(Ts) * uGlowGain * crust;
        }`);
  };
  mat.customProgramCacheKey = () => 'sun-ground-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}
