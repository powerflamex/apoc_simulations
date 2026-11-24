// Camera helper (not part of the video): for each [t, x, y, z, chest screen y, horizon screen y, chest screen x] finds the aim and fov.
// Usage: node camsolve.mjs '[[17.6,-1,6,9,1400,500,560]]'  -> a CAMK row for src/main.js, plus where you, the horizon and the bus land.
import * as THREE from 'three';
const rows = JSON.parse(process.argv[2]), out = [];
for (const [t, x, y, z, yS, hS, xS, chestY = 1.1] of rows) {
  let best = null;
  for (let fov = 40; fov <= 80; fov += 0.5) for (let pit = -60; pit <= 10; pit += 0.25) {
    const c = new THREE.PerspectiveCamera(fov, 1080 / 1920, 0.25, 14000); c.position.set(x, y, z);
    // yaw: aim at you horizontally first, then offset
    const yaw0 = Math.atan2(-x, -z);
    for (let dy = -30; dy <= 30; dy += 1) {
      const yaw = yaw0 + dy * Math.PI / 180, p = pit * Math.PI / 180;
      const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p));
      c.lookAt(x + d.x * 100, y + d.y * 100, z + d.z * 100); c.updateMatrixWorld(); c.updateProjectionMatrix();
      const pr = (q) => { const v = new THREE.Vector3(...q).project(c); return [(v.x * 0.5 + 0.5) * 1080, (1 - (v.y * 0.5 + 0.5)) * 1920]; };
      const [ux, uy] = pr([0, chestY, 0]); const hy = pr([x + Math.sin(yaw) * 9000, 0, z + Math.cos(yaw) * 9000])[1];
      const e = (uy - yS) ** 2 + (hy - hS) ** 2 + (ux - xS) ** 2 + (fov - 60) ** 2 * 4;
      if (!best || e < best.e) best = { e, k: [t, x, y, z, +(x + d.x * 100).toFixed(1), +(y + d.y * 100).toFixed(1), +(z + d.z * 100).toFixed(1), fov], ux: Math.round(ux), uy: Math.round(uy), hy: Math.round(hy) };
    }
  }
  const c2 = new THREE.PerspectiveCamera(best.k[7], 1080 / 1920, 0.25, 14000); c2.position.set(x, y, z); c2.lookAt(best.k[4], best.k[5], best.k[6]); c2.updateMatrixWorld(); c2.updateProjectionMatrix();
  const P = (q) => { const v = new THREE.Vector3(...q).project(c2); return [Math.round((v.x * 0.5 + 0.5) * 1080), Math.round((1 - (v.y * 0.5 + 0.5)) * 1920)]; };
  console.log(JSON.stringify(best.k), "you", best.ux, best.uy, "h", best.hy, "tall", P([0, 0, 0])[1] - P([0, 1.75, 0])[1], "bus", P([9.7, 1.3, -5.2]), "bus0", P([10.9, 1.5, -15.5]));
}
