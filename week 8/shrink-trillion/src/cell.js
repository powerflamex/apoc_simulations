// Inside the bacterium (nanometres; origin = the point you sink to, just inside the wall). It's packed: proteins
// (3-6 nm blobs in every colour), ribosomes (~25 nm, two lumpy halves), strands of DNA (2 nm thick double helices)
// looping through; one strand runs right in front of you (the detailed one, dna.js, takes over where you are).
import * as THREE from 'three';
import { procMat } from './mats.js';
import { rng, smooth } from './util.js';

const PAL = [0xff7a6b, 0xffc14d, 0x7bd389, 0x69b7ff, 0xc38bff, 0xff8fd0, 0x4fd6c8, 0xf2f2f2];
// the strand in front of you: vertical, through (AX, *, AZ) nm, with a gap where the detailed ladder is
// (= the detailed DNA's axis: 2.22 x P nm from where you sink in, plus the 1.05 nm from the atom you hold to the axis)
export const AXIS = new THREE.Vector3(0.622, 0, 3.16);
const GAP = new THREE.Vector3(AXIS.x, 5.3, AXIS.z), GAP_R = 16;

export function makeCell(scene, keepOut) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(55);
  // proteins
  const blob = new THREE.IcosahedronGeometry(1, 2);
  { const p = blob.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.18 * Math.sin(v.x * 4 + 1) * Math.sin(v.y * 3) * Math.cos(v.z * 5); p.setXYZ(i, v.x * k, v.y * k, v.z * k); } blob.computeVertexNormals(); }
  const protM = procMat({ color: 0xffffff, rough: 0.45, col: `c *= 0.8 + 0.3 * n3(vOP * 2.5 + vIP);`, height: 'n3(vOP * 3.0 + vIP)', bump: 0.15, emis: `e += diffuseColor.rgb * 0.22;` });
  const N = 2600;
  const prot = new THREE.InstancedMesh(blob, protM, N);
  const P = [];
  const col = new THREE.Color();
  for (let t = 0; t < 40000 && P.length < N; t++) {
    const r = 3 + Math.pow(R(), 0.8) * 260, u = R() * 2 - 1, a = R() * 6.283;
    const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r * 0.8, Math.sqrt(1 - u * u) * Math.sin(a) * r + 20);
    const s = 1.6 + Math.pow(R(), 2) * 3.5;
    if (keepOut(p, s)) continue;
    P.push({ p, s, w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5), a: R() * 6 });
    prot.setColorAt(P.length - 1, col.set(PAL[Math.floor(R() * PAL.length)]));
  }
  prot.count = P.length;
  prot.castShadow = true;
  G.add(prot);
  // ribosomes: a big and a small lumpy half
  const riboM = procMat({ color: 0x7c6cf0, rough: 0.5, col: `c *= 0.75 + 0.4 * n3(vOP * 0.4);`, height: 'n3(vOP * 0.5)', bump: 0.6, emis: `e += diffuseColor.rgb * 0.2;` });
  const riboM2 = procMat({ color: 0xb59cff, rough: 0.5, col: `c *= 0.75 + 0.4 * n3(vOP * 0.4);`, height: 'n3(vOP * 0.5)', bump: 0.6, emis: `e += diffuseColor.rgb * 0.2;` });
  const RB = [];
  for (let t = 0; t < 4000 && RB.length < 70; t++) {
    const p = new THREE.Vector3((R() - 0.5) * 520, (R() - 0.5) * 380, -60 + R() * 420);
    if (keepOut(p, 16)) continue;
    const g = new THREE.Group();
    const big = new THREE.Mesh(blob, riboM); big.scale.set(12, 10, 11); g.add(big);
    const sm = new THREE.Mesh(blob, riboM2); sm.scale.set(9, 6, 8); sm.position.set(3, 11, 1); g.add(sm);
    g.position.copy(p); g.rotation.set(R() * 6, R() * 6, R() * 6);
    G.add(g);
    RB.push({ g, p, w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5) });
  }
  // DNA strands: two twisted backbones (orange) with coloured rungs, as long loops through the cell
  const bbM = procMat({ color: 0xffa23a, rough: 0.4, emis: `e += diffuseColor.rgb * 0.25;` });
  const rungM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x333333 });
  const RC = [[0.3, 0.85, 0.35], [1.0, 0.42, 0.62], [1.0, 0.82, 0.18], [0.25, 0.62, 1.0]];
  function strand(path, gapAt = null) {
    // path: a curve (nm); a double helix along it: radius 1 nm, a full turn every 3.4 nm
    const L = path.getLength(), n = Math.floor(L / 0.34);
    const pts = [[], []];
    const rungs = [];
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), nrm = new THREE.Vector3(), tg = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const u = i / n, c = path.getPointAt(u);
      path.getTangentAt(u, tg);
      side.crossVectors(tg, Math.abs(tg.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
      nrm.crossVectors(tg, side).normalize();
      const a = i * 34.3 * Math.PI / 180;
      const p1 = c.clone().addScaledVector(side, Math.cos(a) * 0.95).addScaledVector(nrm, Math.sin(a) * 0.95);
      const p2 = c.clone().addScaledVector(side, Math.cos(a + 2.4) * 0.95).addScaledVector(nrm, Math.sin(a + 2.4) * 0.95);
      pts[0].push(p1); pts[1].push(p2);
      if (!gapAt || c.distanceTo(gapAt) > GAP_R) rungs.push([p1, p2, i]);
    }
    const tubeOf = (arr) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arr), arr.length * 2, 0.3, 6);
    for (const arr of pts) {
      // split the backbone round the gap
      let seg = [];
      const flush = () => { if (seg.length > 3) { const m = new THREE.Mesh(tubeOf(seg), bbM); m.castShadow = true; G.add(m); } seg = []; };
      arr.forEach((p, i) => { const c = path.getPointAt(i / n); if (gapAt && c.distanceTo(gapAt) < GAP_R) flush(); else seg.push(p); });
      flush();
    }
    const bar = new THREE.CylinderGeometry(0.16, 0.16, 1, 6);
    const inst = new THREE.InstancedMesh(bar, rungM, rungs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    rungs.forEach(([a, b, i], k) => { const d = b.clone().sub(a); q.setFromUnitVectors(up, d.clone().normalize()); m4.compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, d.length(), 1)); inst.setMatrixAt(k, m4); inst.setColorAt(k, col.setRGB(...RC[i % 4])); });
    G.add(inst);
  }
  const C = (arr) => new THREE.CatmullRomCurve3(arr.map((p) => new THREE.Vector3(...p)));
  strand(C([[AXIS.x + 30, -140, AXIS.z + 40], [AXIS.x + 6, -60, AXIS.z + 4], [AXIS.x, -26, AXIS.z], [AXIS.x, 36, AXIS.z], [AXIS.x - 8, 70, AXIS.z + 6], [AXIS.x - 40, 130, AXIS.z + 60], [AXIS.x - 120, 160, AXIS.z + 130]]), GAP);
  strand(C([[-200, -60, 160], [-90, -30, 90], [-30, 20, 70], [40, 40, 110], [140, 10, 170], [220, -80, 140]]));
  strand(C([[160, -150, 40], [90, -80, 60], [60, 10, 120], [70, 90, 200], [10, 160, 260]]));
  strand(C([[-160, 120, 30], [-80, 70, 60], [-60, -40, 120], [-110, -130, 210]]));
  G.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
  return {
    group: G,
    frame(v, fade = 1, guard = null) {
      G.updateMatrixWorld(true);
      const inv = G.matrixWorld.clone().invert(), gv = new THREE.Vector3(), us = G.scale.x;
      const t = v - 26;
      G.traverse((o) => { if (o.isMesh && o.material) { o.material.transparent = fade < 1; o.material.opacity = fade; o.material.depthWrite = fade > 0.5; } });
      P.forEach((o, i) => { pp.copy(o.p).addScaledVector(o.w, t * 0.25); if (guard) { gv.copy(pp).applyMatrix4(G.matrixWorld); if (guard(gv, o.s * us)) pp.copy(gv.applyMatrix4(inv)); } e.set(o.a + t * 0.4, o.a, o.a * 2); q.setFromEuler(e); m4.compose(pp, q, sc.setScalar(o.s)); prot.setMatrixAt(i, m4); });
      prot.instanceMatrix.needsUpdate = true;
      for (const r of RB) { r.g.position.copy(r.p).addScaledVector(r.w, t * 2); if (guard) { gv.copy(r.g.position).applyMatrix4(G.matrixWorld); if (guard(gv, 15 * us)) r.g.position.copy(gv.applyMatrix4(inv)); } }
    },
  };
}
