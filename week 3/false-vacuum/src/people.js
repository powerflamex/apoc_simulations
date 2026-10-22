// The people: a crowd of sightseers on the traffic island with you (phones up at the sunset and the Arc), people
// waiting at both ends of the crosswalk, and the evening crowd walking up and down the wide sidewalks. Walkers keep
// to their own line on the sidewalk and everyone on a line walks the same way at the same pace, so nobody ever
// walks through anybody. In the time-lapse the walkers are a blur (see main.js); in the slow motion everyone is still.
import { rng } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { ROAD, WALK, groundY } from './paris.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xffffff, 0x111111, 0xe8dcc8];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5, 0xe8e2d4];

export const STILL = [];   // standing (island, curbs, a few on the sidewalks)
export const WALKERS = [];
{
  const R = rng(1889);
  const col = () => [SHIRT[Math.floor(R() * SHIRT.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]];
  const free = (x, z, r = 0.75) => STILL.every((p) => Math.hypot(p.x - x, p.z - z) > r);
  // the island (|x| < 1.6, -5 < z < 5): you are at (0, 0); most stand in front of you, facing the Arc
  const ISLAND = [[-0.9, -1.3], [0.7, -1.9], [-0.2, -2.8], [1.05, -3.7], [-1.1, -3.9], [0.15, -4.6], [-0.6, -2.0],     [-1.15, 0.9], [0.0, 2.6], [-0.9, 3.4], [1.0, 3.8], [-1.0, -5.6], [1.1, -6.4], [-1.05, -7.6], [-0.95, -12.6], [1.0, -13.8], [-1.1, -15.2], [0.75, -11.3]];
  ISLAND.forEach(([x, z], i) => {
    STILL.push({ x, z, yaw: Math.PI + (R() - 0.5) * 0.5, s: 0.94 + R() * 0.12, col: col(), phone: i < 9 ? R() < 0.7 : R() < 0.3, look: 0.18 + R() * 0.1, seed: R(), kid: false });
  });
  // right beside you: a woman filming the sunset, a man with his arm round her, a boy holding his dad's hand
  STILL.push({ x: 1.25, z: -0.35, yaw: Math.PI - 0.25, s: 0.97, col: [0xe8dcc8, 0x2c3e50, 0xe0ac86, 0x2e2018], phone: true, look: 0.2, seed: 0.31 });
  STILL.push({ x: 1.35, z: 0.55, yaw: Math.PI - 0.1, s: 1.04, col: [0x1f618d, 0x212121, 0xe0ac86, 0x151515], look: 0.15, seed: 0.72, armL: 0.35 });
  STILL.push({ x: 1.05, z: 1.25, yaw: Math.PI + 0.3, s: 0.66, col: [0xf1c40f, 0x4a6fa5, 0xf1c8a6, 0x6b4a2a], look: 0.3, seed: 0.55, armR: 0.25 });
  // a couple taking a selfie with the Arc behind them (facing you), a child on a parent's shoulders
  STILL.push({ x: 0.55, z: -3.0, yaw: 0.2, s: 0.97, col: col(), selfie: true, seed: R() });
  STILL.push({ x: 0.05, z: -3.15, yaw: -0.15, s: 0.92, col: col(), seed: R(), look: 0.1, armL: 0.25 });
  STILL.push({ x: -0.95, z: -3.95, yaw: Math.PI, s: 0.6, col: col(), seed: R(), lift: 1.45, look: 0.25 });
  // waiting at both kerbs of the crosswalk
  for (const side of [-1, 1]) for (let k = 0; k < 11; k++) {
    const x = side * (ROAD + 0.7 + R() * 2.6), z = -2.6 + R() * 5.2;
    if (!free(x, z)) continue;
    STILL.push({ x, z, yaw: side > 0 ? -Math.PI / 2 + (R() - 0.5) * 0.8 : Math.PI / 2 + (R() - 0.5) * 0.8, s: 0.93 + R() * 0.13, col: col(), phone: R() < 0.3, look: 0.05, seed: R() });
  }
  // people stopped along the sidewalks (looking at shop windows, talking, filming the sunset)
  for (let k = 0; k < 160; k++) {
    const side = R() < 0.5 ? -1 : 1, x = side * (ROAD + 1.5 + R() * (WALK - ROAD - 3)), z = 40 - Math.pow(R(), 1.4) * 520;
    if (Math.abs(z) < 6 || !free(x, z, 1.2)) continue;
    STILL.push({ x, z, yaw: R() * 6.28, s: 0.93 + R() * 0.13, col: col(), phone: R() < 0.35, look: 0.1, seed: R() });
  }
  // walkers: 26 lines down each sidewalk, each its own direction and pace
  for (const side of [-1, 1]) for (let li = 0; li < 26; li++) {
    const x = side * (ROAD + 1.0 + li * (WALK - ROAD - 2) / 25);
    if (Math.abs(Math.abs(x) - 17.4) < 0.7) continue;   // (tree trunks)
    const dir = R() < 0.5 ? -1 : 1, speed = 1.15 + R() * 0.35;
    let off = R() * 8;
    while (off < 600) {
      WALKERS.push({ x: x + (R() - 0.5) * 0.25, dir, speed, off, s: 0.93 + R() * 0.13, col: col(), phone: R() < 0.15, seed: R(), ph: R() * 10 });
      off += 4 + R() * 26;
    }
  }
}
const Z0 = 60, LEN = 600;          // walkers' stretch: z from 60 down to -540, wrapping (far off, behind the trees)
export function walkerPose(p, t) {
  const s = (((p.off + p.speed * t) % LEN) + LEN) % LEN;
  const z = p.dir < 0 ? Z0 - s : Z0 - LEN + s;
  const d = p.speed * t;
  return { x: p.x, y: groundY(z), z, yaw: p.dir < 0 ? Math.PI : 0, s: p.s, walk: p.ph + d / 0.75 * Math.PI, stride: 1, armR: p.phone ? 1 : 0, look: 0.05 };
}
export function stillPose(p, t) {
  const sway = Math.sin(t * 0.7 + p.seed * 20) * 0.04;
  const o = { x: p.x, y: groundY(p.z) + (Math.abs(p.x) < 1.7 && Math.abs(p.z) < 7 ? 0.15 : 0) + (p.lift ? p.lift : 0), z: p.z, yaw: p.yaw + sway, s: p.s, walk: 0, stride: 0, look: p.look ?? 0.1, armL: p.armL ?? 0, armR: p.phone ? 1.05 : (p.armR ?? 0) };
  if (p.selfie) { o.armR = 1.35; o.look = 0.05; }
  if (p.lift) { o.armL = 1.4; o.armR = 1.4; o.sit = 0.55; }
  return o;
}
