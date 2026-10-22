// The boats. Near the seawall: the Statue ferry at its dock and a few small boats; as the harbor runs out they drop
// with the water, touch the mud and keel over onto their sides. Out in the bay, the orange Staten Island Ferry
// heads for its slip; the wave's face lifts it, stern first, and it is gone into the wall.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOATS, SIF, ferryAt, landY } from './layout.js';
import { V_FERRY } from './timeline.js';
import { smooth, clamp } from './util.js';

function colored(parts) {
  return mergeGeometries(parts.map(([g, c]) => {
    g = g.toNonIndexed();
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }));
}
// a hull: a box with a pointed bow (+z), length L, beam W, depth D
function hull(L, W, D) {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, -L / 2); s.lineTo(W / 2, -L / 2); s.lineTo(W / 2, L / 2 - W * 0.8); s.quadraticCurveTo(W / 2, L / 2, 0, L / 2 + W * 0.15);
  s.quadraticCurveTo(-W / 2, L / 2, -W / 2, L / 2 - W * 0.8); s.lineTo(-W / 2, -L / 2);
  return new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, D * 0.35, 0);
}
function boatGeo(b) {
  const P = [];
  if (b.kind === 'ferry') {
    P.push([hull(b.len, b.w, 3.2), 0x23324a]);
    P.push([new THREE.BoxGeometry(b.w * 0.92, 2.6, b.len * 0.8).translate(0, 1.4, -1), b.col]);
    P.push([new THREE.BoxGeometry(b.w * 0.92, 0.9, b.len * 0.78).translate(0, 1.6, -1), 0x1a2028]);
    P.push([new THREE.BoxGeometry(b.w * 0.85, 2.4, b.len * 0.55).translate(0, 4.0, -3), b.col]);
    P.push([new THREE.BoxGeometry(b.w * 0.87, 0.8, b.len * 0.53).translate(0, 4.1, -3), 0x1a2028]);
    P.push([new THREE.BoxGeometry(4, 2, 4).translate(0, 6.2, 4), 0xffffff]);
  } else if (b.kind === 'tug') {
    P.push([hull(b.len, b.w, 3.4), b.col]);
    P.push([new THREE.BoxGeometry(b.w * 0.6, 3, b.len * 0.35).translate(0, 2.2, 0), 0xf2f0ea]);
    P.push([new THREE.BoxGeometry(b.w * 0.5, 2.2, 3).translate(0, 4.8, 1), 0xf2f0ea]);
    P.push([new THREE.CylinderGeometry(0.6, 0.7, 3, 8).translate(0, 5, -2.5), 0x1a1a1a]);
  } else {
    P.push([hull(b.len, b.w, 1.5), b.col]);
    P.push([new THREE.BoxGeometry(b.w * 0.6, 1.2, b.len * 0.3).translate(0, 1.0, 0), 0xe8e8e8]);
    P.push([new THREE.BoxGeometry(b.w * 0.62, 0.45, b.len * 0.28).translate(0, 1.1, 0.2), 0x1a2028]);
  }
  return colored(P);
}
function sifGeo() {
  const P = [];
  const L = SIF.len, W = SIF.w;
  // double-ended: a long orange hull, three decks of windows, a pilot house at each end
  P.push([new THREE.BoxGeometry(W, 4, L).translate(0, 1, 0), 0xe5762a]);
  P.push([new THREE.BoxGeometry(W * 0.96, 3, L * 0.9).translate(0, 4.5, 0), 0xf08a2c]);
  P.push([new THREE.BoxGeometry(W * 0.97, 1.1, L * 0.86).translate(0, 4.7, 0), 0x1b1e24]);
  P.push([new THREE.BoxGeometry(W * 0.9, 3, L * 0.8).translate(0, 7.5, 0), 0xf08a2c]);
  P.push([new THREE.BoxGeometry(W * 0.91, 1.1, L * 0.76).translate(0, 7.7, 0), 0x1b1e24]);
  P.push([new THREE.BoxGeometry(W * 0.7, 2.6, L * 0.5).translate(0, 10.3, 0), 0xf3efe6]);
  for (const s of [-1, 1]) P.push([new THREE.BoxGeometry(W * 0.5, 2.4, 6).translate(0, 12.6, s * L * 0.33), 0xf3efe6]);
  return colored(P);
}

export function makeBoats(scene) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const meshes = BOATS.map((b) => {
    const m = new THREE.Mesh(boatGeo(b), mat);
    m.castShadow = true; m.receiveShadow = true;
    b.bed = landY(b.x, b.z);
    b.draft = b.kind === 'ferry' ? 2.2 : b.kind === 'tug' ? 2.6 : 0.8;
    b.side = b.x > 0 ? 1 : -1;
    scene.add(m);
    return m;
  });
  const sif = new THREE.Mesh(sifGeo(), mat);
  sif.castShadow = true;
  scene.add(sif);
  return {
    frame(v, s) {
      const level = s.level;
      BOATS.forEach((b, i) => {
        const m = meshes[i];
        // floating at the level, until the water is shallower than its draft: then it sits on the mud and keels over
        const ground = b.bed + b.draft * 0.35;
        const y = Math.max(level, ground);
        const keel = clamp((ground - level) / 2.5);
        m.position.set(b.x, y + Math.sin(v * 0.9 + i) * 0.08 * (1 - keel), b.z);
        m.rotation.set(0.05 * keel, b.yaw, b.side * 0.42 * smooth(0, 1, keel), 'YXZ');
        m.visible = v < 58.6;
      });
      // the Staten Island Ferry: on course for the slip, until the wave's face takes it
      const f = ferryAt(v);
      const lift = smooth(V_FERRY - 1.6, V_FERRY + 0.5, v);
      sif.visible = v < V_FERRY + 0.6;
      // (riding the water that heaps up in front of the wave's foot)
      sif.position.set(f.x, s.level + 6 * Math.exp(-Math.max(0, f.z - s.front) / 260) + 0.3 + lift * s.H * 0.55, f.z - lift * 18);
      sif.rotation.set(-lift * 0.7, SIF.yaw, lift * 0.25, 'YXZ');
    },
  };
}
