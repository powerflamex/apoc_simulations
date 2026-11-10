// "What if an earthquake hit magnitude 18?" — the story as functions of VIDEO time v (seconds).
// You are on California Street in San Francisco at golden hour, at the top of Nob Hill, looking down the hill past
// the cable car to the Financial District and the Bay Bridge. The rule: the quake's magnitude keeps climbing, one
// whole step every 4 s in the city (5 s once we are out in space). Each step is 32 times the energy of the last:
//   E = 10^(1.5 M + 4.8) J
//   M 6.9: Loma Prieta, 1989 (a Bay Bridge span fell). M 7.9: the 1906 San Francisco earthquake. M 9.5: the biggest ever recorded (Chile, 1960).
//   M 12: ~6e22 J, the dinosaur asteroid's impact (~1e23-4e23 J: magnitude ~12.5)
//   M 14.5: what the Sun gives off in one second (3.8e26 J)
//   M 15.2: enough to boil every ocean (1.4e21 kg x 2.6 MJ/kg)
//   M 17.8: enough to melt the whole planet (6e24 kg x ~2 MJ/kg)
//   M 18.4: Earth's gravitational binding energy (2.24e32 J): enough to blow the planet apart.
// Shaking stronger than gravity (ground acceleration > 1 g) throws everything loose into the air (M 11 here).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 3.4;              // the video starts this far into the story: magnitude 5.85, the windows go at 0.6 s
// magnitude at video time v (piecewise linear: 4 s per step in the city, 5 s per step in space, slowing at the end)
const MK = [[-8, 3.0], [0, 5.0], [28, 12.0], [33, 13.0], [38, 14.0], [43, 15.0], [48, 16.0], [53, 17.0], [58.4, 18.0], [60.4, 18.4]];
export function magAt(v) {
  if (v <= MK[0][0]) return MK[0][1];
  for (let i = 0; i < MK.length - 1; i++) {
    const [a, x] = MK[i], [b, y] = MK[i + 1];
    if (v <= b) return x + (y - x) * (v - a) / (b - a);
  }
  return MK[MK.length - 1][1];
}
export function vAtMag(m) {
  for (let i = 0; i < MK.length - 1; i++) {
    const [a, x] = MK[i], [b, y] = MK[i + 1];
    if (m <= y) return a + (b - a) * (m - x) / (y - x);
  }
  return MK[MK.length - 1][0];
}
export const energyOf = (m) => Math.pow(10, 1.5 * m + 4.8);
export const V_BREAK = vAtMag(18.4);           // Earth flies apart
export const T_SWITCH = V_BREAK + 1.5;         // full white; the loop point sits in it (the pieces fly apart first)
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP - STORY_START;
export const V_DUST = vAtMag(12.25);           // the city is lost in dust
export const V_PLANET = vAtMag(12.55);         // out of the dust: California from space
export const place = (v) => (v < V_PLANET ? 'city' : 'planet');
// the big moments in the city
export const V_GLASS = vAtMag(6.0), V_BRICK = vAtMag(7.0), V_ROLL = vAtMag(8.0), V_FALL = vAtMag(9.0), V_BRIDGE = vAtMag(9.4);
export const V_SPLIT = vAtMag(10.0), V_PYRAMID = vAtMag(10.3), V_AIR = vAtMag(11.0);

// ---- how hard the ground moves (made-up but monotone; they set the look) ----
// shake: the fast jolting (camera, small things), 0..~3; roll: height of the rolling ground waves (m);
// toss: how far loose things are thrown up (m) once the shaking beats gravity
export const shakeAt = (v) => clamp(0.5 * Math.pow(1.42, magAt(v) - 5), 0, 3.2);   // felt from the first frame
export const rollAt = (v) => { const m = magAt(v); return m < 7.3 ? 0 : 0.35 * Math.pow(2.1, m - 8) * smooth(7.3, 8.2, m); };
export const tossAt = (v) => { const m = magAt(v); return m < 10.8 ? 0 : 3 * Math.pow(2.0, m - 11) * smooth(10.8, 11.2, m); };

// ---- the beats: a big number at every whole magnitude ----
export const NOTES = {
  5: 'YOU FEEL IT', 6: '32× STRONGER: WINDOWS BREAK', 7: 'LIKE SAN FRANCISCO, 1989', 8: 'THE STREET ROLLS LIKE THE SEA',
  9: 'BIGGEST EVER RECORDED: 9.5', 10: 'NEVER HAPPENED ON EARTH', 11: 'STRONGER THAN GRAVITY', 12: 'THE DINOSAUR ASTEROID',
  13: 'CALIFORNIA TEARS APART', 14: 'THE CONTINENT CRACKS', 15: 'THE SUN’S OUTPUT FOR 5 SECONDS', 16: 'ENOUGH TO BOIL THE OCEANS',
  17: 'THE CRUST SHATTERS', 18: 'EARTH COMES APART',
};
export const BEATS = Object.keys(NOTES).map(Number).filter((m) => m > 5).map((m) => ({ m, v: vAtMag(m), k: NOTES[m] }))
  .concat([{ m: 18.4, v: V_BREAK, k: 'EARTH BREAKS APART' }]);
// what each popup says (no magnitude: the counter shows it); '' = no popup (the beat's sound still plays)
const SAY = { 6: '', 7: 'LIKE SAN FRANCISCO, 1989', 8: 'THE STREET ROLLS LIKE THE SEA', 9: '',
  10: 'NEVER HAPPENED ON EARTH', 11: 'STRONGER THAN GRAVITY', 12: 'AS STRONG AS THE DINOSAUR ASTEROID', 13: 'CALIFORNIA TEARS APART',
  14: 'THE CONTINENT CRACKS', 15: 'THE SUN’S OUTPUT FOR 5 SECONDS', 16: 'ENOUGH TO BOIL THE OCEANS', 17: 'THE CRUST SHATTERS',
  18: '', 18.4: 'EARTH BREAKS APART' };
BEATS.forEach((b) => { b.say = SAY[b.m] ?? ''; });
// the popup (one gold phrase) shows for POP s after a beat that has one
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
  [9.8, 11.9, 'You’re in San Francisco. Every step is 32 times stronger.'],
  [13.8, 15.9, 'Bricks rain down from the old buildings.'],
  [16.0, 18.0, 'The strongest ever recorded was 9.5.'],
  [18.2, 19.9, 'The Bay Bridge falls.'],
  [21.8, 23.9, 'The street splits open.'],
  [25.8, 27.9, 'Everything is thrown into the air.'],
  [29.8, 32.9, 'The San Andreas Fault starts to tear.'],
  [34.8, 37.9, 'You can see it from space.'],
  [39.8, 42.9, 'The cracks race across North America.'],
  [58.2, 60.3, 'At 18.4, Earth comes apart.'],
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

// ---- the counter ----
export function unitAt(v) {
  const m = magAt(v);
  let n = '';
  for (const k of Object.keys(NOTES).map(Number)) if (m >= k) n = NOTES[k];
  return n;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'EARTHQUAKE · MAGNITUDE',
    fmt: (m) => m.toFixed(1),
    value: (v) => magAt(v),
    unit: () => '',
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.m = magAt(v);
  s.place = place(v);
  s.shake = shakeAt(v); s.roll = rollAt(v); s.toss = tossAt(v);
  s.title = 1 - smooth(STORY_START + 3.0, STORY_START + 3.8, v);
  // dust: from the falling buildings, thickening until the city is gone in it; the brown-out hides the cut to space
  s.dust = 0.06 * smooth(V_BRICK, V_FALL, v) + 0.14 * smooth(V_FALL, V_AIR, v) + 0.35 * smooth(V_AIR + 1, V_DUST, v);
  s.brown = smooth(V_DUST - 0.6, V_DUST + 0.2, v) * (1 - smooth(V_PLANET - 0.15, V_PLANET + 0.6, v));
  s.flash = v >= V_BREAK + 0.5 ? smooth(V_BREAK + 0.5, T_SWITCH - 0.1, v) : 0;
  s.flashColor = '#fffaf2';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
