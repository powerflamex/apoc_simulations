// The towers of Lower Manhattan behind you, Battery Park City, Jersey City across the Hudson and the low brick
// rows of Brooklyn: one instanced box each with the facade look (facade.js: glass curtain walls mirroring the
// sunset, punched office windows, balcony bands, lit floors), plus the landmarks' tops (One World Trade's spire,
// 40 Wall Street's green pyramid, 70 Pine's crown). The Battery's trees and lamps, and the cars jammed on State
// Street, are here too.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, TREES, LAMPS, CARS, landY } from './layout.js';
import { facadeMaterial, F } from './facade.js';
import { makeFleet } from './cars.js';
import { rng } from './util.js';

const col = new THREE.Color();
const m4 = new THREE.Matrix4(), mS = new THREE.Matrix4();
const dummy = new THREE.Object3D();

export function makeCity(scene, { plainMat, glowMat, shadowy }) {
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 4);
  // (no damage here: the facade's failure times are set past the end of the video)
  B.forEach((b, i) => { aT.set([1e9, 1e9, 1e9, 1], i * 4); aS.set([b.seed, b.kind, 1e9, b.h], i * 4); });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  B.forEach((b, i) => {
    mesh.setMatrixAt(i, m4.makeTranslation(b.x, b.y0, b.z).multiply(mS.makeScale(b.w, b.h, b.d)));
    mesh.setColorAt(i, col.set(b.col));
  });
  scene.add(mesh);
  // the landmarks' tops
  const tops = [];
  for (const b of B) {
    if (b.landmark === 'owtc') {
      tops.push(new THREE.CylinderGeometry(0.9, 1.6, 124, 6).translate(b.x, b.y0 + b.h + 62, b.z));
      tops.push(new THREE.BoxGeometry(b.w * 0.75, 6, b.d * 0.75).translate(b.x, b.y0 + b.h + 3, b.z));
    }
    if (b.landmark === 'wall') tops.push(new THREE.ConeGeometry(b.w * 0.6, 34, 4).rotateY(Math.PI / 4).translate(b.x, b.y0 + b.h + 17, b.z));
    if (b.landmark === 'pine') tops.push(new THREE.BoxGeometry(b.w * 0.5, 18, b.d * 0.5).translate(b.x, b.y0 + b.h + 9, b.z));
  }
  const topMesh = new THREE.Mesh(mergeGeometries(tops.map((g) => g.toNonIndexed())), plainMat(0x6e9a86, 0.5, { metalness: 0.3 }));
  topMesh.castShadow = true;
  scene.add(topMesh);

  // ---------- the Battery's trees and lamps ----------
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 5, 6).translate(0, 2.5, 0);
  const crownParts = [];
  const RC = rng(8);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, r = k === 0 ? 0 : 2.2 + RC() * 0.8;
    crownParts.push(new THREE.IcosahedronGeometry(2.4 + RC() * 0.8, 1).scale(1, 0.8, 1).translate(Math.cos(a) * r, 7 + RC() * 1.2, Math.sin(a) * r).toNonIndexed());
  }
  const trunks = shadowy(new THREE.InstancedMesh(trunk, plainMat(0x4a3a2c, 0.95), TREES.length));
  const crowns = shadowy(new THREE.InstancedMesh(mergeGeometries(crownParts), plainMat(0xffffff, 0.9, { flatShading: true }), TREES.length));
  const R = rng(321);
  TREES.forEach((t, i) => {
    dummy.position.set(t.x, landY(t.x, t.z), t.z); dummy.rotation.set(0, t.seed * 6, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix); crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, col.setHSL(0.22 + R() * 0.07, 0.35 + R() * 0.2, 0.16 + R() * 0.09));   // (late October: a few turning)
  });
  scene.add(trunks, crowns);
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.06, 0.09, 4.2, 8).translate(0, 2.1, 0),
    new THREE.SphereGeometry(0.28, 10, 8).translate(0, 4.4, 0),
  ].map((g) => g.toNonIndexed()));
  const lamps = shadowy(new THREE.InstancedMesh(lampGeo, plainMat(0x1d2420, 0.5, { metalness: 0.4 }), LAMPS.length));
  LAMPS.forEach((l, i) => { dummy.position.set(l.x, 0, l.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix); });
  scene.add(lamps);
  // ---------- the cars jammed on State Street (taxis among them) ----------
  const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
  const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a];
  CARS.forEach((c, i) => {
    fleet.color(i, c.taxi ? 0xf2c21a : PAL[Math.floor(R() * PAL.length)], c.taxi ? 0 : c.kind);
    dummy.position.set(c.x, 0.3, c.z); dummy.rotation.set(0, c.yaw, 0); dummy.updateMatrix();
    fleet.set(i, dummy.matrix, true);
  });
  fleet.commit();
  return {
    mesh,
    frame(v, s, glows) {
      F.uTime.value = v; F.uGrid.value = s.grid ?? 1; F.uDust.value = 0;
      for (const l of LAMPS) glows.add(l.x, 4.4, l.z, 1.0, 1.6 * s.dusk, 1.2 * s.dusk, 0.7 * s.dusk);
    },
  };
}
