// Shot 1, the shipwreck (0:04.8-0:07.5, about -100 ft): you are down on the seabed and an old steamer, rusted through,
// leans over you, still streaming water. Crabs run across the sand; giant kelp (it grows down to about 100 ft) lies flat
// where the water dropped it. Shot 3, the cargo ship, reuses the helpers here.
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { box, cyl, ball, rod, merge, propMaterial, canvasTex, rust, hullGeo, railing } from './build.js';
import { makeCrabs, makeKelp } from './creatures.js';
import { makeDrips } from './drips.js';
import { cast } from './people.js';
import { fbm } from './noise.js';
import { V_WRECK, V_WHALES } from './timeline.js';
import { rng, smooth, lerp, DEG } from './util.js';

// someone already walking when the shot starts: at (x, z) at time t, heading `yaw`, at sp m/s
export function walker(x, z, sp, t, extra = {}) {
  const yaw = extra.yaw ?? Math.PI, lead = 5;
  const d = sp * (lead - 0.35);
  return { x: x - Math.sin(yaw) * d, z: z - Math.cos(yaw) * d, sp, t0: t - lead, yaw, ...extra };
}
// drips along a line of world points, down to the ground
export function dripLine(out, pts, h, { every = 1, w = 0.05, len = 0.9 } = {}) {
  pts.forEach((p, i) => { if (i % every === 0) out.push({ x: p.x, y: p.y, z: p.z, fall: p.y - h(p.x, p.z), w: w * (0.6 + 0.8 * ((i * 0.618) % 1)), len }); });
}

// (seen from off its bow: the bow 17 m from you at the end of the shot, the stern 60 m off, both in frame)
const SHIP = { x: -5.2, z: -42, yaw: -1.137, heel: 0.24, sink: 1.5 };
function hWreck(x, z) {
  // a scour hollow round the hull
  const dx = x - SHIP.x, dz = z - SHIP.z, c = Math.cos(SHIP.yaw), s = Math.sin(SHIP.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const pit = Math.exp(-Math.pow(lx / 26, 4) - Math.pow(lz / 9, 2));
  return 0.02 * z + 0.5 * (fbm(x * 0.05, z * 0.05) - 0.5) - 0.5 * pit;
}

export function makeWreck(ctx) {
  const group = new THREE.Group();
  const h = hWreck;
  const grid = makeGrid(h, { zNear: 20, zFar: -8000, w0: 55, w1: 8000, nx: 120, nz: 190, p: 2.4 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xd2bd90, colB: 0xb9a476, patch: 0x5d6e34, patchAmt: 0.3, patchS: 0.16, patchT: 0.6, scale: 0.05, ripple: 1, pebble: 0.3 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));

  // ---- the steamer ----
  const ship = new THREE.Group();
  const R = rng(1912);
  const Hh = hullGeo({ L: 44, B: 9.2, D: 7.6, bow: 0.36, stern: 0.24, transom: 0.45, sheer: 1.7, rake: 2.4, sternRake: 1.6, eMid: 0.45, deckColor: 0x4a3526, nL: 44 });
  const tex = canvasTex(1024, 256, (g, w, hh) => {
    g.fillStyle = '#33271f'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#5c2617'; g.fillRect(0, hh * 0.52, w, hh);
    for (let i = 0; i < 44; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * w / 44, 0, 1.5, hh); }       // plate seams
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 1; k < 5; k++) g.fillRect(0, hh * k / 5, w, 1.5);
    rust(g, w, hh, R, { blotches: 900, runs: 420, alpha: 0.8 });
    for (let i = 0; i < 1100; i++) { g.fillStyle = `rgba(232,226,208,${0.25 + R() * 0.5})`; g.fillRect(R() * w, hh * (0.45 + R() * 0.55), 1 + R() * 3, 1 + R() * 2); }   // barnacles
    for (let i = 0; i < 160; i++) { const x = R() * w, L = hh * (0.04 + R() * 0.16), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, `rgba(62,92,40,${0.35 + R() * 0.4})`); gr.addColorStop(1, 'rgba(62,92,40,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + R() * 9, L); }   // weed hanging from the rail
    g.fillStyle = '#0a0806';
    for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(w * (0.12 + i * 0.03), hh * 0.2, 4, 0, 6.3); g.fill(); }                                                        // portholes
    for (let i = 0; i < 9; i++) { const x = R() * w, y = hh * (0.25 + R() * 0.4); g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.3, r = 3 + R() * 9; g.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r); } g.fill(); }   // rusted-through holes
  });
  const hullMesh = new THREE.Mesh(Hh.hull, propMaterial({ map: tex, vertexColors: false, side: THREE.DoubleSide, rough: 0.75, gloss: 0.5 }));
  const P = [Hh.deck];
  const RU = [0x6a4028, 0x7a4a2a, 0x54301e, 0x8a5630, 0x4a2c1c];
  const ru = () => RU[Math.floor(R() * RU.length)];
  const D = 7.6;
  P.push(box(7.5, 3.0, 6.6, ru(), -6, D + 1.5, 0), box(4.8, 2.5, 5.2, ru(), -6.6, D + 4.2, 0), box(4.9, 0.9, 5.3, 0x100c0a, -6.55, D + 4.5, 0));
  P.push(cyl(1.15, 1.35, 6, ru(), -11.2, D + 5.6, 0, 0, 0, 0.18, 14), cyl(1.25, 1.25, 0.6, 0x1a1412, -11.6, D + 7.7, 0, 0, 0, 0.18, 14));
  P.push(cyl(0.14, 0.22, 13, ru(), 9, D + 6.5, 0, 0, 0, -0.06, 8), rod(9, D + 9.5, -2.2, 9, D + 9.5, 2.2, 0.07, ru()), rod(9, D + 2, 0, 15.5, D + 7, 0.6, 0.09, ru()));
  P.push(cyl(0.13, 0.2, 9.5, ru(), -16.5, D + 4.2, 0, 0.25, 0, 0.3, 8), rod(-16.5, D + 1.5, 0, -11.5, D + 5.5, -0.8, 0.08, ru()));
  P.push(box(6.5, 0.9, 4.6, ru(), 3, D + 0.45, 0), box(5.5, 0.9, 4.0, ru(), 14.2, D + 1.0, 0, 0, 0, 0.06), box(2.2, 1.6, 2.4, ru(), 18.6, D + 1.9, 0));
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let u = 0.06; u <= 0.985; u += 0.035) pts.push(Hh.edge(u, sd));
    P.push(...railing(pts, 1.0, ru(), 0.04));
    P.push(box(1.2, 1.6, 0.3, 0x2a1e18, 18.3, D - 1.0, sd * (Hh.hb(0.92) + 0.25)));     // an anchor each side
  }
  const partsMesh = new THREE.Mesh(merge(P), propMaterial({ rough: 0.85, gloss: 0.35 }));
  ship.add(hullMesh, partsMesh);
  ship.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  ship.position.set(SHIP.x, h(SHIP.x, SHIP.z) - SHIP.sink + 1.2, SHIP.z);
  ship.rotation.set(SHIP.heel, SHIP.yaw, 0, 'YXZ');
  group.add(ship);
  ship.updateMatrixWorld(true);

  // water still streaming off it: from the deck edge and the rail on your side, the bow, the bridge
  const em = [];
  {
    const pts = [];
    for (let u = 0.05; u <= 0.99; u += 0.006) { const e = Hh.edge(u, 1); pts.push(new THREE.Vector3(e.x, e.y, e.z).applyMatrix4(ship.matrixWorld)); }
    dripLine(em, pts, h, { w: 0.09, len: 1.3 });
    const p2 = [];
    for (let u = 0.3; u <= 0.99; u += 0.012) { const e = Hh.side(u, 0.55, 1); p2.push(new THREE.Vector3(e.x, e.y, e.z + 0.2).applyMatrix4(ship.matrixWorld)); }
    dripLine(em, p2, h, { w: 0.07, len: 1.0 });
    const p3 = [];
    for (let k = 0; k < 40; k++) p3.push(new THREE.Vector3(-9.5 + R() * 7, D + 3 + R() * 2.4, 3.4).applyMatrix4(ship.matrixWorld));
    dripLine(em, p3, h, { w: 0.06, len: 1.0 });
  }
  const drips = makeDrips(group, em);

  // kelp lying flat all round, some of it draped against the hull
  const KELP = [];
  for (let k = 0; k < 46; k++) {
    const x = (R() - 0.5) * 36, z = 5 - R() * 44;
    KELP.push({ x, z, yaw: R() * 6.28, s: 0.6 + R() * 0.8, w: 0.5 + R() * 0.4 });
  }
  for (const [x, z, yaw] of [[-2.6, -4.2, 0.4], [1.4, -8.5, 2.2], [-3.8, -9.0, 5.0], [0.3, -13.2, 1.0], [3.6, -6.0, 3.6], [-1.0, -16, 2.9], [5, -12, 0.3]]) KELP.push({ x, z, yaw, s: 1.1, w: 0.8 });
  makeKelp(group, KELP, h);

  // crabs running across your path
  const CRABS = [];
  for (let k = 0; k < 16; k++) CRABS.push({ x: -7 + R() * 5.5, z: -2.5 - R() * 8, dir: (R() - 0.5) * 0.7, sp: 1.3 + R() * 1.2, t0: V_WRECK - 0.4 - R() * 0.8, s: 0.3 + R() * 0.16, ph: R() * 9 });
  for (const [x, z] of [[-1.8, -3.6], [-2.6, -5.2], [-0.9, -6.4]]) CRABS.push({ x, z, dir: 0.2, sp: 1.6, t0: V_WRECK + 0.1, s: 0.4, ph: x * 3 });
  const crabs = makeCrabs(group, CRABS);

  const T = V_WRECK;
  const people = cast([
    walker(1.0, -5.8, 2.0, T, { hero: true, yaw: Math.PI + 0.1 }),
    walker(-2.2, -9.0, 1.9, T, { yaw: Math.PI + 0.15 }), walker(-3.8, -12.5, 1.7, T, { yaw: Math.PI + 0.2 }), walker(-6, -18, 1.6, T),
    { x: 3.4, z: -15.5, act: 'pointUp', yaw: Math.PI - 0.3 }, { x: -1.2, z: -17.5, act: 'phone', lookUp: 0.6, yaw: Math.PI - 0.2 },
    { x: 1.6, z: -19.5, act: 'lookUp', yaw: Math.PI - 0.2 }, { x: -4.5, z: -20, act: 'point', yaw: Math.PI - 0.1, s: 0.66 }, { x: -7.5, z: -27, act: 'lookUp', yaw: Math.PI + 0.3 },
  ], 11);

  const level = (v) => lerp(-0.22, -3.2, smooth(T - 0.2, V_WHALES + 0.2, v));
  function cam(v) {
    const t = v - T;
    return {
      x: -0.1 - 0.12 * t, z: -2.0 * t, eye: 1.66 + 0.03 * Math.sin(t * 8.4),
      yaw: lerp(4.5, 3, smooth(0, 2.7, t)) * DEG, pitch: lerp(7, 11.5, smooth(0, 2.7, t)) * DEG, fov: 62,
    };
  }
  return {
    name: 'wreck', group, h, level, cam, people, flow: 0.8,
    frame(v) { crabs.frame(v, h); drips.uniforms.uTime.value = v; drips.uniforms.uAmount.value = 1 - 0.3 * smooth(T, V_WHALES, v); },
  };
}
