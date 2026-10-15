// The suspension bridge on the right: two towers in the river, two main cables in long curves from bank to bank,
// hangers every 7 m down to the deck, cars crossing with their lights on. At ~10x the main cables snap at
// mid-span; the deck unzips from the middle outward and drops into the river, cars and all, throwing up spray;
// later (~18x) the towers buckle and fall.
import * as THREE from 'three';
import { BRIDGE, RIVER } from './layout.js';
import { smooth, clamp, lerp, rng } from './util.js';
import { gAt, vAtG } from './timeline.js';

const dummy = new THREE.Object3D();
const B = BRIDGE;
const NSEG = 40;                                    // deck pieces
const zAt = (i) => lerp(B.z0, B.z1, (i + 0.5) / NSEG);
const SEGL = (B.z0 - B.z1) / NSEG;
const MID = (B.t1 + B.t2) / 2;
// when each deck piece drops: the main span first (from the middle out), then the side spans
export const SEG_FALL = Array.from({ length: NSEG }, (_, i) => {
  const z = zAt(i);
  const main = z < B.t1 && z > B.t2;
  return B.v0 + 0.25 + (main ? Math.abs(z - MID) / (B.t1 - B.t2) * 0.9 : 1.0 + Math.min(Math.abs(z - B.t1), Math.abs(z - B.t2)) / 110 * 0.9);
});
export const TOWER_FALL = [vAtG(17), vAtG(21)];
// the main cable's resting curve (height at z): anchored at the banks, over the tower tops, sagging between
function cableY(z) {
  const deck = B.deck;
  if (z > B.t1) { const k = (B.z0 - z) / (B.z0 - B.t1); return lerp(deck + 2, B.top, Math.pow(k, 1.6)); }
  if (z < B.t2) { const k = (z - B.z1) / (B.t2 - B.z1); return lerp(deck + 2, B.top, Math.pow(k, 1.6)); }
  const k = (z - MID) / ((B.t1 - B.t2) / 2);
  return deck + 3 + (B.top - deck - 3) * k * k;
}
// time to fall a height h at the gravity of the moment (plus a beat for the structure to give)
const dropT = (h, v) => Math.sqrt((2 * h) / (9.81 * gAt(v)));

export function makeBridge(scene, { plainMat, glowMat, fleet, carBase }) {
  const steel = plainMat(0x7c8691, 0.45, { metalness: 0.5 });
  const towerMat = plainMat(0xa8a39a, 0.7);
  // towers: two legs, cross beams; pivot at the waterline so they can topple
  const towers = [B.t1, B.t2].map((tz) => {
    const g = new THREE.Group();
    g.position.set(B.x, RIVER.water, tz);
    const h = B.top - RIVER.water + 2;
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, h, 4).translate(sx * (B.w / 2 + 1.5), h / 2, 0), towerMat);
      m.castShadow = true; g.add(m);
    }
    for (const y of [h - 4, h * 0.55, B.deck - RIVER.water - 2]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(B.w + 6, 2.5, 3).translate(0, y, 0), towerMat);
      m.castShadow = true; g.add(m);
    }
    const pier = new THREE.Mesh(new THREE.BoxGeometry(B.w + 12, 10, 12).translate(0, -4, 0), towerMat);
    g.add(pier);
    scene.add(g);
    return g;
  });
  // deck pieces (road slab + a stiffening truss face on each side)
  const deckGeo = new THREE.BoxGeometry(B.w, 1.6, SEGL + 0.02);
  const deck = new THREE.InstancedMesh(deckGeo, plainMat(0x4c4f54, 0.8), NSEG);
  const truss = new THREE.InstancedMesh(new THREE.BoxGeometry(B.w + 1.2, 2.6, SEGL + 0.02).translate(0, -1.6, 0), steel, NSEG);
  deck.castShadow = truss.castShadow = true; deck.frustumCulled = truss.frustumCulled = false;
  scene.add(deck, truss);
  // main cables (2) as runs of short pieces, and the hangers
  const NC = 90;
  const cableGeo = new THREE.CylinderGeometry(0.45, 0.45, 1, 6).translate(0, 0.5, 0);
  const cables = new THREE.InstancedMesh(cableGeo, steel, NC * 2);
  cables.frustumCulled = false; scene.add(cables);
  const NH = Math.floor((B.z0 - B.z1) / 7);
  const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 4).translate(0, 0.5, 0), steel, NH * 2);
  hangers.frustumCulled = false; scene.add(hangers);
  // lamps along the deck (glow points, drawn by world.js)
  const R = rng(91);
  // the cars on the deck: [index in the fleet, lane, start offset, speed]
  const cars = [];
  for (let k = 0; k < 22; k++) cars.push({ lane: k % 2, off: R() * (B.z0 - B.z1), speed: (11 + R() * 4) * (k % 2 ? 1 : -1), i: carBase + k });

  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  const segment = (mesh, i, p0, p1) => {
    dir.subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-3) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); return; }
    q.setFromUnitVectors(up, dir.normalize());
    dummy.position.copy(p0); dummy.quaternion.copy(q); dummy.scale.set(1, len, 1); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    dummy.quaternion.identity();
  };
  // deck piece pose at time v: [y, rx (pitch), fallen 0..1]
  function segPose(i, v) {
    const vf = SEG_FALL[i];
    const h = B.deck - RIVER.bed;
    const T = dropT(B.deck - RIVER.water, vf) * 1.6;
    const k = clamp((v - vf) / T);
    const y = B.deck - (B.deck - RIVER.water + 1) * k * k - smooth(vf + T, vf + T + 1.5, v) * 4;
    const z = zAt(i);
    const side = z > MID ? 1 : -1;
    return { y, rx: side * 0.5 * k * (0.6 + 0.4 * Math.sin(i * 2.1)), k };
  }
  const deckY = (z, v) => {
    const i = clamp(Math.floor((B.z0 - z) / SEGL), 0, NSEG - 1);
    return segPose(i, v);
  };
  return {
    towers,
    cars,
    deckY,
    frame(v, s, ctx) {
      for (let i = 0; i < NSEG; i++) {
        const p = segPose(i, v);
        dummy.position.set(B.x, p.y, zAt(i)); dummy.rotation.set(p.rx, 0, 0.15 * p.k * Math.sin(i * 1.3)); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        deck.setMatrixAt(i, dummy.matrix); truss.setMatrixAt(i, dummy.matrix);
      }
      deck.instanceMatrix.needsUpdate = true; truss.instanceMatrix.needsUpdate = true;
      // towers: buckle and topple into the river (one toward each bank)
      towers.forEach((t, j) => {
        t.visible = v < vAtG(1500);   // (by then pressed into the river bed)
        const vf = TOWER_FALL[j];
        const T = dropT(B.top, vf) * 2.2;
        const k = clamp((v - vf) / T);
        t.rotation.set((j === 0 ? -1 : 1) * 1.45 * k * k, 0, 0.12 * k);
        t.scale.y = 1 - 0.35 * smooth(0, 1, k);
      });
      // cables: snap at mid-span at B.v0, the two halves whip down onto the falling deck and into the water
      const snap = smooth(B.v0, B.v0 + dropT(30, B.v0) * 2.5, v);
      for (let c = 0; c < 2; c++) {
        const cx = B.x + (c ? 1 : -1) * (B.w / 2 + 1.5);
        let prev = null;
        for (let i = 0; i <= NC; i++) {
          const z = lerp(B.z0, B.z1, i / NC);
          let y = cableY(z);
          const main = z < B.t1 && z > B.t2;
          if (main) {
            const fallen = Math.min(deckY(z, v).y + 4, y);
            const kk = snap * clamp(1.2 - Math.abs(z - MID) / ((B.t1 - B.t2) / 2) * 0.4);
            y = lerp(y, Math.max(fallen, RIVER.water - 1), kk);
          } else {
            y = lerp(y, Math.max(deckY(z, v).y + 2, RIVER.water - 1), smooth(B.v0 + 0.4, B.v0 + 1.6, v) * 0.85);
          }
          // the towers carry the cable tops with them as they fall
          const p = new THREE.Vector3(cx, y, z);
          if (prev && !(main && Math.abs(z - MID) < (B.z0 - B.z1) / NC && snap > 0)) segment(cables, c * NC + i - 1, prev, p);
          else if (prev) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); cables.setMatrixAt(c * NC + i - 1, dummy.matrix); }
          prev = p;
        }
      }
      cables.instanceMatrix.needsUpdate = true;
      cables.visible = hangers.visible = deck.visible = truss.visible = v < vAtG(1500);
      // hangers: taut until the cable snaps, then gone
      for (let c = 0; c < 2; c++) {
        const cx = B.x + (c ? 1 : -1) * (B.w / 2 + 1.5);
        for (let i = 0; i < NH; i++) {
          const z = B.z0 - 3.5 - i * 7;
          const gone = snap > 0.05;
          if (gone) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); hangers.setMatrixAt(c * NH + i, dummy.matrix); continue; }
          a.set(cx, B.deck + 0.8, z); b.set(cx, cableY(z), z);
          segment(hangers, c * NH + i, a, b);
        }
      }
      hangers.instanceMatrix.needsUpdate = true;
    },
  };
}
