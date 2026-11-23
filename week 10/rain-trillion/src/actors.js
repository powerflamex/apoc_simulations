// Everything that moves except you and the bus: the cars (they float off from the first frame, drift up the avenue
// in the current, jam at the cross street, then fill and sink), the people (on car roofs, climbing, wading to the
// doorways, on the bus roof with you, on the balconies, the roofs, in boats, on the tower deck and the summit), the
// rescue boats and the wreckage that ride up with you.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CARS, TAXI_I, LANES, WALK, B, BAL, BOATS, WRECK, TOWER, SUMMIT, busAt, YOU0 } from './layout.js';
import { depthAt, vAtDepth, V_BUS } from './timeline.js';
import { drownMat } from './drown.js';
import { rng, smooth, clamp, lerp } from './util.js';

const ROOF_H = [1.45, 1.46, 1.83, 2.0];
const ROOF_S = [0.3, 0.7, 0.75, 0.65];                    // roof centre along the car (local z)
const PAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x9c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0x6d1f4f, 0xf2f2f0, 0x1f2328, 0x3a6aa0, 0x2a8a8a];
const dummy = new THREE.Object3D();
const tmpV = new THREE.Vector3();

// ---- the cars ----
{
  const R = rng(808);
  // lane order (front first) for the jam
  CARS.forEach((c) => {
    c.vLift = c.wedged ? 0.2 : vAtDepth(0.5 + 0.38 * R());
    c.vSink = c.wedged ? V_BUS + 1.2 : c.vLift + 5.5 + 5 * R();
    c.spin = (R() - 0.5) * 0.9;
    c.yaw0 = (c.x < 0 ? Math.PI : 0) + (R() - 0.5) * 0.08;     // left lanes come toward you, right lanes go away
    c.col = c.taxi ? 0xf2c21a : PAL[Math.floor(R() * PAL.length)];
    c.sway = R() * 6.28;
  });
  for (const x of LANES) {
    const lane = CARS.filter((c) => !c.wedged && Math.abs(c.x - x) < 1).sort((a, b) => a.z - b.z);
    lane.forEach((c, k) => { c.rank = k; c.lane = lane; });
  }
}
const driftOf = (t) => (t <= 0 ? 0 : 3.2 * t * t / (t + 1.6));
const JAM = -74;
// where car c is at v (level = the water depth)
export function carFrame(c, v, level) {
  let x = c.x, z = c.z, y = 0, yaw = c.yaw0, pitch = 0, roll = 0;
  const lift = smooth(c.vLift, c.vLift + 0.7, v);
  const sink = smooth(c.vSink, c.vSink + 2.2, v);
  if (c.wedged) {
    const fl = Math.max(0, level - 0.8) * lift;
    y = Math.min(fl, 1.4) * (1 - sink) + 0.03 * Math.sin(v * 2.3) * lift;
    return { x, y, z, yaw: yaw + 0.04 * sink, pitch: 0.4 * sink, roll: 0.02 * Math.sin(v * 1.7), lift, sink };
  }
  if (lift > 0) {
    // drift up the avenue; the cars in front jam at the cross street, the rest pile in behind (ride up a little)
    const want = c.z - driftOf(v - c.vLift);
    const front = JAM + c.rank * 3.6;
    z = Math.max(want, front);
    const jam = smooth(0, 3, front - want);
    // the bus lane: nothing passes the bus or the taxi until the bus floats
    if (c.x > 6 && c.z > 0 && v < V_BUS + 1) z = Math.max(z, 5.0 + (c.rank - (c.lane.findIndex((o) => o.z > 0))) * 5.2);
    x += Math.sin(v * 0.3 + c.sway) * 0.6 * lift - (c.x - 1.5) * 0.25 * jam;
    yaw += c.spin * smooth(c.vLift, c.vLift + 6, v) + jam * 0.6 * Math.sin(c.sway * 3);
    const float = Math.max(0, level - 0.62);
    y = float * lift * (1 - sink) + 0.05 * Math.sin(v * 2.1 + c.sway * 9) * lift * (1 - sink) + jam * 0.5 * (c.rank % 3 === 1 ? 1 : 0) * (1 - sink);
    pitch = 0.05 * Math.sin(v * 1.7 + c.sway * 5) * lift * (1 - sink) + 0.4 * Math.sin(Math.PI * sink) + jam * 0.25 * Math.sin(c.sway * 7);
    roll = 0.06 * Math.sin(v * 1.3 + c.sway * 3) * lift * (1 - sink) + jam * 0.2 * Math.cos(c.sway * 5);
  }
  return { x, y, z, yaw, pitch, roll, lift, sink };
}
const carObj = new THREE.Object3D();
// a point on car c's roof (local x, z offsets) in world space
export function carRoof(c, v, level, ox = 0, oz = 0, out = new THREE.Vector3()) {
  const f = carFrame(c, v, level);
  carObj.position.set(f.x, f.y, f.z); carObj.rotation.set(f.pitch, f.yaw, f.roll, 'YXZ'); carObj.updateMatrixWorld(true);
  return { p: out.set(ox, ROOF_H[c.kind], ROOF_S[c.kind] + oz).applyMatrix4(carObj.matrixWorld), f };
}

// ---- the people ----
export const PEOPLE = [];
{
  const R = rng(4242);
  const col = () => [
    [0xd8261c, 0x2a5ad8, 0xf0b020, 0x2a9a3a, 0xe85a12, 0x6a2a8a, 0xf2f2f2, 0x1a1a1a, 0x3aa0c8, 0xc83a6a, 0x8a6a4a, 0x55606a][Math.floor(R() * 12)],
    [0x1f2328, 0x2f3f5f, 0x4a4a4a, 0x2a2018, 0x5a4a3a, 0x1a2a4a][Math.floor(R() * 6)],
    SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)],
  ];
  const add = (o) => { PEOPLE.push({ seed: R(), col: col(), s: 0.95 + R() * 0.12, ...o }); };
  // the screamer, left of you on frame 0: arms over her head, then she wades off to a car on the left
  add({ kind: 'scream', x: 3.1, z: -0.6, col: [0xd8261c, 0x1f2328, 0xf1c8a6, 0x6b4a2a] });
  // riders on car roofs: every car in the two middle lanes ahead of you (they're in the shot), some further off
  const inShot = (c) => !c.wedged && Math.abs(c.x) < 6 && c.z < 2 && c.z > -40;
  const riders = CARS.filter((c) => (inShot(c) && (c.x > 0 || R() < 0.7)) || (!c.wedged && c.z < 34 && c.z > -50 && R() < 0.4));
  for (const c of riders) {
    const n = R() < 0.35 ? 2 : 1;
    for (let k = 0; k < n; k++) add({ kind: 'car', car: c, ox: (k - (n - 1) / 2) * 0.55, oz: (R() - 0.5) * 0.4, kneel: R() < 0.4, yawO: (R() - 0.5) * 2.5, wave: R() });
  }
  // climbers: in the water beside a car on frame 0, up onto its roof in the first seconds
  for (const c of CARS.filter((c) => !c.wedged && c.z < 24 && c.z > -24 && !riders.includes(c)).slice(0, 6)) {
    const side = c.x < 0 ? 1 : -1;
    add({ kind: 'climb', car: c, side, t0: 0.3 + R() * 2.2, ox: 0, oz: 0, kneel: R() < 0.5, yawO: (R() - 0.5), wave: R() });
  }
  // waders on the sidewalks heading for the doorways and stoops
  for (let i = 0; i < 9; i++) {
    const side = R() < 0.5 ? -1 : 1;
    const z = 30 - R() * 70;
    add({ kind: 'wade', x0: side * (WALK - 3.5 - R() * 2), z0: z, x1: side * (WALK - 0.4), z1: z - 3 - R() * 4, side });
  }
  // two more on the bus roof with you: one kneels at the back edge and pulls you up
  add({ kind: 'bus', lx: -0.45, lz: 4.9, helper: true, col: [0x2a5ad8, 0x1f2328, 0x9a6440, 0x151515] });
  add({ kind: 'bus', lx: 0.55, lz: -3.2, col: [0x2a9a3a, 0x2a2018, 0xf1c8a6, 0xa07a48] });
  add({ kind: 'bus', lx: -0.6, lz: -2.4, col: [0xf2f2f2, 0x2f3f5f, 0xc68a62, 0x1d1612] });
  // the balconies: people at the rail on the floors the bus rises past, reaching out; they step back inside before
  // the water comes over their floor
  const bays = []; for (let z = BAL.z1 - 3.2; z > BAL.z0 + 2; z -= 5.4) bays.push(z);
  for (let f = 2; f <= 10; f++) for (let zi = 0; zi < bays.length; zi++) {
    if (R() > 0.62) continue;
    const n = R() < 0.35 ? 2 : 1;
    for (let k = 0; k < n; k++) add({ kind: 'balc', x: BAL.x0 - 1.0 + (R() - 0.5) * 0.3, y: BAL.g0 + (f - 1) * BAL.fh + 0.11, z: bays[zi] + (n === 2 ? (k - 0.5) * 1.3 : (R() - 0.5) * 2.2), f });
  }
  // roofs along the avenue: small groups at the street edge, waving
  for (const b of B) {
    if (!b.front || !b.roofPeople || b.balcony || b.z > 60 || b.z < -250) continue;
    const n = 2 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) add({ kind: 'roof', x: b.x - b.side * (b.w / 2 - 1.2 - R() * 2), y: b.h, z: b.z + (R() - 0.5) * b.d * 0.7, side: b.side, h: b.h });
  }
  // the boats
  BOATS.forEach((bt, bi) => { for (let k = 0; k < bt.n; k++) add({ kind: 'boat', boat: bi, lx: (k % 2 ? 0.45 : -0.45), lz: (k - (bt.n - 1) / 2) * 0.9 }); });
  // wreckage riders
  for (const wi of [3, 11, 19]) add({ kind: 'wreck', w: wi });
  // the tower's roof deck (the corner facing the bus) and the summit's viewing deck
  for (let k = 0; k < 7; k++) add({ kind: 'deck', x: TOWER.x - TOWER.w / 2 + 2 + R() * 9, y: TOWER.h + 0.05, z: TOWER.z + TOWER.w / 2 - 2 - R() * 9 });
  for (let k = 0; k < 9; k++) add({ kind: 'summit', x: SUMMIT.x - 6 + R() * 10, y: SUMMIT.h + 0.4, z: SUMMIT.z + 4.5 + R() * 5.5 });
}

// ---- boats and wreckage meshes ----
function raftGeo() {
  const ring = new THREE.TorusGeometry(1.0, 0.26, 10, 28).rotateX(Math.PI / 2).scale(1.0, 1.0, 2.0);
  const floor = new THREE.CylinderGeometry(1.0, 1.0, 0.08, 24).scale(1, 1, 2).translate(0, -0.15, 0);
  return mergeGeometries([ring.toNonIndexed(), floor.toNonIndexed()]);
}
function hullGeo() {
  const sh = new THREE.Shape([[-0.95, 2.6], [0.95, 2.6], [1.05, -1.0], [0.0, -3.1], [-1.05, -1.0]].map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.45, 0);
  const cons = new THREE.BoxGeometry(0.8, 0.7, 0.7).translate(0, 0.8, 0.2);
  return mergeGeometries([g.toNonIndexed(), cons.toNonIndexed()]);
}

export function makeActors(scene) {
  const P = (c, r = 0.7, extra = {}) => drownMat(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, ...extra }));
  const fleet = makeFleet(scene, CARS.length, { plainMat: (c, r, e) => P(c, r, e), glowMat: (c) => drownMat(new THREE.MeshBasicMaterial({ color: c })), shadowy: (m) => { m.frustumCulled = false; return m; } });
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const crowd = makeCrowd(scene, PEOPLE.length, P(0xffffff, 0.8), { castShadow: false });
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  // boats
  const boats = BOATS.map((bt) => {
    const m = new THREE.Mesh(bt.kind === 0 ? raftGeo() : hullGeo(), P(bt.col, bt.kind === 0 ? 0.6 : 0.4));
    m.frustumCulled = false; scene.add(m); return m;
  });
  // wreckage: planks, crates, tyres, a floating sofa
  const WG = [
    new THREE.BoxGeometry(0.35, 0.12, 3.2), new THREE.BoxGeometry(1.0, 0.8, 1.0),
    new THREE.TorusGeometry(0.36, 0.13, 8, 16).rotateX(Math.PI / 2), new THREE.BoxGeometry(2.0, 0.75, 0.9),
  ];
  const WC = [0x8a6a44, 0x9a7a52, 0x161616, 0x4a5a7a];
  const wrecks = WG.map((g, k) => { const m = new THREE.InstancedMesh(g, P(WC[k], 0.85), WRECK.length); m.frustumCulled = false; scene.add(m); return m; });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const group = [...crowd.meshes, ...boats, ...wrecks];

  // boat / wreck frames: offsets from the bus, joining from far off, riding the water
  function boatFrame(bt, v, bus, L) {
    const k = smooth(bt.v0 - 2.5, bt.v0 + 2.5, v);
    const far = lerp(5.0, 1.0, k);
    const x = bus.x + bt.dx * far + 3 * Math.sin(v * 0.21 + bt.seed * 9), z = bus.z + bt.dz * far + 3 * Math.cos(v * 0.17 + bt.seed * 7);
    return { x, z, y: L + 0.25 + 0.12 * Math.sin(v * 1.8 + bt.seed * 20), yaw: bt.seed * 6 + 0.3 * Math.sin(v * 0.4 + bt.seed * 3), pitch: 0.06 * Math.sin(v * 1.5 + bt.seed * 7), roll: 0.08 * Math.sin(v * 1.2 + bt.seed * 11), on: v > bt.v0 - 2.5 };
  }
  function wreckFrame(w, v, bus, L) {
    const up = smooth(w.v0, w.v0 + 1.2, v);
    return { x: bus.x + w.dx + 2 * Math.sin(v * 0.3 + w.seed * 8), z: bus.z + w.dz + 2 * Math.cos(v * 0.23 + w.seed * 5), y: L - 2.5 * (1 - up) + 0.1 * Math.sin(v * 2 + w.seed * 9), yaw: w.yaw + 0.2 * Math.sin(v * 0.5 + w.seed), on: v > w.v0 };
  }
  const objM = new THREE.Object3D();
  const local = (f, lx, ly, lz) => { objM.position.set(f.x, f.y, f.z); objM.rotation.set(f.pitch || 0, f.yaw, f.roll || 0, 'YXZ'); objM.updateMatrixWorld(true); return new THREE.Vector3(lx, ly, lz).applyMatrix4(objM.matrixWorld); };

  return {
    fleet, crowd, group, boatFrame,
    frame(v, s, bus, busObj, glows, camPos, showStreet) {
      const L = s.level;
      // cars
      CARS.forEach((c, i) => {
        if (!showStreet || v > c.vSink + 6) { fleet.set(i, zero, false); return; }
        const f = carFrame(c, v, L);
        dummy.position.set(f.x, f.y, f.z); dummy.rotation.set(f.pitch, f.yaw, f.roll, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
        const on = v < c.vSink + 1.2 && !c.wedged;
        fleet.set(i, dummy.matrix, on);
        if (on && camPos.distanceTo(tmpV.set(f.x, f.y, f.z)) < 200) {
          const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), ly = f.y + 0.7;
          const kk = ly > L ? 1 : Math.exp(-(L - ly) / 0.8) * 0.7;
          for (const sx of [-0.62, 0.62]) {
            const px = f.x + Math.cos(f.yaw) * sx, pz = f.z - Math.sin(f.yaw) * sx;
            glows.add(px - fx * 2.3, ly, pz - fz * 2.3, 0.7, 2.4 * kk, 2.2 * kk, 1.8 * kk);
            glows.add(px + fx * 2.3, ly, pz + fz * 2.3, 0.55, 2.0 * kk, 0.12 * kk, 0.05 * kk);
          }
        }
      });
      fleet.commit();
      // boats and wreckage
      BOATS.forEach((bt, i) => {
        const f = boatFrame(bt, v, bus, L);
        boats[i].visible = f.on;
        boats[i].position.set(f.x, f.y, f.z); boats[i].rotation.set(f.pitch, f.yaw, f.roll, 'YXZ');
      });
      WRECK.forEach((w, i) => {
        const f = wreckFrame(w, v, bus, L);
        for (let k = 0; k < 4; k++) wrecks[k].setMatrixAt(i, zero);
        if (f.on) { dummy.position.set(f.x, f.y, f.z); dummy.rotation.set(0.05 * Math.sin(v + w.seed * 9), f.yaw, 0.05 * Math.cos(v * 1.1 + w.seed * 7), 'YXZ'); dummy.scale.setScalar(w.s); dummy.updateMatrix(); wrecks[w.kind].setMatrixAt(i, dummy.matrix); }
      });
      wrecks.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
      // people
      PEOPLE.forEach((p, i) => {
        const o = this.pose(p, v, L, bus, busObj);
        if (!o || camPos.distanceTo(tmpV.set(o.x, o.y, o.z)) > 600) { crowd.pose(i, { visible: false }); return; }
        crowd.pose(i, o);
      });
      crowd.commit();
    },
    // the pose of person p at v (null: not drawn)
    pose(p, v, L, bus, busObj) {
      const ph = p.seed * 20;
      const panic = 0.5 + 0.5 * Math.sin(v * (5 + p.seed * 3) + ph);
      const waveArm = (a) => 1.35 + 0.3 * Math.sin(v * (6 + a * 3) + ph);
      switch (p.kind) {
        case 'scream': {
          // arms up screaming for the first 2.3 s, then wading off left to the car in the next lane, then on its roof
          if (v < 2.3) return { x: p.x, y: 0, z: p.z, yaw: 0.35, s: 1, armL: 1.55 + 0.1 * Math.sin(v * 9), armR: 1.6 + 0.1 * Math.sin(v * 11), look: 0.45 };
          const k = smooth(2.3, 5.5, v);
          return { x: lerp(p.x, -1.5, k), y: 0, z: lerp(p.z, -2, k), yaw: lerp(0.35, -2.4, smooth(2.3, 2.8, v)), s: 1, walk: v * 7, stride: 0.6 * (1 - smooth(5.2, 5.5, v)), armL: 0.6, armR: 0.8, visible: v < 9 };
        }
        case 'car': case 'climb': {
          const c = p.car;
          if (v > c.vSink + 0.5) return null;
          const { p: r, f } = carRoof(c, v, L, p.ox, p.oz);
          let up = 1, gx = r.x, gy = r.y, gz = r.z;
          if (p.kind === 'climb') {
            up = smooth(p.t0, p.t0 + 1.1, v);
            const sx = c.x + p.side * 1.5, sz = c.z;
            gx = lerp(sx, r.x, up); gz = lerp(sz, r.z, up); gy = lerp(0, r.y, up) + Math.sin(Math.PI * up) * 0.35;
          }
          const yaw = f.yaw + p.yawO;
          const sit = p.kneel ? 0.75 * up : 0;
          return { x: gx, y: gy, z: gz, yaw, s: p.s, sit, pitch: (1 - up) * 0.5 * Math.sin(Math.PI * up), armL: up < 1 ? 1.3 : (p.wave > 0.5 ? waveArm(1) : 0.4 + 0.3 * panic), armR: up < 1 ? 1.4 : waveArm(2), look: 0.3 };
        }
        case 'wade': {
          const k = smooth(0, 5 + p.seed * 2, v);
          const x = lerp(p.x0, p.x1, k), z = lerp(p.z0, p.z1, k);
          const y = smooth(4, 6, v) * 0.6;                     // up the stoop
          return { x, y, z, yaw: Math.atan2(p.x1 - p.x0, p.z1 - p.z0), s: p.s, walk: v * 5 + ph, stride: 0.5 * (1 - k), armL: 0.5 + 0.4 * panic, armR: 0.3, look: 0.2, visible: v < 14 };
        }
        case 'bus': {
          // with you on the roof the whole way; pressed flat by the push from 26.5 s
          const press = smooth(26.3, 28.0, v);
          let lx = p.lx, lz = p.lz, sit = 0, pitch = 0, armL = 0.4 + 0.3 * panic, armR = 0.5, yaw = Math.PI, look = 0.2;
          if (p.helper) {
            const help = smooth(4.4, 4.7, v) * (1 - smooth(5.6, 6.0, v));
            sit = Math.max(0.85 * help, 0.0); pitch = 0.55 * help; armR = lerp(armR, 0.9, help); armL = lerp(armL, 0.9, help); yaw = 0;
            lz = lerp(p.lz, 5.6, help);
            // then off to the front of the roof (out of the camera's way)
            const go = smooth(6.0, 7.6, v);
            lz = lerp(lz, -2.9, go); lx = lerp(lx, 0.75, go);
            if (go > 0 && go < 1) yaw = Math.PI;
          }
          if (v > 6.2 && v < 26) { armL = 0.3 + 0.9 * panic * smooth(8, 9, v); }
          sit = Math.max(sit, 0.9 * press);
          pitch = Math.max(pitch, 0.45 * press);
          const o = local({ x: bus.x, y: bus.roof, z: bus.z, yaw: bus.yaw, pitch: bus.pitch, roll: bus.roll }, lx, 0.07, lz);
          return { x: o.x, y: o.y, z: o.z, yaw: bus.yaw + yaw + (p.helper ? 0 : 0.4 * Math.sin(v * 0.6 + ph)), s: p.s, sit, pitch, armL, armR, look: v > 30 ? 0.6 : look };
        }
        case 'balc': {
          const footY = p.y, swallow = vAtDepth(footY - 0.2);
          if (v > swallow + 0.25) return null;
          const back = smooth(swallow - 0.35, swallow + 0.2, v);
          const reach = Math.exp(-Math.pow((bus.z - p.z) / 9, 2));
          return { x: p.x + back * 2.2, y: p.y, z: p.z, yaw: -Math.PI / 2 + 0.3 * Math.sin(v * 0.7 + ph), s: p.s, armL: lerp(waveArm(1), 1.0, reach), armR: lerp(0.5 + 0.4 * panic, 1.05, reach), look: -0.1, walk: back * 6, stride: back > 0 && back < 1 ? 0.6 : 0 };
        }
        case 'roof': {
          if (L > p.h + 1.6) return null;
          return { x: p.x, y: p.y, z: p.z, yaw: p.side > 0 ? -Math.PI / 2 : Math.PI / 2, s: p.s, armL: waveArm(1), armR: waveArm(2) * (p.seed > 0.5 ? 1 : 0.4), look: 0.4 };
        }
        case 'boat': {
          const bt = BOATS[p.boat], f = this._boat(bt, v, bus, L);
          if (!f.on) return null;
          const o = local(f, p.lx, 0.0, p.lz);
          return { x: o.x, y: o.y, z: o.z, yaw: f.yaw + (p.lx > 0 ? -1.2 : 1.2), s: p.s, sit: 0.85, armL: p.seed > 0.4 ? waveArm(1) : 0.5, armR: 0.6 + 0.3 * panic, look: 0.5 };
        }
        case 'wreck': {
          const w = WRECK[p.w];
          if (v < w.v0 + 1) return null;
          const up = smooth(w.v0 + 1, w.v0 + 2, v);
          return { x: bus.x + w.dx + 2 * Math.sin(v * 0.3 + w.seed * 8), y: L + 0.15 - 1.5 * (1 - up), z: bus.z + w.dz + 2 * Math.cos(v * 0.23 + w.seed * 5), yaw: w.yaw, s: p.s, sit: 0.9, pitch: 0.3, armL: waveArm(1), armR: 0.6, look: 0.5 };
        }
        case 'deck': case 'summit': {
          if (L > p.y + 1.7) return null;
          const yawTo = Math.atan2(bus.x - p.x, bus.z - p.z);
          return { x: p.x, y: p.y, z: p.z, yaw: yawTo + 0.4 * Math.sin(v * 0.8 + ph), s: p.s, armL: waveArm(1), armR: p.seed > 0.5 ? waveArm(2) : 0.5, look: 0.2 + (bus.roof - p.y) * 0.002 };
        }
      }
      return null;
    },
    _boat: boatFrame,
  };
}
