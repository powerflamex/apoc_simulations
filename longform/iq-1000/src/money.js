// The million-dollar prize, raining down: ten thousand hundred-dollar bills (a few hundred of them, really) spawn
// above the plaza when you solve the problem and flutter down in world time: drifting slowly while your brain is fast,
// then hanging in the air for the rest of the frozen part. Instanced planes with a bill texture.
import * as THREE from 'three';
import { rng, clamp } from './util.js';

export function makeMoney(scene, W0) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 108;
  const g = c.getContext('2d');
  g.fillStyle = '#cfdcc4'; g.fillRect(0, 0, 256, 108);
  g.strokeStyle = '#3d5a3a'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 96);
  g.fillStyle = '#4d6b48'; g.beginPath(); g.ellipse(128, 54, 30, 38, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f4a2c'; g.font = 'bold 34px Georgia'; g.fillText('100', 18, 44); g.fillText('100', 180, 96);
  g.font = 'bold 14px Georgia'; g.fillText('THE UNITED STATES OF AMERICA', 30, 24);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const N = 700;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.156, 0.066), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }), N);
  mesh.frustumCulled = false; mesh.castShadow = true;
  scene.add(mesh);
  const r = rng(1000000);
  const bills = [];
  for (let i = 0; i < N; i++) bills.push({ x: (r() - 0.5) * 14, z: -1 - r() * 9, y0: 1.2 + r() * 8, t0: r() * 0.8, sp: 0.9 + r() * 0.6, ph: r() * 6.28, sw: 0.6 + r() * 0.8 });
  const ORIGIN = new THREE.Vector3(0.5, 7, -7);
  const sc = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    // w: world time; v / v0: the video clock and when the prize appears (the bills burst out of one point of light over
    // the street in the first second and a half, then fall in world time)
    frame(w, fadeOut, vt, v0) {
      const dt0 = Math.max(0, w - W0);
      mesh.visible = vt > v0 && fadeOut < 1;
      if (!mesh.visible) return;
      bills.forEach((b, i) => {
        const dt = dt0;
        const k = clamp((vt - v0 - b.t0 * 0.5) / 1.3), ke = 1 - Math.pow(1 - k, 3);
        if (k <= 0) { mesh.setMatrixAt(i, zero); return; }
        const y = b.y0 - b.sp * dt;   // terminal speed ~1 m/s: paper flutters down
        if (y < 0.02) { v.set(b.x, 0.02, b.z); e.set(-Math.PI / 2, b.ph, 0); }
        else { v.set(b.x + Math.sin(dt * 2 * b.sw + b.ph) * 0.35, y, b.z + Math.cos(dt * 1.7 * b.sw + b.ph) * 0.25); e.set(Math.sin(dt * 3 + b.ph) * 0.9, dt * b.sw * 2 + b.ph, Math.cos(dt * 2.3 + b.ph) * 0.7); }
        v.lerp(ORIGIN, 1 - ke);
        q.setFromEuler(e); m.compose(v, q, sc.setScalar(0.3 + 0.7 * ke)); mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
