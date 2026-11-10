// The buildings (one instanced box each, look in facade.js), how they come down, and what comes off them:
//   chunks: concrete and plaster from the shops when they are torn apart, cladding panels peeling off the towers,
//           broken concrete when a building folds, slabs of asphalt when the road is torn up
//   dust:   billowing clouds where a building comes down, carried east at the wind's speed
// A falling building tips east (downwind, toward the camera) about its east foot while it crumbles from the top.
import * as THREE from 'three';
import { B, LANDMARK, fallState, AVE, CROSS } from './layout.js';
import { V_ROAD, tOf, Wms, drift, vAtWind } from './timeline.js';
import { facadeMaterial, F } from './facade.js';
import { flight } from './fly.js';
import { tumbleMatrix } from './props.js';
import { rng, smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mR = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();
const fl = {};

export function makeBuildings(scene, { camPathZ }) {
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 4);
  B.forEach((b, i) => {
    aT.set([b.vGlass, b.vStrip, b.vFall, b.dur], i * 4);
    aS.set([b.seed, b.kind, b.vOff, b.h], i * 4);
  });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  B.forEach((b, i) => mesh.setColorAt(i, col.set(b.col)));
  scene.add(mesh);

  // ---------- chunks ----------
  const CH = [];
  const R = rng(616);
  const near = (b) => b.front || b.landmark || (Math.abs(b.x) < 120 && b.z > -900);
  for (const b of B) {
    if (b.far || b.z < -1500 || !near(b)) continue;
    const xf = b.x - b.side * b.w / 2;                  // the face toward the avenue
    const face = () => ({ x: b.front ? xf - b.side * 0.3 : b.x + (R() - 0.5) * b.w, z: b.z + (R() - 0.5) * b.d });
    if (b.kind === 0) {
      // torn apart: walls, roof, signs, everything
      for (let k = 0; k < 26; k++) {
        const p = face();
        CH.push({ x: p.x, y: 1 + R() * b.h, z: p.z, v: b.vFall + R() * b.dur * 0.8, tau: 2 + R() * 5, sz: [0.4 + R() * 1.6, 0.15 + R() * 0.5, 0.4 + R() * 1.4], c: R() < 0.6 ? b.col : 0x8a8580, lift: 4 + R() * 8, seed: R() });
      }
    } else {
      // cladding panels and glass peeling off (top first)
      const np = b.landmark ? 120 : b.h > 70 ? 40 : 18;
      for (let k = 0; k < np; k++) {
        const p = face(), hTop = R();
        CH.push({ x: p.x, y: b.h * (1 - hTop * 0.9), z: p.z, v: b.vStrip + 4.5 * (0.45 * hTop + 0.55 * R()), tau: 0.9 + R() * 1.6, sz: [1.4 + R() * 1.4, 0.05, 1.0 + R() * 1.6], c: b.kind === 2 ? 0x6f8ea6 : b.col, lift: 10 + R() * 14, seed: R(), panel: true });
      }
      // the collapse: broken concrete
      const nc = b.landmark ? 160 : b.h > 70 ? 36 : 20;
      for (let k = 0; k < nc; k++) {
        const p = face();
        CH.push({ x: p.x, y: b.h * (0.1 + 0.9 * R()), z: p.z, v: b.vFall + R() * b.dur, tau: 3 + R() * 7, sz: [0.6 + R() * 2.5, 0.3 + R() * 1.2, 0.6 + R() * 2.2], c: 0x8d877e, lift: 3 + R() * 6, seed: R() });
      }
    }
  }
  // the road torn up: slabs of asphalt along the avenue near the camera's path
  for (let k = 0; k < 700; k++) {
    const z = 40 - R() * 900;
    CH.push({ x: (R() - 0.5) * 2 * AVE.road, y: 0.2, z, v: V_ROAD + R() * 7 + Math.max(0, -z) * 0.002, tau: 4 + R() * 5, sz: [0.8 + R() * 2.2, 0.18, 0.6 + R() * 1.8], c: 0x1e1e20, lift: 4 + R() * 9, seed: R() });
  }
  CH.forEach((c) => { c.r = Math.max(...c.sz); c.ground = c.sz[1] / 2; c.keep = false; });
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chunkMat, CH.length);
  chunks.castShadow = true; chunks.frustumCulled = false;
  CH.forEach((c, i) => { chunks.setColorAt(i, col.set(c.c)); chunks.setMatrixAt(i, HIDE); });
  scene.add(chunks);

  // glass shards (GPU streaks) from every window that bursts, along the faces toward the avenue
  const glassFrom = [];
  for (const b of B) {
    if (b.far || !near(b) || b.z < -1200) continue;
    const xf = b.x - b.side * b.w / 2;
    const ns = b.landmark ? 400 : b.kind === 2 ? 90 : b.kind === 0 ? 20 : 45;
    for (let k = 0; k < ns; k++) glassFrom.push({ x: b.front ? xf - b.side * 0.3 : b.x + (R() - 0.5) * b.w, y: 3 + R() * (b.h - 3), z: b.z + (R() - 0.5) * b.d, ts: tOf(b.vGlass + R() * 2.2) });
  }

  return {
    mesh, CH, glassFrom,
    frame(v, s, smoke, camZ) {
      const t = tOf(v);
      F.uTime.value = v;
      // ---- the buildings ----
      for (let i = 0; i < n; i++) {
        const b = B[i];
        const st = fallState(b, v);
        const hh = b.h * st.left;
        mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, hh, b.d));
        if (st.tip > 0) {
          const pz = b.z + b.d / 2;
          m4.makeTranslation(b.x, 0, pz).multiply(mR.makeRotationX(st.tip)).multiply(mB.makeTranslation(-b.x, 0, -pz)).multiply(mA);
          mesh.setMatrixAt(i, m4);
        } else mesh.setMatrixAt(i, mA);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // ---- chunks ----
      for (let i = 0; i < CH.length; i++) {
        const c = CH[i];
        if (v < c.v) { chunks.setMatrixAt(i, HIDE); continue; }
        const f = flight(c, v, fl);
        if (f.z > camZ + 60 || f.dz > 2500 || f.dt > 14) { chunks.setMatrixAt(i, HIDE); continue; }
        const grow = smooth(0, 0.15, f.dt);
        chunks.setMatrixAt(i, tumbleMatrix(f.x, f.y, f.z, c.seed * 6, f.ang * (c.panel ? 1.6 : 1), c.seed, grow, c.sz[0], c.sz[1], c.sz[2]));
      }
      chunks.instanceMatrix.needsUpdate = true;
      // ---- dust where buildings come down: puffs released over the collapse, carried off downwind ----
      for (const b of B) {
        if (b.far && b.h < 60) continue;
        const dtB = v - b.vFall;
        if (dtB < 0 || dtB > b.dur + 6) continue;
        const span = Math.max(b.w, b.d);
        const np = b.landmark ? 60 : b.h > 70 ? 22 : 12;
        const Rb = rng(Math.round(b.seed * 1e6));
        for (let k = 0; k < np; k++) {
          const vs = b.vFall + (k / np) * b.dur * 1.1;
          const ox = (Rb() - 0.5) * b.w, oz = (Rb() - 0.5) * b.d, oy = b.h * (1 - k / np) * 0.9 * Rb();
          const seed = Rb();
          if (v < vs) continue;
          const age = v - vs;
          if (age > 5) continue;
          const z = b.z + oz + drift(tOf(vs), 0.35, t);
          if (z > camZ + 120) continue;
          const r = span * (0.25 + 0.35 * seed) + age * (6 + span * 0.25);
          const a = 0.16 * smooth(0, 0.2, age) * (1 - smooth(2.5, 5, age)) * smooth(r + 10, r + 80, Math.abs(z - camZ));
          smoke.puff(b.x + ox, Math.max(r * 0.4, oy + age * 3), z, r, a, 0.6 + 0.15 * seed, 0, seed);
        }
      }
    },
  };
}
