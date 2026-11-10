// The street plan (metres). z: north (+, downhill, toward the bay) / south (-, uphill); x: west (+) / east (-); y up.
// The camera stands at the top of the street looking north, down the hill to the bay (west is on the left).
// One street (two traffic lanes, cable car tracks in the middle, parking along both curbs) runs straight down the
// hill; cross streets every 125 m; Victorian rowhouses (7.6 m lots) line every street. At the bottom, the flat
// waterfront: Beach St, a lawn with palms, a few brick buildings, the promenade and the seawall; then the bay.
import { rng, clamp } from './util.js';
import { hill, slide, Z_FOOT, Z_EDGE, SLAB, V_NAILS, V_BOLTS, VT, tOf } from './timeline.js';

export const ST = { tracks: 1.2, lane: 3.6, park: 6.15, road: 7.3, walk: 10.8 };   // |x| of lane centres and edges
export const RAIL = 0.535;                                  // half gauge (3 ft 6 in)
export const CROSS = { w: 14, z: [-7, -132, -257, -382, -523] };   // cross street centres (the last one is the top)
export const Z_PLATEAU = -516;                              // the top of the hill is flat from here on (south)
export const SUN = { az: 262, el: 16 };                     // compass degrees: low in the west, on the left
export const inCross = (z, pad = 0) => CROSS.z.some((c) => Math.abs(z - c) < CROSS.w / 2 + pad);
export const onSlope = (z) => z < Z_FOOT && z > -500;

// "you": lying in the top crosswalk, just ahead of the camera, after your feet went
export const YOU_AT = { x: 2.2, z: -519.5 };
export const CAM = { x: 1.4, z: -531, h: 7.2, pitch: -12.5 };

// ---- houses ----
// kind 0: Victorian (wood siding, a bay window, a bracketed cornice), 1: plain stucco flat-front, 2: brick block
export const H = [];
const VIC = [0xa8d5c2, 0xf2c6c2, 0xf3e3a1, 0xb9cde6, 0xf4efe1, 0xd7c2e2, 0xe9b98d, 0xc8dca0, 0x9cc3d5, 0xf0d3a8, 0xe5a5a0, 0xb7e0d8];
const STUCCO = [0xece4d4, 0xe2d6c0, 0xd9d2c4, 0xf2ebdc, 0xcfc6b4];
const BRICK = [0x9a4b36, 0x8a3f30, 0xa65a42, 0x7d4a3a];
{
  const R = rng(415);
  const pick = (a) => a[Math.floor(R() * a.length)];
  // a row of lots along z (both sides of a north-south street at |x| = front), or along x (a cross street)
  const addLot = (o) => {
    const kind = R() < 0.72 ? 0 : 1;
    const floors = kind === 0 ? 2 + (R() < 0.65 ? 1 : 0) : 2 + Math.floor(R() * 3);
    const b = { seed: R(), kind, floors, col: kind === 0 ? pick(VIC) : pick(STUCCO), ...o };
    b.h = b.h ?? floors * 3.3 + 2.6 + (kind === 0 ? 1.4 : 0.6);
    H.push(b);
    return b;
  };
  // along the main street, both sides, every 7.6 m lot from the foot up to the top intersection
  for (const side of [-1, 1]) {
    let z = Z_FOOT - 1.2;
    while (z > -514) {
      const w = 7.6 * (R() < 0.85 ? 1 : 1.5);
      if (inCross(z - w / 2, w / 2 + 0.5)) { z -= 1; continue; }
      addLot({ x: side * (ST.walk + 8), z: z - w / 2, w, d: 16, side, ax: 'x', front: true });
      z -= w;
    }
  }
  // along the cross streets (facing them), out to the next parallel streets and beyond
  for (const zc of CROSS.z.slice(1)) for (const sz of [-1, 1]) for (const side of [-1, 1]) {
    let x = ST.walk + 16 + 0.5;
    while (x < 330) {
      const w = 7.6 * (R() < 0.85 ? 1 : 1.4);
      addLot({ x: side * (x + w / 2), z: zc + sz * (CROSS.w / 2 + 8), w, d: 16, side, sz, ax: 'z', front: false });
      x += w + (R() < 0.08 ? 3 : 0);
    }
  }
  // the parallel streets' rows (the roofscape seen from above as you ride down), both sides of x = ±125
  for (const xs of [-125, 125, -250, 250]) for (const sx of [-1, 1]) {
    let z = Z_FOOT - 1.2;
    while (z > -640) {
      const w = 7.6;
      if (inCross(z - w / 2, w / 2 + 0.5)) { z -= 1; continue; }
      addLot({ x: xs + sx * (ST.walk + 8), z: z - w / 2, w, d: 16, side: Math.sign(xs), ax: 'x', front: false, far: true });
      z -= w;
    }
  }
  // the plateau behind the top: more rows going on south
  for (let z = -545; z > -700; z -= 7.6) for (const side of [-1, 1]) addLot({ x: side * (ST.walk + 8), z, w: 7.6, d: 16, side, ax: 'x', front: true, plateau: true });
  // the flat waterfront: brick blocks on the right (east), between Beach St and the promenade
  for (const [x, z, w, d, h] of [[-26, 13, 28, 22, 13], [-56, 12, 26, 20, 16], [-24, -26, 26, 20, 11]]) {
    if (z < Z_FOOT) continue;
    H.push({ seed: R(), kind: 2, floors: Math.round(h / 3.6), col: pick(BRICK), x, z, w: d, d: w, h, side: -1, ax: 'x', front: true, flat: true });
  }
  // each house: its ground (lowest corner), when it fails (nails slide out), and whether it sits on the sliding slab
  for (const b of H) {
    const za = b.z - (b.ax === 'x' ? b.w : b.d) / 2, zb = b.z + (b.ax === 'x' ? b.w : b.d) / 2;
    b.y0 = hill(zb) - 0.6;
    b.yTop = hill(za) + b.h;
    b.hh = b.yTop - b.y0;
    // far ones (low down, near the bay) first, the ones by you last: the collapse climbs the hill toward you
    const up = clamp((Z_FOOT - b.z) / 500);
    b.vFall = b.kind === 2 ? 1e9 : b.plateau ? V_NAILS + 9 + R() * 2.5 : V_NAILS - 1 + 10.5 * up + (R() - 0.5) * 2.0 + (b.front ? 0 : 1 + R() * 2);
    b.dur = 2.6 + R() * 1.6;
    b.lean = 0.55 + R() * 0.35;          // how far it racks over (shear) before it pancakes
  }
}
export const HOUSES_FRONT = H.filter((b) => b.front && !b.flat && !b.plateau);

// ---- parked cars, both curbs, all the way down (none in the cross streets or driveways) ----
export const CARS = [];
{
  const R = rng(902);
  for (const side of [-1, 1]) {
    for (let z = Z_FOOT - 4; z > -512; z -= 5.2 + R() * 1.4) {
      if (inCross(z, 3) || R() < 0.06) continue;
      CARS.push({ x: side * ST.park, z0: z, dir: side > 0 ? -1 : 1, parked: true, seed: R(), kind: Math.floor(R() * 4) });
    }
  }
  // on the flat top intersection and the plateau beyond: parked, they stay (until the ground goes)
  for (const side of [-1, 1]) for (let z = -536; z > -620; z -= 6 + R() * 2) CARS.push({ x: side * ST.park, z0: z, dir: side > 0 ? -1 : 1, parked: true, plateau: true, seed: R(), kind: Math.floor(R() * 4) });
  // moving traffic on the hill: driving down (x < 0, toward +z) and up (x > 0)
  for (const [z, u] of [[-300, 7.5], [-180, 8.5], [-470, 6.5], [-90, 8], [-400, 7], [-240, 8]]) CARS.push({ x: -ST.lane, z0: z, u0: u, dir: 1, seed: R(), kind: Math.floor(R() * 4) });
  for (const [z, u] of [[-260, -7.5], [-150, -8.5], [-410, -6], [-330, -7], [-200, -8]]) CARS.push({ x: ST.lane, z0: z, u0: u, dir: -1, seed: R(), kind: Math.floor(R() * 4) });
  // the bottom: parked along Beach St and the waterfront (they stay until the hill arrives)
  for (const [x, z] of [[-18, -10.5], [-24, -10.5], [-31, -10.5], [16, -3.5], [23, -3.5], [30, -3.5], [-8, 6], [8, 20]]) CARS.push({ x, z0: z, flat: true, dir: 0, parked: true, seed: R(), kind: Math.floor(R() * 4), yaw: Math.abs(z) < 12 ? Math.PI / 2 : 0 });
}

// ---- the cable car: climbing toward you on the right-hand track, 80 m down the hill ----
// Its grip on the cable and its brakes are friction: it coasts to a stop and slides back down, faster and faster.
export const CABLE = { x: ST.tracks, z0: -444, u0: -4.25, len: 8.4, vt: VT.cable, ts: 0, float: 6 };
const cs = {};
export function cableAt(v, out = {}) { slide(CABLE, tOf(v), cs); Object.assign(out, cs); return out; }

// ---- street lamps (bolted to their bases) and a few sidewalk trees ----
export const LAMPS = [];
export const TREES = [];
{
  const R = rng(77);
  for (let z = Z_FOOT - 8; z > -560; z -= 28 + R() * 6) for (const side of [-1, 1]) {
    if (inCross(z, 1)) continue;
    LAMPS.push({ x: side * (ST.road + 0.6), z0: z + side * 5, side, seed: R(), vFall: z > -500 ? V_BOLTS + R() * 7 : 1e9 });
  }
  for (let z = Z_FOOT - 20; z > -560; z -= 20 + R() * 25) for (const side of [-1, 1]) {
    if (inCross(z, 4) || R() < 0.45) continue;
    TREES.push({ x: side * (ST.walk - 1.1), z0: z, s: 0.7 + R() * 0.4, seed: R() });
  }
  // palms on the waterfront lawn (left, west)
  for (const [x, z] of [[18, 8], [26, 14], [34, 9], [21, 24], [40, 20], [30, 28]]) TREES.push({ x, z0: z, s: 1, seed: R(), palm: true });
}
