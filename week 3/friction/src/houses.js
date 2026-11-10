// The houses (one instanced box each, look in facade.js), their bay windows, how they fold, and what comes off them.
// A wooden house is held together by nails, and a nail only holds by friction: once they slide out the frame racks
// sideways like a deck of cards (the top goes downhill), then it pancakes into a heap of splintered timber. The heap
// stays (its foundation is set into the ground) until the hillside itself slides, then it rides down with it.
// Loose pieces (boards, siding, window frames, furniture) drop off the front and slide away down the street.
// When the slab goes, everything on it rides down (ride() in timeline.js); what stands below its toe is shoved
// ahead of the earth's nose (bulldoze()) and over the seawall.
import * as THREE from 'three';
import { H } from './layout.js';
import { tOf, slide, ride, bulldoze, slabD, slabU, surfaceY, hill, VT, SLAB, Z_EDGE, WATER_Y } from './timeline.js';
import { facadeMaterial, F } from './facade.js';
import { rng, smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), mS = new THREE.Matrix4(), mT = new THREE.Matrix4(), mB = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();
const e3 = new THREE.Euler(), q1 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
const sl = {}, rd = {};

// how far a house has folded at video time v: shear (downhill lean, as a slope dy -> dz) and the height left
export function foldState(b, v) {
  const k = clamp((v - b.vFall) / b.dur);
  if (k <= 0) return { shear: 0, left: 1, k: 0 };
  const e = k * k * (3 - 2 * k);
  // (it racks over, then slumps into a low heap: the lean eases off as the walls pile up)
  const shear = b.lean * Math.min(1, e * 1.6) * (1 - 0.45 * smooth(0.55, 1, k)) + 0.12 * smooth(0.5, 1, k);
  const left = 1 - 0.78 * smooth(0.25, 1, k);
  return { shear, left, k };
}
// where a house's base is at video time v (it rides the slab, or is shoved by its nose)
export function houseBase(b, v, out = {}) {
  const D = slabD(v);
  if (b.z < SLAB.toe) {
    ride(b.z, v, rd);
    out.dz = rd.z - b.z; out.dy = rd.y - hill(b.z); out.gone = rd.phase === 3 ? rd.dt : -1;
  } else {
    // shoved ahead of the nose; over the seawall it drops into the bay
    const sh = bulldoze(b.z, v), z = b.z + sh;
    const over = z - Z_EDGE, tOver = over / Math.max(6, slabU(v));
    out.dz = sh;
    out.dy = sh <= 0 ? 0 : over < 0 ? surfaceY(z, D) - hill(b.z) : WATER_Y - 4.9 * Math.min(tOver, 1) ** 2 - hill(b.z);
    out.gone = over > 0 ? tOver : -1;
  }
  return out;
}

export function makeHouses(scene) {
  const n = H.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aF = new Float32Array(n * 4);
  H.forEach((b, i) => {
    const za = b.z - (b.ax === 'x' ? b.w : b.d) / 2;
    aT.set([b.vFall, b.dur, b.seed, b.kind], i * 4);
    aF.set([b.ax === 'x' ? 0 : 1, b.ax === 'x' ? -b.side : -(b.sz || 1), hill(za) - b.y0, b.hh], i * 4);
  });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aF', new THREE.InstancedBufferAttribute(aF, 4));
  const mat = facadeMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  H.forEach((b, i) => mesh.setColorAt(i, col.set(b.col)));
  scene.add(mesh);

  // bay windows on the Victorians that face the main street and the cross streets near it
  const BAYS = H.filter((b) => b.kind === 0 && (b.front || Math.abs(b.x) < 120));
  const bgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bT = new Float32Array(BAYS.length * 4), bF = new Float32Array(BAYS.length * 4);
  BAYS.forEach((b, i) => {
    const za = b.z - (b.ax === 'x' ? b.w : b.d) / 2;
    b.bay = { y0: hill(za) - b.y0 + 3.0, h: b.yTop - b.y0 - (hill(za) - b.y0 + 3.0) - 1.4 };
    bT.set([b.vFall, b.dur, b.seed, 3], i * 4);
    bF.set([b.ax === 'x' ? 0 : 1, b.ax === 'x' ? -b.side : -(b.sz || 1), 0, b.bay.h], i * 4);
  });
  bgeo.setAttribute('aT', new THREE.InstancedBufferAttribute(bT, 4));
  bgeo.setAttribute('aF', new THREE.InstancedBufferAttribute(bF, 4));
  const bays = new THREE.InstancedMesh(bgeo, mat, BAYS.length);
  bays.castShadow = true; bays.receiveShadow = true; bays.frustumCulled = false;
  BAYS.forEach((b, i) => bays.setColorAt(i, col.set(b.col)));
  scene.add(bays);

  // ---------- loose pieces off the fronts ----------
  const CH = [];
  const R = rng(616);
  const KINDS = [
    { sz: [0.05, 0.16, 3.4], c: null },            // boards
    { sz: [0.05, 0.9, 1.6], c: null },             // siding panels (painted)
    { sz: [0.12, 1.5, 0.95], c: 0xeeeae2 },        // window frames
    { sz: [0.7, 0.8, 1.2], c: 'furn' },            // furniture
    { sz: [0.6, 0.05, 1.2], c: 0x3a3634 },         // roof tar sheets
  ];
  const FURN = [0x6a4a32, 0x8a7a66, 0x3d5a7a, 0xb04a3a, 0xd8d0c0, 0x2e2e30];
  for (const b of H) {
    if (b.kind > 1 || b.vFall > 1e8 || !(b.front || Math.abs(b.x) < 60)) continue;
    const np = b.front ? 16 : 6;
    for (let k = 0; k < np; k++) {
      const kd = KINDS[Math.floor(R() * KINDS.length)];
      const xf = b.ax === 'x' ? b.x - b.side * 8 : b.x + (R() - 0.5) * b.w * 0.8;
      const zf = b.ax === 'x' ? b.z + (R() - 0.5) * b.w * 0.8 : b.z - (b.sz || 1) * 8;
      const out = b.ax === 'x' ? -b.side : 0;
      CH.push({
        x: xf, y: b.y0 + 2 + R() * (b.hh - 3), z: zf, out, v: b.vFall + 0.15 + R() * b.dur * 0.9,
        vx: (0.8 + R() * 2.2) * out, vz: R() * 1.5, sz: kd.sz.map((s) => s * (0.7 + R() * 0.6)),
        c: kd.c === null ? b.col : kd.c === 'furn' ? FURN[Math.floor(R() * FURN.length)] : kd.c, seed: R(),
      });
    }
  }
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), CH.length);
  chunks.castShadow = true; chunks.frustumCulled = false;
  CH.forEach((c, i) => { chunks.setColorAt(i, col.set(c.c)); chunks.setMatrixAt(i, HIDE); });
  scene.add(chunks);
  const hb = {};

  // where a loose piece is: thrown out off the front, falling to the street, then sliding away like everything else
  function piece(c, v, out) {
    const dt = v - c.v;
    if (dt <= 0) return null;
    const g = hill(c.z);
    const tFall = Math.sqrt(2 * Math.max(0.1, c.y - g - 0.1) / 9.81);
    let x, y, z, ang;
    if (dt < tFall) {
      x = c.x + c.vx * dt; z = c.z + c.vz * dt; y = c.y - 4.905 * dt * dt;
      ang = dt * (2 + c.seed * 3);
    } else {
      x = c.x + c.vx * tFall + c.vx * 0.4 * (1 - Math.exp(-(dt - tFall) / 0.4));   // skids on sideways a little
      x = Math.sign(x) * Math.min(Math.abs(x), 10.5);
      const o = { z0: c.z + c.vz * tFall, ts: tOf(c.v + tFall), vt: VT.debris, u0: c.vz + 1.5 };
      slide(o, tOf(v), sl);
      z = sl.z; y = sl.y + c.sz[1] * 0.3; ang = tFall * (2 + c.seed * 3) + (sl.z - o.z0) * 0.08 * (c.seed - 0.3);
      if (sl.phase >= 2) { y = sl.y; if (sl.phase === 3 && sl.dt > 4) return null; }
    }
    out.x = x; out.y = y; out.z = z; out.ang = ang;
    return out;
  }

  return {
    mesh, CH,
    frame(v, s, smoke, cam) {
      F.uTime.value = v;
      for (let i = 0; i < n; i++) {
        const b = H[i];
        const st = foldState(b, v);
        houseBase(b, v, hb);
        b._gone = hb.gone;
        if (hb.gone > 2.5) { mesh.setMatrixAt(i, HIDE); continue; }
        const sink = hb.gone > 0 ? hb.gone * 2.5 : 0;
        const dx = b.ax === 'x' ? b.d : b.w, dz = b.ax === 'x' ? b.w : b.d;
        // base at the downhill end, sheared toward +z, squashed as it pancakes
        mT.makeTranslation(b.x, b.y0 + hb.dy - sink, b.z + hb.dz);
        mS.set(1, 0, 0, 0, 0, st.left, 0, 0, 0, st.shear, 1, 0, 0, 0, 0, 1);
        m4.multiplyMatrices(mT, mS).multiply(mB.makeScale(dx, b.hh, dz));
        mesh.setMatrixAt(i, m4);
        b._m = b._m || new THREE.Matrix4();
        b._m.multiplyMatrices(mT, mS);
        b._sink = sink; b._gone = hb.gone;
      }
      mesh.instanceMatrix.needsUpdate = true;
      BAYS.forEach((b, i) => {
        if (b._gone > 2.5) { bays.setMatrixAt(i, HIDE); return; }
        // in the house's own (unsheared) frame: centred on the front, 0.8 m out, from the first floor to the cornice
        const fx = b.ax === 'x' ? -b.side * (b.d / 2 + 0.4) : 0, fz = b.ax === 'x' ? 0 : -(b.sz || 1) * (b.d / 2 + 0.4);
        const sx = b.ax === 'x' ? 0.8 : 3.4, sz = b.ax === 'x' ? 3.4 : 0.8;
        m4.copy(b._m).multiply(mB.makeTranslation(fx, b.bay.y0, fz)).multiply(mT.makeScale(sx, b.bay.h, sz));
        bays.setMatrixAt(i, m4);
      });
      bays.instanceMatrix.needsUpdate = true;
      // ---- loose pieces ----
      const o = {};
      for (let i = 0; i < CH.length; i++) {
        const c = CH[i];
        const p = v >= c.v ? piece(c, v, o) : null;
        if (!p) { chunks.setMatrixAt(i, HIDE); continue; }
        e3.set(p.ang * 0.7, c.seed * 6, p.ang * 0.4 * (c.seed - 0.5)); q1.setFromEuler(e3);
        m4.compose(p3.set(p.x, p.y, p.z), q1, s3.set(c.sz[0], c.sz[1], c.sz[2]));
        chunks.setMatrixAt(i, m4);
      }
      chunks.instanceMatrix.needsUpdate = true;
      // ---- dust where houses fold ----
      const camZ = cam.position.z;
      for (const b of H) {
        if (b.vFall > 1e8) continue;
        const dtB = v - b.vFall;
        if (dtB < 0 || dtB > b.dur + 5) continue;
        if (!b.front && Math.abs(b.x) > 140) continue;
        const Rb = rng(Math.round(b.seed * 1e6));
        const np = b.front ? 10 : 4;
        for (let k = 0; k < np; k++) {
          const vs = b.vFall + b.dur * (0.3 + 0.8 * (k / np));
          const age = v - vs;
          const ox = (Rb() - 0.5) * (b.ax === 'x' ? b.d : b.w), oz = (Rb() - 0.5) * 7, seed = Rb();
          if (age < 0 || age > 5) continue;
          const r = 2.5 + seed * 3 + age * 2.4;
          const zz = b.z + oz + age * 1.5 + hb.dz;
          const a = 0.2 * smooth(0, 0.25, age) * (1 - smooth(2, 5, age)) * smooth(r + 2, r + 25, Math.abs(zz - camZ) + Math.abs(b.x));
          smoke.puff(b.x + ox, hill(b.z) + 1 + age * 1.2 + seed * 2, zz, r, a, 0.72, 0, seed);
        }
      }
    },
  };
}
