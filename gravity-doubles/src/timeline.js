// "What if gravity doubled every 5 seconds?" — the story as functions of VIDEO time v (seconds).
// You are standing on a riverside plaza at sunset (a fountain, a Ferris wheel, a suspension bridge, the skyline
// across the river). Gravity started doubling T0 seconds before the first frame: g = 2^((v + T0) / 5).
// What fails, in order of g (the thresholds are the physics; the video times follow from them):
//   ~2-3x   people can't stay on their feet, birds drop, planes can't stay up (airliners are built for 2.5x)
//   ~4x     standing, your blood can't reach your brain: grey-out, black-out, you hit the ground
//   ~5-8x   the Ferris wheel folds, trees and lamp posts give, towers start to crush themselves
//   ~10x    the bridge's main cables snap; 16x you can't breathe; ~28x your heart stops
//   ~32x    every building is down; dust can't rise
//   64-128x the clouds fall out of the sky; the air weighs like the ocean thousands of feet down
//   256x+   rock fails under its own weight: anything taller than h = 7,500 m / g crumbles (granite, ~200 MPa)
//   1,000x  air crushed to 1,000 atmospheres glows red-hot
//   ~6,000x even atoms can't hold Earth up (the Chandrasekhar limit, 1.4 Suns, scales as G^-1.5: Earth's mass
//           reaches it at G x ~6,000); ~8,000x neither can neutrons (~2.2 Suns): Earth becomes a black hole,
//           r = 2GM/c^2 = 8.9 mm x 8,100 = 72 m: about 500 ft wide.
// Then the frame burns to white and the white clears onto the first frame (the video loops).
import { smooth, keys, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything here runs on the video clock
export const T0 = 2.5;                   // gravity has been doubling for this long at the first frame (1.41x)
export const DOUBLE = 5;                 // seconds per doubling
export const gAt = (v) => Math.pow(2, Math.max(v + T0, 0) / DOUBLE);
export const vAtG = (g) => DOUBLE * Math.log2(g) - T0;
export const WEIGHT_LB = 150;

// ---- the big moments (video time) ----
export const V_PLANE = vAtG(2.15);       // ~3.0 s: the airliner starts to sink
export const V_CRASH = vAtG(3.7);        // ~6.9 s: ...and hits the city behind the skyline
export const V_GREY = vAtG(3.0);         // ~5.4 s: colour drains, tunnel vision
export const V_FALL = vAtG(4.3);         // ~8.0 s: you black out and fall
export const V_WHEEL = vAtG(5.4);        // ~9.7 s: the Ferris wheel buckles
export const V_BRIDGE = vAtG(10);        // ~14.1 s: the bridge's cables snap
export const V_BREATH = vAtG(16);        // ~17.5 s: you can't breathe in
export const V_HEART = vAtG(28);         // ~21.5 s: your heart stops
export const V_GRID = vAtG(18);          // ~18.3 s: the power fails
export const V_CLOUDS = vAtG(48);        // ~25.4 s: the clouds come down
export const V_RAIN = vAtG(92);         // ~30.1 s: ...and come down as rain
export const V_GLOW = vAtG(700);         // ~44.8 s: the crushed air starts to glow
export const V_ATOMS = vAtG(6000);       // ~60.3 s: atoms give: Earth caves in
export const V_BH = vAtG(8100);          // ~62.4 s: a black hole
export const T_SWITCH = 65.4;            // full white; the loop point sits in it
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

// tallest a pile of rock can stand at gravity g (granite, ~200 MPa): everything taller crumbles to it
export const rockCap = (g) => 7500 / g;
// everything built (towers' rubble, cars, the fountain, trees, people) is weaker: crushed lower and sooner
export const softCap = (g) => (g < 64 ? 6000 / g : 94 * Math.pow(64 / g, 2.2));

export const CAPTIONS = [
  [2.6, 5.0, 'Gravity doubled. You weigh 300 lb.'],
  [5.2, 7.4, 'Planes drop out of the sky.'],
  [7.6, 10.0, 'Blood can’t reach your brain. You black out.'],
  [10.2, 12.4, 'The Ferris wheel folds under its own weight.'],
  [12.6, 15.0, 'Skyscrapers start crushing themselves.'],
  [15.2, 17.4, 'The bridge cables snap.'],
  [17.6, 19.9, 'You can’t breathe in anymore.'],
  [20.1, 22.4, 'Your heart can’t lift blood this heavy.'],
  [22.6, 25.0, 'Every building in the city comes down.'],
  [25.2, 27.4, 'The dust is too heavy to rise.'],
  [27.6, 30.0, 'The clouds fall out of the sky.'],
  [30.2, 32.4, 'They hit the ground as rain.'],
  [32.6, 35.0, 'The air weighs like the sea 4,000 ft down.'],
  [35.2, 37.4, 'The rubble is pressed flat.'],
  [37.6, 40.0, 'Your body now weighs 19 tons.'],
  [40.2, 42.4, 'Nothing is left taller than a person.'],
  [42.6, 45.0, 'Solid rock flows like mud.'],
  [45.2, 47.4, 'The whole city sinks into the ground.'],
  [47.6, 50.0, 'The crushed air glows red-hot.'],
  [50.2, 52.4, 'The ground splits open.'],
  [52.6, 55.0, 'The whole planet is being squeezed.'],
  [55.2, 57.4, 'And it keeps doubling.'],
  [57.6, 60.0, 'The whole planet starts to give.'],
  [60.2, 62.3, 'At 6,000×, even atoms can’t hold Earth up.'],
  [62.5, 64.6, 'Earth collapses into a black hole 500 ft wide.'],
];

export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.35);
      const fadeOut = clamp((b - v) / 0.35);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export const fmtG = (g) => (g < 9.95 ? g.toFixed(1) : fmtInt(g));
function gNote(g) {
  const notes = [[0, ''], [2.53, "JUPITER'S GRAVITY"], [3.2, ''], [4.3, 'FIGHTER PILOTS BLACK OUT'], [6.5, ''], [9, "A FIGHTER JET'S LIMIT"],
    [12, ''], [27.9, "THE SUN'S SURFACE"], [40, '']];
  let n = '';
  for (const [m, t] of notes) if (g >= m) n = t;
  return n;
}
// Earth's width while it caves in (miles): 7,918 down to the black hole's 0.09 (472 ft)
export const earthMiles = (v) => keys([[V_ATOMS - 0.3, 7918], [V_ATOMS + 0.6, 7000], [V_BH - 0.4, 40], [V_BH + 0.3, 0.0894]], v, true);
const fmtMiles = (m) => (m >= 10 ? `${fmtInt(m)} miles` : m >= 0.3 ? `${m.toFixed(1)} miles` : `${fmtInt(Math.round(m * 5280 / 10) * 10)} ft`);
export const COUNTERS = [
  {
    from: -3, to: V_ATOMS, label: 'YOU WEIGH',
    fmt: (lb) => `${fmtInt(lb)} lb`,
    value: (v) => WEIGHT_LB * gAt(v),
    unit: (v) => { const g = gAt(v), n = gNote(g); return `GRAVITY ${fmtG(g)}×${n ? ' · ' + n : ''}`; },
    badge: () => 'EARTH CAVES IN AT 6,000×',   // the finish line the number is racing toward
  },
  {
    from: V_ATOMS, to: T_SWITCH + 2, label: "EARTH'S WIDTH",
    fmt: (m) => fmtMiles(m),
    value: (v) => earthMiles(v),
    unit: (v) => `GRAVITY ${fmtG(gAt(v))}×`,
  },
];

// ---- state ----
// the doublings: the k-th lands at video time k * DOUBLE - T0
export const doublingAt = (v) => { const k = Math.floor((v + T0) / DOUBLE + 1e-9); return { k, dt: v - (k * DOUBLE - T0) }; };

export function state(v) {
  const s = { v };
  const g = (s.g = gAt(v));
  s.lg = Math.log2(g);
  // you: grey-out (colour drains, tunnel vision), black-out, falling to the ground, lying there
  s.grey = smooth(V_GREY, V_FALL - 0.2, v) * (1 - smooth(V_FALL + 0.9, V_FALL + 2.6, v));
  s.black = 0.8 * smooth(V_FALL - 0.4, V_FALL + 0.05, v) * (1 - smooth(V_FALL + 0.25, V_FALL + 0.9, v));
  s.fall = smooth(V_FALL, V_FALL + 0.55, v);          // the camera drops to the ground
  s.breath = 1 - smooth(V_BREATH - 0.5, V_BREATH + 0.8, v);
  s.heart = 1 - smooth(V_HEART - 0.2, V_HEART + 0.3, v);
  s.dying = smooth(V_BREATH, V_HEART + 0.5, v) * (1 - smooth(V_HEART + 1.0, V_HEART + 3.5, v));   // vision narrows, then the camera is just a camera
  // the world
  s.cap = softCap(g);                                // everything built is crushed under this height
  s.capRock = rockCap(g);                            // ...and the hills under this
  s.clouds = smooth(V_CLOUDS, V_RAIN + 0.4, v);      // 0: clouds at 2 km .. 1: down on the city
  s.rain = smooth(V_RAIN - 0.3, V_RAIN + 0.4, v) * (1 - smooth(V_RAIN + 3.2, V_RAIN + 5.0, v));   // they hit the ground as rain
  s.cloudsGone = smooth(V_RAIN + 0.8, V_RAIN + 4.5, v);
  s.air = smooth(vAtG(100), vAtG(1000), v);          // the air thickens (a little haze)
  s.heat = smooth(V_GLOW, vAtG(3500), v);             // the crushed air and ground glow
  s.cracks = smooth(vAtG(1400), vAtG(2600), v);
  s.whiteHot = smooth(V_BH + 0.7, T_SWITCH - 0.5, v);   // the collapse: the crust heats to white
  s.flow = smooth(vAtG(380), vAtG(700), v);           // rock flows: the ground heaves
  s.sink = smooth(vAtG(800), vAtG(2000), v);           // the city sinks into the ground
  s.shrink = smooth(V_ATOMS - 0.4, V_BH + 0.4, v);    // Earth caves in
  s.radius = earthMiles(v) * 1609.34 / 2;            // m
  s.crane = smooth(V_HEART + 10, vAtG(1100), v);       // after you die the view rises and flies out over the river into the city
  s.pull = smooth(V_ATOMS - 1.2, V_BH + 0.6, v);       // the camera lifts away to show it
  s.dark = smooth(vAtG(500), vAtG(3000), v);             // the sky goes black (the air is a thin hot skin now)
  s.grid = 1 - smooth(V_GRID, V_GRID + 2.2, v);         // city lights (each building also goes dark as it falls)
  s.pump = 1 - smooth(V_GRID - 0.2, V_GRID + 0.8, v);   // the fountain's pumps
  // the white at the end (the collapse), then the loop
  s.flash = smooth(V_BH + 0.1, T_SWITCH - 0.15, v);
  s.flashColor = '#fffaf2';
  s.title = 1 - smooth(3.0, 3.8, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
