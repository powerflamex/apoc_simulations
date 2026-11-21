// The mountain across the harbor: 1.6 km high on an egg-shaped base ~8 x 4.5 km, its peak set toward the harbor so the
// face above you is steep. It is one piece with its root (the rock under it, down to 60 m below the ground), so it can
// be lifted and thrown. Its volume is worked out once below (logged): ~17 km^3 of rock (2,700 kg/m^3) = ~50 billion tons.
import * as THREE from 'three';
import { hazed } from './world.js';
import { MTN } from './layout.js';

const ROOT = 60;                         // the root's depth (m)
export const ZP = 900;                   // the peak sits this far from the base's middle toward the harbor (local +z)
// height of the mountain at local (x, z) (0 outside the base): a main peak toward the harbor, two lower summits on its
// shoulders, gullies running down from the ridges
const cone = (x, z, cx, cz, rx, rzN, rzF, h, p = 1.2) => {
  const dx = (x - cx) / rx, dz = z > cz ? (z - cz) / rzN : (z - cz) / rzF;
  const q = Math.hypot(dx, dz);
  return q >= 1 ? 0 : h * Math.pow(1 - q, p);
};
export function mtnHeight(x, z) {
  const { rx, rz, h } = MTN;
  // the base outline (an egg: q = 1 is the foot)
  const dx = x / rx, dz = z > ZP ? (z - ZP) / (rz - ZP) : (z - ZP) / (rz + ZP);
  const q = Math.hypot(dx, dz);
  if (q >= 1) return 0;
  const main = cone(x, z, 0, ZP, rx * 0.62, rz - ZP, rz + ZP, h, 1.25);
  const west = cone(x, z, -1700, ZP - 350, 1500, 1500, 2200, h * 0.66, 1.3);
  const east = cone(x, z, 1500, ZP - 700, 1700, 1700, 2300, h * 0.55, 1.3);
  const base = h * 0.22 * Math.pow(1 - q, 0.9);
  let H = Math.max(main, west, east, base);
  // gullies: grooves running down the slopes, deeper toward the middle of the face
  const a = Math.atan2(dz, dx);
  const g = Math.pow(Math.abs(Math.sin(a * 7.0 + q * 2.5)), 6) * 0.16 + Math.pow(Math.abs(Math.sin(a * 13.0 - q * 4.0 + 1.3)), 8) * 0.08;
  H *= 1 - g * Math.min(1, 3 * (1 - q)) * Math.min(1, q * 3);
  return H * (1 - Math.pow(q, 10));
}

export function makeMountain(scene) {
  const { rx, rz, h } = MTN;
  const NA = 320, NQ = 120;
  const pos = [], idx = [], qa = [];
  // rings from the peak (q = 0) to the foot (q = 1), denser near the foot; then the root's side down to -ROOT and the bottom
  const qs = [];
  for (let j = 0; j <= NQ; j++) { const t = j / NQ; qs.push(1 - Math.pow(1 - t, 1.6)); }
  const ring = (q, yOff) => {
    const out = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      const dx = q * Math.cos(a), dz = q * Math.sin(a);
      const x = dx * rx, z = ZP + (dz > 0 ? dz * (rz - ZP) : dz * (rz + ZP));
      out.push([x, z]);
    }
    return out;
  };
  for (let j = 0; j <= NQ; j++) {
    for (const [x, z] of ring(qs[j])) { pos.push(x, mtnHeight(x, z), z); qa.push(qs[j], 0); }
  }
  const sideTop = (NQ) * NA;
  // the root: the outline again, 60 m down, and the bottom's middle
  for (const [x, z] of ring(1)) { pos.push(x, -ROOT, z); qa.push(1, 1); }
  pos.push(0, -ROOT, ZP); qa.push(0, 1);
  const V = (j, i) => j * NA + (i % NA);
  for (let j = 0; j < NQ; j++) for (let i = 0; i < NA; i++) idx.push(V(j, i), V(j + 1, i + 1), V(j + 1, i), V(j, i), V(j, i + 1), V(j + 1, i + 1));
  const S0 = (NQ + 1) * NA;
  for (let i = 0; i < NA; i++) { const a = sideTop + i, b = sideTop + ((i + 1) % NA), c = S0 + ((i + 1) % NA), d = S0 + i; idx.push(a, c, b, a, d, c); }
  const BC = S0 + NA;
  for (let i = 0; i < NA; i++) idx.push(BC, S0 + i, S0 + ((i + 1) % NA));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aQ', new THREE.Float32BufferAttribute(qa, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // the volume above the ground (logged once; see timeline.js)
  {
    let vol = 0;
    const st = 25;
    for (let x = -rx; x <= rx; x += st) for (let z = -rz; z <= rz; z += st) vol += mtnHeight(x, z) * st * st;
    console.log(`mountain: ${(vol / 1e9).toFixed(1)} km^3 above ground = ${(vol * 2700 / 907.185 / 1e9).toFixed(1)} billion tons`);
  }

  const MU = { uCrack: { value: 0 }, uLift: { value: 0 }, uTime: { value: 0 }, uDust: { value: 0 } };
  const mat = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }));
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, MU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aQ; varying vec2 vQ; varying vec3 vMP; varying vec3 vMN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvQ = aQ; vMP = position; vMN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uCrack; uniform float uLift; uniform float uTime; uniform float uDust;
      varying vec2 vQ; varying vec3 vMP; varying vec3 vMN;
      float mh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float mn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }
      float mf(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * mn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 5.3; a *= 0.5; } return s; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 P = vMP; vec3 N = normalize(vMN);
        float slope = 1.0 - clamp(N.y, 0.0, 1.0);
        vec2 sp = P.xz * 0.004 + P.y * 0.002;
        float n = mf(sp), n2 = mf(P.xz * 0.03 + P.y * 0.03);
        vec3 forest = mix(vec3(0.09, 0.17, 0.07), vec3(0.16, 0.24, 0.1), n2);
        vec3 rock = mix(vec3(0.3, 0.29, 0.27), vec3(0.45, 0.43, 0.4), n2) * (0.8 + 0.3 * n);
        float rk = smoothstep(0.5, 0.72, slope + (n - 0.5) * 0.55 + P.y / 1600.0 * 0.3);
        vec3 c = mix(forest, rock, rk);
        c *= 0.85 + 0.25 * mn(P.xz * 0.012 + P.y * 0.01);
        // tree crowns and rock outcrops: fine dark/light dapples that read at a few hundred metres
        float tr = mn(P.xz * 0.11 + P.y * 0.05) * 0.6 + mn(P.xz * 0.37 + P.y * 0.2) * 0.4;
        c *= mix(0.62 + 0.6 * tr, 0.8 + 0.35 * tr, rk);
        // pale scree and bare patches in the gullies
        c = mix(c, vec3(0.5, 0.47, 0.42), smoothstep(0.72, 0.9, mf(P.xz * 0.0025 + 9.0)) * (1.0 - rk) * 0.5);
        // the root (the torn rock under the ground): dark, broken
        if (vQ.y > 0.5 || P.y < -0.5) c = vec3(0.13, 0.1, 0.08) * (0.5 + 0.5 * mn(P.xz * 0.02 + P.y * 0.05) + 0.4 * mn(P.xz * 0.2 + P.y * 0.3));
        // cracks opening up the face as you lift it: long jagged lines running up from the foot
        if (uCrack > 0.0) {
          float a = atan(P.z - ${ZP.toFixed(1)}, P.x);
          float lines = 0.0;
          for (int k = 0; k < 3; k++) {
            float fk = float(k);
            float f = fract(a * (7.0 + 5.0 * fk) / 6.2832 + mf(P.xz * (0.002 + 0.001 * fk) + fk * 3.0) * 0.9);
            float w = 0.012 * uCrack * (1.0 - vQ.x * 0.3);
            lines = max(lines, (1.0 - smoothstep(w * 0.4, w, abs(f - 0.5))) * step(1.0 - uCrack * (0.55 + 0.15 * fk), vQ.x));
          }
          c = mix(c, vec3(0.04, 0.035, 0.03), lines * 0.95);
        }
        c = mix(c, vec3(0.62, 0.57, 0.5), uDust * smoothstep(0.6, 1.0, vQ.x) * 0.6);
        diffuseColor.rgb = c;
      }`);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + '-mtn';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  // a pivot group so it can be turned about any point: the group sits at the mountain's base middle
  const g = new THREE.Group();
  g.add(mesh);
  // a forest on the lower face round where you'll land (it rides with the mountain): cone crowns on short trunks
  {
    const R = (() => { let a = 77; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const N = 4200;
    const crown = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1, 5).translate(0, 0.5, 0);
    const cm = new THREE.InstancedMesh(crown, hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })), N);
    const tm = new THREE.InstancedMesh(trunk, hazed(new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 })), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    let n = 0;
    for (let k = 0; k < N * 3 && n < N; k++) {
      // denser near your spot (local x = 20), thinning out to 700 m either side and 900 m up the face
      const x = 20 + (R() - 0.5) * 2 * 700 * Math.pow(R(), 0.6);
      const z = rz - 6 - 1000 * Math.pow(R(), 1.4);
      const y = mtnHeight(x, z);
      if (y < 0.5 || y > 750) continue;
      const sl = Math.hypot(mtnHeight(x + 4, z) - mtnHeight(x - 4, z), mtnHeight(x, z + 4) - mtnHeight(x, z - 4)) / 8;
      if (sl > 1.1 + 0.4 * R()) continue;
      if (Math.abs(x - 20) < 14 && z > rz - 30) continue;          // a clearing where you stand
      const h = 7 + 9 * R(), w = h * (0.28 + 0.1 * R());
      cm.setMatrixAt(n, m4.compose(new THREE.Vector3(x, y + h * 0.3, z), q, new THREE.Vector3(w, h * 0.75, w)));
      tm.setMatrixAt(n, m4.compose(new THREE.Vector3(x, y - 0.5, z), q, new THREE.Vector3(1, h * 0.35 + 0.5, 1)));
      cm.setColorAt(n, c.setRGB(0.07 + 0.06 * R(), 0.16 + 0.1 * R(), 0.06 + 0.04 * R()));
      n++;
    }
    cm.count = n; tm.count = n;
    for (const m of [cm, tm]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; g.add(m); }
  }
  g.position.set(MTN.x, 0, MTN.z);
  scene.add(g);
  return { g, mesh, MU, ROOT };
}
