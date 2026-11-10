// The metro tunnel the hole cuts through, 20 m under the Puerta del Sol: white tiles, a strip of lights along
// the roof, and a train stopped a few metres short of the hole, lit up, with people at the windows.
// Built in frame coordinates (y = 0 is the plaza); main.js moves the group with you.
import * as THREE from 'three';
import { rng } from './util.js';
import { RS } from './shaft.js';

export const METRO_TOP = -17.5, METRO_BOT = -22.5, METRO_HW = 2.9;

export function makeMetro() {
  const g = new THREE.Group();
  const L = 70;
  const tileMat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: RS } },
    vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vW = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uR; varying vec3 vW; varying vec3 vN;
      void main() {
        if (vW.x * vW.x + vW.z * vW.z < uR * uR) discard;          // the hole goes through floor and roof
        vec3 N = normalize(vN);
        // white tiles 0.15 m with grey grout; a blue band at waist height; a dark floor
        vec2 f = abs(N.z) > 0.5 ? vW.xy : (abs(N.y) > 0.5 ? vW.xz : vW.zy);
        vec2 tl = abs(fract(f / 0.15) - 0.5);
        float grout = smoothstep(0.43, 0.49, max(tl.x, tl.y));
        vec3 c = mix(vec3(0.86, 0.87, 0.84), vec3(0.45, 0.46, 0.45), grout);
        float yy = vW.y - (${METRO_BOT.toFixed(1)});
        if (abs(N.z) > 0.5) c = mix(c, vec3(0.1, 0.3, 0.7), step(1.0, yy) * step(yy, 1.35));
        if (N.y > 0.5) c = vec3(0.16, 0.15, 0.14) + 0.05 * step(0.5, fract(vW.x * 1.5));
        // light: the strip along the roof, and a falloff away from it
        float light = 0.55 + 0.6 * smoothstep(5.0, 0.0, abs(yy - 4.8) + abs(vW.z) * 0.3);
        if (N.y < -0.5) {
          // the roof: the light strip itself
          float strip = smoothstep(0.22, 0.12, abs(vW.z)) * step(0.3, fract(vW.x / 2.4));
          c = mix(c * 0.6, vec3(1.0, 0.98, 0.94) * 4.0, strip);
        }
        gl_FragColor = vec4(c * light, 1.0);
      }`,
  });
  const box = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tileMat);
    return m;
  };
  // walls (two long sides), floor, roof: planes facing in
  const mid = (METRO_TOP + METRO_BOT) / 2, H = METRO_TOP - METRO_BOT;
  const mk = (geo, rx, ry, x, y, z) => { const m = new THREE.Mesh(geo, tileMat); m.rotation.set(rx, ry, 0); m.position.set(x, y, z); m.updateMatrix(); m.geometry.applyMatrix4(m.matrix); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); g.add(m); return m; };
  mk(new THREE.PlaneGeometry(L * 2, H, 1, 1), 0, 0, 0, mid, -METRO_HW);                 // far wall (faces +z)
  mk(new THREE.PlaneGeometry(L * 2, H, 1, 1), 0, Math.PI, 0, mid, METRO_HW);            // near wall (faces -z)
  mk(new THREE.PlaneGeometry(L * 2, METRO_HW * 2, 64, 8), -Math.PI / 2, 0, 0, METRO_BOT, 0);   // floor
  mk(new THREE.PlaneGeometry(L * 2, METRO_HW * 2, 64, 8), Math.PI / 2, 0, 0, METRO_TOP, 0);    // roof
  // rails
  const railMat = new THREE.MeshBasicMaterial({ color: 0x8a8d92 });
  for (const z of [-0.72, 0.72]) {
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(L - RS, 0.12, 0.07), railMat);
      r.position.set(sx * (RS + (L - RS) / 2), METRO_BOT + 0.06, z);
      g.add(r);
    }
  }

  // the train: stopped with its nose 1.2 m from the hole, on the +x side
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  const R = rng(5);
  x.fillStyle = '#e9ecef'; x.fillRect(0, 0, 1024, 128);
  x.fillStyle = '#1c4fa0'; x.fillRect(0, 92, 1024, 14);
  for (let i = 0; i < 16; i++) {
    const wx = 14 + i * 63;
    x.fillStyle = '#fff1d2'; x.fillRect(wx, 20, 50, 58);
    // people inside: a head and shoulders in some windows, looking out
    if (R() < 0.75) {
      const px = wx + 10 + R() * 30;
      x.fillStyle = ['#3b2a20', '#1c1c1c', '#6b4a2a', '#2c3e50'][Math.floor(R() * 4)];
      x.beginPath(); x.ellipse(px, 62, 13, 16, 0, Math.PI, 0); x.fill();
      x.fillRect(px - 13, 62, 26, 16);
      x.fillStyle = ['#e0ac86', '#c68a62', '#f1c8a6', '#9a6440'][Math.floor(R() * 4)];
      x.beginPath(); x.arc(px, 42, 8, 0, Math.PI * 2); x.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const trainMat = new THREE.MeshBasicMaterial({ map: tex });
  trainMat.color.setRGB(1.6, 1.6, 1.6);
  const TL = 40, TW = 2.7, TH = 3.2;
  const grey = (c) => new THREE.MeshBasicMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(TL, TH, TW), [grey(0xd8dde2), grey(0x2a2c30), grey(0x6a6e74), grey(0x2a2c30), trainMat, trainMat]);
  body.position.set(-(RS + 1.2 + TL / 2), METRO_BOT + 0.35 + TH / 2, 0);
  g.add(body);
  // its nose: a windscreen and two headlights facing the hole
  const nose = new THREE.Mesh(new THREE.PlaneGeometry(TW * 0.8, 1.1), new THREE.MeshBasicMaterial({ color: 0x25323f }));
  nose.rotation.y = Math.PI / 2;
  nose.position.set(-(RS + 1.19), METRO_BOT + 0.35 + TH * 0.68, 0);
  g.add(nose);
  for (const z of [-0.85, 0.85]) {
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.material.color.setRGB(8, 7.5, 6.5);
    hl.rotation.y = Math.PI / 2;
    hl.position.set(-(RS + 1.18), METRO_BOT + 0.9, z);
    g.add(hl);
  }
  return { group: g };
}
