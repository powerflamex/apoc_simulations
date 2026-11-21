// The people: a crowd on the plaza round you at frame 0 (backing away, phones up), people along the street and on the
// quay, a few on the far beach. Each has a plan worked out at load, so nobody pops in or out: they watch and film, and
// when the danger comes near them (a thing you lift or throw, you running past), they turn and run away from it on a
// straight line, at a running pace, stopping at a safe distance. Everything they do is a function of time.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { B } from './timeline.js';
import { SPOT, STREET, QUAY_Z, BUS, TRUCK, FAR_Z } from './layout.js';

const SHIRTS = [0x2f6fd0, 0xd23a3a, 0xf2f2ee, 0x1d1d1f, 0x3e8a4e, 0xe8c547, 0x7a4fb0, 0xf08a5d, 0x4bb3c8, 0xb0b8c0, 0xe46aa0, 0x2a3f6e];
const PANTS = [0x23262e, 0x34425e, 0x5a4a3a, 0xc8bfa8, 0x1d1d1f, 0x4a4f58];
// dangers: [time it starts, x, z, radius it scares people within]
const DANGER = [
  [-9, 0, 0, 9],                          // you with a car overhead (they're already backing off)
  [B.carToss, 0, 0, 10],                  // you throw the car
  [B.carToss + 0.6, -2.4, -15, 9],        // the car lands
  [B.busGrab, SPOT.bus.x, SPOT.bus.z, 14],
  [B.busLand - 0.4, -11, -54, 22],
  [B.truckGrab - 0.6, SPOT.truck.x, SPOT.truck.z, 18],
  [B.truckHit - 0.2, 6, -92, 26],
  [B.jetGrab - 0.6, SPOT.jet.x, SPOT.jet.z, 40],
  [B.shipGrab - 0.8, SPOT.ship.x, SPOT.ship.z, 60],
  [B.towerGrab - 0.8, SPOT.tower.x, SPOT.tower.z, 70],
  [B.leapLand - 0.3, SPOT.mtn.x, SPOT.mtn.z, 90],
];
// keep out of these boxes (things and your paths): [x0, x1, z0, z1]
const KEEP = [
  [BUS.x - 2.2, BUS.x + 2.2, BUS.z - 7.5, BUS.z + 7.5], [TRUCK.x - 2.2, TRUCK.x + 2.2, TRUCK.z - 11, TRUCK.z + 11],
  [-6, 2.0, -7.5, 1.6],                    // you, from the start to the bus
  [-7, 1.5, -21, -9],                      // where the car lands
  [8, 24, -56, -16],                       // your bounds from the truck to the jet
  [-6, 12, -21, -3],                       // you, from the bus to the truck
  [-14, -6, -75, -12],                     // the bus's flight path and where it lands (the street)
];
const inKeep = (x, z) => KEEP.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);

// where a person is at v: backing away (the ring round you), then each run in turn
function personPos(p, v) {
  let x = p.x0, z = p.z0, dist = 0, run = null, ran = null;
  if (p.back) {
    const tEnd = p.runs && p.runs.length ? p.runs[0].t0 : Infinity;
    const tb = Math.max(0, Math.min(v, tEnd) + 1.0);
    x += p.backDir[0] * 0.6 * tb; z += p.backDir[1] * 0.6 * tb; dist = 0.6 * tb;
  }
  for (const r of p.runs || []) {
    const t = v - r.t0;
    if (t <= 0) break;
    const tt = Math.min(t, r.dur);
    // ease in over the first 0.4 s
    const d = r.sp * (tt < 0.4 ? tt * tt / 0.8 : tt - 0.2);
    x += r.dx * d; z += r.dz * d; dist += d;
    if (t < r.dur) { run = r; ran = null; } else { run = null; ran = r; }
  }
  return { x, z, dist, run, ran };
}

export function makePeople() {
  const R = rng(4242);
  const list = [];
  const add = (x, z, o = {}) => {
    if (inKeep(x, z)) return;
    if (list.some((p) => Math.hypot(p.x0 - x, p.z0 - z) < 0.9)) return;
    const i = list.length;
    list.push({
      i, x0: x, z0: z, shirt: SHIRTS[Math.floor(R() * SHIRTS.length)], pants: PANTS[Math.floor(R() * PANTS.length)],
      skin: SKIN[Math.floor(R() * SKIN.length)], hair: HAIR[Math.floor(R() * HAIR.length)], sleeves: R() < 0.6,
      phone: R() < 0.65, h: 0.92 + 0.14 * R(), seed: R() * 100, react: 0.15 + 0.35 * R(), speed: 4.2 + 2.0 * R(), ...o,
    });
  };
  // the ring round you at frame 0: 4-16 m away, but none between you and the camera
  for (let k = 0; k < 90; k++) {
    const a = R() * Math.PI * 2, r = 4 + 12 * Math.sqrt(R());
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 2.0 && Math.abs(x - 0.8) < 3.2) continue;        // the camera's line
    if (z > 7.5) continue;
    add(x, z, { back: true });
  }
  // the street's west sidewalk and the plaza's edge along the street
  for (let z = 30; z > QUAY_Z + 6; z -= 1.6 + 2.5 * R()) add(STREET.x0 - 1.8 + (R() - 0.5) * 2, z);
  for (let z = -8; z > QUAY_Z + 6; z -= 2.0 + 3 * R()) add(STREET.x1 + 1.5 + 2.5 * R(), z);
  // the plaza by the quay (people come to see the ship), and along the apron fence
  for (let k = 0; k < 70; k++) add(-4 + 34 * R(), QUAY_Z + 3 + 30 * R());
  for (let k = 0; k < 30; k++) add(16 + 2.5 * R(), -20 - 70 * R());
  for (let k = 0; k < 25; k++) add(20 + 80 * R(), -10 - 6 * R());
  // by the tower and along the waterfront east
  for (let k = 0; k < 40; k++) add(85 + 60 * R(), -40 + 40 * R());
  // the far beach, either side of where you land
  for (let k = 0; k < 60; k++) { const x = -60 + 220 * R(); if (Math.abs(x - SPOT.mtn.x) < 7) continue; add(x, FAR_Z - 4 - 12 * R(), { beach: true }); }

  // each person's runs: every danger that comes within its radius of where they are at that moment sends them running
  // straight away from it for a few seconds (then they stop, turn round and film); worked out once, in time order
  const DS = [...DANGER].sort((a, b) => a[0] - b[0]);
  for (const p of list) {
    p.runs = [];
    if (p.back) { const d = Math.hypot(p.x0, p.z0) || 1; p.backDir = [p.x0 / d, p.z0 / d]; }
    const posAt = (t) => personPos(p, t);
    for (const [t, x, z, r] of DS) {
      if (t < -5) continue;
      const tr = t + p.react + 0.02 * Math.hypot(posAt(t).x - x, posAt(t).z - z);
      const q = posAt(tr);
      const d = Math.hypot(q.x - x, q.z - z);
      if (d > r) continue;
      // still running from the last one: start this run from where they are
      let dx = (q.x - x) / (d || 1), dz = (q.z - z) / (d || 1);
      const j = (R() - 0.5) * 0.6;
      [dx, dz] = [Math.cos(j) * dx - Math.sin(j) * dz, Math.sin(j) * dx + Math.cos(j) * dz];
      // don't run into the harbor
      if (q.z < QUAY_Z + 8 && dz < 0) dz = Math.abs(dz) * 0.5 + 0.3;
      const n = Math.hypot(dx, dz); dx /= n; dz /= n;
      // cut short any run still going
      const last = p.runs[p.runs.length - 1];
      if (last && tr < last.t0 + last.dur) last.dur = Math.max(0, tr - last.t0);
      p.runs.push({ t0: tr, dur: 2.2 + 2.5 * R() + (r > 30 ? 2 : 0), dx, dz, sp: p.speed * (r > 30 ? 1.25 : 1) });
    }
  }
  return {
    list,
    // pose everyone at v (crowd: the instanced figures)
    frame(v, crowd) {
      for (const p of list) {
        const P = personPos(p, v);
        let yaw, stride = 0, walk = 0, armR = 0, armL = 0;
        if (P.run) { yaw = Math.atan2(P.run.dx, P.run.dz); stride = 1.5; walk = P.dist * 2.2 + p.seed; armR = 0.15; }
        else if (P.ran) { yaw = Math.atan2(-P.ran.dx, -P.ran.dz) + 0.3 * Math.sin(p.seed); armR = p.phone ? 1 : 0; armL = p.phone ? 0 : 0.3; }
        else if (p.back) { yaw = Math.atan2(-p.backDir[0], -p.backDir[1]); stride = 0.45; walk = P.dist * 4.0 + p.seed; armR = p.phone ? 1 : 0; }
        else { yaw = Math.atan2(-P.x, -P.z) + 0.2 * Math.sin(p.seed); armR = p.phone ? 1.0 : 0; armL = p.phone ? 0 : 0.2 + 0.2 * Math.sin(v * 2 + p.seed); }
        crowd.pose(p.i, { x: P.x, y: 0, z: P.z, yaw, s: p.h, walk, stride, armL, armR, look: 0.25 });
      }
      crowd.commit();
    },
  };
}
