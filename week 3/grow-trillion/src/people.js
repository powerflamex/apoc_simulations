// The crowd at the crossing. When you appear, people near you run first; the panic spreads outward at running
// speed: everyone further out keeps filming you until the "front" of the running crowd is 2.5 m from them, then
// turns and runs the same way (straight away from you along their street) at the same speed. Since everyone on a
// street runs the same speed and starts before anyone behind reaches them, nobody ever runs into anyone. Anyone
// whose path a growing shoe would cross before the street shot ends is left out (nobody is stepped on on screen).
import { CROWD0 } from './layout.js';
import { underShoe, sizeAt, STOMP1 } from './timeline.js';
import { rng, smooth, clamp } from './util.js';
import { SKIN, HAIR } from './crowd.js';

const U = 4.6, ACC = 0.5;                       // running speed (m/s), time to get up to speed
const R0 = 9, T_FRONT0 = -6, MARGIN = 2.5;      // the front of the running crowd: at 9 m 6 s before frame 0
const runDist = (t) => (t <= 0 ? 0 : t < ACC ? U * t * t / (2 * ACC) : U * (t - ACC / 2));
const SHIRTS = [0xf2f2ee, 0x1d1f24, 0xe2574c, 0x3b6db3, 0xf3c94b, 0x58a37a, 0xe98bb4, 0x8c5ad1, 0xf08a3c, 0x41c1c9, 0xffffff, 0x2f2f2f, 0x9fb7d6];
const PANTS = [0x2b3a55, 0x1b1b1d, 0xd8cfbd, 0x50555c, 0x6a4b33, 0xf0ece4, 0x2e4a3a];
const V_END = 9.6;

function path(p, v) {
  const t = v - p.vRun;
  const d = runDist(t);
  return [p.x + p.ax * d, p.z + p.az * d];
}

export const PEOPLE = [];
for (let i = 0; i < CROWD0.length; i++) {
  const p0 = CROWD0[i];
  const R = rng(1000 + i);
  const p = { ...p0 };
  const onCross = p.run === 'x';
  p.ax = onCross ? Math.sign(p.x) || 1 : 0;
  p.az = onCross ? 0 : Math.sign(p.z) || 1;
  const r = onCross ? Math.abs(p.x) : Math.abs(p.z);
  p.vRun = T_FRONT0 + (r - MARGIN - R0) / U;
  // left out if a shoe ever covers them (with a body's width to spare) while they're on screen
  let hit = false;
  for (let v = -3; v < V_END && !hit; v += 0.05) {
    const [x, z] = path(p, v);
    if (underShoe(x, z, sizeAt(v), 0.9 / sizeAt(v) + 0.02) >= 0) hit = true;
  }
  if (hit) continue;
  p.col = [SHIRTS[Math.floor(R() * SHIRTS.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]];
  p.phone = R() < 0.45; p.point = !p.phone && R() < 0.3;
  p.ph = R() * 6.28;
  p.s = 0.92 + R() * 0.14;
  p.d = Math.hypot(p.x, p.z);
  PEOPLE.push(p);
}

export function personPose(p, v, youX) {
  // facing you before they run (you: the middle of your body, between your feet)
  const fx = youX - p.x, fz = -p.z;
  const faceIn = Math.atan2(fx, fz);
  const runYaw = Math.atan2(p.ax, p.az);
  const t = v - p.vRun;
  let [x, z] = path(p, v);
  let yaw = faceIn, stride = 0, walk = p.ph, look = 0.85, armL = 0, armR = 0, pitch = 0;
  if (p.phone) armR = 1.0; else if (p.point) armR = 1.45;
  // looking up at you, higher and higher; a step back when the first stomp lands
  const dist = Math.hypot(fx, fz);
  look = clamp(0.4 + 0.6 * Math.atan2(sizeAt(v) * 1.6, dist) / 1.3);
  const st = v - STOMP1.down;
  const flinch = st > 0 ? smooth(0, 0.12, st) * (1 - smooth(0.5, 1.2, st)) : 0;
  armL = Math.max(armL, flinch * 1.2); armR = Math.max(armR * (1 - flinch), flinch * 1.2);
  if (t > -0.3) {
    const turn = smooth(-0.3, 0.2, t);
    yaw = faceIn + Math.atan2(Math.sin(runYaw - faceIn), Math.cos(runYaw - faceIn)) * turn;
    stride = 1.55 * smooth(-0.05, ACC, t);
    walk = p.ph + runDist(t) / 1.45 * Math.PI;
    look *= 1 - turn; armL *= 1 - turn; armR = armR * (1 - turn) + (p.phone ? 0.35 : 0) * turn;
    pitch = 0.08 * stride;
  }
  return { x, y: 0, z, yaw, s: p.s, walk, stride, pitch, look, armL, armR, visible: Math.abs(x) < 1500 && Math.abs(z) < 1500 };
}
