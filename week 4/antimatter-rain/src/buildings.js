// The buildings: one instanced box each (their look is in facade.js), plus a pointed crown on a few towers.
import * as THREE from 'three';
import { B } from './layout.js';
import { facadeMaterial } from './facade.js';
import { drownMat } from './drown.js';

export function makeBuildings(scene) {
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aS = new Float32Array(n * 4);
  B.forEach((b, i) => aS.set([b.seed, b.kind, b.lit, b.h], i * 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  B.forEach((b, i) => {
    m4.makeTranslation(b.x, 0, b.z).multiply(new THREE.Matrix4().makeScale(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(b.col));
  });
  scene.add(mesh);
  // pointed crowns (a four-sided spire) on the towers marked crown
  const crowns = B.filter((b) => b.crown);
  const cg = new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const cm = new THREE.InstancedMesh(cg, drownMat(new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: 0.4, metalness: 0.5, emissive: 0x223344 })), crowns.length);
  crowns.forEach((b, i) => cm.setMatrixAt(i, m4.makeTranslation(b.x, b.h, b.z).multiply(new THREE.Matrix4().makeScale(b.w, b.w * 0.9, b.d))));
  cm.frustumCulled = false;
  scene.add(cm);
  const group = [mesh, cm];
  return { mesh, group };
}
