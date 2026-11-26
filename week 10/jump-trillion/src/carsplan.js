// The stopped traffic on the avenue (everyone stopped to look) and the bus, and what every blast does to them: a car
// inside a push-off's or landing's reach is thrown when the blast front gets to it (straight out from you and up,
// harder the closer it is), tumbles, lands, slides to a stop and stays there on its wheels, side or roof, until a
// bigger blast throws it again. All worked out at load; carAt(i, v) gives its matrix.
import * as THREE from 'three';
import { EVENTS, SHOCK, wallR } from './events.js';
import { P, A, BUS, STREET } from './layout.js';
import { rng } from './util.js';
import { camAt } from './camera.js';
// where the street cameras stand (no car may sit within 3.5 m of one)
export const CAM_XZ = [];
for (let t = -2; t < 46.4; t += 0.05) { const c = camAt(t); if (!c.space && c.pos.y < 8) CAM_XZ.push([c.pos.x, c.pos.z]); }
export const nearCam = (x, z, r) => CAM_XZ.some(([cx, cz]) => Math.abs(cz - z) < r && Math.hypot(cx - x, cz - z) < r);

const G = 9.81;
export const CARS = [];
{
  const R = rng(808);
  const PAINT = [0x2b5fb8, 0xd8d8d4, 0x1c1c1e, 0x8a1d1d, 0x6b7280, 0xe7e2d6, 0x2f4f3a, 0x9fb0c4, 0x343a46, 0xd9a62a];
  for (const lx of [-6, -2, 2, 6]) {
    for (let z = -260; z < 1900;) {
      const gap = 6.2 + 2.6 * R() + (Math.abs(z) > 300 ? 3 * R() : 0);
      z += gap;
      if (((((z - 60) % 120) + 180) % 120 - 60) ** 2 < 15 * 15) continue;           // the cross streets stay clear
      // keep clear: the bus, your spots and the line over the bus, the frame-0 camera's view
      if (Math.abs(lx - BUS.x) < 2.6 && Math.abs(z - BUS.z) < 9.5) continue;
      if (lx > -5 && lx < 7 && z > -7 && z < 6) continue;
      if (lx < 0 && z > -2 && z < 14) continue;
      if (R() < 0.12) continue;
      if (nearCam(lx, z, 3.8)) continue;
      CARS.push({ x: lx + (R() - 0.5) * 0.4, z, yaw: (lx > 0 ? Math.PI : 0) + (R() - 0.5) * 0.08, col: PAINT[Math.floor(R() * PAINT.length)], kind: Math.floor(R() * 4) });
    }
  }
  // two parked next to where you land (east curb), for the first flips
  CARS.push({ x: 6.4, z: 6.2, yaw: Math.PI, col: 0xe7e2d6, kind: 0 }, { x: 6.3, z: -6.4, yaw: Math.PI + 0.05, col: 0x2b5fb8, kind: 1 });
}
// the bus is thing -1: heavier (thrown 0.45x as hard), its middle 1.6 m up, 1.28 m half-width
const BODY = { car: { c: 0.75, side: 0.9, k: 1 }, bus: { c: 1.6, side: 1.28, k: 0.45 } };

function plan(o, body, seed) {
  const R = rng(seed);
  const throws = [];
  let rest = { x: o.x, z: o.z, yaw: o.yaw, roll: 0, pitch: 0 };
  for (const e of EVENTS) {
    if (!e.cars) continue;
    const r = Math.hypot(rest.x - e.x, rest.z - e.z);
    if (r > e.cars) continue;
    let t0 = e.t + r / SHOCK + 0.01;
    if (e.N >= 1e12) { let tt = e.t; while (wallR(tt) < r && tt < e.t + 6) tt += 0.02; t0 = tt; }
    // still flying from the last throw: skip (it lands first)
    const last = throws[throws.length - 1];
    if (last && t0 < last.t0 + last.tl + 0.3) continue;
    const f = 1 - r / e.cars;
    const sp = body.k * (3 + 7 * f + Math.min(45, 0.6 * Math.cbrt(e.N)) * f * f) * (0.6 + 0.6 * R());
    const up = (e.N > 3e7 ? 0.18 + 0.32 * R() : 0.5 + 0.35 * R());
    let dx = (rest.x - e.x) / (r || 1), dz = (rest.z - e.z) / (r || 1);
    const vx = dx * sp, vz = dz * sp, vy = sp * up;
    const tl = (2 * vy) / G;
    // tumble about the axis across the throw, a whole number of quarter turns by the time it lands
    const qt = Math.max(1, Math.round(((2 + 0.25 * sp) * (0.6 + 0.5 * R()) * tl) / (Math.PI / 2)));
    const ang = qt * Math.PI / 2;
    throws.push({ t0, tl, x0: rest.x, z0: rest.z, vx, vy, vz, ang, ax: dx, az: dz, roll0: rest.roll, yaw: rest.yaw });
    const slide = sp * 0.12;
    rest = { x: rest.x + vx * tl + dx * slide, z: rest.z + vz * tl + dz * slide, yaw: rest.yaw, roll: rest.roll + ang, pitch: 0, ax: dx, az: dz };
    rest.restAng = ang + (last ? last.restAng || 0 : 0);
    throws[throws.length - 1].restAng = rest.restAng;
  }
  return throws;
}
CARS.forEach((c, i) => { c.throws = plan(c, BODY.car, 1000 + i * 7); });
// the crouch before the last jump: drivers still on their wheels near you back away up and down the avenue
export const REV_T = 23.5;
CARS.forEach((c, i) => {
  const r = Math.hypot(c.x - P.x, c.z - P.z);
  const before = c.throws.filter((t) => t.t0 < REV_T);
  if (r > 160 || before.length) return;
  c.rev = { t0: REV_T + 0.25 + 0.006 * r + 0.4 * ((i * 0.618) % 1), dir: Math.sign(c.z - P.z) || 1, vmax: 6 + 3 * ((i * 0.377) % 1) };
});
export const BUSP = { x: BUS.x, z: BUS.z, yaw: 0 };
BUSP.throws = plan(BUSP, BODY.bus, 77);

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), qr = new THREE.Quaternion(), ax = new THREE.Vector3();
const pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), off = new THREE.Matrix4();
// the matrix that places a body (origin at its ground footprint's middle) at v
function bodyAt(o, body, v) {
  let x = o.x, z = o.z, y = 0, tilt = 0, tax = 1, taz = 0;
  for (const th of o.throws) {
    if (v < th.t0) break;
    const t = v - th.t0;
    const prevAng = th.restAng - th.ang;
    if (t < th.tl) {
      x = th.x0 + th.vx * t; z = th.z0 + th.vz * t; y = th.vy * t - 0.5 * G * t * t;
      tilt = prevAng + th.ang * (t / th.tl);
    } else {
      const s = Math.min(1, (t - th.tl) / 0.5);
      const slide = Math.hypot(th.vx, th.vz) * 0.12 * (1 - (1 - s) * (1 - s));
      x = th.x0 + th.vx * th.tl + th.ax * slide; z = th.z0 + th.vz * th.tl + th.az * slide; y = 0; tilt = th.restAng;
    }
    tax = th.ax; taz = th.az;
  }
  // backing away (until a blast throws it)
  if (o.rev && v > o.rev.t0 && !(o.throws.length && v >= o.throws[0].t0 && o.throws[0].t0 > o.rev.t0)) {
    const t = v - o.rev.t0, a = 3.0, tv = o.rev.vmax / a;
    const d = t < tv ? 0.5 * a * t * t : 0.5 * a * tv * tv + o.rev.vmax * (t - tv);
    z += o.rev.dir * d;
  }
  // tilt about the horizontal axis across the throw direction, through the body's middle
  ax.set(taz, 0, -tax).normalize();
  qy.setFromAxisAngle(up, o.yaw);
  qr.setFromAxisAngle(ax, tilt);
  q.copy(qr).multiply(qy);
  // resting on its side: the middle sits higher
  const sideK = Math.abs(Math.sin(tilt));
  const cy = body.c + (body.side - body.c) * sideK;
  pos.set(x, y + cy, z);
  m4.compose(pos, q, one);
  m4.multiply(off.makeTranslation(0, -body.c, 0));
  return m4;
}
export const carAt = (i, v) => bodyAt(CARS[i], BODY.car, v);
export const busAt = (v) => bodyAt(BUSP, BODY.bus, v);
