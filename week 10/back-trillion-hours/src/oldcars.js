// Older cars, instanced like cars.js (front at -z): a 1950s sedan (long, rounded, two-tone, chrome, whitewall tyres,
// small tail fins) and a 1910s touring car (Model T style: tall, black, an upright brass radiator, a folding top on
// posts, separate arched fenders, running boards, tall thin spoked wheels).
//   const f = makeOldFleet(scene, n, ctx, kind)  kind '50s' | 'T';  f.color(i, hex); f.set(i, matrix); f.commit()
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ext = (pts, width, bevel = 0.03) => {
  const sh = new THREE.Shape(pts.map(([s, y]) => new THREE.Vector2(s, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.rotateY(-Math.PI / 2);
  return g.toNonIndexed();
};
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const wheel = (r, w, x, z, spokes) => {
  const parts = [ni(new THREE.TorusGeometry(r - 0.04, 0.045, 6, 18).rotateY(Math.PI / 2).translate(x, r, z))];
  if (spokes) for (let k = 0; k < 10; k++) parts.push(ni(new THREE.BoxGeometry(0.02, r * 1.9, 0.025).rotateX((k / 10) * Math.PI).translate(x, r, z)));
  else parts.push(ni(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2).translate(x, r, z)));
  return mergeGeometries(parts);
};

function kindT() {
  const W = 1.5, wheelsR = 0.4;
  const body = [
    ni(new THREE.BoxGeometry(0.62, 0.5, 1.0).translate(0, 1.0, -1.1)),                                         // hood
    ext([[-0.6, 0.72], [-0.6, 1.3], [0.2, 1.3], [0.35, 1.15], [0.9, 1.15], [1.05, 1.32], [1.4, 1.32], [1.45, 0.72]], W - 0.1),  // tub
  ];
  const dark = [
    ni(new THREE.BoxGeometry(W - 0.05, 0.04, 2.0).translate(0, 1.95, 0.45)),                                   // the top
    ...[[-0.68, -0.45], [0.68, -0.45], [-0.68, 1.35], [0.68, 1.35], [-0.68, 0.45], [0.68, 0.45]].map(([x, z]) => ni(new THREE.CylinderGeometry(0.018, 0.018, 0.65, 5).translate(x, 1.63, z))),
    ...[-1, 1].flatMap((sx) => [ni(new THREE.BoxGeometry(0.2, 0.03, 2.2).translate(sx * 0.82, 0.55, 0.1))]),     // running boards
    ...[-1, 1].flatMap((sx) => [-1.15, 1.2].map((z) => ni(new THREE.CylinderGeometry(0.46, 0.46, 0.24, 14, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).translate(sx * 0.66, 0.42, z)))),  // fenders
    ni(new THREE.BoxGeometry(0.06, 0.06, 0.06).translate(0, 1.4, -0.62)),
  ];
  const brass = [ni(new THREE.BoxGeometry(0.58, 0.62, 0.08).translate(0, 1.02, -1.64)), ...[-1, 1].map((sx) => ni(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10).rotateX(Math.PI / 2).translate(sx * 0.42, 1.15, -1.6)))];
  const glass = [ni(new THREE.BoxGeometry(W - 0.2, 0.42, 0.02).translate(0, 1.55, -0.6))];
  const wheels = [-1, 1].flatMap((sx) => [-1.15, 1.2].map((z) => wheel(wheelsR, 0.08, sx * 0.66, z, true)));
  return { body: mergeGeometries(body), dark: mergeGeometries(dark), brass: mergeGeometries(brass), glass: mergeGeometries(glass), wheels: mergeGeometries(wheels) };
}
function kind50() {
  const W = 1.95, h = 2.45;
  const prof = [[h, 0.36], [h + 0.08, 0.55], [h + 0.02, 0.9], [h - 0.45, 0.98], [h - 1.2, 0.95], [-h + 1.3, 0.93], [-h + 0.25, 0.92], [-h - 0.05, 0.75], [-h - 0.08, 0.42], [-h + 0.05, 0.36]];
  const body = [ext(prof, W, 0.08)];
  const cab = ext([[-0.85, 0.93], [-0.25, 1.48], [0.95, 1.5], [1.4, 0.95]], W - 0.25, 0.06);
  const top = ext([[-0.2, 1.46], [-0.18, 1.53], [0.92, 1.54], [0.94, 1.47]], W - 0.2, 0.03);
  const fins = [-1, 1].map((sx) => ext([[h - 0.9, 0.9], [h + 0.02, 1.08], [h + 0.05, 0.9]], 0.08, 0.01).translate(sx * (W / 2 - 0.08), 0, 0));
  const chrome = [ni(new THREE.BoxGeometry(W + 0.06, 0.16, 0.12).translate(0, 0.48, -h - 0.1)), ni(new THREE.BoxGeometry(W + 0.06, 0.16, 0.12).translate(0, 0.48, h + 0.12)),
    ni(new THREE.BoxGeometry(1.0, 0.18, 0.05).translate(0, 0.7, -h - 0.08)), ...[-1, 1].map((sx) => ni(new THREE.BoxGeometry(0.02, 0.04, 3.8).translate(sx * (W / 2 + 0.01), 0.72, 0)))];
  const wheels = [-1, 1].flatMap((sx) => [-1.45, 1.45].map((z) => mergeGeometries([ni(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 18).rotateZ(Math.PI / 2).translate(sx * (W / 2 - 0.12), 0.36, z))])));
  const walls = [-1, 1].flatMap((sx) => [-1.45, 1.45].map((z) => ni(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 16).rotateZ(Math.PI / 2).translate(sx * (W / 2 + 0.005), 0.36, z))));
  return { body: mergeGeometries([...body, ...fins]), top: top, glass: cab, chrome: mergeGeometries(chrome), wheels: mergeGeometries(wheels), walls: mergeGeometries(walls) };
}

export function makeOldFleet(scene, n, { plainMat, shadowy }, kind) {
  const G = kind === 'T' ? kindT() : kind50();
  const mats = kind === 'T'
    ? { body: plainMat(0x111111, 0.35, { metalness: 0.2 }), dark: plainMat(0x141210, 0.85), brass: plainMat(0xc89a3a, 0.3, { metalness: 0.8 }), glass: plainMat(0x7a8a90, 0.1, { metalness: 0.4, transparent: true, opacity: 0.45 }), wheels: plainMat(0x2a2018, 0.8) }
    : { body: plainMat(0xffffff, 0.3, { metalness: 0.25 }), top: plainMat(0xf2efe6, 0.3), glass: plainMat(0x1a2228, 0.1, { metalness: 0.5 }), chrome: plainMat(0xd8dadc, 0.18, { metalness: 0.9 }), wheels: plainMat(0x141414, 0.9), walls: plainMat(0xf4f2ec, 0.6) };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const meshes = Object.keys(mats).filter((p) => G[p]).map((p) => {
    const m = new THREE.InstancedMesh(G[p], mats[p], n);
    shadowy(m);
    for (let i = 0; i < n; i++) m.setMatrixAt(i, zero);
    scene.add(m);
    return [p, m];
  });
  const col = new THREE.Color();
  return {
    meshes: meshes.map((x) => x[1]),
    color(i, c) { for (const [p, m] of meshes) if (p === 'body') m.setColorAt(i, col.set(c)); },
    set(i, matrix) { for (const [, m] of meshes) m.setMatrixAt(i, matrix || zero); },
    commit() { for (const [, m] of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } },
  };
}
