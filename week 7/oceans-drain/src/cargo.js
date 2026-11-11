// Shot 3, the cargo ship (0:13.1-0:17.3, about -3,000 ft): a container ship on the mud, heeled over, its boxes spilled
// in a trail towards you. The steel boxes are the size of trucks; people walk between them.
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { box, cyl, rod, merge, propMaterial, canvasTex, rust, hullGeo, railing } from './build.js';
import { makeDrips } from './drips.js';
import { cast } from './people.js';
import { walker, dripLine } from './wreck.js';
import { fbm } from './noise.js';
import { V_CARGO, V_VENTS } from './timeline.js';
import { rng, smooth, lerp, DEG } from './util.js';

const SHIP = { x: -30, z: -158, yaw: -1.05, heel: 0.2 };
const BOXC = [0xd8402c, 0x2f6fc0, 0xf0b82a, 0x2f9a5a, 0xe8742a, 0xf2f0ea, 0x18a0a0, 0x7a3fb0, 0xb02a3a, 0x3a4a6a];
const hCargo = (x, z) => 0.016 * z + 0.7 * (fbm(x * 0.03, z * 0.03) - 0.5);

export function makeCargo(ctx) {
  const group = new THREE.Group();
  const h = hCargo;
  const grid = makeGrid(h, { zNear: 20, zFar: -8000, w0: 60, w1: 8000, nx: 120, nz: 180, p: 2.3 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xa8906a, colB: 0x8e7858, patch: 0xc8b890, patchAmt: 0.5, patchS: 0.09, patchT: 0.55, scale: 0.04, ripple: 0.5, pebble: 0.3 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));
  const R = rng(404);

  // ---- the ship ----
  const ship = new THREE.Group();
  const L = 176, D = 19;
  const Hh = hullGeo({ L, B: 29, D, bow: 0.22, stern: 0.16, transom: 0.8, sheer: 2.6, sheerStern: 0.3, rake: 6, sternRake: 2, eMid: 0.3, deckColor: 0x5a3a30, nL: 52 });
  const tex = canvasTex(1024, 256, (g, w, hh) => {
    g.fillStyle = '#1d3158'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#8a2c20'; g.fillRect(0, hh * 0.48, w, hh);
    g.fillStyle = '#e8e4d8'; g.fillRect(0, hh * 0.45, w, hh * 0.03);
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i * w / 60, 0, 1.2, hh); }
    rust(g, w, hh, R, { blotches: 260, runs: 300, alpha: 0.5 });
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(226,220,200,${0.2 + R() * 0.4})`; g.fillRect(R() * w, hh * (0.5 + R() * 0.5), 1 + R() * 3, 1 + R() * 2); }
  });
  ship.add(new THREE.Mesh(Hh.hull, propMaterial({ map: tex, vertexColors: false, side: THREE.DoubleSide, rough: 0.6, gloss: 0.5 })));
  const P = [Hh.deck];
  // the accommodation block near the stern: white, bands of windows, bridge wings, the funnel behind it
  const ax = -62;
  for (let k = 0; k < 6; k++) P.push(box(15, 2.9, 27 - k * 1.2, 0xf1eee6, ax, D + 1.5 + k * 3, 0), box(15.1, 1.0, 27.1 - k * 1.2, 0x1a2630, ax + 0.02, D + 1.9 + k * 3, 0));
  P.push(box(8, 2.6, 34, 0xf1eee6, ax + 3, D + 19.2, 0), box(8.1, 1.1, 34.1, 0x16222c, ax + 3.02, D + 19.6, 0), cyl(0.2, 0.3, 9, 0xe8e8e8, ax + 3, D + 25, 0));
  P.push(box(7, 9, 8, 0x1e4f9a, ax - 10, D + 13, 0), box(7.1, 1.6, 8.1, 0xf2f0ea, ax - 10, D + 15, 0));
  // three yellow deck cranes
  for (const cx of [-34, 4, 42]) P.push(box(3.4, 13, 3.4, 0xe8b420, cx, D + 6.5, 0), box(4.6, 3, 4.6, 0xe8b420, cx, D + 14, 0), rod(cx, D + 15, 0, cx + 20, D + 20 + R() * 5, 3 - R() * 6, 0.5, 0xe8b420, 6));
  for (const sd of [-1, 1]) { const pts = []; for (let u = 0.03; u <= 0.99; u += 0.03) pts.push(Hh.edge(u, sd)); P.push(...railing(pts, 1.2, 0xd8d8d0, 0.07)); }
  const partsMesh = new THREE.Mesh(merge(P), propMaterial({ rough: 0.6, gloss: 0.35 }));
  ship.add(partsMesh);

  // the boxes: a ribbed steel container, 40 ft long
  const ctex = canvasTex(256, 64, (g, w, hh) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, hh);
    for (let i = 0; i < 64; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.0)'; g.fillRect(i * 4, 3, 2, hh - 6); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, hh - 3, w, 3);
    rust(g, w, hh, R, { blotches: 30, runs: 40, alpha: 0.3 });
  });
  const cgeo = new THREE.BoxGeometry(12.19, 2.59, 2.44);
  const cmat = propMaterial({ map: ctex, vertexColors: false, rough: 0.55, gloss: 0.4 });
  const tc = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
  // on deck: bays of stacks, more of them gone towards the bow and on the low side
  const onDeck = [];
  for (let bay = 0; bay < 8; bay++) {
    const x = -46 + bay * 13.2 + (bay > 2 ? 4 : 0) + (bay > 5 ? 4 : 0);
    for (let row = 0; row < 10; row++) {
      const z = (row - 4.5) * 2.55;
      const tiers = Math.max(0, Math.round(5 - bay * 0.35 - Math.max(0, z) * 0.28 - R() * 2.2));
      for (let t = 0; t < tiers; t++) onDeck.push({ x, y: D + 1.3 + 0.5 + t * 2.62, z });
    }
  }
  const deckBoxes = new THREE.InstancedMesh(cgeo, cmat, onDeck.length);
  onDeck.forEach((c, i) => { m4.makeTranslation(c.x, c.y, c.z); deckBoxes.setMatrixAt(i, m4); deckBoxes.setColorAt(i, tc.set(BOXC[Math.floor(R() * BOXC.length)])); });
  ship.add(deckBoxes);
  ship.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  ship.position.set(SHIP.x, h(SHIP.x, SHIP.z) - 3.2, SHIP.z);
  ship.rotation.set(SHIP.heel, SHIP.yaw, 0, 'YXZ');
  group.add(ship);
  ship.updateMatrixWorld(true);

  // spilled on the mud: a trail from the ship to you, and a few right by your path
  const spill = [
    // (kept to the sides of your path: the ship has to show between them)
    { x: -7.6, z: -13.5, yaw: 1.35, col: 0xd8402c }, { x: 8.2, z: -19, yaw: -1.25, col: 0x2f6fc0 }, { x: 8.6, z: -19.6, yaw: -1.05, col: 0xf0b82a, y: 2.62, roll: 0.05 },
    { x: -12.5, z: -30, yaw: 1.1, col: 0x2f9a5a, pitch: 0.16 }, { x: 13.5, z: -36, yaw: 1.9, col: 0xe8742a }, { x: -18, z: -47, yaw: 1.5, col: 0x18a0a0, up: 1 },
    { x: 19, z: -52, yaw: 0.2, col: 0xf2f0ea, roll: 0.5 }, { x: -9, z: -60, yaw: -0.3, col: 0x7a3fb0 }, { x: 6.5, z: -66, yaw: 2.3, col: 0xd8402c, pitch: -0.2 },
  ];
  for (let k = 0; k < 60; k++) {
    const u = Math.pow(R(), 0.8);
    spill.push({ x: lerp(-2, -22, u) + (R() - 0.5) * (40 + 40 * u), z: lerp(-72, -132, u) + (R() - 0.5) * 20, yaw: R() * 6.28, col: BOXC[Math.floor(R() * BOXC.length)], roll: R() < 0.3 ? (R() - 0.5) * 1.2 : 0, pitch: R() < 0.25 ? (R() - 0.5) * 0.5 : 0, y: R() < 0.2 ? 2.5 : 0 });
  }
  const spillMesh = new THREE.InstancedMesh(cgeo, cmat, spill.length);
  spill.forEach((c, i) => {
    e.set(c.up ? 0 : (c.roll || 0), c.yaw, c.up ? Math.PI / 2 - 0.08 : (c.pitch || 0), 'YXZ'); q.setFromEuler(e);
    m4.compose(p3.set(c.x, h(c.x, c.z) + (c.up ? 5.7 : 1.1) + (c.y || 0), c.z), q, s3);
    spillMesh.setMatrixAt(i, m4); spillMesh.setColorAt(i, tc.set(c.col));
  });
  spillMesh.castShadow = true; spillMesh.receiveShadow = true; spillMesh.frustumCulled = false;
  group.add(spillMesh);

  // water running off the ship's low side and the nearest boxes
  const em = [];
  { const pts = []; for (let u = 0.04; u <= 0.99; u += 0.004) { const p = Hh.edge(u, 1); pts.push(new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(ship.matrixWorld)); } dripLine(em, pts, h, { w: 0.35, len: 4 }); }
  for (const c of spill.slice(0, 6)) for (let k = 0; k < 14; k++) { const a = c.yaw, t = (k / 13 - 0.5) * 11.5, sd = k % 2 ? 1.25 : -1.25; em.push({ x: c.x + Math.cos(a) * t + Math.sin(a) * sd, y: h(c.x, c.z) + 2.3 + (c.y || 0), z: c.z - Math.sin(a) * t + Math.cos(a) * sd, fall: 2.3 + (c.y || 0), w: 0.05, len: 0.7 }); }
  const drips = makeDrips(group, em);

  const T = V_CARGO;
  const people = cast([
    walker(1.1, -5.6, 2.0, T, { hero: true, yaw: Math.PI + 0.05 }),
    walker(-1.6, -8.5, 1.9, T), walker(3.0, -10.5, 1.8, T, { yaw: Math.PI - 0.1 }), walker(-0.4, -21, 1.6, T),
    { x: -5.6, z: -12.6, act: 'touch', yaw: Math.PI + 1.2 }, { x: 5.6, z: -16.6, act: 'phone', lookUp: 0.3, yaw: Math.PI - 0.9 }, { x: -3.4, z: -19, act: 'point', yaw: Math.PI + 0.1 },
    { x: 1.0, z: -26, act: 'lookUp', yaw: Math.PI }, { x: -4.5, z: -33, act: 'point', yaw: Math.PI + 0.1, s: 0.66 }, { x: 5, z: -29, act: 'look', yaw: Math.PI },
  ], 31);

  const level = (v) => lerp(-1.6, -7.5, smooth(T - 0.2, V_VENTS + 0.2, v));
  function cam(v) {
    const t = v - T;
    return {
      x: 0.3, z: -2.0 * t, eye: 1.66 + 0.03 * Math.sin(t * 8.4),
      yaw: lerp(5, 3, smooth(0, 4, t)) * DEG, pitch: lerp(3.5, 6, smooth(0, 4, t)) * DEG, fov: 62,
    };
  }
  return {
    name: 'cargo', group, h, level, cam, people, flow: 0.8,
    frame(v) { drips.uniforms.uTime.value = v; drips.uniforms.uAmount.value = 1 - 0.3 * smooth(T, V_VENTS, v); },
  };
}
