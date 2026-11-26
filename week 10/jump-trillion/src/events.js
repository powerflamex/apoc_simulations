// What every push-off and landing does to the street (one table for the effects, the people, the cars, the camera's
// jolt and the soundtrack). Energy = 314 J x N (timeline.js), the same for the landing as for the push-off (no air
// drag: you come back down as fast as you left). Sizes grow with the cube root of the energy (blast scaling), checked
// against what TNT does: ~75 g (1,000x) leaves a pit and rocks a car next to it; ~0.75 kg (10,000x) throws a car; ~7.5 kg
// (100,000x) plus the sonic boom breaks windows for a couple of hundred metres; 75 kg (1,000,000x) overturns a bus;
// 1 ton (escape) and up wreck the buildings round you; 7.5 kt and 75 kt flatten the blocks for hundreds of metres.
//   kind: 'push' / 'land'; t: video time; N; crater [radius, depth] (m, it only grows); cars: radius cars are thrown within;
//   glass: radius windows break to; wreck: radius buildings are wrecked to; fire: fireball radius (0 = none); dust: dust
//   cloud radius; kick: camera jolt.
import { JUMPS } from './timeline.js';
import { A, P } from './layout.js';

export const EVENTS = [];
const add = (o) => EVENTS.push({ x: P.x, z: P.z, cars: 0, glass: 0, wreck: 0, fire: 0, dust: 1, kick: 0.2, crater: [0, 0], ...o });
add({ kind: 'push', t: JUMPS[0].p, N: 10, x: A.x, z: A.z, crater: [0, 0], dust: 0.6, kick: 0.05 });
add({ kind: 'land', t: JUMPS[0].l, N: 10, crater: [0.5, 0.02], dust: 0.8, kick: 0.25 });
add({ kind: 'push', t: JUMPS[1].p, N: 100, crater: [0.7, 0.04], dust: 1.3, kick: 0.2 });
add({ kind: 'land', t: JUMPS[1].l, N: 100, crater: [0.9, 0.08], dust: 1.8, kick: 0.4 });
add({ kind: 'push', t: JUMPS[2].p, N: 1e3, crater: [1.2, 0.2], dust: 2.5, kick: 0.35 });
add({ kind: 'land', t: JUMPS[2].l, N: 1e3, crater: [1.6, 0.4], cars: 8.5, dust: 3.5, kick: 0.55 });
add({ kind: 'push', t: JUMPS[3].p, N: 1e4, crater: [2.0, 0.55], cars: 8, glass: 30, dust: 5, kick: 0.5, rattle: 1 });
add({ kind: 'land', t: JUMPS[3].l, N: 1e4, crater: [2.6, 0.8], cars: 11, dust: 7, kick: 0.65 });
add({ kind: 'push', t: JUMPS[4].p, N: 1e5, crater: [3.2, 1.0], cars: 14, glass: 240, dust: 10, kick: 0.8, boom: 1 });
add({ kind: 'land', t: JUMPS[4].l, N: 1e5, crater: [4.0, 1.4], cars: 18, glass: 280, dust: 13, kick: 0.8 });
add({ kind: 'push', t: JUMPS[5].p, N: 1e6, crater: [5.0, 1.8], cars: 26, glass: 450, dust: 18, kick: 0.9, boom: 1 });
add({ kind: 'land', t: JUMPS[5].l, N: 1e6, crater: [6.5, 2.4], cars: 34, glass: 520, dust: 16, fire: 3.5, kick: 1.0 });
add({ kind: 'push', t: JUMPS[6].p, N: 1e12, crater: [140, 20], cars: 1150, glass: 20000, wreck: 1000, wv: 600, dust: 900, fire: 500, kick: 1.0, streak: 1 });
EVENTS.sort((a, b) => a.t - b.t);
// how fast the blast front runs out (m/s) and how far it has got dt after an event of reach R
export const SHOCK = 480;
export const front = (dt, R, sp = SHOCK + 3 * R) => (dt <= 0 ? 0 : Math.min(R, sp * dt));
// windows break as the front reaches them (a wave you can watch run down the avenue)
export const GLASS_V = 420;
// the crater at P at video time v: radius and depth snap open on each event's frame (~0.08 s)
export function craterAt(v) {
  let r = 0, d = 0;
  for (const e of EVENTS) {
    if (e.x !== P.x || e.z !== P.z || !e.crater[0]) continue;
    const k = Math.min(1, Math.max(0, (v - e.t) / 0.08));
    if (k <= 0) continue;
    r = Math.max(r, r + (e.crater[0] - r) * k); d = Math.max(d, d + (e.crater[1] - d) * k);
  }
  return { r, d };
}
// the 1-trillion push-off's wall of dust and wreckage: out from you at ~800 m/s, slowing; it reaches the far camera
// (1.3 km down the avenue) 4.4 s later. Everything inside it is knocked down (the wreck radius follows it, to 1 km).
export const WALL_T = 4.4, WALL_R = 1350;
export function wallR(v) {
  const e = EVENTS.find((x) => x.N >= 1e12), t = v - e.t;
  if (t <= 0) return 0;
  return WALL_R * (1 - Math.exp(-t / 1.9)) / (1 - Math.exp(-WALL_T / 1.9));
}
export function damageAt(v) {
  let glass = 0, wreck = 0;
  for (const e of EVENTS) {
    glass = Math.max(glass, front(v - e.t, e.glass, GLASS_V + 0.4 * e.glass));
    wreck = Math.max(wreck, e.N >= 1e12 ? Math.min(e.wreck, 0.92 * wallR(v)) : front(v - e.t, e.wreck, 300 + 2 * e.wreck));
  }
  return { glass, wreck };
}
// the ground height at (x, z) from the crater at P at video time v (the same formula as world.js's shader)
export function craterHAt(x, z, v) {
  const { r: R, d } = craterAt(v);
  if (d <= 0 || R <= 0) return 0;
  const r = Math.hypot(x - P.x, z - P.z);
  if (r < R) { const u = r / R; return -d * (1 - u * u) * (1 - u * u); }
  return d * 0.12 * Math.exp(-Math.pow((r - R) / (0.3 * R), 2));
}
