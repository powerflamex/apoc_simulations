// The land and the harbor floor: one heightfield (landY in layout.js) built once on the CPU, fine near the seawall
// and coarse far out, with one shader: the promenade's paving, the Battery's lawns and paths, State Street, city
// ground; the islands' grass and shores; and the harbor floor, which shows as wet grey-brown mud, puddles and rocks
// as the sea runs out from over it (uLevel: where the water is now).
import * as THREE from 'three';
import { landY } from './layout.js';
import { WATER0 } from './timeline.js';

export const TU = { uLevel: { value: WATER0 }, uTime: { value: 0 } };

function axis(segs) {
  const out = [];
  for (const [a, b, st] of segs) for (let x = a; x < b; x += st) out.push(x);
  out.push(segs[segs.length - 1][1]);
  return out;
}

export function makeTerrain(scene) {
  const Z = axis([[-9000, -1600, 60], [-1600, -420, 10], [-420, -12, 3], [-12, 30, 1], [30, 300, 5], [300, 3000, 40]]);
  const X = axis([[-6000, -1500, 60], [-1500, -220, 12], [-220, 220, 4], [220, 1500, 12], [1500, 6000, 60]]);
  const pos = new Float32Array(Z.length * X.length * 3);
  let n = 0;
  for (const z of Z) for (const x of X) { pos[n++] = x; pos[n++] = landY(x, z); pos[n++] = z; }
  const idx = [];
  for (let j = 0; j < Z.length - 1; j++) for (let i = 0; i < X.length - 1; i++) {
    const a = j * X.length + i, b = a + 1, c = a + X.length, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vGP; uniform float uLevel; uniform float uTime;
      float th(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }
      float sm2(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vGP.xz;
        float y = vGP.y;
        float w = max(fwidth(p.x), fwidth(p.y)) + 0.01;
        float grain = tn(p * 2.3) * 0.5 + tn(p * 13.0) * 0.5;
        vec3 col;
        if (y < ${(WATER0 + 0.6).toFixed(2)}) {
          // the harbor floor: grey-brown silt, darker and glossy where it's still wet, puddles, a few rocks
          float wet = sm2(uLevel + 2.5, uLevel, y);
          col = mix(vec3(0.3, 0.27, 0.22), vec3(0.16, 0.15, 0.13), wet) * (0.75 + 0.45 * tn(p * 0.08)) * (0.85 + 0.25 * grain);
          float pud = sm2(0.62, 0.7, tn(p * 0.12 + 3.0)) * wet;
          col = mix(col, vec3(0.1, 0.14, 0.17), pud * 0.8);
          col = mix(col, vec3(0.18, 0.2, 0.12), sm2(0.0, -14.0, p.y) * (1.0 - sm2(-14.0, -40.0, p.y)) * 0.6);   // weed by the wall
        } else if (p.y > -1.0 && p.y < 12.0 && abs(p.x) < 700.0) {
          // the promenade: granite pavers
          vec2 t = fract(p / vec2(1.2, 0.6));
          col = vec3(0.55, 0.52, 0.48) * (0.85 + 0.2 * th(floor(p / vec2(1.2, 0.6)))) * (1.0 - 0.2 * max(1.0 - smoothstep(0.0, 0.04, t.x), 1.0 - smoothstep(0.0, 0.06, t.y)));
        } else if (p.y >= 12.0 && p.y < 240.0 && abs(p.x) < 700.0) {
          // the Battery: lawns crossed by paved paths
          col = mix(vec3(0.14, 0.24, 0.07), vec3(0.24, 0.33, 0.11), grain) * (0.85 + 0.3 * tn(p * 0.1));
          float path = max(1.0 - sm2(2.0, 2.0 + w * 2.0, abs(p.x - 0.0 + 8.0 * sin(p.y * 0.02))), 1.0 - sm2(2.0, 2.0 + w * 2.0, abs(p.y - 60.0 - 10.0 * sin(p.x * 0.015))));
          path = max(path, 1.0 - sm2(1.8, 1.8 + w * 2.0, abs(p.x * 0.6 + p.y - 140.0)));
          col = mix(col, vec3(0.5, 0.47, 0.42) * (0.9 + 0.15 * grain), path);
        } else if (p.y >= 240.0 && p.y < 272.0 && abs(p.x) < 700.0) {
          col = vec3(0.12, 0.12, 0.125) * (0.85 + 0.25 * grain);           // State Street
          col = mix(col, vec3(0.85, 0.66, 0.15), 1.0 - sm2(0.08, 0.08 + w, abs(p.y - 257.0)));
        } else if (y > ${(WATER0 + 0.6).toFixed(2)} && y < 0.9 && p.y < 0.0) {
          col = vec3(0.45, 0.42, 0.36) * (0.8 + 0.3 * grain);              // stony shores of the islands
        } else {
          // grass on the islands and in the parks across the water; city ground in the distance
          col = mix(vec3(0.16, 0.24, 0.09), vec3(0.32, 0.31, 0.24), tn(p * 0.01)) * (0.8 + 0.35 * grain);
        }
        diffuseColor.rgb = col;
      }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  // the seawall's face, and the railing along its top
  const parts = [];
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1400, 6, 1.2).translate(0, -3, -0.6), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95 }));
  wall.receiveShadow = true; scene.add(wall);
  const rail = new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 0.5, metalness: 0.5 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1400, 0.07, 0.07).translate(0, 1.08, 0.15), rail);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(1400, 0.035, 0.035).translate(0, 0.6, 0.15), rail);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(0, 0.55, 0.15), rail, 700);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 700; i++) posts.setMatrixAt(i, m.makeTranslation(-700 + i * 2, 0, 0));
  for (const o of [top, mid, posts]) { o.castShadow = true; o.frustumCulled = false; scene.add(o); }
  return { mesh, mat };
}
