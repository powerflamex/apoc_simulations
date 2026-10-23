// The observatory on the ridge: the stone terrace you stand on with its low parapet, lamps on posts and a coin
// telescope at the railing; at its right end the observatory itself, a pale block with a copper dome and a small
// domed tower in front.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TERRACE, OBS, SCOPE, LAMPS } from './layout.js';
import { patch } from './fx.js';

const PAVERS = /* glsl */ `
{
  vec2 t = vFxW.xz / vec2(1.2, 0.9);
  vec2 f = abs(fract(t) - 0.5);
  vec2 w = fwidth(t) * 1.2;
  float joint = 1.0 - smoothstep(0.47 - w.x, 0.5, max(f.x, f.y));
  float h = fxh2(floor(t) + 5.0);
  if (vFxN.y > 0.5) diffuseColor.rgb *= mix(0.62, 0.93 + 0.14 * h, joint);
}`;

export function makeTerrace(scene) {
  const T = TERRACE, O = OBS;
  const stone = patch(new THREE.MeshStandardMaterial({ color: 0xb3a994, roughness: 0.85 }), 'stone-v1', { color: PAVERS, scale: 0.6 });
  const wall = patch(new THREE.MeshStandardMaterial({ color: 0xd2cabb, roughness: 0.8 }), 'wall-v2', { scale: 0.4 });
  const copper = patch(new THREE.MeshStandardMaterial({ color: 0x3c4a44, roughness: 0.38, metalness: 0.65 }), 'copper-v1', { scale: 0.5, snowSide: 0.5 });
  const metal = patch(new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.45, metalness: 0.5 }), 'metal-v1', { scale: 1.5 });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  // the terrace floor
  add(box(T.x0 - 0.4, T.x1 + 2, -2.2, 0, T.z0, T.z1), stone);
  // the parapet along the front and the left end, with a cap and short pillars
  const par = [box(T.x0, T.x1, 0, 0.98, T.z0, T.z0 + 0.32), box(T.x0, T.x0 + 0.32, 0, 0.98, T.z0, T.z1)];
  par.push(box(T.x0 - 0.05, T.x1, 0.98, 1.08, T.z0 - 0.06, T.z0 + 0.38), box(T.x0 - 0.06, T.x0 + 0.38, 0.98, 1.08, T.z0, T.z1));
  for (let x = T.x0 + 3; x < T.x1; x += 4.5) par.push(box(x - 0.24, x + 0.24, 0, 1.22, T.z0 - 0.04, T.z0 + 0.36));
  // a retaining wall dropping from the front of the terrace down the slope
  par.push(box(T.x0 - 0.4, T.x1 + 2, -9, -2.2, T.z0 - 0.2, T.z0 + 0.6));
  add(mergeGeometries(par), wall);

  // the observatory: the main block, a drum and the big dome; a domed tower in front; pilasters on the facades
  const ob = [box(O.x0, O.x1, O.base, O.h, O.z0 + 6, O.z1)];
  ob.push(box(O.x0 + 4, O.x1 - 4, O.h, O.h + 1.2, O.z0 + 9, O.z1 - 3));
  for (let x = O.x0 + 1.5; x < O.x1; x += 3.2) ob.push(box(x - 0.35, x + 0.35, O.base, O.h - 0.4, O.z0 + 5.7, O.z0 + 6.1));
  ob.push(new THREE.CylinderGeometry(O.dome.r + 0.6, O.dome.r + 0.6, 3.2, 48).translate(O.dome.x, O.h + 1.6, O.dome.z));
  ob.push(new THREE.CylinderGeometry(O.tower.r, O.tower.r, O.tower.h - O.base, 32).translate(O.tower.x, (O.tower.h + O.base) / 2, O.tower.z));
  ob.push(box(O.tower.x - 0.3, O.x0 + 6, O.base, 6, O.tower.z - 1.6, O.tower.z + 1.6));   // a wing joining it to the block
  add(mergeGeometries(ob.map((g) => g.index ? g.toNonIndexed() : g)), wall);
  add(new THREE.SphereGeometry(O.dome.r, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2).translate(O.dome.x, O.h + 3.2, O.dome.z), copper);
  add(new THREE.SphereGeometry(O.tower.r * 0.96, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(O.tower.x, O.tower.h + 1.1, O.tower.z), copper);
  // its windows and doors: dark glass, warm at night
  const glassMat = patch(new THREE.MeshStandardMaterial({ color: 0x0d1012, roughness: 0.15, metalness: 0.3 }), 'obsglass-v1', {
    emissive: 'totalEmissiveRadiance += vec3(1.0, 0.68, 0.38) * 0.9 * uLit * (1.0 - step(0.5, uSnow));', scale: 0.5,
  });
  const gl = [];
  for (let x = O.x0 + 3.1; x < O.x1 - 1; x += 3.2) gl.push(box(x - 0.9, x + 0.9, 1.2, 4.6, O.z0 + 5.94, O.z0 + 6.0), box(x - 0.9, x + 0.9, 6.4, 10.2, O.z0 + 5.94, O.z0 + 6.0));
  add(mergeGeometries(gl), glassMat);

  // the coin telescope at the railing
  {
    const g = [new THREE.CylinderGeometry(0.07, 0.11, 1.05, 12).translate(0, 0.52, 0)];
    g.push(new THREE.CylinderGeometry(0.13, 0.13, 0.55, 16).rotateX(Math.PI / 2 - 0.25).translate(0, 1.2, -0.05));
    g.push(new THREE.BoxGeometry(0.22, 0.24, 0.26).translate(0, 1.13, 0.12));
    const m = add(mergeGeometries(g.map((x) => x.toNonIndexed())), metal);
    m.position.set(SCOPE.x, 0, SCOPE.z + 0.35);
  }
  // lamps: a post and a glowing globe
  const lampPos = [];
  {
    const g = [], gl2 = [];
    for (const L of LAMPS) {
      g.push(new THREE.CylinderGeometry(0.06, 0.09, 3.3, 10).translate(L.x, 1.65, L.z));
      gl2.push(new THREE.SphereGeometry(0.24, 16, 10).translate(L.x, 3.5, L.z));
      lampPos.push([L.x, 3.5, L.z]);
    }
    add(mergeGeometries(g), metal);
    const globe = patch(new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.4 }), 'globe-v1', {
      emissive: 'totalEmissiveRadiance += vec3(1.0, 0.85, 0.62) * 3.0 * uLit * (1.0 - step(0.5, uSnow));', scale: 2.0,
    });
    add(mergeGeometries(gl2), globe);
  }
  return {
    frame(s, glows, lit) {
      if (lit > 0.02) for (const [x, y, z] of lampPos) glows.add(x, y, z, 1.6, 2.2 * lit, 1.7 * lit, 1.1 * lit);
    },
    lampPos,
  };
}
