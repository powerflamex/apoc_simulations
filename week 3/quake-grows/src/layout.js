// San Francisco (metres). The camera looks down -z: east, down California Street from the top of Nob Hill toward
// the Financial District and the Bay. x: to the right (south) +, left (north) -. y up; y = 0 is the street at the
// top of the hill (~100 m above the Bay). The street drops ~16 % for 520 m, then runs flat to the waterfront.
// Real things in their real places (roughly): the cable car line up the middle, the Financial District towers at the
// bottom (555 California's dark granite right on the street, the Transamerica Pyramid two blocks north, Salesforce
// Tower to the south-east), the Bay Bridge's western span from Rincon Hill out to Yerba Buena Island, the Oakland
// hills 14 km away. The Sun is setting behind you, over the Pacific.
import { rng, clamp, smooth } from './util.js';

export const ST = { road: 9.5, walk: 14 };            // |x| < road: roadway (2 lanes + cable car tracks); + sidewalks
export const TRACKS = [-1.3, 1.3];
export const BAY_Y = -95;
export const CROSS = [-62, -155, -248, -341, -434, -527, -620, -713, -806, -899, -992];   // cross streets (z)
export const CAM0 = { x: -0.4, y: 1.7, z: 14 };   // standing between the two cable car tracks
// the street's height: flat on the hilltop, the long drop (~16 %), the flat Financial District, the waterfront.
// (slope eased in and out, integrated once into a table)
const SLOPE = (d) => 0.165 * smooth(0, 22, d) * (1 - smooth(520, 610, d)) + 0.012 * smooth(550, 650, d);
const YT = new Float32Array(1601);
for (let i = 1; i <= 1600; i++) YT[i] = YT[i - 1] - SLOPE(i - 0.5);
export function streetY(z) {
  const d = clamp(6 - z, 0, 1599.99);    // the hilltop ends just in front of you
  const i = Math.floor(d), f = d - i;
  return YT[i] + (YT[i + 1] - YT[i]) * f;
}
// ground height anywhere: the city follows the street's slope; Telegraph Hill to the north; the Bay past the piers
export function groundY(x, z) {
  const g = (cx, cz, r, h) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
  const h = streetY(z) + g(-900, -760, 260, 55);
  return z < -1110 ? BAY_Y - 6 : h;
}
export const SUN = { az: 8, el: 7 };                     // degrees: behind you (west, +z), a little to the right

// ---- buildings ----
// kind 0: bay-windowed apartment / Victorian (painted), 1: mid-rise office, 2: glass tower, 3: stone tower,
// fall: the magnitude it comes down at
export const B = [];
const PAINT = [0xe8d8b8, 0xd8b090, 0xc8d0c0, 0xe0c8a8, 0xb8c8d8, 0xf0e4cc, 0xd0a888, 0xe6d6c0, 0xb89a80, 0xd8c0a0];
const OFFICE = [0xc9c2b4, 0xb8b0a2, 0xd6d0c4, 0xa8a49c, 0x9c8e80];
const GLASS = [0x5a7a96, 0x4c6a7e, 0x6a7a88, 0x55606a, 0x7a8a98];
export const LANDMARKS = {};
{
  const R = rng(1906);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => { const b = { seed: R(), lit: 0.3 + R() * 0.4, ...o }; b.y0 = groundY(b.x, b.z); B.push(b); return b; };
  // the frontage down both sides of California St, block by block
  for (let ci = -1; ci < CROSS.length - 1; ci++) {
    const z0 = ci < 0 ? 60 : CROSS[ci] - 8, z1 = CROSS[ci + 1] + 8;
    for (const side of [-1, 1]) {
      let z = z0;
      while (z > z1 + 5) {
        const down = -z;
        const fin = z < -460;                                       // the Financial District
        let w = fin ? 18 + R() * 20 : 7.5 + R() * 6;                 // lot width along the street
        if (z - w - z1 < 6) w = z - z1;
        const kind = fin ? (R() < 0.5 ? 2 : R() < 0.6 ? 3 : 1) : (R() < 0.75 ? 0 : 1);
        const d = fin ? 26 + R() * 14 : 18 + R() * 10;
        const floors = fin ? 12 + Math.floor(R() * 28) : kind === 0 ? 3 + Math.floor(R() * 3) : 6 + Math.floor(R() * 8);
        const fh = kind === 0 ? 3.5 : 3.8;
        const h = floors * fh + 1.2;
        add({ kind, x: side * (ST.walk + d / 2), z: z - w / 2, w: d, d: w - 0.4, h, col: kind === 0 ? pick(PAINT) : kind === 1 ? pick(OFFICE) : kind === 2 ? pick(GLASS) : pick(OFFICE), side, front: true, down });
        z -= w;
      }
    }
  }
  // the hilltop hotels (left and right of you, big stone blocks)
  add({ kind: 3, x: -48, z: -28, w: 60, d: 52, h: 34, col: 0xe2d8c4, side: -1, front: false, hotel: true });
  // the blocks behind the frontage, filling the view down the hill and the skyline at the bottom
  for (let x = -700; x <= 700; x += 70) for (let z = 40; z >= -1050; z -= 70) {
    if (Math.abs(x) < 55) continue;
    if (R() < 0.25) continue;
    const bx = x + (R() - 0.5) * 30, bz = z + (R() - 0.5) * 30;
    const fin = bz < -430 && Math.abs(bx) < 600;
    const w = 20 + R() * 25, d = 20 + R() * 25;
    const h = fin ? 30 + Math.pow(R(), 1.5) * 170 : 10 + R() * 25;
    const kind = fin ? (R() < 0.6 ? 2 : 3) : R() < 0.7 ? 0 : 1;
    if (B.some((o) => Math.abs(o.x - bx) < (o.w + w) / 2 + 3 && Math.abs(o.z - bz) < (o.d + d) / 2 + 3)) continue;
    add({ kind, x: bx, z: bz, w, d, h, col: kind === 0 ? pick(PAINT) : kind === 2 ? pick(GLASS) : pick(OFFICE), side: Math.sign(bx), front: false, far: Math.abs(bx) > 400 });
  }
  const clear = (x, z, r) => { for (let i = B.length - 1; i >= 0; i--) if (Math.hypot(B[i].x - x, B[i].z - z) < r) B.splice(i, 1); };
  // 555 California: dark red granite slab, right on the street at the bottom of the hill (237 m)
  clear(46, -560, 45);
  LANDMARKS.bofa = add({ kind: 3, x: 46, z: -560, w: 46, d: 30, h: 237, col: 0x4a2a24, side: 1, front: false, landmark: true });
  // Salesforce Tower (326 m), further down and to the right
  clear(420, -980, 60);
  LANDMARKS.sales = add({ kind: 2, x: 420, z: -980, w: 50, d: 50, h: 326, col: 0x9aa4ac, side: 1, front: false, landmark: true, round: true });
  // the Transamerica Pyramid is separate geometry (props.js); clear its block
  clear(-270, -700, 50);
  LANDMARKS.pyramid = { x: -270, z: -700, h: 260 };
  // when each building fails: old painted ones from magnitude ~8.6, offices ~9.3, towers ~10.2 (nearer you later)
  for (const b of B) {
    const near = clamp(1 - Math.hypot(b.x, b.z) / 900);
    b.mGlass = 5.8 + R() * 0.9;
    b.mBrick = b.kind === 0 ? 6.8 + R() * 0.8 : 99;
    b.mFall = b.kind === 0 ? 8.4 + R() * 1.0 + near * 0.6 : b.kind === 1 ? 9.0 + R() * 1.0 + near * 0.5 : 9.8 + R() * 1.0 + near * 0.4;
    if (b.landmark) b.mFall = b === LANDMARKS.bofa ? 10.6 : 10.9;
    if (b.hotel) b.mFall = 10.4;
    b.dur = 2.2 + b.h * 0.012;
    b.lean = (R() - 0.5) * 0.25;
  }
}

// ---- street furniture, cars ----
export const LAMPS = [], POLES = [], TREES = [];
{
  const R = rng(77);
  for (let z = 50; z > -1000; z -= 28) for (const side of [-1, 1]) {
    if (CROSS.some((c) => Math.abs(z - c) < 9)) continue;
    LAMPS.push({ x: side * (ST.road + 0.9), z: z + side * 9, side, seed: R() });
  }
  // the cable car's overhead-wire poles? (California line is cable-driven: no wires) — trolley-bus wires instead
  for (let z = 40; z > -1000; z -= 38) for (const side of [-1, 1]) POLES.push({ x: side * (ST.road + 0.4), z: z + side * 15, side, seed: R() });
  for (let z = 30; z > -460; z -= 11 + R() * 7) for (const side of [-1, 1]) {
    if (CROSS.some((c) => Math.abs(z - c) < 10) || R() < 0.45) continue;
    TREES.push({ x: side * (ST.road + 2.2), z, s: 0.5 + R() * 0.3, seed: R() });
  }
}
export const CARS = [];
{
  const R = rng(55);
  // parked along both curbs, nose downhill on the right, uphill on the left
  for (const side of [-1, 1]) for (let z = 40; z > -900; z -= 5.6 + R() * 1.8) {
    if (CROSS.some((c) => Math.abs(z - c) < 9) || R() < 0.15) continue;
    if (side < 0 && z > CAM0.z - 6 && z < CAM0.z + 6) continue;
    CARS.push({ x: side * (ST.road - 1.1), z, dir: side > 0 ? -1 : 1, parked: true, seed: R(), kind: Math.floor(R() * 4) });
  }
  // moving traffic in the outer lanes between the tracks and the parked cars, both ways
  for (const [x, dir] of [[-5.4, 1], [5.4, -1]]) for (let z = 30 + R() * 10; z > -900; z -= 14 + R() * 26) {
    if (CROSS.some((c) => Math.abs(z - c) < 6)) continue;
    CARS.push({ x, z, dir, moving: true, speed: 6 + R() * 4, seed: R(), kind: Math.floor(R() * 4) });
  }
}
export const CABLE = { x: TRACKS[1], z0: -78, speed: 4.2 };      // the cable car, climbing toward you on the right track
