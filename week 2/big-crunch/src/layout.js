// Where everything is. North = +x (right in the view), east = +z (behind you), west = -z (the sea, the sunset).
// You stand at the railing of a seaside promenade at 35° N. The shore runs straight ahead of you and bends
// right in the distance, so the city's skyline stands along it on the right, and the open sea is on the left.
// Across the shore (u = metres inland from the sea wall): promenade 0-12 (railing at 0.3, trees and lamps at 11),
// road 13-24 (two lanes each way), sidewalk 24-28, buildings from 30.
import { rng } from './util.js';

// the shore runs ahead and 10° to the right of you, so the open sea and the sunset are ahead and to the left and
// the city's skyline stands along the shore on the right; it eases in smoothly where you stand
export const coastX = (z) => {
  const d = -z;
  const soft = (d > 300 ? d : 10 * Math.log1p(Math.exp(d / 10))) - 6.931;   // eases from flat to a straight line
  return -1.3 + 0.18 * soft;
};
export const SEA0 = -2.4;                        // today's sea level relative to the promenade, m
export const YOU = { x: 0, z: 0 };
export const CAM = { x: -1.0, y: 2.6, z: 7.0, yaw: 0.0, pitch: -3.0, fov: 60 };
export const PROM = { w: 12, rail: 0.3, tree: 11.2 };
// a kiosk on the inland edge of the promenade, with a big sign on posts above it, turned toward you
export const KIOSK = { u: 10.9, z: -48, w: 2.8, d: 3.6, h: 2.8 };
export const ROAD = { u0: 13, u1: 24, lanes: [15.2, 18.0, 20.0, 22.8], dir: [-1, -1, 1, 1], speed: [14.5, 13.0, 12.5, 14.0] };
export const Z_NEAR = 60, Z_FAR = -1800;         // where the promenade, road and city are laid out

// ---- the city: lots along the shore, each rebuilt over and over ----
// A lot's buildings come and go on a fixed cycle: empty for `gap` years, built over `build` years (a crane on
// top), then standing until the next demolition. Each cycle gets its own height, look and colour.
export const LOTS = [];
{
  const R = rng(2024);
  const add = (u, z, w, d, hBase, near) => LOTS.push({
    u, z, w, d, hBase, near, seed: R(),
    period: 55 + R() * 90, phase: R(),
    gap: 0.6 + R() * 1.5, build: 1.4 + R() * 2.5,
  });
  // the block along the road: low and mid-rise
  for (let z = -40; z > -900; z -= 16 + R() * 14) add(31 + R() * 3, z, 12 + R() * 8, 12 + R() * 6, 12 + R() * 22, true);
  // rows behind, getting taller toward downtown (z ~ -1000 .. -2200)
  for (let row = 1; row <= 4; row++) for (let z = -60 - row * 25; z > -2600; z -= 22 + R() * 30) {
    const dt = Math.exp(-Math.pow((z + 1500) / 700, 2));
    add(30 + row * 34 + R() * 12, z, 16 + R() * 14, 16 + R() * 12, 18 + R() * 30 + dt * (60 + R() * 180) * (row > 1 ? 1 : 0.6), false);
  }
  // far shore across the bay: a band of towers further along the bend
  for (let z = -2600; z > -5200; z -= 40 + R() * 60) for (let k = 0; k < 3; k++) add(40 + k * 60 + R() * 30, z, 20 + R() * 20, 20 + R() * 20, 25 + R() * 90, false);
  // "new towers rise around you": a few lots near the promenade are rebuilt within the first decade
  for (const l of LOTS.filter((l) => l.z > -420 && l.z < -120 && l.near).slice(0, 5)) {
    l.phase = (1 - (1.5 + R() * 4) / l.period) % 1;   // the old building comes down 1.5-5.5 years in
    l.next = 70 + R() * 90;                            // and its replacement is a tower
  }
}

// ---- promenade furniture ----
export const TREES = [], LAMPS = [], POSTS = [], BENCHES = [];
{
  const R = rng(77);
  const nearKiosk = (z) => Math.abs(z - KIOSK.z) < KIOSK.d / 2 + 2.5;
  for (let z = 30; z > -900; z -= 11 + R() * 3) if (!nearKiosk(z)) TREES.push({ u: PROM.tree + (R() - 0.5) * 0.3, z, s: 0.85 + R() * 0.35, seed: R() });
  for (let z = 24; z > -900; z -= 18) if (!nearKiosk(z)) LAMPS.push({ u: 10.4, z });
  for (let z = 40; z > -900; z -= 2.2) POSTS.push({ z });
  for (let z = 18; z > -400; z -= 23 + R() * 6) if (Math.abs(z) > 6 && !nearKiosk(z)) BENCHES.push({ u: 9.75, z });
}

// ---- people: lanes of walkers along the promenade, and people stopping at the railing ----
// Each slot repeats a walk along its lane (one cycle = one passer-by, with their own clothes); slots in a lane share
// a speed and are spaced evenly, and the lanes are 1.1 m apart, so nobody ever overlaps anybody.
export const LANES = [];
{
  const R = rng(99);
  const us = [2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8];   // (you stand at u = 1.3; benches, lamps, trees and the kiosk are past 9.5)
  us.forEach((u, i) => {
    const dir = i % 2 ? 1 : -1;
    const speed = 1.15 + R() * 0.35;
    const len = 340;                                     // z from +40 to -300
    const n = 5 + Math.floor(R() * 4);
    LANES.push({ u, dir, speed, len, n, seed: R(), z0: 40, z1: -300 });
  });
}
export const RAIL_SPOTS = [];
{
  const R = rng(123);
  for (let z = 14; z > -140; z -= 2.6 + R() * 3) if (Math.abs(z - YOU.z) > 2.2) RAIL_SPOTS.push({ z, seed: R(), stay: 2 + R() * 14, every: 6 + R() * 30 });
}
