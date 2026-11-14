// The people and cars, seen the way a time-lapse sees them: each frame catches different ones, smeared along their
// way (see-through ghosts drawn three times a little apart). Busy on frame 0; darker coats in winter; the new city's
// cars pale and sleek; thinning out and gone once the city empties. You (you.js) are the only one who stays sharp.
import * as THREE from 'three';
import { makeCrowd } from './crowd.js';
import { makeFleet } from './cars.js';
import { hazed } from './city.js';
import { AV, FX, CZ, CR, FZ, YOU, LANES_AV, LANES_CR, XWALK_S, XWALK_N, XWALK_E, XWALK_W } from './layout.js';
import { rng } from './util.js';

const NP = 110, NC = 30, COPIES = 3;
const SHIRT = [0x1d2230, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x3a3a3a, 0x24384a, 0x5a6a4a, 0xa8b4c8, 0x7a2a2a, 0xc84a3a, 0x4a5a7a, 0xd8d2c4, 0xe0b040, 0x3a7a6a, 0xb07aa0];
const PANTS = [0x23252b, 0x2c3340, 0x3a4a6a, 0x8a7a66, 0x1a1a1a, 0x4a4a4a, 0x2a3a5a, 0xc8bca8];
const SKIN = [0xf1c8a6, 0xe0ac86, 0xc68a62, 0x9a6440, 0x6e4528, 0xf6d5bd, 0xd59b72];
const HAIR = [0x1d1612, 0x2e2018, 0x4a3020, 0x6b4a2a, 0xa07a48, 0xd8c08a, 0x151515];
const COAT = [0x1a1c22, 0x2a2420, 0x3a2a2a, 0x22303a, 0x4a3a2a];
const PAINT_A = [0xe8e8e8, 0xc02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0x8a1a1a, 0xf0c030];
const PAINT_B = [0xf4f4f2, 0xdfe4e8, 0xc8d4dc, 0x9ad0d0, 0xe8e0d0, 0x40a0b0];

// where people walk: [x0, z0, x1, z1, half-width]
const SIDE = AV + WALK_MID();
function WALK_MID() { return (FX - AV) / 2; }
const PATHS = [];
for (const sx of [-1, 1]) {
  PATHS.push([sx * SIDE, 70, sx * SIDE, CZ + CR + 0.5, 1.9]);          // avenue sidewalks, south of the cross street
  PATHS.push([sx * SIDE, CZ - CR - 0.5, sx * SIDE, -130, 1.9]);       // north of it
}
for (const sz of [-1, 1]) {
  PATHS.push([AV + 0.5, CZ + sz * (CR + WALK_MID()), 120, CZ + sz * (CR + WALK_MID()), 1.9]);   // cross street, east
  PATHS.push([-120, CZ + sz * (CR + WALK_MID()), -AV - 0.5, CZ + sz * (CR + WALK_MID()), 1.9]); // west
}
PATHS.push([-AV, (XWALK_S[0] + XWALK_S[1]) / 2, AV, (XWALK_S[0] + XWALK_S[1]) / 2, 1.5]);
PATHS.push([-AV, (XWALK_N[0] + XWALK_N[1]) / 2, AV, (XWALK_N[0] + XWALK_N[1]) / 2, 1.5]);
PATHS.push([(XWALK_E[0] + XWALK_E[1]) / 2, CZ - CR, (XWALK_E[0] + XWALK_E[1]) / 2, CZ + CR, 1.5]);
PATHS.push([(XWALK_W[0] + XWALK_W[1]) / 2, CZ - CR, (XWALK_W[0] + XWALK_W[1]) / 2, CZ + CR, 1.5]);
// weights: length, with the near ones (in view) counted more
const W = PATHS.map(([x0, z0, x1, z1]) => { const L = Math.hypot(x1 - x0, z1 - z0); const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; return L * (Math.hypot(mx, mz - CZ) < 40 ? 3 : 1); });
const WSUM = W.reduce((a, b) => a + b, 0);

export const ghostMatOf = (hazedFn) => (color, rough = 0.8, extra = {}) => hazedFn(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra, transparent: true, opacity: 0.5, depthWrite: true }));
export function makeGhosts(scene, ctx, camPos) {
  const ghostMat = (color, rough = 0.8, extra = {}) => hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra, transparent: true, opacity: 0.5, depthWrite: true }));
  const pmat = ghostMat(0xffffff, 0.82);
  const crowd = makeCrowd(scene, NP * COPIES, pmat, { castShadow: false });
  for (const m of crowd.meshes) m.renderOrder = 2;
  const carCtx = {
    plainMat: (c, r, x = {}) => ghostMat(c, r, x),
    glowMat: (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4 }),
    shadowy: (m) => { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.renderOrder = 2; return m; },
  };
  const fleet = makeFleet(scene, NC * COPIES, carCtx);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color(), col2 = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // nobody walks through the lens, through you, or between the camera and you (they'd cover you)
  const segD = (x, z, ax, az, bx, bz) => { const ux = bx - ax, uz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz))); return Math.hypot(x - ax - ux * t, z - az - uz * t); };
  const tooClose = (x, z) => Math.hypot(x - camPos.x, z - camPos.z) < 2.2 || segD(x, z, camPos.x, camPos.z, YOU.x, YOU.z) < 1.3;

  return {
    frame(v, s) {
      const fr = Math.floor(v * 60 + 0.5);
      const R = rng(fr * 7919 + 13);
      const winter = s.season.snow;
      // ---- people ----
      for (let k = 0; k < NP; k++) {
        const on = R() < s.people * (0.75 + 0.25 * (1 - winter));
        let w = R() * WSUM, pi = 0;
        while (w > W[pi] && pi < W.length - 1) { w -= W[pi]; pi++; }
        const [x0, z0, x1, z1, hw] = PATHS[pi];
        const u = R(), off = (R() * 2 - 1) * hw, dir = R() < 0.5 ? 1 : -1;
        const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
        const x = x0 + (x1 - x0) * u - tz * off, z = z0 + (z1 - z0) * u + tx * off;
        const yaw = Math.atan2(tx * dir, tz * dir), walk = R() * 6.28;
        const shirt = R(), pants = R(), skin = R(), hair = R(), coat = R();
        for (let c = 0; c < COPIES; c++) {
          const i = k * COPIES + c;
          const cx = x - tx * dir * c * 0.32, cz = z - tz * dir * c * 0.32;
          if (!on || tooClose(cx, cz)) { crowd.pose(i, { x: 0, y: 0, z: 0, visible: false }); continue; }
          col.set(SHIRT[Math.floor(shirt * SHIRT.length)]).lerp(col2.set(COAT[Math.floor(coat * COAT.length)]), winter * 0.85);
          crowd.color(i, col.getHex(), PANTS[Math.floor(pants * PANTS.length)], SKIN[Math.floor(skin * SKIN.length)], HAIR[Math.floor(hair * HAIR.length)]);
          crowd.pose(i, { x: cx, y: 0, z: cz, yaw, walk: walk + c * 0.9, stride: 1 });
        }
      }
      crowd.commit();
      // ---- cars ----
      for (let k = 0; k < NC; k++) {
        const on = R() < s.people;
        const av = R() < 0.55;
        const lane = av ? LANES_AV[Math.floor(R() * 4)] : LANES_CR[Math.floor(R() * 4)];
        const along = av ? -180 + R() * 280 : -200 + R() * 400;
        const kind = Math.floor(R() * 4);
        const eraB = R() < s.eraB;
        const paint = eraB ? PAINT_B[Math.floor(R() * PAINT_B.length)] : PAINT_A[Math.floor(R() * PAINT_A.length)];
        for (let c = 0; c < COPIES; c++) {
          const i = k * COPIES + c;
          const a = along - lane[1] * c * 1.7;
          const x = av ? lane[0] : a, z = av ? a : lane[0];
          // (clear this slot in every car shape first: the shape changes from frame to frame)
          for (let kk = 0; kk < 4; kk++) { fleet.color(i, paint, kk); fleet.set(i, zero, false); }
          fleet.color(i, paint, eraB ? (kind % 2) : kind);
          if (!on || tooClose(x, z) || Math.hypot(x - camPos.x, z - camPos.z) < 5) { fleet.set(i, m4.makeScale(0, 0, 0), false); continue; }
          const yaw = av ? (lane[1] > 0 ? Math.PI : 0) : (lane[1] > 0 ? -Math.PI / 2 : Math.PI / 2);
          e.set(0, yaw, 0); q.setFromEuler(e);
          const sq = eraB ? 0.88 : 1;
          fleet.set(i, m4.compose(p.set(x, 0, z), q, one.set(1, sq, 1)), false);
        }
      }
      fleet.commit();
    },
  };
}
