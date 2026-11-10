// The buildings round the crossing and what happens to them (pure data: shibuya.js draws it, audio.mjs hears it).
//   B: every block (centre, size, height, colour, seed). Q-Front (QF), Scramble Square (SQ), 109 (L109).
//   FIRES: on the first afternoon, stoves left on at lunch and cars that crashed into shopfronts set buildings
//          alight; they burn through the night and are left charred.
//   FALL: with nobody to maintain them, buildings fall apart over the decades: low ones first (from ~45 years),
//         towers after 130+ years. Each collapses into a heap of rubble in a cloud of dust (`v` = video time).
import { rng, keys } from './util.js';
import { RX, RZ, CW } from './traffic.js';
import { tauAt, yearsAt, V_RISE, V_SUNUP } from './timeline.js';

export const EX = RX + CW + 2, EZ = RZ + CW + 2;               // where the blocks start
export const QF = { x0: -EX - 27, x1: -EX, z0: -EZ - 24, z1: -EZ };   // Q-Front, the giant-screen building on the far corner
export const SQ = { x0: EX, x1: EX + 50, z0: -EZ - 44, z1: -EZ };    // Shibuya Scramble Square over the station
export const L109 = { x: -200, z: 0, r: 13 };                        // Shibuya 109 where the road forks

export const B = [];
{
  const R = rng(1109);
  const pal = [0xb9b2a6, 0xa49d92, 0x8f8c88, 0xd1cbc0, 0x7f7a74, 0xc8c1b5, 0x6f747a, 0x9da4ab, 0xb3a28c, 0x8a7f73];
  const glassPal = [0x55697d, 0x5e7690, 0x6f879b, 0x46586a];
  const addB = (x0, x1, z0, z1, h, color, tag) => B.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h, color: color ?? pal[Math.floor(R() * pal.length)], seed: R(), tag });
  const inBox = (x, z, b, m = 2) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
  const clear = (x, z) => inBox(x, z, QF) || inBox(x, z, SQ) || Math.hypot(x - L109.x, z - L109.z) < 22;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++) {
        const bx0 = EX + col * 46, bz0 = EZ + row * 42;
        let x = bx0;
        while (x < bx0 + 38) {
          const w = 7 + R() * 14;
          let z = bz0;
          while (z < bz0 + 34) {
            const d = 9 + R() * 14;
            const cx = sx * (x + Math.min(w, bx0 + 38 - x) / 2), cz = sz * (z + Math.min(d, bz0 + 34 - z) / 2);
            if (!clear(cx, cz)) {
              let h = 14 + Math.pow(R(), 1.3) * 36 + (Math.hypot(cx, cz) > 150 ? R() * 20 : 0);
              if (R() < 0.05) h = 70 + R() * 70;
              const X0 = sx > 0 ? x : -(x + Math.min(w, bx0 + 38 - x)), X1 = sx > 0 ? x + Math.min(w, bx0 + 38 - x) : -x;
              const Z0 = sz > 0 ? z : -(z + Math.min(d, bz0 + 34 - z)), Z1 = sz > 0 ? z + Math.min(d, bz0 + 34 - z) : -z;
              addB(X0 + 0.25, X1 - 0.25, Z0 + 0.25, Z1 - 0.25, h, h > 70 ? glassPal[Math.floor(R() * glassPal.length)] : undefined);
            }
            z += d;
          }
          x += w;
        }
      }
    }
  }
  addB(SQ.x0, SQ.x1, SQ.z0, SQ.z1, 230, 0x5a6f84, 'SQ');
  addB(QF.x0, QF.x1, QF.z0, QF.z1, 38, 0x3f4a55, 'QF');
}
export const insideB = (x, z, m = 0.5) => B.some((b) => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m);

// video time at which the story clock reaches tau seconds (the clock only runs forward)
export function vAtTau(tau) {
  let lo = V_RISE - 9, hi = 90;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (tauAt(m) < tau) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const HOUR = 3600, YR = 365.25 * 86400;
// what the camera sees from above at video time v (same orbit as main.js): 0 = out of frame .. 1 = centre
export const droneAz = (v) => keys([[V_RISE, 47], [16, 50], [V_SUNUP, 82], [80, 90]], v);
export function seen(b, v) {
  const A = droneAz(v) * Math.PI / 180, el = 40 * Math.PI / 180, D = 128;
  const cx = -4 + Math.sin(A) * Math.cos(el) * D, cy = Math.sin(el) * D, cz = -4 + Math.cos(A) * Math.cos(el) * D;
  const dx = b.x - cx, dz = b.z - cz, dy = Math.min(b.h * 0.6, 35) - cy, hd = Math.hypot(dx, dz);   // (tall towers: the part in frame)
  const yawTo = Math.atan2(-dx, -dz), camYaw = A;
  let dyaw = (yawTo - camYaw) * 180 / Math.PI; dyaw = ((dyaw + 540) % 360) - 180;
  const pitchTo = Math.atan2(dy, hd) * 180 / Math.PI, dp = pitchTo - -30;
  if (Math.abs(dyaw) > 16 || Math.abs(dp) > 27 || hd > 330) return 0;
  return (1 - Math.abs(dyaw) / 16) * (1 - Math.abs(dp) / 27);
}
const inView = (b) => seen(b, 21) > 0.05;

export const FIRES = [];
{
  const R = rng(611);
  const pick = B.map((b, i) => i).filter((i) => inView(B[i]) && B[i].h > 14 && B[i].h < 80 && !B[i].tag && Math.hypot(B[i].x, B[i].z) > 30);
  pick.sort((a, b2) => seen(B[b2], 21) * (1 + B[b2].h / 60) - seen(B[a], 21) * (1 + B[a].h / 60));
  pick.length = Math.min(pick.length, 30);
  const starts = [0.25, 0.5, 0.9, 1.4, 2.0, 2.8, 3.6, 4.6, 5.8, 7.0, 1.1, 3.1, 0.7, 1.7, 2.4, 4.0];
  for (const h of starts) {
    const i = pick.splice(Math.floor(R() * pick.length), 1)[0];
    const b = B[i];
    const t0 = h * HOUR, t1 = t0 + (13 + R() * 9) * HOUR;   // (burning on into the next morning)
    FIRES.push({ i, x: b.x, z: b.z, y: b.h, size: Math.min(b.w, b.d) * 0.6, t0, t1, v0: vAtTau(t0), v1: vAtTau(t1) });
  }
}

export const FALL = B.map(() => null);
export let SHOWCASE = -1;
{
  const R = rng(4096);
  B.forEach((b, i) => {
    if (b.tag === 'SQ') return;
    const r = R(), r2 = R(), vis = Math.max(seen(b, 40), seen(b, 50));
    let yr = null;
    if (b.tag === 'QF') yr = 150;
    else if (b.h < 30) { if (r < (vis > 0 ? 0.85 : 0.6)) yr = 24 + r2 * 210; }   // (in view, most of them go)
    else if (b.h < 70) { if (r < (vis > 0 ? 0.75 : 0.42)) yr = 60 + r2 * 200; }
    else if (r < (vis > 0 ? 0.6 : 0.3)) yr = 120 + r2 * 160;
    if (yr !== null) { const v = vAtTau(yr * YR); FALL[i] = { yr, v, left: 0.06 + R() * 0.24, tilt: (R() - 0.5) * 0.14 }; }
  });
  // the towers you can see come down one after another, each in its own cloud of dust
  const heroYears = [32, 52, 78, 104, 128, 140, 160, 176, 190, 205, 222, 236];
  const used = new Set();
  for (const yr of heroYears) {
    const v = vAtTau(yr * YR);
    let best = -1, bestS = 0;
    B.forEach((b, i) => { if (b.tag || used.has(i) || b.h < 36) return; const sc = seen(b, v) * Math.pow(b.h, 1.6); if (sc > bestS) { bestS = sc; best = i; } });
    if (best >= 0) { used.add(best); FALL[best] = { yr, v, left: 0.12 + R() * 0.15, tilt: (R() < 0.5 ? -1 : 1) * (0.08 + R() * 0.08), big: B[best].h > 70 ? 1 : 0 }; if (yr === 176) SHOWCASE = best; }
  }
  // and in the end the top half of the great tower over the station
  const sq = B.findIndex((b) => b.tag === 'SQ');
  FALL[sq] = { yr: 245, v: vAtTau(245 * YR), left: 0.48, tilt: 0.1, big: 1 };
}
export const fallSpan = (f) => (f.big ? 2.2 : 0.9);
export const FALL109 = vAtTau(212 * YR);   // (Shibuya 109 comes down too)   // how long a collapse takes on screen (video seconds)
export { yearsAt };
