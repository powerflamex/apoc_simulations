// Everything else that comes back, in the order you see it:
//   0:15 a Quetzalcoatlus (wings 11 m across) sweeps in low over your head from behind and flies on up the avenue;
//   0:17 the Triceratops herd bursts out of the side street (herd.js has their paths);
//   0:21 a Mosasaurus (15 m) comes out of the harbour in an arc and comes down on a moored boat;
//   0:24 a Brachiosaurus walks across the far end of the avenue, its head above the roofs.
// Plus the boats on the harbour, bobbing.
import * as THREE from 'three';
import { makeQuad, TRIKE, BRACH } from './quad.js';
import { makeLoft, resample, Frame, makeGait, makeSpikes, skinMaterial } from './loft.js';
import { HERD, HERD_SP, herdAt } from './herd.js';
import { BOATS, TARGET_BOAT, SEA_Y, CAM0 } from './layout.js';
import { GU } from './ground.js';
import { V_QUETZ, V_SEA, V_BRACH } from './timeline.js';
import { smooth, clamp, lerp, rng } from './util.js';

const V3 = () => new THREE.Vector3();
const UPW = new THREE.Vector3(0, 1, 0);
const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- the pterosaur's flight: in from behind you, low over your head (9 m up, a little to the left) at 0:15.5,
// on up the avenue, banking right over the harbour ----------
const QZ = new THREE.CatmullRomCurve3([[-14, 17, 70], [-9, 12.5, 34], [-5, 9.2, 10], [-2, 10, -14], [3, 13, -38], [20, 19, -62], [55, 26, -80]].map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
QZ.arcLengthDivisions = 600;
const QL = QZ.getLength(), QSP = 15.5;
let sOver = 0; { let bd = 1e9; for (let s = 0; s < QL; s += 0.1) { const p = QZ.getPointAt(s / QL); const d = Math.abs(p.z - CAM0.z); if (d < bd) { bd = d; sOver = s; } } }
const QT0 = V_QUETZ + 0.5 - sOver / QSP;
export const quetzAt = (v) => QZ.getPointAt(clamp(QSP * (v - QT0) / QL, 0, 1));

// ---------- a quadruped walking a path: gait, planted feet (never sliding) ----------
function quadWalker(q, { pointAt, speed, C, vFull, beta, offs, foreAhead, lat, latF }) {
  const gait = makeGait({ speedAt: () => speed, C, vFull, minStep: 0.5 });
  const plant = (i) => (vm) => {
    const front = i >= 2, sd = i % 2 ? 1 : -1;
    const p = pointAt(vm, front ? foreAhead : 0);
    const r = { x: -Math.cos(p.yaw), z: Math.sin(p.yaw) };
    const L = front ? latF : lat;
    return { x: p.x + r.x * sd * L, z: p.z + r.z * sd * L, yaw: p.yaw, y: 0 };
  };
  const P = { feet: [{}, {}, {}, {}], tail: [0, 0] };
  return (v, extra = {}) => {
    const p = pointAt(v, 0), pf = pointAt(v, foreAhead);
    const g = gait.gAt(v);
    for (let i = 0; i < 4; i++) { const f = gait.foot(v, offs[i], beta, plant(i)); Object.assign(P.feet[i], f.p, { lift: f.lift }); }
    P.x = p.x; P.z = p.z;
    P.yaw = Math.atan2(pf.x - p.x, pf.z - p.z);
    const bob = Math.cos(4 * Math.PI * g);
    P.h = extra.h + extra.bob * bob;
    P.lean = (extra.lean || 0) + 0.02 * Math.sin(4 * Math.PI * g + 1);
    P.roll = 0.03 * Math.sin(2 * Math.PI * g);
    P.tail[0] = 0.08 * Math.sin(2 * Math.PI * g + 0.5); P.tail[1] = 0.03 * bob;
    P.neckPitch = (extra.neckPitch || 0) + (extra.nod || 0) * Math.sin(4 * Math.PI * g - 0.6);
    P.neckYaw = extra.neckYaw || 0; P.headPitch = extra.headPitch || 0; P.headYaw = 0;
    q.pose(P);
    return P;
  };
}

// ---------- Quetzalcoatlus: a small body, a long neck, a 2.5 m head (beak and crest), 11 m of wings ----------
function makeQuetz(scene) {
  const mat = skinMaterial({ rough: 0.7, bump: 0.6 });
  const BODY = hex(0xe8e2d6), BACK = hex(0x9a8e7e), CREST = hex(0xc8442a), BEAK = hex(0xd8c8a0);
  const col = (u, a) => mixc(BODY, BACK, smooth(0.2, 0.9, Math.sin(a)));
  const body = makeLoft(15, 14, { mat, uvLen: 4, uvRound: 2, color: col });
  const head = makeLoft(16, 12, { mat, uvLen: 4, uvRound: 2, color: (u, a) => (u > 0.35 ? mixc(BEAK, hex(0x6a5a40), smooth(0.85, 1, u)) : col(u, a)) });
  const crest = makeLoft(5, 8, { mat, uvLen: 1, uvRound: 1, color: () => CREST });
  const legs = [0, 1].map(() => makeLoft(7, 8, { mat, uvLen: 2, uvRound: 1, color: () => BACK }));
  const arms = [0, 1].map(() => makeLoft(9, 8, { mat, uvLen: 3, uvRound: 1, color: () => BACK }));
  // the wing membranes: a strip from the arm and the long fourth finger back to the legs
  const NU = 14;
  const wingGeo = [0, 1].map(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(NU * 3 * 3), colr = new Float32Array(NU * 3 * 3), idx = [];
    for (let i = 0; i < NU - 1; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    for (let i = 0; i < NU; i++) for (let j = 0; j < 3; j++) {
      const c = new THREE.Color().setRGB(...mixc(hex(0x4a3628), hex(0xb89a7a), j === 0 ? 0 : j === 1 ? 0.75 : 0.45), THREE.SRGBColorSpace);
      colr.set([c.r, c.g, c.b], (i * 3 + j) * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3)); g.setIndex(idx);
    return g;
  });
  const wmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const wings = wingGeo.map((g) => { const m = new THREE.Mesh(g, wmat); m.castShadow = true; m.frustumCulled = false; scene.add(m); return m; });
  for (const L of [body, head, crest, ...legs, ...arms]) scene.add(L.mesh);
  const all = [body, head, crest, ...legs, ...arms].map((l) => l.mesh).concat(wings);
  const root = new Frame();
  return {
    visible(on) { for (const m of all) m.visible = on; },
    // flap: the shoulders' beat (-1 down .. 1 up); fold: how far the wings are drawn in
    pose(pos, yaw, pitch, bank, flap, fold = 0) {
      root.o.copy(pos);
      root.q.setFromAxisAngle(UPW, yaw - Math.PI / 2);
      root.turn(0, pitch, bank);
      const b = [[-0.55, 0, 0.14, 0.12, 0.12], [-0.2, 0, 0.3, 0.28, 0.3], [0.25, 0.02, 0.36, 0.3, 0.34], [0.6, 0.06, 0.28, 0.24, 0.26], [0.95, 0.15, 0.17, 0.16, 0.16], [1.6, 0.32, 0.13, 0.13, 0.13], [2.3, 0.42, 0.12, 0.12, 0.12], [2.95, 0.44, 0.13, 0.15, 0.13]];
      body.update(resample(b.map(([x, y, w, t, bb]) => ({ p: root.at(x, y, 0), up: root.dir(0, 1, 0), w, t, b: bb })), 2));
      const H = new Frame().copy(root); H.o.copy(root.at(2.95, 0.44, 0)); H.turn(0, -0.12);
      const hk = [[-0.15, 0.0, 0.14, 0.2, 0.16], [0.2, 0.0, 0.16, 0.2, 0.16], [0.6, -0.04, 0.12, 0.14, 0.12], [1.2, -0.1, 0.08, 0.09, 0.08], [1.8, -0.17, 0.05, 0.055, 0.05], [2.45, -0.24, 0.01, 0.01, 0.01]];
      head.update(resample(hk.map(([x, y, w, t, bb]) => ({ p: H.at(x, y, 0), up: H.dir(0, 1, 0), w, t, b: bb })), 3));
      crest.update([[-0.3, 0.12, 0.02, 0.06, 0.06], [-0.05, 0.42, 0.03, 0.18, 0.12], [0.2, 0.58, 0.03, 0.14, 0.1], [0.4, 0.5, 0.02, 0.08, 0.06], [0.55, 0.3, 0.01, 0.02, 0.02]].map(([x, y, w, t, bb]) => ({ p: H.at(x, y, 0), up: H.dir(-1, 0, 0), w, t, b: bb })));
      // wings
      const span = [];
      for (const sd of [-1, 1]) {
        const up = flap * 0.45, f = fold;
        const S0 = root.at(0.5, 0.15, sd * 0.3);
        const dirOut = (a, back = 0, low = 0) => root.dir(back, Math.sin(a) - low, sd * Math.cos(a)).normalize();
        const E = V3().copy(S0).addScaledVector(dirOut(up * 0.6, -0.25 - 0.4 * f), 0.75);
        const Wr = V3().copy(E).addScaledVector(dirOut(up * 0.8, 0.35 + 0.6 * f), 1.2);
        const K = V3().copy(Wr).addScaledVector(dirOut(up, -0.15 - 0.5 * f), 1.6);
        const T = V3().copy(K).addScaledVector(dirOut(up * 1.2 - 0.12 * Math.abs(flap), -0.35 - 0.6 * f), 2.4 * (1 - 0.4 * f));
        arms[sd < 0 ? 0 : 1].update(resample([S0, E, Wr, K, T].map((p, k) => ({ p, up: root.dir(1, 0, 0), w: [0.1, 0.08, 0.07, 0.05, 0.02][k], t: [0.09, 0.07, 0.06, 0.04, 0.02][k], b: [0.09, 0.07, 0.06, 0.04, 0.02][k] })), 2));
        // leading edge through those points; trailing edge back toward the hip
        const lead = [];
        const ptsL = [S0, E, Wr, K, T];
        for (let i = 0; i < NU; i++) {
          const u = i / (NU - 1) * 4, k = Math.min(Math.floor(u), 3), t = u - k;
          lead.push(V3().lerpVectors(ptsL[k], ptsL[k + 1], t));
        }
        const hip = root.at(-0.45, -0.05, sd * 0.3);
        const g = wingGeo[sd < 0 ? 0 : 1], pos = g.attributes.position.array;
        for (let i = 0; i < NU; i++) {
          const u = i / (NU - 1);
          const chord = lerp(1.9, 0.0, Math.pow(u, 1.15)) + 0.35 * Math.sin(Math.PI * u);
          const back = root.dir(-1, -0.05, 0);
          const tr = V3().copy(lead[i]).addScaledVector(back, chord);
          if (i === 0) tr.copy(hip);
          const mid = V3().lerpVectors(lead[i], tr, 0.5).addScaledVector(root.dir(0, 1, 0), 0.08 * Math.sin(Math.PI * u) * (1 - 0.6 * f));
          for (const [j, p] of [[0, lead[i]], [1, mid], [2, tr]]) pos.set([p.x, p.y, p.z], (i * 3 + j) * 3);
        }
        g.attributes.position.needsUpdate = true; g.computeVertexNormals();
        span.push(T);
        // legs trailing back under the membrane
        const L0 = root.at(-0.45, -0.1, sd * 0.22);
        legs[sd < 0 ? 0 : 1].update(resample([L0, root.at(-1.1, -0.35, sd * 0.32), root.at(-1.8, -0.42, sd * 0.36), root.at(-2.05, -0.4, sd * 0.36)].map((p, k) => ({ p, up: root.dir(0, 1, 0), w: [0.09, 0.06, 0.04, 0.02][k], t: [0.09, 0.06, 0.04, 0.02][k], b: [0.09, 0.06, 0.04, 0.02][k] })), 2));
      }
      return span;
    },
  };
}

// ---------- Mosasaurus: 15 m, dark above and pale below, a long-jawed head, four paddles and a tail fluke ----------
function makeMosa(scene) {
  const mat = skinMaterial({ rough: 0.55, bump: 0.8 });
  const BACK = hex(0x2a3440), FLANK = hex(0x55616a), BELLY = hex(0xd8d4c8), MOUTH = hex(0x8a3a3a);
  const col = (u, a) => { const up = Math.sin(a); return mixc(mixc(FLANK, BACK, smooth(0.0, 0.7, up)), BELLY, smooth(-0.15, -0.7, up)); };
  const NB = 41;
  const body = makeLoft(NB, 18, { mat, uvLen: 30, uvRound: 5, color: col });
  const jaw = makeLoft(10, 12, { mat, uvLen: 4, uvRound: 2, color: (u, a) => (Math.sin(a) > 0.55 ? MOUTH : col(u, a)) });
  const fins = [0, 1, 2, 3].map(() => makeLoft(6, 10, { mat, uvLen: 2, uvRound: 1, color: (u, a) => col(u, a) }));
  const fluke = makeLoft(7, 10, { mat, uvLen: 2, uvRound: 1, color: () => BACK });
  const teeth = makeSpikes(scene, 44, 0xf0e8d4, 0.35);
  for (const L of [body, jaw, ...fins, fluke]) scene.add(L.mesh);
  const all = [body, jaw, ...fins, fluke].map((l) => l.mesh).concat([teeth.mesh]);
  // the body's sections from the snout (0) to the tail tip (15 m): [x, half width, top, bottom]; the front 1.8 m is the
  // upper jaw (flat underneath: the lower jaw fits under it)
  const SEC = [[0, 0.05, 0.05, 0.03], [0.4, 0.17, 0.14, 0.07], [1.0, 0.28, 0.23, 0.1], [1.7, 0.4, 0.33, 0.14], [2.4, 0.58, 0.5, 0.5], [3.5, 0.85, 0.75, 0.85], [5.5, 1.0, 0.85, 1.0],
    [7.5, 0.95, 0.8, 0.92], [9.5, 0.72, 0.65, 0.7], [11.5, 0.45, 0.48, 0.45], [13.5, 0.22, 0.32, 0.24], [15, 0.04, 0.1, 0.04]];
  const R = (x) => {
    for (let i = 0; i < SEC.length - 1; i++) if (x <= SEC[i + 1][0]) { const t = (x - SEC[i][0]) / (SEC[i + 1][0] - SEC[i][0]); const e = t * t * (3 - 2 * t); return [lerp(SEC[i][1], SEC[i + 1][1], e), lerp(SEC[i][2], SEC[i + 1][2], e), lerp(SEC[i][3], SEC[i + 1][3], e)]; }
    return [0.04, 0.1, 0.04];
  };
  const HF = new Frame(), JF = new Frame(), M = new THREE.Matrix4();
  return {
    visible(on) { for (const m of all) m.visible = on; },
    // spine(x) -> { p, fwd (toward the snout), up } at x metres behind the snout; jawOpen 0..1
    pose(spine, jawOpen) {
      const st = [];
      for (let i = 0; i < NB; i++) {
        const x = 15 * (1 - i / (NB - 1));                     // tail tip first, snout last
        const sp = spine(x), [w, t, b] = R(x);
        st.push({ p: sp.p, up: sp.up, w, t, b, sq: 0.9 });
      }
      body.update(st);
      // the head frame: at the back of the jaws, X toward the snout
      const h0 = spine(1.85);
      HF.o.copy(h0.p);
      HF.q.setFromRotationMatrix(M.makeBasis(h0.fwd, h0.up, V3().crossVectors(h0.fwd, h0.up)));
      JF.copy(HF); JF.o.copy(HF.at(0, -0.12, 0)); JF.turn(0, -jawOpen * 0.75);
      const JW = [[0, -0.04, 0.4, 0.08, 0.26], [0.6, -0.06, 0.3, 0.07, 0.18], [1.2, -0.04, 0.2, 0.06, 0.1], [1.78, 0.0, 0.04, 0.03, 0.03]];
      jaw.update(resample(JW.map(([x, y, w, t, b]) => ({ p: JF.at(x, y, 0), up: JF.dir(0, 1, 0), w, t, b })), 3));
      teeth.begin();
      for (const sd of [-1, 1]) for (let k = 0; k < 11; k++) {
        const u = 0.25 + k * 0.13;
        const [wu, , bu] = R(1.85 - u);
        teeth.add(HF.at(u, -bu * 0.6, sd * wu * 0.72), HF.dir(0.1, -1, 0), 0.11, 0.026);
        teeth.add(JF.at(u, 0.0, sd * lerp(0.36, 0.08, u / 1.8) * 0.75), JF.dir(0.1, 1, 0), 0.1, 0.024);
      }
      teeth.end();
      // paddles: front pair behind the head, back pair behind the belly, swept back
      const fin = (x, sd, len, i) => {
        const sp = spine(x), side = V3().crossVectors(sp.fwd, sp.up).multiplyScalar(sd);
        const a0 = sp.p.clone().addScaledVector(side, 0.55).addScaledVector(sp.up, -0.4);
        const dir = side.clone().multiplyScalar(0.75).addScaledVector(sp.fwd, -0.5).addScaledVector(sp.up, -0.35).normalize();
        fins[i].update([0, 0.2, 0.45, 0.7, 0.9, 1].map((t, k) => ({ p: a0.clone().addScaledVector(dir, t * len), up: sp.up, w: [0.12, 0.3, 0.38, 0.32, 0.18, 0.02][k] * len * 0.7, t: 0.08, b: 0.08 })));
      };
      fin(3.8, -1, 1.8, 0); fin(3.8, 1, 1.8, 1); fin(8.4, -1, 1.4, 2); fin(8.4, 1, 1.4, 3);
      // the tail fluke: the tail bends down into a big lower lobe
      const tl = spine(14.0);
      const down = tl.up.clone().negate();
      fluke.update([0, 0.2, 0.45, 0.7, 0.9, 1, 1.02].map((t, k) => ({ p: tl.p.clone().addScaledVector(down, t * 1.7).addScaledVector(tl.fwd, -t * 1.0), up: tl.fwd.clone().negate(), w: 0.06, t: [0.3, 0.48, 0.52, 0.42, 0.25, 0.08, 0.01][k], b: [0.2, 0.3, 0.32, 0.25, 0.15, 0.05, 0.01][k] })));
    },
  };
}

// ---------- a motor boat: a hull (shaped), a deck, a cabin with dark windows ----------
function boatGeometry(len) {
  const w = len * 0.3, h = len * 0.12;
  const sh = new THREE.Shape();
  sh.moveTo(-len / 2, h); sh.lineTo(len / 2 - len * 0.12, h); sh.quadraticCurveTo(len / 2, h, len / 2 + len * 0.02, h * 1.15);
  sh.lineTo(len / 2 - len * 0.18, 0); sh.lineTo(-len / 2 + 0.2, 0); sh.lineTo(-len / 2, h * 0.3); sh.lineTo(-len / 2, h);
  const hull = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 });
  hull.translate(0, -h * 0.45, -w / 2);
  const cabin = new THREE.BoxGeometry(len * 0.38, h * 0.95, w * 0.72).translate(-len * 0.06, h * 1.0, 0);
  const win = new THREE.BoxGeometry(len * 0.39, h * 0.32, w * 0.74).translate(-len * 0.06, h * 1.12, 0);
  return { hull, cabin, win };
}
function makeBoats(scene) {
  const out = [];
  const hullMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
  const winMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.1, metalness: 0.3 });
  for (const B of [...BOATS, { ...TARGET_BOAT, target: true }]) {
    const g = boatGeometry(B.len);
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(g.hull, hullMat(B.col)), cabin = new THREE.Mesh(g.cabin, hullMat(0xf2f0ea)), win = new THREE.Mesh(g.win, winMat);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(B.len * 0.92, B.len * 0.02, B.len * 0.31), hullMat(0x1f4a8a));
    stripe.position.set(0.0, B.len * 0.07, 0);
    for (const m of [hull, cabin, win, stripe]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    scene.add(grp);
    out.push({ B, grp });
  }
  return out;
}

export function makeBeasts(scene, ctx) {
  // ---- the herd ----
  const herd = HERD.map((h, i) => {
    const q = makeQuad(scene, TRIKE, { seed: i * 1.7, tint: 0.85 + 0.3 * ((i * 0.37) % 1) });
    const pointAt = (v, ahead) => { const s = HERD_SP * (v - h.t0) + ahead; return herdAt(h, h.t0 + s / HERD_SP); };
    const walk = quadWalker(q, { pointAt, speed: HERD_SP, C: 4.6, vFull: 8, beta: 0.42, offs: [0, 0.5, 0.5, 0], foreAhead: 3.15, lat: 0.62, latF: 0.66 });
    for (const m of q.meshes) m.scale.setScalar(1);
    return { h, q, walk };
  });
  // ---- the Brachiosaurus: across the far end of the avenue, left to right ----
  const brach = makeQuad(scene, BRACH, { seed: 3 });
  const BR = { z: -124, x0: -48, sp: 2.1, t0: 6 };
  const brPoint = (v, ahead) => ({ x: BR.x0 + BR.sp * (v - BR.t0) + ahead, z: BR.z, yaw: Math.PI / 2 });
  const brWalk = quadWalker(brach, { pointAt: brPoint, speed: BR.sp, C: 4.2, vFull: 2.5, beta: 0.68, offs: [0, 0.5, 0.25, 0.75], foreAhead: 4.4, lat: 0.85, latF: 0.95 });
  // ---- the pterosaur ----
  const qz = makeQuetz(scene);
  // ---- the Mosasaurus ----
  const mosa = makeMosa(scene);
  const boats = makeBoats(scene);
  const target = boats.find((b) => b.B.target);
  // its leap: an arc in a vertical plane from where it breaks the surface to the boat (apex 6.5 m up)
  const E = new THREE.Vector3(TARGET_BOAT.x + 5.2, SEA_Y, TARGET_BOAT.z + 9.0), Bt = new THREE.Vector3(TARGET_BOAT.x, SEA_Y, TARGET_BOAT.z);
  const dH = new THREE.Vector3().subVectors(Bt, E); dH.y = 0; const D = dH.length(); dH.normalize();
  const APEX = 7.0, RAD = (D * D / 4 + APEX * APEX) / (2 * APEX);
  const CEN = new THREE.Vector3().addVectors(E, Bt).multiplyScalar(0.5); CEN.y = SEA_Y + APEX - RAD;
  const ang0 = Math.atan2(E.y - CEN.y, -D / 2);              // angle (in the plane) where it breaks the surface
  const angB = Math.atan2(Bt.y - CEN.y, D / 2);
  const M_T0 = V_SEA - 0.15, M_T1 = V_SEA + 1.05;            // breaks the surface .. its head comes down on the boat
  const headAng = (v) => {
    // the head runs along the arc from below the surface, over the top, down onto the boat and under
    const u = (v - M_T0) / (M_T1 - M_T0);
    return lerp(ang0 + 0.9, angB, u);
  };
  const planePt = (a) => { const p = V3().copy(CEN).addScaledVector(dH, Math.cos(a) * RAD); p.y = CEN.y + Math.sin(a) * RAD; return p; };

  const tmp = V3();
  return {
    herd, brach, qz, mosa,
    frame(v, s, glows, smoke) {
      // ---- herd ----
      for (const H of herd) {
        const q0 = herdAt(H.h, v);
        const on = q0.s > -5 && q0.x > -40 && q0.z < 75 && v > 16 && v < 26.5;
        H.q.visible(on);
        if (!on) continue;
        H.walk(v, { h: TRIKE.H * H.h.size, bob: 0.09, lean: 0.03, neckPitch: -0.1, nod: 0.05 });
        // dust thrown up behind the feet
        for (let k = 0; k < 4; k++) {
          const T = 0.8, age = ((v * 1.0 + k * 0.2 + H.h.i * 0.13) % T);
          const back = HERD_SP * age * 0.25;
          smoke.puff(q0.x - Math.sin(q0.yaw) * (2 + back) + (k - 1.5) * 0.8, 0.3 + 0.6 * age, q0.z - Math.cos(q0.yaw) * (2 + back), 0.5 + 1.0 * age, 0.25 * (1 - age / T), 0.82, 0, (k * 0.31 + H.h.i * 0.17) % 1);
        }
      }
      // ---- Brachiosaurus ----
      {
        const on = v > V_BRACH - 4 && v < V_BRACH + 5;
        brach.visible(on);
        if (on) brWalk(v, { h: BRACH.H, bob: 0.05, neckPitch: 0.05, nod: 0.03, neckYaw: 0.15 * Math.sin(v * 0.4) });
      }
      // ---- Quetzalcoatlus ----
      {
        const sq = QSP * (v - QT0);
        const on = sq > -2 && sq < QL - 1 && v > V_QUETZ - 1 && v < V_QUETZ + 7;
        qz.visible(on);
        if (on) {
          const u = clamp(sq / QL, 0, 1);
          const p = QZ.getPointAt(u), t = QZ.getTangentAt(u), t2 = QZ.getTangentAt(clamp(u + 0.02, 0, 1));
          const yaw = Math.atan2(t.x, t.z), pitch = Math.asin(clamp(t.y, -1, 1));
          const turn = Math.atan2(t2.x, t2.z) - yaw;
          const bank = clamp(-turn * 8, -0.6, 0.6);
          // two slow beats as it passes over you, then a glide
          const fl = v - (V_QUETZ + 0.2);
          const flap = fl > 0 && fl < 2.6 ? Math.sin(fl * Math.PI * 2 / 1.3) : 0.15 * Math.sin(v * 1.3);
          qz.pose(p, yaw, pitch, bank, flap, 0);
        }
      }
      // ---- the harbour: boats bobbing; the Mosasaurus ----
      const hit = smooth(M_T1 - 0.1, M_T1 + 0.25, v);
      for (const b of boats) {
        const B = b.B, ph = B.x * 0.3 + B.z * 0.1;
        let y = SEA_Y + 0.1 + 0.08 * Math.sin(v * 1.3 + ph), rx = 0.02 * Math.sin(v * 1.1 + ph), rz = 0.03 * Math.sin(v * 0.9 + ph * 2);
        if (B.target) {
          // the boat: shoved under and rolled over as it comes down on it, then it bobs up on its side
          const k = hit, after = clamp((v - M_T1 - 0.25) / 2.5);
          y -= 1.6 * k * (1 - 0.6 * after);
          rz += 1.25 * k + 0.15 * Math.sin(v * 2) * after;
          rx += 0.35 * k;
          // the rings run out from here
          GU.uSplash.value.set(B.x, B.z, M_T1, 1.0);
        } else {
          // the wave from the splash rocks the others
          const d = Math.hypot(B.x - TARGET_BOAT.x, B.z - TARGET_BOAT.z), arrive = M_T1 + (d - 4) / 9;
          const w = Math.exp(-Math.pow((v - arrive) / 0.6, 2)) * Math.exp(-(d - 4) / 60);
          y += 0.9 * w * Math.sin((v - arrive) * 5); rz += 0.15 * w * Math.sin((v - arrive) * 5 + 1);
        }
        b.grp.position.set(B.x, y, B.z);
        b.grp.rotation.set(rx, B.yaw, rz, 'YXZ');
      }
      if (v < M_T0 - 1 || v > M_T1 + 2.5) GU.uSplash.value.w = v > M_T1 ? 1 : 0;
      {
        const on = v > M_T0 - 0.3 && v < M_T1 + 1.6;
        mosa.visible(on);
        if (on) {
          const ha = headAng(v);
          // each point of the body follows the head along the arc (and on below the surface once past its start)
          const spine = (x) => {
            const a = ha + x / RAD;
            const p = planePt(a);
            // fwd: the way the head is going along the arc (the angle falls as it goes over); up: out from the arc's centre
            const fwd = V3().copy(dH).multiplyScalar(Math.sin(a)); fwd.y = -Math.cos(a);
            const up = V3().copy(dH).multiplyScalar(Math.cos(a)); up.y = Math.sin(a);
            return { p, fwd: fwd.normalize(), up: up.normalize() };
          };
          const jaw = smooth(M_T0 + 0.1, M_T0 + 0.5, v) * (1 - smooth(M_T1 - 0.15, M_T1 + 0.05, v));
          mosa.pose(spine, 0.9 * jaw);
        }
      }
      // splashes: as it breaks the surface, and the big one as it comes down on the boat
      for (const [t0, x, z, big] of [[M_T0, E.x, E.z, 0.6], [M_T1, TARGET_BOAT.x, TARGET_BOAT.z, 1.3]]) {
        const dt = v - t0;
        if (dt < 0 || dt > 3.5) continue;
        for (let k = 0; k < 26; k++) {
          const a = k * 2.39996, sp = (2 + (k % 5)) * big, up = (5 + (k % 7) * 1.6) * big;
          const y = SEA_Y + up * dt - 4.9 * dt * dt;
          if (y < SEA_Y - 0.5) continue;
          smoke.puff(x + Math.cos(a) * sp * dt, Math.max(y, SEA_Y + 0.3), z + Math.sin(a) * sp * dt, (0.7 + 1.2 * dt) * big, 0.5 * (1 - dt / 3.5) * smooth(0, 0.05, dt), 1.0, 0, (k * 0.13) % 1);
        }
        for (let k = 0; k < 60; k++) {
          const a = k * 2.39996, sp = (1.5 + (k % 9) * 0.8) * big, up = (4 + (k % 11) * 1.1) * big;
          const y = SEA_Y + up * dt - 4.9 * dt * dt;
          if (y < SEA_Y) continue;
          glows.add(x + Math.cos(a) * sp * dt, y, z + Math.sin(a) * sp * dt, 0.18, 1.6, 1.7, 1.8);
        }
      }
    },
  };
}
