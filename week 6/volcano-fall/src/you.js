// You, as you see yourself: two legs in jeans and a pair of white trainers (standing at the edge, dangling as you
// fall, stretched out in front of you once you sit on the crust). And soft smoke: from your shoes on the hot crust,
// and the sulfur gas drifting low over the lake.
import * as THREE from 'three';
import { rng, clamp } from './util.js';

export function makeYou() {
  const root = new THREE.Group();           // at your hips
  const jeans = new THREE.MeshStandardMaterial({ color: 0x4a6a9e, roughness: 0.85 });
  const shoeM = new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.7 });
  const soleM = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.9 });
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 10).translate(0, -0.22, 0), jeans);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.set(0, -0.44, 0);
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10).translate(0, -0.21, 0), jeans);
    knee.add(shin);
    const ankle = new THREE.Group();
    ankle.position.set(0, -0.44, 0);
    knee.add(ankle);
    const shoe = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.2, 4, 12).rotateX(Math.PI / 2).scale(1.05, 0.95, 1).translate(0, -0.03, -0.09), shoeM);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.04, 0.34).translate(0, -0.09, -0.09), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 }));
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.12).translate(0, 0.035, -0.11), soleM);
    shoe.add(upper, sole, lace);
    ankle.add(shoe);
    root.add(hip);
    legs.push({ hip, knee, ankle, side });
  }
  // pose: stand (0..1 -> dangling as you fall: fall = how much they flail) and sit (0..1 blends to sitting:
  // legs forward along -z, knees a little up, toes up)
  const lerp = (a, b, k) => a + (b - a) * k;
  function pose(t, fall = 0, sit = 0) {
    for (const L of legs) {
      const s = Math.sin(t * 2.3 + L.side * 1.7), c = Math.sin(t * 1.7 + L.side);
      let hx = lerp(0.05, 0.25 + 0.35 * s, fall), hz = L.side * lerp(0.04, 0.12 + 0.08 * c, fall);
      let kx = lerp(-0.08, -0.35 - 0.3 * (0.5 + 0.5 * c), fall), ax = lerp(0.03, 0.3 + 0.2 * s, fall);
      hx = lerp(hx, 1.75, sit); hz = lerp(hz, L.side * 0.2, sit); kx = lerp(kx, -0.75, sit); ax = lerp(ax, -0.6, sit);
      L.hip.rotation.set(hx, 0, hz); L.knee.rotation.set(kx, 0, 0); L.ankle.rotation.set(ax, 0, 0);
    }
  }
  // world positions of the two shoes (for the smoke)
  const tmp = new THREE.Vector3();
  const shoeAt = (i, out) => { legs[i].ankle.updateWorldMatrix(true, false); return out.setFromMatrixPosition(legs[i].ankle.matrixWorld).add(tmp.set(0, -0.06, 0)); };
  return { root, pose, shoeAt, mats: [jeans, shoeM, soleM] };
}

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// puffs: [T0 (story), x, y, z, vx, vy, vz, size0, grow, life]; billboards facing the camera
export function makeSmoke(maxN, color) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: softTexture(), transparent: true, depthWrite: false, color, fog: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha; varying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vAlpha;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, maxN);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(maxN), 1);
  geo.setAttribute('aAlpha', alpha);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 6;
  const puffs = [];
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), rq = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
  return {
    mesh,
    add(...a) { if (puffs.length < maxN) puffs.push(a); },
    update(T, camera, gain = 1) {
      let n = 0;
      camera.getWorldQuaternion(q);
      for (const f of puffs) {
        const dt = T - f[0];
        if (dt < 0 || dt > f[9]) continue;
        const k = dt / f[9];
        p.set(f[1] + f[4] * dt, f[2] + f[5] * dt, f[3] + f[6] * dt);
        const sz = f[7] + f[8] * dt;
        rq.setFromAxisAngle(z, f[1] * 3 + dt * 0.3);
        m4.compose(p, q.clone().multiply(rq), s.set(sz, sz, sz));
        mesh.setMatrixAt(n, m4);
        alpha.array[n] = clamp(dt / 0.6) * (1 - k) * (1 - k) * gain * (f[10] ?? 1);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      alpha.needsUpdate = true;
    },
  };
}

export { rng };
