// Shot 5, the Titanic (0:21.5-0:25.8, about -12,500 ft): the bow, upright on the mud where it has stood since 1912, its
// prow rail and anchors still in place, hung with rust, towering over you as the last water pours off its decks.
// (The real bow is buried to its anchors in the mud; here it stands a little higher so its shape reads.)
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { box, cyl, rod, merge, paint, propMaterial, canvasTex, rust, hullGeo, railing } from './build.js';
import { makeDrips } from './drips.js';
import { cast } from './people.js';
import { walker, dripLine } from './wreck.js';
import { fbm } from './noise.js';
import { V_TITANIC, V_MOUNT } from './timeline.js';
import { rng, smooth, lerp, DEG } from './util.js';

const BOW = { x: 1.2, z: -34, yaw: -1.42, sink: 2.4 };       // the prow's tip, pointing almost straight at you: both its sides show
function hTitanic(x, z) {
  // the mud it ploughed up round the bow
  const c = Math.cos(BOW.yaw), s = Math.sin(BOW.yaw), dx = x - BOW.x, dz = z - BOW.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const berm = 1.6 * Math.exp(-Math.pow((Math.abs(lz) - 15 * smooth(8, -40, lx)) / 5, 2)) * smooth(14, 0, lx) * smooth(-90, -40, lx);
  return 0.014 * z + 0.6 * (fbm(x * 0.035, z * 0.035) - 0.5) + berm;
}

export function makeTitanic(ctx) {
  const group = new THREE.Group();
  const h = hTitanic;
  const grid = makeGrid(h, { zNear: 20, zFar: -8000, w0: 60, w1: 8000, nx: 120, nz: 180, p: 2.3 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xb6a888, colB: 0x9c8f72, patch: 0x7a5a3a, patchAmt: 0.45, patchS: 0.07, patchT: 0.58, scale: 0.035, ripple: 0.3, pebble: 0.35 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));
  const R = rng(1912);

  // ---- the bow section: the forward 40% of the ship (about 110 m), the bow's tip at the origin ----
  const ship = new THREE.Group();
  const L = 269, D = 19.7, U0 = 0.59;
  const Hh = hullGeo({ L, B: 28.2, D, bow: 0.3, stern: 0.1, transom: 1, sheer: 3.4, sheerStern: 0, rake: 1.6, eMid: 0.28, eBow: 1.15, bowPow: 2.1, deckColor: 0x5a3f2c, nL: 60, nS: 10, u0: U0 });
  const X0 = L / 2;                                     // (the hull's own x of the bow tip)
  const tex = canvasTex(2048, 512, (g, w, hh) => {
    g.fillStyle = '#4a3023'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#6e2a1c'; g.fillRect(0, hh * 0.62, w, hh);                         // the red below the waterline
    g.fillStyle = '#8f8368'; g.fillRect(0, 0, w, hh * 0.085);                         // the pale top strake
    g.fillStyle = '#b8902a'; g.fillRect(0, hh * 0.085, w, hh * 0.012);                // the gold line
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (let k = 1; k < 9; k++) g.fillRect(0, hh * k / 9, w, 2);                       // plates
    for (let i = 0; i < 46; i++) for (let k = 0; k < 9; k++) g.fillRect((i + (k % 2) * 0.5) * w / 46, hh * k / 9, 2, hh / 9);
    rust(g, w, hh, R, { blotches: 1300, runs: 900, alpha: 0.7, cols: ['#8a431a', '#b55f22', '#6a3216', '#d07a2c', '#4a2a18'] });
    // portholes, each with its tear of rust
    for (const [vy, n] of [[0.2, 64], [0.34, 64], [0.47, 50]]) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n * w, y = vy * hh;
      const gr = g.createLinearGradient(0, y, 0, y + hh * 0.14); gr.addColorStop(0, 'rgba(200,110,40,0.75)'); gr.addColorStop(1, 'rgba(200,110,40,0)');
      g.fillStyle = gr; g.fillRect(x - 3, y, 6, hh * 0.14);
      g.fillStyle = '#080605'; g.beginPath(); g.arc(x, y, 5.5, 0, 6.3); g.fill();
    }
  });
  tex.repeat.x = 1 / (1 - U0); tex.offset.x = -U0 / (1 - U0);
  const hullMesh = new THREE.Mesh(Hh.hull, propMaterial({ map: tex, vertexColors: false, side: THREE.DoubleSide, rough: 0.85, gloss: 0.12 }));
  const P = [Hh.deck];
  const RU = [0x7a4626, 0x8a5229, 0x5e351f, 0x9a5e2c, 0x6a3c22];
  const ru = () => RU[Math.floor(R() * RU.length)];
  const dk = (u) => Hh.D(u);
  // the rail round the prow, the anchor crane on its tip, the anchors in their pipes, capstans, the breakwater
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let u = 0.845; u <= 0.9995; u += 0.0045) pts.push(Hh.edge(u, sd));
    P.push(...railing(pts, 1.15, ru(), 0.045));
    const a = Hh.side(0.972, 0.8, sd);
    P.push(box(0.6, 3.6, 0.5, 0x1c1614, a.x, a.y, a.z + sd * 0.3), box(0.5, 0.7, 2.6, 0x1c1614, a.x, a.y - 1.7, a.z + sd * 0.35, 0.5 * sd, 0, 0));
    P.push(box(10, 1.3, 0.25, ru(), X0 - 30, dk(0.89) + 0.65, sd * 5.2, 0, sd * 0.42, 0));        // the breakwater
    for (const [du, dz] of [[0.955, 2.2], [0.93, 3.4], [0.905, 4.4]]) P.push(cyl(0.55, 0.65, 1.0, ru(), (du - 0.5) * L, dk(du) + 0.5, sd * dz, 0, 0, 0, 10));
  }
  { const tip = Hh.edge(0.9995, 1); P.push(rod(tip.x - 2.5, tip.y, 0, tip.x - 1.6, tip.y + 4.2, 0, 0.14, ru()), rod(tip.x - 1.6, tip.y + 4.2, 0, tip.x + 0.8, tip.y + 3.6, 0, 0.11, ru())); }
  // the foremast, fallen back across the deck onto the bridge; two hatch coamings; cargo cranes
  P.push(rod(X0 - 36, dk(0.86) + 1.2, 0.5, X0 - 82, dk(0.7) + 8.2, -1.5, 0.5, ru(), 8), cyl(0.9, 0.9, 1.5, ru(), X0 - 52, dk(0.8) + 4.4, -0.3, 0, 0, 1.4, 8));
  P.push(box(8, 1.2, 6, ru(), X0 - 22, dk(0.92) + 0.6, 0), box(9, 1.2, 7, ru(), X0 - 46, dk(0.83) + 0.6, 0));
  for (const sd of [-1, 1]) P.push(cyl(0.35, 0.45, 5, ru(), X0 - 40, dk(0.85) + 2.5, sd * 8), rod(X0 - 40, dk(0.85) + 4.6, sd * 8, X0 - 47, dk(0.85) + 6.5, sd * 5, 0.2, ru()));
  // what is left of the bridge and the decks behind it, stepping up
  for (let k = 0; k < 3; k++) {
    const x = X0 - 66 - k * 9, y = dk(0.75) + 1.5 + k * 3;
    P.push(box(46 - k * 7, 3.0, 25.5 - k * 2.2, [0x8e8068, 0x7f7058, 0x8a7a60][k], x - 20 + k * 3, y, 0), box(46.1 - k * 7, 1.0, 25.6 - k * 2.2, 0x14100e, x - 20 + k * 3, y + 0.35, 0));
  }
  const partsMesh = new THREE.Mesh(merge(P), propMaterial({ rough: 0.85, gloss: 0.35 }));
  ship.add(hullMesh, partsMesh);
  // rusticles: icicles of rust hanging from the rail line and the anchors
  {
    const cone = paint(new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI), 0xb5642a);     // (hangs down from its base)
    const N = 520, mesh = new THREE.InstancedMesh(cone, propMaterial({ rough: 0.9, gloss: 0.2 }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), tc = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const sd = i % 2 ? 1 : -1, u = 0.62 + Math.pow(R(), 0.6) * 0.379, s = R() < 0.55 ? 1 : 0.62 + R() * 0.3;
      const p = Hh.side(u, s, sd), len = 0.5 + R() * R() * 3.2;
      m4.compose(p3.set(p.x, p.y - 0.05, p.z + sd * 0.12), q, s3.set(0.07 + len * 0.045, len, 0.07 + len * 0.045));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, tc.setHSL(0.065 + R() * 0.03, 0.62, 0.24 + R() * 0.16));
    }
    ship.add(mesh);
  }
  ship.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  // put the bow's tip at BOW
  const inner = new THREE.Group();
  inner.add(ship); ship.position.set(-X0, 0, 0);
  inner.position.set(BOW.x, h(BOW.x, BOW.z) - BOW.sink, BOW.z);
  inner.rotation.set(0.03, BOW.yaw, 0, 'YXZ');
  group.add(inner);
  inner.updateMatrixWorld(true);

  // the sea pouring off the decks, both sides, heaviest at the prow; and off the anchors
  const em = [];
  for (const sd of [1, -1]) {
    const pts = [];
    for (let u = 0.66; u <= 0.9995; u += 0.0011) { const p = Hh.edge(u, sd); pts.push(new THREE.Vector3(p.x, p.y, p.z + sd * 0.15).applyMatrix4(ship.matrixWorld)); }
    dripLine(em, pts, h, { w: 0.22, len: 3.2 });
    const p2 = [];
    for (let u = 0.7; u <= 0.99; u += 0.012) { const p = Hh.side(u, 0.62, sd); p2.push(new THREE.Vector3(p.x, p.y, p.z + sd * 0.2).applyMatrix4(ship.matrixWorld)); }
    dripLine(em, p2, h, { w: 0.1, len: 1.6 });
  }
  const drips = makeDrips(group, em);

  const T = V_TITANIC;
  const base = (dx, dz) => ({ x: BOW.x + dx, z: BOW.z + dz });
  const people = cast([
    walker(-1.4, -5.6, 2.0, T, { hero: true, yaw: Math.PI + 0.02 }),
    walker(-3.6, -9.5, 1.9, T), walker(2.2, -12.5, 1.8, T, { yaw: Math.PI - 0.05 }), walker(-5.5, -16, 1.6, T),
    { ...base(-1.5, 6.5), act: 'lookUp', yaw: Math.PI }, { ...base(2.4, 8), act: 'arms', yaw: Math.PI + 0.1 }, { ...base(-4.2, 9.5), act: 'phone', lookUp: 0.9, yaw: Math.PI - 0.2 },
    { ...base(5.5, 4), act: 'pointUp', yaw: Math.PI + 0.5 }, { ...base(-8, 2.5), act: 'lookUp', yaw: Math.PI - 0.7, s: 0.66 }, { ...base(8.5, -1), act: 'touch', yaw: Math.PI + 1.0 },
  ], 51);

  const level = (v) => lerp(-0.25, -3.8, smooth(T - 0.3, V_MOUNT + 0.2, v));
  function cam(v) {
    const t = v - T;
    return {
      x: -3.0, z: -2.2 * t, eye: 1.66 + 0.03 * Math.sin(t * 8.4),
      yaw: lerp(-3.5, -5, smooth(0, 4.3, t)) * DEG, pitch: lerp(9.5, 18, smooth(0, 4.3, t)) * DEG, fov: lerp(62, 65, smooth(0, 4.3, t)),
    };
  }
  return {
    name: 'titanic', group, h, level, cam, people, flow: 0.8,
    frame(v) { drips.uniforms.uTime.value = v; drips.uniforms.uAmount.value = 1 - 0.45 * smooth(T, V_MOUNT, v); },
  };
}
