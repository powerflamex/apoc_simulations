// Loose things in the air: leaves and papers already skittering down the street on frame 0, bags, cups, cans, cones;
// shingles off the roofs, bricks off the fronts, chunks of the road at the end; the streaks of dirt streaming past you
// (more as the wind rises); and the hail: baseball-size stones falling at ~100 mph, driven forward by the wind,
// with white bursts where they hit the cars round you.
import * as THREE from 'three';
import { rng, smooth, clamp, lerp } from './util.js';
import { CAM0, ROAD_X, FX, BLD } from './layout.js';
import { CARS } from './traffic.js';
import { V_LIFT1, V_ROOFS, V_GLASS, V_PEEL, V_HAIL, windInt } from './timeline.js';
import { flight, gone } from './fly.js';

const KINDS = {
  leaf: { n: 260, t0: [-3, 14], lift: 2.5, tau: 0.25, r: 0.15 },
  paper: { n: 160, t0: [0.5, 16], lift: 3.5, tau: 0.3, r: 0.25 },
  bag: { n: 40, t0: [4, 18], lift: 5, tau: 0.3, r: 0.3 },
  cup: { n: 70, t0: [8, 20], lift: 2, tau: 0.4, r: 0.2 },
  can: { n: 50, t0: [12, 22], lift: 2, tau: 0.5, r: 0.2 },
  cone: { n: 14, t0: [17, 23], lift: 4, tau: 0.8, r: 0.5 },
  shingle: { n: 320, t0: [V_ROOFS - 1, V_ROOFS + 8], lift: 8, tau: 0.5, r: 0.4, roof: true },
  brick: { n: 220, t0: [V_GLASS + 2, V_GLASS + 12], lift: 5, tau: 1.0, r: 0.3, wall: true },
  chunk: { n: 180, t0: [V_PEEL - 0.3, V_PEEL + 4.2], lift: 10, tau: 1.2, r: 1.0, road: true },
};

export function makeDebris(scene, ctx) {
  const R = rng(4040);
  const geos = {
    leaf: new THREE.PlaneGeometry(0.12, 0.08),
    paper: new THREE.PlaneGeometry(0.3, 0.21),
    bag: new THREE.SphereGeometry(0.16, 6, 4).scale(1, 0.6, 0.8),
    cup: new THREE.CylinderGeometry(0.04, 0.03, 0.11, 8),
    can: new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8),
    cone: new THREE.ConeGeometry(0.17, 0.7, 8),
    shingle: new THREE.BoxGeometry(0.5, 0.02, 0.35),
    brick: new THREE.BoxGeometry(0.24, 0.07, 0.11),
    chunk: new THREE.BoxGeometry(1.2, 0.12, 0.9),
  };
  const mats = {
    leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
    bag: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.85 }),
    cup: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    can: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.7 }),
    cone: new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.6 }),
    shingle: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    brick: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    chunk: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 }),
  };
  const LEAF = [0x8a7a2a, 0xa0522d, 0x6a7a2a, 0xc08a2a, 0x7a5a1a];
  const PAPER = [0xf2f0ea, 0xffe680, 0xff9ac0, 0xa0d8ff, 0xffffff];
  const SH = [0x3a3634, 0x4a4442, 0x5a5048, 0x2a2826];
  const BR = [0x8c4b3b, 0x9a5a44, 0x7a4030, 0xa5664e];
  const items = {};
  const col = new THREE.Color();
  for (const [k, def] of Object.entries(KINDS)) {
    const mesh = new THREE.InstancedMesh(geos[k], mats[k], def.n);
    mesh.frustumCulled = false; mesh.castShadow = k === 'cone' || k === 'chunk';
    scene.add(mesh);
    const list = [];
    for (let i = 0; i < def.n; i++) {
      let x, y = 0, z;
      if (def.roof) {
        const b = BLD[Math.floor(R() * BLD.length)];
        x = b.x + (R() - 0.5) * b.w * 0.8; z = b.z + (R() - 0.5) * b.d * 0.8; y = b.h + 0.4;
      } else if (def.wall) {
        const b = BLD[Math.floor(R() * BLD.length)];
        x = b.x - b.side * b.w / 2; z = b.z + (R() - 0.5) * b.d * 0.9; y = b.h - 0.2 - R() * 2;
      } else if (def.road) {
        x = (R() - 0.5) * ROAD_X * 1.8; z = -35 - R() * 120; y = 0.06;
      } else {
        do { x = CAM0.x - 14 + R() * 28; z = CAM0.z + 30 - R() * 120; } while ((x - CAM0.x) ** 2 + (z - CAM0.z) ** 2 < 2.5);
      }
      const t0 = lerp(def.t0[0], def.t0[1], R()) + 2.5 * smooth(-150, 10, z) * (def.road || def.roof || def.wall ? 0 : 1);
      const it = { x, y, z, t0, tau: def.tau * (0.7 + 0.6 * R()), lift: def.lift * (0.7 + 0.6 * R()), r: def.r, seed: R(), ph: R() * 10, sp: (R() - 0.5) * 8, s: 0.8 + R() * 0.5, ground: y > 0.5 ? 0.3 : 0.02 };
      if (k === 'chunk') it.s = 0.5 + R() * 1.8;
      list.push(it);
      if (k === 'leaf') mesh.setColorAt(i, col.set(LEAF[i % LEAF.length]));
      if (k === 'paper') mesh.setColorAt(i, col.set(PAPER[i % PAPER.length]));
      if (k === 'bag') mesh.setColorAt(i, col.set(i % 3 ? 0xf4f4f0 : 0xc8e0f0));
      if (k === 'cup') mesh.setColorAt(i, col.set(i % 2 ? 0xf4f4f0 : 0xc02020));
      if (k === 'can') mesh.setColorAt(i, col.set([0xc02020, 0x2050c0, 0xd0d0d0, 0x20a040][i % 4]));
      if (k === 'shingle') mesh.setColorAt(i, col.set(SH[i % SH.length]));
      if (k === 'brick') mesh.setColorAt(i, col.set(BR[i % BR.length]));
    }
    items[k] = { mesh, list };
  }
  // the streaks of dirt in the air
  const NS = 1800;
  const streakGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
  const streakMat = new THREE.MeshBasicMaterial({ color: 0x4a3d30, transparent: true, opacity: 0.32, toneMapped: true });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, NS);
  streaks.frustumCulled = false;
  scene.add(streaks);
  const SL = [];
  for (let i = 0; i < NS; i++) SL.push({ x: CAM0.x + (R() - 0.5) * 40, y: 0.2 + Math.pow(R(), 1.8) * 9, z0: R() * 170, ph: R() });
  // the hail
  const NH = 700;
  const hailGeo = new THREE.IcosahedronGeometry(0.03, 1);
  const hailMat = new THREE.MeshBasicMaterial({ color: 0xc4ccd4, transparent: true, opacity: 0.55 });
  const hail = new THREE.InstancedMesh(hailGeo, hailMat, NH);
  hail.frustumCulled = false;
  scene.add(hail);
  const HL = [];
  for (let i = 0; i < NH; i++) HL.push({ x: CAM0.x + (R() - 0.5) * 30, z0: CAM0.z - 2 - R() * 70, off: R() * 30, s: 0.5 + R() * 0.6, ph: R() });
  // where the stones hit the cars round you: white bursts (positions over the parking lanes near you)
  const HITS = [];
  const NEARCARS = CARS.filter((c) => c.parked && c.z > -75);
  for (let i = 0; i < 160; i++) { const c = NEARCARS[Math.floor(R() * NEARCARS.length)]; HITS.push({ t: V_HAIL + 0.3 + R() * 9, x: c.x + (R() - 0.5) * 1.6, y: 1.1 + R() * 0.5, z: c.z + (R() - 0.5) * 1.6 }); }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const fl = {};
  return {
    frame(v, s, glows) {
      const W = s.W;
      for (const [k, { mesh, list }] of Object.entries(items)) {
        list.forEach((it, i) => {
          const t = v - it.t0;
          if ((k === 'chunk') && t < 0) { mesh.setMatrixAt(i, zero); return; }
          let x = it.x, y = it.y, z = it.z;
          let rx = k === 'paper' || k === 'leaf' ? -Math.PI / 2 : k === 'cup' || k === 'can' ? Math.PI / 2 : 0, ry = it.ph, rz = 0;
          if (t > 0) {
            fl.x = it.x; fl.y = it.y; fl.z = it.z; fl.t0 = it.t0; fl.tau = it.tau; fl.lift = it.lift; fl.r = it.r; fl.seed = it.seed; fl.ground = it.ground;
            const f = flight(fl, v, {});
            if (gone(f, s) || f.z < -600) { mesh.setMatrixAt(i, zero); return; }
            x = f.x; y = f.y; z = f.z;
            rx += it.sp * t * 0.6; ry += it.sp * t * 0.4; rz += it.sp * t * 0.5;
          } else if (k === 'paper' || k === 'leaf' || k === 'bag') {
            rx += 0.2 * Math.sin(v * 9 + it.ph) * smooth(it.t0 - 3, it.t0, v);
          }
          e.set(rx, ry, rz);
          q.setFromEuler(e);
          m4.compose(p.set(x, y, z), q, sc.set(it.s, it.s, it.s));
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      // the streaks: a field of dirt streaming toward the wall, wrapping round; more of it as the wind rises
      const shift = windInt(v);
      const nOn = Math.round(NS * (0.03 + 0.97 * smooth(10, 38, v)));
      const len = Math.min(0.03 * W, 2.4);
      for (let i = 0; i < NS; i++) {
        if (i >= nOn) { streaks.setMatrixAt(i, zero); continue; }
        const st = SL[i];
        // the air spirals in: each streak of dirt curves round toward the wall instead of flying dead straight
        const run = (st.z0 + shift * (0.8 + 0.4 * st.ph)) % 170;
        const z = CAM0.z + 40 - run;
        const ang = 0.55 * Math.sin(run * 0.022 + st.ph * 6.28);
        const x = st.x + 26 * (1 - Math.cos(run * 0.022 + st.ph * 6.28)) * 0.5 - 13;
        const y = st.y + 2 * Math.sin(v * 2 + st.ph * 20) * smooth(20, 40, v);
        e.set(0, ang, 0); q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, sc.set(1, 1, len * (0.5 + st.ph)));
        streaks.setMatrixAt(i, m4);
      }
      streaks.instanceMatrix.needsUpdate = true;
      streaks.visible = nOn > 0;
      // the hail: falling at ~45 m/s, carried forward by the wind
      const nh = Math.round(NH * s.hail);
      const tilt = Math.atan2(0.5 * W, 45);
      for (let i = 0; i < NH; i++) {
        if (i >= nh) { hail.setMatrixAt(i, zero); continue; }
        const h = HL[i];
        const fall = ((v - V_HAIL) * 45 + h.off) % 30;
        const y = 30 - fall;
        const z = h.z0 - fall * Math.tan(tilt) * 0.6;
        e.set(-tilt, 0, 0); q.setFromEuler(e);
        m4.compose(p.set(h.x, y, z), q, sc.set(h.s * 0.8, h.s * 13, h.s * 0.8));
        hail.setMatrixAt(i, m4);
      }
      hail.instanceMatrix.needsUpdate = true;
      hail.visible = nh > 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt > 0 && dt < 0.14) { const k = 1 - dt / 0.14; glows.add(h.x, h.y, h.z, 0.35 + 0.5 * (1 - k), 6 * k, 6 * k, 7 * k); }
      }
    },
  };
}
