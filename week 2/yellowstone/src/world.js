// A lake town 60 miles south of Yellowstone on a summer afternoon -> the eruption -> ash -> the hot ash cloud.
// View from a chalet balcony over the town, the lake and a low ridge with the ash column rising behind it.
// Everything is a pure function of time so any frame can be rendered independently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WIDE } from './wide.js';
import { G, patch } from './bend.js';
import { SKY_COMMON } from './sky.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { gridBrown, gridOffT, GRID } from './timeline.js';
import { makeFlow } from './flow.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';

// ---------- terrain ----------
const LAKE = { cx: 0, cz: -1050, rx: 1000, rz: 650 };
export const lakeD = (x, z) => Math.hypot((x - LAKE.cx) / LAKE.rx, (z - LAKE.cz) / LAKE.rz);
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
const fbm = (x, z, o = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 13.1, z * f); f *= 2.03; a *= 0.5; } return s; };
const ridged = (x, z, o = 6) => {
  let s = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < o; i++) { let n = 1 - Math.abs(vnoise(x * f + i * 7.7, z * f) * 2 - 1); n = n * n * w; w = clamp(n * 1.7); s += a * n; f *= 2.07; a *= 0.5; }
  return s;
};
export function terrainH(x, z) {
  const d = lakeD(x, z);
  const shore = smooth(0.97, 1.1, d);
  const side = smooth(150, 1000, Math.abs(x));
  let land = 1.5 + 7 * smooth(1.0, 1.4, d);
  land += 140 * smooth(1.1, 2.4, d) * side;                       // hills either side of the lake
  land += 38 * smooth(-430, -10, z) * (1 - side * 0.7) + Math.max(0, z) * 0.6;   // the village hillside
  const far = smooth(1.15, 2.7, d) * smooth(500, 1400, Math.hypot(x, z + 200));   // no peaks on the village side
  const saddle = 0.22 + 0.78 * smooth(450, 2600, Math.abs(x - 250));
  let mtn = Math.pow(ridged(x / 1900 + 7.3, z / 1900 + 2.1), 1.1) * 2000 * far * saddle;
  mtn += fbm(x / 380, z / 380, 4) * 110 * far;
  land += mtn;
  land += (fbm(x / 90, z / 90, 3) - 0.5) * 5 * shore;
  // an alpine pasture shelf just below the chalet: gentle enough to see people on it over the railing,
  // with its far edge dropping out of sight to the village
  if (z > -20 && z < 74) {
    const shelf = 74.3 + 0.214 * z + (fbm(x / 40, z / 40, 3) - 0.5) * 1.6;
    land = lerp(land, Math.max(land, shelf), smooth(-20, 22, z) * (1 - smooth(90, 200, Math.abs(x))));
  }
  return lerp(-7 + fbm(x / 200, z / 200, 2) * 2, land, shore);
}
export const SHELF = (z) => 74.3 + 0.214 * z;
const BAL_Z = 110;
const FLOOR_Y = terrainH(0, BAL_Z) + 4;
export const CAM_BASE = new THREE.Vector3(0, FLOOR_Y + 1.68, BAL_Z + 0.75);

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

function prismGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5,
  ], 3));
  g.computeVertexNormals();
  return g;
}
// flat ribbon (roads, paths) draped on the terrain
function ribbonGeo(pts, width, lift = 0.15) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    for (const s of [-1, 1]) {
      const x = pts[i][0] + nx * s * width / 2, z = pts[i][1] + nz * s * width / 2;
      pos.push(x, terrainH(x, z) + lift, z);
    }
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const roadPt = (th, off = 1.05) => [LAKE.cx + off * LAKE.rx * Math.cos(th), LAKE.cz + off * LAKE.rz * Math.sin(th)];

export function makeWorld(scene) {
  const R = rng(777);
  const world = {};
  const buildingMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 }), { windows: true });
  const plainMat = (color, rough = 0.9, extra = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; return m; };

  // ---------- terrain mesh: radial grid around the camera, dense near, sparse far ----------
  {
    const rings = 250, segs = 320, r0 = 3, r1 = 14000, a0 = -105 * DEG, a1 = 105 * DEG;
    const pos = new Float32Array((rings + 1) * (segs + 1) * 3), col = new Float32Array(pos.length);
    const grass1 = new THREE.Color(0x3f5f22), grass2 = new THREE.Color(0x5c7029), forest = new THREE.Color(0x26381a), grassLush = new THREE.Color(0x335a1c), grassDry = new THREE.Color(0x77803a);
    const rock = new THREE.Color(0x6b665f), rock2 = new THREE.Color(0x4f4c48), snowC = new THREE.Color(0xeef2f7), pebble = new THREE.Color(0x8a8070), bed = new THREE.Color(0x2b2e24);
    let k = 0;
    for (let i = 0; i <= rings; i++) {
      const r = r0 * Math.pow(r1 / r0, i / rings);
      for (let j = 0; j <= segs; j++, k++) {
        const a = lerp(a0, a1, j / segs);
        const x = CAM_BASE.x + Math.sin(a) * r, z = CAM_BASE.z - Math.cos(a) * r;
        const h = terrainH(x, z);
        const e = Math.max(r * 0.004, 1.5);
        const slope = Math.hypot(terrainH(x + e, z) - h, terrainH(x, z + e) - h) / e;
        pos.set([x, h, z], k * 3);
        const n = fbm(x / 60, z / 60, 3);
        if (h < -0.5) tmpC.copy(bed);
        else if (h < 2.2) tmpC.copy(pebble).lerp(grass1, smooth(1.2, 2.2, h));
        else {
          tmpC.copy(grass1).lerp(grass2, n);
          const fine = fbm(x / 9, z / 9, 3);
          tmpC.lerp(fine > 0.55 ? grassLush : grassDry, Math.abs(fine - 0.5) * 1.2);
        }
        if (h > 6 && fbm(x / 320, z / 320, 3) > 0.47) tmpC.lerp(forest, 0.7);
        const rocky = Math.max(smooth(0.7, 1.15, slope), smooth(650, 900, h + n * 120));
        tmpC.lerp(n > 0.5 ? rock : rock2, rocky);
        const snowLine = 1000 + (fbm(x / 500, z / 500, 3) - 0.5) * 300;
        tmpC.lerp(snowC, smooth(snowLine, snowLine + 80, h) * (1 - 0.5 * smooth(1.2, 1.8, slope)));
        col.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
      }
    }
    const idx = [];
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, plainMat(0xffffff, 0.95, { vertexColors: true, flatShading: true }));
    shadowy(terrain, false, true);
    scene.add(terrain);
  }

  // ---------- roads ----------
  const asphalt = plainMat(0x3a3b3e, 0.95);
  const roadPts = [];
  for (let i = 0; i <= 720; i++) roadPts.push(roadPt((i / 720) * Math.PI * 2));
  scene.add(shadowy(new THREE.Mesh(ribbonGeo(roadPts, 7.5), asphalt), false, true));
  const street = [];
  for (let i = 0; i <= 60; i++) { const u = i / 60; street.push([Math.sin(u * 5.2) * 38 - u * 30, -40 - u * 322]); }
  scene.add(shadowy(new THREE.Mesh(ribbonGeo(street, 5), plainMat(0x55524d, 0.95)), false, true));
  const nearStreet = (x, z) => street.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 9);

  // ---------- pier ----------
  {
    const px = -70, z0 = -392, z1 = -470;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, z0 - z1), plainMat(0x6b5034, 0.9));
    deck.position.set(px, 1.0, (z0 + z1) / 2);
    scene.add(shadowy(deck));
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), plainMat(0x4a3826, 0.9), 26);
    for (let i = 0; i < 13; i++) for (const s of [-1, 1]) {
      dummy.position.set(px + s * 1.4, -1.5, z0 - i * 6); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      posts.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), dummy.matrix);
    }
    scene.add(shadowy(posts));
  }

  // ---------- village houses ----------
  const houses = [];
  const wallPal = [0xf1ebe0, 0xe8dcc4, 0xf4f1ea, 0xdcc9a6, 0xe9e3d8, 0xcfc4b4, 0xe4d2b8];
  const roofPal = [0x6e2b20, 0x5a3a29, 0x45484f, 0x7a3a24, 0x3e3a36];
  // a house on a slope: the box starts below its lowest corner (a stone plinth shows on the downhill side),
  // the ground floor sits on the highest corner, and the eaves are a full house-height above that
  const addHouse = (x, z, w, d, h, yaw, big = false) => {
    let lo = Infinity, hi = -Infinity;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const lx = a * w / 2, lz = b * d / 2;
      const hh = terrainH(x + lx * c + lz * sn, z - lx * sn + lz * c);
      lo = Math.min(lo, hh); hi = Math.max(hi, hh);
    }
    const y0 = lo - 0.6;
    houses.push({ x, z, w, d, y0, ground: hi - y0, h: hi + h - y0, yaw, roofH: w * (big ? 0.3 : 0.42), wall: wallPal[Math.floor(R() * wallPal.length)], roof: roofPal[Math.floor(R() * roofPal.length)], seed: R(), chim: R() < 0.8 });
  };
  for (let gx = -320; gx <= 320; gx += 24) for (let gz = -62; gz >= -372; gz -= 23) {
    if (R() < 0.3) continue;
    const x = gx + (R() - 0.5) * 12, z = gz + (R() - 0.5) * 10;
    if (nearStreet(x, z) || Math.hypot(x - 70, z - 215) < 26 || lakeD(x, z) < 1.075 || Math.hypot(x, z) < 40) continue;
    addHouse(x, z, 8 + R() * 5, 8 + R() * 4, 5.5 + R() * 3.5, (R() - 0.5) * 0.3);
  }
  for (let i = 0; i < 70; i++) {     // houses along the far shores
    const th = (R() < 0.5 ? 0.2 + R() * 0.9 : Math.PI - 0.2 - R() * 0.9) * (R() < 0.75 ? 1 : -1);
    const [x, z] = roadPt(th, 1.13 + R() * 0.12);
    if (z > -380) continue;
    addHouse(x, z, 8 + R() * 6, 8 + R() * 5, 6 + R() * 4, (R() - 0.5) * 0.4);
  }
  addHouse(-150, -365, 34, 16, 13, 0, true);      // lakeside hotel
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const seeds = new Float32Array(houses.length), grounds = new Float32Array(houses.length);
  houses.forEach((hs, i) => { seeds[i] = hs.seed; grounds[i] = hs.ground; });
  bodyGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  bodyGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(grounds, 1));
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, buildingMat, houses.length);
  const roofMesh = new THREE.InstancedMesh(prismGeo(), plainMat(0xffffff, 0.8, { side: THREE.DoubleSide, flatShading: true }), houses.length);
  const chimneys = [];
  houses.forEach((hs, i) => {
    dummy.position.set(hs.x, hs.y0, hs.z); dummy.rotation.set(0, hs.yaw, 0); dummy.scale.set(hs.w, hs.h, hs.d); dummy.updateMatrix();
    bodyMesh.setMatrixAt(i, dummy.matrix); bodyMesh.setColorAt(i, tmpC.set(hs.wall));
    dummy.position.set(hs.x, hs.y0 + hs.h, hs.z); dummy.scale.set(hs.w * 1.16, hs.roofH, hs.d * 1.12); dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix); roofMesh.setColorAt(i, tmpC.set(hs.roof));
    if (hs.chim) {
      const off = (R() - 0.5) * hs.d * 0.5, side = hs.w * 0.18;
      const cx = hs.x + Math.cos(hs.yaw) * side + Math.sin(hs.yaw) * off, cz = hs.z - Math.sin(hs.yaw) * side + Math.cos(hs.yaw) * off;
      chimneys.push([cx, hs.y0 + hs.h + hs.roofH * 0.62, cz, R()]);
    }
  });
  scene.add(shadowy(bodyMesh), shadowy(roofMesh));
  const chimMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 2.2, 0.8).translate(0, 0.6, 0), plainMat(0x7a6e66, 0.9), chimneys.length);
  chimneys.forEach((c, i) => { dummy.position.set(c[0], c[1], c[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); chimMesh.setMatrixAt(i, dummy.matrix); });
  scene.add(shadowy(chimMesh));
  const caveIns = houses.map((hs, i) => ({ hs, i })).filter(({ hs }) => hs.z < -60 && hs.z > -200 && Math.abs(hs.x + 20) < 110 && !hs.chim)
    .sort((a, b) => (b.hs.z - a.hs.z) || (a.hs.x - b.hs.x)).filter((_, k) => k % 2 === 0).slice(0, 10);
  caveIns.forEach((c, k) => { c.t0 = 53.3 + k * 0.52 + (c.hs.seed - 0.5) * 0.3; c.tilt = c.hs.seed < 0.5 ? -1 : 1; });
  function updateCaveIns(t) {
    for (const { hs, i, t0, tilt } of caveIns) {
      const k = smooth(t0, t0 + 0.9, t);
      const h = hs.h * (1 - 0.6 * k);
      dummy.position.set(hs.x, hs.y0, hs.z); dummy.rotation.set(0, hs.yaw, 0); dummy.scale.set(hs.w, h, hs.d); dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(hs.x, hs.y0 + h - hs.roofH * 0.55 * k, hs.z); dummy.rotation.set(0.25 * k * tilt, hs.yaw, 0.3 * k * tilt);
      dummy.scale.set(hs.w * 1.16 * (1 - 0.1 * k), hs.roofH * (1 - 0.7 * k), hs.d * 1.12); dummy.updateMatrix();
      roofMesh.setMatrixAt(i, dummy.matrix);
    }
    bodyMesh.instanceMatrix.needsUpdate = roofMesh.instanceMatrix.needsUpdate = true;
  }
  // church with a steeple
  {
    const y = terrainH(70, -215) - 1;
    const wall = plainMat(0xf3efe6, 0.85), roofM = plainMat(0x3f3a37, 0.8, { flatShading: true });
    const nave = new THREE.Mesh(new THREE.BoxGeometry(11, 10, 22).translate(0, 5, 0), wall);
    nave.position.set(70, y, -215);
    const nroof = new THREE.Mesh(prismGeo(), roofM); nroof.scale.set(12.5, 5, 23); nroof.position.set(70, y + 10, -215);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5.5, 24, 5.5).translate(0, 12, 0), wall); tower.position.set(70, y, -201);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.2, 14, 4).translate(0, 7, 0), plainMat(0x2f4a45, 0.6, { flatShading: true }));
    spire.rotation.y = Math.PI / 4; spire.position.set(70, y + 24, -201);
    const belfry = new THREE.Mesh(new THREE.BoxGeometry(5.7, 2.2, 5.7), plainMat(0x1d1c1c, 0.9)); belfry.position.set(70, y + 20, -201);
    for (const m of [nave, nroof, tower, spire, belfry]) scene.add(shadowy(m));
  }

  // ---------- pines (thousands) + village trees ----------
  const pineGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.22, 0.32, 2.2, 5).translate(0, 1.1, 0),
    new THREE.ConeGeometry(2.4, 4.2, 7).translate(0, 3.6, 0),
    new THREE.ConeGeometry(1.8, 3.6, 7).translate(0, 5.6, 0),
    new THREE.ConeGeometry(1.15, 3.0, 7).translate(0, 7.5, 0),
  ]);
  const pineMat = plainMat(0xffffff, 0.9, { flatShading: true });
  const nearPines = [], farPines = [];
  for (let n = 0; n < 60000 && nearPines.length + farPines.length < 11000; n++) {
    const x = (R() - 0.5) * 8000, z = 40 - R() * 6500;
    const d = lakeD(x, z);
    if (d < 1.06 || (Math.abs(x) < 340 && z > -400 && z < -40) || z > BAL_Z - 12 || (Math.abs(x) < 45 && z > -40)) continue;
    const h = terrainH(x, z);
    if (h > 950 + (fbm(x / 500, z / 500, 2) - 0.5) * 250) continue;
    const e = 6, slope = Math.hypot(terrainH(x + e, z) - h, terrainH(x, z + e) - h) / e;
    if (slope > 1.1) continue;
    if (fbm(x / 320, z / 320, 3) < 0.44 && R() > 0.08) continue;
    const s = 0.75 + R() * 0.9;
    (Math.hypot(x, z) < 700 ? nearPines : farPines).push([x, h - 0.3, z, s, R()]);
  }
  for (const [list, cast] of [[nearPines, true], [farPines, false]]) {
    const m = new THREE.InstancedMesh(pineGeo, pineMat, list.length);
    list.forEach(([x, y, z, s, r], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, r * 6, 0); dummy.scale.set(s, s * (0.9 + r * 0.4), s); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, tmpC.setHSL(0.3 + r * 0.06, 0.38, 0.13 + r * 0.07));
    });
    scene.add(shadowy(m, cast, true));
  }
  {
    const crown = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.3, 3, 5).translate(0, 1.5, 0).toNonIndexed(), new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.6, 0)]);
    const list = [];
    for (let n = 0; n < 2000 && list.length < 170; n++) {
      const x = (R() - 0.5) * 660, z = -45 - R() * 340;
      if (lakeD(x, z) < 1.07 || nearStreet(x, z) || houses.some((hs) => Math.abs(hs.x - x) < hs.w * 0.7 && Math.abs(hs.z - z) < hs.d * 0.7)) continue;
      list.push([x, terrainH(x, z) - 0.2, z, 0.7 + R() * 0.6, R()]);
    }
    const m = new THREE.InstancedMesh(crown, plainMat(0xffffff, 0.85, { flatShading: true }), list.length);
    list.forEach(([x, y, z, s, r], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, r * 6, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, tmpC.setHSL(0.2 + r * 0.1, 0.45, 0.22 + r * 0.1));
    });
    scene.add(shadowy(m));
  }

  // ---------- streetlamps ----------
  const lamps = [];
  for (let th = 0.08 * Math.PI; th < 0.92 * Math.PI; th += 0.035) { const [x, z] = roadPt(th, 1.035); lamps.push([x, z, R(), R()]); }
  for (let i = 4; i < street.length; i += 6) lamps.push([street[i][0] + 3.5, street[i][1], R(), R()]);
  const lampPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 5, 6).translate(0, 2.5, 0), plainMat(0x2a2b2e, 0.6), lamps.length);
  const lampBulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8).translate(0, 5.1, 0), glowMat(new THREE.Color(9, 6.3, 3.2)), lamps.length);
  lamps.forEach(([x, z], i) => { dummy.position.set(x, terrainH(x, z), z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); lampPole.setMatrixAt(i, dummy.matrix); });
  scene.add(shadowy(lampPole)); lampBulb.frustumCulled = false; scene.add(lampBulb);
  function updateLamps(t) {
    lamps.forEach(([x, z, on, off], i) => {
      const onT = 37.4 + on * 1.4, offT = gridOffT(x, z) + off * 0.3;   // the grid goes down section by section
      const fl = Math.sin(t * 90 + i * 7) > 0 ? 1 : 0;
      const lit = t < onT ? 0 : t < onT + 0.3 ? fl : t < offT - 0.5 ? (gridBrown(t) > 0.62 ? 1 : 0) : t < offT ? fl : 0;
      dummy.position.set(x, terrainH(x, z), z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(lit ? 1 : 0.0001); dummy.updateMatrix();
      lampBulb.setMatrixAt(i, dummy.matrix);
    });
    lampBulb.instanceMatrix.needsUpdate = true;
  }

  // ---------- cars on the lakeside road ----------
  const cars = [];
  for (let i = 0; i < 26; i++) cars.push({ th0: 0.1 * Math.PI + R() * 0.8 * Math.PI, dir: R() < 0.5 ? 1 : -1, sp: 9 + R() * 5, on: 37.2 + R() * 1.6, off: 200 + R() * 8, c: [0xb8b8b8, 0x1e1e22, 0xe0ddd5, 0x8a1c1c, 0x1d3557, 0x2f4f3f, 0x6d6d73, 0xc9a227][Math.floor(R() * 8)] });
  const fleet = makeFleet(scene, cars.length, { plainMat, glowMat, shadowy, headColor: new THREE.Color(5, 4.6, 3.8), tailColor: new THREE.Color(3.5, 0.18, 0.12) });
  cars.forEach((c, i) => fleet.color(i, c.c, [0, 1, 0, 2, 1, 3, 0, 2][i % 8]));
  // speed (fraction of cruising speed) over story time, integrated once into a table per car
  const RS = rng(515);
  cars.forEach((c) => {
    c.stall = 45.5 + RS() * 6;
    const sp = (t) => (t < 25 ? 1 : t < 31 ? 1 - smooth(25, 31, t) : t < 33.5 ? 0 : smooth(33.5, 35.5, t) * 1.5 * (1 - smooth(c.stall, c.stall + 2.5, t)));
    c.tab = new Float32Array(1801);
    for (let k = 1; k <= 1800; k++) c.tab[k] = c.tab[k - 1] + sp((k - 0.5) * 0.05) * 0.05;
  });
  const travelOf = (c, t) => { const u = clamp(t / 0.05, 0, 1799.999), k = Math.floor(u); return c.tab[k] + (c.tab[k + 1] - c.tab[k]) * (u - k); };
  function updateCars(t) {
    const RAD = 0.5 * (LAKE.rx + LAKE.rz) * 1.05;
    const span = 0.84 * Math.PI, base = 0.08 * Math.PI;
    cars.forEach((c, i) => {
      let th = c.th0 + (c.dir * c.sp * travelOf(c, t)) / RAD;
      th = base + ((((th - base) % span) + span) % span);
      const off = c.dir > 0 ? 1.044 : 1.056;
      const [x, z] = roadPt(th, off);
      const [x2, z2] = roadPt(th + 0.001 * c.dir, off);
      const yaw = Math.atan2(-(x2 - x), -(z2 - z));
      const fade = Math.min(clamp((th - base) / 0.03), clamp((base + span - th) / 0.03));
      dummy.position.set(x, terrainH(x, z) + 0.15, z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(Math.max(fade, 0.0001)); dummy.updateMatrix();
      fleet.set(i, dummy.matrix, t > c.on && t < c.off);
    });
    fleet.commit();
  }

  const streetCars = [];
  { const RC = rng(808); for (let i = 0; i < 9; i++) streetCars.push({ u0: i / 9 + RC() * 0.05, dir: i % 2 ? 1 : -1, sp: 0.016 + RC() * 0.005, stall: 45.8 + RC() * 4.5, c: [0xb8b8b8, 0x8a1c1c, 0xe0ddd5, 0x1d3557, 0x1e1e22, 0xc9a227][i % 6] }); }
  const fleet2 = makeFleet(scene, streetCars.length, { plainMat, glowMat, shadowy, headColor: new THREE.Color(5, 4.6, 3.8), tailColor: new THREE.Color(3.5, 0.18, 0.12) });
  streetCars.forEach((c, i) => {
    fleet2.color(i, c.c, [0, 2, 1, 0, 3, 2][i % 6]);
    const sp = (t) => (t < 25 ? 1 : t < 31 ? 1 - smooth(25, 31, t) : t < 33.5 ? 0 : smooth(33.5, 35.5, t) * 1.5 * (1 - smooth(c.stall, c.stall + 2.2, t)));
    c.tab = new Float32Array(1801);
    for (let k = 1; k <= 1800; k++) c.tab[k] = c.tab[k - 1] + sp((k - 0.5) * 0.05) * 0.05;
  });
  const streetAt = (u) => {
    const v = clamp(u, 0, 1) * (street.length - 1), k = Math.min(Math.floor(v), street.length - 2), f = v - k;
    const a = street[k], b = street[k + 1];
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), Math.atan2(b[0] - a[0], b[1] - a[1])];
  };
  // headlight and taillight glows: the lamps themselves are under a pixel from the balcony
  const glowGeo = new THREE.BufferGeometry();
  const glowPos = new Float32Array(streetCars.length * 2 * 3), glowCol = new Float32Array(streetCars.length * 2 * 3);
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowGeo.setAttribute('aCol', new THREE.BufferAttribute(glowCol, 3));
  const glowPts = new THREE.Points(glowGeo, pointsMaterial(`attribute vec3 aCol; varying vec3 vC;
    void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = dot(aCol, vec3(1.0)) > 0.0 ? clamp(4200.0 / -mv.z, 5.0, 30.0) : 0.0;
      #include <logdepthbuf_vertex>
    }`, `varying vec3 vC;`, `vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 14.0); gl_FragColor = vec4(vC * a, 1.0);`));
  glowPts.frustumCulled = false;
  scene.add(glowPts);
  function updateStreetCars(t) {
    streetCars.forEach((c, i) => {
      let u = c.u0 + c.dir * c.sp * travelOf(c, t);
      u = ((u % 1) + 1) % 1;
      const [x, z, ang] = streetAt(u);
      const side = c.dir > 0 ? 1.3 : -1.3;
      const px = x + Math.cos(ang) * side, pz = z - Math.sin(ang) * side;
      const fade = Math.min(clamp(u / 0.03), clamp((1 - u) / 0.03));
      dummy.position.set(px, terrainH(px, pz) + 0.15, pz); dummy.rotation.set(0, ang + (c.dir > 0 ? 0 : Math.PI), 0); dummy.scale.setScalar(Math.max(fade, 0.0001)); dummy.updateMatrix();
      const lit = t > 37.2 + i * 0.15;
      fleet2.set(i, dummy.matrix, lit);
      const yaw = ang + (c.dir > 0 ? 0 : Math.PI), fx = Math.sin(yaw), fz = Math.cos(yaw), y = terrainH(px, pz) + 0.8;
      glowPos.set([px + fx * 2.3, y, pz + fz * 2.3, px - fx * 2.3, y, pz - fz * 2.3], i * 6);
      const k = lit ? fade : 0;
      glowCol.set([5.0 * k, 4.8 * k, 4.4 * k, 3.6 * k, 0.15 * k, 0.08 * k], i * 6);
    });
    fleet2.commit();
    glowGeo.attributes.position.needsUpdate = glowGeo.attributes.aCol.needsUpdate = true;
  }

  // ---------- people: promenade, pier, village street, and a busy meadow just below the balcony ----------
  // Before the light runs out it is an ordinary afternoon: strollers, a picnic, kids chasing each other,
  // hikers coming down the path. At the blackout everyone stops and looks up; phone screens come on;
  // then, one by one, they head home.
  const people = [];
  for (let i = 0; i < 120; i++) people.push({ kind: 'prom', th: 0.15 * Math.PI + R() * 0.7 * Math.PI, dir: R() < 0.5 ? 1 : -1, sp: 0.8 + R() * 0.6, still: R() < 0.35 });
  for (let i = 0; i < 16; i++) people.push({ kind: 'pier', x: -70 + (R() - 0.5) * 2, z: -398 - R() * 68, still: true });
  for (let i = 0; i < 40; i++) people.push({ kind: 'street', u: R(), dir: R() < 0.5 ? 1 : -1, sp: 0.004 + R() * 0.003, still: R() < 0.3 });
  people.forEach((p) => { p.leaveT = 33 + R() * 11; p.phone = R() < 0.6; p.h = 0.9 + R() * 0.2; p.r = R(); });
  const clothes = [0x2b2d42, 0x8d99ae, 0xef233c, 0xedf2f4, 0x3a5a40, 0xd4a373, 0x264653, 0xe9c46a, 0x6d597a, 0x1d1d1d, 0xff9f1c, 0x48cae4];
  people.forEach(() => R());
  const RM = rng(4242);
  // the meadow: a picnic family, kids playing tag, hikers on the path, an old couple on a bench
  const PICNIC = [-6, 50], BENCH = [-15, 66];
  const meadowPath = [];
  for (let i = 0; i <= 40; i++) { const u = i / 40; meadowPath.push([lerp(16, -34, u) + Math.sin(u * 3.4) * 9, lerp(80, 12, u)]); }
  for (const [dx, dz, yaw] of [[-1.0, 0.4, 2.2], [0.9, -0.3, -1.2], [0.2, 0.9, 0.3]]) people.push({ kind: 'sit', x: PICNIC[0] + dx, z: PICNIC[1] + dz, yaw, h: 1.0, adult: true });
  for (let k = 0; k < 3; k++) people.push({ kind: 'kid', k, h: 0.58 + RM() * 0.1 });
  for (const dx of [-0.35, 0.35]) people.push({ kind: 'bench', x: BENCH[0] + dx * Math.cos(2.9), z: BENCH[1] - dx * Math.sin(2.9), yaw: 2.9, h: 0.97 });
  for (let k = 0; k < 7; k++) people.push({ kind: 'hiker', u0: 0.02 - k * 0.13 - RM() * 0.05, sp: 0.017 + RM() * 0.004, h: 0.92 + RM() * 0.15, pack: RM() < 0.7 });
  people.forEach((p) => { if (p.r === undefined) { p.r = RM(); p.leaveT = 33.5 + RM() * 6; p.phone = RM() < 0.7; } });
  const crowd = makeCrowd(scene, people.length, plainMat(0xffffff, 0.85));
  people.forEach((p, i) => {
    const skin = SKIN[Math.floor(RM() * SKIN.length)];
    const shirt = p.kind === 'hiker' ? [0xd62828, 0x1d3557, 0xf77f00, 0x2a9d8f, 0x6a4c93][Math.floor(RM() * 5)] : clothes[Math.floor(RM() * clothes.length)];
    crowd.color(i, shirt, [0x2b2d42, 0x3d405b, 0x6b705c, 0x1d1d1d, 0x5c4a3a, 0x284b63][Math.floor(RM() * 6)], skin, HAIR[Math.floor(RM() * HAIR.length)], RM() < 0.6);
  });
  // a backpack for the hikers, a picnic blanket and basket, the bench
  const packs = people.map((p, i) => (p.kind === 'hiker' && p.pack ? i : -1)).filter((i) => i >= 0);
  const packMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.45, 0.2).translate(0, 1.18, -0.2), plainMat(0xffffff, 0.8), packs.length);
  packs.forEach((_, k) => packMesh.setColorAt(k, tmpC.set([0xf4a261, 0x264653, 0xe76f51, 0x2a9d8f][k % 4])));
  scene.add(shadowy(packMesh));
  {
    const y = terrainH(PICNIC[0], PICNIC[1]);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.03, 2.0), plainMat(0xc0392b, 0.95)); blanket.position.set(PICNIC[0], y + 0.03, PICNIC[1]); blanket.rotation.y = 0.3;
    const stripes = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.035, 0.25), plainMat(0xf5f0e6, 0.95)); stripes.position.copy(blanket.position); stripes.rotation.y = 0.3;
    const stripes2 = stripes.clone(); stripes2.rotation.y = 0.3 + Math.PI / 2; stripes2.scale.x = 0.83;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35).translate(0, 0.15, 0), plainMat(0x9c6b3c, 0.9)); basket.position.set(PICNIC[0] + 0.5, y + 0.03, PICNIC[1] - 0.6);
    const by = terrainH(BENCH[0], BENCH[1]);
    const bench = new THREE.Group();
    bench.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.45).translate(0, 0.45, 0), plainMat(0x6b4a2e, 0.85)));
    bench.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.06).translate(0, 0.72, -0.22), plainMat(0x6b4a2e, 0.85)));
    for (const sx of [-0.75, 0.75]) bench.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(sx, 0.22, 0), plainMat(0x2a2a2a, 0.6)));
    bench.position.set(BENCH[0], by, BENCH[1]); bench.rotation.y = 2.9 + Math.PI;
    for (const m of [blanket, stripes, stripes2, basket]) scene.add(shadowy(m));
    bench.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(bench);
  }
  // a dog that bounds around the picnic
  const dog = new THREE.Group();
  {
    const fur = plainMat(0xc8a165, 0.9), dark = plainMat(0x3a2a1e, 0.9);
    dog.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.72).translate(0, 0.45, 0), fur));
    dog.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.28).translate(0, 0.62, 0.42), fur));
    dog.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14).translate(0, 0.58, 0.6), dark));
    dog.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3).rotateX(-0.7).translate(0, 0.6, -0.45), fur));
    for (const [sx, sz] of [[-0.09, 0.27], [0.09, 0.27], [-0.09, -0.27], [0.09, -0.27]]) dog.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.07).translate(sx, 0.17, sz), fur));
    dog.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(dog);
  }
  const phoneGeo = new THREE.BufferGeometry();
  const phonePos = new Float32Array(people.length * 3), phoneA = new Float32Array(people.length);
  phoneGeo.setAttribute('position', new THREE.BufferAttribute(phonePos, 3));
  phoneGeo.setAttribute('aA', new THREE.BufferAttribute(phoneA, 1));
  const phonePts = new THREE.Points(phoneGeo, pointsMaterial(`attribute float aA; varying float vA;
    void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = aA > 0.0 ? clamp(260.0 / -mv.z, 2.5, 12.0) : 0.0;
      #include <logdepthbuf_vertex>
    }`, `varying float vA;`, `vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 22.0); gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a * vA * 5.0, 1.0);`));
  phonePts.frustumCulled = false;
  scene.add(phonePts);
  const SKY_YAW = Math.PI - 0.07;   // facing the ash column, over the lake
  // the footpath runs down the meadow and joins the village street
  const pathAt = (u) => {
    const line = u <= 1 ? meadowPath : street;
    const v = clamp(u <= 1 ? u : (u - 1) * 0.18, 0, 1) * (line.length - 1), k = Math.min(Math.floor(v), line.length - 2), f = v - k;
    const a = line[k], b = line[k + 1];
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), Math.atan2(b[0] - a[0], b[1] - a[1])];
  };
  const torches = [new THREE.PointLight(0xe8f0ff, 0, 14, 1.6), new THREE.PointLight(0xe8f0ff, 0, 14, 1.6)];
  torches.forEach((l) => scene.add(l));
  people.forEach((p) => { if (p.kind === 'sit' || p.kind === 'hiker') p.phone = true; });
  const torchOwner = [people.findIndex((p) => p.kind === 'sit'), people.findIndex((p) => p.kind === 'hiker')];
  function updatePeople(t, s) {
    const stopU = clamp(t - 24, 0, 1.5);
    const stopped = Math.min(t, 24) + stopU - (stopU * stopU) / 3;     // walking time, easing to a halt at the blackout
    const shock = smooth(24.2, 25.5, t);                                 // everyone turns to the sky
    let pk = 0;
    people.forEach((p, i) => {
      const away = Math.max(0, t - p.leaveT);
      const leaving = clamp((away - 3) / 4);
      let x, z, yaw = 0, stride = 0, walk = t * 5.5 + i * 1.7, sit = 0, armL = 0, armR = 0, look = 0, pitch = 0, y;
      if (p.kind === 'prom') {
        const v = p.still ? 0 : 1;
        const th = p.th + (p.dir * (p.sp * v * stopped + 1.8 * away)) / 860;
        [x, z] = roadPt(th, 1.032);
        const [x2, z2] = roadPt(th + 0.001 * p.dir, 1.032);
        yaw = Math.atan2(x2 - x, z2 - z);
        stride = (v && t < 24.6) || away > 0 ? 1 : 0;
      } else if (p.kind === 'pier') {
        x = p.x; z = p.z + away * 1.8; yaw = away > 0 ? 0 : Math.PI + (p.r - 0.5);
        stride = away > 0 ? 1 : 0;
        sit = away > 0 ? 0 : (p.r < 0.4 ? 1 : 0);
        if (p.r > 0.7 && t < 24) armR = 0.9;                      // fishing
      } else if (p.kind === 'street') {
        const v = p.still ? 0 : 1;
        const u = clamp(p.u + p.dir * p.sp * v * stopped - away * 0.006, 0, 1);
        const k = Math.min(Math.floor(u * (street.length - 1)), street.length - 2);
        const f = u * (street.length - 1) - k;
        x = lerp(street[k][0], street[k + 1][0], f) + 1.2 * (p.r - 0.5); z = lerp(street[k][1], street[k + 1][1], f);
        const dx = street[k + 1][0] - street[k][0], dz = street[k + 1][1] - street[k][1];
        yaw = (away > 0 ? -1 : p.dir) > 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
        stride = (v && t < 24.6) || away > 0 ? 1 : 0;
      } else if (p.kind === 'sit' || p.kind === 'bench') {
        x = p.x; z = p.z; yaw = p.yaw; sit = 1 - smooth(25, 26.5, t);
        if (p.kind === 'sit' && t < 24) { armR = 0.5 + 0.3 * Math.sin(t * 1.3 + i); }
        if (away > 0) { const [px, pz] = pathAt(0.55 + away * 0.04); const k = smooth(0, 2, away); x = lerp(p.x, px, k); z = lerp(p.z, pz, k) - away * 0.6; yaw = Math.PI * 0.85; stride = 1; sit = 0; }
      } else if (p.kind === 'kid') {
        // tag around the picnic blanket: wide loops at running pace, then they run back to their parents
        const ph = t * (0.55 + p.k * 0.07) + p.k * 2.1;
        const rad = 3.5 + 2.0 * Math.sin(t * 0.37 + p.k * 1.7);
        const cx = PICNIC[0] + Math.sin(t * 0.21 + p.k) * 3, cz = PICNIC[1] + Math.cos(t * 0.17 + p.k) * 2;
        const back = smooth(24.3, 26.5 + p.k * 0.4, t);
        x = lerp(cx + Math.cos(ph) * rad, PICNIC[0] + (p.k - 1) * 0.8, back);
        z = lerp(cz + Math.sin(ph) * rad * 0.7, PICNIC[1] + 0.9, back);
        yaw = Math.atan2(-Math.sin(ph), Math.cos(ph) * 0.7);
        stride = back < 0.95 ? 1.6 : 0; walk = t * 12 + p.k * 2;
        if (away > 0) { const [px, pz] = pathAt(0.55 + away * 0.04); const k = smooth(0, 2, away); x = lerp(x, px + p.k, k); z = lerp(z, pz, k) - away * 0.6; yaw = Math.PI * 0.85; stride = 1.2; }
      } else {
        const u = p.u0 + p.sp * stopped + away * 0.03;
        [x, z, yaw] = pathAt(u);
        x += (p.r - 0.5) * 1.4;
        stride = (t < 24.5 || away > 0) && u > 0 ? 1 : 0;
        p.hidden = u < 0 || u > 2.2;
      }
      // the blackout: stop, turn to where the sun was, look up; a few point, most reach for their phones
      if (shock > 0 && away === 0 && p.kind !== 'kid') {
        yaw = lerp(yaw, SKY_YAW + (p.r - 0.5) * 0.7, shock);
        look = shock * (p.kind === 'sit' || p.kind === 'bench' ? 0.7 : 1);
        stride *= 1 - shock;
        if (p.r < 0.25) armR = Math.max(armR, 1.5 * smooth(24.8, 25.6, t) * (1 - smooth(27.5, 28.5, t)));
      }
      const phoneUp = p.phone ? s.phones * (1 - leaving) * (away > 0 ? 0.6 : 1) : 0;
      if (phoneUp > 0.01 && away === 0) { armR = Math.max(armR, 1.05 * Math.min(phoneUp * 2, 1)); armL = Math.max(armL, 0.9 * Math.min(phoneUp * 2, 1)); look = Math.max(look * 0.5, 0.3); }
      if (p.kind === 'kid' && shock > 0 && t > 26.5) look = 0.8;
      y = p.kind === 'pier' && away === 0 ? 1.15 : terrainH(x, z) + 0.05;
      if (p.kind === 'pier' && sit > 0) y = 1.15 + 0.1;
      if (p.kind === 'bench') y = terrainH(x, z) + 0.05;
      const vis = !p.hidden && leaving < 1;
      crowd.pose(i, { x, y, z, yaw, s: p.h * (1 - leaving), walk, stride, sit, pitch, armL, armR, look, visible: vis });
      if (p.kind === 'hiker' && p.pack) {
        dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(vis ? p.h * (1 - leaving) : 0.0001); dummy.updateMatrix();
        packMesh.setMatrixAt(pk++, dummy.matrix);
      }
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      phonePos.set([x + fx * 0.35 * p.h, y + 1.35 * p.h, z + fz * 0.35 * p.h], i * 3);
      phoneA[i] = vis ? phoneUp * (0.6 + 0.4 * Math.sin(i * 3.3)) : 0;
    });
    crowd.commit();
    torches.forEach((l, k) => {
      const i = torchOwner[k];
      l.position.set(phonePos[i * 3], phonePos[i * 3 + 1] - 0.2, phonePos[i * 3 + 2]);
      l.intensity = 2.2 * smooth(38.6 + k * 1.3, 39.2 + k * 1.3, t) * (1 - smooth(52, 55, t)) * (phoneA[i] > 0 ? 1 : 0);
    });
    packMesh.instanceMatrix.needsUpdate = true;
    phoneGeo.attributes.position.needsUpdate = phoneGeo.attributes.aA.needsUpdate = true;
    // the dog: figure-eights around the picnic, then sits by the family and stares up with them
    const dt = Math.min(t, 24.3);
    const ang = dt * 1.1;
    let dx = PICNIC[0] + Math.sin(ang) * 6, dz = PICNIC[1] + Math.sin(ang * 2) * 3;
    const hx = Math.cos(ang) * 6, hz = Math.cos(ang * 2) * 6;
    const settle = smooth(24.3, 26, t);
    dx = lerp(dx, PICNIC[0] + 1.6, settle); dz = lerp(dz, PICNIC[1] + 1.2, settle);
    const run = 1 - settle;
    dog.position.set(dx, terrainH(dx, dz) + Math.abs(Math.sin(t * 14)) * 0.08 * run, dz);
    dog.rotation.set(-0.35 * settle, settle > 0.5 ? SKY_YAW : Math.atan2(hx, hz), 0);
    const dogAway = Math.max(0, t - 36);
    dog.visible = dogAway < 6;
    if (dogAway > 0) { const [px, pz] = pathAt(0.55 + dogAway * 0.04); dog.position.set(px + 1.5, terrainH(px, pz), pz - dogAway * 0.6); dog.rotation.set(0, Math.PI * 0.85, 0); }
  }

  // ---------- the pasture: a hay barn, a yellow hiking signpost, boulders and wildflowers ----------
  {
    const wood = plainMat(0x5b3f28, 0.9), roofM = plainMat(0x4a4440, 0.85, { flatShading: true }), stoneM = plainMat(0x98928a, 0.9, { flatShading: true });
    const barn = new THREE.Group();
    barn.add(new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 9).translate(0, 0.6, 0), stoneM));
    barn.add(new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.6, 8.8).translate(0, 3.0, 0), wood));
    const rf = new THREE.Mesh(prismGeo(), roofM); rf.scale.set(8.4, 2.6, 10.2); rf.position.y = 4.8; barn.add(rf);
    barn.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.1).translate(0, 2.4, 4.45), plainMat(0x3a2818, 0.9)));
    barn.position.set(-27, terrainH(-27, 26) - 0.4, 26); barn.rotation.y = 0.5;
    barn.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(barn);
    const sign = new THREE.Group();
    sign.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).translate(0, 1.2, 0), plainMat(0x8a8a8a, 0.5, { metalness: 0.5 })));
    for (const [y, a] of [[2.1, 0.4], [1.8, -0.9], [1.5, 2.2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.04).translate(0.45, 0, 0), plainMat(0xf2c200, 0.6)); b.position.y = y; b.rotation.y = a; sign.add(b); }
    const [sx0, sz0] = [-1.5, 58];
    sign.position.set(sx0, terrainH(sx0, sz0), sz0);
    sign.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(sign);
    const RF = rng(808);
    const flowers = [], stones = [];
    for (let n = 0; n < 9000 && flowers.length < 1900; n++) {
      const x = (RF() - 0.5) * 70, z = 14 + RF() * 62;
      if (RF() < 0.006) stones.push([x, terrainH(x, z), z, 0.25 + RF() * 0.6, RF()]);
      else flowers.push([x, terrainH(x, z), z, RF()]);
    }
    const fm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), plainMat(0xffffff, 0.8), flowers.length);
    flowers.forEach(([x, y, z, r], i) => {
      dummy.position.set(x, y + 0.16, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.7 + r * 0.6); dummy.updateMatrix(); fm.setMatrixAt(i, dummy.matrix);
      fm.setColorAt(i, tmpC.set(r < 0.5 ? 0xf5f2e8 : r < 0.8 ? 0xf2d33b : r < 0.93 ? 0x9a7fd0 : 0xd6455d));
    });
    const sm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stoneM, stones.length);
    stones.forEach(([x, y, z, sc, r], i) => { dummy.position.set(x, y, z); dummy.rotation.set(r * 3, r * 5, r); dummy.scale.set(sc * 1.3, sc * 0.6, sc); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); });
    scene.add(shadowy(fm, false, true), shadowy(sm));
    // the footpath: a worn strip of earth through the grass
    scene.add(shadowy(new THREE.Mesh(ribbonGeo(meadowPath, 1.3, 0.05), plainMat(0x7a6a50, 1.0)), false, true));
  }

  // ---------- cows grazing behind a fence on the right of the meadow, bells clanking ----------
  const cows = [];
  {
    const RC = rng(99);
    for (let i = 0; i < 6; i++) cows.push({ x: 11 + RC() * 22, z: 20 + RC() * 21, yaw: RC() * 6.28, r: RC(), c: [0x6b4a2e, 0x2a2622, 0x8a5a34, 0xd9cfc0, 0x4a3524, 0x7a4f2c][i] });
    const fencePosts = [];
    for (let z = 45; z >= 14; z -= 2.5) fencePosts.push([7, z]);
    for (let x = 9.5; x <= 40; x += 2.5) fencePosts.push([x, 45]);
    const wood = plainMat(0x6a5038, 0.9);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.2, 0.12).translate(0, 0.6, 0), wood, fencePosts.length);
    fencePosts.forEach(([x, z], i) => { dummy.position.set(x, terrainH(x, z) - 0.05, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); });
    scene.add(shadowy(posts));
    const rail = (pts) => { for (const hy of [0.55, 1.0]) scene.add(shadowy(new THREE.Mesh(ribbonGeo(pts, 0.06, hy).rotateX(0), wood))); };
    const railPts1 = [], railPts2 = [];
    for (let z = 45; z >= 14; z -= 1.5) railPts1.push([7, z]);
    for (let x = 7; x <= 40; x += 1.5) railPts2.push([x, 45]);
    rail(railPts1); rail(railPts2);
  }
  const cowBody = new THREE.InstancedMesh(mergeGeometries([
    new THREE.CapsuleGeometry(0.43, 1.15, 4, 10).rotateX(Math.PI / 2).scale(1, 1.08, 1).translate(0, 1.08, 0),
    new THREE.BoxGeometry(0.7, 0.32, 0.5).translate(0, 1.42, -0.62),
    ...[[-0.24, 0.62], [0.24, 0.62], [-0.24, -0.66], [0.24, -0.66]].map(([sx, sz]) => new THREE.CylinderGeometry(0.075, 0.06, 0.78, 6).translate(sx, 0.39, sz)),
    new THREE.CylinderGeometry(0.025, 0.025, 0.75, 4).rotateX(0.15).translate(0, 0.95, -1.02),
    new THREE.SphereGeometry(0.17, 8, 6).scale(1, 0.7, 1.2).translate(0, 0.64, -0.4),
  ].map((g) => g.toNonIndexed())), plainMat(0xffffff, 0.9), cows.length);
  const cowHead = new THREE.InstancedMesh(mergeGeometries([
    new THREE.BoxGeometry(0.36, 0.4, 0.5).translate(0, 0, 0.3),
    new THREE.BoxGeometry(0.3, 0.26, 0.2).translate(0, -0.1, 0.6),
    new THREE.BoxGeometry(0.62, 0.08, 0.1).translate(0, 0.12, 0.16),
    new THREE.ConeGeometry(0.035, 0.18, 5).rotateZ(-0.6).translate(0.2, 0.26, 0.2), new THREE.ConeGeometry(0.035, 0.18, 5).rotateZ(0.6).translate(-0.2, 0.26, 0.2),
    new THREE.CylinderGeometry(0.06, 0.07, 0.12, 6).translate(0, -0.32, 0.16),
  ].map((g) => g.toNonIndexed())), plainMat(0xffffff, 0.9), cows.length);
  const cowPatch = new THREE.InstancedMesh(new THREE.SphereGeometry(0.47, 10, 8).scale(1.0, 0.8, 1.1).translate(0, 1.15, 0.25), plainMat(0xf2eee6, 0.9), cows.length);
  cows.forEach((c, i) => { cowBody.setColorAt(i, tmpC.set(c.c)); cowHead.setColorAt(i, tmpC.set(i % 2 ? 0xf0ebe0 : c.c)); });
  scene.add(shadowy(cowBody), shadowy(cowHead), shadowy(cowPatch));
  function updateCows(t) {
    cows.forEach((c, i) => {
      // graze, take a few steps, graze again; lie down a while after dark
      const step = Math.floor((t + c.r * 9) / 9), stepT = ((t + c.r * 9) % 9);
      const walkA = c.yaw + step * 0.9;
      const moved = Math.min(step, 4) * 1.2 + smooth(0, 2, stepT) * 1.2 * (step < 4 ? 1 : 0);
      let x = c.x + Math.sin(walkA) * moved * 0.4, z = c.z + Math.cos(walkA) * moved * 0.4;
      const lie = smooth(31 + c.r * 3, 33 + c.r * 3, t) * (1 - smooth(37 + c.r * 3, 38 + c.r * 3, t));
      const led = smooth(38 + c.r * 3, 46 + c.r * 3, t);
      const gx = lerp(x, 8.5, led), gz = lerp(z, 16 + i * 1.5, led);
      const fadeC = 1 - smooth(45 + c.r * 3, 47 + c.r * 3, t);
      if (led > 0) { x = gx; z = gz; }
      const y = terrainH(x, z) - lie * 0.55;
      dummy.position.set(x, y, z); dummy.rotation.set(0, walkA, 0); dummy.scale.setScalar(Math.max(fadeC, 0.0001)); dummy.updateMatrix();
      cowBody.setMatrixAt(i, dummy.matrix);
      if (i % 2 === 0) cowPatch.setMatrixAt(i, dummy.matrix); else { dummy.scale.setScalar(0.0001); dummy.updateMatrix(); cowPatch.setMatrixAt(i, dummy.matrix); }
      dummy.scale.setScalar(Math.max(fadeC, 0.0001));
      const graze = (stepT > 2.2 ? 1 : 0) * (1 - smooth(24.3, 25.2, t)) * (1 - lie);
      const nod = graze * (0.95 + 0.08 * Math.sin(t * 3 + i)) + (1 - graze) * -0.15;
      dummy.position.set(x + Math.sin(walkA) * 0.95, y + 1.25 - graze * 0.55, z + Math.cos(walkA) * 0.95);
      dummy.rotation.set(nod * 0.9, walkA + Math.sin(t * 0.5 + i) * 0.2 * (1 - graze), 0, 'YXZ');
      dummy.updateMatrix();
      cowHead.setMatrixAt(i, dummy.matrix);
      dummy.rotation.order = 'XYZ';
    });
    cowBody.instanceMatrix.needsUpdate = cowHead.instanceMatrix.needsUpdate = cowPatch.instanceMatrix.needsUpdate = true;
  }

  // ---------- boats on the lake ----------
  const boats = [];
  for (let i = 0; i < 14; i++) { const [x, z] = roadPt(R() * Math.PI * 2, 0.25 + R() * 0.62); if (z > -450) continue; boats.push({ x, z, yaw: R() * 6, s: 0.7 + R() * 0.7, sail: R() < 0.5, drift: (R() - 0.5) * 1.5 }); }
  const hullGeo = mergeGeometries([new THREE.BoxGeometry(2.2, 0.9, 6.5).translate(0, 0.25, 0), new THREE.CylinderGeometry(0.06, 0.06, 8, 5).translate(0, 4.4, 0.4)]);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.1, 0.5, 0, 8.3, 0.5, 0, 1.1, -2.6], 3));
  sailGeo.computeVertexNormals();
  const boatMesh = new THREE.InstancedMesh(hullGeo, plainMat(0xf2efe8, 0.6), boats.length);
  const sailMesh = new THREE.InstancedMesh(sailGeo, plainMat(0xfaf7f0, 0.9, { side: THREE.DoubleSide }), boats.length);
  scene.add(shadowy(boatMesh, false), shadowy(sailMesh, false));
  function updateBoats(t, s) {
    const live = 1 - s.ice;
    boats.forEach((b, i) => {
      const tt = Math.min(t, 56);
      dummy.position.set(b.x + b.drift * tt, Math.sin(t * 0.9 + i) * 0.08 * live, b.z);
      dummy.rotation.set(Math.sin(t * 0.7 + i) * 0.03 * live, b.yaw, Math.sin(t * 1.1 + i) * 0.04 * live + s.ice * 0.04);
      dummy.scale.setScalar(b.s); dummy.updateMatrix();
      boatMesh.setMatrixAt(i, dummy.matrix);
      if (!b.sail) dummy.scale.setScalar(0.0001), dummy.updateMatrix();
      sailMesh.setMatrixAt(i, dummy.matrix);
    });
    boatMesh.instanceMatrix.needsUpdate = sailMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- birds over the lake ----------
  const birds = [];
  for (let i = 0; i < 22; i++) birds.push({ x0: -260 - R() * 80, y: 80 + R() * 30, z: -500 - R() * 150, sp: 9 + R() * 3, ph: R() * 6, off: (R() - 0.5) * 30 });
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, -1.1, 0.35, 0.1, 0, 0, 0.25, 0, 0, -0.25, 0, 0, 0.25, 1.1, 0.35, 0.1], 3));
  birdGeo.computeVertexNormals();
  const birdMesh = new THREE.InstancedMesh(birdGeo, patch(new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.DoubleSide })), birds.length);
  birdMesh.frustumCulled = false;
  scene.add(birdMesh);
  function updateBirds(t) {
    birds.forEach((b, i) => {
      const flee = Math.max(0, t - 24.5);
      const x = b.x0 + b.sp * t + b.off;
      dummy.position.set(x + flee * flee * 3, b.y + Math.sin(t * 0.6 + b.ph) * 2 + flee * 4, b.z - flee * 8);
      dummy.rotation.set(0, -Math.PI / 2, 0);
      dummy.scale.set(1.6, Math.sin(t * (flee ? 13 : 8) + b.ph * 3) * 1.8, 1.6);
      if (x > 400 || flee > 7) dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      birdMesh.setMatrixAt(i, dummy.matrix);
    });
    birdMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- paragliders riding thermals over the lake ----------
  const canopyGeo = (() => {
    const pos = [], col = [], idx = [];
    const N = 16, Rr = 6.8, span = 1.4;
    for (let i = 0; i <= N; i++) {
      const a = -span / 2 + (span * i) / N, e = Math.cos((a / span) * Math.PI);
      const x = Math.sin(a) * Rr, y = Math.cos(a) * Rr - Rr, chord = 2.7 * (0.5 + 0.5 * e);
      pos.push(x, y, chord * 0.55, x, y - 0.05, -chord * 0.45);
      const stripe = i % 4 < 2 ? 1 : 0.78;
      col.push(stripe, stripe, stripe, stripe * 0.82, stripe * 0.82, stripe * 0.82);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const gliders = [
    { cx: -100, cz: -560, alt: 300, rr: 55, w: 0.16, ph: 0, sink: 1.1, c: 0xe63946 },
    { cx: 120, cz: -900, alt: 470, rr: 80, w: -0.13, ph: 2, sink: 1.0, c: 0xf4a261 },
    { cx: 25, cz: -520, alt: 230, rr: 45, w: 0.2, ph: 4, sink: 1.3, c: 0x2a9d8f },
    { cx: -190, cz: -1100, alt: 600, rr: 100, w: -0.11, ph: 1, sink: 0.9, c: 0x3a86ff },
    { cx: 170, cz: -700, alt: 380, rr: 55, w: 0.18, ph: 3, sink: 1.2, c: 0xffbe0b },
  ];
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, plainMat(0xffffff, 0.7, { vertexColors: true, side: THREE.DoubleSide }), gliders.length);
  const pilotMesh = new THREE.InstancedMesh(mergeGeometries([new THREE.BoxGeometry(0.55, 0.9, 0.6).translate(0, -7.4, 0), new THREE.SphereGeometry(0.2, 8, 6).translate(0, -6.8, 0.05)]), plainMat(0x22252b, 0.8), gliders.length);
  gliders.forEach((g, i) => canopyMesh.setColorAt(i, tmpC.set(g.c)));
  canopyMesh.frustumCulled = pilotMesh.frustumCulled = false;
  scene.add(canopyMesh, pilotMesh);
  function updateGliders(t) {
    gliders.forEach((g, i) => {
      const th = g.ph + g.w * t;
      const x = g.cx + Math.cos(th) * g.rr, z = g.cz + Math.sin(th) * g.rr * 0.8, y = g.alt - g.sink * t;
      const dx = -Math.sin(th) * Math.sign(g.w), dz = Math.cos(th) * 0.8 * Math.sign(g.w);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0.08, Math.atan2(dx, dz), -0.32 * Math.sign(g.w), 'YXZ');
      dummy.scale.setScalar(1.25); dummy.updateMatrix();
      canopyMesh.setMatrixAt(i, dummy.matrix); pilotMesh.setMatrixAt(i, dummy.matrix);
      dummy.rotation.order = 'XYZ';
    });
    canopyMesh.instanceMatrix.needsUpdate = pilotMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- swallows darting past the balcony; they vanish at the blackout ----------
  const swallows = [];
  { const RS = rng(31); for (let i = 0; i < 14; i++) swallows.push({ cx: (RS() - 0.5) * 22, cy: -4 + RS() * 10, cz: -14 - RS() * 34, ax: 6 + RS() * 9, ay: 1.5 + RS() * 3, az: 4 + RS() * 8, wx: 0.8 + RS() * 0.9, wy: 1.1 + RS() * 1.4, wz: 0.6 + RS() * 0.8, p1: RS() * 6.28, p2: RS() * 6.28, p3: RS() * 6.28, f: RS() }); }
  const swGeo = new THREE.BufferGeometry();
  swGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.05, -0.22, 0.07, -0.1, 0, 0, -0.02,        // left wing: long, narrow, swept back
    0, 0, 0.05, 0, 0, -0.02, 0.22, 0.07, -0.1,         // right wing
    0, 0, -0.04, -0.035, 0, -0.16, 0, 0, -0.09,        // forked tail
    0, 0, -0.04, 0, 0, -0.09, 0.035, 0, -0.16,
    -0.018, 0, 0.09, 0.018, 0, 0.09, 0, 0, -0.07,      // body
  ], 3));
  swGeo.computeVertexNormals();
  const swMesh = new THREE.InstancedMesh(swGeo, patch(new THREE.MeshBasicMaterial({ color: 0x0d1018, side: THREE.DoubleSide })), swallows.length);
  swMesh.frustumCulled = false;
  scene.add(swMesh);
  function updateSwallows(t) {
    const gone = Math.max(0, t - 24.4);
    swallows.forEach((b, i) => {
      const x = b.cx + b.ax * Math.sin(t * b.wx + b.p1), y = b.cy + b.ay * Math.sin(t * b.wy + b.p2), z = b.cz + b.az * Math.sin(t * b.wz + b.p3);
      const dx = b.ax * b.wx * Math.cos(t * b.wx + b.p1), dy = b.ay * b.wy * Math.cos(t * b.wy + b.p2), dz = b.az * b.wz * Math.cos(t * b.wz + b.p3);
      const ddx = -b.ax * b.wx * b.wx * Math.sin(t * b.wx + b.p1);
      const sp = Math.hypot(dx, dz) || 1;
      dummy.position.set(CAM_BASE.x + x + gone * gone * (i % 2 ? 6 : -6), CAM_BASE.y + y + gone * gone * 4, CAM_BASE.z + z - gone * gone * 10);
      dummy.rotation.set(-Math.atan2(dy, sp) * 0.7, Math.atan2(dx, dz), clamp(-ddx * 0.04, -0.9, 0.9), 'YXZ');
      const flap = Math.sin(t * (18 + b.f * 6) + i) ;
      dummy.scale.set(1 - 0.12 * Math.abs(flap), flap, 1).multiplyScalar(gone > 4 ? 0.0001 : 1.3);
      dummy.updateMatrix();
      swMesh.setMatrixAt(i, dummy.matrix);
      dummy.rotation.order = 'XYZ';
    });
    swMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- a paddle steamer crossing the lake (lit windows after dark, frozen in at the end) ----------
  const steamer = new THREE.Group();
  const steamerGlow = glowMat(new THREE.Color(3.2, 2.2, 1.2));
  {
    const white = plainMat(0xf4f1ea, 0.6), hullDark = plainMat(0x1f3d33, 0.6), wood = plainMat(0x7a5a3a, 0.8), win = plainMat(0x1c242c, 0.3);
    const parts = [
      [new THREE.BoxGeometry(7.4, 2.4, 40).translate(0, 0.6, 0), white],
      [new THREE.CylinderGeometry(0.4, 3.7, 8, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1, 0.32, 1).translate(0, 0.9, 24), white],
      [new THREE.BoxGeometry(7.5, 0.7, 40.2).translate(0, -0.2, 0), hullDark],
      [new THREE.BoxGeometry(6.0, 2.5, 26).translate(0, 3.05, -2), white],
      [new THREE.BoxGeometry(6.1, 0.9, 26.1).translate(0, 3.2, -2), win],
      [new THREE.BoxGeometry(6.6, 0.15, 30).translate(0, 4.35, -2), wood],
      [new THREE.BoxGeometry(4.6, 2.0, 12).translate(0, 5.4, 2), white],
      [new THREE.BoxGeometry(4.7, 0.7, 12.1).translate(0, 5.5, 2), win],
      [new THREE.CylinderGeometry(0.75, 0.85, 4.2, 12).translate(0, 7.4, -1), plainMat(0xe9c46a, 0.6)],
      [new THREE.CylinderGeometry(0.78, 0.78, 0.8, 12).translate(0, 9.1, -1), plainMat(0x161616, 0.7)],
      [new THREE.CylinderGeometry(2.6, 2.6, 1.2, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(4.1, 1.5, 3), white],
      [new THREE.CylinderGeometry(2.6, 2.6, 1.2, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(-4.1, 1.5, 3), white],
      [new THREE.CylinderGeometry(0.05, 0.05, 4, 4).translate(0, 4.2, -19.5), wood],
      [new THREE.BoxGeometry(0.05, 1.0, 1.0).translate(0, 5.6, -20.0), plainMat(0xd52b1e, 0.8)],
    ];
    for (const [g, m] of parts) steamer.add(new THREE.Mesh(g, m));
    const lights = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(6.15, 0.6, 25).translate(0, 3.2, -2), new THREE.BoxGeometry(4.75, 0.5, 11.5).translate(0, 5.5, 2)]), steamerGlow);
    lights.name = 'lights';
    steamer.add(lights);
    steamer.traverse((o) => { if (o.isMesh) shadowy(o, true, true); });
    scene.add(steamer);
  }
  const STEAM_DIR = new THREE.Vector2(1, 0.14).normalize();
  const steamerDist = (t) => 5.5 * (t < 55 ? t : 55 + (Math.min(t, 58) - 55) - (Math.min(t, 58) - 55) ** 2 / 6);
  function updateSteamer(t, s) {
    const d = steamerDist(t);
    const x = -330 + STEAM_DIR.x * d, z = -1130 + STEAM_DIR.y * d;
    steamer.position.set(x, Math.sin(t * 0.8) * 0.06 * (1 - s.ice), z);
    steamer.rotation.set(Math.sin(t * 0.6) * 0.004, Math.atan2(STEAM_DIR.x, STEAM_DIR.y), Math.sin(t * 0.7) * 0.006);
    steamer.getObjectByName('lights').visible = t > 37.6 && t < 58.6;
    lake.uniforms.uBoat.value.set(x, z, STEAM_DIR.x, STEAM_DIR.y);
    lake.uniforms.uBoatT.value = 1 - smooth(55, 62, t);
  }

  // ---------- a little red train along the far shore; it stops dead when the power goes ----------
  const train = { cars: 6, len: 18.5 };
  const trainBody = new THREE.InstancedMesh(mergeGeometries([new THREE.BoxGeometry(3.0, 3.3, 17.6).translate(0, 2.1, 0), new THREE.BoxGeometry(2.6, 0.35, 17.2).translate(0, 3.9, 0)]), plainMat(0xc1121f, 0.6), train.cars);
  const trainWin = new THREE.InstancedMesh(new THREE.BoxGeometry(3.05, 0.9, 15).translate(0, 2.8, 0), plainMat(0x1a2026, 0.3), train.cars);
  const trainLit = new THREE.InstancedMesh(new THREE.BoxGeometry(3.08, 0.8, 14.6).translate(0, 2.8, 0), glowMat(new THREE.Color(3.0, 2.4, 1.6)), train.cars);
  scene.add(shadowy(trainBody), shadowy(trainWin)); trainLit.frustumCulled = false; scene.add(trainLit);
  const trainDist = (t) => 20 * (t < 57 ? t : 57 + (Math.min(t, 61) - 57) - (Math.min(t, 61) - 57) ** 2 / 8);
  function updateTrain(t) {
    const R0 = 1.075;
    const head = -Math.PI / 2 - 0.75 + trainDist(t) / (LAKE.rx * R0);
    const lit = t > 37.4 && t < 58.4;
    for (let i = 0; i < train.cars; i++) {
      const th = head - (i * train.len) / (LAKE.rx * R0);
      const [x, z] = roadPt(th, R0), [x2, z2] = roadPt(th + 0.002, R0);
      dummy.position.set(x, terrainH(x, z) + 0.3, z); dummy.rotation.set(0, Math.atan2(x2 - x, z2 - z), 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      trainBody.setMatrixAt(i, dummy.matrix); trainWin.setMatrixAt(i, dummy.matrix);
      if (!lit) { dummy.scale.setScalar(0.0001); dummy.updateMatrix(); }
      trainLit.setMatrixAt(i, dummy.matrix);
    }
    trainBody.instanceMatrix.needsUpdate = trainWin.instanceMatrix.needsUpdate = trainLit.instanceMatrix.needsUpdate = true;
  }

  // ---------- the balcony: wooden railing, tea, flowers, a candle lantern ----------
  const fg = new THREE.Group();
  fg.position.z = BAL_Z;
  scene.add(fg);
  {
    const wood = plainMat(0x6a4a2e, 0.75), woodDark = plainMat(0x553a23, 0.8);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.07, 0.14), wood); rail.position.set(0, FLOOR_Y + 1.06, -0.12);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.06, 0.08), woodDark); rail2.position.set(0, FLOOR_Y + 0.12, -0.12);
    fg.add(rail, rail2);
    const bal = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.95, 0.045), woodDark, 40);
    for (let i = 0; i < 40; i++) { dummy.position.set(-2.4 + i * 0.123, FLOOR_Y + 0.6, -0.12); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bal.setMatrixAt(i, dummy.matrix); }
    fg.add(bal);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.18), plainMat(0x7b5232, 0.8)); box.position.set(0.95, FLOOR_Y + 1.18, -0.12);
    fg.add(box);
    const r3 = rng(3);
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), plainMat(0x2f6a2a, 0.8, { flatShading: true }), 40);
    const blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 1), plainMat(0xd7263d, 0.6), 26);
    for (let i = 0; i < 40; i++) { dummy.position.set(0.68 + r3() * 0.54, FLOOR_Y + 1.27 + r3() * 0.07, -0.12 + (r3() - 0.5) * 0.14); dummy.rotation.set(r3() * 3, r3() * 3, 0); dummy.scale.set(1, 0.6 + r3() * 0.5, 1); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); }
    for (let i = 0; i < 26; i++) { dummy.position.set(0.68 + r3() * 0.54, FLOOR_Y + 1.33 + r3() * 0.07, -0.12 + (r3() - 0.5) * 0.12); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.8 + r3() * 0.5); dummy.updateMatrix(); blooms.setMatrixAt(i, dummy.matrix); }
    fg.add(leaves, blooms);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 18), plainMat(0x2f5d73, 0.45));
    mug.position.set(0.36, FLOOR_Y + 1.145, -0.13);
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.038, 18).rotateX(-Math.PI / 2), plainMat(0x6b3a12, 0.25));
    tea.position.set(0.36, FLOOR_Y + 1.19, -0.13);
    fg.add(mug, tea);
  }
  const lanternX = -0.24, lanternY = FLOOR_Y + 1.095, lanternZ = -0.13;   // in shot, so its glow on the rail has a visible source
  {
    const frame = plainMat(0x1f1f22, 0.5, { metalness: 0.4 });
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.13), frame);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.06, 4).translate(0, 0.21, 0), frame); top.rotation.y = Math.PI / 4;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.11).translate(0, 0.1, 0), patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.18 })));
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10).translate(0, 0.045, 0), plainMat(0xf2ead8, 0.6));
    g.add(base, top, glass, candle);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.19, 0.008).translate(sx * 0.055, 0.1, sz * 0.055), frame));
    g.position.set(lanternX, lanternY, lanternZ);
    fg.add(g);
  }
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 1.9, 1), glowMat(new THREE.Color(2.6, 1.3, 0.38)));
  flame.position.set(lanternX, lanternY + 0.1, lanternZ);
  fg.add(flame);
  const candleLight = new THREE.PointLight(0xffa04a, 0, 7, 2);
  candleLight.position.set(lanternX, lanternY + 0.12, lanternZ + BAL_Z);
  scene.add(candleLight);
  function updateLantern(t) {
    const on = smooth(38.2, 38.6, t);
    const fl = 0.93 + 0.05 * Math.sin(t * 2.1) + 0.02 * Math.sin(t * 5.3 + 1);   // a calm candle, not a strobe
    flame.scale.setScalar(Math.max(on * (0.9 + 0.1 * fl), 0.0001));
    candleLight.intensity = on * fl * 0.32;
  }

  // ---------- particles ----------
  const steam = makeSteam(R);
  const smoke = makeSmoke(R, chimneys);
  const snow = makeSnow(R);
  const dust = makeDust(caveIns);
  scene.add(steam.points, smoke.points, snow.points, dust.points);
  const flow = makeFlow(scene, terrainH, lakeD, CAM_BASE.z);

  // ---------- the lake (planar reflection + ice) ----------
  const lake = makeLake();
  scene.add(lake.mesh);
  const reflRT = new THREE.WebGLRenderTarget(WIDE ? 960 : 540, WIDE ? 540 : 960, { type: THREE.HalfFloatType });
  const mirrorCam = new THREE.PerspectiveCamera();
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05)];
  lake.uniforms.uRefl.value = reflRT.texture;
  world.beforeRender = (renderer, camera, skyMesh) => {
    mirrorCam.copy(camera);
    mirrorCam.position.y = -camera.position.y;
    mirrorCam.rotation.set(-camera.rotation.x, camera.rotation.y, -camera.rotation.z, 'YXZ');
    mirrorCam.updateMatrixWorld();
    mirrorCam.updateProjectionMatrix();
    const skyPos = skyMesh.position.clone();
    skyMesh.position.copy(mirrorCam.position);
    lake.mesh.visible = false; fg.visible = false;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(reflRT);
    renderer.clippingPlanes = clip;
    renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.clippingPlanes = [];
    renderer.setRenderTarget(prevTarget);
    lake.mesh.visible = true; fg.visible = true;
    skyMesh.position.copy(skyPos);
  };

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x9fb6d8, 0x5b5040, 1.0);
  const sun = new THREE.DirectionalLight(0xffefd6, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -330, right: 330, top: 330, bottom: -330, near: 10, far: 2000 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.target.position.set(0, 0, -220);
  scene.add(hemi, sun, sun.target);
  const boltLight = new THREE.DirectionalLight(0xc8d4ff, 0);
  boltLight.position.set(300, 900, -600);
  const flowLight = new THREE.DirectionalLight(0xff6a22, 0);
  flowLight.target.position.copy(CAM_BASE);
  scene.add(boltLight, flowLight, flowLight.target);

  world.frame = (t, s, ctx) => {
    G.uTime.value = t;
    G.uSnow.value = s.snow;
    updateLamps(t);
    updateCaveIns(t);
    updateStreetCars(t);
    dust.uniforms.uTime.value = t;
    flow.frame(t, s, ctx.camera);
    flow.uniforms.uFogColor.value.copy(ctx.fogColor);
    flow.uniforms.uFogDensity.value = 0.00006 + s.snowFall * 0.00035;
    updateCars(t);
    updatePeople(t, s);
    updateBoats(t, s);
    updateBirds(t);
    updateLantern(t);
    updateCows(t);
    updateGliders(t);
    updateSwallows(t);
    updateSteamer(t, s);
    updateTrain(t);
    steam.uniforms.uTime.value = t;
    smoke.uniforms.uTime.value = t;
    snow.uniforms.uTime.value = t;
    snow.uniforms.uAmount.value = s.snowFall;
    lake.frame(t, s, ctx);
    const day = s.day;
    sun.position.copy(ctx.sunDir).multiplyScalar(900).add(sun.target.position);
    sun.intensity = 3.1 * s.sunLight;
    sun.visible = s.sunLight > 0.001;
    hemi.intensity = 1.05 * day + 0.05 + 0.3 * smooth(37, 41, t) * (1 - 0.45 * smooth(GRID.t0, GRID.t0 + GRID.span, t)) + s.bolt * 0.35 * smooth(36, 40, t);
    boltLight.intensity = s.bolt * 0.7 * smooth(36, 40, t);
    flowLight.intensity = 3.2 * s.near * s.near + 0.6 * s.near;
    flowLight.position.set(CAM_BASE.x, CAM_BASE.y + 120, Math.min(s.flowZ, CAM_BASE.z - 60));
    hemi.color.setRGB(lerp(0.34, 0.62, day), lerp(0.3, 0.72, day), lerp(0.27, 0.88, day));
    hemi.groundColor.setRGB(lerp(0.12, 0.38, day), lerp(0.1, 0.34, day), lerp(0.09, 0.27, day));
    scene.fog.color.copy(ctx.fogColor);
    scene.fog.density = lerp(0.00007, 0.00014, day) + s.snowFall * 0.0011;
  };
  return world;
}

function pointsMaterial(vertBody, fragDecl, fragBody, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: opts.uniforms || {}, transparent: true, depthWrite: false, blending: opts.blending ?? THREE.AdditiveBlending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      ${vertBody}`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      ${fragDecl}
      void main(){
        #include <logdepthbuf_fragment>
        ${fragBody}
      }`,
  });
}

function makeSteam(R) {
  const N = 220;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p0.set([0.36 + (R() - 0.5) * 0.04, FLOOR_Y + 1.2, BAL_Z - 0.13 + (R() - 0.5) * 0.04], i * 3); prm.set([R(), 0.4 + R() * 0.4, R() * 6.28], i * 3); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 3));
  const uniforms = { uTime: { value: 0 } };
  const mat = pointsMaterial(`uniform float uTime; attribute vec3 aPrm; varying float vA;
    void main(){
      float life = fract(uTime * aPrm.y * 0.5 + aPrm.x);
      vec3 p = position + vec3(sin(life * 6.0 + aPrm.z) * 0.02 * life, life * 0.28, cos(life * 5.0 + aPrm.z) * 0.015 * life);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp((0.015 + life * 0.04) * 1600.0 / -mv.z, 1.0, 70.0);
      vA = sin(3.14159 * life) * 0.022 * (1.0 - smoothstep(20.0, 25.0, uTime));
      #include <logdepthbuf_vertex>
    }`, `varying float vA;`, `vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 9.0); gl_FragColor = vec4(vec3(0.9) * a * vA, 1.0);`, { uniforms });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

function makeSmoke(R, chimneys) {
  const PER = 14, N = chimneys.length * PER;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  chimneys.forEach((c, ci) => { for (let k = 0; k < PER; k++) { const i = ci * PER + k; p0.set([c[0], c[1] + 1.8, c[2]], i * 3); prm.set([R(), 0.12 + R() * 0.08, R() * 6.28, 300 + c[3] * 6], i * 4); } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const uniforms = { uTime: { value: 0 } };
  const mat = pointsMaterial(`uniform float uTime; attribute vec4 aPrm; varying float vA;
    void main(){
      float on = smoothstep(aPrm.w, aPrm.w + 2.0, uTime) * (1.0 - smoothstep(66.0, 70.0, uTime));
      if (on <= 0.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float life = fract(uTime * aPrm.y + aPrm.x);
      vec3 p = position + vec3(life * 9.0 + sin(life * 4.0 + aPrm.z) * 1.5, life * 14.0, sin(life * 3.0 + aPrm.z) * 1.2);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp((1.2 + life * 5.0) * 1600.0 / -mv.z, 1.0, 90.0);
      vA = sin(3.14159 * life) * 0.05 * on;
      #include <logdepthbuf_vertex>
    }`, `varying float vA;`, `vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 8.0); gl_FragColor = vec4(vec3(0.34, 0.33, 0.36) * a * vA, 1.0);`, { uniforms });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

function makeSnow(R) {
  const N = 24000;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const z = CAM_BASE.z - 1.5 - Math.pow(R(), 1.7) * 260;
    const halfW = 3 + Math.abs(z - CAM_BASE.z) * 0.4;
    p0.set([(R() - 0.5) * 2 * halfW, CAM_BASE.y - 60 + R() * 100, z], i * 3);
    prm.set([0.9 + R() * 0.9, R() * 6.28, 0.022 + R() * 0.03], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 3));
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) }, uTop: { value: CAM_BASE.y + 40 } };
  const mat = pointsMaterial(`uniform float uTime; uniform float uAmount; uniform float uScale; uniform float uTop; attribute vec3 aPrm; varying float vA;
    void main(){
      if (uAmount <= 0.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float tt = uTime - 38.0;
      vec3 p = position;
      p.y = uTop - mod(uTop - p.y + aPrm.x * tt, 100.0);
      p.x += sin(tt * 0.6 + aPrm.y) * 0.6 + tt * 0.25;
      p.z += cos(tt * 0.45 + aPrm.y * 1.3) * 0.8;
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float px = aPrm.z * uScale / max(-mv.z, 0.1);
      gl_PointSize = clamp(px, 1.0, 26.0);
      vA = uAmount * clamp(px, 0.25, 1.0) * (px > 10.0 ? 0.35 : 0.8);
      #include <logdepthbuf_vertex>
    }`, `varying float vA;`, `vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 10.0); gl_FragColor = vec4(vec3(0.5, 0.46, 0.42) * a * vA * 0.42, 1.0);`, { uniforms });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

function makeLake() {
  const rings = 200, segs = 280, r0 = 250, r1 = 3200, a0 = -70 * DEG, a1 = 70 * DEG;
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.pow(r1 / r0, i / rings);
    for (let j = 0; j <= segs; j++) { const a = lerp(a0, a1, j / segs); pos[k++] = CAM_BASE.x + Math.sin(a) * r; pos[k++] = 0; pos[k++] = CAM_BASE.z - Math.cos(a) * r; }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const uniforms = {
    uTime: G.uTime, uRefl: { value: null }, uRes: { value: WIDE ? new THREE.Vector2(1920, 1080) : new THREE.Vector2(1080, 1920) },
    uDay: { value: 1 }, uCity: { value: 0 }, uSunDir: { value: new THREE.Vector3() },
    uWaves: { value: 1 }, uIceR: { value: -100 }, uIce: { value: 0 },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0001 },
    uBoat: { value: new THREE.Vector4(0, -900, 1, 0) }, uBoatT: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW; varying vec2 vPre; varying float vShore;
      float shoreDist(vec2 p) { return (1.0 - length((p - vec2(${LAKE.cx.toFixed(1)}, ${LAKE.cz.toFixed(1)})) / vec2(${LAKE.rx.toFixed(1)}, ${LAKE.rz.toFixed(1)}))) * ${LAKE.rz.toFixed(1)}; }
      void main() {
        vec3 p = position;
        vPre = p.xz;
        vShore = shoreDist(p.xz);
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    // Ripples: ~18 wind-ripple components with scattered directions and real (gravity-capillary) speeds,
    // faded out once smaller than a few pixels (their slope moves into the glint roughness instead), and
    // gated by drifting wind patches so the lake shows mirror-calm stretches next to rippled ones.
    // The steamer leaves a Kelvin wake: a churned strip behind it and two diverging arms of waves.
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform sampler2D uRefl; uniform vec2 uRes;
      uniform float uIceR; uniform float uIce; uniform float uWaves;
      uniform vec3 uFogColor; uniform float uFogDensity;
      uniform vec4 uBoat; uniform float uBoatT;
      ${SKY_COMMON}
      varying vec3 vW; varying vec2 vPre; varying float vShore;
      float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
      float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
      float fbm2(vec2 p) { return vn(p) * 0.55 + vn(p * 2.13 + 7.1) * 0.3 + vn(p * 4.37 + 3.3) * 0.15; }
      float cracks(vec2 p) {
        vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(x, y); vec2 o = vec2(hh(i + g), hh(i + g + 17.0));
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        return d2 - d1;
      }
      vec2 ripples(vec2 p, float fp, out float lost) {
        vec2 grad = vec2(0.0);
        lost = 0.0;
        float wind = smoothstep(0.38, 0.68, fbm2(p * 0.0045 + vec2(uTime * 0.012, uTime * 0.004)));
        wind = 0.12 + 0.88 * wind;
        vec2 warp = (vec2(vn(p * 0.03), vn(p * 0.03 + 11.0)) - 0.5) * 6.0;
        for (int i = 0; i < 18; i++) {
          float fi = float(i);
          float L = 9.0 * pow(0.75, fi);                    // 9 m .. 0.07 m
          float ang = 2.4 + (h1(fi * 1.7) - 0.5) * 2.0;
          vec2 d = vec2(cos(ang), sin(ang));
          float kk = 6.2832 / L;
          float w = sqrt(9.81 * kk + 7.3e-5 * kk * kk * kk);
          float S = (0.012 + 0.02 * h1(fi * 5.3)) * (L < 2.0 ? wind : 0.35 + 0.65 * wind);
          float fade = smoothstep(1.5 * fp, 4.0 * fp, L);
          float ph = dot(d, p + warp * min(1.0, 3.0 / L)) * kk - w * uTime + h1(fi * 9.1) * 6.2832;
          grad += d * (S * fade * cos(ph));
          lost += 0.5 * S * S * (1.0 - fade);
        }
        return grad;
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(vW - cameraPosition);
        float iced = 1.0 - smoothstep(uIceR - 20.0 - 30.0 * vn(vPre * 0.02), uIceR + 20.0, vShore);
        float fp = max(length(fwidth(vPre)), 0.002);
        float lost;
        vec2 sl = ripples(vPre, fp, lost) * uWaves * (1.0 - iced);
        lost *= uWaves * (1.0 - iced);
        // the steamer's wake
        float foam = 0.0;
        if (uBoatT > 0.0) {
          vec2 o = vPre - uBoat.xy;
          float along = -dot(o, uBoat.zw), lat = dot(o, vec2(-uBoat.w, uBoat.z));
          if (along > -12.0 && along < 700.0) {
            float a = max(along, 0.5);
            float age = a / 6.0;                                    // seconds since the boat passed (6 m/s)
            float decay = exp(-a / 420.0) * uBoatT;
            float r = abs(lat) / a;
            float arms = exp(-pow((r - 0.3) / (0.05 + 4.0 / a), 2.0)) * step(0.0, along);
            float ph = a * 0.7 - lat * 0.0 + abs(lat) * 1.9;
            sl += vec2(-uBoat.w, uBoat.z) * sign(lat) * cos(ph) * 0.09 * arms * decay;
            float trans = exp(-pow(lat / (4.0 + a * 0.12), 2.0)) * step(0.0, along);
            sl += uBoat.zw * cos(a * 0.55 - uTime * 2.0) * 0.05 * trans * decay;
            foam = trans * exp(-a / 120.0) * smoothstep(0.35, 0.65, fbm2(vPre * vec2(0.35, 0.35) + uTime * 0.2)) * uBoatT;
            foam += exp(-pow(lat / 5.0, 2.0)) * exp(-pow((along + 4.0) / 10.0, 2.0)) * 0.6 * uBoatT;   // bow wave
            lost += 0.004 * arms * decay;
          }
        }
        vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
        float fres = max(0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0), 0.35);
        vec2 suv = gl_FragCoord.xy / uRes;
        vec2 ruv = vec2(suv.x, 1.0 - suv.y) + sl * vec2(0.09, 0.28) * (1.0 - iced);
        vec3 refl = texture2D(uRefl, clamp(ruv, 0.001, 0.999)).rgb;
        vec3 deep = mix(vec3(0.004, 0.012, 0.014), vec3(0.03, 0.085, 0.09), uDay);
        vec3 c = mix(deep, refl, fres);
        // sun glint with roughness from the unresolved ripples
        vec3 Hh = normalize(V + uSunDir);
        float NdH = max(dot(N, Hh), 1e-3);
        float m2 = 0.0004 + lost * 1.6;
        float t2 = (1.0 - NdH * NdH) / (NdH * NdH);
        float D = exp(-t2 / m2) / (3.14159 * m2 * NdH * NdH * NdH * NdH);
        c += vec3(1.0, 0.9, 0.7) * D * 0.02 * 0.06 / max(dot(N, V), 0.05) * uDay * (1.0 - iced);
        c = mix(c, vec3(0.8, 0.82, 0.82) * (0.15 + 0.85 * uDay) + uCity * 0.02, clamp(foam, 0.0, 1.0) * 0.8);
        float cr = cracks(vPre * 0.05), cr2 = cracks(vPre * 0.21 + 3.0);
        vec3 iceC = vec3(0.15, 0.14, 0.13) * (0.75 + 0.25 * vn(vPre * 0.012)) + vec3(0.06, 0.055, 0.05) * vn(vPre * 0.5);
        iceC *= 1.0 - 0.25 * smoothstep(0.06, 0.0, cr) - 0.15 * smoothstep(0.05, 0.0, cr2);
        iceC += refl * 0.12;
        c = mix(c, iceC, iced);
        float edge = smoothstep(50.0, 0.0, abs(vShore - uIceR)) * (1.0 - iced) * uIce;
        c = mix(c, vec3(0.1, 0.095, 0.09), edge * 0.5);
        float fog = 1.0 - exp(-dist * uFogDensity);
        c = mix(c, uFogColor, fog);
        if (any(isnan(c)) || any(isinf(c))) c = uFogColor;
        gl_FragColor = vec4(clamp(c, 0.0, 40.0), 1.0);
      }`,
  });
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    frame(t, s, ctx) {
      uniforms.uDay.value = s.day;
      uniforms.uCity.value = ctx.city;
      uniforms.uSunDir.value.copy(ctx.sunDir);
      uniforms.uWaves.value = s.waves;
      uniforms.uIce.value = s.ice;
      uniforms.uIceR.value = s.ice <= 0 ? -100 : 8 * Math.pow(90, s.ice);
      uniforms.uFogColor.value.copy(ctx.fogColor);
      uniforms.uFogDensity.value = lerp(0.00007, 0.00014, s.day) + s.snowFall * 0.0011;
    },
  };
}

// dust and ash bursting out of a house as its roof caves in
function makeDust(caveIns) {
  const PER = 60, N = Math.max(1, caveIns.length * PER);
  const R = rng(66);
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  caveIns.forEach(({ hs, t0 }, ci) => {
    for (let k = 0; k < PER; k++) {
      const i = ci * PER + k, a = R() * 6.28;
      p0.set([hs.x + Math.cos(a) * hs.w * 0.4 * R(), hs.y0 + hs.h * (0.6 + 0.5 * R()), hs.z + Math.sin(a) * hs.d * 0.4 * R()], i * 3);
      prm.set([t0 + 0.2 + R() * 0.5, a, 3 + R() * 6, R()], i * 4);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const uniforms = { uTime: { value: 0 } };
  const mat = pointsMaterial(`uniform float uTime; attribute vec4 aPrm; varying float vA;
    void main(){
      float age = uTime - aPrm.x;
      if (age < 0.0 || age > 6.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float k = 1.0 - exp(-age * 1.2);
      vec3 p = position + vec3(cos(aPrm.y), 0.0, sin(aPrm.y)) * aPrm.z * k + vec3(0.0, 4.0 * k + age * 0.6, 0.0);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp((2.0 + 6.0 * k) * 1600.0 / -mv.z, 1.0, 120.0);
      vA = smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(2.5, 6.0, age)) * 0.3;
      #include <logdepthbuf_vertex>
    }`, `varying float vA;`, `vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 7.0); gl_FragColor = vec4(vec3(0.42, 0.39, 0.36) * a * vA, a * vA * 2.5);`,
    { uniforms, blending: THREE.NormalBlending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}
