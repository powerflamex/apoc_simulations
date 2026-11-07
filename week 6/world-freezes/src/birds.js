// The birds: pigeons pecking round the fountain, startled up by the wall at 0:00.6, circling over the plaza in front of you;
// gulls gliding higher up. At 0:09 they all stop flapping at once, wings locked, and drop, tumbling, onto the street.
// Each bird's flight is a pure function of time; the fall starts from where and how fast it was flying at V_BIRDS.
import * as THREE from 'three';
import { rng, smooth, clamp } from './util.js';
import { V_BIRDS } from './timeline.js';
import { FOUNT, groundY } from './layout.js';

const G = 9.81;

export function makeBirds(scene, ctx) {
  const R = rng(616);
  const B = [];
  for (let i = 0; i < 46; i++) {
    const gull = i >= 36;
    B.push({
      gull, s: gull ? 2.2 : 1.45,
      // on the ground (pigeons): where
      gx: FOUNT.x - 4 + R() * 9, gz: FOUNT.z + 3 + R() * 6,
      tUp: 0.4 + R() * 0.9,
      // the circle: centre, radius, height, angular speed, phase
      cx: 0.5 + (R() - 0.5) * 4, cz: -13 + (R() - 0.5) * 6, rad: gull ? 18 + R() * 10 : 5 + R() * 6, h: gull ? 20 + R() * 8 : 5.5 + R() * 5,
      w: (gull ? 0.22 : 0.55 + R() * 0.25) * (R() < 0.5 ? 1 : -1), a0: R() * Math.PI * 2, flap: 11 + R() * 4, ph: R() * 10,
      spin: [(R() - 0.5) * 5, (R() - 0.5) * 3, (R() - 0.5) * 5],
      col: gull ? 0xf2f2ee : [0x7a7e86, 0x8a8e96, 0x6a6c72, 0x9a9890, 0x5a5c64][Math.floor(R() * 5)],
    });
  }
  // flying: lift off from the ground and climb into the circle over ~2 s
  function fly(b, t) {
    const a = b.a0 + b.w * t;
    const cx = b.cx + Math.cos(a) * b.rad, cz = b.cz + Math.sin(a) * b.rad, cy = b.h + 0.8 * Math.sin(t * 1.3 + b.ph);
    if (b.gull) return [cx, cy, cz];
    const k = smooth(b.tUp, b.tUp + 2.2, t);
    const up = smooth(b.tUp, b.tUp + 0.6, t);
    return [b.gx + (cx - b.gx) * k, 0.15 + (cy - 0.15) * (0.25 * up + 0.75 * k), b.gz + (cz - b.gz) * k];
  }
  for (const b of B) {
    const p0 = fly(b, V_BIRDS), p1 = fly(b, V_BIRDS + 0.01);
    b.p0 = p0; b.v0 = [(p1[0] - p0[0]) / 0.01, (p1[1] - p0[1]) / 0.01, (p1[2] - p0[2]) / 0.01];
    // (where it lands: a few tries for the ground's height under it, since the street slopes)
    let gy = 0;
    for (let i = 0; i < 4; i++) { b.tHit = (b.v0[1] + Math.sqrt(b.v0[1] ** 2 + 2 * G * (p0[1] - gy - 0.12))) / G; gy = groundY(p0[2] + b.v0[2] * b.tHit); }
    b.gyHit = gy;
  }
  const bodyMat = ctx.plainMat(0xffffff, 0.8), wingMat = ctx.plainMat(0xffffff, 0.8, { side: THREE.DoubleSide });
  const body = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6).scale(0.09, 0.08, 0.17), bodyMat, B.length);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.05, -0.17), bodyMat, B.length);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.07, 0.34, 0, 0.02, 0, 0, 0.1, 0.34, 0, 0.02, 0.3, 0, 0.1, 0, 0, 0.1], 3));
  wingGeo.computeVertexNormals();
  const wl = new THREE.InstancedMesh(wingGeo, wingMat, B.length), wr = new THREE.InstancedMesh(wingGeo, wingMat, B.length);
  const col = new THREE.Color();
  B.forEach((b, i) => { for (const m of [body, head, wl, wr]) m.setColorAt(i, col.set(b.col)); });
  for (const m of [body, head, wl, wr]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), loc = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    frame(v) {
      B.forEach((b, i) => {
        let pos, yaw, pitch = 0, roll = 0, flapA;
        if (v < V_BIRDS) {
          pos = fly(b, v);
          const p2 = fly(b, v + 0.02);
          yaw = Math.atan2(-(p2[0] - pos[0]), -(p2[2] - pos[2]));
          pitch = Math.atan2(p2[1] - pos[1], Math.hypot(p2[0] - pos[0], p2[2] - pos[2])) * 0.6;
          roll = -b.w * 0.5;
          const onGround = !b.gull && v < b.tUp;
          flapA = onGround ? -0.1 : Math.sin(v * b.flap + b.ph) * (b.gull ? 0.25 : 0.75);
          if (onGround) { yaw = b.ph; pitch = 0.25 * Math.max(0, Math.sin(v * 6 + b.ph)); }
        } else {
          // locked, falling
          const t = Math.min(v - V_BIRDS, b.tHit);
          pos = [b.p0[0] + b.v0[0] * t, b.p0[1] + b.v0[1] * t - 0.5 * G * t * t, b.p0[2] + b.v0[2] * t];
          const p2 = fly(b, V_BIRDS + 0.02), p1 = b.p0;
          yaw = Math.atan2(-(p2[0] - p1[0]), -(p2[2] - p1[2])) + b.spin[1] * t;
          pitch = b.spin[0] * t; roll = b.spin[2] * t;
          if (v - V_BIRDS >= b.tHit) { pitch = 0; roll = 1.4 * Math.sign(b.spin[2]); pos[1] = b.gyHit + 0.1; }
          flapA = 0.15;
        }
        e.set(pitch, yaw, roll, 'YXZ'); q.setFromEuler(e);
        base.compose(p.set(pos[0], pos[1], pos[2]), q, sc.setScalar(b.s));
        body.setMatrixAt(i, base); head.setMatrixAt(i, base);
        loc.makeRotationZ(flapA); m4.multiplyMatrices(base, loc); wr.setMatrixAt(i, m4);
        loc.makeScale(-1, 1, 1).premultiply(new THREE.Matrix4().makeRotationZ(-flapA)); m4.multiplyMatrices(base, loc); wl.setMatrixAt(i, m4);
      });
      for (const m of [body, head, wl, wr]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
