// "What if Earth stopped orbiting the Sun?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// A packed plaza down the middle of a harbour avenue, at noon every day (a time-lapse that samples each midday, so the
// Sun stands still over the end of the avenue while the days race). Earth has stopped dead in its orbit and falls straight
// into the Sun. The physics (checked in physics.mjs, also in CAPTIONS.md):
//   - radial free fall from rest at 1 AU: r = cos^2(b) AU, t = K (b + sin b cos b), K = 41.106 days; the Sun's surface is
//     reached after 64.56 days (its centre would be at 64.57);
//   - the air temperature: today's average (288 K) scaled with the sunlight, T = 288 K / sqrt(r):
//     150°F on day 41.2 (we cross Venus's orbit on day 41.2), water boils (212°F) on day 48.5, paper lights (451°F) on day
//     58.9, lead melts (621°F) on day 61.3, 900°F on day 63, 2,000°F six hours before impact, 7,100°F at the surface;
//   - a sunlit surface runs hotter than the air: sigma T^4 = sigma T_air^4 + (half the absorbed sunlight), so leaves and wood
//     in the sun char and catch fire around day 56 (~550 K), and sunlit stone starts to glow dull red around day 62;
//   - the fall speed v = sqrt(2 GM (1/r - 1/AU)): 1 million mph 20 minutes before impact, 1.38 million mph at the surface;
//   - the Sun's width: 2 asin(R_sun / r). It fills 64° of sky 20 min before impact, 106° at 5 min.
// What is drawn vs real (also in CAPTIONS.md): the Sun is drawn ~16x wider than true at the start (true size is a 20-pixel
// dot; drawnSunDeg below), growing in steps you can see, and at true size for the last ~20 minutes; Venus passes 1 million
// km away (a lucky line-up) and is drawn 8.5x; the time-lapse shows each day's noon.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const CAM_Z = 8;                 // where you stand (layout.js)
export const LOOP = 0.9;

// ---- the physics ----
const AU = 1.495978707e8, GM = 1.32712440018e11, RSUN = 695700, DAYS = 86400;
export const K_DAYS = Math.sqrt(AU ** 3 / (2 * GM)) / DAYS;
const tOfB = (b) => K_DAYS * (b + Math.sin(b) * Math.cos(b));
export const T_HIT = tOfB(Math.acos(Math.sqrt(RSUN / AU)));      // 64.560 days
export function rAt(day) {                                       // AU
  if (day <= 0) return 1;
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (tOfB(m) < day) lo = m; else hi = m; }
  return Math.max(Math.cos(lo) ** 2, RSUN / AU);
}
export const airK = (r) => 288 / Math.sqrt(r);
export const toF = (K) => (K - 273.15) * 9 / 5 + 32;
// a dark surface square to the Sun: sigma T^4 = sigma T_air^4 + half of ~80% of the sunlight (the rest goes to the air)
export const sunlitK = (r) => Math.pow(Math.pow(airK(r), 4) + 0.5 * 1361 * 0.8 / (r * r) / 5.67e-8, 0.25);
export const sunTrueDeg = (r) => 2 * Math.asin(Math.min(1, RSUN / (r * AU))) * 180 / Math.PI;
export const mphAt = (r) => Math.sqrt(2 * GM * (1 / (r * AU) - 1 / AU)) * 2236.94;
export const sunlightX = (r) => 1 / (r * r);
// drawn width (degrees): art-directed while the true Sun is a dot (it would be ~20 pixels on a phone), so it reads as too
// big on frame 0 and grows in steps you can see; never smaller than true, and true for the last ~20 minutes. A smooth
// maximum (in log space) of the two, so it never shrinks.
const ART = [[-1, 8.5], [0, 8.5], [3, 10.5], [7, 11.5], [15, 13], [22, 15], [27, 18], [30, 21], [33, 26], [36, 33], [38, 46], [39.5, 63], [41, 80]];
const artDeg = (v) => {   // straight lines in log space between the keys (no easing: no pauses)
  if (v <= ART[0][0]) return ART[0][1];
  for (let i = 0; i < ART.length - 1; i++) if (v <= ART[i + 1][0]) { const k = (v - ART[i][0]) / (ART[i + 1][0] - ART[i][0]); return Math.exp(lerp(Math.log(ART[i][1]), Math.log(ART[i + 1][1]), k)); }
  return ART[ART.length - 1][1];
};
export const drawnSunDeg = (x, v) => { const a = artDeg(v), p = 6; return Math.min(180, Math.pow(Math.pow(x, p) + Math.pow(a, p), 1 / p)); };

// ---- the clock: days left until we hit, against video time (monotone cubic through the keys, in log space) ----
// (the clock dwells at 212°F, 451°F and 621°F for the captions that name them, then races on)
const LEFT = [
  [0, 64.56], [1, 56.2], [2, 48.3], [3, 40.9], [4, 34.4], [5, 29.3], [6, 25.6], [7, 23.40], [8, 23.34], [8.8, 23.30], [9.6, 23.25],
  [10.5, 22.75], [12, 20.2], [13.5, 17.7], [14.5, 16.06], [16.2, 15.8], [17.5, 11.0], [19, 8.2], [20.5, 6.9], [22.6, 5.65], [24.2, 5.48],
  [26.6, 3.25], [28.2, 3.17], [30.5, 1.55], [32, 1.0], [33.5, 0.55], [35, 0.27], [36.5, 0.12], [38, 0.042], [39.5, 0.0145],
  [41, 0.0055], [42.5, 0.0019], [44, 0.00062], [45.5, 0.00016], [46.8, 0],
];
const EPS = 1e-4;
const MC = (() => {
  const n = LEFT.length, x = LEFT.map((k) => k[0]), y = LEFT.map((k) => Math.log10(k[1] + EPS));
  const dk = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) dk.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = dk[0]; m[n - 1] = dk[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (3 * (dk[i - 1] + dk[i])) / ((2 * dk[i] + dk[i - 1]) / dk[i - 1] + (dk[i] + 2 * dk[i - 1]) / dk[i]);
  return { x, y, m };
})();
export function leftAt(v) {
  const { x, y, m } = MC, n = x.length;
  let L;
  if (v <= x[0]) L = y[0];
  else if (v >= x[n - 1]) L = y[n - 1];
  else {
    let i = 0;
    while (v > x[i + 1]) i++;
    const h = x[i + 1] - x[i], t = (v - x[i]) / h, t2 = t * t, t3 = t2 * t;
    L = (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
  }
  return Math.max(0, Math.pow(10, L) - EPS);
}
export const dayAt = (v) => Math.max(0, T_HIT - leftAt(v));

// ---- the beats (video seconds) ----
export const V_SHADE = 5.4;            // people run for shade; the camera turns to the sign
export const V_150 = 7.0;              // 150°F on the sign
export const V_VENUS = 8.8;            // Venus at its closest (1 million km)
export const V_STEAM = 11.5;           // the fountain and the bay start to steam
export const V_BOIL = 14.5;            // 212°F: the fountain boils
export const V_TREES = 19.0;           // the trees burst into flames
export const V_CARS = 22.6;            // 451°F: the cars catch fire
export const V_SAG = 26.6;             // 621°F: metal starts to sag
export const V_GLOW = 30.8;            // the street glows red
export const V_FILL = 37.6;            // the Sun fills the sky
export const V_SURF = 42.0;            // its surface fills the frame
export const V_HIT = 46.8;             // impact: white
export const T_SWITCH = Math.round((V_HIT + 0.4) * 60) / 60;   // inside the full white: the loop point
export const VIDEO_DURATION = Math.round((T_SWITCH + LOOP) * 60) / 60;
export const HITS = [V_SHADE, V_150, V_VENUS, V_BOIL, V_TREES, V_CARS, V_SAG, V_GLOW, V_FILL, V_SURF];

// ---- the sky (az: degrees right of due north, el: degrees up). The Sun stands over the end of the avenue at noon. ----
export const SUN_AZ = -3, SUN_EL = 31;
// Venus: comes over the rooftops on the right, sweeps right to left under the Sun and drops behind the left side's roofs.
// Its true distance d(t) = sqrt(b^2 + (v_rel t)^2), b = 1 million km, v_rel = 44 km/s; its angle along the path atan(v t / b).
const VEN_B = 1.0e6, VEN_V = 44, VEN_R = 6052, VEN_E = 8.5;
export function venusAt(v) {
  const dt = (dayAt(v) - dayAt(V_VENUS)) * DAYS;               // s from closest approach
  const phi = Math.atan2(VEN_V * dt, VEN_B);                  // -90° .. 90°
  const dist = Math.hypot(VEN_B, VEN_V * dt);
  return { phi, deg: 2 * Math.asin(VEN_R / dist) * 180 / Math.PI * VEN_E, vis: smooth(-1.45, -1.2, phi) * (1 - smooth(1.2, 1.45, phi)) };
}

// ---- text: popups name what happens (no numbers); captions sit in the gaps (never both at once) ----
export const POP = 1.7;
export const POPS = [
  [6.5, 'EVERYONE RUNS FOR SHADE'],
  [8.4, 'VENUS FLIES PAST'],
  [V_BOIL + 1.75, 'THE FOUNTAIN BOILS'],
  [V_TREES + 0.1, 'TREES BURST INTO FLAMES'],
  [V_CARS + 1.7, 'CARS CATCH FIRE'],
  [V_SAG + 1.7, 'METAL STARTS TO SAG'],
  [V_GLOW, 'THE STREET GLOWS RED'],
  [V_FILL, 'THE SUN FILLS THE SKY'],
];
const sunX = (v) => Math.round(sunlightX(rAt(dayAt(v))));
export const CAPTIONS = [
  [3.3, 6.25, "You can't feel it, but we're falling into the Sun."],
  [10.75, 12.9, "We just crossed Venus's orbit."],
  // (each temperature caption comes up the moment the counter passes it; the popup naming the event follows)
  [V_BOIL, V_BOIL + 1.65, '212°F: water boils on its own.'],
  [20.9, 22.5, `${['', '', '', '', '', 'Five', 'Six', 'Seven', 'Eight'][sunX(20.9)] || sunX(20.9)} times today's sunlight.`],
  [V_CARS, V_CARS + 1.62, '451°F: hot enough to set paper alight.'],
  [V_SAG, V_SAG + 1.62, '621°F: hot enough to melt lead.'],
  [39.5, 42.3, "You're falling at 1 million mph."],
];
export function popupAt(v) {
  let b = null;
  for (const [t, say] of POPS) if (v >= t && v < t + POP) b = { say, dt: v - t };
  return b;
}
export function captionAt(v) {
  if (popupAt(v)) return null;
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.2), fadeOut = clamp((b - v) / 0.2);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: days left (hundredths racing); from one day out, a clock; the temperature on the line under it ----
const comma = (x) => Math.round(x).toLocaleString('en-US');
export function counterAt(v) {
  const L = leftAt(v), T = toF(airK(rAt(T_HIT - L)));
  const line = `${comma(T)}°F`;
  if (L >= 1) return { label: 'DAYS UNTIL WE HIT THE SUN', value: L.toFixed(2), line };
  const s = Math.floor(L * DAYS), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return { label: 'WE HIT THE SUN IN', value: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, line };
}

// ---- the state at video time v ----
export function state(v) {
  const s = { v };
  s.left = leftAt(v); s.day = T_HIT - s.left;
  s.r = rAt(s.day);
  s.airK = airK(s.r); s.F = toF(s.airK);
  s.sunK = sunlitK(s.r);
  s.sunTrue = sunTrueDeg(s.r);
  s.sunDeg = drawnSunDeg(s.sunTrue, v);
  s.light = sunlightX(s.r);
  s.venus = venusAt(v);
  s.heat = clamp((s.F - 59) / 160);                              // 0 today .. 1 boiling
  s.shimmer = smooth(90, 200, s.F) * 0.7 + 0.3 * smooth(200, 700, s.F);
  s.steam = smooth(V_STEAM - 1, V_BOIL, v);
  s.boil = smooth(V_BOIL - 0.4, V_BOIL + 0.6, v);
  s.brown = smooth(V_BOIL + 1, V_TREES - 0.4, v);               // leaves brown and curl
  s.treeFire = smooth(V_TREES - 0.15, V_TREES + 0.6, v);
  s.carFire = smooth(V_CARS - 0.1, V_CARS + 2.2, v);
  s.sag = smooth(V_SAG - 0.1, V_SAG + 1.8, v);
  s.glow = smooth(V_GLOW - 1.5, V_GLOW + 2, v);
  s.smoke = smooth(V_TREES - 0.5, V_CARS + 3, v);
  s.crack = smooth(V_SAG + 2, V_GLOW + 3, v);                   // windows crack and fall out
  s.melt = smooth(V_FILL - 2, V_SURF + 2, v);                   // the city melting at the end
  s.surf = smooth(V_SURF - 1.5, V_SURF + 1.0, v);               // the frame is all Sun
  // the end: white at impact (the loop point sits in the full white)
  s.flash = smooth(V_HIT - 0.35, V_HIT, v);
  s.title = 1 - smooth(2.75, 3.1, v);
  return s;
}
export { lerp };
