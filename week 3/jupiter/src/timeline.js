// "What if you stood on Jupiter?" — the story as functions of VIDEO time v (seconds).
// There is no ground: you step off the cloud tops and sink, and the depth counter races from frame 0 to the
// finish line on screen (liquid metal at 20,000 km). Every few seconds something gets worse:
//   heavier (2.53 g at the cloud tops) -> 350 mph wind, the Sun racing across a 10-hour day and setting ->
//   the white ammonia clouds (-130°C, frost on the visor) -> the brown clouds (the daylight fades) ->
//   the water clouds: thunderstorms taller than Everest, lightning -> pitch black, Galileo's probe (150 km,
//   lost on Dec 7, 1995 after 58 minutes, ~22 bar, ~150°C) -> the pressure of the deepest ocean (~1,000 bar)
//   and the air glowing red-hot -> diamonds may rain -> the air thickens into an ocean with no surface ->
//   liquid metallic hydrogen, hotter than the Sun's surface -> white. The white clears onto the first frame.
// Depth is counted from the cloud tops where you start. The pressure/temperature profile below follows the
// Galileo probe data down to 22 bar and interior models (e.g. Guillot 1999) below: ~1 Mbar near 8,000 km,
// ~4 Mbar and ~8,000 K near 20,000 km (0.71 Jupiter radii, inside the metallic-hydrogen layer).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;            // everything here runs on the video clock
export const T_SWITCH = 69.6;            // full white; the loop point sits in it
export const LOOP = 0.9;                 // the white clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const WEIGHT_LB = 150;

// ---- the big moments (video time) ----
export const V_WIND = 8.8;               // the jet stream hits you
export const V_SUNSET = 16.6;            // the Sun touches the cloud tops
export const V_CLOUD1 = 16.6;            // into the white ammonia clouds
export const V_OUT1 = 19.8;              // out under them
export const V_CLOUD2 = 23.4;            // into the brown clouds
export const V_OUT2 = 27.0;              // out under them: the storm layer
export const V_STORM = 27.6;             // lightning starts
export const V_BASE3 = 33.6;             // below the storm clouds: rain, then black
export const V_LAMP = 35.4;              // your helmet light comes on
export const V_PROBE = 38.0;             // Galileo's probe
export const V_GLOW = 42.6;              // the air starts to glow
export const V_CRACK = 48.6;             // your visor cracks
export const V_DIAMOND = 53.4;           // diamonds
export const V_OCEAN = 59.6;             // the air turns into an ocean
export const V_METAL = 65.0;             // liquid metal
export const V_WHITE = 67.6;             // white-hot -> white

// ---- depth (km below the cloud tops) as a smooth, always-accelerating-or-steady curve ----
// monotone cubic (Fritsch-Carlson) through [v, log10(depth + 0.01)]: the counter never stalls at a key
const DEPTH_KEYS = [
  [-1.2, 0], [0, 0.012], [1, 0.05], [3, 0.35], [6, 1.6], [9, 4], [12.5, 7], [16.5, 10.6], [19.5, 16.5],
  [23.5, 32], [27, 43], [30, 62], [33.5, 82], [38, 150], [42, 280], [46, 500], [50, 900], [54, 2500],
  [60, 8000], [64.8, 20000], [67.6, 21800], [72, 26000],
];
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
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  };
}
const logDepth = pchip(DEPTH_KEYS.map(([v, d]) => [v, Math.log10(d + 0.01)]));
export const depthAt = (v) => Math.max(0, Math.pow(10, logDepth(v)) - 0.01);

// ---- pressure (bar) and temperature (°C) by depth ----
const PROFILE = [   // depth km, pressure bar, temperature °C
  [0, 0.4, -150], [12, 0.7, -130], [20, 1, -110], [40, 2, -70], [75, 5, 0], [150, 22, 150], [500, 1000, 1000],
  [900, 3000, 1500], [2500, 50000, 2500], [8000, 1e6, 4700], [20000, 4e6, 7700], [32000, 7e6, 9500],
];
function profile(d) {
  const x = Math.log10(d + 1);
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = PROFILE[i], b = PROFILE[i + 1];
    const xa = Math.log10(a[0] + 1), xb = Math.log10(b[0] + 1);
    if (x <= xb || i === PROFILE.length - 2) {
      const k = clamp((x - xa) / (xb - xa));
      return { p: Math.pow(10, lerp(Math.log10(a[1]), Math.log10(b[1]), k)), t: lerp(a[2], b[2], k) };
    }
  }
}
export const pressureAt = (v) => profile(depthAt(v)).p;
export const tempAt = (v) => profile(depthAt(v)).t;

export const CAPTIONS = [
  [0.9, 3.3, 'There’s no ground. You start sinking.'],
  [3.5, 5.9, 'Gravity is 2.5× Earth’s. You weigh 380 lb.'],
  [6.1, 8.5, 'The air is hydrogen. Your suit is all you have.'],
  [8.9, 11.3, '350 mph winds throw you sideways.'],
  [11.5, 13.9, 'A day here lasts just 10 hours.'],
  [14.1, 16.4, 'The Sun sets. You fall into the clouds.'],
  [16.8, 19.2, 'Ammonia clouds: −130°C.'],
  [19.4, 21.8, 'Colder than anywhere on Earth.'],
  [22.0, 24.4, 'Then brown clouds. The light fades.'],
  [24.6, 27.0, 'No sunlight gets below here.'],
  [27.4, 29.8, 'Thunderstorms taller than Mount Everest.'],
  [30.0, 32.4, 'Lightning everywhere around you.'],
  [32.6, 35.0, 'Under the storms: warm rain. The ice melts.'],
  [35.4, 37.8, 'Pitch black. You turn on your light.'],
  [38.0, 40.4, '150 km down: NASA’s Galileo probe died here.'],
  [40.6, 43.0, 'It went silent in 1995, after 58 minutes.'],
  [43.2, 45.6, 'You keep falling.'],
  [45.8, 48.2, 'The pressure of the deepest ocean on Earth.'],
  [48.4, 50.8, 'The air is so hot it glows: 1,500°C.'],
  [51.0, 53.2, 'Your visor can’t take it.'],
  [53.6, 56.0, 'Scientists think it may rain diamonds here.'],
  [56.2, 58.6, 'Still no ground.'],
  [58.8, 61.2, 'The air thickens into an ocean.'],
  [61.4, 63.8, 'But there’s no surface to hit.'],
  [64.0, 67.6, '20,000 km down: liquid metal, hotter than the Sun’s surface.'],
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
export const fmtDepth = (d) => (d < 1 ? `${fmtInt(d * 1000)} m` : d < 10 ? `${d.toFixed(1)} km` : `${fmtInt(d)} km`);
const fmtP = (p) => (p < 9.95 ? p.toFixed(1) : p < 1e6 ? fmtInt(p < 1000 ? p : Math.round(p / 100) * 100) : fmtInt(Math.round(p / 1e5) * 1e5));
const fmtT = (t) => `${t < 0 ? '−' : ''}${fmtInt(Math.abs(t < 1000 ? Math.round(t) : Math.round(t / 10) * 10))}°C`;
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'DEPTH',
    fmt: (d) => fmtDepth(d),
    value: (v) => depthAt(v),
    unit: (v) => `${fmtT(tempAt(v))} · PRESSURE ${fmtP(pressureAt(v))} ATM`,
    badge: (v) => (depthAt(v) < 20000 ? 'LIQUID METAL AT 20,000 KM' : ''),   // the finish line the number races toward
  },
];

// ---- lightning: [video time, x km, y km, z km, strength] (camera-relative x/z; y is altitude) ----
export const BOLTS = (() => {
  const out = [];
  let a = 9171;
  const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let t = V_STORM; t < V_BASE3 + 3.4;) {
    const k = smooth(V_STORM, 30, t) * (1 - smooth(V_BASE3 + 0.5, V_BASE3 + 3.4, t));
    const ang = (r() - 0.5) * 2.6, dist = 4 + r() * 12;
    out.push([t, Math.sin(ang) * dist, -60 - r() * 14, -Math.cos(ang) * dist - 2, 0.6 + 0.8 * r() * (0.4 + 0.6 * k)]);
    t += 0.18 + r() * 0.5 / (0.3 + k);
  }
  return out;
})();
export function boltsAt(v) {   // the up-to-4 strongest flashes lit right now: [x, y, z, intensity]
  const lit = [];
  for (const [t, x, y, z, g] of BOLTS) {
    const dt = v - t;
    if (dt < 0 || dt > 0.6) continue;
    // a quick double flicker, then a fading afterglow
    const e = (Math.exp(-dt * 9) + 0.6 * Math.exp(-Math.pow((dt - 0.11) / 0.03, 2))) * Math.min(1, dt / 0.015) * g;
    lit.push([x, y, z, e]);
  }
  lit.sort((p, q) => q[3] - p[3]);
  return lit.slice(0, 4);
}

// ---- state ----
export function state(v) {
  const s = { v };
  s.depth = depthAt(v);
  s.tempC = tempAt(v);
  s.alt = -Math.min(s.depth, 140);                       // altitude for the cloud layers (km); they all lie above 90 km down
  // the Sun: high-ish and to the right; it races across the sky and sets in the jet stream (a 10-hour day)
  s.sunEl = lerp(13, -3, smooth(V_WIND + 0.6, V_SUNSET + 0.6, v));
  s.sunAz = lerp(12, 30, smooth(V_WIND + 0.6, V_SUNSET + 0.6, v));
  s.sunset = smooth(V_WIND + 3, V_SUNSET, v);            // the light warms
  // inside a cloud deck (fog over everything), by depth: the ammonia deck's billows reach up to ~7 km down,
  // its base is at 16 km; the brown deck 29-43 km; the base of the storm deck 80-84 km (sky.js)
  const d = s.depth;
  s.in1 = smooth(10.0, 11.4, d) * (1 - smooth(19.4, 20.6, d));
  s.in2 = smooth(29.2, 31.6, d) * (1 - smooth(43.2, 45.2, d));
  s.in3 = smooth(78.5, 80.5, d) * (1 - smooth(84.5, 87, d));
  s.mode = d < 19.25 ? 0 : d < 43.0 ? 1 : d < 82 ? 2 : 3;   // which decks are above/below you (switched inside the fog)
  s.rain = smooth(V_BASE3 - 0.3, V_BASE3 + 0.5, v) * (1 - smooth(V_BASE3 + 3, V_BASE3 + 5.5, v));
  // the light that gets down to you
  s.day = 1 - smooth(V_CLOUD1, V_OUT1 + 4, v) * 0.75 - smooth(V_CLOUD2, V_OUT2 + 1.5, v) * 0.22;
  s.day = Math.max(0, s.day * (1 - smooth(V_OUT2, V_BASE3, v)));
  s.lamp = smooth(V_LAMP, V_LAMP + 0.25, v);
  // the deep: glowing air, from dull red to white-hot
  s.glow = smooth(V_GLOW, V_GLOW + 6, v);
  // 0 (dull red) .. 1 (white-hot): red at 1,000°C, orange in the ocean, yellow-white in the metal, white at the end
  s.heat = Math.max(0, Math.min(1, 0.04 + 0.16 * smooth(V_GLOW, 52, v) + 0.1 * smooth(52, 59, v) + 0.2 * smooth(59, 64, v) + 0.25 * smooth(64, 67.5, v) + 0.25 * smooth(67, T_SWITCH, v)));
  s.ocean = smooth(V_OCEAN - 1, V_OCEAN + 3, v);
  s.metal = smooth(V_METAL - 0.5, V_METAL + 2, v);
  // your suit
  s.frost = smooth(V_CLOUD1 + 0.6, V_OUT1 + 1.5, v) * (1 - smooth(V_BASE3 - 2.5, V_BASE3 + 0.5, v));
  s.wet = smooth(V_BASE3 - 2, V_BASE3, v) * (1 - smooth(V_LAMP + 3, V_GLOW, v));
  s.crack = smooth(V_CRACK, V_CRACK + 1.4, v);
  s.suitHot = smooth(V_GLOW + 3, V_METAL + 1, v);
  s.probe = smooth(V_PROBE - 2.5, V_PROBE, v) * (1 - smooth(V_PROBE + 6.5, V_PROBE + 8, v));
  s.diamonds = smooth(V_DIAMOND - 0.5, V_DIAMOND + 1, v) * (1 - smooth(V_OCEAN + 1, V_OCEAN + 3.5, v));
  // the white at the end, then the loop
  s.flash = smooth(V_WHITE, T_SWITCH - 0.2, v);
  s.flashColor = '#fff8ee';
  s.title = 1 - smooth(3.0, 3.8, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
