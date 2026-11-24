// Everything that stays put: the street, the buildings (facade.js), the balconies on the residential block, shop
// signs, street lamps, trees, the tallest tower's deck, crown and spire, and the mountain (mountain.js).
// Everything under the water line fades into the murk (drown.js); the water itself is water.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, BAL, ROAD, WALK, LAMPS, SIGNS, TREES, TOWER, TOWER_B, SUMMIT } from './layout.js';
import { facadeMaterial } from './facade.js';
import { drownMat } from './drown.js';
import { polarTerrain, terrainMaterial } from './terrain.js';
import { mtnH, makeMountainStuff } from './mountain.js';
import { rng } from './util.js';

export { mtnH };

let seedR = 7;
const rnd = () => ((seedR = (seedR * 16807) % 2147483647) / 2147483647);   // seeded (both render Chromes must draw the same)
export function makeWorld(scene) {
  const group = [];
  const P = (c, r = 0.85, extra = {}) => drownMat(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, ...extra }));
  const add = (m) => { m.frustumCulled = false; scene.add(m); group.push(m); return m; };

  // ---- the ground: the avenue (wet asphalt, lane lines), the sidewalks, the rest of the plain ----
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1024;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a2b2d'; g.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(rnd() * 256, rnd() * 1024, 2, 2); }
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

  // ---- the mountain (its town, road, trail, summit cross: mountain.js) ----
  const tmat = terrainMaterial({ uSnow: { value: 1750 }, uTree: { value: 1350 } });
  const terrain = polarTerrain(mtnH, SUMMIT.x, SUMMIT.z, 0.6, 90000, 900, 360, tmat);
  add(terrain);
  const mtn = makeMountainStuff(scene);
  for (const m of mtn.group) group.push(m);

  return { group, BALCONIES, TW, terrain, tmat, mtn };
}
