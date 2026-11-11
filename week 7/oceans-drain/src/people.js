// The people. One crowd, re-cast for every shot: each shot lists who is where and what they do, as plain functions of
// time (so nobody jumps or slides). The walker you follow (red shirt) is in every shot after the beach.
//   spec: { x, z, yaw (0 = facing you, PI = facing away), act, s (size), sp (walking speed, m/s), t0 (starts walking),
//           dur (walks this long, then stops and does `then`), flee (video time they turn and run back past you) }
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { propMaterial } from './build.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';

const SWIM = [0xe8483a, 0x1d2230, 0x2f8fd8, 0xf3c52f, 0x29a36a, 0xd93c8c, 0xffffff, 0xff7f2a, 0x16b3b0, 0x7a4fd0];
const SHIRT = [0xf2ede2, 0xffffff, 0x3f9be0, 0xf5c542, 0x2fa56a, 0xea5f8c, 0x25405c, 0xf59a36, 0x8a5fd6, 0x19b5b0];
const PANTS = [0x24384a, 0x3a4a5e, 0x6a5a48, 0x1d2230, 0xc8b89a, 0x2f5d8a];
export const HERO = { shirt: 0xe8322a, pants: 0x1f2a3a, skin: 0xe0ac86, hair: 0x1d1612 };

// fill in looks for a shot's cast (deterministic)
export function cast(list, seed, beach = false) {
  const R = rng(seed);
  list.forEach((p, i) => {
    p.ph = R() * 10;
    p.s = p.s ?? (R() < 0.12 ? 0.66 : 0.93 + R() * 0.14);
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    if (p.hero) Object.assign(p, HERO, { s: 1.0 });
    else if (beach && !p.dressed) { p.shirt = SWIM[Math.floor(R() * SWIM.length)]; p.pants = R() < 0.8 ? p.skin : SWIM[Math.floor(R() * SWIM.length)]; p.sleeves = false; }   // (bare legs and arms: a swimsuit or a T-shirt over trunks)
    else { p.shirt = SHIRT[Math.floor(R() * SHIRT.length)]; p.pants = PANTS[Math.floor(R() * PANTS.length)]; p.sleeves = R() < 0.3; }
    p.yaw = p.yaw ?? Math.PI;
  });
  return list;
}

function at(p, v, h) {
  let x = p.x, z = p.z, yaw = p.yaw, walk = 0, stride = 0, sit = 0, pitch = 0, armL = 0.08, armR = 0.08, look = 0.05;
  const tv = v + p.ph;
  let act = p.act || 'stand';
  let moving = false;
  if (p.sp) {
    const t0 = p.t0 ?? -1e9;
    const tw = clamp(v - t0, 0, p.dur ?? 1e9);
    const d = p.sp * (tw - 0.35 * (1 - Math.exp(-tw / 0.35)));
    x += Math.sin(yaw) * d; z += Math.cos(yaw) * d;
    moving = v > t0 && v < t0 + (p.dur ?? 1e9);
    walk = d * 3.7 / p.s + p.ph;
    stride = moving ? (p.sp > 3.2 ? 1.5 : 1) * smooth(0, 0.4, v - t0) : 0;
    if (!moving && v >= t0 + (p.dur ?? 1e9) && p.then) act = p.then;
    if (moving && p.act !== 'phone') act = 'walk';
  }
  if (!moving) yaw += wobble(tv * 0.5, p.ph) * 0.12;
  switch (act) {
    case 'point': armL = 1.08 + 0.18 * Math.max(0, Math.sin(tv * 1.1)); look = 0.18; break;
    case 'pointR': armR = 1.08 + 0.18 * Math.max(0, Math.sin(tv * 1.1)); look = 0.18; break;
    case 'pointUp': armR = 1.38 + 0.1 * Math.sin(tv * 1.3); look = 0.7; break;
    case 'phone': armR = 1.05; armL = 0.25; look = p.lookUp ?? 0.12; break;
    case 'look': look = p.lookUp ?? 0.3; armL = 0.12; armR = 0.12; break;
    case 'lookUp': look = 0.9; armL = 0.15; armR = 0.15; break;
    case 'lookDown': look = -0.5; pitch = 0.12; armL = 0.2; armR = 0.2; break;
    case 'shock': armL = 1.62; armR = 1.62; look = 0.25; break;                         // hands on the head
    case 'wave': armL = 1.5 + 0.2 * Math.sin(tv * 7); armR = 1.5 + 0.2 * Math.sin(tv * 7 + 2); look = 0.3; break;
    case 'touch': armR = 0.9; look = 0.1; break;
    case 'arms': armL = 1.55; armR = 1.55; look = 0.75; break;
    case 'sit': sit = 1; armL = 0.2; armR = 0.3; break;
    case 'walk': break;
    default: armR = 0.1 + 0.12 * Math.max(0, Math.sin(tv * 1.4));
  }
  // the end: they turn and run back past you
  if (p.flee !== undefined && v > p.flee) {
    const t = v - p.flee;
    const turn = smooth(0, 0.35, t);
    const d = 5.6 * Math.max(0, t - 0.25) * smooth(0.2, 0.9, t);
    yaw = lerp(yaw, p.fleeYaw ?? 0, turn);
    x += Math.sin(p.fleeYaw ?? 0) * d; z += Math.cos(p.fleeYaw ?? 0) * d;
    walk = d * 3.0 + p.ph; stride = 1.6 * smooth(0.2, 0.6, t);
    armL = lerp(armL, 0.3, turn); armR = lerp(armR, 0.3, turn); look = 0.05; sit = 0; pitch = 0.1 * turn;
  }
  return { x, y: h(x, z) + (p.dy || 0), z, yaw, walk, stride, sit, pitch, armL, armR, look, s: p.s };
}

export function makePeople(scene, max) {
  const mat = propMaterial({ rough: 0.8, gloss: 0.12, vertexColors: false });
  const crowd = makeCrowd(scene, max, mat, { castShadow: true });
  let cur = null;
  return {
    crowd, at,
    frame(v, list, h) {
      if (cur !== list) {
        cur = list;
        list.forEach((p, i) => crowd.color(i, p.shirt, p.pants, p.skin, p.hair, p.sleeves !== false));
      }
      for (let i = 0; i < max; i++) {
        if (i >= list.length) { crowd.pose(i, { x: 0, y: 0, z: 0, visible: false }); continue; }
        const p = list[i];
        if ((p.from !== undefined && v < p.from) || (p.until !== undefined && v > p.until)) { crowd.pose(i, { x: 0, y: 0, z: 0, visible: false }); continue; }
        crowd.pose(i, at(p, v, h));
      }
      crowd.commit();
    },
  };
}
