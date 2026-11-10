// A cancer ward (a cutaway: the thing you're thinking about). Four beds; the patients are thin and still, the heart
// monitors beep slowly, a mother sits holding her son's hand, a man stands at the window with his head down. Cold
// light, rain on the window. Then (after the cure) the same ward: warm light, the monitors steady, the boy sits up and
// his mother stands with her arms up. Its own scene and camera; pure function of (part, u, v).
import * as THREE from 'three';
import { makeCrowd } from './crowd.js';
import { smooth, lerp, clamp } from './util.js';

export function makeHospital() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 100);
  camera.rotation.order = 'YXZ';
  const std = (c, r = 0.7, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o });
  // the room: x -6..6, z -9..3, 3 m high
  const wall = std(0xc9d3d6), floor = std(0x8e9a9c, 0.4), ceil = std(0xe8ecec);
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.receiveShadow = true; scene.add(b); return b; };
  box(12, 0.1, 12, floor, 0, -0.05, -3);
  box(12, 0.1, 12, ceil, 0, 3.05, -3);
  box(0.1, 3, 12, wall, -6, 1.5, -3); box(0.1, 3, 12, wall, 6, 1.5, -3);
  box(12, 3, 0.1, wall, 0, 1.5, -9); box(12, 3, 0.1, wall, 0, 1.5, 3);
  // the window at the end, dark with rain
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.12, 0.2) });
  box(3.2, 1.6, 0.05, winMat, 0, 1.7, -8.92);
  // ceiling light panels
  const lightPanel = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.0) });
  for (const z of [-7, -3.5, 0]) box(1.2, 0.04, 0.6, lightPanel, 0, 2.98, z);
  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x404850, 0.9);
  const lamps = [-7, -3.5, 0].map((z) => { const l = new THREE.PointLight(0xdfeeff, 6, 9); l.position.set(0, 2.8, z); scene.add(l); return l; });
  scene.add(hemi);
  // beds, IV stands, monitors
  const BEDS = [[-1, -1.2], [-1, -5.2], [1, -1.2], [1, -5.2]];    // [side (-1 left wall, +1 right), z]
  const sheet = std(0xdfe6ea, 0.9), frame = std(0x9aa3a8, 0.4, { metalness: 0.5 }), dark = std(0x1c2024, 0.5);
  const monitors = [];
  for (const [side, z] of BEDS) {
    const hx = side * 5.0;           // head end against the wall
    box(2.1, 0.12, 1.0, sheet, side * 3.95, 0.62, z);
    box(2.1, 0.06, 1.0, frame, side * 3.95, 0.5, z);
    box(0.06, 0.9, 1.0, frame, hx + side * 0.05, 0.75, z);
    for (const dz of [-0.45, 0.45]) for (const dx of [-0.95, 0.95]) box(0.05, 0.5, 0.05, frame, side * 3.95 + dx, 0.25, z + dz);
    box(0.5, 0.25, 0.8, sheet, hx - side * 0.35, 0.74, z);   // pillow
    // IV stand
    box(0.03, 1.9, 0.03, frame, hx - side * 0.5, 0.95, z + 0.75);
    box(0.18, 0.28, 0.06, std(0xcfe8ff, 0.2, { transparent: true, opacity: 0.7 }), hx - side * 0.5, 1.8, z + 0.75);
    // the monitor on its arm: a canvas screen with the heart trace
    const c = document.createElement('canvas'); c.width = 256; c.height = 150;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6) }));
    box(0.62, 0.4, 0.08, dark, hx - side * 0.2, 1.75, z - 0.75);
    scr.position.set(hx - side * 0.2 - side * 0.05, 1.75, z - 0.75);
    scr.rotation.y = -side * Math.PI / 2;
    scene.add(scr);
    monitors.push({ c, g: c.getContext('2d'), tex, phase: z * 1.3 + side });
  }
  // the people: four patients, a mother on a chair, a man at the window
  const crowd = makeCrowd(scene, 6, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
  const gown = 0xa9c6dc, skin = 0xe7cbb6;
  for (let i = 0; i < 4; i++) crowd.color(i, gown, gown, skin, i === 0 ? skin : 0x3a2a20);
  crowd.color(4, 0x7a4a5e, 0x2c3e50, 0xe0ac86, 0x2e2018);
  crowd.color(5, 0x34495e, 0x1b2631, 0xc68a62, 0x151515);
  box(0.45, 0.45, 0.45, std(0x5a6a70), -3.8, 0.22, -0.15);    // the mother's chair, beside the boy's bed
  const out = {
    scene, camera,
    // part: 'sick' or 'cured'; u: 0..1 through it; v: the video clock
    frame(part, u, v) {
      const cured = part === 'cured' ? 1 : 0;
      const warm = cured * smooth(0, 0.35, u);
      hemi.color.setRGB(0.87, 0.91, 0.94).lerp(new THREE.Color(1.0, 0.86, 0.7), warm);
      hemi.intensity = lerp(0.75, 1.15, warm);
      for (const l of lamps) l.color.setRGB(0.87, 0.93, 1.0).lerp(new THREE.Color(1.0, 0.85, 0.65), warm);
      winMat.color.setRGB(0.08, 0.12, 0.2).lerp(new THREE.Color(0.9, 0.7, 0.45), warm);
      // monitors: slow, weak beats (red alarm) -> strong, steady (green)
      for (const m of monitors) {
        const g = m.g;
        g.fillStyle = '#05080a'; g.fillRect(0, 0, 256, 150);
        const bpm = cured ? 72 : 38, amp = cured ? 1 : 0.35, col = cured ? '#58ff8a' : '#ff5a4a';
        g.strokeStyle = col; g.lineWidth = 3; g.beginPath();
        for (let x = 0; x < 256; x++) {
          const t = v * 1.4 + m.phase - (256 - x) / 256 * 2.2;
          const ph = ((t * bpm / 60) % 1 + 1) % 1;
          const y = 85 - amp * (ph < 0.06 ? Math.sin(ph / 0.06 * Math.PI) * 55 : ph < 0.1 ? -Math.sin((ph - 0.06) / 0.04 * Math.PI) * 15 : Math.sin(ph * 12) * 2);
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
        g.fillStyle = col; g.font = 'bold 30px Arial'; g.fillText(cured ? '72' : '38', 190, 38);
        if (!cured && Math.floor(v * 2) % 2) { g.fillStyle = '#ff5a4a'; g.fillRect(10, 12, 30, 30); }
        m.tex.needsUpdate = true;
      }
      // patients lying still; after the cure the boy (bed 0) sits up
      BEDS.forEach(([side, z], i) => {
        const fx = side * 2.95;      // feet end
        const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        const up = i === 0 ? cured * smooth(0.2, 0.55, u) : 0;
        crowd.pose(i, {
          x: lerp(fx, fx + side * 1.0, up), y: lerp(0.72, 0.28, up), z, yaw: side < 0 ? yaw : yaw,
          pitch: lerp(-Math.PI / 2, -0.05, up), sit: up, s: i === 0 ? 0.78 : 0.95, armL: 0.05 + 0.5 * up, armR: 0.05 + 0.5 * up,
          look: 0.1 * Math.sin(v * 0.4 + i) * (1 - up) + 0.25 * up,
        });
      });
      // the mother: sitting, holding his hand; then standing, arms up
      const st = cured * smooth(0.35, 0.6, u);
      crowd.pose(4, { x: -3.8, y: 0, z: -0.15 + 0.15 * st, yaw: Math.PI, sit: 1 - st, armL: lerp(0.4, 1.6, st), armR: lerp(0.75, 1.6, st), look: lerp(-0.35, 0.2, st), pitch: lerp(0.18, 0, st) });
      crowd.pose(5, { x: 1.2, y: 0, z: -8.3, yaw: Math.PI + 0.2 * cured, look: lerp(-0.45, 0.15, cured * smooth(0.4, 0.7, u)), armL: 0.1, armR: 0.1 });
      crowd.commit();
      // the camera: down the aisle past the beds
      // (from beside the boy's bed, toward his head on the pillow and the monitor)
      if (!cured) { camera.position.set(lerp(-2.0, -2.5, u), lerp(1.75, 1.6, u), lerp(0.9, 0.6, u)); camera.lookAt(-4.3, 0.75, -1.2); }
      else { camera.position.set(-2.3, 1.6, 0.8); camera.lookAt(-4.0, 1.0, -1.1); }
      camera.fov = 48;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },
  };
  return out;
}
