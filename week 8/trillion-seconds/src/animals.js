// The animals that lived here before the city and come back to the forest: gray wolves, black bears and elk (all
// native to the north-eastern US; the eastern elk was hunted out in the 1800s). From 0:31 they are time-lapse
// ghosts like the deer, along the river and in the old avenue's meadow. At the finish line (0:42) time runs at
// normal speed again: no more ghosts, and real animals walk past you (an elk close in front, two wolves trotting, a
// bear ambling down to the river), legs stepping.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AV, CZ, YOU } from './layout.js';
import { groundH, riverX, waterHalfWidth } from './terrain.js';
import { rng, smooth } from './util.js';
import { V_REAL } from './timeline.js';

const S = (rx, ry, rz, x, y, z, seg = 12) => new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4)).scale(rx, ry, rz).translate(x, y, z);
const Cyl = (r0, r1, L, ax, x, y, z) => new THREE.CylinderGeometry(r1, r0, L, 8).translate(0, L / 2, 0).rotateX(ax).translate(x, y, z);

// each animal faces +z, feet on y = 0. legs: { r, len, x, z } hanging from hip height len
function build(kind) {
  const g = [];
  let legs, color;
  if (kind === 'wolf') {
    color = 0x77706a;
    g.push(S(0.16, 0.19, 0.48, 0, 0.64, 0), S(0.17, 0.21, 0.2, 0, 0.67, 0.32), Cyl(0.08, 0.07, 0.32, 0.9, 0, 0.7, 0.4));
    g.push(S(0.105, 0.105, 0.13, 0, 0.88, 0.62), new THREE.ConeGeometry(0.055, 0.2, 8).rotateX(Math.PI / 2).translate(0, 0.85, 0.78));
    for (const sx of [-1, 1]) g.push(new THREE.ConeGeometry(0.035, 0.1, 6).translate(sx * 0.055, 0.99, 0.6));
    g.push(Cyl(0.05, 0.03, 0.42, -2.3, 0, 0.7, -0.44));
    legs = [[-0.08, 0.3], [0.08, 0.3], [-0.08, -0.32], [0.08, -0.32]].map(([x, z]) => ({ r: 0.035, len: 0.58, x, z }));
  } else if (kind === 'bear') {
    color = 0x1d1714;
    g.push(S(0.3, 0.32, 0.62, 0, 0.75, 0), S(0.27, 0.3, 0.3, 0, 0.86, 0.3), S(0.28, 0.3, 0.3, 0, 0.78, -0.35));
    g.push(S(0.17, 0.16, 0.18, 0, 0.84, 0.74), S(0.075, 0.07, 0.11, 0, 0.8, 0.9));
    for (const sx of [-1, 1]) g.push(S(0.05, 0.05, 0.03, sx * 0.11, 0.98, 0.7, 8));
    legs = [[-0.17, 0.38], [0.17, 0.38], [-0.17, -0.4], [0.17, -0.4]].map(([x, z]) => ({ r: 0.085, len: 0.62, x, z }));
  } else {
    color = 0x8a6a48;   // elk: tan body, a darker neck, big antlers
    g.push(S(0.3, 0.36, 0.85, 0, 1.38, 0), S(0.29, 0.34, 0.32, 0, 1.42, 0.55), Cyl(0.16, 0.12, 0.7, 0.55, 0, 1.5, 0.66));
    g.push(S(0.12, 0.13, 0.3, 0, 2.08, 1.06).rotateX(0), S(0.06, 0.12, 0.05, 0, 1.93, -0.86, 8));
    for (const sx of [-1, 1]) {
      g.push(S(0.03, 0.09, 0.05, sx * 0.13, 2.22, 0.95, 8));
      // the antler: a beam sweeping back and up, five tines forward
      const beam = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.08, 2.2, 1.0), new THREE.Vector3(sx * 0.3, 2.55, 0.85), new THREE.Vector3(sx * 0.42, 2.95, 0.55), new THREE.Vector3(sx * 0.38, 3.25, 0.3)]);
      g.push(new THREE.TubeGeometry(beam, 10, 0.03, 5));
      for (let k = 0; k < 5; k++) {
        const pt = beam.getPoint(0.15 + k * 0.19);
        g.push(new THREE.CylinderGeometry(0.012, 0.022, 0.32 - k * 0.03, 5).translate(0, 0.15, 0).rotateX(0.9).translate(pt.x, pt.y, pt.z));
      }
    }
    legs = [[-0.16, 0.6], [0.16, 0.6], [-0.16, -0.62], [0.16, -0.62]].map(([x, z]) => ({ r: 0.05, len: 1.22, x, z }));
  }
  return { body: mergeGeometries(g.map((x) => x.toNonIndexed())), legs, color };
}
const legGeo = (L) => new THREE.CylinderGeometry(L.r * 0.65, L.r, L.len, 7).translate(0, -L.len / 2, 0);
function ghostGeo(a) {
  const parts = [a.body];
  a.legs.forEach((L, i) => parts.push(legGeo(L).rotateX(i % 3 === 0 ? 0.25 : -0.22).translate(L.x, L.len, L.z).toNonIndexed()));
  return mergeGeometries(parts);
}

export function makeAnimals(scene, ctx, camPos) {
  const KINDS = ['wolf', 'bear', 'elk'].map(build);
  // ---- the time-lapse ghosts ----
  const NG = 18, COPIES = 3;
  const ghosts = KINDS.map((a) => {
    const m = new THREE.InstancedMesh(ghostGeo(a), ctx.hazedMat(new THREE.MeshStandardMaterial({ color: a.color, roughness: 0.85, transparent: true, opacity: 0.6, depthWrite: true })), NG * COPIES);
    m.frustumCulled = false; m.renderOrder = 2; m.receiveShadow = true;
    scene.add(m);
    return m;
  });
  // ---- the real ones, after the finish line ----
  const mk = (kind, scale) => {
    const a = KINDS[kind];
    const mat = ctx.plainMat(a.color, 0.85);
    const root = new THREE.Group();
    const body = new THREE.Mesh(a.body, mat);
    body.castShadow = true; root.add(body);
    const legs = a.legs.map((L) => { const hip = new THREE.Group(); hip.position.set(L.x, L.len, L.z); const m = new THREE.Mesh(legGeo(L), mat); m.castShadow = true; hip.add(m); root.add(hip); return hip; });
    root.scale.setScalar(scale); root.visible = false;
    scene.add(root);
    return { root, legs };
  };
  // paths: [x0, z0] -> [x1, z1] over the seconds after the finish line, speed in m/s, stride (m per step cycle)
  const WALKERS = [
    { a: mk(2, 1.0), p0: [-2.5, -25], p1: [-13, -20.5], speed: 1.5, stride: 2.6, bob: 0.03 },          // the elk, close in front
    { a: mk(0, 1.0), p0: [-19, -35], p1: [-2, -38], speed: 2.4, stride: 1.4, bob: 0.03 },                 // two wolves trotting
    { a: mk(0, 0.95), p0: [-21.5, -33.4], p1: [-4.5, -36.6], speed: 2.4, stride: 1.4, bob: 0.03 },
    { a: mk(1, 1.0), p0: [-18, -47], p1: [-6, -50], speed: 1.2, stride: 1.3, bob: 0.02 },                  // the bear, ambling to the river
  ];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    frame(v, s) {
      // ghosts
      for (const m of ghosts) for (let i = 0; i < NG * COPIES; i++) m.setMatrixAt(i, zero);
      const share = s.animals * s.ghostFade * (s.real ? 0 : 1);
      if (share > 0) {
        const R = rng(Math.floor(v * 60 + 0.5) * 6113 + 29);
        const whw = waterHalfWidth(s);
        for (let k = 0; k < NG; k++) {
          const on = R() < share * 0.8;
          const kind = R() < 0.45 ? 0 : R() < 0.45 ? 1 : 2;
          const z = YOU.z - 8 - Math.pow(R(), 1.6) * 45;
          const xr = riverX(z, s.meander);
          // along the banks or out in the meadow (never in the water)
          let x = R() < 0.5 ? xr + (R() < 0.5 ? -1 : 1) * (whw + 1 + R() * 5) : -16 + R() * 22;
          if (Math.abs(x - xr) < whw + 0.6) x = xr - whw - 1.5;
          const yaw = R() * Math.PI * 2;
          if (!on || Math.hypot(x - camPos.x, z - camPos.z) < 5 || Math.hypot(x - YOU.x, z - YOU.z) < 3) continue;
          const gy = groundH(x, z, s);
          for (let c = 0; c < COPIES; c++) {
            e.set(0, yaw, 0); q.setFromEuler(e);
            const st = kind === 1 ? 0.2 : 0.35;
            ghosts[kind].setMatrixAt(k * COPIES + c, m4.compose(p.set(x - Math.sin(yaw) * st * c, gy, z - Math.cos(yaw) * st * c), q, one.set(1, 1, 1)));
          }
        }
      }
      for (const m of ghosts) m.instanceMatrix.needsUpdate = true;
      // the real ones
      const t = v - V_REAL;
      for (const w of WALKERS) {
        w.a.root.visible = t >= 0;
        if (t < 0) continue;
        const dx = w.p1[0] - w.p0[0], dz = w.p1[1] - w.p0[1], L = Math.hypot(dx, dz);
        const d = Math.min(L, w.speed * t);
        const x = w.p0[0] + dx / L * d, z = w.p0[1] + dz / L * d;
        const ph = (d / w.stride) * Math.PI * 2;
        w.a.root.position.set(x, groundH(x, z, s) + Math.abs(Math.sin(ph)) * w.bob, z);
        w.a.root.rotation.y = Math.atan2(dx, dz);
        // legs: diagonal pairs swing together
        w.a.legs.forEach((leg, i) => { leg.rotation.x = 0.38 * Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)); });
      }
    },
  };
}
