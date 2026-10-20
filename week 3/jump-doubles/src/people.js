// The crowd. At first a ring of people round the crossing and the sidewalks full, looking up at you, filming,
// pointing; the first landings make them flinch back. At the 9th landing the nearest are knocked off their feet and
// everyone runs: along the avenue (north or south) or along the cross street (east or west), whichever they are on.
// Everyone on one street runs the same way at the same speed from the same moment, so nobody ever runs into
// anyone; the ones knocked down get up and follow a little later (behind the others, at the same speed).
import { CROWD0, AVE, CROSS } from './layout.js';
import { bounceOf } from './timeline.js';
import { rng, smooth, clamp } from './util.js';
import { SKIN, HAIR } from './crowd.js';

const B6 = bounceOf(6), B7 = bounceOf(7), B8 = bounceOf(8), B9 = bounceOf(9);
export const V_RUN = B9.v + 0.12;
const KNOCK_R = 12.5, DOWN = 1.35;
const VMAX = 5.4, TAU = 0.45;
const runDist = (t) => (t <= 0 ? 0 : VMAX * (t - TAU * (1 - Math.exp(-t / TAU))));

const SHIRTS = [0xf2f2ee, 0x1d1f24, 0xe2574c, 0x3b6db3, 0xf3c94b, 0x58a37a, 0xe98bb4, 0x8c5ad1, 0xf08a3c, 0x41c1c9, 0xffffff, 0x2f2f2f];
const PANTS = [0x2b3a55, 0x1b1b1d, 0xd8cfbd, 0x50555c, 0x6a4b33, 0xf0ece4, 0x2e4a3a];

export const PEOPLE = CROWD0.map((p0, i) => {
  const R = rng(1000 + i);
  const p = { ...p0 };
  const d = Math.hypot(p.x, p.z);
  // which way: along the avenue if on it, else along the cross street
  const onCross = p.run === 'x';
  p.ax = onCross ? Math.sign(p.x) || 1 : 0;
  p.az = onCross ? 0 : Math.sign(p.z) || 1;
  p.knocked = d < KNOCK_R;
  p.vRun = p.knocked ? V_RUN + DOWN + 0.35 : V_RUN;
  p.d = d;
  p.col = [SHIRTS[Math.floor(R() * SHIRTS.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]];
  p.phone = R() < 0.35; p.point = !p.phone && R() < 0.25;
  p.ph = R() * 6.28;
  p.s = 0.92 + R() * 0.14;
  return p;
});

const flinch = (v, b, d, k) => { const t = v - b.v; return t < 0 ? 0 : k * smooth(0, 0.15, t) * (1 - smooth(0.5, 1.4, t)) * clamp(1.4 - d / 25); };

export function personPose(p, v) {
  const ux = p.x / (p.d || 1), uz = p.z / (p.d || 1);
  // facing you in the middle of the crossing before they run
  const faceIn = Math.atan2(-ux, -uz);
  const runYaw = Math.atan2(p.ax, p.az);
  // stepping back from the first landings (each a little more), and shielding their faces
  const back = (smooth(B7.v, B7.v + 0.3, v) * 0.4 + smooth(B8.v, B8.v + 0.35, v) * 0.9) * clamp(1.6 - p.d / 22);
  const fl = Math.max(flinch(v, B6, p.d, 0.4), flinch(v, B7, p.d, 0.7), flinch(v, B8, p.d, 1));
  let x = p.x + ux * back, z = p.z + uz * back;
  let pitch = 0, yaw = faceIn, stride = 0, walk = p.ph, look = 0.85, armL = 0, armR = 0;
  if (p.phone) armR = 1.0; else if (p.point) armR = 1.45;
  look = 0.75 + 0.2 * Math.sin(v * 0.7 + p.ph);
  armL = Math.max(armL, fl * 1.2); armR = Math.max(armR * (1 - fl), fl * 1.2);
  // knocked down: thrown onto their back, sliding outward, getting up
  if (p.knocked && v > V_RUN - 0.1) {
    const t = v - (V_RUN - 0.1);
    const down = smooth(0, 0.3, t) * (1 - smooth(DOWN, DOWN + 0.35, t));
    const slide = 2.2 * (1 - Math.exp(-t / 0.25));
    x += ux * slide; z += uz * slide;
    pitch = -1.45 * down;
    look = 0.2; armL = 1.6 * down; armR = 1.6 * down;
  }
  // running
  if (v > p.vRun - 0.3) {
    const t = v - p.vRun;
    const turn = smooth(-0.3, 0.15, t);
    yaw = faceIn + Math.atan2(Math.sin(runYaw - faceIn), Math.cos(runYaw - faceIn)) * turn;
    const dist = runDist(t);
    x += p.ax * dist; z += p.az * dist;
    stride = 1.6 * smooth(-0.1, 0.3, t);
    walk = p.ph + dist / 1.5 * Math.PI;
    look = 0.0; armL = 0; armR = p.phone ? 0.3 : 0;
    pitch = 0.08 * stride;
  }
  return { x, y: 0.0, z, yaw, s: p.s, walk, stride, pitch, look, armL, armR, visible: Math.abs(x) < 1200 && Math.abs(z) < 1200 };
}
