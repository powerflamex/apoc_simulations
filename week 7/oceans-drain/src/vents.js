// Shot 4, the hot vents (0:17.3-0:21.5, about -7,500 ft): black lava, and chimneys of minerals taller than houses, still
// pouring black smoke into the open air ("black smokers": the water in them is hot enough to melt lead). Round their
// feet, clumps of giant tube worms (white tubes, red plumes, up to 8 ft long) and yellow sulphur crusts.
import * as THREE from 'three';
import { groundMaterial, makeGrid } from './ground.js';
import { makeWater } from './water.js';
import { paint, merge, propMaterial } from './build.js';
import { cast } from './people.js';
import { walker } from './wreck.js';
import { fbm, vnoise } from './noise.js';
import { V_VENTS, V_TITANIC } from './timeline.js';
import { rng, smooth, lerp, DEG } from './util.js';

// the chimneys: [x, z, height, base radius]: each cluster taller than the last
const SPIRES = [
  [-6.5, -15, 8.5, 1.5], [-8.6, -16.5, 5.5, 1.2], [-5.2, -17.6, 4.0, 1.0],
  [6.8, -24, 13.5, 2.0], [9.4, -25.5, 9.0, 1.6], [5.0, -26.8, 6.5, 1.3], [8.2, -22.2, 4.5, 1.1],
  [-3.5, -47, 21, 2.9], [-0.2, -49.5, 15, 2.3], [-6.8, -50, 11, 2.0], [-2.4, -43.8, 7, 1.5],
  [19, -62, 16, 2.4], [22, -65, 11, 2.0], [-24, -58, 14, 2.2], [-21, -61, 9, 1.8], [4, -95, 26, 3.4], [-14, -110, 22, 3.0], [30, -120, 24, 3.2],
];
function hVents(x, z) {
  let m = 0;
  for (const [sx, sz, sh] of SPIRES) { const d2 = (x - sx) * (x - sx) + (z - sz) * (z - sz); if (d2 < 400) m += 0.09 * sh * Math.exp(-d2 / (6 + sh * 1.6)); }
  // pillow lava: rounded humps
  const pil = 0.42 * Math.pow(1 - Math.abs(2 * vnoise(x * 0.42, z * 0.42) - 1), 0.6) * smooth(1.3, 3.5, Math.abs(x - 0.4 + 0.02 * z));
  return 0.012 * z + 0.5 * (fbm(x * 0.04, z * 0.04) - 0.5) + pil + m;
}

function spireGeo(hh, r0, seed) {
  const R = rng(seed), NY = 16, NA = 11;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color(), dark = new THREE.Color(0x2c2a28), och = new THREE.Color(0x9a5e22), sul = new THREE.Color(0xdcb42c), wht = new THREE.Color(0xd9d3c0);
  const ph = R() * 9;
  for (let j = 0; j <= NY; j++) {
    const t = j / NY, y = t * hh;
    const r = r0 * (1 - 0.78 * Math.pow(t, 0.75)) * (1 + 0.32 * Math.sin(t * 9 + ph) + 0.22 * Math.sin(t * 21 + ph * 2));
    const ox = 0.25 * r0 * Math.sin(t * 4 + ph), oz = 0.25 * r0 * Math.cos(t * 3.1 + ph);
    for (let a = 0; a <= NA; a++) {
      const an = (a / NA) * Math.PI * 2, rr = r * (1 + 0.28 * Math.sin(an * 3 + t * 7 + ph) + 0.15 * Math.sin(an * 7 + ph));
      pos.push(ox + Math.cos(an) * rr, y, oz + Math.sin(an) * rr);
      const n = 0.5 + 0.5 * Math.sin(an * 2.3 + t * 11 + ph * 3);
      c.copy(dark).lerp(och, smooth(0.35, 0.8, n) * 0.8).lerp(sul, smooth(0.72, 1, t) * smooth(0.3, 0.9, n) * 0.9).lerp(wht, smooth(0.8, 1, 0.5 + 0.5 * Math.sin(an * 5.1 + t * 17)) * 0.55);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NY; j++) for (let a = 0; a < NA; a++) { const p = j * (NA + 1) + a, q = p + 1, r = p + NA + 1, s = r + 1; idx.push(p, r, q, q, r, s); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return ng;
}

export function makeVents(ctx) {
  const group = new THREE.Group();
  const h = hVents;
  const grid = makeGrid(h, { zNear: 20, zFar: -8000, w0: 60, w1: 8000, nx: 150, nz: 210, p: 2.4 });
  const ground = new THREE.Mesh(grid.ground, groundMaterial({ colA: 0x35322f, colB: 0x242326, rock: 0x1f1e20, strata: 0.2, patch: 0xd9a020, patchAmt: 0.75, patchS: 0.16, patchT: 0.6, scale: 0.07, ripple: 0, pebble: 0, rough: 0.8, steep0: 0.7, steep1: 0.45 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground, makeWater(grid.water));
  const R = rng(77);

  const parts = [];
  SPIRES.forEach(([x, z, sh, r], i) => { const g = spireGeo(sh + 1.2, r, 100 + i); g.translate(x, h(x, z) - 1.2, z); parts.push(g); });
  const spires = new THREE.Mesh(merge(parts), propMaterial({ rough: 0.8, gloss: 0.45, side: THREE.DoubleSide }));
  spires.castShadow = true; spires.receiveShadow = true;
  group.add(spires);

  // tube worms: clumps at the chimneys' feet
  {
    const tube = paint(new THREE.CylinderGeometry(0.035, 0.045, 1, 6).translate(0, 0.5, 0), 0xe9e4d6);
    const plume = paint(new THREE.SphereGeometry(0.075, 6, 5).scale(1, 2.4, 1).translate(0, 1.08, 0), 0xd4202a);
    const geo = merge([tube, plume]);
    const W = [];
    for (const [sx, sz, sh, sr] of SPIRES.slice(0, 13)) {
      const n = Math.round(26 + sh * 3);
      for (let k = 0; k < n; k++) {
        const a = R() * 6.28, d = sr * (0.95 + R() * 0.9) + (R() < 0.3 ? R() * 2 : 0);
        W.push({ x: sx + Math.cos(a) * d, z: sz + Math.sin(a) * d, s: 0.7 + R() * 1.5, lean: (R() - 0.5) * 0.5, a });
      }
    }
    // a few clumps right by your path
    for (const [cx, cz] of [[-3.6, -6.5], [4.2, -9.5], [-4.4, -12.5], [4.0, -3.5]]) for (let k = 0; k < 26; k++) { const a = R() * 6.28, d = R() * 0.9; W.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, s: 0.45 + R() * 0.7, lean: (R() - 0.5) * 0.5, a }); }
    const mesh = new THREE.InstancedMesh(geo, propMaterial({ rough: 0.5, gloss: 0.5 }), W.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    W.forEach((w, i) => { e.set(w.lean * Math.cos(w.a), 0, w.lean * Math.sin(w.a)); q.setFromEuler(e); m4.compose(p3.set(w.x, h(w.x, w.z) - 0.05, w.z), q, s3.set(1.0, w.s, 1.0)); mesh.setMatrixAt(i, m4); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    group.add(mesh);
  }

  const T = V_VENTS;
  const people = cast([
    walker(1.2, -5.6, 2.0, T, { hero: true, yaw: Math.PI + 0.03 }),
    walker(-0.9, -9.5, 1.9, T), walker(2.2, -13, 1.7, T),
    { x: -3.6, z: -9.8, act: 'pointUp', yaw: Math.PI + 0.5 }, { x: 3.8, z: -17.5, act: 'phone', lookUp: 0.7, yaw: Math.PI - 0.5 }, { x: -1.6, z: -19.5, act: 'lookUp', yaw: Math.PI + 0.4 },
    { x: 1.4, z: -30, act: 'lookUp', yaw: Math.PI + 0.2 }, { x: 3.4, z: -33, act: 'point', yaw: Math.PI + 0.3, s: 0.66 }, { x: -9, z: -31, act: 'shock', yaw: Math.PI - 0.2 },
  ], 41);

  const level = (v) => lerp(-0.9, -4.5, smooth(T - 0.2, V_TITANIC + 0.2, v));
  function cam(v) {
    const t = v - T;
    return {
      x: 0.4, z: -2.0 * t, eye: 1.66 + 0.03 * Math.sin(t * 8.4),
      yaw: lerp(-1, 1, smooth(0, 4, t)) * DEG, pitch: lerp(8, 14, smooth(0, 4, t)) * DEG, fov: 62,
    };
  }
  return {
    name: 'vents', group, h, level, cam, people, flow: 0.7,
    frame(v, s, fx) {
      // the smoke: black, billowing up from every chimney top and leaning with the wind
      SPIRES.forEach(([x, z, sh, r], i) => {
        const y0 = h(x, z) + sh, n = sh > 12 ? 20 : 14, rise = 20 + sh * 1.3;
        for (let k = 0; k < n; k++) {
          const a = ((v * 0.22 + i * 0.37 + k / n) % 1 + 1) % 1;
          const y = y0 + rise * Math.pow(a, 0.85), rr = (r * 0.7 + (1.6 + sh * 0.34) * a) * (0.85 + 0.3 * ((k * 0.618) % 1));
          fx.smoke.puff(x + 0.25 * r * Math.sin(i) + (5 + sh * 0.5) * a * a + 0.6 * Math.sin(v * 0.7 + k), y, z - 2.0 * a * a, rr, 0.95 * smooth(0, 0.05, a) * Math.pow(1 - a, 0.9), 0.02 + 0.16 * a, 0, (k * 0.37 + i * 0.11) % 1);
        }
      });
      // steam where the last water touches hot rock, near you
      for (const [x, z] of [[-2.4, -7.5], [3.0, -11], [-4.2, -14.5]]) for (let k = 0; k < 3; k++) {
        const a = ((v * 0.5 + k / 3 + x) % 1 + 1) % 1;
        fx.smoke.puff(x + 0.3 * a, h(x, z) + 0.4 + 2.6 * a, z, 0.3 + 1.1 * a, 0.35 * smooth(0, 0.1, a) * (1 - a), 1.0, 0, (k * 0.3 + x) % 1);
      }
    },
  };
}
