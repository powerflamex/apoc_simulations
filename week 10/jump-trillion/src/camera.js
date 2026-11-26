// The shots, in the order the viewer sees them. City shots are keyed here: [t, camera x, y, z, look x, y, z, fov, w]
// (w = how much the look turns toward you: 0 = the fixed point, 1 = your chest); rel: true = the camera and its look
// point ride with you (offsets from your pelvis). Space shots (space: true) are drawn by space.js with its own camera.
//   0:00 street, frame 0 (you over the bus) -> the crouch -> 100x up the 12-storey building and back down (0:07)
//   1,000x: the push-off from the street -> high over the tower -> the landing on the street
//   10,000x: up through the clouds (the hole) -> above the clouds -> the landing; 100,000x: windows blow out
//   then street / space in turn: apex at 46 km, the Space Station, the fireball, escape, the Moon, the solar system,
//   the galaxy; each push-off seen from further down the avenue; the last fills the frame white.
import * as THREE from 'three';
import { P } from './layout.js';
import { youAt, ladderYou } from './choreo.js';
import { fallPos, FALL } from './fx.js';

export const SHOTS = [
  // frame 0: low on the west side of the bus, people right in front pointing up, you over the bus (in the middle of the
  // frame, between the counter and the caption line); then round to the south of the bus to see where you landed
  { a: -2.0, b: 3.75, keys: [
    [-2.0, -5.9, 0.95, 6.3, 0.4, 3.6, 0.6, 64, 1],
    [0.0, -5.8, 0.95, 6.2, 0.8, 4.6, 0.4, 64, 1],
    [0.95, -5.6, 0.95, 6.8, 3.4, 2.6, 0.0, 64, 0.6],
    [2.3, 1.2, 1.1, 13.5, 4.2, 1.8, 0.0, 66, 0.5],
    [3.75, 0.9, 0.8, 15.5, 4.2, 2.5, 0.0, 70, 0.5],
  ] },
  // 100x: the push-off from the street, then riding up beside you past the 12-storey building's windows to above its
  // roof, then the landing seen low from the street
  { a: 3.75, b: 4.12, keys: [
    [3.75, 0.9, 0.8, 15.5, 4.2, 2.5, 0.0, 70, 0.5],
    [4.12, 0.9, 0.8, 15.4, 4.2, 12, -1.0, 72, 0.3],
  ] },
  { a: 4.12, b: 6.8, rel: true, keys: [
    [4.12, -3.6, -2.2, 6.2, 1.0, 0.4, -1.0, 70, 0],
    [5.5, -4.2, -0.6, 6.8, 0.9, -0.6, -1.0, 70, 0],
    [6.8, -4.0, 1.2, 6.6, 0.9, -1.0, -1.0, 70, 0],
  ] },
  { a: 6.8, b: 7.45, keys: [
    [6.8, 0.8, 1.0, 16.5, 4.2, 9, 0, 68, 0.6],
    [7.2, 0.8, 1.0, 16.3, 4.2, 1.6, 0, 68, 0.6],
    [7.45, 0.8, 1.0, 16.2, 4.2, 2.0, 0, 68, 0.4],
  ] },
  // 1,000x: the push-off, then high beside you over the tallest tower (its top and mast below you), then the landing
  { a: 7.45, b: 8.1, keys: [
    [7.45, 0.8, 1.0, 16.2, 4.2, 2.0, 0, 68, 0.3],
    [7.62, 0.85, 1.0, 16.1, 4.2, 2.4, 0, 68, 0],
    [8.1, 0.9, 1.0, 16.0, 4.2, 12, -2, 70, 0],
  ] },
  { a: 8.1, b: 10.45, rel: true, keys: [
    [8.1, 9.0, 0.6, 7.0, 1.6, -3.0, 2.0, 78, 0],
    [9.3, 9.0, 1.0, 7.0, 1.6, -3.9, 2.0, 78, 0],
    [10.45, 9.0, 1.6, 7.0, 1.6, -3.4, 2.0, 78, 0],
  ] },
  // the landing (cars flip) seen a little from above, the 10,000x push-off (windows rattle), a short tilt after you
  { a: 10.45, b: 11.75, keys: [
    [10.45, 2.2, 2.3, 12.5, 4.2, 5, 0, 66, 0],
    [11.0, 2.2, 2.3, 12.3, 4.2, 0.6, 0, 66, 0],
    [11.42, 2.2, 2.3, 12.2, 4.2, 1.0, 0, 66, 0],
    [11.75, 2.2, 2.3, 12.2, 4.2, 30, -6, 68, 0],
  ] },
  // above the clouds: looking down past you at the cloud deck and the hole you punched, then round to the side at the top
  { a: 11.75, b: 13.75, rel: true, keys: [
    [11.75, -2.5, 5.5, 3.0, 0.6, -5.0, -0.8, 64, 0],
    [12.6, -3.5, 4.0, 4.5, 0.6, -3.0, -1.0, 64, 0],
    [13.75, -5.5, 1.6, 6.0, 0.4, -0.6, -0.6, 62, 0],
  ] },
  // the 10,000x landing up close (the bus shoved, cars thrown), then the long view up the avenue for the sonic boom
  { a: 13.75, b: 15.05, keys: [
    [13.75, 2.4, 2.4, 13.0, 4.2, 6, 0, 68, 0],
    [14.8, 2.4, 2.4, 12.8, 4.2, 0.8, 0, 68, 0],
    [15.05, 2.4, 2.4, 12.7, 4.2, 1.5, 0, 68, 0],
  ] },
  { a: 15.05, b: 16.45, keys: [
    [15.05, -3.0, 1.6, 72, 3.0, 10, -20, 62, 0],
    [16.45, -2.6, 1.7, 67, 3.0, 13, -30, 62, 0],
  ] },
  { a: 16.45, b: 17.7, space: 'apex' },
  { a: 17.7, b: 19.3, keys: [
    [17.7, -0.5, 1.3, 36, 4.2, 6, 0, 66, 0],
    [18.6, -0.4, 1.3, 35, 4.2, 3, 0, 66, 0],
    [19.05, -0.3, 1.3, 34.5, 4.2, 6, 0, 66, 0],
    [19.3, -0.3, 1.3, 34.3, 4.2, 30, -8, 68, 0],
  ] },
  { a: 19.3, b: 21.35, space: 'iss' },
  { a: 21.35, b: 23.7, track: 'fall', keys: [
    [21.35, 3.0, 3.2, 80, 4.2, 130, -300, 66, 1],
    [22.2, 3.0, 3.2, 79, 4.2, 70, -120, 66, 1],
    [22.4, 3.0, 3.2, 78, 4.2, 12, -10, 66, 0.3],
    [23.3, 3.0, 3.2, 77, 4.2, 12, -10, 66, 0],
    [23.7, 3.0, 3.2, 76, 4.2, 70, -40, 68, 0],
  ] },
  { a: 23.7, b: 26.35, space: 'escape' },
  // from here each push-off is seen from further down the avenue, from a little above the people (as if standing on
  // a car), so the blast sits in the middle of the frame and its plume rises behind the counter
  { a: 26.35, b: 28.4, keys: [
    [26.35, -2.5, 4.2, 100, 4.2, 6, 0, 62, 0],
    [28.4, -2.4, 4.3, 99, 4.2, 22, 0, 62, 0],
  ] },
  { a: 28.4, b: 30.3, space: 'moon' },
  { a: 30.3, b: 32.0, keys: [
    [30.3, 2.5, 30, 230, 4.2, 26, 0, 60, 0],
    [32.0, 2.5, 30.2, 229, 4.2, 50, 0, 60, 0],
  ] },
  { a: 32.0, b: 34.1, space: 'solar' },
  { a: 34.1, b: 39.45, keys: [
    [34.1, -2.0, 30, 520, 4.2, 55, 0, 60, 0],
    [37.9, -2.0, 30, 520, 4.2, 95, 0, 60, 0],
    [39.45, -2.0, 30, 520, 4.2, 190, 0, 62, 0],
  ] },
  { a: 39.45, b: 41.65, space: 'galaxy' },
  { a: 41.65, b: 47.0, keys: [
    [41.65, 3.0, 70, 1900, 4.2, 230, 0, 58, 0],
    [45.5, 3.0, 70, 1900, 4.2, 420, 0, 58, 0],
  ] },
];

// monotone cubic through a column of a shot's keys
function col(keys, j) {
  const x = keys.map((k) => k[0]), y = keys.map((k) => k[j]), n = x.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (t) => {
    if (n === 1 || t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h;
    return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
  };
}
for (const s of SHOTS) if (s.keys) s.f = [1, 2, 3, 4, 5, 6, 7, 8].map((j) => col(s.keys, j));
export function shotAt(v) {
  for (const s of SHOTS) if (v >= s.a && v < s.b) return s;
  return v < SHOTS[0].a ? SHOTS[0] : SHOTS[SHOTS.length - 1];
}
// the city camera at v: { pos, look, fov, shot }
export function camAt(v) {
  const s = shotAt(v);
  if (s.space) return { space: s.space, shot: s };
  const [px, py, pz, lx, ly, lz, fov, w] = s.f.map((f) => f(v));
  const Y = ladderYou(v) || youAt(v);
  const me = new THREE.Vector3(Y.x, Y.y + 1.0, Y.z);
  let pos = new THREE.Vector3(px, py, pz), look = new THREE.Vector3(lx, ly, lz);
  if (s.rel) { pos.add(me).sub(new THREE.Vector3(0, 1, 0)); look.add(me).sub(new THREE.Vector3(0, 1, 0)); }
  else if (s.track === 'fall') {
    // follow the fireball down the sky (a third of the way between it and the street, so it stays high in the frame)
    const fp = fallPos(Math.min(v, FALL.t1));
    const k = Math.min(1, Math.max(0, w));
    look.lerp(new THREE.Vector3(P.x, fp.y * 0.55, P.z + (fp.z - P.z) * 0.55), k);
  } else look.lerp(me, Math.min(1, Math.max(0, w)));
  return { pos, look, fov, shot: s };
}
