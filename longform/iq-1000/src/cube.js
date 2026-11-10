// A Rubik's cube in your hands (first person, it moves with your eyes): scrambled, then solved in about three
// seconds, one quarter turn after another (the scramble played backwards). 27 cubies; a cubie's stickers are boxes on
// its outside faces. Pure function of the video clock.
import * as THREE from 'three';
import { rng, smooth, lerp } from './util.js';
import { SEC } from './timeline.js';

const COL = { px: 0xd9381e, nx: 0xff8a1c, py: 0xf4f4f0, ny: 0xffd51c, pz: 0x1e9e4a, nz: 0x1f5fd6 };
const S = 0.019;   // half a cubie (a 5.7 cm cube)

export function makeCube(camera) {
  const group = new THREE.Group();
  const holder = new THREE.Group();
  group.add(holder);
  const body = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.5 });
  const mats = Object.fromEntries(Object.entries(COL).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 })]));
  const cubies = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const c = new THREE.Group();
    c.add(new THREE.Mesh(new THREE.BoxGeometry(2 * S * 0.98, 2 * S * 0.98, 2 * S * 0.98), body));
    const st = (axis, sgn, key) => {
      const g = new THREE.BoxGeometry(axis === 'x' ? 0.002 : 2 * S * 0.82, axis === 'y' ? 0.002 : 2 * S * 0.82, axis === 'z' ? 0.002 : 2 * S * 0.82);
      const m = new THREE.Mesh(g, mats[key]);
      m.position[axis] = sgn * S * 1.0;
      c.add(m);
    };
    if (x === 1) st('x', 1, 'px'); if (x === -1) st('x', -1, 'nx');
    if (y === 1) st('y', 1, 'py'); if (y === -1) st('y', -1, 'ny');
    if (z === 1) st('z', 1, 'pz'); if (z === -1) st('z', -1, 'nz');
    holder.add(c);
    cubies.push({ obj: c, home: new THREE.Vector3(x, y, z) });
  }
  // the scramble: 20 quarter turns (axis, layer, direction); solving plays them back in reverse
  const r = rng(2026);
  const AX = ['x', 'y', 'z'];
  const scramble = [];
  let lastAx = -1;
  for (let i = 0; i < 20; i++) {
    let a; do a = Math.floor(r() * 3); while (a === lastAx);
    lastAx = a;
    scramble.push({ ax: AX[a], layer: Math.floor(r() * 3) - 1, dir: r() < 0.5 ? 1 : -1 });
  }
  const solve = scramble.slice().reverse().map((m) => ({ ...m, dir: -m.dir }));
  const axV = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const q = new THREE.Quaternion();
  function applyMove(state, m, angle) {
    q.setFromAxisAngle(axV[m.ax], angle * m.dir);
    for (const s of state) {
      if (Math.round(s.p[m.ax]) !== m.layer) continue;
      s.p.applyQuaternion(q);
      s.q.premultiply(q);
    }
  }
  // the hands: palms under the cube's left and right edges, thumbs on top
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a27c, roughness: 0.6 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b7fa6, roughness: 0.8 });
  for (const sgn of [-1, 1]) {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.075, 0.085), skin);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 3, 6), skin);
    thumb.rotation.z = Math.PI / 2; thumb.position.set(-sgn * 0.015, 0.045, 0.01);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.32, 10), sleeve);
    arm.position.set(sgn * 0.06, -0.15, 0.08); arm.rotation.set(0.7, 0, -sgn * 0.6);
    hand.add(palm, thumb, arm);
    hand.position.set(sgn * (S * 3 + 0.016), -0.01, 0);
    group.add(hand);
  }
  group.visible = false;
  camera.add(group);
  const T0 = SEC.cube0 + 0.6, T1 = SEC.cube1;   // the solve runs between these
  return {
    frame(v) {
      const k = smooth(SEC.cube0 - 0.2, SEC.cube0 + 0.6, v) * (1 - smooth(SEC.cube1 + 1.6, SEC.cube1 + 2.6, v));
      group.visible = k > 0.001;
      if (!group.visible) return;
      group.position.set(0.0, lerp(-0.4, -0.12, k), -0.34);
      group.rotation.set(0.55, 0.0, 0.0);
      holder.rotation.set(0.25, 0.6 + 0.15 * Math.sin(v * 1.3), 0);
      // state: scrambled, then each solving move in turn (quick turns, a hair of pause between)
      const state = cubies.map((c) => ({ c, p: c.home.clone(), q: new THREE.Quaternion() }));
      for (const m of scramble) applyMove(state, m, Math.PI / 2);
      const u = Math.max(0, Math.min(1, (v - T0) / (T1 - T0))) * solve.length;
      for (let i = 0; i < solve.length; i++) {
        const f = Math.max(0, Math.min(1, (u - i) * 1.25));
        if (f <= 0) break;
        applyMove(state, solve[i], (Math.PI / 2) * (f * f * (3 - 2 * f)));
      }
      for (const s of state) { s.c.obj.position.copy(s.p).multiplyScalar(2 * S); s.c.obj.quaternion.copy(s.q); }
    },
  };
}
