// Where everything is. North = +x (right in the view), east = +z (behind you), west = -z (ahead: the city and the
// sunset). You stand at the stone railing of an observatory terrace on a ridge, 300 m above a city that spreads
// west to the horizon. The terrace floor is y = 0; the city's plain is y = BASIN. The observatory (a block with a big
// dome) stands at the right end of the terrace, a little ahead of you.
import { rng } from './util.js';

export const BASIN = -300;
export const YOU = { x: 0, z: 0 };
export const TERRACE = { x0: -42, x1: 46, z0: -0.9, z1: 26, rail: -0.75 };
export const OBS = { x0: 46, x1: 88, z0: -62, z1: -8, h: 12.5, base: -60, dome: { x: 66, z: -36, r: 10.5 }, tower: { x: 51.5, z: -55.5, r: 4.6, h: 15 } };
export const SCOPE = { x: -6.5, z: -0.2 };     // the coin telescope at the railing, on your left

// ---- the hills: the ridge you stand on runs north-south (along x); it falls away ahead to the plain ----
const n1 = (x) => Math.sin(x) * 0.5 + Math.sin(x * 2.13 + 1.3) * 0.3 + Math.sin(x * 4.71 + 2.1) * 0.2;
// the ridge's crest line (z) and height above the plain along it
export const crestZ = (x) => 70 + 230 * (1 - Math.exp(-Math.pow(x / 900, 2))) * Math.sign(x + 1e-9) * 0.6 + 120 * n1(x / 760 + 0.4) * (1 - Math.exp(-Math.pow(x / 300, 2)));
const crestH = (x) => 330 + 110 * n1(x / 520 + 2.2) + 60 * n1(x / 190);
export function hillH(x, z) {
  const zc = crestZ(x), H = crestH(x);
  // ahead of the crest: a slope steepening near the top; behind it the land climbs on into mountains
  let h;
  if (z < zc) {
    const u = Math.max(0, (zc - z) / (620 + 160 * n1(x / 400)));
    h = H * Math.max(0, 1 - Math.pow(u, 0.75)) - 40 * u;
  } else h = H + (z - zc) * 0.12 + 260 * (1 - Math.exp(-(z - zc) / 2500));
  // gullies and spurs running down the slope
  h += 26 * n1(x / 85 + z / 400) * Math.min(1, Math.max(0, (zc - z) / 200)) + 9 * n1(x / 23 + z / 31);
  h += BASIN;
  // the spur the observatory stands on: flattened to the terrace's level, falling steeply away in front
  const dx = x - 12, dz = z - 6;
  const pad = Math.exp(-Math.pow(Math.max(0, Math.hypot(dx / 70, dz / 42)), 4));
  h = h * (1 - pad) + -1.7 * pad;
  if (z < -1 && z > -170 && Math.abs(x - 10) < 120) {
    // the steep drop below the railing
    const k = Math.exp(-Math.pow((x - 10) / 75, 2)) * (1 - Math.min(1, (-1 - z) / 170));
    h = Math.min(h, -1.7 - (-1 - z) * 1.1 * k - (1 - k) * 1e9 * 0);
  }
  return h;
}

// ---- the city on the plain: a street grid (a mile between boulevards), turned 9° from north ----
export const GRID = { ang: 9 * Math.PI / 180, block: 200, mile: 1609, z0: -650, zMax: -36000, xMax: 26000 };
export const DOWNTOWN = { x: 3400, z: -9800 };
// freeways: [x0, z0, x1, z1] (straight runs across the plain)
export const FREEWAYS = [
  [-26000, -2600, 26000, -9200],
  [-4200, -800, 9000, -36000],
  [-26000, -21000, 26000, -15500],
  [16000, -1200, -9000, -36000],
];
// the downtown towers
export const TOWERS = [];
{
  const R = rng(4242);
  for (let i = 0; i < 140; i++) {
    const a = R() * Math.PI * 2, r = Math.pow(R(), 0.8) * 1500;
    const x = DOWNTOWN.x + Math.cos(a) * r, z = DOWNTOWN.z + Math.sin(a) * r * 0.8;
    const core = Math.exp(-Math.pow(r / 700, 2));
    TOWERS.push({ x, z, w: 28 + R() * 30, d: 28 + R() * 30, h: 40 + R() * 70 + core * (100 + R() * 200), seed: R(), kind: R() < 0.55 ? 1 : 0, hue: R() });
  }
}

// ---- people on the terrace: lanes of walkers along it, and people stopping at the railing ----
// Slots in a lane share a speed and are evenly spaced, and lanes are 1.1 m apart, so nobody ever overlaps anybody.
export const LANES = [];
{
  const R = rng(99);
  [1.6, 2.7, 3.8, 5.0, 6.2, 7.4, 8.6, 10.0, 11.4].forEach((z, i) => {
    const dir = i % 2 ? 1 : -1;
    LANES.push({ z, dir, speed: 1.1 + R() * 0.35, x0: TERRACE.x0 + 2, x1: TERRACE.x1 - 1.5, n: 3 + Math.floor(R() * 4), seed: R() });
  });
}
export const RAIL_SPOTS = [];
{
  const R = rng(123);
  for (let x = TERRACE.x0 + 3; x < TERRACE.x1 - 2; x += 2.4 + R() * 2.6) if (Math.abs(x - YOU.x) > 2.4 && Math.abs(x - SCOPE.x) > 1.4) RAIL_SPOTS.push({ x, seed: R(), stay: 2 + R() * 10, every: 4 + R() * 20 });
}
// terrace lamps (globes on posts)
export const LAMPS = [];
for (let x = TERRACE.x0 + 4; x < TERRACE.x1; x += 12) LAMPS.push({ x, z: 13.5 });
