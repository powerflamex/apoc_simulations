// The city plan (metres). The camera looks down the boulevard toward -z ("south"); +x is to the right.
// A wide pedestrian promenade runs down the middle (|x| < PROM), two lanes of traffic each side (right-hand traffic:
// cars on the right drive away from you, tail lights; on the left they come toward you, headlights), sidewalks, then
// the buildings: 5-12 storey blocks with shops and neon at street level, cross streets every BLOCK m, and downtown's
// towers at the far end of the boulevard, under a big open sky.
import { rng } from './util.js';

export const PROM = 7.0;                    // promenade half-width
export const ROAD = 14.5;                   // |x| < ROAD: promenade + roads
export const WALK = 21.0;                   // |x| < WALK: + sidewalks; buildings start here
export const LANES = [-12.6, -9.0, 9.0, 12.6];
export const BLOCK = 95, CROSSW = 9;        // cross streets every 95 m (half-width 9 m), the first at z = -40
export const crossZ = (z) => Math.round((z + 40) / BLOCK) * BLOCK - 40;
export const inCross = (z, pad = 0) => Math.abs(z - crossZ(z)) < CROSSW + pad;
export const CAM = { x: 0.4, y: 1.66, z: 0 };

// ---- buildings: kind 0 old block (plaster, punched windows), 1 office (stone grid), 2 glass tower, 3 flats ----
export const B = [];
const OLD = [0xd9c3a0, 0xc99a7a, 0xe8dcc4, 0xb7c4bd, 0xd8b0a4, 0xc4ad8a, 0xe6cf9c, 0xa7b6c4, 0xcfc0d6, 0xd49a6e];
const OFF = [0xb4aea4, 0xa39c90, 0xc9c2b4, 0x8c9096, 0xbfac96];
const GLS = [0x4c6a84, 0x3c5e66, 0x6c6052, 0x44506a, 0x5d7a92, 0x4d565e];
const FLT = [0xd4cec2, 0xc2baac, 0xded6ca];
{
  const R = rng(4242);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => { const b = { seed: R(), sign: false, ...o }; B.push(b); return b; };
  // the frontage on both sides, block by block (behind the camera too: it turns round)
  for (let k = 1; k >= -16; k--) {
    const zc = k * BLOCK - 40;                       // a cross street centre
    const z0 = zc - CROSSW, z1 = zc - BLOCK + CROSSW;  // the block spans z1..z0
    for (const side of [-1, 1]) {
      let z = z0;
      while (z > z1 + 5) {
        const near = zc > -250, mid = zc > -600;
        let kind = R();
        kind = near ? (kind < 0.78 ? 0 : 1) : mid ? (kind < 0.5 ? 0 : kind < 0.78 ? 1 : kind < 0.92 ? 3 : 2) : (kind < 0.3 ? 0 : kind < 0.55 ? 1 : kind < 0.78 ? 3 : 2);
        let w = kind === 0 ? 11 + R() * 12 : 16 + R() * 18;
        w = Math.min(w, z - z1);
        if (z - w - z1 < 8) w = z - z1;
        const d = 16 + R() * 10;
        const floors = kind === 0 ? (near ? 4 + Math.floor(R() * 3) : 5 + Math.floor(R() * 4)) : kind === 1 ? (near ? 6 + Math.floor(R() * 3) : 7 + Math.floor(R() * 6)) : kind === 3 ? 10 + Math.floor(R() * 10) : 14 + Math.floor(R() * 18);
        const fh = kind === 0 ? 3.4 : 3.6;
        const h = floors * fh + 1.6;
        add({ kind, x: side * (WALK + d / 2), z: z - w / 2, w: d, d: w - 0.4, h, col: kind === 0 ? pick(OLD) : kind === 1 ? pick(OFF) : kind === 2 ? pick(GLS) : pick(FLT), side, front: true, sign: R() < 0.75 });
        z -= w;
      }
    }
  }
  // rows behind the frontage
  for (let k = 1; k >= -16; k--) {
    const zc = k * BLOCK - 40;
    for (const side of [-1, 1]) for (let x = WALK + 34; x < 300; x += 30 + R() * 22) {
      if (R() < 0.25) continue;
      const kind = R() < 0.4 ? 2 : R() < 0.5 ? 3 : 1;
      const w = 18 + R() * 16, d = 18 + R() * 16;
      const h = (kind === 1 ? 22 : 30) + Math.pow(R(), 1.7) * (kind === 2 ? 110 : 50) * (zc > -250 && x < 120 ? 0.35 : 1);
      add({ kind, x: side * x, z: zc - CROSSW - 4 - R() * (BLOCK - 2 * CROSSW - 8 - d) - d / 2, w, d, h, col: kind === 2 ? pick(GLS) : kind === 3 ? pick(FLT) : pick(OFF), side, front: false });
    }
  }
  // downtown at the end of the boulevard: towers 120-330 m, the boulevard runs into them
  for (let n = 0; n < 70; n++) {
    const z = -1450 - R() * 1500, x = (R() - 0.5) * 1500;
    if (Math.abs(x) < 60 && z > -1700) continue;
    const kind = R() < 0.7 ? 2 : 3;
    add({ kind, x, z, w: 26 + R() * 24, d: 26 + R() * 24, h: 70 + Math.pow(R(), 1.3) * 260, col: kind === 2 ? pick(GLS) : pick(FLT), side: Math.sign(x), front: false, far: true, beacon: true });
  }
  // the low city all around, out to the haze
  for (let z = 400; z > -4500; z -= 60 + R() * 50) for (let x = -2600; x < 2600; x += 50 + R() * 60) {
    if (Math.abs(x) < 320 && z > -1600) continue;
    if (R() < 0.35) continue;
    const kind = R() < 0.25 ? 2 : R() < 0.5 ? 3 : 1;
    add({ kind, x, z, w: 22 + R() * 26, d: 22 + R() * 26, h: 14 + Math.pow(R(), 2.4) * 90, col: kind === 2 ? pick(GLS) : pick(OFF), side: Math.sign(x), front: false, far: true });
  }
}
// the big LED screen on the right, over a corner a block ahead (satellite TV)
export const SCREEN = { x: WALK - 0.5, y: 16, z: -78, w: 17, h: 9.6 };
{
  // make sure the building under the screen is tall enough and plain glass-free (an office)
  const b = B.find((o) => o.front && o.side > 0 && Math.abs(o.z - SCREEN.z) < o.d / 2);
  if (b) { b.h = Math.max(b.h, 34); b.kind = 1; b.screen = true; b.d = Math.max(b.d, 24); }
}

// ---- street furniture ----
export const LAMPS = [];        // tall double lamps on the promenade edge, and along the sidewalks
export const BENCHES = [], KIOSKS = [], PLANTERS = [];
{
  const R = rng(77);
  for (let z = 60; z > -1500; z -= 24) {
    if (inCross(z, 1)) continue;
    for (const s of [-1, 1]) LAMPS.push({ x: s * (PROM - 0.6), z: z + s * 6, y: 7.5, prom: true });
    for (const s of [-1, 1]) LAMPS.push({ x: s * (ROAD + 0.7), z: z + 12 + s * 4, y: 8.5 });
  }
  for (let z = 40; z > -700; z -= 24) {
    if (inCross(z, 3)) continue;
    for (const s of [-1, 1]) if (R() < 0.7) BENCHES.push({ x: s * (PROM - 1.7), z: z + s * 6 + 4, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    if (R() < 0.35) PLANTERS.push({ x: (R() < 0.5 ? -1 : 1) * (PROM - 1.6), z: z - 8 });
  }
  // flower and newspaper kiosks on the promenade
  for (const [x, z] of [[-4.6, -34], [4.8, -112], [-4.8, -190], [4.6, -276], [-4.4, -360]]) KIOSKS.push({ x, z, seed: R() });
}

// ---- traffic: lanes 0,1 (x < 0) come toward you (+z), lanes 2,3 drive away (-z); evenly spaced per lane so nobody
// ever overlaps. Each car's position wraps over [Z1, Z0] (the wrap happens behind you or far down the road).
export const TRAFFIC = { Z0: 70, Z1: -1500 };
export const CARS = [];
{
  const R = rng(55);
  LANES.forEach((x, L) => {
    const dir = x < 0 ? 1 : -1;
    const speed = (L === 0 || L === 3 ? 9.5 : 12.5) + R() * 1.5;
    const gap = 26 + R() * 8;
    const len = TRAFFIC.Z0 - TRAFFIC.Z1;
    for (let z = 0; z < len - gap * 0.5; z += gap * (0.7 + R() * 0.6)) CARS.push({ x, z0: z, dir, speed, L, kind: Math.floor(R() * 4), seed: R(), taxi: R() < 0.18 });
  });
}
// parked along the sidewalk curb on the far sides? (none: the curbs are bus stops and loading bays)

// ---- sky: directions (unit vectors in world space) ----
const dirOf = (azDeg, elDeg) => {   // az: degrees from straight ahead (-z), + to the right; el: degrees up
  const a = azDeg * Math.PI / 180, e = elDeg * Math.PI / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
export const SKY = {
  jupiter: dirOf(-22, 31), saturn: dirOf(-34, 24), mars: dirOf(27, 21),
  moon: dirOf(10, 36),           // high over the far end of the street, so the long lens sees it clear of the roofs
  sun: dirOf(-38, 17),          // the stage's daily frame: 9 am, low in the east-southeast (to the left)
  // the Milky Way: its plane's pole, and the galactic centre (low, a little left of straight ahead)
  gc: dirOf(-8, 16), gpole: null,
};
{
  // the pole: perpendicular to the centre and tilted so the band rises from the lower left to high overhead right
  const c = SKY.gc, t = dirOf(70, 52);
  const dot = c[0] * t[0] + c[1] * t[1] + c[2] * t[2];
  const n = [t[0] - c[0] * dot, t[1] - c[1] * dot, t[2] - c[2] * dot];
  // pole = c x n (the band contains c and t)
  const p = [c[1] * n[2] - c[2] * n[1], c[2] * n[0] - c[0] * n[2], c[0] * n[1] - c[1] * n[0]];
  const l = Math.hypot(...p);
  SKY.gpole = p.map((x) => x / l);
}
