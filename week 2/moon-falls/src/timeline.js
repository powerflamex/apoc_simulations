// "What if the Moon fell to Earth?" — the story as functions of VIDEO time v (seconds).
// Night on a rooftop pool deck over the bay. The Moon has stopped orbiting and is falling straight at Earth;
// on the first frame it is 40,000 miles away (6x wider than normal) with 3.4 hours left (radial free fall,
// GM of Earth + Moon). Its pull drags the sea up and floods the city; at ~11,400 miles (the Roche limit, fluid
// estimate ~18,400 km) Earth's gravity tears it apart; the pieces rain down at ~22,000 mph; the biggest one hits
// the horizon and a wall of fire fills the screen with white, which clears onto the first frame (the video loops).
import { smooth, keys, clamp, rng } from './util.js';

export const STORY_START = 0;           // everything here runs on the video clock
export const V_BREAK = 13.0;            // the Moon starts coming apart
export const V_METEORS = 20.5;          // pieces start falling
export const V_IMPACT = 61.0;           // the biggest piece hits the horizon
export const T_SWITCH = 65.0;           // full white; the loop point sits in it
export const LOOP = 0.9;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const V_FLOAT = 1e9;             // (earth-spins' weightlessness: never happens here)
export const ROOF_Y = 60;

// ---- the fall: radial free fall from rest at 384,400 km ----
const GM = 3.986e14 + 4.905e12, R0 = 384.4e6, MI = 1609.34, CONTACT = 6.371e6 + 1.737e6;
const tOf = (r) => { const eta = Math.acos(Math.min(1, Math.max(-1, 2 * r / R0 - 1))); return Math.sqrt(R0 ** 3 / (8 * GM)) * (eta + Math.sin(eta)); };
const T_END = tOf(CONTACT);
const rOfLeft = (left) => {   // distance (m) with `left` seconds to go
  let lo = CONTACT, hi = R0;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (T_END - tOf(m) > left) hi = m; else lo = m; }
  return (lo + hi) / 2;
};
// hours left, laid out on the video clock (a smooth curve in log space; the last pieces fall in the final seconds)
function logCurve(pts) {
  const x = pts.map((p) => p[0]), y = pts.map((p) => Math.log(p[1])), n = pts.length;
  const d = x.slice(1).map((xi, i) => (y[i + 1] - y[i]) / (xi - x[i]));
  const m = y.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i])));
  return (t) => {
    if (t <= x[0]) return Math.exp(y[0] + (t - x[0]) * m[0]);
    if (t >= x[n - 1]) return Math.exp(y[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h, s2 = s * s, s3 = s2 * s;
    return Math.exp((2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1]);
  };
}
const OFF = 0.004;   // (hours; keeps the log curve away from zero)
const leftC = logCurve([[0, 1.07 + OFF], [6, 0.72 + OFF], [V_BREAK, 0.38 + OFF], [V_METEORS, 0.18 + OFF], [52, 0.05 + OFF], [V_IMPACT, OFF]]);
export const hoursLeft = (v) => Math.max(0, leftC(v) - OFF);
export const moonMiles = (v) => rOfLeft(hoursLeft(v) * 3600) / MI;
export const moonSpeedMph = (v) => { const r = moonMiles(v) * MI; return Math.sqrt(2 * GM * (1 / r - 1 / R0)) / 0.44704; };
export const MOON_R_MI = 1079.6;

// the pieces that fall, coming closer and closer: first beyond the horizon, then the islands across the bay, the bay
// itself, the towers across the water, and the water right below us (half a mile out); more keep landing far off the
// whole time. moon.js draws each one as a rock dropping out of the rubble cloud, impacts.js the fire, smoke and
// shockwaves, world.js the damage (towers burning and coming down, islands blasted), audio.mjs the whistles and booms.
const CAM_XZ = [3.4, -12.6];   // (where the camera stands at the rail)
const at = (yawDeg, d) => [-Math.sin(yawDeg * Math.PI / 180) * d, -Math.cos(yawDeg * Math.PI / 180) * d];   // (yaw: degrees left of straight out)
// per kind: column height and width (m), loudness, how hard the ground shakes when the shockwave arrives, rock size
export const KINDS = {
  far: { H: 6000, W: 1900, g: 0.45, amp: 0.12, size: 1.2 },
  bg: { H: 3500, W: 1200, g: 0.22, amp: 0.05, size: 0.8 },
  hill: { H: 1900, W: 700, g: 0.6, amp: 0.45, size: 1.2, ring: 1 },
  bay: { H: 650, W: 230, g: 0.8, amp: 0.8, size: 1.4, ring: 1, water: 1 },
  tower: { H: 320, W: 115, g: 0.9, amp: 1.0, size: 1.5, ring: 1 },
  near: { H: 230, W: 95, g: 1.0, amp: 1.8, size: 1.6, ring: 1, water: 1 },
};
const HITS = [
  [23.6, 'far', ...at(6, 38000)], [25.6, 'far', ...at(19, 42000)], [27.6, 'far', ...at(-5, 34000)],
  [29.6, 'hill', -800, -13000], [31.3, 'hill', 1000, -10000], [33.1, 'hill', -3100, -11500], [34.9, 'hill', -1900, -8000], [36.4, 'hill', 400, -9000],
  [38.3, 'bay', 300, -4500], [40.0, 'bay', -900, -3400], [41.6, 'bay', 250, -2600], [43.1, 'bay', -500, -1900],
  [45.6, 'tower', -529, -1188], [47.4, 'tower', -308, -846], [49.3, 'tower', -751, -1413],
  [51.6, 'near', -80, -650], [53.8, 'near', 170, -1100],
  ...[30.6, 32.3, 35.6, 37.4, 39.2, 42.3, 44.4, 48.5, 50.7, 53.0, 55.2, 56.8, 58.3].map((t, i) => [t, 'bg', ...at(-7 + ((i * 7.31 + 0.2) % 1) * 30, 30000 + ((i * 3.7 + 0.5) % 1) * 15000)]),
];
export const METEORS = (() => {
  const R = rng(4242);
  return HITS.slice().sort((p, q) => p[0] - q[0]).map(([land, kind, x, z]) => {
    const K = KINDS[kind], dist = Math.hypot(x - CAM_XZ[0], z - CAM_XZ[1]);
    const dur = (kind === 'far' || kind === 'bg' ? 3.2 : 2.6) + R() * 0.7;
    const yaw = Math.atan2(-(x - CAM_XZ[0]), -(z - CAM_XZ[1])) * 180 / Math.PI;
    // the shockwave reaches us a few seconds later (sped up; the real one would take minutes)
    const arrive = K.ring ? land + dist / Math.max(700, dist / 4) : land + 1.0;
    return { land, kind, x, z, dist, t0: land - dur, dur, arrive, near: K.amp > 0.7, size: K.size, g: K.g, amp: K.amp, pan: clamp((7 - yaw) / 20, -0.8, 0.8) };
  });
})();
// the ground shaking as each shockwave arrives
export const hitShake = (v) => METEORS.reduce((a, m) => a + (v > m.arrive - 0.05 ? m.amp * smooth(m.arrive - 0.05, m.arrive + 0.05, v) * Math.exp(-Math.max(0, v - m.arrive) * 1.4) : 0), 0);
// the flash of each hit (brightens the whole picture for a moment)
export const hitFlash = (v) => METEORS.reduce((a, m) => a + (v > m.land - 0.02 ? (0.25 + 0.75 * Math.min(m.amp, 1)) * smooth(m.land - 0.02, m.land + 0.04, v) * Math.exp(-Math.max(0, v - m.land) * 3) : 0), 0);

// sea level (m above today's): the Moon's pull drags the ocean up and Earth turns us into the bulge
export const seaLevel = (v) => keys([[1.5, 0], [4.5, 1.6], [8, 9], [12, 18], [20, 26], [40, 33], [V_IMPACT, 38], [80, 40]], v);
export const quake = (v) => smooth(3.5, 6, v) * (0.35 + 0.65 * smooth(V_BREAK, V_IMPACT, v));   // ground shaking

// (earth-spins API kept so the shared world code works: normal spin and gravity, a fixed night sky)
export const spinK = () => 1;
export const dayHours = () => 24;
export const gFrac = () => 1;
export const weightLb = () => 160;
export const hourAngle = () => 205;     // the Sun far below the horizon: deep night
export const storyHours = (v) => v * 0.02;   // (slow cloud drift)
export const camRise = () => 0;

export const titleAt = (v) => 1 - smooth(4.0, 4.8, v);

export const CAPTIONS = [
  [0.3, 3.2, 'The Moon has stopped orbiting. Now it\u2019s falling.'],
  [3.5, 6.6, 'Its pull drags the ocean into the streets.'],
  [6.9, 9.9, 'The city floods. Earthquakes shake every tower.'],
  [10.2, V_BREAK - 0.1, 'It\u2019s 18 times bigger than it should be. And growing.'],
  [V_BREAK + 0.2, 16.6, 'At 11,500 miles, Earth\u2019s gravity tears it apart.'],
  [16.9, V_METEORS, 'The Moon breaks into a cloud of rubble.'],
  [V_METEORS + 0.2, 24.6, 'Pieces the size of countries start to fall.'],
  [25.0, 29.0, 'Every one hits at 22,000 mph.'],
  [29.4, 33.6, 'Each hit: a million times all the nukes on Earth.'],
  [34.0, 37.8, 'The islands across the bay are blown apart.'],
  [38.2, 42.2, 'They\u2019re getting closer. The bay boils.'],
  [42.6, 46.6, 'Shockwaves race across the water at you.'],
  [47.0, 51.0, 'The towers across the bay come down.'],
  [51.4, 55.4, 'The next one hits half a mile away.'],
  [55.8, V_IMPACT - 0.2, 'The biggest one, 500 miles wide, is coming down.'],
];

const pad = (n) => String(n).padStart(2, '0');
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
const fmtLeft = (h) => { const s = Math.max(0, Math.ceil(h * 3600 - 1e-6)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
export const COUNTERS = [
  {
    from: -2, to: V_BREAK, label: 'THE MOON', fmt: fmtInt, value: (v) => moonMiles(v),
    unit: (v) => `MILES AWAY · FALLING AT ${fmtInt(Math.round(moonSpeedMph(v) / 10) * 10)} MPH`,
  },
  {
    from: V_BREAK, to: T_SWITCH, label: 'THE BIGGEST PIECE HITS IN', fmt: fmtLeft, value: (v) => hoursLeft(v),
    unit: (v) => `FALLING AT ${fmtInt(Math.round(moonSpeedMph(v) / 10) * 10)} MPH`,
  },
];

// the sky: Sun, (tiny sky-shader) Moon and stars, same conventions as earth-spins
const LAT = 1.3 * Math.PI / 180, DEC = -6 * Math.PI / 180;
function skyDir(Hdeg, dec, out) {
  const H = Hdeg * Math.PI / 180;
  const u = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H);
  const n = Math.cos(LAT) * Math.sin(dec) - Math.sin(LAT) * Math.cos(dec) * Math.cos(H);
  const e = -Math.cos(dec) * Math.sin(H);
  out[0] = n; out[1] = u; out[2] = e;
  return out;
}
// where the falling Moon hangs: over the bay, a little left of straight ahead (camera yaw +10 deg), 26.5 deg up (above the title on frame 0)
const MOON_YAW = 10 * Math.PI / 180, MOON_EL = 26.5 * Math.PI / 180;
export const MOON_DIR = [-Math.sin(MOON_YAW) * Math.cos(MOON_EL), Math.sin(MOON_EL), -Math.cos(MOON_YAW) * Math.cos(MOON_EL)];

export function state(v) {
  const s = { v };
  s.H = hourAngle(v);
  s.k = 1; s.dayHours = 24; s.g = 1; s.weight = 160;
  s.sun = skyDir(s.H, DEC, [0, 0, 0]);
  s.moon = MOON_DIR.slice();                       // (the big Moon is its own mesh; this drives the moonlight)
  s.pole = [Math.cos(LAT), Math.sin(LAT), 0];
  s.starRot = s.H * Math.PI / 180;
  s.skySpeed = 0;
  s.hours = storyHours(v);
  s.day = 0; s.twilight = 0; s.cityLights = 1;
  s.sea = seaLevel(v);
  s.float = 0; s.lift = 0; s.camRise = 0;
  s.miles = moonMiles(v);
  s.moonAng = Math.atan(MOON_R_MI / s.miles);      // angular radius (rad)
  s.crack = smooth(V_BREAK - 3.5, V_BREAK + 1.5, v);
  s.breakup = smooth(V_BREAK, V_BREAK + 9, v);
  s.quake = quake(v);
  s.moonLit = smooth(-2, V_BREAK, v) * (1 - smooth(V_BREAK, V_BREAK + 3, v) * 0.6);   // moonlight on the city, growing with the Moon
  s.fire = smooth(V_IMPACT, T_SWITCH, v);          // the wall of fire after the impact
  s.cloud = 0;
  s.flash = Math.max(smooth(V_IMPACT + 0.6, T_SWITCH, v), smooth(V_IMPACT - 0.05, V_IMPACT + 0.05, v) * (1 - smooth(V_IMPACT + 0.1, V_IMPACT + 0.7, v)) * 0.6);
  s.flashColor = '#fff8ee';
  s.title = titleAt(v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}

export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.5);
      const fadeOut = clamp((b - v) / 0.5);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}
