// "What if Earth stopped spinning?" — the story as functions of VIDEO time v (seconds).
// You are on a footbridge over a downtown avenue on the equator at golden hour, looking west down the street.
// The rule: Earth's spin (1,037 mph at the equator) falls steadily to zero in D seconds. It started T0 s before
// the first frame. The air and the oceans are not attached to the ground, so they keep going east at the old speed:
// relative to the ground the wind is simply 1,037 mph minus the spin, and it gains 100 mph every 6.2 s.
// The ground itself brakes at 463.6 m/s / 64.5 s = 7.2 m/s² (0.73 g): like a bus slamming on its brakes, so
// everything loose slides and tumbles east from the very first frame.
// Physics used (sea level, 28 °C):
//   wind pressure q = ½ ρ v²: 1.2 kPa at 100 mph, 4.8 at 200, 31 at 500, 129 kPa (more than the whole
//   atmosphere's weight, 1.3 atm) at 1,037 mph.
//   windows fail ~130-230 mph; cars roll and fly from ~170 mph (EF4-EF5); the fastest wind ever measured is ~302 mph
//   (Oklahoma, 1999); 5 psi (34.5 kPa, the overpressure that flattens most buildings in a nuclear blast) at ~536 mph;
//   the speed of sound is ~778 mph at 28 °C.
//   The ocean also keeps going: its front moves east (relative to the ground) by ∫ wind dt = ½ a t², so the coast,
//   15.7 km (9.7 miles) west, arrives just after the spin reaches zero, at ~1,037 mph.
// Then the deep water closes over everything, and clears onto the first frame (the video loops).
import { smooth, keys, clamp, lerp } from './util.js';

export const STORY_START = 0;             // everything here runs on the video clock
export const T0 = 2.0;                    // the slow-down began this long before the first frame
export const D = 64.5;                    // seconds from 1,037 mph to a standstill
export const SPIN0 = 1037;                // mph at the equator
export const WMAX = SPIN0 * 0.44704;      // 463.6 m/s
export const ACC = WMAX / D;              // 7.19 m/s²: how hard the ground brakes
export const tOf = (v) => v + T0;         // story time (since the slow-down began)
export const spinAt = (v) => SPIN0 * clamp(1 - tOf(v) / D);
export const windAt = (v) => SPIN0 - spinAt(v);                 // mph, eastward relative to the ground
export const Wms = (t) => WMAX * clamp(t / D);                  // wind (m/s) at story time t
// distance the air (and anything that moves with it) has travelled east relative to the ground by story time t
export const IW = (t) => (t <= 0 ? 0 : t <= D ? 0.5 * ACC * t * t : 0.5 * ACC * D * D + WMAX * (t - D));
export const vAtWind = (mph) => (mph / SPIN0) * D - T0;

// Something torn loose at story time ts (at rest on the ground until then) is dragged toward the wind's speed
// with a time constant tau (small and light: tau ~0.3 s; a person ~2.5 s; a car ~4 s; a concrete slab ~10 s).
// Relative to the ground: du/dt = (W - u)/tau + ACC (the ground brakes under it) => u = W(t) - W(ts) e^-(t-ts)/tau.
// Returns how far east (m) it has gone by story time t.
export function drift(ts, tau, t) {
  if (t <= ts) return 0;
  const e = Math.exp(-(t - ts) / tau);
  return IW(t) - IW(ts) - Wms(ts) * tau * (1 - e);
}
export function driftSpeed(ts, tau, t) {
  if (t <= ts) return 0;
  return Wms(t) - Wms(ts) * Math.exp(-(t - ts) / tau);
}

// ---- the big moments (video time) ----
export const V_YOU = 3.4;                  // "you" lose your footing on the crosswalk
export const V_GLASS = vAtWind(150);        // ~7.3 s: the first windows burst
export const V_CARS = vAtWind(170);         // ~8.6 s: cars start to roll
export const V_RECORD = vAtWind(302);       // ~16.8 s: faster than any wind ever measured
export const V_SHOPS = vAtWind(380);        // ~21.6 s: the low buildings are torn apart
export const V_STRIP = vAtWind(330);        // ~18.5 s: cladding starts to peel off the towers
export const V_NUKE = vAtWind(536);         // ~31.3 s: 5 psi
export const V_FOLD = vAtWind(560);         // ~32.8 s: concrete buildings start to fold
export const V_TOWERS = vAtWind(620);       // ~36.6 s: the tower frames start to fall
export const V_ROAD = vAtWind(660);         // ~39.1 s: the road is peeled off
export const V_SOUND = vAtWind(778);        // ~46.4 s: faster than sound
export const V_LANDMARK = 48.6;             // the tallest tower goes last
export const V_OCEAN = 51.6;                // the ocean shows on the horizon
export const V_STOP = D - T0;               // 62.5 s: Earth has stopped
export const V_HIT = 64.0;                  // the water reaches you
export const T_SWITCH = 65.0;               // deep water; the loop point sits in it
export const LOOP = 1.0;                    // the water clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const UNDER_COLOR = '#03181c';
// the beats: every 100 mph of wind, and the stop
export const BEATS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((w) => ({ v: vAtWind(w), w }))
  .concat([{ v: V_STOP, w: SPIN0, stop: true }]);
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}

// the ocean's front: where it is (m, along z; east = +z) at video time v. The coast is placed so that the front
// reaches the camera's final position at V_HIT.
export const CAM_END = { x: 0, y: 92, z: -360 };
export const COAST_Z = CAM_END.z - IW(tOf(V_HIT));
export const oceanZ = (v) => COAST_Z + IW(tOf(v));

export const CAPTIONS = [
  [3.9, 6.3, 'The ground under you brakes. You don’t.'],
  [6.5, 8.9, 'The air keeps going: a Cat 5 hurricane.'],
  [9.1, 11.5, 'At 200 mph, every window bursts.'],
  [11.7, 14.1, 'Cars tumble down the street.'],
  [14.3, 16.5, 'Trees are ripped out by the roots.'],
  [17.0, 19.3, 'Faster than any wind ever recorded.'],
  [19.5, 21.9, 'You’d be a mile down the road by now.'],
  [22.1, 24.5, 'The shops are torn apart.'],
  [24.7, 27.1, 'Towers are stripped to their frames.'],
  [27.3, 29.9, 'The clouds race by at 500 mph.'],
  [31.4, 33.8, 'The wind now hits like a nuclear blast.'],
  [34.0, 36.4, 'Concrete buildings fold.'],
  [36.6, 39.0, 'The towers start to fall.'],
  [39.2, 41.6, 'The road is peeled off the ground.'],
  [41.8, 44.2, 'The whole city is blowing away.'],
  [46.4, 48.8, 'The wind breaks the sound barrier.'],
  [49.0, 51.4, 'The tallest tower goes last.'],
  [51.6, 54.0, 'Then the horizon starts to rise.'],
  [54.2, 56.6, 'The ocean is coming at 900 mph.'],
  [56.8, 59.2, 'Two miles away. Here in 7 seconds.'],
  [59.4, 62.2, 'There is nowhere to run.'],
  [62.4, 64.0, 'Earth has stopped. The ocean hasn’t.'],
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
function windNote(w) {
  const notes = [[0, 'NEAR GALE'], [39, 'GALE'], [74, 'HURRICANE'], [157, 'CAT 5 HURRICANE'], [201, 'EF5 TORNADO'],
    [303, 'FASTEST EVER RECORDED'], [400, ''], [536, 'NUCLEAR-BLAST FORCE'], [640, ''], [778, 'FASTER THAN SOUND']];
  let n = '';
  for (const [m, t] of notes) if (w >= m) n = t;
  return n;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: "EARTH'S SPIN",
    fmt: (mph) => `${fmtInt(mph)} mph`,
    value: (v) => spinAt(v),
    unit: (v) => { const w = windAt(v), n = windNote(w); return `WIND ${fmtInt(w)} mph${n ? ' · ' + n : ''}`; },
    badge: (v) => (v < V_STOP ? 'EARTH STOPS AT 0' : 'EARTH HAS STOPPED'),   // the finish line the number is racing toward
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.t = tOf(v);
  s.wind = windAt(v);                       // mph
  s.W = Wms(s.t);                           // m/s
  s.k = s.wind / SPIN0;                     // 0..1
  s.q = Math.pow(s.k, 2);                   // wind pressure relative to the end
  // the air fills with dust and grit as the city is scoured; the low Sun dims and reddens through it
  // (it thins again at the end: the wind now comes off land that has already been scoured bare)
  s.dust = Math.max(0, 0.08 * smooth(4, 14, v) + 0.2 * smooth(18, 34, v) + 0.14 * smooth(34, 46, v) - 0.28 * smooth(47, 56, v));
  s.grid = 1 - smooth(13, 24, v);           // city lights: the power fails as lines and poles go down
  s.shake = 0.15 + 0.85 * s.k;              // camera shake from the gusts
  s.oceanZ = oceanZ(v);
  s.ocean = smooth(V_OCEAN - 3, V_OCEAN + 2, v);
  // the deep water at the end, then the loop
  s.under = v >= V_HIT ? 1 : 0;
  s.flash = v >= V_HIT ? smooth(V_HIT, V_HIT + 0.35, v) : 0;   // (hides the text: only deep water until the loop)
  s.flashColor = UNDER_COLOR;
  s.title = 1 - smooth(3.0, 3.8, v);
  s.you = 1 - smooth(5.4, 6.2, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
