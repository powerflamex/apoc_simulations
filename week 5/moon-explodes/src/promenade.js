// Your side of the water: the paved deck, the wide stone steps down into the harbour, the lamps along the edge,
// benches. One patch on their materials makes them wet below the waterline (and where the splash's wave ran over the
// deck), with a line of foam where the water meets the stone. All on layer 1 (not drawn in the water's reflection).
import * as THREE from 'three';
import { EDGE_Z, STEP_H, STEP_D, STEPS, LAMPS, BENCHES } from './layout.js';

export const PU = { uLevel: { value: -2.1 }, uWet: { value: 0 }, uFloodZ: { value: -10 }, uTime: { value: 0 } };
export function wetPatch(mat, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, PU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uLevel, uWet, uFloodZ, uTime;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wetW = smoothstep(uLevel + 0.3, uLevel - 0.02, vWPos.y);
        float wetD = uWet * step(-0.05, vWPos.y) * smoothstep(uFloodZ + 1.2, uFloodZ - 0.6, vWPos.z) * (0.75 + 0.25 * sin(vWPos.x * 1.7) * sin(vWPos.z * 2.3));
        float wet = max(wetW, wetD);
        diffuseColor.rgb *= 1.0 - 0.55 * wet;
        float foam = exp(-pow((vWPos.y - uLevel) / 0.05, 2.0)) * (0.55 + 0.45 * sin(vWPos.x * 3.1 + uTime * 2.0) * sin(vWPos.x * 1.3 - uTime * 1.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8), clamp(foam, 0.0, 1.0) * 0.65);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.5, wet);');
  };
  mat.customProgramCacheKey = () => `wet-${key}`;
  return mat;
}

// granite paving: big pale tiles, dark joints, speckle
function pavingTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const N = 8, t = S / N;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const k = 150 + Math.floor(r() * 30);
    g.fillStyle = `rgb(${k - 8},${k - 8},${k - 6})`;
    g.fillRect(i * t, j * t, t, t);
  }
  for (let n = 0; n < 60000; n++) {
    const k = Math.floor(r() * 120 + 90);
    g.fillStyle = `rgba(${k},${k},${k},${0.25 + r() * 0.3})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  g.strokeStyle = 'rgba(60,58,56,0.7)'; g.lineWidth = 3;
  for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, S); g.stroke(); g.beginPath(); g.moveTo(0, i * t); g.lineTo(S, i * t); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makePromenade(scene) {
  const L1 = (m) => { m.layers.set(1); m.receiveShadow = true; scene.add(m); return m; };
  const tex = pavingTexture();
  const deckTex = tex.clone(); deckTex.needsUpdate = true; deckTex.repeat.set(400 / 6, 40 / 6);
  const deckMat = wetPatch(new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.82, metalness: 0, color: 0x9a978f }), 'deck');
  const deck = L1(new THREE.Mesh(new THREE.PlaneGeometry(400, 40).rotateX(-Math.PI / 2).translate(0, 0, EDGE_Z + 20), deckMat));
  // the steps: long stone blocks, each 0.35 m lower and 0.7 m further out
  const stepTex = tex.clone(); stepTex.needsUpdate = true; stepTex.repeat.set(400 / 6, 1.8 / 6);
  const stepMat = wetPatch(new THREE.MeshStandardMaterial({ map: stepTex, roughness: 0.78, color: 0xa9a297 }), 'step');
  for (let k = 1; k <= STEPS; k++) {
    const top = -STEP_H * k, z0 = EDGE_Z - STEP_D * k, z1 = EDGE_Z - STEP_D * (k - 1);
    const g = new THREE.BoxGeometry(400, 8 + top, STEP_D).translate(0, (top - 8) / 2, (z0 + z1) / 2);
    L1(new THREE.Mesh(g, stepMat));
  }
  // a dark stone edge band on the deck's lip
  L1(new THREE.Mesh(new THREE.BoxGeometry(400, 0.04, 0.35).translate(0, 0.0, EDGE_Z + 0.17), wetPatch(new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.7 }), 'lip')));
  // lamps: dark posts with a warm globe
  const postMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5, metalness: 0.6 });
  const postGeo = new THREE.CylinderGeometry(0.06, 0.09, 4.6, 10).translate(0, 2.3, 0);
  const posts = new THREE.InstancedMesh(postGeo, postMat, LAMPS.length);
  const globeGeo = new THREE.SphereGeometry(0.22, 16, 10);
  const globeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 1.4) });
  const globes = new THREE.InstancedMesh(globeGeo, globeMat, LAMPS.length);
  const m4 = new THREE.Matrix4();
  LAMPS.forEach((l, i) => { posts.setMatrixAt(i, m4.makeTranslation(l.x, 0, l.z)); globes.setMatrixAt(i, m4.makeTranslation(l.x, 4.75, l.z)); });
  posts.castShadow = true;
  L1(posts); L1(globes);
  // benches (behind you)
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.8 });
  const bg = new THREE.BoxGeometry(1.8, 0.08, 0.5).translate(0, 0.45, 0);
  const benches = new THREE.InstancedMesh(bg, benchMat, BENCHES.length);
  BENCHES.forEach((b, i) => benches.setMatrixAt(i, m4.makeTranslation(b.x, 0, b.z)));
  L1(benches);
  // the lamps' light on the nearest stretch (the rest is the glow)
  const lights = LAMPS.filter((l) => Math.abs(l.x) < 30).map((l) => {
    const p = new THREE.PointLight(0xffd2a8, 60, 30, 2);
    p.position.set(l.x, 4.6, l.z);
    p.layers.enableAll();
    scene.add(p);
    return p;
  });
  return {
    lights,
    frame(v, s, glows) {
      PU.uTime.value = v;
      const on = 1 - s.lampsOut;
      globeMat.color.setRGB(3.2 * on + 0.05, 2.3 * on + 0.04, 1.4 * on + 0.03);
      for (const p of lights) p.intensity = 60 * on;
      for (const l of LAMPS) glows.add(l.x, 4.75, l.z, 1.6, 1.3 * on, 0.85 * on, 0.45 * on);
    },
  };
}
