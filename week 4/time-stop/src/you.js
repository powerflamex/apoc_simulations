// You: a dark hoodie with the hood up, a black duffel bag. You move on the VIDEO clock (time doesn't stop for you).
// Where you are and what you're doing in each shot, the cash bags you lift out of the truck, the stones and bricks
// flying into your bag (as glints), and your snap when you stop time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, smooth, lerp } from './util.js';
import { makeCrowd, SKIN } from './crowd.js';
import { TRUCK_BAGS, FREEZES } from './timeline.js';
import { YOU0, TRUCK, BAGS } from './street.js';
import * as jewel from './jewel.js';
import * as bank from './bank.js';

export const HOOD = 0x2b2e35;
const YAW0 = Math.atan2(-(TRUCK.x - YOU0.x), -(TRUCK.z1 - 0.6 - YOU0.z));
export const DUFFEL0 = { x: YOU0.x - 0.42, z: YOU0.z + 0.2 };
// your walk in the street (hunt, past, finale): north between the walkers' lanes at x = 0.55 and -1.3
export const WALK_X = -0.35;
export function streetYou(v) {
  if (v < 3.4) return { x: YOU0.x, z: YOU0.z, yaw: YAW0, walk: 0, stride: 0 };
  if (v < 6.2) {
    // walking off into the crowd, north-west, the bag in your hand
    const t = v - 3.4, d = 1.35 * Math.max(0, t - 0.25);
    const dir = new THREE.Vector2(-0.55, -0.83).normalize();
    return { x: YOU0.x + dir.x * d, z: YOU0.z + dir.y * d, yaw: Math.atan2(-dir.x, -dir.y), walk: d * 2.6, stride: smooth(0.1, 0.5, t) };
  }
  if (v < 28.6) {
    const d = 1.3 * (v - 21.4);
    return { x: WALK_X, z: 1.2 - d, yaw: 0, walk: d * 2.6, stride: 1 };
  }
  // the finale: standing among the crowd, looking up at the screens
  return { x: WALK_X, z: -3.2, yaw: 0.08, walk: 0, stride: 0, look: 0.45 };
}

export function makeYou(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const fig = makeCrowd(scene, 1, mat, { castShadow: false });
  fig.color(0, HOOD, 0x15161a, SKIN[1], HOOD);
  // the hood's peak over the face, a little bigger than the head
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.08, 1.12), new THREE.MeshStandardMaterial({ color: HOOD, roughness: 0.8 }));
  scene.add(hood);
  const duffel = new THREE.Mesh(mergeGeometries([
    new THREE.CylinderGeometry(0.17, 0.17, 0.62, 14).rotateZ(Math.PI / 2).toNonIndexed(),
    new THREE.TorusGeometry(0.12, 0.012, 4, 12, Math.PI).translate(0, 0.17, 0).toNonIndexed(),
  ]), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.55 }));
  scene.add(duffel);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const hand = new THREE.Vector3();

  // place: 'street' | 'jewel' | 'bank' | 'gold'; returns your hand position (for the glints)
  function frame(v, s, bagsMesh, glows) {
    const place = s.place, k = s.shot.k;
    let p = { x: 0, z: 0, yaw: 0, walk: 0, stride: 0 }, armL = 0, armR = 0, pitch = 0, vis = true, look = 0, carry = true;
    if (place === 'street') {
      p = streetYou(v);
      look = p.look || 0;
      if (v < 3.4) {
        // lifting the bags out of the truck: reach in, swing each down into the open bag at your feet
        let reach = 0, bend = 0;
        for (const tk of TRUCK_BAGS) {
          const t = v - tk;
          reach = Math.max(reach, smooth(-0.32, -0.08, t) * (1 - smooth(0.02, 0.22, t)));
          bend = Math.max(bend, smooth(0.0, 0.15, t) * (1 - smooth(0.25, 0.42, t)));
        }
        armR = 0.25 + 1.0 * reach; armL = 0.15 + 0.7 * reach;
        pitch = 0.08 + 0.35 * bend;
        carry = false;
      } else {
        armL = 0.0; armR = 0;
      }
      // the snap: right hand up, just before each freeze you're in
      for (const f of [5.6, 25.0, 52.0]) armR = Math.max(armR, 1.25 * smooth(f - 0.35, f - 0.1, v) * (1 - smooth(f + 0.25, f + 0.6, v)));
      vis = !(k === 'jewel' || k === 'bank');
    } else if (place === 'jewel') {
      p = jewel.youAt(v);
      vis = k === 'jewel' && v < 9.55;
      armR = 0.7 + 0.35 * Math.sin(v * 9); armL = 0.5 + 0.35 * Math.sin(v * 9 + 2);
      pitch = 0.22;
      p.walk = v * 7; p.stride = 0.6;
    } else if (place === 'bank') {
      p = bank.youAt(v);
      vis = k === 'bank' && v < 19.55;
      armR = 0.9 + 0.4 * Math.sin(v * 10); armL = 0.8 + 0.4 * Math.sin(v * 10 + 2.5);
      pitch = 0.12;
      p.walk = v * 7; p.stride = 0.6;
    } else vis = false;
    fig.pose(0, { x: p.x, y: 0, z: p.z, yaw: p.yaw, walk: p.walk, stride: p.stride, armL: carry ? 0.05 : armL, armR, pitch, look, visible: vis });
    fig.commit();
    hood.visible = duffel.visible = vis;
    if (vis) {
      e.set(pitch, p.yaw, 0, 'YXZ'); q.setFromEuler(e);
      v3.set(0, 1.62, -0.01).applyQuaternion(q).add(s3.set(p.x, 0, p.z));
      hood.position.copy(v3); hood.quaternion.copy(q); hood.rotateX(-0.25 - look * 0.5);
      // the right hand (for the glints): shoulder + the arm swung forward by armR
      const a = armR * 1.45;
      hand.set(0.215, 1.4 - 0.62 * Math.cos(a), -0.62 * Math.sin(a)).applyQuaternion(q).add(s3.set(p.x, 0, p.z));
      if (carry) {
        // in your left hand, hanging by your side (swinging a little as you walk)
        const sw = Math.sin(p.walk || 0) * 0.12 * (p.stride || 0);
        v3.set(-0.33, 0.62, sw).applyQuaternion(q).add(s3.set(p.x, 0, p.z));
        duffel.position.copy(v3); duffel.quaternion.copy(q); duffel.rotateY(Math.PI / 2);
      } else {
        // open on the ground at your left foot
        duffel.position.set(DUFFEL0.x, 0.17, DUFFEL0.z); duffel.rotation.set(0, YAW0 + Math.PI / 2, 0);
      }
    }
    // the cash bags: on the truck's shelves until you take each; then a swing from the shelf, past your hand, into
    // the duffel at your feet (gone inside it)
    if (bagsMesh && place === 'street') {
      BAGS.forEach((b, i) => {
        let x = b.x, y = b.y, z = b.z, sc = 1, rx = 0;
        if (b.take != null) {
          const t = (v - (b.take - 0.12)) / 0.42;
          if (t >= 1) sc = 0;
          else if (t > 0) {
            const u = smooth(0, 1, t);
            const mx = lerp(b.x, DUFFEL0.x, 0.5) - 0.1, my = Math.max(b.y, 1.2) + 0.45, mz = lerp(b.z, DUFFEL0.z, 0.5) + 0.2;
            x = (1 - u) * (1 - u) * b.x + 2 * u * (1 - u) * mx + u * u * DUFFEL0.x;
            y = (1 - u) * (1 - u) * b.y + 2 * u * (1 - u) * my + u * u * 0.25;
            z = (1 - u) * (1 - u) * b.z + 2 * u * (1 - u) * mz + u * u * DUFFEL0.z;
            sc = 1 - 0.45 * smooth(0.75, 1, t);
            rx = u * 2.5;
          }
        }
        m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(rx, b.rot, 0, 'YXZ')), s3.setScalar(sc));
        bagsMesh.setMatrixAt(i, m4);
      });
      bagsMesh.instanceMatrix.needsUpdate = true;
    }
    // stones flying into your hand in the store (a short streak of glints from each piece as it goes)
    if (place === 'jewel' && vis) {
      for (const it of jewel.ITEMS) {
        const t = (v - it.take) / 0.22;
        if (t < 0 || t > 1) continue;
        const u = smooth(0, 1, t);
        for (let j = 0; j < 3; j++) {
          const uu = Math.max(0, u - j * 0.08);
          glows.add(lerp(it.x, hand.x, uu), lerp(it.y + 0.05, hand.y, uu) + Math.sin(uu * Math.PI) * 0.15, lerp(it.z, hand.z, uu), 0.03 - j * 0.007, 2.5, 2.6, 3.0);
        }
      }
    }
    return { hand, pos: new THREE.Vector3(p.x, 0, p.z), vis };
  }
  return { frame, fig, hood, duffel };
}
