// "What if the biggest nuke ever hit your city?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// The whole video is REAL TIME: no time-lapse. An unnamed made-up city at dusk; you stand in the crowd on a promenade
// on a hill, about 13 miles from a 50-megaton bomb (the Tsar Bomba's real yield) set off 2.5 miles over the middle of the city.
// Light gets to you at once, the blast 45 seconds later: that gap is the video.
// The numbers:
//   - 50 Mt, burst 4 km up, fireball reaching the ground and up toward the release plane's 10.5 km, cloud top 64 km
//     (40 miles), flash seen 1,000 km away, windows broken out to 900 km (560 miles), third-degree burns possible out to
//     100 km (60 miles), complete destruction to 25 km (15.5 miles): nuclearweaponarchive.org/Russia/TsarBomba.html.
//     Fireball: sources run from 6.5 km wide at 1 s to 9 km or more, so "over 5 miles" (8 km); it is drawn 9-12 km wide.
//   - the blast's arrival: the published 1 Mt air burst (Glasstone & Dolan's sequence: 11 s, 3.2 miles, 6 psi, 180 mph wind;
//     37 s, 9.5 miles, 1 psi), scaled by the cube root of the yield (50^(1/3) = 3.68, distance and time alike):
//     for 50 Mt, 40.5 s at 11.8 miles, 6 psi, 180 mph. That gives ~5 psi and ~160 mph at 13 miles, moving 0.24 miles/s
//     (Rankine-Hugoniot at 5 psi: 865 mph), so it reaches 13.35 miles 47 s after the burst, 45 s after frame 0. miAt(t) below passes through
//     those points; the Brode overpressure fit for the same yield gives 40 s at 13 miles as a surface burst, the same order.
//   - the sound of it arrives WITH the blast: until then you hear only the street.
// What is drawn vs what is real: the counter, the miles and every number are true, and the front is drawn where miAt puts
// it. The PICTURE of the fireball runs ahead at first: frame 0 shows the look it would have about 12 s in (orange, its shape
// clear), not the white glare of the real 2 s; picT() closes that gap to nothing by the end. Its sizes are to scale. The
// last 0.8 s are shown in slow motion (labelled on the counter). The dust wall is taller than real, so that it can be seen
// from miles off; the towers are placed to be reached on the 3 s beat; the tallest is 1,000 m (a little past the tallest
// real one, 830 m) so it can be seen from 1.6 miles.
// The near events (helicopter, flames on the street, birds, billboard) are what the flash and heat would do, not computed. Electronics: at 13 miles from a burst this low the grid and the phone network go down (long wires pick up
// the pulse, substations trip); most cars and phones would keep working, so the video says "loses signal", never "fried",
// and the traffic stops because the drivers are blinded. People are never shown hurt: the dust takes the street.
import { smooth, clamp, lerp, keys } from './util.js';

export const STORY_START = 0;
export const MILE = 1609.344;
export const D_MI = 13.35;                                // you, from ground zero ("13 miles")
export const D_M = D_MI * MILE;                           // 20.9 km
export const BURST_KM = 4;                                // the burst's height (the real one)
// the front's distance from ground zero (miles) t seconds after the burst
export const miAt = (t) => (t <= 0 ? 0 : 0.24 * t + 2.08 * (1 - Math.exp(-t / 8)));
export const mphAt = (t) => (0.24 + 0.26 * Math.exp(-t / 8)) * 3600;
export const T_ARRIVE = (() => { let a = 10, b = 90; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (miAt(m) < D_MI) a = m; else b = m; } return (a + b) / 2; })();   // 45.5 s

// ---- the events (video time) ----
// (real seconds: the world runs on realV(v); only the last 0.8 s are stretched, into 2.4 s of video)
export const REAL_HIT = 45.0;                             // the blast reaches you: the counter hits 0.00
export const V_SLOW = 44.2, SLOW = 3;
export const V_WALL = V_SLOW + (REAL_HIT - V_SLOW) * SLOW;   // 46.6: the same moment in video time
export const realV = (v) => (v <= V_SLOW ? v : v >= V_WALL ? REAL_HIT + (v - V_WALL) : V_SLOW + (v - V_SLOW) / SLOW);
export const T0 = T_ARRIVE - REAL_HIT;                    // frame 0 is 2 s after the burst
export const tOf = (rv) => rv + T0;
export const milesLeft = (v) => Math.max(0, D_MI - miAt(tOf(realV(v))));
// the fireball's picture clock: 12 s on frame 0, catching up with the true clock by the hit
export const picT = (rv) => 12 + rv * (T_ARRIVE - 12) / REAL_HIT;
export const STEP = 3;
export const STEPS = Array.from({ length: 14 }, (_, i) => (i + 1) * STEP);
export const V_CRASH = 3.1;           // the first crash on the road
export const V_POWER = 5.7;           // the city's lights go out, far side first, toward you
export const V_PHONE = 8.4;           // your phone: no service
export const V_RUN = 11.9;            // the crowd runs
export const V_SMOKE = 13.5;          // the heat: awnings and roofs start to smoke
export const V_BIRDS = 15.6;          // a flock bursts past you
export const V_HEAT = 18.0;           // the first flames beside you
export const V_BURN = 20.5;           // fires all over the city
export const V_FIRE = 24.0;           // both sides of your street go up
export const V_HELI = 26.7;           // the helicopter hits the road
export const V_LIFT = 22.0;           // the fireball has left the ground and pulls up a stem
export const V_QUIET = 29.8;          // no sound yet
export const V_SIGN = 33.0;           // the burning billboard comes down
export const V_CLOUD = 35.8;          // the cap spreads over the street
export const V_TALL = 38.4;           // the front reaches the tallest tower
export const V_DROP = 38.6;           // everyone left drops to the ground
export const V_STREET = 43.2;         // the wall is on your hill
export const V_THROW = 44.6;          // the car comes at you (real clock)
// the tallest towers go one by one, on the beat (each is placed where the front is at that moment)
export const TOWER_V = [18, 21, 24, 27, 30, 33, 36, V_TALL, 41.6];
export const T_SWITCH = V_WALL + 0.6;  // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- the fireball and the cloud, kilometres, against t (seconds after the burst); drawn to scale ----
// radius of the ball, then of the cap; its centre's height; how flat the cap is; the ring under it
export function cloudAt(t) {
  const R = t < 8 ? 4.6 * (1 - Math.exp(-Math.max(t, 0.02) / 0.8)) + 0.002 : keys([[8, 4.6], [20, 6.0], [30, 7.4], [47, 9.6]], t);
  const H = keys([[3, 4.0], [8, 5.0], [15, 6.8], [25, 10.0], [35, 13.5], [47, 17.0]], t);
  const flat = 1 - 0.38 * smooth(10, 28, t);
  const ring = smooth(10, 30, t);
  const stem = smooth(9, 22, t);
  return { R, H, flat, A: 0.62 * R * ring, B: 0.40 * R * ring, stem };
}
// how bright it is: a first spike, the dip, the long second pulse (it lasts about as long as the video), then the glow
export const lightAt = (t) => keys([[0, 0.85], [1, 1.0], [3, 0.8], [6, 1.0], [12, 0.72], [20, 0.44], [30, 0.27], [47, 0.16]], t);
// its surface temperature (1 white hot .. 0 soot)
export const heatAt = (t) => keys([[0, 1.2], [2, 0.98], [4, 0.9], [7, 0.84], [12, 0.76], [20, 0.64], [30, 0.56], [47, 0.5]], t);

// ---- the gold popups: one phrase saying what is happening (never a number) ----
export const POP = 1.7;
export const POPS = [
  [V_POWER + 0.5, 'THE WHOLE CITY GOES DARK'],
  [V_RUN + 0.3, 'EVERYONE RUNS'],
  [V_HEAT + 0.2, 'THE HEAT GETS HERE FIRST'],
  [V_FIRE + 0.5, 'THE CITY CATCHES FIRE'],
  [V_QUIET + 0.4, 'NOT A SOUND YET'],
  [V_CLOUD + 0.3, 'IT FILLS THE SKY'],
  [V_TALL + 0.1, 'THE TALLEST TOWER FALLS'],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}

// ---- captions (in the gaps between the popups: never on screen together) ----
const MPH = Math.round(mphAt(32) / 10) * 10;
export const CAPTIONS = [
  [3.4, 5.9, `You’re ${Math.floor(D_MI)} miles from the bomb.`],
  [V_PHONE, 11.8, 'Every phone loses signal.'],
  [14.3, 17.9, 'The fireball is over 5 miles wide.'],
  [20.3, 24.3, 'Its heat reaches 60 miles out.'],
  [26.6, 29.9, 'It’s 50 million tons of TNT.'],
  [32.3, 35.9, `The blast is moving ${MPH} mph.`],
  [40.4, 45.9, 'The wind behind it: 160 mph.'],
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

// ---- the counter: seconds left, real time, hundredths racing; the blast's distance under it ----
export const COUNTERS = [
  {
    from: -3, to: V_WALL + 0.45, label: 'BLAST REACHES YOU IN',
    labelFn: (v) => (v > V_SLOW + 0.05 && v < V_WALL ? 'BLAST REACHES YOU IN  ·  SLOW MOTION' : 'BLAST REACHES YOU IN'),
    fmt: (T) => `${Math.max(0, T).toFixed(2)} s`,
    value: (v) => REAL_HIT - realV(v),
    unit: (v) => `${milesLeft(v).toFixed(2)} MILES AWAY`,
  },
];

// ---- the state at video time v ----
export function state(v) {
  const video = v;
  v = realV(v);
  const s = { v: video, rv: v };
  s.t = tOf(v);
  s.pt = picT(v);
  s.T = REAL_HIT - v;
  s.title = 1 - smooth(2.9, 3.35, video);
  s.cloud = cloudAt(s.pt);
  s.I = lightAt(s.pt);
  s.heat = heatAt(s.pt);
  // the front's distance from ground zero (metres): buildings, cars and the street react to this one number
  s.front = s.t > 0 ? miAt(s.t) * MILE : -1;
  s.left = D_M - s.front;
  // how far the blackout has got from the middle of the city (metres): it crosses the 13 miles to you in 1.2 s
  s.powerR = 32000 * smooth(V_POWER, V_POWER + 2.0, v);
  s.dark = smooth(V_POWER + 0.9, V_POWER + 1.5, v);             // the street's lights are off
  // how much of the jump is happening now (0..1, for the camera kick and the bloom)
  s.kick = 0;
  for (const t of STEPS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.05, dt) * Math.exp(-Math.max(dt, 0) / 0.3)); }
  s.run = smooth(V_RUN, V_RUN + 2, v);
  s.smoke = smooth(V_SMOKE, V_SMOKE + 6, v);
  s.burn = smooth(V_SMOKE + 2, V_BURN + 4, v);
  s.fill = smooth(V_CLOUD, V_CLOUD + 5, v);
  s.close = smooth(V_DROP, REAL_HIT, v);
  s.street = smooth(V_HEAT - 0.5, V_FIRE + 3, v);              // the fire on your street, lighting it
  s.flash = smooth(V_WALL - 0.03, V_WALL + 0.06, video);        // the white, the instant the car hits the lens
  s.flashColor = '#fff6ea';
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
export { lerp };
