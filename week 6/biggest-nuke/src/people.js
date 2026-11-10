// The people on the promenade. Planned up front so nobody walks through anybody, jumps or changes size:
//   - a few right by you (hand placed): phones up, pointing, hands on their heads, shielding their eyes;
//   - the crowd along the promenade and the sidewalks: some still strolling on frame 0 (they slow and stop to stare),
//     most facing the light, half of them filming it;
//   - around 8.5 s everyone with a phone looks down at it: no signal;
//   - at 12 s the people round you turn and sprint past you on both sides, and most of the street goes with them; a
//     second wave breaks at 25 s, gets as far as the middle of the frame and gives up. Every path is booked at load so
//     that nobody passes through anybody (see the table below);
//   - from 38.6 s everyone left drops to the ground, heads down, arms over them. The dust takes the street; nobody is
//     ever shown hurt.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CAM0, FX, PROM, LAMPS, STALLS, groundY } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_PHONE, V_RUN as V_PANIC, V_DROP, V_BURN } from './timeline.js';
const V_ALERT = V_PHONE - 0.2, V_FIRE = V_BURN + 5, V_FILL = V_DROP, V_HUG = 14.2;

const SHIRTS = [0x1d2230, 0xe8e2d6, 0x3a3328, 0x6b5a44, 0xc8d4e8, 0x7a2a2a, 0x24384a, 0xf0c060, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x8a5a8a, 0xd05030, 0x3a4a6a, 0xffffff, 0x60a0d0];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x8a7a66, 0xc9c2b6];

// how far along their line someone is at time v: pushing off, full speed, slowing into the stop
const RUN_TAU = 0.28;
function runDist(r, v) {
  const t = v - r.t0;
  if (t <= 0) return 0;
  const s = r.sp * (t - RUN_TAU * (1 - Math.exp(-t / RUN_TAU)));
  return s < r.L - 1.2 ? s : r.L - 1.2 + 1.2 * (1 - Math.exp(-(s - r.L + 1.2) / 1.2));
}

export const PEOPLE = [];
{
  const R = rng(5150);
  // you look north; offsets [ahead, right] from you
  const fw = [0, -1], rt = [1, 0];
  const at = (a, r) => ({ x: CAM0.x + fw[0] * a + rt[0] * r, z: CAM0.z + fw[1] * a + rt[1] * r });
  const NEAR = [
    [3.2, 1.3, 'phone'], [3.0, -1.0, 'point'], [4.3, 2.4, 'phone'], [4.1, -1.5, 'head'], [4.9, 0.1, 'phone'],
    [5.6, 1.9, 'head'], [6.2, -2.2, 'phone'], [3.6, 2.9, 'point', 0.78], [6.9, 0.8, 'phone'], [3.5, -2.3, 'head'],
    [7.6, -0.7, 'point'], [8.3, 2.7, 'phone'], [4.6, 3.1, 'phone'], [9.1, -3.0, 'head'], [10.0, 1.5, 'phone'],
    [3.9, 4.0, 'phone'], [3.8, -3.4, 'look'], [11.0, -1.2, 'phone'],
  ];
  // the ones who don't run: a family and a couple right in front of you. They hold on to each other from 0:14 to the end
  const HUG = [[3.6, 1.1, 2], [3.6, 1.95, 3], [3.35, 1.5, 0, 0.62], [4.8, -2.5, 5], [4.8, -1.75, 4]];
  for (const [a, r, partner, s] of HUG) PEOPLE.push({ ...at(a, r), act: 'hug', s: s || 1, near: true, stay: true, partner });
  for (const [a, r, act, s] of NEAR) { const q = at(a, r); if (!STALLS.some((st) => Math.abs(q.x - st.x) < 1.7 && Math.abs(q.z - st.z) < 2.4)) PEOPLE.push({ ...q, act, s: s || 0.94 + R() * 0.12, near: true }); }
  // the crowd: a jittered scatter with at least 0.95 m between people
  const ok = (x, z) => PEOPLE.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > 0.95 * 0.95) && (x - CAM0.x) ** 2 + (z - CAM0.z) ** 2 > 4;
  const areas = [
    [-4.3, 4.3, -26, 5, 150],                         // the promenade, round you
    [-4.3, 4.3, -70, -26, 130],                       // further along it
    [-4.3, 4.3, -170, -70, 170],                      // down the hill: they come up past you in a stream
    [-21.5, -15.4, -16.5, 16.5, 45], [15.4, 21.5, -16.5, 16.5, 45],     // the sidewalks
    [-21.5, -15.4, -75, -17, 45], [15.4, 21.5, -75, -17, 45],
    [-21.5, -15.4, 17, 50, 18], [15.4, 21.5, 17, 50, 18],               // behind you
  ];
  for (const [x0, x1, z0, z1, n] of areas) {
    let placed = 0;
    for (let k = 0; k < n * 30 && placed < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!ok(x, z)) continue;
      if (STALLS.some((st) => Math.abs(x - st.x) < 1.7 && Math.abs(z - st.z) < 2.4)) continue;
      // a gap ahead of you (people stand back from the middle a little): you see the avenue and the wall come
      { const dx = x - CAM0.x, dz = CAM0.z - z; if (dz > 3 && dz < 26 && Math.abs(dx - dz * 0.1) < 0.8 + dz * 0.07) continue; }
      PEOPLE.push({ x, z, act: R() < 0.5 ? 'phone' : R() < 0.3 ? 'point' : R() < 0.3 ? 'head' : 'look', s: R() < 0.06 ? 0.72 : 0.92 + R() * 0.16 });
      placed++;
    }
  }
  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.6;
    p.ph = R() * 10;
    p.yaw0 = Math.PI + (R() - 0.5) * 0.6;            // facing north (yaw PI faces -z), toward the rod
    p.tReact = 0.3 + R() * 2.4;                      // when they start pointing / crying
    // the ones who can't look at it: they turn their backs on the light, an arm up over their eyes, one after another
    p.tTurn = p.act !== 'phone' && (p.near || R() < 0.4) ? 1.0 + R() * 4.6 : 1e9;
    p.tAlert = V_ALERT + R() * 0.5;                  // when their phone buzzes
    p.tCrouch = V_FILL - 0.5 + R() * 0.9;
    p.spin = (R() - 0.5) * 3;
    p.walk = null; p.run = null;
  });
  // walkers on frame 0: in the crossing, a few steps along a scramble direction, stopping by ~0.6-2.2 s
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.83, 0.55], [-0.83, -0.55], [0.83, -0.55], [-0.83, 0.55]];
  const clearSeg = (p, ax, az, bx, bz, minD) => PEOPLE.every((q) => {
    if (q === p) return true;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((q.x - ax) * dx + (q.z - az) * dz) / L2);
    return (ax + dx * t - q.x) ** 2 + (az + dz * t - q.z) ** 2 > minD * minD;
  });
  for (const p of PEOPLE) {
    if (p.near || Math.abs(p.x) > 14 || p.z < -30 || p.z > 6 || R() > 0.45) continue;
    const d = DIRS[Math.floor(R() * DIRS.length)];
    const tStop = 0.6 + R() * 1.6, sp = 1.25 + R() * 0.3;
    const L = sp * tStop / 2 + sp * 0.9;
    const ax = p.x - d[0] * L, az = p.z - d[1] * L;
    if (!clearSeg(p, ax, az, p.x, p.z, 0.8)) continue;
    p.walk = { dx: d[0], dz: d[1], tStop, sp };
  }
  // ---- the run (planned here, once, so nobody passes through anybody) ----
  // Every person's position is booked in a table (0.1 s slots, 1 m cells), standing at home to start with. Planning
  // someone's run means trying a path against everyone's bookings: it is taken only if they stay clear of everyone
  // the whole way, otherwise they try a later start or another line, and if nothing fits they stay where they are.
  // Paths are planned from the south end north, so the people nearest the way out go first. Past the camera nobody is
  // booked (you can't see them).
  const SL = 0.1, V0 = V_PANIC - 0.1, V1 = 45, NS = Math.ceil((V1 - V0) / SL), MIN = 0.75;     // (0.75 at each slot keeps two sprinters 0.6 m apart between slots)
  const key = (slot, ix, iz) => (slot * 4096 + (ix + 2048)) * 4096 + (iz + 2048);
  const table = new Map();
  const book = (id, pts) => pts.forEach((pt, slot) => {
    if (!pt) return;
    const k = key(slot, Math.floor(pt[0]), Math.floor(pt[1]));
    let c = table.get(k);
    if (!c) table.set(k, c = []);
    c.push(id, pt[0], pt[1]);
  });
  const unbook = (id, pts) => pts.forEach((pt, slot) => {
    if (!pt) return;
    const c = table.get(key(slot, Math.floor(pt[0]), Math.floor(pt[1])));
    if (c) for (let i = c.length - 3; i >= 0; i -= 3) if (c[i] === id) c.splice(i, 3);
  });
  const clear = (id, pts) => {
    for (let slot = 0; slot < NS; slot++) {
      const pt = pts[slot];
      if (!pt) continue;
      const ix = Math.floor(pt[0]), iz = Math.floor(pt[1]);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const c = table.get(key(slot, ix + a, iz + b));
        if (c) for (let i = 0; i < c.length; i += 3) if (c[i] !== id && (c[i + 1] - pt[0]) ** 2 + (c[i + 2] - pt[1]) ** 2 < MIN * MIN) return false;
      }
    }
    return true;
  };
  const SEEN_Z = CAM0.z + 0.5;
  const pathOf = (p) => Array.from({ length: NS }, (_, slot) => {
    const v = V0 + slot * SL;
    const s = p.run ? runDist(p.run, v) : 0;
    const x = p.x + (p.run ? p.run.dx * s : 0), z = p.z + (p.run ? p.run.dz * s : 0);
    return z > SEEN_Z ? null : [x, z];
  });
  // what a straight line can't go through: walls, parked cars, poles
  const POLES = LAMPS.filter((l) => Math.abs(l.z) < 90 && Math.abs(l.x) < 40);
  const blocked = (x, z) => {
    if (Math.abs(x) > FX - 0.4) return true;
    if (STALLS.some((st) => Math.abs(x - st.x) < 1.5 && Math.abs(z - st.z) < 2.2)) return true;
    if (Math.abs(x) > PROM - 0.5 && Math.abs(x) < 15) return true;          // (the stopped traffic)
    return POLES.some((q) => (x - q.x) ** 2 + (z - q.z) ** 2 < 0.45 * 0.45);
  };
  const reach = (p, dx, dz, Lmax) => {
    for (let s = 0.25; s < Lmax; s += 0.25) {
      const z = p.z + dz * s;
      if (z > SEEN_Z) return Lmax;
      if (blocked(p.x + dx * s, z)) return s - 0.7;
    }
    return Lmax;
  };
  const setRun = (p, dx, dz, L, sp, t0, turnBack) => { p.run = { dx, dz, L, sp, t0, turnBack, tStop: t0 + RUN_TAU + (L + 2) / sp }; };
  // try one line at a list of start times; true if it was taken (booked)
  function tryRun(p, dx, dz, Lmax, sp, t0, tries, step, turnBack = false) {
    const home = pathOf(p);                                     // (p.run is still null here)
    unbook(p.i, home);
    const n = Math.hypot(dx, dz); dx /= n; dz /= n;
    const L = reach(p, dx, dz, Lmax);
    if (L > 1.5) {
      for (let k = 0; k < tries; k++) {
        const t = t0 + k * step;
        setRun(p, dx, dz, Math.min(L, sp * (44.4 - t - RUN_TAU) - 2), sp, t, turnBack);
        if (p.run.L < 1.5) break;
        const pts = pathOf(p);
        const byCam = pts.some((pt) => pt && (pt[0] - CAM0.x) ** 2 + (pt[1] - CAM0.z + 0.4) ** 2 < 1.3 * 1.3);    // not through you
        if (!byCam && clear(p.i, pts)) { book(p.i, pts); return true; }
      }
    }
    p.run = null;
    book(p.i, home);
    return false;
  }
  for (const p of PEOPLE) book(p.i, pathOf(p));

  // who runs: all of the people round you, most of the crossing, most of the sidewalks. The rest freeze where they are.
  const onCross = (p) => Math.abs(p.x) < PROM;
  // (the ones who freeze are all in the north half of the crossing, so nobody between them and you blocks the way)
  const wants = PEOPLE.filter((p) => !p.stay && (p.near || (onCross(p) ? p.z > -10 || R() < 0.9 : R() < 0.8))).sort((a, b) => b.z - a.z);
  const SP = new Map(wants.map((p) => [p.i, 4.2 + R() * 1.3]));
  // a few passes: someone blocked on the first go gets another once the people in front of them have moved off
  for (let pass = 0; pass < 5; pass++) {
    for (const p of wants) {
      if (p.run || p.z > SEEN_Z) continue;                      // (behind you: out of the picture)
      const sp = SP.get(p.i);
      // (from further down the street they set off later, so people keep coming past you all the way to the end)
      const t0 = V_PANIC + (p.near ? R() * 0.4 + (CAM0.z - p.z) * 0.05 : pass * 0.45 + R() * 0.8 + Math.min((CAM0.z - p.z) * 0.1, 8 + 14 * R()));
      const beyond = SEEN_Z + 3 - p.z;
      if (Math.abs(p.x) > 15) { tryRun(p, 0, 1, SEEN_Z + 4 - p.z, sp, t0, 8, 0.25); continue; }    // straight along the sidewalk
      const off = p.x - CAM0.x, side = Math.abs(off) > 0.15 ? Math.sign(off) : R() < 0.5 ? -1 : 1;
      // through a gate beside you, a little out from where they stand; never straight at the camera
      for (let g = 0; g < (p.near ? 14 : 8); g++) {
        const gate = CAM0.x + (g % 4 === 3 ? -side : side) * (1.5 + Math.abs(off) * 0.55 + R() * 0.8 + g * 0.5);
        const dz = Math.max(CAM0.z - 0.5 - p.z, 0.5), dx = gate - p.x, n = Math.hypot(dx, dz);
        if (tryRun(p, dx, dz, beyond * n / dz, sp, t0, p.near ? 14 : 8, p.near ? 0.15 : 0.2)) break;
      }
    }
  }

  // the second wave: as the air catches fire, people who froze at the far side of the crossing break for it too, get as
  // far as the middle of the frame, give up, turn to look at it, and go down there. They are the crowd round you at the end.
  const SPOTS = [[3.2, 1.5], [3.9, -1.3], [5.0, 0.3], [5.6, 2.4], [6.3, -2.1], [7.3, 1.0], [8.1, -0.7], [8.8, 3.0], [9.5, -3.1], [4.5, 3.5], [4.7, -3.6], [10.6, 1.8]];
  for (const [a, r] of SPOTS) {
    const sx = CAM0.x + r, sz = CAM0.z - a;
    const who = PEOPLE.filter((p) => !p.run && !p.near && onCross(p) && p.z < sz - 4).sort((u, w) => Math.hypot(u.x - sx, u.z - sz) - Math.hypot(w.x - sx, w.z - sz));
    for (const p of who.slice(0, 8)) {
      if (tryRun(p, sx - p.x, sz - p.z, Math.hypot(sx - p.x, sz - p.z), 3.6 + R() * 1.2, V_FIRE + 0.2 + R() * 2.5, 12, 0.4, true)) break;
    }
  }
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  return {
    crowd,
    frame(v, s, glows) {
      for (const p of PEOPLE) {
        let x = p.x, z = p.z, yaw = p.yaw0, walk = v * 1.5 + p.ph, stride = 0, armL = 0, armR = 0, look = 0.3, pitch = 0, roll = 0, y = 0, sit = 0;
        yaw += wobble(v * 0.35, p.ph) * 0.18;
        if (p.walk && v < p.walk.tStop) {
          const w = p.walk, t = v - w.tStop;
          const dist = t < -w.tStop ? -w.sp * (t + w.tStop) + w.sp * w.tStop / 2 : (w.sp / (2 * w.tStop)) * t * t;
          x -= w.dx * dist; z -= w.dz * dist;
          const spd = t < -w.tStop ? w.sp : w.sp * (-t / w.tStop);
          yaw = lerp(Math.atan2(-w.dx, -w.dz) + Math.PI, p.yaw0, smooth(-0.8, 0, t));
          walk = v * 9 * Math.max(spd / w.sp, 0.25) + p.ph; stride = spd / w.sp;
          look = smooth(-1.2, 0, t) * 0.3;
        }
        const react = smooth(p.tReact, p.tReact + 0.6, v);
        if (p.act === 'phone') { armR = 1.0; armL = 0.25; look = Math.min(look, 0.3); }
        else if (p.act === 'point') { armL = 1.1 + 0.55 * react; armR = 0.1; }
        else if (p.act === 'head') { armL = armR = 1.6 * react; look = 0.6; }
        else if (p.act === 'look') { armR = 1.25 * smooth(0, 0.4, v - 0.1); look = 0.3; }     // a hand up against the light
        {
          const tt = smooth(p.tTurn, p.tTurn + 0.45, v);
          if (tt > 0) { yaw += Math.PI * tt; armR = lerp(armR, 1.3, tt); look = lerp(look, -0.1, tt); }
        }
        if (p.stay) {
          const w = smooth(V_HUG, V_HUG + 0.6, v), q = PEOPLE[p.partner];
          yaw = lerp(yaw, Math.atan2(q.x - p.x, q.z - p.z) + Math.PI, w);
          armL = armR = lerp(0.2, 1.05, w); look = lerp(look, -0.25, w);
        }
        // the alert: a glance down at the phone, then back up
        let alert = 0;
        if (p.act === 'phone') {
          alert = smooth(p.tAlert, p.tAlert + 0.35, v) * (1 - smooth(p.tAlert + 2.2, p.tAlert + 3.0, v));
          armR = lerp(armR, 0.62, alert); look = lerp(look, -0.1, alert);
        }
        let moving = false;
        if (p.run && v > p.run.t0) {
          const r = p.run, sx = runDist(r, v);
          x += r.dx * sx; z += r.dz * sx;
          moving = v < r.tStop;
          const turn = smooth(r.t0, r.t0 + 0.3, v);
          const back = r.turnBack ? smooth(r.tStop, r.tStop + 0.9, v) : 0;        // gave up: turns to look at it
          yaw = lerp(yaw, Math.atan2(-r.dx, -r.dz) + Math.PI, turn * (1 - back));
          if (moving) { walk = (v - r.t0) * r.sp * 2.4 + p.ph; stride = 1.5 * turn * clamp((r.tStop - v) / 0.7); armL = armR = 0.25; look = 0.2; alert = 0; }
          else { look = 0.7; armL = armR = 0.3; }
        }
        // the last seconds: down on the ground, head down, arms over it
        let crouch = 0;
        if (!moving && v > p.tCrouch) crouch = smooth(p.tCrouch, p.tCrouch + 0.7, v);
        if (crouch > 0) {
          sit = crouch; y = -0.42 * crouch; pitch += 0.4 * crouch;
          armL = lerp(armL, 0.7, crouch); armR = lerp(armR, 0.7, crouch); look = lerp(look, -0.5, crouch);
        }
        y += groundY(z);
        crowd.pose(p.i, { x, y, z, yaw, s: p.s, walk, stride, sit, pitch, roll, armL, armR, look });
        // the phone's screen (it faces them; seen from behind it glows; the alert flashes it white)
        if (p.act === 'phone' && (!p.run || v < p.run.t0) && v < p.tCrouch + 0.2) {
          const hx = x + (Math.sin(yaw) * 0.6 + Math.cos(yaw) * 0.215) * p.s, hz = z + (Math.cos(yaw) * 0.6 - Math.sin(yaw) * 0.215) * p.s;
          const fl = alert * 0.5;
          glows.add(hx, y + (1.42 - 0.5 * sit) * p.s, hz, 0.09 + 0.05 * fl, 0.9 + 3.5 * fl, 0.95 + 3.2 * fl, 1.1 + 3.0 * fl);
        }
      }
      crowd.commit();
    },
  };
}
