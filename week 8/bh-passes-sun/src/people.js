// The people: out of their cars and shops, standing in the stopped avenue looking up at the Sun. Most face it (their backs
// to you, heads tipped back), pointing, filming with phones held up, hands on their heads; a few face you, talking, and
// turn to look. Some walk up the median and along the sidewalks the whole time, so the street never freezes.
// What they do follows the story: more point and film as the Sun stretches, hands go to heads when the ring of fire shows
// and when the Sun is torn, and in the flare they shield their eyes and turn away from it toward you.
// Placed once at load: nobody stands within 0.75 m of anybody else, inside a car, a tree, a lamp or a bench, or within 2.6 m
// of you; walkers are checked against the standers along their whole path.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, MED, CURB, FXW, QX, TREES, LAMPS, BENCHES } from './layout.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { clearOfCars } from './traffic.js';
import { V_EGG, V_RING, V_PASS, V_FLARE, V_SKY, V_SWING } from './timeline.js';

const SHIRTS = [0xe8e2d6, 0xd05030, 0x3a6ab0, 0xf0c060, 0xffffff, 0x60a0d0, 0x2a8a5a, 0xe86a8a, 0x1d2230, 0xc8d4e8, 0x8a5a8a, 0xf4a040, 0x24384a, 0xb8b0a0, 0x7a2a2a, 0x40b0b0];
const PANTS = [0x23252b, 0x2c3340, 0x4a6a9a, 0x8a7a66, 0xc9c2b6, 0x1a1a1a, 0x3a4a6a, 0xe8e2d6];
// the direction everyone looks: the hole and the Sun, a little east of north (main.js puts the sky there)
export const LOOK_YAW = Math.PI - 0.1;

export const PEOPLE = [];
{
  const R = rng(4242);
  const obst = [...TREES.map((t) => ({ x: t.x, z: t.z, r: 1.1 })), ...LAMPS.map((l) => ({ x: l.x, z: l.z, r: 0.5 })), ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.3 }))];
  const okAt = (x, z, list, gap = 0.75) => {
    if (Math.hypot(x - CAM0.x, z - CAM0.z) < 2.6) return false;
    if (!clearOfCars(x, z, 0.45)) return false;
    for (const o of obst) if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return false;
    for (const p of list) if ((x - p.x) ** 2 + (z - p.z) ** 2 < gap * gap) return false;
    return true;
  };
  const stand = [];
  const add = (x, z, extra = {}) => {
    if (!okAt(x, z, stand)) return false;
    const p = { x, z, ...extra };
    stand.push(p); PEOPLE.push(p);
    return true;
  };
  // ---- right in front of you (hand placed, in the frame): [x, z, kind] ----
  // kinds: 'point', 'phone', 'face' (faces you, talking, then turns), 'look'
  for (const [x, z, kind] of [[-1.05, 4.9, 'phone'], [1.25, 4.4, 'point'], [-2.4, 2.8, 'look'], [2.6, 2.4, 'face'], [0.2, 2.6, 'phone'], [-0.9, 0.6, 'point'],
    [1.7, 0.2, 'look'], [-2.9, -0.8, 'phone'], [3.4, -1.2, 'point'], [0.6, -2.0, 'face'], [-1.9, -3.1, 'look'], [2.3, -3.6, 'phone']]) {
    add(x, z, { kind, near: true });
  }
  const pickKind = () => { const r = R(); return r < 0.3 ? 'point' : r < 0.55 ? 'phone' : r < 0.67 ? 'face' : 'look'; };
  // ---- the median, thick near you ----
  for (let k = 0; k < 4000 && PEOPLE.length < 150; k++) {
    const z = 5 - Math.pow(R(), 1.6) * 95, x = (R() - 0.5) * 2 * (MED - 0.5);
    add(x, z, { kind: pickKind() });
  }
  // ---- out of their cars, between them in the lanes ----
  for (let k = 0; k < 4000 && PEOPLE.length < 240; k++) {
    const side = R() < 0.5 ? -1 : 1, z = 6 - Math.pow(R(), 1.3) * 100, x = side * (MED + 0.4 + R() * (CURB - MED - 0.8));
    add(x, z, { kind: pickKind() });
  }
  // ---- the sidewalk on the left and the promenade on the right ----
  for (let k = 0; k < 4000 && PEOPLE.length < 330; k++) {
    const west = R() < 0.4, z = 4 - R() * 105;
    const x = west ? -FXW + 0.8 + R() * (FXW - CURB - 1.6) : CURB + 0.9 + R() * (QX - CURB - 2.2);
    add(x, z, { kind: pickKind() });
  }
  // ---- walkers: up and down the median and along the promenade (checked against the standers) ----
  const WALK = [];
  for (let k = 0; k < 600 && WALK.length < 26; k++) {
    const lane = R();
    const x = lane < 0.5 ? (R() - 0.5) * 2 * (MED - 0.7) : CURB + 1.2 + R() * (QX - CURB - 2.8);
    const dir = R() < 0.5 ? -1 : 1, sp = 1.0 + R() * 0.5, z0 = -95 + R() * 90;
    let ok = true;
    for (let t = -2; t <= 50 && ok; t += 0.25) {
      const z = z0 + dir * sp * t;
      if (z > 4 || z < -105) continue;
      if (Math.hypot(x - CAM0.x, z - CAM0.z) < 2.8 || !clearOfCars(x, z, 0.5)) ok = false;
      for (const o of obst) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.3) ** 2) ok = false;
      for (const p of stand) if ((x - p.x) ** 2 + (z - p.z) ** 2 < 0.8) ok = false;
      for (const w of WALK) { const wz = w.z0 + w.dir * w.sp * t; if (Math.abs(w.x - x) < 0.8 && Math.abs(wz - z) < 0.9) ok = false; }
    }
    if (!ok) continue;
    const w = { x, z0, dir, sp, walker: true, kind: 'look' };
    WALK.push(w); PEOPLE.push(w);
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.35;
    p.s = R() < 0.07 ? 0.72 : 0.92 + R() * 0.16;
    p.ph = R() * 10;
    p.dl = R();                                   // how quickly they react (0..1 of a second and a half)
    p.yaw0 = LOOK_YAW + (R() - 0.5) * 0.5;
    if (p.kind === 'face') p.yaw0 = (R() - 0.5) * 0.9;
    p.turnAt = 2 + R() * 9;                       // when a 'face' person turns round to look
    p.awayAt = V_SKY - 1.5 + R() * 2.5;           // when they turn away from the flare
    p.away = R() < 0.55;
  });
  console.log(`people: ${PEOPLE.length} (${WALK.length} walking)`);
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  return {
    crowd,
    frame(v) {
      for (const p of PEOPLE) {
        const d = p.dl * 1.4;
        let x = p.x, z = p.z, yaw = p.yaw0, walk = 0, stride = 0, armL = 0, armR = 0, look = 0.85, pitch = 0;
        if (p.walker) {
          z = p.z0 + p.dir * p.sp * v;
          if (z > 6 || z < -108) { crowd.pose(p.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
          yaw = p.dir > 0 ? 0 : Math.PI; walk = p.sp * v * 2.4 + p.ph; stride = 0.9; look = 0.55 + 0.3 * Math.sin(v * 0.7 + p.ph);
          // slows and looks up when the ring of fire shows
          armR = 0.9 * smooth(V_RING + d, V_RING + d + 0.6, v) * (1 - smooth(V_RING + 4 + d, V_RING + 5 + d, v));
        } else {
          // a gentle sway, weight shifting
          yaw += 0.08 * Math.sin(v * 0.6 + p.ph);
          look = 0.8 + 0.12 * Math.sin(v * 0.5 + p.ph * 1.7);
          const k = p.kind;
          if (k === 'face') {
            // talking to you / the person behind, then turning round to look up
            const tr = smooth(p.turnAt, p.turnAt + 0.8, v);
            yaw = lerp(p.yaw0, LOOK_YAW + (p.ph % 1 - 0.5) * 0.4, tr);
            look = lerp(0.15 + 0.1 * Math.sin(v * 2 + p.ph), 0.85, tr);
            armR = (1 - tr) * 0.35 * Math.max(0, Math.sin(v * 2.3 + p.ph)) + tr * 1.45 * smooth(p.turnAt + 1, p.turnAt + 1.6, v);
          }
          if (k === 'point') {
            // pointing up, arm going up and down; more as the Sun stretches
            const up = 0.5 + 0.5 * Math.sin(v * 0.45 + p.ph);
            armR = lerp(0.2, 1.55, Math.max(up, smooth(V_EGG + d, V_EGG + d + 0.5, v) * 0.8));
          }
          if (k === 'phone') { armR = 1.05 + 0.04 * Math.sin(v * 1.3 + p.ph); armL = 0.95; look = 0.55; }
          if (k === 'look') armL = 0.15 * Math.sin(v * 0.8 + p.ph);
          // shock: hands to heads when the ring of fire shows (some) and when the Sun is torn (most)
          const shock = Math.max(
            (p.ph % 3 < 1 ? 1 : 0) * smooth(V_RING + d, V_RING + d + 0.5, v) * (1 - smooth(V_RING + 3 + d, V_RING + 4 + d, v)),
            (p.ph % 3 < 2.2 ? 1 : 0) * smooth(V_PASS + d, V_PASS + d + 0.45, v) * (1 - smooth(V_PASS + 4.5 + d, V_PASS + 5.5 + d, v)));
          if (shock > 0 && k !== 'phone') { armL = lerp(armL, 1.72, shock); armR = lerp(armR, 1.72, shock); look = lerp(look, 0.95, shock); }
          if (k === 'phone') look = lerp(look, 0.9, shock * 0.5);
          // the flare: a hand over the eyes, then (some) turn away from it
          const glare = smooth(V_FLARE + 1.5 + d, V_FLARE + 2.5 + d, v);
          if (glare > 0) { armR = lerp(armR, 1.5, glare); armL = lerp(armL, k === 'phone' ? 0.95 : 0.2, glare); look = lerp(look, 0.55, glare); }
          if (p.away) {
            const aw = smooth(p.awayAt, p.awayAt + 0.9, v);
            if (aw > 0) { yaw = lerp(yaw, yaw + Math.PI * (p.ph % 2 < 1 ? 0.85 : -0.85), aw); armL = lerp(armL, 1.6, aw); armR = lerp(armR, 1.6, aw); look = lerp(look, -0.4, aw); pitch = 0.18 * aw; }
          }
          // the shadow split: a few step back
          if (p.ph % 4 < 0.6) { const b = smooth(V_SWING + d, V_SWING + d + 1.2, v); z += 0.6 * b; }
        }
        crowd.pose(p.i, { x, y: 0, z, yaw, s: p.s, walk, stride, pitch, armL, armR, look });
      }
      crowd.commit();
    },
  };
}
