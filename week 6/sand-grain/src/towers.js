// The wall of white condos behind the road, and the towers across the bay: instanced unit boxes (base at y = 0), local +x
// along the street, local +z the front. One material patch: balconies floor by floor, punched windows or fins by style, shops at
// street level. When the blasts reach them: every sea-facing window blazes with the blast's light (uLit), the glass goes
// (uWin: dark holes), the rooms burn (uFire), and later the towers sag and drop into the dust (aK.x: how far gone).
import * as THREE from 'three';
import { TOWERS } from './layout.js';

export const BU = { uTime: { value: 0 }, uWin: { value: 0 }, uFire: { value: 0 }, uLit: { value: 0 } };

const LOOK = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float style = floor(vB.w + 0.5), seed = vS.x, gone = vK.x;
    vec3 base = diffuseColor.rgb, col = base;
    float emis = 0.0;
    vec3 V = normalize(vWP - cameraPosition), N = normalize(vWN);
    float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, N)), 3.0);
    vec3 R = reflect(V, N);
    vec3 skyR = mix(vec3(0.75, 0.84, 0.94), vec3(0.2, 0.42, 0.8), smoothstep(0.0, 0.5, R.y));
    vec3 glassC = mix(vec3(0.05, 0.08, 0.1), skyR * 0.75, 0.55 * fres);
    bool faceX = abs(vON.x) > 0.5, faceZ = abs(vON.z) > 0.5, front = vON.z > 0.5;
    float y = vLoc.y * vB.z, W = faceX ? vB.y : vB.x;
    float u = ((faceX ? vLoc.z : vLoc.x) + 0.5) * W;
    vec2 fw = vec2(fwidth(u), fwidth(y)) + 1e-4;
    float far = smoothstep(0.1, 0.4, max(fw.x, fw.y));
    float G = 5.0, FH = 3.1;
    float fy = (y - G) / FH, fi = floor(fy), ff = fract(fy);
    float okF = step(0.0, fy) * step(y, vB.z - 1.2);
    float win = 0.0, fire = 0.0;
    if (faceX || faceZ) {
      if (front || style > 1.5) {
        if (style < 0.5 || style > 2.5) {
          // balconies: a white slab at each floor, a glass rail, sliding doors behind
          float slab = (1.0 - smoothstep(0.0, 0.05 + fw.y, ff)) + smoothstep(0.93 - fw.y, 0.95, ff);
          float cw = W / max(2.0, floor(W / 3.6));
          float post = 1.0 - smoothstep(0.03, 0.05 + fw.x / cw, abs(fract(u / cw) - 0.5) * 2.0 - 0.9);
          vec3 inner = mix(glassC, base * 0.35, 0.3) * (0.6 + 0.4 * smoothstep(0.4, 0.9, ff));
          col = mix(inner, base * 1.04, clamp(slab + post * 0.8, 0.0, 1.0));
          col = mix(base * 0.8, col, okF);
          win = (1.0 - clamp(slab + post, 0.0, 1.0)) * okF;
        } else if (style < 1.5) {
          float cw = W / max(2.0, floor(W / 2.8));
          vec2 f = vec2(fract(u / cw), ff);
          vec2 a = vec2(0.2, 0.22), b = vec2(0.8, 0.86);
          vec2 s2 = smoothstep(a - fw / vec2(cw, FH), a + fw / vec2(cw, FH), f) * (1.0 - smoothstep(b - fw / vec2(cw, FH), b + fw / vec2(cw, FH), f));
          win = s2.x * s2.y * okF;
          col = mix(base * (0.94 + 0.06 * fract(seed * 37.0)), glassC, win * (1.0 - far * 0.5));
          col = mix(col, base * 0.8, far * okF * 0.3);
        } else {
          float cw = 1.7;
          float fin = 1.0 - smoothstep(0.12, 0.12 + fw.x / cw, abs(fract(u / cw) - 0.5) * 2.0 - 0.75);
          win = (1.0 - clamp(fin + (1.0 - smoothstep(0.0, 0.07, ff)), 0.0, 1.0)) * okF;
          col = mix(glassC, base, clamp(fin + (1.0 - smoothstep(0.0, 0.07, ff)), 0.0, 1.0));
          col = mix(base * 0.85, col, okF);
        }
        float shop = step(0.35, y) * step(y, G - 0.9);
        float sw = fract(u / 6.0);
        vec3 awn = mix(vec3(0.85, 0.25, 0.18), vec3(0.1, 0.45, 0.7), step(0.5, fract(seed * 13.0 + floor(u / 6.0) * 0.37)));
        col = mix(col, mix(vec3(0.06), vec3(0.85, 0.7, 0.5), 0.4), shop * step(0.05, sw) * step(sw, 0.95));
        col = mix(col, awn, step(G - 1.2, y) * step(y, G - 0.6) * step(0.04, sw) * step(sw, 0.96));
      } else {
        float wi = step(0.4, fract(u / 4.0)) * step(fract(u / 4.0), 0.6) * step(0.3, ff) * step(ff, 0.75) * okF;
        col = mix(base * 0.93, glassC, wi * (1.0 - far) * 0.8);
      }
      // the glass goes floor by floor, the rooms behind it burn
      float rnd = fract(sin(dot(vec3(floor(u / 3.4), fi, seed * 91.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float broke = step(rnd, uWin) * okF * win;
      float flick = 0.6 + 0.4 * sin(uTime * (9.0 + rnd * 7.0) + rnd * 40.0) * sin(uTime * 5.3 + rnd * 11.0);
      fire = broke * step(rnd, uFire) * flick;
      col = mix(col, vec3(0.015, 0.012, 0.01), broke * 0.85 * (1.0 - far * 0.4));
      // the blast's light in every window that's left
      emis = win * (1.0 - broke) * uLit * (0.5 + 0.6 * rnd) ;
    } else if (vON.y > 0.5) {
      col = vec3(0.45, 0.44, 0.42);
    }
    float rub = smoothstep(0.3, 0.9, gone);
    col = mix(col, vec3(0.13, 0.11, 0.1), rub);
    diffuseColor.rgb = col;
    totalEmissiveRadiance += emis * vec3(3.2, 1.9, 0.9);
    totalEmissiveRadiance += vec3(1.0, 0.42, 0.1) * fire * 3.0;
  }
`;

export function makeTowers(scene) {
  const n = TOWERS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aB = new Float32Array(n * 4), aS = new Float32Array(n * 2), aK = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, BU);
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
        uniform float uTime; uniform float uWin; uniform float uFire; uniform float uLit;
        varying vec3 vLoc; varying vec4 vB; varying vec2 vS; varying vec2 vK; varying vec3 vWP; varying vec3 vWN; varying vec3 vON;`)
      .replace('#include <emissivemap_fragment>', LOOK);
  };
  mat.customProgramCacheKey = () => 'sand-towers-v1';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const col = new THREE.Color();
  const base = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  TOWERS.forEach((t, i) => {
    const cx = t.x + t.dep / 2, cz = t.z + t.w / 2;
    base.push({ x: cx, z: cz, yaw: t.yaw, w: t.w, dep: t.dep, h: t.h, seed: t.seed, row: t.row });
    aB.set([t.w, t.dep, t.h, t.style], i * 4);
    aS.set([t.seed, t.row], i * 2);
    mesh.setColorAt(i, col.set(t.col));
  });
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 2));
  geo.setAttribute('aK', aK);
  scene.add(mesh);
  function place(i, gone) {
    const b = base[i];
    const hh = b.h * (1 - 0.9 * Math.pow(gone, 1.3));
    const spread = 1 + 0.4 * gone;
    q.setFromAxisAngle(up, b.yaw);
    m4.compose(p.set(b.x, -0.4, b.z), q, sc.set(b.w * spread, hh, b.dep * spread));
    mesh.setMatrixAt(i, m4);
    aK.setX(i, gone);
  }
  TOWERS.forEach((t, i) => place(i, 0));
  return {
    mesh, base,
    frame(goneOf) {
      for (let i = 0; i < base.length; i++) place(i, goneOf(base[i]));
      mesh.instanceMatrix.needsUpdate = true;
      aK.needsUpdate = true;
    },
  };
}
