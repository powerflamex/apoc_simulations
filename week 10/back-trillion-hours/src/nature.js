// Plants and stones for the wild stops (instanced, one group per stop, shown only at its stop):
//   2 forest (white pines, hemlocks, maples, birches down to a lake), 3 ice age (scattered spruce, boulders),
//   4 grassland (tall golden grass, a few oaks), 5 dusk scrub (rocks, low bushes, dry grass), 6 shore (boulders, weed),
//   7 Early Cretaceous (ferns everywhere, cycads, tall conifers like monkey-puzzles).
// Nothing grows on you, in the camera's corridor or in the lanes the animals use (clearOf in layout.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, LAKE_Y } from './ground.js';
import { rng } from './util.js';
import { clearOf } from './layout.js';

export const NU = { uTime: { value: 0 }, uWind: { value: 0.5 } };

// paint a geometry's vertices one colour (sRGB hex), with a little noise and darker toward the bottom
function paint(g, hex, { jit = 0.12, dark = 0, seed = 1 } = {}) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3), R = rng(seed);
  const p = g.attributes.position;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (R() - 0.5) * 2 * jit;
    for (let j = 0; j < 3; j++) {
      const y = (p.getY(i + j) - y0) / Math.max(y1 - y0, 1e-3);
      const d = k * (1 - dark * (1 - y));
      col.set([c.r * d, c.g * d, c.b * d], (i + j) * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
function lumpy(g, amt, seed) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, R = rng(seed), map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, 1 + (R() - 0.5) * 2 * amt);
    const k = map.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * (1 + (k - 1) * 0.6), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
const trunk = (h, r0, r1, hex) => paint(new THREE.CylinderGeometry(r1, r0, h, 7).translate(0, h / 2, 0), hex, { jit: 0.05 });

// ---- the plant shapes (1 unit = 1 m, base at y 0) ----
function pine(seed) {           // a white pine / hemlock: dark, layered
  const R = rng(seed), parts = [trunk(16, 0.35, 0.12, 0x4a3628)];
  for (let i = 0; i < 6; i++) {
    const y = 4 + i * 2.2, r = 3.4 - i * 0.45;
    parts.push(paint(lumpy(new THREE.ConeGeometry(r, 3.4, 9, 1).translate((R() - 0.5) * 0.4, y + 1.7, (R() - 0.5) * 0.4), 0.12, seed + i), 0x24402a, { jit: 0.2, dark: 0.35, seed: seed + i }));
  }
  return mergeGeometries(parts);
}
function maple(seed, hex = 0x3f6a2a) {   // a broadleaf: trunk and a lumpy crown
  const R = rng(seed), parts = [trunk(7, 0.3, 0.18, 0x55463a)];
  for (let i = 0; i < 6; i++) {
    const r = 2.2 + R() * 1.4;
    parts.push(paint(lumpy(new THREE.IcosahedronGeometry(r, 1).translate((R() - 0.5) * 4, 7 + R() * 4, (R() - 0.5) * 4), 0.18, seed + i), hex, { jit: 0.22, dark: 0.4, seed: seed + i * 3 }));
  }
  return mergeGeometries(parts);
}
function birch(seed) {
  const R = rng(seed), parts = [trunk(11, 0.16, 0.08, 0xd8d4c8)];
  for (let i = 0; i < 4; i++) parts.push(paint(lumpy(new THREE.IcosahedronGeometry(1.5 + R(), 1).translate((R() - 0.5) * 2.5, 8 + R() * 4, (R() - 0.5) * 2.5), 0.2, seed + i), 0x6c8a34, { jit: 0.25, dark: 0.3, seed: seed + i }));
  return mergeGeometries(parts);
}
function spruce(seed) {          // the ice age: thin, dark, ragged
  const R = rng(seed), parts = [trunk(9, 0.15, 0.05, 0x3a2e24)];
  for (let i = 0; i < 5; i++) parts.push(paint(lumpy(new THREE.ConeGeometry(1.3 - i * 0.2, 2.4, 7, 1).translate((R() - 0.5) * 0.3, 1.6 + i * 1.6, (R() - 0.5) * 0.3), 0.2, seed + i), 0x1f3324, { jit: 0.2, dark: 0.3, seed: seed + i }));
  return mergeGeometries(parts);
}
function oak(seed) {             // a wide oak on the grassland
  const R = rng(seed), parts = [trunk(5, 0.55, 0.35, 0x4a3a2c)];
  for (let i = 0; i < 8; i++) parts.push(paint(lumpy(new THREE.IcosahedronGeometry(2.4 + R() * 1.5, 1).scale(1, 0.7, 1).translate((R() - 0.5) * 9, 6 + R() * 2.5, (R() - 0.5) * 9), 0.2, seed + i), 0x4d5a26, { jit: 0.2, dark: 0.45, seed: seed + i }));
  return mergeGeometries(parts);
}
function bush(seed, hex) {
  const R = rng(seed), parts = [];
  for (let i = 0; i < 4; i++) parts.push(paint(lumpy(new THREE.IcosahedronGeometry(0.5 + R() * 0.4, 1).translate((R() - 0.5) * 1.2, 0.4 + R() * 0.3, (R() - 0.5) * 1.2), 0.25, seed + i), hex, { jit: 0.25, dark: 0.4, seed }));
  return mergeGeometries(parts);
}
function rock(seed, hex) {
  return paint(lumpy(new THREE.IcosahedronGeometry(1, 1).scale(1, 0.6, 0.85).translate(0, 0.25, 0), 0.25, seed), hex, { jit: 0.18, dark: 0.35, seed });
}
// a fern: fronds round a centre, each a curved tapering strip with leaflets (its colour paler at the tips)
function fern(seed, n = 9, L = 1.4, hex = 0x3f7a26) {
  const R = rng(seed), parts = [];
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + R() * 0.4, rise = 0.6 + R() * 0.5, len = L * (0.7 + 0.5 * R());
    const pos = [];
    const S = 8;
    for (let i = 0; i < S; i++) {
      const u0 = i / S, u1 = (i + 1) / S;
      const pt = (u) => [Math.cos(a) * u * len, Math.sin(u * Math.PI * 0.75) * rise * len * 0.6 - u * u * 0.25 * len, Math.sin(a) * u * len];
      const w = (u) => 0.22 * len * Math.sin(Math.PI * Math.min(u * 1.15, 1));
      const A = pt(u0), B = pt(u1), wa = w(u0), wb = w(u1), sx = -Math.sin(a), sz = Math.cos(a);
      pos.push(A[0] - sx * wa, A[1], A[2] - sz * wa, A[0] + sx * wa, A[1], A[2] + sz * wa, B[0] + sx * wb, B[1], B[2] + sz * wb);
      pos.push(A[0] - sx * wa, A[1], A[2] - sz * wa, B[0] + sx * wb, B[1], B[2] + sz * wb, B[0] - sx * wb, B[1], B[2] - sz * wb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(paint(g, hex, { jit: 0.2, dark: -0.3, seed: seed + f }));
  }
  return mergeGeometries(parts);
}
function cycad(seed) {
  const R = rng(seed), h = 1.0 + R() * 1.2;
  return mergeGeometries([paint(lumpy(new THREE.CylinderGeometry(0.32, 0.42, h, 8).translate(0, h / 2, 0), 0.08, seed), 0x5a4a30, { jit: 0.15 }), fern(seed + 5, 12, 1.8, 0x4f7a22).translate(0, h, 0)]);
}
function araucaria(seed) {       // a tall conifer with a flat crown of branch tiers
  const R = rng(seed), h = 26 + R() * 10, parts = [trunk(h, 0.7, 0.3, 0x5a4232)];
  for (let i = 0; i < 4; i++) parts.push(paint(lumpy(new THREE.ConeGeometry(4.5 - i * 0.9, 1.6, 10, 1).translate(0, h - 3.5 + i * 1.4, 0), 0.15, seed + i), 0x2c4a22, { jit: 0.2, dark: 0.4, seed: seed + i }));
  return mergeGeometries(parts);
}
// grass: one blade (a tapering bent strip), instanced by the thousand; it sways with the wind (NU)
function blade(h = 1, w = 0.03) {
  const pos = [], S = 4;
  for (let i = 0; i < S; i++) {
    const u0 = i / S, u1 = (i + 1) / S, x = (u) => u * u * 0.25 * h, w0 = w * (1 - u0), w1 = w * (1 - u1);
    pos.push(-w0, u0 * h, x(u0), w0, u0 * h, x(u0), w1, u1 * h, x(u1), -w0, u0 * h, x(u0), w1, u1 * h, x(u1), -w1, u1 * h, x(u1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function tuft(seed, n, h, hex, w = 0.025) {
  const R = rng(seed), parts = [];
  for (let i = 0; i < n; i++) {
    const g = paint(blade(h * (0.6 + 0.6 * R()), w), hex, { jit: 0.25, dark: 0.55, seed: seed + i });
    g.rotateY(R() * Math.PI * 2).translate((R() - 0.5) * 0.25, 0, (R() - 0.5) * 0.25);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function plantMat({ sway = 0, side = THREE.FrontSide, rough = 0.9 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, side });
  if (sway > 0) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, NU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float ph = wp.x * 0.35 + wp.z * 0.21;
            float b = pow(max(position.y, 0.0), 1.6) * ${sway.toFixed(3)} * uWind;
            transformed.x += b * (sin(uTime * 1.7 + ph) * 0.7 + sin(uTime * 3.1 + ph * 1.7) * 0.3);
            transformed.z += b * 0.5 * sin(uTime * 1.3 + ph * 0.8); }`);
    };
    m.customProgramCacheKey = () => 'plant-sway-' + sway + side;
  }
  return m;
}

// scatter instances of a geometry over a stop: n tries in an annulus/box, kept off the clear zones
function scatter(group, k, geo, mat, { n, rMin = 0, rMax = 200, x0, x1, z0, z1, s = [1, 1], seed = 1, test, sink = 0, cast = true, keep = 0 }) {
  const R = rng(seed), list = [];
  for (let t = 0; t < n * 8 && list.length < n; t++) {
    let x, z;
    if (x0 !== undefined) { x = x0 + (x1 - x0) * R(); z = z0 + (z1 - z0) * R(); }
    else { const a = R() * Math.PI * 2, r = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * R()); x = Math.cos(a) * r; z = Math.sin(a) * r; }
    if (!clearOf(k, x, z, keep)) continue;
    if (test && !test(x, z)) continue;
    list.push([x, z, s[0] + (s[1] - s[0]) * R(), R() * Math.PI * 2, 0.85 + 0.3 * R()]);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  list.forEach(([x, z, sz, rot, sy], i) => {
    q.setFromEuler(e.set(0, rot, 0));
    m4.compose(v.set(x, heightAt(k, x, z) - sink * sz, z), q, sc.set(sz, sz * sy, sz));
    mesh.setMatrixAt(i, m4);
  });
  mesh.castShadow = cast; mesh.receiveShadow = true; mesh.frustumCulled = false;
  group.add(mesh);
  return list;
}

export function makeNature(scene) {
  const groups = [];
  for (let k = 0; k < 8; k++) { const g = new THREE.Group(); g.visible = false; scene.add(g); groups.push(g); }
  const solid = plantMat(), leafy = plantMat({ sway: 0.012 }), grassM = plantMat({ sway: 0.09, side: THREE.DoubleSide }), fernM = plantMat({ sway: 0.05, side: THREE.DoubleSide });

  // ---- 2: the forest down to the lake (the lake on your left, beyond x -25) ----
  {
    const G = groups[2], dry = (x, z) => heightAt(2, x, z) > LAKE_Y + 0.4;
    for (let i = 0; i < 3; i++) scatter(G, 2, pine(100 + i), solid, { n: 110, rMin: 9, rMax: 260, s: [0.8, 1.4], seed: 10 + i, test: dry, keep: 1 });
    for (let i = 0; i < 2; i++) scatter(G, 2, maple(200 + i, i ? 0x4a7a2e : 0x3a6228), leafy, { n: 70, rMin: 7, rMax: 200, s: [0.8, 1.3], seed: 20 + i, test: dry, keep: 1 });
    scatter(G, 2, birch(300), leafy, { n: 50, rMin: 6, rMax: 120, s: [0.8, 1.2], seed: 30, test: dry, keep: 1 });
    scatter(G, 2, bush(310, 0x35542a), leafy, { n: 260, rMin: 3, rMax: 90, s: [0.7, 1.6], seed: 31, test: dry, keep: 0.6 });
    scatter(G, 2, fern(320, 9, 1.0, 0x4a7a2a), fernM, { n: 500, rMin: 1.5, rMax: 45, s: [0.6, 1.2], seed: 32, test: dry, keep: 0.3, cast: false });
    scatter(G, 2, rock(330, 0x77746c), solid, { n: 40, rMin: 4, rMax: 80, s: [0.3, 1.0], seed: 33, keep: 0.4 });
    // the far shore across the lake: a dark wall of forest
    scatter(G, 2, pine(140), solid, { n: 260, x0: -900, x1: -160, z0: -700, z1: 300, s: [1.0, 1.6], seed: 34 });
  }
  // ---- 3: the ice age: open, a few spruce, boulders left by the ice, tussock grass ----
  {
    const G = groups[3];
    scatter(G, 3, spruce(400), solid, { n: 70, rMin: 40, rMax: 600, s: [0.7, 1.4], seed: 40, keep: 1 });
    scatter(G, 3, spruce(401), solid, { n: 30, rMin: 18, rMax: 90, s: [0.6, 1.1], seed: 41, keep: 1 });
    scatter(G, 3, rock(410, 0x6e6a64), solid, { n: 50, rMin: 6, rMax: 200, s: [0.6, 2.6], seed: 42, keep: 1, sink: 0.2 });
    scatter(G, 3, tuft(420, 14, 0.4, 0x8a7a50, 0.02), grassM, { n: 1600, rMin: 1.2, rMax: 70, s: [0.7, 1.3], seed: 43, cast: false });
  }
  // ---- 4: tall golden grass to the horizon, a few oaks ----
  {
    const G = groups[4];
    scatter(G, 4, oak(500), leafy, { n: 14, rMin: 45, rMax: 500, s: [0.8, 1.3], seed: 50, keep: 1 });
    scatter(G, 4, oak(501), leafy, { n: 6, rMin: 22, rMax: 60, s: [0.9, 1.2], seed: 51, keep: 1 });
    scatter(G, 4, tuft(510, 22, 1.15, 0xe0b864, 0.024), grassM, { n: 6500, rMin: 1.0, rMax: 60, s: [0.7, 1.3], seed: 52, cast: false });
    scatter(G, 4, tuft(511, 22, 1.0, 0xc8a050, 0.026), grassM, { n: 4000, rMin: 1.0, rMax: 30, s: [0.8, 1.2], seed: 53, cast: false });
    scatter(G, 4, rock(520, 0x8a8074), solid, { n: 14, rMin: 8, rMax: 90, s: [0.4, 1.2], seed: 54, keep: 1, sink: 0.25 });
  }
  // ---- 5: dusk, stony scrub with low bushes and dry grass ----
  {
    const G = groups[5];
    scatter(G, 5, rock(600, 0x6a6660), solid, { n: 70, rMin: 4, rMax: 160, s: [0.5, 2.4], seed: 60, keep: 0.8, sink: 0.2 });
    scatter(G, 5, bush(610, 0x4a5a36), leafy, { n: 160, rMin: 3, rMax: 120, s: [0.6, 1.6], seed: 61, keep: 0.8 });
    scatter(G, 5, tuft(620, 12, 0.55, 0xa89a6a, 0.02), grassM, { n: 1800, rMin: 1.0, rMax: 55, s: [0.7, 1.3], seed: 62, cast: false });
    scatter(G, 5, maple(630, 0x3a4a2a), leafy, { n: 14, rMin: 30, rMax: 260, s: [0.6, 1.0], seed: 63, keep: 1 });
  }
  // ---- 6: the shore: boulders round you, weed at the waterline ----
  {
    const G = groups[6];
    scatter(G, 6, rock(700, 0x3a3634), solid, { n: 26, rMin: 3, rMax: 30, s: [0.6, 1.8], seed: 70, keep: 1, sink: 0.25, test: (x, z) => z > -9 });
    scatter(G, 6, rock(701, 0x2e2c2a), solid, { n: 40, x0: -120, x1: 120, z0: -2, z1: 60, s: [1.0, 3.5], seed: 71, keep: 1, sink: 0.3 });
    scatter(G, 6, tuft(710, 10, 0.35, 0x6a7a3a, 0.02), grassM, { n: 300, rMin: 2, rMax: 25, s: [0.7, 1.2], seed: 72, cast: false, test: (x, z) => z > -4 });
  }
  // ---- 7: the Early Cretaceous: ferns, cycads, tall conifers ----
  {
    const G = groups[7];
    scatter(G, 7, araucaria(800), solid, { n: 40, rMin: 35, rMax: 420, s: [0.8, 1.3], seed: 80, keep: 1 });
    scatter(G, 7, araucaria(801), solid, { n: 14, rMin: 20, rMax: 80, s: [0.7, 1.1], seed: 81, keep: 1 });
    scatter(G, 7, cycad(810), fernM, { n: 120, rMin: 3, rMax: 70, s: [0.7, 1.3], seed: 82, keep: 0.8 });
    scatter(G, 7, fern(820, 10, 1.3, 0x4f8a2a), fernM, { n: 1400, rMin: 1.2, rMax: 60, s: [0.6, 1.4], seed: 83, keep: 0.3, cast: false });
    scatter(G, 7, fern(821, 8, 1.0, 0x6a9a30), fernM, { n: 700, rMin: 1.2, rMax: 35, s: [0.6, 1.2], seed: 84, keep: 0.3, cast: false });
  }
  return {
    groups,
    frame(k, v) { groups.forEach((g, i) => { g.visible = i === k; }); NU.uTime.value = v; },
  };
}
