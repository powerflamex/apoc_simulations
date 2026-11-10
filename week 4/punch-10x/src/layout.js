// The city plan (metres). x: east (+) / west (-); z: south (+) / north (-); y up. You stand on a little plaza on the
// south side of an east-west avenue in downtown Los Angeles, facing north, a brick wall in front of you; your fist
// hits it at IMP. Across the avenue: a row of shops, an office block behind them, then a line of towers along the
// way your punches go (north), and downtown's tallest towers beyond. Every building, car and person gets the time
// a punch's blast reaches it (blastHit), and what happens to it.
import { rng, clamp, smooth, lerp } from './util.js';
import { vPunch, flatR, N_PUNCH } from './timeline.js';

export const IMP = { x: 0.17, y: 1.36, z: -0.6 };              // where your fist meets the wall
export const WALL = { x0: -13.5, x1: 13.5, zf: -0.6, zb: -0.9, h: 1.65 };
export const AVE = { z0: -4.2, z1: -24.2, walkN: -29.0 };      // carriageway between z0 and z1; far sidewalk to walkN
export const LANES = [                                         // z, direction (+1 east), speed (m/s)
  { z: -6.6, dir: 1, sp: 11.5 }, { z: -10.0, dir: 1, sp: 12.5 }, { z: -14.6, dir: -1, sp: 12.0 }, { z: -18.0, dir: -1, sp: 11.0 },
];
export const PARK_Z = -21.6;
export const GRID = 110;                                       // the street grid: a cross street every 110 m
export const XST = { hw: 7, walk: 11 };                        // cross streets (north-south), half widths
export const AVES_Z = [-14.2, -14.2 - GRID * 2, -14.2 - GRID * 4, -14.2 - GRID * 6];   // the avenues (every other street is narrow)
export const CITY_R = 2700;
// east-west streets at z = streetZ(k) (k = 0: our avenue); half widths to the building line on each side
export const streetZ = (k) => -14.2 - k * GRID;
export function streetHW(k, side) {
  if (k === 0) return side === 'n' ? 14.8 : 14.8;           // our avenue: carriageway + sidewalks (to z = -29 and +0.6)
  return k % 2 === 0 ? 14 : 10;
}

// the punch's blast: forward (north) for the first ones, then all round you. Effective radius toward angle th (from
// north) for punch n, and how long its front takes to get there.
export function reachOf(n, th) {
  const R = flatR(n);
  const c = Math.max(Math.cos(th), 0);
  const fwd = 0.45 + 2.4 * c * c;              // focused ahead of the fist
  const k = smooth(9.5, 12.5, n);              // round by punch 12
  return R * lerp(fwd, 1.15, k);
}
export const frontTime = (n) => 0.45 + 0.1 * clamp(n - 9, 0, 8);
// first punch (from n0) whose blast reaches (x, z) with some margin: { n, v } (v: when the front gets there)
export function blastHit(x, z, n0 = 9, scale = 1) {
  const d = Math.hypot(x - IMP.x, z - IMP.z);
  const th = Math.atan2(x - IMP.x, -(z - IMP.z));
  for (let n = n0; n <= N_PUNCH; n++) {
    const Rr = reachOf(n, th) * scale;
    if (Rr >= d) return { n, v: vPunch(n) + frontTime(n) * Math.pow(d / Rr, 0.75), d };
  }
  return { n: 99, v: 1e9, d };
}

// ---- buildings ----
// kind 0: shops / walk-ups, 1: office (punched windows), 2: glass tower, 3: condo tower (balconies)
// fate: 'burst' (blown apart into pieces: the heroes and the near ones), 'fall' (caves in, sinks into its dust)
export const B = [];
const LOW_COL = [0xc9a27e, 0xb98a63, 0xe1cfb1, 0xd8b48c, 0xa86f4c, 0xe8d9bf, 0xcf9d74];
const MID_COL = [0xd6cfc2, 0xbfb8ac, 0xe3ddd0, 0xa9adb3, 0xcab79e, 0xe8dcc6];
const GLASS_COL = [0x5d86a8, 0x47758c, 0x6a7f99, 0x7aa0c0, 0x55708c, 0x4f7c9e, 0x8fb0cc, 0x6f8fa6];
const CONDO_COL = [0xe9e2d4, 0xd8cfbf, 0xefe9de, 0xdcd3c2];
{
  const R = rng(4242);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const add = (o) => { const b = { seed: R(), lean: (0.15 + R() * 0.3) * (R() < 0.5 ? -1 : 1), ...o }; B.push(b); return b; };
  // ---- the heroes, straight ahead ----
  // the shops across the avenue (punch 6 caves them in), the office block behind (punch 7 blows it apart)
  add({ kind: 0, x: 0, z: -40.5, w: 34, d: 22, h: 15, col: 0xd9b28a, hero: 'shops' });
  add({ kind: 1, x: 0, z: -66, w: 30, d: 22, h: 52, col: 0xe3ddd0, hero: 'office' });
  // the towers in line (punch 8 goes straight through all five), inside the blocks north of the shops
  const TW = [[-2, -150, 30, 28, 118, 2], [4, -205, 34, 30, 162, 3], [-3, -266, 32, 30, 205, 2], [2, -314, 36, 30, 148, 1], [-1, -390, 40, 36, 236, 2]];
  TW.forEach(([x, z, w, d, h, kind], i) => add({ kind, x, z, w, d, h, col: kind === 2 ? pick(GLASS_COL) : kind === 3 ? pick(CONDO_COL) : pick(MID_COL), hero: 'tower', ti: i, crown: kind === 2 && R() < 0.6 }));
  // our side of the avenue: the buildings round the plaza behind you (south), so the street reads as a canyon
  add({ kind: 1, x: -32, z: 14, w: 36, d: 26, h: 38, col: 0xd9cdb9 });
  add({ kind: 2, x: 34, z: 16, w: 34, d: 30, h: 96, col: 0x6a8fb0, crown: true });
  const heroes = B.slice();
  const taken = (x, z, w, d) => heroes.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 1.5 && Math.abs(b.z - z) < (b.d + d) / 2 + 1.5);
  // ---- the rest: blocks between the streets, taller toward downtown's core (north) ----
  const core = (x, z) => clamp(1 - Math.hypot(x * 1.2, z + 560) / 1500);
  const KMAX = Math.ceil(CITY_R / GRID) + 1;
  for (let j = -KMAX; j <= KMAX; j++) {
    for (let k = -KMAX; k <= KMAX; k++) {
      // block (j, k): between cross streets x = (j -+ 0.5) GRID and between east-west streets k (south) and k + 1 (north)
      const zs = streetZ(k), zn = streetZ(k + 1);
      const x0 = (j - 0.5) * GRID + XST.walk, x1 = (j + 0.5) * GRID - XST.walk;
      const zS = zs - streetHW(k, 'n'), zN = zn + streetHW(k + 1, 's');      // block interior: zN .. zS (zN more negative)
      const cx = j * GRID, cz = (zS + zN) / 2;
      if (Math.hypot(cx, cz) > CITY_R + 100) continue;
      if (j === 0 && k === -1) continue;                                      // the plaza you stand on
      const kc = core(cx, cz);
      const fade = clamp(1.25 - Math.hypot(cx, cz) / 3000, 0.25, 1);
      let x = x0;
      while (x < x1 - 8) {
        let w = 14 + R() * 22;
        if (x1 - x - w < 10) w = x1 - x;
        for (const side of [-1, 1]) {
          const r = R();
          const kind = r < 0.38 - 0.3 * kc ? 0 : r < 0.62 ? 1 : r < 0.86 ? 2 : 3;
          const dep = kind === 0 ? 14 + R() * 10 : 20 + R() * 14;
          const zc = side < 0 ? zN + dep / 2 : zS - dep / 2;
          let h = kind === 0 ? 8 + 3.8 * Math.floor(1 + R() * 3) : kind === 1 ? 22 + R() * 40 + 60 * kc : 40 + Math.pow(R(), 1.3) * (70 + 230 * kc);
          if (R() < 0.05 * kc) h += 120;
          h = Math.max(7, h * fade);
          const bw = w - 1.2, bxC = x + w / 2;
          if (!taken(bxC, zc, bw, dep)) add({ kind, x: bxC, z: zc, w: bw, d: dep, h, col: kind === 0 ? pick(LOW_COL) : kind === 1 ? pick(MID_COL) : kind === 2 ? pick(GLASS_COL) : pick(CONDO_COL), crown: kind === 2 && R() < 0.3 * kc });
        }
        x += w;
      }
      // one or two in the middle of the block
      const dm = (zS - zN) - 2 * 34 - 4;
      if (dm > 10 && R() < 0.8) {
        const kind = R() < 0.5 ? 2 : R() < 0.5 ? 1 : 3;
        const w = 20 + R() * 20;
        const h = Math.max(10, (kind === 1 ? 25 + R() * 50 : 50 + Math.pow(R(), 1.3) * (90 + 220 * kc)) * fade);
        const xc = cx + (R() - 0.5) * 20;
        if (!taken(xc, cz, w, dm)) add({ kind, x: xc, z: cz, w, d: dm, h, col: kind === 1 ? pick(MID_COL) : kind === 2 ? pick(GLASS_COL) : pick(CONDO_COL), crown: kind === 2 && R() < 0.3 * kc });
      }
    }
  }
}

// ---- each building's fate ----
// the heroes: scripted; the rest: the first blast that reaches it (from punch 9). Near ones burst into pieces, far ones
// cave in. Windows: the first blast that reaches 3x as far.
{
  for (const b of B) {
    const d = Math.hypot(b.x - IMP.x, b.z - IMP.z) - Math.min(b.w, b.d) * 0.4;
    b.dist = Math.hypot(b.x, b.z);
    if (b.hero === 'shops') { b.vHit = vPunch(6) + 0.08; b.fate = 'burst'; b.vGlass = vPunch(5) + 0.12; }
    else if (b.hero === 'office') { b.vHit = vPunch(7) + 0.1; b.fate = 'burst'; b.vGlass = vPunch(6) + 0.2; }
    else if (b.hero === 'tower') {
      // the tunnel of punch 8: through each tower in turn (the blast at ~1,500 m/s)
      b.vHit = vPunch(8) + 0.06 + (-b.z - 100) / 1500; b.fate = 'burst'; b.hole = 0.42 + 0.12 * Math.sin(b.ti * 2.1);
      b.vGlass = vPunch(7) + 0.3 + (-b.z) / 800;
    } else {
      const h = blastHit(b.x, b.z, 9, 1);
      b.vHit = h.v; b.nHit = h.n;
      b.fate = h.n <= 11 && h.d < 260 ? 'burst' : 'fall';
      // behind you, the forward blasts don't reach: the first round one does
      const g = blastHit(b.x, b.z, 8, 3.2);
      b.vGlass = Math.min(g.v, b.vHit);
    }
    b.dur = b.fate === 'burst' ? 1.2 : 1.6 + (b.seed * 1.4);
  }
}

// ---- traffic on the avenue: four lanes, everyone at the same speed per lane, so nobody ever runs into anyone; all
// brake together when the car in front of you goes flying ----
export const V_BRAKE = vPunch(3) + 0.15;
const DECEL = 7;
export function laneX(L, x0, v) {
  const t = v + 3;                                  // (they were driving before the video starts)
  const tb = V_BRAKE + 3;
  if (t < tb) return x0 + L.dir * L.sp * t;
  const dt = Math.min(t - tb, L.sp / DECEL);
  return x0 + L.dir * (L.sp * tb + L.sp * dt - 0.5 * DECEL * dt * dt);
}
// the bus: westbound in lane 2, it has stopped right in front of you; punch 4 flips it over
export const BUS = { x: -1.5, z: LANES[2].z, len: 12.2, w: 2.55, h: 3.2, vFlip: vPunch(4) + 0.04 };
export const CARS = [];
{
  const R = rng(55);
  const COLS = [0xf4f4f2, 0x111214, 0x8c9198, 0xb3201e, 0x1d3f7a, 0xd8d2c4, 0x2a2c30, 0x2d6a4f, 0xe8e8e8, 0x60656c, 0x7a1f2b, 0xf2c230];
  LANES.forEach((L, li) => {
    let x = -260 + R() * 10;
    while (x < 260) {
      CARS.push({ lane: li, x0: x, kind: Math.floor(R() * 4), col: COLS[Math.floor(R() * COLS.length)], seed: R() });
      x += 13 + R() * 16;
    }
  });
  // the hero car: in the near eastbound lane, right in front of your fist when punch 3 lands (x0: where a car was 3 s
  // before the video starts; laneX gives where it is at v)
  let hero = null, best = 1e9;
  for (const c of CARS) if (c.lane === 0) { const x = laneX(LANES[0], c.x0, vPunch(3)); if (Math.abs(x) < best) { best = Math.abs(x); hero = c; } }
  // shift lane 0 so the hero is exactly in front of you (x = 0.5) at the punch
  const shift = 0.5 - laneX(LANES[0], hero.x0, vPunch(3));
  for (const c of CARS) if (c.lane === 0) c.x0 += shift;
  hero.hero = true; hero.col = 0xc8261e; hero.kind = 0;
  // and nobody in lane 1 right beside it at that moment (it would be hit too early)
  for (let i = CARS.length - 1; i >= 0; i--) { const c = CARS[i]; if (c.lane === 1 && Math.abs(laneX(LANES[1], c.x0, vPunch(3))) < 7) CARS.splice(i, 1); }
  // the bus drives in lane 2 with the others and stops right in front of you: make room round it in its lane
  {
    const L = LANES[2];
    const stopX = laneX(L, 0, 99);
    BUS.x0 = BUS.x - stopX;
    for (let i = CARS.length - 1; i >= 0; i--) { const c = CARS[i]; if (c.lane === 2 && Math.abs(c.x0 - BUS.x0) < BUS.len / 2 + 5) CARS.splice(i, 1); }
  }
  // parked cars along the far curb
  for (let x = -200; x < 200; x += 6.4 + R() * 2.5) {
    if (Math.abs(x) < 6) continue;
    CARS.push({ parked: true, x0: x, z: PARK_Z + (R() - 0.5) * 0.2, yaw: Math.PI / 2 + (R() - 0.5) * 0.04, kind: Math.floor(R() * 4), col: COLS[Math.floor(R() * COLS.length)], seed: R() });
  }
  // when a blast throws each car (the hero: punch 3; the rest: punch 5 near the fist, then the later blasts)
  for (const c of CARS) {
    if (c.hero) { c.vThrow = vPunch(3) + 0.03; c.nThrow = 3; continue; }
    // where the car is when the blasts come (they've stopped by punch 5)
    const x = c.parked ? c.x0 : laneX(LANES[c.lane], c.x0, vPunch(5));
    const z = c.parked ? c.z : LANES[c.lane].z;
    c.xs = x; c.zs = z;
    const d = Math.hypot(x - IMP.x, z - IMP.z);
    if (d < 16 && Math.abs(x) < 9) { c.vThrow = vPunch(5) + d / 340; c.nThrow = 5; }
    else if (d < 34 && Math.abs(x) < 20) { c.vThrow = vPunch(6) + d / 340; c.nThrow = 6; }
    else if (d < 70) { c.vThrow = vPunch(7) + d / 400; c.nThrow = 7; }
    else { const h = blastHit(x, z, 8, 1.4); c.vThrow = h.v; c.nThrow = h.n; }
  }
}

// ---- people: walking along the sidewalks (their own line each, all at one speed per line, so nobody overlaps); when
// the car flies they run, straight away from you along their line; a blast knocks them down where it reaches them ----
export const V_RUN = vPunch(3) + 0.5;
export const PEOPLE = [];
{
  const R = rng(909);
  // walking lines: z, direction
  const LINES = [
    { z: -2.1, dir: 1 }, { z: -3.2, dir: -1 },                       // our side, beyond the wall
    { z: -25.0, dir: -1 }, { z: -26.2, dir: 1 }, { z: -27.4, dir: -1 },  // the far sidewalk
  ];
  LINES.forEach((Ln, li) => {
    let x = -120 + R() * 3;
    while (x < 120) {
      const p = { line: li, z: Ln.z + (R() - 0.5) * 0.3, dir: Ln.dir, x0: x, seed: R(), s: 0.92 + R() * 0.14 };
      PEOPLE.push(p);
      x += 2.2 + R() * 5.5;
    }
  });
}
const WALK = 1.35, RUN = 4.2;
export function personX(p, v) {
  // walking until V_RUN (a few tenths of a second to react), then running away from you
  const tr = V_RUN + 0.2 * p.seed;
  const xr = p.x0 + p.dir * WALK * (tr + 3);
  if (v < tr) return { x: p.x0 + p.dir * WALK * (v + 3), run: 0, dir: p.dir, dist: WALK * (v + 3) };
  const away = Math.sign(xr) || 1;
  const t = v - tr;
  const d = t < 0.5 ? RUN * t * t : RUN * (t - 0.25);
  return { x: xr + away * d, run: smooth(0, 0.5, t), dir: away, xr, dist: WALK * (tr + 3) + d };
}
// nobody where the bricks (punch 2), the car (punch 3) or the bus (punch 4) come down
for (let i = PEOPLE.length - 1; i >= 0; i--) {
  const p = PEOPLE[i];
  let bad = false;
  for (let v = 2.2; v < 8.2 && !bad; v += 0.05) {
    const x = personX(p, v).x;
    if (p.z > -5 && v < 4.5 && Math.abs(x - 0.2) < 5.5) bad = true;
    if (p.z < -20 && v > 4.4 && Math.abs(x - 0.5) < 6.5) bad = true;
    if (p.z < -20 && v > 6.4 && Math.abs(x - BUS.x) < 9) bad = true;
  }
  if (bad) PEOPLE.splice(i, 1);
}
for (const p of PEOPLE) {
  // the blast that knocks each one down: where they are when it reaches them
  let vk = 1e9;
  for (let n = 5; n <= 12 && vk > 1e8; n++) {
    const R = n === 5 ? 26 : n === 6 ? 45 : n === 7 ? 90 : reachOf(n, 0) * 1.6;
    const v0 = vPunch(n);
    const x = personX(p, v0).x;
    const d = Math.hypot(x - IMP.x, p.z - IMP.z);
    if (d < R && (n > 5 || p.z < 0)) vk = v0 + d / 340;
  }
  p.vKnock = vk;
}

// ---- palms and street lamps along the avenue ----
export const PALMS = [];
export const LAMPS = [];
{
  const R = rng(77);
  for (let x = -300; x <= 300; x += 16) {
    if (Math.abs(x) > 6) PALMS.push({ x: x + (R() - 0.5) * 2, z: -26.0 + (R() - 0.5) * 0.4, h: 14 + R() * 8, seed: R() });
    if (Math.abs(x - 8) > 4 && Math.abs(x) > 15) PALMS.push({ x: x + 8 + (R() - 0.5) * 2, z: -3.6, h: 12 + R() * 9, seed: R() });
  }
  for (let x = -300; x <= 300; x += 32) for (const z of [-3.9, -24.6]) LAMPS.push({ x: x + 4, z, side: z < -10 ? 1 : -1, seed: R() });
  for (const t of [...PALMS, ...LAMPS]) { const h = blastHit(t.x, t.z, 5, 1.2); t.vDown = t.z < -1 && Math.hypot(t.x, t.z) < 30 ? Math.min(h.v, vPunch(6) + 0.1) : h.v; }
}
