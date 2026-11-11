// Shot 0, the beach (0:00-0:04.8): a packed beach at noon, and the sea is already running away. Boats lie tipped over
// on the wet sand, fish flop where the water was, people point, scream, film, and start walking out after it.
// World: +y up, you look down -z (out to sea). The old shoreline is at z = SHORE; the sea level is the true one
// (feet on the counter x 0.3048), so the water's edge races from 30 m out to the horizon.
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { box, cyl, ball, rod, merge, paint, place, propMaterial, canvasTex, rust, hullGeo } from './build.js';
import { makeFish } from './creatures.js';
import { cast } from './people.js';
import { fbm, vnoise } from './noise.js';
import { feetAt, M, V_WRECK } from './timeline.js';
import { rng, clamp, smooth, lerp, wobble, DEG } from './util.js';

const SHORE = -2;
export function hBeach(x, z) {
  const d = SHORE - z;                       // metres out from the old shoreline
  if (d <= 0) return 2.5 * (1 - Math.exp(d / 7.5)) + 0.012 * -d + 0.05 * (fbm(x * 0.2, z * 0.2) - 0.5);
  // (the bed is cut so that the true sea level puts the water's edge 14 m out on frame 0, 60 m at 0:01, 200 m at 0:02,
  //  600 m at 0:03 and 1.5 km at 0:04.7: steep by the shore, flatter and flatter beyond, like a real beach)
  const depth = d < 14 ? 0.065 * d : d < 60 ? 0.91 + 0.0302 * (d - 14) : d < 200 ? 2.3 + 0.025 * (d - 60) : d < 600 ? 5.8 + 0.0175 * (d - 200) : 12.8 + 0.0102 * (d - 600);
  const bars = 0.3 * Math.sin(d * 0.055 + 2.2 * vnoise(x * 0.012, 3.3) + 1.2) * smooth(30, 90, d);
  const pools = 0.4 * (fbm(x * 0.045, z * 0.045) - 0.5) * smooth(8, 40, d);
  return -depth + bars + pools;
}

// ---- boats ----
function boatTex(top, bottom, stripe) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = top; g.fillRect(0, 0, w, h);
    g.fillStyle = bottom; g.fillRect(0, h * 0.58, w, h);
    g.fillStyle = stripe; g.fillRect(0, h * 0.5, w, h * 0.09);
    rust(g, w, h, rng(5), { blotches: 60, runs: 30, alpha: 0.18, cols: ['#3a4a3a', '#6a5a3a', '#2a3a2a'], y0: 0.55 });
  });
}
function makeBoat(kind, parts) {
  const grp = new THREE.Group();
  let H;
  const P = [];
  if (kind === 'sail') {
    H = hullGeo({ L: 9.6, B: 3.1, D: 1.75, bow: 0.5, stern: 0.3, transom: 0.62, sheer: 0.3, rake: 1.0, eMid: 0.85, bowPow: 1.7, deckColor: 0xc19a62, nL: 26 });
    grp.add(new THREE.Mesh(H.hull, propMaterial({ map: boatTex('#f6f4ee', '#1c3a6a', '#d8382c'), vertexColors: false, side: THREE.DoubleSide, rough: 0.35, gloss: 0.7 })));
    P.push(box(1.7, 1.6, 0.14, 0x1c3a6a, 0.2, -0.75, 0), box(0.5, 1.1, 0.08, 0x1c3a6a, -3.9, -0.3, 0));               // keel fin, rudder
    P.push(box(3.3, 0.5, 1.7, 0xf2efe8, -0.3, 1.95, 0), box(3.0, 0.2, 1.72, 0x18222c, -0.3, 1.98, 0));                  // cabin, its windows
    P.push(cyl(0.075, 0.09, 11.6, 0xe9e9e6, 0.9, 1.75 + 5.8, 0, 0, 0, 0, 8));                                             // mast
    P.push(rod(0.9, 2.9, 0, -3.4, 2.75, 0, 0.06, 0xe9e9e6), rod(0.9, 3.05, 0, -3.3, 2.9, 0, 0.2, 0xf4f1e6, 8));          // boom, furled sail
    P.push(rod(0.9, 13.3, 0, 5.5, 2.1, 0, 0.018, 0x333333), rod(0.9, 13.3, 0, -4.6, 1.8, 0, 0.018, 0x333333), rod(0.9, 9.5, 0, 0.6, 1.8, 1.5, 0.018, 0x333333), rod(0.9, 9.5, 0, 0.6, 1.8, -1.5, 0.018, 0x333333));
  } else if (kind === 'motor') {
    H = hullGeo({ L: 6.4, B: 2.4, D: 1.15, bow: 0.5, stern: 0.2, transom: 0.92, sheer: 0.22, rake: 0.8, eMid: 0.7, deckColor: 0xeeeeea, nL: 22 });
    grp.add(new THREE.Mesh(H.hull, propMaterial({ map: boatTex('#fbfbf8', '#fbfbf8', '#e3342a'), vertexColors: false, side: THREE.DoubleSide, rough: 0.3, gloss: 0.7 })));
    P.push(box(0.1, 0.55, 1.7, 0x22303c, 0.7, 1.45, 0, 0, 0, -0.5), box(1.3, 0.35, 1.9, 0xd9d6cf, -0.3, 1.2, 0), box(0.6, 0.5, 1.6, 0xe3342a, -1.5, 1.25, 0));
    P.push(box(0.5, 1.1, 0.42, 0x15181c, -3.35, 1.0, 0), box(0.2, 0.9, 0.12, 0x9aa0a6, -3.4, 0.1, 0));                   // outboard
  } else if (kind === 'fish') {
    H = hullGeo({ L: 11.5, B: 3.8, D: 2.3, bow: 0.42, stern: 0.25, transom: 0.7, sheer: 0.55, rake: 1.1, eMid: 0.6, deckColor: 0x8a6a48, nL: 26 });
    grp.add(new THREE.Mesh(H.hull, propMaterial({ map: boatTex('#1f6fb8', '#a8322a', '#f4f2ea'), vertexColors: false, side: THREE.DoubleSide, rough: 0.5, gloss: 0.6 })));
    P.push(box(2.6, 2.1, 2.5, 0xf4f2ea, -2.2, 3.35, 0), box(2.64, 0.6, 2.54, 0x1c2a36, -2.2, 3.75, 0), box(2.9, 0.12, 2.8, 0x1f6fb8, -2.2, 4.45, 0));
    P.push(cyl(0.07, 0.09, 4.6, 0xe8e6e0, 1.6, 4.6, 0), rod(1.6, 3.2, 0, 4.4, 4.6, 0, 0.05, 0xe8e6e0), box(1.5, 0.5, 1.8, 0x2e7a4a, 2.9, 2.6, 0));
    for (let k = 0; k < 5; k++) P.push(ball(0.22, 0xf5802a, -5.0 + (k % 2) * 0.4, 2.55 + 0.1 * k, -1.2 + k * 0.6));
  } else {
    H = hullGeo({ L: 3.6, B: 1.5, D: 0.62, bow: 0.5, stern: 0.2, transom: 0.85, sheer: 0.1, rake: 0.4, eMid: 0.7, deckDrop: 0.42, deckColor: 0xd8c8a8, nL: 16 });
    grp.add(new THREE.Mesh(H.hull, propMaterial({ map: boatTex('#f2b632', '#f2b632', '#ffffff'), vertexColors: false, side: THREE.DoubleSide, rough: 0.5, gloss: 0.6 })));
    P.push(box(0.25, 0.06, 1.3, 0xb89868, 0.2, 0.42, 0), box(0.25, 0.06, 1.2, 0xb89868, -0.9, 0.42, 0));
  }
  P.push(H.deck);
  grp.add(new THREE.Mesh(merge(P), parts));
  grp.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return grp;
}

// where things are: [kind, x, z, yaw, heel]
const BOATS = [
  ['sail', -6.2, -19.5, 2.5, 1.08], ['motor', 5.4, -12.5, -0.7, -0.42], ['fish', -1.5, -46, 0.5, 0.52],
  ['row', 3.4, -6.2, 1.2, 0.3], ['motor', -13, -34, 2.0, 0.5], ['sail', 14, -72, -0.4, -1.0], ['fish', -24, -95, -1.1, -0.5], ['sail', 30, -140, 1.0, 1.05],
];
const UMB = [[-2.9, 8.4, 0xe8483a], [3.5, 7.2, 0x2f8fd8], [-6.5, 4.5, 0xf3c52f], [7.4, 3.2, 0x29a36a], [-11, 8, 0xff7f2a], [12, 9, 0xd93c8c], [-16, 3.5, 0x16b3b0], [17.5, 5, 0xe8483a], [-22, 7, 0x2f8fd8], [24, 6.5, 0xf3c52f]];
const TCOL = [0xffffff, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x7a4fd0, 0xff8a3d];

export const CAM0 = { x: 0, z: 9.5, eye: 1.68 };

export function makeBeach(ctx) {
  const group = new THREE.Group();
  const h = hBeach;
  const grid = makeGrid(h, { zNear: 22, zFar: -9000, w0: 60, w1: 9000, nx: 130, nz: 220, p: 2.4 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xe6cf9c, colB: 0xd6bb84, rock: 0x8a7a60, patch: 0x56602e, patchAmt: 0.5, patchS: 0.13, patchT: 0.62, scale: 0.05, ripple: 1, wet: 1, dry: 0.02, pebble: 0.06, rough: 0.95 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));
  const parts = propMaterial({ rough: 0.55, gloss: 0.4 });

  for (const [kind, x, z, yaw, heel] of BOATS) {
    const b = makeBoat(kind, parts);
    const lift = kind === 'sail' ? 1.15 : kind === 'fish' ? 0.75 : kind === 'motor' ? 0.4 : 0.12;
    b.position.set(x, h(x, z) + lift * Math.abs(Math.sin(heel)) - 0.12, z);
    b.rotation.set(heel, yaw, 0, 'YXZ');
    group.add(b);
  }
  // umbrellas and towels on the dry sand round you; a red buoy and its chain left on the seabed
  {
    const P = [];
    const R = rng(31);
    for (const [x, z, col] of UMB) {
      const y = h(x, z), tilt = (R() - 0.5) * 0.3;
      const can = new THREE.ConeGeometry(1.35, 0.48, 10, 1, true).toNonIndexed();
      const n = can.attributes.position.count, a = new Float32Array(n * 3), c1 = new THREE.Color(col), c2 = new THREE.Color(0xfaf8f2);
      for (let i = 0; i < n; i++) { const c = Math.floor(i / 6) % 2 ? c1 : c2; a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      can.setAttribute('color', new THREE.BufferAttribute(a, 3));
      P.push(place(can, x + tilt * 2.2, y + 2.3, z, 0, R() * 3, tilt), cyl(0.03, 0.03, 2.4, 0xe8e8e8, x + tilt * 1.1, y + 1.15, z, 0, 0, tilt * 0.9));
      for (let k = 0; k < 2; k++) { const tx = x + (k ? 1.3 : -1.2) + (R() - 0.5) * 0.4, tz = z + (R() - 0.5) * 1.2; P.push(box(0.9, 0.03, 1.8, TCOL[Math.floor(R() * TCOL.length)], tx, h(tx, tz) + 0.03, tz, 0, R() * 3, 0)); }
    }
    // right in front of you: two towels (their owners still sitting on them, staring), a beach ball, a bucket
    P.push(box(0.95, 0.03, 1.9, 0xe94f37, -1.55, h(-1.55, 6.9) + 0.03, 6.9, 0, 0.15, 0), box(0.95, 0.03, 1.9, 0x3b8ed0, 1.75, h(1.75, 6.4) + 0.03, 6.4, 0, -0.2, 0));
    P.push(ball(0.2, 0xf6c445, 0.35, h(0.35, 5.6) + 0.2, 5.6), ball(0.201, 0xe94f37, 0.35, h(0.35, 5.6) + 0.2, 5.6, 1, 0.34, 1), cyl(0.12, 0.09, 0.2, 0x29a36a, -0.5, h(-0.5, 6.3) + 0.1, 6.3));
    P.push(ball(0.55, 0xe23a2a, 2.2, h(2.2, -25) + 0.4, -25, 1, 1.25, 1, 12), cyl(0.12, 0.12, 0.5, 0xe8e8e8, 2.2, h(2.2, -25) + 1.0, -25, 0.3, 0, 0.5));
    const m = new THREE.Mesh(merge(P), propMaterial({ rough: 0.7, gloss: 0.15, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  // fish flopping where the water was (the nearest right at your feet)
  const FISH = [];
  {
    const R = rng(9);
    const near = [[-0.9, -3.4, 0.95], [0.8, -4.6, 0.8], [-0.2, -6.4, 1.0], [1.9, -7.4, 0.85], [-2.2, -6.0, 0.9], [0.4, -9.0, 1.05], [-1.4, -10.5, 0.9], [2.6, -11, 1.0], [-3.4, -9, 0.8]];
    for (const [x, z, s] of near) FISH.push({ x, z, s, yaw: R() * 6.28, ph: R() * 20 });
    for (const [x, z, s] of [[0.5, -2.9, 1.7], [-1.6, -3.6, 1.5], [1.9, -4.4, 1.4], [-0.4, -5.2, 1.6]]) FISH.push({ x, z, s, yaw: R() * 6.28, ph: R() * 20 });   // big ones at the old shoreline: seen from frame 0
    for (let k = 0; k < 34; k++) FISH.push({ x: (R() - 0.5) * 30, z: -3 - R() * 34, s: 0.6 + R() * 0.6, yaw: R() * 6.28, ph: R() * 20 });
  }
  const fish = makeFish(group, FISH);

  // ---- the people ----
  const people = [];
  {
    const R = rng(20261110);
    // right round you (some cut by the frame's edge): pointing, hands on their heads, filming
    const NEAR = [
      [-2.0, 3.4, 'point', 3.3], [2.1, 3.0, 'shock', 3.0], [-3.1, 1.6, 'phone', 3.25], [3.0, 1.2, 'pointR', 2.95], [1.0, 0.6, 'look', 3.1, 0.66],
      [-0.7, -0.6, 'shock', 3.2], [-3.4, 0.2, 'pointR', 3.0], [3.6, -0.8, 'phone', 3.3], [1.9, -2.4, 'point', 3.14], [-2.0, -3.4, 'look', 3.2],
    ];
    for (const [x, z, act, yaw, s] of NEAR) people.push({ x, z, act, yaw, s, near: true, sp: R() < 0.5 ? 1.5 + R() * 0.6 : 0, t0: 1.6 + R() * 2.2 });
    people.push({ x: -1.55, z: 7.0, act: 'sit', yaw: Math.PI + 0.1, near: true }, { x: 1.75, z: 6.5, act: 'sit', yaw: Math.PI - 0.15, near: true });
    const busy = (x, z) => people.some((q) => Math.hypot(q.x - x, q.z - z) < 0.9) || Math.abs(x) < 3.0 && z > -9 && z < 10;     // (a clear view down the middle, to the water)
    // along the old shoreline and on the dry sand
    for (let k = 0; k < 900 && people.length < 95; k++) {
      const x = (R() - 0.5) * (R() < 0.6 ? 30 : 90), z = 3.2 - Math.pow(R(), 1.3) * 7.5;
      if (busy(x, z)) continue;
      const r = R();
      people.push({ x, z, act: r < 0.3 ? 'point' : r < 0.5 ? 'phone' : r < 0.62 ? 'shock' : 'look', yaw: Math.PI + (R() - 0.5) * 0.5, sp: R() < 0.55 ? 1.3 + R() * 1.0 : 0, t0: 0.9 + R() * 3.0 });
    }
    // the ones who were in the water: standing on wet sand, some already walking out after it, a few running
    for (let k = 0; k < 900 && people.length < 150; k++) {
      const x = (R() - 0.5) * (R() < 0.6 ? 26 : 80), z = -3 - Math.pow(R(), 1.5) * 42;
      if (busy(x, z)) continue;
      const r = R();
      people.push({ x, z, act: r < 0.35 ? 'look' : r < 0.55 ? 'point' : 'stand', yaw: Math.PI + (R() - 0.5) * 0.7, sp: r < 0.75 ? (R() < 0.2 ? 3.6 : 1.4 + R() * 0.8) : 0, t0: -2 + R() * 4.5 });
    }
    cast(people, 5, true);
  }

  const level = (v) => -feetAt(v) * M;
  function cam(v) {
    const t = Math.max(0, v - 1.3);
    const w = t - 0.6 * (1 - Math.exp(-t / 0.6));
    const z = CAM0.z - 2.1 * w;
    return {
      x: CAM0.x + 0.1 * Math.sin(w * 1.1), z, eye: CAM0.eye + 0.035 * Math.sin(w * 4.2) * Math.min(1, t),
      yaw: (1.5 * Math.sin(v * 0.6 + 1)) * DEG, pitch: lerp(-4.6, -3.5, smooth(0, 4, v)) * DEG, fov: lerp(54, 60, smooth(0.6, 4, v)),
    };
  }
  return { name: 'beach', group, h, level, cam, people, flow: 1, frame(v) { fish.frame(v, h); } };
}
