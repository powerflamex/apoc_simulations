// "What if oxygen disappeared for 5 seconds?" — the story as functions of VIDEO time v (seconds).
// You are a tourist at Christ the Redeemer on Corcovado (710 m) above Rio, early afternoon. At t = 0 every oxygen
// atom on Earth vanishes for 5 seconds, except the ones inside living things (so you live to watch). The video shows
// those 5 seconds in slow motion (12x): the counter is real time.
// What happens (all of it starts at once and speeds up, because things fall: d = 1/2 g t^2):
//   the air is 21% oxygen: the pressure drops by a fifth at once, every ear pops
//   every engine and fire dies: the tour helicopter's rotor spins down and it drops
//   clouds are water (89% oxygen by weight): they vanish
//   glass is about half oxygen: every window turns to dust
//   concrete is about half oxygen: the statue (reinforced concrete, soapstone skin) and every building in the city
//     lose their strength and fall like sand (the statue's head reaches its feet after ~2.8 s)
//   granite is ~47% oxygen: the mountain under you turns to loose powder and slumps; you fall with it
//   seawater turns into hydrogen gas that needs ~1,200 times the room: the bay, the lagoon and the ocean explode
//     into a wall of fog and debris that races toward the mountain
// At 5.00 s the oxygen comes back into all that hydrogen: the sky ignites. White; the loop.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const G = 9.81;
// The video clock is cut into segments. First 1.5 s of a normal day (real time, a countdown). Then THE MOMENT,
// replayed: the first instant shown again from four places, each in deep slow motion (the counter starts from 0.00
// each time and says where you are): the statue, Copacabana beach (the sea blasts up the sand in about a hundredth
// of a second, so ~300x), a street of towers in Botafogo (every window), the beach avenue (the clouds, the
// helicopter). Then the 5 seconds play out at ~9x slow motion, a new event every few seconds, to the ignition.
export const V0 = 1.5;                      // video time of the moment
export const SEGS = [
  { a: -10, b: V0, t0: -11.5, t1: 0, place: 'A NORMAL DAY ON CORCOVADO', real: true },
  { a: V0, b: 5.0, t0: 0, t1: 0.1, place: 'CORCOVADO' },
  { a: 5.0, b: 9.0, t0: 0, t1: 0.012, place: 'THE SAME MOMENT · COPACABANA', fine: true },
  { a: 9.0, b: 12.5, t0: 0, t1: 0.1, place: 'THE SAME MOMENT · BOTAFOGO' },
  { a: 12.5, b: 16.0, t0: -0.08, t1: 0.3, place: 'THE SAME MOMENT · AVENIDA ATLÂNTICA' },   // (a breath before: the clouds, then they blink out)
  { a: 16.0, b: 59.0, t0: 0.3, t1: 5.0, place: 'SLOW MOTION 9×', main: true },
  { a: 59.0, b: 80, t0: 5.0, t1: 5.0 + 21 / 9, place: 'OXYGEN IS BACK', main: true },
];
// vm: the video time of the moment (t = 0) in each segment
for (const g of SEGS) g.vm = g.t1 > g.t0 && g.t0 <= 0 && g.t1 >= 0 ? g.a + (0 - g.t0) / (g.t1 - g.t0) * (g.b - g.a) : g.a;
export const segAt = (v) => { for (const s of SEGS) if (v < s.b) return s; return SEGS[SEGS.length - 1]; };
export const tau = (v) => { const s = segAt(v); return s.t0 + (s.t1 - s.t0) * (v - s.a) / (s.b - s.a); };
// (the main segment only: when a story moment happens)
const MAIN = SEGS[5];
export const vOfTau = (t) => MAIN.a + (t - MAIN.t0) / (MAIN.t1 - MAIN.t0) * (MAIN.b - MAIN.a);
export const V5 = MAIN.b;                   // video time when 5.00 s have passed
export const SLOW = 9;
export const T_SWITCH = V5 + 1.0;           // full white
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const fallOf = (t) => (t > 0 ? 0.5 * G * t * t : 0);  // m fallen after t s of free fall

// how far the summit (and everything on it, you included) has sunk: the powdered rock slumps a little slower than
// free fall at first (it has to flow out from under you), then just falls
export const sinkOf = (t) => (t > 0 ? 0.5 * G * 0.85 * Math.pow(t, 2.0) * smooth(0, 0.6, t) : 0);
// the sea's explosion: how far its front has come from the water's edge (m) and how tall the wall stands
export const seaFront = (t) => (t > 0 ? 470 * Math.sqrt(t) : 0);
export const seaWall = (t) => (t > 0 ? 420 * Math.pow(t, 0.6) : 0);   // (it leaps up at once, then keeps climbing)

// ---- captions (video time) ----
const C = (a, b, text) => [a, b, text];
export const CAPTIONS = [
  C(4.0, 5.0, 'The air is 21% thinner. Every ear pops.'),
  C(5.1, 8.9, 'Water is 89% oxygen. The sea turns into hydrogen gas, and explodes.'),
  C(9.1, 12.4, 'Glass is half oxygen. Every window turns to dust.'),
  C(12.6, 15.9, 'Clouds are water. They blink out. Every engine dies.'),
  C(16.2, 20.8, 'Concrete is half oxygen. The statue falls apart like sand.'),
  C(21.2, 25.8, 'Hydrogen needs 1,200 times the room. The blast rolls up Copacabana.'),
  C(26.2, 30.8, 'The statue’s head reaches its feet in 2.8 seconds.'),
  C(31.2, 35.8, 'Every tower in Rio falls like sand.'),
  C(36.2, 40.8, 'Granite is 47% oxygen. The mountain sinks, with you on it.'),
  C(41.2, 45.8, 'The beachfront is gone.'),
  C(46.2, 50.8, 'Nothing made of stone is left standing.'),
  C(51.2, vOfTau(4.5) - 0.2, 'The blast is coming for the mountain.'),
  C(vOfTau(4.5), vOfTau(4.75), 'Half a second left.'),
  C(vOfTau(4.78), V5 - 0.1, 'Then the oxygen comes back. Into all that hydrogen.'),
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.3), fadeOut = clamp((b - v) / 0.3);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: real time without oxygen, racing in slow motion ----
const FT = 0.3048;
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'WITHOUT OXYGEN',
    labelFn: (v) => (tau(v) < 0 ? 'OXYGEN DISAPPEARS IN' : 'WITHOUT OXYGEN'),
    fmt: (t) => `${Math.min(Math.abs(t), 5).toFixed(Math.abs(t) < 0.1 && t > 0 ? 3 : 2)} s`,
    value: (v) => tau(v),
    allowNegative: true,
    unit: (v) => {
      const t = tau(v), d = sinkOf(t) / FT, sg = segAt(v);
      if (sg.main && t < 5 && d > 3) return `${sg.place} · YOU'VE FALLEN ${Math.round(d)} FT`;
      return sg.place;
    },
    badge: () => 'OXYGEN RETURNS AT 5.00 s',
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  const t = (s.t = tau(v));
  s.gone = t > 0 ? 1 : 0;                       // oxygen gone
  s.clouds = 1 - smooth(0, 0.012, t);           // the clouds vanish at once (they burst away)
  const sg = (s.seg = segAt(v));
  s.place = SEGS.indexOf(sg);                   // 0 normal, 1 statue, 2 beach, 3 street, 4 avenue, 5 main, 6 after
  s.pop = s.place >= 1 && s.place <= 4 && v >= sg.vm ? Math.exp(-(v - sg.vm) / 0.4) : 0;   // each replay of the moment: a jolt, a shock, a flash
  s.ears = smooth(0.04, 0.12, t) * (1 - smooth(1.4, 2.4, t));   // people clutching their ears
  s.muffle = smooth(0.02, 0.1, t);              // your ears after the pop
  s.glass = smooth(0, 0.35, t);                 // windows to dust
  s.sink = sinkOf(t);                           // the summit's drop (m)
  s.statue = fallOf(t);                         // how far the top of the statue has fallen (m)
  s.rock = smooth(0.05, 1.2, t);                // the mountain turning to grey powder (colour)
  s.sea = seaFront(t); s.wall = seaWall(t);
  s.ignite = smooth(5.0, 5.025, t);              // the oxygen is back: the hydrogen burns
  s.flash = smooth(V5 + 0.45, T_SWITCH - 0.05, v);   // (the fire gets half a second first)
  s.flashColor = '#fff6ea';
  s.title = 1 - smooth(3.0, 3.8, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
