// Inside the picnic blanket's weave (built in micrometres; you stand on the crest of a white warp yarn at the origin,
// the yarn running away from the camera along +z). Yarns ~0.5 mm thick (5 m at 10,000x), each a twisted bundle
// of cotton fibres, white warps going over and under red wefts; loose fibres curling off them, yellow pollen grains,
// a human hair (80 µm thick: a fallen tree trunk at 10,000x) lying along the yarns to your left, and a dust mite
// (~330 µm: a rhino) crawling up to you from the right.
import * as THREE from 'three';
import { procMat } from './mats.js';
import { makeMite } from './mite.js';
import { rng, smooth, lerp, keys } from './util.js';

const P = 600, A = 150, RH = 270, RV = 150, C0 = -300;
const warpY = (k, z) => A * Math.cos(Math.PI * z / P + Math.PI * k) + C0;
const weftY = (j, x) => -A * Math.cos(Math.PI * x / P + Math.PI * j) + C0;
export const HAIR_X = 290;
export const MITE_K = [[12.0, [-1700, 1100]], [13.9, [-900, 620]], [15.6, [-380, 330]], [16.8, [-300, 300]], [20, [-280, 290]]];

// a yarn: an elliptical tube along a path given as points, with along/around coordinates in aU (u in µm along)
function yarn(points, len) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.round(len / 50), rad = 22;
  const pos = [], au = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), tng = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t);
    curve.getTangentAt(t, tng);
    side.crossVectors(tng, up).normalize();
    nrm.crossVectors(side, tng).normalize();
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(p.x + side.x * ca * RH + nrm.x * sa * RV, p.y + side.y * ca * RH + nrm.y * sa * RV, p.z + side.z * ca * RH + nrm.z * sa * RV);
      au.push(t * len, j / rad);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(au, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function makeWeave(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const R = rng(9);
  const yarnMat = (col, deep) => procMat({ color: col, rough: 0.75, useAU: true, uniforms: { uDeep: { value: new THREE.Color(...deep) } },
    col: `float tw = vU.y * 16.0 + vU.x / 420.0;
          float st = sin(tw * 6.2832);
          float fib = n3(vec3(tw * 3.0, vU.x / 60.0, 0.0));
          c *= 0.74 + 0.2 * st + 0.18 * fib;
          c = mix(c, uDeep, (1.0 - smoothstep(-0.2, 0.4, sin(vU.y * 6.2832))) * 0.35);`,
    height: 'sin((vU.y * 16.0 + vU.x / 420.0) * 6.2832) + 0.5 * n3(vec3((vU.y * 16.0 + vU.x / 420.0) * 3.0, vU.x / 60.0, 0.0))', bump: 6.0,
    emis: `e += diffuseColor.rgb * 0.06;` });
  const white = yarnMat(0xf4efe4, [0.7, 0.66, 0.6]), red = yarnMat(0xd61a24, [0.45, 0.04, 0.07]);
  const NX = 11, Z0 = -4200, Z1 = 9600, X0 = -7200, X1 = 7200;
  for (let k = -NX; k <= NX; k++) {
    const pts = [];
    for (let z = Z0; z <= Z1; z += 75) pts.push(new THREE.Vector3(k * P, warpY(k, z), z));
    const m = new THREE.Mesh(yarn(pts, Z1 - Z0), white);
    m.castShadow = true; m.receiveShadow = true;
    G.add(m);
  }
  for (let j = Math.ceil(Z0 / P); j <= Math.floor(Z1 / P); j++) {
    const pts = [];
    for (let x = X0; x <= X1; x += 75) pts.push(new THREE.Vector3(x, weftY(j, x), j * P));
    const m = new THREE.Mesh(yarn(pts, X1 - X0), red);
    m.castShadow = true; m.receiveShadow = true;
    G.add(m);
  }
  // the dark under the weave (the lawn far below, in shadow)
  const under = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2).translate(0, -900, 2000), new THREE.MeshBasicMaterial({ color: 0x1d2a12 }));
  G.add(under);

  // loose fibres curling off the yarns (cotton fibres are flat twisted ribbons, ~15 µm)
  {
    const mW = procMat({ color: 0xf6f2ea, rough: 0.6, emis: `e += diffuseColor.rgb * 0.1;` }), mR = procMat({ color: 0xe0303a, rough: 0.6 });
    for (let i = 0; i < 70; i++) {
      const warp = R() < 0.55;
      let p0;
      if (warp) { const k = Math.round((R() - 0.5) * 14), z = Z0 * 0.4 + R() * (Z1 * 0.7); p0 = new THREE.Vector3(k * P + (R() - 0.5) * 300, warpY(k, z) + RV * 0.7, z); }
      else { const j = Math.round(R() * 12 - 3), x = (R() - 0.5) * 9000; p0 = new THREE.Vector3(x, weftY(j, x) + RV * 0.7, j * P + (R() - 0.5) * 200); }
      if (Math.abs(p0.x) < 500 && p0.z > -900 && p0.z < 1500) continue;     // keep your spot and the view clear
      const pts = [p0];
      const dir = new THREE.Vector3(R() - 0.5, 0.6 + R() * 0.8, R() - 0.5).normalize();
      let p = p0.clone();
      const n = 6, step = 90 + R() * 120;
      for (let s = 0; s < n; s++) { dir.add(new THREE.Vector3((R() - 0.5) * 0.9, (R() - 0.6) * 0.5, (R() - 0.5) * 0.9)).normalize(); p = p.clone().addScaledVector(dir, step); pts.push(p); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = new THREE.TubeGeometry(curve, 40, 1, 5, false);
      // flatten into a ribbon and taper
      const pa = g.attributes.position;
      for (let q = 0; q < pa.count; q++) {
        const t = Math.floor(q / 6) / 40, c = curve.getPointAt(Math.min(t, 1));
        const dx = pa.getX(q) - c.x, dy = pa.getY(q) - c.y, dz = pa.getZ(q) - c.z;
        const r = 8 * (1 - 0.6 * t);
        pa.setXYZ(q, c.x + dx * r, c.y + dy * r * 0.45, c.z + dz * r);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, warp ? mW : mR);
      m.castShadow = true;
      G.add(m);
    }
  }
  // pollen grains: spiky yellow balls (~30 µm) caught on the yarns
  {
    const g = new THREE.IcosahedronGeometry(15, 4);
    const pa = g.attributes.position, vv = new THREE.Vector3();
    const SP = [];
    for (let i = 0; i < 42; i++) { const u = 2 * ((i + 0.5) / 42) - 1, a = i * 2.39996; SP.push(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a))); }
    for (let i = 0; i < pa.count; i++) {
      vv.fromBufferAttribute(pa, i).normalize();
      let sp = 0; for (const d of SP) sp = Math.max(sp, Math.pow(Math.max(0, vv.dot(d)), 90));
      vv.multiplyScalar(15 + 9 * sp);
      pa.setXYZ(i, vv.x, vv.y, vv.z);
    }
    g.computeVertexNormals();
    const m = procMat({ color: 0xf2b519, rough: 0.5, emis: `e += diffuseColor.rgb * 0.15;`, col: `c *= 0.85 + 0.25 * n3(vOP * 0.3);` });
    for (const [x, z] of [[-800, 300], [900, 1500], [-1300, 2100], [450, -600], [-350, 1800], [1500, 600], [-2100, 900], [2600, 2600]]) {
      const k = Math.round(x / P);
      const mm = new THREE.Mesh(g, m);
      mm.position.set(x, Math.max(warpY(k, z) - C0 + C0 + RV * 0.8, weftY(Math.round(z / P), x) + RV * 0.8) + 12, z);
      mm.castShadow = true;
      G.add(mm);
    }
  }
  // the hair: 80 µm thick, dark brown, its surface tiled with overlapping cuticle scales
  {
    const hairM = procMat({ color: 0x4a2c18, rough: 0.35, physical: { clearcoat: 0.5, clearcoatRoughness: 0.3 },
      col: `float sc = fract(vOP.y / 11.0 + 0.35 * n3(vec3(vOP.x * 0.08, vOP.z * 0.08, 0.0)));
            c *= 0.75 + 0.45 * sc; c = mix(c, vec3(0.62, 0.42, 0.25), 0.25 * n3(vOP * 0.02));`,
      height: 'fract(vOP.y / 11.0 + 0.35 * n3(vec3(vOP.x * 0.08, vOP.z * 0.08, 0.0)))', bump: 2.0 });
    const g = new THREE.CylinderGeometry(40, 40, 16000, 40, 400, false);
    const hair = new THREE.Mesh(g, hairM);
    hair.rotation.set(Math.PI / 2 - 0.004, 0.06, 0);
    hair.position.set(HAIR_X, -55, 6000);
    hair.castShadow = true; hair.receiveShadow = true;
    G.add(hair);
  }

  const mite = makeMite();
  G.add(mite.group);
  return {
    group: G, mite,
    miteAt(v, out = new THREE.Vector3()) {
      const x = keys(MITE_K.map(([t, p]) => [t, p[0]]), v), z = keys(MITE_K.map(([t, p]) => [t, p[1]]), v);
      return out.set(x, 0, z);
    },
    frame(v, s) {
      const p = this.miteAt(v), q = this.miteAt(v + 0.2);
      const yaw = Math.atan2(q.x - p.x, q.z - p.z);
      mite.group.position.set(p.x, -20, p.z);
      mite.group.rotation.y = Math.abs(q.x - p.x) + Math.abs(q.z - p.z) > 2 ? yaw : Math.atan2(-p.x, -p.z);
      // walking: the legs paddle with the distance covered (slowing to a stop)
      const walk = keys(MITE_K.map(([t], i) => [t, i]), v) * 1.4 + 0.15 * v;
      mite.pose(v, walk);
    },
  };
}
