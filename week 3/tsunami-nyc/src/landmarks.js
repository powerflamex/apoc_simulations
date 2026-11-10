// The landmarks, built from simple shapes: the Statue of Liberty on Liberty Island (Fort Wood's star-shaped walls,
// the granite pedestal, the copper-green statue with her torch raised: 93 m to the flame), Castle Clinton's round
// sandstone fort in the Battery behind you, Governors Island (trees, Castle Williams, brick barracks) and Ellis
// Island's red-brick hall. Once the wave's foot has passed them they are under it (hidden inside the wall).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIB, GOV, ELLIS, CASTLE, landY } from './layout.js';
import { rng } from './util.js';

function colored(parts) {
  const gs = parts.map(([g, c]) => {
    g = g.toNonIndexed();
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  return mergeGeometries(gs);
}

export function makeLandmarks(scene) {
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  const out = {};
  // ---------- the Statue of Liberty ----------
  {
    const P = [];
    const STONE = 0xc8bca6, GRANITE = 0xb5aa98, COPPER = 0x6fa892, GOLD = 0xf2c25a;
    // Fort Wood: an 11-point star of low walls
    const star = new THREE.Shape();
    for (let i = 0; i <= 22; i++) {
      const a = (i / 22) * Math.PI * 2, r = i % 2 ? 34 : 48;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    P.push([new THREE.ExtrudeGeometry(star, { depth: 7, bevelEnabled: false }).rotateX(-Math.PI / 2), STONE]);
    // the pedestal: a stepped granite tower, 27 m
    P.push([new THREE.BoxGeometry(28, 6, 28).translate(0, 10, 0), GRANITE]);
    P.push([new THREE.BoxGeometry(20, 17, 20).translate(0, 21.5, 0), GRANITE]);
    P.push([new THREE.BoxGeometry(23, 2.2, 23).translate(0, 31, 0), GRANITE]);
    P.push([new THREE.BoxGeometry(17, 3, 17).translate(0, 33.5, 0), GRANITE]);
    // the statue (46 m to the torch): robe, body, head with the crown, the raised right arm with the torch,
    // the tablet in her left arm
    P.push([new THREE.CylinderGeometry(4.6, 7.2, 22, 12).translate(0, 46, 0), COPPER]);
    P.push([new THREE.CylinderGeometry(3.2, 4.6, 8, 12).translate(0, 61, 0), COPPER]);
    P.push([new THREE.SphereGeometry(2.6, 12, 10).scale(1, 1.2, 1).translate(0, 68, 0), COPPER]);
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.32;
      P.push([new THREE.ConeGeometry(0.35, 3.2, 4).rotateZ(Math.PI / 2 - 0.1).rotateY(-a).translate(Math.cos(a) * 2.6, 70, Math.sin(a) * 2.6), COPPER]);
    }
    P.push([new THREE.CylinderGeometry(0.9, 1.2, 13, 8).rotateZ(-0.12).translate(4.2, 70, 0), COPPER]);      // the arm
    P.push([new THREE.CylinderGeometry(1.1, 0.7, 3, 8).translate(5.0, 77.5, 0), COPPER]);                   // the torch
    P.push([new THREE.ConeGeometry(1.0, 2.6, 8).translate(5.0, 80.2, 0), GOLD]);                            // the flame
    P.push([new THREE.BoxGeometry(1.2, 7, 4.5).rotateZ(0.25).translate(-4.6, 56, 1.5), COPPER]);           // the tablet
    const statue = new THREE.Mesh(colored(P), vc);
    statue.position.set(LIB.x, landY(LIB.x, LIB.z), LIB.z);
    statue.rotation.y = -0.6;              // she faces out to sea, a little toward you
    statue.scale.setScalar(1.13);          // 93 m from the ground to the torch
    statue.castShadow = true;
    scene.add(statue);
    out.statue = statue;
    out.flame = new THREE.Vector3(LIB.x, statue.position.y + 80.5 * 1.13, LIB.z);
    // trees and the low buildings on the island
    const R = rng(4);
    const tp = [];
    for (let k = 0; k < 40; k++) {
      const a = R() * 6.28, r = 55 + R() * 70;
      tp.push([new THREE.IcosahedronGeometry(4 + R() * 3, 0).translate(LIB.x + Math.cos(a) * r, 4, LIB.z + Math.sin(a) * r * 0.7), 0x3d5a2a]);
    }
    tp.push([new THREE.BoxGeometry(40, 9, 18).translate(LIB.x + 70, 5, LIB.z + 40), 0xd6d0c2]);
    scene.add(new THREE.Mesh(colored(tp), vc));
  }
  // ---------- Castle Clinton ----------
  {
    const g = new THREE.CylinderGeometry(CASTLE.r, CASTLE.r, CASTLE.h, 40, 1, true).translate(CASTLE.x, CASTLE.h / 2, CASTLE.z);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9a6a50, roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  // ---------- Governors Island and Ellis Island ----------
  {
    const R = rng(9);
    const P = [];
    for (let k = 0; k < 260; k++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 0.85;
      const x = GOV.x + Math.cos(a) * r * GOV.rx, z = GOV.z + Math.sin(a) * r * GOV.rz;
      P.push([new THREE.IcosahedronGeometry(4 + R() * 4, 0).scale(1, 1.2, 1).translate(x, 6 + R() * 3, z), R() < 0.5 ? 0x3c5a26 : 0x52702e]);
    }
    for (let k = 0; k < 16; k++) {
      const x = GOV.x + (R() - 0.5) * GOV.rx * 1.2, z = GOV.z + (R() - 0.2) * GOV.rz * 0.8;
      P.push([new THREE.BoxGeometry(18 + R() * 30, 10 + R() * 8, 14 + R() * 10).translate(x, 6, z), 0x9a5040]);
    }
    // Castle Williams, round, on the island's corner nearest you
    P.push([new THREE.CylinderGeometry(30, 30, 14, 30).translate(GOV.x + GOV.rx * 0.55, 7, GOV.z + GOV.rz * 0.6), 0xa0705a]);
    // Ellis Island: the great hall with its four towers
    P.push([new THREE.BoxGeometry(70, 18, 30).translate(ELLIS.x, 9, ELLIS.z), 0xa45a44]);
    for (const [dx, dz] of [[-30, -12], [30, -12], [-30, 12], [30, 12]]) P.push([new THREE.CylinderGeometry(3, 3, 30, 8).translate(ELLIS.x + dx, 15, ELLIS.z + dz), 0xe6dfd0]);
    const m = new THREE.Mesh(colored(P), vc);
    m.castShadow = true;
    scene.add(m);
  }
  return out;
}
