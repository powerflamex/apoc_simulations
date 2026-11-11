// The people. Planned up front so nobody walks through anybody (or you), jumps or changes size:
//   - on both sidewalks a crowd stands looking up at the sky, half of them filming it with their phones held up; others
//     stroll north with you, others come down the sidewalk toward you (their faces lit by the sky);
//   - 0:05 the hit: everyone flinches (hands up over heads), then looks round; the ones under the transformer flinch
//     again at 0:07.5;
//   - 0:18 the phones: everyone filming looks down at the screen (no service);
//   - 0:22 people climb up out of the dark subway stairwell ahead of you and walk off down the sidewalk;
//   - 0:32 phone torches come on all along the street; 0:42 everyone looks up as the sky flares.
// Every path is checked once at load (0.2 s steps) against everyone else, your own path, the poles, the subway railings
// and the stairwell; a path that comes within reach of any of them is dropped.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM_X, camZ, CURB, FX, CROSS, SUBWAY, POLES, SIGNALS } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_HIT, V_XF, V_BUMP, V_PHONE, V_SUBWAY, V_SATS, V_TORCH, V_FLARE, ORIGIN } from './timeline.js';
import { XF } from './power.js';

const SHIRTS = [0x1d2230, 0xe8e2d6, 0x3a3328, 0x6b5a44, 0xc8d4e8, 0x7a2a2a, 0x24384a, 0xf0c060, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x8a5a8a, 0xd05030, 0x3a4a6a, 0xffffff, 0x60a0d0, 0xe86a8a, 0x40b0b0];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x8a7a66, 0xc9c2b6, 0x4a6a9a];

// a path: waypoints [x, z], a speed, the time it is at the first one (stand: one point)
function walker(pts, sp, t0, extra = {}) {
  const seg = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push({ a: pts[i], b: pts[i + 1], L0: L, d }); L += d; }
  return { pts, sp, t0, seg, L, ...extra };
}
function posOf(p, v, out = {}) {
  const raw = p.sp * (v - p.t0);
  const s = clamp(raw, 0, p.L);
  out.moving = raw > 0 && raw < p.L && p.L > 0;
  if (!p.seg.length) { out.x = p.pts[0][0]; out.z = p.pts[0][1]; out.yaw = p.yaw ?? Math.PI; out.s = 0; out.moving = false; return out; }
  let g = p.seg[p.seg.length - 1];
  for (const q of p.seg) if (s <= q.L0 + q.d) { g = q; break; }
  const u = g.d > 0 ? (s - g.L0) / g.d : 0;
  out.x = g.a[0] + (g.b[0] - g.a[0]) * u; out.z = g.a[1] + (g.b[1] - g.a[1]) * u;
  out.yaw = Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1]);
  out.s = s;
  return out;
}
// height of the ground under someone (the subway stairs go down northward from its south end)
const inStair = (x, z) => x > SUBWAY.x - SUBWAY.w / 2 && x < SUBWAY.x + SUBWAY.w / 2 && z < SUBWAY.z0 && z > SUBWAY.z1;
const yAt = (x, z) => (inStair(x, z) ? -SUBWAY.D * Math.min(1, (SUBWAY.z0 - z) / (SUBWAY.z0 - SUBWAY.z1 - 1.2)) : 0);

export const PEOPLE = [];
{
  const R = rng(1859);
  const obst = [
    ...POLES.map((p) => ({ x: p.x, z: p.z, r: 0.55 })), ...SIGNALS.map((s) => ({ x: s.x, z: s.z, r: 0.55 })),
  ];
  const STEPS = []; for (let v = -1.5; v <= 48.5; v += 0.2) STEPS.push(v);
  const NK = STEPS.length, tmp = {};
  const TR = [];
  const fits = (p) => {
    const xs = new Float32Array(NK), zs = new Float32Array(NK);
    for (let k = 0; k < NK; k++) {
      const v = STEPS[k];
      const a = posOf(p, v, tmp);
      xs[k] = a.x; zs[k] = a.z;
      if (p.sub && v < p.t0) { xs[k] = NaN; zs[k] = NaN; continue; }      // (not there yet: still down in the station)
      const bx = Math.abs(a.x);
      // sidewalks only (except the subway people on their stairs, and the crossing of the cross street on the east side)
      if (!p.gather && (bx < CURB + 0.5 || bx > FX - 0.4)) return false;
      if (!p.gather && a.z < CROSS[1] + 0.5 && a.z > CROSS[0] - 0.5 && !(a.x > CURB + 1.2 && a.x < FX - 1.2)) return false;
      // the stairwell and its railings: only the subway people, and only inside it
      const nearSub = a.x > SUBWAY.x - SUBWAY.w / 2 - 0.45 && a.x < SUBWAY.x + SUBWAY.w / 2 + 0.45 && a.z < SUBWAY.z0 + 0.25 && a.z > SUBWAY.z1 - 0.45;
      if (nearSub && !(p.sub && a.x > SUBWAY.x - SUBWAY.w / 2 + 0.3 && a.x < SUBWAY.x + SUBWAY.w / 2 - 0.3 && a.z > SUBWAY.z1 + 0.2)) return false;
      // you: keep clear, more so in front of the lens
      const cz = camZ(v), dz = a.z - cz, dx = a.x - CAM_X;
      if (dx * dx + dz * dz < (dz < 0 ? 1.7 : 1.0) ** 2) return false;
      for (const o of obst) if ((a.x - o.x) ** 2 + (a.z - o.z) ** 2 < o.r * o.r) return false;
      // the view from you down into the subway stays clear while people come up (0:21.5-0:25.5)
      if (v > 21.3 && v < 27.0 && !p.sub) { const ex = SUBWAY.x - CAM_X, ez = SUBWAY.z0 - cz, L2 = ex * ex + ez * ez, u = clamp((dx * ex + dz * ez) / L2, 0, 1); if ((dx - u * ex) ** 2 + (dz - u * ez) ** 2 < 0.8 * 0.8) return false; }
      // the view from you to the crashed car stays clear while people gather round it (0:35-0:40.5)
      if (v > 34.8 && v < 40.6 && !p.gather) { const ex = 2.6 - CAM_X, ez = CROSS[1] - 3.55 - cz, L2 = ex * ex + ez * ez, u = clamp((dx * ex + dz * ez) / L2, 0, 1); if (u * Math.sqrt(L2) > 0.8 && (dx - u * ex) ** 2 + (dz - u * ez) ** 2 < 0.75 * 0.75) return false; }
      // the view from you to the crossing stays clear while you watch the cars (0:11.5-0:15.7)
      if (v > 11.4 && v < 15.8) { const ex = 0.5 - CAM_X, ez = CROSS[1] - 3.2 - cz, L2 = ex * ex + ez * ez, u = clamp((dx * ex + dz * ez) / L2, 0, 1); if (u * Math.sqrt(L2) > 1.2 && (dx - u * ex) ** 2 + (dz - u * ez) ** 2 < 0.7 * 0.7) return false; }
      for (const t of TR) { const ex = a.x - t.xs[k], ez = a.z - t.zs[k]; if (ex * ex + ez * ez < 0.36) return false; }
    }
    TR.push({ xs, zs });
    return true;
  };
  const add = (p) => { if (fits(p)) { PEOPLE.push(p); return true; } return false; };
  const ACT = () => (R() < 0.55 ? 'phone' : R() < 0.3 ? 'point' : 'look');
  const sideX = (s) => s * (CURB + 0.8 + R() * (FX - CURB - 1.6));
  // ---- hand placed around you on frame 0 (in view: ahead and a little to the sides): [x, z, act] ----
  for (const [x, z, act] of [[8.1, 4.4, "phone"], [8.0, 2.0, "look"], [8.3, -0.4, "phone"], [7.95, -3.2, "point"], [11.9, 1.2, "phone"], [12.0, -5.5, "phone"], [8.2, -6.2, "phone"], [9.2, -8.6, "look"]]) {
    add(walker([[x, z]], 0, 0, { act, yaw: Math.PI + (R() - 0.5) * 0.7, near: true }));
  }
  // ---- walking just ahead of you at your pace, looking up (they step aside before the subway) ----
  for (const [x, dz, act] of [[9.0, 2.6, "phone"], [10.9, 3.1, "look"], [8.3, 4.4, "phone"], [10.1, 4.9, "phone"], [11.1, 5.9, "point"], [9.2, 6.6, "look"], [10.6, 7.6, "phone"], [8.6, 8.6, "phone"], [9.9, 9.6, "look"], [11.0, 10.4, "phone"]]) {
    const z0 = camZ(-3) - dz;
    add(walker([[x, z0], [x, -70]], 0.33, -3, { act, ahead: true }));
  }
  // ---- out of the subway: up the stairs toward you from the black door at the bottom, phones lit, then off down the
  //      sidewalk (one file up each side of the stairs, a person every ~1.1 s in each) ----
  for (let k = 0; k < 24; k++) {
    const col = k % 2, x = SUBWAY.x + (col ? 0.42 : -0.42);
    const lane = col ? 13.3 : 12.65;
    const pts = [[x, SUBWAY.z1 + 0.35], [x, SUBWAY.z0 + 0.6], [lane, SUBWAY.z0 + 1.6 + 0.6 * (1 - col)], [lane, 40]];
    add(walker(pts, 0.95, V_SUBWAY - 3.4 + k * 0.55 + R() * 0.1, { act: "none", sub: true }));
  }
  // ---- 0:32-0:36 a few people walk out from the far corner to the crashed car in the crossing and stand round its light (and its radio) ----
  {
    const NX = 2.5, NZ = CROSS[1] - 3.2 - 0.35;
    const spots = [[4.7, NZ + 1.0], [4.9, NZ - 1.1], [3.5, NZ + 3.3], [5.5, NZ + 2.6], [5.6, NZ - 2.8], [4.1, NZ - 3.4], [1.0, NZ + 3.4]];
    spots.forEach(([sx, sz], k) => {
      const x0 = 8.4 + (k % 4) * 1.1, z0 = CROSS[0] - 0.8 - Math.floor(k / 4) * 0.9;
      add(walker([[x0, z0], [sx, sz]], 1.0, 31.8 + k * 0.5, { act: "none", gather: true, face: [NX, NZ] }));
    });
  }
  // ---- standing and looking up, both sidewalks ----
  for (let k = 0; k < 3000 && PEOPLE.length < 120; k++) {
    const s = R() < 0.55 ? 1 : -1, z = s > 0 ? 10 - R() * 40 : 14 - R() * 70;
    add(walker([[sideX(s), z]], 0, 0, { act: ACT(), yaw: Math.PI + (R() - 0.5) * 1.2 }));
  }
  // ---- strolling north with you (some faster, passing you), stopping at the corner ----
  for (let k = 0; k < 1500 && PEOPLE.length < 150; k++) {
    const s = R() < 0.6 ? 1 : -1, x = sideX(s), sp = 0.45 + R() * 0.7, z0 = 16 + R() * 10;
    const zEnd = CROSS[1] + 0.7 + R() * 1.5;
    add(walker([[x, z0], [x + (R() - 0.5) * 0.6, zEnd]], sp, -4 + R() * 8, { act: R() < 0.5 ? 'phone' : 'look', stroll: true }));
  }
  // ---- coming down the sidewalk toward you (across the cross street on the east side) ----
  for (let k = 0; k < 2000 && PEOPLE.length < 190; k++) {
    const s = R() < 0.65 ? 1 : -1, x = sideX(s), sp = 0.9 + R() * 0.5;
    const z0 = s > 0 ? -70 - R() * 30 : CROSS[1] + 0.7 + R() * 3;
    add(walker([[x, z0], [x + (R() - 0.5) * 0.8, 40]], sp, -30 + R() * 50, { act: R() < 0.35 ? 'phone' : 'none', toward: true }));
  }
  // ---- far along both sidewalks, beyond the crossing (standing) ----
  for (let k = 0; k < 1500 && PEOPLE.length < 270; k++) {
    const s = R() < 0.5 ? 1 : -1;
    add(walker([[sideX(s), -44 - R() * 90]], 0, 0, { act: ACT(), yaw: Math.PI + (R() - 0.5) * 1.6 }));
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.35;
    p.s = R() < 0.06 ? 0.72 : 0.92 + R() * 0.16;
    p.ph = R() * 10;
    p.tHit = V_HIT + Math.hypot(p.pts[0][0] - ORIGIN.x, p.pts[0][1] - ORIGIN.z) / 140 + 0.12 + R() * 0.25;
    p.torch = R() < 0.55 || p.sub || p.gather;
    p.torchTurn = (R() - 0.5) * 2 * Math.PI;
    p.tTorch = p.sub ? p.t0 - 0.5 : p.gather ? p.t0 + 0.5 : V_TORCH + R() * 5;
    p.tPhone = V_PHONE - 0.3 + R() * 1.5;
    p.lookAround = R();
  });
  console.log(`people: ${PEOPLE.length}`);
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  const a = {};
  return {
    crowd,
    // torches: [x, z, yaw, strength] for the ground spots
    frame(v, glows, torches, camPos) {
      for (const p of PEOPLE) {
        posOf(p, v, a);
        if (p.sub && (v < p.t0 - 0.01)) { crowd.pose(p.i, { x: 0, y: -50, z: 0, visible: false }); continue; }
        let yaw = p.seg.length ? a.yaw : p.yaw, stride = 0, walk = 0, armL = 0, armR = 0, look = 0.55, pitch = 0;
        if (a.moving) { stride = p.ahead ? 0.45 : 0.9; walk = a.s * (p.ahead ? 5.0 : 3.4) + p.ph; look = p.toward ? 0.15 : p.ahead ? 0.6 : 0.35; }
        if (p.sub) look = 0.05;
        // standing: a slow sway, now and then a look round
        if (!a.moving) yaw += wobble(v * 0.3, p.ph) * 0.25;
        const act = p.act;
        let phone = false;
        if (act === 'phone') { armR = 1.3; armL = 0.25; phone = true; look = Math.max(look, 0.6); }
        else if (act === 'point') { armL = 1.15 + 0.1 * Math.sin(v * 1.3 + p.ph); look = 0.6; }
        else if (act === 'look') look = 0.7;
        // the hit: flinch, hands over the head, then a look round
        const fl = smooth(p.tHit, p.tHit + 0.15, v) * (1 - smooth(p.tHit + 0.9, p.tHit + 1.6, v));
        const nearXF = Math.hypot(a.x - XF.x, a.z - XF.z) < 13;
        const fl2 = nearXF ? smooth(V_XF + 0.05, V_XF + 0.2, v) * (1 - smooth(V_XF + 1.0, V_XF + 1.8, v)) : 0;
        const f = Math.max(fl, fl2);
        if (f > 0) { armL = lerp(armL, 1.6, f); armR = lerp(armR, 1.6, f); look = lerp(look, -0.2, f); pitch += 0.22 * f; }
        if (v > p.tHit + 1.0 && v < V_PHONE) {
          const r = smooth(p.tHit + 1.0, p.tHit + 1.8, v) * (1 - smooth(V_PHONE - 1.5, V_PHONE - 0.5, v));
          yaw += r * 0.7 * Math.sin(v * 0.8 + p.ph) * (p.lookAround - 0.3);
          if (!a.moving) look = lerp(look, 0.3, r);
        }
        // the bump at the crossing: a look over there
        if (!a.moving && a.z > -26 && a.z < 6 && v > V_BUMP && v < V_BUMP + 3.5 && p.lookAround > 0.5) {
          const k = smooth(V_BUMP + 0.1, V_BUMP + 0.5, v) * (1 - smooth(V_BUMP + 2.6, V_BUMP + 3.5, v));
          yaw = lerp(yaw, Math.atan2(1 - a.x, -31 - a.z), k); look = lerp(look, 0.0, k);
        }
        // no service: phones down to look at the screen
        let alert = 0;
        if (phone) {
          alert = smooth(p.tPhone, p.tPhone + 0.4, v) * (1 - smooth(p.tPhone + 5, p.tPhone + 6, v));
          armR = lerp(armR, 0.62, alert); look = lerp(look, -0.25, alert);
        }
        // torches: the phone held out, pointing ahead at the ground
        const tor = p.torch ? smooth(p.tTorch, p.tTorch + 0.5, v) * (1 - smooth(V_FLARE + 0.5, V_FLARE + 1.5, v)) : 0;
        if (tor > 0) { armR = lerp(armR, 0.85, tor); look = lerp(look, 0.1, tor); if (!a.moving) yaw += p.torchTurn * smooth(p.tTorch, p.tTorch + 1.5, v); }
        // the satellites: people point up at them
        {
          const sp = !a.moving && !p.gather && p.lookAround > 0.2 ? smooth(V_SATS + 0.3 + (p.ph % 1) * 0.8, V_SATS + 0.9 + (p.ph % 1) * 0.8, v) * (1 - smooth(V_SATS + 5.0, V_SATS + 5.8, v)) : 0;
          if (sp > 0) { armL = lerp(armL, 1.5, sp); look = lerp(look, 0.85, sp); yaw = lerp(yaw, Math.PI + 0.35, sp * 0.6); }
        }
        if (p.face && !a.moving && v > p.t0) yaw = lerp(yaw, Math.atan2(p.face[0] - a.x, p.face[1] - a.z), smooth(p.t0, p.t0 + 6, v));
        // the flare: everyone looks up, a hand up against the light
        const up = smooth(V_FLARE + 0.3 + (p.ph % 1) * 0.8, V_FLARE + 1.2 + (p.ph % 1) * 0.8, v);
        if (up > 0) { look = lerp(look, 0.75, up); armL = lerp(armL, 1.25, up * (act === 'phone' ? 0 : 1)); armR = lerp(armR, 1.0, up); }
        const y = yAt(a.x, a.z);
        crowd.pose(p.i, { x: a.x, y, z: a.z, yaw, s: p.s, walk, stride, pitch, armL, armR, look });
        // the phone's screen (from behind: a glow at the hand); its torch once it's on
        if (phone || tor > 0) {
          const hx = a.x + (Math.sin(yaw) * 0.6 + Math.cos(yaw) * 0.215) * p.s, hz = a.z + (Math.cos(yaw) * 0.6 - Math.sin(yaw) * 0.215) * p.s;
          const hy = y + (1.42 - 0.25 * (alert + tor)) * p.s;
          if (phone && tor < 0.5) glows.add(hx, hy + 0.12 * (1 - alert), hz, 0.13, 1.4 + 0.8 * alert, 1.6 + 0.4 * alert, 2.2 - 0.4 * alert);
          if (tor > 0) {
            glows.add(hx + Math.sin(yaw) * 0.05, hy, hz + Math.cos(yaw) * 0.05, 0.22 * tor, 6 * tor, 6 * tor, 5.6 * tor);
            torches.push([hx, hz, yaw, tor, Math.hypot(hx - camPos.x, hz - camPos.z), hy, p.sub && inStair(a.x, a.z)]);
          }
        }
      }
      crowd.commit();
    },
  };
}
