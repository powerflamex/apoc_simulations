// The trees: the street trees along the sidewalks (autumn colours on frame 0, bare and snowy in winter, green in
// summer; left alone they grow old and huge), and the wild ones: seedlings in the cracks once the people have gone,
// young trees through the street, then the forest over the whole city. Each tree grows from a sprout, never pops.
import * as THREE from 'three';
import { TREES, WILD } from './layout.js';
import { smooth, clamp, lerp } from './util.js';

const lsm = (a, b, y) => smooth(Math.log10(a), Math.log10(b), Math.log10(Math.max(y, 1e-9)));

function lumpy(detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const a = g.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 5.1 + y * 3.3) * Math.sin(z * 4.7 + x * 2.1) + 0.1 * Math.sin(y * 9 + z * 7);
    a.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function makeForest(scene, ctx) {
  const ALL = [...TREES.map((t) => ({ ...t, street: true })), ...WILD];
  const n = ALL.length;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.1, 1, 7).translate(0, 0.5, 0), ctx.plainMat(0x4a3a2c, 0.95), n);
  const crowns = new THREE.InstancedMesh(lumpy(2), ctx.plainMat(0xffffff, 0.9), n * 3);
  // a few bare branches for the winter street trees
  for (const m of [trunks, crowns]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const AUT = [0xd8a030, 0xe0b040, 0xc8702a, 0xb85a28, 0xd89838, 0x9a8a30, 0xe8c050].map((c) => new THREE.Color(c));
  const GREEN = [0x3f6e24, 0x4f7f2a, 0x356222, 0x5a8a30, 0x2f5a20, 0x47752c, 0x6a8a2c, 0x2a4a1c, 0x587a34].map((c) => new THREE.Color(c));
  const BARE = new THREE.Color(0x5a4636), SNOW = new THREE.Color(0xe4e8ee);

  return {
    frame(v, s) {
      const Y = s.Y, se = s.season;
      for (let i = 0; i < n; i++) {
        const t = ALL[i];
        let h, r, leaf = 1, autumn = 0, snow = 0;
        if (t.street) {
          // the street trees: seasonal while the city lives; growing old and big once nobody prunes them (and the
          // forest grows round them)
          const grow = 1 + 1.6 * lsm(400, 3000, Y);
          h = t.h * grow; r = t.r * (1 + 1.2 * lsm(400, 3000, Y));
          leaf = se.leaf; autumn = se.autumn; snow = se.snow;
        } else {
          if (Y < t.yBorn * 0.98) { trunks.setMatrixAt(i, hide); for (let k = 0; k < 3; k++) crowns.setMatrixAt(i * 3 + k, hide); continue; }
          const g = lsm(t.yBorn, t.yBorn * (t.near ? 4 : 3), Y);
          h = t.hMax * Math.max(0.03, Math.pow(g, 0.85)); r = t.r * Math.max(0.03, g);
        }
        const lean = (t.seed - 0.5) * 0.12;
        e.set(lean, t.seed * 6.28, 0); q.setFromEuler(e);
        const tw = t.street ? 1 + 1.5 * lsm(400, 3000, Y) : t.bush ? 0.5 : 1.2 + h * 0.13;
        const trunkH = t.bush ? 0.01 : h * (t.street ? 0.75 : 0.55);
        trunks.setMatrixAt(i, m4.compose(p.set(t.x, 0, t.z), q, sc.set(tw, trunkH, tw)));
        // the crown: three lumps, the leaves thin out in winter (bare twigs: small and brown)
        const lr = r * (0.35 + 0.65 * leaf);
        for (let k = 0; k < 3; k++) {
          const rr = lr * (k === 0 ? 1 : k === 1 ? 0.75 : 0.62);
          const a = t.seed * 9 + k * 2.1, o = k === 0 ? 0 : 0.5 * r;
          const yc = t.bush ? rr * 0.5 : trunkH + rr * 0.45 + (k === 1 ? r * 0.35 : k === 2 ? -r * 0.15 : 0);
          crowns.setMatrixAt(i * 3 + k, m4.makeScale(rr, rr * (t.bush ? 0.7 : 0.85), rr).setPosition(t.x + o * Math.cos(a), yc, t.z + o * Math.sin(a)));
          col.copy(GREEN[Math.floor(((t.seed * 7 + k * 0.37) % 1) * GREEN.length)]);
          if (autumn > 0) col.lerp(AUT[Math.floor(((t.seed * 5 + k * 0.29) % 1) * AUT.length)], autumn);
          col.lerp(BARE, clamp(1 - leaf));
          col.lerp(SNOW, snow * 0.6);
          crowns.setColorAt(i * 3 + k, col);
        }
      }
      trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true; crowns.instanceColor.needsUpdate = true;
    },
  };
}
