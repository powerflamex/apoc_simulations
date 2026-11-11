// The seabed: one lit material, patched so every shot gets its own ground (golden sand, rippled wet sand, pale shelf
// rock, mud, black lava, ooze, trench rock). It is wet wherever the sea has just left: darker, glossy, mirroring the sky,
// with puddles in the hollows; steep faces turn to banded rock, and water still runs down them in white streaks.
// Also the grid both the seabed and the water over it are built on (a fan, finest where you walk).
import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

// shared by every seabed / prop material: the time, the sea level now (the shot's own metres), the light
export const GU = {
  uTime: { value: 0 }, uLevel: { value: 0 },
  uSun: { value: new THREE.Vector3(0, 1, 0) },
  uSkyHi: { value: new THREE.Color(0.05, 0.2, 0.72) }, uSkyLo: { value: new THREE.Color(0.4, 0.66, 0.98) },
  // deep down (the trench): little light reaches the floor except where a shaft of sun lands (x, z, radius)
  uDeep: { value: 0 }, uDeepFloor: { value: 0 }, uShaft: { value: new THREE.Vector3(0, 0, 10) },
};
export const DEEP_GLSL = /* glsl */ `
uniform float uDeep; uniform float uDeepFloor; uniform vec3 uShaft;
float deepK(vec3 wp) {
  if (uDeep <= 0.0) return 1.0;
  float hgt = wp.y - uDeepFloor;
  float ao = mix(0.3, 1.0, smoothstep(0.0, 900.0, hgt));
  float r = length(wp.xz - uShaft.xy);
  float sh = (1.0 - smoothstep(uShaft.z * 0.55, uShaft.z, r)) * (1.0 - smoothstep(6.0, 60.0, hgt));
  return mix(1.0, mix(ao, 1.9, sh), uDeep);
}
`;

const C = (v) => new THREE.Color(v);
// o: colA/colB (two tones mixed in big patches), rock (steep faces), patch/patchAmt/patchS/patchT (stains: algae, coral,
// sulphur), scale, ripple (sand ripples 0..1), wet (0..1), dry (above this height the sand is dry), falls (water running
// down steep faces 0..1), pebble (dark stones 0..1), rough
export function groundMaterial(o = {}) {
  const u = {
    gColA: { value: C(o.colA ?? 0xc8b48a) }, gColB: { value: C(o.colB ?? 0xb09a70) }, gRock: { value: C(o.rock ?? 0x6a6258) },
    gPatch: { value: C(o.patch ?? 0x4a6a30) }, gPatchAmt: { value: o.patchAmt ?? 0 }, gPatchS: { value: o.patchS ?? 0.08 }, gPatchT: { value: o.patchT ?? 0.55 },
    gScale: { value: o.scale ?? 0.03 }, gRipple: { value: o.ripple ?? 0 }, gWet: { value: o.wet ?? 1 }, gDry: { value: o.dry ?? 1e6 },
    gFalls: { value: o.falls ?? 0 }, gPebble: { value: o.pebble ?? 0 }, gSteep: { value: new THREE.Vector2(o.steep0 ?? 0.86, o.steep1 ?? 0.6) },
    gStrata: { value: o.strata ?? 0.5 }, gSurf: { value: o.surf ?? 0 }, gFallS: { value: o.fallS ?? 1 }, gLayer: { value: o.layer ?? 0.22 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.rough ?? 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, GU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 gWP; varying vec3 gNW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ngWP = (modelMatrix * vec4(transformed, 1.0)).xyz; gNW = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 gWP; varying vec3 gNW;
        uniform float uTime; uniform float uLevel; uniform vec3 uSkyHi; uniform vec3 uSkyLo;
        uniform vec3 gColA; uniform vec3 gColB; uniform vec3 gRock; uniform vec3 gPatch; uniform float gPatchAmt; uniform float gPatchS; uniform float gPatchT;
        uniform float gScale; uniform float gRipple; uniform float gWet; uniform float gDry; uniform float gFalls; uniform float gPebble; uniform vec2 gSteep;
        uniform float gStrata; uniform float gSurf; uniform float gFallS; uniform float gLayer;
        ${NOISE_GLSL}
        ${DEEP_GLSL}
        float gGloss = 0.0;
        float rippleH(vec2 p) {
          float w = n2(p * 0.07) * 6.0;
          return sin(p.y * 5.2 + w + 1.3 * sin(p.x * 0.9 + w)) * 0.5 + 0.5;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 nw = normalize(gNW);
          float dist = length(gWP - cameraPosition);
          float big = fbm2(gWP.xz * gScale);
          float fine = fbm2(gWP.xz * gScale * 9.0 + 11.0);
          vec3 base = mix(gColA, gColB, smoothstep(0.32, 0.68, big)) * (0.86 + 0.28 * fine);
          float pm = smoothstep(gPatchT, gPatchT + 0.1, fbm2(gWP.xz * gPatchS + 37.0));
          base = mix(base, gPatch * (0.8 + 0.4 * fine), pm * gPatchAmt);
          // dark stones
          float peb = smoothstep(0.82, 0.87, n2(gWP.xz * 7.0)) * gPebble * smoothstep(50.0, 14.0, dist);
          base = mix(base, vec3(0.05, 0.05, 0.055), peb);
          // steep faces: banded rock
          float steep = smoothstep(gSteep.x, gSteep.y, nw.y);
          // layers of uneven thickness, each its own shade, a dark line under each, broken by joints
          float ly = gWP.y * gLayer + 1.3 * n2(gWP.xz * 0.013) + 0.35 * n2(gWP.xz * 0.11);
          float layer = floor(ly), lf = fract(ly);
          float lcol = h2(vec2(layer, 7.3));
          float crack = smoothstep(0.0, 0.1, lf) * (1.0 - 0.5 * smoothstep(0.9, 1.0, lf));
          float joint = smoothstep(0.3, 0.42, abs(n2(vec2((gWP.x + gWP.z * 0.6) * 0.3 + lcol * 9.0, layer * 3.1)) - 0.5) * 2.0 + 0.3);
          float crag = fbm2(vec2(gWP.x * 0.21 + gWP.z * 0.13, gWP.y * 0.33));
          vec3 rock = gRock * mix(1.0, (0.66 + 0.6 * lcol) * (0.72 + 0.28 * crack), gStrata) * (0.78 + 0.44 * crag) * mix(vec3(1.0), vec3(1.06, 0.98, 0.9), lcol);
          base = mix(base, rock, steep);
          // wet where the sea has just left; dry sand above the old shoreline
          float wet = gWet * (1.0 - smoothstep(gDry - 0.25, gDry + 0.25, gWP.y + 0.5 * (big - 0.5)));
          float above = gWP.y - uLevel;
          float film = smoothstep(0.6, 0.0, above) * (1.0 - steep);
          float pud = smoothstep(0.35, 0.31, fbm2(gWP.xz * 0.27 + 5.0)) * (1.0 - steep) * smoothstep(0.985, 0.999, nw.y);
          base = mix(base, pow(base, vec3(1.35)) * 0.78, wet);
          base = mix(base, base * 0.45 + mix(uSkyHi, uSkyLo, 0.4) * 0.3, pud * wet);
          // water still running down the steep faces
          float chan = smoothstep(0.6, 0.74, n2(vec2((gWP.x + gWP.z * 0.7) * 0.045 * gFallS, 3.7)));
          float run = n2(vec2((gWP.x + gWP.z * 0.7) * 0.5 * gFallS, gWP.y * 0.07 * gFallS + uTime * 1.6));
          float falls = gFalls * steep * chan * smoothstep(0.25, 0.75, run);
          base = mix(base, vec3(0.92, 0.96, 1.0), falls * 0.8);
          // surf where the sea still stands against it
          float surf = gSurf > 0.0 ? smoothstep(gSurf, 0.0, above) * step(0.0, above + gSurf * 0.3) * (0.55 + 0.45 * n2(vec2((gWP.x + gWP.z) * 0.02 * gFallS, uTime * 1.2))) : 0.0;
          base = mix(base, vec3(0.95, 0.97, 1.0), surf);
          diffuseColor.rgb = base * deepK(gWP);
          gGloss = wet * max(pud, max(film * 0.7, 0.26)) * (1.0 - falls) * (1.0 - 0.75 * steep);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.16, gGloss);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          // craggy rock: the steep faces catch the light unevenly
          float steepN = smoothstep(gSteep.x, gSteep.y, gNW.y);
          if (steepN > 0.01) {
            vec2 rp = vec2(gWP.x + gWP.z * 0.7, gWP.y) * 0.4 * gFallS;
            vec3 rn = vec3(n2(rp), n2(rp + 5.3), n2(rp + 9.1)) - 0.5 + 0.5 * (vec3(n2(rp * 3.1), n2(rp * 3.1 + 5.3), n2(rp * 3.1 + 9.1)) - 0.5);
            normal = normalize(normal + (viewMatrix * vec4(rn, 0.0)).xyz * 0.6 * steepN);
          }
        }
        if (gRipple > 0.0) {
          float dist = length(gWP - cameraPosition);
          float amp = gRipple * smoothstep(45.0, 6.0, dist) * smoothstep(0.9, 0.99, gNW.y);
          if (amp > 0.001) {
            float e = 0.02;
            float h0 = rippleH(gWP.xz), hx = rippleH(gWP.xz + vec2(e, 0.0)), hz = rippleH(gWP.xz + vec2(0.0, e));
            vec3 nw2 = normalize(gNW - amp * 0.05 * vec3(hx - h0, 0.0, hz - h0) / e);
            normal = normalize((viewMatrix * vec4(nw2, 0.0)).xyz);
          }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // the wet seabed mirrors the sky at grazing angles
          vec3 V = normalize(cameraPosition - gWP);
          float fr = pow(1.0 - clamp(dot(normalize(gNW), V), 0.0, 1.0), 5.0);
          totalEmissiveRadiance += mix(uSkyLo, uSkyHi, 0.6) * fr * gGloss * 0.85 * deepK(gWP) * deepK(gWP);
        }`);
  };
  mat.customProgramCacheKey = () => 'ground';
  mat.userData.u = u;
  return mat;
}

// The grid: a fan from just behind you out to the horizon, finest along your path. h(x, z) gives the seabed height.
// rows: optional explicit z of every row (then zNear/zFar/p are ignored); warp(x, z) -> [x, z] bends the grid (a cliff edge).
export function makeGrid(h, { zNear = 16, zFar = -6000, w0 = 46, w1 = 7000, nx = 110, nz = 170, p = 2.5, rows = null, warp = null, x0 = 0 } = {}) {
  const NZ = rows ? rows.length - 1 : nz;
  const pos = new Float32Array((nx + 1) * (NZ + 1) * 3), nor = new Float32Array(pos.length), aH = new Float32Array((nx + 1) * (NZ + 1));
  const wpos = new Float32Array(pos.length);
  const zOf = (j) => (rows ? rows[j] : zNear + (zFar - zNear) * Math.pow(j / nz, p));
  let k = 0;
  for (let j = 0; j <= NZ; j++) {
    const z0 = zOf(j);
    const t = clamp01((zNear - z0) / (zNear - zFar));
    const hw = w0 + (w1 - w0) * Math.pow(t, rows ? 1 : 1) * (rows ? 1 : Math.pow(t, 0.2));
    for (let i = 0; i <= nx; i++, k++) {
      const s = (i / nx) * 2 - 1;
      let x = x0 + hw * (0.35 * s + 0.65 * s * Math.abs(s)), z = z0;
      if (warp) [x, z] = warp(x, z);
      const y = h(x, z);
      const e = 0.25 + 0.01 * Math.hypot(x, z);
      const dx = (h(x + e, z) - h(x - e, z)) / (2 * e), dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
      const il = 1 / Math.hypot(dx, 1, dz);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      nor[k * 3] = -dx * il; nor[k * 3 + 1] = il; nor[k * 3 + 2] = -dz * il;
      wpos[k * 3] = x; wpos[k * 3 + 1] = 0; wpos[k * 3 + 2] = z;
      aH[k] = y;
    }
  }
  const idx = new Uint32Array(nx * NZ * 6);
  let q = 0;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
  }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ground.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  ground.setIndex(new THREE.BufferAttribute(idx, 1));
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  water.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  water.setIndex(new THREE.BufferAttribute(idx, 1));
  return { ground, water };
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
