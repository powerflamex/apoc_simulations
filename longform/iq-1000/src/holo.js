// What you invent, drawn in light in the air over the frozen plaza (your mind's blueprints, in the same glowing ink as
// the thought lines): the molecule of a cure for cancer building itself over the street, a fusion reactor (a star in a
// bottle) lighting up over the avenue, a rocket to Mars over the fountain with its path up into the sky, and at a
// thousand times, a web over the whole sky: everything, explained. Each builds over its section (timeline.js) and
// stays up until you let go. Additive lines and points; pure function of the video clock.
import * as THREE from 'three';
import { rng, smooth, clamp } from './util.js';
import { SEC } from './timeline.js';

const CYAN = new THREE.Color(0.55, 0.9, 1.25), GOLD = new THREE.Color(1.5, 1.1, 0.5);

function lineMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}
const pointMat = (color) => lineMat(color);
// glowing tubes along a list of segment end points ([a, b, a, b, ...]): thin lines vanish on screen, these read
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function tubes(list, radius, mat) {
  const n = list.length / 2;
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true), mat, n);
  for (let i = 0; i < n; i++) {
    const a = new THREE.Vector3(...list[2 * i]), b = new THREE.Vector3(...list[2 * i + 1]);
    const d = b.clone().sub(a), len = d.length();
    _q.setFromUnitVectors(_up, d.normalize());
    _m.compose(_v.copy(a).add(b).multiplyScalar(0.5), _q, _s.set(1, len, 1));
    mesh.setMatrixAt(i, _m);
  }
  mesh.userData.n = n;
  return mesh;
}
function spheres(list, radius, mat) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 10, 8), mat, list.length);
  list.forEach((p, i) => mesh.setMatrixAt(i, _m.makeTranslation(...p)));
  mesh.userData.n = list.length;
  return mesh;
}

export function makeHolo(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const parts = [];

  // ---- the cure: a double helix with rungs, then glowing gold when it's done ----
  const cure = new THREE.Group();
  {
    const C = { x: 0.6, y: 3.2, z: -12.5 }, H = 6.2, R = 0.9, N = 64;
    const a = [], b = [], rungs = [], atoms = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), t = u * Math.PI * 6, y = C.y + u * H;
      const p = [C.x + R * Math.cos(t), y, C.z + R * Math.sin(t)], q = [C.x - R * Math.cos(t), y, C.z - R * Math.sin(t)];
      a.push(p); b.push(q);
      if (i % 3 === 0) { rungs.push(p, q); atoms.push(p, q); }
    }
    const strand = (pts) => { const l = []; for (let i = 0; i + 1 < pts.length; i++) l.push(pts[i], pts[i + 1]); return l; };
    const all = [...strand(a), ...strand(b), ...rungs];
    const mat = lineMat(CYAN.clone());
    const lines = tubes(all, 0.035, mat);
    const pm = pointMat(CYAN.clone());
    const pts = spheres(atoms, 0.11, pm);
    cure.add(lines, pts);
    parts.push({ group: cure, from: SEC.cure0, to: SEC.cure1, count: all.length, lines, pts, mats: [mat, pm], gold: SEC.cure1 });
  }
  // ---- fusion: a ring of plasma held in magnetic coils, over the avenue ----
  const fusion = new THREE.Group();
  {
    const C = new THREE.Vector3(-2, 30, -70), Rm = 9, rm = 2.2;
    const coils = [];
    for (let k = 0; k < 16; k++) {
      const ang = k / 16 * Math.PI * 2;
      const c = new THREE.Vector3(Math.cos(ang) * Rm, Math.sin(ang) * Rm, 0);
      const ring = [];
      for (let j = 0; j <= 24; j++) {
        const t = j / 24 * Math.PI * 2;
        const d = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(Math.cos(t) * rm * 1.25).add(new THREE.Vector3(0, 0, Math.sin(t) * rm * 1.25));
        ring.push(c.clone().add(d));
      }
      for (let j = 0; j < 24; j++) coils.push(ring[j].toArray(), ring[j + 1].toArray());
    }
    const mat = lineMat(CYAN.clone());
    const lines = tubes(coils, 0.12, mat);
    // the plasma: a glowing torus that brightens as it ignites
    const plasma = new THREE.Mesh(new THREE.TorusGeometry(Rm, rm * 0.7, 16, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    fusion.add(lines, plasma);
    fusion.position.copy(C);
    fusion.rotation.set(0.25, 0.15, 0);
    parts.push({ group: fusion, from: SEC.fusion0, to: SEC.fusion1 - 5, count: coils.length, lines, mats: [mat], plasma, ignite: SEC.fusion1 - 4.5 });
  }
  // ---- the rocket over the fountain, and its path up into the sky to Mars ----
  const rocket = new THREE.Group();
  {
    const C = { x: -11.5, y: 1.0, z: 3.5 };
    const prof = [[0, 14], [0.9, 12.2], [1.5, 9.5], [1.6, 3.2], [2.6, 0.6], [2.6, 0], [1.2, 0.8], [1.0, 0]];   // radius, height
    const lines = [];
    for (let k = 0; k < 8; k++) {
      const a0 = k / 8 * Math.PI * 2;
      for (let i = 0; i + 1 < prof.length; i++) {
        const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
        lines.push([C.x + r0 * Math.cos(a0), C.y + h0, C.z + r0 * Math.sin(a0)], [C.x + r1 * Math.cos(a0), C.y + h1, C.z + r1 * Math.sin(a0)]);
      }
    }
    for (const [r, h] of [[1.6, 3.2], [1.55, 6.5], [1.5, 9.5], [0.9, 12.2]]) for (let j = 0; j < 24; j++) {
      const t0 = j / 24 * Math.PI * 2, t1 = (j + 1) / 24 * Math.PI * 2;
      lines.push([C.x + r * Math.cos(t0), C.y + h, C.z + r * Math.sin(t0)], [C.x + r * Math.cos(t1), C.y + h, C.z + r * Math.sin(t1)]);
    }
    const nRocket = lines.length;
    // the path: from the nose, curving up and away into the sky; Mars at the end of it
    const M = new THREE.Vector3(-70, 85, 75);
    const P0 = new THREE.Vector3(C.x, C.y + 14, C.z), P1 = new THREE.Vector3(C.x - 5, 60, C.z - 10);
    let prev = P0.clone();
    for (let i = 1; i <= 60; i++) {
      const u = i / 60, p = P0.clone().multiplyScalar((1 - u) ** 2).add(P1.clone().multiplyScalar(2 * u * (1 - u))).add(M.clone().multiplyScalar(u * u));
      if (i % 2) lines.push(prev.toArray(), p.toArray());
      prev = p;
    }
    // Mars: a wire sphere
    for (let j = 0; j < 6; j++) for (let i = 0; i < 24; i++) {
      const lat = (j / 6 - 0.5) * Math.PI * 0.9, t0 = i / 24 * Math.PI * 2, t1 = (i + 1) / 24 * Math.PI * 2, r = 7;
      lines.push([M.x + r * Math.cos(lat) * Math.cos(t0), M.y + r * Math.sin(lat), M.z + r * Math.cos(lat) * Math.sin(t0)], [M.x + r * Math.cos(lat) * Math.cos(t1), M.y + r * Math.sin(lat), M.z + r * Math.cos(lat) * Math.sin(t1)]);
    }
    const mat = lineMat(CYAN.clone());
    const l = tubes(lines, 0.07, mat);
    const mars = new THREE.Mesh(new THREE.SphereGeometry(6.6, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.35, 0.15), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    mars.position.copy(M);
    rocket.add(l, mars);
    parts.push({ group: rocket, from: SEC.rocket0, to: SEC.rocket1, count: lines.length, lines: l, mats: [mat], mars, nRocket });
  }
  // ---- everything, explained: a web over the whole sky ----
  const web = new THREE.Group();
  {
    const r = rng(77), N = 420, pts = [];
    for (let i = 0; i < N; i++) {
      const z = 0.02 + 0.9 * r(), t = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      pts.push(new THREE.Vector3(s * Math.cos(t), z, s * Math.sin(t)).multiplyScalar(60));
    }
    const lines = [];
    for (let i = 0; i < N; i++) {
      // join each point to its nearest few
      const d = pts.map((p, j) => [p.distanceToSquared(pts[i]), j]).sort((x, y) => x[0] - y[0]);
      for (let k = 1; k <= 3; k++) lines.push(pts[i].toArray(), pts[d[k][1]].toArray());
    }
    const mat = lineMat(GOLD.clone(), 0.8);
    // (drawn over everything: it's the picture in your head)
    mat.depthTest = false;
    const l = tubes(lines, 0.07, mat);
    const pm = pointMat(GOLD.clone());
    pm.depthTest = false;
    const p = spheres(pts.map((v) => v.toArray()), 0.25, pm);
    web.add(l, p);
    parts.push({ group: web, from: SEC.theory, to: SEC.theory + 14, count: lines.length, lines: l, pts: p, mats: [mat, pm], follow: true });
  }
  for (const p of parts) { root.add(p.group); p.group.visible = false; p.group.traverse((o) => { o.frustumCulled = false; o.renderOrder = 8; }); }

  return {
    // v: the story moment; cam: the camera (the sky web is centred on you)
    frame(v, s, cam) {
      const gone = 1 - smooth(SEC.letgo, SEC.letgo + 2.5, v);      // they fade as the world rushes back
      for (const p of parts) {
        const build = clamp((v - p.from) / (p.to - p.from));
        const on = v >= p.from && gone > 0.001;
        p.group.visible = on;
        if (!on) continue;
        const shimmer = 0.85 + 0.15 * Math.sin(v * 3.1 + p.from);
        const a = smooth(0, 0.08, build) * gone * shimmer;
        p.lines.count = Math.floor(build * p.lines.userData.n);
        if (p.pts) p.pts.count = Math.floor(build * p.pts.userData.n);
        for (const m of p.mats) m.opacity = a * 0.9;
        if (p.gold !== undefined) {   // the cure turns gold when it's complete
          const g = smooth(p.gold - 0.6, p.gold + 0.6, v);
          for (const m of p.mats) m.color.copy(CYAN).lerp(GOLD, g);
        }
        if (p.plasma) {
          const ig = smooth(p.ignite, p.ignite + 1.5, v);
          p.plasma.material.opacity = ig * (0.55 + 0.25 * Math.sin(v * 6)) * gone;
          p.group.rotation.z = v * 0.05;
        }
        if (p.mars) p.mars.material.opacity = smooth(p.to - 2, p.to, v) * 0.5 * gone;
        if (p.follow) p.group.position.copy(cam.position);
      }
    },
  };
}
