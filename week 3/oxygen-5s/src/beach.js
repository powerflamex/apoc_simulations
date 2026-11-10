// Copacabana up close, and a street of towers in Botafogo.
//   The beach: people on the sand (standing, strolling, sitting), striped umbrellas, the traffic on Avenida Atlântica,
//   and the wall of beachfront apartment towers behind. When the sea explodes, everything the blast's front has
//   reached is swallowed by it (hidden in the fog; it isn't shown what happens to them).
//   The towers: extra buildings for the city mesh (the beachfront row and the Botafogo street), with the points on
//   their faces where the windows puff into dust.
// Motion runs on story time t (so every replay of the moment shows the same instant).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { makeFleet } from './cars.js';
import { BEACH, beachXZ, STREET, heightAt } from './geo.js';
import { seaFront } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const BOX_YAW = Math.atan2(-BEACH.uz, BEACH.ux);  // a box's local x along the beach

// ---------- the extra buildings: the beachfront row, the Botafogo street ----------
export function extraBuildings() {
  const R = rng(1950);
  const out = [];
  for (let a = BEACH.a0; a < BEACH.a1; a += 34 + R() * 14) {
    const w = 26 + R() * 14, d = 22 + R() * 10, floors = 11 + Math.floor(R() * 8);
    const [x, z] = beachXZ(140 + d / 2, a + w / 2);
    out.push({ x, z, w, d, h: floors * 3.1 + 3, y: 3.8, yaw: BOX_YAW, seed: R(), glass: R() < 0.15 ? 1 : 0, beachfront: true, s: 140, a: a + w / 2 });
  }
  for (let x = STREET.x0; x < STREET.x1; x += 92 + R() * 18) for (const sd of [-1, 1]) {
    const w = 34 + R() * 14, d = 26 + R() * 10, floors = 24 + Math.floor(R() * 16);
    out.push({ x: x + w / 2, z: STREET.z + sd * (STREET.hw + 3 + d / 2), w, d, h: floors * 3.2 + 4, y: 5, yaw: 0, seed: R(), glass: R() < 0.5 ? 1 : 0, street: true, side: sd });
  }
  return out;
}
// points on the faces we see, where windows puff into glass dust
export function windowPoints(B) {
  const R = rng(4242), pts = [];
  for (const b of B) {
    if (b.street) {
      const zf = b.z - b.side * b.d / 2;   // the face toward the street
      for (let k = 0; k < 80; k++) pts.push({ x: b.x + (R() - 0.5) * b.w * 0.95, y: b.y + 4 + R() * (b.h - 6), z: zf - b.side * 0.6, nx: 0, nz: -b.side, seed: R() });
    } else if (b.beachfront) {
      for (let k = 0; k < 24; k++) {
        const [x, z] = beachXZ(b.s - 0.6, b.a + (R() - 0.5) * b.w * 0.9);
        pts.push({ x, y: b.y + 4 + R() * (b.h - 6), z, nx: -BEACH.nx, nz: -BEACH.nz, seed: R() });
      }
    }
  }
  return pts;
}

export function makeBeach(scene) {
  const R = rng(777);
  // ---------- people on the sand ----------
  const P = [];
  let guard = 0;
  const SH = [0xf2f2ee, 0xe2574c, 0x3b6db3, 0xf3c94b, 0x58a37a, 0xe98bb4, 0xf08a3c, 0x41c1c9, 0xffffff, 0x1d1f24];
  const SW = [0x1b3a6b, 0xe2574c, 0x111111, 0xf3c94b, 0x2a9d8f, 0xd63384, 0xffffff];
  while (P.length < 300 && guard++ < 9000) {
    // most of them in the stretch the beach shot looks at (just ahead of the camera, toward the water)
    const s = 10 + R() * 64, a = R() < 0.7 ? 175 + R() * 115 : -60 + R() * 760;   // (most in the wedge the beach shot looks along)
    if (Math.abs(a - 231) < 4 && Math.abs(s - 77) < 5) continue;   // (not in the camera)
    if (P.some((p) => Math.abs(p.s - s) < 1.0 && Math.abs(p.a - a) < 1.0)) continue;
    const kind = R();
    P.push({ s, a, seed: R(), sit: kind < 0.3, walk: kind > 0.75, yaw: (R() - 0.5) * 6.28, dir: R() < 0.5 ? 1 : -1,
      col: [SW[Math.floor(R() * SW.length)], SW[Math.floor(R() * SW.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]],
      sleeves: R() < 0.3 });
  }
  const crowd = makeCrowd(scene, P.length, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  P.forEach((p, i) => crowd.color(i, p.col[0], p.col[1], p.col[2], p.col[3], p.sleeves));

  // ---------- umbrellas ----------
  const U = [];
  for (let k = 0; k < 90; k++) U.push({ s: 18 + R() * 62, a: R() < 0.6 ? 170 + R() * 130 : -80 + R() * 820, c: [0xe63946, 0xf4a261, 0x2a9d8f, 0xffffff, 0x457b9d, 0xffd166][Math.floor(R() * 6)], tilt: (R() - 0.5) * 0.25 });
  for (let k = U.length - 1; k >= 0; k--) if (Math.abs(U[k].a - 231) < 9 && Math.abs(U[k].s - 77) < 12) U.splice(k, 1);   // (none right over the beach camera)
  const canopy = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 0.55, 12, 1, true).translate(0, 2.25, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), U.length);
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 5).translate(0, 1.15, 0), new THREE.MeshStandardMaterial({ color: 0xdddddd }), U.length);
  U.forEach((u, i) => canopy.setColorAt(i, new THREE.Color(u.c)));
  for (const m of [canopy, pole]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }

  // ---------- traffic on Avenida Atlântica ----------
  const ctx = { plainMat: (c, r = 0.9, e = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...e }), glowMat: (c) => new THREE.MeshBasicMaterial({ color: c }), shadowy: (m) => { m.frustumCulled = false; m.castShadow = true; return m; } };
  const CARS = [];
  const LANES = [111, 114.3, 117.6, 120.4, 123.7, 127];
  const COLS = [0xf4f4f2, 0x111214, 0x8c9198, 0xb3201e, 0x1d3f7a, 0xd8d2c4, 0xf2c230];
  for (let L = 0; L < 6; L++) for (let a = -300 + R() * 20; a < 1100; a += 22 + R() * 40) CARS.push({ s: LANES[L], a, dir: L < 3 ? 1 : -1,   /* drive on the right: north-east on the sea side */ kind: Math.floor(R() * 4), col: COLS[Math.floor(R() * COLS.length)], v: 11 + R() * 4 });
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    frame(v, s) {
      const t = s.t;
      const front = seaFront(t);   // how far up the beach the blast has come (m from the waterline)
      P.forEach((p, i) => {
        const gone = front > p.s - 2;
        const da = p.walk ? p.dir * 1.3 * t : 0;
        const [x, z] = beachXZ(p.s, p.a + da);
        // at the moment: a flinch (the pressure), arms up
        const flinch = smooth(0.003, 0.03, t);
        crowd.pose(i, { x, y: heightAt(x, z), z, yaw: p.walk ? Math.atan2(p.dir * BEACH.ux, p.dir * BEACH.uz) : p.yaw,   /* (people face +z at yaw 0) */ s: 1,
          walk: p.walk ? t * 6 + p.seed * 6 : 0, stride: p.walk ? 0.8 : 0, sit: p.sit ? 1 : 0,
          armL: flinch * 1.4, armR: flinch * 1.5, look: 0.2, visible: !gone });
      });
      crowd.commit();
      U.forEach((u, i) => {
        const [x, z] = beachXZ(u.s, u.a);
        if (front > u.s - 1) { canopy.setMatrixAt(i, HIDE); pole.setMatrixAt(i, HIDE); return; }
        e.set(u.tilt, 0, u.tilt * 0.5); q.setFromEuler(e);
        m4.compose(pos.set(x, heightAt(x, z), z), q, sc.set(1, 1, 1));
        canopy.setMatrixAt(i, m4); pole.setMatrixAt(i, m4);
      });
      canopy.instanceMatrix.needsUpdate = true; pole.instanceMatrix.needsUpdate = true;
      CARS.forEach((c, i) => {
        // driving; once the engines die they only coast
        const tt = t > 0 ? 13 * t - 0.3 * t * t : c.v * t;
        const a = c.a + c.dir * Math.max(tt, -2000);
        const aw = ((a - BEACH.a0) % (BEACH.a1 - BEACH.a0) + (BEACH.a1 - BEACH.a0)) % (BEACH.a1 - BEACH.a0) + BEACH.a0;
        if (front > c.s - 2) { fleet.set(i, HIDE, false); return; }
        const [x, z] = beachXZ(c.s, aw);
        e.set(0, Math.atan2(-c.dir * BEACH.ux, -c.dir * BEACH.uz), 0); q.setFromEuler(e);   // (cars face -z at yaw 0)
        m4.compose(pos.set(x, heightAt(x, z), z), q, sc.set(1, 1, 1));
        fleet.set(i, m4, true);
      });
      fleet.commit();
    },
  };
}
