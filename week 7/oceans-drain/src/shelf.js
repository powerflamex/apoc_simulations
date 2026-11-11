// Shot 2, the edge of the shelf (0:07.5-0:13.1, about -300 to -600 ft): humpback whales the size of buses lie stranded
// among the people, and just past them the seabed stops: a cliff, a gap with the sea far below and still falling, and
// the cliff's other side facing you with water pouring down it. (The real edge of the continental shelf is on average
// about 440 ft down; the slope below it is drawn as a cliff so it reads.)
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { makeWhales } from './creatures.js';
import { cast } from './people.js';
import { walker } from './wreck.js';
import { fbm, vnoise } from './noise.js';
import { V_WHALES, V_CARGO } from './timeline.js';
import { smooth, lerp, clamp, DEG } from './util.js';

const HC = 135;                                    // the drop
const E0 = -24;
// the edge is 28 m from where the shot starts, and a gorge runs on out from it to the open sea: you come to its head,
// with the shelf going on as a cliff on both sides of you
export const zEdge = (x) => E0 + 3 * (vnoise(x * 0.06, 1.7) - 0.5) - 80 * smooth(5, 18, Math.abs(x)) - 0.25 * Math.max(0, Math.abs(x) - 18);
function hShelf(x, z) {
  const top = 0.012 * Math.min(z, 0) + 0.3 * (fbm(x * 0.07, z * 0.07) - 0.5);
  const d = zEdge(x) - z;                          // metres out past the edge
  if (d <= 0) return top;
  const k = smooth(0, 9, d);
  return top * (1 - k) - HC * k - 0.2 * Math.max(0, d - 9) + 6 * (fbm(x * 0.05, z * 0.05) - 0.5) * smooth(0.5, 6, d) + 4 * (fbm(x * 0.2 + 9, z * 0.03) - 0.5) * smooth(0.5, 4, d) * (1 - smooth(10, 20, d));
}

// (yaw: the head points along (cos, 0, -sin)). The first lies across your way, its head nearer, whole in frame as the
// shot opens; its calf beside your path; another along the edge on the right
const WHALES = [
  { x: -3, z: -15, yaw: -0.607, s: 1.0, ph: 0.1, roll: 0.06 },
  { x: 1.4, z: -3.2, yaw: -0.9, s: 0.5, ph: 0.8, roll: 0.1, lift: 1.3 },
  { x: 11.5, z: -15.5, yaw: -1.85, s: 0.8, ph: 0.55, roll: -0.08 },
];

export function makeShelf(ctx) {
  const group = new THREE.Group();
  const h = hShelf;
  // the grid's rows follow the edge (dense across the cliff face)
  const rows = [];
  for (let e = -44; e < 0; e += 1) rows.push(E0 - e);
  for (const e of [0, 0.6, 1.3, 2.2, 3.3, 4.6, 6, 7.5, 9, 10.5, 13, 17, 23, 31, 41, 55, 75, 100, 135, 180, 250, 350, 500, 750, 1100, 1800, 3000, 6000]) rows.push(E0 - e);
  const warp = (x, z) => [x, z + zEdge(x) - E0];
  const grid = makeGrid(h, { rows, zNear: rows[0], zFar: rows[rows.length - 1], w0: 80, w1: 7500, nx: 170, warp });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xe3c98e, colB: 0xcfae72, rock: 0xcbb994, strata: 1, layer: 0.13, patch: 0xe2714a, patchAmt: 0.3, patchS: 0.2, patchT: 0.64, scale: 0.06, ripple: 0.35, pebble: 0.2, falls: 1 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));

  const whales = makeWhales(group, WHALES, h);

  const T = V_WHALES;
  const zE = (x) => zEdge(x);
  const END = { x: 5.6, z: zEdge(5.6) + 1.15 };            // where you stop: right at the edge
  const people = cast([
    // (the walker runs ahead of you to the edge a few metres to your right, and stops there, looking down)
    (() => { const tx = 7.8, tz = zE(7.8) + 1.3, sx = 6.3, sz = -9.5, sp = 5.4, d = Math.hypot(tx - sx, tz - sz); return { ...walker(sx, sz, sp, T, { hero: true, yaw: Math.atan2(tx - sx, tz - sz) }), dur: 5 + d / sp, then: 'lookDown' }; })(),
    // by the big whale: one with a hand on it, some at its head, a child; by the calf
    { x: 0.2, z: -11.0, act: 'touch', yaw: Math.PI + 0.9 }, { x: 4.4, z: -9.6, act: 'phone', yaw: Math.PI + 0.8 }, { x: 3.6, z: -8.2, act: 'look', yaw: Math.PI + 0.6, s: 0.66 },
    { x: -3.0, z: -10.2, act: 'shock', yaw: Math.PI + 0.3 }, { x: -5.6, z: -11.6, act: 'touch', yaw: Math.PI + 0.5 }, { x: -8.2, z: -13.6, act: 'point', yaw: Math.PI + 0.2 },
    { x: 2.9, z: -1.2, act: 'touch', yaw: -1.9, s: 0.66 }, { x: -0.4, z: 0.4, act: 'phone', yaw: 2.4 },
    // by the one on the right
    { x: 9.0, z: -11.6, act: 'point', yaw: Math.PI - 0.5 }, { x: 13.6, z: -10.5, act: 'look', yaw: Math.PI + 0.4 },
    // already at the edge, looking down
    { x: 3.2, z: zE(3.2) + 1.2, act: 'lookDown' }, { x: 1.6, z: zE(1.6) + 1.5, act: 'point' }, { x: -0.4, z: zE(-0.4) + 1.2, act: 'lookDown' }, { x: -2.6, z: zE(-2.6) + 1.6, act: 'phone', lookUp: -0.2 },
    { x: -4.6, z: zE(-4.6) + 1.6, act: 'shock' }, { x: 9.5, z: zE(9.5) + 2.5, act: 'lookDown', yaw: Math.PI + 0.9 }, { x: -10, z: zE(-10) + 3, act: 'point', yaw: Math.PI - 0.9 }, { x: -13.5, z: zE(-13.5) + 4, act: 'lookDown', yaw: Math.PI - 1.0, s: 0.66 },
    walker(7.8, -3.5, 2.6, T, { dur: 5 + 6.6, then: 'look', yaw: Math.PI - 0.02 }),
  ], 23);

  const level = (v) => lerp(-50, -124, smooth(T - 0.3, V_CARGO + 0.3, v));
  function cam(v) {
    const t = v - T;
    // a walk, then a run to the edge, and you stop there (0:12.3) and look down
    const u = clamp(t / 4.9);
    const g = 0.454 * u + 2.092 * u * u - 1.546 * u * u * u;     // (2.5 m/s at the start, 7.7 at most, 0 at the edge)
    const z = lerp(4, END.z, g), x = lerp(4.5, END.x, smooth(0.1, 0.9, g));
    return {
      x, z, eye: 1.66 + 0.035 * Math.sin(z * 2.4) * (1 - smooth(4.5, 4.9, t)),
      yaw: (15 * (1 - smooth(0.9, 2.6, t)) + 2.5 * smooth(3.2, 5.0, t)) * DEG,
      pitch: (lerp(-5, -6, smooth(0.5, 3, t)) - 20 * smooth(3.5, 5.2, t)) * DEG, fov: lerp(62, 66, smooth(3.5, 5.2, t)),
    };
  }
  const blow = new THREE.Vector3();
  return {
    name: 'shelf', group, h, level, cam, people, flow: 0.5, hemiI: 1.7,
    frame(v, s, fx) {
      whales.frame(v);
      // the whales still breathe: a puff of mist from each blowhole now and then
      for (const { w, grp } of whales.whales) {
        blow.set(5.2, 3.1, 0).applyMatrix4(grp.matrixWorld);
        for (let k = 0; k < 4; k++) {
          const a = ((v * 0.36 + w.ph * 1.7 + k * 0.045) % 1) / 0.42;
          if (a > 1) continue;
          fx.smoke.puff(blow.x, blow.y + 3.2 * w.s * Math.pow(a, 0.6) + k * 0.25, blow.z, (0.3 + 1.5 * a) * w.s, 0.5 * (1 - a) * smooth(0, 0.1, a), 1.0, 0, (k * 0.3 + w.ph) % 1);
        }
      }
    },
  };
}
