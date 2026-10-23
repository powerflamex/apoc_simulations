// The land: the ridge you stand on (hillH in layout.js, a fine mesh close by, coarser far off) and the mountains out
// on the plain (a range running away on the right, a far one on the horizon to the left). Dry chaparral, gold grass,
// rock; snow settles on all of it once the air freezes (fx.js).
import * as THREE from 'three';
import { hillH, BASIN } from './layout.js';
import { patch } from './fx.js';

const n1 = (x) => Math.sin(x) * 0.5 + Math.sin(x * 2.13 + 1.3) * 0.3 + Math.sin(x * 4.71 + 2.1) * 0.2;
const h2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// the mountains on the plain
export function rangeH(x, z) {
  // on the right: a long range running from near the hills out to the north-west
  const ax = 5200, az = -4200, bx = 21000, bz = -36000;
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
  const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  const along = t * L;
  let h = 620 * Math.exp(-Math.pow(d / (1500 + 500 * n1(along / 3000)), 2)) * (0.55 + 0.45 * n1(along / 2100 + 1.1)) * Math.min(1, t * 6);
  h += 90 * n1(x / 700 + z / 900) * Math.exp(-Math.pow(d / 2500, 2));
  // far on the horizon, ahead and left
  h = Math.max(h, 1000 * Math.exp(-Math.pow((z + 44000) / 3500, 2)) * (0.45 + 0.55 * n1(x / 5200 + 0.3)) * (x < 9000 ? 1 : Math.exp(-(x - 9000) / 4000)));
  return BASIN - 30 + h;
}

function colorAt(x, z, h, slope, out) {
  const n = n1(x / 37 + z / 53) * 0.5 + 0.5, m = n1(x / 210 - z / 170 + 4) * 0.5 + 0.5, r = h2(Math.floor(x / 6), Math.floor(z / 6));
  // chaparral (dark olive), dry grass (gold), rock and dirt on the steep parts
  let c = [0.13 + 0.05 * n, 0.13 + 0.04 * n, 0.07 + 0.02 * n];
  const grass = Math.max(0, m - 0.45) * 1.8 * (1 - slope);
  c = c.map((v, i) => v + ([0.3, 0.24, 0.12][i] - v) * Math.min(1, grass));
  const rock = Math.min(1, Math.max(0, slope - 0.55) * 2.5);
  c = c.map((v, i) => v + ([0.32, 0.29, 0.25][i] - v) * rock);
  const k = 0.85 + 0.3 * r;
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
}

function meshFrom(pos, idx, H, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(pos.length), c = [0, 0, 0];
  for (let i = 0; i < pos.length / 3; i++) {
    colorAt(pos[i * 3], pos[i * 3 + 2], pos[i * 3 + 1], 1 - nrm.getY(i), c);
    col.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

export function makeTerrain(scene) {
  const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 'terrain-v1', { grain: true, scale: 0.08, snowSide: 0.55 });
  // ---- the ridge: a polar grid around you, fine close by ----
  {
    const NR = 170, NA = 260, pos = [], idx = [];
    for (let i = 0; i <= NR; i++) {
      const r = i === 0 ? 0.5 : 2 * Math.pow(1.05, i);
      for (let j = 0; j < NA; j++) {
        const a = (j / NA) * Math.PI * 2;
        const x = 10 + Math.sin(a) * r, z = 4 - Math.cos(a) * r;
        pos.push(x, Math.max(hillH(x, z), BASIN - 25), z);
      }
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
      idx.push(a, c, b, b, c, d);
    }
    const m = meshFrom(pos, idx, hillH, mat);
    m.receiveShadow = true; m.castShadow = true;
    scene.add(m);
  }
  // ---- the mountains on the plain ----
  {
    const NX = 220, NZ = 170, pos = [], idx = [];
    for (let i = 0; i <= NZ; i++) for (let j = 0; j <= NX; j++) {
      const x = -34000 + 68000 * j / NX, z = -52000 + 48500 * i / NZ;
      pos.push(x, rangeH(x, z), z);
    }
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
      const a = i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    scene.add(meshFrom(pos, idx, rangeH, mat));
  }
  return { mat };
}
