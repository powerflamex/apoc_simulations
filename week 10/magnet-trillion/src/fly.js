// How a thing comes to you: it shudders (and bolted things bend toward you) as the pull reaches it, tears loose at tR,
// accelerates in (s = u², the pull growing as it closes), tumbling, and lands at tL on the pile round you, where it stays.
// Cars slide along the ground, the bus tips over and drags. Every flight is a pure function of the video time.
// The pile: each thing lands on the side it came from, in a ring for its size class; the side facing the camera is kept
// clear (a 60° gap each way round the camera's direction) so the pile never hides you.
import * as THREE from 'three';
import { clamp, smooth } from './util.js';

export const CAM_AZ = Math.atan2(0.42, 1);           // the camera's direction from you (azimuth from +z toward +x)
const GAP = 62 * Math.PI / 180, LANE = 22 * Math.PI / 180;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// a landing spot for something coming from (sx, sz): ring [rMin, rMax], height [yMin, yMax]
export function pileSlot(sx, sz, { rMin, rMax, yMin, yMax, lane }, R) {
  const LN = lane ? lane * Math.PI / 180 : LANE;   // (wider for big things: a car's body reaches well past its centre)
  let az = Math.atan2(sx, sz);
  const d = angDiff(az, CAM_AZ);
  if (Math.abs(d) < GAP) az = CAM_AZ + Math.sign(d || 1) * (GAP + R() * 0.35);
  const r = rMin + (rMax - rMin) * R();
  // (and a lane straight ahead, past you up the street, so the camera sees over you to what's coming: within 60 m
  // nothing lands in it; the pile grows down both sides like the walls of a canyon)
  const fwd = Math.PI, d2 = angDiff(az, fwd);
  if (r < 60 && Math.abs(d2) < LN) az = fwd + Math.sign(d2 || 1) * (LN + R() * 0.3);
  return new THREE.Vector3(Math.sin(az) * r, yMin + (yMax - yMin) * R(), Math.cos(az) * r);
}
export const randQuat = (R) => new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6.28, R() * 6.28, R() * 6.28));

// make a flight: o = { p0, q0, p1, q1, tR, acc, dMin, dMax, arc, spin, mode, bend, shake, s1 }
export function flight(o, R) {
  const dist = o.p0.distanceTo(o.p1);
  const D = clamp(Math.sqrt(2 * dist / (o.acc ?? 30)), o.dMin ?? 0.3, o.dMax ?? 4);
  const ax = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
  // (bolted things bend toward you about their base before they snap: the axis across the pull)
  const to = new THREE.Vector3(-o.p0.x, 0, -o.p0.z).normalize();
  const bendAx = new THREE.Vector3(-to.z, 0, to.x);
  return { arc: 0, spin: 2 + 4 * R(), mode: 'fly', shake: 0.5, s1: 1, ...o, tL: o.tR + D, D, ax, bendAx, seed: R() };
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
// the pose at time v: writes pos, quat; returns the scale (1 in flight; s1 once landed: crumpled)
export function flyPose(f, v, pos, quat) {
  if (v < f.tR) {
    pos.copy(f.p0); quat.copy(f.q0);
    // the pull arriving: a shudder, and the bolted things lean in
    const k = smooth(f.tR - f.shake, f.tR, v);
    if (f.bend) { qa.setFromAxisAngle(f.bendAx, f.bend * Math.pow(smooth(f.tR - (f.bendT ?? 2.5), f.tR, v), 1.6)); quat.premultiply(qa); }
    if (k > 0) {
      const j = 0.035 * k;
      qa.setFromEuler(new THREE.Euler(Math.sin(v * 71 + f.seed * 9) * j, Math.sin(v * 63 + f.seed * 5) * j * 0.5, Math.sin(v * 57 + f.seed * 3) * j));
      quat.premultiply(qa);
      pos.y += Math.abs(Math.sin(v * 45 + f.seed * 7)) * 0.012 * k * (f.mode === 'fly' ? 1 : 0.3);
    }
    return 1;
  }
  if (v >= f.tL) {
    pos.copy(f.p1); quat.copy(f.q1);
    // a little give as it slams in
    const dt = v - f.tL;
    if (dt < 0.25) { const b = Math.sin(dt / 0.25 * Math.PI) * 0.06 * (1 - dt / 0.25); va.copy(f.p1).normalize(); pos.addScaledVector(va, b * Math.min(3, f.size ?? 1)); }
    return f.s1;
  }
  const u = (v - f.tR) / f.D, s = u * u;
  if (f.bend) qa.setFromAxisAngle(f.bendAx, f.bend); else qa.identity();
  const q0 = qb.copy(f.q0).premultiply(qa);
  if (f.mode === 'fly') {
    pos.lerpVectors(f.p0, f.p1, s);
    pos.y += f.arc * Math.sin(Math.PI * Math.min(1, s * 1.15));
    quat.slerpQuaternions(q0, f.q1, smooth(0, 1, s));
    qa.setFromAxisAngle(f.ax, f.spin * Math.sin(Math.PI * s));
    quat.premultiply(qa);
  } else if (f.mode === 'slide' || f.mode === 'tip') {
    // along the ground (sideways to the pull), riding up onto the pile at the end
    pos.lerpVectors(f.p0, f.p1, s);
    const up = smooth(0.72, 1, s);
    pos.y = f.p0.y * (1 - up) + f.p1.y * up + (f.mode === 'tip' ? 0 : Math.abs(Math.sin(u * 30 + f.seed * 6)) * 0.05 * (1 - up));
    if (f.mode === 'tip') {
      // the bus: pulled at its middle, its wheels grip, so it rolls onto its side toward you, then drags
      const roll = (Math.PI / 2) * smooth(0, 0.28, u);
      const to = va.set(-f.p0.x, 0, -f.p0.z).normalize();
      qa.setFromAxisAngle(new THREE.Vector3(to.z, 0, -to.x), roll);
      quat.copy(f.q0).premultiply(qa);
      // (rolling about its near bottom edge: its middle rises by half its width, so the side lands on the road)
      pos.y += Math.sin(roll) * (f.halfW ?? 1.3) * (1 - up);
      if (up > 0) { qb.slerpQuaternions(quat, f.q1, up); quat.copy(qb); }
    } else {
      qa.setFromAxisAngle(UP, f.spin * 0.25 * s);
      quat.copy(q0).premultiply(qa);
      if (up > 0) { qb.slerpQuaternions(quat, f.q1, up); quat.copy(qb); }
    }
  }
  return 1;
}
