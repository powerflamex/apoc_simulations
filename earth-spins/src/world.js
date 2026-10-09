// Singapore from a rooftop pool deck, looking west over the bay: the deck and its pool, the people
// on it, the city and its towers, the waterfront, the anchored ships and the sea. Everything is a pure
// function of video time v. The sea rises as the oceans pile up at the equator; once the spin cancels
// gravity, everything loose floats up: people, loungers, the pool's water, cars and boats from the flood.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, BEND_GLSL, patch } from './bend.js';
import { SKY_COMMON } from './sky.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { ROOF_Y, V_FLOAT, gFrac } from './timeline.js';

export const CAM_BASE = new THREE.Vector3(0, ROOF_Y + 1.7, 0);
const DECK_Z0 = -14, DECK_Z1 = 16, DECK_X = 18;        // our tower's roof
const POOL_X0 = -6.5, POOL_X1 = 1.0, POOL_Z0 = -13.7, POOL_Z1 = -8.0;   // the pool, centred in the view (we look 15° left)
const POOL_XC = (POOL_X0 + POOL_X1) / 2, POOL_HW = (POOL_X1 - POOL_X0) / 2;
const POOL_DEPTH = 1.4;
const WATER_Y = ROOF_Y - 0.1;
const SHORE_Z = -188;
const ROAD_HALF = 12;
const SIDEWALK = 16.5;
const FRONT = 17.5;

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

// the coast to our left: land west of this line (x < coastX(z)) for z beyond the waterfront
const coastX = (z) => -Math.tan(13 * DEG) * Math.abs(z) - 40;
// distance driven by time v when traffic brakes smoothly to a stop between a and b (speed 1 before a, 0 after b)
function easeStop(v, a, b) {
  if (v <= a) return v;
  const w = b - a, x = Math.min((v - a) / w, 1);
  return a + w * (x - (x * x * x - 0.5 * x * x * x * x));
}
// displacement for things that float off: a gentle start, then faster and faster
function liftDisp(dt, a, j) {
  if (dt <= 0) return 0;
  return 0.5 * a * dt * dt + j * dt * dt * dt;
}

export function makeWorld(scene, skyUniforms) {
  const R = rng(2026);
  const world = {};

  // ---------- materials ----------
  const buildingMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0 }), { windows: true });
  const plainMat = (color, rough = 0.9, extra = {}) =>
    patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m) => { m.frustumCulled = false; return m; };
  const skyU = { uSunDir: skyUniforms.uSunDir, uCity: skyUniforms.uCity, uWhite: skyUniforms.uWhite };

  // ---------- ground / avenue ----------
  const box = (mat, x0, x1, y1, z0, z1, y0 = -8) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(0, -(y1 - y0) / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, y1, (z0 + z1) / 2);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const asphalt = plainMat(0x1d1f24, 0.95);
  const pavement = plainMat(0x77716a, 0.95);
  box(asphalt, -ROAD_HALF, ROAD_HALF, 1.0, SHORE_Z + 20, 30);
  box(pavement, -SIDEWALK, -ROAD_HALF, 1.15, SHORE_Z + 20, 30);
  box(pavement, ROAD_HALF, SIDEWALK, 1.15, SHORE_Z + 20, 30);
  box(plainMat(0x3e3c39, 0.95), -2400, -SIDEWALK, 1.0, SHORE_Z, 60);
  box(plainMat(0x3e3c39, 0.95), SIDEWALK, 2400, 1.0, SHORE_Z, 60);
  box(asphalt, -2400, 2400, 1.01, SHORE_Z + 6, SHORE_Z + 20);
  box(plainMat(0x948b80, 0.95), -2400, 2400, 1.2, SHORE_Z, SHORE_Z + 6);   // waterfront promenade
  box(asphalt, -2400, 2400, 1.005, -100, -90);
  // the coast bends away to the left (south-west), where the big towers stand on reclaimed land
  {   // a stepped coastline running out to the south-west (just left of where we look)
    const land = plainMat(0x3e3c39, 0.95), prom = plainMat(0x948b80, 0.95);
    for (let z = SHORE_Z; z > -1900; z -= 60) {
      const xe = coastX(z - 30);
      box(land, -2600, xe, 1.0, z - 60, z);
      box(prom, xe, xe + 6, 1.2, z - 60, z);
    }
  }
  {
    const dash = new THREE.BoxGeometry(0.18, 0.02, 3);
    const n = 36;
    const im = new THREE.InstancedMesh(dash, glowMat(new THREE.Color(0.5, 0.48, 0.42)), n * 2);
    let k = 0;
    for (let i = 0; i < n; i++) for (const x of [-6, 6]) {
      dummy.position.set(x, 1.02, -20 - i * 4.6); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      im.setMatrixAt(k++, dummy.matrix);
    }
    im.frustumCulled = false;
    scene.add(im);
  }

  // ---------- our tower and its roof deck ----------
  const deck = new THREE.Group();
  scene.add(deck);
  {
    // the tower: a body up to just under the pool, then the top storey built around the pool's basin
    const towerMat = plainMat(0xb4bcc2, 0.75);
    const slab = (x0, x1, y0, y1, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), towerMat); deck.add(m); };
    const yb = ROOF_Y - POOL_DEPTH - 0.3, yt = ROOF_Y - 0.06;   // (the top sits under the deck boards)
    slab(-DECK_X, DECK_X, 0, yb, DECK_Z0, DECK_Z1);
    slab(-DECK_X, POOL_X0, yb, yt, DECK_Z0, DECK_Z1);
    slab(POOL_X1, DECK_X, yb, yt, DECK_Z0, DECK_Z1);
    slab(POOL_X0, POOL_X1, yb, yt, POOL_Z1, DECK_Z1);
    slab(POOL_X0, POOL_X1, yb, yt, DECK_Z0, POOL_Z0);   // under the far coping
    // teak planks running toward the view, with small gaps and a little colour variation
    const plankW = 0.14;
    const runs = [];
    for (let x = -DECK_X + plankW / 2; x < DECK_X; x += plankW + 0.012) {
      if (x > POOL_X0 - 0.45 && x < POOL_X1 + 0.45) runs.push([x, POOL_Z1 + 0.45, DECK_Z1]);
      else runs.push([x, DECK_Z0, DECK_Z1]);
    }
    const plankGeo = new THREE.BoxGeometry(plankW, 0.05, 1).translate(0, -0.025, 0);
    const planks = new THREE.InstancedMesh(plankGeo, patch(new THREE.MeshLambertMaterial({ color: 0xffffff })), runs.length);   // matte teak: no glare streaks
    const RP = rng(31);
    runs.forEach(([x, z0, z1], i) => {
      dummy.position.set(x, ROOF_Y, (z0 + z1) / 2); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, z1 - z0); dummy.updateMatrix();
      planks.setMatrixAt(i, dummy.matrix);
      planks.setColorAt(i, tmpC.setHSL(0.075 + RP() * 0.02, 0.42 + RP() * 0.1, 0.36 + RP() * 0.08));
    });
    planks.receiveShadow = true;
    planks.frustumCulled = false;
    deck.add(planks);
    // pool: white stone coping, a mosaic basin
    const stone = plainMat(0xe6e1d8, 0.6);
    const coping = (x0, x1, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, z1 - z0).translate((x0 + x1) / 2, ROOF_Y + 0.0, (z0 + z1) / 2), stone); m.receiveShadow = true; deck.add(m); };
    coping(POOL_X0 - 0.45, POOL_X1 + 0.45, POOL_Z1, POOL_Z1 + 0.45);
    coping(POOL_X0 - 0.45, POOL_X0, DECK_Z0, POOL_Z1);
    coping(POOL_X1, POOL_X1 + 0.45, DECK_Z0, POOL_Z1);
    coping(POOL_X0 - 0.45, POOL_X1 + 0.45, DECK_Z0, POOL_Z0);   // the far rim, at the roof's edge (a visible end to the pool)
    const tile = plainMat(0x5fc3d0, 0.35);
    const basin = [
      [POOL_XC, WATER_Y - POOL_DEPTH + 0.1, (POOL_Z0 + POOL_Z1) / 2, POOL_HW * 2, 0.1, POOL_Z1 - POOL_Z0],
      [POOL_X0, ROOF_Y - POOL_DEPTH / 2, (POOL_Z0 + POOL_Z1) / 2, 0.1, POOL_DEPTH, POOL_Z1 - POOL_Z0],
      [POOL_X1, ROOF_Y - POOL_DEPTH / 2, (POOL_Z0 + POOL_Z1) / 2, 0.1, POOL_DEPTH, POOL_Z1 - POOL_Z0],
      [POOL_XC, ROOF_Y - POOL_DEPTH / 2, POOL_Z1, POOL_HW * 2, POOL_DEPTH, 0.1],
      [POOL_XC, ROOF_Y - POOL_DEPTH / 2, POOL_Z0, POOL_HW * 2, POOL_DEPTH, 0.1],
    ];
    for (const [x, y, z, w, h, d] of basin) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tile); m.position.set(x, y, z); deck.add(m); }
  }
  // glass balustrade with a steel handrail along the edges (right along the pool's far rim too)
  {
    const glass = new THREE.MeshStandardMaterial({ color: 0xa9c4cc, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
    const rail = plainMat(0xb5b8ba, 0.3, { metalness: 0.7 });
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.1, len), glass);
      g.position.set((x0 + x1) / 2, ROOF_Y + 0.55, (z0 + z1) / 2); g.rotation.y = ang;
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, len), rail);
      r.position.set((x0 + x1) / 2, ROOF_Y + 1.12, (z0 + z1) / 2); r.rotation.y = ang;
      deck.add(g, r);
    };
    run(-DECK_X, DECK_Z0 + 0.1, DECK_X, DECK_Z0 + 0.1);
    run(-DECK_X + 0.1, DECK_Z0, -DECK_X + 0.1, DECK_Z1);
    run(DECK_X - 0.1, DECK_Z0, DECK_X - 0.1, DECK_Z1);
  }

  // ---------- deck furniture: loungers, umbrellas, towels, potted palms, string lights ----------
  const loungers = [];
  const addL = (x, z, yaw) => loungers.push({ x, z, yaw, liftT: V_FLOAT + 0.6 + R() * 2.5, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.4) });
  for (const x of [-7.0, -5.4, 1.4, 3.0]) addL(x, -6.0, Math.PI);      // either side of the view, backrests toward us, facing the sunset
  for (const x of [-10.2, 4.6]) addL(x, -6.0, Math.PI);
  for (let i = 0; i < 4; i++) { addL(-11, -12 + i * 2, -Math.PI / 2); addL(6.5, -12 + i * 2, Math.PI / 2); }
  const loungerFrame = mergeGeometries([
    new THREE.BoxGeometry(0.66, 0.08, 1.9).translate(0, 0.32, 0.15),
    ...[[-0.3, -0.6], [0.3, -0.6], [-0.3, 0.9], [0.3, 0.9]].map(([x, z]) => new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(x, 0.15, z)),
    new THREE.BoxGeometry(0.66, 0.06, 0.75).rotateX(-0.75).translate(0, 0.58, -0.98),
  ].map((g) => g.toNonIndexed()));
  const cushionGeo = mergeGeometries([
    new THREE.BoxGeometry(0.6, 0.07, 1.8).translate(0, 0.395, 0.15),
    new THREE.BoxGeometry(0.6, 0.06, 0.7).rotateX(-0.75).translate(0, 0.63, -0.93),
  ].map((g) => g.toNonIndexed()));
  const lfMesh = new THREE.InstancedMesh(loungerFrame, plainMat(0x6b4a2e, 0.7), loungers.length);
  const lcMesh = new THREE.InstancedMesh(cushionGeo, plainMat(0xf2efe8, 0.9), loungers.length);
  for (const m of [lfMesh, lcMesh]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  const towels = loungers.map((l, i) => ({ l, c: [0x1d6fa3, 0xe36414, 0xf2c14e, 0x2a9d8f, 0xd62828, 0x3d5a80][i % 6], t0: 44.5 + R() * 6, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(2.5) }));
  const towelMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.02, 0.8), plainMat(0xffffff, 0.95), towels.length);
  towels.forEach((tw, i) => towelMesh.setColorAt(i, tmpC.set(tw.c)));
  towelMesh.castShadow = true; towelMesh.frustumCulled = false; scene.add(towelMesh);
  const umbrellas = [];
  for (const [x, z] of [[-6.2, -7.0], [3.9, -7.0], [-10.5, -9], [6.2, -9]]) umbrellas.push({ x, z, liftT: V_FLOAT - 1.2 + R() * 2.5, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.6) });
  const umbPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6).translate(0, 1.25, 0), plainMat(0xd9d4c9, 0.5), umbrellas.length);
  const umbTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.16, 1.5, 8).translate(0, 1.85, 0), plainMat(0xf4efe4, 0.9), umbrellas.length);   // folded for the evening
  for (const m of [umbPole, umbTop]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  // potted palms at the front corners and along the back
  const pots = [[-DECK_X + 1.6, DECK_Z0 + 1.6], [DECK_X - 1.6, DECK_Z0 + 1.6], [-DECK_X + 1.6, -4], [DECK_X - 1.6, -4], [-DECK_X + 1.6, 4], [DECK_X - 1.6, 4]]
    .map(([x, z]) => ({ x, z, s: 0.5 + R() * 0.12, liftT: V_FLOAT + 1.2 + R() * 3, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.2) }));
  const potMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.42, 0.85, 14).translate(0, 0.42, 0), plainMat(0x3b3b3b, 0.6), pots.length);
  // string lights over the deck (on at dusk) and the pool's underwater glow
  const bulbs = [];
  for (const side of [-1, 1]) for (let i = 0; i <= 18; i++) {
    const z = DECK_Z0 + 0.6 + i * 1.6;
    bulbs.push({ x: side * (DECK_X - 0.4), y: ROOF_Y + 2.6 - 0.35 * Math.sin((i % 3) / 3 * Math.PI), z });
  }
  const bulbMeshDeck = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat(new THREE.Color(9, 6.5, 3.4)), bulbs.length);
  bulbs.forEach((b, i) => { dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); bulbMeshDeck.setMatrixAt(i, dummy.matrix); });
  bulbMeshDeck.frustumCulled = false; scene.add(bulbMeshDeck);
  const deckLights = [-1, 1].map((side) => { const pl = new THREE.PointLight(0xffc27a, 0, 22, 1.6); pl.position.set(side * 9, ROOF_Y + 3, -7); scene.add(pl); return pl; });
  const poolGlow = new THREE.PointLight(0x40e0f0, 0, 9, 1.6);
  poolGlow.position.set(POOL_XC, ROOF_Y - 0.9, -10.8);
  scene.add(poolGlow);

  // palms: trunk and fronds (shared by the deck pots and the waterfront)
  const palmTrunkGeo = (() => {
    const parts = [];
    for (let k = 0; k < 6; k++) { const y0 = k * 1.5, bend = 0.012 * y0 * y0; parts.push(new THREE.CylinderGeometry(0.22 - k * 0.012, 0.25 - k * 0.012, 1.55, 7).translate(bend, y0 + 0.75, 0).toNonIndexed()); }
    return mergeGeometries(parts);
  })();
  const palmFrondGeo = (() => {
    const parts = [];
    for (let i = 0; i < 13; i++) {
      const yaw = (i / 13) * Math.PI * 2 + (i % 3) * 0.2;
      let px = 0, py = 0, pitch = 0.75 - (i % 3) * 0.3;
      for (let k = 0; k < 5; k++) {
        const len = 0.95, w = [0.35, 0.85, 1.0, 0.8, 0.45][k];
        const seg = new THREE.BoxGeometry(w, 0.035, len).translate(0, 0, len / 2);
        const pos = seg.attributes.position;
        for (let q = 0; q < pos.count; q++) pos.setY(q, pos.getY(q) + Math.abs(pos.getX(q)) * 0.35);
        seg.rotateX(-pitch).translate(0, py, px);
        parts.push(seg.toNonIndexed().rotateY(yaw).translate(0.97, 9.1, 0));
        px += Math.cos(pitch) * len; py += Math.sin(pitch) * len; pitch -= 0.33;
      }
    }
    const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
  })();

  // ---------- buildings ----------
  const B = [];
  const towerSpires = [];
  const pal = [0xa39684, 0x8f8478, 0x84796f, 0x7a7671, 0xb0a48e, 0x86705f, 0x6d747c, 0x606872, 0x9b958c, 0x8e7a68, 0xc9c3b8];
  const glassPal = [0x4f6478, 0x58708a, 0x6c8296, 0x445566, 0x7f95a6, 0x3e5266];
  const addB = (x, z, w, d, h, opts = {}) =>
    B.push({ x, z, w, d, h, color: opts.color ?? pal[Math.floor(R() * pal.length)], seed: R(), row: opts.row ?? 9 });
  for (const side of [-1, 1]) {
    let z = -22;
    while (z > SHORE_Z + 22) {
      const len = 9 + R() * 14;
      const z1 = Math.max(z - len, SHORE_Z + 22);
      if (!(z1 < -90 && z > -100)) {
        const d = 14 + R() * 14;
        addB(side * (FRONT + d / 2), (z + z1) / 2, d, Math.abs(z - z1) - 0.6, 14 + R() * 30, { row: 1 });
      }
      z = z1 < -90 && z > -100 ? -100 : z1;
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 70; i++) {
      const x = side * (52 + R() * 260);
      const z = -10 - R() * 170;
      if (Math.abs(x) < 70 && z > -40) continue;
      const w = 14 + R() * 22, d = 14 + R() * 22;
      const far = Math.hypot(x, z) > 190;
      const tower = R() < 0.22 && far && x > 0;   // (to our left the skyline does the towers)
      const h = tower ? 60 + R() * 70 : 18 + R() * (far ? 34 : 22);
      addB(x, z, w, d, h, { row: 2, color: tower ? glassPal[Math.floor(R() * glassPal.length)] : undefined });
    }
  }
  // the skyline: a cluster of tall glass towers on the bay to the south-west
  for (let i = 0; i < 46; i++) {
    const th = (18 + R() * 13) * DEG, dist = 650 + Math.pow(R(), 0.8) * 1100;
    const x = -Math.sin(th) * dist, z = -Math.cos(th) * dist;
    if (x > coastX(z) - 25) continue;
    const w = 16 + R() * 20;
    const h = 90 + Math.pow(R(), 1.4) * 190;
    const col = new THREE.Color(glassPal[Math.floor(R() * glassPal.length)]).multiplyScalar(0.75 + R() * 0.7).getHex();
    addB(x, z, w, w * (0.7 + R() * 0.5), h, { row: 4, color: col });
    if (R() < 0.6) { const k = 0.55 + R() * 0.25; addB(x + (R() - 0.5) * w * 0.2, z, w * k, w * k, h + 12 + R() * 40, { row: 4, color: col }); }   // a setback tier
    if (R() < 0.35) towerSpires.push([x, h + 50, z]);
  }
  for (let i = 0; i < 260; i++) {
    const x = -200 - R() * 2200, z = -220 - R() * 1600;
    if (x > coastX(z) - 20) continue;
    addB(x, z, 14 + R() * 24, 14 + R() * 24, 20 + R() * 60, { row: 3 });
  }
  // the city behind us and to the north, receding along the coast
  for (let i = 0; i < 150; i++) {
    const t = R();
    const z = SHORE_Z + 40 - t * 1200;
    const x = 330 + t * 400 + R() * 600;
    if (z < SHORE_Z) continue;
    addB(x, z, 12 + R() * 20, 12 + R() * 20, 14 + R() * 50, { row: 3 });
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const seedAttr = new Float32Array(B.length), groundAttr = new Float32Array(B.length).fill(1.15);
  B.forEach((b, i) => (seedAttr[i] = b.seed));
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr, 1));
  bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(groundAttr, 1));
  const bMesh = new THREE.InstancedMesh(bGeo, buildingMat, B.length);
  bMesh.frustumCulled = false;
  B.forEach((b, i) => {
    dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    bMesh.setMatrixAt(i, dummy.matrix);
    bMesh.setColorAt(i, tmpC.set(b.color));
  });
  scene.add(bMesh);
  {   // spires on the tallest towers
    const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 46, 6).translate(0, 23, 0), plainMat(0x9aa4ae, 0.4, { metalness: 0.4 }), Math.max(towerSpires.length, 1));
    sp.count = towerSpires.length;
    towerSpires.forEach(([x, y, z], i) => { dummy.position.set(x, y - 50, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); sp.setMatrixAt(i, dummy.matrix); });
    sp.frustumCulled = false;
    scene.add(sp);
  }
  // rooftop details on the nearer blocks + red aviation lights on the tall ones
  {
    const RA = rng(9090);
    const caps = [], tanks = [], acs = [], masts = [];
    B.forEach((b) => {
      caps.push([b.x, b.h, b.z, b.w + 0.3, b.row >= 3 ? 0.9 : 1.1, b.d + 0.3]);
      if (b.row > 2) { if (b.h > 90) masts.push([b.x, b.h, b.z]); return; }
      const spots = 1 + Math.floor(RA() * 3);
      for (let k = 0; k < spots; k++) {
        const ox = (RA() - 0.5) * b.w * 0.7, oz = (RA() - 0.5) * b.d * 0.7;
        if (RA() < 0.3) tanks.push([b.x + ox, b.h, b.z + oz]);
        else acs.push([b.x + ox, b.h, b.z + oz, 1.6 + RA() * 2.5, 1.0 + RA() * 1.4, 1.4 + RA() * 2.4]);
      }
      if (b.h > 55) masts.push([b.x, b.h, b.z]);
    });
    const capGeo = mergeGeometries([
      new THREE.BoxGeometry(1, 1, 0.025).translate(0, 0.5, 0.4875), new THREE.BoxGeometry(1, 1, 0.025).translate(0, 0.5, -0.4875),
      new THREE.BoxGeometry(0.025, 1, 0.95).translate(0.4875, 0.5, 0), new THREE.BoxGeometry(0.025, 1, 0.95).translate(-0.4875, 0.5, 0),
    ]);
    const capMesh = new THREE.InstancedMesh(capGeo, plainMat(0x8d877e, 0.9), caps.length);
    caps.forEach(([x, y, z, w, h, d], i) => { dummy.position.set(x, y, z); dummy.scale.set(w, h, d); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); capMesh.setMatrixAt(i, dummy.matrix); });
    const tankGeo = mergeGeometries([
      new THREE.CylinderGeometry(1.3, 1.3, 3.2, 12).translate(0, 4.1, 0).toNonIndexed(),
      new THREE.ConeGeometry(1.45, 1.2, 12).translate(0, 6.3, 0).toNonIndexed(),
      new THREE.BoxGeometry(2.4, 2.5, 2.4).translate(0, 1.25, 0).toNonIndexed(),
    ]);
    const tankMesh = new THREE.InstancedMesh(tankGeo, plainMat(0x6a5a48, 0.9, { flatShading: true }), Math.max(tanks.length, 1));
    tankMesh.count = tanks.length;
    tanks.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.scale.setScalar(1); dummy.updateMatrix(); tankMesh.setMatrixAt(i, dummy.matrix); });
    const acMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), plainMat(0x9a968f, 0.7), Math.max(acs.length, 1));
    acMesh.count = acs.length;
    acs.forEach(([x, y, z, w, h, d], i) => { dummy.position.set(x, y, z); dummy.scale.set(w, h, d); dummy.updateMatrix(); acMesh.setMatrixAt(i, dummy.matrix); });
    for (const m of [capMesh, tankMesh, acMesh]) { m.frustumCulled = false; scene.add(m); }
    world.beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), glowMat(new THREE.Color(9, 0.5, 0.35)), Math.max(masts.length, 1));
    world.beacons.count = masts.length;
    world.beaconPos = masts;
    world.beacons.frustumCulled = false;
    scene.add(world.beacons);
  }

  // ---------- distant islands on the horizon ----------
  {
    const hillMat = plainMat(0x22302c, 1.0, { flatShading: true });
    const hills = [[-5200, -9800, 1500, 210], [-3100, -11500, 1900, 260], [-800, -13000, 1400, 150], [2600, -10500, 1700, 190], [4800, -8200, 1100, 120], [-6400, -7400, 900, 90]];
    for (const [x, z, r, h] of hills) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 11, 1).scale(1, 1, 0.45), hillMat);
      m.position.set(x, h / 2 - 12, z);
      m.rotation.y = R() * 3;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  // ---------- street trees, palms on the waterfront, lamps ----------
  const trees = [], lamps = [];
  for (const side of [-1, 1]) {
    for (let z = -26; z > SHORE_Z + 24; z -= 11 + R() * 3) {
      if (z < -88 && z > -102) continue;
      trees.push({ x: side * (SIDEWALK - 1.4), z, s: 0.8 + R() * 0.45 });
    }
    for (let z = -30; z > SHORE_Z + 20; z -= 22) lamps.push({ x: side * (ROAD_HALF + 0.6), z, side, on: R() });
  }
  for (let x = -240; x <= 600; x += 13) trees.push({ x: x + R() * 3, z: SHORE_Z + 3, s: 1.2 + R() * 0.4, palm: true });
  const trunkGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.26, 4.6, 7).translate(0, 2.3, 0),
    new THREE.CylinderGeometry(0.07, 0.11, 2.2, 5).rotateZ(0.6).translate(-0.55, 4.6, 0),
  ].map((g) => g.toNonIndexed()));
  const crownGeo = mergeGeometries([[0, 6.0, 0, 1.9], [-1.2, 5.6, 0.4, 1.3], [1.1, 5.8, -0.3, 1.4], [0.3, 7.1, 0.6, 1.3], [-0.4, 6.8, -0.9, 1.2]]
    .map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z)));
  const nTrees = trees.length + pots.length;
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, plainMat(0x4a3526, 0.9), trees.length);
  const crownMesh = new THREE.InstancedMesh(crownGeo, plainMat(0x2e4a2a, 0.85, { flatShading: true }), trees.length);
  trees.forEach((tr, i) => crownMesh.setColorAt(i, tmpC.setHSL(0.27 + R() * 0.06, 0.4, 0.2 + R() * 0.08)));
  const palmT = new THREE.InstancedMesh(palmTrunkGeo, plainMat(0x6e5d4b, 0.95, { flatShading: true }), nTrees);
  const palmF = new THREE.InstancedMesh(palmFrondGeo, plainMat(0x2f6a2a, 0.85, { flatShading: true, side: THREE.DoubleSide }), nTrees);
  for (const m of [trunkMesh, crownMesh, palmT, palmF, potMesh]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const hideM = new THREE.Matrix4().makeScale(0, 0, 0);
  const poleGeo = mergeGeometries([new THREE.CylinderGeometry(0.09, 0.12, 8, 6).translate(0, 4, 0), new THREE.BoxGeometry(1.6, 0.12, 0.12).translate(-0.8, 8, 0)]);
  const poleMesh = new THREE.InstancedMesh(poleGeo, plainMat(0x2a2c30, 0.6), lamps.length);
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8).translate(-1.5, 7.85, 0), glowMat(new THREE.Color(9, 6.2, 3.2)), lamps.length);
  for (const m of [poleMesh, bulbMesh]) { m.frustumCulled = false; scene.add(m); }

  // ---------- cars ----------
  // Each lane is a loop that starts and ends out of sight: from under our own tower down the avenue, round the
  // corner at the waterfront and off along the shore road (the lanes on the left come the other way). Everyone
  // in a lane drives at the lane's speed with a gap to the car ahead, so nobody passes through anybody.
  const CAR_N = 70;
  const LANES = [-9, -3.2, 3.2, 9], LANE_SPEED = [11, 12.5, 12, 10.5];
  const Z_IN = 8, Z_TURN = -166, SHORE_RUN = 260;
  const laneR = (lane) => (Math.abs(lane) > 6 ? 4 : 7);                  // corner radius: curb lane tight, inner lane wide
  const laneLen = (lane) => Z_IN - Z_TURN + (Math.PI / 2) * laneR(lane) + SHORE_RUN;
  // position and heading at distance u along an outbound lane (lane > 0, driving away from us, turning right)
  function routeOut(lane, u, out) {
    const r = laneR(lane), a = Z_IN - Z_TURN, b = a + (Math.PI / 2) * r;
    if (u < a) { out.x = lane; out.z = Z_IN - u; out.yaw = 0; }
    else if (u < b) { const th = (u - a) / r; out.x = lane + r - r * Math.cos(th); out.z = Z_TURN - r * Math.sin(th); out.yaw = -th; }
    else { out.x = lane + r + (u - b); out.z = Z_TURN - r; out.yaw = -Math.PI / 2; }
    return out;
  }
  // inbound lanes (lane < 0) are the mirror image, driven the other way
  function route(lane, u, out) {
    if (lane > 0) return routeOut(lane, u, out);
    routeOut(-lane, laneLen(lane) - u, out);
    out.x = -out.x; out.yaw = Math.PI + out.yaw;
    return out;
  }
  const cars = [];
  const perLane = LANES.map((_, k) => Math.floor(CAR_N / 4) + (k < CAR_N % 4 ? 1 : 0));
  for (let i = 0; i < CAR_N; i++) {
    const k = i % 4, lane = LANES[k], j = Math.floor(i / 4), slot = laneLen(lane) / perLane[k];
    cars.push({ lane, speed: LANE_SPEED[k], u0: (j + R() * 0.55) * slot, liftT: V_FLOAT + 0.4 + R() * 4, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.6), bob: R() * 6,
      color: [0xb8b8b8, 0x1e1e22, 0xe0ddd5, 0x8a1c1c, 0x1d3557, 0xd9a400, 0x2f4f3f, 0x6d6d73, 0xf2f2f2][Math.floor(R() * 9)] });
  }
  const carAt = { x: 0, z: 0, yaw: 0 };
  const fleet = makeFleet(scene, CAR_N, { plainMat, glowMat, shadowy });
  { const RK = rng(77); cars.forEach((c, i) => { const taxi = RK() < 0.25; fleet.color(i, taxi ? 0x1f6fd1 : c.color, taxi ? 0 : [0, 1, 2, 0, 3, 2, 1][Math.floor(RK() * 7)]); }); }

  // ---------- people in the streets (they head inside as the water comes up) ----------
  const PEOPLE_N = 240;
  const people = [];
  for (let i = 0; i < PEOPLE_N; i++) {
    const promenade = i < 110;
    people.push({ promenade, x: promenade ? -230 + R() * 760 : (R() < 0.5 ? -1 : 1) * (ROAD_HALF + 0.8 + R() * 3.4), z0: promenade ? SHORE_Z + 1 + R() * 4 : R() * 140,
      dir: R() < 0.5 ? -1 : 1, speed: 0.9 + R() * 0.7, hop: R() * 6.28, h: 0.9 + R() * 0.2, gone: 17 + R() * 6 });
  }
  const crowd = makeCrowd(scene, PEOPLE_N, plainMat(0xffffff, 0.85), { castShadow: false });
  const clothes = [0x2b2d42, 0x8d99ae, 0xef233c, 0xedf2f4, 0x3a5a40, 0xd4a373, 0x264653, 0xe9c46a, 0x6d597a, 0x1d1d1d, 0xf4a261];
  { const RPp = rng(4141); people.forEach((p, i) => crowd.color(i, clothes[Math.floor(RPp() * clothes.length)], [0x2b2d42, 0x3d405b, 0x1d1d1d, 0x6b705c, 0x284b63][Math.floor(RPp() * 5)], SKIN[Math.floor(RPp() * SKIN.length)], HAIR[Math.floor(RPp() * HAIR.length)], RPp() < 0.6)); }

  // ---------- people on our deck ----------
  // kind: pool (chest-deep), lie / sit (loungers), rail (photos at the rail), walk, stand
  const D = [];
  const addD = (kind, x, z, yaw, extra = {}) => D.push({ kind, x, z, yaw, hop: R() * 6.28, h: 0.92 + R() * 0.14, liftT: V_FLOAT + 0.3 + R() * 2.2,
    spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.3), ...extra });
  addD('pool', -4.9, -11.6, Math.PI + 0.3); addD('pool', -4.1, -11.9, Math.PI - 0.6); addD('pool', -1.2, -12.7, Math.PI + 0.1); addD('pool', 0.2, -9.6, -1.2); addD('pool', -5.6, -9.0, 2.6);
  addD('pool', -3.0, POOL_Z0 + 0.4, Math.PI + 0.05); addD('pool', -2.45, POOL_Z0 + 0.4, Math.PI - 0.1); addD('pool', -0.4, POOL_Z0 + 0.4, Math.PI);   // at the far rim, taking in the view
  addD('lie', -5.4, -6.0, Math.PI); addD('lie', 1.4, -6.0, Math.PI); addD('sit', -7.0, -5.8, Math.PI, { phone: true }); addD('sit', 3.0, -5.8, Math.PI);
  addD('rail', -7.5, DECK_Z0 + 0.7, Math.PI + 0.05, { phone: true }); addD('rail', -8.3, DECK_Z0 + 0.65, Math.PI - 0.1); addD('rail', 5.0, DECK_Z0 + 0.7, Math.PI + 0.1, { phone: true }); addD('rail', 6.2, DECK_Z0 + 0.7, Math.PI - 0.05);
  addD('rail', -12.2, DECK_Z0 + 0.7, Math.PI - 0.15); addD('rail', 7.8, DECK_Z0 + 0.8, Math.PI + 0.2, { phone: true });
  // walkers do laps of a narrow loop on clear deck (outside the side loungers and their parasols)
  addD('walk', -14.4, -2, 0, { span: 9, speed: 0.55 }); addD('walk', 9.4, -4, 0, { span: 7, speed: 0.45 });
  addD('stand', 4.6, -3.8, 2.2); addD('stand', 5.3, -4.6, -1.0); addD('stand', -7.8, -3.2, -2.0);
  const deckCrowd = makeCrowd(scene, D.length, plainMat(0xffffff, 0.8), { castShadow: true });
  // walking cadence slows as you get lighter (long floating steps); the gait phase is its running total
  const WT0 = -4, WDT = 1 / 120, WN = Math.round((72 - WT0) / WDT) + 1, walkTab = new Float64Array(WN);
  for (let k = 1; k < WN; k++) { const tv = WT0 + (k - 0.5) * WDT; walkTab[k] = walkTab[k - 1] + 5.2 * (1 - 0.5 * clamp(1 - gFrac(tv))) * WDT; }
  const walkPhase = (v) => { const f = clamp((v - WT0) / WDT, 0, WN - 1.001), k = Math.floor(f); return lerp(walkTab[k], walkTab[k + 1], f - k); };
  // low-gravity jumps for the people standing on the deck: they start together when the caption says so
  const JUMP_T0 = 39.2, JUMP_LAST = V_FLOAT - 2.5, JUMP_GROUND = 0.3;
  function jump(p, v) {   // -> { y, crouch, armsUp, tuck }
    const t0 = JUMP_T0 + (p.hop / 6.283) * 0.45, P = 2.3 + (p.hop / 6.283) * 0.4;
    if (v < t0) return null;
    const c0 = t0 + Math.floor((v - t0) / P) * P;
    if (c0 > JUMP_LAST) return null;
    const f = (v - c0) / P;
    if (f < JUMP_GROUND) { const c = Math.sin(Math.PI * f / JUMP_GROUND); return { y: -0.16 * c, crouch: c, armsUp: -0.45 * c, tuck: 0.2 * c }; }
    const x = (f - JUMP_GROUND) / (1 - JUMP_GROUND), H = 0.45 + 0.55 * smooth(JUMP_T0, 49, c0);
    return { y: H * 4 * x * (1 - x), crouch: 0, armsUp: 1.35 * smooth(0, 0.2, x) * (1 - smooth(0.7, 1, x)), tuck: 0.14 * Math.sin(Math.PI * x) };
  }
  const swim = [0x1d3557, 0xe63946, 0x2a9d8f, 0xf4a261, 0x000000, 0xffb703, 0x8338ec, 0xff006e];
  { const RD = rng(515); D.forEach((p, i) => {
    const skin = SKIN[Math.floor(RD() * SKIN.length)];
    const top = p.kind === 'pool' || p.kind === 'lie' ? (RD() < 0.5 ? skin : swim[Math.floor(RD() * swim.length)]) : clothes[Math.floor(RD() * clothes.length)];
    deckCrowd.color(i, top, p.kind === 'pool' || p.kind === 'lie' ? swim[Math.floor(RD() * swim.length)] : [0x2b2d42, 0xedf2f4, 0x1d1d1d, 0xd4a373][Math.floor(RD() * 4)], skin, HAIR[Math.floor(RD() * HAIR.length)], p.kind === 'rail' || p.kind === 'walk' || p.kind === 'stand' ? RD() < 0.5 : false);
  }); }

  // ---------- boats in the bay and ships anchored offshore ----------
  const boats = [];
  for (let i = 0; i < 14; i++) boats.push({ x: -600 + R() * 1300, z: SHORE_Z - 90 - R() * 900, s: 1 + R() * 2.2, yaw: R() * 6, liftT: V_FLOAT + 1 + R() * 3, spin: (R() - 0.5) });
  const hullGeo = mergeGeometries([new THREE.BoxGeometry(3.2, 1.6, 11).translate(0, 0.4, 0), new THREE.BoxGeometry(2.4, 1.8, 3.5).translate(0, 2.0, 1.5)]);
  const boatMesh = new THREE.InstancedMesh(hullGeo, plainMat(0xe4e0d8, 0.7), boats.length);
  const boatLight = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6).translate(0, 3.2, 1.5), glowMat(new THREE.Color(9, 7, 4)), boats.length);
  for (const m of [boatMesh, boatLight]) { m.frustumCulled = false; scene.add(m); }
  const ships = [];
  for (let i = 0; i < 34; i++) {
    const dist = 1800 + Math.pow(R(), 0.8) * 9000, ang = (R() - 0.5) * 80 * DEG - 12 * DEG;
    ships.push({ x: Math.sin(ang) * dist, z: -Math.cos(ang) * dist, yaw: 1.2 + (R() - 0.5) * 0.5, s: 0.8 + R() * 0.7, tanker: R() < 0.4, liftT: V_FLOAT + 1.5 + R() * 5, spin: (R() - 0.5) });
  }
  const shipGeo = mergeGeometries([
    new THREE.BoxGeometry(30, 9, 190).translate(0, 4.5, 0).toNonIndexed(),
    new THREE.BoxGeometry(24, 12, 120).translate(0, 15, -10).toNonIndexed(),       // containers
    new THREE.BoxGeometry(22, 16, 14).translate(0, 17, 80).toNonIndexed(),          // bridge house
  ]);
  const shipMesh = new THREE.InstancedMesh(shipGeo, plainMat(0x5a5e66, 0.8), ships.length);
  ships.forEach((sh, i) => shipMesh.setColorAt(i, tmpC.set(sh.tanker ? 0x7a2e2a : [0x3c5a7a, 0x6b4a3a, 0x50585c][i % 3])));
  const shipLights = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 6, 4), glowMat(new THREE.Color(9, 8, 6)), ships.length * 3);
  for (const m of [shipMesh, shipLights]) { m.frustumCulled = false; scene.add(m); }

  // ---------- the pool's water lifting off in blobs, things floating ----------
  const blobs = [];
  for (let i = 0; i < 30; i++) blobs.push({ x: POOL_XC + (R() - 0.5) * (POOL_HW * 2 - 1), z: lerp(POOL_Z0 + 0.6, POOL_Z1 - 0.6, R()), r: 0.2 + Math.pow(R(), 2) * 0.75, t0: V_FLOAT + 0.1 + R() * 2.4, a: 0.35 + R() * 0.7, j: 0.12 + R() * 0.4, ph: R() * 6.28, drift: new THREE.Vector2(R() - 0.5, R() - 0.5) });
  // real refraction: each blob bends the city and the sky behind it like a lens of water
  const blobMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.03, metalness: 0, transmission: 1, ior: 1.33, thickness: 1.0,
    attenuationColor: new THREE.Color(0xc9f6fb), attenuationDistance: 9.0, specularIntensity: 1, clearcoat: 0.6, clearcoatRoughness: 0.05,
  });
  blobMat.onBeforeCompile = (shader) => {   // wobble: the blobs keep quivering as they rise
    shader.uniforms.uTime = G.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
      #else
        float ph = 0.0;
      #endif
      transformed *= 1.0 + 0.12 * sin(uTime * 3.1 + ph + position.y * 3.0) + 0.08 * sin(uTime * 4.7 + ph * 2.0 + position.x * 4.0);`);
  };
  const blobMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), blobMat, blobs.length);
  blobMesh.frustumCulled = false;
  scene.add(blobMesh);

  // ---------- particles: spray lifting off the sea, droplets off the pool ----------
  const particles = makeParticles(R);
  scene.add(particles.points);

  // ---------- the pool surface ----------
  const pool = makePool(skyU);
  scene.add(pool.mesh);

  // ---------- the sea ----------
  const ocean = makeOcean(skyU);
  scene.add(ocean.mesh);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x8fa6c8, 0x4a3a30, 1.0);
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const moonLight = new THREE.DirectionalLight(0xb9ccff, 0);
  scene.add(hemi, sun, sun.target, moonLight, moonLight.target);
  const deckCenter = new THREE.Vector3(0, ROOF_Y, -4);

  // ---------- per-frame ----------
  world.frame = (v, s, ctx) => {
    G.uTime.value = v;
    G.uCity.value = s.cityLights;
    const level = s.sea;
    const night = 1 - s.day;
    const city = s.cityLights;
    const g = s.g;                 // felt gravity, 1 .. 0 .. slightly negative
    const light = clamp(1 - g);    // 0 normal .. 1 weightless

    // --- deck furniture ---
    loungers.forEach((l, i) => {
      const dt = v - l.liftT, up = liftDisp(dt, 0.35, 0.12), r = dt > 0 ? dt * dt * 0.12 : 0;
      dummy.position.set(l.x + l.spin.x * up * 0.3, ROOF_Y + up, l.z + l.spin.z * up * 0.2);
      dummy.rotation.set(l.spin.x * r, l.yaw + l.spin.y * r, l.spin.z * r); dummy.scale.setScalar(1); dummy.updateMatrix();
      lfMesh.setMatrixAt(i, dummy.matrix); lcMesh.setMatrixAt(i, dummy.matrix);
    });
    lfMesh.instanceMatrix.needsUpdate = lcMesh.instanceMatrix.needsUpdate = true;
    towels.forEach((tw, i) => {
      const l = tw.l, dt = v - tw.t0, up = liftDisp(dt, 0.08, 0.03) + (dt > 0 ? 0.02 * Math.sin(v * 2 + i) : 0), r = dt > 0 ? dt * 0.35 : 0;
      const ldt = v - l.liftT, lup = liftDisp(ldt, 0.35, 0.12);
      dummy.position.set(l.x + (dt > 0 ? tw.spin.x * dt * 0.25 : 0), ROOF_Y + 0.44 + Math.max(up, lup), l.z + 0.4 + (dt > 0 ? tw.spin.z * dt * 0.2 : 0));
      dummy.rotation.set(tw.spin.x * r, tw.spin.y * r, tw.spin.z * r); dummy.scale.setScalar(1); dummy.updateMatrix();
      towelMesh.setMatrixAt(i, dummy.matrix);
    });
    towelMesh.instanceMatrix.needsUpdate = true;
    umbrellas.forEach((u, i) => {
      const dt = v - u.liftT, up = liftDisp(dt, 0.5, 0.2), r = dt > 0 ? dt * dt * 0.1 : 0;
      dummy.position.set(u.x + u.spin.x * up * 0.4, ROOF_Y + up, u.z + u.spin.z * up * 0.3);
      dummy.rotation.set(u.spin.x * r, u.spin.y * r, u.spin.z * r); dummy.scale.setScalar(1); dummy.updateMatrix();
      umbPole.setMatrixAt(i, dummy.matrix); umbTop.setMatrixAt(i, dummy.matrix);
    });
    umbPole.instanceMatrix.needsUpdate = umbTop.instanceMatrix.needsUpdate = true;

    // --- trees: street, waterfront palms (some lift from the flood), deck pots ---
    trees.forEach((tr, i) => {
      dummy.position.set(tr.x, 1.15, tr.z); dummy.rotation.set(Math.sin(v * 1.3 + i) * 0.02, i, 0); dummy.scale.setScalar(tr.palm ? tr.s * 0.9 : tr.s); dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, tr.palm ? hideM : dummy.matrix); crownMesh.setMatrixAt(i, tr.palm ? hideM : dummy.matrix);
      palmT.setMatrixAt(i, tr.palm ? dummy.matrix : hideM); palmF.setMatrixAt(i, tr.palm ? dummy.matrix : hideM);
    });
    pots.forEach((p, k) => {
      const i = trees.length + k, dt = v - p.liftT, up = liftDisp(dt, 0.3, 0.1), r = dt > 0 ? dt * dt * 0.1 : 0;
      dummy.position.set(p.x + p.spin.x * up * 0.3, ROOF_Y + up, p.z); dummy.rotation.set(p.spin.x * r, k * 1.3 + p.spin.y * r, p.spin.z * r); dummy.scale.setScalar(1); dummy.updateMatrix();
      potMesh.setMatrixAt(k, dummy.matrix);
      dummy.position.y += 0.8; dummy.scale.setScalar(p.s); dummy.updateMatrix();
      palmT.setMatrixAt(i, dummy.matrix); palmF.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [trunkMesh, crownMesh, palmT, palmF, potMesh]) m.instanceMatrix.needsUpdate = true;
    lamps.forEach((l, i) => {
      dummy.position.set(l.x, 1.15, l.z); dummy.rotation.set(0, l.side > 0 ? 0 : Math.PI, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);
      const on = city > 0.25 + l.on * 0.5 && level < 6;
      if (!on) dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      bulbMesh.setMatrixAt(i, dummy.matrix);
    });
    poleMesh.instanceMatrix.needsUpdate = bulbMesh.instanceMatrix.needsUpdate = true;
    world.beaconPos.forEach(([x, y, z], i) => {
      const on = Math.sin(v * 2.6 + i * 1.7) > -0.2 && night > 0.3;
      dummy.position.set(x, y + 3, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(on ? 1 : 0.0001); dummy.updateMatrix();
      world.beacons.setMatrixAt(i, dummy.matrix);
    });
    world.beacons.instanceMatrix.needsUpdate = true;

    // --- traffic: busy until the water reaches the avenue, then the cars float in the flood, then lift off ---
    // drivers brake gently as the water comes up the road (19.0-20.6 s); the flood then lifts the cars little by little
    const drive = 2.2 * easeStop(v, 19.0, 20.6);
    const afloat = smooth(1.4, 2.8, level);
    cars.forEach((c, i) => {
      const L = laneLen(c.lane), u = (((c.u0 + c.speed * drive) % L) + L) % L;
      route(c.lane, u, carAt);
      const floatY = Math.max(1.0, level - 1.05 + Math.sin(v * 1.3 + c.bob) * 0.15 * afloat);
      const dt = v - c.liftT, up = liftDisp(dt, 0.6, 0.35), r = dt > 0 ? dt * dt * 0.25 : 0;
      const yaw = carAt.yaw + Math.sin(v * 0.3 + c.bob) * 0.4 * afloat;
      dummy.position.set(carAt.x + Math.sin(v * 0.2 + c.bob) * 1.0 * afloat, floatY + up, carAt.z + Math.cos(v * 0.17 + c.bob * 1.3) * 1.0 * afloat);
      dummy.rotation.set(c.spin.x * r + Math.sin(v + c.bob) * 0.05 * afloat, yaw + c.spin.y * r, c.spin.z * r);
      dummy.scale.setScalar(carAt.z > -20 ? 0.0001 : 1);   // under our own tower: never in view (and kept out of the roof when they lift)
      dummy.updateMatrix();
      fleet.set(i, dummy.matrix, city > 0.2 || level > 1.6);
    });
    fleet.commit();

    // --- street people: walking; once the sea comes up they hurry inside ---
    people.forEach((p, i) => {
      const walkT = v * 1.6;
      let x = p.x, z;
      if (p.promenade) { x = p.x + p.dir * p.speed * walkT * 0.6; z = p.z0; }
      else { const u = (p.z0 + p.speed * walkT) % 140; z = p.dir < 0 ? -20 - u : -160 + u; }
      const run = smooth(p.gone - 3, p.gone - 1, v);
      crowd.pose(i, { x, y: 1.15, z, yaw: p.promenade ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir < 0 ? Math.PI : 0), s: p.h,
        walk: walkT * 5.5 + p.hop, stride: 1 + run * 0.6, visible: v < p.gone });
    });
    crowd.commit();

    // --- people on the deck ---
    D.forEach((p, i) => {
      const dt = v - p.liftT, up = liftDisp(dt, 0.55, 0.22), r = dt > 0 ? dt * dt * 0.18 : 0;
      const flail = dt > 0 ? smooth(0, 1.2, dt) : 0;
      let x = p.x, z = p.z, y = ROOF_Y, yaw = p.yaw, pitch = 0, sit = 0, walk = 0, stride = 0, armL = 0, armR = 0, look = 0, hop = 0;
      if (p.kind === 'pool') { y = WATER_Y - POOL_DEPTH + 0.1 + Math.sin(v * 1.2 + p.hop) * (0.03 + 0.1 * light * smooth(JUMP_T0, 47, v)); armL = 0.3; armR = 0.25; }
      else if (p.kind === 'lie') { y = ROOF_Y + 0.47; pitch = -1.3; z -= 0.95; }   // feet at the far end, back on the backrest
      else if (p.kind === 'sit') { y = ROOF_Y + 0.5; sit = 1; armR = p.phone ? 1.0 : 0; armL = p.phone ? 0.9 : 0; }
      else if (p.kind === 'rail') { armR = p.phone ? 1.0 : 0; armL = p.phone ? 0.95 : 0; look = 0.15; }
      else if (p.kind === 'walk') {
        // laps of a stadium loop: down one side, a tight U-turn, back up the other (no turning on the spot)
        const rr = 0.6, lap = 2 * p.span + 2 * Math.PI * rr, d = (v * p.speed) % lap;
        if (d < p.span) { z = p.z - d; yaw = 0; }
        else if (d < p.span + Math.PI * rr) { const a = (d - p.span) / rr; x = p.x + rr - rr * Math.cos(a); z = p.z - p.span - rr * Math.sin(a); yaw = -a; }
        else if (d < 2 * p.span + Math.PI * rr) { x = p.x + 2 * rr; z = p.z - p.span + (d - p.span - Math.PI * rr); yaw = -Math.PI; }
        else { const a = (d - 2 * p.span - Math.PI * rr) / rr; x = p.x + rr + rr * Math.cos(a); z = p.z + rr * Math.sin(a); yaw = -Math.PI - a; }
        walk = walkPhase(v) + p.hop; stride = 1 - 0.3 * light;
        hop = Math.abs(Math.sin(walk)) * (0.05 + 0.5 * Math.pow(light, 1.3) * smooth(30, 40, v));   // every step a long, floaty bound
      }
      if (p.kind === 'stand' || p.kind === 'rail') {
        const point = 1.1 * smooth(44, 47, v) * (i % 2);
        const jp = jump(p, v);
        if (jp) {
          hop = jp.y; sit = jp.tuck; pitch += 0.25 * jp.crouch;
          if (!p.phone) { armL = jp.armsUp; armR = Math.max(jp.armsUp, point); }
        } else armR = Math.max(armR, point);
      }
      // everyone looks up as the sky races, and points when things start floating
      if (p.kind !== 'lie') look = Math.max(look, 0.35 * smooth(8, 14, v) * (p.kind === 'pool' ? 0.6 : 1));
      deckCrowd.pose(i, {
        x: x + (dt > 0 ? p.spin.x * up * 0.25 : 0), y: y + hop + up, z: z + (dt > 0 ? p.spin.z * up * 0.2 : 0),
        yaw: yaw + p.spin.y * r, s: p.h, walk: walk + (flail ? v * 4 : 0), stride: stride + flail * 1.1, sit: sit * (1 - flail * 0.7),
        pitch: pitch * (1 - flail * 0.5) + p.spin.x * r, roll: p.spin.z * r,
        armL: flail ? 1.3 + 0.4 * Math.sin(v * 3.1 + p.hop) : armL, armR: flail ? 1.45 + 0.4 * Math.sin(v * 2.7 + p.hop * 2) : armR, look,
      });
    });
    deckCrowd.commit();

    // --- boats and ships ride the rising sea, then lift off ---
    boats.forEach((b, i) => {
      const dt = v - b.liftT, up = liftDisp(dt, 0.9, 0.5) + level, r = dt > 0 ? b.spin * dt * dt * 0.3 : 0;
      dummy.position.set(b.x, up + Math.sin(v * 0.8 + i) * 0.3, b.z);
      dummy.rotation.set(Math.sin(v * 0.6 + i) * 0.04 + r, b.yaw, Math.sin(v * 0.9 + i) * 0.05 + r * 0.7); dummy.scale.setScalar(b.s); dummy.updateMatrix();
      boatMesh.setMatrixAt(i, dummy.matrix); boatLight.setMatrixAt(i, city > 0.4 ? dummy.matrix : hideM);
    });
    boatMesh.instanceMatrix.needsUpdate = boatLight.instanceMatrix.needsUpdate = true;
    ships.forEach((sh, i) => {
      const dt = v - sh.liftT, up = liftDisp(dt, 2.5, 1.5) + level, r = dt > 0 ? sh.spin * dt * dt * 0.05 : 0;
      dummy.position.set(sh.x, up - 2, sh.z); dummy.rotation.set(r, sh.yaw, r * 0.5); dummy.scale.setScalar(sh.s); dummy.updateMatrix();
      shipMesh.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 3; k++) {
        const lp = new THREE.Vector3(0, [12, 26, 22][k], [-90, 80, 0][k]).applyMatrix4(dummy.matrix);
        const m = new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z).multiply(new THREE.Matrix4().makeScale(sh.s, sh.s, sh.s));
        shipLights.setMatrixAt(i * 3 + k, city > 0.35 ? m : hideM);
      }
    });
    shipMesh.instanceMatrix.needsUpdate = shipLights.instanceMatrix.needsUpdate = true;

    // --- the pool lifts off in blobs ---
    blobs.forEach((b, i) => {
      const dt = v - b.t0;
      if (dt <= 0) { blobMesh.setMatrixAt(i, hideM); return; }
      const up = liftDisp(dt, b.a, b.j);
      dummy.position.set(b.x + b.drift.x * up * 0.3 + Math.sin(v * 1.3 + b.ph) * 0.1, WATER_Y + up - b.r * (1 - smooth(0, 0.8, dt)), b.z + b.drift.y * up * 0.3);
      dummy.rotation.set(v * 0.3 + b.ph, v * 0.2, 0); dummy.scale.setScalar(b.r * smooth(0, 0.5, dt)); dummy.updateMatrix();
      blobMesh.setMatrixAt(i, dummy.matrix);
    });
    blobMesh.instanceMatrix.needsUpdate = true;
    blobMesh.visible = v > V_FLOAT;   // (a see-through material costs an extra render pass, so only while it's in the air)

    // --- string lights, pool glow ---
    bulbMeshDeck.visible = city > 0.15;
    deckLights.forEach((pl) => (pl.intensity = city * 30));
    poolGlow.intensity = city * 2 * (1 - smooth(V_FLOAT, V_FLOAT + 2, v));

    particles.uniforms.uTime.value = v;
    particles.uniforms.uLevel.value = level;
    pool.frame(v, s, light);
    ocean.frame(v, s);
    ocean.uniforms.uFogColor.value.copy(ctx.fogColor);

    // --- light ---
    const sd = ctx.sunDir;
    const sunUp = smooth(-0.02, 0.06, sd.y);
    const low = 1 - smooth(0.05, 0.4, sd.y);
    sun.color.setRGB(1.0, lerp(0.95, 0.62, low), lerp(0.88, 0.38, low));
    sun.intensity = 2.6 * sunUp * (1 - 0.55 * low) * (1 - s.cloud * 0.8);
    sun.position.copy(deckCenter).addScaledVector(sd, 150);
    sun.castShadow = sd.y > -0.02;   // no shadow pass at night
    sun.target.position.copy(deckCenter);
    moonLight.position.copy(deckCenter).addScaledVector(ctx.moonDir, 150);
    moonLight.target.position.copy(deckCenter);
    moonLight.intensity = 0.35 * smooth(-0.02, 0.1, ctx.moonDir.y) * night;
    hemi.intensity = lerp(0.22, 1.05, s.day) + 0.25 * s.twilight + s.cloud * 1.2;
    hemi.color.setRGB(lerp(0.32, 0.62, s.day) + 0.3 * s.twilight, lerp(0.34, 0.72, s.day) + 0.1 * s.twilight, lerp(0.55, 0.9, s.day));
    hemi.groundColor.setRGB(lerp(0.28, 0.42, s.day) + 0.12 * city * night, lerp(0.2, 0.34, s.day) + 0.06 * city * night, lerp(0.16, 0.28, s.day));
    scene.fog.color.copy(ctx.fogColor);
    scene.fog.density = lerp(0.00009, 0.00014, night) + s.cloud * s.cloud * 0.02;
    ocean.uniforms.uFogDensity.value = scene.fog.density;
  };
  return world;
}

// spray rising off the weightless sea, and droplets off the pool
function makeParticles(R) {
  const N = 9000;
  const p0 = new Float32Array(N * 3), dir = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    let x, y, z, t0, a, j, size;
    if (i < 7500) {
      const ang = (R() - 0.5) * 70 * DEG - 12 * DEG;
      const dist = 200 + Math.pow(R(), 1.5) * 4500;
      x = Math.sin(ang) * dist; z = -Math.cos(ang) * dist; y = 0;
      t0 = V_FLOAT + R() * 7; a = 1 + R() * 3; j = 0.4 + R() * 1.4; size = 0.6 + R() * 2.0 + dist * 0.0007;
      dir.set([(R() - 0.5) * 0.3, 1, (R() - 0.5) * 0.3], i * 3);
    } else {
      x = POOL_XC + (R() - 0.5) * (POOL_HW * 2 - 0.4); z = lerp(POOL_Z0 + 0.2, POOL_Z1 - 0.2, R()); y = WATER_Y;
      t0 = V_FLOAT - 6 + R() * 9; a = 0.1 + R() * 0.5; j = 0.02 + R() * 0.1; size = 0.02 + R() * 0.05;
      dir.set([(R() - 0.5) * 0.4, 1, (R() - 0.5) * 0.4], i * 3);
    }
    p0.set([x, y, z], i * 3);
    prm.set([t0, a, j, size], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const uniforms = { uTime: { value: 0 }, uLevel: { value: 0 }, uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime; uniform float uScale; uniform float uLevel;
      attribute vec3 aDir; attribute vec4 aPrm;
      varying float vA;
      void main() {
        float dt = uTime - aPrm.x;
        if (dt <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float s = 0.5 * aPrm.y * dt * dt + aPrm.z * dt * dt * dt;
        vec3 p = position + aDir * s;
        if (position.y < 1.0) p.y += uLevel;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = aPrm.w * uScale / max(-mv.z, 0.1);
        gl_PointSize = clamp(px, 1.5, 30.0);
        #include <logdepthbuf_vertex>
        vA = min(dt * 1.5, 1.0) * clamp(px / 1.5, 0.15, 1.0) * 0.4;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 q = gl_PointCoord - 0.5;
        float a = exp(-dot(q, q) * 14.0);
        gl_FragColor = vec4(vec3(0.8, 0.88, 0.95) * a * vA, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

// the pool: clear turquoise water over a pale mosaic, reflecting the sky; it sloshes in slow, tall
// waves as gravity fades and glows from underwater lights at night
function makePool(skyU) {
  const geo = new THREE.PlaneGeometry(POOL_HW * 2, POOL_Z1 - POOL_Z0, 48, 48).rotateX(-Math.PI / 2).translate(POOL_XC, WATER_Y, (POOL_Z0 + POOL_Z1) / 2);
  const uniforms = { ...skyU, uTime: { value: 0 }, uSlosh: { value: 0 }, uGlow: { value: 0 }, uDrain: { value: 0 }, uDay: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime; uniform float uSlosh; uniform float uDrain;
      varying vec3 vW; varying vec2 vP;
      void main() {
        vec3 p = position;
        float w = sin(p.z * 0.55 + uTime * 0.9) * 0.6 + sin(p.x * 0.8 - uTime * 0.7 + p.z * 0.2) * 0.4;
        p.y += w * uSlosh * 0.35 - uDrain;
        vP = p.xz;
        vW = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${SKY_COMMON}
      uniform float uTime; uniform float uSlosh; uniform float uGlow; uniform float uDay;
      varying vec3 vW; varying vec2 vP;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        vec2 g = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          float fi = float(i);
          float a = fi * 2.4 + 0.3;
          vec2 d = vec2(cos(a), sin(a));
          float k = 2.2 + fi * 1.7;
          g += d * cos(dot(d, vP) * k + uTime * (1.5 + fi * 0.6) + fi) * (0.02 / (1.0 + fi * 0.4));
        }
        g += vec2(0.0, cos(vP.y * 0.55 + uTime * 0.9)) * 0.08 * uSlosh;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 refl = min(atmosphere(R), vec3(0.9));
        float caust = 0.5 + 0.5 * sin(vP.x * 3.1 + uTime * 1.3 + sin(vP.y * 2.7 - uTime)) * sin(vP.y * 2.9 - uTime * 1.1);
        vec3 floorC = vec3(0.1, 0.52, 0.68) * (0.12 + 0.88 * uDay) * (0.85 + 0.3 * caust * uDay) + vec3(0.1, 0.7, 0.85) * uGlow * 0.32;
        vec3 c = mix(floorC * 0.8, refl * vec3(0.82, 0.96, 1.0), min(fres, 0.8));
        float spec = pow(max(dot(R, uSunDir), 0.0), 900.0) * smoothstep(-0.02, 0.04, uSunDir.y);
        c += vec3(1.0, 0.7, 0.45) * spec * 1.2;
        gl_FragColor = vec4(c, 0.82 + 0.18 * fres);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    frame(v, s, light) {
      uniforms.uTime.value = v;
      uniforms.uSlosh.value = Math.pow(light, 1.4) * smooth(30, 44, v);
      uniforms.uGlow.value = s.cityLights;
      uniforms.uDay.value = clamp(s.day + 0.3 * s.twilight);
      uniforms.uDrain.value = smooth(V_FLOAT, V_FLOAT + 3, v) * 0.9;
    },
  };
}

function makeOcean(skyU) {
  // radial grid centred under the camera: dense near, sparse far
  const rings = 260, segs = 520;
  const r0 = 18, r1 = 26000, a0 = -180 * DEG, a1 = 180 * DEG;   // all the way round: the flood is everywhere
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.pow(r1 / r0, i / rings);
    for (let j = 0; j <= segs; j++) {
      const a = lerp(a0, a1, j / segs);
      pos[k++] = CAM_BASE.x + Math.sin(a) * r;
      pos[k++] = 0;
      pos[k++] = CAM_BASE.z - Math.cos(a) * r;
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const uniforms = {
    ...skyU, uTime: { value: 0 }, uLevel: { value: 0 }, uLift: { value: 0 }, uDay: { value: 1 },
    uMoonDir: { value: new THREE.Vector3() }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0001 }, uCityRefl: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime; uniform float uLevel; uniform float uLift;
      varying vec3 vW; varying float vDist; varying vec2 vPre; varying float vLump;
      float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
      float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
      const float WIND = 1.2;
      void main() {
        vec3 p = position;
        vPre = p.xz;
        float dist = length(p.xz - cameraPosition.xz);
        float spacing = dist * 0.026 + 0.4;
        float h = 0.0;
        for (int i = 0; i < 9; i++) {
          float fi = float(i);
          float L = 90.0 * pow(0.74, fi);
          float ang = WIND + (h1(fi * 3.1) - 0.5) * 1.3;
          float kk = 6.2832 / L;
          float A = (0.02 + 0.012 * h1(fi * 5.7)) / kk * smoothstep(3.0 * spacing, 6.0 * spacing, L);
          h += A * sin(dot(vec2(cos(ang), sin(ang)), p.xz) * kk - sqrt(9.81 * kk) * uTime * 0.6 + h1(fi * 7.7) * 6.2832);
        }
        h *= 0.35 * exp(-dist / 4000.0);
        // weightless: the sea rises in slow mounds
        float lump = max(vn(p.xz * 0.006 + vec2(uTime * 0.05, 0.0)) * 0.7 + vn(p.xz * 0.019) * 0.3 - 0.35, 0.0);
        vLump = lump * uLift;
        p.y = h + uLevel + uLift * uLift * 70.0 * lump;
        vDist = dist;
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform vec3 uMoonDir; uniform float uDay;
      uniform vec3 uFogColor; uniform float uFogDensity; uniform float uCityRefl;
      ${SKY_COMMON}
      varying vec3 vW; varying float vDist; varying vec2 vPre; varying float vLump;
      float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
      float fbm2(vec2 p) { return vn(p) * 0.55 + vn(p * 2.13 + 7.1) * 0.3 + vn(p * 4.37 + 3.3) * 0.15; }
      float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
      const float WIND = 1.2;
      vec2 waveSlope(vec2 p, float fp, out float lost) {
        vec2 grad = vec2(0.0);
        lost = 0.0;
        float patchy = fbm2(p * 0.0035 + vec2(uTime * 0.004, 0.0));
        float slick = smoothstep(0.08, 0.0, abs(fbm2(p * vec2(0.0016, 0.006) + 3.0) - 0.5));
        float shortAmp = mix(0.5, 1.3, smoothstep(0.3, 0.7, patchy)) * (1.0 - 0.7 * slick);
        vec2 warp = (vec2(vn(p * 0.011), vn(p * 0.011 + 17.0)) - 0.5) * 22.0;
        for (int i = 0; i < 24; i++) {
          float fi = float(i);
          float L = 70.0 * pow(0.745, fi);
          float ang = WIND + (h1(fi * 1.7) - 0.5) * (1.2 + fi * 0.06);
          vec2 d = vec2(cos(ang), sin(ang));
          float kk = 6.2832 / L;
          float S = (0.018 + 0.024 * h1(fi * 5.3)) * (L < 6.0 ? shortAmp : 1.0);
          float fade = smoothstep(1.5 * fp, 4.0 * fp, L);
          float ph = dot(d, p + warp * min(1.0, 8.0 / L)) * kk - sqrt(9.81 * kk) * uTime * 0.6 + h1(fi * 9.1) * 6.2832;
          grad += d * (S * fade * cos(ph));
          lost += 0.5 * S * S * (1.0 - fade);
        }
        return grad;
      }
      float glitter(vec3 V, vec3 N, vec3 L, float lost) {
        vec3 Hm = normalize(V + L);
        float NdH = max(dot(N, Hm), 1e-3);
        float m2 = 0.0012 + lost * 1.6;
        float t2 = (1.0 - NdH * NdH) / (NdH * NdH);
        float D = exp(-t2 / m2) / (3.14159 * m2 * NdH * NdH * NdH * NdH);
        float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hm), 0.0), 5.0);
        return D * Fs / max(dot(N, V), 0.03);
      }
      void main() {
        #include <logdepthbuf_fragment>
        float fp = max(length(fwidth(vPre)), 0.002);
        float lost;
        vec2 sl = waveSlope(vPre, fp, lost);
        vec3 Nc = cross(dFdx(vW), dFdy(vW));
        vec3 Ng = dot(Nc, Nc) > 1e-12 ? normalize(Nc) : vec3(0.0, 1.0, 0.0);
        if (Ng.y < 0.0) Ng = -Ng;
        float big = clamp(vLump * 3.0, 0.0, 1.0);
        vec3 N = normalize(mix(vec3(0.0, 1.0, 0.0), Ng, big) + vec3(-sl.x, 0.0, -sl.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 Rf = reflect(-V, N);
        Rf.y = abs(Rf.y);
        vec3 sky = min(atmosphere(normalize(Rf + vec3(0.0, 0.02, 0.0))) * 0.8, vec3(0.85));
        vec3 deep = mix(vec3(0.006, 0.016, 0.026), vec3(0.03, 0.12, 0.14), uDay);
        vec3 c = mix(deep, sky, fres);
        // the setting Sun's glitter path, and the Moon's
        c += vec3(1.0, 0.62, 0.3) * min(glitter(V, N, uSunDir, lost) * 0.012, 2.0) * smoothstep(-0.02, 0.06, uSunDir.y) * (1.0 - uWhite);
        c += vec3(1.0, 0.95, 0.85) * glitter(V, N, uMoonDir, lost) * 0.012 * smoothstep(-0.02, 0.05, uMoonDir.y) * (1.0 - uDay);
        // the city's lights shimmer on the water near the shore at night
        float near = exp(-vDist / 900.0);
        c += vec3(1.0, 0.7, 0.4) * uCityRefl * near * 0.05 * (0.4 + vn(vPre * vec2(0.6, 0.04) + vec2(0.0, uTime * 0.3)));
        float d = length(vW - cameraPosition);
        float fog = 1.0 - exp(-d * uFogDensity);
        c = mix(c, uFogColor, fog);
        if (any(isnan(c)) || any(isinf(c))) c = uFogColor;
        gl_FragColor = vec4(clamp(c, 0.0, 40.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    frame(v, s) {
      uniforms.uTime.value = v;
      uniforms.uLevel.value = s.sea;
      uniforms.uLift.value = smooth(V_FLOAT, V_FLOAT + 8, v);
      uniforms.uDay.value = clamp(s.day + 0.4 * s.twilight);
      uniforms.uMoonDir.value.fromArray(s.moon);
      uniforms.uCityRefl.value = s.cityLights;
    },
    uniforms,
  };
}
