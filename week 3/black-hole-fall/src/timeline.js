// "What if you fell into a black hole?" — the story as functions of VIDEO time v (seconds).
// You fall straight into Sagittarius A*, the black hole at the centre of our galaxy (4 million Suns; its edge,
// the event horizon, is r_s = 11.8 million km from the centre). You started from far away, so at distance r you
// fall at beta = sqrt(r_s / r) of light speed (measured by someone holding still there): 22% at frame 0, 30% ... 90%, one gold
// stamp per 10% (the beat), and the counter races to the finish line, the edge.
// Outside the edge the clock is a time-lapse that slows to real time exactly at the edge (39 minutes of your
// time in 36.6 s). Inside, the rest is real time: from the edge to the centre takes (2/3) r_s / c = 26.3 s.
// Firing your thrusters only shortens it (in a black hole the centre is in your future, not in a direction):
// the countdown loses 3 s while you burn. Tides only matter in the last tenth of a second (the pull on your feet
// beats the pull on your head by ~10 g at 0.1 s, a million g at the end): that tenth plays in slow motion, you
// are stretched into a thread, and everything ends in white (the loop point).
// Lengths are in units of r_s (r = 1 is the edge) unless named in km.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const RS_KM = 11.8e6;
export const RS_C = 39.4;                // r_s / c in seconds
export const T_IN = (2 / 3) * RS_C;      // 26.3 s from the edge to the centre

// ---- the big moments (video time) ----
export const STEP = 5.0;
export const V_FIRST = 1.6;              // 30% of light speed
export const V_EDGE = V_FIRST + 7 * STEP;   // 36.6: the edge (100%)
export const V_WIDE0 = 30.8, V_WIDE1 = 35.9;   // the shot from far away: you freeze at the edge and fade to red
export const V_BURN0 = 47.4, BURN = 3.0, BURN_LOSS = 3.0;   // thrusters: the countdown runs at 2x for 3 s
export const V_BURN1 = V_BURN0 + BURN;
export const SLOW_LEFT = 0.1;            // the last 0.1 s of your time ...
export const SLOW = 3.0;                 // ... take 3 s of video (30x slow motion)
export const V_SLOW = V_EDGE + (T_IN - SLOW_LEFT) - BURN_LOSS;   // 59.8
export const V_END = V_SLOW + SLOW;      // 62.8: the centre
export const T_SWITCH = V_END + 0.25;    // full white; the loop point sits in it
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

// ---- outside: speed (fraction of light) as a smooth monotone curve through the stamps ----
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
const BETA_KEYS = [[-2, 0.2], [0, 0.22]];
for (let k = 0; k <= 7; k++) BETA_KEYS.push([V_FIRST + k * STEP, 0.3 + 0.1 * k]);
const betaCurve = pchip(BETA_KEYS);
export const STAMPS = BETA_KEYS.slice(2).map(([v, b]) => ({ v, text: b < 0.999 ? `${Math.round(b * 100)}%` : 'THE EDGE', label: b < 0.999 ? 'OF LIGHT SPEED' : 'NO WAY BACK' }));
STAMPS.push({ v: V_BURN1, text: `−${BURN_LOSS} s`, label: 'TIME LEFT' });

// remaining proper time (s) until the centre, by video time
export function timeLeft(v) {
  if (v < V_EDGE) {
    const r = 1 / Math.pow(betaCurve(v), 2);
    return (2 / 3) * RS_C * Math.pow(r, 1.5);
  }
  let left = T_IN - (v - V_EDGE);
  left -= (BURN_LOSS / BURN) * clamp(v - V_BURN0, 0, BURN);           // the burn eats 3 s
  if (v > V_SLOW) left = SLOW_LEFT * (1 - clamp((v - V_SLOW) / SLOW));  // the last tenth, slowly
  return Math.max(0, left);
}
// distance from the centre in r_s: r^1.5 = 1.5 * (time left in r_s/c)
export const rAt = (v) => (v < V_EDGE ? 1 / Math.pow(betaCurve(v), 2) : Math.pow(1.5 * timeLeft(v) / RS_C, 2 / 3));
export const betaAt = (v) => (v < V_EDGE ? betaCurve(v) : 1);

export const CAPTIONS = [
  [0.4, 2.9, 'You’re falling into the black hole at our galaxy’s center.'],
  [3.2, 5.8, 'It weighs as much as 4 million Suns.'],
  [6.3, 8.9, 'The hole itself is 17 times wider than the Sun.'],
  [9.2, 11.4, 'Gas whirls around it at half the speed of light.'],
  [11.8, 14.4, 'Now you’re falling at half the speed of light too.'],
  [14.8, 17.4, 'Gravity bends the disk’s light over the top.'],
  [17.8, 20.4, 'The glowing disk fills half your sky.'],
  [20.8, 23.4, 'Clocks back home now tick twice as fast as yours.'],
  [23.8, 26.4, 'Starlight from behind it bends into a ring.'],
  [26.8, 30.4, 'Here, light itself goes around in circles.'],
  [30.8, 33.3, 'Seen from far away, you’d freeze at the edge,'],
  [33.5, 35.9, 'fade to red, and never seem to fall in.'],
  [37.0, 39.6, 'For you, there’s no wall. You feel nothing.'],
  [40.0, 42.6, 'But nothing gets out of here. Not even light.'],
  [43.0, 45.6, 'The whole universe shrinks into a circle above you.'],
  [46.0, 48.6, 'You fire your thrusters to get away.'],
  [49.0, 51.6, 'It only gets you there faster.'],
  [52.0, 54.6, 'The center isn’t ahead of you. It’s in your future.'],
  [55.0, 57.4, 'Your feet are pulled harder than your head.'],
  [57.6, 59.6, 'In the last tenth of a second…'],
  [59.9, 62.6, '…you’re stretched thinner than a hair.'],
];

export function captionAt(v) {
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
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
const fmtKm = (km) => `${fmtInt(km < 1e6 ? km : Math.round(km / 1000) * 1000)} km`;
const fmtLeft = (s) => (s >= 10 ? `${s.toFixed(1)} s` : `${s.toFixed(2)} s`);
export const COUNTERS = [
  {
    from: -3, to: V_EDGE, label: 'DISTANCE TO THE EDGE',
    fmt: (km) => fmtKm(km),
    value: (v) => Math.max(0, (rAt(v) - 1) * RS_KM),
    unit: (v) => `SPEED: ${Math.round(betaAt(v) * 100)}% OF LIGHT`,
    badge: () => 'AT 0 KM: NO WAY BACK',
  },
  {
    from: V_EDGE, to: T_SWITCH + 2, label: 'TIME LEFT',
    fmt: (s) => fmtLeft(s),
    value: (v) => timeLeft(v),
    unit: (v) => (v < V_SLOW ? 'UNTIL THE CENTER · REAL TIME' : 'UNTIL THE CENTER · SLOW MOTION 30×'),
    badge: () => 'AT 0: THE CENTER',
  },
];

export function stampAt(v) {   // the big gold number at each beat: { text, label, a, dt }
  for (let i = STAMPS.length - 1; i >= 0; i--) {
    const st = STAMPS[i], dt = v - st.v;
    if (dt >= 0 && dt < 2.4) return { text: st.text, label: st.label, a: Math.min(clamp(dt / 0.08), clamp((2.4 - dt) / 0.5)), dt };
  }
  return null;
}
// how hard the camera jolts right now (decays after each beat)
export function joltAt(v) {
  let j = 0;
  for (const st of STAMPS) { const dt = v - st.v; if (dt >= 0 && dt < 1.5) j = Math.max(j, Math.exp(-dt * 4) * (st.text === 'THE EDGE' ? 1.6 : 1)); }
  return j;
}

// ---- state ----
export function state(v) {
  const s = { v };
  s.r = rAt(v);
  s.beta = betaAt(v);
  s.left = timeLeft(v);
  s.inside = v >= V_EDGE ? 1 : 0;
  s.wide = v >= V_WIDE0 && v < V_WIDE1 ? 1 : 0;
  // inside: the circle of sky above you shrinks (1 = as at the edge), then is torn into a thin ring at the end
  s.shrink = 1 + 1.6 * smooth(V_EDGE, V_SLOW, v) + 2.5 * smooth(V_SLOW, V_END, v);
  s.ring = smooth(V_SLOW + 0.25, V_END - 0.6, v);
  s.burn = smooth(V_BURN0, V_BURN0 + 0.25, v) * (1 - smooth(V_BURN1 - 0.3, V_BURN1, v));
  s.stretch = Math.pow(smooth(V_SLOW, V_END, v), 1.6);       // spaghetti
  s.flash = smooth(V_END - 0.3, T_SWITCH - 0.03, v);
  s.flashColor = '#fdfbff';
  s.title = 1 - smooth(3.0, 3.8, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
