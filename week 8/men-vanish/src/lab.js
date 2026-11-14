// Day 14: a sperm bank's storage room. Rows of steel liquid-nitrogen tanks (dewars) under cold white ceiling lights, a
// frost-rimmed neck on each. A technician in a lab coat and blue gloves lifts a canister of frozen samples (straws in a
// rack) out of an open tank; white nitrogen vapour pours over the rim and rolls off the canister and down the tank's side.
// The camera eases in toward her. A separate scene (its own lights), drawn instead of the street while it's on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCrowd } from './crowd.js';
import { makeSmoke } from './smoke.js';
import { V_LAB } from './timeline.js';
import { smooth, keys } from './util.js';

export function makeLab() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1418);
  const mat = (color, rough = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  // the room: 9 m x 7 m, 3 m high
  const room = new THREE.Mesh(new THREE.BoxGeometry(9, 3.1, 7).translate(0, 1.55, 0), mat(0xd8dde2, 0.85, { side: THREE.BackSide }));
  room.receiveShadow = true;
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7).rotateX(-Math.PI / 2), mat(0x9aa4aa, 0.45));
  floor.position.y = 0.002; floor.receiveShadow = true;
  scene.add(floor);
  // ceiling light panels
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.35, 2.5) });
  for (const [x, z] of [[-2.2, -1.5], [2.2, -1.5], [-2.2, 1.6], [2.2, 1.6], [0, 0]]) {
    const pnl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6).rotateX(Math.PI / 2), panelMat);
    pnl.position.set(x, 3.08, z);
    scene.add(pnl);
  }
  // a sign on the back wall
  {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#1d4a7a'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#ffffff'; g.font = '900 96px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CRYO STORAGE', 512, 100);
    g.font = '700 54px Arial, sans-serif'; g.fillStyle = '#bfe0ff'; g.fillText('LIQUID NITROGEN  −196 °C', 512, 190);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 }));
    sign.position.set(0.6, 2.3, -3.48);
    scene.add(sign);
  }
  // the tanks: a steel body, a shoulder, a narrow neck with a frosted rim, a foam lid
  const steel = mat(0xc8ccd0, 0.28, { metalness: 0.85 });
  const tankGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.36, 0.36, 0.86, 28).translate(0, 0.43, 0),
    new THREE.CylinderGeometry(0.12, 0.36, 0.16, 28).translate(0, 0.94, 0),
    new THREE.CylinderGeometry(0.11, 0.11, 0.1, 20).translate(0, 1.07, 0),
  ].map((g) => g.toNonIndexed()));
  const frostGeo = new THREE.TorusGeometry(0.115, 0.03, 8, 24).rotateX(Math.PI / 2).translate(0, 1.12, 0);
  const lidGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16).translate(0, 1.16, 0);
  const TANKS = [];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) TANKS.push({ x: -3.1 + k * 0.95 + (r % 2) * 0.3, z: -2.6 + r * 1.05 });
  TANKS.push({ x: 0.15, z: 1.15, open: true });   // (hers: in front, open)
  const tanks = new THREE.InstancedMesh(tankGeo, steel, TANKS.length);
  const frost = new THREE.InstancedMesh(frostGeo, mat(0xf4f8fc, 0.9), TANKS.length);
  const lids = new THREE.InstancedMesh(lidGeo, mat(0xe8e0d0, 0.8), TANKS.length);
  const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  TANKS.forEach((t, i) => {
    tanks.setMatrixAt(i, m4.makeTranslation(t.x, 0, t.z));
    frost.setMatrixAt(i, m4);
    lids.setMatrixAt(i, t.open ? zero : m4);
  });
  for (const m of [tanks, frost, lids]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // the canister: a rack of coloured straws on a long handle
  const can = new THREE.Group();
  {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 14, 1, true).translate(0, 0.21, 0), mat(0xc8ccd0, 0.45, { metalness: 0.35, side: THREE.DoubleSide }));
    can.add(tube);
    const COLS = [0xe84a4a, 0x4a8ae8, 0xf0d040, 0x4ac870, 0xe88ad0];
    for (let k = 0; k < 10; k++) {
      const a = k * 0.63, s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.38, 6).translate(0, 0.21, 0), mat(COLS[k % 5], 0.4));
      s.position.set(Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025);
      can.add(s);
    }
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6).translate(0, 0.55, 0), mat(0xb0b4b8, 0.5, { metalness: 0.3 }));
    can.add(handle);
    can.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  scene.add(can);
  // a steel bench at the side with sample racks; a monitor
  {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.7).translate(0, 0.45, 0), mat(0xb8bcc0, 0.4, { metalness: 0.5 }));
    bench.position.set(3.0, 0, 0.4); bench.rotation.y = -Math.PI / 2; bench.castShadow = true; bench.receiveShadow = true;
    scene.add(bench);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 1.2) }));
    mon.position.set(3.15, 1.3, 0.2); mon.rotation.y = -Math.PI / 2;
    scene.add(mon);
  }
  // the people: the technician at her tank, a colleague at the bench (lab coats: white, long)
  const crowd = makeCrowd(scene, 2, mat(0xffffff, 0.8), { castShadow: true });
  crowd.color(0, 0xf4f6f8, 0xf4f6f8, 0xc68a62, 0x1d1612, false);
  crowd.color(1, 0xf4f6f8, 0x2b2d42, 0xf1c8a6, 0x8a5a30, false);
  const coat = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.19, 0.27, 0.62, 12, 1, true).translate(0, 0.9 - 0.25, 0), mat(0xf4f6f8, 0.85, { side: THREE.DoubleSide }), 2);
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8).scale(0.13, 0.24, 0.085).translate(0, 1.52, -0.08), mat(0x1d1612, 0.75), 2);
  hair.setColorAt(1, new THREE.Color(0x8a5a30));
  const gloves = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), mat(0x3a7ae0, 0.5), 2);
  for (const m of [coat, hair]) { m.castShadow = true; scene.add(m); }   // (gloves: too small to read; left out)
  // the vapour (white, heavy: it pours down)
  const smoke = makeSmoke(scene, 300);
  // lights: the ceiling (cool white), a soft fill
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x707880, 1.4);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xf0f6ff, 60, 14, 0.9, 0.6);
  key.position.set(0.8, 3.0, 2.2); key.target.position.set(0.1, 0.8, 0.9);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xcfe0ff, 6, 10);
  fill.position.set(-2.5, 2.6, 0.5);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(46, 1080 / 1920, 0.05, 60);
  camera.rotation.order = 'YXZ';
  const T = TANKS[TANKS.length - 1];
  const base = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), vv = new THREE.Vector3(), sc = new THREE.Vector3(), mm = new THREE.Matrix4();
  return {
    scene, camera, smoke,
    frame(v) {
      const t = v - V_LAB;
      // the camera eases in and down toward the open tank
      camera.position.set(keys([[0, 2.0], [5, 1.6]], t), keys([[0, 1.55], [5, 1.45]], t), keys([[0, 3.9], [5, 3.1]], t));
      camera.lookAt(T.x - 0.1, 1.15, T.z - 0.25);
      camera.fov = keys([[0, 44], [5, 40]], t);
      camera.updateProjectionMatrix();
      // the canister rises out of the tank (she lifts it by the handle), held up to look at, vapour pouring off it
      const lift = smooth(0.4, 2.4, t);
      const cy = 0.6 + 0.6 * lift;
      can.position.set(T.x, cy, T.z);
      // her: standing behind the tank, facing the camera a little, both hands on the handle
      const P = { x: T.x + 0.05, z: T.z - 0.48, yaw: 0.3 };
      const look = -0.35 + 0.35 * lift;
      crowd.pose(0, { x: P.x, y: 0, z: P.z, yaw: P.yaw, s: 0.98, armL: 0.55 + 0.6 * lift, armR: 0.6 + 0.6 * lift, look, pitch: 0.06 - 0.04 * lift });
      crowd.pose(1, { x: 2.75, y: 0, z: 0.7, yaw: Math.PI / 2 + 0.2, s: 0.95, armL: 0.6, armR: 0.65, look: -0.4, pitch: 0.12 });
      crowd.commit();
      const poses = [[P.x, P.z, P.yaw, 0.98, 0.06 - 0.04 * lift], [2.75, 0.7, Math.PI / 2 + 0.2, 0.95, 0.12]];
      poses.forEach(([x, z, yaw, s, pitch], k) => {
        e.set(pitch, yaw, 0, 'YXZ'); q.setFromEuler(e);
        base.compose(vv.set(x, 0, z), q, sc.setScalar(s));
        coat.setMatrixAt(k, base);
        hair.setMatrixAt(k, base);
      });
      // gloves at the canister's handle top
      gloves.setMatrixAt(0, mm.makeTranslation(T.x - 0.03, cy + 0.66, T.z + 0.02));
      gloves.setMatrixAt(1, mm.makeTranslation(T.x + 0.04, cy + 0.6, T.z - 0.01));
      coat.instanceMatrix.needsUpdate = hair.instanceMatrix.needsUpdate = gloves.instanceMatrix.needsUpdate = true;
      // vapour: pouring over the open neck and down the side, and streaming off the cold canister
      smoke.begin();
      for (let k = 0; k < 0; k++) {   // (no pour-down puffs: they read as dark blobs)
        const TT = 2.2, age = ((t + k * TT / 18) % TT + TT) % TT, a = k * 2.39;
        const out = 0.12 + age * 0.22;
        smoke.puff(T.x + Math.cos(a) * out, Math.max(0.06, 1.12 - age * 0.45), T.z + Math.sin(a) * out, 0.04 + age * 0.06, 0.1 * Math.sin(Math.PI * age / TT), 1.0, 0.9, (k * 0.13) % 1);
      }
      for (let k = 0; k < 26; k++) {
        const TT = 1.6, age = ((t + k * TT / 26) % TT + TT) % TT, a = k * 2.39;
        smoke.puff(T.x + Math.cos(a) * (0.05 + age * 0.1), cy + 0.05 + ((k * 0.37) % 1) * 0.55 - age * 0.35, T.z + Math.sin(a) * (0.05 + age * 0.1), 0.035 + age * 0.05, 0.09 * lift * Math.sin(Math.PI * age / TT), 1.0, 0.35, (k * 0.29) % 1);
      }
      smoke.end();
      smoke.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uLight.value.setRGB(2.1, 2.2, 2.35);
    },
  };
}
