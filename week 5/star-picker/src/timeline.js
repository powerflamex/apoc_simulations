// "What if other stars replaced the Sun?" — the story as functions of VIDEO time v (seconds; STORY_START = 0).
// Santa Monica beach at the end of the afternoon: the Sun low over the sea, the pier and its Ferris wheel on the right,
// people on towels all around you. Under the title a "sun picker" (a scroll wheel like the iPhone's date picker) spins,
// slows and snaps onto a star; the sky changes to that star at once, we watch what it does, then it spins on.
// The picker IS the counter: its middle row shows the star's name and size, the one line under it what it does to you.
// The numbers (each star's real radius R and luminosity L, in Suns):
//   - its size in the sky: angular radius = asin(R / 215), 215 Suns' radii being 1 AU (the Sun: 0.27°)
//   - the beach's temperature, a rough estimate: 288 K × (L / L_sun)^0.25 (Earth's average, scaled by the light)
//   - Betelgeuse is 760 Suns wide, 3.5 times the size of Earth's orbit: Earth would be inside it
import { smooth, clamp, lerp, rng } from './util.js';

export const STORY_START = 0;            // everything runs on the video clock
export const T_SWITCH = 60.0;            // inside Betelgeuse: a full orange-white cover; the loop point sits in it
export const LOOP = 0.9;                 // the cover clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;

export const AU_R = 215.03;              // 1 AU in solar radii
// the stars, in the order the picker lands on them. R, L in Suns; teff in K
export const STARS = [
  { key: 'sun', name: 'THE SUN', R: 1, L: 1, teff: 5772, size: '' },
  { key: 'proxima', name: 'PROXIMA CENTAURI', R: 0.154, L: 0.00157, teff: 3042, size: '0.15× THE SUN' },
  { key: 'sirius', name: 'SIRIUS', R: 1.71, L: 25.4, teff: 9940, size: '1.7× THE SUN' },
  { key: 'vega', name: 'VEGA', R: 2.6, L: 40.1, teff: 9600, size: '2.6× THE SUN' },
  { key: 'arcturus', name: 'ARCTURUS', R: 25.4, L: 170, teff: 4286, size: '25× THE SUN' },
  { key: 'aldebaran', name: 'ALDEBARAN', R: 44, L: 440, teff: 3900, size: '44× THE SUN' },
  { key: 'rigel', name: 'RIGEL', R: 79, L: 120000, teff: 12100, size: '79× THE SUN' },
  { key: 'betelgeuse', name: 'BETELGEUSE', R: 760, L: 126000, teff: 3600, size: '760× THE SUN' },
];
for (const s of STARS) {
  s.ang = Math.asin(Math.min(1, s.R / AU_R));        // angular radius (rad); Betelgeuse: 1 (we're inside)
  s.tK = 288 * Math.pow(s.L, 0.25);                   // the beach (rough)
  const c = s.tK - 273.15;
  const r = Math.abs(c) >= 5000 ? 100 : Math.abs(c) >= 1000 ? 50 : 10;
  s.tC = Math.round(c / r) * r;
}
export const STAR = Object.fromEntries(STARS.map((s) => [s.key, s]));
const fmtC = (c) => `${c < 0 ? '−' : ''}${Math.abs(c).toLocaleString('en-US')}°C`;

// ---- the stops: when the picker starts spinning away from each star (spin) and lands on it (land) ----
// lines: what the one line under the picker says while it sits there [from (s after landing), text]
export const STOPS = [
  { key: 'sun', land: -9, spin: -0.45, lines: [] },
  { key: 'proxima', land: 1.0, spin: 7.4, lines: [[0.15, `The beach: ${fmtC(STAR.proxima.tC)}`], [3.2, 'Your breath freezes']] },
  { key: 'sirius', land: 8.9, spin: 15.2, lines: [[0.15, `The beach: ${fmtC(STAR.sirius.tC)}`], [3.2, 'The sand starts smoking']] },
  { key: 'vega', land: 16.7, spin: 23.0, lines: [[0.15, `The beach: ${fmtC(STAR.vega.tC)}`], [3.0, 'The sea starts to boil']] },
  { key: 'arcturus', land: 24.5, spin: 31.6, lines: [[0.15, `The beach: ${fmtC(STAR.arcturus.tC)}`], [3.2, 'The pier burns']] },
  { key: 'aldebaran', land: 33.1, spin: 40.3, lines: [[0.15, `The beach: ${fmtC(STAR.aldebaran.tC)}`], [3.0, 'The city melts']] },
  { key: 'rigel', land: 41.8, spin: 50.0, lines: [[0.15, `The beach: ${fmtC(STAR.rigel.tC)}`], [3.4, 'The ocean boils away']] },
  { key: 'betelgeuse', land: 53.0, spin: 1e9, lines: [[0.15, 'Earth is inside the star']] },
];
for (const s of STOPS) s.star = STAR[s.key];
export const LAND = Object.fromEntries(STOPS.map((s) => [s.key, s.land]));

// ---- the drum: one long strip of star names; between the stops, other stars spin past ----
const DECOYS = [
  ['POLARIS', 6000], ['ALTAIR', 7700], ['DENEB', 8500], ['SPICA', 22000], ['ANTARES', 3600], ['CAPELLA', 4970],
  ['PROCYON', 6500], ['CANOPUS', 7350], ['POLLUX', 4600], ['CASTOR', 10300], ['REGULUS', 12000], ['ACHERNAR', 15000],
  ['MIRA', 3000], ['BELLATRIX', 22000], ['ALNITAK', 29000], ["BARNARD'S STAR", 3200], ['ALPHA CENTAURI A', 5800],
  ['TAU CETI', 5300], ['EPSILON ERIDANI', 5100], ['WOLF 359', 2800], ['FOMALHAUT', 8600], ['MINTAKA', 29000],
  ['HADAR', 25000], ['MIMOSA', 27000], ['ALGOL', 13000], ['UY SCUTI', 3400], ['ALCYONE', 12800],
  ['THUBAN', 9800], ['DUBHE', 4700], ['MIZAR', 9000], ['ALKAID', 15500], ['ENIF', 4400], ['SCHEDAR', 4700],
  ['KOCHAB', 4000], ['SHAULA', 25000], ['MENKAR', 3800], ['RASALHAGUE', 8000], ['ALDERAMIN', 7700], ['ELNATH', 13600],
  ['ALPHERATZ', 13800], ['MIRFAK', 6350], ['WEZEN', 6100], ['ADHARA', 22000], ['SAIPH', 26000], ['DENEBOLA', 8500],
];
// rows passed per spin (more for the last, slow one)
const PASS = [11, 12, 12, 13, 13, 13, 19];
export const DRUM = [];
{
  // decoys drawn at random, never one seen in the last 20 rows; the last, slow spin crawls past three giants
  const R = rng(31), recent = [];
  const LATE = [['UY SCUTI', 3400, 1700], ['ANTARES', 3600, 680], ['DENEB', 8500, 200]];
  const pool = DECOYS.filter(([n]) => !LATE.some((l) => l[0] === n));
  const decoy = () => {
    let d;
    do d = pool[Math.floor(R() * pool.length)]; while (recent.includes(d[0]));
    recent.push(d[0]); if (recent.length > 20) recent.shift();
    return { name: d[0], teff: d[1], R: 1.5 };
  };
  for (let j = 0; j < 4; j++) DRUM.push(decoy());
  STOPS.forEach((st, i) => {
    if (i > 0) for (let j = 0; j < PASS[i - 1] - 1; j++) {
      const late = i === STOPS.length - 1 ? LATE[j - (PASS[i - 1] - 4)] : null;
      DRUM.push(late ? { name: late[0], teff: late[1], R: late[2] } : decoy());
    }
    st.idx = DRUM.length;
    DRUM.push({ name: st.star.name, teff: st.star.teff, R: st.star.R, stop: st });
  });
  for (let j = 0; j < 5; j++) DRUM.push(decoy());
}
// a spin's progress: a flick (full speed in ~0.1 s), then slowing down all the way to the stop
const SPIN_CURVE = (() => {
  const n = 2000, c = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) { const u = (i - 0.5) / n; c[i] = c[i - 1] + smooth(0, 0.07, u) * Math.pow(1 - u, 2.1); }
  for (let i = 0; i <= n; i++) c[i] /= c[n];
  return (u) => { const x = clamp(u) * n, i = Math.min(n - 1, Math.floor(x)); return lerp(c[i], c[i + 1], x - i); };
})();
// the drum's position (rows; the row at index round(pos) is in the middle) at video time v
export function drumPos(v) {
  for (let i = 0; i < STOPS.length; i++) {
    const st = STOPS[i], nx = STOPS[i + 1];
    if (!nx || v < st.spin) return st.idx;
    if (v < nx.land) return lerp(st.idx, nx.idx, SPIN_CURVE((v - st.spin) / (nx.land - st.spin)));
  }
  return STOPS[STOPS.length - 1].idx;
}
// the stop whose star is in the sky now, and the one before it
export function stopAt(v) {
  let i = 0;
  while (i + 1 < STOPS.length && v >= STOPS[i + 1].land) i++;
  return i;
}
// the one line under the picker: { text, alpha }
export function lineAt(v) {
  const i = stopAt(v), st = STOPS[i];
  const nx = STOPS[i + 1];
  let cur = null, t0 = 0, t1 = (nx ? nx.land : 1e9) - st.land;
  for (let j = 0; j < st.lines.length; j++) {
    const [a, text] = st.lines[j];
    const b = j + 1 < st.lines.length ? st.lines[j + 1][0] : Math.min(st.spin - st.land, t1);
    const dt = v - st.land;
    if (dt >= a && dt < b) { cur = text; t0 = a; t1 = b; }
  }
  if (!cur) return null;
  const dt = v - st.land;
  return { text: cur, alpha: smooth(t0, t0 + 0.25, dt) * (1 - smooth(t1 - 0.2, t1, dt)), rise: (1 - smooth(t0, t0 + 0.25, dt)) * 12 };
}

// ---- state ----
// k-th stop's landing as a step that eases over d seconds
const after = (key, a, b, v) => smooth(LAND[key] + a, LAND[key] + b, v);
export function state(v) {
  const s = { v };
  const i = stopAt(v);
  s.i = i;
  s.stop = STOPS[i]; s.star = STOPS[i].star;
  s.prev = STOPS[Math.max(0, i - 1)].star;
  s.sw = i === 0 ? 1 : smooth(STOPS[i].land, STOPS[i].land + 0.12, v);      // the sky's switch (fast)
  s.since = v - STOPS[i].land;
  s.drum = drumPos(v);
  // the snap: a short pulse at every landing
  s.snap = i === 0 ? 0 : Math.exp(-Math.max(0, s.since) / 0.12) * smooth(-0.01, 0.02, s.since);
  // ---- Proxima: dark red, frost, the sea freezes, your breath freezes ----
  s.cold = after('proxima', 0.05, 2.4, v) * (1 - after('sirius', 0.1, 2.2, v));
  s.ice = after('proxima', 0.15, 2.0, v) * (1 - after('sirius', 0.4, 3.0, v));     // the sea's ice
  s.iceR = 4 + 4000 * Math.pow(after('proxima', 0.1, 2.6, v), 2.2);                // how far out it reaches (m)
  s.breath = after('proxima', 0.8, 1.6, v) * (1 - after('sirius', 0.0, 0.4, v));
  // ---- the heat: a dark surface facing the star (K), and everything else (lags) ----
  const H = [['sirius', 650, 2.5], ['vega', 760, 2.5], ['arcturus', 1060, 2.5], ['aldebaran', 1330, 2.5], ['rigel', 5400, 3.5], ['betelgeuse', 9000, 1.0]];
  let hk = 300, amb = 300;
  for (const [key, T, d] of H) {
    hk = lerp(hk, T, after(key, 0.05, d, v));
    amb = lerp(amb, 300 + (T - 300) * 0.55, after(key, 1.0, d + 3.0, v));
  }
  s.heatK = hk; s.ambK = amb;
  s.smolder = after('sirius', 0.3, 2.5, v);     // the sand smokes, towels scorch
  s.steam = after('vega', 0.8, 3.5, v);         // the sea steams...
  s.boil = Math.max(after('vega', 3.0, 6.0, v) * 0.45, after('arcturus', 0.5, 3.0, v));   // ...and boils
  s.pierFire = after('arcturus', 0.6, 4.0, v);  // the pier burns (decks and the Ferris wheel)
  s.carFire = after('arcturus', 1.0, 5.0, v);
  s.win = after('aldebaran', 0.2, 1.8, v) + 0.25 * after('arcturus', 2, 6, v);        // windows break
  s.melt = after('aldebaran', 1.2, 7.0, v);     // the towers glow, sag and slump
  s.fall = after('rigel', 1.0, 7.5, v);         // and fall
  s.pierFall = after('rigel', 2.0, 7.0, v);     // the pier's deck collapses into the drained sea
  // the ocean boils away: the sea level drops (m)
  s.drop = 140 * Math.pow(after('rigel', 1.2, 8.0, v), 1.6) + 260 * after('betelgeuse', 0.2, 4.0, v);
  s.smoke = Math.max(after('arcturus', 1.0, 6.0, v), after('vega', 2.0, 6.0, v) * 0.3);   // smoke in the sky
  // ---- Betelgeuse: inside the star ----
  s.inside = after('betelgeuse', 0.0, 0.2, v);
  s.vapor = after('betelgeuse', 0.3, 3.5, v);   // everything glows white and is gone
  s.cover = smooth(LAND.betelgeuse + 3.6, T_SWITCH - 0.6, v);   // the full orange-white cover
  s.flash = s.cover;
  s.flashColor = '#ffd9a6';
  s.title = 1 - smooth(3.3, 4.1, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
