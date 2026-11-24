// The cars and the bus. From 10,000x (10 s) the parked and stopped cars within ~35 m slide sideways across the road,
// hop the curb and skid over the promenade into the pile round you (nearest first); the bus tips onto its side toward
// you at 13.5 s and drags in; from ~18 s the cars further up the street lift off and fly in. Scuffs on the ground follow
// every slide (ground.js uSlide).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CARS, BUS } from './layout.js';
import { releaseAt } from './timeline.js';
import { makeFleet } from './cars.js';
import { flight, flyPose, pileSlot, randQuat } from './fly.js';
import { GU, NSLIDE } from './ground.js';
import { stretchy } from './field.js';
import { rng } from './util.js';

const PAINT = [0xa8a8a4, 0x1a1c20, 0x8a1c1c, 0x2a3e66, 0x3a6a9a, 0x5a5e66, 0xb07a2a, 0x2c5a3c, 0x9aa0a8, 0x7a2e46, 0xc8a030];
{
  const R = rng(4040);
  for (const c of CARS) {
    if (c.z > 2) { c.stay = true; continue; }
    const d = Math.hypot(c.x, c.z);
    const near = d < 36;
    c.paint = PAINT[Math.floor(R() * PAINT.length)];
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
    if (near) {
      const p1 = pileSlot(c.x, c.z, { rMin: 3.4, rMax: 8.5, yMin: 0.0, yMax: 1.0, lane: 40 }, R);
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 1.0, R() * 6.28, (R() - 0.5) * 1.6));
      c.f = flight({ p0: new THREE.Vector3(c.x, 0, c.z), q0, p1, q1, tR: releaseAt('car', d, 13, 36, 0.25 * R()), acc: 9, dMin: 1.2, dMax: 3.0, mode: 'slide', spin: (R() - 0.5) * 3, shake: 0.7, size: 2, s1: 0.82 }, R);
    } else if (d < 140) {
      const p1 = pileSlot(c.x, c.z, { rMin: 8, rMax: 17, yMin: 0.3, yMax: 3, lane: 34 }, R);
      c.f = flight({ p0: new THREE.Vector3(c.x, 0, c.z), q0, p1, q1: randQuat(R), tR: 18.2 + 6.5 * Math.pow((d - 36) / 104, 0.85) + 0.3 * R(), acc: 30, dMin: 1.0, dMax: 3.0, arc: 4 + 6 * R(), spin: 2 + 3 * R(), shake: 0.6, size: 2 }, R);
    } else c.stay = true;
  }
}
export const BUSF = (() => {
  const R = rng(77);
  const q0 = new THREE.Quaternion();
  // (off to your right, on its side, lying along the line to you, so it never stands across the middle of the picture)
  const az = 118 * Math.PI / 180, p1 = new THREE.Vector3(Math.sin(az) * 11, 1.3, Math.cos(az) * 11);
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), az).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + 0.12));
  return flight({ p0: new THREE.Vector3(BUS.x, 0, BUS.z), q0, p1, q1, tR: releaseAt('bus', 0, 0, 1), acc: 4.2, dMin: 2.4, dMax: 3.6, mode: 'tip', halfW: BUS.w / 2, shake: 1.2, size: 4 }, R);
})();
// the slides that scuff the ground (nearest cars and the bus)
{
  const sl = [{ f: BUSF, w: 2.6 }, ...CARS.filter((c) => c.f && c.f.mode === 'slide').map((c) => ({ f: c.f, w: 1.8 }))].slice(0, NSLIDE);
  sl.forEach(({ f, w }, i) => {
    GU.uSlide.value[i].set(f.p0.x, f.p0.z, f.p1.x * 1.0, f.p1.z * 1.0);
    GU.uSlideT.value[i].set(f.tR, f.tR + f.D * 0.8, w, 0);
  });
}

function busGeometry() {
  const L = BUS.len, W = BUS.w, H = BUS.h;
  const body = mergeGeometries([
    new THREE.BoxGeometry(W, 1.05, L).translate(0, 0.35 + 0.52, 0),
    new THREE.BoxGeometry(W, 0.35, L - 0.1).translate(0, H - 0.18, 0),
    ...[-1, 1].map((s) => new THREE.BoxGeometry(0.12, H - 1.4 - 0.35, 0.18).translate(s * (W / 2 - 0.06), 1.4 + (H - 1.75) / 2, 0)),
  ].map((g) => g.toNonIndexed()));
  const glass = new THREE.BoxGeometry(W - 0.06, H - 1.4 - 0.35, L - 0.25).translate(0, 1.4 + (H - 1.75) / 2, 0);
  const wheels = mergeGeometries([-1, 1].flatMap((sx) => [-L / 2 + 2.4, L / 2 - 2.0].map((z) => new THREE.CylinderGeometry(0.5, 0.5, 0.32, 16).rotateZ(Math.PI / 2).translate(sx * (W / 2 - 0.12), 0.5, z).toNonIndexed())));
  const stripe = new THREE.BoxGeometry(W + 0.02, 0.22, L + 0.02).translate(0, 1.12, 0);
  return { body, glass, wheels, stripe };
}

export function makeTraffic(scene, ctx) {
  const all = CARS.filter((c) => !c.hide);
  const fleet = makeFleet(scene, all.length, { plainMat: (c, r, e) => stretchy(ctx.plainMat(c, r, e), 'car' + r), glowMat: ctx.glowMat, shadowy: ctx.shadowy });
  const R = rng(9);
  all.forEach((c, i) => fleet.color(i, c.paint ?? PAINT[Math.floor(R() * PAINT.length)], c.kind));
  // the bus
  const G = busGeometry();
  const bus = new THREE.Group();
  for (const [g, m] of [[G.body, ctx.plainMat(0xd8402a, 0.5, { metalness: 0.2 })], [G.glass, ctx.plainMat(0x1a2430, 0.15, { metalness: 0.5 })], [G.wheels, ctx.plainMat(0x151515, 0.9)], [G.stripe, ctx.plainMat(0xf2e6c8, 0.5)]]) {
    const mesh = new THREE.Mesh(g, stretchy(m, 'bus' + g.uuid.slice(0, 4)));
    mesh.castShadow = true; mesh.receiveShadow = true; bus.add(mesh);
  }
  scene.add(bus);
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return {
    frame(v) {
      all.forEach((c, i) => {
        if (!c.f) { m4.compose(pos.set(c.x, 0, c.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw), sc.set(1, 1, 1)); fleet.set(i, m4, true); return; }
        const s = flyPose(c.f, v, pos, q);
        // (crumpled in the pile: squashed a little)
        fleet.set(i, m4.compose(pos, q, sc.set(1, s, 1)), v < c.f.tR + 0.5);
      });
      fleet.commit();
      flyPose(BUSF, v, pos, q);
      bus.position.copy(pos); bus.quaternion.copy(q);
    },
  };
}
