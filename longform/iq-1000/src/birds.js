// Pigeons on the plaza, as a pure function of world time w: pecking and hopping, then (W.pigeons) the whole flock
// bursts up and away over the street toward the avenue, wings beating ~6 times a second (one beat takes ~3 s at
// 16x, ~3 minutes at 1,000x: frozen mid-flap).
import * as THREE from 'three';
import { rng, smooth, clamp } from './util.js';
import { W } from './timeline.js';

export const FLOCK = { x: -8.6, z: -3.7 };

export function makeBirds(scene, n = 26) {
  const r = rng(808);
  const birds = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.4;
    birds.push({
      x: FLOCK.x + Math.cos(a) * d * 1.8, z: Math.max(-4.45, FLOCK.z + Math.sin(a) * d * 0.5), yaw: r() * 6.28, peck: r() * 10, hz: 5.6 + r() * 1.4,
      go: W.pigeons + r() * 0.35, dir: -0.25 + r() * 0.9, climb: 2.2 + r() * 1.6, sp: 4.5 + r() * 2.5, ph: r() * 6.28, col: r(),
    });
  }
  // a pigeon: body (ellipsoid), head, tail, two wings (instanced separately so they can flap)
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.8 });
  const body = new THREE.SphereGeometry(0.11, 10, 8).scale(0.85, 0.8, 1.45);
  const head = new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.08, -0.15);
  const tail = new THREE.BoxGeometry(0.1, 0.02, 0.14).translate(0, 0.0, 0.2);
  const wing = new THREE.BoxGeometry(0.3, 0.012, 0.15).translate(0.16, 0, 0);
  const mk = (g, mat = grey) => { const m = new THREE.InstancedMesh(g, mat, n); m.castShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const mb = mk(body), mh = mk(head), mt = mk(tail), mwL = mk(wing), mwR = mk(wing);
  const col = new THREE.Color();
  birds.forEach((b, i) => { col.setHSL(0.62, 0.08, 0.5 + 0.22 * b.col); for (const m of [mb, mh, mt, mwL, mwR]) m.setColorAt(i, col); });
  const M = new THREE.Matrix4(), L = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const pos = [];
  return {
    birds,
    pos,
    frame(w) {
      birds.forEach((b, i) => {
        let x = b.x, y = 0.12, z = b.z, yaw = b.yaw, pitch = 0, flap = 0, spread = 0;
        const dt = w - b.go;
        if (dt < 0) {
          // pecking: head bobs, a little hop now and then
          const hop = Math.max(0, Math.sin(w * 1.7 + b.peck)) ** 8;
          y += 0.05 * hop; yaw += 0.4 * Math.sin(w * 0.3 + b.peck);
          pitch = -0.35 * Math.max(0, Math.sin(w * 4.0 + b.peck)) ** 4;
        } else {
          // take off: away over the street (north-west), climbing; speed builds over the first second
          const h = b.dir;
          const dirx = Math.sin(h) * -1, dirz = -Math.cos(h);
          const sp = b.sp * (dt < 1 ? dt * dt / 2 : dt - 0.5);
          x += dirx * sp; z += dirz * sp; y += b.climb * (dt < 1 ? dt * dt / 2 : dt - 0.5) + 0.3 * smooth(0, 0.3, dt);
          yaw = Math.atan2(-dirx, -dirz);
          pitch = 0.6 * Math.exp(-dt * 1.5) + 0.15;
          flap = Math.sin(dt * b.hz * Math.PI * 2 + b.ph);
          spread = smooth(0, 0.1, dt);
        }
        pos[i] = { x, y, z };
        e.set(pitch, yaw, 0, 'YXZ'); q.setFromEuler(e); v.set(x, y, z);
        M.compose(v, q, one);
        mb.setMatrixAt(i, M); mh.setMatrixAt(i, M); mt.setMatrixAt(i, M);
        // wings: folded along the body on the ground, beating in the air
        const fold = 1 - spread;
        for (const [m, sgn] of [[mwL, -1], [mwR, 1]]) {
          const ang = fold * 0.15 + spread * (0.15 + 0.9 * flap);
          e.set(0, -sgn * fold * 1.35, sgn * ang, 'XYZ');
          L.makeRotationFromEuler(e);
          L.scale(new THREE.Vector3(sgn, 1, 1)).setPosition(sgn * 0.06, 0.04, -0.02);
          m.setMatrixAt(i, M.clone().multiply(L));
        }
      });
      for (const m of [mb, mh, mt, mwL, mwR]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
