// The city by the sea: buildings, avenue, cars, people, ocean, debris. Everything is
// a pure function of time so any frame can be rendered independently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, BEND_GLSL, patch } from './bend.js';
import { SKY_COMMON } from './sky.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';

export const CAM_BASE = new THREE.Vector3(0, 37.85, 1.0);
const ROOF_Y = 36;
const SHORE_Z = -188;
const ROAD_HALF = 12;
const SIDEWALK = 16.5;
const FRONT = 17.5;

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

// displacement for objects that "fall up": slow start, then accelerating toward the hole
function liftDisp(dt, a, j) {
  if (dt <= 0) return 0;
  return 0.5 * a * dt * dt + j * dt * dt * dt;
}

export function makeWorld(scene) {
  const R = rng(1337);
  const world = { update: [] };

  // ---------- materials ----------
  const buildingMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.0 }), { windows: true });
  const plainMat = (color, rough = 0.9, extra = {}) =>
    patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m) => { m.frustumCulled = false; return m; };

  // ---------- ground / avenue ----------
  const box = (mat, x0, x1, y1, z0, z1, y0 = -8) => {
    // tessellated so the world-bend curves it smoothly instead of tilting it as a slab
    const sx = Math.min(120, Math.ceil((x1 - x0) / 12)), sz = Math.min(60, Math.ceil((z1 - z0) / 12));
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, sx, 1, sz).translate(0, -(y1 - y0) / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, y1, (z0 + z1) / 2);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const asphalt = plainMat(0x1d1f24, 0.95);
  const pavement = plainMat(0x6f6a64, 0.95);
  const plaza = plainMat(0x8a8178, 0.95);
  box(asphalt, -ROAD_HALF, ROAD_HALF, 1.0, SHORE_Z + 20, 30);              // avenue
  box(pavement, -SIDEWALK, -ROAD_HALF, 1.15, SHORE_Z + 20, 30);
  box(pavement, ROAD_HALF, SIDEWALK, 1.15, SHORE_Z + 20, 30);
  box(plainMat(0x3a3836, 0.95), -900, -SIDEWALK, 1.0, SHORE_Z, 30);         // city blocks base
  box(plainMat(0x3a3836, 0.95), SIDEWALK, 900, 1.0, SHORE_Z, 30);
  box(asphalt, -900, 900, 1.01, SHORE_Z + 6, SHORE_Z + 20);                 // waterfront road
  box(plaza, -900, 900, 1.2, SHORE_Z, SHORE_Z + 6);                         // promenade
  box(asphalt, -900, 900, 1.005, -100, -90);                                // cross street

  // lane markings
  {
    const dash = new THREE.BoxGeometry(0.18, 0.02, 3);
    const n = 36;
    const im = new THREE.InstancedMesh(dash, glowMat(new THREE.Color(0.5, 0.48, 0.42)), n * 2);
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (const x of [-6, 6]) {
        dummy.position.set(x, 1.02, -20 - i * 4.6);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        im.setMatrixAt(k++, dummy.matrix);
      }
    }
    im.frustumCulled = false;
    scene.add(im);
    const center = box(glowMat(new THREE.Color(0.55, 0.42, 0.12)), -0.15, 0.15, 1.02, SHORE_Z + 20, 30, 1.0);
    center.frustumCulled = false;
  }

  // ---------- our rooftop (foreground) ----------
  const roofGroup = new THREE.Group();
  scene.add(roofGroup);
  {
    const concrete = plainMat(0x7b746c, 0.95);
    const p = new THREE.Mesh(new THREE.BoxGeometry(60, 1.1, 0.3), concrete);
    p.position.set(0, ROOF_Y + 0.55, 0);
    roofGroup.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(60, 0.08, 0.4), plainMat(0x6e675f, 0.9));
    cap.position.set(0, ROOF_Y + 1.14, 0);
    roofGroup.add(cap);
    const facade = new THREE.Mesh(new THREE.BoxGeometry(60, ROOF_Y, 30), plainMat(0x5a524b, 0.95));
    facade.position.set(0, ROOF_Y / 2, 15.2);
    roofGroup.add(facade);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 30), plainMat(0x4b4743, 0.95));
    roof.position.set(0, ROOF_Y, 15);
    roofGroup.add(roof);
  }
  // props on the ledge: a mug and two planters (the mug is the first thing to float)
  const mug = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 20), plainMat(0xe9e2d6, 0.5));
    body.position.y = 0.05;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), plainMat(0xe9e2d6, 0.5));
    handle.position.set(0.05, 0.05, 0);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20).rotateX(-Math.PI / 2), plainMat(0x2a170c, 0.3));
    coffee.position.y = 0.092;
    mug.add(body, handle, coffee);
    scene.add(mug);
  }
  const planters = [];
  for (const x of [-0.95, 0.98]) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 14), plainMat(0x8c4a2f, 0.8));
    pot.position.y = 0.13;
    g.add(pot);
    const leafMat = plainMat(0x2f5a2a, 0.8);
    const r2 = rng(x > 0 ? 5 : 6);
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.42, 5), leafMat);
      leaf.position.set((r2() - 0.5) * 0.12, 0.42, (r2() - 0.5) * 0.12);
      leaf.rotation.set((r2() - 0.5) * 0.9, r2() * 6, (r2() - 0.5) * 0.9);
      g.add(leaf);
    }
    g.userData.x = x;
    scene.add(g);
    planters.push(g);
  }

  // ---------- buildings ----------
  const B = []; // {x, z, w, d, h, color, seed, lift}
  const pal = [0x8a7a68, 0x7d6a5b, 0x74675e, 0x6a655f, 0x928672, 0x6b5345, 0x5d636b, 0x50565f, 0x7b756d, 0x76604f];
  const addB = (x, z, w, d, h, opts = {}) =>
    B.push({ x, z, w, d, h, color: opts.color ?? pal[Math.floor(R() * pal.length)], seed: R(), row: opts.row ?? 9 });

  // front rows lining the avenue
  for (const side of [-1, 1]) {
    let z = -20;
    while (z > SHORE_Z + 22) {
      const len = 9 + R() * 14;
      const z1 = Math.max(z - len, SHORE_Z + 22);
      if (!(z1 < -90 && z > -100)) {
        const d = 14 + R() * 14;
        const near = z > -70;
        const h = near ? 16 + R() * 22 : 12 + R() * 22;
        addB(side * (FRONT + d / 2), (z + z1) / 2, d, Math.abs(z - z1) - 0.6, h, { row: 1 });
      }
      z = z1 < -90 && z > -100 ? -100 : z1;
    }
  }
  // back blocks
  for (const side of [-1, 1]) {
    for (let i = 0; i < 60; i++) {
      const x = side * (48 + R() * 230);
      const z = -15 - R() * 160;
      const w = 14 + R() * 22, d = 14 + R() * 22;
      const tower = R() < 0.18;
      const h = tower ? 55 + R() * 60 : 18 + R() * 34;
      addB(x, z, w, d, h, { row: 2, color: tower ? [0x4f5c6c, 0x45505e, 0x5e6875][Math.floor(R() * 3)] : undefined });
    }
  }
  // coastal city to the left, receding along the shore
  for (let i = 0; i < 260; i++) {
    const t = R();
    const z = SHORE_Z - 40 - t * 1700;
    const x = -150 - (1 - t) * 120 - R() * 520 - t * 500;
    const w = 12 + R() * 26;
    addB(x, z, w, 12 + R() * 26, (14 + R() * 60) * (1 - t * 0.5), { row: 3 });
  }
  // and a smaller town to the right
  for (let i = 0; i < 130; i++) {
    const t = R();
    const z = SHORE_Z - 60 - t * 1300;
    const x = 210 + t * 380 + R() * 400;
    addB(x, z, 10 + R() * 18, 10 + R() * 18, 10 + R() * 34, { row: 3 });
  }

  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const seedAttr = new Float32Array(B.length), groundAttr = new Float32Array(B.length).fill(1.15);
  B.forEach((b, i) => (seedAttr[i] = b.seed));
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr, 1));
  bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(groundAttr, 1));
  const bMesh = new THREE.InstancedMesh(bGeo, buildingMat, B.length);
  bMesh.frustumCulled = false;
  B.forEach((b, i) => {
    b.liftT = b.row === 1 ? (b.z < -70 ? 63 + R() * 9 : 99) : b.row === 2 ? (Math.abs(b.x) > 70 || b.z < -60 ? 61 + R() * 10 : 99) : 99;
    b.spin = (R() - 0.5) * 0.25;
    bMesh.setColorAt(i, tmpC.set(b.color));
  });
  scene.add(bMesh);

  // ---------- things fixed to buildings: setbacks, parapets, water towers, plant, masts, awnings ----------
  // Each is placed in its building's frame, so it lifts and tumbles rigidly with it.
  const RA = rng(9090);
  const att = { setback: [], cap: [], tank: [], ac: [], mast: [], awning: [], sign: [] };
  B.forEach((b, i) => {
    if (b.row > 2) { if (RA() < 0.5) att.cap.push([i, 0, b.h, 0, b.w + 0.3, 0.9, b.d + 0.3, 0]); return; }
    let top = b.h;
    if (b.h > 24 && RA() < 0.5) {
      const w = b.w * (0.5 + RA() * 0.3), d = b.d * (0.5 + RA() * 0.3), h = 4 + RA() * (b.h > 50 ? 16 : 7);
      const ox = (RA() - 0.5) * (b.w - w), oz = (RA() - 0.5) * (b.d - d);
      att.setback.push([i, ox, b.h, oz, w, h, d, 0, RA()]);
      att.cap.push([i, ox, b.h + h, oz, w + 0.25, 0.8, d + 0.25, 0]);
    }
    att.cap.push([i, 0, top, 0, b.w + 0.3, 1.1, b.d + 0.3, 0]);
    const spots = 1 + Math.floor(RA() * 4);
    for (let k = 0; k < spots; k++) {
      const ox = (RA() - 0.5) * b.w * 0.7, oz = (RA() - 0.5) * b.d * 0.7, r = RA();
      if (r < 0.3) att.tank.push([i, ox, top, oz, 1, 1, 1, RA() * 6]);
      else if (r < 0.85) att.ac.push([i, ox, top, oz, 1.6 + RA() * 2.5, 1.0 + RA() * 1.4, 1.4 + RA() * 2.4, RA() * 0.3]);
      else att.sign.push([i, ox, top, oz, 1, 1, 1, RA() * 6]);
    }
    if (b.h > 45) att.mast.push([i, 0, b.h + (att.setback.length && att.setback[att.setback.length - 1][0] === i ? att.setback[att.setback.length - 1][5] : 0), 0, 1, 1, 1, 0]);
    // awnings over the shops that face the avenue
    if (b.row === 1) {
      const face = b.x > 0 ? -1 : 1;
      const n = Math.max(1, Math.floor(b.d / 5.5));
      for (let k = 0; k < n; k++) if (RA() < 0.55) att.awning.push([i, face * (b.w / 2 + 0.75), 4.15, -b.d / 2 + (k + 0.5) * (b.d / n), 1.5, 1, b.d / n - 0.8, face > 0 ? 0 : Math.PI, RA()]);
    }
  });
  const attGeo = {
    setback: bGeo.clone(),
    cap: mergeGeometries([
      new THREE.BoxGeometry(1, 1, 0.025).translate(0, 0.5, 0.4875), new THREE.BoxGeometry(1, 1, 0.025).translate(0, 0.5, -0.4875),
      new THREE.BoxGeometry(0.025, 1, 0.95).translate(0.4875, 0.5, 0), new THREE.BoxGeometry(0.025, 1, 0.95).translate(-0.4875, 0.5, 0),
    ]),
    tank: mergeGeometries([
      ...[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z]) => new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5).translate(x, 1.2, z).toNonIndexed()),
      new THREE.BoxGeometry(2.4, 0.15, 2.4).translate(0, 2.4, 0).toNonIndexed(),
      new THREE.CylinderGeometry(1.3, 1.3, 3.2, 14).translate(0, 4.1, 0).toNonIndexed(),
      new THREE.ConeGeometry(1.45, 1.2, 14).translate(0, 6.3, 0).toNonIndexed(),
    ]),
    ac: mergeGeometries([new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed(), new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12).translate(0.2, 1.02, 0).toNonIndexed(), new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12).translate(-0.2, 1.02, 0).toNonIndexed()]),
    mast: mergeGeometries([new THREE.CylinderGeometry(0.12, 0.3, 14, 6).translate(0, 7, 0).toNonIndexed(), new THREE.BoxGeometry(1.4, 0.08, 0.08).translate(0, 9, 0).toNonIndexed(), new THREE.BoxGeometry(1.0, 0.08, 0.08).translate(0, 11.5, 0).toNonIndexed()]),
    awning: new THREE.BoxGeometry(1, 0.12, 1).rotateZ(-0.32).translate(0, 0, 0),
    sign: mergeGeometries([new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(-1.6, 1.25, 0).toNonIndexed(), new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(1.6, 1.25, 0).toNonIndexed()]),
  };
  const setAttr = (list) => {
    const sd = new Float32Array(list.length), gr = new Float32Array(list.length).fill(-12);
    list.forEach((a, k) => (sd[k] = a[8]));
    attGeo.setback.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
    attGeo.setback.setAttribute('aGround', new THREE.InstancedBufferAttribute(gr, 1));
  };
  setAttr(att.setback);
  const attMat = {
    setback: buildingMat, cap: plainMat(0xffffff, 0.9), tank: plainMat(0x5a4632, 0.9, { flatShading: true }), ac: plainMat(0x8a8782, 0.7),
    mast: plainMat(0x2b2d31, 0.6), awning: plainMat(0xffffff, 0.85), sign: plainMat(0x2b2d31, 0.6),
  };
  const attMesh = {};
  for (const k of Object.keys(att)) {
    const m = new THREE.InstancedMesh(attGeo[k], attMat[k], Math.max(att[k].length, 1));
    m.count = att[k].length;
    m.frustumCulled = false;
    att[k].forEach((a, j) => {
      if (k === 'setback' || k === 'cap') m.setColorAt(j, tmpC.set(B[a[0]].color).multiplyScalar(k === 'cap' ? 0.85 : 1.03));
      if (k === 'awning') m.setColorAt(j, tmpC.set([0x9b2226, 0x1d3557, 0x2d6a4f, 0xbb3e03, 0x3d405b, 0x7f5539][Math.floor(a[8] * 6)]));
    });
    scene.add(m);
    attMesh[k] = m;
  }
  // rooftop billboards (lit until the grid fails) and red aviation lights that pulse slowly on the masts
  const boardMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 1.6, 0.15).translate(0, 3.2, 0), glowMat(new THREE.Color(1, 1, 1)), Math.max(att.sign.length, 1));
  boardMesh.count = att.sign.length;
  att.sign.forEach((a, j) => boardMesh.setColorAt(j, new THREE.Color().setHSL([0.0, 0.55, 0.12, 0.85][j % 4], 0.8, 0.5).multiplyScalar(2.4)));
  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6).translate(0, 14.2, 0), glowMat(new THREE.Color(9, 0.6, 0.4)), Math.max(att.mast.length, 1));
  beaconMesh.count = att.mast.length;
  for (const m of [boardMesh, beaconMesh]) { m.frustumCulled = false; scene.add(m); }

  const bPos = new THREE.Vector3(), bQuat = new THREE.Quaternion(), bEul = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const bBase = new THREE.Matrix4(), aLoc = new THREE.Matrix4(), aM = new THREE.Matrix4(), aQ = new THREE.Quaternion(), aE = new THREE.Euler(), aS = new THREE.Vector3(), aP = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  function buildingBase(b, t) {
    const dt = t - b.liftT;
    const up = liftDisp(dt, 0.35, 0.22);
    const tilt = dt > 0 ? b.spin * dt * dt * 0.08 : 0;
    bPos.set(b.x, up, b.z - up * 0.25);
    bEul.set(tilt * 0.6, 0, tilt);
    return bBase.compose(bPos, bQuat.setFromEuler(bEul), one);
  }
  function buildingMatrix(b, t) {
    buildingBase(b, t);
    return aM.multiplyMatrices(bBase, aLoc.makeScale(b.w, b.h, b.d));
  }
  function updateBuildings(t) {
    B.forEach((b, i) => bMesh.setMatrixAt(i, buildingMatrix(b, t)));
    bMesh.instanceMatrix.needsUpdate = true;
    const lightsOn = (b) => t < 57 + (b.seed * 7) % 5;
    for (const k of Object.keys(att)) {
      const m = attMesh[k];
      att[k].forEach((a, j) => {
        const b = B[a[0]];
        buildingBase(b, t);
        aLoc.compose(aP.set(a[1], a[2], a[3]), aQ.setFromEuler(aE.set(0, a[7], 0)), aS.set(a[4], a[5], a[6]));
        aM.multiplyMatrices(bBase, aLoc);
        m.setMatrixAt(j, aM);
        if (k === 'sign') boardMesh.setMatrixAt(j, lightsOn(b) ? aM : hide);
        if (k === 'mast') beaconMesh.setMatrixAt(j, 0.5 + 0.5 * Math.sin(t * 2.2 + j * 1.3) > 0.25 && t < 64 ? aM : hide);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    boardMesh.instanceMatrix.needsUpdate = beaconMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- distant headlands ----------
  {
    const hillMat = plainMat(0x1b2028, 1.0, { flatShading: true });
    const hills = [
      [-2600, -5200, 900, 260], [-1900, -3900, 700, 180], [-3400, -6800, 1400, 420],
      [2300, -4300, 800, 230], [3200, -6100, 1300, 380], [1500, -2600, 520, 120], [-1200, -2400, 420, 90],
    ];
    for (const [x, z, r, h] of hills) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9, 1), hillMat);
      m.position.set(x, h / 2 - 10, z);
      m.rotation.y = R() * 3;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  // ---------- street trees + lamps ----------
  const trees = [], lamps = [];
  for (const side of [-1, 1]) {
    for (let z = -24; z > SHORE_Z + 24; z -= 11 + R() * 3) {
      if (z < -88 && z > -102) continue;
      trees.push({ x: side * (SIDEWALK - 1.4), z, s: 0.8 + R() * 0.45, liftT: 58 + R() * 9, spin: (R() - 0.5) * 2 });
    }
    for (let z = -30; z > SHORE_Z + 20; z -= 22) {
      lamps.push({ x: side * (ROAD_HALF + 0.6), z, side, liftT: 62 + R() * 9, spin: (R() - 0.5) * 2, flick: R() });
    }
  }
  // the promenade palms
  for (let x = -120; x <= 120; x += 13) trees.push({ x: x + R() * 3, z: SHORE_Z + 3, s: 1.2 + R() * 0.4, liftT: 55 + R() * 8, spin: (R() - 0.5) * 2, palm: true });

  const trunkGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.26, 4.6, 7).translate(0, 2.3, 0),
    new THREE.CylinderGeometry(0.07, 0.11, 2.2, 5).rotateZ(0.6).translate(-0.55, 4.6, 0),
    new THREE.CylinderGeometry(0.07, 0.11, 2.0, 5).rotateX(-0.6).translate(0, 4.7, 0.5),
  ].map((g) => g.toNonIndexed()));
  const crownGeo = mergeGeometries([
    [0, 6.0, 0, 1.9], [-1.2, 5.6, 0.4, 1.3], [1.1, 5.8, -0.3, 1.4], [0.3, 7.1, 0.6, 1.3], [-0.4, 6.8, -0.9, 1.2], [0.8, 5.2, 1.0, 1.1],
  ].map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z)));
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
      const fr = [];
      for (let k = 0; k < 5; k++) {
        const len = 0.95, w = [0.35, 0.85, 1.0, 0.8, 0.45][k];
        const seg = new THREE.BoxGeometry(w, 0.035, len).translate(0, 0, len / 2);
        const pos = seg.attributes.position;
        for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) + Math.abs(pos.getX(v)) * 0.35);
        seg.rotateX(-pitch).translate(0, py, px);
        fr.push(seg.toNonIndexed());
        px += Math.cos(pitch) * len; py += Math.sin(pitch) * len; pitch -= 0.33;
      }
      for (const g of fr) parts.push(g.rotateY(yaw).translate(0.97, 9.1, 0));
    }
    const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
  })();
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, plainMat(0x4a3526, 0.9), trees.length);
  const crownMesh = new THREE.InstancedMesh(crownGeo, plainMat(0x2e4a2a, 0.85, { flatShading: true }), trees.length);
  trees.forEach((tr, i) => crownMesh.setColorAt(i, tmpC.setHSL(0.27 + R() * 0.06, 0.35, 0.18 + R() * 0.08)));
  const palmT = new THREE.InstancedMesh(palmTrunkGeo, plainMat(0x6e5d4b, 0.95, { flatShading: true }), trees.length);
  const palmF = new THREE.InstancedMesh(palmFrondGeo, plainMat(0x2f5a2a, 0.85, { flatShading: true, side: THREE.DoubleSide }), trees.length);
  for (const m of [trunkMesh, crownMesh, palmT, palmF]) { m.frustumCulled = false; scene.add(m); }
  const hideM = new THREE.Matrix4().makeScale(0, 0, 0);

  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.12, 8, 6).translate(0, 4, 0),
    new THREE.BoxGeometry(1.6, 0.12, 0.12).translate(-0.8, 8, 0),
  ]);
  const bulbGeo = new THREE.SphereGeometry(0.28, 10, 8).translate(-1.5, 7.85, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, plainMat(0x2a2c30, 0.6), lamps.length);
  const bulbMat = glowMat(new THREE.Color(9, 6.2, 3.2));
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, lamps.length);
  for (const m of [poleMesh, bulbMesh]) { m.frustumCulled = false; scene.add(m); }
  // the nearest lamps actually light the street (trees, cars, people) until the grid fails
  const lampLights = lamps.filter((l) => l.z > -80).map((l) => {
    const pl = new THREE.PointLight(0xffc27a, 0, 34, 1.4);
    pl.position.set(l.x + (l.side > 0 ? -1.5 : 1.5), 7.6, l.z);
    scene.add(pl);
    return { pl, l };
  });

  function liftedProp(p, t, baseY = 1.15) {
    const dt = t - p.liftT;
    const up = liftDisp(dt, 1.0, 0.5);
    const rot = dt > 0 ? p.spin * dt * dt * 0.25 : 0;
    dummy.position.set(p.x + p.spin * up * 0.08, baseY + up, p.z - up * 0.3);
    return rot;
  }
  function updateProps(t, s) {
    trees.forEach((tr, i) => {
      const rot = liftedProp(tr, t);
      const sway = Math.sin(t * 1.7 + i) * 0.03 * (1 + s.quake * 3);
      dummy.rotation.set(rot * 0.7 + sway, i, rot + sway);
      dummy.scale.setScalar(tr.s);
      if (tr.palm) dummy.scale.setScalar(tr.s * 0.9);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, tr.palm ? hideM : dummy.matrix);
      crownMesh.setMatrixAt(i, tr.palm ? hideM : dummy.matrix);
      palmT.setMatrixAt(i, tr.palm ? dummy.matrix : hideM);
      palmF.setMatrixAt(i, tr.palm ? dummy.matrix : hideM);
    });
    trunkMesh.instanceMatrix.needsUpdate = crownMesh.instanceMatrix.needsUpdate = palmT.instanceMatrix.needsUpdate = palmF.instanceMatrix.needsUpdate = true;
    lamps.forEach((l, i) => {
      const rot = liftedProp(l, t);
      dummy.rotation.set(rot * 0.5, l.side > 0 ? 0 : Math.PI, rot);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);
      // lamps die with the grid
      const off = 57.5 + l.flick * 5;
      const on = t < off - 0.5 ? 1 : t < off ? (Math.sin(t * 90 + i) > 0 ? 1 : 0) : 0;
      if (!on) dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      bulbMesh.setMatrixAt(i, dummy.matrix);
    });
    poleMesh.instanceMatrix.needsUpdate = bulbMesh.instanceMatrix.needsUpdate = true;
    lampLights.forEach(({ pl, l }) => {
      const off = 57.5 + l.flick * 5;
      pl.intensity = (t < off ? 26 : 0) * (t - l.liftT > 0 ? 0 : 1) * smooth(0, 6, t + 6);
      const up = liftDisp(t - l.liftT, 1.0, 0.5);
      pl.position.y = 7.6 + 1.15 + up;
    });
  }

  // ---------- cars ----------
  const CAR_N = 64;
  const cars = [];
  for (let i = 0; i < CAR_N; i++) {
    const lane = [-9, -3.2, 3.2, 9][i % 4];
    cars.push({
      lane, dir: lane > 0 ? -1 : 1, z0: R() * 150, speed: 8 + R() * 6,
      liftT: 50.5 + R() * 9, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(2.2),
      drift: (R() - 0.5) * 0.4, swerve: R() * 6,
      color: [0xb8b8b8, 0x1e1e22, 0xe0ddd5, 0x8a1c1c, 0x1d3557, 0xd9a400, 0x2f4f3f, 0x6d6d73, 0xf2c200][Math.floor(R() * 9)],
    });
  }
  const fleet = makeFleet(scene, CAR_N, { plainMat, glowMat, shadowy });
  { const RK = rng(77); cars.forEach((c, i) => { const taxi = RK() < 0.2; fleet.color(i, taxi ? 0xf2b705 : c.color, taxi ? 0 : [0, 1, 2, 0, 3, 2, 1][Math.floor(RK() * 7)]); }); }

  // cumulative traffic distance: full speed until 41s, then braking to a stop by 47s
  const travel = (t) => {
    if (t < 41) return t;
    const u = Math.min(t, 47) - 41;
    return 41 + u - (u * u) / 12; // integral of linear slow-down
  };
  const ROAD_Z0 = -16, ROAD_LEN = 150;
  function updateCars(t, s) {
    const tr = travel(t);
    cars.forEach((c, i) => {
      let u = (c.z0 + c.speed * tr) % ROAD_LEN;
      const z = c.dir < 0 ? ROAD_Z0 - u : ROAD_Z0 - ROAD_LEN + u;
      const dt = t - c.liftT;
      const up = liftDisp(dt, 0.8, 0.45);
      const sw = s.quake > 0 ? Math.sin(t * 2.3 + c.swerve) * 0.35 * smooth(40, 46, t) : 0;
      const yaw = (c.dir < 0 ? 0 : Math.PI) + sw * 0.25;
      dummy.position.set(c.lane + sw + c.drift * up * 0.2, 1.0 + up, z - up * 0.35);
      const r = dt > 0 ? dt * dt * 0.5 : 0;
      dummy.rotation.set(c.spin.x * r, yaw + c.spin.y * r, c.spin.z * r);
      // fade in/out at the ends of the loop (turning off the avenue)
      const endFade = Math.min(clamp(u / 3), clamp((ROAD_LEN - u) / 3));
      dummy.scale.setScalar(dt > 0 ? 1 : Math.max(endFade, 0.0001));
      dummy.updateMatrix();
      fleet.set(i, dummy.matrix, true);
    });
    // headlights die when the grid fails? no, cars keep theirs; but they flicker once lifted
    fleet.commit();
  }

  // ---------- people ----------
  const PEOPLE_N = 300;
  const people = [];
  for (let i = 0; i < PEOPLE_N; i++) {
    const promenade = i < 90;
    people.push({
      promenade,
      x: promenade ? -110 + R() * 220 : (R() < 0.5 ? -1 : 1) * (ROAD_HALF + 0.8 + R() * 3.4),
      z0: promenade ? SHORE_Z + 1 + R() * 4 : R() * 140,
      dir: R() < 0.5 ? -1 : 1,
      speed: 0.9 + R() * 0.7,
      liftT: 49 + R() * 9,
      hop: R() * 6.28,
      spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(4),
      h: 0.9 + R() * 0.2,
    });
  }
  const crowd = makeCrowd(scene, PEOPLE_N, plainMat(0xffffff, 0.85), { castShadow: false });
  const clothes = [0x2b2d42, 0x8d99ae, 0xef233c, 0xedf2f4, 0x3a5a40, 0xd4a373, 0x264653, 0xe9c46a, 0x6d597a, 0x1d1d1d];
  const RPp = rng(4141);
  people.forEach((p, i) => { R(); crowd.color(i, clothes[Math.floor(RPp() * clothes.length)], [0x2b2d42, 0x3d405b, 0x1d1d1d, 0x6b705c, 0x284b63][Math.floor(RPp() * 5)], SKIN[Math.floor(RPp() * SKIN.length)], HAIR[Math.floor(RPp() * HAIR.length)], RPp() < 0.7); });

  function updatePeople(t, s) {
    const walkT = t < 38 ? t : 38 + (Math.min(t, 42) - 38) * 0.5;
    people.forEach((p, i) => {
      let x = p.x, z;
      if (p.promenade) {
        x = p.x + p.dir * p.speed * walkT * 0.6;
        z = p.z0;
      } else {
        const u = (p.z0 + p.speed * walkT) % 140;
        z = p.dir < 0 ? -20 - u : -160 + u;
      }
      // people start bouncing as gravity fades, then float away
      const light = 1 - s.weight;
      const bounce = Math.abs(Math.sin(t * (3.2 - light * 2.2) + p.hop)) * (0.06 + light * light * 2.2);
      const dt = t - p.liftT;
      const up = liftDisp(dt, 0.9, 0.35);
      const stagger = smooth(36, 44, t) * Math.sin(t * 3 + p.hop) * 0.25;
      const r = dt > 0 ? dt * dt * 0.4 : 0;
      const yaw0 = p.promenade ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir < 0 ? Math.PI : 0);
      const flail = dt > 0 ? 1 : 0;
      const balance = smooth(44, 50, t) * (1 - flail);
      crowd.pose(i, {
        x, y: 1.15 + bounce + up, z: z - up * 0.3, yaw: yaw0 + p.spin.y * r, s: p.h,
        walk: flail ? t * 5 + p.hop : walkT * 5.5 + p.hop, stride: flail ? 1.3 : (1 - smooth(38, 42, t)) + light * 0.3,
        pitch: p.spin.x * r + stagger, roll: p.spin.z * r,
        armL: flail ? 1.3 + 0.5 * Math.sin(t * 3.1 + p.hop) : balance * 0.7, armR: flail ? 1.4 + 0.5 * Math.sin(t * 2.7 + p.hop * 2) : balance * 0.75,
        look: smooth(30, 34, t) * 0.6 * (1 - flail),
      });
    });
    crowd.commit();
  }

  // ---------- birds ----------
  const birds = [];
  for (let i = 0; i < 26; i++) birds.push({ x0: -140 - R() * 60, y: 52 + R() * 16, z: -70 - R() * 50, sp: 7 + R() * 2, ph: R() * 6, off: (R() - 0.5) * 18 });
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.25, -1.1, 0.35, 0.1, 0, 0, 0.25,
    0, 0, -0.25, 0, 0, 0.25, 1.1, 0.35, 0.1,
  ], 3));
  birdGeo.computeVertexNormals();
  const birdMesh = new THREE.InstancedMesh(birdGeo, patch(new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.DoubleSide })), birds.length);
  birdMesh.frustumCulled = false;
  scene.add(birdMesh);
  function updateBirds(t) {
    birds.forEach((b, i) => {
      const x = b.x0 + b.sp * t + b.off;
      const scatter = smooth(20, 30, t);
      dummy.position.set(x, b.y + Math.sin(t * 0.7 + b.ph) * 1.5 + scatter * (t - 20) * 3 * (b.ph - 3), b.z - scatter * (t - 20) * 6);
      dummy.rotation.set(0, -Math.PI / 2 + scatter * (b.ph - 3) * 0.3, 0);
      const flap = Math.sin(t * 9 + b.ph * 3);
      dummy.scale.set(1.2, flap * 1.4, 1.2);
      if (x > 260 || t > 40) dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      birdMesh.setMatrixAt(i, dummy.matrix);
    });
    birdMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- boats ----------
  const boats = [];
  for (let i = 0; i < 9; i++) boats.push({ x: -380 + R() * 760, z: SHORE_Z - 120 - R() * 900, s: 1 + R() * 2.5, yaw: R() * 6, liftT: 52 + R() * 8, spin: (R() - 0.5) });
  const hullGeo = mergeGeometries([
    new THREE.BoxGeometry(3.2, 1.6, 11).translate(0, 0.4, 0),
    new THREE.BoxGeometry(2.4, 1.8, 3.5).translate(0, 2.0, 1.5),
  ]);
  const boatMesh = new THREE.InstancedMesh(hullGeo, plainMat(0xd8d4cc, 0.7), boats.length);
  const boatLight = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6).translate(0, 3.2, 1.5), glowMat(new THREE.Color(9, 7, 4)), boats.length);
  for (const m of [boatMesh, boatLight]) { m.frustumCulled = false; scene.add(m); }
  function updateBoats(t, s) {
    boats.forEach((b, i) => {
      const dt = t - b.liftT;
      const up = liftDisp(dt, 1.2, 0.8) + s.tide * 4;
      dummy.position.set(b.x, up + Math.sin(t * 0.8 + i) * 0.3, b.z - liftDisp(dt, 0.5, 0.4));
      const r = dt > 0 ? b.spin * dt * dt * 0.3 : 0;
      dummy.rotation.set(Math.sin(t * 0.6 + i) * 0.04 + r, b.yaw, Math.sin(t * 0.9 + i) * 0.05 + r * 0.7);
      dummy.scale.setScalar(b.s);
      dummy.updateMatrix();
      boatMesh.setMatrixAt(i, dummy.matrix);
      boatLight.setMatrixAt(i, dummy.matrix);
    });
    boatMesh.instanceMatrix.needsUpdate = boatLight.instanceMatrix.needsUpdate = true;
  }

  // ---------- building debris (chunks torn off facades) ----------
  const DEBRIS_N = 900;
  const debris = [];
  const frontRow = B.filter((b) => b.row <= 2);
  for (let i = 0; i < DEBRIS_N; i++) {
    const b = frontRow[Math.floor(R() * frontRow.length)];
    const face = b.x > 0 ? -1 : 1; // face toward the avenue
    const x = b.x + face * (b.w / 2 + 0.2);
    const y = 4 + R() * (b.h - 4);
    const z = b.z + (R() - 0.5) * b.d;
    debris.push({
      b, x, y, z, t0: 53 + Math.pow(R(), 0.7) * 20, s: 0.4 + Math.pow(R(), 3) * 3.2,
      a: 0.8 + R() * 1.4, j: 0.3 + R() * 0.8, out: face * (0.4 + R()),
      spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(6), color: b.color,
    });
  }
  const debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.6, 0.8), plainMat(0xffffff, 0.9, { flatShading: true }), DEBRIS_N);
  debris.forEach((d, i) => debrisMesh.setColorAt(i, tmpC.set(d.color).multiplyScalar(0.8 + R() * 0.3)));
  debrisMesh.frustumCulled = false;
  scene.add(debrisMesh);
  function updateDebris(t) {
    debris.forEach((d, i) => {
      const dt = t - d.t0;
      if (dt <= 0) { dummy.scale.setScalar(0.0001); dummy.position.set(0, -50, 0); }
      else {
        const b = d.b;
        const bUp = liftDisp(t - b.liftT, 0.35, 0.22);
        const up = liftDisp(dt, d.a, d.j);
        dummy.position.set(d.x + d.out * dt * 1.5, d.y + bUp + up, d.z - up * 0.3 - bUp * 0.25);
        dummy.rotation.set(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt);
        dummy.scale.setScalar(d.s * Math.min(dt * 4, 1));
      }
      dummy.updateMatrix();
      debrisMesh.setMatrixAt(i, dummy.matrix);
    });
    debrisMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- GPU particles: glass, spray, dust ----------
  const particles = makeParticles(R, B);
  scene.add(particles.points);

  // ---------- ocean ----------
  const ocean = makeOcean();
  scene.add(ocean.mesh);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x7d8fbf, 0x4a3a30, 1.2);
  const glowBack = new THREE.DirectionalLight(0xffa070, 0.8);
  glowBack.position.set(40, 60, 200);
  const moonLight = new THREE.DirectionalLight(0xbfd2ff, 0.3);
  const diskLight = new THREE.DirectionalLight(0xffb27a, 0);
  scene.add(hemi, glowBack, moonLight, diskLight, diskLight.target, moonLight.target);

  // ---------- per-frame ----------
  world.frame = (t, s, ctx) => {
    G.uTime.value = t;
    G.uCurl.value = s.curl;
    G.uLightsOut.value = s.lightsOut;
    G.uCurlDir.value.set(ctx.bhDir.x, ctx.bhDir.z).normalize();
    G.uCurlOrigin.value.set(CAM_BASE.x, CAM_BASE.z);

    updateBuildings(t);
    updateProps(t, s);
    updateCars(t, s);
    updatePeople(t, s);
    updateBirds(t);
    updateBoats(t, s);
    updateDebris(t);
    particles.uniforms.uTime.value = t;
    ocean.frame(t, s, ctx);

    // our building lets go: roof + ledge ride up with the camera
    roofGroup.position.y = ctx.camLift;
    roofGroup.rotation.z = ctx.camRoll * 0.4;
    // mug floats off the ledge first
    {
      const dt = t - 47.5;
      const up = liftDisp(dt, 0.05, 0.012) * 1.0;
      mug.position.set(0.38 + (dt > 0 ? dt * 0.015 : 0), ROOF_Y + 1.18 + ctx.camLift + up, -0.1 - (dt > 0 ? dt * dt * 0.004 : 0));
      const r = dt > 0 ? dt * dt * 0.02 : 0;
      mug.rotation.set(r * 1.3, r * 0.7 - 0.6, r);
      mug.visible = dt < 30;
    }
    planters.forEach((g, i) => {
      const dt = t - (55 + i * 2.2);
      const up = liftDisp(dt, 0.12, 0.05);
      g.position.set(g.userData.x, ROOF_Y + 1.18 + ctx.camLift + up, 0.0 - up * 0.2);
      const r = dt > 0 ? dt * dt * 0.03 : 0;
      g.rotation.set(r, 0, (i ? -1 : 1) * r);
    });

    // lighting
    const n = s.night;
    hemi.intensity = lerp(0.75, 0.16, n) + s.disk * 0.12;
    hemi.color.setRGB(lerp(0.5, 0.25, n), lerp(0.56, 0.3, n), lerp(0.8, 0.55, n));
    glowBack.intensity = lerp(0.7, 0.0, smooth(0, 26, t));
    moonLight.position.copy(ctx.moonDir).multiplyScalar(100).add(CAM_BASE);
    moonLight.target.position.copy(CAM_BASE);
    moonLight.intensity = 0.45 * s.moonFade * smooth(4, 20, t);
    diskLight.position.copy(ctx.bhDir).multiplyScalar(100).add(CAM_BASE);
    diskLight.target.position.copy(CAM_BASE);
    diskLight.intensity = s.disk * 1.6;
    scene.fog.color.copy(ctx.fogColor);
    scene.fog.density = lerp(0.00011, 0.00016, n);
  };
  return world;
}

function makeParticles(R, B) {
  // three kinds: 0 glass glints from buildings, 1 ocean spray, 2 dust
  const N = 14000;
  const p0 = new Float32Array(N * 3), dir = new Float32Array(N * 3), prm = new Float32Array(N * 4), col = new Float32Array(N * 3);
  const near = B.filter((b) => b.row <= 2);
  for (let i = 0; i < N; i++) {
    const kind = i < 5000 ? 0 : i < 11000 ? 1 : 2;
    let x, y, z, t0, a, j, size, c;
    if (kind === 0) {
      const b = near[Math.floor(R() * near.length)];
      const face = b.x > 0 ? -1 : 1;
      x = b.x + face * (b.w / 2 + 0.1); y = 3 + R() * b.h; z = b.z + (R() - 0.5) * b.d;
      t0 = 52 + Math.pow(R(), 0.8) * 22; a = 1 + R() * 2; j = 0.5 + R() * 1.0; size = 0.12 + R() * 0.2;
      c = [0.9, 0.95, 1.0];
      dir.set([face * (0.3 + R() * 0.6), 1, -0.2 - R() * 0.3], i * 3);
    } else if (kind === 1) {
      const ang = (R() - 0.5) * 70 * DEG;
      const dist = 210 + Math.pow(R(), 1.6) * 3400;
      x = Math.sin(ang) * dist; z = -Math.cos(ang) * dist + 1.2; y = 0;
      t0 = 46 + R() * 26; a = 2 + R() * 4; j = 0.6 + R() * 2.0; size = 0.8 + R() * 2.5 + dist * 0.0008;
      c = [0.75, 0.85, 0.95];
      dir.set([(R() - 0.5) * 0.3, 1, -0.4], i * 3);
    } else {
      x = (R() - 0.5) * 120; z = -20 - R() * 170; y = 1 + R() * 4;
      t0 = 40 + R() * 30; a = 0.2 + R() * 0.6; j = 0.1 + R() * 0.3; size = 0.05 + R() * 0.12;
      c = [0.6, 0.55, 0.5];
      dir.set([(R() - 0.5) * 0.5, 1, -0.3], i * 3);
    }
    p0.set([x, y, z], i * 3);
    prm.set([t0, a, j, size], i * 4);
    col.set(c, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const uniforms = {
    uTime: G.uTime, uCurl: G.uCurl, uCurlOrigin: G.uCurlOrigin, uCurlDir: G.uCurlDir,
    uDiskLight: G.uDiskLight, uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${BEND_GLSL}
      uniform float uTime; uniform float uScale; uniform float uDiskLight;
      attribute vec3 aDir; attribute vec4 aPrm; attribute vec3 aCol;
      varying vec3 vCol; varying float vA;
      void main() {
        float dt = uTime - aPrm.x;
        if (dt <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float s = 0.5 * aPrm.y * dt * dt + aPrm.z * dt * dt * dt;
        vec3 p = position + aDir * s;
        p = bendWorld(p);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = aPrm.w * uScale / max(-mv.z, 0.1);
        gl_PointSize = clamp(px, 1.5, 40.0);
        #include <logdepthbuf_vertex>
        float glint = 0.5 + 0.5 * sin(uTime * 23.0 + position.x * 3.1 + position.y * 1.7);
        vCol = aCol * (0.6 + uDiskLight * 1.2 * glint);
        vA = min(dt * 2.0, 1.0) * clamp(px / 1.5, 0.15, 1.0) * 0.55;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec3 vCol; varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 q = gl_PointCoord - 0.5;
        float a = exp(-dot(q, q) * 14.0);
        vec3 o = vCol * a * vA;
        gl_FragColor = vec4(any(isnan(o)) ? vec3(0.0) : clamp(o, 0.0, 40.0), 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

function makeOcean() {
  // radial grid centred on the camera: dense near, sparse far
  const rings = 260, segs = 320;
  const r0 = 12, r1 = 26000, a0 = -78 * DEG, a1 = 78 * DEG;
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
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);

  const uniforms = {
    uTime: G.uTime, uCurl: G.uCurl, uCurlOrigin: G.uCurlOrigin, uCurlDir: G.uCurlDir,
    uTide: { value: 0 }, uSpike: { value: 0 }, uNight: { value: 0 }, uDisk: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.15, -0.05, 1).normalize() },
    uBhDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uMoonDir: { value: new THREE.Vector3() }, uMoonVis: { value: 1 },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0001 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${BEND_GLSL}
      uniform float uTime; uniform float uTide; uniform float uSpike; uniform vec3 uBhDir;
      varying vec3 vW; varying float vFoam; varying float vDist; varying vec2 vPre;
      float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
      const float WIND = 1.45;
      void main() {
        vec3 p = position;
        vPre = p.xz;
        vec2 o = p.xz - uCurlOrigin;
        float dist = length(o);
        vec2 bh2 = normalize(uBhDir.xz);
        float facing = dot(o / max(dist, 1e-3), bh2);
        float amp = 0.26 * (1.0 + 0.9 * uTide) * smoothstep(150.0, 320.0, dist + 100.0 * (1.0 - uTide)) * exp(-dist / 3000.0);
        // swell: a spread of long components (dropped where the mesh is too coarse to carry them)
        float spacing = dist * 0.026 + 0.4;
        float h = 0.0;
        for (int i = 0; i < 9; i++) {
          float fi = float(i);
          float L = 120.0 * pow(0.74, fi);
          float ang = WIND + (h1(fi * 3.1) - 0.5) * 1.3;
          float kk = 6.2832 / L;
          float A = (0.022 + 0.014 * h1(fi * 5.7)) / kk * smoothstep(3.0 * spacing, 6.0 * spacing, L);
          h += A * sin(dot(vec2(cos(ang), sin(ang)), p.xz) * kk - sqrt(9.81 * kk) * uTime * (1.0 + 0.8 * uTide) + h1(fi * 7.7) * 6.2832);
        }
        h *= amp / 0.26 * 0.55;
        float bulge = uTide * 320.0 * smoothstep(250.0, 7000.0, dist) * pow(max(facing, 0.0), 10.0);
        float level = uTide * 2.2;
        float lat = dist * sqrt(max(1.0 - facing * facing, 0.0));
        float sigma = 140.0 + dist * 0.07;
        float lump = 0.75 + 0.25 * sin(dist * 0.004 + uTime * 0.7) * sin(lat * 0.02 - uTime * 0.9);
        float spikeShape = exp(-pow(lat / (sigma * lump), 2.0)) * smoothstep(900.0, 3200.0, dist) * (1.0 - smoothstep(4500.0, 8000.0, dist)) * step(0.0, facing);
        float spike = uSpike * uSpike * 1100.0 * spikeShape * lump;
        p.y = h + bulge + level + spike;
        vFoam = clamp(spikeShape * uSpike * 2.0, 0.0, 1.0) + smoothstep(0.6, 1.2, h / max(amp, 1e-3)) * 0.15 * uTide;
        vDist = dist;
        p = bendWorld(p);
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform vec3 uMoonDir; uniform float uMoonVis;
      uniform vec3 uFogColor; uniform float uFogDensity;
      ${SKY_COMMON}
      uniform float uCurl;
      uniform float uTide; uniform float uSpike;
      varying vec3 vW; varying float vFoam; varying float vDist; varying vec2 vPre;
      float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
      float fbm2(vec2 p) { return vn(p) * 0.55 + vn(p * 2.13 + 7.1) * 0.3 + vn(p * 4.37 + 3.3) * 0.15; }
      float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
      const float WIND = 1.45;

      // wind-wave slope from ~24 scattered components; unresolved ones become glint roughness
      vec2 waveSlope(vec2 p, float fp, out float lost) {
        vec2 grad = vec2(0.0);
        lost = 0.0;
        float patchy = fbm2(p * 0.0035 + vec2(uTime * 0.004, 0.0));
        float slick = smoothstep(0.08, 0.0, abs(fbm2(p * vec2(0.0016, 0.006) + 3.0) - 0.5));
        float shortAmp = mix(0.5, 1.4, smoothstep(0.3, 0.7, patchy)) * (1.0 - 0.7 * slick) * (1.0 + 1.5 * uTide);
        vec2 warp = (vec2(vn(p * 0.011), vn(p * 0.011 + 17.0)) - 0.5) * 22.0;
        for (int i = 0; i < 24; i++) {
          float fi = float(i);
          float L = 85.0 * pow(0.745, fi);
          float ang = WIND + (h1(fi * 1.7) - 0.5) * (1.2 + fi * 0.06);
          vec2 d = vec2(cos(ang), sin(ang));
          float kk = 6.2832 / L;
          float S = (0.02 + 0.028 * h1(fi * 5.3)) * (L < 6.0 ? shortAmp : 1.0);
          float fade = smoothstep(1.5 * fp, 4.0 * fp, L);
          float ph = dot(d, p + warp * min(1.0, 8.0 / L)) * kk - sqrt(9.81 * kk) * uTime + h1(fi * 9.1) * 6.2832;
          grad += d * (S * fade * cos(ph));
          lost += 0.5 * S * S * (1.0 - fade);
        }
        return grad;
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 Nc = cross(dFdx(vW), dFdy(vW));
        vec3 Ng = dot(Nc, Nc) > 1e-12 ? normalize(Nc) : vec3(0.0, 1.0, 0.0);
        if (dot(Ng, cameraPosition - vW) < 0.0) Ng = -Ng;
        // calm sea: analytic wave normals; once the hole starts lifting and bending it, the mesh shape takes over
        float big = clamp(uTide * 1.5 + uSpike * 2.0 + uCurl * 3.0, 0.0, 1.0);
        float fp = max(length(fwidth(vPre)), 0.002);
        float lost;
        vec2 sl = waveSlope(vPre, fp, lost);
        vec3 N = normalize(mix(vec3(0.0, 1.0, 0.0), Ng, big) + vec3(-sl.x, 0.0, -sl.y) * (1.0 - 0.6 * big));
        float t = uTime;
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 Rf = reflect(-V, N);
        Rf.y = abs(Rf.y);
        vec3 sky = atmosphere(normalize(Rf + vec3(0.0, 0.02, 0.0))) * 0.7;
        vec3 deep = vec3(0.006, 0.02, 0.03) + vec3(0.6, 0.35, 0.2) * uDisk * 0.05;
        vec3 c = mix(deep, sky, fres);
        // moon glitter: a Beckmann lobe widened by the unresolved ripples
        {
          vec3 Hm = normalize(V + uMoonDir);
          float NdH = max(dot(N, Hm), 1e-3);
          float m2 = 0.0012 + lost * 1.6;
          float t2 = (1.0 - NdH * NdH) / (NdH * NdH);
          float D = exp(-t2 / m2) / (3.14159 * m2 * NdH * NdH * NdH * NdH);
          float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hm), 0.0), 5.0);
          c += vec3(1.0, 0.95, 0.85) * D * Fs * 0.012 / max(dot(N, V), 0.03) * uMoonVis * smoothstep(-0.02, 0.05, uMoonDir.y);
        }
        c += vec3(1.0, 0.6, 0.3) * (pow(max(dot(Rf, uBhDir), 0.0), 200.0) * 1.2 + pow(max(dot(Rf, uBhDir), 0.0), 16.0) * 0.12) * uDisk;
        // wind-torn streaks once the sea starts lifting
        float streak = vn(vPre * vec2(0.004, 0.02) + vec2(0.0, -uTime * 0.6)) * vn(vPre * 0.013 + 3.1);
        float lifted = clamp(vFoam + uCurl * smoothstep(150.0, 1500.0, vDist), 0.0, 1.0);
        vec3 lit = vec3(1.0, 0.62, 0.34) * uDisk * (0.12 + 0.45 * max(dot(N, uBhDir), 0.0));
        c += lit * (0.4 + streak) * lifted;
        // the peeled-up sea catches the disk's light: bright wind-streaked water climbing the sky
        float climb = uCurl * smoothstep(250.0, 2500.0, vDist);
        float rows = vn(vPre * vec2(0.02, 0.0025) + vec2(0.0, uTime * 0.9));
        c += vec3(1.0, 0.6, 0.32) * uDisk * climb * (0.10 + 0.55 * rows * streak + 0.25 * pow(rows, 4.0));
        c = mix(c, vec3(0.8, 0.82, 0.86) * (0.05 + uDisk * 0.35), clamp(vFoam * 0.7 + lifted * streak * 0.35, 0.0, 1.0));
        float d = length(vW - cameraPosition);
        float fog = 1.0 - exp(-d * uFogDensity);
        vec3 fogC = atmosphere(normalize(vec3(vW.x - cameraPosition.x, max(vW.y - cameraPosition.y, 0.0) + 0.002 * d, vW.z - cameraPosition.z)));
        c = mix(c, fogC, fog);
        if (any(isnan(c)) || any(isinf(c))) c = fogC;
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
    frame(t, s, ctx) {
      uniforms.uTide.value = s.tide;
      uniforms.uSpike.value = s.spike;
      uniforms.uNight.value = s.night;
      uniforms.uDisk.value = s.disk;
      uniforms.uBhDir.value.copy(ctx.bhDir);
      uniforms.uMoonDir.value.copy(ctx.moonDir);
      uniforms.uMoonVis.value = s.moonFade * (1 - s.moonStretch);
      uniforms.uFogColor.value.copy(ctx.fogColor);
      uniforms.uFogDensity.value = lerp(0.00011, 0.00016, s.night);
    },
  };
}
