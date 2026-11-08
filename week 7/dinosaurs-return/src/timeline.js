// "What if dinosaurs came back?": the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A sunny waterfront avenue downtown, traffic jammed, people everywhere. A T. rex is walking down the street toward you;
// you stand on the median filming it. Every 3 s something bigger happens; between 0:15 and 0:27 the rest of them turn up
// (a giant pterosaur over your head, a Triceratops herd, a Mosasaurus in the harbour, a Brachiosaurus over the roofs);
// then the T. rex comes the rest of the way, a second one blocks the way back, and it roars into your lens. White, and loop.
// The numbers on screen:
//   - the counter is the T. rex's real distance in the scene (camera to the tip of its snout in its walking pose), in feet;
//     it walks at 0.3-1.7 m/s, around the 1.3 m/s that its leg and tail mechanics suggest (van Bijlert et al. 2021);
//   - T. rex: about 40 ft long (Sue, the biggest skeleton, is 12.3 m), about 9 tons (Sue's estimates run 8.4 t and up);
//     skull 5 ft (Sue's is 1.4 m); bite about 8,000 lb of force at the back teeth (Bates & Falkingham 2012: 35-57 kN);
//     top speed about 12 mph (Sellers et al. 2017: ~20 km/h); eyes up to 13x as sharp as ours (Stevens 2006);
//     teeth up to 12 in long with the root (Sue's biggest);
//   - Quetzalcoatlus northropi: wingspan about 10-11 m (36 ft at the top of the range);
//   - Triceratops: 6-12 t; "6 tons each" is the low end;
//   - Mosasaurus hoffmannii: up to about 15-17 m (50 ft);
//   - Brachiosaurus: head about 12-13 m up (40 ft).
// What is drawn vs real (also in CAPTIONS.md): every animal is drawn at its real size; the pterosaur and mosasaur are not
// dinosaurs (the captions don't call them that); how a T. rex sounded is unknown (the roar is made up); a car lifted in its
// jaws is a what-if (its bite could, a car weighs 1.5 t); nobody is shown hurt.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const V_STOMP = 3.0;           // a footstep you feel
export const V_CRUSH = 6.0;           // it steps on a car
export const V_ROAR = 9.0;            // it roars down the street at you
export const V_TOSS = 12.0;           // it bites a car and throws it
export const V_QUETZ = 15.0;          // a Quetzalcoatlus sweeps over your head
export const V_HERD = 17.6;           // a Triceratops herd stampedes out of the side street
export const V_SEA = 23.2;            // a Mosasaurus comes out of the harbour onto a boat
export const V_BRACH = 26.0;          // a Brachiosaurus over the roofs at the end of the street
export const V_BACK = 27.8;           // back to the T. rex: it's coming for you
export const V_SHOVE = 32.2;          // it knocks a car aside
export const V_TWO = 33.0;            // you turn to run: another one behind you
export const V_SEES = 36.0;           // back round: its head comes down to yours
export const V_SNIFF = 39.0;          // it breathes you in
export const V_JAWS = 42.0;           // the jaws open
export const V_LUNGE = 44.0;          // it roars into your lens
export const V_WHITE = 45.0;          // full white
export const T_SWITCH = 45.7;         // the loop point, inside the white
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;                     // 46.6 s
export const BEATS = [V_STOMP, V_CRUSH, V_ROAR, V_TOSS, V_QUETZ, V_HERD, V_SEA, V_BRACH, V_BACK, V_SHOVE, V_TWO, V_SEES, V_SNIFF, V_JAWS];

// ---- how far the T. rex has walked along its path (m), from its speed (m/s) ----
const SPEED = [[-3, 1.3], [5.2, 1.3], [5.8, 0.4], [7.2, 0.4], [7.8, 1.25], [11.2, 1.25], [11.8, 0.22], [14.0, 0.22], [14.8, 1.0],
  [26.5, 1.0], [27.3, 1.5], [32.5, 1.5], [33.5, 1.05], [35.5, 0.9], [36.5, 0.4], [41.5, 0.27], [43.5, 0.12], [44.0, 0.12], [44.4, 1.6], [44.9, 0.2], [50, 0.2]];
export const rexSpeed = (v) => {
  if (v <= SPEED[0][0]) return SPEED[0][1];
  for (let i = 0; i < SPEED.length - 1; i++) {
    const [a, x] = SPEED[i], [b, y] = SPEED[i + 1];
    if (v <= b) return lerp(x, y, smooth(a, b, v));
  }
  return SPEED[SPEED.length - 1][1];
};
const SDT = 1 / 240, S0 = -4;
const S_TAB = (() => { const n = Math.ceil((52 - S0) / SDT); const t = new Float32Array(n + 1); let s = 0; for (let k = 0; k <= n; k++) { t[k] = s; s += rexSpeed(S0 + k * SDT) * SDT; } return t; })();
export function rexS(v) {
  const f = clamp((v - S0) / SDT, 0, S_TAB.length - 1.001), k = Math.floor(f);
  return S_TAB[k] + (S_TAB[k + 1] - S_TAB[k]) * (f - k) - S_TAB[Math.round(-S0 / SDT)];
}

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_STOMP + 0.1, 'THE GROUND SHAKES'],
  [V_CRUSH + 0.15, 'IT CRUSHES A CAR'],
  [V_ROAR + 0.1, 'IT ROARS AT YOU'],
  [V_TOSS + 0.9, 'IT THROWS A CAR'],
  [V_HERD + 0.1, 'A HERD STAMPEDES'],
  [V_SEA - 0.3, 'SOMETHING IN THE HARBOR'],
  [V_BACK + 0.1, 'IT’S COMING FOR YOU'],
  [V_TWO + 0.4, 'THERE’S ANOTHER ONE'],
  [V_SEES + 0.2, 'IT SEES YOU'],
  [V_SNIFF + 0.1, 'IT SMELLS YOU'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together; nothing while the title is up) ----
export const CAPTIONS = [
  [4.85, 5.95, 'It weighs 9 tons.'],
  [7.9, 8.95, 'It’s 40 feet long.'],
  [10.85, 12.6, 'Its head alone is 5 feet long.'],
  [14.65, 15.9, 'Its bite: 8,000 pounds.'],
  [15.95, 17.6, 'Quetzalcoatlus: wings 36 feet wide.'],
  [19.45, 21.4, 'Triceratops: 6 tons each.'],
  [24.65, 25.85, 'Mosasaurus: 50 feet long.'],
  [26.05, 27.75, 'Brachiosaurus: 40 feet tall.'],
  [29.65, 31.0, 'It runs 12 mph. Can you?'],
  [31.4, 33.3, 'Everyone else is gone.'],
  [35.15, 36.15, 'You’re trapped.'],
  [37.95, 38.95, 'Its eyes: 13x sharper than yours.'],
  [40.85, 42.8, 'Its teeth: up to 12 inches long.'],
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

// ---- the counter: how far away the T. rex is (filled in by main.js from the scene) ----
export const M2FT = 3.28084;
export const COUNTERS = [
  {
    from: -3, to: VIDEO_DURATION + 1, label: 'T. REX',
    fmt: (d) => `${(d * M2FT).toFixed(1)} FT`,
    value: () => window.__rexDist ?? 46,
    unit: () => 'AWAY FROM YOU',
  },
];

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.title = 1 - smooth(2.6, 2.95, v);
  s.white = smooth(V_LUNGE + 0.55, V_WHITE, v);
  s.flash = 0; s.flashColor = '#ffffff';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
