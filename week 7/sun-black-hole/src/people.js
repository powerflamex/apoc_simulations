// The people on the beach. Planned up front so nobody walks through anybody, jumps or changes size:
//   - at noon it's packed: people sitting and lying on towels, groups standing and talking, kids crouched over sandcastles
//     by the water, people wading in the shallows, walkers along the waterline, the lifeguard up on the tower. Before the
//     dark their clock runs up to 3x (the time-lapse), so the beach is lively but nobody zips about;
//   - when the Sun goes out (0:09) they look up, many get to their feet, some point; the waders come out of the water;
//     as it goes dark their phones light up (everyone checks the news);
//   - from 0:18 they head home: the ones behind you walk off up the beach to the promenade; everyone is taken off the beach
//     only while the camera isn't looking at them (planHide), so nobody pops out of view;
//   - five stay and sit round a fire close to you (0:21), arms wrapped round themselves as it gets colder, and leave
//     when the snow buries the beach (0:33). Nobody is ever shown hurt.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { Z_W, CAM_A, CAM_B, TOWER, FIRE, TOWELS, UMBRELLAS, sandY, clearOf, SUN_AE } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { animT, V_DARK, V_GONE, V_HOME, V_FIRE, V_SNOW, V_BURY, V_STEAM } from './timeline.js';
import { frostify } from './frost.js';

const SWIM = [0xe8483a, 0x1d2230, 0x2f8fd8, 0xf3c52f, 0x29a36a, 0xd93c8c, 0xffffff, 0xff7f2a, 0x16b3b0, 0x7a4fd0];
const SHIRT = [0xe8e2d6, 0xffffff, 0x60a0d0, 0xf0c060, 0x2a8a5a, 0xe86a8a, 0x24384a, 0xf4a040];
const SEA_YAW = Math.PI + SUN_AE.az * Math.PI / 180;      // facing out to sea, toward the Sun
const DEG = Math.PI / 180;
const WALK_STOP = animT(9.4);

export const PEOPLE = [];
{
  const R = rng(20251107);
  const poles = UMBRELLAS.map((u) => ({ x: u.x, z: u.z, r: 0.55 }));
  const busy = (x, z, r) => PEOPLE.some((q) => Math.hypot(q.x - x, q.z - z) < r + (q.rad || 0.45)) || poles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r);
  // on the towels: sitting or lying
  for (const t of TOWELS) {
    if (R() > 0.72) continue;
    const lie = R() < 0.35;
    if (lie) {
      // feet at one end of the towel, the body along it
      const fx = Math.sin(t.yaw) * 0.85, fz = Math.cos(t.yaw) * 0.85;
      PEOPLE.push({ act: 'lie', x: t.x - fx, z: t.z - fz, yaw: t.yaw + Math.PI, rad: 1.0, s: 0.92 + R() * 0.14 });
    } else {
      PEOPLE.push({ act: 'sit', x: t.x + (R() - 0.5) * 0.3, z: t.z + 0.3, yaw: SEA_YAW + (R() - 0.5) * 1.4, rad: 0.55, s: 0.9 + R() * 0.14 });
      if (R() < 0.35) PEOPLE.push({ act: 'sit', x: t.x + 0.75, z: t.z - 0.1, yaw: SEA_YAW + (R() - 0.5) * 1.2, rad: 0.5, s: R() < 0.3 ? 0.62 : 0.92 + R() * 0.1 });
    }
  }
  // groups standing and talking
  for (let k = 0; k < 4000 && PEOPLE.filter((p) => p.act === 'talk').length < 260; k++) {
    const cx = (R() - 0.5) * (R() < 0.7 ? 70 : 240), cz = Z_W + 2.2 + Math.pow(R(), 1.6) * 50;
    const n = 2 + Math.floor(R() * 3);
    const pts = [];
    for (let j = 0; j < n; j++) { const a = (j / n) * 6.28 + R() * 0.5; pts.push({ x: cx + Math.cos(a) * 0.75, z: cz + Math.sin(a) * 0.75, yaw: Math.atan2(cx - (cx + Math.cos(a)), cz - (cz + Math.sin(a))) }); }
    if (pts.some((q) => !clearOf(q.x, q.z, 0.4) || busy(q.x, q.z, 0.4))) continue;
    for (const q of pts) PEOPLE.push({ act: 'talk', x: q.x, z: q.z, yaw: q.yaw, rad: 0.4, s: R() < 0.12 ? 0.64 : 0.92 + R() * 0.16 });
  }
  // kids at sandcastles by the water
  for (let k = 0; k < 400 && PEOPLE.filter((p) => p.act === 'dig').length < 26; k++) {
    const x = (R() - 0.5) * 140, z = Z_W + 2.7 + R() * 3.5;
    if (!clearOf(x, z, 0.5) || busy(x, z, 0.6)) continue;
    PEOPLE.push({ act: 'dig', x, z, yaw: R() * 6.28, rad: 0.5, s: 0.55 + R() * 0.12 });
  }
  // waders in the shallows (they walk out after the dark)
  for (let k = 0; k < 2000 && PEOPLE.filter((p) => p.act === 'wade').length < 130; k++) {
    const x = (R() - 0.5) * (R() < 0.6 ? 60 : 220), z = Z_W - 1.5 - Math.pow(R(), 1.3) * 30;
    if (busy(x, z, 0.6) || Math.abs(x - (-44)) < 8) continue;
    PEOPLE.push({ act: 'wade', x, z, yaw: R() < 0.5 ? SEA_YAW + (R() - 0.5) * 2 : (R() - 0.5) * 2, rad: 0.5, s: R() < 0.25 ? 0.64 : 0.9 + R() * 0.15, out: V_DARK + 1.5 + R() * 3 });
  }
  // walkers along the waterline, both ways
  for (let k = 0; k < 48; k++) {
    const lane = k % 2, z = Z_W + 0.5 + lane * 0.95, dir = lane ? 1 : -1;
    PEOPLE.push({ act: 'walk', x: -170 + (k / 48) * 340 + (R() - 0.5) * 3, z, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, dir, sp: 1.2 + lane * 0.1, rad: 0, s: R() < 0.1 ? 0.64 : 0.92 + R() * 0.14 });
  }
  // the lifeguard on the tower
  PEOPLE.push({ act: 'guard', x: TOWER.x, z: TOWER.z - 0.6, yaw: SEA_YAW, rad: 0, s: 1.0, shirt: 0xd8402e, pants: 0xd8402e });
  // the five who stay by the fire (standing about here at noon, round it from 0:21)
  for (let j = 0; j < 5; j++) {
    const a = (j / 5) * Math.PI * 2 + 0.6;
    PEOPLE.push({ act: 'fire', x: FIRE.x + Math.cos(a) * 1.7, z: FIRE.z + Math.sin(a) * 1.7, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), rad: 0.5, s: j === 3 ? 0.62 : 0.92 + j * 0.03, a });
  }
  // right round you at frame 0 (hand placed: [x, z, act, yaw (deg from facing the sea), scale])
  const NEAR = [
    [-1.6, 13.6, 'phone', 20, 0.96], [1.9, 12.2, 'talk', -40, 1.02], [2.6, 12.8, 'talk', 140, 0.95], [-2.4, 10.4, 'point', 10, 1.0],
    [2.2, 9.0, 'look', 0, 0.62], [3.3, 9.7, 'look', -10, 1.0], [-1.9, 6.4, 'phone', 30, 0.98], [1.8, 5.2, 'look', 0, 1.0],
  ];
  for (const [x, z, act, yd, s] of NEAR) {
    for (let i = PEOPLE.length - 1; i >= 0; i--) if (Math.hypot(PEOPLE[i].x - x, PEOPLE[i].z - z) < 1.0 && PEOPLE[i].act !== 'fire') PEOPLE.splice(i, 1);
    PEOPLE.push({ act, x, z, yaw: SEA_YAW + yd * DEG, rad: 0.45, s, near: true });
  }
  // nobody on your path down the beach or where you stand
  for (let i = PEOPLE.length - 1; i >= 0; i--) {
    const p = PEOPLE[i];
    if (p.act === 'walk' || p.act === 'fire' || p.act === 'guard') continue;
    const cx = lerp(CAM_B.x, CAM_A.x, clamp((p.z - CAM_B.z) / (CAM_A.z - CAM_B.z)));
    if (Math.abs(p.x - cx) < 1.1 + (p.act === 'lie' ? 1 : 0) && p.z > CAM_B.z - 2.5 && p.z < CAM_A.z + 3) PEOPLE.splice(i, 1);
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    const kid = p.s < 0.7;
    const dressed = p.act === 'talk' && R() < 0.45 || p.act === 'phone' || p.act === 'point' || p.act === 'fire';
    p.shirt = p.shirt ?? (dressed ? SHIRT[Math.floor(R() * SHIRT.length)] : 0);
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    if (!p.shirt) p.shirt = R() < 0.5 ? p.skin : SWIM[Math.floor(R() * SWIM.length)];     // bare-chested or a swimsuit top
    p.pants = p.pants ?? SWIM[Math.floor(R() * SWIM.length)];
    p.sleeves = false;
    p.ph = R() * 10;
    p.kid = kid;
    // after the dark: when they react, stand, raise a phone; when they head home
    p.tLook = V_DARK + 0.15 + R() * 0.9;
    p.tStand = p.act === 'sit' || p.act === 'dig' ? (R() < 0.6 ? V_DARK + 0.8 + R() * 2.5 : 1e9) : 1e9;
    p.phone = R() < 0.7;
    p.tPhone = V_GONE + R() * 2.2;
    p.point = R() < 0.18;
    p.tGone = p.act === 'fire' ? V_BURY + 0.2 : V_HOME + R() * 2.4;
    p.walkOff = p.z > CAM_B.z + 1 && p.act !== 'guard';
  });
}

export function makePeople(scene) {
  const mat = frostify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), { base: 0.25 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  // where each person is at video time v (before they're taken off the beach)
  function at(p, v, anim) {
    let x = p.x, z = p.z, y, yaw = p.yaw, walk = 0, stride = 0, sit = 0, pitch = 0, roll = 0, armL = 0, armR = 0, look = 0.05;
    const tv = anim;
    yaw += wobble(tv * 0.4, p.ph) * 0.18;
    const up = smooth(p.tLook, p.tLook + 0.6, v);
    const stand = smooth(p.tStand, p.tStand + 0.9, v);
    switch (p.act) {
      case 'sit': sit = 1 - stand; armL = 0.15; armR = 0.15 + 0.25 * Math.max(0, Math.sin(tv * 0.9 + p.ph)); break;
      case 'lie': pitch = -Math.PI / 2 * (1 - smooth(p.tLook, p.tLook + 1.2, v) * 0.55); armL = 1.6 * (1 - up); armR = 1.6 * (1 - up); break;
      case 'talk': armR = 0.3 + 0.35 * Math.max(0, Math.sin(tv * 1.7 + p.ph)); armL = 0.12 + 0.2 * Math.max(0, Math.sin(tv * 1.3 + p.ph * 2)); break;
      case 'dig': sit = 0.75 * (1 - stand); pitch = 0.35 * (1 - stand); armL = 0.7 + 0.3 * Math.sin(tv * 3 + p.ph); armR = 0.7 + 0.3 * Math.sin(tv * 3 + p.ph + 1.5); break;
      case 'phone': armR = 1.05; armL = 0.25; look = 0.1; break;
      case 'point': armL = 1.1 + 0.25 * Math.max(0, Math.sin(tv * 0.8 + p.ph)); look = 0.2; break;
      case 'look': armR = 1.2; look = 0.25; break;
      case 'guard': sit = 1 - smooth(V_DARK + 1, V_DARK + 2, v); armL = 0.2; armR = 0.2; break;
      case 'fire': armR = 0.3 + 0.3 * Math.max(0, Math.sin(tv * 1.5 + p.ph)); break;
      case 'wade': {
        armL = 0.35 + 0.3 * Math.sin(tv * 1.1 + p.ph); armR = 0.35 + 0.3 * Math.sin(tv * 1.3 + p.ph + 2);
        // out of the water after the dark: a walk up the shelving bed to the sand
        const d = clamp((v - p.out) * 1.0, 0, Math.max(0, Z_W - 0.2 - p.z));
        if (d > 0) { z += d; yaw = 0; walk = d * 4 + p.ph; stride = d < Z_W - 0.2 - p.z - 0.01 ? 0.8 : 0; }
        break;
      }
      case 'walk': {
        // (they stop and look up once it's dark)
        const dd = p.sp * Math.min(tv, WALK_STOP);
        x += p.dir * dd;
        walk = dd * 4 + p.ph; stride = tv < WALK_STOP ? 1 : 0;
        break;
      }
    }
    // after the dark: heads up toward where the Sun was, arms up for some
    if (p.act !== 'lie') {
      look = lerp(look, 0.95, up * (1 - 0.6 * smooth(V_GONE + 1.5, V_GONE + 4, v)));
      if (p.point) armL = lerp(armL, 1.45, up * (1 - smooth(V_GONE + 2, V_GONE + 4, v)));
      if (p.act !== 'wade' && p.act !== 'fire') yaw = lerp(yaw, SEA_YAW + wobble(p.ph, 3) * 0.4, up * 0.7);
    }
    // phones (from the moment it's dark until they leave)
    const ph = p.phone ? smooth(p.tPhone, p.tPhone + 0.5, v) : 0;
    if (ph > 0) { armR = lerp(armR, 1.0, ph); look = lerp(look, 0.05, ph * 0.8); }
    // the fire group: sitting round it, huddling as it gets colder
    if (p.act === 'fire') {
      const atFire = smooth(V_FIRE - 0.3, V_FIRE + 0.2, v);
      yaw = lerp(yaw, p.yaw, atFire);
      sit = Math.max(sit, atFire);
      const hug = smooth(V_SNOW - 0.5, V_SNOW + 1, v);
      armL = lerp(armL, 0.62, hug); armR = lerp(armR, 0.62, Math.max(hug, atFire * 0.3));
      pitch += 0.12 * hug;
      look = lerp(look, -0.1, atFire);
    }
    y = (p.act === 'guard' ? sandY(TOWER.z) + 2.7 + 0.42 * sit : sandY(z)) + (p.act === 'lie' ? 0.12 * (1 - up) : 0);
    // heading home: the ones behind you walk off up the beach
    if (p.walkOff && v > p.tGone) {
      const t = v - p.tGone;
      const d = 1.4 * t + 0.35 * t * t;
      z += d; yaw = 0; walk = d * 3.6 + p.ph; stride = 1; sit = 0; pitch = 0; look = 0.05;
      armL = 0.1; armR = ph > 0 ? 1.0 : 0.1;
      y = sandY(z);
    }
    return { x, y, z, yaw, walk, stride, sit, pitch, roll, armL, armR, look, phone: ph };
  }
  let hideAt = null;
  return {
    crowd,
    // camera visibility: each person leaves the beach at the first moment after tGone that they're out of shot
    planHide(inView, dur) {
      hideAt = new Float32Array(PEOPLE.length).fill(1e9);
      for (const p of PEOPLE) {
        for (let v = p.tGone; v < dur; v += 1 / 60) {
          const a = at(p, v, v);
          if (!inView(v, a.x, a.y + 0.9, a.z, 1.2)) { hideAt[p.i] = v; break; }
        }
      }
    },
    frame(v, s, anim, glows) {
      for (const p of PEOPLE) {
        if (hideAt && v >= hideAt[p.i]) { crowd.pose(p.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
        const a = at(p, v, anim);
        crowd.pose(p.i, { ...a, s: p.s });
        // the phone's screen, lighting their face
        if (a.phone > 0.01 && glows) {
          const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
          const hy = a.y + (1.28 - 0.42 * a.sit) * p.s;
          const k = a.phone * (0.85 + 0.15 * Math.sin(v * 2 + p.ph));
          glows.add(a.x + fx * 0.36 * p.s + Math.cos(a.yaw) * 0.12, hy, a.z + fz * 0.36 * p.s - Math.sin(a.yaw) * 0.12, 0.08 * p.s, 1.6 * k, 1.9 * k, 2.5 * k);
          glows.add(a.x + fx * 0.14 * p.s, hy + 0.27 * p.s, a.z + fz * 0.14 * p.s, 0.3 * p.s, 0.05 * k, 0.06 * k, 0.08 * k);
        }
      }
      crowd.commit();
    },
  };
}
