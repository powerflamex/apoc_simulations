// Rio de Janeiro around Corcovado, roughly to scale (metres). x: east (+); z: south (+); y: up, sea level 0.
// The statue stands on the summit at the origin (710 m). Real directions and distances from the summit:
//   Sugarloaf 5.6 km east (396 m), Urca next to it; Botafogo cove 3.5 km east-north-east; Guanabara Bay beyond;
//   Copacabana's beach 3-5 km south-east; the Lagoa 2.3 km south; Ipanema/Leblon beach 4.3 km south;
//   Dois Irmãos 5 km south-west; the Tijuca forest ridge running away to the west-north-west.
// Pure functions shared by the terrain mesh, the city, the water and the sound.
import { clamp, smooth } from './util.js';

export const SUMMIT = 704;                       // the top of the rock (the statue's terrace sits on it)
const hill = (x, z, cx, cz, h, r, p = 2) => { const d = Math.hypot(x - cx, z - cz) / r; return d >= 1 ? 0 : h * Math.pow(1 - d * d, p); };
const peak = (x, z, cx, cz, h, r, p = 1.4) => { const d = Math.hypot(x - cx, z - cz) / r; return h * Math.exp(-Math.pow(d, p)); };
// cheap smooth noise for the ridges
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const fbm = (x, z) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; };

// the water: one outline for the Atlantic and Guanabara Bay (traced along the shore: Leblon and Ipanema's beach,
// Arpoador, Copacabana's curve, Leme, round Sugarloaf and Urca, into Botafogo cove, up Flamengo to the centre,
// across the bay to Niteroi), plus the Lagoa
const SEA = [
  [-14000, 4650], [-6000, 4700], [-4200, 4480], [-2800, 4300], [0, 4250], [2000, 4200], [2800, 4050], [3000, 3700],
  [3300, 3200], [3800, 2600], [4400, 2050], [5000, 1600], [5300, 1300], [5500, 800], [5450, 350], [5950, 80],
  [6150, -350], [5800, -760], [5300, -640], [4800, -520], [4350, -720], [4150, -1000], [3700, -620], [3150, -720],
  [2950, -1100], [3100, -1550], [3500, -1750], [3620, -2350], [3520, -3050], [3850, -3850], [4350, -4350],
  [4650, -5250], [4500, -7000], [3800, -14000], [8600, -14000], [8600, -1600], [9400, 150], [22000, 700],
  [22000, 22000], [-14000, 22000],
];
function inPoly(x, z, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function waterAt(x, z) {
  if (inPoly(x, z, SEA)) return true;
  return Math.hypot((x - 300) / 1050, (z - 2350) / 850) < 1;
}
export { SEA };
// distance to the nearest water (m), searched coarsely (used once per sample, not per frame)
export function waterDist(x, z, max = 4000) {
  if (waterAt(x, z)) return 0;
  for (let r = 60; r <= max; r *= 1.25) {
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; if (waterAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return r; }
  }
  return max;
}

// ground height (m)
export function heightAt(x, z) {
  if (waterAt(x, z)) return -12;
  let h = 4 + 6 * fbm(x * 0.002, z * 0.002);
  // Corcovado: a steep granite tooth, its summit at the origin, a ridge running back west-north-west into the Tijuca forest
  const r = Math.hypot(x, z);
  let cor = 712 * Math.exp(-Math.pow(r / 760, 1.25));
  cor = Math.max(cor, SUMMIT - 0.0006 * r * r);                       // the small level top
  if (r < 34) cor = SUMMIT;
  const ridgeT = clamp((-x * 0.85 - z * 0.5) / 9000, 0, 1);            // along the ridge to the WNW
  const ridgeD = Math.abs(x * 0.5 - z * 0.85) ;                         // across it
  const ridge = (560 + 300 * fbm(x * 0.0007 + 3, z * 0.0007) + 200 * Math.sin(ridgeT * 9)) * Math.exp(-Math.pow(ridgeD / (1500 + 900 * ridgeT), 2)) * smooth(-0.02, 0.15, ridgeT);
  h = Math.max(h, cor, ridge * (0.7 + 0.3 * fbm(x * 0.002, z * 0.002)));
  // the hills round the city
  h = Math.max(h, hill(x, z, 5600, -400, 396, 380, 0.55));             // Sugarloaf: a bare granite bullet
  h = Math.max(h, hill(x, z, 5000, -200, 220, 450, 0.9));             // Urca
  h = Math.max(h, hill(x, z, 4600, 900, 240, 650, 1.2));              // Babilônia
  h = Math.max(h, hill(x, z, 2700, 900, 230, 650, 1.3));              // São João
  h = Math.max(h, hill(x, z, 1700, 2150, 370, 750, 1.2));             // Cabritos
  h = Math.max(h, hill(x, z, 2300, 3300, 190, 420, 1.2));             // Cantagalo
  h = Math.max(h, peak(x, z, -3400, 3900, 533, 650, 1.6), peak(x, z, -3000, 3650, 470, 500, 1.6));   // Dois Irmãos
  h = Math.max(h, peak(x, z, -6500, 4400, 844, 1100, 1.5));           // Pedra da Gávea
  h = Math.max(h, peak(x, z, 9500, -1500, 300, 2500, 1.4) * (x > 7500 ? 1 : 0));   // Niterói's hills across the bay
  return h;
}
// where the city is: low, not water, not steep (a coarse test, for placing buildings)
export function isCity(x, z) {
  if (waterAt(x, z)) return false;
  const h = heightAt(x, z);
  if (h > 32) return false;
  const e = 25;
  const gx = heightAt(x + e, z) - heightAt(x - e, z), gz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(gx, gz) / (2 * e) < 0.12;
}
export { fbm };
