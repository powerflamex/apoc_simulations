// The square's furniture and the things that spring when their weight goes:
//   trees: their branches sag under their own weight (10-30 cm); weightless, they whip up past straight and shake
//     (a damped spring, ~1 Hz) and fling their loose November leaves away (up to ~1.6 m/s), which keep going;
//   festoon lights: 0.6-0.75 m of sag between masts; the wire's own tension snaps them straight and on past it
//     (every bit starts at 1 g up: the tension that held its weight), then they bounce (period ~1.4 s);
//   leaves lying on the paving rise with everything loose (the Earth turning out from under them: 24 cm in 5 s);
//   pigeons: every wingbeat now lifts them with nothing pulling back, so they shoot up;
//   the basketballs: one shot sails on over the hoop, one being dribbled bounces once and never comes back.
// Lamp posts, benches and hoops are bolted down and stay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREES, LAMPS, BENCHES, STRINGS, MASTS, COURT } from './layout.js';
import { G, T_ON, fly, SPIN, T_KIDTREE, KID_TREE } from './timeline.js';
import { hazed } from './city.js';
import { rng, clamp, smooth } from './util.js';

// a damped spring released at t = 0 toward a new rest A (its weight gone), and back toward 0 from T_ON (weight back)
export function spring(t, A, w, z) {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  const at = (s, x0, v0, eq) => { const e = Math.exp(-z * w * s), c1 = x0 - eq, c2 = (v0 + z * w * c1) / wd; return { x: eq + e * (c1 * Math.cos(wd * s) + c2 * Math.sin(wd * s)), v: e * ((-z * w) * (c1 * Math.cos(wd * s) + c2 * Math.sin(wd * s)) + (-c1 * wd * Math.sin(wd * s) + c2 * wd * Math.cos(wd * s))) }; };
  if (t <= T_ON) return at(t, 0, 0, A).x;
  const s5 = at(T_ON, 0, 0, A);
  return at(t - T_ON, s5.x, s5.v, 0).x;
}

export const BALLS = [
  // the shot: in the air at t = 0, heading for the south rim; sails on over it
  { p: [20.45, 3.55, 9.55], u: [0.02, 1.45, 4.3], r: 0.12, spin: 6 },
  // dribbled: on its way down at 3 m/s; it bounces off the court once and goes on up
  { p: [17.2, 0.55, 5.2], u: [0.3, -3.0, -0.6], r: 0.12, spin: 3, bounce: true },
];
export function ballAt(B, t, out) {
  if (!B.bounce) return fly(B.p, B.u, t, out, 0, B.r);
  const tb = (B.p[1] - B.r) / -B.u[1];               // hits the court
  if (t < tb) { out.x = B.p[0] + B.u[0] * t; out.y = B.p[1] + B.u[1] * t; out.z = B.p[2] + B.u[2] * t; return out; }
  const p1 = [B.p[0] + B.u[0] * tb, B.r, B.p[2] + B.u[2] * tb], u1 = [B.u[0], -B.u[1] * 0.78, B.u[2]];
  fly([p1[0] - u1[0] * tb, p1[1] - u1[1] * tb, p1[2] - u1[2] * tb], u1, t, out, 0, B.r);
  return out;
}

export function makeProps(scene, ctx) {
  const R = rng(2121);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), o = {};
  const metal = ctx.plainMat(0x23272b, 0.5, { metalness: 0.4 });

  // ---- lamp posts: black poles with a lantern (round the fountain), tall street lights along the street ----
  {
    const g = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.11, 4.2, 10).translate(0, 2.1, 0), new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10).translate(0, 0.15, 0),
      new THREE.CylinderGeometry(0.06, 0.2, 0.18, 10).translate(0, 4.25, 0), new THREE.CylinderGeometry(0.22, 0.06, 0.12, 10).translate(0, 4.82, 0)]);
    const lamps = new THREE.InstancedMesh(g, metal, LAMPS.length);
    const globe = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 14, 10).translate(0, 4.56, 0), ctx.plainMat(0xfaf3e0, 0.3, { emissive: 0x6a5a40 }), LAMPS.length);
    LAMPS.forEach((L, i) => { m4.makeTranslation(L.x, 0, L.z); lamps.setMatrixAt(i, m4); globe.setMatrixAt(i, m4); });
    lamps.castShadow = true; scene.add(lamps, globe);
  }
  // ---- benches: wooden slats on cast legs ----
  {
    const wood = ctx.plainMat(0x8a5a34, 0.75);
    const slats = mergeGeometries([0, 1, 2].map((k) => new THREE.BoxGeometry(1.8, 0.04, 0.12).translate(0, 0.45, -0.17 + k * 0.15))
      .concat([0, 1].map((k) => new THREE.BoxGeometry(1.8, 0.11, 0.035).rotateX(-0.2).translate(0, 0.62 + k * 0.15, -0.27 - k * 0.03))));
    const legs = mergeGeometries([-0.8, 0.8].map((x) => new THREE.BoxGeometry(0.06, 0.45, 0.45).translate(x, 0.22, -0.05)).concat([-0.8, 0.8].map((x) => new THREE.BoxGeometry(0.05, 0.42, 0.05).rotateX(-0.2).translate(x, 0.66, -0.3))));
    const bs = new THREE.InstancedMesh(slats, wood, BENCHES.length), bl = new THREE.InstancedMesh(legs, metal, BENCHES.length);
    BENCHES.forEach((b, i) => { m4.makeRotationY(b.yaw).setPosition(b.x, 0, b.z); bs.setMatrixAt(i, m4); bl.setMatrixAt(i, m4); });
    bs.castShadow = bl.castShadow = true; scene.add(bs, bl);
  }
  // ---- hoops (both ends of the court): pole, arm, glass board, orange rim, a net ----
  const hoopRim = new THREE.Group();
  for (const sz of [-1, 1]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.16), ctx.plainMat(0x30363c, 0.5, { metalness: 0.5 }));
    pole.position.set(0, 1.8, 2.1); g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.75), pole.material); arm.position.set(0, 3.45, 1.2); g.add(arm);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.04), ctx.plainMat(0xf2f2ee, 0.35));
    board.position.set(0, 3.42, 0.4); g.add(board);
    const sq = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.045), ctx.plainMat(0x22262a, 0.5)); sq.position.set(0, 3.27, 0.4); g.add(sq);
    const sq2 = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.38, 0.05), board.material); sq2.position.set(0, 3.29, 0.4); g.add(sq2);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 8, 28).rotateX(Math.PI / 2), ctx.plainMat(0xe0561c, 0.4, { metalness: 0.3 }));
    rim.position.set(0, COURT.rimY, 0); g.add(rim);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.15, 0.42, 14, 3, true), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, wireframe: true }));
    net.position.set(0, COURT.rimY - 0.21, 0); g.add(net);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(COURT.hoopX, 0, sz * COURT.rimZ);
    if (sz < 0) g.rotation.y = Math.PI;
    scene.add(g);
  }
  // ---- masts for the festoon lights ----
  {
    const mg = mergeGeometries([new THREE.CylinderGeometry(0.06, 0.09, 6.7, 8).translate(0, 3.35, 0), new THREE.SphereGeometry(0.1, 8, 6).translate(0, 6.7, 0)]);
    const ms = new THREE.InstancedMesh(mg, metal, MASTS.length);
    MASTS.forEach((M, i) => ms.setMatrixAt(i, m4.makeTranslation(M.x, 0, M.z)));
    ms.castShadow = true; scene.add(ms);
  }

  // ---- trees: a trunk, a few limbs, a canopy of lumpy clumps that spring up when their weight goes ----
  const bark = ctx.plainMat(0x4a3a2c, 0.9);
  const leafMat = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  leafMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vLP = position;
      transformed += normal * (sin(position.x * 9.0 + position.y * 7.0) * sin(position.z * 8.0 - position.y * 5.0) * 0.12);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLP;
      float lh(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float n = lh(floor(vLP * 14.0)); float n2 = lh(floor(vLP * 5.0) + 3.0);
          diffuseColor.rgb *= 0.55 + 0.6 * n; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.2, 0.8, 0.5), step(0.7, n2) * 0.5);
          diffuseColor.rgb *= 0.7 + 0.3 * smoothstep(-0.6, 0.8, vLP.y); }`);
  };
  leafMat.customProgramCacheKey = () => 'gravoff-leafclump';
  const CL = [];
  TREES.forEach((T, ti) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, T.h + 1, 8).translate(0, (T.h + 1) / 2, 0), bark);
    trunk.position.set(T.x, 0, T.z); trunk.castShadow = true; scene.add(trunk);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + T.seed * 6;
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.8, 6).translate(0, 0.9, 0), bark);
      limb.position.set(T.x, T.h - 0.2, T.z); limb.rotation.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7); limb.castShadow = true; scene.add(limb);
    }
    const n = 11;
    for (let k = 0; k < n; k++) {
      const a = k * 2.399 + T.seed * 5, rr = T.r * (k === 0 ? 0 : 0.35 + 0.55 * ((k * 0.618) % 1)), yy = T.h + 0.8 + T.r * 0.9 * (1 - rr / T.r) * (0.7 + 0.3 * R());
      CL.push({ kid: !!T.kid, tree: ti, x: T.x + Math.cos(a) * rr, y: yy, z: T.z + Math.sin(a) * rr, s: T.r * (0.42 + 0.22 * R()), out: rr / T.r, col: T.col, A: 0.12 + 0.18 * (rr / T.r) + 0.05 * R(), w: 2 * Math.PI * (0.85 + 0.35 * R()), ph: R() });
    }
  });
  const clumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), leafMat, CL.length);
  CL.forEach((c, i) => clumps.setColorAt(i, new THREE.Color(c.col)));
  clumps.castShadow = true; clumps.receiveShadow = true; clumps.frustumCulled = false;
  scene.add(clumps);

  // ---- loose leaves: flung from the canopies as the branches whip up; and fallen ones on the paving ----
  const leafG = new THREE.PlaneGeometry(0.1, 0.075);
  const leafQ = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }));
  leafQ.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvLU = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLU;').replace('#include <alphatest_fragment>', `
      { vec2 q = vLU * 2.0 - 1.0; float d = q.x * q.x / 0.95 + pow(abs(q.y), 1.6) / (0.9 - 0.4 * q.x * q.x); if (d > 0.9) discard; }`);
  };
  leafQ.customProgramCacheKey = () => 'gravoff-leafq';
  const LEAVES = [];
  for (const c of CL) {
    const n = c.out > 0.4 ? 7 : 3;
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, el = 0.3 + 1.0 * R();
      const px = c.x + Math.cos(a) * c.s * 0.9 * Math.cos(el), pz = c.z + Math.sin(a) * c.s * 0.9 * Math.cos(el), py = c.y + c.s * 0.8 * Math.sin(el);
      const sp = 0.4 + 1.2 * R() * (0.5 + c.out);
      LEAVES.push({ c, tl: 0.12 + 0.35 * R(), p: [px, py, pz], u: [Math.cos(a) * sp * 0.4 + 0.1 * (R() - 0.5), sp, Math.sin(a) * sp * 0.4], rot: [R() * 6, R() * 6, R() * 6], w: [(R() - 0.5) * 6, (R() - 0.5) * 6, (R() - 0.5) * 6], col: c.col });
    }
  }
  // fallen leaves on the paving round the fountain's south side
  const GL = [];
  for (let k = 0; k < 260; k++) {
    const a = R() * Math.PI * 2, r = 7.8 + R() * 9;
    const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.8 + 3;
    GL.push({ p: [x, 0.012, z], u: [0.03 * (R() - 0.5), 0.02 * R() * R(), 0.03 * (R() - 0.5)], rot: [Math.PI / 2 + (R() - 0.5) * 0.4, R() * 6, 0], w: [(R() - 0.5) * 0.3, (R() - 0.5) * 0.3, 0], col: [0xc86a20, 0xd8a028, 0x9a4a1c, 0xb88a3a][Math.floor(R() * 4)] });
  }
  // the kid crashing into the big tree's crown: a burst of leaves and twigs out of it
  const BURST = [];
  for (let k = 0; k < 140; k++) {
    const a = R() * Math.PI * 2, sp = 1 + 4 * R();
    BURST.push({ p: [KID_TREE.x + Math.cos(a) * 0.8 * R(), KID_TREE.catch - 0.4 - 1.2 * R(), KID_TREE.z + Math.sin(a) * 0.8 * R()], u: [Math.cos(a) * sp, 0.5 + 3 * R(), Math.sin(a) * sp],
      rot: [R() * 6, R() * 6, R() * 6], w: [(R() - 0.5) * 14, (R() - 0.5) * 14, (R() - 0.5) * 14], col: [0xd8821c, 0xe0a828, 0xb8521c][Math.floor(R() * 3)] });
  }
  const leaves = new THREE.InstancedMesh(leafG, leafQ, LEAVES.length + GL.length + BURST.length);
  [...LEAVES, ...GL, ...BURST].forEach((L, i) => leaves.setColorAt(i, new THREE.Color(L.col).multiplyScalar(0.8 + 0.4 * R())));
  leaves.castShadow = false; leaves.frustumCulled = false;
  scene.add(leaves);

  // ---- festoon lights: the wire (short segments) and its bulbs ----
  const SEG = 40;
  const wireN = STRINGS.length * SEG;
  const wire = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4).translate(0, 0.5, 0), ctx.plainMat(0x1a1a1a, 0.6), wireN);
  wire.frustumCulled = false; scene.add(wire);
  const BULB = [];
  STRINGS.forEach((S, si) => { const L = Math.hypot(S[2] - S[0], S[3] - S[1]); const nb = Math.floor(L / 0.9); for (let k = 1; k < nb; k++) BULB.push({ si, s: k / nb, ph: R() }); });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6).scale(1, 1.25, 1).translate(0, -0.08, 0), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc26a, emissiveIntensity: 1.3, roughness: 0.3 }), BULB.length);
  bulbs.frustumCulled = false; scene.add(bulbs);
  const SS = STRINGS.map((S, i) => ({ A: S[5], w: 2 * Math.PI / (1.25 + 0.15 * i), z: 0.07, ph: i }));
  const strAt = (si, s, t, out) => {
    const S = STRINGS[si], P = SS[si];
    const d = spring(t, P.A, P.w, P.z);             // how far the middle has come up from its old sag
    const d3 = 0.12 * P.A * Math.sin(Math.PI * 3 * s) * Math.sin(P.w * 2.6 * Math.max(0, Math.min(t, T_ON))) * Math.exp(-0.25 * Math.max(0, t));
    out.x = S[0] + (S[2] - S[0]) * s; out.z = S[1] + (S[3] - S[1]) * s;
    out.y = S[4] - (P.A - d) * 4 * s * (1 - s) + d3;
    return out;
  };

  // ---- the basketballs ----
  const ballMat = ctx.plainMat(0xd8661e, 0.65);
  const balls = BALLS.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), ballMat); m.castShadow = true; scene.add(m); return m; });

  // ---- pigeons: a small flock on the paving by the fountain, in front of the camera ----
  const BIRDS = [];
  for (let k = 0; k < 14; k++) {
    const near = false;
    const x = near ? -1.05 + 0.85 * R() : -7 + 14 * R(), z = near ? 9.35 + 1.2 * R() : -12 + 3 * R();
    const a = R() * Math.PI * 2;
    const t0 = near ? 0.3 + 0.35 * R() : 0.1 + 0.4 * R();
    BIRDS.push({ x, z, yaw: a, t0, up: 4 + 2.5 * R(), fw: near ? 0.4 + 0.8 * R() : 1.2 + 1.5 * R(), dir: -1.2 + 2.4 * R(), ph: R() * 6, s: 0.9 + 0.2 * R() });
  }
  const birdBody = mergeGeometries([new THREE.SphereGeometry(1, 10, 8).scale(0.07, 0.07, 0.15), new THREE.SphereGeometry(0.045, 8, 6).translate(0, 0.07, -0.13),
    new THREE.ConeGeometry(0.04, 0.1, 4).rotateX(Math.PI / 2).translate(0, 0.0, 0.17)]);
  const wingG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.06), new THREE.Vector3(0.26, 0, 0.0), new THREE.Vector3(0, 0, 0.08), new THREE.Vector3(0.26, 0, 0.0), new THREE.Vector3(0.2, 0, 0.09), new THREE.Vector3(0, 0, 0.08)]);
  wingG.computeVertexNormals();
  const birdMat = ctx.plainMat(0x7a8088, 0.8, { side: THREE.DoubleSide });
  const birdB = new THREE.InstancedMesh(birdBody, birdMat, BIRDS.length), wingL = new THREE.InstancedMesh(wingG, birdMat, BIRDS.length), wingR = new THREE.InstancedMesh(wingG, birdMat, BIRDS.length);
  for (const m of [birdB, wingL, wingR]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }

  const tmpO = new THREE.Object3D();
  return {
    LEAVES, BIRDS,
    frame(t) {
      // canopies
      CL.forEach((c, i) => {
        let d = spring(t, c.A, c.w, 0.11);
        // the kid landing in the crown: it's knocked down and shakes
        if (c.kid && t > T_KIDTREE) { const s = t - T_KIDTREE, near = Math.exp(-Math.hypot(c.x - KID_TREE.x, c.z - KID_TREE.z) / 2.2); d -= near * (0.45 * (1 - Math.exp(-s / 0.05)) * Math.exp(-s / 0.7) + 0.12 * Math.exp(-s / 0.5) * Math.sin(s * 22)); }
        const sw = 0.05 * c.out * Math.sin(c.w * 0.8 * Math.max(t, 0) + c.ph * 6) * Math.min(1, Math.max(t, 0) * 2) * (t < T_ON ? 1 : Math.exp(-(t - T_ON)));
        m4.compose(p.set(c.x + sw, c.y + d, c.z + sw * 0.6), q.identity(), sc.set(c.s, c.s * 0.82, c.s));
        clumps.setMatrixAt(i, m4);
      });
      clumps.instanceMatrix.needsUpdate = true;
      // leaves: on their clump until they tear loose, then flying on (and fluttering down slowly after 0.00)
      let li = 0;
      const put = (x, y, z, rx, ry, rz, s = 1) => { e.set(rx, ry, rz); q.setFromEuler(e); m4.compose(p.set(x, y, z), q, sc.setScalar(s)); leaves.setMatrixAt(li++, m4); };
      for (const L of LEAVES) {
        const c = L.c, d = spring(Math.min(t, L.tl), c.A, c.w, 0.11);
        if (t < L.tl) { put(L.p[0], L.p[1] + d, L.p[2], L.rot[0], L.rot[1], L.rot[2]); continue; }
        const s = t - L.tl, tt = Math.min(t, T_ON) - L.tl;
        let x = L.p[0] + L.u[0] * tt, y = L.p[1] + d + L.u[1] * tt, z = L.p[2] + L.u[2] * tt;
        if (t > T_ON) { const f = t - T_ON, vt = 1.1; const vy = L.u[1]; const tc = (vy + vt) / G; const fall = f < tc ? vy * f - 0.5 * G * f * f : vy * tc - 0.5 * G * tc * tc - vt * (f - tc); y += fall; x += L.u[0] * f; z += L.u[2] * f; }
        put(x, y, z, L.rot[0] + L.w[0] * s, L.rot[1] + L.w[1] * s, L.rot[2] + L.w[2] * s);
      }
      for (const L of GL) {
        const f = fly(L.p, L.u, t, o, 0.012);
        put(o.x, o.y, o.z, L.rot[0] + L.w[0] * Math.min(t, T_ON), L.rot[1] + L.w[1] * Math.min(t, T_ON), L.rot[2]);
      }
      for (const L of BURST) {
        const s = t - T_KIDTREE;
        if (s <= 0) { put(0, -50, 0, 0, 0, 0, 0); continue; }
        const dr = 0.35 * (1 - Math.exp(-s / 0.35));
        put(L.p[0] + L.u[0] * dr, L.p[1] + L.u[1] * 0.3 * (1 - Math.exp(-s / 0.3)) - 1.1 * s, L.p[2] + L.u[2] * dr, L.rot[0] + L.w[0] * s, L.rot[1] + L.w[1] * s, L.rot[2] + L.w[2] * s);
      }
      leaves.instanceMatrix.needsUpdate = true;
      // festoon lights
      const A = {}, B = {};
      let wi = 0, bi = 0;
      STRINGS.forEach((S, si) => {
        for (let k = 0; k < SEG; k++) {
          strAt(si, k / SEG, t, A); strAt(si, (k + 1) / SEG, t, B);
          const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, L = Math.hypot(dx, dy, dz);
          q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
          m4.compose(p.set(A.x, A.y, A.z), q, sc.set(1, L, 1)); wire.setMatrixAt(wi++, m4);
        }
      });
      wire.instanceMatrix.needsUpdate = true;
      for (const b of BULB) {
        strAt(b.si, b.s, t, A);
        // the bulbs swing on their short leads as the wire whips
        const sw = 0.25 * Math.sin(SS[b.si].w * 1.3 * Math.max(0, Math.min(t, T_ON)) + b.ph * 6) * Math.min(1, t * 2);
        e.set(sw, 0, sw * 0.5); q.setFromEuler(e);
        m4.compose(p.set(A.x, A.y, A.z), q, sc.setScalar(1)); bulbs.setMatrixAt(bi++, m4);
      }
      bulbs.instanceMatrix.needsUpdate = true;
      // balls
      BALLS.forEach((B, i) => { ballAt(B, t, o); balls[i].position.set(o.x, o.y, o.z); balls[i].rotation.set(B.spin * t, B.spin * 0.3 * t, 0); });
      // pigeons: they burst up off the paving, wings beating 8 times a second (once a second in slow motion)
      BIRDS.forEach((b, i) => {
        const s = Math.max(0, t - b.t0);
        const rise = s < 0.6 ? 0.5 * (b.up / 0.6) * s * s : 0.5 * b.up * 0.6 + b.up * (s - 0.6);
        let y = 0.07 + (t < T_ON ? rise : rise);
        const hx = Math.sin(b.yaw + b.dir * Math.min(s, 1) * 0.5), hz = Math.cos(b.yaw + b.dir * Math.min(s, 1) * 0.5);
        const fw = b.fw * s;
        let x = b.x + hx * fw, z = b.z + hz * fw;
        if (t > T_ON) { const f = t - T_ON; y -= 0.5 * G * f * f * 0.15; }
        const flap = s > 0 ? Math.sin((s * 8 + b.ph) * Math.PI * 2) : (t > -1 ? 0.1 * Math.sin(t * 3 + b.ph) : 0);
        const pitch = s > 0 ? -0.9 * Math.min(1, s * 3) : 0.2 * Math.sin(t * 4 + b.ph * 3);
        tmpO.position.set(x, y + 0.07, z); tmpO.rotation.set(pitch, b.yaw, 0, 'YXZ'); tmpO.scale.setScalar(b.s); tmpO.updateMatrix();
        birdB.setMatrixAt(i, tmpO.matrix);
        const wa = s > 0 ? 0.15 + 0.85 * flap : 1.35;
        for (const [wm, sx] of [[wingR, 1], [wingL, -1]]) {
          const mm = new THREE.Matrix4().makeRotationZ(sx * wa).multiply(new THREE.Matrix4().makeScale(sx, 1, 1));
          wm.setMatrixAt(i, tmpO.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(sx * 0.05, 0.03, 0)).multiply(mm));
        }
      });
      for (const m of [birdB, wingL, wingR]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
