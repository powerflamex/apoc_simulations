// TEN YEARS LATER: the plaza after everything you invented got built. Down the avenue, new towers rise with glowing
// fusion rings round their tops; flying cars cross the sky in lanes; a rocket lifts off beyond the end of the avenue,
// climbing on a bright flame with a trail of glowing exhaust; the evening Moon has a light on it (a base). Driven by
// s.futureK (how much is built), s.launch (seconds since the rocket lit) and the video clock.
import * as THREE from 'three';
import { rng, smooth, clamp } from './util.js';
import { SEC } from './timeline.js';

export function makeFuture(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const r = rng(1010);
  // ---- fusion towers down the avenue (both sides of its far end), each with a glowing ring ----
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8d0, roughness: 0.3, metalness: 0.3 });
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.2, 4.0), fog: false });
  const towers = [];
  const SPOTS = [[-48, -260, 190], [40, -330, 240], [-30, -520, 320], [70, -560, 210], [-95, -430, 170], [12, -800, 380]];
  for (const [x, z, h] of SPOTS) {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, h, 16).translate(0, h / 2, 0), glass);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 40, 12).translate(0, h + 20, 0), glass);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(26, 4.5, 10, 48).rotateX(Math.PI / 2).translate(0, h * 0.86, 0), ringMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(19, 3.2, 10, 40).rotateX(Math.PI / 2).translate(0, h * 0.62, 0), ringMat);
    t.add(body, spire, ring, ring2);
    t.position.set(x, 0, z);
    g.add(t);
    towers.push({ t, delay: r() * 0.5 });
  }
  // ---- flying cars: little capsules with lights, in four sky lanes across the avenue ----
  const NC = 48;
  const carGeo = new THREE.CapsuleGeometry(1.1, 3.2, 4, 8).rotateZ(Math.PI / 2);
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.3, metalness: 0.5 }), NC);
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 2.2), fog: false }), NC * 2);
  cars.frustumCulled = false; lights.frustumCulled = false;
  g.add(cars, lights);
  const lanes = [];
  for (let i = 0; i < NC; i++) lanes.push({ y: 14 + (i % 4) * 9 + r() * 3, z: -22 - (i % 6) * 26 - r() * 12, dir: i % 2 ? 1 : -1, sp: 14 + r() * 8, off: r() * 600 });
  // ---- the rocket beyond the end of the avenue ----
  const LP = new THREE.Vector3(-4, 0, -950);
  const rocket = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 60, 16).translate(0, 30, 0), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 16).translate(0, 67, 0), hull.material);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(5, 40, 16, 1, true).rotateX(Math.PI).translate(0, -20, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.8, 0.4), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.7), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  rocket.add(hull, nose, flame, glow);
  rocket.scale.setScalar(1.8);
  g.add(rocket);
  // the exhaust trail: glowing puffs left behind along the climb
  const NP = 160;
  const puffs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.75, 0.6), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), NP);
  puffs.frustumCulled = false;
  g.add(puffs);
  // ---- the Moon over the avenue, with a base's light on it ----
  const moonPos = new THREE.Vector3(260, 520, -1900);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.12, 1.05), fog: false }));
  const base = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.4), fog: false }));
  base.position.set(-14, -10, 36);
  moon.add(base);
  moon.position.copy(moonPos);
  g.add(moon);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  g.visible = false;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const alt = (t) => (t < 0 ? 0 : 0.5 * 9 * t * t);   // the climb (m), 9 m/s²
  return {
    frame(v, s) {
      g.visible = s.future > 0.001;
      if (!g.visible) return;
      const K = s.futureK;
      for (const tw of towers) {
        const k = smooth(tw.delay * 0.5, tw.delay * 0.5 + 0.5, K);
        tw.t.scale.set(1, Math.max(1e-3, k), 1);
        tw.t.visible = k > 0.002;
      }
      ringMat.color.setRGB(1.6, 3.2, 4.0).multiplyScalar(0.85 + 0.15 * Math.sin(v * 3));
      // flying cars: in once the city is half built
      const ck = smooth(0.35, 0.7, K);
      lanes.forEach((L, i) => {
        if (i / NC > ck) { cars.setMatrixAt(i, zero); lights.setMatrixAt(2 * i, zero); lights.setMatrixAt(2 * i + 1, zero); return; }
        const x = ((L.sp * v * L.dir + L.off) % 600 + 600) % 600 - 300;
        v3.set(x, L.y, L.z); q.identity(); sc.set(1, 1, 1);
        m.compose(v3, q, sc); cars.setMatrixAt(i, m);
        v3.set(x + L.dir * 2.4, L.y, L.z); m.compose(v3, q, sc.set(1, 1, 1)); lights.setMatrixAt(2 * i, m);
        v3.set(x - L.dir * 2.4, L.y, L.z); m.compose(v3, q, sc.set(0.6, 0.6, 0.6)); lights.setMatrixAt(2 * i + 1, m);
      });
      cars.instanceMatrix.needsUpdate = true; lights.instanceMatrix.needsUpdate = true;
      // the rocket: on the pad, then up
      const lt = s.launch;
      const h = alt(lt);
      rocket.position.set(LP.x, LP.y + h, LP.z);
      const lit = lt > 0 ? 1 : 0;
      flame.visible = glow.visible = lit > 0;
      flame.scale.set(1, 1 + 0.15 * Math.sin(v * 37), 1);
      glow.scale.setScalar(1 + 0.2 * Math.sin(v * 23));
      for (let i = 0; i < NP; i++) {
        const tp = (i / NP) * lt;                    // when this puff was left
        if (lt <= 0 || tp > lt) { puffs.setMatrixAt(i, zero); continue; }
        const age = lt - tp, size = 2.5 + age * 1.6;
        v3.set(LP.x + Math.sin(i * 1.7) * age * 0.8, LP.y + alt(tp) - 6, LP.z + Math.cos(i * 2.3) * age * 0.8);
        m.compose(v3, q.identity(), sc.set(size, size, size));
        puffs.setMatrixAt(i, m);
      }
      puffs.instanceMatrix.needsUpdate = true;
      puffs.material.opacity = 0.22 * clamp(lt / 2);
      rocket.visible = K > 0.6;
      moon.visible = true;
      base.visible = K > 0.8;
    },
  };
}
