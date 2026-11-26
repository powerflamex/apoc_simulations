// The people: the crowd round the frame-0 camera (pointing up, screaming), people on both sidewalks and out of the
// stopped cars, and small groups by each of the far cameras down the avenue. Each has a plan worked out at load, so
// nobody pops in or out: they watch you (heads tilted up while you're in the air), point or film; when a push-off or
// landing comes near them they run straight away from it; when a big blast's front reaches them they duck, arms over
// their heads, then run. Everything they do is a function of time.
import { rng, smooth, clamp } from './util.js';
import { camAt, FAR_CAM } from './camera.js';
import { SKIN, HAIR } from './crowd.js';
import { EVENTS, SHOCK } from './events.js';
import { P, A, BUS, STREET, WALK, MID, TOWER } from './layout.js';
import { youAt } from './choreo.js';

const SHIRTS = [0x2f6fd0, 0xd23a3a, 0xf2f2ee, 0x1d1d1f, 0x3e8a4e, 0xe8c547, 0x7a4fb0, 0xf08a5d, 0x4bb3c8, 0xb0b8c0, 0xe46aa0, 0x2a3f6e];
const PANTS = [0x23262e, 0x34425e, 0x5a4a3a, 0xc8bfa8, 0x1d1d1f, 0x4a4f58];
// the dangers people run from: every push-off and landing, out to a radius that grows with it
const DANGER = EVENTS.filter((e) => !(e.kind === 'push' && e.N < 50)).map((e) => [e.t, e.x, e.z, Math.max(8.5, e.cars * 1.6, e.dust * 1.8, e.wreck * 1.6)]);
// the crouch before the last jump: the ground glowing and cracking under you; everyone near runs
DANGER.push([23.4, P.x, P.z, 140]);
// keep out of: the bus, your take-off and landing spots, the line from A over the bus
const KEEP = [[BUS.x - 1.8, BUS.x + 1.8, BUS.z - 7.0, BUS.z + 7.0], [A.x - 2.2, P.x + 2.4, -2.4, 3.2]];
const inKeep = (x, z) => KEEP.some(([a, b, c, d]) => x > a && x < b && z > c && z < d) || (x > MID.x - 0.3 && z > MID.z0 && z < MID.z1)
  || (x < TOWER.x + TOWER.w / 2 + 0.5 && x > TOWER.x - TOWER.w / 2 && z > TOWER.z - TOWER.d / 2 && z < TOWER.z + TOWER.d / 2) || Math.abs(x) > WALK - 0.4;

function personPos(p, v) {
  let x = p.x0, z = p.z0, dist = 0, run = null, ran = null;
  for (const r of p.runs) {
    const t = v - r.t0;
    if (t <= 0) break;
    const tt = Math.min(t, r.dur);
    const d = r.sp * (tt < 0.35 ? tt * tt / 0.7 : tt - 0.175);
    x += r.dx * d; z += r.dz * d; dist += d;
    if (t < r.dur) { run = r; ran = null; } else { run = null; ran = r; }
  }
  // stay on the street and sidewalks (not inside the buildings)
  if (!p.still) x = clamp(x, -WALK + 0.4, WALK - 0.4);
  return { x, z, dist, run, ran };
}

export function makePeople() {
  const R = rng(4242);
  const list = [];
  const add = (x, z, o = {}) => {
    if (!o.y0 && inKeep(x, z)) return;
    if (list.some((p) => (p.y0 || 0) === (o.y0 || 0) && Math.abs(p.z0 - z) < 1.0 && Math.hypot(p.x0 - x, p.z0 - z) < 0.85)) return;
    list.push({
      i: list.length, x0: x, z0: z, shirt: SHIRTS[Math.floor(R() * SHIRTS.length)], pants: PANTS[Math.floor(R() * PANTS.length)],
      skin: SKIN[Math.floor(R() * SKIN.length)], hair: HAIR[Math.floor(R() * HAIR.length)], sleeves: R() < 0.6,
      act: R(), h: 0.92 + 0.14 * R(), seed: R() * 100, react: 0.12 + 0.3 * R(), speed: 4.0 + 2.2 * R(), ...o,
    });
  };
  // on the 12-storey building's roof (by its street edge) and on the tower's open deck
  for (let k = 0; k < 7; k++) add(14.2 + 1.2 * R(), -9 + 3 * k + R(), { y0: 40.8, still: true });
  for (let k = 0; k < 14; k++) add(-16.4 - 1.2 * R(), -44 + 3.3 * k + R(), { y0: 366, still: true });
  // round the bus at frame 0: across the avenue (west of the bus, facing the camera as they look up at you) and on the
  // east sidewalk behind the camera
  for (let k = 0; k < 220; k++) {
    const x = -12.6 + 25 * R(), z = -14 + 30 * R();
    if (x > 3.8 && x < 8.6 && z > -3 && z < 5) continue;          // the camera's crane and your landing spot
    if (Math.abs(x) < 8 && R() < 0.45) continue;                   // thinner in the street (between the stopped cars)
    add(x, z, { ring: true });
  }
  // both sidewalks along the avenue, thinning out with distance
  for (const sx of [-1, 1]) for (let z = -160; z < 1900; z += 1.4 + 0.012 * Math.abs(z) + 2 * R()) add(sx * (STREET.x1 + 1.2 + 3.3 * R()), z);
  // the crowd down the avenue where the far shot of the last push-off is filmed from (in front of it and to its sides)
  {
    const cx = FAR_CAM[1], cz = FAR_CAM[3];
    for (let k = 0; k < 60; k++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 2.6, r = 2.5 + 24 * R();
      const x = cx + Math.cos(a) * r * 0.8, z = cz + Math.sin(a) * r;
      if (Math.abs(x - cx) < 1.4 && z < cz) continue;
      add(x, z, { group: true });
    }
  }
  // runs: every danger that reaches a person sends them running straight away from it; a big blast front that only
  // reaches them makes them duck first
  const DS = [...DANGER].sort((a, b) => a[0] - b[0]);
  for (const p of list) {
    p.runs = []; p.ducks = [];
    if (p.still) continue;
    const posAt = (t) => personPos(p, t);
    for (const [t, x, z, r] of DS) {
      const q0 = posAt(t);
      const d0 = Math.hypot(q0.x - x, q0.z - z);
      const tr = t + p.react + d0 / SHOCK;
      const q = posAt(tr);
      const d = Math.hypot(q.x - x, q.z - z);
      if (d > r) continue;
      let dx = (q.x - x) / (d || 1), dz = (q.z - z) / (d || 1);
      // along the avenue (away from you), not into the walls
      if (Math.abs(q.x) > STREET.x1) dx *= 0.25;
      dz = Math.sign(dz || 1) * Math.max(Math.abs(dz), 0.6);
      const j = (R() - 0.5) * 0.4;
      [dx, dz] = [Math.cos(j) * dx - Math.sin(j) * dz, Math.sin(j) * dx + Math.cos(j) * dz];
      const n = Math.hypot(dx, dz); dx /= n; dz /= n;
      const last = p.runs[p.runs.length - 1];
      if (last && tr < last.t0 + last.dur) last.dur = Math.max(0, tr - last.t0);
      const small = r < 12;
      p.runs.push({ t0: tr, dur: small ? 0.7 + 0.5 * R() : 2.5 + 3 * R(), dx, dz, sp: p.speed * (small ? 0.9 : 1.2) });
    }
    // ducking: when the front of a blast with broken glass or wrecked buildings passes them
    for (const e of EVENTS) {
      if (!e.glass && !e.wreck) continue;
      const q = posAt(e.t);
      const d = Math.hypot(q.x - e.x, q.z - e.z);
      if (d > e.glass * 1.2) continue;
      p.ducks.push(e.t + d / (420 + 0.4 * e.glass) + 0.05 + 0.1 * R());
    }
  }
  // leave out anyone whose path comes within 2.6 m of a city camera (or right in front of its lens)
  const CAMS = [];
  for (let t = -2.0; t < 46.5; t += 0.1) { const c = camAt(t); if (!c.space) CAMS.push([t, c.pos.x, c.pos.z, c.pos.y]); }
  const kept = list.filter((p) => {
    for (const [t, cx, cz, cy] of CAMS) {
      if (cy > 12) continue;
      const q = personPos(p, t);
      if (Math.hypot(q.x - cx, q.z - cz) < 1.5) return false;
    }
    return true;
  });
  kept.forEach((p, i) => { p.i = i; });
  list.length = 0; list.push(...kept);
  return {
    list,
    frame(v, crowd) {
      const Y = youAt(v);
      for (const p of list) {
        const Q = personPos(p, v);
        let yaw, stride = 0, walk = 0, armR = 0, armL = 0, sit = 0, pitch = 0, look = 0.25;
        // looking at you: up while you're in the air
        const toY = Math.atan2(P.x - Q.x, P.z - Q.z);
        const dd = Math.hypot(P.x - Q.x, P.z - Q.z);
        const up = Y.visible ? Math.atan2(Y.y, dd) : 0.6;
        look = clamp(0.2 + up * 1.4, 0, 1);
        // the most recent duck (1.6 s, then they run if a run follows)
        let duck = 0;
        for (const td of p.ducks) { const t = v - td; if (t > 0 && t < 2.4) duck = Math.max(duck, smooth(0, 0.18, t) * (1 - smooth(1.6, 2.4, t))); }
        if (Q.run && duck < 0.5) { yaw = Math.atan2(Q.run.dx, Q.run.dz); stride = 1.5; walk = Q.dist * 2.2 + p.seed; armR = 0.15; look = 0.1; }
        else {
          yaw = toY + 0.25 * Math.sin(p.seed);
          if (p.ring && v < 6) {
            // frame-0 crowd: pointing up (right arm overhead), filming, or hands to the head; a little sway
            if (p.act < 0.45) armR = 1.55 + 0.08 * Math.sin(v * 7 + p.seed);
            else if (p.act < 0.75) armR = 1.0;
            else { armR = 1.25; armL = 1.25; }
          } else if (Q.ran || p.group) { armR = p.act < 0.5 ? 1.0 : 0; armL = p.act > 0.8 ? 1.2 : 0.1; }
          else armR = p.act < 0.5 ? 1.0 : 0.1;
        }
        if (duck > 0) { sit = 0.55 * duck; pitch = 0.55 * duck; armL = Math.max(armL, 1.7 * duck); armR = Math.max(armR, 1.7 * duck); look = 0; stride *= 1 - duck; }
        crowd.pose(p.i, { x: Q.x, y: p.y0 || 0, z: Q.z, yaw, s: p.h, walk, stride, armL, armR, look, sit, pitch });
      }
      crowd.commit();
    },
  };
}
