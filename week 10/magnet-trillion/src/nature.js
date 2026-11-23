// The things that are NOT steel: the plane trees down both edges of the promenade and the fountain. From 100,000x
// (17 s) you push water away (water is weakly repelled by any magnet: diamagnetism; so are leaves and wood, being mostly
// water): the fountain's jets bend away from you and its pool heaps up on the far side, then (26 s on) the water is
// flung out of the basin; the trees lean away from you, leaves streaming.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREES, FOUNTAIN } from './layout.js';
import { pushR } from './timeline.js';
import { stretchy } from './field.js';
import { rng, smooth } from './util.js';

const ni = (g) => g.toNonIndexed();
// how hard water / leaves are pushed at distance r (0..1)
export const pushAt = (v, r) => smooth(16.9, 18.2, v) * Math.min(1, Math.max(0, 1.6 - r / (pushR(v) * 1.6 + 4)));

function crownGeo() {
  const R = rng(44);
  const blobs = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, r = k === 0 ? 0 : 1.1 + 0.5 * R();
    const g = new THREE.IcosahedronGeometry(1.1 + 0.5 * R(), 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.18 * Math.sin(x * 5.1 + z * 3.7) * Math.sin(y * 4.3 + k); p.setXYZ(i, x * n, y * n * 0.8, z * n); }
    g.translate(Math.cos(a) * r, (k === 0 ? 0.4 : 0) + (R() - 0.5) * 0.8, Math.sin(a) * r);
    blobs.push(ni(g));
  }
  const m = mergeGeometries(blobs); m.computeVertexNormals();
  return m;
}

export function makeNature(scene, ctx) {
  // ---- trees ----
  const trunkG = mergeGeometries([ni(new THREE.CylinderGeometry(0.16, 0.24, 1, 8).translate(0, 0.5, 0))]);
  const crownG = crownGeo();
  const trunkM = stretchy(ctx.plainMat(0x8a7d66, 0.9), 'trunk');
  const leafM = stretchy(ctx.plainMat(0x4f7a32, 0.85), 'leaf');
  leafM.onBeforeCompile = ((prev) => (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 q = floor(vViewPosition * 3.0); float h = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); diffuseColor.rgb *= 0.75 + 0.5 * h; }`);
  })(leafM.onBeforeCompile);
  const trunks = new THREE.InstancedMesh(trunkG, trunkM, TREES.length), crowns = new THREE.InstancedMesh(crownG, leafM, TREES.length);
  for (const m of [trunks, crowns]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }

  // ---- the fountain: a round stone basin, a pool, a central jet and a ring of eight ----
  const F = FOUNTAIN;
  const stone = stretchy(ctx.plainMat(0xd8d0c0, 0.8), 'fstone');
  const basin = new THREE.Mesh(mergeGeometries([ni(new THREE.TorusGeometry(F.r, 0.22, 8, 48).rotateX(Math.PI / 2).translate(0, 0.45, 0)), ni(new THREE.CylinderGeometry(F.r + 0.15, F.r + 0.25, 0.45, 48, 1, true).translate(0, 0.225, 0)),
    ni(new THREE.CylinderGeometry(0.35, 0.5, 1.1, 16).translate(0, 0.55, 0)), ni(new THREE.CylinderGeometry(0.9, 0.7, 0.18, 24).translate(0, 1.15, 0))]), stone);
  basin.position.set(F.x, 0, F.z); basin.castShadow = true; basin.receiveShadow = true; scene.add(basin);
  const waterM = stretchy(new THREE.MeshStandardMaterial({ color: 0x9ec8d8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x1a3440, emissiveIntensity: 0.4 }), 'fwater');
  const pool = new THREE.Mesh(new THREE.CircleGeometry(F.r - 0.05, 48, 0).rotateX(-Math.PI / 2), waterM);
  pool.position.set(F.x, 0.36, F.z); scene.add(pool);
  const JETS = [{ x: 0, z: 0, y: 1.25, vy: 7.2, vh: 0 }];
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; JETS.push({ x: Math.cos(a) * 1.45, z: Math.sin(a) * 1.45, y: 0.4, vy: 4.6, vh: 0.55, a: a + Math.PI }); }
  const PER = 60, NDROP = JETS.length * PER;
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), waterM, NDROP);
  drops.frustumCulled = false; scene.add(drops);
  // away from you at the fountain
  const away = new THREE.Vector2(F.x, F.z).normalize();
  const rF = Math.hypot(F.x, F.z);

  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    frame(v) {
      // trees: leaning away from you (more the nearer), the crown thrashing
      TREES.forEach((t, i) => {
        const r = Math.hypot(t.x, t.z), k = pushAt(v, r);
        const ax = t.x / r, az = t.z / r;
        // (from 1,000,000x the near ones are knocked flat, away from you)
        const fall = smooth(26 + r * 0.06 + t.seed * 0.6, 27.2 + r * 0.06 + t.seed * 0.6, v) * (r < 75 ? 1 : 0);
        const lean = 0.42 * k + 0.05 * k * Math.sin(v * 7 + t.seed * 9) * (1 - fall) + 1.05 * fall * fall;
        // rotate about the base, the top going away from you: axis = up x away
        q.setFromAxisAngle(new THREE.Vector3(az, 0, -ax), lean);
        trunks.setMatrixAt(i, m4.compose(pos.set(t.x, 0, t.z), q, sc.set(1, t.h * 0.72, 1)));
        const top = new THREE.Vector3(0, t.h * 0.72, 0).applyQuaternion(q);
        e.set(0.1 * k * Math.sin(v * 9 + t.seed * 5), t.seed * 6, 0.1 * k * Math.cos(v * 8 + t.seed * 3));
        const q2 = new THREE.Quaternion().setFromEuler(e).premultiply(q);
        crowns.setMatrixAt(i, m4.compose(pos.set(t.x + top.x, top.y + t.r * 0.35, t.z + top.z), q2, sc.set(t.r * 0.5, t.r * 0.42, t.r * 0.5)));
      });
      trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
      // the fountain
      const k = pushAt(v, rF);
      const fling = smooth(25.5, 28, v);
      const ah = 14 * k + 40 * fling;                      // sideways push on the water, m/s²
      JETS.forEach((J, j) => {
        for (let n = 0; n < PER; n++) {
          const i = j * PER + n;
          const T = 2 * J.vy / 9.8;
          const age = ((v - n * T / PER) % T + T) % T;
          if (fling > 0.98) { drops.setMatrixAt(i, zero); continue; }
          const hx = J.vh * (J.a !== undefined ? Math.cos(J.a) : 0), hz = J.vh * (J.a !== undefined ? Math.sin(J.a) : 0);
          const y = J.y + J.vy * age - 4.9 * age * age;
          const px = F.x + J.x + hx * age + 0.5 * ah * away.x * age * age, pz = F.z + J.z + hz * age + 0.5 * ah * away.y * age * age;
          if (y < 0.36 && age > 0.2) { drops.setMatrixAt(i, zero); continue; }
          const s = (J.x === 0 ? 0.09 : 0.06) * (1 - 0.4 * (1 - age / T)) * (1 - fling);
          drops.setMatrixAt(i, m4.compose(pos.set(px, y, pz), q.identity(), sc.set(s, s * 1.6, s)));
        }
      });
      drops.instanceMatrix.needsUpdate = true;
      // the pool: heaped away from you, then flung out
      const tilt = 0.18 * k * (1 - fling);
      pool.rotation.set(-away.y * tilt * 0, 0, 0);
      pool.quaternion.setFromAxisAngle(new THREE.Vector3(away.y, 0, -away.x), -tilt);
      pool.position.y = 0.36 - 0.3 * fling;
      pool.visible = fling < 0.95;
    },
  };
}
