// Loose things on the street: flyers and papers, plastic bags, open umbrellas, cans, traffic cones; chunks of asphalt
// once the ground breaks; and the water itself at the end. The shaking and the first gusts set the light ones drifting
// up (from ~22 s), the wind carries everything toward the planet, and at the end it all lifts off.
import * as THREE from 'three';
import { rng, smooth, clamp, lerp } from './util.js';
import { CAM0, ROAD_X, ROAD_Z } from './layout.js';
import { V_CRACK, V_WIND, V_LIFT } from './timeline.js';

const KINDS = {
  paper: { n: 140, t0: [V_CRACK + 1.4, V_WIND + 4], rise: 0.9 },
  bag: { n: 40, t0: [V_CRACK + 2.0, V_WIND + 3], rise: 0.8 },
  umbrella: { n: 26, t0: [V_WIND - 0.5, V_WIND + 6], rise: 0.7 },
  can: { n: 50, t0: [V_LIFT - 0.5, V_LIFT + 1.5], rise: 0.6 },
  cone: { n: 14, t0: [V_LIFT, V_LIFT + 2], rise: 0.5 },
  rock: { n: 120, t0: [V_LIFT + 0.5, V_LIFT + 4], rise: 0.6 },
  blob: { n: 260, t0: [V_LIFT - 0.3, V_LIFT + 4.5], rise: 0.7 },
};

export function makeDebris(scene, ctx) {
  const R = rng(4040);
  const geos = {
    paper: new THREE.PlaneGeometry(0.3, 0.21),
    bag: new THREE.SphereGeometry(0.16, 6, 4).scale(1, 0.6, 0.8),
    umbrella: new THREE.ConeGeometry(0.5, 0.28, 8, 1, true),
    can: new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8),
    cone: new THREE.ConeGeometry(0.17, 0.7, 8),
    rock: new THREE.DodecahedronGeometry(0.3, 0),
    blob: new THREE.IcosahedronGeometry(0.18, 1),
  };
  const mats = {
    paper: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
    bag: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.85 }),
    umbrella: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }),
    can: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.7 }),
    cone: new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.6 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.95 }),
    blob: new THREE.MeshStandardMaterial({ color: 0x0a1a1e, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.8 }),
  };
  const PAPER = [0xf2f0ea, 0xffe680, 0xff9ac0, 0xa0d8ff, 0xffffff];
  const UMB = [0xd02030, 0x2040c0, 0x111111, 0xf0c020, 0xffffff, 0x20a060, 0xff70a0];
  const items = {};
  const col = new THREE.Color();
  for (const [k, def] of Object.entries(KINDS)) {
    const mesh = new THREE.InstancedMesh(geos[k], mats[k], def.n);
    mesh.frustumCulled = false; mesh.castShadow = k === 'umbrella';
    scene.add(mesh);
    const list = [];
    for (let i = 0; i < def.n; i++) {
      // mostly in front of you: on the crossing and the near sidewalks, out to ~45 m
      let x, z;
      do { x = CAM0.x - 18 + R() * 40; z = CAM0.z - 2 - R() * 46; } while ((x - CAM0.x) ** 2 + (z - CAM0.z) ** 2 < 2.2);
      const it = { x, z, t0: lerp(def.t0[0], def.t0[1], R()), ph: R() * 10, sw: 0.4 + R() * 1.2, sp: (R() - 0.5) * 6, rise: def.rise * (0.7 + 0.6 * R()), s: 0.8 + R() * 0.5 };
      if (k === 'blob') it.s = 0.5 + R() * 2.2;
      if (k === 'rock') it.s = 0.4 + R() * 1.6;
      list.push(it);
      if (k === 'paper') mesh.setColorAt(i, col.set(PAPER[i % PAPER.length]));
      if (k === 'bag') mesh.setColorAt(i, col.set(i % 3 ? 0xf4f4f0 : 0xc8e0f0));
      if (k === 'umbrella') mesh.setColorAt(i, col.set(UMB[i % UMB.length]));
      if (k === 'can') mesh.setColorAt(i, col.set([0xc02020, 0x2050c0, 0xd0d0d0, 0x20a040][i % 4]));
    }
    items[k] = { mesh, list };
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    frame(v, s) {
      const level = Math.max(s.water, 0);
      for (const [k, { mesh, list }] of Object.entries(items)) {
        list.forEach((it, i) => {
          const t = v - it.t0;
          // rocks and water only exist once they lift; the rest lie on the street (floating once the water is up)
          if ((k === 'rock' || k === 'blob') && t < 0) { mesh.setMatrixAt(i, zero); return; }
          let x = it.x, y, z = it.z;
          const restY = k === 'paper' ? 0.01 : k === 'umbrella' ? 0.2 : k === 'cone' ? 0.35 : 0.08;
          y = Math.max(restY, level - (k === 'cone' ? 0.25 : 0.02));
          let rx = k === 'paper' ? -Math.PI / 2 : k === 'umbrella' ? 0.9 : k === 'can' ? Math.PI / 2 : 0, ry = it.ph, rz = 0;
          if (t > 0) {
            // drifting up, swirling, carried north by the wind; faster once everything lifts
            const lift = Math.max(0, v - V_LIFT);
            const h = it.rise * (0.6 * t + 0.18 * t * t) + 0.5 * 1.8 * lift * lift * (1 + 0.3 * lift);
            y += h;
            const sw = it.sw * smooth(0, 1.5, t);
            x += Math.sin(t * 1.7 + it.ph) * sw + 0.4 * t;
            z += Math.cos(t * 1.3 + it.ph) * sw - (0.5 + 2.2 * s.wind) * t * 0.6 - h * 0.3;
            rx += it.sp * t * 0.6; ry += it.sp * t * 0.4; rz += it.sp * t * 0.5;
          } else if (k === 'paper' || k === 'bag') {
            // fluttering in the gusts before they go
            rx += 0.15 * Math.sin(v * 9 + it.ph) * smooth(it.t0 - 3, it.t0, v);
          }
          let S = it.s;
          if (k === 'blob') S *= 1 + 0.15 * Math.sin(v * 6 + it.ph);
          e.set(rx, ry, rz);
          q.setFromEuler(e);
          m4.compose(p.set(x, y, z), q, sc.set(S, k === 'blob' ? S * (0.8 + 0.3 * Math.sin(v * 4 + it.ph)) : S, S));
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
