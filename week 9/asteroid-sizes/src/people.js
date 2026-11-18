// The crowd on the terrace: packed close in front of you on the steps and down to the railing, everyone facing the city.
// They never walk (so nobody can pass through anybody); every stop starts them over, staring up at the new rock, and
// they react to what it does:
//   - looking up at it: pointing, filming it, hands on their heads; kids held up;
//   - the flash: an arm over the eyes, a step back, some turn away from it (you see their faces);
//   - the blast coming: they crouch with their arms over their heads, couples hold on to each other.
// On frame 0 (the house-size fireball) they are already shielding their eyes from it.
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
      const dt = s.dt, th = s.th;
      for (const p of PEOPLE) {
        const c = p.st[i];
        let yaw = p.yaw0 + wobble(v * 0.35, p.ph) * 0.1, armL = 0, armR = 0, look = 0.5, pitch = 0, roll = 0, sit = 0, y = 0;
        // ---- staring up at it ----
        const lookUp = clamp(0.25 + s.lookEl / 40, 0.2, 1.0);
        look = lookUp;
        const a = c.act;
        if (i === 0) {
          // frame 0: the house-size fireball is blinding: most shield their eyes, some film it squinting
          if (a < 0.55) { armR = 1.38 + 0.05 * Math.sin(v * 2 + p.ph); armL = 0.15; look = 0.35; }
          else if (a < 0.75) { armR = 1.3; armL = 0.4; look = 0.45; }
          else if (a < 0.88) { armL = 1.32; armR = 0.2; look = 0.5; }
          else { armL = armR = 1.4; look = 0.3; }
        } else {
          if (a < 0.38) { armL = 1.32 + 0.22 * smooth(0, 0.6, dt) + 0.05 * Math.sin(v * 3 + p.ph); armR = 0.2; }          // pointing
          else if (a < 0.6) { armR = 1.3; armL = 0.35; }                                                                // filming
          else if (a < 0.82) { armL = armR = lerp(0.6, 1.65, smooth(0.1, 0.8, dt + c.dly * 0.4)); }                     // hands on their heads
          else { armR = 0.25; armL = 0.1; }
        }
        if (p.s < 0.7) { armR = 1.3; armL = 0.4; }
        // ---- the hit: the flash ----
        const tf = st.hit + 0.03 + 0.2 * c.dly;
        const fl = smooth(tf, tf + 0.16, v);
        if (fl > 0) {
          armR = lerp(armR, 1.42, fl); armL = lerp(armL, c.arm < 0.4 ? 1.45 : 0.5, fl); look = lerp(look, 0.1, fl);
          if (c.turn) yaw += Math.PI * 0.82 * smooth(tf + 0.15, tf + 0.85, v) * (p.x > 0 ? 1 : -1);
        }
        // ---- the blast coming: get down, arms over the head; couples hold on ----
        const tc = st.you - 1.3 - 0.9 * c.dly + (i === 0 ? 0.4 : 0);
        const dk = c.duck ? smooth(tc, tc + 0.5, v) : 0;
        if (p.partner !== undefined && v > tc) {
          const q = PEOPLE[p.partner];
          const w = smooth(tc, tc + 0.6, v);
          let dy = Math.atan2(q.x - p.x, q.z - p.z) - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          yaw += dy * w * 0.85;
          armL = lerp(armL, 0.75, w); armR = lerp(armR, 0.75, w); look = lerp(look, -0.3, w); pitch = 0.1 * w;
        } else if (dk > 0) {
          sit = dk * 0.8; y = -0.3 * dk; pitch += 0.2 * dk; armL = lerp(armL, 1.5, dk); armR = lerp(armR, 1.5, dk); look = lerp(look, -0.4, dk);
        } else if (v > tc) {
          // the rest brace, turned half away, an arm up
          const w = smooth(tc, tc + 0.6, v);
          yaw += 0.9 * w * (p.x > 0 ? 1 : -1) * (0.5 + c.r * 0.5); armL = lerp(armL, 1.45, w); armR = lerp(armR, 0.6, w); look = lerp(look, 0.0, w);
        }
        // the boom: a stagger
        const kick = s.shake || 0;
        roll += kick * 0.05 * Math.sin(v * 17 + p.ph);
        crowd.pose(p.i, { x: p.x, y: p.y + y, z: p.z, yaw, s: p.s, sit, pitch, roll, armL, armR, look });
      }
      crowd.commit();
    },
  };
}
