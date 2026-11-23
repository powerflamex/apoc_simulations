// Everything that stays put: the street, the buildings (facade.js), the balconies on the residential block, shop
// signs, street lamps, trees, the tallest tower's deck, crown and spire, and the mountain with the summit station.
// Everything under the water line fades into the murk (drown.js); the water itself is water.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, BAL, ROAD, WALK, LAMPS, SIGNS, TREES, TOWER, TOWER_B, SUMMIT } from './layout.js';
import { facadeMaterial } from './facade.js';
import { drownMat } from './drown.js';
import { polarTerrain, terrainMaterial, ridged, fbm } from './terrain.js';
import { rng } from './util.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function peak(x, z, cx, cz, H, faces, slope) {
  const dx = x - cx, dz = z - cz;
  let m = 0;
  for (const [f, s] of faces) { const a = f * Math.PI / 180; m = Math.max(m, (dx * Math.cos(a) + dz * Math.sin(a)) * (s ?? slope)); }
  return H - m;
}
// the mountain: a sheer granite peak (its city face ~74°), a lower range round it, flat land elsewhere (the city
// plane covers the city; the terrain dips just under it there)
export function mtnH(x, z) {
  const dx = x - SUMMIT.x, dz = z - SUMMIT.z, r = Math.hypot(dx, dz);
  // faces: angle (0 = +x, 90 = +z toward the city) and steepness (rise per metre)
  let h = peak(x, z, SUMMIT.x, SUMMIT.z, SUMMIT.h, [[90, 3.3], [20, 1.6], [160, 1.7], [-60, 1.25], [-120, 1.3]], 1.5);
  h += 70 * (ridged(x / 420 + 3, z / 420 - 2, 5) - 0.5) * sm(30, 260, r) * sm(150, 900, h);
  h += 20 * (ridged(x / 90, z / 90, 4) - 0.5) * sm(25, 120, r);
  // the summit: a small flat-topped crown for the station
  if (r < 45) h = Math.max(h, SUMMIT.h - 0.004 * r * r - Math.max(0, r - 19) * 4.0);
  h = Math.min(h, SUMMIT.h - 0.004 * r * r);
  // the range behind (all lower than the summit)
  h = Math.max(h, peak(x, z, -900, -1900, 1420, [[90, 1.4], [0, 1.2], [180, 1.2], [-90, 1.1]], 1.2) + 60 * (ridged(x / 500, z / 500 + 4, 5) - 0.5));
  h = Math.max(h, peak(x, z, 1250, -2100, 1560, [[90, 1.5], [0, 1.1], [180, 1.3], [-90, 1.0]], 1.2) + 60 * (ridged(x / 520 + 7, z / 520, 5) - 0.5));
  h = Math.max(h, peak(x, z, -2600, -3400, 1300, [[60, 0.9], [-30, 0.8], [150, 0.9], [240, 0.8]], 0.9));
  h = Math.max(h, peak(x, z, 2900, -3800, 1480, [[100, 0.9], [10, 0.8], [190, 0.8], [280, 0.9]], 0.9));
  h = Math.max(h, peak(x, z, 300, -4200, 1650, [[90, 0.8], [0, 0.9], [180, 0.9], [270, 0.8]], 0.8));
  // low hills round the far edges of the plain
  const far = sm(6000, 14000, Math.hypot(x, z + 600));
  h = Math.max(h, far * (60 + 500 * ridged(x / 6000 + 1, z / 6000 + 2, 5)));
  // flat where the city is
  const city = (1 - sm(1500, 2200, Math.abs(x))) * sm(-700, -560, z) * (1 - sm(2000, 2600, z));
  return h * (1 - city) - 3 * city;
}

export function makeWorld(scene) {
  const group = [];
  const P = (c, r = 0.85, extra = {}) => drownMat(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, ...extra }));
  const add = (m) => { m.frustumCulled = false; scene.add(m); group.push(m); return m; };

  // ---- the ground: the avenue (wet asphalt, lane lines), the sidewalks, the rest of the plain ----
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1024;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a2b2d'; g.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(Math.random() * 256, Math.random() * 1024, 2, 2); }
    g.fillStyle = '#d8b030'; g.fillRect(126, 0, 2, 1024); g.fillRect(130, 0, 2, 1024);   // double yellow
    g.fillStyle = '#d8d8d0';
    for (const x of [0.5 - 6.15 / 21, 0.5 + 6.15 / 21]) for (let y = 0; y < 1024; y += 64) g.fillRect(x * 256 - 1, y, 3, 30);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 12); tex.anisotropy = 8;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, 700).rotateX(-Math.PI / 2).translate(0, 0.0, -120), P(0xffffff, 0.35, { map: tex }));
    add(road);
    const walk = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(WALK - ROAD, 0.16, 700).translate(-(ROAD + WALK) / 2, 0.08, -120),
      new THREE.BoxGeometry(WALK - ROAD, 0.16, 700).translate((ROAD + WALK) / 2, 0.08, -120),
    ]), P(0x6c6a66, 0.6));
    add(walk);
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2).translate(0, -0.02, 0), P(0x3a3a38, 0.9));
    add(plain);
  }

  // ---- buildings ----
  {
    const n = B.length;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const aS = new Float32Array(n * 4);
    B.forEach((b, i) => aS.set([b.seed, b.kind, b.lit, b.h], i * 4));
    geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
    const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    B.forEach((b, i) => { m4.makeTranslation(b.x, 0, b.z).multiply(new THREE.Matrix4().makeScale(b.w, b.h, b.d)); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.set(b.col)); });
    add(mesh);
    const crowns = B.filter((b) => b.crown);
    const cg = new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const cm = new THREE.InstancedMesh(cg, P(0x8a9298, 0.4, { metalness: 0.5, emissive: 0x223344 }), Math.max(1, crowns.length));
    crowns.forEach((b, i) => cm.setMatrixAt(i, m4.makeTranslation(b.x, b.h, b.z).multiply(new THREE.Matrix4().makeScale(b.w * 0.8, b.w * 0.7, b.d * 0.8))));
    add(cm);
    // roof clutter: AC boxes and water tanks on the low roofs (they read as roofs going under)
    const R = rng(12);
    const boxes = [];
    for (const b of B) {
      if (b.h > 60 || b.balcony) continue;
      const k = 2 + Math.floor(R() * 3);
      for (let j = 0; j < k; j++) boxes.push([b.x + (R() - 0.5) * b.w * 0.6, b.h, b.z + (R() - 0.5) * b.d * 0.6, 1.5 + R() * 2.5, 1 + R() * 1.5, 1.5 + R() * 2.5]);
    }
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), P(0x8c8c88, 0.7), boxes.length);
    boxes.forEach(([x, y, z, w, h, d], i) => bm.setMatrixAt(i, m4.makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(w, h, d))));
    add(bm);
    // parapets round every low roof
    const par = [];
    for (const b of B) if (b.h < 90) for (const [ox, oz, w, d] of [[0, b.d / 2, b.w, 0.3], [0, -b.d / 2, b.w, 0.3], [b.w / 2, 0, 0.3, b.d], [-b.w / 2, 0, 0.3, b.d]]) par.push([b.x + ox, b.h, b.z + oz, w, 0.9, d]);
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), P(0x77736c, 0.8), par.length);
    par.forEach(([x, y, z, w, h, d], i) => pm.setMatrixAt(i, m4.makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(w, h, d))));
    add(pm);
  }

  // ---- the balconies on the residential block's street face (x = BAL.x0): a slab and a railing each ----
  const BALCONIES = [];
  {
    const m4 = new THREE.Matrix4();
    const bays = [];
    for (let z = BAL.z1 - 3.2; z > BAL.z0 + 2; z -= 5.4) bays.push(z);
    for (let f = 1; f < BAL.floors; f++) for (const z of bays) BALCONIES.push({ x: BAL.x0 - 0.7, y: BAL.g0 + (f - 1) * BAL.fh, z, f });
    const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.45, 0.22, 4.2), P(0xd8d2c6, 0.7), BALCONIES.length);
    const rail = new THREE.InstancedMesh(mergeGeometries([
      new THREE.BoxGeometry(0.06, 0.06, 4.2).translate(-0.7, 1.05, 0),
      ...[-2.05, -1.0, 0, 1.0, 2.05].map((zz) => new THREE.BoxGeometry(0.05, 1.0, 0.05).translate(-0.7, 0.55, zz)),
      new THREE.BoxGeometry(1.45, 0.06, 0.06).translate(0, 1.05, 2.07), new THREE.BoxGeometry(1.45, 0.06, 0.06).translate(0, 1.05, -2.07),
    ]), P(0x2a2c30, 0.4, { metalness: 0.6 }), BALCONIES.length);
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.9, 4.1).translate(-0.7, 0.55, 0),
      drownMat(new THREE.MeshStandardMaterial({ color: 0x9fc4d0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false })), BALCONIES.length);
    glass.renderOrder = 1;
    BALCONIES.forEach((b, i) => { m4.makeTranslation(b.x, b.y, b.z); slab.setMatrixAt(i, m4); rail.setMatrixAt(i, m4); glass.setMatrixAt(i, m4); });
    add(slab); add(rail); add(glass);
  }

  // ---- shop signs (lit) ----
  {
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), P(0xffffff, 0.5, { emissive: 0xffffff, emissiveIntensity: 1.7 }), SIGNS.length);
    const PAL = [0xff3b3b, 0x2ad0ff, 0xffd02a, 0x4bff6a, 0xff5ad8, 0xffffff, 0xff8a1e];
    SIGNS.forEach((s, i) => {
      m4.makeTranslation(s.x - s.side * 0.2, s.y, s.z).multiply(new THREE.Matrix4().makeScale(0.25, 0.85, s.w));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.set(PAL[Math.floor(s.hue * PAL.length)]));
    });
    add(mesh);
  }

  // ---- street lamps (poles; the lights are glows in main.js) and trees ----
  {
    const m4 = new THREE.Matrix4();
    const pole = new THREE.InstancedMesh(mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.12, 8, 8).translate(0, 4, 0),
      new THREE.BoxGeometry(0.1, 0.1, 1.8).translate(0, 7.9, 0.85),
      new THREE.BoxGeometry(0.35, 0.16, 0.7).translate(0, 7.82, 1.7),
    ]), P(0x3a3d40, 0.5, { metalness: 0.5 }), LAMPS.length);
    LAMPS.forEach((l, i) => { m4.makeRotationY(l.side > 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(l.x, 0, l.z); pole.setMatrixAt(i, m4); });
    add(pole);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 6).translate(0, 1.6, 0), P(0x3b2a1e, 0.9), TREES.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1).translate(0, 4.6, 0), P(0x2f5a2c, 0.9), TREES.length);
    TREES.forEach((t, i) => { m4.makeScale(t.s, t.s, t.s).setPosition(t.x, 0, t.z); trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4); });
    add(trunk); add(crown);
  }

  // ---- the tallest tower: roof deck with a railing, a lit crown band, the spire ----
  const TW = { deckY: TOWER.h, top: TOWER.h + TOWER.spire };
  {
    const t = TOWER_B, w = t.w;
    const crown = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(w + 0.6, 1.2, w + 0.6).translate(0, TOWER.h - 6, 0),
      new THREE.BoxGeometry(w + 0.6, 0.8, w + 0.6).translate(0, TOWER.h - 14, 0),
    ]), P(0xbfe4ff, 0.3, { emissive: 0x9fd8ff, emissiveIntensity: 2.2 }));
    crown.position.set(t.x, 0, t.z);
    add(crown);
    const rail = [];
    for (const s of [-1, 1]) { rail.push(new THREE.BoxGeometry(w, 0.08, 0.08).translate(0, TOWER.h + 1.1, s * (w / 2 - 0.2))); rail.push(new THREE.BoxGeometry(0.08, 0.08, w).translate(s * (w / 2 - 0.2), TOWER.h + 1.1, 0)); }
    for (let k = -w / 2 + 0.2; k <= w / 2 - 0.2; k += 2.1) for (const s of [-1, 1]) { rail.push(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(k, TOWER.h + 0.55, s * (w / 2 - 0.2))); rail.push(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(s * (w / 2 - 0.2), TOWER.h + 0.55, k)); }
    const rm = new THREE.Mesh(mergeGeometries(rail), P(0x2a2c30, 0.4, { metalness: 0.6 }));
    rm.position.set(t.x, 0, t.z); add(rm);
    const deck = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(12, 4.5, 12).translate(0, TOWER.h + 2.25, 0),          // the lift housing
      new THREE.CylinderGeometry(0.45, 1.6, TOWER.spire, 8).translate(0, TOWER.h + TOWER.spire / 2, 0),
    ]), P(0x9aa2aa, 0.5, { metalness: 0.4 }));
    deck.position.set(t.x, 0, t.z); add(deck);
  }

  // ---- the mountain and the summit station ----
  const tmat = terrainMaterial({ uSnow: { value: 1050 }, uTree: { value: 420 } });
  const terrain = polarTerrain(mtnH, SUMMIT.x, SUMMIT.z, 0.8, 90000, 720, 340, tmat);
  add(terrain);
  {
    const y = SUMMIT.h - 0.2;
    const st = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(14, 5.2, 9).translate(-6, y + 2.6, -4),                  // the station
      new THREE.BoxGeometry(15, 0.3, 10).translate(-6, y + 5.3, -4),                 // its roof
      new THREE.CylinderGeometry(0.18, 0.35, 26, 6).translate(-11, y + 13, -7),      // the mast
      new THREE.BoxGeometry(20, 0.35, 14).translate(3, y + 0.2, 4),                  // the deck
    ]), P(0xc8c4bc, 0.7));
    st.position.set(SUMMIT.x, 0, SUMMIT.z); add(st);
    const win = new THREE.Mesh(new THREE.BoxGeometry(14.1, 1.6, 9.1).translate(-6, y + 3.0, -4), P(0x223040, 0.2, { emissive: 0xffd9a0, emissiveIntensity: 0.9 }));
    win.position.set(SUMMIT.x, 0, SUMMIT.z); add(win);
    const rail = [];
    for (const [x0, z0, x1, z1] of [[-7, 11, 13, 11], [13, 11, 13, -3], [-7, 11, -7, 0.5]]) {
      const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
      rail.push(new THREE.BoxGeometry(L, 0.07, 0.07).rotateY(-a).translate((x0 + x1) / 2, y + 1.4, (z0 + z1) / 2));
      for (let k = 0; k <= L; k += 2) rail.push(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(x0 + (x1 - x0) * k / L, y + 0.9, z0 + (z1 - z0) * k / L));
    }
    const rm = new THREE.Mesh(mergeGeometries(rail), P(0x303236, 0.4, { metalness: 0.6 }));
    rm.position.set(SUMMIT.x, 0, SUMMIT.z); add(rm);
  }

  return { group, BALCONIES, TW, terrain, tmat };
}
