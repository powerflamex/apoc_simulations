// The city bus you ride: 12.2 m long, red with a white roof, lit inside, its front toward -z. The group's origin is
// the middle of the roof (so it is placed by its roof height); the body hangs below it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drownMat } from './drown.js';

export function makeBus(scene) {
  const P = (c, r = 0.5, extra = {}) => drownMat(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.1, ...extra }));
  const g = new THREE.Group();
  const L = 12.2, W = 2.55, H = 3.15 - 0.32;            // body from 0.32 m above the street to the roof
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, L, 3, 0.12).translate(0, -H / 2, 0), P(0xc81e24, 0.35));
  g.add(body);
  // the white roof and its air-con pod at the front
  g.add(new THREE.Mesh(mergeGeometries([
    new RoundedBoxGeometry(W - 0.1, 0.12, L - 0.3, 2, 0.04).translate(0, 0.0, 0),
    new RoundedBoxGeometry(1.8, 0.38, 2.4, 2, 0.1).translate(0, 0.22, -4.6),
  ]), P(0xeeeeea, 0.45)));
  // a yellow stripe along each side under the windows
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, L - 0.6).translate(s * (W / 2 + 0.005), -2.05, 0), P(0xffc21a, 0.4, { emissive: 0x442800 })));
  // windows: a dark band down each side and the big windscreen, warm light inside
  const glassM = P(0x141b22, 0.08, { metalness: 0.4, emissive: 0xffc890, emissiveIntensity: 0.02 });
  const win = [];
  for (const s of [-1, 1]) for (let z = -L / 2 + 1.6; z < L / 2 - 0.9; z += 1.55) win.push(new THREE.BoxGeometry(0.03, 1.05, 1.36).translate(s * (W / 2 + 0.01), -1.25, z));
  win.push(new THREE.BoxGeometry(W - 0.25, 1.7, 0.03).translate(0, -1.35, -L / 2 - 0.01));
  win.push(new THREE.BoxGeometry(W - 0.4, 0.9, 0.03).translate(0, -1.0, L / 2 + 0.01));
  g.add(new THREE.Mesh(mergeGeometries(win), glassM));
  // the destination sign over the windscreen (lit amber)
  g.add(new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.3, 0.04).translate(0, -0.33, -L / 2 - 0.02), P(0x221100, 0.4, { emissive: 0xffa020, emissiveIntensity: 2.2 })));
  // bumpers, wheels, lights
  g.add(new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(W + 0.04, 0.32, 0.18).translate(0, -H + 0.12, -L / 2 - 0.05),
    new THREE.BoxGeometry(W + 0.04, 0.32, 0.18).translate(0, -H + 0.12, L / 2 + 0.05),
  ]), P(0x26272a, 0.6)));
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 16).rotateZ(Math.PI / 2);
  const wl = [];
  for (const z of [-L / 2 + 2.4, L / 2 - 2.6]) for (const s of [-1, 1]) wl.push(wheel.clone().translate(s * (W / 2 - 0.12), -H - 0.32 + 0.5 - 0.02, z));
  g.add(new THREE.Mesh(mergeGeometries(wl), P(0x141414, 0.9)));
  g.add(new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(0.3, 0.16, 0.04).translate(-W / 2 + 0.3, -H + 0.5, -L / 2 - 0.03),
    new THREE.BoxGeometry(0.3, 0.16, 0.04).translate(W / 2 - 0.3, -H + 0.5, -L / 2 - 0.03),
  ]), P(0xffffff, 0.2, { emissive: 0xfff2d8, emissiveIntensity: 3 })));
  g.add(new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(0.22, 0.3, 0.04).translate(-W / 2 + 0.25, -H + 0.7, L / 2 + 0.03),
    new THREE.BoxGeometry(0.22, 0.3, 0.04).translate(W / 2 - 0.25, -H + 0.7, L / 2 + 0.03),
  ]), P(0x400000, 0.3, { emissive: 0xff2010, emissiveIntensity: 2.5 })));
  g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
  scene.add(g);
  return { group: g, L, W, H };
}
