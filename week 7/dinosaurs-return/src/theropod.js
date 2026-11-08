// A Tyrannosaurus rex at real size (Sue, the biggest skeleton: 12.3 m long, hips about 3.6 m up, a 1.4 m skull): body,
// tail and neck as one bending tube, a skull wide at the back and narrowing fast to a long roof-shaped snout, heavy brows
// over forward-set eyes, a deep hinged lower jaw and a full row of teeth round the whole mouth, little two-fingered arms, and long legs that bend at the knee, the ankle and the toes.
// Colours: dark olive-brown on top with darker bands across the back and tail, paler flanks, a cream belly.
//   const rex = makeTheropod(scene);  each frame: rex.pose({ x, z, yaw, ... }) (see POSE below)
import * as THREE from 'three';
import { makeLoft, resample, Frame, chain, ik2, makeSpikes, skinMaterial, headMaterial, setRest } from './loft.js';
import { smooth, clamp, lerp } from './util.js';

const V3 = () => new THREE.Vector3();
const UPW = new THREE.Vector3(0, 1, 0);
// the body: from the pelvis forward to the back of the skull, and from the pelvis back to the tail tip
// (offset of each joint from the last, in the last one's frame; then the section there: half width, top, bottom)
const FWD = [[1.2, -0.12], [1.2, -0.06], [0.8, 0.06], [0.62, 0.3], [0.55, 0.22], [0.42, 0.0]];
const FWD_R = [[0.7, 0.62, 0.86], [0.8, 0.6, 1.12], [0.74, 0.58, 1.04], [0.58, 0.52, 0.78], [0.46, 0.46, 0.62], [0.4, 0.43, 0.5], [0.36, 0.42, 0.42]];
const TAIL = [[1.0, 0.0], [1.15, -0.05], [1.15, -0.08], [1.1, -0.12], [1.0, -0.12], [0.85, -0.1]];
const TAIL_R = [[0.7, 0.62, 0.86], [0.62, 0.6, 0.72], [0.5, 0.5, 0.58], [0.37, 0.39, 0.45], [0.25, 0.27, 0.3], [0.14, 0.16, 0.16], [0.04, 0.05, 0.05]];
// the skull (head frame: at the back of the skull, X along it) and the lower jaw (jaw frame: at the hinge)
// (x, y, half width, top, bottom, how roof-shaped: the outline from the side is the old one; from above and in front it now
// narrows hard just ahead of the eyes)
const SKULL = [[-0.12, 0.05, 0.3, 0.28, 0.2, 0.1], [0.06, 0.05, 0.5, 0.42, 0.3, 0.15], [0.36, 0.03, 0.47, 0.42, 0.28, 0.25], [0.56, 0.0, 0.3, 0.37, 0.27, 0.55], [0.72, -0.04, 0.225, 0.32, 0.25, 0.68],
  [1.06, -0.09, 0.165, 0.25, 0.22, 0.72], [1.32, -0.12, 0.14, 0.19, 0.17, 0.62], [1.47, -0.15, 0.07, 0.09, 0.09, 0.3]];
const HINGE = [0.02, -0.28];
const JAW = [[-0.06, -0.04, 0.42, 0.12, 0.26], [0.35, -0.09, 0.36, 0.12, 0.32], [0.8, -0.05, 0.19, 0.1, 0.23], [1.16, 0.0, 0.14, 0.08, 0.17], [1.36, 0.03, 0.065, 0.06, 0.09]];
// the section of the skull or jaw at x (for setting the teeth on its edge)
function secAt(T, x) {
  let i = 0; while (i < T.length - 2 && x > T[i + 1][0]) i++;
  const u = clamp((x - T[i][0]) / (T[i + 1][0] - T[i][0])), e = u * u * (3 - 2 * u), A = T[i], B = T[i + 1];
  return { y: lerp(A[1], B[1], u), w: lerp(A[2], B[2], e), t: lerp(A[3], B[3], e), b: lerp(A[4], B[4], e) };
}
export const LEG = { L1: 1.45, L2: 1.4, L3: 0.72, HIP: [0.12, -0.32, 0.5] };
export const REACH = 5.6;                // pelvis to the tip of the snout, walking

const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// where the back of the skull ends up for a pose, and which way the skull points (no meshes touched): for aiming the head
const _root = new Frame();
export function headFrame(P, out = new Frame()) {
  _root.o.set(P.x, P.h, P.z);
  _root.q.setFromAxisAngle(UPW, P.yaw - Math.PI / 2);
  _root.turn(0, -P.lean, P.roll || 0);
  const nb = (i) => i >= 3 ? [P.neckYaw / 3, P.neckPitch / 3 + (i === 3 ? 0.05 : 0)] : [0, i === 1 ? 0.02 * (P.breath || 0) : 0];
  const fr = chain(_root, FWD, FWD.map((_, i) => nb(i)));
  return out.copy(fr[fr.length - 1]).turn(P.headYaw || 0, (P.headPitch || 0) - 0.12, P.headRoll || 0);
}

export function makeTheropod(scene, { seed = 0, tone = 0 } = {}) {
  const BACK = hex(tone ? 0x2c2416 : 0x33291a), FLANK = hex(tone ? 0x6a5638 : 0x6f5a3a), BELLY = hex(0xcdbd98), STRIPE = hex(0x1c160e), MOUTH = hex(0x8a3a34), TONGUE = hex(0xa04a44), THROAT = hex(0x140605);
  const skin = (u, a, { bands = 0, belly = 1 } = {}) => {
    const up = Math.sin(a);
    let c = mixc(FLANK, BACK, smooth(0.05, 0.85, up));
    c = mixc(c, BELLY, smooth(-0.2, -0.8, up) * belly);
    if (bands) {
      const b = Math.pow(0.5 + 0.5 * Math.sin(u * bands * Math.PI * 2 + seed), 6) * smooth(-0.3, 0.3, up);
      c = mixc(c, STRIPE, b * 0.7);
    }
    return c;
  };
  const mat = skinMaterial({ rough: 0.68, bump: 1.2 });
  const NS = 1 + (FWD.length + TAIL.length) * 4;
  const body = makeLoft(NS, 20, { mat, uvLen: 26, uvRound: 5, color: (u, a) => skin(u, a, { bands: u < 0.62 ? 11 : 0 }) });
  const hmat = headMaterial();
  const skull = makeLoft(1 + (SKULL.length - 1) * 4, 28, { mat: hmat, uvLen: 6, uvRound: 3, color: (u, a) => {
    const up = Math.sin(a);
    let c = skin(u, a, { belly: 0.3 });
    if (up < -0.6 && u > 0.08 && u < 0.92) c = mixc(THROAT, MOUTH, smooth(0.12, 0.6, u));   // the palate (only seen with the mouth open)
    else {
      // a dark mask round the eyes, a paler ridge down the top of the snout, a dark line along the lips
      const eye = Math.exp(-Math.pow((u - 0.36) / 0.09, 2)) * smooth(-0.2, 0.4, up) * (1 - smooth(0.65, 0.95, up));
      c = mixc(c, STRIPE, eye * 0.75);
      c = mixc(c, hex(0x8a7650), smooth(0.8, 0.98, up) * smooth(0.42, 0.6, u) * 0.75);
      c = mixc(c, STRIPE, Math.exp(-Math.pow((up + 0.48) / 0.14, 2)) * smooth(0.25, 0.4, u) * 0.7);
    }
    return c;
  } });
  const jaw = makeLoft(1 + (JAW.length - 1) * 4, 22, { mat: hmat, uvLen: 5, uvRound: 2, color: (u, a) => {
    const up = Math.sin(a);
    if (up > 0.55 && u > 0.05) return mixc(THROAT, u > 0.15 && u < 0.72 && up > 0.86 ? TONGUE : MOUTH, smooth(0.08, 0.5, u));
    return mixc(mixc(skin(u, a, { belly: 1 }), BELLY, smooth(0.1, -0.6, up) * 0.6), STRIPE, Math.exp(-Math.pow((up - 0.42) / 0.14, 2)) * 0.6);
  } });
  const legs = [0, 1].map(() => makeLoft(1 + 6 * 3, 14, { mat, uvLen: 8, uvRound: 2, color: (u, a) => {
    const fr = Math.cos(a);                                          // (the "up" of a leg section is forward)
    return mixc(mixc(FLANK, BACK, 0.35 * smooth(0.3, 0.9, -fr)), hex(0x3e3224), smooth(0.45, 0.8, u));
  } }));
  const toes = [0, 1, 2, 3, 4, 5].map(() => makeLoft(4, 8, { mat, uvLen: 2, uvRound: 1, color: () => hex(0x3a2e20) }));
  const arms = [0, 1].map(() => makeLoft(7, 10, { mat, uvLen: 3, uvRound: 1, color: (u, a) => skin(u, a, { belly: 0.5 }) }));
  for (const L of [body, skull, jaw, ...legs, ...toes, ...arms]) scene.add(L.mesh);
  const skullSt = (F) => SKULL.map(([x, y, w, t, b, pinch]) => ({ p: F.at(x, y, 0), up: F.dir(0, 1, 0), w, t, b, sq: 0.8, pinch }));
  const jawSt = (F) => JAW.map(([x, y, w, t, b]) => ({ p: F.at(x, y, 0), up: F.dir(0, 1, 0), w, t, b, sq: 0.8 }));
  const browSt = (F, sd) => [[0.2, 0.3, 0.42, 0.03], [0.32, 0.31, 0.385, 0.075], [0.46, 0.27, 0.32, 0.1], [0.6, 0.21, 0.235, 0.08], [0.72, 0.15, 0.17, 0.03]].map(([x, y, z, r]) => ({ p: F.at(x, y, sd * z), up: F.dir(0, 1, 0), w: r * 1.15, t: r, b: r * 0.8 }));
  const rest = new Frame();
  setRest(skull, resample(skullSt(rest), 4));
  setRest(jaw, resample(jawSt(rest), 4));
  const teeth = makeSpikes(scene, 72, 0xece2c8, 0.32);
  const claws = makeSpikes(scene, 14, 0x1a1612, 0.4);
  // eyes: an amber iris round a black pupil, glossy
  const eyeTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#1a0f08'; g.fillRect(0, 0, 256, 128);
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.07, '#000'); gr.addColorStop(0.09, '#7a4208'); gr.addColorStop(0.17, '#e8a81c'); gr.addColorStop(0.27, '#a85c0c'); gr.addColorStop(0.33, '#1a0e04'); gr.addColorStop(1, '#1a0f08');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(60,25,0,${0.2 + Math.random() * 0.3})`; g.beginPath(); const x = k * 2.85; g.moveTo(x, 14); g.lineTo(x + 3, 44); g.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.1, metalness: 0, emissive: 0xffffff, emissiveMap: eyeTex, emissiveIntensity: 0.75 });
  const eyes = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), eyeMat); scene.add(m); return m; });
  // the brows: a heavy ridge over each eye, sloping down and in toward the snout (the glare)
  const brows = [-1, 1].map((sd) => { const L = makeLoft(1 + 4 * 3, 12, { mat: hmat, color: (u, a) => mixc(BACK, hex(0x6a5a3c), smooth(0.2, 0.95, Math.sin(a)) * 0.7) }); setRest(L, resample(browSt(rest, sd), 3)); scene.add(L.mesh); return L; });
  const throat = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: 0x0c0403, roughness: 1 }));
  scene.add(throat);
  const nostrils = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.9 })); scene.add(m); return m; });
  const all = [body, skull, jaw, ...legs, ...toes, ...arms].map((l) => l.mesh).concat(eyes, brows.map((l) => l.mesh), nostrils, [teeth.mesh, claws.mesh, throat]);

  const st = (f, r, sq) => ({ p: f.o.clone(), up: f.dir(0, 1, 0), w: r[0], t: r[1], b: r[2], sq });
  const root = new Frame(), tmp = V3(), tmp2 = V3(), hint = V3();
  const out = { head: new Frame(), jaw: new Frame(), snout: V3(), nose: [V3(), V3()], feet: [V3(), V3()] };
  return {
    meshes: all,
    out,
    visible(on) { for (const m of all) m.visible = on; },
    // P: { x, z, yaw (heading: 0 = facing +z), h (pelvis height), lean (nose down +), roll, neckPitch, neckYaw, headPitch,
    //      headYaw, headRoll, jaw (0 shut .. 1.2 wide), tail: [yaw, pitch] sway, breath (0..1), feet: [{ x, y, z, yaw, lift }] x2,
    //      arm (0..1 swing) }
    pose(P) {
      root.o.set(P.x, P.h, P.z);
      root.q.setFromAxisAngle(UPW, P.yaw - Math.PI / 2);
      root.turn(0, -P.lean, P.roll || 0);
      // the front: belly, chest, shoulders, the S of the neck to the back of the skull
      const nb = (i) => i >= 3 ? [P.neckYaw / 3, P.neckPitch / 3 + (i === 3 ? 0.05 : 0)] : [0, i === 1 ? 0.02 * (P.breath || 0) : 0];
      const fr = chain(root, FWD, FWD.map((_, i) => nb(i)));
      // the tail: from the pelvis, facing back
      const tr = new Frame().copy(root).turn(Math.PI, 0);
      const tb = TAIL.map((_, i) => [(P.tail?.[0] || 0) * (0.4 + 0.3 * i), (P.tail?.[1] || 0) * 0.5 + (i > 2 ? 0.01 : 0)]);
      const tl = chain(tr, TAIL, tb);
      const keys = [];
      for (let i = tl.length - 1; i >= 1; i--) keys.push(st(tl[i], TAIL_R[i]));
      for (let i = 0; i < fr.length; i++) keys.push(st(fr[i], FWD_R[i]));
      body.update(resample(keys, 4));
      // the head
      const H = out.head.copy(fr[fr.length - 1]).turn(P.headYaw || 0, (P.headPitch || 0) - 0.12, P.headRoll || 0);
      skull.update(resample(skullSt(H), 4));
      const J = out.jaw.copy(H); J.o.copy(H.at(HINGE[0], HINGE[1], 0)); J.turn(0, -(P.jaw || 0) * 0.85);
      jaw.update(resample(jawSt(J), 4));
      // the dark back of the mouth, between the palate and the tongue
      throat.position.copy(J.o).lerp(H.at(0.05, -0.1, 0, tmp), 0.5); throat.quaternion.copy(H.q); throat.scale.set(0.22, 0.2 + 0.42 * (P.jaw || 0), 0.36);
      H.at(1.47, -0.15, 0, out.snout);
      // teeth: upper row along the skull's lower edges (pointing down), lower row along the jaw's upper edges
      teeth.begin();
      for (const sd of [-1, 1]) {
        for (let k = 0; k < 13; k++) {
          // the same size all the way round, a little longer mid-row, shorter at the back
          const x = 0.42 + k * 0.078, big = 0.5 + 0.5 * Math.sin(Math.PI * clamp((k + 2) / 13)), sv = 0.86 + 0.2 * Math.sin(k * 2.3 + 0.7);
          const a = secAt(SKULL, x);
          teeth.add(H.at(x, a.y - a.b * 0.62, sd * a.w * 0.84), H.dir(-0.14, -1, sd * 0.1), (0.12 + 0.11 * big) * sv, 0.021 + 0.011 * big);
          const xj = 0.42 + k * 0.073, c = secAt(JAW, xj);
          teeth.add(J.at(xj, c.y + c.t * 0.68, sd * c.w * 0.8), J.dir(-0.12, 1, sd * 0.1), (0.1 + 0.09 * big) * sv, 0.019 + 0.01 * big);
        }
        // the small front teeth, across the tip of each jaw
        for (const [x, z] of [[1.4, 0.075], [1.435, 0.03]]) teeth.add(H.at(x, -0.24, sd * z), H.dir(0.2, -1, sd * 0.05), 0.11, 0.024);
        for (const [x, z] of [[1.3, 0.07], [1.35, 0.028]]) teeth.add(J.at(x, 0.075, sd * z), J.dir(0.2, 1, sd * 0.05), 0.09, 0.022);
      }
      teeth.end();
      // eyes, brow bosses, nostrils
      for (const [i, sd] of [[0, -1], [1, 1]]) {
        eyes[i].position.copy(H.at(0.47, 0.145, sd * 0.3));
        eyes[i].quaternion.copy(H.q).multiply(new THREE.Quaternion().setFromUnitVectors(UPW, tmp.set(0.74, 0.0, sd * 0.67).normalize()));
        brows[i].update(resample(browSt(H, sd), 3));
        nostrils[i].position.copy(H.at(1.36, -0.03, sd * 0.1)); nostrils[i].quaternion.copy(H.q); nostrils[i].scale.set(1.4, 0.7, 0.8);
        out.nose[i].copy(nostrils[i].position);
      }
      // legs: hip -> knee (forward) -> ankle -> ball of the foot; three toes forward, claws on them
      claws.begin();
      const fwd = root.dir(1, 0, 0);
      for (let i = 0; i < 2; i++) {
        const sd = i ? 1 : -1, F = P.feet[i];
        const Hp = root.at(LEG.HIP[0], LEG.HIP[1], sd * LEG.HIP[2], V3());
        const fy = (F.y || 0) + 0.12 + 0.55 * (F.lift || 0);
        const B = V3().set(F.x, fy, F.z);
        const fdir = V3().set(Math.sin(F.yaw), 0, Math.cos(F.yaw));
        // the metatarsus stands steep behind the ball of the foot (more so as the foot lifts)
        const ang = 1.15 + 0.25 * (F.lift || 0);
        const A = V3().copy(B).addScaledVector(fdir, -Math.cos(ang) * LEG.L3).add(tmp.set(0, Math.sin(ang) * LEG.L3, 0));
        hint.copy(fwd).addScaledVector(UPW, -0.2);
        const K = ik2(Hp, A, LEG.L1, LEG.L2, hint, V3());
        const lp = (a, b, t) => V3().lerpVectors(a, b, t);
        const kk = [
          { p: lp(Hp, K, -0.15), w: 0.4, t: 0.5, b: 0.55 }, { p: lp(Hp, K, 0.25), w: 0.42, t: 0.48, b: 0.58 }, { p: lp(Hp, K, 0.65), w: 0.3, t: 0.3, b: 0.36 }, { p: K.clone(), w: 0.2, t: 0.2, b: 0.22 },
          { p: lp(K, A, 0.4), w: 0.18, t: 0.17, b: 0.24 }, { p: A.clone(), w: 0.13, t: 0.12, b: 0.14 }, { p: B.clone(), w: 0.13, t: 0.12, b: 0.11 },
        ];
        for (const k of kk) { k.up = V3().copy(fwd); }
        legs[i].update(resample(kk, 3));
        out.feet[i].copy(B);
        for (let t = 0; t < 3; t++) {
          const a = (t - 1) * 0.38, d = V3().set(Math.sin(F.yaw + a * sd), 0, Math.cos(F.yaw + a * sd));
          const len = t === 1 ? 0.62 : 0.5;
          const tip = V3().copy(B).addScaledVector(d, len); tip.y = (F.y || 0) + 0.05 + 0.4 * (F.lift || 0);
          const mid = V3().lerpVectors(B, tip, 0.5); mid.y += 0.03;
          toes[i * 3 + t].update([{ p: B.clone().addScaledVector(d, -0.05), up: UPW, w: 0.1, t: 0.09, b: 0.06 }, { p: mid, up: UPW, w: 0.09, t: 0.08, b: 0.05 }, { p: tip, up: UPW, w: 0.06, t: 0.05, b: 0.04 }, { p: tip.clone().addScaledVector(d, 0.02), up: UPW, w: 0.01, t: 0.01, b: 0.01 }]);
          claws.add(tip, tmp2.copy(d).add(tmp.set(0, -0.6, 0)), 0.16, 0.045);
        }
      }
      // the arms: small, held bent under the chest, two fingers each
      for (let i = 0; i < 2; i++) {
        const sd = i ? 1 : -1, C = fr[2];
        const sw = (P.arm || 0) * 0.15;
        const S0 = C.at(0.75, -0.55, sd * 0.5), E = C.at(1.05 + sw, -1.02, sd * 0.62), Wr = C.at(1.38 + sw, -0.85, sd * 0.55), Tp = C.at(1.55 + sw, -0.98, sd * 0.5);
        const ak = [S0, E, Wr, Tp].map((p, k) => ({ p, up: C.dir(1, 0, 0), w: [0.14, 0.09, 0.07, 0.04][k], t: [0.14, 0.09, 0.06, 0.04][k], b: [0.14, 0.09, 0.06, 0.04][k] }));
        arms[i].update(resample(ak, 2));
        claws.add(Tp, C.dir(0.3, -1, 0), 0.12, 0.03);
      }
      claws.end();
      return out;
    },
  };
}

export { smooth, clamp };
