// The camera's keys: [video time, x, y, z, look-at x, y, z, fov]. One move from frame 0 to the white: low in front of
// you with the car overhead, then easing back and rising as each thing gets bigger, following you round the plaza, to
// the quay and the tower (from above the crowd, so you stay in sight), chasing you over the harbor, and behind you at
// the mountain's foot. Keys are placed relative to where you are (choreo.youAt) where the shot follows you.
import { youAt } from './choreo.js';
import { B } from './timeline.js';
import { SPOT } from './layout.js';

export const CAMK = [];
const abs = (t, x, y, z, tx, ty, tz, fov) => CAMK.push([t, x, y, z, tx, ty, tz, fov]);
// relative to you: the camera at (dx, dy, dz) from your feet, looking at (tx, ty, tz) from them
const rel = (t, dx, dy, dz, tx, ty, tz, fov) => { const y = youAt(t); CAMK.push([t, y.x + dx, dy + y.air, y.z + dz, y.x + tx, ty + y.air, y.z + tz, fov]); };

// the car, the bus
abs(-2.0, 1.75, 1.05, 8.3, -0.1, 3.25, 0.0, 50);
abs(0.6, 1.75, 1.05, 8.3, -0.1, 3.25, 0.0, 50);
abs(2.4, 3.0, 1.4, 10.0, -4.0, 2.5, -4.0, 52);
abs(4.2, 4.0, 1.8, 12.0, -5.0, 3.4, -5.5, 54);
abs(6.0, 4.4, 2.4, 13.0, -8.0, 3.4, -24.0, 54);
// the truck
abs(7.6, -0.5, 3.0, -4.8, 10.0, 2.8, -19.0, 55);
abs(9.8, -1.5, 3.4, -4.6, 10.0, 3.7, -19.5, 56);
abs(11.5, -2.0, 4.6, -5.5, 6.0, 9.0, -60.0, 56);
// the jet: from the apron south-west of you, you under its nose holding the nose wheel; then up after it
abs(13.0, 19.6, 6.5, -29.0, 25.0, 3.6, -55.0, 58);
abs(15.0, 19.8, 6.8, -29.5, 26.0, 4.2, -56.0, 60);
abs(15.9, 19.8, 7.0, -29.5, 28.0, 7.0, -60.0, 60);
abs(16.7, 20.5, 8.0, -31.0, 38.0, 24.0, -82.0, 62);
abs(17.4, 21.0, 9.0, -32.0, 41.0, 28.0, -88.0, 62);
// the ship: close behind you at the quay, the hull rising over you; then up after it as it flies
abs(18.75, 44.0, 7.0, -66.0, 27.0, 12.0, -104.0, 62);
abs(21.5, 45.0, 6.5, -67.0, 26.0, 16.0, -106.0, 64);
abs(22.85, 45.0, 7.0, -67.0, 25.0, 18.0, -108.0, 64);
abs(23.8, 47.0, 12.0, -64.0, -40.0, 34.0, -260.0, 62);
abs(25.0, 55.0, 16.0, -58.0, -110.0, 22.0, -380.0, 60);
// the tower: you at its foot, the tower rising out of the frame; tilting up after it when it goes
abs(26.75, 89.0, 6.0, -53.0, 110.0, 14.0, -74.0, 72);
abs(29.5, 88.5, 6.0, -52.5, 111.0, 17.0, -74.0, 74);
abs(30.7, 88.0, 7.0, -52.0, 116.0, 34.0, -80.0, 74);
abs(31.7, 80.0, 14.0, -46.0, 190.0, 70.0, -300.0, 64);
abs(32.6, 82.0, 16.0, -46.0, 250.0, 30.0, -400.0, 60);
// the leap: chasing you, behind and above, looking where you're going
{
  const a = SPOT.tower, b = SPOT.mtn, D = Math.hypot(b.x - a.x, b.z - a.z);
  const fx = (b.x - a.x) / D, fz = (b.z - a.z) / D;
  abs(33.2, a.x - fx * 17, 8.0, a.z - fz * 17, a.x + fx * 30, 5.0, a.z + fz * 30, 60);
  for (const t of [33.7, 34.3, 34.9, 35.5]) rel(t, -fx * 20, 6.5, -fz * 20, fx * 40, 3.0, fz * 40, 60);
  rel(B.leapLand, -fx * 22 + 4, 8.0, -fz * 22, fx * 40, 8.0, fz * 40, 60);
}
// the mountain: behind you on the beach, a wide lens so you and its face both fit; at the throw it tilts up after it
abs(37.6, SPOT.mtn.x + 7, 7.5, SPOT.mtn.z + 30, SPOT.mtn.x, 26.0, SPOT.mtn.z - 60, 76);
abs(41.4, SPOT.mtn.x + 8, 8.0, SPOT.mtn.z + 33, SPOT.mtn.x, 30.0, SPOT.mtn.z - 65, 78);
abs(41.9, SPOT.mtn.x + 8, 8.0, SPOT.mtn.z + 34, SPOT.mtn.x, 40.0, SPOT.mtn.z - 70, 78);
abs(42.9, SPOT.mtn.x + 8, 10.0, SPOT.mtn.z + 36, SPOT.mtn.x, 260.0, SPOT.mtn.z - 1800, 72);
abs(44.0, SPOT.mtn.x + 8, 10.0, SPOT.mtn.z + 36, SPOT.mtn.x, 230.0, SPOT.mtn.z - 2400, 72);
abs(47.5, SPOT.mtn.x + 8, 10.0, SPOT.mtn.z + 36, SPOT.mtn.x, 200.0, SPOT.mtn.z - 2400, 72);
