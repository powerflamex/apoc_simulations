// Street furniture: lamp posts along both curbs (their steel softens and they bow over, glowing, from ~2 MW/m²), litter
// bins, benches, a hydrant, the ice cream parlour's two little tables outside. All of it chars and glows with the heat
// where it is (city.js heated()).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, HEART } from './layout.js';
import { timeOfQ, Q } from './timeline.js';
import { rng, smooth } from './util.js';

export const BINS = [{ x: 6.55, z: -8.4 }, { x: -6.6, z: -21 }, { x: 6.6, z: -46 }, { x: -6.6, z: 6 }];
export const BENCHES = [{ x: 6.7, z: -13.5 }, { x: -6.7, z: -9.5 }, { x: 6.7, z: -31 }];
export const TABLES = [{ x: 9.7, z: -2.2 }, { x: 9.8, z: -6.4 }];

export function makeProps(scene, ctx) {
  const R = rng(515);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const metal = ctx.heated(ctx.plainMat(0x2e3136, 0.55, { metalness: 0.4 }), 'lamp', { charAt: 'GLASS', glowAt: 'TAR' });
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.13, 8, 8, 8).translate(0, 4, 0),
    new THREE.BoxGeometry(2.2, 0.1, 0.1).translate(1.1, 7.85, 0),
    new THREE.BoxGeometry(0.7, 0.18, 0.34).translate(2.15, 7.75, 0),
  ]);
  const lamps = new THREE.InstancedMesh(lampGeo, metal, LAMPS.length);
  lamps.castShadow = true; lamps.frustumCulled = false;
  scene.add(lamps);
  const LP = LAMPS.map((l) => {
    const dx = l.x - HEART.x, dz = l.z - HEART.z, dh = Math.hypot(dx, dz) || 1;
    const r = Math.hypot(dx, 3 - HEART.y, dz);
    return { ...l, t: timeOfQ(Q.STEEL * 0.6 * (0.8 + 0.4 * R()), r), ax: new THREE.Vector3(-dz / dh, 0, dx / dh) };
  });
  const bin = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 12).translate(0, 0.475, 0), ctx.heated(ctx.plainMat(0x2a4a3a, 0.6), 'bin'), BINS.length);
  BINS.forEach((b, i) => bin.setMatrixAt(i, m4.makeTranslation(b.x, 0, b.z)));
  const benchGeo = mergeGeometries([new THREE.BoxGeometry(0.5, 0.05, 1.8).translate(0, 0.45, 0), new THREE.BoxGeometry(0.06, 0.45, 1.8).translate(0.24, 0.7, 0),
    ...[-0.8, 0.8].map((z) => new THREE.BoxGeometry(0.45, 0.45, 0.06).translate(0, 0.225, z))]);
  const bench = new THREE.InstancedMesh(benchGeo, ctx.heated(ctx.plainMat(0x7a5434, 0.8), 'bench', { charAt: 'IGNITE', glowAt: 'TAR' }), BENCHES.length);
  BENCHES.forEach((b, i) => bench.setMatrixAt(i, m4.makeRotationY(b.x > 0 ? 0 : Math.PI).setPosition(b.x, 0, b.z)));
  const tableGeo = mergeGeometries([new THREE.CylinderGeometry(0.36, 0.36, 0.035, 20).translate(0, 0.74, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(0, 0.37, 0),
    new THREE.CylinderGeometry(0.22, 0.24, 0.03, 12).translate(0, 0.015, 0)]);
  const tables = new THREE.InstancedMesh(tableGeo, ctx.heated(ctx.plainMat(0xf2f0ea, 0.5), 'table'), TABLES.length);
  TABLES.forEach((b, i) => tables.setMatrixAt(i, m4.makeTranslation(b.x, 0, b.z)));
  const hyd = new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(0.13, 0.15, 0.72, 10).translate(0, 0.36, 0), new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.72, 0)]),
    ctx.heated(ctx.plainMat(0xc8a018, 0.5), 'hyd'));
  hyd.position.set(6.45, 0, -6.8);
  for (const m of [bin, bench, tables, hyd]) { ctx.shadowy(m); scene.add(m); }
  return {
    frame(v) {
      // lamps bow over away from you as their steel softens, their tops sinking to the ground
      LP.forEach((l, i) => {
        const th = 1.35 * smooth(l.t, l.t + 4.5, v) ** 1.6;
        q.setFromAxisAngle(l.ax, -th);
        const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.dir > 0 ? 0 : Math.PI);
        lamps.setMatrixAt(i, m4.compose(p.set(l.x, 0, l.z), q.multiply(qy), one));
      });
      lamps.instanceMatrix.needsUpdate = true;
    },
  };
}
