// The time-and-temperature sign in the plaza (a bank-style LED board on a pole, turned to face you): "12:00" (it's noon
// every day in the time-lapse) over the temperature, the same number as the line under the counter. When the power fails it
// goes dark; past 600°F its aluminium wings sag (the panel's vertices bend down from the pole, worked out on the CPU).
import * as THREE from 'three';
import { SIGN, CAM0, groundY } from './layout.js';

export function makeSign(scene, ctx) {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 352;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  let shown = null;
  const draw = (top, bot, on) => {
    const key = `${top}|${bot}|${on}`;
    if (key === shown) return;
    shown = key;
    g.fillStyle = '#050403'; g.fillRect(0, 0, cv.width, cv.height);
    if (on) {
      g.fillStyle = '#ffb21e'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 118px "Courier New", monospace'; g.fillText(top, 320, 92);
      g.font = '700 150px "Courier New", monospace'; g.fillText(bot, 320, 252);
      // the LED grid: dark gaps between the dots
      g.fillStyle = 'rgba(5,4,3,0.62)';
      for (let x = 0; x < cv.width; x += 8) g.fillRect(x, 0, 3, cv.height);
      for (let y = 0; y < cv.height; y += 8) g.fillRect(0, y, cv.width, 3);
    }
    tex.needsUpdate = true;
  };
  const { x, z, h, w, ph } = SIGN;
  const gy = groundY(z);
  const yaw = Math.atan2(CAM0.x - x, CAM0.z - z);            // the board faces you
  const grp = new THREE.Group();
  grp.position.set(x, gy, z); grp.rotation.y = yaw;
  scene.add(grp);
  const metal = ctx.plainMat(0x2c2f34, 0.5, { metalness: 0.5 }, { burnK: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, h, 10).translate(0, h / 2, 0), metal);
  pole.castShadow = true;
  grp.add(pole);
  const caseGeo = new THREE.BoxGeometry(w + 0.24, ph + 0.24, 0.28, 24, 6, 1);
  const faceGeo = new THREE.PlaneGeometry(w, ph, 24, 6);
  const caseM = new THREE.Mesh(caseGeo, metal);
  const faceM = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: true }));
  caseM.castShadow = true; caseM.receiveShadow = true;
  const panel = new THREE.Group();
  panel.position.y = h + ph / 2 + 0.05;
  panel.add(caseM, faceM);
  faceM.position.z = 0.145;
  grp.add(panel);
  const base = [caseGeo, faceGeo].map((geo) => geo.attributes.position.array.slice());
  const bend = (sag) => {
    [caseGeo, faceGeo].forEach((geo, k) => {
      const a = geo.attributes.position.array, b = base[k];
      for (let i = 0; i < a.length; i += 3) {
        const u = b[i] / (w / 2);                                   // -1 .. 1 from the pole
        const droop = sag * (0.95 * u * u + 0.2 * Math.abs(u)) * (1 + 0.3 * Math.sign(u));
        a[i] = b[i] * (1 - 0.06 * sag * u * u);
        a[i + 1] = b[i + 1] - droop - 0.12 * sag * Math.abs(u) * b[i + 1];
        a[i + 2] = b[i + 2] + 0.15 * sag * u * u;
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    });
  };
  return {
    frame(v, s, F, power) {
      draw('12:00', `${Math.round(F)}°F`, power > 0.5);
      faceM.material.color.setScalar(1.6 * Math.max(power, 0.25));
      bend(s.sag);
      panel.rotation.x = 0.3 * s.sag; panel.rotation.z = -0.12 * s.sag;
    },
  };
}
