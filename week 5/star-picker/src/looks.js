// How the world looks under each star: the star's disc and glare, the sky, the light, the exposure, the sea's mirror.
// main.js blends the previous star's look into the new one in the ~0.1 s after the picker lands.
//   star: disc colour (linear), starI: its brightness, gran: convection cells (the giants), glare: how far its glare
//   spreads; top/low/near: the sky overhead / at the horizon / near the star; night: faint stars; light/li: the star's
//   light colour and strength, hemi*: the sky's fill light; exp: exposure; sea*: what the sea mirrors, glint: the
//   glitter path's strength, bright: the water's body colour; nightL: lamps, windows and the wheel's lights on.
export const LOOKS = {
  sun: {
    star: [1.0, 0.86, 0.62], starI: 12, gran: 0, glare: 0.4, glareCol: [1.0, 0.78, 0.5],
    top: [0.07, 0.2, 0.52], low: [0.78, 0.7, 0.62], near: [1.0, 0.62, 0.32], night: 0, cloud: 1,
    light: [1.0, 0.8, 0.58], li: 3.2, hemiSky: [0.5, 0.62, 0.85], hemiGnd: [0.72, 0.6, 0.46], hi: 0.95,
    exp: 1.0, fog: [0.8, 0.72, 0.66], fogD: 0.00006, seaHi: [0.25, 0.42, 0.7], seaLo: [0.85, 0.72, 0.6], glint: 6, bright: 1, nightL: 0,
  },
  proxima: {
    star: [1.0, 0.3, 0.1], starI: 60, gran: 0, glare: 0.25, glareCol: [1.0, 0.22, 0.06],
    top: [0.035, 0.004, 0.01], low: [0.28, 0.04, 0.03], near: [0.7, 0.1, 0.04], night: 0.7, cloud: 0.6,
    light: [1.0, 0.3, 0.14], li: 0.9, hemiSky: [0.3, 0.06, 0.07], hemiGnd: [0.16, 0.05, 0.04], hi: 0.55,
    exp: 2.6, fog: [0.22, 0.04, 0.035], fogD: 0.00008, seaHi: [0.12, 0.02, 0.03], seaLo: [0.35, 0.06, 0.04], glint: 8, bright: 0.3, nightL: 1,
  },
  sirius: {
    star: [0.82, 0.9, 1.0], starI: 40, gran: 0, glare: 0.8, glareCol: [0.85, 0.92, 1.0],
    top: [0.12, 0.28, 0.8], low: [0.6, 0.72, 0.95], near: [1.0, 1.05, 1.15], night: 0, cloud: 0.4,
    light: [0.88, 0.93, 1.0], li: 5.5, hemiSky: [0.75, 0.85, 1.0], hemiGnd: [0.85, 0.8, 0.74], hi: 1.1,
    exp: 0.55, fog: [0.88, 0.92, 1.0], fogD: 0.00006, seaHi: [0.3, 0.5, 0.9], seaLo: [0.7, 0.8, 0.98], glint: 18, bright: 1.1, nightL: 0,
  },
  vega: {
    star: [0.84, 0.9, 1.0], starI: 40, gran: 0, glare: 0.9, glareCol: [0.86, 0.92, 1.0],
    top: [0.13, 0.29, 0.82], low: [0.62, 0.74, 0.96], near: [1.05, 1.1, 1.2], night: 0, cloud: 0.2,
    light: [0.9, 0.94, 1.0], li: 6, hemiSky: [0.78, 0.86, 1.0], hemiGnd: [0.85, 0.78, 0.7], hi: 1.15,
    exp: 0.52, fog: [0.9, 0.92, 1.0], fogD: 0.00007, seaHi: [0.32, 0.52, 0.9], seaLo: [0.72, 0.82, 0.98], glint: 20, bright: 1.1, nightL: 0,
  },
  arcturus: {
    star: [1.0, 0.52, 0.2], starI: 5, gran: 1, glare: 0.35, glareCol: [1.0, 0.6, 0.32],
    top: [0.08, 0.04, 0.03], low: [0.42, 0.2, 0.1], near: [0.55, 0.27, 0.12], night: 0, cloud: 0.15,
    light: [1.0, 0.64, 0.36], li: 6, hemiSky: [0.9, 0.55, 0.32], hemiGnd: [0.7, 0.42, 0.22], hi: 1.3,
    exp: 0.72, fog: [0.75, 0.45, 0.25], fogD: 0.00008, seaHi: [0.6, 0.35, 0.2], seaLo: [1.0, 0.6, 0.32], glint: 3.5, bright: 1.0, nightL: 0,
  },
  aldebaran: {
    star: [1.0, 0.5, 0.22], starI: 4.6, gran: 1, glare: 0.35, glareCol: [1.0, 0.5, 0.24],
    top: [0.1, 0.04, 0.025], low: [0.5, 0.22, 0.09], near: [0.65, 0.3, 0.12], night: 0, cloud: 0,
    light: [1.0, 0.56, 0.28], li: 6.5, hemiSky: [0.85, 0.45, 0.22], hemiGnd: [0.6, 0.3, 0.14], hi: 1.3,
    exp: 0.72, fog: [0.7, 0.35, 0.16], fogD: 0.00009, seaHi: [0.55, 0.25, 0.12], seaLo: [0.95, 0.48, 0.22], glint: 3.5, bright: 0.9, nightL: 0,
  },
  rigel: {
    star: [0.4, 0.62, 1.0], starI: 3.4, gran: 1, glare: 0.35, glareCol: [0.6, 0.75, 1.0],
    top: [0.06, 0.1, 0.35], low: [0.4, 0.5, 0.8], near: [0.6, 0.7, 1.0], night: 0, cloud: 0,
    light: [0.82, 0.9, 1.0], li: 7, hemiSky: [0.75, 0.85, 1.0], hemiGnd: [0.75, 0.72, 0.75], hi: 1.3,
    exp: 0.55, fog: [0.55, 0.65, 0.9], fogD: 0.00008, seaHi: [0.3, 0.42, 0.8], seaLo: [0.6, 0.7, 0.95], glint: 4, bright: 1.2, nightL: 0,
  },
  betelgeuse: {
    star: [1.0, 0.5, 0.22], starI: 5, gran: 1, glare: 1.0, glareCol: [1.0, 0.55, 0.25],
    top: [1.6, 0.7, 0.3], low: [2.0, 0.9, 0.4], near: [2.0, 1.0, 0.5], night: 0, cloud: 0,
    light: [1.0, 0.6, 0.32], li: 12, hemiSky: [1.0, 0.55, 0.3], hemiGnd: [1.0, 0.5, 0.25], hi: 4,
    exp: 0.5, fog: [1.2, 0.55, 0.25], fogD: 0.00025, seaHi: [2.0, 0.9, 0.4], seaLo: [2.0, 0.9, 0.4], glint: 4, bright: 1, nightL: 0,
  },
};

const mix = (a, b, k) => (Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * k) : a + (b - a) * k);
export function lookAt(prevKey, key, k) {
  const a = LOOKS[prevKey], b = LOOKS[key];
  const o = {};
  for (const n of Object.keys(b)) o[n] = mix(a[n], b[n], k);
  return o;
}
