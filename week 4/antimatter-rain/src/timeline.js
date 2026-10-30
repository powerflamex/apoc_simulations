// "What if it rained antimatter?" — the story as functions of VIDEO time v (seconds; the video starts at v = 0).
// The rule: a storm over Seattle starts raining antimatter, and the number of drops grows 10x every 4.5 seconds.
//   One big raindrop (4 mm across) is 33.5 mg. Antimatter and matter turn into pure energy: E = 2 m c^2
//   = 2 x 33.5e-6 kg x (3e8 m/s)^2 = 6.0e12 J = 1,440 tons of TNT.
//   We show each drop falling out of the cloud as a glowing streak (it is already annihilating with the air) and
//   bursting where it lands: on the bay, the hills, the city.
//   10 drops = 14,400 tons: Hiroshima (15,000). 35,000 drops = 50 million tons: the Tsar Bomba.
//   The combined blast flattens everything out to 600 m x (drops)^(1/3): Portland (233 km) at 35 s,
//   Boise 41 s, San Francisco 44 s, Los Angeles 46 s, Denver 46.4 s, New York 51.5 s, the whole planet by the end.
//   The dinosaur asteroid: ~100 million megatons = 1e14 tons = 70 billion drops (48.8 s).
//   A normal 10-minute shower over Seattle (5 mm of rain on 217 km^2 = 1.1 billion kg) is 32 trillion drops
//   = 4.6e16 tons = 455 dinosaur asteroids. That's the finish line (60.8 s).
// Places: Pike Street looking west at the Public Market sign and Elliott Bay (to 11.2 s: a drop lands on the
// Market), a drone over downtown as it's blown apart (to 22.6 s), a rooftop in Portland 145 miles south as the
// northern sky burns and the blast comes (to 35.2 s), then Earth from space (white, loop).
import { smooth, clamp, rng } from './util.js';
import { seattleH } from './terrain.js';

export const STORY_START = 0;
export const PER10 = 4.5;                            // seconds for 10x more drops
export const dropsAt = (v) => Math.pow(10, v / PER10);
export const vOfDrops = (n) => PER10 * Math.log10(n);
export const TONS_PER_DROP = 1440;
export const tonsAt = (v) => TONS_PER_DROP * dropsAt(v);
export const DINO_TONS = 1e14;
export const SHOWER = 3.2e13;
export const V_END = vOfDrops(SHOWER);               // 60.8: a whole shower has fallen
export const T_SWITCH = V_END + 0.75;
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const SOUND = 343;                           // m/s
export const FALL = 0.7;                             // s: a drop's glowing fall out of the cloud before it lands
// how far the combined blast has flattened everything (m): 600 m for one drop, growing as the cube root of the energy
export const blastR = (v) => 600 * Math.cbrt(dropsAt(v));
export const vOfBlastR = (r) => vOfDrops(Math.pow(r / 600, 3));

export const V_FIRST = 0.35;                         // drop 1 lands (it is already falling on frame 0)
export const V_NEAR = 10.85;                         // a drop lands on the Market, 100 m from you: white
export const V_DRONE = 11.2;                         // cut: the drone over downtown
export const V_UP = 24.0;                            // cut: Earth from space (the first look)
// the other cities: you're there as the blast arrives (each shot ends in white as it hits), with space in between.
// cam: where you are; fwd: the way you look (toward Seattle, where the front comes from)
export const CITIES = [
  { name: 'PORTLAND', km: 233, cam: { x: -2350, y: 63.7, z: 420 }, fwd: { x: 1, z: 0 }, kind: 'roof' },
  { name: 'SAN FRANCISCO', km: 1090, cam: { x: -1270, y: 1.7, z: 660 }, fwd: { x: 1, z: 0.12 }, kind: 'street' },
  { name: 'NEW YORK', km: 3870, cam: { x: -350, y: 430, z: 1450 }, fwd: { x: 0.15, z: -1 }, kind: 'air' },
].map((c) => {
  const arr = vOfBlastR(c.km * 1000), L = Math.hypot(c.fwd.x, c.fwd.z);
  return { ...c, fwd: { x: c.fwd.x / L, z: c.fwd.z / L }, arr, v0: arr - 4.6, v1: arr + 0.2 };
});
export const cityAt = (v) => CITIES.find((c) => v >= c.v0 && v < c.v1) || null;
export const V_SPACE = V_UP;
export const V_DINO = vOfDrops(DINO_TONS / TONS_PER_DROP);   // 48.8
export const place = (v) => (v < V_DRONE ? 'street' : v < V_UP ? 'drone' : cityAt(v) ? 'city' : 'space');
// in a city shot a building goes when the front reaches it: the front comes from straight ahead at 1.2 km/s (sped up)
export const vFrontAt = (c, x, z) => c.arr - ((x - c.cam.x) * c.fwd.x + (z - c.cam.z) * c.fwd.z) / 1200;

// ---- the drops we follow one by one (the first 3,000), in metres round the Market: x north, z east, y up;
// you stand at (0, 2, 10) looking west down Pike St at the Market and Elliott Bay ----
export const CAM0 = { x: 0, y: 2.0, z: 10 };
// the ground (and whether it's water) where a drop lands
const inCity = (x, z) => Math.abs(x) < 1500 && z > -1300 && z < 1700;
const cityWater = (x, z) => (z < -110 && x < 300) || (x > 0 && z < -110 - 0.55 * x);
export function landAt(x, z) {
  if (inCity(x, z)) return cityWater(x, z) ? { y: 0, water: true } : { y: 0, water: false };
  const h = seattleH(x, z);
  return h < 0 ? { y: 0, water: true } : { y: h, water: false };
}
export const DOWNTOWN = { x: -300, z: 500 };
export const DRONE_XZ = { x: -2300, z: 1750 };          // where the drone hovers (no drops land on it)
export const DROPS = [];
{
  const R = rng(777);
  const K = 3000;
  for (let k = 1; k <= K; k++) {
    const v = k === 1 ? V_FIRST : vOfDrops(k) + 0.1;
    let x, z;
    if (k === 1) { x = 120; z = -1250; }                        // Elliott Bay, straight ahead, 1.26 km away
    else if (Math.abs(v - V_NEAR) < 0.012 && !DROPS.some((d) => d.near)) { x = 2; z = -92; }   // the Market
    else if (v < V_DRONE) {
      // on the street they land where you can see them: out over the bay and the far shore past the Market
      // (all of them: every boom you hear on the street is one you see)
      const dd = 1100 + Math.pow(R(), 0.8) * 5200; x = (R() - 0.5) * 0.5 * dd; z = -dd;
    } else {
      // later, all over the city and round it, out to 14 km (a few more over downtown)
      const r = (R() < 0.12 ? 3000 : 14000) * Math.sqrt(R()), a = R() * Math.PI * 2;
      x = DOWNTOWN.x + r * Math.cos(a); z = DOWNTOWN.z + r * Math.sin(a);
      if (Math.hypot(x - DRONE_XZ.x, z - DRONE_XZ.z) < 1300) { k--; continue; }   // (none right on top of the drone)
    }
    const g = landAt(x, z);
    const d = { k, v, x, y: g.y, z, water: g.water, seed: R(), near: k > 1 && x === 2 && z === -92 };
    // on the street the drops burst a little above the ground (the air finishes them): over the Market's roof, in view
    d.hb = v < V_DRONE && !d.near ? 160 + 120 * d.seed : 0;
    d.dist = Math.hypot(x - CAM0.x, z - CAM0.z);
    DROPS.push(d);
  }
}
export const LAST_DROP = DROPS[DROPS.length - 1];
export const NEAR = DROPS.find((d) => d.near);
// after the 3,000th: a steady random hail, generated per 1/30 s slot (the picture and the soundtrack use the same)
export function statDrops(j) {
  const t0 = j / 30, out = [];
  if (t0 < LAST_DROP.v - 1 / 30) return out;
  const R = rng(j * 7919 + 13), per = Math.min(14, 3 + Math.max(0, t0 - LAST_DROP.v) * 1.2);
  for (let q = 0; q < per; q++) {
    const t = (j + R()) / 30, r = (R() < 0.15 ? 3000 : 14000) * Math.sqrt(R()), a = R() * Math.PI * 2, seed = R();
    if (t < LAST_DROP.v) continue;
    const x = DOWNTOWN.x + r * Math.cos(a), z = DOWNTOWN.z + r * Math.sin(a);
    if (Math.hypot(x - DRONE_XZ.x, z - DRONE_XZ.z) < 1300) continue;
    const g = landAt(x, z);
    out.push({ v: t, x, y: g.y, z, water: g.water, seed, hb: 0 });
  }
  return out;
}
// the street: the first blast reaches you (windows go), the grid fails
export const V_GLASS = V_FIRST + DROPS[0].dist / SOUND;      // 4.0 s
export const V_POWER = 7.0;
// how hard a blast hits at d metres (rough overpressure in psi for 1.44 kt on the ground)
export const psiAt = (d) => 5 * Math.pow(480 / Math.max(d, 50), 1.9);

// a building at (x, z) is blown apart by the first drop within 480 m of it (5+ psi): when, from where, how hard
export function wreckOf(x, z) {
  let best = null;
  for (const d of DROPS) {
    if (best && d.v > best.v) break;
    if (d.v < V_DRONE - 0.5 && !d.near) continue;     // (the street-phase drops land out west, away from the towers)
    const r = Math.hypot(x - d.x, z - d.z);
    if (r < 480) { const v = d.v + r / 900; if (!best || v < best.v) best = { v, ox: d.x, oz: d.z, r }; }
  }
  if (!best) {   // past the drops we follow one by one: by then every block has been hit
    const h = Math.abs((Math.sin(x * 0.0123 + z * 0.0371) * 43758.5) % 1);
    const a = h * 40;
    best = { v: LAST_DROP.v + h * 3, ox: x + 250 * Math.cos(a), oz: z + 250 * Math.sin(a), r: 250 };
  }
  return best;
}

// ---- the beats: one gold phrase pops (no number: the counter has the numbers) ----
export const BEATS = [
  { v: vOfDrops(10) + 0.1, say: 'THAT’S HIROSHIMA' },
  { v: V_DRONE + 0.5, say: 'SEATTLE IS BURNING' },
  { v: vOfDrops(50e6 / TONS_PER_DROP), say: 'THE BIGGEST BOMB EVER' },
  { v: V_DINO, say: 'THE DINOSAUR KILLER' },
];
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (x.say && v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}

// ---- captions (video time) ----
export const CAPTIONS = [
  [4.2, 6.6, 'Each drop: 1,440 tons of TNT.'],
  [6.8, 9.1, 'And every few seconds, 10 times more.'],
  [14.0, 16.6, 'Drop 1,000. Downtown is coming apart.'],
  [17.0, 19.6, 'Every drop flattens a city block.'],
  [24.6, 27.4, 'From space, the storm is glowing.'],
  [30.6, 33.0, 'You’re in Portland, 145 miles away.'],
  [35.6, 38.4, 'Everything within 200 miles is gone.'],
  [39.6, 42.0, 'You’re in San Francisco, 680 miles away.'],
  [44.5, 46.6, 'Los Angeles. Denver.'],
  [47.1, 48.6, 'New York, 2,400 miles away.'],
  [52.6, 55.2, 'The fire wraps around the planet.'],
  [55.6, 58.8, 'One normal rain shower: 32 trillion drops.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: energy so far (label: how many drops) ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
const WORDS = [[1e12, 'TRILLION'], [1e9, 'BILLION'], [1e6, 'MILLION']];
export function fmtDrops(n) {
  n = Math.max(1, Math.floor(n));
  if (n === 1) return '1 DROP';
  for (const [d, w] of WORDS) if (n >= d) { const x = n / d; return `${x < 10 ? x.toFixed(1) : fmtInt(x)} ${w} DROPS`; }
  return `${fmtInt(n)} DROPS`;
}
export function fmtTons(t) {
  if (t < 1e6) return `${fmtInt(t)} tons`;
  for (const [d, w] of [[1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']]) {
    if (t >= d) { const x = t / d; return `${x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : fmtInt(x)} ${w} tons`; }
  }
  return `${fmtInt(t)} tons`;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: '',
    labelFn: (v) => `ANTIMATTER RAIN · ${fmtDrops(dropsAt(Math.max(v, 0)))}`,
    fmt: (t) => (t >= DINO_TONS ? `${(t / DINO_TONS) < 10 ? (t / DINO_TONS).toFixed(2) : fmtInt(t / DINO_TONS)}×` : fmtTons(t)),
    // (whole drops while they can be counted, so the tons always match the drops shown)
    value: (v) => { const n = Math.max(1, dropsAt(v)); return TONS_PER_DROP * (n < 1000 ? Math.floor(n) : n); },
    unit: (v) => (tonsAt(v) >= DINO_TONS ? 'THE DINOSAUR ASTEROID' : 'OF TNT'),
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.place = place(v);
  s.drops = dropsAt(v);
  const c = cityAt(v);
  s.city = c;
  s.grid = c ? 1 - smooth(c.arr - 2.0, c.arr - 1.0, v) * 0.7 : 1 - smooth(V_POWER, V_POWER + 1.2, v);
  s.title = 1 - smooth(3.0, 3.8, v);
  s.flash = smooth(V_END - 0.2, V_END + 0.5, v);
  s.flashColor = '#fff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}

// (for the street files copied from rain-1000-years: the sign dies with the grid, the cars never float)
export const SIGN_TOP = 13.2;
export const V_SIGN = V_POWER + 0.2;
export const V_FLOAT = 1e9, V_HERO_SINK = 1e9;
