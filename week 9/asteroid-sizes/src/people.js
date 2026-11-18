// The crowd on the terrace: packed close in front of you on the steps and down to the railing, everyone facing the city.
// Every stop starts them over, staring at the new rock, and each stop has its own reaction:
//   - house-size: pointing at the fireball and filming it; a flinch at the flare; ducking as the glass bursts;
//   - jumbo jet: watching (a few filming, a hand at the head), an arm over the eyes at the flash, then down low with
//     their arms over their heads as the windows burst across the city toward them;
//   - skyscraper: the flash, then they turn and run up the steps toward you (everyone at the same pace, the nearest
//     first, so nobody passes through anybody; the ones right in front of you run past on either side);
//   - Everest: they drop flat as it lands, arms over their heads;
//   - Texas, the Moon: frozen, arms at their sides, staring up at it.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { floorY, TER_X, RAIL_Z, TOP_Z } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { STOPS } from './timeline.js';

const SHIRTS = [0xe8e2d6, 0xd05030, 0x3a6ab0, 0xf0c060, 0xffffff, 0x60a0d0, 0x2a8a5a, 0xe86a8a, 0x1d2230, 0xc8d4e8, 0x8a5a8a, 0xf4a040, 0x24384a, 0xb8b0a0, 0x7a2a2a, 0x40b0b0, 0xf2e04a, 0x9a3a8a];
const PANTS = [0x23252b, 0x2c3340, 0x4a6a9a, 0x8a7a66, 0xc9c2b6, 0x1a1a1a, 0x3a4a6a, 0xe8e2d6];

export const PEOPLE = [];
{
  const R = rng(91011);
  const ok = (x, z, r) => PEOPLE.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > r * r);
  // hand-placed right in front of you: [ahead, right, scale]
  const NEAR = [[3.0, -1.5, 1.0], [3.3, 1.35, 0.97], [4.1, -0.15, 1.02], [4.4, 2.6, 0.64], [4.9, -2.6, 1.0], [5.3, 1.0, 0.98],
    [6.0, -1.3, 0.95], [6.3, 2.9, 1.0], [6.9, 0.2, 1.03], [7.5, -2.9, 0.62], [7.8, 1.8, 1.0], [8.6, -0.9, 0.97]];
  for (const [a, r, s] of NEAR) PEOPLE.push({ x: r, z: -a, s, near: true });
  // the crowd: densest near the middle of the view, out to the railing
  for (let k = 0; k < 30000 && PEOPLE.length < 520; k++) {
    const z = TOP_Z + 1.2 - Math.pow(R(), 0.85) * (TOP_Z + 1.2 - (RAIL_Z + 0.7));
    const half = 3.5 + 0.55 * -z;
    const x = (R() - 0.5) * 2 * Math.min(half, TER_X - 1);
    if (-z < 2.6) continue;
    if (Math.abs(x) < 1.0 && -z < 3.2) continue;                     // (not right on top of you)
    // (clear of the lamps, planters and binoculars)
    if ([[-11.5, -9.5], [12.5, -10.5], [-21, -7.5], [22, -6.5]].some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 2.4)) continue;
    if ([-7.5, 4.5, 16].some((px) => Math.abs(px - x) < 0.8 && z < RAIL_Z + 1.8)) continue;
    const sp = -z < 8 ? 0.95 : 0.82;
    if (!ok(x, z, sp)) continue;
    PEOPLE.push({ x, z, s: R() < 0.08 ? 0.64 : 0.93 + R() * 0.14 });
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.y = floorY(p.x, p.z);
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.3;
    p.ph = R() * 10;
    // facing the city, a little toward ground zero
    p.yaw0 = Math.PI + Math.atan2(p.x + 60, 2400) * 0.8 + (R() - 0.5) * 0.5;
    // a fresh set of choices for every stop
    p.st = STOPS.map(() => ({ act: R(), r: R(), turn: R() < 0.32, duck: R() < 0.62, dly: R(), arm: R() }));
  });
  // couples: each kid and a few others next to someone hold on to them at the end
  for (const p of PEOPLE) {
    if (p.partner !== undefined) continue;
    let best = -1, bd = 1.3;
    for (const q of PEOPLE) { if (q === p || q.partner !== undefined) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q.i; } }
    if (best >= 0 && (p.s < 0.7 || PEOPLE[best].s < 0.7 || (p.ph < 2.0))) { p.partner = best; PEOPLE[best].partner = p.i; }
  }
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  return {
    crowd,
    // s: the state (timeline.js) plus s.lookEl, the rock's height in the sky (deg) for where they look
    frame(v, s) {
      const st = s.stop, i = s.i;
      const dt = s.dt;
      const lookUp = clamp(0.25 + s.lookEl / 40, 0.2, 1.1);
      for (const p of PEOPLE) {
        const c = p.st[i], a = c.act, kid = p.s < 0.7;
        let x = p.x, z = p.z;
        let yaw = p.yaw0 + wobble(v * 0.35, p.ph) * 0.1, armL = 0.08, armR = 0.08, look = lookUp, pitch = 0, roll = 0, sit = 0, y = 0;
        let walk = 0, stride = 0, visible = true;
        // the flash at the hit (everyone squints; some throw an arm over their eyes)
        const tf = st.hit + 0.03 + 0.2 * c.dly;
        const fl = smooth(tf, tf + 0.16, v) * (1 - smooth(tf + 0.7, tf + 1.2, v));
        // ---- getting down: arms over the head (w: 0..1); couples hold on to each other ----
        const getDown = (w, deep) => {
          if (w <= 0) return;
          if (p.partner !== undefined) {
            const q = PEOPLE[p.partner];
            let dy = Math.atan2(q.x - p.x, q.z - p.z) - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            yaw += dy * w * 0.85;
          }
          sit = Math.max(sit, w * deep); y = Math.min(y, -0.3 * w * deep); pitch += (0.25 + 0.9 * (deep - 0.8)) * w;
          armL = lerp(armL, 1.5, w); armR = lerp(armR, 1.5, w); look = lerp(look, -0.45, w);
        };
        if (i === 0) {
          // ---- house-size: pointing at it, filming it ----
          if (kid || a < 0.3) { armR = 1.22 + 0.04 * Math.sin(v * 1.7 + p.ph); armL = a < 0.12 ? 1.12 : 0.25; look *= 0.85; }   // filming
          else if (a < 0.5) { armL = 1.5 + 0.06 * Math.sin(v * 2.3 + p.ph); armR = 0.1; }                                    // pointing
          armR = lerp(armR, 1.45, fl * (a > 0.3 && a < 0.7 ? 1 : 0)); look = lerp(look, 0.15, fl * 0.6);
          getDown(smooth(st.you - 0.05 - 0.12 * c.dly, st.you + 0.12, v), 0.8);
        } else if (i === 1) {
          // ---- jumbo jet: watching, then down low as the glass bursts toward them ----
          if (a < 0.25) { armR = 1.22; armL = 0.2; }                                    // filming
          else if (a < 0.4) { armL = 1.5; armR = 0.1; }                                 // pointing
          else if (a < 0.48) { armL = armR = 1.6; }                                     // hands on their heads
          armR = lerp(armR, 1.45, fl); look = lerp(look, 0.1, fl);
          if (c.turn) yaw += 0.6 * fl * (p.x > 0 ? 1 : -1);
          const td = st.you - 1.9 + 0.7 * c.dly;
          getDown(smooth(td, td + 0.45, v), 0.95);
          if (v > td) yaw += 0.5 * smooth(td, td + 0.5, v) * (p.x > 0 ? 1 : -1) * c.r;     // (turned half away)
        } else if (i === 2) {
          // ---- skyscraper: the flash, then they turn and run up the steps toward you ----
          if (a < 0.3) { armL = 1.5; armR = 0.1; }
          else if (a < 0.52) { armR = 1.22; armL = 0.2; }
          armR = lerp(armR, 1.45, fl); look = lerp(look, 0.1, fl);
          const ts = st.hit + 0.35 + 0.075 * (-p.z - 2.5) + 0.12 * c.dly;
          const tr = v - ts;
          if (tr > 0) {
            const turn = smooth(0, 0.35, tr);
            const sp = 3.3;
            const run = Math.max(0, tr - 0.25);
            z = p.z + sp * (run - 0.3 * (1 - Math.exp(-run / 0.3)));
            // (the ones in front of you swerve out to either side as they come up to you)
            const side = p.x === 0 ? 1 : Math.sign(p.x);
            x = p.x + side * 0.9 * Math.max(0, z + 5.0);
            let face = Math.atan2(x - p.x, z - p.z + 1e-3);
            yaw = lerp(yaw, face, turn);
            walk = run * 11 + p.ph; stride = 1.6 * smooth(0, 0.3, run);
            armL = lerp(armL, 0.15, turn); armR = lerp(armR, 0.15, turn); look = lerp(look, 0.2, turn);
            pitch += 0.12 * turn;
            if (z > -0.6) visible = false;
          }
        } else if (i === 3) {
          // ---- Everest: watching it come; they drop flat as it lands ----
          if (a < 0.25) { armL = 1.5; armR = 0.1; }
          else if (a < 0.45) { armR = 1.22; armL = 0.2; }
          else if (a < 0.55) { armL = armR = 1.6; }
          armR = lerp(armR, 1.45, fl); look = lerp(look, 0.1, fl);
          const td = st.hit + 0.05 + 0.45 * c.dly;
          getDown(smooth(td, td + 0.35, v), 1.0);
          pitch += 0.55 * smooth(td + 0.2, td + 0.7, v);
        } else {
          // ---- Texas, the Moon: frozen, arms at their sides, staring up at it ----
          yaw = p.yaw0;
          armL = a < 0.15 ? 0.35 : 0.04; armR = a < 0.15 ? 0.3 : 0.04;
          look = Math.min(1.25, lookUp * 1.25) * (0.92 + 0.08 * c.r);
          if (a > 0.9) look *= 0.4;                                                     // (a few can't look)
        }
        // the boom: a stagger
        const kick = s.shake || 0;
        roll += kick * 0.05 * Math.sin(v * 17 + p.ph);
        crowd.pose(p.i, { x, y: floorY(x, z) + y, z, yaw, s: p.s, sit, pitch, roll, armL, armR, look, walk, stride, visible });
      }
      crowd.commit();
    },
  };
}
