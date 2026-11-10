// The buildings (one instanced box each, look in facade.js), how they come down, and what comes off them:
// broken concrete thrown out as a building folds, dust billowing from the collapse, glass glittering down from
// every window that bursts. A building comes down by sinking into its own dust while it tips away from the crater.
import * as THREE from 'three';
import { B, CROWN } from './layout.js';
import { facadeMaterial, F } from './facade.js';
import { rng, smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mR = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();
const ax = new THREE.Vector3();
const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();

export function fallState(b, v) {
  const k = clamp((v - b.vFall) / b.dur);
  if (k <= 0) return { tip: 0, left: 1, k: 0 };
  const ek = k * k;
  const tip = b.lean * Math.sin(Math.min(ek * 1.3, 1) * Math.PI / 2) * (1 - smooth(0.8, 1, k) * 0.7);
  const rubble = Math.min(0.12, 7 / b.h);
  return { tip, left: 1 - (1 - rubble) * smooth(0.02, 1, ek), k };
}

export function makeBuildings(scene) {
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 4), aC = new Float32Array(n * 4);
  B.forEach((b, i) => {
    aT.set([b.vGlass, b.vFire, b.vFall, b.dur], i * 4);
    aS.set([b.seed, b.kind, b.vOff, b.h], i * 4);
    if (b.crown >= 0) { col.set(CROWN[b.crown]); aC.set([col.r * 1.6, col.g * 1.6, col.b * 1.6, 1], i * 4); }
  });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  mesh.frustumCulled = false;
  B.forEach((b, i) => mesh.setColorAt(i, col.set(b.col)));
  scene.add(mesh);

  // ---------- broken concrete from the buildings that come down ----------
  const CH = [];
  const R = rng(616);
  const falling = B.filter((b) => b.vFall < 1e8);
  for (const b of falling) {
    const nc = b.h > 100 ? 70 : 40;
    const dir = Math.atan2(b.z, b.x);
    for (let k = 0; k < nc; k++) {
      const a = dir + (R() - 0.5) * 2.2;
      const sp = 3 + R() * 10;
      CH.push({ x: b.x + (R() - 0.5) * b.w, y: b.h * (0.15 + 0.85 * R()), z: b.z + (R() - 0.5) * b.d, v: b.vFall + R() * b.dur * 0.9,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: R() * 4, sz: [0.8 + R() * 2.8, 0.4 + R() * 1.4, 0.8 + R() * 2.4], spin: (R() - 0.5) * 6, seed: R(), c: R() < 0.3 ? b.col : 0x8a857c });
    }
  }
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), Math.max(1, CH.length));
  chunks.frustumCulled = false;
  CH.forEach((c, i) => { chunks.setColorAt(i, col.set(c.c)); chunks.setMatrixAt(i, HIDE); });
  scene.add(chunks);

  // where glass comes from: points over the faces of the buildings near the crossing
  const glassFrom = [];
  for (const b of B) {
    if (b.vGlass > 1e8 || b.dN > 300) continue;
    const ns = Math.round(clamp(b.h / 2.5, 8, 90));
    for (let k = 0; k < ns; k++) {
      const face = Math.floor(R() * 4);
      const fx = face < 2 ? b.x + (face ? 1 : -1) * b.w / 2 : b.x + (R() - 0.5) * b.w;
      const fz = face >= 2 ? b.z + (face === 2 ? 1 : -1) * b.d / 2 : b.z + (R() - 0.5) * b.d;
      const y = 4 + R() * (b.h - 4);
      glassFrom.push({ x: fx, y, z: fz, v: b.vGlass + 0.35 * (y / b.h) + 0.45 * R(), out: face, seed: R() });
    }
  }

  return {
    mesh, glassFrom,
    frame(v, smoke, glows) {
      F.uTime.value = v;
      for (let i = 0; i < n; i++) {
        const b = B[i];
        if (v < b.vFall) { mesh.setMatrixAt(i, mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, b.h, b.d))); continue; }
        const st = fallState(b, v);
        mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, b.h * st.left, b.d));
        // tip away from the crater about the foot on that side
        const dl = Math.hypot(b.x, b.z) || 1, ux = b.x / dl, uz = b.z / dl;
        const px = b.x + ux * b.w / 2, pz = b.z + uz * b.d / 2;
        ax.set(uz, 0, -ux);
        mR.makeRotationAxis(ax, -Math.abs(st.tip));
        m4.makeTranslation(px, 0, pz).multiply(mR).multiply(mB.makeTranslation(-px, 0, -pz)).multiply(mA);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // concrete thrown out of the collapse
      for (let i = 0; i < CH.length; i++) {
        const c = CH[i];
        const dt = v - c.v;
        if (dt < 0) { chunks.setMatrixAt(i, HIDE); continue; }
        const tg = (c.vy + Math.sqrt(c.vy * c.vy + 2 * 9.8 * c.y)) / 9.8;   // time to the ground
        const tt = Math.min(dt, tg);
        const x = c.x + c.vx * tt, z = c.z + c.vz * tt, y = Math.max(c.sz[1] / 2, c.y + c.vy * tt - 4.9 * tt * tt);
        e.set(c.seed * 6 + c.spin * tt, c.seed * 3 + c.spin * tt * 0.7, c.seed * 9);
        q.setFromEuler(e);
        m4.compose(pos.set(x, y, z), q, sc.set(c.sz[0], c.sz[1], c.sz[2]));
        chunks.setMatrixAt(i, m4);
      }
      chunks.instanceMatrix.needsUpdate = true;
      // dust: a grey cloud billowing out of each collapse and rolling along the ground
      for (const b of falling) {
        const dtB = v - b.vFall;
        if (dtB < 0 || dtB > b.dur + 9) continue;
        const span = Math.max(b.w, b.d);
        const Rb = rng(Math.round(b.seed * 1e6));
        const np = b.h > 100 ? 26 : 16;
        for (let k = 0; k < np; k++) {
          const vs = b.vFall + (k / np) * b.dur;
          const a = Rb() * Math.PI * 2, seed = Rb(), oy = Rb();
          if (v < vs) continue;
          const age = v - vs;
          if (age > 8) continue;
          const spread = (span * 0.4 + 7 * (1 - Math.exp(-age * 0.7))) * (0.6 + 0.6 * seed);
          const r = span * 0.25 + age * 3.2;
          const y = Math.max(r * 0.5, b.h * (1 - k / np) * 0.6 * oy * Math.exp(-age * 0.5) + age * 1.5);
          const a2 = 0.32 * smooth(0, 0.25, age) * (1 - smooth(4, 8, age));
          smoke.puff(b.x + Math.cos(a) * spread, y, b.z + Math.sin(a) * spread, r, a2, 0.55 + 0.15 * seed, 0, seed);
        }
      }
      // fires: flames and smoke over the burning buildings (lit from below)
      for (const b of B) {
        if (v < b.vFire || b.dN > 160) continue;
        const age = v - b.vFire;
        const st = fallState(b, v);
        const Rb = rng(Math.round(b.seed * 7e5) + 3);
        const top = Math.max(4, b.h * st.left * Math.min(1, 0.15 + age * 0.08));
        for (let k = 0; k < 5; k++) {
          const ox = (Rb() - 0.5) * b.w * 0.8, oz = (Rb() - 0.5) * b.d * 0.8, seed = Rb();
          const ph = ((v * (0.12 + 0.05 * seed) + seed) % 1);
          const y = top * (0.4 + 0.6 * Rb()) + ph * 60;
          const r = 6 + ph * 22 + b.w * 0.15;
          smoke.puff(b.x + ox + ph * 12, y, b.z + oz, r, 0.3 * Math.sin(Math.PI * ph) * smooth(0, 2, age), 0.1, (1 - ph) * 0.8, seed);
          glows.add(b.x + ox, top * (0.3 + 0.5 * seed), b.z + oz, 10 + b.w * 0.3, 2.2, 0.8, 0.22);
        }
      }
    },
  };
}
