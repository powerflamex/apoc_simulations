// The buildings (one instanced box each, look in facade.js; they sway and ride the ground in quake.js), and what
// comes off them: bricks and trim shaken off the old fronts from magnitude ~7, glass, then whole buildings
// crumbling down in their own dust (each at its own magnitude: old painted ones first, the towers last).
import * as THREE from 'three';
import { B, groundY } from './layout.js';
import { vAtMag } from './timeline.js';
import { facadeMaterial } from './facade.js';
import { quakeDepth, quakeMat } from './quake.js';
import { rng, smooth, clamp } from './util.js';

const SINK = 8;   // every box starts this far under the ground (the street slopes)
const m4 = new THREE.Matrix4(), mS = new THREE.Matrix4(), mR = new THREE.Matrix4(), mT = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();

export function fallState(b, v) {
  const k = clamp((v - b.vFall) / b.dur);
  if (k <= 0) return { left: 1, tip: 0, k: 0 };
  const e = k * k;
  return { left: 1 - (1 - Math.min(0.08, 5 / b.h)) * smooth(0.02, 1, e), tip: b.lean * Math.sin(Math.min(e * 1.3, 1) * Math.PI / 2), k };
}

export function makeBuildings(scene) {
  const n = B.length;
  B.forEach((b) => { b.vGlass = vAtMag(b.mGlass); b.vBrick = vAtMag(b.mBrick); b.vFall = vAtMag(b.mFall); b.vOff = Math.min(vAtMag(8.2 + b.seed * 0.6), b.vFall); });
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 4);
  B.forEach((b, i) => { aT.set([b.vGlass, 1e9, b.vFall, b.dur], i * 4); aS.set([b.seed, b.kind, b.vOff, b.h + SINK], i * 4); });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.customDepthMaterial = quakeDepth({ sway: true });
  B.forEach((b, i) => mesh.setColorAt(i, col.set(b.col)));
  scene.add(mesh);

  // ---------- chunks: bricks and trim off the old fronts, broken concrete when a building comes down ----------
  const CH = [];
  const R = rng(616);
  for (const b of B) {
    if (b.far) continue;
    const xf = b.x - (b.side || 1) * b.w / 2;
    const face = () => ({ x: b.front ? xf - (b.side || 1) * 0.3 : b.x + (R() - 0.5) * b.w, z: b.z + (R() - 0.5) * b.d });
    if (b.kind === 0 && b.front) for (let k = 0; k < 14; k++) {
      const p = face();
      CH.push({ x: p.x, y: b.y0 + b.h * (0.4 + 0.6 * R()), z: p.z, v: b.vBrick + R() * 3, sz: [0.25 + R() * 0.5, 0.12 + R() * 0.15, 0.2 + R() * 0.4], c: R() < 0.5 ? b.col : 0xf2efe8, seed: R(), out: -(b.side || 1) * (0.5 + R() * 1.5) });
    }
    const nc = b.landmark ? 120 : b.h > 60 ? 40 : 16;
    for (let k = 0; k < nc; k++) {
      const p = face();
      CH.push({ x: p.x, y: b.y0 + b.h * (0.15 + 0.85 * R()), z: p.z, v: b.vFall + R() * b.dur * 0.9, sz: [0.6 + R() * 2.2, 0.3 + R() * 1.0, 0.6 + R() * 2.0], c: 0x8d877e, seed: R(), out: (R() - 0.5) * 4 });
    }
  }
  const chunkMat = quakeMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), {});
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chunkMat, CH.length);
  chunks.castShadow = true; chunks.frustumCulled = false;
  CH.forEach((c, i) => { chunks.setColorAt(i, col.set(c.c)); chunks.setMatrixAt(i, HIDE); });
  scene.add(chunks);
  const e3 = new THREE.Euler(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();

  return {
    mesh, chunks,
    frame(v, s, smoke) {
      // ---- the buildings: crumbling down (a little lean), the box sunk into the slope ----
      for (let i = 0; i < n; i++) {
        const b = B[i];
        const st = fallState(b, v);
        const hh = (b.h + SINK) * st.left;
        m4.makeTranslation(b.x, b.y0 - SINK, b.z).multiply(mS.makeScale(b.w, Math.max(hh, 0.01), b.d));
        if (st.tip !== 0) m4.premultiply(mT.makeTranslation(-b.x, -b.y0, -b.z)).premultiply(mR.makeRotationX(st.tip)).premultiply(mT.makeTranslation(b.x, b.y0, b.z));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // ---- chunks: thrown off, falling (g), bouncing once, then lying in the street (riding the ground) ----
      for (let i = 0; i < CH.length; i++) {
        const c = CH[i];
        const dt = v - c.v;
        if (dt < 0) { chunks.setMatrixAt(i, HIDE); continue; }
        let y, x = c.x, z = c.z;
        // land on the ground below the face (the street's level there)
        const yl = c.landY ?? (c.landY = groundY(c.x + c.out, c.z));
        const drop = c.y - yl;
        const tf = Math.sqrt(2 * Math.max(drop, 0.01) / 9.8);
        if (dt < tf) { y = c.y - 4.9 * dt * dt; x = c.x + c.out * dt; }
        else { const b2 = dt - tf; y = yl + Math.max(0, 1.2 * b2 - 4.9 * b2 * b2) + c.sz[1] / 2; x = c.x + c.out * tf + c.out * 0.3 * Math.min(b2, 0.6); }
        const tos = s.toss > 0 ? s.toss * Math.max(0, Math.sin(v * 3.1 + c.seed * 20)) * (0.5 + c.seed) : 0;
        const ang = Math.min(dt, tf + 0.3) * (3 + c.seed * 6) + tos * 0.8;
        e3.set(ang * Math.sin(c.seed * 9), c.seed * 6, ang * Math.cos(c.seed * 7));
        q.setFromEuler(e3);
        chunks.setMatrixAt(i, m4.compose(pos.set(x, y + tos, z), q, sc.set(c.sz[0], c.sz[1], c.sz[2])));
      }
      chunks.instanceMatrix.needsUpdate = true;
      // ---- dust: off the shedding fronts, and a boiling cloud where each building comes down ----
      for (const b of B) {
        if (b.far && b.h < 60) continue;
        const dtB = v - b.vFall;
        if (dtB > -0.2 && dtB < b.dur + 7) {
          const span = Math.max(b.w, b.d);
          const np = b.landmark ? 30 : b.h > 60 ? 12 : 6;
          const Rb = rng(Math.round(b.seed * 1e6));
          for (let k = 0; k < np; k++) {
            const vs = b.vFall + (k / np) * b.dur * 1.1;
            const ox = (Rb() - 0.5) * b.w, oz = (Rb() - 0.5) * b.d, oy = b.h * (1 - k / np) * 0.8 * Rb(), seed = Rb();
            const age = v - vs;
            if (age < 0 || age > 7) continue;
            const r = span * (0.25 + 0.25 * seed) + age * (2 + span * 0.07);
            const a = 0.08 * smooth(0, 0.3, age) * (1 - smooth(4, 7, age)) * smooth(30, 90, Math.hypot(b.x - 0, b.z - 14));
            smoke.puff(b.x + ox, b.y0 + Math.max(r * 0.45, oy + age * 2), b.z + oz, r, a, 0.66 + 0.12 * seed, 0, seed);
          }
        }
        // the brick dust off the old fronts
        if (b.kind === 0 && b.front && v > b.vBrick && v < b.vBrick + 6) {
          const age = v - b.vBrick;
          const xf = b.x - (b.side || 1) * (b.w / 2 + 1);
          smoke.puff(xf, b.y0 + 2 + age * 1.5, b.z, 2.5 + age * 1.0, 0.07 * smooth(0, 0.4, age) * (1 - smooth(3, 6, age)) * smooth(15, 50, Math.hypot(xf, b.z - 14)), 0.7, 0, b.seed);
        }
      }
    },
  };
}
