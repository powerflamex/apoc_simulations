// Where you are and how you stand at video time v. Each jump: a crouch, the push-off (legs straight, arms flung up),
// the flight (shown sped up: the real flight time squeezed into its step; the height follows the real parabola in that
// squeezed time), and the landing (a deep crouch that comes back up). From the escape jump on you leave for good; for
// the bigger jumps after it you are back in the crater, crouched, for a moment before each push-off.
import { JUMPS, heightOf } from './timeline.js';
import { P } from './layout.js';
import { smooth, clamp, lerp } from './util.js';

const YAW_J0 = 1.3;            // jumping over the bus: facing east-south-east (side-on to the frame-0 camera)
const YAW_P = -0.55;           // in the crater: facing the cameras down the avenue (south, a little west)
// the flight's height above the take-off ground (m) at fraction u of the real flight time
const traj = (j, u) => j.h * 4 * u * (1 - u);
// the video time when jump j is at height y on the way up / down (for the effects and the cameras)
export function timeAtHeight(j, y, down = false) {
  const q = Math.sqrt(Math.max(0, 1 - y / j.h));
  const u = down ? 0.5 + 0.5 * q : 0.5 - 0.5 * q;
  return j.p + u * (j.l - j.p);
}
// the escape and later jumps: how far up you are after the push-off (m): v0 t, sped up like the 1e6x one
export function escapeH(j, v) { const t = Math.max(0, v - j.p); return j.v0 * t * 400; }

export function youAt(v) {
  const Y = { x: P.x, z: P.z, y: 0, yaw: YAW_P, visible: true, air: 0, jump: -1, u: 0 };
  // which jump: in the air, or on the ground between two
  let k = -1;
  JUMPS.forEach((j, i) => { if (v >= j.p) k = i; });
  const j = k >= 0 ? JUMPS[k] : null;
  const pose = { hipY: 0.92, lean: 0.04, footZ: 0.05, head: [-0.15, 0], armsUp: 0, armsFwd: 0, armsOut: 0, curl: 0.4 };
  Y.pose = pose;
  if (!j) {
    // before the first push-off (only in the loop's lead-in): crouched at A
    Y.x = JUMPS[0].from.x; Y.z = JUMPS[0].from.z; Y.yaw = YAW_J0;
    Object.assign(pose, { hipY: 0.6, lean: 0.4, footZ: 0.15, armsFwd: -0.5, head: [-0.3, 0] });
    return Y;
  }
  Y.jump = k;
  if (v < j.l) {
    if (!isFinite(j.l)) {
      // gone for good (escape and after): off up the sky
      Y.y = escapeH(j, v); Y.air = Y.y;
      Y.visible = Y.y < 2.5e4;
      Object.assign(pose, { hipY: 0.92, lean: 0.0, footZ: 0.0, armsUp: 1.45, head: [-0.5, 0] });
      Y.u = 0.2;
      return Y;
    }
    const u = (v - j.p) / (j.l - j.p);
    Y.u = u;
    Y.x = lerp(j.from.x, j.to.x, u); Y.z = lerp(j.from.z, j.to.z, u);
    Y.yaw = k === 0 ? YAW_J0 : YAW_P;
    // pose in the air: straight and reaching up on the way up, a tuck at the top (over the bus), legs ready on the way down
    const up = 1 - smooth(0.35, 0.6, u), down = smooth(0.55, 0.95, u);
    const tuck = k === 0 ? Math.sin(Math.PI * clamp((u - 0.18) / 0.64)) : 0.25 * smooth(0.4, 0.5, u) * (1 - smooth(0.5, 0.65, u));
    pose.hipY = 0.92 - 0.38 * tuck - 0.12 * down;
    pose.footZ = 0.02 + 0.25 * tuck + 0.08 * down;
    pose.lean = 0.05 + 0.15 * tuck;
    pose.armsUp = 1.45 * up * (1 - tuck) + 0.55 * down;
    pose.armsOut = 0.5 * down + 0.4 * tuck;
    pose.armsFwd = 0.35 * tuck;
    pose.head = [up > 0.5 ? -0.55 : 0.25 * down, 0];
    const yy = traj(j, u);
    // the pelvis follows the flight; tucking raises the feet
    Y.y = yy + (0.92 - pose.hipY);
    Y.air = Y.y;
    return Y;
  }
  // on the ground at P between landing l and the next push-off
  const next = JUMPS[k + 1];
  Y.yaw = YAW_P;
  const dl = v - j.l, dn = next ? next.p - v : 9;
  // the landing: a deep crouch, coming back up; then the wind-up before the next push-off
  const land = Math.exp(-Math.max(0, dl) / 0.35);
  const wind = 1 - smooth(0.0, 0.55, dn);
  const crouch = Math.max(0.55 * land + 0.15, wind);
  pose.hipY = 0.92 - 0.4 * crouch;
  pose.lean = 0.06 + 0.42 * crouch;
  pose.footZ = 0.05 + 0.14 * crouch;
  pose.armsFwd = -0.55 * wind + 0.25 * land;
  pose.armsOut = 0.25 * land;
  pose.head = [-0.15 - 0.3 * wind, 0];
  return Y;
}
// for the ladder jumps (1e8x and on): you are back in the crater, crouched, for ~1.3 s before each push-off
export function ladderYou(v) {
  for (let i = 7; i < JUMPS.length; i++) {
    const j = JUMPS[i], dn = j.p - v;
    if (dn > 0 && dn < 1.3) {
      const wind = 1 - smooth(0.0, 0.6, dn);
      return { x: P.x, z: P.z, y: 0, yaw: YAW_P, visible: true, air: 0, jump: i - 1, u: 0,
        pose: { hipY: 0.92 - 0.4 * (0.3 + 0.7 * wind), lean: 0.2 + 0.3 * wind, footZ: 0.1, head: [-0.3, 0], armsUp: 0, armsFwd: -0.55 * wind, armsOut: 0.1, curl: 0.5 } };
    }
  }
  return null;
}
export { heightOf };
