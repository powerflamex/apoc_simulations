// Gojo, built from simple shapes but readable at a glance: tall (1.9 m), a dark navy high-collared uniform with a
// long coat, white hair spiking up over a black blindfold, pale skin. He floats; at the Domain Expansion he pulls
// the blindfold down and his eyes glow blue. pose() takes joint angles; the root sits at his feet.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';

export function makeGojo(scene) {
  const M = (c, r = 0.75, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });
  const navy = M(0x232c48, 0.62), navy2 = M(0x2a3352, 0.6), skin = M(0xf0d2bd, 0.55), shoe = M(0x0c0c0e, 0.4),
    hair = M(0xf5f7fb, 0.6, { emissive: new THREE.Color(0.18, 0.2, 0.24) }), band = M(0x060608, 0.5),
    eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 5.5, 9.0) }), button = M(0xb8a060, 0.3, { metalness: 0.8 });
  const mats = [navy, navy2, skin, shoe, hair, band, button];
  // a faint cool rim on his outline, so he reads against the lit towers at night
  for (const m of [navy, navy2, skin, hair, shoe]) {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.35, 0.55, 1.0) * 0.55 * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);`);
    };
    m.customProgramCacheKey = () => 'gojo-rim';
  }
  const cap = (r, len, m) => { const g = new THREE.CapsuleGeometry(r, len, 6, 14).translate(0, -len / 2 - r * 0.2, 0); return new THREE.Mesh(g, m); };
  const root = new THREE.Group();
  scene.add(root);
  const body = new THREE.Group(); body.position.y = 0.98; root.add(body);   // hips
  // torso + long coat (lathe: flares from the waist to mid-thigh)
  const torso = new THREE.Group(); body.add(torso);
  torso.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 6, 16).scale(1.05, 1, 0.68).translate(0, 0.3, 0), navy));
  const skirt = new THREE.LatheGeometry([[0.18, 0.06], [0.2, -0.05], [0.235, -0.25], [0.26, -0.42], [0.245, -0.44]].map(([r, y]) => new THREE.Vector2(r, y)), 20).scale(1, 1, 0.75);
  const skirtM = new THREE.Mesh(skirt, navy2); torso.add(skirtM);
  // the front opening line and buttons
  torso.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.01).translate(0, 0.28, 0.125), M(0x0a0c14, 0.6)));
  for (let k = 0; k < 4; k++) torso.add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4).translate(0.018, 0.45 - k * 0.11, 0.125), button));
  // high collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.095, 0.17, 18, 1, true).translate(0, 0.62, 0), navy2);
  collar.material = navy2.clone(); collar.material.side = THREE.DoubleSide;
  torso.add(collar);
  const neck = new THREE.Group(); neck.position.set(0, 0.64, 0); torso.add(neck);
  const head = new THREE.Group(); neck.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16).scale(0.9, 1.1, 0.98).translate(0, 0.11, 0.008), skin));
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03).translate(0, 0.085, 0.1), skin));   // nose
  // blindfold: a black band round the eyes (pulled down to the neck for the Domain)
  const blind = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.1, 0.055, 24, 1, true).translate(0, 0, 0), band);
  blind.material.side = THREE.DoubleSide;
  const blindG = new THREE.Group(); blindG.position.set(0, 0.125, 0.008); blindG.add(blind); head.add(blindG);
  let hairM = null;
  const eyes = new THREE.Group();
  for (const sx of [-1, 1]) eyes.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6).translate(sx * 0.034, 0.125, 0.092), eye));
  eyes.visible = false; head.add(eyes);
  // white hair: a cap and ~60 spikes swept up and out (the band pushes it up)
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(0.97, 1.08, 1.04).translate(0, 0.135, -0.006), hair));
  {
    const R = rng(7);
    const spikes = [];
    for (let k = 0; k < 64; k++) {
      // direction on the upper head: mostly up and back, some forward over the band
      const th = R() * Math.PI * 2;
      const el = 0.25 + R() * 1.1;
      const dir = new THREE.Vector3(Math.cos(th) * Math.cos(el), Math.sin(el) + 0.35, Math.sin(th) * Math.cos(el) * 0.9 - 0.12).normalize();
      if (dir.z > 0.55 && dir.y < 0.5) dir.y += 0.4;
      dir.normalize();
      const len = 0.07 + R() * 0.11, r0 = 0.022 + R() * 0.018;
      const g = new THREE.ConeGeometry(r0, len, 5).translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.applyQuaternion(q);
      const base = dir.clone().multiplyScalar(0.088).add(new THREE.Vector3(0, 0.15, -0.006));
      g.translate(base.x, base.y, base.z);
      spikes.push(g.toNonIndexed());
    }
    // a few locks falling over the front of the band
    for (let k = 0; k < 7; k++) {
      const g = new THREE.ConeGeometry(0.018, 0.08, 4).rotateX(Math.PI).translate(-0.06 + k * 0.02, 0.17, 0.09).rotateX(-0.25);
      spikes.push(g.toNonIndexed());
    }
    hairM = new THREE.Mesh(mergeGeometries(spikes), hair); head.add(hairM);
  }
  // arms and legs (shoulders / hips are groups; elbows / knees inside)
  const limb = (parent, x, y, r1, l1, r2, l2, m1, m2) => {
    const a = new THREE.Group(); a.position.set(x, y, 0); parent.add(a);
    a.add(cap(r1, l1, m1));
    const b = new THREE.Group(); b.position.set(0, -l1 - r1 * 0.3, 0); a.add(b);
    b.add(cap(r2, l2, m2));
    const end = new THREE.Group(); end.position.set(0, -l2 - r2 * 0.5, 0); b.add(end);
    return { a, b, end };
  };
  const armL = limb(torso, -0.215, 0.5, 0.058, 0.25, 0.05, 0.22, navy, navy);
  const armR = limb(torso, 0.215, 0.5, 0.058, 0.25, 0.05, 0.22, navy, navy);
  const legL = limb(body, -0.1, -0.02, 0.075, 0.4, 0.062, 0.4, navy2, navy2);
  const legR = limb(body, 0.1, -0.02, 0.075, 0.4, 0.062, 0.4, navy2, navy2);
  for (const L of [legL, legR]) L.end.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.27).translate(0, -0.02, 0.06), shoe));
  // hands: a palm and fingers; index + middle can stand straight up (his sign)
  const mkHand = (s) => {
    const h = new THREE.Group();
    h.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.028).translate(0, -0.045, 0), skin));
    const fingers = [];
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Group(); f.position.set(s * (-0.027 + k * 0.018), -0.088, 0); h.add(f);
      f.add(cap(0.0085, 0.05 - Math.abs(k - 1.5) * 0.006, skin));
      fingers.push(f);
    }
    const th = new THREE.Group(); th.position.set(s * -0.04, -0.035, 0.01); h.add(th);
    th.add(cap(0.01, 0.035, skin)); th.rotation.z = s * -0.7;
    return { h, fingers, th };
  };
  const handL = mkHand(-1), handR = mkHand(1);
  armL.end.add(handL.h); armR.end.add(handR.h);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  // where his right / left hand is in the world (for the orbs)
  const tmp = new THREE.Vector3();
  return {
    root, mats, eyes, blindG,
    handPos(side, out) { root.updateMatrixWorld(true); return (side > 0 ? handR : handL).fingers[1].getWorldPosition(out); },
    headPos(out) { root.updateMatrixWorld(true); return head.getWorldPosition(out); },
    // q: { x, y, z, yaw, lean, sh: [L, R] (forward/up), shOut: [L, R], el: [L, R], hip: [L, R], knee: [L, R], head (down +),
    //      headYaw, fing: [L, R] (0 open hand .. 1 two fingers up), wrist: [L, R], blind (0 on .. 1 down at the neck) }
    pose(q) {
      root.position.set(q.x, q.y, q.z);
      root.rotation.set(0, q.yaw || 0, 0);
      body.rotation.set(q.lean || 0, 0, q.roll || 0);
      neck.rotation.set(q.head || 0, q.headYaw || 0, 0);
      const arm = (A, H, sh, out, el, s, f, w) => {
        A.a.rotation.set(-sh, 0, s * out, 'ZXY'); A.b.rotation.set(-el, 0, 0);
        A.end.rotation.set(-(w || 0), 0, 0);
        H.fingers.forEach((fg, k) => { if (k === 1 || k === 2) fg.rotation.x = 0.25 * (1 - f); else fg.rotation.x = 0.4 + 1.1 * f; });
      };
      arm(armL, handL, q.sh[0], q.shOut[0], q.el[0], -1, q.fing ? q.fing[0] : 0, q.wrist ? q.wrist[0] : 0);
      arm(armR, handR, q.sh[1], q.shOut[1], q.el[1], 1, q.fing ? q.fing[1] : 0, q.wrist ? q.wrist[1] : 0);
      const leg = (Lg, h, k, s) => { Lg.a.rotation.set(-h, 0, s * 0.04, 'ZXY'); Lg.b.rotation.set(k, 0, 0); Lg.end.rotation.set(0.5 * k * 0.5 + 0.35, 0, 0); };
      leg(legL, q.hip[0], q.knee[0], -1);
      leg(legR, q.hip[1], q.knee[1], 1);
      // the coat flares and ripples in the pull of the air, the hair stirs
      const t = q.t || 0;
      skirtM.scale.set(1 + 0.07 * Math.sin(t * 2.3), 1, 1 + 0.1 * Math.sin(t * 1.9 + 1.0));
      skirtM.rotation.set(0.06 * Math.sin(t * 1.7), 0, 0.05 * Math.sin(t * 2.1 + 0.4));
      if (hairM) hairM.rotation.set(0.03 * Math.sin(t * 3.1), 0, 0.04 * Math.sin(t * 2.6 + 1.0));
      const bl = q.blind || 0;
      blindG.position.set(0, 0.125 - 0.13 * bl, 0.008 + 0.01 * bl);
      blindG.scale.setScalar(1 + 0.12 * bl);
      eyes.visible = bl > 0.6;
    },
  };
}
