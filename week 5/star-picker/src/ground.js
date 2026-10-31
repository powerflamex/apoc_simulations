// The ground: one mesh, a polar grid around the camera's start (fine near you, coarse far off) with the heights from
// layout.groundY, painted in the fragment shader from x (inland) and z (along the beach): sand, the bike path, the
// walk, the grass strip, the coast road, the sidewalk, the city's streets, the bluff; the sea floor where the sea has
// gone (wet near the water, drying and cracking higher up). Proxima: rime and frost (uFrost). Heat: the shared char +
// glow patch; the sand fuses into dark glass (uGlass).
import * as THREE from 'three';
import { groundY, CAM0, D } from './layout.js';
import { H, HEAT_GLSL } from './heat.js';

export const GU = { uTime: { value: 0 }, uSeaY: { value: 0 }, uGlass: { value: 0 } };

export function makeGround(scene) {
  const NR = 430, NA = 600, R0 = 0.6, R1 = 70000;
  const pos = new Float32Array((NR + 1) * NA * 3);
  let k = 0;
  for (let i = 0; i <= NR; i++) {
    const r = R0 * Math.pow(R1 / R0, i / NR);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const x = CAM0.x + Math.sin(a) * r, z = CAM0.z - Math.cos(a) * r;
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
    Object.assign(shader.uniforms, GU, H);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${HEAT_GLSL}
        uniform float uTime; uniform float uSeaY; uniform float uGlass;
        varying vec3 vWP; varying vec3 vWN;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n21(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        // a dash pattern faded to its average where it gets finer than a pixel
        float dash(float x, float on) { float fw = max(fwidth(x), 1e-4); float s = smoothstep(on + fw, on - fw, fract(x)); return mix(s, on, smoothstep(0.2, 0.5, fw)); }
        float lineAt(float d, float c, float w) { float fw = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w - fw, w + fw, abs(d - c)); }
        float gRough = 0.92;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float d = vWP.x, s = -vWP.z;
          vec3 col;
          float n = fbm2(vWP.xz * 0.35);
          vec3 sand = vec3(0.84, 0.72, 0.55) * (0.9 + 0.16 * n) * (0.95 + 0.08 * n21(vWP.xz * 3.1));
          // footprints and ripples: a soft unevenness in the dry sand
          sand *= 0.96 + 0.06 * n21(vWP.xz * 1.3 + 4.0);
          float above = vWP.y - uSeaY;
          if (d < ${D.bike.toFixed(1)}) {
            col = sand;
            float wetK = 1.0 - smoothstep(0.0, 1.0, above);
            if (d < 0.0) {
              // the sea floor: wet mud near the water's edge, drying lighter and cracked higher up
              vec3 mud = mix(vec3(0.17, 0.16, 0.14), vec3(0.45, 0.41, 0.35), smoothstep(0.0, 30.0, above)) * (0.85 + 0.25 * n);
              float cr = smoothstep(0.03, 0.0, abs(fract(fbm2(vWP.xz * 0.08) * 6.0) - 0.5) - 0.45) * smoothstep(4.0, 20.0, above);
              mud *= 1.0 - 0.35 * cr;
              col = mix(sand, mud, smoothstep(-2.0, -14.0, d));
            }
            col = mix(col, col * vec3(0.6, 0.6, 0.64), wetK * 0.8);
            gRough = mix(0.97, 0.75, wetK);
            col *= 1.0 - 0.07 * smoothstep(0.4, 0.0, abs(above - 1.6));     // the tide line
            // fused to glass: dark, glossy
            vec3 glass = vec3(0.12, 0.13, 0.11) * (0.7 + 0.5 * n);
            float gk = uGlass * step(0.0, above);
            col = mix(col, glass, gk); gRough = mix(gRough, 0.6, gk);
          } else if (d < ${D.walk.toFixed(1)}) {
            // the bike path: dark asphalt, a dashed yellow centre line
            col = vec3(0.16, 0.16, 0.17) * (0.9 + 0.2 * n);
            col = mix(col, vec3(0.85, 0.7, 0.2), lineAt(d, 167.0, 0.06) * dash(s / 3.0, 0.5));
          } else if (d < ${D.grass.toFixed(1)}) {
            col = vec3(0.68, 0.65, 0.6) * (0.9 + 0.15 * n);      // the walk: pale concrete in slabs
            col *= 1.0 - 0.15 * lineAt(fract(s / 4.0), 0.5, 0.004);
          } else if (d < ${D.road.toFixed(1)}) {
            col = mix(vec3(0.16, 0.27, 0.08), vec3(0.28, 0.38, 0.12), fbm2(vWP.xz * 0.4));   // grass
          } else if (d < ${D.side.toFixed(1)}) {
            // the coast road: asphalt, dashed lane lines, a double yellow at the median, the curbs
            col = vec3(0.19, 0.19, 0.2) * (0.9 + 0.2 * n);
            float ln = (lineAt(d, 191.4, 0.07) + lineAt(d, 204.6, 0.07)) * dash(s / 9.0, 0.4);
            col = mix(col, vec3(0.86, 0.85, 0.8), clamp(ln, 0.0, 1.0) * 0.9);
            col = mix(col, vec3(0.85, 0.7, 0.2), lineAt(d, 197.65, 0.06) + lineAt(d, 198.35, 0.06));
            col = mix(col, vec3(0.75, 0.74, 0.7), lineAt(d, 186.1, 0.15) + lineAt(d, 209.9, 0.15));
          } else {
            // the sidewalk, then the city's streets; north of the pier the bluff's earth face, scrub on top
            col = d < 216.0 ? vec3(0.7, 0.68, 0.64) * (0.9 + 0.1 * n) : vec3(0.3, 0.29, 0.28) * (0.85 + 0.3 * n);
            float steep = smoothstep(0.85, 0.6, vWN.y);
            vec3 bluff = mix(vec3(0.55, 0.45, 0.33), vec3(0.4, 0.34, 0.25), fbm2(vWP.xz * 0.15 + vWP.y * 0.2)) * (0.85 + 0.3 * n);
            bluff = mix(bluff, vec3(0.22, 0.28, 0.12), smoothstep(0.55, 0.8, fbm2(vWP.xz * 0.3 + 2.0)) * 0.6);
            col = mix(col, bluff, steep);
          }
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float above = vWP.y - uSeaY;
          // Proxima: rime over everything, sparkling frost crystals, the wet sand frozen grey-white
          float fr = uFrost * (0.75 + 0.25 * fbm2(vWP.xz * 1.7)) * step(-0.05, above);
          vec3 rime = vec3(0.86, 0.91, 0.97) * (0.92 + 0.12 * n21(vWP.xz * 9.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, rime, fr * 0.85);
          roughnessFactor = mix(roughnessFactor, 0.55, fr);
          float Ts = surfT(normalize(vWN), 1.0);
          // under the water nothing glows; the sea floor just out of it is still cool (wet, steaming)
          float dry = vWP.x < -2.0 ? smoothstep(0.0, 120.0, above) : smoothstep(0.0, 4.0, above);
          Ts = mix(max(uAmbK * 0.6, 300.0), Ts, dry);
          float ch = smoothstep(560.0, 950.0, Ts) * uCharK;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.045, 0.04) * (0.7 + 0.6 * fbm2(vWP.xz * 0.5)), ch * 0.85);
          // a dark crust broken by glowing cracks, drifting slowly as it flows
          vec2 cp = vWP.xz * 0.09 + vec2(uTime * 0.03, 0.0);
          float vein = 1.0 - smoothstep(0.0, 0.07, abs(fbm2(cp) - 0.5));
          float vein2 = 1.0 - smoothstep(0.0, 0.05, abs(fbm2(cp * 3.1 + 7.0) - 0.5));
          float molten = smoothstep(1500.0, 3500.0, Ts);
          float crust = mix(1.0, 0.1 + 1.8 * max(vein, vein2 * 0.7), smoothstep(900.0, 1400.0, Ts) * (1.0 - molten * 0.35));
          totalEmissiveRadiance += heatGlow(Ts) * uGlowGain * crust;
        }`);
  };
  mat.customProgramCacheKey = () => 'star-ground-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}
