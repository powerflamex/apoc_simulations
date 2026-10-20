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
export const V5 = 60;                       // video time when 5.00 s have passed
export const SLOW = 12;
export const tau = (v) => (5 * (v + 0.36)) / (V5 + 0.36);   // story seconds (0.03 s at frame 0; negative = before)
export const vOfTau = (t) => (t * (V5 + 0.36)) / 5 - 0.36;
export const T_SWITCH = V5 + 1.0;           // full white
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const fallOf = (t) => (t > 0 ? 0.5 * G * t * t : 0);  // m fallen after t s of free fall

// how far the summit (and everything on it, you included) has sunk: the powdered rock slumps a little slower than
// free fall at first (it has to flow out from under you), then just falls
export const sinkOf = (t) => (t > 0 ? 0.5 * G * 0.85 * Math.pow(t, 2.0) * smooth(0, 0.6, t) : 0);
// the sea's explosion: how far its front has come from the water's edge (m) and how tall the wall stands
export const seaFront = (t) => (t > 0 ? 680 * Math.sqrt(t) : 0);
export const seaWall = (t) => (t > 0 ? 420 * Math.pow(t, 0.85) : 0);

// ---- captions (video time) ----
const C = (a, b, text) => [a, b, text];
export const CAPTIONS = [
  C(3.9, 6.6, 'Every oxygen atom is gone. Except the ones in living things.'),
  C(6.8, 9.0, 'The air is 21% thinner. Every ear pops.'),
  C(9.2, 11.6, 'Every engine stops. The tour helicopter drops.'),
  C(11.8, 14.2, 'Water is 89% oxygen. The sea turns into hydrogen gas.'),
  C(14.4, 16.8, 'It needs 1,200 times the room. The sea explodes.'),
  C(17.2, 19.6, 'Concrete is half oxygen. The statue starts to crumble.'),
  C(19.8, 22.2, 'It’s just loose sand now, falling.'),
  C(22.4, 24.8, 'Its head reaches its feet in 2.8 seconds.'),
  C(25.2, 27.6, 'Granite is 47% oxygen. The mountain turns to dust.'),
  C(27.8, 30.2, 'Corcovado is sinking. With you on it.'),
  C(30.4, 32.8, 'Sugarloaf is crumbling too.'),
  C(33.2, 35.6, 'Everyone on the mountain is falling.'),
  C(35.8, 38.2, 'Christ the Redeemer is a pile of dust.'),
  C(38.4, 40.8, 'There’s nothing left to stand on.'),
  C(42.2, 44.6, 'Every concrete building in Rio comes down.'),
  C(44.8, 47.2, 'The exploding sea is crossing the city.'),
  C(47.4, 49.8, 'It’s coming for the mountain.'),
  C(50.0, 52.4, 'Nothing made of stone is left standing.'),
  C(vOfTau(4.5) - 0.1, vOfTau(4.5) + 2.2, 'Half a second left.'),
  C(vOfTau(4.72), V5 - 0.1, 'Then the oxygen comes back. Into all that hydrogen.'),
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
    fmt: (t) => `${Math.min(Math.max(t, 0), 5).toFixed(2)} s`,
    value: (v) => tau(v),
    unit: (v) => {
      const t = tau(v), d = sinkOf(t) / FT;
      if (t >= 5) return 'OXYGEN IS BACK';
      if (d > 3) return `SLOW MOTION 12× · YOU'VE FALLEN ${Math.round(d)} FT`;
      return 'SLOW MOTION 12×';
    },
    badge: () => 'OXYGEN RETURNS AT 5.00 s',
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  const t = (s.t = tau(v));
  s.gone = t > 0 ? 1 : 0;                       // oxygen gone
  s.clouds = 1 - smooth(0, 0.09, t);            // the clouds vanish
  s.ears = smooth(0.12, 0.3, t) * (1 - smooth(1.4, 2.4, t));   // people clutching their ears
  s.muffle = smooth(0.02, 0.1, t);              // your ears after the pop
  s.glass = smooth(0, 0.35, t);                 // windows to dust
  s.sink = sinkOf(t);                           // the summit's drop (m)
  s.statue = fallOf(t);                         // how far the top of the statue has fallen (m)
  s.rock = smooth(0.05, 1.2, t);                // the mountain turning to grey powder (colour)
  s.sea = seaFront(t); s.wall = seaWall(t);
  s.ignite = smooth(5.0, 5.05, t);              // the oxygen is back: the hydrogen burns
  s.flash = smooth(V5 + 0.02, T_SWITCH - 0.1, v);
  s.flashColor = '#fff6ea';
  s.title = 1 - smooth(3.0, 3.8, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
