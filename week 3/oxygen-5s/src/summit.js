// The summit: the terrace round the statue (railings, the stairs down the east side), the tourists, and the tour
// helicopter circling just off the edge. Everything up here sinks with the powdered rock (state.sink).
// The tourists: filming, taking selfies, looking up; at the pressure drop they clutch their heads; once the terrace is
// falling faster than they can stand, they float off it a little, tumbling slowly.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { STATUE } from './statue.js';
import { G } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

export const TERR = { x0: -10, x1: 30, z0: -12, z1: 12, y: STATUE.base };
const SHIRTS = [0xf2f2ee, 0x1d1f24, 0xe2574c, 0x3b6db3, 0xf3c94b, 0x58a37a, 0xe98bb4, 0x8c5ad1, 0xf08a3c, 0x41c1c9, 0xffffff, 0x2f2f2f, 0x2a9d4a];
const PANTS = [0x2b3a55, 0x1b1b1d, 0xd8cfbd, 0x50555c, 0x6a4b33, 0xf0ece4, 0x2e4a3a, 0x9ab4d0];

export const TOURISTS = [];
{
  const R = rng(2026);
  let guard = 0;
  while (TOURISTS.length < 72 && guard++ < 5000) {
    const x = TERR.x0 + 1.2 + R() * (TERR.x1 - TERR.x0 - 2.4), z = TERR.z0 + 1.2 + R() * (TERR.z1 - TERR.z0 - 2.4);
    if (Math.abs(x) < 6.2 && Math.abs(z) < 6.2) continue;                 // the pedestal
    if (Math.hypot(x - 21, z + 5.5) < 4.5) continue;                      // (where you stand for the falling shot)
    if (TOURISTS.some((p) => Math.hypot(p.x - x, p.z - z) < 1.0)) continue;
    const view = x > 18 && R() < 0.7;                                      // at the east railing, looking at the view
    const selfie = !view && R() < 0.35;
    TOURISTS.push({ x, z, seed: R(), view, selfie, film: !selfie && R() < 0.4,
      col: [SHIRTS[Math.floor(R() * SHIRTS.length)], PANTS[Math.floor(R() * PANTS.length)], SKIN[Math.floor(R() * SKIN.length)], HAIR[Math.floor(R() * HAIR.length)]],
      s: 0.92 + R() * 0.14, react: 0.12 + R() * 0.12, drift: [(R() - 0.5) * 2, R(), (R() - 0.5) * 2], spin: (R() - 0.5) * 1.2 });
  }
}

export function makeSummit(scene) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xc4bdb0, roughness: 0.9 });
  stone.onBeforeCompile = (sh) => {
    sh.uniforms.uDust = { value: 0 };
    stone.userData.u = sh.uniforms;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDust;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.62, 0.55), uDust);');
  };
  const g = new THREE.Group();
  scene.add(g);
  // the slab (and a skirt down into the rock), the stairs on the east side
  const slab = new THREE.Mesh(new THREE.BoxGeometry(TERR.x1 - TERR.x0, 6, TERR.z1 - TERR.z0).translate((TERR.x0 + TERR.x1) / 2, -3, 0), stone);
  slab.receiveShadow = true; slab.castShadow = true;
  g.add(slab);
  const steps = [];
  for (let k = 0; k < 10; k++) steps.push(new THREE.BoxGeometry(1.0, 0.4, 5.5).translate(TERR.x1 + 0.5 + k * 1.0, -0.2 - k * 0.4, 0).toNonIndexed());
  g.add(new THREE.Mesh(mergeGeometries(steps), stone));
  // railings: posts and a top rail round the edge (open at the stairs)
  const rail = [];
  const run = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 2));
    for (let k = 0; k <= n; k++) { const t = k / n; rail.push(new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(x0 + (x1 - x0) * t, 0.55, z0 + (z1 - z0) * t).toNonIndexed()); }
    const ang = Math.atan2(z1 - z0, x1 - x0);
    rail.push(new THREE.BoxGeometry(L, 0.07, 0.07).rotateY(-ang).translate((x0 + x1) / 2, 1.1, (z0 + z1) / 2).toNonIndexed());
    rail.push(new THREE.BoxGeometry(L, 0.05, 0.05).rotateY(-ang).translate((x0 + x1) / 2, 0.55, (z0 + z1) / 2).toNonIndexed());
  };
  const { x0, x1, z0, z1 } = TERR;
  run(x0, z0, x1, z0); run(x0, z1, x1, z1); run(x0, z0, x0, z1); run(x1, z0, x1, -2.8); run(x1, 2.8, x1, z1);
  const railMesh = new THREE.Mesh(mergeGeometries(rail), new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.6 }));
  railMesh.castShadow = true;
  g.add(railMesh);

  // the tourists
  const crowd = makeCrowd(scene, TOURISTS.length, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  TOURISTS.forEach((p, i) => crowd.color(i, ...p.col));

  // ---------- the tour helicopter ----------
  const heli = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.2 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.45 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14).scale(1.9, 1.0, 1.0), white);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.32, 20, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.12).scale(1.9, 1.0, 1.0), red);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.4, 0.9, 1.0).translate(1.3, 0.2, 0), glassM);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5.5, 10).rotateZ(Math.PI / 2).translate(-4.4, 0.3, 0), white);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.1).translate(-7.0, 0.9, 0), red);
  const skids = new THREE.Mesh(mergeGeometries([-1, 1].map((sd) => new THREE.BoxGeometry(3.8, 0.1, 0.1).translate(0.2, -1.5, sd * 0.9).toNonIndexed())), dark);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8).translate(0, 1.25, 0), dark);
  const rotor = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(10.5, 0.06, 0.3).toNonIndexed(), new THREE.BoxGeometry(0.3, 0.06, 10.5).toNonIndexed()]), dark);
  rotor.position.y = 1.58;
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.04), dark);
  tailRotor.position.set(-7.1, 0.5, 0.15);
  heli.add(body, stripe, canopy, boom, fin, skids, mast, rotor, tailRotor);
  heli.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(heli);

  // the helicopter's fall: the rotor spins down (its lift goes as the square of its speed), it drops, it starts to turn
  const HZ = (() => {
    const out = [], dt = 1 / 600;
    let y = 0, vy = 0, rot = 0, spin = 0;
    for (let t = 0; t <= 6.5; t += dt) {
      const w = t > 0 ? Math.exp(-t / 0.9) : 1;
      vy += -G * (1 - w * w) * dt; y += vy * dt;
      spin += (1 - w) * 0.9 * dt; rot += spin * dt * 6;
      out.push([y, rot, w]);
    }
    return out;
  })();
  const heliAt = (t) => { const i = Math.max(0, Math.min(HZ.length - 1, Math.round(Math.max(t, 0) * 600))); return HZ[i]; };

  return {
    group: g, crowd, heli, stone,
    frame(v, s, cam) {
      const t = s.t, sink = s.sink;
      g.position.y = TERR.y - sink;
      if (stone.userData.u) stone.userData.u.uDust.value = s.rock * 0.85;
      // tourists
      TOURISTS.forEach((p, i) => {
        const faceStatue = Math.atan2(-p.x, -p.z);
        const yaw = p.view ? Math.PI / 2 + (p.seed - 0.5) * 0.6 : faceStatue + (p.selfie ? Math.PI : 0) + (p.seed - 0.5) * 0.4;   // (crowd faces +z at yaw 0)
        const ear = smooth(p.react, p.react + 0.12, t) * (1 - smooth(1.6, 2.6, t));
        // floating off the falling terrace (it drops out from under them a little faster than they fall)
        const ft = Math.max(0, t - 1.9);
        const lift = 0.5 * G * 0.06 * ft * ft * (0.4 + p.drift[1]);
        const x = p.x + p.drift[0] * ft * ft * 0.3, z = p.z + p.drift[2] * ft * ft * 0.3;
        const tumble = p.spin * ft * ft * 0.25;
        const look = p.view ? 0.1 : 0.75;
        crowd.pose(i, {
          x, y: TERR.y - sink + lift, z, yaw: yaw + tumble * 0.3, s: p.s,
          armL: Math.max(ear * 1.55, smooth(1.9, 2.6, t) * 1.3, p.film ? 1.0 : 0), armR: Math.max(ear * 1.55, smooth(1.9, 2.6, t) * 1.5, p.selfie ? 1.0 : p.film ? 1.0 : 0),
          look: look * (1 - ear) - 0.4 * ear, pitch: tumble, roll: tumble * 0.5 * Math.sign(p.spin), stride: 0,
        });
      });
      crowd.commit();
      // the helicopter: circling off the east edge, then falling, turning
      const [dy, rot, w] = heliAt(t);
      const a = 0.35 + 0.22 * t;   // (story time: everything moves in slow motion)
      heli.position.set(150 + Math.cos(a) * 50, 728 + dy, -45 + Math.sin(a) * 50);
      heli.rotation.set(0.04 + (1 - w) * 0.2, -a - Math.PI / 2 + rot, (1 - w) * 0.25);
      // the rotor turns 400 rpm (slowly, in slow motion), then winds down
      const turns = t < 0 ? t : 0.9 * (1 - Math.exp(-t / 0.9));
      rotor.rotation.y = 42 * turns;
      tailRotor.rotation.z = 120 * turns;
    },
  };
}
