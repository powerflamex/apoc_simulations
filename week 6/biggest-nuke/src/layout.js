// Where everything stands (metres; x east, y up, z south: the camera looks north). An unnamed made-up city. You are on
// the wide pedestrian promenade down the middle of an avenue, on the crest of a hill. The avenue runs flat for 60 m,
// then drops 220 m to the plain, and the whole city lies ahead of you. Ground zero is 13 miles (20.9 km) ahead, 5° to the
// right of the avenue, so the fireball clears the counter.
import { rng, smooth } from './util.js';
import { D_M, MILE, TOWER_V, miAt, T0 } from './timeline.js';

export const PROM = 7, ROAD_X = 15, WALK = 7, MED = 2.2;
export const FX = ROAD_X + WALK;                          // building fronts
export const AVE_END = -1400;                             // where the avenue's own blocks end
export const CAM0 = { x: -2.5, z: 8.0 };                  // you: on the promenade, in the crowd
export const PLAIN = -220;                                 // the plain's height against your street
export const DROP_A = -60, DROP_B = -1300;
export const groundY = (z) => PLAIN * smooth(DROP_A, DROP_B, z);
export const groundGLSL = `(${PLAIN.toFixed(1)} * smoothstep(0.0, 1.0, clamp((z - (${DROP_A.toFixed(1)})) / (${(DROP_B - DROP_A).toFixed(1)}), 0.0, 1.0)))`;
const BEAR = 5 * Math.PI / 180;
export const HIT = { x: CAM0.x + D_M * Math.sin(BEAR), z: CAM0.z - D_M * Math.cos(BEAR) };   // ground zero

// ---- buildings: { x, y, z, w (along x), d (along z), h, kind, col } ----
// kind 0: stone and concrete offices (punched windows), 1: glass tower, 2: older block (small windows, cornices),
// 3: far city (simple), 4: the tall towers
export const BLD = [];
// the towers that fall on the beat: each stands where the front is at that moment
export const HEROES = [];
{
  const R = rng(1961);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const COLS = [0xb8b0a4, 0x9c948a, 0xc9c2b6, 0x8d8f94, 0xb09c86, 0xd2c8b8, 0x7f7c78, 0xa8adb4, 0xc4a98e, 0x9a8c7c];
  const TOWER = [0x7d8da0, 0x9aa6b4, 0xb8b0a4, 0x6f7f92, 0xc4c0b8, 0x5e6a7c];
  const add = (x, z, w, d, h, kind, col) => { BLD.push({ x, y: groundY(z - d / 2), z, w, d, h, kind, col: col ?? pick(COLS) }); };
  // along the avenue, both sides. Near you they frame the street; further down the hill their roofs fall below your eye,
  // so the whole city shows over them
  for (const side of [-1, 1]) {
    let z = 58;
    while (z > AVE_END) {
      const d = 12 + R() * 18, w = 18 + R() * 16, zc = z - d / 2;
      const near = zc > -60;
      // (the blocks that burn beside you are tall enough to fill the sides of the frame; past them the view opens)
      let h = near ? 26 + R() * 24 : zc > -140 ? 26 + R() * 8 : 11 + R() * 13;
      if (zc > -60 && zc < -20) h = 40 + R() * 12;
      add(side * (FX + w / 2), zc, w, d - 0.8, h, R() < 0.2 ? 1 : R() < 0.5 ? 2 : 0);
      z -= d;
    }
    // behind you
    for (let z2 = 58; z2 < 320;) {
      const d = 14 + R() * 18, w = 18 + R() * 14;
      add(side * (FX + w / 2), z2 + d / 2, w, d - 0.8, 20 + R() * 30, R() < 0.5 ? 0 : 2);
      z2 += d;
    }
  }
  // blocks behind the fronts on the hill
  for (let i = 0; i < 340; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (62 + R() * 620), z = 60 - R() * 1500;
    const w = 20 + R() * 30, d = 20 + R() * 30;
    add(x, z, w, d, 12 + R() * 26, 3);
  }
  // the city on the plain, widening with distance so that it fills the view
  for (let i = 0; i < 1500; i++) {
    const z = -1300 - Math.pow(R(), 0.8) * 5000, far = -z;
    const x = (R() - 0.5) * (far * 0.72 + 300);
    if (Math.abs(x) < 26) continue;                        // (the avenue goes on across the plain)
    const w = 24 + R() * 40, d = 24 + R() * 40;
    add(x, z, w, d, 12 + R() * 34 + (R() < 0.13 ? 40 + R() * 90 : 0), R() < 0.1 ? 4 : 3);
  }
  for (let i = 0; i < 1100; i++) {
    const z = -6000 - R() * 15500, far = -z;
    const x = (R() - 0.5) * (far * 0.74);
    const w = 50 + R() * 70, d = 50 + R() * 70;
    add(x, z, w, d, 18 + R() * 40 + (R() < 0.2 ? 50 + R() * 110 : 0), 3);
  }
  const BEARS = [-1.2, 3.6, -3.8, 6.0, 1.4, -6.0, 8.0, -2.4, 10.5];
  // the heroes. Bearings (degrees) keep them out from behind each other; each sits on the circle the front has reached
  const HGT = [820, 760, 700, 640, 600, 540, 500, 1000, 380];
  TOWER_V.forEach((v, k) => {
    const rf = miAt(v + T0) * MILE, b = BEARS[k] * Math.PI / 180;
    // along this bearing from you, the point rf from ground zero
    let lo = 200, hi = 24000;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2, px = CAM0.x + m * Math.sin(b), pz = CAM0.z - m * Math.cos(b);
      if (Math.hypot(px - HIT.x, pz - HIT.z) > rf) lo = m; else hi = m;
    }
    const x = CAM0.x + lo * Math.sin(b), z = CAM0.z - lo * Math.cos(b), w = 48 + R() * 24;
    const H0 = HGT[k], tall = H0 >= 1000, c1 = tall ? 0x5a6474 : pick(TOWER);
    HEROES.push({ x, z, h: H0, w, tall });
    // (hero: the height it breaks by, the same for all its parts, so they stay together as it goes)
    BLD.push({ x, y: PLAIN, z, w: tall ? 110 : w, d: tall ? 110 : w, h: H0 * 0.7, kind: 4, col: c1, hero: H0 });
    // stepped upper parts and a mast, so that each has its own outline
    BLD.push({ x, y: PLAIN, z, w: (tall ? 110 : w) * 0.66, d: (tall ? 110 : w) * 0.66, h: H0, kind: 4, col: c1, hero: H0 });
    if (tall) BLD.push({ x, y: PLAIN, z, w: 38, d: 38, h: H0 * 1.1, kind: 4, col: c1, hero: H0 });
    if (k % 2 || tall) BLD.push({ x, y: PLAIN, z, w: 5, d: 5, h: H0 * (tall ? 1.24 : 1.2), kind: 3, col: 0x6a6e72, hero: H0 });
  });
  // downtown: a cluster of tall towers from 2 to 7 miles out
  for (let i = 0; i < 90; i++) {
    const dist = 3200 + R() * 8200, b = (R() - 0.5) * 34 * Math.PI / 180;
    if (BEARS.some((q) => Math.abs(q * Math.PI / 180 - b) < 0.03)) continue;      // (clear sky round each hero)
    const x = CAM0.x + dist * Math.sin(b), z = CAM0.z - dist * Math.cos(b);
    const w = 32 + R() * 34;
    BLD.push({ x, y: PLAIN, z, w, d: w * (0.8 + R() * 0.4), h: 130 + R() * 150, kind: 4, col: pick(TOWER) });
  }
}

// ---- LED boards on the buildings near you (facing the avenue) ----
export const SCREENS = [
  { x: -21.7, y: 19, z: -34, w: 15, h: 9, yaw: Math.PI / 2, seed: 8 },
  { x: 21.7, y: 23, z: -46, w: 17, h: 10, yaw: -Math.PI / 2, seed: 9 },
  ];

// ---- shop signs over the shop fronts on both sides ----
export const SIGNS = [];
{
  const R = rng(29);
  for (const side of [-1, 1]) for (let z = 50; z > -420; z -= 8 + R() * 8) {
    if (R() < 0.15) continue;
    SIGNS.push({ x: side * (FX + 0.06), y: groundY(z) + 4.4, z, w: 5 + R() * 4, h: 1.3, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, cell: Math.floor(R() * 8) });
  }
}

// ---- lamps down the avenue's edges, trees along the promenade, food stalls, strings of bulbs over the promenade ----
export const LAMPS = [], TREES = [], STALLS = [], BULBS = [];
export const SIGNALS = [];
for (const side of [-1, 1]) for (let z = 40; z > -1000; z -= 34) LAMPS.push({ x: side * (ROAD_X + 0.9), z, arms: 1, y: groundY(z) });
{
  const R = rng(41);
  for (const side of [-1, 1]) for (let z = -210; z > -1200; z -= 11 + R() * 3) TREES.push({ x: side * (PROM - 0.9), z, h: 6 + R() * 2.5, r: 2.0 + R() * 0.8, seed: R(), y: groundY(z) });
  // stalls in a row just inside the trees, awnings lit
  const AW = [0xd8452a, 0xf0c040, 0x2a8a7a, 0xe8e2d6, 0x3a5aa8, 0xc23a7a];
  for (const side of [-1, 1]) for (let z = 2; z > -110; z -= 12 + R() * 6) {
    if (Math.abs(z - CAM0.z) < 7 || R() < 0.15) continue;
    STALLS.push({ x: side * (PROM - 1.6), z: z + (R() - 0.5) * 2, w: 2.2, d: 3.6, col: AW[Math.floor(R() * AW.length)], seed: R() });
  }
  // strings along the promenade and across it, from just behind you down the first of the hill
  const sag = (u, y0) => y0 - 0.55 * 4 * u * (1 - u);
  const rows = [-5.4, 5.4];
  for (const x of rows) for (let z = 26; z > -200; z -= 16) {
    for (let k = 0; k < 16; k++) { const u = k / 16, zb = z - 16 * u; BULBS.push({ x, y: sag(u, 6.4) + groundY(zb), z: zb, seed: R() }); }
  }
  for (let z = 26; z > -200; z -= 16) {
    for (let k = 0; k <= 11; k++) { const u = k / 11, xb = -5.4 + 10.8 * u; BULBS.push({ x: xb, y: sag(u, 6.4) + groundY(z), z, seed: R() }); }
  }
}
