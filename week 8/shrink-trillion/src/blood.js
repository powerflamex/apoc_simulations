// Inside a blood vessel (built in micrometres; you stand on its wall at the origin). The wall is a pavement of long
// pink cells with bulging nuclei; the plasma is a warm golden haze; red blood cells (discs 7.8 µm across, 2 µm
// thick, dimpled on both faces) drift past and tumble; one rests on its rim beside you like a tyre; a white blood
// cell rolls along the wall further off; small pale platelets drift by.
import * as THREE from 'three';
import { procMat, ellipsoid } from './mats.js';
import { rng, smooth, lerp } from './util.js';

export const RBC_R = 3.9;
// the red cell's shape (Evans & Fung): half-thickness at radius r
const halfT = (r) => { const x = Math.min(1, r / RBC_R); return (RBC_R / 2) * Math.sqrt(Math.max(0, 1 - x * x)) * (0.207 + 2.003 * x * x - 1.123 * x * x * x * x); };
function rbcGeometry() {
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) { const r = RBC_R * Math.sin((i / N) * Math.PI / 2); pts.push(new THREE.Vector2(r, halfT(r) + 0.02)); }
  for (let i = N; i >= 0; i--) { const r = RBC_R * Math.sin((i / N) * Math.PI / 2); pts.push(new THREE.Vector2(r, -halfT(r) - 0.02)); }
  // the lathe needs the profile from the axis outward and back: top face from the centre out, then the bottom back in
  const prof = pts.map((p) => new THREE.Vector2(p.x, p.y));
  const g = new THREE.LatheGeometry(prof.reverse(), 48);
  g.computeVertexNormals();
  return g;
}

export function makeBlood(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(21);
  // the vessel wall
  const wallM = procMat({ color: 0xe9a39a, rough: 0.6, physical: { sheen: 0.6, sheenColor: new THREE.Color(1, 0.8, 0.75) },
    col: `vec3 q = vOP * vec3(1.0 / 26.0, 1.0, 1.0 / 9.0);
          vec2 v = vor3(vec3(q.x, 0.0, q.z) * 1.0);
          float edge = smoothstep(0.0, 0.08, v.y - v.x);
          vec2 vn = vor3(vec3(q.x, 0.0, q.z));
          float nuc = 1.0 - smoothstep(0.12, 0.2, vn.x);
          c *= 0.75 + 0.3 * edge;
          c = mix(c, vec3(0.78, 0.45, 0.6), nuc * 0.7);
          c *= 0.9 + 0.15 * n3(vOP * 0.4);`,
    height: '0.5 * smoothstep(0.0, 0.1, vor3(vec3(vOP.x / 26.0, 0.0, vOP.z / 9.0)).y - vor3(vec3(vOP.x / 26.0, 0.0, vOP.z / 9.0)).x) + 0.8 * (1.0 - smoothstep(0.1, 0.25, vor3(vec3(vOP.x / 26.0, 0.0, vOP.z / 9.0)).x))', bump: 0.7,
    emis: `e += diffuseColor.rgb * 0.12;` });
  {
    const g = new THREE.PlaneGeometry(1600, 1600, 160, 160).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const d = Math.hypot(x, z); p.setY(i, 0.6 * Math.sin(x * 0.11) * Math.sin(z * 0.27) * smooth(6, 20, d) + Math.pow(Math.max(0, d - 120) / 220, 2) * 40); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, wallM);
    m.receiveShadow = true;
    G.add(m);
  }
  // red cells
  const rbcM = procMat({ color: 0xc8141c, rough: 0.35, physical: { clearcoat: 0.4, clearcoatRoughness: 0.35, sheen: 0.7, sheenColor: new THREE.Color(1, 0.35, 0.3) },
    col: `c *= 0.82 + 0.25 * n3(vOP * 1.2 + vIP * 0.05);`, emis: `e += vec3(0.32, 0.02, 0.02) * 0.6;` });
  const geo = rbcGeometry();
  const n = 260;
  const cells = new THREE.InstancedMesh(geo, rbcM, n);
  cells.castShadow = true; cells.receiveShadow = true;
  G.add(cells);
  const C = [];
  for (let i = 0; i < n; i++) {
    let x, y, z;
    do { x = (R() - 0.5) * 360; z = -40 + R() * 360; y = 4 + Math.pow(R(), 1.5) * 90; } while (Math.hypot(x, z) < 14 || (z < 6 && Math.abs(x) < 26 && y < 30));
    C.push({ x, y, z, ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), w: (R() - 0.5) * 0.8, a0: R() * 6, sp: 2 + R() * 4 });
  }
  // the one beside you, standing on its rim
  const hero = new THREE.Mesh(geo, rbcM);
  hero.castShadow = true; hero.receiveShadow = true;
  G.add(hero);
  // a white blood cell rolling along the wall, and platelets
  const wbcM = procMat({ color: 0xf1ece6, rough: 0.55, col: `c *= 0.8 + 0.25 * n3(vOP * 0.5);`, height: 'fbm3(vOP * 0.45)', bump: 1.2, emis: `e += diffuseColor.rgb * 0.08;` });
  const wbcG = new THREE.IcosahedronGeometry(6.5, 5);
  { const p = wbcG.attributes.position, vv = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { vv.fromBufferAttribute(p, i); const k = 1 + 0.08 * Math.sin(vv.x * 1.3) * Math.sin(vv.y * 1.1 + 1) * Math.sin(vv.z * 1.7); vv.multiplyScalar(k); p.setXYZ(i, vv.x, vv.y, vv.z); } wbcG.computeVertexNormals(); }
  const wbc = new THREE.Mesh(wbcG, wbcM);
  wbc.castShadow = true;
  G.add(wbc);
  const platM = procMat({ color: 0xe8d6a0, rough: 0.5, emis: `e += diffuseColor.rgb * 0.15;` });
  const plat = new THREE.InstancedMesh(ellipsoid(1.4, 0.45, 1.1, 14), platM, 40);
  const PL = [];
  for (let i = 0; i < 40; i++) PL.push({ x: (R() - 0.5) * 200, y: 3 + R() * 60, z: R() * 220, a: R() * 6 });
  G.add(plat);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  return {
    group: G,
    hero,
    frame(v) {
      const t = v - 19.3;
      C.forEach((c, i) => {
        q.setFromAxisAngle(c.ax, c.a0 + c.w * t);
        p.set(c.x + c.sp * t, c.y + 0.5 * Math.sin(t * 0.7 + i), c.z);
        m4.compose(p, q, one);
        cells.setMatrixAt(i, m4);
      });
      cells.instanceMatrix.needsUpdate = true;
      // the tyre: upright, its axis across the view, rolling very slowly
      hero.position.set(-8.5 + 0.6 * t, RBC_R + 0.05, 9.5);
      hero.rotation.set(0, 0.5, Math.PI / 2, 'YXZ');
      hero.rotateY(-0.15 * t);
      wbc.position.set(-60 + 3 * t, 6.2, 70);
      wbc.rotation.set(0, 0, -0.45 * t);
      PL.forEach((pp, i) => { e.set(pp.a + t * 0.3, pp.a * 2, 0); q.setFromEuler(e); m4.compose(p.set(pp.x + 3 * t, pp.y, pp.z), q, one); plat.setMatrixAt(i, m4); });
      plat.instanceMatrix.needsUpdate = true;
    },
  };
}
