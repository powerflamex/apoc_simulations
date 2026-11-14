// Deer in the empty city: once the people have gone, white-tailed deer walk and graze where the cars drove. Like the
// people they are time-lapse ghosts (each frame catches different ones, smeared along their way), in the open meadow
// of the old avenue ahead of you and along the cross street.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AV, CZ, CR, YOU } from './layout.js';
import { rng, smooth } from './util.js';

const N = 22, COPIES = 3;
const lsm = (a, b, y) => smooth(Math.log10(a), Math.log10(b), Math.log10(Math.max(y, 1e-9)));

// a deer facing +z, its hooves on y = 0; grazing: the head down at the grass
function deerGeo(graze, buck) {
  const g = [];
  g.push(new THREE.SphereGeometry(1, 14, 10).scale(0.22, 0.27, 0.66).translate(0, 0.98, 0));                    // body
  g.push(new THREE.SphereGeometry(1, 10, 8).scale(0.2, 0.24, 0.24).translate(0, 1.0, 0.45));                     // chest
  g.push(new THREE.SphereGeometry(1, 10, 8).scale(0.2, 0.23, 0.25).translate(0, 1.0, -0.48));                    // haunch
  const neck = new THREE.CylinderGeometry(0.075, 0.11, 0.55, 8);
  if (graze) neck.rotateX(2.1).translate(0, 0.8, 0.78); else neck.rotateX(0.55).translate(0, 1.32, 0.66);
  g.push(neck);
  const hx = graze ? [0, 0.32, 1.02] : [0, 1.6, 0.86];
  const head = new THREE.SphereGeometry(1, 10, 8).scale(0.085, 0.09, 0.2);
  if (graze) head.rotateX(1.2);
  else head.rotateX(0.35);
  g.push(head.translate(...hx));
  for (const sx of [-1, 1]) {
    g.push(new THREE.SphereGeometry(1, 6, 5).scale(0.03, 0.08, 0.05).rotateZ(sx * 0.7).translate(sx * 0.09, hx[1] + 0.1, hx[2] - 0.08));   // ears
    if (buck) {
      const a = new THREE.CylinderGeometry(0.012, 0.018, 0.34, 5).rotateZ(sx * 0.45).rotateX(-0.3).translate(sx * 0.1, hx[1] + 0.22, hx[2] - 0.05);
      g.push(a, new THREE.CylinderGeometry(0.01, 0.012, 0.16, 5).rotateX(0.6).translate(sx * 0.16, hx[1] + 0.3, hx[2] + 0.03));
    }
  }
  g.push(new THREE.SphereGeometry(1, 6, 5).scale(0.06, 0.1, 0.05).translate(0, 1.06, -0.72));                    // tail
  // legs: a walking stride (front and back pairs apart)
  for (const [x, z, a] of [[-0.12, 0.42, 0.2], [0.12, 0.5, -0.15], [-0.12, -0.5, -0.2], [0.12, -0.42, 0.18]]) {
    g.push(new THREE.CylinderGeometry(0.025, 0.04, 0.86, 6).translate(0, -0.43, 0).rotateX(a).translate(x, 0.88, z));
  }
  return mergeGeometries(g.map((x) => x.toNonIndexed()));
}

export function makeDeer(scene, ghostMat, camPos) {
  const mat = ghostMat(0x8a5c38, 0.85);
  const kinds = [deerGeo(false, false), deerGeo(true, false), deerGeo(false, true)].map((geo) => {
    const m = new THREE.InstancedMesh(geo, mat, N * COPIES);
    m.frustumCulled = false; m.renderOrder = 2; m.receiveShadow = true;
    scene.add(m);
    return m;
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    frame(v, s) {
      const share = lsm(450, 1300, s.Y);
      const R = rng(Math.floor(v * 60 + 0.5) * 3571 + 5);
      for (const m of kinds) for (let i = 0; i < N * COPIES; i++) m.setMatrixAt(i, zero);
      for (let k = 0; k < N; k++) {
        const on = R() < share * 0.75;
        // the meadow up the avenue ahead of you, or along the cross street
        const av = R() < 0.7;
        const x = av ? (R() * 2 - 1) * (AV + 3) : -60 + R() * 120;
        const z = av ? YOU.z - 5 - Math.pow(R(), 1.6) * 70 : CZ + (R() * 2 - 1) * (CR + 2);
        const yaw = R() * Math.PI * 2, kind = R() < 0.35 ? 1 : R() < 0.25 ? 2 : 0;
        const sc = 0.9 + R() * 0.2;
        if (!on || Math.hypot(x - camPos.x, z - camPos.z) < 4 || Math.hypot(x - YOU.x, z - YOU.z) < 2.5) continue;
        for (let c = 0; c < COPIES; c++) {
          const st = kind === 1 ? 0.06 : 0.28;   // (grazing ones barely move)
          e.set(0, yaw, 0); q.setFromEuler(e);
          m4.compose(p.set(x - Math.sin(yaw) * st * c, 0, z - Math.cos(yaw) * st * c), q, one.set(sc, sc, sc));
          kinds[kind].setMatrixAt(k * COPIES + c, m4);
        }
      }
      for (const m of kinds) m.instanceMatrix.needsUpdate = true;
    },
  };
}
