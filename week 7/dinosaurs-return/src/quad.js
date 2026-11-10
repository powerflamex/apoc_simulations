// A four-legged dinosaur, built from a spec: body + tail + neck as one bending tube, a head, four legs with knees forward
// and elbows back, and the extras that make each one read at a glance (the Triceratops' frill and three horns, the
// Brachiosaurus' arched head). Used for the Triceratops herd and the Brachiosaurus.
//   const q = makeQuad(scene, SPEC); each frame q.pose({ x, z, yaw, h, lean, roll, neckPitch, neckYaw, headPitch, tail, feet[4] })
//   feet: [left hind, right hind, left front, right front], each { x, y, z, yaw, lift }
import * as THREE from 'three';
import { makeLoft, resample, Frame, chain, ik2, makeSpikes, skinMaterial } from './loft.js';
import { smooth, lerp } from './util.js';

const V3 = () => new THREE.Vector3();
const UPW = new THREE.Vector3(0, 1, 0);
const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- Triceratops horridus: about 8.5 m long, 3 m at the hips; a 2 m skull with a frill and three horns ----
export const TRIKE = {
  FWD: [[1.3, 0.05], [1.2, -0.04], [0.8, -0.14], [0.5, -0.16], [0.35, -0.08]],
  FWD_R: [[0.92, 0.68, 0.86], [1.05, 0.74, 1.0], [0.98, 0.66, 0.95], [0.78, 0.56, 0.74], [0.55, 0.45, 0.5], [0.48, 0.44, 0.44]],
  TAIL: [[0.9, -0.12], [0.9, -0.2], [0.85, -0.24], [0.75, -0.2]],
  TAIL_R: [[0.92, 0.68, 0.86], [0.56, 0.5, 0.56], [0.32, 0.32, 0.35], [0.17, 0.18, 0.2], [0.04, 0.05, 0.05]],
  SKULL: [[-0.1, 0.02, 0.42, 0.46, 0.36], [0.3, 0.0, 0.4, 0.44, 0.42], [0.72, -0.1, 0.31, 0.36, 0.4], [1.08, -0.24, 0.23, 0.3, 0.33], [1.36, -0.4, 0.16, 0.23, 0.24], [1.55, -0.56, 0.09, 0.13, 0.13], [1.62, -0.68, 0.03, 0.04, 0.04]],
  headTilt: -0.42, H: 2.32,
  hind: { L1: 0.98, L2: 0.86, L3: 0.36, at: [0.0, -0.32, 0.62], ang: 1.35 },
  fore: { L1: 0.76, L2: 0.7, L3: 0.22, at: [3.15, -0.5, 0.66], ang: 1.45 },
  colors: { back: 0x4a4434, flank: 0x7a6e52, belly: 0xb8aa88, stripe: 0x2e2a20, foot: 0x3a3428 },
  bands: 9, kind: 'trike',
};
// ---- Brachiosaurus: about 22 m long, head about 12-13 m up, shoulders higher than the hips ----
export const BRACH = {
  FWD: [[1.8, 0.35], [1.8, 0.45], [1.2, 0.6], [1.3, 1.3], [1.2, 1.3], [1.1, 1.25], [1.0, 1.15], [0.9, 1.0], [0.75, 0.75]],
  FWD_R: [[1.2, 1.0, 1.3], [1.4, 1.15, 1.55], [1.35, 1.1, 1.5], [1.0, 0.85, 1.0], [0.72, 0.62, 0.7], [0.58, 0.5, 0.55], [0.48, 0.42, 0.45], [0.4, 0.36, 0.38], [0.34, 0.3, 0.32], [0.29, 0.27, 0.28]],
  TAIL: [[1.6, -0.25], [1.6, -0.45], [1.5, -0.55], [1.4, -0.55], [1.2, -0.45], [1.0, -0.35]],
  TAIL_R: [[1.2, 1.0, 1.3], [0.85, 0.75, 0.85], [0.58, 0.52, 0.58], [0.38, 0.35, 0.38], [0.22, 0.22, 0.24], [0.11, 0.11, 0.12], [0.03, 0.03, 0.03]],
  SKULL: [[-0.12, 0.0, 0.24, 0.24, 0.22], [0.12, 0.08, 0.26, 0.42, 0.22], [0.36, 0.06, 0.23, 0.4, 0.2], [0.6, -0.06, 0.2, 0.2, 0.18], [0.82, -0.12, 0.17, 0.14, 0.14], [0.92, -0.14, 0.08, 0.07, 0.07]],
  headTilt: -0.9, H: 4.8,
  hind: { L1: 2.0, L2: 1.75, L3: 0.45, at: [0.0, -0.45, 0.85], ang: 1.45 },
  fore: { L1: 2.35, L2: 2.05, L3: 0.45, at: [4.4, -0.2, 0.95], ang: 1.5 },
  colors: { back: 0x5a5a52, flank: 0x8a8578, belly: 0xc2bba8, stripe: 0x45453e, foot: 0x4a463e },
  bands: 0, kind: 'brach',
};

// the frill: a scalloped shield (epoccipital bumps round its edge), drawn from a canvas with a bold pattern
function frillGeometry() {
  const sh = new THREE.Shape();
  const N = 64;
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * Math.PI * 2;
    const bump = 1 + 0.07 * Math.max(0, Math.cos(a * 11)) ** 2 * (Math.sin(a) > -0.3 ? 1 : 0);
    const x = Math.cos(a) * 0.98 * bump, y = Math.sin(a) * 0.86 * bump;
    if (k === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -0.04);
  // uv from the shape (x, y in -1..1)
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) * 0.5, 0.5 + p.getY(i) * 0.5);
  return g;
}
let FRILL_TEX = null;
function frillTexture() {
  if (FRILL_TEX) return FRILL_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(128, 110, 10, 128, 128, 130);
  gr.addColorStop(0, '#6e5a3a'); gr.addColorStop(0.55, '#a8582a'); gr.addColorStop(0.8, '#c8743a'); gr.addColorStop(0.93, '#e6d2a6'); gr.addColorStop(1, '#3a2a1c');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // dark eye-spots in a ring, a pale rim
  for (let k = 0; k < 9; k++) { const a = Math.PI * (0.1 + 0.8 * k / 8); g.fillStyle = 'rgba(40,24,14,0.85)'; g.beginPath(); g.ellipse(128 + Math.cos(a) * 82, 128 + Math.sin(a) * 74, 11, 8, a, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  FRILL_TEX = t; return t;
}

export function makeQuad(scene, S, { seed = 0, tint = 1 } = {}) {
  const C = S.colors;
  const BACK = hex(C.back).map((x) => x * tint), FLANK = hex(C.flank).map((x) => x * tint), BELLY = hex(C.belly), STRIPE = hex(C.stripe), FOOT = hex(C.foot);
  const skin = (u, a, bands = 0) => {
    const up = Math.sin(a);
    let c = mixc(FLANK, BACK, smooth(0.05, 0.85, up));
    c = mixc(c, BELLY, smooth(-0.2, -0.8, up));
    if (bands) c = mixc(c, STRIPE, Math.pow(0.5 + 0.5 * Math.sin(u * bands * Math.PI * 2 + seed), 6) * smooth(-0.2, 0.4, up) * 0.6);
    return c;
  };
  const mat = skinMaterial({ rough: 0.75, bump: 1.4 });
  const nK = S.FWD.length + S.TAIL.length;
  const body = makeLoft(1 + nK * 4, 18, { mat, uvLen: 30, uvRound: 6, color: (u, a) => skin(u, a, u < 0.65 ? S.bands : 0) });
  const skull = makeLoft(1 + (S.SKULL.length - 1) * 4, 16, { mat, uvLen: 6, uvRound: 3, color: (u, a) => {
    let c = skin(u, a);
    if (S.kind === 'trike' && u > 0.78) c = mixc(c, hex(0x2a2620), smooth(0.78, 0.9, u));        // the beak
    return c;
  } });
  const legs = [0, 1, 2, 3].map(() => makeLoft(1 + 5 * 3, 12, { mat, uvLen: 6, uvRound: 2, color: (u) => mixc(FLANK, FOOT, smooth(0.35, 0.85, u)) }));
  const pads = [0, 1, 2, 3].map(() => makeLoft(3, 12, { mat, uvLen: 1, uvRound: 1, color: () => FOOT }));
  for (const L of [body, skull, ...legs, ...pads]) scene.add(L.mesh);
  const claws = makeSpikes(scene, 24, S.kind === 'trike' ? 0x2a2620 : 0x3a362e, 0.5);
  const horns = S.kind === 'trike' ? makeSpikes(scene, 3, 0xd8ccae, 0.4) : null;
  let frill = null;
  if (S.kind === 'trike') {
    frill = new THREE.Mesh(frillGeometry(), new THREE.MeshStandardMaterial({ map: frillTexture(), roughness: 0.7, side: THREE.DoubleSide }));
    frill.castShadow = true; scene.add(frill);
  }
  const eyes = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(S.kind === 'trike' ? 0.06 : 0.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 0.15 })); scene.add(m); return m; });
  const all = [body, skull, ...legs, ...pads].map((l) => l.mesh).concat([claws.mesh], horns ? [horns.mesh] : [], frill ? [frill] : [], eyes);

  const root = new Frame(), tmp = V3();
  const st = (f, r) => ({ p: f.o.clone(), up: f.dir(0, 1, 0), w: r[0], t: r[1], b: r[2] });
  return {
    meshes: all,
    visible(on) { for (const m of all) m.visible = on; },
    pose(P) {
      root.o.set(P.x, P.h, P.z);
      root.q.setFromAxisAngle(UPW, P.yaw - Math.PI / 2);
      root.turn(0, -(P.lean || 0), P.roll || 0);
      const nN = S.FWD.length;
      const fb = S.FWD.map((_, i) => (i >= nN - 3 ? [(P.neckYaw || 0) / 3, (P.neckPitch || 0) / 3] : [0, 0]));
      const fr = chain(root, S.FWD, fb);
      const tr = new Frame().copy(root).turn(Math.PI, 0);
      const tl = chain(tr, S.TAIL, S.TAIL.map((_, i) => [(P.tail?.[0] || 0) * (0.4 + 0.3 * i), (P.tail?.[1] || 0) * 0.4]));
      const keys = [];
      for (let i = tl.length - 1; i >= 1; i--) keys.push(st(tl[i], S.TAIL_R[i]));
      for (let i = 0; i < fr.length; i++) keys.push(st(fr[i], S.FWD_R[i]));
      body.update(resample(keys, 4));
      const H = new Frame().copy(fr[fr.length - 1]).turn(P.headYaw || 0, S.headTilt + (P.headPitch || 0));
      skull.update(resample(S.SKULL.map(([x, y, w, t, b]) => ({ p: H.at(x, y, 0), up: H.dir(0, 1, 0), w, t, b, sq: 0.8 })), 4));
      for (const [i, sd] of [[0, -1], [1, 1]]) eyes[i].position.copy(S.kind === 'trike' ? H.at(0.5, 0.2, sd * 0.31) : H.at(0.32, 0.12, sd * 0.2));
      if (frill) {
        // the shield rises from the back of the skull, tilted back
        frill.position.copy(H.at(-0.05, 0.62, 0));
        frill.quaternion.copy(H.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)));
        horns.begin();
        for (const sd of [-1, 1]) horns.add(H.at(0.42, 0.34, sd * 0.2), H.dir(0.95, 0.55, sd * 0.1), 1.0, 0.085);
        horns.add(H.at(1.25, -0.12, 0), H.dir(0.35, 1, 0), 0.32, 0.07);
        horns.end();
      }
      // legs
      claws.begin();
      const fwd = root.dir(1, 0, 0);
      for (let i = 0; i < 4; i++) {
        const front = i >= 2, sd = i % 2 ? 1 : -1, Lg = front ? S.fore : S.hind, F = P.feet[i];
        const Hp = root.at(Lg.at[0], Lg.at[1], sd * Lg.at[2], V3());
        const B = V3().set(F.x, (F.y || 0) + 0.1 + 0.42 * (F.lift || 0) * (S.kind === 'brach' ? 0.8 : 1), F.z);
        const fd = V3().set(Math.sin(F.yaw), 0, Math.cos(F.yaw));
        const ang = Lg.ang + 0.15 * (F.lift || 0);
        const A = V3().copy(B).addScaledVector(fd, -Math.cos(ang) * Lg.L3).add(tmp.set(0, Math.sin(ang) * Lg.L3, 0));
        const hint = V3().copy(fwd).multiplyScalar(front ? -1 : 1).addScaledVector(UPW, -0.1);
        const K = ik2(Hp, A, Lg.L1, Lg.L2, hint, V3());
        const lp = (a, b, t) => V3().lerpVectors(a, b, t);
        const big = S.kind === 'brach' ? 1.7 : 1;
        const r0 = (front ? 0.3 : 0.42) * big, r1 = (front ? 0.2 : 0.24) * big, r2 = (front ? 0.16 : 0.17) * big;
        const kk = [
          { p: lp(Hp, K, -0.2), w: r0, t: r0 * 1.05, b: r0 * 1.15 }, { p: lp(Hp, K, 0.35), w: r0 * 0.95, t: r0, b: r0 * 1.1 }, { p: K.clone(), w: r1, t: r1, b: r1 },
          { p: lp(K, A, 0.5), w: r2, t: r2 * 1.05, b: r2 * 1.1 }, { p: A.clone(), w: r2 * 0.95, t: r2, b: r2 }, { p: B.clone(), w: r2 * 1.05, t: r2, b: r2 },
        ];
        for (const k of kk) k.up = fwd;
        legs[i].update(resample(kk, 3));
        // a round, padded foot with short blunt claws at the front
        const fy = B.y - 0.1;
        pads[i].update([{ p: V3().set(B.x, fy + 0.22, B.z), up: fd, w: r2 * 1.1, t: r2 * 1.1, b: r2 * 1.1 }, { p: V3().set(B.x, fy + 0.08, B.z), up: fd, w: r2 * 1.45, t: r2 * 1.5, b: r2 * 1.35 }, { p: V3().set(B.x, fy - 0.0, B.z), up: fd, w: r2 * 1.35, t: r2 * 1.4, b: r2 * 1.25 }]);
        for (let t = -1; t <= 1; t++) {
          const a = t * 0.45, d = V3().set(Math.sin(F.yaw + a), 0, Math.cos(F.yaw + a));
          claws.add(V3().set(B.x, fy + 0.06, B.z).addScaledVector(d, r2 * 1.3), d.clone().add(tmp.set(0, -0.3, 0)), 0.16 * big, 0.06 * big);
        }
      }
      claws.end();
    },
  };
}
export { lerp };
