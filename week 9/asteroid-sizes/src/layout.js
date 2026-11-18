// Where everything is (metres; you at x = 0, z = 0 on the hilltop; -z is the view, toward downtown and the bay; y up,
// 0 = the bay's surface).
//   - the terrace: a top level where you stand (y = 112), four wide steps down, a lower level to a railing 24 m out;
//   - the hill falls away steeply under the railing to the city plain (y ~ 3);
//   - the city: low blocks below the hill, mid-rise blocks, then downtown's towers round ground zero (2.4 km out) on the
//     waterfront; more city to the right along the far shore; the bay behind downtown and to the left; hills across it.
import { GZ, HILL } from './timeline.js';
import { rng, clamp, smooth } from './util.js';

export { GZ, HILL };
export const STEP_H = 0.45, STEP_D = 3.2, N_STEPS = 4;
export const TOP_Z = -1.6;                                   // the top level's front edge
export const LOW_Y = HILL - STEP_H * N_STEPS;                // the lower level (110.2)
export const LOW_Z0 = TOP_Z - STEP_D * N_STEPS;              // where the lower level starts (-14.4)
export const RAIL_Z = -24;                                   // the railing
export const TER_X = 34;                                     // the terrace's half-width
export const EYE = HILL + 1.95;                              // your phone, held up over the crowd

// the floor under a point on the terrace (top level, steps, lower level)
export function floorY(x, z) {
  if (z >= TOP_Z) return HILL;
  if (z <= LOW_Z0) return LOW_Y;
  const k = Math.ceil((TOP_Z - z) / STEP_D);
  return HILL - STEP_H * k;
}

// ---- the land and the water ----
// signed distance-ish to the shore (m): > 0 on land, < 0 in the bay
// the waterfront behind downtown: a wavy line ~2.95 km out that bends away to the north on the right
export const zBack = (x) => -2950 - 110 * Math.sin(x / 520) - 0.0006 * Math.max(0, x - 300) ** 2;
// the bay's arm on the left: the shore runs from x = -560 (beside downtown) out to the left as it comes nearer
export const xLeft = (z) => (z < -1850 ? -430 - 50 * Math.sin(z / 300) : z < -900 ? -430 - 0.9 * (z + 1850) : -1285 - 2 * (z + 900));
// the far shore across the bay, ~11.5 km out, with hills behind it
export const zFar = (x) => -11500 - 600 * Math.sin(x / 2300);
export function shore(x, z) {
  if (z < zFar(x)) return zFar(x) - z;
  return Math.min(z - zBack(x), x - xLeft(z));
}
export const isLand = (x, z) => shore(x, z) > 0;

// the ground's height (m)
export function groundY(x, z) {
  // the hill you stand on: a ridge running left-right behind you, falling steeply toward the city
  const dz = z - 20, ax = Math.abs(x);
  const ridge = Math.exp(-Math.pow(Math.max(0, -dz) / 230, 1.7)) * Math.exp(-Math.pow(Math.max(0, ax - 220) / 700, 2));
  let y = 3 + (HILL - 4.5) * ridge;
  // the plain rises a little toward the hill
  y += 4 * smooth(-2600, -600, z);
  // the far shore: hills behind it
  if (z < zFar(x)) {
    const q = zFar(x) - z;
    y = 2 + smooth(0, 2500, q) * (330 + 150 * Math.sin(x / 1700) + 90 * Math.sin(x / 640 + 1.3) + 70 * Math.sin(q / 900));
    return y;
  }
  const sh = shore(x, z);
  if (sh < 0) y = Math.max(-12, 1.2 + sh * 0.02);           // under the bay
  else if (sh < 60) y = Math.min(y, 1.2 + sh * 0.05);       // the waterfront
  return y;
}

// ---- the city: buildings, planned once ----
// kind: 0 low (houses, shops), 1 mid-rise, 2 office, 3 glass tower; [x, z, w, d, h, kind, seed]
export const BLD = [];
{
  const R = rng(20260117);
  const BX = 96, BZ = 74, ROAD = 14;                         // blocks between the streets
  const dGZ = (x, z) => Math.hypot(x - GZ.x, (z - GZ.z) * 1.15);
  const add = (x, z, w, d, h, kind) => BLD.push({ x, z, w, d, h, kind, seed: R() });
  // which blocks are parks
  const park = (bx, bz) => { const r = Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453; return (r - Math.floor(r)) < 0.06; };
  for (let bz = -52; bz <= -4; bz++) {
    for (let bx = -40; bx <= 42; bx++) {
      const cx = bx * BX, cz = bz * BZ;
      if (cz > -330) continue;
      // keep to what you can see: a wedge in front of you, wider far off
      if (Math.abs(cx) > 260 + (-cz) * 0.36) continue;
      if (!isLand(cx, cz) || shore(cx, cz) < 50) continue;
      if (groundY(cx, cz) > 30) continue;                    // (not up on the hill)
      if (park(bx, bz) && dGZ(cx, cz) > 500) continue;
      const g = dGZ(cx, cz);
      const down = 1 - smooth(260, 1050, g);                 // 1 in the middle of downtown
      const mid = 1 - smooth(900, 2200, g);
      const far = -cz > 3400;
      // split the block into lots
      const W = BX - ROAD, D = BZ - ROAD;
      const nx = down > 0.3 ? (R() < 0.6 ? 1 : 2) : mid > 0.3 ? 2 + Math.floor(R() * 2) : 3 + Math.floor(R() * 2);
      const nz = down > 0.3 ? 1 : 2;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (R() < 0.08) continue;
        const lw = W / nx, ld = D / nz;
        const x = cx - W / 2 + lw * (i + 0.5) + (R() - 0.5) * 2, z = cz - D / 2 + ld * (j + 0.5) + (R() - 0.5) * 2;
        let w = lw * (0.78 + R() * 0.18), d = ld * (0.78 + R() * 0.18);
        let h, kind;
        if (down > 0.4 && R() < 0.3 + 0.6 * down) {
          // downtown: towers, tallest in the middle
          { const r = R(); h = 55 + (50 + 230 * down * down) * (0.25 + 0.75 * r * r); }
          kind = R() < 0.62 ? 3 : 2;
          w = Math.min(w, 26 + R() * 30); d = Math.min(d, 26 + R() * 30);
        } else if (mid > 0.25 && R() < 0.4 + 0.5 * mid) {
          h = 20 + (20 + 50 * mid) * R(); kind = R() < 0.3 ? 2 : 1;
        } else {
          h = far ? 10 + R() * 26 : 7 + R() * 16 * (0.4 + mid); kind = h > 16 ? 1 : 0;
        }
        add(x, z, w, d, h, kind);
      }
    }
  }
  // the landmark at ground zero: the tallest tower in town (380 m with its spire)
  add(GZ.x + 6, GZ.z + 4, 44, 44, 342, 4);
  // houses down the hillside under the terrace (seen between the people near the railing)
  for (let k = 0; k < 420; k++) {
    const x = (R() - 0.5) * 900, z = -80 - Math.pow(R(), 0.8) * 330;
    const gy = groundY(x, z);
    if (gy < 8 || gy > 95) continue;
    if (Math.abs(x) < 40 && z > -110) continue;
    add(x, z, 9 + R() * 8, 8 + R() * 7, 5 + R() * 6, 5);
  }
  for (const b of BLD) {
    b.y = groundY(b.x, b.z) - (b.kind === 5 ? 3 : 0.5);
    b.g = Math.hypot(b.x - GZ.x, b.z - GZ.z);                // distance from ground zero (m)
    b.dist = Math.hypot(b.x, b.z);                           // distance from you
  }
}

// the streets' grid (for the land shader and the traffic)
export const GRID = { BX: 96, BZ: 74, ROAD: 14 };

// trees: on the hill round the terrace, down the slope, in the parks
export const TREES = [];
{
  const R = rng(4242);
  for (let k = 0; k < 900; k++) {
    const x = (R() - 0.5) * 1000, z = 30 - Math.pow(R(), 0.7) * 520;
    if (Math.abs(x) < TER_X + 2 && z > RAIL_Z - 4 && z < 12) continue;
    const gy = groundY(x, z);
    if (gy < 6) continue;
    TREES.push({ x, z, y: gy, r: 3 + R() * 4, h: 6 + R() * 9, seed: R() });
  }
}

export const clampN = clamp;
