// "What if the Sun exploded?" — the story as functions of VIDEO time v (seconds).
// You are on the beach promenade in Rio (Copacabana) on an early morning, the Sun low over the far end of the beach.
// The Sun exploded 8 min 18 s before the first frame; its light takes 8 min 20 s to get here, so nobody knows yet.
// The physics (a pretend explosion: the Sun is too small to really go supernova):
//   - the Sun's surface blows outward at 10,000 km/s as a fireball ~10,000 K hot (the Sun's surface is 5,800 K)
//   - its brightness here = 9 × (fireball radius / Sun's radius)²: 9× the moment the light arrives, then growing
//   - what we see at time T left the fireball's near side earlier (light time), so its size on the sky follows
//     asin(R/D); it reaches Earth (D = 149.6 million km) after 4 h 08 min 10 s
//   - in the sunlight, a dark surface heats until it glows away as much as it absorbs: σT⁴ = flux
//     (9×: ~400°C, ×50: ~750°C, ×1,000: ~2,000°C)
//   - the sea absorbs the flux and boils away; the shelf off Rio is shallow, so the shore runs out to the horizon
//   - the fireball swallows Mercury (58 million km out) at 1 h 36 min, Venus (108 million km) at 2 h 59 min
// The video runs real time for the first seconds (the light arrives at 1.7 s), then speeds up (time-lapse) to the
// blast at 63 s, a white-out, and the loop.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;             // everything here runs on the video clock
export const T_SWITCH = 63.7;             // full white; the loop point sits in it
export const LOOP = 0.9;                  // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- the physics ----
export const C_KMS = 299792.458;
export const D_KM = 149.6e6;              // Earth - Sun
export const R0_KM = 696000;              // the Sun's radius
export const U_KMS = 10000;               // the fireball's speed
export const T_LIGHT = (D_KM - R0_KM) / C_KMS;          // 496.7 s: when the first light gets here (from the surface)
export const T_FLASH = 500;               // 8:20 (we round to the famous number: the flash lands on 8:20.0)
const TE_OFF = T_FLASH - T_LIGHT;         // (so the light arrives exactly then)
// the fireball as we see it at story time T: emitted when its near side was R from the centre
export const teOf = (T) => Math.max(0, (T - TE_OFF - T_LIGHT) / (1 - U_KMS / C_KMS));
export const radiusKm = (T) => R0_KM + U_KMS * teOf(T);
export const T_BLAST = (D_KM - R0_KM) / U_KMS + TE_OFF;  // 14,893 s = 4 h 08 min 13 s: it reaches Earth
export const angR = (T) => Math.asin(Math.min(1, radiusKm(T) / D_KM));          // its angular radius (rad)
export const SUN_ANG = Math.asin(R0_KM / D_KM);                                    // 0.267°
// brightness relative to the normal Sun (0 before the light arrives: 1×)
export const bright = (T) => (T < T_FLASH ? 1 : 9 * Math.pow(radiusKm(T) / R0_KM, 2));
export const SOLAR = 1361;                // W/m², the normal Sun
// the flux a surface facing the Sun has soaked up to by now: things lag ~40 s behind (heating up)
export const fluxLag = (T) => SOLAR * bright(T - 40 * (1 - smooth(3000, 9000, T)));
// equilibrium temperature of a dark surface square to the Sun (K): σT⁴ = flux (plus a 300 K floor)
export const SIGMA = 5.67e-8;
export const tEq = (flux) => Math.pow(flux / SIGMA + Math.pow(300, 4), 0.25);
export const toF = (k) => (k - 273.15) * 9 / 5 + 32;
// the sea: how far it has boiled away (m) by story time T (flux × 0.7 for the Sun's height, all of it into
// heating and boiling sea water, 2.6 MJ/kg; ∫(R/R0)² dt in closed form)
export function seaDrop(T) {
  if (T <= T_FLASH + 60) return 0;
  const a = U_KMS / R0_KM / (1 - U_KMS / C_KMS);    // (R/R0) = 1 + a·(T - T_FLASH)
  const x = (T - T_FLASH - 60);
  const integral = (Math.pow(1 + a * x, 3) - 1) / (3 * a);       // ∫ (R/R0)² dt (with a 60 s lag)
  return 0.7 * 9 * SOLAR * integral / 2.6e6 / 1025;
}
// how far out the shore has moved (m) when the sea has dropped by h: the beach falls away steeply (1 in 15) for the
// first ~5 m, then the bay floor slopes gently out past the Cagarras islands (5 km out, ~25 m deep) to the shelf
export const SHELF = [[0, 0], [80, 5.3], [1000, 12.7], [5000, 24.7], [20000, 40], [100000, 120]];
export function depthAt(dOut) {                 // sea floor depth (m) at distance dOut (m) out from today's shore
  if (dOut <= 0) return 0;
  for (let i = 0; i < SHELF.length - 1; i++) {
    const [a, ha] = SHELF[i], [b, hb] = SHELF[i + 1];
    if (dOut <= b) return lerp(ha, hb, (dOut - a) / (b - a));
  }
  return 120 + (dOut - 100000) * 0.001;
}
export function shoreOut(h) {
  if (h <= 0) return 0;
  for (let i = 0; i < SHELF.length - 1; i++) {
    const [a, ha] = SHELF[i], [b, hb] = SHELF[i + 1];
    if (h <= hb) return lerp(a, b, (h - ha) / (hb - ha));
  }
  return 100000 + (h - 120) * 1000;
}

// ---- the clock: video time v -> story time T (s since the explosion) ----
// real time until the light lands and people react, then faster and faster (time-lapse)
const CLOCK = [
  [-4, 494.3], [0, 498.3], [1.7, 500], [3, 501.5], [5, 506], [7, 524], [9, 556], [11.5, 595], [14, 635],
  [17, 680], [20, 770], [23, 870], [26, 1000], [29, 1170], [32, 1420], [35, 1800], [38, 2400], [41, 3200],
  [44, 4200], [47, 5250], [50, 6500], [53, 7900], [56, 9500], [59, 11300], [61.5, 13100], [63.1, T_BLAST], [64, T_BLAST + 300],
];
function pchip(keys) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * (x[i + 1] - x[i]) + (x[i] - x[i - 1]), w2 = (x[i + 1] - x[i]) + 2 * (x[i] - x[i - 1]); m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (t) => {
    if (t <= x[0]) return y[0] + m[0] * (t - x[0]);
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  };
}
const logClock = pchip(CLOCK.map(([v, T]) => [v, Math.log(T - 480)]));
export const storyT = (v) => 480 + Math.exp(logClock(v));
// the people (and the braking cars) keep moving at close to real speed while the clock races: real time until the light
// lands, then a gentle speed-up (1× -> 2× at 10 s -> 3× at 15 s), so the crowd runs past you instead of zipping off
export const peopleT = (v) => (v <= 1.7 ? storyT(v) : 500 + (v - 1.7) + 0.1 * Math.max(0, v - 5) ** 2);
// video time when the story reaches T (bisection)
export function vOfT(T) {
  let a = -4, b = 64;
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (storyT(m) < T) a = m; else b = m; }
  return (a + b) / 2;
}
export const V_FLASH = 1.7;
export const V_BLAST = vOfT(T_BLAST);       // ~63.1
export const T_MERCURY = 5760, T_VENUS = 10750;   // swallowed (story s)
export const V_MERCURY = vOfT(T_MERCURY), V_VENUS = vOfT(T_VENUS);
// story time when f(T) first reaches x (f increasing)
const reach = (f, x) => { let a = T_FLASH, b = T_BLAST; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (f(m) < x) a = m; else b = m; } return (a + b) / 2; };
export const T_F1600 = reach((T) => toF(tEq(fluxLag(T))), 1600);

// ---- the beats: a big gold number pops up, with a jolt and a boom ----
export const BEATS = [
  { v: V_FLASH + 0.05, label: 'THE SUN IS NOW', text: '9× BRIGHTER', say: 'THE LIGHT ARRIVES' },
  { T: reach(bright, 30), label: 'THE SUN IS NOW', text: '30× BRIGHTER', say: 'THE BEACH CATCHES FIRE' },
  { T: T_F1600, label: 'IN THE SUNLIGHT', text: '1,600°F', small: true, say: '' },
  { T: reach(bright, 1000), label: 'THE SUN IS NOW', text: '1,000× BRIGHTER', small: true, say: 'IT KEEPS GROWING' },
  { T: reach(seaDrop, 1), label: 'THE SEA HAS DROPPED', text: '1 METER', small: true, say: 'THE SEA BOILS AWAY' },
  { T: reach(seaDrop, 10), label: 'THE SEA HAS DROPPED', text: '10 METERS', small: true, say: 'THE BAY RUNS DRY' },
  { T: T_MERCURY, label: 'SWALLOWED', text: 'MERCURY', small: true, say: 'MERCURY IS GONE' },
  { T: reach(seaDrop, 100), label: 'THE SEA HAS DROPPED', text: '100 METERS', small: true, say: 'THE OCEAN IS GONE' },
  { T: T_VENUS, label: 'SWALLOWED', text: 'VENUS', small: true, say: 'VENUS IS GONE. EARTH IS NEXT.' },
];
for (const b of BEATS) if (b.v === undefined) b.v = vOfT(b.T);
export function beatAt(v) {
  let cur = null;
  for (const b of BEATS) if (v >= b.v && v < b.v + 1.9) cur = { ...b, dt: v - b.v };
  return cur;
}

// the popup (one gold phrase, no number) shows for POP s after a beat that has one
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (x.say && v >= x.v && v < x.v + POP) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}

// ---- captions (video time): in the gaps between the popups, never on screen with one ----
export const CAPTIONS = [
  [0.0, 1.6, 'Its light takes 8 min 20 s to reach you.'],
  [3.6, 6.0, 'Your skin starts burning in seconds.'],
  [6.2, 8.8, 'Everyone runs for shade.'],
  [10.9, 13.3, 'The fireball grows 10,000 km every second.'],
  [13.5, 15.3, 'The sea starts to steam.'],
  [15.5, 18.2, 'In the sun the street hits 1,600°F.'],
  [18.4, 21.0, 'Every car on the avenue burns.'],
  [21.2, 23.8, 'Windows sag. Aluminum melts.'],
  [24.0, 26.4, 'Now the rock itself glows.'],
  [26.6, 28.45, 'Now the whole bay steams.'],
  [30.4, 32.8, 'The blast is still almost 4 hours away.'],
  [34.0, 36.55, 'The beach melts into glass.'],
  [38.5, 41.0, 'The towers sag and fall.'],
  [45.1, 47.6, 'The shore is now a mile out.'],
  [50.0, 53.05, 'The ocean drains to the horizon.'],
  [55.0, 57.9, 'The Sun fills half the sky.'],
  [60.4, 63.0, '4 hours 8 minutes: it hits Earth.'],
];
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = a <= 0 ? 1 : clamp((v - a) / 0.3);
      const fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const pad = (n) => String(n).padStart(2, '0');
export function fmtClock(T) {
  const s = Math.max(0, T);
  if (s < 600) { const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${pad(Math.floor(r))}.${pad(Math.floor((r % 1) * 100))}`; }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60);
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}
const sig2 = (x) => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)); return Math.round(x / p) * p; };
export const fmtBright = (T) => {
  const b = bright(T);
  if (b < 1.5) return 'THE SUN LOOKS NORMAL';
  return `THE SUN IS ${sig2(b).toLocaleString('en-US')}× BRIGHTER`;
};
export const COUNTERS = [
  {
    from: -10, to: T_SWITCH + 2, label: (v) => (v < 5 ? 'SINCE THE SUN EXPLODED' : 'SINCE THE SUN EXPLODED · TIME-LAPSE'),
    fmt: (T) => fmtClock(T),
    value: (v) => storyT(Math.min(v, V_BLAST)),
    unit: (v) => fmtBright(storyT(Math.min(v, V_BLAST))),
    lapse: (v) => smooth(4.9, 5.9, v),
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  const T = storyT(v);
  s.T = T;
  s.P = peopleT(v);                   // the clock the people and the cars move on
  s.bright = bright(T);
  s.ang = angR(T);
  s.flux = fluxLag(T);
  s.tK = tEq(s.flux);                 // a dark surface square to the Sun
  s.drop = seaDrop(T);
  s.shore = shoreOut(s.drop);
  // the moment the light lands: a hard white flash, then the new, harsher light
  s.flashHit = v < V_FLASH ? 0 : Math.exp(-(v - V_FLASH) / 0.25) * smooth(V_FLASH - 0.02, V_FLASH + 0.04, v);
  s.lit = smooth(V_FLASH - 0.03, V_FLASH + 0.03, v);
  // fire and heat, by story time (min after the explosion)
  const m = T / 60;
  s.smolder = smooth(510, 548, T);    // towels and umbrellas smoke (8:30 - 9:08)
  s.burn = smooth(550, 640, T);       // umbrellas, palms, awnings, towels burn (from ~30× brighter)
  s.skin = smooth(500.5, 530, T);     // bare skin reddens
  s.cars = smooth(11.5, 14.5, m);     // cars burn
  s.win = smooth(13.5, 17, m);        // windows go
  s.glow = smooth(14, 26, m);         // sunlit surfaces glow
  s.steam = smooth(16, 24, m);        // the sea steams
  s.surf = smooth(578, 640, T);       // first wisps off the surf (the opening)
  s.boil = smooth(22, 32, m);         // the sea boils
  s.glass = smooth(28, 50, m);        // the sand fuses into glass
  s.sag = smooth(55, 80, m);          // the towers sag
  s.fall = smooth(70, 110, m);        // and fall
  s.melt = smooth(120, 200, m);       // everything is lava
  s.hazeSteam = smooth(25, 120, m);   // steam fills the air
  s.mercury = T < T_MERCURY ? 1 : 0;
  s.venus = T < T_VENUS ? 1 : 0;
  // the last seconds: the fireball's front rushes in, then white
  s.blast = smooth(V_BLAST - 2.2, V_BLAST, v);
  s.flash = Math.max(smooth(V_BLAST - 0.35, T_SWITCH - 0.1, v), Math.min(1, s.flashHit * 0.92));
  s.flashColor = '#fffaf2';
  s.title = 1 - smooth(3.3, 4.1, v);
  s.lapse = COUNTERS[0].lapse(v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
