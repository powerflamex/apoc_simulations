// The people on Pike Street at the first frame: wading through ankle-deep water under umbrellas, hurrying.
// Everyone is getting off the street: most head for a shop door and step inside (out of the rain, upstairs), the
// rest walk off round the corner of 1st Ave. Each path is planned up front (walk along the sidewalk, turn, go in),
// and checked against everyone else's, so nobody walks through anybody and nobody pops in or out of view.
import { rng, smooth, lerp, clamp } from './util.js';
import { PIKE, FIRST, DOORS, CAM0 } from './layout.js';
import { SKIN, HAIR } from './crowd.js';

const COAT = [0x1c2833, 0x2c3e50, 0x7b241c, 0x1f618d, 0x145a32, 0xb9770e, 0x4a235a, 0x17202a, 0x922b21, 0x5d6d7e, 0xd4ac0d, 0x0e6655, 0x212f3d, 0xc0392b];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x212121, 0x2e4053, 0x4a6fa5, 0x3b3b3b];
const UMB = [0x111111, 0x1a1a1a, 0xb3141a, 0x1e3f8a, 0xe8c21a, 0x2a2a2a, 0x6a1b9a, 0x0e7a4a, 0xd4d4d4, 0x111111];

export const PEOPLE = [];
{
  const R = rng(2024);
  // a path: a list of [x, z] points walked at a steady speed, starting at time t0 (can be before frame 0)
  const posAt = (p, v) => {
    let d = Math.max(0, (v - p.t0)) * p.speed;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (d <= L) return { x: ax + (bx - ax) * d / L, z: az + (bz - az) * d / L, yaw: Math.atan2(bx - ax, bz - az), done: false, last: i === p.pts.length - 2, left: L - d };
      d -= L;
    }
    const [ax, az] = p.pts[p.pts.length - 2], [bx, bz] = p.pts[p.pts.length - 1];
    return { x: bx, z: bz, yaw: Math.atan2(bx - ax, bz - az), done: true, last: true, left: 0 };
  };
  const clash = (p) => {
    for (let v = -1; v <= 9; v += 0.15) {
      const a = posAt(p, v);
      if (a.done) break;
      for (const q of PEOPLE) {
        const b = posAt(q, v);
        if (b.done) continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) < 1.15) return true;
      }
      // keep clear of the camera
      if (Math.hypot(a.x - CAM0.x, a.z - CAM0.z) < 2.6) return true;
    }
    return false;
  };
  const mk = (pts, o = {}) => {
    const p = {
      pts, t0: -2 - R() * 2, speed: 1.15 + R() * 0.4, s: 0.93 + R() * 0.12, ph: R() * 10, seed: R(),
      umb: R() < 0.62, umbCol: UMB[Math.floor(R() * UMB.length)], hood: R() < 0.4,
      col: [COAT[Math.floor(R() * COAT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]],
      ...o,
    };
    if (clash(p)) return null;
    PEOPLE.push(p);
    return p;
  };
  const doors = [...DOORS];
  // sidewalk walkers heading for a door: start somewhere along the sidewalk, walk to the door, turn in
  for (let k = 0, made = 0; k < 3000 && made < 52; k++) {
    const d = doors[Math.floor(R() * doors.length)];
    if (d.z < FIRST.z + FIRST.walk + 2 || d.z > 75) continue;
    const xs = d.side * (PIKE.road + 1.1 + R() * (PIKE.walk - PIKE.road - 2.2));
    const toward = R() < 0.5 ? 1 : -1;                                    // coming from east or west of the door
    const z0 = clamp(d.z + toward * (3 + R() * 14), FIRST.z + 2, 95);
    // arrives at the door between 0.8 and 6.5 s (the water is waist deep by then)
    const speed = 1.15 + R() * 0.4;
    const L = Math.abs(z0 - d.z) + Math.abs(d.x - xs);
    if (mk([[xs, z0], [xs, d.z], [d.x + d.side * 0.4, d.z], [d.x + d.side * 2.5, d.z]], { speed, t0: 0.8 + R() * 5.7 - L / speed })) made++;
  }
  // walkers going round the corner onto 1st Ave (off to the left or right, out of sight by ~6 s)
  for (let k = 0, made = 0; k < 2000 && made < 22; k++) {
    const side = R() < 0.5 ? -1 : 1;
    const xs = side * (PIKE.road + 1.0 + R() * 2.8);
    const speed = 1.25 + R() * 0.45, t0 = -2 - R() * 3;
    const reach = (5.5 - t0) * speed - (16 - Math.abs(xs));             // how far up Pike St they can start
    if (reach < 3) continue;
    const z0 = FIRST.z + 1 + R() * Math.min(reach, 45);
    if (mk([[xs, z0], [xs, FIRST.z + side * 0.5], [side * 60, FIRST.z + side * 0.3 + (R() - 0.5) * 1.0]], { t0, speed })) made++;
  }
  // people crossing Pike St at 1st Ave, nearly over at the first frame
  for (let k = 0, made = 0; k < 1000 && made < 10; k++) {
    const dir = R() < 0.5 ? -1 : 1;
    const z = FIRST.z + 7 + (R() - 0.5) * 1.6;
    const speed = 1.3 + R() * 0.4;
    if (mk([[-dir * 40, z], [dir * 40, z + (R() - 0.5) * 0.6]], { t0: 6.5 - R() * 6 - 54 / speed, speed })) made++;
  }
}

// where person p is and how they hold themselves at video time v (fields for crowd.pose), plus the umbrella
export function personPose(p, v) {
  const d = (v - p.t0) * p.speed;
  let dd = Math.max(0, d), x = p.pts[0][0], z = p.pts[0][1], yaw = 0, done = false, left = 0, lastSeg = false;
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    yaw = Math.atan2(bx - ax, bz - az);
    if (dd <= L || i === p.pts.length - 2) {
      const k = Math.min(dd, L) / L;
      x = ax + (bx - ax) * k; z = az + (bz - az) * k; left = L - Math.min(dd, L); lastSeg = i === p.pts.length - 2; done = dd > L;
      break;
    }
    dd -= L;
  }
  // stepped through a door: gone (the facade hides the last step); walked off: far enough not to matter
  if (done) return { visible: false, x: 0, y: 0, z: 0 };
  const o = { x, y: 0, z, yaw, s: p.s, walk: p.ph + d / 0.72 * Math.PI, stride: 1.05, sit: 0, pitch: 0.08, roll: 0, armL: 0, armR: 0, look: -0.1 };
  if (p.umb) o.armR = 1.15;
  else if (p.hood) { o.armL = 1.5; o.look = -0.25; }
  return o;
}
export function umbrellaOf(p, o) {
  if (!p.umb || o.visible === false) return null;
  const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
  const rx = Math.cos(o.yaw), rz = -Math.sin(o.yaw);
  return { x: o.x + fx * 0.15 + rx * 0.08, y: 2.0 * o.s, z: o.z + fz * 0.15 + rz * 0.08, tilt: 0.12 + 0.05 * Math.sin(o.walk) };
}
