// A city beach at golden hour, seen from a third-floor hotel balcony: sunbathers, a volleyball game,
// kids, a lifeguard tower, a kite, swimmers, a pier with a Ferris wheel, and a skyline across the bay.
// Then Earth falls toward the Sun: the beach empties, everything dries out, the sea steams, things burn.
// Everything is a pure function of time so any frame can be rendered independently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, patch } from './bend.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { makeOcean } from './ocean.js';

// ---------- terrain ----------
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 13.1, z * f); f *= 2.03; a *= 0.5; } return s; };
export const shoreZ = (x) => -64 - 0.0006 * x * x + 3 * Math.sin(x * 0.05);
const PROM_Z = -13.5;
export function terrainH(x, z) {
  const dz = z - shoreZ(x);
  if (z > PROM_Z) return 1.5;
  if (dz < 0) return Math.max(-0.25 + dz * 0.03, -28) + (fbm(x / 30, z / 30, 2) - 0.5) * 0.4 * smooth(0, -20, dz);
  return 0.12 + 1.05 * smooth(0, 48, dz) + (fbm(x / 9, z / 9, 3) - 0.5) * 0.22 + 0.06 * Math.sin(dz * 0.9 + x * 0.05) * smooth(6, 0, dz);
}
const FLOOR_Y = 8.3;
export const CAM_BASE = new THREE.Vector3(0, FLOOR_Y + 1.68, 0);
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

export function makeWorld(scene) {
  const R = rng(2468);
  const world = {};
  const plainMat = (color, rough = 0.9, extra = {}, opts = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), opts);
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; return m; };

  // ---------- ground: sand, wet sand, seabed, promenade ----------
  {
    const rings = 220, segs = 300, r0 = 2, r1 = 9000, a0 = -95 * DEG, a1 = 95 * DEG;
    const pos = new Float32Array((rings + 1) * (segs + 1) * 3), col = new Float32Array(pos.length);
    const sand = new THREE.Color(0xe3c99a), sand2 = new THREE.Color(0xd8b984), wet = new THREE.Color(0x9c8460), bed = new THREE.Color(0x6e6450), deep = new THREE.Color(0x2c3533), paved = new THREE.Color(0xbcb3a5);
    let k = 0;
    for (let i = 0; i <= rings; i++) {
      const r = r0 * Math.pow(r1 / r0, i / rings);
      for (let j = 0; j <= segs; j++, k++) {
        const a = lerp(a0, a1, j / segs);
        const x = Math.sin(a) * r, z = -Math.cos(a) * r;
        const h = terrainH(x, z), dz = z - shoreZ(x);
        pos.set([x, h, z], k * 3);
        if (z > PROM_Z) tmpC.copy(paved).multiplyScalar(0.92 + 0.08 * fbm(x / 2, z / 2, 2));
        else if (dz < 0) tmpC.copy(wet).lerp(bed, smooth(0, -25, dz)).lerp(deep, smooth(-60, -300, dz));
        else tmpC.copy(sand).lerp(sand2, fbm(x / 6, z / 6, 3)).lerp(wet, smooth(4, 0, dz));
        col.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
      }
    }
    const idx = [];
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    scene.add(shadowy(new THREE.Mesh(geo, plainMat(0xffffff, 0.95, { vertexColors: true }, { scorch: false })), false, true));
    // the sea wall between the beach and the promenade
    const wall = new THREE.Mesh(new THREE.BoxGeometry(900, 1.2, 0.6).translate(0, 0.6, 0), plainMat(0xcfc6b8, 0.9));
    wall.position.set(0, 0.35, PROM_Z - 0.3);
    scene.add(shadowy(wall));
  }

  // ---------- across the bay: a headland city to the left, hills and a lighthouse to the right ----------
  const towers = [];
  {
    const lands = [[-260, -1050, 420, 260, 70, 0.4], [330, -980, 360, 220, 120, 1.7], [-700, -1500, 600, 300, 140, 2.9]];
    const pos = [], col = [], idx = [];
    const scrub = new THREE.Color(0x6f6a4a), rock = new THREE.Color(0x8d8270), beachC = new THREE.Color(0xd9c296);
    for (const [cx, cz, rx, rz, hgt, sd] of lands) {
      const RN = 22, SG = 64, base = pos.length / 3;
      for (let i = 0; i <= RN; i++) for (let j = 0; j < SG; j++) {
        const a = (j / SG) * Math.PI * 2, rr = (i / RN) * 1.12;
        const wob = 1 + 0.3 * (fbm(Math.cos(a) * 2 + sd, Math.sin(a) * 2 + sd * 3, 3) - 0.5);
        const x = cx + Math.cos(a) * rx * rr * wob, z = cz + Math.sin(a) * rz * rr * wob;
        const n = fbm(x / 300 + sd * 7, z / 300, 4);
        const y = hgt * Math.pow(1 - smooth(0, 1, rr), 1.2) * (0.5 + 0.8 * n) + (rr < 1 ? 6 * smooth(1.0, 0.9, rr) : -15 * smooth(1, 1.12, rr)) - 3;
        pos.push(x, y, z);
        tmpC.copy(scrub).lerp(rock, smooth(0.45, 0.7, n));
        if (rr > 0.9 && rr < 1.02) tmpC.lerp(beachC, 0.6);
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
      for (let i = 0; i < RN; i++) for (let j = 0; j < SG; j++) { const a = base + i * SG + j, b = base + i * SG + ((j + 1) % SG); idx.push(a, a + SG, b, b, a + SG, b + SG); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(shadowy(new THREE.Mesh(g, plainMat(0xffffff, 1, { vertexColors: true, flatShading: true }, { plant: true })), false, false));
    // the skyline on the left headland: towers, tallest near the middle
    for (let n = 0; n < 600 && towers.length < 120; n++) {
      const x = -260 + (R() - 0.5) * 560, z = -1050 + (R() - 0.5) * 300;
      const d = Math.hypot((x + 260) / 300, (z + 1050) / 190);
      if (d > 1) continue;
      const h = (20 + R() * 40) * (1 + 2.2 * Math.pow(1 - d, 2)) * (R() < 0.12 ? 1.8 : 1);
      towers.push({ x, z, w: 16 + R() * 20, d: 16 + R() * 20, h, y0: 0, seed: R(), color: [0xc9c3b8, 0xa9b3bd, 0x8f9aa6, 0xd8d2c6, 0x6f7c8a, 0xb7a993][Math.floor(R() * 6)] });
    }
    const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const seeds = new Float32Array(towers.length), grounds = new Float32Array(towers.length).fill(0.5);
    towers.forEach((b, i) => (seeds[i] = b.seed));
    bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(grounds, 1));
    const bm = new THREE.InstancedMesh(bGeo, patch(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }), { windows: true }), towers.length);
    towers.forEach((b, i) => { dummy.position.set(b.x, b.y0, b.z); dummy.rotation.set(0, 0.3, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix); bm.setColorAt(i, tmpC.set(b.color)); });
    scene.add(shadowy(bm, false, false));
    const lh = new THREE.Group();
    lh.add(new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 26, 12).translate(0, 13, 0), plainMat(0xf2efe8, 0.7)));
    lh.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5, 12).translate(0, 18, 0), plainMat(0xb3261e, 0.6)));
    lh.add(new THREE.Mesh(new THREE.ConeGeometry(3.4, 4, 12).translate(0, 28, 0), plainMat(0x2a2a2a, 0.6)));
    lh.position.set(160, 20, -900);
    scene.add(lh);
  }

  // ---------- the pier and its Ferris wheel (right) ----------
  const wheel = new THREE.Group();
  const wheelGlow = glowMat(new THREE.Color(4.0, 2.6, 1.4));
  {
    const wood = plainMat(0x7b6248, 0.9), steel = plainMat(0xe8e4dc, 0.5, { metalness: 0.3 });
    const px0 = 44, z0 = shoreZ(44) + 30, z1 = -300;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, z0 - z1).translate(0, 0, 0), wood);
    deck.position.set(px0, 4.2, (z0 + z1) / 2);
    scene.add(shadowy(deck));
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 6), wood, 60);
    for (let i = 0; i < 30; i++) for (let s = 0; s < 2; s++) { dummy.position.set(px0 + (s ? 6 : -6), -0.8, z0 - (i / 29) * (z0 - z1)); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); posts.setMatrixAt(i * 2 + s, dummy.matrix); }
    scene.add(shadowy(posts));
    // amusement stalls on the pier
    const stalls = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 3.4, 6).translate(0, 1.7, 0), plainMat(0xffffff, 0.8), 8);
    for (let i = 0; i < 8; i++) { dummy.position.set(px0 + (i % 2 ? 4 : -4), 4.45, -120 - i * 12); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); stalls.setMatrixAt(i, dummy.matrix); stalls.setColorAt(i, tmpC.set([0xe63946, 0xf1faee, 0x457b9d, 0xf4a261][i % 4])); }
    scene.add(shadowy(stalls));
    const W = 19;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(W, 0.35, 6, 64), steel);
    const rim2 = rim.clone(); rim.position.z = 0.9; rim2.position.z = -0.9;
    const spokes = [];
    for (let k = 0; k < 16; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.18, W * 2, 0.18), steel); s.rotation.z = (k / 16) * Math.PI; spokes.push(s); }
    const rot = new THREE.Group();
    rot.add(rim, rim2, ...spokes);
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 6, 4), wheelGlow, 64);
    for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; dummy.position.set(Math.cos(a) * W, Math.sin(a) * W, 1.1); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); lights.setMatrixAt(k, dummy.matrix); }
    lights.frustumCulled = false;
    rot.add(lights);
    const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 2.0, 2.2).translate(0, -1.2, 0), plainMat(0xffffff, 0.7), 16);
    cars.frustumCulled = false;
    for (let k = 0; k < 16; k++) cars.setColorAt(k, tmpC.set([0xe63946, 0xffb703, 0x219ebc, 0x8ecae6, 0xfb8500, 0x2a9d8f][k % 6]));
    wheel.add(rot, cars);
    const legs = mergeGeometries([
      new THREE.BoxGeometry(0.5, W + 4, 0.5).rotateZ(0.32).translate(-3.5, -(W + 4) / 2, 1.4), new THREE.BoxGeometry(0.5, W + 4, 0.5).rotateZ(-0.32).translate(3.5, -(W + 4) / 2, 1.4),
      new THREE.BoxGeometry(0.5, W + 4, 0.5).rotateZ(0.32).translate(-3.5, -(W + 4) / 2, -1.4), new THREE.BoxGeometry(0.5, W + 4, 0.5).rotateZ(-0.32).translate(3.5, -(W + 4) / 2, -1.4),
    ]);
    wheel.add(new THREE.Mesh(legs, steel));
    wheel.position.set(px0 - 2, 4.4 + W + 3, -235);
    wheel.rotation.y = Math.PI / 2 - 0.25;
    wheel.userData = { rot, cars, lights, W };
    wheel.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(wheel);
  }
  function updateWheel(t, s) {
    const { rot, cars, lights, W } = wheel.userData;
    const turn = t < 34 ? t * 0.09 : 34 * 0.09 + (1 - Math.exp(-(t - 34) * 0.5)) * 0.18;   // power fails: it coasts to a stop
    rot.rotation.z = turn;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + turn; dummy.position.set(Math.cos(a) * W, Math.sin(a) * W, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); cars.setMatrixAt(k, dummy.matrix); }
    cars.instanceMatrix.needsUpdate = true;
    lights.visible = s.lightsOut < 0.5;
  }

  // ---------- palms framing the beach ----------
  const palmTrunkGeo = (() => {
    const parts = [];
    for (let k = 0; k < 7; k++) { const y0 = k * 1.5, bend = 0.01 * y0 * y0; parts.push(new THREE.CylinderGeometry(0.24 - k * 0.012, 0.27 - k * 0.012, 1.55, 7).translate(bend, y0 + 0.75, 0).toNonIndexed()); }
    return mergeGeometries(parts);
  })();
  const PALM_TOP = [1.1, 10.6];
  const palmFrondGeo = (() => {
    const parts = [];
    for (let i = 0; i < 15; i++) {
      const yaw = (i / 15) * Math.PI * 2 + (i % 3) * 0.2;
      let px = 0, py = 0, pitch = 0.7 - (i % 3) * 0.28;
      const fr = [];
      for (let k = 0; k < 6; k++) {
        const len = 0.9, w = [0.3, 0.75, 0.95, 0.9, 0.7, 0.35][k];
        const seg = new THREE.BoxGeometry(w, 0.03, len).translate(0, 0, len / 2);
        const p = seg.attributes.position;
        for (let v = 0; v < p.count; v++) p.setY(v, p.getY(v) + Math.abs(p.getX(v)) * 0.35);
        seg.rotateX(-pitch).translate(0, py, px);
        fr.push(seg.toNonIndexed());
        px += Math.cos(pitch) * len; py += Math.sin(pitch) * len; pitch -= 0.3;
      }
      for (const g of fr) parts.push(g.rotateY(yaw).translate(PALM_TOP[0], PALM_TOP[1], 0));
    }
    const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
  })();
  const palms = [];
  for (const [x, z, s] of [[-6.6, -26, 1.05], [7.0, -30, 1.0], [-11, -42, 0.95], [12.5, -46, 1.1], [-17, -60, 0.9]]) palms.push({ x, z, s, r: R() });
  for (let i = 0; i < 30; i++) { const x = (R() - 0.5) * 300; if (Math.abs(x) < 30) continue; palms.push({ x, z: PROM_Z - 2 - R() * 4, s: 0.9 + R() * 0.3, r: R() }); }
  const palmT = new THREE.InstancedMesh(palmTrunkGeo, plainMat(0x8a7560, 0.95, { flatShading: true }), palms.length);
  const palmF = new THREE.InstancedMesh(palmFrondGeo, plainMat(0xffffff, 0.85, { flatShading: true, side: THREE.DoubleSide }, { plant: true }), palms.length);
  palms.forEach((p, i) => palmF.setColorAt(i, tmpC.setHSL(0.25 + p.r * 0.05, 0.5, 0.26 + p.r * 0.08)));
  scene.add(shadowy(palmT), shadowy(palmF));
  // each palm catches fire on its own (day ~57), the fronds go up in a few seconds, and the charred trunk
  // stands until the ground itself is glowing, then crumbles
  palms.forEach((p) => { p.ignite = 37.6 + p.r * 4.5; p.crumble = 52 + p.r * 4; });
  const frondM = new THREE.Matrix4(), trunkM = new THREE.Matrix4(), sc = new THREE.Matrix4();
  function updatePalms(t, s) {
    palms.forEach((p, i) => {
      const burn = smooth(p.ignite + 0.4, p.ignite + 4.5, t);
      const fall = smooth(p.crumble, p.crumble + 2.5, t);
      const sway = (Math.sin(t * 0.9 + i * 1.7) * 0.025 + Math.sin(t * 2.3 + i) * 0.01) * (1 - burn);
      dummy.position.set(p.x, terrainH(p.x, p.z) - 0.2, p.z);
      dummy.rotation.set(sway + fall * 0.35 * (p.r - 0.5), p.r * 6, sway * 0.6 + fall * 0.5 * (p.r > 0.5 ? 1 : -1));
      dummy.scale.set(p.s, p.s * (1 - 0.82 * fall), p.s); dummy.updateMatrix();
      trunkM.copy(dummy.matrix);
      // fronds curl, droop and shrink to nothing as they burn
      dummy.rotation.set(sway + burn * 0.25, p.r * 6, sway * 0.6); dummy.scale.set(p.s * (1 - burn), p.s * (1 - 0.6 * burn), p.s * (1 - burn)); dummy.updateMatrix();
      frondM.copy(dummy.matrix);
      palmT.setMatrixAt(i, fall >= 0.999 ? sc.makeScale(0, 0, 0) : trunkM); palmF.setMatrixAt(i, burn >= 0.999 ? sc.makeScale(0, 0, 0) : frondM);
    });
    palmT.instanceMatrix.needsUpdate = palmF.instanceMatrix.needsUpdate = true;
  }

  // ---------- beach furniture: umbrellas, towels, loungers, a lifeguard tower, a volleyball net, a sandcastle ----------
  const umbrellas = [];
  const inView = (x, z, m = 1.1) => Math.abs(x) < 0.34 * Math.abs(z) * m + 3;
  for (let n = 0; n < 400 && umbrellas.length < 34; n++) {
    const z = -18 - R() * 40, x = (R() - 0.5) * 2 * (0.34 * Math.abs(z) + 6);
    if (Math.abs(x - 0) < 4 && Math.abs(z + 36) < 4) continue;   // keep the volleyball court clear
    if (z < shoreZ(x) + 8) continue;
    umbrellas.push({ x, z, tilt: (R() - 0.5) * 0.2, r: R(), c: [0xe63946, 0xf1c453, 0x2a9d8f, 0xf4f1de, 0x457b9d, 0xe76f51, 0x1d3557, 0xffffff][Math.floor(R() * 8)] });
  }
  const umbPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5).translate(0, 1.15, 0), plainMat(0xdddddd, 0.6), umbrellas.length);
  const umbCan = new THREE.InstancedMesh(mergeGeometries([new THREE.ConeGeometry(1.3, 0.5, 12, 1, true).translate(0, 2.3, 0)]), plainMat(0xffffff, 0.9, { side: THREE.DoubleSide }), umbrellas.length);
  const towels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.03, 1.8), plainMat(0xffffff, 1.0), umbrellas.length * 2);
  umbrellas.forEach((u, i) => {
    umbCan.setColorAt(i, tmpC.set(u.c));
    for (let k = 0; k < 2; k++) towels.setColorAt(i * 2 + k, tmpC.set([0xff8fab, 0x8ecae6, 0xffd166, 0x06d6a0, 0xffffff, 0xef476f][Math.floor(R() * 6)]));
    const y = terrainH(u.x, u.z);
    dummy.position.set(u.x, y, u.z); dummy.rotation.set(u.tilt, u.r * 6, u.tilt * 0.5); dummy.scale.setScalar(1); dummy.updateMatrix();
    umbPole.setMatrixAt(i, dummy.matrix); umbCan.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 2; k++) {
      const tx = u.x + (k ? 1.1 : -1.0), tz = u.z + 0.6;
      dummy.position.set(tx, terrainH(tx, tz) + 0.03, tz); dummy.rotation.set(0, 0.2 * (R() - 0.5), 0); dummy.updateMatrix();
      towels.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  });
  scene.add(shadowy(umbPole), shadowy(umbCan), shadowy(towels, false, true));
  // around day 61-63 the umbrellas catch fire one after another and burn away
  umbrellas.forEach((u) => (u.ignite = 44 + u.r * 6));
  function updateUmbrellas(t) {
    umbrellas.forEach((u, i) => {
      const burn = smooth(u.ignite + 0.5, u.ignite + 4.5, t);
      dummy.position.set(u.x, terrainH(u.x, u.z), u.z); dummy.rotation.set(u.tilt + burn * 0.25, u.r * 6, u.tilt * 0.5);
      dummy.scale.set(1 - 0.85 * burn, 1 - 0.5 * burn, 1 - 0.85 * burn); dummy.updateMatrix();
      umbCan.setMatrixAt(i, dummy.matrix);
    });
    umbCan.instanceMatrix.needsUpdate = true;
  }
  const umbFire = makeUmbrellaFire(R, umbrellas);
  scene.add(umbFire.points);
  {
    // lifeguard tower: stilts, a hut, a red rescue board and flag
    const g = new THREE.Group();
    const white = plainMat(0xf2f0ea, 0.7), red = plainMat(0xd62828, 0.6), wood = plainMat(0x8a6a48, 0.9);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.6, 6).translate(x * 1.1, 1.3, z * 1.1), wood));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 2.8).translate(0, 2.65, 0), wood));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.2).translate(0, 3.6, -0.2), white));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.6).translate(0, 4.6, -0.2), red));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.05).translate(0, 3.9, 0.92), plainMat(0x1d2633, 0.3)));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 2.8).rotateX(-1.1).translate(0, 1.4, 1.6), wood));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06).translate(1.2, 5.6, -1.1), wood));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.03).translate(1.66, 6.8, -1.1), red));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.4).rotateX(0.3).translate(1.5, 1.0, 0.6), red));
    const lx = -11.5, lz = -44;
    g.position.set(lx, terrainH(lx, lz) - 0.1, lz); g.rotation.y = Math.PI - 0.15;
    g.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(g);
    // volleyball net
    const net = new THREE.Group();
    for (const x of [-4.6, 4.6]) net.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6).translate(x, 1.3, 0), plainMat(0xcccccc, 0.5, { metalness: 0.4 })));
    net.add(new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.9, 0.02).translate(0, 2.05, 0), plainMat(0x222222, 0.9, { transparent: true, opacity: 0.55 })));
    net.add(new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.07, 0.03).translate(0, 2.5, 0), plainMat(0xffffff, 0.8)));
    net.position.set(1, terrainH(1, -36), -36);
    net.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(net);
    // sandcastle
    const sc = new THREE.Group();
    const sandM = plainMat(0xcfae7a, 0.95, { flatShading: true });
    sc.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.45, 10).translate(0, 0.22, 0), sandM));
    for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4], [0, 0]]) sc.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8).translate(x, 0.6, z), sandM), new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 8).translate(x, 0.98, z), sandM));
    sc.add(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.14, 4, 20).rotateX(Math.PI / 2), plainMat(0x9c8460, 0.95)));
    sc.position.set(2.2, terrainH(2.2, -21), -21);
    sc.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(sc);
  }

  // ---------- people ----------
  const people = [];
  const clothes = [0x2b2d42, 0xef233c, 0xedf2f4, 0x3a5a40, 0x264653, 0xe9c46a, 0x6d597a, 0x1d1d1d, 0xff9f1c, 0x48cae4, 0xf72585, 0x4cc9f0];
  umbrellas.forEach((u, i) => { if (R() < 0.85) people.push({ kind: 'lie', x: u.x + (R() < 0.5 ? -1 : 1.1), z: u.z + 0.6, yaw: R() * 0.4 - 0.2 + (R() < 0.5 ? 0 : Math.PI), r: R() }); if (R() < 0.5) people.push({ kind: 'sit', x: u.x + 0.3, z: u.z - 0.2, yaw: Math.PI + (R() - 0.5), r: R() }); });
  for (let k = 0; k < 4; k++) people.push({ kind: 'volley', side: k < 2 ? 1 : -1, slot: k % 2, r: R() });
  for (let k = 0; k < 3; k++) people.push({ kind: 'kid', k, r: R() });
  for (let k = 0; k < 16; k++) { const z = shoreZ(0) + 2 + R() * 4; people.push({ kind: 'walk', x0: (R() - 0.5) * 60, z, dir: R() < 0.5 ? -1 : 1, sp: 0.9 + R() * 0.5, r: R() }); }
  for (let k = 0; k < 18; k++) { const x = (R() - 0.5) * 50; people.push({ kind: 'swim', x, z: shoreZ(x) - 3 - R() * 26, r: R(), swim: R() < 0.45 }); }
  people.push({ kind: 'guard', r: R() }, { kind: 'kiter', r: R() });
  people.forEach((p) => { p.leaveT = 21 + R() * 8; p.h = p.kind === 'kid' ? 0.6 + R() * 0.1 : 0.92 + R() * 0.16; p.ph = R() * 6.28; });
  const crowd = makeCrowd(scene, people.length, plainMat(0xffffff, 0.8));
  people.forEach((p, i) => {
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    const bare = p.kind !== 'guard' && R() < 0.6;
    const suit = clothes[Math.floor(R() * clothes.length)];
    crowd.color(i, bare ? skin : (p.kind === 'guard' ? 0xd62828 : suit), p.kind === 'guard' ? 0xd62828 : suit, skin, HAIR[Math.floor(R() * HAIR.length)], !bare && R() < 0.3);
  });
  const VB = { x: 1, z: -36 };
  function updatePeople(t, s) {
    people.forEach((p, i) => {
      const away = Math.max(0, t - p.leaveT);
      const goneK = clamp(away / 6);
      let x = p.x, z = p.z, y, yaw = p.yaw || 0, stride = 0, walk = t * 5.5 + p.ph, sit = 0, pitch = 0, armL = 0, armR = 0, look = 0;
      if (p.kind === 'lie') { pitch = -Math.PI / 2; y = terrainH(x, z) + 0.12; if (p.r < 0.3) { armL = 1.55; armR = 1.55; } }
      else if (p.kind === 'sit') { sit = 1; y = terrainH(x, z) + 0.05; armR = 0.2 + 0.15 * Math.sin(t + i); }
      else if (p.kind === 'volley') {
        // two-a-side: the ball goes back and forth; whoever plays it jumps
        const rally = (t * 0.55 + p.side * 0.5) % 2;
        x = VB.x + (p.slot ? 2.2 : -2.2) + Math.sin(t * 0.8 + i) * 0.6; z = VB.z + p.side * (2.6 + Math.sin(t * 0.6 + i) * 0.7);
        yaw = p.side > 0 ? Math.PI : 0;
        const hit = Math.exp(-Math.pow((rally - (p.slot ? 0.35 : 0.85)) * 6, 2));
        y = terrainH(x, z) + hit * 0.55; armL = armR = 0.6 + hit * 1.0; stride = 0.25;
      } else if (p.kind === 'kid') {
        const a = t * 0.4 + p.k * 2.1;
        x = 2.2 + Math.cos(a) * (1.6 + p.k * 0.3); z = -21 + Math.sin(a) * 1.3;
        if (p.k === 2) { x = 1.0; z = -20.2; sit = 1; armR = 0.6 + 0.3 * Math.sin(t * 3); armL = 0.5 + 0.3 * Math.sin(t * 3 + 1); }
        else { yaw = Math.atan2(-Math.sin(a), Math.cos(a)); stride = 1.4; walk = t * 10 + p.k; }
        y = terrainH(x, z) + 0.03;
      } else if (p.kind === 'walk') {
        x = ((p.x0 + p.dir * p.sp * t + 60) % 120) - 60; z = p.z;
        yaw = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2; stride = 1; y = terrainH(x, z) + 0.03;
      } else if (p.kind === 'swim') {
        y = Math.max(terrainH(x, z), -1.3) + Math.sin(t * 1.3 + i) * 0.06;
        if (p.swim && terrainH(x, z) < -0.9) { pitch = Math.PI / 2 - 0.15; y = -0.22; yaw = Math.PI / 2; x = p.x + Math.sin(t * 0.2 + i) * 4; armL = t * 1.5 + i; armR = armL + 2.17; }
        else yaw = Math.PI + (p.r - 0.5);
      } else if (p.kind === 'guard') {
        x = -11.5; z = -43.4; y = terrainH(x, z) + 2.8; yaw = Math.PI - 0.15; sit = 1; look = 0.1;
      } else {   // the kid flying the kite
        x = -3.5; z = -29; y = terrainH(x, z) + 0.03; yaw = Math.PI - 0.3; armR = 1.2 + 0.1 * Math.sin(t * 2); armL = 1.0; look = 0.6;
      }
      // the heat drives everyone off the beach, up toward the promenade (out of shot)
      if (away > 0) {
        const hx = x, hz = z;
        x = lerp(hx, hx * 0.6, goneK); z = lerp(hz, PROM_Z + 4, goneK);
        yaw = Math.atan2(x - hx + 1e-4, z - hz + 1e-4); stride = 1.2; sit = 0; pitch = 0; armL = armR = 0; look = 0;
        y = terrainH(x, z) + 0.03;
      }
      crowd.pose(i, { x, y, z, yaw, s: p.h, walk, stride, sit, pitch, armL, armR, look, visible: goneK < 0.999 });
    });
    crowd.commit();
  }

  // ---------- a kite on a long string ----------
  const kite = new THREE.Group();
  {
    const kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, 0, -0.6, 0, 0, 0, -1.1, 0, 0, 0.9, 0, 0, -1.1, 0, 0.6, 0, 0], 3));
    kg.computeVertexNormals();
    kite.add(new THREE.Mesh(kg, plainMat(0xf72585, 0.7, { side: THREE.DoubleSide })));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.02).translate(0, -2.6, 0), plainMat(0x4cc9f0, 0.8));
    kite.add(tail);
    kite.traverse((o) => { if (o.isMesh) shadowy(o, true, false); });
    scene.add(kite);
  }
  const kiteLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.6 }));
  kiteLine.frustumCulled = false;
  scene.add(kiteLine);
  function updateKite(t, s) {
    const on = 1 - smooth(22, 24, t);
    const kx = -2 + Math.sin(t * 0.5) * 2.5 + Math.sin(t * 1.3) * 0.6, ky = 16 + Math.sin(t * 0.7) * 2 + Math.sin(t * 1.9) * 0.5, kz = -46 + Math.sin(t * 0.3) * 2;
    kite.position.set(kx, ky, kz); kite.rotation.set(0.3, 0.2 * Math.sin(t * 0.8), Math.sin(t * 1.1) * 0.35);
    kite.visible = kiteLine.visible = on > 0.5;
    const p = kiteLine.geometry.attributes.position;
    p.setXYZ(0, -3.5 + 0.3, terrainH(-3.5, -29) + 1.6, -29.3); p.setXYZ(1, kx, ky, kz); p.needsUpdate = true;
  }

  // ---------- gulls ----------
  const gulls = [];
  for (let i = 0; i < 16; i++) gulls.push({ cx: (R() - 0.5) * 40, cz: -40 - R() * 60, r: 8 + R() * 14, y: 12 + R() * 14, w: (0.3 + R() * 0.3) * (R() < 0.5 ? -1 : 1), ph: R() * 6 });
  const gullGeo = new THREE.BufferGeometry();
  gullGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.3, -1.0, 0.25, 0.1, 0, 0, 0.3, 0, 0, -0.3, 0, 0, 0.3, 1.0, 0.25, 0.1], 3));
  gullGeo.computeVertexNormals();
  const gullMesh = new THREE.InstancedMesh(gullGeo, patch(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide, roughness: 0.8 })), gulls.length);
  gullMesh.frustumCulled = false;
  scene.add(gullMesh);
  function updateGulls(t) {
    const gone = smooth(24, 30, t);
    gulls.forEach((g, i) => {
      const a = g.ph + g.w * t;
      dummy.position.set(g.cx + Math.cos(a) * g.r, g.y + gone * 40, g.cz + Math.sin(a) * g.r - gone * 80);
      dummy.rotation.set(0, -a + (g.w > 0 ? 0 : Math.PI), Math.sin(t * 2 + i) * 0.2);
      dummy.scale.set(0.8, Math.sin(t * 6 + g.ph * 3) * 0.7 + 0.1, 0.8);
      if (gone > 0.98) dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      gullMesh.setMatrixAt(i, dummy.matrix);
    });
    gullMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- boats: sailboats, a jet ski, a cruise ship far out ----------
  const boats = [];
  for (let i = 0; i < 9; i++) boats.push({ x: -120 + R() * 260, z: -180 - R() * 700, s: 0.9 + R() * 0.8, yaw: R() * 6, r: R(), sail: R() < 0.7, drift: (R() - 0.5) * 2 });
  const hullGeo = mergeGeometries([new THREE.BoxGeometry(2.4, 1.0, 8).translate(0, 0.3, 0), new THREE.CylinderGeometry(0.07, 0.07, 10, 5).translate(0, 5.6, 0.5)]);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, 0.6, 0, 10.4, 0.6, 0, 1.2, -3.2], 3));
  sailGeo.computeVertexNormals();
  const boatMesh = new THREE.InstancedMesh(hullGeo, plainMat(0xf4f1ea, 0.6), boats.length);
  const sailMesh = new THREE.InstancedMesh(sailGeo, plainMat(0xfaf7f0, 0.9, { side: THREE.DoubleSide }), boats.length);
  scene.add(shadowy(boatMesh), shadowy(sailMesh));
  const jet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 2.6).translate(0, 0.25, 0), plainMat(0xffd60a, 0.5));
  scene.add(shadowy(jet));
  const ship = new THREE.Group();
  {
    const white = plainMat(0xf7f5f0, 0.6), dark = plainMat(0x1d2a3a, 0.6), glassM = plainMat(0x22303c, 0.25);
    ship.add(new THREE.Mesh(new THREE.BoxGeometry(30, 9, 200).translate(0, 1.5, 0), dark), new THREE.Mesh(new THREE.BoxGeometry(28, 15, 160).translate(0, 13, -8), white), new THREE.Mesh(new THREE.BoxGeometry(22, 7, 100).translate(0, 24, -14), white));
    for (let k = 0; k < 5; k++) ship.add(new THREE.Mesh(new THREE.BoxGeometry(28.6, 0.8, 156).translate(0, 7.5 + k * 2.6, -8), glassM));
    ship.position.set(150, 0, -2600); ship.rotation.y = 1.4;
    scene.add(ship);
  }
  function updateBoats(t, s) {
    const calm = 1 - 0.7 * s.boil;
    boats.forEach((b, i) => {
      dummy.position.set(b.x + b.drift * t, Math.sin(t * 0.9 + i) * 0.2 * calm, b.z);
      dummy.rotation.set(Math.sin(t * 0.7 + i) * 0.05, b.yaw, Math.sin(t * 1.1 + i) * 0.06 + s.boil * 0.2 * (b.r - 0.5));
      dummy.scale.setScalar(b.s); dummy.updateMatrix();
      boatMesh.setMatrixAt(i, dummy.matrix);
      if (!b.sail || s.fire > 0.5 + b.r * 0.4) dummy.scale.setScalar(0.0001), dummy.updateMatrix();
      sailMesh.setMatrixAt(i, dummy.matrix);
    });
    boatMesh.instanceMatrix.needsUpdate = sailMesh.instanceMatrix.needsUpdate = true;
    const ja = t * 0.35;
    jet.position.set(-10 + Math.sin(ja) * 28, Math.sin(t * 3) * 0.08, -110 + Math.cos(ja * 0.8) * 22);
    jet.rotation.set(0, ja + Math.PI / 2, Math.sin(ja) * 0.25);
    jet.visible = t < 20;
  }

  // ---------- particles: flames + smoke from burning palms and the far hills, steam off the sea ----------
  const fire = makeFire(R, palms, towers);
  const steam = makeSteam(R);
  scene.add(fire.points, fire.smoke, steam.points);

  // ---------- the sea ----------
  const ocean = makeOcean({ CAM_BASE, DIR_I: new THREE.Vector2(0, -1) });
  scene.add(ocean.mesh);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x9aa8c8, 0x8a6a48, 0.8);
  const sun = new THREE.DirectionalLight(0xffb070, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 1500 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.target.position.set(0, 0, -40);
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 60, 1.6);
  fireLight.position.set(-6, 10, -26);
  scene.add(hemi, sun, sun.target, fireLight);

  world.frame = (t, s, ctx) => {
    G.uTime.value = t;
    G.uLightsOut.value = s.lightsOut;
    G.uBrown.value = s.brown;
    G.uScorch.value = smooth(40, 56, t);
    G.uGlow.value = s.glow;
    G.uMelt.value = s.melt;
    G.uDrain.value = s.drain;
    updatePeople(t, s);
    updatePalms(t, s);
    updateUmbrellas(t);
    umbFire.uniforms.uTime.value = t;
    updateWheel(t, s);
    updateKite(t, s);
    updateGulls(t);
    updateBoats(t, s);
    fire.uniforms.uTime.value = t; fire.uniforms.uFire.value = s.fire; fire.uniforms.uSmoke.value = s.smoke;
    steam.uniforms.uTime.value = t; steam.uniforms.uBoil.value = s.boil; steam.uniforms.uHeat.value = s.heat;
    ocean.frame(t, s, ctx);
    sun.position.copy(ctx.sunDir).multiplyScalar(800).add(sun.target.position);
    sun.color.setRGB(1.0, lerp(0.69, 0.9, s.heat), lerp(0.44, 0.8, s.heat));
    sun.intensity = 3.0 * (1 + 0.15 * s.heat) * (1 - 0.35 * s.smoke);   // the camera adapts: the heat shows in colour, not blown-out light
    hemi.intensity = 0.8 + 0.15 * s.heat;
    hemi.color.setRGB(lerp(0.6, 1.0, s.heat), lerp(0.66, 0.92, s.heat), lerp(0.78, 0.78, s.heat));
    fireLight.intensity = s.fire * (60 + 25 * Math.sin(t * 13) * Math.sin(t * 7.1));
    scene.fog.color.copy(ctx.fogColor);
    scene.fog.density = 0.0001 + 0.00005 * s.heat + 0.00003 * s.boil;
  };
  return world;
}

function pointsMat(uniforms, vert, frag, blending = THREE.AdditiveBlending) {
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      ${vert}`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      varying float vA; varying vec3 vC;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 9.0);
        ${frag}
      }`,
  });
}

function makeFire(R, palms, towers) {
  // flames licking up from the palm crowns and the far headland; smoke columns over the city
  const N = 2600, NS = 1600;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 4), prmIg = new Float32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    let x, y, z, size;
    if (i < 1600) { const pl = palms[Math.floor(R() * Math.min(palms.length, 5))]; x = pl.x + 1.1 * pl.s + (R() - 0.5) * 4; y = 10.4 * pl.s + (R() - 0.3) * 2.5; z = pl.z + (R() - 0.5) * 4; size = 0.6 + R() * 0.9; prmIg[i] = 37.6 + pl.r * 4.5; }
    else { const b = R() < 0.5 ? towers[Math.floor(R() * towers.length)] : null; x = b ? b.x : 330 + (R() - 0.5) * 500; z = b ? b.z : -980 + (R() - 0.5) * 300; y = b ? b.h * R() : 10 + R() * 60; size = 12 + R() * 22; }
    p0.set([x, y, z], i * 3);
    prm.set([R(), 0.6 + R() * 0.9, R() * 6.28, size], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  geo.setAttribute('aIg', new THREE.BufferAttribute(prmIg, 1));
  const uniforms = { uTime: { value: 0 }, uFire: { value: 0 }, uSmoke: { value: 0 }, uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) } };
  const points = new THREE.Points(geo, pointsMat(uniforms, `
    uniform float uTime; uniform float uFire; uniform float uScale; attribute vec4 aPrm; attribute float aIg; varying float vA; varying vec3 vC;
    void main(){
      float on = aIg > 0.0 ? smoothstep(aIg, aIg + 0.5, uTime) * (1.0 - smoothstep(aIg + 3.5, aIg + 5.5, uTime)) : smoothstep(aPrm.x * 0.6, aPrm.x * 0.6 + 0.25, uFire);
      if (on <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float life = fract(uTime * aPrm.y + aPrm.x * 7.0);
      vec3 p = position + vec3(sin(life * 5.0 + aPrm.z) * 0.4, life * 3.0 * (aPrm.w > 5.0 ? 6.0 : 1.0), cos(life * 4.0 + aPrm.z) * 0.4);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aPrm.w * (1.0 - 0.6 * life) * uScale / -mv.z, 1.0, 90.0);
      vA = on * sin(3.14159 * life) * (aPrm.w > 5.0 ? 0.22 : 0.55);
      vC = mix(vec3(1.0, 0.62, 0.16), vec3(0.9, 0.18, 0.02), life) * 1.5;
      #include <logdepthbuf_vertex>
    }`, `gl_FragColor = vec4(vC * a * vA, 1.0);`));
  points.frustumCulled = false;
  const s0 = new Float32Array(NS * 3), sp = new Float32Array(NS * 4);
  for (let i = 0; i < NS; i++) {
    const near = i < 600;
    const pl = palms[Math.floor(R() * Math.min(palms.length, 5))];
    const b = towers[Math.floor(R() * towers.length)];
    s0.set(near ? [pl.x + 1, 10 * pl.s, pl.z] : (R() < 0.6 ? [b.x, b.h, b.z] : [330 + (R() - 0.5) * 500, 40, -980 + (R() - 0.5) * 300]), i * 3);
    sp.set([R(), 0.05 + R() * 0.06, R() * 6.28, near ? 3 + R() * 4 : 60 + R() * 80], i * 4);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(s0, 3));
  sg.setAttribute('aPrm', new THREE.BufferAttribute(sp, 4));
  const smoke = new THREE.Points(sg, pointsMat(uniforms, `
    uniform float uTime; uniform float uSmoke; uniform float uScale; attribute vec4 aPrm; varying float vA; varying vec3 vC;
    void main(){
      float on = smoothstep(aPrm.x * 0.7, aPrm.x * 0.7 + 0.3, uSmoke);
      if (on <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float life = fract(uTime * aPrm.y + aPrm.x * 5.0);
      float big = aPrm.w > 20.0 ? 1.0 : 0.0;
      vec3 p = position + vec3(life * (big * 120.0 + 6.0) + sin(life * 3.0 + aPrm.z) * 4.0, life * (big * 380.0 + 22.0), sin(life * 2.0 + aPrm.z) * 4.0);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aPrm.w * (0.4 + life) * uScale / -mv.z, 1.0, 220.0);
      vA = on * sin(3.14159 * life) * 0.25;
      vC = vec3(0.16, 0.13, 0.11);
      #include <logdepthbuf_vertex>
    }`, `gl_FragColor = vec4(vC, a * vA);`, THREE.NormalBlending));
  smoke.frustumCulled = false;
  return { points, smoke, uniforms };
}

function makeUmbrellaFire(R, umbrellas) {
  // flames running over each canopy for a few seconds after it ignites
  const PER = 40, N = umbrellas.length * PER;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  umbrellas.forEach((u, k) => {
    const y = terrainH(u.x, u.z) + 2.3;
    for (let j = 0; j < PER; j++) {
      const a = R() * 6.28, rr = Math.sqrt(R()) * 1.2;
      p0.set([u.x + Math.cos(a) * rr, y - rr * 0.35, u.z + Math.sin(a) * rr], (k * PER + j) * 3);
      prm.set([u.ignite + R() * 0.8, 0.9 + R() * 1.2, R() * 6.28, 0.35 + R() * 0.5], (k * PER + j) * 4);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const uniforms = { uTime: { value: 0 }, uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) } };
  const points = new THREE.Points(geo, pointsMat(uniforms, `
    uniform float uTime; uniform float uScale; attribute vec4 aPrm; varying float vA; varying vec3 vC;
    void main(){
      float on = smoothstep(aPrm.x, aPrm.x + 0.4, uTime) * (1.0 - smoothstep(aPrm.x + 3.0, aPrm.x + 5.0, uTime));
      if (on <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float life = fract(uTime * aPrm.y + aPrm.z);
      vec3 p = position + vec3(sin(life * 6.0 + aPrm.z) * 0.15, life * 1.6, cos(life * 5.0 + aPrm.z) * 0.15);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aPrm.w * (1.0 - 0.6 * life) * uScale / -mv.z, 1.0, 90.0);
      vA = on * sin(3.14159 * life) * 0.6;
      vC = mix(vec3(1.0, 0.62, 0.16), vec3(0.9, 0.18, 0.02), life) * 1.5;
      #include <logdepthbuf_vertex>
    }`, `gl_FragColor = vec4(vC * a * vA, 1.0);`));
  points.frustumCulled = false;
  return { points, uniforms };
}

function makeSteam(R) {
  // steam boiling off the sea: low rolling sheets near the water, thickening into a haze over the bay
  const N = 2400;
  const p0 = new Float32Array(N * 3), prm = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const d = 66 + Math.pow(R(), 1.6) * 1800, a = (R() - 0.5) * 46 * DEG;
    p0.set([Math.sin(a) * d, 0.2, -Math.cos(a) * d], i * 3);
    prm.set([R(), 0.12 + R() * 0.16, R() * 6.28, 2.5 + d * 0.012 + R() * 4], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const uniforms = { uTime: { value: 0 }, uBoil: { value: 0 }, uHeat: { value: 0 }, uScale: { value: 1920 / (2 * Math.tan(31 * DEG)) } };
  const points = new THREE.Points(geo, pointsMat(uniforms, `
    uniform float uTime; uniform float uBoil; uniform float uHeat; uniform float uScale; attribute vec4 aPrm; varying float vA; varying vec3 vC;
    void main(){
      float on = smoothstep(aPrm.x * 0.7, aPrm.x * 0.7 + 0.3, uBoil);
      if (on <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      float life = fract(uTime * aPrm.y + aPrm.x * 3.0);
      vec3 p = position + vec3(sin(life * 3.0 + aPrm.z) * aPrm.w * 0.5, life * aPrm.w * (1.5 + 2.0 * uBoil), cos(life * 2.0 + aPrm.z) * aPrm.w * 0.3);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aPrm.w * (0.7 + 1.3 * life) * uScale / -mv.z, 1.0, 200.0);
      vA = on * sin(3.14159 * life) * 0.16;
      vC = mix(vec3(0.86, 0.84, 0.82), vec3(1.0, 0.8, 0.6), uHeat * 0.6);
      #include <logdepthbuf_vertex>
    }`, `gl_FragColor = vec4(vC, a * vA);`, THREE.NormalBlending));
  points.frustumCulled = false;
  return { points, uniforms };
}
