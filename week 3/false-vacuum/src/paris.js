// Paris, the Champs-Élysées at sunset in early August (metres). You stand on the traffic island in the middle of a
// crosswalk, looking west (-z) up the avenue to the Arc de Triomphe, 930 m away, with the Sun going down just to
// the right of it. x: to the right (north); y: up; the avenue rises gently (1.1 %) toward the Étoile.
// The Sun's place in the sky at story time t (seconds, 0 = the wall reaches you): it sinks along a 43° slant
// (Paris, 49° N, early August), so earlier it was higher and further left.
import * as THREE from 'three';
import { rng } from './util.js';

export const EYE = new THREE.Vector3(0, 1.7, 0);
export const ROAD = 13.6, WALK = 34;               // |x| < ROAD: roadway; ROAD..WALK: sidewalk; then the buildings
export const ARC_Z = -930;
export const groundY = (z) => (z < 0 ? -z * 0.011 : 0);
const DEG = Math.PI / 180;
export function sunAt(t) {
  const m = Math.max(0, -t) / 60;
  const el = 1.9 + 0.164 * m, az = 3.4 - 0.176 * m;
  return new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
}
export const SUN0 = sunAt(0);
export const WALL_N = SUN0.clone().negate();        // the wall travels away from the Sun, straight down the avenue
export const MOON_DIR = (() => { const az = -9 * DEG, el = 17 * DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); })();

// ---- buildings: the frontage down both sides, blocks behind, the Étoile round the Arc, La Défense far off ----
// kind 0: Haussmann block (stone, iron balconies, slate-zinc mansard); 1: glass tower (La Défense)
export const B = [];
{
  const R = rng(1853);
  const SIDE_STREETS = [-85, -228, -372, -505, -640, -760];
  for (const side of [-1, 1]) {
    let z = 120;
    while (z > -860) {
      let w = 16 + R() * 18;
      const gap = SIDE_STREETS.find((s) => z - w < s + 8 && z > s - 8);
      if (gap !== undefined) { z = gap - 8; continue; }
      const h = 21.4 + R() * 2.4;
      B.push({ kind: 0, x: side * (WALK + 13), z: z - w / 2, w: 26, d: w - 0.3, h, seed: R(), lit: 0.18 + R() * 0.25, side, front: true });
      z -= w;
    }
    // a second row behind (seen down the side streets and over the trees)
    for (let z2 = 100; z2 > -860; z2 -= 30 + R() * 15) B.push({ kind: 0, x: side * (WALK + 46 + R() * 8), z: z2, w: 34, d: 28 + R() * 8, h: 22 + R() * 4, seed: R(), lit: 0.2 + R() * 0.2, side });
  }
  // the Étoile: a ring of blocks round the Arc, with gaps where the twelve avenues leave
  for (let k = 0; k < 24; k++) {
    const a = (k + 0.5) / 24 * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.2) continue;                      // (our avenue, and the one going on behind the Arc)
    const r = 205 + R() * 20;
    B.push({ kind: 0, x: Math.sin(a) * r, z: ARC_Z + Math.cos(a) * r, w: 38, d: 30, h: 22 + R() * 3, seed: R(), lit: 0.25, side: Math.sign(Math.sin(a)), rot: a });
  }
  // the avenue de la Grande Armée beyond the Arc, then La Défense's towers 4.5 km off
  for (const side of [-1, 1]) for (let z = ARC_Z - 260; z > -4600; z -= 60 + R() * 40) B.push({ kind: 0, x: side * (40 + R() * 10), z, w: 30, d: 50, h: 22 + R() * 6, seed: R(), lit: 0.2, side, far: true });
  const TOWERS = [[-260, 210], [-150, 187], [-60, 231], [70, 165], [160, 200], [250, 178], [-330, 140], [340, 150], [20, 120], [-200, 110], [210, 125]];
  for (const [x, h] of TOWERS) B.push({ kind: 1, x: x + (R() - 0.5) * 30, z: -5600 - R() * 500, w: 40 + R() * 20, d: 40 + R() * 20, h, seed: R(), lit: 0.3, side: 0, far: true });
}

// ---- trees: two rows of clipped chestnuts on each sidewalk ----
export const TREES = [];
{
  const R = rng(7);
  for (const side of [-1, 1]) for (const xr of [17.4]) for (let z = 110; z > -850; z -= 10.5 + R() * 1.0) {
    if ([-85, -228, -372, -505, -640, -760].some((s) => Math.abs(z - s) < 9)) continue;
    if (Math.abs(z) < 7 && xr < 20) continue;                       // (the crosswalk)
    TREES.push({ x: side * xr, z, s: 0.9 + R() * 0.2, seed: R() });
  }
}
export const LAMPS = [];
for (const side of [-1, 1]) for (let z = 95; z > -850; z -= 31) LAMPS.push({ x: side * (ROAD + 0.9), z: z + side * 7 });

// ---- traffic: four lanes each way, every lane at its own steady speed (nobody catches anybody) ----
// westbound (away from you, tail lights) on the right; eastbound (toward you, headlights) on the left
export const LANES = [];
export const CARS = [];
{
  const R = rng(1789);
  const Z0 = 160, Z1 = -880, L = Z0 - Z1;
  [3.1, 6.1, 9.1, 12.1].forEach((ax, i) => {
    for (const dir of [-1, 1]) {   // dir -1: westbound (toward -z)
      const lane = { x: dir < 0 ? ax : -ax, dir, speed: 9.5 + i * 0.9 + R() * 1.2, L, Z0, Z1 };
      LANES.push(lane);
      let off = R() * 20;
      while (off < L - 8) {
        CARS.push({ lane, off, kind: R() < 0.12 ? 3 : Math.floor(R() * 3), seed: R(), col: Math.floor(R() * 1000) });
        off += 8 + Math.pow(R(), 1.6) * 34;
      }
    }
  });
}
// where a car is at story time t: its distance along the lane (wrapping), its z and how visible it is (it fades in
// behind you and out at the Étoile)
export function carAt(c, t) {
  const ln = c.lane;
  const s = (((c.off + ln.speed * t) % ln.L) + ln.L) % ln.L;
  const z = ln.dir < 0 ? ln.Z0 - s : ln.Z1 + s;
  return { s, z, x: ln.x, y: groundY(z) };
}
