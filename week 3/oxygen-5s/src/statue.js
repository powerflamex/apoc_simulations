// Christ the Redeemer: 30 m tall on an 8 m pedestal, arms 28 m across, facing east over the bay; reinforced concrete
// covered in pale soapstone tiles. Built from simple shapes (a lathed robe, tapered arms, the sleeves' drape, the
// head bowed a little). When the oxygen goes, the concrete and the soapstone are loose powder: every bit of it falls
// freely from where it was (d = 1/2 g t^2) onto a growing heap at its feet, spreading as it lands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const STATUE = { base: 704.5, ped: 8, h: 30 };      // terrace level, pedestal height, statue height
export const SU = { uFall: { value: 0 }, uDust: { value: 0 }, uTime: { value: 0 }, uSkin: { value: 0 } };

function robe() {
  // radius against height (the statue's own metres, from its feet): a long robe, a narrow waist, broad shoulders
  const prof = [[3.2, 0], [3.0, 2], [2.8, 6], [2.55, 10], [2.45, 13], [2.6, 16], [3.0, 19], [3.45, 21.6], [3.2, 22.6], [1.2, 23.4], [0.95, 24.2], [0, 24.3]];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 28).scale(1, 1, 0.62).toNonIndexed();
}
function arm(side) {
  // from the shoulder out along +z (side = +1) or -z, drooping a touch, thinning to the wrist; then the hand
  const g = new THREE.CylinderGeometry(0.55, 1.15, 10.8, 14, 1).rotateX(Math.PI / 2).translate(0, 0, side * 5.4);
  g.rotateX(-side * 0.04);
  const hand = new THREE.BoxGeometry(0.55, 1.4, 1.3).translate(0, -0.2, side * 11.4);
  return [g.translate(0, 21.9, side * 2.4).toNonIndexed(), hand.translate(0, 21.9, side * 2.4).toNonIndexed()];
}
function sleeve(side) {
  // the drape hanging from each arm: a thin wedge from the upper arm down to the hip
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(side * 7.5, 0); s.lineTo(side * 1.2, -7.5); s.lineTo(0, -6.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
  g.translate(0, 0, -0.25);
  g.rotateY(-Math.PI / 2);   // the drape lies in the y-z plane (along the arm)
  return g.translate(0, 21.4, side * 2.6).toNonIndexed();
}
function head() {
  // built round the neck (24.2 m up), bowed toward the city, then put in place
  const skull = new THREE.SphereGeometry(1.25, 18, 14).scale(0.92, 1.18, 0.95).translate(0.2, 1.4, 0);
  const hair = new THREE.SphereGeometry(1.32, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(0.95, 1.2, 1.05).translate(-0.05, 1.55, 0);
  const beard = new THREE.ConeGeometry(0.75, 1.3, 12).rotateZ(Math.PI).translate(0.55, 0.3, 0);
  const g = mergeGeometries([skull.toNonIndexed(), hair.toNonIndexed(), beard.toNonIndexed()]);
  g.rotateZ(-0.12);
  return g.translate(0, 24.2, 0);
}

export function makeStatue(scene) {
  const parts = [robe(), ...arm(1), ...arm(-1), sleeve(1), sleeve(-1), head()].map((g) => g.translate(0, STATUE.ped, 0));
  // the pedestal (a chapel inside) with a cornice
  parts.push(new THREE.BoxGeometry(8.6, STATUE.ped, 8.6).translate(0, STATUE.ped / 2, 0).toNonIndexed());
  parts.push(new THREE.BoxGeometry(9.4, 0.6, 9.4).translate(0, STATUE.ped - 0.3, 0).toNonIndexed());
  parts.push(new THREE.BoxGeometry(7.2, 0.8, 4.6).translate(0, STATUE.ped + 0.4, 0).toNonIndexed());   // the statue's footing
  const geo = mergeGeometries(parts.map((g) => { if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; }));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9cbc0, roughness: 0.75 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFall; varying float vLanded; varying vec3 vLoc;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        // falling sand: each grain drops from its height onto a growing heap at the feet (a low cone)
        float H = ${(STATUE.ped + STATUE.h).toFixed(1)};
        float landed = clamp(uFall / H, 0.0, 1.0);
        float rr = length(position.xz);
        float heapR = 8.0 + 12.0 * landed;
        float heapH = H * 0.2 * landed;
        float heap = heapH * max(0.0, 1.0 - rr / heapR);
        float yy = position.y - uFall;
        float onHeap = step(yy, heap);
        // the heap's surface faces up and out like a cone
        vec3 coneN = normalize(vec3(normalize(position.xz + 1e-4).x * heapH / heapR, 1.0, normalize(position.xz + 1e-4).y * heapH / heapR));
        objectNormal = normalize(mix(objectNormal, coneN, onHeap));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = transformed;
        vLanded = onHeap;
        transformed.y = max(yy, heap);
        transformed.xz *= 1.0 + onHeap * 0.5 * landed * (1.0 - rr / heapR * 0.5);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDust; uniform float uTime; varying float vLanded; varying vec3 vLoc;\nfloat sh21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // soapstone tiles (a fine mosaic), weathered
          vec2 tile = floor(vec2(vLoc.x + vLoc.z, vLoc.y) * 8.0);
          float t = sh21(tile);
          diffuseColor.rgb *= 0.92 + 0.12 * t;
          // the soapstone skin goes at once: underneath, rough grey concrete
          vec3 concrete = vec3(0.47, 0.47, 0.45) * (0.75 + 0.35 * sh21(floor(vLoc.xy * 3.0) + floor(vLoc.z * 3.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, concrete, uSkin * step(0.18, sh21(tile + 7.0) + uSkin));
          // turning to powder: grainy, duller; what has landed is just a heap of grey-beige dust
          float grain = sh21(floor(vLoc.xz * 40.0) + floor(vLoc.y * 40.0));
          vec3 dust = vec3(0.68, 0.65, 0.58) * (0.8 + 0.3 * grain);
          diffuseColor.rgb = mix(diffuseColor.rgb, dust, clamp(uDust * 0.7 + vLanded, 0.0, 1.0));
        }`);
  };
  mat.customProgramCacheKey = () => 'cristo';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.position.set(0, STATUE.base, 0);
  scene.add(mesh);
  return { mesh, mat };
}
