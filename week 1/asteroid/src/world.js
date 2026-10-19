// Island bay at golden hour -> asteroid impact offshore -> shockwave -> drawback -> megatsunami.
// View from a whitewashed clifftop terrace over a hillside town, a palm-lined beach and a harbour.
// Everything is a pure function of time so any frame can be rendered independently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, patch } from './bend.js';
import { SKY_COMMON } from './sky.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { makeFleet } from './cars.js';
import { T_SHOCK, T_IMPACT } from './timeline.js';
import { makeOcean } from './ocean.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';

// ---------- terrain: a bay between two rocky headlands ----------
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 13.1, z * f); f *= 2.03; a *= 0.5; } return s; };
export const shoreZ = (x) => -250 - 680 * smooth(260, 950, Math.abs(x)) + 25 * Math.sin(x * 0.011) + 15 * Math.sin(x * 0.031);
export function terrainH(x, z) {
  const dz = z - shoreZ(x);
  if (dz < 0) return Math.max(-1.0 + dz * 0.035, -45) + (fbm(x / 60, z / 60, 3) - 0.5) * 1.2 * smooth(0, -40, dz);
  const head = smooth(300, 800, Math.abs(x));
  let h = 1.2 + dz * lerp(0.14, 0.42, head);
  h = Math.min(h, 120 + fbm(x / 300, z / 300, 3) * 60);
  h += head * 32 * smooth(0, 22, dz);                                  // cliffs on the headlands
  h += 62 * Math.exp(-(x * x + (z - 40) ** 2) / (85 * 85));            // the clifftop with our terrace
  h += (fbm(x / 120, z / 120, 4) - 0.5) * 14 * smooth(25, 140, dz);
  return h;
}
const BAL_Z = 30;
const FLOOR_Y = terrainH(0, BAL_Z) + 3;
export const CAM_BASE = new THREE.Vector3(0, FLOOR_Y + 1.62, BAL_Z + 0.5);
export const AZ_IMPACT = -6 * DEG;
export const DIR_I = new THREE.Vector2(Math.sin(AZ_IMPACT), -Math.cos(AZ_IMPACT));
const PERP_I = new THREE.Vector2(-DIR_I.y, DIR_I.x);
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const uOf = (x, z) => (x - CAM_BASE.x) * DIR_I.x + (z - CAM_BASE.z) * DIR_I.y;

export function waterHeight(x, z, s) {
  const u = uOf(x, z);
  let h = -14 * s.drawback * (1 - smooth(1500, 9000, u));
  if (s.waveOn) h += waveProfile(u, s).eta;
  return h;
}
function waveProfile(u, s) {
  const H = s.waveH, F = s.waveF;
  const xw = u - F;
  const Wf = H * lerp(0.9, 0.32, s.lip), Wb = 3 * H + 500;
  const crest = xw >= 0 ? Math.exp(-((xw / Wb) ** 2)) : Math.exp(-((xw / Wf) ** 2));
  const trough = -0.22 * H * Math.exp(-(((xw + 2.5 * Wf + 150) / (2 * H + 400)) ** 2));
  return { eta: H * crest + trough, crest, xw };
}
function prismGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5,
  ], 3));
  g.computeVertexNormals();
  return g;
}
function ribbonGeo(pts, width, lift = 0.15) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    for (const sg of [-1, 1]) { const x = pts[i][0] - tz * sg * width / 2, z = pts[i][1] + tx * sg * width / 2; pos.push(x, terrainH(x, z) + lift, z); }
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function makeWorld(scene) {
  const R = rng(4711);
  const world = {};
  const buildingMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 }), { windows: true });
  const plainMat = (color, rough = 0.9, extra = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; return m; };

  // swept along by the wave once the front has passed this point
  function carried(x0, z0, rnd, s, depth = 0.6) {
    if (!s.waveOn) return null;
    const u0 = uOf(x0, z0);
    if (s.waveF > u0 + 2) return null;
    const u = Math.min(u0, s.waveF - (6 + rnd * 26));
    const lat = (x0 - CAM_BASE.x) * PERP_I.x + (z0 - CAM_BASE.z) * PERP_I.y + (rnd - 0.5) * (u0 - u) * 0.15;
    const x = CAM_BASE.x + DIR_I.x * u + PERP_I.x * lat, z = CAM_BASE.z + DIR_I.y * u + PERP_I.y * lat;
    const wp = waveProfile(u, s);
    const y = Math.max(terrainH(x, z) + 0.5, wp.eta * (depth + 0.35 * rnd));
    return { x, y, z, tumble: (u0 - u) * 0.06 + (s.t - 70) * 0.5 * rnd };
  }

  // ---------- terrain mesh (land + seabed) ----------
  {
    const rings = 240, segs = 300, r0 = 3, r1 = 9000, a0 = -100 * DEG, a1 = 100 * DEG;
    const pos = new Float32Array((rings + 1) * (segs + 1) * 3), col = new Float32Array(pos.length);
    const deep = new THREE.Color(0x2c3533), bedC = new THREE.Color(0x6b6250), wet = new THREE.Color(0x9a8a6c), sand = new THREE.Color(0xe6cfa3);
    const scrub = new THREE.Color(0x6f7240), scrub2 = new THREE.Color(0x8b8456), rock = new THREE.Color(0x8c8072), rock2 = new THREE.Color(0x6d6358), paved = new THREE.Color(0xcfc3ad), weed = new THREE.Color(0x3b4128);
    let k = 0;
    for (let i = 0; i <= rings; i++) {
      const r = r0 * Math.pow(r1 / r0, i / rings);
      for (let j = 0; j <= segs; j++, k++) {
        const a = lerp(a0, a1, j / segs);
        const x = CAM_BASE.x + Math.sin(a) * r, z = CAM_BASE.z - Math.cos(a) * r;
        const h = terrainH(x, z);
        const dz = z - shoreZ(x);
        const e = Math.max(r * 0.004, 1.2);
        const slope = Math.hypot(terrainH(x + e, z) - h, terrainH(x, z + e) - h) / e;
        pos.set([x, h, z], k * 3);
        const n = fbm(x / 40, z / 40, 3);
        if (dz < 0) {
          tmpC.copy(wet).lerp(bedC, smooth(0, -60, dz)).lerp(deep, smooth(-150, -500, dz));
          if (Math.sin(x * 0.031 + z * 0.017) * Math.sin(x * 0.013 - z * 0.029) > 0.4) tmpC.lerp(weed, 0.55);
        } else if (dz < 34 && Math.abs(x) < 330) tmpC.copy(sand).lerp(wet, smooth(5, 0, dz));
        else {
          tmpC.copy(scrub).lerp(scrub2, n);
          if (Math.abs(x) < 320 && dz > 40 && dz < 250) tmpC.lerp(paved, 0.55);            // the town
          tmpC.lerp(n > 0.5 ? rock : rock2, smooth(0.45, 0.9, slope));
        }
        col.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
      }
    }
    const idx = [];
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    scene.add(shadowy(new THREE.Mesh(geo, plainMat(0xffffff, 0.92, { vertexColors: true, flatShading: true })), false, true));
  }
  // distant islands on the horizon: eroded ridges with scrub, bare rock and pale cliffs, a white village on each
  {
    const isl = [[-3400, -7200, 1500, 900, 300, 0.3], [-2300, -9600, 1900, 1100, 420, 1.1], [3100, -8000, 1700, 1000, 330, 2.2], [4700, -11200, 2500, 1300, 560, 3.7]];
    const pos = [], col = [], idx = [];
    const scrubC = new THREE.Color(0x857d5c), rockC = new THREE.Color(0x9c9285), cliffC = new THREE.Color(0xc2b6a2), topC = new THREE.Color(0x8b8478);
    const village = [];
    for (const [cx, cz, rx, rz, hgt, sd] of isl) {
      const RINGS = 28, SEGS = 72, base = pos.length / 3;
      const pt = (a, rr) => {
        const wob = 1 + 0.36 * (fbm(Math.cos(a) * 2 + sd, Math.sin(a) * 2 + sd * 3, 3) - 0.5);
        const x = cx + Math.cos(a) * rx * rr * wob, z = cz + Math.sin(a) * rz * rr * wob;
        const n = fbm(x / 420 + sd * 7, z / 420, 5);
        const shape = Math.pow(1 - smooth(0.0, 1.0, rr), 1.3);
        return [x, hgt * shape * (0.45 + 0.9 * n) + (rr < 1 ? 12 * smooth(1.0, 0.9, rr) : -20 * smooth(1.0, 1.12, rr)) - 4, z, n];
      };
      for (let i = 0; i <= RINGS; i++) for (let j = 0; j < SEGS; j++) {
        const rr = (i / RINGS) * 1.12;
        const [x, y, z, n] = pt((j / SEGS) * Math.PI * 2, rr);
        pos.push(x, y, z);
        tmpC.copy(scrubC).lerp(topC, smooth(0.25, 0.8, y / hgt)).lerp(rockC, smooth(0.45, 0.7, n));
        if (rr > 0.9 && rr < 1.02) tmpC.lerp(cliffC, 0.7);
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
      for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEGS; j++) {
        const a = base + i * SEGS + j, b = base + i * SEGS + ((j + 1) % SEGS), c = a + SEGS, d = b + SEGS;
        idx.push(a, c, b, b, c, d);
      }
      for (let k = 0; k < 70; k++) {
        const [x, y, z] = pt(Math.PI / 2 + (R() - 0.5) * 0.7, 0.8 + R() * 0.13);
        village.push([x, y, z, 10 + R() * 14, R()]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, plainMat(0xffffff, 1, { vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    m.frustumCulled = false; scene.add(m);
    const vm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), plainMat(0xf4f0e6, 0.8), village.length);
    village.forEach(([x, y, z, sz, r], i) => { dummy.position.set(x, y - 3, z); dummy.rotation.set(0, r * 3, 0); dummy.scale.set(sz, sz * 0.7, sz); dummy.updateMatrix(); vm.setMatrixAt(i, dummy.matrix); });
    vm.frustumCulled = false; scene.add(vm);
  }

  // ---------- seabed the drawback exposes: boulders, weed-covered rocks, shining tide pools ----------
  {
    const RS = rng(606);
    const rocks = [], pools = [];
    for (let n = 0; n < 8000 && rocks.length + pools.length < 900; n++) {
      const x = (RS() - 0.5) * 900, dz = -10 - Math.pow(RS(), 1.4) * 430, z = shoreZ(x) + dz;
      if (Math.hypot(x - 150, z + 585) < 40) continue;
      if (RS() < 0.72) rocks.push([x, terrainH(x, z), z, 0.4 + Math.pow(RS(), 3) * 3.2, RS()]);
      else pools.push([x, terrainH(x, z), z, 2 + RS() * 6, RS()]);
    }
    const rm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), plainMat(0xffffff, 0.95, { flatShading: true }), rocks.length);
    rocks.forEach(([x, y, z, sc, r], i) => {
      dummy.position.set(x, y - sc * 0.25, z); dummy.rotation.set(r * 3, r * 7, r * 5); dummy.scale.set(sc * (1 + r * 0.6), sc * 0.6, sc); dummy.updateMatrix();
      rm.setMatrixAt(i, dummy.matrix); rm.setColorAt(i, tmpC.setRGB(0.25, 0.24, 0.2).lerp(new THREE.Color(0x2f3a1e), r * 0.8));
    });
    const pm = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), plainMat(0x2a2a28, 0.08, { emissive: 0x9a8a80, emissiveIntensity: 0.22 }), pools.length);
    pools.forEach(([x, y, z, sc, r], i) => { dummy.position.set(x, y + 0.3, z); dummy.rotation.set(0, r * 6, 0); dummy.scale.set(sc * (1.3 + r), 1, sc); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
    scene.add(shadowy(rm), shadowy(pm, false, true));
  }

  // ---------- roads ----------
  const road = [];
  for (let x = -330; x <= 330; x += 6) road.push([x, shoreZ(x) + 44]);
  scene.add(shadowy(new THREE.Mesh(ribbonGeo(road, 8), plainMat(0x3e3d3b, 0.95)), false, true));
  const street = [];
  for (let i = 0; i <= 50; i++) { const u = i / 50; const zz = lerp(shoreZ(0) + 48, -10, u); street.push([Math.sin(u * 6.0) * 30, zz]); }
  scene.add(shadowy(new THREE.Mesh(ribbonGeo(street, 4.5), plainMat(0xd9cdb8, 0.95)), false, true));
  const nearStreet = (x, z) => street.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 8);

  // ---------- the town: whitewashed cube houses, a few tiled roofs, a blue-domed chapel ----------
  const houses = [];
  // a house on a slope: the box starts below the lowest corner (stone plinth on the downhill side),
  // the ground floor sits on the highest corner, and the roof is a full house-height above that
  const siteHouse = (b) => {
    let lo = Infinity, hi = -Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const hh = terrainH(b.x + sx * b.w / 2, b.z + sz * b.d / 2);
      lo = Math.min(lo, hh); hi = Math.max(hi, hh);
    }
    b.y0 = lo - 0.6; b.ground = hi; b.h = hi + b.h;
    return b;
  };
  const CHAPEL = [34, -132], MILL = [-44, -180];
  const walls = [0xf6f3ec, 0xf3efe6, 0xfbf8f2, 0xf1e9dc, 0xe9d6c2, 0xf2dfc0, 0xdfe9ea, 0xf0d5d0];
  for (let gx = -300; gx <= 300; gx += 19) for (let gd = 56; gd <= 240; gd += 17) {
    if (R() < 0.22) continue;
    const x = gx + (R() - 0.5) * 9, z = shoreZ(gx) + gd + (R() - 0.5) * 7;
    if (nearStreet(x, z) || Math.hypot(x - CHAPEL[0], z - CHAPEL[1]) < 17 || Math.hypot(x - MILL[0], z - MILL[1]) < 19 || Math.hypot(x, z - BAL_Z) < 85) continue;
    const w = 7 + R() * 5, d = 7 + R() * 4, h = 3.6 + R() * 3.4 * (R() < 0.35 ? 1.9 : 1);
    houses.push(siteHouse({ x, z, w, d, h, row: 1, seed: R(), color: R() < 0.72 ? walls[Math.floor(R() * 3)] : walls[3 + Math.floor(R() * 5)], tile: R() < 0.28, r: R() }));
  }
  houses.push(siteHouse({ x: 150, z: shoreZ(150) + 60, w: 46, d: 14, h: 12.5, row: 1, seed: R(), color: 0xf4efe4, tile: false, r: R() }));   // hotel
  // stacked cubes: an upper storey set back onto one corner of many roofs (the classic Cycladic massing)
  const R2 = rng(2024);
  const blocks = houses.slice();
  for (const b of houses) {
    if (b.tile || b.w > 30 || R2() > 0.5) continue;
    const w = b.w * (0.42 + R2() * 0.22), d = b.d * (0.45 + R2() * 0.25);
    const x = b.x + (R2() < 0.5 ? -1 : 1) * (b.w - w) / 2, z = b.z + (R2() < 0.5 ? -1 : 1) * (b.d - d) / 2;
    blocks.push({ x, z, w, d, y0: b.h, ground: b.h, h: b.h + 2.7 + R2() * 0.5, seed: R2(), color: b.color, tile: false, upper: true });
    b.hasUpper = true;
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const seeds = new Float32Array(blocks.length), grounds = new Float32Array(blocks.length);
  blocks.forEach((b, i) => { seeds[i] = b.seed; grounds[i] = b.ground - b.y0; });
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(grounds, 1));
  const bMesh = new THREE.InstancedMesh(bGeo, buildingMat, blocks.length);
  // roof parapets (a low rim, not a slab), and tiled hip roofs on a few
  const parGeo = mergeGeometries([
    new THREE.BoxGeometry(1, 1, 0.035).translate(0, 0.5, 0.4825), new THREE.BoxGeometry(1, 1, 0.035).translate(0, 0.5, -0.4825),
    new THREE.BoxGeometry(0.035, 1, 0.93).translate(0.4825, 0.5, 0), new THREE.BoxGeometry(0.035, 1, 0.93).translate(-0.4825, 0.5, 0),
    new THREE.BoxGeometry(1, 0.12, 1).translate(0, 0.06, 0),
  ]);
  const capMesh = new THREE.InstancedMesh(parGeo, plainMat(0xffffff, 0.8), blocks.length);
  const tileMesh = new THREE.InstancedMesh(prismGeo(), plainMat(0xb5532c, 0.8, { flatShading: true, side: THREE.DoubleSide }), blocks.length);
  blocks.forEach((b, i) => {
    dummy.position.set(b.x, b.y0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h - b.y0, b.d); dummy.updateMatrix();
    bMesh.setMatrixAt(i, dummy.matrix); bMesh.setColorAt(i, tmpC.set(b.color));
    dummy.position.set(b.x, b.h, b.z); dummy.scale.set(b.w + 0.2, b.tile ? 0.0001 : 0.55, b.d + 0.2); dummy.updateMatrix();
    capMesh.setMatrixAt(i, dummy.matrix); capMesh.setColorAt(i, tmpC.set(b.color).multiplyScalar(0.97));
    dummy.scale.set(b.w * 1.1, b.tile ? b.w * 0.32 : 0.0001, b.d * 1.08); dummy.updateMatrix();
    tileMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(shadowy(bMesh), shadowy(capMesh), shadowy(tileMesh));
  // roof clutter on the top-most roofs: water tanks, solar water heaters, aerials, a few small domes
  {
    const tops = blocks.filter((b) => !b.tile && !b.hasUpper && b.w < 30);
    const tanks = [], solar = [], aerials = [], domes = [];
    for (const b of tops) {
      const px = () => b.x + (R2() - 0.5) * Math.max(b.w - 2.6, 0.5), pz = () => b.z + (R2() - 0.5) * Math.max(b.d - 2.6, 0.5);
      if (R2() < 0.42) tanks.push([px(), b.h, pz(), R2()]);
      if (R2() < 0.3) solar.push([px(), b.h, pz(), R2()]);
      if (R2() < 0.35) aerials.push([px(), b.h, pz(), R2()]);
      if (R2() < 0.07) domes.push([b.x, b.h, b.z, Math.min(b.w, b.d) * 0.28, R2()]);
    }
    const inst = (geo, mat, list, place) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
      m.count = list.length;
      list.forEach((it, i) => { dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); place(it); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
      scene.add(shadowy(m));
      return m;
    };
    const at = ([x, y, z, r]) => { dummy.position.set(x, y, z); dummy.rotation.y = r * 6.28; };
    inst(mergeGeometries([new THREE.CylinderGeometry(0.55, 0.55, 1.15, 12).translate(0, 1.2, 0), new THREE.BoxGeometry(0.95, 0.62, 0.95).translate(0, 0.31, 0)]), plainMat(0xe6e3dc, 0.55), tanks, at);
    const sAt = ([x, y, z, r]) => { dummy.position.set(x, y, z); dummy.rotation.y = (r - 0.5) * 0.4; };
    inst(new THREE.BoxGeometry(1.1, 0.06, 2.0).rotateX(-0.7).translate(0, 0.78, 0.05), plainMat(0x1d2a44, 0.25, { metalness: 0.3 }), solar, sAt);
    inst(mergeGeometries([new THREE.CylinderGeometry(0.27, 0.27, 1.25, 10).rotateZ(Math.PI / 2).translate(0, 1.5, 0.75), new THREE.BoxGeometry(1.0, 0.75, 0.06).translate(0, 0.38, -0.75)]), plainMat(0xd9d6cf, 0.5), solar, sAt);
    inst(mergeGeometries([new THREE.CylinderGeometry(0.025, 0.03, 2.4, 4).translate(0, 1.2, 0), new THREE.BoxGeometry(0.9, 0.025, 0.025).translate(0, 2.1, 0), new THREE.BoxGeometry(0.6, 0.025, 0.025).translate(0, 1.8, 0)]), plainMat(0x555555, 0.5), aerials, at);
    inst(mergeGeometries([new THREE.CylinderGeometry(1, 1, 0.5, 20).translate(0, 0.25, 0), new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.5, 0)]), plainMat(0x1f5fa8, 0.35), domes,
      ([x, y, z, s]) => { dummy.position.set(x, y, z); dummy.scale.setScalar(s); });
  }
  // the chapel: nave with a barrel roof, blue dome on a drum, a pierced bell gable, a walled courtyard
  {
    const [cx, cz] = CHAPEL, y = terrainH(cx, cz) - 0.5;
    const white = plainMat(0xfbf9f4, 0.8), dark = plainMat(0x1b1d24, 0.9), blue = plainMat(0x1f5fa8, 0.35);
    const g = new THREE.Group();
    g.position.set(cx, y, cz); g.rotation.y = 0.25;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(9, 7, 13).translate(0, 3.5, 0), white));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 13, 16, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.35, 1).translate(0, 7, 0), white));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.6, 24).translate(0, 8.3, -1), white));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(3.45, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 9.6, -1), blue));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.18).translate(0, 13.6, -1), white), new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.16).translate(0, 13.8, -1), white));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(5, 4.2, 0.9).translate(0, 9.1, 6.0), white));
    for (const sx of [-1.2, 1.2]) {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 1.0).translate(sx, 9.4, 6.0), dark));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, 0.55, 10).translate(sx, 9.35, 6.0), plainMat(0x8a6a2a, 0.4, { metalness: 0.6 })));
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.12).translate(0, 1.3, 6.52), blue));
    for (const sx of [-3.0, 3.0]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1).translate(sx, 3.6, 6.52), dark));
    for (const [w, d, x, z] of [[18, 0.5, 0, 9.5], [0.5, 9, -9, 5], [0.5, 9, 9, 5]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, d).translate(x, 0.65, z), white));
    g.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(g);
  }
  // a whitewashed windmill with a thatched cap; its sails turn in the breeze, then spin wild in the blast
  const millSails = new THREE.Group();
  {
    const [mx, mz] = MILL, y = terrainH(mx, mz) - 0.4;
    const white = plainMat(0xf7f4ee, 0.8), dark = plainMat(0x1b2333, 0.9), wood = plainMat(0x5a4330, 0.9);
    const g = new THREE.Group();
    g.position.set(mx, y, mz); g.rotation.y = 0.35; g.scale.setScalar(1.4);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.45, 8.6, 22).translate(0, 4.3, 0), white));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(3.25, 2.9, 22).translate(0, 10.05, 0), plainMat(0x7a6040, 0.95, { flatShading: true })));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.3).translate(0, 1.0, 3.25), plainMat(0x1f5fa8, 0.5)));
    for (const [a, h] of [[0.6, 4.5], [-0.8, 6.6], [2.6, 3.8]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.3).translate(0, h, 3.1).applyMatrix4(new THREE.Matrix4().makeRotationY(a)), dark));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 8).rotateX(Math.PI / 2).translate(0, 8.9, 3.0), wood));
    for (let k = 0; k < 8; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k / 8) * Math.PI * 2;
      arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.6, 0.12).translate(0, 3.3, 0), wood));
      const sail = new THREE.BufferGeometry();
      sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.1, 0, 0, 6.4, 0, 1.7, 5.1, -0.15, 0, 1.1, 0, 1.7, 5.1, -0.15, 1.0, 1.6, -0.1], 3));
      sail.computeVertexNormals();
      arm.add(new THREE.Mesh(sail, plainMat(0xf0ebe0, 0.95, { side: THREE.DoubleSide })));
      millSails.add(arm);
    }
    millSails.position.set(0, 8.9, 4.05);
    g.add(millSails);
    g.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(g);
  }

  // ---------- harbour: breakwater + lighthouse ----------
  const lightX = 150, lightZ = -585;
  {
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), plainMat(0x8a8276, 0.95, { flatShading: true }), 520);
    const x0 = 335, z0 = shoreZ(335) + 6;
    for (let i = 0; i < 520; i++) {
      const u = i / 519, x = lerp(x0, lightX, u) + (R() - 0.5) * 7, z = lerp(z0, lightZ, u) + (R() - 0.5) * 7 + Math.sin(u * 3.1) * 40;
      const sc = 1.5 + R() * 2.8;
      dummy.position.set(x, 0.6 + (R() - 0.3) * 2, z); dummy.rotation.set(R() * 3, R() * 3, R() * 3); dummy.scale.set(sc, sc * 0.8, sc); dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    scene.add(shadowy(rocks));
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.8, 22, 16).translate(0, 11, 0), plainMat(0xf5f2ea, 0.7)); tower.position.set(lightX, 1.5, lightZ);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.35, 3.5, 16).translate(0, 15, 0), plainMat(0xb3261e, 0.6)); band.position.set(lightX, 1.5, lightZ);
    const room = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12).translate(0, 24.5, 0), glowMat(new THREE.Color(2.2, 1.9, 1.3))); room.position.set(lightX, 1.5, lightZ);
    const capL = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 12).translate(0, 26.8, 0), plainMat(0xb3261e, 0.6)); capL.position.set(lightX, 1.5, lightZ);
    for (const m of [tower, band, room, capL]) scene.add(shadowy(m));
  }

  // ---------- palms along the promenade + scrub and cypress on the hills ----------
  // palms: a gently curved ringed trunk, and a crown of arching, drooping fronds
  const palmTrunkGeo = (() => {
    const parts = [];
    for (let k = 0; k < 6; k++) {
      const y0 = k * 1.5, bend = 0.012 * y0 * y0;
      parts.push(new THREE.CylinderGeometry(0.24 - k * 0.012, 0.27 - k * 0.012, 1.55, 7).translate(bend, y0 + 0.75, 0));
      parts.push(new THREE.CylinderGeometry(0.29 - k * 0.012, 0.29 - k * 0.012, 0.12, 7).translate(bend, y0 + 1.45, 0));
    }
    parts.push(new THREE.SphereGeometry(0.42, 8, 6).scale(1, 0.8, 1).translate(0.97, 9.05, 0));
    return mergeGeometries(parts.map((g) => g.toNonIndexed()));
  })();
  const palmGeo = (() => {
    const parts = [];
    for (let i = 0; i < 13; i++) {
      const yaw = (i / 13) * Math.PI * 2 + (i % 3) * 0.2;
      let px = 0, py = 0, pitch = 0.75 - (i % 3) * 0.3;
      for (let k = 0; k < 5; k++) {
        const len = 0.95, w = [0.35, 0.85, 1.0, 0.8, 0.45][k];
        const seg = new THREE.BoxGeometry(w, 0.035, len).translate(0, 0, len / 2);
        // fold the leaflets into a shallow V
        const pos = seg.attributes.position;
        for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) + Math.abs(pos.getX(v)) * 0.35);
        seg.rotateX(-pitch).translate(0, py, px);
        parts.push(seg.toNonIndexed());
        px += Math.cos(pitch) * len; py += Math.sin(pitch) * len;
        pitch -= 0.33;
      }
      parts[parts.length - 1].userData.dummy = true;
      for (let k = parts.length - 5; k < parts.length; k++) parts[k].rotateY(yaw).translate(0.97, 9.1, 0);
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    return g;
  })();
  const palms = [];
  for (let x = -320; x <= 320; x += 11 + R() * 4) palms.push({ x, z: shoreZ(x) + 38 + (R() - 0.5) * 3, s: 0.9 + R() * 0.35, r: R(), lean: (R() - 0.5) * 0.18 });
  for (let i = 0; i < 40; i++) { const x = (R() - 0.5) * 600, z = shoreZ(x) + 60 + R() * 170; if (!nearStreet(x, z)) palms.push({ x, z, s: 0.8 + R() * 0.4, r: R(), lean: (R() - 0.5) * 0.2 }); }
  // (no palm trees growing up through a house)
  palms.forEach((p) => { p.inside = blocks.some((b) => Math.abs(b.x - p.x) < b.w / 2 + 1.2 && Math.abs(b.z - p.z) < b.d / 2 + 1.2); });
  const palmMesh = new THREE.InstancedMesh(palmGeo, plainMat(0xffffff, 0.85, { flatShading: true, side: THREE.DoubleSide }), palms.length);
  const palmTrunk = new THREE.InstancedMesh(palmTrunkGeo, plainMat(0x7d6a55, 0.95, { flatShading: true }), palms.length);
  scene.add(shadowy(palmTrunk));
  palms.forEach((p, i) => palmMesh.setColorAt(i, tmpC.setHSL(0.24 + p.r * 0.06, 0.45, 0.24 + p.r * 0.08)));
  scene.add(shadowy(palmMesh));
  {
    const shrubs = [], cyp = [];
    for (let n = 0; n < 40000 && shrubs.length < 5000; n++) {
      const x = (R() - 0.5) * 3600, z = 120 - R() * 2600;
      const dz = z - shoreZ(x);
      if (dz < 30 || (Math.abs(x) < 320 && dz < 250) || Math.hypot(x, z - BAL_Z) < 60) continue;
      const h = terrainH(x, z);
      (R() < 0.12 ? cyp : shrubs).push([x, h - 0.2, z, 0.6 + R() * 1.0, R()]);
    }
    const sm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.4, 0), plainMat(0xffffff, 0.9, { flatShading: true }), shrubs.length);
    shrubs.forEach(([x, y, z, sc, r], i) => { dummy.position.set(x, y + 0.5 * sc, z); dummy.rotation.set(r, r * 5, 0); dummy.scale.set(sc * 1.2, sc * 0.75, sc); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); sm.setColorAt(i, tmpC.setHSL(0.17 + r * 0.08, 0.32, 0.2 + r * 0.08)); });
    const cm = new THREE.InstancedMesh(mergeGeometries([new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5).translate(0, 0.6, 0), new THREE.ConeGeometry(0.9, 7, 7).translate(0, 4.6, 0)]), plainMat(0xffffff, 0.9, { flatShading: true }), cyp.length);
    cyp.forEach(([x, y, z, sc, r], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, r * 6, 0); dummy.scale.setScalar(0.7 + sc * 0.5); dummy.updateMatrix(); cm.setMatrixAt(i, dummy.matrix); cm.setColorAt(i, tmpC.setHSL(0.28, 0.4, 0.13 + r * 0.06)); });
    scene.add(shadowy(sm), shadowy(cm));
  }

  // ---------- beach umbrellas + towels: the blast takes the umbrellas, the wave takes the rest ----------
  const umbrellas = [];
  for (let i = 0; i < 70; i++) { const x = -300 + R() * 600; umbrellas.push({ x, z: shoreZ(x) + 7 + R() * 20, tilt: (R() - 0.5) * 0.25, r: R(), vx: (R() - 0.5) * 4, vy: 3 + R() * 5, vz: 6 + R() * 9, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(14), c: [0xe63946, 0xf1c453, 0x2a9d8f, 0xf4f1de, 0x457b9d, 0xe76f51, 0x1d3557][Math.floor(R() * 7)], yaw: (R() - 0.5) * 0.6 }); }
  const umbPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5).translate(0, 1.1, 0), plainMat(0xdddddd, 0.6), umbrellas.length);
  const umbCan = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 0.45, 10, 1, true).translate(0, 2.2, 0), plainMat(0xffffff, 0.9, { side: THREE.DoubleSide }), umbrellas.length);
  const towels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.03, 1.8), plainMat(0xffffff, 1.0), umbrellas.length);
  umbrellas.forEach((u, i) => { umbCan.setColorAt(i, tmpC.set(u.c)); towels.setColorAt(i, tmpC.set([0xff8fab, 0x8ecae6, 0xffd166, 0x06d6a0, 0xffffff][Math.floor(R() * 5)])); });
  scene.add(shadowy(umbPole), shadowy(umbCan), shadowy(towels));
  function updateUmbrellas(t, s) {
    umbrellas.forEach((u, i) => {
      const dt = t - (T_SHOCK + 0.05 + u.r * 0.2);
      let x = u.x, y = terrainH(u.x, u.z), z = u.z, rx = u.tilt, ry = 0, rz = u.tilt * 0.5;
      if (dt > 0) {
        const tl = (u.vy + Math.sqrt(u.vy * u.vy + 2 * 9.8 * 0.5)) / 9.8, tt = Math.min(dt, tl);
        x += u.vx * tt; z += u.vz * tt; y += u.vy * tt - 4.9 * tt * tt; y = Math.max(y, terrainH(x, z) - 0.2);
        rx += u.spin.x * tt; ry += u.spin.y * tt; rz += u.spin.z * tt;
      }
      const c = carried(x, z, u.r, s, 0.5);
      if (c) { x = c.x; y = c.y; z = c.z; rx += c.tumble; rz += c.tumble * 0.7; }
      dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.setScalar(1); dummy.updateMatrix();
      umbPole.setMatrixAt(i, dummy.matrix); umbCan.setMatrixAt(i, dummy.matrix);
      const ct = carried(u.x + 1.2, u.z + 1, u.r * 0.7 + 0.2, s, 0.3);
      dummy.position.set(ct ? ct.x : u.x + 1.2, ct ? ct.y : terrainH(u.x + 1.2, u.z + 1) + 0.03, ct ? ct.z : u.z + 1);
      dummy.rotation.set(ct ? ct.tumble : 0, u.yaw, ct ? ct.tumble * 0.5 : 0); dummy.updateMatrix();
      towels.setMatrixAt(i, dummy.matrix);
    });
    umbPole.instanceMatrix.needsUpdate = umbCan.instanceMatrix.needsUpdate = towels.instanceMatrix.needsUpdate = true;
  }
  function updatePalms(t, s) {
    const bt = t - T_SHOCK;
    palms.forEach((p, i) => {
      const whip = bt > 0 ? 0.5 * Math.exp(-bt * 1.1) * Math.cos(bt * 5.5 + p.r * 3) + 0.07 * smooth(0, 3, bt) : 0;
      let x = p.x, y = terrainH(p.x, p.z) - 0.2, z = p.z, rx = whip + Math.sin(t * 1.2 + i) * 0.02 + p.lean, rz = p.lean * 0.5;
      const c = carried(x, z, p.r, s, 0.55);
      if (c) { x = c.x; y = c.y; z = c.z; rx += c.tumble; rz += c.tumble * 0.6; }
      dummy.position.set(x, y, z); dummy.rotation.set(rx, p.r * 6, rz); dummy.scale.setScalar(p.inside ? 0.0001 : p.s); dummy.updateMatrix();
      palmMesh.setMatrixAt(i, dummy.matrix); palmTrunk.setMatrixAt(i, dummy.matrix);
    });
    palmMesh.instanceMatrix.needsUpdate = palmTrunk.instanceMatrix.needsUpdate = true;
  }

  // ---------- cars on the coast road ----------
  const cars = [];
  for (let i = 0; i < 26; i++) cars.push({ x0: R() * 660, dir: R() < 0.5 ? 1 : -1, sp: 7 + R() * 5, r: R(), flee: 52.5 + R() * 3, c: [0xb8b8b8, 0x1e1e22, 0xe0ddd5, 0x8a1c1c, 0x1d3557, 0xd9a400, 0x2f4f3f, 0x6d6d73, 0xf2c200][Math.floor(R() * 9)] });
  const fleet = makeFleet(scene, cars.length, { plainMat, glowMat, shadowy });
  cars.forEach((c, i) => fleet.color(i, c.c, [0, 1, 0, 2, 1, 3, 0, 2][i % 8]));
  const travel = (t) => (t < 17 ? t : 17 + (Math.min(t, 19.5) - 17) - Math.pow(Math.min(t, 19.5) - 17, 2) / 5);
  function updateCars(t, s) {
    const tr = travel(t);
    cars.forEach((c, i) => {
      let u = (c.x0 + c.sp * tr + (t > c.flee ? 0.5 * 5 * (t - c.flee) ** 2 : 0)) % 660;
      let x = c.dir > 0 ? -330 + u : 330 - u;
      let z = shoreZ(x) + 44 + (c.dir > 0 ? 1.8 : -1.8), y = terrainH(x, z) + 0.15, rx = 0, rz = 0;
      let fade = Math.min(clamp(u / 4), clamp((660 - u) / 4));
      const yaw = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      const k = carried(x, z, c.r, s, 0.45);
      if (k) { x = k.x; y = k.y; z = k.z; rx = k.tumble; rz = k.tumble * 0.7; fade = 1; }
      dummy.position.set(x, y, z); dummy.rotation.set(rx, yaw + rx * 0.3, rz); dummy.scale.setScalar(Math.max(fade, 0.0001)); dummy.updateMatrix();
      fleet.set(i, dummy.matrix, i % 3 === 0 && !k);
    });
    fleet.commit();
  }

  // ---------- people: sunbathers, swimmers, strollers; they stop to stare, get knocked flat, then run ----------
  const people = [];
  for (let i = 0; i < 170; i++) { const x = -300 + R() * 600; people.push({ kind: 'beach', x, z: shoreZ(x) + 4 + R() * 26, lying: R() < 0.3, still: R() < 0.55 }); }
  for (let i = 0; i < 80; i++) { const x = -320 + R() * 640; people.push({ kind: 'prom', x, z: shoreZ(x) + 39 }); }
  for (let i = 0; i < 40; i++) people.push({ kind: 'street', u: R() });
  people.forEach((p) => Object.assign(p, { dir: R() < 0.5 ? -1 : 1, speed: 0.7 + R() * 0.7, r: R(), runT: 52 + R() * 3.5, h: 0.9 + R() * 0.2, knock: R() < 0.7 }));
  const clothes = [0x2b2d42, 0x8d99ae, 0xef233c, 0xedf2f4, 0x3a5a40, 0xd4a373, 0x264653, 0xe9c46a, 0x6d597a, 0x1d1d1d, 0xff9f1c, 0x48cae4];
  people.forEach(() => R());
  const RP = rng(321);
  for (let i = 0; i < 60; i++) {           // in the sea: swimmers and waders, who come out after the impact
    const x = -240 + RP() * 480, off = 6 + RP() * 34;
    people.push({ kind: 'water', x, z: shoreZ(x) - off, off, dir: RP() < 0.5 ? -1 : 1, speed: 0.3, r: RP(), runT: 52.5 + RP() * 3, h: 0.9 + RP() * 0.2, knock: true, swim: RP() < 0.5, outT: 18.5 + RP() * 9 });
  }
  const crowd = makeCrowd(scene, people.length, plainMat(0xffffff, 0.85));
  people.forEach((p, i) => {
    const skin = SKIN[Math.floor(RP() * SKIN.length)];
    const bare = (p.kind === 'beach' || p.kind === 'water') && RP() < 0.55;
    const shirt = bare ? skin : clothes[Math.floor(RP() * clothes.length)];
    const pants = p.kind === 'prom' || p.kind === 'street' ? [0x2b2d42, 0x3d405b, 0xd8cbb0, 0x1d1d1d, 0x6b705c, 0xe9e5dc][Math.floor(RP() * 6)] : clothes[Math.floor(RP() * clothes.length)];
    crowd.color(i, shirt, pants, skin, HAIR[Math.floor(RP() * HAIR.length)], !bare && RP() < 0.4);
    p.point = RP() < 0.25; p.phone = RP() < 0.35; p.sitting = p.kind === 'beach' && !p.lying && p.still && RP() < 0.5;
  });
  const SEA_YAW = Math.PI;   // facing the sea (-z)
  function updatePeople(t, s) {
    const bt = t - T_SHOCK - 0.05;
    people.forEach((p, i) => {
      const v = p.still ? 0 : p.speed;
      const stopU = clamp(t - T_IMPACT - 0.4 * p.r, 0, 1.5);
      const d = v * Math.min(t, T_IMPACT) + v * (stopU - (stopU * stopU) / 3);
      const run = Math.max(0, t - p.runT);
      const stare = smooth(T_IMPACT + 0.3 + p.r * 1.5, T_IMPACT + 1.6 + p.r * 2, t) * (1 - smooth(p.runT - 0.5, p.runT, t));
      let x, z, y, yaw, fade = 1, stride = 0, walk = t * 5.2 * (0.8 + 0.4 * p.r) + i, sit = 0, pitch = 0, armL = 0, armR = 0, look = 0;
      const walkYaw = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (p.kind === 'street') {
        const u = clamp(p.u + p.dir * 0.0015 * Math.min(t, T_IMPACT) + run * 0.012, 0, 1), k = Math.min(Math.floor(u * (street.length - 1)), street.length - 2);
        const f = u * (street.length - 1) - k;
        x = lerp(street[k][0], street[k + 1][0], f) + (p.r - 0.5) * 1.6; z = lerp(street[k][1], street[k + 1][1], f);
        const dx = street[k + 1][0] - street[k][0], dz = street[k + 1][1] - street[k][1];
        yaw = run > 0 ? Math.atan2(dx, dz) : (p.dir > 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz));
        stride = run > 0 ? 1.6 : (t < T_IMPACT ? 1 : 0);
        fade = 1 - clamp((u - 0.92) / 0.08);
      } else if (p.kind === 'water') {
        const out = smooth(p.outT, p.outT + 11, t);
        const off = lerp(p.off, -6 - p.r * 10, out);
        x = p.x + p.dir * 0.3 * Math.min(t, p.outT) + Math.sign(p.x || 1) * 4.2 * run;
        z = shoreZ(x) - off + run * 1.5;
        const swimming = p.swim && out < 0.25 && off > 10;
        yaw = out > 0 && out < 1 ? 0 : (swimming ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : SEA_YAW);
        if (run > 0) yaw = Math.sign(p.x || 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (swimming) { pitch = Math.PI / 2 - 0.15; armL = t * 1.5 + p.r * 6; armR = armL + Math.PI / 1.45; }
        else stride = out > 0 && out < 1 ? 1.1 : run > 0 ? 1.6 : 0;
        if (out >= 1 && run === 0) yaw = SEA_YAW;
        fade = 1 - clamp((run - 5) / 3);
      } else {
        const away = Math.sign(p.x || 1);
        x = p.x + p.dir * d + away * 4.2 * run;
        z = p.kind === 'beach' ? p.z + run * 1.5 : p.z;
        yaw = run > 0 ? Math.atan2(away, 0.35) : walkYaw;
        stride = run > 0 ? 1.6 : (t < T_IMPACT + 0.6 && !p.still ? 1 : 0);
        fade = 1 - clamp((run - 5) / 3);
        if (p.sitting) sit = 1 - smooth(T_IMPACT + 1.5 + p.r, T_IMPACT + 3 + p.r, t);
      }
      if (stare > 0 && run === 0 && !(p.kind === 'water' && t < p.outT + 11)) {
        yaw = lerp(yaw, SEA_YAW + (p.r - 0.5) * 0.6, stare);
        look = 0.25 * stare;
        if (p.point) armR = Math.max(armR, 1.25 * stare * smooth(T_IMPACT + 2, T_IMPACT + 3, t) * (1 - smooth(26, 28, t + p.r * 3)));
        if (p.phone) { armR = Math.max(armR, 1.05 * smooth(T_IMPACT + 4, T_IMPACT + 5, t + p.r)); armL = Math.max(armL, 0.95 * smooth(T_IMPACT + 4, T_IMPACT + 5, t + p.r)); }
      }
      if (run > 0) walk = t * 11 + i;
      // the blast throws people flat on their backs; they get up again after a few seconds
      const down = p.knock && bt > 0 ? smooth(0, 0.25, bt) * (1 - smooth(2.5 + p.r * 2, 4.5 + p.r * 2, bt)) : 0;
      const lyingNow = p.lying ? 1 - smooth(T_IMPACT + 0.8, T_IMPACT + 3 + (i % 5) * 0.4, t) : 0;
      if (lyingNow > 0) { pitch = -lyingNow * Math.PI / 2; sit = Math.max(sit, lyingNow * 0.15); }
      if (down > 0) { pitch = -down * Math.PI / 2 * 0.95; armL = armR = down * 1.6; stride = 0; }
      y = terrainH(x, z) + 0.04 + (lyingNow + down) * 0.12;
      if (p.kind === 'water' && pitch > 1) y = Math.max(y, -0.2 + waterHeight(x, z, s));
      const c = carried(x, z, p.r, s, 0.5);
      if (c) { x = c.x; y = c.y; z = c.z; pitch = c.tumble; armL = armR = 1.6; stride = 0; fade = 1; }
      crowd.pose(i, { x, y, z, yaw, s: p.h * Math.max(fade, 0), walk, stride, sit, pitch, armL, armR, look, roll: c ? c.tumble * 0.6 : 0 });
    });
    crowd.commit();
  }

  // ---------- gulls ----------
  const gulls = [];
  for (let i = 0; i < 20; i++) gulls.push({ cx: (R() - 0.5) * 200, cz: -330 - R() * 200, r: 15 + R() * 30, y: 45 + R() * 30, w: (0.2 + R() * 0.25) * (R() < 0.5 ? -1 : 1), ph: R() * 6 });
  const gullGeo = new THREE.BufferGeometry();
  gullGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.3, -1.0, 0.25, 0.1, 0, 0, 0.3, 0, 0, -0.3, 0, 0, 0.3, 1.0, 0.25, 0.1], 3));
  gullGeo.computeVertexNormals();
  const gullMesh = new THREE.InstancedMesh(gullGeo, patch(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide, roughness: 0.8 })), gulls.length);
  gullMesh.frustumCulled = false;
  scene.add(gullMesh);
  function updateGulls(t) {
    gulls.forEach((g, i) => {
      const a = g.ph + g.w * t, flee = Math.max(0, t - (T_IMPACT + 0.2 + (i % 4) * 0.2));
      dummy.position.set(g.cx + Math.cos(a) * g.r + flee * flee * 4 * Math.sign(g.w), g.y + flee * 3, g.cz + Math.sin(a) * g.r + flee * 12);
      dummy.rotation.set(0, -a + (g.w > 0 ? 0 : Math.PI), Math.sin(t * 2 + i) * 0.2);
      dummy.scale.set(1.5, Math.sin(t * (flee > 0 ? 14 : 6) + g.ph * 3) * 1.3 + 0.2, 1.5);
      if (flee > 7) dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      gullMesh.setMatrixAt(i, dummy.matrix);
    });
    gullMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- boats: harbour, bay, and a cruise ship offshore ----------
  const boats = [];
  for (let i = 0; i < 12; i++) boats.push({ x: 190 + R() * 120, z: -380 - R() * 140, s: 0.8 + R() * 0.6, yaw: R() * 6, r: R(), sail: R() < 0.5 });
  for (let i = 0; i < 10; i++) boats.push({ x: -350 + R() * 500, z: -480 - R() * 700, s: 1 + R() * 1.2, yaw: R() * 6, r: R(), sail: true });
  const hullGeo = mergeGeometries([new THREE.BoxGeometry(2.6, 1.2, 9).translate(0, 0.3, 0), new THREE.CylinderGeometry(0.08, 0.08, 11, 5).translate(0, 6.2, 0.6)]);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.4, 0.7, 0, 11.4, 0.7, 0, 1.4, -3.6], 3));
  sailGeo.computeVertexNormals();
  const boatMesh = new THREE.InstancedMesh(hullGeo, plainMat(0xffffff, 0.6), boats.length);
  boats.forEach((b, i) => boatMesh.setColorAt(i, tmpC.set(b.sail ? [0xf4f1ea, 0xf4f1ea, 0x1d3557, 0xe9e4d8][i % 4] : [0x2a6fb0, 0xf2efe6, 0x2f7d5b, 0xc0392b, 0xf2c14e][i % 5])));
  const cabinMesh = new THREE.InstancedMesh(mergeGeometries([new THREE.BoxGeometry(2.0, 1.4, 3.0).translate(0, 1.6, -0.8), new THREE.BoxGeometry(2.2, 0.15, 3.3).translate(0, 2.35, -0.8)]), plainMat(0xf1eee6, 0.7), boats.length);
  scene.add(shadowy(cabinMesh));
  const sailMesh = new THREE.InstancedMesh(sailGeo, plainMat(0xfaf7f0, 0.9, { side: THREE.DoubleSide }), boats.length);
  scene.add(shadowy(boatMesh), shadowy(sailMesh));
  const ship = new THREE.Group();
  ship.rotation.order = 'YXZ';
  {
    const white = plainMat(0xf7f5f0, 0.6), dark = plainMat(0x1d2a3a, 0.6), glassM = plainMat(0x22303c, 0.25), orange = plainMat(0xe0701c, 0.6);
    const parts = [
      [new THREE.BoxGeometry(32, 10, 210).translate(0, 2, 0), dark],
      [new THREE.CylinderGeometry(1, 16, 30, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1, 0.33, 1).translate(0, 4, 118), dark],
      [new THREE.BoxGeometry(30.5, 4, 214).translate(0, 7.3, 0), white],
      [new THREE.BoxGeometry(30, 16, 180).translate(0, 17, -8), white],
      [new THREE.BoxGeometry(25, 8, 120).translate(0, 29, -16), white],
      [new THREE.BoxGeometry(20, 3.5, 22).translate(0, 34.5, 56), white],
      [new THREE.BoxGeometry(20.4, 1.4, 22.4).translate(0, 35, 56), glassM],
      [new THREE.BoxGeometry(9, 11, 16).translate(0, 38.5, -40), plainMat(0xc23b22, 0.6)],
      [new THREE.BoxGeometry(9.2, 2, 16.2).translate(0, 44, -40), plainMat(0x161616, 0.7)],
      [new THREE.CylinderGeometry(0.4, 0.5, 12, 6).translate(0, 42, 50), white],
    ];
    // balcony/window bands along both sides, lifeboats hung along the promenade deck
    for (let k = 0; k < 6; k++) parts.push([new THREE.BoxGeometry(30.8, 0.9, 176).translate(0, 11 + k * 2.6, -8), glassM]);
    for (let k = 0; k < 3; k++) parts.push([new THREE.BoxGeometry(25.6, 0.8, 116).translate(0, 27 + k * 2.4, -16), glassM]);
    for (let k = 0; k < 9; k++) for (const sx of [-1, 1]) parts.push([new THREE.BoxGeometry(3, 2.6, 10).translate(sx * 16.4, 10.3, -78 + k * 18), orange]);
    for (const [g, m] of parts) ship.add(new THREE.Mesh(g, m));
    ship.position.set(-260, 0, -2100); ship.rotation.y = 1.25;
    ship.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(ship);
  }
  function updateBoats(t, s) {
    boats.forEach((b, i) => {
      const water = waterHeight(b.x, b.z, s) + Math.sin(t * 0.9 + i) * 0.25;
      const bed = terrainH(b.x, b.z) + 0.55, aground = water < bed;
      let x = b.x, y = Math.max(water, bed), z = b.z;
      let rx = aground ? 0.12 : Math.sin(t * 0.7 + i) * 0.05, rz = aground ? 0.7 * (b.r - 0.5) : Math.sin(t * 1.1 + i) * 0.07;
      const c = carried(x, z, b.r, s, 0.75);
      if (c) { x = c.x; y = c.y; z = c.z; rx += c.tumble * 0.6; rz += c.tumble; }
      dummy.position.set(x, y, z); dummy.rotation.set(rx, b.yaw, rz); dummy.scale.setScalar(b.s); dummy.updateMatrix();
      boatMesh.setMatrixAt(i, dummy.matrix);
      const keep = dummy.matrix.clone();
      if (!b.sail) dummy.scale.setScalar(0.0001), dummy.updateMatrix();
      sailMesh.setMatrixAt(i, dummy.matrix);
      if (b.sail) dummy.scale.setScalar(0.0001), dummy.updateMatrix(); else dummy.matrix.copy(keep);
      cabinMesh.setMatrixAt(i, dummy.matrix);
    });
    boatMesh.instanceMatrix.needsUpdate = sailMesh.instanceMatrix.needsUpdate = cabinMesh.instanceMatrix.needsUpdate = true;
    // the cruise ship rides up the face of the wave
    // (rolled hard over, half way up the face, not perched on the crest)
    const c = carried(-260, -2100, 0.2, s, 0.42);
    const w = waterHeight(-260, -2100, s);
    if (c) { const k = clamp(c.tumble / 25); ship.position.set(c.x, c.y - 12 * k, c.z); ship.rotation.set(-0.12 * k, 1.25 + 0.3 * k, 0.15 + 0.75 * k); }
    else { ship.position.set(-260, Math.max(w, terrainH(-260, -2100) + 4) + Math.sin(t * 0.4) * 0.3, -2100); ship.rotation.set(0, 1.25, Math.sin(t * 0.3) * 0.01); }
  }

  // ---------- the terrace: whitewashed wall, bougainvillea, lemonade ----------
  const fg = new THREE.Group();
  fg.position.z = BAL_Z;
  scene.add(fg);
  {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 1.0, 0.36).translate(0, 0.5, 0), plainMat(0xf4f0e8, 0.9)); wall.position.set(0, FLOOR_Y, -0.18);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(6, 0.07, 0.46), plainMat(0xe9e3d8, 0.85)); cap.position.set(0, FLOOR_Y + 1.035, -0.18);
    fg.add(wall, cap);
    const r3 = rng(9);
    // bougainvillea spilling over the left corner of the wall
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.022, 0), plainMat(0x3f6b2a, 0.8, { flatShading: true }), 140);
    const blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.014, 1), plainMat(0xd1287e, 0.6), 190);
    const vinePt = () => {
      const x = -0.42 + Math.pow(r3(), 1.6) * 0.3;
      const hang = r3() < 0.45;
      return hang ? [x, FLOOR_Y + 0.8 + r3() * 0.27, -0.37 - r3() * 0.04] : [x, FLOOR_Y + 1.08 + r3() * 0.16 * (1 - (x + 0.42) / 0.3), -0.18 + (r3() - 0.5) * 0.36];
    };
    for (let i = 0; i < 140; i++) { const [x, y, z] = vinePt(); dummy.position.set(x, y, z); dummy.rotation.set(r3() * 3, r3() * 3, 0); dummy.scale.set(1, 0.6 + r3() * 0.6, 1); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); }
    for (let i = 0; i < 190; i++) { const [x, y, z] = vinePt(); dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.7 + r3() * 0.7); dummy.updateMatrix(); blooms.setMatrixAt(i, dummy.matrix); }
    fg.add(leaves, blooms);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.13, 20), plainMat(0xe8c24a, 0.15, { transparent: true, opacity: 0.85 }));
    glass.position.set(0.235, FLOOR_Y + 1.07 + 0.065, -0.2);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 6), plainMat(0x2a9d8f, 0.5));
    straw.position.set(0.245, FLOOR_Y + 1.07 + 0.15, -0.2); straw.rotation.z = -0.25;
    const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), plainMat(0xf2d64b, 0.5));
    lemon.position.set(0.27, FLOOR_Y + 1.07 + 0.125, -0.2); lemon.rotation.z = 1.2;
    fg.add(glass, straw, lemon);
  }

  // ---------- particles + ocean ----------
  const glassP = makeGlass(R, houses);
  const dust = makeDust(R);
  const spray = makeSpray(R);
  scene.add(glassP.points, dust.points, spray.points);
  const ocean = makeOcean({ CAM_BASE, DIR_I });
  scene.add(ocean.mesh);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x8fa0c0, 0x7a5a40, 0.9);
  const sun = new THREE.DirectionalLight(0xffb878, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -360, right: 360, top: 360, bottom: -360, near: 10, far: 2000 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.target.position.set(0, 0, -170);
  const flashLight = new THREE.DirectionalLight(0xfff0dc, 0);
  flashLight.target.position.copy(CAM_BASE);
  const rockLight = new THREE.DirectionalLight(0xffd8a8, 0);
  rockLight.target.position.copy(CAM_BASE);
  scene.add(hemi, sun, sun.target, flashLight, flashLight.target, rockLight, rockLight.target);

  world.frame = (t, s, ctx) => {
    G.uTime.value = t;
    updateUmbrellas(t, s);
    updatePalms(t, s);
    updateCars(t, s);
    updatePeople(t, s);
    updateGulls(t);
    updateBoats(t, s);
    const mb = Math.max(0, t - T_SHOCK - 0.1);
    millSails.rotation.z = -(t * 0.6 + 9 * (1 - Math.exp(-mb * 0.3)) / 0.3);
    glassP.uniforms.uTime.value = t;
    glassP.uniforms.uSun.value = ctx.sunVis;
    dust.uniforms.uTime.value = t;
    spray.uniforms.uTime.value = t;
    spray.uniforms.uWaveF.value = s.waveF;
    spray.uniforms.uWaveH.value = s.waveH;
    spray.uniforms.uLip.value = s.lip;
    spray.uniforms.uOn.value = s.waveOn;
    ocean.frame(t, s, ctx);
    sun.position.copy(ctx.sunDir).multiplyScalar(900).add(sun.target.position);
    sun.intensity = 2.8 * ctx.sunVis * (1 - 0.4 * s.haze);
    hemi.intensity = 0.95 * (1 - 0.3 * s.haze) * (0.35 + 0.65 * ctx.sunVis) + s.impactLight * 0.05;
    flashLight.position.copy(ctx.impactDir).multiplyScalar(500).add(CAM_BASE);
    flashLight.intensity = s.impactLight * 0.8;
    rockLight.position.copy(ctx.rockDir).multiplyScalar(500).add(CAM_BASE);
    rockLight.intensity = s.rockGlow * 2.5;
    scene.fog.color.copy(ctx.fogColor);
    scene.fog.density = 0.00011 + s.haze * 0.00008;
  };
  return world;
}

function makeDust(R) {
  const N = 2400;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = (R() - 0.5) * 600, z = shoreZ(x) + (R() < 0.5 ? 4 + R() * 26 : 40 + R() * 180);
    p0.set([x, terrainH(x, z) + 0.4, z], i * 3);
    prm.set([T_SHOCK + 0.05 + R() * 0.6, 2 + R() * 4, R() * 6.28, 1.5 + R() * 3.5], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const uniforms = { uTime: { value: 0 }, uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) } };
  const mat = pointsMat(uniforms, `
    uniform float uTime; uniform float uScale; attribute vec4 aPrm; varying float vA; varying vec3 vC;
    void main(){
      float dt = uTime - aPrm.x;
      if (dt <= 0.0 || dt > 14.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      vec3 p = position + vec3(sin(aPrm.z) * 2.0 * dt, aPrm.y * (1.0 - exp(-dt * 0.5)) * 3.0, 9.0 * (1.0 - exp(-dt * 0.4)) * 3.0);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aPrm.w * (1.0 + dt * 0.6) * uScale / -mv.z, 1.0, 160.0);
      vA = 0.022 * smoothstep(0.0, 0.4, dt) * (1.0 - smoothstep(6.0, 14.0, dt));
      vC = vec3(0.75, 0.62, 0.48);
      #include <logdepthbuf_vertex>
    }`, `gl_FragColor = vec4(vC * a * vA, 1.0);`);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

function pointsMat(uniforms, vert, fragColor, additive = true) {
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      ${vert}`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      varying float vA; varying vec3 vC;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 10.0);
        ${fragColor}
      }`,
  });
}

function makeGlass(R, B) {
  // window glass blown out of every facade facing the avenue or the sea
  const N = 9000;
  const p0 = new Float32Array(N * 3), v0 = new Float32Array(N * 3), prm = new Float32Array(N * 2);
  const near = B.filter((b) => b.row <= 2);
  for (let i = 0; i < N; i++) {
    const b = near[Math.floor(R() * near.length)];
    let x, z, nx = 0, nz = 0;
    if (R() < 0.6) { const face = b.x > 0 ? -1 : 1; x = b.x + face * (b.w / 2 + 0.05); z = b.z + (R() - 0.5) * b.d; nx = face; }
    else { x = b.x + (R() - 0.5) * b.w; z = b.z + b.d / 2 + 0.05; nz = 1; }
    const y = (b.y0 || 0) + 2 + R() * (b.h - (b.y0 || 0) - 2);
    p0.set([x, y, z], i * 3);
    v0.set([nx * (1 + R() * 5) + (R() - 0.5) * 2, R() * 4, nz * (1 + R() * 5) + 3 + R() * 6], i * 3);
    prm.set([T_SHOCK + 0.02 + R() * 0.25, R() * 6.28], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aV', new THREE.BufferAttribute(v0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 2));
  const uniforms = { uTime: { value: 0 }, uSun: { value: 1 } };
  const mat = pointsMat(uniforms, `
    uniform float uTime; uniform float uSun; attribute vec3 aV; attribute vec2 aPrm; varying float vA; varying vec3 vC;
    void main(){
      float dt = uTime - aPrm.x;
      vec3 p = position + aV * dt + vec3(0.0, -4.9, 0.0) * dt * dt;
      if (dt <= 0.0 || p.y < 1.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(40.0 / -mv.z, 1.2, 4.0);
      float glint = pow(0.5 + 0.5 * sin(uTime * 31.0 + aPrm.y * 9.0), 6.0);
      vA = (0.25 + 2.5 * glint * uSun);
      vC = vec3(0.9, 0.95, 1.0);
      #include <logdepthbuf_vertex>
    }`, `gl_FragColor = vec4(vC * a * vA, 1.0);`);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

function makeSpray(R) {
  // mist torn off the crest of the wave
  const N = 7000;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    p0.set([(R() - 0.5) * 2400, R(), R()], i * 3);       // lateral offset, height fraction, depth fraction
    prm.set([R(), 0.5 + R() * 0.8, 3 + R() * 9, R() * 6.28], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const uniforms = {
    uTime: { value: 0 }, uWaveF: { value: 1e5 }, uWaveH: { value: 0 }, uLip: { value: 0 }, uOn: { value: 0 },
    uDir: { value: new THREE.Vector2(DIR_I.x, DIR_I.y) }, uCam: { value: new THREE.Vector2(CAM_BASE.x, CAM_BASE.z) },
    uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) },
  };
  const mat = pointsMat(uniforms, `
    uniform float uTime; uniform float uWaveF; uniform float uWaveH; uniform float uLip; uniform float uOn;
    uniform vec2 uDir; uniform vec2 uCam; uniform float uScale;
    attribute vec4 aPrm; varying float vA; varying vec3 vC;
    void main(){
      if (uOn < 0.5) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float life = mod(uTime * aPrm.y + aPrm.x, 1.0);
      vec2 perp = vec2(-uDir.y, uDir.x);
      float u = uWaveF - uLip * uWaveH * 0.35 + life * (20.0 + 30.0 * position.z);
      vec2 xz = uCam + uDir * u + perp * position.x;
      float y = uWaveH * (0.82 + 0.12 * position.y) + life * aPrm.z * 2.0;
      vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
      gl_Position = projectionMatrix * mv;
      float size = 4.0 + 10.0 * life;
      gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 220.0);
      vA = 0.11 * sin(3.14159 * life) * smoothstep(40.0, 100.0, uWaveH);
      vC = vec3(0.95, 0.9, 0.85);
      #include <logdepthbuf_vertex>
    }`, `gl_FragColor = vec4(vC * a * vA, 1.0);`);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

