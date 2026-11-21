// Where everything is. A packed outdoor basketball court in a city park on a sunny afternoon: the far hoop ahead of
// you, a plaza with a fountain behind its baseline, then a sidewalk with street trees and lamps, a row of parked cars,
// the street, and a row of shops and apartment blocks across it. World: x to the right of the camera, y up, -z ahead
// (the camera looks along -z). The ground is flat (y = 0). The camera stands just behind YOU on the half-court line.
import { rng } from './util.js';

export const CAM0 = { x: 0, z: 0, h: 1.9 };
export const YOU = { x: 0.5, z: -4.0, y: 0 };
export const FACE_YAW = Math.PI;                     // a figure's yaw that faces ahead (-z): its own +z turned to -z

// ---- the court (FIBA: 28 x 15 m; the rim's centre 1.575 m in from the baseline, 3.05 m up) ----
export const HOOP = { x: -0.6, z: -12.5, y: 3.05, r: 0.229 };
export const COURT = { x0: HOOP.x - 7.5, x1: HOOP.x + 7.5, z0: HOOP.z - 1.575, z1: HOOP.z - 1.575 + 28 };
export const BOARD = { z: HOOP.z - 0.375, y0: 2.9, y1: 3.95, w: 1.8 };          // the backboard's face
export const POLE = { x: HOOP.x, z: COURT.z0 - 1.0, top: 3.45 };              // the post behind the baseline, its arm reaching to the board
export const APRON = 1.6;

// ---- the plaza, the street, the buildings (z bands, ahead = more negative) ----
export const Z = {
  plaza0: COURT.z0 - APRON, plaza1: -23.0,            // paving, the fountain
  walk1: -26.0,                                       // the near sidewalk ends at the kerb
  park1: -28.3, lane: -32.1, park2: -35.9, street1: -38.2,
  walk2: -41.0,                                       // the far sidewalk; the buildings' fronts
};
export const FOUNTAIN = { x: -4.4, z: -19.2, r: 3.0, rim: 0.5, water: 0.38, ped: 0.5 };

// the frame, roughly: half-width of the view at distance f ahead (vertical FOV 62, 9:16)
export const HALF_W = (f) => f * 0.3378;
export const inView = (x, z, m = 0) => { const f = -z; return f > 0.5 && Math.abs(x) < HALF_W(f) + m; };

// ---- trees: [x, z, height, crown radius]: two flanking the court, the plaza's, the street trees, the far ones ----
export const TREES = [
  [-4.7, -8.6, 7.8, 2.6], [5.9, -9.8, 8.4, 2.9],
  [-10.5, -16.8, 9.2, 3.3], [9.0, -17.6, 9.6, 3.4], [3.6, -22.0, 8.2, 2.8],
  [-12.5, -24.6, 8.8, 3.0], [-0.8, -24.7, 7.6, 2.5], [7.8, -24.4, 8.6, 2.9], [15.0, -24.8, 9.0, 3.0],
  [-17.0, -39.6, 9.4, 3.1], [-5.5, -39.7, 8.2, 2.8], [6.5, -39.5, 9.0, 3.0], [18.0, -39.8, 8.6, 2.9],
];
// ---- street lamps along the near sidewalk, and two in the plaza ----
export const LAMPS = [[-8.2, -24.9], [4.6, -24.9], [-17.5, -24.9], [11.8, -16.4]];
// ---- benches round the plaza [x, z, yaw] ----
export const BENCHES = [[-9.0, -21.2, 0.3], [1.8, -16.6, Math.PI], [6.0, -21.8, -0.2], [-1.2, -22.4, 0]];

// ---- parked cars [x, z, yaw, kind, colour]: nose to tail along both kerbs ----
export const CARS = [];
{
  const R = rng(31);
  const COLS = [0xd22b2b, 0xf2f2f2, 0x1d3f8f, 0x222428, 0xc9c9c9, 0xe0b422, 0x2c7a4b, 0x8a1c2c, 0x3f8fd2, 0xff7a1a];
  for (let x = -24; x < 26; x += 5.0 + R() * 1.1) CARS.push({ x, z: (Z.walk1 + Z.park1) / 2, yaw: Math.PI / 2, kind: Math.floor(R() * 3), col: COLS[Math.floor(R() * COLS.length)], seed: R() });
  for (let x = -26; x < 28; x += 5.1 + R() * 1.2) CARS.push({ x, z: (Z.park2 + Z.street1) / 2, yaw: -Math.PI / 2, kind: Math.floor(R() * 4), col: COLS[Math.floor(R() * COLS.length)], seed: R() });
}

// ---- the buildings across the street: a row of shops and flats, a taller row behind ----
// { x, z (front), w, d, h, kind: 0 brick, 1 render/plaster, 2 glass, col }
export const BUILDINGS = [];
{
  const R = rng(77);
  const BR = [[0.58, 0.22, 0.15], [0.66, 0.32, 0.2], [0.86, 0.74, 0.55], [0.93, 0.9, 0.84], [0.45, 0.6, 0.7], [0.8, 0.58, 0.38], [0.96, 0.93, 0.86], [0.72, 0.42, 0.36], [0.55, 0.62, 0.5]];
  let x = -46;
  while (x < 46) {
    const w = 9 + R() * 8;
    const kind = R() < 0.18 ? 2 : R() < 0.55 ? 0 : 1;
    const col = kind === 2 ? [0.35, 0.47, 0.58] : BR[Math.floor(R() * BR.length)];
    BUILDINGS.push({ x: x + w / 2, z: Z.walk2, w: w - 0.3, d: 14, h: 13 + R() * 12 + (kind === 2 ? 6 : 0), kind, col, seed: R() });
    x += w;
  }
  x = -60;
  while (x < 60) {
    const w = 14 + R() * 12;
    const kind = R() < 0.3 ? 2 : 1;
    BUILDINGS.push({ x: x + w / 2, z: Z.walk2 - 30, w: w - 1, d: 18, h: 30 + R() * 22, kind, col: kind === 2 ? [0.42, 0.55, 0.66] : BR[Math.floor(R() * BR.length)], seed: R(), back: true });
    x += w + 8 + R() * 14;
  }
}
