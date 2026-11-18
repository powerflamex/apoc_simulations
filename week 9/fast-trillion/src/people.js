// The people on the sidewalks: a busy right sidewalk a few metres from you, a quieter far one, groups waiting at the
// corners. Each person comes from a hash of an index (walkers keep to bands by direction and speed, so nobody walks
// into anybody), and only the ones near you are posed (a ring buffer). The blast decides the rest: from ~2 psi (the
// people nearest you as you go supersonic, then further out) a person is knocked flat, away from your path; from ~8 psi
// thrown. Before you reach them, the ones ahead turn to look as you come.
import { hh, CURB_R, BLD_R, CURB_L, BLD_L, XST, XST0, XST_W, xstreetAt, PLAZA } from './avenue.js';
import { tPass, blastAt, distAt, PSI, CITY_END } from './timeline.js';
import { SKIN, HAIR } from './crowd.js';
import { clamp, smooth } from './util.js';

const SHIRTS = [0x2e5fa8, 0xb8322c, 0xf0ece0, 0x2a2a2e, 0x5d7a3a, 0xe0a030, 0x7a4a8a, 0x3a8a8a, 0xd86a8a, 0x8a6a4a, 0x444a58, 0xc8c0b0];
const PANTS = [0x22252c, 0x3a4a6a, 0x2e2a26, 0x6a604e, 0x1a1a1e, 0x8a8478];
export const SLOT = 2.0;           // one person per 2 m of sidewalk on your side
export const MAXP = 700;

// person index n on a side: { s0 (where at v = 0), x, dir (+1 with you, -1 against, 0 standing), sp, look... }
export function personSpec(n, side) {
  const r = (k) => hh(n, side * 17 + 3, k);
  const wide = side > 0 ? [CURB_R + 0.55, BLD_R - 0.45] : [BLD_L + 0.45, CURB_L - 0.55];
  if (r(0) < (side > 0 ? 0.08 : 0.45)) return null;        // gaps (the far side is quieter)
  const kind = r(1);
  let x, dir, sp;
  const t = (wide[1] - wide[0]);
  if (kind < 0.3) { dir = 0; sp = 0; x = r(2) < 0.5 ? wide[0] + 0.15 + 0.4 * r(3) : wide[1] - 0.2 - 0.4 * r(3); }
  else if (kind < 0.65) { dir = 1; sp = 1.25; x = wide[0] + t * (0.32 + 0.12 * r(2)); }
  else { dir = -1; sp = 1.35; x = wide[0] + t * (0.62 + 0.12 * r(2)); }
  const s0 = n * SLOT + 0.8 * (r(4) - 0.5);
  return {
    n, side, s0, x, dir, sp, phase: r(5) * 6.28, phone: dir === 0 && r(6) < 0.4, s: 0.92 + 0.14 * r(7),
    shirt: SHIRTS[Math.floor(r(8) * SHIRTS.length)], pants: PANTS[Math.floor(r(9) * PANTS.length)],
    skin: SKIN[Math.floor(r(10) * SKIN.length)], hair: HAIR[Math.floor(r(11) * HAIR.length)], sleeves: r(12) < 0.6,
    face: dir === 0 ? (r(13) < 0.5 ? Math.PI / 2 * side : r(13) * 6.28) : 0, roll: r(14),
  };
}

// where a person is and how they're posed at video time v (null if they're not around)
export function personAt(P, v, out = {}) {
  const sNow = P.s0 + P.dir * P.sp * v;
  if (sNow < -60 || sNow > PLAZA - 2 || Math.abs(sNow - xstreetAt(sNow)) < XST_W / 2 - 0.5) return null;
  const r = Math.hypot(P.x, 1.0);
  // the blast where they are: when it hits and how hard
  const b = blastAt(sNow, r);
  const hit = v >= b.t ? b : null;
  const psi = b.pa / PSI;
  out.x = P.x; out.y = 0; out.z = -sNow; out.s = P.s;
  out.yaw = P.dir === 0 ? P.face : P.dir > 0 ? Math.PI : 0;   // (the figures face +z at yaw 0)
  out.walk = P.phase + v * 6.2 * P.sp; out.stride = P.dir === 0 ? 0 : 1;
  out.pitch = 0; out.roll = 0; out.armL = 0; out.armR = P.phone ? 1 : 0; out.look = 0; out.sit = 0;
  // you coming: the ones just ahead of you turn to look (less than a second's warning at frame 0)
  const you = distAt(v), ahead = sNow - you;
  if (!hit) {
    const k = smooth(40, 6, ahead) * (ahead > -3 ? 1 : 0);
    if (k > 0) { const face = P.side > 0 ? -Math.PI / 2 : Math.PI / 2; out.yaw += (face - out.yaw) * k * 0.6; }
    return out;
  }
  // hit: knocked flat away from your path (from ~2 psi), thrown (from ~8 psi); a stagger below that
  const age = v - b.t;
  const away = P.x > 0 ? 1 : -1;
  if (psi < 1.4) {
    out.pitch = -0.25 * Math.exp(-age * 3) * Math.sin(age * 9); out.stride = 0; out.armL = 0.6; out.armR = 0.6;
    return out;
  }
  out.stride = 0; out.walk = 0;
  const sH = P.s0 + P.dir * P.sp * b.t;
  out.yaw = away > 0 ? -Math.PI / 2 : Math.PI / 2;           // facing your path, so falling backward = away from it
  const fall = smooth(0, 0.45, age);
  const throwK = clamp((psi - 2) / 8, 0, 1);
  const dist = (0.4 + 5 * throwK) * (1 - Math.exp(-age * 4));
  out.x = clamp(P.x + away * dist, BLD_L + 0.3, BLD_R - 0.3);
  out.y = throwK > 0.4 ? Math.max(0, 1.2 * throwK * Math.sin(Math.PI * clamp(age / (0.25 + 0.4 * throwK), 0, 1))) : 0;
  out.pitch = -Math.PI / 2 * 0.97 * fall;
  out.roll = (P.roll - 0.5) * 0.6 * fall;
  out.armL = 1.4 * fall; out.armR = 1.2 * fall;
  out.z = -sH - (0.3 + 1.2 * throwK) * (1 - Math.exp(-age * 3));
  return out;
}

export function makePeople(crowd) {
  const spare = { x: 0, y: -100, z: 0, visible: false };
  const tmp = {};
  return {
    frame(v, s, visible) {
      let i = 0;
      if (visible) {
        const sa = Math.max(-80, s - 420), sb = Math.min(PLAZA, s + 520);
        for (const side of [1, -1]) {
          // walkers drift up to ~65 m in the video: widen the index range by that
          const n0 = Math.floor((sa - 70) / SLOT), n1 = Math.ceil((sb + 70) / SLOT);
          for (let n = n0; n <= n1 && i < MAXP; n++) {
            const P = cache(n, side);
            if (!P) continue;
            const o = personAt(P, v, tmp);
            if (!o) continue;
            const sNow = -o.z;
            if (sNow < sa || sNow > sb) continue;
            crowd.color(i, P.shirt, P.pants, P.skin, P.hair, P.sleeves);
            crowd.pose(i, o);
            i++;
          }
        }
      }
      for (let k = i; k < MAXP; k++) crowd.pose(k, spare);
      crowd.commit();
    },
  };
}
const CACHE = new Map();
function cache(n, side) {
  const key = n * 2 + (side > 0 ? 0 : 1);
  if (!CACHE.has(key)) CACHE.set(key, personSpec(n, side));
  return CACHE.get(key);
}
