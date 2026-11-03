// The Moon's pieces as real 3D rocks (built once at start-up, in Moon radii; the Moon's centre at the origin, x right,
// y up, z toward you):
//   - the 7 big pieces: the sphere cut along the same jagged lines as the cracks on the first frames (the sky shader's
//     warp + Voronoi), straight through near the face you see and wandering deeper in, so they fit the cracks exactly
//     when the Moon comes apart and show rough broken walls as they tumble;
//   - each big piece cut again into 5 fragments (a 3D Voronoi inside it, roughened), which fit back together into it.
// Surfaces come from a distance-like field on one shared lattice (naive surface nets), so neighbours share their cuts.
import * as THREE from 'three';

export const SEEDS = [[0.03, -0.04], [0.62, 0.15], [0.17, 0.64], [-0.48, 0.43], [-0.63, -0.19], [-0.14, -0.64], [0.46, -0.46]];
// the same as the sky shader's warp() and near7()
function warp(x, y) {
  return [x + 0.05 * (Math.sin(y * 21 + 1.3) + 0.6 * Math.sin(x * 37 + y * 11)), y + 0.05 * (Math.sin(x * 19 + 2.1) + 0.6 * Math.sin(y * 33 - x * 13))];
}
function near7(x, y) {
  let d1 = 1e9, d2 = 1e9, id = 0;
  for (let i = 0; i < 7; i++) {
    const d = Math.hypot(x - SEEDS[i][0], y - SEEDS[i][1]);
    if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
  }
  return [id, (d2 - d1) * 0.5];
}
function hash3(i, j, k) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let fx = x - i, fy = y - j, fz = z - k;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(i, j, k), hash3(i + 1, j, k), fx), l(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), fx), fy),
    l(l(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), fx), l(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), fx), fy), fz);
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const H = 0.02, O = -1.1, N = 111;      // the lattice: [-1.1, 1.1] in steps of 0.02

// naive surface nets over a box of the lattice (F < 0 inside); returns positions + index
function nets(F, nx, ny, nz, x0, y0, z0) {
  const at = (i, j, k) => F[(k * ny + j) * nx + i];
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1)); if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
      n++;
    }
    cell[(k * ny + j) * nx + i] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * H, y0 + (j + sy / n) * H, z0 + (k + sz / n) * H);
  }
  const idx = [];
  const c = (i, j, k) => cell[(k * ny + j) * nx + i];
  const quad = (a, b, cc, d, ax) => {
    // orient so the face points out (from inside to outside along the edge's axis)
    const p = (q) => [pos[3 * q], pos[3 * q + 1], pos[3 * q + 2]];
    const A = p(a), B = p(b), C = p(cc);
    const n = [(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])];
    if (n[ax[0]] * ax[1] < 0) idx.push(a, cc, b, a, d, cc); else idx.push(a, b, cc, a, cc, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s0 = at(i, j, k) < 0;
    if (i < nx - 1 && j > 0 && k > 0 && s0 !== (at(i + 1, j, k) < 0)) quad(c(i, j - 1, k - 1), c(i, j, k - 1), c(i, j, k), c(i, j - 1, k), [0, s0 ? 1 : -1]);
    if (j < ny - 1 && i > 0 && k > 0 && s0 !== (at(i, j + 1, k) < 0)) quad(c(i - 1, j, k - 1), c(i - 1, j, k), c(i, j, k), c(i, j, k - 1), [1, s0 ? 1 : -1]);
    if (k < nz - 1 && i > 0 && j > 0 && s0 !== (at(i, j, k + 1) < 0)) quad(c(i - 1, j - 1, k), c(i, j - 1, k), c(i, j, k), c(i - 1, j, k), [2, s0 ? 1 : -1]);
  }
  return { pos, idx };
}

function toGeometry({ pos, idx }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // its centre (the mean of its surface points) and how far it reaches from there
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 3) c.x += pos[i], c.y += pos[i + 1], c.z += pos[i + 2];
  c.multiplyScalar(3 / pos.length);
  let r = 0;
  for (let i = 0; i < pos.length; i += 3) r = Math.max(r, Math.hypot(pos[i] - c.x, pos[i + 1] - c.y, pos[i + 2] - c.z));
  g.computeBoundingSphere();
  return { geo: g, c, r };
}

// returns [{ geo, c, r, subs: [{ geo, c, r }, x5] }, x7]
export function buildMoonPieces() {
  const out = [];
  for (let id = 0; id < 7; id++) {
    // the piece's box on the lattice (from where its cell lies on the face, plus room for the wandering walls)
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = O + i * H, y = O + j * H;
      if (x * x + y * y > 1) continue;
      const [wx, wy] = warp(x, y);
      if (near7(wx, wy)[0] !== id) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const i0 = Math.max(0, Math.floor((x0 - 0.16 - O) / H)), i1 = Math.min(N - 1, Math.ceil((x1 + 0.16 - O) / H));
    const j0 = Math.max(0, Math.floor((y0 - 0.16 - O) / H)), j1 = Math.min(N - 1, Math.ceil((y1 + 0.16 - O) / H));
    const nx = i1 - i0 + 1, ny = j1 - j0 + 1, nz = N;
    const F = new Float32Array(nx * ny * nz);
    const bx = O + i0 * H, by = O + j0 * H, bz = O;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = bx + i * H, y = by + j * H, z = bz + k * H;
      const r = Math.hypot(x, y, z);
      let f;
      if (r > 1.03 || i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) f = Math.max(r - 1, 0.01);
      else {
        // the cut wanders more the deeper it goes from the face you see (so it matches the cracks there)
        const zf = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        const dep = Math.min(1, Math.max(0, (zf - z) / 0.35));
        const a = 0.16 * dep;
        const px = x + a * (vn3(x * 3.1 + 11, y * 3.1, z * 3.1) - 0.5 + 0.5 * (vn3(x * 7 + 3, y * 7, z * 7) - 0.5));
        const py = y + a * (vn3(x * 3.1, y * 3.1 + 7, z * 3.1) - 0.5 + 0.5 * (vn3(x * 7, y * 7 + 5, z * 7) - 0.5));
        const [wx, wy] = warp(px, py);
        const [cid, e] = near7(wx, wy);
        f = Math.max(r - 1, cid === id ? -e : e);
      }
      F[(k * ny + j) * nx + i] = f;
    }
    const piece = toGeometry(nets(F, nx, ny, nz, bx, by, bz));
    // its 5 fragments: seeds spread through it, cut with a roughened 3D Voronoi
    const R = rng(500 + id), seeds = [];
    const inside = [];
    for (let q = 0; q < F.length; q++) if (F[q] < -0.06) inside.push(q);
    const minD = 0.55 * piece.r;
    for (let tries = 0; seeds.length < 5 && tries < 4000; tries++) {
      const q = inside[Math.floor(R() * inside.length)];
      const i = q % nx, j = Math.floor(q / nx) % ny, k = Math.floor(q / (nx * ny));
      const p = [bx + i * H, by + j * H, bz + k * H];
      const md = tries < 3000 ? minD * (1 - tries / 3000 * 0.6) : 0;
      if (seeds.every((s) => Math.hypot(s[0] - p[0], s[1] - p[1], s[2] - p[2]) > md)) seeds.push(p);
    }
    const subs = [];
    const G = Array.from({ length: seeds.length }, () => new Float32Array(F.length));
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const q = (k * ny + j) * nx + i, f = F[q];
      if (f > 0.05) { for (const g of G) g[q] = f; continue; }
      const x = bx + i * H, y = by + j * H, z = bz + k * H;
      const px = x + 0.12 * (vn3(x * 5 + 1, y * 5, z * 5) - 0.5), py = y + 0.12 * (vn3(x * 5, y * 5 + 2, z * 5) - 0.5), pz = z + 0.12 * (vn3(x * 5, y * 5, z * 5 + 3) - 0.5);
      let d1 = 1e9, id1 = 0;
      const ds = seeds.map((s, n) => { const d = Math.hypot(px - s[0], py - s[1], pz - s[2]); if (d < d1) { d1 = d; id1 = n; } return d; });
      let d2 = 1e9;
      ds.forEach((d, n) => { if (n !== id1 && d < d2) d2 = d; });
      G.forEach((g, n) => { const e = n === id1 ? (d2 - d1) * 0.5 : -(ds[n] - d1) * 0.5; g[q] = Math.max(f, -e); });
    }
    for (const g of G) subs.push(toGeometry(nets(g, nx, ny, nz, bx, by, bz)));
    out.push({ ...piece, subs });
  }
  return out;
}
