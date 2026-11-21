// The park's trees: a trunk in two pieces (it can snap at the joint), five to seven limbs, each carrying clumps of
// leaves, and a crown on top. frame(key, tt) poses them for one stop:
//   Jupiter: every limb sags under 2.5x its weight; the big ones snap one after another ~3 s in and crash down.
//   The Sun: everything sags hard at once, most limbs break off; then the trunks snap and the trees crash over.
// (The white dwarf and the neutron star press whatever is left flat: heat.js uSq.)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREES } from './layout.js';
import { rng, smooth, clamp } from './util.js';
import { JUP_SNAP, SUN_TREES } from './sched.js';

function blobGeo(seed) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, R = rng(seed);
  const ph = [R() * 9, R() * 9, R() * 9];
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.13 * Math.sin(x * 3.1 + ph[0]) * Math.sin(y * 2.7 + ph[1]) + 0.1 * Math.sin(z * 4.3 + ph[2] + x * 2.0) + 0.06 * Math.sin((x + y + z) * 7.0 + ph[1]);
    const k = 1 + n;
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
    const v = 0.75 + 0.25 * (y * 0.5 + 0.5) + 0.25 * n;
    col[i * 3] = 0.2 * v; col[i * 3 + 1] = 0.4 * v; col[i * 3 + 2] = 0.11 * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function makeTrees(scene, { plainMat, shadowy }) {
  const bark = plainMat(0x4a3b2c, 0.95);
  const leaf = plainMat(0xffffff, 0.85, { vertexColors: true });
  const BLOBS = [blobGeo(1), blobGeo(2), blobGeo(3), blobGeo(4)];
  const limbGeo = new THREE.CylinderGeometry(0.55, 1, 1, 7).translate(0, 0.5, 0);
  const trees = TREES.map(([x, z, Ht, cr], ti) => {
    const R = rng(500 + ti * 17);
    const root = new THREE.Group(); root.position.set(x, 0, z);
    scene.add(root);
    const r0 = 0.16 + 0.025 * Ht / 8;
    const hs = 1.4 + R() * 0.9;                    // where it snaps
    const hTop = Ht * 0.62;                        // the trunk's top (limbs spread from 0.45..0.62 of the height)
    const lower = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.9, r0 * 1.15, hs, 9).translate(0, hs / 2, 0), bark));
    root.add(lower);
    const upper = new THREE.Group(); upper.position.y = hs; root.add(upper);
    upper.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.6, r0 * 0.9, hTop - hs, 9).translate(0, (hTop - hs) / 2, 0), bark)));
    // the crown on top
    const crownY = Ht - cr * 0.85 - hs;
    for (let k = 0; k < 3; k++) {
      const b = shadowy(new THREE.Mesh(BLOBS[(ti + k) % 4], leaf));
      const a = k * 2.1 + R();
      b.position.set(Math.cos(a) * cr * 0.25, crownY + (k === 0 ? 0.2 : -0.2) * cr, Math.sin(a) * cr * 0.25);
      b.scale.setScalar(cr * (0.62 - 0.08 * k));
      upper.add(b);
    }
    // the limbs
    const nL = 5 + Math.floor(R() * 3);
    const limbs = [];
    for (let k = 0; k < nL; k++) {
      const az = (k / nL) * 6.28 + R() * 0.6;
      const elev = 0.55 + R() * 0.4;                     // radians up from horizontal
      const len = cr * (1.0 + 0.35 * R());
      const y0 = Ht * (0.42 + 0.2 * R()) - hs;
      const pivot = new THREE.Group(); pivot.position.set(0, y0, 0); pivot.rotation.set(0, az, 0, 'YXZ');
      upper.add(pivot);
      const bend = new THREE.Group(); pivot.add(bend);          // the sag: rotation about its own x (down)
      bend.rotation.x = Math.PI / 2 - elev;                    // the limb points along +y tilted out toward +z
      const lm = shadowy(new THREE.Mesh(limbGeo, bark));
      lm.scale.set(0.085 + 0.02 * cr / 3, len, 0.085 + 0.02 * cr / 3);
      bend.add(lm);
      for (let j = 0; j < 2; j++) {
        const b = shadowy(new THREE.Mesh(BLOBS[(k + j + ti) % 4], leaf));
        b.position.set((R() - 0.5) * 0.4, len * (0.7 + 0.35 * j), (R() - 0.5) * 0.4);
        b.scale.setScalar(cr * (0.36 + 0.12 * R()));
        bend.add(b);
      }
      limbs.push({ pivot, bend, elev, len, y0, az, seed: R(), big: len > cr * 1.1 });
    }
    // it falls away from the court's middle, sideways and away from the camera
    const fx = Math.sign(x || 1) * (0.8 + 0.4 * R()), fz = -0.4 - 0.5 * R(), fl = Math.hypot(fx, fz);
    return { root, upper, limbs, hs, Ht, cr, x, z, seed: R(), fx: fx / fl, fz: fz / fl };
  });
  // which limbs snap on Jupiter (the near trees' biggest first), one per JUP_SNAP time
  const jupSnaps = [];
  // (the two trees by the court drop limbs that reach in over it, into the frame; then the plaza's)
  [[0, 0], [1, 0], [0, 1], [1, 1], [3, 0]].forEach(([ti, r], k) => { const t = trees[ti]; const sgn = -Math.sign(t.x); const l = [...t.limbs].sort((a, b) => sgn * (Math.sin(b.az) - Math.sin(a.az)) + 0.5 * (Math.cos(b.az) - Math.cos(a.az)))[r]; jupSnaps.push({ ti, li: t.limbs.indexOf(l), t: JUP_SNAP[k] }); });

  // a limb falling once it breaks at time t0 (gravity gE m/s²): it drops and swings toward lying flat on the ground
  function fallLimb(L, tr, t, gE) {
    const baseY = tr.hs + L.y0;
    const drop = Math.min(0.5 * gE * t * t, Math.max(0, baseY - 0.35));
    const k = clamp(drop / Math.max(0.01, baseY - 0.35));
    L.pivot.position.y = L.y0 - drop;
    L.bend.rotation.x = Math.PI / 2 - L.elev + (L.elev + 0.05) * Math.min(1, k * 1.3) + 0.25 * k;
    L.pivot.position.x = Math.sin(L.az) * 0.7 * k; L.pivot.position.z = Math.cos(L.az) * 0.7 * k;
  }

  return {
    trees,
    // cb(x, y, z, kind): leaves and splinters bursting where a limb breaks or a tree lands (world.js turns them into particles)
    frame(key, tt, burst) {
      trees.forEach((tr, ti) => {
        tr.upper.rotation.set(0, 0, 0);
        tr.limbs.forEach((L) => { L.pivot.position.set(0, L.y0, 0); L.bend.rotation.x = Math.PI / 2 - L.elev; });
        if (key === 'jupiter') {
          // sag: a quick drop with a bounce, a little more on the long limbs
          const s = smooth(0.0, 0.25, tt) + 0.12 * Math.exp(-tt / 0.3) * Math.sin(tt * 18) * smooth(0, 0.05, tt);
          tr.limbs.forEach((L) => { L.bend.rotation.x += (0.45 + 0.3 * L.len / tr.cr) * s; });
          tr.upper.rotation.set(0.06 * s * tr.fz, 0, -0.06 * s * tr.fx);
          for (const js of jupSnaps) if (js.ti === ti && tt > js.t) {
            const L = tr.limbs[js.li];
            fallLimb(L, tr, tt - js.t, 24.8 * 0.55);
            if (tt - js.t < 0.5 && burst) burst(tr, L, tt - js.t);
          }
        } else if (key === 'sun') {
          const T = tt;
          const s = smooth(0.0, 0.15, T);
          tr.limbs.forEach((L, li) => {
            L.bend.rotation.x += (0.45 + 0.2 * L.seed) * s;
            // most limbs break off within the first second
            const tb = 0.2 + 0.9 * L.seed + 0.05 * ti;
            if (L.seed < 0.75 && T > tb) { fallLimb(L, tr, T - tb, 274 * 0.06); if (T - tb < 0.4 && burst && li % 2 === 0) burst(tr, L, T - tb); }
          });
          // then the trunk snaps and the tree crashes over
          const t0 = SUN_TREES + 0.06 * ((ti * 7) % 13);
          if (T > t0) {
            const t = T - t0;
            const th = Math.min(1.32, 0.5 * 42 * t * t);
            tr.upper.rotation.set(th * tr.fz, 0, -th * tr.fx);
            if (th >= 1.32 && t < 0.6 && burst) burst(tr, null, t);
          }
        }
      });
    },
  };
}
