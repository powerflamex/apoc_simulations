// The first things to come (from before frame 0 to ~4 s): phones out of the hands of the people filming you, keys and
// coins torn out of pockets, forks and knives off the cafe tables. Nearest first. Each one sticks where it hits you,
// flat on your hoodie, your jeans, your arms (a point on your own figure, so they move with you), and stays there.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PEOPLE, personAt, handOf } from './people.js';
import { CAFE } from './layout.js';
import { releaseAt } from './timeline.js';
import { flight, flyPose } from './fly.js';
import { rng } from './util.js';

const ni = (g) => g.toNonIndexed();
const box = (w, h, d, x = 0, y = 0, z = 0) => ni(new THREE.BoxGeometry(w, h, d).translate(x, y, z));

export const SMALLS = [];
{
  const R = rng(1357);
  const P = {};
  for (const p of PEOPLE) {
    if (p.r > 15 || p.kind === 'plaza' || p.back) continue;   // (not the people behind the first camera: their things would fly past the lens)
    const items = [];
    if (p.film && R() < 0.4) items.push('phone'); else if (p.film) p.film = false;
    if (R() < 0.8) items.push('key');
    if (R() < 0.4) items.push('key');
    if (R() < 0.6) items.push('coin');
    if (R() < 0.4) items.push('coin');
    if (R() < 0.25) items.push('coin');
    if (!p.film && R() < 0.05) items.push('phone');
    let first = 99;
    items.forEach((kind, k) => {
      // (nearest first, but overlapping: a steady stream from before frame 0 to ~4 s)
      const tR = -2.4 + 6.0 * Math.min(1, Math.max(0, 0.5 * (p.r - 1) / 14 + 0.5 * Math.pow(R(), 1.4))) + k * 0.08;
      let p0, yaw = R() * 6.28;
      if (kind === 'phone' && p.film) { const h = handOf(p, tR); p0 = new THREE.Vector3(h.x, h.y + 0.05, h.z); yaw = h.yaw; p.phoneT = tR; }
      else {
        personAt(p, tR, P);
        const side = R() < 0.5 ? -1 : 1, c = Math.cos(P.yaw), s = Math.sin(P.yaw);
        p0 = new THREE.Vector3(P.x + side * 0.19 * c, 0.92 + 0.1 * R(), P.z - side * 0.19 * s);
      }
      first = Math.min(first, tR);
      SMALLS.push({ kind, p, film: kind === 'phone' && p.film, src: p0, tR, yaw });
    });
    p.firstT = first;
  }
  // the cafe tables' cutlery
  for (const c of CAFE) for (let k = 0; k < 4; k++) {
    const p0 = new THREE.Vector3(c.x + (R() - 0.5) * 0.4, 0.77, c.z + (R() - 0.5) * 0.4);
    SMALLS.push({ kind: k % 2 ? 'knife' : 'fork', src: p0, tR: releaseAt('small', Math.hypot(c.x, c.z), 1, 15, (R() - 0.5) * 0.4), yaw: R() * 6.28, onTable: true });
  }
}

function geos() {
  const key = mergeGeometries([box(0.05, 0.004, 0.016, 0.022, 0, 0), box(0.012, 0.004, 0.006, 0.04, 0, 0.009), ni(new THREE.TorusGeometry(0.012, 0.004, 6, 12).rotateX(Math.PI / 2).translate(-0.012, 0, 0)),
    ni(new THREE.TorusGeometry(0.016, 0.0015, 4, 14).rotateX(Math.PI / 2).translate(-0.03, 0, 0))]);
  const coin = ni(new THREE.CylinderGeometry(0.014, 0.014, 0.0025, 16));
  const phone = box(0.074, 0.009, 0.152);
  const screen = box(0.067, 0.001, 0.14, 0, -0.0048, 0);   // (screen on the underside: stuck to you, the bright case shows)
  const fork = mergeGeometries([box(0.13, 0.004, 0.014, -0.03, 0, 0), box(0.05, 0.004, 0.024, 0.06, 0, 0)]);
  const knife = mergeGeometries([box(0.1, 0.006, 0.014, -0.05, 0, 0), box(0.11, 0.002, 0.02, 0.055, 0, 0)]);
  return { key, coin, phone, screen, fork, knife };
}

export function makeSmalls(scene, you) {
  const R = rng(97531);
  // where they can stick: points on your hoodie, jeans and sleeves (not your head or hands), from the pose you're in now
  you.root.updateMatrixWorld(true);
  const cand = [];
  const parts = [];
  you.torso.children.filter((o) => o.isMesh).slice(0, 1).forEach((m) => parts.push([m, 3]));
  you.legs.forEach((L) => { parts.push([L.hip.children[0], 2]); parts.push([L.knee.children[0], 1]); });
  you.arms.forEach((A) => { parts.push([A.sh.children[0], 1.5]); parts.push([A.el.children[0], 1.2]); });
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const [m, w] of parts) {
    const pa = m.geometry.attributes.position, na = m.geometry.attributes.normal;
    nm.getNormalMatrix(m.matrixWorld);
    for (let k = 0; k < 260 * w; k++) {
      const i = Math.floor(R() * pa.count);
      v.fromBufferAttribute(pa, i); n.fromBufferAttribute(na, i);
      const wp = v.clone().applyMatrix4(m.matrixWorld), wn = n.clone().applyMatrix3(nm).normalize();
      // (not underneath, not the soles)
      if (wn.y < -0.6 || wp.y < 0.15) continue;
      cand.push({ m, lp: v.clone(), ln: n.clone(), wp, wn });
    }
  }
  const qW = new THREE.Quaternion(), qI = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  for (const s of SMALLS) {
    const dir = s.src.clone().sub(new THREE.Vector3(0, 1.0, 0)).setY(0).normalize();
    // (they hit the side facing them and whip round you: most end up on your sides and back, where the camera sees them)
    const toCam = new THREE.Vector3(0.5, 0, 1).normalize();
    let best = null, bd = -9;
    for (let k = 0; k < 24; k++) { const c = cand[Math.floor(R() * cand.length)]; const d = 0.35 * c.wn.dot(dir) + 0.8 * c.wn.dot(toCam) + 0.6 * R(); if (d > bd) { bd = d; best = c; } }
    s.slot = best;
    // lying flat on the surface: its thin axis along the normal, turned at random about it
    const mq = new THREE.Quaternion(); best.m.getWorldQuaternion(mq);
    qW.setFromUnitVectors(Y, best.wn).multiply(new THREE.Quaternion().setFromAxisAngle(Y, R() * 6.28));
    s.lq = qI.copy(mq).invert().multiply(qW).clone();
    const q0 = new THREE.Quaternion().setFromAxisAngle(Y, s.yaw);
    if (s.film) q0.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.35));   // held up, screen to you
    s.f = flight({ p0: s.src, q0, p1: best.wp.clone(), q1: qW.clone(), tR: s.tR, acc: 26, dMin: 0.22, dMax: 0.9, arc: 0.15 + 0.5 * R(), spin: 5 + 8 * R(), shake: s.onTable ? 0.3 : 0.12, size: 0.1 }, R);
  }
  const G = geos();
  // (bright, not true metal: with no reflections to show, a metalness near 1 renders them nearly black)
  const steel = new THREE.MeshStandardMaterial({ color: 0xe4e9ef, roughness: 0.22, metalness: 0.25, emissive: 0x3a3f46 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xf6c95a, roughness: 0.25, metalness: 0.25, emissive: 0x4a3410 });
  const dark = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.2, emissive: 0x2a2a2e });   // phone cases (instance colours)
  const scr = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.12, metalness: 0.3, emissive: 0x5a7898, emissiveIntensity: 0.18 });
  const TYPES = { key: [[G.key, brass]], coin: [[G.coin, steel]], phone: [[G.phone, dark], [G.screen, scr]], fork: [[G.fork, steel]], knife: [[G.knife, steel]] };
  const groups = [];
  for (const [kind, parts2] of Object.entries(TYPES)) {
    const list = SMALLS.filter((s) => s.kind === kind);
    if (!list.length) continue;
    const meshes = parts2.map(([g, m]) => { const im = new THREE.InstancedMesh(g, m, list.length); im.castShadow = true; im.frustumCulled = false; scene.add(im); return im; });
    if (kind === 'phone') { const PC = [0xb4b9c0, 0xd6b878, 0x8d939c, 0xc9ccd2, 0xd8c08e, 0x9aa0a8]; /* silver, gold, graphite: metal phones */ list.forEach((s2, i) => meshes[0].setColorAt(i, new THREE.Color(PC[i % PC.length]))); }
    groups.push({ list, meshes });
  }
  const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
  // (a touch bigger than life, so a key reads on a phone screen)
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), mq = new THREE.Quaternion(), sc = new THREE.Vector3(1.45, 1.45, 1.45), scP = new THREE.Vector3(1.0, 1.0, 1.0), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    // after you've been posed this frame (your matrices up to date)
    frame(v, glows) {
      for (const { list, meshes } of groups) {
        list.forEach((s, i) => {
          // the spot on you, where you are now
          const sl = s.slot;
          s.f.p1.copy(sl.lp).applyMatrix4(sl.m.matrixWorld);
          sl.m.getWorldQuaternion(mq); s.f.q1.copy(mq).multiply(s.lq);
          // (lifted off the cloth by a few mm so it sits on it)
          n.copy(sl.ln).applyQuaternion(mq); s.f.p1.addScaledVector(n, 0.006);
          if (v < s.tR && !s.film && !s.onTable) { for (const m of meshes) m.setMatrixAt(i, zero); return; }
          if (v < s.tR && s.film) {
            const h = handOf(s.p, v);
            pos.set(h.x, h.y + 0.05, h.z); q.setFromAxisAngle(Y, h.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.35));
            s.f.p0.copy(pos); s.f.q0.copy(q);
          } else {
            flyPose(s.f, v, pos, q);
            // a short silver streak behind it while it flies
            if (glows && v < s.f.tL && v > s.tR + 0.02) for (let j = 1; j <= 7; j++) { if (v - j * 0.016 < s.tR) break; flyPose(s.f, v - j * 0.016, tp, tq); const g = 1 - j / 8; glows.add(tp.x, tp.y, tp.z, 0.05 * g + 0.012, 1.1 * g, 1.12 * g, 1.2 * g); }
          }
          m4.compose(pos, q, s.kind === 'phone' ? scP : sc);
          for (const m of meshes) m.setMatrixAt(i, m4);
        });
        for (const m of meshes) m.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
