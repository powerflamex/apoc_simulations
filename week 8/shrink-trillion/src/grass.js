// The lawn at ant size (built in millimetres; you stand on the soil at the origin facing +z). Blades of grass
// 3-5 mm wide and 60-120 mm tall (100 m skyscrapers at 1,000x), sand grains and crumbs of soil, a few dead bits of
// leaf, a ladybug, and an ant trail in front of you: a red wood ant (12 mm, a bus at 1,000x) comes down the trail
// toward you, stops with its antennae reaching for you, turns and walks off.
import * as THREE from 'three';
import { procMat, ellipsoid } from './mats.js';
import { makeAnt } from './ant.js';
import { rng, smooth, lerp, clamp, keys } from './util.js';

// the ant's trail (mm) and how far along it the ant is (video s)
const TRAIL = new THREE.CatmullRomCurve3([-50, -38, -26, -16, -8, -2, 4, 12, 22, 34, 48].map((x) => new THREE.Vector3(x, 0, 13.5 - 4.5 * Math.exp(-Math.pow((x + 1) / 9, 2)) + 0.04 * x)));
const TLEN = TRAIL.getLength();
export const ANT_D = [[4.5, 6], [7.0, 26], [8.9, 44], [9.6, 46.0], [10.3, 47.5], [12.6, 64], [14, 74]];
export const antDist = (v) => keys(ANT_D, v);
function frameAt(d) {
  const u = clamp(d / TLEN, 0, 1);
  const p = TRAIL.getPointAt(u);
  const t = TRAIL.getTangentAt(Math.min(u, 0.999));
  return { p, yaw: Math.atan2(t.x, t.z) };
}
const TP = Array.from({ length: 81 }, (_, i) => TRAIL.getPointAt(i / 80));
const segDist = (x, z) => {   // distance (mm) from the trail
  let best = 1e9;
  for (const p of TP) best = Math.min(best, (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z));
  return Math.sqrt(best);
};

export function makeGrass(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(5);

  // ---------- the soil ----------
  const soilM = procMat({ color: 0xa47a4c, rough: 0.97,
    col: `float f = fbm3(vOP * 0.35); c *= 0.62 + 0.6 * f; c = mix(c, vec3(0.42, 0.3, 0.2), smoothstep(0.55, 0.8, fbm3(vOP * 0.12 + 3.0)) * 0.5);
          c *= 0.85 + 0.3 * n3(vOP * 3.0);`,
    height: 'fbm3(vOP * 1.4) + 0.4 * n3(vOP * 6.0)', bump: 0.35 });
  {
    const g = new THREE.PlaneGeometry(320, 320, 240, 240).rotateX(-Math.PI / 2).translate(0, 0, 40);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const flat = smooth(1.5, 7, Math.min(segDist(x, z) * 0.6 + 2, Math.hypot(x, z)));
      const hgt = (Math.sin(x * 0.21 + 1) * Math.sin(z * 0.17) * 0.5 + Math.sin(x * 0.53 + z * 0.41) * 0.3 + Math.sin(x * 1.3 - z * 1.1) * 0.12) * 0.45 * flat;
      p.setY(i, hgt - 0.03);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, soilM);
    m.receiveShadow = true;
    G.add(m);
  }
  // sand grains and soil crumbs
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pp, i); const k = 0.82 + 0.3 * Math.sin(v.x * 4 + v.y * 3) * Math.cos(v.z * 5); pp.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k); }
    g.computeVertexNormals();
    const m = procMat({ color: 0xffffff, rough: 0.55, physical: { clearcoat: 0.3 },
      col: `float r = h13(floor(vIP * 13.0)); c = r < 0.35 ? vec3(0.86, 0.8, 0.68) : r < 0.55 ? vec3(0.95, 0.94, 0.9) : r < 0.75 ? vec3(0.55, 0.52, 0.5) : r < 0.88 ? vec3(0.72, 0.42, 0.25) : vec3(0.35, 0.25, 0.18);
            c *= 0.8 + 0.35 * n3(vOP * 3.0 + vIP);`,
      height: 'n3(vOP * 4.0 + vIP)', bump: 0.15 });
    const n = 2600;
    const inst = new THREE.InstancedMesh(g, m, n);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    for (let t = 0; t < 30000 && k < n; t++) {
      const r = Math.pow(R(), 1.8) * 90, a = R() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r + 20;
      if (Math.hypot(x, z) < 1.8) continue;
      if (z < 3 && x > -6 && x < 9) continue;
      const sd = segDist(x, z), dn = Math.hypot(x, z);
      const s = (0.08 + Math.pow(R(), 2.5) * (dn < 25 ? 0.3 : 1.0)) * (sd < 4 ? 0.5 : 1);
      e.set(R() * 6, R() * 6, R() * 6); q.setFromEuler(e);
      mm.compose(p.set(x, s * 0.3, z), q, sc.set(s, s, s));
      inst.setMatrixAt(k++, mm);
    }
    inst.count = k;
    inst.castShadow = true; inst.receiveShadow = true;
    G.add(inst);
  }
  // dead bits of leaf and old grass lying about
  {
    const m = procMat({ color: 0xa27a45, rough: 0.9, side: THREE.DoubleSide, col: `c *= 0.7 + 0.4 * n3(vOP * vec3(0.3, 2.0, 2.0)); c *= 0.9 + 0.1 * sin(vOP.x * 9.0);` });
    for (let i = 0; i < 50; i++) {
      const r = 6 + R() * 70, a = R() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r + 20;
      if (segDist(x, z) < 6) continue;
      const len = 6 + R() * 18, w = 1.5 + R() * 3;
      const g = new THREE.PlaneGeometry(len, w, 8, 2).rotateX(-Math.PI / 2);
      const pp = g.attributes.position;
      for (let j = 0; j < pp.count; j++) pp.setY(j, 0.15 + 0.6 * Math.abs(pp.getZ(j)) / w + 0.3 * Math.sin(pp.getX(j) * 0.5));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, 0, z); mesh.rotation.y = R() * 6.28;
      mesh.castShadow = true; mesh.receiveShadow = true;
      G.add(mesh);
    }
  }

  // ---------- the blades ----------
  {
    const N = 16, g = new THREE.BufferGeometry();
    const P = [], I = [], UV = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, w = 0.5 * (1 - Math.pow(t, 2.4)) + 0.015;
      const bend = 0.22 * t * t;
      for (const [x, z] of [[-w, 0], [0, -0.12 * w], [w, 0]]) { P.push(x, t, z + bend); UV.push(x / Math.max(w, 1e-3) * 0.5 + 0.5, t); }
    }
    for (let i = 0; i < N; i++) { const a = i * 3; I.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const m = procMat({ color: 0x4f9a2a, rough: 0.5, side: THREE.DoubleSide,
      col: `float r = h13(floor(vIP * 7.0));
            vec3 base = mix(vec3(0.24, 0.5, 0.1), vec3(0.42, 0.72, 0.2), r);
            base = mix(base, vec3(0.62, 0.74, 0.28), step(0.9, r) * 0.6);
            float acr = vOP.x / (2.0 * (0.5 * (1.0 - pow(clamp(vOP.y, 0.0, 1.0), 2.4)) + 0.015)) + 0.5;
            float veins = 0.5 + 0.5 * sin(acr * 60.0);
            float rib = exp(-pow((acr - 0.5) / 0.05, 2.0));
            c = base * (0.82 + 0.12 * veins + 0.25 * rib) * (0.75 + 0.4 * vOP.y);
            c *= 0.92 + 0.12 * n3(vec3(acr * 8.0, vOP.y * 60.0, r * 9.0));`,
      height: 'sin(vOP.x / (0.5 * (1.0 - pow(clamp(vOP.y, 0.0, 1.0), 2.4)) + 0.015) * 30.0) * 0.5', bump: 0.004,
      emis: `e += diffuseColor.rgb * 0.22;`, extra: {} });
    const n = 1500;
    const inst = new THREE.InstancedMesh(g, m, n);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    for (let t = 0; t < 60000 && k < n; t++) {
      const x = -90 + R() * 180, z = -25 + R() * 150;
      const d = Math.hypot(x, z - 15);
      if (R() > 0.25 + 0.75 * Math.exp(-d / 45)) continue;
      if (Math.hypot(x, z) < 12) continue;
      if (z < 4 && Math.hypot(x, z) < 22) continue;            // where the camera is
      const sd = segDist(x, z);
      if (sd < 7) continue;                                     // the trail
      if (z < 26 && z > 4 && Math.abs(x) < 30 && R() < 0.8) continue;    // a clearing along the trail
      const w = 3 + R() * 2.2, h = 45 + R() * 70;
      e.set((R() - 0.5) * 0.3, R() * Math.PI * 2, (R() - 0.5) * 0.3); q.setFromEuler(e);
      mm.compose(p.set(x, -0.2, z), q, sc.set(w, h, h));
      inst.setMatrixAt(k++, mm);
    }
    inst.count = k;
    inst.castShadow = true; inst.receiveShadow = true;
    G.add(inst);
    // the tall blade right beside you (the camera looks up it at the end)
    const hero = new THREE.Mesh(g, m);
    hero.position.set(3.6, -0.2, 3.4); hero.scale.set(4.6, 115, 115); hero.rotation.set(-0.06, 2.6, 0.04);
    hero.castShadow = true; hero.receiveShadow = true;
    G.add(hero);
    G.userData.hero = hero;
  }

  // ---------- a ladybug on the ground to the left, by the trail ----------
  const lady = new THREE.Group();
  {
    const shellM = procMat({ color: 0xd8180f, rough: 0.2, physical: { clearcoat: 1, clearcoatRoughness: 0.1 },
      col: `vec3 q = vOP * 0.9; vec2 v = vor3(vec3(q.x * 1.0, q.y, q.z) * 1.1 + 5.0); float spot = 1.0 - smoothstep(0.24, 0.3, v.x);
            spot *= step(0.12, abs(vOP.x)); c = mix(c, vec3(0.03), spot); c = mix(c, vec3(0.03), 1.0 - smoothstep(0.05, 0.1, abs(vOP.x)));` });
    const blk = procMat({ color: 0x111111, rough: 0.4, physical: { clearcoat: 0.6 } });
    const wht = procMat({ color: 0xf2f2ee, rough: 0.5 });
    lady.add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.8, 1.1).translate(0, 0.5, 0), shellM));
    lady.add(new THREE.Mesh(ellipsoid(1.4, 0.9, 1.0, 20).translate(0, 0.9, 3.4), blk));
    for (const sx of [-1, 1]) lady.add(new THREE.Mesh(ellipsoid(0.45, 0.35, 0.4, 10).translate(sx * 0.75, 1.25, 3.7), wht));
    for (let i = 0; i < 6; i++) { const sx = i % 2 ? 1 : -1, zz = [-1.2, 0.3, 1.6][i >> 1]; lady.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 2.2, 6).rotateZ(sx * 1.0).translate(sx * 2.8, 0.25, zz), blk)); }
    lady.position.set(16, 0, 30); lady.rotation.y = -2.2;
    lady.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.add(lady);
  }

  // ---------- the ant ----------
  const ant = makeAnt();
  G.add(ant.group);
  const youPt = new THREE.Vector3(0, 1.0, 0);

  return {
    group: G,
    antHead: new THREE.Vector3(),
    frame(v, s) {
      const d = antDist(v);
      const look = smooth(8.4, 9.2, v) * (1 - smooth(10.0, 10.8, v));
      // (you are ~1.7 mm tall at 1,000x: the ant looks at your head)
      youPt.set(0, 1.7 / s.S * 1000 * 0.9, 0);
      ant.pose(v, d, frameAt, 2.6, youPt, look);
      lady.rotation.y = -2.2 + 0.1 * Math.sin(v * 0.6);
      lady.position.x = 16 - 0.25 * v;
      // the ant's head, in mm (for the camera)
      const F = frameAt(d);
      this.antHead.set(0, 2.2, 5.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), F.yaw).add(F.p);
      this.antMid = F.p.clone().add(new THREE.Vector3(0, 2, 0));
    },
  };
}
