// "What if Earth spun 17 times faster?" — the story as functions of VIDEO time v (seconds).
// You're on a rooftop pool deck in Singapore (1.3° N, almost on the equator), looking west over the bay.
// Physics: the ground at the equator moves at 1,037 mph. Earth (air and oceans included) spins up, so a day
// gets shorter: T = 24 h / k. Your weight is gravity minus the centrifugal pull: W = 160 lb * (g0 - k² w0² R) / g_now,
// with g0 = 9.814 m/s² (gravity alone at the equator) and w0² R = 0.03373 m/s². It reaches 0 at k = 17.06:
// a day of 1 h 24 min, ground speed 17,700 mph, the orbital speed at the surface.
// The video is a time-lapse: the Sun's hour angle H(v) is laid out directly (so day and night come faster and faster,
// then time slows for the float), and story time follows from it: dt = dH / (15° per hour * k).
import { smooth, keys, clamp } from './util.js';

export const DURATION = 64;
export const STORY_START = 0;           // everything here runs on the video clock
export const V_FLOAT = 53.5;            // you weigh nothing
export const T_SWITCH = 62.0;           // full white (inside the cloud); the loop point sits in it
export const LOOP = 0.9;                // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

export const G0 = 9.814, W0R = 0.03373, G_NOW = G0 - W0R;
export const K_FLOAT = Math.sqrt(G0 / W0R);           // 17.06
export const MPH_NOW = 1037;

// ---- spin: day length (hours) through the video, smooth in log space ----
function logCurve(pts) {   // monotone cubic (Fritsch-Carlson) in log space: never stalls between keys
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
const T_FLOAT = 24 / K_FLOAT;
const dayLen = logCurve([[0, 24], [6, 17.5], [12.6, 12], [21, 6], [29, 3.3], [35, 2.0], [44, 1.6], [V_FLOAT, T_FLOAT], [62, 1.385]]);
export const dayHours = (v) => (v <= 0 ? 24 : dayLen(v));
export const spinK = (v) => 24 / dayHours(v);

// ---- the Sun's hour angle (degrees): how fast it crosses the sky on screen ----
// (the Sun slows down around 21-23 s so the sunrise over the flood takes about 0.7 s instead of a blink)
const OMEGA = [[-3, 7], [0, 7], [2, 20], [5, 36], [12, 48], [20.6, 58], [21.4, 24], [23.0, 24], [24.2, 66], [32, 85], [40, 115], [46, 138], [49, 80], [51.5, 18], [V_FLOAT, 1.2], [70, 1.0]];
const H0 = 80;                 // frame 0: golden hour, the Sun 10° up in the west
const H_FLOAT = 70;            // and it ends up low and golden for the float (the loop lands on the same light)
const DV = 1 / 240, V0 = -4, V1 = 72;
const NS = Math.round((V1 - V0) / DV) + 1;
const Htab = new Float64Array(NS), Ttab = new Float64Array(NS);
{
  const omega = (v) => keys(OMEGA, v);
  const bump = (v) => { const x = clamp((v - 34) / 12); return x * (1 - x) * 6 / 12; };   // integrates to 1 over 34..46
  // first pass: where would the Sun be at the float? then add just enough extra turn in 34..46 to land it on H_FLOAT
  let H = 0;
  for (let v = 0; v < V_FLOAT - 1e-9; v += DV) H += omega(v + DV / 2) * DV;
  const extra = (((H0 + H - H_FLOAT) % 360) + 360) % 360;
  const add = extra < 1 ? 0 : 360 - extra;
  const rate = (v) => omega(v) + add * bump(v);
  const i0 = Math.round(-V0 / DV);
  Htab[i0] = H0; Ttab[i0] = 0;
  for (let i = i0 + 1; i < NS; i++) {
    const v = V0 + (i - 0.5) * DV, w = rate(v);
    Htab[i] = Htab[i - 1] + w * DV;
    Ttab[i] = Ttab[i - 1] + (w * DV) / (15 * spinK(v));
  }
  for (let i = i0 - 1; i >= 0; i--) {
    const v = V0 + (i + 0.5) * DV, w = rate(v);
    Htab[i] = Htab[i + 1] - w * DV;
    Ttab[i] = Ttab[i + 1] - (w * DV) / (15 * spinK(v));
  }
}
const look = (tab, v) => {
  const f = clamp((v - V0) / DV, 0, NS - 1.001), i = Math.floor(f), a = f - i;
  return tab[i] * (1 - a) + tab[i + 1] * a;
};
export const hourAngle = (v) => look(Htab, v);          // degrees, 0 = noon, + = afternoon (west)
export const storyHours = (v) => look(Ttab, v);         // hours since the first frame
const TAU_FLOAT = storyHours(V_FLOAT);
export const floatIn = (v) => Math.max(0, TAU_FLOAT - storyHours(v));   // hours until you weigh nothing

export const weightLb = (v) => Math.max(0, 160 * (G0 - W0R * spinK(v) ** 2) / G_NOW);
export const gFrac = (v) => (G0 - W0R * spinK(v) ** 2) / G_NOW;          // felt gravity (can go below 0 after the float)

// sea level (m above today's): the oceans pile up toward the equator
export const seaLevel = (v) => keys([[15, 0], [20, 1.2], [26, 6], [33, 15], [41, 26], [48, 34], [V_FLOAT, 39], [62, 41]], v);

// camera altitude after the float (m above the deck) and the cloud you drift into
export const ROOF_Y = 60;
export const camRise = (v) => {
  const d = v - (V_FLOAT + 0.6);
  return d <= 0 ? 0 : 0.6 * d * d + 0.3 * d * d * d;   // about as fast as everything else floating up, so it stays around you
};

export const titleAt = (v) => 1 - smooth(4.0, 4.8, v);   // fully up on the first frame

// Narration (italic serif, lower middle), VIDEO clock. [start, end, text]
export const CAPTIONS = [
  [-0.6, 3.4, "You're in Singapore. The ground under you moves east at 1,037 mph."],
  [3.8, 6.6, 'Now Earth starts spinning faster.'],
  [7.0, 10.4, 'Every day is shorter than the last.'],
  [12.6, 16.0, 'A day now lasts 12 hours.'],
  [17.6, 21.6, 'The oceans are pulled toward the equator.'],
  [22.6, 27.2, 'The sea starts climbing the towers.'],
  [34.4, 38.4, 'At a 2-hour day, you weigh half as much.'],
  [39.2, 43.2, 'Every step turns into a slow, high bounce.'],
  [44.0, 48.0, 'Loose things start to drift off the ground.'],
  [48.6, 53.2, 'At 1 hour 24 minutes, the ground moves at 17,700 mph. Orbit speed.'],
  [53.6, 56.4, 'You weigh nothing.'],
  [56.9, 60.6, 'And everything floats up into the sky.'],
];

const pad = (n) => String(n).padStart(2, '0');
const fmtClock = (h) => {
  const s = Math.max(0, Math.floor(h * 3600));
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};
const fmtDay = (v) => {
  const m = Math.round(dayHours(v) * 60);
  return `ONE DAY LASTS ${Math.floor(m / 60)} H ${pad(m % 60)} MIN`;
};
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export const COUNTERS = [
  {
    from: -2, to: V_FLOAT + 0.3, label: 'YOU FLOAT AWAY IN', fmt: fmtClock, value: floatIn,
    unit: (v) => (v < 30.5 ? fmtDay(v) : `YOU WEIGH ${Math.round(weightLb(v))} POUNDS`),
  },
  {
    from: V_FLOAT + 0.3, to: T_SWITCH, label: 'YOUR ALTITUDE', unit: 'FEET', fmt: fmtInt,
    value: (v) => (ROOF_Y + 1.7 + camRise(v)) / 0.3048,
  },
];

// ---- the sky: Sun, Moon and stars for Singapore, early October ----
const LAT = 1.3 * Math.PI / 180, DEC = -6 * Math.PI / 180, MOON_DEC = -12 * Math.PI / 180;
// world axes: -z = west (we look west over the bay), +x = north, +y = up
function skyDir(Hdeg, dec, out) {
  const H = Hdeg * Math.PI / 180;
  const u = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H);
  const n = Math.cos(LAT) * Math.sin(dec) - Math.sin(LAT) * Math.cos(dec) * Math.cos(H);
  const e = -Math.cos(dec) * Math.sin(H);
  out[0] = n; out[1] = u; out[2] = e;
  return out;
}

export function state(v) {
  const s = { v };
  s.H = hourAngle(v);
  s.k = spinK(v);
  s.dayHours = dayHours(v);
  s.g = gFrac(v);
  s.weight = weightLb(v);
  s.sun = skyDir(s.H, DEC, [0, 0, 0]);
  s.moon = skyDir(s.H - 130, MOON_DEC, [0, 0, 0]);
  s.pole = [Math.cos(LAT), Math.sin(LAT), 0];
  s.starRot = s.H * Math.PI / 180;
  // how fast the sky turns on screen (rad per video second) -> length of the Sun's streak and the star trails
  s.skySpeed = (hourAngle(v + 0.02) - hourAngle(v - 0.02)) / 0.04 * Math.PI / 180;
  s.hours = storyHours(v);
  const sunUp = s.sun[1];
  // (wide ranges: in the fast time-lapse a sunrise or sunset takes about half a second instead of a blink;
  // full day is reached by 10° up, so frame 0's golden hour looks the same)
  s.day = smooth(-0.3, 0.17, sunUp);              // 0 deep night .. 1 full day
  s.twilight = Math.exp(-Math.pow(sunUp / 0.09, 2)); // golden/blue hour around sunrise and sunset
  s.cityLights = 1 - smooth(-0.14, 0.1, sunUp);   // windows switch on block by block as it gets dark
  s.sea = seaLevel(v);
  s.float = smooth(V_FLOAT - 9, V_FLOAT, v);       // loose things drifting
  s.lift = Math.max(0, v - V_FLOAT);               // seconds since you weigh nothing
  s.camRise = camRise(v);
  s.cloud = smooth(58.4, 61.6, v);                 // you drift into a cloud: white fog, then full white
  s.flash = smooth(60.6, T_SWITCH, v);
  s.flashColor = '#fbfaf7';
  s.title = titleAt(v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}

export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.55);
      const fadeOut = clamp((b - v) / 0.55);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}
