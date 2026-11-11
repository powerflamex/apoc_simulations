// Shot 6, the undersea mountain (0:25.8-0:30, about -16,500 ft): you stand on the deep ocean plain at the water's edge,
// and out in what is left of the sea a mountain rises: as the level falls, more and more of it stands clear, water
// streaming down its sides. (Seamounts are real and thousands of feet tall; this one is drawn steeper than most.)
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { cast } from './people.js';
import { walker } from './wreck.js';
import { fbm, ridged } from './noise.js';
import { V_MOUNT, V_TRENCH } from './timeline.js';
import { smooth, lerp, DEG } from './util.js';

const hMount = (x, z) => 0.02 * z + 0.35 * (fbm(x * 0.05, z * 0.05) - 0.5);
const MT = { x: 30, z: -2700, H: 1950, R: 1280 };

export function makeMount(ctx) {
  const group = new THREE.Group();
  const h = hMount;
  const grid = makeGrid(h, { zNear: 20, zFar: -12000, w0: 60, w1: 12000, nx: 110, nz: 170, p: 2.4 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0x7e7262, colB: 0x655a4e, patch: 0xa89a80, patchAmt: 0.4, patchS: 0.08, patchT: 0.55, scale: 0.04, ripple: 0.25, pebble: 0.6 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));

  // the mountain: a cone of ridges and gullies
  const NR = 70, NA = 120;
  const pos = new Float32Array((NR + 1) * (NA + 1) * 3), idx = [];
  let k = 0;
  for (let i = 0; i <= NR; i++) {
    const t = i / NR;
    for (let a = 0; a <= NA; a++, k++) {
      const an = (a / NA) * Math.PI * 2, cx = Math.cos(an), cz = Math.sin(an);
      // (lopsided: shoulders and a second, lower summit, so it is a mountain and not a pyramid)
      const r = MT.R * Math.pow(t, 1.25) * (1 + (0.22 * Math.sin(an * 2 + 0.6) + 0.14 * Math.sin(an * 3 + 2.1) + 0.08 * Math.sin(an * 5)) * t);
      const rid = ridged(cx * 2.6 + 7, cz * 2.6 + 3, 4), rid2 = ridged(cx * 7 + t * 2, cz * 7 + 1, 3);
      const prof = 0.5 * Math.pow(1 - t, 1.7) + 0.5 * (1 - smooth(0, 1, t)) * (1 - 0.25 * t);
      const shoulder = 0.3 * Math.exp(-Math.pow((t - 0.42) / 0.16, 2)) * Math.pow(Math.max(0, Math.cos(an - 0.4)), 3);
      const sh = prof * (0.7 + 0.46 * rid * (0.3 + 0.7 * t) + 0.18 * rid2 * t) + shoulder + 0.05 * (1 - t) * Math.sin(an * 3 + 1);
      pos[k * 3] = cx * r; pos[k * 3 + 1] = MT.H * sh; pos[k * 3 + 2] = cz * r;
    }
  }
  for (let i = 0; i < NR; i++) for (let a = 0; a < NA; a++) { const p = i * (NA + 1) + a, q = p + 1, r = p + NA + 1, s = r + 1; idx.push(p, q, r, q, s, r); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mount = new THREE.Mesh(geo, groundMaterial({ colA: 0x5a5148, colB: 0x4a433c, rock: 0x7a6248, strata: 0.75, layer: 0.012, scale: 0.002, falls: 0.6, fallS: 0.12, surf: 40, steep0: 0.97, steep1: 0.8, wet: 0.6, rough: 0.85 }));
  mount.frustumCulled = false;
  mount.position.set(MT.x, 0, MT.z);
  group.add(mount);

  const T = V_MOUNT;
  const people = cast([
    walker(1.1, -5.6, 2.0, T, { hero: true, yaw: Math.PI + 0.02 }),
    walker(-1.8, -8.8, 1.8, T), walker(3.2, -11.5, 1.7, T),
    { x: -3.4, z: -14, act: 'point', yaw: Math.PI }, { x: -4.6, z: -14.6, act: 'look', yaw: Math.PI, s: 0.66 }, { x: 4.6, z: -17, act: 'phone', lookUp: 0.3, yaw: Math.PI },
    { x: -8, z: -18, act: 'shock', yaw: Math.PI + 0.1 }, { x: 0.6, z: -20, act: 'pointUp', yaw: Math.PI }, { x: 8.5, z: -19.5, act: 'look', yaw: Math.PI - 0.1 }, { x: -12.5, z: -20, act: 'point', yaw: Math.PI + 0.2 },
  ], 61);

  // (your own shore: the water's edge stays just ahead of you; the mountain climbs out of it)
  const level = (v) => lerp(-0.62, -0.95, smooth(T - 0.3, V_TRENCH + 0.2, v));
  function cam(v) {
    const t = v - T;
    return {
      x: 0.3, z: -1.9 * t, eye: 1.66 + 0.03 * Math.sin(t * 8.4),
      yaw: lerp(-0.5, -0.8, smooth(0, 4.2, t)) * DEG, pitch: lerp(4, 9.5, smooth(0, 4.2, t)) * DEG, fov: 62,
    };
  }
  return {
    name: 'mount', group, h, level, cam, people, flow: 1,
    frame(v) { mount.position.y = lerp(-1680, -130, smooth(T - 0.4, V_TRENCH + 0.1, v)) + level(v); },
  };
}
