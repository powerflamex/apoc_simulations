// Each place's look: sky, Sun, light, ground, fog, exposure. Colours are linear. The Suns are drawn 4x their true
// width (the Sun from Earth is 0.53 deg: a speck on a phone), so their sizes against each other stay true:
// Mars 0.66x, Mercury 3x (near perihelion), Titan/Jupiter ~0.19x, Neptune 0.033x, Pluto 0.025x (a point: drawn as a star).
// Light levels are art-directed (Titan's daylight is ~1/100-1/1000 of ours, Pluto's ~1/900): every stop is bright.
const SUN0 = 0.267 * 4 * Math.PI / 180;      // the Sun's angular radius as drawn from Earth (rad)
// dir: [azimuth deg (+ = to your right), elevation deg]
export const LOOKS = {
  venus: {
    kind: 0, top: [0.95, 0.42, 0.1], hor: [1.25, 0.72, 0.3], haze: [1.3, 0.8, 0.38], hazeK: 0.8, hazeW: 6, skyPow: 0.6,
    sun: [12, 48], sunR: 0, sunI: 0, glow: [1.4, 0.75, 0.3], glowK: 0.55, glowW: 0.5,
    light: [1.0, 0.6, 0.28], li: 1.6, hemiSky: [1.0, 0.55, 0.22], hemiGnd: [0.45, 0.25, 0.1], hi: 1.5,
    fog: [1.1, 0.62, 0.26], fogD: 0.0012, exp: 1.0, stars: 0, mount: 50,
  },
  mars: {
    kind: 1, top: [0.55, 0.36, 0.25], hor: [0.95, 0.66, 0.46], haze: [1.0, 0.7, 0.5], hazeK: 0.5, hazeW: 10, skyPow: 0.7,
    sun: [10, 26], sunR: SUN0 * 0.66, sunI: 9, glow: [0.75, 0.82, 1.0], glowK: 0.35, glowW: 0.06,
    light: [1.0, 0.92, 0.82], li: 2.6, hemiSky: [0.95, 0.66, 0.48], hemiGnd: [0.6, 0.3, 0.15], hi: 1.0,
    fog: [0.95, 0.66, 0.46], fogD: 0.00045, exp: 1.0, stars: 0, mount: 260,
  },
  mercury: {
    kind: 2, top: [0.0, 0.0, 0.004], hor: [0.02, 0.02, 0.03], haze: [0, 0, 0], hazeK: 0, hazeW: 10, skyPow: 1,
    sun: [9, 5.6], sunR: SUN0 * 3, sunI: 1.7, sunCol: [1.0, 0.88, 0.62], glow: [1.0, 0.75, 0.4], glowK: 0.3, glowW: 0.025,
    light: [1.0, 0.95, 0.85], li: 2.5, hemiSky: [0.25, 0.25, 0.28], hemiGnd: [0.55, 0.5, 0.45], hi: 0.9,
    fog: [0.02, 0.02, 0.03], fogD: 0.0, exp: 1.0, stars: 0.6, mount: 140,
  },
  titan: {
    kind: 3, top: [0.85, 0.48, 0.13], hor: [1.15, 0.72, 0.32], haze: [1.2, 0.78, 0.38], hazeK: 0.7, hazeW: 5, skyPow: 0.55,
    sun: [-14, 32], sunR: SUN0 * 0.19, sunI: 4, glow: [1.3, 0.85, 0.4], glowK: 0.45, glowW: 0.25,
    light: [1.0, 0.72, 0.38], li: 1.5, hemiSky: [1.0, 0.62, 0.28], hemiGnd: [0.5, 0.3, 0.12], hi: 1.4,
    fog: [1.1, 0.68, 0.3], fogD: 0.0009, exp: 1.0, stars: 0, mount: 70,
  },
  jupiter: {
    kind: 4, top: [0.08, 0.2, 0.6], hor: [0.9, 0.72, 0.52], haze: [1.0, 0.82, 0.6], hazeK: 0.45, hazeW: 14, skyPow: 0.4,
    sun: [-16, 34], sunR: SUN0 * 0.19, sunI: 7, glow: [1.0, 0.95, 0.85], glowK: 0.25, glowW: 0.08,
    light: [1.0, 0.95, 0.88], li: 2.4, hemiSky: [0.6, 0.65, 0.8], hemiGnd: [0.9, 0.7, 0.5], hi: 1.2,
    fog: [0.95, 0.85, 0.72], fogD: 0, exp: 1.0, stars: 0, mount: 0,
    deck: 1, deck1: [1.05, 0.95, 0.8], deck2: [0.95, 0.45, 0.16], deck3: [0.55, 0.22, 0.1],
  },
  neptune: {
    kind: 5, top: [0.02, 0.12, 0.55], hor: [0.3, 0.6, 1.1], haze: [0.4, 0.7, 1.2], hazeK: 0.5, hazeW: 9, skyPow: 0.5,
    sun: [-16, 34], sunR: 0.0012, sunI: 30, glow: [0.9, 0.95, 1.0], glowK: 0.12, glowW: 0.03,
    light: [0.95, 0.97, 1.0], li: 2.2, hemiSky: [0.3, 0.55, 1.0], hemiGnd: [0.15, 0.35, 0.85], hi: 1.3,
    fog: [0.3, 0.6, 1.1], fogD: 0, exp: 1.0, stars: 0, mount: 0,
    deck: 2, deck1: [0.18, 0.45, 1.1], deck2: [0.02, 0.12, 0.6], deck3: [0.95, 1.0, 1.1],
  },
  pluto: {
    kind: 6, top: [0.0, 0.0, 0.01], hor: [0.05, 0.12, 0.35], haze: [0.25, 0.5, 1.1], hazeK: 0.9, hazeW: 40, skyPow: 0.4,
    sun: [-12, 8], sunR: 0.0009, sunI: 60, glow: [0.95, 0.97, 1.0], glowK: 0.18, glowW: 0.02,
    light: [1.0, 0.97, 0.94], li: 2.8, hemiSky: [0.55, 0.62, 0.9], hemiGnd: [0.9, 0.78, 0.74], hi: 1.5,
    fog: [0.05, 0.12, 0.35], fogD: 0.0, exp: 1.0, stars: 1, mount: 380,
  },
  earth: {
    kind: 7, top: [0.06, 0.22, 0.8], hor: [0.6, 0.8, 1.05], haze: [0.8, 0.9, 1.05], hazeK: 0.35, hazeW: 12, skyPow: 0.5,
    sun: [12, 30], sunR: SUN0, sunI: 8, glow: [1.0, 0.95, 0.85], glowK: 0.3, glowW: 0.06,
    light: [1.0, 0.95, 0.86], li: 2.8, hemiSky: [0.55, 0.7, 1.0], hemiGnd: [0.85, 0.75, 0.55], hi: 1.1,
    fog: [0.6, 0.8, 1.05], fogD: 0.00012, exp: 1.0, stars: 0, mount: 60,
  },
};
