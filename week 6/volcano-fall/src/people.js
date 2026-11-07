// The onlookers round each end of the hole: crowd.js people (shared file) plus a face on every head (eyes,
// brows, an open "oh" mouth, from one small canvas texture) and phones held out, their flash lights on.
// Each person stands still and leans or stares; they sway a little and turn their heads (pure functions of time).
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { rng, wobble } from './util.js';

const SHOULDER = 1.42;
const SHIRT = [0x2a5ca8, 0xc0392b, 0xf2f2f2, 0x1d1d1d, 0xe6b422, 0x2e8b57, 0x8e44ad, 0xd35400, 0x34495e, 0xe8a0b4, 0x16a085, 0x7f8c8d, 0xb03a2e, 0x2c3e50];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x212121, 0x4a6fa5, 0x6b5b45, 0x3b3b3b, 0xc8b89a];

function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  // eyes (whites + dark irises), raised brows, an open mouth
  for (const x of [42, 86]) {
    g.fillStyle = 'rgba(250,246,240,0.95)';
    g.beginPath(); g.ellipse(x, 58, 11, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(40,28,20,1)';
    g.beginPath(); g.arc(x, 59, 5.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(45,30,20,0.9)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 12, 40); g.quadraticCurveTo(x, 32, x + 12, 40); g.stroke();
  }
  g.fillStyle = 'rgba(70,25,25,0.95)';
  g.beginPath(); g.ellipse(64, 96, 9, 11, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 62); g.lineTo(60, 80); g.lineTo(67, 82); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// specs: [{ x, z, yaw, pitch, look, armR, armL, phone, s, seed }]
export function makeOnlookers(parent, specs, { seed = 1 } = {}) {
  const R = rng(seed);
  const n = specs.length;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const group = new THREE.Group();
  parent.add(group);
  const crowd = makeCrowd(group, n, mat, { castShadow: false });
  specs.forEach((p, i) => {
    p.s ??= 0.94 + R() * 0.12;
    p.ph = R() * 10;
    crowd.color(i, SHIRT[Math.floor(R() * SHIRT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)], R() < 0.7);
  });
  const faceGeo = new THREE.PlaneGeometry(0.17, 0.17);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const faces = new THREE.InstancedMesh(faceGeo, faceMat, n);
  faces.frustumCulled = false;
  group.add(faces);
  const phones = specs.filter((p) => p.phone);
  const phoneGeo = new THREE.BoxGeometry(0.075, 0.15, 0.012);
  const phoneMesh = new THREE.InstancedMesh(phoneGeo, new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, metalness: 0.3, emissive: 0x9fc0ff, emissiveIntensity: 0.9 }), Math.max(1, phones.length));   // (screens on)
  phoneMesh.frustumCulled = false;
  group.add(phoneMesh);
  const flashGeo = new THREE.CircleGeometry(0.012, 10);
  const flashMesh = new THREE.InstancedMesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, phones.length));
  flashMesh.frustumCulled = false;
  flashMesh.material.color.setRGB(6, 6, 6);
  group.add(flashMesh);

  const base = new THREE.Matrix4(), loc = new THREE.Matrix4(), m4 = new THREE.Matrix4(), rot = new THREE.Matrix4();
  const e = new THREE.Euler(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();

  function update(t) {
    let pi = 0;
    specs.forEach((p, i) => {
      const sway = wobble(t * 0.6 + p.ph, i) * 0.04;
      const look = (p.look ?? 0) + wobble(t * 0.4 + p.ph * 2, i + 3) * 0.12;
      const yaw = p.yaw + wobble(t * 0.3 + p.ph, i + 7) * 0.08 + (p.turn ? p.turn(t) : 0);
      const pitch = (p.pitch ?? 0) + sway;
      const o = { x: p.x, y: p.y ?? 0, z: p.z, yaw, s: p.s, pitch, look, armL: p.armL ?? 0, armR: p.armR ?? 0 };
      if (p.pose) Object.assign(o, p.pose(t, o));
      crowd.pose(i, o);
      // the same head transform as crowd.js, to put the face (and a phone) in place
      e.set(o.pitch, o.yaw, 0, 'YXZ'); q.setFromEuler(e);
      base.compose(pos.set(o.x, o.y, o.z), q, sc.set(o.s, o.s, o.s));
      e.set(-o.look * 0.55, 0, 0, 'XYZ'); rot.makeRotationFromEuler(e);
      loc.makeTranslation(0, SHOULDER, 0).multiply(rot).multiply(m4.makeTranslation(0, -SHOULDER + 0.2 + SHOULDER, 0.106));
      faces.setMatrixAt(i, m4.multiplyMatrices(base, loc));
      if (p.phone) {
        // in the right hand, held out in front, screen toward the face, the flash pointing away
        e.set(-o.armR * 1.45, 0, 0.07, 'XYZ'); rot.makeRotationFromEuler(e);
        loc.makeTranslation(0.215, SHOULDER - 0.02, 0).multiply(rot).multiply(m4.makeTranslation(0, -0.62, 0.02));
        loc.multiply(m4.makeRotationX(Math.PI / 2 - 0.2));
        const pm = new THREE.Matrix4().multiplyMatrices(base, loc);
        phoneMesh.setMatrixAt(pi, pm);
        flashMesh.setMatrixAt(pi, pm.clone().multiply(m4.makeTranslation(0.022, 0.055, 0.0065)));
        pi++;
      }
    });
    crowd.commit();
    faces.instanceMatrix.needsUpdate = true;
    phoneMesh.instanceMatrix.needsUpdate = true;
    flashMesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update, crowd };
}
