// You, up close: a jointed figure (capsule limbs, red hoodie with the hood down, jeans, white sneakers) that the
// camera follows. pose(p) takes joint angles (radians); the root is the pelvis.
import * as THREE from 'three';

export function makeHero(scene) {
  const M = (c, r = 0.75, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });
  const hoodie = M(0xc4302b, 0.85), jeans = M(0x2a3b58, 0.8), skin = M(0xc68a62, 0.6), shoe = M(0xf2f2ee, 0.5), hair = M(0x1a1410, 0.9), sole = M(0x333333, 0.9);
  const mats = [hoodie, jeans, skin, shoe, hair, sole];
  const SUNU = { uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(0, 0, 0) }, uUpV: { value: new THREE.Vector3(0, 1, 0) }, uFill: { value: 1 } };
  for (const m of mats) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, SUNU);
      sh.fragmentShader = 'uniform vec3 uSunV; uniform vec3 uSunC; uniform vec3 uUpV; uniform float uFill;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunC * max(dot(normal, uSunV), 0.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunC * 0.6 * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0) * max(dot(normal, uSunV) + 0.3, 0.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.62, 0.32) * 1.3 * uFill * max(dot(normal, -uUpV) * 0.6 + 0.4, 0.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.45, 0.6, 1.0) * 1.2 * uFill * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);`);
    };
    m.customProgramCacheKey = () => 'hero-sun';
  }
  const cap = (r, len, m) => { const g = new THREE.CapsuleGeometry(r, len, 6, 12).translate(0, -len / 2 - r * 0.2, 0); return new THREE.Mesh(g, m); };
  const root = new THREE.Group();
  scene.add(root);
  // torso (hoodie), with a pocket band and the hood bunched at the back of the neck
  const torso = new THREE.Group(); root.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.34, 6, 14).scale(1, 1, 0.72).translate(0, 0.27, 0), hoodie);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.05, 8, 16).rotateX(Math.PI / 2 - 0.3).translate(0, 0.56, -0.06), hoodie);
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.08, 4, 12).scale(1, 1, 0.75).translate(0, 0.02, 0), jeans);
  torso.add(chest, hood, hips);
  const neck = new THREE.Group(); neck.position.set(0, 0.58, 0); torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12).scale(0.92, 1.08, 1).translate(0, 0.12, 0.005), skin);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.05, 1.05).translate(0, 0.135, -0.012), hair);
  neck.add(head, hairM);
  const limb = (parent, x, y, z, r1, l1, r2, l2, m1, m2, endGeo, endM) => {
    const a = new THREE.Group(); a.position.set(x, y, z); parent.add(a);
    a.add(cap(r1, l1, m1));
    const b = new THREE.Group(); b.position.set(0, -l1 - r1 * 0.3, 0); a.add(b);
    b.add(cap(r2, l2, m2));
    const end = new THREE.Mesh(endGeo, endM); end.position.set(0, -l2 - r2 * 0.6, 0); b.add(end);
    return { a, b, end };
  };
  const handG = new THREE.SphereGeometry(0.048, 10, 8).scale(0.8, 1.2, 0.6);
  const shoeG = new THREE.BoxGeometry(0.11, 0.09, 0.27).translate(0, -0.02, 0.06);
  const armL = limb(torso, -0.21, 0.48, 0, 0.058, 0.25, 0.05, 0.23, hoodie, hoodie, handG, skin);
  const armR = limb(torso, 0.21, 0.48, 0, 0.058, 0.25, 0.05, 0.23, hoodie, hoodie, handG, skin);
  const legL = limb(root, -0.095, -0.02, 0, 0.078, 0.36, 0.062, 0.36, jeans, jeans, shoeG, shoe);
  const legR = limb(root, 0.095, -0.02, 0, 0.078, 0.36, 0.062, 0.36, jeans, jeans, shoeG, shoe);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  return {
    root, mats,
    // q: { x, y, z (feet on y), yaw, lean (forward), roll, sh: [L, R] shoulder pitch (+ forward/up), shOut: [L, R] (out to the side),
    //      el: [L, R] elbow bend, hip: [L, R] (+ forward), hipOut, knee: [L, R] (bend, +), head (+ looks down) }
    pose(q) {
      const legLen = 0.36 + 0.36 + 0.13;
      // pelvis height above the feet from the leg angles (so a crouch lowers the body)
      const hk = (h, k) => 0.36 * Math.cos(h) + 0.36 * Math.cos(h - k);
      const drop = Math.max(hk(q.hip[0], q.knee[0]), hk(q.hip[1], q.knee[1])) + 0.13;
      root.position.set(q.x, q.y + Math.min(drop, legLen) + 0.03, q.z);
      root.rotation.set(q.lean || 0, q.yaw || 0, q.roll || 0, 'YXZ');
      torso.rotation.set(q.bend || 0, 0, 0);
      neck.rotation.set(q.head || 0, 0, 0);
      const arm = (A, sh, out, el, s) => { A.a.rotation.set(-sh, 0, s * out, 'ZXY'); A.b.rotation.set(-el, 0, 0); };
      arm(armL, q.sh[0], q.shOut[0], q.el[0], -1);
      arm(armR, q.sh[1], q.shOut[1], q.el[1], 1);
      const leg = (Lg, h, k, out, s) => { Lg.a.rotation.set(-h, 0, s * out, 'ZXY'); Lg.b.rotation.set(k, 0, 0); Lg.end.rotation.set(-0.2 + (h - k) * 0.4, 0, 0); };
      leg(legL, q.hip[0], q.knee[0], q.hipOut || 0, -1);
      leg(legR, q.hip[1], q.knee[1], q.hipOut || 0, 1);
    },
    setGlow(r, g, b) { for (const m of mats) m.emissive.setRGB(r, g, b); },
    // the Sun on you (direction in view space), 0 below ~9 km where Earth still hides it
    setSun(dirView, k, upView, fill) { SUNU.uSunV.value.copy(dirView); SUNU.uSunC.value.setRGB(3.2 * k, 2.3 * k, 1.6 * k); SUNU.uUpV.value.copy(upView); SUNU.uFill.value = fill; },
  };
}
