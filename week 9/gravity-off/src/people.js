// The people, planned up front (pure data). Each one leaves the ground at t = 0 with the push they had: standing
// people a startle push of their own legs (0.15-0.6 m/s), walkers their stride's lift and speed, joggers more, kids
// and the players on the court their jumps; people sitting barely lift. Then a straight line (plus the 24 cm the Earth
// turns out from under everyone), turning slowly the way their push left them spinning, arms thrown out, legs
// kicking. At 0.00 they drop from where they got to and land in a heap (a sit, then a sprawl). The player under the
// south hoop caught the rim on his way up and hangs on, floating round it.
// Also here: the detailed figures close to the camera (you, the kid, the woman sitting on the ledge, the man walking
// past, the girl filming) and their flailing.
import * as THREE from 'three';
import { BASIN, COURT, TREES, LAMPS, BENCHES, MASTS, ROAD, SQ } from './layout.js';
import { G, T_ON, fly, YOU0, YOU_U, KID0, KID_U, LEDGE, kidAt } from './timeline.js';
import { CARS, carAt } from './traffic.js';
import { SKIN, HAIR } from './crowd.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { camPos } from './camera.js';
import { tOf, STOPS, stopAt, setGravityBack } from './timeline.js';

const SHIRT = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0xffffff, 0x1d1d1d, 0xb5838d, 0x6d597a, 0x8ecae6, 0x264653, 0x2b3a55, 0xe8e6e0, 0x8a96a8, 0x5a6a4a, 0x7a2a2a, 0xd8d2c4, 0x3a5a9a, 0xf2c14e, 0x4ea8de, 0xc0392b, 0x16a085];
const PANTS = [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c, 0x4a6a9a, 0xc9c2b6, 0x23252b, 0x3a4a6a, 0x8a7a66];

export const PEOPLE = [];
{
  const R = rng(9090);
  const you = { x: YOU0[0], z: YOU0[2] };
  const add = (p) => {
    p.i = PEOPLE.length;
    p.shirt = SHIRT[Math.floor(R() * SHIRT.length)]; p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)]; p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.6; p.ph = R() * 6.28; p.s = p.s ?? 0.93 + R() * 0.12;
    p.fq = 1.1 + 0.9 * R(); p.ab = 1.15 + 0.5 * R(); p.r1 = R(); p.r2 = R();
    p.w = p.w ?? [(R() - 0.5) * 0.3, (R() - 0.5) * 0.15, (R() - 0.5) * 0.3];
    PEOPLE.push(p);
    return p;
  };
  const blocked = (x, z, near = 1.0) =>
    TREES.some((t) => Math.hypot(t.x - x, t.z - z) < near + 0.3) || LAMPS.some((l) => Math.hypot(l.x - x, l.z - z) < near) ||
    BENCHES.some((b) => Math.hypot(b.x - x, b.z - z) < near + 0.6) || MASTS.some((m) => Math.hypot(m.x - x, m.z - z) < near) ||
    PEOPLE.some((q) => Math.hypot(q.x - x, q.z - z) < 1.1);
  const inCourt = (x, z, m = 0.6) => x > COURT.x0 - m && x < COURT.x1 + m && z > COURT.z0 - m && z < COURT.z1 + m;
  // sitting on the fountain's ledge, facing out (not next to you: that's the camera's space)
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + 0.1 * R();
    if (Math.abs(Math.atan2(Math.sin(a - Math.atan2(you.z, you.x)), Math.cos(a - Math.atan2(you.z, you.x)))) < 0.62) continue;
    if (R() < 0.3) continue;
    const r = BASIN.rIn + 0.32;
    add({ kind: 'sit', x: Math.cos(a) * r, z: Math.sin(a) * r, y: LEDGE, yaw: Math.atan2(Math.cos(a), Math.sin(a)), u: [Math.cos(a) * 0.08, 0.1 + 0.18 * R(), Math.sin(a) * 0.08], w: [-0.08 - 0.12 * R(), (R() - 0.5) * 0.1, (R() - 0.5) * 0.12] });
  }
  // the plaza: standing, walking, kids
  let tries = 0;
  while (PEOPLE.length < 95 && tries++ < 4000) {
    const x = SQ.x0 + 1 + R() * (SQ.x1 - SQ.x0 - 2), z = SQ.z0 + 1 + R() * (SQ.z1 - SQ.z0 - 2);
    const r = Math.hypot(x, z);
    if (r < BASIN.rOut + 0.8 || inCourt(x, z) || Math.hypot(x - you.x, z - you.z) < 5.2 || blocked(x, z)) continue;
    if (z > 13 && Math.abs(x) < 6) continue;              // (the camera's backstop)
    const k = R();
    if (k < 0.4) add({ kind: 'stand', x, z, y: 0, yaw: R() * 6.28, u: [(R() - 0.5) * 0.25, 0.15 + 0.45 * R(), (R() - 0.5) * 0.25] });
    else if (k < 0.85) {
      const yaw = R() * 6.28, sp = 1.15 + 0.35 * R();
      add({ kind: 'walk', x, z, y: 0, yaw, u: [Math.sin(yaw) * sp, 0.3 + 0.5 * R(), Math.cos(yaw) * sp], w: [0.1 + 0.25 * R(), (R() - 0.5) * 0.1, (R() - 0.5) * 0.15] });
    } else {
      const jump = R() < 0.6;
      add({ kind: jump ? 'kidjump' : 'kidrun', x, z, y: 0, yaw: R() * 6.28, s: 0.6 + 0.15 * R(), u: jump ? [(R() - 0.5) * 0.3, 1.2 + 1.4 * R(), (R() - 0.5) * 0.3] : [Math.sin(R() * 6.28) * 2.2, 0.7 + 0.4 * R(), Math.cos(R() * 6.28) * 2.2] });
    }
  }
  // two joggers on the paths
  for (const [x, z, yaw] of [[-9, 15.5, 1.75], [9.5, -16, -1.3]]) add({ kind: 'jog', x, z, y: 0, yaw, u: [Math.sin(yaw) * 2.9, 1.05, Math.cos(yaw) * 2.9], w: [0.25, 0.05, 0.1] });
  // on the benches
  BENCHES.forEach((b, k) => {
    if (k % 3 === 2) return;
    for (const off of k % 2 ? [-0.45, 0.45] : [0.2]) {
      const x = b.x + Math.cos(b.yaw) * off - Math.sin(b.yaw) * 0.05, z = b.z - Math.sin(b.yaw) * off - Math.cos(b.yaw) * 0.05;
      if (Math.hypot(x - you.x, z - you.z) < 4.5) continue;
      add({ kind: 'sit', x, z, y: 0.02, yaw: b.yaw + Math.PI, u: [0, 0.08 + 0.15 * R(), 0], w: [-0.06 - 0.1 * R(), (R() - 0.5) * 0.08, (R() - 0.5) * 0.1] });
    }
  });
  // the court: the dunker on the south rim, two going up for the rebound, the rest running, watchers on the west side
  Object.assign(add({ kind: 'dunk', x: COURT.hoopX - 0.15, z: COURT.rimZ - 0.55, y: 0, yaw: 0.0, u: [0, 0, 0], w: [0, 0, 0] }), { shirt: 0xd62828, pants: 0xf2f2ee, sleeves: false });
  for (const [x, z, vy, y0] of [[19.4, 10.9, 2.35, 0.42], [21.7, 10.4, 2.05, 0.3], [18.2, 8.6, 1.6, 0.2]]) add({ kind: 'jumper', x, z, y: y0, yaw: R() * 0.6 - 0.3, u: [(R() - 0.5) * 0.4, vy, 0.3 + 0.3 * R()], w: [(R() - 0.5) * 0.4, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3] });
  for (const [x, z, yaw, sp] of [[16.5, 3.5, 0.4, 4.6], [23.5, 5.0, -0.3, 5.2], [20.0, 0.5, 0.1, 3.6], [25.5, 9.5, 2.6, 3.0], [15.2, 11.2, 2.3, 2.4]]) add({ kind: 'run', x, z, y: 0, yaw, u: [Math.sin(yaw) * sp, 0.45 + 0.35 * R(), Math.cos(yaw) * sp], w: [0.2 + 0.25 * R(), (R() - 0.5) * 0.2, (R() - 0.5) * 0.3] });
  for (let z = -6; z < 12.5; z += 1.7) add({ kind: 'stand', x: COURT.x1 + 1.0 + 0.4 * R(), z, y: 0, yaw: -Math.PI / 2 + (R() - 0.5) * 0.5, u: [(R() - 0.5) * 0.2, 0.2 + 0.4 * R(), (R() - 0.5) * 0.2] });
  // the street: people on the sidewalk (clear of the rolling car's path) and three on the crosswalk
  for (const z of [-24, -19, -14, -8.5, 17, 21.5, 25.5]) { const dir = R() < 0.5 ? 0 : Math.PI; add({ kind: 'walk', x: ROAD.curb + 1.2 + 0.9 * R(), z, y: 0, yaw: dir, u: [0, 0.35 + 0.4 * R(), Math.cos(dir) * 1.3], w: [0.15 + 0.2 * R(), 0, (R() - 0.5) * 0.15] }); }
  for (const [x, dir] of [[-27.4, 1], [-25.6, 1], [-23.2, -1]]) add({ kind: 'walk', x, z: -29.4, y: 0, yaw: dir * Math.PI / 2, u: [dir * 1.35, 0.4 + 0.3 * R(), 0], w: [0.2, 0, 0.1] });
  // nobody in the way of the cars that leave the street or of the kid's flight
  {
    const o = {}, c = {}, k = {};
    const movers = CARS.filter((cc) => cc.drive);
    for (const p of PEOPLE) {
      if (p.kind === 'dunk' || p.gone) continue;
      for (let t = 0; t < 7.5 && !p.gone; t += 0.1) {
        fly([p.x, p.y, p.z], p.u, t, o, 0);
        for (const cc of movers) { carAt(cc, t, c); if (Math.hypot(o.x - c.x, (o.y + 0.9 - c.y) * 0.8, o.z - c.z) < 3.2) { p.gone = true; break; } }
        kidAt(t, k); if (Math.hypot(o.x - k.x, o.y - k.y, o.z - k.z) < 1.4) p.gone = true;
      }
    }
  }
  // nobody drifts into the lens: drop anyone whose body comes within 2.2 m of the camera (sampled every 0.25 s of video)
  {
    const cam = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }, o = {};
    for (const p of PEOPLE) {
      if (p.kind === 'dunk') continue;
      // (the square's stops only: 5 SECONDS and 1 MINUTE, and 10 MINUTES where the crowd floats round you)
      for (let v = -1; v < STOPS[2].end && !p.gone; v += 0.1) {
        const si = stopAt(v); setGravityBack(STOPS[si].T);
        camPos(v, cam); fly([p.x, p.y, p.z], p.u, tOf(v), o, 0);
        if (Math.hypot(o.x - cam.x, o.y + 0.9 - cam.y, o.z - cam.z) < (si === 0 ? 2.2 : 3.5)) p.gone = true;
      }
      setGravityBack(5);
    }
  }
  // nobody's path may run through anybody else's: drop the later of any two that come within 0.75 m (sampled)
  const P = (p, t, o) => fly([p.x, p.y, p.z], p.u, t, o, 0);
  const A = {}, B = {};
  for (let i = PEOPLE.length - 1; i >= 0; i--) {
    const a = PEOPLE[i];
    if (a.kind === 'dunk') continue;
    for (let j = 0; j < i && !a.gone; j++) {
      const b = PEOPLE[j];
      if (b.gone || b.kind === 'dunk') continue;
      for (let t = 0; t <= 5.2; t += 0.2) { P(a, t, A); P(b, t, B); if (Math.hypot(A.x - B.x, (A.y - B.y) * 0.5, A.z - B.z) < 0.75) { a.gone = true; break; } }
    }
  }
}

// in the time-lapses the limbs and the slow tumbling run on a calm clock of their own (ANIM, set by main.js), or they
// would strobe; their positions still follow the story time
export let ANIM = null;
export function setAnim(x) { ANIM = x; }
// the pose of a crowd person at story time t (for poseFloat), and where they are
export function personAt(p, t, out) {
  out.visible = !p.gone;
  if (p.gone) return out;
  const st = out.st || (out.st = {});
  if (p.kind === 'dunk') return dunkAt(p, t, out);
  const f = fly([p.x, p.y, p.z], p.u, t, st, 0);
  const tt = clamp(t, 0, T_ON);
  const sit0 = p.kind === 'sit' ? 1 : 0;
  // turning slowly the way they were left spinning (frozen once they land)
  const tr = ANIM ?? Math.min(t, st.landed ? st.tl : t);
  let pitch = p.w[0] * tr, yaw = p.yaw + p.w[1] * tr, roll = p.w[2] * tr;
  if (p.kind === 'walk' || p.kind === 'jog' || p.kind === 'run' || p.kind === 'kidrun') pitch += 0.12;
  // the flail: arms thrown out and up, swinging; legs kicking (slow: it's 8x slow motion)
  const ph = (ANIM ?? t) * p.fq * 2 * Math.PI + p.ph, react = smooth(0.0, 0.35, t);
  let abL = lerp(0.15, p.ab + 0.35 * Math.sin(ph), react), abR = lerp(0.15, p.ab + 0.35 * Math.sin(ph + 1.9), react);
  let fwL = 0.4 * Math.sin(ph * 0.7 + 1), fwR = 0.4 * Math.sin(ph * 0.7 + 2.5);
  let legL = 0.35 * Math.sin(ph * 0.8) * react, legR = -0.35 * Math.sin(ph * 0.8 + 0.6) * react, spread = 0.15 + 0.15 * react;
  let sit = sit0 * (1 - 0.6 * smooth(0.2, 2.5, t));
  let y = st.y;
  // the court's jumpers had their arms up already
  if (p.kind === 'jumper') { abL = lerp(2.6, abL, smooth(0.3, 1.5, t)); abR = lerp(2.7, abR, smooth(0.3, 1.5, t)); }
  // landed: a crumple into a sit, then a sprawl back
  if (st.landed) {
    const k = smooth(0, 0.18, t - st.tl), k2 = smooth(0.12, 0.45, t - st.tl);
    sit = lerp(sit, 1, k);
    pitch = lerp(pitch, -1.2 - 0.3 * p.r1, k2); roll = lerp(roll, 0, k);
    abL = lerp(abL, 0.6, k); abR = lerp(abR, 0.7, k); legL = lerp(legL, 0, k); legR = lerp(legR, 0, k);
    y = 0.02;
  } else if (t > T_ON) {
    // falling: arms go up
    const k = smooth(T_ON, T_ON + 0.25, t);
    abL = lerp(abL, 2.4, k); abR = lerp(abR, 2.5, k);
  }
  Object.assign(out, { x: st.x, y, z: st.z, yaw, pitch, roll, s: p.s, sit, abL, abR, fwL, fwR, legL, legR, spread, look: 0.25 * Math.sin(ph * 0.5) - 0.3 });
  return out;
}

// the player who caught the rim: hanging below it, his legs swinging slowly up and round (the way he was going)
function dunkAt(p, t, out) {
  const ang = 0.35 * Math.min(t, T_ON) * smooth(0.1, 0.6, t);
  let a = ang;
  if (t > T_ON) a = ang * Math.cos(Math.sqrt(G / 1.3) * (t - T_ON)) * Math.exp(-(t - T_ON));
  // the hands on the rim's front edge; the body hangs from them (2.25 m from hands to feet)
  const hx = COURT.hoopX, hy = COURT.rimY, hz = COURT.rimZ - 0.22;
  const L = 1.0;
  const cx = hx, cy = hy - Math.cos(a) * L, cz = hz - Math.sin(a) * L;
  Object.assign(out, { x: cx, y: cy - 1.0, z: cz, yaw: 0, pitch: a, roll: 0, s: 1.0, sit: 0, abL: 2.95, abR: 2.95, fwL: -0.1, fwR: -0.1, legL: 0.3 * Math.sin(t * 2.2), legR: -0.25 * Math.sin(t * 2.0 + 1), spread: 0.15, look: 0.6, pivotY: 1.0 });
  return out;
}

// write a crowd person's matrices: the body turned about its middle (1 m up), arms out to the sides (abL/abR),
// forward (fwL/fwR), legs kicking (legL/legR) and spread
const HIP = 0.9, SHOULDER = 1.42;
const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), loc = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
export function poseFloat(crowd, i, P) {
  const [torso, head, hair, legL, legR, armL, armR] = crowd.meshes;
  if (!P.visible) { for (const m of crowd.meshes) m.setMatrixAt(i, hide); return; }
  const s = P.s ?? 1, pv = (P.pivotY ?? 1.0);
  e.set(P.pitch || 0, P.yaw || 0, P.roll || 0, 'YXZ'); q.setFromEuler(e);
  // base = T(x, y + pv*s, z) R S T(0, -pv, 0)  (+ the sit lowering)
  base.compose(v3.set(P.x, P.y + pv * s - (P.sit || 0) * 0.42 * s, P.z), q, sc.setScalar(s)).multiply(loc.makeTranslation(0, -pv, 0));
  torso.setMatrixAt(i, base);
  e.set(-(P.look || 0) * 0.55, 0, 0, 'XYZ');
  loc.makeTranslation(0, SHOULDER, 0).multiply(m4.makeRotationFromEuler(e)).multiply(new THREE.Matrix4().makeTranslation(0, -SHOULDER, 0));
  m4.multiplyMatrices(base, loc); head.setMatrixAt(i, m4); hair.setMatrixAt(i, m4);
  const legSit = -1.45 * (P.sit || 0);
  [[legL, -0.085, -1, P.legL || 0], [legR, 0.085, 1, P.legR || 0]].forEach(([mesh, x, sx, kick]) => {
    e.set(kick + legSit, 0, sx * (P.spread || 0) * (1 - (P.sit || 0)), 'XYZ');
    loc.makeRotationFromEuler(e).setPosition(x, HIP, 0);
    mesh.setMatrixAt(i, m4.multiplyMatrices(base, loc));
  });
  [[armL, -0.215, -1, P.abL || 0, P.fwL || 0], [armR, 0.215, 1, P.abR || 0, P.fwR || 0]].forEach(([mesh, x, sx, ab, fw]) => {
    e.set(-fw, 0, sx * ab, 'XYZ');
    loc.makeRotationFromEuler(e).setPosition(x, SHOULDER - 0.02, 0);
    mesh.setMatrixAt(i, m4.multiplyMatrices(base, loc));
  });
}

// ---- the detailed figures near the camera ----
export const FIGS = [
  // you: on the ledge, facing the camera
  { name: 'you', p: YOU0, u: YOU_U, yaw: 0.0, w: [-0.03, 0.02, 0.02], s: 1, mode: 'stand', floor: BASIN.water, colors: { hoodie: 0x2f6fd0, jeans: 0x2a2e38, skin: 0xd09a74, hair: 0x2a1a10 } },
  // the kid: jumped at 10 ft/s just as it went
  { name: 'kid', p: KID0, u: KID_U, yaw: 0.35, w: [0.05, -0.04, 0.03], s: 0.72, mode: 'jump', floor: 0, colors: { hoodie: 0xf2c14e, jeans: 0x3a4a6a, skin: 0xe0ac86, hair: 0x4a3020 } },
  // a woman sitting on the ledge to your right (camera's left), tipping back over the water
  { name: 'woman', p: [-1.75, LEDGE + 0.02, 7.05], u: [-0.04, 0.2, -0.05], yaw: -0.1, w: [-0.13, 0.03, -0.04], s: 0.95, mode: 'sit', floor: BASIN.water, colors: { hoodie: 0xb5385a, jeans: 0x23252b, skin: 0xc68a62, hair: 0x151515 } },
  // a girl filming the fountain on her phone
  { name: 'girl', p: [3.45, 0, 7.75], u: [0.05, 0.32, -0.03], yaw: -2.6, w: [0.02, -0.05, 0.07], s: 0.93, mode: 'film', floor: 0, colors: { hoodie: 0xe8e6e0, jeans: 0x4a6a9a, skin: 0x9a6440, hair: 0x1d1612 } },
];
// a figure's root: where its middle is and how it's turned, at story time t
export function figAt(F, t, out) {
  const st = out.st || (out.st = {});
  if (F.name === 'kid') kidAt(t, st); else fly(F.p, F.u, t, st, F.floor);
  const tr = ANIM ?? (st.landed ? st.tl : t);
  out.x = st.x; out.y = st.y; out.z = st.z; out.landed = st.landed; out.tl = st.tl; out.vy = st.vy;
  out.pitch = F.w[0] * Math.max(0, Math.min(tr, 6)); out.yaw = F.yaw + F.w[1] * Math.max(0, tr); out.roll = F.w[2] * Math.max(0, tr);
  return out;
}
// the flail on a you.js figure (after fig.pose): shoulders out and up, elbows swinging, knees kicking
export function flail(fig, F, t, seed, fk) {
  const ph = (ANIM ?? t) * (1.4 + 0.3 * seed) * 2 * Math.PI + seed * 5;
  const react = smooth(0.0, 0.3, t);
  const fallK = fk ?? smooth(T_ON, T_ON + 0.25, t);
  fig.arms.forEach((A, i) => {
    const sx = A.sx;
    let out = 1.25 + 0.35 * Math.sin(ph + i * 1.7), fwd = -0.2 + 0.45 * Math.sin(ph * 0.6 + i * 2.2);
    if (F.mode === 'jump') { out = lerp(0.35, out, smooth(0.4, 1.8, t)); fwd = lerp(-2.6, fwd, smooth(0.4, 1.8, t)); }
    if (F.mode === 'film' && i === 0) { out = lerp(0.3, out, smooth(0.6, 2.0, t)); fwd = lerp(-1.3, fwd, smooth(0.6, 2.0, t)); }
    out = lerp(out, 2.5, fallK); fwd = lerp(fwd, -0.6, fallK);
    A.sh.rotation.set(fwd * react + (1 - react) * 0.06, 0, sx * (0.16 + (out - 0.16) * react), 'XYZ');
    A.el.rotation.set((0.35 + 0.45 * (0.5 + 0.5 * Math.sin(ph * 1.3 + i))) * react + 0.25 * (1 - react), 0, 0);
    A.wr.rotation.set(0.2 * Math.sin(ph + i), 0, 0);
    // fingers spread wide
    A.fingers.forEach((f, j) => f.forEach((seg, k) => seg.rotation.set(0, 0, (0.1 + 0.15 * k) * (1 - react) - 0.05 * react + (j - 1.5) * 0.04)));
  });
  fig.legs.forEach((L, i) => {
    const kick = 0.5 * Math.sin(ph * 0.8 + i * 2.4) * react;
    const hipA = (F.mode === 'sit' ? lerp(1.45, 0.5, smooth(0.3, 2.5, t)) : 0.15) + Math.max(0, kick) * 0.8;
    const kneeA = (F.mode === 'sit' ? lerp(1.5, 0.6, smooth(0.3, 2.5, t)) : 0.25) + 0.6 * (0.5 + 0.5 * Math.sin(ph * 0.9 + i * 1.3)) * react;
    L.hip.rotation.set(-hipA, 0, (i === 0 ? -1 : 1) * (0.08 + 0.18 * react));
    L.knee.rotation.set(kneeA, 0, 0);
    L.ankle.rotation.set(0.3 * Math.sin(ph + i), 0, 0);
  });
}
