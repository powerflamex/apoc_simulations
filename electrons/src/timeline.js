// "What if every electron disappeared?" — the story as functions of VIDEO time v (seconds).
// Noon at Shibuya Crossing, Tokyo. At V_EVENT every electron on Earth vanishes (for good). Electricity is
// electrons, so every screen dies; nothing is left to scatter or stop light, so the sky goes black at noon and
// everything turns see-through (drawn as glowing outlines). Every atom is now a bare nucleus, pure positive
// charge, and like charges repel: the coin in your pocket holds ~7,500 Tsar Bombas, your body as much energy as
// the Sun gives off in ~7 minutes (uniform-charge estimates). Everything turns white. From space: Earth bursts
// apart at almost the speed of light (~7e67 J, far more than its own mass-energy); 1.28 s later the blast hits
// the Moon, 8 min 19 s later the Sun, then the planets. It fills the screen with white, which clears onto the
// first frame (the video loops).
import { smooth, keys, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const V_EVENT = 2.0;             // the electrons vanish
export const V_REPEL = 19.3;            // atoms start pushing apart (sparks, swelling)
export const V_WHITE = 30.4;            // the street burns white
export const V_SPACE = 31.4;            // cut to Earth from space
export const V_MOON = 37.8;             // the blast reaches the Moon (1.28 s)
export const V_SOLAR = 39.4;            // pull back to the solar system
export const V_SUNHIT = 44.6;           // ...reaches the Sun (8 min 19 s)
export const T_SWITCH = 62.0;           // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;

// time since the electrons vanished (seconds), as a smooth curve in log space through these keys
const TAU = [[V_EVENT, 1e-11], [V_EVENT + 0.6, 4e-10], [V_REPEL, 1.4e-8], [V_WHITE, 3.2e-8], [V_SPACE, 0.0004], [V_SPACE + 4, 0.03],
  [V_MOON, 1.28], [V_SOLAR, 20], [V_SUNHIT, 499], [50.6, 2580], [56.0, 14400], [T_SWITCH, 60000], [80, 2e6]];
function logCurve(pts) {   // monotone cubic (Fritsch-Carlson) in log space
  const x = pts.map((p) => p[0]), y = pts.map((p) => Math.log(p[1])), n = pts.length;
  const d = x.slice(1).map((xi, i) => (y[i + 1] - y[i]) / (xi - x[i]));
  const m = y.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i])));
  return (t) => {
    if (t <= x[0]) return Math.exp(y[0]);
    if (t >= x[n - 1]) return Math.exp(y[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h, s2 = s * s, s3 = s2 * s;
    return Math.exp((2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1]);
  };
}
const tauC = logCurve(TAU);
export const tauAt = (v) => (v < V_EVENT ? v - V_EVENT : tauC(v));
// how fast story time runs compared to the video (shown on the badge)
export const rateAt = (v) => (v < V_EVENT ? 1 : (tauC(v + 0.01) - tauC(v - 0.01)) / 0.02);

export const CAPTIONS = [
  [V_EVENT + 0.15, 4.7, 'Every electron on Earth just vanished.'],
  [5.0, 8.3, 'No electrons, no electricity. Every screen in Tokyo dies.'],
  [8.6, 11.9, 'Nothing scatters sunlight now. The sky goes black at noon.'],
  [12.2, 15.5, 'Light passes straight through everything. Even the people around you.'],
  [15.8, 19.0, 'Every atom is now pure positive charge.'],
  [V_REPEL, 22.6, 'And positive charges push each other apart.'],
  [22.9, 26.6, 'The coin in your pocket now holds 7,500 of the biggest nukes ever built.'],
  [26.9, V_WHITE, 'Your body: as much energy as the Sun puts out in 7 minutes.'],
  [V_SPACE + 0.4, 35.6, 'Earth bursts apart at almost the speed of light.'],
  [36.0, 39.2, '1.3 seconds later, it hits the Moon.'],
  [V_SOLAR + 0.4, 44.3, '8 minutes later, it reaches the Sun.'],
  [V_SUNHIT + 0.3, 48.4, 'The Sun is torn apart too.'],
  [48.8, 53.4, '43 minutes: Jupiter. 4 hours: Neptune.'],
  [53.8, 58.6, 'All because of one missing particle.'],
  [58.9, T_SWITCH - 0.6, 'What should disappear next?'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.35), fadeOut = clamp((b - v) / 0.35);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter ----
const pad = (n, w = 2) => String(n).padStart(w, '0');
function fmtTau(t) {
  if (t < 1e-6) {   // billionths of a second, written out so the last digits race
    const s = t.toFixed(13);   // 0.0000000123456
    return `${s.slice(0, 5)} ${s.slice(5, 8)} ${s.slice(8, 11)} ${s.slice(11, 15)} s`;
  }
  if (t < 1) return `${t.toFixed(4)} s`;
  if (t < 60) return `${t.toFixed(2)} s`;
  const m = Math.floor(t / 60), sec = Math.floor(t % 60);
  if (t < 3600) return `${m} min ${pad(sec)} s`;
  return `${Math.floor(t / 3600)} h ${pad(Math.floor((t % 3600) / 60))} min`;
}
const fmtRate = (r) => {
  if (r < 1) { const k = 1 / r; return `SLOW MOTION ${k >= 1e6 ? `×${(k / 1e9 >= 1 ? Math.round(k / 1e9) + ' BILLION' : Math.round(k / 1e6) + ' MILLION')}` : '×' + Math.round(k).toLocaleString('en-US')}`; }
  if (r < 1.6) return 'REAL TIME';
  return `TIME-LAPSE ×${Math.round(r).toLocaleString('en-US')}`;
};
function note(v, t) {
  if (v < V_REPEL) return 'ELECTRONS LEFT ON EARTH: 0';
  if (v < V_WHITE) return 'EVERY NUCLEUS PUSHING ON EVERY OTHER';
  if (v < V_SPACE + 4) return 'EARTH: COMING APART';
  if (v < V_MOON) return 'THE BLAST: ON ITS WAY TO THE MOON';
  if (v < V_SUNHIT) return v < V_SOLAR ? 'THE MOON: GONE' : 'THE BLAST: ON ITS WAY TO THE SUN';
  if (v < 50.6) return 'THE SUN: GONE';
  return 'THE BLAST: CROSSING THE SOLAR SYSTEM';
}
export const COUNTERS = [
  {
    from: -3, to: V_EVENT, label: 'ELECTRONS DISAPPEAR IN', fmt: (x) => `${x.toFixed(1)} s`, value: (v) => Math.max(0, V_EVENT - v),
    unit: () => 'SHIBUYA CROSSING · TOKYO · 12:00 NOON',
  },
  {
    from: V_EVENT, to: T_SWITCH, label: 'TIME SINCE THEY VANISHED', fmt: fmtTau, value: (v) => tauAt(v),
    unit: (v) => note(v, tauAt(v)),
    badge: (v) => fmtRate(rateAt(v)),
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.tau = tauAt(v);
  s.scene = v < V_SPACE ? 'street' : v < V_SOLAR ? 'earth' : 'solar';
  s.gone = v >= V_EVENT ? 1 : 0;                                  // electrons gone: the ghost look
  s.repel = smooth(V_REPEL, V_WHITE, v);                           // sparks, swelling, glowing brighter
  s.flash = Math.max(
    smooth(V_EVENT - 0.02, V_EVENT, v) * (1 - smooth(V_EVENT, V_EVENT + 0.25, v)) * 0.6,   // the instant they vanish
    smooth(V_WHITE - 1.2, V_WHITE, v) * (1 - smooth(V_SPACE - 0.05, V_SPACE + 0.6, v)),     // the street burns white
    smooth(V_SUNHIT - 0.05, V_SUNHIT + 0.1, v) * (1 - smooth(V_SUNHIT + 0.15, V_SUNHIT + 0.9, v)) * 0.5,
    smooth(T_SWITCH - 2.4, T_SWITCH, v),
  );
  s.flashColor = '#f7f9ff';
  s.title = 1 - smooth(3.4, 4.2, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
