// One continuous world. Every level is a group built at real size in its own unit (park m, lawn mm, drop and bacteria
// µm, virus and cell nm, atom pm) and placed in ONE real coordinate frame (metres, origin = your feet at frame 0). It is
// drawn at (real - anchor) x S in your metres: you stay at the scene origin, 1.7 m tall, and the world grows round you.
// The anchor is your feet (park, lawn, inside the drop), walks you up to the bacterium, sinks you through its wall to a
// point inside, then becomes the atom's nucleus (pinned in front of you). Nothing is cut: levels show while they are
// neither too big (beyond the fog) nor too small (under a pixel).
import * as THREE from 'three';
import { makePark } from './park.js';
import { makeGrass } from './grass.js';
import { makeGround } from './ground.js';
import { makeDrop, dropAt } from './drop.js';
import { makeBact, makePhages, BAC_C } from './micro.js';
import { makeCell, AXIS } from './cell.js';
import { makeTiny } from './dna.js';
import { T_DROP, T_SINK, T_REVEAL, T_DIVE, T_WHITE } from './timeline.js';
import { keys, smooth, lerp, clamp } from './util.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const kv = (list, t, out = new THREE.Vector3()) => out.set(...[0, 1, 2].map((i) => keys(list.map(([a, p]) => [a, p[i]]), t)));
const kf = (list, t) => keys(list, t);

// ---- the anchor path (real metres) ----
const WALK = V3(-0.08e-6, 0, 0.05e-6);            // you walk up to the bacterium's wall
export const X_IN = V3(-0.39e-6, 0.045e-6, 0.3e-6);   // just inside its wall
export const P = V3(0.28, 1.5, 0.95);             // where the atom's nucleus ends up, in your metres (in front of your chest)
export const N_R = X_IN.clone().addScaledVector(P, 1e-9);   // the nucleus (real): at 1 billion x it sits at P
function anchorAt(v, S, out = new THREE.Vector3()) {
  const a = smooth(19.0, 24.0, v), c = smooth(T_SINK[0], T_SINK[1], v), d = smooth(29.6, 32.4, v);
  out.set(0, 0, 0).lerp(WALK, a).lerp(X_IN, c);
  const D = N_R.clone().addScaledVector(P, -1 / S);
  return out.lerp(D, d);
}

// ---- the looks (sky, light, fog) along the way, blended in time ----
const SUNNY = { top: [0.16, 0.4, 0.88], hor: [0.72, 0.85, 0.98], low: [0.32, 0.46, 0.22], cloud: 0.65, blot: 0, blotC: [1, 1, 1], sunDir: [-0.38, 0.72, -0.58], sunDisc: 1.0,
  sunCol: [1, 0.95, 0.86], sunI: 3.1, hemiSky: [0.72, 0.84, 1.0], hemiGnd: [0.45, 0.52, 0.3], hemiI: 1.25, fog: [0.72, 0.82, 0.95], fogReal: 1500, exp: 0.95, fillI: 0.3, bloom: 0.25, bloomT: 1.4, shadowExt: 8 };
const LAWN = { ...SUNNY, cloud: 0.5, hor: [0.78, 0.9, 0.98], low: [0.35, 0.4, 0.2], sunI: 3.3, hemiSky: [0.7, 0.85, 1.0], hemiGnd: [0.4, 0.45, 0.22], hemiI: 1.5, fog: [0.78, 0.86, 0.72], fogReal: 0.33, exp: 1.1, shadowExt: 24 };
const DROP = { ...LAWN, top: [0.5, 0.82, 0.95], hor: [0.78, 0.96, 0.98], low: [0.45, 0.62, 0.6], cloud: 0, blot: 0.3, blotC: [0.9, 1.0, 1.0], sunDisc: 0.6, sunCol: [0.92, 1.0, 1.0],
  sunI: 3.0, hemiSky: [0.75, 0.95, 1.0], hemiGnd: [0.45, 0.6, 0.55], hemiI: 1.5, fog: [0.66, 0.88, 0.9], fogReal: 6e-4, exp: 1.05, shadowExt: 20 };
const DROP2 = { ...DROP, top: [0.3, 0.66, 0.86], hor: [0.62, 0.88, 0.92], low: [0.35, 0.52, 0.56], blot: 0.45, fog: [0.55, 0.8, 0.86], fogReal: 6e-6, sunDisc: 0, shadowExt: 16 };
const CELL = { ...DROP2, top: [0.78, 0.48, 0.38], hor: [0.98, 0.76, 0.56], low: [0.62, 0.36, 0.3], blot: 0.5, blotC: [1.0, 0.88, 0.7], sunDir: [-0.3, 0.85, -0.45], sunCol: [1, 0.9, 0.8],
  sunI: 2.6, hemiSky: [1.0, 0.82, 0.68], hemiGnd: [0.75, 0.48, 0.42], hemiI: 1.4, fog: [0.95, 0.72, 0.55], fogReal: 1.1e-7, exp: 1.0, fillI: 0.45, shadowExt: 12 };
const DNA = { ...CELL, top: [0.1, 0.12, 0.38], hor: [0.32, 0.28, 0.66], low: [0.12, 0.08, 0.3], blot: 0.35, blotC: [0.45, 0.38, 0.85], sunDir: [-0.35, 0.6, -0.7], sunCol: [1, 1, 1],
  sunI: 2.8, hemiSky: [0.7, 0.7, 1.0], hemiGnd: [0.35, 0.25, 0.55], hemiI: 1.15, fog: [0.24, 0.22, 0.55], fogReal: 3e-8, exp: 1.0, fillI: 0.5, bloom: 0.3, bloomT: 1.3, shadowExt: 8 };
const ATOM = { ...DNA, top: [0.05, 0.05, 0.2], hor: [0.16, 0.12, 0.4], low: [0.1, 0.06, 0.25], sunI: 1.2, hemiI: 0.7, fogReal: 0 };
const LOOKS = [[0, SUNNY], [4.2, SUNNY], [6.2, LAWN], [T_DROP[1] - 0.1, LAWN], [T_DROP[1] + 0.6, DROP], [16.5, DROP], [19.5, DROP2], [T_SINK[0] + 0.6, DROP2], [T_SINK[1] - 0.2, CELL],
  [29.0, CELL], [32.4, DNA], [36.0, DNA], [37.8, ATOM]];
function lookAt(v, S) {
  let i = 0;
  while (i < LOOKS.length - 1 && v > LOOKS[i + 1][0]) i++;
  const A = LOOKS[i][1], B = (LOOKS[i + 1] || LOOKS[i])[1];
  const k = i < LOOKS.length - 1 ? smooth(LOOKS[i][0], LOOKS[i + 1][0], v) : 0;
  const L = {};
  for (const n of Object.keys(A)) {
    const a = A[n], b = B[n];
    if (Array.isArray(a)) L[n] = a.map((x, j) => x + (b[j] - x) * k);
    else if (n === 'fogReal') L[n] = a > 0 && b > 0 ? Math.exp(lerp(Math.log(a), Math.log(b), k)) : (b > 0 ? b : a > 0 ? a * (1 - k) + 1e-30 : 0);
    else L[n] = a + (b - a) * k;
  }
  // (no fog once you're inside the atom: blend the density to zero)
  const fogK = B.fogReal === 0 ? 1 - k : 1;
  L.fogD = L.fogReal > 0 ? fogK / (L.fogReal * S) : 0;
  L.shadows = v < 37;
  return L;
}

// over your shoulder: the camera behind you (opposite 'look'), to one side, aimed between you and 'look'
function ots(look, { back = 3.4, side = 0.9, up = 1.25, w = 0.75, tgtY = 2.5 } = {}) {
  const dir = new THREE.Vector3(look.x, 0, look.z);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const sd = new THREE.Vector3(dir.z, 0, -dir.x);
  const pos = dir.clone().multiplyScalar(-back).addScaledVector(sd, side).add(new THREE.Vector3(0, up, 0));
  const tgt = new THREE.Vector3(0, 1.5, 0).lerp(look, w); tgt.y = tgtY;
  return { pos, tgt, yaw: Math.atan2(dir.x, dir.z) };
}

export function makeWorlds(scene) {
  const park = makePark(scene);
  const lawn = makeGrass(scene);
  const ground = makeGround(scene);
  const drop = makeDrop(scene);
  const bact = makeBact(scene);
  const phages = makePhages(scene);
  // keep the cell's proteins off you, the camera behind you, and the strand in front of you (nm, from X_IN)
  const seg = (p, a, b) => { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  const PATH0 = V3(0, 0, 0), PATH1 = WALK.clone().sub(X_IN).multiplyScalar(1e9);
  const keepOut = (p, s) => {
    // only inside the bacterium (µm: its axis runs along z through BAC_C)
    const ax = X_IN.x * 1e6 + p.x / 1000, ay = X_IN.y * 1e6 + p.y / 1000, az = X_IN.z * 1e6 + p.z / 1000;
    if (Math.hypot(ax - BAC_C.x, ay - BAC_C.y) > 0.36 - s / 1000 || Math.abs(az - BAC_C.z) > 0.9) return true;
    return (Math.abs(p.x) < 18 + s && p.y > -14 - s && p.y < 22 + s && p.z > -70 - s && p.z < 9 + s)
      || (Math.hypot(p.x - AXIS.x, p.z - AXIS.z) < 16 + s && Math.abs(p.y) < 40)
      || seg(p, PATH0, PATH1) < 60 + s || seg(p.clone().add(V3(0, 0, 0)), PATH1, PATH1.clone().add(V3(0, 10, -60))) < 50 + s;
  };
  const cell = makeCell(scene, keepOut);
  const tiny = makeTiny(scene);

  const Pr = new THREE.Vector3();
  let curS = 1;
  const sceneOf = (r, out = new THREE.Vector3()) => out.copy(r).sub(Pr).multiplyScalar(curS);
  const place = (g, origin, unit) => { sceneOf(origin, g.position); g.scale.setScalar(curS * unit); };
  const ORIGIN = V3(0, 0, 0);

  // the park camera (frame 0 as before: low in front of you, looking up at the dog and your friend)
  const PCAM = [[-3, [1.05, 0.5, -3.4]], [0, [1.0, 0.45, -3.3]], [3.0, [0.8, 0.45, -3.0]], [4.8, [0.6, 0.45, -2.8]]];
  const PTGT = [[-3, [-0.3, 2.6, 1.5]], [0, [-0.3, 2.65, 1.5]], [3.0, [-0.1, 3.0, 1.2]], [4.8, [0.0, 4.4, 3.2]]];
  // the over-the-shoulder settings along the way
  const OTS = {
    back: [[4.6, 3.6], [8.4, 4.3], [10.4, 4.6], [12, 4.4], [17, 4.6], [20.4, 5.6], [23.4, 6.0], [24.4, 4.6], [27.6, 4.4], [30.5, 5.0], [34, 4.4], [36.4, 3.6], [38.5, 2.8]],
    side: [[4.6, 0.9], [8.4, 1.1], [12, 1.4], [20.4, 1.6], [24.4, 1.0], [27.6, -1.2], [30.5, -1.6], [36.4, -1.0], [38.5, -0.6]],
    up: [[4.6, 1.3], [8.4, 1.1], [10.4, 0.9], [12, 1.4], [20.4, 1.2], [24.4, 1.5], [27.6, 1.7], [30.5, 1.9], [38.5, 1.6]],
    w: [[4.6, 0.7], [8.4, 0.55], [10.4, 0.5], [12, 0.5], [20.4, 0.5], [24.4, 0.5], [30.5, 0.45], [36.4, 0.6]],
    tgtY: [[4.6, 2.6], [7.6, 3.4], [8.6, 5.0], [10.0, 4.0], [11.2, 3.0], [12, 2.6], [17, 2.4], [20.4, 3.6], [22.5, 4.2], [24.4, 2.2], [27.6, 2.0], [30.5, 2.0], [36.4, 1.6]],
    fov: [[4.6, 64], [6.5, 58], [8.4, 60], [10.4, 62], [12, 58], [20.4, 58], [24.4, 60], [27.6, 58], [30.5, 58], [36.5, 56], [38.5, 52]],
  };
  const otsAt = (v) => Object.fromEntries(Object.entries(OTS).map(([k, l]) => [k, kf(l, v)]));

  return {
    tiny,
    frame(v, s) {
      const S = s.S, lS = s.lS;
      curS = S;
      anchorAt(v, S, Pr);
      // ---------- place every level ----------
      place(park.group, ORIGIN, 1);
      place(lawn.group, ORIGIN, 1e-3);
      place(drop.group, ORIGIN, 1e-6);
      place(bact.group, ORIGIN, 1e-6);
      for (const o of phages.list) { place(o.G, o.sp.p.clone().multiplyScalar(1e-6), 1e-9); o.G.visible = lS > 6.0 && lS < 9.0; }
      place(cell.group, X_IN, 1e-9);
      park.group.visible = lS < 3.7;
      lawn.group.visible = lS < 5.6;
      drop.group.visible = lS > 2.5 && lS < 8.0;
      drop.water.visible = lS < 7.7;
      bact.group.visible = lS > 4.4 && lS < 8.85;
      cell.group.visible = lS > 6.8 && lS < 9.92;
      park.group.updateMatrixWorld(true);
      if (park.group.visible) park.frame(v, s);
      if (lawn.group.visible) lawn.frame(v, s);
      const D = drop.frame(v, S);
      if (bact.group.visible) bact.frame(v);
      phages.frame(v);
      if (cell.group.visible) cell.frame(v, 1 - smooth(9.45, 9.9, lS));
      const Pn = sceneOf(N_R);
      tiny.group.visible = lS > 7.6;
      tiny.frame(v, S, Pn);
      // the ground: real ground level, under you until you sink into the bacterium
      ground.mesh.visible = lS < 8.7;
      ground.frame(v, S, -Pr.y * S, 0.55 * D.inside * (1 - smooth(T_SINK[0], T_SINK[1], v)), 0.6 * D.inside);

      // ---------- what the camera looks at (scene positions), blended ----------
      const antMid = lawn.antMid ? sceneOf(lawn.antMid.clone().multiplyScalar(1e-3)) : V3(0, 1, 8);
      const dropC = sceneOf(dropAt(v).multiplyScalar(1e-6));
      const para = sceneOf(drop.paraAt(v).multiplyScalar(1e-6));
      const bacC = sceneOf(BAC_C.clone().multiplyScalar(1e-6));
      const ph0 = phages.list[0];
      const phHead = sceneOf(ph0.sp.p.clone().multiplyScalar(1e-6).addScaledVector(ph0.sp.n, 90e-9));
      const inside = sceneOf(X_IN).add(V3(0.6, 1.0, 4));
      const strand = sceneOf(X_IN.clone().add(V3(AXIS.x, 3, AXIS.z).multiplyScalar(1e-9)));
      const dnaLook = Pn.clone().multiplyScalar(1.7);
      const SUBJ = [
        [4.0, 8.4, antMid],
        [8.4, 10.5, dropC],
        [10.5, 12.3, V3(0.4, 2.5, 6)],
        [12.3, 17.0, para],
        [17.0, 20.3, V3(0.5, 2.2, 12)],
        [20.3, 25.0, phHead],
        [25.0, 27.6, inside],
        [27.6, 30.2, strand],
        [30.2, 99, dnaLook],
      ];
      let wsum = 0;
      const look = V3(0, 0, 0);
      for (const [a, b, p] of SUBJ) {
        const w = smooth(a - 0.7, a + 0.7, v) * (1 - smooth(b - 0.7, b + 0.7, v));
        if (w > 0) { look.addScaledVector(p, w); wsum += w; }
      }
      if (wsum > 0) look.multiplyScalar(1 / wsum); else look.set(0, 1.5, 6);
      const O = otsAt(v);
      const o = ots(look, O);
      let pos = o.pos, tgt = o.tgt, fov = O.fov;
      // frame 0: the park camera, easing into the over-the-shoulder one
      const pk = smooth(4.4, 6.4, v);
      if (pk < 1) { pos = kv(PCAM, v).lerp(pos, pk); tgt = kv(PTGT, v).lerp(tgt, pk); fov = lerp(kf([[0, 62], [3, 64], [4.8, 66]], v), fov, pk); }
      // the end: closer as the atom swells, the pull-back (the stadium), the dive to the nucleus
      s.dv = 0;
      if (v > 36) {
        const far = Pn.clone().add(V3(-60, 300, -350));
        const pb = smooth(T_REVEAL[0] - 0.2, T_REVEAL[0] + 1.5, v), back = smooth(T_DIVE, T_DIVE + 1.6, v);
        const out = pb * (1 - back);
        if (out > 0) {
          const e = (Math.pow(110, out) - 1) / 109;
          pos = pos.clone().lerp(far, e);
          tgt = tgt.clone().lerp(Pn.clone().add(V3(0, -25, 0)), Math.min(1, out * out * 1.6));
          fov = lerp(fov, 50, out);
        }
        const dv = smooth(T_DIVE + 1.2, T_WHITE - 0.75, v);
        if (dv > 0) {
          const a = o.pos.clone().add(V3(1.6, 0.4, 0.4));
          const end = Pn.clone().add(V3(0.05, 0.02, -0.07));
          const k = Math.pow(dv, 0.75);
          pos = a.clone().lerp(end, k);
          pos.x += 0.9 * Math.sin(Math.PI * k) * (1 - k);
          tgt = Pn.clone().lerp(V3(0, 1.4, 0), 0.35 * (1 - k));
          fov = lerp(52, 40, dv);
        }
        s.dv = dv;
        tiny.hazeU.uI.value *= 1 + 2.2 * out;
        const dist = pos.distanceTo(Pn), sw = s.swell;
        tiny.glow.position.copy(Pn);
        tiny.glow.scale.setScalar(Math.max(0.02, dist * 0.045) * (1 + 1500 * sw * sw * sw));
        tiny.glow.material.opacity = smooth(36.6, 37.6, v) * (1 + 1.5 * sw);
        tiny.glow.visible = v > 36.5;
        tiny.nucLight.position.copy(Pn); tiny.nucLight.intensity = 2.5 * smooth(36.6, 37.8, v) * (1 + 6 * sw);
        const so = smooth(T_REVEAL[0] + 0.1, T_REVEAL[0] + 1.2, v) * (1 - smooth(T_DIVE + 0.3, T_DIVE + 1.3, v));
        tiny.stad.visible = so > 0.01;
        tiny.stad.position.copy(Pn); tiny.stad.rotation.y = Math.PI / 2 + Math.atan2(-60, -350);
        tiny.pitchM.uniforms.uO.value = so; tiny.lineM.opacity = 0.9 * so; tiny.standM.opacity = 0.22 * so;
      } else { tiny.glow.visible = false; tiny.stad.visible = false; tiny.nucLight.intensity = 0; }

      // ---------- you ----------
      const yawPark = Math.PI + kf([[0, 0.5], [3, 0.35], [4.8, 0.2]], v);
      let yaw = o.yaw;
      { let d = yaw - yawPark; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw = yawPark + d * pk; }
      const fl = smooth(T_DROP[1] + 0.2, T_DROP[1] + 1.6, v);
      const elev = Math.atan2(look.y - 1.5, Math.hypot(look.x, look.z));
      const headP = lerp(kf([[0, -0.45], [3, -0.6], [4.8, -0.75]], v), clamp(-elev * 0.9, -0.9, 0.3), pk);
      const reach = 0.5 * smooth(30.5, 32, v) * (1 - smooth(36, 37, v));
      const pose = { head: [headP, lerp(kf([[0, -0.5], [3, -0.3], [4.8, -0.1]], v), 0.1, pk)], armsOut: 0.3 + 0.06 * Math.sin(v * 3) * (1 - fl), float: fl,
        reach, reachDir: new THREE.Vector3(0.1, 0.25, 1).normalize(), curl: 0.3 };
      const youPos = V3(0, 0.12 * fl + 0.05 * fl * Math.sin(v * 0.9), 0);
      const L = lookAt(v, S);
      L.shadowAt = V3(0, 0, 0);
      return {
        yaw, pose, youPos,
        cam: { pos, tgt, fov, near: s.dv > 0.6 ? 0.002 : 0.06, far: 30000 },
        look: L,
      };
    },
  };
}
