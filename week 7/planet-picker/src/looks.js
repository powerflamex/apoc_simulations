// How the beach looks under each planet: the ball's brightness and glare, the sky, the light, the exposure, the sea's
// mirror. main.js blends the previous planet's look into the new one in the ~0.1 s after the cursor snaps.
// Every planet lights the beach brightly in its own colour (it never reads as a dark night): the Moon silver-blue,
// Mars rust red, Venus a hard cream-white under a dusk-blue sky, Neptune deep blue, Saturn pale gold, Jupiter orange.
//   k: which face the sky shader paints (0 Moon .. 5 Jupiter); pi: the ball's brightness; glare: how far its glare
//   spreads; top/low/near: the sky overhead / at the horizon / near the planet; night: stars; light/li: the planet's
//   light colour and strength, hemi*: the sky's fill light; exp: exposure; sea*: what the sea mirrors, glint: the
//   glitter path's strength, bright: the water's body colour; tilt: the planet's axis leaning right (deg), open: its
//   north pole tipped toward you (deg; Saturn: how open the rings are).
export const LOOKS = {
  moon: {
    k: 0, pi: 2.0, ring: 0, tilt: 18, open: 0, glare: 0.14, glareCol: [0.55, 0.66, 1.0],
    top: [0.012, 0.022, 0.07], low: [0.06, 0.1, 0.2], near: [0.14, 0.2, 0.36], night: 1, cloud: 0.5,
    light: [0.62, 0.76, 1.0], li: 2.6, hemiSky: [0.3, 0.42, 0.8], hemiGnd: [0.2, 0.22, 0.32], hi: 1.0,
    exp: 1.35, fog: [0.05, 0.08, 0.16], fogD: 0.00007, seaHi: [0.02, 0.045, 0.12], seaLo: [0.09, 0.14, 0.27], glint: 6, bright: 0.35,
  },
  mars: {
    k: 1, pi: 1.7, ring: 0, tilt: 25, open: 12, glare: 0.2, glareCol: [1.0, 0.36, 0.14],
    top: [0.02, 0.005, 0.004], low: [0.15, 0.04, 0.02], near: [0.34, 0.09, 0.04], night: 0.8, cloud: 0.5,
    light: [1.0, 0.4, 0.2], li: 3.6, hemiSky: [0.75, 0.25, 0.13], hemiGnd: [0.42, 0.15, 0.08], hi: 1.05,
    exp: 1.3, fog: [0.13, 0.035, 0.02], fogD: 0.00008, seaHi: [0.1, 0.022, 0.012], seaLo: [0.2, 0.055, 0.03], glint: 7, bright: 0.3,
  },
  venus: {
    k: 2, pi: 2.4, ring: 0, tilt: 5, open: 0, glare: 0.26, glareCol: [1.0, 0.94, 0.76],
    top: [0.025, 0.06, 0.2], low: [0.1, 0.15, 0.33], near: [0.32, 0.34, 0.42], night: 0.25, cloud: 0.6,
    light: [1.0, 0.95, 0.8], li: 4.0, hemiSky: [0.5, 0.58, 0.8], hemiGnd: [0.45, 0.42, 0.4], hi: 0.85,
    exp: 1.0, fog: [0.1, 0.15, 0.3], fogD: 0.00006, seaHi: [0.06, 0.12, 0.3], seaLo: [0.14, 0.2, 0.38], glint: 7, bright: 0.6,
  },
  neptune: {
    k: 3, pi: 1.5, ring: 0, tilt: 28, open: 4, glare: 0.3, glareCol: [0.2, 0.42, 1.0],
    top: [0.004, 0.018, 0.1], low: [0.04, 0.13, 0.46], near: [0.1, 0.28, 0.8], night: 0.2, cloud: 0.45,
    light: [0.24, 0.46, 1.0], li: 5.6, hemiSky: [0.13, 0.28, 0.85], hemiGnd: [0.07, 0.14, 0.42], hi: 1.25,
    exp: 1.1, fog: [0.04, 0.12, 0.42], fogD: 0.00007, seaHi: [0.01, 0.05, 0.26], seaLo: [0.05, 0.16, 0.55], glint: 2.6, bright: 0.45,
  },
  saturn: {
    k: 4, pi: 1.3, ring: 1, tilt: 32, open: 20, glare: 0.3, glareCol: [1.0, 0.82, 0.5],
    top: [0.03, 0.025, 0.02], low: [0.26, 0.2, 0.12], near: [0.45, 0.35, 0.2], night: 0.25, cloud: 0.3,
    light: [1.0, 0.8, 0.48], li: 5.4, hemiSky: [0.9, 0.74, 0.46], hemiGnd: [0.62, 0.47, 0.26], hi: 1.25,
    exp: 0.85, fog: [0.34, 0.27, 0.16], fogD: 0.00008, seaHi: [0.07, 0.06, 0.05], seaLo: [0.25, 0.2, 0.12], glint: 1.1, bright: 0.7,
  },
  jupiter: {
    k: 5, pi: 1.3, ring: 0, tilt: 14, open: 3, glare: 0.32, glareCol: [1.0, 0.6, 0.32],
    top: [0.03, 0.016, 0.012], low: [0.3, 0.14, 0.07], near: [0.5, 0.24, 0.11], night: 0.25, cloud: 0.3,
    light: [1.0, 0.63, 0.35], li: 6.4, hemiSky: [0.95, 0.56, 0.32], hemiGnd: [0.7, 0.42, 0.22], hi: 1.3,
    exp: 0.76, fog: [0.4, 0.2, 0.1], fogD: 0.00008, seaHi: [0.06, 0.04, 0.04], seaLo: [0.27, 0.15, 0.09], glint: 1.0, bright: 0.7,
  },
};

const mix = (a, b, k) => (Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * k) : a + (b - a) * k);
export function lookAt(prevKey, key, k) {
  const a = LOOKS[prevKey], b = LOOKS[key];
  const o = {};
  for (const n of Object.keys(b)) o[n] = mix(a[n], b[n], k);
  o.ka = a.k; o.kb = b.k;
  o.tiltA = a.tilt; o.openA = a.open; o.tiltB = b.tilt; o.openB = b.open;
  return o;
}
