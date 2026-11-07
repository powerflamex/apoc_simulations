// "What if a grain of sand hit Earth at the speed of light?": the story as functions of VIDEO time v (seconds;
// STORY_START = 0). A crowded beach seen from the deck of a lifeguard tower. Fifteen grains land on the same spot of sand,
// one every 3 s, each faster than the last. You never move; only your eyes do (a zoom, a look back at the city).
// The numbers (a real coarse grain: 1 milligram, about 0.9 mm across; c = 299,792,458 m/s):
//   - energy = (gamma - 1) m c^2, with m c^2 = 8.99e10 J = 21.5 tons of TNT; below ~1% of c that is 1/2 m v^2;
//   - 150,000 mph (67 km/s, the speed of the fastest shooting stars): 2.2 kJ, a rifle bullet;
//     3 million mph: 0.9 MJ = 215 g of TNT, a hand grenade; 30 million mph (4.5% of c): 90 MJ = 21 kg of TNT;
//     100 million mph (15% of c): 1.0 GJ = 243 kg of TNT, a car bomb; 600 million mph (89%): 111 GJ = 27 tons of TNT;
//   - past that the speed can't climb, only add nines. "n nines" means 1 - v/c = 10^-n, so gamma = 10^(n/2) / sqrt(2) and
//     every nine is 3.16x the energy: 3 nines 460 tons; 6 nines 15.2 kt = 1.01 Hiroshimas (15 kt); 13 nines 48 Mt, the
//     Tsar Bomba's 50 Mt, the biggest bomb ever built; 17 nines 4.8 Gt, more than all the nuclear weapons on Earth (about
//     2-3 Gt); 24 nines is past the fastest particle ever measured (the 1991 "Oh-My-God" proton: 23.2 nines); 26 nines
//     6.4e23 J = 150 million Mt = 10 billion Hiroshimas, the dinosaur asteroid (estimates: 3e23 to 1.3e24 J).
// What is drawn vs what is real (also in CAPTIONS.md): every number on screen comes from the formulas here. The picture is
// drawn for the phone: the grain on the finger is about 5x life size; real air would burn up the slow grains and burst the fast
// ones in the sky; and from about 0:18 the real blasts would reach you, so they are drawn far smaller than life.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const C = 299792458, MG = 1e-6, MPH = 0.44704, HIROSHIMA = 15 * 4.184e12, TON = 4.184e9;
export const C_MPH = C / MPH;                                     // 670,616,629
const MC2 = MG * C * C;

// the fifteen grains: rc the crater after it (m), rf the fireball's drawn radius, reach how far its blast knocks things over
const G = (t, sp, rc, rf, reach, up) => ({ t, ...sp, rc, rf, reach, up });
export const HITS = [
  G(3, { mph: 150e3 }, 0.32, 0.8, 4, 0),
  G(6, { mph: 3e6 }, 1.5, 3.2, 16, 0),
  G(9, { mph: 30e6 }, 3.6, 8, 42, 0),
  G(12, { mph: 100e6 }, 7.5, 15, 92, 0),
  G(15, { mph: 600e6 }, 14, 27, 150, 0),
  G(18, { nines: 3 }, 24, 42, 172, 0),
  G(21, { nines: 6 }, 40, 62, 196, 330),
  G(24, { nines: 8 }, 56, 78, 520, 520),
  G(27, { nines: 10 }, 72, 92, 800, 640),
  G(30, { nines: 13 }, 92, 105, 1200, 740),
  G(33, { nines: 15 }, 112, 115, 2000, 800),
  G(36, { nines: 17 }, 132, 125, 3000, 840),
  G(39, { nines: 20 }, 150, 135, 5000, 870),
  G(42, { nines: 24 }, 168, 145, 8000, 900),
  G(45, { nines: 26 }, 300, 150, 20000, 900),
];
export const V_LAST = 45;
HITS.forEach((h, i) => { h.k = i + 1; h.x = h.nines ?? -Math.log10(1 - h.mph / C_MPH); });

// the blast front runs out at SHOCK m/s; what it reaches goes down. When does whatever stands d metres out first get hit?
export const SHOCK = 260;
export function blastAt(d) { for (const h of HITS) if (h.reach >= d) return { t: h.t + d / SHOCK, h }; return { t: 1e9, h: null }; }

export const V_PCT = 16.2;          // the line under the counter changes from mph to the energy, once mph has nowhere left to go
export const V_SEA = 18.1;          // the sea starts pulling back
export const V_TURN = 23.2, V_BACK = 28.05;   // you turn round to look at the city behind you, and back
export const V_LIFT = 32.4;         // the horizon starts to rise
export const V_WHITE = 38.6;        // the sky turns white
export const V_ROLL = 41.2;         // the ground starts to roll
export const ROLL_A = 10;           // how high the waves in the ground stand (m), at their tallest
export const V_REACH = 46.65;       // the last hit reaches you
export const T_SWITCH = 47.15;      // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;                    // 48.05 s

// ---- speed: x = -log10(1 - v/c), which is the number of nines (and tiny down at everyday speeds). Between hits it races
// on toward the next grain's speed; it holds for a moment on each hit, so you can read the number that landed ----
const HOLD = 0.35;
const logMph = (x) => Math.log(C_MPH * (1 - Math.pow(10, -x)));
export function speedX(v) {
  if (v <= HITS[0].t) {                                          // from frame 0: 20,000 mph racing up to the first grain
    const a = Math.log(20e3), b = Math.log(HITS[0].mph);
    const m = Math.exp(lerp(a, b, v / HITS[0].t));
    return -Math.log10(1 - Math.max(m, 1) / C_MPH);
  }
  if (v >= HITS[HITS.length - 1].t) return HITS[HITS.length - 1].x;
  let i = 0;
  while (v >= HITS[i + 1].t) i++;
  const a = HITS[i], b = HITS[i + 1], u = clamp((v - a.t - HOLD) / (b.t - a.t - HOLD));
  if (a.mph && b.mph) return -Math.log10(1 - Math.exp(lerp(logMph(a.x), logMph(b.x), u)) / C_MPH);
  return lerp(a.x, b.x, u);
}
export const mphAt = (v) => C_MPH * (1 - Math.pow(10, -speedX(v)));
// the energy of a grain at x (in the slow range the exact sum loses its digits: use 1/2 m v^2)
export function energyAt(x) {
  const e = Math.pow(10, -x), beta = 1 - e;
  if (beta < 0.01) return 0.5 * MG * (beta * C) ** 2;
  return (1 / Math.sqrt(e * (2 - e)) - 1) * MC2;
}
const round2 = (n) => { const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; };
export function fmtEnergy(x) {
  const E = energyAt(x), H = E / HIROSHIMA;
  if (H < 0.95) return `${round2(E / TON).toLocaleString('en-US')} TONS OF TNT`;
  if (H < 1.5) return '1 HIROSHIMA BOMB';
  if (H < 1e6) return `${round2(H).toLocaleString('en-US')} HIROSHIMA BOMBS`;
  if (H < 1e9) return `${Math.round(H / 1e6).toLocaleString('en-US')} MILLION HIROSHIMAS`;
  return `${Math.round(H / 1e9)} BILLION HIROSHIMAS`;
}
// % of light speed. Three digits while it's small, then 99.99 and a digit spinning up to the next nine, so it's always moving;
// always cut off, never rounded up (it must never read 100)
export function fmtPct(x) {
  const n = Math.floor(x + 1e-9), f = x - n, p = 100 * (1 - Math.pow(10, -x));
  if (n < 2) {
    if (p < 1) return `${p.toPrecision(3)}%`;
    return `${(Math.floor(p * (p < 10 ? 100 : 10)) / (p < 10 ? 100 : 10)).toFixed(p < 10 ? 2 : 1)}%`;
  }
  let s = `99.${'9'.repeat(n - 2)}`;
  { const d = Math.min(9, Math.floor(10 * (1 - Math.pow(10, -f)))); if (d > 0) s += d; }
  return s.replace(/\.$/, '') + '%';
}

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [3.1, 'A SPARK, LIKE A RIFLE SHOT'],
  [6.1, 'A CRATER, LIKE A GRENADE'],
  [9.1, 'THE UMBRELLAS FLY'],
  [12.1, 'IT KNOCKS PEOPLE DOWN'],
  [15.1, 'THE PIER GOES'],
  [18.1, 'THE SEA PULLS BACK'],
  [21.1, 'A MUSHROOM CLOUD OVER THE BEACH'],
  [24.1, 'THE CITY BEHIND YOU LIGHTS UP'],
  [27.1, 'EVERY WINDOW BLOWS OUT'],
  [30.1, 'BIGGER THAN ANY BOMB EVER BUILT'],
  [33.1, 'THE HORIZON LIFTS'],
  [36.1, 'MORE THAN EVERY NUKE ON EARTH'],
  [39.1, 'THE SKY TURNS WHITE'],
  [42.1, 'THE GROUND ROLLS TOWARD YOU'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together; nothing while the title is up) ----
const poundsAt = (h) => Math.round(energyAt(h.x) / 4.184e6 * 2.20462 / 10) * 10;   // the hit, in pounds of TNT
export const CAPTIONS = [
  [4.85, 5.95, 'One grain. One milligram.'],
  [7.85, 8.95, 'Same spot. Faster.'],
  [10.85, 11.95, `That one was ${Math.round(energyAt(HITS[2].x) / 4.184e6 * 2.20462)} pounds of TNT.`],
  [13.85, 14.95, `That one was ${poundsAt(HITS[3])} pounds of TNT.`],
  [16.85, 17.95, 'Nothing with mass can reach 100%.'],
  [19.85, 20.95, 'It can only add more 9s.'],
  [22.85, 23.95, 'From one grain of sand.'],
  [25.85, 26.95, 'You can’t see the next one coming.'],
  [28.85, 29.95, 'The speed barely changes. The hit does.'],
  [31.85, 32.95, 'The crater is coming toward you.'],
  [34.85, 35.95, 'The sea has gone.'],
  [37.85, 38.95, 'It’s still one grain of sand.'],
  [40.85, 41.95, 'The last grain hits like the dinosaur asteroid.'],
  [43.85, 44.9, 'Nothing ever measured went this fast.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.2);
      const fadeOut = clamp((b - v) / 0.2);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: which grain, what % of light speed. Two finish lines from frame 0: 100%, and grain 15 of 15 ----
export const lastHit = (v) => { let i = -1; while (i + 1 < HITS.length && v >= HITS[i + 1].t) i++; return i; };
const grainLabel = (v, what) => `GRAIN ${Math.min(lastHit(v - HOLD) + 2, HITS.length)} OF ${HITS.length}  ·  ${what}`;   // (it moves on to the next grain once this one's number has been read)
export const COUNTERS = [
  {
    from: -3, to: V_LAST + 1.1, label: 'GRAIN 1 OF 15  ·  OF LIGHT SPEED',
    labelFn: (v) => grainLabel(v, 'OF LIGHT SPEED'),
    fmt: (x) => fmtPct(x),
    value: (v) => speedX(v),
    unit: (v) => (v < V_PCT ? `${(Math.round(mphAt(v) / 10) * 10).toLocaleString('en-US')} MPH` : fmtEnergy(speedX(v))),
    fit: true,
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.title = 1 - smooth(2.75, 3.1, v);
  s.i = lastHit(v);                                       // the last grain to land (-1: none yet)
  s.hit = s.i >= 0 ? HITS[s.i] : null;
  s.age = s.hit ? v - s.hit.t : 99;
  // how much of each hit is happening now: the jolt (the bigger ones take longer to reach you: see blast.js)
  s.kick = 0;
  for (const h of HITS) {
    const dt = v - h.t - 0.02;
    if (dt > -0.05 && dt < 1.4) s.kick = Math.max(s.kick, (h.k < 3 ? 0.1 : Math.min(1, 0.22 + h.k * 0.11)) * smooth(-0.05, 0.03, dt) * Math.exp(-Math.max(dt, 0) / 0.32));
  }
  // the crater grows out in the half second after each hit and stays
  s.Rc = 0;
  for (const h of HITS) {
    const dur = h.k === HITS.length ? V_REACH - V_LAST : 0.45;
    if (v >= h.t) s.Rc = lerp(s.Rc, h.rc, 1 - Math.pow(1 - clamp((v - h.t) / dur), 2.5));
  }
  s.seaY = -6.5 * smooth(V_SEA, V_SEA + 2.6, v) - 5.5 * smooth(24, 34, v);    // the sea drains from the shore
  s.lift = 1500 * smooth(V_LIFT, 37.6, v);                                      // how high the wall on the horizon has risen (m)
  s.pall = smooth(21.3, 31, v);                                               // the dust over the sky
  s.white = smooth(V_WHITE, V_WHITE + 2.6, v);                                // the sky going white
  s.roll = smooth(V_ROLL, 45, v);                                             // the waves in the ground
  s.crack = smooth(V_ROLL - 1.2, V_LAST + 0.6, v);                            // the cracks running out of the crater, at you
  s.fireK = smooth(18, 25, v);
  s.burn = smooth(20.9, 29, v);                                               // day turning to fire-lit dust
  // how far the char has run out over the sand: the front of the biggest blast so far
  s.front = -1;
  for (const h of HITS) if (h.k >= 4 && v > h.t) s.front = Math.max(s.front, Math.min(h.reach, SHOCK * (v - h.t)));
  // the last hit: the flash, its light growing until it swallows the frame
  s.flash = smooth(V_REACH - 0.7, T_SWITCH - 0.25, v);
  s.flashColor = '#fff8ee';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
