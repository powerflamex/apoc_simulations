// Street furniture: royal palms (on the median and the sidewalks) and street lamps. The blasts knock them flat,
// away from the crater; after the landings from space the near palms burn (fronds flaring, then black).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALMS, LAMPS } from './layout.js';
import { smooth, clamp } from './util.js';

const m4 = new THREE.Matrix4(), mR = new THREE.Matrix4(), mT = new THREE.Matrix4(), mS = new THREE.Matrix4();
const ax = new THREE.Vector3();
const col = new THREE.Color();

// a royal palm's crown: a dozen long fronds, each a tapering strip that arcs out and droops, plus a few young
// ones pointing up
function frondGeo() {
  const pos = [], idx = [];
  const frond = (yaw, rise, len, w0) => {
    const base = pos.length / 3;
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const ang = rise - t * t * 1.6;                 // starts rising, then droops
      const along = len * t;
      const r = along * Math.cos(rise * 0.5) * (1 - 0.15 * t);
      const y = len * (Math.sin(rise) * t - 0.55 * t * t * t);
      const w = w0 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)) * (1 - 0.6 * t);
      const cx = Math.sin(yaw) * r, cz = Math.cos(yaw) * r;
      const px = Math.cos(yaw) * w, pz = -Math.sin(yaw) * w;
      const fold = w * 0.35;                          // the leaflets hang a little: a shallow V
      pos.push(cx - px, y - fold, cz - pz, cx, y, cz, cx + px, y - fold, cz + pz);
      if (i > 0) { const a = base + (i - 1) * 3, b = base + i * 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); }
      void ang;
    }
  };
  for (let k = 0; k < 13; k++) frond((k / 13) * Math.PI * 2 + (k % 2) * 0.25, 0.35 + (k % 3) * 0.18, 3.6 + (k % 4) * 0.35, 0.5);
  for (let k = 0; k < 4; k++) frond((k / 4) * Math.PI * 2 + 0.4, 1.2, 2.2, 0.3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function makeProps(scene) {
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x8e8478, roughness: 0.9 });
  const frondM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.26, 1, 7).translate(0, 0.5, 0), trunkM, PALMS.length);
  const fronds = new THREE.InstancedMesh(frondGeo(), frondM, PALMS.length);
  for (const m of [trunks, fronds]) { m.frustumCulled = false; scene.add(m); }
  PALMS.forEach((p, i) => fronds.setColorAt(i, col.setRGB(0.2, 0.32, 0.13)));

  const poleM = new THREE.MeshStandardMaterial({ color: 0x5a5e63, roughness: 0.6, metalness: 0.4 });
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.13, 9, 6).translate(0, 4.5, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.1, 0.1, 2.8).translate(0, 8.9, -1.4).toNonIndexed(),
    new THREE.BoxGeometry(0.35, 0.14, 0.7).translate(0, 8.82, -2.8).toNonIndexed(),
  ]);
  const lamps = new THREE.InstancedMesh(lampGeo, poleM, LAMPS.length);
  lamps.frustumCulled = false;
  scene.add(lamps);

  // tipped over away from the middle: rotate about the foot, toward +outward
  const tip = (x, z, ang, out) => {
    const d = Math.hypot(x, z) || 1;
    ax.set(z / d, 0, -x / d);   // horizontal, at right angles to the way out
    return mR.makeRotationAxis(ax, -ang * out);
  };

  return {
    frame(v, s, glows, smoke) {
      PALMS.forEach((p, i) => {
        const k = smooth(p.vDown, p.vDown + 0.7, v);
        const ang = (Math.PI / 2 - 0.08) * k * k;
        const base = mT.makeTranslation(p.x, 0, p.z).multiply(tip(p.x, p.z, ang, 1));
        m4.copy(base).multiply(mS.makeScale(1, p.h, 1));
        trunks.setMatrixAt(i, m4);
        m4.copy(base).multiply(mS.makeTranslation(0, p.h, 0)).multiply(mR.makeRotationY(p.seed * 6.28));
        fronds.setMatrixAt(i, m4);
        // burning palms: the fronds flare and go black
        const burn = v > p.vBurn && s.bounce && s.bounce.hot > 0.2 ? smooth(p.vBurn, p.vBurn + 0.5, v) : 0;
        if (burn > 0) {
          const fl = 0.7 + 0.3 * Math.sin(v * 15 + p.seed * 40);
          const g = burn * (1 - smooth(p.vBurn + 4, p.vBurn + 9, v));
          fronds.setColorAt(i, col.setRGB(0.2, 0.32, 0.13).lerp(col.clone().setRGB(0.02, 0.018, 0.015), burn));
          if (g > 0.02) {
            const hx = p.x + (p.x / (p.d || 1)) * p.h * Math.sin(ang), hy = p.h * Math.cos(ang);
            glows.add(hx, hy, p.z + (p.z / (p.d || 1)) * p.h * Math.sin(ang), 4, 3 * g * fl, 1.1 * g * fl, 0.25 * g * fl);
          }
        }
      });
      trunks.instanceMatrix.needsUpdate = true; fronds.instanceMatrix.needsUpdate = true;
      if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
      LAMPS.forEach((l, i) => {
        const k = smooth(l.vDown, l.vDown + 0.5, v);
        const ang = (Math.PI / 2 - 0.05) * k * k;
        // the arm reaches over the road
        const yaw = l.ew ? (l.side > 0 ? 0 : Math.PI) : (l.side > 0 ? Math.PI / 2 : -Math.PI / 2);
        m4.makeTranslation(l.x, 0, l.z).multiply(tip(l.x, l.z, ang, 1)).multiply(mR.makeRotationY(yaw));
        lamps.setMatrixAt(i, m4);
        const on = v < l.vOff && k < 0.05;
        if (on) {
          const hx = l.ew ? l.x : l.x - l.side * 2.8, hz = l.ew ? l.z - l.side * 2.8 : l.z;
          glows.add(hx, 8.7, hz, 1.6, 2.6, 1.7, 0.9);
          glows.add(hx, 8.6, hz, 5.5, 0.35, 0.22, 0.1);
        }
        // a lamp shorting out as it dies: a flicker and sparks
        if (v > l.vOff && v < l.vOff + 0.4 && l.d < 300) {
          const f = Math.sin((v - l.vOff) * 90) > 0.3 ? 1 : 0;
          glows.add(l.ew ? l.x : l.x - l.side * 2.8, 8.7, l.ew ? l.z - l.side * 2.8 : l.z, 2.5, 4 * f, 3 * f, 2 * f);
        }
      });
      lamps.instanceMatrix.needsUpdate = true;
    },
  };
}
