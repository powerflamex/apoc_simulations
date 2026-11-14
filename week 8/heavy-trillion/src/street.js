// The street's extra pieces round you (layout.js YOU): the bench you sit on (cast-iron ends, wooden slats) that sags,
// then snaps at V_SNAP (the seat slats break in the middle and fold down, the ends splay out); the hole you break in
// the sidewalk (V_CRACK: the slabs round you tip in, a pit of soil under them) and the chunks thrown up.
// The ground shader draws the cracks and cuts the hole (GU.uCrack, GU.uHoleR).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { YOU } from './layout.js';
import { V_SNAP, V_CRACK, V_PUNCH } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

export const SEAT_Y = 0.46;
const BL = 1.8;                         // bench length (along z)

export function makeStreetBits(scene, ctx) {
  const g = new THREE.Group();
  g.position.set(YOU.x, 0, YOU.z);
  scene.add(g);
  const iron = ctx.plainMat(0x1f2a24, 0.5, { metalness: 0.4 });
  const wood = ctx.plainMat(0x8a5a34, 0.75);
  const woodD = ctx.plainMat(0x6a4226, 0.8);
  // ---- the bench: the seat faces -x (west, to the shops); you sit at its middle ----
  const bench = new THREE.Group();
  g.add(bench);
  const ends = [];
  for (const sz of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(0, 0, sz * (BL / 2 - 0.12));
    const geo = mergeGeometries([
      new THREE.BoxGeometry(0.06, SEAT_Y, 0.06).translate(-0.2, SEAT_Y / 2, 0),        // front leg
      new THREE.BoxGeometry(0.06, 0.86, 0.06).rotateZ(-0.18).translate(0.2, 0.43, 0),   // back leg + back support
      new THREE.BoxGeometry(0.5, 0.05, 0.06).translate(0, SEAT_Y - 0.04, 0),           // seat rail
      new THREE.BoxGeometry(0.1, 0.03, 0.12).translate(-0.2, 0.015, 0),                // feet
      new THREE.BoxGeometry(0.1, 0.03, 0.12).translate(0.2, 0.015, 0),
      new THREE.TorusGeometry(0.08, 0.012, 6, 16, Math.PI).rotateY(Math.PI / 2).translate(-0.22, SEAT_Y + 0.12, 0), // armrest curl
    ]);
    e.add(new THREE.Mesh(geo, iron));
    bench.add(e);
    ends.push(e);
  }
  // seat slats: each in two halves hinged at the ends, so the middle can break and fold down
  const slats = [];
  for (let k = 0; k < 4; k++) {
    const x = -0.2 + k * 0.13;
    for (const sz of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(x, SEAT_Y, sz * (BL / 2 - 0.06));
      const len = BL / 2 - 0.06 - 0.01 * (k % 2);
      const geo = new THREE.BoxGeometry(0.11, 0.035, len).translate(0, 0.017, -sz * len / 2);
      // (a jagged broken end: the last few cm thinner)
      piv.add(new THREE.Mesh(geo, k % 2 ? woodD : wood));
      bench.add(piv);
      slats.push({ piv, sz, k });
    }
  }
  // back slats (stay whole; they tip back with the ends)
  const back = new THREE.Group();
  for (let k = 0; k < 3; k++) back.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, BL - 0.1).translate(0.24 + k * 0.03, 0.6 + k * 0.13, 0), k % 2 ? woodD : wood));
  bench.add(back);
  bench.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---- the pit under the hole: soil walls (an open cylinder seen from inside), dark below ----
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, side: THREE.BackSide });
  pitMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPP;\nfloat ph(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float y = vPP.y;
        vec3 soil = mix(vec3(0.42, 0.32, 0.22), vec3(0.3, 0.22, 0.15), smoothstep(-0.4, -1.2, y));
        soil = mix(soil, vec3(0.55, 0.54, 0.5), step(-0.14, y));                     // the slab's cut edge
        soil = mix(soil, vec3(0.62, 0.58, 0.5), step(-0.35, y) * (1.0 - step(-0.14, y)) * 0.7);  // gravel base
        soil *= 0.75 + 0.5 * ph(floor(vec2(atan(vPP.z, vPP.x) * 40.0, y * 30.0)));
        soil *= mix(1.0, 0.15, smoothstep(-0.6, -2.6, y));                            // darker down the hole
        diffuseColor.rgb = soil;`);
  };
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 40, 1, true).translate(0, -1.5, 0), pitMat);
  g.add(pit);
  const pitFloor = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  pitFloor.position.y = -2.95;
  g.add(pitFloor);

  // ---- the slabs round the hole: jagged wedges of sidewalk that tip into it ----
  const R = rng(77);
  const slabMat = ctx.plainMat(0x948f88, 0.9);
  const SH = [];
  const NS = 9;
  for (let i = 0; i < NS; i++) {
    const a0 = (i / NS) * Math.PI * 2 + R() * 0.2, a1 = ((i + 1) / NS) * Math.PI * 2 + R() * 0.2;
    const r0 = 0.15, r1 = 1.0 + R() * 0.15;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    shape.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
    shape.lineTo(Math.cos((a0 + a1) / 2) * (r1 + 0.1), Math.sin((a0 + a1) / 2) * (r1 + 0.1));
    shape.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    shape.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.0, 0);
    const am = (a0 + a1) / 2;
    // hinge at the outer edge: the slab tips in about a tangent axis there
    const piv = new THREE.Group();
    const hx = Math.cos(am) * r1, hz = Math.sin(am) * r1;
    piv.position.set(hx, 0, hz);
    const m = new THREE.Mesh(geo.translate(-hx, 0, -hz), slabMat);
    m.castShadow = true; m.receiveShadow = true;
    piv.add(m);
    piv.visible = false;
    g.add(piv);
    SH.push({ piv, am, tip: 0.5 + R() * 0.5, d: R() * 0.15 });
  }
  // ---- chunks thrown up when the slab breaks, and splinters when the bench goes ----
  const NC = 46;
  const chunk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.05, 0), ctx.plainMat(0xffffff, 0.9), NC);
  chunk.castShadow = true; chunk.frustumCulled = false;
  const CH = [];
  const cc = new THREE.Color();
  for (let i = 0; i < NC; i++) {
    const wood_ = i < 14;
    const a = R() * Math.PI * 2, sp = 1.0 + R() * 2.4;
    CH.push({ t0: wood_ ? V_SNAP + R() * 0.05 : V_CRACK + R() * 0.08, x: Math.cos(a) * (wood_ ? 0.1 : 0.4 + R() * 0.5), z: wood_ ? (R() - 0.5) * 0.5 : Math.sin(a) * (0.4 + R() * 0.5),
      vx: Math.cos(a) * sp * (wood_ ? 0.6 : 1), vz: Math.sin(a) * sp * (wood_ ? 0.6 : 1), vy: (wood_ ? 1.0 : 1.8) + R() * 1.8, y0: wood_ ? SEAT_Y : 0.05,
      s: wood_ ? 0.4 + R() * 0.5 : 0.5 + R() * 1.1, sx: wood_ ? 3 : 1, spin: R() * 10, wood: wood_ });
    chunk.setColorAt(i, cc.set(wood_ ? (R() < 0.5 ? 0x8a5a34 : 0x6a4226) : (R() < 0.6 ? 0x948f88 : 0x6a5a48)));
  }
  g.add(chunk);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();

  // how far the bench has gone (0 whole .. 1 broken flat)
  const brokeAt = (v) => smooth(V_SNAP, V_SNAP + 0.22, v);
  return {
    group: g,
    // sink: how far the ground under you has gone down (m)
    frame(v, s) {
      // the bench: a sag that grows with your weight, then it snaps
      const sag = 0.012 * clamp(s.mult / 3, 0, 3) * (v < V_SNAP ? 1 : 0);
      const b = brokeAt(v);
      const shake = v < V_SNAP ? Math.sin(v * 60) * 0.004 * smooth(0, V_SNAP, v) : 0;
      for (const S of slats) {
        // a break in the middle: each half folds down about its hinge at the end (the inner ends hit the ground)
        const drop = Math.asin(clamp((SEAT_Y - 0.03) / (BL / 2 - 0.06), 0, 1));
        S.piv.rotation.set(S.sz * (sag * 2 + shake + b * drop * (0.92 + 0.03 * S.k)), 0, 0);
      }
      ends.forEach((E, i) => { const sz = i ? 1 : -1; E.rotation.set(sz * 0.35 * b, 0, -0.12 * b * (i ? 1 : -0.6)); E.position.y = -0.02 * b; });
      back.rotation.set(0, 0, -0.5 * b); back.position.set(0.05 * b, -0.18 * b, 0);
      bench.position.y = -s.sinkGround * 0.6;
      bench.visible = v < V_PUNCH + 0.1;
      // the hole: the slabs tip in once the sidewalk breaks
      const k = smooth(V_CRACK, V_CRACK + 0.35, v);
      for (const S of SH) {
        S.piv.visible = v >= V_CRACK;
        const tip = k * S.tip + smooth(V_CRACK + 0.4, V_PUNCH, v) * 0.3;
        // rotate about the tangent at the hinge: tip the inner end down
        const ax = new THREE.Vector3(-Math.sin(S.am), 0, Math.cos(S.am));
        S.piv.quaternion.setFromAxisAngle(ax, tip);
        S.piv.position.y = -S.d * k - 0.25 * smooth(V_PUNCH - 0.4, V_PUNCH, v);
      }
      pit.visible = pitFloor.visible = v >= V_CRACK - 0.01;
      // flying chunks (ballistic, then they lie where they land)
      CH.forEach((C, i) => {
        const t = v - C.t0;
        if (t < 0) { chunk.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
        const tl = Math.min(t, (C.vy + Math.sqrt(C.vy * C.vy + 2 * 9.8 * C.y0)) / 9.8);
        let x = C.x + C.vx * tl, z = C.z + C.vz * tl, y = Math.max(0.03, C.y0 + C.vy * tl - 4.9 * tl * tl);
        // (anything inside the hole falls in)
        if (v > V_CRACK && Math.hypot(x, z) < 1.0) y -= 4.9 * Math.pow(Math.max(0, v - V_CRACK), 2);
        e.set(C.spin * tl, C.spin * 0.7 * tl, 0);
        q.setFromEuler(e);
        sc.set(C.s * C.sx * 0.5, C.s * 0.5, C.s);
        m4.compose(p.set(x, y, z), q, sc);
        chunk.setMatrixAt(i, m4);
      });
      chunk.instanceMatrix.needsUpdate = true;
    },
  };
}
