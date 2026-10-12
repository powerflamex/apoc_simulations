// The crowd at Shibuya Crossing, planned once up front (pure data, no three.js) so nobody ever walks through
// anybody: each person's whole path is checked against everyone already placed (and the creeping cars) every
// 0.1 s of the part of the video where people move, and dropped if it ever comes within GAP of someone.
// Nothing gets pushed around frame by frame, so nobody jumps.
//   people at the scramble: walking corner to corner (straight over the crosswalks or through the middle);
//   on the sidewalks: walking along, or waiting at the corners.
// When the women vanish the men stop (a startled moment, then a few steps to a halt) and stand looking around.
import { rng, clamp } from './util.js';
import { V_EVENT } from './timeline.js';
import { RX, RZ, CW, CARS, carsAlong, carPose } from './traffic.js';

export const CAM0 = { x: RX + 1.4, z: RZ + 1.3 };   // where the camera stands (the north-east corner at the curb, looking across)
const GAP = 0.8;
const T0 = -1.2, T1 = V_EVENT + 10, DT = 0.1;      // the planned window (real seconds)
const STOP = 0.75;                                  // seconds from walking to standing

// position along a person's path at real time t (they stop after the vanishing, if they're men)
function uAt(p, t) {
  if (p.woman || t <= p.te) return p.u0 + p.speed * t;
  const ue = p.u0 + p.speed * p.te, d = Math.min(t - p.te, STOP);
  return ue + p.speed * (d - d * d / (2 * STOP));
}
export function personAt(p, t) {
  if (p.kind === 'wait') return { x: p.x, z: p.z, yaw: p.yaw, moving: false };
  const u = clamp(uAt(p, t), 0, p.len);
  const moving = u > 0 && u < p.len && (p.woman || t < p.te + STOP);
  return { x: p.ax + p.dx * u, z: p.az + p.dz * u, yaw: Math.atan2(p.dx, p.dz), moving, u };   // (a person faces their local +z)
}

export const PEOPLE = [];
export const ITEMS = [];   // what each woman was carrying (it drops when she vanishes)
{
  const R = rng(2208);
  const corner = (sx, sz) => ({ x: sx * (RX + 2.2), z: sz * (RZ + 2.2) });
  const cand = [];
  // the scramble
  for (let i = 0; i < 5200; i++) {
    const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1;
    const r = R();
    let a, b;
    if (r < 0.32) {          // along x over a crosswalk on the north or south side
      const z = sz * (RZ + 0.9 + R() * (CW - 1.8));
      a = { x: sx * (RX + 1.5 + R() * 2), z }; b = { x: -sx * (RX + 1.5 + R() * 2), z };
    } else if (r < 0.62) {   // along z over a crosswalk on the east or west side
      const x = sx * (RX + 0.9 + R() * (CW - 1.8));
      a = { x, z: sz * (RZ + 1.5 + R() * 2) }; b = { x, z: -sz * (RZ + 1.5 + R() * 2) };
    } else {                 // through the middle: to the opposite corner or one beside it
      const A = corner(sx, sz), opp = R() < 0.6;
      const B = opp ? corner(-sx, -sz) : (R() < 0.5 ? corner(-sx, sz) : corner(sx, -sz));
      const nx = -(B.z - A.z), nz = B.x - A.x, nl = Math.hypot(nx, nz), off = (R() - 0.5) * (opp ? 9 : 6);
      a = { x: A.x + nx / nl * off, z: A.z + nz / nl * off }; b = { x: B.x + nx / nl * off, z: B.z + nz / nl * off };
    }
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    cand.push({ kind: 'cross', ax: a.x, az: a.z, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, len, u0: R() * len * 0.8 - 6, speed: 1.15 + R() * 0.5 });
  }
  // the sidewalks: people walking along the roads, and people waiting at the corners for the next green
  for (let i = 0; i < 1600; i++) {
    const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1;
    if (R() < 0.6) {
      const alongX = R() < 0.5, dir = R() < 0.5 ? -1 : 1, off = 1.0 + R() * (CW + 0.5);
      const s0 = (alongX ? RX : RZ) + 3 + R() * 70;
      const ax = alongX ? sx * s0 : sx * (RX + off), az = alongX ? sz * (RZ + off) : sz * s0;
      const dx = alongX ? dir : 0, dz = alongX ? 0 : dir;
      cand.push({ kind: 'walk', ax, az, dx, dz, len: 200, u0: 2, speed: 1.05 + R() * 0.45 });
    } else {
      cand.push({ kind: 'wait', x: sx * (RX + 0.8 + R() * (CW + 1)), z: sz * (RZ + 0.8 + R() * (CW + 1)), yaw: R() * 6.28 });
    }
  }
  // the creeping cars, sampled over the same window (people keep out of their way)
  const NS = Math.round((T1 - T0) / DT) + 1;
  const carAt = Array.from({ length: NS }, (_, k) => { const t = T0 + k * DT, al = carsAlong(Math.max(0, t - V_EVENT)); return CARS.map((c, i) => (c.driverless ? { ...carPose(i, al[i]), c } : null)).filter(Boolean); });
  const grids = Array.from({ length: NS }, () => new Map());
  const key = (x, z) => `${Math.floor(x / GAP)},${Math.floor(z / GAP)}`;
  const posAt = (p, t) => personAt(p, t);
  const blocked = (p) => {
    for (let k = 0; k < NS; k++) {
      const t = T0 + k * DT;
      if (p.woman && t > V_EVENT) break;
      const q = posAt(p, t);
      // keep clear of the camera (nobody right at the lens, nobody walking straight at it from close by)
      const cx = q.x - CAM0.x, cz = q.z - CAM0.z, cd = Math.hypot(cx, cz);
      if (cd < 2.6) return true;
      if (cd < 10 && q.moving && -(cx * p.dx + cz * p.dz) / cd > 0.5) return true;
      // keep off the roads where the cars wait (only the crossing and the sidewalks are for walking)
      if (Math.abs(q.x) > RX + CW + 0.4 && Math.abs(q.z) < RZ - 0.3) return true;
      if (Math.abs(q.z) > RZ + CW + 0.4 && Math.abs(q.x) < RX - 0.3) return true;
      // and out of the way of the creeping cars
      for (const c of carAt[k]) {
        const along = c.c.axis === 'x' ? Math.abs(q.x - c.x) : Math.abs(q.z - c.z), across = c.c.axis === 'x' ? Math.abs(q.z - c.z) : Math.abs(q.x - c.x);
        if (along < c.c.len / 2 + 0.7 && across < 1.6) return true;
      }
      const gx = Math.floor(q.x / GAP), gz = Math.floor(q.z / GAP);
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        const cell = grids[k].get(`${gx + ix},${gz + iz}`);
        if (cell) for (const o of cell) if (Math.hypot(o.x - q.x, o.z - q.z) < GAP) return true;
      }
    }
    return false;
  };
  const place = (p) => {
    for (let k = 0; k < NS; k++) {
      const t = T0 + k * DT;
      if (p.woman && t > V_EVENT) break;
      const q = posAt(p, t), kk = key(q.x, q.z);
      (grids[k].get(kk) || grids[k].set(kk, []).get(kk)).push(q);
    }
  };
  const want = { cross: 560, walk: 260, wait: 170 }, got = { cross: 0, walk: 0, wait: 0 };
  const clothes = [0x1d1d1d, 0x2b2d42, 0xedf2f4, 0x8d99ae, 0x3a3a3a, 0xc9c1b1, 0x5c6b73, 0xe9c46a, 0xef233c, 0x264653, 0xf1faee, 0x6d597a, 0x9c6644, 0xb5838d];
  const dress = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0xf28482];
  const skin = [0xf1c8a6, 0xe8b996, 0xdba882, 0xf6d5bd, 0xc68a62];
  const hair = [0x1d1612, 0x2e2018, 0x4a3020, 0x6b4a2a, 0x151515, 0x8a5a30];
  const bagC = [0xc1121f, 0x1d1d1d, 0xf4e3c1, 0x6f4518, 0xe76f51, 0x2a9d8f, 0xffffff, 0xe9c46a, 0x7b2cbf];
  for (const p of cand) {
    if (got[p.kind] >= want[p.kind]) continue;
    p.woman = R() < 0.5;
    p.child = R() < 0.06;
    p.te = V_EVENT + 0.25 + R() * 0.65;            // (men: the moment they react)
    if (blocked(p)) continue;
    place(p);
    got[p.kind]++;
    p.h = p.child ? 0.6 + R() * 0.14 : p.woman ? 0.9 + R() * 0.1 : 0.96 + R() * 0.12;
    p.ph = R() * 6.28;
    p.phone = R() < 0.22;
    p.umb = R() < 0.05;
    p.shirt = clothes[Math.floor(R() * clothes.length)];
    p.pants = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x22333b][Math.floor(R() * 6)];
    p.skin = skin[Math.floor(R() * skin.length)];
    p.hair = hair[Math.floor(R() * hair.length)];
    p.sleeves = R() < 0.6;
    if (p.woman) {
      p.longHair = R() < 0.72;
      p.skirt = R() < 0.5 ? dress[Math.floor(R() * dress.length)] : 0;
      if (p.skirt && R() < 0.5) p.shirt = p.skirt;                 // a dress
      p.bag = R() < 0.7 ? bagC[Math.floor(R() * bagC.length)] : 0;
    }
    // the men, after: some turn right round, some hold up their phones, some crouch by what was left behind
    p.turn = (R() - 0.5) * 3.6;
    p.lookUp = R() < 0.3;
    p.crouch = R() < 0.07;
    p.callPhone = R() < 0.35;
    p.leave = R();                                  // (when he leaves the crossing in the time-lapse)
    PEOPLE.push(p);
    if (p.woman) {
      const q = personAt(p, V_EVENT), fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);   // facing
      const rx = -fz, rz = fx;                                                                  // her right
      const v = q.moving ? p.speed : 0;
      if (p.bag) ITEMS.push({ kind: 0, who: PEOPLE.length - 1, x: q.x + rx * 0.26, z: q.z + rz * 0.26, y0: 0.47 * p.h, vx: fx * v * 0.85, vz: fz * v * 0.85, yaw: q.yaw + (R() - 0.5) * 1.2, color: p.bag, spin: (R() - 0.5) * 6 });
      if (p.phone) ITEMS.push({ kind: 1, who: PEOPLE.length - 1, x: q.x + fx * 0.3 + rx * 0.12, z: q.z + fz * 0.3 + rz * 0.12, y0: 1.22 * p.h, vx: fx * v * 0.9, vz: fz * v * 0.9, yaw: q.yaw + (R() - 0.5) * 2, color: 0x111111, spin: (R() - 0.5) * 9 });
      if (p.umb) ITEMS.push({ kind: 2, who: PEOPLE.length - 1, x: q.x - rx * 0.25, z: q.z - rz * 0.25, y0: 1.0 * p.h, vx: fx * v * 0.8, vz: fz * v * 0.8, yaw: q.yaw + 1.2 + (R() - 0.5), color: [0x1d3557, 0xe63946, 0xffffff][Math.floor(R() * 3)], spin: (R() - 0.5) * 3 });
    }
  }
}
// a dropped thing at real time t after the vanishing: a short fall, a bounce, a slide to rest
export function itemAt(it, tau) {
  const g = 9.8, tf = Math.sqrt(2 * it.y0 / g);
  const t = Math.max(0, tau);
  if (t < tf) return { x: it.x + it.vx * t, z: it.z + it.vz * t, y: it.y0 - 0.5 * g * t * t, tilt: t / tf, landed: 0 };
  const s = Math.min(t - tf, 0.45), slide = 1 - (1 - s / 0.45) ** 2;
  return { x: it.x + it.vx * (tf + 0.18 * slide), z: it.z + it.vz * (tf + 0.18 * slide), y: 0, tilt: 1, landed: 1 };
}
