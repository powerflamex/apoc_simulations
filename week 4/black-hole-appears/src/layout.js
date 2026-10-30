// The Las Vegas Strip at night, placed once (deterministic). Metres; x east, y up, -z north. The black hole hangs
// over the west sidewalk at (0.6, 1.3, 0). The boulevard runs north-south: west sidewalk x -7..3.5 (casino fronts
// at x = -7), southbound lanes 3.5..14.3 (cars come toward the cameras, which look north), the median with palms
// 14.3..18.3, northbound lanes 18.3..29.1, the east sidewalk to 38 and its casino fronts. Cross streets every
// ~280 m. Behind the fronts: the resort towers; beyond, the low city grid out to ~3 km (the ground shader draws the
// rest of the valley's lights, the desert and the mountains).
import { rng, clamp } from './util.js';
import { BH } from './timeline.js';

export const W_FRONT = -7, CURB_W = 3.5, MED0 = 14.3, MED1 = 18.3, CURB_E = 29.1, E_FRONT = 38;
export const LANES_S = [5.3, 8.9, 12.5], LANES_N = [20.1, 23.7, 27.3];
export const ZX = [];                                          // cross street centres
for (let z = -95; z > -3200; z -= 280) ZX.push(z);
for (let z = 185; z < 3600; z += 280) ZX.push(z);
ZX.sort((a, b) => a - b);
export const XHALF = 11;                                       // cross street half-width
const inCross = (z, pad = 0) => ZX.some((c) => Math.abs(z - c) < XHALF + pad);

// ---------- buildings ----------
// kind 0 casino podium (shops and lit fronts below, signs above), 1 resort tower (gold glass), 2 glass tower,
// 3 hotel block (punched windows), 4 low city building
export const BLD = [];
const R = rng(20261031);
function addB(x0, x1, z0, z1, h, kind, extra = {}) {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  if (w < 4 || d < 4 || h < 4) return null;
  const b = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w, d, h, kind, seed: R(), i: BLD.length, crown: R(), ...extra };
  BLD.push(b);
  return b;
}
const GOLD = [0xc9a35a, 0xb8925a, 0xd8c08a, 0xa08060];
const BLUE = [0x5f7d96, 0x4f6a80, 0x6e8aa0, 0x3f5568];
const STONE = [0xd8cdb8, 0xc9bca6, 0xe3d9c6, 0xb9ac98, 0xcfc2b4];
for (const side of [-1, 1]) {
  const front = side < 0 ? W_FRONT : E_FRONT;
  let z = 3400;
  while (z > -3100) {
    // a resort lot: 120-260 m along the Strip
    let L = 120 + R() * 140;
    const zA = z, zB = z - L;
    // keep out of the cross streets: shrink the lot to the gap
    const cs = ZX.filter((c) => c < zA && c > zB);
    if (cs.length) { L = zA - (cs[0] + XHALF) - 2; }
    if (L < 30) { z -= 40; continue; }
    const z1 = zA - L;
    // the podium along the front (two or three blocks of different height and colour)
    let zz = zA;
    while (zz > z1 + 10) {
      const l = Math.min(25 + R() * 50, zz - z1);
      const depth = 45 + R() * 40;
      const h = 9 + R() * 14;
      addB(front, front + side * depth, zz, zz - l + 0.5, h, 0, { col: STONE[Math.floor(R() * STONE.length)], front: side });
      zz -= l;
    }
    // the towers behind: 1-3 slabs
    const nT = 1 + Math.floor(R() * 2.6);
    for (let t = 0; t < nT; t++) {
      const tz = zA - L * (0.2 + 0.6 * R());
      const tw = 22 + R() * 18, td = 50 + R() * 50;
      const x0 = front + side * (60 + R() * 70);
      const near = Math.abs(tz) < 900 ? 1 : 0.75;
      const h = (90 + R() * 120) * near + (R() < 0.15 ? 60 : 0);
      const kind = R() < 0.55 ? 1 : R() < 0.5 ? 2 : 3;
      const col = kind === 1 ? GOLD[Math.floor(R() * 4)] : kind === 2 ? BLUE[Math.floor(R() * 4)] : STONE[Math.floor(R() * STONE.length)];
      const rot = R() < 0.4;
      addB(x0, x0 + side * (rot ? td : tw), tz + (rot ? tw : td) / 2, tz - (rot ? tw : td) / 2, h, kind, { col });
    }
    z = z1 - 2 * XHALF - 4;
  }
}
// one very tall tower far up the Strip (an observation tower is too specific: a 330 m hotel tower)
addB(-160, -110, -2350, -2400, 330, 2, { col: BLUE[2] });
// the low city grid beyond the resorts (out to ~2.5 km each side)
for (let gx = -2500; gx < 2500; gx += 160) {
  for (let gz = -3000; gz < 3500; gz += 160) {
    if (gx > -330 && gx < 360) continue;
    if (R() < 0.3) continue;
    const w = 30 + R() * 90, d = 30 + R() * 90;
    const far = Math.hypot(gx, gz);
    const h = (R() < 0.08 ? 25 + R() * 60 : 5 + R() * 12) * (far > 2000 ? 0.7 : 1);
    addB(gx + R() * 40, gx + R() * 40 + w, gz + R() * 40, gz + R() * 40 + d, h, h > 20 ? 3 : 4, { col: STONE[Math.floor(R() * STONE.length)] });
  }
}

// ---------- signs on the casino fronts (neon and LED), and the big pylon marquees by the sidewalk ----------
export const SIGNS = [];   // { x, y, z, w, h, nx, tex (atlas cell), kind: 0 neon / 1 LED }
for (const b of BLD) {
  if (b.kind !== 0) continue;
  const nx = -b.front;            // the face toward the boulevard
  const fx = b.front < 0 ? W_FRONT + 0.06 : E_FRONT - 0.06;
  const n = Math.max(1, Math.floor(b.d / 22));
  for (let i = 0; i < n; i++) {
    if (R() < 0.25) continue;
    const z = b.z + b.d / 2 - (i + 0.5) * b.d / n;
    const w = Math.min(b.d / n - 3, 7 + R() * 10), h = Math.min(b.h - 6, 2.2 + R() * 3.5);
    if (w < 3 || h < 1.2) continue;
    SIGNS.push({ x: fx, y: 5.2 + R() * Math.max(0.5, b.h - 6.5 - h) + h / 2, z, w, h, nx, tex: Math.floor(R() * 16), kind: R() < 0.35 ? 1 : 0, seed: R() });
  }
}
// pylon marquees: a tall stem with a big LED board on top, at the back of the sidewalk
export const PYLONS = [];
for (const side of [-1, 1]) {
  for (let z = -2800; z < 3200; z += 190 + R() * 120) {
    if (inCross(z, 10)) continue;
    const x = side < 0 ? W_FRONT + 2.2 : E_FRONT - 2.2;
    PYLONS.push({ x, z, h: 22 + R() * 16, w: 12 + R() * 5, bh: 8 + R() * 4, tex: Math.floor(R() * 16), seed: R(), side });
  }
}
// the one right behind the black hole at the start (so the first frame has a big lit marquee in it)
PYLONS.push({ x: W_FRONT + 2.4, z: -34, h: 24, w: 14, bh: 9, tex: 0, seed: 0.37, side: -1 });

// ---------- street furniture: lampposts on both curbs, palms (median and sidewalk planters), sign posts ----------
// break: the pull (g) at which it snaps off and falls in; lean starts at 0.5 g
export const POLES = [];
for (let z = -1500; z < 2800; z += 32) {
  if (inCross(z, 4)) continue;
  POLES.push({ kind: 'lamp', x: CURB_W - 0.5, z: z + 7, h: 9.5, arm: 1, brk: 7 });
  POLES.push({ kind: 'lamp', x: CURB_E + 0.5, z: z + 23, h: 9.5, arm: -1, brk: 7 });
}
for (let z = -1500; z < 2800; z += 16) {
  if (inCross(z, 3)) continue;
  POLES.push({ kind: 'palm', x: (MED0 + MED1) / 2 + (R() - 0.5) * 0.8, z: z + R() * 3, h: 10 + R() * 5, brk: 3.5, seed: R() });
}
for (let z = -1500; z < 2800; z += 19) {
  if (inCross(z, 3)) continue;
  POLES.push({ kind: 'palm', x: W_FRONT + 1.4, z: z + 4, h: 8 + R() * 4, brk: 3.5, seed: R() });
  POLES.push({ kind: 'palm', x: E_FRONT - 1.4, z: z + 12, h: 8 + R() * 4, brk: 3.5, seed: R() });
}
// sign posts and parking meters near the curb, close to where the cameras stand
for (const z of [6, 12, 20, 27, 41, 58, 73, 86, 97, 104, 118]) POLES.push({ kind: 'post', x: CURB_W - 0.7, z, h: 3.1, brk: 4 });
// the lampposts and posts people hold on to are near the cameras (see PEOPLE)
POLES.forEach((p, i) => { p.i = i; });
const nearPole = (x, z, kinds = ['lamp', 'post', 'palm']) => {
  let best = null, bd = 1e9;
  for (const p of POLES) { if (!kinds.includes(p.kind)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  return { p: best, d: bd };
};

// ---------- people ----------
// { x, z, yaw (facing), k (g at which they are torn off), hold (pole they hang on to), phone, look, clothes }
export const PEOPLE = [];
const SHIRTS = [0xd94b4b, 0x2f5fa8, 0xf2f2f2, 0x1e1e22, 0xe0b040, 0x3f9a6a, 0xc95fa0, 0x8a6a4a, 0x4fb3d9, 0xff7a3a, 0x6a4fa0, 0x222a40, 0xe85a8a, 0xf5d0a0];
const PANTS = [0x1f2a44, 0x2a2a2a, 0x3a4a6a, 0x6b5a48, 0xd8d0c0, 0x111111, 0x4a3a5a];
function person(x, z, o = {}) {
  const dx = BH.x - x, dz = BH.z - z;
  const p = {
    x, z, yaw: Math.atan2(dx, dz) + (R() - 0.5) * 0.8, k: 1.0 + R() * 0.3, hold: null, phone: R() < 0.35, look: 0.2,
    shirt: SHIRTS[Math.floor(R() * SHIRTS.length)], pants: PANTS[Math.floor(R() * PANTS.length)], seed: R(), s: 0.94 + R() * 0.12, ...o,
  };
  p.i = PEOPLE.length;
  PEOPLE.push(p);
  return p;
}
// the man 2 m from it (just beyond it; the centre of his body is 1.8 m away)
export const VICTIM = person(0.2, -1.7, { yaw: Math.atan2(BH.x - 0.2, BH.z + 1.7), k: 1.0, phone: false, shirt: 0xe0b040, pants: 0x1f2a44, s: 1.0, victim: true });
// right next to you: a woman filming it (left, close) and a man (right, close)
person(-1.0, 1.75, { phone: true, k: 1.25, shirt: 0xc95fa0, pants: 0x111111, s: 0.97, yaw: Math.atan2(BH.x + 1.0, BH.z - 1.75) });
person(-1.75, 0.55, { phone: true, k: 1.2, shirt: 0x2f5fa8, pants: 0x2a2a2a, s: 1.02 });
// around it: tourists on the sidewalk beyond it, two by the casino front, some on the curb, a few across the road
for (const [x, z] of [[-1.6, -3.2], [-0.6, -4.4], [1.5, -5.2], [-3.4, -2.2], [-4.6, -0.6], [2.6, -3.6], [-2.4, -6.8], [0.4, -8.4], [2.2, -10.5], [-3.8, -9.6], [-1.2, -12.8], [1.4, -15.5], [-4.2, -15], [-2.2, -18.5], [0.9, -22], [-3.6, -25], [2.1, -27], [-0.8, -31], [-4.8, -36], [1.6, -40], [-2.6, -44], [0.2, -49]]) person(x + (R() - 0.5) * 0.4, z + (R() - 0.5) * 0.4);
for (const [x, z] of [[-3.6, 3.6], [-5.0, 1.8], [2.4, 1.2], [-4.2, 6.8], [1.9, 7.6], [-2.6, 9.4]]) person(x, z);
for (let z = -60; z < 60; z += 4.5 + R() * 3) person(31 + R() * 5, z, { phone: R() < 0.5 });
// holding on near the 'walk' camera (it stands ~25 m back): they swing out sideways, toward it, before they let go
{
  const hp = (z, kinds) => nearPole(2, z, kinds).p;
  for (const [z, x, kinds, k] of [[14.6, 2.5, ['lamp'], 2.4], [17.8, -4.4, ['palm'], 2.2], [20.2, 2.0, ['post'], 2.6], [12.3, 2.1, ['post'], 2.2], [22.6, -4.6, ['palm'], 2.8]]) {
    const pole = hp(z, kinds);
    if (pole) person(x, pole.z + 0.6, { hold: pole, k, phone: false });
  }
  for (const [x, z] of [[-2.6, 13.2], [0.4, 15.6], [-1.4, 18.6], [1.2, 20.6], [-5.6, 21.4], [1.6, 28.2], [-2.0, 31], [0.5, 34]]) person(x, z);
}
// near the 'block' camera (~110 m back)
{
  for (const z of [73, 86, 97, 104]) { const pole = nearPole(2, z, ['post']).p; if (pole) person(2.0, pole.z + 0.6, { hold: pole, k: 2.2 + R() * 0.6, phone: false }); }
  for (const z of [80, 92]) { const pole = nearPole(-5.6, z, ['palm']).p; if (pole) person(-4.4, pole.z + 0.7, { hold: pole, k: 2.4, phone: false }); }
  for (let z = 52; z < 150; z += 3.2 + R() * 2.5) person(-5.5 + R() * 8, z);
}
// and the crowd up and down the Strip (they go in at their own time)
for (let z = -400; z < 600; z += 5 + R() * 6) {
  if (Math.abs(z) < 55 || (z > 50 && z < 150)) continue;
  if (inCross(z)) continue;
  person(-5.5 + R() * 8, z);
  if (R() < 0.6) person(31 + R() * 5.5, z + R() * 3);
}

// ---------- cars: the Strip is jammed (the near lanes stop-start toward you, the far ones away) ----------
export const CARS = [];
const CARC = [0xe8e8e8, 0x1a1a1a, 0x2a3f6a, 0x9a1f1f, 0x8a8a8a, 0xf0c020, 0x2a5a3a, 0xd0d4d8, 0x5a2a6a, 0xf2f2f2, 0x101010];
for (const [lanes, dir] of [[LANES_S, 1], [LANES_N, -1]]) {
  for (const x of lanes) {
    let z = -700 + R() * 6;
    while (z < 900) {
      const kind = R() < 0.12 ? 3 : R() < 0.35 ? 2 : R() < 0.5 ? 1 : 0;
      const len = [4.5, 4.0, 4.6, 4.9][kind];
      const taxi = R() < 0.18;
      if (!inCross(z, 3)) CARS.push({ x: x + (R() - 0.5) * 0.3, z, dir, kind, col: taxi ? 0xf2c21a : CARC[Math.floor(R() * CARC.length)], k: 0.75 + R() * 0.2, seed: R(), len });
      z += len + 2.2 + R() * 3.5;
    }
  }
}
CARS.forEach((c, i) => { c.i = i; });

// ---------- loose things ----------
// type: coin, chip, card, paper, cup, bag, case (luggage), chair, can (trash can), cone, leaf (palm frond bits)
export const PROPS = [];
const PROPK = { coin: [0.3, 0], chip: [0.3, 0], card: [0.05, 3], paper: [0.06, 3], cup: [0.12, 6], bag: [0.1, 5], case: [0.55, 0], chair: [0.5, 0], can: [0.6, 0], cone: [0.4, 0], leaf: [0.05, 4] };
function prop(type, x, y, z) {
  const [k, vt] = PROPK[type];
  PROPS.push({ type, x, y, z, k: k * (0.8 + 0.4 * R()), vt, seed: R(), i: PROPS.length });
}
// on the ground round it: coins and casino chips spilled, playing cards, flyers (Vegas)
for (let i = 0; i < 260; i++) {
  const a = R() * Math.PI * 2, r = 1.2 + Math.pow(R(), 1.3) * 14;
  const x = BH.x + Math.cos(a) * r, z = BH.z + Math.sin(a) * r;
  if (x < W_FRONT + 0.2 || x > 13) continue;
  const t = R();
  prop(t < 0.35 ? 'coin' : t < 0.5 ? 'chip' : t < 0.72 ? 'card' : t < 0.9 ? 'paper' : 'leaf', x, 0.02, z);
}
// in the air already, caught in the rush of air toward it: cards, flyers, frond bits
for (let i = 0; i < 110; i++) {
  const a = R() * Math.PI * 2, r = 1.0 + Math.pow(R(), 1.2) * 9;
  const x = BH.x + Math.cos(a) * r, z = BH.z + Math.sin(a) * r * 1.3;
  if (x < W_FRONT + 0.2 || Math.hypot(x - 0.15, z - 3.3) < 2.2) continue;
  const t = R();
  prop(t < 0.4 ? 'card' : t < 0.75 ? 'paper' : 'leaf', x, 0.3 + R() * 3.5, z);
}
// bigger things on the sidewalk and the road edge
for (let z = -120; z < 160; z += 2.5) {
  if (inCross(z)) continue;
  if (R() < 0.35) prop('cup', -6 + R() * 9, 0.05, z + R() * 2);
  if (R() < 0.12) prop('bag', -6 + R() * 9, 0.05, z + R() * 2);
  if (R() < 0.08) prop('case', -5 + R() * 7, 0.0, z + R() * 2);
  if (R() < 0.06) prop('can', W_FRONT + 0.7, 0.0, z);
  if (R() < 0.04) prop('cone', CURB_W + 0.4, 0.0, z);
  if (R() < 0.3) prop(R() < 0.5 ? 'paper' : 'card', -6 + R() * 18, 0.02, z + R() * 2);
}
// a café's tables and chairs by the casino front near it
for (const [x, z] of [[-5.2, -6], [-4.3, -7.3], [-5.4, -8.6], [-4.1, -10], [-5.3, -11.2], [-5.2, 8.4], [-4.2, 9.8]]) prop('chair', x, 0, z);

// ---------- glass: the shop windows on the casino fronts burst toward it (2 g) ----------
export const GLASS_K = 2.0;
export const SHARDS = [];
for (const b of BLD) {
  if (b.kind !== 0 || Math.abs(b.z) > 260 || b.front !== -1) continue;
  // the boulevard face, ground floor panes (bays of 4.5 m, glass 0.35..3.3 m)
  const nb = Math.floor(b.d / 4.5);
  for (let j = 0; j < nb; j++) {
    const zc = b.z + b.d / 2 - (j + 0.5) * (b.d / nb);
    for (let q = 0; q < 6; q++) SHARDS.push({ x: W_FRONT + 0.1, y: 0.5 + R() * 2.7, z: zc + (R() - 0.5) * 3.8, cz: zc, cy: 1.85, seed: R(), s: 0.15 + R() * 0.35 });
  }
}
