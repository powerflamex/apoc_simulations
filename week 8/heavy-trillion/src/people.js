// The people, planned up front (pure data, so nobody jumps or walks through anybody):
//   STREET: the corner near you at midday: walkers on the west sidewalk north of you and on the far sidewalk, people
//     crossing the avenue on the south crosswalk (the cross street has the green), people waiting at the corner. Each
//     walks its own lane (one direction per lane, 2.6 m+ apart in it), so paths never cross. When the bench snaps
//     (V_SNAP) each one stops a moment later and turns to you; phones come up; when the sidewalk breaks (V_CRACK) the
//     nearest step back and some put their hands to their heads.
//   STATION (its own coordinates: you land at the origin on the track bed, the platform's edge at x = 1.55): people
//     waiting along the platform; when you crash through the roof (V_PUNCH) they flinch back from the edge, turn to
//     you, phones up; when the train's lights come (V_TRAIN) some wave at it.
import { rng, clamp, smooth } from './util.js';
import { V_SNAP, V_CRACK, V_PUNCH, V_LAND } from './timeline.js';
import { YOU, AV, FX, CZ, CR, XWALK_S } from './layout.js';
import { SKIN, HAIR } from './crowd.js';

export const V_TRAIN = 99;   // (no train after all: it was never in the shot)
const SHIRT = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0x264653, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x5a6a4a, 0x7a2a2a, 0xd8d2c4, 0x3a5a9a];
const PANTS = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x4a6a9a, 0xc9c2b6, 0x23252b, 0x3a4a6a, 0x8a7a66];

function dress(p, R) {
  p.shirt = SHIRT[Math.floor(R() * SHIRT.length)];
  p.pants = PANTS[Math.floor(R() * PANTS.length)];
  p.skin = SKIN[Math.floor(R() * SKIN.length)];
  p.hair = HAIR[Math.floor(R() * HAIR.length)];
  p.sleeves = R() < 0.55;
  p.ph = R() * 6.28;
  p.s = 0.93 + R() * 0.12;
  p.phone = R() < 0.55;
  p.gasp = R() < 0.3;
  p.react = 0.2 + R() * 0.45;
  return p;
}

export const STREET = [], STATION = [];
const SPEED = 1.35, STOP = 0.6;
{
  const R = rng(4242);
  const add = (p) => { p.i = STREET.length; STREET.push(dress(p, R)); };
  // walkers along z on the west sidewalk, north of you (they never come south of zMin); and on the east sidewalk
  const lanesZ = [
    { x: -11.5, dir: -1, z0: -2.5, z1: -7.6 }, { x: -10.6, dir: 1, z0: -7.6, z1: -3.0 }, { x: -9.9, dir: -1, z0: -2.8, z1: -7.6 },
    { x: 10.0, dir: 1, z0: -60, z1: 40 }, { x: 10.8, dir: -1, z0: 40, z1: -60 }, { x: 11.6, dir: 1, z0: -60, z1: 40 }, { x: 12.4, dir: -1, z0: 40, z1: -60 },
    { x: 13.2, dir: 1, z0: -60, z1: 40 },
  ];
  for (const L of lanesZ) {
    // the corner (the cross street) is in the way north of z = -25: keep them south of it
    const lo = Math.max(Math.min(L.z0, L.z1), CZ + CR + 0.5), hi = Math.max(L.z0, L.z1);
    for (let z = lo + R() * 2; z < hi - 0.5; z += 2.6 + R() * 3.5) {
      // where they are at v = 0, walking along the lane; they stop at their lane's end
      const end = L.dir > 0 ? hi : lo;
      add({ kind: 'walk', ax: L.x, az: z, dx: 0, dz: L.dir, len: Math.abs(end - z), t0: -0.0 });
    }
  }
  // crossing the avenue on the south crosswalk (along x), one direction per lane
  const lanesX = [{ z: XWALK_S[0] + 0.5, dir: 1 }, { z: XWALK_S[0] + 1.3, dir: -1 }, { z: XWALK_S[0] + 2.1, dir: 1 }, { z: XWALK_S[0] + 2.9, dir: -1 }, { z: XWALK_S[0] + 3.6, dir: 1 }];
  for (const L of lanesX) for (let x = -AV + 0.6 + R() * 1.5; x < AV - 1.0; x += 2.8 + R() * 3) {
    const end = L.dir > 0 ? AV - 0.3 : -AV + 0.3;
    add({ kind: 'walk', ax: x, az: L.z, dx: L.dir, dz: 0, len: Math.abs(end - x), t0: 0 });
  }
  // waiting at the corners for the light (facing the avenue)
  for (const [x0, z0, yaw] of [[-9.0, CZ + CR + 1.0, Math.PI / 2], [AV + 1.0, CZ + CR + 1.0, -Math.PI / 2]]) {
    for (let k = 0; k < 7; k++) add({ kind: 'wait', x: x0 + (x0 < 0 ? -1 : 1) * (Math.floor(k / 3) * 0.8 + R() * 0.2), z: z0 + (k % 3) * 0.9 + R() * 0.2, yaw: yaw + (R() - 0.5) * 0.4 });
  }
  // a few people standing about near you on your own sidewalk (a man by the lamp, two talking by the shop)
  for (const [x, z, yaw] of [[-12.6, -4.2, 2.2], [-13.2, -5.0, 0.6], [-8.8, -6.0, 3.0], [-13.0, -8.5, 0.2], [-12.2, -9.2, 3.4]]) add({ kind: 'wait', x, z, yaw });
}
{
  const R = rng(5151);
  const add = (p) => { p.i = STATION.length; STATION.push(dress(p, R)); };
  // standing along both platforms (x from the edge), the near one clear of the camera's corner (x 2.2-4.6, z 0-8)
  const spots = [];
  for (let n = 0; n < 900 && spots.length < 70; n++) {
    const sd = n % 3 === 0 ? 1 : -1;
    const x = sd * (2.1 + R() * 5.2), z = -24 + R() * (sd > 0 ? 32 : 30);
    if (sd > 0 && x < 4.8 && z > -0.5 && z < 8) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 0.85)) continue;
    spots.push({ x, z });
  }
  for (const s of spots) add({ kind: 'wait', x: s.x, z: s.z, yaw: -Math.sign(s.x) * Math.PI / 2 + (R() - 0.5) * 1.2 });
}

// where person p is at time v: { x, z, yaw, moving }
const stopTime = (p) => V_SNAP + p.react;
export function streetPersonAt(p, v) {
  if (p.kind === 'wait') {
    const k = smooth(stopTime(p), stopTime(p) + 0.5, v);
    const face = Math.atan2(YOU.x - p.x, YOU.z - p.z);
    let d = face - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    return { x: p.x, z: p.z, yaw: p.yaw + d * k, moving: false, look: 0 };
  }
  const ts = stopTime(p);
  const tw = Math.min(v, ts) - p.t0;
  let u = SPEED * tw;
  if (v > ts) { const d = Math.min(v - ts, STOP); u += SPEED * (d - d * d / (2 * STOP)); }
  const uc = clamp(u, 0, p.len);
  const x = p.ax + p.dx * uc, z = p.az + p.dz * uc;
  const yaw0 = Math.atan2(p.dx, p.dz);
  const k = smooth(ts + 0.2, ts + 0.8, v);
  const face = Math.atan2(YOU.x - x, YOU.z - z);
  let d = face - yaw0; d = Math.atan2(Math.sin(d), Math.cos(d));
  return { x, z, yaw: yaw0 + d * k, moving: u > 0 && u < p.len && v < ts + STOP, look: 0 };
}
// station: they flinch back from the edge as you crash in
export function stationPersonAt(p, v) {
  const t0 = V_PUNCH + 0.35 + p.react * 0.5;
  const back = smooth(t0, t0 + 0.7, v) * (Math.abs(p.x) < 4.5 ? 1.0 : 0.4);
  const x = p.x + Math.sign(p.x) * back;
  const face = Math.atan2(0 - x, 0 - p.z);
  let d = face - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  const k = smooth(t0, t0 + 0.5, v);
  return { x, z: p.z, yaw: p.yaw + d * k, moving: false, back };
}
// arms: phones up a while after, hands to the head for some
export function armsAt(p, v, t0) {
  const ph = p.phone ? smooth(t0 + 1.0, t0 + 1.8, v) : 0;
  const g = p.gasp ? smooth(t0 + 0.1, t0 + 0.4, v) * (1 - smooth(t0 + 2.2, t0 + 3.0, v)) : 0;
  return { armL: Math.max(g * 1.5, 0), armR: Math.max(ph, g * 1.5) };
}
export { stopTime, V_LAND };
