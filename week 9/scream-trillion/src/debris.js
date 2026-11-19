// Pieces of the ground itself: the pavement round your crater torn up and thrown out in every direction (~30 psi:
// the ones on the camera's side fly past the lens, from ~0:21), and the street's asphalt peeling up in a wave that
// runs out from you along the road (~20 psi, 5.4-21 m out between 0:21 and 0:41), leaving bare dirt (ground.js
// draws the trench with the same cell hash). Pure functions of time, like everything else.
import * as THREE from 'three';
import { MOUTH, YOU, RW, CAM } from './layout.js';
import { timeOfPressure, PSI } from './timeline.js';
import { throwAt } from './physics.js';
import { rng } from './util.js';

const f32 = Math.fround;
const cellHash = (ix, iz) => { const x = f32(f32(ix * 7 + iz * 13 + 1000) * f32(0.61803398)); return x - Math.floor(x); };
export const PEEL = { cw: 2.0, cl: 3.0, x0: -RW, z0: -24, nx: Math.round(2 * RW / 2.0), nz: Math.round(36 / 3.0), thr: 20 * PSI };

export const PAVE = [], STRIPS = [];
{
  const R = rng(2323);
  // the crater's pavement: slabs from 3 to 6 m round you
  for (let k = 0; k < 46; k++) {
    const a = (k / 46) * Math.PI * 2 + R() * 0.12, r = 3.0 + 3.2 * R();
    const x = YOU.x + Math.cos(a) * r, z = YOU.z + Math.sin(a) * r;
    if (x > 10.9) continue;
    const t0 = timeOfPressure(30 * PSI * (0.85 + 0.3 * R()), Math.hypot(r, 1.5));
    const V = 9 + 9 * R();
    let vx = Math.cos(a) * V, vz = Math.sin(a) * V;
    const vel = [vx, 2 + 5 * R(), vz];
    // (never straight through the lens: aim the ones heading at the camera a little to the side of it)
    PAVE.push({ T: { t0, p: [x, 0.08, z], vel, hs: 0.06, D: 8, wallX: 10.8 }, sx: 0.4 + 0.5 * R(), sz: 0.35 + 0.45 * R(), spin: [R() * 8 - 4, R() * 8 - 4, R() * 8 - 4], col: R() < 0.5 ? 0x77726c : 0x8a857e });
  }
  // the asphalt: cells of the road, each lifts when the pressure over it passes ~20 psi (its own +-15%)
  for (let ix = 0; ix < PEEL.nx; ix++) for (let iz = 0; iz < PEEL.nz; iz++) {
    const x = PEEL.x0 + (ix + 0.5) * PEEL.cw, z = PEEL.z0 + (iz + 0.5) * PEEL.cl;
    const r = Math.hypot(x - MOUTH.x, z - MOUTH.z);
    const t0 = timeOfPressure(PEEL.thr * (0.85 + 0.3 * cellHash(ix, iz)), Math.hypot(r, 1.5));
    if (!(t0 < 44.6)) continue;
    const dx = (x - MOUTH.x) / r, dz = (z - MOUTH.z) / r, V = 3 + 5 * R();
    STRIPS.push({ ix, iz, T: { t0, p: [x, 0.1, z], vel: [dx * V, 4 + 4 * R(), dz * V], hs: 0.1, D: 6, wallX: 10.6 }, dx, dz, spin: 2 + 3 * R() });
  }
  STRIPS.sort((a, b) => a.T.t0 - b.T.t0);
  console.log(`debris: ${PAVE.length} slabs from ${Math.min(...PAVE.map((p) => p.T.t0)).toFixed(1)} s, ${STRIPS.length} road cells peel ${STRIPS.length ? STRIPS[0].T.t0.toFixed(1) : '-'}-${STRIPS.length ? STRIPS[STRIPS.length - 1].T.t0.toFixed(1) : '-'} s`);
}

export function makeDebris(scene, ctx) {
  const pave = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.13, 1), ctx.plainMat(0xffffff, 0.92), PAVE.length);
  const col = new THREE.Color();
  PAVE.forEach((p, i) => pave.setColorAt(i, col.set(p.col)));
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(PEEL.cw * 0.96, 0.16, PEEL.cl * 0.96), ctx.plainMat(0x2a2a2c, 0.85), STRIPS.length);
  for (const m of [pave, strips]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), st = {}, ax = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    frame(v) {
      PAVE.forEach((P, i) => {
        if (!(v > P.T.t0)) { pave.setMatrixAt(i, zero); return; }
        throwAt(P.T, v, st);
        const f = Math.min(st.t, P.T.tl ?? st.t);
        e.set(P.spin[0] * f, P.spin[1] * f, P.spin[2] * f); q.setFromEuler(e);
        pave.setMatrixAt(i, m4.compose(p.set(st.x, st.y, st.z), q, sc.set(P.sx, 1, P.sz)));
      });
      pave.instanceMatrix.needsUpdate = true;
      STRIPS.forEach((S, i) => {
        // flush in the road until it goes, then the edge nearest you lifts first and it flips away
        if (!(v > S.T.t0)) { strips.setMatrixAt(i, m4.makeTranslation(S.T.p[0], -0.06, S.T.p[2])); return; }
        throwAt(S.T, v, st);
        const f = Math.min(st.t, S.T.tl ?? st.t);
        ax.set(S.dz, 0, -S.dx);
        q.setFromAxisAngle(ax, S.spin * f + 0.6 * Math.min(1, st.t * 4));
        strips.setMatrixAt(i, m4.compose(p.set(st.x, st.y, st.z), q, sc.set(1, 1, 1)));
      });
      strips.instanceMatrix.needsUpdate = true;
    },
  };
}
export { cellHash };
