// Everything in the city that your shoes and your stomps destroy: the buildings (instanced boxes, look in
// facade.js), the cars (cars.js), the street lamps and trees, the crowd (people.js), and the dust and glass that
// come off them. A building a shoe sweeps into caves in and sinks into its own dust; the second stomp's shock
// knocks down everything for 3 km (they tip away from your foot as they sink).
import * as THREE from 'three';
import { B, CARS, LAMPS, TREES } from './layout.js';
import { facadeMaterial, F } from './facade.js';
import { makeFleet } from './cars.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose, SCREAMER, screamerPose } from './people.js';
import { STOMP1, STOMP2, FOOT_X, sizeAt } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mR = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();
const ax = new THREE.Vector3(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
const q = new THREE.Quaternion(), e = new THREE.Euler();

export function fallState(b, v) {
  const k = clamp((v - b.vFall) / b.dur);
  if (k <= 0) return { tip: 0, left: 1, k: 0 };
  const ek = k * (0.4 + 0.6 * k);
  const tip = b.lean * Math.sin(Math.min(ek * 1.3, 1) * Math.PI / 2) * (b.vFall === b.vCrush ? 0.35 : 1) * (1 - smooth(0.8, 1, k) * 0.7);
  const rubble = Math.min(0.15, 5 / b.h);
  return { tip, left: 1 - (1 - rubble) * smooth(0.0, 1, ek), k };
}

export function makeCity(scene, ctx) {
  // ---------- buildings ----------
  const n = B.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 4), aC = new Float32Array(n * 4);
  B.forEach((b, i) => {
    aT.set([b.vGlass, 1e9, b.vFall, b.dur], i * 4);
    // the stone towers (3) use the office look (1): punched windows, a different column rhythm from the seed
    aS.set([b.seed, b.kind === 3 ? 1 : b.kind, Math.min(b.vGlass + 0.3, b.vFall), b.h], i * 4);
  });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  B.forEach((b, i) => mesh.setColorAt(i, col.set(b.col)));
  scene.add(mesh);
  const falling = B.filter((b) => b.vFall < 1e8);

  // ---------- broken concrete from the buildings your shoes sweep into ----------
  const CH = [];
  const R = rng(616);
  for (const b of falling) {
    if (b.vCrush > 1e8 || b.dN > 1800) continue;
    const sAt = sizeAt(b.vCrush);
    if (b.hit) {
      if (b.vCrush > 13.5) continue;   // (later, from up high, a building is a few pixels: its dust is enough)
      // your body grew into it: a burst of broken wall and floors where you touched it, blown away from you,
      // and the rest of it caving in below the hole
      const nc = Math.round(clamp(b.h / 2, 24, 90));
      const dir = Math.atan2(b.z - b.hit.z, b.x - b.hit.x);
      const big = clamp(sAt / 60, 1, 6);
      for (let k = 0; k < nc; k++) {
        const a = dir + (R() - 0.5) * 2.0;
        const sp = (4 + R() * 14) * Math.sqrt(big);
        const hx = b.hit.x + Math.cos(dir) * 2 + (R() - 0.5) * b.w * 0.6, hz = b.hit.z + Math.sin(dir) * 2 + (R() - 0.5) * b.d * 0.6;
        CH.push({ x: clamp(hx, b.x - b.w / 2, b.x + b.w / 2), y: clamp(b.hit.y + (R() - 0.5) * 18 * big, 2, b.h), z: clamp(hz, b.z - b.d / 2, b.z + b.d / 2),
          v: b.vCrush + R() * 0.25, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + R() * 8,
          sz: [(0.8 + R() * 3) * big, (0.4 + R() * 1.5) * big, (0.8 + R() * 2.6) * big], spin: (R() - 0.5) * 6, seed: R(), c: R() < 0.45 ? b.col : 0x8a857c });
      }
      continue;
    }
    if (b.dN > 400) continue;
    const nc = Math.round(clamp(b.h / 3, 10, 50));
    const fx = FOOT_X[b.x > 0.1 * sAt ? 1 : 0] * sAt;
    const dir = Math.atan2(b.z, b.x - fx);
    for (let k = 0; k < nc; k++) {
      const a = dir + (R() - 0.5) * 2.4;
      const sp = 2 + R() * 9;
      CH.push({ x: b.x + (R() - 0.5) * b.w, y: b.h * (0.1 + 0.85 * R()), z: b.z + (R() - 0.5) * b.d, v: b.vFall + R() * b.dur * 0.8,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: R() * 4, sz: [0.8 + R() * 2.6, 0.4 + R() * 1.3, 0.8 + R() * 2.2], spin: (R() - 0.5) * 6, seed: R(), c: R() < 0.35 ? b.col : 0x8a857c });
    }
  }
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), Math.max(1, CH.length));
  chunks.frustumCulled = false; chunks.castShadow = true;
  CH.forEach((c, i) => { chunks.setColorAt(i, col.set(c.c)); chunks.setMatrixAt(i, HIDE); });
  scene.add(chunks);

  // ---------- glass: where it bursts out of the windows near the first stomp ----------
  const GL = [];
  for (const b of B) {
    if (b.vGlass > 1e8 || b.dN > 160) continue;
    const ns = Math.round(clamp(b.h / 2, 6, 60));
    for (let k = 0; k < ns; k++) {
      const face = Math.floor(R() * 4);
      const fx = face < 2 ? b.x + (face ? 1 : -1) * b.w / 2 : b.x + (R() - 0.5) * b.w;
      const fz = face >= 2 ? b.z + (face === 2 ? 1 : -1) * b.d / 2 : b.z + (R() - 0.5) * b.d;
      GL.push({ x: fx, y: 4 + R() * (b.h - 4), z: fz, v: b.vGlass + 0.25 * R(), out: face, seed: R() });
    }
  }

  // ---------- cars ----------
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));

  // ---------- lamps (a pole with an arm) and honey locusts ----------
  const poleG = new THREE.CylinderGeometry(0.09, 0.12, 8.5, 8).translate(0, 4.25, 0);
  const armG = new THREE.BoxGeometry(0.12, 0.12, 2.4).translate(0, 8.4, 1.1);
  const lampPole = new THREE.InstancedMesh(poleG, ctx.plainMat(0x30343a, 0.6, { metalness: 0.5 }), LAMPS.length);
  const lampArm = new THREE.InstancedMesh(armG, ctx.plainMat(0x30343a, 0.6, { metalness: 0.5 }), LAMPS.length);
  for (const m of [lampPole, lampArm]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
  const trunkG = new THREE.CylinderGeometry(0.14, 0.22, 3.2, 7).translate(0, 1.6, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkG, ctx.plainMat(0x4a3826, 0.9), TREES.length);
  const crowns = new THREE.InstancedMesh(crownG, ctx.plainMat(0x5d7a2c, 0.85, { flatShading: true }), TREES.length);
  for (const m of [trunks, crowns]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  TREES.forEach((t, i) => crowns.setColorAt(i, col.setRGB(0.34 + 0.12 * t.seed, 0.45 + 0.1 * t.seed, 0.16)));

  // ---------- the crowd ----------
  const crowd = makeCrowd(scene, PEOPLE.length + 1, ctx.plainMat(0xffffff, 0.85), { castShadow: true });
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  crowd.color(PEOPLE.length, ...SCREAMER.col);

  // the shock of each stomp: an up-and-down jolt of the ground that runs outward (m), used for cars, lamps, trees
  function jolt(x, z, v) {
    let a = 0;
    for (const st of [STOMP1, STOMP2]) {
      const fx = FOOT_X[st.foot] * sizeAt(st.down);
      const d = Math.hypot(x - fx, z);
      const t = v - st.down - d / 3500;
      if (t < 0 || t > 2) continue;
      const amp = (st === STOMP1 ? 0.9 : 3) * Math.exp(-d / (st === STOMP1 ? 160 : 4000));
      a += amp * Math.exp(-t / 0.35) * Math.sin(t * 22);
    }
    return a;
  }

  return {
    mesh, crowd, fleet,
    frame(v, s, glows, smoke, camY) {
      F.uTime.value = v;
      // ---- buildings ----
      for (let i = 0; i < n; i++) {
        const b = B[i];
        if (v < b.vFall) { mesh.setMatrixAt(i, mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, b.h, b.d))); continue; }
        const st = fallState(b, v);
        mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, b.h * st.left, b.d));
        // tip away from your nearest foot about the foot of the wall on that side
        const fx = FOOT_X[b.x > 0.1 * sizeAt(b.vFall) ? 1 : 0] * sizeAt(b.vFall);
        const dl = Math.hypot(b.x - fx, b.z) || 1, ux = (b.x - fx) / dl, uz = b.z / dl;
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
        if (dt < 0 || dt > 12) { chunks.setMatrixAt(i, HIDE); continue; }
        const tg = (c.vy + Math.sqrt(c.vy * c.vy + 2 * 9.8 * c.y)) / 9.8;
        const tt = Math.min(dt, tg);
        const x = c.x + c.vx * tt, z = c.z + c.vz * tt, y = Math.max(c.sz[1] / 2, c.y + c.vy * tt - 4.9 * tt * tt);
        e.set(c.seed * 6 + c.spin * tt, c.seed * 3 + c.spin * tt * 0.7, c.seed * 9);
        q.setFromEuler(e);
        m4.compose(pos.set(x, y, z), q, sc.set(c.sz[0], c.sz[1], c.sz[2]));
        chunks.setMatrixAt(i, m4);
      }
      chunks.instanceMatrix.needsUpdate = true;
      // dust billowing out of each collapse and rolling along the ground (bigger, longer for the far knock-downs)
      if (camY < 60000) for (const b of falling) {
        const dtB = v - b.vFall;
        const far = b.vCrush > 1e8;
        const life = far ? 14 : 9;
        if (dtB < 0 || dtB > b.dur + life) continue;
        const span = Math.max(b.w, b.d);
        const Rb = rng(Math.round(b.seed * 1e6));
        const np = far || (b.hit && b.vFall > 12.5) ? 3 : b.h > 80 ? 22 : 14;
        for (let k = 0; k < np; k++) {
          const vs = b.vFall + (k / np) * b.dur;
          const a = Rb() * Math.PI * 2, seed = Rb(), oy = Rb();
          if (v < vs) continue;
          const age = v - vs;
          if (age > life) continue;
          const spread = (span * 0.4 + (far ? 40 : 9) * (1 - Math.exp(-age * 0.6))) * (0.6 + 0.6 * seed);
          const r = span * (far ? 0.6 : 0.3) + age * (far ? 9 : 3.5);
          const y = Math.max(r * 0.45, b.h * (1 - k / np) * 0.6 * oy * Math.exp(-age * 0.5) + age * 1.5);
          const a2 = (far ? 0.5 : 0.36) * smooth(0, 0.25, age) * (1 - smooth(life * 0.5, life, age));
          smoke.puff(b.x + Math.cos(a) * spread, y, b.z + Math.sin(a) * spread, r, a2, 0.62 + 0.12 * seed, 0, seed);
        }
      }
      // a cloud of dust and glass bursting out where your body broke into a building
      if (camY < 60000) for (const b of falling) {
        if (!b.hit) continue;
        const age = v - b.vCrush;
        if (age < 0 || age > 7) continue;
        const big = clamp(sizeAt(b.vCrush) / 60, 1, 6);
        const Rb = rng(Math.round(b.seed * 3e5) + 11);
        const dir = Math.atan2(b.z - b.hit.z, b.x - b.hit.x);
        const nk = b.vCrush < 12.5 ? 10 : 2;
        for (let k = 0; k < nk; k++) {
          const a = dir + (Rb() - 0.5) * 2.2, seed = Rb();
          const out = (3 + 22 * (1 - Math.exp(-age / 0.6))) * big * (0.5 + seed);
          const r = (3 + age * 4) * big * (0.6 + 0.6 * Rb());
          smoke.puff(b.hit.x + Math.cos(a) * out, Math.max(r * 0.4, b.hit.y - age * 3 * big + (Rb() - 0.5) * 10 * big), b.hit.z + Math.sin(a) * out, r,
            0.42 * smooth(0, 0.12, age) * (1 - smooth(2.5, 7, age)), 0.66 + 0.1 * seed, 0, seed);
        }
        if (age < 0.25) glows.add(b.hit.x, b.hit.y, b.hit.z, 6 * big, 1.2 * (1 - age / 0.25), 1.2 * (1 - age / 0.25), 1.1 * (1 - age / 0.25));
      }
      // glass: glittering shards falling out of the burst windows
      for (const g of GL) {
        const dt = v - g.v;
        if (dt < 0 || dt > 3) continue;
        const out = [[-1, 0], [1, 0], [0, 1], [0, -1]][g.out];
        const sp = 2 + 3 * g.seed;
        const y = g.y - 4.9 * dt * dt;
        if (y < 0.2) continue;
        const tw = 0.5 + 0.5 * Math.sin(dt * 40 + g.seed * 50);
        glows.add(g.x + out[0] * sp * dt, y, g.z + out[1] * sp * dt, 0.5 + 0.3 * g.seed, 1.6 * tw, 1.7 * tw, 1.8 * tw);
      }

      // ---- cars: crushed flat under a shoe, bounced by the stomps ----
      for (let i = 0; i < CARS.length; i++) {
        const c = CARS[i];
        const kc = smooth(c.vCrush - 0.05, c.vCrush + (c.hero ? 0.35 : 0.2), v);
        const jy = Math.max(0, jolt(c.x, c.z, v)) * (1 - kc);
        e.set(jy * 0.04 * Math.sin(c.seed * 9), c.yaw, jy * 0.05 * Math.cos(c.seed * 7) + kc * 0.08 * (c.seed - 0.5));
        q.setFromEuler(e);
        m4.compose(pos.set(c.x, jy, c.z), q, sc.set(1 + 0.15 * kc, 1 - 0.78 * kc, 1 + 0.05 * kc));
        fleet.set(i, m4, kc < 0.5);
        // the hazard lights blink after a jolt or a crush (car alarms)
        const alarm = v > Math.min(c.vShock, c.vCrush) + 0.2 && kc < 0.9;
        if (alarm && Math.sin(v * 9 + c.seed * 6) > 0.2 && Math.hypot(c.x, c.z) < 300) {
          const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
          for (const sx of [-0.7, 0.7]) glows.add(c.x + sx * cy - 2.3 * sy, 0.75, c.z - sx * sy - 2.3 * cy, 0.55, 2.2, 1.2, 0.2);
        }
        // the crunch: glass spraying out
        if (c.hero && v > c.vCrush && v < c.vCrush + 1.2) {
          const Rc = rng(31);
          for (let k = 0; k < 40; k++) {
            const a = Rc() * Math.PI * 2, sp = 1.5 + Rc() * 4, dt = v - c.vCrush - Rc() * 0.15;
            if (dt < 0) continue;
            const y = 1.0 + Rc() * 0.4 + sp * 0.4 * dt - 4.9 * dt * dt;
            if (y < 0.05) continue;
            const tw = 0.6 + 0.4 * Math.sin(dt * 50 + k);
            glows.add(c.x + Math.cos(a) * sp * dt, y, c.z + Math.sin(a) * sp * dt, 0.18, 2.4 * tw, 2.5 * tw, 2.6 * tw);
          }
        }
      }
      fleet.commit();
      // ---- lamps and trees: squashed, or swaying when the shock goes by ----
      LAMPS.forEach((l, i) => {
        if (v > l.vCrush + 0.1) { lampPole.setMatrixAt(i, HIDE); lampArm.setMatrixAt(i, HIDE); return; }
        const sw = jolt(l.x, l.z, v) * 0.05;
        e.set(sw, l.ew ? (l.side > 0 ? Math.PI : 0) : (l.side > 0 ? -Math.PI / 2 : Math.PI / 2), sw * 0.5);
        q.setFromEuler(e);
        m4.compose(pos.set(l.x, 0, l.z), q, sc.set(1, 1, 1));
        lampPole.setMatrixAt(i, m4); lampArm.setMatrixAt(i, m4);
      });
      lampPole.instanceMatrix.needsUpdate = true; lampArm.instanceMatrix.needsUpdate = true;
      TREES.forEach((t, i) => {
        if (v > t.vCrush + 0.1) { trunks.setMatrixAt(i, HIDE); crowns.setMatrixAt(i, HIDE); return; }
        const sw = jolt(t.x, t.z, v) * 0.06 + 0.012 * Math.sin(v * 1.3 + t.seed * 9);
        e.set(sw, t.seed * 6, sw * 0.6); q.setFromEuler(e);
        m4.compose(pos.set(t.x, 0, t.z), q, sc.set(1, t.h / 7, 1));
        trunks.setMatrixAt(i, m4);
        m4.compose(pos.set(t.x + sw * t.h * 0.8, t.h * 0.78, t.z), q, sc.set(2.6 + t.seed, 2.0 + 0.6 * t.seed, 2.6 + t.seed));
        crowns.setMatrixAt(i, m4);
      });
      trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      // ---- people ----
      if (camY < 3000) {
        const youX = (FOOT_X[0] + FOOT_X[1]) / 2 * s.s;
        PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v, youX)));
        crowd.pose(PEOPLE.length, screamerPose(v));
        crowd.commit();
      }
    },
  };
}
