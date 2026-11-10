// The city across the river: ~1,500 buildings (glass towers and office blocks with lit windows, layout.js).
// From ~6x each one gives way at its own moment: it drops straight down through its own dust (close to free fall
// at that gravity), leaning a little, into a heap of rubble; its lights die as it goes.
import * as THREE from 'three';
import { patch } from './bend.js';
import { B, fallK, fallDur } from './layout.js';
import { clamp, smooth } from './util.js';

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

export function makeSkyline(scene, { shadowy }) {
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(B, (b) => b.seed), 1));
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(Float32Array.from(B, (b) => b.vFall + 0.15), 1));
  const mesh = new THREE.InstancedMesh(geo, patch(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }), { windows: true }), n);
  shadowy(mesh);
  B.forEach((b, i) => mesh.setColorAt(i, tmpC.set(b.color)));
  scene.add(mesh);
  // rubble heaps: a lumpy mound per building
  const heapGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    const p = heapGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nse = 0.8 + 0.35 * Math.sin(x * 7.1 + z * 3.3) * Math.sin(z * 5.7 - y * 2.1);
      y = Math.max(y, 0) * nse;
      p.setXYZ(i, x * (0.9 + 0.2 * Math.sin(z * 9.0)), y, z * (0.9 + 0.2 * Math.sin(x * 8.0)));
    }
    heapGeo.computeVertexNormals();
  }
  const heaps = new THREE.InstancedMesh(heapGeo, patch(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), { key: 'heap' }), n);
  shadowy(heaps);
  B.forEach((b, i) => { heaps.setColorAt(i, tmpC.set(b.color).lerp(new THREE.Color(0x6b6259), 0.6)); dummy.scale.set(0, 0, 0); dummy.updateMatrix(); heaps.setMatrixAt(i, dummy.matrix); });
  scene.add(heaps);

  const state = new Int8Array(n);   // 0 standing (matrix set), 1 falling, 2 down
  const place = (i, v) => {
    const b = B[i];
    const k = fallK(b, v);
    const kk = k * k;
    if (k >= 1) {
      dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0, 0, 0); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    } else {
      // the top comes down to the heap; the box slides into the ground (the ground hides the part below)
      const drop = (b.h - b.heap * 0.5) * kk;
      dummy.position.set(b.x, -drop, b.z);
      const lean = b.lean * smooth(0, 1, k);
      dummy.rotation.set(b.leanAx === 'x' ? lean : 0, 0, b.leanAx === 'z' ? lean : 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    const hk = smooth(0.15, 1.0, k);
    dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, b.seed * 6, 0);
    dummy.scale.set(b.w * 0.62 * (0.7 + 0.3 * hk), b.heap * hk, b.d * 0.62 * (0.7 + 0.3 * hk));
    if (hk <= 0) dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    heaps.setMatrixAt(i, dummy.matrix);
  };
  for (let i = 0; i < n; i++) place(i, -10);

  return {
    mesh, heaps,
    frame(v) {
      // only the buildings whose state changed (or are mid-fall) are rewritten
      let dirty = false;
      for (let i = 0; i < n; i++) {
        const b = B[i];
        const k = fallK(b, v);
        const st = k <= 0 ? 0 : k >= 1 ? 2 : 1;
        if (st === 1 || st !== state[i]) { place(i, v); state[i] = st; dirty = true; }
      }
      if (dirty) { mesh.instanceMatrix.needsUpdate = true; heaps.instanceMatrix.needsUpdate = true; }
    },
  };
}
