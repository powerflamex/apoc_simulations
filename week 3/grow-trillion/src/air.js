// What's in the air: a field of fair-weather cumulus 1.4-2.4 km up (white, sunlit on top, grey underneath) for
// 40 km round the city, and the airliner that crosses in front of your knees at 10.7 km with its contrail.
import * as THREE from 'three';
import { makeSmoke } from './smoke.js';
import { V_PLANE, sizeAt } from './timeline.js';
import { rng, smooth } from './util.js';

const BASE = 1400;
export function makeAir(scene, ctx) {
  const smoke = makeSmoke(scene, 4200);
  smoke.mat.uniforms.uLight.value.setRGB(1.0, 1.0, 1.02);
  const P = [];
  const R = rng(321);
  for (let c = 0; c < 420; c++) {
    const a = R() * Math.PI * 2, d = 1500 + 40000 * Math.sqrt(R());
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const n = 4 + Math.floor(R() * 6);
    const s = 250 + R() * 500;
    for (let k = 0; k < n; k++) P.push({ x: cx + (R() - 0.5) * s * 2.2, z: cz + (R() - 0.5) * s * 2.2, y: BASE + 250 + R() * 500 * (0.4 + k / n), r: s * (0.45 + 0.6 * R()), seed: R() });
  }

  // the airliner: fuselage, wings, tail; flying west to east across the south (in front of you), 10.7 km up
  const plane = new THREE.Group();
  const white = ctx.plainMat(0xf2f3f5, 0.35, { metalness: 0.3 });
  plane.add(new THREE.Mesh(new THREE.CapsuleGeometry(2.0, 36, 6, 12).rotateZ(Math.PI / 2), white));
  plane.add(new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 60).translate(-2, -0.6, 0).applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0, 0.45, 0)), white));
  plane.add(new THREE.Mesh(new THREE.BoxGeometry(4, 8, 0.5).translate(-18, 4, 0), white));
  plane.add(new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 18).translate(-18, 1, 0), white));
  plane.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  scene.add(plane);
  // its path: crossing the line between you and the drone camera, 1.25 of your heights out in front, at V_PLANE
  const SP = sizeAt(V_PLANE), CP = new THREE.Vector3(0.105 * SP, 0, 0);
  const AZ = 222 * Math.PI / 180;
  const toCam = new THREE.Vector3(Math.sin(AZ), 0, -Math.cos(AZ));
  const P0 = CP.clone().addScaledVector(toCam, 1.25 * 1.75 * SP);
  const FD = new THREE.Vector3(-toCam.z, 0, toCam.x);       // flight direction, square to the line of sight
  const PL = { y: 10700, speed: 250 };
  const planeAt = (v, back = 0) => P0.clone().addScaledVector(FD, (v - V_PLANE) * PL.speed + 7000 - back);

  return {
    smoke, plane,
    frame(v, camPos, sunDir, s) {
      smoke.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uSun.value.copy(sunDir);
      smoke.begin();
      // the contrail: a line of white puffs behind the plane, spreading with age
      const pp = planeAt(v);
      const on = 0;   // (the airliner turned out to be too small to read next to you: left out)
      if (on > 0) {
        for (let k = 0; k < 220; k++) {
          const back = 60 + k * 170;
          const age = back / PL.speed;
          const cp = planeAt(v, back);
          smoke.puff(cp.x, PL.y - age * 0.4, cp.z + 30 * Math.sin(k * 0.37), 14 + age * 2.2, 0.55 * on * Math.exp(-age / 160), 1.0, 0.0, (k * 0.137) % 1);
        }
      }
      // cloud puffs; the ones your legs pass through are pushed aside
      const legR = 0.09 * s, youX = 0.105 * s;
      const fade = 1 - smooth(4500, 15000, s);
      if (fade > 0) for (const p of P) {
        let x = p.x, z = p.z;
        const dx = x - youX, d = Math.hypot(dx, z);
        if (d < legR * 3 + p.r) { const push = (legR * 3 + p.r - d); x += (dx / (d || 1)) * push; z += (z / (d || 1)) * push; }
        const dc = Math.hypot(x - camPos.x, p.y - camPos.y, z - camPos.z);
        const a = 0.55 * fade * smooth(400, 1500, dc);
        smoke.puff(x, p.y, z, p.r, a, 1.0, 0.0, p.seed);
      }
      smoke.end();
      plane.visible = on > 0;
      plane.position.set(pp.x, PL.y, pp.z);
      plane.rotation.y = Math.atan2(-FD.z, FD.x);
      return { px: pp.x, on, y: PL.y, z: pp.z };
    },
  };
}
