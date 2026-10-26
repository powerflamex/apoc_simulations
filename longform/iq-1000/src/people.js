// Everyone on the plaza, as a pure function of world time w (real seconds). Walkers loop along their lanes (evenly
// spaced, one shared speed per lane, so nobody walks through anybody; slots that would cross your path to the curb
// while you walk are left empty). When the rain comes some open umbrellas, some cover their heads, the plaza lanes
// hurry. The ones who stay put: the kid with his ball and his mother on the phone, the guitarist, the bubble artist,
// two tourists taking photos by the fountain, a couple arguing by the café, people at the café tables, people
// waiting at the crosswalks.
import * as THREE from 'three';
import { SKIN, HAIR } from './crowd.js';
import { rng, smooth, clamp, lerp } from './util.js';
import { LANES, KID0, PARENT, GUITAR, BUBBLER, CAFE, XWALK_X, CURB, FAR, YOU0, YOU1, AVE_X0, AVE_X1, FOUNTAIN } from './layout.js';
import { W } from './timeline.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef, 0xffffff, 0x111111];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];
const UMB = [0x1c2833, 0xc0392b, 0x2e86c1, 0xf1c40f, 0x111111, 0x8e44ad, 0x16a085];
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7 + 0.13) * 43758.5453; return x - Math.floor(x); };
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// the kid's ball: bounced by hand, then off his knee toward the road; you catch it
export const BALL_R = 0.105;
const BALL0 = { x: KID0.x - 0.32, z: KID0.z - 0.12 };
export const CATCH = { x: YOU1.x + 0.12, y: 0.95, z: YOU1.z - 0.62 };
const BALL_ROAD = { x: -0.55, z: -6.0 };    // where it would have gone
// the car that would have hit him (lane 0, eastbound): passes the kid's line at W.catch + 0.8
export const DANGER = { lane: 0, speed: 12.5, xAt: 0.6, wAt: W.catch + 0.8 };

// ---- slots ----
const SLOTS = [];
LANES.forEach((L, li) => {
  const len = L.x1 - L.x0;
  for (let j = 0; j < L.n; j++) {
    const off = (j + 0.35 * hash(li, j)) / L.n;
    // keep your way to the curb clear while you walk (near-sidewalk lanes): skip a slot that would be near x = 0
    if (li < 2) {
      let clash = false;
      for (let w = W.walk - 1; w < W.catch + 1.5; w += 0.1) if (Math.abs(laneX(L, off, w) - 0.2) < 1.6) clash = true;
      // ...and the kid's corner while he runs, and where you stand afterwards
      if (clash) continue;
    }
    SLOTS.push({ kind: 'walk', L, li, j, off, len });
  }
});
function hurry(L, w) {   // extra distance from hurrying once it rains (the plaza lanes only)
  if (Math.abs(L.z) < 4 || L.z < -15) return 0;
  const a = W.rain + 0.5, b = W.rain + 3;
  if (w <= a) return 0;
  // speed x1.7 ramped in over a..b: integrate the ramp
  const u = Math.min(w, b) - a, ramp = 0.7 * L.speed * (u * u / (2 * (b - a)));
  return ramp + (w > b ? 0.7 * L.speed * (w - b) : 0);
}
function laneX(L, off, w) {
  const len = L.x1 - L.x0;
  const d = ((L.speed * w + hurry(L, w) + (off + L.seed) * len) % len + len) % len;
  return L.dir > 0 ? L.x0 + d : L.x1 - d;
}

// the ones who stay put: [x, z, yaw, kind, extra]
const STAY = [];
// café tables: seated people
{
  const r = rng(91);
  for (let x = CAFE.x0 + 1; x < CAFE.x1; x += 2.6) for (let z = CAFE.z0 + 1.4; z < CAFE.z1 - 0.5; z += 2.8) {
    const jx = x + (r() - 0.5) * 0.4, jz = z + (r() - 0.5) * 0.4;
    for (const a of [0.4, 2.0, 3.6, 5.2]) if (r() < 0.55) STAY.push({ x: jx + Math.cos(a) * 0.62, z: jz + Math.sin(a) * 0.62, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), kind: 'sit', seed: r() * 100 });
  }
}
// crosswalk waiters (our side and the far side), and along the avenue's corners
for (let i = 0; i < 6; i++) STAY.push({ x: XWALK_X - 1.6 + (i % 3) * 1.1 + hash(i, 1) * 0.3, z: CURB + 0.55 + Math.floor(i / 3) * 0.75, yaw: Math.PI + (hash(i, 2) - 0.5) * 0.4, kind: 'wait', seed: i * 7 });
for (let i = 0; i < 5; i++) STAY.push({ x: XWALK_X - 1.4 + i * 0.9, z: FAR - 0.5 - (i % 2) * 0.6, yaw: (hash(i, 3) - 0.5) * 0.4, kind: 'wait', seed: 40 + i * 7 });
for (let i = 0; i < 4; i++) STAY.push({ x: AVE_X1 + 1.2 + i * 0.8, z: FAR - 0.5 - (i % 2) * 0.7, yaw: -Math.PI / 2 + (hash(i, 4) - 0.5) * 0.5, kind: 'wait', seed: 70 + i * 7 });
// the tourists by the fountain: one photographs the other
export const TOURIST_A = { x: FOUNTAIN.x + 4.6, z: FOUNTAIN.z - 3.4 }, TOURIST_B = { x: FOUNTAIN.x + 1.6, z: FOUNTAIN.z - 4.6 };
STAY.push({ x: TOURIST_A.x, z: TOURIST_A.z, yaw: Math.atan2(TOURIST_B.x - TOURIST_A.x, TOURIST_B.z - TOURIST_A.z), kind: 'photo', seed: 3 });
STAY.push({ x: TOURIST_B.x, z: TOURIST_B.z, yaw: Math.atan2(TOURIST_A.x - TOURIST_B.x, TOURIST_A.z - TOURIST_B.z), kind: 'pose', seed: 4 });
// the couple arguing by the café
export const COUPLE_A = { x: CAFE.x0 - 1.4, z: CAFE.z0 + 1.0 }, COUPLE_B = { x: CAFE.x0 - 0.6, z: CAFE.z0 + 1.7 };
STAY.push({ x: COUPLE_A.x, z: COUPLE_A.z, yaw: Math.atan2(COUPLE_B.x - COUPLE_A.x, COUPLE_B.z - COUPLE_A.z), kind: 'argue', seed: 5 });
STAY.push({ x: COUPLE_B.x, z: COUPLE_B.z, yaw: Math.atan2(COUPLE_A.x - COUPLE_B.x, COUPLE_A.z - COUPLE_B.z), kind: 'argue2', seed: 6 });
// a man reading on the bench, a woman leaning on a bollard with a coffee
STAY.push({ x: -1.8, z: -3.75, yaw: 0, kind: 'read', seed: 8 });
STAY.push({ x: 15.5, z: -3.6, yaw: -2.6, kind: 'coffee', seed: 9 });
// the chess hustler at the park table beside you (chess.js), on his stool across the board
STAY.push({ x: 1.25 + 0.56 * 0.736, z: 0.45 - 0.56 * 0.677, yaw: -0.83, kind: 'chess', seed: 11 });

// the special people
const KID = SLOTS.length + STAY.length, MOM = KID + 1, GUIT = KID + 2, BUBB = KID + 3, SELF = KID + 4;
export const NPEOPLE = KID + 5;

// ---- the kid and the ball ----
const lerp2 = (a, b, k) => ({ x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k) });
export function ballAt(w) {
  // hand-dribbled in front of him (bounces 1.6 a second), then off his knee toward the road
  if (w < W.kick) {
    const ph = ((w * 1.6) % 1 + 1) % 1;
    const y = BALL_R + 0.62 * (1 - Math.pow(2 * ph - 1, 2));
    return { x: BALL0.x, y, z: BALL0.z, held: false, spin: w * 3 };
  }
  const dt = w - W.kick, T = W.catch - W.kick;
  if (w < W.catch) {
    const k = dt / T;
    const p = lerp2(BALL0, CATCH, k);
    // bounces getting lower; it's on its way up into your hand at the catch
    const bounces = [[0, 0.62], [0.42, 0.42], [0.78, 0.3], [1.12, 0.22]];
    let y = CATCH.y;
    for (let i = 0; i < bounces.length; i++) {
      const [t0, h] = bounces[i], t1 = i + 1 < bounces.length ? bounces[i + 1][0] : T + 0.3;
      if (dt >= t0 && dt < t1) {
        const u = (dt - t0) / (t1 - t0);
        y = BALL_R + h * (1 - Math.pow(2 * u - 1, 2)) * (i === 0 ? 1 : 1);
        if (i === bounces.length - 1) y = BALL_R + (CATCH.y - BALL_R) * Math.sin(Math.PI / 2 * Math.min(1, (dt - t0) / (T - t0)));   // (off the curb's edge, up into your hand)
      }
    }
    return { x: p.x, y, z: p.z, held: false, spin: -dt * 9 };
  }
  return null;   // in your hand (hand.js draws it)
}
// where the ball would have gone (for the prediction line), dt seconds after the kick
export function ballPredict(dt) {
  const T = W.catch - W.kick;
  const end = { x: BALL_ROAD.x, z: BALL_ROAD.z };
  const k = dt / (T * 1.5);
  const p = lerp2(BALL0, end, k);
  return { x: p.x, y: BALL_R + 0.5 * Math.abs(Math.sin(dt * 4.2)) * Math.exp(-dt * 0.8), z: p.z };
}
const KID_STOP = { x: 1.62, z: -4.18 };
export function kidAt(w) {
  // dribbling until the kick; turns; runs after the ball; stops dead at the curb when you catch it
  if (w < W.kick + 0.55) return { x: KID0.x, z: KID0.z, yaw: Math.atan2(BALL0.x - KID0.x, BALL0.z - KID0.z) * 0.5 - 0.6 * smooth(W.kick, W.kick + 0.55, w), run: 0, d: 0 };
  const t0 = W.kick + 0.55, t1 = W.catch + 0.55;
  const k = smooth(t0, t1, w);
  // ease: accelerate, then brake hard after the catch
  const kk = w < W.catch ? 0.82 * Math.pow(clamp((w - t0) / (W.catch - t0)), 1.5) : 0.82 + 0.18 * smooth(W.catch, t1, w);
  const p = lerp2(KID0, KID_STOP, kk);
  const dist = Math.hypot(KID_STOP.x - KID0.x, KID_STOP.z - KID0.z) * kk;
  const run = w < W.catch ? clamp((w - t0) / 0.3) : 1 - smooth(W.catch, t1, w);
  return { x: p.x, z: p.z, yaw: Math.atan2(KID_STOP.x - KID0.x, KID_STOP.z - KID0.z), run, d: dist, k };
}
export function kidPredict(dt) {   // where he would have run (into the road)
  const a = KID0, b = { x: 0.5, z: -6.4 };
  return lerp2(a, b, clamp(dt / 1.6));
}

// fills the crowd's poses for world time w
export function peopleFrame(w, s, crowd, cache, umbrellas) {
  let i = 0;
  const rainOn = smooth(W.rain + 0.3, W.rain + 1.6, w) * (1 - (s.future || 0));
  let ui = 0;
  for (const sl of SLOTS) {
    const L = sl.L;
    const x = laneX(L, sl.off, w);
    const d = L.speed * w + hurry(L, w);
    const cyc = Math.floor(((L.speed * w + hurry(L, w)) / sl.len) + sl.off + L.seed);
    const who = sl.li * 1000 + sl.j * 17 + cyc * 7;
    const on = hash(cyc, sl.li * 13 + sl.j) < 0.88;
    if (!on) { crowd.pose(i++, { visible: false, x: 0, y: 0, z: 0 }); continue; }
    if (cache[i] !== who) {
      cache[i] = who;
      crowd.color(i, pick(SHIRT, hash(who, 1)), pick(PANTS, hash(who, 2)), pick(SKIN, hash(who, 9)), pick(HAIR, hash(who, 10)));
    }
    const hurrying = Math.abs(L.z) >= 4 && L.z > -15 ? rainOn : 0;
    const o = { x, y: 0, z: L.z + (hash(who, 11) - 0.5) * 0.35, yaw: L.dir > 0 ? Math.PI / 2 : -Math.PI / 2, s: 0.92 + 0.14 * hash(who, 3), walk: d / 0.75 * Math.PI + hash(who, 4) * 6, stride: 1 + 0.5 * hurrying };
    const kind = hash(who, 5);
    if (kind < 0.16) { o.armR = 1.0; o.look = -0.15; }                     // on the phone
    // the rain: an umbrella (opens over ~1 s), a hand over the head, or nothing
    const r = hash(who, 6);
    if (rainOn > 0 && r < 0.34 && umbrellas && ui < umbrellas.n) {
      const open = smooth(W.rain + 0.2 + hash(who, 7) * 1.2, W.rain + 1.4 + hash(who, 7) * 1.2, w);
      o.armR = Math.max(o.armR || 0, 1.15 * open);
      umbrellas.set(ui++, o, open, pick(UMB, hash(who, 8)));
    } else if (rainOn > 0 && r < 0.5) {
      const k = smooth(W.rain + 0.3 + hash(who, 7), W.rain + 1.0 + hash(who, 7), w);
      o.armL = 1.65 * k; o.armR = Math.max(o.armR || 0, 1.65 * k); o.look = -0.2 * k;
    }
    crowd.pose(i++, o);
  }
  for (const st of STAY) {
    const who = 50000 + Math.round(st.seed * 13);
    if (cache[i] !== who) {
      cache[i] = who;
      crowd.color(i, pick(SHIRT, hash(who, 1)), pick(PANTS, hash(who, 2)), pick(SKIN, hash(who, 9)), pick(HAIR, hash(who, 10)));
    }
    const o = { x: st.x, y: 0, z: st.z, yaw: st.yaw, s: 0.93 + 0.12 * hash(who, 3) };
    const breathe = Math.sin(w * 1.3 + st.seed) * 0.01;
    o.pitch = breathe;
    if (st.kind === 'sit') { o.sit = 1; o.armL = 0.35 + 0.1 * Math.sin(w * 0.7 + st.seed); o.armR = 0.45 + 0.25 * Math.max(0, Math.sin(w * 0.5 + st.seed * 3)); o.look = 0.05 * Math.sin(w * 0.3 + st.seed); }
    else if (st.kind === 'wait') { o.look = 0.05; o.yaw += 0.15 * Math.sin(w * 0.2 + st.seed); if (hash(who, 5) < 0.3) { o.armR = 1.0; o.look = -0.2; } }
    else if (st.kind === 'photo') { o.armL = 1.05; o.armR = 1.05; o.look = 0.02; }
    else if (st.kind === 'pose') { o.armR = 1.62 * (0.85 + 0.15 * Math.sin(w * 0.8)); o.look = 0.05; }
    else if (st.kind === 'argue') { o.armL = 0.6 + 0.5 * Math.max(0, Math.sin(w * 2.2)); o.armR = 0.7 + 0.6 * Math.max(0, Math.sin(w * 2.2 + 1.3)); o.pitch = 0.06 * Math.sin(w * 2.2); }
    else if (st.kind === 'argue2') { o.armL = 0.3; o.armR = 0.9 + 0.3 * Math.sin(w * 1.1); o.yaw += 0.3 * Math.sin(w * 0.4); }
    else if (st.kind === 'read') { o.sit = 1; o.armL = 0.85; o.armR = 0.85; o.look = -0.5; }
    else if (st.kind === 'chess') {
      // leaning over the board; checkmate: hands to his head
      const k = smooth(W.mate + 0.5, W.mate + 1.2, w);
      o.sit = 1; o.armL = lerp(0.55, 1.65, k); o.armR = lerp(0.65, 1.65, k); o.look = lerp(-0.45, 0.1, k); o.pitch = 0.12 * (1 - k);
    }
    else if (st.kind === 'coffee') { o.armR = 0.9 + 0.25 * Math.max(0, Math.sin(w * 0.6)); o.look = 0.05; }
    // rain: the waiters and the couple cover their heads
    if (rainOn > 0 && (st.kind === 'wait' || st.kind.startsWith('argue') || st.kind === 'coffee')) {
      const k = smooth(W.rain + 0.4 + hash(who, 7), W.rain + 1.2 + hash(who, 7), w);
      o.armL = lerp(o.armL || 0, 1.65, k); o.armR = lerp(o.armR || 0, 1.65, k); o.look = lerp(o.look || 0, -0.2, k);
    }
    crowd.pose(i++, o);
  }
  // ---- the kid ----
  {
    if (cache[KID] !== -1) { cache[KID] = -1; crowd.color(KID, 0x2e86c1, 0x34495e, 0xe0ac86, 0x3a2414); }
    const k = kidAt(w);
    const o = { x: k.x, y: 0, z: k.z, yaw: k.yaw + Math.PI, s: 0.6 };
    if (w < W.kick) {
      // bouncing the ball with his right hand
      const ph = ((w * 1.6) % 1 + 1) % 1;
      o.armR = 0.55 + 0.35 * Math.cos(ph * Math.PI * 2); o.look = -0.4;
      o.yaw = Math.atan2(BALL0.x - k.x, BALL0.z - k.z);
    } else {
      o.walk = k.d / 0.45 * Math.PI; o.stride = 1.6 * k.run;
      o.armL = 0.6 * k.run + 0.9 * smooth(W.catch, W.catch + 0.4, w); o.armR = 0.5 * k.run + 0.9 * smooth(W.catch, W.catch + 0.4, w);
      o.look = 0.35 * smooth(W.catch, W.catch + 0.6, w);      // looks up at you
      o.pitch = 0.15 * k.run - 0.08 * smooth(W.catch, W.catch + 0.3, w) * (1 - smooth(W.catch + 0.3, W.catch + 0.9, w));
      o.yaw = k.yaw;
      // after: turns to face you; takes his ball back (closing)
      const face = Math.atan2(YOU1.x - k.x, YOU1.z - k.z);
      o.yaw = lerp(k.yaw, face, smooth(W.catch + 0.2, W.catch + 1.0, w));
      const take = smooth(W.back + 4.0, W.back + 4.8, w);
      o.armL = lerp(o.armL, 1.0, take); o.armR = lerp(o.armR, 1.0, take);
    }
    crowd.pose(KID, o);
  }
  // ---- his mother: on the phone, turns at the catch ----
  {
    if (cache[MOM] !== -1) { cache[MOM] = -1; crowd.color(MOM, 0xf5b7b1, 0x1b2631, 0xe0ac86, 0x2e2018); }
    const turn = smooth(W.catch + 0.1, W.catch + 0.9, w);
    const step = smooth(W.back + 2, W.back + 5, w);
    const o = { x: lerp(PARENT.x, 2.3, step), y: 0, z: lerp(PARENT.z, -3.7, step), yaw: lerp(2.4, Math.atan2(1.62 - PARENT.x, -4.18 - PARENT.z), turn), s: 0.97, armR: 1.05 * (1 - turn * 0.6), look: -0.25 * (1 - turn), walk: step * 6, stride: step > 0 && step < 1 ? 1 : 0 };
    crowd.pose(MOM, o);
  }
  // ---- the guitarist: on a stool, strumming ----
  {
    if (cache[GUIT] !== -1) { cache[GUIT] = -1; crowd.color(GUIT, 0xecf0f1, 0x4a6fa5, 0xc68a62, 0x151515); }
    const strum = Math.sin(w * Math.PI * 2 * 1.53);
    crowd.pose(GUIT, { x: GUITAR.x, y: 0.2, z: GUITAR.z, yaw: -Math.PI / 2 - 0.5, sit: 0.85, armL: 0.95, armR: 0.62 + 0.1 * strum, look: -0.2, s: 1.0 });
  }
  // ---- the bubble artist: two sticks up, slowly sweeping ----
  {
    if (cache[BUBB] !== -1) { cache[BUBB] = -1; crowd.color(BUBB, 0xf1c40f, 0x2e4053, 0x9a6440, 0x151515); }
    const sw = Math.sin(w * 0.55);
    crowd.pose(BUBB, { x: BUBBLER.x, y: 0, z: BUBBLER.z, yaw: 0.9 + 0.25 * sw, armL: 1.45 + 0.12 * sw, armR: 1.35 - 0.12 * sw, look: 0.25, s: 1.02 });
  }
  // ---- you (seen only when your mind's eye leaves your body): at the curb, holding the ball out a little ----
  {
    if (cache[SELF] !== -1) { cache[SELF] = -1; crowd.color(SELF, 0x2c3e50, 0x1b2631, 0xd9a27c, 0x2e2018); }
    crowd.pose(SELF, s.self ? { x: YOU1.x, y: 0, z: YOU1.z, yaw: Math.PI - 0.5, s: 1.0, armR: 0.85, armL: 0.05, look: -0.1 } : { visible: false, x: 0, y: 0, z: 0 });
  }
  // ten years later: the kid, his mother, the guitarist and the bubble artist have long gone home
  if (s.future > 0.5) for (const i of [KID, MOM, GUIT, BUBB]) crowd.pose(i, { visible: false, x: 0, y: 0, z: 0 });
  crowd.commit();
  if (umbrellas) umbrellas.commit(ui);
}

// umbrellas held by walkers (instanced canopy + shaft); hidden until opened
export function makeUmbrellas(scene, n) {
  const canopy = new THREE.ConeGeometry(0.55, 0.28, 10, 1, true).translate(0, 0, 0);
  const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5).translate(0, -0.45, 0);
  const cm = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide });
  const sm = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
  const c = new THREE.InstancedMesh(canopy, cm, n), s = new THREE.InstancedMesh(shaft, sm, n);
  c.castShadow = true; c.frustumCulled = false; s.frustumCulled = false;
  scene.add(c, s);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    n,
    set(i, o, open, color) {
      // in the right hand, above the head
      const yaw = o.yaw || 0;
      v.set(o.x + Math.cos(yaw) * 0.18, 2.05 * (o.s || 1), o.z - Math.sin(yaw) * 0.18);
      e.set(0, yaw, 0); q.setFromEuler(e);
      sc.set(0.15 + 0.85 * open, 0.4 + 0.6 * open, 0.15 + 0.85 * open);
      m.compose(v, q, sc);
      c.setMatrixAt(i, m); s.setMatrixAt(i, m);
      c.setColorAt(i, col.set(color));
    },
    commit(used) {
      for (let i = used; i < n; i++) { c.setMatrixAt(i, zero); s.setMatrixAt(i, zero); }
      c.instanceMatrix.needsUpdate = true; s.instanceMatrix.needsUpdate = true;
      if (c.instanceColor) c.instanceColor.needsUpdate = true;
    },
  };
}
