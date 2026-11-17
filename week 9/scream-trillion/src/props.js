// Street furniture: lamp posts along both curbs (they bend away from you from ~3 psi, down toward the ground as it
// grows), a hydrant, litter bins (thrown from ~2 psi), and the cafe terrace behind you: small round tables, chairs and
// low glass screens on metal frames. The screens are the first glass to go (plain glass, 0.09-0.15 psi); the tables
// and chairs are thrown with the people.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, HYDRANT, BINS, CAFE, MOUTH } from './layout.js';
import { logMult, peakPa, timeOfPressure, P_SHOVE, P_KNOCK, PSI } from './timeline.js';
import { throwAt } from './physics.js';
import { rng, clamp } from './util.js';

// cafe tables (x, z) and the chairs round them (x, z, yaw: the way the sitter faces)
export const TABLES = [], CHAIRS = [];
{
  for (const [tx, tz] of [[10.25, -4.6], [9.6, -6.1], [10.3, -7.5], [9.6, -8.9], [10.3, -9.9]]) {
    TABLES.push({ x: tx, z: tz });
    CHAIRS.push({ x: tx, z: tz + 0.62, yaw: Math.PI }, { x: tx + (tx > 10 ? -0.58 : 0.58), z: tz - 0.2, yaw: tx > 10 ? Math.PI / 2 + 0.2 : -Math.PI / 2 - 0.2 });
  }
}

export function makeProps(scene, ctx, glass) {
  const R = rng(515);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), st = {};
  const metal = ctx.plainMat(0x2e3136, 0.55, { metalness: 0.4 });
  // ---- lamp posts: one merged shape (pole, arm over the road, head), bent about its base ----
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.13, 9, 8).translate(0, 4.5, 0),
    new THREE.BoxGeometry(2.4, 0.1, 0.1).translate(1.2, 8.85, 0),
    new THREE.BoxGeometry(0.7, 0.18, 0.34).translate(2.35, 8.75, 0),
  ]);
  const lamps = new THREE.InstancedMesh(lampGeo, metal, LAMPS.length);
  lamps.castShadow = true; lamps.frustumCulled = false;
  scene.add(lamps);
  const LP = LAMPS.map((l) => {
    const dx = l.x - MOUTH.x, dz = l.z - MOUTH.z, dh = Math.hypot(dx, dz) || 1;
    return { ...l, r: Math.hypot(dx, 4.5 - MOUTH.y, dz), ax: new THREE.Vector3(dz / dh, 0, -dx / dh), k: 0.8 + 0.4 * R() };
  });
  // ---- hydrant ----
  {
    const g = mergeGeometries([new THREE.CylinderGeometry(0.13, 0.15, 0.72, 10).translate(0, 0.36, 0), new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.72, 0),
      new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8).rotateZ(Math.PI / 2).translate(0, 0.5, 0)]);
    const h = new THREE.Mesh(g, ctx.plainMat(0xc8a018, 0.5));
    h.position.set(HYDRANT.x, 0, HYDRANT.z);
    ctx.shadowy(h); scene.add(h);
  }
  // ---- bins ----
  const binGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.95, 12);
  const bins = new THREE.InstancedMesh(binGeo, ctx.plainMat(0x2a4a3a, 0.6), BINS.length);
  bins.castShadow = true; bins.frustumCulled = false; scene.add(bins);
  const BT = BINS.map((b) => {
    const r = Math.hypot(b.x - MOUTH.x, 0.5 - MOUTH.y, b.z - MOUTH.z), dx = b.x - MOUTH.x, dz = b.z - MOUTH.z, dh = Math.hypot(dx, dz);
    const V = 6 + 6 * R();
    return { T: { t0: timeOfPressure(P_KNOCK * (0.6 + 0.3 * R()), r), p: [b.x, 0.475, b.z], vel: [dx / dh * V, 2 + 2 * R(), dz / dh * V], hs: 0.3, D: 5, wallX: 10.6 }, spin: 5 + 4 * R() };
  });

  // ---- the cafe: tables, chairs, glass screens ----
  const wood = ctx.plainMat(0x8a5a34, 0.7), white = ctx.plainMat(0xe8e4dc, 0.6);
  const tableGeo = mergeGeometries([new THREE.CylinderGeometry(0.36, 0.36, 0.035, 20).translate(0, 0.74, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(0, 0.37, 0),
    new THREE.CylinderGeometry(0.22, 0.24, 0.03, 12).translate(0, 0.015, 0)]);
  const chairGeo = mergeGeometries([new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.46, 0), new THREE.BoxGeometry(0.42, 0.42, 0.04).translate(0, 0.69, -0.2),
    ...[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z]) => new THREE.BoxGeometry(0.03, 0.46, 0.03).translate(x, 0.23, z))]);
  const tables = new THREE.InstancedMesh(tableGeo, white, TABLES.length), chairs = new THREE.InstancedMesh(chairGeo, wood, CHAIRS.length);
  for (const m of [tables, chairs]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  const furn = (list, h0, hs) => list.map((o) => {
    const dx = o.x - MOUTH.x, dz = o.z - MOUTH.z, dh = Math.hypot(dx, dz), r = Math.hypot(dx, h0 - MOUTH.y, dz);
    const V = 5 + 7 * R();
    return { o, T: { t0: timeOfPressure(P_KNOCK * (0.8 + 0.4 * R()), r), p: [o.x, h0, o.z], vel: [dx / dh * V, 2 + 3 * R(), dz / dh * V], hs, D: 5, wallX: 10.7 }, spin: [R() * 8 - 4, R() * 8 - 4, R() * 8 - 4] };
  });
  const TT = furn(TABLES, 0.4, 0.3), CT = furn(CHAIRS, 0.4, 0.25);
  // the screens: panels ~1.25 m wide along the terrace's street side (x = x0) and its south end (z = z1)
  const PANELS = [];
  const nS = Math.round((CAFE.z1 - CAFE.z0) / 1.25);
  for (let k = 0; k < nS; k++) { const za = CAFE.z0 + k * (CAFE.z1 - CAFE.z0) / nS, zb = za + (CAFE.z1 - CAFE.z0) / nS; PANELS.push({ x: CAFE.x0, z: (za + zb) / 2, w: zb - za, along: 'z' }); }
  const nE = 2;
  for (let k = 0; k < nE; k++) { const xa = CAFE.x0 + k * (CAFE.x1 - CAFE.x0) / nE, xb = xa + (CAFE.x1 - CAFE.x0) / nE; PANELS.push({ x: (xa + xb) / 2, z: CAFE.z1, w: xb - xa, along: 'x' }); }
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe6f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
  const panes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.012), glassMat, PANELS.length);
  panes.frustumCulled = false; panes.renderOrder = 4; scene.add(panes);
  const frames = [];
  const H = CAFE.screenH;
  PANELS.forEach((P, i) => {
    const y = 0.22 + (H - 0.22) / 2;
    const r = Math.hypot(P.x - MOUTH.x, y - MOUTH.y, P.z - MOUTH.z);
    P.t = timeOfPressure((0.09 + 0.06 * R()) * PSI, r);
    P.m = new THREE.Matrix4().makeRotationY(P.along === 'z' ? Math.PI / 2 : 0).scale(sc.set(P.w - 0.06, H - 0.26, 1)).setPosition(P.x, y, P.z);
    panes.setMatrixAt(i, P.m);
    glass.addSource({ t: P.t, x: P.x, y, z: P.z, nx: P.along === 'z' ? -1 : 0, nz: P.along === 'x' ? 1 : 0, w: P.w * 0.9, h: H - 0.3, n: 40 });
    // the frame: posts at the ends, a top rail, a kick plate
    const g = P.along === 'z'
      ? [new THREE.BoxGeometry(0.05, H, 0.05).translate(P.x, H / 2, P.z - P.w / 2), new THREE.BoxGeometry(0.05, 0.05, P.w).translate(P.x, H, P.z), new THREE.BoxGeometry(0.04, 0.22, P.w).translate(P.x, 0.11, P.z)]
      : [new THREE.BoxGeometry(0.05, H, 0.05).translate(P.x - P.w / 2, H / 2, P.z), new THREE.BoxGeometry(P.w, 0.05, 0.05).translate(P.x, H, P.z), new THREE.BoxGeometry(P.w, 0.22, 0.04).translate(P.x, 0.11, P.z)];
    frames.push(...g);
  });
  frames.push(new THREE.BoxGeometry(0.05, H, 0.05).translate(CAFE.x0, H / 2, CAFE.z1));
  const frameMesh = new THREE.Mesh(mergeGeometries(frames), ctx.plainMat(0x1e2622, 0.5, { metalness: 0.5 }));
  ctx.shadowy(frameMesh); scene.add(frameMesh);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    PANELS,
    frame(v, s) {
      // lamps: the bend grows with the pressure at the lamp's middle
      LP.forEach((l, i) => {
        const pk = peakPa(s.L, l.r);
        const th = clamp((pk / (P_SHOVE * l.k) - 1) * 0.7, 0, 1.4);
        q.setFromAxisAngle(l.ax, th);
        e.set(0, l.dir > 0 ? 0 : Math.PI, 0); const q2 = new THREE.Quaternion().setFromEuler(e);
        lamps.setMatrixAt(i, m4.compose(p.set(l.x, 0, l.z), q.multiply(q2), sc.set(1, 1, 1)));
      });
      lamps.instanceMatrix.needsUpdate = true;
      BT.forEach((b, i) => {
        throwAt(b.T, v, st);
        e.set(st.f * b.spin * (st.t > 0 ? 1 : 0), 0, st.landed ? Math.PI / 2 : 0);
        q.setFromEuler(e);
        bins.setMatrixAt(i, m4.compose(p.set(st.x, st.y, st.z), q, sc.set(1, 1, 1)));
      });
      bins.instanceMatrix.needsUpdate = true;
      const put = (mesh, list, i) => {
        const F = list[i];
        throwAt(F.T, v, st);
        const f = st.t > 0 ? Math.min(st.t, F.T.tl ?? st.t) : 0;
        e.set(F.o.yaw ? 0 : 0, F.o.yaw || 0, 0); const qy = new THREE.Quaternion().setFromEuler(e);
        e.set(F.spin[0] * f, F.spin[1] * f, F.spin[2] * f); q.setFromEuler(e).multiply(qy);
        const y0 = st.t > 0 ? st.y - F.T.p[1] : 0;
        mesh.setMatrixAt(i, m4.compose(p.set(st.x, Math.max(y0, -0.2), st.z), q, sc.set(1, 1, 1)));
      };
      for (let i = 0; i < TT.length; i++) put(tables, TT, i);
      for (let i = 0; i < CT.length; i++) put(chairs, CT, i);
      tables.instanceMatrix.needsUpdate = true; chairs.instanceMatrix.needsUpdate = true;
      PANELS.forEach((P, i) => panes.setMatrixAt(i, v > P.t ? zero : P.m));
      panes.instanceMatrix.needsUpdate = true;
    },
  };
}
