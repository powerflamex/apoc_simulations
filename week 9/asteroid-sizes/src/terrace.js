// The hilltop terrace: pale stone paving on a top level, four wide steps down, a lower level out to a railing of glass
// panels between steel posts (they burst when the house-size rock's boom reaches you), two old lamp posts, coin-operated
// binoculars at the railing, stone planters with trees at the sides, low stone walls at the ends.
import * as THREE from 'three';
import { HILL, STEP_H, STEP_D, N_STEPS, TOP_Z, LOW_Y, LOW_Z0, RAIL_Z, TER_X } from './layout.js';

function pavingTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#b9b1a4'; g.fillRect(0, 0, 512, 512);
  // stone slabs in running bond, each a slightly different shade
  const rows = 8, h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const w = 512 / 4, off = (r % 2) * w / 2;
    for (let c = -1; c < 5; c++) {
      const x = c * w + off;
      const k = 0.88 + 0.16 * Math.abs(Math.sin(r * 12.9 + c * 78.2) * 43758.5 % 1);
      const sh = Math.round(178 * k), sg = Math.round(170 * k), sb = Math.round(158 * k);
      g.fillStyle = `rgb(${sh},${sg},${sb})`;
      g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
    }
  }
  // speckle
  for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '60,55,50' : '230,225,215'},${0.06 + Math.random() * 0.08})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeTerrace(scene) {
  const tex = pavingTexture();
  const stone = (rx, rz) => { const t = tex.clone(); t.repeat.set(rx, rz); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); };
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const g = new THREE.Group();
  scene.add(g);
  const W = TER_X * 2;
  // the top level and the steps (each a slab whose front edge is the riser)
  const top = shadowy(new THREE.Mesh(new THREE.BoxGeometry(W, 4, 14), stone(W / 6, 14 / 6)));
  top.position.set(0, HILL - 2, TOP_Z + 7);
  g.add(top);
  for (let k = 1; k <= N_STEPS; k++) {
    const y = HILL - STEP_H * k;
    const s = shadowy(new THREE.Mesh(new THREE.BoxGeometry(W, 4, STEP_D), stone(W / 6, STEP_D / 6)));
    s.position.set(0, y - 2, TOP_Z - STEP_D * (k - 0.5));
    g.add(s);
  }
  const lowD = LOW_Z0 - RAIL_Z;
  const low = shadowy(new THREE.Mesh(new THREE.BoxGeometry(W, 6, lowD + 0.6), stone(W / 6, lowD / 6)));
  low.position.set(0, LOW_Y - 3, (LOW_Z0 + RAIL_Z) / 2 - 0.3);
  g.add(low);
  // the low walls at the ends and the edge over the drop
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9c9284, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const w = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 34), wallMat));
    w.position.set(sx * (TER_X + 0.3), LOW_Y + 0.5, -8);
    g.add(w);
  }
  const lip = shadowy(new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.35, 0.6), wallMat));
  lip.position.set(0, LOW_Y + 0.17, RAIL_Z - 0.3);
  g.add(lip);
  // the railing: steel posts, a top rail, glass panels
  const steel = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.45, metalness: 0.6 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.15, 0.08).translate(0, 0.575, 0), steel, Math.floor(W / 2) + 1);
  const PANELS = [];
  for (let k = 0; k <= Math.floor(W / 2); k++) {
    const x = -TER_X + k * 2;
    posts.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, LOW_Y + 0.35, RAIL_Z - 0.3));
    if (k < Math.floor(W / 2)) PANELS.push({ x: x + 1, y: LOW_Y + 0.35 + 0.55, z: RAIL_Z - 0.3 });
  }
  posts.castShadow = true;
  g.add(posts);
  const rail = shadowy(new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, 0.12), steel));
  rail.position.set(0, LOW_Y + 0.35 + 1.15, RAIL_Z - 0.3);
  g.add(rail);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe6f0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
  const glass = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.9, 1.0), glassMat, PANELS.length);
  PANELS.forEach((p, i) => glass.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  glass.renderOrder = 3;
  g.add(glass);
  // lamp posts: dark iron, a white globe
  const iron = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.4 });
  const globeMat = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.3, emissive: 0x302820 });
  const LAMPS = [[-11.5, -9.5], [12.5, -10.5], [-25, RAIL_Z + 1.2], [27, RAIL_Z + 1.2]];
  for (const [x, z] of LAMPS) {
    const y0 = z <= LOW_Z0 ? LOW_Y : HILL - STEP_H * Math.ceil((TOP_Z - z) / STEP_D);
    const pole = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 4.2, 10).translate(0, 2.1, 0), iron));
    pole.position.set(x, y0, z);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), globeMat);
    globe.position.set(x, y0 + 4.45, z); globe.castShadow = true;
    g.add(pole, globe);
  }
  // coin-operated binoculars at the railing
  const viewMat = new THREE.MeshStandardMaterial({ color: 0x3b6b4c, roughness: 0.5, metalness: 0.5 });
  for (const x of [-7.5, 4.5, 16]) {
    const z = RAIL_Z + 0.9;
    const post = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.15, 10).translate(0, 0.575, 0), viewMat));
    post.position.set(x, LOW_Y, z);
    const body = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.55), viewMat));
    body.position.set(x, LOW_Y + 1.32, z); body.rotation.x = 0.18;
    const eyes = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8).rotateX(Math.PI / 2), viewMat));
    eyes.position.set(x, LOW_Y + 1.36, z + 0.36);
    g.add(post, body, eyes);
  }
  // stone planters with trees at the sides of the steps
  const potMat = new THREE.MeshStandardMaterial({ color: 0xa79d8d, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f5f2a, roughness: 0.95 });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 });
  for (const [x, z] of [[-21, -7.5], [22, -6.5], [-31, -18], [31, -19]]) {
    const y0 = z <= LOW_Z0 ? LOW_Y : HILL - STEP_H * Math.ceil((TOP_Z - z) / STEP_D);
    const pot = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), potMat));
    pot.position.set(x, y0 + 0.4, z);
    const trunk = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 8).translate(0, 1.3, 0), barkMat));
    trunk.position.set(x, y0 + 0.8, z);
    const crown = shadowy(new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), leafMat));
    crown.position.set(x, y0 + 4.1, z); crown.scale.set(1, 0.85, 1);
    g.add(pot, trunk, crown);
  }
  return { group: g, glass, glassMat, PANELS };
}
