// The city plan (metres). x: east (+) / west (-); z: south (+) / north (-); y up. You jump from the middle of the
// crossing at the origin: Brickell Avenue (six lanes, palms on the median) running north-south, a four-lane cross
// street east-west. Biscayne Bay starts 200 m east; Miami Beach is the strip of towers 4 km out across the water.
// Every building, lamp and car gets the time it fails from the bounces (timeline.js): the nearer the middle, the
// sooner its windows burst, its lights die, it catches fire, it comes down.
import { rng, clamp } from './util.js';
import { BOUNCES, V_SOUND, jumpOf } from './timeline.js';

export const AVE = { road: 12, median: 1.6, walk: 18 };              // |x| < road: carriageway; < walk: + sidewalks
export const LANES = [-10.3, -6.9, -3.5, 3.5, 6.9, 10.3];           // lane centres (x); x > 0 northbound (-z)
export const CROSS = { road: 7.4, walk: 12.5, step: 125 };          // cross streets at z = k * step
export const XLANES = [-5.6, -2.0, 2.0, 5.6];                       // cross street lane centres (z); z > 0 eastbound
export const STREETS_X = [-450, -300, -150, 140];                    // the parallel streets (x); 140: the bay drive
export const STREET_HW = 8;
export const BAY_X = 205;                                             // the shore
export const BEACH = { x0: 4000, x1: 4650 };                          // Miami Beach
export const crossZ = (z) => Math.round(z / CROSS.step) * CROSS.step;

// when the lights go out around the crossing: the outage spreads with each bounce
const OUTAGE = [[12, 25], [14, 45], [15, 90], [17, 160], [19, 300], [21, 600], [23, 1100], [25, 1600]];
export function vOutage(d) {
  for (const [n, r] of OUTAGE) if (d < r) { const b = BOUNCES.find((x) => x.n === n); return b ? b.v + 0.15 + d / 600 : 1e9; }
  return 1e9;
}
// first bounce whose radius `key` reaches distance d (plus how long the blast takes to get there)
export function vReach(d, key, extra = 0) {
  for (const b of BOUNCES) if (b[key] > d + extra) return b.v + Math.min(0.35, d / 900);
  return 1e9;
}
// the sonic boom of the takeoff at jump 15: the shock cone sweeps the street canyon as you climb
export const vBoom = (d) => (d < 260 ? V_SOUND + 0.06 + d / 1400 : 1e9);

// ---- buildings ----
// kind 0: low shops (painted stucco), 1: office (punched windows), 2: glass tower, 3: condo tower (balconies)
export const B = [];
const SHOP_COL = [0xf0dcc0, 0xe8b9a0, 0xf6ead2, 0xbfe0d8, 0xf1c6c9, 0xe6d3a3, 0xd8e6f0];
const MID_COL = [0xd8d2c6, 0xc2bcb2, 0xe2dccf, 0xa9adb3, 0xcdbba5];
const GLASS_COL = [0x4e7896, 0x3f6f7e, 0x5d6f86, 0x6a8fae, 0x4a5d74, 0x3d6a8a, 0x7896b0];
const RES_COL = [0xf2efe8, 0xe4e1da, 0xeeeae2, 0xdcd8d0, 0xf5f2ea];
const CROWN = [0x9b4dff, 0x2fd6ff, 0xff4fa8, 0x3dff9e, 0xffffff, 0xff8a2a];
// distance from the crossing to the nearest point of a footprint
const nearD = (x, z, w, d) => Math.hypot(Math.max(0, Math.abs(x) - w / 2), Math.max(0, Math.abs(z) - d / 2));
{
  const R = rng(305);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => {
    const b = { seed: R(), crown: -1, ...o };
    b.dN = nearD(b.x, b.z, b.w, b.d);
    b.vGlass = Math.min(vReach(b.dN, 'glass'), b.front && Math.abs(b.z) < 260 ? vBoom(b.dN) : 1e9);
    b.vOff = Math.min(vOutage(b.dN), b.vGlass + 0.4);
    b.vFall = vReach(b.dN, 'fell', b.h > 100 ? 4 : 0);
    b.dur = b.h > 100 ? 3.2 : 2.2;
    // set on fire by a white-hot landing close by
    b.vFire = 1e9;
    for (const x of BOUNCES) if (x.hot > 0.3 && x.knock * 0.5 > b.dN && x.v > b.vGlass - 0.01) { b.vFire = x.v + 0.3 + b.seed; break; }
    b.lean = (0.25 + R() * 0.3) * (R() < 0.5 ? -1 : 1);
    B.push(b);
    return b;
  };
  // the blocks along the avenue, both sides, out to the river (north) and 1.2 km south
  for (let k = -9; k <= 9; k++) {
    const zc = k * CROSS.step;
    const zA = zc + CROSS.walk, zB = zc + CROSS.step - CROSS.walk;      // block between this cross street and the next
    for (const side of [-1, 1]) {
      const x0 = AVE.walk + 1, x1 = side > 0 ? 140 - STREET_HW - 4 : 150 - STREET_HW - 4;
      // frontage: a podium with a tower on it, or a run of shops, or a glass office
      let z = zA + 0.5;
      while (z < zB - 8) {
        const near = Math.abs(zc) <= CROSS.step && k >= -1 && k <= 0;
        let w = 26 + R() * 22;
        w = Math.min(w, zB - z);
        if (zB - z - w < 12) w = zB - z;
        const r = R();
        const kind = r < (near ? 0.22 : 0.15) ? 0 : r < 0.35 ? 1 : r < 0.68 ? 3 : 2;
        const dep = kind === 0 ? 16 + R() * 8 : 30 + R() * (x1 - x0 - 34);
        const xc = side * (x0 + dep / 2);
        if (kind === 0) {
          add({ kind, x: xc, z: z + w / 2, w: dep, d: w - 0.8, h: 4.4 + 3.6 * Math.floor(1 + R() * 3), col: pick(SHOP_COL), front: true, side });
        } else {
          // podium (parking / lobby, 5-8 floors) and the tower above it
          const ph = 18 + R() * 12;
          add({ kind: 1, x: xc, z: z + w / 2, w: dep, d: w - 0.8, h: ph, col: pick(MID_COL), front: true, side, podium: true });
          const tw = Math.min(dep - 4, 24 + R() * 14), td = Math.min(w - 4, 22 + R() * 12);
          const th = ph + (kind === 1 ? 40 + R() * 60 : 90 + Math.pow(R(), 0.8) * 150);
          const tb = add({ kind, x: xc + side * (R() - 0.5) * (dep - tw) * 0.6, z: z + w / 2 + (R() - 0.5) * (w - td) * 0.5, w: tw, d: td, h: th,
            col: kind === 2 ? pick(GLASS_COL) : kind === 3 ? pick(RES_COL) : pick(MID_COL), front: true, side, tower: true });
          if (R() < 0.22) tb.crown = Math.floor(R() * CROWN.length);
        }
        z += w;
      }
    }
  }
  // downtown across the river (north) and the blocks west: towers thinning out with distance
  for (let z = -1300; z > -3600; z -= 90 + R() * 60) for (let x = -900; x < 200; x += 60 + R() * 50) {
    if (Math.abs(x) < AVE.walk + 6 || R() < 0.25) continue;
    const kind = R() < 0.5 ? 2 : R() < 0.6 ? 3 : 1;
    const hb = z > -2600 ? 160 : 70;
    const b = add({ kind, x, z, w: 24 + R() * 22, d: 24 + R() * 22, h: 30 + Math.pow(R(), 1.5) * hb + (z > -2600 && R() < 0.15 ? 120 : 0), col: kind === 2 ? pick(GLASS_COL) : kind === 3 ? pick(RES_COL) : pick(MID_COL), far: true });
    if (R() < 0.1) b.crown = Math.floor(R() * CROWN.length);
  }
  for (let z = -1250; z < 1250; z += 70 + R() * 40) for (let x = -1500; x < -170; x += 55 + R() * 45) {
    if (R() < 0.3) continue;
    const kind = R() < 0.25 ? 2 : R() < 0.5 ? 3 : 1;
    add({ kind, x, z, w: 20 + R() * 25, d: 20 + R() * 25, h: 12 + Math.pow(R(), 2.2) * (x > -600 ? 120 : 50), col: kind === 2 ? pick(GLASS_COL) : kind === 3 ? pick(RES_COL) : pick(MID_COL), far: true });
  }
  // the bayfront towers east of the avenue's blocks are part of the frontage loop; Miami Beach across the bay
  for (let z = -9000; z < 6000; z += 45 + R() * 70) {
    if (R() < 0.35) continue;
    const kind = R() < 0.6 ? 3 : 2;
    add({ kind, x: BEACH.x0 + 120 + R() * 380, z, w: 25 + R() * 25, d: 20 + R() * 25, h: 20 + Math.pow(R(), 1.3) * 110, col: kind === 2 ? pick(GLASS_COL) : pick(RES_COL), far: true, beach: true });
  }
}
export { CROWN };

// ---- street furniture ----
export const LAMPS = [];
export const PALMS = [];
{
  const R = rng(77);
  for (let z = -1100; z < 1100; z += 30) {
    if (Math.abs(z - crossZ(z)) < CROSS.walk + 2) continue;
    for (const side of [-1, 1]) {
      const x = side * (AVE.road + 0.9), zz = z + side * 7;
      LAMPS.push({ x, z: zz, side, seed: R(), d: Math.hypot(x, zz) });
    }
  }
  for (let x = -600; x < 200; x += 30) {
    if (Math.abs(x) < AVE.walk + 3) continue;
    for (const side of [-1, 1]) LAMPS.push({ x: x + side * 5, z: side * (CROSS.road + 0.9), side, seed: R(), ew: true, d: Math.hypot(x, CROSS.road) });
  }
  for (const l of LAMPS) { l.vOff = vOutage(l.d); l.vDown = vReach(l.d, 'cars', 2); }
  // royal palms on the median, and along the sidewalks
  for (let z = -1100; z < 1100; z += 12 + R() * 3) {
    if (Math.abs(z - crossZ(z)) < CROSS.walk + 4) continue;
    PALMS.push({ x: (R() - 0.5) * 0.4, z, h: 11 + R() * 4, seed: R() });
    for (const side of [-1, 1]) if (R() < 0.55) PALMS.push({ x: side * (AVE.road + 3.4), z: z + R() * 5, h: 8 + R() * 5, seed: R() });
  }
  for (const p of PALMS) { p.d = Math.hypot(p.x, p.z); p.vDown = vReach(p.d, 'cars', 3); p.vBurn = vReach(p.d, 'knock', 0); }
}

// ---- cars: everyone stopped to watch ----
export const CARS = [];
{
  const R = rng(55);
  const COLS = [0xf4f4f2, 0x111214, 0x8c9198, 0xb3201e, 0x1d3f7a, 0xd8d2c4, 0x2a2c30, 0xf2c230, 0x2d6a4f, 0xe8e8e8, 0x60656c];
  const add = (o) => CARS.push({ seed: R(), kind: Math.floor(R() * 4), col: COLS[Math.floor(R() * COLS.length)], ...o });
  // northbound (x > 0, heading -z), queued south of the crossing; southbound queued north of it
  for (const L of [3, 4, 5]) { let z = 15 + R() * 2; for (let n = 0; n < 14; n++) { add({ x: LANES[L] + (R() - 0.5) * 0.3, z: z + 2.3, yaw: 0 }); z += 6.2 + R() * 3.5; } }
  for (const L of [0, 1, 2]) { let z = -15 - R() * 2; for (let n = 0; n < 14; n++) { add({ x: LANES[L] + (R() - 0.5) * 0.3, z: z - 2.3, yaw: Math.PI }); z -= 6.2 + R() * 3.5; } }
  // the cross street: eastbound (z > 0, heading +x) queued west; westbound queued east
  for (const L of [2, 3]) { let x = -20 - R() * 2; for (let n = 0; n < 9; n++) { add({ x: x - 2.3, z: XLANES[L], yaw: -Math.PI / 2 }); x -= 6.2 + R() * 3.5; } }
  for (const L of [0, 1]) { let x = 20 + R() * 2; for (let n = 0; n < 9; n++) { add({ x: x + 2.3, z: XLANES[L], yaw: Math.PI / 2 }); x += 6.2 + R() * 3.5; } }
  // two that stopped in the middle of the crossing, at an angle
  add({ x: 6.5, z: 2.6, yaw: 0.5, kind: 0, col: 0xf2c230, taxi: true });
  add({ x: -7.6, z: -2.2, yaw: Math.PI + 0.35, kind: 2, col: 0x111214 });
  for (const c of CARS) c.d = Math.hypot(c.x, c.z);
}

// ---- the crowd: in a ring round the crossing, on the sidewalks, watching you ----
export const CROWD0 = [];
{
  const R = rng(4040);
  const free = (x, z) => {
    for (const c of CARS) if (Math.abs(x - c.x) < 1.6 && Math.abs(z - c.z) < 3.1) return false;
    for (const p of CROWD0) if (Math.hypot(x - p.x, z - p.z) < 0.9) return false;
    return true;
  };
  let guard = 0;
  // only on the sidewalks and crosswalks round the crossing (bands A: the avenue's sidewalks, B: the cross street's),
  // so the way out along their street is clear of the stopped cars
  while (CROWD0.length < 240 && guard++ < 40000) {
    let x, z, run;
    const sA = R() < 0.5 ? -1 : 1, sB = R() < 0.5 ? -1 : 1;
    if (R() < 0.55) {
      x = sA * (AVE.road + 0.7 + R() * (AVE.walk - AVE.road - 1.4)); z = (R() - 0.5) * 2 * (8 + Math.pow(R(), 1.5) * 60); run = 'z';
    } else {
      z = sB * (CROSS.road + 0.3 + R() * (CROSS.walk - CROSS.road - 1.0)); x = (R() - 0.5) * 2 * (2 + Math.pow(R(), 1.5) * 55); run = 'x';
    }
    if (Math.hypot(x, z) < 8.5 || !free(x, z)) continue;
    CROWD0.push({ x, z, run, seed: R() });
  }
}
