// The red Canal Street streetcar, stopped on the right-hand track ahead of you: a long red body with a band of windows,
// cream window frames, a pale clerestory roof and a trolley pole up to the wire. It rocks on its trucks in the quake and
// catches fire with the cars.
import * as THREE from 'three';
import { STREETCAR, groundY } from './layout.js';

export function makeStreetcar(scene, ctx) {
  const { plainMat, shadowy } = ctx;
  const g = new THREE.Group();
  const L = STREETCAR.len, W = 2.6;
  const red = plainMat(0xb81e1e, 0.55), cream = plainMat(0xeadfc4, 0.6), dark = plainMat(0x1a1e22, 0.2, { metalness: 0.3 }), grey = plainMat(0x3a3a3c, 0.8);
  const box = (w, h, d, m, x, y, z) => { const b = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)); b.position.set(x, y, z); g.add(b); return b; };
  box(W, 1.15, L, red, 0, 0.55 + 0.58, 0);                 // the lower body
  box(W * 0.98, 1.0, L * 0.995, dark, 0, 1.7 + 0.5, 0);      // the window band (glass)
  for (let k = 0; k <= 12; k++) box(W * 1.005, 1.0, 0.16, cream, 0, 2.2, -L / 2 + 0.1 + k * (L - 0.2) / 12);   // window posts
  box(W * 1.01, 0.12, L, cream, 0, 1.72, 0);                 // the sill line
  box(W, 0.3, L, red, 0, 2.85, 0);                           // over the windows
  box(W * 0.94, 0.22, L * 0.98, cream, 0, 3.1, 0);           // the roof
  box(W * 0.5, 0.35, L * 0.7, cream, 0, 3.35, 0);            // the clerestory
  box(W * 0.9, 0.5, 2.2, grey, 0, 0.3, -L / 2 + 2.0);        // the trucks
  box(W * 0.9, 0.5, 2.2, grey, 0, 0.3, L / 2 - 2.0);
  const pole = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.2, 6), grey));
  pole.position.set(0, 4.8, 3.0); pole.rotation.x = -0.75; g.add(pole);
  // the destination sign over the front window
  box(1.4, 0.3, 0.05, plainMat(0x111111, 0.4, { emissive: new THREE.Color(1.0, 0.75, 0.25), emissiveIntensity: 0.8 }), 0, 2.85, -L / 2 - 0.03);
  const gy = groundY(STREETCAR.z);
  g.position.set(STREETCAR.x, gy + 0.1, STREETCAR.z);
  // (the street slopes down toward the river: it sits on the slope)
  g.rotation.x = Math.atan((groundY(STREETCAR.z - 1) - groundY(STREETCAR.z + 1)) / 2);
  const rx0 = g.rotation.x;
  scene.add(g);
  return {
    g,
    frame(v, s) {
      g.rotation.z = s.quake * 0.025 * Math.sin(v * 9.0);
      g.rotation.x = rx0 + s.quake * 0.008 * Math.sin(v * 13.0 + 1.0);
    },
  };
}
