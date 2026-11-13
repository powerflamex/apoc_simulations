// The hotels and apartments along the coast road (and the city behind): instanced unit boxes (base at y = 0), local +x
// along the beach, local +z facing the sea (west). The look is one material patch: balconies floor by floor (white slabs,
// glass rails, sliding doors), punched windows, fins or curtain glass by style; shops and lobbies at street level;
// plain side walls; flat roofs with water tanks. Heat: the sun-facing walls char and then glow (heat.js); windows
// break (uWin) and the rooms behind them burn (flickering orange); later the towers sag and fall (aK.x: how far
// gone, set per frame) into glowing rubble.
import * as THREE from 'three';
import { TOWERS, landY } from './layout.js';
import { H, HEAT_GLSL } from './heat.js';

export const BU = { uTime: { value: 0 }, uWin: { value: 0 }, uFire: { value: 0 }, uLights: { value: 1 }, uWhiteB: { value: 0 }, uNight: { value: 0 }, uMelt: { value: 0 } };

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float style = floor(vB.w + 0.5);
    float seed = vS.x;
    float gone = vK.x;                              // 0 standing .. 1 a heap of rubble
    vec3 base = diffuseColor.rgb;
    vec3 col = base;
    float emis = 0.0;
    vec3 V = normalize(vWP - cameraPosition);
    vec3 N = normalize(vWN);
    float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, N)), 3.0);
    vec3 R = reflect(V, N);
    vec3 skyR = mix(vec3(0.75, 0.8, 0.88), vec3(0.3, 0.5, 0.8), smoothstep(0.0, 0.5, R.y)) * mix(1.0, 1.6, uWhiteB);
    vec3 glassC = mix(vec3(0.04, 0.05, 0.06), skyR * 0.7, 0.5 * fres);
    bool faceX = abs(vON.x) > 0.5, faceZ = abs(vON.z) > 0.5;
    bool front = vON.z > 0.5;
    float y = vLoc.y * vB.z;                         // height up the wall (m), the tower's own
    float W = faceX ? vB.y : vB.x;
    float u = ((faceX ? vLoc.z : vLoc.x) + 0.5) * W;
    vec2 fw = vec2(fwidth(u), fwidth(y)) + 1e-4;
    float far = smoothstep(0.1, 0.4, max(fw.x, fw.y));
    float G = 4.6, FH = 2.95;
    float fy = (y - G) / FH, fi = floor(fy), ff = fract(fy);
    float top = vB.z;
    float okF = step(0.0, fy) * step(y, top - 1.2);
    float fire = 0.0;
    if (faceX || faceZ) {
      if (front) {
        if (style < 0.5 || style > 2.5) {
          // balconies: a white slab at each floor, a glass rail, sliding doors behind (deep shadow under the slab)
          float slab = (1.0 - smoothstep(0.0, 0.05 + fw.y, ff)) + smoothstep(0.93 - fw.y, 0.95, ff);
          float rail = smoothstep(0.08, 0.1, ff) * (1.0 - smoothstep(0.38, 0.4, ff));
          float cw = W / max(2.0, floor(W / 3.4));
          float post = 1.0 - smoothstep(0.03, 0.05 + fw.x / cw, abs(fract(u / cw) - 0.5) * 2.0 - 0.9);
          vec3 inner = mix(glassC, base * 0.35, 0.3) * (0.6 + 0.4 * smoothstep(0.4, 0.9, ff));
          col = mix(inner, base * 1.04, clamp(slab + post * 0.8, 0.0, 1.0));
          col = mix(col, mix(col, skyR * 0.8, 0.35), rail * (1.0 - slab) * (style > 2.5 ? 0.8 : 0.5));
          col = mix(base * 0.8, col, okF);
          if (style > 2.5) col = mix(col, mix(glassC, skyR * 0.8, 0.3), (1.0 - slab) * okF * 0.6);
        } else if (style < 1.5) {
          // punched windows in a plain wall
          float cw = W / max(2.0, floor(W / 2.6));
          vec2 f = vec2(fract(u / cw), ff);
          vec2 a = vec2(0.22, 0.25), b = vec2(0.78, 0.85);
          vec2 s2 = smoothstep(a - fw / vec2(cw, FH), a + fw / vec2(cw, FH), f) * (1.0 - smoothstep(b - fw / vec2(cw, FH), b + fw / vec2(cw, FH), f));
          float win = s2.x * s2.y * okF;
          col = mix(base * (0.94 + 0.06 * fract(seed * 37.0)), glassC, win * (1.0 - far * 0.5));
          col = mix(col, base * 0.8, far * okF * 0.3);
        } else {
          // vertical fins between tall windows
          float cw = 1.6;
          float fin = 1.0 - smoothstep(0.12, 0.12 + fw.x / cw, abs(fract(u / cw) - 0.5) * 2.0 - 0.75);
          col = mix(glassC, base, clamp(fin + (1.0 - smoothstep(0.0, 0.07, ff)), 0.0, 1.0));
          col = mix(base * 0.85, col, okF);
        }
        // street level: shops and lobbies (lit, awnings), the entrance
        float shop = step(0.35, y) * step(y, G - 0.9);
        float sw = fract(u / 6.0);
        vec3 awn = mix(vec3(0.75, 0.2, 0.15), vec3(0.15, 0.35, 0.6), step(0.5, fract(seed * 13.0 + floor(u / 6.0) * 0.37)));
        col = mix(col, mix(vec3(0.06), vec3(0.85, 0.7, 0.5), 0.45 * uLights), shop * step(0.05, sw) * step(sw, 0.95));
        emis += shop * 0.35 * uLights * (1.0 - uWin);
        col = mix(col, awn, step(G - 1.2, y) * step(y, G - 0.6) * step(0.04, sw) * step(sw, 0.96));
        col = mix(col, base * 0.75, step(G - 0.6, y) * step(y, G));
        // at dusk (Proxima) the rooms light up
        float rndL = fract(sin(dot(vec3(floor(u / 3.0), fi, seed * 53.0), vec3(39.3468, 11.135, 83.155))) * 43758.5453);
        emis += okF * step(0.45, rndL) * uNight * (0.6 + 0.6 * rndL) * (1.0 - uWin) * smoothstep(0.15, 0.85, ff) * (1.0 - smoothstep(0.85, 0.95, ff));
        // broken windows: the rooms behind them burn
        float rnd = fract(sin(dot(vec3(floor(u / 3.4), fi, seed * 91.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float broke = step(rnd, uWin) * okF;
        float flick = 0.6 + 0.4 * sin(uTime * (9.0 + rnd * 7.0) + rnd * 40.0) * sin(uTime * 5.3 + rnd * 11.0);
        fire = broke * step(rnd, uFire) * flick;
        col = mix(col, vec3(0.02, 0.015, 0.01), broke * 0.6 * (1.0 - far * 0.5));
      } else {
        // the side walls and the backs: plain, a column of small windows
        float win = step(0.4, fract(u / 4.0)) * step(fract(u / 4.0), 0.6) * step(0.3, ff) * step(ff, 0.75) * okF;
        col = mix(base * 0.93, glassC, win * (1.0 - far) * 0.8);
      }
    } else if (vON.y > 0.5) {
      // flat roofs: grey, a parapet, a water tank
      vec2 lu = vLoc.xz + 0.5;
      col = vec3(0.45, 0.44, 0.42) * (0.85 + 0.25 * fract(sin(dot(floor(vWP.xz * 0.7), vec2(12.9, 78.2))) * 437.5));
      col = mix(col, base, 1.0 - step(0.04, min(min(lu.x, 1.0 - lu.x), min(lu.y, 1.0 - lu.y))));
    }
    // Aldebaran: the walls melt: a dark crust with glowing runs pouring down it, more on each tower as it goes
    float mk = uMelt * (0.55 + 0.45 * fract(seed * 5.3));
    float lava = 0.0;
    if (mk > 0.0 && (faceX || faceZ)) {
      float run = nm(vec2(u * 0.55 + seed * 31.0, y * 0.035 + uTime * 0.35)) * 0.7 + nm(vec2(u * 2.1, y * 0.12 + uTime * 0.6)) * 0.3;
      lava = smoothstep(0.62 - 0.3 * mk, 0.78 - 0.3 * mk, run) * smoothstep(0.0, 0.4, mk) * (1.0 - far * 0.4);
      col = mix(col, vec3(0.07, 0.05, 0.04), smoothstep(0.0, 0.6, mk) * 0.85);
    }
    // heat: char and glow (sun-facing walls first)
    float Ts = surfT(N, 1.0);
    float ch = smoothstep(560.0, 1000.0, Ts) * uCharK;
    col = mix(col, vec3(0.06, 0.05, 0.045) * (0.8 + 0.4 * fract(seed * 7.0)), ch * 0.9);
    // fallen: a heap of glowing rubble
    float rub = smoothstep(0.3, 0.9, gone);
    float nn = fract(sin(dot(floor(vWP * 1.3), vec3(12.9, 78.2, 45.1))) * 43758.5);
    col = mix(col, vec3(0.12, 0.1, 0.09) * (0.6 + 0.8 * nn), rub);
    col = frosted(col, N);
    diffuseColor.rgb = col;
    totalEmissiveRadiance += emis * vec3(1.0, 0.75, 0.45);
    totalEmissiveRadiance += vec3(1.0, 0.42, 0.1) * fire * 2.2;
    totalEmissiveRadiance += vec3(1.0, 0.38, 0.07) * lava * 3.2 + vec3(1.0, 0.2, 0.03) * smoothstep(0.2, 0.7, mk) * 0.25;
    totalEmissiveRadiance += heatGlow(Ts) * uGlowGain * (1.0 + 0.6 * rub * nn);
  }
`;

export function makeBuildings(scene) {
  const n = TOWERS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aB = new Float32Array(n * 4), aS = new Float32Array(n * 2), aK = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, H, BU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aB; attribute vec2 aS; attribute vec2 aK;
        varying vec3 vLoc; varying vec4 vB; varying vec2 vS; varying vec2 vK; varying vec3 vWP; varying vec3 vWN; varying vec3 vON;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLoc = position; vON = normal; vB = aB; vS = aS; vK = aK;
        vWP = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / (vec3(aB.x, aB.z, aB.y) * vec3(aB.x, aB.z, aB.y))));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${HEAT_GLSL}
        uniform float uTime; uniform float uWin; uniform float uFire; uniform float uLights; uniform float uWhiteB; uniform float uNight; uniform float uMelt;
        float hm(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float nm(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hm(i), hm(i + vec2(1, 0)), f.x), mix(hm(i + vec2(0, 1)), hm(i + vec2(1, 1)), f.x), f.y); }
        varying vec3 vLoc; varying vec4 vB; varying vec2 vS; varying vec2 vK; varying vec3 vWP; varying vec3 vWN; varying vec3 vON;`)
      .replace('#include <emissivemap_fragment>', LOOK);
  };
  mat.customProgramCacheKey = () => 'star-towers-v1';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const col = new THREE.Color();
  const base = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  TOWERS.forEach((t, i) => {
    const w = t.w, cx = t.x + t.dep / 2, cz = t.z + w / 2;
    const yaw = -Math.PI / 2;                    // local +z (the front) faces west, out to sea
    const y = Math.min(landY(t.x + 1, cz), landY(t.x + t.dep, cz)) - 0.4;
    base.push({ x: cx, z: cz, y, yaw, w, dep: t.dep, h: t.h, row: t.row });
    aB.set([w, t.dep, t.h, t.style], i * 4);
    aS.set([t.seed, t.row], i * 2);
    mesh.setColorAt(i, col.set(t.col));
  });
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 2));
  geo.setAttribute('aK', aK);
  scene.add(mesh);
  // gone: 0 standing .. 1 rubble. Sagging: the top drops and leans away from the Sun (toward land); falling: it
  // slumps into a heap twice its footprint
  function place(i, gone, lean) {
    const b = base[i];
    const sag = Math.min(gone / 0.3, 1), fall = Math.max(0, (gone - 0.3) / 0.7);
    const hh = b.h * (1 - 0.12 * sag) * (1 - 0.86 * Math.pow(fall, 0.8));
    const spread = 1 + 0.5 * fall;
    q.setFromAxisAngle(up, b.yaw);
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -lean * sag * (1 - fall) * 0.06);
    q.multiply(tilt);
    m4.compose(p.set(b.x, b.y, b.z), q, sc.set(b.w * spread, hh, b.dep * spread));
    mesh.setMatrixAt(i, m4);
    aK.setX(i, gone);
  }
  TOWERS.forEach((t, i) => place(i, 0, 0));
  return {
    mesh, base,
    frame(goneOf) {
      for (let i = 0; i < base.length; i++) place(i, goneOf(i), 1);
      mesh.instanceMatrix.needsUpdate = true;
      aK.needsUpdate = true;
    },
  };
}
