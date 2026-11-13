// "What if a black hole passed by the Sun?": the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A sunny waterfront avenue downtown at midday, traffic stopped, people out of their cars looking up. A black hole of 10 Suns
// is falling past the Sun. You never see it: you see the Sun bend around an empty spot beside it, stretch into an egg, pour
// a river of glowing gas toward the spot, which lights up as a ring of fire; at 0:31 it skims the Sun and rips it into a
// spiral; the gas falling into it flares brighter and brighter until the sky is white. White, and loop.
//
// The physics (worked out before building; the numbers on screen are these):
//   - black hole 10 Suns; event horizon radius 2GM/c^2 = 29.5 km, so it is 59 km = 37 miles wide;
//   - it tears a star apart inside the tidal radius r_t = R_sun (M_bh / M_sun)^(1/3) = 2.15 R_sun (1.5 million km from
//     the Sun's centre); stripping starts around 2.2 R_sun;
//   - the pass drawn here: closest approach 1.3 R_sun from the centre = 0.3 R_sun = 209,000 km = 130,000 miles above the
//     surface (the Moon is 239,000 miles from us). SPH runs of a Sun-like star past a 10-Sun black hole at 1.3 R_sun
//     (Perets et al. 2016, ApJ 823, 113): ~20% of the star ends up bound to the hole, ~10% flung off: "almost a third";
//   - the fall is a parabola around 11 Suns: t = sqrt(2 q^3 / GM) (D + D^3/3), D = tan(nu/2), sqrt(2 q^3/GM) = 1,007 s.
//     The Sun is 10x lighter, so it is the Sun that moves: it is dragged across the sky (several of its own widths in the
//     last hour) and swung round the empty spot;
//   - Roche overflow (gas pouring from the Sun toward the hole) starts when the hole is within ~4.8 R_sun, ~50 min before
//     the pass: the stream and the ring of fire (gas circling the hole) are already there before the closest pass;
//   - the flare: the torn gas falling in comes back within about an hour (fallback time ~40 min for this pass) and the
//     hole swallows far more than it can: it shines at least at its Eddington limit, 1.26e31 W per Sun of mass x 10 =
//     1.3e32 W = 330,000 Suns (micro-TDE models put it higher). The counter stops at 300,000x;
//   - everything you see left the Sun 8 min 20 s earlier (1 AU / c): "you're seeing all this 8 minutes late".
// What is drawn bigger than real (also in CAPTIONS.md): the Sun and everything around it is drawn about 10x its real size
// in the sky (a real Sun is 0.53 degrees, a dot in a phone frame); the bending of light is drawn hundreds of times
// stronger (a 10-Sun hole near the Sun bends its image by ~20-40 arcseconds, telescope-only); the "black ball" is only the
// dark middle of that exaggerated lens (the real hole is 37 miles wide).
import { smooth, clamp, lerp, keys } from './util.js';

export const STORY_START = 0;
export const V_LENS = 3.3;            // first caption, after the title
export const V_EGG = 6.5;             // the Sun stretches into an egg, the stream starts (the camera pushes in)
export const V_FLICK = 11.5;          // daylight flickers
export const V_DRAG = 13.6;           // (caption) the Sun is being dragged across the sky
export const V_RIVER = 16.5;          // the stream becomes a river of fire
export const V_RING = 21.5;           // the ring of fire: now you can see it
export const V_SWING = 26.4;          // two shadows swinging
export const V_PASS = 31.0;           // closest pass: the counter hits zero
export const V_FLARE = 37.0;          // the flare starts climbing
export const V_SKY = 42.2;            // the sky turns white
export const V_WHITE = 46.0;          // full white
export const T_SWITCH = 46.6;         // the loop point, inside the white
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP;                     // 47.6 s
export const BEATS = [V_EGG, V_FLICK, V_RIVER, V_RING, V_SWING, V_PASS, V_FLARE, V_SKY];

// ---- the story clock: seconds from the closest pass (negative before), a time-lapse at RATE story s per video s ----
const RATE = [[-4, 95], [8, 90], [16, 80], [24, 65], [29, 48], [31.5, 45], [33.5, 80], [38, 230], [44, 420], [50, 420]];
export const rateAt = (v) => keys(RATE, v);
const SDT = 1 / 240, S0 = -4;
const T_TAB = (() => { const n = Math.ceil((52 - S0) / SDT); const t = new Float64Array(n + 1); let s = 0; for (let k = 0; k <= n; k++) { t[k] = s; s += rateAt(S0 + k * SDT) * SDT; } return t; })();
const T_PASS = T_TAB[Math.round((V_PASS - S0) / SDT)];
export function storyT(v) {
  const f = clamp((v - S0) / SDT, 0, T_TAB.length - 1.001), k = Math.floor(f);
  return T_TAB[k] + (T_TAB[k + 1] - T_TAB[k]) * (f - k) - T_PASS;
}

// ---- the fall: a parabola round 11 Suns, closest pass Q = 1.3 Sun radii ----
export const Q = 1.3, TAU_P = 1007;           // R_sun, seconds
export const RT = 2.15;                        // tidal radius (R_sun)
const INC = 35 * Math.PI / 180, ROT = 80 * Math.PI / 180;
export function orbitAt(T) {
  const x = T / TAU_P;
  let D = Math.cbrt(3 * x);                    // Newton on D + D^3/3 = x
  for (let i = 0; i < 30; i++) D -= (D + D * D * D / 3 - x) / (1 + D * D);
  const r = Q * (1 + D * D), nu = 2 * Math.atan(D);
  const px = r * Math.cos(nu), py = r * Math.sin(nu) * Math.cos(INC);
  // the Sun seen from the hole, in the sky (Sun radii; x right, y up)
  return { r, nu, sx: px * Math.cos(ROT) - py * Math.sin(ROT), sy: px * Math.sin(ROT) + py * Math.cos(ROT) };
}

// ---- the flare: how many times brighter than the Sun the gas falling in shines (story seconds after the pass) ----
const FLARE = [[0, 0], [400, 0.3], [700, 3], [1100, 60], [1600, 2000], [2100, 25000], [2700, 140000], [3300, 300000]];
export function flareAt(T) {
  if (T <= 0) return 0;
  if (T >= 3300) return 300000;
  for (let i = 0; i < FLARE.length - 1; i++) {
    const [a, x] = FLARE[i], [b, y] = FLARE[i + 1];
    if (T <= b) { const u = (T - a) / (b - a); return x <= 0 ? y * u : Math.exp(Math.log(x) + (Math.log(y) - Math.log(x)) * u); }
  }
  return 300000;
}

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_EGG + 0.1, 'THE SUN IS STRETCHING'],
  [V_FLICK + 0.1, 'THE DAYLIGHT FLICKERS'],
  [V_RIVER + 0.1, 'A RIVER OF FIRE'],
  [V_RING + 0.1, 'NOW YOU CAN SEE IT'],
  [V_SWING + 0.1, 'YOUR SHADOW SPLITS'],
  [V_PASS + 0.1, 'THE SUN IS TORN OPEN'],
  [V_FLARE + 0.1, 'IT STARTS TO FEED'],
  [V_SKY + 0.1, 'THE SKY TURNS WHITE'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together; nothing while the title is up) ----
export const CAPTIONS = [
  [V_LENS, 6.3, 'You can’t see it. Only what it does to the Sun.'],
  [8.55, 11.3, 'It weighs as much as 10 Suns, and it’s only 37 miles wide.'],
  [V_DRAG, 16.3, 'Its pull is dragging the Sun across the sky.'],
  [18.55, 21.3, 'It’s pulling the Sun’s gas off into a stream.'],
  [23.55, 26.2, 'Two lights in the sky. Everyone has two shadows.'],
  [28.45, 30.9, 'It passes closer to the Sun than the Moon is to you.'],
  [33.0, 36.8, 'Almost a third of the Sun is ripped away.'],
  [39.0, 42.0, 'And you’re seeing all of this 8 minutes late.'],
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

// ---- the counters: the countdown to the closest pass, then the flare ----
const V_CSWITCH = 36.4;
const pad = (n) => String(n).padStart(2, '0');
function fmtLeft(T) {
  const s = Math.max(0, Math.ceil(-T));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
export const COUNTERS = [
  {
    from: -3, to: V_CSWITCH, label: 'BLACK HOLE REACHES THE SUN IN',
    fmt: (T) => fmtLeft(T),
    value: (v) => storyT(v),
    allowNegative: true,
    unit: () => 'TIME-LAPSE  ·  THEN IT RIPS THE SUN',
  },
  {
    from: V_CSWITCH, to: VIDEO_DURATION + 1, label: 'THE FLARE',
    fmt: (F) => `${Math.max(1, Math.round(F)).toLocaleString('en-US')}×`,
    value: (v) => flareAt(storyT(v)),
    unit: () => 'BRIGHTER THAN THE SUN',
  },
];

// ---- what the sky looks like at video time v (sky.js and main.js draw it; audio.mjs follows it) ----
// (the lens strength: the hole is in front of the Sun, closing in on it, so its bending ring shrinks as it gets there)
// early on it is drawn so the Sun sits just outside its ring (bent into an arc), later it closes in to 0.75
const UE = [[-4, 1.28], [0, 1.25], [7, 1.05], [12, 1.1]];
const THE = [[-4, 1.3], [22, 1.05], [31, 0.75], [50, 0.75]];
export function skyAt(v) {
  const T = storyT(v);
  const o = orbitAt(T);
  const k = {};
  k.T = T; k.r = o.r; k.sx = o.sx; k.sy = o.sy;
  k.sep = Math.hypot(o.sx, o.sy);
  k.thE = lerp(k.sep / keys(UE, v), keys(THE, v), smooth(11, 22, v));
  const after = T > 0;
  // the Sun's shape: once it overflows (hole within ~4.8 R_sun) it fills its Roche lobe, a teardrop with its tip at the
  // inner Lagrange point (~0.32 x the distance, from the Sun's centre) pointing at the hole; closer in, the tide
  // stretches it further. The tip is kept clear of the hole's dark middle until the pass (the gas between is the stream).
  k.tear = smooth(V_PASS - 1.0, V_PASS + 3.5, v);
  const lobe = 0.6 * smooth(5.6, 4.5, o.r) + 0.9 * Math.pow(RT / o.r, 3);
  const room = Math.max(0, (k.sep - 0.78 * k.thE - 0.12) - 1);
  k.ring = smooth(V_RING - 1.2, V_RING + 0.8, v);
  k.e = after ? lerp(1.6, 0.6, smooth(V_PASS + 1, V_PASS + 10, v)) : Math.min(1.0, lobe, lerp(9, room + 0.25 * smooth(V_PASS - 6, V_PASS, v), k.ring));
  k.rs = 1 - 0.12 * k.tear;                                     // the remnant: smaller (almost a third is gone)
  // the stream pouring from the Sun's tip toward the hole (Roche overflow from ~4.8 R_sun)
  k.stream = smooth(5.0, 3.8, o.r) * (1 - 0.6 * k.tear);
  k.river = smooth(V_RIVER - 0.8, V_RIVER + 2.5, v);
  // after the pass: the inner arm wrapping into the hole, the outer arm flung away (Sun radii long)
  k.armIn = k.tear;
  k.armOut = lerp(0.8, 7.5, smooth(V_PASS - 0.5, V_PASS + 11, v)) * k.tear;
  // daylight: the lens magnifies the Sun as it lines up (the point-source magnification), plus a flicker as it tears
  const u = Math.max(k.sep / k.thE, 0.2);
  k.mag = (u * u + 2) / (u * Math.sqrt(u * u + 4));
  k.flick = smooth(V_FLICK - 0.6, V_FLICK + 0.4, v) * (1 - smooth(V_RING, V_RING + 3, v) * 0.5) * (1 - k.tear * 0.7);
  k.flare = flareAt(T);
  // what the flare does to the picture (0 .. ~1 at the white); a log scale of its brightness
  k.flareVis = clamp(Math.log10(1 + k.flare) / 5.5);
  return k;
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.title = 1 - smooth(2.7, 3.05, v);
  s.white = smooth(V_SKY + 2.3, V_WHITE, v);
  s.flash = 0; s.flashColor = '#ffffff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
