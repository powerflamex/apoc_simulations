// Low-poly articulated people, instanced: torso, head with hair, two arms and two legs that swing
// when walking or running, bend when sitting, and lift when someone points or holds up a phone.
//   const crowd = makeCrowd(scene, n, mat);  crowd.color(i, shirt, pants, skin, hair);
//   each frame: crowd.pose(i, { x, y, z, yaw, ... }) for every person, then crowd.commit().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HIP = 0.9, SHOULDER = 1.42;
const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), loc = new THREE.Matrix4(), rot = new THREE.Matrix4();
const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), sc = new THREE.Vector3();
const tmpC = new THREE.Color();

export function makeCrowd(scene, n, mat, { castShadow = true } = {}) {
  const torsoGeo = mergeGeometries([
    new THREE.BoxGeometry(0.34, 0.52, 0.2).translate(0, HIP + 0.27, 0),
    new THREE.BoxGeometry(0.3, 0.12, 0.19).translate(0, HIP + 0.04, 0),          // hips
  ]);
  const legGeo = new THREE.BoxGeometry(0.13, HIP, 0.15).translate(0, -HIP / 2, 0);
  const armGeo = new THREE.BoxGeometry(0.085, 0.6, 0.1).translate(0, -0.3, 0);
  const headGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6).translate(0, SHOULDER + 0.06, 0),   // neck
    new THREE.SphereGeometry(0.11, 10, 8).scale(0.92, 1.05, 1).translate(0, SHOULDER + 0.2, 0),
  ]);
  const hairGeo = new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.05, 1.05).translate(0, SHOULDER + 0.215, -0.015);
  const mk = (g) => { const m = new THREE.InstancedMesh(g, mat, n); m.castShadow = castShadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const torso = mk(torsoGeo), head = mk(headGeo), hair = mk(hairGeo);
  const legs = [mk(legGeo), mk(legGeo)], arms = [mk(armGeo), mk(armGeo)];
  const all = [torso, head, hair, ...legs, ...arms];
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);

  function part(mesh, i, ox, oy, rx, rz = 0) {
    e.set(rx, 0, rz, 'XYZ');
    loc.makeRotationFromEuler(e).setPosition(ox, oy, 0);
    m4.multiplyMatrices(base, loc);
    mesh.setMatrixAt(i, m4);
  }

  return {
    meshes: all,
    color(i, shirt, pants, skin, hairC, sleeves = true) {
      torso.setColorAt(i, tmpC.set(shirt));
      legs.forEach((m) => m.setColorAt(i, tmpC.set(pants)));
      arms.forEach((m) => m.setColorAt(i, tmpC.set(sleeves ? shirt : skin)));
      head.setColorAt(i, tmpC.set(skin));
      hair.setColorAt(i, tmpC.set(hairC));
    },
    // walk: gait phase (radians); stride: 0 standing .. 1 walking .. 1.6 running; sit: 0..1;
    // pitch: whole-body tilt (+ = forward, ±PI/2 lying); armL/armR: 0 hanging .. 1 raised forward (phone) .. 1.6 overhead
    pose(i, { x, y, z, yaw = 0, s = 1, walk = 0, stride = 0, sit = 0, pitch = 0, roll = 0, armL = 0, armR = 0, look = 0, visible = true }) {
      if (!visible || s <= 1e-4) { for (const m of all) m.setMatrixAt(i, hide); return; }
      const sw = Math.sin(walk) * 0.42 * stride;
      const bob = Math.abs(Math.cos(walk)) * 0.045 * stride;
      const lean = pitch + 0.08 * Math.max(stride - 1, 0) + 0.06 * sit;
      e.set(lean, yaw, roll, 'YXZ');
      q.setFromEuler(e);
      v.set(x, y + bob - sit * 0.42, z);
      sc.set(s, s, s);
      base.compose(v, q, sc);
      part(torso, i, 0, 0, 0);
      // head tilts back when looking up
      e.set(-look * 0.55, 0, 0, 'XYZ');
      rot.makeRotationFromEuler(e);
      loc.makeTranslation(0, SHOULDER, 0).multiply(rot).multiply(m4.makeTranslation(0, -SHOULDER, 0));
      head.setMatrixAt(i, m4.multiplyMatrices(base, loc));
      hair.setMatrixAt(i, m4);
      const legSit = -1.45 * sit;
      part(legs[0], i, -0.085, HIP, sw + legSit);
      part(legs[1], i, 0.085, HIP, -sw + legSit);
      const armSw = 0.75 * sw;
      part(arms[0], i, -0.215, SHOULDER - 0.02, -armSw - armL * 1.45, -0.07 - 0.15 * Math.max(armL - 1, 0));
      part(arms[1], i, 0.215, SHOULDER - 0.02, armSw - armR * 1.45, 0.07 + 0.15 * Math.max(armR - 1, 0));
    },
    commit() { for (const m of all) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } },
  };
}

export const SKIN = [0xf1c8a6, 0xe0ac86, 0xc68a62, 0x9a6440, 0x6e4528, 0xf6d5bd, 0xd59b72];
export const HAIR = [0x1d1612, 0x2e2018, 0x4a3020, 0x6b4a2a, 0xa07a48, 0xd8c08a, 0x8c8c8c, 0x151515];
