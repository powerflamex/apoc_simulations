// In the air: an airliner on approach, high over the city with its landing lights on (it can't hold its height
// as it gets heavier: nose up, sinking, then it stalls and plunges behind the skyline, a fireball and smoke), and a
// flock of pigeons crossing the plaza that flap harder and harder and come down on the paving.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANE, CAM } from './layout.js';
import { gAt, vAtG } from './timeline.js';
import { smooth, clamp, keys, rng, lerp } from './util.js';

const dummy = new THREE.Object3D();

// the airliner's path: flying right to left 1.65 km out, 85 m/s; height and attitude by video time
export function planeAt(v) {
  const x = 720 - 85 * (v + 3);
  const vc = PLANE.crash;
  const y = keys([[-5, 900], [1.0, 890], [3.0, 860], [4.6, 760], [5.6, 560], [6.3, 300], [vc, 0]], v);
  const pitch = keys([[-5, 0.02], [2.0, 0.04], [3.6, 0.2], [4.8, 0.26], [5.4, 0.0], [6.0, -0.5], [vc, -0.62]], v);
  const roll = keys([[-5, 0], [4.8, 0.05], [5.8, -0.35], [vc, -0.5]], v);
  return { x, y, z: PLANE.z, pitch, roll };
}

export function makeAir(scene, { plainMat, glowMat, shadowy }) {
  // ---------- the airliner (twin-jet, ~38 m long) ----------
  const plane = new THREE.Group();
  {
    const white = plainMat(0xe8ebee, 0.4, { metalness: 0.3 });
    const grey = plainMat(0x9aa1a8, 0.5, { metalness: 0.4 });
    const fus = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(2.0, 2.0, 30, 14).rotateZ(Math.PI / 2).toNonIndexed(),
      new THREE.SphereGeometry(2.0, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(2.0, 1, 1).translate(15, 0, 0).toNonIndexed(),
      new THREE.ConeGeometry(2.0, 8, 14).rotateZ(Math.PI / 2).translate(-19, 0.6, 0).toNonIndexed(),
    ]), white);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 35).translate(1, -0.8, 0), grey);
    const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 12).translate(-20, 1.2, 0), grey);
    const tailV = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 0.4).translate(-20.5, 4.5, 0), white);
    const eng = new THREE.Mesh(mergeGeometries([-1, 1].map((s) => new THREE.CylinderGeometry(1.2, 1.1, 4.5, 12).rotateZ(Math.PI / 2).translate(3, -2.2, s * 6.5).toNonIndexed())), grey);
    plane.add(fus, wing, tailH, tailV, eng);
    plane.scale.setScalar(1.6);   // a wide-body (~60 m)
    scene.add(plane);
  }
  // ---------- pigeons ----------
  const NB = 34;
  const R = rng(66);
  const birds = Array.from({ length: NB }, (_, i) => ({
    x0: -26 + R() * 10, z0: -6 - R() * 18, y0: 7 + R() * 7, vx: 6 + R() * 2.5, vz: (R() - 0.5) * 2, ph: R() * 6, seed: R(),
    gDown: 1.6 + R() * 0.7,
  }));
  const bodyGeo = new THREE.SphereGeometry(0.08, 8, 6).scale(2.2, 1, 1);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.12, 0, 0.02, 0.0, 0, 0.42, -0.1, 0, 0.36, 0.12, 0, 0.02, -0.1, 0, 0.36, -0.12, 0, 0.02], 3));
  wingGeo.computeVertexNormals();
  const pmat = plainMat(0xa9aeb6, 0.8, { side: THREE.DoubleSide });
  const bodies = new THREE.InstancedMesh(bodyGeo, pmat, NB);
  const wl = new THREE.InstancedMesh(wingGeo, pmat, NB), wr = new THREE.InstancedMesh(wingGeo, pmat, NB);
  for (const m of [bodies, wl, wr]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
  // where each bird is at time v: flying across, labouring, then dropping onto the plaza
  const birdAt = (b, v) => {
    const vd = vAtG(b.gDown);
    const t = v + 3;
    const fly = Math.min(v, vd);
    let x = b.x0 + b.vx * (fly + 3) * (1 - 0.35 * smooth(-1, vd, fly));
    let z = b.z0 + b.vz * (fly + 3);
    // sinking as it labours: the wings can't hold the weight
    let y = b.y0 - (gAt(fly) - 1) * 2.6 + Math.sin(t * 2 + b.ph) * 0.3;
    let flap = 1 + 1.6 * smooth(-2, vd, v);
    let down = 0;
    if (v > vd) {
      // falling: glide-crash onto the paving
      const tt = v - vd;
      const gg = 9.81 * gAt(vd);
      const vx = b.vx * 0.5;
      x += vx * Math.min(tt, 0.6);
      y = Math.max(0.12, y - 0.5 * gg * tt * tt * 0.6);
      down = smooth(0, 0.6, tt);
      flap *= 1 - smooth(0.2, 0.8, tt);
    }
    return { x, y: Math.max(0.12, y), z, flap, down };
  };
  return {
    plane,
    birdAt, birds,
    frame(v, s, glows) {
      // airliner
      const p = planeAt(v);
      const vis = v < PLANE.crash;
      plane.visible = vis;
      if (vis) {
        plane.position.set(p.x, p.y, p.z);
        plane.rotation.set(p.roll, Math.PI, p.pitch, 'YXZ');   // nose toward -x
        plane.rotation.set(0, 0, 0);
        plane.rotateY(Math.PI);
        plane.rotateZ(p.pitch);
        plane.rotateX(p.roll);
        // landing lights (two bright points at the wing roots), nav lights, a strobe
        const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(plane.quaternion);
        const side = new THREE.Vector3(0, 0, 1).applyQuaternion(plane.quaternion);
        const ll = 14 + 6 * Math.max(0, Math.cos(p.pitch));
        glows.add(p.x + fwd.x * 9 + side.x * 3, p.y + fwd.y * 6 - 1, p.z + side.z * 2, ll, 6, 5.6, 5);
        glows.add(p.x + fwd.x * 9 - side.x * 3, p.y + fwd.y * 6 - 1, p.z - side.z * 2, ll, 6, 5.6, 5);
        glows.add(p.x + side.x * 28, p.y - 1.3, p.z + side.z * 28, 7, 3, 0.2, 0.2);
        glows.add(p.x - side.x * 28, p.y - 1.3, p.z - side.z * 28, 7, 0.2, 3, 0.4);
        if ((v * 1.1) % 1 < 0.06) glows.add(p.x - fwd.x * 20, p.y + 7, p.z, 8, 5, 5, 5);
      }
      // the crash: a fireball behind the skyline, then a burning glow and smoke (world.js draws the smoke)
      const dt = v - PLANE.crash;
      if (dt > 0) {
        const cx = planeAt(PLANE.crash).x;
        const fb = Math.exp(-dt * 1.4) * smooth(0, 0.12, dt);
        glows.add(cx, 40 + 60 * smooth(0, 1, dt), PLANE.z, 260 + 220 * smooth(0, 0.8, dt), 9 * fb, 4 * fb, 1.2 * fb);
        const burn = smooth(0.3, 1.5, dt) * (1 - smooth(18, 26, v));
        glows.add(cx, 15, PLANE.z, 140, 1.6 * burn, 0.55 * burn, 0.12 * burn);
      }
      // pigeons
      birds.forEach((b, i) => {
        const q = birdAt(b, v);
        const yaw = Math.atan2(-b.vz, b.vx);
        dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(0, yaw, q.down * 0.4); dummy.scale.setScalar(1); dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        const fl = Math.sin((v + 3) * 13 * q.flap + b.ph) * 0.55 * (1 - q.down) + q.down * 0.1;   // (wider beats would read as a cone from below)
        for (const [m, sd] of [[wl, 1], [wr, -1]]) {
          dummy.position.set(q.x, q.y + 0.03, q.z);
          dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          const base = dummy.matrix.clone();
          dummy.position.set(0, 0, 0); dummy.rotation.set(sd * fl, 0, 0); dummy.scale.set(1, 1, sd); dummy.updateMatrix();
          m.setMatrixAt(i, base.multiply(dummy.matrix));
        }
      });
      bodies.instanceMatrix.needsUpdate = wl.instanceMatrix.needsUpdate = wr.instanceMatrix.needsUpdate = true;
    },
  };
}
