// What the split throws up. Before it: the air starts to lift off the streets (dust rising in sheets, litter,
// leaves and paper fluttering up). Then the ground breaks: rock and rubble along every crack, the hot ones glowing,
// drifting apart with everything else (the same Hubble-like flow as the plates), and smoke and glowing dust boiling
// up out of the cracks. In the end you float among it.
import * as THREE from 'three';
import { SEEDS, CELLS, REF, spread, nearestSeed } from './split.js';
import { SEC } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

// points along the Voronoi edges near you (where the cracks are)
function crackPoints(n, R, radius) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const x = (R() - 0.5) * 2 * radius, z = 40 - R() * radius * 2.2;
    // distance to the nearest edge: the gap between the nearest two seeds
    let d1 = 1e18, d2 = 1e18, i1 = 0, i2 = 0;
    SEEDS.forEach(([sx, sz], i) => { const d = (x - sx) ** 2 + (z - sz) ** 2; if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; } });
    const a = SEEDS[i1], b = SEEDS[i2];
    const nx = b[0] - a[0], nz = b[1] - a[1], ln = Math.hypot(nx, nz);
    const ed = Math.abs(((x - (a[0] + b[0]) / 2) * nx + (z - (a[1] + b[1]) / 2) * nz) / ln);
    if (ed < 6) out.push({ x, z, a: i1, b: i2, ed });
  }
  return out;
}

export function makeDebris(scene) {
  const R = rng(4040);
  // ---- rock chunks ----
  const rocks = crackPoints(1400, R, 520).map((p) => ({
    ...p, y: -R() * 50, sz: 0.4 + Math.pow(R(), 3) * 9, seed: R(), hot: R() < 0.35, rise: 0.3 + R() * 1.4,
  }));
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const hotMat = new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 0.9, flatShading: true, emissive: 0xff5a14, emissiveIntensity: 2.2 });
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const coldM = new THREE.InstancedMesh(geo, rockMat, rocks.length), hotM = new THREE.InstancedMesh(geo, hotMat, rocks.length);
  for (const m of [coldM, hotM]) { m.frustumCulled = false; m.castShadow = false; scene.add(m); }
  const col = new THREE.Color();
  rocks.forEach((r, i) => { coldM.setColorAt(i, col.setHSL(0.07, 0.15, 0.12 + 0.12 * r.seed)); });
  // ---- litter: paper, leaves, plastic bags, lifting off the street when the air starts to go ----
  const bits = Array.from({ length: 1400 }, () => ({ x: (R() - 0.5) * 70, z: 20 - R() * 160, seed: R(), t0: SEC.split + 1 + R() * 14, sz: 0.12 + R() * 0.3 }));
  const bitM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.75), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), bits.length);
  bitM.frustumCulled = false; scene.add(bitM);
  const BITC = [0xe8e4da, 0xd8d0b8, 0x6a8a3a, 0x8a6a2a, 0xc8c8cc, 0x3a6aa0, 0xd84040];
  bits.forEach((b, i) => bitM.setColorAt(i, col.set(BITC[Math.floor(b.seed * 7)])));
  // dust and smoke puffs from the cracks
  const puffs = crackPoints(260, R, 380).map((p) => ({ ...p, seed: R(), t0: SEC.crack + R() * 20 }));

  return {
    frame(v, s, smoke, glows, cam, M) {
      // ---- rocks: they appear in the gaps once the ground splits, and drift apart with everything ----
      const ts = Math.max(0, v - SEC.splitHush);
      const a = spread(ts);
      const ref = CELLS[REF];
      rocks.forEach((r, i) => {
        if (ts <= 0) { coldM.setMatrixAt(i, HIDE); hotM.setMatrixAt(i, HIDE); return; }
        const grow = smooth(0, 2.5 + r.seed * 4, ts);
        const dx = r.x - ref.cx, dz = r.z - ref.cz;
        P.set(r.x + dx * a, r.y * (1 + 8 * a) - 6 + ts * r.rise * 0.8 * (r.sz < 3 ? 1 : 0.3), r.z + dz * a);
        // the gap opens: the rock sits between its two plates
        const pa = CELLS[r.a], pb = CELLS[r.b];
        P.x += ((pa.cx + pb.cx) / 2 - ref.cx) * 0; P.z += 0;
        e.set(ts * 0.1 * (r.seed - 0.5) + r.seed * 6, ts * 0.07 * (r.seed - 0.3) + r.seed * 3, r.seed * 9);
        q.setFromEuler(e);
        S.setScalar(r.sz * grow);
        m4.compose(P, q, S);
        (r.hot ? hotM : coldM).setMatrixAt(i, m4);
        (r.hot ? coldM : hotM).setMatrixAt(i, HIDE);
      });
      hotMat.emissiveIntensity = 1.4 * clamp(s.heat * 1.3);
      coldM.instanceMatrix.needsUpdate = true; hotM.instanceMatrix.needsUpdate = true;
      // ---- litter ----
      bits.forEach((b, i) => {
        const t = v - b.t0;
        if (t <= 0 || s.air <= 0) { bitM.setMatrixAt(i, HIDE); return; }
        const up = 0.25 * t * t * (0.4 + b.seed) * (0.4 + s.air);
        P.set(b.x + Math.sin(t * 0.9 + b.seed * 30) * 1.5 + t * 0.4, 0.05 + up + Math.max(0, Math.sin(t * 2 + b.seed * 9)) * 0.4 * smooth(0, 1, t), b.z + Math.cos(t * 0.7 + b.seed * 20) * 1.2);
        if (M) P.applyMatrix4(M[nearestSeed(b.x, b.z)]);
        e.set(t * (1.5 + b.seed * 3), t * (2 + b.seed), t * (1 + b.seed * 2));
        q.setFromEuler(e);
        S.setScalar(b.sz);
        m4.compose(P, q, S);
        bitM.setMatrixAt(i, up > 300 ? HIDE : m4);
      });
      bitM.instanceMatrix.needsUpdate = true;
      // ---- dust lifting off the streets as the air goes, then glowing smoke from the cracks ----
      if (s.air > 0.01) {
        const Rd = rng(31337);
        for (let k = 0; k < 160; k++) {
          const x = (Rd() - 0.5) * 120 + cam.position.x, z = cam.position.z + 20 - Rd() * 220;
          const ph = (v * (0.04 + 0.05 * Rd()) + Rd()) % 1;
          const y = ph * 70 * (0.6 + Rd());
          const r = 3 + Rd() * 6 + ph * 10;
          smoke.puff(x, y, z, r, 0.045 * s.air * Math.sin(Math.PI * ph) * (1 - 0.5 * smooth(SEC.float, SEC.you, v)), 0.3, s.heat * 0.25, Rd());
        }
      }
      if (s.crack > 0.01) {
        for (const p of puffs) {
          const t = v - p.t0;
          if (t < 0) continue;
          const ph = (t * 0.07 + p.seed) % 1;
          P.set(p.x, ph * 90, p.z);
          if (M) P.applyMatrix4(M[p.a]);
          const r = 4 + ph * 18;
          smoke.puff(P.x, P.y, P.z, r, 0.12 * Math.sin(Math.PI * ph) * smooth(0, 3, t), 0.2, 0.5 * (1 - ph), p.seed);
        }
      }
    },
  };
}
