// The crowd on the promenade, and what each of them does (video time v). Every move is planned up front and checked
// against everyone else (and you, the camera) every 0.05 s, so nobody walks through anybody, jumps or teleports.
//   Frame 0: phones up at the Moon; people right in front of you, a row along the edge, others sitting on the steps.
//   The burst: hands to heads, people pointing; the ones filming keep filming.
//   The tide (~10 s): as the water climbs the steps, the ones sitting there get up and step up onto the deck.
//   The ring (16-21 s): everyone looks up; pointing.
//   The splash (29.6 s): a flinch at the flash; its wave over the deck: the front ones hurry back out of it.
//   The hard rain: from V_RUN most of them run (away from the water, out to the sides, some past you); a few stay,
//   crouching, and the one in front of you keeps filming to the end.
import { rng, smooth, clamp, lerp } from './util.js';
import { SKIN, HAIR } from './crowd.js';
import { deckY, EDGE_Z, STEP_H, STEP_D, SEA0, LAMPS } from './layout.js';
import { V_BURST, V_SPLASH, V_WAVE, V_RUN, V_RAIN, V_FIRST, V_CHUNK, state } from './timeline.js';
import { camAt } from './camera.js';

const TOPS = [0xf2f2f2, 0x1e1e1e, 0xc0392b, 0x2e6fb5, 0xe2b13c, 0x3f8f5a, 0xe58fb0, 0x6c3f99, 0x9aa3ad, 0x147a73, 0x8a5a3c, 0x203040, 0xd8d0b8];
const PANTS = [0x1b2631, 0x2c3e50, 0x4b5563, 0xb8a888, 0x3d5a80, 0x1a1a1a, 0x6b7280, 0x5a4636];
export const PEOPLE = [];

{
  const R = rng(1802);
  const add = (o) => {
    const p = {
      yaw: Math.PI + (R() - 0.5) * 0.5, s: 0.93 + R() * 0.13, seed: R(), ph: R() * 6.28, legs: [], stay: false,
      col: [TOPS[Math.floor(R() * TOPS.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)], R() < 0.75],
      act: R() < 0.42 ? 'phone' : R() < 0.2 ? 'phone2' : R() < 0.45 ? 'point' : 'look', type: 'stand', ...o,
    };
    p.face = p.yaw;
    PEOPLE.push(p);
    return p;
  };
  // right next to you (in the shot on frame 0)
  const NEAR = [
    [0.62, -2.0, 'phone', 0.0, true], [-1.4, -3.2, 'phone2', 0.05], [0.95, -4.6, 'point', 0.1], [2.2, -3.9, 'phone', -0.1, true],
    [2.75, -4.1, 'look', -0.25, true], [-1.15, -5.0, 'look', 0.2], [0.8, -6.6, 'kid', 0.0], [1.35, -6.9, 'phone', 0.0],
    [-1.4, -7.3, 'phone2', -0.1], [-2.2, -7.9, 'point', 0.15], [1.65, -8.4, 'phone', 0.0], [-3.2, -3.8, 'phone', 0.25, true],
    [2.1, -6.3, 'look', -0.1], [-2.3, -5.9, 'phone', 0.1],
  ];
  for (const [x, z, act, dy, stay] of NEAR) {
    const p = add({ x, z, act: act === 'kid' ? 'look' : act, near: true });
    p.yaw = Math.PI + dy; p.face = p.yaw; p.stay = !!stay;
    if (act === 'kid') { p.s = 0.62; p.kid = true; }
  }
  PEOPLE[0].s = 0.95; PEOPLE[0].col = [0x1c1c22, 0x23272f, SKIN[1], HAIR[0], true];      // (the one in front of you: dark jacket)
  PEOPLE[4].act = 'hug'; PEOPLE[3].act = 'hug';                                          // a couple, arm in arm
  const free = (x, z, r) => !PEOPLE.some((q) => Math.hypot(q.x - x, q.z - z) < r) && !LAMPS.some((l) => Math.hypot(l.x - x, l.z - z) < 0.6);
  // the row along the edge (an opening in the middle so you can see the steps and the water)
  for (let x = -75; x < 75; x += 0.65 + R() * 0.9) {
    if (Math.abs(x) < 3.0 && Math.abs(x + 1.4) > 0.3) continue;
    const z = -9.15 + R() * 0.7;
    if (free(x, z, 0.62)) add({ x, z });
  }
  // sitting on the top steps
  for (let x = -55; x < 55; x += 0.9 + R() * 1.4) {
    const k = R() < 0.6 ? 1 : 2, z = EDGE_Z - STEP_D * (k - 0.5) - 0.05;
    if (free(x, z, 0.75)) { const p = add({ x, z, type: 'sit' }); p.yaw = Math.PI + (R() - 0.5) * 0.3; p.face = p.yaw; if (p.act === 'phone2') p.act = 'phone'; }
  }
  // the rest of the deck (busiest near the edge and round you)
  const cam0 = camAt(0);
  for (let k = 0; k < 9000 && PEOPLE.length < 430; k++) {
    const x = (R() * 2 - 1) * 65, z = -8.6 + R() * 14.5;
    const dc = Math.hypot(x - cam0.x, z - cam0.z);
    if (dc < 2.3 || (Math.abs(x + 0.15) < 0.85 && z > -4.3 && z < 2) || (Math.abs(x + 0.3) < 1.0 && z < -4.3)) continue;
    if (R() > 0.15 + 0.85 * Math.exp(-dc / 26) * (0.6 + 0.4 * smooth(4, -8, z))) continue;
    if (free(x, z, 0.68)) add({ x, z });
  }
}

// ---- motion: straight legs with easing ----
// leg: { t0, x0, z0, x1, z1, vmax, ta (accelerate), td (slow down; 0 = keeps going), kind }
function legDist(L, t) {
  const len = L.len, v = L.vmax;
  if (t <= 0) return 0;
  if (t < L.ta) return v * t * t / (2 * L.ta);
  const end = L.dur - L.td;
  if (t < end || L.td === 0) return Math.min(len, v * (t - L.ta / 2));
  const r = Math.max(0, L.dur - t);
  return len - v * r * r / (2 * L.td);
}
function mkLeg(t0, x0, z0, x1, z1, vmax, kind, ta = 0.35, td = 0.35) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  return { t0, x0, z0, x1, z1, vmax, kind, ta, td, len, dur: len / vmax + (ta + td) / 2, yaw: Math.atan2(x1 - x0, z1 - z0) };
}
// where p is at v with these legs: { x, z, moving (0..1), leg, d (m along it), since (s since the last leg ended) }
function where(p, legs, v) {
  let x = p.x, z = p.z, last = null;
  for (const L of legs) {
    if (v < L.t0) break;
    const t = v - L.t0;
    if (t < L.dur) {
      const d = legDist(L, t), k = L.len > 0 ? d / L.len : 1;
      const mv = smooth(0, Math.min(0.3, L.ta), t) * (L.td ? 1 - smooth(L.dur - Math.min(0.3, L.td), L.dur, t) : 1);
      return { x: lerp(L.x0, L.x1, k), z: lerp(L.z0, L.z1, k), moving: mv, leg: L, d, since: -1 };
    }
    x = L.x1; z = L.z1; last = L;
  }
  return { x, z, moving: 0, leg: last, d: last ? last.len : 0, since: last ? v - (last.t0 + last.dur) : -1 };
}
export const posAt = (p, v) => where(p, p.legs, v);

// ---- the planner: try each plan, keep the first that never comes within reach of anyone (or you) ----
const DT = 0.05;
function clear(p, legs, tA, tB, minD = 0.66) {
  // only check against people who could be near this path
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (const L of legs) { bx0 = Math.min(bx0, L.x0, L.x1); bx1 = Math.max(bx1, L.x0, L.x1); bz0 = Math.min(bz0, L.z0, L.z1); bz1 = Math.max(bz1, L.z0, L.z1); }
  bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.z); bz1 = Math.max(bz1, p.z);
  const near = PEOPLE.filter((q) => {
    if (q === p) return false;
    let qx0 = q.x, qx1 = q.x, qz0 = q.z, qz1 = q.z;
    for (const L of q.legs) { qx0 = Math.min(qx0, L.x0, L.x1); qx1 = Math.max(qx1, L.x0, L.x1); qz0 = Math.min(qz0, L.z0, L.z1); qz1 = Math.max(qz1, L.z0, L.z1); }
    return qx1 > bx0 - 1.5 && qx0 < bx1 + 1.5 && qz1 > bz0 - 1.5 && qz0 < bz1 + 1.5;
  });
  for (let t = tA; t <= tB; t += DT) {
    const a = where(p, legs, t);
    if (Math.hypot(a.x, a.z) > 60) continue;
    const c = camAt(t);
    if (Math.hypot(a.x - c.x, a.z - c.z) < 0.95) return false;
    for (const l of LAMPS) if (Math.hypot(a.x - l.x, a.z - l.z) < 0.45) return false;
    for (const q of near) {
      const b = where(q, q.legs, t);
      if (Math.hypot(a.x - b.x, a.z - b.z) < minD) return false;
    }
  }
  return true;
}
function plan(p, options, tA, tB) {
  for (const legs of options) {
    const all = [...p.legs, ...legs];
    if (clear(p, all, tA, tB(all))) { p.legs = all; return true; }
  }
  return false;
}
// the sea level at v (for when the steps flood)
const seaAt = (v) => SEA0 + state(v).tide;
{
  const R = rng(55);
  // 1. the tide: the ones on the steps get up as the water reaches the step below them, and step up onto the deck
  for (const p of PEOPLE.filter((q) => q.type === 'sit')) {
    const y = deckY(p.z);
    let t0 = 0;
    for (let v = 9.4; v < 13; v += 0.02) if (seaAt(v) > y - 0.9) { t0 = v; break; }
    if (!t0) { p.t0 = 1e9; continue; }
    t0 += 0.1 + R() * 0.4;
    p.up = t0;                                            // (stands up first, then walks)
    const opts = [];
    const away = Math.abs(p.x) < 2.3 ? Math.sign(p.x || 1) * 2.3 - p.x : 0;      // (keep your view of the steps clear)
    for (const dz of [0.25, 0.75, 1.3]) for (const dx of [0, 0.45, -0.45, 0.9, -0.9]) opts.push([mkLeg(t0 + 0.6, p.x, p.z, p.x + away + dx * (away ? Math.sign(away) : 1), EDGE_Z + dz, 1.1, 'walk')]);
    if (!plan(p, opts, t0, (all) => all[all.length - 1].t0 + all[all.length - 1].dur + 0.5)) p.upStay = true;
  }
  // 2. the splash's wave: anyone it will reach hurries back out of it (the water front runs up the deck)
  const front = (v) => EDGE_Z + 6.6 * state(v).flood;
  const reach = (z) => { for (let v = V_WAVE - 0.5; v < V_WAVE + 3; v += 0.02) if (front(v) > z - 1.2) return v; return 0; };
  const byZ = PEOPLE.filter((p) => !p.near || p.z < -3.5).sort((a, b) => a.z - b.z);
  for (const p of byZ) {
    const at = posAt(p, V_WAVE - 0.5);
    const t0 = reach(at.z);
    if (!t0) continue;
    const opts = [];
    for (const dz of [4.0, 3.2, 5.0, 2.4]) for (const dx of [0, 0.5, -0.5, 1.0, -1.0]) opts.push([mkLeg(t0, at.x, at.z, at.x + dx, Math.min(at.z + dz, 4), 2.6, 'hurry', 0.25, 0.4)]);
    plan(p, opts, t0, (all) => all[all.length - 1].t0 + all[all.length - 1].dur + 0.3);
  }
  // 3. the hard rain: most of them run, away from the water and out to the sides; ~1 in 6 stay and crouch
  const runners = PEOPLE.filter((p) => !p.stay && R() > 0.16);
  runners.sort((a, b) => a.seed - b.seed);
  for (const p of runners) {
    const t0 = V_RUN + Math.pow(R(), 0.8) * 3.4 + (p.near ? 0.8 : 0);
    const at = posAt(p, t0);
    const side = Math.abs(at.x) < 0.4 ? (p.seed < 0.5 ? -1 : 1) : Math.sign(at.x);
    const sp = 4.2 + R() * 1.6;
    const opts = [];
    for (const k of [0.55, 0.35, 0.8, 0.2, 1.1]) for (const dl of [0, 0.5, 1.0]) {
      const dx = side * k, L = Math.hypot(dx, 1);
      opts.push([mkLeg(t0 + dl, at.x, at.z, at.x + dx / L * 70, at.z + 1 / L * 70, sp, 'run', 0.6, 0)]);
    }
    if (!plan(p, opts, t0, (all) => Math.min(all[all.length - 1].t0 + 9, V_CHUNK + 3))) p.stay = true;
  }
  for (const p of PEOPLE) if (!p.legs.some((L) => L.kind === 'run')) p.stay = true;
}

// how high someone stands at z (on a step, or between steps while walking)
function groundY(z, moving) {
  const exact = deckY(z);
  if (z > EDGE_Z + STEP_D * 0.5) return exact;
  const ramp = Math.min(0, -STEP_H * ((EDGE_Z - z) / STEP_D + 0.5));
  return lerp(exact, ramp, moving);
}

// the pose (crowd.js) for person p at v
export function personPose(p, v) {
  const w = posAt(p, v);
  const o = { x: w.x, y: 0, z: w.z, yaw: p.face, s: p.s, walk: 0, stride: 0, sit: 0, pitch: 0, roll: 0, armL: 0.05, armR: 0.05, look: 0.12 };
  if (Math.hypot(w.x, w.z) > 75) return { visible: false };
  const sd = p.seed, sway = Math.sin(v * (0.7 + sd) + p.ph);
  o.y = groundY(w.z, w.moving);
  // the facing: the way they move, then back toward the water
  if (w.moving > 0) o.yaw = lerpAng(p.face, w.leg.yaw, smooth(0, 0.25, v - w.leg.t0));
  else if (w.leg && w.leg.kind !== 'run') o.yaw = lerpAng(w.leg.yaw, p.face, smooth(0, 0.6, w.since));
  // ---- what they do with their arms and heads ----
  const burst = smooth(V_BURST + 0.05 + sd * 0.3, V_BURST + 0.3 + sd * 0.3, v) * (1 - smooth(V_BURST + 1.6 + sd, V_BURST + 2.6 + sd, v));
  const ringUp = smooth(13.5 + sd, 15 + sd, v) * (1 - smooth(21 + sd, 22.5 + sd, v));
  const flinch = smooth(V_SPLASH + 0.05 + sd * 0.15, V_SPLASH + 0.2 + sd * 0.15, v) * (1 - smooth(V_SPLASH + 0.9, V_SPLASH + 1.7, v));
  const rain = smooth(V_RAIN + sd, V_RAIN + 1.2 + sd, v);
  const act = p.act;
  if (act === 'phone' || act === 'phone2') {
    o.armR = 1.22 + 0.03 * sway; o.armL = act === 'phone2' ? 1.18 : 0.1;
    o.look = 0.16 + 0.25 * ringUp;
    if (ringUp > 0) { o.armR += 0.35 * ringUp; if (act === 'phone2') o.armL += 0.35 * ringUp; }
  } else if (act === 'point') {
    const pt = Math.max(smooth(1.0 + sd, 1.4 + sd, v) * (1 - smooth(4 + sd * 2, 4.6 + sd * 2, v)), ringUp, smooth(V_FIRST + 0.3 + sd, V_FIRST + 0.7 + sd, v) * (1 - smooth(27 + sd, 28, v)));
    o.armR = lerp(0.05, 1.3 + 0.35 * ringUp, pt); o.look = 0.15 + 0.3 * ringUp;
  } else if (act === 'hug') {
    o.armL = 0.45; o.armR = 0.4; o.roll = (p === PEOPLE[3] ? 1 : -1) * 0.04; o.look = 0.15 + 0.3 * ringUp;
  } else {
    o.look = 0.18 + 0.3 * ringUp + 0.04 * sway;
  }
  // the burst: hands to heads (not the ones filming)
  if (burst > 0 && act !== 'phone' && act !== 'phone2') { o.armL = lerp(o.armL, 1.55, burst); o.armR = lerp(o.armR, 1.5, burst); o.pitch -= 0.05 * burst; o.look += 0.1 * burst; }
  // the splash's flash: everyone flinches
  if (flinch > 0) { o.armL = lerp(o.armL, 1.35, flinch); o.armR = lerp(o.armR, 1.4, flinch); o.pitch += 0.12 * flinch; o.look -= 0.2 * flinch; }
  // the hard rain: looking up, hands on heads (the phones stay up)
  if (rain > 0 && act !== 'phone' && act !== 'phone2') { o.armL = lerp(o.armL, 1.55, rain); o.armR = lerp(o.armR, 1.55, rain); }
  if (rain > 0) o.look = lerp(o.look, 0.42, rain);
  // ---- sitting on the steps, standing up when the water comes ----
  if (p.type === 'sit') {
    const up = p.up ? smooth(p.up, p.up + 0.55, v) : 0;
    o.sit = 1 - up;
    if (up < 1 && act !== 'phone') { o.armL = lerp(0.5, o.armL, up); o.armR = lerp(0.45, o.armR, up); }
  }
  // ---- moving: walking, hurrying, running ----
  if (w.moving > 0) {
    const L = w.leg;
    o.walk = p.ph + w.d / (L.kind === 'run' ? 1.25 : 0.75) * Math.PI;
    o.stride = (L.kind === 'run' ? 1.6 : L.kind === 'hurry' ? 1.25 : 0.9) * w.moving;
    if (L.kind === 'run') { const cover = sd < 0.5; o.armL = cover ? 1.5 : 0.1; o.armR = cover ? 1.45 : 0.1; o.pitch = 0.14; o.look = 0.1; }
    else if (L.kind === 'hurry') { o.armL = lerp(o.armL, 0.5, w.moving); o.armR = lerp(o.armR, 0.6, w.moving); o.pitch = 0.08; }
  }
  // ---- the ones who stay: they crouch as it gets worse; the one in front of you keeps filming ----
  if (p.stay && p !== PEOPLE[0] && (act !== 'phone' || p.seed < 0.5)) {
    const cr = smooth(V_RUN + 1.5 + sd * 2, V_RUN + 2.6 + sd * 2, v) * (1 - smooth(V_CHUNK + 0.2, V_CHUNK + 1.0, v) * 0.6);
    if (cr > 0) { o.sit = Math.max(o.sit, 0.75 * cr); o.pitch += 0.3 * cr; o.armL = lerp(o.armL, 1.6, cr); o.armR = lerp(o.armR, 1.6, cr); o.look = lerp(o.look, -0.1, cr); }
  }
  // the giant chunk: everyone left looks up at it
  const up = smooth(V_CHUNK + 0.2 + sd * 0.5, V_CHUNK + 0.9 + sd * 0.5, v);
  if (up > 0) { o.look = lerp(o.look, 0.6, up); o.pitch -= 0.1 * up; }
  return o;
}
function lerpAng(a, b, k) { let d = b - a; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); return a + d * k; }

// where someone's phone is (the hand(s) raised in front of them), from their pose: { x, y, z, yaw } or null
export function phoneOf(p, o) {
  if (o.visible === false || (p.act !== 'phone' && p.act !== 'phone2')) return null;
  const a = (p.act === 'phone2' ? (o.armL + o.armR) / 2 : o.armR) * 1.45;
  if (a < 1.1) return null;
  const s = o.s, bx = p.act === 'phone2' ? 0.1 : 0.24, by = 1.38 - 0.62 * Math.cos(a) - o.sit * 0.42 + 0.04, bz = 0.6 * Math.sin(a);
  const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
  return { x: o.x + (c * bx + sn * bz) * s, y: o.y + by * s, z: o.z + (-sn * bx + c * bz) * s, yaw: o.yaw, tilt: a - Math.PI / 2 };
}
