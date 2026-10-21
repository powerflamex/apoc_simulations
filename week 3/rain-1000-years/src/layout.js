// Seattle (metres). x: north (+) / south (-); z: east (+) / west (-); y up, 0 = the street (old sea level).
// You start on Pike Street, east of 1st Avenue, looking west down the street at the Public Market sign (the market's
// arcade faces you across Pike Place). Elliott Bay and the Olympic Mountains are behind it. Real places at their real
// directions and distances from the Market: the Space Needle 1.2 km north, 0.5 km west; Columbia Center (Seattle's
// tallest tower, 286 m) 0.6 km south, 0.9 km east; Mount Rainier 84 km south, 44 km east (95 km away).
import { rng, clamp } from './util.js';

export const PIKE = { road: 6.2, walk: 10.6 };                // |x| < road: roadway; |x| < walk: + sidewalks
export const FIRST = { z: -40, road: 8, walk: 12.5 };          // 1st Avenue (runs north-south)
export const SECOND = { z: 82, road: 8, walk: 12.5 };          // 2nd Avenue
export const PLACE = { z: -63, road: 4.6 };                    // Pike Place, the market's street
export const MARKET = { z0: -104, z1: -68.5, x0: -34, x1: 42, h: 9.2 };   // the arcade (front faces east at z1)
export const CAM0 = { x: 0, y: 2.0, z: 10 };                 // where you stand at the first frame
export const NEEDLE = { x: 1200, z: -530 };
export const COLUMBIA = { x: -580, z: 880 };
export const RAINIER = { x: -84200, z: 44200 };
export const LANES = [-3.1, 3.1];                              // x < 0: westbound (away from you), x > 0: eastbound
export const PARK = [-5.3, 5.3];

// ---- buildings (instanced boxes, facade.js) ----
// kind 0: old brick / walk-up with shops, 1: mid-rise office, 2: glass tower, 3: concrete residential tower
export const B = [];
const BRICK = [0x8a4a3a, 0x9c5a44, 0x7d4636, 0xa8745a, 0xc9b49a, 0x6e3e32, 0xb88a6a, 0xd8c8b0];
const MID = [0xb9b4aa, 0xa8a196, 0xcfc8ba, 0x8f949a, 0xc4b09a, 0x9d8f80];
const GLASS = [0x4a6a86, 0x3f5a62, 0x5a6a78, 0x4c5a6e, 0x6c8aa2, 0x55606a, 0x3a4a5a];
const RES = [0xd8d2c6, 0xc6beb0, 0xe2dbd0, 0xb0aca4];
// the corridor the camera floats along later (Pike St, the market, out to the Space Needle): nothing tall in it
export const PATH = [[CAM0.x, CAM0.z], [0, -20], [120, -120], [560, -300], [1060, -480]];
function nearPath(x, z, pad) {
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2);
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < pad) return true;
  }
  return false;
}
{
  const R = rng(1906);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => { const b = { seed: R(), lit: 0.5 + R() * 0.5, ...o }; B.push(b); return b; };
  const blocked = (x, z, w, d) => B.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 2 && Math.abs(o.z - z) < (o.d + d) / 2 + 2);
  // Pike Street frontage, both sides, from 1st Ave east to past 2nd Ave: old brick buildings, a hotel, shops
  for (const [z0, z1] of [[FIRST.z + FIRST.walk, SECOND.z - SECOND.walk], [SECOND.z + SECOND.walk, 230]]) {
    for (const side of [-1, 1]) {
      let z = z0;
      while (z < z1 - 6) {
        let w = 12 + R() * 16;
        if (z1 - z - w < 8) w = z1 - z;
        const kind = R() < 0.62 ? 0 : R() < 0.6 ? 1 : 3;
        const d = 18 + R() * 14;
        const floors = kind === 0 ? 3 + Math.floor(R() * 4) : kind === 1 ? 7 + Math.floor(R() * 8) : 12 + Math.floor(R() * 14);
        const h = floors * (kind === 0 ? 3.6 : 3.8) + 1.2;
        add({ kind, x: side * (PIKE.walk + d / 2), z: z + w / 2, w: d, d: w - 0.5, h, col: kind === 0 ? pick(BRICK) : kind === 1 ? pick(MID) : pick(RES), side, front: true, sign: kind === 0 });
        z += w;
      }
    }
  }
  // the corners of 1st Ave west of the frontage (low, so the market and the sky stay open)
  add({ kind: 0, x: 26, z: -56, w: 30, d: 10, h: 12.5, col: 0x8a4a3a, side: 1, front: false });
  add({ kind: 0, x: -27, z: -56, w: 32, d: 10, h: 11.2, col: 0xa8745a, side: -1, front: false });
  // downtown and Belltown: blocks of towers on a grid, taller toward the downtown core (south-east)
  for (let x = -1500; x <= 1700; x += 85) for (let z = -500; z <= 1500; z += 85) {
    if (Math.abs(x) < 40 && z < 260) continue;                       // Pike St itself
    if (z < -110 && x < 300) continue;                              // the waterfront and the bay
    if (x > 0 && z < -110 - 0.55 * x) continue;                    // the shore runs north-west
    if (Math.hypot(x - NEEDLE.x, z - NEEDLE.z) < 170) continue;      // Seattle Center around the Needle
    for (let k = 0; k < 2; k++) {
      if (R() < 0.3) continue;
      const bx = x + (R() - 0.5) * 40, bz = z + (R() - 0.5) * 40;
      const w = 20 + R() * 22, d = 20 + R() * 22;
      if (Math.abs(bx) < PIKE.walk + w / 2 + 2 && bz < 260) continue;
      if (nearPath(bx, bz, 28 + Math.max(w, d) * 0.72)) continue;
      const core = Math.exp(-(Math.pow((bx + 500) / 700, 2) + Math.pow((bz - 650) / 600, 2)));   // the downtown core
      const belltown = Math.exp(-(Math.pow((bx - 600) / 600, 2) + Math.pow((bz - 50) / 500, 2)));
      const tall = 18 + Math.pow(R(), 1.3) * (40 + 200 * core + 60 * belltown);
      const kind = tall > 70 ? (R() < 0.7 ? 2 : 3) : R() < 0.5 ? 1 : R() < 0.5 ? 3 : 0;
      if (blocked(bx, bz, w, d)) continue;
      add({ kind, x: bx, z: bz, w, d, h: tall, col: kind === 2 ? pick(GLASS) : kind === 3 ? pick(RES) : kind === 1 ? pick(MID) : pick(BRICK), side: 0, front: false, far: Math.hypot(bx, bz) > 900 });
    }
  }
  // Columbia Center: black glass, stepped, the tallest (286 m); and a few other named-looking towers near it
  const clear = (x, z, r) => { for (let i = B.length - 1; i >= 0; i--) if (Math.hypot(B[i].x - x, B[i].z - z) < r) B.splice(i, 1); };
  clear(COLUMBIA.x, COLUMBIA.z, 70);
  add({ kind: 2, x: COLUMBIA.x, z: COLUMBIA.z, w: 52, d: 46, h: 210, col: 0x23272c, side: 0, front: false, landmark: 1 });
  add({ kind: 2, x: COLUMBIA.x + 4, z: COLUMBIA.z - 3, w: 40, d: 36, h: 252, col: 0x23272c, side: 0, front: false, landmark: 1 });
  add({ kind: 2, x: COLUMBIA.x + 7, z: COLUMBIA.z - 5, w: 28, d: 26, h: 286, col: 0x23272c, side: 0, front: false, landmark: 1 });
  for (const [x, z, h, c] of [[-380, 560, 235, 0x6c7a88], [-260, 420, 220, 0x4a5a6a], [-700, 700, 230, 0x8a8478], [-470, 990, 205, 0x3a4a5a], [-150, 640, 192, 0x55606a], [-860, 1020, 180, 0x5a6a78]]) {
    clear(x, z, 45);
    add({ kind: 2, x, z, w: 36, d: 34, h, col: c, side: 0, front: false, crown: true });
  }
  // Belltown and the waterfront north of the market: mid-rise, some residential towers (keeps the Needle in view)
  B.forEach((b, i) => { b.i = i; });
}

// ---- the street ----
export const LAMPS = [];
export const SIGNALS = [];
export const TREES = [];
{
  const R = rng(77);
  for (let z = FIRST.z + FIRST.walk + 6; z < 300; z += 26) {
    if (Math.abs(z - SECOND.z) < SECOND.walk + 2) continue;
    for (const side of [-1, 1]) LAMPS.push({ x: side * (PIKE.road + 1.2), z: z + side * 7, side, seed: R() });
  }
  for (let z = FIRST.z + FIRST.walk + 14; z < 300; z += 15 + R() * 6) for (const side of [-1, 1]) {
    if (Math.abs(z - SECOND.z) < SECOND.walk + 4 || R() < 0.35) continue;
    TREES.push({ x: side * (PIKE.road + 2.4), z, s: 0.55 + R() * 0.25, seed: R() });
  }
  for (const zc of [FIRST.z, SECOND.z]) for (const [sx, sz] of [[-1, 1], [1, -1], [-1, -1], [1, 1]])
    SIGNALS.push({ x: sx * (PIKE.road + 1.0), z: zc + sz * (FIRST.road + 1.6), side: sx, face: sz, seed: R() });
}

// ---- the cars: stuck in traffic on Pike St (both ways), parked along the curbs, a queue on 1st Ave ----
export const CARS = [];
{
  const R = rng(55);
  const add = (o) => CARS.push({ seed: R(), kind: Math.floor(R() * 4), ...o });
  for (const [L, dir] of [[0, -1], [1, 1]]) {
    // stuck in front of you (up to 6 m ahead) and on behind you up the street
    let z = FIRST.z + FIRST.road + 3.5 + R() * 2;
    for (let n = 0; n < 30; n++) {
      const clear = z < CAM0.z - 6 || z > CAM0.z + 8;
      if (clear && Math.abs(z - SECOND.z) > SECOND.road + 3) add({ x: LANES[L], z, dir, lane: true });
      z += 6.2 + R() * 2.5;
      if (z > 220) break;
    }
  }
  for (const s of [-1, 1]) for (let z = FIRST.z + FIRST.walk + 4; z < 220; z += 5.8 + R() * 1.6) {
    if (Math.abs(z - SECOND.z) < SECOND.walk + 3 || R() < 0.2) continue;
    if (s < 0 && Math.abs(z - CAM0.z) < 4) continue;
    add({ x: PARK[s > 0 ? 1 : 0], z, dir: s > 0 ? 1 : -1, parked: true });
  }
  // 1st Ave: a queue each way across the end of the street
  for (const [x0, dir] of [[-14, 1], [14, -1]]) for (let n = 0; n < 6; n++) add({ x: x0 - dir * n * 6.6 - dir * R() * 1.5, z: FIRST.z + (dir > 0 ? -3.4 : 3.4), dir: 0, ns: dir });
}
// shopfronts people step into, out of the rain (doors on the Pike St frontage)
export const DOORS = [];
{
  const R = rng(4);
  for (const b of B) {
    if (!b.front) continue;
    const n = b.d > 16 ? 2 : 1;
    for (let k = 0; k < n; k++) DOORS.push({ x: b.side * PIKE.walk, z: b.z + (k - (n - 1) / 2) * b.d * 0.45 + (R() - 0.5) * 2, side: b.side });
  }
}
