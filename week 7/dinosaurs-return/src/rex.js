// The two T. rexes: where they walk, how their feet come down, and what they do when.
// Rex 1 walks down the avenue toward you from 151 ft (46 m) away, weaving between the jammed cars: it roars on frame 0,
// a footstep at 0:03, steps on a car at 0:06 (its left foot comes down on the roof), roars at you at 0:09, bites a car at
// 0:12 and throws it, comes on while the others turn up, knocks a car aside at 0:30, brings its head down to yours at
// 0:36, breathes you in at 0:39, opens its jaws at 0:42 and roars into your lens at 0:44.
// Rex 2 steps out of the side street behind you at 0:33, when you turn to run, and roars.
// Feet never slide: each one is planted where the hip will be at mid-stance (makeGait) and stays there until it lifts.
import * as THREE from 'three';
import { makeTheropod, REACH, headFrame } from './theropod.js';
import { Frame } from './loft.js';
import { makeGait } from './loft.js';
import { rexS, rexSpeed, V_CRUSH, V_ROAR, V_TOSS, V_BACK, V_SHOVE, V_TWO, V_SEES, V_SNIFF, V_JAWS, V_LUNGE } from './timeline.js';
import { CAM0, EYE } from './layout.js';
import { smooth, clamp, lerp, wobble } from './util.js';

function makePath(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  curve.arcLengthDivisions = 1000;
  const L = curve.getLength();
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  const at = (s) => {
    const u = clamp(s / L, 0, 1);
    curve.getPointAt(u, p);
    // heading: the tangent averaged over a couple of metres, so it turns smoothly
    let tx = 0, tz = 0;
    for (const ds of [-1.5, 0, 1.5]) { curve.getTangentAt(clamp((s + ds) / L, 0, 1), t); tx += t.x; tz += t.z; }
    return { x: p.x, z: p.z, yaw: Math.atan2(tx, tz) };
  };
  const sNear = (x, z) => { let best = 0, bd = 1e9; for (let s = 0; s <= L; s += 0.05) { const q = at(s); const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = s; } } return best; };
  return { L, at, sNear };
}

// ---- rex 1's path (pelvis), and the arc length it reaches at 0:45 (its pelvis 6.2 m from you, head at your lens) ----
const PATH1 = makePath([[-10, -46], [-6, -37], [-2, -29.5], [2, -22], [4, -14.5], [3, -7.5], [1, -2.5], [0, 1.2], [0, 4]]);
const S1_END = PATH1.sNear(0, 1.4);
const S1_0 = S1_END - rexS(45);
export const sRex1 = (v) => S1_0 + rexS(v);
// (the counter: the tip of its snout in the walking pose, measured along the ground)
export function rexDistance(v) {
  const q = PATH1.at(sRex1(v));
  return Math.max(0.3, Math.hypot(q.x - CAM0.x, q.z - CAM0.z) - REACH);
}

const LAT = 0.5;
const rightOf = (yaw) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });
const GAIT1 = makeGait({ speedAt: rexSpeed, C: 3.0, vFull: 1.5, minStep: 0.3 });
// the left foot comes down exactly on the car at V_CRUSH
const OFF1 = Math.ceil(GAIT1.gAt(V_CRUSH)) - GAIT1.gAt(V_CRUSH);
const N_CRUSH = Math.round(GAIT1.gAt(V_CRUSH) + OFF1);
const plant1 = (sd) => (vm, n) => {
  const q = PATH1.at(sRex1(vm)), r = rightOf(q.yaw);
  const x = q.x + r.x * sd * LAT, z = q.z + r.z * sd * LAT;
  return { x, z, yaw: q.yaw, y: (sd < 0 && n === N_CRUSH) || (vm > V_CRUSH && onCrushed(x, z)) ? CRUSHED_TOP : 0 };
};
function onCrushed(x, z) {
  if (!CRUSH_CAR) return false;
  const dx = x - CRUSH_CAR.x, dz = z - CRUSH_CAR.z, s = Math.sin(CRUSH_CAR.yaw), c = Math.cos(CRUSH_CAR.yaw);
  return Math.abs(dx * c - dz * s) < 1.15 && Math.abs(dx * s + dz * c) < 2.5;
}
export const CRUSHED_TOP = 0.62;
export let CRUSH_CAR = null;
CRUSH_CAR = (() => { const p = plant1(-1)(GAIT1.vOf(N_CRUSH + 0.31 - OFF1), N_CRUSH); return { x: p.x - Math.sin(p.yaw) * 0.25, z: p.z - Math.cos(p.yaw) * 0.25, yaw: Math.PI + 0.35 }; })();

// the car it knocks aside at 0:32: on the median just ahead of you, on its left, clear of the herd's two routes (its
// leg meets the car's back end)
export const SHOVE = (() => { const q = PATH1.at(sRex1(35)); const l = { x: Math.cos(q.yaw), z: -Math.sin(q.yaw) }; return { x: q.x + l.x * 1.3, z: q.z + l.z * 1.3, yaw: q.yaw + Math.PI, dx: l.x, dz: l.z }; })();

// ---- rex 2: out of the side street behind you ----
const PATH2 = makePath([[-44, 27.5], [-30, 27], [-17, 26], [-8.5, 22], [-4, 16.5], [-2, 12.5]]);
const S2_AT = PATH2.sNear(-12.5, 24.8);
const SP2 = 1.35, V2_ON = 31.5, V2_OFF = 37.0;
export const sRex2 = (v) => S2_AT + SP2 * (v - (V_TWO + 0.4));
const GAIT2 = makeGait({ speedAt: () => SP2, C: 3.0, vFull: 1.5, minStep: 0.3 });
const plant2 = (sd) => (vm) => { const q = PATH2.at(sRex2(vm)), r = rightOf(q.yaw); return { x: q.x + r.x * sd * LAT, z: q.z + r.z * sd * LAT, yaw: q.yaw, y: 0 }; };

// ---- footprints (for the cracked asphalt): every foot-down of both, worked out once ----
export const PRINTS = [];
{
  for (const [gait, off, plant, v0, v1] of [[GAIT1, OFF1, plant1, -4, 46], [GAIT2, 0, plant2, V2_ON, V2_OFF]]) {
    for (const [sd, o] of [[-1, off], [1, off + 0.5]]) {
      for (let n = Math.floor(gait.gAt(v0) + o); n <= gait.gAt(v1) + o; n++) {
        const t = gait.vOf(n - o);
        if (t < v0 || t > v1) continue;
        const p = plant(sd)(gait.vOf(n + 0.31 - o), n);
        if (p.y > 0) continue;
        PRINTS.push({ t, x: p.x, z: p.z, yaw: p.yaw, who: plant === plant1 ? 1 : 2 });
      }
    }
  }
  PRINTS.sort((a, b) => a.t - b.t);
}
export const STEPS = PRINTS;                       // (the soundtrack and the camera shake use the same list)

// ---- what rex 1 does when ----
const win = (v, a, b, c, d) => smooth(a, b, v) * (1 - smooth(c, d, v));
function act1(v) {
  const roar = Math.max(win(v, -1.3, -0.8, 1.0, 1.7) * 0.85, win(v, V_ROAR - 0.25, V_ROAR + 0.05, V_ROAR + 1.4, V_ROAR + 2.0) * 1.05);
  const low = win(v, V_TOSS - 0.55, V_TOSS + 0.2, V_TOSS + 0.35, V_TOSS + 0.95);
  const lift = win(v, V_TOSS + 0.3, V_TOSS + 0.6, V_TOSS + 0.9, V_TOSS + 1.8);
  const swing = lerp(0.55, -0.85, smooth(V_TOSS + 0.32, V_TOSS + 0.95, v)) * win(v, V_TOSS - 0.6, V_TOSS, V_TOSS + 1.0, V_TOSS + 2.0);
  let jaw = roar * (1.05 + 0.04 * Math.sin(v * 31));
  jaw = Math.max(jaw, 0.75 * win(v, V_TOSS - 0.5, V_TOSS + 0.05, V_TOSS + 0.15, V_TOSS + 0.3), 0.55 * win(v, V_TOSS + 0.63, V_TOSS + 0.72, V_TOSS + 1.1, V_TOSS + 1.7));
  const hold = win(v, V_TOSS + 0.25, V_TOSS + 0.32, V_TOSS + 0.9, V_TOSS + 0.96);          // the car in its jaws
  const hunt = smooth(V_BACK - 0.5, V_BACK + 1.0, v);                                      // head low and forward, coming for you
  const down = smooth(V_SEES - 0.4, V_SEES + 1.2, v);                                      // head down to yours
  const sniff = win(v, V_SNIFF - 0.1, V_SNIFF + 0.2, V_SNIFF + 1.8, V_SNIFF + 2.4);
  const open = smooth(V_JAWS - 0.2, V_JAWS + 1.4, v) * (1 - smooth(V_LUNGE - 0.05, V_LUNGE + 0.2, v));
  const rear = win(v, V_LUNGE - 0.05, V_LUNGE + 0.25, V_LUNGE + 0.3, V_LUNGE + 0.55);
  const lunge = smooth(V_LUNGE + 0.3, V_LUNGE + 0.7, v);
  jaw = Math.max(jaw, open * (0.42 + 0.03 * Math.sin(v * 13)), rear * 0.5, lunge * (1.15 + 0.03 * Math.sin(v * 37)));
  return { roar, low, lift, swing, jaw, hold, hunt, down, sniff, rear, lunge };
}
export const actRex1 = act1;

// bring the head to height y and point the skull (the line from the back of it to the snout) at your lens:
// the neck's bend sets the height (bisection), then the head turns to aim
const _hf = new Frame(), _d = new THREE.Vector3(), _x = new THREE.Vector3();
function aimHead(P, y) {
  let lo = -1.9, hi = 0.8;
  for (let k = 0; k < 14; k++) {
    const m = (lo + hi) / 2;
    P.neckPitch = m;
    headFrame(P, _hf);
    if (_hf.o.y > y) hi = m; else lo = m;
  }
  P.neckPitch = (lo + hi) / 2;
  for (let k = 0; k < 3; k++) {
    headFrame(P, _hf);
    _d.set(CAM0.x - _hf.o.x, EYE - 0.08 - _hf.o.y, CAM0.z - _hf.o.z).normalize();
    _hf.dir(1.47, -0.2, 0, _x).normalize();                // the skull's line, back of the head to the snout
    const ey = Math.atan2(_d.y, Math.hypot(_d.x, _d.z)) - Math.atan2(_x.y, Math.hypot(_x.x, _x.z));
    let ay = Math.atan2(_d.x, _d.z) - Math.atan2(_x.x, _x.z);
    ay = Math.atan2(Math.sin(ay), Math.cos(ay));
    P.headPitch = (P.headPitch || 0) + ey;
    P.headYaw = (P.headYaw || 0) + ay;
  }
}

export function makeRexes(scene) {
  const r1 = makeTheropod(scene, { seed: 0, tone: 0 });
  const r2 = makeTheropod(scene, { seed: 2.1, tone: 1 });
  const P = { feet: [{}, {}], tail: [0, 0] };
  const toCam = new THREE.Vector3();
  const aim = (from, yaw) => {            // yaw and pitch from a point to your lens, relative to a heading
    toCam.set(CAM0.x - from.x, EYE - from.y, CAM0.z - from.z);
    let dy = Math.atan2(toCam.x, toCam.z) - yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return { yaw: dy, pitch: Math.atan2(toCam.y, Math.hypot(toCam.x, toCam.z)), dist: toCam.length() };
  };
  function walk(gait, off, plant, s, path, v) {
    const q = path.at(s);
    const g = gait.gAt(v) + off;
    for (const [i, sd, o] of [[0, -1, off], [1, 1, off + 0.5]]) {
      const f = gait.foot(v, o, 0.62, plant(sd));
      Object.assign(P.feet[i], f.p, { lift: f.lift });
    }
    P.x = q.x; P.z = q.z; P.yaw = q.yaw;
    const bob = Math.cos(4 * Math.PI * (g - 0.31));
    // its weight swings over the foot it stands on
    const sway = Math.sin(2 * Math.PI * (g - 0.31)) * 0.06, r = rightOf(q.yaw);
    P.x += r.x * sway; P.z += r.z * sway;
    P.h = 3.62 + 0.07 * bob;
    P.roll = -sway * 0.4;
    P.tail[0] = 0.07 * Math.sin(2 * Math.PI * g + 0.6);
    P.tail[1] = 0.02 * bob;
    P.arm = Math.sin(2 * Math.PI * g);
    P.breath = 0.5 + 0.5 * Math.sin(v * 1.9);
    return { g, bob };
  }
  return {
    r1, r2,
    frame(v) {
      // ---- rex 1 ----
      const s1 = sRex1(v);
      const { bob } = walk(GAIT1, OFF1, plant1, s1, PATH1, v);
      const A = act1(v);
      const neckBase = { x: P.x + Math.sin(P.yaw) * 3.4, y: 3.9, z: P.z + Math.cos(P.yaw) * 3.4 };
      const a = aim(neckBase, P.yaw);
      const look = lerp(0.35, 0.85, smooth(V_BACK - 1, V_BACK + 1, v));
      P.lean = 0.04 + 0.32 * A.low + 0.08 * A.hunt + 0.1 * A.down - 0.07 * A.roar - 0.08 * A.rear + 0.06 * A.lunge;
      P.h -= 0.45 * A.low + 0.12 * A.hunt + 0.38 * A.down + 0.05 * A.lunge;
      P.neckYaw = clamp(a.yaw * look, -0.75, 0.75) * (1 - A.low) * (1 - A.lift) + A.swing;
      P.neckPitch = 0.0 + 0.38 * A.roar - 1.05 * A.low + 0.3 * A.lift - 0.12 * A.hunt + 0.12 * A.rear - 0.05 * A.lunge;
      P.headPitch = 0.12 * A.roar - 0.12 * A.low - 0.06 * bob * 0.3;
      P.headYaw = clamp(a.yaw * look * 0.35, -0.3, 0.3) * (1 - A.low);
      P.headRoll = 0.08 * A.down * Math.sin(v * 0.9) + 0.1 * A.sniff * Math.sin(v * 2.2);
      // head down to your eye level and aimed at your lens (a little higher when it rears back, at the lens when it lunges)
      if (A.down > 0) {
        const keep = { np: P.neckPitch, hp: P.headPitch, hy: P.headYaw };
        P.headPitch = 0; P.headYaw = 0;
        aimHead(P, 2.05 + 0.35 * A.rear - 0.35 * A.lunge + 0.04 * Math.sin(v * 1.3));
        P.neckPitch = lerp(keep.np, P.neckPitch, A.down) + 0.025 * A.sniff * Math.sin(v * 9);
        P.headPitch = lerp(keep.hp, P.headPitch, A.down) - 0.18 * A.rear * 0 + 0.0;
        P.headYaw = lerp(keep.hy, P.headYaw, A.down);
      }
      P.jaw = A.jaw;
      r1.pose(P);
      r1.act = A;
      // ---- rex 2 ----
      const on = v > V2_ON && v < V2_OFF;
      r2.visible(on);
      if (on) {
        walk(GAIT2, 0, plant2, sRex2(v), PATH2, v);
        const roar2 = win(v, V_TWO + 0.35, V_TWO + 0.7, V_TWO + 1.9, V_TWO + 2.5);
        const nb = { x: P.x + Math.sin(P.yaw) * 3.4, y: 3.9, z: P.z + Math.cos(P.yaw) * 3.4 };
        const a2 = aim(nb, P.yaw);
        P.lean = 0.04 - 0.08 * roar2; P.neckYaw = clamp(a2.yaw * 0.7, -0.7, 0.7); P.neckPitch = 0.42 * roar2; P.headPitch = 0.12 * roar2;
        P.headYaw = clamp(a2.yaw * 0.3, -0.3, 0.3); P.headRoll = 0; P.jaw = roar2 * (1.05 + 0.04 * Math.sin(v * 29));
        r2.pose(P);
        r2.roar = roar2;
      }
      window.__rexDist = rexDistance(v);
    },
  };
}
export { PATH1, PATH2, GAIT1, OFF1, rightOf };
export const wob = wobble;
