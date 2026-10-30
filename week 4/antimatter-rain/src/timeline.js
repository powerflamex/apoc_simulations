// "What if it rained antimatter?" — the story as functions of VIDEO time v (seconds; the video starts at v = 0).
// The rule: a storm over Seattle starts raining antimatter, and the number of drops grows 10x every 5 seconds.
//   One big raindrop (4 mm across) is 33.5 mg. Antimatter and matter turn into pure energy: E = 2 m c^2
//   = 2 x 33.5e-6 kg x (3e8 m/s)^2 = 6.0e12 J = 1,440 tons of TNT. The drops burst in the air as they fall
//   (they hit air before anything else), 300-900 m up, like small nuclear airbursts.
//   10 drops = 14,400 tons: Hiroshima (15,000). 35,000 drops = 50 million tons: the Tsar Bomba, the biggest bomb ever.
//   The dinosaur asteroid: ~100 million megatons = 1e14 tons = 70 billion drops.
//   A normal 10-minute shower over Seattle (5 mm of rain on 217 km^2 = 1.1 billion kg) is 32 trillion drops
//   = 4.6e16 tons = 460 dinosaur asteroids. That's the finish line (v = 67.5 s).
// Places: Pike Street looking west at the Public Market sign (to 12.4 s, the drop that bursts right over you),
// a drone rising over Seattle in flames (to 30 s), Earth from space (to the end: white flash, loop).
import { smooth, clamp, lerp, rng } from './util.js';

export const STORY_START = 0;
export const PER10 = 5;                              // seconds for 10x more drops
export const dropsAt = (v) => Math.pow(10, v / PER10);
export const vOfDrops = (n) => PER10 * Math.log10(n);
export const TONS_PER_DROP = 1440;
export const tonsAt = (v) => TONS_PER_DROP * dropsAt(v);
export const DINO_TONS = 1e14;
export const SHOWER = 3.2e13;
export const V_END = vOfDrops(SHOWER);               // 67.5: a whole shower has fallen
export const T_SWITCH = V_END + 0.75;
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const SOUND = 343;                           // m/s

export const V_NEAR = 11.75;                         // the drop that bursts right over the street
export const V_DRONE = 12.4;                         // cut: high over the burning city
export const V_SPACE = 30.0;                         // cut: Earth from space
export const V_DINO = vOfDrops(DINO_TONS / TONS_PER_DROP);   // 54.3
export const place = (v) => (v < V_DRONE ? 'street' : v < V_SPACE ? 'drone' : 'space');

// ---- the bursts we draw one by one (the first ~3,000 drops), in metres around the Market:
// x north, z east, y up; you stand at (0, 2, 10) looking west down Pike St ----
export const CAM0 = { x: 0, y: 2.0, z: 10 };
export const BURSTS = [];
{
  const R = rng(777);
  // the first few, placed where you can see them over the end of the street (west, over the bay and the market)
  const HAND = [
    [150, 420, -1150],      // 1: over Elliott Bay, 1.24 km away: its shock breaks every window at 3.6 s
    [2600, 650, -3900],     // 2
    [-1800, 520, -2600],    // 3
    [4200, 800, -5200],     // 4
    [-500, 700, -6400],     // 5
    [900, 560, -2300],      // 6
    [-3800, 900, -4100],    // 7
    [5800, 720, -3000],     // 8
    [-2400, 610, -1500],    // 9
    [300, 850, -8200],      // 10
  ];
  const K = 3200;
  for (let k = 1; k <= K; k++) {
    const v = vOfDrops(k) - (k === 1 ? 0.25 : 0);   // (drop 1 burst just before the first frame: frame 0 shows its fireball)
    let x, y, z;
    if (k <= HAND.length) [x, y, z] = HAND[k - 1];
    else if (Math.abs(v - V_NEAR) < 0.02 && k > 1 && !BURSTS.some((b) => b.near)) { x = -40; y = 210; z = -430; }
    else {
      // anywhere over the city and the Sound (12 km round), but none closer than 1.1 km to you before the near one
      for (;;) {
        const r = 12000 * Math.sqrt(R()), a = R() * Math.PI * 2;
        x = r * Math.cos(a); z = r * Math.sin(a);
        if (v < V_NEAR + 0.3 && Math.hypot(x - CAM0.x, z - CAM0.z) < 1100) continue;
        // in the street, keep most of them out west where the street opens (you can't see the others, only their light)
        if (v < V_NEAR && z > -600 && R() < 0.6) continue;
        break;
      }
      y = 300 + R() * 600;
    }
    const b = { k, v, x, y, z, seed: R(), near: Math.abs(v - V_NEAR) < 0.02 && x === -40 };
    b.d = Math.hypot(x - CAM0.x, y - CAM0.y, z - CAM0.z);
    b.vHit = v + b.d / SOUND;                         // when its blast reaches the street
    BURSTS.push(b);
  }
}
export const NEAR = BURSTS.find((b) => b.near);
// the fireball: a flash that peaks at once, then a glowing ball that grows to ~76 m and cools as it rises
export function fireball(b, v) {
  const t = v - b.v;
  if (t < 0) return null;
  const flash = Math.exp(-t / 0.07) + 0.35 * Math.exp(-t / 0.5);
  const r = 76 * Math.min(1, Math.pow(t / 0.6, 0.4));
  const heat = Math.exp(-t / 1.3);
  const rise = 40 * t;
  return { t, flash, r, heat, y: b.y + rise };
}
// blast reaching a point d metres away: how hard it hits (rough overpressure in psi for 1.44 kt, airburst)
export const psiAt = (d) => 5 * Math.pow(600 / Math.max(d, 50), 1.9);

// the street: when the first blast arrives (windows go), the grid fails, people run
export const V_GLASS = BURSTS[0].vHit;               // 3.6 s
export const V_POWER = 7.2;
// a building at (x, z) is flattened by the first burst within 650 m of it (5+ psi)
export function vDestroyed(x, z) {
  let best = 1e9;
  for (const b of BURSTS) {
    if (b.v > best) break;
    const d = Math.hypot(x - b.x, z - b.z, b.y);
    if (d < 650) best = Math.min(best, b.v + d / SOUND);
  }
  if (best > 1e8) {   // past the bursts we track one by one: by then every square km has been hit
    const h = (Math.sin(x * 0.0123 + z * 0.0371) * 43758.5) % 1;
    best = vOfDrops(3200) + Math.abs(h) * 2.5;
  }
  return best;
}

// ---- the beats: one gold phrase pops (no number: the counter has the numbers) ----
export const BEATS = [
  { v: V_GLASS, say: '' },                                  // (title still up: the blast only jolts)
  { v: vOfDrops(10), say: 'THAT’S HIROSHIMA' },
  { v: vOfDrops(100), say: '' },
  { v: V_DRONE + 0.5, say: 'SEATTLE IS BURNING' },
  { v: vOfDrops(1e4), say: '' },
  { v: vOfDrops(50e6 / TONS_PER_DROP), say: 'THE BIGGEST BOMB EVER' },
  { v: vOfDrops(1e6), say: '' },
  { v: vOfDrops(1e8), say: '' },
  { v: V_DINO, say: 'THE DINOSAUR KILLER' },
  { v: vOfDrops(1e12), say: '' },
  { v: V_END, say: '' },
];
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (x.say && v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}

// ---- captions (video time) ----
export const CAPTIONS = [
  [3.9, 6.4, 'One drop, under a mile from you. Every window breaks.'],
  [7.2, 9.8, 'Each drop is 1,440 tons of TNT.'],
  [9.9, 11.6, 'Every 5 seconds, 10 times more.'],
  [15.0, 17.6, 'Drop 1,000. The city is being flattened.'],
  [19.0, 21.4, 'The fires reach across Puget Sound.'],
  [25.6, 28.4, 'The blasts merge into one firestorm.'],
  [31.2, 33.8, 'From space, the storm is glowing.'],
  [41.0, 43.8, 'Everything within 200 miles is flattened.'],
  [46.5, 49.2, 'Portland. Vancouver. Boise. Gone.'],
  [51.6, 54.1, 'San Francisco. Los Angeles. Denver.'],
  [57.0, 60.0, 'And it’s still only one storm.'],
  [61.5, 65.0, 'One normal rain shower: 32 trillion drops.'],
];
// how far the combined blast has flattened everything (m): 600 m for one drop, growing as the cube root of the energy
// (Portland 233 km at ~38 s, Boise 650 km at ~46 s, Los Angeles 1,540 km at ~51 s; the whole planet by the end)
export const blastR = (v) => 600 * Math.cbrt(dropsAt(v));
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
    labelFn: (v) => `ANTIMATTER RAIN · ${fmtDrops(dropsAt(v))}`,
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
  s.grid = 1 - smooth(V_POWER, V_POWER + 1.2, v);
  s.title = 1 - smooth(3.0, 3.8, v);
  // the end: white
  s.flash = smooth(V_END - 0.2, V_END + 0.5, v);
  s.flashColor = '#fff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}

// (for the street files copied from rain-1000-years: the sign dies with the grid, the cars never float)
export const SIGN_TOP = 13.2;
export const V_SIGN = V_POWER + 0.2;
export const V_FLOAT = 1e9, V_HERO_SINK = 1e9;
