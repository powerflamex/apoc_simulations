// Shot 2, the edge of the shelf (0:07.5-0:13.1, about -300 to -1,200 ft). First a humpback whale the size of a bus lies
// side-on in front of you, whole (head, eye, flipper, tail), in the hollow it scoured, people beside it for size. Then
// you run to the edge and look over it: a cliff, and the sea far below and shrinking as the seabed under it comes out.
// The water is always far below where you stand: its level here is set from the counter (feet below the first wreck).
// (The real edge of the continental shelf is on average about 440 ft down and the slope below it is gentler; it is
// drawn as a cliff so it reads.)
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { makeWhales } from './creatures.js';
import { cast } from './people.js';
import { walker } from './wreck.js';
import { fbm, vnoise } from './noise.js';
import { V_WHALES, V_CARGO, feetAt, M } from './timeline.js';
import { smooth, lerp, clamp, DEG } from './util.js';

const E0 = -14;
// the edge: 26 m ahead of where the shot starts, with a headland on the right running 40 m out
export const zEdge = (x) => E0 + 2 * (vnoise(x * 0.06, 1.7) - 0.5) - 42 * smooth(9, 15, x);
const WH = { x: -5, z: -3, yaw: 0 };             // the big whale (side-on, head to the right, a little towards you)
function hShelf(x, z) {
  const top = 0.012 * Math.min(z, 0) + 0.3 * (fbm(x * 0.07, z * 0.07) - 0.5);
  const d = zEdge(x) - z;                          // metres out past the edge
  if (d <= 0) return top;
  // a 100 m cliff, then the slope going down and down
  const k = smooth(0, 9, d);
  const slope = d < 9 ? -100 : d < 426 ? -100 - 0.72 * (d - 9) : -400 - 0.05 * (d - 426);
  return top * (1 - k) + slope * k + 7 * (fbm(x * 0.04, z * 0.04) - 0.5) * smooth(0.5, 9, d) + 3 * (fbm(x * 0.2 + 9, z * 0.05) - 0.5) * smooth(0.5, 4, d) * (1 - smooth(9, 20, d));
}

// (yaw: the head points along (cos, 0, -sin); roll tips its back towards you, so you see along it and its tail shows)
const WHALES = [
  { x: WH.x, z: WH.z, yaw: WH.yaw, s: 0.85, ph: 0.15, roll: 0.3 },          // (12.3 m: as long as a city bus)
  { x: 11, z: -5, yaw: 0.4, s: 0.5, ph: 0.8, roll: 0.15, lift: 1.3 },
];

export function makeShelf(ctx) {
  const group = new THREE.Group();
  const h = hShelf;
  // the grid's rows follow the edge (dense across the cliff, then down the slope)
  const rows = [];
  for (let e = -40; e < 0; e += 1) rows.push(E0 - e);
  for (const e of [0, 0.6, 1.3, 2.2, 3.3, 4.6, 6, 7.5, 9, 12, 16, 21, 28, 37, 48, 62, 80, 100, 125, 155, 190, 230, 280, 340, 400, 440, 520, 650, 850, 1150, 1600, 2400, 3600, 6000]) rows.push(E0 - e);
  const warp = (x, z) => [x, z + zEdge(x) - E0];
  const grid = makeGrid(h, { rows, zNear: rows[0], zFar: rows[rows.length - 1], w0: 80, w1: 7500, nx: 180, warp });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0xe3c98e, colB: 0xcfae72, rock: 0xcbb994, strata: 1, layer: 0.06, patch: 0xe2714a, patchAmt: 0.3, patchS: 0.2, patchT: 0.64, scale: 0.06, ripple: 0.35, pebble: 0.2, falls: 0.55, fallS: 0.4, surf: 5 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));

  const whales = makeWhales(group, WHALES, h);

  const T = V_WHALES;
  const zE = (x) => zEdge(x);
  const LX = 4.0, LZ = zEdge(4.0);                          // where you go over the edge
  const people = cast([
    // by the whale, for size: at its head, a hand on its side, a child by the tail
    // (the walker in red is the one with a hand on it: he stays with the whale, never at the edge)
    ...[[0.2, 2.3, 'touch', 1, true], [5.0, 2.8, 'look'], [-2.8, 3.4, 'phone'], [-5.2, 2.6, 'look', 0.66]].map(([a, p, act, s, hero]) => {
      const ax = Math.cos(WH.yaw), az = -Math.sin(WH.yaw), px = Math.sin(WH.yaw), pz = Math.cos(WH.yaw);   // along it, and out from its side towards you
      return { x: WH.x + ax * a + px * p, z: WH.z + az * a + pz * p, act, s, hero, yaw: Math.atan2(-px, -pz) + (act === 'phone' ? 0.4 : 0) };
    }),
    // by the calf
    { x: 8.6, z: -2.4, act: 'touch', yaw: Math.PI - 0.6 }, { x: 13.4, z: -2.2, act: 'point', yaw: Math.PI + 0.3, s: 0.66 },
    // at the edge, looking down; one out on the headland
    { x: -1.0, z: zE(-1.0) + 1.5, act: 'point' }, { x: -3.6, z: zE(-3.6) + 1.2, act: 'lookDown' }, { x: -6.0, z: zE(-6.0) + 1.6, act: 'phone', lookUp: -0.3 },
    { x: -9.5, z: zE(-9.5) + 1.6, act: 'shock' }, { x: 13.2, z: -35, act: 'lookDown', yaw: -Math.PI / 2 }, { x: 13.6, z: -28, act: 'point', yaw: -Math.PI / 2 - 0.3 },
  ], 23);

  // far below you: 60 m down when the shot opens, then falling with the counter
  const level = (v) => -60 - Math.max(0, feetAt(v) - 300) * M;
  function cam(v) {
    const t = v - T;
    // 0-1.6 s: walking slowly, the whale side-on; then a run to the edge (0:11.9), and you lean out over it with your phone
    // and look straight down (the camera goes half a metre past the lip, so nothing hides the drop)
    const walkZ = lerp(14, 12.8, clamp(t / 1.3));
    const u = clamp((t - 1.3) / 2.8);
    const g = u * u * (3 - 2 * u);
    const lean = smooth(3.9, 4.8, t);
    const z = lerp(lerp(walkZ, LZ + 0.9, g), LZ - 0.5, lean), x = lerp(lerp(2.6, 2.8, clamp(t / 1.3)), LX, g);
    const topY = h(LX, LZ + 0.6);
    return {
      x, z, y: lerp(h(x, Math.max(z, LZ + 0.6)) + 1.66 + 0.035 * Math.sin(z * 2.4) * (1 - smooth(4.0, 4.4, t)), topY + 1.25, lean),
      yaw: (23 * (1 - smooth(1.2, 2.8, t))) * DEG,
      // (looking a little up at first, so the whale sits below the counter)
      pitch: (6 - 39 * smooth(2.0, 3.8, t) - 37 * smooth(3.9, 5.0, t)) * DEG, fov: lerp(70, 66, smooth(1.3, 3, t)),
    };
  }
  const blow = new THREE.Vector3();
  return {
    name: 'shelf', group, h, level, cam, people, flow: 0.5, hemiI: 1.6,
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
