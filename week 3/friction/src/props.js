// Street lamps and trees. A street lamp stands on four bolts, and a nut only stays on its bolt by friction: one by
// one they spin loose and the posts topple (into the street or onto the sidewalk) and slide off down the hill.
// Trees are rooted in the soil: they stay until the hillside goes, then ride down with it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, TREES } from './layout.js';
import { tOf, slide, ride, bulldoze, hill, surfaceY, slabD, VT, SLAB, Z_EDGE, WATER_Y, V_SLIDE } from './timeline.js';
import { rng, smooth } from './util.js';

const dummy = new THREE.Object3D();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const sl = {}, rd = {};

// where something rooted (a tree, a standing lamp) is once the hillside goes: { dz, dy, gone }
function carried(x, z0, v, out) {
  out.dz = 0; out.dy = 0; out.gone = false; out.tip = 0;
  if (v <= V_SLIDE) return out;
  if (z0 < SLAB.toe) {
    ride(z0, v, rd);
    out.dz = rd.z - z0; out.dy = rd.y - hill(z0); out.tip = rd.phase >= 2 ? Math.min(1.4, rd.dt * 1.5) : 0.08 * Math.sin(v * 1.3 + x);
    out.gone = rd.phase === 3 && rd.dt > 2;
  } else {
    const sh = bulldoze(z0, v);
    if (sh > 0) {
      const z = z0 + sh;
      out.dz = sh; out.dy = (z < Z_EDGE ? surfaceY(z, slabD(v)) : WATER_Y) - hill(z0); out.tip = Math.min(1.5, sh * 0.3);
      out.gone = z > Z_EDGE + 15;
    }
  }
  return out;
}

export function makeProps(scene, { plainMat, shadowy }) {
  const R = rng(321);
  // ---------- lamp posts: a fluted post with a single lantern on a short arm ----------
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.2, 0.6, 8).translate(0, 0.3, 0),
    new THREE.CylinderGeometry(0.07, 0.1, 7.2, 8).translate(0, 4.2, 0),
    new THREE.BoxGeometry(1.4, 0.08, 0.08).translate(0.6, 7.7, 0),
    new THREE.CylinderGeometry(0.22, 0.12, 0.45, 6).translate(1.25, 7.5, 0),
  ].map((g) => g.toNonIndexed()));
  const lamps = shadowy(new THREE.InstancedMesh(lampGeo, plainMat(0x34443c, 0.5, { metalness: 0.4 }), LAMPS.length));
  scene.add(lamps);
  LAMPS.forEach((l) => { l.yaw = l.side > 0 ? Math.PI : 0; l.street = R() < 0.55; });
  // ---------- trees: a trunk and a rounded crown; palms on the waterfront lawn ----------
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 3.2, 6).translate(0, 1.6, 0);
  const crownGeo = mergeGeometries([0, 1, 2, 3].map((k) => new THREE.IcosahedronGeometry(1.1 + 0.2 * k % 0.5, 1).scale(1, 0.85, 1).translate(Math.cos(k * 1.7) * 0.7, 3.8 + (k % 2) * 0.5, Math.sin(k * 1.7) * 0.7).toNonIndexed()));
  const palmTrunk = new THREE.CylinderGeometry(0.18, 0.28, 9, 7).translate(0, 4.5, 0);
  const frond = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    frond.push(new THREE.BoxGeometry(0.5, 0.05, 3.2).translate(0, 0, 1.6).rotateX(0.5).rotateY(a).translate(0, 9.1, 0).toNonIndexed());
  }
  const palmCrown = mergeGeometries(frond);
  const NT = TREES.filter((t) => !t.palm), NP = TREES.filter((t) => t.palm);
  const trunks = shadowy(new THREE.InstancedMesh(trunkGeo, plainMat(0x4a3a2c, 0.95), NT.length));
  const crowns = shadowy(new THREE.InstancedMesh(crownGeo, plainMat(0xffffff, 0.9, { flatShading: true }), NT.length));
  const pTr = shadowy(new THREE.InstancedMesh(palmTrunk, plainMat(0x6a5a46, 0.95), NP.length));
  const pCr = shadowy(new THREE.InstancedMesh(palmCrown, plainMat(0x3f6a2a, 0.9), NP.length));
  scene.add(trunks, crowns, pTr, pCr);
  const leafC = new THREE.Color();
  NT.forEach((t, i) => crowns.setColorAt(i, leafC.setHSL(0.24 + R() * 0.07, 0.4 + R() * 0.2, 0.22 + R() * 0.1)));
  const cr = {};

  return {
    frame(v, s, glows) {
      // lamps: stand, then topple (a rigid pole falling: slow, then fast), then slide off down the hill
      LAMPS.forEach((l, i) => {
        const tf = 1.25;                                 // how long it takes to go over
        const k = v < l.vFall ? 0 : Math.min(1, Math.pow((v - l.vFall) / tf, 2));
        let x = l.x, z = l.z0, y = hill(l.z0), yaw = l.yaw;
        let rx = 0, rz = 0;
        if (v >= l.vFall) {
          const ang = k * Math.PI / 2 * 0.97;
          // into the street (about z: its top swings toward the middle) or down the hill (about x: toward +z)
          if (l.street) rz = l.side * ang; else rx = ang;
          if (v > l.vFall + tf) {
            slide({ z0: l.z0, ts: tOf(l.vFall + tf), vt: VT.lamp, u0: 1.5 }, tOf(v), sl);
            if (sl.phase === 3 && sl.dt > 2.5) { lamps.setMatrixAt(i, HIDE); return; }
            z = sl.z; y = sl.y + 0.15; yaw += (sl.z - l.z0) * 0.01 * (l.seed - 0.5);
          }
        } else {
          carried(x, z, v, cr);
          if (cr.gone) { lamps.setMatrixAt(i, HIDE); return; }
          z += cr.dz; y += cr.dy; rx = cr.tip;
          const on = s.grid * (1 - smooth(l.vFall - 0.2, l.vFall, v));
          if (on > 0.01 && v < V_SLIDE + 2) glows.add(x + (l.side > 0 ? -1.25 : 1.25), y + 7.4, z, 1.3, 1.9 * on, 1.4 * on, 0.8 * on);
        }
        dummy.position.set(x, y, z); dummy.rotation.set(rx, 0, rz, 'XYZ');
        dummy.updateMatrix();
        dummy.matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
        lamps.setMatrixAt(i, dummy.matrix);
      });
      lamps.instanceMatrix.needsUpdate = true;
      // trees: ride the hillside when it goes
      NT.forEach((t, i) => {
        carried(t.x, t.z0, v, cr);
        if (cr.gone) { trunks.setMatrixAt(i, HIDE); crowns.setMatrixAt(i, HIDE); return; }
        dummy.position.set(t.x, hill(t.z0) + cr.dy, t.z0 + cr.dz);
        dummy.rotation.set(cr.tip + 0.02 * Math.sin(v * 1.1 + t.seed * 9), t.seed * 6, 0.05 * Math.sin(v * 0.9 + t.seed * 5));
        dummy.scale.setScalar(t.s); dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix); crowns.setMatrixAt(i, dummy.matrix);
      });
      trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
      NP.forEach((t, i) => {
        carried(t.x, t.z0, v, cr);
        if (cr.gone) { pTr.setMatrixAt(i, HIDE); pCr.setMatrixAt(i, HIDE); return; }
        dummy.position.set(t.x, hill(t.z0) + cr.dy, t.z0 + cr.dz);
        dummy.rotation.set(cr.tip, t.seed * 6, 0.04 * Math.sin(v * 0.7 + t.seed * 3));
        dummy.scale.setScalar(t.s); dummy.updateMatrix();
        pTr.setMatrixAt(i, dummy.matrix); pCr.setMatrixAt(i, dummy.matrix);
      });
      pTr.instanceMatrix.needsUpdate = true; pCr.instanceMatrix.needsUpdate = true;
    },
  };
}
