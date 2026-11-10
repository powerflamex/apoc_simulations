// The people on the beach. Planned up front so nobody walks through anybody, jumps or changes size:
//   - on the deck with you, two friends; right under the tower a tight crowd, standing, sitting and lying on their towels;
//   - along the rows of umbrellas: people on towels, in pairs, walking the waterline, wading in the shallows; a ring of them
//     round the spot where the grains land;
//   - they look up at the streak and point. Hit 2: the nearest step back. Hit 3 on: they run straight away from the spot. Every
//     path is a straight line out from HIT at one speed, so paths never cross and the gaps only grow;
//   - each blast knocks flat whoever its front catches (worked out here, for where they will be by then), and they stay down.
//     The crater takes the ones it reaches.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, HIT, UMBRELLAS, groundY, craterY, rollY, shoreX, bedAt, inSight } from './layout.js';
import { HITS, SHOCK, ROLL_A } from './timeline.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';

const SWIM = [0xd7263d, 0x1b998b, 0xf46036, 0x2e294e, 0xc5d86d, 0x111111, 0xe8e8e8, 0xff6fb5, 0x2f6db5, 0xf3c623, 0x7b2cbf, 0x0b7a75];
const TOPS = [0xffffff, 0x222222, 0xe94f37, 0x3b8ed0, 0xf6c445, 0x6dbf73, 0xff9ec4, 0x8e44ad, 0xd5d5d5, 0x16a085];
const SHORTS = [0x1b2631, 0x2c3e50, 0x5d6d7e, 0xd5c4a1, 0x4a6fa5, 0x212121, 0x7f8c8d];
const SPEED = 4.6;                                     // everyone runs at this speed, so no one catches anyone

export const PEOPLE = [];
{
  const R = rng(3030);
  const free = (x, z, r) => !PEOPLE.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
  const add = (o) => {
    const swim = R() < 0.6;
    const skin = SKIN[Math.floor(R() * SKIN.length)];
    PEOPLE.push({
      type: 'stand', col: [swim ? skin : TOPS[Math.floor(R() * TOPS.length)], swim ? SWIM[Math.floor(R() * SWIM.length)] : SHORTS[Math.floor(R() * SHORTS.length)], skin, HAIR[Math.floor(R() * HAIR.length)], !swim],
      s: 0.9 + R() * 0.16, seed: R(), ph: R() * 6.28, y0: null, ...o,
    });
  };
  // the two on the deck with you
  add({ x: CAM0.x - 1.5, z: CAM0.z + 1.6, y0: CAM0.y - 1.55, deck: true, s: 1.0, type: 'stand', act: 'head' });
  add({ x: CAM0.x + 1.6, z: CAM0.z + 1.7, y0: CAM0.y - 1.55, deck: true, s: 0.96, type: 'stand', act: 'point' });
  // right under the tower, packed
  const nearN = 170;
  for (let k = 0; k < 2200 && PEOPLE.length < nearN; k++) {
    const a = R() * 6.28, r = 5 + Math.pow(R(), 0.75) * 62;
    const x = CAM0.x + 22 * 0.3 + Math.sin(a) * r, z = CAM0.z - 16 - Math.cos(a) * r * 1.15;
    if (x > -3 || !free(x, z, 1.05)) continue;
    if (UMBRELLAS.some((u) => (u.x - x) ** 2 + (u.z - z) ** 2 < 0.7)) continue;
    add({ x, z, type: R() < 0.62 ? 'stand' : R() < 0.5 ? 'sit' : 'lie', act: R() < 0.55 ? 'point' : R() < 0.5 ? 'head' : 'look' });
  }
  // the ring round the spot, on the wet sand
  for (let k = 0; k < 900 && PEOPLE.length < nearN + 80; k++) {
    const a = R() * 6.28, r = 8.5 + Math.pow(R(), 0.9) * 42;
    const x = HIT.x + Math.sin(a) * r, z = HIT.z - Math.cos(a) * r;
    if (x > 6 || !free(x, z, 1.05) || inSight(x, z)) continue;
    add({ x, z, type: 'stand', act: R() < 0.5 ? 'look' : 'point', wade: x > shoreX(z) });
  }
  // the rest of the beach, thick from you to the pier
  for (let k = 0; k < 16000 && PEOPLE.length < 1050; k++) {
    const x = -92 + R() * 94, z = -430 + R() * 560;
    if (!free(x, z, 1.1) || inSight(x, z)) continue;
    if (UMBRELLAS.some((u) => (u.x - x) ** 2 + (u.z - z) ** 2 < 0.7)) continue;
    if (Math.hypot(x - CAM0.x, z - CAM0.z) < 5) continue;
    const wet = x > -9;
    add({ x, z, type: wet ? 'stand' : R() < 0.42 ? 'lie' : R() < 0.5 ? 'sit' : 'stand', act: R() < 0.4 ? 'look' : 'idle' });
  }
  // in the shallows
  for (let k = 0; k < 500 && PEOPLE.length < 1160; k++) {
    const x = 1 + R() * 22, z = -420 + R() * 540;
    if (free(x, z, 1.3) && !inSight(x, z)) add({ x, z, type: 'stand', act: 'idle', wade: true });
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.r0 = Math.hypot(p.x - HIT.x, p.z - HIT.z);
    p.ax = (p.x - HIT.x) / p.r0; p.az = (p.z - HIT.z) / p.r0;
    p.g = p.y0 ?? groundY(p.x, p.z);
    p.yaw0 = p.type === 'lie' ? p.seed * 6.28 : Math.atan2(HIT.x - p.x, HIT.z - p.z) + (R() - 0.5) * 0.9;
    p.tLook = 2.2 + R() * 1.0 + p.r0 * 0.002;
    p.spin = (R() - 0.5) * 3;
    // when they break and run: the people furthest from the spot go first (so no one runs into anyone standing still)
    const start = p.r0 < 18 ? 6.5 : p.r0 < 45 ? 9.15 : 12.1;
    p.tRun = p.deck ? 1e9 : start + clamp((220 - p.r0) * 0.004, 0, 1) + (p.type === 'lie' ? 0.7 : p.type === 'sit' ? 0.4 : 0) + R() * 0.25;
    p.L = p.r0 < 18 && R() < 0.6 ? 8 + R() * 3 : 1e4;                         // (the first few only back away, at hit 2)
    // which blast catches them, wherever they've got to by then (their distance at t: r0 + SPEED (t - tRun))
    p.tK = 1e9; p.hK = null;
    const fx = (t) => p.r0 + (t > p.tRun ? Math.min(p.L, SPEED * (t - p.tRun)) : 0);
    for (const h of HITS) {
      let lo = h.t, hi = h.t + h.reach / SHOCK;
      if (fx(hi) > SHOCK * (hi - h.t)) continue;                             // the front stops short of them
      for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (SHOCK * (m - h.t) < fx(m)) lo = m; else hi = m; }
      p.tK = hi; p.hK = h; p.rK = fx(hi);
      break;
    }
    p.fl = p.hK ? clamp(p.hK.reach / Math.max(p.rK, 4) * 2.2, 1.2, 8) : 0;      // how far they're thrown
  });
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  PEOPLE.forEach((p) => crowd.color(p.i, ...p.col));
  return {
    crowd,
    frame(v, s) {
      const rollA = ROLL_A * s.roll;
      for (const p of PEOPLE) {
        let x = p.x, z = p.z, yaw = p.yaw0, walk = v * 1.5 + p.ph, stride = 0, armL = 0, armR = 0, look = 0, pitch = 0, roll = 0, y = 0, sit = 0;
        yaw += wobble(v * 0.3, p.ph) * 0.2;
        // idle on the beach: lying, sitting, a slow turn of the head
        const down = p.type === 'lie' ? 2 : p.type === 'sit' ? 1 : 0;
        const react = smooth(p.tLook, p.tLook + 0.6, v);
        if (p.act === 'point') { armL = 1.15 * react; look = 0.5 * react; }
        else if (p.act === 'head') { armL = armR = 1.6 * react; look = 0.3 * react; }
        else if (p.act === 'look') look = 0.45 * react;
        else look = 0.1;
        let up = 1;
        if (down) {
          up = smooth(p.tRun - 0.5, p.tRun, v);
          if (down === 2) { pitch = -1.5 * (1 - up); y = 0.13 * (1 - up); sit = 0; armL = armR = 0; if (up < 0.5) look = 0; }
          else { sit = 1 - up; y = 0.0; armL *= up; armR *= up; }
        }
        // the run: straight out from the spot
        const moving = v > p.tRun && v < p.tK;
        if (v > p.tRun) {
          const d = Math.min(p.L, SPEED * Math.max(0, v - p.tRun - 0.25 * (1 - Math.exp(-(v - p.tRun) / 0.25))));
          x += p.ax * d; z += p.az * d;
          const going = p.L > 1e3 || d < p.L - 0.05;
          const turn = smooth(p.tRun, p.tRun + 0.3, v);
          if (going) { yaw = Math.atan2(p.ax, p.az); walk = (v - p.tRun) * SPEED * 2.4 + p.ph; stride = 1.5 * turn; armL = armR = 0.25 * turn; look = 0.1; }
        }
        // the two on the deck: they duck at each big hit, then crouch down for good
        if (p.deck) { const c = smooth(30, 31, v); sit = c * 0.85; armL = armR = lerp(armL, 1.5, c); look = lerp(look, -0.4, c); }
        // knocked flat by the blast: thrown out from the spot, tumbling, and down for good
        let gone = false;
        if (v > p.tK) {
          const dt = v - p.tK, f = 1 - Math.exp(-dt / 0.45);
          x += p.ax * p.fl * f; z += p.az * p.fl * f;
          y += Math.max(0, p.fl * 0.55 * Math.sin(Math.min(dt / 0.8, 1) * Math.PI));
          const fall = smooth(0, 0.55, dt);
          pitch = lerp(pitch, -1.5 + (p.seed < 0.5 ? 0 : 3), fall); roll = lerp(roll, p.spin * 0.25, fall);
          y += 0.13 * fall; sit *= 1 - fall; stride = 1 - smooth(0.4, 0.9, dt);
          armL = 1.5; armR = 1.3; walk = dt * 14; look = 0;
        }
        const rr = Math.hypot(x - HIT.x, z - HIT.z);
        if (rr < s.Rc * 1.02) gone = true;
        const base = p.deck ? p.g + s.deckY : p.y0 ?? (p.wade ? Math.max(s.seaY, bedAt(x - shoreX(z))) * 0 + bedAt(x - shoreX(z)) : groundY(x, z));
        const gy = base + (p.deck ? 0 : craterY(rr, s.Rc) + rollY(rr, v, rollA));
        crowd.pose(p.i, { x, y: gy + y, z, yaw, s: p.s, walk, stride, sit, pitch, roll, armL, armR, look, visible: !gone });
      }
      crowd.commit();
    },
  };
}
