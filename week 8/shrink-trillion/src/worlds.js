// The worlds and their shots. Each world is a group in real units placed round a pivot and scaled by S (how many
// times smaller you are) x its unit, so it grows round you as you shrink; frame(v, s) poses what moves in it and
// returns the shot: the camera, how you stand, and the look (sky, light, fog).
import * as THREE from 'three';
import { makePark } from './park.js';
import { makeGrass } from './grass.js';
import { makeWeave, HAIR_X } from './weave.js';
import { makeBlood } from './blood.js';
import { makeBact, makeVirus } from './micro.js';
import { makeTiny } from './dna.js';
import { T_REVEAL, T_DIVE, T_WHITE } from './timeline.js';
import { keys, smooth, lerp, clamp, DEG } from './util.js';
const lerp3 = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// eased keys on vectors: list of [t, [x, y, z]]
export const kv = (list, t, out = new THREE.Vector3()) => out.set(...[0, 1, 2].map((i) => keys(list.map(([a, p]) => [a, p[i]]), t)));
const kf = (list, t) => keys(list, t);
const kfLog = (list, t) => Math.exp(keys(list.map(([a, f]) => [a, Math.log(f)]), t));

// over your shoulder: the camera behind you (opposite 'look'), a little to one side, aimed between you and 'look'
function ots(look, { back = 3.4, side = 0.9, up = 1.25, w = 0.75, tgtY = 2.5 } = {}) {
  const dir = new THREE.Vector3(look.x, 0, look.z).normalize();
  const sd = new THREE.Vector3(dir.z, 0, -dir.x);
  const pos = dir.clone().multiplyScalar(-back).addScaledVector(sd, side).add(new THREE.Vector3(0, up, 0));
  const tgt = new THREE.Vector3(0, 1.5, 0).lerp(look, w); tgt.y = tgtY;
  return { pos, tgt, yaw: Math.atan2(dir.x, dir.z) };
}

const SUNNY = {
  top: [0.16, 0.4, 0.88], hor: [0.72, 0.85, 0.98], low: [0.32, 0.46, 0.22], cloud: 0.65, sunDir: [-0.38, 0.72, -0.58], sunDisc: 1.0,
  sunCol: [1, 0.95, 0.86], sunI: 3.1, hemiSky: [0.72, 0.84, 1.0], hemiGnd: [0.45, 0.52, 0.3], hemiI: 1.25, fog: [0.72, 0.82, 0.95], exp: 0.95, fillI: 0.3,
};

export function makeWorlds(scene, ctx) {
  const list = [];
  const by = {};
  const add = (k, w) => { w.k = k; list.push(w); by[k] = w; };

  // ---------------- the park ----------------
  {
    const P = makePark(scene);
    const CAM = [[-3, [1.05, 0.5, -3.4]], [0, [1.0, 0.45, -3.3]], [3.0, [0.8, 0.45, -3.0]], [5.6, [0.55, 0.4, -2.7]]];
    const TGT = [[-3, [-0.3, 2.6, 1.5]], [0, [-0.3, 2.65, 1.5]], [3.0, [-0.1, 3.0, 1.2]], [4.6, [0.0, 4.2, 3.0]], [5.6, [0.0, 6.5, 5.6]]];
    add('park', {
      group: P.group,
      frame(v, s) {
        const S = s.S;
        P.group.scale.setScalar(S);
        P.group.position.set(0, 0, 0);
        P.group.updateMatrixWorld(true);
        P.frame(v, s);
        const pos = kv(CAM, v), tgt = kv(TGT, v);
        const fov = kf([[0, 62], [3, 64], [5.6, 66]], v);
        return {
          yaw: Math.PI + kf([[0, 0.5], [3, 0.35], [5.6, 0.2]], v),
          pose: { head: [kf([[0, -0.45], [3, -0.6], [5.6, -0.75]], v), kf([[0, -0.5], [3, -0.3], [5.6, -0.1]], v)], armsOut: 0.3 + 0.06 * Math.sin(v * 3) },
          cam: { pos, tgt, fov, near: 0.1, far: 80000 },
          look: { ...SUNNY, shadowExt: clamp(5 + S * 0.12, 6, 40), fogD: 0.0000025 * Math.min(S, 300) / 300 },
        };
      },
    });
  }

  // ---------------- the lawn at ant size (mm) ----------------
  {
    const Gr = makeGrass(scene);
    const tg = new THREE.Vector3(), yh = new THREE.Vector3(0, 1.5, 0), pos = new THREE.Vector3();
    add('grass', {
      group: Gr.group,
      frame(v, s) {
        const S = s.S, u = S * 1e-3;
        Gr.group.scale.setScalar(u);
        Gr.frame(v, s);
        // over your shoulder at the ant (in your metres); at the end, up the tall blade beside you
        const ah = Gr.antHead.clone().multiplyScalar(u);
        const am = Gr.antMid.clone().multiplyScalar(u);
        const hero = Gr.group.userData.hero.position.clone().multiplyScalar(u);
        const up = smooth(10.3, 12.0, v);
        const look = am.clone().lerp(ah, 0.35).lerp(hero.clone().setY(0), up);
        const dir = new THREE.Vector3(look.x, 0, look.z).normalize();
        const side = new THREE.Vector3(dir.z, 0, -dir.x);
        pos.copy(dir).multiplyScalar(-lerp(lerp(3.4, 4.6, smooth(7.5, 9.3, v)), 4.0, up)).addScaledVector(side, 0.9).add(new THREE.Vector3(0, lerp(1.25, 0.5, up), 0));
        tg.copy(yh).lerp(look, lerp(0.8, 0.5, up)); tg.y = lerp(lerp(2.2, 3.4, smooth(6, 9, v)), 9, up);
        const yawYou = Math.atan2(look.x, look.z);
        return {
          yaw: yawYou,
          pose: { head: [-0.2 - 0.15 * smooth(8.5, 9.5, v) - 0.45 * smooth(10.6, 11.6, v), 0], armsOut: 0.2 + 0.25 * smooth(8.6, 9.3, v) * (1 - smooth(10.5, 11.5, v)) },
          cam: { pos: pos.clone(), tgt: tg.clone(), fov: kf([[5.6, 58], [9, 56], [10.4, 58], [12.4, 66]], v), near: 0.1, far: 30000 },
          look: { ...SUNNY, sunDir: [-0.35, 0.8, -0.5], cloud: 0.5, hor: [0.78, 0.9, 0.98], low: [0.35, 0.4, 0.2], sunI: 3.3, hemiSky: [0.7, 0.85, 1.0], hemiGnd: [0.4, 0.45, 0.22],
            fog: [0.78, 0.86, 0.72], fogD: 3.0 / S, shadowExt: 30, exp: 1.12, hemiI: 1.5 },
        };
      },
    });
  }

  // ---------------- inside the blanket's weave (µm) ----------------
  {
    const Wv = makeWeave(scene);
    add('weave', {
      group: Wv.group,
      frame(v, s) {
        const S = s.S, u = S * 1e-6;
        Wv.group.scale.setScalar(u);
        Wv.frame(v, s);
        const m = Wv.miteAt(v).multiplyScalar(u);
        const hairPt = new THREE.Vector3(HAIR_X * u, 0, 700 * u);
        const k = smooth(16.0, 17.4, v);
        const look = m.clone().lerp(hairPt, k);
        const o = ots(look, { back: lerp(3.6, 3.4, k), side: lerp(-1.0, 0.6, k), up: lerp(1.35, 1.5, k), w: lerp(0.7, 0.3, k), tgtY: lerp(lerp(2.0, 2.7, smooth(13, 15.5, v)), 1.4, k) });
        return {
          yaw: o.yaw - 0.25 * k,
          pose: { head: [-0.2 - 0.2 * smooth(13.5, 15, v) * (1 - k), 0.4 * k], armsOut: 0.22 + 0.2 * smooth(14.5, 15.5, v) * (1 - k) },
          cam: { pos: o.pos, tgt: o.tgt, fov: kf([[12.4, 56], [16, 52], [19.3, 58]], v), near: 0.1, far: 30000 },
          look: { ...SUNNY, sunDir: [0.45, 0.75, -0.45], cloud: 0.55, hor: [0.8, 0.88, 0.98], low: [0.12, 0.18, 0.08], sunI: 3.4, hemiSky: [0.75, 0.85, 1.0], hemiGnd: [0.5, 0.35, 0.35],
            hemiI: 1.4, fog: [0.82, 0.86, 0.95], fogD: 120 / S, shadowExt: 25, exp: 1.0, horY: -0.05 },
        };
      },
    });
  }

  // ---------------- inside a blood vessel (µm) ----------------
  {
    const Bl = makeBlood(scene);
    add('blood', {
      group: Bl.group,
      frame(v, s) {
        const S = s.S, u = S * 1e-6;
        Bl.group.scale.setScalar(u);
        Bl.frame(v);
        const h = Bl.hero.position.clone().multiplyScalar(u);
        const o = ots(h, { back: 4.6, side: 1.9, up: 1.35, w: 0.55, tgtY: lerp(1.6, 2.4, smooth(19.3, 23.6, v)) });
        return {
          yaw: o.yaw - 0.2,
          pose: { head: [-0.1, 0.2], armsOut: 0.25 },
          cam: { pos: o.pos, tgt: o.tgt, fov: kf([[19.3, 56], [23.6, 60]], v), near: 0.08, far: 30000 },
          look: { top: [0.9, 0.38, 0.32], hor: [1.0, 0.7, 0.5], low: [0.7, 0.28, 0.26], cloud: 0, blot: 0.5, blotC: [1.0, 0.85, 0.62], sunDir: [-0.3, 0.85, -0.4], sunDisc: 0,
            sunCol: [1, 0.88, 0.78], sunI: 2.6, hemiSky: [1.0, 0.78, 0.66], hemiGnd: [0.85, 0.45, 0.4], hemiI: 1.3, fog: [0.98, 0.66, 0.5], fogD: 6000 / S, shadowExt: 12, exp: 1.0, fillI: 0.4 },
        };
      },
    });
  }
  // ---------------- bacteria (µm) ----------------
  {
    const Ba = makeBact(scene);
    const hero = new THREE.Vector3(-1.05, 0.42, 0.5);
    add('bact', {
      group: Ba.group,
      frame(v, s) {
        const S = s.S, u = S * 1e-6;
        Ba.group.scale.setScalar(u);
        Ba.frame(v);
        const h = hero.clone().multiplyScalar(u).add(new THREE.Vector3(0, 0, 0.6 * u));
        const o = ots(h, { back: 4.8, side: 2.0, up: 1.5, w: 0.5, tgtY: lerp(1.2, 2.2, smooth(24, 27.4, v)) });
        return {
          yaw: o.yaw,
          pose: { head: [0.15, 0.25], armsOut: 0.3 },
          cam: { pos: o.pos, tgt: o.tgt, fov: kf([[23.6, 58], [27.4, 60]], v), near: 0.08, far: 30000 },
          look: { top: [0.18, 0.55, 0.72], hor: [0.62, 0.92, 0.88], low: [0.35, 0.55, 0.5], cloud: 0, blot: 0.4, blotC: [0.85, 1.0, 0.95], sunDir: [0.4, 0.8, -0.45], sunDisc: 0,
            sunCol: [1, 0.97, 0.9], sunI: 2.7, hemiSky: [0.8, 1.0, 1.0], hemiGnd: [0.55, 0.62, 0.5], hemiI: 1.3, fog: [0.58, 0.85, 0.84], fogD: 50000 / S, shadowExt: 12, exp: 1.0, fillI: 0.4 },
        };
      },
    });
  }
  // ---------------- viruses, then smaller than light (nm) ----------------
  {
    const Vi = makeVirus(scene);
    add('virus', {
      group: Vi.group,
      frame(v, s) {
        const S = s.S, u = S * 1e-9;
        Vi.group.scale.setScalar(u);
        Vi.frame(v, s);
        const h = Vi.V[0].g.position.clone().multiplyScalar(u);
        const waves = new THREE.Vector3(-60, 0, 680).multiplyScalar(u);
        const k = smooth(30.2, 31.2, v);
        const o = ots(h.clone().lerp(waves, k * 0.6), { back: lerp(4.6, 4.4, k), side: lerp(1.9, 1.2, k), up: 1.4, w: lerp(0.5, 0.45, k), tgtY: lerp(1.3, 4.5, k) });
        return {
          yaw: o.yaw,
          pose: { head: [-0.05 - 0.35 * k, 0.15], armsOut: 0.3 + 0.2 * k },
          cam: { pos: o.pos, tgt: o.tgt, fov: kf([[27.4, 56], [30.4, 58], [33.2, 64]], v), near: 0.08, far: 30000 },
          look: { top: [0.4, 0.26, 0.66], hor: [0.85, 0.62, 0.92], low: [0.32, 0.42, 0.48], cloud: 0, blot: 0.45, blotC: [0.98, 0.8, 1.0], sunDir: [-0.4, 0.8, -0.4], sunDisc: 0,
            sunCol: [1, 0.95, 1.0], sunI: 2.6, hemiSky: [0.9, 0.8, 1.0], hemiGnd: [0.45, 0.6, 0.55], hemiI: 1.3, fog: [0.72, 0.58, 0.88], fogD: 6.0e5 / S, shadowExt: 12, exp: 1.0, fillI: 0.45 },
        };
      },
    });
  }
  // ---------------- DNA, then inside one of its atoms ----------------
  {
    const Ti = makeTiny(scene);
    const P = new THREE.Vector3(0.28, 1.5, 0.95);
    const far = P.clone().add(new THREE.Vector3(-60, 300, -350));
    const tmp = new THREE.Vector3();
    Ti.stad.position.copy(P);
    Ti.stad.rotation.y = Math.PI / 2 + Math.atan2(-60, -350);
    add('dna', {
      group: Ti.group,
      frame(v, s) {
        const S = s.S;
        Ti.frame(v, S, P);
        const look = P.clone().multiplyScalar(1.7);
        const k1 = smooth(36.4, 38.5, v);
        // over your shoulder at the DNA; closer as the atom swells; the pull-back; the dive to the nucleus
        const near = ots(look, { back: lerp(5.2, 2.9, k1), side: lerp(-1.8, -0.8, k1), up: lerp(1.9, 1.6, k1), w: lerp(0.45, 0.6, k1), tgtY: lerp(2.0, 1.55, k1) });
        let pos = near.pos.clone(), tgt = near.tgt.clone(), fov = kf([[33.2, 58], [36.5, 56], [38.5, 52]], v);
        const pb = smooth(T_REVEAL[0] - 0.2, T_REVEAL[0] + 1.5, v), back = smooth(T_DIVE, T_DIVE + 1.6, v);
        const out = pb * (1 - back);
        if (out > 0) {
          const e = (Math.pow(110, out) - 1) / 109;      // the distance grows steadily (x 100)
          pos.lerp(far, e);
          tgt.lerp(P.clone().add(tmp.set(0, -25, 0)), Math.min(1, out * out * 1.6));
          fov = lerp(fov, 50, out);
        }
        const dv = smooth(T_DIVE + 1.2, T_WHITE - 0.75, v);
        if (dv > 0) {
          // round your side (not through you) to just in front of the nucleus
          const a = near.pos.clone().add(new THREE.Vector3(1.6, 0.4, 0.4));
          const end = P.clone().add(new THREE.Vector3(0.05, 0.02, -0.07));
          const k = Math.pow(dv, 0.75);
          pos = a.clone().lerp(end, k);
          pos.x += 0.9 * Math.sin(Math.PI * k) * (1 - k);
          tgt = P.clone().lerp(new THREE.Vector3(0, 1.4, 0), 0.35 * (1 - k));
          fov = lerp(52, 40, dv);
        }
        Ti.hazeU.uI.value *= 1 + 2.2 * out;
        // the glow round the nucleus: a point you can always see; it swells at the end
        const dist = pos.distanceTo(P);
        const sw = s.swell;
        Ti.glow.position.copy(P);
        Ti.glow.scale.setScalar(Math.max(0.02, dist * 0.045) * (1 + 1500 * sw * sw * sw));
        Ti.glow.material.opacity = smooth(37.3, 38.4, v) * (1 + 1.5 * sw);
        Ti.glow.visible = v > 37.2;
        Ti.nucLight.position.copy(P); Ti.nucLight.intensity = 2.5 * smooth(37.3, 38.5, v) * (1 + 6 * sw);
        // the stadium outline
        const so = smooth(T_REVEAL[0] + 0.1, T_REVEAL[0] + 1.2, v) * (1 - smooth(T_DIVE + 0.3, T_DIVE + 1.3, v));
        Ti.stad.visible = so > 0.01;
        Ti.pitchM.uniforms.uO.value = so; Ti.lineM.opacity = 0.9 * so; Ti.standM.opacity = 0.22 * so;
        const fl = smooth(36.9, 38.5, v);
        return {
          yaw: Math.atan2(P.x, P.z) - 0.15,
          pose: { float: 1, head: [lerp(-0.15, 0.05, fl), 0.1], reach: 0.55 * smooth(34.5, 36, v) * (1 - fl * 0.4), reachDir: new THREE.Vector3(0.1, 0.25, 1).normalize(), curl: 0.3 },
          cam: { pos, tgt, fov, near: dv > 0.6 ? 0.002 : 0.05, far: 30000 },
          look: { top: lerp3([0.08, 0.1, 0.32], [0.05, 0.05, 0.2], fl), hor: lerp3([0.28, 0.24, 0.6], [0.16, 0.12, 0.4], fl), low: [0.1, 0.06, 0.25], cloud: 0, blot: 0.35, blotC: [0.42, 0.36, 0.8],
            sunDir: [-0.35, 0.6, -0.7], sunDisc: 0, sunCol: [1, 1, 1], sunI: lerp(2.8, 1.2, fl), hemiSky: [0.65, 0.65, 1.0], hemiGnd: [0.3, 0.2, 0.5], hemiI: lerp(1.1, 0.7, fl),
            fog: [0.2, 0.18, 0.45], fogD: 0, shadows: fl < 0.5, shadowExt: 6, exp: 1.0, fillI: 0.5, bloom: 0.35 + 0.6 * sw, bloomT: 1.2 - 0.6 * sw },
        };
      },
    });
  }
  return { all: list, get: (k) => by[k] };
}
