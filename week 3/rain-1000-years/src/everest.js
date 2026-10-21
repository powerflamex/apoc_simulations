// The Himalaya round Everest (local metres: the summit at x = z = 0, 8,849 m up; x north, z east).
// Everest is a three-sided pyramid (north face, south-west face, Kangshung face) with sharp ridges; Lhotse (8,516 m)
// 3 km south across the South Col, Nuptse's long wall (7,861 m) to the south-west, Makalu (8,485 m) 19 km south-east,
// Cho Oyu (8,188 m) 28 km west, the rest a sea of 6-7,000 m ridges. At the end: the last people on dry land, four
// climbers on the summit with their headlamps on, and the prayer flags.
import * as THREE from 'three';
import { polarTerrain, terrainMaterial, ridged, fbm } from './terrain.js';
import { rng } from './util.js';
import { drownMat } from './drown.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a pyramid peak: height falls off along the steepest of its faces (directions in degrees, compass: 0 = north)
function peak(x, z, cx, cz, H, faces, slope) {
  const dx = x - cx, dz = z - cz;
  let m = 0;
  for (const f of faces) { const a = f * Math.PI / 180; m = Math.max(m, dx * Math.cos(a) + dz * Math.sin(a)); }
  return H - m * slope;
}
export function everestH(x, z) {
  const r = Math.hypot(x, z);
  // the range: ridged noise ~4,000-7,000 m, lower along the valley we come in by (from the south-west)
  const along = -(x + z) * 0.7071, across = Math.abs(x - z) * 0.7071;
  const valley = along > 0 ? 0.3 + 0.7 * sm(1400, 3500, across - along * 0.08) : 1;
  let h = 3900 + 3000 * ridged(x / 9000 + 11, z / 9000 - 4, 6) * valley;
  // the peaks (each with its own faces); the highest wins
  h = Math.max(h, peak(x, z, 0, 0, 8849, [0, 120, 240], 1.05) + 25 * (ridged(x / 300, z / 300, 4) - 0.5) * sm(15, 120, r));
  h = Math.max(h, peak(x, z, -3100, 300, 8516, [10, 130, 250], 1.15) + 30 * (ridged(x / 280 + 3, z / 280, 4) - 0.5));
  h = Math.max(h, peak(x, z, -2200, -2600, 7861, [-30, 60, 150, 240], 0.95) + 30 * (ridged(x / 300, z / 300 + 5, 4) - 0.5));
  h = Math.max(h, peak(x, z, -14000, 14500, 8485, [0, 100, 200, 300], 1.0));
  h = Math.max(h, peak(x, z, 2000, -28000, 8188, [30, 150, 270], 0.8));
  // big gullies and buttresses on the faces (so the peaks aren't clean pyramids), none near the summit
  h += 260 * (ridged(x / 1700 + 3, z / 1700 - 2, 5) - 0.5) * sm(150, 1600, r) * sm(5800, 7000, h);
  // the summit: a short snow ridge, rounded off over the last few metres
  if (r < 40) h = Math.min(h, 8849 - r * r * 0.004 - 0.02 * r);
  // snow ribs and couloirs on the faces (so it isn't one smooth plane)
  h += 18 * (ridged(x / 160, z / 160, 4) - 0.5) * sm(30, 200, r);
  return h;
}

export function makeEverest(scene, crowd, crowdBase) {
  const mat = terrainMaterial({ uSnow: { value: 5000 }, uTree: { value: 3800 } });
  const mesh = polarTerrain(everestH, 0, 0, 1.2, 60000, 720, 330, mat);
  scene.add(mesh);
  // climbers on the summit, in bright down suits, a couple of metres apart along the ridge
  const R = rng(8848);
  const CLIMB = [
    { x: -1.4, z: 0.8, yaw: 2.2, col: [0xd8261c, 0x1b1b1b, 0xe0ac86, 0x111111], armL: 1.6, armR: 0.2 },
    { x: 0.9, z: 1.6, yaw: 2.9, col: [0xf0b020, 0x202020, 0xc68a62, 0x1d1612], armL: 0.3, armR: 0.4 },
    { x: 2.6, z: -0.6, yaw: 3.4, col: [0x2a5ad8, 0x1b1b1b, 0xf1c8a6, 0x2e2018], armL: 0.9, armR: 1.1 },
    { x: -3.2, z: -1.4, yaw: 1.7, col: [0xe85a12, 0x202020, 0x9a6440, 0x151515], armL: 0.2, armR: 0.5 },
  ];
  CLIMB.forEach((c, i) => { c.y = everestH(c.x, c.z); crowd.color(crowdBase + i, ...c.col); c.seed = R(); });
  // the prayer flags: a string of small cloth squares from the summit pole down the ridge
  const FL = [];
  const pole = { x: 0.2, z: -0.3 };
  for (const [ex, ez] of [[-9, 6], [7, 7], [5, -9]]) for (let k = 1; k <= 14; k++) {
    const t = k / 15;
    const x = pole.x + (ex - pole.x) * t, z = pole.z + (ez - pole.z) * t;
    FL.push({ x, z, y: everestH(pole.x, pole.z) + 1.7 * (1 - t) + everestH(x, z) * 0 + 0.5 * t * 0, t, col: [0x2a5ad8, 0xf2f2f2, 0xd8261c, 0x2a9a3a, 0xf0c020][k % 5] });
  }
  FL.forEach((f) => { f.y = Math.max(everestH(f.x, f.z) + 0.5, everestH(pole.x, pole.z) + 1.9 - 1.6 * f.t - 0.6 * Math.sin(Math.PI * f.t)); });
  const flagMat = drownMat(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x222222 }));
  const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.32, 0.38).translate(0, -0.19, 0), flagMat, FL.length);
  const c = new THREE.Color();
  FL.forEach((f, i) => flags.setColorAt(i, c.set(f.col)));
  flags.frustumCulled = false;
  const poleM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.0, 6).translate(0, 1.0, 0), drownMat(new THREE.MeshStandardMaterial({ color: 0x777777 })));
  poleM.position.set(pole.x, everestH(pole.x, pole.z), pole.z);
  scene.add(flags, poleM);
  const dummy = new THREE.Object3D();
  return {
    group: [mesh, flags, poleM], mat, CLIMB,
    frame(v, glows, level) {
      FL.forEach((f, i) => {
        dummy.position.set(f.x, f.y, f.z);
        dummy.rotation.set(0.25 * Math.sin(v * 7 + i), Math.atan2(-6, 6) + 0.6 * Math.sin(v * 5.3 + i * 1.7), 0.15 * Math.sin(v * 9 + i * 2));
        dummy.updateMatrix(); flags.setMatrixAt(i, dummy.matrix);
      });
      flags.instanceMatrix.needsUpdate = true;
      CLIMB.forEach((c2) => {
        if (c2.y + 1.75 > level) glows.add(c2.x + Math.sin(c2.yaw) * 0.2, c2.y + 1.68, c2.z + Math.cos(c2.yaw) * 0.2, 0.35, 5, 5, 4.4);
      });
    },
    pose(v, crowd, base) {
      CLIMB.forEach((c2, i) => {
        const wave = c2.armL > 1.2 ? 1.5 + 0.25 * Math.sin(v * 5) : c2.armL;
        crowd.pose(base + i, { x: c2.x, y: c2.y, z: c2.z, yaw: c2.yaw + 0.15 * Math.sin(v * 0.7 + c2.seed * 9), s: 1.04, walk: 0, stride: 0, sit: 0.1, pitch: 0.05, armL: wave, armR: c2.armR, look: 0.15 });
      });
    },
  };
}
