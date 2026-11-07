// A Tyrannosaurus rex at real size (Sue, the biggest skeleton: 12.3 m long, hips about 3.6 m up, a 1.4 m skull): body,
// tail and neck as one bending tube, a deep skull and a hinged lower jaw (lips cover the teeth when it's shut, as the
// latest work suggests), little two-fingered arms, and long legs that bend at the knee, the ankle and the toes.
// Colours: dark olive-brown on top with darker bands across the back and tail, paler flanks, a cream belly.
//   const rex = makeTheropod(scene);  each frame: rex.pose({ x, z, yaw, ... }) (see POSE below)
import * as THREE from 'three';
import { makeLoft, resample, Frame, chain, ik2, makeSpikes, skinMaterial } from './loft.js';
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
const SKULL = [[-0.12, 0.05, 0.26, 0.28, 0.2], [0.06, 0.05, 0.43, 0.42, 0.3], [0.36, 0.03, 0.4, 0.42, 0.28], [0.72, -0.04, 0.3, 0.32, 0.25],
  [1.06, -0.09, 0.23, 0.25, 0.22], [1.32, -0.12, 0.18, 0.19, 0.17], [1.47, -0.15, 0.08, 0.09, 0.09]];
const HINGE = [0.02, -0.28];
const JAW = [[-0.06, -0.04, 0.36, 0.12, 0.2], [0.35, -0.09, 0.34, 0.12, 0.24], [0.8, -0.05, 0.26, 0.1, 0.17], [1.16, 0.0, 0.2, 0.08, 0.13], [1.36, 0.03, 0.09, 0.06, 0.07]];
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
  const BACK = hex(tone ? 0x2c2416 : 0x33291a), FLANK = hex(tone ? 0x6a5638 : 0x6f5a3a), BELLY = hex(0xcdbd98), STRIPE = hex(0x1c160e), MOUTH = hex(0x8a3a34), TONGUE = hex(0xa04a44);
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
  const skull = makeLoft(1 + (SKULL.length - 1) * 4, 18, { mat, uvLen: 6, uvRound: 3, color: (u, a) => {
    const up = Math.sin(a);
    let c = skin(u, a, { belly: 0.3 });
    if (up < -0.6 && u > 0.12 && u < 0.9) c = MOUTH;               // the palate (only seen with the mouth open)
    const eye = Math.exp(-Math.pow((u - 0.28) / 0.1, 2)) * smooth(-0.2, 0.5, up) * (1 - smooth(0.6, 0.95, up));
    return mixc(c, STRIPE, eye * 0.55);
  } });
  const jaw = makeLoft(1 + (JAW.length - 1) * 4, 14, { mat, uvLen: 5, uvRound: 2, color: (u, a) => {
    const up = Math.sin(a);
    if (up > 0.6 && u > 0.05) return u > 0.2 && u < 0.75 && up > 0.85 ? TONGUE : MOUTH;
    return mixc(skin(u, a, { belly: 1 }), BELLY, smooth(0.1, -0.6, up) * 0.6);
  } });
  const legs = [0, 1].map(() => makeLoft(1 + 6 * 3, 14, { mat, uvLen: 8, uvRound: 2, color: (u, a) => {
    const fr = Math.cos(a);                                          // (the "up" of a leg section is forward)
    return mixc(mixc(FLANK, BACK, 0.35 * smooth(0.3, 0.9, -fr)), hex(0x3e3224), smooth(0.45, 0.8, u));
  } }));
  const toes = [0, 1, 2, 3, 4, 5].map(() => makeLoft(4, 8, { mat, uvLen: 2, uvRound: 1, color: () => hex(0x3a2e20) }));
  const arms = [0, 1].map(() => makeLoft(7, 10, { mat, uvLen: 3, uvRound: 1, color: (u, a) => skin(u, a, { belly: 0.5 }) }));
  for (const L of [body, skull, jaw, ...legs, ...toes, ...arms]) scene.add(L.mesh);
  const teeth = makeSpikes(scene, 60, 0xe8dcc0, 0.35);
  const claws = makeSpikes(scene, 14, 0x1a1612, 0.4);
  // eyes: an amber iris round a black pupil, glossy
  const eyeTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#1a0f08'; g.fillRect(0, 0, 256, 128);
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.09, '#000'); gr.addColorStop(0.11, '#6a3a08'); gr.addColorStop(0.2, '#e0a020'); gr.addColorStop(0.3, '#b86a10'); gr.addColorStop(0.36, '#2a1806'); gr.addColorStop(1, '#1a0f08');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(60,25,0,${0.2 + Math.random() * 0.3})`; g.beginPath(); const x = k * 2.85; g.moveTo(x, 14); g.lineTo(x + 3, 44); g.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.1, metalness: 0, emissive: 0xffffff, emissiveMap: eyeTex, emissiveIntensity: 0.9 });
  const eyes = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), eyeMat); scene.add(m); return m; });
  const brows = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat); m.castShadow = true; scene.add(m); return m; });
  for (const b of brows) { const g = b.geometry; const c = new Float32Array(g.attributes.position.count * 3); const cc = new THREE.Color().setRGB(...BACK, THREE.SRGBColorSpace); for (let i = 0; i < c.length; i += 3) c.set([cc.r, cc.g, cc.b], i); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const nostrils = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.9 })); scene.add(m); return m; });
  const all = [body, skull, jaw, ...legs, ...toes, ...arms].map((l) => l.mesh).concat(eyes, brows, nostrils, [teeth.mesh, claws.mesh]);

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
      const sk = SKULL.map(([x, y, w, t, b]) => ({ p: H.at(x, y, 0), up: H.dir(0, 1, 0), w, t, b, sq: 0.8 }));
      skull.update(resample(sk, 4));
      const J = out.jaw.copy(H); J.o.copy(H.at(HINGE[0], HINGE[1], 0)); J.turn(0, -(P.jaw || 0) * 0.85);
      jaw.update(resample(JAW.map(([x, y, w, t, b]) => ({ p: J.at(x, y, 0), up: J.dir(0, 1, 0), w, t, b, sq: 0.8 })), 4));
      H.at(1.47, -0.15, 0, out.snout);
      // teeth: upper row along the skull's lower edges (pointing down), lower row along the jaw's upper edges
      teeth.begin();
      for (const sd of [-1, 1]) for (let k = 0; k < 13; k++) {
        const u = 0.32 + k * 0.083, big = 1 - Math.abs(k - 4) / 12;
        const y = lerp(-0.02, -0.14, u / 1.4) - 0.25 + 0.05 * u / 1.4, w = lerp(0.4, 0.17, u / 1.4) * 0.8;
        teeth.add(H.at(u, y + 0.06, sd * w), H.dir(0.12, -1, sd * 0.05), 0.11 + 0.08 * big, 0.026 + 0.012 * big);
        if (k < 12) { const uj = 0.36 + k * 0.08, wj = lerp(0.33, 0.16, uj / 1.36) * 0.78; teeth.add(J.at(uj, lerp(-0.09, 0.02, uj / 1.36) + 0.06, sd * wj), J.dir(0.1, 1, sd * 0.05), 0.09 + 0.06 * big, 0.022 + 0.01 * big); }
      }
      teeth.end();
      // eyes, brow bosses, nostrils
      for (const [i, sd] of [[0, -1], [1, 1]]) {
        eyes[i].position.copy(H.at(0.37, 0.13, sd * 0.35));
        eyes[i].quaternion.copy(H.q).multiply(new THREE.Quaternion().setFromUnitVectors(UPW, tmp.set(0.55, 0.08, sd * 0.83).normalize()));
        brows[i].position.copy(H.at(0.33, 0.27, sd * 0.29)); brows[i].quaternion.copy(H.q); brows[i].scale.set(0.16, 0.08, 0.1);
        nostrils[i].position.copy(H.at(1.36, -0.02, sd * 0.1)); nostrils[i].quaternion.copy(H.q); nostrils[i].scale.set(1.4, 0.6, 0.8);
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
