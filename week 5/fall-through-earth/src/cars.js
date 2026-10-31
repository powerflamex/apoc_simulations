// Instanced low-poly cars with a real silhouette: a shaped body with wheel arches, a glass cabin with a
// painted roof, wheels with hubs, bumpers, and head/tail lights. Front is -z, like the old box cars.
//   const fleet = makeFleet(scene, n, { plainMat, glowMat, shadowy });
//   fleet.color(i, 0xff0000, kind)   kind: 0 sedan, 1 hatchback, 2 SUV, 3 van
//   each frame: fleet.set(i, matrix, lightsOn); then fleet.commit()
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const extrude = (pts, width, bevel = 0.03) => {
  const sh = new THREE.Shape(pts.map(([s, y]) => new THREE.Vector2(s, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.rotateY(-Math.PI / 2);
  return g.toNonIndexed();
};
const arch = (s0, s1, y, r, n = 8) => {
  const out = [];
  for (let k = 0; k <= n; k++) { const a = Math.PI - (k / n) * Math.PI; out.push([(s0 + s1) / 2 + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return out;
};

// side profiles (s along the car, front at -s; y up)
function bodyProfile(len) {
  const h = len / 2, wf = -h + 0.82, wr = h - 0.82;
  return [
    [h - 0.05, 0.28], ...arch(wr - 0.38, wr + 0.38, 0.28, 0.4).reverse(), ...arch(wf - 0.38, wf + 0.38, 0.28, 0.4).reverse(),
    [-h + 0.05, 0.28], [-h - 0.03, 0.5], [-h + 0.08, 0.78], [-h + 1.15, 0.92], [h - 0.75, 0.95], [h + 0.02, 0.86], [h + 0.04, 0.5],
  ];
}
const KINDS = [
  { len: 4.5, cab: [[-0.95, 0.9], [-0.25, 1.4], [0.85, 1.42], [1.5, 0.94]], width: 1.8 },             // sedan
  { len: 4.0, cab: [[-0.75, 0.9], [-0.05, 1.42], [1.45, 1.42], [1.82, 0.94]], width: 1.76 },            // hatchback
  { len: 4.6, cab: [[-0.85, 0.94], [-0.2, 1.62], [1.75, 1.64], [2.12, 0.98]], width: 1.88, lift: 0.16 }, // SUV
  { len: 4.9, cab: [[-1.6, 0.92], [-1.0, 1.85], [2.3, 1.88], [2.36, 0.96]], width: 1.92, lift: 0.12 },  // van
];

export function makeFleet(scene, n, { plainMat, glowMat, shadowy, headColor = new THREE.Color(8, 7.4, 6), tailColor = new THREE.Color(6, 0.3, 0.2) }) {
  const kinds = KINDS.map((k) => {
    const lift = k.lift || 0;
    const body = extrude(bodyProfile(k.len), k.width, 0.05).translate(0, lift, 0);
    const cab = extrude(k.cab, k.width - 0.22, 0.04).translate(0, lift, 0);
    const roofPts = [[k.cab[1][0] + 0.06, k.cab[1][1] - 0.04], [k.cab[1][0] + 0.06, k.cab[1][1] + 0.03], [k.cab[2][0] - 0.04, k.cab[2][1] + 0.03], [k.cab[2][0] - 0.04, k.cab[2][1] - 0.04]];
    const roof = extrude(roofPts, k.width - 0.18, 0.02).translate(0, lift, 0);
    const h = k.len / 2;
    const trim = mergeGeometries([
      new THREE.BoxGeometry(k.width + 0.02, 0.16, 0.14).translate(0, 0.42 + lift, -h - 0.07),
      new THREE.BoxGeometry(k.width + 0.02, 0.16, 0.14).translate(0, 0.42 + lift, h + 0.08),
      new THREE.BoxGeometry(0.9, 0.16, 0.04).translate(0, 0.62 + lift, -h - 0.09),
    ].map((g) => g.toNonIndexed()));
    const wheels = mergeGeometries([-1, 1].flatMap((sx) => [-1, 1].map((sz) =>
      new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14).rotateZ(Math.PI / 2).translate(sx * (k.width / 2 - 0.1), 0.33, sz * (h - 0.82)).toNonIndexed())));
    const hubs = mergeGeometries([-1, 1].flatMap((sx) => [-1, 1].map((sz) =>
      new THREE.CylinderGeometry(0.19, 0.19, 0.02, 10).rotateZ(Math.PI / 2).translate(sx * (k.width / 2 + 0.02), 0.33, sz * (h - 0.82)).toNonIndexed())));
    const head = mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(0.38, 0.13, 0.06).translate(sx * (k.width / 2 - 0.3), 0.7 + lift, -h - 0.08).toNonIndexed()));
    const tail = mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(0.36, 0.15, 0.06).translate(sx * (k.width / 2 - 0.25), 0.74 + lift, h + 0.1).toNonIndexed()));
    return { body, cab, roof, trim, wheels, hubs, head, tail };
  });
  // one InstancedMesh per part per kind; unused instances stay collapsed
  const paint = plainMat(0xffffff, 0.38, { metalness: 0.25 });
  const mats = {
    body: paint, roof: paint,
    cab: plainMat(0x12161b, 0.12, { metalness: 0.55 }),
    trim: plainMat(0x1f2124, 0.7), wheels: plainMat(0x141414, 0.9), hubs: plainMat(0x9a9ea3, 0.35, { metalness: 0.6 }),
    head: glowMat(headColor), tail: glowMat(tailColor),
  };
  const parts = Object.keys(mats);
  const meshes = kinds.map((k) => Object.fromEntries(parts.map((p) => {
    const m = new THREE.InstancedMesh(k[p], mats[p], n);
    if (p === 'head' || p === 'tail') m.frustumCulled = false; else shadowy(m);
    scene.add(m);
    return [p, m];
  })));
  const kindOf = new Int8Array(n);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) for (const k of meshes) for (const p of parts) k[p].setMatrixAt(i, zero);
  return {
    color(i, c, kind = 0) {
      kindOf[i] = kind;
      for (const p of ['body', 'roof']) meshes[kind][p].setColorAt(i, col.set(c));
    },
    set(i, matrix, lights = true) {
      const k = meshes[kindOf[i]];
      for (const p of parts) k[p].setMatrixAt(i, (p === 'head' || p === 'tail') && !lights ? zero : matrix);
    },
    commit() { for (const k of meshes) for (const p of parts) { k[p].instanceMatrix.needsUpdate = true; if (k[p].instanceColor) k[p].instanceColor.needsUpdate = true; } },
  };
}
