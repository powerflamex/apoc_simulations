// The animals' shapes, for quad.js (real sizes in metres; offsets from the pelvis, X forward, Y up, Z to the side).
//   HORSE   a draft horse, ~1.65 m at the withers (1912's wagons)
//   MOOSE   an eastern bull moose, ~1.9 m at the shoulder, palmate antlers ~1.4 m across, a bell under the throat
//   MASTO   an American mastodon bull, ~2.9 m at the shoulder, shaggy, curved tusks, a trunk
//   BEAR    a giant short-faced bear (Arctodus simus), ~1.6 m at the shoulder on all fours, ~3.4 m standing up
//   CAT     Smilodon fatalis, ~1 m at the shoulder, bobbed tail, 18 cm (7 in) sabres
//   SAURO   a brachiosaur scaled up 1.35x from quad.js' Brachiosaurus: head ~17 m up (Sauroposeidon)
// The extra parts each one needs (antlers, tusks and trunk, ears, sabres and a jaw that opens) are built here.
import * as THREE from 'three';
import { BRACH } from './quad.js';
import { makeLoft, resample, makeSpikes } from './loft.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const solid = (color, rough = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

// a lower jaw that opens (bear, cat): a short tube hinged under the skull, dark inside, teeth on its rim
function makeJaw(scene, { len, w, hinge, teeth = 8, toothL = 0.03, color = 0x4a3020, mouth = 0x5a1a18 }) {
  const L = makeLoft(9, 12, { mat: solid(0xffffff, 0.8, { vertexColors: true }), color: (u, a) => (Math.sin(a) > 0.5 ? [0.35, 0.08, 0.07] : new THREE.Color(color).toArray()) });
  const T = makeSpikes(scene, teeth * 2 + 4, 0xf0e8d8, 0.3);
  scene.add(L.mesh);
  return {
    meshes: [L.mesh, T.mesh],
    pose(H, open, upperTeeth = true) {
      const J = H; // frame of the skull
      const o = J.at(hinge[0], hinge[1], 0);
      const ang = -0.15 - open;
      const dir = (u) => J.dir(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(u * len);
      const st = [0, 0.25, 0.5, 0.75, 1].map((u) => ({ p: o.clone().add(dir(u)), up: J.dir(-Math.sin(ang), Math.cos(ang), 0), w: w * (1 - 0.45 * u), t: w * 0.35, b: w * 0.55 * (1 - 0.3 * u) }));
      L.update(resample(st, 2));
      T.begin();
      for (const sd of [-1, 1]) for (let k = 0; k < teeth / 2; k++) {
        const u = 0.25 + 0.7 * k / (teeth / 2), wd = w * (1 - 0.45 * u) * 0.75;
        T.add(o.clone().add(dir(u)).add(J.dir(0, 0, sd * wd)), J.dir(-Math.sin(ang), Math.cos(ang), 0), toothL * (k === teeth / 2 - 1 ? 1.8 : 1), toothL * 0.3);
        if (upperTeeth) T.add(J.at(hinge[0] + u * len * 0.95, hinge[1] + 0.02, sd * wd), J.dir(0, -1, 0), toothL * (k === teeth / 2 - 1 ? 1.8 : 1), toothL * 0.3);
      }
      T.end();
    },
  };
}

export const HORSE = {
  FWD: [[0.55, 0.0], [0.5, 0.0], [0.4, 0.08], [0.22, 0.2], [0.2, 0.2], [0.16, 0.16]],
  FWD_R: [[0.27, 0.24, 0.3], [0.29, 0.22, 0.36], [0.28, 0.24, 0.4], [0.24, 0.3, 0.38], [0.15, 0.24, 0.24], [0.11, 0.18, 0.17], [0.09, 0.13, 0.12]],
  TAIL: [[0.2, 0.0], [0.25, -0.2], [0.25, -0.35], [0.2, -0.3]],
  TAIL_R: [[0.27, 0.24, 0.3], [0.1, 0.1, 0.1], [0.1, 0.09, 0.12], [0.11, 0.08, 0.13], [0.05, 0.04, 0.06]],
  SKULL: [[-0.08, 0, 0.09, 0.11, 0.11], [0.1, 0.0, 0.1, 0.11, 0.13], [0.3, -0.02, 0.08, 0.08, 0.1], [0.5, -0.03, 0.065, 0.06, 0.08], [0.62, -0.04, 0.055, 0.05, 0.06]],
  headTilt: -1.1, H: 1.38,
  hind: { L1: 0.5, L2: 0.5, L3: 0.52, at: [-0.05, -0.1, 0.18], ang: 1.45 },
  fore: { L1: 0.42, L2: 0.42, L3: 0.5, at: [1.42, -0.32, 0.2], ang: 1.5 },
  legR: [[0.12, 0.07, 0.05], [0.16, 0.08, 0.055]],
  colors: { back: 0x3e2414, flank: 0x6a3a1e, belly: 0x5a3420, stripe: 0x1a1210, foot: 0x1a1410 },
  tailColor: 0x141010, fur: { shag: 0.08, bump: 1.2 }, claws: false, footY: 0.06, liftH: 0.3, eyeR: 0.028, eyeAt: [0.16, 0.06, 0.09], bands: 0, kind: 'horse',
  makeExtra(scene) {
    const m = solid(0x141010, 0.9);
    const mane = makeLoft(11, 8, { mat: solid(0xffffff, 0.95, { vertexColors: true }), color: () => [0.07, 0.06, 0.05] });
    const ears = [0, 1].map(() => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6).translate(0, 0.07, 0), m); scene.add(e); return e; });
    scene.add(mane.mesh);
    return {
      meshes: [mane.mesh, ...ears],
      pose({ H, fr }) {
        const n = fr.length, st = [];
        for (let i = 2; i < n; i++) st.push({ p: fr[i].at(-0.02, HORSE.FWD_R[i][1] * 0.95, 0), up: fr[i].dir(0, 1, 0), w: 0.035, t: 0.12, b: 0.02 });
        st.push({ p: H.at(-0.05, 0.12, 0), up: H.dir(0, 1, 0), w: 0.03, t: 0.06, b: 0.02 });
        mane.update(resample(st, 2));
        for (const [i, sd] of [[0, -1], [1, 1]]) { ears[i].position.copy(H.at(-0.06, 0.1, sd * 0.06)); ears[i].quaternion.copy(H.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sd * 0.2, 0, 1.2))); }
      },
    };
  },
};

export const MOOSE = {
  FWD: [[0.55, 0.05], [0.55, 0.08], [0.35, 0.12], [0.25, 0.05], [0.25, 0.0], [0.18, -0.02]],
  FWD_R: [[0.3, 0.28, 0.32], [0.33, 0.3, 0.42], [0.33, 0.42, 0.45], [0.28, 0.46, 0.42], [0.18, 0.3, 0.32], [0.15, 0.22, 0.26], [0.12, 0.16, 0.18]],
  TAIL: [[0.15, -0.05], [0.12, -0.1]],
  TAIL_R: [[0.3, 0.28, 0.32], [0.1, 0.1, 0.1], [0.04, 0.04, 0.04]],
  SKULL: [[-0.08, 0, 0.11, 0.13, 0.13], [0.15, 0, 0.12, 0.13, 0.15], [0.35, -0.03, 0.1, 0.1, 0.14], [0.55, -0.06, 0.1, 0.09, 0.14], [0.68, -0.1, 0.09, 0.08, 0.11], [0.72, -0.12, 0.05, 0.05, 0.06]],
  headTilt: -0.9, H: 1.5,
  hind: { L1: 0.58, L2: 0.6, L3: 0.6, at: [-0.05, -0.12, 0.2], ang: 1.45 },
  fore: { L1: 0.55, L2: 0.55, L3: 0.55, at: [1.45, -0.25, 0.22], ang: 1.5 },
  legR: [[0.14, 0.08, 0.055], [0.17, 0.085, 0.06]],
  colors: { back: 0x241a12, flank: 0x3a2a1c, belly: 0x2a2018, stripe: 0x120c08, foot: 0x9a8a70 },
  fur: { shag: 0.3, bump: 1.5 }, claws: false, footY: 0.06, liftH: 0.35, eyeR: 0.03, eyeAt: [0.22, 0.06, 0.11], bands: 0, kind: 'moose',
  makeExtra(scene) {
    const bone = solid(0x8a7254, 0.8), dark = solid(0x1e1610, 0.95);
    const palms = [0, 1].map(() => { const g = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(0.3, 0.05, 0.18), bone); g.castShadow = true; scene.add(g); return g; });
    const beams = [0, 1].map(() => { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 8).translate(0, 0.15, 0), bone); scene.add(g); return g; });
    const tines = makeSpikes(scene, 20, 0xa08a68, 0.7);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.06, 0.2, 0.05), dark); scene.add(bell);
    const ears = [0, 1].map(() => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 7).translate(0, 0.11, 0), dark); scene.add(e); return e; });
    return {
      meshes: [...palms, ...beams, tines.mesh, bell, ...ears],
      pose({ H }) {
        tines.begin();
        for (const [i, sd] of [[0, -1], [1, 1]]) {
          const base = H.at(0.02, 0.12, sd * 0.09);
          beams[i].position.copy(base);
          beams[i].quaternion.setFromUnitVectors(V3(0, 1, 0), H.dir(-0.1, 0.5, sd * 1).normalize());
          const c = H.at(-0.12, 0.34, sd * 0.42);
          palms[i].position.copy(c);
          palms[i].quaternion.copy(H.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sd * 0.55, 0, 0.35)));
          for (let k = 0; k < 8; k++) {
            const a = -0.8 + k * 0.28, tip = H.dir(Math.cos(a) * 0.3, 0.55, sd * (0.35 + 0.3 * Math.sin(a + 0.8)));
            tines.add(H.at(-0.12 + Math.cos(a) * 0.24, 0.37 + Math.sin(a) * 0.04, sd * (0.42 + 0.16 * Math.sin(a + 1.2))), tip, 0.13, 0.022);
          }
          ears[i].position.copy(H.at(-0.06, 0.12, sd * 0.1));
          ears[i].quaternion.copy(H.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sd * 0.9, 0, 0.6)));
        }
        tines.end();
        bell.position.copy(H.at(0.08, -0.32, 0));
        bell.quaternion.copy(H.q);
      },
    };
  },
};

export const MASTO = {
  FWD: [[0.9, 0.1], [0.9, 0.15], [0.6, 0.1], [0.35, -0.05], [0.25, -0.1], [0.15, -0.1]],
  FWD_R: [[0.7, 0.6, 0.7], [0.85, 0.7, 0.95], [0.85, 0.75, 0.95], [0.7, 0.72, 0.85], [0.52, 0.55, 0.58], [0.46, 0.5, 0.5], [0.42, 0.46, 0.45]],
  TAIL: [[0.3, -0.2], [0.3, -0.35]],
  TAIL_R: [[0.7, 0.6, 0.7], [0.12, 0.12, 0.12], [0.06, 0.06, 0.06]],
  SKULL: [[-0.2, 0.05, 0.45, 0.55, 0.4], [0.15, 0.05, 0.48, 0.55, 0.48], [0.5, -0.1, 0.38, 0.42, 0.42], [0.75, -0.3, 0.25, 0.3, 0.3], [0.85, -0.42, 0.18, 0.18, 0.18]],
  headTilt: -0.6, H: 2.0,
  hind: { L1: 0.95, L2: 0.78, L3: 0.25, at: [0, -0.35, 0.5], ang: 1.5 },
  fore: { L1: 1.0, L2: 0.88, L3: 0.25, at: [2.3, -0.3, 0.55], ang: 1.5 },
  legR: [[0.36, 0.27, 0.23], [0.4, 0.27, 0.23]],
  colors: { back: 0x3a2214, flank: 0x5e3620, belly: 0x2e1c10, stripe: 0x1a1008, foot: 0x2e2620 },
  fur: { shag: 0.9, bump: 3.0 }, claws: false, footY: 0.08, liftH: 0.35, eyeR: 0.045, eyeAt: [0.42, -0.02, 0.36], bands: 0, kind: 'masto',
  makeExtra(scene) {
    const ivory = new THREE.MeshStandardMaterial({ color: 0xe6d9b8, roughness: 0.45, vertexColors: true });
    const tusks = [0, 1].map(() => { const L = makeLoft(9, 10, { mat: ivory, color: () => [0.9, 0.85, 0.72] }); scene.add(L.mesh); return L; });
    const trunk = makeLoft(13, 12, { mat: solid(0xffffff, 0.9, { vertexColors: true }), color: (u) => [0.24 - 0.06 * u, 0.15 - 0.04 * u, 0.09] });
    scene.add(trunk.mesh);
    const ears = [0, 1].map(() => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(0.08, 0.3, 0.24), solid(0x3a2214, 0.95)); scene.add(e); return e; });
    return {
      meshes: [...tusks.map((t) => t.mesh), trunk.mesh, ...ears],
      pose({ H, P }) {
        for (const [i, sd] of [[0, -1], [1, 1]]) {
          // tusks: out of the upper jaw, down and forward, then curving up and in
          const st = [];
          for (let k = 0; k <= 8; k++) {
            const u = k / 8, a = -1.0 + 1.9 * u;
            st.push({ p: H.at(0.55 + 1.5 * Math.sin(u * 1.4) * 0.8, -0.35 + 0.9 * (Math.cos(a) - Math.cos(-1.0)) * 0.6 - 0.5 * u, sd * (0.22 + 0.25 * Math.sin(u * 2.6) - 0.1 * u)), up: H.dir(0, 1, 0), w: 0.08 * (1 - 0.6 * u), t: 0.08 * (1 - 0.6 * u), b: 0.08 * (1 - 0.6 * u) });
          }
          tusks[i].update(st);
          ears[i].position.copy(H.at(-0.1, 0.1, sd * 0.46)); ears[i].quaternion.copy(H.q);
        }
        // the trunk: hanging from the snout, swinging, curling forward at the tip (P.trunk: 0 hanging .. 1 raised)
        const up = P.trunk || 0, sw = P.trunkSwing || 0;
        const st = [];
        for (let k = 0; k <= 12; k++) {
          const u = k / 12, len = 2.0;
          const a = -Math.PI / 2 + u * (0.6 + 2.6 * up) + 0.1;
          st.push({ p: H.at(0.85 + Math.cos(a) * len * u * 0.6 + 0.12 * u, -0.42 + Math.sin(a) * len * u * 0.75, sw * u * u * 0.5), up: H.dir(1, 0, 0), w: 0.17 - 0.11 * u, t: 0.17 - 0.11 * u, b: 0.17 - 0.11 * u });
        }
        trunk.update(st);
      },
    };
  },
};

export const BEAR = {
  FWD: [[0.55, 0.1], [0.5, 0.12], [0.35, 0.06], [0.22, 0.0], [0.18, -0.04], [0.12, -0.04]],
  FWD_R: [[0.38, 0.35, 0.4], [0.42, 0.38, 0.5], [0.42, 0.46, 0.52], [0.36, 0.45, 0.45], [0.27, 0.32, 0.33], [0.23, 0.26, 0.27], [0.2, 0.22, 0.22]],
  TAIL: [[0.15, -0.05], [0.1, -0.1]],
  TAIL_R: [[0.38, 0.35, 0.4], [0.1, 0.1, 0.1], [0.04, 0.04, 0.04]],
  SKULL: [[-0.1, 0, 0.2, 0.2, 0.18], [0.1, 0.0, 0.22, 0.2, 0.2], [0.25, -0.03, 0.15, 0.14, 0.12], [0.38, -0.06, 0.1, 0.1, 0.08], [0.44, -0.08, 0.07, 0.06, 0.06]],
  headTilt: -0.2, H: 1.35,
  hind: { L1: 0.6, L2: 0.58, L3: 0.3, at: [0, -0.15, 0.28], ang: 0.5 },
  fore: { L1: 0.62, L2: 0.62, L3: 0.25, at: [1.55, -0.3, 0.3], ang: 0.9 },
  legR: [[0.23, 0.16, 0.13], [0.27, 0.16, 0.13]],
  colors: { back: 0x4a2e18, flank: 0x8a5a30, belly: 0x5a3a20, stripe: 0x1a1008, foot: 0x2a1c10 },
  fur: { shag: 0.55, bump: 2.2 }, claws: true, clawL: 0.13, clawR: 0.03, clawColor: 0x1a1612, footY: 0.06, liftH: 0.3, eyeR: 0.03, eyeAt: [0.22, 0.08, 0.12], bands: 0, kind: 'bear',
  makeExtra(scene) {
    const jaw = makeJaw(scene, { len: 0.36, w: 0.13, hinge: [0.02, -0.1], teeth: 8, toothL: 0.045, color: 0x4a3020 });
    const ears = [0, 1].map(() => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1, 0.5), solid(0x2e1c10, 0.95)); scene.add(e); return e; });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), solid(0x0c0a08, 0.4)); scene.add(nose);
    return {
      meshes: [...jaw.meshes, ...ears, nose],
      pose({ H, P }) {
        jaw.pose(H, P.jaw || 0);
        for (const [i, sd] of [[0, -1], [1, 1]]) { ears[i].position.copy(H.at(-0.05, 0.18, sd * 0.16)); ears[i].quaternion.copy(H.q); }
        nose.position.copy(H.at(0.45, -0.06, 0));
      },
    };
  },
};

export const CAT = {
  FWD: [[0.45, 0.04], [0.45, 0.05], [0.3, 0.04], [0.18, 0.04], [0.15, 0.03], [0.12, 0.0]],
  FWD_R: [[0.2, 0.2, 0.22], [0.22, 0.2, 0.28], [0.24, 0.25, 0.32], [0.2, 0.24, 0.26], [0.14, 0.16, 0.17], [0.12, 0.13, 0.14], [0.11, 0.11, 0.11]],
  TAIL: [[0.15, -0.05], [0.12, -0.08]],
  TAIL_R: [[0.2, 0.2, 0.22], [0.07, 0.07, 0.07], [0.04, 0.04, 0.04]],
  SKULL: [[-0.07, 0, 0.12, 0.12, 0.1], [0.08, 0.01, 0.13, 0.12, 0.1], [0.2, -0.02, 0.1, 0.09, 0.08], [0.28, -0.04, 0.07, 0.07, 0.06], [0.31, -0.05, 0.05, 0.04, 0.04]],
  headTilt: -0.2, H: 0.95,
  hind: { L1: 0.4, L2: 0.4, L3: 0.25, at: [0, -0.1, 0.15], ang: 1.2 },
  fore: { L1: 0.38, L2: 0.36, L3: 0.12, at: [1.15, -0.2, 0.16], ang: 1.3 },
  legR: [[0.13, 0.09, 0.075], [0.15, 0.08, 0.065]],
  colors: { back: 0x7a5a30, flank: 0xa8844c, belly: 0xd8c8a0, stripe: 0x4a3418, foot: 0x6a5030 },
  fur: { shag: 0.12, bump: 1.0 }, claws: true, clawL: 0.05, clawR: 0.015, clawColor: 0x2a2620, footY: 0.05, liftH: 0.22, eyeR: 0.026, eyeAt: [0.13, 0.05, 0.075],
  eyeGlow: 0xb8ff70, eyeGlowK: 6, bands: 0, kind: 'cat',
  makeExtra(scene) {
    const jaw = makeJaw(scene, { len: 0.24, w: 0.09, hinge: [0.0, -0.08], teeth: 6, toothL: 0.02, color: 0xc0a070 });
    const sabres = makeSpikes(scene, 2, 0xf2ead8, 0.3);
    const ears = [0, 1].map(() => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 6).translate(0, 0.035, 0), solid(0x5a4020, 0.9)); scene.add(e); return e; });
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8).scale(1.1, 0.8, 1.3), solid(0xe0d0b0, 0.9)); scene.add(muzzle);
    return {
      meshes: [...jaw.meshes, sabres.mesh, ...ears, muzzle],
      pose({ H, P }) {
        jaw.pose(H, P.jaw || 0, false);
        sabres.begin();
        for (const sd of [-1, 1]) sabres.add(H.at(0.24, -0.06, sd * 0.045), H.dir(-0.18, -1, 0), 0.18, 0.016);
        sabres.end();
        for (const [i, sd] of [[0, -1], [1, 1]]) { ears[i].position.copy(H.at(-0.02, 0.11, sd * 0.08)); ears[i].quaternion.copy(H.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sd * 0.4, 0, 0.3))); }
        muzzle.position.copy(H.at(0.26, -0.03, 0)); muzzle.quaternion.copy(H.q);
      },
    };
  },
};

// the brachiosaur, everything 1.35x
function scaleSpec(S, k) {
  const sc = (a) => a.map((r) => r.map((x) => x * k));
  return {
    ...S, FWD: sc(S.FWD), FWD_R: sc(S.FWD_R), TAIL: sc(S.TAIL), TAIL_R: sc(S.TAIL_R), SKULL: sc(S.SKULL), H: S.H * k,
    hind: { ...S.hind, L1: S.hind.L1 * k, L2: S.hind.L2 * k, L3: S.hind.L3 * k, at: S.hind.at.map((x) => x * k) },
    fore: { ...S.fore, L1: S.fore.L1 * k, L2: S.fore.L2 * k, L3: S.fore.L3 * k, at: S.fore.at.map((x) => x * k) },
    legR: [[0.3 * 1.7 * k, 0.2 * 1.7 * k, 0.16 * 1.7 * k], [0.42 * 1.7 * k, 0.24 * 1.7 * k, 0.17 * 1.7 * k]],
    eyeR: 0.09, clawL: 0.2, clawR: 0.08,
  };
}
export const SAURO = { ...scaleSpec(BRACH, 1.35), colors: { back: 0x5a5448, flank: 0x8a8070, belly: 0xbcb2a0, stripe: 0x3e3a32, foot: 0x4a443a }, bands: 7 };
