// The people, planned once up front (pure data) so nobody walks through anybody or jumps:
//   RUSH: the corner at rush hour (frame 0 to the cut at V_DUSK): people crossing the avenue on both crosswalks (the
//     cross street has the green), walking the sidewalks both ways, waiting at the four corners, packed round you. About
//     half are men and boys. At V_EVENT the men vanish mid-step: the body is gone, the clothes drop (the shirt and the
//     trousers fall and crumple into a heap, the shoes stay), what they held falls (phones, bags, coffee). The women
//     stop dead, then stand looking round; some kneel by a heap; then everyone looks up at the jet (V_PLANE), toward the
//     smoke (V_BOOM) and up at the crane's load (V_CRANE).
//     Each path is checked against everyone already placed (0.1 s steps) and against the cars that roll on with nobody
//     at the wheel, and dropped if it ever comes within GAP of anything.
//   MORNING (the next day): women on the corner among the clothes; they turn to the jet, then to its smoke.
//   The time-lapses (day 1, day 2 evening, days 3-14, the months after): passers-by, each there for a moment.
//   PREG: one woman on the bench by you every morning for nine months, her belly growing.
//   BABY (day 280): the first new baby in its mother's arms on the corner, women round her; the street busy again.
import { rng, clamp, smooth } from './util.js';
import { V_EVENT, V_NIGHT1, V_MORN, V_BOOM, V_CRANE, V_DUSK, V_TRUCK, V_LAPSE, V_LAB, V_PREG, V_BABY, T_SWITCH, sceneAt } from './timeline.js';
import { CAM0, AV, FX, CZ, CR, FZ, XWALK_S, XWALK_N, HYDRANT, BIN, SIGNALS, LAMPS, TREES, BENCH, MOTHER, HWY, PROPS } from './layout.js';
import { CARS, carAt, JACK } from './traffic.js';

const GAP = 0.72;
const STOP = 0.7;                  // seconds from walking to standing (the women, when it happens)

// where person p is at time v: { x, z, yaw, moving, d (distance walked) }
export function personAt(p, v) {
  if (p.kind === 'wait') return { x: p.x, z: p.z, yaw: p.yaw, moving: false, d: 0 };
  const t = v - p.t0;
  let u = p.u0 + p.speed * t;
  if (p.stopAt !== undefined && v > p.stopAt) {
    const te = p.stopAt - p.t0, d = Math.min(v - p.stopAt, STOP);
    u = p.u0 + p.speed * te + p.speed * (d - d * d / (2 * STOP));
  }
  const uc = clamp(u, 0, p.len);
  const moving = u > 0 && u < p.len && !(p.stopAt !== undefined && v > p.stopAt + STOP);
  return { x: p.ax + p.dx * uc, z: p.az + p.dz * uc, yaw: Math.atan2(p.dx, p.dz), moving, d: uc };
}

export const PEOPLE = [];   // everyone, all scenes: { scene: 'rush' | 'dusk' | ..., man, ... }
export const ITEMS = [];    // what the men were holding (it drops when they vanish)
export const HEAPS = [];    // the clothes they leave
const SHIRT_M = [0x1d2230, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x3a3a3a, 0x24384a, 0x5a6a4a, 0xa8b4c8, 0x7a2a2a, 0x2a2a2a, 0x4a5a7a, 0xd8d2c4];
const PANTS_M = [0x23252b, 0x2c3340, 0x3a4a6a, 0x8a7a66, 0x1a1a1a, 0x4a4a4a, 0x2a3a5a];
const SHIRT_W = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0xf28482, 0xc9c1b1, 0x264653, 0xe8e2d6, 0x9c6644];
const DRESS = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0xf28482, 0x3a5a9a];
const PANTS_W = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x4a6a9a, 0xc9c2b6];
const SKIN = [0xf1c8a6, 0xe0ac86, 0xc68a62, 0x9a6440, 0x6e4528, 0xf6d5bd, 0xd59b72];
const HAIR = [0x1d1612, 0x2e2018, 0x4a3020, 0x6b4a2a, 0xa07a48, 0xd8c08a, 0x151515, 0x8a5a30];
const BAG = [0xc1121f, 0x1d1d1d, 0xf4e3c1, 0x6f4518, 0xe76f51, 0x2a9d8f, 0xffffff, 0xe9c46a, 0x7b2cbf];

// a look for a person: men (short hair, shirts and trousers, often a dark suit), women (long hair, skirts and dresses)
function dress(p, R) {
  p.skin = SKIN[Math.floor(R() * SKIN.length)];
  p.hair = HAIR[Math.floor(R() * HAIR.length)];
  p.ph = R() * 6.28;
  if (p.man) {
    const suit = R() < 0.35;
    p.shirt = suit ? [0x1d2230, 0x2a2a2a, 0x2b3a55, 0x3a3a3a][Math.floor(R() * 4)] : SHIRT_M[Math.floor(R() * SHIRT_M.length)];
    p.pants = suit ? p.shirt : PANTS_M[Math.floor(R() * PANTS_M.length)];
    p.sleeves = suit || R() < 0.6;
    if (R() < 0.12) p.hair = 0x8c8c8c;
  } else {
    p.longHair = R() < 0.82;
    p.skirt = R() < 0.45 ? DRESS[Math.floor(R() * DRESS.length)] : 0;
    p.shirt = p.skirt && R() < 0.55 ? p.skirt : SHIRT_W[Math.floor(R() * SHIRT_W.length)];
    p.pants = PANTS_W[Math.floor(R() * PANTS_W.length)];
    p.sleeves = R() < 0.55;
    p.bag = R() < 0.55 ? BAG[Math.floor(R() * BAG.length)] : 0;
  }
  p.h = p.child ? 0.58 + R() * 0.16 : p.teen ? 0.86 + R() * 0.08 : p.man ? 0.98 + R() * 0.1 : 0.91 + R() * 0.09;
}

// the fixed things people stand clear of
const FIXED = [
  { x: HYDRANT.x, z: HYDRANT.z, r: 0.5 }, { x: BIN.x, z: BIN.z, r: 0.6 },
  ...PROPS.map((o) => ({ x: o.x, z: o.z, r: o.kind === 'cart' ? 1.3 : o.kind === 'planter' ? 1.0 : o.kind === 'meter' || o.kind === 'bollard' ? 0.35 : 0.5 })),
  { x: BENCH.x - 0.1, z: BENCH.z - 0.7, r: 0.55 }, { x: BENCH.x - 0.1, z: BENCH.z + 0.7, r: 0.55 }, { x: BENCH.x - 0.1, z: BENCH.z, r: 0.55 },
  ...SIGNALS.map((s) => ({ x: s.x, z: s.z, r: 0.45 })),
  ...LAMPS.filter((l) => Math.abs(l.z - CZ) < 60 && Math.abs(l.x) < 60).map((l) => ({ x: l.x, z: l.z, r: 0.4 })),
  ...TREES.filter((t) => Math.abs(t.z - CZ) < 70 && Math.abs(t.x) < 70).map((t) => ({ x: t.x, z: t.z, r: 0.6 })),
];

// ---------------- the corner at rush hour ----------------
const T0 = -1.2, T1 = V_NIGHT1, DT = 0.1;
{
  const R = rng(1751);
  const cand = [];
  const sx = () => (R() < 0.5 ? -1 : 1);
  // crossing the avenue on the south and north crosswalks (both ways)
  for (let i = 0; i < 1400; i++) {
    const zr = R() < 0.62 ? XWALK_S : XWALK_N;
    const z = zr[0] + 0.5 + R() * (zr[1] - zr[0] - 1.0);
    const s = sx(), x0 = s * (AV + 0.8 + R() * 4.5), x1 = -s * (AV + 1.5 + R() * 4);
    const len = Math.abs(x1 - x0);
    cand.push({ kind: 'cross', ax: x0, az: z, dx: Math.sign(x1 - x0), dz: 0, len, u0: -6 + R() * (len + 6) * 0.95, speed: 1.2 + R() * 0.45 });
  }
  // walking the sidewalks (avenue: along z; cross street: along x), both ways, long paths
  for (let i = 0; i < 1600; i++) {
    if (R() < 0.6) {
      const s = sx(), x = s * (AV + 1.0 + R() * (FX - AV - 2.0)), dir = sx();
      const zA = dir < 0 ? 40 : -80;
      cand.push({ kind: 'walk', ax: x, az: zA, dx: 0, dz: dir, len: 120, u0: R() * 120, speed: 1.15 + R() * 0.4 });
    } else {
      const s = sx(), z = CZ + s * (CR + 1.0 + R() * (FZ - CR - 2.0)), dir = sx();
      const xA = dir > 0 ? -80 : 80;
      cand.push({ kind: 'walk', ax: xA, az: z, dx: dir, dz: 0, len: 160, u0: R() * 160, speed: 1.15 + R() * 0.4 });
    }
  }
  // waiting at the corners for the next green, and packed round you
  for (let i = 0; i < 2600; i++) {
    const r = R();
    if (r < 0.55) {   // your corner, and the sidewalk right round you
      cand.push({ kind: 'wait', x: -(AV + 0.6 + R() * 5.2), z: CZ + CR + 0.5 + R() * 15, yaw: 0, near: true });
    } else {
      const s = sx(), t = sx();
      cand.push({ kind: 'wait', x: s * (AV + 0.6 + R() * 5), z: CZ + t * (CR + 0.5 + R() * 5.5), yaw: 0 });
    }
  }
  // shuffle the near-camera candidates to the front so the space by you fills first
  cand.sort((a, b) => (b.near ? 1 : 0) - (a.near ? 1 : 0) + (R() - 0.5) * 0.3);

  // the cars that roll on with nobody at the wheel, sampled over the window (people keep out of their way)
  const NS = Math.round((T1 - T0) / DT) + 1;
  const carBoxes = Array.from({ length: NS }, (_, k) => {
    const v = T0 + k * DT;
    return CARS.filter((c) => c.moves).map((c) => carAt(c, v));
  });
  const grids = Array.from({ length: NS }, () => new Map());
  const blocked = (p) => {
    for (let k = 0; k < NS; k++) {
      const v = T0 + k * DT;
      if (p.man && v > V_EVENT + 0.05) break;
      const q = personAt(p, v);
      const cx = q.x - CAM0.x, cz = q.z - CAM0.z, cd = Math.hypot(cx, cz);
      if (cd < 2.7) return true;
      // (nobody walks straight at the lens from close by; nobody right at the lens on the side it turns to)
      if (cd < 6 && q.moving && -(cx * p.dx + cz * p.dz) / cd > 0.55) return true;
      // keep off the roads except on the crosswalks
      const onAv = Math.abs(q.x) < AV - 0.1, onCr = Math.abs(q.z - CZ) < CR - 0.1;
      const inS = q.z > XWALK_S[0] - 0.3 && q.z < XWALK_S[1] + 0.3, inN = q.z > XWALK_N[0] - 0.3 && q.z < XWALK_N[1] + 0.3;
      const inE = Math.abs(q.x) > AV + 0.6 && Math.abs(q.x) < AV + 5.4;
      if (onAv && !onCr && !inS && !inN) return true;
      if (onCr && !onAv && !inE) return true;
      if (onAv && onCr) return true;
      // buildings
      if (Math.abs(q.x) > FX - 0.4 && Math.abs(q.z - CZ) > FZ - 0.4) return true;
      // street furniture
      for (const o of FIXED) if ((q.x - o.x) ** 2 + (q.z - o.z) ** 2 < o.r * o.r) return true;
      // the moving cars
      for (const c of carBoxes[k]) {
        const ex = q.x - c.x, ez = q.z - c.z, ca = Math.cos(c.yaw), sa = Math.sin(c.yaw);
        const along = Math.abs(ex * -sa + ez * -ca), across = Math.abs(ex * ca - ez * sa);
        if (along < c.len / 2 + 0.8 && across < 1.5) return true;
      }
      const gx = Math.floor(q.x / GAP), gz = Math.floor(q.z / GAP);
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        const cell = grids[k].get(`${gx + ix},${gz + iz}`);
        if (cell) for (const o of cell) if ((o.x - q.x) ** 2 + (o.z - q.z) ** 2 < GAP * GAP) return true;
      }
    }
    return false;
  };
  const place = (p) => {
    for (let k = 0; k < NS; k++) {
      const v = T0 + k * DT;
      if (p.man && v > V_EVENT + 0.05) break;
      const q = personAt(p, v), kk = `${Math.floor(q.x / GAP)},${Math.floor(q.z / GAP)}`;
      (grids[k].get(kk) || grids[k].set(kk, []).get(kk)).push(q);
    }
  };
  const want = { cross: 150, walk: 200, wait: 260 }, got = { cross: 0, walk: 0, wait: 0 };
  for (const p of cand) {
    if (got[p.kind] >= want[p.kind]) continue;
    p.scene = 'rush';
    p.man = R() < 0.5;
    p.child = R() < 0.05;
    p.t0 = 0;
    if (!p.man && p.kind !== 'wait') p.stopAt = V_EVENT + 0.15 + R() * 0.45;   // (the women stop dead)
    if (p.kind === 'wait') p.yaw = p.near ? (R() < 0.45 ? -0.9 + (R() - 0.5) * 1.4 : 2.3 + (R() - 0.5) * 1.4) : Math.atan2(-p.x, CZ - p.z) + (R() - 0.5) * 1.6;
    if (blocked(p)) continue;
    place(p);
    got[p.kind]++;
    dress(p, R);
    // after: some turn right round, some hold up their phones, some kneel by a heap, hands to faces
    p.turn = (R() - 0.5) * 2.6;
    p.callPhone = R() < 0.4;
    p.kneel = R() < 0.07;
    p.cover = R() < 0.25;          // a hand to the mouth
    p.phone = p.man ? R() < 0.3 : R() < 0.15;
    p.coffee = p.man && R() < 0.12;
    PEOPLE.push(p);
    if (p.man) {
      const q = personAt(p, V_EVENT), fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), rx = -fz, rz = fx;
      const vel = q.moving ? p.speed : 0;
      HEAPS.push({ who: PEOPLE.length - 1, x: q.x, z: q.z, yaw: q.yaw, vx: fx * vel, vz: fz * vel, shirt: p.shirt, pants: p.pants, s: p.h, seed: R(), suit: p.shirt === p.pants });
      if (p.phone) ITEMS.push({ kind: 1, x: q.x + fx * 0.3 + rx * 0.15, z: q.z + fz * 0.3 + rz * 0.15, y0: 1.2 * p.h, vx: fx * vel * 0.9, vz: fz * vel * 0.9, yaw: q.yaw + (R() - 0.5) * 2, color: 0x111111, spin: (R() - 0.5) * 9 });
      if (p.coffee) ITEMS.push({ kind: 3, x: q.x + rx * 0.28, z: q.z + rz * 0.28, y0: 1.0 * p.h, vx: fx * vel * 0.9, vz: fz * vel * 0.9, yaw: R() * 6, color: 0xf4efe4, spin: (R() - 0.5) * 6 });
      if (R() < 0.3) ITEMS.push({ kind: 0, x: q.x - rx * 0.27, z: q.z - rz * 0.27, y0: 0.75 * p.h, vx: fx * vel * 0.85, vz: fz * vel * 0.85, yaw: q.yaw + (R() - 0.5), color: [0x2a1a10, 0x1d1d1d, 0x4a3a2a][Math.floor(R() * 3)], spin: (R() - 0.5) * 4 });
    }
  }
  console.log(`people: rush ${got.cross} crossing, ${got.walk} walking, ${got.wait} waiting; ${HEAPS.length} men vanish`);
}
// a dropped thing tau seconds after: a short fall, a bounce, a slide to rest
export function itemAt(it, tau) {
  const g = 9.8, tf = Math.sqrt(2 * it.y0 / g);
  const t = Math.max(0, tau);
  if (t < tf) return { x: it.x + it.vx * t, z: it.z + it.vz * t, y: it.y0 - 0.5 * g * t * t, tilt: t / tf };
  const s = Math.min(t - tf, 0.45), slide = 1 - (1 - s / 0.45) ** 2;
  return { x: it.x + it.vx * (tf + 0.18 * slide), z: it.z + it.vz * (tf + 0.18 * slide), y: 0, tilt: 1 };
}
// the clothes falling: k 0 (still hanging where he stood) .. 1 (a heap on the pavement)
export const HEAP_T = 0.42;
export function heapAt(h, tau) {
  const k = clamp(tau / HEAP_T);
  return { k: k * k, x: h.x + h.vx * Math.min(tau, HEAP_T) * 0.5, z: h.z + h.vz * Math.min(tau, HEAP_T) * 0.5 };
}

// ---------------- the later scenes ----------------
const WIN = { morning: [V_MORN, V_CRANE], crane: [V_CRANE, V_DUSK], dusk: [V_DUSK, V_TRUCK], highway: [V_TRUCK, V_LAPSE], shops: [V_LAPSE, V_LAB], preg: [V_PREG, V_BABY], baby: [V_BABY, T_SWITCH] };
const PLACED = {};
// is p clear of everyone already placed in its scene (and of you), all through the scene (or its brief moment)?
function clearOf(p, gap) {
  const [w0, w1] = p.tA !== undefined ? [p.tA, p.tB] : WIN[p.scene], others = PLACED[p.scene] || (PLACED[p.scene] = []);
  for (let v = w0; v <= w1 + 0.01; v += 0.2) {
    const q = personAt(p, v);
    const cp = p.scene === 'morning' ? { x: 3.4, z: -28.6 } : p.scene === 'baby' ? { x: MOTHER.x - 0.6, z: MOTHER.z + 3.1 } : p.scene === 'preg' ? { x: 11.6, z: -2.0 }
      : p.scene === 'dusk' ? { x: 9.2, z: 3.5 } : p.scene === 'shops' ? { x: 10.2, z: 8.0 } : CAM0;
    if (Math.hypot(q.x - cp.x, q.z - cp.z) < 1.8) return false;
    // (nobody between you and the mother, or between you and the bench)
    const tgt = p.scene === 'baby' && !p.mother ? MOTHER : p.scene === 'preg' && !p.bench ? BENCH : null;
    if (tgt) {
      const ux = tgt.x - cp.x, uz = tgt.z - cp.z, t = clamp(((q.x - cp.x) * ux + (q.z - cp.z) * uz) / (ux * ux + uz * uz));
      if (t < 1.15 && Math.hypot(cp.x + ux * t - q.x, cp.z + uz * t - q.z) < 1.3) return false;
    }
    const onAv = Math.abs(q.x) < AV + 0.3, onCr = Math.abs(q.z - CZ) < CR + 0.3;
    const inXw = (q.z > XWALK_S[0] - 0.2 && q.z < XWALK_S[1] + 0.2) || (q.z > XWALK_N[0] - 0.2 && q.z < XWALK_N[1] + 0.2);
    if (onAv && !inXw) return false;
    if (onCr) return false;   // (the cross street's traffic runs on: nobody stands or crosses in its lanes)
    if (Math.abs(q.x) > FX - 0.4 && Math.abs(q.z - CZ) > FZ - 0.4) return false;
    if (FIXED.some((o) => (q.x - o.x) ** 2 + (q.z - o.z) ** 2 < o.r * o.r)) return false;
    for (const o of others) {
      if (o.tA !== undefined && (v < o.tA || v > o.tB)) continue;
      const r = personAt(o, v); if ((r.x - q.x) ** 2 + (r.z - q.z) ** 2 < gap * gap) return false;
    }
  }
  return true;
}
function keepIn(p) { (PLACED[p.scene] || (PLACED[p.scene] = [])).push(p); PEOPLE.push(p); }
// n people in an area: standing (facing yaw +- a bit) or walking along the sidewalk; brief = there for a moment only
// (time-lapse passers-by, each on a different day)
function scatter(scene, n, seed, area, opts = {}) {
  const R = rng(seed);
  let got = 0;
  for (let k = 0; k < n * 40 && got < n; k++) {
    const x = area.x0 + R() * (area.x1 - area.x0), z = area.z0 + R() * (area.z1 - area.z0);
    const walk = R() < (opts.walk ?? 0);
    const dir = R() < 0.5 ? 1 : -1;
    const alongX = Math.abs(z - CZ) < FZ && Math.abs(x) > AV;   // (on the cross street's sidewalks: along x)
    const p = { scene, kind: walk ? 'walk' : 'wait', x, z, ax: x, az: z, dx: alongX ? dir : 0, dz: alongX ? 0 : dir, len: 400, u0: 200, t0: WIN[scene][0], speed: 1.1 + R() * 0.4,
      yaw: opts.yaw !== undefined ? opts.yaw + (R() - 0.5) * 1.4 : R() * 6.28 };
    if (opts.brief) { p.tA = WIN[scene][0] + R() * (WIN[scene][1] - WIN[scene][0] - 0.3); p.tB = p.tA + opts.brief[0] + R() * (opts.brief[1] - opts.brief[0]); p.t0 = p.tA; }
    if (walk) { p.ax = x - p.dx * 200; p.az = z - p.dz * 200; }
    p.man = false;
    p.child = R() < (opts.kids ?? 0);
    if (!clearOf(p, opts.gap ?? 1.0)) continue;
    dress(p, R);
    p.callPhone = R() < (opts.phones ?? 0.3);
    p.lookUp = R() < (opts.lookUp ?? 0);
    keepIn(p);
    got++;
  }
}
{
  const SE = { x0: AV + 0.5, x1: FX - 0.5, z0: CZ + CR + 0.5, z1: 12 };
  const NSIDE = { x0: -FX + 0.5, x1: FX - 0.5, z0: CZ - CR - 8, z1: CZ - CR };
  const ESIDE = { x0: AV + 0.5, x1: FX - 0.5, z0: CZ - CR - 40, z1: 14 };
  const WSIDE = { x0: -FX + 0.5, x1: -AV - 0.5, z0: CZ - CR - 40, z1: 14 };
  // the next morning: women on the corner among the clothes, standing about; they turn to the jet
  scatter('morning', 18, 21, SE, { phones: 0.4, gap: 1.3, yaw: -2.2 });
  scatter('morning', 18, 22, NSIDE, { phones: 0.3, gap: 1.5 });
  scatter('morning', 10, 32, WSIDE, { phones: 0.3, gap: 1.5, walk: 0.3 });
  scatter('morning', 9, 33, { x0: -AV, x1: AV, z0: XWALK_N[0], z1: XWALK_N[1] }, { phones: 0.3, gap: 1.4, yaw: Math.PI });
  // (and a few out in the empty north-bound lanes ahead of you, looking up the avenue)
  {
    const R = rng(34);
    for (const [x, z] of [[1.6, -34.5], [5.4, -37.5], [0.6, -43], [6.2, -47], [3.0, -55], [1.2, -66], [5.6, -74]]) {
      const p = { scene: 'morning', kind: 'wait', x, z, ax: x, az: z, dx: 0, dz: 1, len: 1, u0: 0, t0: V_MORN, speed: 0, yaw: Math.PI + (R() - 0.5) * 0.8, man: false };
      dress(p, R); p.callPhone = R() < 0.3; keepIn(p);
    }
  }
  // the time-lapses: passers-by, each there for a moment (on one of the days)
  // (no one pops in or out: everyone in a scene is there all through it, standing or walking at a normal pace)
  scatter('crane', 26, 41, { x0: -FX + 0.5, x1: FX - 0.5, z0: CZ - CR - 9, z1: CZ + CR + 9 }, { gap: 1.2, phones: 0.3, lookUp: 0.75 });
  scatter('dusk', 16, 42, { x0: AV + 0.5, x1: FX - 0.5, z0: -60, z1: 0 }, { walk: 0.35, gap: 1.3, phones: 0.7 });
  scatter('dusk', 12, 142, { x0: -FX + 0.5, x1: -AV - 0.5, z0: -70, z1: -2 }, { walk: 0.35, gap: 1.3, phones: 0.6 });
  scatter('shops', 18, 44, { x0: AV + 0.5, x1: FX - 0.5, z0: -70, z1: 2 }, { walk: 0.85, gap: 1.1, phones: 0.1 });
  scatter('shops', 10, 144, { x0: -FX + 0.5, x1: -AV - 0.5, z0: -70, z1: 2 }, { walk: 0.85, gap: 1.1 });
  // on the highway deck: women walking between the dead trucks, in single file along the gaps (one way per gap, the
  // same pace, so nobody walks through anybody), carrying bags; a few stopped by the jack-knifed truck's spilled crates
  {
    const R = rng(51);
    const jx = JACK ? JACK.xEnd : -30;
    const BANDS = [[HWY.z + 7.55, -1, 1.25], [HWY.z - 7.55, 1, 1.3]];   // (the shoulders: the median is where you stand)
    BANDS.forEach(([z, dir, sp], b) => {
      let x = dir < 0 ? 18 : -60;
      for (let k = 0; k < 5; k++) {
        x += dir < 0 ? -(6 + R() * 9) : 6 + R() * 9;
        if (b === 2 && x < jx + 13) continue;              // (the median gap is blocked by the jack-knifed trailer)
        const p = { scene: 'highway', kind: 'walk', x, z: z + (R() - 0.5) * 0.15, ax: x - dir * 200, az: z, dx: dir, dz: 0, len: 400, u0: 200, t0: V_TRUCK, speed: sp, man: false, y0: HWY.y };
        p.az = p.z;
        dress(p, R); p.bag = BAG[Math.floor(R() * BAG.length)]; p.carry = true; keepIn(p);
      }
    });
    const sx = jx + 5.75 - 1.7 - 13.4 * Math.cos(0.45), sz = (JACK ? JACK.z : HWY.z) - 13.4 * Math.sin(0.45);
    for (const [dx, dz, yaw] of [[-2.2, 0.9, 1.2], [-4.2, -1.6, -2.4], [-1.0, 2.1, 2.6], [-6.0, 0.4, 0.4]]) {
      const x = sx + dx, z = sz + dz;
      const p = { scene: 'highway', kind: 'wait', x, z, ax: x, az: z, dx: 0, dz: 1, len: 1, u0: 0, t0: V_TRUCK, speed: 0, yaw, man: false, y0: HWY.y, crouchAt: true };
      dress(p, R); keepIn(p);
    }
  }
  // the woman on the bench by you, every morning for nine months; her belly grows
  {
    const R = rng(47);
    const p = { scene: 'preg', kind: 'wait', x: BENCH.x, z: BENCH.z, ax: BENCH.x, az: BENCH.z, dx: 0, dz: 1, len: 1, u0: 0, t0: V_PREG, speed: 0, yaw: BENCH.yaw, man: false, bench: true };
    dress(p, R); p.longHair = true; p.skirt = 0; p.hair = 0x2e2018; p.skin = 0xe0ac86; p.h = 0.95;
    keepIn(p);
  }
  scatter('preg', 10, 45, { x0: -FX + 0.5, x1: -AV - 0.5, z0: -80, z1: -30 }, { walk: 0.9, gap: 1.2 });
  scatter('preg', 6, 46, { x0: AV + 0.5, x1: AV + 2.2, z0: -80, z1: -14 }, { walk: 1, gap: 1.2 });
  // day 280: the first baby, in its mother's arms on the corner, women round her; the street busy again
  {
    const R = rng(48);
    const m = { scene: 'baby', kind: 'wait', x: MOTHER.x, z: MOTHER.z, ax: MOTHER.x, az: MOTHER.z, dx: 0, dz: 1, len: 1, u0: 0, t0: V_BABY, speed: 0, yaw: MOTHER.yaw, man: false, mother: true };
    dress(m, R); m.longHair = true; m.skirt = 0xf4efe4; m.shirt = 0xf4efe4; m.hair = 0x2e2018; m.skin = 0xe0ac86; m.h = 0.95;
    keepIn(m);
    const ring = [[1.15, -0.45], [-1.0, -0.65], [0.25, -1.25], [1.7, 0.45], [-1.6, 0.25]];
    for (const [dx, dz] of ring) {
      const x = MOTHER.x + dx, z = MOTHER.z + dz;
      const p = { scene: 'baby', kind: 'wait', x, z, ax: x, az: z, dx: 0, dz: 1, len: 1, u0: 0, t0: V_BABY, speed: 0, yaw: Math.atan2(MOTHER.x - x, MOTHER.z - z), man: false, admire: true };
      if (!clearOf(p, 0.75)) continue;
      dress(p, R); keepIn(p);
    }
  }
  scatter('baby', 60, 49, ESIDE, { walk: 0.6, gap: 1.0, phones: 0.2 });
  scatter('baby', 50, 50, WSIDE, { walk: 0.6, gap: 1.0, phones: 0.2 });
  {
    const R = rng(31);
    for (let i = 0; i < 40; i++) {
      const zr = R() < 0.6 ? XWALK_S : XWALK_N;
      const z = zr[0] + 0.5 + R() * (zr[1] - zr[0] - 1.0), sd = R() < 0.5 ? -1 : 1;
      const p = { scene: 'baby', kind: 'cross', ax: sd * (AV + 2), az: z, dx: -sd, dz: 0, len: 2 * AV + 4, u0: -3 + R() * 22, t0: V_BABY, speed: 1.2 + R() * 0.35, man: false };
      p.child = R() < 0.1;
      if (!clearOf(p, 0.9)) continue;
      dress(p, R); p.callPhone = R() < 0.2;
      keepIn(p);
    }
  }
}
// who is on screen when
export const SCENE_OF = (v) => sceneAt(v);
PEOPLE.forEach((p, i) => { p.i = i; });
