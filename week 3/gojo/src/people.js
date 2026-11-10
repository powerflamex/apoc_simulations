// The crowd on the avenue near you: at the first frame they stand and stare up at him, filming, pointing; then they
// run south, past you, away from Blue. Every lane of runners (on the sidewalks and in the gaps between the jammed
// cars) moves as one: same start, same speed, so nobody ever runs into anyone. Nearest to Blue go first.
import { rng, smooth } from './util.js';
import { SKIN, HAIR } from './crowd.js';

const SHIRTS = [0xf2f2ee, 0x1d1f24, 0xe2574c, 0x3b6db3, 0xf3c94b, 0x58a37a, 0xe98bb4, 0x8c5ad1, 0xf08a3c, 0x41c1c9, 0xffffff, 0x2f2f2f, 0x7a2430];
const PANTS = [0x2b3a55, 0x1b1b1d, 0xd8cfbd, 0x50555c, 0x6a4b33, 0xf0ece4, 0x2e4a3a];
const TAU = 0.45;
const runDist = (t, vm) => (t <= 0 ? 0 : vm * (t - TAU * (1 - Math.exp(-t / TAU))));

const LANES = [];
for (let k = 0; k < 7; k++) LANES.push({ x: -13.4 - k * 0.8, z0: -40, z1: 34, gap: 2.4 });
for (let k = 0; k < 5; k++) LANES.push({ x: 15.2 + k * 0.78, z0: -40, z1: 34, gap: 2.6 });
for (const x of [-3.75, -7.45, 3.75, 7.45]) LANES.push({ x, z0: -38, z1: 2, gap: 5.5, road: true });

export const PEOPLE = [];
{
  const R = rng(4242);
  LANES.forEach((L, li) => {
    // the lanes closest to Blue (and in the road) start first
    const tRun = L.road ? -1.2 + R() * 0.5 : -1.0 + R() * 1.6;   // (most already running at the first frame)
    const vm = 4.6 + R() * 1.4;
    let z = L.z0 + R() * L.gap;
    while (z < L.z1) {
      const p = { x: L.x + (R() - 0.5) * 0.25, z, tRun: tRun + Math.max(0, z + 40) * 0.012, vm, ph: R() * 6.28, s: 0.92 + R() * 0.14 };
      // (the delay above grows toward you, but slower than they run, so a lane never closes up)
      p.col = [SHIRTS[Math.floor(R() * SHIRTS.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]];
      p.phone = R() < 0.4; p.point = !p.phone && R() < 0.25;
      p.look = 0.6 + R() * 0.35;
      PEOPLE.push(p);
      z += L.gap * (0.8 + R() * 0.7);
    }
  });
}

export function personPose(p, v) {
  let x = p.x, z = p.z, yaw = Math.PI + Math.sin(p.ph) * 0.3, stride = 0, walk = p.ph, look = p.look, armL = 0, armR = p.phone ? 1 : p.point ? 1.45 : 0, pitch = 0;
  // a small flinch at the start, as the street starts moving under them
  look += 0.08 * Math.sin(v * 0.9 + p.ph);
  const t = v - p.tRun;
  if (t > -0.3) {
    const turn = smooth(-0.3, 0.2, t);
    yaw = yaw + (0 - yaw) * turn;
    const d = runDist(t, p.vm);
    z += d;
    stride = 1.6 * smooth(-0.1, 0.3, t);
    walk = p.ph + d / 1.5 * Math.PI;
    look = 0.25 * (1 - turn); armL = 0; armR = p.phone ? 0.35 : 0;
    pitch = 0.08 * stride;
  }
  return { x, y: 0, z, yaw, s: p.s, walk, stride, pitch, look, armL, armR, visible: z < 600 };
}
