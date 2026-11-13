// A house dust mite, ~330 µm long, built in micrometres (+z forward, y up, origin on the ground under its middle):
// a pale, wrinkled, bag-like body, a small head with mouthparts, eight bristly legs (two pairs reaching forward,
// two back) that paddle as it crawls, and long bristles trailing off its back.
import * as THREE from 'three';
import { procMat, ellipsoid, tube } from './mats.js';
import { lerp } from './util.js';

export function makeMite() {
  const skin = procMat({ color: 0xeadcc0, rough: 0.45, physical: { clearcoat: 0.4, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: new THREE.Color(1, 0.95, 0.85) },
    // fingerprint-like grooves running round the body
    col: `float g = sin(length(vOP.xz * vec2(1.0, 0.75)) * 0.55 + vOP.y * 0.12 + 3.0 * n3(vOP * 0.02)); c *= 0.86 + 0.14 * g;
          c = mix(c, vec3(0.85, 0.7, 0.5), smoothstep(0.55, 0.85, fbm3(vOP * 0.015)) * 0.4);`,
    height: 'sin(length(vOP.xz * vec2(1.0, 0.75)) * 0.55 + vOP.y * 0.12 + 3.0 * n3(vOP * 0.02))', bump: 0.8,
    emis: `e += diffuseColor.rgb * 0.08;` });
  const legM = procMat({ color: 0xd9b98a, rough: 0.5, col: `c *= 0.85 + 0.25 * sin(vOP.y * 0.4 + vOP.x * 0.3);` });
  const hairM = new THREE.MeshStandardMaterial({ color: 0xc9a57a, roughness: 0.6 });
  const G = new THREE.Group();
  const body = new THREE.Group();
  G.add(body);
  body.add(new THREE.Mesh(ellipsoid(98, 72, 140, 40).translate(0, 105, -25), skin));            // the bag
  body.add(new THREE.Mesh(ellipsoid(78, 58, 62, 32).translate(0, 100, 85), skin));             // front shield
  body.add(new THREE.Mesh(ellipsoid(26, 22, 34, 18).translate(0, 82, 150), legM));            // head / mouthparts
  for (const sx of [-1, 1]) body.add(new THREE.Mesh(tube([[sx * 10, 82, 168], [sx * 14, 78, 186], [sx * 9, 70, 198]], (t) => 7 * (1 - 0.6 * t), 10, 6), legM));
  // long bristles off the back, and short ones over the body
  const hairs = [];
  for (const [x, z, len, a] of [[-40, -150, 230, -0.3], [40, -150, 230, 0.3], [-60, -120, 160, -0.7], [60, -120, 160, 0.7], [-70, 60, 120, -1.0], [70, 60, 120, 1.0], [-30, 100, 90, -0.4], [30, 100, 90, 0.4]]) {
    const p0 = new THREE.Vector3(x, 150, z);
    const dir = new THREE.Vector3(Math.sin(a) * 0.6, 0.35, z < 0 ? -1 : 0.6).normalize();
    hairs.push(tube([p0, p0.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, 12, 0)), p0.clone().addScaledVector(dir, len)], (t) => 2.6 * (1 - 0.8 * t), 10, 5));
  }
  for (const g of hairs) body.add(new THREE.Mesh(g, hairM));
  // legs: [attach x, z, direction angle (rad, 0 = forward), length]
  const LEGS = [[55, 120, 0.55, 190], [62, 70, 1.05, 180], [62, -60, 2.2, 175], [52, -120, 2.65, 185]];
  const legs = [];
  for (const [ax, az, ang, len] of LEGS) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), legM);
    body.add(m);
    legs.push({ ax: ax * sx, az, ang, len, sx, m, ph: (legs.length * 0.37) % 1 });
  }
  G.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  return {
    group: G,
    pose(v, walk) {
      body.position.y = 4 * Math.sin(walk * 6.28 * 2);
      for (const L of legs) {
        const ph = walk * 6.28 + L.ph * 6.28 + (L.sx > 0 ? Math.PI : 0);
        const a = L.ang + 0.22 * Math.sin(ph);
        const dx = Math.sin(a) * L.sx, dz = Math.cos(a);
        const lift = Math.max(0, Math.cos(ph)) * 30;
        const r0 = new THREE.Vector3(L.ax, 92, L.az);
        const k1 = r0.clone().add(new THREE.Vector3(dx * L.len * 0.35, 55 + lift * 0.5, dz * L.len * 0.35));
        const k2 = r0.clone().add(new THREE.Vector3(dx * L.len * 0.7, 30 + lift, dz * L.len * 0.7));
        const ft = r0.clone().add(new THREE.Vector3(dx * L.len, -88 + lift * 0.6, dz * L.len));
        L.m.geometry.dispose();
        L.m.geometry = tube([r0, k1, k2, ft], (t) => lerp(15, 6, t), 18, 7);
      }
    },
  };
}
