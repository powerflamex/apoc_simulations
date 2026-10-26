// "What if every punch was 10x stronger?" — the story as functions of VIDEO time v (seconds; real time).
// You stand on a sidewalk in downtown Los Angeles at golden hour, a brick wall in front of you, facing north across
// the avenue. You punch every 2 seconds; every punch carries 10x the energy of the last: punch 1 is a pro boxer's
// punch (500 J), punch n is 500 x 10^(n-1) J. You can't get hurt. The energy leaves your fist as a blast, forward at
// first, then all round you once it's bigger than a city. TNT: 4.184 MJ per kg. What each punch matches:
//   P2 5 kJ breaks the wall; P3 50 kJ: a car at 18 mph; P4 0.5 MJ: a hand grenade; P6 12 kg TNT: an artillery shell;
//   P7 120 kg: a 500 lb bomb; P9 12 t: the biggest non-nuclear bomb (MOAB, 11 t); P11 1.2 kt: the Beirut port blast;
//   P12 12 kt: almost Hiroshima (15 kt); P16 120 Mt: twice the Tsar Bomba (50 Mt); P18 12 Gt: more than every nuclear
//   weapon on Earth; P19 5e20 J: a year of humanity's energy (~6e20 J); P22 5e23 J: the dinosaur asteroid (~4e23 J);
//   P25 5e26 J: the Sun's output for a second (3.8e26 J); P26 5e27 J: enough to boil every ocean (~4e27 J);
//   P28 5e29 J: enough to shatter the Moon (its binding energy, 1.2e29 J); P31 5e32 J: more than Earth's binding
//   energy (2.2e32 J): it blows apart.
// Blast radii (5 psi, buildings flattened): R = 450 m x (kilotons)^(1/3).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const R_E = 6.371e6, R_MOON = 1.737e6, MOON_DIST = 3.844e8, R_SUN = 6.957e8, AU = 1.496e11;
export const N_PUNCH = 31;
export const PUNCH0 = 0.55, GAP = 2.0;
export const vPunch = (n) => PUNCH0 + (n - 1) * GAP;                 // when punch n lands
export const joulesOf = (n) => 500 * Math.pow(10, n - 1);
export const tntKg = (J) => J / 4.184e6;
export const kilotons = (n) => tntKg(joulesOf(n)) / 1e6;
export const flatR = (n) => 450 * Math.cbrt(kilotons(n));             // m, everything flattened inside this
export const V_LAST = vPunch(N_PUNCH);                               // 60.55: Earth blows apart
export const T_SWITCH = V_LAST + 0.9;                                // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;

// the punch you're on (the last one that landed; 0 before the first) and the time since it landed
export function punchAt(v) {
  const k = Math.floor((v - PUNCH0) / GAP) + 1;
  const n = clamp(k, 0, N_PUNCH);
  return { n, age: n > 0 ? v - vPunch(n) : v - vPunch(1) };
}
// the arm: 0 = fist pulled back (guard), 1 = arm fully out; it snaps out over 0.09 s to land at vPunch, holds,
// pulls back over ~0.6 s, then winds up for the next one
export function armAt(v) {
  let best = 0;
  for (let n = 1; n <= N_PUNCH + 1; n++) {
    const t = v - vPunch(n);
    if (t < -0.12 || t > 1.4) continue;
    let a;
    if (t < 0) a = Math.pow(smooth(-0.12, 0, t), 0.7);
    else a = 1 - smooth(0.25, 0.85, t);
    best = Math.max(best, a);
  }
  return best;
}

// ---- the shots (the camera itself is in main.js) ----
export const SHOTS = [
  { k: 'shoulder', a: -2, b: 4.35 },
  { k: 'street', a: 4.35, b: 8.35 },
  { k: 'street2', a: 8.35, b: 12.35 },
  { k: 'rise', a: 12.35, b: 16.35 },
  { k: 'aerial', a: 16.35, b: 24.35 },
  { k: 'high', a: 24.35, b: 32.35 },
  { k: 'orbit', a: 32.35, b: 52.35 },
  { k: 'moon', a: 52.35, b: 58.35 },
  { k: 'final', a: 58.35, b: 99 },
];
export const shotAt = (v) => SHOTS.find((x) => v < x.b) || SHOTS[SHOTS.length - 1];

// ---- what each punch does (say: the gold popup; note: the line under the counter) ----
export const PUNCHES = [];
{
  const SAY = {
    4: 'THE BUS FLIPS', 6: 'THE SHOPS CAVE IN', 7: 'THE WHOLE BUILDING GOES', 8: 'STRAIGHT THROUGH THE TOWERS',
    9: 'A WHOLE BLOCK IS GONE', 11: 'THE WHOLE NEIGHBORHOOD GOES', 12: 'A MUSHROOM CLOUD', 14: 'DOWNTOWN IS GONE',
    16: 'BIGGER THAN THE TSAR BOMBA', 17: 'LOS ANGELES IS GONE', 18: 'MORE THAN EVERY NUKE ON EARTH', 20: 'EARTHQUAKES ON EVERY CONTINENT', 22: 'AS HARD AS THE DINOSAUR ASTEROID',
    23: 'THE CRUST CRACKS OPEN', 26: 'THE OCEANS BOIL AWAY', 28: 'THE MOON SHATTERS', 31: 'EARTH BLOWS APART',
  };
  const NOTE = {
    1: 'A PRO BOXER’S PUNCH', 2: 'A SLEDGEHAMMER x20', 3: 'A CAR CRASH AT 18 MPH', 4: 'A HAND GRENADE',
    5: '5 STICKS OF DYNAMITE', 6: 'AN ARTILLERY SHELL', 7: 'A 500 LB BOMB', 8: 'A TON OF EXPLOSIVES',
    9: 'THE BIGGEST NON-NUCLEAR BOMB', 10: '10x THE BIGGEST NON-NUKE BOMB', 11: 'THE BEIRUT PORT BLAST', 12: 'HIROSHIMA WAS 15 KILOTONS',
    13: '8 HIROSHIMAS', 14: '80 HIROSHIMAS', 15: 'A HYDROGEN BOMB', 16: 'THE TSAR BOMBA WAS 50 MEGATONS',
    17: '50 MOUNT ST. HELENS', 19: 'A YEAR OF ALL HUMAN ENERGY', 20: '8 YEARS OF ALL HUMAN ENERGY',
    22: 'THE DINOSAUR ASTEROID', 25: 'THE SUN’S OUTPUT FOR A SECOND', 26: 'ENOUGH TO BOIL EVERY OCEAN',
    28: 'ENOUGH TO SHATTER THE MOON', 31: 'MORE THAN HOLDS EARTH TOGETHER',
  };
  for (let n = 1; n <= N_PUNCH; n++) PUNCHES.push({ n, v: vPunch(n), J: joulesOf(n), say: SAY[n] || '', note: NOTE[n] || '', R: flatR(n) });
}
export const punchOf = (n) => PUNCHES[n - 1];

// the gold popup: one phrase saying what just happened (never a number), POP s after the punch
export const POP = 1.7;
export function popupAt(v) {
  let b = null;
  for (const x of PUNCHES) if (x.say && v >= x.v && v < x.v + (x.n === N_PUNCH ? 0.9 : POP)) b = x;
  return b ? { say: b.say, dt: v - b.v } : null;
}

// ---- captions (video time): in the gaps between the popups (never on screen together) ----
export const CAPTIONS = [
  [3.95, 6.4, 'Every punch is 10x stronger.'],
  [8.45, 10.45, 'You can’t get hurt. The city can.'],
  [18.45, 20.45, 'Windows break a mile away.'],
  [24.45, 26.45, 'The cloud is 10 miles high.'],
  [28.45, 30.45, 'The fireball is 3 miles wide.'],
  [36.45, 38.45, 'The shockwave circles the planet.'],
  [40.45, 42.45, 'The whole continent is burning.'],
  [46.45, 48.45, 'And you keep punching.'],
  [48.6, 50.45, 'More than the Sun gives off in a second.'],
  [52.45, 54.45, 'Now you aim at the Moon.'],
  [56.45, 58.3, 'The Moon is a cloud of rubble.'],
  [58.6, 60.45, 'Earth is glowing red-hot. One more punch.'],
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

// ---- the counter: the power of the punch you're winding up, in TNT, racing up (exactly punch n's at its landing) ----
const sig = (x) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 10 ? x.toFixed(0) : x.toFixed(1));
const BIG = [[1e21, 'sextillion'], [1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion']];
export function fmtTNT(kg) {
  if (kg < 0.001) return `${(kg * 1000).toFixed(2)} g`;
  if (kg < 0.01) return `${(kg * 1000).toFixed(1)} g`;
  if (kg < 1) return `${sig(kg * 1000)} g`;
  if (kg < 1000) return `${sig(kg)} kg`;
  const t = kg / 1000;
  if (t < 1000) return `${sig(t)} tons`;
  if (t < 1e6) return `${sig(t / 1e3)} kilotons`;
  if (t < 1e9) return `${sig(t / 1e6)} megatons`;
  if (t < 1e12) return `${sig(t / 1e9)} gigatons`;
  for (const [d, w] of BIG) if (t >= d) return `${sig(t / d)} ${w} tons`;
  return `${sig(t)} tons`;
}
export const powerAt = (v) => 500 * Math.pow(10, (Math.min(v, V_LAST) - PUNCH0) / GAP);
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: '',
    labelFn: (v) => `PUNCH ${clamp(punchAt(v + 0.12).n, 1, N_PUNCH)} OF ${N_PUNCH} · IN TNT`,
    fmt: (J) => fmtTNT(tntKg(J)),
    value: (v) => powerAt(v),
    unit: (v) => { const n = clamp(punchAt(v + 0.12).n, 1, N_PUNCH); return punchOf(n).note; },
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  const p = punchAt(v);
  s.n = p.n; s.age = p.age;
  s.arm = armAt(v);
  s.shot = shotAt(v);
  s.title = 1 - smooth(3.0, 3.75, v);
  s.flash = smooth(V_LAST + 0.25, T_SWITCH - 0.08, v);
  s.flashColor = '#fffaf2';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
