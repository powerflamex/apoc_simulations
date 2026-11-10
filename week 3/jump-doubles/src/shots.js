// The shot list (video time). Mostly cameras on the ground that hold still (a slow drift, a little handheld) and
// watch the crossing: you shoot up out of the top of the frame and come back down into it. A few short flying shots
// for the moments that need them (through the clouds, reaching space, the whole planet, the Moon getting close, the
// last jump). Cuts land on landings and takeoffs. Shared by main.js (the camera) and audio.mjs (what you hear).
//   kind 'ground': pos -> pos2 over the shot, looking at aim -> aim2 (or tracking you gently: track = max height)
//   kind 'orbit':  circling the crossing (r, h, from angle a0 at w rad/s), looking at aim
//   kind 'chase':  the flying camera that hugs you (main.js rig); 'moon': under you, looking up at the Moon
import { jumpOf, V_MOON, VIDEO_DURATION, altitude } from './timeline.js';

const land = (n) => jumpOf(n + 1).t0;                 // jump n comes down
const launch = (n) => jumpOf(n).t0 + jumpOf(n).dw;    // jump n leaves the ground
export const SHOTS = [
  { a: -3, b: land(8), kind: 'ground', pos: [3.5, 11, 14], pos2: [2.5, 13, 12], track: 30, fov: 56 },
  { a: land(8), b: land(10), kind: 'ground', pos: [16, 12, -11.5], pos2: [15, 13, -10.5], aim: [0, 2, 0], aim2: [0, 4, 0], fov: 64 },
  { a: land(10), b: launch(13), kind: 'ground', pos: [58, 18, -3], pos2: [52, 20, -2.5], aim: [0, 6, 0], aim2: [0, 9, 0], fov: 60 },
  { a: launch(13), b: launch(13) + 1.25, kind: 'chase' },
  { a: launch(13) + 1.25, b: launch(15) + 1.05, kind: 'ground', pos: [-5.2, 2.0, 72], pos2: [-5.0, 2.2, 69], aim: [0, 30, 0], aim2: [0, 34, 0], fov: 64 },
  { a: launch(15) + 1.05, b: land(16), kind: 'ground', pos: [-6, 38, -125], pos2: [4, 41, -118], aim: [0, 6, 0], aim2: [0, 8, 0], fov: 60 },
  { a: land(16), b: launch(19), kind: 'ground', pos: [-72, 5, -2.5], pos2: [-68, 6, -2.5], aim: [0, 9, 0], aim2: [0, 11, 0], fov: 62 },
  { a: launch(19), b: launch(19) + 1.75, kind: 'chase' },
  { a: launch(19) + 1.75, b: launch(21), kind: 'ground', pos: [62, 2.6, 4.2], pos2: [59, 2.8, 4.0], aim: [0, 20, 0], aim2: [0, 22, 0], fov: 64 },
  { a: launch(21), b: land(22) - 0.4, kind: 'ground', pos: [8, 14, 150], pos2: [6, 16, 140], aim: [0, 18, 0], aim2: [0, 20, 0], fov: 60 },
  { a: land(22) - 0.4, b: land(23) + 0.6, kind: 'ground', pos: [5, 30, 135], pos2: [3, 32, 128], aim: [0, 30, -40], aim2: [0, 28, -40], fov: 62 },
  { a: land(23) + 0.6, b: launch(25), kind: 'ground', pos: [16, 10, 26], pos2: [13, 9, 22], aim: [0, 0, 0], aim2: [0, 2, 0], fov: 60 },
  { a: launch(25), b: launch(25) + 1.9, kind: 'chase' },
  { a: launch(25) + 1.9, b: land(27), kind: 'ground', pos: [0, 120, 215], pos2: [0, 112, 195], aim: [0, 0, 0], aim2: [0, 4, 0], fov: 58 },
  { a: land(27), b: launch(29) + 0.75, kind: 'ground', pos: [-4, 3, -95], pos2: [-3, 4, -88], aim: [0, 16, 0], aim2: [0, 18, 0], fov: 62 },
  { a: launch(29) + 0.75, b: launch(29) + 2.15, kind: 'moon' },
  { a: launch(29) + 2.15, b: launch(30) + 0.8, kind: 'ground', pos: [-9, 18, 55], pos2: [-8, 17, 50], aim: [0, 1, 0], aim2: [0, 3, 0], fov: 60 },
  { a: launch(30) + 0.8, b: launch(30) + 2.2, kind: 'moon' },
  { a: launch(30) + 2.2, b: launch(31), kind: 'ground', pos: [0, 42, 125], pos2: [0, 40, 118], aim: [0, 10, 0], aim2: [0, 12, 0], fov: 62 },
  { a: launch(31), b: VIDEO_DURATION + 1, kind: 'chase' },
];
export const shotAt = (v) => { for (const s of SHOTS) if (v >= s.a && v < s.b) return s; return SHOTS[0]; };

// the opening shot tilts up after you, slowly: your height (capped), smoothed over a quarter of a second
const TRACK_TAB = (() => {
  const t0 = -3, n = Math.round((SHOTS[0].b + 1 - t0) * 240), out = new Float64Array(n + 1);
  let y = 2;
  for (let i = 0; i <= n; i++) { const v = t0 + i / 240; y += (Math.min(altitude(v), SHOTS[0].track) + 3 - y) * (1 - Math.exp(-1 / 240 / 0.28)); out[i] = y; }
  return { t0, out };
})();
export function trackY(v) {
  const f = Math.max(0, Math.min(TRACK_TAB.out.length - 2, (v - TRACK_TAB.t0) * 240)), i = Math.floor(f);
  return TRACK_TAB.out[i] + (TRACK_TAB.out[i + 1] - TRACK_TAB.out[i]) * (f - i);
}

// where a ground camera is at time v (for the sound: how far away the crossing is)
export function groundPos(s, v) {
  const k = Math.min(1, Math.max(0, (v - s.a) / (s.b - s.a)));
  if (s.kind === 'orbit') { const an = s.a0 + s.w * (v - s.a); return [Math.sin(an) * s.r, s.h, Math.cos(an) * s.r]; }
  return s.pos.map((x, i) => x + (s.pos2[i] - x) * k);
}
export { V_MOON };
