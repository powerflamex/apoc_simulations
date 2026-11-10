// NASA's Galileo probe (descent module, Dec 7, 1995): a squat gold-foil drum about 0.9 m across under its
// 2.5 m parachute, crushed and silent 150 km down. You overtake it in the dark; your helmet lamp lights it.
import * as THREE from 'three';

export function makeProbe() {
  const g = new THREE.Group();
  const C = { uCrush: { value: 0 } };
  const crushPatch = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCrush = C.uCrush;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uCrush;
          float ph(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 cell = floor(transformed * 9.0);
          transformed *= 1.0 - uCrush * (0.08 + 0.18 * ph(cell));
          transformed.y *= 1.0 - 0.25 * uCrush;`);
    };
    return mat;
  };
  const foil = crushPatch(new THREE.MeshStandardMaterial({ color: 0xc9923a, roughness: 0.55, metalness: 0.8 }));
  const black = crushPatch(new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.7 }));
  const metal = crushPatch(new THREE.MeshStandardMaterial({ color: 0xa8acb2, roughness: 0.6, metalness: 0.9 }));
  // the drum
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.46, 28, 4), foil);
  g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.44, 0.14, 28), metal);
  top.position.y = 0.3;
  g.add(top);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.1, 28), black);
  bottom.position.y = -0.28;
  g.add(bottom);
  for (let i = 0; i < 4; i++) {   // instrument ports and a stub antenna
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), black);
    const a = i * Math.PI / 2 + 0.4;
    b.position.set(Math.cos(a) * 0.43, 0.02, Math.sin(a) * 0.43);
    b.rotation.y = -a;
    g.add(b);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), metal);
  ant.position.set(0.12, 0.5, 0.05);
  g.add(ant);
  // the parachute: a torn canopy on its lines, collapsing
  const chute = new THREE.Group();
  chute.position.y = 1.9;
  g.add(chute);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.85, side: THREE.DoubleSide });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xc8501e, roughness: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(1.25, 4, 8, (i / 12) * Math.PI * 2, Math.PI * 2 / 12, 0, Math.PI * 0.42), i % 2 ? canopyMat : stripeMat);
    if (i === 7) continue;   // a torn panel
    chute.add(seg);
  }
  chute.scale.set(1, 0.6, 1);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x9a968e });
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.95, 1.9 + 0.2, Math.sin(a) * 0.95), new THREE.Vector3(Math.cos(a) * 0.2, 0.36, Math.sin(a) * 0.2));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  function frame(v, s, V_PROBE) {
    g.visible = s.probe > 0.001;
    if (!g.visible) return;
    const k = v - V_PROBE;
    // it sinks slower than you: you come down past it (it rises through your view), tumbling slowly
    g.position.set(0.9 - k * 0.03, -3.8 + k * 0.6, -4.6 + k * 0.04);
    g.rotation.set(0.35 + 0.04 * Math.sin(v * 0.7), v * 0.18, -0.2 + 0.05 * Math.sin(v * 0.5));
    C.uCrush.value = 0.7 + 0.15 * Math.min(1, Math.max(0, k / 6));
    chute.rotation.set(0.25 * Math.sin(v * 0.4), 0, 0.15);
    chute.scale.set(0.75 + 0.06 * Math.sin(v * 0.9), 0.5, 0.68);
  }
  return { group: g, frame };
}
