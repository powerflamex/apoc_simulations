// The choreography: where you are, how you move and pose, and how each thing moves (rest -> lifted -> thrown ->
// landed) at video time v. Everything is a pure function of v. World units: metres, x east, y up, z south.
//   thingAt(name, v) -> { p: Vector3 (the thing's centre), q: Quaternion, crush, dent: {p, d, r, k} (local) }
//   youAt(v) -> { x, z, yaw, y, mode, ... }  (main.js poses the figure and puts its hands on the grip points)
import * as THREE from 'three';
import { B, timeOfLog } from './timeline.js';
import { BUS, TRUCK, JET, SHIP, TOWER, MTN, SPOT, SEA_Y } from './layout.js';
import { smooth, clamp, lerp } from './util.js';

const G = 9.81;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const QE = (x, y, z, o = 'YXZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
const QA = (ax, a) => new THREE.Quaternion().setFromAxisAngle(ax.clone().normalize(), a);
const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
// ---- tracks: a list of phases, each with t0..t1 and a pose function of k (0..1) -> { p, q, ... } ----
function track(phases) {
  return (v) => {
    let ph = phases[0];
    for (const x of phases) if (v >= x.t0) ph = x;
    const k = ph.t1 > ph.t0 ? clamp((v - ph.t0) / (ph.t1 - ph.t0), 0, 1) : 0;
    return ph.f(k, v);
  };
}
// keyframed pose between two poses (position lerp, rotation slerp), eased
const between = (a, b, e = ease) => (k) => {
  const t = e(k);
  return { p: a.p.clone().lerp(b.p, t), q: a.q.clone().slerp(b.q, t), crush: lerp(a.crush || 0, b.crush || 0, t), dent: lerp(a.dent || 0, b.dent || 0, t) };
};
const hold = (a) => () => ({ p: a.p.clone(), q: a.q.clone(), crush: a.crush || 0, dent: a.dent || 0 });
// ballistic flight from a (at t0) to b (at t1), spinning about a world axis by ang; crush/dent carried
function fly(a, b, t0, t1, axis, ang, g = G) {
  const T = t1 - t0;
  const vel = V3((b.p.x - a.p.x) / T, (b.p.y - a.p.y + 0.5 * g * T * T) / T, (b.p.z - a.p.z) / T);
  return (k) => {
    const tau = k * T;
    const p = V3(a.p.x + vel.x * tau, a.p.y + vel.y * tau - 0.5 * g * tau * tau, a.p.z + vel.z * tau);
    const q = QA(axis, ang * k).multiply(a.q.clone());
    return { p, q, crush: a.crush || 0, dent: a.dent || 0, vel };
  };
}
// after landing: slide and tumble to rest (a little bounce), crush rising fast
function settle(a, b, bounce = 0.6) {
  return (k) => {
    const t = easeOut(k);
    const p = a.p.clone().lerp(b.p, t);
    p.y += bounce * Math.abs(Math.sin(Math.PI * Math.min(1, k * 1.6))) * (1 - k);
    return { p, q: a.q.clone().slerp(b.q, easeOut(Math.min(1, k * 1.3))), crush: lerp(a.crush || 0, b.crush || 0, Math.min(1, k * 4)), dent: b.dent || 0 };
  };
}
// the end pose of a fly phase (its rotation applied in full)
const flyEnd = (a, b, axis, ang) => ({ p: b.p.clone(), q: QA(axis, ang).multiply(a.q.clone()), crush: b.crush || 0, dent: b.dent || 0 });
const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);

// ======================= THE CAR (held at frame 0, tossed aside) =======================
// its centre: 0.72 m above its origin (cars.js: body 0.28 .. 1.42); the palm on its floor (local y 0.28 -> centre - 0.44)
export const CAR_C = 0.72;
const carYaw = SPOT.start.yaw + 0.95;
const CAR0 = { p: V3(0.32, 2.14 + 0.44, -0.12), q: QE(0, carYaw, 0) };
const CAR_W = { p: V3(0.3, 2.45 + 0.44, 0.35), q: QE(-0.12, carYaw + 0.1, 0.1) };
const CAR_L = { p: V3(-2.2, 0.95, -14.5), q: null, crush: 0.15 };
const CAR_AX = V3(-0.9, 0, 0.45);
CAR_L.q = QA(CAR_AX, 1.9).multiply(CAR_W.q.clone());
const CAR_R = { p: V3(-3.0, 0.72, -16.6), q: QA(CAR_AX, Math.PI).multiply(QE(0, carYaw + 0.5, 0)), crush: 0.3 };
const car = track([
  { t0: -9, t1: 0.6, f: (k, v) => ({ p: CAR0.p.clone().add(V3(0.04 * Math.sin(v * 2.1), 0.03 * Math.sin(v * 3.3), 0.04 * Math.sin(v * 1.7 + 1))), q: QE(0.04 * Math.sin(v * 1.9), carYaw + 0.03 * Math.sin(v * 1.3), 0.05 * Math.sin(v * 2.3 + 0.5)).multiply(QE(0, 0, 0)), crush: 0 }) },
  { t0: 0.6, t1: B.carToss, f: between({ p: CAR0.p.clone().add(V3(0.04 * Math.sin(0.6 * 2.1), 0.03 * Math.sin(0.6 * 3.3), 0.04 * Math.sin(0.6 * 1.7 + 1))), q: QE(0.04 * Math.sin(0.6 * 1.9), carYaw + 0.03 * Math.sin(0.6 * 1.3), 0.05 * Math.sin(0.6 * 2.3 + 0.5)) }, CAR_W) },
  { t0: B.carToss, t1: B.carLand, f: fly(CAR_W, CAR_L, B.carToss, B.carLand, CAR_AX, 1.9) },
  { t0: B.carLand, t1: B.carLand + 0.9, f: settle(CAR_L, CAR_R, 0.45) },
  { t0: B.carLand + 0.9, t1: 99, f: hold(CAR_R) },
]);

// ======================= THE BUS =======================
export const BUS_C = 1.65;                                  // its centre above its origin
const busRest = { p: V3(BUS.x, BUS_C, BUS.z), q: QE(0, 0, 0) };
const busTip = { p: V3(BUS.x - 0.25, BUS_C + 0.32, BUS.z), q: QE(0, 0, 0.16) };
const busUp = { p: V3(SPOT.bus.x, 2.12 - 0.32 + BUS_C, BUS.z), q: QE(0, 0, 0), dent: 0.6 };
const busTurned = { p: busUp.p.clone().add(V3(0, 0.05, 0)), q: QE(0, 0, 0), dent: 0.8 };
const busWind = { p: busUp.p.clone().add(V3(0, -0.25, 0.45)), q: QE(0.1, 0, 0), dent: 0.9 };
const BUS_L = { p: V3(-11.0, 1.55, -50.5), crush: 0.55, dent: 1 };
const BUS_AX = X;
const BUS_SP = -2.5;
const busLandQ = QA(BUS_AX, BUS_SP).multiply(busWind.q.clone());
const BUS_R = { p: V3(-12.4, 1.45, -63.5), q: QE(0, 0.3, 0).multiply(QA(BUS_AX, -Math.PI).multiply(busWind.q.clone())), crush: 0.6, dent: 1 };
const bus = track([
  { t0: -9, t1: B.busGrab, f: hold(busRest) },
  { t0: B.busGrab, t1: B.busGrab + 0.45, f: between(busRest, busTip) },
  { t0: B.busGrab + 0.45, t1: B.busUp, f: between(busTip, busUp) },
  { t0: B.busUp, t1: B.busThrow - 0.28, f: between(busUp, busTurned) },
  { t0: B.busThrow - 0.28, t1: B.busThrow, f: between(busTurned, busWind) },
  { t0: B.busThrow, t1: B.busLand, f: fly(busWind, { p: BUS_L.p, crush: 0, dent: 0.9 }, B.busThrow, B.busLand, BUS_AX, BUS_SP) },
  { t0: B.busLand, t1: B.busLand + 1.5, f: settle({ ...BUS_L, q: busLandQ }, BUS_R, 0.9) },
  { t0: B.busLand + 1.5, t1: 99, f: hold(BUS_R) },
]);

// ======================= THE TRUCK =======================
export const TRUCK_C = 2.0;
const trRest = { p: V3(TRUCK.x, TRUCK_C, TRUCK.z), q: QE(0, 0, 0) };
const trTip = { p: V3(TRUCK.x + 0.2, TRUCK_C + 0.25, TRUCK.z), q: QE(0, 0, -0.12) };
const trUp = { p: V3(SPOT.truck.x, 2.12 - 1.1 + TRUCK_C, TRUCK.z), q: QE(0, 0, 0), dent: 0.7 };
const trTurned = { p: trUp.p.clone().add(V3(0, 0.04, 0)), q: QE(0, 0, 0), dent: 0.9 };
const trWind = { p: trUp.p.clone().add(V3(0, -0.3, 0.6)), q: QE(0.08, 0, 0), dent: 1 };
// it hits the ship's side front first (the hull's south face is at z = -97)
const TR_HIT = { p: V3(6.2, 6.5, -97 + 10.25 + 0.3), crush: 0.15, dent: 1 };
const TR_AX = V3(1, 0, 0.3), TR_SP = -0.3;
const trHitQ = QA(TR_AX, TR_SP).multiply(trWind.q.clone());
const TR_R = { p: V3(4.8, 1.25, -87.6), q: QE(-0.15, 0.4, -Math.PI / 2), crush: 0.75, dent: 1 };
const truck = track([
  { t0: -9, t1: B.truckGrab, f: hold(trRest) },
  { t0: B.truckGrab, t1: B.truckGrab + 0.45, f: between(trRest, trTip) },
  { t0: B.truckGrab + 0.45, t1: B.truckUp, f: between(trTip, trUp) },
  { t0: B.truckUp, t1: B.truckThrow - 0.35, f: between(trUp, trTurned) },
  { t0: B.truckThrow - 0.35, t1: B.truckThrow, f: between(trTurned, trWind) },
  { t0: B.truckThrow, t1: B.truckHit, f: fly(trWind, { p: TR_HIT.p, dent: 1 }, B.truckThrow, B.truckHit, TR_AX, TR_SP) },
  // the crash: crumples against the hull, then drops back onto the quay on its side
  { t0: B.truckHit, t1: B.truckHit + 1.25, f: (k) => {
    const a = { ...TR_HIT, q: trHitQ, crush: 0.55 };
    const t = k;
    const p = a.p.clone().lerp(TR_R.p, easeOut(t));
    p.y = a.p.y + (TR_R.p.y - a.p.y) * (t * t) + 1.2 * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - t);
    return { p, q: a.q.clone().slerp(TR_R.q, ease(Math.min(1, t * 1.2))), crush: lerp(0.55, TR_R.crush, Math.min(1, t * 3)), dent: 1 };
  } },
  { t0: B.truckHit + 1.25, t1: 99, f: hold(TR_R) },
]);

// ======================= THE SHIP (three pieces; you hold the middle one at x = 30) =======================
// the pieces' joints: x = -50 (bow piece) and x = 60 (stern piece); the hull's south side is local z = +19
const SH_REST = { p: V3(SHIP.x, SEA_Y, SHIP.z), q: QE(0, 0, 0) };
// lifted: up 9.8 m and 3.2 m toward you, its near side up a little (its near bilge comes onto your hands)
const SH_UP = { p: V3(SHIP.x, SEA_Y + 9.8, SHIP.z + 3.2), q: QE(-0.06, 0, 0), dent: 1 };
const SH_WIND = { p: V3(SHIP.x, SEA_Y + 8.9, SHIP.z + 3.8), q: QE(-0.1, 0, 0), dent: 1 };
// thrown across the harbor: it rolls over toward the north and lands on the far shore, west of where you'll land
const SH_L = { p: V3(-140, 9, -392), crush: 0.2, dent: 1 };
const SH_AX = V3(1, 0, 0), SH_SP = 2.3;
const shLandQ = QA(SH_AX, SH_SP).multiply(SH_WIND.q.clone());
const SH_R = { p: V3(-146, 7, -398), q: QA(SH_AX, 2.55).multiply(QE(0, 0.04, 0)), crush: 0.45, dent: 1 };
const SHIP_CAN = timeOfLog(Math.log10(2.2e6));
const shipMid = track([
  { t0: -9, t1: B.shipGrab, f: (k, v) => ({ p: SH_REST.p.clone().add(V3(0, 0.08 * Math.sin(v * 0.6), 0)), q: QE(0.002 * Math.sin(v * 0.5), 0, 0.0015 * Math.sin(v * 0.4)), crush: 0, dent: 0 }) },
  // you grip it and strain: it shudders but can't move until the counter reaches a cruise ship's weight (2,200,000x)
  { t0: B.shipGrab, t1: SHIP_CAN, f: (k, v) => ({ p: SH_REST.p.clone().add(V3(0, 0.08 * Math.sin(v * 0.6) + 0.12 * k * Math.sin(v * 23), 0.05 * k * Math.sin(v * 17))), q: QE(-0.004 * k * (1 + Math.sin(v * 13)), 0, 0.002 * k * Math.sin(v * 11)), crush: 0, dent: k }) },
  { t0: SHIP_CAN, t1: B.shipUp, f: between({ p: SH_REST.p.clone().add(V3(0, 0.08 * Math.sin(SHIP_CAN * 0.6), 0)), q: QE(0, 0, 0), dent: 1 }, SH_UP, (t) => 1 - Math.pow(1 - t, 1.6)) },
  { t0: B.shipUp, t1: B.shipThrow, f: between(SH_UP, SH_WIND) },
  { t0: B.shipThrow, t1: B.shipLand, f: fly(SH_WIND, SH_L, B.shipThrow, B.shipLand, SH_AX, SH_SP, 14) },
  { t0: B.shipLand, t1: B.shipLand + 1.6, f: settle({ ...SH_L, q: shLandQ }, SH_R, 2.5) },
  { t0: B.shipLand + 1.6, t1: 99, f: hold(SH_R) },
]);
// the end pieces sag from their joints while it is held (they "break where you hold it"), then fly a little apart
export function shipSag(v) {
  const s = smooth(SHIP_CAN + 0.2, B.shipUp + 0.3, v) * 0.11 + 0.03 * smooth(B.shipUp, B.shipThrow, v);
  const fl = smooth(B.shipThrow, B.shipLand, v), set = smooth(B.shipLand, B.shipLand + 1.2, v);
  return { bow: s * (1 - fl) + 0.22 * fl + 0.1 * set, stern: s * 0.8 * (1 - fl) + 0.18 * fl + 0.12 * set, apart: 6 * fl + 8 * set };
}

// ======================= THE JET (thrown into the ship, where it stays, burning) =======================
export const JET_C = 5.4;                                    // the fuselage axis above its origin
const jRest = { p: V3(JET.x, JET_C, JET.z), q: QE(0, JET.yaw, 0) };
const jUp = { p: V3(JET.x, JET_C + 1.0, JET.z), q: QE(0.0, JET.yaw, 0), dent: 0.8 };
const jWind = { p: V3(JET.x + 0.4, JET_C + 0.75, JET.z), q: QE(0.0, JET.yaw, 0.02), dent: 1 };
// it hits the ship's decks rolled ~70 deg, its north wing first, and stays wedged there (in the middle piece's frame)
const J_AX = V3(1, 0.25, -0.15), J_SP = -1.15;
const jHitQ = QA(J_AX, J_SP).multiply(jWind.q.clone());
const J_HIT = { p: V3(40, 33, -87.5), crush: 0.2, dent: 1 };
// wedged: pushed 3 m further in and down, crumpled; stored relative to the ship's middle piece at rest
const J_STUCK = { p: V3(40, 30.5, -90.2), q: QA(V3(0, 0, 1), 0.08).multiply(jHitQ.clone()), crush: 0.75, dent: 1 };
const shipRestM = new THREE.Matrix4().compose(SH_REST.p, SH_REST.q, V3(1, 1, 1));
const J_LOCAL = new THREE.Matrix4().copy(shipRestM).invert().multiply(new THREE.Matrix4().compose(J_STUCK.p, J_STUCK.q, V3(1, 1, 1)));
const jet = track([
  { t0: -9, t1: B.jetGrab, f: hold(jRest) },
  { t0: B.jetGrab, t1: B.jetUp, f: between(jRest, jUp) },
  { t0: B.jetUp, t1: B.jetThrow - 0.3, f: (k, v) => ({ p: jUp.p.clone().add(V3(0, 0.06 * Math.sin(v * 9), 0)), q: QE(0, JET.yaw, 0.008 * Math.sin(v * 5)).multiply(QE(0.006 * Math.sin(v * 7), 0, 0)), dent: 0.8 + 0.2 * k }) },
  { t0: B.jetThrow - 0.3, t1: B.jetThrow, f: between({ p: jUp.p, q: QE(0, JET.yaw, 0), dent: 1 }, jWind) },
  { t0: B.jetThrow, t1: B.jetHit, f: fly(jWind, J_HIT, B.jetThrow, B.jetHit, J_AX, J_SP) },
  { t0: B.jetHit, t1: B.jetHit + 0.35, f: between({ ...J_HIT, q: jHitQ }, J_STUCK, easeOut) },
  // from here on it rides with the ship's middle piece
  { t0: B.jetHit + 0.35, t1: 99, f: (k, v) => {
    const s = shipMid(v);
    const m = new THREE.Matrix4().compose(s.p, s.q, V3(1, 1, 1)).multiply(J_LOCAL);
    const p = V3(), q = new THREE.Quaternion(), sc = V3();
    m.decompose(p, q, sc);
    return { p, q, crush: 0.75 + 0.2 * smooth(B.shipLand, B.shipLand + 0.5, v), dent: 1 };
  } },
]);

// ======================= THE TOWER (five pieces; tipped about its far bottom edge, then thrown) =======================
// the stack's base: rotation about the tower's east bottom edge (x = TOWER.x + 18) by phi (negative: the near side up)
const TW_PIV = V3(TOWER.x + TOWER.w / 2, 0, TOWER.z);
function towerBase(v) {
  // returns { M: Matrix4 of the stack's base frame, bend: per-joint extra rotation }
  const lift = smooth(B.towerGrab + 0.2, B.towerUp, v), heave = smooth(B.towerUp, B.towerThrow, v);
  const phi = -0.064 * lift - 0.05 * heave;
  const M = new THREE.Matrix4().makeTranslation(TW_PIV.x, TW_PIV.y, TW_PIV.z)
    .multiply(new THREE.Matrix4().makeRotationZ(phi))
    .multiply(new THREE.Matrix4().makeTranslation(-TW_PIV.x, -TW_PIV.y, -TW_PIV.z));
  return M;
}
// flight: the stack (as one) turns about its base's middle and flies north-east across the harbor
const TW_FLY0 = V3(TOWER.x, 0, TOWER.z);
const TW_LAND = V3(185, 14, -392);
const TW_T = B.towerLand - B.towerThrow;
export function towerPiece(k, v) {
  const y0 = k * 57;
  if (v < B.towerThrow) {
    const M = towerBase(v);
    // the joints open as it bends: the upper pieces lag and sway a little
    const lift = smooth(B.towerGrab + 0.2, B.towerThrow, v);
    const sway = (0.004 * k + 0.0015 * k * k) * lift * Math.sin(v * 3.1 + k) + 0.006 * k * lift;
    const local = new THREE.Matrix4().makeTranslation(TOWER.x, y0, TOWER.z).multiply(new THREE.Matrix4().makeRotationZ(sway));
    const W = M.clone().multiply(local);
    const p = V3(), q = new THREE.Quaternion(), s = V3();
    W.decompose(p, q, s);
    return { p, q, crush: 0, dent: k === 0 ? 0.6 + 0.4 * smooth(B.towerUp, B.towerThrow, v) : 0, crack: k === 0 ? lift : lift * 0.5 };
  }
  // in flight: the whole stack's base point moves on a ballistic arc while the stack topples to near horizontal
  const tau = Math.min(v - B.towerThrow, TW_T);
  const M0 = towerBase(B.towerThrow);
  const base0 = V3(TOWER.x, 0, TOWER.z).applyMatrix4(M0);
  const vel = V3((TW_LAND.x - base0.x) / TW_T, (TW_LAND.y - base0.y + 0.5 * 9 * TW_T * TW_T) / TW_T, (TW_LAND.z - base0.z) / TW_T);
  const basePos = V3(base0.x + vel.x * tau, base0.y + vel.y * tau - 0.5 * 9 * tau * tau, base0.z + vel.z * tau);
  const kk = tau / TW_T;
  const phi0 = -0.114;
  const phi = phi0 + (-1.47 - phi0) * (kk * kk * (1.6 - 0.6 * kk));
  const yawT = 0.35 * kk;
  const qStack = QE(0, yawT, 0).multiply(QE(0, 0, phi, 'XYZ'));
  // after landing the pieces come apart along the ground (each slides on, the joints open)
  const land = smooth(B.towerLand - 0.05, B.towerLand + 1.3, v);
  const along = V3(0, y0 + 0.5 * 57 * 0 + 0, 0).applyQuaternion(qStack);
  const p = basePos.clone().add(V3(0, y0, 0).applyQuaternion(qStack)).add(V3(Math.cos(yawT) * k * 9 * land, -k * 2 * land, -Math.sin(yawT) * k * 9 * land + (k % 2 ? 6 : -5) * land));
  const q = qStack.clone().multiply(QE((k % 2 ? 0.25 : -0.2) * land, 0, 0.12 * k * land));
  return { p, q, crush: 0.5 * land, dent: 1, crack: 1, along };
}

// ======================= THE MOUNTAIN =======================
// lifted by its near edge about its far edge (axis along x at the far foot), then thrown: it rises, tips over away
// from you and lands ~3 km further north
const M_FAR = V3(MTN.x, 0, MTN.z - MTN.rz);
const M_LEVER = 2 * MTN.rz;
const MTN_CAN = timeOfLog(Math.log10(5e11));                                   // 4.5 km from the far foot to the near foot
export function mountainAt(v) {
  // its near foot can only start to come up once you can lift ~half its weight (5e11x, ~0:40.2)
  const lift = smooth(MTN_CAN, B.mtnUp, v), heave = smooth(B.mtnUp, B.mtnThrow, v);
  let ang = (2.3 * lift + 1.4 * heave) / M_LEVER;              // the near foot up ~3.7 m by the release
  let off = V3(0, 0, 0);
  if (v > B.mtnThrow) {
    const T = B.mtnLand - B.mtnThrow, tau = Math.min(v - B.mtnThrow, T), k = tau / T;
    // it lifts off and flies away north (~3 km), rising to ~800 m and coming down, tipping back only a little
    // (real time this would take minutes; drawn ~10x faster)
    ang = ang + 0.12 * k;
    off = V3(0, 900 * k * (1 - k) * (1 + 0.6 * (1 - k)), -3200 * Math.pow(k, 1.5) - 300 * k);
    if (v > B.mtnLand) {
      const s = smooth(B.mtnLand, B.mtnLand + 2.2, v);
      ang += 0.06 * s; off.add(V3(0, -90 * s, -200 * s));
    }
  }
  // shake while you strain
  const sh = (lift - heave * 0.5) * 0.000012 * Math.sin(v * 37) * (v < B.mtnThrow ? 1 : 0);
  const M = new THREE.Matrix4().makeTranslation(off.x, off.y, off.z)
    .multiply(new THREE.Matrix4().makeTranslation(M_FAR.x, M_FAR.y, M_FAR.z))
    .multiply(new THREE.Matrix4().makeRotationX(-ang + sh))
    .multiply(new THREE.Matrix4().makeTranslation(-M_FAR.x, -M_FAR.y, -M_FAR.z));
  return { M, ang, lift, heave, fly: smooth(B.mtnThrow, B.mtnLand, v), crack: clamp(lift * 0.8 + heave * 0.6 + smooth(B.mtnThrow, B.mtnThrow + 0.8, v) * 0.4, 0, 1.4) };
}

export const TRACK = { car, bus, truck, jet, shipMid };
export function thingAt(name, v) { return TRACK[name](v); }

// ======================= YOU =======================
// moves between the spots: [t0, t1, from, to, kind] (jog, run, bound, leap)
const S = SPOT;
const MOVES = [
  [1.3, 2.62, S.start, S.bus, 'jog'],
  [5.15, 7.65, S.bus, S.truck, 'run'],
  [10.95, 13.05, S.truck, S.jet, 'bound', 2],
  [16.25, 18.75, S.jet, S.ship, 'bound', 2],
  [23.3, 26.75, S.ship, S.tower, 'bound', 3],
  [B.leap, B.leapLand, S.tower, S.mtn, 'leap', 1],
];
// which way you face while standing at each place, and how you turn under a held thing: [t, yaw]
const YAWK = [
  [-9, S.start.yaw], [1.25, S.start.yaw], [2.62, S.bus.yaw], [B.busUp, S.bus.yaw], [B.busUp + 0.35, -Math.PI],
  [7.65, S.truck.yaw], [B.truckUp, S.truck.yaw], [B.truckUp + 0.4, Math.PI], [13.05, Math.PI], [18.75, Math.PI],
  [26.75, S.tower.yaw], [B.towerThrow + 0.6, S.tower.yaw], [B.leap, S.tower.yaw - 0.3],
];
function yawAt(v) {
  // interpolate the shortest way round between keys (the moves override this with their heading)
  let a = YAWK[0];
  for (let i = 0; i < YAWK.length - 1; i++) {
    const p = YAWK[i], q = YAWK[i + 1];
    if (v >= p[0] && v <= q[0]) {
      let d = q[1] - p[1];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return p[1] + d * ease(clamp((v - p[0]) / Math.min(q[0] - p[0], 0.45), 0, 1));
    }
    a = q;
  }
  return YAWK[YAWK.length - 1][1];
}
const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
export function youAt(v) {
  const o = { v, mode: 'stand', air: 0, gaitPh: 0, amp: 0, speed: 0, lean: 0, crouch: 0, hands: null };
  // where: standing at a spot, or moving between two
  let pos = { x: S.start.x, z: S.start.z }, yaw = yawAt(v);
  let mv = null;
  for (const m of MOVES) if (v >= m[0] - 1e-6) mv = m;
  if (mv) {
    const [t0, t1, a, b, kind, nb] = mv;
    const D = Math.hypot(b.x - a.x, b.z - a.z), head = Math.atan2(b.x - a.x, b.z - a.z);
    if (v <= t1) {
      const k = (v - t0) / (t1 - t0);
      let s;
      if (kind === 'jog' || kind === 'run') {
        // accelerate, cruise, slow down
        s = D * (k < 0.2 ? 0.5 * (k / 0.2) * (k / 0.2) * 0.2 / 0.8 : k > 0.8 ? 1 - 0.5 * ((1 - k) / 0.2) * ((1 - k) / 0.2) * 0.2 / 0.8 : (k - 0.1) / 0.8);
        s = D * ease(k) * 0.35 + s * 0.65;
        o.mode = 'run'; o.amp = kind === 'jog' ? 0.55 : 0.85;
        o.gaitPh = (s / (kind === 'jog' ? 1.9 : 2.6)) * Math.PI;
        o.speed = D / (t1 - t0);
      } else {
        // bounds (or one leap): a crouch, then nb arcs, touching down between them
        const pre = kind === 'leap' ? 0.0 : 0.12;
        const kk = clamp((k - pre) / (1 - pre), 0, 1);
        s = D * (kk * kk * (3 - 2 * kk) * 0.25 + kk * 0.75);
        const seg = Math.min(nb - 1, Math.floor(kk * nb)), sk = kk * nb - seg;
        const H = kind === 'leap' ? 11.5 : 2.2;
        o.air = k < pre ? 0 : 4 * H * sk * (1 - sk);
        o.mode = kind; o.boundK = sk; o.boundI = seg; o.preK = k / pre;
        o.speed = D / (t1 - t0);
      }
      pos = { x: a.x + (b.x - a.x) * (s / D), z: a.z + (b.z - a.z) * (s / D) };
      // face where you're going, turning back to the spot's facing at the end
      const into = smooth(0, 0.2, k), out = smooth(0.82, 1, k);
      yaw = angLerp(angLerp(yawAt(t0), head, into), b.yaw, out);
      if (kind === 'leap') yaw = angLerp(angLerp(yawAt(t0), head, smooth(0, 0.12, k)), b.yaw, smooth(0.85, 1, k));
    } else pos = { x: b.x, z: b.z };
  }
  o.x = pos.x; o.z = pos.z; o.yaw = yaw;
  // the lifting poses (crouch 0..1, arms: which thing and how)
  const ph = (a, b) => clamp((v - a) / (b - a), 0, 1);
  o.lift = null;
  if (v < B.carLand) o.lift = { thing: 'car', one: true, k: 1, throwK: smooth(0.6, B.carToss + 0.08, v) - smooth(B.carToss + 0.08, B.carToss + 0.45, v) };
  else if (v >= B.busGrab - 0.15 && v < B.busThrow + 0.45) o.lift = { thing: 'bus', k: ph(B.busGrab - 0.15, B.busUp), throwK: smooth(B.busThrow - 0.3, B.busThrow, v) - smooth(B.busThrow, B.busThrow + 0.45, v), rel: v > B.busThrow };
  else if (v >= B.truckGrab - 0.2 && v < B.truckThrow + 0.45) o.lift = { thing: 'truck', k: ph(B.truckGrab - 0.2, B.truckUp), throwK: smooth(B.truckThrow - 0.35, B.truckThrow, v) - smooth(B.truckThrow, B.truckThrow + 0.45, v), rel: v > B.truckThrow };
  else if (v >= B.jetGrab - 0.2 && v < B.jetThrow + 0.45) o.lift = { thing: 'jet', k: ph(B.jetGrab - 0.2, B.jetUp), throwK: smooth(B.jetThrow - 0.3, B.jetThrow, v) - smooth(B.jetThrow, B.jetThrow + 0.45, v), rel: v > B.jetThrow };
  else if (v >= B.shipGrab - 0.25 && v < B.shipThrow + 0.5) o.lift = { thing: 'ship', k: ph(B.shipGrab - 0.25, B.shipUp), throwK: smooth(B.shipThrow - 0.5, B.shipThrow, v) - smooth(B.shipThrow, B.shipThrow + 0.5, v), rel: v > B.shipThrow };
  else if (v >= B.towerGrab - 0.25 && v < B.towerThrow + 0.5) o.lift = { thing: 'tower', k: ph(B.towerGrab - 0.25, B.towerUp), throwK: smooth(B.towerThrow - 0.5, B.towerThrow, v) - smooth(B.towerThrow, B.towerThrow + 0.5, v), rel: v > B.towerThrow };
  else if (v >= B.mtnGrab - 0.3 && v < B.mtnThrow + 0.6) o.lift = { thing: 'mtn', k: ph(B.mtnGrab - 0.3, B.mtnGrab + 1.2), throwK: smooth(B.mtnUp, B.mtnThrow, v) - smooth(B.mtnThrow, B.mtnThrow + 0.6, v), rel: v > B.mtnThrow };
  return o;
}
export { MOVES };
