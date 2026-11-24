// The Himalaya round Everest (local metres: the summit at x = z = 0, 8,849 m up; x north, z east).
// Everest is a three-sided pyramid (north face, south-west face, Kangshung face) with sharp ridges; Lhotse (8,516 m)
// 3 km south across the South Col, Nuptse's long wall (7,861 m) to the south-west, Makalu (8,485 m) 19 km south-east,
// Cho Oyu (8,188 m) 28 km west, the rest a sea of 6-7,000 m ridges. (From rain-1000-years.)
import * as THREE from 'three';
import { polarTerrain, terrainMaterial, ridged, fbm } from './terrain.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a pyramid peak: height falls off along the steepest of its faces (directions in degrees, compass: 0 = north)
function peak(x, z, cx, cz, H, faces, slope) {
  const dx = x - cx, dz = z - cz;
  let m = 0;
  for (const f of faces) { const a = f * Math.PI / 180; m = Math.max(m, dx * Math.cos(a) + dz * Math.sin(a)); }
  return H - m * slope;
}
export function everestH(x, z) {
  const r = Math.hypot(x, z);
  // the range: ridged noise ~4,000-7,000 m, lower along the valley we come in by (from the south-west)
  const along = -(x + z) * 0.7071, across = Math.abs(x - z) * 0.7071;
  const valley = along > 0 ? 0.3 + 0.7 * sm(1400, 3500, across - along * 0.08) : 1;
  let h = 3900 + 3000 * ridged(x / 9000 + 11, z / 9000 - 4, 6) * valley;
  // the peaks (each with its own faces); the highest wins
  h = Math.max(h, peak(x, z, 0, 0, 8849, [0, 120, 240], 1.05) + 25 * (ridged(x / 300, z / 300, 4) - 0.5) * sm(15, 120, r));
  h = Math.max(h, peak(x, z, -3100, 300, 8516, [10, 130, 250], 1.15) + 30 * (ridged(x / 280 + 3, z / 280, 4) - 0.5));
  h = Math.max(h, peak(x, z, -2200, -2600, 7861, [-30, 60, 150, 240], 0.95) + 30 * (ridged(x / 300, z / 300 + 5, 4) - 0.5));
  h = Math.max(h, peak(x, z, -14000, 14500, 8485, [0, 100, 200, 300], 1.0));
  h = Math.max(h, peak(x, z, 2000, -28000, 8188, [30, 150, 270], 0.8));
  // big gullies and buttresses on the faces (so the peaks aren't clean pyramids), none near the summit
  h += 260 * (ridged(x / 1700 + 3, z / 1700 - 2, 5) - 0.5) * sm(150, 1600, r) * sm(5800, 7000, h);
  // the summit: a short snow ridge, rounded off over the last few metres
  if (r < 40) h = Math.min(h, 8849 - r * r * 0.004 - 0.02 * r);
  // snow ribs and couloirs on the faces (so it isn't one smooth plane)
  h += 18 * (ridged(x / 160, z / 160, 4) - 0.5) * sm(30, 200, r);
  return h;
}

// drawn only during the cut-away (main.js hides the city then), so it sits at the world origin like the city
export function makeEverest(scene) {
  const mat = terrainMaterial({ uSnow: { value: 5600 }, uTree: { value: 3800 } });
  const mesh = polarTerrain(everestH, 0, 0, 1.2, 70000, 720, 330, mat);
  mesh.visible = false;
  scene.add(mesh);
  return { group: [mesh], mat };
}
