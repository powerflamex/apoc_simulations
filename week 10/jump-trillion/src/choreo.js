// Where you are and how you move at video time v (rework, Nov 26). Each landing jump: a crouch, the push-off (legs
// driving straight, arms flung up), the flight (arms and legs working: a hitch-kick, like a long jumper), legs
// reaching down before the landing, a deep crouch on the hit. After the 1,000,000x landing you stay crouched in the
// crater until the 1-trillion push-off; then you are gone from the street.
import { JUMPS, flightY, V_TRILLION } from './timeline.js';
import { P } from './layout.js';
import { smooth, clamp, lerp } from './util.js';
import { craterAt } from './events.js';

export const YAW_J0 = Math.PI / 2 + 0.35;        // the first jump: coming toward the camera (east), a little turned
export const YAW_P = 1.15;                       // in the crater: facing the cameras on its east-south-east side

export function youAt(v) {
  const Y = { x: P.x, z: P.z, y: 0, yaw: YAW_P, visible: true, jump: -1, u: 0, mode: 'ground', ground: 0 };
  const pose = { hipY: 0.92, lean: 0.04, footZ: 0.05, head: [-0.1, 0], armsUp: 0, armsFwd: 0, armsOut: 0, curl: 0.4 };
  Y.pose = pose;
  let k = -1;
  JUMPS.forEach((j, i) => { if (v >= j.p) k = i; });
  const j = k >= 0 ? JUMPS[k] : null;
  if (!j) {
    // (the loop's lead-in) crouched at A, about to jump
    Y.x = JUMPS[0].from.x; Y.z = JUMPS[0].from.z; Y.yaw = YAW_J0;
    Object.assign(pose, { hipY: 0.58, lean: 0.4, footZ: 0.15, armsFwd: -0.6, head: [-0.3, 0] });
    return Y;
  }
  Y.jump = k;
  if (k === JUMPS.length - 1) { Y.visible = false; Y.y = 1e7; Y.mode = 'gone'; return Y; }   // the last one: gone
  if (v < j.l) {
    const u = (v - j.p) / (j.l - j.p);
    Y.u = u; Y.mode = 'air';
    Y.x = lerp(j.from.x, j.to.x, u); Y.z = lerp(j.from.z, j.to.z, u);
    Y.yaw = k === 0 ? YAW_J0 : YAW_P;
    Y.y = flightY(j, u);
    // the take-off from the crater floor (it is below the street once it is dug)
    Y.ground = k === 0 ? 0 : craterAt(j.p).d;
    // phases: 0..1 drive (legs straight, arms up), then the hitch-kick, then legs reaching down for the landing
    Y.drive = 1 - smooth(0.0, k <= 1 ? 0.16 : 0.08, u);
    Y.reach = smooth(k <= 1 ? 0.78 : 0.9, 1.0, u);
    Object.assign(pose, { hipY: 0.92, lean: 0.0, footZ: 0.0, armsUp: 1.45, head: [-0.45, 0] });
    if (Y.reach > 0) Object.assign(pose, { hipY: 0.92 - 0.25 * Y.reach, lean: 0.12 * Y.reach, footZ: 0.1 * Y.reach, armsUp: 0.3, armsOut: 0.7 * Y.reach, armsFwd: 0.35 * Y.reach, head: [0.3, 0] });
    return Y;
  }
  // on the ground at P between landing l and the next push-off (the last landing: crouched until 1 trillion)
  const next = JUMPS[k + 1];
  Y.yaw = YAW_P;
  Y.ground = craterAt(v).d;
  const dl = v - j.l, dn = next.p - v;
  const land = Math.exp(-Math.max(0, dl) / 0.3);
  const wind = 1 - smooth(0.0, next.n >= 1e12 ? 1.2 : 0.4, dn);
  const hold = k === 5 ? smooth(0.2, 0.8, dl) : k === 0 ? 0.7 * smooth(0.0, 0.3, dl) : 0;   // the long crouch before the last jump (and a crouch after the first landing)
  const crouch = Math.max(0.6 * land + 0.15, wind, 0.85 * hold);
  const tremble = hold * (0.012 + 0.03 * smooth(V_TRILLION - 4, V_TRILLION, v)) * Math.sin(v * 71);
  pose.hipY = 0.92 - 0.42 * crouch + tremble;
  pose.lean = 0.06 + 0.45 * crouch;
  pose.footZ = 0.05 + 0.15 * crouch;
  pose.armsFwd = -0.6 * Math.max(wind, hold * 0.8) + 0.3 * land;
  pose.armsOut = 0.25 * land + 0.2 * hold;
  pose.head = [-0.2 - 0.3 * Math.max(wind, hold), 0];
  pose.curl = 0.4 + 0.5 * hold;
  return Y;
}
export const ladderYou = () => null;
